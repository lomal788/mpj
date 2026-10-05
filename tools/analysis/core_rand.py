"""bex::RandModule 재구현 (main NSO 판독 기준).

근거 (모두 main @ 주소, 판독은 analysis/decomp/core_b1.c·core_b2.c·core_b3.c):
  - RandModule 생성 @0x7100189200: this+8 -> {async*, sync*} (각 0x9d8 B, 시드 = nn::os::GetSystemTick() 하위 32비트)
  - 엔진 생성 @0x710013a9d0(async, vtable 0x71019d3c00) / @0x710013aea0(sync, vtable 0x71019d3c50)
      +0x008 u32 mt[624], +0x9c8 u64 index(=0), +0x9d0 u32 seed  -> MT19937 init_genrand
  - SetSyncRandSeed @0x7100189438 -> @0x710013aa70 (sync 엔진만 다시 시드, index=0)
  - 생성은 libc++ mersenne_twister_engine 방식(한 번에 한 칸 twist). 출력은 표준 MT19937 과 같다.
  - 분포(가상 함수 +0x10..+0x38):
      async  Rand @0x710013aae0, RandMod @0x710013ab90(-> uniform_int @0x710013b400), RandRange @0x710013abd8,
             RandF @0x710013ac28, RandModF @0x710013acf0, RandRangeF @0x710013adc8
      sync   SyncRand @0x710013af2c, SyncRandMod @0x710013afdc, SyncRandRange @0x710013b0a4,
             SyncRandF @0x710013b17c, SyncRandModF @0x710013b23c, SyncRandRangeF @0x710013b310

사용:  .venv/Scripts/python tools/core_rand.py            -> 테스트 벡터 출력 + numpy 대조
       .venv/Scripts/python tools/core_rand.py --json F   -> 벡터를 JSON 으로 저장
"""
from __future__ import annotations

import json
import struct
import sys
from fractions import Fraction

M32 = 0xFFFFFFFF
TWO_M32 = Fraction(1, 1 << 32)


# ---------------------------------------------------------------- f32 도구
def f32(x: float) -> float:
    """double -> f32 (round-to-nearest-even). 입력이 double 로 정확하면 한 번만 반올림된다."""
    return struct.unpack('<f', struct.pack('<f', x))[0]


def f32_bits(x: float) -> int:
    return struct.unpack('<I', struct.pack('<f', x))[0]


def _f32_next(x: float, up: bool) -> float:
    b = f32_bits(x)
    if x == 0.0:
        return struct.unpack('<f', struct.pack('<I', 1 if up else 0x80000001))[0]
    if (x > 0) == up:
        b += 1
    else:
        b -= 1
    return struct.unpack('<f', struct.pack('<I', b))[0]


def f32_round_exact(q: Fraction) -> float:
    """유리수를 f32 로 한 번만 반올림(가까운 짝수). fmadd 의 단일 반올림을 재현할 때 쓴다."""
    c = f32(float(q))  # 후보(이중 반올림 가능) -> 이웃과 비교해 바로잡는다
    best = c
    for cand in (_f32_next(c, False), c, _f32_next(c, True)):
        d_best = abs(Fraction(best) - q)
        d_c = abs(Fraction(cand) - q)
        if d_c < d_best or (d_c == d_best and f32_bits(cand) % 2 == 0 and f32_bits(best) % 2 == 1):
            best = cand
    return best


def ucvtf(u: int) -> float:
    """AArch64 ucvtf s, w : u32 -> f32 (기본 FPCR, 가까운 짝수)."""
    return f32(float(u))


# ---------------------------------------------------------------- MT19937 (main @0x710013a9d0 / @0x710013aa70)
class MT19937:
    N, M = 624, 397

    def __init__(self, seed: int):
        self.seed(seed)

    def seed(self, s: int) -> None:
        s &= M32
        mt = [0] * self.N
        mt[0] = s
        for i in range(1, self.N):
            mt[i] = (0x6C078965 * (mt[i - 1] ^ (mt[i - 1] >> 30)) + i) & M32
        self.mt = mt
        self.i = 0  # +0x9c8
        self.seed_value = s  # +0x9d0
        self.calls = 0

    def next_u32(self) -> int:
        """libc++ 방식 한 칸 twist (@0x710013aae0 명령 그대로)."""
        mt, i = self.mt, self.i
        j = (i + 1) % self.N
        k = (i + self.M) % self.N
        y = (mt[i] & 0x80000000) | (mt[j] & 0x7FFFFFFE)
        v = mt[k] ^ (y >> 1) ^ (0x9908B0DF if (mt[j] & 1) else 0)
        mt[i] = v
        self.i = j
        z = v ^ (v >> 11)
        z ^= (z << 7) & 0x9D2C5680
        z ^= (z << 15) & 0xEFC60000
        z ^= z >> 18
        self.calls += 1
        return z & M32


