"""msbt ATR1(메시지별 속성) 읽기 — 메시지 창 형식·화자·위치 등 (web/docs/shell/message_window.md 7절).

bq.msbp 의 ATI2(속성 정의: 형식·목록 번호·오프셋)·ALB1(속성 이름)·ALI2(목록 항목 이름)로 ATR1 바이트를 이름으로 푼다.
main MessageModule 판독: ATR 레코드 +0x0d WindowType, +0x0e Character, +0x0f Position, +0x11 WindowInfo (mgmcommon 분석 msgwin_main_msgattr.c).
사용: python web/tools/analysis/msgwin_atr.py [로캘=koKR] [파일 이름 접두 …]  → analysis/msgwin_atr_<로캘>.txt
"""
import struct
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import msbt  # noqa: E402

ROOT = Path("c:/dev/mpj")
MSBP = ROOT / "extracted/bea/message~mess.nx.bea/mess/bin/bq.msbp"


def sections(buf):
    bom = buf[8:10]
    e = "<" if bom == b"\xff\xfe" else ">"
    nsec = struct.unpack_from(e + "H", buf, 0xE)[0]
    off = 0x20
    out = {}
    for _ in range(nsec):
        magic = buf[off:off + 4].decode("ascii")
        size = struct.unpack_from(e + "I", buf, off + 4)[0]
        out[magic] = (off + 0x10, size)
        off = off + 0x10 + (size + 0xF & ~0xF)
    return e, out


def hash_table_names(buf, e, body):
    n = struct.unpack_from(e + "I", buf, body)[0]
    names = {}
    for i in range(n):
        cnt, loff = struct.unpack_from(e + "II", buf, body + 4 + i * 8)
        p = body + loff
        for _ in range(cnt):
            ln = buf[p]
            name = buf[p + 1:p + 1 + ln].decode("ascii")
            idx = struct.unpack_from(e + "I", buf, p + 1 + ln)[0]
            names[idx] = name
            p += 1 + ln + 4
    return names


def read_msbp():
    buf = MSBP.read_bytes()
    e, sec = sections(buf)
    body, _ = sec["ATI2"]
    n = struct.unpack_from(e + "I", buf, body)[0]
    ati = [struct.unpack_from(e + "BBHI", buf, body + 4 + i * 8) for i in range(n)]
    alb = hash_table_names(buf, e, sec["ALB1"][0])
    body, _ = sec["ALI2"]
    nl = struct.unpack_from(e + "I", buf, body)[0]
    lists = []
    for i in range(nl):
        lo = struct.unpack_from(e + "I", buf, body + 4 + i * 4)[0]
        p = body + lo
        cnt = struct.unpack_from(e + "I", buf, p)[0]
        items = []
        for k in range(cnt):
            so = struct.unpack_from(e + "I", buf, p + 4 + k * 4)[0]
            s = buf[p + so:buf.index(b"\0", p + so)].decode("utf-8", "replace")
            items.append(s)
        lists.append(items)
    attrs = []
    for i, (typ, _pad, li, off) in enumerate(ati):
        attrs.append({"name": alb.get(i, f"attr{i}"), "type": typ, "list": li, "offset": off})
    return attrs, lists


def read_atr(buf):
    e, sec = sections(buf)
    if "ATR1" not in sec:
        return e, None, 0, []
    body, size = sec["ATR1"]
    n, esz = struct.unpack_from(e + "II", buf, body)
    recs = [buf[body + 8 + i * esz: body + 8 + (i + 1) * esz] for i in range(n)]
    labels = hash_table_names(buf, e, sec["LBL1"][0])
    return e, labels, esz, recs


def main():
    loc = sys.argv[1] if len(sys.argv) > 1 else "koKR"
    prefixes = sys.argv[2:] or ["mgm", "mg_common", "system"]
    attrs, lists = read_msbp()
    d = ROOT / f"extracted/bea/message~{loc}.nx.bea/mess/bin/{loc}"
    lines = [f"# msbt ATR1 ({loc}) — 도구 web/tools/analysis/msgwin_atr.py", "# 속성 정의(bq.msbp ATI2): "
             + ", ".join(f"{a['name']}@+0x{a['offset']:x}(type {a['type']}, list {a['list']})" for a in attrs), ""]
    lines.append("# 목록(ALI2): " + " / ".join(f"[{i}] " + ",".join(l[:40]) for i, l in enumerate(lists)))
    lines.append("")
    total = Counter()
    for f in sorted(d.glob("*.msbt")):
        if not any(f.stem.startswith(p) for p in prefixes):
            continue
        buf = f.read_bytes()
        e, labels, esz, recs = read_atr(buf)
        if labels is None:
            continue
        cnt = Counter()
        rows = []
        for i, r in enumerate(recs):
            vals = {}
            for a in attrs:
                o = a["offset"]
                if a["type"] == 9 and o < len(r):
                    v = r[o]
                    lst = lists[a["list"]] if a["list"] < len(lists) else []
                    vals[a["name"]] = lst[v] if v < len(lst) else v
            wt = vals.get("WindowType")
            cnt[(wt, vals.get("Character"), vals.get("Position"), vals.get("WindowInfo"))] += 1
            total[wt] += 1
            rows.append(f"  {labels.get(i, i)}: " + " ".join(f"{k}={v}" for k, v in vals.items()))
        lines.append(f"## {f.stem} (레코드 {len(recs)}, 크기 {esz})")
        for (wt, ch, pos, wi), c in cnt.most_common():
            lines.append(f"  {c:4d} × WindowType={wt} Character={ch} Position={pos} WindowInfo={wi}")
        lines += rows
        lines.append("")
    lines.insert(3, "# WindowType 합계: " + ", ".join(f"{k}={v}" for k, v in total.most_common()))
    out = ROOT / f"analysis/msgwin_atr_{loc}.txt"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(out, dict(total))


if __name__ == "__main__":
    main()
