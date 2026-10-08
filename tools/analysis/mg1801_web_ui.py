"""mg1801 웹 2D UI 에셋 만들기 — 원본 레이아웃(.lyt)·폰트·메시지·진동 → web/assets/mg1801/ui.

  c:/dev/mpj/.venv/Scripts/python tools/mg1801_web_ui.py

만드는 것 (web/assets/mg1801/ui/):
  ui.json        layouts{이름: bflyt(ui_lyt.parse_bflyt 결과에서 검증용 필드만 뺌)}, anims{이름: {태그: bflan}},
                 textures{이름: png 경로}, fonts{패밀리: 공용 글꼴 참조 {dir, chars}}, telopFont, texts{라벨: koKR 문구}, vib{키: 진동}
  tex/*.png      레이아웃 BNTX 텍스처(compSel 적용, ui_render.LazyTextures). 원본 픽셀 그대로
                 + 캐릭터 얼굴 face_128_pcNN^u(bq Parts.lyt timg/__Combined.bntx, 공유 텍스처). 결과 화면 sys_face_01 의 Face_128 칸에 들어간다
                 여러 화면 공용 그림(얼굴·sys_white 등)은 web/assets/common/tex/ 를 ../../common/… 로 가리킨다(common_shared.py, docs/engine/common_assets.md)
  fonts          비트맵 글꼴 = 공용 assets/font/ 원본 시트 참조 {dir: '../../font/', chars}(font_web_assets.py, docs/engine/font_assets.md)
  font/bqfont_telop.otf  BFOTF 복호화 → 필요한 글자만 서브셋(fontTools). 글리프 윤곽은 원본 그대로

출처와 판독 근거는 web/script/games/mg1801/view/ui.ts 머리 주석과 보고서(레이아웃 선택: main RmUiTelopMan·RmUiStatusMan·RmUiCntWipe).
로캘은 koKR 고정(font~font_kr, message~koKR).
"""
import io
import json
import re
import shutil
import struct
import sys
from pathlib import Path

import msgpack
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import common_shared as cs  # noqa: E402
import font_web_assets as fw  # noqa: E402
import ui_bnvib  # noqa: E402
import ui_font  # noqa: E402
import ui_lyt  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "mg1801" / "ui"
FONT_DIR = BEA / "font~font_kr.nx.bea" / "Parts.lyt" / "Font_kr"
MSG_DIR = ROOT / "extracted" / "message" / "koKR"

SOURCES = {
    "mg1800": BEA / "mg~mg1800.nx.bea" / "mg" / "mg1800" / "layout.lyt",
    "mg1801": BEA / "mg~mg1801.nx.bea" / "mg" / "mg1801" / "layout.lyt",
    "bq": BEA / "bq.nx.bea" / "Parts.lyt",
    "mgcmn": BEA / "libca~mg_common.nx.bea" / "libca" / "mg_common" / "layout.lyt",
}

# (아카이브, 레이아웃, 애니 태그). 레이아웃 선택 근거 [판독 main]:
#   mg1800_tlp_fast/slow/just  RmUiTelopMan::RmUiTelopMan (@0x7100438d10, 표 @0x7101aa5e88) + ShowTimingTelop 의 "in"
#   sys_tlp_start_00/finish_00 ComUiMGTelop 형식 0/2 (FUN_7100210a08), Start → "in" → "normal" → (oneshot) "out"
#   camgcmm_tlp_perfect        CaComUiPerfectTelop MG_TYPE 0 (FUN_710043b668), In "in" + idle "idle", Out "out"
#   mg1800_score_00            RmUiBarStatus (FUN_7100436758): "in" / pane "gauge" / pane "active" / "out"
#   mg1801_wip_bg_00/01        RmUiCntWipe DISP_TYPE 0 (FUN_7100431d8c): "in" → "idle" → "out"
#   wipe                       bq::WipeModule 흰 페이드 "WipeWhite_out/_normal/_in"(로직 state.fade 가 애니·프레임을 준다)
#   mg1800_free_result_00      결과 점수판 FUN_7100448be0("mg1800_free_result_00.flyt"): 람다 @0x71004495f0 의 "in"(속도 0)·"min_max"
#   mg1800_free_result_01      위 레이아웃의 부품 x_parts_face_01~04(prt1 layoutFile): FUN_7100448610 의 "in", 람다의 "gauge"
#   mg1800_free_result_flash_00/01  FUN_7100448be0 이 따로 만드는 반짝임(별 게이지 1개 / 얼굴 4개) "flash"
#   sys_face_01                mg1800_free_result_01 의 부품 x_parts_face_00(bq Parts.lyt). 컨트롤 StatusFace 의 Face_128 = x_face_pc128
LAYOUTS = [
    ("mg1800", "mg1800_tlp_fast", ["in"]),
    ("mg1800", "mg1800_tlp_slow", ["in"]),
    ("mg1800", "mg1800_tlp_just", ["in"]),
    ("bq", "sys_tlp_start_00", ["in", "normal", "out"]),
    ("bq", "sys_tlp_finish_00", ["in", "normal", "out"]),
    ("mgcmn", "camgcmm_tlp_perfect", ["in", "idle", "out"]),
    ("mg1800", "mg1800_score_00", ["in", "gauge", "active", "out"]),
    ("mg1801", "mg1801_wip_bg_00", ["in", "idle", "out", "in_stage"]),
    ("mg1801", "mg1801_wip_bg_01", ["in", "idle", "out", "in_stage"]),
    ("bq", "wipe", ["WipeWhite_in", "WipeWhite_normal", "WipeWhite_out"]),
    ("mg1800", "mg1800_free_result_00", ["in", "min_max"]),
    ("mg1800", "mg1800_free_result_01", ["in", "gauge"]),
    ("mg1800", "mg1800_free_result_flash_00", ["flash"]),
    ("mg1800", "mg1800_free_result_flash_01", ["flash"]),
    ("bq", "sys_face_01", []),
]

