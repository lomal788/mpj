"""광장 셰이더 그래프 판독식 → 웹 그래프 정의(manifest.graphs) 정리 (docs/shell/plaza_3d.md §6.8).

입력: analysis/mat/plaza_graph_1.json(sg1), plaza_graph_2.json(sg2) — SASS 판독 식(GLSL 꼴, 설명 문구 섞임).
하는 일(식은 바꾸지 않고 이름·꼴만):
  - 설명 꼬리("  (…)", " — …", "/* … */", "[월드 공간]") 떼기, helpers dict/list → 함수 목록(이름 중복 제거)
  - 장면 UBO 이름 → 웹 유니폼: World_4·sg1 time(ms) → mpjMs, Layer_120..12c → env_utility_parameter1.xyzw [추정: sg1],
    Layer_130..13c → env_utility_parameter2.xyzw [추정: 같은 배치에서 다음 vec4], env_utility_parameterN → ENVn
  - 전역 텍스처 World[0xe0]·Layer[0x10]·Layer_tex10 → windnoise00 [추정: sg1], World[0xf0] → windnoise00 [근사: 정체 미확정]
  - 짧은 재질 파라미터 이름(mul_base_color 등) → material_ 접두
  - 판독이 자연어로 남긴 식은 OVERRIDE 에서 판독 내용 그대로 GLSL 로 옮김
출력: list[dict] (graph.ts GraphDef)
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = [os.path.join(ROOT, "analysis", "mat", "plaza_graph_1.json"), os.path.join(ROOT, "analysis", "mat", "plaza_graph_2.json")]

GLOBAL_TEX = {"World[0xe0]": "windnoise00", "Layer[0x10]": "windnoise00", "Layer_tex10": "windnoise00", "World[0xf0]": "windnoise00"}
APPROX_TEX = {"World[0xf0]": "전역 텍스처 World[0xf0] 정체 미확정 → windnoise00 [근사]"}
SHORT_PARAMS = ["mul_base_color", "mul_opacity", "base_color", "emissive_color_scale", "emissive_color", "metallic", "sss_normal_blend"]
LAYER = {"120": "ENV1.x", "124": "ENV1.y", "128": "ENV1.z", "12c": "ENV1.w", "130": "ENV2.x", "134": "ENV2.y", "138": "ENV2.z", "13c": "ENV2.w"}
ROTATE_AXIS = "mat3 rotateAxisAngle(vec3 a, float t){ float c = cos(t); float s = sin(t); float k = 1.0 - c; return mat3(c + a.x*a.x*k, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s, a.x*a.y*k - a.z*s, c + a.y*a.y*k, a.z*a.y*k + a.x*s, a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, c + a.z*a.z*k); }"

OVERRIDE = {
    ("menu00_deco_tree06_mt", "fs"): {
        "normal": "normalize(mix(Nw, sgTbn(Nw, sgNz(sn)), k*P1.x))",
        "emissive": "clamp(pow(max(1.0 - dot(Nw, viewDir), 0.0), P1.z), 0.0, 1.0)*C0.rgb",
    },
    ("menu00_stage_caustics", "fs"): {"normal": None},
    ("menu01_balloon01_mt", "fs"): {"baseColor": None},
    ("palm00_mt", "fs"): {"baseColor": None},
    ("menu00_deco_tree06_mt", "fs-base"): {"baseColor": None},
}
EXTRA_HELPERS = {
    "sgNz": "vec3 sgNz(vec2 n){ return vec3(n, sqrt(clamp(1.0 - dot(n, n), 0.0, 1.0))); }",
    "sgTbn": "vec3 sgTbn(vec3 n, vec3 ts){ vec3 t = normalize(Tw); return normalize(t*ts.x + cross(n, t)*tw*ts.y + n*ts.z); }",
}


def clean(e):
    if e is None:
        return None
    s = e.strip()
    s = re.sub(r"^\[월드 공간\]\s*", "", s)
    s = re.sub(r"/\*.*?\*/", "", s)
    s = re.split(r"\s+—\s+", s)[0]
    m = re.search(r"\s{2,}\(", s)
    if m and re.search(r"[^\x00-\x7f]", s[m.start():]):
        s = s[: m.start()]
    s = re.sub(r"\s+\([^()]*[^\x00-\x7f][^()]*\)\s*$", "", s)
    s = re.sub(r"\s+\((?:fs|vs)\.prelude\)\s*$", "", s)
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*) \((.*)\)$", s)
    if m and re.search(r"[^\x00-\x7f]", m.group(2)):
        s = m.group(1)
    if re.search(r"[^\x00-\x7f]", s):
        raise ValueError("설명 문구가 남음: " + e)
    return s.strip()


def rename(s, time_ms):
    if s is None:
        return None
    s = re.sub(r"\bLayer_(1[23][0-9a-f])\b", lambda m: LAYER[m.group(1)], s)
    s = s.replace("World_4", "uint(mpjMs)")
    if time_ms:
        s = re.sub(r"\btime\b", "mpjMs", s)
    s = re.sub(r"\benv_utility_parameter(\d)\b", r"ENV\1", s)
    for p in SHORT_PARAMS:
        s = re.sub(r"(?<![A-Za-z0-9_])%s\b" % p, "material_" + p, s)
    s = s.replace("material_material_", "material_")
    for k, v in GLOBAL_TEX.items():
        s = s.replace('T("%s"' % k, 'T("@%s"' % v)
    return s


def helper_list(h):
    if not h:
        return {}
    items = h.values() if isinstance(h, dict) else h
    out = {}
    for f in items:
        m = re.search(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", f)
        out[m.group(1)] = f
    return out


def build():
    defs = []
    for i, path in enumerate(SRC):
        for x in json.load(open(path, encoding="utf-8")):
            name = x["material"]
            if name.startswith("@") or name == "menu01_sky_mt":
                continue
            time_ms = i == 0
            vs = x.get("vs") or {}
            fs = dict(x.get("fs") or {})
            fs.update(OVERRIDE.get((name, "fs"), {}))
            samplers = {}
            approx = [x["approx"]] if x.get("approx") else []
            for k, v in (x.get("samplers") or {}).items():
                if k in GLOBAL_TEX:
                    continue
                if k.startswith("("):
                    continue
                samplers[k] = None if (v is None or v.startswith("(")) else v.split(" ")[0]
            for k, v in APPROX_TEX.items():
                if k in json.dumps(x):
                    approx.append(v)
            helpers = {}
            helpers.update(helper_list(vs.get("helpers")))
            fsh = helper_list(fs.get("helpers"))
            text_all = json.dumps({"vs": vs, "fs": fs})
            for k, v in EXTRA_HELPERS.items():
                if re.search(r"\b%s\(" % k, text_all) and k not in fsh:
                    fsh[k] = v
            vsh = dict(helpers)
            if "rotateAxisAngle" in json.dumps(vs):
                vsh["rotateAxisAngle"] = ROTATE_AXIS
            pos = rename(clean(vs.get("positionOffset")), time_ms)
            space = vs.get("positionSpace") or "object"
            vpre = rename(clean(vs.get("prelude")), time_ms)
            if pos and space == "world" and ";" in pos:
                vpre = (vpre + " " if vpre else "") + "vec3 offsetW = vec3(0.0); " + pos
                pos = "offsetW"
            d = {
                "material": name,
                "models": x.get("models") or [],
                "program": x.get("program"),
                "samplers": samplers,
                "vsHelpers": list(vsh.values()),
                "vsPrelude": vpre,
                "uv": {k: rename(clean(v), time_ms) for k, v in (vs.get("uv") or {}).items()},
                "positionOffset": pos,
                "positionSpace": space,
                "fsHelpers": list(fsh.values()),
                "fsPrelude": rename(clean(fs.get("prelude")), time_ms),
                "approx": " / ".join(approx) or None,
            }
            for k in ("baseColor", "alpha", "discard", "emissive", "normal", "roughness", "metallic", "ao"):
                d[k] = rename(clean(fs.get(k)), time_ms)
            if d["baseColor"] in ("base.rgb", "T(\"_a0\", vUv0).rgb"):
                d["baseColor"] = None
            defs.append(d)
    return defs


def sky():
    for x in json.load(open(SRC[0], encoding="utf-8")):
        if x["material"] == "menu01_sky_mt":
            return {"program": x["program"], "evidence": x.get("evidence"), "u": "(atan(r.x, -r.z) + 3.14159265)*0.15915494 + P0.y", "v": "P0.x + acos(r.y)*0.63661977"}
    return None


def shading_types():
    out = {}
    for x in json.load(open(SRC[0], encoding="utf-8")):
        if x["material"].startswith("@shading_type"):
            out[x["material"][1:]] = {"program": x["program"], "other": (x.get("fs") or {}).get("other")}
    return out


if __name__ == "__main__":
    ds = build()
    print(len(ds), "defs")
    for d in ds:
        print(d["material"], d["models"][:2], {k: bool(d[k]) for k in ("vsPrelude", "positionOffset", "fsPrelude", "baseColor", "normal", "emissive", "alpha", "ao")})
