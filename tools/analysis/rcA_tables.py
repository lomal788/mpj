"""rcA: mg1802/mg1803 NRO 정적 표 덤프. 사용: python tools/rcA_tables.py <nro> <GOT주소|심볼> <형식> <개수>
형식: sI = {char*, int} 16B, f = f32, i = i32, s = char*(8B), q = u64
"""
import sys
sys.path.insert(0, "c:/dev/mpj/web/tools/analysis")
from nro import Image, BASE

img = Image(sys.argv[1])
tgt = sys.argv[2]
if tgt.startswith("0x"):
    va = int(tgt, 16)
    if len(sys.argv) > 5 and sys.argv[5] == "got":
        va = img.u64(va)
else:
    va = BASE + img.syms[tgt][0]
fmt, n = sys.argv[3], int(sys.argv[4])
inv = {v[0] + BASE: k for k, v in img.syms.items()}
print(f"# base 0x{va:x} {inv.get(va, '')}")
for i in range(n):
    if fmt == "sI":
        p = img.u64(va + i * 16); v = img.i32(va + i * 16 + 8)
        print(i, repr(img.string(p)) if p else None, v)
    elif fmt == "f":
        print(i, img.f32(va + i * 4))
    elif fmt == "i":
        print(i, img.i32(va + i * 4))
    elif fmt == "s":
        p = img.u64(va + i * 8); print(i, repr(img.string(p)) if p else None)
    elif fmt == "q":
        p = img.u64(va + i * 8); print(i, hex(p), inv.get(p, ""))
