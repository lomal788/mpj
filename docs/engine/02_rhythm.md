# 02. 리듬 미니게임 공용 프레임워크 (`ca::rm`, mg1801~mg1810)

2026-10-02. 상태: **분석 진행**(공용 흐름·박자·채보·점수 판독 완료, 원본 실행 확인 없음). 웹 코드는 고치지 않았다(11절은 명세다).
2026-10-09: 웹 공용 모듈로 분리했다(`web/script/app/minigame/kit/rhythm/`, 동작 불변) — 14절.
확정 수준: **[실행]** 원본 실행 확인, **[판독]** 원본 명령 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 [실행]은 없다. 판독한 식·데이터를 옮겨 돌린 결과는 **[재구현 계산]**으로 따로 적는다.

주소는 SwitchLoader 기본 베이스(0x7100000000) 기준이고 **모듈 이름과 함께** 쓴다. 따로 적지 않은 주소는 main NSO 다.
mg1801 쪽 근거 메모와 기존 문서 정정 목록은 [analysis/notes/mg1801_rhythm.md](../../../analysis/notes/mg1801_rhythm.md)에 있다. 이 문서는 그 결론을 게임 공용 명세로 정리한다.

---

## 1. 기능 개요

리듬 쿠킹 미니게임 10종(mg1801~mg1810)은 장면 클래스가 모두 `ca::rm::RmMgSceneBase`(main)를 상속한다. 기반 클래스가 다음을 맡는다.

- 박자 시계: 사운드 시퀀서가 쓰는 전역 변수(16분음표 위치)를 매 프레임 읽어 "박이 바뀐 프레임"을 만든다.
- 진행 단계: 와이프 → 카운트인 → 게임 BGM 마디 동기 시작 → 본편 → 종료 BGM → 결과.
- 채보: JSON 한 파일(8열)을 박이 바뀔 때마다 한 줄씩 게임 훅으로 넘긴다.
- 점수·별: 판정 점수(JUST 2, FAST/SLOW 1)를 플레이어별로 쌓고, 팀 합 / 총점 비율로 별 판정 0~3 을 낸다.
- 공용 UI·소리: 카운트 와이프, 연습 화살표, 타이밍 텔롭(FAST/SLOW/JUST), 상태 UI(별 게이지), START/FINISH/PERFECT 텔롭, JUST 효과음, 결과 앰비언트·징글.

게임 NRO 는 가상 훅(4절)만 덮어쓴다. 게임마다 다른 것은 채보 해석(`OnRmRecieveBeatEntry` 등), 판정, 화면이다.

| 코드 | 이름 | 사용자에게 보이는 리듬 동작 |
|---|---|---|
| mg1801 | 싹둑싹둑 수프 | 내려오는 채소를 박에 맞춰 Joy-Con 휘둘러 자르기 ([mg1801.md](../minigame/mg1801.md)) |
| mg1802 | 반짝반짝 과일 파르페 | 미분석 |
| mg1803 | 쑥쑥 바비큐 | 미분석 |
| mg1804 | 휙휙 햄버거 | 미분석 |
| mg1805 | 착착 버터 | 미분석 |
| mg1806 | 따라 할래 포즈 카레 | 미분석 |
| mg1807 | 달그락달그락 휘핑크림 | 미분석 |
| mg1808 | 따끈따끈 팬케이크 | 미분석 |
| mg1809 | 꾹꾹 샌드위치 | 미분석 |
| mg1810 | 팍팍 야채샐러드 | 미분석 |

이름은 [analysis/minigame_catalog.tsv](../../../analysis/minigame_catalog.tsv) [데이터]. 10종 모두 `mgListCA.json` `GameRule:"Rhythm"`, `Gyro:1` [데이터].

## 2. 분석 대상·자료 위치

| 항목 | 위치 |
|---|---|
| 공용 코드 | main `ca::rm::*` 0x7100425ce0~0x710044a000 (함수 목록 `analysis/functions/main.nso.tsv`) |
| 게임 코드 | `romfs/nro/NX_Release/mg1801.nro`~`mg1810.nro`, 리듬 쿠킹 모드 `rc_stage01.nro`, 미니게임 모드 `mgm01.nro` |
| 디컴파일·디스어셈블 | `analysis/decomp/main_ca_rm.c`, `rhythm_main1~3.c`, `rhythm_mg1801_1.c`, `rhythm_mg18NN_scene.c / _callers.c / _callsite.c`, `rhythm_rc1.c`, `rhythm_rc_stage01_all.c`, `rhythm_mgm1.c` |
| vtable 덤프 | `analysis/notes/rhythm_scene_vtables.txt`(NRO 11개), `rhythm_rmmgscenebase_vtable.txt`(main) |
| 사운드 | `Archive/sound~subarc_rc_cmn.nx.bea`(공용: 마스터 박자·OP·카운트·JUST SE), `sound~subarc_mg18NN.nx.bea`(게임 BGM·SE) → `extracted/bea/…/*.fsst`(FSAR) |
| 채보 | `Archive/mg~mg18NN.nx.bea` 안 `mg/mg18NN/data/mg18NN_rm_chartNN(s).json` (6.4 표) |
| 메시지 | `extracted/message/koKR/im_rc.json`(`im_rc_mode00~03` 노멀/롱/하드/리믹스, `im_rc_rank00~05`), `mgm01.json`(`mgm01_ui_rule_RhythmSetting00/01` 노멀/하드) |
| 도구 | `web/tools/analysis/rhythm_vtable.py`(NRO vtable), `web/tools/analysis/rhythm_fseq.py`(FSEQ 디스어셈블·변수 명령 검색), `web/tools/analysis/rhythm_seqsim.py`(박자 시퀀스 변수 시뮬레이터), `web/tools/analysis/ghidra_scripts/RhythmTool.java`(명령 파일로 disasm/decomp/refs/callsite/grepins) |
| Ghidra | `ghidra_work/rhythm/` 프로젝트 `jamboree_main`, `mg1801`, `mg18xx`(mg1802~1810), `rc_stage01`, `mgm01`. 명령 파일 `analysis/notes/cmds/*.txt` |

재현 예:

```sh
# 게임 BGM 이 언제 마디에 붙어 시작하는지(박자 변수 시뮬레이션)
.venv/Scripts/python web/tools/analysis/rhythm_seqsim.py mg1801 SMF_MID_BGM_MG1801_Begin 1000 4000
# 시퀀스 디스어셈블
.venv/Scripts/python web/tools/analysis/rhythm_fseq.py extracted/bea/sound~subarc_rc_cmn.nx.bea/audio/sounddata/subarc_rc_cmn/subarc_rc_cmn.fsst dis SEQ_BGM_RC_RHYTHM
# Scene vtable
.venv/Scripts/python web/tools/analysis/rhythm_vtable.py extracted/romfs/nro/NX_Release/mg1801.nro _ZTVN6mg18015SceneE
```

## 3. 구성 요소 [판독]

### 3.1 객체와 소유

`RmMgSceneBase`(장면, 0x478 B, `bq::MinigameScene` 상속)가 아래를 만들어 소유한다. 대부분 싱글턴(`bq::SingletonTemplate<T>::m_InstancePtr`)이라 게임 코드는 전역으로 접근한다.

| 장면 오프셋 | 객체 | 만드는 곳 | 역할 |
|---|---|---|---|
| +0x310 | `RmGameWork`(0xF50 B) | 생성자 @0x7100440e9c (싱글턴이 없을 때만) | 모드·BPM·박 타입·플레이어 순서·COM·점수·결과·사운드 핸들 |
| +0x318 | `RmFileMan` | SetupGame | 아카이브 로드 |
| +0x320 | `RmChartDataMan` | SetupGame | 채보 JSON |
| +0x328 | `RmSoundMan`(파이버) | SetupGame | 마스터·게임·종료 BGM, JUST SE |
| +0x360 | `RmCmnParamMan` | SetupGame | 공용 파라미터 |
| +0x330 | `RmUiStatusMan`(파이버) | SyncedSetupGame | 플레이어 점수·팀 별 게이지 |
| +0x338 | `RmUiTelopMan` | SyncedSetupGame | 타이밍 텔롭, START/FINISH, PERFECT |
| +0x340 | 타이밍 원(`RmTimingCircleMan` [추정: 주소 인접]) | SyncedSetupGame | 종료 때 숨김 |
| +0x348 | `RmPracticeArrowMan` | SyncedSetupGame | 카운트인 때 연습 화살표 4개 |
| +0x350 | `RmStarEffectMan` [추정: 주소 인접] | SyncedSetupGame | 점수 가산 입구(5.1) |
| +0x358 | 결과 연출 매니저(이름 없음, 파이버) | SyncedSetupGame | 결과 캐릭터 모션·징글 |
| +0x368 | `RmUiCntWipe` | SyncedSetupGame | 시작 와이프, 컨트롤 안내 와이프 |

생성자는 사운드 아카이브 `sound/subarc_rc_cmn`, 아카이브 `mg/mg1800`, `libca/mg_common`, 플레이어 모션 `rhy`·`rc` 를 로드하고 **고정 60fps** 를 강제한다(`FUN_710019642c(…,1)`, core 담당 확인) [판독].

### 3.2 RmGameWork 필드 [판독]

기준 객체: `ca::rm::RmGameWork`. +0x08~+0x730 은 장면 사이로 보존되는 모드워크 `ca::rm::RmModeWorkData`(0x728 B)다. 리듬 쿠킹은 이것을 `bq::WorkModule+0x1CF0` 버퍼에 Push/Pull 한다(매직 0x20230822, 크기 0x728 가 맞을 때만). 기본값은 `FUN_7100428720`.

| 오프셋 | 이름(웹 권장) | 기본 | writer | reader |
|---|---|---|---|---|
| +0x1C | `inRhythmCooking` | 0 | rc_stage01 `SettingGameWork`=1 | IsChartDataFree, IsInstActive, 단계 머신 |
| +0x20 | `mode` 0 노멀/1 롱/2 하드/3 리믹스 | 0 | SyncedSetupGame(PlayMode 1: `RhythmWork.mode ? 2 : 0`), rc_stage01 | 채보·BGM 선택, `IsOutLineGuideDispEnable`(=mode<2) |
| +0x24 | `mainBeatType` | 1 | `SetMainBeatType` | OnGameMain |
| +0x2C | 코스에서 뒤에 게임이 더 남음 | 0 | rc_stage01 `PreGameWaitFunc` 단계 9 `@0x71000355ec/f4` (`idx < 코스수−1`) | 종료·결과 분기 [판독, [rc_stage01.md](../minigame/rc_stage01.md)]. **정정:** 이전 판은 [추정: 메들리] |
| +0x30 | `bpm` | **120** | `SetBpm`(rc_stage01 만) | `GetBpm` → 모든 박자 계산 |
| +0x34 | `courseProgress` 0/1/2 | 0 | rc_stage01 | — |
| +0x38 | `courseIndex` | 0 | CleanupGame(+1), rc_stage01 | 결과 기록 위치, 롱 BPM |
| +0x3C | `courseCount` | 1 | rc_stage01 | 롱 BPM |
| +0x44+i·4 | 코스 미니게임 ID 목록 | 첫 칸 −1, 나머지 0 | rc_stage01 | 결과 |
| +0x6C+i·4 | 코스 리믹스 채보 번호 | 0 | rc_stage01 | SyncedSetupGame(리믹스) |
| +0xC0+i·0x90 | 결과 기록(6.3) | 0 | `FUN_710042ca10` | `GetResult*` |
| +0x660/+0x664 | 코스 평균 등급·비율 | 0 | `FUN_710042ca10` | rc_stage01 결과 |
| +0x678/+0x690/+0x6A8 | 사운드 핸들 마스터 / OP / 게임 BGM | — | RmSoundMan | RmSoundMan |
| +0x6C0/+0x6C1/+0x6C2 | 위 셋 재생 중 플래그 | 0 | RmSoundMan | RmSoundMan |
| +0x6C8 | 현재 리믹스 채보 번호 | 0 | SetupGame(0), SyncedSetupGame | `GetRemixChartNo` |
| +0x6CC | `comScoreIgnore` | 0 | rc_stage01 | 점수·총점 |
| +0x730~ | 백업 모드워크(같은 기본값, +0x758=백업 BPM) | — | 생성자만 | `RestartRmGameModeWork` |
| +0xE58 | `isCom` 비트 벡터(PlayerID) | — | 생성자(PlayerType==1) | `IsPlayerCom` |
| +0xE88 / +0xEA0 | PlayerID→순서 / 순서→PlayerID | — | 생성자(`PlayerWork::GetOrder` 정렬) | `GetPlayerOrder` / `GetOrderToPlayerId` |
| +0xEB8 | 사람 수 | — | 생성자 | `SetStarTotalScore`(comScoreIgnore) |
| +0xEBC+p·4 | `score[p]` 0..999 | 0 | `FUN_710042a6b8`(가산), `FUN_710042a624`(설정) | 결과 |
| +0xED0+p·0x18 | 플레이어 엔티티 | — | `SetPlayerEntity`(게임) | 결과 연출 |

