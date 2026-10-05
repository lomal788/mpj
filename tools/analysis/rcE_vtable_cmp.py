"""rcE: mg1801~mg1810 Scene vtable 슬롯 비교표 (analysis/notes/rhythm_scene_vtables.txt 기반, 데이터 수준).
사용: python tools/rcE_vtable_cmp.py [out.md]
분류: G = 게임 NRO 가 정의한 함수(이름이 mg18NN::), L = 게임 NRO 안에 있지만 기반 클래스 이름(인라인/약한 정의 사본),
      I = IMPORT(main 의 기반 구현을 그대로 씀).
"""
import re, sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
src = (ROOT / 'analysis/notes/rhythm_scene_vtables.txt').read_text(encoding='utf-8')
blocks = re.split(r'(?m)^# ', src)
games = {}
for b in blocks:
    m = re.match(r'_ZTVN6(mg18\d\d)5SceneE @(0x[0-9a-f]+) size=(\d+)', b)
    if not m:
        continue
    g = m.group(1)
    slots = {}
    for line in b.splitlines()[1:]:
        mm = re.match(r'\s+\+0x([0-9a-f]+)\s+(0x[0-9a-f]+)\s+(.*)$', line)
        if not mm:
            continue
        off = int(mm.group(1), 16)
        addr = int(mm.group(2), 16)
        name = mm.group(3).strip()
        if name.startswith('IMPORT'):
            kind, nm = 'I', name[len('IMPORT '):]
        elif name.startswith(g + '::'):
            kind, nm = 'G', name
        else:
            kind, nm = 'L', name
        slots[off] = (kind, nm, addr)
    games[g] = dict(addr=m.group(2), size=int(m.group(3)), slots=slots)

order = sorted(games)
offs = sorted(set(o for g in games.values() for o in g['slots']))

def short(nm):
    return nm.split('::')[-1]

rows = []
for o in offs:
    kinds = [games[g]['slots'].get(o, ('-', '', 0)) for g in order]
    if any(k[0] == 'G' for k in kinds):
        names = sorted(set(short(k[1]) for k in kinds))
        rows.append((o, names, ''.join(k[0] for k in kinds), kinds))

out = []
out.append('| 슬롯 | 이름 | ' + ' | '.join(g[2:] for g in order) + ' |')
out.append('|---|---|' + '---|' * len(order))
for o, names, ks, kinds in rows:
    cells = []
    for k in kinds:
        cells.append('**G**' if k[0] == 'G' else ('L' if k[0] == 'L' else 'I'))
    out.append(f'| +0x{o:03x} | {"/".join(names)} | ' + ' | '.join(cells) + ' |')
summary = {g: sum(1 for o in offs if games[g]['slots'].get(o, ('',))[0] == 'G') for g in order}
out.append('')
out.append('게임별 G 슬롯 수: ' + ', '.join(f'{g} {n}' for g, n in summary.items()))
# mg1810 G 주소
out.append('')
out.append('mg1810 G 슬롯 주소: ' + ', '.join(f'+0x{o:03x}={short(games["mg1810"]["slots"][o][1])}@0x{games["mg1810"]["slots"][o][2]:x}' for o in offs if games['mg1810']['slots'].get(o, ('',))[0] == 'G'))
# L/I 차이(같은 슬롯이 게임에 따라 L 과 I 로 갈리는 곳)
diffLI = []
for o in offs:
    ks = set(games[g]['slots'].get(o, ('-',))[0] for g in order)
    if 'G' not in ks and len(ks) > 1:
        diffLI.append(f'+0x{o:03x}:' + ''.join(games[g]['slots'].get(o, ('-',))[0] for g in order))
out.append('')
out.append('G 없이 L/I 만 갈리는 슬롯(게임 01..10 순서): ' + (', '.join(diffLI) if diffLI else '없음'))
text = '\n'.join(out)
print(text)
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(text, encoding='utf-8')
