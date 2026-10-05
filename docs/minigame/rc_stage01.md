# rc_stage01 리듬 쿠킹 모드 장면 (Rhythm Kitchen / リズムクッキング)

2026-10-02 작성. 상태:
- **분석**: 모드 선택·코스 생성(노멀·롱·하드·리믹스)·게임 연속 실행·BPM 전환·코스 결과 합산·셰프 등급·보상·세이브 갱신·장면 상태기계를 판독했다. 무대 연출(카메라 패턴 번호별 내용, 관객·호스트 모션, UI 레이아웃 애니메이션)은 흐름만 적었다. 남은 미확정은 11절.
- **웹 구현**: 없음(이 문서는 명세만). 웹 구조 제안은 9절.
- **동작 검증**: 원본 실행 대조 없음. 재구현 계산만 했다(`tools/rcF_calc.py`, 10절).

확정 수준 표기([../../../../web/분석.txt](../../../../web/분석.txt)): **[실행]**(이 문서에는 원본 실행이 없고, `[실행: …]`은 도구 실행), **[판독]** 원본 명령 판독, **[데이터]** 데이터 확인, **[재구현 계산]**, **[추정]**, **[미확정]**.

근거 문서(중복 설명 대신 링크):
- 리듬 공용 프레임워크 [02_rhythm.md](../engine/02_rhythm.md) — RmGameWork·OnGameMain 단계·채보 선택·BGM 이름·점수·별 판정.
- mg1801 기준 문서 [mg1801.md](mg1801.md), 해소 메모 [analysis/notes/mg1801_rhythm.md](../../../analysis/notes/mg1801_rhythm.md)(BPM 출처, RmGameWork+0x20 모드 표).
- 공유 게시판 [analysis/notes/SHARED.md](../../../analysis/notes/SHARED.md) `[rcF]` 줄(이 문서의 핵심 사실을 먼저 올렸다).

**정정**(기존 문서): 02_rhythm 3.2·mg1801_rhythm 12절의 "RmGameWork+0x2C = 메들리/연속 결과 [추정: 메들리]"는 이제 확정이다. 뜻은 "**코스에서 이 게임 뒤에 게임이 더 남았는가**"이고, 쓰는 곳은 rc_stage01 `PreGameWaitFunc` 하나다(6.4). 이유: 쓰기 명령을 rc_stage01 전체·main ca::rm 범위에서 스캔해 이것 하나만 찾았다(10절).

---

## 1. 기능 개요와 사용자에게 보이는 동작

"리듬 쿠킹"은 리듬 미니게임 10종(mg1801~mg1810)을 코스로 이어 하는 모드다. 무대(rc_stage01)는 요리 방송 스튜디오이고, 사회자(Kamek, NPC "HOST"), 심사위원 3명, 관객이 있다.

| 흐름 | 보이는 것 |
|---|---|
| 오프닝(첫 진입) | 사회자 등장(`SQ_SE_RC_STAGE01_APPEAR_KAMECK`), 환영 대사 `rc00_mw_welcome01~16`, 플레이어 소개, 관객 환호. 두 번째부터는 스킵 가능 |
| 모드 선택 | "…이번에는 어떤 리듬으로 요리할 거지?" 선택지 4개: 노멀 / 롱 / 하드 / 리믹스(`rc00_mw_modesele00_a0~a3`). 열린 모드만 고를 수 있다(6.9) |
| 연습 | "다 함께 리듬에 맞춰 손을 들어라!" — 박자에 맞춰 Joy-Con을 흔드는 연습(최대 30초) |
| 코스 | 노멀·하드 3게임, 롱 6게임(같은 3게임 두 번, 뒤 3게임은 BPM 180 "스피드 업!"), 리믹스 6게임(짧은 리믹스 채보, 게임 사이 결과 없이 이어짐) |
| 게임 사이 | 노멀·롱·하드: 게임마다 각 게임 결과 연출(수프 등) 뒤 무대로 잠깐 돌아와 다음 게임 와이프. 리믹스: 셰프 모자 와이프로 바로 다음 게임 |
| 심사 | 접시(코스 게임별 요리, 별 판정에 따라 a/b/c 모델)를 심사위원이 맛봄, 결과 롤 BGM, **셰프 등급 0.0~5.0** 플래시. 등급 1.0 이상이면 축하(종이 꽃가루·불꽃), 4.0 이상이면 큰 축하 |
| 결과표 | 팀 등급(`im_rc_rank00~05`: 반짝반짝 초보 셰프 … 슈퍼스타 셰프), 플레이어별 평균 %, 라운드별 달성률·점수 |
| 끝 | 보상 안내, 재도전 메뉴. 재도전이면 모드 선택부터 다시(재도전 경로는 코스 첫 게임 규칙이 다르다, 6.2) |

| 근거 | 내용 |
|---|---|
| [데이터] `message/koKR/rc00.json`, `im_rc.json` | 위 문구들. `rc00_wip_ui_title01~10` = 게임 제목(01 채소 썰기 … 10 채소 캐기), `11` = 리믹스 |
| [데이터] `rc~rc_stage01.nx.bea` | 무대 모델 48·환경 34·텍스처, 파라미터 `data/rc_stage01_param.json` |
| [판독] rc_stage01.nro | `rc_stage01::Scene`, `Sequence`, `*Man` 클래스(3절) |

## 2. 분석 대상 원본·버전·자료 위치

| 항목 | 위치 |
|---|---|
| 원본 | Super Mario Party Jamboree US v0 (`c:/dev/original`, 읽기 전용) |
| 장면 코드 | `romfs/nro/NX_Release/rc_stage01.nro` (심볼 있음) |
| 리듬 공용 | main NSO `ca::rm::RmGameWork`, `RmSaveWork`, `RmMgSceneBase`, `RmSoundMan` |
| 디컴파일(기존) | `analysis/decomp/rhythm_rc_stage01_all.c`(rc_stage01 전체), `rhythm_rc1.c`(SettingBpm·SyncedSetupGame 디스어셈블리·Params), `main_ca_rm.c` |
| 디스어셈블리(이번) | `rcF_main_dis1.c`(main: 리믹스 목록 FUN_710042b780, GenerateModeMgList, std::sort 2벌, RmSaveWork 접근자, 결과 기록 FUN_710042ca10), `rcF_main_dis2.c`(코스 평균 등급 꼬리, GetStarAchieveRate), `rcF_main_dec3.c`(모드워크 기본값 FUN_7100428720 전체), `rcF_main_vt.c`(RmGameWork 소멸자), `rcF_main_refs.c`, `rcF_rc_dis1.c`(RefillInit·EndStageWait·Impl::Setup), `rcF_rc_dis2.c`(AddArchiveFileSetting·PreGameWaitFunc), `rcF_rc_dis3.c`(PlayEncoreBGM·StartClapSound) |
| Ghidra | `ghidra_work/rcF/`(rhythm 프로젝트 복사본: jamboree_main, rc_stage01), 실행기 `ghidra_work/rcF/run.sh` + `tools/ghidra_scripts/CoreTool.java` |
| 데이터 | `extracted/bea/rc~rc_stage01.nx.bea/`, `rc~rc_result.nx.bea/`(접시 30개), `mg~mg18NN.nx.bea/mg/mg18NN/data/mg18NN_rm_chart*.json`(35개), `extracted/message/*/rc00.json`·`im_rc.json` |
| 재구현 계산 | `tools/rcF_calc.py` → `analysis/rcF_calc.json` |

주소는 SwitchLoader 기본 베이스 0x7100000000 기준이고 모듈 이름을 함께 쓴다(예: `rc_stage01 PreGameWaitFunc @0x7100034ad0`, `main GenerateModeMgList @0x710042a7a0`).

`bq::MinigameID`: 0x6B..0x74 = mg1801..mg1810 [판독: `snprintf("sound/subarc_mg18%02d", id−0x6a)` @rc_stage01 AddArchiveFileSetting, `id−0x6b` 인덱스 @Impl::Setup·FUN_710043007c].

## 3. 진입점과 전체 호출 흐름

### 3.1 장면 교대 구조 [판독]

리듬 쿠킹은 **장면 하나가 코스 전체를 들고 있는 구조가 아니다.** `rc_stage01` 장면과 미니게임 장면(mg18NN)이 번갈아 만들어지고, 그 사이 상태는 `RmGameWork`의 모드워크(0x728 B)를 `bq::WorkModule+0x1CF0` 버퍼에 저장해 넘긴다.

```
[rc_stage01] 진입(코스 index 0)
  Scene::Scene → SyncedSetupGame → Sequence 시작: 오프닝 → 입장 → 모드 선택·연습 → PreGame
  PreGameWaitFunc 단계 9: SetResultMgId, +0x2C 설정, bex::Scene::CallScene("mg18NN"), GameWork::SetMinigameID
      ↓ (rc_stage01 Scene::CleanupGame: PushRmGameModeWork, RmGameWork 소멸자도 버퍼에 복사)
[mg18NN] RmMgSceneBase(RmGameWork 없으면 생성 → 버퍼에서 복사) → 게임 → 결과 기록(FUN_710042ca10)
  CleanupGame: 코스 index(+0x38)++ ; 점수 4개 0
  OnGameEnd: 노멀·롱·하드 → 게임별 결과 연출 / 리믹스 → 페이드 후 RequestReturnScene
      ↓ (RmGameWork 소멸자 @0x7100428b88: 버퍼가 있고 매직·크기가 맞으면 0x728 B 복사)
[rc_stage01] 다시 생성(코스 index 1..) — 진행 상태(+0x34)로 첫 상태를 고른다
  index < 코스수 → PreGame(전환만: 무대 오브젝트를 만들지 않음) → 다음 CallScene
  index ≥ 코스수 → EndGame → 심사(JudgeCooking) → 결과(EndStage) → 재도전(Refill) …
```

