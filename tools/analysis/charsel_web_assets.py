"""캐릭터 선택 화면(독립 모듈 web/script/shell/charselect) 에셋 — 원본 레이아웃·폰트·메시지·데이터·소리·캐릭터 → web/assets/charselect.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/charsel_web_assets.py [ui] [sound] [chara]   (인자 없으면 전부)

근거·필드 뜻: web/docs/shell/charselect.md. 원본 bflyt/bflan 을 그대로 내보내지 않고 모듈 자체 명세(spec.json)로 바꾼다:
  layouts{이름: {nodes[], mats[], anims{태그: {len, loop, tracks[]}}}}
    node = {n 이름, p 부모 번호, k 'null'|'pic'|'txt'|'wnd'|'part', v 보임, ia 자식 알파 전파, o/po 원점(x −1 왼·0 가운데·1 오른, y 1 위·0·−1 아래),
            t [x,y], r z회전(도), s [sx,sy], z [w,h], a 알파, vc 정점색[TL,TR,BL,BR] RGBA, m 재질 번호, uv [8],
            txt {font, fs, cs, al, text}, wnd {fs{l,r,t,b}, frame 재질, content 재질, cvc}, part 레이아웃 이름, ov 부품 덮어쓰기}
    mat = {black, white (RGBA 0..255), tex [{name, wu, wv}], srt [{t, r, s}]}
    track = {node | mat, prop ('tx','ty','rz','sx','sy','w','h','a','vc<k>','vis','blk<k>','wht<k>','srt<i>.<k>'), step, keys [[f, v, 기울기]]}
  textures{원본 이름: 'tex/…png'}  — 픽셀 그대로(ui_render.LazyTextures, compSel 적용)
  fonts{패밀리: 글리프 아틀라스 메트릭}, texts{라벨: koKR}, chars[], sounds{}, env{}
"""
import json
import shutil
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import ui_font  # noqa: E402
import ui_lyt  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "charselect"
PARTS = BEA / "bq.nx.bea" / "Parts.lyt"
FONT_DIR = BEA / "font~font_kr.nx.bea" / "Parts.lyt" / "Font_kr"
MSG_DIR = ROOT / "extracted" / "message" / "koKR"
DATA = BEA / "bq.nx.bea" / "common" / "data"

# 이 화면이 쓰는 레이아웃(근거 docs 3절) → 내보낼 애니 태그. 부품은 부품 레이아웃 이름으로 따로 들어간다.
LAYOUTS = {
    "sys_bg_set_00": ["normal"],
    "sys_connect_tlp_00": ["in", "normal", "out"],
    "sys_base_charasel_00": ["in", "normal", "out"],
    "sys_win_charamodel_00": [""],
    "sys_win_charamodel_01": [""],
    "sys_win_charamodel_02": [""],
    "sys_win_charamodel_03": [""],
    "sys_base_charasel_01": ["in", "normal", "out"],
    "sys_btn_charasel_00": ["normal", "on", "off", "cursor", "press", "pressed", "disable", "miss"],
    "sys_btn_charasel_01": ["normal", "on", "off", "cursor", "disable"],
    "sys_cursor_charasel_00": ["normal"],
    "sys_face_02": [],
    "sys_username_01": [],
    "sys_icon_hard_01": [],
    "sys_guide_03": ["in", "normal", "out"],
    "sys_guide_text": [""],
    "sys_guide_pos_01": [],
    "sys_btn_ok_00": ["in", "normal", "press", "back"],
}
ORIGIN_X = {"left": -1, "center": 0, "right": 1}
ORIGIN_Y = {"top": 1, "center": 0, "bottom": -1}
KIND = {"pan1": "null", "pic1": "pic", "txt1": "txt", "wnd1": "wnd", "prt1": "part", "bnd1": "null", "ali1": "null", "scr1": "null"}
FLPA = {0: "tx", 1: "ty", 5: "rz", 6: "sx", 7: "sy", 8: "w", 9: "h"}

