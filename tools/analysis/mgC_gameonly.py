import re, sys
src, lo, hi, out = sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3], 16), sys.argv[4]
text = open(src, encoding="utf-8").read()
blocks = re.split(r"(?m)^(?=// ==== )", text)
keep = []
for b in blocks:
    m = re.match(r"// ==== ([0-9a-fA-F]+) (.*)", b)
    if not m:
        continue
    a = int(m.group(1), 16)
    if lo <= a < hi:
        keep.append(b)
open(out, "w", encoding="utf-8").write("".join(keep))
print(len(keep), "functions")