- `RmGameWork` 소멸자 = vtable(main 0x71019f1828) +0 `FUN_7100428b88`: `ExistsGameModeWork && 버퍼+0x10(크기)≠0 && 버퍼+8 == this+0x10 && 버퍼+0 == this+8 이면 memcpy(버퍼, this+8, 0x728)` [판독 rcF_main_vt.c]. `Push/PullRmGameModeWork`는 main 안에서 아무도 부르지 않고 rc_stage01 만 부른다 [판독: refs].
- 미니게임 장면에서 `RmMgSceneBase` 생성자는 RmGameWork 싱글턴이 없을 때만 만든다(@0x7100441078 호출) [판독].

### 3.2 rc_stage01 진입 함수 [판독]

| 함수 (rc_stage01) | 주소 | 하는 일 |
|---|---|---|
| `Scene::Scene` | 0x710002bab8 | RmCmnParamMan·RmGameWork 없으면 생성. `+0x1C=1`, `+0x28=0`, 진행 `+0x34 = idx==0 ? 0 : idx<코스수 ? 1 : 2`, `Params.ed_start==2`면 2. NPC 0x37·0x3F 로드. 진행≠1이면 모션 아카이브 9개·`mg/mg1800`·`libca/common`·`libca/mg_common` 로드, 진행==1이면 `SetFadeEnable`. 진행==2 또는 ed_start==2면 `rc/rc_result` 로드. 사운드 아카이브 비동기 로드, UI 일시정지 생성·열기 금지, `RewardModule::SetUp(10)`, flag 4 끔 |
| `Scene::SyncedSetupGame` | 0x710002c234 | 아래 6.1 의사코드 |
| `Scene::SettingBpm` / `SettingGameWork` | 0x710002c564 / 0x710002c018 | 생성자·SyncedSetupGame 안에 같은 코드가 인라인돼 있다. 별도 호출자는 rc_stage01 안에 없다 [판독: 호출 검색] |
| `Scene::GameFlow` | 0x710002c690 | `Sequence::EndStage()`(Impl+0x14)가 참이 될 때까지 Fiber::Wait → `this[0xE6]=1`, `SetMinigamePlaying(0)` |
| `Scene::CleanupGame` | 0x710002c5f4 | 일시정지 금지, `PushRmGameModeWork`, `Sequence::IsMiddleReset()`(flag 0x42 또는 미니게임 실행 플래그 Impl+0x10==0)이면 메인 BGM 정지 + `ResetRmGameModeWork` + `WorkModule::ResetGameModeWork`(= 코스 중단), 사운드 아카이브 해제 |
| `Sequence::Impl::Update` | 0x710002dd50 | 파이버: 매 프레임 `this+0x180`의 멤버 함수 포인터를 부르고 `Fiber::Wait` |

### 3.3 Sequence 상태(SEQ_ENUM)와 함수 표 [판독 + 데이터 @rc_stage01 0x71000907f0]

`StartSequence(s)` / `NextSequence()`가 `this+0x30 = s`, `this+0x2A = s`, `this+0x180 = 표[s]`(Init 함수)로 바꾼다. Init 함수는 한 번 돌고 Wait 함수로 갈아끼운다. 하위 단계는 `this+0x2C`(short).

| s | Init (표) | Wait | 진입 |
|---|---|---|---|
| 0 | IdleFunc | — | — |
| 1 | SetupInitFunc | Idle | — |
| 2 | OpeningInitFunc | OpeningWaitFunc | 진행 0 시작 |
| 3 | OpeningCaptureInitFunc | OpeningCaptureFunc | **NextSequence는 2 다음을 4로 건너뛴다** → 일반 흐름에서 안 씀 |
| 4 | EnterStageInitFunc | StageWaitFunc | 2 다음 |
| 5 | ExplanationGameInitFunc | ExplanationGameWaitFunc | 4 다음, 스킵(SkipWaitFunc), 재도전(RefillFunc) |
| 6 | PreGameInitFunc | PreGameWaitFunc | 5 다음, 진행 1 시작 |
| 7 | PlayGameInitFunc | — | **진입 경로 없음**(6에서 NextSequence를 부르지 않는다) [판독] |
| 8 | EndGameInitFunc | EndGameFunc | 진행 2 시작, (디버그) PreGameInit 에서 Impl+0x16 |
| 9 | JudgeCookingInitFunc | JudgeCookingWaitFunc | 8 다음 |
| 10 | EndStageInitFunc | EndStageWaitFunc | 9 다음 |
| 11 | RefillInitFunc | RefillFunc | 10 다음(재도전), 진행 0 + flag 0x39 시작 |

`NextSequence` @0x71000308b4: `s<11`이면 `next = (s==2) ? 4 : s+1`, `next≠10`이면 종이 이펙트 정지, 진행≠1이면 메시지 창 숨김.

## 4. 구조체·필드·상수·열거형

### 4.1 RmGameWork — 리듬 쿠킹이 쓰는 필드 [판독]

기준 객체: `ca::rm::RmGameWork`(main, 0xF50 B). +0x08..+0x730 = 모드워크(장면 사이 보존). 기본값 = `FUN_7100428720`(인자 = this+8, 전체 디컴파일 `rcF_main_dec3.c`). 02_rhythm 3.2 표를 보충·확정한다.

| 오프셋 | 웹 권장 이름 | 기본 | writer | reader | 수준 |
|---|---|---|---|---|---|
| +0x1C | `inRhythmCooking` | 0 | rc_stage01 생성자·SettingGameWork =1 | 채보 선택(IsChartDataFree), IsInstActive, 결과 기록(세이브 갱신 조건) | [판독] |
| +0x20 | `mode` 0 노멀 1 롱 2 하드 3 리믹스 (`ca::rm::MAIN_MODE`) | 0 | ExplanationGameWait 단계 1·RefillFunc(선택지), RefillInit(모드 1개만 열렸을 때 0) | 전부 | [판독][데이터] |
| +0x28 | (미상) | 0 | rc_stage01 =0 | — | [판독] 뜻 [미확정] |
| +0x2C | `moreGamesInCourse` | 0 | **PreGameWaitFunc 단계 9 @0x71000355ec/f4**: `idx < 코스수−1 ? 1 : 0` | RmMgSceneBase OnGameMain 단계 6~9, OnGameEnd, OnGameEndingBefore/Ending, CleanupGame, 생성자(리믹스 페이드), 결과 기록(모드 클리어 저장 조건) | [판독] |
| +0x30 | `bpm` | 120 | SetBpm(rc_stage01) | 모든 박자 계산 | [판독] |
| +0x34 | `progress` 0 시작 / 1 코스 중간 / 2 코스 끝 | 0 | 생성자·SettingGameWork | Scene·Sequence 분기 | [판독] |
| +0x38 | `courseIndex` | 0 | RmMgSceneBase::CleanupGame `++`(조작 설명 아님), RefillInit 0(버퍼 쪽 +0x30) | 전부 | [판독] |
| +0x3C | `courseCount` | 1 | AddArchiveFileSetting (6.2) | 진행·BPM·결과 | [판독] |
| +0x40 | `edAchieveRate` | 0 | SyncedSetupGame = Params.ed_achieve_rate | (디버그 엔딩) | [판독] |
| +0x44+i·4 | `courseMg[i]` (i<10) | [0]=−1, 나머지 0 | AddArchiveFileSetting | PreGameWait(실행 게임), 결과 기록 +0xC0 | [판독] |
| +0x6C+i·4 | `courseRemixChart[i]` | 0 | 리믹스 목록 FUN_710042b780 | RmMgSceneBase SyncedSetupGame → +0x6C8 | [판독] |
| +0x94+i·4 | `courseTeamRaw[i]` = 4명 점수 합(raw) | 0 | 결과 기록 FUN_710042ca10 | (읽는 곳 미확인) | [판독] |
| +0xC0+i·0x90 | 코스 i 결과 기록 | — | FUN_710042ca10 | GetResult* | [판독] 02_rhythm 8.3 |
| +0x660 / +0x664 | `rankStar` int 0..5 / `rateFix` f32 | 0 | FUN_710042ca10 (6.7) | 심사·보상·결과표 | [판독] |
| +0x6C3 | 결과 캡처 사용 | — | SyncedSetupGame `SetResultModeCaptureEnable(1)` | 결과 연출 | [판독] |
| +0x6C4 | `edStart` | 0 | SyncedSetupGame = (Params.ed_start≠0) | RmMgSceneBase SetupGame(결과 스킵) | [판독] |
| +0x6C5 | `medleyMgResultVisible` | **1** | SyncedSetupGame = Params.mg_result_visible(기본 1) | OnGameEnd·OnGameEndingBefore | [판독] |
| +0x6C7 | `refill`(재도전) | 0 | RefillInit `SetRefill(1)` @0x710002f5ac, EndStageWait 단계 1 `SetRefill(0)` @0x7100037494 | GenerateModeMgList, PreGameInit/Wait | [판독: 디스어셈블리 w1] |
| +0x6C8 | `remixChartNo`(현재) | 0 | RmMgSceneBase SetupGame 0, SyncedSetupGame(RC·리믹스) = +0x6C+idx·4 (`FUN_710042ca00`) | `GetRemixChartNo` | [판독] |
| +0x6CC | `comScoreIgnore` | 0 | SyncedSetupGame = Params.com_score_ignore | 점수·총점·결과표 | [판독] |
| +0x718 | 박수 SE 재생 중 | 0 | `PlaySeRcClanpMg`(`SQ_SE_RC_CLAP_MG`) | Stop | [판독] |
| +0x719 | `remixChefHatWipe` | **1** | 기본값 | 리믹스 와이프 FUN_710042a300/a450/9f30 | [판독] |
| +0x71C / +0x720 / +0x728 | 직전 리믹스 슬롯 A / B / C 게임 | **−1** / 0 / 0 | 리믹스 목록 생성 | 다음 리믹스의 제외 | [판독] |
| +0x72C | (미상) | 4 | 기본값 | — | 뜻 [미확정] |
| +0xF30 | 생성한 목록 vector<MinigameID> | — | GenerateModeMgList | — | [판독] |

