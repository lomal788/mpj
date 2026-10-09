# 04. 사운드 — bex::sound / nn::atk, 라벨 체계, FSAR·FSEQ·BFSTM, 3D, 웹 재생

2026-10-02. 상태: **분석 진행(데이터 구조·mg1801 소리 경로 확정, 엔진 내부 일부 미확정)**. 웹 구현은 하지 않았다(`web/script/**` 변경 없음).
2026-10-08: 웹 BGM 스트리밍 설계·구현·검증은 12절.
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
| 도구 | `web/tools/analysis/sound_fsar.py`(FSAR), `web/tools/analysis/sound_seq.py`(FSEQ 역어셈블·FBNK·FWAR·FWAV·DSP 디코드·시퀀스 렌더), `web/tools/analysis/sound_bfstm.py`(BFSTM 헤더·리전·점프 설정·vgmstream 디코드), `web/tools/analysis/sound_preset.py`(세팅 프리셋), `web/tools/analysis/sound_extract_mg1801.py`(mg1801 일괄 추출) |
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

### 4.1 FSAR (.fspj / .fsst) [데이터, 파서 `web/tools/analysis/sound_fsar.py`]

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

### 4.2 FSEQ (시퀀스) [데이터, `web/tools/analysis/sound_seq.py disasm`]

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

### 4.5 BFSTM (스트림) [데이터, `web/tools/analysis/sound_bfstm.py`]

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

### 4.7 세팅 프리셋 (.bspp `BSPP`) [데이터, `web/tools/analysis/sound_preset.py`]

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

렌더러(`web/tools/analysis/sound_seq.py SeqRenderer`)가 쓰는 식. **원본 계산을 판독한 것이 아니다.** 10절 대조에서 BGM 은 원본 녹음과 잘 맞았다.

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

BPM 이 120 이 아니면 BGM 을 그 BPM 으로 다시 렌더한다: `python web/tools/analysis/sound_extract_mg1801.py --bpm <BPM>`. (`AudioBufferSourceNode.playbackRate` 로 늘리면 음정이 바뀌므로 쓰지 않는다. 원본은 템포만 바뀐다.)

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
.venv/Scripts/python web/tools/analysis/sound_extract_mg1801.py --bpm 120           # extracted/audio/mg1801/ 생성(약 3분)
.venv/Scripts/python web/tools/analysis/sound_seq.py disasm <fsst> SQ_BGM_MG1801_A   # 명령 목록
.venv/Scripts/python web/tools/analysis/sound_preset.py show mg1801 mg1801_result mg1800_cmn
.venv/Scripts/python web/tools/analysis/sound_bfstm.py info extracted/romfs/stream/SM_BGM_MG1801_DH.dspadpcm.bfstm
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

---

## 12. 웹 BGM 스트리밍 [설계 2026-10-08]

BGM 을 통파일 디코드 대신 **조각 스트리밍**으로 재생한다. 효과음·짧은 징글(SM_JIN·SM_AMB)·음성은 지금처럼 통파일이다.

### 12.1 원본 동작과 웹 대응

| 원본 (nn::atk 스트림 사운드) | 근거 | 웹 |
|---|---|---|
| `romfs/stream/*.bfstm` 을 블록 단위로 조금씩 읽어 DSP-ADPCM 을 풀며 재생 | 4.5절 [데이터] | 4 s 조각(Opus/AAC)을 받는 대로 풀어 `AudioBufferSourceNode` 로 잇는다 |
| 앞부분 미리 읽기 `prefetchFileId`(스트림 상세 0x2201) | 4.1절 [데이터] | 첫 조각만 미리 받기 목록(`flowCatalog`)에 넣는다. 리듬 BGM 은 첫 조각을 미리 풀어 둔다 |
| 반복 = [loopStart, frameCount) 표본 단위 | 6.8절 [데이터] | 조각 경계를 반복 시작·끝 표본에 맞춰 자르고, 반복 본체 조각을 표본 시각으로 다시 예약 |
| 리전(`*_JMP`, RegionSequenceJump) | 4.5절 | 지금 웹 BGM 에는 없다. 조각 배치(12.3)는 "구간 목록"이라 리전도 같은 틀로 넣을 수 있다(미구현) |

### 12.2 지금 웹의 문제 [실행: 파일 크기·길이 측정]

| BGM | 길이 | 풀린 PCM(float32 2ch 48 kHz) | 지금 받는 양(Opus) |
|---|---|---|---|
| `SM_BGM_MENU_MAP`(캐릭터 선택) | 53.4 s | 20.5 MB | 통파일 |
| `SQ_BGM_MG1801_A_120` | 40.9 s | 15.7 MB | 통파일 |
| `SQ_BGM_RC_REMIX_120` | 90.4 s | 34.7 MB | 통파일 |
| mg1801 처음 받는 BGM(BPM 120: A·C·ENDING·INTER_END·GENERIC·CALIBRATION) 합 | — | 약 45 MB | 통파일 6개 |

받기가 끝나야 재생이 시작되고, 풀린 PCM 전체를 메모리에 둔다(모바일 불리).

### 12.3 방식 선택 — 후보 A(조각 + AudioBufferSourceNode 이어 붙이기)

| 후보 | 반복 이음매 | 시작 시각 예약(리듬 동기) | iOS Safari | 판정 |
|---|---|---|---|---|
| **A** 조각 + `AudioBufferSourceNode` | 조각 경계를 반복 표본에 맞추고 오디오 시계로 예약 → 표본 단위 | `start(when, offset)` 오디오 시계 | 모든 판 | **채택** |
| B `HTMLMediaElement` + `MediaElementAudioSourceNode` | `loop` 는 파일 전체만. 구간 반복은 `currentTime` 되감기(이벤트 주기 수십~250 ms)라 틈·겹침 | 미디어 시계가 AudioContext 시계와 따로 → 박자 동기 불가 | 자동 재생·출력 경로 제약 | 탈락 |
| C WebCodecs `AudioDecoder` | 가능 | 가능 | 오디오 디코더가 최근 판에야 들어와 구형 iOS 불가. ogg/mp4 를 직접 풀어야 함(새 의존성 금지) | 탈락 |

근거: 원본 동일성의 핵심은 (1) 반복 표본 정확, (2) 리듬 BGM 시작 시각이 오디오 시계로 정해짐이다. 둘 다 `AudioBufferSourceNode` 예약만 지금 코드와 같은 시계를 쓴다.

### 12.4 조각 배치 (`script/game/lib/bgmstream` `planBgm`, 빌드·런타임 공용)

- 구간: 반복 있으면 인트로 [0, Ls) 와 반복 본체 [Ls, Le), 없으면 [0, frames). Ls·Le 는 명세의 초 값 × rate 를 반올림한 표본(BFSTM 원값과 같음).
- 구간마다 4 s(= 192,000 표본 @48 kHz) 조각. 개수 = max(1, round(구간 / 4 s)), 마지막 조각이 나머지를 품는다(2~6 s).
- **패드**: 조각 파일 = 앞 패드 + 본문 + 뒤 패드. 패드 = 3,840 표본(80 ms, Opus 권장 pre-roll RFC 7845 §4.6, AAC 프레임 1,024·창 2,048 보다 큼). 패드는 재생하지 않고 코덱 가장자리 현상(MDCT 겹침·시작 수렴)을 흡수한다.
- 패드 내용 = **타임라인 이웃**: 인트로 앞 = 무음, 인트로 뒤 = 반복 본체 시작, 반복 본체는 원형(본체 끝 다음 = 본체 시작, 본체 시작 앞 = 본체 끝), 반복 없는 곡의 끝 뒤 = 무음. 이음매 근처 본문이 실제로 이어지는 소리와 함께 인코딩된다.
- 조각 이름: `<원본 경로에서 .wav 뺀 것>.bgm/NNN.wav`(가상 소스 키) → 압축본 `.ogg`·`.m4a`. 통파일 압축본도 그대로 만든다(대체 경로).

### 12.5 압축 빌드 (`tools/build_assets.ts`·`assets_audio.ts`)

- BGM 판별: JSON 명세에서 `.wav` 를 가리키는 `file` 중 라벨(자기 `label` 또는 위 키)에 `BGM` 이 든 것. 반복은 같은 객체의 `loop{startSec,endSec}` 또는 `loopStart/loopEnd`(초). 원본 소스 wav 는 바꾸지 않는다.
- 조각 PCM 은 소스 wav 의 표본 바이트를 그대로 잘라 ffmpeg stdin(raw)으로 넣는다(임시 파일 없음). 인코더 설정은 통파일과 같다(Opus 128 kbps·AAC 160 kbps 스테레오).
- `assets-dist/index.json` 에 `streams{ 소스 경로 → 조각 배치 }` 를 더하고, 조각 가상 경로를 `lossy` 에 넣어 기존 소리 이름 바꿈(`installFetchShim`)·해시 이름이 그대로 돈다. 캐시 키에 반복 표본·배치 판을 넣어 반복 값이 바뀌면 다시 만든다.

### 12.6 재생 일정 (`BgmStream`)

- 타임라인 표본 s 의 오디오 시각 = `anchor + s / rate`(같은 s 는 같은 식 → 같은 double). 항목 k(조각 i, 타임라인 시작 s_k) = `start(t(s_k), pre/rate)`, 끝 t(s_k + len_i) 는 다음 항목의 시작과 같은 값이다. Web Audio 규칙(시작 = when 이상 첫 프레임, 멈춤 = when 미만 프레임까지)으로 **상보** — 틈·겹침 0.
- **경계 교차 10 ms**(구현 중 추가): 앞 항목은 끝 t 에서 10 ms 동안 이득 1 → 0 으로 뒤 패드(= 다음 본문과 같은 소리)를 내고 t + 10 ms 에 멈추고, 다음 항목은 t 에서 0 → 1. 두 이득의 합이 매 프레임 1 이라 무손실이면 출력 = 원본 타임라인(시험 오차 0). 이유: 브라우저가 노드 시작 메시지를 늦게 받아 한 노드가 몇 표본 늦게 시작하면 경계에서 그만큼 잘려 클릭이 나는데(리듬 BGM 은 시퀀서 앞당김 15 ms 안에서 시작 시각을 정해 여유가 작다), 교차가 있으면 다음 경계에서 제시각 노드로 매끄럽게 넘어간다. 교차 길이 ≤ 뒤 패드·앞뒤 본문 절반. 패드가 없는 대체 경로(통파일)는 교차 없이 자른다.
- 반복: 본체 m 번째 바퀴의 조각 j 는 s = 본체 조각 시작 + m·(Le − Ls). 본체 조각 버퍼는 창 안에 있으면 다시 쓴다.
- anchor: 일반 BGM = 첫 조각이 풀린 때 `currentTime + 0.06 s` 를 컨텍스트 프레임에 올림(늦은 시작으로 첫 조각이 밀려 이음매가 어긋나지 않게). 리듬 BGM = 시퀀서가 정한 시각 그대로(12.8).
- 앞당김 창: 시작 시각이 `now + 6 s` 안인 항목만 받고·풀고·예약한다. 다음 항목 조각 바이트는 하나 더 미리 받는다. 펌프 = 250 ms 타이머 + 노드 `ended`.
- 늦은 조각(망 지연): 타임라인을 고정하고 늦은 만큼 건너뛴다(끝이 지났으면 버림, 아니면 `now + 0.06 s` 부터 offset 을 그만큼 더해). 박자·반복 위치가 밀리지 않는다.
- 메모리: 디코드 버퍼는 예약했거나 다음에 예약할 항목의 조각만 둔다. 상한 = (창 6 s + 조각 최대 길이 × 2 + 펌프 주기 0.25 s + 패드) × rate × 채널 × 4 B — 4 s 조각이면 5.7 MB, 마지막 조각이 긴 곡도 6.5 MB 안(48 kHz 2ch). 곡 길이와 무관.
- 정지: `stop(fade)` = 이득 선형 0 → 그 시각에 모든 노드 멈춤·새 예약 없음. `stopAt(t)` = 그 시각 이후 예약 안 함(리듬 ENDPLAY_CHECK_VOLOFF). 반복 없는 곡은 마지막 조각이 끝나면 끝.

