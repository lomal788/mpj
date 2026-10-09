"""미니게임 공용 틀(web/script/shell/mgscene, 그리기 web/script/view/mgsceneUi.ts) 에셋 → web/assets/mgscene/.

  c:/dev/mpj/.venv/Scripts/python web/tools/analysis/mgscene_web_assets.py [임시 폴더]

근거: web/docs/shell/minigame_scene.md §12(12.1 판독 표). 레이아웃 변환은 mg1801_web_ui.py 함수(parse·마스크·글꼴)를 그대로 쓴다.
  ui.json      layouts{이름: bflyt}, anims{이름: {태그: bflan}}, textures{이름: png 경로}, fonts{패밀리: 공용 글꼴 참조}, telopFont, texts{라벨: koKR}
               레이아웃 = 텔롭(ComUiMGTelop 종류 0~2·5~8), 종료 타이머(ComUiTimer), 상태 얼굴(ComUiStatus pos 전부 + 부품), 스킵 안내(ComUiGuideSkip),
               와이프(WipeModule Black·White) + 부품 레이아웃(prt1 layoutFile) 닫힘
  tables.json  mgSetting(ND·CA, 문자열 열거 → 정수: minigame_scene §12.1), mgList(GameRule 정수·Coin·Endless), mgSound(audio/data/mgsound_setting.json)
  sound.json   효과음(sound_seq.py 렌더 [근사], SQ_SE_SYS_* 는 공용 assets/common/sound), 보이스(웨이브 사운드 PCM 그대로), 틀 BGM·징글(BFSTM 디코드)
  font/bqfont_telop.otf  텔롭 글자 서브셋(mg1801_web_ui.telop_font)
더미 게임 BGM(시험 항목 mg0101 표 행)은 web/assets/mgdummy/sound/ 로 따로 쓴다(게임 폴더).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "web/tools/analysis"))
import common_shared as cs  # noqa: E402
import font_web_assets as fw  # noqa: E402
import mg1801_web_ui as mu  # noqa: E402
import sound_bfstm  # noqa: E402
import ui_lyt  # noqa: E402
import ui_render  # noqa: E402
import ui_sarc  # noqa: E402

BEA = ROOT / "extracted" / "bea"
DST = ROOT / "web" / "assets" / "mgscene"
DUMMY = ROOT / "web" / "assets" / "mgdummy"
PARTS = BEA / "bq.nx.bea" / "Parts.lyt"
DATA = BEA / "bq.nx.bea" / "common" / "data"
MGSOUND = BEA / "audio.nx.bea" / "audio" / "data" / "mgsound_setting.json"
STREAM = ROOT / "extracted" / "romfs" / "stream"
FSPJ = cs.FSPJ

STATUS = ([f"sys_mgstat_pos4_{i:02d}" for i in range(12)] + [f"sys_mgstat_pos22_{i:02d}" for i in range(9)]
          + [f"sys_mgstat_pos13_{i:02d}" for i in range(3)] + [f"sys_mgstat_pos11_{i:02d}" for i in range(3)])
ROOTS = ["sys_tlp_start_00", "sys_tlp_321go_00", "sys_tlp_finish_00", "sys_tlp_win_center_00", "sys_tlp_win_top_00", "sys_tlp_win_top_01",
         "sys_tlp_win_00", "sys_tlp_win_01", "sys_tlp_draw_00", "sys_timer_00", "sys_guide_pos_00", "wipe"] + STATUS
WIPE_TAGS = {"WipeBlack_in", "WipeBlack_normal", "WipeBlack_out", "WipeWhite_in", "WipeWhite_normal", "WipeWhite_out"}

PC = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12", "13", "14", "50", "51", "52", "53", "54", "56", "58", "61", "62"]
LABELS = ["mg_tl101", "mg_tl102_count", "mg_tl102_go", "mg_tl301", "mg_tl302_name_max2", "mg_tl302_name_max4", "mg_tl302_win", "mg_tl302_wins",
          "mg_tl303", "mg_ui501"] + [f"im_pc{n}_name" for n in PC]
TELOP_TEXT = "STARTFINISHGO!WINSDRAW0123456789"

# 효과음(근거 = minigame_scene §12.1). volume 0 은 원본도 무음이지만 그대로 싣는다(gain 0)
SE = {
    "SQ_SE_TLP_START": "[데이터] se_common_layout.ftrg sys_tlp_start_00 \"in\" f0 (volume 0)",
    "SQ_SE_TLP_FINISH": "[데이터] se_common_layout.ftrg sys_tlp_finish_00 \"in\" f0",
    "SQ_SE_TLP_321GO_1": "[데이터] se_common_layout.ftrg sys_tlp_321go_00 \"count\" f0 번호 1 (volume 0)",
    "SQ_SE_TLP_321GO_2": "[데이터] 같음 번호 2 (volume 0)",
    "SQ_SE_TLP_321GO_3": "[데이터] 같음 번호 3 (volume 0)",
    "SQ_SE_TLP_321GO_GO": "[데이터] se_common_layout.ftrg sys_tlp_321go_00 \"go\" f0 (volume 0)",
    "SQ_SE_MG_FINISH": "[판독] ComUiMGTelop::Start 종류 2 (volume 0)",
    "SQ_SE_SYS_WHISTLE": "[판독] MGSound::TryStartWhistle",
    "SQ_SE_SYS_MG_COUNT_TIMER": "[판독] ComUiTimer 표시 갱신 FUN_71002d5030(남은 ≤ 경고 초)",
    "SQ_SE_SYS_SKIP": "[판독] FUN_71001e5778 오프닝 건너뛰기",
}
VOICES = ["WD_VOI_LOC_SYS_START", "WD_VOI_LOC_SYS_FINISH", "WD_VOI_LOC_SYS_WINNER", "WD_VOI_LOC_SYS_WINNERS", "WD_VOI_LOC_SYS_DRAW",
          "WD_VOI_LOC_SYS_1", "WD_VOI_LOC_SYS_2", "WD_VOI_LOC_SYS_3", "WD_VOI_LOC_SYS_GO"]
# (라벨, 반복: None = BFSTM 헤더, False = 없음, 'region:<이름>' = 리전 구간), 근거
BGM = [
    ("SM_JIN_MG_WIN", False, "[판독] MGSound 결과 징글 FUN_71001e51e0"),
    ("SM_JIN_MG_DRAW", False, "[판독] 같음"),
    ("SM_BGM_MGINST", None, "[데이터] mgsound_setting inst_bgm_label(설명 화면 안 실행)"),
]
DUMMY_BGM = [
    ("SM_BGM_MG0101_JMP", "region:REG_MAIN_01", "[데이터] mgsound_setting mg0101 mg_bgm_label; 반복 = 리전 REG_MAIN_01 [추정]"),
]

ENUM = {
    "GameRule": {"None": -1, "VS4": 0, "2VS2": 1, "1VS3": 2, "1VS1": 3, "VS8": 4, "1VS7": 5, "VS30": 6, "Chara": 7, "Item": 8, "Boss": 9,
                 "Rhythm": 10, "Busters": 11, "Athlon": 12, "AthlonSP": 13, "Extra": 14},
    "TimerPos": {"None": -1, "TL": 0, "TC": 1, "TR": 2, "CL": 3, "CC": 4, "CR": 5, "BL": 6, "BC": 7, "BR": 8},
    "StatusFace": {"None": -1, "Corner": 0, "Top": 2, "Bottom": 3, "Split00_Top": 4, "Split00_Bottom": 5, "Split01_Top": 6, "Split01_Top_Slim": 7,
                   "Split01_Bottom": 8, "Split01_Corner": 9, "Left_Top": 10, "Right_Top": 11, "2vs2_Top": 12, "2vs2_Bottom": 13, "2vs2_Left_Top": 14,
                   "2vs2_Split00_Top": 15, "2vs2_Split00_Bottom": 16, "2vs2_Split01_Left_Top": 17, "2vs2_Split01_Right_Top": 18,
                   "2vs2_Split01_Left_Bottom": 19, "2vs2_Split01_Right_Bottom": 20, "1vs3_Top": 21, "1vs3_Bottom": 22, "1vs3_Left_Top": 23,
                   "1vs1_Top": 24, "1vs1_Bottom": 25},
    "InTiming": {"None": -1, "Telop": 0, "AfterTelop": 1, "Ending": 2},
    "OutTiming": {"None": -1, "Telop": 0, "AfterTelop": 1, "FadeOut": 2},
    "InstLoop": {"None": -1, "Finish": 0, "Result": 1},
    "BgmPos": {"telop_start": 0, "telop_3": 1, "scene_start": 2},
    "ResultPos": {"start": 0, "telop": 1},
}


def tags_of(files, name):
    pre = f"anim/{name}_"
    tags = sorted(k[len(pre):-6] for k in files if k.startswith(pre) and k.endswith(".bflan"))
    return [t for t in tags if t in WIPE_TAGS] if name == "wipe" else tags


def part_refs(lay):
    out = set()

    def walk(p):
        if p["type"] == "prt1" and p.get("layoutFile"):
            out.add(p["layoutFile"])
        for c in p["children"]:
            walk(c)
    walk(lay["root"])
    return out


def convert_layouts(files):
    layouts, anims, textures = {}, {}, {}
    lt = ui_render.LazyTextures()
    for data in files.values():
        if data[:4] == b"BNTX":
            lt.add_bntx(data)
    todo, done = list(ROOTS), set()
    texnames = set()
    while todo:
        name = todo.pop(0)
        if name in done:
            continue
        done.add(name)
        raw = files.get(f"blyt/{name}.bflyt")
        if raw is None:
            print("  레이아웃 없음", name)
            continue
        lay = ui_lyt.parse_bflyt(raw)
        assert not lay["_check"], (name, lay["_check"])
        masks = mu.pane_masks(raw, lay["textures"])
        mu.attach_masks(lay["root"], masks)
        layouts[name] = mu.clean_layout(lay)
        anims[name] = {}
        texnames |= set(lay["textures"]) | {m["tex"] for m in masks.values()}
        for t in tags_of(files, name):
            an = ui_lyt.parse_bflan(files[f"anim/{name}_{t}.bflan"])
            assert not an["_check"], (name, t, an["_check"])
            anims[name][t] = mu.clean_anim(an)
            texnames |= set(an.get("textures", []))
        todo += sorted(part_refs(lay) - done)
    texnames |= {f"face_128_pc{n}^u" for n in PC}
    for tn in sorted(texnames):
        img = lt.get(tn)
        if img is None:
            print(f"  텍스처 없음 {tn} (런타임 생성으로 보임)")
            continue
        fn = "tex/" + tn.replace("^", "_") + ".png"
        textures[tn] = cs.tex(tn, img, DST / fn, DST) or fn
    return layouts, anims, textures


def font_families(layouts):
    fams = set()

    def walk(p):
        if p["type"] == "txt1" and p.get("font"):
            fams.add(p["font"].replace(".fcpx", ""))
        for c in p["children"]:
            walk(c)
    for lay in layouts.values():
        walk(lay["root"])
    return sorted(fams)


def tables():
    def load(p):
        return json.loads(p.read_text(encoding="utf-8-sig"))
    out = {"source": "bq common/data mgListND·mgListCA, audio/data/mgsound_setting.json — 열거 정수 = minigame_scene §12.1", "enum": ENUM,
           "mgSetting": {}, "mgList": {}, "mgSound": {}}
    for f, kind in (("mgListND", "ND"), ("mgListCA", "CA")):
        d = load(DATA / f"{f}.json")
        for r in d["mgSetting"]:
            out["mgSetting"][r["Name"]] = {
                "list": kind, "openingSkip": r["OpeningSkip"], "endingChangeCut": r["EndingChangeCut"],
                "gameEndTimerPos": ENUM["TimerPos"][r["GameEndTimerPos"]], "gameEndTime": r["GameEndTime"],
                "endlessGameEndTimerPos": ENUM["TimerPos"][r.get("EndlessGameEndTimerPos", "None")], "endlessEndTime": r.get("EndlessEndTime", 0),
                "orderShuffle": r["OrderShuffle"], "statusFace": ENUM["StatusFace"][r["StatusFace"]],
                "statusIn": ENUM["InTiming"][r["StatusInTiming"]], "statusOut": ENUM["OutTiming"][r["StatusOutTiming"]],
                "timerIn": ENUM["InTiming"][r["TimerInTiming"]], "timerOut": ENUM["OutTiming"][r["TimerOutTiming"]],
                "endSeqWaitTime": r["EndSeqWaitTime"], "instLoop": ENUM["InstLoop"][r.get("InstLoopTiming", "Finish")],
            }
        for r in d["mgList"]:
            out["mgList"][r["Name"]] = {"list": kind, "gameRule": ENUM["GameRule"][r["GameRule"]], "coin": r["Coin"], "endless": r["Endless"],
                                        "gyro": r["Gyro"], "callInst": r["CallInst"]}
    for r in load(MGSOUND)["MgSoundData"]:
        s = lambda v: v if isinstance(v, str) and v != "0" else ""  # noqa: E731
        out["mgSound"][r["id"]] = {
            "demoJingle": s(r["demo_jingle_label"]), "instBgm": s(r["inst_bgm_label"]), "freePlayInstBgm": s(r["free_play_inst_bgm_label"]),
            "opJingle": s(r["op_jingle_label"]), "bgmPos": ENUM["BgmPos"][r["mg_bgm_play_position"]], "bgm": s(r["mg_bgm_label"]),
            "bgmNoIntro": s(r["mg_bgm_label_no_intro"]), "introSkipRegion": s(r["mg_bgm_intro_skip"]), "bgmOffset": r["mg_bgm_play_offset"],
            "bgmStopOffset": r["mg_bgm_stop_offset"], "bgmStopFade": r["mg_bgm_stop_fade"], "finishJingle": s(r["finish_jingle_label"]),
            "finishJingleOffset": r["finish_jingle_play_offset"], "resultPos": ENUM["ResultPos"][r["result_jingle_play_position"]],
            "resultOffset": r["result_jingle_play_offset"], "whistle": r["whistle_entry_type"], "splitSe": s(r["camera_split_se_label"]),
        }
    return out


def render_se(tmp):
    from sound_fsar import Fsar
    fs = Fsar(FSPJ)
    out = {}
    (DST / "sound").mkdir(parents=True, exist_ok=True)
    for label, ev in SE.items():
        wav = Path(tmp) / f"{label}.wav"
        r = subprocess.run([sys.executable, str(ROOT / "web/tools/analysis/sound_seq.py"), "render", str(FSPJ), label, str(wav)],
                           capture_output=True, text=True, encoding="utf-8")
        print(" ", label, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-200:])
        vol = fs.find(label)["volume"]
        f = cs.sound(label, wav, DST / "sound" / f"{label}.wav", DST) or f"sound/{label}.wav"
        out[label] = {"file": f, "bus": "se", "gain": round(vol / 127, 4), "evidence": ev + f", 볼륨 {vol} [데이터 fsar], 렌더 근사(sound_seq.py)"}
    return out


def voices():
    import mg1801_web_assets as ma
    out = {}
    for label in VOICES:
        v = ma.export_voice(label, DST / "sound")
        out[label] = {"file": v["file"], "bus": "voice", "gain": v["gain"], "target": v["target"],
                      "evidence": "[데이터] se_common_layout.ftrg·ComUiMGTelop::Start, 웨이브 사운드 PCM 그대로"}
    return out


def bgms(items, dst, base):
    out = {}
    (dst / "sound").mkdir(parents=True, exist_ok=True)
    from sound_fsar import Fsar
    fs = Fsar(FSPJ)
    for label, loop, ev in items:
        src = STREAM / f"{label}.dspadpcm.bfstm"
        info = sound_bfstm.info(src)
        sound_bfstm.decode(src, dst / "sound" / f"{label}.wav")
        rate = info["sampleRate"]
        vol = fs.find(label)["volume"]
        e = {"file": f"{base}{label}.wav", "gain": round(vol / 127, 4), "rate": rate, "frames": info["frames"]}
        if loop is None and info["loop"]:
            e["loopStart"] = info["loopStart"] / rate
            e["loopEnd"] = info["frames"] / rate
        elif isinstance(loop, str):
            r = next(x for x in info["regions"] if x["name"] == loop.split(":", 1)[1])
            e["loopStart"] = r["start"] / rate
            e["loopEnd"] = r["end"] / rate
        e["regions"] = {x["name"]: x["start"] / rate for x in info.get("regions", [])}
        e["evidence"] = f"{ev}, [데이터] fspj 볼륨 {vol}·BFSTM {label}"
        out[label] = e
        print(" ", label, {k: v for k, v in e.items() if k not in ("evidence", "regions")})
    return out


def main():
    tmp = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    tmp.mkdir(parents=True, exist_ok=True)
    if DST.exists():
        shutil.move(str(DST), str(tmp / f"old_mgscene_{os.getpid()}"))
    (DST / "tex").mkdir(parents=True)
    (DST / "font").mkdir(parents=True)
    files = ui_sarc.read_files(str(PARTS))
    layouts, anims, textures = convert_layouts(files)
    msg = mu.messages()
    texts = {k: msg[k] for k in LABELS}
    tag = re.compile(r"\[\d+:\d+(?::[0-9a-f]*)?\]")
    plain = tag.sub("", "".join(texts.values())) + "0123456789/.,:-+%"
    fonts = {}
    for fam in font_families(layouts):
        if fam == "bqfont_telop":
            continue
        if fam not in fw.families():
            print("  글꼴 없음(시스템 글꼴로 그림)", fam)
            continue
        fonts[fam] = fw.font_ref(fam, plain, "../font/")
        print(fam, len(fonts[fam]["chars"]), "chars")
    cpx = mu.fcpx_fonts()
    otf, tmeta = mu.telop_font(TELOP_TEXT, cpx["bqfont_telop"][1])
    tmeta["family"] = "mgscene_bqfont_telop"
    (DST / tmeta["file"]).write_bytes(otf)
    ui = {"source": "web/tools/analysis/mgscene_web_assets.py — 근거 web/docs/shell/minigame_scene.md §12", "locale": "koKR",
          "layouts": layouts, "anims": anims, "textures": textures, "fonts": fonts, "telopFont": tmeta, "texts": texts}
    (DST / "ui.json").write_text(json.dumps(ui, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("ui.json", (DST / "ui.json").stat().st_size, "B", len(layouts), "layouts", len(textures), "textures")
    (DST / "tables.json").write_text(json.dumps(tables(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    snd = {"source": "web/tools/analysis/mgscene_web_assets.py", "se": render_se(tmp), "voice": voices(), "bgm": bgms(BGM, DST, "")}
    (DST / "sound" / "sound.json").write_text(json.dumps(snd, ensure_ascii=False, indent=1), encoding="utf-8")
    if DUMMY.exists():
        shutil.move(str(DUMMY), str(tmp / f"old_mgdummy_{os.getpid()}"))
    DUMMY.mkdir(parents=True)
    dsnd = {"source": "web/tools/analysis/mgscene_web_assets.py (더미 게임 = mg0101 표 행의 BGM)", "bgm": bgms(DUMMY_BGM, DUMMY, "")}
    (DUMMY / "sound" / "sound.json").write_text(json.dumps(dsnd, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(p.stat().st_size for p in DST.rglob("*") if p.is_file())
    print("mgscene 전체", total, "B")


if __name__ == "__main__":
    main()
