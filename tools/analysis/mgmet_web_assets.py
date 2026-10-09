"""미니게임 항구 화면(web/script/app/scene/world/mgmet) 추가 에셋 — 공용 묶음(assets/mgmcommon)에 없는 것만 → web/assets/mgmet/extra.json + tex/ + sound/.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/mgmet_web_assets.py [임시 폴더]

근거: web/docs/shell/mgmet_flow.md 4.2·7.2·9, mgmet_ruleconfig.md 7.3. 출력(MgmSpecPart 형식 + 문구·속성·소리, 경로는 assets/mgmcommon 기준):
  textures  설명 그림 mgmet_pict_{free,chal,daily,surv,tag,boss}_NN (HowtoPlay UpdateManual 이 x_img_00 칸 1 에 바꿔 넣는 그림, 레이아웃 기본값이 아니라 공용 변환에 빠짐)
  texts     mgm02~06 *_ent_mw_guide00 (액티비티 앞 안내 표 mgmet @0x71000e3700 의 다른 모드 문구, 글리프는 공용 글꼴이 GLYPH_ONLY 로 덮음)
  msgAttr   위 문구의 msbt ATR1 (공용 변환기 msg_attrs 그대로)
  sounds    SQ_SE_SYS_DECI_L(플레이 결정)·SQ_SE_SYS_CURSOR_S(값 변경) — sound_seq.py 렌더 [근사, 공용과 같은 방식]
여러 화면 공용 그림·효과음은 web/assets/common/ 을 ../common/… 로 가리킨다(common_shared.py, docs/engine/common_assets.md).
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import common_shared as cs  # noqa: E402
import graphics_bntx  # noqa: E402
import mgmcommon_web_assets as mc  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

DST = ROOT / "web" / "assets" / "mgmet"
PICT = ("free", "chal", "daily", "surv", "tag", "boss")
GUIDE_FILES = [f"mgm0{n}" for n in range(2, 7)]
SE = {
    "SQ_SE_SYS_DECI_L": "[판독] mgmet_ruleconfig.md 7.3 플레이 A",
    "SQ_SE_SYS_CURSOR_S": "[판독] mgmet_ruleconfig.md 7.3 값 변경 성공",
}


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    (DST / "tex").mkdir(parents=True, exist_ok=True)
    (DST / "sound").mkdir(parents=True, exist_ok=True)
    files = ui_sarc.read_files(str(mc.LYT["mgmet"]))
    lt = ui_render.LazyTextures()
    srgb_all = set()
    names = []
    for data in files.values():
        if data[:4] != b"BNTX":
            continue
        lt.add_bntx(data)
        for t in graphics_bntx.parse(data):
            if any(t.name.startswith(f"mgmet_pict_{k}_") for k in PICT):
                names.append(t.name)
                if graphics_bntx.meta(t).get("srgb"):
                    srgb_all.add(t.name)
    textures = {}
    for tn in sorted(names):
        img = lt.get(tn)
        if img is None:
            print("  텍스처 못 읽음", tn)
            continue
        fn = "tex/" + tn.replace("^", "_") + ".png"
        textures[tn] = cs.tex(tn, img, DST / fn, mc.SPEC_BASE) or "../mgmet/" + fn

    texts = {}
    for stem in GUIDE_FILES:
        src = json.loads((mc.cw.MSG_DIR / f"{stem}.json").read_text(encoding="utf-8"))
        k = f"{stem}_ent_mw_guide00"
        if k in src:
            texts[k] = src[k]
    mc.ATR_FILES = GUIDE_FILES
    attrs, _ = mc.msg_attrs(set(texts))

    from sound_fsar import Fsar
    fs = Fsar(mc.FSPJ)
    sounds = {}
    for label, ev in SE.items():
        out = tmp / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(mc.FSPJ), label, str(out)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])
        f = cs.sound(label, out, DST / "sound" / f"{label}.wav", mc.SPEC_BASE) or f"../mgmet/sound/{label}.wav"
        vol = fs.find(label)["volume"]
        sounds[label] = {"file": f, "gain": round(vol / 127, 4),
                         "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}

    part = {"version": 1, "screen": [1920, 1080],
            "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/mgmet_web_assets.py, 명세 web/docs/shell/mgmet_flow.md 9",
            "textures": textures, "srgb": sorted(n for n in srgb_all if n in textures), "layouts": {}, "split": {}, "zabuton": {}, "lineSpace": {},
            "texts": texts, "msgAttr": attrs, "sounds": sounds}
    (DST / "extra.json").write_text(json.dumps(part, ensure_ascii=False, indent=1), encoding="utf-8")
    print("extra.json", len(textures), "textures", len(texts), "texts", len(attrs), "attrs", len(sounds), "sounds")


if __name__ == "__main__":
    main()
