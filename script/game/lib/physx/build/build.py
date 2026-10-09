"""PhysX 4.1.2 공개 소스 → physx.wasm(이 폴더의 ../physx.wasm). CMake 없이 em++ 로 모듈 폴더를 직접 컴파일한다.
경로는 모두 이 폴더 기준 상대다. 평소 개발·배포(npm run build)는 커밋된 physx.wasm 만 쓰고 이 스크립트·emsdk 가 필요 없다.
설계·ABI·포함 범위·크기·결정성: web/docs/engine/11_moving_collision.md §9(웹 런타임 계약).

  python build.py                         ../native 소스로 기본 구성(full) → ../physx.wasm
  python build.py --sizes                 네 구성(query·scene·cct·full)을 모두 링크해 raw·gz·br 크기를 적는다(../physx.wasm 은 full)
  python build.py --vendor <PhysX-4.1>    sparse checkout(NVIDIAGameWorks/PhysX 4.1, a2c0428)에서 컴파일하며 실제로 쓴 .cpp·헤더만
                                          ../native/PhysX-4.1/ 로 복사하고 ../native/SOURCES.txt(경로·sha1)를 다시 쓴 뒤 ../native 로 다시 빌드
  --emsdk <폴더>   기본 = 환경변수 EMSDK, 없으면 이 폴더에서 위로 올라가 만나는 tools/emsdk(mpj: C:/dev/mpj/tools/emsdk)
  --obj <폴더>     오브젝트 캐시(기본 = emsdk 옆 physx_wasm_obj, web/ 밖) · --clean 캐시 비우기 · --jobs N

도구 고정: emsdk 6.0.12(emscripten 5488e087, LLVM clang 24.0.0git 55ea1f4e). 다른 판으로 빌드하면 산출물 바이트가 달라질 수 있다.
결정성: 스레드 없음(-pthread 없음, CPU 디스패처 0 스레드) · PX_SIMD_DISABLED(스칼라 경로) · -fno-fast-math -ffp-contract=off · 빌드 시각·경로를 산출물에 넣지 않는다.
"""
import argparse
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIB = HERE.parent
NATIVE = LIB / "native"
SHIM = NATIVE / "shim" / "px_shim.cpp"
OUT = LIB / "physx.wasm"

GU_SUB = ["", "contact", "common", "convex", "distance", "sweep", "gjk", "intersection", "mesh", "hf", "pcm", "ccd"]
INC_REL = (
    ["physx/include", "pxshared/include", "physx/source/foundation/include", "physx/source/common/include", "physx/source/common/src",
     "physx/source/geomutils/include"]
    + [f"physx/source/geomutils/src/{s}".rstrip("/") for s in GU_SUB]
    + ["physx/source/physx/src", "physx/source/physx/src/buffering", "physx/source/physx/src/device", "physx/source/physxgpu/include",
       "physx/source/lowlevel/api/include", "physx/source/lowlevel/software/include", "physx/source/lowlevel/common/include",
       "physx/source/lowlevel/common/include/collision", "physx/source/lowlevel/common/include/pipeline", "physx/source/lowlevel/common/include/utils",
       "physx/source/lowlevelaabb/include", "physx/source/lowlevelaabb/src", "physx/source/lowleveldynamics/include", "physx/source/lowleveldynamics/src",
       "physx/source/simulationcontroller/include", "physx/source/simulationcontroller/src", "physx/source/scenequery/include",
       "physx/source/scenequery/src", "physx/source/physxmetadata/core/include", "physx/source/immediatemode/include", "physx/source/pvd/include",
       "physx/source/physxextensions/src", "physx/source/physxcharacterkinematic/src"]
)
DEFINES = ["NDEBUG", "PX_SUPPORT_PVD=0", "PX_SIMD_DISABLED", "PX_PHYSX_STATIC_LIB", "PX_FOUNDATION_DLL=0", "DISABLE_CUDA_PHYSX", "PX_NVTX=0",
           "PX_SUPPORT_GPU_PHYSX=0"]
CXXFLAGS = ["-std=c++11", "-O3", "-fno-rtti", "-fno-exceptions", "-fno-fast-math", "-ffp-contract=off", "-fstrict-aliasing", "-Wno-everything"]

