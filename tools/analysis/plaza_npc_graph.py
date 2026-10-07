"""광장 NPC 10모델 셰이더 그래프 판독 파이프라인 — 기존 도구(bnbshpk_split.py, bfsha_dump, sass_dis.py)를 고치지 않고 경로만 바꿔 부르는 래퍼.

입력: extracted/bea/chara~npcNNN.nx.bea/_chara/npcNNN.bnbshpk
      extracted/converted/plaza_npc/<key>/*.glb  (materials[].extras.fres.shader.options = 재질 옵션)
출력: analysis/mat/plaza_npc/shpk/npcNNN/<fsha>.{bfsha,json}
      analysis/mat/plaza_npc/mats_in.json, prog/match.json + <tag>.{vs,fs}{0,1}.bin
      analysis/mat/plaza_npc/sass/<tag>.{vs,fs}.txt
      analysis/mat/plaza_npc/summary.json  (재질 → 프로그램, 샘플러 위치, 텍스처)

사용: python web/tools/analysis/plaza_npc_graph.py split|match|sass|summary|all
"""
import glob
import json
import os
import struct
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bnbshpk_split
import sass_dis

ROOT = sass_dis.ROOT
BASE = os.path.join(ROOT, 'analysis', 'mat', 'plaza_npc')
CONV = os.path.join(ROOT, 'extracted', 'converted', 'plaza_npc')
BEA = os.path.join(ROOT, 'extracted', 'bea')
DUMP = os.path.join(ROOT, 'web', 'tools', 'analysis', 'bfsha_dump_bin', 'bfsha_dump.exe')
PACK = {'npc001': 'npc001', 'npc001bd': 'npc001', 'npc002': 'npc002', 'npc002st': 'npc002', 'npc003': 'npc003',
        'npc022': 'npc022', 'npc029a': 'npc029', 'npc044': 'npc044', 'npc051': 'npc051', 'npc053': 'npc053'}

sass_dis.PROG = os.path.join(BASE, 'prog')
sass_dis.SHPK = os.path.join(BASE, 'shpk')
sass_dis.OUT = os.path.join(BASE, 'sass')


def glbjson(p):
    b = open(p, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + n])


def split():
    for pk in sorted(set(PACK.values())):
        out = os.path.join(BASE, 'shpk', pk)
        for r in bnbshpk_split.split(os.path.join(BEA, f'chara~{pk}.nx.bea', '_chara', f'{pk}.bnbshpk'), out):
            print(pk, *r)
        for f in glob.glob(os.path.join(out, '*.bfsha')):
            subprocess.run([DUMP, 'model', f, f[:-6] + '.json'], check=True)


BFRES = os.path.join(ROOT, 'web', 'tools', 'analysis', 'graphics_bfres2gltf', 'bin', 'Release', 'net7.0', 'graphics_bfres2gltf.exe')
EXTRA = {'npc053': 'chara~npc053.nx.bea/chara/npc/npc053_patapata/model/npc053it00_cap.fmdb'}  # 광장 변환에 없는 부착 캡(패킷 팩 같음)


def fmdb_dump():
    """10모델(+캡) fmdb 재질 덤프 → fmdb_dump.json (container_m 기본값·샘플러 랩 모드 확인용)"""
    fs = []
    for key in PACK:
        meta = json.load(open(os.path.join(CONV, key, 'meta.json'), encoding='utf-8'))
        fs += glob.glob(os.path.join(BEA, f'chara~{PACK[key]}.nx.bea', '**', meta['source']), recursive=True)
    fs += [os.path.join(BEA, v) for v in EXTRA.values()]
    fs += glob.glob(os.path.join(BEA, 'chara~npc003.nx.bea', '**', 'npc003it00_hat.fmdb'), recursive=True)
    subprocess.run([BFRES, 'dump', os.path.join(BASE, 'fmdb_dump.json')] + sorted(set(fs)), check=True)


def materials():
    for key in PACK:
        for p in sorted(glob.glob(os.path.join(CONV, key, '*.glb'))):
            for m in glbjson(p)['materials']:
                yield key, p, m
    dump = {f['file']: f for f in json.load(open(os.path.join(BASE, 'fmdb_dump.json'), encoding='utf-8'))}
    for key, rel in EXTRA.items():
        for m in dump[os.path.basename(rel)]['models'][0]['materials']:
            if m['name'] != 'container_m':
                yield key, os.path.join(BEA, rel), {'name': m['name'], 'extras': {'fres': m}}


