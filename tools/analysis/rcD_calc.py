"""rcD: mg1808(따끈따끈 팬케이크)·mg1809(꾹꾹 샌드위치) 재구현 계산 [재구현 계산].

판독한 식을 그대로 옮겨 채보에서 총점·개인 횟수·판정 시각·종료 시각을 계산한다. 원본 실행과 대조한 것이 아니다.

전제(모두 문서 web/docs/minigame/mg1808.md·mg1809.md 의 [판독] 근거):
- BPM 120, 8분 = 0.25 s = 15 프레임, dt = f32(1/60)
- BeforeOneBeat 없음 → 줄 r 의 배분 시각 = (게임 BGM 시작 마디 B) + 1 마디 + r × 8분 (02_rhythm 7.3)
- 종료: Lock 줄 = 줄수 − 4 인 프레임에 종료 BGM 요청 → 다음 마디 경계 (02_rhythm 7.3)
- mg1808 은 NextEntry 오프셋 4 (줄 R 의 팬케이크는 줄 R−4 시각에 배달 시작)
- 프레임 단위 지연(서버 모션 첫 프레임, 파이버 순서)은 ±2 프레임 [미확정] 로 두고 8분 단위 명목 시각만 계산

usage: python tools/rcD_calc.py  →  analysis/rcD_calc_bpm120.json
"""
import json
import struct
import glob
import os

ROOT = "c:/dev/mpj"
BEA = ROOT + "/extracted/bea"
F = lambda x: struct.unpack("<f", struct.pack("<f", x))[0]
DT = F(1.0 / 60.0)
BPM = 120
EIGHTH = F(F(60.0 / BPM) * F(1.0) * F(0.5))  # GetBeatToSec(1,1)
FRAMES_PER_8TH = 15


def load(mg, name):
    return json.load(open(f"{BEA}/mg~{mg}.nx.bea/mg/{mg}/data/{name}", encoding="utf-8-sig"))


def end_info(size):
    lock_row = size - 4
    # 줄 0 = B+1 마디 첫 박. 줄 r 의 시각(마디) = 1 + r/8
    req_bar = 1 + lock_row / 8
    end_bar = int(req_bar) + 1 if req_bar != int(req_bar) else int(req_bar)
    # 요청 프레임이 마디 첫 박이면 ENDPLAY_CHECK 가 그 마디 끝 8틱 전에 G10=1 → 다음 경계. 여기서는 '다음 마디 경계'로 둔다
    if req_bar == int(req_bar):
        end_bar = int(req_bar) + 1
    return {"lockRowAtRequest": lock_row, "requestBar(B기준)": req_bar, "endBgmStartBar(B기준)": end_bar,
            "endBgmStartSec(BGM시작기준)": end_bar * 2.0}


# ---------------------------------------------------------------- mg1808
BAKE = {"S": 8, "M": 12, "L": 28}          # Pancake::Setup::BakeBeatNum [0,1,2] = S,M,L (8분 단위)
TYPE = {"S": 0, "M": 1, "L": 2}


