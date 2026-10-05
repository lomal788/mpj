"""mgE: mg0122 다 함께 찰칵 재구현 계산.

판독한 사진 판정 식(web/docs/minigame/mg0122.md 6절)을 f32 로 옮겨
  1) data/*.csv 를 원본 로더 규칙대로 읽고(config 는 INT/FLOAT 배열 분리)
  2) Player::CalcCameraScore, Camera::CalcQuestionNpcScore, CalcSubScoreByMapObject,
     Player::CalcScore 를 합성 입력으로 돌린다.
원본 실행이 아니라 재구현 계산·합성 시험이다.

사용: python tools/mgE_mg0122_calc.py  → analysis/mgE_mg0122_calc.json
"""
import csv
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
from core_rand import f32  # noqa: E402

DATA = ROOT / "extracted/bea/mg~mg0122.nx.bea/mg/mg0122/data"


def read_rows(name):
    with open(DATA / name, encoding="utf-8-sig", newline="") as fh:
        return [r for r in csv.reader(fh) if any(c.strip() for c in r)]


def load_config():
    """GameParam::SetupParam @0x71000523f0: 2열이 INT 면 I[], FLOAT 면 F[] 에 순서대로 넣는다."""
    I, F, rows = [], [], []
    for n, r in enumerate(read_rows("mg0122_config.csv"), 1):
        t = r[1].strip()
        if t == "INT":
            I.append(int(r[0]))
            rows.append(("I", len(I) - 1, n, int(r[0])))
        elif t == "FLOAT":
            F.append(f32(float(r[0])))
            rows.append(("F", len(F) - 1, n, float(r[0])))
    return I, F, rows


def load_question():
    """QuestionParam::Initialize @0x7100054950: 27행 x 7열(1~7열), 0열은 비어 있음."""
    q = [[f32(float(c)) for c in r[1:8]] for r in read_rows("mg0122_question.csv")]
    assert len(q) == 27
    return q


def load_com():
    """mg0122_com.csv: 27행(질문) x 44열 = ComLevel 4 x 11. GameParam+0x2b0+level*0x18 벡터, 원소 0x2c B.
    (열 배치는 SetupCom 판독 전 [추정]: level L 의 11개 = 열 1+11L .. 11+11L)"""
    rows = read_rows("mg0122_com.csv")
    out = []
    for r in rows:
        vals = [float(c) for c in r[1:]]
        out.append([vals[L * 11:(L + 1) * 11] for L in range(4)])
    return out


def wrap180(a):
    a = f32(a)
    while a >= 180.0:
        a = f32(a - 360.0)
    while a < -180.0:
        a = f32(a + 360.0)
    return a


def calc_camera_score(cam_pitch, cam_yaw, cam_zoom, q_height, q_angle, q_zoom, qp, P):
    """Player::CalcCameraScore @0x71000570e0 (디스어셈블리). 반환 (s0=벌점 배율, s1=근접도)."""
    rangeA, rangeH, rangeZ, minF = P["0x260"], P["0x264"], P["0x268"], P["0x26c"]
    tolA, tolH, tolZ = qp[2], qp[3], qp[4]
    dh = f32(abs(f32(q_height - cam_pitch)))
    m = f32(1.0)
    e = f32(dh - tolH)
    if e > 0.0:
        m = min(f32(f32(minF - 1.0) * min(f32(e / rangeH), 1.0) + 1.0), 1.0)
    da = f32(abs(wrap180(f32(q_angle - cam_yaw))))
    e = f32(da - tolA)
    if e > 0.0:
        v = f32(f32(minF - 1.0) * min(f32(e / rangeA), 1.0) + 1.0)
        m = m if m < v else v
    dz = f32(abs(f32(q_zoom - cam_zoom)))
    e = f32(dz - tolZ)
    if e > 0.0:
        v = f32(f32(minF - 1.0) * min(f32(e / rangeZ), 1.0) + 1.0)
        m = m if m < v else v
    rH = max(f32(dh / f32(tolH + rangeH)), 0.0)
    rA = f32(da / f32(tolA + rangeA))
    rZ = f32(dz / f32(tolZ + rangeZ))
    r = rH if rH > rA else rA
    r = r if r > rZ else rZ
    close = f32(f32(1.0 - r) + f32(0.0099))
    close = max(min(close, 1.0), 0.0)
    return m, close