LABELS = ["mn01_connect_ui_chara_title", "mn01_connect_ui_chara_name", "mn01_connect_ui_chara_random", "mn01_connect_ui_chara_ok",
          "mn01_connect_ui_chara_CPU", "mn01_connect_ui_chara_number", "sys_ctrl_back"]
# 글리프가 필요한 글꼴과 문자열(라벨 문구 + 캐릭터 이름 + 번호). 패밀리 = 텍스트 페인 font(fcpx) 이름
FONT_USE = {
    "bqfont_middle": ["mn01_connect_ui_chara_title", "mn01_connect_ui_chara_CPU", "sys_ctrl_back", "@names", "@digits"],
    "bqfont_middle_shadow": ["mn01_connect_ui_chara_CPU", "sys_ctrl_back", "@digits"],
    "bqfont_large": ["mn01_connect_ui_chara_ok"],
    "bqfont_small": ["mn01_connect_ui_chara_random"],
}
SE = {  # 라벨: (볼륨/127 [데이터 fsar], 근거)
    "SQ_SE_SYS_CURSOR": (110, "[판독] FUN_710033a1e0 커서 이동 Play2D"),
    "SQ_SE_SYS_DECI": (110, "[판독] FUN_710033a1e0 결정"),
    "SQ_SE_SYS_ERROR": (60, "[판독] FUN_710033a1e0 잠김·불가 결정"),
    "SQ_SE_SYS_CANCEL": (110, "[판독] FUN_710033a1e0·b540 취소"),
    "SQ_SE_SYS_DECI_L": (52, "[판독] FUN_710033b540 OK"),
}
FSPJ = BEA / "_ResidentAudio.nx.bea" / "_Resident" / "AddonAudioProject.fspj"
CLIPS = ["co_idle00", "co_chr_idle00", "co_chr_slct00a", "co_chr_slct00b"]


def rgba(s):
    v = bytes.fromhex(s[1:])
    return [v[0], v[1], v[2], v[3]]


def walk(n):
    yield n
    for c in n.get("children", []):
        yield from walk(c)


def part_pane_info(raw):
    """prt1 속성의 pane 기본 정보(52 B) 덮어쓰기: {(부품 페인, 속성 이름): {t|s|z}}.
    basicUsage 비트 8 = 위치(+0x08, +0x0C), 16 = 크기(+0x28, +0x2C), 32 = 배율(+0x20, +0x24) [데이터: 값 해석 일관, docs 12.5][비트 이름 추정]"""
    out = {}
    p = struct.unpack_from("<H", raw, 6)[0]
    while p + 8 <= len(raw):
        mg, sz = raw[p:p + 4], struct.unpack_from("<I", raw, p + 4)[0]
        if sz == 0:
            break
        if mg == b"prt1":
            sec = raw[p:p + sz]
            pname = sec[0xC:0xC + 24].split(b"\0")[0].decode()
            o = 8 + 0x4C
            n = struct.unpack_from("<I", sec, o)[0]
            for i in range(n):
                e = o + 12 + i * 0x28
                name = sec[e:e + 24].split(b"\0")[0].decode()
                basic = sec[e + 25]
                info = struct.unpack_from("<I", sec, e + 36)[0]
                if not info or not name:
                    continue
                d = {}
                if basic & 8:
                    d["t"] = list(struct.unpack_from("<2f", sec, info + 0x08))
                if basic & 32:
                    d["s"] = list(struct.unpack_from("<2f", sec, info + 0x20))
                if basic & 16:
                    d["z"] = list(struct.unpack_from("<2f", sec, info + 0x28))
                if d:
                    out[(pname, name)] = d
        p += sz
    return out


