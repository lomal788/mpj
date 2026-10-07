"""Read-only source inspection; writes only mgmet analysis outputs, never extracted files."""
import csv
import hashlib
import json
import re
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path('C:/dev/mpj')
HEADER = re.compile(r'^// ==== ([0-9a-f]+) (.*?)(?: \(depth \d+\))?$', re.M)

def functions(module='mgmet'):
    result = {}
    for p in sorted((ROOT / 'analysis/decomp').glob('*.c')):
        if module not in p.name and not (module == 'mgm01' and (p.name.startswith('logic1801_mgm') or p.name == 'rhythm_mgm1.c')):
            continue
        if module == 'mgmet' and '_main_' in p.name:
            continue
        s = p.read_text(encoding='utf-8', errors='replace')
        matches = list(HEADER.finditer(s))
        for i, m in enumerate(matches):
            result.setdefault(m[1], (m[2], p, s[m.start():matches[i+1].start() if i+1 < len(matches) else len(s)]))
    return result

def main():
    mode, *args = sys.argv[1:]
    if mode == 'read':
        for a, (name, p, body) in functions(args[0]).items():
            if any((q[1:] == name if q.startswith('=') else q.lower() in name.lower() or q.lower() == a) for q in args[1:]):
                print(f'// SOURCE {p.relative_to(ROOT)}')
                print(body)
    elif mode == 'missing':
        module, pattern, output = args
        have = functions(module)
        rows = list(csv.DictReader((ROOT / f'analysis/functions/{module}.{"nso" if module == "main" else "nro"}.tsv').open(encoding='utf-8'), delimiter='\t'))
        picked = [r for r in rows if re.search(pattern, r['name']) and r['address'] not in have and int(r['size']) > 0 and not (module == 'mgmet' and int(r['address'], 16) >= 0x7100089000)]
        (ROOT / output).write_text('~'.join('^' + re.escape(r['name']) + '$' for r in picked), encoding='utf-8')
        for r in picked:
            print(r['address'], r['size'], r['name'])
        print('Missing:', len(picked), 'Existing reused:', sum(bool(re.search(pattern, n)) for n, _, _ in have.values()))
    elif mode == 'baseline':
        paths = list((ROOT/'web/script').rglob('*')) + list((ROOT/'web/assets').rglob('*')) + list((ROOT/'web/docs/shell').glob('*.md'))
        result = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
        (ROOT/'analysis/mgmet_baseline.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print('baseline files:', len(result))
    elif mode == 'doc':
        path, start, end = args
        s = Path(path).read_text(encoding='utf-8').splitlines()
        print('\n'.join(f'{i+1}: {line}' for i, line in enumerate(s) if int(start) <= i+1 <= int(end)))
    elif mode == 'layout':
        import ui_lyt
        import mgmcommon_lyt_dump as common
        dest = ROOT/'analysis/mgmet_layout'
        ui_lyt.dump(ROOT/'extracted/bea/mgm~mgmet.nx.bea/mgm/mgmet/layout.lyt', dest)
        panes, anims = [], []
        for p in sorted(dest.glob('*.bflyt.json')):
            d = json.loads(p.read_text(encoding='utf-8'))
            panes.append('## ' + p.name)
            common.walk(d['root'], 0, panes)
        for p in sorted(dest.glob('*.bflan.json')):
            d = json.loads(p.read_text(encoding='utf-8'))
            anims.append({'file': p.name, **d})
        (ROOT/'analysis/mgmet_panes.txt').write_text('\n'.join(panes), encoding='utf-8')
        (ROOT/'analysis/mgmet_anims.json').write_text(json.dumps(anims, ensure_ascii=False, indent=2), encoding='utf-8')
        print('layouts:', len(list(dest.glob('*.bflyt.json'))), 'animations:', len(anims))
    elif mode == 'data':
        import nro
        img = nro.Image(ROOT/'extracted/romfs/nro/NX_Release/mgmet.nro')
        lines = []
        for arg in args:
            kind, addr, *rest = arg.split(':')
            a = int(addr,16)
            n = int(rest[0]) if rest else 1
            values = []
            for k in range(n):
                try:
                    values.append(img.string(img.u64(a+8*k)) if kind == 'ptr' else img.string(a+img.i32(a+4*k)) if kind == 'offs' else img.string(a) if kind == 'str' else img.f32(a+4*k) if kind == 'f32' else img.i32(a+4*k))
                except Exception as e:
                    values.append(type(e).__name__)
            lines.append(f'mgmet @{addr} {kind}: {values}')
        print('\n'.join(lines))
        with (ROOT/'analysis/mgmet_data.txt').open('a',encoding='utf-8') as f:
            f.write('\n'.join(lines)+'\n')
    elif mode == 'report':
        lines = []
        for d in json.loads((ROOT/'analysis/mgmet_anims.json').read_text(encoding='utf-8')):
            if any(k in d['file'] for k in ('act_title', 'act_img', 'base_rule', 'rule_option', 'btn_rule', 'btn_play', 'base_playinfo_free')):
                lines.append(f"{d['file']} tag={d.get('tag')} frameSize={d.get('frameSize')} loop={d.get('loop')} panes=" + ','.join(e['name'] for e in d.get('entries',[])))
        for p in (ROOT/'extracted/message/koKR').glob('*.json'):
            if p.stem not in ('mgmet', 'im_common', 'sys_common', 'mn01', 'qtbd00'):
                continue
            d=json.loads(p.read_text(encoding='utf-8'))
            if isinstance(d,dict):
                for k,v in d.items():
                    if re.search(r'(^mgmet_(fp_mw_|ent|back|ui_act|rule_ui_|ui_sbdlg)|^mgm01_ent|^im_comLevel|^im_mode(03|09|10|11|12|13|14)|setupController_btn|changeMember|gyro_start|gyro_setting)',k):
                        lines.append(p.name+' '+k+' '+json.dumps(v,ensure_ascii=False))
        (ROOT/'analysis/mgmet_evidence.txt').write_text('\n'.join(lines),encoding='utf-8')
        print('\n'.join(lines))

if __name__ == '__main__':
    main()
