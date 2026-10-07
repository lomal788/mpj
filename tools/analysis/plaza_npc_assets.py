"""광장(menu00) NPC 에셋 — 원본이 광장에서 만드는 NPC 11종(Scene::BeginScene @0x7100046160 LoadSceneNonPlayerCharacter) glb + motions.json + spec.json.

NPC 레코드는 NonPlayerCharacterID(= characterlist.json NPCCharacterData 의 줄 번호)로 고른다. character_glb.py 는 Number 로 첫 레코드를 고르고
모션 접두를 base directory 에서 만들어 변형 모델(npc001bd·npc002st·npc029a)을 못 고르므로, 그 함수들(모션 찾기·blink 묶음·베이크·glb 읽기/쓰기)을
그대로 불러 쓰되 레코드·접두만 이 파일에서 정한다(character_glb.py 무수정).
클립 = 광장 코드가 등록·재생하는 모션 [판독 docs/shell/plaza_3d.md §9] + 각 모션의 깜빡임 묶음. 없는 모션은 원본도 IsAnimExist 로 건너뛰므로 뺀다.
정리 규칙(정점 속성·상수 채널·텍스처 공유)은 charsel_chara.py 와 같다(_C1·_C2·TEXCOORD_2 유지). 배열 알베도(색 변형)는 모든 층 png 를 싣는다.
부착 소품(노코노코 모자 등)은 graphics_bfres2gltf gltf 로 같은 폴더에 둔다.
중간 변환: extracted/converted/plaza_npc/<key>/ (새 폴더). 출력: web/assets/plaza/world/chara/{<key>/<model>.glb, <key>/motions.json, tex/*.png, spec.json}
usage: .venv/Scripts/python web/tools/analysis/plaza_npc_assets.py [key ...]
"""
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import character_glb as cg  # noqa: E402
import graphics_bntx  # noqa: E402
import mg1801_web_charas as mwc  # noqa: E402
from graphics_convert import EXE, combine_mr, run  # noqa: E402

SRC = ROOT / "extracted" / "converted" / "plaza_npc"
DST = ROOT / "web" / "assets" / "plaza" / "world" / "chara"
CHARSEL_SPEC = ROOT / "web" / "assets" / "charselect" / "spec.json"
KEEP_ATTR = {"_C1", "_C2", "TEXCOORD_2"}

NPCS = [
    {"key": "npc022", "ids": [0x20], "clips": ["co_idle00", "co_talk00", "bd_welcome00a", "bd_welcome00b", "co_bye00", "co_walk00", "co_joy03",
                                               "bd_flag_idle00", "bd_flag_talk00", "bd_flag_swing00", "bd_flag_walk00", "bnclr_idle00", "bnclr_pass00"]},
    {"key": "npc051", "ids": [0x37], "clips": ["co_idle00", "co_talk00", "co_bye01", "co_walk00", "co_busy00"]},
    {"key": "npc003", "ids": [0x0B], "clips": ["co_idle00", "co_talk00", "park_bmt_idle00", "park_bmt_swing00", "park_bmt_swing01", "sit_idle01", "sit_talk00"],
     "attach": True},
    {"key": "npc002", "ids": [0x05], "clips": ["co_idle00", "sit_idle01", "sit_talk00"]},
    {"key": "npc002st", "ids": [0x09], "clips": ["co_idle00", "co_talk00"]},
    {"key": "npc001", "ids": [0x01], "clips": ["co_idle00", "bd_volley00", "bd_volley01", "bd_sit_talk00"]},
    {"key": "npc001bd", "ids": [0x04], "clips": ["co_idle00", "co_talk00", "co_talk01"]},
    {"key": "npc044", "ids": [0x2E, 0x2F], "clips": ["co_idle00", "co_talk00", "park_guitar00"]},
    {"key": "npc029a", "ids": [0x29], "clips": ["co_idle00", "co_talk00"]},
    {"key": "npc053", "ids": [0x38], "clips": ["co_idle00", "bd_bubble00", "bd_flower00"]},
]


def record(idx):
    return json.loads(Path(cg.CHARLIST).read_text(encoding="utf-8-sig"))["NPCCharacterData"][idx]


