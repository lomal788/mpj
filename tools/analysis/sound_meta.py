"""
원본 사운드 정보 표 — 웹이 쓰는 라벨의 그룹 비트·플레이어·우선순위·종류와 무음 라벨을 assets/common/sound/meta.json 으로 뽑는다.
설계: docs/engine/04_sound.md §13.11.3.

- 원천: 메인 AddonAudioProject.fspj + 서브 아카이브(subarc_mg1801·subarc_rc_cmn) INFO 사운드 정보(sound_fsar.py).
- 그룹 비트 = 사용자 파라미터 비트 29 칸(docs/shell/mgm_common.md 6.9: FUN_71005c3840 색인 표 {31,30,29,28} 의 색인 2).
- 라벨 범위 = web/assets 의 JSON 에 나오는 원본 라벨(SQ_·SM_·WD_ 로 시작하는 대문자 문자열) + 세팅 프리셋 치환 대상('**' 펼침)
  + 스트림 라벨(SM_) 전부(BGM·징글·환경음 — 메시지 덕킹 0x0d·0x13 소속을 곡마다 알려고).
- 무음 = SQ_SE_DUMMY 와 *_MUTE (시퀀스 첫 명령 fin — sound_seq.py disasm 로 확인).

  python sound_meta.py --fsar <메인 fspj> [<서브 fsst> ...] --scan <에셋 폴더> --out <json>   (경로는 모두 인자 — 어느 프로젝트에도 묶이지 않음)
  mpj 예: python web/tools/analysis/sound_meta.py --fsar extracted/bea/_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj
          extracted/bea/sound~subarc_mg1801.nx.bea/audio/sounddata/subarc_mg1801/subarc_mg1801.fsst
          extracted/bea/sound~subarc_rc_cmn.nx.bea/audio/sounddata/subarc_rc_cmn/subarc_rc_cmn.fsst --scan web/assets --out web/assets/common/sound/meta.json
  (첫 --fsar 가 앞선다: 같은 라벨이면 앞 파일 값)
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sound_fsar import Fsar  # noqa: E402

LABEL = re.compile(r'^(SQ|SM|WD)_[A-Z0-9_*]+$')
KIND = {'sequence': 'seq', 'stream': 'stream', 'wave': 'wave'}


def web_labels(scan: Path, out_path: Path) -> set:
    out = set()

    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if LABEL.match(k):
                    out.add(k)
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
        elif isinstance(x, str) and LABEL.match(x):
            out.add(x)

    for p in scan.rglob('*.json'):
        if p.resolve() == out_path.resolve() or p.stat().st_size > 8_000_000:
            continue
        try:
            walk(json.loads(p.read_text(encoding='utf-8')))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
    return out


def table(fs: Fsar) -> dict:
    rows = {}
    for s in fs.sounds:
        name = s.get('name')
        if not name:
            continue
        up = s.get('userParam') or {}
        pl = s.get('player') or ''
        m = re.match(r'player:(\d+)$', pl)
        p = fs.players[int(m.group(1))] if m and int(m.group(1)) < len(fs.players) else None
        rows[name] = [int(up.get('29', 0)) & 0xFFFFFFFF, p['name'] if p else None, p['playableSoundMax'] if p else 0, s.get('playerPriority', 64), KIND.get(s.get('type'), s.get('type'))]
    return rows


def main(argv) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--fsar', nargs='+', required=True)
    ap.add_argument('--scan', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)
    OUT = Path(a.out)
    rows = {}
    for f in a.fsar:
        for k, v in table(Fsar(f)).items():
            rows.setdefault(k, v)
    want = web_labels(Path(a.scan), OUT)
    expand = set()
    for w in want:
        if '**' in w:
            rx = re.compile('^' + re.escape(w).replace(r'\*\*', '..') + '$')
            expand |= {k for k in rows if rx.match(k)}
    want |= expand
    want |= {k for k in rows if k.startswith('SM_')}
    labels = {k: rows[k] for k in sorted(want) if k in rows}
    silent = sorted(k for k in rows if k == 'SQ_SE_DUMMY' or k.endswith('_MUTE'))
    for k in silent:
        labels.setdefault(k, rows[k])
    out = {
        'source': 'sound_meta.py — fspj/fsst INFO: [그룹 비트(사용자 파라미터 비트 29), 플레이어, playableSoundMax, 플레이어 우선순위, 종류]',
        'labels': labels,
        'silent': silent,
        'missing': sorted(k for k in want if k not in rows and '**' not in k),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(OUT, '라벨', len(labels), '무음', len(silent), '원본에 없음', len(out['missing']))


if __name__ == '__main__':
    main(sys.argv[1:])