### 12.7 코덱 지연과 이음매

- Opus pre-skip(312)·AAC 프라이밍(1,024)은 컨테이너(ogg 헤더·mp4 편집 목록)에 적혀 디코더가 잘라낸다 → 조각 디코드 길이 = 앞 패드 + 본문 + 뒤 패드, 시작 표본 정렬 0(통파일과 같은 성질, assets_pipeline.md §9.4).
- 만일 어떤 브라우저가 잘라내지 못해도 **모든 조각이 같은 표본 수만큼 밀리므로**(패드 3,840 > 1,024) 이음매는 그대로 이어지고 곡 전체가 일정하게 밀린다 — 통파일 재생과 같은 결과.
- [실행: ffmpeg 디코드] AAC 조각 일부는 끝에 121~823 표본이 더 붙어 나온다(마지막 프레임 덧붙임을 편집 목록이 다 못 자름). 앞 정렬은 0 이고 덧붙임은 재생하지 않는 뒤 패드 뒤라 영향 없다. Opus 는 길이가 정확하다.

### 12.8 리듬 BGM (mg1801)

- 결정: **스트리밍한다.** 시작 시각 = 시퀀서 핸드셰이크가 정한 오디오 시각(`acceptRhythm`) 그대로를 anchor 로 쓰고, 조각 k 의 시작 = anchor + s_k / 48000. 통파일 `start(at, 0)` 에서 표본 s 가 울리는 시각과 같은 식이다.
- 조건: 첫 조각이 그 시각 전에 풀려 있어야 한다 → 처음 받는 BPM(120) 곡은 로드 때 첫 조각을 풀어 두고(원본 prefetch), 다른 BPM·리믹스는 요청(`'se'`, 출발 한 마디 전) 때 푼다. 늦으면 지금 통파일과 같은 규칙(늦은 만큼 건너뜀)이라 박자는 밀리지 않는다.
- 진행 시각·`stopAt`·`alive`·G8 코드 진행(시작 시각 기준)은 지금과 같다.
- 메모리: 로드 때 풀어 두는 것이 BPM 120 렌더 6곡 통파일(약 45 MB) → 첫 조각 6개(약 9.8 MB) + 재생 중 스트림 창(≤ 6.5 MB).

### 12.9 개발(원본, `?assets=src`) 모드

- 조각 파일이 없으므로 원본 wav 를 통째로 받아(지금과 같은 키) 헤더를 읽고, **같은 배치(12.4)로 PCM 을 잘라 `AudioBuffer` 를 직접 만든다**(디코드 없음, 무손실). 재생 일정·메모리 상한은 압축 모드와 같다 — 개발 모드에서 이음매를 들으면 일정만의 결과, 압축 모드는 여기에 코덱 영향이 더해진다.
- 압축 모드인데 index 에 조각이 없는 BGM(명세에 BGM 표시가 없던 것)은 통파일을 받아 풀고 같은 일정으로 재생한다(대체 경로).

### 12.10 연결

| 층 | 파일 | 일 |
|---|---|---|
| 재생기(엔진·앱 독립, import 0) | `script/game/lib/bgmstream/index.ts` | 배치 `planBgm`·조각 PCM 범위 `chunkSpans`·wav 헤더·`BgmStream` 일정 |
| 앱 어댑터 | `script/view/bgm.ts` | 소스 만들기(압축 = 조각 bytes 키 → decodeAudioData, 원본 = wav PCM 자르기), `BgmChannel`(라벨 하나 재생·페이드), 미리 받기 키 |
| 페이지 | `charselect_page.ts`(SM_BGM_MENU_MAP, 결정 때 0.5 s 페이드), `plaza_page.ts`(광장 `sound.bgm` 고리 — 지금은 풍선의 정지 `bgm(null)` 만 부름), `mgmet_page.ts`(MgmSound `bgm`/`bgmStop` 고리 — hub 의 PlayBgm, 명세에 BGM 파일이 아직 없어 소리 없음), `games/mg1801/view/sound.ts`(렌더 BGM) | 공용 재생기 하나로 |
| 미리 받기 | `view/flowCatalog.ts` `charselect:sound`(옵션 `bgmKey` ← `appFlow.ts` `bgmPrefetchKey`) | BGM 은 첫 조각 키만(원본 모드는 wav) |
| 화면 모듈 | `shell/charselect/screen.ts` | 소리 미리 받기(preload)에서 BGM 을 뺌 — 어댑터가 첫 조각부터 받는다 |

조사 결과 지금 BGM 을 실제로 내는 곳은 캐릭터 선택(SM_BGM_MENU_MAP)과 mg1801(렌더 BGM)뿐이다. 모드 선택·인원 설정·프리 플레이(mgm01)·온라인·파티 규칙 페이지는 BGM 을 읽는 코드가 없고(효과음만), 그 화면들의 명세에도 BGM 파일이 없다. MgmSound 의 `playBgm` 을 부르는 화면은 mgmet(hub)뿐이라 그 페이지만 고리를 이었다. 광장 UI 부품(`shell/plaza/ui/part.ts`)은 셸 경계상 view 를 못 불러 그대로 둔다(BGM 호출 없음).

### 12.11 AudioContext 표본율이 48 kHz 가 아닐 때

조각 경계 시각은 여전히 상보라 틈·겹침은 없다. 다만 브라우저가 조각마다 다시 표본화하므로(디코드 때 또는 재생 때) 경계 표본은 보간값이다 — 지금 통파일의 `loopStart`(초)도 44.1 kHz 에서는 표본 사이라 같은 성질이다. 컨텍스트를 48 kHz 로 강제할지는 '사용자 확인 필요'.

### 12.12 검증 (`tools/test_bgm_stream.ts`, 노드 — 헤드리스 없음) [실행 2026-10-08, 43/43]

가짜 AudioContext: 예약 기록 + 표본 렌더(시작 = when 이상 첫 프레임, 멈춤 = when 미만, 이득 set·linearRamp). 압축 조각은 ffmpeg 로 풀어 브라우저 디코더 대신 쓴다.

| 항목 | 결과 |
|---|---|
| 배치 | 15곡(캐릭터 선택 1 + mg1801 렌더 14): 빌드 index = 런타임 `planBgm`, 반복 경계 = 조각 경계(SM_BGM_MENU_MAP [114688, 2561415), RC_GENERIC_120 [480000, 864000)), 징글·파형은 조각 없음 |
| 원본 모드 이음매(무손실) | SM_BGM_MENU_MAP 112 s(이음매 28·반복 이음매 2), RC_GENERIC_120 40 s(10·3), RC_CALIBRATION_120 14 s(본체 조각 1개 되풀이 5·4), MG1801_A_120 44 s(9·0): **렌더 = 원본 타임라인 최대 오차 0**, 모든 시각 정수 프레임, 다음 시작 = 앞 끝(같은 double), 늦음·건너뜀 0 |
| 늦은 노드 | 첫 노드 96 표본(2 ms) 늦게 시작: 첫 교차 뒤 오차 0, 이음매 2차 차분 0.086 ≤ 원본 근처 0.119 × 1.5(클릭 없음) |
| 늦은 조각 | 풀기 50 ms 늦음 → 늦음 0. 조각마다 5 s 늦음 → 타임라인 고정 건너뜀(offset = 패드 + 늦은 시간), 반복 위치 그대로 |
| 리듬 BGM 시작 | at = 3.123456789(표본 사이): 조각 k 시작 = at + s_k/48000 편차 0, 표본 사이 위상 차 1.7e−10. at = 정수 프레임: 스트림 렌더 = 지금 방식(통파일 `start(at, 0)`) 렌더 46 s **최대 오차 0** |
| 압축 이음매 | 조각 본문 정렬 어긋남 0(±32 표본 교차 상관, Opus·AAC 모두). 이음매(±256 표본 + 교차 10 ms) 오차 합의 통파일 같은 자리 대비: Opus +0.59 / +0.03 / −0.21 dB(대조 자리 −0.56 / +0.59 / −0.00), AAC +3.09 / +4.06 / +2.58 dB(대조 +1.74 / +4.25 / +0.88). 클릭 지표(2차 차분, 통파일 대비) 최대 1.30배(대조 자리 1.38배) |
| 손실 허용치 | 이음매 오차 ≤ 대조 자리 + 2 dB, 2차 차분 ≤ 통파일 × 1.5. AAC 는 조각 인코딩이 통파일보다 전반적으로 0.4~2.4 dB 낮고(비트 저장소) 조각 시작 0~1,024 표본이 안쪽보다 1~2 dB 낮다 — 패드를 160·320 ms 로 늘려도 0.5 dB 안팎만 나아져 80 ms 로 둔다 |
| 시작까지 받는 양 | 첫 조각: SM_BGM_MENU_MAP 2.39 s — Opus 42 KB(통파일 928 KB)·AAC 54 KB(1,108 KB), MG1801_A_120 57/85 KB(552/827 KB), RC_REMIX_120 58/83 KB(1,372/1,839 KB). 모든 BGM 첫 조각 ≤ 101 KB |
| 메모리 | 풀린 PCM 최대: SM_BGM_MENU_MAP 4.79 MB(통파일 20.49 MB), MG1801_A_120 5.15 MB(15.72), RC_GENERIC_120 4.02 MB(6.91), RC_CALIBRATION_120 2.43 MB(2.30 — 6 s 곡은 이득 없음) |

한계: 실제 브라우저 디코더·`start/stop` 반올림은 노드에서 못 돌린다(헤드리스 금지). 브라우저 쪽은 사람이 들어 보는 체크 목록으로 확인한다(보고).
마지막 페이지 콘솔 확인 1회(개발 서버, 촬영 없음): `?plaza=1&skipsetup=1`·`&assets=dist`·`?charselect=1`·`&assets=dist` 네 페이지 콘솔 오류 0·4xx 0(swiftshader WebGL 경고 1만). 단 `?charselect=1` 은 시작 클릭 전이라 BGM 요청까지는 가지 않았다 — 캐릭터 선택 BGM 스트리밍은 들어 보기로 확인.

### 12.13 사용자 확인 필요

| 항목 | 지금(원본 쪽으로 정한 것) | 선택지 |
|---|---|---|
| AudioContext 표본율 | 페이지마다 기본값(대부분 48 kHz). 44.1 kHz 기기는 브라우저 보간(12.11) | 48 kHz 강제(`new AudioContext({ sampleRate: 48000 })`) — 원본 출력과 같고 경계가 표본 정확해지나, 구형 iOS 동작 확인 필요 |
| AAC(구형 iOS 대체) 조각 음질 | 통파일과 같은 160 kbps | 조각만 192 kbps 로 올리면 통파일과 비슷해질 것 [추정] |
| 조각 길이·창 | 4 s·창 6 s·패드 80 ms·교차 10 ms | 첫 조각을 2 s 로 줄이면 시작 받는 양 절반(요청 수 +1) |
| 리듬 BGM 첫 조각 미리 풀기 | BPM 120 곡 6개(9.8 MB)를 로드 때 | 고른 BPM 곡만 풀기(메모리 ↓, 다른 BPM 은 요청 때) |
| BGM 이 없는 화면들 | ~~고리만~~ → §12.14 로 연결(2026-10-08) | — |
| 리전 스트림(`*_JMP`) | 미구현. 2026-10-08 부터 항구 입구 곡(`*_ENTRANCE_JMP`)이 웹에 들어와 REG_MAIN 을 반복 구간으로 근사(§12.14.4) | 조각 배치를 리전 목록으로 넓히기 |

