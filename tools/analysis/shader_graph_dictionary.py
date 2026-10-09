"""그래프 옵션 튜플의 SHA-256 사전 조회·검증·대상 재질 재결합. 14_shader_graphs.md §3~4."""
import copy
import hashlib
import json
import re
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parents[3] / "analysis/mat/graphs"
PREFIXES = ("fragment_shader_graph_", "vertex_shader_graph_")


def graph_options(options):
    return dict(sorted((k, str(v)) for k, v in options.items() if k.startswith(PREFIXES)))


def graph_id(options):
    raw = json.dumps(graph_options(options), sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def load_definition(options, directory=None):
    ident = graph_id(options)
    path = Path(directory or DIRECTORY) / f"{ident}.json"
    if not path.exists():
        return None
    record = json.loads(path.read_text(encoding="utf-8"))
    if record.get("version") != 1 or record.get("options") != graph_options(options):
        raise ValueError(f"그래프 사전 키/버전 불일치: {path}")
    if record.get("status") == "pending":
        return None
    if record.get("status") not in ("decoded", "approx") or not isinstance(record.get("graph"), dict):
        raise ValueError(f"그래프 사전 상태/정의 불일치: {path}")
    graph = copy.deepcopy(record["graph"])
    needed = set(re.findall(r'T\(\s*"([^"]+)"\s*,', json.dumps(graph).replace('\\"', '"')))
    missing = needed - set(graph.get("samplers", {}))
    if missing:
        raise ValueError(f"그래프 사전 샘플러 누락 {sorted(missing)}: {path}")
    graph["program"] = f"graph:{ident}"
    return graph


def bind_definition(graph, material, model):
    tex = {}
    for s in material.get("samplers", []):
        tex[s["sampler"]] = s.get("texture")
        for slot in s.get("slots", []):
            tex[slot] = s.get("texture")
    result = copy.deepcopy(graph)
    missing = [k for k, v in graph["samplers"].items() if not k.startswith("@") and k not in tex and v is not None]
    if missing:
        raise ValueError(f"그래프 대상 샘플러 누락 {missing}: {material.get('name')}/{model}")
    result["samplers"] = {k: (v if k.startswith("@") else tex.get(k)) for k, v in graph["samplers"].items()}
    result["material"] = material["name"]
    result["models"] = [model]
    return result
