"""클래스 타입 동기화: 소유 프로그램에서 채운 struct/union/enum 정의를, 같은 클래스를 참조하는 다른 프로그램에 넣는다(db 텍스트).

  python sync_types.py [--dry] [--report <경로>]
  python snapshot.py sync-types            (같은 것)

규칙
- 클래스 정체 = 타입 경로에서 Ghidra 디맹글러 범주(/Demangler)를 뗀 경로. 예: /Demangler/bq/Foo 와 /bq/Foo 는 같은 클래스.
- 소유 프로그램 = 그 클래스 네임스페이스에 thunk 아닌 함수가 있는 프로그램. 없으면 내용이 채워진 정의가 하나뿐인 프로그램.
- 대상 = 소유자가 아닌데 같은 클래스 타입(자리표시 포함)이 이미 있는 프로그램. 없는 프로그램에는 새로 만들지 않는다.
- 필드가 참조하는 타입: 값으로 들어간 것은 같이 동기화, 포인터로만 쓰인 것은 대상에 없으면 빈 자리표시를 만든다.
  typedef·funcdef 는 통째로 옮긴다. 경로는 대상 프로그램에 같은 클래스가 있으면 그 경로로 바꾼다.
- 사본 설명 첫 줄에 출처 표시(config.json sync_marker, 기본 SYNC_FROM)를 단다. 표시가 있는 사본만 다시 쓴다.
  표시 없이 내용이 있는 사본은 그 프로그램에서 직접 고친 것이므로 덮어쓰지 않고 보고한다.
- 대상 프로그램에서 그 타입을 값으로 품은 다른 타입이 있고 크기가 달라지면 배치가 깨지므로 넣지 않고 보고한다.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
from snapshot import CFG  # noqa: E402

DEMANGLER = "/Demangler"
KINDS = ("struct", "union", "enum")
SUFFIX = re.compile(r"^(.*?)((?: \*\d*|\[\d+\])*)$")
TAG_LINE = re.compile(r"^(?:[A-Z][A-Z0-9]*_[A-Z0-9_]+\s*)+$")


def ident(path):
    return path[len(DEMANGLER):] if path.startswith(DEMANGLER + "/") else path


def split_type(t):
    """'/a/B *[4]' → ('/a/B', ' *[4]')"""
    m = SUFFIX.match(t)
    return m.group(1), m.group(2)


def is_filled(o):
    if o["k"] == "enum":
        return bool(o.get("v"))
    return bool(o.get("f"))


def field_types(o):
    out = []
    if o["k"] in ("struct", "union"):
        out = [f["t"] for f in o.get("f", [])]
    elif o["k"] == "typedef":
        out = [o["t"]]
    elif o["k"] == "funcdef":
        out = [o["ret"]] + [p[1] for p in o.get("params", [])]
    return out


class Prog:
    def __init__(self, path):
        self.dir = path
        self.meta = json.load(open(os.path.join(path, "meta.json"), encoding="utf-8"))
        self.module = self.meta["module"]
        tp = os.path.join(path, "types.jsonl")
        self.types = {}
        if os.path.exists(tp):
            for line in open(tp, encoding="utf-8").read().splitlines():
                if line:
                    o = json.loads(line)
                    self.types[o["p"]] = o
        self.by_ident = {ident(p): p for p in self.types}
        self.namespaces = set()
        fdir = os.path.join(path, "functions")
        if os.path.isdir(fdir):
            for f in os.listdir(fdir):
                lines = open(os.path.join(fdir, f), encoding="utf-8").read().split("\n")
                for line in lines[1:]:
                    c = line.split("\t")
                    if len(c) > 6 and c[6] == "0" and c[3]:
                        self.namespaces.add(c[3].replace("\\\\", "\\"))
        self.dirty = False

    def owns(self, cid):
        ns = "::".join(p for p in cid.strip("/").split("/"))
        return ns in self.namespaces

    def write(self):
        with open(os.path.join(self.dir, "types.jsonl"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("".join(json.dumps(self.types[k], ensure_ascii=False, separators=(",", ":")) + "\n" for k in sorted(self.types)))


def load_programs(db):
    progs = []
    for root, _, files in os.walk(db):
        if "meta.json" in files:
            progs.append(Prog(root))
    return progs


def strip_desc(desc, marker):
    lines = (desc or "").split("\n")
    lines = [l for l in lines if not l.startswith(marker + " ")]
    if lines and TAG_LINE.match(lines[0].strip() or "x"):
        lines = lines[1:]
    return "\n".join(lines).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--report", default=os.path.join(os.path.dirname(CFG["db"]), "sync_types_report.md"))
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    marker = CFG.get("sync_marker", "SYNC_FROM")
    progs = load_programs(CFG["db"])
    by_module = {p.module: p for p in progs}
    report, conflicts = [], []

    # 소유자 정하기: 메서드가 있는 프로그램, 없으면 채워진 비사본 정의가 하나뿐인 프로그램
    filled = defaultdict(list)
    for p in progs:
        for path, o in p.types.items():
            if o["k"] in KINDS and is_filled(o) and not (o.get("desc") or "").startswith(marker + " "):
                filled[ident(path)].append(p)
    owners = {}
    for cid, ps in filled.items():
        method_owners = [q for q in progs if q.owns(cid)]
        cands = [q for q in ps if q in method_owners] or (ps if len(ps) == 1 else [])
        if len(cands) == 1:
            owners[cid] = cands[0]
        else:
            conflicts.append(f"{cid}: 소유 프로그램을 정할 수 없음(채운 곳 {[q.module for q in ps]}, 메서드 있는 곳 {[q.module for q in method_owners]})")

    def translate(t, src, dst, plan, stubs):
        base, suf = split_type(t)
        if base not in src.types:
            return t
        cid = ident(base)
        if cid in dst.by_ident:
            return dst.by_ident[cid] + suf
        if suf.strip().startswith("*"):
            stubs.add(base)
        else:
            plan.add(base)
        return base + suf

    n_copy = n_stub = 0
    changed_types = {}
    for _round in range(20):
        round_changed = False
        for cid, src in sorted(owners.items(), key=lambda x: x[0]):
            for dst in progs:
                if dst is src or cid not in dst.by_ident:
                    continue
                todo, done, stubs = {src.by_ident[cid]}, set(), set()
                staged = {}
                ok = True
                while todo:
                    sp = todo.pop()
                    if sp in done:
                        continue
                    done.add(sp)
                    so = src.types[sp]
                    dp = dst.by_ident.get(ident(sp), sp)
                    cur = dst.types.get(dp)
                    if cur is not None and so["k"] in KINDS and is_filled(cur) and not (cur.get("desc") or "").startswith(marker + " "):
                        if json.dumps({k: v for k, v in cur.items() if k not in ("p", "desc")}, sort_keys=True) != json.dumps({k: v for k, v in so.items() if k not in ("p", "desc")}, sort_keys=True):
                            conflicts.append(f"{dst.module} {dp}: 이 프로그램에서 직접 채운 정의가 있어 {src.module} 정의로 덮어쓰지 않음")
                            if sp == src.by_ident[cid]:
                                ok = False
                        continue
                    no = json.loads(json.dumps(so))
                    no["p"] = dp
                    more = set()
                    if no["k"] in ("struct", "union"):
                        for f in no.get("f", []):
                            f["t"] = translate(f["t"], src, dst, more, stubs)
                    elif no["k"] == "typedef":
                        no["t"] = translate(no["t"], src, dst, more, stubs)
                    elif no["k"] == "funcdef":
                        no["ret"] = translate(no["ret"], src, dst, more, stubs)
                        no["params"] = [[q[0], translate(q[1], src, dst, more, stubs)] for q in no.get("params", [])]
                    rest = strip_desc(so.get("desc"), marker)
                    no["desc"] = f"{marker} {src.module}:{sp}" + ("\n" + rest if rest else "")
                    if cur is not None and cur.get("k") == "struct" and no["k"] == "struct" and cur.get("size") != no.get("size"):
                        holders = [q for q, qo in dst.types.items() if any(split_type(f["t"]) == (dp, "") for f in qo.get("f", []) if qo["k"] in ("struct", "union"))]
                        if holders:
                            conflicts.append(f"{dst.module} {dp}: 크기 {cur.get('size')}→{no.get('size')} 인데 값으로 품은 타입 {holders[:5]} 이 있어 넣지 않음")
                            if sp == src.by_ident[cid]:
                                ok = False
                            continue
                    staged[dp] = no
                    todo |= more - done
                if not ok:
                    continue
                for sp in sorted(stubs - done):
                    dp = sp
                    if ident(sp) in dst.by_ident or dp in staged:
                        continue
                    k = src.types[sp]["k"]
                    staged[dp] = {"p": dp, "k": k if k in ("struct", "union") else "struct", "size": 0, "pack": "off", "align": "default", "f": [],
                                  "desc": f"{marker} {src.module}:{sp} (포인터 대상 자리표시)"} if k in ("struct", "union") else json.loads(json.dumps(src.types[sp]))
                    n_stub += 1 if (dst.module, dp) not in changed_types else 0
                for dp, no in staged.items():
                    if dst.types.get(dp) != no:
                        dst.types[dp] = no
                        dst.by_ident[ident(dp)] = dp
                        dst.dirty = True
                        round_changed = True
                        changed_types[(dst.module, dp)] = src.module
        if not round_changed:
            break
    else:
        conflicts.append("20번 반복해도 끝나지 않음(순환 참조 확인 필요)")
    n_copy = len(changed_types)
    report = [f"{m} {dp} ← {s_}" for (m, dp), s_ in sorted(changed_types.items())]

    changed = [p.module for p in progs if p.dirty]
    text = [f"# 클래스 타입 동기화\n", f"- 소유자가 정해진 클래스 {len(owners)}개 · 넣거나 바꾼 타입 {n_copy}개(포인터 자리표시 {n_stub}) · 바뀐 프로그램 {len(changed)}개 · 충돌 {len(conflicts)}건\n",
            "## 충돌\n"] + [f"- {c}" for c in conflicts] + ["\n## 바뀐 타입\n"] + [f"- {r}" for r in report]
    os.makedirs(os.path.dirname(a.report), exist_ok=True)
    with open(a.report, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(text) + "\n")
    print(f"클래스 {len(owners)} · 타입 {n_copy}(자리표시 {n_stub}) · 프로그램 {len(changed)} · 충돌 {len(conflicts)} → {a.report}")
    if a.dry:
        print("--dry: db를 바꾸지 않음")
        return
    for p in progs:
        if p.dirty:
            p.write()
    if changed:
        print("다음: snapshot.py apply --programs " + ",".join(sorted(changed)))


if __name__ == "__main__":
    main()