같은 오프셋 주의: rc_stage01 `Sequence::Impl+0x328`은 `WorkModule+0x1CF0` 버퍼(모드워크 사본) 포인터라서, 그 **+0x30**이 RmGameWork **+0x38**(courseIndex)이다(8바이트 어긋남) [판독: AddArchiveFileSetting `ldrsw x27,[x8,#0x30]`].

### 4.2 rc_stage01::Scene::Params (기본값 전체) [판독 `Params::getPropertyList` @0x710002b5a8, `createInstance` @0x710002ba34]

Params 파일은 없다(아카이브의 `rc_stage01_param.json`은 ParameterMan용, 4.4). 값은 생성 기본값이다. 런타임에 Params를 읽는 함수는 Scene 생성자·SyncedSetupGame·SettingBpm·SettingGameWork 넷뿐이다 [판독: vt+0x88 호출 검색].

| +오프셋 | 이름 | 형/범위 | 기본 | 런타임 사용 |
|---|---|---|---|---|
| 0x08 | edit_param | bool | 0 | `ParameterMan::EditParam`(디버그 편집) |
| 0x09 | medley_select_start | bool | 0 | 읽지 않음 |
| 0x0A | visible_judge_dish | bool | 1 | `Sequence::Setup` 둘째 인자로 넘기지만 `Impl::Setup` 안에서 쓰는 곳을 찾지 못했다(`SetEnableVisibleDish`는 상수 1, @0x710002d364) [판독] |
| 0x0B | com_score_ignore | bool | 0 | RmGameWork+0x6CC |
| 0x0C | remix_wipe_chef_hat | bool | 1 | 읽지 않음(RmGameWork+0x719 기본 1) |
| 0x0D | minigame_sound_cash | bool | 1 | 읽지 않음(Sequence+0x25 기본 1) |
| 0x0E | bgm_beat_disp | bool | 0 | 읽지 않음 |
| 0x10 | ed_start | enum(3) | 0 | ≠0 → +0x6C4, ==2 → 진행 2 |
| 0x14 | timing_check_type | enum(2) | 0 | 읽지 않음 |
| 0x18 | course_select_free | bool | 0 | 읽지 않음 |
| 0x19 | remix_data_split_load | bool | 1 | 읽지 않음(Sequence+0x21 기본 1) |
| 0x1A | mg_result_visible | bool | 1 | RmGameWork+0x6C5 |
| 0x1C | ed_achieve_rate | int 0..100 | 0 | RmGameWork+0x40 |
| 0x20/0x24/0x28 | game1_id/game2_id/game3_id | enum(MinigameID) | −1 | 읽지 않음 |
| 0x2C | aging_setting | bool | 0 | 읽지 않음 |
| 0x30 | enter_type | int 0..1 | 0 | Sequence+0x48 |
| 0x34 | main_mode | enum(6) | −1 | 읽지 않음 |
| 0x38 | **speedup_bpm** | int 60..240 | **180** | 롱 후반 BPM |
| 0x3C | random_game | bool | 0 | Sequence+0x11(코스 목록 추가 셔플) |
| 0x3D | available_chk | bool | 1 | 읽지 않음 |

### 4.3 Sequence::Impl 주요 필드 [판독 `Sequence::Sequence` @0x710002cd3c, `Impl::Setup` @0x710002cf50]

| +오프셋 | 이름(웹 권장) | 기본 | 뜻 |
|---|---|---|---|
| 0x10 | minigamePlaying | 0 | PreGameWait 단계 9에서 1. 0이면 장면 정리 때 코스 중단(IsMiddleReset) |
| 0x11 | randomGame | Params | 코스 목록 async 셔플 |
| 0x12 | speedUp | 0 | 롱 index == 코스수/2 인 장면에서 1(SetSpeedUp) → 스피드 업 연출 |
| 0x14 | endStage | 0 | Scene::GameFlow 종료 조건(디버그 엔딩에서만 1) |
| 0x15/0x16 | edStart 두 플래그 | 0 | SetEDStart(디버그) |
| 0x1D | courseSelectStart | 0 | flag 0x39 진입·재도전 → 오프닝 생략 경로 |
| 0x1E~0x25 | (바이트) | 1,1,0,1,1,0,0,1 | 0x1E 연습 완료 플래그(연습 시작 때 0, 끝나면 1), 0x1F 박수 BGM(`OP_D`)을 모드 선택 직후(단계 2)에 켤지·연습 앞(단계 7)에 켤지, 0x20 `SetMonitorCourseLimit`(켜면 하드·리믹스 선택지를 잠금 — 시연대용 [추정], 기본 0), 0x21 리믹스 분할 로드, 0x22 연습 판정 합산(`InformationMan::SetCombineChk`), 0x25 미니게임 사운드 미리 로드 |
| 0x28 | skipEnable | 0 | `RmSaveWork::IsMedleyModeFirstGamePlay`면 1, 아니면 그 플래그를 세움(첫 플레이는 스킵 불가) |
| 0x2A / 0x2C | 상태(short) / 하위 단계(short) | | |
| 0x30 | seq (SEQ_ENUM) | | |
| 0x34 | timer f32(초, GetDeltaTime 감산) | | |
| 0x44 | 표시 등급 f32 | | JudgeFlash 값, PlayReport |
| 0x4C | gamesPerCourse | **3** | 노멀·하드 코스 수, 롱 = ×2, 실행 게임 index 나머지 |
| 0x50 | remixCount | 6 | 리믹스 목록 길이로 덮어씀 |
| 0x54 | forceMainMode | −1 | 디버그 |
| 0x58 | 사운드 전역 변수 스냅샷 | −1 | PreGame: **G14**(16분 위치, `ReadGlobalVariable(0xE)` @0x710002efb8), 설명 단계: **G12**(접수된 BGM 코드, `0xC`) — 값이 바뀔 때까지 대기 [판독] |
| 0x5C | edSkipAchieveRate | 0 | 디버그 |
| 0x64/0x68 | 박 카운터 / 마지막 박 | | `InformationMan::GetTimingBeat` 변화 세기 |
| 0x6C/0x3C | 불꽃 index / 경과 초 | | 7.4 |
| 0x7C | 선택지 커서(NEW 아이콘) | | |
| 0x80/0x84/0x88 | 강제 게임 ID | −1 | 디버그(접시 표시) |
| 0x2F8 | int[6] `{−1,0,2,4,6,8}` | | 별 수 → 불꽃 최대 index |
| 0x310 | f32[9] `{210,217,224,231,238,245,252,259,280}` | | 불꽃 SE 시각(프레임, 경과초×60) |
| 0x328 | modeWork* | WorkModule+0x1CF0 | 4.1 주의 |

### 4.4 ParameterMan — `rc/rc_stage01/data/rc_stage01_param.json` [판독 @0x710001d774][데이터]

| 키 | 범위(Serializer) | 파일 값 | 쓰는 곳 |
|---|---|---|---|
| StageInfo.monitor_layout_scl_x | 0.5..5.0 | 1 | 모니터 레이아웃 |
| StageInfo.monitor_layout_scl_y | 0.5..5.0 | 1.3 | 〃 |
| StageInfo.speed_up_sec | 0..4 | **2** | 롱 스피드 업 연출 대기(초) |
| WaitBeatVal.wait_beat_val | 1..16 | 1 | 첫 게임 직전 대기: 사운드 전역 변수 == 이 값 |

### 4.5 RmSaveWork 저장 배열(`save+8` 바이트 배열) [판독 main @0x710043007c·0x7100430044·0x71004300b4·0x710043014c·0x71004301c4·0x710043031c~0x7100430394]