# 텍스트 페인에 들어가는 메시지 라벨 [판독]: RmUiTelopMan 생성자 표 @0x71019f1af8(fast 01, slow 02, just 00),
# ComUiMGTelop::Start(형식 0 mg_tl101, 2 mg_tl301), FUN_710043b668(rc00_tlp_timing04),
# 와이프 x_text_00 = 페인 CA_MessLabel rc00_wip_ui_title00("[1:1]" = 미니게임 이름 삽입), x_text_01 = rc00_wip_ui_title01
# 결과 점수판 [판독 FUN_7100448be0·FUN_7100448610·람다 @0x71004495f0]: x_text_00/01/02 = rc00_tlp_fp_result00/01/02,
# 얼굴 부품 x_text_00 = rc00_tlp_fp_result03("CPU"), x_text_01 = rc00_tlp_stage_result_thum01(Number0.Number1%)
LABELS = ["rc00_tlp_timing00", "rc00_tlp_timing01", "rc00_tlp_timing02", "rc00_tlp_timing04", "mg_tl101", "mg_tl301",
          "rc00_wip_ui_title01", "im_mg1801_name", "rc00_tlp_fp_result00", "rc00_tlp_fp_result01", "rc00_tlp_fp_result02",
          "rc00_tlp_fp_result03", "rc00_tlp_stage_result_thum01"]

# 패밀리(fcpx) → 그 패밀리로 그릴 라벨
FONT_USE = {
    "bqfont_middle": ["rc00_tlp_timing00", "rc00_tlp_timing01", "rc00_tlp_timing02", "rc00_tlp_fp_result03"],
    "bqfont_middle_shadow": ["rc00_tlp_timing00", "rc00_tlp_timing01", "rc00_tlp_timing02", "rc00_tlp_fp_result03"],
    "bqfont_large": ["rc00_tlp_timing04", "rc00_wip_ui_title01", "im_mg1801_name"],
    "bqfont_large_shadow": ["rc00_tlp_timing04"],
}
# 메시지 태그 [1:0] insert.Number 로 들어가는 숫자 글자(결과 점수판)
FONT_DIGITS = {
    "bqfont_large": "0123456789.",
    "bqfont_large_shadow": "0123456789.",
    "bqfont_small": "0123456789.%",
    "bqfont_small_shadow": "0123456789.%",
}
CHARA_INDEX = ROOT / "web" / "assets" / "mg1801" / "chara" / "index.json"
TELOP_LABELS = ["mg_tl101", "mg_tl301"]

VIB = {"VB_MG1801_JUST": "bv_vib_mg1801_just", "VB_MG1801_SUCCESS": "bv_vib_mg1801_success"}


WRAP = {0: "clamp", 1: "repeat", 2: "mirror"}