def mg1808(name):
    d = load("mg1808", name)
    size = len(d["1P"])
    lanes = ["1P", "2P", "3P", "4P"]
    objs = ["OBJ1", "OBJ2", "OBJ3", "OBJ4"]
    total = 0
    personal = [0, 0, 0, 0]
    cakes = []
    breaks = []
    receivers = []
    for r in range(size):
        for li, ln in enumerate(lanes):
            c = d[ln][r]["code"]
            if c == "BREAK":
                breaks.append(r)
                continue
            if not c or c[0] == " ":
                continue
            o = d[objs[li]][r]["code"]
            if o and o[0] not in " BE" and len(o) >= 2:   # 마스크 0x2400000001 = ' ','B','E' 제외
                p1, p2 = int(o[0]) - 1, int(o[1]) - 1
                personal[p1] += 1
                personal[p2] += 1
            else:
                p1 = p2 = li
                personal[li] += 2
            total += 4                                   # CalcTotalPoint: 팬케이크 1개 = 4 (2타 × JUST 2)
            if c[0] in BAKE:
                b = BAKE[c[0]]
                half = b // 2
                land = r                                  # 배달 R−4 → 던짐 R−2 → 착지 R (8분 단위 명목)
                hit1 = land + half                        # 착지 후 경과 = bake/2 (뒤집기 비행 2 는 경과에 안 셈)
                hit2 = hit1 + 2 + (b - half)              # 뒤집기 비행 2 + 남은 굽기
                plate = hit2 + 2                          # 접시로 2 비행 → 상태 7
                cakes.append({"row": r, "lane": li, "size": c[0], "deliverRow": r - 4, "throwRow": r - 2,
                              "landRow": land, "hit1Row": hit1, "hit1Player": p1, "hit2Row": hit2,
                              "hit2Player": p2, "plateReturnRow": plate,
                              "ngBurnRow1": land + half + 2, "ngBurnRow2": hit1 + 2 + (b - half) + 2})
        o4 = d["OBJ4"][r]["code"]
        if o4:
            receivers.append({"row": r, "code": o4})
    # BREAK 줄: Lock 시각(= 그 줄 시각)에 '활성 팬케이크가 모두 상태 7(접시 반환)' 이면 강제 종료
    first_force = None
    for br in breaks:
        delivered = [c for c in cakes if c["deliverRow"] <= br]
        if all(c["plateReturnRow"] <= br for c in delivered) and len(delivered) == len(cakes):
            first_force = br
            break
    ei = end_info(size)
    force = None
    if first_force is not None:
        req_bar = 1 + first_force / 8
        end_bar = int(req_bar) + 1
        force = {"forceEndRow": first_force, "requestBar(B기준)": req_bar, "endBgmStartBar(B기준)": end_bar,
                 "endBgmStartSec(BGM시작기준)": end_bar * 2.0}
    # 같은 플레이어 연속 타격 간격(8분) — 쿨다운 19 프레임(= 8분 + 4f) 과 비교
    per_player = {p: [] for p in range(4)}
    for c in cakes:
        per_player[c["hit1Player"]].append(c["hit1Row"])
        per_player[c["hit2Player"]].append(c["hit2Row"])
    min_gap = {}
    for p, hs in per_player.items():
        hs.sort()
        gaps = [b - a for a, b in zip(hs, hs[1:])]
        min_gap[p] = min(gaps) if gaps else None
    return {"rows": size, "pancakes": len(cakes), "bySize": {k: sum(1 for c in cakes if c["size"] == k) for k in "SML"},
            "totalPoint": total, "personalPlayNum": personal, "breakRows": breaks, "receivers": receivers,
            "normalEnd": ei, "forceEndIfAllJust": force, "minSamePlayerHitGap8th": min_gap,
            "maxLastPlateRow": max(c["plateReturnRow"] for c in cakes), "cakes": cakes}