→ 정정(2026-10-08): "BGM 이 없는 화면들"은 §12.14 로 모두 연결했다.

### 12.14 화면별 원본 BGM [판독 2026-10-08]

근거: 호출 지점 역어셈블 `analysis/decomp/bgm_callsites_dis.c`(도구 `web/tools/analysis/bgm_callsites.py` — `bl` 앞 `mov w1, #N` = FadeTimePreset·BGM 종류) [판독: 어셈블리], menu00 `SoundManager` C `analysis/decomp/bgm_menu00_sound.c`, menu01 `charsel_menu01_sound.c`, main `bgm_main_mgmscene.c`(`MinigameModeScene::CleanupScene`), 볼륨 = fspj, 반복 = BFSTM 헤더. 페이드 초 = FadeTimePreset(mgm_common.md 6.9: 0 = 0.1, 2 = 0.7, 3 = 0.2, 4 = 1.4, 6 = 0.5 s). 모든 원본 재생은 `Play(…, 0.0, label)` = 페이드 인 없음.

#### 12.14.1 곡 [데이터]

| 라벨 | 볼륨(/127) → gain | 길이 | 반복 [Ls, Le) 표본 (초) |
|---|---|---|---|
| `SM_BGM_TITLE` | 40 → 0.315 | 53.310 s | 501,760 → 2,558,901 (10.453 → 53.310) |
| `SM_BGM_MENU` | 28 → 0.2205 | 53.363 s | 114,688 → 2,561,414 (2.389 → 53.363) |
| `SM_BGM_MENU_MAP` | 33 → 0.2598 | 53.363 s | 114,688 → 2,561,415 |
| `SM_BGM_MATCHING` | 35 → 0.2756 | 34.091 s | 100,352 → 1,636,354 (2.091 → 34.091) |
| `SM_JIN_MGMET_OPENING` | 46 → 0.3622 | 9.658 s | 없음(한 번) |
| `SM_BGM_MGMET_ENTRANCE_JMP`·`_NOINTRO_JMP`(같은 파일) | 29 → 0.2283 | 파일 89.548 s | 리전 REG_MAIN 176,883 → 2,303,656 (3.685 → 47.993) 을 반복 구간으로 [추정] |
| `SM_BGM_MGM01_FREEPLAY` | 53 → 0.4173 | 65.050 s | 286,720 → 3,122,412 (5.973 → 65.050) |
| `SM_JIN_MGM01_FREEPLAY_ENDSTINGER` | 36 → 0.2835 | 2.992 s | 없음 |

#### 12.14.2 화면별 재생·전환 [판독]

| 웹 화면 | 원본 | 시작 | 전환·정지 |
|---|---|---|---|
| 인원 설정(광장 앞) | menu00 `SequenceFront::SettingPlayerImpl` — 타이틀(op `ComUiTitle::In`)의 `SM_BGM_TITLE` 이 이어짐 | `SM_BGM_TITLE`(웹은 타이틀 화면이 없어 여기서 처음부터) | `~SequenceFront` `StopBgmTitle(2)` **0.7 s** |
| 캐릭터 선택(인원 설정 안) | 같은 `ComUiSettingPlayer` | 바꾸지 않음(TITLE 이어짐) | — |
| 광장 | menu00 `SequenceMainMenu::MainImpl`·`SequenceEntrance` → `PlayBgmMenu`(핸들 없을 때만) | `SM_BGM_MENU` (+ 3D 층 `SM_BGM_MENU_RHYTHM` — 웹 생략, 12.14.3) | 기구 `TakeOffImpl` `StopBgm(2)` **0.7 s**, 세션 출발 `PlaySessionFiber` `StopBgm(6)` **0.5 s** |
| 모드 선택 | menu01 `SequenceManager::Initialize` → `PlayBgm`(핸들 없을 때만) | `SM_BGM_MENU_MAP` | 모드 결정 `StartAnimImpl` `StopBgm(6)` **0.5 s**(Pa 만 4 = 1.4 s), 광장으로 `CheckExitImpl` 6 = **0.5 s** |
| 캐릭터 선택·파티 규칙(모드 메뉴 쪽) | menu01 같은 장면 | `SM_BGM_MENU_MAP` **이어 재생**(끊지 않음) | 출발 `StartAnimImpl` 6 = **0.5 s**(charselect.md 12.3 의 근사 0.5 s 와 같음), 뒤로 = 이어짐 |
| 온라인 friend·대기실 | menu00 광장 위 UI | `SM_BGM_MENU` 이어짐 | 광장과 같음 |
| 온라인 world | matching00 `Scene::GameFlow` | `SM_BGM_MATCHING` | `Scene::StopBgm`·`CleanupGame` `Stop_Preset(2)` **0.7 s** |
| 항구 | mgmet `InitOp` `PlayBgm(0)`, `StartEventFlow` `PlayBgm(1)`, `ModeSelectCameraIdle` `IsPlayBgm()` 거짓이면 `PlayBgm(2)` | 첫 방문 `SM_JIN_MGMET_OPENING` → `ENTRANCE_JMP`(징글 즉시 끊음), 프리 플레이에서 돌아오면 `ENTRANCE_NOINTRO_JMP` | 프리 플레이 출발 `FreeplayAfterFlow` `StopBgm(2)` **0.7 s**, 장면 떠남 `CleanupScene` `Stop_Preset(2)` **0.7 s** |
| 프리 플레이 | mgm01 `StartFlow`·`ContinueFlow` `PlayBgm(4)`, `MgStartFlow` `StopBgm(3)`+`PlayBgm(5)`, `ExitFlow` `StopBgm(2)` | `SM_BGM_MGM01_FREEPLAY`(한 판 뒤에도 처음부터) | 한 판 출발 **0.2 s** + `SM_JIN_MGM01_FREEPLAY_ENDSTINGER`, 항구로 **0.7 s** |

- 같은 곡 이어 재생: menu00 `PlayBgmMenu`·menu01 `PlayBgm` 은 핸들이 붙어 있으면 다시 틀지 않는다 → menu01 안 화면들(모드 선택·캐릭터 선택·파티 규칙)은 곡이 이어진다. 장면이 바뀌면 앞 장면이 먼저 멈춘다. 웹은 흐름 전체에 BGM 채널 하나(`view/bgm.ts` `appBgm()`, 공유 AudioContext)를 두고 같은 라벨이면 그대로 둔다.
- 광장 곡은 시간대·장식으로 바뀌지 않는다: `PlayBgmMenu` 는 고정 라벨만 쓴다 [판독]. 바뀌는 건 음악 상점에서 고른 곡(`SequenceMusic`)뿐 — 웹 범위 밖.

#### 12.14.3 웹 연결 [설계]

- 곡 명세: `assets/common/sound/bgm.json`(라벨 → file·gain·loopStart/loopEnd 초) + wav. 캐릭터 선택 명세 `bgm.file` 도 `../common/sound/SM_BGM_MENU_MAP.wav`(한 파일). 변환 도구 `web/tools/analysis/shell_bgm_assets.py`.
- 화면 규칙: `script/view/screenBgm.ts` `SCREEN_BGM`(위 표의 시작 라벨·나가기 페이드)을 페이지가 쓴다. 항구·프리 플레이는 MgmSound `playBgm(kind)` → `mgmBgmHooks` → `appBgm()`.
- 미리 받기: `flowCatalog` 묶음 `bgm:<라벨>`(첫 조각), `flowTable` 의 화면 own/predict.

검증 [실행 2026-10-08]: `npx tsx tools/test_shell_bgm.ts` 62/62 — 라벨 9개 → 명세·소스·압축본(통파일·조각) 없는 파일 0, 반복 = BFSTM 헤더(항구 = 리전 REG_MAIN)·빌드 index 반복 일치, gain = 볼륨/127, 가짜 AudioContext 로 화면 25단계 전환(같은 장면 안 이어 재생 = 같은 스트림, 새 곡 = 조각 0 부터 지금 + 0.06 s, 페이드 0.7/0.5/0.2 s·즉시 끊김이 판독값과 같음), 미리 받기 `bgm:<라벨>` = 첫 조각 키·flowTable. 페이지 콘솔 확인 1회(광장 dist·인원 설정 dist·모드 선택 src): 오류·4xx 0, BGM 조각 200.

#### 12.14.4 사용자 확인 필요

| 항목 | 정한 것 |
|---|---|
| 웹 인원 설정의 곡 | 원본처럼 `SM_BGM_TITLE`(타이틀 화면이 없어 설정 시작에서 처음부터) |
| 항구 `*_JMP` 리전 곡 | 리전 판독·구현 안 함. REG_MAIN 구간을 반복 구간으로 씀(인트로 3.685 s 1회 → REG_MAIN 반복) [추정]. NOINTRO 도 같은 명세(인트로부터) |
| 광장 3D 층 `SM_BGM_MENU_RHYTHM`(음악 상점 위치 Play3D, 볼륨 27) | 생략 — 2D `SM_BGM_MENU` 만 |
| 덕킹(인원 설정 `ST_DUCKING_ON_SETTING`, 프렌드 메뉴, 메시지 창 0x0d·0x13) | 생략 |
| 흐름 끝(취소)·dev/ui.html 화면 바꾸기 | 0.5 s 페이드로 멈춤 [설계] |

---

## 13. 웹 런타임 계약 [2026-10-09, sound-runtime]

공용 사운드 런타임(로드맵 B6 ①②)과 게임 경로 소비자 이전. 기본값은 **원본 규칙**(사용자 결정, 캐릭터 [09 §14](09_character.md)·이펙트 [08 §14](08_effects.md) 와 같은 방식). 셸 화면 20여 개(`MgmSound`·화면별 `AudioBuffer` 맵)·캐릭터 효과음/보이스 파일 변환은 이번 범위 밖이다. BGM 스트리밍(§12, `lib/bgmstream`·`view/bgm.ts`)은 바꾸지 않고 재생기 하나(목소리 처리기)로 꽂는다.

### 13.1 계층

| 층 | 파일 | import | 하는 일 |
|---|---|---|---|
| 코어 | `script/game/lib/sound/index.ts` | 0 | 라벨 → 정의 해석(세팅 프리셋 치환), SoundHandle(칸 + 세대)·수명, 플레이어 한도·우선순위, 소리 그룹 소속(정지·덕킹), FadeTimePreset 표, 3D 계산(§6.7, `view/audio.ts` 에서 옮김), 시퀀스 엔진 난수(LCG). **숫자·명령만** 낸다. 시간(오디오 시각)·난수는 주입, `Math.random`·벽시계 없음 |
| WebAudio 어댑터 | `script/game/lib/sound-webaudio/index.ts` | 코어만 | 명령 → 핸들 하나 = `GainNode`(핸들 음량: 3D·덕킹·SetVolume) → (팬이 있을 때만 `StereoPannerNode`) → 버스. 소리 재생 자체는 **목소리 처리기**(꽂기): 내장 `buffer`(AudioBufferSourceNode, 반복·늦은 시작), 디코드 캐시 `DecodeCache`(받기·풀기 주입) |
| mpj 연결 | `script/view/sound.ts` | 코어·어댑터·`view/audio`·`view/bgm`·`view/appAssets` | `soundSystem(audio)` = `AudioOut` 하나에 코어·어댑터 하나(같은 페이지의 틀 소리·게임 소리가 핸들·그룹·한도를 같이 쓴다). 디코드 캐시 = 로더 관리자 `bytes`(압축 모드 소리 이름 바꿈 shim 통과) + 전역 디코드 맵 하나. 처리기 `buffer`·`bgmstream`(§12 재생기), 시퀀서 처리기는 소비자가 꽂는다 |
| 소비자 | `view/mgsceneSound.ts`(틀 소리 `MgSceneSound`), `games/rhythm/view/sound.ts`(`RmSoundMap`, mg1801 view 가 씀), `view/character.ts` `routeCharacterEvents`(se·voice 라벨 사건) | — | 사건 → 코어 `play/stop/stopGroup` |
| 로직(사건만) | `shell/mgscene/sound.ts`(`MgSound`), `games/rhythm/soundMan.ts`(`RmSoundMan`) | 코어 표만(`fadeTimeSec`) | 원본 MGSound·RmSoundMan 상태 → 사건. 소리 재생·핸들은 모른다 |
| 보기 | `script/sound_page.ts`(`dev/ui?ui=sound`) | — | 라벨 재생·정지, 그룹, 덕킹, 3D 위치, 원본 스위치, 핸들 목록·사건 로그 |

