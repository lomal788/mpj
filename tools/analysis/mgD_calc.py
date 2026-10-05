"""mgD 재구현 계산: mg1002(아이템 구슬 굴리기)·mg0119(기울이기 골프) 공용 식.

판독한 식을 f32 로 옮겨 정상·경계·반대 조건을 돌린다. 원본 실행 대조가 아니다.
출력: analysis/mgD_calc.json

구성
 1. tilt_from_posture   SixAxisSensorInput::GetQuaternion (mg1002 @0x710000a680 = mg0119 @0x710000b760, 정규화 diff 0)
 2. gravity_dir         MapCollision::SetGravityDirection (mg1002 @0x71000126f0)
 3. auto_tilt_step      오프닝 자동 기울기 람다 (mg1002 @0x710000d9d4, mg0119 @0x71000175c8)
 4. ai_quat             mg0119 ComAi::GetQuaternion @0x7100004038 (PID 출력 → 기울기)
 5. rolling model       PhysX 대신 쓸 '미끄럼 없는 구 + 각감쇠' 근사 모델의 해석해·적분 비교
 6. mg0119 득점·경계·컵인 판정
"""
import json
import math
from pathlib import Path

import numpy as np

F = np.float32
D2R = F(0.017453292)


def f(x):
    return float(np.float32(x))


# ---------- 쿼터니언 (x, y, z, w), Hamilton 곱 a*b ----------
def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (F(aw * bx + ax * bw + ay * bz - az * by),
            F(aw * by + ay * bw + az * bx - ax * bz),
            F(aw * bz + az * bw + ax * by - ay * bx),
            F(aw * bw - ax * bx - ay * by - az * bz))


def qaxis(axis, ang):
    s, c = F(math.sin(ang * 0.5)), F(math.cos(ang * 0.5))
    n = math.sqrt(sum(v * v for v in axis)) or 1.0
    return (F(axis[0] / n * s), F(axis[1] / n * s), F(axis[2] / n * s), c)


def qconj_inv(q):
    n2 = F(sum(F(v) * F(v) for v in q))
    r = F(1.0) / n2 if n2 != 0 else F(1.0)
    return (F(-q[0] * r), F(-q[1] * r), F(-q[2] * r), F(q[3] * r))


def qrot(q, v):
    p = qmul(qmul(q, (v[0], v[1], v[2], F(0))), qconj_inv(q))
    return p[:3]


def slerp(a, b, t):
    """nn::util 식 그대로: dot<0 이면 b 쪽 부호를 뒤집고, 거의 같으면 선형 (1-t, t)."""
    d = F(sum(F(x) * F(y) for x, y in zip(a, b)))
    sign = F(-1.0) if d < 0 else F(1.0)
    ad = abs(d)
    if ad <= 1.0 - 1e-6:   # FloatQuaternionEpsilon 값은 미확인(1e-6 가정)
        th = F(math.acos(min(1.0, float(ad))))
        s = F(math.sin(th))
        w0, w1 = F(math.sin((1 - t) * th) / s), F(sign * math.sin(t * th) / s)
    else:
        w0, w1 = F(1 - t), F(sign * t)
    return tuple(F(x * w0 + y * w1) for x, y in zip(a, b))


# ---------- 1. Joy-Con 자세 → 맵 기울기 ----------
QA = qaxis((1, 0, 0), -math.pi / 2)   # -90° about X  (디컴파일: sin/cos(-π/4))
QB = qaxis((1, 0, 0), math.pi / 2)    # +90° about X


