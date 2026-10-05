"""Cross-check of baked skeletal clips: python re-evaluation of the raw FRES curves (from `graphics_bfres2gltf dump --keys`)
against the local bone TRS that three.js AnimationMixer produces from the glb (verify_three.json samples).

usage: curve_check.py <set> <model> <fmdb> <fskb>...
"""
import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
EXE = os.path.join(ROOT, "web", "tools", "analysis", "graphics_bfres2gltf", "bin", "Release", "net7.0", "graphics_bfres2gltf.exe")


def ev(c, f):
    fr = c["frames"]
    ks = c["keys"]
    s = c["scale"] or 1.0
    o = c["offset"]
    t = c["type"]
    if t in ("StepInt", "StepBool", "BakedInt", "BakedBool", "BakedFloat"):
        i = 0
        while i + 1 < len(fr) and fr[i + 1] <= f:
            i += 1
        return ks[i][0] * (s if t == "BakedFloat" else 1) + o
    if f <= fr[0]:
        return ks[0][0] * s + o
    if f >= fr[-1]:
        return ks[-1][0] * s + o
    i = 0
    while i + 1 < len(fr) and fr[i + 1] <= f:
        i += 1
    u = (f - fr[i]) / (fr[i + 1] - fr[i])
    k = ks[i]
    if t == "Cubic":
        return k[0] * s + o + k[1] * s * u + k[2] * s * u * u + k[3] * s * u * u * u
    return k[0] * s + o + k[1] * s * u


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz]


def euler_xyz(x, y, z):
    qx = [math.sin(x / 2), 0, 0, math.cos(x / 2)]
    qy = [0, math.sin(y / 2), 0, math.cos(y / 2)]
    qz = [0, 0, math.sin(z / 2), math.cos(z / 2)]
    return qmul(qz, qmul(qy, qx))


def main():
    set_, model, fmdb = sys.argv[1:4]
    fskbs = sys.argv[4:]
    tmp = os.path.join(ROOT, "extracted", "converted", "graphics", set_, "meta", model + ".curves.json")
    subprocess.run([EXE, "dump", "--keys", tmp, fmdb] + fskbs, check=True, capture_output=True)
    dump = json.load(open(tmp, encoding="utf-8"))
    bones = {b["name"]: b for b in dump[0]["models"][0]["skeleton"]["bones"]}
    ver = json.load(open(os.path.join(ROOT, "extracted", "converted", "graphics", set_, "verify_three.json"), encoding="utf-8"))
    clips = ver["models"][model]["clips"]
    worst = {"t": 0.0, "q": 0.0, "s": 0.0}
    n = 0
    for d in dump[1:]:
        for a in d.get("skeletalAnims", []):
            if a["name"] not in clips:
                continue
            for frame, sample in clips[a["name"]]["samples"].items():
                f = float(frame)
                for ba in a["boneAnims"]:
                    if ba["name"] not in sample:
                        continue
                    b = bones[ba["name"]]
                    S = list(ba["S"]) if "Scale" in ba["base"] else ([1, 1, 1] if "ScaleOne" in ba["transform"] else list(b["S"]))
                    R = list(ba["R"]) if "Rotate" in ba["base"] else ([0, 0, 0, 0] if "RotateZero" in ba["transform"] else list(b["R"]))
                    T = list(ba["T"]) if "Translate" in ba["base"] else ([0, 0, 0] if "TranslateZero" in ba["transform"] else list(b["T"]))
                    for c in ba["curves"]:
                        off = int(c["target"], 16)
                        v = ev(c, f)
                        if 0x04 <= off <= 0x0C:
                            S[(off - 4) // 4] = v
                        elif 0x10 <= off <= 0x18:
                            T[(off - 0x10) // 4] = v
                        elif 0x20 <= off <= 0x2C:
                            R[(off - 0x20) // 4] = v
                    q = euler_xyz(R[0], R[1], R[2])
                    got = sample[ba["name"]]
                    dq = min(sum(abs(q[i] - got["q"][i]) for i in range(4)), sum(abs(-q[i] - got["q"][i]) for i in range(4)))
                    worst["q"] = max(worst["q"], dq)
                    worst["t"] = max(worst["t"], max(abs(T[i] - got["t"][i]) for i in range(3)))
                    worst["s"] = max(worst["s"], max(abs(S[i] - got["s"][i]) for i in range(3)))
                    n += 1
    print(json.dumps({"set": set_, "model": model, "comparisons": n, "maxAbsDiff": worst}))


if __name__ == "__main__":
    main()
