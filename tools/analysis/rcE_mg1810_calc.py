"""rcE: mg1810(팍팍 야채샐러드) 재구현 계산 — 판독한 식을 옮겨 채보·총점·판정 프레임·COM 완주를 계산한다.

사용: python tools/rcE_mg1810_calc.py [bpm=120] [out.json]
근거: web/docs/minigame/mg1810.md (ObjsMan::Impl::SetupGame @0x71000145f0, Obj::SetupGame @0x7100016eb0,
      Obj::OnMove @0x710001b450, Obj::OnMoveMash @0x710001bb10, Obj::RecieveHit @0x710001db40,
      Player::OnMove @0x7100024ae0, Scene::CalcTotalPoint @0x7100028f50, StageMan::Impl::Entry @0x710002cac0,
      InstanceObj::SetDig @0x710001d5f0, StageMan::Impl::SetResult @0x710002bc80).
원본 실행 대조가 아니다. 박자 시계 관측 지연은 0 으로 둔다(줄 r 의 Entry 프레임 = 15r, BPM 120).
"""
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'extracted/bea/mg~mg1810.nx.bea/mg/mg1810/data'
CHARTS = ['mg1810_rm_chart00.json', 'mg1810_rm_chart01.json', 'mg1810_rm_chart06s.json', 'mg1810_rm_chart09s.json']


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


BEAT_SCALE = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125]
TYPE = {'NJ': 0, 'TM': 1, 'RD': 2, 'SI': 3, 'KB': 4}
TYPE_NAME = ['NJ', 'TM', 'RD', 'SI', 'KB']
OBJ_SIZE = [2, 4, 8, 2, 8]            # ObjsMan::Impl::SetupGame::objSize @0x710005de24
PLAYER_NUM = [1, 2, 4, 1, 4]          # ::playerNumList @0x710005de38
BASE_SCALE = [1.0, 1.57, 1.0, 1.0, 4.6]   # Params BaseScale0..4 기본값
RANK_NODE = [['rank_c', 'rank_b', 'rank_a', 'rank_s'], ['rank_c', 'rank_b', 'rank_a', 'rank_s'],
             ['rank_c', 'rank_c', 'rank_c', 'rank_s'], ['rank_c', 'rank_b', 'rank_a', 'rank_s'],
             ['rank_c', 'rank_c', 'rank_c', 'rank_s']]   # StageMan::Impl::SetResult::node_name


class Beat:
    def __init__(self, bpm):
        self.bpm = bpm

    def sec(self, t, n):
        return f32(f32(f32(60.0 / f32(self.bpm)) * f32(n)) * f32(BEAT_SCALE[t]))

    def frame(self, t, n):
        return int(f32(self.sec(t, n) * 60.0))

    def rate(self):
        return f32(f32(self.bpm) / 120.0)


def load(name):
    d = json.loads((DATA / name).read_text(encoding='utf-8-sig'))
    keys = list(d)
    rows = len(d[keys[0]])
    return [[d[k][r]['code'] for k in keys] for r in range(rows)]


def atoi(s):
    s = s.lstrip()
    n = ''
    for ch in s:
        if ch.isdigit() or (not n and ch in '+-'):
            n += ch
        else:
            break
    try:
        return int(n)
    except ValueError:
        return 0