# ---------------------------------------------------------------- 비동기(async) 분포
def _uniform_int(e: MT19937, a: int, b: int) -> int:
    """libc++ uniform_int_distribution<u32>(a,b) + __independent_bits_engine (@0x710013b400)."""
    if (b - a) & M32 == 0:
        return b
    r = (b - a + 1) & M32
    if r == 0:
        return e.next_u32()
    w = r.bit_length() - 1 + (0 if (r & (r - 1)) == 0 else 1)  # 31-clz(r) + (r 가 2 의 거듭제곱이 아니면 1)
    mask = M32 >> (32 - w) if w > 0 else 0
    while True:
        u = e.next_u32() & mask
        if u < r:
            return (a + u) & M32


class AsyncRand:
    """bex::RandModule::Rand* (비동기, 기기마다 다를 수 있음)."""

    def __init__(self, seed: int):
        self.e = MT19937(seed)

    def rand(self) -> int:  # +0x10
        return self.e.next_u32()

    def rand_mod(self, n: int) -> int:  # +0x18, n<2 -> 0 (소비 없음)
        n &= M32
        if n < 2:
            return 0
        return _uniform_int(self.e, 0, n - 1)

    def rand_range(self, a: int, b: int) -> int:  # +0x20, [min, max) , 폭<2 -> min (소비 없음)
        a &= M32
        b &= M32
        lo, hi = min(a, b), max(a, b)
        if hi - lo < 2:
            return lo
        return _uniform_int(self.e, lo, hi - 1)

    def rand_f(self) -> float:  # +0x28 : ucvtf(u) * 2^-32 + 0.0
        return f32(ucvtf(self.e.next_u32()) * 2.0 ** -32)

    def rand_mod_f(self, x: float) -> float:  # +0x30 : x<=0 -> 0 (소비 없음), fmadd(x, u*2^-32, 0)
        x = f32(x)
        if not (x > 0.0):
            return 0.0
        s1 = ucvtf(self.e.next_u32()) * 2.0 ** -32
        return f32_round_exact(Fraction(x) * Fraction(s1))

    def rand_range_f(self, a: float, b: float) -> float:  # +0x38 : fmadd(max-min, u*2^-32, min)
        a, b = f32(a), f32(b)
        mx = a if a > b else b
        mn = b if a > b else a
        d = f32(mx - mn)
        s5 = ucvtf(self.e.next_u32()) * 2.0 ** -32
        return f32_round_exact(Fraction(d) * Fraction(s5) + Fraction(mn))


class SyncRand:
    """bex::RandModule::SyncRand* (동기, 모든 기기가 같은 시드를 쓴다)."""

    def __init__(self, seed: int):
        self.e = MT19937(seed)

    def set_seed(self, s: int) -> None:  # SetSyncRandSeed
        self.e.seed(s)

    def rand(self) -> int:  # +0x10
        return self.e.next_u32()

    def rand_mod(self, n: int) -> int:  # +0x18 : n<2 -> 0 (소비 없음), (u*n)>>32
        n &= M32
        if n < 2:
            return 0
        return (self.e.next_u32() * n) >> 32

    def rand_range(self, a: int, b: int) -> int:  # +0x20 : [min, max), 폭<2 -> min (소비 없음)
        a &= M32
        b &= M32
        lo, hi = min(a, b), max(a, b)
        d = hi - lo
        if d < 2:
            return lo
        return (lo + ((self.e.next_u32() * d) >> 32)) & M32

    def rand_f(self) -> float:  # +0x28 : ucvtf(u) * 2^-32
        return f32(ucvtf(self.e.next_u32()) * 2.0 ** -32)

    def rand_mod_f(self, x: float) -> float:  # +0x30 : x<=0 -> 0 (소비 없음), f32(f32(u)*x) * 2^-32
        x = f32(x)
        if not (x > 0.0):
            return 0.0
        s0 = f32(ucvtf(self.e.next_u32()) * x)
        return f32(s0 * 2.0 ** -32)

    def rand_range_f(self, a: float, b: float) -> float:  # +0x38
        a, b = f32(a), f32(b)
        mn = b if a > b else a
        mx = a if a > b else b
        d = f32(mx - mn)
        s0 = f32(d * ucvtf(self.e.next_u32()))
        s3 = f32(s0 * 2.0 ** -32)
        return f32(mn + s3)


# ---------------------------------------------------------------- mg1801 소비 예 (mg1801 Obj::Entry @0x7100007bd0)
def mg1801_obj_entry_splash(sync: SyncRand, cuts: int) -> list[float]:
    """splashDelay 계산. (1) SyncRandF 를 cuts+1 번(값은 버려짐) (2) 0..cuts 순열을 뒤에서부터 섞기:
    k = cuts+1 .. 2 마다 r = SyncRandMod(k), swap(p[k-1], p[r])  [판독: mg1801 @0x71000081a8~0x71000081e4, w1=k]
    결과 splashDelay[i] = f32(f32(p[i] * 1.5) / 60)."""
    n = cuts + 1
    for _ in range(n):
        v = sync.rand_f()
        _ = f32(f32(v * 1.5) / 60.0)
    p = list(range(n))
    if n > 1:
        k = n
        while True:
            r = sync.rand_mod(k)
            p[k - 1], p[r] = p[r], p[k - 1]
            if not k > 2:
                break
            k -= 1
    return [f32(f32(float(x) * 1.5) / 60.0) for x in p]