| 바이트 | 뜻 | writer |
|---|---|---|
| 0x00..0x09 | 게임별 **최근 플레이 카운트** 0..2 (mg1801..1810) | 코스 생성(감소), 결과 기록(=2, 리믹스 제외). 쓰기 함수가 2로 클램프 |
| 0x0A + mode·10 + g | 모드별 게임 플레이함(IsMedleyMgPlay) | 결과 기록(RC 일 때) |
| 0x32 + mode | 모드 클리어 | 결과 기록에서 `+0x2C==0`(코스 마지막 게임) 일 때. 하드(2) 클리어면 GameFlag 0x44 |
| 0x36 + mode | 모드 선택해 봄(NEW 아이콘 끔) | 모드 선택 |
| 0x3A | 마지막 선택 모드 | 모드 선택 |
| 0x3B | 리듬 쿠킹 첫 게임 플레이함 | Impl::Setup |

### 4.6 리믹스 풀 [판독 FUN_710042b780][데이터 main @0x71015d8e3c]

`RemixMgListWork = {MinigameID id; int chartNo}`.

| 풀 | 원소(게임 × 채보) | 제외 |
|---|---|---|
| A | mg1801, mg1803, mg1805, mg1807 × `chart05s` | 직전 A(+0x71C) |
| B | mg1802, mg1806, mg1810 × `chart06s` | 직전 B(+0x720) |
| C | mg1802, mg1809, mg1810 × `chart09s` | 직전 C(+0x728), 이번 A0, B0 |
| D (표 @0x71015d8e3c) | mg1802, mg1804, mg1806, mg1808, mg1809 × `chart00s` | 이번 A0, B0, C0 |

리믹스 채보 파일 15개(`*_rm_chart??s.json`)가 위 풀 원소와 정확히 1:1로 대응한다 [데이터 + 재구현 계산 `remix_files_all_covered: true`].

## 5. 상태 전이와 전체 수명

### 5.1 코스 한 번의 수명

```
진행 0  rc_stage01 [Opening(2) → EnterStage(4)] → Explanation(5): 모드 선택·연습 → PreGame(6)
        └ 두 번째 이후 진입은 스킵 버튼으로 바로 5 (SkipWaitFunc)
        └ flag 0x39 이면 11(Refill)에서 시작: 모드 선택부터
        PreGame: AddArchiveFileSetting(코스 생성, 6.2) → 박수·카운트다운·데이터 로드 → 단계 9 CallScene(게임 0)
진행 1  (게임 k 끝나 돌아옴, k+1 < 코스수) rc_stage01 → PreGame(6) 단계 5부터 → CallScene(게임 k+1)
        롱 index 3: 스피드 업 연출(SQ_BGM_RC_BPMUP, "스피드 업!", speed_up_sec 2) 후 CallScene
진행 2  (index ≥ 코스수) rc_stage01 → EndGame(8) → JudgeCooking(9) → EndStage(10) → Refill(11) → 모드 선택 → 5 → 6 …
```

- 코스 index는 미니게임 장면 `CleanupGame`에서 늘어난다(조작 설명 실행 아님) [판독 main @0x7100443c20].
- 미니게임을 부르기 전에 rc_stage01 장면이 끝나면(일시정지에서 나가기 등, Impl+0x10==0) 또는 flag 0x42면 `Scene::CleanupGame`이 코스를 지운다(메인 BGM 정지, ResetRmGameModeWork, WorkModule::ResetGameModeWork) [판독].
- 재도전(Refill, 11): `RestartRmGameModeWork`(백업 모드워크 +0x730~ 에서 복원: 모드·BPM·코스 표·결과 등) → `SetRefill(1)` → 버퍼 courseIndex=0 → 모드 선택(RefillFunc, 메시지 `rc00_mw_modesele02/03`, 잠긴 선택지는 못 고름) → 5. 예외: flag 0x39 로 바로 11에서 시작했고 열린 모드가 1개면(Impl+0x27, `Impl::Setup`에서 계산) 선택 없이 모드 0 → 5 [판독 @0x710002f578, @0x7100037b6c].
- EndStage 단계 7: 재도전 메뉴(`bq::UiRetryMenu(true)`) 파이버가 끝나면 → 11. 메뉴에서 그만두기를 고른 경우의 장면 전환은 UiRetryMenu 내부라 [미확정].

### 5.2 진입 때 첫 상태 선택 — `Scene::SyncedSetupGame` [판독 @0x710002c234 디스어셈블리]

```c
s = (progress == 2) ? 8 : (progress == 1) ? 6 : 2;     // csel
if (progress == 0 && flag::Check(0x39)) { seq.SetCourseSelectStart(1); s = 11; }
if (idx >= 1 && mode == 1 && idx == courseCount/2) seq.SetSpeedUp(1);   // /2 는 0 쪽 절삭
seq.Setup(Params.random_game, Params.visible_judge_dish, Params.enter_type);
seq.StartSequence(s, coldBoot = (WorkModule::GetGameModeWorkSize() == 0));
```

`Impl::Setup`도 `this+0x30`을 계산하지만(코스 index≥1이면 `idx != 3 ? 6 : 8`) 곧바로 `StartSequence`가 덮어쓴다 — 관측 영향 없음 [판독].

### 5.3 PreGameWaitFunc 하위 단계 [판독 @0x7100034ad0]

`idx` = 함수 진입 때 courseIndex. "박 바뀜" = `InformationMan::GetTimingBeat(1)`이 이전 값과 다름.

| 단계 | 첫 게임(진행 0) | 코스 중간(진행 1) |
|---|---|---|
| 0 | (재도전 아님) 박수 상호작용, 박 2번 세고 `GetTimingBeat==7`에서 `SQ_BGM_RC_OP_DATALOAD`. (재도전) 타이머 0.1667 s 뒤 조명 플래시·`PlayEncoreBGM`(메인 리듬 + `SQ_BGM_RC_OP_ENCORE`)·비트 패드 진동. → 1 | — (Init이 단계 5로 시작) |
| 1 | 박 8번마다 카메라 13·14, `SQ_SE_RC_CLAP_CHEER_OP_DATALOAD`(재도전 `…_ENCORE`), `SQ_SE_RC_STAGE01_COUNTDOWN`, 연습 UI 끝 → 사회자·심사위원 모션, 카메라 15 | |
| 2 | 1박 뒤 연습 끔, 업적 0x7B(플레이어 0~3), 4명 점프 | |
| 3 | 1박 뒤 `SQ_BGM_RC_MG18%02d_DATALOAD`(**코스 첫 게임** +0x44[0]), `PlaySeRcClanpMg`, 카메라 15(90°), 타입 레이아웃, 이펙트 `rc_stage01_confetti_start_00`, `SQ_SE_RC_STAGE01_CRACKER`, 타이머 1.5 s | |
| 4 | 타이머 뒤 심사위원 페이드아웃(0.5), 타이머 0.4 | |
| 5 | 타이머 뒤 리믹스면 `UIMan::StartRemixWipe(+0x44[0])`, 아니면 `StartPictogram`. 타이머 0.5 | speedUp: 메인 BGM 이 켜져 있고 G14 가 스냅샷과 같으면 대기(다음 16분음표까지) → MgWipe 페이드아웃, `SQ_BGM_RC_BPMUP` + `SQ_SE_RC_CHEER_TEMPO_UP`, "스피드 업!" UI, 타이머 = speed_up_sec(2), 박 4개 세기 시작 |
| 6 | 카메라 끝나면 와이프 페이드아웃(2) | speedUp: 박 세기 끝 & `GetTimingBeat(0)==2` → `SQ_BGM_RC_DATALOAD` |
| 7 | G14 == wait_beat_val(1)(마디 첫 16분) 이고 페이드 끝 → 환호 정지 | speedUp: 타이머 뒤 `StartMiniGameWipe(실행 게임, 2)`, MgWipe 페이드인, 타이머 2.0 |
| 8 | 타이머 대기 | speedUp: MgWipe 페이드아웃 |
| 9 | (idx≠0 또는 RmFileMan 로드 끝) → 실행(6.4) | 같음 |

## 6. 계산식·조건·상세 의사코드

### 6.1 코스 수와 코스 표 — `AddArchiveFileSetting` [판독 rc_stage01 @0x7100033690, 디스어셈블리 rcF_rc_dis2.c]

코스 index 0(버퍼 +0x30 == 0)일 때만 코스를 만든다.

```c
mode = gw.mode;
if      (mode == 1) { arg = seq.gamesPerCourse /*3*/; count = arg << 1; }   // 0x7100033718: ldr w1,[x24,#0x4c]; lsl w22,w1,#1
else if (mode == 3) { arg = 10;                  count = 10; }
else                { arg = seq.gamesPerCourse;  count = arg; }
list = gw.GenerateModeMgList(arg);                  // 6.2 / 6.3
n = list.size();
if (mode == 3) { seq.remixCount(+0x50) = n; count = n; }
gw.courseCount(+0x3C) = count;
if (seq.randomGame && n >= 2) async Fisher–Yates(list, RandMod(k), k = n..2);   // Params.random_game, 기본 꺼짐
for (i = 0; i < count; i++) gw.courseMg[i](+0x44+i*4) = list[i % n];
// 이어서 아카이브 등록: sound/subarc_rc_cmn, subarc_rc_stage01, libca/common, libca/mg_common, mg/mg1800, mg/mgResult, mg/mgInst,
//   rc/rc_stage01, object/obj20~22, chara/pcMot_rc, chara/pcMot_rhy,
//   (Sequence+0x25) sound/subarc_mg18NN × 목록, "mg/"+MGList 이름 × 목록(+ NPC 캐시), chara/pcNN × 4명 → StartLoadAsync
// 리믹스 + 분할 로드(Sequence+0x21, 기본 1): index>0 이면 이전 게임 아카이브 해제, 현재·다음 게임만 등록
```

