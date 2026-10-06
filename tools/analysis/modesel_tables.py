"""menu01.nro ComUiMap 이 쓰는 표·문자열을 읽어 출력한다 (모드 선택 화면 분석용).

사용: c:/dev/mpj/.venv/Scripts/python web/tools/analysis/modesel_tables.py [menu01.nro]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import nro  # noqa: E402

NRO = Path("c:/dev/mpj/extracted/romfs/nro/NX_Release/menu01.nro")


def rel_table(img, va, n):
    return [img.string(va + img.i32(va + 4 * i)) for i in range(n)]


def main():
    img = nro.Image(sys.argv[1] if len(sys.argv) > 1 else NRO)
    print("btn names  PTR 0x71001961f8:", [img.string(img.u64(0x71001961f8 + 8 * i)) for i in range(9)])
    print("detail lbl DAT 0x7100163618:", rel_table(img, 0x7100163618, 9))
    print("name lbl   DAT 0x710016363c:", rel_table(img, 0x710016363c, 9))
    for va in (0x710015c122, 0x7100162044, 0x710015ed50, 0x710015c324, 0x71001623ab, 0x7100159463,
               0x710015b9f6, 0x710015c18a):
        print(f"str 0x{va:x}: {img.string(va)!r}")


if __name__ == "__main__":
    main()
