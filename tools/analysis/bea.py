import argparse
import struct
import sys
from pathlib import Path

import zstandard

_zstd = zstandard.ZstdDecompressor()


def _str(buf, off):
    if off == 0:
        return None
    n = struct.unpack_from("<H", buf, off)[0]
    return buf[off + 2:off + 2 + n].decode("utf-8")


def parse(buf):
    if buf[:4] != b"SCNE":
        raise ValueError("not SCNE")
    version = struct.unpack_from("<I", buf, 8)[0]
    major2 = version >> 16 & 0xFF
    file_count, ref_count = struct.unpack_from("<II", buf, 0x20)
    if major2 < 6:
        raise ValueError(f"unsupported version 0x{version:08x}")
    asset_off, info_off, dict_off, name_off, comp_off, ref_off = struct.unpack_from("<6Q", buf, 0x28)
    arc = {
        "version": version,
        "name": _str(buf, name_off),
        "compression": _str(buf, comp_off),
        "refs": [_str(buf, struct.unpack_from("<Q", buf, ref_off + i * 8)[0]) for i in range(ref_count)],
        "files": [],
    }
    for i in range(file_count):
        a = struct.unpack_from("<Q", buf, info_off + i * 8)[0]
        if buf[a:a + 4] != b"ASST":
            raise ValueError(f"bad ASST @0x{a:x}")
        unk, unk2, fsize, usize = struct.unpack_from("<HHII", buf, a + 0x10)
        ftype = buf[a + 0x1C:a + 0x24].rstrip(b"\0").decode("ascii", "replace")
        unk3, id1, id2, foff, fname = struct.unpack_from("<IQQqQ", buf, a + 0x24)
        arc["files"].append({
            "name": _str(buf, fname),
            "type": ftype,
            "flags": (unk, unk2),
            "unk3": unk3,
            "id": (id1, id2),
            "offset": foff,
            "size": fsize,
            "usize": usize,
        })
    return arc


def file_data(buf, f):
    raw = buf[f["offset"]:f["offset"] + f["size"]]
    if f["size"] != f["usize"] or raw[:4] == b"\x28\xb5\x2f\xfd":
        return _zstd.decompress(raw, max_output_size=max(f["usize"], 1))
    return raw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["list", "extract"])
    ap.add_argument("bea", nargs="+")
    ap.add_argument("--out")
    a = ap.parse_args()
    for p in a.bea:
        buf = Path(p).read_bytes()
        arc = parse(buf)
        if a.cmd == "list":
            print(f"# {p} name={arc['name']} ver=0x{arc['version']:08x} comp={arc['compression']} files={len(arc['files'])} refs={arc['refs']}")
            for f in arc["files"]:
                print(f"{f['usize']:10d} {f['size']:10d} {f['type']:8s} {f['name']}")
            continue
        root = Path(a.out) / Path(p).name
        for f in arc["files"]:
            dst = root / f["name"]
            dst.parent.mkdir(parents=True, exist_ok=True)
            data = file_data(buf, f)
            if len(data) != f["usize"]:
                print(f"size mismatch {p}:{f['name']} {len(data)} != {f['usize']}", file=sys.stderr)
            dst.write_bytes(data)
        print(f"{p}: {len(arc['files'])} files", flush=True)


if __name__ == "__main__":
    main()
