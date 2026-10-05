import re, sys
path, *keys = sys.argv[1:]
text = open(path, encoding="utf-8").read()
for b in re.split(r"(?m)^// ==== ", text)[1:]:
    head = b.split("\n", 1)[0]
    if any(k.lower() in head.lower() for k in keys):
        print("// ==== " + b.rstrip() + "\n")