`view/audio.ts` `AudioOut`(버스·`load`·`play`·`track`·`stopAll`·`setMuted`)은 그대로다 — 셸 화면이 계속 쓸 수 있다. `calc3d`·`Listener3d`·`Sound3dInfo`·`SOUND3D_MANAGER`·`Ambient3d` 는 코어로 옮기고 `view/audio.ts` 가 같은 이름으로 다시 내보낸다.

### 13.2 API

코어(`lib/sound`):

| 이름 | 원본 | 뜻 |
|---|---|---|
| `SoundCatalog(rules)` · `define(label, def)` · `substitute(src, dst, preset)` · `loadPreset(name)` · `resolve(label)` | 아카이브 STRG/INFO(§3.2) + 세팅 프리셋 U 레코드(§4.7) | 라벨 표 하나(웹 manifest 하나). `def = {kind, bus, player, playerMax, priority, sound3d, voice, payload}` — `voice`·`payload` 는 어댑터 처리기 이름과 그 자료(코어는 보지 않음) |
| `SoundCore({rules, now, probe})` · `play(cat, label, opts) → h` | `SoundModule::Play / Play2D / Play3D` | `opts = {pos, priority, payload, at, local, flags, voice, onAdmit}`(`voice` = 처리기 덮기, `onAdmit` = 한도 통과 뒤·시작 명령 전 — 웹 규칙의 BGM 끼리 정지 자리). 실패(라벨 없음·한도 거절) = 0. `probe(h)` = 어댑터가 목소리가 살아 있는지 바로 답한다(한도 판정 때 끝난 소리를 먼저 비운다 — 이전 리듬 코드와 같은 시점) |
| `stop(h, fadeSec)` · `stopAt(h, t)` · `pause(h, on, fadeSec)` · `setVolume(h, v, fadeSec)` · `writeLocal(h, i, v)` · `setPosition(h, pos)` | `SoundHandle::Stop_Time·Pause·SetVolume·WriteLocalVariable`, `Play3DHookPosition` | 핸들이 낡았으면(세대 다름) 아무 일 없음 |
| `alive(h)` · `label(h)` · `target(h)` · `forEach(fn, cat?)` · `find(label, cat?)` | `SoundHandle::IsAttached` | 핸들 = `세대 × 1024 + 칸`, 0 = 없음 |
| `stopGroup(group, fadeSec)` · `duckGroup(group, on, preset = group)` · `duckValue(group)` | `StopGroup_Type`, `DuckingGroup` | 소속 = 13.4 표 |
| `ended(h)` | (사운드 스레드가 끝을 알림) | 어댑터가 목소리가 끝났다고 알리면 칸을 비우고 세대 + 1 |
| `update()` | 사운드 프레임 갱신 | 덕킹 진행, (원본 규칙) 3D 다시 계산 |
| `drain(fn)` | — | 쌓인 명령 `{op: start/stop/stopAt/gain/pan/pause/local, h, …}` 를 넘기고 비운다(명령 객체는 다시 씀) |
| `calc3d(listeners, info, pos, f32)` · `calc3dInto(out, …)` | §6.7 FUN_71005b8858·8918·8ab8 | f64 = `view/audio.ts` 의 식을 글자 그대로 옮김(웹 규칙), f32 = 같은 식을 연산마다 `Math.fround`(원본 규칙, 할당 없음) |
| `SoundRandom` | FUN_71005df19c(13.10) | `range(min,max)`·`randvar(n)`·`frame(t)` |
| `FADE_TIME_PRESET`·`fadeTimeSec(name)`·`DUCKING_PRESET`·`soundGroupsOf(label, kind)` | [mgm_common 6.9](../shell/mgm_common.md) | 표 |
| `RULES_WEB`·`RULES_ORIGINAL`·`soundDefaults` | — | 13.4 |

어댑터(`lib/sound-webaudio`): `WebAudioSoundOut(ctx, {bus(name), track?(src)})` · `register(name, VoiceFactory)` · `apply(core)`(명령 비우기 → 노드) · `poll(core)`(끝난 목소리 → `core.ended`) · `handleNode(h)`. `VoiceFactory.start(cmd, out) → Voice {alive, stop(fade), stopAt?, setLocal?, pause?, setPan?, ownsPan?}`. `DecodeCache(bytes, decode, onError)` · `get(key) / peek(key)` · `stats`. 내장 처리기 `bufferVoiceFactory(cache, keyOf)`: 자료 `{url, gain?, loop?, durationSec?, late: 'skip' | 'wait', at?}` — skip = 시작 시각이 지났으면 늦은 만큼 건너뜀(리듬 이전 `startFile` 그대로), wait = 풀리는 대로 처음부터(틀 SE 이전 `AudioOut.load().then(play)` 그대로, 늘 한 마이크로태스크 뒤).

mpj 연결(`view/sound.ts`): `soundSystem(audio) → MpjSound {audio, core, out, decode, random, rules, play, stop, flush, update, key, load, peek, stream}` · 처리기 `buffer`(`DecodeCache` 전역 하나)·`bgmstream`(§12 `bgmSource`·`playBgmStream`, 자료 `{source?, url?, loop?, gain?, owner?, at?, resume?}`) · `decodeCache(ctx)`.

### 13.3 소비자 이전

| 소비자 | 전 | 후 | 바뀌지 않는 것 |
|---|---|---|---|
| `view/mgsceneSound.ts` `MgSceneSound` | SE·보이스 = `AudioOut.load/play`(핸들 없음), BGM·징글 = `BgmChannel` 두 개(출력 = `ctx.destination`), 그룹 정지 = 0x22·0x20 만 채널 정지 | 표마다 `SoundCatalog`, SE·보이스 = `buffer` 처리기, BGM·징글 = `bgmstream` 처리기 핸들 두 칸(같은 라벨이면 그대로), 그룹 정지 = 코어 `stopGroup`(원본 규칙) | `load(audio, sources)`·`onEvents`·`log`·`dispose` |
| `games/rhythm/view/sound.ts` `RmSoundMap`(mg1801 view) | 자체 핸들 집합·`admit`·`resolve`·`calc3d`·`startFile`·`fetch`(AudioOut.load) | 핸들·한도·치환·3D = 코어, 파일 = `buffer`·`bgmstream` 처리기, 시퀀스 = 이 파일이 꽂는 시퀀서 처리기(전역 변수 G0..G15 를 같이 쓰는 `SeqEngine` 하나), 핸드셰이크 BGM = 이 파일이 꽂는 처리기(요청부터 출발·끝까지 핸들 하나, 출발 때 `bgmstream` 재생기를 그 시각에 연다) | 리듬 핸드셰이크(G10·G12·G13), 전역 변수 기록·`observe`, 공개 API(`load`·`onEvent`·`playJust`·`observe`·`stopBgm`) |
| `games/rhythm/soundMan.ts` | 로직(사건만) | 그대로. 경계: 로직은 핸들을 모르고 `justSound{combo, play}`·`se`·`soundStop` 사건만 낸다. PlayExcellentSe 의 핸들 수명 근사(그 파일 주석)는 로직 쪽에 남는다 — 실제 핸들 수명은 코어가 안다 | — |
| `shell/mgscene/sound.ts` `MgSound` | `FADE_PRESET_SEC` 한 칸 | 코어 `fadeTimeSec`(6.9 표 전체, 모르는 이름 0.7) | 사건 형식 |
| `games/mg1801/view/index.ts` | `RmSoundMap` 사용 | 그대로(파일 무수정) — 내부가 코어로 간다 | — |
| `view/character.ts` `routeCharacterEvents` | `sound.onEvents([{k, label}])` | 그대로 `MgSceneSound` 로 → 코어 해석(파일 없음 = 라벨 사건까지) | — |

미룬 것(1차): 셸 화면 `MgmSound`·화면별 `AudioBuffer` 맵, 메시지 창 덕킹 → **2차(13.11)에서 연결**. 아직 미룬 것: 캐릭터 효과음·보이스·발소리 파일 변환, 리전 점프(`*_JMP`) — 별도 결정.

2차 이전(13.11):

| 소비자 | 전 | 후 | 바뀌지 않는 것 |
|---|---|---|---|
| `mgm01_page`(목록·설정·필터·기록·announce), `mgmet_page`(허브·활동 제목·rule), `online_page`, `partyrule_page`, `setplayer_page`, `modeselect_page`, `mgmcommon_page`, `mgmscreens_page` | 페이지마다 `new AudioContext()` + `AudioBuffer` 맵 + `playSe`(팬 노드 있는 것·없는 것 두 벌), 출력 `ctx.destination` | `view/sound.ts` `shellSound({muted, pan2d})` 하나 — 페이지 흐름 공용 `appAudio()`(AudioOut 하나)·코어 하나·디코드 캐시 하나. `MgmSound` 어댑터 = `shellSound(…).mgm(hooks)` | 화면 모듈·`MgmSound` API·화면 공개 API |
| `charselect_page` | 같은 AudioContext 에 SE·슬롯 보이스(슬롯마다 하나, 요청 번호로 늦은 디코드 버림)·미리 받기 | SE·보이스 = `shellSound` 의 `play`·`voice(slot)`·`voiceStop`·`preload` — 보이스 슬롯 = 코어 핸들 하나 | 선택 보이스 규칙(슬롯마다 하나, 정지 뒤 늦게 풀린 것 무시) |
| `plaza_page`·`shell/plaza/ui/part.ts` | 페이지 AudioContext(광장 SE)·부품 자체 AudioContext(UI SE) | 둘 다 `shellSound`. 부품은 셸 경계상 view 를 못 부르므로 `PlazaContext.sound.play` 고리(페이지가 넣음)를 쓰고, 없으면 예전 길 | 부품 import |
| 메시지 창(`mgmcommon/messageWindow`·`guides` → `MgmSound.duck/voice/vibrate`) | 어댑터 고리 없음(무시) | `duck` → 코어 `duckGroup`(DUCKING_PRESET) + 앱 BGM 덕킹 노드, `vibrate` → 조작 플레이어 패드 rumble, `voice` → 사건 기록·라벨 해석 자리(파일 없음) | 사건 형식 |
| 앱 BGM(`view/bgm.ts` `appBgm`) | 자체 `new AudioContext()`, 출력 `destination` | 컨텍스트 = `appAudio()` 와 같은 것, 출력 = 사운드 연결의 BGM 덕킹 GainNode → destination | 곡·조각 재생·화면 규칙(`screenBgm`) 그대로 |
| `main.ts` 게임 실행 | `audio ??= new AudioOut()` | `audio ??= appAudio() ?? new AudioOut()` — 광장 → 프리 플레이 → 게임이 같은 코어 | 오디오 시계·`heardTime`·`?avlat` |

### 13.4 원본 스위치

`RULES_WEB` = 이전 전 웹 결과 그대로(골든 같음), `RULES_ORIGINAL` = 원본(기본).

