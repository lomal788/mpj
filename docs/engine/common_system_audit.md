# 원본 공용 시스템 ↔ 웹 실제 사용 감사

확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 [실행]은 없다. 재구현 계산은 "재구현 계산"이라고 따로 적는다.

소스 대조 기준: 2026-10-09 01:58:14 UTC. 웹 등록 게임 `mg1801` 1개. 원본 공용 기능의 웹 정의·실제 소비·우회·차이 정적 대조.

경로 약칭: `G = script/games/mg1801`, `S = script/shell/stage3d`, `M = script/shell/mgstage`, `P = script/shell/charselect/preview3d.ts`. 주소: 모듈명 + 기본 베이스 `0x7100000000` 기준.

판정: 사용 / 일부 사용 / 공용 미사용 / 게임별 중복 / 미구현 / 검색 범위 내 미발견 / [미확정]. P1 현재 게임·결과 정합성, P2 공용 계약·후속 이식, P3 활성 조건·근거 보완.

## 1. 게임 등록·공용 엔진 연결

### 1.1 원본 공용 소유와 NRO 경계

[데이터] `C:/dev/mpj/analysis/functions/*.nro.tsv` 139파일의 `<EXTERNAL>::접두` 포함 모듈 수. 정적 import 범위.

| main 공용 접두 | NRO 수 | 주요 소비 모듈 |
|---|---:|---|
| `bex::RandModule` | 126 | 미니게임·메뉴·보드·모드 |
| `bex::Fiber` | 117 | 미니게임·메뉴·부트·모드 |
| `bex::InputModule` | 87 | 미니게임·메뉴·매칭·모드 |
| `bq::MinigameScene` | 98 | 일반·리듬 미니게임 |
| `bq::SceneBase::OnEntry` | 27 | 비mg#### NRO 전체 |
| `bq::MinigameModeScene` 생성자 | 7 | mgm01~06·mgmet; CallMinigameScene→mgm01~06, CallMinigameModeScene→mgmet |
| `ca::rm::RmMgSceneBase` | 10 | `mg1801`~`mg1810` |
| `ca::coin_athlon` | 18 | `ca01`, `caet`, `mg1105/06/08/09/11/16/17/18/20`, `mg1301`~`mg1305`, `mg1804/09` |
| `ca::kb` | 12 | `kb01`, `kbet`, `mg1401/02/03/04/05/06/07/08/12/14` |
| `sb::PataPataGameScene` | 4 | `pp01`, `pp03`, `pp04`, `ppet` |

### 1.2 게임 호스트·프리 플레이 경계

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 장면 등록·시작·종료 | [판독] main `BeginScene @0x71002df258`, `SetupScene @0x71002df440`, `SyncedSetupScene @0x71002e0270`, `CleanupScene @0x71002e0344`; [코어 §5](01_core.md), [한 판](../shell/minigame_scene.md) | `game.ts::GameDef/GameLogic/GameView`; `shell/mgscene::MgScene` 별도 계약 | `main.ts:309~316` → Assets → GameDef.load/createLogic/createView/load; `:552~572` step→onStep→describeResult. MgScene 생성은 `mgscene_page.ts:80` 시험 | GameDef 실행과 공용 0~18단계 씬의 별도 호스트. 원본 동기 준비·로더 완료·OnCleanupProcessing 조건 일부 생략 | 일부 사용·호스트 분리 | mg1801·후속 게임 | P2 — 공용 씬 연결 |
| 결과 byte·judge | [판독] main `SetMinigameResult @0x71001f0460`, score getter `@0x71001f2a80`: raw byte와 `(judge!=0)` 비교; [프리 플레이 §6.6](../shell/mgm01_freeplay.md) | `MgResultEntry {id,judge,results[4]}` / GameResult.ranks·ResultRow.rank 별도 | `main.ts:383~390`: 표시행 rank0→1, 나머지0, 불참255, judge1. `G/index.ts:98~105`, `G/logic/game.ts:803~820`: 모든 rank0 | mg1801 참가자 전원 byte1; rate·starJudge 미소비. raw2·judge별 결과 계약 손실. [미확정] 원본 mg1801 ring writer | 결과 어댑터 정보 손실 | 프리 플레이 mg1801 기록 | P1 — 표시 순위→승패 변환 |
| 미등록·실패 결과 | [판독] 원본 결과 ring: 한 판 종료 측 ID/judge/byte 기록; [프리 플레이 §8.3](../shell/mgm01_freeplay.md) | `mgm01_page.ts::fakeResult` 시험 함수 | `main.ts:365~366` 미등록 null; `mgm01_page.ts:575~584` rejected/null→fakeResult; `:513~521` Math.random 승자·head+1 | 실제 `cfg.play` 경로에 시험 결과 fallback. `main.start` 내부 catch(:319~327)는 error 반환 후 `playFromList` 빈 rows→참가자0·judge1 | 시험용 결과의 실제 경로 유입 | 미등록 게임·호출 실패·로딩 실패 | P1 — 승패·플레이 횟수 오기록 |
| 팀·참가·리듬·설명 설정 | [판독] main `FUN_71001f1e20`: Normalize·TeamID·IsGamePlay·rank/WinLose 초기화; RhythmWork::SetMode·endless·설명 분기; [프리 플레이 §8.3](../shell/mgm01_freeplay.md) | `shell/mgm01/types.ts:80~92::Mgm01PlayRequest`; `game.ts:26~34::GameSetup` | `main.ts:373`: readSetup + chars/isCom/req.cpu. req.team는 :389 기록 byte에만 반영 | rhythm·teamId·gamePlay·order·endless·callInst·useGyro의 게임 setup 연결 없음. mg1801 mode는 별도 패널 options | 공용 설정 전달 누락 | 프리 플레이 mg1801·후속 팀/체감 게임 | P1 — 설정 화면과 실행 조건 불일치 |
| 최고기록 | [판독] mgm01 `ApplySettingMgSetting_HighScore @0x7100017ba8`, `GetRecordIdx` 인자 @0x7100017d2c; [프리 플레이 §6.5](../shell/mgm01_freeplay.md) | `Mgm01Scene` record provider·catalog.initialRecord | `mgm01_page.ts:602` → catalog.defaultRecord | 현재 기록 대신 InitialRecord 반환; 최고기록 축적·조회 연결 없음 | 공용 기록 provider 미연결 | 기록형 게임 목록 | P2 — 현재 레코드 누락 |
| 결과 무대 | [판독] main `bq::MGResult`; 리듬 `ca::rm` 고유 종료; [결과](../shell/minigame_result.md), [리듬](02_rhythm.md) | `shell/mgresult::createResultStage`; `shell/mgscene` resultHost | `mgresult_page.ts:106`, `mgscene_page.ts:90` 시험 소비. `mgscene/flow.ts:652` setModel no-op, :716 coinShow no-op; winTelop place 미소비 | 모델·코인·텔롭 위치의 호스트 연결 누락. mg1801: 고유 리듬 엔딩 정책 | 부분 연결·리듬 정책 차이 | 일반 결과 무대 시험·후속 게임 | P2 — 구현된 무대 기능의 host 누락 |
| 종료 저장·재시도·수명 | [판독] main `MinigameFlow @0x71002e0500`, stage16 `@0x71002e1c68`, stage18 `@0x71002e1e8c`; [한 판](../shell/minigame_scene.md), [코어 §5](01_core.md) | `mgscene/flow.ts::stage16/stage18`; `mgmcommon/contracts.ts::SceneStack` | stage16(:801~817): save 사건·fade 완료; stage18 cleanup/setup. main(:266~271): view.dispose 후 참조 null; SceneStack: 이름 스택·부모 재생성 | Save 완료·통계·RetryMenu 대기 및 원본 scene/entity shutdown 조건 생략 | 일부 사용·미구현 | 한 판 시험·프리 플레이 복귀 | P2 — 비동기 종료 계약 |
| 모드 장면·상위 router | [판독] main SceneBase ctor `@0x71002c9bd4`, OnEntry `@0x71002c9f68`, MinigameModeScene ctor `@0x710035f69c`, BeginScene `@0x710035fab8`; [공용 UI](../shell/mgm_common.md), [코어](01_core.md) | `mgmcommon/contracts.ts:32::SceneStack`, `MgmetHub.router` | SceneStack 실제 생성 `mgm01_page.ts:627` 1곳. `mgmet_page.ts:210~227` router 미주입; main(:393~489) 페이지 콜백 | 목록↔게임 Call/Return만 공용 스택; 허브·광장·설정은 외부 전환. 공통 초기화·archive 정리·pause·shutdown 계약 분산 | 일부 사용·공용 미사용 | 현재 셸·후속 모드 | P1 — 상위 장면 연결 |
| 모드 호출·활동 번호 | [판독] main CallMinigameModeScene `@0x710036027c`, 이름표 `@0x71015d840c`; mgmet call `@0x7100049f14`; [허브 §3·8](../shell/mgmet_flow.md) | `mgmet/tables.ts:19~25`, hub.ts:153~155 router.call | mgmet_page(:99~111) 문자열 결과→main(:413) 접두 검사→flowMgm01 | 구조화 nextMode·rule 전달 손실. 활동ID 0~5→mode 4/3/1/5/2/6 표 구현; mgm02~06 실행 없음 | 공용 미사용·미포팅 미구현 | 프리 플레이·5활동 모드 | P1 전달·P2 미포팅 모드 |
| 규칙 캐시·COM level | [판독] main MinigameModeWork+0x764~, mgm01 SyncedSetup `@0x7100004e50`, mgmet SetPlayerWorkComLevel `@0x71000500d0`; [허브](../shell/mgmet_flow.md), [규칙](../shell/mgmet_ruleconfig.md) | `mgmet/ruleConfig.ts:306~314::commitFreePlay`, Work.rule·setComLevel? | hub work 생성 mgmet_page:204; 목록 별도 work mgm01_page:169. 허브 setComLevel 미주입; 목록CPU :553 URL/default0 | 허브 CPU·설명 캐시와 실제 목록/공유 PlayerWork 단절. 게임 COM은 main:373의 별도 req.cpu | 공용 미사용 | 허브/목록 규칙·설명; mg1801 ComLevel 비소비 | P1 — 선택 규칙 손실 |
| 항구 복귀 지점 | [판독] main SetEntranceStartPoint `@0x71001f0518`, Get `@0x71001f0520`; mgm01 ExitFlow `@0x710000e2c0`→7; mgmet InitFromMgm01 `@0x710004a648`→state10; [허브](../shell/mgmet_flow.md) | Work.entranceStartPoint·hub.ts:202~209 소비 | mgm01/scene.ts:207~210 d.exit만; main:401 새 허브. writer mgmet_page:205 시험 인자 | 목록 종료 지점7 미생성·새 허브 진입값 재설정 | 공용 미사용 | 프리 플레이→항구 | P1 — 복귀 상태 |
| 컨트롤러 변경·설명 경로 | [판독] main CallMinigameScene `@0x71003601ac`: ID<152→GameWork ID→UseGyro/gyroPadChange→flag4/IsCallInst/mgInst→MGList 이름; [프리 플레이 §3](../shell/mgm01_freeplay.md) | `Mgm01PlayRequest.useGyro/callInst` | mgm01_page:608 일괄 minigame→main:364~390 GAMES 이름 검색 | gyroPadChange·mgInst 분기 실행 없음 | 공용 미사용·미구현 | 설명 요청·후속 체감 게임 | P1 — 장면 디스패치 |
| 모드 선택·보드 규칙 | [판독] menu01 MapMenuImpl `@0x710003df70`·next sequence; [모드 선택](../shell/modeselect.md), [보드 규칙](../shell/partyrule.md) | modeselect/types.ts key·next; shell/partyrule·지역 config | main:423 key=mgm만 허브, 그 외 광장. partyrule_page:210~218→ui_main:149 시험 | next 미소비; bd/rc/mf/pp/kb/ca 진입 없음. 보드 화면·본편 Work 연결 분리 | 일부 사용·미포팅 미구현 | 6모드·보드 시험 | P2 — 모드 진입 |
| 플레이어 설정 공유 | [판독] main ComUiSettingPlayer `@0x7100344a00~710034be24`; [플레이어 설정](../shell/setplayer.md) | `main.ts::flowPlayers` chars/com/names/pads | :477~489 설정 반환→허브 :409~410·목록 :397~398·게임 :373 | 현재 참가자·캐릭터·패드 공유 연결. [미확정] PlayerWork 전체 속성·모드 인원 제한 | 사용·일부 사용 | 현재 상위 흐름 | P2 — 속성 범위 |

