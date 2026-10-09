"""공용 에셋 변환기 코어 — 원본 아카이브 하나(extracted/bea/<분류>~<이름>.nx.bea, 분류 무관) → web/assets/<분류>/<이름>/ (설계 web/docs/engine/13_asset_converter.md).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/asset_convert.py <아카이브> [...]     예: menu~menu00  object~obj00_rengablock  bq  libca~mg_common
    --adapter generic|mg   장면 의미 어댑터(기본: 분류 mg~ 이면 mg, 그 밖 generic)
    --out <폴더>           출력 루트(기본 web/assets). 기존 산출물과 비교할 때 scratch 로(--out 이면 assets/converted.json 을 고치지 않음)
    --only gfx,ui,sound,fx,data   그 부분만(나머지는 이전 manifest 값 유지)
    --models a,b           그래픽 처리기를 이 모델만으로(기존 산출물 대조용)
    --force                중간 변환 캐시(analysis/asset_convert/) 무시

구조: 아카이브 → 형식별 처리기(HANDLERS, 꽂는 방식) → 분류별 어댑터(Adapter: 출력 위치·환경 선택·장면 의미 extend) → manifest.json
  처리기   gfx(FMDB·FSKB·FSHB·FMAB·FVBB·FSNB·BNTX → glb·png·anim·cam, graphics_convert.py) / env(env·dir_light·post·skybox·point_light 컨테이너)
           graph(bnbshpk 셰이더 그래프: 광장 판독 재사용 + SASS 준비) / collision(nbmap·apx → 삼각형) / ui(lyt SARC: bflyt·bflan·bntx)
           msg(msbt) / sound(fsar·fsst → 시퀀스 렌더·BFSTM) / fx(VFXB ConvertList.xml) / data(json·csv·msgpack 원본 그대로)
  공용 폴더 판정: sys_ UI 그림·SQ_SE_SYS_ 소리 = common_shared.py, 글꼴 = font_web_assets.py(assets/font 참조), 그 밖 모든 파일 = 공용 폴더
           (assets/common·chara·font)와 같은 바이트면 쓰지 않고 그 경로를 가리킨다. chara~·font~ 아카이브는 공용 폴더 담당 변환기
           (chara_shared.py·font_web_assets.py) 몫이라 이 코어가 직접 쓰지 않는다(13_asset_converter.md §6 이전 표).
  압축 빌드 분류: 출력 루트를 assets/converted.json 에 적는다 → tools/assets_tex.ts 가 그 아래 tex/·fx/tex/ = 3D(밉), ui/ = UI 로 자동 분류.
중간 변환 = analysis/asset_convert/<분류>/<이름>/(graphics_convert 출력), 셰이더 SASS = analysis/mat/conv/<분류>/<이름>/. 원본·extracted 는 읽기만 한다.
같은 경로에 다른 내용을 쓰면 경고하고 덮어쓴다(재현 = 같은 입력이면 같은 바이트). 이번에 쓰지 않은 옛 파일은 경고만(지우지 않음).
"""
import argparse
import copy
import hashlib
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / "web" / "tools" / "analysis"
sys.path.insert(0, str(TOOLS))
import common_shared as cs  # noqa: E402
import graphics_convert as gc  # noqa: E402
import plaza_graph_web as pgw  # noqa: E402
import shader_graph_dictionary as sgd
import plaza_world_assets as pw  # noqa: E402
import scene_apx  # noqa: E402
import scene_nbmap  # noqa: E402

BEA = ROOT / "extracted" / "bea"
ASSETS = ROOT / "web" / "assets"
CACHE = ROOT / "analysis" / "asset_convert"
MAT = ROOT / "analysis" / "mat" / "conv"
REGISTRY = ASSETS / "converted.json"
EXE = Path(gc.EXE)
DUMP = TOOLS / "bfsha_dump_bin" / "bfsha_dump.exe"
STREAM = ROOT / "extracted" / "romfs" / "stream"
SHARED = ("common", "chara", "font")
RESERVED = {"chara": "chara_shared.py(assets/chara)", "font": "font_web_assets.py(assets/font)"}
VERSION = 1
ENV_KINDS = ("environment", "directional_light", "posteffect", "skybox", "point_light")
# 출력 폴더 역할(압축 빌드 분류 — tools/assets_tex.ts 가 converted.json 의 roles 를 읽는다)
ROLES = {"model/": "mesh", "tex/": "3d", "anim/": "json", "cam/": "json", "fx/tex/": "3d", "fx/": "keep", "ui/tex/": "ui", "ui/": "json",
         "sound/": "audio", "data/": "keep", "msg/": "json"}
PARTS = ("gfx", "ui", "sound", "fx", "data")


# ---------------------------------------------------------------- 공통

def load_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def json_safe(o):
    """JSON 표준 밖 값(NaN·±Infinity — VFXB 원본 실수에 있음)을 문자열로(브라우저 JSON.parse 가 읽게, 값 뜻은 그대로)"""
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return "NaN" if o != o else ("Infinity" if o > 0 else "-Infinity")
    if isinstance(o, dict):
        return {k: json_safe(v) for k, v in o.items()}
    if isinstance(o, list):
        return [json_safe(v) for v in o]
    return o


def jbytes(obj, pretty=False):
    obj = json_safe(obj)
    if pretty:
        return json.dumps(obj, ensure_ascii=False, indent=1, allow_nan=False).encode("utf-8")
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def sha1(b):
    return hashlib.sha1(b).hexdigest()


def glb_split(b):
    n = struct.unpack_from("<I", b, 12)[0]
    return json.loads(b[20:20 + n]), b[20 + n:]


def files_with(root, exts):
    return sorted(p for p in Path(root).rglob("*") if p.is_file() and p.suffix in exts)


def trs(t, q, s):
    x, y, z, w = q
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = r * np.array(s, dtype=np.float64)[None, :]
    m[:3, 3] = t
    return m


def mat_to_tq(m):
    """행렬 → 위치·회전(배율 제거 = ComAttachment 규칙: 위치·회전만)"""
    r = m[:3, :3].copy()
    for k in range(3):
        n = np.linalg.norm(r[:, k])
        if n > 0:
            r[:, k] /= n
    tr = r[0, 0] + r[1, 1] + r[2, 2]
    if tr > 0:
        s = np.sqrt(tr + 1.0) * 2
        q = [(r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s, 0.25 * s]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [0.25 * s, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s, (r[2, 1] - r[1, 2]) / s]
    elif r[1, 1] > r[2, 2]:
        s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 1] + r[1, 0]) / s, 0.25 * s, (r[1, 2] + r[2, 1]) / s, (r[0, 2] - r[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, 0.25 * s, (r[1, 0] - r[0, 1]) / s]
    return [float(x) for x in m[:3, 3]], [float(x) for x in q]


def node_matrices(js):
    """glb 노드 월드 행렬(모델 루트 = 항등)"""
    nodes = js.get("nodes", [])
    local = []
    for n in nodes:
        if "matrix" in n:
            local.append(np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T)
        else:
            local.append(trs(n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1]), n.get("scale", [1, 1, 1])))
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
    world = [None] * len(nodes)

    def w(i):
        if world[i] is None:
            world[i] = (w(parent[i]) @ local[i]) if i in parent else local[i]
        return world[i]
    return [w(i) for i in range(len(nodes))]


