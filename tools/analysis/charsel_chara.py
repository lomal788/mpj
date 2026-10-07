"""캐릭터 선택 화면 카드용 캐릭터 glb — tools/character_glb.py 변환(출력 폴더만 extracted/converted/charsel 로 따로) → 용량 정리 → web/assets/charselect/chara.

charsel_web_assets.py 가 부른다. 클립 = 카드 뷰가 등록하는 co_idle00, co_chr_idle00(pc07·pc13 만 있음), co_chr_slct00a, co_chr_slct00b
[판독 main FUN_7100340180] + 그 모션들의 blink 묶음. 정리 규칙(정점 속성·상수 채널·텍스처 공유·mpjUv)은 mg1801_web_charas.py 와 같다.
다른 점(docs/shell/charselect.md 12.2): 눈알 표시 정점색 _C1(r = 눈 0, b = 눈 1)과 눈 국소 좌표 TEXCOORD_2(눈꺼풀 셰이더 그래프용)를 남긴다.
reuse=True 면 extracted/converted/charsel/<key> 의 기존 변환(클립이 같을 때)을 다시 쓴다.
"""
import hashlib
import json

import numpy as np
from PIL import Image
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import character_glb  # noqa: E402
import mg1801_web_charas as mwc  # noqa: E402

SRC = ROOT / "extracted" / "converted" / "charsel"
CHARLIST = ROOT / "extracted" / "bea" / "bq.nx.bea" / "common" / "data" / "characterlist.json"


KEEP_ATTR = {"_C1", "_C2", "TEXCOORD_2"}
# 몸 재질 셰이더 그래프 판독 표(docs 12.11, charsel_body_graph.py 출력)
GRAPH = ROOT / "analysis" / "mat" / "charsel_body_graph.json"


def body_rule(key, fr):
    """알베도 좌표 S·O·_C1/_C2 오프셋 항과 기본색 섞기(docs 12.11) [판독]"""
    g = json.loads(GRAPH.read_text(encoding="utf-8")).get(key)
    if not g:
        return None
    out = {"uv": g["uv"]}
    if "tint" in g:
        c1 = fr.get("params", {}).get("material_utility_color1", {}).get("value", [0, 0, 0, 1])[:3]
        out["tint"] = {"mask": g["tint"]["mask"], "f": g["tint"]["f"], "color": [round(v, 6) for v in c1]}
    return out


