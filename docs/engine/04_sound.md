# 04. 사운드 — bex::sound / nn::atk, 라벨 체계, FSAR·FSEQ·BFSTM, 3D, 웹 재생

2026-10-02. 상태: **분석 진행(데이터 구조·mg1801 소리 경로 확정, 엔진 내부 일부 미확정)**. 웹 구현은 하지 않았다(`web/script/**` 변경 없음).
작성 형식과 확정 수준은 [../../../분석.txt](../../../분석.txt)·[../../../README.md](../../../README.md)를 따른다.

| 표기 | 뜻 |
|---|---|
| [실행] | 원본 실행 확인. 이 문서에서는 **"원본이 미리 녹음해 둔 스트림과 자체 렌더를 대조"**한 것과 **"디코드·파서 실행 확인"**에만 쓴다(원본 게임을 돌려 본 것은 아니다) |
| [판독] | 원본 코드(Ghidra 디컴파일·디스어셈블) 판독 |
| [데이터] | 원본 데이터 확인 |
| [추정] | 추정 |
| [미확정] | 미확정 |

관련 문서: 리듬 박자 의미(GetBeatState 해석·BPM 출처)는 [02_rhythm.md](02_rhythm.md)가 결론을 낸다. 이 문서는 사운드 시스템·데이터·추출과, 박자 계산에 필요한 **사운드 쪽 사실**만 다룬다. 게임별 소리 사용처는 [../minigame/mg1801.md](../minigame/mg1801.md) 6.5·6.9·7절.

---

## 1. 기능 개요와 사용자에게 보이는 동작

- 게임 코드는 소리를 **라벨 문자열**로 낸다: `bex::sound::SoundModule::Play / Play2D / Play3D("SQ_SE_MG1801_JUST", 위치, 0.0)` 등. 결과로 `SoundHandle`을 받아 멈춤·볼륨·지역 변수 쓰기를 한다. [판독]
- 사운드 엔진은 Nintendo SDK **nn::atk**(정적 링크, 심볼 없음)를 감싼 `bex::sound`다. main 문자열 `nn::atk::detail::driver::SoundThread`, `nn::atk::StreamSoundRegionDataInfo`. [데이터]
- 소리 종류는 두 가지뿐이다. [데이터: 메인 프로젝트 6,616개 전수]
  - **SQ_ = 시퀀스 사운드**: MIDI 같은 명령열(FSEQ) + 악기 뱅크(FBNK) + 파형 묶음(FWAR). **효과음도 전부 시퀀스다.** BGM도 리듬 게임 BGM은 시퀀스다.
  - **SM_ = 스트림 사운드**: `romfs/stream/*.bfstm`(DSP-ADPCM 48 kHz) 외부 파일.
  - 웨이브 사운드(nn::atk WSD)는 0개.
- 리듬 미니게임에서는 **BGM 시퀀스가 박자 정보를 사운드 전역 변수로 게임에 알려 준다**(G14 16분음표 카운터, G8 코드 진행). 게임은 BPM을 전역 변수 G11로 시퀀스에 넘긴다. [데이터][판독] — 6.3절.
- mg1801에서 플레이어가 듣는 소리: 시퀀스 BGM `SQ_BGM_MG1801_A`(40초 곡, 반복 없음), 칼질 판정음(`SQ_SE_MG1801_JUST`/`SUCCESS`), **현재 코드에 맞춘 화음 아르페지오**(`SQ_SE_MG1801_JUST_SOUND`, 콤보마다 길어짐), 채소가 물에 떨어지는 소리 5종, 끝 징글, 결과 징글·앰비언트. 7절 표.

## 2. 분석 대상·자료 위치

| 항목 | 위치 |
|---|---|
| 메인 사운드 프로젝트 | `extracted/bea/_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj` (BEA 타입 `_MAINAUD`, 64,338,704 B) |
| 서브(애드온) 아카이브 | `extracted/bea/sound~subarc_<이름>.nx.bea/audio/sounddata/subarc_<이름>/subarc_<이름>.fsst` (BEA 타입 `_ADDAUD`). mg1801: `subarc_mg1801.fsst`(1,729,416 B), 리듬 공용 `subarc_rc_cmn.fsst`(5,653,424 B) |
| 스트림 | `extracted/romfs/stream/*.bfstm` 429 + `stream/subarc_*/` 14 = 443개 |
| 사운드 공간 | `extracted/bea/sound~snd_sp_*.nx.bea/audio/sound_space/**.bspp` (140개, 매직 `fssp`) |
| 오디오 설정 | `extracted/bea/audio.nx.bea/audio/{data,debug,jump_setting,settingpreset,sound_space,soundevent,supervision,userproc}` |
| 엔진 초기화 | `extracted/romfs/boot.nbinit` `bezel_audio_init`, `bezel_fx_trigger_init` |
| 디컴파일 | `analysis/decomp/sound_bex.c`(bex::sound 171개, 깊이 1), `sound_3d_calc.c`, `sound_3d_callers.c`, `sound_powf_callers.c`, `sound_fade_gvar.c`. 리듬 쪽 `main_ca_rm.c`(rhythm 담당 산출) |
| 도구 | `tools/sound_fsar.py`(FSAR), `tools/sound_seq.py`(FSEQ 역어셈블·FBNK·FWAR·FWAV·DSP 디코드·시퀀스 렌더), `tools/sound_bfstm.py`(BFSTM 헤더·리전·점프 설정·vgmstream 디코드), `tools/sound_preset.py`(세팅 프리셋), `tools/sound_extract_mg1801.py`(mg1801 일괄 추출) |
| 추출 결과 | `extracted/audio/mg1801/` — `manifest.json`, `seq/`, `stream/`, `wave/`, `events/`, `just_sound_table.json` |
| 외부 도구 | `tools/vgmstream/vgmstream-cli.exe` r2117 (BFSTM 디코드) |

주소는 SwitchLoader 기본 베이스 0x7100000000 기준이고 모듈 이름과 함께 쓴다.

## 3. 진입점과 전체 호출 흐름

### 3.1 공개 API (bex::sound) [데이터: main 심볼]

| 함수 | 주소(main) | 비고 |
|---|---|---|
| `SoundModule::Play(label, float, const char*)` | 0x71000bddd8 | 2D 기본 재생. float 인자 = AudioPlayInfo 첫 필드 [미확정 의미] |
| `SoundModule::Play(label, AudioPlayInfo&)` | 0x71000bde84 | |
| `SoundModule::Play(SceneType, label, float, …)` | 0x71000bdf4c | 화면(씬)별 사운드 장면 지정 |
| `Play2D(…)` ×4 | 0x71000be024~ | 결과 앰비언트(`SM_AMB_<MG>_MG_RESULT`)에 쓰임 |
| `Play3D(label, Vector3f pos, float)` | 0x71000be3a4 | mg1801 판정음·물보라 |
| `Play3DHold`, `Play3DHookPosition`(엔티티 추적), `Play3DViewportBit…` | 0x71000be54c~ | |
| `StopGroup_Type/Time`, `DuckingGroup`, `SetPitchGroup`, `SetLpfFreqGroup`, `StopAll`, `SetPauseLevel` | 0x71000becb0~ | 그룹 제어 |
| `ReadGlobalVariable(int)` | 0x71000bf564 | 실패하면 0을 돌려준다(−1 아님) [판독 FUN_71000fe284] |
| (이름 없음) `WriteGlobalVariable(int, short)` | **FUN_71000bf558** | ReadGlobalVariable 바로 앞 함수. 리듬 코드가 G11=BPM, 정리 때 G0..G15=−1 [판독] |
| `LoadSettingPreset(name)` / `(SceneType, name)` | 0x71000bfb04 / 0x71000bfb40 | 세팅 프리셋(4.7) 적용 |
| `FadeTimeToSec(FadeTimePreset)` | 0x71000bfba4 | 런타임 설정 표 `+0x28→+0x4E80`에서 읽는다. 값은 코드에 없다 [판독, 값 미확정] |
| `LoadSoundArchive(Async)`, `ReleaseSoundArchive` | 0x71000bfcc0~ | 서브 아카이브 적재 |
| `StartScene(SceneType)` | 0x71000bdd18 | |
| `SoundHandle::Stop / Stop_Time / Stop_Preset / Pause* / SetVolume / SetPan / SetPitch / SetTempoRatio / SetDucking / SetTrackVolume` | 0x71000c5e94~ | |
| `SoundHandle::WriteLocalVariable(i, v)` / `ReadLocalVariable` / `WriteTrackVariable` | 0x71000c69f0~ | 시퀀스 지역 변수 L0..L15 |
| `SoundHandle::GetBeatCount(BeatType)`, `GetBpm()` | 0x71000c7c78, 0x71000c7ccc | 엔진 내부 박자. mg1801·ca::rm 기반 클래스는 쓰지 않고 G14 를 읽는다. GetBeatCount 를 import 하는 NRO 는 mg1802·mg1806·mg0907·menu00 [데이터: 함수 목록] |
| `SoundHandle::RegionSequenceJump`, `GetPlayRegion` | 0x71000c7d0c~ | 스트림 리전 점프(4.5) |
| `ComActor`(엔티티 소리), `ComListener`(리스너) | 0x7100105054, 0x7100105474 | 컴포넌트 |