def edge_rates(sx, sy):
    """GimmickCaptureData::CalcScreenLength + GetScreenLengthRate (표 [960,540,960,540])."""
    def c(v):
        v = abs(v)
        return 1.0 if v < 1.0 else min(v, 10000.0)
    d = [c(-960.0 - sx), c(540.0 - sy), c(960.0 - sx), c(-540.0 - sy)]
    return [f32(d[0] / 960.0), f32(d[1] / 540.0), f32(d[2] / 960.0), f32(d[3] / 540.0)]


def npc_score(question, photo, main_screen, main_z, C, unique=1.0):
    """Camera::CalcQuestionNpcScore @0x710001dcf0.
    question/photo: [{id, x, y, z, main}] (x,y 는 레이아웃 좌표 ±960/±540, z 는 NDC z)."""
    maxS, perMiss, perExtra = C["I0"], C["I1"], C["I2"]
    behind = (C["I3"], C["I4"])
    front = (C["I5"], C["I6"])
    wMain, dMin, dMax = C["F0"], C["F1"], C["F2"]
    if not any(p["main"] for p in photo):
        return 0
    nQ, nP = len(question), len(photo)
    total, matched, pen = 0.0, 0, 0
    for p in photo:
        q = next((q for q in question if q["id"] == p["id"]), None)
        if q is not None:
            u = unique if p["main"] else 1.0
            rq, rp = edge_rates(q["x"], q["y"]), edge_rates(p["x"], p["y"])
            sims = []
            for a, b in zip(rq, rp):
                s = 1.0 - abs(a - b)
                sims.append(0.0 if s < 0.0 else min(s, 1.0))
            s = u * sum(sims) * 0.25
            if nQ > 1:
                s = wMain * s if p["main"] else s * ((1.0 - wMain) / (nQ - 1))
            total += s
            matched += 1
            continue
        rng = dMax - dMin
        if rng == 0.0:
            t = 0.0
        else:
            d = math.hypot(main_screen[0] - p["x"], main_screen[1] - p["y"])
            t = (d - dMin) / rng
        t = min(max(t, 0.0), 1.0)
        A, B = behind if main_z <= p["z"] else front
        v = int(A + (1.0 - t) * (B - A))
        pen = min(pen, v)
    base = int(maxS * total + 0.99)
    base = 0 if base < 0 else min(base, maxS)
    diff = nQ - nP if nQ != nP else nQ - matched
    if diff < 0:
        pen = pen - perExtra * diff
    elif diff > 0:
        pen = pen + perMiss * diff
    r = base + pen
    return 0 if r < 0 else min(r, maxS)


def sub_score(objs, main_screen_x, main_z, C):
    """Camera::CalcSubScoreByMapObject @0x710001e310 (맵 장식물 4~7). x 거리만 본다."""
    dMin, dMax = C["F1"], C["F2"]
    pen = 0
    for o in objs:
        A, B = (0, 0) if main_z <= o["z"] else (C["I5"], C["I6"])
        rng = dMax - dMin
        if rng == 0.0:
            v = int((B - A) + A)
        else:
            t = (abs(main_screen_x - o["x"]) - dMin) / rng
            t = min(max(t, 0.0), 1.0)
            v = int(A + (1.0 - t) * (B - A))
        pen = min(pen, v)
    return pen


def final_score(close, percent, w):
    """Player::CalcScore @0x7100056fb4: (int)(w*close*100) + (int)((1-w)*percent)."""
    return int(f32(f32(w * close) * 100.0)) + int(f32(f32(1.0 - w) * float(percent)))