2026-10-09 [mg-connect] 갱신(위 표의 판정은 감사 시점 기준으로 두고 상태만 적는다): **장면 등록·시작·종료** — GameDef 실행 경로를 없애고 mg1801 이 공용 틀 0~18단계 위에서 돈다(`script/mgrun.ts`, 어댑터 `games/rhythm/mgGame.ts`). **결과 byte·judge(P1)** — `FUN_71001f271c` 규칙 + judge = `Mgm01SetupMinigamePlayInfo` @0x71001f1c60(GameRule ∉ {0,7})로 raw byte 를 전달(mg1801 = judge 1·[2,2,2,2]). **미등록·실패 결과(P1)** — 실제 실행 경로에서 `fakeResult` 유입 차단, 실패는 null(기록·Round·플레이 횟수 그대로). **팀·참가·리듬·설명 설정(P1)** — teamId·gamePlay·comLevel·rhythm·endless·callInst·useGyro 가 틀 setup·문맥까지 가고 mg1801 은 rhythm 만 소비. §2 **체감 입력**의 게이트 acc 손실도 해소(`MgPadInput`·`MgPadState` acc). 근거·남은 확인은 [../shell/minigame_scene.md](../shell/minigame_scene.md) §12.12.

## 2. 시간·난수·입력·이동·물리

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 시간·프레임·pause | [판독] main GetDeltaTime `@0x7100196670`, 프레임 스텝 `@0x7100987af8`, RmMgSceneBase ctor `@0x7100440fb8`; [코어](01_core.md) | `core/clock.ts` FPS60·FRAME_DT; main audio/wall 시계 | `main.ts:619~630` backlog 제한·고정 step; mg1801 RhythmClock f32(1/60) | mg1801 Fixed60 일치. 일반 Variable60·.05 clamp·substep·pause level 계약 없음. 웹 visibility suspend·backlog 폐기 정책 | 리듬 사용·일반 계약 미구현 | mg1801; 일반 게임 102종 이식 | P2 — 일반 시간 모델 |
| 난수 | [판독] main RandModule ctor `@0x7100189200`, SetSyncRandSeed `@0x7100189438`; [코어 §6.6~6.7](01_core.md) | `core/rng.ts::BexRandModule`, MT19937 async/sync | `G/logic/game.ts:261~263`: setup.seed→async, async.rand→sync; `mgscene_page.ts:71~72` 시험 | 원본 부팅tick·앱 수명 async→웹 매판 seed 재생성. MT·기각표본·multiply-high·n<2 소비0·syncF=1경계 구현; actor 독립stream·RandRange/F/ModF/RangeF 계열 미대응 | 사용·일부 계약 미구현 | mg1801·후속 actor 게임 | P2 — 재현 seed 정책·API 범위 |
| 파이버·갱신 순서 | [판독] main 등록 `@0x710018e68c`, 실행 `@0x710018f400`: sequence·priority 안정 정렬·pause; [코어 §5.4·6.4](01_core.md) | `core/sched.ts::Scheduler`; `mgmcommon/fiber.ts::FiberRunner` | script213 TS 검색: core/sched import·new Scheduler 0. FiberRunner는 mgm01/mgmet/online/partyrule/setplayer 사용. `G/logic/game.ts:294~310` 수동 순서 | Scheduler 생성순·프레임 시작 길이 고정, priority/sequence/pause 없음. mg1801 확인 범위 수동 순서 근거 존재 | 공용 미사용·별도 셸 구현 | 메뉴·mg1801·후속 게임 | P2 — 범용 스케줄러 부재 |
| 기본 패드·actor 입력 | [판독] bex::InputModule·actor::ComActorPad 회전·마스크·.1 threshold·override; [UI 입력](05_ui_input.md), [장면 데이터](06_scene_data.md) | `core/pad.ts::PadInput/Pads`, `view/input.ts` | `main.ts:557~560` pads.read→logic.step; `G/logic/game.ts:298` Pads.read | NPAD now/down/up·스틱 사용; 논리step 직전 샘플. PlayerID/PadID·논리변환·style·repeat 일부미대응 | 일부 사용·미구현 | mg1801·이동 게임 | P2 — actor 입력 계약 |
| 체감 입력 | [판독] main Converter `@0x710003f930`, getter `@0x710003f820/710003f878/710003f8d0`, WaveDetector `@0x7100040cc0`, emitter `@0x71000413d0`; [UI 입력](05_ui_input.md), mg0118/mg0906 등 게임 문서 | PadInput.acc 필드·입력원 | `view/input.ts:58/105` emptyPad→acc0; `mgscene/flow.ts:286~292` now/down·스틱만 전달 | acc/up/repeat 손실; posture/angular velocity/샘플링·중력제거·자세회전·부호반전·파형당1발·Value/Sum emitter 없음. WebHID/DeviceMotion/터치: 설계 | 미구현 | 체감 게임; 현재 mg1801 버튼 입력 | P2 — 이식 입력 파이프라인 |
| 일반 이동 | [판독] actor::ComActor·JumpCalculator·조건/액션·추가속도; [장면 데이터](06_scene_data.md), 이동 게임 문서 | `shell/plaza/player.ts::PlazaMover` | 광장 player 이동 소비; mg1801 고정 레인 | 광장 이동 일부 재현; 걷기2/달리기6·선회·공중가감속40·낙하49 일부재현; 일반 액션·가변중력·추가속도 없음 | 일부 사용·미구현; mg1801 비적용 | 광장·이동 게임 | P2 — 이동 공용 계약 |
| 충돌 질의·침투 보정 | [판독] PhysicsWorld query·Capsule/Sphere/Ray·layer/exclude/initialOverlap; 접지 callback `@0x7100006670`: CastResult+0x54 position/normal validity 검사, initialOverlap(+0x70) 직접 거부 분기 없음; [움직이는 충돌 §3·4.2](11_moving_collision.md) | `S/meshCollider.ts`, `plaza/world.ts`, `plaza/follow.ts::meshRayBlocked` | PlazaMover groundHeight/collide; follow ray. `M/stage.ts:381~383::collision` JSON 반환; createMgStage는 mgstage_page 시험 | 원본 평균 침투 보정→웹 최대3회 순차 push; 이동0 collide 생략. capsule sweep·layer/exclude·initialOverlap 일반 계약 없음 | 일부 사용·미구현 | 광장; APX 게임 이식 | P2 — query·정지 충돌 |
| 동적 충돌·부착 포즈 | [판독] main Attachment `@0x710088790c/7100887d84`, SyncTransform `@0x7100892d50`→dirty→`@0x71006097b4`; [움직이는 충돌 §2~4](11_moving_collision.md) | `M/stage.ts:273::attachToSocket` 시각 부착 | stage3d/MgStage 모델 부착; 동적 body world·pose 동기화 없음 | 시각부착과 pose commit 분리; MeshCollider geometry/grid 생성시고정. mg0106 B/C/D: layer2·motion0 움직이는Static. mg1801 nbmap/APX 없음 | 시각 일부 사용·물리 미구현 | 동적 APX 게임·소품 | P2 — 움직이는 body |
| 리듬 시계·채보·점수 | [판독] main RmGameWork ctor `@0x7100440e9c`, RmMgSceneBase SetupGame `@0x71004415a4`, SyncedSetupGame `@0x7100443340`; [리듬](02_rhythm.md) | `G/logic/{rhythm,chart,game,world}.ts` | game(:260~270): chartRows·RhythmClock·점수·총점·CPU setup. G 내부 소유 | 원본 main 공용 시계·채보·점수/결과 책임이 게임 폴더에 내장; 다른 리듬 게임 구현 0 | 게임별 내장·다중 복제 없음 | mg1801·나머지 리듬9종 이식 | P2 — 공용 계층 위치 |
| actor 입력·CPU overlay | [판독] main ComActorPad ctor `@0x710001e0b4`, Hold `@0x710001e54c`, Trigger `@0x710001e74c`, Stick `@0x710001eac4`; [mg0122 §6.10](../minigame/mg0122.md) | 셸 NPAD→bex 변환·view/input axis round/clamp; 일반 actorPad 없음 | game 원시Pads·셸MgmInput; CPU 이동stick/hold/trigger/release overlay 없음 | NPAD/actor 논리비트·style회전·enabled/override/mask·radial.1 threshold 미대응. 원시deadzone과 actor문턱 별도 | 일부 사용·미구현 | mg0122·mg0101·mg0107·mg0911/12 이식 | P2 — actor 입력계층 |
| CPU 공용 상태·게임 전략 | [판독] PlayerWork type/ComLevel 공용. mg0101 AI `@0x7100004b50`, mg0106 UpdateCom `@0x710001d100`, mg0912 potential::Point::Run `@0x7100021ba0`: 각 NRO 소유 | GameSetup.players isCom/comLevel; G/logic/player.ts:112·playerMan.ts:19 | mg1801 고유 JUST/FAST/SLOW·miss계획, isCom 소비 | 원본 mg1801 ComLevel 비소비. NaviGrid/Route/ComAI 전략 NRO 고유 | 일부 사용·게임별 정책 | mg1801·이동형CPU 이식 | P3 현재정책·P2 overlay |
| JumpCalculator | [판독] main SetupLegacy `@0x71000219d0`, 계수 `@0x7100022110`, update `@0x7100021af8`, reset `@0x7100021ae0`; [mg0912 §6.2](../minigame/mg0912.md) | PlazaMover Idle/Walk/Run/Fall·jumpCalcOffFactor5 | 계산기 off 낙하만 | vy구간 가속·Start frame factor0·hold frame 미대응; ExAction/HoldJump는 게임고유 | 미구현 | mg0106/0107/0912 | P2 — 점프적분 |
| Ray/RayAll | [판독] main CastRay `@0x71006183c0`, All `@0x7100618420`→WorldExtension `@0x7100624fe8`; [움직이는 충돌 §3](11_moving_collision.md) | plaza/follow.ts:190 meshRayBlocked·THREE.Ray | :265 FollowSystem bool가시성; MeshCollider 외입력 false | world·mask/exclude·distance/normal/handle/validity/initialOverlap·All목록 없음 | 일부 사용 | mg0106 Route·mg0912 AI 이식 | P2 — query결과 계약 |
| Shape/Capsule sweep | [판독] main CastShape `@0x7100618490`, All `@0x71006184f0`→`@0x71006252e0`, CreateCapsule `@0x7100602e44`; [움직이는 충돌 §3](11_moving_collision.md) | Collider groundHeight/collide·MgCollisionData.shapes | sweep API 없음 | 시작pose/quat·shape localpose·world·mask/exclude·거리·initialOverlap 미대응; [미확정] capsule축/길이adapter·All정렬/동점 | 미구현 | 접지·Route·AI 게임 | P2 — sweep질의 |
| Kinematic·Dynamic simulation | [판독] main motion `@0x710062ce50`:0Static/1Kinematic/2Dynamic, target `@0x710062e8bc`, Physics→Entity `@0x71006098c4`; [움직이는 충돌 §2.3](11_moving_collision.md), [mg1002 §6.2~3](../minigame/mg1002.md) | motion별 simulation·force·poseapply 없음 | 광장 정적 원기둥보정만 | mg1002 공 중력·힘·후처리 미지원. [미확정] DetectionType1 회전/CCD 효과 | 미구현 | mg1002 등물리게임 | P2 — body운동 |
| 형상 수명·필터·teleport | [판독] main Stage/Unstage·enabled·generationhandle, Teleport `@0x7100893030`, prefilter `@0x710062c8b4`; [움직이는 충돌 §2~3](11_moving_collision.md) | PlazaWorld CollisionMain/First enable/merge | 메시전체 활성화 | 복수shape id/generation/layer/exclude·teleport reset 없음. 원본mask=1<<layer, actor map0x6(layer1·2), Dynamic teleport 선/각속도0 | 일부 사용 | 복수shape·동적장애물 | P2 — 물리수명 |
| Entity·Physics 갱신 경계 | [판독] main Scene/Fiber·Entity/Physics 단계, component배열·의존그룹; [코어](01_core.md), [움직이는 충돌 §2.4](11_moving_collision.md), [mg0101 §3.6](../minigame/mg0101.md) | game sound/result→Object→Player→flow→motion; Stage3D 표현updater; MgScene hooks/UI | G/logic/game.ts:294~310 수동순서·Stage3D.update | 논리Entity/Physics 및 query commit전/후 pose 계약 없음. [미확정] 전체MgScene 순서동등성·게임별dirty/query선후 | 일부 사용·일반 계약 미구현 | 물리·컴포넌트게임 | P2 — 처리순서 |
| 리듬 점수·별·코스 | [판독] main 가산 `@0x710042a6b8`, 달성률 `@0x7100436558`, 별 `@0x7100436590`, 코스결과 `@0x710042ca10`; [리듬 §8](02_rhythm.md) | G/logic/world.ts:96 score0..999/teamScore·game.ts:69 starJudge | :766 recordResult→:803 finish | 기본합산·별문턱 구현. comScoreIgnore·ExtA×ExtB·grade·복수코스평균·공용Work 기록 미완료; mg1801기본 Ext없음/COM포함 | 일부 사용·게임내부 책임 | mg1801·리듬9종 이식 | P2 — 리듬공용범위 |

