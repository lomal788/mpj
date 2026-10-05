"""mgA 재구현 계산 — mg0118(미니미니 트라이애슬론)·mg0906(로젤리나의 스노보드 레이스).

판독한 식(web/docs/minigame/mg0118.md, mg0906.md)을 그대로 옮겨 돌린다. 원본 실행 대조가 아니다.
  - dt = f32(1/60) 고정(원본 오프라인은 실측 프레임 시간, 최대 0.05 s — 01_core.md 4.4).
  - 위치 갱신은 원본처럼 fmadd(속도, dt, x) 단일 반올림, 속도 감쇠는 프레임당 곱(f32).
  - 물리(점프 궤적·허들 충돌·코스 레이캐스트)는 돌리지 않는다. 가정은 각 함수 머리에 적는다.

사용: .venv/Scripts/python tools/mgA_calc.py  -> analysis/mgA_calc.json + 요약 출력
"""
from __future__ import annotations

import json
import math
import sys
from fractions import Fraction

sys.path.insert(0, __file__.replace("\\", "/").rsplit("/", 1)[0])
from core_rand import SyncRand, f32, f32_round_exact  # noqa: E402

DT = f32(1.0 / 60.0)


def fmadd(a: float, b: float, c: float) -> float:
    return f32_round_exact(Fraction(a) * Fraction(b) + Fraction(c))


class Timer:
    """mg0118::Timer @0x710002346c.. (Start/Update/IsEnd/IsActive/Reset/GetProgressRate)."""

    def __init__(self):
        self.active = False
        self.t = 0.0
        self.d = 0.0

    def start(self, d):
        self.t, self.d, self.active = 0.0, f32(d), True

    def reset(self):
        self.active, self.t, self.d = False, 0.0, 0.0

    def update(self, dt=DT):
        if self.active:
            n = f32(self.t + dt)
            self.t = n if n <= self.d else self.d
            if self.d <= self.t:
                self.active = False

    def is_end(self):
        return 0.0 < self.d and self.d <= self.t and 0.0 < self.t

    def progress(self):
        return f32(self.t / self.d)


# ------------------------------------------------------------------ mg0118 상수 (analysis/mgA_mg0118_params.json)
P = {k: f32(v) for k, v in dict(
    SwimIncreasingSpeed=1.6, SwimSpeedDecreaseRate=0.92, SwimMaxSpeed=4.0, SwimIntervalSec=0.05,
    SwimFreelyInterval=0.12, SwimToTricycleSec=0.48, SwimToCycleAnimBeforeFrame=10.0,
    TricycleMaxSpeed=2.0, TricycleMaxMinusSpeed=-0.0, TricycleIncreasingSpeed=0.17,
    TricycleDecreasingSpeed=-0.3, TricycleSpeedDecreaseRate=0.972, TricycleToHurdleSec=0.45,
    TricycleFreelyInterval=0.13, HurdleSpeed=6.0, HurdleJumpIntervalSec=0.75, HurdleDamageSec=1.0,
    HurdleSpeedOnDamage=1.5, HurdleMoveSecOnDamage=0.6, FirstHurdlePosX=8.0, LastHurdlePosX=32.0).items()}
CPU_SWIM = [(0.24, 0.23), (0.22, 0.2), (0.12, 0.11), (0.09, 0.08)]   # Ea No Ha Ma (Min, Max) — Min>Max 그대로
CPU_TRI = [(0.14, 0.13), (0.11, 0.1), (0.07, 0.06), (0.053, 0.048)]
CPU_HURDLE_RATE = [0.3, 0.5, 0.9, 0.95]
# 코스 뼈 (mg0118_cha_pos00.fmdb, 레인 공통 x) — a 수영 시작, b 수영 끝, c 세발 시작, d 세발 끝, e 허들 시작, f 골
X = dict(a=-43.0, b=-27.88, c=-23.4, d=-11.3, e=-8.35, f=30.0)