| 항목 | 웹 근사(`RULES_WEB`) | 원본(`RULES_ORIGINAL`) | 근거 |
|---|---|---|---|
| `groups` 그룹 정지 | 틀 소리만: 0x22 → MG BGM 채널(사건 초), 0x20 → MG BGM·징글 0.7 s, 그 밖 무시. 게임 소리는 화면을 버릴 때 멈춤 | 소속 규칙으로 **같은 코어의 모든 살아 있는 핸들**(틀 + 게임)을 사건 초로 페이드 정지 | [판독] mgm_common 6.9 소속 표(FUN_71000c4730·FUN_71000c3dcc) |
| 그룹 소속 0x00~0x1f | — | 사운드 사용자 파라미터 비트 29 칸. 웹 명세에 값이 없어 라벨 접두로 대신: `SQ_SE` → 0x01, `SQ_VOI` → 0x02 | [데이터] 6.9 fspj 집계(SQ_SE 2,089 전부 0x01). 나머지 비트는 [미확정] |
| `random` 시퀀스 엔진 난수 | `Math.random` | nn::atk LCG `u = u·0x19660D + 0x3C6EF35F`, 값 = u >> 16, 초기 `0x12345678`. random 인자 = `min + ((r·(max−min+1)) >> 16)`, randvar = `±((r·(|n|+1)) >> 16)`, 사운드 프레임(5 ms)마다 1회 더 소비 | [판독, 새로] 13.10 |
| `supersede` BGM 끼리 | 새 SQ_BGM/SM_BGM 이 시작하면 반복하는 이전 BGM 을 **지금** 멈춤 | 그런 규칙 없음 — 리듬 BGM 은 핸드셰이크(ENDPLAY_CHECK_VOLOFF)가 정한 시각 `stopAt`, 그 밖은 플레이어 한도·명시 정지만 | [데이터] §5.3 시퀀스 골격, 웹 쪽은 리듬 sound.ts 머리 "[근사: 즉시]" |
| `instanceLimit` 아카이브 전체 한도 | 없음 | 시퀀스 64·스트림 6·웨이브 16(넘치면 플레이어 한도와 같은 우선순위 규칙) | [데이터] 플레이어 최대치 0x220B(§4.1). 넘칠 때 규칙은 [추정: nn::atk 공개 동작] |
| `resolve` 프리셋 치환 | 같은 이름만, 치환 대상이 명세에 있을 때만 | `**` 를 두 글자 와일드카드로 맞추고 같은 글자를 대상에 넣음(`SQ_VOI_PC**_JUMP` → `SQ_VOI_PC01_MUTE`). 대상이 명세에 없으면 원래 라벨(웹 명세는 치환된 파일을 원래 라벨 아래 두기도 한다: mg1801 `SM_JIN_MG1801_MG_RESULT_GOOD` = `SM_JIN_RC01_MG_SUCCESS.wav`) | [데이터] 프리셋 레코드 이름 쌍(§4.7). 치환 함수 판독 안 함 → [추정]. 처음엔 "대상이 없어도 치환(= 무음)"으로 적었으나 골든에서 결과 징글이 사라져 고쳤다(13.7) |
| `track3d` 3D 갱신 | 재생할 때 한 번 | 살아 있는 3D 핸들을 `update()` 마다 다시 계산(`setPosition`·리스너 바뀜 반영) | [판독] §6.7 계산 함수, 프레임마다 부르는 것은 [추정: nn::atk Sound3DEngine] |
| `f32` | 3D 식 f64 | 3D 식 `Math.fround` | 원본 float 산술 |
| FadeTimePreset | 틀 `MgSound` 이 `FADE_TIME_02` 만 0.7 | 6.9 표 전체(0 = 0.1 … 10 = 10.0 s) | [판독] mgm_common 6.9. 지금 데이터(`mg_bgm_stop_fade` 전부 `FADE_TIME_02`)에서는 값이 같다 — 로직이라 스위치 없이 표를 쓴다 |
| `meta` 원본 사운드 정보(2차) | 그룹 0x00~0x1f = 라벨 접두, 셸 SE 는 플레이어 한도 없음 | `assets/common/sound/meta.json`(fspj·서브 아카이브 INFO 에서 뽑음): 그룹 비트 = 사용자 파라미터 비트 29 값, 플레이어 이름·playableSoundMax·플레이어 우선순위. 명세에 없는 라벨만 접두 근사 | [데이터] 6.9(색인 2 = 사용자 파라미터 비트 29), 13.11 |
| `shellHooks` 메시지·시스템 고리(2차) | 연결 안 함(이전 그대로) | 메시지 덕킹(창 열림 0x13·선택지 0x0d·닫힘 해제) → 코어 + 앱 BGM, 진동 → 패드 rumble, 보이스 → 사건 | [판독] message_window.md 5·6.4·6.5·7, mgm_common 6.9 |
| 틀 단계 16 `StopGroup_Type(0x20, 6)` 초 | 사건 `sec: 0`(웹 소리는 0.7 로 무시) | 사건 `sec` = FadeTimePreset 6 = 0.5 s | [판독] [minigame_scene §6](../shell/minigame_scene.md) 단계 16 |

규칙과 무관하게 바뀌는 것: 틀 BGM·징글 출력이 `ctx.destination` 직결 → `AudioOut` 의 bgm 버스(음소거 체크가 먹는다). 경로 이득 곱은 1 이라 골든 무관.

플레이어 한도(`playableSoundMax`)·우선순위는 두 규칙이 같다: 같은 플레이어 소리가 한도면 우선순위가 가장 낮은(같으면 가장 오래된) 소리와 비교해, 새 소리가 더 낮으면 내지 않고 아니면 그 소리를 멈춘다 [추정: nn::atk 공개 동작 — 리듬 sound.ts 의 이전 규칙 그대로]. 3D 우선순위 감소(§6.7)를 더한 값으로 비교한다.

### 13.5 디코드 캐시

- 키 = 로더 관리자 논리 키(`assetKeyOf(url)`, web/assets 기준 소스 경로 — 압축 모드에서도 `.wav` 이름). 받기 = `appAssets().get(key, 'bytes')`(전역 fetch shim 이 `.wav` → `.ogg/.m4a/.flac`·해시 이름으로 바꿈, §12.5·assets_pipeline), 풀기 = `decodeAudioData`(바이트를 복사해 넘김 — 관리자가 든 원본이 떼어지지 않게). 키가 없는 URL 은 URL 그대로 fetch.
- 풀린 `AudioBuffer` 는 전역 맵 하나(`globalThis` — 번들이 나뉘어도 하나)에 표본율마다 키로 둔다. 같은 파일을 소비자·판·AudioOut 마다 다시 받고 풀지 않는다(13.7 측정).
- 풀기는 표본율마다 `OfflineAudioContext(1, 1, rate)` 하나로 한다 — 시험 페이지처럼 `AudioOut` 을 판마다 만들고 닫아도(닫힌 컨텍스트) 캐시가 계속 쓰인다. 없으면 그 페이지 컨텍스트로.
- BGM 조각(§12)은 `bgmstream` 이 그대로 받는다(바꾸지 않음).

### 13.6 결정성·할당

- 코어는 `Math.random`·`performance.now`·`Date` 를 쓰지 않는다. 시각 = 생성 때 주입한 `now()`(mpj 연결 = `ctx.currentTime`), 난수 = `SoundRandom`(원본 규칙) — 소리 쪽 값이라 로직에 들어가지 않는다([minigame_scene §12.12.6](../shell/minigame_scene.md) 6번 예외: 리듬 사운드 관측 G14·G12·L0 만).
- f32 는 3D 식(원본 규칙). 웹 규칙은 옮기기 전 f64 식을 글자 그대로 쓴다(골든 같음).
- 할당: `update()`·`drain()` 은 정상 상태 할당 0(명령 객체 풀, 핸들 칸 배열 고정). `play` 는 핸들 칸·명령 객체를 다시 쓴다.

### 13.7 검증 [실행 2026-10-09, 노드만 — 헤드리스·촬영 없음]

**시험 `tools/test_sound.ts` 77/77**: 해석(mg1801 manifest 치환 41줄·와일드카드·대상 없음), 핸들(칸·세대·낡은 핸들·표 거르기), 그룹 소속(SQ_SE·SM_BGM·SM_JIN·SQ_VOI·SM_AMB)·FadeAndEntryCancel = 징글만 남음, FadeTimePreset 표, 덕킹(0x0d 0.6 배 0.3 s·중간 값 선형·해제), 3D(옮긴 calc3d = view/audio 다시 내보냄, 감쇠 곡선 1·2, 팬 θ/30°·0.9, 출력 리스너 둘이면 팬 0, f32 1e-6 안), 동시 발음(플레이어 한도·거절·3D 우선순위 감소·아카이브 한도 웹 65/원본 64), 엔진 난수(LCG·random 인자·randvar·advance·5 ms 프레임), 결정성, 어댑터(핸들 노드·팬 노드·명령·끝 판정·SetVolume 램프·디코드 캐시 1회·늦은 시작 offset·시작 전 페이드 정지·pause), import 경계·정적 검사, 할당(원본 규칙 3D 핸들 24개 `update()+drain()` 스텝당 0.00 B), 골든 10(자식 프로세스).

**골든 `tools/sound_golden.ts`.** 가짜 AudioContext(노드 연결·이득 자동화·소스 시작/정지·ended, 가상 시계·가상 타이머·rAF, 가짜 fetch, `Math.random` 고정 시드)로 소비자를 돌리고, 틱마다 [로직이 낸 소리 사건] + [소스 시작(버퍼 파일·when·offset·속도·반복·목적지까지 경로별 이득 곱·팬·채널)·정지·이득 자동화(위쪽 첫 소스 기준)] + 로직 상태 해시를 줄로 남긴다. 위쪽에 소스가 아직 없는 노드의 자동화와 이미 끝난 소스의 stop 은 소리에 영향이 없어 남기지 않는다(핸들 GainNode 가 하나 더 끼는 그래프 차이를 지우려고). 이전 전 기준은 scratchpad 에 이전 전 코드 트리(`script`·`tools`)를 복사해 같은 도구로 기록했다.

| 시나리오 | 내용 | 줄 · 시작 · 정지 · 자동화(이전 전) |
|---|---|---|
| `mg1801_normal` | 노멀 시드 1, 1P 사람(37 프레임마다 A), 틀 소리 포함, 3,245 틱 | 80,546 · 680 · 237 · 69,598 |
| `mg1801_long180` | 같은 AudioOut 에서 이어 롱 4번째(BPM 180) 시드 3 | 62,637 · 655 · 277 · 55,031 |
| `mgscene_dummy` | 틀 더미(mg0101) 한 판, 건너뛰기 없음 | 3,037 · 9 · 6 · 3 |
| `mgscene_skip` | 같은 판 + 단계 4 건너뛰기(그룹 정지 0x22·0x23·1·0x25) | 1,841 · 10 · 6 · 3 |
| `rhythm_script` | 리듬 소리 직접: 마스터·OP·핸드셰이크·물보라 7발(한도 5)·3D·JUST 콤보·지역 변수·반복 BGM 둘·결과 SE 정지·프리셋 치환 + 틀 사건(호루라기·캐릭터 보이스/발소리 라벨·징글·설명 BGM·그룹 정지) | 4,851 · 61 · 30 · 4,233 |

(a) `RULES_WEB` 전후: 지금 코드에서 `flow.ts` 단계 16 사건의 sec 만 되돌린 사본 → **다섯 시나리오 모두 이전 전 기록과 바이트까지 같음**. 지금 코드 그대로는 네 시나리오에서 그 사건 줄(`"sec":0` → `0.5`) 하나만 다르다(웹 규칙 소리는 이 값을 쓰지 않아 소리 줄은 같다). 해시: `GOLDEN_SHA256_PRE`(이전 전)·`GOLDEN_SHA256_WEB`(지금).

(b) `RULES_ORIGINAL`(기본, `GOLDEN_SHA256`): **로직 해시(틱마다 상태·사건) 다섯 모두 웹 규칙과 같다** — 소리와 무관한 값은 바뀌지 않았다. 사운드 관측(`obs`)은 `mg1801` 두 판에서 단계 16 뒤 22 틱만 다르다(게임 BGM 핸들이 그룹 정지로 끝나 L0 가 비어 감 — 리듬은 이미 끝난 뒤라 로직이 읽지 않는다). 항목별(웹 규칙에서 그 항목만 원본으로, `GOLDEN_ITEMS`):

