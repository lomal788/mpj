"""디컴파일 파일(analysis/decomp/<nro>.c)에서 함수 본문을 이름·주소 정규식으로 뽑는다.
사용: python tools/rcB_fn.py <mg1804|mg1805> <정규식> [최대함수수]
"""
import re, sys
from pathlib import Path
p = Path(__file__).resolve().parents[3] / 'analysis/decomp' / f'{sys.argv[1]}.nro.c'
rx = re.compile(sys.argv[2])
lim = int(sys.argv[3]) if len(sys.argv) > 3 else 50
cur, buf, n = None, [], 0
out = sys.stdout
def flush():
    global n
    if cur and rx.search(cur) and n < lim:
        out.write(''.join(buf)); n += 1
for line in open(p, encoding='utf-8', errors='replace'):
    if line.startswith('// ==== '):
        flush(); cur, buf = line, [line]
    else:
        buf.append(line)
flush()