def convert_raw(key, cd, motions):
    """character_glb.main 과 같은 순서(텍스처 → 모션 표 → gltf → 클립 이름·extras → motions.json). 다른 점: 레코드·모션 접두를 인자로 받는다"""
    base_dir = cd["base directory"]
    prefix = cd["motion filename prefix[p]"].split("/")[-1]
    prefix_dir = prefix.rstrip("_")
    arc = os.path.join(cg.BEA, "chara~%s.nx.bea" % cd["archive"].split("/")[-1])
    fmdb = os.path.join(arc, base_dir, cd["fmdb m1"])
    stem = os.path.splitext(os.path.basename(fmdb))[0]
    dirs = cg.motion_dirs(cd, "npc")
    out = SRC / key
    tex = out / "tex"
    tex.mkdir(parents=True, exist_ok=True)
    for dp, _, fns in os.walk(arc):
        for fn in fns:
            if fn.endswith(".bntx"):
                for t in graphics_bntx.parse(open(os.path.join(dp, fn), "rb").read()):
                    if (tex / (t.name + ".json")).exists():
                        continue
                    try:
                        tm = graphics_bntx.to_png(t, str(tex))
                    except NotImplementedError as e:
                        tm = graphics_bntx.meta(t)
                        tm["error"] = "not decoded: %s" % e
                        tm["files"] = []
                    (tex / (t.name + ".json")).write_text(json.dumps(tm, ensure_ascii=False, indent=1), encoding="utf-8")
    table, missing = {}, []
    queue = list(motions)
    while queue:
        m = queue.pop(0)
        if m in table:
            continue
        files, arcs, blink = {}, {}, {}
        for ext in cg.EXTS:
            k, p = cg.find_file(dirs, "%s_%s.%s" % (prefix_dir, m, ext))
            if p:
                files[ext] = p
                arcs[ext] = k
                bf = cg.blink_ref(p)
                if bf:
                    blink[ext] = bf
                    bname = bf[len(prefix_dir) + 1:].split(".")[0]
                    if bname not in queue and bname not in table:
                        queue.append(bname)
        if not files:
            missing.append(m)
            continue
        table[m] = {"files": files, "archives": arcs, "blink": blink}
    glb = out / (stem + ".glb")
    meta = out / "meta.json"
    cmd = [EXE, "gltf", fmdb, str(glb), "--texdir", str(tex), "--texuri", "tex/", "--meta", str(meta)]
    for t in table.values():
        if "fskb" in t["files"]:
            cmd += ["--anim", t["files"]["fskb"]]
        if "fshb" in t["files"]:
            cmd += ["--shapeanim", t["files"]["fshb"]]
    print(run(cmd))
    mj = json.loads(meta.read_text(encoding="utf-8"))
    for c in mj.get("combine", []):
        combine_mr(str(tex), c)
    js, rest = cg.read_glb(str(glb))
    pre = prefix_dir + "_"
    clips = []
    for a in js.get("animations", []):
        ex = a.setdefault("extras", {})
        name = a["name"][len(pre):] if a["name"].startswith(pre) else a["name"]
        a["name"] = name
        ex["nameHash"] = "0x%016x" % cg.fnv1a64(name.removesuffix("_shape"))
        clips.append({"name": name, "frames": ex.get("frames"), "loop": ex.get("loop")})
    cg.write_glb(str(glb), js, rest)
    mot = {}
    for m, t in table.items():
        e = {"nameHash": "0x%016x" % cg.fnv1a64(m), "files": {ext: os.path.relpath(p, cg.BEA).replace("\\", "/") for ext, p in t["files"].items()},
             "blink": {ext: f[len(pre):].split(".")[0] for ext, f in t["blink"].items()}}
        fr = next((c for c in clips if c["name"] == m), None)
        if fr:
            e["frames"], e["loop"] = fr["frames"], fr["loop"]
        sh = next((c for c in clips if c["name"] == m + "_shape"), None)
        if sh:
            e["shapeFrames"] = sh["frames"]
        if "fvbb" in t["files"]:
            e["vis"] = cg.vis_table(cg.bake(t["files"]["fvbb"]))
        if "ftsb.fmab" in t["files"]:
            e["mat"] = cg.mat_table(cg.bake(t["files"]["ftsb.fmab"]))
        if "frames" not in e and e.get("mat"):
            e["frames"], e["loop"] = e["mat"]["frames"], True
        mot[m] = e
    (out / "motions.json").write_text(json.dumps(mot, ensure_ascii=False, indent=1), encoding="utf-8")
    return glb, mot, missing


def ship_png(src_tex, pn, tex_root):
    b = (src_tex / pn).read_bytes()
    h = hashlib.sha1(b).hexdigest()[:12]
    name = f"{Path(pn).stem}_{h}.png"
    if not (tex_root / name).exists():
        (tex_root / name).write_bytes(b)
    return "tex/" + name


def array_layers(src_tex, js):
    """셰이더 그래프가 읽는 텍스처의 png(배열이면 층 전부) — glb 이미지는 배열 0번 층만 가리키고, 그래프 슬롯(sg_utility_texture2d*·
    sg_utility_texture2darray0)으로만 읽는 텍스처(노코노코·파타파타 몸 배열, 눈 알베도)는 glb 에 없다 [판독 analysis/mat/plaza_npc_graph.json]"""
    out = {}
    names = set()
    for m in js.get("materials", []):
        for smp in (m.get("extras") or {}).get("fres", {}).get("samplers", []):
            if any(sl.startswith("sg_utility_texture") or sl == "_a0" for sl in smp.get("slots", [])):
                names.add(smp["texture"])
    for name in sorted(names):
        meta = src_tex / (name + ".json")
        if not meta.exists():
            continue
        m = json.loads(meta.read_text(encoding="utf-8"))
        files = [f for f in m.get("files") or [] if (src_tex / f).exists()]
        if files:
            out[name] = files
    return out