### 3.2 라벨 → 파형 해석 경로

```
게임: Play3D("SQ_SE_MG1801_JUST", pos)
 1. 세팅 프리셋 라벨 치환(현재 적용된 프리셋의 'U' 레코드)           [데이터: 프리셋 내용 / 적용 시점은 판독 안 함]
    예) mg1801: SQ_SE_RC_JUST → SQ_SE_MG1801_JUST_SOUND
        mg1801_result: SM_JIN_MG1801_MG_RESULT_GOOD → SM_JIN_RC01_MG_SUCCESS
 2. 적재된 아카이브(메인 fspj + 서브 fsst들)의 STRG 패트리샤 트리로 라벨 → itemId(상위 8비트 1=사운드)
 3. INFO 사운드 정보: fileId, player, volume, 3D 정보, 종류
    ├ 시퀀스(0x2203): FSEQ 파일 + 시작 offset + 뱅크 목록
    │    FSEQ 명령 실행 → note(key, vel) → FBNK prg → 키·벨로시티 영역 → (웨이브 아카이브 itemId, 파형 번호)
    │    → FWAR 안 FWAV(DSP-ADPCM) → 피치 = 2^((key − originalKey)/12) × 영역 pitch
    └ 스트림(0x2201): 파일 정보가 외부 경로 "stream/....dspadpcm.bfstm"
```

근거: 1·2·3은 [데이터](파서로 mg1801·rc_cmn 전체를 풀었다). 단계 1을 bex가 어느 함수에서 하는지는 판독하지 않았다 [미확정]. 프리셋 이름이 mg1801 장면과 결과 단계에 맞춰 있어 장면이 적용한다고 본다 [추정]. `mg1800_cmn`은 리듬 기반 클래스가 `OnGameMain` 5단계에서 부른다 [판독, mg1801.md 3.3].

**서브 아카이브의 itemId는 그 아카이브 안 번호다.** 예: subarc_mg1801의 뱅크 0~2, 웨이브 아카이브 0~2가 자기 FILE 블록 파일 9~14를 가리킨다. 서브 아카이브의 플레이어(`PLY_BGM_RC` 등)와 같은 이름의 플레이어가 메인 프로젝트에도 있다. 둘이 같은 슬롯을 공유하는지는 [미확정].

## 4. 구조체·포맷

모든 nn::atk 바이너리는 리틀 엔디언, 공통 헤더 `magic[4], u16 BOM(FEFF), u16 headerSize, u32 version, u32 fileSize, u16 blockCount, u16 pad, {u16 type, u16 pad, s32 offset, u32 size}×n`. **참조(Reference)** = `{u16 type, u16 pad, s32 offset}`(offset −1 = 없음), 크기 참조 = 참조 + u32 size, 참조 표 = `u32 count + 참조×n`. offset의 기준은 **그 참조를 담은 구조체(표)의 시작**이다. [데이터: 아래 모든 표본에서 일관]

### 4.1 FSAR (.fspj / .fsst) [데이터, 파서 `tools/sound_fsar.py`]

헤더 version `0x00020600`, 블록 3개.

| 블록 | type | 내용 |
|---|---|---|
| STRG | 0x2000 | +8: 참조 0x2400(문자열 표 = 크기 참조 표 0x1F01), 참조 0x2401(패트리샤 트리: u32 root, u32 nodeCount, 노드 0x14 B = u16 flags(1=leaf), u16 bit, u32 left, u32 right, u32 stringId, u32 itemId) |
| INFO | 0x2001 | +8: 참조 8개 — 0x2100 사운드, 0x2104 사운드 그룹, 0x2101 뱅크, 0x2103 웨이브 아카이브, 0x2105 그룹, 0x2102 플레이어, 0x2106 파일, 0x220B 플레이어 최대치 |
| FILE | 0x2002 | 내부 파일 본문. 파일 정보의 offset 기준 = FILE+8 |

itemId 상위 8비트: 1 사운드, 2 사운드 그룹, 3 뱅크, 4 플레이어, 5 웨이브 아카이브, 6 그룹.

**사운드 정보(0x2200)**

| offset | 타입 | 필드 |
|---|---|---|
| 0x00 | u32 | fileId |
| 0x04 | u32 | player itemId |
| 0x08 | u8 | volume (BGM 26, SE 45~77 등. 127 기준 선형 배율로 본다 [추정]) |
| 0x09 | u8 | remoteFilter |
| 0x0C | ref | 상세 정보: 0x2201 스트림 / 0x2202 웨이브 / 0x2203 시퀀스 |
| 0x14 | u32 | 옵션 플래그. 켜진 비트 순서대로 u32 값이 이어진다 |

옵션 비트: 0 문자열 id, 1 팬(u8 panMode, u8 panCurve), 2 플레이어 우선순위(u8 priority, u8 isReleasePriorityFix), 8 3D 정보 offset(사운드 정보 기준), 17 frontBypass, 28~31 사용자 파라미터. [데이터]

**3D 정보**: `u32 flags, f32 decayRatio, u8 decayCurve, u8 dopplerFactor, …`. flags 비트 0 볼륨 감쇠, 1 우선순위 감소, 2 팬, 3 서라운드 팬(span), 4 필터. [데이터 + 판독: 기본값 decayRatio 0.5·curve 1 은 FUN_71005b95d8 이 넣는 값과 같다]

**시퀀스 상세(0x2203)**: `ref 뱅크 itemId 표(0x0100), u32 allocTrackFlags, u32 옵션(비트0 startOffset, 비트1 u8 channelPriority·u8 releasePriorityFix)`.
**스트림 상세(0x2201)**: `u16 validTracks, u16 channelCount, ref 트랙 표(0x0101), f32 pitch, ref 센드(0x220F), ref 확장(0x2210), u32 prefetchFileId`. 트랙 정보: u8 volume, u8 pan, u8 span, u8 flags, …
**뱅크(0x2206)**: `u32 fileId, ref 웨이브 아카이브 표, 옵션(비트0 문자열)`. 서브 아카이브의 뱅크는 이 표가 비어 있고 FBNK 안 파형 표가 웨이브 아카이브를 직접 가리킨다.
**웨이브 아카이브(0x2207)**: `u32 fileId, u8 loadIndividual, 옵션(비트0 문자열, 비트1 파형 수)`.
**플레이어(0x2209)**: `u32 playableSoundMax, 옵션(비트0 문자열, 비트1 힙 크기)`.
**파일(0x220A)**: 참조 0x220C 내부(크기 참조, FILE+8 기준) / 0x220D 외부(문자열 경로, romfs 기준).
**플레이어 최대치(0x220B)**: sequenceSound 64, sequenceTrack 96, streamSound 6, streamTrack 48, streamChannel 12, waveSound 16, waveTrack 16 (메인·서브 동일). [데이터]

통계 [데이터]

| 아카이브 | 사운드 | 뱅크 | 웨이브 아카이브 | 플레이어 | 파일(외부) |
|---|---|---|---|---|---|
| AddonAudioProject.fspj | 6,616 (시퀀스 6,136 / 스트림 480) | 88 | 88 | 2,833 | 712 (418) |
| subarc_mg1801.fsst | 25 (시퀀스 22 / 스트림 3) | 3 | 3 (파형 54·27·13) | 7 | 17 (2) |
| subarc_rc_cmn.fsst | 30 (전부 시퀀스) | 7 | 7 | 5 | 26 (0) |

### 4.2 FSEQ (시퀀스) [데이터, `tools/sound_seq.py disasm`]

블록 DATA(0x5000) = 명령 바이트열, LABL(0x5001) = 레이블 표(`{ref 0x1F00 데이터 offset, u32 길이, char[]}`). **사운드 정보의 startOffset 은 DATA 본문 기준 offset**이고, 레이블이 그대로 남아 있다(`MG1801_JUST`, `SMF_MID_BGM_MG1801_Track_3_LoopStart`, `TEMPO_CHECK` 등). BGM 레이블 `SMF_MID_*`로 보아 **MIDI(SMF)에서 변환한 시퀀스**다.

명령(NW4R·nn::atk MML 계열). **다중 바이트 인자는 리틀 엔디언**이다(호출 주소 `8A D5 00 00` = 0xD5 가 데이터 안으로 떨어지는 것으로 확인). [데이터: mg1801·rc_cmn 시퀀스 전체가 알 수 없는 명령 없이 풀림]

