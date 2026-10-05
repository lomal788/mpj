"""바이너리에서 ASCII 문자열(길이≥4)과 파일 오프셋을 뽑아 정규식으로 거른다.
사용: python tools/scene_strings.py <파일> <정규식> [최소길이]"""
import re
import sys
from pathlib import Path

b = Path(sys.argv[1]).read_bytes()
pat = re.compile(sys.argv[2])
n = int(sys.argv[3]) if len(sys.argv) > 3 else 4
for m in re.finditer(rb"[\x20-\x7e]{%d,}" % n, b):
    s = m.group().decode("ascii")
    if pat.search(s):
        print(f"{m.start():08x} {s}")