def glb_bounds(js):
    """바인드 자세 경계(모델 루트 기준) [x0,y0,z0,x1,y1,z1] — 메시 노드 월드 행렬 × POSITION min/max 8모서리(스킨 메시는 항등)"""
    world = node_matrices(js)
    acc = js.get("accessors", [])
    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    for i, n in enumerate(js.get("nodes", [])):
        if "mesh" not in n:
            continue
        m = world[i] if "skin" not in n else np.eye(4)
        for p in js["meshes"][n["mesh"]]["primitives"]:
            a = acc[p["attributes"]["POSITION"]]
            if "min" not in a:
                continue
            for cx in (a["min"][0], a["max"][0]):
                for cy in (a["min"][1], a["max"][1]):
                    for cz in (a["min"][2], a["max"][2]):
                        v = m @ np.array([cx, cy, cz, 1.0])
                        lo = np.minimum(lo, v[:3])
                        hi = np.maximum(hi, v[:3])
    if not np.isfinite(lo).all():
        return None
    return lo.tolist() + hi.tolist()


class SharedIndex:
    """공용 폴더(assets/common·chara·font) 바이트 색인 — 같은 바이트를 아카이브 폴더에 다시 만들지 않는다(common_assets.md §4.1 의 바이트 판정)"""

    def __init__(self):
        self.by = None

    def find(self, data):
        if self.by is None:
            self.by = {}
            for top in SHARED:
                for p in files_with(ASSETS / top, (".png", ".hdr", ".wav", ".otf")) if (ASSETS / top).exists() else []:
                    self.by.setdefault((p.stat().st_size, sha1(p.read_bytes())), p.relative_to(ASSETS).as_posix())
        return self.by.get((len(data), sha1(data)))


SHARED_INDEX = SharedIndex()


class Writer:
    """아카이브 폴더 쓰기 — 같은 경로 다른 내용 경고, 공용 폴더와 같은 바이트면 쓰지 않고 'shared:<assets 기준 경로>' 를 돌려준다"""

    def __init__(self, out_dir, report):
        self.out = Path(out_dir)
        self.report = report
        self.written = {}

    def put(self, rel, data, share=True):
        if share and Path(rel).suffix in (".png", ".hdr", ".wav", ".otf"):
            hit = SHARED_INDEX.find(data)
            if hit:
                self.report["shared"].append([rel, hit])
                return "shared:" + hit
        p = self.out / rel
        h = sha1(data)
        if rel in self.written and self.written[rel] != h:
            self.report["warnings"].append(f"한 번 실행 안에서 같은 경로에 다른 내용: {rel}")
        self.written[rel] = h
        if p.exists():
            if p.read_bytes() == data:
                self.report["same"] += 1
                return rel
            self.report["warnings"].append(f"같은 경로에 다른 내용(덮어씀): {rel}")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        self.report["new"] += 1
        return rel

    def rel_from(self, at_dir, target):
        """put 반환값 → 아카이브 폴더 안 at_dir 에서 본 상대 경로"""
        abs_t = ASSETS / target[7:] if target.startswith("shared:") else self.out / target
        return os.path.relpath(abs_t, self.out / at_dir).replace("\\", "/")

    def abs(self, target):
        return ASSETS / target[7:] if target.startswith("shared:") else self.out / target

    def stale(self, prefixes):
        if not self.out.exists():
            return []
        return [r for r in (p.relative_to(self.out).as_posix() for p in sorted(self.out.rglob("*")) if p.is_file())
                if r not in self.written and r.startswith(prefixes)]


# ---------------------------------------------------------------- 아카이브·작업

class Archive:
    """'<분류>~<이름>[~…].nx[.<로캘>].bea' 또는 그 이름(접미 생략 가능) → 분류·이름·출력 상대 경로(assets/<분류>/<이름…>[/<로캘>])"""

    def __init__(self, spec):
        s = spec.replace("\\", "/").rstrip("/").split("/")[-1]
        cands = [s] if s.endswith(".bea") else [f"{s}.nx.bea"] + [p.name for p in sorted(BEA.glob(f"{s}.nx.*.bea"))]
        name = next((c for c in cands if (BEA / c).is_dir()), None)
        if not name:
            raise SystemExit(f"원본 아카이브 없음: {spec}")
        self.file = name
        self.root = BEA / name
        m = re.match(r"^(.*?)\.nx(?:\.([A-Za-z]{4}))?\.bea$", name)
        base, self.locale = m.group(1), m.group(2)
        self.parts = base.split("~")
        self.category = self.parts[0]
        self.name = "/".join(self.parts[1:]) or self.parts[0]
        self.out_rel = "/".join(self.parts + ([self.locale] if self.locale else []))


class Job:
    def __init__(self, arc, adapter, out_root, only, force, models_filter):
        self.arc = arc
        self.adapter = adapter
        self.out = Path(out_root) / adapter.out_rel(arc)
        self.only = only
        self.force = force
        self.models_filter = models_filter
        self.report = {"archive": arc.file, "warnings": [], "notes": [], "shared": [], "new": 0, "same": 0}
        self.w = Writer(self.out, self.report)
        self.cache = CACHE / arc.out_rel
        self.man = {"set": adapter.out_rel(arc), "source": arc.file, "generator": "tools/analysis/asset_convert.py", "adapter": adapter.name, "version": VERSION}
        self.ext = {"archive": arc.file, "category": arc.category, "name": arc.name}
        self.old = load_json(self.out / "manifest.json") if (self.out / "manifest.json").exists() else {}
        self.glb_js = {}
        self.tex = None
        self.dumps = {}

    def want(self, part):
        return self.only is None or part in self.only


# ---------------------------------------------------------------- 처리기: 그래픽(graphics_convert.py 재사용)

def gfx_spec(job):
    """graphics_convert.SETS 형식. env/ 폴더 fmdb = 장면 파라미터 컨테이너(dump), 그 밖 fmdb = 모델. fskb 는 같은 폴더에서 이름 앞부분이
    가장 긴 모델에(graphics_convert.prefix_anims — menu00·mgmet 과 같은 규칙), fshb 는 같은 이름 모델에, fmab·fvbb·fsnb 는 anim"""
    root = job.arc.root
    dirs = sorted({p.parent for p in root.rglob("*.fmdb")})
    models, envs, anims = [], [], []
    for d in dirs:
        if d.name == "env":
            envs += gc.files_under(str(d), ".fmdb")
            continue
        owner = gc.prefix_anims(str(d))
        shp = {}
        for f in sorted(d.glob("*.fshb")):
            shp.setdefault(f.stem, []).append(str(f))
        for f in sorted(d.glob("*.fmdb")):
            if job.models_filter and f.stem not in job.models_filter:
                continue
            models.append({"fmdb": str(f), "anims": owner.get(f.stem, []), "shapeAnims": shp.get(f.stem, [])})
    if not job.models_filter:
        anims = [str(p) for p in files_with(root, (".fmab", ".fvbb", ".fsnb")) if not p.name.endswith(".ftsb.fmab")]
    textures = [str(p) for p in files_with(root, (".bntx",))]
    if job.models_filter:
        envs = []
    return {"bea": job.arc.file, "textures": textures, "models": models, "envModels": envs, "anims": sorted(set(anims))}


