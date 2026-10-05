"""mgE: NRO 의 데이터 심볼(STT_OBJECT)을 나열하고 값을 덤프한다.
사용: python tools/mgE_static.py <nro> [이름부분...]
문자열 포인터 배열이면 문자열로, 아니면 u32/f32 로 보여준다."""
import struct
import sys
sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from nro import Image, BASE


def objects(img):
    out = []
    i = 0
    while img.symtab + i * 24 < img.strtab:
        name_off, info, other, shndx, value, size = struct.unpack_from("<IBBHQQ", img.mem, img.symtab + i * 24)
        if (info & 0xF) == 1 and shndx and size:
            out.append((img.cstr(img.strtab + name_off), value, size))
        i += 1
    return sorted(out, key=lambda r: r[1])


def show(img, name, value, size):
    print(f"0x{BASE + value:x} size={size} {name}")
    raw = img.mem[value:value + size]
    if size % 8 == 0:
        ptrs = struct.unpack_from(f"<{size // 8}Q", raw)
        if all(0 < (p - BASE if p >= BASE else p) < len(img.mem) for p in ptrs):
            strs = []
            for p in ptrs:
                try:
                    s = img.string(p)
                except Exception:
                    s = None
                strs.append(s)
            if all(s is not None and s.isprintable() for s in strs):
                print("   str:", strs)
                return
    if size % 4 == 0:
        us = struct.unpack_from(f"<{size // 4}I", raw)
        fs = struct.unpack_from(f"<{size // 4}f", raw)
        print("   u32:", [hex(u) for u in us][:64])
        print("   f32:", [round(f, 6) for f in fs][:64])
    else:
        print("   raw:", raw.hex())


if __name__ == "__main__":
    img = Image(sys.argv[1])
    parts = sys.argv[2:]
    for name, value, size in objects(img):
        if not parts or any(p in name for p in parts):
            show(img, name, value, size)
