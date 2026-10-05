"""NRO vtable dump with slot names.

usage: python tools/rhythm_vtable.py <nro> <vtable symbol or part> [slots]
slot offset is from the address point (vtable symbol + 0x10).
local targets -> name from analysis/functions/<nro>.tsv, imports -> nested name of the mangled symbol.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from nro import BASE, Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def nested(m):
    if not m.startswith("_ZN"):
        return m
    i = 3
    while m[i] in "KVr":
        i += 1
    parts = []
    while i < len(m) and m[i] != "E":
        if m[i] == "C" or m[i] == "D":
            parts.append(("~" if m[i] == "D" else "") + parts[-1] if parts else m[i:i + 2])
            i += 2
            continue
        if m[i] == "S" and m[i + 1] == "t":
            i += 2
            continue
        if m[i] == "I":
            depth = 0
            while i < len(m):
                if m[i] == "I":
                    depth += 1
                elif m[i] == "E":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
            parts[-1] += "<..>"
            continue
        mm = re.match(r"\d+", m[i:])
        if not mm:
            break
        n = int(mm.group())
        i += len(mm.group())
        parts.append(m[i:i + n])
        i += n
    return "::".join(parts)


def load_tsv(name):
    p = os.path.join(ROOT, "analysis", "functions", name + ".tsv")
    out = {}
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            if len(f) >= 3 and f[0] != "address":
                out[int(f[0], 16)] = f[2]
    return out


def dump(path, part, slots=None):
    img = Image(path)
    tsv = load_tsv(os.path.basename(path))
    local = {v: n for n, v, s, sh in img.sym_by_index if sh and n}
    hits = sorted(img.find(part).items())
    for name, (value, size) in hits:
        if not name.startswith("_ZTV"):
            continue
        cnt = size // 8 if size else (slots or 64)
        print(f"# {name} @0x{BASE + value:x} size={size}")
        for k in range(cnt):
            off = value + k * 8
            rel = k * 8 - 0x10
            if off in img.imports:
                tgt = "IMPORT " + nested(img.imports[off])
                raw = 0
            else:
                raw = img.u64(BASE + off) if False else int.from_bytes(img.mem[off:off + 8], "little")
                a = raw - BASE if raw >= BASE else raw
                tgt = tsv.get(raw) or (nested(local[a]) if a in local else "")
            print(f"  +0x{rel:03x}  0x{raw:x}  {tgt}")


if __name__ == "__main__":
    dump(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else None)
