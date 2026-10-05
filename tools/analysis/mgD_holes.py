"""mgD: 바닥 메시(윗면) 경계 루프 = 구멍 찾기. 사용: mgD_holes.py <obj> <윗면 y> [허용오차]
윗면(|y - top| < tol 인 삼각형)만 모아 경계 간선을 루프로 묶고, 각 루프의 중심·지름(최대 폭)을 낸다."""
import sys, math, json
from collections import defaultdict
path, top = sys.argv[1], float(sys.argv[2])
tol = float(sys.argv[3]) if len(sys.argv) > 3 else 0.01
V, Fs = [], []
for line in open(path):
    p = line.split()
    if not p: continue
    if p[0] == 'v': V.append(tuple(map(float, p[1:4])))
    elif p[0] == 'f': Fs.append(tuple(int(x.split('/')[0]) - 1 for x in p[1:4]))
tris = [t for t in Fs if all(abs(V[i][1] - top) < tol for i in t)]
cnt = defaultdict(int)
for a, b, c in tris:
    for e in ((a, b), (b, c), (c, a)):
        cnt[tuple(sorted(e))] += 1
# 같은 위치 정점 합치기(메시가 정점을 공유하지 않을 수 있음)
key = lambda i: (round(V[i][0], 4), round(V[i][2], 4))
cnt2 = defaultdict(int)
for (a, b), n in cnt.items():
    cnt2[tuple(sorted((key(a), key(b))))] += n
bound = [e for e, n in cnt2.items() if n == 1]
adj = defaultdict(list)
for a, b in bound:
    adj[a].append(b); adj[b].append(a)
seen, loops = set(), []
for s in adj:
    if s in seen: continue
    comp, st = [], [s]
    while st:
        x = st.pop()
        if x in seen: continue
        seen.add(x); comp.append(x); st.extend(adj[x])
    xs = [p[0] for p in comp]; zs = [p[1] for p in comp]
    cx, cz = sum(xs) / len(xs), sum(zs) / len(zs)
    w = max(max(xs) - min(xs), max(zs) - min(zs))
    loops.append({"center": [round(cx, 3), round(cz, 3)], "width": round(w, 3), "nverts": len(comp),
                  "bbox": [round(min(xs), 3), round(min(zs), 3), round(max(xs), 3), round(max(zs), 3)]})
loops.sort(key=lambda l: -l["width"])
print(json.dumps({"topTris": len(tris), "loops": loops}, indent=0))