def mg0118_hurdles():
    """MapManager::ReorderHurdles @0x7100008110: x = bone_e.x + (First + (Last-First)*0.25*i), i=0..4."""
    s9 = f32(f32(P["LastHurdlePosX"] - P["FirstHurdlePosX"]) * 0.25)
    return [f32(X["e"] + fmadd(s9, f32(float(i)), P["FirstHurdlePosX"])) for i in range(5)]


def decide_jump_x(rng: SyncRand, level: int, hx: float):
    """ComputerAi::DecideNextJumpPosX @0x710000521c (디스어셈블 확인)."""
    r0 = rng.rand_f()
    if r0 < f32(CPU_HURDLE_RATE[level]):
        L = f32(float(level))
        r1 = rng.rand_f()
        a = fmadd(f32(L * f32(-0.15)), r1, f32(1.8))
        r2 = rng.rand_f()
        b = fmadd(f32(L * f32(0.15)), r2, f32(0.9))
        r3 = rng.rand_f()
        return True, f32(hx - fmadd(f32(a - b), r3, b))
    r1 = rng.rand_f()
    r2 = rng.rand_f()
    if r1 < 0.5:
        return False, fmadd(r2, f32(-0.3), f32(hx + f32(-2.1)))
    return False, fmadd(r2, f32(0.3), f32(hx + f32(-0.65)))


def mg0118_cpu_race(level: int, seed: int):
    """CPU 한 명 완주 시뮬레이션.
    가정: (1) dt 고정 f32(1/60) (2) CPU 점프 '성공' 판정이면 허들에 안 걸리고, '실패'면 그 허들에 1회 맞는다
    (실제 충돌은 actor 물리·점프 궤적이 정한다 — 미확정) (3) 점프 착지는 다음 허들 전에 끝난다
    (4) 수영 출발 x = 뼈 a, 상태 전이 프레임은 판독 순서대로."""
    rng = SyncRand(seed)
    x = X["a"]
    frame = 0
    log = {}
    # 수영 (state 2)
    speed = 0.0
    t_int = Timer(); t_free = Timer(); cpu = Timer()
    while True:
        frame += 1
        t_free.update(); t_int.update()
        if x >= X["b"]:
            break
        if not cpu.active and not cpu.is_end():
            cpu.start(rng.rand_range_f(*CPU_SWIM[level]))
        cpu.update()
        if cpu.is_end():
            speed = min(f32(speed + P["SwimIncreasingSpeed"]), P["SwimMaxSpeed"])
            t_int.start(P["SwimIntervalSec"]); t_free.reset(); t_free.start(P["SwimFreelyInterval"])
            cpu.reset(); cpu.start(rng.rand_range_f(*CPU_SWIM[level]))
        x = fmadd(speed, DT, x)
        speed = f32(P["SwimSpeedDecreaseRate"] * speed)
    log["swim_end_frame"] = frame
    # 수영→세발 (state 3): SwimToTricycleSec 보간
    x0 = x
    tr = Timer(); tr.start(P["SwimToTricycleSec"])
    while True:
        frame += 1
        tr.update()
        x = fmadd(tr.progress(), f32(X["c"] - x0), x0)
        if tr.is_end():
            break
    log["pedal_start_frame"] = frame
    # 세발 (state 4)
    speed = 0.0
    cpu = Timer(); t_free = Timer()
    while True:
        frame += 1
        t_free.update()
        if x >= X["d"]:
            break
        if not cpu.active and not cpu.is_end():
            cpu.start(rng.rand_range_f(*CPU_TRI[level]))
        cpu.update()
        if cpu.is_end():
            s = f32(speed + P["TricycleIncreasingSpeed"])
            s = P["TricycleMaxSpeed"] if s >= P["TricycleMaxSpeed"] else s
            speed = P["TricycleMaxMinusSpeed"] if s <= P["TricycleMaxMinusSpeed"] else s
            t_free.reset(); t_free.start(P["TricycleFreelyInterval"])
            cpu.reset(); cpu.start(rng.rand_range_f(*CPU_TRI[level]))
        nx = fmadd(speed, DT, x)
        x = nx if not (nx < X["c"]) else X["c"]
        speed = f32(P["TricycleSpeedDecreaseRate"] * speed)
    log["pedal_end_frame"] = frame
    # 세발→허들 (state 5)
    x0 = x
    tr = Timer(); tr.start(P["TricycleToHurdleSec"])
    while True:
        frame += 1
        tr.update()
        x = fmadd(tr.progress(), f32(X["e"] - x0), x0)
        if tr.is_end():
            break
    log["hurdle_start_frame"] = frame
    # 허들 (state 6)
    hurdles = mg0118_hurdles()
    ai_state, jump_x, hx_cur, ok = 0, 0.0, 0.0, True
    dmg = Timer(); jump_iv = Timer()
    hits, jumps = 0, []
    pending_hit = None
    while True:
        frame += 1
        dmg.update(); jump_iv.update()
        if X["f"] <= x:
            break
        if dmg.active:
            if dmg.t < P["HurdleMoveSecOnDamage"]:
                x = fmadd(P["HurdleSpeedOnDamage"], DT, x)
            continue
        # ComputerAi::OnHurdling
        if ai_state == 0:
            for hx in hurdles:
                d = f32(hx - x)
                if 0.0 < d < 3.0:
                    ok, jump_x = decide_jump_x(rng, level, hx)
                    hx_cur = hx
                    ai_state = 1
                    break
        elif ai_state == 1:
            if jump_x < x:
                jumps.append(dict(hurdle=hx_cur, jump_x=jump_x, success=ok, frame=frame))
                jump_iv.start(P["HurdleJumpIntervalSec"])
                ai_state = 2
                if not ok:
                    pending_hit = hx_cur
        elif ai_state == 2:
            if hx_cur < x:
                ai_state = 0
        x = fmadd(P["HurdleSpeed"], DT, x)
        if pending_hit is not None and x >= pending_hit:  # 가정: 실패 점프는 허들 x 에서 1회 충돌
            hits += 1
            dmg.start(P["HurdleDamageSec"])
            if ai_state == 1:
                ai_state = 2
            pending_hit = None
    log["goal_frame"] = frame
    log["hits"] = hits
    log["jumps"] = jumps
    return log


