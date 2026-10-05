"""mg0508 거대 스테이크 자르기 — 절단 면적비 재구현 계산.

원본 근거(mg0508.nro):
  createBaseMesh @0x71000168e0   첫 셰이프 _p0(f32x3)·u32 인덱스 → 삼각형 수프(Vtx 0x50 B, pos.w = 0)
  Cutting::MeshDivide @0x71000060b0  평면 d = ((v0+v2)+(v1+v3)), v = (p-o)*n (4성분 f32)
  Cutting::Process @0x7100005020     외톨이 꼭짓점 A: A쪽 [A,Pab,Pac], 반대쪽 [Pab,B,C],[C,Pac,Pab]
  Cutting::calcArea @0x7100007470    y 성분을 0으로 지운 XZ 투영 삼각형 면적 합(frsqrte+2회 뉴턴)
  Field::getPositiveRate @0x710000baa4  A+ / (A+ + A-)
  Scene::OnGameMain 0x10 @0x7100013244  p = (int)(rate*100) (fcvtzs), v = p<50 ? 100-p : p

입력 메시: tools/graphics_bfres2gltf 로 만든 extracted/converted/mgC/mg0508/steakNN.glb
출력: analysis/mgC_mg0508_calc.json

사용: .venv/Scripts/python tools/mgC_mg0508_calc.py
"""
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
GLB_DIR = ROOT / "extracted/converted/mgC/mg0508"
OUT = ROOT / "analysis/mgC_mg0508_calc.json"
F = np.float32


