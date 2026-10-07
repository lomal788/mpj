"""Read existing C first; keep all generated evidence in analysis (stage 3)."""
import csv,hashlib,json,re,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('C:/dev/mpj')
HEADER=re.compile(r'^// ==== ([0-9a-f]+) (.*?)(?: \(depth \d+\))?$',re.M)
def files(module):
    for p in sorted((ROOT/'analysis/decomp').glob('*.c')):
        n=p.name
        if 'dis' in n: continue
        if module=='mgm01' and ('mgm01' in n or n.startswith('logic1801_mgm') or n=='rhythm_mgm1.c'): yield p
        elif module=='mgmrs' and 'mgmrs' in n: yield p
        elif module=='main' and ('main' in n or n in ('mgm01_result_writer.c',) or n.startswith('ui2dalign_') or n.startswith('charsel_') and 'nro' not in n and 'menu01' not in n): yield p
        elif module=='menu01' and ('menu01' in n or n=='menu01.nro.c'): yield p
def functions(module):
    d={}
    for p in files(module):
        s=p.read_text(encoding='utf-8',errors='replace'); ms=list(HEADER.finditer(s))
        for i,m in enumerate(ms): d.setdefault(m[1],(m[2],p,s[m.start():ms[i+1].start() if i+1<len(ms) else len(s)]))
    return d
def main():
    mode,*args=sys.argv[1:]
    if mode=='baseline':
        ps=[p for folder in ('web/script','web/assets','web/docs/shell') for p in (ROOT/folder).rglob('*') if p.is_file()]
        d={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in ps}
        (ROOT/'analysis/mgm01_baseline.json').write_text(json.dumps(d,indent=2),encoding='utf-8')
        old={m:[(a,n,str(p.relative_to(ROOT))) for a,(n,p,b) in functions(m).items()] for m in ('main','mgm01','mgmrs')}
        (ROOT/'analysis/mgm01_old_functions.json').write_text(json.dumps(old,indent=2),encoding='utf-8')
        print('baseline',len(d))
    elif mode=='read':
        for a,(n,p,b) in functions(args[0]).items():
            if any((q[1:]==n if q.startswith('=') else q.lower() in n.lower() or q.lower()==a) for q in args[1:]): print('// SOURCE',p.relative_to(ROOT),'\n'+b)
    elif mode=='missing':
        module,pattern,out=args; have=functions(module)
        rows=list(csv.DictReader((ROOT/f'analysis/functions/{module}.{"nso" if module=="main" else "nro"}.tsv').open(encoding='utf-8'),delimiter='\t'))
        maxaddr={'mgm01':0x7100024b00,'mgmrs':0x7100004700,'menu01':0x71000b9000}.get(module,2**64)
        picked=[r for r in rows if re.search(pattern,r['name']) and r['address'] not in have and int(r['size'])>0 and int(r['address'],16)<maxaddr and '<EXTERNAL>' not in r['name']]
        (ROOT/out).write_text('~'.join('^'+re.escape(r['name'])+'$' for r in picked),encoding='utf-8')
        for r in picked: print(r['address'],r['size'],r['name'])
        print('Missing',len(picked))
    elif mode=='layout':
        import ui_lyt,mgmcommon_lyt_dump as common
        dest=ROOT/'analysis/mgm01_layout'; ui_lyt.dump(ROOT/'extracted/bea/mgm~mgm01.nx.bea/mgm/mgm01/layout.lyt',dest)
        panes=[]; anims=[]
        for p in sorted(dest.glob('*.bflyt.json')):
            panes.append('## '+p.name); common.walk(json.loads(p.read_text(encoding='utf-8'))['root'],0,panes)
        for p in sorted(dest.glob('*.bflan.json')): anims.append({'file':p.name,**json.loads(p.read_text(encoding='utf-8'))})
        (ROOT/'analysis/mgm01_panes.txt').write_text('\n'.join(panes),encoding='utf-8')
        (ROOT/'analysis/mgm01_anims.json').write_text(json.dumps(anims,ensure_ascii=False,indent=2),encoding='utf-8')
        print('layouts',len(list(dest.glob('*.bflyt.json'))),'anims',len(anims))
    elif mode=='data':
        from nro import Image
        module,*queries=args; img=Image(ROOT/f'extracted/romfs/nro/NX_Release/{module}.nro'); lines=[]
        rows=list(csv.DictReader((ROOT/f'analysis/functions/{module}.nro.tsv').open(encoding='utf-8'),delimiter='\t')); names={int(r['address'],16):r['name'] for r in rows}
        for query in queries:
            kind,addr,*count=query.split(':'); a=int(addr,16); n=int(count[0]) if count else 1
            vals=[]
            for k in range(n):
                try:
                    if kind=='ptr':
                        v=img.u64(a+8*k)
                        normalized=v if v>=0x7100000000 else 0x7100000000+v
                        # Some stored tables contain module-relative values without RELA.
                        label=names.get(normalized,'')
                        if not label and 0<v<len(img.mem):
                            try: label=img.string(v)
                            except (ValueError,IndexError): pass
                        elif not label and v>=0x7100000000:
                            try: label=img.string(v)
                            except (ValueError,IndexError): pass
                        vals.append({'stored':hex(v),'module_address':hex(normalized),'label':label})
                    elif kind=='offs': vals.append(img.string(a+img.i32(a+4*k)))
                    elif kind=='str': vals.append(img.string(a))
                    elif kind=='f32': vals.append(img.f32(a+4*k))
                    elif kind=='bytes': vals.append(img.mem[img.addr(a):img.addr(a)+n].hex()); break
                    else: vals.append(img.i32(a+4*k))
                except Exception as e: vals.append(type(e).__name__)
            lines.append(f'{module} @{a:x} {kind}: {vals}')
        with (ROOT/f'analysis/{module}_data.txt').open('a',encoding='utf-8') as f:f.write('\n'.join(lines)+'\n')
        print('\n'.join(lines))
if __name__=='__main__': main()