- **정정/보충**: Ghidra 디컴파일은 롱 모드의 `GenerateModeMgList` 인자를 보여 주지 않는다. 디스어셈블리로 보면 롱도 인자는 **3**이고 코스 수만 6이다. 그래서 롱 = **같은 3게임을 두 번**이다 [판독].
- 실행 게임 index(6.4)는 `idx % (mode==3 ? Seq+0x50 : Seq+0x4C(3))`이고, 롱의 +0x44[3..5]도 list[0..2]라 기록·실행이 같다.

| 모드 | 목록 함수 인자 | 코스 수(+0x3C) | 실행 순서 | 채보(mg1801형) | BPM | 게임 BGM |
|---|---|---|---|---|---|---|
| 0 노멀 | 3 | 3 | a, b, c | chart00 | 120 | `SQ_BGM_<MG>_A` |
| 1 롱 | 3 | 6 | a, b, c, a, b, c | chart00 | 120, 120, 120, **180, 180, 180** | 120: `_A`, 180: `_B` |
| 2 하드 | 3 | 3 | a, b, c | chart01 | 120 | `_C` |
| 3 리믹스 | (무시) | 6 | A0, B0, D0, D1, D2, C0 | `chart05s, 06s, 00s, 00s, 00s, 09s` | 120 | `SQ_BGM_RC_REMIX` |

채보·BGM 열은 02_rhythm 6.2·6.3(mg1801 RmSyncedSetupGame 판독)을 코스에 적용한 것이다. mg1802·1804·1806·1809는 채보 이름을 조각 표로 만든다 — 각 게임 문서가 확정한다 [판독: mg1801형만].

### 6.2 노멀·롱·하드 게임 고르기 — `RmGameWork::GenerateModeMgList(count)` [판독 main @0x710042a7a0 디스어셈블리]

```c
// save[g] = RmSaveWork 최근 플레이 카운트(0..2). refill = gw+0x6C7
listA = [g in mg1801..1810 if save[g] == 2];
if (!refill) {
  starter = [{1801,save},{1802,save},{1803,save},{1810,save}];     // 가용 검사 없음
  syncShuffle(starter); libcxxSort(starter, by save asc);           // 6.5
  first = starter[0].id;
}
work = [{g, save[g]} for g in mg1801..1810 if MGList::IsAvailable(g) && (refill || g != first)];
if (work 전부 save > 0) for each w: { w.save--; save[w.id] = w.save; }   // 모두 한 번씩 했으면 한 단계 낮춤
for g in listA: save[g] = 1;                                          // "방금 2" 였던 것은 1로
syncShuffle(work); libcxxSort(work, by save asc);
n = work.size();
if (!refill) { out = [first]; if (count >= 2 && n >= 2) for (k = 1; k < count && k < n; k++) out.push(work[(k-1) % n].id); }
else          { for (k = 0; k != count && k != n; k++) out.push(work[k % n].id); }
gw+0xF30 = out; return out;
```

- 결과: 코스 첫 게임은 **mg1801·1802·1803·1810 중 덜 한 것**(같으면 무작위), 나머지는 **덜 한 게임 우선**(같으면 무작위). 재도전(refill)은 첫 게임 제한이 없다.
- 결과 기록(6.6)이 플레이한 게임을 2로 쓴다(리믹스 제외). 그래서 연속 플레이하면 같은 게임이 잘 반복되지 않는다.
- 목록 길이 = min(count, n) (+첫 게임). 열린 게임이 첫 게임 말고 1개 이하이면 목록은 [첫 게임] 하나이고, 코스 표는 그 게임을 3번 채운다 [판독, 실제 발생 여부는 해금 조건에 달림].

### 6.3 리믹스 고르기 — `FUN_710042b780` [판독 main 디스어셈블리]

```c
A = [x in poolA if x.id != gw+0x71C]; syncShuffle(A);
B = [x in poolB if x.id != gw+0x720]; syncShuffle(B);
C = [x in poolC if x.id != gw+0x728 && x.id != A[0].id && x.id != B[0].id]; syncShuffle(C);
D = [x in poolD(@0x71015d8e3c) if x.id not in {A[0].id, B[0].id, C[0].id}]; syncShuffle(D);
course = [A[0], B[0], D[0], D[1], D[2], C[0]];
gw+0x71C = A[0].id; gw+0x720 = B[0].id; gw+0x728 = C[0].id;
for i in 0..5: { gw+0xF30.push(course[i].id); gw+0x6C+i*4 = course[i].chartNo; }
```

- 초기 직전값 −1/0/0 → 첫 리믹스는 제외 없음 [판독 rcF_main_dec3.c].
- 모든 직전 상태에서 C 후보는 1개 이상, D 후보는 3개 이상이다(전수: 최소 C 1, D 3) → 항상 6게임 [재구현 계산].
- 서로 다른 리믹스 코스는 456가지(직전 상태 전부 합쳐서) [재구현 계산].

### 6.4 게임 실행과 +0x2C — PreGameWaitFunc 단계 9 [판독 @0x7100034ad0, 디스어셈블리 @0x71000355ec·f4]

```c
if (idx != 0 || RmFileMan::IsCompleted()) {
  seq.minigamePlaying(+0x10) = 1;
  k = (gw.courseIndex >= gw.courseCount) ? gw.courseCount - 1 : gw.courseIndex;
  gw.SetResultMgId(k, gw.courseMg[k]);                         // +0xC0 + k*0x90
  if (gw.courseCount >= 1) {
    per = (mode == 3) ? seq.remixCount : seq.gamesPerCourse;  // 6 또는 3
    mg = gw.courseMg[k % per];
    bex::Scene::CallScene(MGList::GetName(mg), 0, -1); GameWork::SetMinigameID(mg);
    if (progress != 1) 무대 오브젝트 전부 숨김;
  } else StopSound(main BGM 포함);
  gw.moreGamesInCourse(+0x2C) = (k < gw.courseCount - 1) ? 1 : 0;
}
```

+0x2C를 읽는 미니게임 쪽 분기 [판독 main, 02_rhythm 7절 + 이번 확인]:

| 위치 | +0x2C = 0 (코스 마지막) | +0x2C = 1 (뒤에 더 있음) |
|---|---|---|
| OnGameMain 단계 6 끝 BGM | 종료 BGM 요청(마디 동기) | (리믹스 아님) 종료 BGM 직접 Play |
| 단계 8 | PERFECT 텔롭 | 없음 |
| 단계 9 | 7박 대기 후 게임 BGM 정지·`StopMainBgm` | 대기 없음, 메인 BGM 유지 |
| OnGameEnd | 결과 진행 | 노멀·롱·하드: `+0x6C5`(기본 1)면 결과 진행 / 리믹스: `FUN_710042a300(gw, idx+2)`(셰프 모자 와이프) → 페이드 → `RequestReturnScene` |
| OnGameEndingBefore | 결과 연출 | 리믹스 또는 (`+0x6C5==0` 이고 1) 이면 연출 없이 통과 |
| OnGameEnding | `SQ_SE_RC_CHEER_MG_FIN`, 결과 징글 GOOD/BAD | `SQ_SE_RC_CHEER_MG`, 징글 없음 |
| CleanupGame | 사운드 전역 0..15 = −1 | 유지(마스터 박자 계속). 단 `FUN_71001a2ca4(장면)==3`(장면 종료 사유 [추정])이면 리셋 |
| RmMgSceneBase 생성자 | — | 리믹스면 `SetFadeEnable(false)`(이음매 없이) |

리믹스는 OnGameEnd가 언제나 위 "그 밖" 경로라서 마지막 게임도 게임별 결과 없이 rc_stage01 로 돌아가 심사로 간다 [판독 OnGameEnd @0x71004453c4: `mode != 3` 조건].

### 6.5 셔플·정렬의 정확한 순서 [판독]

- `syncShuffle(a)`: `for (k = n; k >= 2; k--) { r = SyncRandMod(k); swap(a[k-1], a[r]); }` (n ≤ 1이면 소비 없음). `SyncRandMod(k) = (u32 * k) >> 32` (core 담당, `tools/core_rand.py`).
- `libcxxSort`: libc++ `std::sort`, 비교 `a.save < b.save`(MgListWork+4, signed). 길이 2~5는 분기형 `__sort2~5`, 6~30은 `__insertion_sort_3`(앞 3개 `__sort3` 후 삽입 정렬), 31 이상 introsort(여기서는 최대 10이라 안 씀) [판독 FUN_710042e320·FUN_710042f0c0: `case 2..5`, `len*8 < 0xF8`]. **같은 키 사이 순서가 이 알고리즘에 달려 있어서 웹은 같은 정렬을 그대로 옮겨야 한다.**
- 시드: 코스 생성은 rc_stage01 장면 안에서 sync 난수를 쓴다. 오프라인 sync 시드는 장면마다 `SetSyncRandSeed(async.Rand())`(core 담당). 실제 시드 값은 [미확정](원본 실행 필요).

### 6.6 게임 하나의 결과 기록 — `FUN_710042ca10` [판독 main, 02_rhythm 8.3 보충]