def setup_objects(chart, bt, bd=0.6, just_range=5):
    """ObjsMan::Impl::SetupGame + Obj::SetupGame. info = 줄×4칸 ObjsChartInfo, objs = Obj 생성 순서."""
    info, objs = [], []
    zoff = f32(0.0)
    for r, row in enumerate(chart):
        max_size, max_pn = 1, 1
        step = 2                                   # local_f8: 줄마다 2 로 시작, OBJ2 가 있으면 atoi
        for lane in range(4):
            code = row[lane]
            if code == '' or code[0] == ' ':
                info.append(dict(idx=-1, type=-1, just=-100, pn=1))
                continue
            if len(code) != 2 or code not in TYPE:
                continue                           # 원본: 모르는 코드는 칸을 밀지 않고 버린다
            t = TYPE[code]
            o1 = row[4]
            count = 1 if (o1 == '' or o1[0] == ' ') else atoi(o1)
            o2 = row[5]
            if o2 != '' and o2[0] != ' ':
                step = atoi(o2)
            size_before = max(OBJ_SIZE[t], max_size)
            pn = PLAYER_NUM[t]
            half = f32(BASE_SCALE[t] * 0.5)
            just = bt.frame(1, r)
            f15 = bt.frame(1, 1)
            end = just + count * f15
            if t == 4 or count >= 2:
                end = (just if t == 4 else end) + bt.frame(1, count)
            x = f32(lane * 3.0 - 4.5)
            if pn == 2:
                x = f32(x + 1.5)
            if pn == 4:
                x = 0.0
            z = f32(f32(f32(f32(bd * r) + zoff) + half) + 0.6)
            o = dict(idx=len(objs), type=t, code=code, row=r, lane=lane, count=count, step=step, pn=pn,
                     e0=count * pn, just=just, just0=just, end=end, jr=just_range, x=x, z=z, half=half,
                     lanes=[lane <= p < min(lane + pn, 4) for p in range(4)])
            objs.append(o)
            info.append(dict(idx=o['idx'], type=t, just=just, pn=pn))
            max_pn = max(pn, max_pn)
            max_size = size_before
        if max_pn > 1:
            zoff = f32(zoff - f32(max_size * bd))
    return info, objs


def calc_total(chart):
    """Scene::CalcTotalPoint @0x7100028f50."""
    total = 0
    play = [0] * 4
    ext = [0] * 4
    for row in chart:
        for lane in range(4):
            code = row[lane]
            if code == '' or code[0] == ' ':
                continue
            normal, pts, span = True, 1, 1
            if len(code) == 2:
                if code == 'NJ':
                    pts, span = 2, 1
                elif code == 'TM':
                    pts, span = 2, 2
                elif code == 'RD':
                    pts, span = 2, 4
                elif code == 'SI':
                    pts, span = 2, 1
                elif code == 'KB':
                    normal, pts, span = False, 1, 4
            o1 = row[4]
            n = 1 if (o1 == '' or o1[0] == ' ') else atoi(o1)
            for p in range(lane, lane + span):
                if normal:
                    play[p] += n
                else:
                    ext[p] += n
            total += pts * span * n
    return total, play, ext


def stop_schedule(chart, bt):
    """StageMan::Impl::Entry @0x710002cac0 — 정지가 걸리는 줄과 정지 길이(초, KB 는 -1 = 무한)."""
    out = []
    for r, row in enumerate(chart):
        lanes = [c for c in row[:4] if c and c[0] != ' ']
        if not lanes:
            continue
        kb = any(c == 'KB' for c in lanes)
        stop = any(c in ('TM', 'RD', 'KB') for c in lanes)
        o1 = row[4]
        n = 1 if (o1 == '' or o1[0] == ' ') else atoi(o1)
        if o1 and o1[0] != ' ' and n < 1:
            n = 0
        o2 = row[5]
        if o2 and o2[0] != ' ':
            n = atoi(o2) * n
        dur = -1.0 if kb else bt.sec(1, n)
        if stop:
            out.append(dict(row=r, codes=lanes, stopSec=dur, changeTargetOffset=n))
    return out


