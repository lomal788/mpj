"""Ghidra 스냅샷 db 를 직접 읽어 진행률을 집계한다(문서 스캔 없음). 프로젝트별 규칙은 config/ghidra.json,
태그 이름·축·상태는 tags 파일(axis: status|system|exclude, status 는 state: complete|partial|recheck).

- 분석 상태: status 축 태그
- 제외: exclude 축 태그·lib_pattern·thunk·작은 함수
- 영역(areas): 모듈 이름으로 정하고, 영역마다 분류 방식 classify = system | stage | none
    system: system 축 태그 → 이름 패턴 → 주소 이웃 추정(→ 호출 추정, 설정)
    stage : 메서드 이름 패턴으로 단계, 아래는 모듈 → 클래스
- 구조체·타입: 설명의 status·system 태그 우선, 없으면 필드 유무·경로 패턴
- 규칙 위반: 정의 안 된 태그, 축당 2개 이상, 상태 태그인데 plate 주석 없음·형식 다름, 코드 표시가 없는 함수를 가리킴
- 의존: thunk 이름(외부 접두어 제거)으로 다른 영역 함수를 찾아 모듈별 의존 함수의 분석률
- 웹 구현: 코드의 `<orig_marker> <모듈>:<주소> full|partial|approx|ref`
- 문서: plate 주석 첫 줄의 문서 참조(tags 파일 plate.doc), 첫 줄 형식은 plate.head
"""
from collections import Counter, defaultdict
import bisect
import csv
import json
import os
import re
import time
from pathlib import Path

from common import APP, ROOT, read_json

DEFAULT_NAME = re.compile(r"^(thunk_)?(FUN|LAB|SUB)_[0-9a-fA-F]+$")
TEMPLATE = re.compile(r"<[^<>]*>")
LEVEL = {"full": "complete", "partial": "partial", "approx": "candidate", "ref": "pending"}
RANK = {"complete": 4, "partial": 3, "candidate": 2, "pending": 1, "none": 0}
STATE = {"complete": "complete", "partial": "partial", "recheck": "pending"}
EXCLUDED = "excluded"
HOW = {"tag": "태그", "name": "이름", "calls": "호출 추정", "address": "주소 추정", "none": "근거 없음"}

LABELS = {
    "analysis": {"complete": "분석 완료", "partial": "부분 분석", "pending": "재확인", "none": "미분석"},
    "implementation": {"complete": "full", "partial": "partial", "candidate": "approx", "pending": "ref(수준 미정)", "none": "포팅 표시 없음"},
    "verification": {"verified": "원본 비교 검증", "tested": "자동 테스트 통과", "none": "미검증"},
}


def config(path=None):
    """설정을 읽고 저장소 루트(root, 설정 파일 기준 상대 경로)를 정한다. 설정의 다른 경로는 모두 루트 기준."""
    global ROOT
    path = Path(path) if path else APP / "config/ghidra.json"
    cfg = read_json(path)
    if cfg.get("root"):
        ROOT = (path.parent / cfg["root"]).resolve()
    return cfg


def load_tags(cfg):
    d = read_json(ROOT / cfg["tags"], {"tags": {}})
    tags = d.get("tags", {})
    plate = d.get("plate", {})
    return {
        "plate_head": re.compile(plate.get("head", "^.+$")),
        "plate_example": plate.get("head_example", ""),
        "doc_ref": re.compile(plate["doc"]) if plate.get("doc") else None,
        "all": set(tags),
        "status": {k: STATE[v.get("state", "partial")] for k, v in tags.items() if v.get("axis") == "status"},
        "plate": {k for k, v in tags.items() if v.get("axis") == "status" and v.get("plate")},
        "system": [k for k, v in tags.items() if v.get("axis") == "system"],
        "system_name": {k: v.get("label", k) for k, v in tags.items() if v.get("axis") == "system"},
        "exclude": {k: v.get("label", k) for k, v in tags.items() if v.get("axis") == "exclude"},
    }


