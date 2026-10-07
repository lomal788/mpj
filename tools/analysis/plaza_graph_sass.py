"""광장(menu00) 셰이더 그래프 재질 SASS 디스어셈블 — sass_dis.py 를 고치지 않고 PROG/SHPK/OUT 경로만 바꿔 부르는 얇은 래퍼.

입력: analysis/mat/plaza/shpk/<menu00|menu_common>/forward_plus.{bfsha,json}  (bnbshpk_split.py + bfsha_dump model)
      analysis/mat/plaza/prog/match.json + <tag>.{vs,fs}{0,1}.bin       (bfsha_dump match, 재질 옵션 = glb extras.fres.shader.options)
출력: analysis/mat/plaza/sass/<tag>.{vs,fs}.txt  (프로그램마다 한 번)

사용: python web/tools/analysis/plaza_graph_sass.py --all
      python web/tools/analysis/plaza_graph_sass.py <tag> [fs|vs]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sass_dis

PLAZA = os.path.join(sass_dis.ROOT, 'analysis', 'mat', 'plaza')
sass_dis.PROG = os.path.join(PLAZA, 'prog')
sass_dis.SHPK = os.path.join(PLAZA, 'shpk')
sass_dis.OUT = os.path.join(PLAZA, 'sass')

if __name__ == '__main__':
    sass_dis.main()