def conv_layout(lay, mat_names, pane_info=None):
    mats_src = lay["materials"]
    mat_index = {m["name"].strip(): i for i, m in enumerate(mats_src)}
    mi = lambda name: mat_index.get((name or "").strip(), -1)  # noqa: E731  (창 내용 재질 이름에 뒤 공백이 붙어 있다 "win_00C ")
    mats = [{"name": m["name"], "black": rgba(m["black"]), "white": rgba(m["white"]),
             "tex": [{"name": t["tex"], "wu": t["wrapU"], "wv": t["wrapV"]} for t in m["texMaps"]],
             "srt": [{"t": list(s["t"]), "r": s["r"], "s": list(s["s"])} for s in m["texSrt"]],
             **({"blend": m["blend"]} if m.get("blend") else {})} for m in mats_src]
    for m in mats:
        for t in m["tex"]:
            mat_names.add(t["name"])
    nodes = []

    def add(p, parent):
        k = KIND.get(p["type"], "null")
        n = {"n": p["name"], "p": parent, "k": k, "v": bool(p["visible"]), "ia": bool(p["influencedAlpha"]),
             "o": [ORIGIN_X[p["origin"][0]], ORIGIN_Y[p["origin"][1]]], "po": [ORIGIN_X[p["parentOrigin"][0]], ORIGIN_Y[p["parentOrigin"][1]]],
             "t": [p["translate"][0], p["translate"][1]], "r": p["rotate"][2], "s": list(p["scale"]), "z": list(p["size"]), "a": p["alpha"]}
        if k == "pic":
            n["vc"] = [rgba(c) for c in p["vtxColors"]]
            n["m"] = mi(p["material"])
            n["uv"] = list(p["uvs"][0]) if p.get("uvs") else [0, 0, 1, 0, 0, 1, 1, 1]
        elif k == "txt":
            n["m"] = mi(p["material"])
            n["vc"] = [rgba(p["colorTop"]), rgba(p["colorTop"]), rgba(p["colorBottom"]), rgba(p["colorBottom"])]
            n["txt"] = {"font": p["font"].rsplit(".", 1)[0], "fs": list(p["fontSize"]), "cs": p["charSpace"],
                        "al": [ORIGIN_X[p["textAlign"]["x"]], ORIGIN_Y[p["textAlign"]["y"]]], "text": p.get("text", "")}
        elif k == "wnd":
            c = p["content"]
            n["vc"] = [rgba(x) for x in c["vtxColors"]]
            n["wnd"] = {"fs": p["frameSize"], "frame": mi(p["frames"][0]["material"]) if p.get("frames") else -1,
                        "content": mi(c["material"]), "flags": p.get("windowFlags", 0)}
            n["m"] = n["wnd"]["content"]
        elif k == "part":
            n["part"] = p["layoutFile"]
            n["mag"] = list(p.get("magnify", [1, 1]))
            ov = []
            for pr in p.get("properties", []):
                if not pr["name"]:
                    continue
                o = {"n": pr["name"]}
                if pr["basicUsage"] & 1:   # [추정] bit0 = 보이기 덮어쓰기, bit1 = 값
                    o["vis"] = bool(pr["basicUsage"] & 2)
                od = pr.get("overrideData")
                if od and od.get("type") == "pic1":
                    o["vc"] = [rgba(x) for x in od["vtxColors"]]
                if od and od.get("type") == "txt1":
                    o["vc"] = [rgba(od["colorTop"]), rgba(od["colorTop"]), rgba(od["colorBottom"]), rgba(od["colorBottom"])]
                o.update((pane_info or {}).get((p["name"], pr["name"]), {}))
                if len(o) > 1:
                    ov.append(o)
            if ov:
                n["ov"] = ov
        idx = len(nodes)
        nodes.append(n)
        for ch in p.get("children", []):
            add(ch, idx)

    add(lay["root"], -1)
    return nodes, mats


