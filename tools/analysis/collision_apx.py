"""충돌 에셋 처리기(범용) — 원본 아카이브의 nbmap 충돌 엔티티 → <out>/physics.json + <out>/apx/<원본 이름>.apx(바이트 그대로).
런타임(script/game/lib/physx·collision-physx)이 .apx 를 직접 읽는다(원본 BVH33 RTree 그대로). 설계: web/docs/engine/11_moving_collision.md §9.5.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/collision_apx.py <아카이브> --out <폴더> [--nbmap 이름,...]
    예: menu~menu00 --out web/assets/plaza/world/physics
        mg~mg0122  --out web/assets/mg/mg0122/physics

physics.json = { format: "mpj.physics", version: 1, archive, entities: [ { nbmap, name, tag, attr[4], layer, pos[3], quat[4], scale[3], apx } ] }
  pos·quat·scale = nbmap 트랜스폼을 부모부터 곱한 world 행렬의 분해(06_scene_data §3.3 [미확정]: 부모 기준 곱셈 가정은 asset_convert.nbmap_entities 와 같다)
  layer = attr[1] − 2 (attr[1] ≥ 2), 아니면 null — mg0912 §4.10 의 비트 = 1 << (attr − 2) [추정]
같은 입력이면 같은 바이트를 쓴다. 원본·extracted 는 읽기만 한다.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scene_nbmap  # noqa: E402
from asset_convert import mat_to_tq, trs  # noqa: E402

BEA = ROOT / "extracted" / "bea"


def entities(path):
    nb = scene_nbmap.Nbmap(Path(path).read_bytes())
    doc = nb.parse()
    out = []

    def walk(e, pm):
        if "ref" in e:
            return
        m = pm
        comps = {}
        for c in e["components"]:
            comps.setdefault(c["kind"], []).append(c)
            if c["kind"] == "transform":
                m = pm @ trs(c["pos"], c["quat"], c["scale"])
        tag = nb.s(nb.u64(e["h30"][1])) if e["h30"][1] else None
        for c in comps.get("collision", []):
            out.append((e["name"], tag, m, c))
        for c in comps.get("children", []):
            for ch in c["children"]:
                walk(ch, m)
    for r in doc["roots"]:
        walk(r, np.eye(4))
    return out


def build(root, archive, put, names=None, log=print):
    ents = []
    copied = {}
    for p in sorted(Path(root).rglob("*.nbmap")):
        if names is not None and p.stem not in names:
            continue
        for name, tag, m, c in entities(p):
            src = Path(root) / c["apx"]
            if not src.exists():
                log(f"  없음: {c['apx']} ({p.stem}/{name})")
                continue
            rel = f"apx/{src.name}"
            b = src.read_bytes()
            if rel not in copied:
                put(rel, b)
                copied[rel] = hashlib.sha1(b).hexdigest()
            t, q = mat_to_tq(m)
            scale = [float(np.linalg.norm(m[:3, k])) for k in range(3)]
            attr = list(c["attr"])
            ents.append({"nbmap": p.stem, "name": name, "tag": tag, "attr": attr, "layer": attr[1] - 2 if attr[1] >= 2 else None,
                         "pos": [round(float(x), 6) for x in t], "quat": [round(float(x), 7) for x in q], "scale": [round(x, 6) for x in scale],
                         "apx": rel, "sha1": copied[rel]})
    doc = {"format": "mpj.physics", "version": 1, "archive": archive, "entities": ents}
    if ents:
        put("physics.json", (json.dumps(doc, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive", help="예: menu~menu00 (extracted/bea/<이름>.nx.bea)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--nbmap", help="쉼표로 구분한 nbmap 이름(확장자 없이). 없으면 전부")
    a = ap.parse_args()
    root = BEA / f"{a.archive}.nx.bea"
    if not root.is_dir():
        raise SystemExit(f"아카이브 없음: {root}")
    names = set(a.nbmap.split(",")) if a.nbmap else None
    out = Path(a.out)

    def put(rel, data):
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists() or dst.read_bytes() != data:
            dst.write_bytes(data)

    doc = build(root, a.archive, put, names)
    print(f"{a.archive}: 엔티티 {len(doc['entities'])}, apx {len({e['apx'] for e in doc['entities']})} -> {out}")


if __name__ == "__main__":
    main()
