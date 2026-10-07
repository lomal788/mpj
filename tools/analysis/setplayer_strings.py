"""setplayer(플레이어 설정 흐름) 디컴파일 C 의 main NSO 문자열 주소를 실제 문자열로 풀어 쓴다.

사용: python web/tools/analysis/setplayer_strings.py <C 파일> [<C 파일> ...]
"""
import re
import sys
from pathlib import Path

BIN = Path("c:/dev/mpj/extracted/exefs/main.decomp.bin").read_bytes()
BASE = 0x7100000000
PAT = re.compile(r"0x(7101[0-9a-f]{6})")


def cstr(va):
    o = va - BASE
    if o < 0 or o >= len(BIN):
        return None
    e = BIN.find(b"\0", o, o + 400)
    if e < 0:
        return None
    s = BIN[o:e]
    try:
        t = s.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not t or any(ord(c) < 0x20 for c in t):
        return None
    return t


def main():
    seen = {}
    for p in sys.argv[1:]:
        cur = ""
        for line in Path(p).read_text(encoding="utf-8").splitlines():
            if line.startswith("// ===="):
                cur = " ".join(line.split()[2:4])
            for m in PAT.finditer(line):
                va = int(m.group(1), 16)
                seen.setdefault(va, set()).add(cur)
    for va in sorted(seen):
        s = cstr(va)
        if s is None:
            continue
        print(f"0x{va:x}\t{s!r}\t{','.join(sorted(seen[va]))}")


if __name__ == "__main__":
    main()
