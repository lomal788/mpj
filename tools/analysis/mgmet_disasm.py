"""Exceptional AArch64 reads where Ghidra C omits arguments or jump-table bodies."""
import csv
import sys
from pathlib import Path
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM
from nro import Image, BASE

ROOT = Path('C:/dev/mpj')
img = Image(ROOT/'extracted/romfs/nro/NX_Release/mgmet.nro')
names = {int(r['address'],16): r['name'] for r in csv.DictReader((ROOT/'analysis/functions/mgmet.nro.tsv').open(encoding='utf-8'),delimiter='\t')}
cs = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
lines = ['// mgmet.nro only. Raw range reads; source unchanged.']
for arg in sys.argv[1:]:
    start, end = [int(x,16) for x in arg.split(':')]
    lines.append(f'// RANGE mgmet @{start:x}..{end:x}')
    for ins in cs.disasm(bytes(img.mem[start-BASE:end-BASE]), start):
        note = ''
        if ins.mnemonic == 'bl' and ins.op_str.startswith('#0x'):
            note = ' ; ' + names.get(int(ins.op_str[1:],16),'unknown')
        lines.append(f'{ins.address:x} {ins.mnemonic} {ins.op_str}{note}')
dest = ROOT/'analysis/decomp/mgmet_stage2_dis2.c'
with dest.open('a',encoding='utf-8') as f:
    f.write('\n'.join(lines)+'\n')
print('\n'.join(lines))