NRO 고유 계산: mg0106 회전판 carry(`Player::UpdatePlayer @0x710001c8c0`, y≤0)·Boo 순차push/1.4; mg0102 수동 구면위치·접촉·득점. 일반 공용 carry의 이전/현재body transform 적용: [미확정].
난수 검증 자료: [코어 §10](01_core.md)의 기존 재구현 계산(5시드×1,000 MT 출력·분포 벡터). 신규 실행·계산 없음.

## 3. 그래픽·카메라·후처리

### 3.1 렌더·자산·재질

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 레이어·렌더 패스 | [판독] main `FUN_71000b5bd0`: shadow→reflection/underwater/impostor→opaque/translucent→post/GUI; [분할 §5](10_split_screen.md) | `view/renderer.ts::Renderer`, `S/stage.ts::Stage3D.render` | Mg1801View.render·셸 Stage3D | 단일 scene/camera·post hook; 레이어별 mask/enabled/clear/RT 관리 계약 없음 | 일부 사용·미구현 | 전체 3D·분할 게임 | P2 — 패스 계약 |
| 모델·텍스처 변환 | [판독·데이터] main `ComModel::Create @0x71006ab2b0`, FRES/BNTX; [그래픽 §3·7](03_graphics.md) | tools/analysis/graphics_bfres2gltf/GltfExport.cs·graphics_bntx.py→glb/PNG/HDR; Assets.gltf·Stage3D.loadModel | `G/view/stage.ts`, plaza/world, Stage3D→createGltfLoader | shader binary→glTF PBR·extras.fres 재구성; container/fluid 일부 runtime 소비 부재 | 사용·일부 사용 | 변환 모델 전체 | P2 — 변환·runtime 차이 |
| 압축·텍스처 로더 | [데이터] 2D/array/cube/3D·BC6H HDR; [그래픽 §5](03_graphics.md) | `S/assetLoader.ts::createGltfLoader/loadTexture` | 게임 character/material/effects import·셸 | array/cube/3D→층·면·띠; KTX2·meshopt 웹 형식; texLod=상위 mip 제거 | 사용·형식 대체 | 전체 | P2 — 텍스처 유형 |
| 모델 인스턴스·소켓 | [판독] main `GetBoneSocket @0x71006ac0e0`, `CalculateTransform @0x71006adaac`; [캐릭터 §3](09_character.md) | Stage3D·MgStage loadModel/socket/clip | 광장·mgstage 시험. `G/view/stage.ts::Stage` 별도 clone·clip·socket | 모델 인스턴스·클립 처리 중복; 무대/의자/수프 선택은 게임 정책 | 공용 미사용·게임별 중복 | mg1801·후속 게임 | P2 — 동일 기반 처리 |
| 기본 재질·GI/AO·IBL | [판독·데이터] resident forward_plus, sampler·parameter·옵션; [그래픽 §4.4](03_graphics.md), [광장 §6.13](../shell/plaza_3d.md) | `S/material.ts::MaterialSetup` | Stage3D 사용; `G/view/material.ts::MaterialSetup`→게임 Stage 별도 | GI/lightMap·IBL/local cube 중복. 게임 공용 sdw·정점색·SRT·graph·굴절·SSS·blend 경로 미사용 | 일부 사용·중복·공용 미사용 | 활성 재질 | P1 수치 대조·P2 통합 |
| graph·SSS·굴절·blend·정점색 | [판독·데이터] forward_plus graph permutation·LUT·ior/refraction/rim; [그래픽 §4.4](03_graphics.md), [선택 §12.11](../shell/charselect.md) | `S/graph.ts::applyGraph`; material.ts patchSss/patchRefraction/patchVertexColor·blend 분기 | 공용 재질 manifest→Stage3D; 셸 캐릭터 Preview3D. 게임 character/water 직접 shader | 선택적 GLSL 적용·Three BRDF/transmission 근사; SSS normal 일부 생략·굴절 mip Three 선택. 범용 BNSH evaluator 없음 | 일부 사용·게임별 중복 | graph/해당 옵션 활성 재질 | P1 표현 대조·P2 evaluator |
| FMAB·TexSRT | [판독·데이터] FMAB·FTSB/FCMB/FCLB; [그래픽 §4.7](03_graphics.md), [캐릭터 §4.2](09_character.md) | `S/clip.ts::FmabPlayer`, params.ts initParams/patchSrt0 | Stage3D→plaza/MgStage; 게임 Water·applyEyes 별도 | 베이크 정수 샘플·일부 parameter 소비. [미확정] 전체 TexSRT mode·channel 동등성 | 일부 사용·중복 | 물·환경·표정 | P1 활성 채널·P2 통합 |
| 물·수중·평면 반사 | [판독] main DisableUnderWater `@0x710006ec9c`, DisablePlanarReflection `@0x710006ecac`; [분할 §5](10_split_screen.md) | 공용 water/refraction patch; `G/view/water.ts::Water` | 게임 setup/update 직접 구현 | mg1801 불투명·metallic0; opacity/굴절·underwater/planar read·flow/wave01·utility0.x 미소비 | 일부 사용·미구현 | mg1801 수면·반사 재질 | P1 수면·P2 패스 |
| 외곽선·decal | [판독] main DecalShadowEnable `@0x710006ebd4`, geo_decal LOD0; [LOD §5.5](lod.md); [데이터] toon option | `G/view/vegetable.ts` outline 모델 | `_outline00` 실루엣 표시 | 화면공간 toon edge·decal shadow runtime 없음; [미확정] 전체 toon pass 식 | 일부 사용·미구현 | 채소·toon/decal 재질 | P2 runtime·P3 식 |
| VAT·fluid·부가 렌더 | [데이터] VAT2/3·fluid·d_buffer·lens flare/billboard; [그래픽 §4.4](03_graphics.md), [변환기 §3·12](13_asset_converter.md) | VAT f16.bin 보존 | script VAT playback·fluid runtime 소비 미발견 | [미확정] fluid/d_buffer/lens flare 장면 caller·활성 조건 | 검색 범위 내 미발견 | 활성 장면 미확정 | P3 — runtime·caller |

