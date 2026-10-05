"""mgE: mg0101 데인저러스 브리지 재구현 계산.

판독한 식(web/docs/minigame/mg0101.md 6절)을 그대로 옮겨
  1) 카메라 애니(fsnb 베이크)에서 카메라 x 와 view 이동량을 얻고
  2) MapMgr::GetBarPosition 으로 뒤(L)·앞(R) 통나무 벽 x 를 프레임마다 계산하고
  3) 벽 방향 전환(BarNPC::Stagger 호출) 시점을 세고
  4) ComRankMgr 순위식, ComAI 10틱 판정식을 표본으로 돌린다.
원본 실행이 아니라 재구현 계산이다. 카메라 프레임 = 정수 프레임(속도 1.0, 프레임당 +1)으로 가정한다.

사용: python tools/mgE_mg0101_calc.py  → analysis/mgE_mg0101_calc.json
"""
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
from core_rand import f32, f32_round_exact  # noqa: E402

BEA = ROOT / "extracted/bea/mg~mg0101.nx.bea/mg/mg0101"
TMP = ROOT / "analysis/mgE_tmp"
E = ROOT / "web/tools/analysis/graphics_bfres2gltf/bin/Release/net7.0/graphics_bfres2gltf.exe"

# Params::createInstance 기본값 (mg0101 @0x71000228b0) [판독]
PARAMS = {
    "CameraSpeedScale": 1.0, "CameraDestructFrames": [3180.0, 3080.0, 3080.0], "FrontStartX": -55.5,
    "BarSizeX": 2.0, "BarSizeY": 2.5, "BarSizeZ": 6.0, "DestroyDelayQST": f32(0.65), "DestroyDelayPR": f32(0.65),
    "PcSurpriseFxTriggerFrame": 2815.0, "GroupNpc": True, "NpcAttackStaggerFrame": 3200.0,
    "NpcIdleDurationMin": 3.0, "NpcIdleDurationMax": 5.0,
}
PATTERN_OF_COURSE = ["barPatternA", "barPatternB", "barPatternC", "barPatternA", "barPatternB", "barPatternC"]
CAM_OF_COURSE = ["game", "game_b", "game_c", "game", "game_b", "game_c"]


def load_cam(name):
    p = TMP / f"mg0101_cam_{name}.json"
    if not p.exists():
        import subprocess
        TMP.mkdir(parents=True, exist_ok=True)
        subprocess.run([str(E), "anim", str(BEA / f"env/mg0101_cam_{name}.fsnb"), str(p)], check=True)
    cam = json.load(open(p, encoding="utf-8"))["sceneAnims"][0]["cameras"][0]
    return cam["pos"], cam["rotOrAim"]


class BarState:
    """MapMgr+0xC8/0xCC(이전 위치), +0xD0/0xD4(이전 변화량)."""

    def __init__(self):
        self.prev_pos = [f32(0.0), f32(0.0)]
        self.prev_delta = [f32(0.0), f32(0.0)]


def get_bar_position(f, side, data, view_tx, st, events):
    """mg0101 MapMgr::GetBarPosition @0x7100015050 (디스어셈블리 그대로).
    반환: 엔티티 x (카메라 기준 상대값을 월드로: sideOff + pos - view_tx) 또는 FrontStartX."""
    fk, pk = ("frameL", "posL") if side == 0 else ("frameR", "posR")
    side_off = f32(-1.5) if side == 0 else f32(1.5)
    f0 = f32(data[0][fk])
    p = f32(data[0][pk])
    if f0 >= f:
        if f0 != 0.0:
            return f32(PARAMS["FrontStartX"]), "front_start"
        return f32(side_off + f32(p - view_tx)), "first"
    n = len(data)
    if n <= 1:
        return f32(side_off + f32(p - view_tx)), "single"
    prev_f = f0
    for i in range(1, max(n, 2)):
        fi = f32(data[i][fk])
        if fi <= 0.0:
            continue  # 이전 값(prev_f, p) 유지
        pi = f32(data[i][pk])
        if fi < f:
            prev_f, p = fi, pi
            continue
        t = f32(f32(f - prev_f) / f32(fi - prev_f))
        newp = f32_round_exact(Fraction(f32(pi - p)) * Fraction(t) + Fraction(p))  # fmadd
        delta = f32(newp - st.prev_pos[side])
        prev = st.prev_delta[side]
        st.prev_pos[side] = newp
        trig = None
        if (delta != 0.0 and prev == 0.0) or (delta < 0.0 and prev > 0.0) or (delta > 0.0 and prev < 0.0):
            trig = "start_or_reverse"
            arg = (side == 0) if delta > 0.0 else (side != 0)
        elif delta == 0.0 and prev != 0.0:
            trig = "stop"
            arg = (side == 0) if prev <= 0.0 else (side != 0)
        if trig:
            events.append({"frame": f, "side": "L" if side == 0 else "R", "kind": trig, "staggerArg": bool(arg),
                           "npcs": [2 * side, 2 * side + 1], "delta": delta})
        st.prev_delta[side] = delta
        return f32(side_off + f32(newp - view_tx)), "interp"
    return f32(side_off + f32(p - view_tx)), "after_last"


