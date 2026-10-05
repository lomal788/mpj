"""rcC: mg1806/mg1807 채보 기반 재구현 계산 — [재구현 계산]
사용: python tools/rcC_calc.py [bpm=120]  ->  analysis/rcC_calc_bpm<bpm>.json

판독 근거(주소)는 web/docs/minigame/mg1806.md, mg1807.md.
- mg1806: Mg1806InfoManager::Impl::SetupChartInfo @0x71000075b0 (디스어셈블 analysis/decomp/rcC_mg1806_setupchartinfo_dis.txt),
  CHART_INFO::CheckTop @0x7100009300, SetAction @0x7100008ac0, CheckAction @0x71000095e8, CalcMaxCount @0x7100008e70,
  PLAYER::Ready @0x710000e2e0, PlayerManager::Impl::Update @0x710000aac0
- mg1807: Scene::CalcTotalPoint @0x71000171f0, ObjectManImpl::Entry @0x71000044a0, TimingJudgeMan::Entry @0x710000b310,
  JudgeSwing @0x710000da30, ObjectManImpl::Update @0x7100005180
"""
import json
import math
import sys

import numpy as np

BPM = int(sys.argv[1]) if len(sys.argv) > 1 else 120
F = np.float32
DT = F(1.0) / F(60.0)
BEAT_SCALE = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125]


def beat_to_sec(t, n):
    return F(F(60.0) / F(BPM) * F(n) * F(BEAT_SCALE[t]))


def beat_to_frame(t, n):
    return int(beat_to_sec(t, n) * F(60.0))


def load(g, name):
    p = f"c:/dev/mpj/extracted/bea/mg~{g}.nx.bea/mg/{g}/data/{g}_rm_{name}.json"
    j = json.load(open(p, encoding="utf-8-sig"))
    keys = ["1P", "2P", "3P", "4P", "OBJ1", "OBJ2", "OBJ3", "OBJ4"]
    n = len(j["1P"])
    return [[j[k][r].get("code", "") for k in keys] for r in range(n)]


# ------------------------------------------------------------------ mg1806
# CHART_INFO::SetTop::DATA @0x710003ba80: (a 단계 줄 수, b 카운트 간격 줄, c 카운트 수), 인덱스 = CheckTop 결과
TOP_DATA = [(8, 2, 4), (16, 4, 4), (4, 2, 2), (8, 4, 2), (16, 2, 8), (32, 4, 8)]
ACTION = {"POSE_00": 0, "POSE_01": 1, "POSE_02": 2, "POSE_03": 3, "POSE_04": 4, "SWING": 7}


def check_top(s):
    for suf, t in (("_SH", 2), ("_LH", 3), ("_SL", 4), ("_LL", 5)):
        if suf in s:
            return t
    if "_S" in s:
        return 0
    if "_L" in s:
        return 1
    return -1


def ci_new():
    return dict(row=-1, top=0, last=0, phase=-1, a=0, b=0, c=0, ring=[-1] * 9, topType=-1,
                flags=[0, 0, 0, 0], act=[8, 8, 8, 8])


def copy_ci(e):
    return dict(e, ring=list(e["ring"]), flags=list(e["flags"]), act=list(e["act"]))


def set_action(ci, s2, s3):
    a = ACTION.get(s2, 8)
    if a == 8:
        ci["act"] = [8, 8, 8, 8]
        return False
    hit = False
    for p in range(4):
        if str(p + 1) in s3:
            ci["act"][p] = a
            hit = True
        else:
            ci["act"][p] = 8
    return hit


def mg1806_chart_info(rows):
    main, temp = [], []
    saved3 = ""
    counter, step = 0, 0
    in_phase = False
    for i, r in enumerate(rows):
        s1, s2, s3 = r[0], r[1], r[2]
        ci = ci_new()
        if len(s1) >= 7 and "W_PHASE" in s1:
            temp = []
            ci.update(top=1, row=i, phase=2)
            saved3 = ""
            main.append(ci)
            in_phase = False
            continue
        if len(s1) >= 7 and "M_PHASE" in s1:
            temp = []
            t = check_top(s1)
            if t != -1:
                a, b, c = TOP_DATA[t]
                ci.update(top=1, topType=t, phase=0, a=a, b=b, c=c)
                ring = [k * b for k in range(max(c, 1))] + [a]
                ci["ring"] = (ring + [-1] * 9)[:9]
            ci["row"] = i
            saved3 = s3
            counter, step = 0, ci["b"]
            # 4P 열 '*' 사용자 정의 카운트(경로 0x7100008180)는 실채보 4P 가 전부 빈칸이라 생략
        elif len(s1) >= 7 and "P_PHASE" in s1:
            if temp:
                for e in temp:
                    for p in range(4):
                        if e["act"][p] <= 4:
                            temp[0]["flags"][p] = 1
                base = temp[0]["row"]
                main.extend(copy_ci(e) for e in temp)
                for e in temp:
                    c2 = copy_ci(e)
                    c2["row"] = e["row"] + (i - base)
                    c2["phase"] = 1
                    main.append(c2)
            in_phase = False
            continue
        elif not in_phase:
            continue
        # 카운트 경계 줄(M 줄 포함)에서만 2P 동작을 읽고 항목을 쌓는다
        on_boundary = counter == 0
        if on_boundary:
            set_action(ci, s2, saved3)
            ci["row"] = i
        counter = 0 if counter + 1 >= step else counter + 1
        if on_boundary or ci["top"]:
            temp.append(ci)
        in_phase = True
    last = 0
    for k, e in enumerate(main):
        if e["top"] and e["phase"] == 1:
            last = k
    if main:
        main[last]["last"] = 1
    return main