def fingerprint(job):
    h = hashlib.sha1()
    for p in sorted(job.arc.root.rglob("*")):
        if p.is_file():
            st = p.stat()
            h.update(f"{p.relative_to(job.arc.root).as_posix()}|{st.st_size}|{int(st.st_mtime)}\n".encode())
    for tool in (EXE, TOOLS / "graphics_convert.py", TOOLS / "graphics_bntx.py"):
        h.update(f"{tool.name}|{int(tool.stat().st_mtime)}\n".encode())
    h.update(f"v{VERSION}|{sorted(job.models_filter or [])}".encode())
    return h.hexdigest()


def vat_raw(t, out_dir):
    """R16G16B16A16 FLOAT(정점 애니 텍스처 VAT *_pos·*_rot, 03_graphics.md §4.4.4·§5.3) — PNG 로 못 담으므로 디스위즐한 원본 half float RGBA 를 그대로
    <이름>.f16.bin 에 쓴다(행 = 위에서 아래, 픽셀당 8 B). graphics_bntx 표에 없는 형식이라 도구를 고치지 않고 여기서 디스위즐만 재사용"""
    gb = gc.graphics_bntx
    m = gb.meta(t)
    stride = t.image_size // max(1, t.array)
    end = t.mip_offsets[1] if t.mips > 1 else stride
    lin, wb, hb = gb.deswizzle(t.raw[t.data_off + t.mip_offsets[0]:t.data_off + end], t.width, t.height, 1, 1, 8, t.block_height_log2)
    a = np.frombuffer(lin, np.uint8).reshape(hb, wb * 8)[: t.height, : t.width * 8]
    fn = t.name + ".f16.bin"
    Path(out_dir, fn).write_bytes(np.ascontiguousarray(a).tobytes())
    m.update({"files": [fn], "raw": "R16G16B16A16_FLOAT", "rawWidth": t.width, "rawHeight": t.height})
    return m


def run_graphics_convert(job):
    cdir = job.cache
    fp = fingerprint(job)
    stamp = cdir / "fingerprint.json"
    if not job.force and stamp.exists() and load_json(stamp).get("fp") == fp and (cdir / "manifest.json").exists():
        job.report["gfxCache"] = "재사용"
        return cdir
    if cdir.exists():
        shutil.move(str(cdir), str(Path(tempfile.gettempdir()) / f"asset_convert_old_{cdir.name}_{os.getpid()}"))
    cdir.parent.mkdir(parents=True, exist_ok=True)
    gc.OUT = str(cdir.parent)
    gc.SETS[cdir.name] = lambda: gfx_spec(job)
    orig = gc.graphics_bntx.to_png

    def to_png(t, d):
        if (t.format >> 8) == 0x15 and t.array <= 1 and t.depth <= 1:
            return vat_raw(t, d)
        try:
            return orig(t, d)
        except KeyError as e:  # graphics_bntx 표에 없는 형식 → graphics_convert 가 'not decoded' 로 적게 한다(도구는 고치지 않음)
            job.report["warnings"].append(f"BNTX 형식 미지원 {t.name} format {t.format:#x}")
            raise NotImplementedError(f"format {t.format:#x}") from e
    gc.graphics_bntx.to_png = to_png
    try:
        gc.convert(cdir.name)
    finally:
        gc.graphics_bntx.to_png = orig
    stamp.write_text(json.dumps({"fp": fp}), encoding="utf-8")
    job.report["gfxCache"] = "새로 변환"
    return cdir


class TexAdder:
    """텍스처 이름 → manifest.textures 항목 + 파일 복사(광장 plaza_world_assets.tex_entry 와 같은 색인). 원본 픽셀 그대로(축소 없음 — assets_pipeline.md §3.4)"""

    def __init__(self, job, gman):
        self.job = job
        self.gman = gman
        self.textures = {}
        self.files = {}
        self.puts = {}

    def file(self, fn):
        if fn not in self.files:
            self.files[fn] = self.job.w.put(f"tex/{fn}", (self.job.cache / "tex" / fn).read_bytes())
        return self.files[fn]

    def __call__(self, name):
        if not name:
            return None
        if name in self.textures:
            return name
        m = self.gman["textures"].get(name)
        if not m:
            return None
        meta = load_json(self.job.cache / "tex" / f"{name}.json")
        files = meta.get("hdrFiles") or meta.get("files") or []
        self.puts[name] = [self.file(fn) for fn in files]
        self.textures[name] = {"files": [self.job.w.rel_from("tex", r) for r in self.puts[name]], "srgb": bool(m["srgb"]), "cube": m["viewDim"] == "Cube",
                               "format": m["format"], "w": m["w"], "h": m["h"], "depth": meta.get("depth", 1)}
        return name

    def cube_mean(self, name):
        from PIL import Image
        meta = load_json(self.job.cache / "tex" / f"{name}.json")
        fs = meta.get("files") or []
        acc = np.zeros(3)
        for fn in fs:
            acc += np.asarray(Image.open(self.job.cache / "tex" / fn).convert("RGB"), dtype=np.float64).reshape(-1, 3).mean(0) / 255.0
        return [round(float(v), 5) for v in acc / max(1, len(fs))]

    def hdr_mean(self, name):
        meta = load_json(self.job.cache / "tex" / f"{name}.json")
        fs = [self.job.cache / "tex" / f for f in meta.get("hdrFiles", [])]
        if not fs:
            return 0.0
        a = np.concatenate([pw.read_hdr(str(f)).reshape(-1, 3) for f in fs])
        return float((a @ np.array([0.2126, 0.7152, 0.0722])).mean())


# glb 이미지(PBR 근사) 밖에서 재질이 직접 읽는 슬롯(mg1801_web_models.EXTRA_SLOTS + 라이트맵 그림자·그래프 입력). 그래프 재질은 샘플러 전부(판독 식이 _r0 등을 읽음)
EXTRA_SLOTS = ("gi_diffuse_texture2d", "local_specular_texturecube", "shadow_texture2d")


def ship_glb(job, name):
    """glb 복사 — 이미지 uri ../tex/x 를 실제로 쓴 곳(아카이브 tex 또는 공용 폴더)으로. 바뀐 게 없으면 바이트 그대로"""
    raw = (job.cache / "model" / f"{name}.glb").read_bytes()
    js, rest = glb_split(raw)
    used, change = [], False
    for im in js.get("images", []):
        uri = im.get("uri")
        if not uri:
            continue
        r = job.tex.file(uri.split("/")[-1])
        used.append(r)
        new = job.w.rel_from("model", r)
        if new != uri:
            im["uri"] = new
            change = True
    for m in js.get("materials", []):
        f = (m.get("extras") or {}).get("fres") or {}
        graph = ((f.get("shader") or {}).get("options") or {}).get("static_opt_shader_graph") == "1"
        for s in f.get("samplers", []):
            if (graph or any(sl in EXTRA_SLOTS or sl.startswith("sg_utility_texture") for sl in s["slots"])) and job.tex(s["texture"]):
                used.extend(job.tex.puts[s["texture"]])
    if change:
        import chara_shared
        raw = chara_shared.glb_bytes(js, rest)
    job.w.put(f"model/{name}.glb", raw, share=False)
    return js, sorted(set(used))


def env_dumps(cdir):
    """env 컨테이너 dump(graphics_convert 3단계) → 셰이딩 모델 종류별 {이름: (재질, 뼈)}"""
    out = {}
    for p in sorted((cdir / "meta").glob("*.dump.json")):
        m = load_json(p)[0]["models"][0]
        mat = m["materials"][0]
        out.setdefault(mat["shader"].get("model"), {})[p.name[: -len(".dump.json")]] = (mat, m["skeleton"]["bones"])
    return out


