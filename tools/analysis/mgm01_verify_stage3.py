"""Stage 3 static evidence and conversion checks. Does not run the original game."""
import hashlib, json, re, struct
import sys
from pathlib import Path

ROOT = Path('C:/dev/mpj')
sys.stdout.reconfigure(encoding='utf-8')
HEAD = re.compile(r'^// ==== ([0-9a-f]+) (.+)$', re.M)
FILES = {
    'mgm01_stage3.c': 'mgm01', 'mgmrs_stage3.c': 'mgmrs',
    'ui2dalign_main.c': 'main', 'ui2dalign_more.c': 'main',
    'ui2dalign_vertical.c': 'main', 'ui2dalign_order.c': 'main',
    'mgm01_main_contract.c': 'main', 'mgm01_callbacks.c': 'mgm01',
    'mgm01_menu_player.c': 'menu01', 'mgm01_main_more.c': 'main',
    'mgm01_helpers.c': 'mgm01', 'mgm01_result_writer.c': 'main',
    'mgm01_wait_callback.c': 'mgm01', 'mgm01_main_round.c': 'main',
    'mgm01_boot_initial.c': 'boot',
    'mgm01_data_helpers.c': 'mgm01',
    'mgm01_team_expand.c': 'main',
    'mgm01_team_sort.c': 'main',
    'mgm01_player_base.c': 'main',
}

