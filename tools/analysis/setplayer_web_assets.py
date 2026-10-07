"""플레이어 설정 흐름(web/script/shell/setplayer) 에셋 → web/assets/setplayer/setplayer.json + tex/ + font/ + sound/.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/setplayer_web_assets.py [임시 폴더]

근거: web/docs/shell/setplayer.md 2·7·9절. 레이아웃 변환은 mgmcommon_web_assets.Bundle(= charsel·modesel 변환 함수)을 그대로 쓰고,
bq Parts 에서 이 흐름이 만드는 레이아웃(sys_connect_base_00 본체·sys_connect_tlp_00 제목 띠·sys_bg_set_00 배경)과 그 부품만 고른다.
출력은 MgmSpecPart 형식(경로는 assets/mgmcommon 기준):
  layouts   위 3개 + 부품(공용 명세에 이미 있는 것은 빼고)
  fonts     공용과 같은 이름의 글꼴을 공용 문구 + 이 화면 문구 + 레이아웃 기본 문구 글자로 다시 만든 것(mergeSpec 덮어쓰기).
            큰 글꼴(bqfont_large*)은 이 화면에서 인원 숫자 "N명" 에만 쓰므로 그 글자만 넣는다
  texts     menu01_main 의 mn01_connect_ui_*·mn01_ui_ok, im_common 의 im_guest00_name, system 의 sys_ctrl_back·sys_swkbd_username_header
  sounds    SQ_SE_SYS_DECI_L(유저 단계 OK) — sound_seq.py 렌더 [근사, 공용과 같은 방식]. CURSOR·DECI·CANCEL 은 공용 명세 것
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import mgmcommon_web_assets as mc  # noqa: E402
import ui_sarc  # noqa: E402

DST = ROOT / "web" / "assets" / "setplayer"
ROOTS = ["sys_connect_base_00", "sys_connect_tlp_00", "sys_bg_set_00"]
SE = {"SQ_SE_SYS_DECI_L": "[판독] setplayer.md 6.3 유저 단계 OK 결정"}
LABELS = {
    "menu01_main": lambda k: k.startswith("mn01_connect_ui_") or k == "mn01_ui_ok",
    "im_common": lambda k: k == "im_guest00_name",
    "system": lambda k: k in ("sys_ctrl_back", "sys_swkbd_username_header"),
}
TAG = re.compile(r"\[\d+:\d+:[0-9a-f]*\]")


def closure(roots, files, have):
    need, done, found = set(roots), set(), []
    while need - done:
        for n in sorted(need - done):
            done.add(n)
            key = f"blyt/{n}.bflyt"
            if key not in files:
                print("  레이아웃 없음", n)
                continue
            found.append(n)
            need |= mc.part_refs(files[key]) - have
    return sorted(found)


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    for sub in ("font", "sound"):
        (DST / sub).mkdir(parents=True, exist_ok=True)
    parts = ui_sarc.read_files(str(mc.cw.PARTS))
    common = json.loads((mc.DST / "spec.json").read_text(encoding="utf-8"))
    have = set(common["layouts"])
    names = closure(ROOTS, parts, have)
    b = mc.Bundle("setplayer", [parts])
    b.convert(parts, names)
    print("layouts", len(names), names)

    common_dst = mc.DST
    mc.DST = DST
    tex, srgb, miss = b.write_textures("sp")
    mc.DST = common_dst
    textures = {k: "../setplayer/" + v for k, v in tex.items()}

    msg = mc.cw.messages()
    texts = {}
    for stem, pick in LABELS.items():
        src = json.loads((mc.cw.MSG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        for k in sorted(src):
            if pick(k) and k in msg:
                texts[k] = msg[k]

    default_texts = ""
    fams = set()
    for lay in b.layouts.values():
        for n in lay["nodes"]:
            if n.get("txt"):
                fams.add(n["txt"]["font"])
                default_texts += n["txt"].get("text", "")
    fams |= {"bqfont_small", "bqfont_small_shadow"}
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
        ts = text_set
        if fam.startswith("bqfont_large"):
            ts = "".join(TAG.sub("", v) for k, v in texts.items() if k.startswith("mn01_connect_ui_player_number")) + "0123456789"
        img, meta = mc.cw.build_atlas(fam, cpx[fam], ts)
        img.save(DST / meta["image"], optimize=True)
        meta["image"] = "../setplayer/" + meta["image"]
        fonts[fam] = meta
        print(fam, len(meta["glyphs"]), "glyphs", img.size)

    from sound_fsar import Fsar
    fs = Fsar(mc.FSPJ)
    sounds = {}
    for label, ev in SE.items():
        out = tmp / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(mc.FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        shutil.copyfile(out, DST / "sound" / f"{label}.wav")
        vol = fs.find(label)["volume"]
        sounds[label] = {"file": f"../setplayer/sound/{label}.wav", "gain": round(vol / 127, 4),
                         "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}

    part = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/setplayer_web_assets.py, 명세 web/docs/shell/setplayer.md 9",
            "textures": textures, "srgb": srgb, "layouts": b.layouts, "split": b.split, "zabuton": b.zabuton, "lineSpace": b.line_space,
            "fonts": fonts, "texts": texts, "sounds": sounds, "missingTextures": miss}
    (DST / "setplayer.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("setplayer.json", (DST / "setplayer.json").stat().st_size, "B", len(b.layouts), "layouts", len(textures), "textures, 없음", miss)
    print("texts", len(texts), "sounds", len(sounds))


if __name__ == "__main__":
    main()
