from collections import defaultdict
from bisect import bisect_right
import re
from common import ROOT, relative, address, tsv, walk, default_module, APP, read_json

HEADER = re.compile(r"^//\s*====\s*(?:0x)?([0-9a-fA-F]+)\s+(.+)$", re.M)


def parse_c(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    matches = list(HEADER.finditer(text))
    newlines = [m.start() for m in re.finditer("\n", text)]
    result = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[match.end():end]
        result.append({"address": address(match[1]), "name": re.sub(r"\s+\(dec\)$", "", match[2]).strip(),
                       "line": bisect_right(newlines, match.start()) + 1,
                       "calls": sorted(set(address(x) for x in re.findall(r"\bFUN_([0-9a-fA-F]{10,16})\s*\(", body)))})
    return result


def scan_functions(cache, excluded):
    functions = {}
    counts = []
    warnings = []
    names = defaultdict(set)
    by_address = defaultdict(set)
    for path in sorted((ROOT / "analysis/functions").glob("*.tsv")):
        rows = cache.parse(path, tsv)
        module = path.stem.lower()
        index_path = relative(path)
        valid = duplicates = 0
        for line, row in enumerate(rows, 2):
            try:
                addr = address(row["address"])
            except (KeyError, ValueError):
                warnings.append({"path": relative(path), "line": line, "reason": "유효하지 않은 함수 주소"})
                continue
            valid += 1
            key = f"{module}:{addr}"
            if key in functions:
                duplicates += 1
                continue
            function = {"id": key, "module": module, "address": addr, "name": row.get("name", addr),
                        "size": int(row.get("size", "0") or 0), "index": {"path": index_path, "line": line},
                        "sources": [], "documents": [], "features": [], "unresolved": [], "calls": [],
                        "analysis": "none", "implementation": "none", "verification": "none"}
            functions[key] = function
            names[function["name"]].add(key)
            by_address[addr].add(key)
        counts.append({"module": module, "rows": len(rows), "valid": valid, "unique": valid - duplicates, "duplicates": duplicates})
    # Additional indexes are read as source associations; the TSV inventory remains
    # the audited denominator. C-only functions are explicitly reported separately.
    index_path = ROOT / "analysis/decomp/INDEX.tsv"
    indexed_files = defaultdict(dict)
    if index_path.exists():
        for row in cache.parse(index_path, tsv):
            indexed_files[row.get("file", "")][row.get("address", "").lower()] = row.get("name", "")
    overrides = read_json(APP / "config/overrides.json", {})
    unmapped = []
    for folder in (ROOT / "analysis/decomp", ROOT / "ghidra_work"):
        for path in walk(folder, {".c"}, [x for x in excluded if x != "out"]):
            rel = relative(path)
            module_match = re.search(r"([\w-]+\.(?:nso|nro))\.c$", path.name, re.I)
            module = overrides.get("source_modules", {}).get(rel) or (module_match[1].lower() if module_match else default_module(path))
            for record in cache.parse(path, parse_c):
                addr = record["address"]
                key = f"{module}:{addr}" if module else None
                if key not in functions:
                    candidates = names.get(record["name"], set()) & by_address.get(addr, set())
                    key = next(iter(candidates)) if len(candidates) == 1 else None
                if not key:
                    unmapped.append({"path": rel, "address": addr, "name": record["name"], "reason": "모듈 또는 인덱스 함수 연결 불명"})
                    continue
                f = functions[key]
                source = {"path": rel, "line": record["line"], "confidence": 1 if module else .95}
                if source not in f["sources"]:
                    f["sources"].append(source)
                f["calls"] = sorted(set(f["calls"]) | {f'{f["module"]}:{a}' for a in record["calls"] if f'{f["module"]}:{a}' in functions})
    return functions, names, by_address, {"indexes": counts, "warnings": warnings, "unmapped_sources": unmapped,
                                         "index_unique_total": sum(x["unique"] for x in counts)}