# ------------------------------------------------------------------ mg0118 입력 검출기
def pedal_detector_events(omega_seq):
    """SixAxisPedalDetector::CheckRoll/CheckLog @0x7100022c90/@0x7100022fc0.
    omega_seq: [(wx,wy,wz,ww)] 프레임별 각속도(회전/초). 반환 [(frame, 'fwd'|'back'|'stop')]."""
    filt = [0.0, 0.0, 0.0, 0.0]
    last_dir = 2
    log = []  # 최근 4개, log[0] = 가장 최근
    out = []
    sens = f32(0.125)
    for fr, w in enumerate(omega_seq):
        filt = [f32(filt[i] + f32(f32(w[i] - filt[i]) * sens)) for i in range(4)]
        mag = math.sqrt(sum(v * v for v in filt))
        if mag <= f32(0.1):
            out.append((fr, "stop"))
            continue
        ang = f32(f32(math.atan2(w[1], w[2])) * f32(57.29578))
        if -45.0 <= ang < 45.0:
            d = 2
        elif 45.0 <= ang < 135.0:
            d = 3
        elif -135.0 <= ang < -45.0:
            d = 1
        else:
            d = 0
        if d == last_dir:
            continue
        log.insert(0, d)
        del log[4:]
        last_dir = d
        if len(log) == 4:
            if log == [d, (d - 1) % 4, (d - 2) % 4, (d - 3) % 4]:
                out.append((fr, "fwd"))
            elif log == [d, (d + 1) % 4, (d + 2) % 4, (d + 3) % 4]:
                out.append((fr, "back"))
    return out


