"""mgA: mg0906 Scene::Params 트리(중첩 SceneParams::*) 기본값 추출.
Params::Params 와 SceneParams::Com::Com(+0x270) 의 쓰기를 모사하고, getPropertyList 를 재귀로 따라가
'경로 = 값' 표를 만든다. 중첩 오프셋은 8바이트 getter(add x0,x0,#imm; ret)를 디스어셈블해 얻는다.
사용: python tools/mgA_params0906.py  → analysis/mgA_mg0906_params.json
"""
import json, re, struct, sys
sys.path.insert(0, __file__.replace("\\", "/").rsplit("/", 1)[0])
from nro import Image, BASE
from mgA_params import sim_writes, f32, SIZES

SRC = "analysis/decomp/mg0906.nro.c"
NRO = "extracted/romfs/nro/NX_Release/mg0906.nro"


def funcs(text):
    out = {}
    for m in re.finditer(r"(?m)^// ==== ([0-9a-f]+) (\S+)\n(.*?)(?=^// ==== |\Z)", text, re.S):
        out[m.group(2)] = (int(m.group(1), 16), m.group(3))
    return out


def sim_this(body, base, buf, written):
    for line in body.splitlines():
        m = re.search(r"\*\((\w+) \*\)\(this \+ (0x[0-9a-f]+|\d+)\) = (-?0x[0-9a-f]+|-?\d+);", line)
        if not m:
            continue
        n = SIZES.get(m.group(1), 8)
        off = base + int(m.group(2), 0)
        v = int(m.group(3), 0) & ((1 << (8 * n)) - 1)
        buf[off:off + n] = v.to_bytes(n, "little")
        written[off:off + n] = b"\x01" * n


def getter_off(img, syms, cls, name):
    a = syms.get(f"{cls}::Get{name}")
    if a is None:
        return None
    w = struct.unpack_from("<I", img.mem, a - BASE)[0]
    if (w & 0xFF800000) == 0x91000000:  # add x0,x0,#imm
        imm = (w >> 10) & 0xFFF
        if (w >> 22) & 1:
            imm <<= 12
        return imm
    if w == 0xD65F03C0:
        return 0
    return None


def plist(F, cls):
    body = F.get(cls + "::getPropertyList", (0, ""))[1]
    props = []
    pos = 0
    pat_flat = re.compile(r"Property::Property\s*\(\s*\(Property \*\)[^,]+,\s*\"([^\"]+)\",[^,]*,\s*(-?0x[0-9a-f]+|\d+)\s*,\s*\(void \*\)(0x[0-9a-f]+|\d+)\s*,\s*\((Type|Value) \*\)([\w&]+)((?:,\s*'?\\?[-\w]+'?)*)\)")
    pat_nest = re.compile(r"(\w+)::getStaticTypeinfo\(\);.*?Property::Property\s*\(\s*\(Property \*\)[^,]+,\s*\"([^\"]+)\",[^,]*,\s*(0x[0-9a-f]+),\s*\(Custom(Array)?Imm \*\)", re.S)
    for m in pat_flat.finditer(body):
        name, flags, off, kind, tvar, rest = m.groups()
        tcode = None
        if kind == "Type":
            for mm in re.finditer(re.escape(tvar) + r"\[0\] = (0x[0-9a-f]+|\d+);", body[:m.start()]):
                tcode = int(mm.group(1), 0)
        else:
            tcode = "enum"
        rng = [x for x in re.findall(r"-?0x[0-9a-f]+|-?\d+", rest)]
        props.append(dict(kind="flat", name=name, off=int(off, 0), type=tcode, range=rng, pos=m.start()))
    for m in pat_nest.finditer(body):
        sub, name, flags, arr = m.groups()
        props.append(dict(kind="array" if arr else "nest", name=name, sub=sub, pos=m.start()))
    props.sort(key=lambda p: p["pos"])
    return props


def val(buf, written, off, t):
    if t == 0x40:
        return bool(buf[off]), written[off]
    if t == 0x20:
        return round(f32(int.from_bytes(buf[off:off + 4], "little")), 7), all(written[off:off + 4])
    return int.from_bytes(buf[off:off + 4], "little", signed=True), all(written[off:off + 4])


def walk(F, img, syms, cls, base, buf, written, path, rows, ns="mg0906::SceneParams::"):
    for p in plist(F, cls):
        if p["kind"] == "flat":
            v, w = val(buf, written, base + p["off"], p["type"])
            rng = p["range"]
            if p["type"] == 0x20:
                rng = [round(f32(int(x, 0)), 6) for x in rng]
            rows.append(dict(path=path + p["name"], abs=hex(base + p["off"]), off=hex(p["off"]), cls=cls,
                             type={0x40: "bool", 0x20: "float", 0x14: "int"}.get(p["type"], str(p["type"])),
                             default=v, written=bool(w), range=rng))
        elif p["kind"] == "nest":
            o = getter_off(img, syms, cls, p["name"])
            subcls = ns + p["sub"] if not p["sub"].startswith("mg0906") else p["sub"]
            if o is None:
                rows.append(dict(path=path + p["name"], note="getter offset unknown", cls=subcls))
                continue
            walk(F, img, syms, subcls, base + o, buf, written, path + p["name"] + ".", rows)
        else:
            rows.append(dict(path=path + p["name"] + "[]", note="array of " + p["sub"], cls=cls))


def main():
    text = open(SRC, encoding="utf-8").read()
    F = funcs(text)
    img = Image(NRO)
    syms = {}
    for name, value, size, sh in img.sym_by_index:
        pass
    # demangled names from function list
    for line in open("analysis/functions/mg0906.nro.tsv", encoding="utf-8"):
        a, s, n = line.split("\t")[:3]
        if a.startswith("71"):
            syms.setdefault(n, int(a, 16))
    buf = bytearray(0x400)
    wr = bytearray(0x400)
    sim_this(F["mg0906::Scene::Params::Params"][1], 0, buf, wr)
    sim_this(F["mg0906::SceneParams::Com::Com"][1], 0x270, buf, wr)
    rows = []
    walk(F, img, syms, "mg0906::Scene::Params", 0, buf, wr, "", rows)
    # ComTurn vector
    turns = []
    tb, tw = sim_writes(F["mg0906::SceneParams::Com::Com"][1].split("Alloc")[1], var="plVar3")
    for i in range(0x1f8 // 0x18):
        o = i * 0x18
        turns.append(dict(i=i, direction=int.from_bytes(tb[o + 8:o + 12], "little"),
                          start_distance=round(f32(int.from_bytes(tb[o + 0xc:o + 0x10], "little")), 4),
                          end_distance=round(f32(int.from_bytes(tb[o + 0x10:o + 0x14], "little")), 4),
                          check_hit_wall_distance_range=round(f32(int.from_bytes(tb[o + 0x14:o + 0x18], "little")), 4)))
    json.dump(dict(params=rows, com_turns=turns), open("analysis/mgA_mg0906_params.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for r in rows:
        if "note" in r:
            print(f'{"":6} {r["path"]:60} ({r["note"]})')
        else:
            print(f'{r["abs"]:>6} {r["type"]:5} {r["path"]:60} {r["default"]!s:>12} {"" if r["written"] else "(미기록)"} {r["range"]}')
    for t in turns:
        print("turn", t)


if __name__ == "__main__":
    main()