| 바이트 | 명령 | 인자 |
|---|---|---|
| 00~7F | note(key) | u8 velocity, 가변길이 length(틱) |
| 80 | wait | 가변길이 |
| 81 | prg | 가변길이 |
| 88 | opentrack | u8 트랙, u24 주소 |
| 89 / 8A | jump / call | u24 |
| A0 | 접두 random | 마지막 인자 대신 s16 min, s16 max |
| A1 | 접두 variable | 마지막 인자 대신 u8 변수 번호 |
| A2 | 접두 if | 비교 플래그가 참일 때만 실행 |
| A3~A5 | 접두 time / time_random / time_variable | 뒤에 s16 시간(또는 범위·변수) |
| B0 timebase, B6 bank_select, C0 pan, C1 volume, C2 main_volume, C3 transpose(s8), C4 pitch_bend(s8), C5 bend_range, C6 prio, C7 note_wait, C8 tie, D0~D3 ADSR, D4 loop_start, D5 volume2, D9/DA/DE fxsend A/B/C, DB mainsend, DC init_pan, DD mute … | u8 (s8) | |
| E0 mod_delay, E1 tempo, E3 sweep_pitch | s16 | |
| F0 80~8B | setvar/addvar/subvar/mulvar/divvar/shiftvar/randvar/andvar/orvar/xorvar/notvar/modvar | u8 변수, s16 값 |
| F0 90~95 | cmp_eq/ge/gt/le/lt/ne | u8 변수, s16 값 |
| F0 E0 | userproc | u16 |
| FB env_reset, FC loop_end, FD ret, FE alloctrack(u16), FF fin | | |

변수 번호: 0~15 지역 L0..L15(사운드 하나), 16~31 전역 G0..G15(엔진 전체 공유), 32~47 트랙 T0..T15. 기본값 −1 [추정: 리듬 코드가 정리 때 −1 로 되돌림과 시퀀스가 −1 비교를 하는 것으로 보아].

### 4.3 FBNK (악기 뱅크) [데이터]

INFO(0x5800): `ref 파형 id 표 {u32 웨이브아카이브 itemId, u32 파형 번호}×n`, `ref 악기 참조 표(0x5900 악기)`.
악기 → 키 영역 묶음 → 키 영역 → 벨로시티 영역 묶음 → 벨로시티 영역. 묶음 형식: 0x6000 direct(참조 1개), 0x6001 range(`u32 n, u8 상한[n](4정렬), 참조[n]`), 0x6002 index(`u8 min, u8 max, pad, 참조[]`), 0x6003 null.
**벨로시티 영역**: `u32 파형 id 표 인덱스, u32 플래그 + 값` — 비트 0 originalKey, 1 volume, 2 pan(u8, s8 surround), 3 pitch(f32), 4 (ignoreNoteOff, keyGroup, interpolation), 9 ADSHR 참조 offset(→ u8 A, D, S, H, R).
예: BNK_SE_MG1801 prg 3(물보라) = 키 60→파형 3, 61→4, 62→5, 63→6, 나머지→7, originalKey 60, ADSHR 127/127/127/0/127. prg 4(화음 SE) = 키 상한 64/70/76/82/114 → 파형 8~12, originalKey 60/66/72/78/84, volume 89, release 100.

### 4.4 FWAR / FWAV (파형) [데이터 + 실행]

FWAR: INFO(0x6800) 크기 참조 표(FILE+8 기준) → FWAV 들. FWAV: INFO(0x7000) `u8 encoding(0 PCM8, 1 PCM16, 2 DSP-ADPCM, 3 IMA), u8 loop, u32 sampleRate, u32 loopStart, u32 frameCount, u32 originalLoopStart, 채널 정보 표(ref 샘플(DATA+8 기준), ref ADPCM 정보 = coef[16] s16, ps, yn1, yn2, loop ps/yn1/yn2)`.
mg1801 SE 파형은 모노 DSP-ADPCM, 48 kHz 와 44.1 kHz 가 섞여 있다. 자체 DSP 디코더(`dsp_decode`)로 풀었다 [실행].

### 4.5 BFSTM (스트림) [데이터, `tools/sound_bfstm.py`]

version 0x00060400, 블록 INFO(0x4000)·SEEK(0x4001)·DATA(0x4002)·REGN(0x4003, 있을 때만). StreamInfo: `u8 encoding, u8 loop, u8 channels, u8 regionCount, u32 sampleRate, u32 loopStart, u32 frameCount(=루프 끝), 블록 정보 8×u32, ref 샘플, u16 regionInfoSize(0x100), ref 리전 데이터, u32 originalLoopStart, u32 originalLoopEnd, u32 crc`.
REGN 엔트리 0x100 B: `u32 start, u32 end, DSP 문맥(u16 ps, s16 yn1, s16 yn2)×16, +0x68 u32 사용(1), +0xC0 char[0x40] 이름`.

전수 [실행: 443개 파싱]: 인코딩 전부 DSP-ADPCM, 48 kHz, 2채널 434·4채널 9(보드 BGM, 트랙 2개), 루프 있음 138·없음 305, 리전 있음 82(`*_JMP`).
점프 설정 `audio/jump_setting/conv/<라벨>.msgpack`: 리전 시퀀스 정의. 예 `SM_BGM_MG0101_JMP` — `REG_SEQ_INTRO`(다음 = REG_SEQ_MAIN, 반복 FALSE, 리전 INTRO_00..02), `REG_SEQ_MAIN`(반복 TRUE, MAIN_00..01), 명령 `JMP_TO_MAIN`. `SoundHandle::RegionSequenceJump`가 이 표를 쓴다고 본다 [추정]. mg1801은 리전 스트림을 쓰지 않는다.

### 4.6 audio.nx.bea 설정 파일 [데이터]

| 파일 | 내용 |
|---|---|
| `data/mgsound_setting.json` | 미니게임 104종의 BGM·징글 설정(`mg_bgm_label`, `mg_bgm_play_position`, `mg_bgm_intro_skip`(리전 시퀀스), `mg_bgm_play_offset`, `mg_bgm_stop_fade`(전부 `FADE_TIME_02`), `result_jingle_play_offset` 38 등). **리듬 게임 mg18xx 는 없다** |
| `jump_setting/conv/*.msgpack` (133) | 스트림 리전 점프 표(4.5) |
| `supervision/supervise_bgm.msgpack` | BGM 라벨 목록(Index, Invalid, Label). `SM_BGM_MG1801_DH` = 409 |
| `supervision/supervise_npc/pc/sys_voice.msgpack` | 보이스 라벨 감수 목록(캐릭터·설명) |
| `soundevent/soundevent.msgpack` | 테스트 3건(`VARIABLE_TEST_LABEL` 등, cmd 0~4). 실사용 흔적 없음 |
| `userproc/conv/00.msgpack` | 128칸 곡선 0,0,18,29,…,127 (FSEQ `userproc` 콜백용 [추정]) |
| `sound_space/footstep_param.msgpack` | 지면 재질 → 발소리 prg 번호 |
| `debug/conv/mute_list.msgpack` | 빈 목록 |
| `settingpreset/sound_settingpreset.bspp` | 세팅 프리셋(4.7) |

`bq.nx.bea common/data/musicBgmList.json` — 음악 감상 메뉴 곡 목록. `keyId 200`(리듬) 에 `SM_BGM_MG1801_DH` 등 `_DH` 스트림이 있다. **`SM_BGM_MG1801_DH`는 게임 중 BGM이 아니라 음악 감상용 녹음이다.** [데이터] → mg1801.md 7절의 "SQ_BGM_MG1801_A → SM_BGM_MG1801_DH [추정 연결]"은 틀렸다(그 문서는 수정 금지라 여기와 SHARED.md 에 정정을 남긴다).

### 4.7 세팅 프리셋 (.bspp `BSPP`) [데이터, `tools/sound_preset.py`]

헤더 `BSPP, u32 프리셋 수(366), u32 아카이브 이름 수(395), u32 1, u32 공간 수`, 이어서 표 3개(항목 0x28 B = char[0x20] 이름, u32 해시(이름의 FNV-1a 32비트 — scene 담당 확인), u32 offset). 데이터 기준 = 셋째 표 끝(0x8678). 프리셋 = `BSSP, u32 레코드 수, u32 문자열 수, 레코드(12×u32)…, NUL 구분 문자열`.

| 레코드 | 형식 | 뜻 |
|---|---|---|
| `U` | [U, 0, src, dst×5, 0×4] (문자열 offset) | **라벨 치환** [데이터: 이름 쌍이 일관]. dst 5칸은 전부 같았다(뜻 [미확정]) |
| `R` | [R, 문자열] | 이펙트(리버브) 프리셋 이름 `EFFECT_COMMON_ROOM_00` 등 [추정] |
| `X` | [X, 0, 문자열] | 서브 아카이브 이름 `subarc_op_rc` [추정: 추가 적재] |
| `l` | [l, 0, a, b, c] | 보이스 FX 라벨 → 사운드 라벨 짝 [추정] |
| `P` | [P, 0, n(3/4/6), 0,0,0, f32×6] | 예 mg1801 n=6: 10, 50, 10, 0.5, 1, 0.5 / n=4·3: 10, 23, 10, 0.5, 1, 0.5. **3D 리스너 파라미터 후보**(화면 분할 수별) [추정] |

mg1801 관련 프리셋 [데이터]