def wave_detector(values, threshold):
    """actor::SixAxisSensorWaveDetector (main FUN_7100040cc0) 의 상태기계, 값 이미터(test=threshold).
    values: 프레임별 축 성분(이미 축 마스크 적용한 1성분). 반환: 이벤트 프레임 목록."""
    state, peak, ev = 0, 0.0, []
    for fr, v in enumerate(values):
        mag = abs(v)
        thr = threshold if threshold >= 0 else 0.1
        if state == 2:
            if mag < thr:
                state = 0
            elif v * peak < 0:  # 방향 반전 → 파형 종료 후 같은 샘플에서 새 파형
                state = 0
            else:
                if abs(peak) < mag:
                    peak = v
                continue
        if state == 0 and thr <= mag:
            state, peak = 2, v
            if threshold <= mag:  # 값 이미터: 시작 샘플 값 ≥ test 이면 즉시 1회
                ev.append(fr)
    return ev


def rank_after_goals(goal_frames):
    """PlayerManager::OnGameMainProc @0x710001dc1c 의 순위 부여. goal_frames: 플레이어별 골 프레임(None=미골)."""
    rank = [-1] * 4
    nxt = 0
    last = max(f for f in goal_frames if f is not None) if any(f is not None for f in goal_frames) else 0
    for fr in range(0, last + 1):
        cnt = 0
        for p in range(4):
            if goal_frames[p] is not None and goal_frames[p] <= fr and rank[p] == -1:
                rank[p] = nxt
                cnt += 1
        if cnt:
            nxt = min(nxt + cnt, 3)
        if nxt == 3:
            for p in range(4):
                if rank[p] == -1:
                    rank[p] = 3
    return rank


# ------------------------------------------------------------------ mg0906
def mg0906_input_x(roll_deg):
    """InputDetectorJoyCon::UpdateInput @0x71000293bc: y = (q̄·X·q).y, x = (y < -0.5) ? 1 : -2*min(y,0.5).
    여기서는 Joy-Con X축을 수평에서 roll 만큼 기울였을 때 y = sin(roll) 로 둔다(자세 규약은 추정)."""
    y = f32(math.sin(math.radians(roll_deg)))
    return 1.0 if y < -0.5 else f32(-2.0 * min(y, 0.5))


def mg0906_straight_run(snow_end=2410.21, goal=5310.17):
    """PlayerSpeed::UpdateMoveSpeed @0x710002eb00 를 입력 0·직선·충돌 없음으로 돌린 거리 진행.
    가정: 거리 진행 = 속도·dt(실제는 3D 이동 후 코스 재투영), 가속 존·아이템·점프 없음, 시작 거리 init_distance=10."""
    KMH = f32(0.2777778)
    def course(d):
        return "snow" if snow_end >= d else "space"
    C = dict(snow=dict(max=120.0, min=70.0, apm=30.0, ap=0.1, acc=20.0),
             space=dict(max=150.0, min=100.0, apm=20.0, ap=0.1, acc=40.0))
    d = 10.0
    c = C[course(d)]
    speed = f32(f32(c["max"]) * KMH)  # SetupGame: speed = GetMaxMoveSpeed(0)
    accel_per = 0.0
    frame = 0
    marks = {}
    while d < goal and frame < 60 * 600:
        frame += 1
        c = C[course(d)]
        acc = f32(f32(f32(c["acc"]) * KMH) * DT)
        ap = f32(accel_per + f32(DT * f32(c["ap"])))
        accel_per = 0.0 if not (0.0 <= ap) else (ap if ap <= c["apm"] else f32(c["apm"]))
        mx = f32(f32(c["max"]) * KMH)
        mn = f32(f32(c["min"]) * KMH)
        v = f32(speed + f32(f32(f32(accel_per / 100.0) + 1.0) * acc))
        t = v if v <= mx else mx
        speed = t if mn <= v else mn
        d = f32(d + f32(speed * DT))
        if "snow_end" not in marks and d > snow_end:
            marks["snow_end"] = frame
    marks["goal"] = frame
    return marks


