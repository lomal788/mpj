"""mg0912 맵 nbmap(mg0912_map00) 의 점 그룹을 뽑아 JSON 으로 저장하고 DistanceToGoal 폴리라인 길이를 잰다.

좌표: nbmap 트랜스폼 pos 를 그대로 쓴다(자식 트랜스폼이 월드 좌표로 보이는 근거는 mg0912.md 4절).
출력: analysis/mgB_mg0912_course.json
"""
import json, os, math
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'extracted/converted/scene/nbmap/mg~mg0912__mg0912_map00.json')


def children(node):
    for c in node.get('components') or []:
        for ch in c.get('children') or []:
            yield ch


def tr(node):
    for c in node.get('components') or []:
        if c.get('kind') == 'transform':
            return c
    return None


def main():
    d = json.load(open(SRC, encoding='utf-8'))
    root = d['roots'][0]
    groups = {}
    for g in children(root):
        items = []
        for ch in children(g):
            t = tr(ch)
            col = [c.get('apx') for c in ch.get('components') or [] if c.get('kind') == 'collision']
            items.append({'name': ch['name'], 'pos': t and t['pos'], 'quat': t and t['quat'], 'scale': t and t['scale'],
                          'apx': col[0] if col else None,
                          'attr': next((c.get('attr') for c in ch.get('components') or [] if c.get('kind') == 'collision'), None)})
        gt = tr(g)
        groups[g['name']] = {'transform': gt and {'pos': gt['pos'], 'quat': gt['quat']}, 'items': items}
    dg = groups['Group_DistanceToGoal']['items']
    pts = [it['pos'] for it in dg]
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    out = {'groups': groups, 'distanceToGoal': {'count': len(pts), 'names': [it['name'] for it in dg][:3] + ['...'],
                                                'polylineLength': sum(seg), 'segMin': min(seg), 'segMax': max(seg)}}
    p = os.path.join(ROOT, 'analysis/mgB_mg0912_course.json')
    json.dump(out, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for k, v in groups.items():
        print(k, len(v['items']))
    print(json.dumps(out['distanceToGoal']))
    print('first/last', pts[0], pts[-1], '->', p)


if __name__ == '__main__':
    main()