| 프리셋 | 내용 |
|---|---|
| `mg1800_cmn` | 캐릭터 액션·점프 보이스 9종 → `SQ_VOI_PC**_MUTE` (리듬 중 캐릭터 목소리 끔) |
| `mg1801` | `SQ_SE_RC_JUST → SQ_SE_MG1801_JUST_SOUND`, 발소리 30종 → `SQ_SE_DUMMY`, R `EFFECT_COMMON_ROOM_00`, P 3개 |
| `mg1801_result` | `SM_JIN_MG1801_MG_RESULT_GOOD → SM_JIN_RC01_MG_SUCCESS`, `…_BAD → SM_JIN_RC01_MG_FAIL` |

그래서 서브 아카이브의 `SM_JIN_MG1801_MG_RESULT_GOOD/BAD`는 `stream/subarc_mg1801/SM_DUMMY`를 가리키지만 실제로는 메인의 RC01 징글이 난다.

### 4.8 사운드 공간 (.bspp `fssp`) [데이터, 의미 미확정]

`snd_ft_mg1801.bspp` 244 B: 매직 `fssp`, u32 8, 0xC0 부근에 f32 1.0 다수와 u32 6, −1 반복. 이름(`snd_ft_*` 119개, `snd_sp_*`)과 `footstep_param.msgpack`로 보아 발소리·공간 설정으로 본다 [추정]. mg1801에서는 발소리가 프리셋으로 꺼진다.

### 4.9 boot.nbinit [데이터]

| 키 | 값 |
|---|---|
| `bezel_audio_init.VoiceCountMax` | 96 |
| `BgmSlotCountMax` | 16 |
| `OpusDecoderCount` / `OpusHardwareDecoderCount` | 2 / 2 (스트림은 전부 DSP라 Opus 사용처 [미확정]) |
| `AudioHeapSize` | 95,420,416 |
| `IsAudioFileReadCacheEnabled` / `AudioFileReadCacheSizePerSound` | true / 131,072 |
| `bezel_fx_trigger_init.SoundTriggerCount` | 512 |
| `IsAudioDefaultListenerEnabled` | true |

## 5. 상태 전이와 수명

### 5.1 시퀀스 사운드 하나 [데이터 + 추정]

```
Play(label) → 핸들 생성(플레이어 슬롯 확보, playableSoundMax 초과면 기존 소리와 우선순위 경쟁 [추정])
  틱 0: 트랙 0 이 startOffset 부터 명령 실행. opentrack 으로 다른 트랙을 연다(같은 틱에 번호 순서대로 돈다 [추정])
  매 틱: 트랙마다 wait 카운터를 줄이고 0 이면 다음 wait 까지 명령 실행
  note → 채널(보이스) 시작. length>0 이면 그 틱 수 뒤 release, length 0 이면 파형 끝까지 [추정]
  fin → 트랙 닫힘. 모든 트랙이 닫히고 채널이 끝나면 사운드 종료
Stop(fade) → 페이드 후 종료
```

게임은 재생 직후 `WriteLocalVariable`로 지역 변수를 넣는다(예 PlayExcellentSe 의 L0). 시퀀스가 첫 틱에 그 값을 보는지(쓰기 반영 시점)는 [미확정].

### 5.2 리듬 BGM 시퀀스의 공통 골격 [데이터: SQ_BGM_MG1801_A/B/C·_MG_ENDING·_INTER_END, SQ_BGM_RC_* 같은 틀]

```
start(0x191): timebase 96; opentrack 1..10
Track_0(제어): note_wait 0; tempo 120; G13 = 곡ID; L14=0; L13=0
  call STARTTRIGGER_CHECK:  L15 = G13
      L15==1 → G10=1 ; L15==6 → L14=0,L13=-1
      loop: if L15 != G13 → fin ; if L15 == G12 → T1 = L13, ret ; wait 1 ; repeat      ← 출발 대기
  call TEMPO_SETTING: G8=0, G9=0, (L14==0 이면 G9=L13)
      loop forever: TEMPO_CHECK(0≤G11≤1023 이면 tempo=G11 아니면 120); wait 1; ENDPLAY_CHECK_VOLOFF(L15==6 → fin)
Track_1..N(음악): prg/bank/volume 설정 → call STARTTRIGGER_CHECK(같은 대기) → MIDI 노트들
  마디마다 call ENDPLAY_CHECK: L15==G13 이면 ret(계속) / 아니면 (G9>0 → G8=1), T1>0 → T1−1 후 계속, 아니면 G10=1 후 fin
  Track_N_LoopStart: (A: wait 376; ENDPLAY_CHECK; wait 8; jump) — 무음 대기 반복
```

음악 트랙 1 은 시작 때 `L0 = 0`, 192틱(2박) 뒤 `L0 = 1` 을 쓴다. 게임 FUN_7100426c2c 가 이 지역 변수를 읽는다(rhythm 담당 확인) [데이터].

**곡 ID(G13)** [데이터]: A/B 18011, C 18013, A/B/C_INTER_END 18014, *_MG_ENDING 50, MG1801_ENDING 6, RC_GENERIC 100, RC_REMIX 18000, RC_DATALOAD·MG18xx_DATALOAD 2, RC_CALIBRATION·RC_MG_PRE 3, RC_MGCMN_OP 1, RC_OP_DATALOAD 4, RC_OP_ENCORE 400, RC_BPMUP 5.

### 5.3 RC_MAIN_RHYTHM 과 BGM 출발 핸드셰이크 [데이터 + 판독]

`ca::rm::RmSoundMan::StartModeMainBgm`(main 0x71004264c4)이 G12 를 저장해 두고 `SQ_BGM_RC_MAIN_RHYTHM`(rc_cmn)을 재생한다 [판독]. 이 시퀀스(allocTrack 0x3F, 실제로 여는 트랙 0~4):

| 트랙 | 레이블 | 하는 일 |
|---|---|---|
| 0 | (start) | G13=G12=G10=G9=G8=−1, L15=1, L14=0, L13=−1, **G10=1**, STARTTRIGGER_CHECK_RHYTHM(G13 ∈ {1,200,300,400} 까지 wait 1), 그 뒤 템포 루프(tempo = G11) |
| 1 | `countTrack` | 시작 트리거 대기 → **마디 루프**: `if G10==1 { G12 = G13; if G12 != 10000 { G10 = 0 } }` → `G14 = 1; wait 24; (G14 += 1; wait 24)×15` → ENDPLAY_CHECK_RHYTHM(G12==6 → fin) → 반복 |
| 2 | `rhythmdrumTrack` | G13 이 등록된 곡 ID(18011 등)면 `KICKS_MUTE`(4박 쉼), 아니면 `NORMAL_RHYTHM`(4분음표 킥 note 36) |
| 3, 4 | `fillTrack_01/02` | 필인 |

흐름(mg1801 기준):
1. RC_MAIN_RHYTHM 시작 → `G10 = 1`. countTrack 은 G13 이 1(오프닝 시퀀스 `SQ_BGM_RC_MGCMN_OP`가 씀) 등이 될 때까지 기다린다.
2. 시작 트리거가 오면 countTrack 이 마디(384틱 = timebase 96 × 4박)마다 **G14 = 1..16** 을 24틱(16분음표) 간격으로 센다.
3. 새 BGM(`SQ_BGM_MG1801_A`)이 재생되면 G13 = 18011 을 쓰고 모든 트랙이 **G12 == 18011 을 기다린다**.
4. 이전 BGM 이 다음 ENDPLAY_CHECK 에서 G13 변화를 보고 G10 = 1 을 쓰고 끝난다.
5. countTrack 이 **다음 마디 시작**에서 G10 == 1 을 보고 `G12 = G13` → BGM 트랙들이 출발한다.

결론: **BGM 의 틱 0 은 countTrack 의 마디 경계(G14 가 1 로 돌아가는 틱)와 맞물린다.** 차이는 BGM 트랙의 `wait 1` 폴링 1틱(+ 시퀀스 처리 순서)까지다 [데이터 + 추정(처리 순서)]. 두 시퀀스 모두 tempo = G11 이라 이후에도 같은 속도로 간다. 게임은 G12(현재 곡) 와 G14(16분음표 위치)를 읽는다 [판독: main_ca_rm.c ReadGlobalVariable(0xC)·(0xE)].

### 5.4 전역 변수 표 (리듬 모드)

| 변수 | 쓰는 쪽 | 읽는 쪽 | 뜻 |
|---|---|---|---|
| G8 | BGM 음악 트랙 | SQ_SE_MG1801_JUST_SOUND 등 | **현재 코드**(6.5) |
| G9 | BGM(TEMPO_SETTING) | ENDPLAY_CHECK, rhythmdrum | [미확정] |
| G10 | RC_MAIN_RHYTHM, 이전 BGM | countTrack | 다음 곡 출발 허가 |
| G11 | **게임** FUN_7100425d70 → FUN_71000bf558(0xB, BPM) | 모든 리듬 시퀀스 TEMPO_CHECK, JUST_SOUND | BPM [판독+데이터] |
| G12 | countTrack | BGM 트랙(출발), 게임 | 확정된 현재 곡 ID |
| G13 | 각 BGM 시작 | countTrack, BGM | 요청된 곡 ID / 시작 트리거 |
| G14 | countTrack | 게임 `ca::rm::snd::GetBeatState` | 마디 안 16분음표 번호 1..16 |
| G0~G15 | 게임 FUN_7100426030 | — | 리듬 정리 때 전부 −1 [판독] |

