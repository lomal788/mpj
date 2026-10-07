"""mgm00 layout.lyt 요약 덤프 (모드 공용 UI 틀 분석용, web/docs/shell/mgm_common.md 10절).

ui_lyt.dump() 결과(extracted/converted/ui/mgm00/*.json)를 읽어
  analysis/mgmcommon_panes.txt  : 레이아웃별 페인 트리(+창 windowFlags·부품 레이아웃·글자 폰트)
  analysis/mgmcommon_anims.txt  : 애니별 태그 이름·시작/끝 프레임·길이·반복·대상 페인·곡선 종류
  analysis/mgmcommon_anims.json : 같은 내용 JSON
를 쓴다. 덤프가 없으면 먼저 ui_lyt.dump() 를 돌린다.
사용: python web/tools/analysis/mgmcommon_lyt_dump.py
"""
import json
import sys
from collections import OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ui_lyt  # noqa: E402

ROOT = Path("c:/dev/mpj")
SRC = ROOT / "extracted/bea/mgm~mgm00.nx.bea/mgm/mgm00/layout.lyt"
DUMP = ROOT / "extracted/converted/ui/mgm00"
OUT = ROOT / "analysis"


def pane_line(n, depth):
    t = n["translate"]
    s = n["size"]
    extra = ""
    if n["type"] == "pic1":
        extra = f" mat={n.get('material')}"
    elif n["type"] == "txt1":
        extra = f" font={n.get('font')} text={n.get('text', '')!r}"
    elif n["type"] == "prt1":
        extra = f" parts={n.get('layoutFile')}"
    elif n["type"] == "wnd1":
        extra = f" mat={n['content']['material']} windowFlags={n.get('windowFlags')}"
    sc = n.get("scale", [1, 1])
    scs = "" if sc == [1, 1] or sc == [1.0, 1.0] else f" scale=({sc[0]:g},{sc[1]:g})"
    al = "" if n.get("alpha", 255) == 255 else f" alpha={n['alpha']}"
    return (f"{'  ' * depth}{n['type']} {n['name']} pos=({t[0]:g},{t[1]:g}) size=({s[0]:g},{s[1]:g})"
            f"{scs}{al}{'' if n['visible'] else ' hidden'}{extra}")


def walk(n, depth, out):
    if n is None:
        return
    out.append(pane_line(n, depth))
    for c in n["children"]:
        walk(c, depth + 1, out)


def main():
    if not (DUMP / "_summary.json").exists():
        ui_lyt.dump(SRC, DUMP)
    lyts = sorted(p for p in DUMP.glob("*.bflyt.json"))
    pane_txt = [f"# mgm00 layout.lyt 페인 트리 (원본 {SRC}, 도구 web/tools/analysis/mgmcommon_lyt_dump.py)",
                "# 좌표 = 부모 기준, 레이아웃 원점 화면 가운데·y 위 + (charselect.md 6절)", ""]
    for p in lyts:
        d = json.loads(p.read_text(encoding="utf-8"))
        name = p.name[: -len(".bflyt.json")]
        lay = d.get("layout", {})
        pane_txt.append(f"## {name}  layout size={lay.get('width', lay.get('size'))} "
                        f"textures={len(d['textures'])} fonts={d['fonts']}")
        lines = []
        walk(d["root"], 0, lines)
        pane_txt += lines
        if d.get("groups"):
            pane_txt.append(f"  groups: {json.dumps(d['groups'], ensure_ascii=False)[:600]}")
        pane_txt.append("")
    (OUT / "mgmcommon_panes.txt").write_text("\n".join(pane_txt), encoding="utf-8")

    anims = OrderedDict()
    lyt_names = [p.name[: -len(".bflyt.json")] for p in lyts]
    for p in sorted(DUMP.glob("*.bflan.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        fname = p.name[: -len(".bflan.json")]
        owner = max((n for n in lyt_names if fname.startswith(n + "_")), key=len, default="?")
        tag = d["tag"]
        panes = OrderedDict()
        for e in d.get("entries", []):
            kinds = sorted({t["tag"] for t in e["tags"]})
            curves = sorted({tr["curve"] for t in e["tags"] for tr in t.get("tracks", [])})
            maxf = max([k[0] for t in e["tags"] for tr in t.get("tracks", []) for k in tr.get("keys", [])] or [0])
            panes[e["name"]] = {"target": e.get("target"), "kinds": kinds, "curves": curves, "lastKey": maxf}
        anims.setdefault(owner, []).append({
            "file": fname, "tag": tag["name"], "start": tag["start"], "end": tag["end"],
            "length": tag["end"] - tag["start"], "loop": d.get("loop"), "frameSize": d.get("frameSize"),
            "groups": tag.get("groups"), "entries": len(d.get("entries", [])), "panes": panes})
    (OUT / "mgmcommon_anims.json").write_text(json.dumps(anims, ensure_ascii=False, indent=1), encoding="utf-8")
    txt = [f"# mgm00 layout.lyt 애니 (원본 {SRC}, 도구 web/tools/analysis/mgmcommon_lyt_dump.py)",
           "# 길이 = 태그 끝 − 시작(프레임, 60 fps). loop = bflan 반복 플래그. 대상: 페인 이름[애니 종류]", ""]
    for owner in lyt_names:
        if owner not in anims:
            txt.append(f"## {owner}: 애니 없음")
            continue
        txt.append(f"## {owner}")
        for a in anims[owner]:
            tgt = ", ".join(f"{k}[{'/'.join(v['kinds'])}]" for k, v in list(a["panes"].items())[:12])
            more = "" if len(a["panes"]) <= 12 else f" …(+{len(a['panes']) - 12})"
            txt.append(f"  {a['tag']:<22} {a['start']:>5}..{a['end']:<5} len {a['length']:>4} "
                       f"loop={a['loop']!s:<5} entries={a['entries']:<3} {tgt}{more}")
        txt.append("")
    (OUT / "mgmcommon_anims.txt").write_text("\n".join(txt), encoding="utf-8")
    print(len(lyts), "layouts,", sum(len(v) for v in anims.values()), "anims")


if __name__ == "__main__":
    main()
