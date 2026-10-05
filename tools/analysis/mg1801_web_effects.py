"""mg1801 웹 이펙트 에셋 만들기 — effect_vfxb.py 덤프 → web/assets/mg1801/effect.

  c:/dev/mpj/.venv/Scripts/python tools/mg1801_web_effects.py

입력(effect 담당 덤프, 원본을 고치지 않는다):
  extracted/converted/effect/mg1801/vfxb.json, tex/*.png(+json), primitives.bfres
  extracted/converted/effect/mg1800/vfxb.json, tex/*.png(+json)
  extracted/converted/effect/mg_common/vfxb.json, tex/*.png(+json)
    — mg_common_pt_effect_00: PERFECT 텔롭 이펙트(main FUN_710043ce38 이 이름 "mg_common_pt_effect_00" 을 Create, 배율 1.5)
출력:
  web/assets/mg1801/effect/effects.json     웹이 쓰는 이미터 파라미터(아래 형식). 손으로 고치지 않는다
  web/assets/mg1801/effect/tex/<이름>.png   쓰는 텍스처(복사만, 픽셀 그대로)
  web/assets/mg1801/effect/primitives.glb   메시 프리미티브 4개(mg1801_bubble00/crown00/circle00/plane00)

프리미티브: graphics_bfres2gltf 의 gltf 명령은 BFRES 의 첫 모델만 내므로 tools/mg1801_web_effects_prim(BfresLibrary
VertexBufferHelper)로 모든 모델 정점을 primitives_mesh.json 으로 뽑고, 여기서 glb 로 묶는다. UV 는 원본 값 그대로
(왼쪽 위 원점, glTF 와 같은 방향)다.

프리미티브 ID → 모델 이름: G3NT 원소 순서 = BFRES 모델 순서로 맞춘다(08_effects.md 7.5 [추정]).
G3NT 8 B 값의 3·4번째 바이트(접선·정점색 슬롯으로 보임)가 ff 가 아닌 원소와 _t0·_c0 속성이 있는 모델이 같은 자리인지 검사한다.

effects.json 형식(값은 vfxb.json raw 그대로, 단위 = 원본: 프레임·월드 단위·라디안):
  aliases   로직 사건 이름 → 이미터셋 이름(ca::rm::util::ShowCommonEffect 표, 08_effects.md 3.4)
  textures  이름 → {file, width, height, format, srgb, alpha}
  primitives  ID(hex) → 모델 이름
  sets      이미터셋 이름 → {source, emitters: [Emitter]}
"""
import json
import shutil
import struct
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
EFF = ROOT / "extracted" / "converted" / "effect"
DST = ROOT / "web" / "assets" / "mg1801" / "effect"
PRIM_TOOL = ROOT / "web/tools/analysis" / "mg1801_web_effects_prim"

SETS = {
    "mg1801": ["mg1801_steam00", "mg1801_steam01", "mg1801_water_entry00", "mg1801_water_entry01"],
    "mg1800": ["mg1800_success00", "mg1800_success01"],
    "mg_common": ["mg_common_pt_effect_00"],
}
# main CMN_EFFECT_ID 표 @0x71019f1aa8: 0 = mg1800_success01, 1 = mg1800_success00 [데이터]
ALIASES = {
    "ca::rm::util::ShowCommonEffect#0": "mg1800_success01",
    "ca::rm::util::ShowCommonEffect#1": "mg1800_success00",
}
NONE_ID = (0, 0xFFFFFFFFFFFFFFFF)


def r6(v):
    if isinstance(v, float):
        return float(f"{v:.7g}")
    if isinstance(v, list):
        return [r6(x) for x in v]
    if isinstance(v, dict):
        return {k: r6(x) for k, x in v.items()}
    return v


def keys(table, n):
    return [[k["x"], k["y"], k["z"], k["time"]] for k in table["keys"][:n]]