def pane_masks(b, textures):
    """페인 시스템 사용자 데이터(usd1 "ui2dsys", 형식 3)의 마스크 텍스처를 읽는다.

    ui_lyt.read_usd 는 형식 3 의 앞 16 B 만 남기므로 여기서 bflyt 를 다시 읽는다. 배치는 mg1800_free_result_00 의 두 별 게이지에서
    본 그대로다 [데이터, 뜻은 추정]: +0 u16 0·u16 1, +4 u32 8, +8 u32 3(마스크), +16 텍스처 맵(u16 번호, u8 wrapS|min<<2, u8 wrapT|mag<<2),
    +24 두 번째 맵(이름_M, 런타임 캡처로 보여 쓰지 않음), +28 u32 1, +32 SRT(f32 tx, ty, r, sx, sy).
    """
    out = {}
    p = struct.unpack_from("<H", b, 6)[0]
    last = None
    while p + 8 <= len(b):
        mg, sz = b[p:p + 4], struct.unpack_from("<I", b, p + 4)[0]
        if sz == 0:
            break
        if mg in (b"pan1", b"pic1", b"txt1", b"wnd1", b"prt1", b"bnd1"):
            last = b[p + 0xC:p + 0xC + 24].split(b"\0")[0].decode()
        elif mg == b"usd1" and last:
            n = struct.unpack_from("<H", b, p + 8)[0]
            for i in range(n):
                e = p + 12 + i * 12
                noff, doff, dlen, typ = struct.unpack_from("<IIHB", b, e)
                name = b[e + noff:e + noff + 16].split(b"\0")[0] if noff else b""
                d = e + doff
                if name != b"ui2dsys" or typ != 3 or struct.unpack_from("<I", b, d + 8)[0] != 3:
                    continue
                idx, f1, f2 = struct.unpack_from("<HBB", b, d + 16)
                tx, ty, r, sx, sy = struct.unpack_from("<5f", b, d + 32)
                out[last] = {"tex": textures[idx], "wrapU": WRAP.get(f1 & 3, "clamp"), "wrapV": WRAP.get(f2 & 3, "clamp"),
                             "srt": {"t": [tx, ty], "r": r, "s": [sx, sy]}}
        p += sz
    return out


def attach_masks(pane, masks):
    if pane["name"] in masks:
        pane["mask"] = masks[pane["name"]]
    for c in pane["children"]:
        attach_masks(c, masks)


def clean_layout(d):
    d = dict(d)
    for k in ("header", "sectionOrder", "_check"):
        d.pop(k, None)
    for m in d["materials"]:
        m.pop("_size", None)
    return d


def clean_anim(d):
    d = dict(d)
    d.pop("header", None)
    d.pop("_check", None)
    return d


