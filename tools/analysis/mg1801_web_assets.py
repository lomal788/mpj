"""mg1801 웹 에셋(소리) 만들기 — 원본 사운드 아카이브(FSAR·BFSTM) → web/assets/mg1801/sound + manifest.json.

  c:/dev/mpj/.venv/Scripts/python tools/mg1801_web_assets.py [--bpm 120 180] [--seq-only]
  --seq-only: BGM·스트림은 그대로 두고(이미 만든 manifest 의 항목 유지) 효과음 시퀀스만 다시 만든다

manifest.json (web/script/app/minigame/mg1801/view/sound.ts 가 읽는다):
  sounds      라벨 → 재생 방식
    kind 'bgm'    시퀀스 BGM 을 BPM(G11)별로 미리 렌더한 wav(tools/sound_seq.py 근사 재구현). 사운드 volume 이 이미 곱해져 있다.
                  bpm → {file, durationSec, peak, loop, songEndSec, g8}. g8 = 그 렌더에서 전역 8(코드)을 쓴 [초, 값] (JUST_SOUND 가 읽는다)
    kind 'stream' BFSTM 디코드 wav. gain = 사운드 volume/127 × 스트림 트랙 volume/127 [판독: 스트림 트랙 볼륨 선형 FUN_71005e5f90]
                  시스템 보이스(웨이브 사운드 WD_VOI_LOC_*)도 이 형식(bus 'voice', 원본 PCM16 그대로, gain = 사운드 volume/127). 키 = 코드가 내는 라벨,
                  target = 로캘 접미를 붙인 실제 라벨(VOICE_LOCALE)
    kind 'seq'    효과음 시퀀스를 웹에서 실시간으로 돌린다(web/script/view/seq.ts). FSEQ 명령 바이트·뱅크 영역·파형을 그대로 싣는다.
                  리듬 마스터(SQ_BGM_RC_MAIN_RHYTHM)·OP(SQ_BGM_RC_MGCMN_OP)도 이 방식(bus 'bgm')이다 — 전역 변수(G10·G12·G13·G14)로
                  게임 BGM 과 맞물리고 킥이 G13(곡 ID)에 따라 쉬므로 미리 렌더할 수 없다(docs/engine/04_sound.md 5.3).
  substitute  세팅 프리셋 U 레코드(라벨 치환). mg1801(장면 적재 완료 때) + mg1800_cmn(단계 5) + mg1801_result(OnGameEnding) 합집합
  listener3d  3D 리스너·관리자 값 [판독] (04_sound.md 6.7, sound.ts 머리 주석)
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import struct
import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from sound_extract_mg1801 import ARC, bgm_globals, loop_structure, song_id, trim_tail  # noqa: E402
from sound_fsar import Fsar  # noqa: E402
from sound_seq import OUT_RATE, SeqRenderer, SoundSet, disasm, parse_fseq, write_wav  # noqa: E402
import sound_bfstm  # noqa: E402
import sound_preset  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
EX = ROOT / "extracted"
DST = ROOT / "web" / "assets" / "mg1801"

# (라벨, 아카이브). 로직이 내는 BGM 라벨 전부(FUN_7100441990·FUN_71004421a0·FUN_71004429c0 이름 규칙).
# FSEQ·offset·volume·뱅크가 같은 라벨(B = A 등)은 같은 파일을 쓴다 [데이터]
BGM = [
    ("SQ_BGM_MG1801_A", "subarc_mg1801"),
    ("SQ_BGM_MG1801_B", "subarc_mg1801"),
    ("SQ_BGM_MG1801_C", "subarc_mg1801"),
    ("SQ_BGM_MG1801_MG_ENDING", "subarc_mg1801"),
    ("SQ_BGM_MG1801_A_MG_ENDING", "subarc_mg1801"),
    ("SQ_BGM_MG1801_B_MG_ENDING", "subarc_mg1801"),
    ("SQ_BGM_MG1801_C_MG_ENDING", "subarc_mg1801"),
    ("SQ_BGM_MG1801_A_INTER_END", "subarc_mg1801"),
    ("SQ_BGM_MG1801_B_INTER_END", "subarc_mg1801"),
    ("SQ_BGM_MG1801_C_INTER_END", "subarc_mg1801"),
    ("SQ_BGM_RC_GENERIC", "subarc_rc_cmn"),
    ("SQ_BGM_RC_REMIX", "subarc_rc_cmn"),
    ("SQ_BGM_RC_CALIBRATION", "subarc_rc_cmn"),
]
# (라벨, 아카이브, 이 라벨을 다른 라벨로 바꾸는 프리셋)
STREAMS = [
    ("SM_AMB_MG1801_MG_RESULT", "subarc_mg1801", None),
    ("SM_JIN_MG1801_MG_RESULT_GOOD", "subarc_mg1801", "mg1801_result"),
    ("SM_JIN_MG1801_MG_RESULT_BAD", "subarc_mg1801", "mg1801_result"),
]
SEQ = [
    ("SQ_SE_MG1801_JUST", "subarc_mg1801"),
    ("SQ_SE_MG1801_SUCCESS", "subarc_mg1801"),
    ("SQ_SE_MG1801_SWING", "subarc_mg1801"),
    ("SQ_SE_MG1801_FOOD_FALL_WAT_EXSML", "subarc_mg1801"),
    ("SQ_SE_MG1801_FOOD_FALL_WAT_SML", "subarc_mg1801"),
    ("SQ_SE_MG1801_FOOD_FALL_WAT_MDL", "subarc_mg1801"),
    ("SQ_SE_MG1801_FOOD_FALL_WAT_LRG", "subarc_mg1801"),
    ("SQ_SE_MG1801_FOOD_FALL_WAT_EXLRG", "subarc_mg1801"),
    ("SQ_SE_MG1801_JUST_SOUND", "subarc_mg1801"),
    ("SQ_SE_MG1800_COUNT_STICK", "subarc_rc_cmn"),
    ("SQ_SE_RC_CHEER_MG_FIN", "subarc_rc_cmn"),
    ("SQ_SE_RC_CHEER_MG", "subarc_rc_cmn"),
    # UI 가 내는 소리(ui 담당 판독): PERFECT 텔롭, FINISH 텔롭, 결과 화면 숫자 세기
    ("SQ_SE_MG1800_PERFECT", "subarc_rc_cmn"),
    ("SQ_SE_MG_FINISH", "main"),
    # START/FINISH 텔롭 레이아웃 FX 트리거(common/ftrg/se_common_layout.ftrg, "in" 프레임 0)의 SE. START 는 volume 0(PLY_SE_DUMMY) [데이터]
    ("SQ_SE_TLP_START", "main"),
    ("SQ_SE_TLP_FINISH", "main"),
    ("SQ_SE_MG1800_MGRES_CNT", "main"),
    ("SQ_SE_MG1800_STR_CNT", "main"),
    ("SQ_SE_MG1800_STR_CNT_STP", "main"),
]
# OnGameStartAfter 가 같은 프레임에 재생하는 리듬 마스터·오프닝 [판독 main FUN_71004263c8] — 실시간 시퀀스(bus 'bgm')
SEQ_BGM = [
    ("SQ_BGM_RC_MAIN_RHYTHM", "subarc_rc_cmn"),
    ("SQ_BGM_RC_MGCMN_OP", "subarc_rc_cmn"),
]
PRESETS = ("mg1801", "mg1800_cmn", "mg1801_result")
# 시스템 보이스(웨이브 사운드). 텔롭 FX 트리거가 내는 라벨(WD_VOI_LOC_*)에 엔진이 로캘 접미를 붙인다:
# FUN_71000e9be4 가 라벨에 "_LOC_" 가 있으면 "%s_%s"(라벨, 접미). 접미 = 프리셋 global 'a' 레코드(로캘, 아카이브, 접미)에서
# 현재 로캘의 것(FUN_71000f4d50 → FUN_71000ec254 저장, FUN_71000ec460 조회) [판독]. 한국어판 koKR → subarc_sysvoi_jajp·JAJP [데이터]
VOICE_LOCALE = "koKR"
VOICES = ["WD_VOI_LOC_SYS_START", "WD_VOI_LOC_SYS_FINISH"]


def player_of(fs, s):
    pl = fs.players[int(s["player"].split(":")[1])] if s.get("player") else None
    return pl and {"name": pl["name"], "max": pl["playableSoundMax"]}


def sound3d_of(s):
    d = s.get("sound3d")
    if not d:
        return None
    return {"flags": int(d["flags"], 16), "decayRatio": d["decayRatio"], "decayCurve": d["decayCurve"], "dopplerFactor": d["dopplerFactor"]}


def render_bgm(fs, s, bpm, out_wav):
    """sound_extract_mg1801.main 의 BGM 절과 같은 규칙(LoopStart 구간에 노트가 있으면 둘째 반복을 루프로)."""
    dry, first_ls, jump_tick = loop_structure(fs, s, bpm)
    spt = 60.0 / (bpm * dry.timebase)
    ls = max(first_ls.values()) if first_ls else None
    jt = max(jump_tick.values()) if jump_tick else None
    secs = ((ls + 2 * (jt - ls)) * spt + 0.5) if (ls is not None and jt is not None) else 240.0
    r = SeqRenderer(SoundSet(fs), s, global_vars=bgm_globals(fs, s, bpm), random_mode="mid")
    audio = r.render(min(secs, 400.0))
    notes = [e for e in r.events if "note" in e and e["track"] != 0]
    loop = None
    if ls is not None and jt is not None and any(ls <= e["tick"] < jt for e in notes):
        period = jt - ls
        loop = {"startSec": round((ls + period) * spt, 6), "endSec": round((ls + 2 * period) * spt, 6)}
        audio = audio[: int(round(loop["endSec"] * OUT_RATE))]
    else:
        audio = trim_tail(audio)
    write_wav(out_wav, audio)
    g8 = [[round(e["t"], 6), e["value"]] for e in r.events if e.get("global") == 8]
    return {
        "durationSec": round(len(audio) / OUT_RATE, 4),
        "peak": round(float(np.abs(audio).max()) if len(audio) else 0.0, 4),
        "loop": loop,
        "songEndSec": None if loop else (round(ls * spt, 6) if ls is not None else None),
        "g8": g8,
        "songId": song_id(fs, s),
    }


def used_prgs(fseq, start):
    """도달 가능한 코드의 prg·bank_select 즉값. 변수·무작위 인자가 있으면 None(전부)."""
    prgs, banks, any_prg, any_bank = set(), set(), False, False
    for c in disasm(fseq["data"], start):
        if c["name"] == "prg":
            if isinstance(c["value"], int):
                prgs.add(c["value"])
            else:
                any_prg = True
        elif c["name"] == "bank_select":
            if isinstance(c["value"], int):
                banks.add(c["value"])
            else:
                any_bank = True
    return (None if any_prg else prgs), (None if any_bank else banks | {0})


def export_seq(fs, arc, s, out_dir, wave_files):
    """웹 실시간 시퀀서용 자료: FSEQ DATA 블록, 시작 offset, 뱅크(쓰는 prg 의 키·벨로시티 영역), 파형 wav."""
    fseq = parse_fseq(fs.file_bytes(s["fileId"]))
    start = s["sequence"]["startOffset"]
    prgs, bank_sel = used_prgs(fseq, start)
    sset = SoundSet(fs)
    waves, wave_index = [], {}
    banks = []
    for bi, bref in enumerate(s["sequence"]["banks"]):
        if bank_sel is not None and bi not in bank_sel:
            banks.append(None)
            continue
        bk = sset.bank(int(bref.split(":")[1]))
        insts = []
        for pi, inst in enumerate(bk["instruments"]):
            if inst is None or (prgs is not None and pi not in prgs):
                insts.append(None)
                continue
            keys = []
            for kmax, vels in inst:
                vv = []
                for vmax, r in vels:
                    war_item, widx = bk["waveIds"][r["waveIdIndex"]]
                    key = (arc, war_item, widx)
                    if key not in wave_index:
                        w = sset.wave(war_item, widx)
                        name = f"{arc}_war{war_item & 0xFFFFFF}_{widx:03d}.wav"
                        if name not in wave_files:
                            arr = np.stack(w["channels"], axis=1).astype(np.float32) / 32768.0
                            write_wav(out_dir / name, arr, rate=w["sampleRate"])
                            wave_files.add(name)
                        wave_index[key] = len(waves)
                        waves.append({"file": f"sound/wave/{name}", "rate": w["sampleRate"], "frames": w["frames"],
                                      "loop": w["loop"], "loopStart": w["loopStart"], "channels": len(w["channels"])})
                    vv.append({"velMax": vmax, "wave": wave_index[key], "originalKey": r["originalKey"], "volume": r["volume"],
                               "pan": r["pan"], "pitch": r["pitch"], "adshr": r["adshr"]})
                keys.append({"keyMax": kmax, "vels": vv})
            insts.append(keys)
        banks.append({"instruments": insts})
    return {"volume": s["volume"], "data": base64.b64encode(bytes(fseq["data"])).decode("ascii"), "start": start,
            "banks": banks, "waves": waves}


def substitutions():
    out = {}
    for name in PRESETS:
        for blk in sound_preset.preset(name)["blocks"]:
            for rec in blk["records"]:
                if rec["type"] == "U":
                    out[rec["src"]] = {"to": rec["dst"][0], "preset": name}
    return out


def listener_records(name):
    """프리셋 P 레코드 = 3D 리스너 [판독 FUN_71000f3f70 case 0x50 → FUN_71000e16dc → FUN_71000e429c].
    rec[2] 리스너 번호, rec[3..5] 카메라 기준 오프셋, rec[6] interiorSize, rec[7] maxVolumeDistance, rec[8] unitDistance,
    rec[9] unitBiquadFilterValue, rec[10] maxBiquadFilterValue"""
    out = []
    for blk in sound_preset.preset(name)["blocks"]:
        for rec in blk["records"]:
            if rec["type"] != "P":
                continue
            raw = rec["raw"]
            f = rec["f32"]
            # raw 는 rec[0..11], f32 는 rec[1..11] 을 f32 로 읽은 것 (sound_preset.py)
            out.append({"index": raw[2], "offset": f[2:5], "interiorSize": f[5], "maxVolumeDistance": f[6], "unitDistance": f[7],
                        "unitBiquadFilterValue": f[8], "maxBiquadFilterValue": f[9]})
    return out


def voice_locales():
    """프리셋 global 의 'a'(0x61) 레코드: rec[2] 로캘, rec[3] 보이스 아카이브, rec[4] 라벨 접미 (문자열 표 offset) [판독 FUN_71000f4d50]"""
    b, base, presets, _, _ = sound_preset.load()
    e = next(x for x in presets if x["name"] == "global")
    p, end = base + e["offset"], base + e["offset"] + e["size"]
    out = {}
    while p < end and b[p:p + 4] == b"BSSP":
        nrec, _nstr = struct.unpack_from("<II", b, p + 4)
        strbase = p + 12 + 48 * nrec

        def s(o):
            return b[strbase + o:b.index(b"\0", strbase + o)].decode("ascii")

        for i in range(nrec):
            r = struct.unpack_from("<12I", b, p + 12 + 48 * i)
            if r[0] == 0x61:
                out[s(r[2])] = {"archive": s(r[3]), "suffix": s(r[4])}
        p = sound_preset.parse_block(b, p)["end"]
        while p < end and b[p:p + 4] != b"BSSP":
            p += 1
    return out


def fwsd_note(fws, index):
    """FWSD(웨이브 사운드 파일) 의 index 번째 웨이브 사운드 → (웨이브 아카이브 item, 파형 번호, 사운드 정보 값).
    INFO: ref 파형 ID 표(0x0100: {u32 war item, u32 index}), ref 웨이브 사운드 표(0x0101 → 0x4900).
    0x4900 = ref 정보(0x4901: u32 플래그 + 켜진 비트마다 u32 값, 비트1 = 피치 f32), ref 트랙 표, ref 노트 표(0x4902: u32 파형 ID 표 번호, u32 플래그)
    [데이터: subarc_sysvoi_* 표본 구조. 노트 플래그 0(기본 값)만 받는다]"""
    assert fws[:4] == b"FWSD"
    info = struct.unpack_from("<I", fws, 0x18)[0] + 8
    t1, o1, t2, o2 = struct.unpack_from("<HxxiHxxi", fws, info)
    assert (t1, t2) == (0x0100, 0x0101)
    wid = info + o1
    wst = info + o2
    t, o = struct.unpack_from("<Hxxi", fws, wst + 4 + 8 * index)
    assert t == 0x4900
    ws = wst + o
    ti, oi, tt, ot, tn, on = struct.unpack_from("<HxxiHxxiHxxi", fws, ws)
    assert (ti, tt, tn) == (0x4901, 0x0101, 0x0101)
    flags = struct.unpack_from("<I", fws, ws + oi)[0]
    vals = {}
    q = ws + oi + 4
    for bit in range(32):
        if flags >> bit & 1:
            vals[bit] = fws[q:q + 4]
            q += 4
    pitch = struct.unpack("<f", vals[1])[0] if 1 in vals else 1.0
    nl = ws + on
    assert struct.unpack_from("<I", fws, nl)[0] == 1
    t, o = struct.unpack_from("<Hxxi", fws, nl + 4)
    assert t == 0x4902
    widx, nflags = struct.unpack_from("<II", fws, nl + o)
    assert nflags == 0, hex(nflags)
    war_item, wave_index = struct.unpack_from("<II", fws, wid + 4 + 8 * widx)
    return war_item, wave_index, {"pitch": pitch, "infoFlags": hex(flags)}


def export_voice(label, out_dir):
    """웨이브 사운드 → 원본 PCM16 그대로 wav. manifest 는 'stream' 형식(파일 + gain)으로 싣는다(sound.ts 가 그대로 재생).
    gain = 사운드 volume/127 (노트 volume 기본 127, 트리거 SoundVolume 1.0) — 선형 [추정: 시퀀스·스트림과 같은 BasicSound 볼륨 체인]"""
    loc = voice_locales()[VOICE_LOCALE]
    arc = loc["archive"]
    fs = Fsar(EX / f"bea/sound~{arc}.nx.bea/audio/sounddata/{arc}/{arc}.fsst")
    target = f"{label}_{loc['suffix']}"
    s = fs.find(target)
    assert s["type"] == "wave", s["type"]
    war_item, wave_index, winfo = fwsd_note(fs.file_bytes(s["fileId"]), s["wave"]["index"])
    assert winfo["pitch"] == 1.0, winfo
    w = SoundSet(fs).wave(war_item, wave_index)
    pcm = np.stack(w["channels"], axis=1).astype("<i2")
    name = f"{target}.wav"
    (out_dir / "voice").mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_dir / "voice" / name), "wb") as wf:
        wf.setnchannels(pcm.shape[1])
        wf.setsampwidth(2)
        wf.setframerate(w["sampleRate"])
        wf.writeframes(pcm.tobytes())
    return {
        "kind": "stream", "bus": "voice", "file": f"sound/voice/{name}", "target": target, "archive": arc, "locale": VOICE_LOCALE,
        "volume": s["volume"], "gain": round(s["volume"] / 127.0, 6), "durationSec": round(w["frames"] / w["sampleRate"], 6),
        "sampleRate": w["sampleRate"], "peak": round(float(np.abs(pcm).max()) / 32768.0, 4), "player": player_of(fs, s),
        "playerPriority": s.get("playerPriority", 64), "loop": None,
    }


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--bpm", type=int, nargs="+", default=[120, 180], help="BGM 을 렌더할 BPM(G11). mg1801 기본 120, 롱 모드 후반 180")
    ap.add_argument("--seq-only", action="store_true")
    a = ap.parse_args(argv)
    fsars = {k: Fsar(v) for k, v in ARC.items()}
    out_sound = DST / "sound"
    old_glob = "wave/*.wav" if a.seq_only else "**/*.wav"
    for old in out_sound.glob(old_glob):
        old.unlink()
    for d in sorted(out_sound.rglob("*"), reverse=True):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    for sub in ("bgm", "stream", "wave", "voice"):
        (out_sound / sub).mkdir(parents=True, exist_ok=True)
    sounds = {}
    if a.seq_only:
        prev = json.loads((DST / "manifest.json").read_text(encoding="utf-8"))
        sounds = {k: v for k, v in prev["sounds"].items() if v["kind"] != "seq"}
        a.bpm = prev["bpms"]

    # ---- BGM (BPM 별 렌더)
    rendered = {}
    for label, arc in ([] if a.seq_only else BGM):
        fs = fsars[arc]
        s = fs.find(label)
        same = (arc, s["fileId"], s["sequence"]["startOffset"], s["volume"], tuple(s["sequence"]["banks"]))
        ent = {"kind": "bgm", "bus": "bgm", "archive": arc, "volume": s["volume"], "player": player_of(fs, s), "bpm": {}}
        for bpm in a.bpm:
            if (same, bpm) in rendered:
                ent["bpm"][str(bpm)] = dict(rendered[(same, bpm)])
                continue
            name = f"{label}_{bpm}.wav"
            info = render_bgm(fs, s, bpm, out_sound / "bgm" / name)
            info["file"] = f"sound/bgm/{name}"
            rendered[(same, bpm)] = info
            ent["bpm"][str(bpm)] = info
            print(f"bgm {label} bpm {bpm}: {info['durationSec']} s peak {info['peak']} loop {info['loop']} g8 {len(info['g8'])}")
        sounds[label] = ent

    # ---- 스트림
    subst = substitutions()
    for label, arc, preset in ([] if a.seq_only else STREAMS):
        fs = fsars[arc]
        target, tfs = label, fs
        if preset and label in subst:
            target, tfs = subst[label]["to"], fsars["main"]
        ts = tfs.find(target)
        ext = tfs.files[ts["fileId"]]["external"]
        src = EX / "romfs" / ext
        inf = sound_bfstm.info(src)
        name = f"{target}.wav"
        sound_bfstm.decode(src, out_sound / "stream" / name)
        tracks = ts["stream"].get("tracks") or [{"volume": 127}]
        tv = tracks[0]["volume"] / 127.0
        sounds[label] = {
            "kind": "stream", "bus": "bgm", "file": f"sound/stream/{name}", "target": target, "volume": ts["volume"],
            "gain": round(ts["volume"] / 127.0 * tv, 6), "durationSec": round(inf["seconds"], 6), "player": player_of(tfs, ts),
            "loop": ({"startSec": inf["loopStartSec"], "endSec": inf["loopEndSec"]} if inf["loop"] else None),
        }
        print(f"stream {label} → {target}: gain {sounds[label]['gain']} {inf['seconds']:.3f} s")

    # ---- 시스템 보이스(START/FINISH 텔롭 FX 트리거)
    for label in VOICES:
        sounds[label] = export_voice(label, out_sound)
        v = sounds[label]
        print(f"voice {label} → {v['target']}: gain {v['gain']} {v['durationSec']} s peak {v['peak']}")

    # ---- 실시간 시퀀스 효과음
    wave_files = set()
    for label, arc, bus in [(lb, ar, "se") for lb, ar in SEQ] + [(lb, ar, "bgm") for lb, ar in SEQ_BGM]:
        fs = fsars[arc]
        s = fs.find(label)
        seq = export_seq(fs, arc, s, out_sound / "wave", wave_files)
        sounds[label] = {"kind": "seq", "bus": bus, "archive": arc, "player": player_of(fs, s),
                         "playerPriority": s.get("playerPriority", 64), "sound3d": sound3d_of(s), "seq": seq}
        print(f"seq {label}: data {len(seq['data'])} B64, waves {len(seq['waves'])}")

    listeners = listener_records("mg1801")
    manifest = {
        "game": "mg1801",
        "source": "tools/mg1801_web_assets.py: FSAR 시퀀스 BGM 자체 렌더(tools/sound_seq.py, 근사)·BFSTM 디코드(vgmstream)·효과음 시퀀스 원본 명령 그대로",
        "bpms": a.bpm,
        "sounds": sounds,
        "substitute": subst,
        "listener3d": {
            "note": "[판독] bex 기본 리스너(FUN_71000e3e30) + 프리셋 mg1801 P 레코드(장면 적재 완료 때 적용, FUN_71000bdca4). 관리자 FUN_71005b92b0",
            "default": {"interiorSize": 10.0, "maxVolumeDistance": 20.0, "unitDistance": 50.0, "unitBiquadFilterValue": 0.5, "maxBiquadFilterValue": 1.0},
            "preset": listeners,
            "manager": {"maxPriorityReduction": 32, "panRange": 0.9, "sonicVelocity": 0.0},
        },
    }
    (DST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(p.stat().st_size for p in out_sound.rglob("*.wav"))
    print(f"sounds {len(sounds)}, wav {total / 1e6:.1f} MB → {DST}")


if __name__ == "__main__":
    main(sys.argv[1:])
