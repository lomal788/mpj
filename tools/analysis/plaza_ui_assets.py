"""광장(menu00) 2D UI(web/script/app/scene/world/plaza/ui) 에셋 → web/assets/plaza/ui/plaza_ui.json + tex/ + sound/ (글꼴 = 공용 assets/font/, font_web_assets.py).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/plaza_ui_assets.py [임시 폴더]

근거: web/docs/shell/plaza_3d.md 5.1절. online_web_assets.py 와 같은 방식(mgmcommon Bundle·partyrule need_closure 재사용).
  layouts   menu_common: mncom_base_status_00·mncom_status_00·mncom_status_01, menu00: mn00_text_plaza_00·mn00_friend_guide_00,
            bq Parts: sys_guide_pop_00·sys_stamp_base_00·sys_stamp_guide_00·sys_stamp_list_00·sys_stamp_list_01·stamp_00(+부품)
            공용 spec.json·online.json 에 이미 있는 레이아웃은 넣지 않는다(화면이 셋을 합쳐 쓴다)
  textures  레이아웃 텍스처 + 스탬프 그림 stamp_%02d%03d(캐릭터 스탬프 22명×3 + 해금 그룹 −1 공용 스탬프) [데이터 Parts BNTX]
  stamps    stampList.json StampData(배열 번호 = StampID) + StampShortcutData(Bd·Menu Number → StampID)
  texts     stamp.json 전체, im_mn_*_name/detail·im_mn02~06_name·im_mode19_name, mn00_mainMenu_ui_*·mn00_mainMenu_ctrl_look·
            mn01_mainMenu_ctrl_friend_*, im_guest00_name
  fonts     이 묶음 레이아웃 글꼴을 공용·온라인·이 화면 문구 글자로 다시 만든 것(mergeSpec fonts 덮어쓰기)
  sounds    SQ_SE_STAMP_1P~4P·SQ_SE_STAMP_PC·SQ_SE_SYS_CURSOR_S(공용·온라인 명세에 없는 것) — sound_seq.py 렌더 [근사]
여러 화면 공용 그림·효과음은 web/assets/common/ 을 mgmcommon 기준 ../common/… 로 가리킨다(common_shared.py, docs/engine/common_assets.md).
"""
import json
import subprocess
import sys
import tempfile
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
LYT = {
    "menu_common": BEA / "menu~menu_common.nx.bea" / "menu" / "menu_common" / "layout.lyt",
    "menu00": BEA / "menu~menu00.nx.bea" / "menu" / "menu00" / "layout.lyt",
}
ROOTS = ["mncom_base_status_00", "mncom_status_00", "mncom_status_01", "mn00_text_plaza_00", "mn00_friend_guide_00"]
PARTS_ROOTS = ["sys_guide_pop_00", "sys_stamp_base_00", "sys_stamp_guide_00", "sys_stamp_list_00", "sys_stamp_list_01", "stamp_00"]
STAMP_LIST = BEA / "bq.nx.bea" / "common" / "data" / "stampList.json"
PC_NUM = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12", "13", "14", "50", "51", "52", "53", "54", "56", "58", "61", "62"]
SE = {
    "SQ_SE_STAMP_1P": "[판독] plaza_3d.md 5.1 ② 말풍선 FUN_71003589c0 SQ_SE_STAMP_%dP",
    "SQ_SE_STAMP_2P": "[판독] 같음",
    "SQ_SE_STAMP_3P": "[판독] 같음",
    "SQ_SE_STAMP_4P": "[판독] 같음",
    "SQ_SE_STAMP_PC": "[판독] 같음(원격·플레이어 없음)",
    "SQ_SE_SYS_CURSOR_S": "[판독] 스탬프 목록 칸 이동 FUN_710035d22c",
}
LABELS = {"im_guest00_name", "im_mode19_name", "mn00_mainMenu_ui_name", "mn00_mainMenu_ui_detail", "mn00_mainMenu_ctrl_look",
          "mn01_mainMenu_ctrl_friend_btn", "mn01_mainMenu_ctrl_friend_text"}


def stamp_data():
    d = json.loads(STAMP_LIST.read_text(encoding="utf-8-sig"))
    rows = d["StampData"]
    by_num = {r["Number"]: i for i, r in enumerate(rows)}
    stamps = [{"id": i, "number": r["Number"], "type": r["Type"], "layout": Path(r["LayoutName"]).stem, "texture": r["TextureName"],
               "label": r["Stamp_MessageLabel"], "listLabel": r["StampList_MessageLabel"],
               "color": [r["TextColorR"], r["TextColorG"], r["TextColorB"]], "valid": r["Valid"], "price": r["Price"], "unlock": r["UnlockGroup"]}
              for i, r in enumerate(rows)]
    sc = d["StampShortcutData"]
    shortcuts = {"menu": [by_num[s["MenuNumber"]] for s in sc], "bd": [by_num[s["BdNumber"]] for s in sc]}
    return stamps, shortcuts