| 항목 | 바뀐 소리 |
|---|---|
| `groups` | mg1801 노멀: 단계 16(53.72 s)에 `SM_AMB_MG1801_MG_RESULT`·환호 `SQ_SE_RC_CHEER_MG_FIN`(rc_cmn war2_013 반복)·결과 징글 `SM_JIN_RC01_MG_SUCCESS` 를 0.5 s 페이드 정지(웹: 틀 채널만, 게임 소리는 화면을 버릴 때). 롱 180: 마스터 `SQ_BGM_RC_MAIN_RHYTHM`·`SM_AMB`·환호 같은 식. 틀 건너뛰기: `SQ_SE_SYS_SKIP`(그룹 0x01)이 0.3 s 페이드로 짧아짐(웹: 끝까지). 리듬 직접: [0x23,1,0x25] 0.3 s 로 징글 `SM_JIN_MG_WIN`·환호 SE 둘, 0x20 0.5 s 로 결과 징글·환경음·설명 BGM 조각 |
| `random` | 물보라(`FOOD_FALL_WAT_*`) 피치·volume2(예 속도 1.1811 → 1.2288), 환호 시퀀스의 무작위 갈래(rc_cmn war2_012/013/014 → 015/016), 롱 180 물보라 시작 62 → 64(음 길이가 바뀌어 플레이어 한도 5 판정 시점이 바뀜) |
| `supersede` | 리듬 직접: `SQ_BGM_RC_CALIBRATION` 이 시작해도 반복 중인 `SQ_BGM_RC_GENERIC` 을 멈추지 않음(웹: 138.22 s 에 끊음) → `bgmStop` 까지 이어짐(조각 시작 +1) |
| `instanceLimit` · `resolve` · `track3d` · `f32` | 이 시나리오들에서 차이 없음: 시퀀스 64·스트림 6 을 넘지 않음, 와일드카드 대상(`*_MUTE`·`SQ_SE_DUMMY`)이 명세에 없음, 카메라 고정·출력 리스너 여럿(팬 0·음량 1), 3D 값이 1·0 |

처음 원본 규칙 실행에서 결과 징글 `SM_JIN_MG1801_MG_RESULT_GOOD` 이 사라졌다 — `resolve` 원본 규칙을 "대상이 없어도 치환"으로 둔 탓(웹 명세는 치환된 파일을 원래 라벨 아래 둔다). 13.4 를 먼저 고치고 코드를 고쳤다.

**디코드 캐시 통합(같은 골든 실행의 받기·풀기 수, 파일 내용 기준):**

| 시나리오 | 이전 전 받기 / 풀기 | 지금 |
|---|---|---|
| mg1801 노멀(처음) | 76 / 70 | 76 / 70 |
| mg1801 롱 180(같은 AudioOut 두 번째) | 2 / 0 | 2 / 0 |
| 틀 더미(새 AudioOut) | 6 / 5 | 6 / 5 |
| 틀 건너뛰기(새 AudioOut) | 6 / 6 | 1 / 1 |
| 리듬 직접(새 AudioOut) | 73 / 71 | 2 / 0 |
| 합 | **163 / 152**(같은 파일 두 번 이상 75 / 75) | **87 / 76**(두 번 이상 0 / 0) |

즉 같은 페이지의 AudioOut 하나 안에서는 이전에도 URL 캐시가 있어 줄지 않았고, **AudioOut 을 새로 만드는 경로**(ui 시험 페이지 `mgscene`·`character`, 판마다 새 컨텍스트)에서 다시 받기·풀기가 0 이 됐다. 받기는 이제 로더 관리자 `bytes` 를 지나므로 미리 받기·다른 화면이 같은 키를 받았으면 그것을 쓴다. BGM 조각(§12)은 원본 모드 골든에서 풀기가 없어 이 표에 없다.

기존 노드 시험(일괄 1회): `test_mg1801` 97/0·`test_mgscene` 79/79·`check_logic` mg1801 3,245 프레임 같음·`test_bgm_stream` 43/43·`test_character` 135/135(일괄 때 GC 측정 1건 실패, 단독 재실행 통과 — 이전 작업들과 같은 현상)·`test_effect` 106/106·`character_golden`·`effect_golden` 기준과 같음, 나머지 전부 통과. `test_room_server` 255/256 — 광장 원격 달리기 틱별 오차(실시간 소켓 타이밍, 소리 코드를 부르지 않음)로 단독 재실행도 같음. `tsc`·`npm run build` 통과. 받는 경로(통파일 = 로더 관리자 bytes)가 바뀌어 :51811 페이지 콘솔 확인 1회(촬영 없음): `dev/ui?ui=sound&auto=1`·`dev/ui?ui=mgscene&game=mg1801&auto=1` 콘솔 오류 0·4xx 0(swiftshader GL 경고만), 소리 요청 76개.

### 13.8 자리만 둔 것

- `pause` 는 `buffer` 처리기만(위치 기억 뒤 다시 시작). 시퀀스·스트림 처리기는 무시.
- 페이드 정지: `buffer` 는 핸들 GainNode 램프 + 끝에 stop(풀리기 전에 받은 페이드 정지도 시작한 뒤 페이드 [추정: 원본은 같은 프레임에 낸 소리도 그룹 정지를 받는다]), 리듬 시퀀스는 핸들 GainNode 램프 뒤 타이머로 시퀀스 정지, 스트림은 `BgmStream.stop(fade)`. 웹 규칙에서 리듬 소리 정지는 늘 0 초다.
- 3D 팬 갱신(`track3d`)은 `buffer` 처리기 팬 노드만. 시퀀스는 재생 때 음마다 더하는 팬(§6.6)이라 재생 중 바뀌지 않는다(mg1801 은 출력 리스너가 여럿이라 팬 0, §6.7).
- 메시지 덕킹(0x0d·0x13)·`SetVolume`·리전 점프는 API 만(셸 이전 때 연결).
- 도플러·필터(§6.7)는 계산하지 않는다.

### 13.9 사용자 확인 필요

| 항목 | 정한 것(원본 쪽) | 이유·선택지 |
|---|---|---|
| 틀 단계 16 그룹 정지 초 | 로직 사건 `sec` 를 FadeTimePreset 6 = 0.5 s 로 고침(`shell/mgscene/flow.ts` 한 줄, 로직 상태·다른 사건 무변화) | 원본 `StopGroup_Type(0x20, 6)` [판독]. 로직 파일이라 알림. 단계 6 의 `[0x23,1,0x25], sec 0` 은 프리셋 번호 미판독이라 그대로 |
| 원본 규칙 그룹 정지 범위 | (해소 2026-10-09 사용자 결정) 원본대로 확정 — 같은 코어의 틀·게임 소리를 모두 정지. 2차부터 셸 화면도 같은 코어(`appAudio()`)라 화면 소리도 같은 규칙 | — |
| 그룹 0x00~0x1f 소속 | (2차) 원본 규칙은 `meta.json`(사용자 파라미터 비트 29). 표에 없는 라벨만 접두 근사 | 13.11.3 — 6.9 의 "SQ_SE 전부 0x01" 은 데이터와 다르다: `meta.json` 범위(메인 fspj + 서브 2)의 SQ_SE 765개 중 740개가 0x01, 25개는 그룹 없음(`SQ_SE_SYS_*` 18개 중 17·`SQ_SE_MGM01_*` 7·`SQ_SE_MENU00_TRANSITION_WHO` 1) [데이터, 2026-10-09 조정자 재집계] |
| 엔진 난수 시작 상태 | AudioOut 마다 `0x12345678` 에서, 그 코어를 만든 오디오 시각부터 5 ms 마다 한 칸 | 원본은 부팅 뒤 모든 소리 소비에 따라 다름 — 같은 값 재현은 불가, 식·분포만 원본 |
| 플레이어·아카이브 한도 넘칠 때 | 가장 낮은(같으면 가장 오래된) 소리와 비교 | nn::atk 공개 동작 [추정]. 판독하려면 SoundInstanceManager·SoundPlayer 할당 경로 |
| `resolve` 와일드카드 | `**` = 두 글자, 대상이 명세에 있을 때만 | 치환 함수 미판독. 캐릭터 보이스 파일을 넣을 때 `SQ_VOI_PC**_MUTE`·`SQ_SE_DUMMY` 를 무음 항목으로 명세에 넣어야 원본처럼 꺼진다 |
| `supersede` 끔 | 리듬 직접 재생 BGM 이 겹칠 수 있음(핸드셰이크 밖 경로: 마스터가 없을 때의 `bgm` 사건) | 원본에 그런 규칙이 없음. 실제 mg1801 흐름에서는 핸드셰이크가 끊는다 |
| 틀 BGM 출력 버스 | `ctx.destination` 직결 → AudioOut bgm 버스(음소거 체크가 먹음) | 이전엔 음소거해도 틀 BGM·징글이 났다 |
| 셸 Play2D 팬 | (해소 3차) 위치 → 팬 식 판독(13.12.2) — 원본 규칙은 그 식(f32), 웹 규칙은 이전 식. 팬 → 좌우 이득 곡선(nn::atk 내부)은 여전히 StereoPanner 근사 | — |
| 진동 파형 | (해소 3차) vibration.msgpack 정의·설정 + bnvib 를 변환해 포락선으로 재생(13.12.3, [05 §11](05_ui_input.md)) | 주파수·전역 명령 prm 은 [근사]·[미확정] |
| 메시지 보이스 | 사건 기록만 | vo_message.ftrg·보이스 파일 변환 안 함(캐릭터 보이스와 함께 별도 결정) |
| 메시지 속도 | 소리 쪽 연결 없음(기본 0) | 저장 값을 쓰는 설정 화면이 웹에 없음 |
| 덕킹 중 바뀐 BGM | 덕킹을 켠 순간의 곡 라벨로 BGM 덕킹 노드 목표를 정함 — 덕킹 중 곡이 바뀌어도 노드 값은 그대로 | 원본은 핸들마다 그룹 소속으로 계산 |
| 광장 UI 부품 소리 실패 | 페이지 고리(`PlazaContext.sound.play`)를 쓰면 이전의 "파일을 못 풀면 광장 `se(label)` 로 대신" 길은 타지 않음 | 고리 없는 시험 하네스는 이전 길 |
| 페이지를 떠날 때 | (해소 3차) 원본 장면 정리 판독(13.12.1) — 원본 규칙: 다른 장면이 시작될 때 앞 장면 소리 전부 즉시 정지·진동 정지, 같은 장면 안 화면 전환은 이어짐, 게임 서브 아카이브 해제. 웹 규칙은 이전(`close(ms)`) | — |
| 낡은 주석 | (해소 2026-10-09) 사용자 지시로 지금 코드에 맞게 고침: `view/mgsceneSound.ts` 머리(코어 핸들 두 칸·그룹 정지 규칙), `view/audio.ts` 머리(calc3d 는 lib/sound 에서 다시 내보냄), `games/rhythm/view/sound.ts` 머리(코어 담당·BGM 끼리 정지 규칙별)·`startFile` 문서 주석 | — |

### 13.10 새 판독: 시퀀스 엔진 난수 [판독 2026-10-09]

`analysis/decomp/sound_seq_player.c`(기존)와 CoreTool 덤프(새, `dec:71005df19c`·`71005c9b10`·`71005de7f0`·`71005dd1e0`, ghidra_work/sound):

