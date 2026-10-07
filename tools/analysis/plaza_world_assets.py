"""광장(menu00) 무대 에셋 → web/assets/plaza/world/ (docs/shell/plaza_3d.md §6.7).

입력: extracted/converted/graphics/{menu00,menu_common} (graphics_convert.py menu_common menu00),
      extracted/bea/menu~menu00.nx.bea/menu/menu00/data/{MapStructure,CameraParam}.json,
      extracted/converted/scene/apx/menu~menu00__menu__menu00__map__<hash>.obj (scene_apx.py),
      analysis/mat/plaza_graph_*.json (셰이더 그래프 판독, 있으면).
출력: model/*.glb, tex/*, anim/*.json, collision.json, manifest.json

usage: python web/tools/analysis/plaza_world_assets.py
"""
import json
import os
import shutil
import struct
import subprocess
import tempfile
import sys

import numpy as np
from PIL import Image


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
GFX = os.path.join(ROOT, "extracted", "converted", "graphics")
BEA = os.path.join(ROOT, "extracted", "bea")
MENU00 = os.path.join(BEA, "menu~menu00.nx.bea", "menu", "menu00")
APX = os.path.join(ROOT, "extracted", "converted", "scene", "apx")
OUT = os.path.join(ROOT, "web", "assets", "plaza", "world")
EXE = os.path.join(ROOT, "web", "tools", "analysis", "graphics_bfres2gltf", "bin", "Release", "net7.0", "graphics_bfres2gltf.exe")
MAX_TEX = 1024
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import plaza_graph_web  # noqa: E402
COLLISION = {
    "CollisionMain": "menu~menu00__menu__menu00__map__72cbf6799dc022826ea52ed8ed6d9c3f.obj",
    "CollisionFirst": "menu~menu00__menu__menu00__map__8fd195287993206ecec0115f93468058.obj",
}
EXTRA_MODELS = [("menu00", n) for n in ("npc00_obj", "npc02_obj", "npc07_obj", "air_npc03", "air_npc04", "air_npc05", "menu00_obj_shuttle00", "menu00_obj_racket00",
                                          "menu00_ast_beachball00", "menu00_obj_guitar", "menu00_chair00", "menu00_obj_sheet", "menu00_bubble00", "menu00_bubble01",
                                          "menu00_basket00", "menu00_guide_flag00")] + [("menu_common", "menu_cmn_binoculars00")]
EXTRA_LAYOUT = [{"key": "AirNpcPath%02d" % i, "archive": "menu00", "dir": "model", "fmdb": "air_npc%02d" % i, "hookKey": "AttachLocaterDecoNpc",
                 "hookNode": "attach_air_npc%02d" % i, "nbmap": "", "anim": "air_npc%02d" % i, "flgDeco": False} for i in (3, 4, 5)]
SPECIAL_ANIMS = {
    "FriendMatchObj": [
        {"kind": "clip", "name": "menu00_friendmatch_obj00_startup", "loop": False, "speed": 0, "frame": 0},
        {"kind": "fmab", "name": "menu00_friendmatch_obj00_startup.fmab", "loop": False, "speed": 0, "frame": 0},
    ],
    "ShopMusic": [
        {"kind": "clip", "name": "menu00_shop_music", "loop": True, "speed": 1, "frame": 0},
        {"kind": "fmab", "name": "menu00_shop_music.fmab", "loop": True, "speed": 1, "frame": 0},
    ],
}


def load_json(p):
    with open(p, encoding="utf-8-sig") as f:
        return json.load(f)


def glb_json(p):
    with open(p, "rb") as f:
        b = f.read(20 + 64 * 1024 * 1024)
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n])


def euler_dir(rx, ry, rz):
    x, y, z = np.radians([rx, ry, rz])
    Rx = np.array([[1, 0, 0], [0, np.cos(x), -np.sin(x)], [0, np.sin(x), np.cos(x)]])
    Ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    Rz = np.array([[np.cos(z), -np.sin(z), 0], [np.sin(z), np.cos(z), 0], [0, 0, 1]])
    d = (Rz @ Ry @ Rx) @ np.array([0, 0, -1.0])
    return [round(float(v), 6) for v in -d]