def tilt_from_posture(posture, calib, max_deg=17.0, rate=0.5):
    q1 = qmul(calib, posture)                 # calib * posture
    q2 = qmul(qmul(QA, q1), QB)               # QA * q1 * QB
    X, Y, Z, W = q2
    s2 = F(2 * (Z * W + Y * X))
    n = F(W * W + Z * Z + X * X + Y * Y)
    if s2 - n >= -1.1920929e-07:
        A, B = F(0.0), F(math.pi * 0.5)
    elif s2 + n <= 1.1920929e-07:
        A, B = F(0.0), F(-math.pi * 0.5)
    else:
        A = F(math.atan2(F(-2 * Z * Y + 2 * W * X), F(W * W + Y * Y - X * X - Z * Z)))
        B = F(math.asin(max(-1.0, min(1.0, float(s2 / n)))))
    hi = F(max_deg) * D2R
    A = min(max(F(A * F(rate)), -hi), hi)
    B = min(max(F(B * F(rate)), -hi), hi)
    sA, cA = F(math.sin(A * 0.5)), F(math.cos(A * 0.5))
    sB, cB = F(math.sin(B * 0.5)), F(math.cos(B * 0.5))
    q = (F(cB * sA), F(-sA * sB), F(sB * cA), F(cB * cA))   # = qx(A) * qz(B)
    return q, f(A), f(B)


def calibrate(posture):
    return qconj_inv(posture)


# ---------- 2. 중력 방향(맵 로컬) ----------
def gravity_dir(q):
    g = qrot(qconj_inv(q), (F(0), F(-1), F(0)))
    n = F(math.sqrt(sum(v * v for v in g)))
    return tuple(f(v / n) for v in g)


# ---------- 3. 오프닝 자동 기울기 한 프레임 ----------
def auto_tilt_step(q_cur, ball, target, max_deg=17.0):
    d = (target[0] - ball[0], target[1] - ball[1], target[2] - ball[2])
    cross = (d[2], 0.0, -d[0])                 # UnitY × d
    L = math.sqrt(cross[0] ** 2 + cross[2] ** 2)
    q_tilt = qaxis(cross, math.radians(max_deg)) if L > 0 else (F(0), F(0), F(0), F(1))
    t = min(L, 1.25) / 1.25
    q_tgt = slerp((F(0), F(0), F(0), F(1)), q_tilt, t)
    return slerp(q_cur, q_tgt, 0.05), d[0] ** 2 + d[2] ** 2 >= 0.01


# ---------- 4. mg0119 AI PID → 기울기 ----------
def ai_quat(e, ei, ed, pid, max_deg=17.0):
    P, I, Dd = pid
    vz = I * ei[2] + P * e[2] + Dd * ed[2]
    vx = I * ei[0] + P * e[0] + Dd * ed[0]
    hi = math.radians(max_deg)
    A = min(max(vz, -hi), hi)
    B = -min(max(vx, -hi), hi)
    sA, cA = math.sin(A / 2), math.cos(A / 2)
    sB, cB = math.sin(B / 2), math.cos(B / 2)
    return (cB * sA, -sA * sB, sB * cA, cB * cA), A, B


# ---------- 5. 굴림 근사 모델 ----------
def terminal_speed(g_eff, slope_rad, ang_damp):
    """미끄럼 없는 속이 찬 구(I=0.4mr²), PhysX 각감쇠를 연속 감쇠 ω'=-cω 로 근사.
    dv/dt = (5/7) g sinθ - (2/7) c v  →  v_term = g sinθ / (0.4 c),  τ = 7/(2c)"""
    return g_eff * math.sin(slope_rad) / (0.4 * ang_damp), 7.0 / (2.0 * ang_damp)