### 3.3 RmMgSceneBase 필드 [판독]

| 오프셋 | 이름(웹 권장) | 초기(SetupGame) | 뜻 |
|---|---|---|---|
| +0x370 | `stage` | 0 | 단계(7절) |
| +0x374 | `timer` f32 | 0 | 단계 8·9 대기, 결과 |
| +0x378 | `elapsedFrame` | 0 | Entry 처리 프레임 수(`GetElapsedFrame`) |
| +0x37C / +0x380 | `row` / `lastBeat` | 0 / −1 | Entry 줄 인덱스, 마지막 처리 박 상태(단계 1·3 에서는 박 수 세기에 재사용) |
| +0x384 / +0x388 | `lockRow` / `lockLastBeat` | 0 / −1 | Lock 줄 인덱스(종료 판정 기준) |
| +0x390 / +0x3A8 / +0x3C0 | 메인 / 게임 / 종료 BGM 이름 | — | `SetMainBgmName`(재생에 안 쓰임) / `SetGameBgmName` / `SetGameBgmFinName` |
| +0x3D8 | 확정된 게임 BGM 이름 | — | `FUN_7100441990`(6.2) |
| +0x420 / +0x421 / +0x424 | `beforeOneBeat` / `useBeatCheck` / `beforeBeatType` | 0 / – / 1 | `SetMgBgmBeforeOneBeatStart` |
| +0x428 | `nextOffset` | −1 | `SetNextChartDataOffset` |
| +0x42C | `statusUiEnable` | 1 | 상태 UI 표시 |
| +0x430 | 보정 BGM 핸들 | — | `SQ_BGM_RC_CALIBRATION` |
| +0x460~+0x463 | 결과 연출 진행 플래그 | 0 | |
| +0x464 | 결과 스킵 값 | — | `SetResultSkip` |
| +0x468 | 단계 10 대기 플래그 | 0 | 게임이 세움 |
| +0x469 | `forceEnd` | 0 | `SetGameEndForce` |
| +0x470 | `chart01` (BGM `_C`) | 0 | 채보 경로에 "chart01." 이 있으면 1 |
| +0x471 / +0x472 / +0x473 | 결과 앰비언트 / 환호 / 와이프 페이드 발동 1회 플래그 | 0 | |

## 4. 가상 훅 (vtable) [데이터][판독]

기반 vtable: main 0x71019f1e20(주소점 +0x10, `analysis/notes/rhythm_rmmgscenebase_vtable.txt`). 게임 Scene vtable 은 0x350 B 로 같은 배치다. 0x2A0 이하는 `bq::MinigameScene` 흐름 슬롯이고 기반 클래스가 `RmMgSceneBase::*`로 채운다. 아래는 리듬 전용 슬롯과 기반이 덮는 흐름 슬롯이다.

| 슬롯 | 이름 | 기반 구현 | 호출하는 곳 |
|---|---|---|---|
| +0x148 / +0x150 / +0x158 | SetupGame / SyncedSetupGame / CleanupGame | 5.1 | 장면 수명(core 담당) |
| +0x1C8 | OnGameInit | 리듬 쿠킹 2번째 이후 게임은 4박째까지 대기, 레이어 0 켜기 | MinigameFlow |
| +0x230 / +0x238 | OnGameStartAfter / **OnGameMain** | 마스터 BGM 시작 / 7절 단계 머신 | MinigameFlow(매 프레임) [추정: 흐름 상세는 scene·core 담당] |
| +0x240 / +0x248 | OnGameEnd / OnGameFinish | 페이드 후 vt+0x2F0 / vt+0x2F8 | |
| +0x270 / +0x278 | OnGameEndingBefore / OnGameEnding | 결과 준비·결과 소리 | |
| +0x290 / +0x298 | OnGameLastFade / OnGameExit | stage=0 / vt+0x320 | |
| **+0x2A0** | RmSyncedSetupGame | 빈 함수 | SyncedSetupGame 가운데 |
| +0x2A8 | RmCleanupGame | 빈 함수 | CleanupGame 처음 |
| +0x2B0 | OnRmGameStartAfter | 1 반환 | OnGameStartAfter 끝 |
| +0x2B8 | TrigRmGameWipeFadeOutStart | 빈 함수 | 단계 0·1 (1회) |
| +0x2C0 | TrigRmGameMainBgmPracticeStart | 빈 함수 | 단계 2 |
| +0x2C8 | TrigRmGameMainBgmPracticeFinish | 빈 함수 | 단계 2(inst/리믹스)·3 |
| +0x2D0 | TrigRmGameMainBgmIntroStart | 빈 함수 | 단계 2(inst)·4 |
| +0x2D8 | TrigRmGameMainBgmTopStart | 빈 함수 | 단계 5 |
| +0x2E0 | OnRmGameMain | 1 반환 | OnGameMain 끝(반환값이 OnGameMain 반환) |
| +0x2E8 | TrigRmGameMainChartEnd | 1 반환 | 단계 7 |
| +0x2F0 | OnRmGameEnd | 1 반환 | OnGameEnd |
| +0x2F8 | OnRmGameFinish | 1 반환 | OnGameFinish |
| +0x300 | TrigRmGameEndingSetting | 빈 함수 | OnGameEndingBefore·OnGameExit |
| +0x308 / +0x310 | OnRmGameEndingFree / …Medley | 결과 연출 끝 여부 | OnGameEnding (리듬 쿠킹이면 Medley) |
| +0x318 | TrigRmGameResultCaptureSetting | 빈 함수 | OnGameExit(메들리 결과) |
| +0x320 | OnRmGameExit | 1 반환 | OnGameExit 끝 |
| **+0x328** | OnRmRecieveBeatEntry(Data) | 빈 함수 | OnGameMain 꼬리(줄 배분) |
| +0x330 | OnRmRecieveBeatEntryLock(Data) | 빈 함수 | OnGameMain 꼬리(단계 ≥6) |
| +0x338 | OnRmRecieveBeatNextEntry(Data) | 빈 함수 | OnGameMain 꼬리(`nextOffset>0`) |

빈 함수 주소: +0x2A0 @0x7100443e48, +0x2A8 @0x7100443e4c, +0x2C0 @0x7100445d38, +0x2E0 @0x7100445d48(`mov w0,#1`), +0x2E8 @0x7100445d50(ret), +0x300 @0x7100445614, +0x318 @0x7100445ad8 [판독]. 이름은 게임 NRO 의 덮어쓴 함수 심볼과 기반 export 심볼에서 왔다 [데이터].

### 4.1 게임별 덮어쓰기 (vtable 비교) [데이터]

O = 게임이 덮어씀, · = 기반 그대로.

| 슬롯 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| RmSyncedSetupGame, RmCleanupGame, OnRmGameStartAfter, PracticeStart, OnRmGameMain, ChartEnd, EndingSetting, ResultCaptureSetting, OnRmRecieveBeatEntry | O | O | O | O | O | O | O | O | O | O |
| TrigRmGameWipeFadeOutStart | · | · | · | · | · | · | O | · | · | · |
| TrigRmGameMainBgmPracticeFinish | · | · | · | · | · | · | · | O | · | · |
| TrigRmGameMainBgmIntroStart | · | · | · | · | · | · | · | · | · | · |
| TrigRmGameMainBgmTopStart | O | O | · | O | O | O | O | O | O | O |
| OnRmGameEnd | · | · | O | · | O | · | · | · | · | O |
| OnRmGameFinish | · | · | · | · | · | · | · | · | · | · |
| OnRmRecieveBeatEntryLock | · | O | O | · | O | O | O | O | · | · |
| OnRmRecieveBeatNextEntry | · | O | · | O | · | O | O | O | O | · |

- mg1807 은 NextEntry 를 덮어쓰지만 `SetNextChartDataOffset`을 부르지 않아(오프셋 −1) **호출되지 않는다** [판독, 원본 그대로].
- `rc_stage01::Scene` 은 `RmMgSceneBase` 파생이 아니다(vtable 0x1B0 B) [데이터].

### 4.2 Data 구조체(훅 인자) [판독]

`ca::rm::RmMgSceneBase::Data` 0xC8 B, OnGameMain 스택에서 만든다.

| 오프셋 | 내용 |
|---|---|
| +0x00 | int 줄 번호(Entry=+0x37C, Lock=+0x384, Next=+0x37C+오프셋) |
| +0x04 | int 박 상태(`GetBeatState(mainBeatType)`) |
| +0x08 + i·0x18 | `std::string` 열 i = 1P, 2P, 3P, 4P, OBJ1, OBJ2, OBJ3, OBJ4 (i=0..7) |

## 5. 박자 시계와 BPM

### 5.1 원본 구조 [판독][데이터]

박자는 **코드 프레임 수가 아니라 사운드 시퀀서**가 만든다. 시퀀서와 코드는 사운드 전역 변수(`SoundModule::ReadGlobalVariable/WriteGlobalVariable`, 시퀀스 변수 번호 16+n)로 주고받는다.

| 전역 | 쓰는 쪽 | 읽는 쪽 | 뜻 |
|---|---|---|---|
| G11 | 코드: `SetBpm`, `SyncedSetupGame`(`FUN_71000bf558(g,0xB,bpm)`) | 모든 리듬 시퀀스 `TEMPO_CHECK`: 0≤G11≤1023 이면 `tempo G11`, 아니면 120 (매 틱) | **템포 = BPM** |
| G12 | 마스터 countTrack(마디 첫 틱, G10==1 일 때 G12=G13) | 게임 BGM `STARTTRIGGER_CHECK`, 코드 `FUN_7100426b8c/26d24` | 지금 마디부터 연주할 곡 ID |
| G13 | 각 BGM 시퀀스 시작(곡 ID), `BLOCK_ENDING`=6, `SQ_BGM_RC_STOP`=10000 | 마스터 | 연주 요청 곡 ID |
| G10 | 나가는 시퀀스 `ENDPLAY_CHECK`(마디 끝 8틱 전, G13 이 자기 ID 와 다르면) | 마스터 | 교대 요청 |
| **G14** | 마스터 countTrack: 마디마다 `G14=1`, 24틱마다 +1 (16회) | 코드 `GetBeatState` | **마디 안 16분음표 위치 1..16** |
| 0..15 전부 | 코드 `FUN_7100426030`(CleanupGame 등)이 −1 로 초기화 | | |

