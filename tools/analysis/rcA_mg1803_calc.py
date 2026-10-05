"""rcA: mg1803 쑥쑥 바비큐 재구현 계산 [재구현 계산].

판독한 식(web/docs/minigame/mg1803.md)을 옮겨 채보 3개로 총점·레인별 횟수·줄 시각·판정 프레임·
CPU 휘두름·동기 난수 소비량·재장전 차단 구간을 계산한다. 원본 실행이 아니다.

사용: python tools/rcA_mg1803_calc.py [bpm=120] [out.json]
기본 출력: analysis/rcA_mg1803_calc.json

전제(문서 9.4·11.2):
- dt = f32(1/60) 고정(리듬 장면 Fixed60).
- 한 프레임 순서 NpcMan(Jugemu) -> ObjsMan(Obj::Update, OnThrow) -> Player(OnMove) -> 장면 흐름(줄 배분). [추정: mg1801 core 규칙 적용]
- 줄 r 배분 프레임 = B + (6 + r) x 8분음표 프레임(BeforeOneBeat(1,0), mainBeatType 1). Lock 줄 r = B + (8 + r) x 8분.
- 사운드 -> 프레임 관측 지연 0.
- 재장전 모션 프레임은 재장전 요청 다음 프레임부터 playRate 씩 는다고 둔다. [추정]
"""
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "extracted" / "bea" / "mg~mg1803.nx.bea" / "mg" / "mg1803" / "data"
CHARTS = ["mg1803_rm_chart00.json", "mg1803_rm_chart01.json", "mg1803_rm_chart05s.json"]

BEAT_SCALE = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125]
OBJ_TYPE = {"M": 0, "Y": 1, "P": 2, "S": 3, "T": 4, "N": 5, "F": 6}
WIDTH = [1, 1, 1, 2, 2, 3, 4]
CALC_WIDTH = {"F": 4, "N": 3, "S": 2, "T": 2}
JUST, FAST, SLOW, NONE = 0, 1, 2, 3
NAMES = {JUST: "JUST", FAST: "FAST", SLOW: "SLOW", NONE: "NONE"}


def f32(v):
    return struct.unpack("<f", struct.pack("<f", v))[0]


DT = f32(1.0 / 60.0)


def beat_to_sec(t, n, bpm):
    return f32(f32(f32(60.0 / f32(bpm)) * f32(n)) * f32(BEAT_SCALE[t]))


def play_rate(bpm):
    return f32(f32(bpm) / f32(120.0))


def load_chart(name):
    d = json.loads((DATA / name).read_text(encoding="utf-8-sig"))
    return {k: [x["code"] for x in v] for k, v in d.items()}


def calc_total_point(chart):
    """Scene::CalcTotalPoint @0x7100013220. 열 0..3, 첫 글자 F=4, N=3, S/T=2, 공백=건너뜀, 그 밖=1."""
    rows = len(chart["1P"])
    lane = [0, 0, 0, 0]
    total = 0
    for i in range(rows):
        for p in range(4):
            c = chart[f"{p + 1}P"][i]
            if not c or c[0] == " ":
                continue
            w = CALC_WIDTH.get(c[0], 1)
            total += w * 2
            for k in range(p, min(4, p + w)):
                lane[k] += 1
    return total, lane


def notes_of(chart):
    """ObjsManImpl::SetupGame @0x7100007ae0 와 같은 순서(줄 오름차순, 열 0..3)의 객체 풀."""
    out = []
    for r in range(len(chart["1P"])):
        for p in range(4):
            c = chart[f"{p + 1}P"][r]
            if c and c[0] in OBJ_TYPE:
                out.append({"row": r, "lane": p, "code": c, "type": OBJ_TYPE[c[0]]})
    return out


def jugemu_and_throw(bpm):
    """Entry 프레임 0 기준: Jugemu 시작·놓기 프레임, Obj::Throw 프레임.
    Mg1803NpcJugemu::Ready @0x7100006d08, ::Update @0x71000047f4, Obj::Update @0x71000075f0."""
    rate = play_rate(bpm)
    t24 = f32(beat_to_sec(0, 1, bpm) + f32(-0.36666667))
    if rate > f32(1.1):
        t24 = f32(f32(f32(f32(1.0) / rate) * f32(0.26666668)) + t24)
    ready0 = t24
    frame = 0
    start = None
    while True:
        frame += 1
        t24 = f32(t24 - DT)
        if t24 <= 0.0:
            start = frame
            break
    c30 = f32(0.0)
    release = None
    while True:
        frame += 1
        c30 = f32(c30 + rate)
        if c30 >= 6.0:
            release = frame
            break
    cd = f32(0.26666668) if rate <= 0 else f32(f32(f32(1.0) / rate) * f32(0.26666668))
    throw = None
    frame = release
    while True:
        cd = f32(cd - DT)
        if cd <= 0.0:
            throw = frame
            break
        frame += 1
    return {"jugemu_start": start, "release": release, "throw": throw,
            "ready_sec": ready0, "countdown_sec": f32(f32(f32(1.0) / rate) * f32(0.26666668))}


