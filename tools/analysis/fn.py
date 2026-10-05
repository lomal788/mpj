import re
import sys

path, *names = sys.argv[1:]
text = open(path, encoding="utf-8").read()
blocks = re.split(r"(?m)^// ==== ", text)
for b in blocks[1:]:
    head = b.split("\n", 1)[0]
    if any(head.split(" ", 1)[1] == n or head.split(" ", 1)[1].endswith("::" + n) and "::" in n for n in names):
        print("// ==== " + b.rstrip() + "\n")