### 3.2 카메라·조명·포스트

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 카메라·투영·FSNB | [판독] main Camera `@0x71008458f8~`, ComCamera `@0x7100848ea0~`, AnimationPassCamera `@0x71006c0fe0/71006c1120`; [카메라 §3·6](07_camera_lighting.md) | `M/camera.ts::MgCamera`, plaza FsnbCamera, G/view/camera.ts::applyCamera | MgStage.playCamera→Stage anim driver; 광장 balloon/overview. mg1801 loop/result/capture 정적3클립 | 자세식 복제·floor(frame)·near≥.3·Perspective 전용. orthographic·aspect flag·world 합성·대표 노드/일반 커브 evaluator 부족 | 일부 사용·중복 | 광장 컷·동적 카메라 게임 | P2 — 카메라 계약 |
| 흔들림 | [판독] main Start `@0x71004e0e50`, Update `@0x71004e124c`, Stop `@0x71004e1184`; [카메라 §7.6](07_camera_lighting.md) | Renderer/Stage3D/game camera | shake driver 없음 | base+basis·진폭·난수 target 갱신 없음. mg1801 원본 미사용 | 미구현·mg1801 비적용 | 실제 shake caller | P2·P3 — caller |
| 방향광·IBL·그림자 | [판독] ComDirectionalLight/Environment→Layer UBO; [카메라 §3.3·6.6·7.3~4](07_camera_lighting.md) | Stage3D env; 공용·게임 MaterialSetup HDR/PMREM | 게임 방향·linear색.8·π intensity 상수; PCF2048. 공용 PCF4096 | Three BRDF/prefilter 근사; 단일 shadow map 대 원본 cascade4·정적 EVSM·bias/fade | 일부 사용·중복 | 조명·그림자 재질 | P1 표현·P2 shadow 계약 |
| 점광·스포트 | [데이터] 광장 point 배치; [판독] main ComSpotLight setter `@0x7100079340`; [광장 §6.7](../shell/plaza_3d.md) | Stage3D.setupExtras→PointLight(color,π,radius,2) | 광장 PointLight | coreRadius 미소비·Three 감쇠 근사; spot runtime 없음. [미확정] spot 실제 caller | 점광 일부 사용·spot 미구현 | 광장·spot caller 미확정 | P2 point·P3 spot |
| 안개·하늘·환경 | [판독·데이터] ComEnvironment·skybox·fog/utility→Layer; [카메라 §7.4](07_camera_lighting.md) | Stage3D Fog·sky shader·env FmabPlayer | 셸 환경 사용; mg1801 mip fog 생략 | cube mip fog→선형 Fog; height fog 없음. mg1801 height/lightgrid/cloud/decal/water droplet off, utility0 reader 없음 | 일부 사용·미구현 | 활성 환경 장면 | P2·P3 — 활성 조건 |
| 톤맵·노출·LUT | [판독] ComPosteffect→UBO→main `@0x71000acf00`; [카메라 §7.5·9.3](07_camera_lighting.md) | `S/post.ts::PostChain` 종류0~4·LUT/vignette | `G/view/post.ts::PostChain`→Neutral/OutputPass→Renderer.setPost | 원본 tonemap1 유리식→Neutral4; `c·exposure+offset`→multiplier. 현재1/0/1로 일부 차이 잠복 | 공용 미사용·중복 | mg1801 플레이·결과 | P1 — 톤맵 식 |
| Bloom·FXAA | [판독] HDR FXAA→bloom 합성·톤맵, spread⁵·RGB 길이 clip; [카메라 §9.3](07_camera_lighting.md) | 공용 판독 bloom식·마지막 FXAA | 게임 DOF→UnrealBloom→Output→LDR FXAA | 게임 strength/radius·mip·채널별 clip 근사. 공용도 FXAA 순서 차이 | 일부 사용·중복 | post 장면 | P1 — 합성 순서·clip |
| DOF | [판독] dof2 중심±region/2·transition; [카메라 §7.5·9.3](07_camera_lighting.md) | 공용 PostParams: DOF 없음; 게임 custom pass | `G/view/post.ts:210`: focalEnd=distance+region, radius6px·32 disc sample | 원본 far29.5→36.5 / 결과35→50. 웹42→49 / 결과50→65 | 게임 근사·공용 미구현 | mg1801 | P1 — 초점 경계 |
| capture·RT·복구 | [판독] main capture `@0x71000bc310`, Rm exit `@0x7100445ae8`, helper `@0x710042d1a0`, ResetAll `@0x71001db630`; [카메라 §3.4](07_camera_lighting.md), [분할 §3·5](10_split_screen.md) | capture camera 라벨·Preview3D 카드RT·postRT | 게임 dispose post/shadow 일부 복구 | 결과480×270 저장·레이어 capture request·전체 상태 복구 부족. mg1801 capture 기본0 | 일부 사용·미구현 | 사진·랭킹·분할 | P2 — capture 계약 |

## 4. LOD·캐릭터·애니메이션·이펙트·분할

### 4.1 LOD·스키닝

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| Mesh LOD | [판독] main reader `@0x7100093a00/7100093d10`, selector `@0x7100067150`; [LOD §4~6](lod.md) | GltfExport 기본LOD0·단일 Mesh·extras 단계수 | runtime selector 없음; texLod는 텍스처 mip | Q=최대 Mesh수·type0 모델구/type1 Shape구·ScreenRatio2·shape clamp·geo_decal LOD0 미지원 | 미구현 | 복수 Mesh 모델 | P2 — 모델 단계 선택 |
| 경량 캐릭터 | [판독] main CharacterDataPath `@0x71002ba2bc`, w2.bit0·ComMatter 설정+6; [캐릭터 §4.2](09_character.md) | game/preview 기본 chara glb | CharacterActor·Preview3D | default/light 선택 차이; [미확정] 설정+6 writer·거리 교체 | 일부 사용·미확정 | 22캐릭터·해당 장면 | P3 — 선택 writer |
| 임포스터 | [판독·데이터] 공용 pass/draw·nibble·atlas 방향/프레임·alpha.5 discard; container551개 enable0; [LOD §7.4](lod.md) | runtime atlas selector 없음 | 임포스터 draw 미구현 | [미확정] runtime enable·atlas 생산·texture 연결 | 미구현·미확정 | 활성 장면 미확정 | P3 — 활성·atlas |
| 애니메이션 FSO | [판독] main `@0x710080cf00/710080d120`, CalculateAndApply `@0x710081c6e0`, 비용1/예산32; [LOD §7.2](lod.md) | Stage3D clip·게임 pose 매 갱신 | FSO selector 없음 | 평가 생략 K와 slot/blend/time 진행 분리. [미확정] priority·개별 enable·시간 공급자 | 미구현·미확정 | 애니 다수 장면 | P3 — 평가 예산 |
| 스키닝·scale mode | [판독] main pose/world `@0x7100782db8`, palette `@0x7100782e00`: smooth=W·IBM, rigid=W, GPU48B; [스키닝 §2~5](skinning.md) | GltfExport joints/IBM→Three Skeleton | CharacterActor·Preview3D clone/pose | all-bone IBM·skinCount1 pretransform·weight 정규화; Three64B texture. [미확정] rigid·비정규weight·SSC/scale mode·normal 동등성 | 일부 사용·미확정 | 스킨 모델 | P1 검산 — 변환·palette |
| Morph | [판독] main CPU `@0x7100778020`: 절대 key 가중합·abs(weight)≥.001→VS skin; [스키닝 §6](skinning.md) | delta target·weights·_shape clip | CharacterActor·Preview3D; co_chr_slct00a face/hair | 절대 key→delta 표현. [미확정] 기본 key 계수·무참여 버퍼 | 일부 사용·미확정 | shape 모션 | P1 검산 — key 계수 |