- 마스터 시퀀스: `subarc_rc_cmn.fsst` 라벨 `SEQ_BGM_RC_RHYTHM`(트랙 0 템포, 1 countTrack, 2 rhythmdrumTrack, 3·4 필인). timebase 96(4분음표 = 96틱), 1마디 = 384틱 [데이터]. 코드 이름 `SQ_BGM_RC_MAIN_RHYTHM` ↔ 이 라벨 대응은 [추정](G14 를 쓰는 유일한 시퀀스).
- 시작: 코드 `FUN_71004263c8`(OnGameStartAfter)이 마스터와 `SQ_BGM_RC_MGCMN_OP`을 같은 프레임에 재생. OP 트랙 0 이 곧바로 G13=1 → 마스터가 다음 틱부터 센다 [데이터 + 재구현 계산].
- 곡 ID: `18NN1` = mg18NN A(=B), `18NN3` = C(하드), `18NN4` = A_INTER_END, 100 = RC_GENERIC, 50 = MG_ENDING, 1 = MGCMN_OP, 2·3·4·5·400·18000 = 리듬 쿠킹 전용 곡 [데이터, sound 담당과 일치]. 원본 특이점: `SMF_MID_BGM_MG1809_C` 는 18083 을 쓴다.

```
GetBeatState(type) = (int) ceil( f32(G14) * {0:0.25, 1:0.5, 2:0.5, 그 밖: 1} )      main @0x7100425ce0 (frintp)
BEATS_PER_BAR      = [4, 8, 8, 16, 16, 32]                                          main @0x71015d8eb0
BEAT_SCALE         = [1.0, 0.5, 0.5, 0.25, 0.25, 0.125]                             main @0x71015d8dc4
GetBeatToSec(t, n) = (60 / (float)BPM) * (float)n * BEAT_SCALE[t]                   @0x7100425d90
GetBeatToFrame(t,n)= (int)(GetBeatToSec(t, n) * 60.0)                               @0x7100425df0
GetPlayRate()      = (float)BPM / 120                                               @0x7100425e60
GetBPM()           = RmGameWork::GetBpm()                                           @0x7100425d40
```

| BEAT_TYPE | 단위 | `GetBeatState` 범위 | 바뀌는 G14 |
|---|---|---|---|
| 0 | 4분 | 1..4 | 1, 5, 9, 13 |
| 1, 2 | 8분 | 1..8 | 1, 3, 5, …, 15 |
| 3, 4 | 16분 | 1..16 | 매번 |
| 5 | 32분(표만) | 1..16 (원값) | 매번 |

- 상태가 `BEATS_PER_BAR[type]`과 같으면 그 마디의 마지막 단위다. `SetMgBgmBeforeOneBeatStart`가 이것을 "한 박 전"으로 쓴다(7절).
- **정정**: 이전 문서의 절삭식은 디컴파일러 오류였다(`frintp` = 올림) [판독].

### 5.2 BPM [판독]

- `RmGameWork` 생성자 기본값 120. 이것을 바꾸는 코드는 `rc_stage01::Scene::SettingBpm`/`SyncedSetupGame` 뿐이다: 모드≠1 → 120, 모드 1(롱)이고 `courseIndex ≥ courseCount/2` → `Params.speedup_bpm`(기본 180), 롱 전반부 → 그대로.
- 따라서 **리듬 쿠킹 밖(미니게임 모드·파티)에서는 항상 120** 이다.
- 롱 모드 전환 연출 `SQ_BGM_RC_BPMUP` 시퀀스는 G11 을 123→…→180 으로 직접 올린다 [데이터].
- BPM > 120 이면 게임 BGM 이름에 `_B`(7.2). `_B` 는 A 와 같은 시퀀스 데이터(sound 담당 확인)라 템포만 다르다.
- 박자에 맞춘 모션 속도는 `GetPlayRate()`(BPM/120), 연습 화살표 모션도 BPM/120 [판독].

### 5.3 게임 BGM 마디 동기 [데이터][재구현 계산]

```
요청(코드가 Play) → BGM 트랙 0: G13 = 곡ID, 모든 트랙 STARTTRIGGER_CHECK(1틱마다 G12==곡ID?)
나가는 곡의 ENDPLAY_CHECK(마디 끝 8틱 전): G13 ≠ 자기 → G10 = 1, 종료
마스터 countTrack 마디 첫 틱: G10==1 이면 G12 = G13 → 게임 BGM 0틱 = 이 마디 경계
게임 BGM 트랙 1: 0틱 L0=0 … 192틱(2박) L0=1   ← 코드 FUN_7100426c2c 가 BGM 로컬 변수 0 을 읽는다
```

`web/tools/analysis/rhythm_seqsim.py` 결과(마스터·OP 틱 0 시작): 요청 틱 1000 → 시작 1153(마디 3), 요청 1152/1154 → 시작 1537(마디 4). L0=1 은 언제나 시작 +192틱. mg1801~1810 의 A·C 20곡 모두 같다 [재구현 계산]. sound 담당 렌더 대조: `SM_BGM_MG1801_DH`(감상용 녹음) = A 0~40.000 s + MG_ENDING → 아래 7.3 계산(종료 BGM 이 BGM 시작 20마디 = 40 s 뒤)과 맞는다.

## 6. 채보 (RmChartDataMan) [판독][데이터]

### 6.1 읽기

`ReadChartData(path)` @0x710043ecd0: `bq::DataBaseJsonReader::ParseFromAsset` 후 키 8개를 이 순서로 `FUN_710043ef34`(배열 읽기)한다: `1P, 2P, 3P, 4P, OBJ1, OBJ2, OBJ3, OBJ4`.
- 항목은 RTTI `Data`(0x20 B) — `{"code":"…"}` 문자열(최대 0x20 B 고정 버퍼) [판독].
- 키가 없으면 그 키를 건너뛰고 **다음 키가 그 열 번호를 차지한다**(열 카운터 +0x10 이 성공할 때만 증가) [판독, 원본 특이점]. 실채보 33개는 8키가 모두 있다 [데이터].
- `GetDataSize()` = 열 0(1P) 배열 길이, 열이 하나도 없으면 0. `GetItemStr(row, col)` = 그 칸 문자열 [판독].
- `FUN_710043ecc0` = 열 수 > 0(읽힘), `FUN_710043f414` = +0x15 "채보 끝" 플래그(쓰는 코드 없음, 디버그용 [추정]).

### 6.2 채보 고르기 (mg1801 형) [판독 mg1801 RmSyncedSetupGame @0x710000e914]

```
IsChartDataFree() = RmGameWork.inRhythmCooking != 1 && WorkModule.GetPlayMode() != 1     main @0x710044316c
if (!IsChartDataFree()) {
  mode 0, 1 → "<mg>_rm_chart00.json";  mode 2 → "chart01.json";  mode 3 → "chart%02ds.json" % GetRemixChartNo()
} else {
  mode 3 → "chart%02ds.json" % Params.chartNo;  그 밖 → "chart%02d.json" % Params.chartNo   (Params.chartNo 기본 0)
}
```

- mg1801·1803·1805·1807·1808·1810 은 같은 형식 문자열을 가진다. mg1802·1804·1806·1809 는 `chartNN`/`rm_chart%02d` 조각 표로 이름을 만든다 [데이터: NRO 문자열]. 게임별 세부는 게임 문서에서 판독한다.
- 채보 경로에 `"chart01."`이 들어 있으면 `+0x470 = 1`(BGM `_C`) [판독 SyncedSetupGame].

### 6.3 게임 BGM·종료 BGM 이름 [판독 FUN_7100441990, FUN_71004421a0]

```
게임 BGM = SetGameBgmName 값                       (게임 Params.isGenericBgm 이면 "SQ_BGM_RC_GENERIC")
if mode == 3: "SQ_BGM_RC_REMIX"
elif 이름에 "SQ_BGM_" + upper(mg이름) 포함:
    if BPM > 120: "SQ_BGM_<MG>_B"
    if mode == 2 or chart01: "SQ_BGM_<MG>_C"          (뒤가 앞을 덮는다)
inst(조작 설명) BGM = "SQ_BGM_RC_" + upper(mg) + "_INST" (+ "_C" if mode == 2)   FUN_7100426580
결과 앰비언트 = "SM_AMB_" + upper(mg) + "_MG_RESULT",  결과 징글 = "SM_JIN_<MG>_MG_RESULT_GOOD|BAD"
```

종료 BGM(`SetGameBgmFinName`)도 같은 규칙의 변환을 거친다(`FUN_71004421a0`, mg1801 `SQ_BGM_MG1801_MG_ENDING`) [판독: 호출 구조, 변환 세부는 이름 함수와 같은 꼴 [추정]].

### 6.4 게임별 채보 파일 [데이터]

| 게임 | 파일(줄 수) | 칸 코드 예 |
|---|---|---|
| mg1801 | chart00(150), chart01(150), chart05s(30) | 1P~4P `SC MC LC XC ZC`(채소+C), OBJ1 `L`, OBJ2~4 `C`/`E` |
| mg1802 | chart00(168), chart00s(54), chart01(168), chart06s(54), chart09s(64) | `L_K1_T2_S1`, `R_K7_00_T8_S2`, `SC`, 숫자 |
| mg1803 | chart00(152), chart01(150), chart05s(30) | `A F M P R S T Y` |
| mg1804 | chart00(238), chart00s(54), chart01(238) | `B123 C0 E1 L1`, `D=L:W=1:A=22.5:T=1` |
| mg1805 | chart00(136), chart01(136), chart05s(30) | `S M X SB MB XB` |
| mg1806 | chart00(208), chart00s(54), chart01(208), chart06s(54) | `POSE_00..04`, `M_PHASE_S/SH/SL`, `P_PHASE`, `W_PHASE`, `12 34 1234` |
| mg1807 | chart00(152), chart01(152), chart05s(32) | `B1_S B3_M L2 R S` |
| mg1808 | chart00(192), chart00s(54), chart01(192) | `B2 B4 B4R BREAK E L M S 12 34` |
| mg1809 | chart00(176), chart00s(56), chart01(176), chart09s(62) | `AL10_6 CR10_10 ML10_6 TL10_10 P4 W 1..4` |
| mg1810 | chart00(172), chart01(172), chart06s(54), chart09s(56) | `KB NJ RD SI TM 1 2 4 20` |

모든 파일이 8키, 열 길이가 같다(UTF-8 BOM) [데이터]. 리믹스 채보(`s`)의 번호는 코스 표(+0x6C)에서 온다.

## 7. 진행 단계 (OnGameMain) [판독 @0x71004441e8]

### 7.1 단계 표

`beat4 = GetBeatState(0)`, `iVar5 = GetBeatState(mainBeatType)`. `inst` = `IsInstActive()`(조작 설명 화면 안 실행 = `bq::flag::Check(0) && !inRhythmCooking`), `remix` = mode==3 && courseIndex>0, `mode3` = mode==3. "→ N" 은 같은 프레임에 이어서 실행.