def emitter(em, texmap, primmap, used_tex, used_prim):
    d = em["raw"]
    st, info, emi, sh, rs, pt, vel, col, sc = (d["static"], d["info"], d["emission"], d["shape"], d["render"], d["particle"],
                                               d["velocity"], d["color"], d["scale"])
    samplers = []
    for i, s in enumerate(d["samplers"]):
        if s["textureID"] in NONE_ID:
            continue
        name = texmap[s["textureID"]]
        used_tex.add(name)
        ta = d["texAnims"][i]
        sa = st["texScrollAnim"][i]
        samplers.append({
            "slot": i, "texture": name, "wrapU": s["wrapU"], "wrapV": s["wrapV"], "filter": s["filter"],
            "repeat": ta["repeat"], "invRandU": ta["invRandU"], "invRandV": ta["invRandV"],
            "patternAnimType": ta["patternAnimType"], "isScroll": ta["isScroll"], "isRotate": ta["isRotate"], "isScale": ta["isScale"],
            "scroll": [sa["scrollX"], sa["scrollY"]], "scrollAdd": [sa["scrollAddX"], sa["scrollAddY"]],
            "scrollRandom": [sa["scrollRandomX"], sa["scrollRandomY"]],
            "scale": [sa["scaleX"], sa["scaleY"]], "scaleAdd": [sa["scaleAddX"], sa["scaleAddY"]],
            "rotation": sa["rotation"], "rotationAdd": sa["rotationAdd"],
        })
    prim = None
    if pt["primitiveID"] not in NONE_ID:
        prim = primmap[pt["primitiveID"]]
        used_prim.add(prim)
    fields = {}
    for a in em["subsections"]:
        if a["magic"] in ("FRND", "FRN1", "FSPN", "CSDP"):
            fields[a["magic"]] = a["f32"][:16] if a["magic"] != "CSDP" else a["f32"][:16] + a["f32"][48:50]
    out = {
        "name": d["name"],
        "flag": d["flag"],
        "calcType": info["calcType"], "followType": info["followType"],
        "emit": {
            "oneTime": emi["isOneTime"], "start": emi["start"], "timing": emi["timing"], "duration": emi["duration"],
            "rate": emi["rate"], "rateRandom": emi["rateRandom"], "interval": emi["interval"], "intervalRandom": emi["intervalRandom"],
            "positionRandom": emi["positionRandom"], "worldGravity": emi["isWorldGravity"], "emitDist": emi["isEmitDistEnabled"],
        },
        "shape": {
            "type": sh["volumeType"], "sweepStartRandom": sh["sweepStartRandom"], "arcType": sh["arcType"],
            "sweepLongitude": sh["sweepLongitude"], "sweepLatitude": sh["sweepLatitude"], "sweepStart": sh["sweepStart"],
            "surfacePosRandom": sh["volumeSurfacePosRand"], "caliberRatio": sh["caliberRatio"],
            "lineCenter": sh["lineCenter"], "lineLength": sh["lineLength"],
            "radius": [sh["volumeRadiusX"], sh["volumeRadiusY"], sh["volumeRadiusZ"]],
            "formScale": [sh["volumeFormScaleX"], sh["volumeFormScaleY"], sh["volumeFormScaleZ"]],
            "primEmitType": sh["primEmitType"],
            "numDivideCircle": sh["numDivideCircle"], "numDivideCircleRandom": sh["numDivideCircleRandom"],
            "numDivideLine": sh["numDivideLine"], "numDivideLineRandom": sh["numDivideLineRandom"],
        },
        "trs": {
            "trans": [info["transX"], info["transY"], info["transZ"]],
            "transRand": [info["transRandX"], info["transRandY"], info["transRandZ"]],
            "rotate": [info["rotateX"], info["rotateY"], info["rotateZ"]],
            "rotateRand": [info["rotateRandX"], info["rotateRandY"], info["rotateRandZ"]],
            "scale": [info["scaleX"], info["scaleY"], info["scaleZ"]],
        },
        "emitterColor0": [info["color0R"], info["color0G"], info["color0B"], info["color0A"]],
        "emitterColor1": [info["color1R"], info["color1G"], info["color1B"], info["color1A"]],
        "fade": {"isFadeEmit": info["isFadeEmit"], "alphaFadeTime": info["alphaFadeTime"],
                 "isAlphaFadeIn": info["isAlphaFadeIn"], "isScaleFadeIn": info["isScaleFadeIn"], "fadeInTime": info["fadeInTime"]},
        "particle": {
            "life": pt["life"], "lifeRandom": pt["lifeRandom"], "infiniteLife": pt["infiniteLife"],
            "billboardType": pt["billboardType"], "rotType": pt["rotType"], "momentumRandom": pt["momentumRandom"],
            "isRotate": [pt["isRotateX"], pt["isRotateY"], pt["isRotateZ"]],
            "rotRevRand": [pt["rotRevRandX"], pt["rotRevRandY"], pt["rotRevRandZ"]],
            "primitive": prim,
        },
        "velocity": {
            "allDirection": vel["allDirection"], "designatedDirScale": vel["designatedDirScale"],
            "designatedDir": [vel["designatedDirX"], vel["designatedDirY"], vel["designatedDirZ"]],
            "diffusionDirAngle": vel["diffusionDirAngle"], "xzDiffusion": vel["xzDiffusion"],
            "diffusion": [vel["diffusionX"], vel["diffusionY"], vel["diffusionZ"]],
            "velRandom": vel["velRandom"], "emVelInherit": vel["emVelInherit"],
        },
        "gravity": [st["gravityDirX"] * st["gravityScale"], st["gravityDirY"] * st["gravityScale"], st["gravityDirZ"] * st["gravityScale"]],
        "airRes": st["airRes"],
        "rotate": {
            "init": [st["rotateInitX"], st["rotateInitY"], st["rotateInitZ"]],
            "initRand": [st["rotateInitRandX"], st["rotateInitRandY"], st["rotateInitRandZ"]],
            "add": [st["rotateAddX"], st["rotateAddY"], st["rotateAddZ"]],
            "addRand": [st["rotateAddRandX"], st["rotateAddRandY"], st["rotateAddRandZ"]],
            "regist": st["rotateRegist"],
        },
        "color": {
            "color0Type": col["color0Type"], "alpha0Type": col["alpha0Type"], "color1Type": col["color1Type"], "alpha1Type": col["alpha1Type"],
            "color0": [col["color0R"], col["color0G"], col["color0B"]], "alpha0": col["alpha0"],
            "color1": [col["color1R"], col["color1G"], col["color1B"]], "alpha1": col["alpha1"],
            "colorScale": st["colorScale"],
            "color0Keys": keys(st["color0"], st["numColor0Keys"]), "alpha0Keys": keys(st["alpha0"], st["numAlpha0Keys"]),
            "color1Keys": keys(st["color1"], st["numColor1Keys"]), "alpha1Keys": keys(st["alpha1"], st["numAlpha1Keys"]),
        },
        "scale": {"base": [sc["scaleX"], sc["scaleY"], sc["scaleZ"]],
                  "random": [sc["scaleRandomX"], sc["scaleRandomY"], sc["scaleRandomZ"]],
                  "keys": keys(st["scaleAnim"], st["numScaleKeys"])},
        "render": {"blendType": rs["blendType"], "isBlendEnable": rs["isBlendEnable"], "isDepthTest": rs["isDepthTest"],
                   "isDepthMask": rs["isDepthMask"], "displaySide": rs["displaySide"], "isAlphaTest": rs["isAlphaTest"],
                   "alphaThreshold": rs["alphaThreshold"]},
        "samplers": samplers,
        "fields": fields,
        "children": [emitter(c, texmap, primmap, used_tex, used_prim) for c in em["children"]],
    }
    return r6(out)