# 모듈 = (PhysX-4.1 기준 폴더, 뺄 경로 조각)
MODULES = {
    "foundation": ("physx/source/foundation/src", ["windows"]),
    "common": ("physx/source/common/src", ["windows"]),
    "geomutils": ("physx/source/geomutils/src", []),
    "physx": ("physx/source/physx/src", ["windows", "device", "gpu"]),
    "scenequery": ("physx/source/scenequery/src", []),
    "simulationcontroller": ("physx/source/simulationcontroller/src", []),
    "lowlevel": ("physx/source/lowlevel", []),
    "lowlevelaabb": ("physx/source/lowlevelaabb/src", []),
    "lowleveldynamics": ("physx/source/lowleveldynamics/src", []),
    "task": ("physx/source/task/src", []),
    "cct": ("physx/source/physxcharacterkinematic/src", []),
    "extensions": ("physx/source/physxextensions/src", ["serialization", "ExtPvd", "ExtDefaultCpuDispatcher", "ExtCpuWorkerThread",
                                                        "ExtDefaultStreams", "ExtExtensions", "ExtMetaData"]),
}
BASE = ["foundation", "common", "geomutils"]
SCENE = BASE + ["physx", "scenequery", "simulationcontroller", "lowlevel", "lowlevelaabb", "lowleveldynamics", "task"]
# 구성 = 모듈 묶음 + shim 기능(PXW_*)
CONFIGS = {
    "query": (BASE, []),
    "scene": (SCENE, ["PXW_SCENE=1"]),
    "cct": (SCENE + ["cct", "extensions"], ["PXW_SCENE=1", "PXW_CCT=1"]),
    "full": (SCENE + ["cct", "extensions"], ["PXW_SCENE=1", "PXW_CCT=1", "PXW_EXT=1"]),
}
LINK = ["-O3", "-sSTANDALONE_WASM=1", "--no-entry", "-sALLOW_MEMORY_GROWTH=1", "-sINITIAL_MEMORY=16777216", "-sSTACK_SIZE=1048576",
        "-sFILESYSTEM=0", "-sERROR_ON_UNDEFINED_SYMBOLS=1", "-sMALLOC=dlmalloc", "-fno-rtti", "-fno-exceptions"]


def find_emsdk(arg):
    if arg:
        return Path(arg)
    if os.environ.get("EMSDK"):
        return Path(os.environ["EMSDK"])
    for p in HERE.parents:
        if (p / "tools" / "emsdk").is_dir():
            return p / "tools" / "emsdk"
    raise SystemExit("emsdk 를 찾지 못했다(--emsdk 또는 EMSDK)")


class Ctx:
    def __init__(self, src_root, emsdk, obj):
        self.src = src_root
        self.emsdk = emsdk
        self.obj = obj
        self.emxx = emsdk / "upstream" / "emscripten" / ("em++.exe" if os.name == "nt" else "em++")
        self.inc = [src_root / r for r in INC_REL]
        e = dict(os.environ)
        e["EM_CONFIG"] = str(emsdk / ".emscripten")
        e["EMSDK"] = str(emsdk)
        self.env = e

    def sources(self, mod):
        rel, skip = MODULES[mod]
        root = self.src / rel
        return [p for p in sorted(root.rglob("*.cpp")) if not any(s in p.relative_to(root).as_posix() for s in skip)]

    def key(self, extra):
        return hashlib.sha1(json.dumps([CXXFLAGS, DEFINES, extra, INC_REL, str(self.src)]).encode()).hexdigest()[:10]

    def compile_one(self, src, obj, extra, dep):
        if obj.exists() and dep.exists() and obj.stat().st_mtime > src.stat().st_mtime:
            return None
        obj.parent.mkdir(parents=True, exist_ok=True)
        cmd = ([str(self.emxx), "-c", str(src), "-o", str(obj), "-MD", "-MF", str(dep)] + CXXFLAGS + [f"-D{d}" for d in DEFINES + extra]
               + [f"-I{i}" for i in self.inc] + [f"-I{SHIM.parent}"])
        r = subprocess.run(cmd, env=self.env, capture_output=True, text=True)
        return None if r.returncode == 0 else f"{src}\n{r.stderr[-4000:]}"

    def objects(self, mods, extra, jobs):
        k = self.key([])
        todo = []
        for m in mods:
            for s in self.sources(m):
                rel = s.relative_to(self.src)
                todo.append((s, self.obj / k / rel.with_suffix(".o"), self.obj / k / rel.with_suffix(".d")))
        with ThreadPoolExecutor(jobs) as ex:
            errs = [e for e in ex.map(lambda a: self.compile_one(a[0], a[1], [], a[2]), todo) if e]
        if errs:
            for e in errs[:8]:
                print(e)
            raise SystemExit(f"컴파일 실패 {len(errs)}개")
        sk = self.key(extra)
        so, sd = self.obj / f"shim_{sk}.o", self.obj / f"shim_{sk}.d"
        so.unlink(missing_ok=True)
        err = self.compile_one(SHIM, so, extra, sd)
        if err:
            print(err)
            raise SystemExit("shim 컴파일 실패")
        return [o for _, o, _ in todo] + [so], [d for _, _, d in todo] + [sd]

    def link(self, objs, out, extra):
        names = exports(extra)
        rsp = self.obj / "link.rsp"
        rsp.write_text("\n".join(f'"{o.as_posix()}"' for o in objs), encoding="utf-8")
        cmd = [str(self.emxx), f"@{rsp}", "-o", str(out)] + LINK + ["-sEXPORTED_FUNCTIONS=" + ",".join("_" + n for n in names)]
        r = subprocess.run(cmd, env=self.env, capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr[-8000:])
            raise SystemExit("링크 실패")
        return names


