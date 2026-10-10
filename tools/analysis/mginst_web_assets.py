import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'web/tools/analysis'))
import font_web_assets as fw
import mgmcommon_web_assets as mc
import ui_sarc
import ui_lyt

DST = ROOT / 'web/assets/mginst'
ROOTS = ['sys_mginst_base', 'sys_mginst_operation', 'sys_bg_base_00', 'sys_mg_operation_01']
RAW = ROOT / 'extracted/bea/mg~mgInst.nx.bea/mg/mgInst/data/mgInst.json'


def main():
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    need, done = set(ROOTS), set()
    while need - done:
        for name in sorted(need - done):
            key = f'blyt/{name}.bflyt'
            if key not in parts:
                raise ValueError(f'layout missing: {name}')
            done.add(name)
            need |= mc.part_refs(parts[key])
    bundle = mc.Bundle('mginst', [parts])
    bundle.convert(parts, sorted(done))
    for name in sorted(done):
        source = ui_lyt.parse_bflyt(parts[f'blyt/{name}.bflyt'])
        by_name = {node['n']: node for node in bundle.layouts[name]['nodes']}

        def preserve_uv(pane):
            uvs = pane.get('uvs', [])
            if len(uvs) > 1 and pane['name'] in by_name:
                by_name[pane['name']]['uv1'] = list(uvs[1])
            for child in pane.get('children', []):
                preserve_uv(child)

        preserve_uv(source['root'])
    previous_dst = mc.DST
    mc.DST = DST
    try:
        tex, srgb, missing = bundle.write_textures('mi')
    finally:
        mc.DST = previous_dst
    textures = {k: v if v.startswith('../') else '../mginst/' + v for k, v in tex.items()}
    faces = json.loads((ROOT / 'web/assets/mgm01/faces.json').read_text(encoding='utf-8-sig'))
    textures.update(faces['textures'])
    srgb = sorted(set(srgb) | set(faces.get('srgb', [])))
    raw = json.loads(RAW.read_text(encoding='utf-8-sig'))
    all_messages = mc.cw.messages()
    labels = set()
    for stem in ['mg_inst', 'im_mg_inst']:
        labels.update(json.loads((mc.cw.MSG_DIR / f'{stem}.json').read_text(encoding='utf-8-sig')))
    labels |= {f'im_{row["Name"]}_name' for row in raw['mgInst']}
    texts = {key: all_messages[key] for key in sorted(labels) if key in all_messages}
    families = {n['txt']['font'] for layout in bundle.layouts.values() for n in layout['nodes'] if n.get('txt')}
    text_set = re.sub(r'\[\d+:\d+:[0-9a-f]*\]', '', ''.join(texts.values())) + 'VS0123456789'
    fonts = {family: fw.font_ref(family, text_set) for family in sorted(families) if mc.cw.fcpx_fonts().get(family)}
    output = {'version': 1, 'screen': [1920, 1080],
              'source': 'Super Mario Party Jamboree US v0; tools/analysis/mginst_web_assets.py; docs/shell/mginst.md section 12',
              'textures': textures, 'srgb': srgb, 'layouts': bundle.layouts,
              'split': bundle.split, 'zabuton': bundle.zabuton, 'lineSpace': bundle.line_space,
              'fonts': fonts, 'texts': texts, 'raw': raw, 'missingTextures': missing}
    DST.mkdir(parents=True, exist_ok=True)
    target = DST / 'mginst.json'
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'mginst.json: layouts={len(bundle.layouts)}, textures={len(textures)}, messages={len(texts)}, raw={len(raw["mgInst"])}')
    print('runtime texture slots:', missing)


if __name__ == '__main__':
    main()
