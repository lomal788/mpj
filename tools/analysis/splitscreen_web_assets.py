"""분할 화면 분할선(web/script/lib/splitscreen·splitscreen-dom) 에셋 → web/assets/splitscreen/lines.json + 공용 그림.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/splitscreen_web_assets.py

근거: web/docs/engine/10_split_screen.md §6·§9. 원본 bq.nx.bea/Parts.lyt 의 sys_dividing_lines.bflyt 와 in/out/normal bflan 을
mg1801_web_ui.py 정리 함수(clean_layout·clean_anim) 그대로 싣는다. 그림 sys_dividing_line^s 는 common_shared 규칙(sys_ = 공용)으로
web/assets/common/tex/sys_dividing_line_s.png 에 쓰고 lines.json textures 에 상대 경로를 둔다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import common_shared as cs  # noqa: E402
import mg1801_web_ui as mu  # noqa: E402
import ui_lyt  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

PARTS = ROOT / "extracted" / "bea" / "bq.nx.bea" / "Parts.lyt"
DST = ROOT / "web" / "assets" / "splitscreen"
NAME = "sys_dividing_lines"
TAGS = ("in", "normal", "out")


def main():
    files = ui_sarc.read_files(str(PARTS))
    lay = ui_lyt.parse_bflyt(files[f"blyt/{NAME}.bflyt"])
    assert not lay["_check"], lay["_check"]
    anims = {}
    for t in TAGS:
        an = ui_lyt.parse_bflan(files[f"anim/{NAME}_{t}.bflan"])
        assert not an["_check"], (t, an["_check"])
        anims[t] = mu.clean_anim(an)
    lt = ui_render.LazyTextures()
    for data in files.values():
        if data[:4] == b"BNTX":
            lt.add_bntx(data)
    DST.mkdir(parents=True, exist_ok=True)
    textures = {}
    for tn in lay["textures"]:
        img = lt.get(tn)
        assert img is not None, tn
        fn = "tex/" + tn.replace("^", "_") + ".png"
        textures[tn] = cs.tex(tn, img, DST / fn, DST) or fn
    out = {"source": "web/tools/analysis/splitscreen_web_assets.py — bq.nx.bea/Parts.lyt, 근거 web/docs/engine/10_split_screen.md §6·§9",
           "layout": mu.clean_layout(lay), "anims": anims, "textures": textures}
    (DST / "lines.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("lines.json", (DST / "lines.json").stat().st_size, "B", textures)


if __name__ == "__main__":
    main()
