"""NRO 함수 범위 안의 adrp+add/ldr 문자열 참조를 순서대로 출력한다 (디컴파일 C 가 문자열 인자를 잃은 곳 확인용).
  online_strrefs.py <x.nro> <시작주소hex> <바이트수> [...]
"""
import sys
from pathlib import Path

import capstone

sys.path.insert(0, str(Path(__file__).parent))
import nro  # noqa: E402


def refs(m, start, size):
    md = capstone.Cs(capstone.CS_ARCH_ARM64, capstone.CS_MODE_ARM)
    md.skipdata = True
    code = bytes(m.mem[start - nro.BASE:start - nro.BASE + size])
    page = {}
    out = []
    for ins in md.disasm(code, start):
        ops = ins.op_str.split(", ")
        if ins.mnemonic == "adrp":
            page[ops[0]] = int(ops[1].lstrip("#"), 16)
        elif ins.mnemonic == "add" and len(ops) == 3 and ops[1] in page and ops[2].startswith("#"):
            va = page[ops[1]] + int(ops[2].lstrip("#"), 16)
            s = m.string(va)
            if s and s.isprintable() and len(s) > 1:
                out.append((ins.address, ops[0], s))
        elif ins.mnemonic == "bl":
            out.append((ins.address, "bl", ops[0]))
    return out


if __name__ == "__main__":
    m = nro.Image(sys.argv[1])
    a = sys.argv[2:]
    for i in range(0, len(a), 2):
        print(f"== {a[i]}")
        for addr, reg, s in refs(m, int(a[i], 16), int(a[i + 1], 0)):
            if reg != "bl":
                print(f"  {addr:x} {reg} {s!r}")
