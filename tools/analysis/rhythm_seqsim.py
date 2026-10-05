"""리듬 박자 시계 재구현 시뮬레이터 (FSEQ 다중 트랙, 변수만 추적, 소리 없음).

원본 시퀀스 명령을 틱 단위로 실행해 전역 변수(G11 템포, G12/G13 트리거, G14 16분음표 카운터)와
게임 BGM 로컬 변수(L0 등)가 언제 바뀌는지 기록한다. [재구현 계산]

usage: python tools/rhythm_seqsim.py <mg> [bgm_label] [bgm_start_tick] [ticks]
  예: python tools/rhythm_seqsim.py mg1801 SMF_MID_BGM_MG1801_Begin 400 6000

가정(문서에 명시):
- 변수 초기값 -1 (코드 FUN_7100426030 이 전역 0~15 를 -1 로 쓰고, NW 시퀀스 변수 기본값도 -1 로 알려져 있다)
- 같은 틱 안의 실행 순서: 마스터(SEQ_BGM_RC_RHYTHM) → OP(SMF_MID_BGM_RC_MGCMN_OP) → 게임 BGM, 각 시퀀스 안은 트랙 번호 순
- 마스터와 OP 는 틱 0 에 동시에 시작(코드 FUN_71004263c8 이 같은 프레임에 둘을 Play)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from rhythm_fseq import parse_fsar  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def fsst(name):
    return os.path.join(ROOT, "extracted", "bea", f"sound~subarc_{name}.nx.bea", "audio", "sounddata", f"subarc_{name}", f"subarc_{name}.fsst")


def find_seq(path, label):
    for pos, s in parse_fsar(path):
        if label in s.labels:
            return s
    raise KeyError(label)


class Track:
    def __init__(self, seq, idx, pc):
        self.seq, self.idx, self.pc = seq, idx, pc
        self.wait = 0
        self.stack = []
        self.loops = []
        self.flag = False
        self.tvars = [-1] * 16
        self.done = False


class SeqInst:
    def __init__(self, name, seq, label, G, log):
        self.name, self.seq = name, seq
        self.L = [-1] * 16
        self.G = G
        self.log = log
        self.tracks = [Track(seq, 0, seq.labels[label])]
        self.tempo = 120

    def getv(self, t, v):
        if v < 16:
            return self.L[v]
        if v < 32:
            return self.G[v - 16]
        return t.tvars[v - 32]

    def setv(self, t, v, val, tick):
        val = ((val + 0x8000) & 0xFFFF) - 0x8000
        if v < 16:
            old = self.L[v]
            self.L[v] = val
            if old != val:
                self.log.append((tick, self.name, f"L{v}", val))
        elif v < 32:
            old = self.G[v - 16]
            self.G[v - 16] = val
            if old != val:
                self.log.append((tick, self.name, f"G{v - 16}", val))
        else:
            t.tvars[v - 32] = val

    def step_track(self, t, tick):
        d = self.seq.d
        n = 0
        while not t.done and t.wait == 0:
            n += 1
            if n > 10000:
                raise RuntimeError("runaway")
            o = t.pc
            pre = []
            while d[o] in (0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5):
                pre.append(d[o])
                o += 1
            txt, no, kind, tgt = self.seq.decode(t.pc)
            t.pc = no
            cond = (0xA2 not in pre) or t.flag
            op = d[o]
            if not cond:
                continue
            # 마지막 인자 값
            parts = txt.replace("if ", "").split()
            def argval(s):
                s = s.strip(",")
                if s[0] in "LGT" and s[1:].isdigit():
                    base = {"L": 0, "G": 16, "T": 32}[s[0]]
                    return self.getv(t, base + int(s[1:]))
                if s.startswith("rand("):
                    return int(s[5:].split(",")[0])
                return int(s, 0)
            if op == 0x80:
                t.wait = argval(parts[1])
            elif op == 0x88:
                tr = d[o + 1]
                self.tracks.append(Track(self.seq, tr, tgt))
            elif op == 0x89:
                t.pc = tgt
            elif op == 0x8A:
                t.stack.append(t.pc)
                t.pc = tgt
            elif op == 0xFD:
                t.pc = t.stack.pop()
            elif op == 0xFF:
                t.done = True
            elif op == 0xD4:
                t.loops.append([t.pc, argval(parts[1])])
            elif op == 0xFC:
                lp = t.loops[-1]
                if lp[1] == 0:
                    t.pc = lp[0]
                else:
                    lp[1] -= 1
                    if lp[1] > 0:
                        t.pc = lp[0]
                    else:
                        t.loops.pop()
            elif op == 0xE1:
                self.tempo = argval(parts[1])
            elif op == 0xF0:
                sub = d[o + 1]
                var = d[o + 2]
                val = argval(parts[-1])
                cur = self.getv(t, var)
                if sub == 0x80:
                    self.setv(t, var, val, tick)
                elif sub == 0x81:
                    self.setv(t, var, cur + val, tick)
                elif sub == 0x82:
                    self.setv(t, var, cur - val, tick)
                elif sub == 0x83:
                    self.setv(t, var, cur * val, tick)
                elif sub == 0x84:
                    self.setv(t, var, int(cur / val) if val else cur, tick)
                elif sub == 0x8B:
                    self.setv(t, var, cur % val if val else cur, tick)
                elif sub == 0x90:
                    t.flag = cur == val
                elif sub == 0x91:
                    t.flag = cur >= val
                elif sub == 0x92:
                    t.flag = cur > val
                elif sub == 0x93:
                    t.flag = cur <= val
                elif sub == 0x94:
                    t.flag = cur < val
                elif sub == 0x95:
                    t.flag = cur != val
            # 그 밖의 명령(음표·볼륨 등)은 변수에 영향이 없으므로 무시
        if t.wait > 0:
            t.wait -= 1

    def step(self, tick):
        for t in sorted(self.tracks, key=lambda x: x.idx):
            if not t.done:
                self.step_track(t, tick)


def main():
    mg = sys.argv[1]
    bgm_label = sys.argv[2] if len(sys.argv) > 2 else None
    bgm_start = int(sys.argv[3]) if len(sys.argv) > 3 else -1
    ticks = int(sys.argv[4]) if len(sys.argv) > 4 else 4000
    G = [-1] * 16
    G[11] = 120
    log = []
    cmn = fsst("rc_cmn")
    master = SeqInst("MAIN_RHYTHM", find_seq(cmn, "SEQ_BGM_RC_RHYTHM"), "SEQ_BGM_RC_RHYTHM", G, log)
    op = SeqInst("MGCMN_OP", find_seq(cmn, "SMF_MID_BGM_RC_MGCMN_OP_Begin"), "SMF_MID_BGM_RC_MGCMN_OP_Begin", G, log)
    insts = [master, op]
    bgm = None
    for tick in range(ticks):
        if bgm_label and tick == bgm_start:
            bgm = SeqInst("GAME_BGM", find_seq(fsst(mg), bgm_label), bgm_label, G, log)
            insts.append(bgm)
        for s in insts:
            s.step(tick)
    for tick, who, var, val in log:
        if var == "G14" and val not in (1, 4, 13):
            continue
        print(f"tick {tick:6d} (bar {tick / 384:7.3f}) {who:12s} {var} = {val}")


if __name__ == "__main__":
    main()
