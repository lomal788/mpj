"""mgD: nbmap 이 가리키는 .apx 충돌 기하·재질을 엔티티(태그)별로 정리한다.

사용: .venv/Scripts/python tools/mgD_apx.py <nbmap> [<nbmap> ...] --out analysis/mgD_<이름>.json [--obj-dir DIR]
- nbmap 엔티티 이름·태그(ENTY+0x38 → u64 → u16 길이 + 문자열)·트랜스폼·apx 경로를 읽는다.
- apx 는 tools/scene_apx.py 의 Apx 로 읽고, MATERIAL(+0x30 dynamicFriction, staticFriction, restitution, +0x3C u16 flags, +0x3E u8 combine),
  SHAPE(+0x8C contactOffset 추정, +0x90 restOffset 추정) 값을 덧붙인다.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
from scene_apx import Apx, shapes, first_mesh, mesh_check, write_obj  # noqa: E402

BEA = ROOT / "extracted" / "bea"


def nb_str(b, p):
    if p == 0:
        return None
    end = b.index(0, p + 2)
    return b[p + 2:end].decode("utf-8", "replace")


def nb_entities(path):
    b = path.read_bytes()
    out = []

    def u64(o):
        return struct.unpack_from("<Q", b, o)[0]

    def ent(o, parent):
        if b[o:o + 4] != b"ENTY":
            return
        name = nb_str(b, u64(o + 0x20))
        tagp = u64(o + 0x38)
        tags = [nb_str(b, u64(tagp))] if tagp else []
        n = b[o + 0x40]
        e = {"name": name, "parent": parent, "tags": tags}
        kids = []
        for i in range(n):
            c = u64(o + 0x48 + 8 * i)
            t = struct.unpack_from("<I", b, c)[0]
            if t == 0:
                e["pos"] = list(struct.unpack_from("<3f", b, c + 4))
                e["quat"] = list(struct.unpack_from("<4f", b, c + 0x10))
                e["scale"] = list(struct.unpack_from("<3f", b, c + 0x20))
            elif t == 1:
                e["model"] = nb_str(b, u64(c + 8))
            elif t == 2:
                e["apx"] = nb_str(b, u64(c + 8))
                e["attr"] = list(b[c + 0x10:c + 0x14])
            elif t == 7:
                p, k = u64(c + 8), u64(c + 0x10)
                kids = [u64(p + 8 * j) for j in range(k)]
        out.append(e)
        for k in kids:
            ent(k, name)

    rp, rn = u64(0x20), u64(0x28)
    for i in range(rn):
        ent(u64(rp + 8 * i), None)
    return out


def apx_info(rel, obj_dir=None, obj_name=None):
    # 경로 규칙: "mg/mg1002/map/x.apx" → extracted/bea/mg~mg1002.nx.bea/mg/mg1002/map/x.apx
    parts = rel.split("/")
    arc = "~".join(parts[:2]) + ".nx.bea"
    p = BEA / arc / rel
    a = Apx(p.read_bytes())
    b = a.b
    mats = []
    for i, (_, t) in enumerate(a.manifest):
        if t == 8:
            o = a.obj(i)
            df, sf, rs = struct.unpack_from("<3f", b, o + 0x30)
            fl = struct.unpack_from("<H", b, o + 0x3C)[0]
            comb = b[o + 0x3E]
            mats.append({"dynamicFriction": df, "staticFriction": sf, "restitution": rs, "flags": fl, "combine": comb})
    shs = shapes(a)
    for s in shs:
        o = a.obj(s["index"])
        s["f8C"], s["f90"] = struct.unpack_from("<2f", b, o + 0x8C)
    ms = first_mesh(a)
    meshes = []
    good = []
    for m in ms:
        ok = all(mesh_check(m)) if m["type"] != "CONVEX_MESH" else m["ok"]
        v = m.get("vertices", [])
        aabb = None
        if v:
            mn = [min(x[k] for x in v) for k in range(3)]
            mx = [max(x[k] for x in v) for k in range(3)]
            aabb = [mn, mx]
        # 삼각형 법선의 y 성분 분포(바닥/벽 구분, 게임의 0.8660254 임계와 비교용)
        ny = []
        for tri in m.get("triangles", []):
            p0, p1, p2 = (v[k] for k in tri)
            ux, uy, uz = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
            vx, vy, vz = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
            nx, nyy, nz = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            ln = (nx * nx + nyy * nyy + nz * nz) ** 0.5 or 1.0
            ny.append(nyy / ln)
        floor = sum(1 for x in ny if abs(x) > 0.8660254)
        meshes.append({"type": m["type"], "ok": ok, "nbVertices": m.get("nbVertices"), "nbTriangles": m.get("nbTriangles"),
                       "aabb": aabb, "trisFloorLike(|ny|>cos30)": floor, "trisOther": len(ny) - floor})
        if ok:
            good.append(m)
    if obj_dir and good:
        Path(obj_dir).mkdir(parents=True, exist_ok=True)
        write_obj(Path(obj_dir) / obj_name, good)
    return {"objects": a.summary()["objects"], "materials": mats, "shapes": shs, "meshes": meshes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("nbmaps", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--obj-dir")
    a = ap.parse_args()
    res = {}
    for nb in a.nbmaps:
        p = Path(nb)
        ents = nb_entities(p)
        for e in ents:
            if e.get("apx"):
                e["apxInfo"] = apx_info(e["apx"], a.obj_dir, f"{p.stem}__{e['name']}.obj")
        res[p.name] = ents
    Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, ents in res.items():
        print("#", k)
        for e in ents:
            info = e.get("apxInfo")
            line = f"  {e['name']:<32} tags={e['tags']} pos={[round(x, 3) for x in e.get('pos', [])]}"
            if info:
                m = info["meshes"][0] if info["meshes"] else {}
                line += f" mat={[(round(x['dynamicFriction'], 3), round(x['staticFriction'], 3), round(x['restitution'], 3), x['combine']) for x in info['materials']]}"
                line += f" tri={m.get('nbTriangles')} floor={m.get('trisFloorLike(|ny|>cos30)')} aabb={[[round(v, 3) for v in r] for r in (m.get('aabb') or [])]}"
                line += f" shapes={[(s['geometry'], round(s['f8C'], 4), round(s['f90'], 4)) for s in info['shapes']]}"
            print(line)


if __name__ == "__main__":
    main()