def simulate_roll(g_eff, slope_rad, ang_damp, dt=1 / 60, t_end=3.0, r=0.18):
    """한 축 시뮬레이션: PhysX 4.1 순서 근사(힘 적분 v+=F/m·dt → 각감쇠 ω*=max(0,1-c·dt)
    (DyBodyCoreIntegrator.h bodyCoreComputeUnconstrainedVelocity) → 구름 구속 충격량으로 v=ωr 맞춤).
    마찰 한계(μ=평균(1.0,0.5)=0.75)는 별도 검사(slip_check)."""
    m, I = 1.0, 0.4 * r * r
    v = w = 0.0
    out = []
    t = 0.0
    a_force = g_eff * math.sin(slope_rad)
    while t < t_end - 1e-9:
        v += a_force * dt                     # 중심에 걸린 힘(ApplyForce) → 선속도만
        w *= max(0.0, 1.0 - ang_damp * dt)   # 각감쇠(PhysX 명시형)
        # 구름 구속 충격량 P: v' = v - P/m, w' = w + P r / I, v' = w' r
        P = (v - w * r) / (1.0 / m + r * r / I)
        v -= P / m
        w += P * r / I
        t += dt
        out.append((round(t, 4), v))
    return out


def main():
    res = {}

    # 1. 기울기 변환 표본
    ident = (F(0), F(0), F(0), F(1))
    cal = calibrate(ident)
    cases = {}
    for name, axis, deg in [("identity", (1, 0, 0), 0), ("X+20", (1, 0, 0), 20), ("X-20", (1, 0, 0), -20),
                            ("X+40(clamp)", (1, 0, 0), 40), ("Y+20", (0, 1, 0), 20), ("Y-40(clamp)", (0, 1, 0), -40),
                            ("Z+30", (0, 0, 1), 30), ("X+20,Y+20", None, None)]:
        if axis is None:
            p = qmul(qaxis((1, 0, 0), math.radians(20)), qaxis((0, 1, 0), math.radians(20)))
        else:
            p = qaxis(axis, math.radians(deg))
        q, A, B = tilt_from_posture(p, cal)
        cases[name] = {"posture": [f(v) for v in p], "mapQuat": [f(v) for v in q],
                       "A_aboutX_deg": round(math.degrees(A), 4), "B_aboutZ_deg": round(math.degrees(B), 4),
                       "gravityLocal": gravity_dir(q)}
    # 보정: 시작 자세가 기울어져 있어도 보정 뒤 같은 상대 회전이면 같은 결과
    p0 = qaxis((0.3, 0.5, 0.8), 0.7)
    rel = qaxis((1, 0, 0), math.radians(20))
    q_cal, A2, B2 = tilt_from_posture(qmul(p0, rel), calibrate(p0))
    cases["calibrated_start(p0*X+20)"] = {"A_aboutX_deg": round(math.degrees(A2), 4), "B_aboutZ_deg": round(math.degrees(B2), 4)}
    res["tilt_from_posture"] = cases

    # 2. 중력: 최대 기울기에서 경사 가속도
    gs = 9.8 * 3.0
    res["gravity"] = {"g_eff(9.8*GravityScale3)": gs,
                      "slope_accel_at_17deg_free": gs * math.sin(math.radians(17)),
                      "rolling_accel_at_17deg(5/7)": gs * math.sin(math.radians(17)) * 5 / 7}

    # 3. 오프닝 자동 기울기: mg1002 start00 → start01
    start00 = (1.6797, -0.17 + 0.18, 0.277)
    start01 = (1.6797, -0.2066 + 0.18, 1.6978)
    q = ident
    frames = []
    for i in range(10):
        q, cont = auto_tilt_step(q, start00, start01)
        frames.append({"frame": i, "q": [f(v) for v in q], "continue": bool(cont),
                       "tilt_deg": round(math.degrees(2 * math.acos(min(1.0, abs(float(q[3]))))), 4)})
    res["mg1002_opening_auto_tilt_first10(ball fixed)"] = frames
    # 정상 상태 기울기(공을 고정했을 때): 0.05 지수 수렴, 목표 = 17° × min(d,1.25)/1.25
    res["mg1002_opening_target_tilt_deg"] = 17.0 * min(1.4208, 1.25) / 1.25

    # 4. AI PID 출력 예 (level 0..3, 오차 1 m 앞쪽 +z)
    lv = {"Easy": (0.5, 0.05, 0.05), "Normal": (0.5, 0.025, 0.05), "Hard": (0.5, 0.01, 0.05), "Master": (0.5, 0.005, 0.05)}
    res["mg0119_ai_quat_e=(0,0,1)"] = {k: {"A_deg": round(math.degrees(ai_quat((0, 0, 1), (0, 0, 0), (0, 0, 0), v)[1]), 4)} for k, v in lv.items()}
    res["mg0119_ai_quat_e=(0.3,0,0)"] = {k: {"B_deg": round(math.degrees(ai_quat((0.3, 0, 0), (0, 0, 0), (0, 0, 0), v)[2]), 4)} for k, v in lv.items()}

    # 5. 굴림 근사: 종단 속도·시간 상수
    roll = {}
    for game, r, damps in [("mg1002", 0.18, {"contact(StageDamping)": 10.0, "noContact": 0.05}),
                           ("mg0119", 0.12, {"fairway": 10.0, "green": 10.0, "bunker": 50.0, "air/tree/col": 0.05})]:
        for k, c in damps.items():
            vt, tau = terminal_speed(gs, math.radians(17), c)
            sim = simulate_roll(gs, math.radians(17), c, r=r)
            roll[f"{game}:{k}"] = {"angDamp": c, "v_term_analytic": round(vt, 4), "tau_s": round(tau, 4),
                                   "sim_v_at_0.5s": round(sim[29][1], 4), "sim_v_at_1s": round(sim[59][1], 4),
                                   "sim_v_at_3s": round(sim[-1][1], 4)}
    res["rolling_model_17deg"] = roll
    # 미끄럼 검사: 구름 유지에 필요한 마찰력 ≤ μN 인가 (종단 상태 F = m g sinθ, 가속 초기 F = (2/7) m g sinθ)
    mu = (1.0 + 0.5) / 2
    N = gs * math.cos(math.radians(17))
    res["slip_check_17deg"] = {"mu_combined(avg 1.0,0.5)": mu, "muN": round(mu * N, 4),
                               "F_needed_initial(2/7 mg sin)": round(2 / 7 * gs * math.sin(math.radians(17)), 4),
                               "F_needed_terminal(mg sin)": round(gs * math.sin(math.radians(17)), 4),
                               "rolls_without_slip": 2 / 7 * gs * math.sin(math.radians(17)) < mu * N and gs * math.sin(math.radians(17)) < mu * N}
    res["physx_defaults(ScBodyCore.cpp)"] = {"dynamic_linearDamping": 0.0, "dynamic_angularDamping": 0.05,
                                             "dynamic_maxAngularVelocity": 100.0, "max_roll_speed_r0.18": 18.0, "max_roll_speed_r0.12": 12.0}

    # 6. mg0119 판정값
    jump_v = 5.0
    res["mg0119"] = {
        "points_by_order": [5, 3, 2, 1],
        "cupIn": "|ball - attach_fx01|^2 < 0.1  (거리 < %.4f m, 3D)" % math.sqrt(0.1),
        "jump": {"impulse": jump_v, "airtime_flat_s": round(2 * jump_v / gs, 4), "apex_m": round(jump_v ** 2 / (2 * gs), 4)},
        "outside_bounds": {"stage 0,1,2,5,6,7 (start,r1_3,r1_4,r1_5,r1_6,r1_2)": [3.75, 2.0],
                           "stage 3,4,8,9 (r3_4,r3_1,r3_5,r3_6)": [2.65, 2.65]},
        "ai_speed_range(level)": {"Easy": [0.8, 1.0], "Normal": [0.9, 1.1], "Hard": [0.7, 1.7], "Master": [1.3, 2.3]},
        "ai_trapped_rule": "3 s 창의 이동거리/3 < 0.1 m/s 이면 Trapped",
    }

    out = Path(__file__).resolve().parents[3] / "analysis" / "mgD_calc.json"
    out.write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(res, indent=1, ensure_ascii=False)[:6000])


if __name__ == "__main__":
    main()