## 6. 계산식·조건·의사코드

### 6.1 시퀀스 틱 시간 [데이터 + 추정]

- 틱 길이 = 60 / (tempo × timebase) 초. 리듬 BGM: timebase 96, tempo = G11 → BPM 120 에서 1틱 = 1/192 s = 5.208 ms, 1마디 384틱 = 2.000 s.
- SE 시퀀스는 tempo·timebase 명령이 없으면 기본 120·48 이다(예 물보라 `wait 16` = 0.1667 s) [추정: nn::atk 기본값. 렌더 결과가 원본 녹음과 맞는 것은 BGM 만 확인].
- nn::atk 는 사운드 스레드 주기마다 틱을 처리한다. 렌더러는 **5 ms 프레임마다 `tempo×timebase×5/60000` 틱을 누적**해 처리한다 [추정: 주기 값]. 그래서 이벤트 시각이 최대 5 ms 양자화된다.

### 6.2 SQ_BGM_MG1801_A [데이터 + 실행]

| 항목 | 값 |
|---|---|
| 뱅크 | BNK_BGM_RC_CMN_1801, BNK_BGM_MG1801 |
| 트랙 | 0(제어) + 음악 1,2,3,4,5,6,8,9,10 (allocTrack 0x77F) |
| timebase / 기본 tempo | 96 / 120 (G11 이 0..1023 이면 그 값) |
| 곡 길이 | **7680틱 = 80박 = 20마디** → BPM 120 에서 40.000 s. 이후 LoopStart 는 무음 대기 |
| 노트 수 | 1,344 |
| G8 코드 진행(틱: 값) | 6:111, 768:111, 1152:304, 1536:111, 1920:301, 2112:306, 2304:111, 2688:304, 2880:303, 3072:508, 3168:1107, 3264:106, 3360:101, 3456:204, 3552:306, 3648:111, 3840:304, 4224:309, 4608:304, 4992:301, 5376:306, 5952:111, 6144:504, 6336:111, 6528:504, 6720:508, 6816:1107, 6912:106, 7008:101, 7104:204, 7200:306, 7296:107, 7392:109, 7488:111 |
| B | A 와 같은 FSEQ·같은 offset (차이 없음) |
| C | 다른 FSEQ, 곡 ID 18013 |

### 6.3 G14 로 본 박자 [데이터; 의미 결론은 02_rhythm.md]

countTrack 의 마디 시작 틱을 T0 라 하면 마디 안 틱 k(0..383)에서 `G14 = 1 + floor(k / 24)`. 리듬 코드 `GetBeatState(type)`는 G14 × 0.25(type 0) 또는 × 0.5(type 1, 2)를 **올림**(frintp)해 정수로 만든다 — rhythm 담당 정정(SHARED.md, main 0x7100425d28). 해석은 02_rhythm.md.

### 6.4 효과음 시퀀스 [데이터]

mg1801 SE(FSEQ 파일 7) 공통 서두: `cmp_ge L5 2 → [if] call volume_offset_same_voice` — L5 가 2·3·4·5·≥6 이면 트랙 volume 96·72·64·60·56. L5 를 쓰는 쪽은 찾지 못했다 [미확정] (엔진이 "같은 소리 동시 재생 수"를 넣는다고 본다 [추정]). 기본 −1 이면 volume 127.

| 라벨 | 명령 요지 | 파형 |
|---|---|---|
| SQ_SE_MG1801_JUST | prg 1, fxsend_b 15, note 60 v127 len 0 | war2 #1 (18,694 샘플 @48k) |
| SQ_SE_MG1801_SUCCESS | prg 0, note 60 | war2 #0 |
| SQ_SE_MG1801_SWING | prg 2, note 60 | war2 #2 |
| SQ_SE_MG1801_FOOD_FALL_WAT_{EXSML,SML,MDL,LRG,EXLRG} | prg 3; `FOOD_FALL_WAT_RND`: bend_range 3, **[random] pitch_bend −127..127, [random] volume2 100..127**; `delay_wat`: **wait 16**; note **60/61/62/63/64** v103 | war2 #3/#4/#5/#6/#7 (44.1 kHz 포함) |
| SQ_SE_MG1800_COUNT_STICK (rc_cmn) | prg 2, fxsend_b 5, note 60 | rc_cmn war0 #1 |

즉 물보라는 **재생 요청 뒤 16틱(템포 120·타임베이스 48 이면 1/6 초) 늦게 나고**, 매번 피치 ±3 반음 안에서, volume2 100..127 에서 무작위다. 무작위 소비는 엔진 난수다(게임 `SyncRand` 와 무관) [추정].

### 6.5 JUST 아르페지오 (SQ_SE_MG1801_JUST_SOUND) [판독 + 데이터]

호출 사슬:
1. mg1801 플레이어가 JUST 를 내면 `ca::rm::RmSoundMan::PlayExcellentSe(-1, true)` [판독: mg1801.nro @0x710000cfc8 `mov w1,#-1`, `mov w2,#1`].
2. PlayExcellentSe(main 0x7100426e38) [판독]:
   ```
   ex = RmSoundMan+0x28 객체
   if (핸들 없음 || ex.elapsed(+0x28) >= ex.halfBeat(+0x2C) || (level<0 && ex.count(+0x30) > 3)):
       h = Play("SQ_SE_RC_JUST"); ex.elapsed = 0; count = (level<0 ? 1 : level)
   else:
       if (60/BPM*0.5 < ex.elapsed) h = Play("SQ_SE_RC_JUST")
       count = level<0 ? ex.count+1 : (flag ? max(ex.count, level) : min(ex.count, level))
   ex.count = count; h.WriteLocalVariable(0, count)          // L0
   ```
   `halfBeat` 는 StartModeMainBgm 이 `60/BPM × 0.5` 로 넣는다 [판독]. elapsed 를 늘리는 쪽은 RmSoundMan 파이버로 본다 [추정].
3. 프리셋 `mg1801` 이 `SQ_SE_RC_JUST` 를 `SQ_SE_MG1801_JUST_SOUND` 로 바꾼다 [데이터].
4. 시퀀스(timebase 48 기본, **tempo = G11**(0<G11<1023 아니면 120)):
   - `CHORD_CHECK`: G8 이 코드표에 있으면 `PLAY_<루트>_<종류>_CHORD` 로, 없으면 **fin(무음)**.
   - L1 = 0 부터 단계마다 노트(len 12) 1~2개를 `wait 4` 간격으로 내고, `loop1`: 단계 1 은 무조건, 그 뒤 `L0 ≤ 1` 이면 끝, `loop2`: L0 ≤ 2 면 끝, `loop3`: L0 ≤ 3 이면 끝, `loop4`: L1 ≥ 4 면 끝. 끝은 `wait 96; L10 = 0; fin`.
   - L0 은 매 단계 비교 때 다시 읽으므로, **재생 중에 다음 JUST 가 들어와 L0 이 늘면 아르페지오가 이어진다** [데이터]. 각 단계는 `play_just`(→ CHORD_CHECK)로 돌아가 G8 을 다시 읽으므로 도중에 코드가 바뀌면 다음 단계는 새 코드로 난다 [데이터].
   - 플레이어 `PLY_SE_MG1800_JUST_SOUND` playableSoundMax 1 → 새 재생이 이전 것을 대신한다 [추정].
5. 코드 값: **G8 = 종류×100 + 루트**. 종류 1 장조, 2 단조, 3 도미넌트7, 4 메이저7, 5 마이너7, 7 dim, 8 dim7, 11 aug, 15 6th(뒤 넷은 각 1~2개만). 루트 01=A, 02=A#, 03=B, 04=C, 05=C#, 06=D, 07=D#, 08=E, 09=F, 10=F#, 11=G, 12=G# [데이터: 레이블 `PLAY_A_MAJOR_CHORD`=101 … `PLAY_GS_6_CHORD`=1512].
6. 노트표는 `extracted/audio/mg1801/just_sound_table.json`(64개 코드 × 단계, L0=5 로 끝까지 실행한 결과). 예 101(A): 단계0 E4(64)·A4(69), 1 C#5(73), 2 E5·C#5, 3 E5·A5, 4 C#6·E6.

### 6.6 볼륨·팬 (렌더러 근사) [추정]

렌더러(`tools/sound_seq.py SeqRenderer`)가 쓰는 식. **원본 계산을 판독한 것이 아니다.** 10절 대조에서 BGM 은 원본 녹음과 잘 맞았다.

```
진폭 = (velocity/127)² × (영역 volume/127)² × (트랙 volume/127)² × (volume2/127)² × (main_volume/127)² × 엔벌로프 × (사운드 volume/127)
팬 p = (트랙 pan − 64)/63 + (영역 pan − 64)/63 + init_pan/63, [-1,1] 로 자름;  L = √min(1, 1−p), R = √min(1, 1+p)
피치 = 파형 rate/48000 × 2^((key − originalKey + bend×bendRange/127)/12) × 영역 pitch, 선형 보간
엔벌로프: NW4R 계열(attack 표, decay/release 율, 0.1 dB 단위) — 공개 지식 기반
```