기준 `R = RmGameWork + idx*0x90`(idx = courseIndex):

```c
R+0xC0  = gw.courseMg[idx];                 // +0x44+idx*4
gw+0x94+idx*4 = score[0]+score[1]+score[2]+score[3];   // raw 팀 합
R+0xC4[p] = playNum, R+0xD4[p] = JUST 수, R+0xE4[p] = score, R+0xF4[p]/+0x104[p] = Ext a/b
R+0x114 = achieved, R+0x118 = total, R+0x11C = rate(f32), R+0x120 = judge 0..3, R+0x124 = (int)(rate/20)
avg = Σ_{k=0..idx} R_k.rate (f32 순차 합) / (idx+1);                  // 지금까지 게임 평균
gw+0x660 = (int)(avg/20);  gw+0x664 = f32(f32(trunc(avg/20*10)) / 10) * 20;
if (gw.inRhythmCooking) {
  if (mode != 3) save.recent[mg] = 2;
  save.mgPlayed[mode][mg] = 1;
  if (gw.moreGamesInCourse == 0) save.modeCleared[mode] = 1;   // 하드면 GameFlag 0x44
}
if (mode != 3) for p: if (ExtA*ExtB + playNum*2 <= score) 업적 0x81(p);   // 게임별 PERFECT
```

- `rate` = `GetStarAchieveRate` @0x7100436558: `f32(achieved)/f32(total)*100`, 음수 → 0, `fmin(·,100)`. total = 0 이면 NaN 이 그대로 간다(원본 특이점) [판독].
- 모든 연산은 f32다(`fdiv/fmul s`, `fcvtzs`로 0 쪽 절삭) [판독 rcF_main_dis2.c].
- "모드 클리어"는 코스 마지막 게임의 결과 기록 때다. 점수 조건은 없다(끝까지 하면 클리어) [판독].

### 6.7 셰프 등급·심사 [판독 JudgeCookingWaitFunc @0x7100035a90, StartResultMotion, SetCongratulationRewardInfo]

| 값 | 식 | 쓰는 곳 |
|---|---|---|
| `rankStar` (+0x660) | `(int)(avg/20)` 0..5 | 결과표 `im_rc_rank%02d`, 보상 `RhythmCookingRank`, 꽃가루 개수, 불꽃 수 |
| `rateFix` (+0x664) | `trunc(avg/20·10)/10·20` (0.1 등급 단위로 내린 %) | 아래 |
| 표시 등급 | `f = rateFix/20; f = (int)(f·10)/10` → `UIMan::StartJudgeFlash(f)`, Impl+0x44 | 심사 플래시, PlayReport |
| 축하 | `rateFix/20 ≥ 1.0` → 심사위원 모션 4→5, `SM_JIN_RC01_ED_CONGRATULATIONS`, 크래커, 종이 꽃가루, ResultTelop, `WD_VOI_LOC_SYS_CONGRATULATIONS`, 환호 `…RESULT_JOY_MID`(≥4.0) / `…_LOW` | |
| 실패 | `< 1.0` → 모션 9→10, `SM_JIN_RC01_ED_DRAW`, 플레이어 모션 0x21→0x22 | |
| 꽃가루·큰 축하 | 꽃가루(StartPaperEffect @0x71000368e8): rankStar ≥ 1일 때 0번 = (`≥ 4.0` ? `rc_stage01_confetti_00_max` : `rc_stage01_confetti_00`), 이어서 rankStar ≥ 2·3·4·5 이면 `_01`·`_02`·`_03`·`_04`. `≥ 4.0` 이면 플레이어 모션 0x1D(아니면 0x20), 업적 0x82+mode(플레이어 0~3) | |

- 심사 시작: 3초 → (분할 화면 옵션) → 1초 → 결과 롤 BGM `SM_BGM_RC_RESULT_ROLL`, 카메라 0x11 → 심사위원 동작(시선 45°/−45°, 1.75 s …) → 카메라 모션 프레임 ≥ 320 → 점수 UI(`StartJudgeScore`) → 카메라 0x12, `SM_BGM_RC_RESULT` → 3 s → 카메라 0x13, 축하/실패 → 3.5 s → 결과 텔롭 → 카메라 끝 → 1 s → EndStage [판독, 시간은 코드 상수].
- 업적 0x86(플레이어 0~3): 10게임 모두 노멀·롱·하드 중 하나에서 한 번 이상 플레이 [판독].

### 6.8 결과표·보상 [판독 Result::Impl::SetResultTeam @0x7100028c30, SetResultDetail @0x7100029340, SetRewardInfo @0x71000378e0]

- 팀 페이지: `im_rc_rank%02d`(rankStar), `im_rc_mode%02d`(mode), 플레이어별 `GetResultPlayerStarAchieveRateFix(p)` → "정수.소수%" 두 칸, CPU 표시.
  - `GetResultPlayerStarAchieveRateFix(p)` = 코스 전체 k<count 평균 `score/(ExtA·ExtB + playNum·2)·100` (count ≤ 0 이면 0/0) [판독 main @0x710042d100].
- 상세 페이지(라운드 최대 6): 라운드 rate(정수.소수), 썸네일 `rc_stage01_thum_<mg이름>`, 게이지, 플레이어별 점수/최대. `IsPlayerCom && IsComScoreIgnore`면 그 칸 숨김.
- 보상: 플레이어 p = 0~3마다 `RewardModule::RhythmCookingRank(p, mode, rankStar)`, 그리고 코스 모든 게임 k에서 `GetResultPlayerScore(k, p) == GetResultPlayerScoreMax(k, p)`면 `RhythmCookingPerfect(p, mode)`. 끝으로 `PlayReportModule::RhythmCookingRank(표시 등급)` [판독: 디스어셈블리 `rcF_rc_dis4.c` w1=k, w2=p].

### 6.9 모드 해금 — `RmSaveWork::GetMedleyModeOpenNum` [판독 main @0x71004301c4]

```c
c = (cleared[0]!=0) + (cleared[1]!=0) + (cleared[2]!=0) + (cleared[3]!=0);   // +0x32..0x35
if (c > 3) c = 3;
open = c + 1;                                   // 1..4
if (c >= 3 && 어떤 게임 g 가 mgPlayed[0][g]==mgPlayed[1][g]==mgPlayed[2][g]==0) open = 3;
```

- 선택지 i는 `i < open`이면 고를 수 있다(SettingCourseChoice @0x7100032db0, 메시지 창 선택지 잠금 바이트 +0x1E8/+0x280/+0x318/+0x3B0) [판독].
- 그래서: 노멀은 처음부터, 롱은 아무 모드 1개 클리어 뒤, 하드는 2개, 리믹스는 3개 클리어 **그리고** 10게임 모두를 노멀·롱·하드에서 해 본 뒤 [판독].
- open == 1 이면 선택 창 없이 모드 0 [판독 ExplanationGameWait 단계 0·1].
- 커서 시작: 열린 모드 중 아직 안 고른 첫 모드(NEW 아이콘), 없으면 마지막 선택 [판독].
- 사회자 문구: 조작 플레이어 캐릭터가 KOOPA(13)·KOOPA_JR(18)이면 존댓말 `rc00_mw_modesele01`("…요리하시겠습니까?" / "My Liege"), 아니면 `00` [판독][데이터].

### 6.10 BPM [판독, mg1801_rhythm 2.2 재사용]

`mode != 1 → SetBpm(120)`, `mode == 1 && idx >= count/2 → SetBpm(Params.speedup_bpm=180)`, 롱 전반은 호출 없음(이전 값 유지). rc_stage01 생성 때마다(=게임마다) 실행된다. 재도전의 `RestartRmGameModeWork`는 백업 BPM 120으로 되돌린다. 전환 연출은 5.3 단계 5~8.

### 6.11 CPU·com_score_ignore

- 리듬 쿠킹도 CPU가 각 게임 규칙대로 플레이한다(장면이 따로 하는 것 없음). Params.com_score_ignore 기본 0 → CPU 점수도 팀 합에 들어간다 [판독].
- 켜면(디버그): CPU 점수 가산 무시, 게임 총점 = 사람 수 × (총점/4)(02_rhythm 8.1), 결과표 CPU 점수 칸 숨김 [판독].

## 7. 애니메이션·이펙트·소리·카메라·에셋 연결

### 7.1 아카이브 [판독 Scene::Scene, AddArchiveFileSetting][데이터]

| 아카이브 | 언제 |
|---|---|
| `rc/rc_stage01` | 코스 생성 때 RmFileMan 등록(무대 모델 `rc_stage01_map_00~03`, `stage_00(_in/_out)`, `monitor_00`, `spot_00~02`, `hat_00`, 관객 `audience_*`, 환경 `env_*`, 카메라 fsnb 30개) |
| `rc/rc_result` | 진행 2(코스 끝): 접시 `rc_result_mg18NN_dish_{a,b,c}.fmdb` 30개 |
| `sound/subarc_rc_cmn`, `subarc_rc_stage01` | 공용 리듬·무대 소리 |
| `sound/subarc_mg18NN`, `mg/mg18NN` | 코스 게임마다(리믹스 분할 로드면 현재·다음만) |
| `mg/mg1800`, `mg/mgResult`, `mg/mgInst`, `libca/common`, `libca/mg_common`, `object/obj20~22`, `chara/pcMot_rc`, `chara/pcMot_rhy`, `chara/pcNN`×4 | 공용 |