def conv_anim(an, nodes, mats):
    ni = {n["n"]: i for i, n in enumerate(nodes)}
    mi = {m["name"].strip(): i for i, m in enumerate(mats)}
    tracks = []
    for e in an["entries"]:
        for tg in e["tags"]:
            for tr in tg["tracks"]:
                k = tr["target"]
                tag = tg["tag"]
                if e["target"] == "pane" and e["name"] in ni:
                    ref = {"node": ni[e["name"]]}
                    if tag == "FLPA":
                        prop = FLPA.get(k)
                    elif tag == "FLVC":
                        prop = "a" if k == 16 else f"vc{k}"
                    elif tag == "FLVI":
                        prop = "vis"
                    else:
                        prop = None
                elif e["target"] == "material" and e["name"].strip() in mi:
                    ref = {"mat": mi[e["name"].strip()]}
                    if tag == "FLMC":
                        prop = f"blk{k}" if k < 4 else f"wht{k - 4}"
                    elif tag == "FLTS":
                        prop = f"srt{tr['index']}.{k}"
                    else:
                        prop = None
                else:
                    prop = None
                if prop is None:
                    print(f"    무시: {e['name']} {tag} {k}")
                    continue
                keys = [[round(x, 6) for x in kk] for kk in tr["keys"]]
                tracks.append({**ref, "prop": prop, "step": tr["curve"] != "hermite", "keys": keys})
    return {"len": an["frameSize"], "loop": bool(an["loop"]), "tracks": tracks}