### 6.7 3D 사운드 [판독: 계산 함수 / 미확정: 리스너 값·호출 경로]

nn::atk Sound3DCalculator 로 보이는 함수들(main, 심볼 없음, `analysis/decomp/sound_3d_calc.c`):

| 함수 | 계산 |
|---|---|
| FUN_71005b8858 (볼륨·우선순위) | d = 액터–리스너 거리. `d ≤ maxVolumeDistance(리스너+0x64)` 이면 vol = 1. 아니면 곡선 1(로그): **vol = decayRatio ^ ((d − maxVolDist) / unitDistance(리스너+0x68))**, 곡선 2(선형): **vol = max(0, 1 − (1 − decayRatio)·(d − maxVolDist)/unitDistance)**. 우선순위 감소 = −(int)((1 − vol) × maxPriorityReduction(관리자+0x40)) |
| FUN_71005b8918 → FUN_71005b8ab8 (팬·span) | 리스너 행렬로 액터 위치를 변환, `θ = atan2(x, −z)`. 스피커 각 앞 30°(π/6)·뒤 120°(2π/3) 경계로 구간 선형 팬. interiorSize(리스너+0x60) 안쪽은 거리 비례 축소. 팬 범위 관리자+0x44 |
| FUN_71005b898c (도플러 피치) | 음속(관리자+0x48) 0 이면 1.0. dopplerFactor/32 사용 |
| FUN_71005b8a80 (필터) | d > maxVolDist 이면 `min(maxBiquad(+0x74), (d − maxVolDist)/unitDistance × unitBiquad(+0x70))` |
| FUN_71005b95d8 (3D 파라미터 기본값) | decayRatio 0.5, decayCurve 1, doppler 0 |

호출자로 찾은 것은 FUN_71004fefb0 하나뿐이다(음 위치 − 리스너 위치 거리로 위 4개를 부르고 우선순위를 0..127 로 자른다). 엔진 표준 경로가 어디서 이것을 부르는지와 **리스너 maxVolumeDistance·unitDistance·interiorSize 의 실제 값은 [미확정]**. 프리셋 `P` 레코드(10, 50, 10, 0.5, 1, 0.5)가 후보다 [추정].

mg1801 SE 의 3D 플래그 [데이터]:

| 라벨 | flags | 감쇠 | 팬 | span |
|---|---|---|---|---|
| SQ_SE_MG1801_JUST, SUCCESS, SWING | 0x0C | 없음 | 있음 | 있음 |
| SQ_SE_MG1801_FOOD_FALL_WAT_* | 0x0B | **있음**(로그, decayRatio 0.5) + 우선순위 | 없음 | 있음 |
| SQ_SE_MG1800_COUNT_STICK | 0x1F | 있음 | 있음 | 있음(+필터) |

그래서 판정음은 거리와 무관하게 좌우만, 물보라는 거리 감쇠만 받는다.

### 6.8 스트림·루프

- 스트림 루프: BFSTM `loop` 이면 [loopStart, frameCount) 반복 [데이터]. 예 `SM_BGM_MG1801_DH` 루프 0..2,227,314 (46.402 s).
- 시퀀스 BGM 반복: 음악 트랙이 `…_LoopStart` 로 jump. 반복 구간에 노트가 있으면 반복 BGM(RC_GENERIC: 인트로 384틱 + 1536틱 반복 → BPM 120 에서 2 s + 8 s), 없으면 한 번 연주하는 곡(A: 40 s 뒤 무음) [데이터].

## 7. mg1801 소리 연결 (라벨 → 파일)

`extracted/audio/mg1801/manifest.json` 의 요약. 파일 경로는 그 폴더 기준. "파형" 근거는 모두 [데이터](3.2 경로), 렌더 믹스는 [추정].

| 라벨 | 종류·아카이브 | 파일 | 길이 | 루프 | 호출 근거 |
|---|---|---|---|---|---|
| SQ_BGM_MG1801_A | 시퀀스 subarc_mg1801 | seq/SQ_BGM_MG1801_A.wav (BPM 120) | 40.94 s (곡 40.00 s) | 없음 | [판독] Scene::RmSyncedSetupGame SetGameBgmName |
| SQ_BGM_RC_GENERIC | 시퀀스 rc_cmn | seq/SQ_BGM_RC_GENERIC.wav | 18.0 s | 10.0–18.0 s | [판독] isGenericBgm=1 일 때 |
| SQ_BGM_MG1801_MG_ENDING | 시퀀스 subarc_mg1801 (곡 ID 50) | seq/SQ_BGM_MG1801_MG_ENDING.wav | 4.68 s | 없음 | [판독] SetGameBgmFinName |
| SQ_BGM_RC_CALIBRATION | 시퀀스 rc_cmn | seq/SQ_BGM_RC_CALIBRATION.wav | 6.0 s | 4.0–6.0 s | [미확정] mg1801 사용처 |
| SQ_SE_MG1801_JUST | 시퀀스 3D | seq/…JUST.wav, 파형 wave/subarc_mg1801_war2_001.wav | 0.39 s | — | [판독] Obj::RecieveHit(JUST) |
| SQ_SE_MG1801_SUCCESS | 시퀀스 3D | seq/…SUCCESS.wav, war2_000 | 0.23 s | — | [판독] Obj::RecieveHit(FAST·SLOW) |
| SQ_SE_MG1801_FOOD_FALL_WAT_EXSML/SML/MDL/LRG/EXLRG | 시퀀스 3D | seq/…, war2_003..007 | 0.64/0.73/0.94/0.84/0.88 s (지연 0.17 s 포함) | — | [판독] Obj::EntrySe se_L/S_label |
| SQ_SE_MG1801_JUST_SOUND | 시퀀스 (SQ_SE_RC_JUST 치환) | seq/just_sound/…_G8_<코드>_L0_<1\|5>.wav + just_sound_table.json + war2_008..012 | 가변 | — | [판독+데이터] 6.5 |
| SQ_SE_MG1801_SWING | 시퀀스 3D | seq/…SWING.wav, war2_002 | 0.33 s | — | [데이터, ui 담당] 플레이어 모션 `rhy_knife_swing00` 2프레임 FX 트리거 `RC_RHY_KNIFE_SWING00` → SQ_SE_MG1801_SWING(훅 NDcha_pos). 같은 모션 3프레임 `VO_RHY_KNIFE_SWING00` → 캐릭터 보이스(예 SQ_VOI_PC01_JUMP)는 프리셋 mg1800_cmn 이 `SQ_VOI_PC**_JUMP → MUTE` 로 끈다 |
| SQ_SE_MG1800_COUNT_STICK | 시퀀스 rc_cmn 3D | seq/…COUNT_STICK.wav, rc_cmn war0_001 | 0.19 s | — | [판독] OnGameMain 단계 3 (4회) |
| SM_AMB_MG1801_MG_RESULT | 스트림 subarc_mg1801 | stream/SM_AMB_MG1801_MG_RESULT.wav | 8.0 s | 없음 | [판독] RmMgSceneBase::OnGameEnding @0x7100445620: 결과 단계에서 0.1 s 뒤, 달성률/20 ≥ 0.1 이면 `Play2D("SM_AMB_" + MGList 이름 대문자 + "_MG_RESULT")` |
| SM_JIN_MG1801_MG_RESULT_GOOD | → SM_JIN_RC01_MG_SUCCESS(메인) | stream/SM_JIN_RC01_MG_SUCCESS.wav | 4.63 s | 없음 | [판독] main FUN_7100447a90: RmGameWork+0x2C == 0 이면 `GetStarAchieveJudge() > 1` → `SM_JIN_%s_MG_RESULT_GOOD`, 아니면 `_BAD` 를 Play + [데이터] 프리셋 치환 |
| SM_JIN_MG1801_MG_RESULT_BAD | → SM_JIN_RC01_MG_FAIL | stream/SM_JIN_RC01_MG_FAIL.wav | 3.18 s | 없음 | 같음 |
| SM_BGM_MG1801_DH | 스트림 메인 | stream/SM_BGM_MG1801_DH.wav | 46.40 s | 0–46.40 s | [데이터] 음악 감상 전용 |

플레이어(동시 재생 한도) [데이터]: PLY_BGM_RC 4, PLY_SE_MG1800_JUST 5, PLY_SE_MG1800_SUCCESS 4, PLY_SE_MG1800_ACTION 4, PLY_SE_MG1801_FOOD_FALL_WAT 5, PLY_SE_MG1800_JUST_SOUND 1, PLY_JIN 2, PLY_SE_RC_ND 4.
사운드 volume(u8) [데이터]: BGM_A 26, GENERIC 30, MG_ENDING 24, JUST 56, SUCCESS 58, SWING 77, FOOD_FALL 45, JUST_SOUND 10, COUNT_STICK 60, AMB_RESULT 22, RC01_SUCCESS 38, RC01_FAIL 37, MG1801_DH 105.
**렌더 wav(seq/)에는 사운드 volume 이 곱해져 있고, 스트림 디코드(stream/)에는 곱해져 있지 않다.** 매니페스트 `archiveVolumeLinear` 로 맞춘다.