def move_frames(bpm, n=400):
    """던진 프레임(0)부터 Obj::OnThrow 가 끝에 t += dt 한 뒤 GetObjsActiveList 가 보는 (int)(t*60)."""
    t = f32(0.0)
    out = []
    for k in range(n):
        t = f32(t + DT)
        out.append(int(math.trunc(f32(t * f32(60.0)))))
    return out


def judge_constants(bpm):
    target = int(math.trunc(f32(beat_to_sec(1, 8, bpm) * f32(60.0))))
    half = int(math.trunc(f32(f32(beat_to_sec(1, 1, bpm) * f32(60.0)) * f32(0.5))))
    cpu_win = f32(beat_to_sec(1, 1, bpm) * f32(60.0))
    return target, half, cpu_win


def classify(d, half):
    if abs(d) > half:
        return NONE
    if abs(d) <= 3:
        return JUST
    return SLOW if d < 1 else FAST


def judge_table(bpm):
    target, half, _ = judge_constants(bpm)
    mf = move_frames(bpm)
    tab = {"JUST": [], "FAST": [], "SLOW": []}
    for k, m in enumerate(mf):
        j = classify(target - m, half)
        if j != NONE:
            tab[NAMES[j]].append(k)
    mono = all(mf[i + 1] - mf[i] == 1 for i in range(len(mf) - 1))
    return {"target_move_frame": target, "half_window": half, "just_abs_max": 3,
            "frames_after_throw": {k: [v[0], v[-1], len(v)] for k, v in tab.items() if v},
            "move_frame_step_always_1": mono}


def cooldown_frames(bpm):
    """Player::OnMove: 휘두름 프레임에 cooldown = beat(1,1), 같은 프레임 끝에 -dt. 다음 프레임 시작에 0 < cooldown 이면 막힘."""
    c = f32(beat_to_sec(1, 1, bpm))
    c = f32(c - DT)
    if c < 0:
        c = 0.0
    k = 1
    while c > 0.0:
        k += 1
        c = f32(c - DT)
        if c < 0:
            c = 0.0
    return k


def cpu_swing_offset(bpm, miss=False):
    """CPU(ComControl 0, 오프셋 0)의 휘두름: 던진 프레임 기준 프레임과 판정."""
    target, half, cpu_win = judge_constants(bpm)
    mf = move_frames(bpm)
    cd = cooldown_frames(bpm)
    res = []
    blocked_until = -1
    use_miss = miss
    for k, m in enumerate(mf):
        if k < blocked_until:
            continue
        d = target - m
        if use_miss:
            ok = float(abs(d)) <= f32(cpu_win - f32(5.0))
        else:
            ok = float(abs(d)) <= cpu_win and m >= target
        if ok:
            res.append({"frame": k, "d": d, "judge": NAMES[classify(d, half)]})
            blocked_until = k + cd
            if classify(d, half) != NONE:
                break
            use_miss = False
    return res