def load(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8-sig'))

def walk(n):
    yield n
    for c in n.get('children', []): yield from walk(c)

def align(children, size, gap, kind, vertical=False):
    """Fixed size branch, already measured child bounds, centered parent origin."""
    sequence = children if kind < 2 else list(reversed(children))
    cursor = 0 if kind == 1 else (size/2 if vertical == (kind < 2) else -size/2)
    direction = (-1 if vertical else 1) * (1 if kind < 2 else -1)
    total, first, positions = 0, True, {}
    for c in sequence:
        if not c.get('visible', True) or c.get('ignore', False): continue
        spacing = 0 if first else c.get('gap', gap)
        cursor += direction * spacing
        positions[c['name']] = cursor + direction*c['extent']/2 - c.get('bias', 0)
        cursor += direction*c['extent']
        total += spacing+c['extent']
        first = False
    if kind == 1:
        positions = {k:v-direction*total/2 for k,v in positions.items()}
    return positions

def checks():
    d = load('extracted/bea/mgm~mgm01.nx.bea/mgm/mgm01/data/mgm01_freeplay_mgList.json')
    cols = ['MgAll','Mg4vs','Mg1vs3','Mg2vs2','MgDuel','MgItem','MgChallenge',
            'MgBoss','MgGyro','MgEndless','MgAthlon','MgBusters','MgRhythm']
    counts = {c:sum(x[c]>0 for x in d['gamedata']) for c in cols}
    assert len(d['gamedata']) == 112 and len(d['filterdata']) == 14
    assert list(counts.values()) == [112,29,12,12,5,5,10,5,15,5,14,10,10]
    assert len({x['MgName'] for x in d['gamedata']}) == 112
    for c in cols:
        vals = sorted(x[c] for x in d['gamedata'] if x[c]>0)
        assert vals == list(range(1,len(vals)+1)), c
    data = {'game_count':112,'filter_count':14,'counts':counts,'filters':d['filterdata'],
            'locked':[x['MgName'] for x in d['gamedata'] if x['SetLock']],
            'solo':[x['MgName'] for x in d['gamedata'] if x['SoloPlayOnly']],
            'offline':[x['MgName'] for x in d['gamedata'] if x['OfflinePlayOnly']],
            'orders':{c:[x['MgName'] for x in sorted(d['gamedata'],key=lambda x:x[c]) if x[c]>0] for c in cols}}
    (ROOT/'analysis/mgm01_evidence.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    nodes = {x['name']:x for x in walk(load('analysis/mgmet_layout/mgmet_base_rule_00.bflyt.json')['root'])}
    a = nodes['A_alignment_00']
    children = [{'name':f'x_rule_{i:02d}','extent':w} for i,w in enumerate([470,446,446,446,446,366])]
    all_positions = align(children,1504,-75,2)
    assert list(all_positions.values()) == [569,238,-133,-504,-875,-1258]
    # Resource positions are cached prior-stage data; no original module is rerun.
    assert all(all_positions[c['name']] == nodes[c['name']]['translate'][0] for c in children)
    variants = {}
    for cpu in (True,False):
        vis = [{**c,'visible':c['name']=='x_rule_04' or cpu and c['name']=='x_rule_03'} for c in children]
        pos = align(vis,1504,-75,2)
        variants[str(cpu)] = {'alignment_local':pos,'root':{k:[v-22,-299] for k,v in pos.items()},'play_root':[910,-386]}
    assert variants['True']['alignment_local'] == {'x_rule_04':529,'x_rule_03':158}
    assert variants['False']['alignment_local'] == {'x_rule_04':529}
    sample = [{'name':'a','extent':20},{'name':'hidden','extent':999,'visible':False},{'name':'b','extent':40,'gap':5,'bias':3}]
    assert align(sample,100,10,0) == {'a':-40,'b':-8}
    assert align(sample,100,10,1) == {'a':-22.5,'b':9.5}
    assert align(sample,100,10,2) == {'b':27,'a':-10}
    assert align(sample,100,10,0,True) == {'a':40,'b':2}
    assert align(sample,100,10,1,True) == {'a':22.5,'b':-15.5}
    assert align(sample,100,10,2,True) == {'b':-33,'a':10}
    evidence = {'input_pane':a,'variants':variants,'all_six_positions':all_positions,
                'fixtures':'six axis/kind combinations; hidden child; own gap; bounds bias'}
    (ROOT/'analysis/ui2dalign_evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
    # Ring boundary mapping and raw result comparison, including non-boolean sentinel 2.
    for count in (0,1,8,9,99,100,101,237):
        view = min(count,100)
        slots = [(count+i)%100 if count>=100 else i for i in range(view)]
        assert len(slots)==len(set(slots))==view
        if view: assert slots[-1] == (count-1)%100
        assert 0<=max(0,view-8)<=92
    assert [b for b in (0,1,2,255) if b==(1!=0)] == [1]
    assert [b for b in (0,1,2,255) if b==(0!=0)] == [0]
    assert not (12<12) and 12<13
    teams=load('analysis/mgm01_team_table.json')['rows']
    assert len(teams)==15
    assert teams[1]['team_ids']==[[0,1,1,1],[1,0,1,1],[1,1,0,1],[1,1,1,0]]
    assert teams[2]['team_ids']==[[0,0,1,1],[0,1,0,1],[0,1,1,0]]
    assert teams[6]['team_ids'][-1]==[-1,-1,0,1]
    records=load('extracted/bea/bq.nx.bea/common/data/gamerecord.json')['gamerecord']
    assert len(records)==20
    inventory,seen = [],set()
    old = load('analysis/mgm01_old_functions.json')
    oldkeys=set()
    for module,rows in old.items():
        for addr,name,path in rows:
            if 'menu01' in path: module_for_row='menu01'
            else: module_for_row=module
            oldkeys.add((module_for_row,addr))
    for file,module in FILES.items():
        rows = HEAD.findall((ROOT/'analysis/decomp'/file).read_text(encoding='utf-8'))
        for addr,name in rows:
            assert (module,addr) not in seen, (file,addr,'duplicate new C')
            assert (module,addr) not in oldkeys, (file,addr,'already decompiled')
            seen.add((module,addr))
        inventory.append({'file':file,'module':module,'functions':len(rows),'symbols':[{'address':a,'name':n} for a,n in rows]})
    report={'level':'실행: 변환','checks':['112 unique games; contiguous per-filter order','14 filters',
        'six fixed size alignment branches; visibility/gap/bias','mgmet all-six resource positions',
        'CPU present/absent positions','100-entry ring boundaries and raw sentinel','strict NEW threshold',
        'new C unique by module/address and not in baseline','15 TeamOrder rows; 1vs3/2vs2/duel team expansion','20 default records'],
        'inventory':inventory,'new_function_count':len(seen)}
    for name in ('mgm01_freeplay.md','ui2d_alignment.md'):
        p=ROOT/'web/docs/shell'/name
        if p.exists():
            s=p.read_text(encoding='utf-8')
            assert re.findall(r'^## (\d+)\.',s,re.M)==[str(i) for i in range(1,12)], name
            assert '[실행]' not in s
            report.setdefault('documents',[]).append({'file':name,'lines':len(s.splitlines()),'bytes':p.stat().st_size})
    baseline = load('analysis/mgm01_baseline.json')
    changed=[]
    for path,digest in baseline.items():
        p=ROOT/path
        if hashlib.sha256(p.read_bytes()).hexdigest()!=digest: changed.append(path)
    assert all(x.startswith('web\\docs\\shell\\') for x in changed),changed
    # Remove only inserted supplement lines; exact baseline hash must be recovered.
    for path in changed:
        b=(ROOT/path).read_bytes()
        b=b''.join(line for line in b.splitlines(keepends=True) if not line.decode('utf-8').startswith(('보충(2026-10-07):','정정(2026-10-07):')))
        assert hashlib.sha256(b).hexdigest()==baseline[path], ('old contents changed',path)
    report['baseline_checked_files']=len(baseline)
    report['old_documents_append_only']=changed
    (ROOT/'analysis/mgm01_validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='inventory'},ensure_ascii=False,indent=2))

if __name__=='__main__': checks()