def stamp(cfg):
    newest, count, size = 0.0, 0, 0
    roots = [ROOT / cfg["db"], ROOT / cfg["tags"]] + [ROOT / c for c in cfg["code"]]
    for root in roots:
        if root.is_file():
            st = root.stat()
            newest, count, size = max(newest, st.st_mtime), count + 1, size + st.st_size
            continue
        for dirpath, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", ".git")]
            for f in files:
                st = os.stat(os.path.join(dirpath, f))
                newest, count, size = max(newest, st.st_mtime), count + 1, size + st.st_size
    return f"{newest:.3f}:{count}:{size}"


def tsv_rows(path):
    with open(path, encoding="utf-8", newline="") as fh:
        lines = fh.read().split("\n")
    head = lines[0].split("\t")
    for i, line in enumerate(lines[1:], 2):
        if line:
            yield i, dict(zip(head, line.split("\t")))


def unclean(s):
    return re.sub(r"\\(.)", lambda m: {"t": "\t", "n": "\n", "r": "\r"}.get(m.group(1), m.group(1)), s)


def area_of(module, cfg):
    for a in cfg["areas"]:
        if module in a.get("modules", []) or ("pattern" in a and re.match(a["pattern"], module)):
            return a
    return cfg["areas"][-1]


def orig_marks(cfg):
    marker = cfg.get("orig_marker", "@orig")
    rx = re.compile(re.escape(marker) + r"\s+([A-Za-z0-9_.-]+):(?:0x)?([0-9a-fA-F]+)\s+(full|partial|approx|ref)\b")
    marks = defaultdict(list)
    for c in cfg["code"]:
        for dirpath, dirs, files in os.walk(ROOT / c):
            dirs[:] = [d for d in dirs if d not in ("node_modules", "dist")]
            for f in files:
                if not f.endswith((".ts", ".tsx", ".mts", ".js", ".mjs", ".py", ".c", ".cpp", ".h", ".rs")):
                    continue
                p = Path(dirpath, f)
                try:
                    text = p.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                if marker not in text:
                    continue
                for n, line in enumerate(text.splitlines(), 1):
                    for m in rx.finditer(line):
                        fid = f"{m.group(1)}:{int(m.group(2), 16):x}"
                        marks[fid].append({"path": p.relative_to(ROOT).as_posix(), "line": n, "level": LEVEL[m.group(3)]})
    return marks


def group_names(cfg):
    out = {}
    for a in cfg["areas"]:
        spec = a.get("names")
        if not spec:
            continue
        path = ROOT / spec["file"]
        if path.exists():
            with open(path, encoding="utf-8-sig") as fh:
                for row in csv.DictReader(fh, delimiter="\t"):
                    out[row[spec["key"]]] = {"name": row.get(spec["name"], "")}
    return out


def stats(funcs):
    n = len(funcs)
    a = Counter(f["analysis"] for f in funcs)
    i = Counter(f["implementation"] for f in funcs)
    v = Counter(f["verification"] for f in funcs)
    pct = lambda x: round(x / n * 100, 2) if n else None
    return {"functions": n, "document_linked": sum(bool(f["documents"]) for f in funcs), "analysis": dict(a),
            "features": n, "implementation": dict(i), "verification": dict(v), "unresolved": sum(bool(f["unresolved"]) for f in funcs),
            "classified": n, "unclassified": 0, "classification_rate": 100.0 if n else 0.0,
            "analysis_percent": pct(a.get("complete", 0)), "implementation_percent": pct(i.get("complete", 0)),
            "verification_percent": pct(v.get("verified", 0)), "confidence_average": 1.0}


def system_match(text, pats):
    return next((tag for tag, rx in pats if rx.search(text)), None)