| 단계 | 대기 조건 | 하는 일 |
|---|---|---|
| 0 | `beat4 == 1` | 와이프 닫기 시작, `TrigRmGameWipeFadeOutStart`(1회), 박 세기 시작 → 1 |
| 1 | `beat4 > 3` 이고 와이프 끝 | 박마다 카운트. 컨트롤 안내 와이프면 4박 뒤 `SQ_BGM_RC_CALIBRATION`. → 2 |
| 2 | `beat4 == 1` (그리고 G14≠16) | 줄 인덱스 초기화, `PracticeStart`, 게임 BGM 요청, 연습 화살표 → 3 (inst: Practice*·IntroStart → 4, remix: Practice* → 4) |
| 3 | 게임 BGM 접수(G12 바뀜) | 박마다 `SQ_SE_MG1800_COUNT_STICK`(최대 4), `beat4>2` 면 화살표 숨김. 접수되면 `PracticeFinish` → 4 |
| 4 | 게임 BGM L0==1 이고 G14≠16 | BGM 위치 기록, `IntroStart` → 5 |
| 5 | `beat4 == 1` | 프리셋 `mg1800_cmn`, `TopStart`, START 텔롭, 상태 UI 표시 → 6 |
| 6 | Lock 줄 ≥ 줄수−4 (inst: ≥줄수) 또는 끝/강제 플래그 | 종료 BGM 요청 → 7 |
| 7 | 종료 BGM 접수(G12 바뀜) (mode3·inst 는 즉시) | `TrigRmGameMainChartEnd`, FINISH 텔롭, 타이밍 원 숨김, 비트 진동 정지 → 8 (inst → 9) |
| 8 | 1박 | 결과 기록(8.3), PERFECT 텔롭 → 9 |
| 9 | 7박 (inst 0박) | 게임 BGM·마스터 정지 → 10 |
| 10 | 게임이 `+0x468` 을 세우지 않음 | OnGameMain 1 반환(끝) |

단계별 세부 조건·호출 함수 주소는 [mg1801_rhythm.md 5절](../../../analysis/notes/mg1801_rhythm.md)에 있다.

### 7.2 줄 배분 꼬리 [판독]

```ts
// OnGameMain 의 case 에서 조기 반환하지 않으면 매 프레임
if (stage < 6) {
  if (beforeOneBeat && stage > 3 &&
      (!useBeatCheck || GetBeatState(beforeBeatType) === BEATS_PER_BAR[beforeBeatType])) entry();
} else {
  if (lockLastBeat !== iVar5 && lockRow < size && !chartEnd && !forceEnd) {
    hooks.onBeatEntryLock({ row: lockRow, beat: iVar5, cols: chart.row(lockRow) });
    lockLastBeat = iVar5; lockRow++;
  }
  entry();
}
return hooks.onRmGameMain();   // vt+0x2E0

function entry() {
  elapsedFrame++;
  if (lastBeat !== iVar5 && row < size && !chartEnd && !forceEnd) {
    hooks.onBeatEntry({ row, beat: iVar5, cols: chart.row(row) });                       // vt+0x328
    if (nextOffset > 0 && row + nextOffset < size)
      hooks.onBeatNextEntry({ row: row + nextOffset, beat: iVar5, cols: chart.row(row + nextOffset) });  // vt+0x338
    lastBeat = iVar5; row++;
  }
}
```

- 박 상태가 **바뀐 프레임**마다 한 줄. 같은 박 안에서 두 줄이 나가지 않는다.
- 종료 판정은 Lock 줄 기준이다. BeforeOneBeat 게임은 Entry 줄이 Lock 줄보다 앞선다(mg1801 은 2줄).
- 단계 7~9 동안에도 남은 줄은 배분된다.

### 7.3 줄 ↔ 마스터 시계 (BeforeOneBeat(1, 0), mainBeatType 1) [재구현 계산]

마디 A = 단계 2 가 시작된 마디, B = A+1(게임 BGM 시작 마디).

| 시점 | 일 |
|---|---|
| A 1박 | PracticeStart, 게임 BGM 요청, 카운트 1 |
| A 2·3·4박 | 카운트 2·3·4 |
| B 1박 | 게임 BGM 0틱, PracticeFinish |
| B 3박 | L0=1 → IntroStart |
| B 4박 / +8분 | 줄 0 / 줄 1 |
| B+1 1박 | TopStart, 줄 2, START 텔롭 |

- 줄 r = B 시작 + (6 + r) × 8분음표. BPM 120: 8분 = 0.25 s = 15프레임.
- 다른 설정: (1,1) 이면 `GetBeatState(1)==8`(B 마지막 8분)부터 → 줄 0 이 B+(7/8)마디, 줄 1 이 B+1 1박. BeforeOneBeat 없음이면 줄 0 이 B+1 1박 [재구현 계산].
- 종료: Lock 줄 = 줄수−4 가 되는 프레임에 종료 BGM 요청 → 다음 마디 경계에서 종료 BGM 시작과 단계 7. mg1801 chart00(150줄): Entry 148번 줄 = B+19.25 마디 → B+20 마디(40 s) [재구현 계산, sound 렌더와 일치].
- 사운드 → 프레임 관측 지연은 **[미확정]**.

## 8. 점수·별·결과

### 8.1 점수 [판독]

```
게임 판정 → RmStarEffectMan::Start(from, to, time, playerId, points)        @0x710044696c (벡터·시간 무시)
  → FUN_710042a6b8(gw, playerId, points):
      if (gw.comScoreIgnore && gw.isCom(playerId)) return
      score[pid] = clamp(score[pid] + points, 0, 999)
      StatusMan.setValue(pid, score[pid])                                        FUN_71004361c4
          if (new − old ≥ 2) justCount[pid]++                                     (StatusMan+0x60)
          teamSum = min(Σ value, 999);  achieved = clamp(teamSum, 0, total)       (StatusHolder+0x44)
```

| 판정(mg1801 실측 경로) | points |
|---|---|
| JUST | 2 |
| FAST, SLOW | 1 |
| 판정 없음 | 0 |

- 총점: 게임이 `SetStarTotalScore(total)`(mg1801 = Σ자르기 수×2). `comScoreIgnore` 이면 `total = 사람 수 × trunc(total/4)` [판독 @0x7100436478].
- `SetPersonalPlayNum(pid, n)` = 결과 최대 점수용 개인 횟수, `SetPersonalPlayNumExt(pid, a, b)` = 추가 최대 점수 `a·b`(mg1807·1810 사용) [판독][데이터].
- `FUN_710042a624(gw, pid, v)` = 점수 직접 설정(CleanupGame 이 0 으로).
- 기준 객체 주의: StatusHolder(`**(RmUiStatusMan+0x40)`) +0x44 = 달성, +0x48 = 총점. RmUiStatusMan +0x48 은 STATUS_TYPE(게임이 2 를 넘기지만 미니게임 ID 0x6B~0x74 면 3 으로 바뀜) [판독 @0x7100435fe8].

### 8.2 별 판정 [판독]

```
rate  = clamp(achieved / total * 100, 0, 100)          GetStarAchieveRate @0x7100436558 (f32)
judge = rate >= 80 ? 3 : rate >= 40 ? 2 : rate > 0 ? 1 : 0     GetStarAchieveJudge @0x7100436590
grade = (int)(rate / 20)   // 0..5                        FUN_7100436600
```

- mg1801: `mg1801_soup%02d.fmdb` = judge. 결과 징글 judge>1 → `SM_JIN_<MG>_MG_RESULT_GOOD`, 아니면 `_BAD` [판독].
- OnGameEnding: `rate/20 < 0.1`(rate < 2) 이면 결과 앰비언트를 내지 않는다. 환호 `SQ_SE_RC_CHEER_MG_FIN` 로컬 변수 5 = (int)rate [판독].

### 8.3 결과 기록 [판독 FUN_710042ca10]

기준 `RmGameWork + courseIndex·0x90`: +0xC0 미니게임 ID, +0xC4[4] 개인 횟수, +0xD4[4] JUST 횟수, +0xE4[4] 점수, +0xF4[4]/+0x104[4] Ext a/b, +0x114 팀 달성, +0x118 총점, +0x11C rate, +0x120 judge, +0x124 grade. 코스 평균 → +0x660 = (int)(평균rate/20) (셰프 등급 `im_rc_rank00~05`), +0x664 = 0.1 단위 내림×20.
- `GetResultPlayerScoreMax(i,p) = ExtA·ExtB + playNum·2`. 점수 == 최대면 PERFECT 텔롭(`FUN_710043af00`)과 업적 0x81 [판독].

## 9. 공용 소리·UI

### 9.1 RmSoundMan [판독 0x7100425e94~0x7100427d50]

| 함수 | 소리 | 조건 |
|---|---|---|
| `FUN_71004263c8` (StartMainBgm, OnGameStartAfter) | `SQ_BGM_RC_MAIN_RHYTHM`, `SQ_BGM_RC_MGCMN_OP` | 각각 재생 중이 아니면 |
| `FUN_7100426948` (단계 2) | 게임 BGM(6.3) | 재생 중이 아니면 |
| `FUN_71004269d8` (단계 6) | 종료 BGM | |
| `FUN_7100426580` (inst) | `SQ_BGM_RC_<MG>_INST(_C)` | |
| `StopMainBgm` / `FUN_7100426264` | 마스터·OP 정지 / 게임 BGM 정지 | 단계 9 |
| 단계 3 | `SQ_SE_MG1800_COUNT_STICK` | 박마다 4회 |
| 단계 1 | `SQ_BGM_RC_CALIBRATION` | 컨트롤 안내 와이프 |
| `PlayExcellentSe(n, keepMax)` @0x7100426e38 | `SQ_SE_RC_JUST` | 아래 |

```
PlayExcellentSe(n, keepMax):          // mg1801 JUST: n = -1, keepMax = true
  t = since(마지막 JUST SE)            // 보조 파이버가 매 프레임 dt 누적 (FUN_7100427040)
  half = (60/BPM) * 0.5               // 시작 BGM 때 저장
  if (핸들 없음 || t >= half || (n < 0 && count > 3)) { Play("SQ_SE_RC_JUST"); t = 0; count = n < 0 ? 1 : n; }
  else { count = n < 0 ? count + 1 : keepMax ? max(count, n) : min(count, n); }
  핸들.WriteLocalVariable(0, count)     // 반 박 안에 겹친 JUST 수 (시퀀스가 화음 수로 씀 [추정])
```

### 9.2 UI [판독]

| 부품 | 공용 함수 | 동작 |
|---|---|---|
| 타이밍 텔롭 | `RmUiTelopMan::ShowTimingTelop(pid, type, pos3d, f)` @0x710043a800 | type 0 FAST, 1 SLOW, 2 JUST(mg1801 실측). 플레이어당 슬롯 8개를 원형으로 쓰고(+0x13F0 &7), 살아 있는 이전 텔롭 위치를 순서만큼 옮긴다(세부 이동량은 ui 담당). comScoreIgnore 이고 COM 이면 표시 안 함 |
| START/FINISH | `FUN_710043ad30(telop, 0/1)` → `bq::ComUiMGTelop::Start` | 단계 5 / 7 (리듬 쿠킹·inst 제외) |
| PERFECT | `FUN_710043af00` | 단계 8, 점수 == 최대인 플레이어 |
| 상태 UI | `RmUiStatusMan`, `bq::ComUiStatus` | 플레이어 값·팀 게이지, `Hide`, `FUN_7100436030`(표시), `FUN_71004360bc`(아웃) |
| 카운트 와이프 | `RmUiCntWipe` | 단계 0~1, 컨트롤 안내 와이프(+0x1D, 기본 표시, PlayMode 1·inst·리믹스 2번째 이후 끔) |
| 연습 화살표 | `RmPracticeArrowMan` | 단계 2 표시(모션 속도 BPM/120), 단계 3 의 3박부터 숨김 |
| 공용 이펙트 | `util::ShowCommonEffect(id, pos)` | id 0 `mg1800_success01`, 1 `mg1800_success00` (effect 담당) |
| 비트 패드 진동 | `RmBeatPadVibrationMan` | OnGameStartAfter 시작, 단계 7 정지 |

레이아웃·애니메이션 형식은 ui 담당([05_ui_input.md](05_ui_input.md)), 이펙트는 [08_effects.md](08_effects.md).

### 9.3 CPU 공용 부분 [판독]

