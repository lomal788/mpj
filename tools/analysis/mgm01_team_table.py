"""Convert the already available FUN_71001ee130 C initializer, without redecompiling it."""
import json,re,struct,sys
from pathlib import Path
ROOT=Path('C:/dev/mpj')
sys.stdout.reconfigure(encoding='utf-8')
s=(ROOT/'analysis/decomp/mgmet_main_more.c').read_text(encoding='utf-8').split('// ====')[1]
memory={}
types={v:int(w) for w,v in re.findall(r'undefined(4|8) \*(local_[0-9a-f]+);',s)}
for m in re.finditer(r'(local_[0-9a-f]+) = \(undefined(?:4|8) \*\)\s*bex::HeapModule::Alloc\s*\(1,(0x[0-9a-f]+|\d+),',s):
    memory[m[1]]=bytearray(int(m[2],0))
for v,b in memory.items():
    for m in re.finditer(r'(?:\*'+v+r'|'+v+r'\[(\d+)\]) = (0x[0-9a-f]+|\d+);',s):
        off=int(m[1] or 0)*types[v]; width=types[v]
        b[off:off+width]=int(m[2],0).to_bytes(width,'little')
    for m in re.finditer(r'\*\(undefined4 \*\)\('+v+r' \+ (\d+)\) = (0x[0-9a-f]+|\d+);',s):
        off=int(m[1])*types[v]
        b[off:off+4]=int(m[2],0).to_bytes(4,'little')
globals_={int(a,16):int(v,0) for a,v in re.findall(r'DAT_([0-9a-f]+) = (0x[0-9a-f]+|\d+);',s)}
rows=[]
pat=r'vector\((?:\(undefined8 \*\)0x|&DAT_)([0-9a-f]+),\(long \*\)&(local_[0-9a-f]+),(\d+)\);'
for a,var,n in re.findall(pat,s):
    addr=int(a,16)-8; idx=(addr-0x7101c145c8)//32
    assert (addr-0x7101c145c8)%32==0
    packed=globals_[addr]
    assert packed&0xffffffff==idx
    root=int(var[6:],16)
    candidates=[]
    for k in range(int(n)):
        v='local_'+format(root-k*24,'x')
        b=memory[v]
        assert len(b)%4==0
        candidates.append(list(struct.unpack('<'+'i'*(len(b)//4),b)))
    rows.append({'index':idx,'format':packed>>32,'candidates':candidates})
assert len(rows)==15
assert [len(r['candidates']) for r in rows]==[1,4,3,1,1,3,6,1,2,3,4,1,1,1,1]
def teams(row,candidate):
    out=[-1]*4
    for i,pid in enumerate(candidate):
        out[pid]=int(i!=0) if row['format'] in (4,6) else int(i>1) if row['format']==5 else 0
    return out
for r in rows:r['team_ids']=[teams(r,c) for c in r['candidates']]
out={'level':'실행: 변환','source':'analysis/decomp/mgmet_main_more.c main @0x71001ee130',
     'consumer':'analysis/decomp/mgm01_team_expand.c main @0x71001f1930','rows':rows}
(ROOT/'analysis/mgm01_team_table.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(rows,ensure_ascii=False))