## 8. 다른 기능과의 상호작용

- **리듬(02_rhythm.md)**: 박자 원천은 G14(5.3), BPM 은 G11, 현재 곡은 G12. 채보 줄 배분은 G14 가 바뀌는 게임 프레임에 일어난다(mg1801.md 3.3). 사운드 쪽 사실: G14 는 오디오 스레드 틱에서 바뀌고, 게임은 60 Hz 프레임에서 읽는다 → 최대 1게임 프레임 + 1틱 지연 [추정].
- **오디오 출력 지연**: 원본 시퀀스 변수는 소리가 스피커로 나가기 **전에**(렌더 큐에 들어갈 때) 바뀐다. 원본이 출력 지연을 보정하는 코드는 찾지 못했다 [미확정].
- **FX 트리거(.ftrg)**: `VB_MG1801_JUST`/`SUCCESS`는 진동 트리거다(→ `bv_vib_mg1801_*.bnvib`, ui 담당). 칼 휘두름 소리는 모션 FX 트리거로 난다(7절 SWING). FX 트리거 SE 는 `bezel_fx_trigger_init.SoundTriggerCount` 512 한도 안에서 같은 bex::sound 재생 경로를 탄다고 본다 [추정].
- **세팅 프리셋**: 장면 전환마다 라벨 치환이 바뀐다. 웹은 장면별 치환표(4.7)를 그대로 쓴다.
- **일시정지**: `SetPauseLevel`, `SoundHandle::Pause_*` 가 있다. 리듬 게임 일시정지 때 시퀀스가 멈추면 G14 도 멈춘다 [추정].
- **정리**: 리듬 종료 FUN_7100426030 이 메인 BGM 정지, 박수 SE 정지, G0..G15 = −1.

## 9. 웹 포팅 구조와 구현 순서

### 9.1 디코드 형식

| 원본 | 웹 | 이유 |
|---|---|---|
| BFSTM DSP-ADPCM | **ogg(Vorbis/Opus) 또는 wav**. 루프 BGM 은 wav 를 먼저 권한다 | 압축 포맷은 인코더 지연(앞쪽 무음 샘플)으로 loopStart 가 어긋날 수 있다. ogg 를 쓰면 디코드 후 길이를 원본 frameCount 와 비교해 확인한다 |
| 시퀀스 BGM | **오프라인 렌더 wav**(이미 생성, BPM 별로 다시 렌더) | 10절 대조에서 원본 녹음과 샘플 상관 0.97. **예외:** 마스터 `SQ_BGM_RC_MAIN_RHYTHM`과 오프닝 `SQ_BGM_RC_MGCMN_OP`는 전역 변수(G8~G14)로 게임 BGM과 주고받으므로 웹 실시간 시퀀서(`script/view/seq.ts`)로 돌린다. 효과음도 실시간 시퀀서(파이썬 렌더와 상관 1.0000) |
| 시퀀스 SE(단음) | 렌더 wav 또는 원본 파형 + 재생 속성 | 무작위(물보라)는 파형 + `playbackRate`·`gain` 무작위로 재현 |
| JUST_SOUND | **파형 + 노트표 소형 시퀀서** | 코드(G8)·콤보(L0)·재생 중 연장이 있어 미리 렌더로는 다 못 담는다 |

BPM 이 120 이 아니면 BGM 을 그 BPM 으로 다시 렌더한다: `python tools/sound_extract_mg1801.py --bpm <BPM>`. (`AudioBufferSourceNode.playbackRate` 로 늘리면 음정이 바뀌므로 쓰지 않는다. 원본은 템포만 바뀐다.)

### 9.2 매니페스트 (웹 `assets/mg1801/manifest.json` 의 sound 절 제안)

```json
{ "sound": {
  "SQ_BGM_MG1801_A": { "file": "sound/SQ_BGM_MG1801_A.wav", "bus": "bgm", "gain": 1.0, "loop": null,
                       "songEndSec": 40.0, "bpm": 120, "songId": 18011, "player": "PLY_BGM_RC" },
  "SQ_BGM_RC_GENERIC": { "file": "...", "loop": { "start": 10.0, "end": 18.0 } },
  "SQ_SE_MG1801_FOOD_FALL_WAT_SML": { "wave": "sound/wave/war2_004.wav", "bus": "se", "gain": 0.233,
      "delaySec": 0.1667, "random": { "semitones": [-3, 3], "volume2": [100, 127] },
      "player": "PLY_SE_MG1801_FOOD_FALL_WAT", "max": 5, "priority": 65, "sound3d": { "flags": "0xb" } },
  "SQ_SE_RC_JUST": { "substituteByScene": { "mg1801": "SQ_SE_MG1801_JUST_SOUND" } }
} }
```

키는 원본 라벨을 그대로 쓴다(web/DESIGN.md 4절). `gain`: 렌더 wav(seq/)는 사운드 volume 까지 곱해져 있어 1.0, 스트림 디코드는 `volume/127`, 원본 파형을 직접 쓰면 6.6 식대로 `volume/127 × (velocity/127)² × (영역 volume/127)²`(물보라 SML: 45/127 × (103/127)² = 0.233) [추정 식]. 변환 도구는 `extracted/audio/mg1801/manifest.json` 에서 이 형식으로 옮기면 된다.

### 9.3 WebAudio 그래프

```
AudioBufferSourceNode ─ GainNode(voice: 사운드 volume × velocity 등) ─ StereoPannerNode(3D 팬) ─ GainNode(3D 감쇠)
   └→ player 단위 GainNode(동시 재생 한도 관리) ─ bus(se | voice | bgm) ─ master ─ destination
```

- `web/script/view/audio.ts` 의 버스 구조(se·voice·bgm → master)는 그대로 쓴다. 더할 것: 라벨 해석(프리셋 치환 → manifest), **player 한도**(`playableSoundMax` 초과 시 같은 플레이어에서 우선순위가 낮거나 같은 가장 오래된 소리를 멈춤 [추정 규칙]), 3D 계산(아래), 루프(`loopStart/loopEnd`).
- `PannerNode`(HRTF/equalpower)는 원본 곡선과 다르다. 6.7 식을 매 프레임 JS 로 계산해 `GainNode.gain`·`StereoPannerNode.pan` 에 넣는다.
- 리버브(`EFFECT_COMMON_ROOM_00`, fxsend)는 파라미터 미확정이라 생략하고 근사 절에 적는다.

### 9.4 3D 근사 (의사코드)

```ts
// 원본: nn::atk Sound3DCalculator (6.7). 리스너 값은 [미확정] → 상수 한 곳에 둔다.
const L = { maxVolumeDistance: 10, unitDistance: 50, interiorSize: 10 }; // 프리셋 P 후보값 [추정]
function vol3d(d: number, s3d: { flags: number; decayRatio: number; decayCurve: number }): number {
  if (!(s3d.flags & 1) || d <= L.maxVolumeDistance) return 1;
  const x = (d - L.maxVolumeDistance) / L.unitDistance;
  return s3d.decayCurve === 1 ? Math.pow(s3d.decayRatio, x) : Math.max(0, 1 - (1 - s3d.decayRatio) * x);
}
function pan3d(posInListener: V3, s3d): number {        // flags & 4 일 때만
  const th = Math.atan2(posInListener.x, -posInListener.z);
  const front = Math.PI / 6;                             // |θ| < 30° 구간은 θ/30° 로 선형 [판독 일부]
  return Math.abs(th) < front ? th / front : Math.sign(th); // 30°~ 구간 세부는 FUN_71005b8ab8 참조
}
```

리스너 = 카메라로 본다(`IsAudioDefaultListenerEnabled`) [추정].

### 9.5 박자 동기 (오디오 시계)

원본에서 게임이 읽는 G14 를 웹에서 같은 규칙으로 만든다.

```ts
// t0 = RC_MAIN_RHYTHM countTrack 의 시작 시각(AudioContext 시계), bpm = G11
const tickSec = 60 / (bpm * 96);
function g14(now = ctx.currentTime): number {             // 1..16, 시작 전 -1
  if (now < t0) return -1;
  const k = Math.floor((now - t0) / tickSec) % 384;
  return 1 + Math.floor(k / 24);
}
// BGM 출발: 요청 뒤 첫 마디 경계 (+ 원본 wait 1 폴링 최대 1틱)
const barSec = 384 * tickSec;
const bgmStart = t0 + Math.ceil((requestTime - t0) / barSec) * barSec;
src.start(bgmStart);
```

