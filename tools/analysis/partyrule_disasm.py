"""menu01.nro 예외 어셈블리 읽기 — Ghidra C 가 switch 본문·인자를 빠뜨린 곳만 (partyrule.md 10절).

사용: c:/dev/mpj/.venv/Scripts/python web/tools/analysis/partyrule_disasm.py <시작:끝> ... → analysis/decomp/partyrule_menu01_dis.c 에 덧붙임
"""
import csv
import sys
from pathlib import Path

from capstone import CS_ARCH_ARM64, CS_MODE_ARM, Cs

sys.path.insert(0, str(Path(__file__).parent))
from nro import BASE, Image  # noqa: E402

ROOT = Path("C:/dev/mpj")
img = Image(ROOT / "extracted/romfs/nro/NX_Release/menu01.nro")
names = {int(r["address"], 16): r["name"] for r in csv.DictReader((ROOT / "analysis/functions/menu01.nro.tsv").open(encoding="utf-8"), delimiter="\t")}
cs = Cs(CS_ARCH_ARM64, CS_MODE_ARM)
lines = []
for arg in sys.argv[1:]:
    start, end = [int(x, 16) for x in arg.split(":")]
    lines.append(f"// RANGE menu01 @{start:x}..{end:x} {names.get(start, '')}")
    for ins in cs.disasm(bytes(img.mem[start - BASE:end - BASE]), start):
        note = ""
        if ins.mnemonic in ("bl", "b") and ins.op_str.startswith("#0x"):
            note = " ; " + names.get(int(ins.op_str[1:], 16), "")
        lines.append(f"{ins.address:x} {ins.mnemonic} {ins.op_str}{note}")
dest = ROOT / "analysis/decomp/partyrule_menu01_dis.c"
with dest.open("a", encoding="utf-8") as f:
    if dest.stat().st_size == 0:
        f.write("// menu01.nro only. Raw range reads (partyrule); source unchanged.\n")
    f.write("\n".join(lines) + "\n")
print("\n".join(lines))
