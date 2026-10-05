import re, sys
src, out, ns = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(src, encoding="utf-8").read()
blocks = re.split(r"(?m)^// ==== ", text)
skip = ("NnDetailBezel", "StaticTypeDesc", "FunctionOperationsHelper", "_internalGet", "DestroyComponentImpl", "~")
keep = []
for b in blocks[1:]:
    head = b.split("\n", 1)[0]
    name = head.split(" ", 1)[1]
    if ns in name and not any(s in name for s in skip):
        keep.append("// ==== " + b.rstrip() + "\n")
    elif name.startswith("FUN_") and len(b) > 300:
        keep.append("// ==== " + b.rstrip() + "\n")
open(out, "w", encoding="utf-8").write("\n".join(keep))
print(len(keep), "functions ->", out, sum(len(k) for k in keep))