주의:
1. 웹 로직은 60 Hz 고정 스텝이다. 오디오 시계를 매 스텝 읽어 g14 를 넘기되, 시험·골든은 "G14 가 바뀐 스텝 번호" 목록을 주입한다(mg1801.md 9.5 와 같은 방침).
2. `ctx.currentTime` 은 렌더 중인 시각이고, 들리는 시각은 `+ ctx.outputLatency`(지원 브라우저) 뒤다. 원본도 변수 변경이 소리보다 앞선다(8절). **원본과 같게 하려면 보정하지 않는다.** 화면·판정을 소리에 맞추고 싶으면 별도 옵션으로 둔다.
3. 원본 틱은 오디오 프레임(5 ms 로 추정) 단위로 처리되어 G14 변화가 최대 5 ms 늦다. 웹은 연속 시계라 이 양자화가 없다. 차이는 1게임 프레임(16.7 ms)보다 작다.
4. 탭 비활성화·일시정지: `AudioContext.suspend()` 하면 `currentTime` 도 멈춘다 — 원본의 시퀀스 일시정지와 같은 효과.
5. 렌더 wav 는 BGM 틱 0 = 파일 0 초다(10절 대조에서 DH 스트림도 같다).

### 9.6 JUST_SOUND 소형 시퀀서 (의사코드)

```ts
// 원본: PlayExcellentSe(-1,true) + SQ_SE_MG1801_JUST_SOUND (6.5)
let h: { start: number; count: number; nextStep: number } | null = null;
function onJust(now: number) {
  const half = 60 / bpm * 0.5;
  if (!h || now - h.start >= half) { h = { start: now, count: 1, nextStep: 0 }; schedule(h); }
  else h.count += 1;                       // 재생 중이면 L0 만 늘려 아르페지오를 잇는다
}
// schedule: 단계 0,1 은 무조건, 단계 s(≥2)는 그 단계 직전에 count ≥ s 일 때만; 노트 간격 4틱(timebase 48, tempo=G11)
// 단계마다 CHORD_CHECK 로 돌아가므로 G8(현재 코드)을 단계마다 다시 읽는다. 표에 없는 G8 이면 그 자리에서 끝(fin)
// 노트 = prg 4 키 영역(64/70/76/82/114 상한 → war2_008..012, originalKey 60/66/72/78/84) 파형을 playbackRate=2^((key-orig)/12)
```

### 9.7 원본 이름 ↔ 웹 권장 이름

| 원본 | 웹 권장 |
|---|---|
| 사운드 전역 변수 G11 / G12 / G13 / G14 / G8 | `bpm` / `currentSongId` / `requestedSongId` / `sixteenthInBar` / `chordCode` |
| 지역 변수 L0 (JUST_SOUND) | `comboCount` |
| L5 (SE) | `sameVoiceCount` [추정 뜻] |
| 플레이어 `PLY_*` / playableSoundMax | `player` / `maxVoices` |
| 사운드 volume(u8) | `gain = volume/127` |
| 3D flags/decayRatio/decayCurve | `sound3d.{flags,decayRatio,decayCurve}` |
| 세팅 프리셋 U 레코드 | `labelSubstitution[scene]` |
| BFSTM loopStart/frameCount | `loop.start/end`(초) |

### 9.8 웹 환경 때문에 바꾸는 부분

| 원본 | 웹 | 동등성 유지 |
|---|---|---|
| 실시간 시퀀서(nn::atk) | 미리 렌더 wav + 소형 시퀀서(JUST_SOUND) | BPM 별 렌더, 노트표 그대로 |
| 엔진 난수(물보라 피치·볼륨) | `Math.random` 또는 시드 난수 | 범위만 같게. 원본 난수 순서는 [미확정] |
| 3D 엔진 | JS 계산 + Gain/StereoPanner | 6.7 식, 리스너 값 상수화 |
| DSP-ADPCM | wav/ogg | 루프 지점 샘플 정확도 확인 |
| 리버브 | 생략 | 근사 절에 기록 |

### 9.9 구현 순서 (권장)

1. 매니페스트 변환 + `AudioOut` 에 라벨 해석·player 한도 추가 → SE 단발 재생.
2. BGM 렌더 wav 재생, `songEndSec`·루프 확인.
3. G14 오디오 시계(9.5) → 리듬 로직(02_rhythm.md)과 연결, 줄 배분 프레임 비교.
4. JUST_SOUND 소형 시퀀서(9.6).
5. 3D 근사(9.4).

## 10. 검증 코드·실행 결과·기대값

| 종류 | 내용 | 결과 |
|---|---|---|
| 파서 실행 | `sound_fsar.py dump` 를 메인 fspj·fsst 396개 전부 | 오류 0. 라벨 검색 `scan` 2 s [실행] |
| 시퀀스 역어셈블 | mg1801·rc_cmn 시퀀스 사운드 전부 `disasm` | 알 수 없는 명령 0 [실행] |
| BFSTM 파싱 | 443개 | 전부 DSP 48 kHz, 리전 82개 [실행] |
| **렌더 vs 원본 녹음** | `seq/SQ_BGM_MG1801_A.wav`(BPM 120) vs `stream/SM_BGM_MG1801_DH.wav`(원본 사전 녹음) 0~20 s | **정규화 상호상관 0.970, 지연 2샘플(0.04 ms)**, 크로마 유사도 0.995(오프셋 0), 온셋 상관 0.977. 2초 구간 RMS 비가 처음부터 끝까지 −2.0~−2.6 dB 로 일정(믹스 균형 일치, 절대 레벨은 다름) [실행: 자체 렌더 vs 원본 녹음] |
| 엔딩 위치 | DH 38 s 이후 vs `seq/SQ_BGM_MG1801_MG_ENDING.wav` | DH **40.000 s** 에서 시작, 상관 0.966 → DH = A(7680틱) + MG_ENDING(다음 마디 경계) [실행] |
| 루프 이음매 | RC_GENERIC 렌더 loopStart 직전 0.1 s vs loopEnd 직전 0.1 s | 차이 RMS 0 (이음매 없음) [실행] |
| 디코드 | vgmstream r2117 `-i` | 스트림 4개 정상, 길이 = frameCount [실행] |

해석과 한계:
- 대조는 BGM 시퀀스 하나와 엔딩에서만 했다. SE·JUST_SOUND 렌더는 원본 녹음이 없어 대조하지 못했다.
- 렌더 엔벌로프·볼륨 곡선은 BGM 대조로 간접 확인된 것이다. 개별 식이 원본과 같다는 뜻은 아니다.
- 프레임 5 ms 처리, 길이 0 노트 = 파형 끝까지, 새 트랙 같은 틱 실행은 렌더러 가정이다. A 대조(지연 2샘플)는 이 가정과 모순되지 않는다.
- 원본 게임 실행 중의 G14 타이밍·BGM 출발 틱은 실행으로 확인하지 않았다(데이터 판독).

재현:
```sh
.venv/Scripts/python tools/sound_extract_mg1801.py --bpm 120           # extracted/audio/mg1801/ 생성(약 3분)
.venv/Scripts/python tools/sound_seq.py disasm <fsst> SQ_BGM_MG1801_A   # 명령 목록
.venv/Scripts/python tools/sound_preset.py show mg1801 mg1801_result mg1800_cmn
.venv/Scripts/python tools/sound_bfstm.py info extracted/romfs/stream/SM_BGM_MG1801_DH.dspadpcm.bfstm
```

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| 프리셋 라벨 치환을 하는 함수·적용 시점(장면 진입? LoadSettingPreset?) | 어느 소리가 나는지 | `LoadSettingPreset` → FUN_71000faf00 판독 |
| 리스너 maxVolumeDistance·unitDistance·interiorSize 값, `P` 레코드 뜻 | 물보라 거리 감쇠, 판정음 팬 | ComListener::Create, FUN_71004fefb0 호출자, 리스너+0x60~0x74 를 쓰는 함수 |
| 3D 엔진 표준 경로(FUN_71005b8858 의 다른 호출 경로) | 3D 적용 대상 | vtable 경유 호출 탐색 |
| L5(같은 소리 수) 를 쓰는 쪽 | SE 음량 감쇠 | bex 재생 경로 FUN_71000c2e50 이하 |
| 사운드 volume(u8) 의 변환(선형/제곱) | 절대 음량 | nn::atk SoundStartable 판독 |
| 시퀀스 처리 주기(5 ms) 와 첫 틱 시점, 같은 틱 트랙 순서 | G14 ±5 ms, BGM 출발 ±1틱 | nn::atk SequenceSoundPlayer 판독 또는 실기 기록 |
| FadeTimePreset 값(FADE_TIME_02 등) | BGM 정지 페이드 | 런타임 표(+0x4E80)를 채우는 로더 |
| G9 뜻, T1(L13) 지연 마디 | 곡 끝 처리 | 리듬 기반 클래스의 지역 변수 쓰기 |
| 엔진 난수(random 접두) 알고리즘 | 물보라 피치 순서 | nn::atk 내부 |
| 리버브(EFFECT_COMMON_ROOM_00) 파라미터 | 음색 | 이펙트 프리셋 데이터 위치 |
| 서브 아카이브 플레이어와 메인 플레이어의 관계 | 동시 재생 한도 | AddOnSoundArchive 적재 경로 |
| Opus 디코더 용도 | 없음(스트림 전부 DSP) | 보이스 아카이브 확인 |
