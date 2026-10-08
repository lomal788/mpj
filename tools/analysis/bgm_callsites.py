"""NRO 안 함수 호출 지점 역어셈블(capstone) — bl 앞 8명령·adrp+add 문자열·w1 인자(FadeTimePreset·BGM 종류)를 보인다.

사용: python bgm_callsites.py <menu00.nro> <호출 대상 이름 정규식> [<문자열 정규식>]
근거 정리: web/docs/engine/04_sound.md §12.14, 결과 보관 analysis/decomp/bgm_callsites_dis.c
"""
import csv, re, sys
from pathlib import Path as _P
sys.path.insert(0, str(_P(__file__).resolve().parent))
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
from nro import Image, BASE

ROOT = Path('C:/dev/mpj')
mod = sys.argv[1]
pat = re.compile(sys.argv[2])
strpat = re.compile(sys.argv[3]) if len(sys.argv) > 3 else None
img = Image(ROOT / f'extracted/romfs/nro/NX_Release/{mod}')
rows = list(csv.DictReader((ROOT / f'analysis/functions/{mod}.tsv').open(encoding='utf-8'), delimiter='\t'))
names = {int(r['address'], 16): r['name'] for r in rows}
funcs = sorted((int(r['address'], 16), int(r['size'] or 0), r['name']) for r in rows if int(r['size'] or 0) > 16)
targets = {a for a, n in names.items() if pat.search(n)}
cs = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
cs.detail = False
for fa, fs, fn in funcs:
    if fa - BASE + fs > len(img.mem):
        continue
    ins = list(cs.disasm(bytes(img.mem[fa - BASE:fa - BASE + fs]), fa))
    regs = {}
    hist = []
    for i in ins:
        txt = f'{i.address:x} {i.mnemonic} {i.op_str}'
        ops = [o.strip() for o in i.op_str.split(',')]
        note = ''
        if i.mnemonic == 'adrp':
            regs[ops[0]] = int(ops[1].lstrip('#'), 16)
        elif i.mnemonic == 'add' and len(ops) == 3 and ops[1] in regs and ops[2].startswith('#'):
            va = regs[ops[1]] + int(ops[2].lstrip('#'), 16)
            try:
                s = img.string(va)
                if s and s.isprintable() and len(s) > 3:
                    note = f' ; "{s}"'
                    if strpat and strpat.search(s):
                        print(f'STR {fn} @{i.address:x} "{s}"')
            except Exception:
                pass
        elif i.mnemonic == 'ldr' and ops[0].startswith('s') and len(ops) >= 2 and ops[1].startswith('[x') and ops[1].split(']')[0][1:] in regs:
            m = re.match(r'\[(x\d+), #(0x[0-9a-f]+|\d+)\]', i.op_str.split(', ', 1)[1])
            if m:
                va = regs[m.group(1)] + int(m.group(2), 0)
                note = f' ; ={img.f32(va)}'
        if i.mnemonic == 'bl' and i.op_str.startswith('#0x'):
            t = int(i.op_str[1:], 16)
            note = ' ; ' + names.get(t, '?')
            if t in targets:
                print(f'== {fn} @{i.address:x} -> {names[t]}')
                for h in hist[-8:]:
                    print('    ' + h)
        hist.append(txt + note)