def mg1808_judge_frames():
    """Player::OnMove: d = (int)(elapsed·60) − (int)(GetBeatToSec(1,n)·60). |d|<6 JUST, d<0 FAST, d>0 SLOW. 바깥 창 없음."""
    out = {}
    for size, b in BAKE.items():
        for side, n in (("first", b // 2), ("second", b)):
            tgt = int(F(F(EIGHTH * n) * 60.0))
            # elapsed 는 착지 프레임부터 dt 누적(f32). 착지 후 k 번째 갱신에서 판정
            e = F(0.0)
            rows = []
            for k in range(1, 1000):
                e = F(e + DT)
                fr = int(F(e * 60.0))
                d = fr - tgt
                rows.append((k, d))
            just = [k for k, d in rows if abs(d) < 6]
            out[f"{size}_{side}"] = {"targetFrames": tgt, "justK": [min(just), max(just)],
                                     "fastK<": min(just), "slowK>": max(just)}
    return out


# ---------------------------------------------------------------- mg1809
CSV = {"JUST_RANGE": 0.09, "PARTS_MOVE_CYCLE": 6}
CODE = {"JUST_RANGE": 0.05, "PARTS_MOVE_CYCLE": 4}


def parse_part(code):
    kind = {"T": 0, "M": 1, "C": 2, "A": 3}.get(code[0], 1)
    direction = -1 if code[1] == "R" else 1
    a = ord(code[2]) - 0x30
    b = ord(code[3]) - 0x30
    sp = ord(code[4]) - 0x30
    speed = sp if 0 <= ord(code[4]) - 0x31 <= 8 else 1
    us = code.find("_")
    c = int(code[us + 1:]) if us >= 0 else None
    return kind, direction, a, b, speed, c


def mg1809(name, cycle):
    d = load("mg1809", name)
    size = len(d["1P"])
    notes = []
    per = [0, 0, 0, 0]
    total = 0
    for r in range(size):
        for li, ln in enumerate(["1P", "2P", "3P", "4P"]):
            c = d[ln][r]["code"]
            if not c or c[0] == " ":
                continue
            per[li] += 1
            total += {"X": 4, "Y": 6, "Z": 8}.get(c[0], 2)
            kind, dr, a, b, sp, cc = parse_part(c)
            arrive = (a + b) * cycle - b                 # Parts::Entry: +0x64/+0x68 = (a+b)·8분·cycle − b·8분
            notes.append({"row": r, "lane": li, "code": c, "kind": kind, "dir": dr, "hop8th": a, "wait8th": b,
                          "speed": sp, "arrive8th": arrive, "just8th": cc, "justRow": r + (cc if cc is not None else arrive),
                          "arriveMatchesJust": arrive == cc})
    marks = []
    for r in range(size):
        row = {k: d[k][r]["code"] for k in ("OBJ1", "OBJ2", "OBJ3", "OBJ4") if d[k][r]["code"]}
        if row:
            marks.append({"row": r, **row})
    w_rows = [m["row"] for m in marks if m.get("OBJ1") == "W"]
    p_rows = [m["row"] for m in marks if m.get("OBJ1", "").startswith("P")]
    late = []
    for n in notes:
        nxt = [w for w in w_rows if w >= n["row"]]
        if nxt and n["justRow"] + 1 > nxt[0]:
            late.append({**n, "nextW": nxt[0]})
    gaps = {}
    for li in range(4):
        js = sorted(n["justRow"] for n in notes if n["lane"] == li)
        g = [b - a for a, b in zip(js, js[1:])]
        gaps[li] = min(g) if g else None
    return {"rows": size, "notes": len(notes), "totalPoint": total, "personalPlayNum": per,
            "arriveEqualsJustCount": sum(1 for n in notes if n["arriveMatchesJust"]),
            "packRows(P)": p_rows, "wasteRows(W)": w_rows, "notesJustAfterNextW": late,
            "minSameLaneJustGap8th": gaps, "normalEnd": end_info(size), "marks": marks, "notes_": notes}


def mg1809_judge_frames(just_range):
    """Parts::Push: t = +0x68 (남은 시간, 매 프레임 −dt). 창 |t| ≤ 8분 − dt, JUST |t| < JUST_RANGE, t≥0 FAST, t<0 SLOW."""
    res = {}
    for c in (6, 21):
        t = F(F(EIGHTH) * F(c))
        frames = []
        k = 0
        while t > -0.5:
            t = F(t - DT)          # Parts::Update 가 판정(Player::Exec, 같은 프레임 뒤)보다 먼저 감소 [추정: 파이버 순서]
            k += 1
            win = abs(t) <= F(F(EIGHTH) - DT)
            if win:
                j = "JUST" if abs(t) < F(just_range) else ("FAST" if t >= 0 else "SLOW")
                frames.append((k, round(t, 5), j))
        res[f"c={c}"] = {"frames(k,t,judge)": frames,
                         "count": {x: sum(1 for f in frames if f[2] == x) for x in ("FAST", "JUST", "SLOW")}}
    return res


def main():
    out = {"bpm": BPM, "eighthSec": EIGHTH, "dt": DT, "mg1808": {}, "mg1809": {}}
    for f in ("mg1808_rm_chart00.json", "mg1808_rm_chart01.json", "mg1808_rm_chart00s.json"):
        out["mg1808"][f] = mg1808(f)
    out["mg1808"]["judgeFrames"] = mg1808_judge_frames()
    for f in sorted(os.path.basename(p) for p in glob.glob(f"{BEA}/mg~mg1809.nx.bea/mg/mg1809/data/*.json")):
        out["mg1809"][f] = mg1809(f, CSV["PARTS_MOVE_CYCLE"])
        out["mg1809"][f + "@cycle4(code default)"] = {
            "arriveEqualsJustCount": mg1809(f, CODE["PARTS_MOVE_CYCLE"])["arriveEqualsJustCount"]}
    out["mg1809"]["judgeFrames_csv0.09"] = mg1809_judge_frames(CSV["JUST_RANGE"])
    out["mg1809"]["judgeFrames_code0.05"] = mg1809_judge_frames(CODE["JUST_RANGE"])
    p = ROOT + "/analysis/rcD_calc_bpm120.json"
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 요약 출력
    for f, v in out["mg1808"].items():
        if f.endswith(".json"):
            print("mg1808", f, {k: v[k] for k in ("rows", "pancakes", "bySize", "totalPoint", "personalPlayNum",
                                                   "breakRows", "normalEnd", "forceEndIfAllJust",
                                                   "minSamePlayerHitGap8th", "maxLastPlateRow")})
    print("mg1808 judge", out["mg1808"]["judgeFrames"])
    for f, v in out["mg1809"].items():
        if f.endswith(".json"):
            print("mg1809", f, {k: v[k] for k in ("rows", "notes", "totalPoint", "personalPlayNum",
                                                   "arriveEqualsJustCount", "packRows(P)", "wasteRows(W)",
                                                   "minSameLaneJustGap8th", "normalEnd")},
                  "late:", len(v["notesJustAfterNextW"]))
        elif "cycle4" in f:
            print("  ", f, v)
    for k in ("judgeFrames_csv0.09", "judgeFrames_code0.05"):
        print(k, {c: x["count"] for c, x in out["mg1809"][k].items()})
    print("->", p)


if __name__ == "__main__":
    main()
