"""프리 플레이 미니게임 썸네일 — 공용 UI 텍스처(bq.nx.bea Parts.lyt timg/__Combined.bntx)의 `<MGList 이름>^o` 112장 + 잠금 자리 `mgboss^o` 를 원본 그대로 PNG 로 옮기고, 모드 명세 조각을 만든다.
근거: docs/shell/mgm01_freeplay.md 7.1(UiSharedTextureModule::GetThumbnail(id, 0) = "%s^o", 없으면 "mg0101^o"; 자리 = "mgboss^o").
  .venv/Scripts/python web/tools/analysis/mgm01_thumb_assets.py  → web/assets/mgm01/thumb/*.png, web/assets/mgm01/thumbs.json
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import graphics_bntx  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
PARTS = ROOT / "extracted" / "bea" / "bq.nx.bea" / "Parts.lyt"
CATALOG = ROOT / "web" / "assets" / "mgm01" / "catalog.json"
DST = ROOT / "web" / "assets" / "mgm01"
PLACEHOLDER = "mgboss^o"


def main():
    names = [g["name"] for g in json.loads(CATALOG.read_text(encoding="utf-8"))["games"]]
    want = [n + "^o" for n in names] + [PLACEHOLDER]
    files = ui_sarc.read_files(str(PARTS))
    lt = ui_render.LazyTextures()
    meta = {}
    for fn, data in files.items():
        if data[:4] != b"BNTX":
            continue
        lt.add_bntx(data)
        for t in graphics_bntx.parse(data):
            if t.name in want:
                m = graphics_bntx.meta(t)
                meta[t.name] = {"file": fn, "w": m["width"], "h": m["height"], "format": m["format"], "srgb": m["srgb"]}
    missing = [n for n in want if n not in meta]
    if missing:
        raise SystemExit(f"썸네일 없음: {missing}")
    (DST / "thumb").mkdir(parents=True, exist_ok=True)
    textures = {}
    for n in want:
        img = lt.get(n)
        if img is None:
            raise SystemExit(f"디코드 실패: {n}")
        rel = "thumb/" + n.replace("^", "_") + ".png"
        img.save(DST / rel, optimize=True)
        textures[n] = "../mgm01/" + rel
    part = {
        "version": 1,
        "screen": [1920, 1080],
        "source": "Super Mario Party Jamboree US v0 — bq.nx.bea Parts.lyt timg 의 미니게임 썸네일, web/tools/analysis/mgm01_thumb_assets.py",
        "textures": textures,
        "srgb": sorted(n for n in want if meta[n]["srgb"]),
        "layouts": {},
        "split": {},
        "zabuton": {},
        "lineSpace": {},
    }
    (DST / "thumbs.json").write_text(json.dumps(part, ensure_ascii=False, indent=1), encoding="utf-8")
    sizes = {}
    for n in want:
        k = (meta[n]["w"], meta[n]["h"], meta[n]["format"], meta[n]["srgb"], meta[n]["file"])
        sizes[k] = sizes.get(k, 0) + 1
    for k, c in sorted(sizes.items(), key=lambda kv: -kv[1]):
        print(f"{c}장 {k[0]}x{k[1]} {k[2]} srgb={k[3]} ({k[4]})")
    print(DST / "thumbs.json", len(textures))


if __name__ == "__main__":
    main()
