"""Ghidra 프로젝트 ↔ web/ghidra/db 스냅샷 도구 (헤드리스, MCP 서버가 꺼져 있을 때).

  python snapshot.py export   [--all | --programs a,b]   프로젝트 → db (전체 다시 쓰기)
  python snapshot.py apply    [--all | --programs ...]   db → 프로젝트 (복원·동기화)
  python snapshot.py baseline [--all | ...] [--force]    분석 직후 기준본 .gzf
  python snapshot.py backup   [--all | ...]              완전 백업 .gzf (<backup>/<날짜>)
  python snapshot.py link                                외부 라이브러리 → link_target 프로그램
  python snapshot.py tags                                tags.json → 모든 프로그램 태그 등록
  python snapshot.py sync-types [--dry]                  소유 프로그램의 클래스 정의 → 같은 클래스를 쓰는 다른 프로그램(db 텍스트, sync_types.py)
  python snapshot.py roundtrip --programs a,b            기준본 + db 적용 → 다시 내보내기 → db와 diff

경로·모듈↔프로그램 대응은 web/ghidra/config.json (programs: 모듈 이름 → 프로젝트 안 경로, "*" 는 기본 규칙).
MCP 서버가 같은 프로젝트를 열고 있으면 실행할 수 없다(프로젝트 잠금).
"""
import argparse
import datetime
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

TOOLS = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(os.path.dirname(TOOLS), "config.json")


def load_config(path=None):
    path = path or os.environ.get("GHIDRA_TOOLS_CONFIG") or CONFIG_PATH
    with open(path, encoding="utf-8") as fh:
        c = json.load(fh)
    base = os.path.dirname(os.path.abspath(path))
    for k in ("ghidra", "project", "db", "tags", "baseline", "backup", "mcp_jar"):
        if k in c:
            c[k] = os.path.normpath(os.path.join(base, c[k]))
    return c


CFG = load_config()
GHIDRA = CFG["ghidra"]
HEADLESS = os.path.join(GHIDRA, "support", "analyzeHeadless.bat")
JDK = CFG["jdk"]
PROJECT = CFG["project"]
DB = CFG["db"]
TAGS = CFG["tags"]
BASELINE = CFG["baseline"]
BACKUP = CFG["backup"]
SCRIPT_LINE = re.compile(r"\w+\.java> (.*?) \(GhidraScript\)\s*$")


def program_path(module, cfg=CFG):
    progs = cfg.get("programs", {})
    path = progs.get(module) or progs.get("*", "/{module}").format(module=module)
    return path


def program_of(module):
    folder, prog = program_path(module).strip("/").rpartition("/")[::2]
    return folder, prog


def headless(project, target, script, args, readonly, log_name, imports=None):
    """target: None(전체) 또는 모듈 이름. imports: [(폴더, 파일)] 이면 -import."""
    loc, name = os.path.dirname(project), os.path.splitext(os.path.basename(project))[0]
    cmd = [HEADLESS, loc]
    if imports is not None:
        folder, files = imports
        cmd += [f"{name}/{folder}" if folder else name, "-import"] + files
    elif target is None:
        cmd += [name, "-process", "-recursive"]
    else:
        folder, prog = program_of(target)
        cmd += [f"{name}/{folder}" if folder else name, "-process", prog]
    cmd += ["-noanalysis", "-scriptPath", TOOLS]
    if readonly:
        cmd.append("-readOnly")
    if script:
        cmd += ["-postScript", script] + args
    env = dict(os.environ, JAVA_HOME=JDK)
    logdir = os.path.join(loc, "logs")
    os.makedirs(logdir, exist_ok=True)
    logpath = os.path.join(logdir, log_name + ".log")
    with open(logpath, "w", encoding="utf-8", errors="replace") as lf:
        p = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT, env=env)
    out = []
    locked = False
    with open(logpath, encoding="utf-8", errors="replace") as lf:
        for line in lf:
            m = SCRIPT_LINE.search(line)
            if m:
                out.append(m.group(1))
            if "LockException" in line or "Unable to lock project" in line:
                locked = True
    for o in out:
        print("  " + o)
    if locked:
        print(f"프로젝트가 잠겨 있습니다(MCP 서버나 Ghidra GUI가 열고 있음): {project}")
        return False
    if p.returncode != 0:
        print(f"실패(코드 {p.returncode}) — 로그: {logpath}")
        return False
    return True


def targets(a):
    if a.all or not a.programs:
        return [None]
    return [m.strip() for m in a.programs.split(",") if m.strip()]


def cmd_export(a):
    ok = True
    for t in targets(a):
        ok &= headless(PROJECT, t, "ExportSnapshot.java", [DB], True, f"export_{t or 'all'}")
    return ok


