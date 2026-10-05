"""장면 파라미터 이름의 해시 값(여러 알고리즘)이 데이터 파일 안에 있는지 찾는다.

대상: extracted/bea 아래 그래픽·애니·사운드 본체를 뺀 파일 + romfs 루트 파일.
해시: CRC32, FNV-1a 32/64, FNV-1 32, MurmurHash3 x86_32(seed 0), djb2, xxHash32(seed 0, xxhash 모듈이 있으면).
사용: python tools/scene_hash_search.py [이름 ...]   (기본: mg1801::Scene::Params 의 속성 이름 전부)
"""
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKIP = {".bntx", ".ftxb", ".fmdb", ".fskb", ".fmab", ".fvbb", ".fshb", ".fsnb", ".bnsh", ".bnbshpk", ".bfsha",
        ".fsst", ".fspj", ".bnvib", ".msbt", ".lyt", ".bgsh", ".xml", ".apx", ".mp4", ".bfstm"}
NAMES = ["is_debug", "chartNo", "bpm", "isLineDraw", "stopFrame", "isGenericBgm", "ButtonAction", "RhythmNpcEnable",
         "RhythmNpcMotNo", "CutRotEnable", "CutRotSpeed", "JustRangeFrame", "ComControl", "ClearRankFixed",
         "SyncIdleMot", "HeadLookWeight", "acc", "OutlineAloneSize2", "CpuMiss", "mg1801::Params", "mg1801::Scene::Params",
         "mg1801"]


def fnv1a32(s):
    h = 0x811C9DC5
    for c in s:
        h = ((h ^ c) * 0x01000193) & 0xFFFFFFFF
    return h


def fnv1_32(s):
    h = 0x811C9DC5
    for c in s:
        h = ((h * 0x01000193) & 0xFFFFFFFF) ^ c
    return h


def fnv1a64(s):
    h = 0xCBF29CE484222325
    for c in s:
        h = ((h ^ c) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h


def murmur3_32(data, seed=0):
    c1, c2 = 0xCC9E2D51, 0x1B873593
    h = seed
    n = len(data) // 4
    for i in range(n):
        k = struct.unpack_from("<I", data, 4 * i)[0]
        k = (k * c1) & 0xFFFFFFFF
        k = ((k << 15) | (k >> 17)) & 0xFFFFFFFF
        k = (k * c2) & 0xFFFFFFFF
        h ^= k
        h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
        h = (h * 5 + 0xE6546B64) & 0xFFFFFFFF
    tail = data[4 * n:]
    k = 0
    for i, b in enumerate(tail):
        k |= b << (8 * i)
    if tail:
        k = (k * c1) & 0xFFFFFFFF
        k = ((k << 15) | (k >> 17)) & 0xFFFFFFFF
        k = (k * c2) & 0xFFFFFFFF
        h ^= k
    h ^= len(data)
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def djb2(s):
    h = 5381
    for c in s:
        h = (h * 33 + c) & 0xFFFFFFFF
    return h


def hashes(name):
    s = name.encode("utf-8")
    out = {"crc32": struct.pack("<I", zlib.crc32(s)), "fnv1a32": struct.pack("<I", fnv1a32(s)),
           "fnv1_32": struct.pack("<I", fnv1_32(s)), "fnv1a64": struct.pack("<Q", fnv1a64(s)),
           "murmur3": struct.pack("<I", murmur3_32(s)), "djb2": struct.pack("<I", djb2(s))}
    try:
        import xxhash
        out["xxh32"] = struct.pack("<I", xxhash.xxh32(s).intdigest())
        out["xxh64"] = struct.pack("<Q", xxhash.xxh64(s).intdigest())
    except ImportError:
        pass
    return out


def main():
    names = sys.argv[1:] or NAMES
    pats = [(n, k, v) for n in names for k, v in hashes(n).items()]
    files = [p for p in (ROOT / "extracted/bea").rglob("*") if p.is_file() and p.suffix not in SKIP]
    files += [p for p in (ROOT / "extracted/romfs").iterdir() if p.is_file()]
    files += [ROOT / "extracted/romfs/nro/NX_Release/mg1801.nro"]
    hits = 0
    for p in files:
        b = p.read_bytes()
        for n, k, v in pats:
            i = b.find(v)
            if i >= 0:
                hits += 1
                print("HIT", n, k, v.hex(), p.relative_to(ROOT), hex(i))
    print("files", len(files), "patterns", len(pats), "hits", hits)


if __name__ == "__main__":
    main()
