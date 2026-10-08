"""공용 비트맵 글꼴(FFNT) → web/assets/font/. 설계: web/docs/engine/font_assets.md.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/font_web_assets.py          원본 FFNT 전부 → assets/font/
  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/font_web_assets.py check    시트 테두리(셀 사이 1px) 값 확인

출력:
  font/fcpx.json                 복합 글꼴 → {fonts: [FFNT 이름…(대체 순서)], main}
  font/<FFNT>/glyphs.json        FINF·TGLP·CWDH·CMAP(글자 → 글리프 번호, 글리프 번호 순 [left, glyphW, charW])
  font/<FFNT>/<n>.png            원본 시트 n(상하 반전 푼 것) — 커버리지 = 회색조 1채널, extension(BC7) = RGBA
화면 변환기는 font_ref(패밀리, 글자, dir) 로 명세 fonts 항목 {dir, chars} 만 쓴다(아틀라스를 만들지 않는다).
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import charsel_web_assets as cw  # noqa: E402
import ui_font  # noqa: E402

FONT_DIR = cw.FONT_DIR
DST = ROOT / "web" / "assets" / "font"


def families():
    """fcpx 이름 → FFNT 이름 목록(대체 순서). FFNT 가 없는 복합 글꼴(telop·시스템)은 뺀다"""
    out = {}
    for fam, fonts in sorted(cw.fcpx_fonts().items()):
        stems = [f.replace(".bffnt", "") for f in fonts if (FONT_DIR / f.replace(".bffnt", ".ffnt")).exists()]
        if stems:
            out[fam] = stems
    return out


def main_of(stems):
    return stems[1] if len(stems) > 1 else stems[0]


def load_font(stem):
    b = (FONT_DIR / f"{stem}.ffnt").read_bytes()
    f, cmap, widths = ui_font.parse_ffnt(b)
    return b, f, cmap, widths


def build_font(stem):
    b, f, cmap, widths = load_font(stem)
    fi, t = f["finf"], f["tglp"]
    sheets = cw.decode_sheets_any(b, f)
    color = stem.endswith("_extension")
    out = DST / stem
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for i, s in enumerate(sheets):
        img = s if color else s.split()[3]
        img.save(out / f"{i}.png", optimize=True)
        names.append(f"{i}.png")
    n = max(widths) + 1 if widths else 0
    table = {
        "font": stem, "source": f"extracted/bea/font~font_kr.nx.bea/Parts.lyt/Font_kr/{stem}.ffnt",
        "height": fi["height"], "width": fi["width"], "ascent": fi["ascent"], "lineFeed": fi["lineFeed"],
        "alterCharIndex": fi["alterCharIndex"], "defaultWidth": fi["defaultWidth"],
        "cellW": t["cellW"], "cellH": t["cellH"], "baseline": t["baseline"], "cellsPerRow": t["cellsPerRow"],
        "cellsPerCol": t["cellsPerCol"], "sheetW": t["sheetW"], "sheetH": t["sheetH"],
        "sheets": names, "color": color, "extension": stem.endswith("extension") or stem.endswith("extension_shadow"),
        "cmap": {chr(c): g for c, g in sorted(cmap.items())},
        "widths": [list(widths[i]) if i in widths else None for i in range(n)],
    }
    (out / "glyphs.json").write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(names), sum((out / x).stat().st_size for x in names)


def build():
    fams = families()
    DST.mkdir(parents=True, exist_ok=True)
    (DST / "fcpx.json").write_text(json.dumps({k: {"fonts": v, "main": main_of(v)} for k, v in fams.items()}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = 0
    for stem in sorted({s for v in fams.values() for s in v}):
        n, size = build_font(stem)
        total += size
        print(f"{stem}: 시트 {n}, {size / 1e6:.2f} MB")
    print("합", f"{total / 1e6:.2f} MB")


_cache = {}


def font_ref(family, text, dir="../font/"):
    """명세 fonts 항목: {dir, chars}. chars = text 의 글자 중 이 패밀리(구성 글꼴 아무 것이나)에 있는 것(정렬, 줄바꿈 제외)"""
    if family not in _cache:
        stems = families()[family]
        _cache[family] = [load_font(s)[2] for s in stems]
    cmaps = _cache[family]
    chars = []
    for c in sorted(set(text) - {"\n", "\r"}):
        if any(ord(c) in m for m in cmaps):
            chars.append(c)
        else:
            print(f"  {family}: 글자 없음 {c!r} U+{ord(c):04X}")
    return {"dir": dir, "chars": "".join(chars)}


def check():
    """셀 사이 테두리 열·행이 전부 0 인가(원본 시트 표본 = 전 아틀라스 표본, font_assets.md §5.6)"""
    bad = 0
    for stem in sorted({s for v in families().values() for s in v}):
        b, f, _, _ = load_font(stem)
        t = f["tglp"]
        for i, s in enumerate(cw.decode_sheets_any(b, f)):
            a = s.split()[3]
            w, h = a.size
            for cx in range(t["cellsPerRow"] + 1):
                x = cx * (t["cellW"] + 1)
                if x < w and a.crop((x, 0, x + 1, h)).getextrema()[1] > 0:
                    bad += 1
                    print("  열", stem, i, x)
            for cy in range(t["cellsPerCol"] + 1):
                y = cy * (t["cellH"] + 1)
                if y < h and a.crop((0, y, w, y + 1)).getextrema()[1] > 0:
                    bad += 1
                    print("  행", stem, i, y)
    print("테두리 0 이 아닌 줄", bad)
    return bad


if __name__ == "__main__":
    if sys.argv[1:] == ["check"]:
        sys.exit(1 if check() else 0)
    build()
