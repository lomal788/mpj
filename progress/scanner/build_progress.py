import sys
sys.dont_write_bytecode = True
from collections import Counter
from datetime import datetime, timezone
import argparse
import hashlib
import time
from common import APP, ROOT, Cache, read_json, write_json, relative, walk
from scan_functions import scan_functions
from scan_markdown import scan_markdown
from classify import classify
from scan_web import scan_web, checked_evidence
from scan_lock import ScanLock

STATES = {"none", "candidate", "partial", "complete", "pending"}


def apply_overrides(functions, overrides, categories):
    warnings = []
    for key, entry in overrides.get("functions", {}).items():
        f = functions.get(key)
        if not f:
            warnings.append({"function": key, "reason": "보정 대상 함수가 인덱스에 없음"})
            continue
        evidence = checked_evidence(entry.get("evidence", []))
        f["manual"] = {"note": entry.get("note", ""), "evidence": evidence}
        if entry.get("category") in categories:
            f.update(category=entry["category"], confidence=1.0, classification="수동 분류: " + entry.get("note", ""))
        for field in ("subgroup", "subsystem", "tags"):
            if field in entry:
                f[field] = entry[field]
        if entry.get("analysis") in STATES:
            f["analysis"] = entry["analysis"]
            if f["analysis"] == "complete" and not evidence:
                f["analysis"] = "pending"
                warnings.append({"function": key, "reason": "분석 완료 보정에 유효한 근거 파일 필요"})
    return warnings


def statistics(functions, features, unresolved):
    analysis = Counter(x["analysis"] for x in functions)
    impl = Counter(x["implementation"] for x in features)
    verification = Counter(x["verification"] for x in features)
    classified = sum(x["category"] != "unclassified" for x in functions)
    return {"functions": len(functions), "document_linked": sum(bool(x["documents"]) for x in functions),
            "analysis": dict(analysis), "features": len(features), "implementation": dict(impl),
            "verification": dict(verification), "unresolved": len(unresolved), "classified": classified,
            "unclassified": len(functions) - classified,
            "classification_rate": classified / len(functions) * 100 if functions else 0,
            "analysis_percent": analysis["complete"] / len(functions) * 100 if functions else 0,
            "implementation_percent": impl["complete"] / len(features) * 100 if features else None,
            "verification_percent": verification["verified"] / len(features) * 100 if features else None,
            "confidence_average": sum(x["confidence"] for x in functions) / len(functions) if functions else 0}


def input_paths(config):
    excluded = config["exclude_directories"]
    for folder, suffixes in (("analysis", {".tsv", ".md", ".c"}), ("docs", {".md"}),
                             ("ghidra_work", {".c"}), ("web", {".md", ".ts", ".js", ".mjs"})):
        for path in walk(ROOT / folder, suffixes, [x for x in excluded if x != "out"] if folder == "ghidra_work" else excluded):
            yield path
    if (ROOT / "README.md").exists():
        yield ROOT / "README.md"
    yield from sorted((APP / "config").glob("*.json"))
    overrides = read_json(APP / "config/overrides.json", {})
    entries = list(overrides.get("functions", {}).values()) + overrides.get("features", []) + overrides.get("verification", [])
    for entry in entries:
        for evidence in entry.get("evidence", []):
            path = (ROOT / evidence.get("path", "")).resolve()
            if path.is_relative_to(ROOT) and path.is_file():
                yield path


def fingerprint(config):
    records = []
    for p in input_paths(config):
        try:
            s = p.stat()
            records.append((relative(p), s.st_mtime_ns, s.st_size))
        except FileNotFoundError:
            continue
    return hashlib.sha256(repr(sorted(records)).encode()).hexdigest(), len(records)


def _build():
    start = time.perf_counter()
    config = read_json(APP / "config/categories.json")
    start_stamp, _ = fingerprint(config)
    overrides = read_json(APP / "config/overrides.json", {})
    cache = Cache()
    try:
        print("[scan] 함수 인덱스 / 디컴파일", flush=True)
        functions, names, addresses, audit = scan_functions(cache, config["exclude_directories"])
        print(f"[scan] 고유 함수 {len(functions):,}; 분석 문서 연결", flush=True)
        documents, unresolved, source_docs = scan_markdown(cache, functions, names, addresses, config["exclude_directories"])
        print("[scan] 기능 분류 / 웹 코드 연결", flush=True)
        catalog = classify(functions, config)
        audit["override_warnings"] = apply_overrides(functions, overrides, {x["id"] for x in config["categories"]})
        features = scan_web(cache, functions, names, addresses, source_docs, config["exclude_directories"])
        values = list(functions.values())
        categories = []
        for c in config["categories"]:
            subset = [x for x in values if x["category"] == c["id"]]
            web = [x for x in features if x["category"] == c["id"]]
            ids = {x["id"] for x in subset}
            issues = [x for x in unresolved if any(k in ids for k in x["functions"])]
            categories.append({"id": c["id"], "name": c["name"], **statistics(subset, web, issues)})
        total = statistics(values, features, unresolved)
        stamp, files = fingerprint(config)
        audit.update(inventory_matches=len(functions) == audit["index_unique_total"],
                     c_only_policy="TSV 인덱스를 분모로 사용. 모듈 불명/인덱스에 없는 C 헤더는 unmapped_sources로 별도 보고.")
        progress = {"version": datetime.now(timezone.utc).isoformat(), "fingerprint": start_stamp, "input_changed_during_scan": start_stamp != stamp, "stats": total,
                    "categories": categories, "minigames": catalog, "identified_minigames": len({x["minigame"] for x in values if x["minigame"]}),
                    "documents": len(documents), "linked_documents": sum(bool(x["functions"]) for x in documents),
                    "modules": len(audit["indexes"]), "audit": audit, "cache_hits": cache.hits,
                    "cache_misses": cache.misses, "watched_files": files,
                    "denominators": {"analysis": "모듈 + 정규화 주소로 중복 제거한 함수 TSV 인덱스 전체",
                                     "implementation": "자동 발견한 export 코드 단위 + 수동 등록한 구현 대상 기능. 전체 포팅 요구 기능 목록은 아직 확정되지 않음.",
                                     "verification": "동일한 식별 기능 전체 중 테스트와 원본 비교 근거가 확인된 기능. 테스트 파일 존재는 통과가 아님.",
                                     "exclusions": "progress 자체, 의존성/라이브러리, 빌드/임시 산출물, 외부 도구 매뉴얼"}}
        for name, data in (("functions", values), ("documents", documents), ("features", features),
                           ("categories", categories), ("unresolved", unresolved)):
            write_json(APP / f"data/{name}.json", data)
        progress["scan_seconds"] = round(time.perf_counter() - start, 3)
        # Publish manifest last; requests read one immutable server snapshot.
        write_json(APP / "data/progress.json", progress)
        write_json(APP / "reports/scan.json", {k: v for k, v in progress.items() if k != "minigames"})
        print(f'[scan] 완료 {progress["scan_seconds"]}s · 문서 {len(documents)} · 웹 기능 {len(features)} · 캐시 {cache.hits}/{cache.misses}', flush=True)
        return progress
    finally:
        cache.close()


def build():
    with ScanLock() as acquired:
        if not acquired:
            return None
        return _build()


if __name__ == "__main__":
    argparse.ArgumentParser(description="MPJ 읽기 전용 진행률 스캔").parse_args()
    if build() is None:
        print("다른 스캐너가 실행 중입니다. 기존 데이터로 대시보드를 볼 수 있습니다.", flush=True)
