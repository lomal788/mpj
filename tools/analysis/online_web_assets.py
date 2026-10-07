"""온라인 멀티 화면(web/script/shell/online) 에셋 → web/assets/online/online.json + tex/ + font/ + sound/.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/online_web_assets.py [임시 폴더]

근거: web/docs/shell/online.md 2·7·9절. partyrule_web_assets.py 와 같은 방식(mgmcommon Bundle = charsel·modesel 변환 함수 재사용).
  layouts   menu00: mn00_friend_bg_00·mn00_friend_base_set_00·mn00_friend_base_num_00·mn00_room_search_00·mn00_room_info_00·mn00_base_lobby_00(+부품)
            matching00: matching00_bg_00·matching00_tlp_00·matching00_base_member_00·matching00_win_member_00(+부품)
            menu01: mn01_base_opponent_00(+부품), bq Parts: sys_dialog_00·sys_notice_00·sys_notice_01·sys_tlp_loading_00·sys_timer_00(+부품)
  fonts     공용 명세와 같은 이름의 글꼴을 공용 문구 + 이 화면 문구 + 레이아웃 기본 문구 글자로 다시 만든 것(mergeSpec fonts 덮어쓰기)
  texts     menu01_main 의 mn01_friend_*·mn01_mainMenu_ctrl_friend_*, menu01_mode 의 mn01_bd_ui_match_*·mn01_mode_ui_match_only·mn01_bd_mw_match,
            matching00 전체, system 의 sys_error_*·sys_notice_*·sys_network_*·sys_swkbd_*·sys_ctrl_back·sys_rtt_error_tlp
  sounds    online.md 7절 SE(공용 명세에 없는 것만) — sound_seq.py 렌더 [근사, 공용과 같은 방식]
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import mgmcommon_web_assets as mc  # noqa: E402
import partyrule_web_assets as pr  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "online"
LYT = {
    "menu00": BEA / "menu~menu00.nx.bea" / "menu" / "menu00" / "layout.lyt",
    "matching00": BEA / "flow~matching00.nx.bea" / "flow" / "matching00" / "layout.lyt",
    "menu01": BEA / "menu~menu01.nx.bea" / "menu" / "menu01" / "layout.lyt",
    "menu_common": BEA / "menu~menu_common.nx.bea" / "menu" / "menu_common" / "layout.lyt",
}
ROOTS = ["mn00_friend_bg_00", "mn00_friend_base_set_00", "mn00_friend_base_num_00", "mn00_room_search_00", "mn00_room_info_00",
         "mn00_base_lobby_00", "matching00_bg_00", "matching00_tlp_00", "matching00_base_member_00", "matching00_win_member_00",
         "mn01_base_opponent_00"]
PARTS_ROOTS = ["sys_dialog_00", "sys_notice_00", "sys_notice_01", "sys_tlp_loading_00", "sys_timer_00"]
SE = {
    "SQ_SE_SYS_DECI_LR": "[판독] online.md 5.3 방 목록 탭 바꾸기",
    "SQ_SE_SYS_CANCEL_S": "[판독] online.md 4.5 방 정보 닫기",
    "SQ_SE_SYS_DECI_L": "[판독] online.md 5.7 매칭 취소 확인 '돌아간다'",
    "SQ_SE_SYS_ONLIN_PLY_RNDMATCH": "[판독] online.md 5.7 매칭 성공",
    "SQ_SE_MATCHING00_MBR_LST": "[판독] online.md 3.2 참가자 목록",
    "SQ_SE_MATCHING00_BD_RULE": "[판독] online.md 3.2 규칙 표시",
    "SQ_SE_MENU00_TRANSITION_WHO": "[판독] online.md 5.6 방장 출발",
    "SQ_SE_SYS_NOTICE": "[판독] online.md 9.3 정정 알림 열기 FUN_71002537b0",
}
TAG = re.compile(r"\[\d+:\d+:[0-9a-f]*\]")
SYS_LABEL = re.compile(r"^sys_(error_|notice_|network_|swkbd_|ctrl_back$|rtt_error_tlp$)")


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    for sub in ("font", "sound"):
        (DST / sub).mkdir(parents=True, exist_ok=True)
    files = {k: ui_sarc.read_files(str(p)) for k, p in LYT.items()}
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    common = json.loads((mc.DST / "spec.json").read_text(encoding="utf-8"))
    have = set(common["layouts"])

    order = [(k, files[k]) for k in ("menu00", "matching00", "menu01", "menu_common")] + [("parts", parts)]
    found = pr.need_closure(ROOTS, order, have)
    found_p = pr.need_closure(PARTS_ROOTS, [("parts", parts)], have)
    for n in found_p.get("parts", []):
        if n not in found.setdefault("parts", []):
            found["parts"].append(n)
    b = mc.Bundle("online", [f for _, f in order])
    for key, src in order:
        if found.get(key):
            b.convert(src, sorted(found[key]))
    print("layouts", {k: len(v) for k, v in found.items()})
    print("split origin fix", pr.split_origin_fix(b))

    common_dst = mc.DST
    mc.DST = DST
    tex, srgb, miss = b.write_textures("on")
    mc.DST = common_dst
    textures = {k: "../online/" + v for k, v in tex.items()}

    msg = mc.cw.messages()
    mj = {s: json.loads((mc.cw.MSG_DIR / f"{s}.json").read_text(encoding="utf-8")) for s in ("menu01_main", "menu01_mode", "matching00", "system")}
    labels = {k for k in mj["menu01_main"] if k.startswith("mn01_friend_") or k.startswith("mn01_mainMenu_ctrl_friend")}
    labels |= {k for k in mj["menu01_mode"] if k.startswith("mn01_bd_ui_match_")} | {"mn01_mode_ui_match_only", "mn01_bd_mw_match"}
    labels |= set(mj["matching00"]) | {k for k in mj["system"] if SYS_LABEL.match(k)}
    texts = {k: msg[k] for k in sorted(labels) if k in msg}
    mc.ATR_FILES = ["menu01_main", "system"]
    attrs, _ = mc.msg_attrs({k for k in texts if "_mw_" in k or k.startswith("sys_")})

    default_texts = ""
    fams = set()
    for lay in b.layouts.values():
        for n in lay["nodes"]:
            if n.get("txt"):
                fams.add(n["txt"]["font"])
                default_texts += n["txt"].get("text", "")
    fams |= {"bqfont_small", "bqfont_small_shadow", "bqfont_middle", "bqfont_middle_shadow"}
    fams = {f for f in fams if not f.startswith("bqfont_large")}
    text_set = "".join(TAG.sub("", v) for v in list(common["texts"].values()) + list(texts.values()))
    text_set += default_texts + "0123456789/:-+.,!? ()%"
    for stem, keys in mc.GLYPH_ONLY.items():
        src = json.loads((mc.cw.MSG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        text_set += "".join(TAG.sub("", src.get(k, "")) for k in keys)
    cpx = mc.cw.fcpx_fonts()
    fonts = {}
    for fam in sorted(fams):
        if not cpx.get(fam):
            print("  글꼴 없음", fam)
            continue
        img, meta = mc.cw.build_atlas(fam, cpx[fam], text_set)
        img.save(DST / meta["image"], optimize=True)
        meta["image"] = "../online/" + meta["image"]
        fonts[fam] = meta
        print(fam, len(meta["glyphs"]), "glyphs", img.size)

    # 큰 글꼴: 공용 큰 글꼴 글자 + 이 화면 큰 글꼴 페인 문구(mn00_friend_base_set_00 x_text_title = 프렌드 매치) — 공용 글꼴을 덮어쓰므로 공용 글자를 모두 넣는다
    large_text = TAG.sub("", texts.get("mn01_friend_ui_start_title", ""))
    for fam in ("bqfont_large",):
        if not cpx.get(fam) or fam not in common["fonts"]:
            continue
        img, meta = mc.cw.build_atlas(fam, cpx[fam], "".join(common["fonts"][fam]["glyphs"].keys()) + large_text)
        img.save(DST / meta["image"], optimize=True)
        meta["image"] = "../online/" + meta["image"]
        fonts[fam] = meta
        print(fam, len(meta["glyphs"]), "glyphs", img.size)

    from sound_fsar import Fsar
    fs = Fsar(mc.FSPJ)
    sounds = {}
    for label, ev in SE.items():
        if label in common.get("sounds", {}):
            continue
        out = tmp / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(mc.FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(label, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        if not out.exists():
            continue
        shutil.copyfile(out, DST / "sound" / f"{label}.wav")
        vol = fs.find(label)["volume"]
        sounds[label] = {"file": f"../online/sound/{label}.wav", "gain": round(vol / 127, 4),
                         "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}

    part = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/online_web_assets.py, 명세 web/docs/shell/online.md 9",
            "textures": textures, "srgb": srgb, "layouts": b.layouts, "split": b.split, "zabuton": b.zabuton, "lineSpace": b.line_space,
            "fonts": fonts, "texts": texts, "msgAttr": attrs, "sounds": sounds, "missingTextures": miss}
    (DST / "online.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("online.json", (DST / "online.json").stat().st_size, "B", len(b.layouts), "layouts", len(textures), "textures, 없음", miss)
    print("texts", len(texts), "attrs", len(attrs), "sounds", len(sounds))


if __name__ == "__main__":
    main()
