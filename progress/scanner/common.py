from pathlib import Path
import csv
import json
import os
import re
import sqlite3
import sys

sys.dont_write_bytecode = True
APP = Path(__file__).resolve().parents[1]
ROOT = APP.parents[1]
ADDRESS = re.compile(r"(?:0x|FUN_)?(71[0-9a-fA-F]{8,14})\b")
MODULE = re.compile(r"\b([\w-]+\.(?:nso|nro))\b", re.I)


def address(value):
    value = str(value).strip().lower().removeprefix("0x").removeprefix("fun_")
    return f"0x{int(value, 16):x}"


def relative(path):
    return path.resolve().relative_to(ROOT).as_posix()


def read_json(path, fallback=None):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(path)


def walk(folder, suffixes, excluded=()):
    if not folder.exists():
        return
    for parent, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in excluded and (Path(parent) / d).resolve() != APP]
        for name in sorted(files):
            path = Path(parent) / name
            if path.suffix.lower() in suffixes:
                yield path


class Cache:
    def __init__(self):
        self.db = sqlite3.connect(APP / ".cache" / "scanner.sqlite")
        self.db.execute("CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, stamp TEXT, payload TEXT)")
        self.hits = 0
        self.misses = 0

    def parse(self, path, parser):
        stat = path.stat()
        stamp = f"v8:{stat.st_mtime_ns}:{stat.st_size}"
        key = relative(path)
        row = self.db.execute("SELECT stamp,payload FROM files WHERE path=?", (key,)).fetchone()
        if row and row[0] == stamp:
            self.hits += 1
            return json.loads(row[1])
        value = parser(path)
        self.db.execute("REPLACE INTO files VALUES (?,?,?)", (key, stamp, json.dumps(value, ensure_ascii=False)))
        self.misses += 1
        return value

    def close(self):
        self.db.commit()
        self.db.close()


def tsv(path):
    with path.open(encoding="utf-8-sig", errors="replace", newline="") as stream:
        return list(csv.DictReader(stream, delimiter="\t"))


def default_module(path, text=""):
    name = path.name.lower()
    # Read the owner immediately after an explicit default declaration. A later
    # mention of main in the same paragraph must not override a minigame owner.
    header = re.sub(r"[*`]", "", text[:7000])
    declared = re.search(
        r"(?:따로 적지 않으면|따로 적지 않은 주소는|별도 모듈 표기가 없으면)"
        r"[ \t]*(?:모두[ \t]*)?(?:US v\d+[ \t]*)?"
        r"(main(?:[ \t]+NSO|\.nso)?|mg\d{4}(?:\.nro)?|rc_stage\d+(?:\.nro)?)\b",
        header, re.I)
    if declared:
        owner = declared[1].lower()
        return "main.nso" if owner.startswith("main") else owner.removesuffix(".nro") + ".nro"
    match = re.search(r"(mg\d{4}|rc_stage\d+)", name)
    if match:
        return match[1] + ".nro"
    if re.search(r"main|core_b|core_", name):
        return "main.nso"
    return None


def line_module(line, fallback):
    # Explicit main reference overrides minigame default; never treat all modules
    # mentioned in an asset/document list as an address owner.
    if re.search(r"\bmain(?:\.nso)?(?:\s+[\w:~]+)?\s*(?:@|[:：]|모듈)", line, re.I):
        return "main.nso"
    found = MODULE.findall(line)
    if len(set(found)) == 1:
        return found[0].lower()
    game = re.findall(r"\b(mg\d{4}|rc_stage\d+)\s*(?:::|@|모듈)", line)
    if len(set(game)) == 1:
        return game[0] + ".nro"
    return fallback