def attach_glb(key, cd, dst):
    """NPCAttachModelFilePath 소품(attach model[p]) → glb. 텍스처는 같은 아카이브 tex 폴더를 쓴다"""
    rel = cd.get("attach model[p]")
    if not rel:
        return None
    arc = os.path.join(cg.BEA, "chara~%s.nx.bea" % cd["archive"].split("/")[-1])
    fmdb = os.path.join(arc, cd["base directory"], rel)
    stem = os.path.splitext(os.path.basename(fmdb))[0]
    src = SRC / key
    glb = src / (stem + ".glb")
    run([EXE, "gltf", fmdb, str(glb), "--texdir", str(src / "tex"), "--texuri", "tex/", "--meta", str(src / (stem + ".meta.json"))])
    mj = json.loads((src / (stem + ".meta.json")).read_text(encoding="utf-8"))
    for c in mj.get("combine", []):
        combine_mr(str(src / "tex"), c)
    js, rest = cg.read_glb(str(glb))
    for im in js.get("images", []):
        im["uri"] = "../" + ship_png(src / "tex", im["uri"].split("/")[-1], dst / "tex")
    (dst / key).mkdir(parents=True, exist_ok=True)
    cg.write_glb(str(dst / key / (stem + ".glb")), js, rest)
    r = lambda k: cd.get(k) or 0  # noqa: E731
    return {"glb": f"{key}/{stem}.glb", "bone": cd.get("attach bone"),
            "t": [r("attach_offset_trans_x"), r("attach_offset_trans_y"), r("attach_offset_trans_z")],
            "rDeg": [r("attach_offset_rot_x"), r("attach_offset_rot_y"), r("attach_offset_rot_z")]}


def build(n, dst):
    key = n["key"]
    cd = record(n["ids"][0])
    glb, mot, missing = convert_raw(key, cd, n["clips"])
    src = SRC / key
    js, rest = cg.read_glb(str(glb))
    keep = [c for c in n["clips"] if c in mot]
    keep += sorted({b for m in keep for b in (mot[m].get("blink") or {}).values()} - set(keep))
    drop = mwc.DROP_ATTR
    mwc.DROP_ATTR = drop - KEEP_ATTR
    try:
        js, rest, stats = mwc.slim(js, rest, set(keep) | {c + "_shape" for c in keep}, lambda m: None)
    finally:
        mwc.DROP_ATTR = drop
    tex_root = dst / "tex"
    tex_root.mkdir(parents=True, exist_ok=True)
    layers = {name: ["../" + ship_png(src / "tex", f, tex_root) for f in files] for name, files in array_layers(src / "tex", js).items()}
    tex_map = {}
    for im in js.get("images", []):
        pn = im["uri"].split("/")[-1]
        tex_map[pn] = ship_png(src / "tex", pn, tex_root)
        im["uri"] = "../" + tex_map[pn]
    (dst / key).mkdir(parents=True, exist_ok=True)
    out_glb = dst / key / glb.name
    mwc.write_glb(out_glb, js, rest)
    (dst / key / "motions.json").write_text(json.dumps(mwc.compact_motions(mot, keep), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    clip_info = {}
    for m in keep:
        e = mot[m]
        if e.get("frames") is not None:
            clip_info[m] = {"frames": e["frames"], "loop": bool(e.get("loop"))}
    attach = attach_glb(key, cd, dst) if n.get("attach") else None
    recs = []
    for i in n["ids"]:
        c = record(i)
        recs.append({"id": i, "name": c["charaname"], "height": c.get("height"), "scale": c.get("IndividualScale") or 1,
                     "head": {k: c.get(k) for k in ("head_min_x", "head_min_y", "head_min_z", "head_max_x", "head_max_y", "head_max_z", "head_offset_x",
                                                    "head_weight", "head_chincoef")},
                     "eyes": [{k[5:]: c.get(k) for k in c if k.startswith("eye%d_" % e)} for e in (0, 1)]})
    print("%s glb %d B, clips %s, missing %s, layers %s, dropCh %d" % (key, out_glb.stat().st_size, list(clip_info), missing, list(layers), stats["droppedChannels"]))
    return {"pc": key, "label": cd.get("text label"), "scale": recs[0]["scale"], "cam": [0, 0, 0], "fov": 30, "idle": "co_idle00", "lock": None,
            "glb": f"{key}/{glb.name}", "motions": f"{key}/motions.json", "clips": clip_info, "missing": missing, "layers": layers,
            "attach": attach, "npc": recs}


def main():
    only = set(sys.argv[1:])
    old = {}
    if (DST / "spec.json").exists():
        old = {c["pc"]: c for c in json.loads((DST / "spec.json").read_text(encoding="utf-8"))["chars"]}
    chars = []
    for i, n in enumerate(NPCS):
        e = old[n["key"]] if only and n["key"] not in only and n["key"] in old else build(n, DST)
        e["index"] = i
        e["btn"] = i
        chars.append(e)
    env = json.loads(CHARSEL_SPEC.read_text(encoding="utf-8"))["env"]
    spec = {"version": 1, "source": "plaza_npc_assets.py", "env": env, "chars": chars}
    (DST / "spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    print("spec:", len(chars), "npc")


if __name__ == "__main__":
    main()
