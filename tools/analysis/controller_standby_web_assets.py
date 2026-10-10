import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'web/tools/analysis'))
import font_web_assets as fw
import mgmcommon_web_assets as mc
import ui_sarc
import ui_lyt

DST = ROOT / 'web/assets/controllerstandby'
NAMES = ['sys_standby_base', 'sys_standby_pcface']


def main():
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    bundle = mc.Bundle('controllerstandby', [parts])
    bundle.convert(parts, NAMES)
    for name in NAMES:
        source = ui_lyt.parse_bflyt(parts[f'blyt/{name}.bflyt'])
        by_name = {n['n']: n for n in bundle.layouts[name]['nodes']}
        for pane in mc.cw.walk(source['root']):
            if len(pane.get('uvs', [])) > 1 and pane['name'] in by_name:
                by_name[pane['name']]['uv1'] = list(pane['uvs'][1])
    previous = mc.DST
    mc.DST = DST
    try:
        textures, srgb, missing = bundle.write_textures('cs')
    finally:
        mc.DST = previous
    if missing:
        raise ValueError(f'missing textures: {missing}')
    chars = json.loads((ROOT / 'web/assets/charselect/spec.json').read_text(encoding='utf8'))
    for key in chars['textures']:
        if key.startswith('face_128_'):
            face = key.replace('face_128_', 'face_256_')
            file = face.replace('^', '_') + '.png'
            if not (ROOT / 'web/assets/charselect/tex' / file).is_file():
                raise ValueError(f'missing face: {file}')
            textures[face] = '../charselect/tex/' + file
            if key in chars.get('srgb', []):
                srgb.append(face)
    messages = mc.cw.messages()
    labels = ['mn01_modeStart_ui_gyro_standby', 'mn01_ui_ok']
    texts = {key: messages[key] for key in labels}
    families = {n['txt']['font'] for lay in bundle.layouts.values() for n in lay['nodes'] if n.get('txt')}
    fonts = {family: fw.font_ref(family, ''.join(texts.values())) for family in sorted(families)}
    output = {'version': 1, 'screen': [1920, 1080],
              'source': 'Super Mario Party Jamboree US v0; Parts.lyt; docs/shell/controller_standby.md',
              'layouts': bundle.layouts, 'textures': textures, 'srgb': sorted(set(srgb)),
              'split': bundle.split, 'zabuton': bundle.zabuton, 'lineSpace': bundle.line_space,
              'fonts': fonts, 'texts': texts, 'missingTextures': missing}
    DST.mkdir(parents=True, exist_ok=True)
    (DST / 'controllerstandby.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(f'controllerstandby: {len(bundle.layouts)} layouts, {len(textures)} textures, missing={missing}')


if __name__ == '__main__':
    main()
