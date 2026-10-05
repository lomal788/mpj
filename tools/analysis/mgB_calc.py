"""mg0911·mg0912 재구현 계산(원본 판독 식을 그대로 옮긴 것, 원본 실행 대조 아님).

실행: .venv/Scripts/python tools/mgB_calc.py  → analysis/mgB_calc.json
f32 는 numpy.float32 로 매 연산 반올림한다.
"""
import json, os, sys
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
P = json.load(open(os.path.join(ROOT, 'analysis/mgB_params.json'), encoding='utf-8'))
F11 = [np.float32(x) for x in P['mg0911']['config']['F']]
I11 = P['mg0911']['config']['I']
f32 = np.float32
DT60 = f32(1.0) / f32(60.0)


def flipper(dt=DT60, frames=20, hold_frames=10):
    """Flipper::Rotate @0x71000426a0 (mg0911): angle += ±speed·dt, clamp [0, max]. 상승 중 플래그 = 0<angle<max && pressed."""
    mx, sp = F11[15], F11[16]
    a, out = f32(0), []
    for k in range(frames):
        pressed = k < hold_frames
        d = f32(sp * dt)
        a2 = f32(a + (d if pressed else -d))
        a = f32(min(max(a2, f32(0)), mx)) if a2 >= 0 else f32(0)
        rising = bool((a < mx) and (a > 0) and pressed)
        out.append({'frame': k, 'pressed': pressed, 'angleDeg': float(a), 'rising': rising})
    return out


def add_score(score, mul, pts):
    """Player::AddScore @0x7100063530: score = clamp(score + mul*pts, 0, 99999) (99999 초과→99999, 1 미만→0)."""
    v = score + mul * pts
    if v > 99998:
        v = 99999
    if v < 1:
        v = 0
    return v


def ball_force(dt=DT60, dirA=(0, 0, 1), dirB=(0, -1, 0)):
    """BallBase::MoveUpdate @0x71000070e8: ApplyForce(dirA*F9*dt + dirB*F10*dt). dirA=+0x4b0, dirB=+0x4a0(출처는 문서 6절)."""
    a = [f32(x) * F11[9] * dt for x in dirA]
    b = [f32(x) * F11[10] * dt for x in dirB]
    return [float(f32(x + y)) for x, y in zip(a, b)]


def main():
    res = {}
    fl = flipper()
    res['mg0911_flipper_dt60'] = fl
    up = next(r['frame'] for r in fl if r['angleDeg'] >= float(F11[15]))
    down = next(r['frame'] for r in fl if r['frame'] >= 10 and r['angleDeg'] <= 0)
    res['mg0911_flipper_summary'] = {'maxDeg': float(F11[15]), 'speedDegPerSec': float(F11[16]),
                                     'degPerFrame60': float(f32(F11[16] * DT60)),
                                     'framesToFullUp(0-based frame index reaching max)': up,
                                     'frameBackToZeroAfterRelease@10': down}
    fl20 = flipper(dt=f32(0.05), frames=10, hold_frames=5)
    res['mg0911_flipper_dt50ms'] = fl20
    res['mg0911_addScore'] = {'99990+5x2': add_score(99990, 2, 5), '0+(-5)': add_score(0, 1, -5),
                              '10+1x10': add_score(10, 1, 10)}
    res['mg0911_ballForce_dt60'] = ball_force()
    res['mg0911_ballForce_dt50ms'] = ball_force(dt=f32(0.05))
    out = os.path.join(ROOT, 'analysis/mgB_calc.json')
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(res['mg0911_flipper_summary'], ensure_ascii=False))
    print('addScore', res['mg0911_addScore'], 'force60', res['mg0911_ballForce_dt60'])
    print('->', out)


if __name__ == '__main__':
    main()