def mg1806_calc(name):
    rows = load("mg1806", name)
    info = mg1806_chart_info(rows)
    maxs, per, cnt = 0, [0] * 4, [0] * 4
    cur = -1
    poses = []
    for e in info:
        if e["top"]:
            cur = e["phase"]
        if cur == 1:
            for p in range(4):
                if e["act"][p] != 8:
                    maxs += 2
                    per[p] += 2
                    cnt[p] += 1
            if any(a != 8 for a in e["act"]):
                poses.append(dict(row=e["row"], act=e["act"]))
    phases = [dict(row=e["row"], phase=e["phase"], topType=e["topType"], len=e["a"], step=e["b"], count=e["c"],
                   players=e["flags"], last=e["last"]) for e in info if e["top"]]
    f8 = beat_to_frame(1, 1)
    hit, jf, jw = 4, 4, 10   # Params hitWide, justFront, justWide 기본값
    t0 = f8
    fs = t0 - (hit + jf)
    js = fs + hit
    ss = js + jw
    en = ss + hit
    win = dict(t0=t0, fastStart=fs, justStart=js, slowStart=ss, end=en,
               relToRowFrame=dict(FAST=[fs - t0, js - t0 - 1], JUST=[js - t0, ss - t0 - 1],
                                  SLOW=[ss - t0, en - t0 - 1]))
    n = len(rows)
    end_bar = 1 + (n - 4) / 8
    return dict(rows=n, chartInfoCount=len(info), maxScore=maxs, perPlayerMax=per, personalPlayNum=cnt,
                phases=phases, playerPoses=poses, judgeWindowFrames=win,
                rowFrame="TopStart(B+1 마디 1박) + 15*r 프레임 (BPM120)", endRequestRow=n - 4,
                endRequestBarFromB=end_bar, endingBgmBarFromB=math.floor(end_bar) + 1)


# ------------------------------------------------------------------ mg1807

def mg1807_calc(name, notes_score_2all=True):
    rows = load("mg1807", name)
    total, cnt, ext = 0, [0] * 4, [0] * 4
    groups = []
    for r, row in enumerate(rows):
        for p in range(4):
            s = row[p]
            if not s or s[0] == " ":
                continue
            if s[0] == "S":
                ex, pts, c = 0, 2, 1
                n_entry = 1
            else:
                n = int(s[1:]) if s[1:].isdigit() else 0
                n = 2 if n == 1 else n
                if notes_score_2all:
                    ex, pts, c = 0, 2 * n, n
                else:
                    ex, pts, c = n - 2, n + 2, 2
                n_entry = n if n >= 3 else 2
            total += pts
            cnt[p] += c
            ext[p] += ex
            groups.append(dict(lockRow=r, lane=p, code=s, notes=n_entry))
    bowls = [dict(row=r, slot=k, code=row[4 + k]) for r, row in enumerate(rows) for k in range(4) if row[4 + k]]
    tw = int(beat_to_sec(1, 1) * F(60.0))
    tbl = []
    for i in range(3):
        target = F(beat_to_sec(1, 8) + F(i) * beat_to_sec(1, 1))
        el = F(0.0)
        res = {}
        for k in range(1, 200):
            el = F(el + DT)
            diff = int(target * F(60.0)) - int(el * F(60.0))
            if abs(diff) <= tw:
                if i == 0:
                    typ = "JUST" if abs(diff) <= 5 else ("FAST" if diff >= 0 else "SLOW")
                else:
                    typ = "HIT(type0)"
                res.setdefault(typ, []).append(k)
        tbl.append(dict(note=i, targetFrame=int(target * F(60.0)),
                        frames={k2: [v[0], v[-1]] for k2, v in res.items()}))
    n = len(rows)
    return dict(rows=n, totalPoint=total, personalPlayNum=cnt, personalPlayNumExt=ext, noteGroups=len(groups),
                notesPerLane=[sum(g["notes"] for g in groups if g["lane"] == p) for p in range(4)],
                groups=groups, bowlCommands=bowls, judgeFramesAfterEntry=tbl,
                lockRowTime="B + (8+r) 8분", noteTarget="Lock 줄 배분 + 8 + i 8분", endRequestLockRow=n - 4)


def main():
    out = dict(bpm=BPM, mg1806={}, mg1807={})
    for c in ("chart00", "chart01", "chart00s", "chart06s"):
        out["mg1806"][c] = mg1806_calc(c)
    for c in ("chart00", "chart01", "chart05s"):
        out["mg1807"][c] = mg1807_calc(c)
        alt = mg1807_calc(c, False)
        out["mg1807"][c + "_NotesScore2All0"] = {k: alt[k] for k in ("totalPoint", "personalPlayNum", "personalPlayNumExt")}
    path = f"c:/dev/mpj/analysis/rcC_calc_bpm{BPM}.json"
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    keys = ("rows", "maxScore", "perPlayerMax", "personalPlayNum", "totalPoint", "personalPlayNumExt", "notesPerLane",
            "chartInfoCount", "endRequestRow", "endingBgmBarFromB", "endRequestLockRow")
    for g in ("mg1806", "mg1807"):
        for c, v in out[g].items():
            print(g, c, {k: v[k] for k in v if k in keys})
    print("mg1806 window", out["mg1806"]["chart00"]["judgeWindowFrames"])
    print("mg1807 judge", out["mg1807"]["chart00"]["judgeFramesAfterEntry"])
    print("->", path)


if __name__ == "__main__":
    main()