def classify_system(recs, cfg, tags):
    scfg = cfg["system"]
    pats = [(p["tag"], re.compile(p["pattern"])) for p in scfg["patterns"]]
    sys_set = set(tags["system"])
    by_id = {r["id"]: r for r in recs}
    for r in recs:
        tag = next((t for t in r["tags"] if t in sys_set), None)
        if tag:
            r["_sys"], r["_how"] = tag, "tag"
            continue
        if not DEFAULT_NAME.match(r["_raw"]):
            ns = TEMPLATE.sub("", r["_ns"])
            hit = system_match(ns, pats) if ns else None
            hit = hit or system_match(TEMPLATE.sub("", r["_full"]), pats)
            if hit:
                r["_sys"], r["_how"] = hit, "name"
                continue
        r["_sys"], r["_how"] = None, "none"
    est = scfg.get("estimate", {})
    if est.get("calls"):
        callers = defaultdict(list)
        for r in recs:
            for c in r["calls"]:
                if c in by_id:
                    callers[c].append(r["id"])
        for _ in range(int(est.get("rounds", 2))):
            changes = []
            for r in recs:
                if r["_sys"]:
                    continue
                votes = Counter(o["_sys"] for o in (by_id.get(k) for k in r["calls"] + callers[r["id"]]) if o and o["_sys"])
                if votes:
                    cat, n = votes.most_common(1)[0]
                    if n >= est.get("minVotes", 2) and n / sum(votes.values()) >= est.get("minShare", 0.75):
                        changes.append((r, cat))
            if not changes:
                break
            for r, cat in changes:
                r["_sys"], r["_how"] = cat, "calls"
    if est.get("address"):
        gap = int(str(est.get("addressGap", "0x8000")), 16)
        order = sorted(recs, key=lambda r: (r["module"], r["_addr"]))
        known = [i for i, r in enumerate(order) if r["_sys"] and r["_how"] != "calls"]
        for i, r in enumerate(order):
            if r["_sys"]:
                continue
            j = bisect.bisect_left(known, i)
            if 0 < j < len(known):
                p, q = order[known[j - 1]], order[known[j]]
                if (p["_sys"] == q["_sys"] and p["module"] == r["module"] == q["module"]
                        and r["_addr"] - p["_addr"] < gap and q["_addr"] - r["_addr"] < gap):
                    r["_sys"], r["_how"] = p["_sys"], "address"


def stage_of(method, cls, stages, scfg):
    if DEFAULT_NAME.match(method):
        return "unnamed"
    if cls and method == cls:
        return scfg.get("constructor", "start")
    for sid, rx in stages:
        if rx.search(method):
            return sid
    return "other"


def load_types(pdir, module, area, cfg, tags, pats):
    tcfg = cfg["types"]
    excl = re.compile(tcfg["exclude_pattern"])
    default_field = re.compile(tcfg.get("default_field", "^$"))
    path = pdir / "types.jsonl"
    out = []
    if not path.exists():
        return out
    rel = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()
    own = None if area.get("classify") == "system" else re.compile(r"(^|/)" + re.escape(module) + r"(/|::|$)")
    sys_set = set(tags["system"])
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        t = json.loads(line)
        if t["k"] not in tcfg["kinds"] or excl.search(t["p"]):
            continue
        if own is not None and not own.search(t["p"]):
            continue
        desc = t.get("desc", "")
        words = set(re.findall(r"\b[A-Z][A-Z0-9_]{2,}\b", desc))
        ttags = sorted(w for w in words if w in tags["all"])
        prefixes = tuple({k.split("_")[0] + "_" for k in tags["all"]})
        unknown = sorted(w for w in words if w not in tags["all"] and prefixes and w.startswith(prefixes))
        size = t.get("size", 0) or 0
        fields = t.get("f", []) if t["k"] != "enum" else []
        named = [f for f in fields if f.get("n") and not default_field.match(f["n"])]
        covered = sum(f["l"] for f in named if "o" in f)
        status = next((tags["status"][x] for x in ttags if x in tags["status"]), None)
        if status is None:
            if t["k"] == "enum":
                status = "partial" if t.get("v") else "none"
            else:
                status = "partial" if named else "none"
        name = t["p"].split("/", 2)[-1] if t["p"].startswith("/Demangler/") else t["p"].lstrip("/")
        name = name.replace("/", "::")
        sys_tag = next((x for x in ttags if x in sys_set), None)
        how = "tag" if sys_tag else "none"
        if not sys_tag and area.get("classify") == "system":
            sys_tag = system_match(TEMPLATE.sub("", name), pats)
            how = "name" if sys_tag else "none"
        out.append({"path": t["p"], "name": name, "kind": t["k"], "size": size, "status": status, "tags": ttags, "unknown": unknown,
                    "sys": sys_tag, "how": how, "fields": len(fields), "named": len(named),
                    "coverage": round(min(covered, size) / size * 100, 1) if size and t["k"] == "struct" else None,
                    "line": lineno, "rel": rel})
    return out


