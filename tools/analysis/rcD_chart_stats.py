import json, sys, collections, glob, os
base = "c:/dev/mpj/extracted/bea"
for mg in ("mg1808", "mg1809"):
    for f in sorted(glob.glob(f"{base}/mg~{mg}.nx.bea/mg/{mg}/data/*.json")):
        d = json.load(open(f, encoding="utf-8-sig"))
        keys = list(d.keys())
        n = len(d["1P"])
        lens = {k: len(v) for k, v in d.items()}
        cnt = collections.Counter()
        rows = []
        for k in keys:
            for i, e in enumerate(d[k]):
                c = e.get("code", "")
                if c:
                    cnt[(k, c)] += 1
                    rows.append((i, k, c))
        print("==", os.path.basename(f), "rows", n, "lens", lens)
        byk = collections.defaultdict(collections.Counter)
        for (k, c), v in cnt.items():
            byk[k][c] += v
        for k in keys:
            if byk[k]:
                print("  ", k, dict(sorted(byk[k].items())))
        rows.sort()
        print("   first:", rows[:12])
        print("   last:", rows[-6:])