def prim_mesh_json():
    p = EFF / "mg1801" / "prim" / "primitives_mesh.json"
    if not p.exists():
        subprocess.run(["dotnet", "run", "-c", "Release", "--", str(EFF / "mg1801" / "primitives.bfres"), str(p)],
                       cwd=PRIM_TOOL, check=True)
    return json.loads(p.read_text(encoding="utf-8"))


def write_glb(models, path):
    """모델마다 메시 하나(셰이프 1개씩). POSITION·NORMAL·TEXCOORD_0(있으면)·indices(u16)."""
    bin_parts, views, accs, meshes, nodes = [], [], [], [], []
    off = 0

    def add(data, target, ctype, count, typ, mn=None, mx=None):
        nonlocal off
        pad = (-len(data)) % 4
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target})
        bin_parts.append(data + b"\0" * pad)
        off += len(data) + pad
        a = {"bufferView": len(views) - 1, "componentType": ctype, "count": count, "type": typ}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accs.append(a)
        return len(accs) - 1

    for m in models:
        if len(m["shapes"]) != 1:
            raise SystemExit(f"{m['name']}: 셰이프 {len(m['shapes'])}개(1개만 예상)")
        s = m["shapes"][0]
        if s["primitive"] != "Triangles":
            raise SystemExit(f"{m['name']}: {s['primitive']}")
        A = s["attributes"]
        pos = [v[:3] for v in A["_p0"]["data"]]
        attrs = {"POSITION": add(b"".join(struct.pack("<3f", *p) for p in pos), 34962, 5126, len(pos), "VEC3",
                                 [min(p[i] for p in pos) for i in range(3)], [max(p[i] for p in pos) for i in range(3)])}
        if "_n0" in A:
            nrm = [v[:3] for v in A["_n0"]["data"]]
            attrs["NORMAL"] = add(b"".join(struct.pack("<3f", *n) for n in nrm), 34962, 5126, len(nrm), "VEC3")
        if "_u0" in A:
            uv = [v[:2] for v in A["_u0"]["data"]]
            attrs["TEXCOORD_0"] = add(b"".join(struct.pack("<2f", *u) for u in uv), 34962, 5126, len(uv), "VEC2")
        idx = s["indices"]
        ind = add(struct.pack(f"<{len(idx)}H", *idx), 34963, 5123, len(idx), "SCALAR")
        meshes.append({"name": m["name"], "primitives": [{"attributes": attrs, "indices": ind, "mode": 4}]})
        nodes.append({"name": m["name"], "mesh": len(meshes) - 1})
    binary = b"".join(bin_parts)
    gltf = {"asset": {"version": "2.0", "generator": "tools/mg1801_web_effects.py"},
            "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
            "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(binary)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
    path.write_bytes(out)


def main():
    DST.mkdir(parents=True, exist_ok=True)
    (DST / "tex").mkdir(exist_ok=True)
    mesh = prim_mesh_json()
    models = mesh["models"]
    doc = {
        "tool": "tools/mg1801_web_effects.py",
        "source": {},
        "note": "값은 effect_vfxb.py 덤프의 raw 그대로(프레임·월드 단위·라디안). 의미는 web/docs/engine/08_effects.md 4절",
        "aliases": ALIASES,
        "textures": {},
        "primitives": {},
        "sets": {},
    }
    used_tex, used_prim = set(), set()
    texdir = {}
    for arc, names in SETS.items():
        v = json.loads((EFF / arc / "vfxb.json").read_text(encoding="utf-8"))
        texmap = {int(t["id"], 16): t["name"] for t in v["textures"]}
        for n in texmap.values():
            texdir[n] = EFF / arc / "tex"
        primmap = {}
        if v["primitives"]:
            if len(v["primitives"]) != len(models):
                raise SystemExit("G3NT 수와 BFRES 모델 수가 다르다")
            for p, m in zip(v["primitives"], models):
                b = bytes.fromhex(p["data"])
                attrs = m["shapes"][0]["attributes"]
                if (b[2] != 0xFF) != ("_t0" in attrs) or (b[3] != 0xFF) != ("_c0" in attrs):
                    raise SystemExit(f"G3NT {p['id']} {p['data']} 와 {m['name']} 속성 {list(attrs)} 이 맞지 않는다")
                primmap[int(p["id"], 16)] = m["name"]
                doc["primitives"][p["id"]] = m["name"]
        doc["source"][arc] = v["source"]
        for es in v["emitterSets"]:
            if es["name"] in names:
                doc["sets"][es["name"]] = {"source": arc, "emitters": [emitter(e, texmap, primmap, used_tex, used_prim)
                                                                        for e in es["emitters"]]}
    for arc, names in SETS.items():
        for n in names:
            if n not in doc["sets"]:
                raise SystemExit(f"{n} 없음")
    for name in sorted(used_tex):
        src = texdir[name] / f"{name}.png"
        meta = json.loads((texdir[name] / f"{name}.json").read_text(encoding="utf-8"))
        im = Image.open(src)
        shutil.copyfile(src, DST / "tex" / f"{name}.png")
        doc["textures"][name] = {"file": f"tex/{name}.png", "width": meta["width"], "height": meta["height"],
                                 "format": meta["format"], "srgb": bool(meta.get("srgb")), "alpha": "A" in im.getbands()}
    write_glb(models, DST / "primitives.glb")
    (DST / "effects.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"sets {len(doc['sets'])}, textures {len(doc['textures'])}, primitives {sorted(used_prim)} -> {DST}")


if __name__ == "__main__":
    main()
