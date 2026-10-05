import re, sys
src, out, ns = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read()
blocks = re.split(r"(?m)^// ==== ", text)
keep = []
for b in blocks[1:]:
    head = b.split("\n", 1)[0]
    body = b
    if ns in head or (head.split(" ",1)[1].startswith("FUN_") and len(b) > 400):
        keep.append("// ==== " + b.rstrip() + "\n")
open(out, "w", encoding="utf-8").write("\n".join(keep))
print(len(keep), "functions ->", out)
