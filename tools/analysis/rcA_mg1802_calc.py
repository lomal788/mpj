"""rcA: mg1802 반짝반짝 과일 파르페 재구현 계산.

판독한 원본 식을 그대로 옮긴다(근거 주소는 web/docs/minigame/mg1802.md).
  - 채보 해석: Mg1802InfoManager::Impl::SetupNoteInfo @0x7100007c20, StackIngredient @0x71000084c0, SetupRotate @0x71000083ac
  - 판정 창: INGREDIENT::GetHitStatus @0x710000bebc (f32, fmsub/fmadd 단일 반올림)
  - 투척 지연: Mg1802NpcModel::Ready @0x7100009e30 / GetAction @0x71000095d0 / ThrowAction @0x71000096c8
  - 비행 시간: Mg1802ParfaitManager::Throw @0x710000a3a0
  - 쿨다운: Mg1802PlayerManager::Impl::Update @0x710000e710, util::DownTimer @0x7100016370

사용: python tools/rcA_mg1802_calc.py [out.json]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'extracted/bea/mg~mg1802.nx.bea/mg/mg1802/data'
CHARTS = ['00', '01', '00s', '06s', '09s']
KEYS = ['1P', '2P', '3P', '4P', 'OBJ1', 'OBJ2', 'OBJ3', 'OBJ4']

F = np.float32
DT = F(1.0) / F(60.0)          # GetDeltaTime (Fixed60) = 0x3C888889

# NRO 정적 표 [데이터]
INGREDIENT_TABLE = [('K0', 0), ('K1', 1), ('K2', 2), ('K3', 3), ('K4', 4), ('K5', 5), ('K6', 6),
                    ('K7_00', 7), ('K7_01', 8), ('K7_02', 9), ('K7_03', 10), ('SC', 11)]
SPEED_TABLE = [('T4', 0), ('T2', 1), ('T8', 2)]
THROW_TABLE = [('S0', 0), ('S1', 1), ('S2', 2), ('S3', 3)]
INGREDIENT_MODEL = ['obj00_0', 'obj00_2', 'obj00_3', 'obj00_4', 'obj01_0', 'obj01_2', 'obj01_0',
                    'obj08_s00', 'obj08_s01', 'obj08_s02', 'obj08_s03']
INGREDIENT_HEIGHT = [0.95, 0.55, 0.75, 0.4, 0.3, 0.5, 1.5, 0.95, 0.65, 0.9, 0.6]

PARAMS = {'acc': 2.4, 'justFrame': 3, 'justWide': 2, 'hitWide': 3, 'jumpOrange': 2, 'comMode': 0,
          'gameStartRotateDeg': -22, 'gameRotateNum': 4.5, 'resultStartRotate': -35, 'resultRotateSpeed': 10}


def find_type(code: str, table):
    """원본: 표 순서대로 부분 문자열 검색(std::string::find), 처음 맞는 값."""
    for s, v in table:
        if s in code:
            return v
    return None


def ingredient_type(code: str):
    # 표 끝까지 못 찾으면 -1 (SetupNoteInfo @0x7100007e40 직전 iVar8 = -1)
    v = find_type(code, INGREDIENT_TABLE)
    return -1 if v is None else v


def speed_index(code: str):
    if len(code) < 2:
        return 0
    v = find_type(code, SPEED_TABLE)
    return 0 if v is None else v


def throw_type(code: str):
    if len(code) < 2:
        return 0
    v = find_type(code, THROW_TABLE)
    return 0 if v is None else v


def load(no):
    d = json.load(open(DATA / f'mg1802_rm_chart{no}.json', encoding='utf-8-sig'))
    n = len(d['1P'])
    return [[d[k][r]['code'] for k in KEYS] for r in range(n)]


def parse(rows):
    """Mg1802InfoManager::Impl::SetupNoteInfo 를 그대로 옮긴다."""
    size = len(rows)
    # StackIngredient: 행 0..3, 열 (0,1), (2,3)
    stack, stack_num, cream_num = [], 0, 0
    for r in range(min(4, size)):
        for c in (0, 2):
            code = rows[r][c]
            if not code:
                continue
            t = find_type(code, INGREDIENT_TABLE)
            if t is None:
                continue
            num_s = rows[r][c + 1]
            if not num_s:
                continue
            num = int(num_s.strip() or 0)
            if t == 11:
                cream_num = num
            else:
                stack.append((t, num))
                stack_num += num
    # SetupRotate: (0,5) 각도(정수, (-180,180] 정규화), (1,5) 회전 수 → 둘 다 있을 때만 유효
    rot_begin = rot_spin = None
    rot_flag = False
    if size > 0 and rows[0][5]:
        v = int(rows[0][5])
        v = v - 360 if v >= 181 else v
        v = v + 360 if v <= -180 else v
        rot_begin = float(v)
        if size > 1 and rows[1][5]:
            rot_spin = float(rows[1][5])
            rot_flag = True
    notes, counts, max_score, seq = [], [0, 0, 0, 0], 0, stack_num
    if size >= 5:
        for r in range(4, size):
            for c in range(5):
                code = rows[r][c]
                if not code or code[0] == ' ':
                    continue
                lane = c if c < 4 else -1
                if c < 4:
                    counts[c] += 1
                t = ingredient_type(code)
                if t == 11:
                    notes.append(dict(row=r, lane=lane, type=11, throw=-1, speed=-1, slot=-1, code=code))
                    continue
                max_score += 2
                notes.append(dict(row=r, lane=lane, type=t, throw=throw_type(code), speed=speed_index(code),
                                  slot=seq, code=code))
                seq += 1
    for n in notes:
        same = sum(1 for m in notes if m['row'] == n['row'] and 0 <= m['type'] < 11)
        n['single'] = same == 1
    return dict(size=size, stack=stack, stackNum=stack_num, creamNum=cream_num, rotBegin=rot_begin,
                rotSpin=rot_spin, rotFlag=rot_flag, notes=notes, personal=counts, maxScore=max_score)


# ------------------------------------------------------------------ 시간 (BPM 120)
def beat_to_sec(t, n, bpm=120):
    scale = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125][t]
    return F(F(F(60.0) / F(bpm)) * F(n)) * F(scale)


def ready_to_throw_frames(bpm=120):
    """NpcModel::Ready 프레임 R(흐름 파이버) → Throw 가 일어나는 프레임 - R."""
    anim = F(F(bpm) / F(120.0))
    s8 = F(DT * F(F(-4.0) / anim))
    t50 = F(beat_to_sec(1, 2, bpm) + s8)
    k = 0
    while True:
        k += 1
        t50 = F(t50 - DT)          # ThrowAction: +0x50 -= dt (Npc 파이버, R+1 부터)
        if t50 <= 0:
            break
    acc, j = F(0.0), 0
    while True:
        j += 1
        acc = F(acc + anim)        # +0x54 += animSpeed (다음 프레임부터)
        if acc >= 4.0:
            break
    getaction = 0
    a48 = F(0.0)
    while True:
        getaction += 1
        a48 = F(a48 + anim)
        if a48 >= 4.0:
            break
    return dict(throwMotionFrame=k, throwFrame=k + j, holdFrame=getaction, t50_init=float(F(beat_to_sec(1, 2, bpm) + s8)))


def hit_status(T, t, jf=3, jw=2, hw=3):
    """GetHitStatus @0x710000bebc. 반환 (inWindow, isJust, remain)."""
    s9 = F(T - t)
    s9 = F(np.float64(s9) - np.float64(jf) * np.float64(DT))       # fmsub(단일 반올림)
    s10 = F(DT * F(0.5))
    s10 = F(np.float64(jw) * np.float64(DT) + np.float64(s10))     # fmadd
    s1 = F(np.float64(hw) * np.float64(DT) + np.float64(s10))      # fmadd
    s0 = F(-(np.float64(hw) * np.float64(DT)) - np.float64(s10))   # fnmadd
    inwin = (s9 >= s0) and (s9 <= s1)
    just = inwin and (s9 <= s10) and (s9 >= -s10)
    return inwin, just, float(s9)


def judge_table(speed, bpm=120):
    """던진 프레임을 0 으로 할 때, Player 파이버가 보는 elapsed = j·dt(f32 누적)일 때의 판정."""
    T = beat_to_sec(1, {0: 4, 1: 2}.get(speed, 8), bpm)
    out = []
    t = F(0.0)
    for j in range(0, int(float(T) * 60) + 12):
        inwin, just, r = hit_status(T, t)
        kind = 'JUST' if just else ('FAST' if inwin and r > 0 else ('SLOW' if inwin else None))
        if kind:
            out.append((j, kind, r))
        t = F(t + DT)
    frames = {}
    for j, kind, _ in out:
        frames.setdefault(kind, []).append(j)
    rng = {k: [v[0], v[-1]] for k, v in frames.items()}
    return dict(T=float(T), Tframes=float(T) * 60, frames=rng)


def miss_frame(speed, bpm=120):
    """Parfait 파이버: elapsed += dt 뒤 move → GetHitStatus 가 창 밖이 되면(창에 한 번 들어간 뒤) 놓침."""
    T = beat_to_sec(1, {0: 4, 1: 2}.get(speed, 8), bpm)
    t, was = F(0.0), False
    for j in range(1, 400):
        t = F(t + DT)
        inwin, _, _ = hit_status(T, t)
        if inwin:
            was = True
        elif was:
            return j - 1   # 던진 프레임 = 0, 그 프레임 move 가 첫 갱신(elapsed=dt)
    return None


def cooldown_frames():
    t, k = F(0.25), 0
    while True:
        k += 1
        nt = F(t - DT)
        t = max(nt, F(0.0))
        if nt <= 0:
            return k


def min_lane_gap(notes):
    out = {}
    for lane in range(4):
        rs = sorted(n['row'] for n in notes if n['lane'] == lane and n['type'] != 11)
        gaps = [b - a for a, b in zip(rs, rs[1:])]
        out[lane] = min(gaps) if gaps else None
    return out


def main(argv):
    out = {'params': PARAMS, 'dt': float(DT), 'charts': {}}
    rt = ready_to_throw_frames()
    out['readyToThrow'] = rt
    out['judge'] = {k: judge_table(s) for k, s in (('T4', 0), ('T2', 1), ('T8', 2))}
    out['missFrame'] = {k: miss_frame(s) for k, s in (('T4', 0), ('T2', 1), ('T8', 2))}
    out['humanCooldownFrames'] = cooldown_frames()
    for no in CHARTS:
        rows = load(no)
        p = parse(rows)
        notes = [n for n in p['notes'] if n['type'] != 11]
        creams = [n for n in p['notes'] if n['type'] == 11]
        by_type, by_speed, by_throw = {}, {}, {}
        for n in notes:
            by_type[n['type']] = by_type.get(n['type'], 0) + 1
            by_speed[n['speed']] = by_speed.get(n['speed'], 0) + 1
            by_throw[n['throw']] = by_throw.get(n['throw'], 0) + 1
        size = p['size']
        # 줄 시각: BeforeOneBeat 없음 → 줄 r = 게임 BGM 시작 + 1마디 + r·8분 (BPM 120: 120 + 15r 프레임)
        timeline = []
        for n in notes:
            thr = 120 + 15 * n['row']                     # 던지는 프레임(Ready→Throw = 30, 2줄 앞 Ready)
            T = {0: 60, 1: 30}.get(n['speed'], 120)
            timeline.append(dict(row=n['row'], lane=n['lane'], type=n['type'], code=n['code'], speed=n['speed'],
                                 throw=n['throw'], slot=n['slot'], single=n['single'],
                                 throwFrameFromBgm=thr, justCenterFrameFromBgm=thr + T - 3,
                                 arriveFrameFromBgm=thr + T - 1))
        # 단계 6: Lock 줄(+0x384) >= size-4 이면 종료 BGM 요청. Lock 은 꼬리에서 줄 size-5 를 처리한 뒤 size-4 가 되고,
        # 다음 프레임 단계 6 검사에서 요청한다 → 요청 프레임 = 줄 (size-5) 프레임 + 1. 종료 BGM 은 다음 마디 경계.
        import math
        ending_req_frame = 120 + 15 * (size - 5) + 1
        ending_start_bar = math.floor(ending_req_frame / 120.0) + 1
        # CPU(comMode 0) 전원 JUST 진행에서 JustRCSound 의 L0(콤보 수) 사슬: Hit = 첫 JUST 프레임, StartHit = Hit + 2
        ev = []
        for n in notes:
            T = {0: 60, 1: 30}.get(n['speed'], 120)
            ev.append((120 + 15 * n['row'] + T - 5 + 2, n['slot'], n['lane'], n['single'], n['row']))
        ev.sort()
        count, out_flags, reset, chain = 0, [0, 0, 0, 0], False, []
        for fr, slot, lane, single, row in ev:
            if reset:
                reset, count = False, 0
            new_sound = single or count == 0
            count += 1
            chain.append(dict(frame=fr, row=row, lane=lane, newSound=new_sound, L0=count))
            out_flags[lane] = 1
            if sum(out_flags) > 3:
                reset, out_flags = True, [0, 0, 0, 0]
        jc = sorted((t['justCenterFrameFromBgm'], t['lane']) for t in timeline)
        gap = {}
        for lane in range(4):
            fs_ = [f for f, l in jc if l == lane]
            gap[lane] = min((b - a for a, b in zip(fs_, fs_[1:])), default=None)
        out['charts'][no] = dict(minSameLaneJustGapFrames=gap, justSoundChain=chain,
            rows=size, notes=len(notes), creamNotes=len(creams), creamRows=[c['row'] for c in creams],
            stack=p['stack'], stackNum=p['stackNum'], creamStack=p['creamNum'],
            rotate=dict(begin=p['rotBegin'], spin=p['rotSpin'], fromChart=p['rotFlag']),
            personalPlayNum=p['personal'], maxScore=p['maxScore'], byType=by_type, bySpeed=by_speed,
            byThrow=by_throw, singleRows=sum(1 for n in notes if n['single']),
            glassSlotsUsed=p['stackNum'] + len(notes), minSameLaneRowGap=min_lane_gap(notes),
            unknownType=[n['code'] for n in notes if n['type'] < 0],
            endingRequestFrameFromBgm=ending_req_frame, endingBgmStartBar=ending_start_bar,
            endingBgmStartSec=ending_start_bar * 2.0,
            firstThrowFrameFromBgm=min(t['throwFrameFromBgm'] for t in timeline) if timeline else None,
            lastArriveFrameFromBgm=max(t['arriveFrameFromBgm'] for t in timeline) if timeline else None,
            timeline=timeline)
    path = Path(argv[0]) if argv else ROOT / 'analysis/rcA_mg1802_calc.json'
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    for no, c in out['charts'].items():
        print(no, {k: v for k, v in c.items() if k not in ('timeline', 'justSoundChain')})
    print('readyToThrow', rt, 'cooldown', out['humanCooldownFrames'])
    print('judge', json.dumps(out['judge']), 'miss', out['missFrame'])


if __name__ == '__main__':
    main(sys.argv[1:])