def match():
    mats = []
    for key, p, m in materials():
        s = m['extras']['fres']['shader']
        if m['name'] == 'container_m':
            continue
        mats.append({'file': os.path.relpath(p, ROOT).replace('\\', '/'), 'name': f'{key}:{m["name"]}', 'archive': s['archive'],
                     'model': s['model'], 'options': s['options'], 'shpk': os.path.join(BASE, 'shpk', PACK[key])})
    fn = os.path.join(BASE, 'mats_in.json')
    json.dump(mats, open(fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    subprocess.run([DUMP, 'match', os.path.join(BASE, 'shpk'), fn, os.path.join(BASE, 'prog')], check=True)


def fix_low_handles():
    """sass_dis 의 핸들 이름(Material 앞 0x10 + 0x10×위치)은 sg_utility_texture2d*·texture2darray* 에서만 맞다.
    앞쪽 표준 샘플러(_a0.._m0, sss_*)는 0x10×위치 (Material[0x0] = _a0, 0x10 = _n0, 0x20 = _r0, 0x30 = _m0, 0xc0 = sss_curvature) —
    읽는 성분 수(알베도 0x7, 노멀 0x3, 거칠기 0x9, 금속 0x1)와 바인드 텍스처로 21재질 전부 확인. 0xe0 미만 핸들 이름만 고쳐 쓴다."""
    import re
    names = [s['name'] for s in sass_dis.model_info('npc022', 'forward_plus', 'forward_plus_color')['samplers']]

    def rep(m):
        if m.group(1):
            k = names.index(m.group(1)) + 1
        else:
            k = int(m.group(2), 16) // 0x10
            if int(m.group(2), 16) % 0x10:
                return m.group(0)
        return f'Material.@{names[k]}' if k * 0x10 < 0xe0 else m.group(0)
    for f in glob.glob(os.path.join(BASE, 'sass', '*.txt')):
        t = open(f, encoding='utf-8').read()
        if t.startswith('// [handles fixed]'):
            continue
        t = re.sub(r'Material\.@(_a0|_n0|_r0|_m0|_e0|pack_texture2d[012]|shadow_mask_texture2d|gi_diffuse_texture2d1?|global_ao_texture2d)\b|Material\[(0x[0-9a-f]+)\]', rep, t)
        open(f, 'w', encoding='utf-8').write('// [handles fixed] 0xe0 미만 Material 핸들 = 0x10×샘플러 위치 (plaza_npc_graph.fix_low_handles)\n' + t)


def summary():
    match = {e['name']: e for e in json.load(open(os.path.join(BASE, 'prog', 'match.json'), encoding='utf-8'))}
    out = {}
    for key, p, m in materials():
        e = match[f'{key}:{m["name"]}']
        f = m['extras']['fres']
        used = e.get('used') or {}
        if 'textures' in f:  # fmdb 덤프(캡): textures[i] ↔ samplers[i].name
            mat_tex = {s['name']: t for s, t in zip(f['samplers'], f['textures'])}
        else:
            mat_tex = {t['sampler']: t['texture'] for t in f.get('samplers', [])}
        bound = {k: mat_tex.get(v) for k, v in f['shader']['samplerAssign'].items()}
        prm = {k: v['value'] for k, v in f['params'].items() if k.startswith(('mdl_', 'material_texture_srt', 'material_utility', 'utility', 'sg_'))}
        out.setdefault(key, {})[m['name']] = {'file': os.path.basename(p), 'tag': used.get('tag'), 'program': e.get('program'), 'err': e.get('err'),
                                             'bound': bound, 'attribAssign': f['shader']['attribAssign'], 'params': prm,
                                             'srt': [f['shader']['options'].get(f'static_opt_texture_srt{i}') for i in range(4)]}
    json.dump(out, open(os.path.join(BASE, 'summary.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for k, v in out.items():
        for mn, d in v.items():
            print(k, mn, d['tag'], d['err'] or '')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd in ('split', 'all'):
        split()
        fmdb_dump()
    if cmd in ('match', 'all'):
        match()
    if cmd in ('sass', 'all'):
        sys.argv = [sys.argv[0], '--all']
        sass_dis.main()
        fix_low_handles()
    if cmd in ('summary', 'all'):
        summary()