def sky_glb(job, name):
    """하늘 컨테이너(skybox) → glb(--all, plaza_world_assets 와 같은 명령)"""
    src = next(job.arc.root.rglob(f"{name}.fmdb"))
    glb = job.cache / "model" / f"{name}.glb"
    meta = job.cache / "meta" / f"{name}.json"
    if not glb.exists():
        subprocess.run([str(EXE), "gltf", str(src), str(glb), "--texdir", str(job.cache / "tex"), "--texuri", "../tex/", "--meta", str(meta), "--all"],
                       check=True, capture_output=True)
    return load_json(meta)


def handle_gfx(job):
    """모델·텍스처·애니·카메라 → manifest models·textures·anims + ext.cameras"""
    cdir = run_graphics_convert(job)
    gman = load_json(cdir / "manifest.json")
    job.gman = gman
    job.tex = TexAdder(job, gman)
    job.dumps = env_dumps(cdir)
    job.env_chosen, job.env_variants = pick_env(job)
    sky = job.env_chosen.get("skybox")
    names = sorted(gman["models"])
    if sky:
        sky_glb(job, sky)
        names.append(sky)
    models = {}
    for name in names:
        js, used = ship_glb(job, name)
        job.glb_js[name] = js
        info = gman["models"].get(name)
        if info is None:
            meta = load_json(cdir / "meta" / f"{name}.json")
            info = {"vertices": meta["vertexCount"], "triangles": meta["triangleCount"], "bones": meta["bones"], "clips": {}}
        models[name] = {"url": f"model/{name}.glb", "bytes": (job.out / "model" / f"{name}.glb").stat().st_size,
                        "texBytes": sum(job.w.abs(f).stat().st_size for f in used), "tex": [job.w.rel_from("tex", f) for f in used],
                        "vertices": info["vertices"], "triangles": info["triangles"], "bones": info["bones"], "clips": info["clips"]}
    anims, cams = {}, {}
    for fn, rel in sorted(gman["anims"].items()):
        data = (cdir / rel).read_bytes()
        if fn.endswith(".fsnb"):
            sa = (json.loads(data).get("sceneAnims") or [{}])[0]
            c = sa.get("cameras") or []
            job.w.put(f"cam/{fn}.json", data)
            cams[fn[:-5]] = {"file": f"cam/{fn}.json", "frames": c[0]["frames"] if c else 0, "loop": c[0]["loop"] if c else False,
                             "mode": c[0]["mode"] if c else None, "cameras": len(c), "lights": len(sa.get("lights") or []), "fogs": len(sa.get("fogs") or [])}
        else:
            job.w.put(f"anim/{fn}.json", data)
            anims[fn] = f"anim/{fn}.json"
    job.man.update({"models": models, "anims": anims})
    job.ext["cameras"] = cams
    job.ext["sockets"] = sorted({nd.get("name") for js in job.glb_js.values() for nd in js.get("nodes", []) if re.match(r"^(pos_|attach_|loc_)", nd.get("name") or "")})


# ---------------------------------------------------------------- 처리기: 환경(env·dir_light·post·skybox·point_light)

def pick_env(job):
    chosen, variants = {}, {}
    want = job.adapter.env_pick(job)
    for kind in ENV_KINDS:
        items = job.dumps.get(kind, {})
        if not items:
            continue
        names = sorted(items)
        pick = want.get(kind)
        if pick not in items:
            plain = [n for n in names if re.search(r"_(env|env00|dir_light|dir_light00|post|skybox|sky)$", n)]
            pick = (plain or [n for n in names if "_game" in n] or names)[0]
            job.report["notes"].append(f"환경 {kind} = {pick} [추정: 이름 규칙]")
        chosen[kind] = pick
        variants[kind] = [n for n in names if n != pick]
    return chosen, variants


def params_of(mat):
    return {k: v["value"] for k, v in mat["params"].items()}


def build_env(job, chosen):
    """광장 plaza_world_assets.py env 와 같은 필드(stage3d StageEnv). 값 = env 컨테이너 dump 그대로"""
    env, d, tex = {}, job.dumps, job.tex
    if "directional_light" in chosen:
        light, bones = d["directional_light"][chosen["directional_light"]]
        lp = params_of(light)
        if lp.get("directional_light_transform_overwrite") == 1:
            dr = pw.euler_dir(*lp["directional_light_overwrite_rotation"])
        else:
            dr = pw.euler_dir(*np.degrees(bones[0]["R"][:3]).tolist())
            job.report["notes"].append(f"평행광 {chosen['directional_light']} 방향 = 컨테이너 뼈 회전(overwrite 0, 07_camera_lighting §6.6)")
        env["light"] = {"dir": dr, "color": lp["directional_light_color"]}
        env["shadow"] = {"near": lp["directional_light_shadowmap_camera_near"], "far": lp["directional_light_shadowmap_camera_far"],
                         "offset": lp["directional_light_shadowmap_camera_offset"], "cascades": lp["directional_light_shadowmap_array_length"],
                         "lambda": lp["directional_light_shadowmap_lambda"]}
    if "environment" in chosen:
        envm, _ = d["environment"][chosen["environment"]]
        ep = params_of(envm)
        es = pw.sampler_textures(envm)
        cube = lambda k: tex(es.get(k))  # noqa: E731
        common = [cube("env_common_specular_texturecube"), cube("env_common_diffuse_texturecube")]
        chara = [cube("env_char_specular_texturecube"), cube("env_char_diffuse_texturecube")]
        if all(common):
            env["ibl"] = {"common": common, "chara": chara if all(chara) else None}
        if ep.get("env_mip_fog_enable") == 1:
            fc = cube("env_mip_fog_texturecube0")
            env["fog"] = {"start": ep["env_mip_fog_start_distance"], "end": ep["env_mip_fog_end_distance"], "intensity": ep["env_mip_fog_intensity"],
                          "cube": fc, "color": tex.cube_mean(fc) if fc else [0.5, 0.5, 0.5]}
        else:
            env["fog"] = None
        if ep.get("env_height_fog_enable") == 1:
            env["heightFog"] = {k[len("env_height_fog_"):]: ep[k] for k in ep if k.startswith("env_height_fog_") and k != "env_height_fog_enable"}
        env["envUtility"] = {k: ep[k] for k in ("env_utility_parameter0", "env_utility_parameter1", "env_utility_parameter2", "env_utility_parameter3") if k in ep}
        if es.get("env_sg_utility_texture2d0"):
            env["windNoise"] = tex(es["env_sg_utility_texture2d0"])
    env["clear"] = [0.25, 0.25, 0.25]
    if "posteffect" in chosen:
        post, _ = d["posteffect"][chosen["posteffect"]]
        pp = params_of(post)
        g = pp.get
        lut = tex(post["textures"][0]) if g("posteffect_color_grading_enable") == 1 and g("posteffect_color_grading_lut_enable") == 1 and post.get("textures") else None
        env["post"] = {"tonemapType": (post.get("renderInfo", {}).get("posteffect_renderinfo_tonemap_type") or [0])[0], "exposure": g("posteffect_tonemap_exposure", 1),
                       "exposureOffset": g("posteffect_tonemap_exposure_offset", 0), "outputScale": g("posteffect_tonemap_output_scale", 1),
                       "bloom": g("posteffect_bloom_enable") == 1, "bloomThreshold": g("posteffect_bloom_threshold", 1), "bloomIntensity": g("posteffect_bloom_intensity", 0),
                       "bloomSpread": g("posteffect_bloom_spread", 0), "bloomClip": g("posteffect_bloom_clip", 1000), "fxaa": g("posteffect_fxaa_enable") == 1,
                       "fxaaEdgeThreshold": g("posteffect_fxaa_edge_threshold", 0.125), "fxaaEdgeThresholdMin": g("posteffect_fxaa_edge_threshold_min", 0.0625),
                       "fxaaSubPixel": g("posteffect_fxaa_sub_pixel", 0.75), "lut": lut, "dof": g("posteffect_dof_enable") == 1,
                       "vignetteIntensity": g("posteffect_color_grading_vignette_intensity", 0), "vignetteAspect": g("posteffect_color_grading_vignette_aspect_rate", 1)}
    if "point_light" in chosen:
        env["pointLights"] = [{"name": pl["name"], "position": b[0]["T"], "color": params_of(pl)["point_light_color"], "radius": params_of(pl)["point_light_radius"],
                               "coreRadius": params_of(pl)["point_light_core_radius"]} for _, (pl, b) in sorted(d["point_light"].items())]
    if "skybox" in chosen:
        sm, sb = d["skybox"][chosen["skybox"]]
        env["sky"] = {"model": chosen["skybox"], "texture": tex(pw.sampler_textures(sm).get("skybox_sg_utility_texture2d0")), "params": params_of(sm),
                      "graph": sm["shader"]["options"].get("fragment_shader_graph_skybox"), "position": sb[0]["T"]}
    return env


