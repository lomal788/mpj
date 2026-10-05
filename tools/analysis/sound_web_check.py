"""웹 실시간 시퀀서(web/script/view/seq.ts) 출력 ↔ tools/sound_seq.py 렌더 대조.

  cd web && npx tsx test/out/sound_check.ts      # web/test/out/sound/*.wav 생성
  c:/dev/mpj/.venv/Scripts/python tools/sound_web_check.py

같은 변수·같은 무작위 값(random_mode)으로 렌더해 정규화 상관, 지연(샘플), RMS 비(dB), 길이를 낸다.
웹은 트랙 volume2 를 재생 중인 음에도 바로 걸고 렌더러는 노트 시작 값을 고정하므로, 재생 중 volume2 가 바뀌는 환호는 뒤쪽이 다르다(의도된 차이).

리듬 마스터 + OP(MASTER_OP_*): 웹은 두 시퀀스를 SeqEngine 으로 함께 돌려 전역 변수를 실제로 주고받는다(OP 의 G13 = 1 → countTrack 출발,
요청 G13 = 18011 → OP ENDPLAY_CHECK G10 = 1 → 다음 마디 G12 = 18011 → OP VOLOFF, 마스터 킥 쉼). 렌더러는 소리 하나씩이라
그 주고받기 결과(원본 순서 마스터 → OP 로 시뮬레이션한 틱: tools/rhythm_seqsim.py)를 각 렌더의 틱에 써 넣고 두 렌더를 더한다.
"""
from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from sound_extract_mg1801 import ARC  # noqa: E402
from sound_fsar import Fsar  # noqa: E402
from sound_seq import OUT_RATE, SeqRenderer, SoundSet  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
WEBOUT = ROOT / "web" / "test" / "out" / "sound"

# (웹 파일, 라벨, 아카이브, 전역, 지역, 무작위 모드, 초, 렌더 중 지역 변수 쓰기 [(초, 번호, 값)])
CASES = [
    ("JUST_SOUND_G8_111_L0_5_bpm120", "SQ_SE_MG1801_JUST_SOUND", "subarc_mg1801", {8: 111, 11: 120}, {0: 5}, "mid", 3, []),
    ("JUST_SOUND_G8_111_L0_1_bpm120", "SQ_SE_MG1801_JUST_SOUND", "subarc_mg1801", {8: 111, 11: 120}, {0: 1}, "mid", 3, []),
    ("JUST_SOUND_G8_111_L0_1to5_bpm120", "SQ_SE_MG1801_JUST_SOUND", "subarc_mg1801", {8: 111, 11: 120}, {0: 1}, "mid", 3, [(0.1, 0, 5)]),
    ("JUST_SOUND_G8_111_L0_1to5late_bpm120", "SQ_SE_MG1801_JUST_SOUND", "subarc_mg1801", {8: 111, 11: 120}, {0: 1}, "mid", 3, [(0.2, 0, 5)]),
    ("JUST_SOUND_G8_111_L0_5_bpm180", "SQ_SE_MG1801_JUST_SOUND", "subarc_mg1801", {8: 111, 11: 180}, {0: 5}, "mid", 3, []),
    ("JUST", "SQ_SE_MG1801_JUST", "subarc_mg1801", {}, {}, "mid", 1, []),
    ("SWING", "SQ_SE_MG1801_SWING", "subarc_mg1801", {}, {}, "mid", 1, []),
    ("FOOD_FALL_SML_r0", "SQ_SE_MG1801_FOOD_FALL_WAT_SML", "subarc_mg1801", {}, {}, "min", 1.2, []),
    ("FOOD_FALL_SML_r1", "SQ_SE_MG1801_FOOD_FALL_WAT_SML", "subarc_mg1801", {}, {}, "max", 1.2, []),
    ("CHEER_FIN_L5_100", "SQ_SE_RC_CHEER_MG_FIN", "subarc_rc_cmn", {}, {5: 100}, "mid", 7, []),
    ("CHEER_FIN_L5_20", "SQ_SE_RC_CHEER_MG_FIN", "subarc_rc_cmn", {}, {5: 20}, "mid", 7, []),
]


def read(p):
    with wave.open(str(p)) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, w.getnchannels()).astype(np.float32) / 32768
    return a