def simulate(chart, bt, policy, big_mash=True, acc_span=0.35):
    """프레임 시뮬레이션. policy(lane, obj, info_just, cur) -> 휘두를지(사람 모사) 또는 'com'.
    프레임 순서: StageMan(프레임 수 +1) → ObjsMan(모든 Obj tick) → PlayerMan(레인 0..3)."""
    info, objs = setup_objects(chart, bt)
    for o in objs:
        o.update(d8=1, hits=[0] * 4, flag=[False] * 4, f4=0, dug=False, done=False, setdig=None,
                 active=True, mash=(o['type'] == 4 and big_mash))
    dt = f32(1.0 / 60.0)
    cool_base = f32(f32(acc_span / bt.rate()) + f32(0.016666668))
    cool_kb = f32(bt.sec(3, 1) * f32(1.4))
    players = [dict(cool=0.0, cool_set=cool_base, score=0, hitlog=[]) for _ in range(4)]
    last_end = max(o['end'] for o in objs)
    f15 = bt.frame(1, 1)
    events = []

    def is_hit(cur, just, jr):
        return abs(just - cur) < 16

    def timing(cur, just, jr):
        d = just - cur
        if abs(d) >= 16:
            return -1
        if abs(d) <= jr:
            return 2
        return 1 if d < 1 else 0

    def cur_info(lane, cur):
        for i, e in enumerate(info):
            if e['idx'] < 0:
                continue
            o = objs[e['idx']]
            if abs(e['just'] - cur) < 16 and cur < o['end']:
                col = i & 3
                if e['pn'] == 1 and col != lane:
                    continue
                if e['pn'] == 2 and not (col == lane or col + 1 == lane):
                    continue
                return e, o
        return None, None

    for cur in range(1, last_end + 40):
        # ---- ObjsMan
        for o in objs:
            if o['done']:
                continue
            if o['mash']:
                if cur < o['end']:
                    if cur > o['just'] + f15:
                        for p in range(4):
                            if o['hits'][p] < o['count']:
                                o['flag'][p] = False
                        st = bt.frame(1, o['step'])
                        if o['just'] + st <= o['end']:
                            o['d8'] += 1
                            o['just'] += st
                        else:
                            o['just'] = o['end']
                        info_e = next(e for e in info if e['idx'] == o['idx'])
                        info_e['just'] = o['just']
                    continue
                tot = sum(o['hits'])
                if tot < o['e0']:
                    o['setdig'] = None
                else:
                    o['setdig'] = True
                    o['dug'] = True
                o['done'] = True
                events.append(dict(f=cur, ev='mashEnd', obj=o['idx'], total=tot))
                continue
            if cur < o['just'] - bt.frame(1, 4):
                continue
            prev = cur - 1
            jp = o['just'] + f15
            if prev > jp:
                for p in range(4):
                    if o['hits'][p] < o['count']:
                        o['flag'][p] = False
                old = o['d8']
                o['d8'] += 1
                if old < o['count']:
                    o['just'] += bt.frame(1, o['step'])
                    if o['count'] > 1:
                        next(e for e in info if e['idx'] == o['idx'])['just'] = o['just']
            tot = sum(o['hits'])
            if prev <= jp and tot < o['e0']:
                continue
            if not any(o['flag']):
                o['active'] = False
                continue
            thr = f32(f32(f32(o['e0']) + f32(o['e0'])) * f32(0.7))
            ok = thr <= o['f4']
            in_t = cur <= o['end'] and is_hit(prev, o['just'], o['jr'])
            o['setdig'] = ok if in_t else None
            o['dug'] = True
            o['done'] = True
            events.append(dict(f=cur, ev='eval', obj=o['idx'], f4=o['f4'], thr=thr, success=ok, setDig=o['setdig']))
        # ---- PlayerMan
        all_end = all(o['end'] <= cur for o in objs)
        for lane in range(4):
            pl = players[lane]
            e, o = cur_info(lane, cur)
            w23 = e is not None and is_hit(cur, e['just'], 5) and not o['dug']
            swung = False
            if e is not None and e['type'] == 4 and big_mash:
                pl['cool_set'] = cool_kb               # +0x16c, 휘두름 판정 전에 바뀐다(되돌리지 않음)
            if pl['cool'] <= 0.0:
                already = o is not None and o['flag'][lane] and not (o['type'] == 4 and big_mash)
                want = (not already) and policy(lane, o, e['just'] if e else None, cur)
                if want and not all_end:
                    pl['cool'] = pl['cool_set']
                    swung = True
            if pl['cool'] > 0.0:
                c = f32(pl['cool'] - dt)
                pl['cool'] = 0.0 if c < 0.0 else c
            if e is None:
                continue
            t = e['type']
            mashp = (t == 4 and big_mash)
            if w23 or mashp:
                if o['flag'][lane]:
                    if not (mashp and swung):
                        continue
                elif not swung:
                    continue
            else:
                continue
            tt = timing(cur, e['just'], 5)
            just = (tt == 2) or mashp
            hitnum = o['hits'][lane]
            pts = (1 if mashp else 2) if just else 1
            if hitnum < o['count']:
                pl['score'] = min(999, pl['score'] + pts)
            jflag = just and t != 4
            if o['hits'][lane] <= o['count']:
                o['hits'][lane] += 1
                o['f4'] += 2 if jflag else 1
            o['flag'][lane] = True
            pl['hitlog'].append(dict(f=cur, obj=o['idx'], type=TYPE_NAME[t], timing=['FAST', 'SLOW', 'JUST'][tt] if tt >= 0 else 'NONE', pts=pts if hitnum < o['count'] else 0))
    total, play, ext = calc_total(chart)
    achieved = min(min(999, sum(p['score'] for p in players)), total)
    rate = max(0.0, min(100.0, f32(f32(achieved / total) * 100.0))) if total else 0.0
    judge = 3 if rate >= 80 else 2 if rate >= 40 else 1 if rate > 0 else 0
    dug = {}
    for t in range(5):
        lst = [o for o in objs if o['type'] == t]
        n = sum(1 for o in lst if o['setdig'] is not None)
        r = (n / len(lst)) if lst else 0.0
        idx = 0 if r < 1.1920929e-07 else (3 if r >= 0.9 else (2 if r >= 0.5 else 1))
        dug[TYPE_NAME[t]] = dict(objs=len(lst), setDigCalls=n, success=sum(1 for o in lst if o['setdig'] is True),
                                 ng=sum(1 for o in lst if o['setdig'] is False), rate=r, node=RANK_NODE[t][idx] if lst else None)
    maxs = [play[p] * 2 + ext[p] for p in range(4)]
    return dict(total=total, scores=[p['score'] for p in players], maxPerPlayer=maxs,
                perfect=[players[p]['score'] == maxs[p] for p in range(4)], achieved=achieved, rate=rate, judge=judge,
                dug=dug, hits=[len(p['hitlog']) for p in players],
                firstHits=players[0]['hitlog'][:6])