def handle_env(job):
    if not job.dumps:
        job.man["env"] = {"clear": [0.25, 0.25, 0.25]}
        job.ext["envChosen"], job.ext["envVariants"] = {}, {}
        return
    env = build_env(job, job.env_chosen)
    if env.get("heightFog"):
        job.report["notes"].append("높이 안개(env_height_fog) 값만 싣는다 — stage3d 미구현 [근사]")
    variants = {}
    for kind, lst in job.env_variants.items():
        for n in lst:
            one = build_env(job, {kind: n})
            one.pop("clear", None)
            variants[n] = {"kind": kind, "env": one}
    if env.get("ibl"):
        rad = env["ibl"]["common"][0]
        basev = job.tex.hdr_mean(rad)
        for t, te in job.tex.textures.items():
            if te.get("cube") and t != rad and t.endswith("_rad"):
                mv = job.tex.hdr_mean(t)
                if mv > 0 and basev > 0:
                    te["specNorm"] = round(basev / mv, 5)
    job.man["env"] = env
    job.ext["envChosen"] = job.env_chosen
    job.ext["envVariants"] = variants


# ---------------------------------------------------------------- 처리기: 셰이더 그래프(광장 판독 재사용 + SASS 준비)

GRAPH_OPT = ("fragment_shader_graph_", "vertex_shader_graph_")
_PLAZA = None


def graph_key(opts):
    return tuple(sorted((k, v) for k, v in opts.items() if k.startswith(GRAPH_OPT)))


def plaza_graph_index():
    """광장 판독 그래프(plaza_graph_web.build) → 그래프 해시 키(재질 옵션 *_shader_graph_*) → 정의. 같은 그래프 해시 = 같은 그래프 식 [추정]"""
    global _PLAZA
    if _PLAZA is None:
        defs = {d["material"]: d for d in pgw.build()}
        _PLAZA = {}
        for p in sorted((ASSETS / "plaza" / "world" / "model").glob("*.glb")):
            js, _ = glb_split(p.read_bytes())
            for m in js.get("materials", []):
                f = (m.get("extras") or {}).get("fres") or {}
                o = (f.get("shader") or {}).get("options") or {}
                if o.get("static_opt_shader_graph") == "1" and f.get("name") in defs:
                    _PLAZA.setdefault(graph_key(o), defs[f["name"]])
    return _PLAZA