### 4.2 캐릭터·모션

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 캐릭터 자산·인스턴스 | [판독·데이터] CharacterDataModule/ComMatter; [캐릭터 자산 §9](chara_assets.md) | assets/chara·CharacterTemplate·Preview3D | `assets/mg1801/chara/index.json`→../../chara/pcNN; game CharacterActor 별도 | 자산 공용 사용·runtime actor 게임 폴더 소유 | 사용·runtime 분리 | 22캐릭터·NPC | P2 — runtime 공용화 |
| 모션 슬롯·전이·시간 | [판독] main ComActorMotion `@0x710002dd98`, ActorAnimationSlot `@0x7100023728`, controller `@0x7100105ea0`, blend `@0x7100813940`; [캐릭터 §6.3~6](09_character.md) | game pose/MPAT·Preview3D 초 crossfade·Stage3D Clip | 각 소비자 별도 | type/mode·이전노드 진행·본/shape duration clamp·MPAT α/β start·speed·reverse/queue 분산; mg1801 확인 mode0 | 일부 사용·게임별 중복 | 전체 모션 | P1 모션 차이·P2 통합 |
| body/eye·blink·가시성 | [판독·데이터] 캐릭터 graph·bundle·FVBB; [캐릭터 §4.2](09_character.md), [선택 §12.8·11](../shell/charselect.md) | Preview3D·MgStage VisPlayer; game bodyMaterial/blink/visibility | 선택/plaza/mgresult Preview3D 공유; 게임 별도 | pc13 UV의 원본.8v+.2 차이; pc56 눈·pc12/54/61 ftsb-only blink 부족; FVBB priority/default 분산 | 공용 미사용·중복 | mg1801 해당 캐릭터 | P1 표정·UV·P2 통합 |
| 시선·본 부착 | [판독] main ComHeading `@0x71001bf2a8~`, AddHeading `@0x71002b4950`, mg1801 UpdateHeadControl `@0x710000d130`; [캐릭터 §6.8·9.4](09_character.md) | game applyHead/applyEyes·rightHand.add(knife); Stage3D/MgStage socket/hook | game·셸 별도 | chin/neck_roll/뒤쪽 분기 생략; [미확정] attachment SRT mode와 Three parent SRT 동등성. 캐릭터별 시선 예외 | 일부 사용·중복 | 시선·소품 | P1 시선·P2 부착 |
| 보조 물리 애니 | [판독·데이터] main ComPhysicalAnimation `@0x71004f33a0~`, Enabled `@0x71004f5000`; 11명·81rigid/44constraint·enabled/teleport1; [캐릭터 §4.7](09_character.md) | APX 보조 본 runtime 없음 | game/Preview3D/Stage3D | 본↔rigid·constraint·teleport 미지원; mg1801 pc56 disable 원본 예외 | 미구현 | APX 캐릭터 | P2 runtime·P3 solver |
| 젖음 | [판독] main ComWetExpression Start `@0x710003cda8`, End `@0x710003ce7c`; mg0118 OnSwimming; [mg0118 §6.3](../minigame/mg0118.md) | array layer0 중심 변환 | game/Preview3D wet 상태·mask 소비 없음 | Start/End·wet_mask 미지원; [미확정] layer1·최종 합성 | 미구현·미확정 | mg0118 등 wet caller | P2 runtime·P3 합성 |

### 4.3 이펙트·분할

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| Effect registry·수명·success | [판독] main Effect `@0x710011be04~`, resolver `@0x710072c680`, ShowCommonEffect `@0x7100436fc0`; [이펙트 §3](08_effects.md) | `G/view/effects.ts::EffectSystem` | `G/view/index.ts:100` 유일 생성; load→spawn/start/stop·공용success 자산/별칭 | 게임7set·basename resolve·missing warn/-1; resource/path 등록순·충돌 priority 부족; [미확정] Stop(bool) | 일부 사용·공용runtime 부재 | 리듬·VFX 게임 | P1 현재FX·P2 registry |
| 입자 운동·난수·field | [판독] main vfx2 CPU/GPU·형상·field·flowmap; [이펙트 §6.2~4](08_effects.md) | game LCG/volume/initParticle/positionAt·Batch ShaderMaterial | 김·물보라·반짝임 | 원본 P+=dt·m·V 후 drag/gravity→웹 drag-first 닫힌식; Q 표본 분포 차이; field·flowmap·soft depth·layer/sort/depthMask·PlayRate·상속 일부 생략 | 일부 사용·근사 | mg1801 입자 | P1 — 운동·표본·렌더 |
| 모션 particle trigger | [판독] main ComFxTrigger callback `@0x710010d73c`→Effect; [이펙트 §8](08_effects.md) | ftrg particle callback 연결 없음 | mg1801 원본 particle trigger 미사용; SE/VO 별도 | 범용 모션 이벤트→particle 생성 미연결 | 미구현·mg1801 비적용 | 실제 particle trigger 게임 | P2 — 이벤트 연결 |
| 화면 분할·보정·복구 | [판독] main SplitTo `@0x7100311674`, Apply `@0x7100311030`, tick `@0x7100312900`; mg0102/0122 2×2·mg0508 2×1; [분할 §1~7](10_split_screen.md) | Renderer/Stage3D 단일camera·post 전체RT | scissor는 ScenePreparer 준비 draw만 사용 | rect/focus/초 전환·draw FOV/aspect·layer mask/clear/RT·post sampling·capture·ResetAll 없음; [미확정] 원본 clear 영역·capture 시점 | 미구현 | 분할·사진 게임 | P2 계약·P3 GPU 조건 |

## 5. 서비스·영구 상태

### 5.1 UI·메시지·설정·오디오

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 창·레이아웃·메시지 로드 | [판독] main 창 `@0x7100364a20~71003667ff`, layout `@0x7100364940~71003649cc`, 제약 `@0x7100365adc`, InitializeMessage `@0x7100360970`; [공용 UI](../shell/mgm_common.md) | MgmWindow·MgmView·MenuGrid·화면 msg spec | mgm01·mgmet·partyrule·online·시험 페이지 | 셸 공용 사용; 화면 데이터 주입과 원본 archive 범주/해제 계약 별도 | 사용·일부 사용 | 셸 전체 | P2 — UI 수명 |
| 레이아웃 재생기·글꼴 | [판독] main 공용 UI·bezel layout; [UI](05_ui_input.md), [폰트](font_assets.md) | charselect/scene2d·render2d LayoutInst/Render2D; view/lyt LayoutInstance/LytRenderer | MgmView→전자; mg1801·mgscene HUD→후자. fontSheet singleton 공유 | 레이아웃·텍스트·애니 처리 별도; 글꼴 시트 공유 | 게임별 중복·자산 사용 | 게임·셸·HUD | P2 — 재생기 통합 |
| 메시지 진행 | [판독] main Start `@0x710031e660`, 입력 `@0x7100318030`; [메시지](../shell/message_window.md) | mgmcommon/messageWindow/index·state | mgmet 허브/설명·mgm01·공용 UI 시험 | 일반 진행/넘김 연결; Talking·Model·속도·보이스 부분 연결 | 사용·일부 사용 | 메시지 화면 | P1 — 부가 계약 |
| 세로 선택·가로 대화상자 | [판독] main 세로 입력 `@0x71003197d0`, 결정 `@0x7100319e78`, 2~4개; DialogBox 생성 `@0x71002076b0`, 입력 `@0x7100208b80/7100209234`, 크기 `@0x7100208240`, 0~3개; [대화상자](../shell/dialog_box.md) | MessageWindow 직접 선택 API·mgmcommon/dialogBox; MessageFlow legacy setChoices | mgmet/hub.ts:348~376 직접2선택; mgmet·online DialogBox. messageFlow.prepare:43~49→messageWindow/index:268~270 경고 stub | 직접 선택 구현; legacy 준비 경로의 setChoices만 미구현 | 사용·legacy 미연결 | mgmet·legacy MessageFlow | P1 legacy·P2 선택 계약 |
| Talking·Model·NPC 화자 | [판독] main 말꼬리 `@0x71003161d0/7100318ff4`, NPC머리 투영·경계·24꼬리 페인; [광장 가이드](../shell/plaza_guide.md) | MessageWindow type; current spec talk 자산 없음 | index.ts:116 Model x_model 숨김 | 화자 Entity·카메라·높이·꼬리 위치·모델 표시 미연결 | 일부 사용 | 광장 NPC 대화 | P1 — 화자 표시 |
| 메시지 보이스 선택·출력 | [판독] main `@0x710031fe30`: ATR VoiceKey 우선·빈 값 Emotion Normal/Choices; guide VO_MV_QUESTION/ETC_04 | MsgAttr(types.ts:8~16) VoiceKey 없음; resolvePage(index:80~87) emo.normal | state.ts:367 첫 페이지 새 창 voice 사건; 주요 페이지 출력 어댑터 누락 | 명시 VoiceKey·선택형 key·출력 연결 손실 | 일부 사용·공용 미사용 | 메시지 전체 | P1 — voice 생산/출력 |
| 삽입·현지화 태그 | [판독] main GuiLayoutText `@0x7100210180`; [메시지](../shell/message_window.md), [폰트](font_assets.md) | parseMessage | 셸 삽입·색·대기·한글 조사 일부 | Font/Size·복수형·대소문자·ni/san 태그 없음 | 일부 사용 | 셸 텍스트 | P2 — 태그 범위 |
| 메뉴 입력·반복 | [판독] main 조작자 `@0x7100217640`, Trigger `@0x71002177d0`, Repeat `@0x7100217840`, Work선택 `@0x71002a01b0`; [공용 UI §6.10](../shell/mgm_common.md) | MgmInput·RepeatGen | mgm01/mgmet/online/partyrule/setplayer·charselect RepeatGen | 사람/세션그룹·최소PlayerID 구현. 후보 없음: 원본 abort→웹−1/입력0. repeat24/6프레임 근사 | 사용·일부 사용 | 셸 입력 | P2 — 예외·반복 정책 |
| 메시지 속도·온라인 상태 | [판독] SystemData+0x74·가이드 setter `@0x710005de90~710005deb0`; [가이드](../shell/plaza_guide.md), [메시지](../shell/message_window.md) | MessageWindow index.ts:292 setSpeed·:296 setOnline | script 호출0; 가이드 샘플/재타이핑 API 없음 | 저장 설정→속도·세션 상태→온라인 입력 미연결 | 공용 미사용·샘플 미구현 | 메시지·온라인·가이드 | P1 속도·P2 online |
| 런타임 언어 | [데이터] 15언어×71MSBT·언어별 폰트/layout/voice; [UI](05_ui_input.md), [폰트](font_assets.md) | 변환 spec koKR·G/view/ui.ts:3 koKR 고정 | 현재 UI·게임 한국어 자산 | 언어 선택/저장 manager 없음; [미확정] 원본 OS 언어 선택 내부 | 미구현 | 전체 | P2 — locale 선택 |
| SE·3D 음원·handle | [판독] main Play `@0x71000bddd8`, Play3D `@0x71000be3a4`; [소리](04_sound.md) | view/audio.ts AudioOut·SoundMap·화면 SE 어댑터 | mg1801·셸 라벨/일부sequence 출력 | 3D 음원·SoundHandle·그룹 수명 통합 부족 | 일부 사용 | 게임·셸 | P2 — 공용 음원 계약 |
| 화면 BGM·영역 전환 | [판독] main 영역 `@0x71000c7d0c`; [소리 §12.14](04_sound.md) | view/bgm.ts::appBgm singleton·공유 context·BgmChannel; screenBgm 규칙·stream plan | 화면 enter/exit·mgm01/mgmet MgmSound hooks 연결 | 화면BGM 사용. JMP 전환 API 없음; mgmet 입장 REG_MAIN 반복 근사 | 사용·영역 일부 사용 | 셸·mgmet | P2 — JMP 영역 |
| ducking·group·메시지 진동 | [판독] main 그룹 `@0x71000becb0`, Gread `@0x71000bf564`, handle `@0x71000c5e94`; [소리](04_sound.md), [공용 UI](../shell/mgm_common.md) | MgmSound optional group/ducking/vib hooks | 주요 어댑터 play·BGM 중심; system/message vib 미주입. setplayer_page:222 일반60ms | 메시지 ducking·그룹정지·handle수명·라벨별진동 미연결 | 공용 미사용·setplayer 일부 사용 | 메시지·셸 전환 | P1 — hook 누락 |
| 선택 보이스 | [판독] 원본 선택·확정 보이스; [캐릭터 선택](../shell/charselect.md) | charselect_page.ts 슬롯별 source·token·cancel | :82~104·145 실제 출력 | 선택 보이스 수명 연결 | 사용 | charselect | P2 — 현재 사용 |
| 게임 진동 | [판독] main FTRG `@0x710010d224`→`@0x71005f0cec`, owner진동ID; [UI 입력](05_ui_input.md) | G/view/ui.ts:617~637 bnvib강도·view/input Gamepad | 50ms dual-rumble | 강도 사용; 원본 파형·주파수·지속패턴 차이 | 일부 사용 | mg1801 | P2 — 진동 패턴 |

