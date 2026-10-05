"""rcD: mg1808/mg1809 함수-static 표(_ZZ…) 를 모두 덤프. 포인터(재배치 전 오프셋)는 문자열로 풀어 보인다.
사용: python tools/rcD_static.py mg1808 > analysis/rcD_mg1808_static.txt
"""
import sys, struct
sys.path.insert(0, "c:/dev/mpj/web/tools/analysis")
from nro import Image, BASE
mg = sys.argv[1]
img = Image(f"c:/dev/mpj/extracted/romfs/nro/NX_Release/{mg}.nro")
def s_at(off):
    try:
        e = img.mem.index(0, off)
        b = bytes(img.mem[off:e])
        t = b.decode("utf-8")
        return t if t and all(c.isprintable() for c in t) else None
    except Exception:
        return None
for name, (value, size) in sorted(img.syms.items(), key=lambda x: x[1][0]):
    if not name.startswith("_ZZ") or size == 0 or "guard" in name or name.startswith("_ZZN") is False:
        continue
    if "_ZGV" in name: continue
    raw = bytes(img.mem[value:value + size])
    out = []
    if size % 8 == 0:
        ptrs = [struct.unpack_from("<Q", raw, i)[0] for i in range(0, size, 8)]
        strs = [s_at(p) if 0 < p < len(img.mem) else None for p in ptrs]
        if all(strs):
            out.append("str[] " + repr(strs))
    if not out:
        ints = [struct.unpack_from("<i", raw, i)[0] for i in range(0, size - size % 4, 4)]
        fl = [round(struct.unpack_from("<f", raw, i)[0], 6) for i in range(0, size - size % 4, 4)]
        out.append(f"i32 {ints[:48]}")
        out.append(f"f32 {fl[:48]}")
    print(f"0x{BASE+value:x} size={size} {name}")
    for o in out: print("    " + o)
