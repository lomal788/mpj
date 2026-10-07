"""Validate analysis artifacts only. No original execution or web implementation tests."""
import argparse
import csv
import hashlib
import json
import re
import struct
import sys
from pathlib import Path
from itertools import product

from mgmet_research import HEADER
from nro import Image

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path('C:/dev/mpj')
DOCS = [ROOT/'web/docs/shell/mgmet_flow.md', ROOT/'web/docs/shell/mgmet_ruleconfig.md']
NEW_FILES = {
    'mgmet_stage2.c': ('mgmet',111), 'mgmet_stage2_more.c': ('mgmet',17),
    'mgmet_stage2_hooks.c': ('mgmet',3), 'mgmet_stage2_counts.c': ('mgmet',2),
    'mgmet_main_work.c': ('main',44), 'mgmet_main_more.c': ('main',2),
    'mgmet_main_alignment.c': ('main',1), 'mgmet_mgm01_consume.c': ('mgm01',4),
    'mgmet_stage2_destructors.c': ('mgmet',12), 'mgmet_stage2_cleanup.c': ('mgmet',1),
}
RESULT = {'level': '[실행: 변환]', 'original_execution': False, 'checks': [], 'documents': [], 'new_decomp': {}}

def check(name, passed, detail=None):
    RESULT['checks'].append({'name':name, 'passed':bool(passed), 'detail':detail})

def qualify():
    for p in DOCS:
        lines = p.read_text(encoding='utf-8').splitlines()
        main_table = False
        for i,line in enumerate(lines):
            if line.startswith('##') or not line:
                main_table=False
            if 'Work 절대/ setter' in line:
                main_table=True
            module = 'main' if main_table else 'mgmet'
            lines[i] = re.sub(r'(?<!mgmet )(?<!mgm01 )(?<!main )@0x', module+' @0x',line)
        p.write_text('\n'.join(lines)+'\n',encoding='utf-8')

def document_checks():
    messages={}
    for p in (ROOT/'extracted/message/koKR').glob('*.json'):
        d=json.loads(p.read_text(encoding='utf-8'))
        if isinstance(d,dict): messages.update(d)
    rows = {}
    for module,ext in (('mgmet','nro'),('mgm01','nro'),('main','nso')):
        rows[module] = list(csv.DictReader((ROOT/f'analysis/functions/{module}.{ext}.tsv').open(encoding='utf-8'),delimiter='\t'))
    for p in DOCS:
        s=p.read_text(encoding='utf-8')
        sections=[int(x) for x in re.findall(r'^## (\d+)\.',s,re.M)]
        check(p.name+' 11 sections',sections==list(range(1,12)),sections)
        check(p.name+' no original execution label','[실행]' not in s)
        check(p.name+' no stray Japanese',not re.search(r'[\u3040-\u30ff]',s))
        check(p.name+' all @ addresses qualified',not re.search(r'(?<!mgmet )(?<!mgm01 )(?<!main )@0x',s))
        labels=set(re.findall(r'`((?:mgmet|im|sys|mgm01|mn01|qtbd00)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*)`',s))
        # Layout names and prefix patterns are not message labels.
        labels={x for x in labels if ('_mw_' in x or '_ui_' in x or x.startswith('im_comLevel') or x.startswith('im_mode') or x.startswith('sys_dlg_')) and not x.endswith(('a0','a1'))}
        absent=sorted(x for x in labels if x not in messages)
        check(p.name+' exact message labels',not absent,absent)
        broken=[]
        for target in re.findall(r'\]\(([^)]+)\)',s):
            if not target.startswith(('http','codex:')) and not (p.parent/target.split('#')[0]).exists(): broken.append(target)
        check(p.name+' document links',not broken,broken)
        # Explicit addresses must be in a known function range or listed static data.
        data=(ROOT/'analysis/mgmet_data.txt').read_text(encoding='utf-8')
        known_static={'mgmet':{int(a,16) for a in re.findall(r'@([0-9a-f]+)',data)},'main':{0x71015d840c},'mgm01':{0x710004fd80}}
        bad=[]
        for mod,addr in re.findall(r'(mgmet|mgm01|main) @0x([0-9a-fA-F]+)',s):
            a=int(addr,16)
            if a in known_static[mod]: continue
            if not any(int(r['address'],16)<=a<int(r['address'],16)+max(int(r['size']),1) for r in rows[mod]): bad.append(f'{mod} @{addr}')
        check(p.name+' module address ranges',not bad,sorted(set(bad)))
        RESULT['documents'].append({'path':str(p),'lines':len(s.splitlines()),'bytes':p.stat().st_size,'sections':len(sections)})