### 5.2 세이브·보고·업적·보상·영상


| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 모드 Save·첫 안내 | [판독] main SaveFirstHowtoPlayViewMgm01 `@0x710022ee20`: bit3+SaveRequest; [허브 §8](../shell/mgmet_flow.md), [공용 §9](../shell/mgm_common.md) | `mgmcommon/contracts.ts::MemorySave`, modeFlags·게임 항목 JSON | mgm01_page:154~168 localStorage 복원/onSave 연결. mgmet_page:201~204 새 MemorySave·시험 firstHowto/opSkip | 같은 인터페이스의 다른 저장 인스턴스. 허브 onSave 없음·첫 안내/스킵/누적 횟수 공유 단절 | 일부 사용·공용 미사용 | 허브↔프리 플레이 | P1 — 영구 상태 연결 |
| 저장 완료·오류 | [판독] menu00 SaveRequestFiber `@0x71000923c0`: SaveRequest→IsProcessing=false; [가이드](../shell/plaza_guide.md) | MemorySave.requestSave contracts.ts:207~209 동기callback | 목록localStorage·허브메모리·MgScene save사건 | 진행·완료·오류 상태 및 종료 handshake 없음 | 미구현 | 설정 변경·모드 종료 | P1 — 저장 수명 |
| 인간별 플레이 기록·NEW·즐겨찾기 | [판독] main `FUN_71002db9f0`: 참가 인간별 횟수 증가; [한 판](../shell/minigame_scene.md), [프리 플레이](../shell/mgm01_freeplay.md) | MgmSave mutator·Work flags | mgm01_page:520 시험head 최대999+1; main 실제완료 Save hook 없음. 변경/requestSave 별도 | 실제 mg1801 인간별 갱신 미연결; NEW/즐겨찾기 영속화 시점 분리 | 일부 사용·공용 미사용 | mg1801·프리 플레이 | P1 — 실제 기록commit |
| 실행·시스템 설정 | [판독] 원본 Work·SystemData·사용자Save; [가이드](../shell/plaza_guide.md) | main.ts:84~108 localStorage game/com/muted/options; plaza balloon menuData0 | 실행 패널·기구skip 값 저장 | 원본 프로필·시스템 설정 전체 계약 부재 | 일부 사용 | 게임·광장 | P2 — 설정 범위 |
| 플레이 보고·설정·모드 | [판독] main ReportSystem `@0x71002272d4`, AddAwakeCount `@0x710022b3c0`, ChangeSetting `@0x710022bb14`; boot GameFlow `@0x7100004520`, 광장 guide·mgmet callers | 보고 서비스 없음 | script/server 전수검색; `mgresult_page.ts:157~173`, `mgscene_page.ts:101~125::reported`는 완료 중복 방지 | 시스템·설정·모드 진입 이벤트 수집/전송 없음 | 미구현 | 부트·광장·항구 | P2 — 보고 서비스 |
| 광장·룸 보고 | [데이터] main ReportPlaza `@0x7100227d24`, ReportCard `@0x71002281f8`, FriendRoom4Start `@0x710022bb48`, FriendRoom8Start `@0x710022bbe4` | Socket.IO 광장·룸 서비스 | 실제 room/plaza 경로에 보고 연결 없음 | 광장 이용·룸 시작 지표 누락 | 미구현 | 현재 광장·프렌드 룸 | P2 — 지표 연결 |
| 업적·잠금·해금 목록 | [판독] main AchievementModule UnLock `@0x71001cdf14`, IsUnLock `@0x71001ce348`, SetUnlockList `@0x71001ce4a4/71001ce838`, GetUnlockList `@0x71001ceb78`, SetUp `@0x71001cef3c`; mgmet ID0x45. [데이터] achievement.json 170항목 | MemorySave: modeFlags·게임 항목; charselect 외부 unlocked | charselect screen:94~95/state:156~157 잠금표시; mgm01_page:170 전체 unlock:true | 업적 조건·해금·저장목록 서비스 없음 | 잠금 일부 사용·업적 미구현 | 선택·프리 플레이·광장 프로필 | P2 — 170업적 상태 |
| 카드 업적값 | [데이터] 해금 목록과 CardData 별도 계약; [온라인](../shell/online.md) | `online/types.ts:34/44::achievement`, 기본−1 | `online/wire.ts:189~214` i16 직렬화/복원→룸 카드 | 단일 표시값 전송; 업적170목록·조건·Save 미연결 | 일부 사용 | 온라인 룸·카드 | P2 — 상태 연결 |
| 보상 계산·정보 수명 | [판독] main RewardModule SetUp `@0x710022f5f8`, ResetParam `@0x710022f910`, CheckInformation `@0x710022f964`, StartInformation `@0x710022fcd4`, EndInformation `@0x710023032c`; mgm01 ExitFlow `@0x710000e2c0` 완료 대기. [데이터] RewardTable50·RewardUnlock11 | 보상 service 없음 | mgm01/scene.ts:207~210 BGM stop→exit; fakeResult(:513~521) 횟수만 증가 | 종료 보상 시작·완료·지급 처리 누락 | 미구현 | 프리 플레이 종료·항구 복귀 | P1 종료·P2 보상 |
| 보상 알림 | [판독] main 알림 `@0x7100252860/710025366c/71002537b0`; [온라인 §9.3](../shell/online.md). [데이터] noticeList19 | OnlineView.showNotice·sys_notice_gotReward 그림 | online/view.ts:184~217 표시 분기; 해당 이벤트 생산자 없음 | 보상 판정/지급→알림 발생 미연결 | 공용 미사용 | 온라인 알림 | P2 — 생산자 연결 |
| 영상 | [데이터] main MovieModule::CreateMovie `@0x710078ccc4`, Start `@0x710078e2d8`, PreLoadBuffer/IsPreLoadCompleted `@0x710078e318/710078e330`, IsPlaybackCompleted `@0x710078e3b4`; op/ppet import. 원본 MP4 5개 | 영상 service·웹 MP4 없음 | script/server/assets 검색; static.ts의 m4a→audio/mp4는 음원 MIME | 버퍼·완료·pause/loop/RT API 미구현 | 미포팅 미구현 | op1·ppet 안내4 | P3 — 미포팅 영상 장면 |
| 스크립트·GC | [판독] main ScriptModule GC setter/getter `@0x7100540cb0/7100540cb8`; mg0911 Scene `@0x7100068110`, CleanupGameImpl `@0x71000686a0`. [데이터] Lua 심볼·script8MiB | TypeScript/브라우저 JS; Lua 로더·ScriptModule 없음 | script/server 자산·호출 검색 | 원본 명시 GC 제어→브라우저 GC. [미확정] Lua 자산·실행 진입·바인딩·설정 인자 | 미포팅 미구현·실행 책임 미확정 | mg0911 | P3 — 원본 script 역할 |

공용 데이터: `C:/dev/mpj/extracted/bea/bq.nx.bea/common/data/{achievement,reward,rewardList,noticeList}.json`. 원본 영상: `extracted/romfs/movie/flow/op/movie`, `movie/extra/ppet/movie`.

[데이터] 보고·업적·보상 직접 외부 참조: `mg####` 112개에서 0. 모드/셸 경유 책임. 보고 소비 모듈 `boot/menu00/menu01/bd01/kb01/mf01/mgm02~06/mgmet/pp01/03/04/rc_stage01`; 업적 `bd01/ca01/kb01/menu00/mf01/mgm02/04/06/mgmet/pp01/rc_stage01`; 보상 `bd01/ca01/ed/kb01/matching00/menu00/01/mf01/mgm01~06/mgmet/pp01/03/04/rc_stage01`.
[해소 2026-10-09, save-runtime] §5.1 메시지 속도(P1)·§5.2 모드 Save·첫 안내(P1)·저장 완료·오류 수명(P1)·인간별 플레이 기록 commit(P1)·실행·시스템 설정(P2 중 실행 패널·기구 비트) → [16_save.md](16_save.md)(코어 `lib/save`·어댑터 `lib/save-localstorage`·연결 `view/save.ts`, 키 `mpj.save` 하나). 위 표 본문은 조사 당시 기록이라 고치지 않았다. 남은 것: 가이드 메시지 속도 화면 UI, 온라인 즉시 표시(P2).

