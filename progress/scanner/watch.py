import sys
sys.dont_write_bytecode = True
import argparse
from collections import Counter, defaultdict
import gzip
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
import mimetypes
import socket
from pathlib import Path
import threading
import time
from urllib.parse import urlparse, parse_qs, unquote
from common import APP, ROOT, read_json
from build_progress import build, fingerprint
import ghidra_db


class Snapshot:
    @property
    def groups(self):
        """모듈(그룹) → {name, deps…}. md 모드의 minigames 도 같은 모양으로 바꿔 준다."""
        return self.progress.get("groups") or {k: {"name": v.get("name_ko", "")} for k, v in self.progress.get("minigames", {}).items()}

    def __init__(self, lazy=False):
        self.progress = read_json(APP / "data/progress.json")
        self.features = read_json(APP / "data/features.json")
        self.feature_by_id = {x["id"]: x for x in self.features}
        self.unresolved = read_json(APP / "data/unresolved.json")
        self.issue_by_id = {x["id"]: x for x in self.unresolved}
        self.documents = read_json(APP / "data/documents.json")
        self.config = read_json(APP / "config/categories.json")
        self.categories = {x["id"]: x["name"] for x in self.config["categories"]}
        self.cache = {}
        self._ready = threading.Event()
        self._load_error = None
        self._load_lock = threading.Lock()
        self._loading = False
        if lazy:
            # Let the server and saved overview respond before decoding a large
            # inventory. First detailed interaction can bring this forward.
            timer = threading.Timer(2, self.start_loading)
            timer.daemon = True
            timer.start()
        else:
            self.load_functions()

    def start_loading(self):
        with self._load_lock:
            if self._loading or self._ready.is_set():
                return
            self._loading = True
            threading.Thread(target=self.load_functions, daemon=True).start()

    def load_functions(self):
        try:
            self.functions = read_json(APP / "data/functions.json")
            self.by_id = {x["id"]: x for x in self.functions}
        except Exception as error:
            self._load_error = error
        finally:
            self._ready.set()

    def ready(self):
        self.start_loading()
        self._ready.wait()
        if self._load_error:
            raise self._load_error

    def filtered(self, query):
        self.ready()
        mode = query.get("mode", "analysis")
        category = query.get("category", "")
        state = query.get("state", "")
        search = query.get("q", "").casefold().strip()
        unresolved = query.get("unresolved") == "1"
        tag = query.get("tag", "")
        return [f for f in self.functions if (not category or f["category"] == category)
                and (not tag or tag == f["category"] or tag in f["tags"])
                and (not state or (f[mode] != "complete" if state == "unfinished" and mode != "verification" else
                                  f[mode] != "verified" if state == "unfinished" else f[mode] == state))
                and (not unresolved or f["unresolved"])
                and (not search or search in (f["id"] + " " + f["name"]).casefold())]

    def tree(self, query):
        key = json.dumps(query, sort_keys=True)
        if key in self.cache:
            return self.cache[key]
        start = time.perf_counter()
        # The first view is served directly from saved aggregates, before loading
        # the large function inventory. It never invokes the scanner.
        if query.get("view", "category") == "category" and query.get("scope", "[]") == "[]" and not any(query.get(k) for k in ("category", "tag", "state", "q", "unresolved")):
            mode = query.get("mode", "analysis")
            nodes = []
            for c in self.progress["categories"]:
                if not c["functions"]:
                    continue
                # Feature counts use a different denominator. For function cells
                # on implementation/verification, defer to the real inventory.
                if mode != "analysis":
                    break
                counts = c["analysis"]
                nodes.append({"id": "category:" + c["id"], "name": c["name"], "value": c["functions"],
                              "field": "category", "key": c["id"], "counts": counts,
                              "complete": counts.get("complete", 0), "partial": counts.get("partial", 0),
                              "candidate": counts.get("candidate", 0), "unresolved": c["unresolved"]})
            if nodes and mode == "analysis":
                result = {"nodes": nodes, "total": self.progress["stats"]["functions"], "leaf": False,
                          "counts": self.progress["stats"]["analysis"], "server_ms": round((time.perf_counter()-start)*1000, 2),
                          "scope": [], "version": self.progress["version"]}
                self.cache[key] = result
                return result
        selected = self.filtered(query)
        scope = json.loads(query.get("scope", "[]"))
        view = query.get("view", "category")
        mode = query.get("mode", "analysis")
        for field, value in scope:
            if field == "bucket":
                selected = [f for f in selected if int(f["address"], 16) // 0x10000 == int(value)]
            elif field in {"category", "subgroup", "subsystem", "module"}:
                selected = [f for f in selected if f[field] == value]
            else:
                raise ValueError("유효하지 않은 탐색 경로")
        fields = [x[0] for x in scope]
        if not scope:
            next_field = "module" if view == "module" else "category"
        elif view != "module" and "subgroup" not in fields:
            next_field = "subgroup"
        elif view != "module" and selected and selected[0].get("subsystem_level", selected[0].get("minigame")) and "subsystem" not in fields:
            next_field = "subsystem"
        elif len(selected) > self.config["leaf_limit"] and "module" not in fields:
            next_field = "module"
        elif len(selected) > self.config["leaf_limit"] and "bucket" not in fields:
            next_field = "bucket"
        else:
            next_field = None
        nodes = []
        if next_field:
            groups = defaultdict(list)
            for f in selected:
                value = str(int(f["address"], 16) // 0x10000) if next_field == "bucket" else f[next_field]
                groups[value].append(f)
            for value, group in sorted(groups.items()):
                counts = Counter(x[mode] for x in group)
                if next_field == "category":
                    name = self.categories[value]
                elif next_field == "subgroup" and value in self.groups:
                    game = self.groups[value]
                    name = f'{value} · {game.get("name", "")}'
                    if game.get("deps"):
                        name += f' · 의존 {game["deps_complete"]}/{game["deps"]}'
                elif next_field == "bucket":
                    name = f'0x{int(value) * 0x10000:x}–{(int(value)+1)*0x10000-1:x}'
                else:
                    name = value
                nodes.append({"id": next_field + ":" + value, "name": name, "value": len(group),
                              "field": next_field, "key": value, "counts": dict(counts),
                              "complete": counts["verified" if mode == "verification" else "complete"],
                              "partial": counts["partial"], "candidate": counts["candidate"],
                              "unresolved": sum(bool(x["unresolved"]) for x in group)})
        else:
            nodes = [{"id": f["id"], "name": f["name"], "value": 1, "state": f[mode],
                      "address": f["address"], "module": f["module"], "unresolved": len(f["unresolved"])} for f in selected]
        result = {"nodes": nodes, "total": len(selected), "leaf": not next_field,
                  "counts": dict(Counter(x[mode] for x in selected)), "server_ms": round((time.perf_counter()-start)*1000, 2),
                  "scope": scope, "version": self.progress["version"]}
        if len(self.cache) > 80:
            self.cache.clear()
        self.cache[key] = result
        return result


class GhidraSnapshot(Snapshot):
    """web/ghidra/db 를 직접 읽은 결과(ghidra_db.build)를 Snapshot 과 같은 모양으로 담는다."""

    def __init__(self, data, cfg):
        self.progress = data["progress"]
        self.features = data["features"]
        self.feature_by_id = {x["id"]: x for x in self.features}
        self.unresolved = data["unresolved"]
        self.issue_by_id = {x["id"]: x for x in self.unresolved}
        self.documents = data["documents"]
        self.config = cfg
        self.categories = {c["id"]: c["name"] for c in self.progress["categories"]}
        self.root = ghidra_db.ROOT
        self.cache = {}
        self._ready = threading.Event()
        self._load_error = None
        self._load_lock = threading.Lock()
        self._loading = True
        self.functions = data["functions"]
        self.by_id = {x["id"]: x for x in self.functions}
        self._ready.set()


def watch_ghidra(server, stop):
    cfg = ghidra_db.config()
    current = server.snapshot.progress["fingerprint"]
    while not stop.wait(cfg.get("poll_seconds", 3)):
        try:
            stamp = ghidra_db.stamp(cfg)
            if stamp == current:
                continue
            server.watch_status.update(scanning=True, error=None)
            cfg = ghidra_db.config()
            server.snapshot = GhidraSnapshot(ghidra_db.build(cfg), cfg)
            current = server.snapshot.progress["fingerprint"]
            server.watch_status.update(scanning=False, last_scan=server.snapshot.progress["version"])
        except Exception as error:
            server.watch_status.update(scanning=False, error=str(error))
            print(f"[watch] 오류: {error}", flush=True)


class AppServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, status, data, content_type="application/json; charset=utf-8"):
        body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
        compressed = "gzip" in self.headers.get("Accept-Encoding", "") and len(body) > 2048
        if compressed:
            body = gzip.compress(body, compresslevel=3)
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        if compressed:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            url = urlparse(self.path)
            query = {k: values[0] for k, values in parse_qs(url.query).items()}
            snap = self.server.snapshot
            if url.path == "/api/status":
                return self.send(200, {"version": snap.progress["version"], **self.server.watch_status})
            if url.path == "/api/progress":
                return self.send(200, snap.progress)
            if url.path == "/api/tree":
                if query.get("mode", "analysis") not in {"analysis", "implementation", "verification"}:
                    raise ValueError("진행률 모드 오류")
                return self.send(200, snap.tree(query))
            if url.path == "/api/search":
                all_results = snap.filtered(query)
                limit = min(int(query.get("limit", 60)), 200)
                return self.send(200, {"total": len(all_results), "items": [{k: f[k] for k in
                                 ("id", "name", "address", "module", "category", "subgroup", "subsystem", "analysis", "implementation", "verification")}
                                 for f in all_results[:limit]]})
            if url.path == "/api/function":
                snap.ready()
                f = snap.by_id.get(query.get("id"))
                if not f:
                    return self.send(404, {"error": "함수를 찾을 수 없습니다"})
                return self.send(200, {**f, "feature_details": [snap.feature_by_id[k] for k in f["features"]],
                                      "issue_details": [snap.issue_by_id[k] for k in f["unresolved"]]})
            if url.path in {"/api/features", "/api/unresolved", "/api/documents"}:
                data = getattr(snap, url.path.split("/")[-1])
                q = query.get("q", "").casefold()
                category = query.get("category", "")
                state = query.get("state", "")
                items = [x for x in data if (not q or q in json.dumps(x, ensure_ascii=False).casefold())
                         and (not category or x.get("category") == category)
                         and (not state or x.get(query.get("mode", "implementation")) == state)]
                offset = max(0, int(query.get("offset", 0)))
                return self.send(200, {"total": len(items), "items": items[offset:offset + 100]})
            if url.path == "/api/preview":
                snap.ready()
                root = getattr(snap, "root", ROOT)
                target = (root / query.get("path", "")).resolve()
                allowed = {x["path"] for x in snap.documents}
                allowed.update(s["path"] for f in snap.functions for s in f["sources"])
                allowed.update(x["path"] for x in snap.features if x.get("path"))
                for f in snap.features:
                    allowed.update(x["path"] for x in f.get("tests", []))
                if not target.is_relative_to(root) or target.relative_to(root).as_posix() not in allowed:
                    return self.send(403, {"error": "스캔에서 확인된 읽기 전용 문서/소스만 미리 볼 수 있습니다"})
                lineno = max(1, int(query.get("line", 1)))
                begin = max(1, lineno - 12)
                lines = []
                with target.open(encoding="utf-8-sig", errors="replace") as stream:
                    for i, line in enumerate(stream, 1):
                        if i >= begin:
                            lines.append({"number": i, "text": line.rstrip("\n")})
                        if i >= begin + 160:
                            break
                return self.send(200, {"path": str(target), "line": lineno, "lines": lines})
            route = unquote(url.path).lstrip("/") or "index.html"
            path = (APP / route).resolve()
            if not path.is_relative_to(APP) or (route != "index.html" and not route.startswith("dist/")) or not path.is_file():
                return self.send(404, {"error": "파일 없음"})
            mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
            return self.send(200, path.read_bytes(), mime)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            self.send(400, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            self.send(500, {"error": str(error)})


def watch(server, stop):
    current = server.snapshot.progress["fingerprint"]
    while not stop.wait(server.snapshot.config.get("poll_seconds", 3)):
        try:
            config = read_json(APP / "config/categories.json")
            published = read_json(APP / "data/progress.json", {})
            if published.get("version") != server.snapshot.progress["version"]:
                server.snapshot = Snapshot()
                current = published["fingerprint"]
                server.watch_status.update(last_scan=published["version"])
            stamp, _ = fingerprint(config)
            if stamp == current:
                continue
            server.watch_status.update(scanning=True, error=None)
            progress = build()
            if progress is None:
                continue
            server.snapshot = Snapshot()
            current = progress["fingerprint"]
            server.watch_status.update(scanning=False, last_scan=progress["version"])
        except Exception as error:
            server.watch_status.update(scanning=False, error=str(error))
            print(f"[watch] 오류: {error}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-watch", action="store_true")
    parser.add_argument("--source", choices=["ghidra", "md"], default="ghidra",
                        help="ghidra = web/ghidra/db 직접 읽기(기본), md = 기존 문서 스캔 결과(data/*.json)")
    args = parser.parse_args()
    if args.source == "ghidra":
        cfg = ghidra_db.config()
        snapshot = GhidraSnapshot(ghidra_db.build(cfg), cfg)
        p = snapshot.progress
        print(f"web/ghidra/db: 프로그램 {p['modules']}개 · 함수 {len(snapshot.functions):,}개 · 대상 {p['stats']['functions']:,}개 · {p['scan_seconds']}s", flush=True)
    else:
        config = read_json(APP / "config/categories.json")
        progress = read_json(APP / "data/progress.json", {})
        if not progress:
            print("저장된 스캔 데이터가 없습니다. 먼저 npm run scan을 실행하세요.", flush=True)
            return
        snapshot = None
    try:
        server = AppServer(("127.0.0.1", args.port), Handler)
    except OSError as error:
        print(f"포트 {args.port}가 이미 사용 중입니다. 기존 대시보드를 열거나 --port로 다른 포트를 지정하세요. ({error})", flush=True)
        return
    server.snapshot = snapshot or Snapshot(lazy=True)
    server.watch_status = {"scanning": False, "watching": not args.no_watch, "error": None}
    stop = threading.Event()
    if not args.no_watch:
        threading.Thread(target=watch_ghidra if args.source == "ghidra" else watch, args=(server, stop), daemon=True).start()
    print(f"Local: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == "__main__":
    main()
