"""mg1801 웹 에셋(모델) 만들기 — extracted/converted/graphics/mg1801(그래픽 담당 변환물) → web/assets/mg1801/model, tex.

  c:/dev/mpj/.venv/Scripts/python tools/mg1801_web_models.py

- 화면이 쓰는 glb 만 복사한다. glb 의 이미지 uri 는 '../tex/<이름>' 이라 model/·tex/ 를 나란히 두면 그대로 맞는다(검사함).
- 텍스처는 고른 glb 가 참조하는 png 만 복사한다. 원본 이미지는 바이트 그대로 복사하고 고치지 않는다.
- HDR(.hdr)은 장면 IBL 큐브(env 컨테이너 mg1801_env 의 bg00_irr/rad·cha_irr/rad, 07_camera_lighting.md 7.4)를 복사한다.
- glb 이미지에 없는 재질 텍스처(extras.fres.samplers)도 복사한다: 라이트맵(gi_diffuse_texture2d), 국소 반사 큐브
  (local_specular_texturecube), 셰이더 그래프 입력(sg_utility_texture2d*). BC6H 는 .hdr, 그 밖은 png(변환 메타 hdrFiles/files 그대로).
  이 텍스처들의 파일 목록·sRGB 여부는 model/textures.json 에 적는다(화면이 hdr/png 를 고를 때 404 를 내지 않게).
- 재질 애니 mg1801_water00.fmab(변환기 anim JSON, 프레임별 값)도 model/ 에 복사한다(MapImpl 이 water00 에 모션을 붙인다).
- arrow00 은 연습 화살표(mg1801::Player::Player @0x710000b130 이 RmPracticeArrowMan::SetMgCustomizeModel 로 고른다). 30프레임 반복 클립 포함.
- 빼는 모델: line00(MapImpl 이 만들지 않음), line01(Params.isLineDraw 기본 0), stool00(STOOLS 표에 없음).
"""
import json
import shutil
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "extracted" / "converted" / "graphics" / "mg1801"
DST = ROOT / "web" / "assets" / "mg1801"

PIECES = {0: 2, 1: 3, 2: 4, 3: 5, 4: 2}
MODELS = (
    [f"mg1801_obj0{t}" for t in PIECES]
    + [f"mg1801_obj0{t}_{i}" for t, n in PIECES.items() for i in range(n)]
    + [f"mg1801_obj0{t}_outline00" for t in PIECES]
    + ["mg1801_bg00", "mg1801_floor00", "mg1801_water00", "mg1801_knife00", "mg1801_stool_npc00", "mg1801_result00", "mg1801_arrow00"]
    + [f"mg1801_stool0{i}" for i in (1, 2, 3)]
    + [f"mg1801_soup0{i}" for i in range(4)]
)
ANIMS = ["mg1801_water00.fmab.json"]
ENV_CUBES = ["mg1801_bg00_irr", "mg1801_bg00_rad", "mg1801_cha_irr", "mg1801_cha_rad"]
EXTRA_SLOTS = ("gi_diffuse_texture2d", "local_specular_texturecube")


def glb_json(path: Path) -> dict:
    b = path.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20 : 20 + n])


def texture_entry(name: str) -> dict:
    """변환 메타의 파일 목록: BC6H(HDR)면 .hdr, 아니면 png"""
    meta = json.loads((SRC / "tex" / f"{name}.json").read_text(encoding="utf-8"))
    return {"files": list(meta.get("hdrFiles") or meta["files"]), "srgb": bool(meta.get("srgb")), "cube": meta.get("viewDim") == "Cube"}


def extra_textures(j: dict, index: dict) -> None:
    for m in j.get("materials", []):
        for smp in m.get("extras", {}).get("fres", {}).get("samplers", []):
            if any(sl in EXTRA_SLOTS or sl.startswith("sg_utility_texture2d") for sl in smp["slots"]):
                index[smp["texture"]] = texture_entry(smp["texture"])


def main():
    out_model = DST / "model"
    out_tex = DST / "tex"
    for d in (out_model, out_tex):
        d.mkdir(parents=True, exist_ok=True)
        for old in d.iterdir():
            if old.is_file():
                old.unlink()
    images = set()
    index = {}
    total = 0
    rows = []
    for name in MODELS:
        src = SRC / "model" / f"{name}.glb"
        j = glb_json(src)
        for img in j.get("images", []):
            uri = img.get("uri")
            if uri is None:
                continue
            if not uri.startswith("../tex/"):
                raise SystemExit(f"{name}: 상대경로가 아닌 이미지 uri {uri}")
            images.add(uri[len("../tex/") :])
        extra_textures(j, index)
        shutil.copyfile(src, out_model / src.name)
        total += src.stat().st_size
        rows.append((f"model/{src.name}", src.stat().st_size))
    for a in ANIMS:
        src = SRC / "anim" / a
        shutil.copyfile(src, out_model / a)
        total += src.stat().st_size
        rows.append((f"model/{a}", src.stat().st_size))
    for c in ENV_CUBES:
        index[c] = texture_entry(c)
    extra = {f for e in index.values() for f in e["files"]} - images
    (out_model / "textures.json").write_text(json.dumps(dict(sorted(index.items())), indent=1, ensure_ascii=False), encoding="utf-8")
    for img in sorted(images) + sorted(extra):
        src = SRC / "tex" / img
        if not src.exists():
            raise SystemExit(f"텍스처 없음 {img}")
        shutil.copyfile(src, out_tex / img)
        total += src.stat().st_size
        rows.append((f"tex/{img}", src.stat().st_size))
    rows.sort(key=lambda r: -r[1])
    for path, size in rows:
        print(f"{size / 1024:9.1f} KB  {path}")
    print(f"모델 {len(MODELS)}개, 텍스처 {len(images)}개 + 재질·환경 추가 {len(extra)}개, 합계 {total / 1024 / 1024:.2f} MB → {DST}")


if __name__ == "__main__":
    main()
