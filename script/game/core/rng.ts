/**
 * 난수 — 원본 bex::RandModule [판독: docs/engine/01_core.md 난수 절, 재구현 tools/core_rand.py].
 * MT19937 엔진 두 개를 쓴다.
 * - async(비동기): Rand/RandMod… 기기마다 다를 수 있음
 * - sync(동기): SyncRand*… 장면 시작마다 SetSyncRandSeed 로 다시 시드
 * 시드 확장은 표준 init_genrand 이고, 출력은 표준 MT19937 과 같다(numpy 대조 5 시드 × 1,000 일치, 재구현 계산).
 *
 * 원본 시드: async 는 부팅 때 nn::os::GetSystemTick() 하위 32비트, sync 는 장면 시작 때 SetSyncRandSeed(async.Rand()).
 * 웹은 GameSetup.seed 로 async 를 시드하고, 장면 시작 자리에서 같은 식으로 sync 를 시드한다.
 */

const M32 = 0xffffffff;
const TWO_M32 = 2 ** -32;

export class MT19937 {
  private readonly mt = new Uint32Array(624);
  private i = 0;
  /** 출력 횟수(대조용) */
  calls = 0;

  constructor(seed: number) {
    this.seed(seed);
  }

  /** 원본 @0x710013aa70 — init_genrand, index = 0 */
  /** @orig main:710013aa70 ref */
  seed(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let k = 1; k < 624; k++) {
      const prev = mt[k - 1] ^ (mt[k - 1] >>> 30);
      mt[k] = (Math.imul(0x6c078965, prev) + k) >>> 0;
    }
    this.i = 0;
    this.calls = 0;
  }

  /** 원본 @0x710013aae0 — 한 칸씩 twist(libc++ 방식, 출력은 표준과 같다) */
  /** @orig main:710013aae0 ref */
  nextU32(): number {
    const mt = this.mt;
    const i = this.i;
    const j = (i + 1) % 624;
    const k = (i + 397) % 624;
    const y = (mt[i] & 0x80000000) | (mt[j] & 0x7ffffffe);
    const v = (mt[k] ^ (y >>> 1) ^ (mt[j] & 1 ? 0x9908b0df : 0)) >>> 0;
    mt[i] = v;
    this.i = j;
    let z = v ^ (v >>> 11);
    z ^= (z << 7) & 0x9d2c5680;
    z ^= (z << 15) & 0xefc60000;
    z ^= z >>> 18;
    this.calls++;
    return z >>> 0;
  }
}

/** (u · n) >> 32 를 정확히 */
const mulHi = (u: number, n: number): number => (n < 0x200000 ? Math.floor((u * n) / 4294967296) : Number((BigInt(u) * BigInt(n)) >> 32n));

export interface RandModule {
  /** [0, n) 정수 (비동기) — 원본 RandMod */
  randMod(n: number): number;
  /** u32 (비동기) — 원본 Rand */
  rand(): number;
  /** [0, 1] 실수 (동기) — 원본 SyncRandF. u ≥ 0xFFFFFF80 이면 1.0 이 된다 */
  syncRandF(): number;
  /** [0, n) 정수 (동기) — 원본 SyncRandMod */
  syncRandMod(n: number): number;
  /** 원본 SetSyncRandSeed */
  setSyncRandSeed(s: number): void;
  /** 지금까지 부른 횟수(대조용) */
  readonly calls: number;
}

export class BexRandModule implements RandModule {
  readonly async: MT19937;
  readonly sync: MT19937;

  constructor(asyncSeed: number, syncSeed = 0) {
    this.async = new MT19937(asyncSeed);
    this.sync = new MT19937(syncSeed);
  }

  get calls(): number {
    return this.async.calls + this.sync.calls;
  }

  rand(): number {
    return this.async.nextU32();
  }

  /** 원본 @0x710013ab90 → libc++ uniform_int_distribution(0, n−1): 비트 마스크 기각 표본. n < 2 → 0(소비 없음) */
  /** @orig main:710013ab90 ref */
  randMod(n: number): number {
    n >>>= 0;
    if (n < 2) return 0;
    const r = n;
    const bits = 32 - Math.clz32(r);
    const w = bits - 1 + ((r & (r - 1)) === 0 ? 0 : 1);
    const mask = w >= 32 ? M32 : (2 ** w - 1) >>> 0;
    for (;;) {
      const u = (this.async.nextU32() & mask) >>> 0;
      if (u < r) return u;
    }
  }

  /** 원본 @0x710013b17c — f32(u) · 2⁻³² */
  syncRandF(): number {
    return Math.fround(Math.fround(this.sync.nextU32()) * TWO_M32);
  }

  /** 원본 @0x710013afdc — n < 2 → 0(소비 없음), (u · n) >> 32 */
  syncRandMod(n: number): number {
    n >>>= 0;
    if (n < 2) return 0;
    return mulHi(this.sync.nextU32(), n);
  }

  setSyncRandSeed(s: number): void {
    this.sync.seed(s >>> 0);
  }
}
