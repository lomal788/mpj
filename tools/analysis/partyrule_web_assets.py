"""마리오 파티(보드) 파티 규칙 화면(web/script/app/scene/menu/partyrule) 에셋 → web/assets/partyrule/partyrule.json + tex/ + sound/ (글꼴 = 공용 assets/font/, font_web_assets.py).

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/partyrule_web_assets.py [임시 폴더]

근거: web/docs/shell/partyrule.md 2·7·9절. 레이아웃 변환은 mgmcommon_web_assets.Bundle(= charsel·modesel 변환 함수)을 그대로 쓰고,
원본 묶음 (menu01 lyt, menu_common lyt) + bq Parts 에서 이 화면이 만드는 레이아웃과 그 부품만 고른다. 출력(MgmSpecPart 형식, 경로는 assets/mgmcommon 기준):
  layouts   mn01_base_set_member_03(멤버 설정)·mn01_base_check_01(규칙 확인)·mn01_base_rule_01(플레이 방법 설정)·
            mn01_text_modename_01(모드 제목 띠)·mn01_text_modename_02(보드 이름 띠) + 부품, bq Parts sys_meswin_model_00·model_choices_00(+부품)
  fonts     공용 명세(assets/mgmcommon/spec.json)와 같은 이름의 글꼴을 공용 문구 + 이 화면 문구 + 레이아웃 기본 문구 글자로 다시 만든 것
            (화면 하나가 쓰는 글꼴 묶음을 덮어쓴다 — mgmcommon mergeSpec 의 fonts 덮어쓰기)
  texts     menu01_mode 의 mn01_bd_* · mn01_mode_ui_member_CPU, im_common 의 im_bdNN_name·im_comLevel00~03(CPU 난이도),
            im_menu 의 im_mn_com_speed_quick/normal(CPU 속도), system 의 sys_ctrl_back
  msgAttr   위 문구의 msbt ATR1(menu01_mode)
  sounds    SQ_SE_SYS_CURSOR_S(값 변경)·SQ_SE_SYS_DECI_L(스타트!) — sound_seq.py 렌더 [근사, 공용과 같은 방식]
  textures  레이아웃 기본값 + 코드가 CreateTexture 로 바꿔 넣는 그림(DYN_TEX: 규칙 행 아이콘·플레이 방법 그림, partyrule.md 7절)
            큰 글꼴(bqfont_large*)은 다시 만들지 않는다 — 이 화면의 큰 글꼴 문구는 턴 수 숫자뿐이고 공용 큰 글꼴에 숫자가 있다
  boards    BoardItemParam.json 의 imNameLabel 7칸(보드 이름 띠 SetBoard)
여러 화면 공용 그림·효과음은 web/assets/common/ 을 mgmcommon 기준 ../common/… 로 가리킨다(common_shared.py, docs/engine/common_assets.md).
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import graphics_bntx  # noqa: E402
import font_web_assets as fw  # noqa: E402
import mgmcommon_web_assets as mc  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "partyrule"
LYT = {
    "menu01": BEA / "menu~menu01.nx.bea" / "menu" / "menu01" / "layout.lyt",
    "menu_common": BEA / "menu~menu_common.nx.bea" / "menu" / "menu_common" / "layout.lyt",
}
ROOTS = ["mn01_base_set_member_03", "mn01_base_check_01", "mn01_base_rule_01", "mn01_text_modename_01", "mn01_text_modename_02"]
PARTS_ROOTS = ["sys_meswin_model_00", "sys_meswin_model_choices_00"]
BOARD_PARAM = BEA / "menu~menu01.nx.bea" / "menu" / "menu01" / "data" / "BoardItemParam.json"
SE = {
    "SQ_SE_SYS_CURSOR_S": "[판독] partyrule.md 7절 값 바꿈(난이도·속도·핸디캡·턴 수 등)",
    "SQ_SE_SYS_DECI_L": "[판독] partyrule.md 7절 규칙 확인 '스타트!' 선택지 결정",
}
DYN_TEX = re.compile(r"mn01_(icon_(timer|star|balloon|feel|mg)_00|pict_(bonus|mginfo|joycon|mg)_\d\d)\^")
TAG = re.compile(r"\[\d+:\d+:[0-9a-f]*\]")


def need_closure(roots, sources, have):
    need, done, found = set(roots), set(), {}
    while need - done:
        for n in sorted(need - done):
            done.add(n)
            for key, files in sources:
                if f"blyt/{n}.bflyt" in files:
                    found.setdefault(key, []).append(n)
                    need |= mc.part_refs(files[f"blyt/{n}.bflyt"]) - have
                    break
            else:
                print("  레이아웃 없음", n)
    return found


def split_origin_fix(b):
    """나눈 창(modesel split_windows) 조각은 창 노드 '가운데'에 붙여 만들어져 있다. 창 원점이 가운데가 아니면(rc·ct 등) 조각이 원점 점에
    붙어 반 폭/반 높이만큼 어긋난다 → 조각 위치에 (−o·w/2, −o·h/2) 를 더한다(partyrule.md 9.3 [설계 보정], 정점색이 고른 창만)"""
    out = []
    for name, sws in b.split.items():
        lay = b.layouts[name]
        for sw in sws:
            pi = next((i for i, n in enumerate(lay["nodes"]) if n["n"] == sw["n"]), None)
            if pi is None:
                continue
            o = lay["nodes"][pi]["o"]
            if o == [0, 0]:
                continue
            vc = lay["nodes"][pi].get("vc")
            if vc and any(c != vc[0] for c in vc):
                print("  정점색이 고르지 않아 건너뜀", name, sw["n"])
                continue
            dx, dy = -o[0] * sw["w"] / 2, -o[1] * sw["h"] / 2
            for n in lay["nodes"]:
                if n["p"] == pi and n["n"].startswith(sw["n"] + "#"):
                    n["t"] = [n["t"][0] + dx, n["t"][1] + dy]
            out.append(f"{name}/{sw['n']}({dx:+g},{dy:+g})")
    return out


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    for sub in ("sound",):
        (DST / sub).mkdir(parents=True, exist_ok=True)
    files = {k: ui_sarc.read_files(str(p)) for k, p in LYT.items()}
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    common = json.loads((mc.DST / "spec.json").read_text(encoding="utf-8"))
    have = set(common["layouts"])

    found = need_closure(ROOTS, [("menu01", files["menu01"]), ("menu_common", files["menu_common"]), ("parts", parts)], have)
    found_p = need_closure(PARTS_ROOTS, [("parts", parts)], have)
    for n in found_p.get("parts", []):
        if n not in found.setdefault("parts", []):
            found["parts"].append(n)
    b = mc.Bundle("partyrule", [files["menu01"], files["menu_common"], parts])
    for key, src in (("menu01", files["menu01"]), ("menu_common", files["menu_common"]), ("parts", parts)):
        if found.get(key):
            b.convert(src, sorted(found[key]))
    print("layouts", {k: len(v) for k, v in found.items()})
    shifted = split_origin_fix(b)
    print("split origin fix", shifted)

    common_dst = mc.DST
    mc.DST = DST
    for data in b.bntx:
        for t in graphics_bntx.parse(data):
            if DYN_TEX.match(t.name):
                b.tex_names.add(t.name)
    tex, srgb, miss = b.write_textures("pr")
    mc.DST = common_dst
    textures = {k: v if v.startswith("../") else "../partyrule/" + v for k, v in tex.items()}

    msg = mc.cw.messages()
    mjson = {s: json.loads((mc.cw.MSG_DIR / f"{s}.json").read_text(encoding="utf-8")) for s in ("menu01_mode", "im_common", "system")}
    labels = {k for k in mjson["menu01_mode"] if k.startswith("mn01_bd_") or k == "mn01_mode_ui_member_CPU"}
    labels |= {k for k in mjson["im_common"] if re.match(r"im_bd0\d_name$", k)}
    labels |= {f"im_comLevel0{i}" for i in range(4)} | {"im_mn_com_speed_quick", "im_mn_com_speed_normal", "sys_ctrl_back"}
    texts = {k: msg[k] for k in sorted(labels) if k in msg}
    mc.ATR_FILES = ["menu01_mode"]
    attrs, _ = mc.msg_attrs({k for k in texts if "_mw_" in k})

    default_texts = ""
    fams = set()
    for lay in b.layouts.values():
        for n in lay["nodes"]:
            if n.get("txt"):
                fams.add(n["txt"]["font"])
                default_texts += n["txt"].get("text", "")
    fams |= {"bqfont_small", "bqfont_small_shadow"}
    fams = {f for f in fams if not f.startswith("bqfont_large")}
    text_set = "".join(TAG.sub("", v) for v in list(common["texts"].values()) + list(texts.values()))
    text_set += default_texts + "0123456789/:-+.,!? ()%"
    for stem, keys in mc.GLYPH_ONLY.items():
        src = json.loads((mc.cw.MSG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        text_set += "".join(TAG.sub("", src.get(k, "")) for k in keys)
    cpx = mc.cw.fcpx_fonts()
    fonts = {}
    for fam in sorted(fams):
        if not cpx.get(fam):
            print("  글꼴 없음", fam)
            continue
        fonts[fam] = fw.font_ref(fam, text_set)
        print(fam, len(fonts[fam]["chars"]), "chars")

    from sound_fsar import Fsar
    fs = Fsar(mc.FSPJ)
    sounds = {}
    for label, ev in SE.items():
        out = tmp / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(mc.FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        f = mc.cs.sound(label, out, DST / "sound" / f"{label}.wav", mc.SPEC_BASE) or f"../partyrule/sound/{label}.wav"
        vol = fs.find(label)["volume"]
        sounds[label] = {"file": f, "gain": round(vol / 127, 4),
                         "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}

    boards = [p["imNameLabel"] for p in json.loads(BOARD_PARAM.read_text(encoding="utf-8-sig"))["BoardItemParam"]]
    part = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/partyrule_web_assets.py, 명세 web/docs/shell/partyrule.md 9",
            "textures": textures, "srgb": srgb, "layouts": b.layouts, "split": b.split, "zabuton": b.zabuton, "lineSpace": b.line_space,
            "fonts": fonts, "texts": texts, "msgAttr": attrs, "sounds": sounds, "boards": boards, "missingTextures": miss}
    (DST / "partyrule.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("partyrule.json", (DST / "partyrule.json").stat().st_size, "B", len(b.layouts), "layouts", len(textures), "textures, 없음", miss)
    print("texts", len(texts), "attrs", len(attrs), "sounds", len(sounds), "boards", boards)


if __name__ == "__main__":
    main()