- `IsPlayerCom(pid)`: RmGameWork+0xE58 비트(생성 때 `PlayerWork::GetPlayerType()==1`).
- COM 레벨 벡터(+0xE70, `PlayerWork::GetComLevel`)는 생성자가 채운다. ca::rm 디컴파일 범위(main_ca_rm.c, rhythm_main1~3.c)에서는 다른 참조가 없다 [판독]. 게임 NRO 가 오프셋으로 직접 읽는지는 [미확정].
- 판정·휘두름 CPU 는 게임마다 다르다(mg1801 `PadDriver::UpdateCpu`).
- `comScoreIgnore`(리듬 쿠킹 Params)면 COM 점수·텔롭을 무시하고 총점을 사람 수에 맞춘다.

## 10. 게임별 설정 개관 [판독: 호출 지점 디스어셈블리 `rhythm_mg18NN_callsite.c`]

| 게임 | MainBeatType | BeforeOneBeat(use, type) | NextChartDataOffset | StatusType | Ext | 게임 BGM / 종료 BGM | 채보 읽는 함수 |
|---|---|---|---|---|---|---|---|
| mg1801 | 1 | (1, 0) | — | 2 | — | `SQ_BGM_MG1801_A` / `_MG_ENDING` | RmSyncedSetupGame |
| mg1802 | 1 | — | 2 | 2 | — | `_A` / `SQ_BGM_MG1802_MG_ENDING` | SetupRhythm |
| mg1803 | 1 | (1, 0) | — | 2 | — | `_A` / `_MG_ENDING` | RmSyncedSetupGame |
| mg1804 | 1 | — | 2 | 2 | — | `_A` / `_A_MG_ENDING` | Sequence::Impl::Setup |
| mg1805 | 1 | (1, 1) | — | 2 | — | `_A` / `_A_MG_ENDING` | RmSyncedSetupGame |
| mg1806 | 1 | — | 1 | 2 | — | `_A` / `_A_MG_ENDING` | SetupRhythm |
| mg1807 | 1 | (1, 0) | — (−1) | 2 | O | `_A` / `_A_MG_ENDING` | RmSyncedSetupGame |
| mg1808 | 1 | — | 4 | 2 | — | `_A` / `_A_MG_ENDING` | RmSyncedSetupGame |
| mg1809 | 1 | — | 2 | 2 | — | `_A` / `_A_MG_ENDING` | Sequence::Impl::Setup |
| mg1810 | 1 | — | — | 2 | O | `_A` / `SQ_BGM_MG1810_MG_ENDING` | RmSyncedSetupGame |

- 모든 게임이 `RmStarEffectMan::Start`로 점수를 넣는다(호출자 이름: mg1801 `Player::UpdateAttack`, mg1803/1808/1810 `Player::OnMove`, mg1804 `Parts::TimingEffect`, mg1809 `Parts::Push`, mg1802/1806 `PLAYER::TimingTelop`, mg1805 `Player::UpdateAttack`, mg1807 `NewBowlOne::Leave`) [판독]. 게임별 points 값은 각 게임 판독 때 확인한다(mg1801 만 확정).
- 게임 BGM 이름은 NRO 문자열 [데이터]. `SQ_BGM_RC_GENERIC` 은 1801·1802·1805·1807 에만 있다(Params `isGenericBgm`) [데이터].
- mg1810 은 `SetResultSkip`을 부른다 [판독 문자열·호출].

[설계] → 정리본: [19_motion_input.md](19_motion_input.md) §6.3, 9.3
## 11. 웹 포팅 구조

### 11.1 모듈 (`web/script/games/_rhythm/`) — 웹 권장 이름

| 웹 파일 | 원본 | 책임 |
|---|---|---|
| `beatClock.ts` | 마스터 시퀀스 + `snd::*` | 마스터 틱 → G14, `getBeatState(type)`, BGM 마디 동기(G12/G13/G10), BGM L0 표식, BPM(G11) |
| `rmGameWork.ts` | `RmGameWork` | 3.2 필드(모드·BPM·박 타입·순서·COM·점수·결과). `setBpm`, `getBpm`, `isPlayerCom`, `getPlayerOrder` |
| `chart.ts` | `RmChartDataMan` | JSON → `string[8][]`, 6.1 의 키 누락 규칙, `size`, `item(row,col)` |
| `rmScene.ts` | `RmMgSceneBase` | 3.3 필드, 7절 단계 머신과 줄 배분 꼬리, 4절 훅 인터페이스, 5.1 흐름 함수 |
| `statusMan.ts` | `RmUiStatusMan` + `FUN_710042a6b8` | 점수 가산·팀 합·별 판정·결과 기록(8절) |
| `soundMan.ts` | `RmSoundMan` | BGM 이름 규칙(6.3), JUST SE 겹침 카운트, 카운트 SE — 사건만 낸다 |
| `ui.ts` | 텔롭·와이프·화살표 | 로직 상태만(텔롭 슬롯, 표시 여부). 그리기는 view |
| `data.ts` | static 표 | `BEAT_SCALE`, `BEATS_PER_BAR`, 곡 ID, 기본값 |

게임은 `class Mg1801Scene extends RmScene` 처럼 훅만 덮는다(원본 클래스 구조 유지, DESIGN 5절).

### 11.2 상태와 인터페이스 (초안)

```ts
/** 원본 사운드 전역 변수 — 시퀀서 대신 beatClock 이 만든다 */
interface SoundGlobals { g10: number; g11: number; g12: number; g13: number; g14: number }

interface RhythmHooks {                 // 원본 vtable 슬롯 (4절)
  rmSyncedSetupGame(): void;            // +0x2A0
  rmCleanupGame(): void;                // +0x2A8
  onRmGameStartAfter(): boolean;        // +0x2B0
  trigWipeFadeOutStart(): void;         // +0x2B8
  trigBgmPracticeStart(): void;         // +0x2C0
  trigBgmPracticeFinish(): void;        // +0x2C8
  trigBgmIntroStart(): void;            // +0x2D0
  trigBgmTopStart(): void;              // +0x2D8
  onRmGameMain(): boolean;              // +0x2E0
  trigChartEnd(): boolean;              // +0x2E8
  onRmGameEnd(): boolean;               // +0x2F0
  trigEndingSetting(): void;            // +0x300
  trigResultCaptureSetting(): void;     // +0x318
  onBeatEntry(d: BeatData): void;       // +0x328
  onBeatEntryLock(d: BeatData): void;   // +0x330
  onBeatNextEntry(d: BeatData): void;   // +0x338
}
interface BeatData { row: number; beat: number; cols: readonly string[] /* 1P,2P,3P,4P,OBJ1..4 */ }
```

### 11.3 박자 시계 의사코드 (시퀀서 대체)

원본은 사운드 스레드가 틱을 진행한다. 웹 로직(60Hz 고정 스텝, DOM 없음)에서는 **마스터 틱을 결정적으로 계산**하고, 소리는 view 가 같은 시각표로 낸다.

```ts
// 마스터 시작 프레임 f0 (OnGameStartAfter 프레임). 틱 길이 = 60 / (BPM·96) 초.
// 원본 countTrack 은 OP 가 G13=1 을 쓴 다음 틱부터 센다 → tick0 = 1.
class BeatClock {
  tickF = 0;                                  // 마스터 시작 이후 경과 틱 (f64)
  step(dtSec: number, bpm: number) { this.tickF += dtSec * bpm * 96 / 60; }   // BPM 변경은 G11 처럼 즉시 반영
  get g14() { const t = Math.floor(this.tickF) - 1; return t < 0 ? -1 : Math.floor((t % 384) / 24) + 1; }
  getBeatState(type: number) {
    const s = [0.25, 0.5, 0.5][type] ?? 1;
    return type <= 2 ? Math.trunc(Math.ceil(Math.fround(this.g14 * s))) : this.g14;
  }
  // 게임 BGM: request(id) 를 받으면, 나가는 곡의 다음 "마디 끝 8틱 전" 검사를 지난 첫 마디 경계 = startTick.
  //   g12 는 그 경계에서 id 로 바뀐다. bgmLocal0 은 startTick+192 부터 1.
}
```

- 시험·골든 비교에서는 "프레임 → G14" 수열을 그대로 주입할 수 있게 `BeatClock` 을 인터페이스로 둔다(원본 녹화에서 얻으면 교체).
- 원본은 G14 를 사운드 스레드에서 읽으므로 프레임 관측 시점이 소리보다 늦을 수 있다(5.3, [미확정]). 웹 기본은 지연 0.

### 11.4 단계 머신 의사코드 (요약)

```ts
onGameMain(): boolean {
  const beat4 = clock.getBeatState(0), b = clock.getBeatState(gw.mainBeatType);
  switch (this.stage) { /* 7.1 표 그대로. 조기 반환하는 경우: 2(inst/remix)·4→ 반환 0, 7(inst)·9→10 반환 */ }
  return this.entryTail(b);   // 7.2
}
```

전체 분기(모드·inst·+0x2c)는 [mg1801_rhythm.md 5절](../../../analysis/notes/mg1801_rhythm.md) 표를 그대로 옮긴다. 프리플레이 단독 포팅에서 필요한 분기는 `mode ∈ {0,2}`, `inRhythmCooking=0`, `inst=false`, `+0x2c=0` 이다.

### 11.5 소리·에셋

| 원본 | 웹 | 동등성 |
|---|---|---|
| 마스터 박자 시퀀스(소리: rhythmdrumTrack 드럼, 필인) | sound 담당 시퀀스 렌더(`web/tools/analysis/sound_seq.py`) 또는 생략 | 박자 계산은 BeatClock 이 하므로 소리가 없어도 로직 동일 |
| 게임 BGM 시퀀스 `SQ_BGM_MG18NN_A/C` | 렌더한 오디오를 `startTick` 시각에 재생 | 감상용 스트림(예 `SM_BGM_MG1801_DH`)이 A+종료 녹음이라 BPM 120 에서는 그대로 써도 된다(sound 담당 대조) |
| `_B`(BPM>120) | A 렌더를 재생 속도 BPM/120 로 | 시퀀스는 같은 데이터, 템포만 다름 |
| `SQ_SE_RC_JUST` 로컬 변수 0 | 겹침 수에 따른 변형(시퀀스 판독 필요) | sound 담당 |
| `SQ_SE_MG1800_COUNT_STICK` | 단계 3 사건 | |

### 11.6 원본 이름 ↔ 웹 권장 이름

| 원본 | 웹 권장 |
|---|---|
| 사운드 전역 14 / 11 / 12 / 13 / 10 | `g14`(16분 위치) / `g11`(템포) / `g12`(연주 곡) / `g13`(요청 곡) / `g10`(교대 요청) |
| `RmGameWork+0x20/+0x24/+0x30` | `mode` / `mainBeatType` / `bpm` |
| `RmMgSceneBase+0x370/+0x37C/+0x380/+0x384/+0x388/+0x378` | `stage` / `row` / `lastBeat` / `lockRow` / `lockLastBeat` / `elapsedFrame` |
| `+0x420/+0x421/+0x424/+0x428` | `beforeOneBeat` / `useBeatCheck` / `beforeBeatType` / `nextOffset` |
| `RmGameWork+0xEBC[4]` | `score[4]` |
| StatusHolder `+0x44/+0x48` | `achieved` / `total` |
| `GetStarAchieveRate/Judge` | `starRate()` / `starJudge()` |

### 11.7 구현 순서 (권장)

1. `data.ts`·`chart.ts`·`beatClock.ts` → 노드 시험: 7.3 표(BPM 120 에서 줄 r 프레임 = B + 90 + 15r).
2. `rmScene.ts` 단계 머신(훅은 로그만) → 프리플레이 노멀 한 판의 단계 전이 프레임 목록.
3. `statusMan.ts` → mg1801 전원 JUST 시 rate 100, judge 3.
4. mg1801 을 `RmScene` 파생으로 연결.
5. view: 텔롭·상태 UI·카운트 SE·BGM 시각 맞춤.

