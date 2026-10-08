"""광장(menu00) 플레이어 캐릭터 에셋 — charselect 와 같은 캐릭터 파이프라인(charsel_chara.convert)으로 22명 glb + motions.json + 몸·눈 셰이더 그래프 규칙.

클립 = 광장 액터가 쓰는 상주 모션 co_idle00·co_walk00·co_run00(액션 Idle/Walk/Run) + Player::Player 가 Sub 슬롯에 넣는 co_look02·co_nod00
[판독 docs/shell/plaza_3d.md §3.5] + 각 모션의 깜빡임 묶음. 모션 전이 = chara/mpat/sys_pc.mpat(menu00 전용 mpat 없음) 중 이 클립에 걸리는 항목.
중간 변환은 extracted/converted/plaza_player/<key> (charselect 의 extracted/converted/charsel 은 건드리지 않음).
출력: 모델·모션·텍스처 = 공용 web/assets/chara/(chara_shared.py, docs/engine/chara_assets.md), 명세 = web/assets/plaza/player/spec.json(경로는 이 폴더 기준 ../../chara/…)
usage: .venv/Scripts/python web/tools/analysis/plaza_player_assets.py [pcNN ...]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import charsel_chara  # noqa: E402

DST = ROOT / "web" / "assets" / "plaza" / "player"
CLIPS = ["co_idle00", "co_walk00", "co_run00", "co_look02", "co_nod00", "mn_bnclr_get00", "mn_bnclr_idle00"]
CHARLIST = ROOT / "extracted" / "bea" / "bq.nx.bea" / "common" / "data" / "characterlist.json"
MPAT = ROOT / "extracted" / "converted" / "scene" / "mpat.json"
CHARSEL_SPEC = ROOT / "web" / "assets" / "charselect" / "spec.json"


def main():
    charsel_chara.SRC = ROOT / "extracted" / "converted" / "plaza_player"
    only = set(sys.argv[1:])
    chars = json.loads(CHARLIST.read_text(encoding="utf-8-sig"))["PlayerCharacterData"]
    old = {}
    if (DST / "spec.json").exists():
        old = {c["pc"]: c for c in json.loads((DST / "spec.json").read_text(encoding="utf-8"))["chars"]}
    out = []
    for i, c in enumerate(chars):
        key = "pc%02d" % c["Number"]
        e = {"index": i, "btn": i, "pc": key, "label": c["text label"], "scale": c["IndividualScale"], "cam": [0, 0, 0], "fov": 30,
             "idle": "co_idle00", "lock": None, "glb": None, "height": c["height"], "bubbleRadius": c["bubble_radius"], "width": c["width"]}
        if only and key not in only and key in old:
            e.update({k: v for k, v in old[key].items() if k in ("glb", "motions", "anims", "clips", "eye", "albedo", "body")})
        else:
            e.update(charsel_chara.convert(key, CLIPS, DST, reuse=True))
        out.append(e)
    want = set(CLIPS)
    mp = json.loads(MPAT.read_text(encoding="utf-8"))["sys_pc.mpat"]["entries"]
    transit = [{"from": t["from"], "to": t["to"], "a": t["a"]} for t in mp
               if t["to"] in want and (t["from"] is None or t["from"] in want)]
    env = json.loads(CHARSEL_SPEC.read_text(encoding="utf-8"))["env"]
    spec = {"version": 1, "source": "plaza_player_assets.py", "clips": CLIPS, "transit": transit, "env": env, "chars": out}
    DST.mkdir(parents=True, exist_ok=True)
    (DST / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    print("spec:", len(out), "chars, transit", transit)


if __name__ == "__main__":
    main()
