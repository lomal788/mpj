"""mg0107 피해라! 샌드위치 — 단계·낙하 일정 재구현 계산.

원본 근거(mg0107.nro):
  Scene::Params::createInstance @0x71000183fc   코드 기본값
  Mg0107_Param::Setup/Load @0x710000b640/@0x710000b890  ParamEnable==0 이면 mg0107_info.json 값으로 덮어씀
  GameManager::GetCurrentPhase @0x7100007b20    남은/경과 시간 → 단계 0..6
  GameManager::AddSandwitch @0x71000074e4      간격 타이머 -= dt, <0 이면 묶음 추가 후 간격 = Interval[단계]
  GameManager::GetAddSandCount @0x7100007980   SyncRandRange(min, max+1), 단계→표 (보통/엔드리스 다름)
  SandwitchManager::GetCurrentSpeed @0x7100014654  Base + Speed[단계]
  SandwitchObject::StartFall @0x71000127fc     y: unitH+15 → unitH, 시간 15/speed, Interpolation 형 1(가속 t^2)
  Interpolation::Update @0x710001b27c          t += dt (f32), t>=dur 이면 끝
  SandwitchManager::Setup @0x7100011df0        풀 216개: [0]=형 3, [1..215]=SyncRandRange(0,4)

출력: analysis/mgC_mg0107_calc.json
사용: .venv/Scripts/python tools/mgC_mg0107_calc.py [seed]
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
from core_rand import SyncRand  # noqa: E402

F = np.float32
OUT = ROOT / "analysis/mgC_mg0107_calc.json"
INFO = ROOT / "extracted/bea/mg~mg0107.nx.bea/mg/mg0107/data/mg0107_info.json"

# createInstance 기본값 (오프셋: 값)
DEFAULT = {
    "GameTime": 60, "SandFallHeight": 15.0, "SandFallSpeedBase": 4.5,
    "SandFallSpeedPhase": [1.0, 1.5, 2.5, 4.5, 6.0, 6.5, 6.5],
    "SandFallIntervalPhase": [1.5, 1.0, 1.0, 1.0, 0.85, 0.85, 0.85],
    "SandFallCount": [(2, 3), (3, 3), (4, 4), (4, 4)],
}


def effective_params():
    p = json.loads(json.dumps(DEFAULT))
    j = json.loads(INFO.read_text(encoding="utf-8"))["mg0107_info"]
    p["SandFallHeight"] = j["SandFallHeight"]
    p["SandFallSpeedBase"] = j["SandFallSpeedBase"]
    for i in range(6):
        p["SandFallSpeedPhase"][i] = j[f"SandFallSpeedPhase0{i}"]
        p["SandFallIntervalPhase"][i] = j[f"SandFallIntervalPhase0{i}"]
    for i in range(3):
        p["SandFallCount"][i] = (j[f"SandFallCountPhase0{i}Min"], j[f"SandFallCountPhase0{i}Max"])
    return p


def phase(t, endless):
    t = F(t)
    bands = [(51.0, 60.0), (41.0, 51.0), (31.0, 41.0), (21.0, 31.0), (11.0, 21.0), (0.0, 11.0)]
    for i, (lo, hi) in enumerate(bands):
        if lo < t < hi:
            return 5 - i if endless else i
    return 6


COUNT_IDX = {False: [0, 0, 1, 1, 2, 2, 3], True: [2, 2, 1, 1, 0, 0, 3]}


def fall_frames(dur, dt=F(1.0 / 60.0)):
    t, k = F(0), 0
    while True:
        t = F(t + dt); k += 1
        if t >= dur:
            return k


def schedule(p, endless, start_remaining, frames=3600, dt=F(1.0 / 60.0)):
    """플레이어 없는 일정: 첫 OnGameMain 의 타이머 값을 start_remaining 으로 두고 dt 고정."""
    timer = F(start_remaining) if not endless else F(0)
    interval = F(0)
    out = []
    for f in range(frames):
        if not endless and timer <= 0:
            break
        interval = F(interval - dt)
        if interval < 0:
            ph = phase(timer, endless)
            lo, hi = p["SandFallCount"][COUNT_IDX[endless][ph]]
            spd = F(F(p["SandFallSpeedBase"]) + F(p["SandFallSpeedPhase"][ph]))
            out.append({"frame": f, "time": float(timer), "phase": ph, "count": [lo, hi], "speed": float(spd),
                        "fallSec": float(F(F(p["SandFallHeight"]) / spd))})
            interval = F(p["SandFallIntervalPhase"][ph])
        timer = F(timer - dt) if not endless else F(timer + dt)   # ComUiTimer TickUpdate 근사(호출 순서 미확정)
        if not endless and timer <= 0:
            timer = F(0)
    return out


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 12345
    p = effective_params()
    res = {"source": "tools/mgC_mg0107_calc.py", "effectiveParams": p, "phases": []}
    for ph in range(7):
        spd = F(F(p["SandFallSpeedBase"]) + F(p["SandFallSpeedPhase"][ph]))
        dur = F(F(p["SandFallHeight"]) / spd)
        res["phases"].append({
            "phase": ph, "speed": float(spd), "fallSec": float(dur), "fallFrames@60": fall_frames(dur),
            "interval": p["SandFallIntervalPhase"][ph],
            "countNormal": p["SandFallCount"][COUNT_IDX[False][ph]],
            "countEndless": p["SandFallCount"][COUNT_IDX[True][ph]],
        })
    res["phaseAt"] = {str(t): [phase(t, False), phase(t, True)] for t in
                      (60.0, 59.99, 51.0, 50.99, 41.0, 31.0, 21.0, 11.0, 10.99, 0.01, 0.0, 61.0, 120.0)}
    for tag, r0 in (("normal_first_at_60.0", 60.0), ("normal_first_at_59.983", 60.0 - 1.0 / 60.0)):
        s = schedule(p, False, r0)
        lo = sum(b["count"][0] for b in s); hi = sum(b["count"][1] for b in s)
        res[tag] = {"batches": len(s), "sandwichesMin": lo, "sandwichesMax": hi, "first5": s[:5], "last3": s[-3:]}
    e = schedule(p, True, 0.0, frames=60 * 90)
    res["endless_first_90s"] = {"batches": len(e), "sandwichesMin": sum(b["count"][0] for b in e),
                                "sandwichesMax": sum(b["count"][1] for b in e), "first5": e[:5]}
    sr = SyncRand(seed)
    types = [3] + [sr.rand_range(0, 4) for _ in range(215)]
    res["poolTypes"] = {"seed": seed, "first40": types[:40], "histogram": [types.count(i) for i in range(4)]}
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    for ph in res["phases"]:
        print(ph)
    print(res["phaseAt"])
    for k in ("normal_first_at_60.0", "normal_first_at_59.983", "endless_first_90s"):
        print(k, {kk: v for kk, v in res[k].items() if kk not in ("first5", "last3")})
    print("pool", res["poolTypes"]["histogram"], res["poolTypes"]["first40"][:12])
    print("->", OUT)


if __name__ == "__main__":
    main()
