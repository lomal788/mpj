"""미니게임 3D 결과 무대(bq::MGResult) 웹 에셋 — docs/shell/minigame_result.md §12.

출력 web/assets/mgresult/:
  spec.json   list(mgResultList.json pattern·list 그대로), chara(resultCharaParam ResultData + characterlist 의 번호·이름·머리 값, CharacterID 순),
              pos(배치 모델 31개의 뼈: 이름·parent·T·R(EulerXYZ)), env(캐릭터 빛 = charselect spec env), clips, chars(Preview3D 명세)
  cam/<이름>.json  결과 카메라 95개(FSNB): base·곡선 원본 계수(frame·k0..k3·scale·offset·type·wrap). 프레임 굽기 없음(런타임이 Cubic 식으로 평가)
캐릭터 모델·모션·텍스처는 공용 web/assets/chara/(charsel_chara.convert → chara_shared.py, docs/engine/chara_assets.md).
이미 있는 공용 glb 는 이 변환기가 바꾸지 않는다(다른 내용이 나오면 되돌리고 알림 — pc52 fcl_blink00 은 클립 목록에 따라 빈 클립 유무만 다름). 원본(extracted/bea)은 읽기만. 중간 변환은 extracted/converted/mgresult_chara/<key>, 스크래치 json 은 extracted/converted/mgresult/.
뼈 = graphics_bfres2gltf dump, 카메라 = camera_probe cam (기존 판독기 그대로).
usage: .venv/Scripts/python web/tools/analysis/mgresult_web_assets.py [all|data|chara] [pcNN ...]
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import charsel_chara  # noqa: E402

BEA = ROOT / "extracted" / "bea"
SRC = BEA / "mg~mgResult.nx.bea" / "mg" / "mgResult"
DATA = BEA / "bq.nx.bea" / "common" / "data"
DST = ROOT / "web" / "assets" / "mgresult"
TMP = ROOT / "extracted" / "converted" / "mgresult"
TOOLS = ROOT / "web" / "tools" / "analysis"
DUMP_EXE = TOOLS / "graphics_bfres2gltf" / "bin" / "Release" / "net7.0" / "graphics_bfres2gltf.exe"
CAM_EXE = TOOLS / "camera_probe" / "bin" / "Release" / "net7.0" / "camera_probe.exe"
CHARSEL_SPEC = ROOT / "web" / "assets" / "charselect" / "spec.json"
CHARA = ROOT / "web" / "assets" / "chara"
CLIPS = ["co_idle00", "co_win00a", "co_win00b", "co_lose00a", "co_lose00b", "co_applause00", "co_walk00", "co_dice_idle00", "co_jump_dice01"]
HEAD_KEYS = ["head_min_x", "head_min_y", "head_min_z", "head_max_x", "head_max_y", "head_max_z", "head_weight"]
CAM_FIELD = ["near", "far", "aspect", "fovy", "posX", "posY", "posZ", "rotX", "rotY", "rotZ", "twist"]


def load_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def pos_models():
    files = sorted((SRC / "model").glob("pos_pc_*.fmdb"))
    out = TMP / "pos_dump.json"
    TMP.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(DUMP_EXE), "dump", str(out)] + [str(f) for f in files], check=True)
    res = {}
    for d in load_json(out):
        m = d["models"][0]
        sk = m["skeleton"]
        assert sk["rotation"] == "EulerXYZ", d["file"]
        bones = []
        for b in sk["bones"]:
            assert b["rotMode"] == "EulerXYZ" and b["S"] == [1, 1, 1], (d["file"], b["name"])
            bones.append({"name": b["name"], "parent": b["parent"], "T": b["T"], "R": b["R"][:3]})
        res[m["name"]] = bones
    print("pos models:", len(res))
    return res


def cameras():
    files = sorted((SRC / "env").glob("result_cam_*.fsnb"))
    out = TMP / "cam_dump.json"
    subprocess.run([str(CAM_EXE), "cam", str(out)] + [str(f) for f in files], check=True)
    (DST / "cam").mkdir(parents=True, exist_ok=True)
    names = []
    for d in load_json(out):
        stem = Path(d["file"]).stem
        cams = [c for s in d["scenes"] for c in s["cameras"]]
        assert len(cams) == 1, d["file"]
        c = cams[0]
        b = c["base"]
        curves = []
        for cv in c.get("curves", []):
            k = int(cv["animDataOffset"], 16) // 4
            curves.append({"field": CAM_FIELD[k], "type": cv["type"], "pre": cv["preWrap"], "post": cv["postWrap"],
                           "scale": cv["scale"], "offset": cv["offset"],
                           "frames": [x["frame"] for x in cv["keys"]], "keys": [x["k"] for x in cv["keys"]]})
        js = {"source": d["file"], "name": c["name"], "frames": c["frameCount"], "loop": c["loop"], "flags": c["flags"],
              "mode": c["rotationMode"], "projection": c["projection"],
              "base": {"near": b["near"], "far": b["far"], "aspect": b["aspect"], "fovy": b["fovyRad"], "pos": b["pos"], "aim": b["rotOrAim"], "twist": b["twist"]},
              "curves": curves}
        (DST / "cam" / (stem + ".json")).write_text(json.dumps(js, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        names.append(stem)
    print("cameras:", len(names))
    return names


def chara_param():
    rd = load_json(DATA / "resultCharaParam.json")["ResultData"]
    pcs = load_json(DATA / "characterlist.json")["PlayerCharacterData"]
    assert len(rd) == len(pcs)
    out = []
    for i, (r, c) in enumerate(zip(rd, pcs)):
        out.append({"id": i, "pc": "pc%02d" % c["Number"], "number": c["Number"], "name": c["charaname"],
                    "head": {k: c.get(k) for k in HEAD_KEYS}, **r})
    return out


def chars(only):
    charsel_chara.SRC = ROOT / "extracted" / "converted" / "mgresult_chara"
    pcs = load_json(DATA / "characterlist.json")["PlayerCharacterData"]
    old = {}
    if (DST / "spec.json").exists():
        old = {c["pc"]: c for c in load_json(DST / "spec.json").get("chars", [])}
    out = []
    for i, c in enumerate(pcs):
        key = "pc%02d" % c["Number"]
        e = {"index": i, "btn": i, "pc": key, "label": c["text label"], "scale": c["IndividualScale"], "cam": [0, 0, 0], "fov": 30,
             "idle": "co_idle00", "lock": None, "glb": None}
        if only is not None and key not in only and key in old:
            e.update({k: v for k, v in old[key].items() if k in ("glb", "motions", "anims", "clips", "eye", "albedo", "body")})
        else:
            base = CHARA / key
            snap = {p: p.read_bytes() for p in base.rglob("*.glb")} if base.exists() else {}
            e.update(charsel_chara.convert(key, CLIPS, DST, reuse=True))
            for p, b in snap.items():
                if p.read_bytes() != b:
                    p.write_bytes(b)
                    print("  공용 파일 유지(이 변환기 결과로 덮지 않음): chara/%s" % p.relative_to(CHARA).as_posix())
        out.append(e)
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    only = set(sys.argv[2:]) or None
    DST.mkdir(parents=True, exist_ok=True)
    spec = load_json(DST / "spec.json") if (DST / "spec.json").exists() else {}
    if mode in ("all", "data"):
        lst = load_json(SRC / "data" / "mgResultList.json")
        spec.update({"version": 1, "source": "mgresult_web_assets.py", "list": lst, "chara": chara_param(), "pos": pos_models(),
                     "cams": cameras(), "env": load_json(CHARSEL_SPEC)["env"], "clips": CLIPS})
    if mode in ("all", "chara"):
        spec["chars"] = chars(only)
    order = ["version", "source", "clips", "env", "list", "chara", "pos", "cams", "chars"]
    spec = {k: spec[k] for k in order if k in spec}
    (DST / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    print("spec:", DST / "spec.json", len(spec.get("chars", [])), "chars")


if __name__ == "__main__":
    main()
