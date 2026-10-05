# 사용: python tools/rcC_static.py <nro> ptrs <addr> <n>      — 포인터 n개를 따라 문자열 출력
#       python tools/rcC_static.py <nro> pairs <addr> <n>     — {char*, i64} 쌍 n개
#       python tools/rcC_static.py <nro> f32 <addr> <n> | u32 <addr> <n> | str <addr>
import sys
sys.path.insert(0, "c:/dev/mpj/web/tools/analysis")
from nro import Image
im = Image(sys.argv[1]); cmd = sys.argv[2]; a = int(sys.argv[3], 16)
n = int(sys.argv[4]) if len(sys.argv) > 4 else 1
if cmd == "ptrs":
    for i in range(n):
        p = im.u64(a + 8 * i); print(hex(a + 8 * i), hex(p), repr(im.string(p)) if p else None)
elif cmd == "pairs":
    for i in range(n):
        p = im.u64(a + 16 * i); v = im.u64(a + 16 * i + 8)
        print(repr(im.string(p)), v)
elif cmd == "f32":
    print([im.f32(a + 4 * i) for i in range(n)])
elif cmd == "u32":
    print([hex(im.u32(a + 4 * i)) for i in range(n)])
elif cmd == "str":
    print(repr(im.string(a)))
