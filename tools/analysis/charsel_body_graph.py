"""캐릭터 선택 몸 재질(body_m) 셰이더 그래프 판독 → 웹 규칙 표 (docs/shell/charselect.md 12.11).

입력: analysis/mat/sass/<pc>__forward_plus__p<N>.{vs,fs}.txt (sass_dis.py, 캐릭터 셰이더 팩 _chara/pcNN.bnbshpk 의 forward_plus 프로그램을
       bfsha_dump match 로 고른 것 — 재질 옵션 = glb extras.fres.shader.options, analysis/mat/charsel_mats_in.json).
출력: analysis/mat/charsel_body_graph.json  {pc: {tag, uv: {s, o, terms}, tint}}

- uv: VS 가 몸 알베도 좌표 varying(v10)에 쓰는 값을 다항식으로 풀어 v = S·(uv0 + Σ k·정점색·파라미터) + O 로 정리한다 [판독].
  정점 입력 위치 = bfsha 속성 위치(_u0 8 = uv0·uv1, _u2 9, _c0 10, _c1 11, _c2 12). FS 가 몸 알베도를 v10 으로 샘플하는 것은
  albuv 추적으로 22명 모두 확인(FS 의 Material.@<알베도 슬롯> 핸들 → tex 좌표 = ipa v10.xy).
- tint: FS 의 utility_color 사용처를 손으로 판독한 결과(TINT 표, 줄 번호는 sass 파일 기준) [판독].

사용: python web/tools/analysis/charsel_body_graph.py
"""
import json
import os
import re
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SASS = os.path.join(ROOT, "analysis", "mat", "sass")
MATCH = os.path.join(ROOT, "analysis", "mat", "prog", "match.json")
OUT = os.path.join(ROOT, "analysis", "mat", "charsel_body_graph.json")
W = {"b32": 1, "b64": 2, "b96": 3, "b128": 4}
ATTR = {8: ("uv", 0), 9: ("uv", 2), 10: ("c0", 0), 11: ("c1", 0), 12: ("c2", 0), 13: ("c3", 0)}

# FS utility_color 사용 판독(몸 기본색에 들어가는 것만). base = mix(base, base·F + C1, M)
#  pc08·pc09: sass fs 279~322 — x = alb·(sat(P2.x)·c2.z + sat(P3.x)·c2.x) + C1, base = mix(base, x, max(c2.x, c2.z))
#  pc58: sass fs 257~272 — x = alb·P2.y + C1, base = mix(base, x, c2.z)
#  pc56: sass fs 246~291 — x = mix(C1, C2, 모델 색 변형) + max(alb·c1.x·P3.x, alb·c1.z·P1.x): 기본값(P1.x = P3.x = 1, C1 ≈ 0.002)·모션에서
#        P1/P3 가 안 움직여 눈에 띄는 변화가 없다 → 웹 미적용(문서에 기록)
TINT = {
    "pc08": {"mask": "max(c2.x, c2.z)", "f": "clamp(P2.x, 0.0, 1.0) * c2.z + clamp(P3.x, 0.0, 1.0) * c2.x", "lines": "fs 279-322"},
    "pc09": {"mask": "max(c2.x, c2.z)", "f": "clamp(P2.x, 0.0, 1.0) * c2.z + clamp(P3.x, 0.0, 1.0) * c2.x", "lines": "fs 279-322"},
    "pc58": {"mask": "c2.z", "f": "P2.y", "lines": "fs 257-272"},
}


def fl(h):
    return struct.unpack("<f", struct.pack("<I", int(h, 16)))[0]


def padd(a, b, s=1.0):
    r = dict(a)
    for k, v in b.items():
        r[k] = r.get(k, 0.0) + s * v
    return {k: v for k, v in r.items() if abs(v) > 1e-9}


def pmul(a, b):
    r = {}
    for ka, va in a.items():
        for kb, vb in b.items():
            k = tuple(sorted(ka + kb))
            r[k] = r.get(k, 0.0) + va * vb
    return {k: v for k, v in r.items() if abs(v) > 1e-9}