def main():
    I, F, rows = load_config()
    Q = load_question()
    com = load_com()
    C = {f"I{i}": v for i, v in enumerate(I)}
    C.update({f"F{i}": v for i, v in enumerate(F)})
    P = {"0x260": F[3], "0x264": F[4], "0x268": F[5], "0x26c": F[6], "0x270": F[8]}
    out = {"config_rows": rows, "I": I, "F": F, "player_fields": P, "question_rows": Q,
           "camera_fields": {"0x3bc maxScore": I[0], "0x3c0 perMissing": I[1], "0x3c4 perExtra": I[2],
                             "0x3c8/0x3cc behind(A,B)": [I[3], I[4]], "0x3d0/0x3d4 front(A,B)": [I[5], I[6]],
                             "0x3d8 wMain": F[0], "0x3dc dMin": F[1], "0x3e0 dMax": F[2]},
           "just_timing_range": {"param6<=0": [min(I[7], I[8]), max(I[7], I[8])], "param6>0": [min(I[9], I[10]), max(I[9], I[10])]},
           "com_level_cols": {"q4_level0": com[4][0], "q4_level3": com[4][3]}}
    w = P["0x270"]
    cases = []
    q4 = Q[4]
    for name, cam in [("정답 그대로", (10.0, 30.0, 5.0)), ("pitch +3", (13.0, 30.0, 5.0)),
                      ("yaw +15", (10.0, 45.0, 5.0)), ("zoom +2", (10.0, 30.0, 7.0)),
                      ("yaw +40", (10.0, 70.0, 5.0)), ("yaw 경계 +179/-179", (10.0, -179.0, 5.0))]:
        qh, qa, qz = 10.0, 30.0 if "경계" not in name else 179.0, 5.0
        m, close = calc_camera_score(f32(cam[0]), f32(cam[1]), f32(cam[2]), f32(qh), f32(qa), f32(qz), q4, P)
        cases.append({"case": name, "question(h,a,z)": [qh, qa, qz], "camera(p,y,z)": cam, "s0_penaltyFactor": m, "s1_closeness": close})
    out["camera_score_cases_q4"] = cases
    Qn = [{"id": 3, "x": 0.0, "y": 0.0, "z": 0.95, "main": True}, {"id": 7, "x": 300.0, "y": -50.0, "z": 0.96, "main": False}]
    npc_cases = []
    for name, photo in [
        ("완전 일치", [dict(Qn[0]), dict(Qn[1])]),
        ("주인공 x+192(화면 10%)", [dict(Qn[0], x=192.0), dict(Qn[1])]),
        ("주인공만(1명 누락)", [dict(Qn[0])]),
        ("모르는 NPC 추가(앞, 가까움)", [dict(Qn[0]), dict(Qn[1]), {"id": 9, "x": 50.0, "y": 0.0, "z": 0.90, "main": False}]),
        ("모르는 NPC 추가(뒤, 멀리)", [dict(Qn[0]), dict(Qn[1]), {"id": 9, "x": 900.0, "y": 0.0, "z": 0.99, "main": False}]),
        ("주인공 없음", [dict(Qn[1])]),
    ]:
        main = next((p for p in photo if p["main"]), Qn[0])
        s = npc_score(Qn, photo, (main["x"], main["y"]), main["z"], C)
        npc_cases.append({"case": name, "npcScore": s})
    out["npc_score_cases"] = npc_cases
    out["final_score_cases"] = [{"close": c, "percent": p, "w": w, "score": final_score(c, p, w)}
                                for c, p in [(1.0, 100), (f32(0.9999), 100), (0.5, 100), (1.0, 0), (0.0, 100)]]
    p = ROOT / "analysis/mgE_mg0122_calc.json"
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("I =", I)
    print("F =", [round(x, 4) for x in F])
    print("player fields", P)
    for c in cases:
        print(c)
    for c in npc_cases:
        print(c)
    print(out["final_score_cases"])
    print("->", p)


if __name__ == "__main__":
    main()
