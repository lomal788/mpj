"""mg1801 웹 캐릭터 에셋 — extracted/converted/character/<key>(tools/character_glb.py 결과) → 공용 web/assets/chara + 명세 web/assets/mg1801/chara/index.json.

  c:/dev/mpj/.venv/Scripts/python tools/mg1801_web_charas.py            # 22명 + npc002
  (변환 먼저: tools/character_glb.py pcNN rhy_knife_idle00 rhy_knife_swing00 co_idle00 / npc002 co_idle00 co_joyful00 co_joyful02)

용량을 줄이려고 하는 일(원본 값·텍스처 그림은 바꾸지 않는다):
- 정점 속성: 어느 화면도 읽지 않는 _C0·_C3·TEXCOORD_3 을 뺀다(_C1·_C2·TEXCOORD_2 는 캐릭터 선택·광장이 읽어 공용 모델에 남는다 — mg1801 은
  읽지 않음). POSITION·NORMAL·TANGENT·TEXCOORD_0/1·JOINTS_0·WEIGHTS_0·모프는 그대로(같은 바이트).
- 클립 채널: 모든 키가 그 뼈의 바인드 TRS 와 같은 채널(오차 1e−6)은 뺀다(three 는 쓰는 액션이 없으면 원래 값으로 되돌리므로 결과 같음).
  모든 키가 같은 상수 채널은 키 1개로 줄인다. 그 밖의 키는 그대로.
- 클립: mg1801 이 쓰는 것만 — PC rhy_knife_idle00·swing00(Player ctor AddAnimation), co_idle00(RmMgSceneBase::OnGameEndingBefore 의
  rm_co_idle00 → co_idle00, 속도 1.0 [판독 main FUN_7100447030]), 그 모션들의 blink 묶음(fcl_blink00). NPC co_idle00·co_joyful00·co_joyful02
  (MapImpl::Initialize: joy_mot = [co_joyful02, co_joyful00][Params.RhythmNpcMotNo] 를 이름 co_joyful00 으로 등록).
- 텍스처: glb 이미지 + 눈동자 알베도(재질 extras 의 *_eye*_alb, 배열이면 0층)만 공용 chara/tex/<이름>_<sha1 12>.png 로 복사. 바이트 그대로.
- 메시 extras.mpjUv: body_m 셰이프이고 몸 알베도 가로세로가 1:2 면 'v2'(v′ = 0.5 + 0.5v), 2:1 이면 'u2'(u′ = 0.5u), 그 밖은 없음(그대로).
  UV 가 "텍스처 가로 = 1" 단위라고 본 관측 규칙이다. 몸·머리카락뿐 아니라 얼굴(눈꺼풀) 셰이프도 같은 규칙에서 맞는다(마리오·피치·데이지·
  폴린 렌더 대조) [실행: 렌더 관측 — 원본 셰이더 그래프 식 미확정, 09_character.md 4.2]
결과: web/assets/mg1801/chara/index.json(캐릭터 표, 경로는 이 폴더 기준 ../../chara/…). 모델·모션·텍스처는 공용 web/assets/chara/(chara_shared.py,
docs/engine/chara_assets.md): <key>/<model>.glb(클립 없음, 정점 속성은 화면들의 상위 집합이라 _C1·_C2·TEXCOORD_2 가 남는다 — mg1801 은 읽지 않음),
<key>/motion/<모션>.glb(anims = 대기·칼·깜빡임, resultAnims = 결과 승패 — 뒤에 읽음), <key>/motions.json, tex/<이름>_<sha1 12>.png.
"""
import json
import shutil
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
from character_glb import read_glb, write_glb  # noqa: E402

SRC = ROOT / "extracted" / "converted" / "character"
DST = ROOT / "web" / "assets" / "mg1801"
CHARLIST = ROOT / "extracted" / "bea" / "bq.nx.bea" / "common" / "data" / "characterlist.json"
PCS = ["pc01", "pc02", "pc03", "pc04", "pc05", "pc06", "pc07", "pc08", "pc09", "pc11", "pc12",
       "pc13", "pc14", "pc50", "pc51", "pc52", "pc53", "pc54", "pc56", "pc58", "pc61", "pc62"]
