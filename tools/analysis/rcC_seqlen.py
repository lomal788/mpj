# 사용: python tools/rcC_seqlen.py <fsar> <라벨> [트랙0 시작 레이블 접미 _Track_0]
# 트랙0 의 시작부터 LoopStart 레이블까지 wait/note_wait 를 합산(조건·호출 무시, 정적 근사) — [재구현 계산]
import re, subprocess, sys
fsar, label = sys.argv[1], sys.argv[2]
out = subprocess.run([sys.executable, "c:/dev/mpj/web/tools/analysis/sound_seq.py", "disasm", fsar, label], capture_output=True, text=True, encoding="utf-8").stdout.splitlines()
start = next(i for i, l in enumerate(out) if "_Track_0>" in l)
total = 0; loops = []
for l in out[start:]:
    if "LoopStart>" in l and "_Track_0_" in l:
        break
    m = re.search(r"\b(wait|note_wait)\s+(\d+)", l)
    if m and "[if]" not in l:
        total += int(m.group(2))
    m2 = re.search(r"\bnote\w*\s.*?(\d+)$", l)
print(label, "track0 ticks to LoopStart =", total, "bars(384)=", total / 384)