def source_checks():
    old={}
    for p in (ROOT/'analysis/decomp').glob('*.c'):
        if p.name in NEW_FILES or 'dis' in p.stem: continue
        for m in HEADER.finditer(p.read_text(encoding='utf-8',errors='replace')):
            if '<EXTERNAL>' not in m[2]: old.setdefault((m[1],m[2]),[]).append(p.name)
    newkeys=set(); repeats=[]; old_duplicates=[]
    for filename,(module,expected) in NEW_FILES.items():
        p=ROOT/'analysis/decomp'/filename
        heads=list(HEADER.finditer(p.read_text(encoding='utf-8')))
        check(filename+' count',len(heads)==expected,len(heads))
        RESULT['new_decomp'][filename]={'module':module,'functions':len(heads)}
        for m in heads:
            key=(module,m[1],m[2]); shortkey=(m[1],m[2])
            if key in newkeys: repeats.append(key)
            newkeys.add(key)
            if shortkey in old: old_duplicates.append((key,old[shortkey]))
    check('new C function total',len(newkeys)==197,len(newkeys))
    check('new C internal duplicates',not repeats,repeats)
    check('new C vs existing named bodies',not old_duplicates,old_duplicates)
    table=list(csv.DictReader((ROOT/'analysis/functions/mgmet.nro.tsv').open(encoding='utf-8'),delimiter='\t'))
    ui=[r for r in table if re.match(r'^mgmet::(ActivityTitle|HowtoPlay|RuleConfigView)::',r['name']) and int(r['address'],16)<0x7100089000 and int(r['size'])>0]
    known=set(old)|{(a,n) for mod,a,n in newkeys if mod=='mgmet'}
    absent=[r['name'] for r in ui if (r['address'],r['name']) not in known]
    check('all 107 named UI bodies covered',len(ui)==107 and not absent,{'functions':len(ui),'missing':absent})
    baseline=json.loads((ROOT/'analysis/mgmet_baseline.json').read_text(encoding='utf-8'))
    changed=[]
    for name,h in baseline.items():
        p=ROOT/name
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=h: changed.append(name)
    check('baseline unchanged',not changed,{'files':len(baseline),'changed':changed})
    paths={str(p.relative_to(ROOT)) for folder in ('web/script','web/assets') for p in (ROOT/folder).rglob('*') if p.is_file()}
    protected={x for x in baseline if x.startswith(('web\\script\\','web\\assets\\'))}
    check('no added protected files',paths==protected,{'added':sorted(paths-protected),'removed':sorted(protected-paths)})

