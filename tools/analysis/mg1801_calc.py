import json
import math
import struct
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "extracted" / "bea" / "mg~mg1801.nx.bea" / "mg" / "mg1801" / "data"

BEAT_TYPE_SCALE = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125]
VEG = {"S": (0, "tomato", 1), "M": (1, "potato", 2), "L": (2, "eggplant", 3), "X": (3, "carrot", 4), "Z": (4, "mushroom", 1)}
JUST, FAST, SLOW, NONE = 0, 1, 2, 3
POOL_PER_TYPE = 15


def f32(v):
    return struct.unpack("<f", struct.pack("<f", v))[0]


def beat_to_sec(beat_type, n, bpm):
    return f32(f32(f32(60.0 / bpm) * n) * BEAT_TYPE_SCALE[beat_type])


def veg_of(code):
    if not code or code[0] == " ":
        return None
    c = code[0]
    if c in VEG:
        return VEG[c]
    return VEG["S"]


def load_chart(name):
    d = json.loads((DATA / name).read_text(encoding="utf-8-sig"))
    return {k: [x["code"] for x in v] for k, v in d.items()}


def calc_total_point(chart):
    rows = len(chart["1P"])
    lane_counts = [0, 0, 0, 0]
    total = 0
    for i in range(rows):
        for p in range(4):
            v = veg_of(chart[f"{p + 1}P"][i])
            if v is None:
                continue
            cuts = v[2]
            for lane in range(p, min(4, p + cuts)):
                lane_counts[lane] += 1
            total += cuts * 2
    return total, lane_counts


def judge(target_sec, window_sec, elapsed_sec, just_range):
    diff = math.trunc(f32(target_sec * 60.0)) - math.trunc(f32(elapsed_sec * 60.0))
    if abs(diff) > math.trunc(f32(window_sec * 60.0)):
        return NONE, diff
    if abs(diff) <= just_range:
        return JUST, diff
    return (FAST if diff >= 1 else SLOW), diff


def timeline(chart, bpm, beat_type=1, dt=f32(1 / 60)):
    row_sec = beat_to_sec(beat_type, 1, bpm)
    t3 = beat_to_sec(0, 3, bpm)
    t4 = beat_to_sec(0, 4, bpm)
    t1 = beat_to_sec(0, 1, bpm)
    life = t4 + t1
    events = []
    for i in range(len(chart["1P"])):
        for p in range(4):
            v = veg_of(chart[f"{p + 1}P"][i])
            if v is None:
                continue
            events.append({"row": i, "lane": p, "veg": v[1], "type": v[0], "cuts": v[2], "entry_s": i * row_sec, "arrive_s": i * row_sec + t3, "stop_s": i * row_sec + life})
    worst = {}
    for t_id in range(5):
        es = [e for e in events if e["type"] == t_id]
        peak = 0
        for e in es:
            live = sum(1 for o in es if o["entry_s"] <= e["entry_s"] < o["stop_s"])
            peak = max(peak, live)
        worst[VEG_NAMES[t_id]] = peak
    overlaps = []
    for i, a in enumerate(events):
        for b in events[i + 1:]:
            if a["row"] != b["row"]:
                continue
            la = set(range(a["lane"], a["lane"] + a["cuts"]))
            lb = set(range(b["lane"], b["lane"] + b["cuts"]))
            if la & lb:
                overlaps.append((a["row"], a["lane"], b["lane"]))
    return events, worst, overlaps


VEG_NAMES = {v[0]: v[1] for v in VEG.values()}


def judge_table(bpm, just_range):
    t3 = beat_to_sec(0, 3, bpm)
    w = beat_to_sec(1, 1, bpm)
    rows = []
    frames = int(round(t3 * 60)) + 25
    for f in range(0, frames):
        elapsed = f32(0)
        for _ in range(f):
            elapsed = f32(elapsed + f32(1 / 60))
        kind, diff = judge(t3, w, elapsed, just_range)
        rows.append((f, kind, diff))
    return rows


def main():
    bpm = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    just_range = 5
    out = {"bpm": bpm, "beat_to_sec": {"t1": beat_to_sec(0, 1, bpm), "t3": beat_to_sec(0, 3, bpm), "t4": beat_to_sec(0, 4, bpm), "half": beat_to_sec(1, 1, bpm)}, "charts": {}}
    for name in ["mg1801_rm_chart00.json", "mg1801_rm_chart01.json", "mg1801_rm_chart05s.json"]:
        chart = load_chart(name)
        total, lanes = calc_total_point(chart)
        events, worst, overlaps = timeline(chart, bpm)
        obj = {k: sorted({c for c in v}) for k, v in chart.items() if k.startswith("OBJ")}
        out["charts"][name] = {
            "rows": len(chart["1P"]),
            "vegetables": len(events),
            "by_type": {VEG_NAMES[t]: sum(1 for e in events if e["type"] == t) for t in range(5)},
            "total_point": total,
            "personal_play_num": lanes,
            "pool_peak_per_type": worst,
            "lane_overlaps_same_row": overlaps,
            "obj_track_codes": obj,
            "first_entry_s": events[0]["entry_s"] if events else None,
            "last_stop_s": max(e["stop_s"] for e in events) if events else None,
        }
    rows = judge_table(bpm, just_range)
    first = {}
    for f, kind, diff in rows:
        first.setdefault(kind, []).append(f)
    out["judge_frames_since_entry"] = {["JUST", "FAST", "SLOW", "NONE"][k]: [min(v), max(v)] for k, v in first.items() if k != NONE}
    out["cpu_hit_frame"] = {
        "JUST": next(f for f, k, d in rows if k == JUST and d < 2),
        "FAST": next(f for f, k, d in rows if k == FAST),
        "SLOW": next(f for f, k, d in rows if k == SLOW),
    }
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