| 함수 | 내용 |
|---|---|
| FUN_71005df19c | `DAT_7101adbc08 = DAT_7101adbc08 * 0x19660d + 0x3c6ef35f; return DAT_7101adbc08 >> 16` — 전역 LCG 하나. 초기값 `0x12345678`(데이터 @0x7101adbc08) |
| FUN_71005c9b10 case 4(random 접두 인자) | `s16 min, s16 max` 를 읽고 `min + ((r & 0xffff) + (r & 0xffff)·(max − min)) >> 16` |
| FUN_71005c9c80 case 0x86(randvar) | n = 값(음수면 −값), `((r & 0xffff) + (r & 0xffff)·n) >> 16`, 값이 음수면 부호를 뒤집음 |
| FUN_71005dd1e0(사운드 프레임) | 모든 갱신 뒤 `FUN_71005df19c()` 를 한 번 부른다(값 버림) — 프레임마다 상태가 한 칸 간다 |
| FUN_71005de7f0 | `(r & 0xffff) / 65535.0` 실수 난수. FUN_71005de6ec 가 함수 포인터로 등록 — 쓰는 곳 [미확정] |

그래서 원본 물보라 피치·볼륨(§6.4)은 부팅 뒤 지난 사운드 프레임 수와 그 사이 모든 소리의 무작위 소비에 따라 다르다. 웹(원본 규칙)은 AudioOut 하나에 LCG 하나를 두고 그 코어를 만든 오디오 시각을 기준으로 5 ms 프레임마다 한 칸 돌린다.

### 13.11 셸 화면·메시지 창 연결 [2026-10-09 2차, sound-runtime-2]

사용자 결정: (1) 그룹 정지 범위 원본 확정(13.9), (2) 미룬 소비자를 지금 연결. 캐릭터 효과음·보이스·발소리 파일 변환과 리전 점프는 하지 않는다.

#### 13.11.1 셸 소리 연결(`view/sound.ts`)

- `appAudio()`: 페이지 흐름 전체에 `AudioOut` 하나(globalThis — 번들이 나뉘어도 하나). 처음 부를 때 만든다(AudioContext 를 만들 수 없으면 null). 셸 화면·앱 BGM·`main.ts` 게임이 같은 컨텍스트·같은 코어를 쓴다. ui 시험 페이지(`mgscene`·`character`·`sound`)는 판마다 자기 `AudioOut` 을 만들고 닫는다(그대로).
- `shellSound({muted, pan2d, pads?})`: 화면 하나의 소리 출력. 라벨 표(`SoundCatalog`)는 화면마다, 코어·디코드 캐시는 공용.
  - `play(label, url, gain, x?)` — 원본 `Play`/`Play2D`. 정의 = `buffer` 처리기(풀리는 대로 처음부터, 이전 페이지 `playSe` 와 같은 한 마이크로태스크 뒤 시작). `pan2d` 면 팬 노드를 늘 두고 팬 = `clamp((x − 960)/960)`(x 없으면 0) — 이전 페이지 식 그대로 [근사: 원본 Play2D 팬 곡선 미확정]. `pan2d` 가 아니면 팬 노드 없음(이전 mgm01·online·partyrule·setplayer·mgmscreens·광장).
  - `voice(label, url, gain, slot)`·`voiceStop(slot)` — 캐릭터 선택 슬롯 보이스(슬롯마다 핸들 하나, 새 요청이 앞 것을 멈춤, 멈춘 뒤 늦게 풀린 것은 재생 안 함).
  - `preload(urls)` — 디코드 캐시 미리 채우기.
  - `mgm(hooks)` — `MgmSoundAdapter`: `play`, `stopGroups`(코어 `stopGroup`), `duck`·`vibrate`·`voice`(13.11.2), BGM 고리는 `appBgm().hooks` 를 그대로 합친다.
- 디코드 캐시·받기는 1차와 같다(13.5): 로더 관리자 `bytes` 키 + 전역 디코드 맵. 광장 페이지가 `bytes` 를 owner `plaza` 로 미리 받아 두면 같은 키를 그대로 쓴다.

#### 13.11.2 메시지 창·시스템 고리(`shellHooks`, 원본 규칙에서만)

| 고리 | 원본 | 웹 |
|---|---|---|
| 덕킹 | 창 열림(Announce·Subtitle 아니면) `DuckingGroup(0x13, 0x13, 켬)`, 선택지 열림 `DuckingGroup(0x0d, 0x0d, 켬)`, 닫힘 둘 다 해제 [판독 message_window.md 5·6.4·7] — 값 0x13 = 0 으로 0.3 s, 0x0d = 0.6 배 0.3 s, 해제 0.3 s [판독 mgm_common 6.9] | 코어 `duckGroup`(소속 핸들 gain 램프) + 앱 BGM: 지금 곡 라벨의 그룹(meta)이 덕킹 그룹에 들면 BGM 덕킹 GainNode 를 같은 목표·같은 시간으로 램프 |
| 진동 | 메시지 창 `bv_vib_sys_deci`·`bv_vib_sys_cursor`(owner), 안내 Next·mgmet·mgm01 등 이름 [판독], 파형(bnvib) 셸용 변환 없음 | 그 플레이어 패드 `rumble(60 ms)` — setplayer 페이지가 쓰던 값 [근사: 파형 미변환] |
| 보이스 | vo_message.ftrg 키 + 화자 VoiceID → `SQ_VOI_<NPC>_MV_<감정>[_01..03]`, 변형 고르기 [미확정] [판독 6.5] | 사건 기록만(보이스 파일·ftrg 변환 없음 — 이번 범위 밖) |
| 메시지 속도 | SystemData+0x74(0·1·2) → 글자 속도·글자 소리 수 [판독 6.3] | 소리 쪽은 `Typer` 가 이미 속도대로 글자 소리를 낸다. 저장 값을 쓰는 곳(가이드 설정 화면)이 웹에 없어 기본 0 그대로 — 연결할 생산자 없음 |

#### 13.11.3 원본 사운드 정보 표(`assets/common/sound/meta.json`, 도구 `web/tools/analysis/sound_meta.py` — 3차부터 입력 FSAR·조사 폴더·출력을 모두 인자로 받는 범용 도구)

- 원천: 메인 `AddonAudioProject.fspj` + 웹이 쓰는 서브 아카이브(`subarc_mg1801.fsst`·`subarc_rc_cmn.fsst`) INFO 사운드 정보(4.1): 사용자 파라미터 4개(옵션 비트 28~31)·플레이어 참조·플레이어 우선순위·사운드 종류. 파서 `sound_fsar.py`.
- 그룹 비트 = **사용자 파라미터 비트 29 칸**(6.9 FUN_71005c3840 색인 표 {31,30,29,28} 의 색인 2) [판독 6.9 + 데이터]. 확인: `SM_BGM_MENU` 0x80E001 → 0x0d(BGM 덕킹) 포함, `SM_BGM_MENU_RHYTHM` 0x2088E001 → 0x13 포함(6.9 "0x13 = SM_BGM_MENU_RHYTHM") — 표와 맞는다.
- 라벨 범위: 웹 에셋 JSON(`assets/**/*.json`)에 나오는 모든 원본 라벨 + 세팅 프리셋 치환 대상. 줄 = `[그룹 비트, 플레이어 이름, playableSoundMax, 플레이어 우선순위, 종류]`.
- 무음 항목: `SQ_SE_DUMMY` 와 `*_MUTE` 전부(메인 91개) — 시퀀스가 첫 명령 `fin` [실행: `sound_seq.py disasm` SQ_SE_DUMMY·SQ_VOI_PC01_MUTE·SQ_VOI_PC01_RUN_MUTE]. 웹은 처리기 `silent`(소리 없음, 바로 끝)로 정의한다 — 프리셋 치환(`SQ_SE_FS_PC**_WALK` → `SQ_SE_DUMMY`, `SQ_VOI_PC**_JUMP` → `SQ_VOI_PC**_MUTE`)이 원본처럼 무음 라벨로 간다.
- 쓰는 곳: `soundSystem` 이 처음 만들어질 때 받아 코어 `setMeta` 로 넘긴다(원본 규칙 `meta` 일 때만 그룹·플레이어에 씀). 받기 전에 낸 소리는 접두 근사.
- 원본 규칙에서는 표에 있는 라벨의 그룹 비트·플레이어·한도·플레이어 우선순위가 명세 값보다 앞선다(웹 명세의 스트림 우선순위 64 는 자리값이었다). 그래서 틀·게임·셸이 같은 플레이어(예 `PLY_JIN` 2·`PLY_SE_SYS` 2)를 같이 센다.
- 실행 결과(2026-10-09): 라벨 2,964(웹 에셋 라벨 + 스트림 전부 + 무음), 무음 92, 웹 에셋에 있으나 메인·두 서브 아카이브에 없는 라벨 146(다른 게임 서브 아카이브 — 접두 근사로 둠). 압축본 `assets-dist` 에도 넣었다(`build_assets --only common/sound/meta.json`).

#### 13.11.4 검증 [실행 2026-10-09, 노드만]

- `tools/test_sound.ts` **97/97**(1차 77 + 2차 20): 원본 정보 표(0x0d·0x13 소속이 6.9 와 같음, `SQ_SE_SYS_DECI` = 그룹 0·`PLY_SE_SYS` 2·108, 서브 아카이브 라벨, 무음 92), 플레이어 한도·그룹 0x01 을 웹/원본 규칙으로 비교, 무음 항목(발소리 → `SQ_SE_DUMMY`, 핸들 없음), `shellSound`(appAudio 하나·코어 하나, Play2D 팬 두 벌, 디코드 캐시 공유, 원본 규칙 MgmSound 고리, 앱 BGM 덕킹 0x0d 0.6 배 0.3 s·0x13 곡 그룹 밖·해제, 진동 → rumble, 슬롯 보이스, 음소거), 골든 12(시나리오 6 × 규칙 2).
- 골든 새 시나리오 `shell_flow`: 광장 → 인원 설정 → 캐릭터 선택(Play2D·슬롯 보이스·미리 받기) → 모드 선택 → 항구(**메시지 창 상태기계**: 열기·글자·넘김·선택지·커서·결정·닫기, `MgmSound` 실제 어댑터) → 프리 플레이(FadeAndEntryCancel) → 온라인, 화면마다 출력을 새로 만듦. 이전 전 기준 = 2차 이전 전 코드 트리(scratchpad)에서 같은 도구가 이전 페이지 소리 코드(`legacyShell` — 페이지는 DOM 이 있어 노드에서 못 돌아 그 `playSe`·보이스 코드를 그대로 옮김)로 돌린 기록.
- **(a) RULES_WEB: 여섯 시나리오 모두 2차 이전 전과 바이트까지 같다**(`shell_flow` 535줄·시작 23·정지 4). 가짜 컨텍스트 `close()` 는 남은 소스를 그 자리 정지로 남긴다(이전 페이지는 화면을 떠날 때 자기 컨텍스트를 닫았다 — 지금은 `close(ms)` 가 그 화면 소리를 멈춤).
- **(b) RULES_ORIGINAL**(로직 해시 여섯 모두 웹과 같음):

| 항목 | 화면·소리 |
|---|---|
| `meta` | 셸 흐름: `PLY_SE_SYS` 한도 2 → 인원 설정 커서 3번째·캐릭터 선택 커서·프리 플레이 연속 SE 에서 가장 오래된 `SQ_SE_SYS_*` 를 멈춤(정지 6). 리듬 직접: `PLY_JIN` 2 를 틀·게임이 같이 세어, 결과 환경음 시작 때 틀 징글 `SM_JIN_MG_WIN` 이 밀림 |
| `groups`(+`meta`) | 셸 흐름 `FadeAndEntryCancel`(0x22·0x01·0x25·0x29): `SQ_SE_SYS_*` 는 원본 데이터에서 0x01 이 아니라 멈추지 않음. 1차 원본 규칙에서 0.3 s 로 짧아지던 틀 건너뛰기 `SQ_SE_SYS_SKIP` 도 같은 이유로 이제 끝까지 난다(`mgscene_skip` 원본 = 웹) |
| `shellHooks` | 골든 시나리오에는 BGM 이 없고 SE 는 0x0d·0x13 밖이라 차이 없음. 덕킹·진동은 시험 12 로 확인 |
| 1차 항목 | 1차 표와 같음(mg1801 두 판·리듬 직접의 random·groups·supersede) |