## 12. 검증

| 종류 | 내용 | 결과 |
|---|---|---|
| 원본 명령 판독 | GetBeatState `frintp`, OnGameMain 전 case, 점수·별, JudgeInput 반환 레지스터 | 이 문서 |
| 데이터 | vtable 11개 덤프, FSEQ 디스어셈블(rc_cmn·mg18xx), 채보 33개, 메시지 | 4·5·6절 |
| 재구현 계산 | `rhythm_seqsim.py`: 게임 BGM 요청 틱 → 시작 마디·L0 (20곡) | 5.3 표 |
| 교차 확인 | sound 담당 렌더 대조(DH = A 40 s + MG_ENDING) ↔ 7.3 종료 시각 B+20 마디 | 일치 |
| 원본 실행 | 없음 | — |

시뮬레이터는 변수 명령만 재현한다(음표 무시). 같은 틱 안 트랙 순서(마스터→OP→게임 BGM, 트랙 번호순)와 변수 초기값 −1 은 가정이다.

웹 구현 뒤 기대값(같은 가정, BPM 120):
- 프리플레이 노멀, 단계 2 가 프레임 F 에 시작(마디 A 1박) → 게임 BGM 시작 F+120(±1), 줄 0 = F+210, 줄 2 = F+240, 줄 r = F+210+15r.
- mg1801 chart00 → 종료 BGM 요청 = 줄 148 프레임, 단계 7 = F+120+2400.

## 13. 미확정

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| 사운드 → 프레임 관측 지연 | 줄 배분 프레임 ±1 이상 | 사운드 스레드 주기·출력 지연(sound), 원본 실행 |
| `SQ_BGM_RC_MAIN_RHYTHM` ↔ `SEQ_BGM_RC_RHYTHM` 매핑 | 낮음(G14 쓰는 유일한 시퀀스) | FSAR INFO(sound) |
| 단계 0~1 와이프 길이 | 마디 A 위치 | `RmUiCntWipe` 애니(ui) |
| RmGameWork+0x2C 의 뜻 | 리듬 쿠킹 분기 | rc_stage01 Sequence 판독 |
| 결과 연출 매니저(+0x358) 세부 | 결과 화면 | `FUN_7100447030`·`FUN_7100447a90` 나머지(scene/character) |
| 게임별 points·텔롭 type | mg1802~1810 점수 | 각 게임 판독 |
| `SQ_SE_RC_JUST` 가 로컬 변수 0 을 쓰는 방식 | JUST 소리 | 시퀀스 판독(sound) |
| 시퀀서 시뮬레이터 동등성 | 5.3 | 원본 실행 또는 nn::atk 시퀀서 판독 |

## 14. 웹 공용 모듈 분리 (2026-10-09, [rhythm])

mg1801 웹 코드 안에 함께 있던 리듬 공용 틀(`ca::rm`)을 공용 모듈로 옮겼다. **동작은 바꾸지 않았다**(구조 분리만).
- 식·상수·호출 순서·난수 소비·f32 처리는 그대로다.
- mg1801 은 공용 모듈 위에 자기 고유 부분만 얹어 다시 조립했다.
- 결과가 같은지는 분리 전/후 골든을 바이트 단위로 비교해 확인했다(14.8).

11절의 `_rhythm/` 안은 구현 전 명세다. 실제 위치·이름은 이 절이 기준이다.

### 14.1 위치

| 폴더 | 내용 | import 규칙 |
|---|---|---|
| `web/script/app/minigame/kit/rhythm/` | 로직(three·DOM 없음): 박자 시계, 채보, RmGameWork, RmSoundMan 로직, 별 판정, `RmMgSceneBase`(단계 0~10, 줄 배분, 결과 흐름), 웹 MinigameFlow 대리 | **import 0**(같은 폴더만). f32·60fps 상수도 폴더 안에 둔다(`data.ts`, 값은 core 와 같다). 화면 전환은 인터페이스(`RmWipe`)로 받는다 — `lib/transition` 의 `Transition` 을 게임이 넘긴다 |
| `web/script/app/minigame/kit/rhythm/view/` | 화면 어댑터: 리듬 BGM 핸드셰이크·효과음 시퀀서 소리(`RmSoundMap`), 공용 2D UI(`RmUi`: 타이밍 텔롭·START/FINISH·점수 게이지·PERFECT·흰 페이드 따라가기·컨트롤 안내 와이프·결과 점수판), 공용 사건 → UI·소리(`rmTelopView`·`rmPerfectView`) | `view/*`(audio·bgm·seq·lyt·assets·input), `lib/transition`, `app/scene/menu/charselect/fontSheet`, `app/common/render3d/assetLoader`, three. 이미 공용인 것(BGM 스트림 `lib/bgmstream`→`view/bgm`, 시퀀서 `view/seq`, 레이아웃 재생기 `view/lyt`, 화면 전환 `lib/transition`)은 다시 만들지 않고 부른다 |
| `web/script/app/minigame/mg1801/` | mg1801 고유(`mg1801::Scene` = `Mg1801Game extends RmMgSceneBase`) | `app/minigame/kit/rhythm` 을 import 한다 |

에셋 경로는 바꾸지 않았다. 공용 UI·소리 명세는 지금도 게임 폴더(`assets/mg1801/ui/ui.json`, `assets/mg1801/manifest.json`)에서 읽는다(14.9).

### 14.2 공용 / mg1801 고유 경계

| 원본 단위 | 웹 공용(`app/minigame/kit/rhythm/`) | 옮겨 온 곳(분리 전) | mg1801 에 남은 것 |
|---|---|---|---|
| `snd::*` + 마스터 시퀀스 | `clock.ts` `RhythmClock`(G14·G12·L0 관측/프레임 모델, `beatToSec`, `beatState`, `bgmStartBar`) | `mg1801/logic/rhythm.ts` 전체 | — |
| static 표 | `data.ts` `BEAT_SCALE`·`BEATS_PER_BAR`·`BPM`(120)·`RC_SPEEDUP_BPM`·`PREROLL_FRAMES`·`WIPE_WHITE_FRAMES`·`RESULT_PANEL_DELAY_BEATS`·`RESULT_PANEL_FRAMES`·`RESULT_MOTIONS`·`CALIBRATION_FRAMES` | `mg1801/logic/data.ts`·`game.ts` 끝 | `MAIN_BEAT_TYPE`, 채소·의자·시선·칼 모션·NPC 표, `RESULT_CAMERA_POS`(mg1801_cam02 값 → 공용 결과 시작에 넘긴다) |
| `RmChartDataMan` | `chart.ts` `RmChartRow`·`readChartRows(raw)` | `mg1801/logic/chart.ts` 의 행 만들기 | 채보 JSON 3개 import·이름 표(`chartRows(name)`) |
| `RmGameWork` | `gameWork.ts` `RmGameWork`(isCom·점수 0..999·팀 합·총점·개인 횟수·Ext·`resultPlayerScoreMax`), `resolveRmConfig`(모드·코스·BPM·chart01·remixShort·컨트롤 와이프) | `world.ts`(scores·addScore·teamScore), `game.ts` `resolveConfig` | 채보 이름 규칙, 리믹스 A 슬롯 고정(`remixCourse`) |
| `RmSoundMan` | `soundMan.ts` `RmSoundMan`(PlayExcellentSe 파이버·겹침 수, 곡 교대 확인 +0x38~+0x3E), `rmGameBgmName`·`rmEndingBgmName`·`rmInterEndBgmName`(접두 `SQ_BGM_<MG>`) | `world.ts` ExcellentSe, `game.ts` 곡 교대 4함수·이름 3함수 | 이름 함수의 mg1801 포장(시험이 그 이름으로 부른다) |
| `RmUiStatusMan` | `status.ts` `starJudge` | `game.ts` | `calcTotalPoint`(mg1801 `Scene::CalcTotalPoint`) |
| `RmMgSceneBase` | `scene.ts` `RmMgSceneBase`: 단계 0~10, 줄 배분 꼬리(Entry·Lock·NextEntry, BeforeOneBeat), OnGameStartAfter/End/Finish/EndingBefore/Ending, 결과 기록·PERFECT·결과 연출 파이버·결과 모션 진행, 웹 MinigameFlow 대리(PREROLL·흐름 8~13) | `game.ts` 의 해당 메서드 전부 | 훅 구현(14.5), NPC(MapImpl), 카메라 라벨, 제품 파이버(Object → Player), state 조립, 결과 객체 |
| 로직 → 화면 계약 | `types.ts` `RmEvent`(telop·justSound·seLocal·soundStop·soundPreset·perfect + se·bgm), `RmSceneState`(공용 state 필드), `RmPhase` | `mg1801/state.ts` | `Mg1801State extends RmSceneState`(objs·players·counts·camera·npc), `Mg1801Event = GameEvent | RmEvent | fxTrigger` |
| 공용 소리 | `view/sound.ts` `RmSoundMap`(manifest 소리, 렌더 BGM 핸드셰이크, 실시간 시퀀서, observe) | `mg1801/view/sound.ts` 전체 | 장면 프리셋 이름 `'mg1801'` 을 넘김 |
| 공용 UI | `view/ui.ts` `RmUi` | `mg1801/view/ui.ts` 의 `Mg1801Ui` 클래스 | 와이프 레이아웃 이름 `mg1801_wip_bg_01/00`, 화면마다 하나 만드는 `mg1801Ui()`·`disposeMg1801Ui()` |
| 공용 사건 소리 | `view/events.ts` `rmTelopView`(START/FINISH SE·보이스, SQ_SE_MG_FINISH), `rmPerfectView`(SQ_SE_MG1800_PERFECT) | `mg1801/view/index.ts` onStep 안 몇 줄 | 디버그 글자 텔롭, PERFECT 3D 이펙트(effects.ts), 3D 장면 전부 |

mg1801 고유로 남긴 것(공용에 넣지 않음): 판정 창(±GetBeatToSec(1,1)·JustRangeFrame 5), CPU(PadDriver·CpuMiss), 채소 풀·외곽선, 칼 모션, 의자·시선, NPC 헤이호, 수프 결과 모델, 3D 화면 전부(무대·재질·후처리·캐릭터·이펙트).

### 14.3 근거: 나머지 리듬 9종이 공용 부분을 같은 규칙으로 쓰는지 [게임 문서 확인]

mg1802~1810·rc_stage01 문서(각 3·5·6절, mg1810 부록 A·B)를 확인했다.

| 공용으로 둔 것 | 9종 사용 | 근거 |
|---|---|---|
| 박자 시계·단계 0~10·꼬리 순서(Lock → Entry → NextEntry) | 10종 모두 같은 기반 슬롯 배치 | mg1810 부록 A, 4.1 표 |
| BeforeOneBeat·NextOffset·MainBeatType | 설정값만 다름: (1,0) 1801·1803·1807, (1,1) 1805, 없음 나머지 / NextOffset 2·1·4·−1 / MainBeatType 전부 1 | 각 문서 3.2~3.4, 10절 |
| 점수 가산 clamp 0..999, 별 판정 80/40/0, 결과 기록, PERFECT = ExtA·ExtB + 횟수·2 | 10종 같은 경로(points 는 게임마다: 1807 누적, 1810 KB 1점) | 8절, mg1807 5.2, mg1810 6.5 |
| 게임 BGM `_B`/`_C`/REMIX 변환, 결과 앰비언트·징글 이름 | 10종 공용 함수 | 6.3, 각 문서 BGM 절 |
| `PlayExcellentSe` 본체 | 1801·1803·1805·1806·1809·1810 (−1, true), 1804 (n, true), 1808 일부. 1802·1807 은 자체 소리 | 각 문서 6절 |
| 타이밍 텔롭 type 0 FAST·1 SLOW·2 JUST | 9종 모두 | 각 문서 3절 |
| RmGameWork +0x2C 분기(코스 중간: 종료 BGM 바로, PERFECT 없음, 7박 대기 없음, 징글 없음) | rc_stage01 이 쓰고 10종 공용 단계가 읽음 | rc_stage01 6.4 |

