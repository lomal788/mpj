"""mg1805 착착 버터(Spread 'n Butter) 재구현 계산.

판독한 식을 그대로 옮겨 계산한다(원본 실행 아님). 근거 주소는 web/docs/minigame/mg1805.md.
  - CalcTotalPoint          mg1805 @0x710000ffd0
  - 버터 묶음 수(+0x17c)     ObjsManContent::SetupObjs @0x71000060b0 (디스어셈블 0x7100007464~0x71000078f4)
  - 판정                     FUN_710000db30 (Obj 정보 +0xc = (int)(Obj+0x80*60), 목표 (int)(GetBeatToSec(0,4)*60))
  - Obj 상태 0→2→3           Obj::OnUpdate @0x71000052ec
  - 줄 배분                  RmMgSceneBase::OnGameMain 꼬리, BeforeOneBeat(1,1) → 줄 r = B + (7+r)×8분 [02_rhythm 7.3]

사용: .venv/Scripts/python tools/rcB_mg1805_calc.py [--bpm 120] [--out analysis/rcB_mg1805_calc.json]
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'extracted/bea/mg~mg1805.nx.bea/mg/mg1805/data'
CHARTS = ['mg1805_rm_chart00.json', 'mg1805_rm_chart01.json', 'mg1805_rm_chart05s.json']
KEYS = ['1P', '2P', '3P', '4P', 'OBJ1', 'OBJ2', 'OBJ3', 'OBJ4']
WIDTH = [1, 2, 3, 4]                       # DAT_7100032370 [데이터]
PARAMS = dict(InputSuccessFrame1=6, InputSuccessJustFrame1=3, InputSuccessFrame2=15, InputSuccessJustFrame2=6,
              AttackSpan_Sec=0.4)          # Scene::Params::createInstance @0x710000fcd8 [판독]


def f32(x: float) -> float:
    return struct.unpack('<f', struct.pack('<f', x))[0]


def beat_to_sec(t: int, n: int, bpm: int) -> float:
    return f32(f32(60.0 / bpm) * n * [1, .5, .5, .25, .25, .125][t])


def load(name):
    d = json.loads((DATA / name).read_text(encoding='utf-8-sig'))
    n = len(d['1P'])
    return [[d[k][r]['code'] for k in KEYS] for r in range(n)]


def setup_type(code: str):
    """SetupObjs 점프표 @0x71000324c8 (기준 'L'): (type, width, isX) 또는 None(Obj 를 만들지 않음)."""
    c = code[0]
    if c in 'SZ':
        return 0, 1, False
    if c == 'M':
        return 1, 2, False
    if c == 'L':
        return 2, 3, False
    if c == 'X':
        return 3, 4, True
    return None


def calc_total_point(rows):
    """mg1805::Scene::CalcTotalPoint @0x710000ffd0. 반환 (합계, 레인별 판정 수)."""
    total = 0
    lane = [0, 0, 0, 0]
    for row in rows:
        for col in range(4):
            code = row[col]
            if not code or code[0] == ' ':
                continue
            w = {'L': 3, 'M': 2, 'X': 4}.get(code[0], 1)
            total += 2 * w
            for k in range(col, min(col + w, 4)):   # 열 0..3 마다 디컴파일의 분기를 펼친 결과(4 를 넘는 레인은 세지 않음)
                lane[k] += 1
    return total, lane


def objects(rows):
    """SetupObjs: 셀마다 Obj. 버터(둘째 글자 'B')는 레인별 묶음 수, 빵은 묶음 안 순번."""
    objs = []
    last_butter = [None, None, None, None]
    for r, row in enumerate(rows):
        for col in range(4):
            code = row[col]
            if not code:
                continue
            if code[0] == ' ':
                continue
            t = setup_type(code)
            if t is None:
                continue
            typ, w, is_x = t
            butter = len(code) >= 2 and code[1] == 'B'
            o = dict(idx=len(objs), row=r, lane=col, code=code, type=typ, width=w, butter=butter,
                     cnt=[0, 0, 0, 0])
            objs.append(o)
            lanes = range(col, col + w)
            if butter:
                for k in lanes:
                    last_butter[k] = o
                    o['cnt'][k] = 0
            for k in lanes:
                b = last_butter[k]
                if b is not None:
                    b['cnt'][k] += 1
                if not butter and b is not None and o['cnt'][k] <= 0:
                    o['cnt'][k] = b['cnt'][k]
    for o in objs:                           # 후처리: 2 이상이면 1 빼기 (0x7100007850~0x71000078f4)
        o['cnt'] = [c - 1 if c >= 2 else c for c in o['cnt']]
    return objs


def frame_model(bpm: int):
    """Obj::OnUpdate 상태 0→2→3 과 판정 시계를 프레임 단위로 모사한다(Entry 프레임 = 0, 그 프레임은 갱신 없음).
    반환: (계수 시작 프레임, {f: diff}, 창 닫힘 프레임). 판정은 같은 프레임 ObjsMan 갱신 뒤 PlayerMan 이 읽는다.
    diff = (int)(Obj+0x80*60) - (int)(GetBeatToSec(0,4)*60). 닫힘(Obj+0x138=1) 프레임부터는 판정 대상이 아니다."""
    dt = f32(1 / 60)
    t8 = beat_to_sec(1, 1, bpm)
    t4 = beat_to_sec(0, 4, bpm)
    t9 = beat_to_sec(1, 9, bpm)               # GetBeatToSec(1, (+0x140=4)<<1 | 1)
    target = int(f32(t4 * 60))
    state, a78, a80, counting, start, close = 0, 0.0, 0.0, False, None, None
    out = {}
    for f in range(1, 400):
        if state == 0:
            a78 = f32(a78 + dt)
            if a78 >= t8:
                a78, a80, counting, state, start = 0.0, 0.0, True, 2, f
        if state == 2 and start is not None:
            a78 = f32(a78 + dt)
            if a78 >= t4:
                a78, state = 0.0, 3
        if state == 3 and a80 >= t9:          # 증가 전 값으로 검사
            counting, state, close = False, 4, f
        if counting:
            a80 = f32(a80 + dt)
        if close is None and start is not None:
            out[f] = int(f32(a80 * 60)) - target
        if close is not None:
            break
    return start, out, close


def classify(diff: int, human=True):
    if human:   # Obj+0xb8[lane] = 1 (덮는 레인 전부) → (JustFrame2, Frame2)
        j, s = PARAMS['InputSuccessJustFrame2'], PARAMS['InputSuccessFrame2']
    else:
        j, s = PARAMS['InputSuccessJustFrame1'], PARAMS['InputSuccessFrame1']
    if -j <= diff <= j:
        return 'JUST'
    if 0 <= diff <= s:
        return 'SLOW'
    if -s <= diff <= 0:
        return 'FAST'
    return None


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=int, default=120)
    ap.add_argument('--out', default=str(ROOT / 'analysis/rcB_mg1805_calc.json'))
    a = ap.parse_args(argv)
    bpm = a.bpm
    e8 = beat_to_sec(1, 1, bpm) * 60          # 8분 프레임(120 이면 15)
    start, diffs, close = frame_model(bpm)
    human = {}
    for f, d in diffs.items():
        c = classify(d)
        if c:
            human.setdefault(c, []).append(f)
    cpu_first = min(f for f, d in diffs.items() if 0 <= d <= PARAMS['InputSuccessJustFrame1'])
    res = dict(bpm=bpm, eighth_frames=e8, obj_clock=dict(
        count_start_after_entry=start, diff_by_frame={str(k): v for k, v in diffs.items() if -20 <= v <= 20},
        human_ranges={k: [min(v), max(v)] for k, v in human.items()},
        cpu_swing_frame=cpu_first, window_close_frame=close), charts={})
    for name in CHARTS:
        rows = load(name)
        total, lane = calc_total_point(rows)
        objs = objects(rows)
        n = len(rows)
        lock_req = n - 4                       # Lock 줄 >= 줄수-4 → 종료 BGM 요청
        # Lock 줄 k 시각 = B + (8 + k) 8분 (단계 6 진입 = B+1 마디 = Entry 줄 1)
        req = (8 + lock_req) * e8
        end_bar = (int(req // (8 * e8)) + 1) * 8 * e8
        late = []
        groups = []
        for o in objs:
            entry = (7 + o['row']) * e8
            o['entry_frame_from_B'] = entry
            o['target_frame_from_B'] = entry + min(f for f, d in diffs.items() if d == 0)
            if o['target_frame_from_B'] > end_bar:
                late.append(o['idx'])
            if o['butter']:
                groups.append(dict(idx=o['idx'], row=o['row'], code=o['code'], lanes=list(range(o['lane'], o['lane'] + o['width'])),
                                   cnt=[o['cnt'][k] for k in range(o['lane'], o['lane'] + o['width'])]))
        uncovered = []
        for o in objs:                         # 버터 없이 바를 빵(레인별)
            if o['butter']:
                continue
            for k in range(o['lane'], o['lane'] + o['width']):
                if o['cnt'][k] <= 0:
                    uncovered.append([o['idx'], k])
        gaps = {}
        for k in range(4):
            rs = sorted(o['row'] for o in objs if o['lane'] <= k < o['lane'] + o['width'])
            gaps[k] = min((b - a for a, b in zip(rs, rs[1:])), default=None)
        res['charts'][name] = dict(rows=n, cells=len(objs), total=total, lane_counts=lane,
                                   butter_groups=groups, bread_without_butter=uncovered,
                                   min_row_gap_per_lane=gaps,
                                   end_bgm_request_frame_from_B=req, chart_end_frame_from_B=end_bar,
                                   cells_judged_after_chart_end=late,
                                   cpu_perfect_player_scores=[2 * c for c in lane],
                                   cpu_perfect_team=min(sum(2 * c for c in lane), 999))
    Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({k: v for k, v in res.items() if k != 'charts'}, ensure_ascii=False)[:1500])
    for k, v in res['charts'].items():
        print(k, {x: v[x] for x in ('rows', 'cells', 'total', 'lane_counts', 'min_row_gap_per_lane',
                                    'end_bgm_request_frame_from_B', 'chart_end_frame_from_B',
                                    'cells_judged_after_chart_end', 'bread_without_butter')})
        for g in v['butter_groups']:
            print('   butter', g)


if __name__ == '__main__':
    main(sys.argv[1:])