### 5.3 온라인·광장·NPC

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| 프렌드 룸·알림 | [판독] menu00 Join `@0x7100035a90`, Play `@0x7100037a00`; main notice `@0x7100252860/710025366c/71002537b0`; [온라인](../shell/online.md) | server/socket·games·online/socketio::SocketIoOnline·OnlineView notice | 광장 실제 기본adapter; online_page FakeOnline 시험. notice 텍스트/아이콘/애니/SE, modeselect 별도callback | 실제 룸 사용; [미확정] 원본 알림queue 전체 책임 | 사용·알림 일부 사용 | 온라인·광장 | P1 실제세션·P2 queue |
| 게임 세션·seed·입력 | [판독] main BeginScene `@0x71002df258`→StartSync `@0x7100218cd0`/IsSynced `@0x71002197bc`, NetworkGameScene `@0x71001c94cc`, 슬롯 `@0x710013c440`, seed `@0x7100162210`; [온라인 동기](12_online_sync.md) | server/games.ts mpj-plaza; wire 룸제어·INFO·STAMP; GameSetup 로컬seed/players | main URL/Math.random seed·local pads/audio step. 미니게임 세션 등록 없음 | 프레임입력·seed합의·시작barrier·결과합의·station/slot/epoch 소유권 없음 | 일부 입력대체·게임동기 미구현 | mg1801 온라인 | P1 — 룸/게임 경계 |
| 프레임 gate | [판독] 원본 동기대기; [온라인 동기](12_online_sync.md), [한 판](../shell/minigame_scene.md) | mgscene/gate.ts FrameGate·localGate(always true) | 더미시험 MgScene | 온라인gate·실제게임 연결 없음 | 공용 미사용 | MgScene·후속게임 | P2 — 진행gate |
| 광장 위치 송수신·보간 | [판독] menu00 SendRemote `@0x710003fd64`, Receive `@0x71000421e0`, payload0x50; [온라인 동기 §6.2.1](12_online_sync.md) | plaza/ui/net.ts RemoteTable/Actor target; follow.ts RemoteMotion/AutoInterpolation | wire INFO·speed²>.1·.2s송신; follow:143~185 단일표시, 거리>5 teleport/≤1 rotate·속도6·도착snap | pos·quaternion→i16 1/256m·yaw. 정지heartbeat 없음(원본도 이동조건). [미확정] 원본 회전/수치 동등성 | 일부 사용·단일보간 사용 | 광장 | P2 — payload·수치 |
| NPC 접근·가이드 서비스 | [판독] menu00 MainImpl `@0x710005a170`: 정지→선회→Talking→설정→Save→복귀; [가이드](../shell/plaza_guide.md), [광장](../shell/plaza_3d.md) | plaza/npc·interact·Player·Heading; setplayer·charselect 부품 | 접근/클립/시선·A/result5 사건. interact:200~211 다음프레임resume; parts에 가이드부품 없음, ui/ui decide result3만 | 가이드 메뉴·화자/카메라·멤버교체·취소복원·Save·페이드 수명 연결 없음 | 접근 일부 사용·서비스 미구현·공용UI 미사용 | 광장 가이드 | P1 — 선택후 서비스 |
| 상점·자료관·음악·랭킹 | [판독] 광장 NPC 목적지·선택결과; [광장](../shell/plaza_3d.md) | interact 대상/결정 사건 | 대응 처리부품·서비스flow 없음 | 접근·선택 이후 목적지 미연결 | 일부 사용·미구현 | 광장 | P2 — 목적지 연결 |

### 5.4 자원 로딩·캐시·수명

| 공용 기능 | 원본 소유 모듈·근거 | 웹 공용 정의 | 실제 호출·우회 | 원본 동작 차이 | 판정 | 영향 | 우선순위·근거 |
|---|---|---|---|---|---|---|---|
| archive·우선순위·선로딩 | [판독] main ArchiveModule ctor `@0x71001d4714`, Entry `@0x71001d493c`, Load `@0x71001d4a50`, SceneLoad `@0x71001d4b60`: 9범주·중복refs+1·ReleaseAll; [로더](loader_manager.md) | lib/assetcore·view/appAssets singleton·flowCatalog/flowTable/appFlow P0~P3 | Stage3D/plaza/preview/BGM 실제 사용 | 원본archive 범주/일괄해제→웹 key/owner/pool 정책 | 사용·일부 대응 | 셸·광장 | P2 — 소유정책 |
| 게임 캐시·JSON·음원decode | [판독] 원본 Archive/SoundModule 공유·수명; [장면데이터](06_scene_data.md), [소리](04_sound.md) | appAssets broker; view/Assets 자체Promise/glTF/sub캐시; 화면 AudioBuffer Map | main:309 new Assets·Assets.sub:new; AudioOut.load 직접fetch/Map; MgmView.loadMgmSpec:38~46·화면추가JSON 직접fetch | 게임이 broker Promise/decoded glTF 미재사용. 일부bytes 공유·decode/output context 분리(appBgm 공유context 별도). [미확정] HTTP/SW 영향의 실제다운로드량 | 게임별 중복·broker 일부 우회 | mg1801·sub·셸음원 | P1 게임캐시·P2 decode통합 |
| GPU 준비·공용 객체 | [판독] 원본 module 계산·업로드; [스키닝 §7.1](skinning.md), [로더](loader_manager.md) | lib/assetcore-three::ScenePreparer initTexture→compileAsync→준비draw | Stage3D/MgStage.ensure 사용; 게임 Assets 직접cache | 공용 fetch/decode/GPU준비 미사용. 공용파일과 runtime/GPU 객체 공유의 분리 | 셸 사용·게임 공용 미사용 | mg1801 첫표시·재진입 | P2 — GPU준비 |
| 공용 자산·owner 해제 | [판독·데이터] common/font/chara archive·참조해제; [공용자산](common_assets.md), [폰트](font_assets.md), [캐릭터자산](chara_assets.md) | assets/common/font/chara·fontSheet singleton; assetcore.release refs감소 | Render2D/LytRenderer 글꼴 공유; plaza_page:227·mgstage_page:122 release; Assets.dispose:63~71 glTF/Map 정리 | GPU 업로드문맥별; broker캐시 유지·게임자체캐시 해제 | 사용·일부수명 대응 | UI·캐릭터·장면전환 | P2 — owner·문맥 |
| 예산·LRU | 웹 공용정책 [로더](loader_manager.md); 원본archive 수명과 별도 | assetcore:424~425 Infinity기본·:592~617 trim/LRU | appAssets 유한예산 없음·script trim 호출0; plazaGl 별도유한GPU예산 | LRU 정의와 앱 eviction 정책 미연결 | 공용 미사용 | 장시간전환·cache누적 | P1 — 앱예산 |
| HTTP·SW cache | 웹 배포정책 [압축](assets_pipeline.md); 원본archive와 별도 | view/assetMode:21~30→cache/sw | hashed cache-first·HTML/manifest network-first·API/socket/range우회·dev/src해제 | [미확정] 브라우저활성 상태·실제 재다운로드/GPU 비용 | 사용·실행 미확정 | 배포자원 | P2 — 캐시정책 |

## 6. 스냅샷

공용 기능 단위: 원본 게임 NRO 외부 소유 계약. 웹 비교 단위: 공용 정의 → 실제 소비자 → 우회·차이. 게임별 정책: 옵션·판정 창·카메라 설정 등 적용 조건 별도 기록.

| 식별 항목 | 확인값·근거 [데이터] |
|---|---|
| 원본 제품 | Super Mario Party Jamboree, US, v0, TitleID `0100965017338000` — [추출 명세](../analysis/00_extraction_pipeline.md), `C:/dev/mpj/README.md` |
| 웹 저장소 | `C:/dev/mpj/web`, HEAD `a818f937e08dc6deaa13ff1873f1c50d3cc60102`; 수정 작업트리 포함 |
| 원본 main | `C:/dev/mpj/extracted/exefs/main`, 15,934,795 B; SHA-256 `F474D60DA145BA0BF2E4262D727BA76718EF2CDD101ECEA592260EB507159A50` |
| main 함수 인덱스 | `C:/dev/mpj/analysis/functions/main.nso.tsv`, 63,952행; SHA-256 `6AE1F55DD9F6987152865D60C727C33ECEC77C8AE7D0711721DBCCEAF78CDB3D` |
| 판독 인덱스 | `C:/dev/mpj/analysis/decomp/INDEX.tsv`; SHA-256 `B02BA59DC5B4916C5051A82E7DE8BEEE87096C6628F35F2456EDEFCE6193FE4D` |
| 웹 게임 등록 | `script/games/index.ts::GAMES = [mg1801Game]`; SHA-256 `743FD783C019196C87F6A9FCB6FFC09BBA41DB0AAB6755AF40F57F5D36C74CE3` |
| 웹 진입·목록 | `script/main.ts` SHA-256 `FF315C7F58FC76944DF06F86053D35C9C92A0F3ABFD88C3D499B2D09CA867613`; `script/mgm01_page.ts` `1F28A57E204D58A784E945BD520E476DFDCD79137F6369CF4700EDC353DE1F69` |
| 웹 허브 | `script/mgmet_page.ts` SHA-256 `A681929589EE2AD56438F89F7F06244712D9CA1465D4E537CDEB684112CDEDF1` |
| 웹 후처리·공용 재질 | `G/view/post.ts` SHA-256 `CFD4426B15D9CD10239EC3D7D519C1EA46FA008FCB8C92514DE21E08661C83EE`; `S/material.ts` `82C1AC1C2DF52FA80156A316189A30779D387744A5091D331A0A70E8C31B0B47` |
| 웹 온라인·추종 | `script/shell/plaza/ui/net.ts` SHA-256 `E4383ACF966DB25BBF36132193B3B53B328A9DCA35574AFB09F2798FCE6CA37D`; `script/shell/plaza/follow.ts` `9437578961173AAFA2A2C661491664F6B732EF892A53542D4D6950B4E829109B` |
| 변환기 | `tools/analysis/asset_convert.py` SHA-256 `9C94FFD689291147199BAEDBBA6FB925BAC5484C8F0A85619FF269977D82D6A0`; :688~744 아카이브 graph.json→광장 hash 재사용[추정]→pending/SASS 경로 |
| 추가 그래프 근거 | [셰이더 그래프 §5·8](14_shader_graphs.md), SHA-256 `36880C9AEF4AA6DC4FABECCD797DDA15AAC6FF4A7F57B4507085C5D84FAE65A9`: mg0508/mg0106/mg0101/mg0122/mg0102 옵션 튜플 27개·pending 106재질 집계; 변환 후 미실행. [미확정] 그래프 식·사전 적용·manifest/압축 자산 반영. 기존 선택적 GraphDef 처리와 별도 범위 |
| 적용 지침 | `DESIGN.md`; 상위 README의 `C:/dev/mpj/분석.txt` 링크 대상 부재 |

