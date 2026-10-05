"""mg0911/mg0912 의 nbmap 충돌 엔티티 → apx(형상·재질·강체 종류·AABB)를 한 표로 묶는다.

입력: extracted/converted/scene/nbmap/mg~mgXXXX__*.json(tools/scene_nbmap.py 결과), extracted/bea/.../*.apx
재질 필드는 06_scene_data.md 5.1(Material +0x30 dynamicFriction, staticFriction, restitution, +0x3C u16 flags, +0x3E u8 combine).
출력: analysis/mgB_apx.json, 요약 표준출력.
"""
import json, os, struct, sys, glob
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, 'web', 'tools', 'analysis'))
import scene_apx as S


def info(path):
    b = open(path, 'rb').read()
    a = S.Apx(b)
    mats, actors = [], []
    for i, (_, t) in enumerate(a.manifest):
        o = a.obj(i)
        if t == 8:
            df, sf, r = struct.unpack_from('<3f', b, o + 0x30)
            mats.append({'dynamicFriction': round(df, 4), 'staticFriction': round(sf, 4), 'restitution': round(r, 4),
                         'flags': struct.unpack_from('<H', b, o + 0x3C)[0], 'combine': b[o + 0x3E]})
        elif t in (5, 6):
            actors.append(S.tname(t))
    meshes = S.leading_meshes(a)
    aabbs = []
    for m in meshes:
        v = m.get('vertices')
        if v:
            mn = [min(p[k] for p in v) for k in range(3)]
            mx = [max(p[k] for p in v) for k in range(3)]
            aabbs.append({'nV': m['nbVertices'], 'nT': m['nbTriangles'], 'min': [round(x, 3) for x in mn], 'max': [round(x, 3) for x in mx]})
    return {'actors': actors, 'materials': mats, 'shapes': S.shapes(a), 'meshes': aabbs}


def walk(node, out, game):
    comps = node.get('components') or []
    for c in comps:
        p = c.get('apx') or c.get('path') if isinstance(c, dict) else None
        if isinstance(p, str) and p.endswith('.apx'):
            out.append((node.get('name'), p, c.get('attr'), node))
    for c in comps:
        for ch in c.get('children') or []:
            walk(ch, out, game)


def main():
    res = {}
    for game in ('mg0911', 'mg0912'):
        res[game] = {}
        for f in sorted(glob.glob(os.path.join(ROOT, f'extracted/converted/scene/nbmap/mg~{game}__*.json'))):
            d = json.load(open(f, encoding='utf-8'))
            found = []
            roots = d.get('roots') or d.get('entities') or [d]
            for r in roots:
                walk(r, found, game)
            nb = os.path.basename(f)[len(f'mg~{game}__'):-5]
            rows = []
            for name, p, attr, node in found:
                ap = os.path.join(ROOT, f'extracted/bea/mg~{game}.nx.bea', p)
                try:
                    inf = info(ap)
                except Exception as e:
                    inf = {'error': str(e)}
                rows.append({'entity': name, 'apx': p, 'attr': attr, **inf})
            res[game][nb] = rows
    out = os.path.join(ROOT, 'analysis/mgB_apx.json')
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for g, nbs in res.items():
        for nb, rows in nbs.items():
            for r in rows:
                if g == 'mg0912' and nb == 'mg0912_map00' and len(rows) > 40:
                    pass
                mats = ';'.join(f"df{m['dynamicFriction']} sf{m['staticFriction']} e{m['restitution']} c{m['combine']}" for m in r.get('materials', []))
                sh = ','.join(s['geometry'] if isinstance(s['geometry'], str) else str(s['geometry']) for s in r.get('shapes', []))
                mm = ' '.join(f"[{m['nT']}t {m['min']}..{m['max']}]" for m in r.get('meshes', [])[:2])
                print(g, nb, r['entity'], r.get('attr'), '/'.join(r.get('actors', [])), sh, mats, mm, r.get('error', ''))
    print('->', out)


if __name__ == '__main__':
    main()
