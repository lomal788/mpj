from collections import defaultdict
from pathlib import Path
import hashlib
import json
import re
import subprocess
from common import ROOT, APP, read_json, write_json, relative, walk, default_module
from scan_markdown import resolve_line


def parse_web(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    exports = re.findall(r"export\s+(?:async\s+)?(?:function|class|const)\s+(\w+)", text)
    imports = re.findall(r"(?:from\s*|import\s*)['\"]([^'\"]+)['\"]", text)
    return {"path": relative(path), "lines": text.splitlines(), "exports": exports,
            "imports": imports, "hash": hashlib.sha256(text.encode()).hexdigest(),
            "stub": bool(re.search(r"throw new Error\(['\"](?:TODO|not implemented)|\bstub\b|미구현", text, re.I))}


def structures(paths):
    saved = read_json(APP / ".cache/source-structure.json", {})
    changed = []
    stamps = {}
    for path in paths:
        if not relative(path).startswith("web/script/"):
            continue
        stat = path.stat()
        key = relative(path)
        stamp = f"{stat.st_mtime_ns}:{stat.st_size}"
        stamps[key] = stamp
        if saved.get(key, {}).get("stamp") != stamp:
            changed.append(key)
    if changed:
        proc = subprocess.run(["node", str(APP / "scanner/analyze_sources.mjs")], input=json.dumps(changed),
                              cwd=APP, capture_output=True, text=True, encoding="utf-8", timeout=60)
        if proc.returncode != 0:
            raise RuntimeError("TypeScript 소스 구조 분석 실패: " + proc.stderr[:600])
        for key, record in json.loads(proc.stdout).items():
            saved[key] = {"stamp": stamps[key], **record}
        write_json(APP / ".cache/source-structure.json", saved)
    return saved


def checked_evidence(items):
    result = []
    for item in items:
        if not isinstance(item, dict) or not item.get("path") or not item.get("reason"):
            continue
        path = (ROOT / item["path"]).resolve()
        if path.is_relative_to(ROOT) and path.is_file():
            result.append(item)
    return result


def scan_web(cache, functions, names, by_address, source_docs, excluded):
    features = []
    test_imports = defaultdict(list)
    web_paths = list(walk(ROOT / "web", {".ts", ".js", ".mjs"}, excluded))
    structure_by_path = structures(web_paths)
    for path in web_paths:
        if not re.search(r"(?:/test_|/test/|/tests/|check_|smoke)", relative(path)):
            continue
        record = cache.parse(path, parse_web)
        for spec in record["imports"]:
            if spec.startswith("."):
                target = (path.parent / spec).resolve()
                for extension in (".ts", ".js", ".mjs"):
                    candidate = target.with_suffix(extension)
                    if candidate.is_relative_to(ROOT):
                        test_imports[relative(candidate)].append({"path": relative(path), "reason": "테스트가 해당 소스를 import (통과 여부 미확인)"})
    for path in web_paths:
        rel = relative(path)
        # Source modules with explicit public exports define a discoverable web
        # code unit, not a guarantee that all desired game features are identified.
        if not rel.startswith("web/script/") or "/lib/" in rel:
            continue
        record = cache.parse(path, parse_web)
        if not record["exports"]:
            continue
        code_matches = {}
        module = default_module(path)
        if not module and ("/core/" in rel or "/engine/" in rel):
            module = "main.nso"
        # Scan comments/references only, never promote arbitrary numeric literals.
        for lineno, line in enumerate(record["lines"], 1):
            if re.search(r"原本|원본|판독|@0x|FUN_71|::", line):
                for key, match in resolve_line(line, module, functions, names, by_address).items():
                    code_matches.setdefault(key, {"path": rel, "line": lineno, "reason": "원본 함수 명시적 참조", **match})
        # Infer default module from explicit document links in the source header.
        evidence = source_docs.get(rel, [])
        structure = structure_by_path.get(rel, {})
        state = "partial" if code_matches and not record["stub"] and structure.get("executable_members", 0) > 0 else "candidate"
        related = list(code_matches)
        related_categories = [functions[k]["category"] for k in related]
        category = max(set(related_categories), key=related_categories.count) if related_categories else path_category(rel)
        feature = {"id": rel, "name": path.stem, "path": rel, "exports": record["exports"], "functions": related,
                   "category": category, "implementation": state, "verification": "none", "stub": record["stub"],
                   "evidence": list(code_matches.values()) + evidence, "tests": test_imports.get(rel, []),
                   "verification_evidence": [], "origin": "auto_source_unit"}
        feature["structure"] = structure
        feature["source_hash"] = record.get("hash") or hashlib.sha256("\n".join(record["lines"]).encode()).hexdigest()
        feature["assessment"] = {
            "basis": "원본 함수 명시적 참조 + 실행 본문이 있는 export 함수/클래스" if state == "partial" else "export 코드 단위 발견; 원본 기능 대응은 미확인",
            "missing": ["원본 동작과 웹 코드의 분기/상태/수식 대응 확인", "해당 기능에 대한 테스트 통과 기록", "원본 실행 결과 비교"],
            "automatic": True,
            "warning": "실행 본문과 원본 참조가 있어도 기능 전체 구현 완료를 뜻하지 않습니다."}
        features.append(feature)
    config = read_json(APP / "config/overrides.json", {})
    by_id = {x["id"]: x for x in features}
    for custom in config.get("features", []):
        if not custom.get("id"):
            continue
        evidence = checked_evidence(custom.get("evidence", []))
        status = custom.get("implementation", "candidate")
        if status == "complete" and not evidence:
            status = "pending"
        entry = {"name": custom["id"], "path": "", "exports": [], "functions": [], "category": "unclassified",
                 "stub": False, "tests": [], "verification": "none", "verification_evidence": [], **custom,
                 "implementation": status, "evidence": evidence, "origin": "manual"}
        entry["functions"] = [x for x in entry["functions"] if x in functions]
        by_id[entry["id"]] = entry
    for verification in config.get("verification", []):
        feature = by_id.get(verification.get("feature"))
        evidence = checked_evidence(verification.get("evidence", []))
        reports = []
        if feature:
            for item in evidence:
                path = ROOT / item["path"]
                if path.suffix != ".json":
                    continue
                try:
                    report = read_json(path, {})
                    if (report.get("format") == "mpj-progress-verification-v1" and report.get("result") == "passed"
                        and feature["id"] in report.get("features", []) and report.get("source_hash") == feature.get("source_hash")
                        and report.get("kind") == ("original_execution_comparison" if verification.get("status") == "verified" else "automated_test")):
                        reports.append(item)
                except (ValueError, AttributeError):
                    continue
        if feature and reports and verification.get("status") in ("tested", "verified"):
            feature["verification"] = verification["status"]
            feature["verification_evidence"] = reports
        elif feature and verification.get("status") in ("tested", "verified"):
            feature["verification_pending"] = "통과 기록·기능 ID·소스 해시·검증 종류가 맞는 JSON 보고서가 필요합니다."
    ranking = {"none": 0, "pending": 1, "candidate": 2, "partial": 3, "complete": 4}
    veranking = {"none": 0, "tested": 1, "verified": 2}
    for feature in by_id.values():
        for key in feature["functions"]:
            f = functions[key]
            f["features"].append(feature["id"])
            if ranking.get(feature["implementation"], 0) > ranking.get(f["implementation"], 0):
                f["implementation"] = feature["implementation"]
            if veranking.get(feature["verification"], 0) > veranking.get(f["verification"], 0):
                f["verification"] = feature["verification"]
    return list(by_id.values())


def path_category(path):
    rules = [("camera", "camera"), ("network", "online|/net/|socket"), ("physics", "collision|physics"),
             ("animation", "skin|anim"), ("audio", "sound|audio|bgm|seq"), ("graphics", "render|shader|plazaGl|effect"),
             ("character", "character|actor|setplayer"), ("ui", "Ui|/ui|hud|lyt|dialog|msgwin"),
             ("minigames", "minigame|mg180|mgscene|mgresult"), ("assets", "assets|save|cache|load"),
             ("logic", "flow|rule|round"), ("engine", "/core/")]
    return next((cat for cat, pattern in rules if re.search(pattern, path, re.I)), "unclassified")