주소 식별: 모듈명 + 주소, 기본 베이스 `0x7100000000`. **[미확정]** NRO 139개 개별 해시, SDK·`subsdk0` 본문, 패키지 메타데이터 재판독.

## 7. 조사 모집단·웹 구현 범위

### 7.1 모집단

| 모집단 | 수·대상 | 확인 범위 |
|---|---|---|
| 원본 NRO | `analysis/functions/*.nro.tsv` 139개: `mg####` 112 + 기타 모드·흐름 27 | [데이터] 파일 목록 전수 집계 |
| 원본 공용 계층 | `main.nso`: `bq`, `bex`, `ca`, `actor`, `nn::bezel`, `sb`, `wl` | [데이터] 이름·주소 인덱스 분류; [미확정] 게임별 호출 |
| 원본 실행 환경 | `sdk`, `subsdk0`, `rtld`, `boot.nbinit`, BEA·메시지·게임 데이터 | 기존 명세 재사용; [미확정] 플랫폼·Lua·영상 계약 |
| 웹 등록 게임 | `script/games/index.ts`의 `mg1801` 1개 | [판독] 등록 배열 |
| 웹 게임 디렉터리 | `script/games/mg1801`, `script/games/mgdummy` 2개 | [판독] `mgdummy::createDummyGame`: 원본 대응 없는 `shell/mgscene` 시험용, GAMES 미등록 |
| 웹 카탈로그 | `script/shell/mgm01/catalog.ts`, 112게임 | [판독] 목록·필터 데이터 |
| 분석 문서 | 미니게임 22개 + `rc_stage01` 1개 | [데이터] 문서 목록 |
| 웹 셸·기반 | `script/core` 6파일, `script/shell` 13디렉터리, `script/lib` 3디렉터리, `script/view`, `script/cache`, 페이지 진입점 | [데이터] `script` TypeScript 213파일; 소비자 연결: §1~§5 |
| 서버·도구 | `server`, `tools/analysis`, 빌드·압축·검증 도구 | [판독] `server/games.ts`: `mpj-plaza` 1서비스 등록 |
| 기존 문서 | 최초 `docs` MD 68파일 | [데이터] 제목·범주 목록; 관련 명세 재사용 |

분석 문서 22게임: `mg0101`, `mg0102`, `mg0106`, `mg0107`, `mg0118`, `mg0119`, `mg0122`, `mg0508`, `mg0906`, `mg0911`, `mg0912`, `mg1002`, `mg1801`~`mg1810`. 별도 모드 `rc_stage01`. [데이터] 원본 게임 미문서화 90종; 분석 문서 중 웹 게임 디렉터리 부재 21종 + `rc_stage01`.

### 7.2 원본 게임 112종

[데이터] 파일 접두별 집계. 이름·BEA·메시지 대응: `C:/dev/mpj/analysis/minigame_catalog.tsv`, [원본 모듈 명세](../analysis/02_code_modules.md). [미확정] 두 자리 접두의 장르 의미.
| 접두 | 수 | 원본 게임 ID |
|---|---:|---|
| mg01 | 21 | mg0101, mg0102, mg0103, mg0104, mg0106, mg0107, mg0108, mg0109, mg0110, mg0111, mg0112, mg0113, mg0114, mg0115, mg0116, mg0117, mg0118, mg0119, mg0121, mg0122, mg0123 |
| mg02 | 4 | mg0201, mg0202, mg0203, mg0204 |
| mg03 | 8 | mg0301, mg0303, mg0304, mg0305, mg0306, mg0307, mg0308, mg0309 |
| mg04 | 2 | mg0401, mg0402 |
| mg05 | 8 | mg0501, mg0502, mg0503, mg0504, mg0505, mg0508, mg0509, mg0510 |
| mg06 | 2 | mg0601, mg0602 |
| mg07 | 6 | mg0701, mg0702, mg0703, mg0704, mg0705, mg0706 |
| mg08 | 2 | mg0801, mg0802 |
| mg09 | 10 | mg0903, mg0905, mg0906, mg0907, mg0908, mg0909, mg0910, mg0911, mg0912, mg0913 |
| mg10 | 5 | mg1001, mg1002, mg1003, mg1004, mg1005 |
| mg11 | 9 | mg1105, mg1106, mg1108, mg1109, mg1111, mg1116, mg1117, mg1118, mg1120 |
| mg13 | 5 | mg1301, mg1302, mg1303, mg1304, mg1305 |
| mg14 | 10 | mg1401, mg1402, mg1403, mg1404, mg1405, mg1406, mg1407, mg1408, mg1412, mg1414 |
| mg16 | 5 | mg1601, mg1602, mg1604, mg1605, mg1607 |
| mg17 | 5 | mg1701, mg1702, mg1703, mg1704, mg1705 |
| mg18 | 10 | mg1801, mg1802, mg1803, mg1804, mg1805, mg1806, mg1807, mg1808, mg1809, mg1810 |

### 7.3 기타 NRO 27개

| 분류 | 모듈 | 공용 경계·미확정 분석 |
|---|---|---|
| 보드 | `bd01` | main 공용 보드 상태·보상·세이브; [미확정] 보드 전체 로직·모드 전용 규칙 |
| 쿠파 계열 | `kb01`, `kbet` | `ca::kb`, `ca::kbd`, `ca::kbm`; §1.1 kb import 12개; [미확정] kbd/kbm 공유 계약·caller |
| 애슬론 | `ca01`, `caet` | `ca::coin_athlon`; §1.1 import 18개; [미확정] 각 caller의 계약·활성 조건 |
| 협력·파타파타 계열 후보 | `mf01`, `pp01`, `pp03`, `pp04`, `ppet` | [미확정] 정식 명칭·공용 적용 범위; 필요 근거: `sb`/`wl` 호출 |
| 리듬 모드 | `rc_stage01` | `ca::rm`, 리듬 게임 10종; 웹 미등록 |
| 미니게임 셸 | `mgm01`~`mgm06`, `mgmet`, `mgmrs`, `mgInst` | 목록·설명·결과·모드 흐름 |
| 메뉴 | `menu00`, `menu01` | 광장·플레이어 설정·모드 선택·공용 UI |
| 시스템 흐름 | `boot`, `op`, `ed`, `matching00`, `gyroPadChange` | 부트·영상·매칭·컨트롤러 변경 |

### 7.4 웹 소비자 모집단

| 종류 | 등록·정의 | 실제 경로·확인 범위 |
|---|---|---|
| 게임 | `script/games/index.ts::GAMES` → `mg1801Game` | `script/main.ts`, `games/mg1801/{logic,view}` |
| 더미 | `script/games/mgdummy/logic.ts::createDummyGame`, `view.ts` | `mgscene` 계약 시험 |
| 페이지 | `tools/esbuild_config.ts::ENTRIES`: `main`, `ui`; `PAGES`: `index.html`, `ui.html` | 게임 진입점·셸 시험 진입점 |
| UI | `script/ui_main.ts::UIS` | 17개: `charselect`, `modeselect`, `mgmcommon`, `mgm01-history`, `mgm01-announce`, `mgmet-howto`, `mgm01-setting`, `mgm01-filter`, `mgmet`, `mgmet-rule`, `partyrule`, `setplayer`, `online`, `mgm01-list`, `mgresult`, `mgscene`, `mgstage` |
| 광장 | `script/plaza_page.ts`, `script/shell/plaza` | main.ts:427~489 flowPlaza·flowPlayers 연결 |
| 셸 | `script/shell` | 13개: `charselect`, `mgm01`, `mgmcommon`, `mgmet`, `mgresult`, `mgscene`, `mgstage`, `modeselect`, `online`, `partyrule`, `plaza`, `setplayer`, `stage3d` |
| 웹 기반 | `script/lib/{assetcore,assetcore-three,bgmstream}`, `script/cache`, `script/view`, `script/core` | 캐시·로딩·스트리밍·공통 계산 |
| 서버 | `server/games.ts::games/routers` → `server/games/mpj-plaza` | 광장 방 서비스 |

## 8. 미확정 분석

| 영역 | 부족한 근거 |
|---|---|
| 결과·전환 | 원본 mg1801/freeplay ring writer 전체·Call/Return 부모 인스턴스 보존·Save 실제 디스크 시점 |
| 모드 계층 | §1.1 import 경계 확인; bd/ca/kb/mf/pp/rc 내부 상세 공유 계약·실행 조건 |
| 그래픽 활성 | spot/fluid/d_buffer/lens flare·DefaultGlobalLighting·LOD distance/FSO priority·impostor enable/atlas·APX solver·눈/morph/scale mode 최종 합성·5게임 그래프 사전/변환 반영 |
| 영상·스크립트 | op/ppet CreateMovie 호출 위치·옵션·스킵; Lua 자산·진입·바인딩·GC 인자 |
| 플랫폼 | SDK/subsdk0/rtld·heap/작업/I/O·ComMatter 부품 수명 경계 |
| 센서·물리 | mg0118 센서tick/Player 선후·Capsule축/길이·All정렬/동점·query옵션명·회전CCD |
| 서비스실행 | SW활성·GPU/네트워크 비용·동기SDK 복구·알림queue |

## 9. 근거·검증 범위

| 검증 항목 | 범위·결과 |
|---|---|
| 원본 분석 | 기존 01~13·lod·skinning·게임·셸 문서 재사용; main/NRO 함수 인덱스 정적 대조 |
| 웹 소비자 | `script/**/*.ts` import·생성·호스트 검색, main/GameDef·mgm01·MgScene 결과 어댑터 판독; Stage3D/MgStage·Preview3D·게임 view·변환기 정적 조사 |
| 문서 시점 차이 | Stage3D setupExtras→PostChain 구현; 게임 post의 곡선/DOF 미확정 주석 대 최신07 식; effects 운동식 미판독 주석 대 최신08; 09 MotionSlot·08 view/effects 권장 구조 대 실제 게임별 구현 |
| 문서 정합성 | 감사 106항목·근거 링크 131개; 상대경로 존재·감사표 8열·항목 중복·git diff 공백 검사 |
| 미실시 | 원본/웹 실행·새 Ghidra/SASS·신규 수치 검산·전체 binary hash 중복 검사 |
| 미확정 전수 범위 | 원본112게임 전체 호출자·27모드 전체 본문·main63,952함수·SDK/subsdk0 전체 의미 판독 |