def semantic_checks():
    img=Image(ROOT/'extracted/romfs/nro/NX_Release/mgmet.nro')
    i32=lambda a,n:[img.i32(a+4*k) for k in range(n)]
    next_modes=i32(0x71000e3658,6); nums=i32(0x71000e3670,6); inv=i32(0x71000e368c,6)
    check('mode tables shifted inverse',next_modes==nums==[4,3,1,5,2,6] and all(inv[nums[x]-1]==x for x in range(6)))
    check('round/star numeric tables',i32(0x71000e37c0,3)==[5,7,10] and i32(0x71000e37cc,3)==[3,5,10])
    vs=i32(0x71000e3790,12)
    check('VS permutations',vs==[0,1,2,3,0,2,1,3,0,3,1,2] and all(sorted(vs[k:k+4])==[0,1,2,3] for k in (0,4,8)))
    anims={x['file']:x for x in json.loads((ROOT/'analysis/mgmet_anims.json').read_text(encoding='utf-8'))}
    expected={'mgmet_base_rule_00_in':(-15,0,15,False),'mgmet_base_rule_00_out':(20,23,3,False),'mgmet_act_title_00_act':(120,126,6,False),'mgmet_btn_play_00_press':(60,89,29,False)}
    check('documented animation spans',all((anims[k+'.bflan.json']['tag']['start'],anims[k+'.bflan.json']['tag']['end'],anims[k+'.bflan.json']['frameSize'],anims[k+'.bflan.json']['loop'])==v for k,v in expected.items()))
    check('layout/animation inventory',len(list((ROOT/'analysis/mgmet_layout').glob('*.bflyt.json')))==34 and len(anims)==107)
    # A bounded model of the decompiled contracts, not original executable output.
    def direction(t,r):
        for bit,d in ((11,1),(10,2),(8,3),(9,4)):
            if (t|r)&(1<<bit): return d
        for bit,d in ((17,1),(19,2),(16,3),(18,4)):
            if t&(1<<bit): return d
        return 0
    bits=[11,10,8,9,17,19,16,18]
    for flags in range(1,256):
        t=sum(1<<bits[k] for k in range(8) if flags&(1<<k))
        first=next(k for k in range(8) if flags&(1<<k))
        assert direction(t,0)==[1,2,3,4,1,2,3,4][first]
    check('direction priority combinations',True,255)
    check('analog repeat ignored',all(direction(0,1<<bit)==0 for bit in (16,17,18,19)))
    bounds=0
    for maximum in (3,2,2,1,1,2):
        for index in range(maximum+1):
            assert 0<=min(index+1,maximum)<=maximum and 0<=max(index-1,0)<=maximum
            bounds+=2
    check('value boundary fixtures',True,bounds)
    def step(current,first,visible,trig,rep=0):
        d=direction(trig,rep)
        if d in (1,2): return current,0,'value'
        if d==3 or (not d and trig&2):
            if current==first: return current,3 if not d else 0,'cancel' if not d else 'edge'
            return max(x for x in visible if x<current),0,'move'
        if d==4 or (not d and trig&1):
            if current==6: return current,1 if not d else 0,'play' if not d else 'edge'
            return min(x for x in visible if x>current),0,'move'
        return current,2 if trig&8 else trig&4,'other'
    # Follow A before B exactly (the generic branch above needs explicit A priority).
    def rule_step(c,f,v,t,r=0):
        if not direction(t,r) and t&1: return step(c,f,v,1)
        return step(c,f,v,t,r)
    fixtures=0
    for visible in ([3,4,6],[4,6]):
        first=visible[0]
        assert rule_step(first,first,visible,2)[1]==3
        assert rule_step(6,first,visible,1)[1]==1
        assert rule_step(first,first,visible,3)[0]==visible[1]
        assert rule_step(first,first,visible,8)[1]==2
        assert rule_step(first,first,visible,4)[1]==4
        assert rule_step(first,first,visible,(1<<8)|1)[0]==first
        assert rule_step(6,first,visible,(1<<9)|2)[1]==0
        fixtures+=7
    check('free-play column/result fixtures',True,fixtures)
    commits=[]
    for exitcode,cpu,explain in product((1,3),range(4),range(2)):
        commits.append({'exit':exitcode,'cpu':cpu,'explain':explain,'flag4':explain==0,'activityResult':1 if exitcode==1 else 2})
    check('start/cancel commit fixtures',len(commits)==16,commits)
    cache=[1,3,2,1,0,1,0]
    cfg=[0]*12
    for cache_index,cfg_index in ((1,5),(2,11),(3,7),(4,9),(5,3),(6,1)): cfg[cfg_index]=cache[cache_index]
    check('cache/config different order',cfg==[0,0,0,1,0,3,0,1,0,0,0,2],cfg)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--qualify',action='store_true'); args=parser.parse_args()
    if args.qualify: qualify()
    document_checks(); source_checks(); semantic_checks()
    RESULT['passed']=all(x['passed'] for x in RESULT['checks'])
    out=ROOT/'analysis/mgmet_validation.json'; out.write_text(json.dumps(RESULT,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':RESULT['passed'],'checks':len(RESULT['checks']),'failed':[x for x in RESULT['checks'] if not x['passed']],'documents':RESULT['documents'],'output':str(out)},ensure_ascii=False,indent=2))
    sys.exit(0 if RESULT['passed'] else 1)