def eye_info(js, rest, src, alb, aw, ah, mot, uvso=None):
    """눈알 마스크·눈꺼풀 데이터(docs 12.2). 반환: {albedoMask, lid}"""
    im = np.array(Image.open(src / "tex" / alb).convert("RGBA")) if alb else None
    low_alpha = 0
    t2y = []
    body_cols = []
    for m in js["meshes"]:
        for pr in m["primitives"]:
            a = pr["attributes"]
            if "_C1" not in a or "TEXCOORD_0" not in a:
                continue
            c1 = mwc.acc_array(js, rest, a["_C1"])
            sel = (c1[:, 0] > 0.5) | (c1[:, 2] > 0.5)
            if not sel.any():
                continue
            if "TEXCOORD_2" in a:
                t2y.extend(mwc.acc_array(js, rest, a["TEXCOORD_2"])[sel, 1].tolist())
            if im is None:
                continue
            u0 = mwc.acc_array(js, rest, a["TEXCOORD_0"])[sel].astype(np.float64)
            H, W = im.shape[:2]
            if uvso:
                u0 = u0 * np.array(uvso[0]) + np.array(uvso[1])
            elif ah == 2 * aw:
                u0[:, 1] = 0.5 + 0.5 * u0[:, 1]
            elif aw == 2 * ah:
                u0[:, 0] = 0.5 * u0[:, 0]
            x = ((u0[:, 0] % 1) * W).astype(int).clip(0, W - 1)
            y = ((u0[:, 1] % 1) * H).astype(int).clip(0, H - 1)
            low_alpha += int((im[y, x, 3] < 128).sum())
            if "_body__" in m["name"]:
                body_cols.append(im[y, x, :3].astype(float))
    out = {"albedoMask": low_alpha > 0}
    fr = js["materials"][0].get("extras", {}).get("fres", {}) if js["materials"] else {}
    # 흰자 칠하기(12.8 [추정])는 셰이더 그래프 판독으로 틀린 것이 확인돼 없앴다(docs 12.11): 캐서린 흰자는 알베도(v·0.8 + 0.2)가 준다
    lid = next((sm for sm in fr.get("samplers", []) if "eyelid" in sm["texture"] and sm["texture"].endswith(("_alb", "_arr_alb")) and sm.get("png")), None)
    if lid and t2y:
        a = np.array(Image.open(src / "tex" / lid["png"]).convert("RGBA"))[..., 3]
        col = a[:, a.shape[1] // 2]
        edge = float(np.argmax(col < 128)) / a.shape[0]
        params = fr.get("params", {})
        x0 = [params.get(p, {}).get("value", [0])[0] for p in ("material_utility_parameter2", "material_utility_parameter3")]
        y0 = [params.get(p, {}).get("value", [0, 0])[1] for p in ("material_utility_parameter2", "material_utility_parameter3")]
        bm = mot.get("fcl_blink00", {}).get("mat") or {}
        blink = (bm.get("materials", bm) or {}).get("body_m", {})
        xmin = []
        for i, p in enumerate(("material_utility_parameter2", "material_utility_parameter3")):
            v = blink.get(p, {}).get("0x00")
            xmin.append(min(v) if isinstance(v, list) else (v if v is not None else x0[i]))
        out["lid"] = {"png": lid["png"], "edge": round(edge, 4), "x0": x0, "y0": y0, "xmin": xmin, "bottom": round(max(t2y), 4)}
    return out


def convert(key, clips, dst_root, reuse=False):
    character_glb.OUT = str(SRC)
    meta_p = SRC / key / "meta.json"
    have = set()
    if reuse and meta_p.exists():
        have = {c["name"] for c in json.loads(meta_p.read_text(encoding="utf-8")).get("clipTable", [])}
    if not (reuse and set(clips) <= have):
        argv = sys.argv
        sys.argv = ["character_glb.py", key] + list(clips)
        try:
            character_glb.main()
        finally:
            sys.argv = argv
    src = SRC / key
    meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    glb_name = meta["glb"]
    js, rest = mwc.read_glb(src / glb_name)
    mats = mwc.material_pngs(js)
    alb = next((v.get("_a0") for k, v in mats.items() if k == "body_m"), None)
    aw, ah = mwc.png_size(src / "tex" / alb) if alb else (1, 1)

    def uv_rule(m):
        prim = m["primitives"][0]
        mat = js["materials"][prim["material"]]
        if mat["name"] != "body_m" or "TEXCOORD_0" not in prim["attributes"]:
            return None
        return "v2" if ah == 2 * aw else "u2" if aw == 2 * ah else None

    mot = json.loads((src / "motions.json").read_text(encoding="utf-8"))
    keep = list(clips) + sorted({b for m in clips for b in (mot.get(m, {}).get("blink") or {}).values()})
    body_fr = next((m.get("extras", {}).get("fres", {}) for m in js["materials"] if m["name"] == "body_m"), {})
    body = body_rule(key, body_fr)
    eyes = eye_info(js, rest, src, alb, aw, ah, mot, (body["uv"]["s"], body["uv"]["o"]) if body else None)
    drop = mwc.DROP_ATTR
    mwc.DROP_ATTR = drop - KEEP_ATTR
    try:
        js, rest, stats = mwc.slim(js, rest, set(keep) | {c + "_shape" for c in keep}, uv_rule)
    finally:
        mwc.DROP_ATTR = drop
    eye_mat, eye = mwc.eye_png(js)
    pngs = [im["uri"].split("/")[-1] for im in js.get("images", [])]
    if eye and eye not in pngs:
        pngs.append(eye)
    if "lid" in eyes and eyes["lid"]["png"] not in pngs:
        pngs.append(eyes["lid"]["png"])
    tex_root = dst_root / "tex"
    tex_root.mkdir(parents=True, exist_ok=True)
    tex_map = {}
    for pn in pngs:
        b = (src / "tex" / pn).read_bytes()
        h = hashlib.sha1(b).hexdigest()[:12]
        name = f"{Path(pn).stem}_{h}.png"
        if not (tex_root / name).exists():
            (tex_root / name).write_bytes(b)
        tex_map[pn] = "tex/" + name
    for im in js.get("images", []):
        im["uri"] = "../" + tex_map[im["uri"].split("/")[-1]]
    out = dst_root / key
    out.mkdir(parents=True, exist_ok=True)
    mwc.write_glb(out / glb_name, js, rest)
    (out / "motions.json").write_text(json.dumps(mwc.compact_motions(mot, keep), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cd = next(c for c in json.loads(CHARLIST.read_text(encoding="utf-8-sig"))["PlayerCharacterData"] if c["Number"] == int(key[2:]))
    clip_info = {c["name"]: {"frames": c["frames"], "loop": c["loop"]} for c in meta["clipTable"] if not c["name"].endswith("_shape")}
    print("%s glb %d B, clips %s, dropCh %d, tex %s" % (key, (out / glb_name).stat().st_size, clip_info, stats["droppedChannels"], pngs))
    return {"glb": f"chara/{key}/{glb_name}", "motions": f"chara/{key}/motions.json", "clips": clip_info,
            "eye": {"tex": "chara/" + tex_map[eye] if eye else None, "material": eye_mat,
                    "params": [cd["eye0_shaderparam"], cd["eye1_shaderparam"]], "albedoMask": eyes["albedoMask"],
                    **({"lid": {**{k: v for k, v in eyes["lid"].items() if k != "png"}, "tex": "chara/" + tex_map[eyes["lid"]["png"]]}} if "lid" in eyes else {})},
            "albedo": [aw, ah], **({"body": body} if body else {})}