def main():
    out = {"dt": DT}
    out["mg0118_hurdle_x"] = mg0118_hurdles()
    races = {}
    for lv, name in enumerate(["easy", "normal", "hard", "master"]):
        rs = [mg0118_cpu_race(lv, s) for s in range(1, 21)]
        g = [r["goal_frame"] for r in rs]
        races[name] = dict(goal_frames=g, goal_sec_min=min(g) * DT, goal_sec_max=max(g) * DT,
                           goal_sec_mean=sum(g) / len(g) * DT,
                           swim_end_sec=[r["swim_end_frame"] * DT for r in rs[:3]],
                           pedal_end_sec=[r["pedal_end_frame"] * DT for r in rs[:3]],
                           hits=[r["hits"] for r in rs], sample=rs[0])
    out["mg0118_cpu"] = races
    # 페달 검출: 한 바퀴 1초, 반지름 2 회전/초 의 각속도 원 회전 (wy, wz) = 2(sin, cos)
    seq = [(0.0, 2 * math.sin(2 * math.pi * f / 60), 2 * math.cos(2 * math.pi * f / 60), 0.0) for f in range(180)]
    out["mg0118_pedal_fwd"] = pedal_detector_events(seq)
    seq_r = [(0.0, -w[1], w[2], 0.0) for w in seq]
    out["mg0118_pedal_rev"] = pedal_detector_events(seq_r)
    out["mg0118_pedal_still"] = pedal_detector_events([(0, 0, 0, 0)] * 30)[:3]
    # 수영 파형: wy = 2 sin(2π·1.5 t) (1.5 Hz 왕복)
    wv = [2 * math.sin(2 * math.pi * 1.5 * f / 60) for f in range(120)]
    out["mg0118_swim_wave_events"] = wave_detector(wv, 1.0)
    out["mg0118_rank_ties"] = {
        "1명씩": rank_after_goals([100, 120, 140, None]),
        "동시 2명": rank_after_goals([100, 100, 140, None]),
        "동시 3명": rank_after_goals([100, 100, 100, None]),
        "1등 뒤 동시 2명": rank_after_goals([90, 100, 100, None]),
    }
    out["mg0906_input_x"] = {str(r): mg0906_input_x(r) for r in (-45, -30, -20, -10, 0, 10, 20, 30, 45)}
    out["mg0906_straight_run"] = mg0906_straight_run()
    json.dump(out, open("analysis/mgA_calc.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("hurdle x:", out["mg0118_hurdle_x"])
    for k, v in races.items():
        print(f"mg0118 CPU {k:6}: goal {v['goal_sec_min']:.3f}~{v['goal_sec_max']:.3f}s mean {v['goal_sec_mean']:.3f}s "
              f"swim_end {[round(t, 3) for t in v['swim_end_sec']]} pedal_end {[round(t, 3) for t in v['pedal_end_sec']]} hits {v['hits']}")
    print("pedal fwd:", out["mg0118_pedal_fwd"][:12], "count", len(out["mg0118_pedal_fwd"]))
    print("pedal rev:", out["mg0118_pedal_rev"][:12], "count", len(out["mg0118_pedal_rev"]))
    print("pedal still:", out["mg0118_pedal_still"])
    print("swim wave events:", out["mg0118_swim_wave_events"])
    print("rank ties:", out["mg0118_rank_ties"])
    print("mg0906 input:", out["mg0906_input_x"])
    m = out["mg0906_straight_run"]
    print("mg0906 straight:", {k: (v, round(v * DT, 3)) for k, v in m.items()})


if __name__ == "__main__":
    main()
