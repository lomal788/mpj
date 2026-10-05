"""rcC: tools/rcA_bgm_check.py 사본 — 셋째 인자로 종료 곡 시작 후보 시각(초)을 준다. 사용: python tools/rcC_bgm_check_at.py mg1807 out.json 40.0
사용: python tools/rcA_bgm_check.py mg1802 [out.json]
- A 렌더 0..A길이(LoopStart 틱) 구간과 DH 앞부분의 정규화 상관(지연 탐색 ±0.2 s)
- DH 의 A길이 이후 구간과 MG_ENDING 렌더의 상관
근거 수준: 렌더는 nn::atk 근사 재구현([추정]), 녹음은 원본 데이터 → 대조 결과는 [실행: 자체 렌더 vs 원본 녹음].
"""
import json, sys, tempfile
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from sound_fsar import Fsar
import sound_extract_mg1801 as X
import sound_bfstm as B
import wave

ROOT = Path(__file__).resolve().parents[3]
g = sys.argv[1]
G = g.upper()
fs = Fsar(ROOT / f'extracted/bea/sound~subarc_{g}.nx.bea/audio/sounddata/subarc_{g}/subarc_{g}.fsst')
sA, sE = fs.find(f'SQ_BGM_{G}_A'), fs.find(f'SQ_BGM_{G}_MG_ENDING')
dry, ls, jt = X.loop_structure(fs, sA, 120)
a_ticks = max(ls.values())
a_sec = a_ticks * 60.0 / (120 * dry.timebase)
_, aud = X.render_seq(fs, sA, None, 120, a_sec + 1.0)
_, end = X.render_seq(fs, sE, None, 120, 6.0)
tmp = Path(tempfile.gettempdir()) / f'rcA_{g}_dh.wav'
B.decode(ROOT / f'extracted/romfs/stream/SM_BGM_{G}_DH.dspadpcm.bfstm', tmp)
with wave.open(str(tmp)) as w:
    sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
    raw = w.readframes(w.getnframes())
dh = np.frombuffer(raw, dtype='<i2').reshape(-1, ch).astype(np.float64) / 32768.0
R = getattr(X, 'OUT_RATE', 48000)
def mono(x): return x.mean(axis=1) if x.ndim == 2 else x
def resamp(x, s0, s1):
    if s0 == s1: return x
    n = int(len(x) * s1 / s0); return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
dhm = resamp(mono(dh), sr, R); am = mono(aud); em = mono(end)
def best(a, b, off0, maxlag):
    res = (-2, 0)
    for lag in range(-maxlag, maxlag + 1, 1):
        o = off0 + lag
        if o < 0: continue
        n = min(len(a), len(b) - o)
        if n <= 0: continue
        x, y = a[:n], b[o:o + n]
        c = float(np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y) + 1e-12))
        if c > res[0]: res = (c, lag)
    return res
n = int(float(sys.argv[3]) * R) if len(sys.argv) > 3 else int(a_sec * R)
cA = best(am[:n], dhm, 0, 200)
ne = min(len(em), int(4.0 * R))
cE = best(em[:ne], dhm, n, 200)
ctrl = {str(d): round(best(em[:ne], dhm, n + int(d * R), 200)[0], 4) for d in (-1.0, -0.5, 0.5, 1.0)}
out = dict(controlEndingOffsetSec=ctrl, game=g, A_ticks=a_ticks, timebase=dry.timebase, A_sec=a_sec, dh_sec=len(dhm) / R,
           corrA=dict(r=cA[0], lagSamples=cA[1]), corrEndingAt_A_sec=dict(r=cE[0], lagSamples=cE[1]), rate=R)
print(json.dumps(out, ensure_ascii=False))
if len(sys.argv) > 2:
    Path(sys.argv[2]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