def mg1801_cpu_miss_plan(rnd: AsyncRand, n: int) -> list[int]:
    """PlayerManImpl::SetupCpuMiss 의 한 플레이어분 섞기(@0x710000a324~0x710000a360, RandMod(k))."""
    p = list(range(n))
    if n > 1:
        k = n
        while True:
            r = rnd.rand_mod(k)
            p[k - 1], p[r] = p[r], p[k - 1]
            if not k > 2:
                break
            k -= 1
    return p


# ---------------------------------------------------------------- 벡터
SEEDS = [0, 1, 5489, 0x12345678, 0xFFFFFFFF]


def vectors() -> dict:
    out: dict = {'note': 'bex::RandModule 재구현 계산 (원본 실행 아님). f32 는 비트(hex)도 함께 적는다.', 'seeds': {}}
    for s in SEEDS:
        v: dict = {}
        e = MT19937(s)
        v['raw10'] = [e.next_u32() for _ in range(10)]
        sy = SyncRand(s)
        v['sync_randf5'] = [(x, f'{f32_bits(x):08x}') for x in (sy.rand_f() for _ in range(5))]
        sy = SyncRand(s)
        v['sync_randmod_7_x5'] = [sy.rand_mod(7) for _ in range(5)]
        sy = SyncRand(s)
        v['sync_randrange_10_20_x5'] = [sy.rand_range(10, 20) for _ in range(5)]
        sy = SyncRand(s)
        v['sync_randmodf_3_x3'] = [(x, f'{f32_bits(x):08x}') for x in (sy.rand_mod_f(3.0) for _ in range(3))]
        sy = SyncRand(s)
        v['sync_randrangef_m1_2_x3'] = [(x, f'{f32_bits(x):08x}') for x in (sy.rand_range_f(-1.0, 2.0) for _ in range(3))]
        a = AsyncRand(s)
        v['async_randmod_7_x5'] = [a.rand_mod(7) for _ in range(5)]
        v['async_randmod_7_calls'] = a.e.calls
        a = AsyncRand(s)
        v['async_randrange_10_20_x5'] = [a.rand_range(10, 20) for _ in range(5)]
        a = AsyncRand(s)
        v['async_randf5'] = [(x, f'{f32_bits(x):08x}') for x in (a.rand_f() for _ in range(5))]
        a = AsyncRand(s)
        v['async_randmodf_3_x3'] = [(x, f'{f32_bits(x):08x}') for x in (a.rand_mod_f(3.0) for _ in range(3))]
        a = AsyncRand(s)
        v['async_randrangef_m1_2_x3'] = [(x, f'{f32_bits(x):08x}') for x in (a.rand_range_f(-1.0, 2.0) for _ in range(3))]
        sy = SyncRand(s)
        v['mg1801_entry_carrot_cuts4'] = [(x, f'{f32_bits(x):08x}') for x in mg1801_obj_entry_splash(sy, 4)]
        v['mg1801_entry_carrot_calls'] = sy.e.calls
        a = AsyncRand(s)
        v['mg1801_cpu_plan_n26'] = mg1801_cpu_miss_plan(a, 26)
        out['seeds'][f'0x{s:08x}'] = v
    # 경계: ucvtf 가 1.0 이 되는 값
    out['edge'] = {
        'ucvtf(0xFFFFFF7F)*2^-32': f'{f32_bits(f32(ucvtf(0xFFFFFF7F) * 2.0 ** -32)):08x}',
        'ucvtf(0xFFFFFF80)*2^-32': f'{f32_bits(f32(ucvtf(0xFFFFFF80) * 2.0 ** -32)):08x}',
    }
    return out


def check_numpy() -> str:
    try:
        import numpy as np
    except ImportError:
        return 'numpy 없음 — 대조 생략'
    lines = []
    for s in SEEDS:
        bg = np.random.MT19937()
        bg._legacy_seeding(s)  # init_genrand(s)
        ref = [int(x) & M32 for x in bg.random_raw(1000)]
        e = MT19937(s)
        mine = [e.next_u32() for _ in range(1000)]
        lines.append(f'seed 0x{s:08x}: 1000개 {"일치" if ref == mine else "불일치"}')
    return '\n'.join(lines)


if __name__ == '__main__':
    vec = vectors()
    if len(sys.argv) >= 3 and sys.argv[1] == '--json':
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            json.dump(vec, f, ensure_ascii=False, indent=1)
        print('saved', sys.argv[2])
    else:
        print(json.dumps(vec, ensure_ascii=False, indent=1))
    print(check_numpy())
    e = MT19937(5489)
    first = e.next_u32()
    print('MT19937(5489) 첫 출력', first, '(표준 3499211612 과', '일치)' if first == 3499211612 else '불일치)')