def exports(extra):
    """px_shim.cpp 의 PXW_API 함수 이름 — #if PXW_X 블록은 그 기능이 켜진 구성에서만"""
    on = {d.split("=")[0] for d in extra}
    stack, names = [], []
    for line in SHIM.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s.startswith("#if "):
            stack.append(s[4:].strip())
        elif s.startswith("#endif"):
            stack.pop()
        elif s.startswith("#else"):
            stack[-1] = "!" + stack[-1]
        elif s.startswith("PXW_API ") and all((c[1:] not in on) if c.startswith("!") else (c in on) for c in stack if c.startswith(("PXW_", "!PXW_"))):
            names.append(s.split("(")[0].split()[-1])
    return names


def sizes(p):
    b = p.read_bytes()
    node = shutil.which("node")
    br = None
    if node:
        r = subprocess.run([node, "-e", "const z=require('zlib');const b=require('fs').readFileSync(process.argv[1]);"
                            "process.stdout.write(String(z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}).length))", str(p)],
                           capture_output=True, text=True)
        br = int(r.stdout) if r.returncode == 0 else None
    return {"raw": len(b), "gz": len(gzip.compress(b, 9, mtime=0)), "br": br, "sha256": hashlib.sha256(b).hexdigest()}


def vendor(ctx, deps):
    """의존 파일(.d) 에 나온 PhysX 파일만 ../native/PhysX-4.1 로 복사 + LICENSE.md + SOURCES.txt"""
    used = set()
    for d in deps:
        text = d.read_text(encoding="utf-8", errors="replace").replace("\\\n", " ")
        for tok in text.split(":", 1)[1].split() if ":" in text else []:
            tok = tok.replace("\\ ", " ")
            p = Path(tok)
            try:
                rel = p.resolve().relative_to(ctx.src.resolve())
            except ValueError:
                continue
            used.add(rel.as_posix())
    dst = NATIVE / "PhysX-4.1"
    if dst.exists():
        shutil.rmtree(dst)
    lines = []
    for rel in sorted(used):
        s = ctx.src / rel
        t = dst / rel
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(s, t)
        lines.append(f"{hashlib.sha1(s.read_bytes()).hexdigest()}  {rel}")
    shutil.copyfile(ctx.src / "LICENSE.md", dst / "LICENSE.md")
    head = ["# NVIDIAGameWorks/PhysX branch 4.1, commit a2c0428 (BSD-3-Clause, LICENSE.md). Files compiled into physx.wasm (sha1  path).", ""]
    (NATIVE / "SOURCES.txt").write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    total = sum((dst / r).stat().st_size for r in used)
    print(f"vendor: {len(used)}개 {total / 1e6:.2f} MB -> {dst}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="full", choices=list(CONFIGS))
    ap.add_argument("--sizes", action="store_true")
    ap.add_argument("--vendor")
    ap.add_argument("--emsdk")
    ap.add_argument("--obj")
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--jobs", type=int, default=max(2, (os.cpu_count() or 4) - 2))
    a = ap.parse_args()
    emsdk = find_emsdk(a.emsdk)
    obj = Path(a.obj) if a.obj else emsdk.parent / "physx_wasm_obj"
    if a.clean and obj.exists():
        shutil.rmtree(obj)
    obj.mkdir(parents=True, exist_ok=True)
    if a.vendor:
        vctx = Ctx(Path(a.vendor), emsdk, obj / "vendor")
        mods, extra = CONFIGS["full"]
        _, deps = vctx.objects(mods, extra, a.jobs)
        vendor(vctx, deps)
    ctx = Ctx(NATIVE / "PhysX-4.1", emsdk, obj)
    if not ctx.emxx.exists():
        raise SystemExit(f"em++ 없음: {ctx.emxx}")
    report = {}
    for cfg in (list(CONFIGS) if a.sizes else [a.config]):
        mods, extra = CONFIGS[cfg]
        objs, _ = ctx.objects(mods, extra, a.jobs)
        out = obj / f"physx_{cfg}.wasm"
        names = ctx.link(objs, out, extra)
        report[cfg] = {"modules": mods, "exports": len(names), **sizes(out)}
        print(cfg, json.dumps(report[cfg]))
        if cfg == "full" or not a.sizes:
            shutil.copyfile(out, OUT)
    (obj / "sizes.json").write_text(json.dumps(report, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
