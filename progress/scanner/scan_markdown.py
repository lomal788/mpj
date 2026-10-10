from collections import defaultdict
import re
from common import ROOT, ADDRESS, relative, address, walk, default_module, line_module

UNCERTAIN = re.compile(r"미확정|판독 필요|TODO|추정|미검증|추가 분석|확인 필요", re.I)
SYMBOL = re.compile(r"(?:[A-Za-z_]\w*::)+[~A-Za-z_]\w*")
NEGATIVE = re.compile(r"미완료|완료.{0,24}(?:아님|아니|없|못|처리하지|판정하지)|(?:분석|판독).{0,10}(?:안 했|하지 않|하지 않았|미완료)")


def parse_markdown(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    lines = text.splitlines()
    title = next((x.lstrip("# ") for x in lines if x.startswith("#")), path.stem)
    module = default_module(path, text)
    sections = []
    start = 0
    heading = title
    for i, line in enumerate(lines):
        if line.startswith("#"):
            if i > start:
                sections.append({"line": start + 1, "heading": heading, "lines": lines[start:i]})
            start, heading = i, line.lstrip("# ")
    sections.append({"line": start + 1, "heading": heading, "lines": lines[start:]})
    return {"id": relative(path), "path": relative(path), "title": title, "default_module": module,
            "summary": " ".join(x.strip() for x in lines[1:9] if x.strip())[:600], "sections": sections}


def resolve_line(line, fallback, functions, names, by_address):
    result = {}
    # Match each address using its local clause, so a line can contain both main
    # and a minigame without attributing every address to main.
    addresses = list(ADDRESS.finditer(line))
    current_module = fallback
    for i, match in enumerate(addresses):
        begin = addresses[i - 1].end() if i else 0
        context = line[begin:match.start()]
        module = line_module(context, current_module)
        current_module = module
        addr = address(match[1])
        key = f"{module}:{addr}" if module else None
        if key in functions:
            result[key] = {"kind": "module_address", "confidence": 1.0}
        elif not module and len(by_address.get(addr, ())) == 1:
            result[next(iter(by_address[addr]))] = {"kind": "unique_address", "confidence": .9}
    for symbol in SYMBOL.findall(line):
        candidates = names.get(symbol, set())
        if fallback:
            local = {x for x in candidates if functions[x]["module"] == fallback}
            candidates = local or candidates
        if len(candidates) == 1:
            result.setdefault(next(iter(candidates)), {"kind": "unique_symbol", "confidence": .95})
    return result


def scan_markdown(cache, functions, names, by_address, excluded):
    documents = []
    unresolved = []
    source_docs = defaultdict(list)
    # Application docs and analysis notes; bundled third-party manuals are not
    # analysis evidence and are excluded from the denominator.
    paths = list(walk(ROOT / "analysis", {".md"}, excluded)) + list(walk(ROOT / "docs", {".md"}, excluded)) + list(walk(ROOT / "web", {".md"}, excluded))
    if (ROOT / "README.md").exists():
        paths.append(ROOT / "README.md")
    for path in sorted(set(paths)):
        raw = cache.parse(path, parse_markdown)
        raw["default_module"] = default_module(path, "\n".join(line for section in raw["sections"] for line in section["lines"]))
        doc = {k: v for k, v in raw.items() if k != "sections"}
        doc["functions"] = []
        doc["unresolved"] = []
        seen = set()
        for section in raw["sections"]:
            joined = "\n".join(section["lines"])
            meaningful = len(joined) > 180 and bool(re.search(r"판독|동작|계산|호출|반환|분석|상태|parameter|return", joined, re.I)) and not re.search(r"자료 위치|참고 자료|분석 대상", section["heading"])
            for offset, line in enumerate(section["lines"]):
                lineno = section["line"] + offset
                matches = resolve_line(line, raw["default_module"], functions, names, by_address)
                for key, match in matches.items():
                    token = (key, section["line"])
                    if token in seen:
                        continue
                    seen.add(token)
                    # A general document status never promotes all referenced functions.
                    complete = bool(re.search(r"(?:함수|해당 함수).{0,24}(?:분석|판독)\s*완료", line)) and not UNCERTAIN.search(line) and not NEGATIVE.search(line)
                    state = "complete" if complete else ("partial" if meaningful else "candidate")
                    link = {"document": doc["id"], "path": doc["path"], "line": lineno,
                            "heading": section["heading"], "excerpt": line[:700], "state": state, **match}
                    functions[key]["documents"].append(link)
                    doc["functions"].append(key)
                    ranking = {"none": 0, "candidate": 1, "partial": 2, "complete": 3}
                    if ranking[state] > ranking[functions[key]["analysis"]]:
                        functions[key]["analysis"] = state
                resolved = re.search(r"(?:미확정|추정).{0,15}(?:해소|해결|확정으로|판독으로|데이터로)|기존.{0,16}추정.{0,20}(?:올린다|올린|확정)", line)
                if UNCERTAIN.search(line) and line.strip() and not line.lstrip().startswith("#") and not resolved and not re.match(r"^(?:확정 수준|.*다음 표현|.*표현을 인식)", line):
                    item = {"id": f'{doc["id"]}:{lineno}', "path": doc["path"], "line": lineno,
                            "heading": section["heading"], "text": line.strip()[:1000], "functions": list(matches)}
                    unresolved.append(item)
                    doc["unresolved"].append(item["id"])
                    # Link only the exact line's functions, not the whole document.
                    for key in matches:
                        functions[key]["unresolved"].append(item["id"])
                for ref in re.findall(r"(?:web/)?(?:script|tools)/[\w./-]+\.(?:ts|js|py)", line):
                    normalized = ref if ref.startswith("web/") else "web/" + ref
                    source_docs[normalized].append({"path": doc["path"], "line": lineno, "reason": "문서의 명시적 코드 경로"})
        doc["functions"] = sorted(set(doc["functions"]))
        documents.append(doc)
    return documents, unresolved, source_docs