훅·설정으로 연 것(게임마다 다름): Entry/Lock/NextEntry 훅, WipeFadeOutStart(1807)·PracticeFinish(1808)·TopStart(1803 제외)·OnRmGameEnd(1803·1805·1810) 훅, OnRmGameStartAfter 반환값(1809 는 시퀀스 완료 여부), 채보 경로 고르기, 게임/종료 BGM 이름, GENERIC 여부, 총점·개인 횟수(PID 매핑 포함)·Ext, `SetGameEndForce`(1808), 상태 UI Hide(1807).

### 14.4 프레임 순서 (분리 전과 같음)

`Mg1801Game.step()`(원본 한 프레임):
1. `pads.read` (mg1801)
2. `RmMgSceneBase.stepFrame(sound)`:
   사건 비우기 → 사운드 관측(`clock.observe`) → `frame++` → 흰 페이드 1프레임(`wipe.step`) → 흐름 단계 갱신(`flow = nextFlow`)
   → **`update()`**: RmSoundMan 파이버(`tickExcellentSe`) → 박자 시계 1프레임 → 결과 연출 파이버 → (끝나지 않았으면) 제품 파이버 `updateProducts()`(mg1801: Object → Player)
   → 흐름 처리기 하나(0 대기 / 8 `onGameStartAfter` / 9 `onGameMain` / 10 `onGameEnd` / 11 `onGameFinish` / 12 `onGameEndingBefore` / 13 `onGameEnding`)
   → **`updateAnimation()`**: 게임 모션(`updateGameAnimation`, mg1801 NPC) → 결과 모션 프레임

분리 전에는 "사건 비우기"가 `pads.read` 앞이었다. 둘은 서로 다른 상태만 건드리므로 결과가 같다(골든 일치로 확인).

### 14.5 공용 API

```ts
// app/minigame/kit/rhythm/scene.ts — 원본 ca::rm::RmMgSceneBase
abstract class RmMgSceneBase {
  constructor(opts: RmOptions, init: RmSceneInit);
  readonly cfg: RmConfig;  readonly clock: RhythmClock;  readonly gameWork: RmGameWork;  readonly soundMan: RmSoundMan;
  get done(): boolean;
  // 게임이 생성자(원본 RmSyncedSetupGame 자리)에서 부르는 설정
  protected setMainBeatType(t: number): void;                                  // RmGameWork::SetMainBeatType
  protected setMgBgmBeforeOneBeatStart(useBeatCheck: boolean, beatType: number): void;
  protected setNextChartDataOffset(n: number): void;
  protected setChartData(rows: readonly RmChartRow[]): void;                   // RmChartDataMan::ReadChartData 결과
  protected setGameBgmLabel(label: string): void;                              // SetGameBgmName + FUN_7100441990 결과
  protected setGameBgmFinName(name: string): void;                             // SetGameBgmFinName(변환은 단계 6 에서)
  protected setPlayerEntities(list: readonly RmPlayerEntity[]): void;          // RmGameWork::SetPlayerEntity
  protected setGameEndForce(): void;                                           // SetGameEndForce
  // 한 프레임(웹 MinigameFlow 대리) — 게임 step() 이 패드를 읽은 뒤
  protected stepFrame(sound: RmSoundSnapshot | null): void;
  update(): void;  updateAnimation(): void;                                    // mgscene MgGame.update 자리 / 애니메이션 갱신
  // MinigameScene 흐름 슬롯(mgscene MgGame 훅과 같은 이름·bool 반환)
  onGameStartAfter(): boolean;  onGameMain(): boolean;  onGameEnd(): boolean;
  onGameFinish(): boolean;  onGameEndingBefore(): boolean;  onGameEnding(): boolean;
  // 게임이 덮는 훅(원본 vtable 이름, 기본 = 원본 기반 구현)
  protected onRmGameStartAfter(): boolean;              // +0x2B0, 기본 true
  protected trigRmGameWipeFadeOutStart(): void;         // +0x2B8
  protected trigRmGameMainBgmPracticeStart(): void;     // +0x2C0
  protected trigRmGameMainBgmPracticeFinish(): void;    // +0x2C8
  protected trigRmGameMainBgmIntroStart(): void;        // +0x2D0
  protected trigRmGameMainBgmTopStart(): void;          // +0x2D8
  protected onRmGameMain(): boolean;                    // +0x2E0, 기본 true(원본). 10종 모두 0 을 돌려주게 덮는다
  protected trigRmGameMainChartEnd(): void;             // +0x2E8
  protected onRmGameEnd(): boolean;                     // +0x2F0, 기본 true
  protected onRmGameFinish(): boolean;                  // +0x2F8, 기본 true
  protected trigRmGameEndingSetting(): void;            // +0x300
  protected onRmRecieveBeatEntry(d: RmBeatData): void;  // +0x328
  protected onRmRecieveBeatEntryLock(d: RmBeatData): void;  // +0x330
  protected onRmRecieveBeatNextEntry(d: RmBeatData): void;  // +0x338
  // 웹 전용
  protected abstract updateProducts(): void;            // 제품 파이버(MaintainProduct)
  protected updateGameAnimation(): void;                // 게임 모션(기본 없음)
  protected abstract onResultReady(): void;             // 끝(RequestReturnScene·결과 점수판 끝) — 게임이 결과 객체를 만든다
}
interface RmSceneInit {
  mg: string;                                   // 'mg1801' → BGM 접두 SQ_BGM_MG1801, 결과 프리셋 mg1801_result, SM_AMB/SM_JIN 이름
  chart: { chartName(mode: number): string; remixCourse?(c: RmCourse): RmCourse };
  events: RmEventSink;                          // 게임 사건 배열(이번 프레임)
  wipe: RmWipe;                                 // 흰 페이드(lib/transition Transition)
  isCom: readonly boolean[];
  resultCameraPos: RmV3;                        // 결과 시작 FUN_7100446b60 이 머리를 돌리는 카메라 위치
}
interface RmBeatData { row: number; beat: number; item: RmChartRow }   // 원본 RmMgSceneBase::Data
```

게임 쪽 조립 예(mg1801): 생성자에서 `super(opts, init)` → `setMainBeatType(1)`·`setMgBgmBeforeOneBeatStart(true, 0)` → `setChartData(chartRows(cfg.chart))` → 난수·World·ObjectMan·PlayerMan(분리 전 순서 그대로) → `setPlayerEntities(players)` → 총점·개인 횟수 → `setGameBgmLabel`·`setGameBgmFinName`. 덮는 훅: PracticeStart(입력 켬), TopStart(NPC), ChartEnd(Player::Finish·NPC), EndingSetting(상태 UI 숨김·채널 0,6), Entry(`ObjectMan.entry`), OnRmGameMain(false).

화면 쪽: `new RmSoundMap(assets, audio, 'mg1801')`, `new RmUi(assets, camera, { name: 'mg1801', wipeLayouts: ['mg1801_wip_bg_01', 'mg1801_wip_bg_00'] })`, `rmTelopView(ui, sound, e, frame, bpm, camera)`, `rmPerfectView(…)`.

### 14.6 mgscene 연결 계획 (이번에는 하지 않음)

2026-10-09 [mg-connect]: 아래 계획대로 연결했다 — [../shell/minigame_scene.md](../shell/minigame_scene.md) §12.12(어댑터 `app/minigame/kit/rhythm/mgGame.ts` `RmMgGame`, 단계 대응, 새 시작 프레임: OnGameStartAfter 리듬 프레임 61 → 27, 원본 근거 §12.12.3). 웹 MinigameFlow 대리(`stepFrame` 흐름 switch·PREROLL·흐름 11 두 프레임)는 지웠고, `PREROLL_FRAMES`·`RmOptions.prerollFrames` 는 이제 읽는 곳이 없다.

공용 리듬 모듈의 흐름 슬롯 이름·반환형은 `app/minigame/frame/scene` 의 `MgGame`([../shell/minigame_scene.md](../shell/minigame_scene.md) §12.3)과 같게 맞춰 두었다. 나중에 할 일:
1. 어댑터 하나: `MgGame = { setup, update: () => scene.update(), onGameStartAfter: () => scene.onGameStartAfter(), onGameMain, onGameEnd, onGameFinish, onGameEndingBefore, onGameEnding }`. 틀의 `ctx.dt`·`ctx.rand`·`ctx.pad` 는 지금 게임이 직접 쓰는 `RM_DT`·`BexRandModule`·`Pads` 자리에 넣는다. `updateAnimation()` 은 틀의 흐름 처리기 뒤에 부른다(원본 엔티티 갱신 자리, 순서 [추정]).
2. 웹 MinigameFlow 대리(`stepFrame` 의 흐름 0·8~13 switch, `PREROLL_FRAMES`, 흐름 11 두 프레임)를 지우고 틀의 단계 1~13 이 대신한다.
3. 흰 페이드(`RmWipe`)는 틀의 `MgWipe`(같은 `lib/transition` 코어)로 넘긴다.

**BGM·박자 시작 프레임이 바뀌는 이유.** 지금 웹은 OnGameStartAfter 전 MinigameFlow 1~7(장면 사운드 시작·첫 페이드·오프닝·시작 텔롭)을 `PREROLL_FRAMES` 60 프레임 대기로 대신한다. 마스터 박자 시퀀스(`SQ_BGM_RC_MAIN_RHYTHM`)는 OnGameStartAfter 프레임에 시작하고, 박자(G14)·단계 0~10·게임 BGM 마디 동기·줄 배분은 모두 그 프레임을 0 으로 센다. 틀의 1~7 은 첫 페이드 22 프레임, 오프닝 길이(게임 훅), 시작 텔롭 단계 등으로 이루어져 길이가 60 과 다르다(리듬 장면의 시작 텔롭 설정은 이 작업에서 다시 판독하지 않았다). 그래서 OnGameStartAfter 프레임이 옮겨 가고, 그 뒤 모든 사건(마스터 시작, 게임 BGM 접수, 줄 배분, 종료 BGM, 결과)이 같은 양만큼 밀린다. 줄–BGM 상대 시각은 그대로지만 `test_mg1801` 의 절대 프레임 기대값(예: 단계 0~1 "OnGameStartAfter + 121", 결과 끝 프레임 수)과 골든이 달라진다. 그래서 연결은 원본 근거로 1~7 길이를 정하고 기대값을 다시 정하는 별도 작업으로 둔다.

### 14.7 원본과 다른 점 (분리로 새로 생긴 것 없음)

분리 전 mg1801 의 웹 근사(PREROLL, 컨트롤 안내 와이프 길이, 리믹스 L0 2박, 흐름 11 두 프레임, 결과 점수판 241 프레임 등)는 그대로 공용 모듈로 옮겼다. 새 근사는 없다.

공용 모듈에 새로 연 훅(Lock·NextEntry·PracticeFinish·IntroStart·WipeFadeOutStart·OnRmGameStartAfter·OnRmGameEnd·OnRmGameFinish·SetGameEndForce)은 mg1801 이 쓰지 않거나 기본값이 분리 전과 같은 결과를 내는 자리에만 넣었다. 부르는 자리는 7.1·7.2 표 그대로다.

