"""셸 화면 원본 BGM → web/assets/common/sound/<라벨>.wav + bgm.json (docs/engine/04_sound.md §12.14).

BFSTM 을 vgmstream 으로 그대로 디코드(루프 무시 1회)하고, 반복은 BFSTM 헤더 표본/표본율(초). 볼륨 = fspj 볼륨/127.
항구 *_JMP 는 리전 판독을 하지 않고 REG_MAIN 구간을 반복 구간으로 쓴다(§12.14.4 사용자 확인 필요).
캐릭터 선택 명세(assets/charselect/spec.json)의 bgm.file 도 공용 파일을 가리키게 고친다. 원본·extracted 는 읽기만 한다.
사용(msgpack 있는 파이썬): python web/tools/analysis/shell_bgm_assets.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sound_bfstm  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
STREAM = ROOT / "extracted" / "romfs" / "stream"
WEB = ROOT / "web" / "assets"
DST = WEB / "common" / "sound"

# 라벨, 파일 라벨, fspj 볼륨, 반복(None = BFSTM 헤더, 'region:<이름>' = 그 리전 구간, False = 없음), 근거
BGMS = [
    ("SM_BGM_TITLE", "SM_BGM_TITLE", 40, None, "[판독] op ComUiTitle::In 재생 → menu00 SequenceFront 이어짐, ~SequenceFront StopBgmTitle(2)"),
    ("SM_BGM_MENU", "SM_BGM_MENU", 28, None, "[판독] menu00 SoundManager::PlayBgmMenu (2D 층)"),
    ("SM_BGM_MENU_MAP", "SM_BGM_MENU_MAP", 33, None, "[판독] menu01 SequenceManager::Initialize → SoundManager::PlayBgm"),
    ("SM_BGM_MATCHING", "SM_BGM_MATCHING", 35, None, "[판독] matching00 Scene::GameFlow"),
    ("SM_JIN_MGMET_OPENING", "SM_JIN_MGMET_OPENING", 46, False, "[판독] mgmet InitOp PlayBgm(0)"),
    ("SM_BGM_MGMET_ENTRANCE_JMP", "SM_BGM_MGMET_ENTRANCE_JMP", 29, "region:REG_MAIN", "[판독] mgmet StartEventFlow PlayBgm(1); 반복 = 리전 REG_MAIN [추정]"),
    ("SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP", "SM_BGM_MGMET_ENTRANCE_JMP", 29, "region:REG_MAIN", "[판독] mgmet ModeSelectCameraIdle PlayBgm(2) (IsPlayBgm 거짓일 때); 같은 파일, 인트로 건너뛰기는 미구현"),
    ("SM_BGM_MGM01_FREEPLAY", "SM_BGM_MGM01_FREEPLAY", 53, None, "[판독] mgm01 StartFlow·ContinueFlow PlayBgm(4)"),
    ("SM_JIN_MGM01_FREEPLAY_ENDSTINGER", "SM_JIN_MGM01_FREEPLAY_ENDSTINGER", 36, False, "[판독] mgm01 MgStartFlow PlayBgm(5)"),
]


def main():
    DST.mkdir(parents=True, exist_ok=True)
    out = {}
    done = set()
    for label, fl, vol, loop, ev in BGMS:
        src = STREAM / f"{fl}.dspadpcm.bfstm"
        info = sound_bfstm.info(src)
        wav = DST / f"{fl}.wav"
        if fl not in done:
            sound_bfstm.decode(src, wav)
            done.add(fl)
        rate = info["sampleRate"]
        e = {"file": f"{fl}.wav", "gain": round(vol / 127, 4), "rate": rate, "frames": info["frames"]}
        if loop is None and info["loop"]:
            e["loopStart"] = info["loopStart"] / rate
            e["loopEnd"] = info["frames"] / rate
        elif isinstance(loop, str):
            r = next(x for x in info["regions"] if x["name"] == loop.split(":", 1)[1])
            e["loopStart"] = r["start"] / rate
            e["loopEnd"] = r["end"] / rate
        e["evidence"] = f"{ev}, [데이터] fspj 볼륨 {vol}·BFSTM {fl}"
        out[label] = e
        print(label, wav.stat().st_size, "B", {k: v for k, v in e.items() if k != "evidence"})
    spec = {"version": 1, "source": "Super Mario Party Jamboree US v0 — web/tools/analysis/shell_bgm_assets.py, 명세 docs/engine/04_sound.md §12.14", "bgm": out}
    (DST / "bgm.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    cs = WEB / "charselect" / "spec.json"
    j = json.loads(cs.read_text(encoding="utf-8"))
    if j.get("bgm", {}).get("label") == "SM_BGM_MENU_MAP":
        j["bgm"]["file"] = "../common/sound/SM_BGM_MENU_MAP.wav"
        cs.write_text(json.dumps(j, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("charselect spec bgm.file →", j["bgm"]["file"])


if __name__ == "__main__":
    main()