def messages():
    out = {}
    for p in sorted(MSG_DIR.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(d, dict):
            out.update(d)
    return out


def fcpx_fonts():
    files = ui_sarc.read_files(str(FONT_DIR / "FcpxSet.nbfcpxsetlyt"))
    return {Path(n).stem: ui_lyt.parse_bfcpx(d)["fonts"] for n, d in files.items() if n.startswith("fcpx/") and n.endswith(".bfcpx")}


def decode_sheets_any(b, f):
    """ui_font.decode_sheets + BC7(확장 폰트의 컬러 아이콘 시트, 0x20). 반환 = RGBA 시트 목록(커버리지 시트는 L→알파)"""
    try:
        return [Image.merge("RGBA", [Image.new("L", s.size, 255)] * 3 + [s]) if s.mode == "L" else s for s in ui_font.decode_sheets(b, f)[0]]
    except ValueError:
        pass
    import texture2ddecoder as t2d
    from ui_font import bntx_extract, swizzle
    off, size = f["_sheet_blob"]
    bn = b[off:off + size]
    nx = bntx_extract.NXHeader("<")
    nx.data(bn, 0x20)
    p = struct.unpack_from("<q", bn, nx.infoPtrAddr)[0]
    info = bntx_extract.BRTIInfo("<")
    info.data(bn, p)
    fmt = info.format_ >> 8
    bw, bh = bntx_extract.blk_dims.get(fmt, (1, 1))
    bpp = bntx_extract.bpps[fmt]
    data_addr = struct.unpack_from("<q", bn, info.ptrsAddr)[0]
    layers = info.numFaces
    layer_size = info.imageSize // layers
    w, h = info.width, info.height
    need = bntx_extract.DIV_ROUND_UP(w, bw) * bntx_extract.DIV_ROUND_UP(h, bh) * bpp
    out = []
    for i in range(layers):
        raw = bn[data_addr + i * layer_size:data_addr + (i + 1) * layer_size]
        lin = swizzle.deswizzle(w, h, bw, bh, bpp, info.tileMode, info.alignment, info.sizeRange, raw)[:need]
        if fmt != 0x20:
            raise ValueError(f"sheet format {hex(info.format_)}")
        img = Image.frombytes("RGBA", (w, h), t2d.decode_bc7(lin, w, h), "raw", "BGRA")
        out.append(img.transpose(Image.FLIP_TOP_BOTTOM))   # ui_font 과 같은 상하 반전 규칙
    return out


def build_atlas(family, fonts, text):
    """fcpx 목록 순서(usen → 본 → extension)로 글자를 가진 첫 폰트의 셀 [추정: 복합 폰트 대체 순서]. 셀 픽셀 그대로"""
    loaded = []
    for fn in fonts:
        p = FONT_DIR / fn.replace(".bffnt", ".ffnt")
        b = p.read_bytes()
        f, cmap, widths = ui_font.parse_ffnt(b)
        loaded.append((p.stem, f, cmap, widths, b))
    main = loaded[1] if len(loaded) > 1 else loaded[0]
    chars = sorted(set(text) - {"\n", "\r"})
    decoded = {}
    cw = max(x[1]["tglp"]["cellW"] for x in loaded)
    ch = max(x[1]["tglp"]["cellH"] for x in loaded)
    cols = 16
    rows = (len(chars) + cols - 1) // cols
    px_, py_ = cw + 2, ch + 2
    atlas = Image.new("RGBA", (cols * px_, max(1, rows) * py_), (255, 255, 255, 0))
    glyphs = {}
    for i, c in enumerate(chars):
        for stem, f, cmap, widths, b in loaded:
            gi = cmap.get(ord(c))
            if gi is None:
                continue
            if stem not in decoded:
                decoded[stem] = decode_sheets_any(b, f)
            left, gw, adv = widths.get(gi, tuple(f["finf"]["defaultWidth"]))
            sh, gx, gy = ui_font.glyph_cell(f, gi)
            t = f["tglp"]
            cell = decoded[stem][sh].crop((gx, gy, gx + t["cellW"], gy + t["cellH"]))
            ax, ay = (i % cols) * px_ + 1, (i // cols) * py_ + 1
            atlas.paste(cell, (ax, ay))
            glyphs[c] = {"x": ax, "y": ay, "w": gw, "h": t["cellH"], "left": left, "adv": adv, "baseline": t["baseline"],
                         "color": stem.endswith("extension") or stem.endswith("extension_shadow")}
            break
        else:
            print(f"  {family}: 글자 없음 {c!r} U+{ord(c):04X}")
    fi = main[1]["finf"]
    return atlas, {"height": fi["height"], "width": fi["width"], "ascent": fi["ascent"], "image": f"font/{family}.png", "glyphs": glyphs}


def build_ui(spec):
    files = ui_sarc.read_files(str(PARTS))
    lt = ui_render.LazyTextures()
    for data in files.values():
        if data[:4] == b"BNTX":
            lt.add_bntx(data)
    tex_names = set()
    layouts = {}
    for name, tags in LAYOUTS.items():
        raw = files[f"blyt/{name}.bflyt"]
        lay = ui_lyt.parse_bflyt(raw)
        assert not lay["_check"], (name, lay["_check"])
        nodes, mats = conv_layout(lay, tex_names, part_pane_info(raw))
        anims = {}
        for t in tags:
            fn = f"anim/{name}_{t}.bflan" if t else f"anim/{name}.bflan"
            an = ui_lyt.parse_bflan(files[fn])
            anims[t or an["tag"]["name"] or "loop"] = conv_anim(an, nodes, mats)
        layouts[name] = {"size": lay["layout"]["size"], "nodes": nodes, "mats": mats, "anims": anims}
        print(name, len(nodes), "nodes", len(mats), "mats", list(anims))
    # 얼굴: UiSharedTextureModule::GetPCFace "face_%s_pc%02d^u" 크기 표 "128" [판독 main @0x7100296dc4, mg1801 UI 보고] → face_128_pcNN^u.
    # 부품 이름도 x_parts_pc128. 원본 bq Parts.lyt timg
    chars = json.loads((DATA / "characterlist.json").read_text(encoding="utf-8-sig"))["PlayerCharacterData"]
    for c in chars:
        tex_names.add("face_128_pc%02d^u" % c["Number"])
    import graphics_bntx
    srgb = set()
    for data in files.values():
        if data[:4] == b"BNTX":
            for t in graphics_bntx.parse(data):
                if t.name in tex_names and graphics_bntx.meta(t).get("srgb"):
                    srgb.add(t.name)
    spec["srgb"] = sorted(srgb)   # sRGB 형식 텍스처(BC7_SRGB·BC3_SRGB) — 읽을 때 선형으로 푼다 [데이터]
    spec["textures"] = {}
    for tn in sorted(tex_names):
        img = lt.get(tn)
        if img is None:
            print("  텍스처 없음", tn)
            continue
        fn = "tex/" + tn.replace("^", "_") + ".png"
        img.save(DST / fn, optimize=True)
        spec["textures"][tn] = fn
    spec["layouts"] = layouts

    msg = messages()
    texts = {k: msg[k] for k in LABELS}
    for c in chars:
        texts[c["text label"]] = msg[c["text label"]]
    spec["texts"] = texts
    names = "".join(msg[c["text label"]] for c in chars)
    cpx = fcpx_fonts()
    spec["fonts"] = {}
    for fam, use in FONT_USE.items():
        s = "".join(names if u == "@names" else "0123456789" if u == "@digits" else texts[u] for u in use)
        img, meta = build_atlas(fam, cpx[fam], s)
        img.save(DST / meta["image"], optimize=True)
        spec["fonts"][fam] = meta
        print(fam, cpx[fam], len(meta["glyphs"]), "glyphs", img.size)


def build_chars(spec, with_glb):
    chars = json.loads((DATA / "characterlist.json").read_text(encoding="utf-8-sig"))["PlayerCharacterData"]
    sel = json.loads((DATA / "selectCharacterList.json").read_text(encoding="utf-8-sig"))["CharacterList"]
    out = []
    for i, (c, s) in enumerate(zip(chars, sel)):
        key = "pc%02d" % c["Number"]
        out.append({"index": i, "btn": s["BtnNo"], "pc": key, "label": c["text label"], "scale": c["IndividualScale"],
                    "cam": [s["CameraPositionX"], s["CameraPositionY"], s["CameraPositionZ"]], "fov": s["CameraFovY"],
                    "idle": "co_chr_idle00" if i in (6, 11) else "co_idle00",
                    "lock": 1 if i == 12 else 0 if i == 21 else None,
                    "glb": None})
    if with_glb:
        import charsel_chara
        for e in out:
            e.update(charsel_chara.convert(e["pc"], CLIPS if e["idle"] == "co_chr_idle00" else [x for x in CLIPS if x != "co_chr_idle00"], DST / "chara", reuse=True))
    else:
        old = DST / "spec.json"
        if old.exists():
            prev = {x["pc"]: x for x in json.loads(old.read_text(encoding="utf-8")).get("chars", [])}
            for e in out:
                p = prev.get(e["pc"], {})
                for k in ("glb", "clips", "uv", "eye"):
                    if k in p:
                        e[k] = p[k]
    spec["chars"] = out
    env = json.loads((ROOT / "analysis" / "charsel_env_dump.json").read_text(encoding="utf-8"))
    light = env[1]["models"][0]["materials"][0]["params"]
    spec["env"] = {"lightColor": light["directional_light_color"], "lightRotDeg": light["directional_light_overwrite_rotation"],
                   "near": 0.1, "far": 1000.0, "rtScale": 1.0}


def build_sound(spec):
    import numpy as np  # noqa: F401
    from sound_fsar import Fsar  # noqa: F401
    import subprocess
    (DST / "sound").mkdir(exist_ok=True)
    spec["sounds"] = {}
    for label, (vol, ev) in SE.items():
        tmp = ROOT / "extracted" / "converted" / "charsel" / "sound" / f"{label}.wav"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(FSPJ), label, str(tmp)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        shutil.copyfile(tmp, DST / "sound" / f"{label}.wav")
        spec["sounds"][label] = {"file": f"sound/{label}.wav", "gain": round(vol / 127, 4), "evidence": ev + ", 렌더 근사(sound_seq.py)"}
    build_bgm(spec)
    build_voices(spec)


def build_bgm(spec):
    """SM_BGM_MENU_MAP(menu01 SoundManager::PlayBgm, docs 12.3): BFSTM 을 vgmstream 으로 그대로 디코드(루프 무시 1회). 루프 지점은 BFSTM 헤더 값"""
    import sound_bfstm
    label = "SM_BGM_MENU_MAP"
    src = ROOT / "extracted" / "romfs" / "stream" / f"{label}.dspadpcm.bfstm"
    info = sound_bfstm.info(src)
    out = DST / "sound" / f"{label}.wav"
    sound_bfstm.decode(src, out)
    rate = info["sampleRate"]
    spec["bgm"] = {"label": label, "file": f"sound/{label}.wav", "gain": round(33 / 127, 4), "rate": rate,
                   "loopStart": info["loopStart"] / rate, "loopEnd": info["frames"] / rate,
                   "evidence": "[판독] menu01 SequenceManager::Initialize → SoundManager::PlayBgm, [데이터] fsar 볼륨 33·BFSTM 루프"}
    print(label, out.stat().st_size, "B", spec["bgm"])


def build_voices(spec):
    """SQ_VOI_PCnn_MENU00_SELECT 변형 웨이브(docs 12.4): prg 의 키 60·61·62 영역 웨이브(userproc 1 이 T14 = 0..T15−1 로 고른다고 [추정]).
    닌군(pc62)처럼 userproc 가 없는 시퀀스는 sound_seq.py 렌더 그대로 1개."""
    import numpy as np
    import subprocess
    from sound_seq import Fsar, SoundSet, disasm, parse_fseq, write_wav
    fs = Fsar(FSPJ)
    ss = SoundSet(fs)
    vdir = DST / "sound" / "voice"
    vdir.mkdir(parents=True, exist_ok=True)
    out = {}
    for c in spec["chars"]:
        num = c["pc"][2:]
        label = f"SQ_VOI_PC{num}_MENU00_SELECT"
        s = fs.find(label)
        fseq = parse_fseq(fs.file_bytes(s["fileId"]))
        cmds = list(disasm(fseq["data"], s["sequence"]["startOffset"]))
        files = []
        if any(cm.get("name") == "userproc" for cm in cmds):
            prg = next(cm["value"] for cm in cmds if cm.get("name") == "prg")
            t15 = next((cm["value"] for cm in cmds if cm.get("name") == "setvar" and cm.get("var") == 47), 3)
            bank = ss.bank(int(s["sequence"]["banks"][0].split(":")[1]))
            inst = bank["instruments"][prg]
            for k in range(t15):
                key = 60 + k
                reg = next(r for kmax, vels in inst if key <= kmax for vmax, r in vels if 127 <= vmax)
                wa, wi = bank["waveIds"][reg["waveIdIndex"]]
                w = ss.wave(wa, wi)
                x = np.stack(w["channels"], 1).astype(np.float32) / 32768.0
                ratio = 2 ** ((key - reg["originalKey"]) / 12.0) * reg.get("pitch", 1.0)
                if abs(ratio - 1) > 1e-6:
                    n = int(len(x) / ratio)
                    t = np.arange(n) * ratio
                    x = np.stack([np.interp(t, np.arange(len(x)), x[:, ch]) for ch in range(x.shape[1])], 1)
                x = x * (reg["volume"] / 127.0)   # 영역 볼륨 [근사: 선형]
                fn = f"{c['pc']}_{k}.wav"
                write_wav(vdir / fn, x if x.shape[1] > 1 else x[:, 0], rate=w["sampleRate"])
                files.append(f"sound/voice/{fn}")
        else:
            tmp = ROOT / "extracted" / "converted" / "charsel" / "sound" / f"{label}.wav"
            subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(FSPJ), label, str(tmp)], capture_output=True)
            shutil.copyfile(tmp, vdir / f"{c['pc']}_0.wav")
            files.append(f"sound/voice/{c['pc']}_0.wav")
        out[c["pc"]] = {"label": label, "files": files, "gain": round(s["volume"] / 127, 4)}
    spec["voices"] = out
    print("voices", {k: len(v["files"]) for k, v in out.items()})


def main():
    what = set(sys.argv[1:]) or {"ui", "sound", "chara"}
    DST.mkdir(parents=True, exist_ok=True)
    spec_path = DST / "spec.json"
    spec = json.loads(spec_path.read_text(encoding="utf-8")) if spec_path.exists() else {}
    spec["version"] = 1
    spec["screen"] = [1920, 1080]
    spec["source"] = "Super Mario Party Jamboree US v0 — web/tools/analysis/charsel_web_assets.py, 명세 web/docs/shell/charselect.md"
    if "ui" in what:
        for d in ("tex", "font"):
            (DST / d).mkdir(parents=True, exist_ok=True)
        build_ui(spec)
    build_chars(spec, "chara" in what)
    if "sound" in what:
        build_sound(spec)
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("spec.json", spec_path.stat().st_size, "B")


if __name__ == "__main__":
    main()