def main():
    bpm = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / f'analysis/rcE_mg1810_calc_bpm{bpm}.json'
    bt = Beat(bpm)
    res = dict(bpm=bpm, beatToFrame_1_1=bt.frame(1, 1), beatToFrame_1_4=bt.frame(1, 4),
               cooldownSec=f32(f32(0.35 / bt.rate()) + f32(0.016666668)), kbCooldownSec=f32(bt.sec(3, 1) * f32(1.4)),
               charts={})

    def com(lane, o, just, cur):
        return just is not None and (just - cur) <= 0 and abs(just - cur) < 16

    def fast6(lane, o, just, cur):
        if o is not None and o['type'] == 4:
            return com(lane, o, just, cur)
        return just is not None and just - cur == 6

    def slow15(lane, o, just, cur):
        if o is not None and o['type'] == 4:
            return com(lane, o, just, cur)
        return just is not None and just - cur == -15

    for name in CHARTS:
        chart = load(name)
        info, objs = setup_objects(chart, bt)
        total, play, ext = calc_total(chart)
        cnt = {}
        for o in objs:
            cnt[o['code']] = cnt.get(o['code'], 0) + 1
        res['charts'][name] = dict(
            rows=len(chart), objCount=cnt, total=total, personalPlayNum=play, ext=ext,
            stops=stop_schedule(chart, bt),
            objects=[{k: o[k] for k in ('idx', 'code', 'row', 'lane', 'count', 'step', 'pn', 'e0', 'just', 'end', 'x', 'z')} for o in objs],
            endingRequestAfterRow=len(chart) - 5,
            com=simulate(chart, bt, com),
            allFast6=simulate(chart, bt, fast6),
            allSlow15=simulate(chart, bt, slow15))
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
    for name, c in res['charts'].items():
        print(name, 'rows', c['rows'], 'objs', c['objCount'], 'total', c['total'], 'play', c['personalPlayNum'], 'ext', c['ext'])
        for k in ('com', 'allFast6', 'allSlow15'):
            s = c[k]
            print('  ', k, 'scores', s['scores'], 'max', s['maxPerPlayer'], 'rate', round(s['rate'], 3), 'judge', s['judge'],
                  'dug', {t: (v['setDigCalls'], v['success'], v['ng'], v['node']) for t, v in s['dug'].items() if v['objs']})
    print('->', out)


if __name__ == '__main__':
    main()
