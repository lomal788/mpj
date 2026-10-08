"""모드 선택(맵 메뉴) 화면(독립 모듈 web/script/shell/modeselect) 에셋 — 원본 레이아웃·폰트·메시지·소리 → web/assets/modeselect.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/modesel_web_assets.py

근거: web/docs/shell/modeselect.md. 명세 형식(layouts·fonts·textures·srgb)은 charselect 와 같고(charsel_web_assets.py 의 변환 함수를 그대로 import),
이 화면 표를 더한다:
  modes[]   버튼 0..8 {button, key, name 라벨, detail 라벨, icon 섬 아이콘 부품, win 사진 창 부품, joycon, next}
  partMats  {레이아웃: [{part, pane, tex[이름], srt[{t,r,s}]}]}  부품 속성의 재질 덮어쓰기(사진 창 그림 등) [데이터]
  align     버튼 정렬 {top, pitch}  (ali1 크기 900·여백 −81, 버튼 높이 172)
여러 화면 공용 그림·효과음은 web/assets/common/ 을 ../common/… 로 가리킨다(common_shared.py, docs/engine/common_assets.md).
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import charsel_web_assets as cw  # noqa: E402
import common_shared as cs  # noqa: E402
import font_web_assets as fw  # noqa: E402
import ui_lyt  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "modeselect"
MENU01 = BEA / "menu~menu01.nx.bea" / "menu" / "menu01" / "layout.lyt"

LAYOUTS_MENU01 = {
    "mn01_base_map_00": ["in", "normal", "out"],
    "mn01_btn_map_00": ["normal", "on", "off", "cursor", "press", "miss", "disable_normal", "disable_on", "disable_cursor"],
    "mn01_pict_map_00": [],
    "mn01_icon_map_00": ["on", "off"],
    "mn01_win_map_00": ["in", "normal", "out"],
}
LAYOUTS_PARTS = {
    "sys_guide_03": ["in", "normal", "out"],
    "sys_guide_text": [""],
    "sys_guide_pos_01": [],
}
# 버튼 0..8 [판독 menu01.nro 표 @0x710016363c·@0x7100163618, GetMapIconPane, Cursor, SetupButton, MapMenuImpl] — web/tools/analysis/modesel_tables.py 로 표 확인
MODES = [
    (0, "bd", "im_mode00_name", "im_mn_mode00_detail", "x_icon_mode_00", "x_win_00", 2),
    (1, "rc", "im_mode02_name", "im_mn_mode02_detail", "x_icon_mode_03", "x_win_03", 5),
    (2, "mf", "im_mode07_name", "im_mn_mode07_detail", "x_icon_mode_04", "x_win_04", 7),
    (3, "pata", "im_mode06_name", "im_mn_mode06_detail", "x_icon_mode_02", "x_win_02", 6),
    (4, "kb", "im_mode01_name", "im_mn_mode01_detail", "x_icon_mode_05", "x_win_05", 4),
    (5, "ca", "im_mode08_name", "im_mn_mode08_detail", "x_icon_mode_06", "x_win_06", 8),
    (6, "mgm", "im_mode03_name", "im_mn_mode03_detail", "x_icon_mode_01", "x_win_01", 3),
    (7, "quest", "im_mode19_name", "im_mn_mode19_detail", "x_icon_mode_07", "x_win_07", -2),
    (8, "plaza", "im_mode05_name", "im_mn_mode05_detail", "x_icon_mode_07", "x_win_08", -3),
]
LABELS = ["mn01_map_ui_mode_detail", "mn01_mode_ctrl_close", "sys_notice_playModeMissed00", "sys_notice_playModeMissed01", "sys_notice_playModeMissed04"]
SE = {k: cw.SE[k] for k in ("SQ_SE_SYS_CURSOR", "SQ_SE_SYS_DECI", "SQ_SE_SYS_ERROR", "SQ_SE_SYS_CANCEL")}


def part_mats(lay):
    """부품 속성 덮어쓰기 중 재질(pic1 materialIndex) → 텍스처 이름·SRT"""
    out = []
    mats = lay["materials"]
    for p in cw.walk(lay["root"]):
        if p["type"] != "prt1":
            continue
        for pr in p.get("properties", []):
            od = pr.get("overrideData")
            if not od or od.get("type") != "pic1" or "materialIndex" not in od:
                continue
            m = mats[od["materialIndex"]]
            out.append({"part": p["name"], "pane": pr["name"], "tex": [t["tex"] for t in m["texMaps"]],
                        "srt": [{"t": list(s["t"]), "r": s["r"], "s": list(s["s"])} for s in m["texSrt"]]})
    return out


def align_info(lay):
    """A_alignment_00 (ali1): extra 바이트 = u32 0, f32 여백, … [데이터]. 버튼 높이와 정렬 크기로 첫 칸·간격"""
    ali = next(p for p in cw.walk(lay["root"]) if p["type"] == "ali1")
    margin = struct.unpack_from("<f", bytes.fromhex(ali["extra"]), 4)[0]
    btn = next(p for p in ali["children"] if p["type"] == "prt1")
    h = btn["size"][1]
    return {"pane": ali["name"], "top": ali["size"][1] / 2 - h / 2, "pitch": h + margin, "margin": margin}


FRAME_ORDER = ["LT", "RT", "LB", "RB", "L", "R", "T", "B"]


SPLIT = {}
TEXSIZE = {}
ZABUTON = {}
MATS_OUT = {}


def split_windows(name, lay, nodes):
    """창을 그림 9장(`<창>#LT`…`#C`)으로 나눈다(docs 6.1·9.4). charselect render2d 는 고치지 않는다.
    (1) 프레임 재질 8개 창(mn01_win_map_00 base): render2d 는 LT 하나를 뒤집어 쓰므로 변마다 다른 재질(말풍선 꼬리)을 못 그린다.
        변 UV 는 텍셀 단위(변 길이/32) [추정: 꼬리 SRT t −4.6 → 위 변 가운데 = 캡처], 모서리 1:1, 뒤집기 0·1 좌우·2 상하·4 180° [데이터 flip], 3·5 [근사].
    (2) windowFlags bit1(정점색 전체 [추정 UseVtxColorAll], 캡처 연두 둥근 버튼) + 프레임 재질 1개: render2d 창과 같은 UV(모서리 = LT 뒤집기, 변 = 경계 텍셀).
    조각 정점색은 화면 코드가 창 노드 정점색(애니 대상)을 쌍선형으로 나눠 매 프레임 넣는다(spec.split). 창 알파가 조각에 가도록 ia = True."""
    raws = {p["name"]: p for p in cw.walk(lay["root"]) if p["type"] == "wnd1"}
    mi = {m["name"].strip(): i for i, m in enumerate(lay["materials"])}
    out = list(nodes)
    for idx, n in enumerate(nodes):
        p = raws.get(n["n"])
        if not p or n["k"] != "wnd":
            continue
        frames = p.get("frames", [])
        allvc = bool(p.get("windowFlags", 0) & 2)
        if len(frames) != 8 and not (allvc and len(frames) == 1):
            continue
        w, h = n["z"]
        fs = p["frameSize"]
        content = n["wnd"]["content"]
        x0, x1, x2, x3 = -w / 2, -w / 2 + fs["l"], w / 2 - fs["r"], w / 2
        y0, y1, y2, y3 = h / 2, h / 2 - fs["t"], -h / 2 + fs["b"], -h / 2
        if len(frames) == 8:
            fm = {FRAME_ORDER[i]: mi[f["material"].strip()] for i, f in enumerate(frames)}
            lh = (x2 - x1) / 32.0
            lv = (y1 - y2) / 32.0
            uvs = {"LT": [0, 0, 1, 0, 0, 1, 1, 1], "RT": [1, 0, 0, 0, 1, 1, 0, 1], "LB": [0, 1, 1, 1, 0, 0, 1, 0], "RB": [1, 1, 0, 1, 1, 0, 0, 0],
                   "T": [0, 0, lh, 0, 0, 1, lh, 1], "B": [lh, 1, 0, 1, lh, 0, 0, 0], "L": [0, 0, 0, 1, lv, 0, lv, 1], "R": [0, 1, 0, 0, lv, 1, lv, 0]}
        else:
            m0 = mi[frames[0]["material"].strip()]
            fm = {k: m0 for k in FRAME_ORDER}
            tw, th = TEXSIZE.get(lay["materials"][m0]["texMaps"][0]["tex"], (fs["l"], fs["t"])) if lay["materials"][m0]["texMaps"] else (fs["l"], fs["t"])
            uc = [[0, fs["l"] / tw], [fs["l"] / tw, fs["l"] / tw], [fs["r"] / tw, 0]]
            vr = [[0, fs["t"] / th], [fs["t"] / th, fs["t"] / th], [fs["b"] / th, 0]]
            q = lambda ix, iy: [uc[ix][0], vr[iy][0], uc[ix][1], vr[iy][0], uc[ix][0], vr[iy][1], uc[ix][1], vr[iy][1]]  # noqa: E731
            uvs = {"LT": q(0, 0), "T": q(1, 0), "RT": q(2, 0), "L": q(0, 1), "R": q(2, 1), "LB": q(0, 2), "B": q(1, 2), "RB": q(2, 2)}
        cells = {"C": (x1, y1, x2, y2, content, [0, 0, 1, 0, 0, 1, 1, 1])}
        rect = {"LT": (x0, y0, x1, y1), "RT": (x2, y0, x3, y1), "LB": (x0, y2, x1, y3), "RB": (x2, y2, x3, y3),
                "T": (x1, y0, x2, y1), "B": (x1, y2, x2, y3), "L": (x0, y1, x1, y2), "R": (x2, y1, x3, y2)}
        for k, r in rect.items():
            cells[k] = (*r, fm[k], uvs[k])
        vc = n.get("vc") or [[255, 255, 255, 255]] * 4
        n["k"] = "null"
        n["ia"] = True
        del n["wnd"]
        n.pop("m", None)
        zab = (p.get("userData") or {}).get("BexZabutonBlurred")
        if zab:
            # BexZabutonBlurred(docs 6.2): 칸 목록의 텍스처를 렌더러 흐림 버퍼로 바꾼다 [판독 main FUN_7100058730].
            # 조각마다 화면 공간 UV 를 쓰고 칸 0 은 재질 SRT 로 원래 UV 를 되찾아야 해서 프레임 조각에 재질 사본을 준다
            mats_out = MATS_OUT[name]
            for k in FRAME_ORDER:
                src = mats_out[cells[k][4]]
                mats_out.append({**src, "name": f"{src['name'].strip()}#{k}", "srt": [dict(x) for x in src["srt"]]})
                cells[k] = (*cells[k][:4], len(mats_out) - 1, cells[k][5])
            ZABUTON.setdefault(name, []).append({"pane": n["n"], "slots": list(zab), "w": w, "h": h})
        for k, (l, t, r, b, m, uv) in cells.items():
            out.append({"n": f"{n['n']}#{k}", "p": idx, "k": "pic", "v": True, "ia": False, "o": [0, 0], "po": [0, 0],
                        "t": [(l + r) / 2, (t + b) / 2], "r": 0, "s": [1, 1], "z": [r - l, t - b], "a": 255,
                        "vc": vc if (k == "C" or allvc) else [[255, 255, 255, 255]] * 4, "m": m, "uv": uv})
        SPLIT.setdefault(name, []).append({"n": n["n"], "all": allvc, "w": w, "h": h})
    return out


def wnd_part_mats(lay):
    """부품 속성 덮어쓰기 중 창(wnd1): 덮어쓴 재질은 같은 부품의 pict_mode 재질 바로 앞 9개(baseC·LT·RT·LB·RB·T·B·L·R) [데이터: 이름 순서]"""
    out = []
    mats = lay["materials"]
    for p in cw.walk(lay["root"]):
        if p["type"] != "prt1":
            continue
        props = {pr["name"]: pr for pr in p.get("properties", [])}
        pic = props.get("pict_mode", {}).get("overrideData")
        if not pic or "base" not in props or props["base"].get("override") != "wnd1":
            continue
        m0 = pic["materialIndex"] - 9
        for m in mats[m0:m0 + 9]:
            key = m["name"].strip()[4:] or "C"
            out.append({"part": p["name"], "pane": f"base#{key}", "tex": [t["tex"] for t in m["texMaps"]],
                        "srt": [{"t": list(s["t"]), "r": s["r"], "s": list(s["s"])} for s in m["texSrt"]]})
    return out


def convert(files, names, tags_map, layouts, tex_names, extra=None):
    for name, tags in names.items():
        raw = files[f"blyt/{name}.bflyt"]
        lay = ui_lyt.parse_bflyt(raw)
        assert not lay["_check"], (name, lay["_check"])
        nodes, mats = cw.conv_layout(lay, tex_names, cw.part_pane_info(raw))
        MATS_OUT[name] = mats
        nodes = split_windows(name, lay, nodes)
        anims = {}
        for t in tags:
            fn = f"anim/{name}_{t}.bflan" if t else f"anim/{name}.bflan"
            an = ui_lyt.parse_bflan(files[fn])
            anims[t or an["tag"]["name"] or "loop"] = cw.conv_anim(an, nodes, mats)
        layouts[name] = {"size": lay["layout"]["size"], "nodes": nodes, "mats": mats, "anims": anims}
        if extra is not None:
            extra[name] = lay
        print(name, len(nodes), "nodes", len(mats), "mats", list(anims))


def main():
    for d in ("tex", "sound"):
        (DST / d).mkdir(parents=True, exist_ok=True)
    spec = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/modesel_web_assets.py, 명세 web/docs/shell/modeselect.md"}
    f_menu = ui_sarc.read_files(str(MENU01))
    f_parts = ui_sarc.read_files(str(cw.PARTS))
    import graphics_bntx
    lt = ui_render.LazyTextures()
    for files in (f_menu, f_parts):
        for data in files.values():
            if data[:4] == b"BNTX":
                lt.add_bntx(data)

    class _Size:
        def get(self, name, default):
            img = lt.get(name)
            return img.size if img is not None else default

    global TEXSIZE
    TEXSIZE = _Size()
    layouts, tex_names, raw_lays = {}, set(), {}
    convert(f_menu, LAYOUTS_MENU01, None, layouts, tex_names, raw_lays)
    convert(f_parts, LAYOUTS_PARTS, None, layouts, tex_names)
    pm = {k: part_mats(v) + wnd_part_mats(v) for k, v in raw_lays.items()}
    pm = {k: v for k, v in pm.items() if v}
    for lst in pm.values():
        for e in lst:
            tex_names.update(e["tex"])
    spec["layouts"] = layouts
    spec["partMats"] = pm
    spec["align"] = align_info(raw_lays["mn01_base_map_00"])

    spec["split"] = SPLIT
    spec["zabuton"] = ZABUTON
    srgb = set()
    for files in (f_menu, f_parts):
        for data in files.values():
            if data[:4] == b"BNTX":
                for t in graphics_bntx.parse(data):
                    if t.name in tex_names and graphics_bntx.meta(t).get("srgb"):
                        srgb.add(t.name)
    spec["srgb"] = sorted(srgb)
    spec["textures"] = {}
    for tn in sorted(tex_names):
        img = lt.get(tn)
        if img is None:
            print("  텍스처 없음", tn)
            continue
        fn = "tex/" + tn.replace("^", "_") + ".png"
        spec["textures"][tn] = cs.tex(tn, img, DST / fn, DST) or fn

    msg = cw.messages()
    texts = {k: msg[k] for k in LABELS}
    for m in MODES:
        texts[m[2]] = msg[m[2]]
        texts[m[3]] = msg[m[3]]
    spec["texts"] = texts
    spec["modes"] = [{"button": b, "key": k, "name": n, "detail": d, "icon": i, "win": w, "joycon": 1 <= b <= 3, "next": nx}
                     for b, k, n, d, i, w, nx in MODES]
    names = "".join(msg[m[2]] for m in MODES)
    details = "".join(msg[m[3]] for m in MODES)
    use = {
        "bqfont_middle": names + texts["mn01_mode_ctrl_close"],
        "bqfont_middle_shadow": texts["mn01_mode_ctrl_close"],
        "bqfont_small": details,
    }
    spec["fonts"] = {}
    for fam, s in use.items():
        spec["fonts"][fam] = fw.font_ref(fam, s)
        print(fam, len(spec["fonts"][fam]["chars"]), "chars")

    spec["sounds"] = {}
    for label, (vol, ev) in SE.items():
        src = ROOT / "extracted" / "converted" / "charsel" / "sound" / f"{label}.wav"
        f = cs.sound(label, src, DST / "sound" / f"{label}.wav", DST) or f"sound/{label}.wav"
        spec["sounds"][label] = {"file": f, "gain": round(vol / 127, 4),
                                 "evidence": "[판독] menu01 ComUiMap::UpdateProcess, 볼륨 [데이터 fsar], 렌더 근사(sound_seq.py, charsel 변환물)"}
    (DST / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("spec.json", (DST / "spec.json").stat().st_size, "B", len(spec["textures"]), "textures")


if __name__ == "__main__":
    main()