# ---------------------------------------------------------------- glb
def load_glb(path):
    data = path.read_bytes()
    jlen = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + jlen])
    boff = 20 + jlen + 8
    binv = data[boff:]
    prim = js["meshes"][0]["primitives"][0]

    def acc(i, dtype, comps):
        a = js["accessors"][i]
        bv = js["bufferViews"][a["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        n = a["count"] * comps
        return np.frombuffer(binv, dtype=dtype, count=n, offset=off).reshape(a["count"], comps) if comps > 1 else \
            np.frombuffer(binv, dtype=dtype, count=n, offset=off)

    pos = acc(prim["attributes"]["POSITION"], np.float32, 3)
    ia = js["accessors"][prim["indices"]]
    idt = {5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[ia["componentType"]]
    idx = acc(prim["indices"], idt, 1).astype(np.int64)
    return pos.copy(), idx.copy()


def base_mesh(pos, idx):
    """createBaseMesh: 인덱스 순서대로 펼친 삼각형 수프, pos.w = 0"""
    v = np.zeros((len(idx), 4), dtype=F)
    v[:, :3] = pos[idx]
    return v


# ---------------------------------------------------------------- AArch64 근사 연산
def frsqrte(x):
    """ARMv8 FRSQRTE (단정밀도, FEAT_RPRES 없음) — 양수 정규수만."""
    bits = np.float32(x).view(np.uint32).item()
    exp = (bits >> 23) & 0xFF
    frac = bits & 0x7FFFFF
    if exp == 0 or exp == 0xFF:
        return F(1.0 / math.sqrt(float(x))) if x > 0 else F(np.inf)
    if (exp & 1) == 0:
        scaled = (1 << 8) | (frac >> 15)        # '1':fraction<51:44>
    else:
        scaled = (1 << 7) | (frac >> 16)        # '01':fraction<51:45>
    a = scaled
    if a < 256:
        a = a * 2 + 1
    else:
        a = (a >> 1) << 1
        a = (a + 1) * 2
    b = 512
    while a * (b + 1) * (b + 1) < (1 << 28):
        b += 1
    r = (b + 1) // 2
    rexp = (380 - exp) // 2
    out = ((rexp & 0xFF) << 23) | ((r & 0xFF) << 15)
    return np.uint32(out).view(np.float32)


def frsqrts(a, b):
    """FRSQRTS = (3 - a*b) / 2, 곱·뺄셈 한 번 반올림(배정밀도 경유 근사)."""
    return F((3.0 - float(a) * float(b)) / 2.0)


def hsum4(v):
    """ext + fadd.2S + faddp: (v0+v2) + (v1+v3)"""
    return F(F(v[0] + v[2]) + F(v[1] + v[3]))


# ---------------------------------------------------------------- 원본 알고리즘
def plane_d(p, o, n):
    v = (p - o).astype(F) * n
    return hsum4(v.astype(F))


def lerp(a, b, t):
    t = F(abs(t))
    return (a + (b - a) * t).astype(F)


def mesh_divide(V, o, n):
    pos, neg = [], []
    for i in range(0, len(V) - len(V) % 3, 3):
        v0, v1, v2 = V[i], V[i + 1], V[i + 2]
        d0, d1, d2 = plane_d(v0, o, n), plane_d(v1, o, n), plane_d(v2, o, n)
        if F(d0 * d1) < 0 and F(d0 * d2) < 0:
            A, B, C, dA, dB, dC = v0, v1, v2, d0, d1, d2
        elif F(d0 * d1) < 0 and F(d1 * d2) < 0:
            A, B, C, dA, dB, dC = v1, v2, v0, d1, d2, d0
        elif F(d0 * d2) < 0 and F(d1 * d2) < 0:
            A, B, C, dA, dB, dC = v2, v0, v1, d2, d0, d1
        else:
            (neg if d0 < 0 else pos).extend([v0, v1, v2])
            continue
        t1 = F(dA / F(dA - dB))
        t2 = F(dA / F(dA - dC))
        pab, pac = lerp(A, B, t1), lerp(A, C, t2)
        sideA, sideB = (neg, pos) if dA < 0 else (pos, neg)
        sideA.extend([A, pab, pac])
        sideB.extend([pab, B, C, C, pac, pab])
    return pos, neg


def tri_area(a, b, c):
    a = a.copy(); b = b.copy(); c = c.copy()
    a[1] = b[1] = c[1] = F(0)
    e1 = (b - a).astype(F)
    e2 = (c - a).astype(F)
    l2 = hsum4((e1 * e1).astype(F))
    if l2 == 0:
        u = np.zeros(4, dtype=F)
    else:
        r = frsqrte(l2)
        s = frsqrts(r, F(l2 * r)); r = F(r * s)
        s = frsqrts(r, F(l2 * r)); r = F(r * s)
        u = (e1 * r).astype(F)
    dot = hsum4((e2 * u).astype(F))
    h = (e2 - (u * dot).astype(F)).astype(F)
    h2 = hsum4((h * h).astype(F))
    return F(F(F(np.sqrt(l2)) * F(np.sqrt(h2))) * F(0.5))


def calc_area(tris):
    s = F(0)
    for i in range(0, len(tris), 3):
        s = F(s + tri_area(tris[i], tris[i + 1], tris[i + 2]))
    return s


def positive_rate(V, o, n):
    pos, neg = mesh_divide(V, o, n)
    a, b = calc_area(pos), calc_area(neg)
    return F(a / F(a + b)), a, b


def score(rate):
    p = int(F(rate * F(100.0)))          # fcvtzs: 0 쪽 절삭
    v = 100 - p if p < 50 else p
    return p, v


# ---------------------------------------------------------------- 시나리오
def knife_plane(x0, x1, z0=-3.0, z1=3.0, steak_pos=(0.0, 0.3, 0.0)):
    """Field::adjustKnife: mid = (p0+p1)/2 (y=0), ang = atan2(dx, dz)+pi, Euler(0,ang,0)
    법선 = 칼 엔티티 로컬 X축 = (cos a, 0, -sin a) [Rz·Ry·Rx 규약]. 스테이크 회전이 항등일 때 로컬 = 월드 - 스테이크 위치."""
    dx, dz = F(x0 - x1), F(z0 - z1)
    ang = F(math.atan2(float(dx), float(dz))) + F(3.1415927)
    n = np.array([math.cos(ang), 0.0, -math.sin(ang), 0.0], dtype=F)
    mid = np.array([(x0 + x1) * 0.5, 0.0, (z0 + z1) * 0.5, 0.0], dtype=F)
    o = mid - np.array([steak_pos[0], steak_pos[1], steak_pos[2], 0.0], dtype=F)
    return o.astype(F), n


def frames_until(step, op="lt"):
    t, k = F(0), 0
    while True:
        t = F(t + F(step)); k += 1
        if op == "lt" and not (t < 1.0):
            return k
        if op == "le" and not (t <= 1.0):
            return k


def main():
    res = {"source": "tools/mgC_mg0508_calc.py", "steaks": {}, "timeline_frames": {}}
    for i in range(6):
        pos, idx = load_glb(GLB_DIR / f"steak{i:02d}.glb")
        V = base_mesh(pos, idx)
        xmin, xmax = float(pos[:, 0].min()), float(pos[:, 0].max())
        zmin, zmax = float(pos[:, 2].min()), float(pos[:, 2].max())
        # 위로 향한 면/아래로 향한 면 투영 면적(검산용)
        a, b, c = pos[idx[0::3]], pos[idx[1::3]], pos[idx[2::3]]
        ny = (b[:, 2] - a[:, 2]) * (c[:, 0] - a[:, 0]) - (b[:, 0] - a[:, 0]) * (c[:, 2] - a[:, 2])
        up = float(np.abs(ny[ny > 0]).sum() * 0.5); down = float(np.abs(ny[ny < 0]).sum() * 0.5)
        info = {"verts": int(len(pos)), "tris": int(len(idx) // 3), "xmin": xmin, "xmax": xmax, "zmin": zmin, "zmax": zmax,
                "clampMinX(0.8)": xmin * 0.8, "clampMaxX(0.8)": xmax * 0.8,
                "projAreaUpFacing": up, "projAreaDownFacing": down}
        # 칼을 Z 축과 나란히(두 사람 같은 x) 놓고 x 를 훑는다
        scan = []
        xs = np.round(np.arange(round(xmin * 0.8, 2), xmax * 0.8 + 1e-9, 0.01), 2)
        for x in xs:
            o, n = knife_plane(float(x), float(x))
            r, ap, an = positive_rate(V, o, n)
            p, v = score(r)
            scan.append((float(x), float(r), p, v))
        win = [s[0] for s in scan if s[3] == 50]
        info["totalArea"] = float(positive_rate(V, *knife_plane(0.0, 0.0))[1] + positive_rate(V, *knife_plane(0.0, 0.0))[2])
        info["edgeStart"] = {}
        for tag, x in (("team0 x=minX*0.8", xmin * 0.8), ("team1 x=maxX*0.8", xmax * 0.8)):
            o, n = knife_plane(x, x)
            r, _, _ = positive_rate(V, o, n)
            info["edgeStart"][tag] = {"x": x, "rate": float(r), "p_v": score(r)}
        info["x_for_v50_range"] = [min(win), max(win)] if win else None
        info["scan_every_0.05"] = [s for s in scan if abs(round(s[0] * 20) - s[0] * 20) < 1e-6]
        # 기울인 칼: x0 = -0.5, x1 = +0.5
        o, n = knife_plane(-0.5, 0.5)
        r, _, _ = positive_rate(V, o, n)
        info["tilted(-0.5,+0.5)"] = {"normal": n.tolist(), "rate": float(r), "p_v": score(r)}
        res["steaks"][f"steak{i:02d}"] = info
        print(f"steak{i:02d}: x[{xmin:.3f},{xmax:.3f}] v50 x {info['x_for_v50_range']} "
              f"edge {info['edgeStart']} up/down area {up:.4f}/{down:.4f} total {info['totalArea']:.4f}")
    # OnGameMain 단계별 프레임(+= 상수, f32 누적)
    res["timeline_frames"] = {
        "state6 wait (+0.05, <1)": frames_until(0.05),
        "state10 (+1/60, <=1)": frames_until(0.016666668, "le"),
        "state0xC (+0.2, <1)": frames_until(0.2),
        "state0xF roulette (+0.1, <1)": frames_until(0.1),
        "state0x10 roulette (+1/60, <1)": frames_until(0.016666668),
        "state0x11 (+0.025, <1)": frames_until(0.025),
        "state0x12 (+0.01, <1)": frames_until(0.01),
        "state0x14 (+1/60, <1 → 끝)": frames_until(0.016666668),
        "state5 knifeOff (+1/SteakMoveFrame=15)": frames_until(F(1.0) / F(15.0)),
        "state7/8/0xE/0x13 slide (+1/PlateSlideFrame=33)": frames_until(F(1.0) / F(33.0)),
    }
    print(res["timeline_frames"])
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print("->", OUT)


if __name__ == "__main__":
    sys.exit(main())
