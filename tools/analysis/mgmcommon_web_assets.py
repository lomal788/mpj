"""미니게임 모드 공용 UI(독립 모듈 web/script/shell/mgmcommon) 에셋 — mgm00·mgmet·mgm01 레이아웃 + bq Parts 메시지 창·안내 → web/assets/mgmcommon.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/mgmcommon_web_assets.py [임시 폴더]

근거: web/docs/shell/mgm_common.md 9.6, message_window.md 9.4. 레이아웃·폰트 명세 형식은 charselect 와 같고(charsel_web_assets.py 의 변환 함수),
창 9조각 분할·흐림 창(BexZabutonBlurred)은 modesel_web_assets.py 의 convert/split_windows 를 그대로 쓴다. 출력:
  spec.json   공용 묶음 = mgm00 20 레이아웃 + bq Parts(sys_meswin_*·sys_guide_*·모드 lyt 가 부르는 부품) + 공용 글꼴(모든 묶음 문구) + texts + 메시지 속성 + 소리
  mgmet.json  mgmet lyt 34 레이아웃 + 텍스처(tex/mgmet/)          ← 화면이 spec.json 과 합쳐 쓴다(원본 (자기 lyt, mgm00 lyt) 묶음)
  mgm01.json  mgm01 lyt 16 레이아웃 + 텍스처(tex/mgm01/)
더한 표(spec.json):
  msgAttr   {라벨: {wt 창 형식 번호, ch 화자 번호, pos 위치 번호, ox, oy, emo, wi}}  — msbt ATR1 (msgwin_atr.py 로직)
  meswin    {window[9]: {type, pos, layout, layoutChoice}, chara[]: {id, type, voice, icon, name 라벨}, positions[10], emotion[]: {normal, choices}}  — messageWindowList.json
            화자 이름 라벨 = im_npc%03d_name / im_pc%02d_name (VoiceID 번호) [설계, message_window.md 9.4]
  글꼴      작은·중간 글꼴 = 모든 문구 글자, 큰 글꼴(bqfont_large*) = 레이아웃 기본 문구 + _tlp_·im_modeNN_name·mgmet_ui_act* 문구만 [설계: 아틀라스 크기]
            + GLYPH_ONLY(mgm02~06 *_ent_mw_guide00) 글자 — 문구 자체는 texts 에 넣지 않는다(mgmet 화면이 assets/mgmet/extra.json 으로 더함)
  창 내용    windowFlags bit4 창은 나눈 가운데 조각(#C)을 숨긴다(내용 안 그림 [추정], no_content)
  lineSpace {레이아웃: {글자 페인: 값}}  (0 이 아닌 것만)
  missingTextures {묶음: [이름]}  — 묶음 BNTX 에 없는 텍스처(UiSharedTexture 등). 화면에서는 흰 1×1 이 된다
  soundNotes  재생 파일을 만들지 못한 라벨과 이유
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
import charsel_web_assets as cw  # noqa: E402
import graphics_bntx  # noqa: E402
import modesel_web_assets as mw  # noqa: E402
import msgwin_atr  # noqa: E402
import ui_lyt  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "mgmcommon"
LYT = {
    "mgm00": BEA / "mgm~mgm00.nx.bea" / "mgm" / "mgm00" / "layout.lyt",
    "mgmet": BEA / "mgm~mgmet.nx.bea" / "mgm" / "mgmet" / "layout.lyt",
    "mgm01": BEA / "mgm~mgm01.nx.bea" / "mgm" / "mgm01" / "layout.lyt",
}
PARTS_BASE = ["sys_meswin_00", "sys_meswin_arrowicon_00", "sys_meswin_choices_00", "sys_meswin_arrowchoices_00",
              "sys_guide_03", "sys_guide_text", "sys_guide_pos_01"]
MSBT_DIR = BEA / "message~koKR.nx.bea" / "mess" / "bin" / "koKR"
ATR_FILES = ["mgmet", "mgm01", "system"]
WINDOW_LIST = BEA / "bq.nx.bea" / "common" / "data" / "messageWindowList.json"
FSPJ = BEA / "_ResidentAudio.nx.bea" / "_Resident" / "AddonAudioProject.fspj"
SE = {
    "SQ_SE_SYS_MES_PROC": "[판독] message_window.md 5절 넘김(화살표 보일 때)",
    "SQ_SE_SYS_CURSOR": "[판독] 메뉴 이동(부르는 쪽)·선택지",
    "SQ_SE_SYS_DECI": "[판독] 결정(부르는 쪽)·선택지",
    "SQ_SE_SYS_CANCEL": "[판독] 취소(부르는 쪽)·선택지",
    "SQ_SE_SYS_DECI_S": "[판독] 메시지 안내 버튼",
    "SQ_SE_SYS_PROCEED": "[판독] mgm_common.md 5.4 BottomRightNextMessage",
    "SQ_SE_SYS_ERROR": "[판독] 부르는 쪽 불가 결정(mgm01 목록 잠금)",
    "SQ_SE_SYS_SKIP": "[판독] mgmet_flow.md 6.1 오프닝 스킵",
}
SILENT = {"SQ_VOI_SYS_MES_PUT": "시퀀스가 전역 변수 15 에 240·245 를 쓰는 명령만 있고 음표가 없다 → 렌더 무음(0.005 s, peak 0) [실행: 변환 sound_seq.py]. 실제 글자 소리 원천 [미확정]"}
TAG = re.compile(r"\[\d+:\d+:[0-9a-f]*\]")
LARGE_LABELS = re.compile(r"_tlp_|^im_mode\d+_name$|^mgmet_ui_act")
GLYPH_ONLY = {f"mgm0{n}": [f"mgm0{n}_ent_mw_guide00"] for n in range(2, 7)}


def anim_tags(files, names):
    """anim/<레이아웃>_<태그>.bflan → 레이아웃마다 태그 목록. 파일 이름은 가장 긴 레이아웃 이름 접두로 나눈다(이름이 다른 이름의 접두인 경우)"""
    out = {n: [] for n in names}
    order = sorted(names, key=len, reverse=True)
    for f in files:
        if not (f.startswith("anim/") and f.endswith(".bflan")):
            continue
        stem = f[5:-6]
        for n in order:
            if stem == n:
                out[n].append("")
                break
            if stem.startswith(n + "_"):
                out[n].append(stem[len(n) + 1:])
                break
    return {n: sorted(t) for n, t in out.items()}


def part_refs(raw):
    lay = ui_lyt.parse_bflyt(raw)
    return {p["layoutFile"] for p in cw.walk(lay["root"]) if p["type"] == "prt1" and p.get("layoutFile")}


def line_spaces(files, names):
    out = {}
    for n in names:
        lay = ui_lyt.parse_bflyt(files[f"blyt/{n}.bflyt"])
        for p in cw.walk(lay["root"]):
            if p["type"] == "txt1" and p.get("lineSpace"):
                out.setdefault(n, {})[p["name"]] = p["lineSpace"]
    return out


def no_content(files, names, layouts):
    """창 windowFlags bit4 = 내용 안 그림 [추정: nn::ui2d 창 플래그, 데이터 정황 = bit4 창 61개가 전부 frame·shadow·cursor 이고 내용 재질에 텍스처 없음].
    나눈 창(modesel split_windows)의 가운데 조각 `<창>#C` 를 숨긴다. 나누지 않은 bit4 창은 이 묶음에 없다"""
    for n in names:
        lay = ui_lyt.parse_bflyt(files[f"blyt/{n}.bflyt"])
        for p in cw.walk(lay["root"]):
            if p["type"] == "wnd1" and p.get("windowFlags", 0) & 0x10:
                for node in layouts[n]["nodes"]:
                    if node["n"] == f"{p['name']}#C":
                        node["v"] = False


class Bundle:
    """레이아웃 묶음 하나(명세 파일 하나)"""

    def __init__(self, key, sources):
        self.key = key
        self.sources = sources
        self.layouts = {}
        self.tex_names = set()
        self.split = {}
        self.zabuton = {}
        self.line_space = {}
        self.lt = ui_render.LazyTextures()
        self.bntx = []
        for files in sources:
            for data in files.values():
                if data[:4] == b"BNTX":
                    self.lt.add_bntx(data)
                    self.bntx.append(data)

    def convert(self, files, names):
        names = [n for n in names if n not in self.layouts]
        if not names:
            return

        class _Size:
            def __init__(s, lt):
                s.lt = lt

            def get(s, name, default):
                img = s.lt.get(name)
                return img.size if img is not None else default

        mw.TEXSIZE = _Size(self.lt)
        mw.SPLIT = {}
        mw.ZABUTON = {}
        mw.convert(files, anim_tags(files, names), None, self.layouts, self.tex_names)
        no_content(files, names, self.layouts)
        self.split.update(mw.SPLIT)
        self.zabuton.update(mw.ZABUTON)
        self.line_space.update(line_spaces(files, names))

    def write_textures(self, sub):
        srgb = set()
        for data in self.bntx:
            for t in graphics_bntx.parse(data):
                if t.name in self.tex_names and graphics_bntx.meta(t).get("srgb"):
                    srgb.add(t.name)
        textures, missing = {}, []
        (DST / "tex" / sub).mkdir(parents=True, exist_ok=True)
        for tn in sorted(self.tex_names):
            img = self.lt.get(tn)
            if img is None:
                missing.append(tn)
                continue
            fn = f"tex/{sub}/" + tn.replace("^", "_") + ".png"
            img.save(DST / fn, optimize=True)
            textures[tn] = fn
        return textures, sorted(srgb), missing


def msg_attrs(labels):
    attrs, lists = msgwin_atr.read_msbp()
    by = {a["name"]: a for a in attrs}
    out = {}
    import struct
    for stem in ATR_FILES:
        buf = (MSBT_DIR / f"{stem}.msbt").read_bytes()
        e, names, esz, recs = msgwin_atr.read_atr(buf)
        if names is None:
            continue
        for i, r in enumerate(recs):
            lab = names.get(i)
            if lab not in labels:
                continue
            u8 = lambda k: r[by[k]["offset"]] if by[k]["offset"] < len(r) else 0  # noqa: E731
            f32 = lambda k: struct.unpack_from(e + "f", r, by[k]["offset"])[0] if by[k]["offset"] + 4 <= len(r) else 0.0  # noqa: E731
            out[lab] = {"wt": u8("WindowType"), "ch": u8("Character"), "pos": u8("Position"), "ox": round(f32("OffsetX"), 4),
                        "oy": round(f32("OffsetY"), 4), "emo": u8("Emotion"), "wi": u8("WindowInfo")}
    return out, {k: lists[by[k]["list"]] for k in ("WindowType", "Character", "Position", "Emotion", "WindowInfo")}


def chara_name(c, texts):
    v = c.get("VoiceID", "")
    m = re.match(r"CH_NPC(\d{3})", v)
    if c.get("CharaType") == "NPC" and m:
        return f"im_npc{m.group(1)}_name"
    m = re.match(r"CH_PC(\d{2})", v)
    if c.get("CharaType") == "PC" and m:
        return f"im_pc{m.group(1)}_name"
    return None


def render_sounds(spec, tmp):
    from sound_fsar import Fsar
    fs = Fsar(FSPJ)
    (DST / "sound").mkdir(parents=True, exist_ok=True)
    spec["sounds"] = {}
    for label, ev in SE.items():
        out = Path(tmp) / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        shutil.copyfile(out, DST / "sound" / f"{label}.wav")
        vol = fs.find(label)["volume"]
        spec["sounds"][label] = {"file": f"sound/{label}.wav", "gain": round(vol / 127, 4),
                                 "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}
    spec["soundNotes"] = {k: {"volume": fs.find(k)["volume"], "note": v} for k, v in SILENT.items()}


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    DST.mkdir(parents=True, exist_ok=True)
    files = {k: ui_sarc.read_files(str(p)) for k, p in LYT.items()}
    parts = ui_sarc.read_files(str(cw.PARTS))
    names = {k: sorted(n[5:-6] for n in f if n.startswith("blyt/")) for k, f in files.items()}

    common = Bundle("common", [files["mgm00"], parts])
    common.convert(files["mgm00"], names["mgm00"])
    modes = {k: Bundle(k, [files[k], files["mgm00"], parts]) for k in ("mgmet", "mgm01")}
    for k, b in modes.items():
        b.convert(files[k], names[k])

    have = set(names["mgm00"]) | set(names["mgmet"]) | set(names["mgm01"])
    need = set(PARTS_BASE)
    for k in ("mgm00", "mgmet", "mgm01"):
        for n in names[k]:
            need |= part_refs(files[k][f"blyt/{n}.bflyt"])
    need -= have
    done = set()
    while need - done:
        batch = sorted(n for n in need - done if f"blyt/{n}.bflyt" in parts)
        missing = sorted(n for n in need - done if f"blyt/{n}.bflyt" not in parts)
        for n in missing:
            print("  부품 레이아웃 없음", n)
        done |= need
        if not batch:
            break
        common.convert(parts, batch)
        for n in batch:
            need |= part_refs(parts[f"blyt/{n}.bflyt"]) - have

    msg = cw.messages()
    mjson = {s: json.loads((cw.MSG_DIR / f"{s}.json").read_text(encoding="utf-8")) for s in ("mgmet", "mgm01", "im_common", "im_mg", "system")}
    labels = set(mjson["mgmet"]) | set(mjson["mgm01"]) | set(mjson["im_common"])
    labels |= {k for k in mjson["im_mg"] if k.endswith("_name")}
    labels |= {k for k in mjson["system"] if k.startswith(("sys_ctrl_", "sys_mw_", "sys_dlg_common"))}
    texts = {k: msg[k] for k in sorted(labels) if k in msg}

    wl = json.loads(WINDOW_LIST.read_text(encoding="utf-8-sig"))
    attrs, attr_lists = msg_attrs(set(texts))
    meswin = {
        "window": [{"type": w["Type"], "pos": w["DefaultPosition"], "layout": w["Layout00"].replace(".bflyt", ""),
                    "layoutChoice": w["Layout01"].replace(".bflyt", "")} for w in wl["WindowData"]],
        "chara": [{"id": c["CharaID"], "type": c["CharaType"], "voice": c["VoiceID"], "icon": c["IconTexture"], "name": chara_name(c, texts)}
                  for c in wl["CharacterData"]],
        "positions": [p["Position"] for p in wl["PositionData"]],
        "emotion": [{"normal": e.get("VoiceKey_Normal") or None, "choices": e.get("VoiceKey_Choices") or None} for e in wl["Emotion"]],
        "attrLists": attr_lists,
    }

    spec = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/mgmcommon_web_assets.py, 명세 web/docs/shell/mgm_common.md 9.6"}
    all_layouts = [common.layouts] + [b.layouts for b in modes.values()]
    fams = set()
    text_set = "".join(TAG.sub("", v) for v in texts.values()) + "0123456789/:-+.,!? ()%"
    for stem, keys in GLYPH_ONLY.items():
        src = json.loads((cw.MSG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        text_set += "".join(TAG.sub("", src.get(k, "")) for k in keys)
    default_texts = ""
    for lays in all_layouts:
        for lay in lays.values():
            for n in lay["nodes"]:
                if n.get("txt"):
                    fams.add(n["txt"]["font"])
                    default_texts += n["txt"].get("text", "")
    text_set += default_texts
    large_set = default_texts + "0123456789/:-+.,!? ()%" + "".join(
        TAG.sub("", v) for k, v in texts.items() if LARGE_LABELS.search(k))
    cpx = cw.fcpx_fonts()
    spec["fonts"] = {}
    (DST / "font").mkdir(exist_ok=True)
    for fam in sorted(fams):
        if not cpx.get(fam):
            print("  글꼴 없음(시스템 글꼴로 그림)", fam)
            continue
        img, meta = cw.build_atlas(fam, cpx[fam], large_set if fam.startswith("bqfont_large") else text_set)
        img.save(DST / meta["image"], optimize=True)
        spec["fonts"][fam] = meta
        print(fam, len(meta["glyphs"]), "glyphs", img.size)

    missing = {}
    tex, srgb, miss = common.write_textures("common")
    spec.update({"textures": tex, "srgb": srgb, "layouts": common.layouts, "split": common.split, "zabuton": common.zabuton,
                 "lineSpace": common.line_space})
    missing["common"] = miss
    spec["texts"] = texts
    spec["msgAttr"] = attrs
    spec["meswin"] = meswin
    render_sounds(spec, tmp)
    for k, b in modes.items():
        tex, srgb, miss = b.write_textures(k)
        missing[k] = miss
        dup = sorted(set(b.layouts) & set(common.layouts))
        if dup:
            print("  겹치는 레이아웃 이름", k, dup)
        part = {"version": 1, "screen": [1920, 1080], "source": spec["source"], "textures": tex, "srgb": srgb, "layouts": b.layouts,
                "split": b.split, "zabuton": b.zabuton, "lineSpace": b.line_space}
        (DST / f"{k}.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{k}.json", (DST / f"{k}.json").stat().st_size, "B", len(b.layouts), "layouts", len(tex), "textures, 없음", len(miss))
    spec["missingTextures"] = missing
    (DST / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("spec.json", (DST / "spec.json").stat().st_size, "B", len(common.layouts), "layouts", len(spec["textures"]), "textures, 없음", len(missing["common"]))
    for k, v in missing.items():
        print("  없는 텍스처", k, v[:30], "…" if len(v) > 30 else "")


if __name__ == "__main__":
    main()
