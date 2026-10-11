"""ghidra-mcp 헤드리스 서버 실행기.

  python ghidra_mcp_server.py [--project <.gpr>] [--port 8089] [--autosave 10] [--xmx 8g]

키:
  s  저장 (+ 바뀐 프로그램 db 내보내기)
  e  열린 프로그램 모두 db 내보내기
  i  상태(열린 프로그램·메모리)
  q  저장·내보내기 후 종료  (Ctrl+C 도 같음)
  h  도움말

- 저장할 때마다(s·자동·종료) 바뀐 프로그램만 서버 안에서 ExportSnapshot.java 로 web/ghidra/db 를 갱신한다.
  db가 어긋나면 서버를 끄고 snapshot.py export --all 로 전체를 다시 쓴다.

- 서버(java)는 콘솔과 분리해 띄운다. 실행기 창을 닫아도 서버가 저장 없이 죽지 않는다.
- 창 닫기(X)·로그오프 때는 저장 후 종료를 시도한다(Windows가 주는 몇 초 안에서).
- --autosave 분마다 자동 저장한다(0 이면 끔).
- 같은 포트에 서버가 이미 떠 있으면 새로 띄우지 않고 그 서버에 붙는다.
- 서버 로그: <프로젝트 폴더>/ghidra_mcp_server.log
"""
import argparse
import ctypes
import glob
import json
import msvcrt
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
from snapshot import load_config  # noqa: E402

CFG = load_config()
GHIDRA = CFG["ghidra"]
PLUGIN_JAR = CFG["mcp_jar"]
PLUGIN = os.path.dirname(PLUGIN_JAR)
JAVA = os.path.join(CFG["jdk"], "bin", "java.exe")
DEFAULT_PROJECT = CFG["project"]
EXPORT_SCRIPT = os.path.join(TOOLS, "ExportSnapshot.java")
DEFAULT_DB = CFG["db"]

lock = threading.Lock()
state = {"base": "", "proc": None, "stopping": False, "db": DEFAULT_DB, "exported": {}, "probe": {}}


def log(msg):
    line = time.strftime("[%H:%M:%S] ") + msg
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        print(line.encode(enc, "replace").decode(enc), flush=True)


def http(method, path, timeout=600, body=None):
    data = json.dumps(body or {}).encode("utf-8") if method == "POST" else None
    req = urllib.request.Request(state["base"] + path, data=data,
                                 headers={"Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace") or "{}")


def alive():
    try:
        return http("GET", "/check_connection", timeout=2).get("status") == "ok"
    except Exception:
        return False


def find_key(o, key):
    if isinstance(o, dict):
        if key in o:
            return o[key]
        for v in o.values():
            r = find_key(v, key)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find_key(v, key)
            if r is not None:
                return r
    return None


def revision(name):
    q = urllib.parse.quote(name)
    try:
        if name not in state["probe"]:
            fs = http("GET", f"/find_functions?limit=1&program={q}", timeout=30).get("functions", [])
            state["probe"][name] = fs[0]["address"] if fs else None
        addr = state["probe"][name]
        if addr is None:
            return None
        r = http("GET", f"/get_functions?function=0x{addr}&fields=signature&program={q}", timeout=30)
        return find_key(r, "modification_number")
    except Exception:
        return None


def export(force=False):
    try:
        progs = [p["name"] for p in http("GET", "/list_open_programs", timeout=30).get("programs", [])]
    except Exception as e:
        log(f"내보내기 실패(프로그램 목록): {e}")
        return
    for name in progs:
        rev = revision(name)
        if not force and rev is not None and state["exported"].get(name) == rev:
            continue
        t = time.time()
        try:
            r = http("POST", "/run_ghidra_script", timeout=1900, body={
                "script_name": EXPORT_SCRIPT, "args": state["db"], "program": name,
                "timeout_seconds": 1800, "capture_output": True})
        except Exception as e:
            log(f"내보내기 실패 {name}: {e}")
            continue
        if r.get("success") is False or r.get("error"):
            log(f"내보내기 실패 {name}: {r.get('error') or r.get('console_output', '')[-500:]}")
            continue
        state["exported"][name] = rev
        line = next((l for l in str(r.get("console_output", "")).splitlines() if ": 함수 " in l), name)
        log(f"db 갱신 ({time.time() - t:.1f}s) {line.split('> ')[-1]}")


def save(reason):
    with lock:
        try:
            r = http("GET", "/save_all_programs")
            n = r.get("saved_count", len(r.get("saved", []) or []))
            log(f"저장 완료 ({reason}) — {n}개 프로그램")
        except Exception as e:
            log(f"저장 실패 ({reason}): {e}")
            return False
        export()
        return True


def info():
    try:
        h = http("GET", "/mcp/health", timeout=10)
        p = http("GET", "/list_open_programs", timeout=10)
        names = ", ".join(x["name"] for x in p.get("programs", [])) or "(없음)"
        log(f"서버 {h.get('version')} · 가동 {int(h.get('uptime_seconds', 0))}초 · 메모리 {h.get('memory_mb')} · 열린 프로그램: {names}")
    except Exception as e:
        log(f"상태 조회 실패: {e}")