### 7.2 접시 모델 선택 [판독 Impl::Setup·Dish::Setup @0x7100011370][데이터 rc_stage01 @0x7100080cc4 = {2,2,1}]

```
path = "rc/rc_result/model/rc_result_mg18" + 2자리(mgIndex+1) + "_dish_" + {cond 1:'b', 2:'c', 그 밖:'a'} + ".fmdb"
cond = (judge < 3) ? {2,2,1}[judge] : 0        // judge = GetResultStarAchieveJudge(코스 i)
```

별 판정 3 → `_a`, 2 → `_b`, 0·1 → `_c`. 노멀·하드 접시 3개(슬롯 0~2), 롱·리믹스 6개(슬롯 0~5, `(mode−1) & ~2 == 0`) [판독].

### 7.3 소리 [판독 문자열 + 호출 위치]

| 라벨 | 시점 |
|---|---|
| `SQ_BGM_RC_MAIN_RHYTHM`(메인 박자 시계) + `SQ_BGM_RC_STAGE01_OP_A/B` | 오프닝(StartModeMainBgm/StartModeOpBgm). 메인 박자 시퀀스는 코스 내내 켜져 있다(RmGameWork+0x6C0) |
| `SQ_BGM_RC_STAGE01_OP_D` | 박수 연습(StartClapSound) + 비트 패드 진동 |
| `SQ_BGM_RC_OP_DATALOAD`, `SQ_BGM_RC_MG18%02d_DATALOAD`, `SQ_BGM_RC_DATALOAD` | 첫 게임 로드 대기, 스피드 업 뒤 |
| `SQ_BGM_RC_OP_ENCORE` | 재도전 |
| `SQ_BGM_RC_BPMUP`, `SQ_SE_RC_CHEER_TEMPO_UP` | 롱 스피드 업 (BPMUP 시퀀스가 G11 을 123→…→180 으로 올림, rhythm 담당 [데이터]) |
| `SM_JIN_RC_STAGE01_OP`, `SM_JIN_RC_STAGE01_RESULT_TELOP`, `SM_BGM_RC_RESULT_ROLL`, `SM_BGM_RC_RESULT`, `SM_JIN_RC01_ED_CONGRATULATIONS`/`_DRAW`, `SM_BGM_RC_ED_RETRY` | 오프닝 징글, 심사, 결과, 재도전 |
| `SQ_SE_RC_CHEER_*`, `SQ_SE_RC_CLAP_*`, `SQ_SE_RC_STAGE01_{APPEAR_KAMECK,COUNTDOWN,CRACKER,EMBLEM,FIREWORKS(_SHORT),OP_JUST,SPOTLIGHT}`, `SQ_VOI_NPC022_RC_STAGE_GAYA`, `WD_VOI_LOC_SYS_CONGRATULATIONS` | 관객·연출 |

불꽃 SE: 축하 뒤 경과초×60 ≥ `{210,217,224,231,238,245,252,259,280}[i]` 마다 i 번째를 재생(i ≤ `{−1,0,2,4,6,8}[rankStar]`), i ≤ 6 이면 `…_FIREWORKS_SHORT`, 그 뒤 `…_FIREWORKS` [판독 ObserveEndPaperEffect @0x7100036cfc]. 파일 대응(FSAR)은 sound 담당 범위.

### 7.4 카메라·UI

- 카메라는 `CameraMan::PlayCamera(pattern)` 번호(CAM_PATTERN 0x00~0x14)와 `env/rc_stage01_*_camera_NN.fsnb` 30개로 움직인다. 번호 ↔ 파일 표는 `CameraMan::Impl::Setup` @0x7100005db0 판독이 필요하다 [미확정].
- UI: `UIMan` TypeLayout(타입 0/1/2), Pictogram, RemixWipe/RemixLayout, MiniGameWipe, RythmPractice, Speedup, JudgeFlash/Score, Result(팀·상세 페이지) — 레이아웃 파일 연결은 ui 담당 범위 [미확정].

## 8. 다른 기능과의 상호작용

- **미니게임 장면**: 각 게임은 RmGameWork만 본다(inRhythmCooking=1, mode, bpm, courseIndex, remixChartNo, +0x2C, +0x6C5). 단독·파티 플레이와의 차이는 전부 이 필드로 갈린다. 조작 설명(inst)은 `IsInstActive = flag0 && +0x1C==0`이라 리듬 쿠킹에서는 나오지 않는다 [판독].
- **마스터 박자 시계**: 메인 리듬 시퀀스는 rc_stage01 오프닝에서 켜져 코스 끝까지 이어진다. 미니게임 OnGameStartAfter는 이미 재생 중이면 다시 틀지 않는다. 그래서 게임 BGM 시작 마디 위상은 코스 안에서 연속이다 [판독, 02_rhythm 9.1].
- **일시정지**: 대부분의 단계에서 `UiPause::SetEnableOpen(false)`. 일시정지로 나가면 Impl+0x10 == 0 → 코스 중단(5.1).
- **스킵**: 첫 플레이 뒤부터 오프닝을 스킵 버튼으로 건너뛰어 모드 선택(5)으로 간다(Impl+0x28) [판독 ChkStartSkip @0x7100030540].
- **세이브**: RmSaveWork 바이트 배열(4.5). 코스 생성이 최근 카운트를 낮추고 결과 기록이 2로 올린다 — 코스 하나 안에서 두 번 변한다.
- **업적·보상·플레이 리포트**: 6.6~6.8.

## 9. 웹 포팅 구조와 구현 순서

### 9.1 모듈 (웹 권장 이름)

| 모듈 | 책임 |
|---|---|
| `web/script/modes/rhythmCooking/modeWork.ts` | `RmModeWork`(4.1 필드), `RhythmSave`(4.5), 기본값·Restart(백업 복원) |
| `…/course.ts` | `generateModeMgList`, `generateRemix`, `libcxxSort`, `syncShuffle`, `buildCourse`(6.1~6.5). 노드에서 도는 순수 로직 |
| `…/record.ts` | `recordGameResult`(6.6), `courseRank`(6.7), `openModeCount`(6.9) |
| `…/sequence.ts` | rc_stage01 상태기계(3.3, 5.x) — 단계·타이머·박 세기. 연출은 이벤트로만 낸다 |
| `…/scene.ts` | "모드 장면": 시퀀스를 돌리다가 `CallScene` 지점에서 미니게임 `GameDef`를 만들어 끝까지 돌리고 결과를 받아 다음으로 |
| `…/view/*` | 무대·접시·심사·결과표(후순위) |
| 공용 수정 필요 | `games/_rhythm` 박자 시계를 장면 밖에서 주입(코스 내내 하나), 게임 결과에 공용 리듬 결과 필드 |

### 9.2 게임 계약(game.ts) 위에 얹는 방법

현재 `GameDef.createLogic(setup: GameSetup)`은 한 판짜리다. 리듬 쿠킹은 `GameSetup`을 넓혀 원본 RmGameWork가 게임에 주는 값을 그대로 넘긴다.

```ts
/** 원본 RmGameWork 에서 미니게임이 읽는 값 (웹 권장 이름) */
interface RhythmContext {
  inRhythmCooking: boolean;      // +0x1C
  mode: 0 | 1 | 2 | 3;           // +0x20
  bpm: number;                   // +0x30
  courseIndex: number;           // +0x38
  remixChartNo: number;          // +0x6C8
  moreGamesInCourse: 0 | 1;      // +0x2C
  mgResultVisible: boolean;      // +0x6C5
  comScoreIgnore: boolean;       // +0x6CC
  clock: RhythmClock;            // 코스 공용 마스터 박자 시계(G14 위상 연속)
}
interface RhythmGameSetup extends GameSetup { rhythm?: RhythmContext }

/** 결과 기록(FUN_710042ca10)이 게임에서 가져가는 값 */
interface RhythmGameResult extends GameResult {
  scores: number[]; justCount: number[]; playNum: number[]; extA: number[]; extB: number[];
  achieved: number; total: number; rate: number /*f32*/; judge: 0|1|2|3; grade: number /*0..5*/;
}
```

모드 장면 의사코드:

```ts
class RhythmCookingScene {
  step(pads) {
    if (this.game) {                       // 미니게임 실행 중
      this.game.logic.step(pads);
      if (this.game.logic.done) {
        recordGameResult(this.work, this.save, this.game.logic.result, this.currentMg);  // 6.6 (원본은 게임 단계 8 시점)
        this.work.courseIndex++;            // RmMgSceneBase::CleanupGame
        this.game = null;
        this.enterStage01();                // 진행 0/1/2 계산 → 첫 상태(5.2) + SetBpm(6.10)
      }
      return;
    }
    this.seq.step(pads);                    // 3.3 상태기계
    const launch = this.seq.takeLaunch();   // PreGameWait 단계 9
    if (launch) {
      this.work.moreGamesInCourse = launch.k < this.work.courseCount - 1 ? 1 : 0;
      const def = GAMES[launch.mg];
      this.game = { def, logic: def.createLogic({ ...this.baseSetup, seed: this.nextSeed(), rhythm: this.rhythmContext() }) };
    }
  }
}
```