def render(label, arc, glob, local, mode, sec, writes):
    fs = Fsar(ARC[arc])
    gv = [-1] * 16
    for k, v in glob.items():
        gv[k] = v
    r = SeqRenderer(SoundSet(fs), fs.find(label), global_vars=gv, local_vars=local, random_mode=mode)
    pend = sorted(writes)
    tick = r.do_tick

    def do_tick():
        # 웹(seq.ts)은 쓰기 시각 이후에 시작하는 프레임부터 새 값을 본다 — 같은 규칙
        while pend and r.time_ms >= pend[0][0] * 1000:
            _, i, v = pend.pop(0)
            r.local[i] = v
        tick()

    r.do_tick = do_tick
    return r.render(sec)


def render_master_op(bpm, req_sec, song, sec):
    """마스터·OP 렌더 합. 틱 k 의 처리 직전에 다른 시퀀스가 그 앞에서 쓴 전역 값을 넣는다(마스터 → OP 순서)."""
    fs = Fsar(ARC["subarc_rc_cmn"])
    accept_tick = None

    def one(label, before_tick):
        gv = [-1] * 16
        gv[11] = bpm
        r = SeqRenderer(SoundSet(fs), fs.find(label), global_vars=gv, random_mode="mid")
        tick = r.do_tick
        state = {"req": False}

        def do_tick():
            before_tick(r.tick, gv)
            if not state["req"] and r.time_ms >= req_sec * 1000:
                gv[13] = song
                state["req"] = True
            tick()

        r.do_tick = do_tick
        return r.render(sec)

    # 요청이 마디 안 376틱 전이면 다음 마디 첫 틱(1 + 384·마디)에 G12 = 곡 [재구현 계산: rhythm_seqsim]
    tick_sec = lambda k: (1 / (120 * 96 / 60)) + (k - 1) * 60 / (bpm * 96) if k >= 1 else 0.0  # noqa: E731  틱 0→1 은 기본 tempo 120
    req_tick = next(k for k in range(1, 100000) if tick_sec(k) >= req_sec)
    bar = (req_tick - 1) // 384
    accept_tick = 1 + 384 * (bar + 1 if (req_tick - 1) % 384 < 376 else bar + 2)

    def master_before(k, gv):
        if k == 1:
            gv[13] = 1          # OP Track_0 이 틱 0 에(마스터 다음) 쓴 G13 = 1
        if k == 2:
            gv[8], gv[9] = 0, 0  # OP TEMPO_SETTING(틱 1, 마스터 다음)

    def op_before(k, gv):
        if k == 1:
            gv[12], gv[10] = 1, 0     # 마스터 countTrack(틱 1, OP 앞)
        if k == accept_tick:
            gv[12], gv[10] = song, 0  # 다음 마디 첫 틱 접수

    a = one("SQ_BGM_RC_MAIN_RHYTHM", master_before)
    b = one("SQ_BGM_RC_MGCMN_OP", op_before)
    n = max(len(a), len(b))
    out = np.zeros((n, 2), np.float32)
    out[: len(a)] += a
    out[: len(b)] += b
    return out


def compare(name, web, py):
    n = min(len(web), len(py))
    x, y = web[:n].mean(axis=1), py[:n].mean(axis=1)
    X = np.fft.rfft(x, 2 * n)
    Y = np.fft.rfft(y, 2 * n)
    c = np.fft.irfft(X * np.conj(Y))
    k = int(np.argmax(np.abs(c)))
    lag = k - 2 * n if k > n else k
    den = float(np.sqrt((x ** 2).sum() * (y ** 2).sum())) or 1.0
    rms = lambda a: float(np.sqrt((a ** 2).mean())) or 1e-12  # noqa: E731
    last = lambda a: (np.nonzero(np.abs(a).max(axis=1) > 1e-4)[0][-1] / OUT_RATE) if (np.abs(a) > 1e-4).any() else 0.0  # noqa: E731
    print(f"{name:40s} ncc {float(c[k]) / den:+.4f} lag {lag:+5d} rms {20 * np.log10(rms(web[:n]) / rms(py[:n])):+.2f} dB  "
          f"끝 web {last(web):.3f} s / py {last(py):.3f} s")


def main():
    for bpm, req_frames in ((120, 121), (180, 81)):
        name = f"MASTER_OP_req18011_bpm{bpm}"
        p = WEBOUT / f"{name}.wav"
        if p.exists():
            compare(name, read(p), render_master_op(bpm, req_frames / 60, 18011, 7 * 120 / bpm))
        else:
            print("없음", p)
    for name, label, arc, glob, local, mode, sec, writes in CASES:
        p = WEBOUT / f"{name}.wav"
        if not p.exists():
            print("없음", p)
            continue
        compare(name, read(p), render(label, arc, glob, local, mode, sec, writes))


if __name__ == "__main__":
    main()
