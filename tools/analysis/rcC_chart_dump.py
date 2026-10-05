# 사용: python tools/rcC_chart_dump.py <mg1806|mg1807>
# 채보 JSON 의 키·줄수·코드 빈도·비어 있지 않은 줄 목록을 출력
import json, sys, glob, os, collections
g = sys.argv[1]
d = f"c:/dev/mpj/extracted/bea/mg~{g}.nx.bea/mg/{g}/data"
for f in sorted(glob.glob(d + f"/{g}_rm_chart*.json")):
    j = json.load(open(f, encoding="utf-8-sig"))
    keys = list(j.keys())
    n = len(j[keys[0]])
    print("==", os.path.basename(f), "keys", keys, "rows", [len(j[k]) for k in keys])
    for k in keys:
        c = collections.Counter(e.get("code", "") for e in j[k])
        print("  ", k, dict(c))
    if "-v" in sys.argv:
        for r in range(n):
            row = [j[k][r].get("code", "") if r < len(j[k]) else "?" for k in keys]
            if any(row):
                print("   r%3d bar%2d.%d" % (r, r // 8, r % 8), row)
