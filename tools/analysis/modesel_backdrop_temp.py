"""모드 선택 임시 배경 — 원본 menu01 하늘 텍스처(menu01_sky, 1000×250)에서 16:9 영역을 잘라 web/assets/modeselect/backdrop_temp.png 로 쓴다.
원본 배경은 런타임 3D 맵 월드 캡처라 고정 그림이 없다(docs/shell/modeselect.md 6.2). 이 그림은 사용자 지시에 따른 임시 대역 [근사].
  .venv/Scripts/python web/tools/analysis/modesel_backdrop_temp.py
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
import graphics_bntx  # noqa: E402

SRC = os.path.join(ROOT, 'extracted', 'bea', 'menu~menu01.nx.bea', 'menu', 'menu01', 'env', 'textures', 'menu01_sky.bntx')
DST = os.path.join(ROOT, 'web', 'assets', 'modeselect', 'backdrop_temp.png')
X0, W = 300, 444

with open(SRC, 'rb') as f:
    tex = [t for t in graphics_bntx.parse(f.read()) if t.name == 'menu01_sky'][0]
img = graphics_bntx.decode_layer(tex)
if not isinstance(img, Image.Image):
    img = Image.fromarray(img)
img = img.convert('RGB').crop((X0, 0, X0 + W, 250)).resize((1920, 1080), Image.LANCZOS)
img.save(DST)
print(DST, img.size)
