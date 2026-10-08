"""광장 대기실 카드 뷰어(bq::ComUiCardViewer) 에셋 → web/assets/plaza/ui/plaza_card.json + tex/pc/ (글꼴 = 공용 assets/font/, font_web_assets.py).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/plaza_card_assets.py

근거: web/docs/shell/online.md 5.8. plaza_ui_assets.py 와 같은 방식(mgmcommon Bundle·partyrule need_closure 재사용).
  layouts   bq Parts: sys_card_base_00(+부품 sys_card_cursor_01·sys_card_carddesign_00·sys_card_sticker_00·sys_card_status_00·sys_icon_rank_00)
            공용 spec.json·online.json·plaza_ui.json 에 이미 있는 레이아웃은 넣지 않는다
  textures  레이아웃 텍스처 + cardDesignList bgTextureName 전부 + 랭크 아이콘 sys_icon_rank_%02d^q [데이터 Parts BNTX]
  designs   cardDesignList.json(배열 번호 = CardDesignID) [데이터]
  texts     mn03_card_ui_*·im_achieve401_name·sys_ctrl_back·mn01_friend_ctrl_lobby_card
  fonts     이 묶음 레이아웃 글꼴을 공용·온라인·광장 UI·이 묶음 문구 글자로 다시 만든 것(mergeSpec fonts 덮어쓰기 — 이 묶음을 마지막에 합친다)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import font_web_assets as fw  # noqa: E402
import mgmcommon_web_assets as mc  # noqa: E402
import online_web_assets as ow  # noqa: E402
import partyrule_web_assets as pr  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "plaza" / "ui"
PARTS_ROOTS = ["sys_card_base_00"]
DESIGN_LIST = BEA / "bq.nx.bea" / "common" / "data" / "cardDesignList.json"
LABELS = {"mn03_card_ui_achieve", "mn03_card_ui_name", "mn03_card_ui_time", "mn03_card_ui_time_title", "im_achieve401_name",
          "sys_ctrl_back", "mn01_friend_ctrl_lobby_card"}


def main():
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    common = json.loads((mc.DST / "spec.json").read_text(encoding="utf-8"))
    online = json.loads((ow.DST / "online.json").read_text(encoding="utf-8"))
    plaza = json.loads((DST / "plaza_ui.json").read_text(encoding="utf-8"))
    have = set(common["layouts"]) | set(online["layouts"]) | set(plaza["layouts"])

    found = pr.need_closure(PARTS_ROOTS, [("parts", parts)], have)
    b = mc.Bundle("plaza_card", [parts])
    b.convert(parts, sorted(found["parts"]))
    print("layouts", sorted(found["parts"]))
    print("split origin fix", pr.split_origin_fix(b))

    designs = json.loads(DESIGN_LIST.read_text(encoding="utf-8-sig"))["cardDesignList"]
    names = {t.split("^")[0]: t for t in b.lt.names()}
    for d in designs:
        tn = names.get(d["bgTextureName"])
        if tn:
            b.tex_names.add(tn)
        else:
            print("  디자인 텍스처 없음", d["bgTextureName"])
    for r in range(0, 100):
        tn = f"sys_icon_rank_{r:02d}^q"
        if tn in b.lt.src:
            b.tex_names.add(tn)
    common_dst = mc.DST
    mc.DST = DST
    tex, srgb, miss = b.write_textures("pc")
    mc.DST = common_dst
    textures = {k: "../plaza/ui/" + v for k, v in tex.items()}
    design_tex = [names.get(d["bgTextureName"], d["bgTextureName"]) for d in designs]
    ranks = sorted(k for k in textures if k.startswith("sys_icon_rank_"))

    msg = mc.cw.messages()
    texts = {k: msg[k] for k in sorted(LABELS) if k in msg}

    default_texts = ""
    fams = set()
    for lay in b.layouts.values():
        for n in lay["nodes"]:
            if n.get("txt"):
                fams.add(n["txt"]["font"])
                default_texts += n["txt"].get("text", "")
    for lay in plaza["layouts"].values():
        for n in lay["nodes"]:
            if n.get("txt"):
                default_texts += n["txt"].get("text", "")
    fams |= {"bqfont_small", "bqfont_small_shadow", "bqfont_middle", "bqfont_middle_shadow"}
    fams = {f for f in fams if not f.startswith("bqfont_large")}
    every = list(common["texts"].values()) + list(online["texts"].values()) + list(plaza["texts"].values()) + list(texts.values())
    text_set = "".join(ow.TAG.sub("", v) for v in every)
    text_set += default_texts + "0123456789/:-+.,!? ()%" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    for stem, keys in mc.GLYPH_ONLY.items():
        src = json.loads((mc.cw.MSG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        text_set += "".join(ow.TAG.sub("", src.get(k, "")) for k in keys)
    cpx = mc.cw.fcpx_fonts()
    fonts = {}
    for fam in sorted(fams):
        if not cpx.get(fam):
            print("  글꼴 없음", fam)
            continue
        fonts[fam] = fw.font_ref(fam, text_set)
        print(fam, len(fonts[fam]["chars"]), "chars")

    part = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/plaza_card_assets.py, 명세 web/docs/shell/online.md 5.8",
            "textures": textures, "srgb": srgb, "layouts": b.layouts, "split": b.split, "zabuton": b.zabuton, "lineSpace": b.line_space,
            "fonts": fonts, "texts": texts, "msgAttr": {}, "sounds": {}, "missingTextures": miss,
            "designs": design_tex, "ranks": ranks}
    (DST / "plaza_card.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("plaza_card.json", (DST / "plaza_card.json").stat().st_size, "B", len(b.layouts), "layouts", len(textures), "textures, 없음", miss)
    print("designs", design_tex, "ranks", len(ranks), "texts", sorted(texts))


if __name__ == "__main__":
    main()