def build(cfg=None):
    t0 = time.perf_counter()
    cfg = cfg or config()
    tags = load_tags(cfg)
    db = ROOT / cfg["db"]
    lib_rx = re.compile(cfg["lib_pattern"])
    trivial = cfg["trivial"]
    marker = cfg.get("orig_marker", "@orig")
    marks = orig_marks(cfg)
    names = group_names(cfg)
    stage_cfg = cfg.get("stage", {})
    stages = [(s["id"], re.compile(s["pattern"])) for s in stage_cfg.get("stages", [])]
    stage_names = {s["id"]: s["name"] for s in stage_cfg.get("stages", [])}
    stage_names["other"] = stage_cfg.get("other", "기타")
    stage_names["unnamed"] = stage_cfg.get("unnamed", "이름 없음")
    sys_pats = [(p["tag"], re.compile(p["pattern"])) for p in cfg["system"]["patterns"]]
    unclassified = cfg["system"].get("unclassified", "미분류")
    sys_label = lambda tag: tags["system_name"].get(tag, unclassified) if tag else unclassified
    functions, docs, issues, programs, types = [], {}, [], [], []
    for meta_path in sorted(db.rglob("meta.json")):
        pdir = meta_path.parent
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        module = meta["module"]
        programs.append(module)
        area = area_of(module, cfg)
        calls = {}
        for shard in sorted((pdir / "calls").glob("*.tsv")):
            for _, r in tsv_rows(shard):
                calls[r["caller"]] = [c if c.startswith("ext:") else f"{module}:{c}" for c in r["callees"].split(",") if c]
        plates = {}
        for shard in sorted((pdir / "comments").glob("*.jsonl")):
            for line in shard.read_text(encoding="utf-8").splitlines():
                o = json.loads(line)
                if o["t"] == "plate":
                    plates[o["a"]] = o["c"]
        for t in load_types(pdir, module, area, cfg, tags, sys_pats):
            t["module"], t["area"] = module, area
            types.append(t)
        for shard in sorted((pdir / "functions").glob("*.tsv")):
            rel = shard.relative_to(ROOT).as_posix() if shard.is_relative_to(ROOT) else shard.as_posix()
            for lineno, r in tsv_rows(shard):
                addr = r["addr"]
                fid = f"{module}:{addr}"
                ftags = [t for t in r["tags"].split(",") if t]
                ns = unclean(r["namespace"])
                raw = unclean(r["name"])
                full = f"{ns}::{raw}" if ns else raw
                size = int(r["size"])
                callees = calls.get(addr, [])
                status = next((tags["status"][t] for t in ftags if t in tags["status"]), "none")
                excl_tag = next((t for t in ftags if t in tags["exclude"]), None)
                excl = None
                if excl_tag:
                    excl = (tags["exclude"][excl_tag], excl_tag)
                elif lib_rx.search(full):
                    excl = ("외부 라이브러리", "lib_pattern")
                elif r["thunk"] == "1":
                    excl = ("thunk", "thunk(다른 함수로 바로 넘김)")
                elif size <= trivial["maxSize"] and len(callees) <= trivial["maxCalls"] and status == "none":
                    excl = ("작은 함수", f"크기 {size}B ≤ {trivial['maxSize']}, 호출 없음")
                plate = plates.get(addr, "")
                documents = []
                m = tags["doc_ref"].search(plate.split("\n", 1)[0]) if plate and tags["doc_ref"] else None
                if m:
                    documents.append({"path": m.group(1), "heading": f"§{m.group(2)}" if m.group(2) else "", "reason": "plate 주석",
                                      "excerpt": plate[:400], "confidence": 1.0})
                    d = docs.setdefault(m.group(1), {"id": m.group(1), "path": m.group(1), "title": m.group(1), "summary": "", "functions": [], "unresolved": []})
                    d["functions"].append(fid)
                impl = max((x["level"] for x in marks.get(fid, [])), key=lambda s: RANK[s], default="none")
                functions.append({
                    "id": fid, "module": module, "address": "0x" + addr, "name": (ns.split("::")[-1] + "::" if ns else "") + raw,
                    "size": size, "category": "", "subgroup": "", "subsystem": "", "tags": ftags, "confidence": 1.0,
                    "classification": "", "analysis": status, "implementation": impl, "verification": "none",
                    "sources": [{"path": rel, "line": lineno, "reason": "스냅샷 행"}],
                    "documents": documents, "features": [f"orig:{fid}"] if fid in marks else [],
                    "unresolved": [], "calls": callees, "subsystem_level": True,
                    "_namesrc": r["namesrc"], "_area": area, "_excl": excl, "_full": full, "_raw": raw, "_ns": ns,
                    "_addr": int(addr, 16), "_plate": plate, "_sig": unclean(r["signature"]), "_thunk": r["thunk"] == "1",
                    "_rel": rel, "_line": lineno})

    sys_set = set(tags["system"])

    def violation(rec, kind, text, path, line):
        iid = f"rule:{kind}:{rec['id']}" if rec else f"rule:{kind}:{path}:{line}"
        issues.append({"id": iid, "path": path, "line": line, "heading": f"규칙 위반 · {kind}", "text": text,
                       "functions": [rec["id"]] if rec else []})
        if rec:
            rec["unresolved"].append(iid)

    for f in functions:
        unknown = [t for t in f["tags"] if t not in tags["all"]]
        if unknown:
            violation(f, "정의 안 된 태그", f"{f['name']} ({f['id']}): {', '.join(unknown)}", f["_rel"], f["_line"])
        st = [t for t in f["tags"] if t in tags["status"]]
        if len(st) > 1:
            violation(f, "상태 태그 중복", f"{f['name']} ({f['id']}): {', '.join(st)}", f["_rel"], f["_line"])
        sy = [t for t in f["tags"] if t in sys_set]
        if len(sy) > 1:
            violation(f, "시스템 태그 중복", f"{f['name']} ({f['id']}): {', '.join(sy)}", f["_rel"], f["_line"])
        if sy and f["_area"].get("classify") != "system":
            violation(f, "시스템 태그 위치", f"{f['name']} ({f['id']}): {f['_area']['name']} 영역에는 시스템 태그를 붙이지 않는다", f["_rel"], f["_line"])
        need_plate = [t for t in st if t in tags["plate"]]
        if need_plate:
            head = f["_plate"].split("\n", 1)[0] if f["_plate"] else ""
            if not head:
                violation(f, "plate 주석 없음", f"{f['name']} ({f['id']}): {need_plate[0]} 인데 plate 주석이 없다", f["_rel"], f["_line"])
            elif not tags["plate_head"].match(head):
                violation(f, "plate 형식", f"{f['name']} ({f['id']}): 첫 줄 형식이 다르다(예: {tags['plate_example']}) — {head[:80]}", f["_rel"], f["_line"])
        if f["analysis"] == "pending":
            iid = f"recheck:{f['id']}"
            issues.append({"id": iid, "path": f["_rel"], "line": f["_line"], "heading": f"재확인 · {f['module']}",
                           "text": f"{f['name']} ({f['id']})\n{f['_plate']}".strip(), "functions": [f["id"]]})
            f["unresolved"].append(iid)
    known_ids = {f["id"] for f in functions}
    for fid, ms in marks.items():
        if fid not in known_ids:
            for x in ms:
                violation(None, "코드 표시 대상 없음", f"{marker} {fid}: 스냅샷에 없는 함수", x["path"], x["line"])
    for t in types:
        if t["unknown"]:
            violation(None, "정의 안 된 태그(타입)", f"{t['name']}: {', '.join(t['unknown'])}", t["rel"], t["line"])

    classify_system([f for f in functions if f["_area"].get("classify") == "system" and not f["_excl"]], cfg, tags)

    dcfg = cfg.get("dependencies", {})
    prefix = dcfg.get("external_prefix", "")
    target_areas = set(dcfg.get("target_areas", []))
    source_areas = set(dcfg.get("source_areas", []))
    index = defaultdict(list)
    for f in functions:
        if f["_area"]["id"] in target_areas and not f["_excl"]:
            index[TEMPLATE.sub("", f["_full"])].append(f)
    deps, used_by = defaultdict(set), defaultdict(set)
    dep_total, dep_hit = Counter(), Counter()
    for f in functions:
        if not f["_thunk"] or f["_area"]["id"] not in source_areas:
            continue
        ns = f["_ns"]
        if prefix and ns.startswith(prefix):
            ns = ns[len(prefix):]
        elif prefix and ns == prefix.rstrip(":"):
            ns = ""
        key = TEMPLATE.sub("", f"{ns}::{f['_raw']}" if ns else f["_raw"])
        if lib_rx.search(key) or key.startswith(f["module"] + "::"):
            continue
        dep_total[f["module"]] += 1
        hits = index.get(key, [])
        if hits:
            dep_hit[f["module"]] += 1
        for h in hits:
            deps[f["module"]].add(h["id"])
            used_by[h["id"]].add(f["module"])

    cat_names = {EXCLUDED: "제외(라이브러리·thunk·작은 함수)"}
    sys_order = tags["system"]
    for f in functions:
        ns, area = f["_ns"], f["_area"]
        top = ns.split("::")[0] if ns else ""
        parts = ns.split("::") if ns else []
        mode = area.get("classify", "none")
        if f["_excl"]:
            f["category"], f["subgroup"], why = EXCLUDED, f["_excl"][0], f["_excl"][1]
            f["subsystem"] = top or "(전역)"
        elif mode == "system":
            key = f["_sys"].lower() if f["_sys"] else "unclassified"
            f["category"] = f"{area['id']}.{key}"
            cat_names[f["category"]] = f"{area['name']} · {sys_label(f['_sys'])}"
            f["subgroup"], f["subsystem"] = HOW[f["_how"]], top or "(전역)"
            why = f"{area['name']} 분류: {sys_label(f['_sys'])} (근거: {HOW[f['_how']]})"
            if f["_how"] in ("calls", "address"):
                f["confidence"] = 0.5
        elif mode == "stage":
            cls = parts[1] if len(parts) > 1 else ""
            sid = stage_of(f["_raw"], cls, stages, stage_cfg)
            f["category"] = f"{area['id']}.{sid}"
            cat_names[f["category"]] = f"{area['name']} · {stage_names[sid]}"
            f["subgroup"], f["subsystem"] = f["module"], cls or "(전역)"
            why = f"{area['name']} 단계: {stage_names[sid]} (메서드 이름 {f['_raw']})"
        else:
            f["category"] = area["id"]
            cat_names[f["category"]] = area["name"]
            f["subgroup"], f["subsystem"] = f["module"], (parts[1] if len(parts) > 1 else top) or "(전역)"
            why = f"{area['name']} · 모듈 {f['module']}"
        extra = f"\n쓰는 모듈: {', '.join(sorted(used_by[f['id']]))}" if used_by.get(f["id"]) else ""
        f["classification"] = (f"{why}\n네임스페이스: {ns or '(전역)'} · 이름 출처: {f['_namesrc']} · 시그니처: {f['_sig']}{extra}"
                               + (f"\nplate 주석:\n{f['_plate']}" if f["_plate"] else "\nplate 주석 없음"))

    type_recs = []
    for t in types:
        area = t["area"]
        if area.get("classify") == "system":
            key = t["sys"].lower() if t["sys"] else "unclassified"
            cid, cname = f"type.{area['id']}.{key}", f"타입 · {area['name']} · {sys_label(t['sys'])}"
        else:
            cid, cname = f"type.{area['id']}", f"타입 · {area['name']}"
        cat_names[cid] = cname
        cov = f" · 필드 채움 {t['coverage']}%" if t["coverage"] is not None else ""
        type_recs.append({
            "id": f"type:{t['module']}:{t['path']}", "module": t["module"], "address": "0x0", "name": t["name"], "size": t["size"],
            "category": cid, "subgroup": HOW[t["how"]] if area.get("classify") == "system" else t["module"],
            "subsystem": t["kind"], "tags": t["tags"], "confidence": 1.0,
            "classification": f"{t['kind']} {t['path']} · 크기 {t['size']}B · 필드 {t['fields']}개(이름 있음 {t['named']}){cov}",
            "analysis": t["status"], "implementation": "none", "verification": "none",
            "sources": [{"path": t["rel"], "line": t["line"], "reason": "스냅샷 타입 행"}], "documents": [], "features": [],
            "unresolved": [], "calls": [], "subsystem_level": True})

    features = []
    for fid, ms in sorted(marks.items()):
        level = max((x["level"] for x in ms), key=lambda s: RANK[s])
        features.append({"id": f"orig:{fid}", "name": fid, "path": ms[0]["path"], "line": ms[0]["line"], "category": "",
                         "exports": [], "functions": [fid], "implementation": level, "verification": "none",
                         "evidence": [{"path": x["path"], "line": x["line"], "reason": f"{marker} {x['level']}"} for x in ms],
                         "tests": [], "verification_evidence": [], "origin": "orig", "stub": False})

    order = []
    for a in cfg["areas"]:
        mode = a.get("classify", "none")
        if mode == "system":
            order += [f"{a['id']}.{t.lower()}" for t in sys_order] + [f"{a['id']}.unclassified"]
        elif mode == "stage":
            order += [f"{a['id']}.{s}" for s, _ in stages] + [f"{a['id']}.other", f"{a['id']}.unnamed"]
        else:
            order.append(a["id"])
    order.append(EXCLUDED)
    for a in cfg["areas"]:
        if a.get("classify") == "system":
            order += [f"type.{a['id']}.{t.lower()}" for t in sys_order] + [f"type.{a['id']}.unclassified"]
        else:
            order.append(f"type.{a['id']}")
    groups = defaultdict(list)
    for f in functions + type_recs:
        groups[f["category"]].append(f)
    categories = [{"id": cid, "name": cat_names[cid], **stats(groups[cid])} for cid in order if groups.get(cid)]

    target = [f for f in functions if f["category"] != EXCLUDED]
    st = stats(target)
    excl = Counter(f["subgroup"] for f in groups[EXCLUDED])
    named = Counter("u" if f["_namesrc"] == "u" else "none" if DEFAULT_NAME.match(f["_raw"]) else "orig" for f in target)
    sys_recs = [f for f in target if f["_area"].get("classify") == "system"]
    how = Counter(f["_how"] for f in sys_recs)
    pct = lambda n, d: f"{n / d * 100:.1f}%" if d else "—"
    ia = Counter(f["implementation"] for f in target)
    tstat = Counter(t["status"] for t in types)
    struct_cov = [t["coverage"] for t in types if t["coverage"] is not None]
    by_id = {f["id"]: f for f in functions}
    all_deps = set().union(*deps.values()) if deps else set()
    dep_done = sum(1 for i in all_deps if by_id[i]["analysis"] == "complete")
    viol = sum(1 for i in issues if i["id"].startswith("rule:"))
    for mod, ids in deps.items():
        c = Counter(by_id[i]["analysis"] for i in ids)
        names.setdefault(mod, {"name": ""})
        names[mod].update({"deps": len(ids), "deps_complete": c.get("complete", 0), "deps_partial": c.get("partial", 0),
                           "deps_matched": dep_hit[mod], "deps_thunks": dep_total[mod]})
    other_excl = sum(v for k, v in excl.items() if k not in ("외부 라이브러리", "thunk", "작은 함수"))
    cards = [
        ["분석 대상 함수", st["functions"], f"전체 {len(functions):,} − 라이브러리 {excl['외부 라이브러리']:,} − thunk {excl['thunk']:,} − 작은 함수 {excl['작은 함수']:,} − 제외 태그 {other_excl:,}", True],
        ["분석 완료", st["analysis"].get("complete", 0), f"대상 중 {pct(st['analysis'].get('complete', 0), st['functions'])} · 부분 {st['analysis'].get('partial', 0):,} · 재확인 {st['analysis'].get('pending', 0):,}", True],
        ["구조체·타입", tstat.get("complete", 0), f"전체 {len(types):,} · 부분 {tstat.get('partial', 0):,} · 빈 자리표시 {tstat.get('none', 0):,} · 구조체 평균 필드 채움 {sum(struct_cov) / len(struct_cov) if struct_cov else 0:.1f}%", True],
        ["이름 있음", named.get("orig", 0) + named.get("u", 0), f"원본 심볼 {named.get('orig', 0):,} · 사용자 {named.get('u', 0):,} · FUN_ {named.get('none', 0):,} · {pct(named.get('orig', 0) + named.get('u', 0), st['functions'])}", False],
        ["시스템 분류", len(sys_recs) - how.get("none", 0), f"태그 {how.get('tag', 0):,} · 이름 {how.get('name', 0):,} · 주소 추정 {how.get('address', 0):,} · 호출 추정 {how.get('calls', 0):,} · 미분류 {how.get('none', 0):,}", False],
        ["모듈 간 의존", len(all_deps), f"의존 함수 분석 완료 {dep_done:,} ({pct(dep_done, len(all_deps))}) · thunk 매칭 {sum(dep_hit.values()):,}/{sum(dep_total.values()):,}", False],
        ["웹 구현", ia.get("complete", 0), f"full · partial {ia.get('partial', 0):,} · approx {ia.get('candidate', 0):,} · ref {ia.get('pending', 0):,} · {pct(ia.get('complete', 0), st['functions'])}", True],
        ["규칙 위반", viol, f"프로그램 {len(programs)}개 · 목록은 아래 '미확정' 탭", False],
    ]
    for f in functions:
        for k in [k for k in f if k.startswith("_")]:
            del f[k]
    progress = {
        "source": "ghidra", "version": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "fingerprint": stamp(cfg), "stats": st,
        "categories": categories, "documents": len(docs), "linked_documents": len(docs), "modules": len(programs),
        "title": cfg.get("title", "Progress Atlas"), "scan_seconds": round(time.perf_counter() - t0, 2), "cache_hits": 0, "cache_misses": 0,
        "denominators": {
            "analysis": "분모 = 전체 함수 − 외부 라이브러리 − thunk − 작은 함수 − 제외 태그. 분자 = status 축 complete 태그. 시스템 분류의 주소·호출 추정은 참고용",
            "implementation": f"분모는 분석과 같다. 분자 = 코드의 {marker} full 표시",
            "verification": "시험 보고서 연결 전",
        },
        "groups": names, "labels": LABELS, "cards": cards,
        "audit": {"inventory_matches": True, "indexes": [], "unmapped_sources": []},
    }
    return {"progress": progress, "functions": functions + type_recs, "features": features, "unresolved": issues,
            "documents": sorted(docs.values(), key=lambda d: d["path"])}
