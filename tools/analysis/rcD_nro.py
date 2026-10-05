"""rcD: NRO 주소에서 문자열/f32/u32 표 읽기, 심볼 static 표 덤프.
사용: python tools/rcD_nro.py <mg> s <addr>...        문자열
      python tools/rcD_nro.py <mg> f <addr> <n>        f32 n개
      python tools/rcD_nro.py <mg> i <addr> <n>        i32 n개
      python tools/rcD_nro.py <mg> p <addr> <n>        포인터 n개 → 가리키는 문자열
      python tools/rcD_nro.py <mg> sym <부분이름>        심볼(데이터) 주소·크기·내용 요약
"""
import sys, struct
sys.path.insert(0, "c:/dev/mpj/web/tools/analysis")
from nro import Image, BASE
mg, cmd, *a = sys.argv[1:]
img = Image(f"c:/dev/mpj/extracted/romfs/nro/NX_Release/{mg}.nro")
def S(va):
    try:
        return img.string(va)
    except Exception as e:
        return f"<{e}>"
if cmd == "s":
    for x in a:
        print(x, repr(S(int(x, 16))))
elif cmd in ("f", "i", "u", "p"):
    va, n = int(a[0], 16), int(a[1])
    for k in range(n):
        if cmd == "f":
            print(hex(va + 4 * k), img.f32(va + 4 * k), hex(img.u32(va + 4 * k)))
        elif cmd == "i":
            print(hex(va + 4 * k), img.i32(va + 4 * k))
        elif cmd == "u":
            print(hex(va + 4 * k), hex(img.u32(va + 4 * k)))
        else:
            p = img.u64(va + 8 * k)
            print(hex(va + 8 * k), hex(p), repr(S(p)) if p >= BASE else "", img.imports.get(img.addr(va + 8 * k), ""))
elif cmd == "sym":
    for name, (value, size) in sorted(img.find(a[0]).items()):
        va = BASE + value
        raw = bytes(img.mem[value:value + min(size, 256)])
        print(f"0x{va:x} size={size} {name}")
        if size and size <= 256 and not name.startswith("_ZN") or "::" in name:
            pass
        ws = [struct.unpack_from('<I', raw, i)[0] for i in range(0, len(raw) - 3, 4)]
        print("   u32:", [hex(w) for w in ws[:64]])
        print("   f32:", [round(struct.unpack('<f', struct.pack('<I', w))[0], 6) for w in ws[:64]])