def stop(reason):
    if state["stopping"]:
        return
    state["stopping"] = True
    log(f"종료 ({reason}): 저장·내보내기 후 서버를 닫습니다…")
    try:
        with lock:
            export()
            r = http("POST", "/exit_ghidra")
        log("서버 응답: " + r.get("message", "?"))
    except Exception as e:
        log(f"exit_ghidra 실패: {e} — 저장만 다시 시도합니다")
        save("종료 직전")
    for _ in range(60):
        if not alive():
            log("서버가 닫혔습니다.")
            return
        time.sleep(1)
    proc = state["proc"]
    if proc is not None and proc.poll() is None:
        log("60초 안에 닫히지 않아 강제 종료합니다(저장은 위에서 끝남).")
        proc.kill()


def classpath():
    jars = [PLUGIN_JAR]
    for sub in ("Framework", "Features", "Processors"):
        jars += sorted(glob.glob(os.path.join(GHIDRA, "Ghidra", sub, "*", "lib", "*.jar")))
    jars += sorted(glob.glob(os.path.join(PLUGIN, "lib", "*.jar")))
    return ";".join(jars)


def start(project, port, xmx):
    logpath = os.path.join(os.path.dirname(project), "ghidra_mcp_server.log")
    cmd = [JAVA, f"-Xmx{xmx}", "-XX:+UseG1GC", f"-Dghidra.install.dir={GHIDRA}", "-cp", classpath(),
           "com.xebyte.headless.GhidraMCPHeadlessServer", "--bind", "127.0.0.1", "--port", str(port),
           "--project", project]
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    env = dict(os.environ, GHIDRA_MCP_ALLOW_SCRIPTS="1")
    out = open(logpath, "a", encoding="utf-8")
    out.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} start\n")
    out.flush()
    state["proc"] = subprocess.Popen(cmd, stdout=out, stderr=subprocess.STDOUT, creationflags=flags, env=env)
    log(f"서버 시작: {project} (로그 {logpath})")
    for _ in range(300):
        if alive():
            log(f"서버 준비됨: {state['base']}")
            return True
        if state["proc"].poll() is not None:
            log("서버가 시작 중에 끝났습니다. 로그를 확인하세요.")
            return False
        time.sleep(1)
    log("5분 안에 준비되지 않았습니다. 로그를 확인하세요.")
    return False


def on_console_event(ev):
    if ev in (2, 5, 6):  # CTRL_CLOSE / LOGOFF / SHUTDOWN
        stop("창 닫기")
        return True
    return False


HANDLER = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_uint)(on_console_event)


def autosave_loop(minutes):
    while not state["stopping"]:
        for _ in range(int(minutes * 60)):
            if state["stopping"]:
                return
            time.sleep(1)
        if alive():
            save("자동")


def help_text():
    log("키: s 저장(+db) · e db 내보내기 · i 상태 · q 저장 후 종료(Ctrl+C 같음) · h 도움말")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=DEFAULT_PROJECT)
    ap.add_argument("--port", type=int, default=CFG.get("mcp_port", 8089))
    ap.add_argument("--autosave", type=float, default=10, help="자동 저장 간격(분), 0 = 끔")
    ap.add_argument("--xmx", default="8g")
    ap.add_argument("--db", default=DEFAULT_DB, help="내보낼 db 폴더(공백 없는 경로)")
    a = ap.parse_args()
    state["base"] = f"http://127.0.0.1:{a.port}"
    state["db"] = os.path.abspath(a.db)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if alive():
        log(f"이미 떠 있는 서버에 붙습니다: {state['base']}")
    elif not os.path.isfile(a.project):
        log(f"프로젝트가 없습니다: {a.project}")
        log("먼저 프로젝트를 만들거나 --project <경로.gpr> 로 지정하세요.")
        sys.exit(1)
    elif not start(os.path.abspath(a.project), a.port, a.xmx):
        sys.exit(1)

    ctypes.windll.kernel32.SetConsoleCtrlHandler(HANDLER, True)
    if a.autosave > 0:
        threading.Thread(target=autosave_loop, args=(a.autosave,), daemon=True).start()
        log(f"자동 저장: {a.autosave:g}분마다")
    help_text()
    try:
        while not state["stopping"]:
            if msvcrt.kbhit():
                k = msvcrt.getwch().lower()
                if k == "s":
                    save("수동")
                elif k == "e":
                    with lock:
                        export(force=True)
                elif k == "i":
                    info()
                elif k == "q":
                    stop("q")
                elif k == "h":
                    help_text()
            elif not alive() and (state["proc"] is None or state["proc"].poll() is not None):
                log("서버가 응답하지 않습니다. 실행기를 끝냅니다.")
                break
            time.sleep(0.1)
    except KeyboardInterrupt:
        stop("Ctrl+C")


if __name__ == "__main__":
    main()