def sass_pipeline(job, mats):
    """판독 준비: bnbshpk_split → bfsha_dump model/match → sass_dis (plaza_npc_graph.py 와 같은 경로 바꾸기 래퍼)"""
    import bnbshpk_split
    import sass_dis
    packs = files_with(job.arc.root, (".bnbshpk",))
    if not packs or not mats:
        return {}, None
    base = MAT / job.arc.out_rel
    for pk in packs:
        shpk = base / "shpk" / pk.stem
        if not (shpk / "forward_plus.json").exists():
            for _ in bnbshpk_split.split(str(pk), str(shpk)):
                pass
            for f in sorted(shpk.glob("*.bfsha")):
                subprocess.run([str(DUMP), "model", str(f), str(f)[:-6] + ".json"], check=True, capture_output=True)
    shpk = base / "shpk" / packs[0].stem
    rows = [{"file": f"{model}.glb", "name": f"{model}:{f.get('name')}", "archive": f["shader"]["archive"], "model": f["shader"]["model"],
             "options": f["shader"]["options"], "shpk": str(shpk)} for model, f in mats]
    (base / "mats_in.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    subprocess.run([str(DUMP), "match", str(base / "shpk"), str(base / "mats_in.json"), str(base / "prog")], check=True, capture_output=True)
    sass_dis.PROG, sass_dis.SHPK, sass_dis.OUT = str(base / "prog"), str(base / "shpk"), str(base / "sass")
    os.makedirs(sass_dis.OUT, exist_ok=True)
    tags = {}
    for e in load_json(base / "prog" / "match.json"):
        u = e.get("used")
        if not u:
            job.report["warnings"].append(f"셰이더 프로그램 못 찾음 {e['name']}: {e.get('err')}")
            continue
        tags[e["name"]] = u["tag"]
        for st in ("fs", "vs"):
            fn = Path(sass_dis.OUT) / f"{u['tag']}.{st}.txt"
            if not fn.exists():
                try:
                    fn.write_text(f"// {u['tag']} {st}  재질 예: {e['file']} {e['name']}\n" + "\n".join(sass_dis.run(u["tag"], st, e)) + "\n", encoding="utf-8")
                except Exception as ex:  # noqa: BLE001 — 디스어셈블 실패는 판독 대기 목록에만 남긴다
                    job.report["warnings"].append(f"SASS 실패 {u['tag']} {st}: {ex}")
    return tags, base


def handle_graph(job):
    """그래프 재질 → manifest.graphs(graph.ts GraphDef). 순서: 이 아카이브 판독(analysis/mat/conv/<…>/graph.json) > 광장 판독(같은 그래프 해시) > 판독 대기(SASS 준비)"""
    mats = []
    for name, js in job.glb_js.items():
        if name == job.env_chosen.get("skybox"):
            continue
        for m in js.get("materials", []):
            f = (m.get("extras") or {}).get("fres") or {}
            if ((f.get("shader") or {}).get("options") or {}).get("static_opt_shader_graph") == "1":
                mats.append((name, f))
    own_defs = {}
    own = MAT / job.arc.out_rel / "graph.json"
    if own.exists():
        src = pgw.SRC
        pgw.SRC = [str(own)]
        try:
            own_defs = {d["material"]: d for d in pgw.build()}
        finally:
            pgw.SRC = src
    plaza = plaza_graph_index() if mats else {}
    defs, need, seen = {}, [], set()
    for model, f in mats:
        name = f.get("name")
        if (name, model) in seen:
            continue
        seen.add((name, model))
        shared_src = sgd.load_definition(f["shader"]["options"], material=f, environment=job.man.get("env"))
        src = shared_src or own_defs.get(name) or plaza.get(graph_key(f["shader"]["options"]))
        if not src:
            need.append((model, f))
            continue
        d = sgd.bind_definition(src, f, model) if shared_src else copy.deepcopy(src)
        if not shared_src and name not in own_defs:
            tex = {}
            for s in f.get("samplers", []):
                tex[s["sampler"]] = s["texture"]
                for sl in s["slots"]:
                    tex[sl] = s["texture"]
            d["samplers"] = {k: tex.get(k) for k in d["samplers"]}
            d["approx"] = " / ".join(x for x in [d.get("approx"), f"광장 판독 재사용({src['material']}, 같은 그래프 해시) [추정]"] if x)
        d["material"] = name
        d["models"] = [model]
        k = name if name not in defs or defs[name]["samplers"] != d["samplers"] else f"{name}@{model}"
        if k in defs:
            defs[k]["models"] = sorted(set(defs[k]["models"]) | {model})
        else:
            defs[k] = d
    tags, base = sass_pipeline(job, need) if need else ({}, None)
    pending = []
    for model, f in need:
        tag = tags.get(f"{model}:{f.get('name')}")
        pending.append({"material": f.get("name"), "model": model, "graph": dict(graph_key(f["shader"]["options"])),
                        "sass": (base / "sass" / f"{tag}.fs.txt").relative_to(ROOT).as_posix() if tag else None})
    for d in defs.values():
        for t in d["samplers"].values():
            job.tex(t)
    job.man["graphs"] = list(defs.values())
    job.ext.setdefault("pending", {})["graphs"] = pending


# ---------------------------------------------------------------- 처리기: 충돌(nbmap·apx → 데이터만)

def nbmap_entities(path):
    """nbmap 엔티티 → [(이름 경로, 월드 행렬, 컴포넌트 종류별)] — 트랜스폼은 부모 기준으로 곱한다 [추정: 06_scene_data §3.3 미확정]"""
    doc = scene_nbmap.Nbmap(Path(path).read_bytes()).parse()
    out = []

    def walk(e, pm, prefix):
        if "ref" in e:
            return
        m = pm
        comps = {}
        for c in e["components"]:
            comps.setdefault(c["kind"], []).append(c)
            if c["kind"] == "transform":
                m = pm @ trs(c["pos"], c["quat"], c["scale"])
        name = e["name"] if not prefix else f"{prefix}/{e['name']}"
        out.append((name, m, comps))
        for c in comps.get("children", []):
            for ch in c["children"]:
                walk(ch, m, name if e["name"] != "NoName" else "")
    for r in doc["roots"]:
        walk(r, np.eye(4), "")
    return out


def collision_of(job, nbmaps):
    out = {}
    for p in nbmaps:
        for ename, m, comps in nbmap_entities(p):
            for c in comps.get("collision", []):
                a = scene_apx.Apx((job.arc.root / c["apx"]).read_bytes())
                meshes = {x["index"]: x for x in scene_apx.leading_meshes(a)}
                verts, idx, prims = [], [], []
                for sh in scene_apx.shapes(a):
                    mesh = sh["geometry"] in ("convex", "trimesh")
                    sm = m @ trs(sh["pos"], sh["quat"], sh.get("scale", [1, 1, 1]) if mesh else [1, 1, 1])
                    if mesh and meshes.get(sh.get("mesh"), {}).get("vertices"):
                        mm = meshes[sh["mesh"]]
                        b = len(verts) // 3
                        for v in mm["vertices"]:
                            verts.extend(round(float(x), 5) for x in (sm @ np.array([v[0], v[1], v[2], 1.0]))[:3])
                        for t in mm["triangles"]:
                            idx.extend(b + int(k) for k in t)
                    else:
                        t, q = mat_to_tq(sm)
                        pr = {"geometry": sh["geometry"], "pos": [round(x, 5) for x in t], "quat": [round(x, 6) for x in q]}
                        pr.update({k: sh[k] for k in ("halfExtents", "radius", "halfHeight") if k in sh})
                        if mesh:
                            pr["unread"] = True
                        prims.append(pr)
                out[f"{p.stem}/{ename}"] = {"apx": c["apx"], "attr": c["attr"], "vertices": verts, "indices": idx, "shapes": prims}
    return out


def handle_collision(job):
    names = job.adapter.collision_nbmaps(job)
    paths = [p for p in files_with(job.arc.root, (".nbmap",)) if names is None or p.stem in names]
    col = collision_of(job, paths) if paths else {}
    if col:
        job.w.put("collision.json", jbytes(col))
    job.ext["collision"] = "collision.json" if col else None
    job.ext["collisionModels"] = sorted(n for n in job.man.get("models", {}) if re.search(r"_col(\d+)?$", n))


# ---------------------------------------------------------------- 처리기: UI(lyt)·글(msbt)

def handle_ui(job):
    """아카이브 안 모든 .lyt(SARC: bflyt·bflan·bntx) → ui/ui.json(mgscene_web_assets.convert_layouts 와 같은 처리). 글 = 어댑터 texts + 아카이브 msbt"""
    import font_web_assets as fw
    import mg1801_web_ui as mu
    import mgscene_web_assets as msw
    import msbt
    import ui_lyt
    import ui_render
    import ui_sarc
    texts = dict(job.adapter.texts(job))
    msgs = {}
    for p in files_with(job.arc.root, (".msbt",)):
        msgs[p.relative_to(job.arc.root).as_posix()] = msbt.parse(p.read_bytes())
    ui = {"source": "web/tools/analysis/asset_convert.py (mgscene_web_assets.convert_layouts 와 같은 처리)", "locale": "koKR", "layouts": {}, "anims": {},
          "textures": {}, "fonts": {}, "texts": texts, "externalParts": []}
    texnames = set()
    lt = ui_render.LazyTextures()
    lyts = [p for p in sorted(job.arc.root.rglob("*.lyt")) if p.is_file()]
    for lyt in lyts:
        files = ui_sarc.read_files(str(lyt))
        for data in files.values():
            if data[:4] == b"BNTX":
                lt.add_bntx(data)
        for k in sorted(files):
            if not (k.startswith("blyt/") and k.endswith(".bflyt")):
                continue
            name = k[5:-6]
            raw = files[k]
            lay = ui_lyt.parse_bflyt(raw)
            if lay["_check"]:
                job.report["warnings"].append(f"레이아웃 검사 {name}: {lay['_check']}")
            masks = mu.pane_masks(raw, lay["textures"])
            mu.attach_masks(lay["root"], masks)
            ui["layouts"][name] = mu.clean_layout(lay)
            ui["anims"][name] = {}
            texnames |= set(lay["textures"]) | {m["tex"] for m in masks.values()}
            pre = f"anim/{name}_"
            for a in sorted(files):
                if a.startswith(pre) and a.endswith(".bflan"):
                    an = ui_lyt.parse_bflan(files[a])
                    ui["anims"][name][a[len(pre):-6]] = mu.clean_anim(an)
                    texnames |= set(an.get("textures", []))
            for ref in sorted(msw.part_refs(lay)):
                if f"blyt/{ref}.bflyt" not in files and ref not in ui["externalParts"]:
                    ui["externalParts"].append(ref)
    for tn in sorted(texnames):
        img = lt.get(tn)
        if img is None:
            job.report["notes"].append(f"UI 텍스처 없음 {tn} (런타임 생성으로 보임)")
            continue
        if cs.is_common_tex(tn):
            ui["textures"][tn] = cs.tex(tn, img, None, job.out / "ui")
            continue
        b = io.BytesIO()
        img.save(b, format="PNG", optimize=True)
        ui["textures"][tn] = job.w.rel_from("ui", job.w.put("ui/tex/" + tn.replace("^", "_") + ".png", b.getvalue()))
    plain = re.sub(r"\[/?\d+:\d+(?::[0-9a-f]*)?\]", "", "".join(texts.values())) + "0123456789/.,:-+%"
    for fam in msw.font_families(ui["layouts"]):
        if fam == "bqfont_telop":
            job.report["notes"].append("레이아웃이 텔롭 글꼴(bqfont_telop)을 쓴다 — 공용 틀(mgscene) 텔롭 글꼴 사용")
        elif fam not in fw.families():
            job.report["notes"].append(f"글꼴 없음(시스템 글꼴) {fam}")
        else:
            ui["fonts"][fam] = fw.font_ref(fam, plain, os.path.relpath(ASSETS / "font", job.out / "ui").replace("\\", "/") + "/")
    res = {}
    if ui["layouts"] or texts:
        job.w.put("ui/ui.json", jbytes(ui))
        res["ui"] = {"file": "ui/ui.json", "layouts": len(ui["layouts"]), "textures": len(ui["textures"]), "texts": len(texts), "externalParts": ui["externalParts"]}
    if msgs:
        for rel, d in msgs.items():
            job.w.put(f"msg/{Path(rel).stem}.json", jbytes(d, pretty=True))
        res["msg"] = sorted(f"msg/{Path(r).stem}.json" for r in msgs)
    job.ext["ui"] = res.get("ui")
    job.ext["msg"] = res.get("msg")


# ---------------------------------------------------------------- 처리기: 소리(fsar·fsst·bfstm)

def stream_entry(job, label, src, s, tmp):
    import sound_bfstm
    info = sound_bfstm.info(src)
    wav = tmp / f"{label}.wav"
    sound_bfstm.decode(src, wav)
    f = job.w.rel_from("sound", job.w.put(f"sound/{label}.wav", wav.read_bytes()))
    rate = info["sampleRate"]
    e = {"file": f, "bus": "bgm", "gain": round(s["volume"] / 127, 4), "rate": rate, "frames": info["frames"]}
    if info["loop"]:
        e["loopStart"] = info["loopStart"] / rate
        e["loopEnd"] = info["frames"] / rate
    e["regions"] = {x["name"]: x["start"] / rate for x in info.get("regions", [])}
    e["evidence"] = f"[데이터] BFSTM {src.name}·볼륨 {s['volume']}"
    return e


def handle_sound(job):
    """어댑터 sound_sources() = [(fsar·fsst 경로, 라벨 거르개 | None)] + 추가 스트림 라벨. 시퀀스 = sound_seq.py 렌더 [근사], 스트림 = BFSTM.
    SQ_SE_SYS_* 는 common_shared.sound 로 공용 폴더에. 리듬 BGM 시퀀스(SQ_BGM_*)는 전역 변수·BPM 의존이라 건너뜀(게임 전용 변환기 몫)"""
    from sound_fsar import Fsar
    sources, extra = job.adapter.sound_sources(job)
    if not sources and not extra:
        job.ext["sound"] = None
        return
    snd = {"source": "web/tools/analysis/asset_convert.py — 시퀀스 = sound_seq.py 렌더 [근사], 스트림 = BFSTM 디코드", "se": {}, "bgm": {}, "skipped": []}
    tmp = Path(tempfile.mkdtemp(prefix="asset_convert_snd_"))
    seen = set()
    main = None
    for path, keep in sources:
        fs = Fsar(path)
        for s in sorted((x for x in fs.sounds if x.get("name")), key=lambda x: x["name"]):
            label = s["name"]
            if label in seen or (keep and not keep(label)):
                continue
            seen.add(label)
            if s["type"] == "sequence":
                if label.startswith("SQ_BGM_"):
                    snd["skipped"].append({"label": label, "why": "리듬 BGM 시퀀스(전역 변수·BPM 의존) — 게임 전용 변환기 몫"})
                    continue
                wav = tmp / f"{label}.wav"
                r = subprocess.run([sys.executable, str(TOOLS / "sound_seq.py"), "render", str(path), label, str(wav)], capture_output=True, text=True, encoding="utf-8")
                if r.returncode != 0 or not wav.exists():
                    snd["skipped"].append({"label": label, "why": "렌더 실패: " + ((r.stderr or "").strip().splitlines() or ["?"])[-1][:160]})
                    continue
                f = cs.sound(label, wav, tmp / "unused.wav", job.out / "sound") if cs.sound_file(label) else None
                if f is None:
                    f = job.w.rel_from("sound", job.w.put(f"sound/{label}.wav", wav.read_bytes()))
                snd["se"][label] = {"file": f, "bus": "se", "gain": round(s["volume"] / 127, 4),
                                    "evidence": f"[데이터] {Path(path).name} 볼륨 {s['volume']}, 렌더 근사(sound_seq.py)"}
            elif s["type"] == "stream":
                src = next(iter(sorted(STREAM.glob(f"{label}.*.bfstm"))), None)
                if src is None:
                    snd["skipped"].append({"label": label, "why": "romfs/stream 에 BFSTM 없음"})
                    continue
                snd["bgm"][label] = stream_entry(job, label, src, s, tmp)
            else:
                snd["skipped"].append({"label": label, "why": f"종류 {s['type']}"})
    for label, why in extra:
        if label in snd["bgm"]:
            continue
        main = main or Fsar(cs.FSPJ)
        src = next(iter(sorted(STREAM.glob(f"{label}.*.bfstm"))), None)
        s = main.find(label)
        if src and s:
            snd["bgm"][label] = stream_entry(job, label, src, s, tmp)
            snd["bgm"][label]["evidence"] += f", {why}"
    shutil.rmtree(tmp, ignore_errors=True)
    if not snd["se"] and not snd["bgm"]:
        job.ext["sound"] = None
        return
    job.w.put("sound/sound.json", jbytes(snd, pretty=True))
    job.ext["sound"] = {"file": "sound/sound.json", "se": len(snd["se"]), "bgm": len(snd["bgm"]), "skipped": len(snd["skipped"])}


# ---------------------------------------------------------------- 처리기: 이펙트 원본 데이터(VFXB)·데이터 파일

def handle_fx(job):
    """_Vfx/**/ConvertList.xml → fx/fx.json(effect_vfxb.py dump 값 그대로 — 런타임 없음, 08_effects.md §9) + fx/tex/*.png + primitives.bfres(원본 바이트)"""
    import effect_vfxb
    srcs = files_with(job.arc.root / "_Vfx", (".xml",)) if (job.arc.root / "_Vfx").exists() else []
    if not srcs:
        job.ext["fx"] = None
        return
    files, tex, sets = [], {}, []
    for i, src in enumerate(srcs):
        d = job.cache / "fx" / str(i)
        if not (d / "vfxb.json").exists():
            effect_vfxb.cmd_dump(str(src), str(d), png=True)
        doc = load_json(d / "vfxb.json")
        doc["source"] = src.relative_to(ROOT).as_posix()
        for p in sorted((d / "tex").glob("*.png")) if (d / "tex").exists() else []:
            tex[p.stem] = job.w.rel_from("fx", job.w.put(f"fx/tex/{p.name}", p.read_bytes()))
        prim = None
        if (d / "primitives.bfres").exists():
            prim = job.w.rel_from("fx", job.w.put(f"fx/primitives{'' if i == 0 else i}.bfres", (d / "primitives.bfres").read_bytes(), share=False))
        files.append({"source": doc["source"], "primitives": prim, "vfxb": doc})
        sets += [e["name"] for e in doc["emitterSets"]]
    job.w.put("fx/fx.json", jbytes({"tool": "tools/analysis/effect_vfxb.py dump", "textures": tex, "files": files}))
    job.ext["fx"] = {"file": "fx/fx.json", "emitterSets": sets, "textures": len(tex)}


def handle_data(job):
    """게임·화면 데이터(json·csv·msgpack) → data/<아카이브 안 경로> 원본 바이트 그대로(읽는 코드가 원본 형식을 그대로 판독)"""
    out = []
    for p in files_with(job.arc.root, (".json", ".csv", ".msgpack")):
        rel = p.relative_to(job.arc.root).as_posix()
        if rel.startswith("_Vfx/"):
            continue
        job.w.put(f"data/{rel}", p.read_bytes(), share=False)
        out.append(f"data/{rel}")
    job.ext["data"] = out


class Handler:
    def __init__(self, name, part, run):
        self.name, self.part, self.run = name, part, run


# 형식별 처리기(꽂는 순서 = 실행 순서. gfx 가 모델·텍스처 색인을 만들고 env·graph·collision 이 그것을 쓴다)
HANDLERS = [Handler("gfx", "gfx", handle_gfx), Handler("env", "gfx", handle_env), Handler("graph", "gfx", handle_graph),
            Handler("collision", "gfx", handle_collision), Handler("ui", "ui", handle_ui), Handler("sound", "sound", handle_sound),
            Handler("fx", "fx", handle_fx), Handler("data", "data", handle_data)]


# ---------------------------------------------------------------- 어댑터(분류별 장면 의미)

class Adapter:
    """generic — 장면 의미 없음(모델·환경·카메라·UI·소리·이펙트·데이터를 원본 그대로 색인). 분류 어댑터는 이것을 상속해 필요한 것만 덮는다"""
    name = "generic"

    def out_rel(self, arc):
        return arc.out_rel

    def env_pick(self, job):
        return {}

    def collision_nbmaps(self, job):
        return None

    def texts(self, job):
        return {}

    def sound_sources(self, job):
        """[(fsar|fsst 경로, 라벨 거르개)], [(추가 스트림 라벨, 근거)]"""
        return [(p, None) for p in files_with(job.arc.root, (".fsst", ".fspj"))], []

    def extend(self, job):
        """처리기 뒤 장면 의미를 job.ext 에 더한다(배치·기본 애니·카메라 묶음·단계 로딩)"""


ADAPTERS = {"generic": Adapter}


def run(spec, adapter=None, out_root=None, only=None, force=False, models_filter=None):
    arc = Archive(spec)
    if arc.category in RESERVED and out_root is None:
        raise SystemExit(f"{arc.file}: 공용 폴더 담당 변환기 몫 — {RESERVED[arc.category]} (13_asset_converter.md §6). 비교만 하려면 --out")
    ad = adapter or ADAPTERS.get(arc.category, Adapter)()
    job = Job(arc, ad, out_root or ASSETS, only, force, models_filter)
    prev = job.old.get("asset") or {}
    gfx_keys = ("cameras", "sockets", "envChosen", "envVariants", "pending", "collision", "collisionModels")
    for h in HANDLERS:
        if job.want(h.part) and (h.part == "gfx" or not models_filter):
            h.run(job)
    if not job.want("gfx"):
        for k in ("models", "textures", "anims", "env", "graphs"):
            job.man[k] = job.old.get(k)
        for k in gfx_keys:
            job.ext[k] = prev.get(k)
    else:
        job.man["textures"] = job.tex.textures
        job.ad_ext = ad.extend(job)
    for part, keys in (("ui", ("ui", "msg")), ("sound", ("sound",)), ("fx", ("fx",)), ("data", ("data",))):
        if not job.want(part) or models_filter:
            for k in keys:
                job.ext.setdefault(k, prev.get(k))
    job.ext["shared"] = sorted({s[1] for s in job.report["shared"]} | (set(prev.get("shared") or []) if job.only else set()))
    man = {k: job.man[k] for k in ("set", "source", "generator", "adapter", "version", "models", "textures", "anims", "env", "graphs") if k in job.man}
    man["asset"] = job.ext
    if job.want("gfx") and getattr(job, "ad_ext", None):
        man[ad.name] = job.ad_ext
    elif ad.name in job.old:
        man[ad.name] = job.old[ad.name]
    job.w.put("manifest.json", jbytes(man, pretty=True))
    prefixes = tuple(p for p, part in (("model/", "gfx"), ("tex/", "gfx"), ("anim/", "gfx"), ("cam/", "gfx"), ("ui/", "ui"), ("msg/", "ui"), ("sound/", "sound"),
                                        ("fx/", "fx"), ("data/", "data")) if job.want(part))
    for r in job.w.stale(prefixes):
        job.report["warnings"].append(f"이번에 만들지 않은 옛 파일(지우지 않음): {r}")
    files = [p for p in job.out.rglob("*") if p.is_file()]
    job.report["files"] = len(files)
    job.report["bytes"] = sum(p.stat().st_size for p in files)
    job.report["out"] = job.out
    if out_root is None:
        register(ad.out_rel(arc), arc, ad)
    return job.report


def register(rel, arc, ad):
    """assets/converted.json — 공용 변환기 출력 루트와 폴더 역할(압축 빌드 분류의 근거, tools/assets_tex.ts)"""
    cur = load_json(REGISTRY) if REGISTRY.exists() else {}
    roots = cur.get("roots", {})
    roots[rel] = {"archive": arc.file, "adapter": ad.name}
    REGISTRY.write_bytes(jbytes({"generator": "tools/analysis/asset_convert.py", "roles": ROLES, "roots": dict(sorted(roots.items()))}, pretty=True))


def print_report(r):
    print(f"  {r['out']}: 파일 {r['files']}, {r['bytes'] / 1e6:.1f} MB, 새로 씀 {r['new']}, 같음 {r['same']}, 공용 참조 {len(r['shared'])}, 중간 변환 {r.get('gfxCache')}")
    for n in r["notes"]:
        print("  참고:", n)
    for x in r["warnings"]:
        print("  경고:", x)


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("archives", nargs="+")
    ap.add_argument("--adapter")
    ap.add_argument("--out")
    ap.add_argument("--only")
    ap.add_argument("--models")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)
    if a.adapter == "mg" or (a.adapter is None and any(Archive(x).category == "mg" for x in a.archives)):
        import mg_assets
        ADAPTERS["mg"] = mg_assets.MgAdapter
    only = set(a.only.split(",")) if a.only else None
    for x in a.archives:
        print(f"== {x}")
        ad = ADAPTERS[a.adapter]() if a.adapter else None
        print_report(run(x, ad, Path(a.out) if a.out else None, only, a.force, set(a.models.split(",")) if a.models else None))
    if cs.changed:
        print("공용 파일 내용이 바뀐 것:", cs.changed)


if __name__ == "__main__":
    main()