def messages():
    out = {}
    for p in sorted(MSG_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            out.update(d)
    return out


def fcpx_fonts():
    files = ui_sarc.read_files(str(FONT_DIR / "FcpxSet.nbfcpxsetlyt"))
    out = {}
    for name, data in files.items():
        if name.startswith("fcpx/") and name.endswith(".bfcpx"):
            out[Path(name).stem] = (ui_lyt.parse_bfcpx(data)["fonts"], data)
    return out


def telop_font(text, fcpx_raw):
    from fontTools import subset
    from fontTools.ttLib import TTFont
    data, size = ui_font.decrypt_bfotf((FONT_DIR / "bqfont_telop.bfotf").read_bytes())
    font = TTFont(io.BytesIO(data))
    opts = subset.Options()
    opts.name_IDs = ["*"]
    opts.layout_features = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(text="".join(sorted(set(text))))
    sub.subset(font)
    out = io.BytesIO()
    font.save(out)
    # bqfont_telop.bfcpx +0x1C f32 = 스케일러블 폰트 기준 크기(관측 200.0) [데이터]
    base = struct.unpack_from("<f", fcpx_raw, 0x1C)[0]
    head, hhea = font["head"], font["hhea"]
    meta = {"file": "font/bqfont_telop.otf", "family": "mg1801_bqfont_telop", "baseSize": base,
            "unitsPerEm": head.unitsPerEm, "ascent": hhea.ascent, "descent": hhea.descent}
    return out.getvalue(), meta


def main():
    if DST.exists():
        shutil.rmtree(DST)
    (DST / "tex").mkdir(parents=True)
    (DST / "font").mkdir(parents=True)
    files = {k: ui_sarc.read_files(str(v)) for k, v in SOURCES.items()}
    layouts, anims, textures = {}, {}, {}
    for src, name, tags in LAYOUTS:
        raw = files[src][f"blyt/{name}.bflyt"]
        lay = ui_lyt.parse_bflyt(raw)
        assert not lay["_check"], (name, lay["_check"])
        masks = pane_masks(raw, lay["textures"])
        attach_masks(lay["root"], masks)
        layouts[name] = clean_layout(lay)
        anims[name] = {}
        texnames = set(lay["textures"]) | {m["tex"] for m in masks.values()}
        for t in tags:
            an = ui_lyt.parse_bflan(files[src][f"anim/{name}_{t}.bflan"])
            assert not an["_check"], (name, t, an["_check"])
            anims[name][t] = clean_anim(an)
            texnames |= set(an.get("textures", []))
        lt = ui_render.LazyTextures()
        for fn, data in files[src].items():
            if data[:4] == b"BNTX":
                lt.add_bntx(data)
        for tn in sorted(texnames):
            if tn in textures:
                continue
            img = lt.get(tn)
            if img is None:
                print(f"  {name}: 텍스처 없음 {tn} (런타임 생성으로 보임)")
                continue
            fn = "tex/" + tn.replace("^", "_") + ".png"
            textures[tn] = cs.tex(tn, img, DST / fn, DST) or fn
        print(name, tags, len(texnames), "tex", "masks", {k: v["tex"] for k, v in masks.items()} if masks else "")

    # 캐릭터 얼굴: UiSharedTextureModule::GetPCFace → "face_%s_pc%02d^u"(크기 표 @0x71019deff8 의 "128", 번호 = CharacterData::PCNumber
    # = chara/pc%02d 의 번호) [판독 main @0x7100296dc4]. 원본은 bq Parts.lyt 의 timg/__Combined.bntx 에 있다
    lt = ui_render.LazyTextures()
    for fn, data in files["bq"].items():
        if data[:4] == b"BNTX":
            lt.add_bntx(data)
    faces = sorted(k for k in json.loads(CHARA_INDEX.read_text(encoding="utf-8")) if k.startswith("pc"))
    for key in faces:
        tn = f"face_128_{key}^u"
        img = lt.get(tn)
        if img is None:
            print(f"  얼굴 없음 {tn}")
            continue
        fn = "tex/" + tn.replace("^", "_") + ".png"
        textures[tn] = cs.tex(tn, img, DST / fn, DST) or fn
    print("faces", len(faces))

    msg = messages()
    texts = {}
    for k in LABELS:
        texts[k] = msg[k]
    # rc00_wip_ui_title00 = "[1:1:00cd]"(insert.Text 1) — FUN_7100431d8c 가 미니게임 이름을 넣는다
    texts["rc00_wip_ui_title00"] = msg["im_mg1801_name"]

    cpx = fcpx_fonts()
    fonts = {}
    tag = re.compile(r"\[\d+:\d+(?::[0-9a-f]*)?\]")
    for fam in list(FONT_USE) + [f for f in FONT_DIGITS if f not in FONT_USE]:
        text = tag.sub("", "".join(texts[k] for k in FONT_USE.get(fam, []))) + FONT_DIGITS.get(fam, "")
        fonts[fam] = fw.font_ref(fam, text, "../../font/")
        print(fam, len(fonts[fam]["chars"]), "chars")
    otf, tmeta = telop_font("".join(texts[k] for k in TELOP_LABELS), cpx["bqfont_telop"][1])
    (DST / tmeta["file"]).write_bytes(otf)
    print("telop otf", len(otf), "B", tmeta)

    vdef = msgpack.unpackb((BEA / "vib.nx.bea" / "vib" / "vibration.msgpack").read_bytes(), raw=False, strict_map_key=False)
    defs = {d["label"]: d for d in vdef["vib_define"]}
    vib = {}
    for key, name in VIB.items():
        d = ui_bnvib.parse((BEA / "vib.nx.bea" / "vib" / "bnvib" / f"{name}.bnvib").read_bytes())
        df = defs[name]
        vib[key] = {"bnvib": name, "rateHz": d["rateHz"], "ampLow": d["ampLow"], "ampHigh": d["ampHigh"],
                    "freqLowCode": d["freqLowCode"], "freqHighCode": d["freqHighCode"],
                    "gainMaster": df["Gain_Master"], "gainLow": df["Gain_Low"], "gainHigh": df["Gain_High"],
                    "priority": df["priority"]}
        print(key, d["samples"], "samples", df["Gain_Master"], df["priority"])

    out = {"source": "tools/mg1801_web_ui.py", "locale": "koKR", "layouts": layouts, "anims": anims,
           "textures": textures, "fonts": fonts, "telopFont": tmeta, "texts": texts, "vib": vib}
    (DST / "ui.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total = sum(p.stat().st_size for p in DST.rglob("*") if p.is_file())
    print("ui.json", (DST / "ui.json").stat().st_size, "B, 전체", total, "B")


if __name__ == "__main__":
    main()
