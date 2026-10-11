"""이전 기록(web/ghidra/migration/*.jsonl) → db 텍스트에 합친다. 그다음 snapshot.py apply 로 Ghidra 에 넣는다.

  python migrate.py [--dry] [기록 파일 ...]      기본: migration 폴더의 *.jsonl 전부

- 함수: 상태·시스템 태그(같은 축은 교체), plate 주석(기존 plate 는 아래에 남김), 이름·네임스페이스(이름 없는 함수만)
- 타입: types.jsonl 에 넣거나 교체
- 검사: 함수 ID 존재, 정의된 태그, 축 규칙, plate 첫 줄 형식, 문서 간 이름 충돌
- 결과: migration/report.md
형식: migration/README.md
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
from snapshot import CFG, program_path  # noqa: E402

MIG = os.path.join(os.path.dirname(TOOLS), "migration")
DEFAULT_NAME = re.compile(r"^(thunk_)?(FUN|LAB|SUB)_[0-9a-fA-F]+$")
ST_RANK = {"partial": 1, "complete": 2, "recheck": 3}
COMMENT_ORDER = ["plate", "pre", "eol", "post", "repeatable"]


def clean(s):
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\r", "\\r").replace("\n", "\\n")


def unclean(s):
    return re.sub(r"\\(.)", lambda m: {"t": "\t", "n": "\n", "r": "\r"}.get(m.group(1), m.group(1)), s)


def shard(addr):
    return format((int(addr, 16) >> 20) << 20, "x")


class Program:
    def __init__(self, module):
        self.module = module
        self.dir = os.path.join(CFG["db"], program_path(module).strip("/").replace("/", os.sep))
        self.ok = os.path.isfile(os.path.join(self.dir, "meta.json"))
        self.rows, self.head, self.dirty_shards = {}, {}, set()
        self.comments, self.dirty_comments = {}, set()
        self.types, self.types_dirty = None, False
        if not self.ok:
            return
        for f in glob.glob(os.path.join(self.dir, "functions", "*.tsv")):
            key = os.path.basename(f)[:-4]
            lines = open(f, encoding="utf-8").read().split("\n")
            self.head[key] = lines[0]
            for line in lines[1:]:
                if line:
                    c = line.split("\t")
                    self.rows[c[0]] = c

    def load_comments(self, key):
        if key not in self.comments:
            p = os.path.join(self.dir, "comments", key + ".jsonl")
            self.comments[key] = [json.loads(l) for l in open(p, encoding="utf-8").read().splitlines()] if os.path.exists(p) else []
        return self.comments[key]

    def load_types(self):
        if self.types is None:
            p = os.path.join(self.dir, "types.jsonl")
            self.types = {json.loads(l)["p"]: l for l in open(p, encoding="utf-8").read().splitlines()} if os.path.exists(p) else {}
        return self.types

    def containing(self, addr):
        """addr 를 몸체에 포함하는 함수 시작 주소(시작 자신은 제외)."""
        if not hasattr(self, "_starts"):
            self._starts = sorted((int(a, 16), int(c[1] or 0)) for a, c in self.rows.items())
        x = int(addr, 16)
        import bisect
        i = bisect.bisect_right(self._starts, (x, float("inf"))) - 1
        if i >= 0:
            s, size = self._starts[i]
            if s < x < s + max(size, 1):
                return format(s, "x")
        return None

    def set_comment(self, addr, kind, text, keep_old=False, head=None):
        key = shard(addr)
        com = self.load_comments(key)
        old = next((o for o in com if o["a"] == addr and o["t"] == kind), None)
        if keep_old and old and old["c"] and head is not None and not head.match(old["c"]):
            text += "\n---\n" + old["c"]
        if old:
            old["c"] = text
        else:
            com.append({"a": addr, "t": kind, "c": text})
        self.dirty_comments.add(key)

    def load_lines(self, name):
        if not hasattr(self, "_files"):
            self._files = {}
        if name not in self._files:
            p = os.path.join(self.dir, name)
            self._files[name] = open(p, encoding="utf-8").read().splitlines() if os.path.exists(p) else []
        return self._files[name]

    def write(self):
        for name, lines in getattr(self, "_files", {}).items():
            if name == "labels.tsv":
                head = lines[0] if lines and lines[0].startswith("addr\t") else "addr\tname\tnamespace\tprimary"
                body = sorted({l for l in lines if l and not l.startswith("addr\t")}, key=lambda l: (int(l.split("\t")[0], 16), l))
                lines = [head] + body
            else:
                lines = sorted({l for l in lines if l}, key=lambda l: (int(json.loads(l).get("a") or json.loads(l).get("f"), 16), l))
            with open(os.path.join(self.dir, name), "w", encoding="utf-8", newline="\n") as fh:
                fh.write("".join(l + "\n" for l in lines))
        for key in sorted(self.dirty_shards):
            rows = sorted((c for a, c in self.rows.items() if shard(a) == key), key=lambda c: int(c[0], 16))
            path = os.path.join(self.dir, "functions", key + ".tsv")
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write("\n".join([self.head.get(key, "addr\tsize\tname\tnamespace\tnamesrc\tsigsrc\tthunk\ttags\tsignature")] + ["\t".join(c) for c in rows]) + "\n")
        for key in sorted(self.dirty_comments):
            items = sorted(self.comments[key], key=lambda o: (int(o["a"], 16), COMMENT_ORDER.index(o["t"])))
            os.makedirs(os.path.join(self.dir, "comments"), exist_ok=True)
            with open(os.path.join(self.dir, "comments", key + ".jsonl"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write("".join(json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "\n" for o in items))
        if self.types_dirty:
            with open(os.path.join(self.dir, "types.jsonl"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write("".join(self.types[k] + "\n" for k in sorted(self.types)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--report", default=os.path.join(MIG, "report.md"))
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    tagfile = json.load(open(CFG["tags"], encoding="utf-8"))
    tagdef = tagfile["tags"]
    plate_head = re.compile(tagfile.get("plate", {}).get("head", "^.+$"))
    axis = {k: v["axis"] for k, v in tagdef.items()}
    state = {k: v.get("state") for k, v in tagdef.items() if v["axis"] == "status"}
    sys_modules = set(CFG.get("system_modules", ["main"]))
    files = a.files or sorted(glob.glob(os.path.join(MIG, "*.jsonl")))
    problems, conflicts = [], []
    fn_recs, type_recs, data_recs = defaultdict(list), defaultdict(list), defaultdict(list)
    created = []
    for path in files:
        doc = os.path.basename(path)
        for n, line in enumerate(open(path, encoding="utf-8").read().splitlines(), 1):
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError as e:
                problems.append(f"{doc}:{n} JSON 오류 {e}")
                continue
            r["_where"] = f"{doc}:{n}"
            if "fn" in r:
                fn_recs[r["fn"].lower()].append(r)
            elif "data" in r:
                data_recs[r["data"].lower()].append(r)
            elif "type" in r:
                type_recs[(r.get("module", "main"), r["type"])].append(r)
            else:
                problems.append(f"{doc}:{n} fn·type·data 중 하나가 없음")

    progs = {}

    def prog(m):
        if m not in progs:
            progs[m] = Program(m)
        return progs[m]

    new_cat = CFG.get("new_type_category", "/mpj").rstrip("/") + "/"
    renamed = {}

    def ren(module, t):
        """옮겨 넣은 타입 경로를 참조에도 반영한다. '/a/B *[4]' 같은 꾸밈은 유지."""
        m = re.match(r"^(.*?)((?: \*\d*|\[\d+\])*)$", t)
        base, suf = m.group(1), m.group(2)
        for _ in range(5):
            nxt = renamed.get((module, base))
            if not nxt:
                break
            base = nxt[1]
        return base + suf

    def ident(path):
        rel = path[len(new_cat) - 1:] if path.startswith(new_cat) else path
        return rel[len("/Demangler"):] if rel.startswith("/Demangler/") else rel

    if type_recs:
        from sync_types import load_programs
        ns_owner = defaultdict(set)
        all_progs = {q.module: q for q in load_programs(CFG["db"])}
        for q in all_progs.values():
            for ns in q.namespaces:
                ns_owner[ns].add(q.module)
        moved = defaultdict(list)
        for (module, path), recs in list(type_recs.items()):
            cid = ident(path)
            owners = ns_owner.get("::".join(cid.strip("/").split("/")), set())
            if len(owners) == 1 and module not in owners:
                owner = next(iter(owners))
                target = all_progs[owner].by_ident.get(cid, path)
                conflicts.append(f"{module} {path} → 클래스 메서드가 있는 {owner} 의 {target} 로 보냄(소유 프로그램에서만 정의, 다른 프로그램은 sync-types 로 복사)")
                renamed[(module, path)] = (owner, target)
                moved[(owner, target)] += recs
                del type_recs[(module, path)]
        for k, recs in moved.items():
            type_recs[k] = type_recs.get(k, []) + recs

    remapped = defaultdict(list)
    for (module, path), recs in list(type_recs.items()):
        p = prog(module)
        if not p.ok or path in p.load_types():
            continue
        rel = path[len(new_cat):] if path.startswith(new_cat) else path[len("/Demangler/"):] if path.startswith("/Demangler/") else path
        tail = rel.strip("/").split("/")
        name, ns = tail[-1], tail[:-1]
        cands = [q for q in p.load_types()
                 if not q.startswith(new_cat) and q.rstrip("/").split("/")[-1] == name
                 and (not ns or q.rstrip("/").split("/")[-1 - len(ns):-1] == ns)]
        if not cands:
            continue
        target = sorted(cands, key=lambda q: (q.startswith("/Demangler/"), len(q), q))[0]
        conflicts.append(f"{module} {path} → db에 같은 클래스가 있어 {target} 로 옮겨 넣음" + (f" (후보 {cands})" if len(cands) > 1 else ""))
        renamed[(module, path)] = (module, target)
        remapped[(module, target)] += recs
        del type_recs[(module, path)]
    for k, recs in remapped.items():
        type_recs[k] = type_recs.get(k, []) + recs

    new_by_name = defaultdict(list)
    for (module, path) in type_recs:
        p = prog(module)
        if p.ok and path not in p.load_types():
            new_by_name[(module, path.rstrip("/").split("/")[-1])].append(path)
    skip_paths = set()
    for (module, name), paths in new_by_name.items():
        if len(paths) > 1:
            keep = sorted(paths, key=lambda x: (-len(type_recs[(module, x)]), x))[0]
            conflicts.append(f"{module} 새 타입 '{name}' 경로가 여러 개 {sorted(paths)} → {keep} 하나만 넣음")
            skip_paths |= {(module, x) for x in paths if x != keep}
            for x in paths:
                if x != keep:
                    renamed[(module, x)] = (module, keep)

    n_fn = n_name = n_type = n_sig = n_com = n_data = 0
    for fid, recs in sorted(fn_recs.items()):
        if ":" not in fid:
            problems.append(f"{recs[0]['_where']} 함수 ID 형식 오류 {fid}")
            continue
        module, addr = fid.split(":", 1)
        addr = format(int(addr.removeprefix("0x"), 16), "x")
        p = prog(module)
        if not p.ok:
            problems.append(f"{recs[0]['_where']} 모듈 스냅샷 없음 {module}")
            continue
        row = p.rows.get(addr)
        if row is None:
            inside = p.containing(addr)
            if inside:
                problems.append(f"{recs[0]['_where']} 함수 없음 {module}:{addr} — {inside} 함수 안쪽(경계가 다름)")
                continue
            row = [addr, "0", "FUN_" + addr, "", "d", "d", "0", "", ""]
            p.rows[addr] = row
            created.append(f"{module}:{addr} ({recs[0]['_where']})")
        good = []
        for r in recs:
            bad = [t for t in (r.get("st"), r.get("sys"), r.get("ex")) if t and t not in axis]
            if bad:
                problems.append(f"{r['_where']} 정의 안 된 태그 {bad}")
                continue
            if r.get("st") and axis[r["st"]] != "status" or r.get("sys") and axis[r["sys"]] != "system":
                problems.append(f"{r['_where']} 태그 축이 다름 {r.get('st')} {r.get('sys')}")
                continue
            if r.get("sys") and module not in sys_modules:
                problems.append(f"{r['_where']} 시스템 태그는 {', '.join(sorted(sys_modules))}에만 ({fid})")
                r = {k: v for k, v in r.items() if k != "sys"}
            if not plate_head.match(r.get("plate", "")):
                problems.append(f"{r['_where']} plate 첫 줄 형식 오류 ({fid})")
                continue
            good.append(r)
        if not good:
            continue
        st = max((r["st"] for r in good if r.get("st")), key=lambda t: ST_RANK[state[t]], default=None)
        if len({r["st"] for r in good if r.get("st")}) > 1:
            conflicts.append(f"{fid} 상태 다름 {sorted({r['st'] for r in good if r.get('st')})} → {st}")
        votes = Counter(r["sys"] for r in good if r.get("sys")).most_common()
        syss = [votes[0][0]] if votes else []
        if len(votes) > 1:
            if votes[0][1] > votes[1][1]:
                conflicts.append(f"{fid} 시스템 다름 {dict(votes)} → 많은 쪽 {votes[0][0]}")
            else:
                conflicts.append(f"{fid} 시스템 다름 {dict(votes)} → 동수라 넣지 않음")
                syss = []
        names = sorted({(r.get("ns", ""), r["name"]) for r in good if r.get("name")})
        tags = [t for t in row[7].split(",") if t and axis.get(t) not in ("status", "system")]
        if st:
            tags.append(st)
        if len(syss) == 1:
            tags.append(syss[0])
        if any(r.get("ex") for r in good):
            tags += sorted({r["ex"] for r in good if r.get("ex")})
        row[7] = ",".join(sorted(set(tags)))
        if len(names) > 1:
            conflicts.append(f"{fid} 이름 다름 {names} → 넣지 않음")
        elif names:
            if DEFAULT_NAME.match(unclean(row[2])) or row[4] == "u":
                row[2], row[3], row[4] = clean(names[0][1]), clean(names[0][0]), "u"
                n_name += 1
            elif names[0][1] != unclean(row[2]):
                conflicts.append(f"{fid} 원본 이름 {unclean(row[3])}::{unclean(row[2])} 유지 (문서 이름 {names[0][0]}::{names[0][1]})")
        plates = []
        for r in good:
            if r["plate"] not in plates:
                plates.append(r["plate"])
        p.set_comment(addr, "plate", "\n\n".join(plates), keep_old=True, head=plate_head)
        sigs = [r["sig"] for r in good if r.get("sig")]
        if sigs:
            if len({json.dumps(s, sort_keys=True) for s in sigs}) > 1:
                conflicts.append(f"{fid} 시그니처 다름 → 첫 기록 사용")
            s = sigs[0]
            o = {"a": addr}
            if s.get("cc"):
                o["cc"] = s["cc"]
            o["ret"] = ren(module, s.get("ret", "/undefined"))
            o["params"] = [[x[0], ren(module, x[1])] for x in s.get("params", [])]
            for k in ("varargs", "noreturn"):
                if k in s:
                    o[k] = bool(s[k])
            line = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
            lines = p.load_lines("signatures.jsonl")
            lines[:] = [l for l in lines if json.loads(l)["a"] != addr] + [line]
            row[5] = "u"
            n_sig += 1
        for r in good:
            for c in r.get("comments", []):
                ca = format(int(str(c["a"]).removeprefix("0x"), 16), "x")
                if c.get("t", "pre") not in COMMENT_ORDER or c.get("t") == "plate":
                    problems.append(f"{r['_where']} 주석 종류 오류 {c.get('t')} ({fid})")
                    continue
                p.set_comment(ca, c.get("t", "pre"), c["c"])
                n_com += 1
        p.dirty_shards.add(shard(addr))
        n_fn += 1

    for (module, path), recs in sorted(type_recs.items()):
        p = prog(module)
        if not p.ok:
            problems.append(f"{recs[0]['_where']} 모듈 스냅샷 없음 {module}")
            continue
        if (module, path) in skip_paths:
            continue
        if path not in p.load_types():
            tail = "/".join(path.strip("/").split("/")[-2:])
            same = [q for q in p.load_types() if q.endswith("/" + tail) and q != path]
            if same:
                conflicts.append(f"{module} {path} 새 경로인데 같은 클래스가 이미 있음 {same} → 넣지 않음")
                continue
        kinds = {r.get("kind", "struct") for r in recs}
        if len(kinds) > 1:
            conflicts.append(f"{module} {path} 종류가 다름 {sorted(kinds)} → 넣지 않음")
            continue
        kind = kinds.pop()
        sts = [r["st"] for r in recs if r.get("st") in state]
        st = max(sts, key=lambda t: ST_RANK[state[t]]) if sts else None
        syss = sorted({r["sys"] for r in recs if r.get("sys")})
        if len(syss) > 1:
            conflicts.append(f"{module} {path} 시스템 다름 {syss} → 넣지 않음")
        notes = []
        for r in recs:
            if r.get("note") and r["note"] not in notes:
                notes.append(r["note"])
        desc = " ".join(t for t in (st, syss[0] if len(syss) == 1 else None) if t)
        if notes:
            desc = (desc + "\n" if desc else "") + "\n\n".join(notes)
        o = {"p": path, "k": kind}
        if kind == "enum":
            vals = {}
            for r in recs:
                for v in r.get("values", []):
                    if v[0] in vals and vals[v[0]][1] != v[1]:
                        conflicts.append(f"{module} {path} enum {v[0]} 값 다름 {vals[v[0]][1]} / {v[1]} → 먼저 것")
                        continue
                    vals.setdefault(v[0], list(v))
            o["size"] = max((r.get("size", 4) for r in recs), default=4)
            o["v"] = sorted(vals.values(), key=lambda v: (v[1], v[0]))
        else:
            merged = []
            for r in recs:
                for f in r.get("fields", []):
                    fo = f.get("o", 0)
                    clash = [g for g in merged if kind == "struct" and g["o"] < fo + f["l"] and fo < g["o"] + g["l"]]
                    same = [g for g in clash if g["o"] == fo and g["l"] == f["l"]]
                    if same:
                        g = same[0]
                        if g.get("t") != f.get("t") and str(g.get("t", "")).startswith("/undefined") and not str(f.get("t", "")).startswith("/undefined"):
                            g["t"] = f["t"]
                        if g.get("n") != f.get("n"):
                            conflicts.append(f"{module} {path} +0x{fo:x} 필드 이름 다름 {g.get('n')} / {f.get('n')} → 먼저 것 ({r['_where']})")
                        elif g.get("t") != f.get("t") and not str(f.get("t", "")).startswith("/undefined"):
                            conflicts.append(f"{module} {path} +0x{fo:x} 필드 타입 다름 {g.get('t')} / {f.get('t')} → 먼저 것 ({r['_where']})")
                        if f.get("c") and not g.get("c"):
                            g["c"] = f["c"]
                        continue
                    if clash:
                        conflicts.append(f"{module} {path} +0x{fo:x} 필드가 겹침 {[(hex(g['o']), g['l'], g.get('n')) for g in clash]} / ({f.get('n')}, {f['l']}) → 먼저 것 ({r['_where']})")
                        continue
                    if kind == "union" and any(g.get("n") == f.get("n") for g in merged):
                        continue
                    merged.append(dict(f, o=fo))
            fields = sorted(merged, key=lambda f: f["o"])
            if kind == "struct":
                o["size"] = max([r.get("size") or 0 for r in recs] + [f["o"] + f["l"] for f in fields] + [0])
            o["pack"], o["align"] = "off", "default"
            o["f"] = [{k: (ren(module, f[k]) if k == "t" else f[k]) for k in ("o", "l", "t", "n", "c") if k in f and (kind == "struct" or k != "o")} for f in fields]
        if desc:
            o["desc"] = desc
        p.load_types()[path] = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
        p.types_dirty = True
        n_type += 1

    for did, recs in sorted(data_recs.items()):
        module, addr = did.split(":", 1)
        addr = format(int(addr.removeprefix("0x"), 16), "x")
        p = prog(module)
        if not p.ok:
            problems.append(f"{recs[0]['_where']} 모듈 스냅샷 없음 {module}")
            continue
        r = recs[-1]
        if len({x.get("name") for x in recs}) > 1:
            conflicts.append(f"{did} 데이터 이름 다름 {sorted({str(x.get('name')) for x in recs})} → 마지막 사용")
        if r.get("plate") and not plate_head.match(r["plate"]):
            problems.append(f"{r['_where']} plate 첫 줄 형식 오류 ({did})")
            continue
        if r.get("name"):
            ns, _, name = r["name"].rpartition("::")
            labels = p.load_lines("labels.tsv")
            labels[:] = [l for l in labels if not l.startswith(addr + "\t")] + ["\t".join([addr, clean(name), clean(ns), "1"])]
        if r.get("type"):
            lines = p.load_lines("data.jsonl")
            lines[:] = [l for l in lines if json.loads(l)["a"] != addr] + [json.dumps({"a": addr, "t": ren(module, r["type"])}, ensure_ascii=False, separators=(",", ":"))]
        if r.get("plate"):
            p.set_comment(addr, "plate", r["plate"])
        n_data += 1

    placeholders = []
    for module, p in sorted(progs.items()):
        if not p.ok:
            continue
        files = getattr(p, "_files", {})
        if not (p.types_dirty or "signatures.jsonl" in files or "data.jsonl" in files):
            continue
        types = p.load_types()
        refs = defaultdict(int)

        def add_ref(t, length=None):
            m = re.match(r"^(.*?)((?: \*\d*|\[\d+\])*)$", t)
            base, suf = m.group(1), m.group(2)
            if base.count("/") < 2 or base in types:
                return
            size = 0
            if not suf and length:
                size = length
            elif suf and not suf.strip().startswith("*") and length:
                n = 1
                for k in re.findall(r"\[(\d+)\]", suf):
                    n *= int(k)
                size = length // n if n else 0
            refs[base] = max(refs[base], size)

        for line in list(types.values()):
            o = json.loads(line)
            for f in o.get("f", []):
                add_ref(f["t"], f.get("l"))
            if o["k"] == "typedef":
                add_ref(o["t"])
            if o["k"] == "funcdef":
                add_ref(o["ret"])
                for q in o.get("params", []):
                    add_ref(q[1])
        for line in files.get("signatures.jsonl", []):
            o = json.loads(line)
            add_ref(o.get("ret", "/undefined"))
            for q in o.get("params", []):
                add_ref(q[1])
        for line in files.get("data.jsonl", []):
            add_ref(json.loads(line)["t"])
        for base, size in sorted(refs.items()):
            types[base] = json.dumps({"p": base, "k": "struct", "size": size, "pack": "off", "align": "default", "f": [],
                                      "desc": "자리표시: 이전 기록이 참조하지만 정의가 없음"}, ensure_ascii=False, separators=(",", ":"))
            p.types_dirty = True
            placeholders.append(f"{module} {base} (크기 {size})")

    report = [f"# 이전 결과\n",
              f"- 기록 파일 {len(files)}개 · 함수 {n_fn}개 반영(이름 {n_name}, 시그니처 {n_sig}, 함수 안 주석 {n_com}, 새로 만든 함수 {len(created)}) · 타입 {n_type}개 · 전역 데이터 {n_data}개",
              f"- 문제 {len(problems)}건 · 충돌 {len(conflicts)}건\n", "## 문제\n"] + [f"- {x}" for x in problems] + ["\n## 충돌\n"] + [f"- {x}" for x in conflicts]
    report += ["\n## 새로 만든 함수(자동 분석이 놓친 시작 주소)\n"] + [f"- {x}" for x in created]
    report += ["\n## 자리표시로 만든 타입(참조만 있고 정의 없음)\n"] + [f"- {x}" for x in placeholders]
    with open(a.report, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(report) + "\n")
    print(f"함수 {n_fn} (이름 {n_name}, 시그니처 {n_sig}, 주석 {n_com}, 새 함수 {len(created)}) · 타입 {n_type} · 데이터 {n_data} · 문제 {len(problems)} · 충돌 {len(conflicts)} → {a.report}")
    if not a.dry:
        for p in progs.values():
            if p.ok:
                p.write()
        print("db 갱신 완료. 다음: snapshot.py apply --programs " + ",".join(sorted(m for m, p in progs.items() if p.ok)))
    else:
        print("--dry: db를 바꾸지 않음")


if __name__ == "__main__":
    main()
