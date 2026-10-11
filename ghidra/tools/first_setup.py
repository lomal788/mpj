"""프로젝트 임포트가 끝난 뒤 한 번 돌리는 초기 설정 + 기존 분석 이전.

  python first_setup.py              처음부터(끝난 단계는 건너뜀)
  python first_setup.py --from 5     5단계부터
  python first_setup.py --to 4       4단계까지만
  python first_setup.py --dry        무엇을 할지만 출력

1 기준본 .gzf   2 외부 연결   3 태그 등록   4 첫 내보내기
5 이전 기록 병합(migrate.py)   6 클래스 타입 동기화(sync-types)   7 Ghidra 적용   8 다시 내보내기   9 이전 후 백업 .gzf
MCP 서버가 프로젝트를 열고 있으면 안 된다(잠금). 실패하면 그 단계에서 멈춘다.
"""
import argparse
import os
import subprocess
import sys
import time

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
from snapshot import CFG  # noqa: E402

PY = sys.executable


def run(args):
    t = time.time()
    print("  $ " + " ".join(os.path.basename(a) if i < 2 else a for i, a in enumerate(args)), flush=True)
    r = subprocess.run(args, cwd=TOOLS)
    print(f"  ({time.time() - t:.0f}s)", flush=True)
    return r.returncode == 0


def baseline_done():
    root = CFG["baseline"]
    return os.path.isdir(root) and any(f.endswith(".gzf") for _, _, fs in os.walk(root) for f in fs)


def export_done():
    return any(f == "meta.json" for _, _, fs in os.walk(CFG["db"]) for f in fs)


STEPS = [
    (1, "기준본 .gzf(손대기 전)", lambda: None if baseline_done() else [PY, "snapshot.py", "baseline", "--all"]),
    (2, "외부 연결", lambda: [PY, "snapshot.py", "link"]),
    (3, "태그 등록", lambda: [PY, "snapshot.py", "tags"]),
    (4, "첫 내보내기", lambda: None if export_done() else [PY, "snapshot.py", "export", "--all"]),
    (5, "이전 기록 병합", lambda: [PY, "migrate.py"]),
    (6, "클래스 타입 동기화", lambda: [PY, "sync_types.py"]),
    (7, "Ghidra 적용", lambda: [PY, "snapshot.py", "apply", "--all"]),
    (8, "다시 내보내기", lambda: [PY, "snapshot.py", "export", "--all"]),
    (9, "이전 후 백업 .gzf", lambda: [PY, "snapshot.py", "backup", "--all"]),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", type=int, default=1)
    ap.add_argument("--to", dest="end", type=int, default=99)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(f"프로젝트 {CFG['project']}\ndb {CFG['db']}\n", flush=True)
    for n, name, make in STEPS:
        if n < a.start or n > a.end:
            continue
        cmd = make()
        print(f"[{n}/{len(STEPS)}] {name}" + (" — 이미 됨, 건너뜀" if cmd is None else ""), flush=True)
        if cmd is None or a.dry:
            continue
        if not run(cmd):
            print(f"\n{n}단계에서 멈춤. 고친 뒤: python first_setup.py --from {n}")
            sys.exit(1)
    print("\n완료. git diff 로 web/ghidra/db 와 web/ghidra/migration/report.md 를 확인한다.")


if __name__ == "__main__":
    main()