def chart_calc(name, bpm):
    ch = load_chart(name)
    rows = len(ch["1P"])
    eighth = int(round(beat_to_sec(1, 1, bpm) * 60))
    total, lane = calc_total_point(ch)
    notes = notes_of(ch)
    jt = jugemu_and_throw(bpm)
    target, half, _ = judge_constants(bpm)
    mf = move_frames(bpm)
    first_target = next(k for k, m in enumerate(mf) if m >= target)
    overlap = []
    for r in range(rows):
        used = [0] * 4
        for p in range(4):
            c = ch[f"{p + 1}P"][r]
            if c and c[0] in OBJ_TYPE:
                for k in range(p, min(4, p + WIDTH[OBJ_TYPE[c[0]]])):
                    used[k] += 1
        if max(used) > 1:
            overlap.append(r)
    entry = lambda r: (6 + r) * eighth
    lock = lambda r: (8 + r) * eighth
    reloads = [r for r in range(rows) if ch["OBJ1"][r][:1] == "R"]
    last_flag_rows = [r for r in range(rows) if ch["OBJ2"][r][:1] == "A"]
    bar = 8 * eighth
    end_lock_row = rows - 4
    end_req = lock(end_lock_row)
    chart_end = (end_req // bar + 1) * bar
    rate = play_rate(bpm)
    reload_block = []
    for r in reloads:
        f0 = lock(r)
        k = 0
        fr = f32(0.0)
        while fr < 24.0:
            k += 1
            fr = f32(fr + rate)
        reload_block.append([f0, f0 + k])
    sync_entry = 0
    note_rows = []
    conflicts = []
    late = []
    for n in notes:
        e = entry(n["row"])
        th = e + jt["throw"]
        jf = th + first_target
        n2 = dict(n)
        n2.update({"entry": e, "throw": th, "judge_just_center": jf,
                   "just_frames": [th + k for k, m in enumerate(mf) if classify(target - m, half) == JUST]})
        n2["just_frames"] = [n2["just_frames"][0], n2["just_frames"][-1]]
        sync_entry += 3 if n["type"] >= 3 else 2
        for a, b in reload_block:
            if not (n2["just_frames"][1] < a or n2["just_frames"][0] > b):
                conflicts.append({"row": n["row"], "lane": n["lane"], "reload": [a, b]})
        if jf >= chart_end:
            late.append(n["row"])
        note_rows.append(n2)
    lane_rows = [[] for _ in range(4)]
    for n in notes:
        for k in range(n["lane"], min(4, n["lane"] + WIDTH[n["type"]])):
            lane_rows[k].append(n["row"])
    min_gap = min((b - a for rs in lane_rows for a, b in zip(rs, rs[1:])), default=None)
    types = {}
    for n in notes:
        types[n["code"][0]] = types.get(n["code"][0], 0) + 1
    return {
        "rows": rows, "notes": len(notes), "pool_limit_128_ok": len(notes) <= 128, "types": types,
        "total_point": total, "lane_counts": lane, "min_same_lane_row_gap": min_gap, "same_row_lane_overlap_rows": overlap,
        "reload_rows": reloads, "last_flag_rows": last_flag_rows,
        "reload_input_block_frames": reload_block, "notes_blocked_by_reload": conflicts,
        "end_request_frame": end_req, "chart_end_frame": chart_end,
        "notes_judged_after_chart_end": late,
        "sync_rand_entry_total": sync_entry, "sync_rand_startgame": 4,
        "sync_rand_cpu_per_swing": 1,
        "first_note": note_rows[0] if note_rows else None,
        "last_note": note_rows[-1] if note_rows else None,
        "frame_origin": "B = 게임 BGM 시작 프레임(0)",
    }


def main():
    bpm = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "analysis" / "rcA_mg1803_calc.json"
    res = {"bpm": bpm, "dt": DT}
    for b in sorted({bpm, 120, 180}):
        res[f"bpm{b}"] = {
            "beat_to_sec": {"0,1": beat_to_sec(0, 1, b), "1,1": beat_to_sec(1, 1, b), "1,8": beat_to_sec(1, 8, b), "1,16": beat_to_sec(1, 16, b)},
            "constants": dict(zip(["target_move_frame", "half_window", "cpu_window_f"], judge_constants(b))),
            "throw_timeline_from_entry": jugemu_and_throw(b),
            "judge_table": judge_table(b),
            "cooldown_frames": cooldown_frames(b),
            "cpu_comcontrol0": cpu_swing_offset(b),
            "cpu_miss_planned": cpu_swing_offset(b, miss=True),
        }
    res["charts"] = {c: chart_calc(c, bpm) for c in CHARTS}
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in res.items() if k != "charts"}, ensure_ascii=False, indent=1))
    for c, v in res["charts"].items():
        print(c, {k: v[k] for k in ["rows", "notes", "types", "total_point", "lane_counts", "min_same_lane_row_gap", "same_row_lane_overlap_rows",
                                    "reload_rows", "last_flag_rows", "notes_blocked_by_reload", "end_request_frame",
                                    "chart_end_frame", "notes_judged_after_chart_end", "sync_rand_entry_total"]})
        print("  first", v["first_note"], "\n  last", v["last_note"])


if __name__ == "__main__":
    main()
