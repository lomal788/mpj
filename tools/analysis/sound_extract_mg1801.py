"""mg1801(싹둑싹둑 수프)이 쓰는 소리를 찾아 디코드·렌더하고 매니페스트를 만든다.

사용:
  python tools/sound_extract_mg1801.py [--bpm 120] [--out extracted/audio/mg1801]

산출:
  <out>/manifest.json            라벨 → 파일·루프·근거·재생 속성
  <out>/stream/*.wav             BFSTM 디코드(vgmstream, 루프 무시 1회)
  <out>/seq/*.wav                시퀀스 렌더(근사 재현, tools/sound_seq.py)
  <out>/wave/*.wav               SE 가 쓰는 원본 파형(FWAV 디코드, 원래 샘플레이트)
  <out>/events/*.json            시퀀스 이벤트(노트·전역 변수·템포) — 박자·코드 진행 확인용
  <out>/just_sound_table.json    SQ_SE_MG1801_JUST_SOUND 의 코드(G8)×단계(L1) → 노트 표

근거 수준은 매니페스트 각 항목 evidence 에 적는다. 렌더 결과는 원본 출력과 대조하지 않은 근사다.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from sound_fsar import Fsar, item_str  # noqa: E402
from sound_seq import (OUT_RATE, SeqRenderer, SoundSet, disasm, parse_fseq, write_wav)  # noqa: E402
import sound_bfstm  # noqa: E402
import sound_preset  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
EX = ROOT / 'extracted'
ARC = {
    'subarc_mg1801': EX / 'bea/sound~subarc_mg1801.nx.bea/audio/sounddata/subarc_mg1801/subarc_mg1801.fsst',
    'subarc_rc_cmn': EX / 'bea/sound~subarc_rc_cmn.nx.bea/audio/sounddata/subarc_rc_cmn/subarc_rc_cmn.fsst',
    'main': EX / 'bea/_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj',
}

# (라벨, 아카이브, 코드 근거)
SEQ_SE = [
    ('SQ_SE_MG1801_JUST', 'subarc_mg1801', '[판독] mg1801 Obj::RecieveHit @0x710000849c Play3D (JUST 판정)'),
    ('SQ_SE_MG1801_SUCCESS', 'subarc_mg1801', '[판독] mg1801 Obj::RecieveHit @0x710000849c Play3D (JUST 아님)'),
    ('SQ_SE_MG1801_FOOD_FALL_WAT_EXSML', 'subarc_mg1801', '[판독] mg1801 Obj::EntrySe se_S_label'),
    ('SQ_SE_MG1801_FOOD_FALL_WAT_SML', 'subarc_mg1801', '[판독] mg1801 Obj::EntrySe se_L/S_label'),
    ('SQ_SE_MG1801_FOOD_FALL_WAT_MDL', 'subarc_mg1801', '[판독] mg1801 Obj::EntrySe se_L/S_label'),
    ('SQ_SE_MG1801_FOOD_FALL_WAT_LRG', 'subarc_mg1801', '[판독] mg1801 Obj::EntrySe se_L/S_label'),
    ('SQ_SE_MG1801_FOOD_FALL_WAT_EXLRG', 'subarc_mg1801', '[판독] mg1801 Obj::EntrySe se_L_label'),
    ('SQ_SE_MG1801_SWING', 'subarc_mg1801', '[데이터, ui 담당] 모션 rhy_knife_swing00 2프레임 FX 트리거 RC_RHY_KNIFE_SWING00 → SQ_SE_MG1801_SWING (bq.nx.bea chara/pc/ftrgBase/ftrg/rc_pc_base.ftrg)'),
    ('SQ_SE_MG1800_COUNT_STICK', 'subarc_rc_cmn', '[판독] main RmMgSceneBase::OnGameMain 단계 3 (mg1801.md 3.3)'),
]
SEQ_BGM = [
    ('SQ_BGM_MG1801_A', 'subarc_mg1801', '[판독] mg1801 Scene::RmSyncedSetupGame SetGameBgmName (isGenericBgm=0)'),
    ('SQ_BGM_RC_GENERIC', 'subarc_rc_cmn', '[판독] mg1801 Scene::RmSyncedSetupGame SetGameBgmName (isGenericBgm=1)'),
    ('SQ_BGM_MG1801_MG_ENDING', 'subarc_mg1801', '[판독] mg1801 Scene::RmSyncedSetupGame SetGameBgmFinName'),
    ('SQ_BGM_RC_CALIBRATION', 'subarc_rc_cmn', '[미확정] mg1801 에서 쓰는 지점 미확인(리듬 공용)'),
]
STREAMS = [
    ('SM_AMB_MG1801_MG_RESULT', 'subarc_mg1801', None,
     '[판독] main RmMgSceneBase::OnGameEnding @0x7100445620: 단계 0·1 에서 0.1 초 뒤, 달성률/20 >= 0.1 이면 '
     'Play2D("SM_AMB_" + MGList 이름 대문자 + "_MG_RESULT")'),
    ('SM_JIN_MG1801_MG_RESULT_GOOD', 'subarc_mg1801', 'mg1801_result',
     '[판독] main FUN_7100447a90: RmGameWork+0x2C == 0 이면 GetStarAchieveJudge() > 1 → "SM_JIN_%s_MG_RESULT_GOOD" 아니면 _BAD 를 Play '
     '+ [데이터] 프리셋 mg1801_result 치환'),
    ('SM_JIN_MG1801_MG_RESULT_BAD', 'subarc_mg1801', 'mg1801_result', '같음(GetStarAchieveJudge() <= 1)'),
    ('SM_BGM_MG1801_DH', 'main', None,
     '[데이터] bq common/data/musicBgmList.json keyId 200(음악 감상). 게임 중 BGM 아님'),
]
JUST_SOUND = ('SQ_SE_MG1801_JUST_SOUND', 'subarc_mg1801',
              '[판독] mg1801 PlayExcellentSe(-1,true) @0x710000cfc8 → main RmSoundMan::PlayExcellentSe Play("SQ_SE_RC_JUST") '
              '+ [데이터] 프리셋 mg1801 치환 SQ_SE_RC_JUST→SQ_SE_MG1801_JUST_SOUND')


def rel(p, out):
    return str(Path(p).relative_to(out)).replace('\\', '/')


def sound_meta(fs: Fsar, s: dict):
    pl = fs.players[int(s['player'].split(':')[1])] if s.get('player') else None
    m = {'type': s['type'], 'archiveVolume': s['volume'], 'archiveVolumeLinear': round(s['volume'] / 127.0, 4),
         'player': pl and {'name': pl['name'], 'playableSoundMax': pl['playableSoundMax']},
         'playerPriority': s.get('playerPriority'), 'panMode': s.get('panMode'), 'panCurve': s.get('panCurve'),
         'userParam': s.get('userParam')}
    if 'sound3d' in s:
        d = s['sound3d']
        m['sound3d'] = {k: d[k] for k in ('flags', 'volume', 'priority', 'pan', 'span', 'filter',
                                          'decayRatio', 'decayCurve', 'dopplerFactor')}
    if s['type'] == 'sequence':
        m['sequence'] = {'fileId': s['fileId'], 'startOffset': s['sequence']['startOffset'],
                         'banks': [fs.banks[int(b.split(':')[1])]['name'] for b in s['sequence']['banks']],
                         'allocTrackFlags': s['sequence']['allocTrackFlags'],
                         'channelPriority': s['sequence'].get('channelPriority')}
    return m


def song_id(fs, s):
    """BGM 시퀀스가 G13 에 쓰는 곡 ID(Track_0 의 setvar G13 상수)."""
    fseq = parse_fseq(fs.file_bytes(s['fileId']))
    for c in disasm(fseq['data'], s['sequence']['startOffset']):
        if c['name'] == 'setvar' and c.get('var') == 29 and isinstance(c['value'], int):
            return c['value']
    return None


def bgm_globals(fs, s, g11):
    """단독 렌더용 전역 변수: G11=BPM, G12=곡 ID(리듬 count 트랙의 핸드셰이크가 끝난 상태로 가정)."""
    gv = [-1] * 16
    gv[11] = g11
    sid = song_id(fs, s)
    if sid is not None:
        gv[12] = sid
    return gv


def loop_structure(fs, s, g11):
    """음악 트랙의 LoopStart 레이블 틱과 루프 길이(틱)를 건조 실행으로 구한다."""
    fseq = parse_fseq(fs.file_bytes(s['fileId']))
    ls_pcs = {v for k, v in fseq['labels'].items() if re.search(r'_Track_\d+_LoopStart$', k)}
    r = SeqRenderer(SoundSet(fs), s, global_vars=bgm_globals(fs, s, g11))
    r.note_on = lambda *a, **k: None  # 소리 없이 진행만
    tick = 0
    first_ls = {}
    jump_tick = {}
    while tick < 200000:
        r.do_tick()
        tick = r.tick
        for (trk, pc), t in r.pc_tick.items():
            if pc in ls_pcs and trk not in first_ls:
                first_ls[trk] = t
        for trk, (jt, tgt) in r.loops.items():
            if tgt in ls_pcs:
                jump_tick.setdefault(trk, jt)
        music = [t for t in r.tracks if t != 0]
        if music and all((not r.tracks[t].open) or t in jump_tick for t in music):
            break
    return r, first_ls, jump_tick


def render_seq(fs, s, out_wav, g11, seconds, random_mode='mid', local_vars=None, extra_globals=None):
    gv = bgm_globals(fs, s, g11) if s['name'].startswith('SQ_BGM') else [-1] * 16
    gv[11] = g11
    for k, v in (extra_globals or {}).items():
        gv[k] = v
    r = SeqRenderer(SoundSet(fs), s, global_vars=gv, random_mode=random_mode, local_vars=local_vars)
    audio = r.render(seconds)
    return r, audio


def trim_tail(audio, thresh=1e-4):
    if len(audio) == 0:
        return audio
    amp = np.abs(audio).max(axis=1)
    idx = np.nonzero(amp > thresh)[0]
    end = (idx[-1] + 1 + int(0.05 * OUT_RATE)) if len(idx) else 0
    return audio[:min(len(audio), end)]


def export_waves(fs, events, out, used):
    sset = SoundSet(fs)
    for e in events:
        if 'wave' not in e:
            continue
        war, idx = e['wave']
        key = f'{war}:{idx}'
        if key in used:
            continue
        wi = int(war.split(':')[1])
        w = sset.wave((5 << 24) | wi, idx)
        arr = np.stack(w['channels'], axis=1).astype(np.float32) / 32768.0
        name = f'{Path(fs.path).stem}_war{wi}_{idx:03d}.wav'
        path = out / 'wave' / name
        write_wav(path, arr, rate=w['sampleRate'])
        used[key] = {'file': rel(path, out), 'sampleRate': w['sampleRate'], 'frames': w['frames'],
                     'loop': w['loop'], 'loopStart': w['loopStart'], 'encoding': w['encoding'],
                     'channels': len(w['channels'])}
    return used


def bank_region_for(fs, s, key, prg):
    bank_i = int(s['sequence']['banks'][0].split(':')[1])
    bk = SoundSet(fs).bank(bank_i)
    for kmax, vels in bk['instruments'][prg]:
        if key <= kmax:
            return vels[0][1], bk['waveIds'][vels[0][1]['waveIdIndex']]
    return None, None


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--bpm', type=int, default=120, help='G11(템포 변수)에 넣을 BPM. mg1801 Params.bpm 기본 120 [판독]')
    ap.add_argument('--out', default=str(EX / 'audio/mg1801'))
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    fsars = {k: Fsar(v) for k, v in ARC.items()}
    man = {'tool': 'tools/sound_extract_mg1801.py', 'bpm': a.bpm, 'outputRate': OUT_RATE,
           'note': '시퀀스 렌더는 nn::atk 재생을 근사 재구현한 것이다([추정]). 파형·노트·변수 값은 [데이터].',
           'sounds': {}, 'waves': {}}
    used_waves = {}

    # ---- 시퀀스 SE
    for label, arc, why in SEQ_SE:
        fs = fsars[arc]
        s = fs.find(label)
        r, audio = render_seq(fs, s, None, a.bpm, 10.0, random_mode='mid')
        audio = trim_tail(audio)
        path = out / 'seq' / f'{label}.wav'
        write_wav(path, audio)
        export_waves(fs, r.events, out, used_waves)
        notes = [e for e in r.events if 'note' in e]
        ent = {'archive': arc, 'file': rel(path, out), 'durationSec': round(len(audio) / OUT_RATE, 4),
               'peak': round(float(np.abs(audio).max()) if len(audio) else 0.0, 4), 'loop': None,
               'render': {'method': 'seq-render', 'randomMode': 'mid', 'G11': a.bpm},
               'evidence': {'call': why, 'labelToWave': '[데이터] 사운드 정보→FSEQ 시작 offset→노트→FBNK 영역→FWAR 파형',
                            'mix': '[추정] 렌더러 볼륨·엔벌로프 근사'},
               'notes': [{'tSec': n['t'], 'tick': n['tick'], 'key': n['note'], 'velocity': n['vel'],
                          'prg': n['prg'], 'wave': used_waves.get(f'{n["wave"][0]}:{n["wave"][1]}', {}).get('file')}
                         for n in notes]}
        ent.update(sound_meta(fs, s))
        if 'FOOD_FALL' in label:
            ent['random'] = {'pitchBendSemitones': [-3.0, 3.0], 'volume2': [100, 127],
                             'source': '[데이터] FSEQ MG1801_FOOD_FALL_WAT_RND: bend_range 3, [random] pitch_bend ±127, [random] volume2 100..127',
                             'delaySec@tempo120': 16 * 60 / (120 * 48),
                             'delaySource': '[데이터] delay_wat: wait 16 틱(타임베이스 48 기본, 템포 120 기본 — 이 SE 는 tempo 명령이 없다)'}
        ent['sameVoiceVolume'] = {'L5': {'2': 96, '3': 72, '4': 64, '5': 60, '>=6': 56},
                                  'source': '[데이터] FSEQ volume_offset_same_voice (L5 ≥ 2 일 때 트랙 volume). L5 쓰는 쪽 [미확정]'}
        man['sounds'][label] = ent

    # ---- JUST_SOUND (코드 추종)
    label, arc, why = JUST_SOUND
    fs = fsars[arc]
    s = fs.find(label)
    bgmA = fs.find('SQ_BGM_MG1801_A')
    fseqA = parse_fseq(fs.file_bytes(bgmA['fileId']))
    chords_used = sorted({c['value'] for c in disasm(fseqA['data'], bgmA['sequence']['startOffset'])
                          if c['name'] == 'setvar' and c.get('var') == 24 and isinstance(c['value'], int) and c['value'] > 0})
    table = {}
    all_codes = sorted({c['value'] for c in disasm(parse_fseq(fs.file_bytes(s['fileId']))['data'], s['sequence']['startOffset'])
                        if c['name'] == 'cmp_eq' and c.get('var') == 24})
    for code in all_codes:
        rr = SeqRenderer(SoundSet(fs), s, global_vars=[-1] * 8 + [code, -1, -1, a.bpm, -1, -1, -1, -1],
                         local_vars={0: 5}, random_mode='mid')
        rr.note_on = (lambda self_: (lambda t, key, vel, ln: self_.events.append(
            {'t': self_.time_ms / 1000.0, 'tick': self_.tick, 'note': key + t.transpose, 'vel': vel, 'len': ln,
             'L1': self_.local[1]})))(rr)
        rr.render(5.0)
        table[str(code)] = [{'tick': e['tick'], 'key': e['note'], 'velocity': e['vel'], 'length': e['len'], 'step': e['L1']}
                            for e in rr.events if 'note' in e]
    region, wid = bank_region_for(fs, s, 72, 4)
    (out / 'just_sound_table.json').write_text(json.dumps({
        'label': label, 'G8_codes_in_SQ_BGM_MG1801_A': chords_used,
        'rule': 'L0(게임이 쓰는 콤보 수, PlayExcellentSe) ≤1 이면 단계 0·1, 2 → 0..2, 3 → 0..3, ≥4 → 0..4 단계까지 노트를 낸다. '
                '단계 사이 대기는 FSEQ wait 4틱. tempo = G11(0<G11<1023 이 아니면 120). 이 표는 L0=5 로 끝까지 실행한 결과.',
        'instrument': 'BNK_SE_MG1801 prg 4 (키 영역별 파형, 아래 regions)',
        'byChord': table}, ensure_ascii=False, indent=1), encoding='utf-8')
    rendered = {}
    for code in chords_used:
        for l0 in (1, 5):
            gv = [-1] * 16
            gv[8], gv[11] = code, a.bpm
            rr = SeqRenderer(SoundSet(fs), s, global_vars=gv, local_vars={0: l0}, random_mode='mid')
            au = trim_tail(rr.render(5.0))
            p = out / 'seq' / 'just_sound' / f'{label}_G8_{code}_L0_{l0}.wav'
            write_wav(p, au)
            export_waves(fs, rr.events, out, used_waves)
            rendered[f'{code}/{l0}'] = rel(p, out)
    ent = {'archive': arc, 'file': None, 'variants': rendered, 'table': 'just_sound_table.json', 'loop': None,
           'render': {'method': 'seq-render', 'G11': a.bpm, 'note': 'G8(현재 코드)·L0(콤보) 에 따라 다른 소리. 웹은 표+파형으로 재현 권장'},
           'evidence': {'call': why, 'labelToWave': '[데이터] FSEQ CHORD_CHECK/PLAY_*_CHORD 레이블', 'mix': '[추정]'}}
    ent.update(sound_meta(fs, s))
    man['sounds'][label] = ent

    # ---- 시퀀스 BGM
    for label, arc, why in SEQ_BGM:
        fs = fsars[arc]
        s = fs.find(label)
        dry, first_ls, jump_tick = loop_structure(fs, s, a.bpm)
        spt = 60.0 / (a.bpm * dry.timebase)
        music = sorted(t for t in dry.tracks if t != 0)
        ls = max(first_ls.values()) if first_ls else None
        jt = max(jump_tick.values()) if jump_tick else None
        loop_has_notes = None
        info = {'songId_G13': song_id(fs, s), 'timebase': dry.timebase, 'tempo': dry.tempo, 'secPerTick': spt,
                'musicTracks': music,
                'loopStartTick': ls, 'loopJumpTick': jt}
        if ls is not None and jt is not None:
            period = jt - ls
            secs = (ls + 2 * period) * spt + 0.5
        else:
            period = None
            secs = 240.0
        r, audio = render_seq(fs, s, None, a.bpm, min(secs, 400.0))
        notes = [e for e in r.events if 'note' in e and e['track'] != 0]
        if ls is not None:
            loop_has_notes = any(ls <= e['tick'] < jt for e in notes)
        if loop_has_notes:
            loop = {'startSec': round((ls + period) * spt, 6), 'endSec': round((ls + 2 * period) * spt, 6),
                    'startTick': ls + period, 'endTick': ls + 2 * period,
                    'note': '두 번째 반복 구간을 루프로 쓴다(앞 반복의 꼬리 포함, 이음매 없음)'}
            audio = audio[:int(round(loop['endSec'] * OUT_RATE))]
        else:
            loop = None
            audio = trim_tail(audio)
        path = out / 'seq' / f'{label}.wav'
        write_wav(path, audio)
        ev = {'label': label, 'G11': a.bpm, 'structure': info, 'loopHasNotes': loop_has_notes,
              'globalWrites': [e for e in r.events if 'global' in e],
              'tempo': [e for e in r.events if 'tempo' in e or 'timebase' in e],
              'notes': [{'t': e['t'], 'tick': e['tick'], 'track': e['track'], 'key': e['note'], 'vel': e['vel'],
                         'len': e['len'], 'prg': e['prg']} for e in notes]}
        (out / 'events').mkdir(exist_ok=True)
        (out / 'events' / f'{label}.json').write_text(json.dumps(ev, ensure_ascii=False), encoding='utf-8')
        songEnd = ls * spt if ls is not None else None
        ent = {'archive': arc, 'file': rel(path, out), 'durationSec': round(len(audio) / OUT_RATE, 4),
               'peak': round(float(np.abs(audio).max()) if len(audio) else 0.0, 4),
               'loop': loop, 'songEndSec': None if loop else songEnd,
               'structure': info, 'events': f'events/{label}.json',
               'render': {'method': 'seq-render', 'G11': a.bpm, 'randomMode': 'mid'},
               'evidence': {'call': why, 'labelToWave': '[데이터] FSEQ+FBNK+FWAR', 'mix': '[추정]',
                            'tempo': '[데이터] TEMPO_CHECK: 0≤G11≤1023 이면 tempo=G11, 아니면 120. 매 틱 갱신'}}
        ent.update(sound_meta(fs, s))
        man['sounds'][label] = ent

    # ---- 스트림
    presets = {}
    for label, arc, preset_name, why in STREAMS:
        fs = fsars[arc]
        s = fs.find(label)
        target_label, target_fs = label, fs
        subst = None
        if preset_name:
            pr = presets.setdefault(preset_name, sound_preset.preset(preset_name))
            for blk in pr['blocks']:
                for rec in blk['records']:
                    if rec['type'] == 'U' and rec['src'] == label:
                        subst = rec['dst'][0]
            if subst:
                target_label, target_fs = subst, fsars['main']
        ts = target_fs.find(target_label)
        ext = target_fs.files[ts['fileId']].get('external')
        src = EX / 'romfs' / ext
        inf = sound_bfstm.info(src)
        path = out / 'stream' / f'{target_label}.wav'
        sound_bfstm.decode(src, path)
        ent = {'archive': arc, 'file': rel(path, out), 'source': f'romfs/{ext}',
               'sampleRate': inf['sampleRate'], 'channels': inf['channels'], 'durationSec': round(inf['seconds'], 6),
               'loop': ({'startSec': inf['loopStartSec'], 'endSec': inf['loopEndSec'],
                         'startSample': inf['loopStart'], 'endSample': inf['frames']} if inf['loop'] else None),
               'regions': inf['regions'], 'render': {'method': 'vgmstream -i (루프 무시 1회)'},
               'evidence': {'call': why, 'labelToWave': '[데이터] 사운드 정보 fileId → 외부 파일 경로', 'loop': '[데이터] BFSTM INFO'}}
        if subst:
            ent['substitutedBy'] = {'preset': preset_name, 'label': subst,
                                    'originalFile': fs.files[s['fileId']].get('external')}
            ent.update(sound_meta(target_fs, ts))
        else:
            ent.update(sound_meta(fs, s))
        jmp = sound_bfstm.jump(target_label)
        if jmp:
            ent['jumpSetting'] = jmp
        man['sounds'][label] = ent

    man['waves'] = used_waves
    man['presets'] = {n: [{'type': r['type'], 'src': r.get('src'), 'dst': r.get('dst', [None])[0] if r['type'] == 'U' else None,
                           'raw': r['raw'][1:] if r['type'] != 'U' else None}
                          for blk in sound_preset.preset(n)['blocks'] for r in blk['records']]
                      for n in ('mg1800_cmn', 'mg1801', 'mg1801_result')}
    (out / 'manifest.json').write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    for k, v in man['sounds'].items():
        print(f'{k:40s} {str(v.get("file")):55s} {v.get("durationSec")} loop={bool(v.get("loop"))} peak={v.get("peak")}')
    print(out / 'manifest.json')


if __name__ == '__main__':
    main(sys.argv[1:])
