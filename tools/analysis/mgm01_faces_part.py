"""승패 표 얼굴(sys_face_01 x_face_pc128 칸 1)용 모드 명세 조각 — charselect 가 이미 변환한 face_128_pcNN^u 를 가리킨다.
  .venv/Scripts/python web/tools/analysis/mgm01_faces_part.py  → web/assets/mgm01/faces.json
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CS = os.path.join(ROOT, 'web', 'assets', 'charselect', 'spec.json')
DST = os.path.join(ROOT, 'web', 'assets', 'mgm01', 'faces.json')

cs = json.load(open(CS, encoding='utf-8'))
tex = {k: '../charselect/' + v for k, v in cs['textures'].items() if k.startswith('face_128_')}
part = {'version': 1, 'screen': cs.get('screen', [1920, 1080]), 'textures': tex, 'srgb': [k for k in cs.get('srgb', []) if k in tex],
        'layouts': {}, 'split': {}, 'zabuton': {}, 'lineSpace': {}}
with open(DST, 'w', encoding='utf-8') as f:
    json.dump(part, f, ensure_ascii=False, indent=1)
print(DST, len(tex))