def rank_tick(ranks, players):
    """ComRankMgr::ReceiveMessageImpl @0x7100020e30. players = [(pid, goalFrame, fallFrame)] PlayerMgr 순서."""
    goals, falls = [], []
    for pid, goal, fall in players:
        if ranks[pid] != -1:
            continue
        if goal != 0:
            goals.append(pid)
        elif fall > 0:
            falls.append(pid)
    for pid in goals:
        ranks[pid] = 0
    if falls:
        if len(falls) == 4:
            r = 3
        else:
            r = (sum(1 for v in ranks if v == -1) - len(falls)) + sum(1 for v in ranks if v == 0)
        for pid in falls:
            ranks[pid] = r
    return ranks


def is_tick10(n):
    """ComAI::Update @0x7100004b90 의 나눗셈 없는 판정(madd 0xCCCCCCCD, +0x19999998, ror 1, <= 0x19999998)."""
    v = (n * 0xCCCCCCCD + 0x19999998) & 0xFFFFFFFF
    v = ((v >> 1) | ((v & 1) << 31)) & 0xFFFFFFFF
    return v <= 0x19999998


def main():
    db = json.load(open(BEA / "data/database.json", encoding="utf-8-sig"))
    out = {"params": PARAMS, "param_json": db["param"], "courses": {}}
    cams = {}
    for name in ("game", "game_b", "game_c"):
        pos, aim = load_cam(name)
        cams[name] = (pos, aim)
        bad = sum(1 for p, a in zip(pos, aim) if f32(p[0]) != f32(a[0]))
        out.setdefault("camera_check", {})[name] = {
            "frames": len(pos), "x0": pos[0][0], "xLast": pos[-1][0], "posX_ne_aimX_frames": bad,
            "x_at": {str(k): pos[k][0] for k in (0, 551, 1000, 2000, 3000, 3080, 3180, 3200, 4000, len(pos) - 1)},
        }
    same = all(cams["game"][0][i] == cams["game_b"][0][i] == cams["game_c"][0][i] for i in range(len(cams["game"][0])))
    out["camera_check"]["three_cameras_identical_pos"] = same

    for pat in ("barPatternA", "barPatternB", "barPatternC"):
        cam = {"barPatternA": "game", "barPatternB": "game_b", "barPatternC": "game_c"}[pat]
        pos, _ = cams[cam]
        data = db[pat]
        st = BarState()
        ev = []
        rows = []
        min_gap = None
        for fr in range(len(pos)):
            f = f32(float(fr))
            view_tx = f32(-pos[fr][0])  # [추정] Camera+0x70 = view 행렬 이동 x = -dot(right(=+x), eye)
            lx, lk = get_bar_position(f, 0, data, view_tx, st, ev)
            rx, rk = get_bar_position(f, 1, data, view_tx, st, ev)
            gap = None if rk == "front_start" else f32(rx - lx)
            if gap is not None and (min_gap is None or gap < min_gap[1]):
                min_gap = (fr, gap)
            if fr % 50 == 0 or fr in (551, 552):
                rows.append({"frame": fr, "camX": pos[fr][0], "L_x": lx, "R_x": rx, "R_kind": rk,
                             "L_rel": f32(lx + 1.5 + view_tx), "R_rel": None if rk == "front_start" else f32(rx - 1.5 + view_tx),
                             "gap": gap})
        out["courses"][pat] = {"camera": cam, "keys": len(data), "min_gap": {"frame": min_gap[0], "gap": min_gap[1]},
                                "stagger_events": ev, "samples": rows}
        print(pat, "keys", len(data), "stagger events", len(ev), "min gap", min_gap)

    # 순위 표본
    samples = []
    seqs = [
        ("1명씩 떨어짐", [[(0, 0, 100)], [(1, 0, 200)], [(2, 0, 300)]]),
        ("2명 동시 낙하 후 1명 골", [[(0, 0, 100), (1, 0, 100)], [(2, 4000, 0)]]),
        ("4명 동시 낙하", [[(0, 0, 50), (1, 0, 50), (2, 0, 50), (3, 0, 50)]]),
        ("2명 골 뒤 1명 낙하", [[(0, 4000, 0), (1, 4000, 0)], [(2, 0, 4100)]]),
    ]
    for name, ticks in seqs:
        ranks = [-1, -1, -1, -1]
        state = {pid: (0, 0) for pid in range(4)}
        hist = []
        for t in ticks:
            for pid, g, fl in t:
                state[pid] = (g, fl)
            rank_tick(ranks, [(pid, *state[pid]) for pid in range(4)])
            hist.append(list(ranks))
        samples.append({"case": name, "ranks_after_each_tick": hist})
    out["rank_samples"] = samples
    out["tick10"] = [n for n in range(1, 41) if is_tick10(n)]
    out["notes"] = [
        "카메라 프레임 진행량은 미확정(속도 1.0 × 프레임당 1 가정).",
        "view_tx = -camX 는 추정(op 위치 -98 과 프레임 0 계산값 일치로 뒷받침).",
    ]
    p = ROOT / "analysis/mgE_mg0101_calc.json"
    json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("tick10:", out["tick10"])
    print("camera_check:", json.dumps({k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != 'x_at'}) for k, v in out["camera_check"].items()}, ensure_ascii=False))
    for s in samples:
        print(s)
    print("->", p)


if __name__ == "__main__":
    main()
