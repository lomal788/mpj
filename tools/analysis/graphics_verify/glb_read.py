"""Tiny glb reader (no dependency on the converter): accessors -> numpy arrays."""
import json
import struct

import numpy as np

CT = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(path):
    b = open(path, "rb").read()
    magic, ver, total = struct.unpack_from("<III", b, 0)
    assert magic == 0x46546C67 and ver == 2 and total == len(b)
    jl, jt = struct.unpack_from("<II", b, 12)
    js = json.loads(b[20:20 + jl])
    bl, bt = struct.unpack_from("<II", b, 20 + jl)
    binc = b[28 + jl:28 + jl + bl]
    return js, binc


def accessor(js, binc, i):
    a = js["accessors"][i]
    v = js["bufferViews"][a["bufferView"]]
    dt = CT[a["componentType"]]
    n = NC[a["type"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    arr = np.frombuffer(binc, dtype=dt, count=a["count"] * n, offset=off)
    return arr.reshape(a["count"], n) if n > 1 else arr