### 14.8 검증 (분리 전/후 골든, 노드)

분리 **전에** 기록을 떠 두고, 분리 **후** 같은 조건으로 다시 떠서 파일을 바이트 단위로 비교했다(`cmp`). 기록 도구는 시험 기대값과 무관한 scratchpad 스크립트다(golden_rec·view_trace·comments).

**로직 골든** — 프레임마다 한 줄 `[프레임, state, events, 내부]`. 숫자는 비트 보존(−0·NaN·무한은 비트 16진). 마지막 줄은 결과.
- 내부에 넣은 것:
  - 장면: 단계·타이머·줄·Lock·박 수·흐름·와이프·보정·결과 기록·결과 연출·NPC.
  - RmSoundMan: 곡 교대 +0x38~+0x3E, ExcellentSe.
  - 그 밖: 경과 프레임, 점수, 외곽선 점유, 박자 시계(masterFrame·관측·요청 틱), 난수 소비 횟수(비동기·동기), 채소 풀 75개 전 필드, 레인 집계, 플레이어 4명 전 필드.

| 경우 | 프레임 | 전/후 |
|---|---|---|
| 노멀 단독 시드 1(옵션 있음·없음 두 경로) | 3,255 ×2 | 같음 |
| 하드 단독 시드 7 | 3,255 | 같음 |
| 리듬 쿠킹 노멀 1번째 / 마지막, 하드 마지막 | 3,045 / 3,255 / 3,255 | 같음 |
| 롱 1번째(BPM 120) / 4번째(BPM 180, _B·_B_INTER_END) / 마지막(BPM 180) | 3,045 / 2,145 / 2,285 | 같음 |
| 리믹스(A 슬롯) | 879 | 같음 |
| CpuMiss 켬(노멀 / 롱 BPM 180) | 3,255 / 2,145 | 같음 |
| 사람 1P 무입력 / 4명 무입력 / 1P 판정 시점 A / 리듬 쿠킹 마지막에서 1P A | 3,255 ×4 | 같음 |
| 사람 아무 때나 A·가속도 섞기(하드 4명 / 롱 BPM 180 2명) | 3,255 / 2,285 | 같음 |
| 의자·시선 예외 캐릭터(pc51·pc58·pc12·pc62) | 3,255 | 같음 |
| 컨트롤 안내 와이프 400(SQ_BGM_RC_CALIBRATION) / PREROLL 5 | 3,405 / 3,200 | 같음 |
| 사운드 관측 경로(지연 0 / 3 / 롱 BPM 180 지연 0 / 리믹스 지연 2 / 리듬 쿠킹+사람 섞기 지연 5) | 3,255 / 3,258 / 2,145 / 881 / 3,260 | 같음 |
| `check_logic` 경로(등록 GameDef createLogic, 전원 CPU 시드 1) | 3,255 | 같음 |

27개 기록 모두 바이트 단위로 같다. 판정·점수·소리 사건(bgm·se·justSound·seLocal·soundStop·soundPreset)·박자 시각(g14·bar·bgmTime·masterFrame)이 모두 들어 있다.

**화면 추적** — `Mg1801View` 를 노드에서 상자 모드(에셋 없음, WebGL 없음)로 만들고, 로직 state·events 를 onStep/render 에 넣었다(노멀·롱 BPM 180·리믹스·하드 리듬 쿠킹, render 는 1~3 스텝마다).
- 기록한 것:
  - 렌더러 `render(scene, camera)` 마다 카메라 위치·회전·fov·near·far·종횡비·투영 행렬.
  - 보이는 객체 전부의 월드 행렬·재질 종류·색·불투명도·빛 세기(해시).
  - 소리 라우팅(`onEvent` 인자 순서).
  - UI 호출(push·draw·vibrate) 순서, HUD 호출.
- 결과: 4,777 렌더·16,296 줄이 전/후 같다.
- 분리 후 추적은 새 클래스(`RmSoundMap`·`RmUi`)의 메서드를 가로챘다(옛 파일은 옮겨서 없음).
- `RmUi`·`RmSoundMap` 의 몸체 차이(옛 파일 대비 diff)는 다음뿐이다.
  - 형 이름: `Mg1801State` → `RmUiState`, `Mg1801Event` → `RmEvent`.
  - 주입값 3개: 와이프 레이아웃 이름, 경고 문구 이름, 장면 프리셋 이름. mg1801 은 옛 값을 그대로 넘긴다.

**주석 보존** — TypeScript 구문 트리로 전/후 주석을 모두 모아 비교했다.
- 분리 전 mg1801 24파일의 주석 문장(줄)은 분리 후 mg1801 + rhythm 34파일에 모두 있다(없어진 문장 0).
- 주석 줄 수: 전 1,078 / 후 1,266(새 머리 주석·가리킴이 늘어남).

**기존 시험(기대값 수정 0)** — 아래 14.8.1.

#### 14.8.1 기존 시험 (시험 파일 무수정)

| 시험 | 분리 전 | 분리 후 |
|---|---|---|
| `test_mg1801` | 통과 84 / 실패 0 | 통과 84 / 실패 0 |
| `check_logic` | mg1801 3,255 프레임 같음 | 같음 |
| `test_mgscene` | 69/69 | 69/69 |
| `test_prefetch` | 133/133 | 133/133 |
| `test_transition` | 119/119 | 119/119 |
| `test_build_cache` | 46 / 실패 0 | 46 / 실패 0(광장 진입 JS 에 mg1801 몸체 없음 포함) |
| 그 밖 `tools/test_*`·`check_*` 전부(29개) | — | 모두 종료 코드 0, 실패 0 |
| `tsc --noEmit`, `npm run build` | — | 통과 |

헤드리스·페이지 확인은 하지 않았다. 받기 경로(에셋 URL)를 바꾸지 않았기 때문이다.

### 14.9 나머지 리듬 9종에 남는 일

공용 모듈 위에 게임마다 얹어야 할 것(각 게임 문서 근거, 14.3):

| 게임 | 설정 | 덮을 훅·고유 부분(예상) |
|---|---|---|
| mg1802 | NextOffset 2 | Entry·NextEntry(줄 r+2 Ready), Lock 빈 함수. Sequence STATE 알림, 자체 JUST 소리(JustRCSound), 채보 조각 표, 결과 ed_obj00~02, PERFECT 위치 보정 |
| mg1803 | BeforeOneBeat(1,0) | Lock(OBJ1 "R" 재장전), TopStart 안 덮음, OnRmGameEnd(정리 후 1), 판정 ±7·JUST ±3, 레인 = PID 그대로(원본 특이점), 꼬치 결과 |
| mg1804 | NextOffset 2 | NextEntry(티켓 2줄 뒤), `PlayExcellentSe(min(n,3)+1, true)`(n 인자 경로 — 공용 `playExcellentSe` 에 인자 열기 필요), **흐름 파이버가 제품보다 먼저**(공용 update 순서를 열어야 함), 동기 난수 3회/프레임 |
| mg1805 | BeforeOneBeat(1,1) | Entry → EntryNext·Lock → Entry(이름 엇갈림), OnRmGameEnd, 사람/CPU 판정 창 다름, 빵 결과, PERFECT 위치 |
| mg1806 | NextOffset 1 | Lock 빈 함수, NextEntry(ReadyChart), STATE 알림(리믹스·inst 에서 연습 생략), 프레임 고정 판정 창, 카레 결과 |
| mg1807 | BeforeOneBeat(1,0), NextOffset −1 | **WipeFadeOutStart**(오프닝 그릇·카메라), Lock 에서 판정 음표 투입, 자체 JUST 소리, 누적 점수 한 번에 Start, `SetPersonalPlayNumExt`, EndingSetting 에서 상태 UI Hide |
| mg1808 | NextOffset 4 | Entry 빈 함수, Lock(손님·BREAK → `SetGameEndForce`), PracticeFinish 빈 함수, FAST/SLOW 에도 PlayExcellentSe, L 은 SQ_SE_RC_JUST 직접 |
| mg1809 | NextOffset 2 | NextEntry 빈 함수, **OnRmGameStartAfter 반환값 = 시퀀스 완료**(공용 흐름 8 이 반환을 써야 함), 흐름 먼저 파이버, 동기 난수 3회, PERFECT −14° |
| mg1810 | — | KB 연타(Ext, 텔롭 없음), `SetResultSkip`, 자체 프레임 카운터 판정, 샐러드 결과, 종료 BGM 시작 이름 `SQ_BGM_MG1810_MG_ENDING` |
| 공통 | — | 게임별 채보 고르기(`RmChartRule`), 결과 모델, 판정 창·CPU, 연습 화살표 모델(arrow00/arrow_op00/크기), 게임 UI 에셋 폴더(14.10) |

공용 모듈 쪽에 아직 없는 것(나중에 그 게임을 할 때 원본 근거로 더한다): `PlayExcellentSe(n, keepMax)` 의 n·keepMax 인자, 흐름/제품 파이버 순서 선택, OnRmGameStartAfter 반환 사용, 단계 6 의 "끝/강제 플래그" 분기, `SetResultSkip`, StatusType, comScoreIgnore, inst(조작 설명) 경로, 결과 메들리 분기 세부.

### 14.10 사용자 확인 필요 (이 절)

모두 "결과 불변"을 먼저 지키는 쪽으로 정했다.

| 항목 | 정한 것 | 이유 |
|---|---|---|
| 공용 UI·소리 에셋 위치 | 그대로 `assets/mg1801/ui`·`assets/mg1801/manifest.json` 에서 읽는다(공용 레이아웃 mg1800_*·RC 공용 소리도 이 안에 있다) | 받기 경로를 바꾸면 미리 받기 목록·캐시 키(`test_prefetch`)와 페이지 동작이 바뀐다. 나머지 리듬 게임을 붙일 때 `assets/rhythm/` 같은 공용 폴더로 나누는 일을 따로 정한다 |
| OnRmGameStartAfter 반환값 | 부르기만 하고 흐름 8 은 늘 한 프레임 | mg1809 만 반환을 쓴다. 반환을 쓰면 OnGameStartAfter 를 여러 프레임 부르는 경우가 생겨 마스터 시작 사건이 되풀이된다(원본은 재생 중 플래그로 막음) — 그 게임 때 같이 정한다 |
| OnGameFinish 페이드 대기 | 웹 지금처럼 기다리지 않고 참(흐름 11 두 프레임) | 4절 표의 "페이드 후 vt+0x2F8" 을 따르면 흐름 11 길이가 바뀐다(결과 변경). 분리 전 동작 유지 |
| SetGameEndForce | 줄 배분 꼬리(7.2)에만 반영, 단계 6 의 강제 종료 분기는 아직 없음 | 7.1 표 "끝/강제 플래그" 의 정확한 동작(종료 BGM 요청 여부)을 판독하지 않았다. mg1801 은 부르지 않아 결과 같음 |
| 종료 BGM 이름 규칙 | `rmEndingBgmName(SetGameBgmFinName 값, …)` = mg1801 판독 규칙 그대로 | `_A_MG_ENDING` 으로 시작하는 게임(1804~1809)의 변환 세부는 [미확정](mg1810 11.2) |
| `phase = 'ending'` 위치 | 기반 OnGameEndingBefore 가 TrigRmGameEndingSetting 훅 바로 뒤에 둔다(분리 전에는 mg1801 훅 안의 마지막 줄) | 웹 화면 계약 값이라 공용 쪽으로 올렸다. 사이에 읽는 곳이 없어 결과 같음 |
| 화면 사건 라우팅 | START/FINISH·PERFECT 소리만 공용(`rmTelopView`·`rmPerfectView`), 나머지 onStep(3D 이펙트·디버그)은 게임 | 3D 화면은 게임마다 다르다 |
