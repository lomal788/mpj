"""mgA: Scene::Params 기본값(createInstance 의 쓰기를 모사) + getPropertyList(이름·오프셋·타입·범위) 결합.
사용: python tools/mgA_params.py <decomp.c> <Params 클래스 접두(예 mg0118::Scene::Params)> <out.json>
"""
import json, re, struct, sys

SIZES = {"undefined1": 1, "undefined2": 2, "undefined4": 4, "undefined8": 8, "long": 8, "int": 4, "float": 4, "char": 1, "bool": 1}


def func(text, name):
    m = re.search(r"(?m)^// ==== [0-9a-f]+ " + re.escape(name) + r"\n(.*?)(?=^// ==== |\Z)", text, re.S)
    return m.group(1) if m else ""


def sim_writes(body, var=None):
    if var is None:
        m = re.search(r"(\w+) = (?:\(\w+ \*\))?operator_new\((0x[0-9a-f]+|\d+)\)", body)
        var, size = m.group(1), int(m.group(2), 0)
    else:
        size = 0x2000
    buf = bytearray(size)
    written = bytearray(size)
    v = re.escape(var)
    pats = [
        (rf"\*\((\w+) \*\)\(\(long\)\(?{v}\)? \+ (0x[0-9a-f]+|\d+)\) = (-?0x[0-9a-f]+|-?\d+);", lambda m: (m.group(1), int(m.group(2), 0), m.group(3))),
        (rf"\*\((\w+) \*\)\({v} \+ (0x[0-9a-f]+|\d+)\) = (-?0x[0-9a-f]+|-?\d+);", lambda m: (m.group(1), int(m.group(2), 0) * 8, m.group(3))),
        (rf"(?<![\w*]){v}\[(0x[0-9a-f]+|\d+)\] = (-?0x[0-9a-f]+|-?\d+);", lambda m: ("undefined8", int(m.group(1), 0) * 8, m.group(2))),
        (rf"\*\((\w+) \*\){v} = (-?0x[0-9a-f]+|-?\d+);", lambda m: (m.group(1), 0, m.group(2))),
    ]
    for line in body.splitlines():
        for p, f in pats:
            m = re.search(p, line)
            if m:
                t, off, val = f(m)
                n = SIZES.get(t, 8)
                val = int(val, 0) & ((1 << (8 * n)) - 1)
                if off + n <= len(buf):
                    buf[off:off + n] = val.to_bytes(n, "little")
                    written[off:off + n] = b"\x01" * n
                break
    return buf, written


def props(body):
    out = []
    for m in re.finditer(r"Property::Property\s*\(\s*\(Property \*\)[^,]+,\s*\"([^\"]+)\",[^,]*,\s*(-?0x[0-9a-f]+|\d+),\s*\(void \*\)(0x[0-9a-f]+|\d+)\s*,\s*\(Type \*\)(\w+)((?:,\s*-?0x[0-9a-f]+|,\s*-?\d+)*)\)", body):
        name, flags, off, tvar, rest = m.groups()
        tm = re.search(re.escape(tvar) + r"\[0\] = (0x[0-9a-f]+|\d+);", body[:m.start()][::-1][:0] or body[:m.start()])
        tcode = None
        for mm in re.finditer(re.escape(tvar) + r"\[0\] = (0x[0-9a-f]+|\d+);", body[:m.start()]):
            tcode = int(mm.group(1), 0)
        rng = [int(x, 0) for x in re.findall(r"-?0x[0-9a-f]+|-?\d+", rest)]
        out.append(dict(name=name, offset=int(off, 0), type=tcode, flags=int(flags, 0), range=rng))
    return out


def f32(u):
    return struct.unpack("<f", struct.pack("<I", u & 0xFFFFFFFF))[0]


def decode(p, buf, written):
    o, t = p["offset"], p["type"]
    if t == 0x40:
        return buf[o], bool(written[o])
    if t == 0x20:
        u = int.from_bytes(buf[o:o + 4], "little")
        return round(f32(u), 7), all(written[o:o + 4])
    if t == 0x14:
        return int.from_bytes(buf[o:o + 4], "little", signed=True), all(written[o:o + 4])
    return int.from_bytes(buf[o:o + 4], "little"), all(written[o:o + 4])


def main():
    src, cls, out = sys.argv[1:4]
    text = open(src, encoding="utf-8").read()
    ci = func(text, cls + "::createInstance")
    gl = func(text, cls + "::getPropertyList")
    buf, written = sim_writes(ci)
    rows = []
    for p in props(gl):
        val, w = decode(p, buf, written)
        rng = p["range"]
        if p["type"] == 0x20:
            rng = [round(f32(x), 6) for x in rng]
        rows.append(dict(name=p["name"], offset=hex(p["offset"]), type={0x40: "bool", 0x20: "float", 0x14: "int"}.get(p["type"], hex(p["type"] or 0)),
                         group=bool(p["flags"] & 0x400000), default=val, written=w, range=rng))
    json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r in rows:
        print(f'{r["offset"]:>6} {r["type"]:5} {r["name"]:30} {r["default"]!s:>12} {"" if r["written"] else "(0:미기록)"} {r["range"]}')


if __name__ == "__main__":
    main()