NPCS = ["npc002"]
PC_CLIPS = ["rhy_knife_idle00", "rhy_knife_swing00", "co_idle00", "fcl_blink00"]
NPC_CLIPS = ["co_idle00", "co_joyful00", "co_joyful02"]
# 결과 승패 모션: 별 판정 3 → co_win00a→b, 2 → co_joy00a→b, ≤1 → co_lose00a→b (main FUN_71004475d0 → FUN_7100446d90, 표 @0x71019f2210
# — logic1801 판독, SHARED.md), 연속 플레이(RmGameWork+0x2C≠0) 결과 rc_pract_idle00(chara~pcMot_rc, main FUN_7100447030). 한 판에 하나만 쓰므로 따로 <stem>_result.glb 로 두고 화면이 뒤에 읽는다
PC_RESULT_CLIPS = ["co_win00a", "co_win00b", "co_joy00a", "co_joy00b", "co_lose00a", "co_lose00b", "rc_pract_idle00"]
DROP_ATTR = {"_C0", "_C1", "_C2", "_C3", "TEXCOORD_2", "TEXCOORD_3"}
CT = {5126: ("f", 4), 5123: ("H", 2), 5121: ("B", 1), 5125: ("I", 4), 5122: ("h", 2), 5120: ("b", 1)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
HEAD_KEYS = ["head_min_x", "head_min_y", "head_min_z", "head_max_x", "head_max_y", "head_max_z", "head_offset_x", "head_weight", "head_chincoef"]
# MapImpl::Initialize 가 NPC 둘에 ca::rm::util::ChangeHeyhoColor(npc, 3) → container_m 의 mdl_utility_parameter0.x = 3 [판독 mg1801 @0x710000f9d0,
# main @0x7100438ba0]. 3 을 몸 알베도 배열 층 번호로 본다 [추정: 층 0~4 = 빨강·노랑·파랑·초록·분홍, 셰이더 그래프 미확정] → 층 03 png 를 같이 둔다
NPC_COLOR = {"npc002": 3}
EYE_KEYS = ["material", "shaderparam", "t_offset_x", "t_offset_y", "t_scale_x", "t_scale_y", "t_rot", "t_min_x", "t_min_y", "t_max_x", "t_max_y"]


def acc_array(js, rest, i):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    t, sz = CT[a["componentType"]]
    n = NC[a["type"]]
    off = 8 + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", sz * n)
    arr = np.ndarray((a["count"], n), dtype=np.dtype("<" + t), buffer=rest, offset=off, strides=(stride, sz))
    return np.array(arr)


class Packer:
    """새 bin 청크를 만든다. 접근자 하나 = bufferView 하나(속성은 촘촘히)."""

    def __init__(self, js, rest):
        self.js, self.rest = js, rest
        self.bin = bytearray()
        self.views, self.accs, self.map = [], [], {}

    def add_array(self, arr, src_acc, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        data = np.ascontiguousarray(arr).tobytes()
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.views.append(v)
        a = {k: v2 for k, v2 in src_acc.items() if k not in ("bufferView", "byteOffset", "count", "min", "max")}
        a["bufferView"] = len(self.views) - 1
        a["count"] = int(arr.shape[0])
        if "min" in src_acc and arr.shape[0] == src_acc["count"]:
            a["min"], a["max"] = src_acc["min"], src_acc["max"]
        elif a["type"] != "MAT4" and src_acc["componentType"] == 5126:
            a2 = arr.reshape(arr.shape[0], -1)
            a["min"] = [float(x) for x in a2.min(axis=0)]
            a["max"] = [float(x) for x in a2.max(axis=0)]
        self.accs.append(a)
        return len(self.accs) - 1

    def copy(self, i, target=None):
        if i in self.map:
            return self.map[i]
        arr = acc_array(self.js, self.rest, i)
        if self.js["accessors"][i]["type"] == "SCALAR":
            arr = arr.reshape(-1)
        self.map[i] = self.add_array(arr, self.js["accessors"][i], target)
        return self.map[i]


def rest_trs(node):
    return (np.array(node.get("translation", [0, 0, 0])), np.array(node.get("rotation", [0, 0, 0, 1])), np.array(node.get("scale", [1, 1, 1])))


def slim(js, rest, keep_clips, uv_rule):
    p = Packer(js, rest)
    stats = {"droppedChannels": 0, "constChannels": 0}
    for mi, m in enumerate(js["meshes"]):
        rule = uv_rule(m)
        for prim in m["primitives"]:
            prim["attributes"] = {k: p.copy(v, 34962) for k, v in prim["attributes"].items() if k not in DROP_ATTR}
            if "indices" in prim:
                prim["indices"] = p.copy(prim["indices"], 34963)
            if "targets" in prim:
                prim["targets"] = [{k: p.copy(v, 34962) for k, v in t.items() if k not in DROP_ATTR} for t in prim["targets"]]
        if rule:
            m.setdefault("extras", {})["mpjUv"] = rule
    for s in js.get("skins", []):
        if "inverseBindMatrices" in s:
            s["inverseBindMatrices"] = p.copy(s["inverseBindMatrices"])
    anims = []
    for a in js.get("animations", []):
        if a["name"] not in keep_clips:
            continue
        samplers, channels = [], []
        for ch in a["channels"]:
            smp = a["samplers"][ch["sampler"]]
            tgt = ch["target"]
            out = acc_array(js, rest, smp["output"])
            inp = acc_array(js, rest, smp["input"]).reshape(-1)
            if tgt["path"] != "weights":
                node = js["nodes"][tgt["node"]]
                t, r, s = rest_trs(node)
                ref = {"translation": t, "rotation": r, "scale": s}[tgt["path"]]
                const = np.all(np.abs(out - out[0]) <= 1e-6)
                if const and np.all(np.abs(out[0] - ref) <= 1e-6):
                    stats["droppedChannels"] += 1
                    continue
                if const:
                    stats["constChannels"] += 1
                    out, inp = out[:1], inp[:1]
            si = len(samplers)
            ia = p.add_array(inp.astype(np.float32), js["accessors"][smp["input"]])
            oa = p.add_array(out.astype(np.float32) if out.ndim == 1 else out.astype(np.float32), js["accessors"][smp["output"]])
            samplers.append({"input": ia, "output": oa, "interpolation": smp.get("interpolation", "LINEAR")})
            channels.append({"sampler": si, "target": tgt})
        a["samplers"], a["channels"] = samplers, channels
        anims.append(a)
    js["animations"] = anims
    js["accessors"], js["bufferViews"] = p.accs, p.views
    js["buffers"] = [{"byteLength": len(p.bin)}]
    while len(p.bin) % 4:
        p.bin.append(0)
    rest = struct.pack("<II", len(p.bin), 0x004E4942) + bytes(p.bin)
    return js, rest, stats


def png_size(path):
    with Image.open(path) as im:
        return im.size


def material_pngs(js):
    """body_m 계열 재질의 알베도·눈 텍스처 png 이름(변환 extras 기준)"""
    out = {}
    for mt in js["materials"]:
        f = mt.get("extras", {}).get("fres", {})
        for s in f.get("samplers", []):
            out.setdefault(mt["name"], {})[s["sampler"]] = s.get("png")
    return out


def eye_png(js):
    for mt in js["materials"]:
        for s in mt.get("extras", {}).get("fres", {}).get("samplers", []):
            t = s["texture"]
            if ("_eye_alb" in t or "_eye_arr_alb" in t) and s.get("png"):
                return mt["name"], s["png"]
    return None, None


def clips_only(js, rest, keep_clips):
    """클립만 든 glb: 노드 이름·계층은 그대로, 스킨·재질·텍스처 없음. 모프 클립이 묶일 수 있게 메시는 모프 수만 같은
    정점 1개짜리로 바꾼다(GLTFLoader 가 노드의 morphTargetInfluences 수로 트랙을 만든다). 화면은 클립만 꺼내 쓴다."""
    js = json.loads(json.dumps(js))
    js, rest, _ = slim(js, rest, keep_clips, lambda m: None)
    p = Packer(js, rest)
    zero = np.zeros((1, 3), np.float32)
    pos_src = {"componentType": 5126, "type": "VEC3", "count": 1}
    for m in js["meshes"]:
        prim = m["primitives"][0]
        nt = len(prim.get("targets", []))
        stub = {"attributes": {"POSITION": p.add_array(zero, pos_src)}, "mode": 0}
        if nt:
            stub["targets"] = [{"POSITION": p.add_array(zero, pos_src)} for _ in range(nt)]
        m["primitives"] = [stub]
        m.pop("weights", None)
    for a in js["animations"]:
        for smp in a["samplers"]:
            for k in ("input", "output"):
                arr = acc_array(js, rest, smp[k])
                smp[k] = p.add_array(arr.reshape(-1) if js["accessors"][smp[k]]["type"] == "SCALAR" else arr, js["accessors"][smp[k]])
    for n in js["nodes"]:
        n.pop("skin", None)
    for k in ("skins", "materials", "textures", "images", "samplers"):
        js.pop(k, None)
    js["accessors"], js["bufferViews"] = p.accs, p.views
    js["buffers"] = [{"byteLength": len(p.bin)}]
    while len(p.bin) % 4:
        p.bin.append(0)
    return js, struct.pack("<II", len(p.bin), 0x004E4942) + bytes(p.bin)


def compact_motions(mot, keep):
    out = {}
    for name in keep:
        e = mot.get(name)
        if not e:
            continue
        r = {"frames": e.get("frames"), "loop": e.get("loop"), "nameHash": e["nameHash"], "blink": sorted(e["blink"].keys()) if e.get("blink") else []}
        if e.get("blink"):
            r["blinkName"] = sorted(set(e["blink"].values()))[0]
        if "shapeFrames" in e:
            r["shapeFrames"] = e["shapeFrames"]
        if e.get("vis"):
            r["visFrames"] = e["vis"]["frames"]
            r["vis"] = {b: v for b, v in e["vis"]["bones"].items() if len(v) > 1 or v[0][1] == 0}
        if e.get("mat"):
            r["matFrames"] = e["mat"]["frames"]
            r["mat"] = e["mat"]["materials"]
        out[name] = r
    return out


def main():
    import chara_shared as cs
    data = json.loads(CHARLIST.read_text(encoding="utf-8-sig"))
    out_root = DST / "chara"
    out_root.mkdir(parents=True, exist_ok=True)
    index = {}
    for key in PCS + NPCS:
        kind = "npc" if key.startswith("npc") else "pc"
        src = SRC / key
        meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
        glb_name = meta["glb"]
        js, rest = read_glb(src / glb_name)
        mats = material_pngs(js)
        alb = next((v.get("_a0") for k, v in mats.items() if k == "body_m"), None)
        aw, ah = png_size(src / "tex" / alb) if alb else (1, 1)

        def uv_rule(m):
            prim = m["primitives"][0]
            mat = js["materials"][prim["material"]]
            if mat["name"] != "body_m" or "TEXCOORD_0" not in prim["attributes"]:
                return None
            if ah == 2 * aw:
                return "v2"
            if aw == 2 * ah:
                return "u2"
            return None

        keep = PC_CLIPS if kind == "pc" else NPC_CLIPS
        result_names = [c for c in PC_RESULT_CLIPS if kind == "pc" and any(a["name"] == c for a in js.get("animations", []))]
        eye_mat, eye = eye_png(js)
        color_png = None
        if key in NPC_COLOR and alb and alb.endswith("_00.png"):
            color_png = alb[:-len("00.png")] + "%02d.png" % NPC_COLOR[key]
        model, tex_map = cs.write_model(key, glb_name, js, rest, src / "tex", uv_rule, [eye, color_png])
        anims = cs.write_motions(key, js, rest, keep)
        result = cs.write_motions(key, js, rest, result_names)
        mot = json.loads((src / "motions.json").read_text(encoding="utf-8"))
        motions = cs.merge_motions(key, compact_motions(mot, keep + result_names))
        table = data["NPCCharacterData" if kind == "npc" else "PlayerCharacterData"]
        num = int(key[len(kind):])
        cid, cd = next((i, c) for i, c in enumerate(table) if c["Number"] == num)
        r = lambda p: cs.rel(out_root, p)  # noqa: E731
        entry = {"id": cid, "name": cd["charaname"], "glb": r(model), "motions": r(motions), "anims": [r(a) for a in anims],
                 "resultAnims": [r(a) for a in result],
                 "height": cd["height"], "head": {k[5:]: cd[k] for k in HEAD_KEYS},
                 "eyes": [{k: cd[f"eye{i}_{k}"] for k in EYE_KEYS} for i in (0, 1)],
                 "eyeTex": r(tex_map[eye]) if eye else None, "eyeMaterial": eye_mat,
                 "albedoSize": [aw, ah]}
        if color_png:
            entry["color"] = {"value": NPC_COLOR[key], "albedo": r(tex_map[color_png])}
        index[key] = entry
        print("%-6s %-10s model %8d B  motion glb %d + result %d  tex %s" % (
            key, cd["charaname"], (cs.CHARA / model).stat().st_size, len(anims), len(result), sorted(tex_map)))
    (out_root / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print("index %d, 공용 파일 경고 %d" % (len(index), len(cs.changed)))


if __name__ == "__main__":
    main()