def vs_poly(path):
    env = {}
    out = {}
    for ln in open(path, encoding="utf-8").read().splitlines()[1:]:
        t = ln.split()
        if not t or t[0].endswith(":"):
            continue
        if t[0].startswith("$p") or t[0] == "not":
            continue
        op = t[0]
        if op == "ld" and "a[v" in ln:
            w = W[t[1]]
            d = int(t[2][2:])
            m = re.search(r"a\[v(\d+)\.([xyzw])\]", ln)
            v = int(m.group(1))
            c = "xyzw".index(m.group(2))
            for k in range(w):
                name, base = ATTR.get(v, (f"a{v}", 0))
                comp = "xyzw"[c + k]
                if name == "uv":
                    comp = ("u" if (c + k) % 2 == 0 else "v") + str(base + (c + k) // 2)
                    env[f"$r{d + k}"] = {(comp,): 1.0}
                else:
                    env[f"$r{d + k}"] = {(f"{name}.{comp}",): 1.0}
            continue
        if op == "st" and "a[v" in ln:
            w = W[t[1]]
            m = re.search(r"a\[v(\d+)\.([xyzw])\]", ln)
            v = int(m.group(1))
            c = "xyzw".index(m.group(2))
            r = int(t[3][2:])
            for k in range(w):
                out[(v, c + k)] = env.get(f"$r{r + k}")
            continue
        args = [x for x in t[1:] if x not in ("ftz", "sat")]
        if op not in ("mov", "mov32i", "fmul", "fmul32i", "fadd", "fadd32i", "ffma"):
            for x in args:
                if x.startswith("$r"):
                    env[x] = None
                    break
            continue
        d = args[0]
        vals = []
        neg = False
        for x in args[1:]:
            if x == "neg":
                neg = True
                continue
            if op.startswith("mov") and x == "0xf":
                continue
            if x.startswith("$r"):
                p = env.get(x)
            elif x.startswith("0x"):
                p = {(): fl(x)}
            else:
                m = re.match(r"Material\.material_utility_parameter(\d)(?:\+0x([0-9a-f]+))?$", x)
                p = {(f"P{m.group(1)}.{'xyzw'[int(m.group(2) or '0', 16) // 4]}",): 1.0} if m else None
            if p is not None and neg:
                p = {k: -v for k, v in p.items()}
            vals.append(p)
            neg = False
        if any(v is None for v in vals):
            env[d] = None
        elif op.startswith("mov"):
            env[d] = vals[0]
        elif op.startswith("fmul"):
            env[d] = pmul(vals[0], vals[1])
        elif op.startswith("fadd"):
            env[d] = padd(vals[0], vals[1])
        else:
            env[d] = padd(pmul(vals[0], vals[1]), vals[2])
    return out


def uv_rule(px, py):
    """v = S·(uv0 + d) + O 꼴로 정리. d 항 = (정점색 성분, 파라미터 성분, 계수/S)"""
    rule = {"s": [], "o": [], "terms": []}
    for axis, p in enumerate((px, py)):
        uvk = ("u0",) if axis == 0 else ("v0",)
        s = p.get(uvk, 0.0)
        o = p.get((), 0.0)
        rule["s"].append(round(s, 6))
        rule["o"].append(round(o, 6))
        for k, v in sorted(p.items()):
            if k in ((), uvk):
                continue
            if len(k) != 2:
                raise ValueError(f"예상 밖 항 {k}")
            col = next(x for x in k if x[:2] in ("c0", "c1", "c2", "c3"))
            par = next(x for x in k if x.startswith("P"))
            rule["terms"].append({"axis": axis, "color": col, "param": f"material_utility_parameter{par[1]}", "comp": par[3], "k": round(v / s, 6)})
    return rule


def main():
    match = json.load(open(MATCH, encoding="utf-8"))
    res = {}
    for e in match:
        pc, mat = e["name"].split(":")
        if mat != "body_m" or not e.get("used"):
            continue
        tag = e["used"]["tag"]
        out = vs_poly(os.path.join(SASS, f"{tag}.vs.txt"))
        res[pc] = {"tag": tag, "uv": uv_rule(out[(10, 0)], out[(10, 1)])}
        if pc in TINT:
            res[pc]["tint"] = TINT[pc]
    json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for pc, r in res.items():
        u = r["uv"]
        print(pc, r["tag"], "S", u["s"], "O", u["o"], " ".join(f"{'uv'[t['axis']]}+={t['k']:g}·{t['color']}·P{t['param'][-1]}.{t['comp']}" for t in u["terms"]), "tint" if "tint" in r else "")


if __name__ == "__main__":
    main()