def stamp_textures(stamps):
    """말풍선·목록 아이콘에 쓰는 텍스처 이름(Parts BNTX 이름 = <TextureName 의 앞 6자 + 캐릭터 2자리 + 번호 3자리>^u) [데이터]"""
    out = set()
    for s in stamps:
        if s["unlock"] != -1:
            continue
        if s["type"] == "PC":
            k = s["number"] % 1000
            out |= {f"stamp_{pc}{k:03d}^u" for pc in PC_NUM}
        else:
            out.add(f"{s['texture']}^u")
    return out


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    for sub in ("sound",):
        (DST / sub).mkdir(parents=True, exist_ok=True)
    files = {k: ui_sarc.read_files(str(p)) for k, p in LYT.items()}
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    common = json.loads((mc.DST / "spec.json").read_text(encoding="utf-8"))
    online = json.loads((ow.DST / "online.json").read_text(encoding="utf-8"))
    have = set(common["layouts"]) | set(online["layouts"])

    order = [(k, files[k]) for k in ("menu_common", "menu00")] + [("parts", parts)]
    found = pr.need_closure(ROOTS, order, have)
    found_p = pr.need_closure(PARTS_ROOTS, [("parts", parts)], have)
    for n in found_p.get("parts", []):
        if n not in found.setdefault("parts", []):
            found["parts"].append(n)
    b = mc.Bundle("plaza_ui", [f for _, f in order])
    for key, src in order:
        if found.get(key):
            b.convert(src, sorted(found[key]))
    print("layouts", {k: sorted(v) for k, v in found.items()})
    print("split origin fix", pr.split_origin_fix(b))

    stamps, shortcuts = stamp_data()
    b.tex_names |= stamp_textures(stamps)
    common_dst = mc.DST
    mc.DST = DST
    tex, srgb, miss = b.write_textures("pu")
    mc.DST = common_dst
    textures = {k: v if v.startswith("../") else "../plaza/ui/" + v for k, v in tex.items()}

    msg = mc.cw.messages()
    stamp_msg = json.loads((mc.cw.MSG_DIR / "stamp.json").read_text(encoding="utf-8"))
    im_menu = json.loads((mc.cw.MSG_DIR / "im_menu.json").read_text(encoding="utf-8"))
    labels = set(stamp_msg) | LABELS | {k for k in im_menu if k.startswith("im_mn")}
    labels |= {f"im_mn0{n}_name" for n in range(2, 7)}
    texts = {k: msg[k] for k in sorted(labels) if k in msg}

    default_texts = ""
    fams = set()
    for lay in b.layouts.values():
        for n in lay["nodes"]:
            if n.get("txt"):
                fams.add(n["txt"]["font"])
                default_texts += n["txt"].get("text", "")
    fams |= {"bqfont_small", "bqfont_small_shadow", "bqfont_middle", "bqfont_middle_shadow"}
    fams = {f for f in fams if not f.startswith("bqfont_large")}
    text_set = "".join(ow.TAG.sub("", v) for v in list(common["texts"].values()) + list(online["texts"].values()) + list(texts.values()))
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

    from sound_fsar import Fsar
    fs = Fsar(mc.FSPJ)
    sounds = {}
    for label, ev in SE.items():
        if label in common.get("sounds", {}) or label in online.get("sounds", {}):
            continue
        out = tmp / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(mc.FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(label, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        if not out.exists():
            continue
        f = mc.cs.sound(label, out, DST / "sound" / f"{label}.wav", mc.SPEC_BASE) or f"../plaza/ui/sound/{label}.wav"
        vol = fs.find(label)["volume"]
        sounds[label] = {"file": f, "gain": round(vol / 127, 4),
                         "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}

    part = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/plaza_ui_assets.py, 명세 web/docs/shell/plaza_3d.md 5.1",
            "textures": textures, "srgb": srgb, "layouts": b.layouts, "split": b.split, "zabuton": b.zabuton, "lineSpace": b.line_space,
            "fonts": fonts, "texts": texts, "msgAttr": {}, "sounds": sounds, "missingTextures": miss,
            "stamps": stamps, "stampShortcuts": shortcuts, "pcNumber": PC_NUM}
    (DST / "plaza_ui.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("plaza_ui.json", (DST / "plaza_ui.json").stat().st_size, "B", len(b.layouts), "layouts", len(textures), "textures, 없음", miss)
    print("texts", len(texts), "sounds", len(sounds), "stamps", len(stamps), "shortcuts", shortcuts)


if __name__ == "__main__":
    main()