def env_material(name):
    d = load_json(os.path.join(GFX, "menu00", "meta", name + ".dump.json"))
    m = d[0]["models"][0]
    return m["materials"][0], m["skeleton"]["bones"]


def params(mat):
    return {k: v["value"] for k, v in mat["params"].items()}


def sampler_textures(mat):
    names = [s["name"] for s in mat["samplers"]]
    by_slot = dict(zip(names, mat["textures"]))
    return {k: by_slot.get(v) for k, v in mat["shader"]["samplerAssign"].items()}


def copy_tex(src_dir, fn, report):
    src = os.path.join(src_dir, fn)
    dst = os.path.join(OUT, "tex", fn)
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        report["bytes"] += os.path.getsize(dst)
        return
    if fn.endswith(".png"):
        im = Image.open(src)
        w, h = im.size
        if max(w, h) > MAX_TEX:
            k = MAX_TEX / max(w, h)
            im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
            im.save(dst, optimize=False)
            report["resized"].append("%s %dx%d" % (fn, w, h))
        else:
            shutil.copyfile(src, dst)
    else:
        shutil.copyfile(src, dst)
    report["bytes"] += os.path.getsize(dst)


def tex_entry(set_name, name):
    m = load_json(os.path.join(GFX, set_name, "manifest.json"))["textures"].get(name)
    if not m:
        return None
    meta = load_json(os.path.join(GFX, set_name, "tex", name + ".json"))
    files = meta.get("hdrFiles") or meta.get("files") or []
    return {"files": files, "srgb": bool(m["srgb"]), "cube": m["viewDim"] == "Cube", "format": m["format"], "w": m["w"], "h": m["h"],
            "depth": meta.get("depth", 1)}


def cube_mean(name):
    meta = load_json(os.path.join(GFX, "menu00", "tex", name + ".json"))
    acc = np.zeros(3)
    for fn in meta["files"]:
        acc += np.asarray(Image.open(os.path.join(GFX, "menu00", "tex", fn)).convert("RGB"), dtype=np.float64).reshape(-1, 3).mean(0) / 255.0
    return [round(float(v), 5) for v in acc / len(meta["files"])]


def parse_obj(p):
    v, idx = [], []
    with open(p, encoding="utf-8") as f:
        for line in f:
            t = line.split()
            if not t:
                continue
            if t[0] == "v":
                v.extend(round(float(x), 5) for x in t[1:4])
            elif t[0] == "f":
                ids = [int(x.split("/")[0]) - 1 for x in t[1:]]
                for k in range(1, len(ids) - 1):
                    idx.extend([ids[0], ids[k], ids[k + 1]])
    return {"vertices": v, "indices": idx}


