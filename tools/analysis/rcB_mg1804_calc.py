"""mg1804 휙휙 햄버거(Burger Builders) 재구현 계산.

판독한 식을 옮긴 계산이다(원본 실행 아님). 근거 주소는 web/docs/minigame/mg1804.md.
  - CalcTotalPoint              Sequence::Impl::CalcTotalPoint @0x71000127e0 (열 0..3, 첫 글자 C/L/P/T 면 +2)
  - 칸 → 재료 종류              Stage::Impl::ReceiveTicket @0x7100018ae0 (B0 P1 C2 T3 L4 그 밖 5)
  - 재료 시계                   Parts::Entry @0x710001c624 (+0x54 = 8분×4, +0x50 = 8분×2, +0x58 = 8분×6)
  - 던지기 판정                 Parts::Throw @0x710001b340 / TimingEffect @0x710001d430 (|+0x54| < JUST_RANGE)
  - 플레이어 큐·CPU·문턱        Player::Exec @0x710000ee70, PlayerManager::Impl::ReceiveTicket @0x710000f1b0
  - 줄 배분                     BeforeOneBeat 없음, NextChartDataOffset 2 → 줄 r = B + (8 + r)×8분, NextEntry(r) = 줄 r+2
사용: .venv/Scripts/python tools/rcB_mg1804_calc.py [--out analysis/rcB_mg1804_calc.json]
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'extracted/bea/mg~mg1804.nx.bea/mg/mg1804/data'
CHARTS = ['mg1804_rm_chart00.json', 'mg1804_rm_chart01.json', 'mg1804_rm_chart00s.json']
KEYS = ['1P', '2P', '3P', '4P', 'OBJ1', 'OBJ2', 'OBJ3', 'OBJ4']
TYPE = {'B': 0, 'P': 1, 'C': 2, 'T': 3, 'L': 4}          # 그 밖 = 5 (윗번)
PARAM = dict(JUST_RANGE=0.09, SENSING_RATE_MIN=2.3, SENSING_RATE_MAX=4.0)   # CSV 우선 규칙 적용 값 [판독+데이터]


def f32(x: float) -> float:
    return struct.unpack('<f', struct.pack('<f', x))[0]


def beat_to_sec(t: int, n: int, bpm: int) -> float:
    return f32(f32(60.0 / bpm) * n * [1, .5, .5, .25, .25, .125][t])


def load(name):
    d = json.loads((DATA / name).read_text(encoding='utf-8-sig'))
    return [[d[k][r]['code'] for k in KEYS] for r in range(len(d['1P']))]


def calc_total_point(rows):
    total = 0
    lane = [0, 0, 0, 0]
    for row in rows:
        for c in range(4):
            code = row[c]
            if code and code[0] != ' ':
                lane[c] += 1
                if code[0] in 'CLPT':
                    total += 2
    return total, lane


def throw_model(bpm: int):
    """NextEntry 프레임 N(흐름 파이버, 우선순위 0)을 0 으로 둔다.
    같은 프레임 순서: 흐름(Entry/NextEntry 티켓 즉시 전달) → PlayerManager(0x20000) → Stage(0x20001).
    Player 큐 타이머: N 에 4×8분 넣고 같은 프레임 Player::Exec 부터 -dt. CPU 는 갱신 뒤 값 v 가 -8분 < v < 1/60 이면 던진다.
    재료 +0x54: Parts::Entry 에서 4×8분, 같은 프레임 Stage::Exec 부터 -dt. 던지기는 Player 가 먼저 돌므로 k 프레임째에는 k 번 뺀 값.
    재료 상태: Fall(+0x4c += dt, >= 2×8분 이면 Hold, +0x58 -= 낙하시간), Hold(+0x58 -= dt, <=0 이면 Clear=놓침)."""
    dt = f32(1 / 60)
    e = beat_to_sec(1, 1, bpm)
    q = f32(e * 4)
    p54 = f32(e * 4)
    p4c, p50, p58 = 0.0, f32(e + e), f32(e * 6)
    state = 1
    out = []
    cpu = None
    hold_from = None
    miss_at = None
    for k in range(0, 200):
        # Player::Exec (k 프레임) — 큐 타이머
        q = f32(q - dt)
        if cpu is None and -e < q < f32(1 / 60):
            cpu = k
        # 이 시점 재료 상태로 던질 수 있는가(Player 가 Stage 보다 먼저)
        if state == 2:
            t = p54
            j = 'JUST' if abs(t) < PARAM['JUST_RANGE'] else ('FAST' if t > 0 else 'SLOW')
            out.append((k, t, j))
            if hold_from is None:
                hold_from = k
        # Stage::Exec (k 프레임)
        p54 = f32(p54 - dt)
        if state == 1:
            p4c = f32(p4c + dt)
            if p50 <= p4c:
                p58 = f32(p58 - p4c)
                p4c = 0.0
                state = 2
        elif state == 2:
            p4c = f32(p4c + dt)
            p58 = f32(p58 - dt)
            if p58 <= 0.0:
                state = 7
                miss_at = k
                break
    ranges = {}
    for k, t, j in out:
        ranges.setdefault(j, [k, k])
        ranges[j][1] = k
    return dict(cpu_throw_frame=cpu, throwable_from=hold_from, auto_miss_frame=miss_at,
                ranges=ranges, t_at_cpu=[t for k, t, j in out if k == cpu])


def threshold(front_sec: float, bpm: int) -> float:
    e = beat_to_sec(1, 1, bpm)
    r = min(max(abs(front_sec) / e, 0.0), 1.0)
    return PARAM['SENSING_RATE_MIN'] + r * (PARAM['SENSING_RATE_MAX'] - PARAM['SENSING_RATE_MIN'])


def burgers(rows):
    """OBJ1 B(아래번)·E(윗번) 와 1P..4P 재료를 슬롯(0..7)별로 묶는다."""
    slots = {}
    out = []
    for r, row in enumerate(rows):
        b = row[4]
        if b and b[0] in 'BE' and len(b) > 1:
            for ch in b[1:]:
                if not ch.isdigit():
                    continue
                s = int(ch)
                if b[0] == 'B':
                    slots[s] = dict(slot=s, bottom_row=r, parts=[])
                else:
                    cur = slots.pop(s, None)
                    if cur is None:
                        out.append(dict(slot=s, bottom_row=None, top_row=r, parts=[], note='윗번만'))
                    else:
                        cur['top_row'] = r
                        out.append(cur)
        for c in range(4):
            code = row[c]
            if code and code[0] != ' ' and len(code) > 1 and code[1].isdigit():
                s = int(code[1])
                if s in slots:
                    slots[s]['parts'].append([r, code])
                else:
                    out.append(dict(slot=s, orphan_part=[r, code]))
    for s in slots.values():
        s['top_row'] = None
        out.append(s)
    return out


def table_cmds(rows):
    out = []
    for r, row in enumerate(rows):
        c = row[5]
        if c and c[0] != ' ':
            out.append([r, c])
    return out


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=int, default=120)
    ap.add_argument('--out', default=str(ROOT / 'analysis/rcB_mg1804_calc.json'))
    a = ap.parse_args(argv)
    bpm = a.bpm
    e8 = beat_to_sec(1, 1, bpm) * 60
    tm = throw_model(bpm)
    res = dict(bpm=bpm, eighth_frames=e8, throw=tm,
               threshold_examples={str(x): threshold(x, bpm) for x in (0.0, 0.0625, 0.125, 0.25, 1.0)}, charts={})
    for name in CHARTS:
        rows = load(name)
        n = len(rows)
        total, lane = calc_total_point(rows)
        req_row = n - 4                               # Lock = Entry (BeforeOneBeat 없음)
        req = (8 + req_row) * e8
        end_bar = (int(req // (8 * e8)) + 1) * 8 * e8
        notes = []
        for r, row in enumerate(rows):
            for c in range(4):
                code = row[c]
                if code and code[0] != ' ':
                    entered = r >= 2                    # NextEntry 는 줄 r-2 의 Entry 박에서 온다
                    just = (8 + r - 2) * e8 + tm['cpu_throw_frame'] if entered else None
                    notes.append(dict(row=r, lane=c, code=code, entered=entered, cpu_throw_frame_from_B=just,
                                      after_chart_end=(just is not None and just >= end_bar)))
        gaps = {}
        for c in range(4):
            rs = [x['row'] for x in notes if x['lane'] == c]
            gaps[c] = min((b - a for a, b in zip(rs, rs[1:])), default=None)
        bg = burgers(rows)
        done = [b for b in bg if b.get('bottom_row') is not None and b.get('top_row') is not None]
        # 풀(종류마다 9개) 동시 사용 추정: 재료는 NextEntry(줄-2)부터 그 버거의 윗번 줄 + slack 줄까지 살아 있다고 둔다 [추정]
        live = {}
        for slack in (4, 8, 16):
            mx = {}
            for t in range(6):
                iv = []
                for b in bg:
                    if b.get('bottom_row') is None:
                        continue
                    end = (b.get('top_row') if b.get('top_row') is not None else n) + slack
                    if t == 0:
                        iv.append((b['bottom_row'], end))
                    elif t == 5 and b.get('top_row') is not None:
                        iv.append((b['top_row'], end))
                    else:
                        for r, code in b['parts']:
                            if TYPE.get(code[0], 5) == t:
                                iv.append((r - 2, end))
                m = 0
                for x in range(n + 32):
                    m = max(m, sum(1 for a, e in iv if a <= x < e))
                mx[t] = m
            live[str(slack)] = mx
        res['charts'][name] = dict(rows=n, total=total, lane_counts=lane, min_row_gap_per_lane=gaps,
                                   pool_live_estimate=live,
                                   end_bgm_request_frame_from_B=req, chart_end_frame_from_B=end_bar,
                                   notes_not_entered=[x for x in notes if not x['entered']],
                                   notes_after_chart_end=[x for x in notes if x['after_chart_end']],
                                   burgers=bg, completed_burgers=len(done), result_model=min(len(done), 3),
                                   table_cmds=table_cmds(rows),
                                   cpu_perfect_player_scores=[2 * c for c in lane], cpu_perfect_team=min(total, 999))
    Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({k: v for k, v in res.items() if k != 'charts'}, ensure_ascii=False))
    for k, v in res['charts'].items():
        print('==', k, {x: v[x] for x in ('rows', 'total', 'lane_counts', 'min_row_gap_per_lane',
                                          'end_bgm_request_frame_from_B', 'chart_end_frame_from_B',
                                          'completed_burgers', 'result_model', 'pool_live_estimate')},
              'notEntered', len(v['notes_not_entered']), 'afterEnd', len(v['notes_after_chart_end']))
        for b in v['burgers']:
            print('   ', b)
        print('   table', v['table_cmds'])


if __name__ == '__main__':
    main(sys.argv[1:])