- 디코드 캐시(화면 흐름 기준, 같은 골든): **셸 흐름 받기 7 / 풀기 21 → 7 / 7**. 이전엔 바이트는 앱 흐름 관리자를 같이 썼지만 풀기는 화면(페이지 컨텍스트)마다 다시 했다 — 같은 `SQ_SE_SYS_*` 4개가 3~5번씩. 1차 시나리오 합과 더하면 받기 94 → 94, 풀기 97 → 83(원본 규칙은 `meta.json` 받기 +1).
- 기존 노드 시험(일괄 1회): 셸 시험 전부(`test_mgm01` 277·`test_mgmet` 218·`test_msgwin` 52·`test_partyrule` 106·`test_online` 154·`test_setplayer` 116·`test_modeselect` 71·`test_charselect` 67·`check_charselect` 2,414·`test_plaza_world` 445·`test_shell_bgm` 62 등) 그대로 통과, `test_character` GC 측정 1건(단독 재실행 135/135), `test_room_server` 255/256 1차와 같은 항목(광장 원격 달리기 타이밍). `tsc`·`npm run build` 통과. 받는 경로가 바뀌어 :51811 콘솔 확인 1회(촬영 없음): `ui=modeselect`·`ui=partyrule&assets=dist`(meta.json 압축본 200)·`ui=charselect`·`index.html?plaza=1&skipsetup=1` 콘솔 오류 0·4xx 0(GL 경고만).

### 13.12 장면 퇴장·Play2D 팬·진동 [2026-10-09 3차, sound-runtime-3]

사용자 결정: 13.9 의 남은 항목을 원본대로 적용(메시지 속도는 공용 저장 담당). 새 판독은 CoreTool 덤프(ghidra_work/sound, scratchpad 보관)와 기존 `analysis/decomp/sound_bex.c`.

#### 13.12.1 장면 퇴장 때 소리 [판독 2026-10-09]

| 함수 | 내용 |
|---|---|
| `bq::SceneBase::OnCleanup` @0x71002caaf0 → FUN_71001c7c00 | `SoundModule` 장면 정지(현재 gfx 장면 종류, StopAllType 0) + `VibrationModule` 장면 정지(FUN_71001b129c(진동, 장면 종류, 0)) — 그 뒤 CPU boost 해제·네트워크 동기 정지 |
| `bq::SceneBase::~SceneBase` @0x71002c9d50 +0xb8 | FUN_71000bf4e0(**0.0**, 사운드, 현재 gfx 장면 종류, 0) → FUN_71000c1168 → FUN_71000fe210 → FUN_71000d3c80(0.0, 장면 사운드+0x40, **그룹 0x20**, 0, 0) — 그 장면 종류의 모든 소리를 페이드 없이 정지 |
| FUN_71001c7afc(장면 기반 소멸) | 장면 상태 3 이면 장면 종류 0·1 모두 StopAll(종류 2) |
| `ca::rm::RmMgSceneBase` 생성 +0x148 / 소멸 +0x58 | `LoadSoundArchiveAsync("sound/subarc_rc_cmn")`·`AddLoadArchive("mg/mg1800")` / `ReleaseSoundArchive("sound/subarc_rc_cmn")` — 게임 장면의 서브 아카이브는 장면과 같이 적재·해제 |
| FUN_710024e220(접속 끊김 → menu00 복귀) | `SoundModule::StopAll(1)` + `VibrationModule::StopAll(1)` |

결론: 장면이 끝나면 그 장면 종류의 소리 **전부(0x20)를 즉시** 멈추고 진동도 멈춘다. 장면 안의 화면 전환(같은 장면의 다른 UI)에는 이 처리가 없다. 메인 상주 아카이브(`_ResidentAudio`)는 유지, 게임 서브 아카이브만 해제. StopAllType 0/1/2 의 뜻은 [미확정].

웹 적용(규칙 `sceneExit`): 페이지마다 원본 장면 이름을 둔다 — 광장·인원 설정·캐릭터 선택(인원 설정 안)·온라인 friend = `menu00`, 모드 선택·캐릭터 선택(모드 메뉴 쪽)·파티 규칙 = `menu01`, 온라인 world = `matching00`, 항구 = `mgmet`, 프리 플레이 = `mgm01`, 미니게임 = `mg`([§12.14.2](#12142-화면별-재생전환-판독) 표의 원본 장면). 다른 장면 이름의 출력이 시작될 때 앞 장면의 코어 소리를 그룹 0x20 으로 즉시 정지하고 진동을 멈춘다. 같은 장면이면 이어진다. BGM(`appBgm`)은 §12.14 판독 규칙(화면별 정지·이어 재생)이 이미 장면 정지 앞에서 처리하므로 건드리지 않는다. 게임 장면이 끝나면(`RmSoundMap.stopBgm`) 서브 아카이브 파형(`subarc_*`)을 디코드 캐시에서 내린다(다음 판에 다시 받고 푼다 — 원본도 장면마다 다시 적재). 웹 규칙은 이전 `close(ms)`.

#### 13.12.2 Play2D 팬 [판독 2026-10-09]

`SoundModule::Play2D(label, Vector3f pos, float)` @0x71000be024 → FUN_71000c044c(장면, pos) → `SoundHandle::SetPan`(FUN_71000c0300). `Play2D(label, float pan, float)` @0x71000be0f8 는 팬을 그대로 받는다.

```
FUN_71000c044c [판독: 디스어셈블 71000c044c~0490]:
  W = (float)*DAT_7101c45478          // FUN_7100984dc0 — 화면 폭(정수) [1920 으로 봄: 추정]
  p = pos.x * (1.0f / (W * 0.5f))     // f32
  pan = p < -1 ? -1 : min(p, 1)
```

pos 는 페인 전역 위치(레이아웃 좌표, 가운데 0)다(mgm_common 6.9 PlaySe2D). 웹 화면 x(0..1920) = 레이아웃 x + 960 이므로 원본 규칙 팬 = 위 식(f32, W = 1920)에 x − 960. 이전 웹 식 `clamp((x − 960)/960)` 과는 f32 반올림만 다르다(규칙 `pan2d`). 팬 → 좌우 이득(nn::atk 팬 곡선)은 판독하지 않았다 — StereoPanner(equal-power) [근사].

#### 13.12.3 진동

원본 진동 모듈·자료와 웹 재생은 [05 §11](05_ui_input.md). 소리 쪽 연결: `shellSound().mgm()` 의 `vibrate` 고리와 mg1801 `VB_` 트리거가 같은 공용 진동 재생기(`lib/vibration` + `view/vibration.ts`)를 쓴다. 장면이 끝나면 진동도 멈춘다(13.12.1).

#### 13.12.4 원본 스위치(3차 추가)

| 항목 | 웹 근사(`RULES_WEB`) | 원본(`RULES_ORIGINAL`) | 근거 |
|---|---|---|---|
| `sceneExit` | 페이지를 떠나면 ms 뒤 그 페이지 소리 정지(이전 컨텍스트 닫기) | 다른 장면이 시작될 때 앞 장면 소리 0x20 즉시 정지·진동 정지, 게임 서브 아카이브 파형 해제 | 13.12.1 |
| `pan2d` | `clamp((x − 960)/960)` | `clamp((x − 960) · (1/(1920·0.5)))` f32 | 13.12.2 |
| 진동 | 셸 = 연결 없음(인원 설정만 rumble 60 ms), mg1801 = bnvib 진폭 50 ms 평균 구간 | 원본 정의·설정(값형 attack·duration·release / bnvib 200 Hz 표본) 그대로의 구간, 우선순위 | [05 §11](05_ui_input.md) |

#### 13.12.5 공용 모듈 경계(사용자 원칙: 공통으로 쓸 것은 처음부터 공통, 어디에도 의존하지 않음)

| 모듈 | import | 하는 일 |
|---|---|---|
| `lib/sound` | 0 | 소리 코어 — Play2D 팬 식(`pan2d`)·장면 퇴장 규칙(`enterScene`)도 여기 원본 규칙으로 둔다. 진동을 부르지 않는다: 장면 퇴장은 `enterScene` 이 참을 돌려주는 사건으로만 알린다 |
| `lib/sound-webaudio` | `../sound` | WebAudio 어댑터 |
| `lib/vibration` | 0 | 진동 코어 — 정의·설정 → 구간 포락선, 우선순위(`VibMixer`) |
| `lib/vibration-gamepad` | `../vibration` | Gamepad `dual-rumble` 어댑터(액추에이터·타이머 주입) |
| `view/sound.ts`·`view/vibration.ts`·`view/input.ts` | lib + mpj | mpj 연결: 셸 화면·메시지 창·게임이 꽂아 쓴다(장면 퇴장 사건 → `stopAllVibration`) |
| 변환기 `sound_meta.py`·`vib_convert.py` | — | 입력 파일·출력 경로를 인자로 받는 범용 도구 |

공용 lib 는 mpj 형식(view·shell·games)을 import 하지 않는다 — `tools/test_sound.ts` 13 이 검사한다.

#### 13.12.6 검증 [실행 2026-10-09, 노드만]

- `tools/test_sound.ts` **115/115**(2차 97 + 3차 18): 진동 표(VB_ 키 → 라벨, `bv_vib_sys_skip` 정의), 자리 이름 짝, 웹 규칙 포락선 = 이전 mg1801 50 ms 식, 원본 표본 구간·값형 포락선, 우선순위, Gamepad 어댑터, Play2D 팬(판독 식·f32·자름), 장면 퇴장(웹 = 이어짐, 원본 = 0x20 즉시 정지), 서브 아카이브 해제, 공용 lib import 경계.
- 골든(시나리오 6, 3차 이전 전 트리 = scratchpad): **RULES_WEB 6/6 바이트까지 같음**. 원본 규칙에서 바뀐 것은 `shell_flow` 하나(로직 해시 같음):

| 항목 | 화면·소리 |
|---|---|
| `sceneExit` | 광장 → 인원 설정(같은 menu00): 이전엔 광장을 떠날 때 SE 3개를 끊었으나 이제 이어짐. 인원 설정 → 캐릭터 선택(menu01): 그때 남은 menu00 소리를 즉시 정지. 모드 선택 → 항구(mgmet)·프리 플레이(mgm01)·온라인(menu00) 시작 때 앞 장면 소리 정지(정지 위치가 화면 닫기 시각 → 다음 장면 시작 시각으로) |
| `pan2d` | Play2D 팬 값이 f32(예 −0.6875 → −0.6875000596, 0.7708333 → 0.7708333731) |
| 진동 | 메시지 창 결정 진동 `bv_vib_sys_deci` 가 원본 bnvib 포락선 17 구간(×Gain_Master 0.5), 프리 플레이 장면 시작 때 진동 정지(세기 0 구간) |
| 서브 아카이브 해제 | 기록 줄은 같고, 디코드 수만 늘어남: mg1801 롱 180(두 번째 판)·리듬 직접에서 풀기 0 → 61(원본도 장면마다 다시 적재). 합계 원본 규칙 풀기 205·받기 96 |

- 기존 노드 시험 일괄 1회 전부 통과(`test_save` 65 포함), `test_room_server` 255/256 은 1·2차와 같은 항목(광장 원격 달리기 타이밍). `tsc`·`npm run build` 통과. 받는 경로(진동 표 `vib.json`·압축본 갱신)가 바뀌어 :51811 콘솔 확인 1회(촬영 없음): `ui=modeselect`·`ui=partyrule&assets=dist`·`ui=charselect`·`ui=sound` 오류 0·4xx 0(GL 경고만).
