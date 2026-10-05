"""mgE: NRO 디스어셈블러 (capstone). bl 대상은 심볼/import(PLT 스텁 해석) 이름으로 표시한다.
사용: python tools/mgE_dis.py <nro> <시작주소|함수이름> [끝주소|바이트수]
함수 이름을 주면 심볼 크기만큼 디스어셈블한다."""
import struct
import sys
import capstone
sys.path.insert(0, __file__.replace("\\", "/").rsplit("/", 1)[0])
from nro import Image, BASE


def build(img):
    names = {}
    for name, value, size, shndx in img.sym_by_index:
        if name and shndx and value:
            names.setdefault(BASE + value, name)
    return names


def jmprel(img):
    mod0 = struct.unpack_from("<I", img.mem, 4)[0]
    dyn = mod0 + struct.unpack_from("<i", img.mem, mod0 + 4)[0]
    tags = {}
    off = dyn
    while True:
        tag, val = struct.unpack_from("<qQ", img.mem, off)
        off += 16
        if tag == 0:
            break
        tags[tag] = val
    out = {}
    rel, sz = tags.get(0x17, 0), tags.get(2, 0)
    for r in range(rel, rel + sz, 24):
        roff, rinfo, addend = struct.unpack_from("<QQq", img.mem, r)
        sym = rinfo >> 32
        if sym < len(img.sym_by_index):
            out[roff] = img.sym_by_index[sym][0]
    return out


JMP = {}


def plt_name(img, md, va):
    off = va - BASE
    try:
        ins = list(md.disasm(bytes(img.mem[off:off + 12]), va))
    except Exception:
        return None
    if len(ins) >= 2 and ins[0].mnemonic == "adrp" and ins[1].mnemonic == "ldr":
        page = ins[0].operands[1].imm
        disp = ins[1].operands[1].mem.disp
        got = page + disp - BASE
        return img.imports.get(got) or JMP.get(got)
    return None


def main():
    img = Image(sys.argv[1])
    names = build(img)
    JMP.update(jmprel(img))
    md = capstone.Cs(capstone.CS_ARCH_ARM64, capstone.CS_MODE_ARM)
    md.detail = True
    a = sys.argv[2]
    if a.startswith("0x") or all(c in "0123456789abcdefABCDEF" for c in a):
        start = int(a, 16)
        if start < BASE:
            start += BASE
        if len(sys.argv) > 3:
            e = int(sys.argv[3], 16)
            end = e if e > BASE else (start + e if e < 0x100000 else e + BASE)
        else:
            end = start + 0x200
    else:
        hits = [(v, n) for v, n in names.items() if n == a or a in n]
        hits.sort()
        for v, n in hits:
            print("#", hex(v), n)
        start = hits[0][0]
        size = [s for nm, val, s, sh in img.sym_by_index if BASE + val == start and s][0]
        end = start + size
    pc = start
    while pc < end:
      last = pc
      for ins in md.disasm(bytes(img.mem[pc - BASE:end - BASE]), pc):
        last = ins.address + ins.size
        note = ""
        if ins.mnemonic in ("bl", "b") and ins.operands and ins.operands[0].type == capstone.arm64.ARM64_OP_IMM:
            t = ins.operands[0].imm
            n = names.get(t) or plt_name(img, md, t)
            if n:
                note = "  ; " + n
        if ins.address in names:
            print(f"<{names[ins.address]}>")
        print(f"{ins.address:x}: {ins.mnemonic:8s} {ins.op_str}{note}")
      if last < end:
        print(f"{last:x}: .word    0x{struct.unpack_from('<I', img.mem, last - BASE)[0]:08x}")
      pc = last + 4


if __name__ == "__main__":
    main()