- 원본 순서 유지: 결과 기록은 게임 OnGameMain 단계 8(종료 텔롭 1박 뒤)에서 일어나고, 코스 index 증가는 장면 정리 때다. 웹은 게임 로직이 결과를 낸 뒤 장면이 기록·증가를 하되, **기록 → 증가 → rc_stage01 진입(BPM 결정)** 순서를 지킨다.
- 게임 사이 결과 연출(노멀·롱·하드)은 각 게임 뷰의 결과 연출이고, 리믹스는 없다(6.4 표).
- 시드: 원본은 장면마다 `SetSyncRandSeed(async.Rand())`. 웹은 `GameSetup.seed`로 async를 하나 두고 rc_stage01 진입·게임 진입마다 sync를 다시 시드한다(core 담당 01_core 규칙과 같게).

### 9.3 원본 이름 ↔ 웹 권장 이름

| 원본 | 웹 |
|---|---|
| `RmGameWork::GenerateModeMgList` | `generateModeMgList(save, available, refill, count, rng)` |
| `FUN_710042b780` | `generateRemix(prev, rng)` |
| `FUN_710042ca10` | `recordGameResult` |
| `RmSaveWork::GetMedleyModeOpenNum` | `openModeCount` |
| `Sequence::Impl` +0x30 / +0x2C / +0x34 | `seq.state` / `seq.sub` / `seq.timer` |
| `RmGameWork+0x2C` | `moreGamesInCourse` |
| `RmGameWork+0x660/+0x664` | `rankStar` / `rateFix` |
| `MAIN_MODE` 0..3 | `mode` = normal · long · hard · remix (내부 값은 0..3 그대로) |

### 9.4 웹 환경 때문에 바꿀 것과 동등성 유지

- 장면 교대·모드워크 버퍼 복사(원본) → 웹은 객체 하나(`RmModeWork`)를 장면 객체가 들고 있으면 된다. 원본 소멸자 Push 조건(매직·크기 일치)은 항상 참이라고 둔다(같은 장면 세션 안).
- 아카이브 비동기 로드 대기(`RmFileMan::IsCompleted`) → 웹은 에셋 프리로드 Promise. 원본은 첫 게임만 로드 완료를 기다린다.
- f32 산술(6.6·6.7)은 `Math.fround`로 순서 그대로.

### 9.5 구현 순서 (권장)

1. `course.ts` + 시험(10절 기대값): 정렬·셔플·목록·리믹스.
2. `record.ts`(결과 기록·등급·해금) + 시험.
3. 텍스트 전용 모드 장면: 모드 선택 → 코스 실행 → 등급 표시. 웹에 아직 없는 게임은 원본 목록을 그대로 보이고 실행만 건너뛴다(다른 게임으로 바꾸지 않는다).
4. 박자 시계 주입(mg1801 `RhythmClock`을 장면 소유로) + BPM 180 롱 후반.
5. 무대·심사·결과표 뷰.

## 10. 검증 코드·실행 결과·기대값

| 종류 | 내용 | 결과 |
|---|---|---|
| 원본 명령 판독 | Ghidra headless(`ghidra_work/rcF`, CoreTool `disf/dec/dis/refs/vtgot`) | 2절 파일들 |
| 저장 명령 스캔 | main 0x7100425000..0x7100450000 과 rc_stage01 Scene/Sequence 함수에서 `str w,#0x2c`·`stp`·`str x,#0x28` 등 | RmGameWork+0x2C 쓰기 = PreGameWaitFunc 두 곳(+Restart 복원)만. 다른 후보는 스택·다른 객체 [판독] |
| 데이터 확인 | main.decomp.bin 평면 이미지에서 표 읽기: 리믹스 D @0x71015d8e3c, 박자 표 @0x71015d8dc4·@0x71015d8eb0(기존 판독값과 일치로 이미지 오프셋 확인) | D = {1802,1804,1806,1808,1809}×0 |
| 데이터 확인 | rc_stage01.nro `@0x7100080cc4` = {2,2,1}, `@0x710007dc60/f858/fd2a` = 'b','a','c' | 7.2 |
| 재구현 계산 | `.venv/Scripts/python tools/rcF_calc.py` → `analysis/rcF_calc.json` | 아래 |

`tools/rcF_calc.py` 결과 [재구현 계산, 원본 실행 대조 없음]:
- 채보 줄 수(1P 길이) 35개. 리믹스 `s` 채보 15개가 풀 A~D 원소와 1:1 (`remix_files_all_covered: true`).
- 리믹스: 모든 직전 상태에서 D 후보 ≥ 3, 빈 C 없음, 서로 다른 코스 456가지, 코스 총 줄 302~314(8분 × 줄 = 75.5~78.5 s @120).
- 노멀(chart00) 3게임 총 줄 438~618, 하드(chart01) 436~618, 롱 876~1236(8분×줄 182.5~257.5 s, 뒤 절반 @180). "8분 × 줄"은 채보 길이일 뿐 실제 경과 시간(카운트인·결과 연출 제외/포함)이 아니다.
- 예시(시드 1, 세이브 0, 10게임 가용): 노멀 [mg1801, mg1807, mg1804], 롱 같은 3게임 ×2·BPM [120,120,120,180,180,180]·+0x2C [1,1,1,1,1,0], 리믹스 [mg1801 05s, mg1806 06s, mg1804 00s, mg1802 00s, mg1808 00s, mg1809 09s]. 시드는 원본과 다르므로 이 목록 자체는 원본 기대값이 아니다. 웹 구현의 같은 함수 대조용이다.
- 등급: rate [100,100,100] → rankStar 5, rateFix 100, 플래시 5.0. [79.9, 80.0, 80.1] → 4 / 80.0 / 4.0. mg1801 달성 [166,200,150]/208 → rate [79.807…, 96.153…, 72.115…] → 4 / 82.0 / 4.1. [19.9, 20.0, 19.9] → 0 / 18.0 / 0.9(실패 연출).

웹 구현 기대값(같은 전제):
- `libcxxSort`·`syncShuffle`·`generateModeMgList`·`generateRemix`가 `analysis/rcF_calc.json`의 `examples`·`normal_chain_seed777`과 같은 목록을 낸다.
- 불변식: 롱 표 = [a,b,c,a,b,c], BPM 전환 index 3, +0x2C 마지막만 0, 리믹스 채보 순서 [05s,06s,00s,00s,00s,09s], 리믹스 BPM 120.

스텁·검증 안 한 범위: 원본 sync 시드 값, `MGList::IsAvailable`(해금) 상태, UiRetryMenu, 카메라·UI 연출 시간, 게임별 총점(각 게임 문서).

## 11. 미확정 사항과 추가 분석에 필요한 근거

### 11.1 이번에 확정한 것

| 항목 | 결론 | 근거 |
|---|---|---|
| RmGameWork+0x2C | "뒤에 게임이 더 남음" | 6.4, 10절 스캔 |
| 롱 모드 구성 | 같은 3게임 ×2, 뒤 3게임 BPM 180 | AddArchiveFileSetting 디스어셈블리 |
| 리믹스 구성 | 6게임 슬롯 A,B,D,D,D,C + 채보 05s/06s/00s/09s | FUN_710042b780 + 표 |
| 코스 게임 선택 규칙 | 최근 카운트 오름차순, 첫 게임 4종 제한 | GenerateModeMgList |
| 셰프 등급 식 | f32 평균/20 절삭, rateFix 0.1 단위 | FUN_710042ca10 꼬리 |
| 모드 해금 | 클리어 수 + 리믹스는 10게임 경험 | GetMedleyModeOpenNum |
| 모드워크 전달 | RmGameWork 소멸자가 버퍼에 복사 | FUN_7100428b88 |
| 보상 판정 인자 | `GetResultPlayerScore(k, p)` 코스 k·플레이어 p | SetRewardInfo 디스어셈블리 |
| 대기용 사운드 전역 변수 | PreGame = G14, 설명 단계 = G12 | `ReadGlobalVariable` w1 = 0xE / 0xC |

### 11.2 남은 미확정

| 항목 | 이유 / 필요한 근거 |
|---|---|
| 실제 코스 목록(원본 값) | sync 시드가 장면마다 async 에서 오므로 원본 실행 없이는 특정 목록을 못 맞춘다. 원본 실행(메모리에서 RmGameWork+0x44·+0x6C 읽기) |
| flag 0x39(코스 선택부터 시작)·0x42(중단)의 의미·설정 위치 | `bq::flag` 번호 표(scene/core 담당) |
| UiRetryMenu 결과(그만두기 경로) | main `bq::UiRetryMenu` 판독 |
| RmGameWork +0x28, +0x72C(기본 4) 뜻 | 읽는 곳 미발견 |
| `MGList::IsAvailable` 해금 조건 | main MGList 판독(세이브 해금 플래그) |
| CAM_PATTERN 번호 ↔ fsnb, 무대 연출 시간 | `CameraMan::Impl::Setup` @0x7100005db0, NpcMan·PlayerMan 모션 번호 표 |
| 게임별 리믹스 채보 이름 규칙(mg1802·1804·1806·1809) | 각 게임 문서(rcA~rcE) |
| `visible_judge_dish` 실제 효과 | Impl::Setup 디스어셈블리에서 이 인자 레지스터의 사용처를 못 찾음. 무대 쪽(MapMan) 판독 필요 |