def cmd_apply(a):
    ok = True
    for t in targets(a):
        ok &= headless(PROJECT, t, "ApplySnapshot.java", [DB, TAGS], False, f"apply_{t or 'all'}")
    return ok


def cmd_gzf(a, root):
    ok = True
    for t in targets(a):
        ok &= headless(PROJECT, t, "ExportGzf.java", [root], True, f"gzf_{t or 'all'}")
    return ok


def cmd_baseline(a):
    if os.path.isdir(BASELINE) and os.listdir(BASELINE) and not a.force:
        print(f"기준본이 이미 있습니다: {BASELINE} (다시 만들려면 --force)")
        return False
    return cmd_gzf(a, BASELINE)


def cmd_backup(a):
    root = os.path.join(BACKUP, datetime.datetime.now().strftime("%Y%m%d-%H%M"))
    print(f"백업 위치: {root}")
    return cmd_gzf(a, root)


def cmd_link(a):
    return headless(PROJECT, None, "LinkExternal.java", [CFG["link_target"]], False, "link")


def cmd_tags(a):
    return headless(PROJECT, None, "RegisterTags.java", [TAGS], False, "tags")


def cmd_sync_types(a):
    args = [sys.executable, os.path.join(TOOLS, "sync_types.py")] + (["--dry"] if a.dry else [])
    return subprocess.run(args).returncode == 0


def cmd_roundtrip(a):
    mods = targets(a)
    if mods == [None]:
        print("roundtrip 은 --programs 로 모듈을 지정하세요(예: main,mg0108)")
        return False
    tmp = tempfile.mkdtemp(prefix="ghidra_roundtrip_")
    proj = os.path.join(tmp, "rt.gpr")
    tmpdb = os.path.join(tmp, "db")
    print(f"임시 프로젝트: {tmp}")
    try:
        for m in mods:
            folder, prog = program_of(m)
            gzf = os.path.join(BASELINE, folder, prog + ".gzf")
            if not os.path.isfile(gzf):
                print(f"기준본 없음: {gzf} (먼저 baseline)")
                return False
            if not headless(proj, None, None, [], False, f"rt_import_{m}", imports=(folder, [gzf])):
                return False
            if not headless(proj, m, "ApplySnapshot.java", [DB, TAGS], False, f"rt_apply_{m}"):
                return False
            if not headless(proj, m, "ExportSnapshot.java", [tmpdb], True, f"rt_export_{m}"):
                return False
        same = True
        for m in mods:
            folder, prog = program_of(m)
            da, dbb = os.path.join(DB, folder, prog), os.path.join(tmpdb, folder, prog)
            names = set()
            for root in (da, dbb):
                for r, _, fs in os.walk(root):
                    for f in fs:
                        rel = os.path.relpath(os.path.join(r, f), root).replace(os.sep, "/")
                        if rel != "meta.json":
                            names.add(rel)
            for rel in sorted(names):
                pa, pb = os.path.join(da, rel), os.path.join(dbb, rel)
                la = open(pa, encoding="utf-8").read().splitlines() if os.path.exists(pa) else []
                lb = open(pb, encoding="utf-8").read().splitlines() if os.path.exists(pb) else []
                if la != lb:
                    same = False
                    diff = list(difflib.unified_diff(la, lb, f"db/{m}/{rel}", f"복원/{m}/{rel}", lineterm="", n=0))
                    print(f"[다름] {m}/{rel}: {sum(1 for d in diff if d[:1] in '+-' and d[:3] not in ('---', '+++'))}줄")
                    for d in diff[:20]:
                        print("    " + d)
            print(f"[{m}] 파일 {len(names)}개 비교")
        print("왕복 시험 " + ("통과" if same else "실패"))
        return same
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["export", "apply", "baseline", "backup", "link", "tags", "sync-types", "roundtrip"])
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--programs", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--project", help="기본 config.json 의 project")
    ap.add_argument("--db", help="기본 config.json 의 db")
    ap.add_argument("--baseline", help="기본 config.json 의 baseline")
    a = ap.parse_args()
    global PROJECT, DB, BASELINE
    PROJECT = os.path.abspath(a.project) if a.project else PROJECT
    DB = os.path.abspath(a.db) if a.db else DB
    BASELINE = os.path.abspath(a.baseline) if a.baseline else BASELINE
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    fn = {"export": cmd_export, "apply": cmd_apply, "baseline": cmd_baseline, "backup": cmd_backup,
          "link": cmd_link, "tags": cmd_tags, "sync-types": cmd_sync_types, "roundtrip": cmd_roundtrip}[a.command]
    sys.exit(0 if fn(a) else 1)


if __name__ == "__main__":
    main()