def main():
    for d in ("model", "tex", "anim"):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    ms = load_json(os.path.join(MENU00, "data", "MapStructure.json"))["MapStructure"]
    cam = load_json(os.path.join(MENU00, "data", "CameraParam.json"))
    sets = {"menu00": load_json(os.path.join(GFX, "menu00", "manifest.json")), "menu_common": load_json(os.path.join(GFX, "menu_common", "manifest.json"))}
    report = {"bytes": 0, "resized": []}

    models = {}
    textures = {}
    tex_of_model = {}
    wanted = [("menu00" if e["archive"] == "menu00" else "menu_common", e["fmdb"]) for e in ms if e["dir"] == "model"] + EXTRA_MODELS
    for s, fmdb in wanted:
        if fmdb in models:
            continue
        e = {"fmdb": fmdb}
        info = sets[s]["models"][e["fmdb"]]
        src = os.path.join(GFX, s, "model", e["fmdb"] + ".glb")
        shutil.copyfile(src, os.path.join(OUT, "model", e["fmdb"] + ".glb"))
        j = glb_json(src)
        used = set()
        for im in j.get("images", []):
            fn = os.path.basename(im["uri"])
            copy_tex(os.path.join(GFX, s, "tex"), fn, report)
            used.add(fn)
        for mt in j.get("materials", []):
            fres = (mt.get("extras") or {}).get("fres") or {}
            for smp in fres.get("samplers", []):
                t = smp["texture"]
                if t in textures:
                    used.update(textures[t]["files"])
                    continue
                te = tex_entry(s, t)
                if not te:
                    continue
                for fn in te["files"]:
                    copy_tex(os.path.join(GFX, s, "tex"), fn, report)
                    used.add(fn)
                textures[t] = te
        tex_bytes = sum(os.path.getsize(os.path.join(OUT, "tex", fn)) for fn in used)
        tex_of_model[e["fmdb"]] = sorted(used)
        models[e["fmdb"]] = {"url": "model/%s.glb" % e["fmdb"], "set": s, "bytes": info["bytes"], "texBytes": tex_bytes, "tex": sorted(used),
                             "vertices": info["vertices"], "triangles": info["triangles"], "bones": info["bones"], "clips": info["clips"]}

    env_tex = ["menu01_ibl_rad", "menu01_ibl_irr", "menu01_fog", "windnoise00", "menu00_plaza_rad", "menu00_plaza_irr", "menu00_sky", "menu00_lut_00"]
    for t in env_tex:
        te = tex_entry("menu00", t)
        for fn in te["files"]:
            copy_tex(os.path.join(GFX, "menu00", "tex"), fn, report)
        textures[t] = te

    sky_glb = os.path.join(OUT, "model", "menu00_sky.glb")
    sky_meta = os.path.join(tempfile.gettempdir(), "plaza_menu00_sky.meta.json")
    subprocess.run([EXE, "gltf", os.path.join(MENU00, "env", "menu00_sky.fmdb"), sky_glb, "--texdir", os.path.join(GFX, "menu00", "tex"),
                    "--texuri", "../tex/", "--meta", sky_meta, "--all"], check=True, capture_output=True)
    sky_info = load_json(sky_meta)
    models["menu00_sky"] = {"url": "model/menu00_sky.glb", "set": "menu00", "bytes": os.path.getsize(sky_glb), "texBytes": 0,
                            "vertices": sky_info["vertexCount"], "triangles": sky_info["triangleCount"], "bones": sky_info["bones"], "clips": {}}
    for im in glb_json(sky_glb).get("images", []):
        copy_tex(os.path.join(GFX, "menu00", "tex"), os.path.basename(im["uri"]), report)

    anims = {}
    for s in ("menu00", "menu_common"):
        for fn, rel in sets[s]["anims"].items():
            shutil.copyfile(os.path.join(GFX, s, rel), os.path.join(OUT, "anim", fn + ".json"))
            anims[fn] = "anim/%s.json" % fn

    default_anims = {}
    for e in ms + EXTRA_LAYOUT:
        if e["dir"] != "model":
            continue
        if e["key"] in SPECIAL_ANIMS:
            default_anims[e["key"]] = SPECIAL_ANIMS[e["key"]]
            continue
        lst = []
        if e["anim"]:
            if e["anim"] in models[e["fmdb"]]["clips"]:
                lst.append({"kind": "clip", "name": e["anim"], "loop": True, "speed": 1, "frame": 0})
            if e["anim"] + ".fmab" in anims:
                lst.append({"kind": "fmab", "name": e["anim"] + ".fmab", "loop": True, "speed": 1, "frame": 0})
        if lst:
            default_anims[e["key"]] = lst

    col = {k: parse_obj(os.path.join(APX, v)) for k, v in COLLISION.items()}
    with open(os.path.join(OUT, "collision.json"), "w", encoding="utf-8") as f:
        json.dump(col, f, separators=(",", ":"))

    light, bones = env_material("menu00_dir_light")
    lp = params(light)
    envm, _ = env_material("menu00_env")
    ep = params(envm)
    es = sampler_textures(envm)
    post, _ = env_material("menu00_post")
    pp = params(post)
    sky, sky_bones = env_material("menu00_sky")
    pl, pl_bones = env_material("menu00_shop_collection_pointlight00")
    plp = params(pl)
    rot = lp["directional_light_overwrite_rotation"] if lp.get("directional_light_transform_overwrite") == 1 else None
    env = {
        "light": {"dir": euler_dir(*rot), "color": lp["directional_light_color"]},
        "shadow": {"near": lp["directional_light_shadowmap_camera_near"], "far": lp["directional_light_shadowmap_camera_far"],
                   "offset": lp["directional_light_shadowmap_camera_offset"], "cascades": lp["directional_light_shadowmap_array_length"]},
        "ibl": {"common": [es["env_common_specular_texturecube"], es["env_common_diffuse_texturecube"]],
                "chara": [es["env_char_specular_texturecube"], es["env_char_diffuse_texturecube"]]},
        "fog": {"start": ep["env_mip_fog_start_distance"], "end": ep["env_mip_fog_end_distance"], "intensity": ep["env_mip_fog_intensity"],
                "cube": es["env_mip_fog_texturecube0"], "color": cube_mean(es["env_mip_fog_texturecube0"])} if ep.get("env_mip_fog_enable") == 1 else None,
        "envUtility": {k: ep[k] for k in ("env_utility_parameter0", "env_utility_parameter1", "env_utility_parameter2", "env_utility_parameter3")},
        "windNoise": es.get("env_sg_utility_texture2d0"),
        "envAnim": "menu00_env00.fmab",
        "clear": [0.25, 0.25, 0.25],
        "post": {"tonemapType": post["renderInfo"]["posteffect_renderinfo_tonemap_type"][0], "exposure": pp["posteffect_tonemap_exposure"],
                 "exposureOffset": pp["posteffect_tonemap_exposure_offset"], "outputScale": pp["posteffect_tonemap_output_scale"],
                 "bloom": pp["posteffect_bloom_enable"] == 1, "bloomThreshold": pp["posteffect_bloom_threshold"],
                 "bloomIntensity": pp["posteffect_bloom_intensity"], "bloomSpread": pp["posteffect_bloom_spread"], "bloomClip": pp["posteffect_bloom_clip"],
                 "fxaa": pp["posteffect_fxaa_enable"] == 1, "fxaaEdgeThreshold": pp["posteffect_fxaa_edge_threshold"],
                 "fxaaEdgeThresholdMin": pp["posteffect_fxaa_edge_threshold_min"], "fxaaSubPixel": pp["posteffect_fxaa_sub_pixel"],
                 "lut": post["textures"][0] if pp.get("posteffect_color_grading_enable") == 1 and pp.get("posteffect_color_grading_lut_enable") == 1 else None,
                 "dof": pp["posteffect_dof_enable"] == 1, "vignetteIntensity": pp["posteffect_color_grading_vignette_intensity"],
                 "vignetteAspect": pp["posteffect_color_grading_vignette_aspect_rate"]},
        "sky": {"model": "menu00_sky", "texture": sampler_textures(sky).get("skybox_sg_utility_texture2d0"), "params": params(sky),
                "graph": sky["shader"]["options"].get("fragment_shader_graph_skybox"), "position": sky_bones[0]["T"]},
        "pointLights": [{"name": pl["name"], "position": pl_bones[0]["T"], "color": plp["point_light_color"], "radius": plp["point_light_radius"],
                         "coreRadius": plp["point_light_core_radius"]}],
    }

    graphs = plaza_graph_web.build()
    for g in graphs:
        for t in g["samplers"].values():
            if t and t not in textures:
                te = tex_entry("menu00", t) or tex_entry("menu_common", t)
                if te:
                    for fn in te["files"]:
                        copy_tex(os.path.join(GFX, "menu00" if tex_entry("menu00", t) else "menu_common", "tex"), fn, report)
                    textures[t] = te

    layout = [{k: e[k] for k in ("key", "archive", "dir", "fmdb", "hookKey", "hookNode", "nbmap", "anim", "flgDeco")} for e in ms]
    manifest = {
        "set": "plaza",
        "source": "menu~menu00.nx.bea + menu~menu_common.nx.bea",
        "generator": "tools/analysis/plaza_world_assets.py",
        "models": models,
        "textures": textures,
        "anims": anims,
        "env": env,
        "graphs": graphs,
        "plaza": {"layout": layout, "extraLayout": EXTRA_LAYOUT, "cameraParam": cam, "collision": "collision.json", "defaultAnims": default_anims},
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT) for fn in fns)
    print("models %d, textures %d, anims %d, graphs %d, resized %s" % (len(models), len(textures), len(anims), len(graphs), report["resized"]))
    print("collision", {k: (len(v["vertices"]) // 3, len(v["indices"]) // 3) for k, v in col.items()})
    print("total MB %.1f" % (total / 1e6))


if __name__ == "__main__":
    main()
