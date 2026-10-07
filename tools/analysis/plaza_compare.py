"""광장 원본 캡처와 웹 촬영을 나란히 붙인 비교 그림 (docs/shell/plaza_3d.md §6.14).

usage: python web/tools/analysis/plaza_compare.py <원본 캡처 폴더>
  원본 6.png(기구 계단 앞) ↔ web/test/out/plaza/c1_stairs.png, 7.png(광장 전경) ↔ c2_overview.png, 8.png(대기실 4/4) ↔ c3_lobby.png
출력: web/test/out/plaza/compare_{stairs,overview,lobby}.png (왼쪽 원본, 오른쪽 웹, 높이 720 맞춤) + 영역 평균색 표(표준 출력)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, "web", "test", "out", "plaza")
PAIRS = [("stairs", "6.png", "c1_stairs.png"), ("overview", "7.png", "c2_overview.png"), ("lobby", "8.png", "c3_lobby.png")]
H = 720


def fit(im):
    return im.resize((round(im.width * H / im.height), H), Image.LANCZOS)


def main(src):
    for name, orig, web in PAIRS:
        a = os.path.join(src, orig)
        b = os.path.join(OUT, web)
        if not (os.path.exists(a) and os.path.exists(b)):
            print("건너뜀", name)
            continue
        oa = fit(Image.open(a).convert("RGB"))
        wb = fit(Image.open(b).convert("RGB"))
        out = Image.new("RGB", (oa.width + wb.width + 8, H + 28), (20, 20, 20))
        out.paste(oa, (0, 28))
        out.paste(wb, (oa.width + 8, 28))
        d = ImageDraw.Draw(out)
        d.text((8, 6), "original " + orig, fill=(255, 255, 255))
        d.text((oa.width + 16, 6), "web " + web, fill=(255, 255, 255))
        out.save(os.path.join(OUT, "compare_%s.png" % name))
        ma = np.asarray(oa).reshape(-1, 3).mean(0).round()
        mb = np.asarray(wb).reshape(-1, 3).mean(0).round()
        print(name, "전체 평균 원본", ma.tolist(), "웹", mb.tolist())


if __name__ == "__main__":
    main(sys.argv[1])
