"""partyrule(보드 파티 규칙 화면) 디컴파일 C 에 나오는 menu01.nro 문자열 주소를 실제 문자열로 풀어 쓴다.

사용: c:/dev/mpj/.venv/Scripts/python web/tools/analysis/partyrule_strings.py <C 파일> [<C 파일> ...] > analysis/partyrule_strings.txt
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import nro  # noqa: E402

NRO = Path("c:/dev/mpj/extracted/romfs/nro/NX_Release/menu01.nro")
PAT = re.compile(r"0x(71001[5-6][0-9a-f]{4})")


def main():
    img = nro.Image(NRO)
    seen = {}
    for p in sys.argv[1:]:
        cur = ""
        for line in Path(p).read_text(encoding="utf-8").splitlines():
            if line.startswith("// ===="):
                cur = line.split()[2] + " " + line.split()[3]
            for m in PAT.finditer(line):
                va = int(m.group(1), 16)
                seen.setdefault(va, cur)
    for va in sorted(seen):
        try:
            s = img.string(va)
        except Exception as e:  # noqa: BLE001
            s = f"<{e}>"
        print(f"0x{va:x}\t{s!r}\t{seen[va]}")


if __name__ == "__main__":
    main()
