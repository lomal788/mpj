# mgm02~06 — 보드 없는 라운드 파티의 원본 모드 비교

[데이터] Super Mario Party Jamboree US v0, 자료 확인일 2026-10-10. 원본·extracted는 읽기만 했고 원본 실행·헤드리스·화면 촬영은 없다. 모듈 식별은 `mgm02~06.nro`, `mgmet.nro`, `bd01.nro`, `main.nso`와 주소의 쌍이다. 제품·모듈 배경은 [허브 §2](mgmet_flow.md#2-분석-대상자료-위치), 함수 존재는 [함수 목록][fn02]·[INDEX][idx]에 근거한다.

## 1. 기능 개요

[설계] 광장 → 항구 → 보드 없이 N회 미니게임 → 누적 결과라는 목표에는 **mgm02 챌린지 미니게임 배틀**을 가장 가까운 원본으로 추천한다. 5·7·10라운드 선택과 코인 누적 경쟁이 근거다. 임의 N·모든 장르 추첨은 별도 웹 변형이며 사용자 미승인 추천이다. 근거: mgmet `Mgm02SetRuleForCpu` @0x7100054640 [C][callers], `RoundButton::SetBody` @0x710007efdc [규칙 §4.3](mgmet_ruleconfig.md#43-값-표와-버튼-전-함수군), [MSG-H] `mgmet_cmgb_mw_howToPlay00~02`.

| 모드·활동 ID | 진행·승리·결과 | 사용 범위·N회와의 차이 | 근거 |
|---|---|---|---|
| [데이터] mgm02 / 활동4 / mode2 / 챌린지 미니게임 배틀 | [데이터] 연속 챌린지·찬스 이벤트·최종 코인 수 경쟁. [판독: 어셈블리] 라운드 UI 5/7/10 | [추정] Chara 계열 중심 후보. [미확정] 추첨 집합·코인 배분·보너스/배틀 회차·동점 처리 | mgmet @0x7100054640 [C][callers], @0x710007efdc [규칙 §4.3](mgmet_ruleconfig.md#43-값-표와-버튼-전-함수군); [MSG-H] `cmgb` 안내·[MSG-02] `mgm02_ui_round01/02` |
| [데이터] mgm03 / 활동1 / mode3 / 데일리 트라이얼 | [데이터] 3게임 팩·1위 스타·매일 바뀌는 게임. 팩 25개, 중복 제거 49게임 | [설계] 고정 3게임 세트에 가깝다. 임의 N 또는 전체 112 무작위와 다르다 | mgmet @0x7100057b00 [C][callers]; [PACK] `mgpack[].mg1~mg3`; [MSG-H] `mgmet_dt_mw_howToPlay00~02` |
| [데이터] mgm04 / 활동0 / mode4 / 태그 매치 | [데이터] 2vs2·먼저 목표 승수를 얻는 팀이 승리. [판독: 어셈블리] 스타 UI 3/5/10. 랜덤 매칭은 연승·랭킹 | [설계] 목표 승수 방식은 총 경기 수 N과 다르다. [미확정] 모든 2VS2 12종의 사용 여부·무승부·패한 팀 선택권 | mgmet @0x71000638a0·@0x71000633c0 [C][callers], @0x710007f338 [규칙 §4.3](mgmet_ruleconfig.md#43-값-표와-버튼-전-함수군); [MSG-04] `mgm04_start_mw_guideCourse00`, [MSG-H] `tm/tmrm` 안내 |
| [데이터] mgm05 / 활동3 / mode5 / 서바이벌 | [데이터] 세계 대전·승패로 실력 포인트 증감·S부터 랭킹. 명시 목록26종 | [설계] 로컬 N회 파티와 목적이 다르다. [미확정] 루프 종료·포인트 식·VS4→듀얼 이동 조건 | mgmet @0x710005f5e0 [C][callers]; [SURV] `mgList[].mg`; [MSG-H] `mgmet_sb_mw_howToPlay00~03`; mgm05 @0x710000c210 [함수 목록][fn05] |
| [데이터] mgm06 / 활동5 / mode6 / 보스 러시 | [데이터] 협력 보스 연전·한 번 패하면 실패·마지막 MVP·결과 총점 표시 | [추정] Boss 5종이 후보. [미확정] 실제 순서·중복·기여점·MVP 동률 판정 | [MSG-H] `mgmet_bm_mw_howToPlay00~02`; [MSG-06] `mgm06_resWin_ui_totalScore`; mgm06 @0x710001140c·@0x710001e5e0 [함수 목록][fn06] |

[판독] [데이터] 활동0~5 → mode4/3/1/5/2/6이며 프리 플레이는 활동 2/mode 1이다. 이미 판독된 mgmet `SetNextMGMode` 표 @0x71000e3658, `GetModeNumberFromID` @0x7100050248과 main `CallMinigameModeScene` @0x710036027c를 재사용한다. [허브 §4.2](mgmet_flow.md#42-모드-번호는-표별로-구분), [공용 감사 §1.2](../engine/common_system_audit.md#12-게임-호스트프리-플레이-경계).

## 2. 자료

### 2.1 기존 판독·미확정 일괄 목록

| 기존 절 | 재사용할 판독·주소 | 이번에 남는 빈 곳 |
|---|---|---|
| [판독] [mgm01 §3.2·6.3·8.3](mgm01_freeplay.md#32-한-판-호출과-돌아온-뒤) | main `CallMinigameScene` @0x71003601ac; mgm01 랜덤 @0x71000164c0/@0x710001b2b0; 후보 필터 @0x710001c2a0 | mgm02~06·보드 추첨 본체 |
| [판독] [mgmet_flow §3·4.2·8·11](mgmet_flow.md#3-진입점과-호출-흐름) | 허브 상태 @0x7100049ed0; 활동 표 @0x71000e3658; 프리 플레이 @0x710005ddd0 | 다른 활동의 화면 순서·보상·온라인 내부 |
| [판독] [mgmet_ruleconfig §4.2·4.3·6.1·8.1](mgmet_ruleconfig.md#42-configinfo-48바이트) | ConfigInfo·RuleConfigView @0x710007d974/@0x710007e0d0·Work cache @0x71001f0ea4 | 모드별 caller의 표시 열·commit 사용 |
| [판독] [minigame_scene §4.3·5·12.1·12.12](minigame_scene.md#43-미니게임-설정-표-mgsetting-레코드-0x30-b-id--0x98-판독--데이터) | main `MinigameFlow` @0x71002e0500; 결과/게이트 계약; 최신 GameRule 문자열 표 | 모드 고유 계산·추첨·점수 |
| [판독] [minigame_result §6.1·6.5](minigame_result.md#61-패턴-고르기-fun_71002ee230) | main @0x71002ee230/@0x71002f462c/@0x71002f4758; 승패1/0/2·ring 경계 | 모드 누적 코인/스타/MVP는 한 판 결과와 별도 |
| [판독: 어셈블리] [01_core §6.6·6.7](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행) | main RandModule @0x7100189200·seed @0x7100189438·장면 seed @0x71001c94cc | 각 모드·보드의 실제 소비 순서 |
| [데이터] [common_system_audit §1.2·7.2](../engine/common_system_audit.md#72-원본-게임-112종) | 활동 번호·112개 모집단·미포팅 모드 감사 | catalog에 인원 형태·체감·실제 목록 연결 |

[설계] 공용 SceneBase/Work 소유권·수명은 완료된 [18_scene_work §3~5·9](../engine/18_scene_work.md#5-상태수명)와 [DESIGN §10.5][design]를 재사용한다. 공용 C의 새 판독은 0개다. 모드 고유 Work getter가 이름으로만 확인되면 오프셋을 추측하지 않는다.

### 2.2 실제 자료와 C 보유 상태

| 자료 | 확인 범위·경로 |
|---|---|
| [데이터] 함수·C 인덱스 | [INDEX][idx]·[mgm02][fn02]·[mgm03][fn03]·[mgm04][fn04]·[mgm05][fn05]·[mgm06][fn06]·[mgmet][fnH]·[bd01][fnBD]·[main][fnMain] |
| [데이터] 기존 C | [callers]의 기존 규칙/복귀 8함수와 후속 caller/결과 reader 11함수, [DAILY-C]의 후속 4함수. 누적 23함수; §3.4·3.5·§6.2·6.3·부록B 참조 |
| [미확정] 본체 C 부재 | INDEX 및 `analysis/decomp/*.c`, `ghidra_work/*/out/*.c` 헤더에서 mgm02~06 Scene/MgMgr·bd01 MgMgr/MgCall 본체를 찾지 못함. 주소는 부록C에 요청; 추출하지 않음 |
| [데이터] 게임 이름 | [catalog][catalog] `code/name_ko/name_en/nro_size/bea` 112행. 인원 형태/모드 membership 열은 없음 |
| [데이터] 미니게임 표 | [ND] `mgList`84행·[CA] `mgList`38행; `Name/GameRule/Available/Gyro/Coin/BD01Normal/BD01Serious` |
| [데이터] 프리 플레이·팩·서바이벌 | [FP] `gamedata`112행·[PACK] `mgpack`25행·[SURV] `mgList`26행 |
| [데이터] 규칙·결과 문구 | [MSG-H]·[MSG-02]·[MSG-03]·[MSG-04]·[MSG-05]·[MSG-06]; 각 행에 실제 필드명 명시 |
| [데이터] 레이아웃 존재 | `extracted/bea/mgm~mgm02.nx.bea/mgm/mgm02/layout.lyt` 등 mgm02~06 같은 경로. §7에서 개별 링크 |
| [데이터] 현행 등록 | [script/app/minigame/index.ts][registry] `GAMES=[mg1801Game]`; 이번 확인 시 실제 등록 1종 |

[데이터] 관련 상위·대상 경로의 `AGENTS.md`와 `.agents/skills`는 발견되지 않았다. 키 값은 출력·기록하지 않았고 로컬 Codex 기억은 사용하지 않았다. 기준 검색 범위는 `C:/dev/mpj`, `web`, `web/docs`, `web/docs/shell`; 전체 저장소의 AGENTS.md/.agents 목록도 확인했다.

### 2.3 후속 공백·caller/callee 일괄 목록

[데이터] 후속 분석은 기존 §2.1·§3.2·§3.3의 8함수를 재사용하고 아래 공백만 기존 C로 읽었다. 본체 C가 없는 추첨·정산·종료는 심볼로 좁힌 뒤 부록 C에 남겼다. 모듈·주소를 함께 대조했으며 같은 주소의 다른 NRO 함수는 C 존재 근거로 쓰지 않았다. [INDEX][idx]·[fn02]·[fnH]·[fnMain].

| 공백 [데이터] | 새로 필요한 caller/reader | 기존 C / 남은 callee |
|---|---|---|
| 데일리 팩·조합·시간 | main LoadDailyTrialData @0x7100361e00, GetMgPackDailyTrialData @0x7100362860, GetRemainingTimeFromBaseDateTimeDailyTrialData @0x7100362a10, GetComboIndexFromNowDateTimeDailyTrialData @0x7100362bcc | [DAILY-C] 있음. JSON 파서 @0x7100362300/@0x71003624e0와 날짜 helper @0x71003628bc는 없음. 실제 선택 caller mgmet @0x7100056e10/@0x7100056f40도 없음 |
| 설정 진입·진행 | mgmet ChallengeMgBattleSettingUiFlow @0x71000535f0, Dailytrial_SettingUiFlow @0x7100055cb0, SurvivalMainFlow @0x710005e4a0, BossrushStartFlow_SettingUIFlow @0x7100050e10 | [callers] 있음. MGMSelectOpponentUiFlow @0x710005a1a0는 없음. 기존 규칙 7함수는 §3.2 재사용 |
| 챌린지 결과 표시 | mgmet ChallengeMgBattleResultUI::Setup @0x7100066610, ChallengeMgBattleResultMessage::StartAnnounceTop @0x7100003b70 | [callers] 있음. main rank/결과 getter·setter, mgmet 정렬 helper @0x7100068d90·발표 helper @0x7100004040는 없음 |
| 데일리 결과 표시 | mgmet DailytrialResultUI::Setup @0x710006c4e0 | [callers] 있음. DailytrialResultData::Setup/SetupRandomMatch/IsGetStar/IsWinLose/GetRank/IsGotStarBefore는 부록 C의 6주소; C 없음 |
| 태그 결과·복귀 | mgmet TagmatchResult::Impl::Setup @0x7100078e70, TagmatchResultForRM::Impl::Setup @0x71000786d4, Mgm04ReturnUiFlow @0x7100085900, Mgm04ReturnFlow @0x71000818e0 | [callers] 있음. main Mgm04GetMGResult/Count/TeamData와 mgmet 보상 카운터 @0x71000864a0/@0x71000866fc는 없음 |
| 원본 코인 산식·유형 표 | mgm02 CoinMgr 8함수·SceneParamsGame/유형 getter 7함수 | [fn02]의 정확한 심볼·주소를 부록 C에 추가. 허용 C 없음; 계산이나 데이터 값을 추측하지 않음 |

[데이터] extracted의 mgm02/03/04/06 archive에는 규칙 JSON이 없고, 기존 extracted JSON에서 mg_type_table_five_round/seven_round/ten_round·rank_coin_count·bonus_mg_coin_count_coef·battle_mg_levied_coin_count 필드명을 찾지 못했다. 이는 실제 데이터가 없다는 증명이 아니다. 모드별 실제 경로는 §7의 archive 링크이며 데이터 소비 후보는 mgm02 SceneParamsGame::getPropertyList @0x710001b0a8와 MgType @0x710001b580 [fn02]다.

## 3. 진입점·호출 흐름

### 3.1 기존 허브와 본체 진입점

[판독: 어셈블리] 허브 → 모드 요청은 mgmet @0x7100049f14와 main `CallMinigameModeScene` @0x710036027c·이름 표 @0x71015d840c를 재사용한다. [허브 §3](mgmet_flow.md#3-진입점과-호출-흐름). 여기서 각 모드 내부 호출 순서는 확인되지 않는다.

| 모듈 | TSV의 실제 본체 심볼·주소 | 화면 흐름 해석과 제한 |
|---|---|---|
| [데이터] mgm02 | `MinigameModeFlow` @0x7100017728·`FirstRoundFlow` @0x71000178f0·`DecideMgFlow` @0x7100017b20·`StepToMinigameScene` @0x7100018030·`ResultFlow` @0x7100018300·`ReturnToEntranceScene` @0x7100018740 [fn02] | [추정] 첫 라운드 → 게임 결정 → 한 판 → 코인 결과 → 다음/최종 → 항구. [미확정] 실제 분기·라운드 증가 시점 |
| [데이터] mgm03 | `MinigameModeFlow` @0x7100009780·`StartFlow` @0x7100009bc0·`DicideMinigameFlow` @0x710000a440·`ResultMinigameFlow` @0x710000b3a0 [fn03] | [추정] 팩 선택/규칙 → 팩 내3게임 → 스타 결과 → 항구. [미확정] 팩 순서·팀 회전·마지막 시상 |
| [데이터] mgm04 | `MinigameModeFlow` @0x7100015f70·`FirstRoundFlow` @0x7100016190·`ResultFlow_Cut01/02` @0x7100016330/@0x7100016390·`SelectNextMgFlow` @0x7100016580 [fn04] | [추정] 팀/목표 승수 → 2vs2 → 양팀 결과 → 다음 선택/최종. RM은 `RM_MinigameModeFlow` @0x710001aa90의 별도 본체 |
| [데이터] mgm05 | `MinigameModeFlow` @0x710000956c·`MinigameModeFlow_AfterMaching` @0x710000aeb0·`MinigameModeFlow_AfterGame` @0x710000c210·`DicideMinigameFlow` @0x7100010d90 [fn05] | [추정] 규칙 → 매칭 → 투표/룰렛 → 한 판 → 승패/포인트 → 다음/재도전. [미확정] 전환 조건 |
| [데이터] mgm06 | `MinigameModeFlow` @0x710001140c·`OpeningFlow` @0x71000115a0·`CallMinigameScene` @0x7100011610·`RewardFlow` @0x7100011750·`VictoryFlow::MainFlow` @0x710001e5e0 [fn06] | [추정] 보스 연전 → 패배 종료/완주 → MVP·총점 → 항구. [미확정] 보스 수·순서·호출 연결 |

[데이터] `Dicide`·`AfterMaching`·`FirstRount`·`TeamVitory` 등 원본 식별자의 철자는 TSV 그대로 유지한다. 심볼 존재는 실행 경로나 연산의 판독이 아니다. [fn03]·[fn04]·[fn05]·[fnMain].

### 3.2 빈 부분에서 새로 읽은 규칙 caller

| mgmet 함수·주소 [판독] | 표시 열·주변 UI | 완료 처리·한계 |
|---|---|---|
| `Mgm02SetRuleForCpu` @0x7100054640 [callers] | 체감·설명·라운드·Play, CPU는 `GetComPlayerCount()!=0`; `ChallangeMGBattleHighScore::In/Out` | 시작1/취소2 양쪽에서 COM 설정·Mgm02Reset·Mgm02SetMgTableKind·flag4·flag6·Experience/Explain/CPU/Round cache writer 호출 |
| `Mgm02SetRuleForRandomMatch` @0x7100054390 [callers] | 체감·잠금 라운드(index0=5)·Play·하이스코어 | Mgm02Reset·MgTableKind setter 호출·flag4=false·flag6=최종 체감 index==0. [미확정] 본체 GetMaxRound와 잠금값의 소비 연결 |
| `Mgm03SetRuleFlow` @0x7100057b00 [callers] | 설명·Play·CPU는 COM 존재 시·`DailytrialPackSelect::InCom/OutCom` | 시작/취소 양쪽에서 COM·flag4·Explain/CPU cache writer. 체감·라운드 표시 없음 |
| `Mgm04SetRuleTopFlow` @0x71000628f0 [callers] | Scene+0x3b0==0이면 `Mgm04SetRuleVsCpuFlow`로 바로 반환 | 그 외 랭킹/중단 데이터·동기 처리 뒤 `Mgm04SetRuleRandomMatchFlow`. [미확정] 해당 byte의 상위 writer 의미 |
| `Mgm04SetRuleVsCpuFlow` @0x71000638a0 [callers] | VS·스타·체감·설명·Play·CPU는 COM 존재 시 | team index×0x10으로 @0x71000e372c~38의 네 값을 읽어 TeamData setter; TargetVictoryCount·ResetNormalMatch·5개 cache writer 호출 |
| `Mgm04SetRuleRandomMatchFlow` @0x71000633c0 [callers] | 체감·Play·`TagmatchPlayerInfo`·오프라인 결과4에서 랭킹 | type!=1 PlayerID 수집→TeamData·InitMGIDHistory·flag4=false·Experience cache·flag6. [미확정] `Mgm04SetIsRandomMatch` 인자가 C에서 포인터 byte처럼 보임 |
| `Mgm05SetRuleFlow` @0x710005f5e0 [callers] | 체감·Play·`SurvivalPlayerInfo` | 시작 시 컨트롤러 수1/임시인원→체감 확인→원래 인원 복원. 시작/취소 후 COM level2·flag4=false·Experience cache·flag6. 결과4→`ShowRankingFlow(this,3)` |

[판독] 위 caller의 Update 결과1은 시작·2는 활동 설명·3은 취소이며 caller 반환은 시작1/취소2다. 체감 index0이면 `ConfirmMgExperienceFlow`를 호출하는 갈래가 있다. 공용 Update의 입력 우선순위·키 비트는 mgmet @0x710007e0d0 [규칙 §6.1](mgmet_ruleconfig.md#61-입력반복반환값)을 재사용한다. [미확정] 일부 Work setter의 값 인자가 C에서 빠졌으므로 exact commit 숫자나 팀 표 값을 복원하지 않았다. [C][callers].

### 3.3 추가로 확인된 보스 복귀 연출

[판독] 최종 C 대조에서 `BossrushReturnFlow_DefeatEndBefore` — mgmet @0x7100052f00의 본체가 [callers]에 있음을 확인해 추출 요청에서 제외했다. [판독] NPC 대기 → `Mgm06_PlayEventPosAnim` → 플레이어 모션 요청 → `WaitDeltaFrameFlow(25.0)` → `CallAction(0~3)` → `WaitDeltaFrameFlow(5.0)` → NPC `bd_fear_talk00` → 메시지 완료 대기의 경계가 보인다. [판독] 이 함수에는 코인/스타/기여점/MVP 집계 writer가 없다. [미확정] 애니/메시지 라벨의 일부 인자가 C에서 빠졌으며, 호출하는 상위 경로와 실제 완료 의미는 확정하지 않았다. 출처: mgmet @0x7100052f00 [C][callers].

### 3.4 후속 판독: 설정 caller의 연결

| caller [판독] | 확인한 순서·반환·설정 | 보류할 부분 |
|---|---|---|
| mgmet @0x71000535f0 ChallengeMgBattleSettingUiFlow [callers] | 상대 선택(mode2) → Scene+0x3b0==0이면 로컬 설명·VSCom 하이스코어·기존 CPU 규칙 caller, 그 밖 연결 흐름·VSRM 하이스코어·기존 RM 규칙 caller. 상대 선택 취소 경로의 반환은 0 | byte의 writer·온라인/동행의 전체 구분은 MGMSelectOpponentUiFlow @0x710005a1a0 [fnH] C 없음 |
| mgmet @0x7100055cb0 Dailytrial_SettingUiFlow [callers] | 상대 선택(mode3) → 설명/연결 → 팩 선택 → GyroMGCheckFlow → 로컬이면 기존 Mgm03SetRuleFlow, 다른 분기는 flag4=false. 마지막에 팩 UI Deactivate. 취소 반환2 | 팩 선택·GyroMGCheckFlow가 소비하는 ID/체감 판단의 본체, 실제 날짜 갱신 |
| mgmet @0x710005e4a0 SurvivalMainFlow [callers] | 카메라 완료 대기 → 활동 제목 → 설명(mode5) → 인원 설정 → 연결 흐름(1,0,0) → Mgm05SettingUiFlow → SurvivalAfterFlow. 실패/취소 경로는 SurvivalAfterFlow(this,2) | 인원 설정 함수의 허용 수·온라인 매칭의 실제 2/4인 선택·포인트/재도전은 별도 본체 |
| mgmet @0x7100050e10 BossrushStartFlow_SettingUIFlow [callers] | 설명 열·COM 존재 시 CPU 열. Update1→시작 반환1, Update3→취소 반환0. 두 경로에서 COM·flag4=(설명 index==0)·Explain/CPU cache writer; 연결된 비호스트는 Work cache 쓰기 생략 | setter 값 인자가 빠진 부분·상위 StartFlow의 실제 시작/취소 소비·보스 수/순서 |

[판독] 위 흐름의 반환값은 기존 규칙 caller의 시작1/취소2와 항상 같지 않다. 상위 caller마다 반환값을 보존해야 한다. 근거: mgmet @0x71000535f0/@0x7100050e10 [callers], 기존 §3.2.

### 3.5 후속 판독: 결과 reader·시상 경계

[판독] 챌린지 결과 UI는 Order와 Mgm02GetResultRank를 네 번 읽어 PlayerOrderAndRank 4항목을 만든 뒤 FUN_7100068d90으로 정렬하고 순위+1·TotalCoinCount·개별 게임 결과를 표시한다. 우승 발표 reader는 rank==0 조건으로 Order0~3을 수집한다. [미확정] getter의 Order 인자와 정렬/발표 helper C가 빠져 동점의 안정 순서·메시지 선택을 확정하지 않았다. 코인 배분과 rank를 만드는 writer도 없다. mgmet @0x7100066610/@0x7100003b70 [callers]; main @0x71001f33a0/@0x71001f33d0 [fnMain].

[판독] 데일리 결과 UI는 DailytrialResultData의 IsGotStarBefore·IsWinLose·IsGetStar·GetRank를 읽어 이전 스타·이번 스타·순위를 표시한다. 이 함수는 스타 지급 산식의 writer가 아니다. [미확정] 승패형 게임과 rank형 게임의 별 지급·동점 처리·중복 지급 방지는 해당 Data의 Setup/SetupRandomMatch C가 필요하다. mgmet @0x710006c4e0 [callers], @0x71000083e0/@0x7100008ba4 [fnH].

[판독] 태그 결과 UI는 ID<152인 결과를 읽고 record+4의 bit0·record+5의 bit0을 두 팀 승수로 각각 센다. 어느 팀이 목표 승수 이상이 되거나 결과 수를 소진하면 표시 집계를 멈춘다. 결과 개수가 10을 넘으면 스크롤 UI를 준비하고, 복귀 UI는 한 줄씩 이동하며 최대 시작 위치는 count−10이다. mgmet @0x7100078e70/@0x7100085900 [callers]. [미확정] C에서 result getter의 index 인자가 빠졌으므로 기록 순회·원본의 실제 경기 종료는 main @0x71001f3b8c 및 mgm04 @0x7100015f70/@0x7100015c88 [fnMain]·[fn04]가 필요하다.

[판독] 태그 복귀 연출은 각 팀 승수==목표를 승리 모션/이름 선택에 사용한다. 로컬에서 승리 팀의 상대 승수가0이면 업적 ID0x45를 두 팀원에게 요청한다. 결과 UI 후 로컬 분기에서 WinContinuousCount·WinCount 보상 카운터를 호출하고 MGMRewardUiFlow → BGM 정지 → FadeOutWait 순서로 진행한다. mgmet @0x71000818e0 [callers]. [미확정] 카운터·보상량은 @0x71000864a0/@0x71000866fc [fnH] C가 없어 보류한다. UI의 >= 집계와 복귀 연출의 == 비교를 실제 모드 종료 비교로 합치지 않는다.

## 4. 구조체·필드·상수

| 항목 | 확인값 | 근거·범위 |
|---|---|---|
| [판독] ConfigInfo 48B | +0x00/0x04 Experience·+0x08/0x0c Explain·+0x10/0x14 CPU·+0x18/0x1c Star·+0x20/0x24 Round·+0x28/0x2c VS; display/index s32쌍 | mgmet `SetupMgm` @0x710007d974·`GetResult` @0x710007e410 [규칙 §4.2](mgmet_ruleconfig.md#42-configinfo-48바이트) |
| [판독: 어셈블리] Round/Star 숫자 | Round index0/1/2→5/7/10 @0x71000e37c0; Star→3/5/10 @0x71000e37cc | mgmet @0x710007efdc/@0x710007f338 [규칙 §4.3](mgmet_ruleconfig.md#43-값-표와-버튼-전-함수군); 저장은 index |
| [판독] flag4/flag6 | flag4는 설명 index==0·flag6는 체감의 최종 index==0. 모드별 강제false는 §3.2 | mgmet @0x7100054640/@0x7100057b00/@0x71000638a0/@0x710005f5e0 [callers] |
| [판독] 규칙 캐시 | Work+0x764 valid·+0x768 CPU·+0x76c VS·+0x770 Star·+0x774 Round·+0x778 Explain·+0x77c Experience | main `MgmetGetRuleSettingData` @0x71001f0ea4 [규칙 §8.1](mgmet_ruleconfig.md#81-worksync-캐시의-실제-오프셋); 공용 수명은 범위 밖 |
| [판독] MinigameModeWork 결과 ring | Round+0·결과+0xc·100칸×0xc·ID/judge/raw byte4; SetMinigameResult 자체는 Round를 증가시키지 않음 | main @0x71001f0460/@0x71001f0440/@0x71001f2a80 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring)·[공용 소유권 §4.3](../engine/18_scene_work.md#43-gameworkminigamemodeworksyncminigamework) |
| [데이터] GameRule 최신 대응 | VS4=0·2VS2=1·1VS3=2·1VS1=3·Chara=7·Item=8·Boss=9·Rhythm=10·Busters=11·Athlon=12·AthlonSP=13 | main의 `main.decomp.bin`에 기재된 offset 0x19d8390~0x19d8740 [한 판 §12.1](minigame_scene.md#121-추가-판독-구현에-필요해서-이번에-읽은-것); 구 문서의 Chara8/Athlon13 추정을 대입하지 않음 |
| [데이터] MGList JSON 필드 | `Name/GameRule/Available/Coin/Gyro/BD01Normal/BD01Serious` | [ND]·[CA] `mgList[]`; 파일 행의 데이터이며 런타임 숫자 ID는 부여하지 않음 |
| [미확정] 모드 고유 Work | mgm02 TotalCoinCount/MgResult/LeviedCoinCount/PlayedMgIds·mgm04 TeamVitoryCount/TargetVictoryCount/MGIDHistory | main @0x71001f3120/@0x71001f3370/@0x71001f3470/@0x71001f35d0/@0x71001f396c/@0x71001f3974 [fnMain]; 해당 C가 없어 필드 오프셋·연산은 보류 |

[판독] 승·패·무는 1/0/2다. 프리 플레이의 history 승점은 raw byte와 `(judge!=0)` 비교이며 코인 수·게임 rank·MVP 점수의 대체물이 아니다. main @0x71002f0ba0/@0x71002f4840/@0x71002f4a30 [결과 §6.1](minigame_result.md#61-패턴-고르기-fun_71002ee230), @0x71001f2a80 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring).

### 4.1 후속 판독: 모드 결과·팩 reader 필드

| 객체/필드 [판독] | 확인한 reader·크기 | 제한·출처 |
|---|---|---|
| 데일리 로드 레코드 | mgpack 입력 stride0x5c → 런타임 레코드0x68. MGList::GetMinigameID로 이름3개를 해석해 추가 ID3개를 저장 | main @0x7100361e00 [DAILY-C]. 숫자 ID 값/매핑은 기록하지 않음 |
| 데일리 조합 | packcombo 입력·런타임 값은 s32×3, 0xc. 로더는 mgpack/packcombo 파싱 둘 다 성공해야 진행 | main @0x7100361e00 [DAILY-C]; 파서 @0x7100362300/@0x71003624e0 [fnMain] C 없음 |
| 팩 저장 목록 | Scene+0x110/0x118 begin/end, 조합 목록+0x128/0x130. 각 목록의 smart pointer 항목 stride0x10 | main @0x7100362860/@0x7100362bcc [DAILY-C]. 공용 SceneBase/Work 수명 해석은 [18 §4·5](../engine/18_scene_work.md#5-상태수명) 재사용 |
| 챌린지 결과 reader | Mgm02GetMgResult 반환 record[0]은 thumbnail ID로 사용. record[5+Order]의 s32를 표시용으로 읽음 | mgmet @0x7100066610 [callers]; main getter @0x71001f32cc [fnMain] C 없음. 전체 record 구조·코인 writer 의미는 미확정 |
| 태그 결과 reader | ID s32 @+0, 두 팀 집계용 bit0 @+4/+5. TeamData reader는 팀당 stride0xc, 팀원 Order는 +4/+8 | mgmet @0x7100078e70/@0x71000818e0 [callers]. getter 반환 영역의 관찰이며 Work 물리 offset을 부여하지 않음 |

## 5. 상태·수명

| 흐름 | 판독 가능한 경계 | 본체에서 미확정인 경계 |
|---|---|---|
| [판독] 규칙 시작/취소 | Rule In→Update 루프→Out/GetResult→cache write. §3.2의 mgmet 7주소 [callers] | [미확정] 최종 Work 값 인자·각 모드 SyncedSetup 소비 |
| [판독] 설명 다시 보기 | Rule Out→`HowToPlayFlow(mode,0,1,1)`→Rule In; 버튼 값 재생성 없음. mgmet @0x7100057b00/@0x71000638a0 [callers] | [미확정] 활동 UI/3D 완료시간 |
| [판독] 체감 확인 | 시작 결과1에서 index0이면 Confirm; 돌아오기2면 UI 복원. mgmet @0x7100054640/@0x71000633c0/@0x710005f5e0 [callers] | [미확정] 모드 시작 이후 체감 후보 제거 순서 |
| [데이터] mgm02 계속/최종 | `GetMaxRound` @0x7100017008·`ResultFlow` @0x7100018300 [fn02] 존재 | [미확정] Round의 전/후 증가·최종 결과가 포함하는 보너스 회차 |
| [데이터] mgm04 계속/최종 | `UpdateMgmWork` @0x7100015c88·`ResultFlow_Cut02` @0x7100016390 [fn04] 존재 | [미확정] 목표 승수 비교·무승부에서 진행/종료 |
| [데이터] mgm06 실패/완주 | `IsBossMinigameDefeated` @0x7100011ed0·`RewardFlow` @0x7100011750 [fn06] 존재 | [미확정] 실패 시 저장·완주 판정·MVP 평가 |

[설계] 원본 Fiber의 Wait 위치를 보존하는 상태기계를 사용한다. 한 틱마다 In/메시지 시작을 반복하지 않는다. 한 판 결과의 commit 성공 뒤 모드 누적 상태를 갱신하고 실패/null은 누적하지 않는 계약은 [한 판 §12.12.4](minigame_scene.md#12124-결과-갈래와-기록-계약)과 [DESIGN §10.5][design]를 따른다. main ring writer 경계 @0x71001f0460이며 실제 종료 caller 미확정은 그대로 유지한다.

## 6. 계산식·의사코드

### 6.1 확인된 추첨·난수와 확인되지 않은 부분

| 대상 | 후보·가중치·중복·형태 | 난수 소비·근거 |
|---|---|---|
| [판독: 어셈블리] mgm01 수동 랜덤 | 현재 필터의 unlocked 후보. 0개이면−1·균등 index 선택. 이 두 함수에 중복 방지 필터는 없음 | `SyncRandRange(0,N)`; mgm01 @0x71000165bc/@0x710001b480 [프리 플레이 §6.3](mgm01_freeplay.md#63-끝-행과-래핑랜덤) |
| [판독] mgm01 연속 후보 구성 | unlocked MgAll/현재 필터·flag6 off면 UseGyro 제거·사람>1 그리고 filter0이면 TeamOrderData+4==3 제거·현재 ID 제거 | mgm01 @0x710001c2a0/@0x7100020b10/@0x7100020b74/@0x710001c8b0 [프리 플레이 §8.3](mgm01_freeplay.md#83-미니게임-호출복귀-계약). 선택 RNG 순서와 구분 |
| [미확정] mgm02 | Scene `LotteryNextMg` @0x7100017408·MgMgr 동명 @0x710000f030·`GetMgType` @0x710000efe0·5/7/10회차 타입 표가 존재 | [fn02] 심볼만. 가중치·PlayedMgIds 초기화/회피·형태 선택·RNG 호출 종류/횟수 모두 C 요청 |
| [미확정] mgm03 | [PACK] 명시 49게임·25×3 슬롯. 실제 날짜→팩/조합 선택은 별도 | mgmet `Dailytrial_UpdateDailyData` @0x7100056e10·`Mgm03GamePackFlow` @0x7100056f40 [fnH]; mgm03 @0x710000a440 [fn03] C 요청 |
| [미확정] mgm04 | 2vs2는 안내로 확인·MGIDHistory API 존재. 12종 모두 사용·후행 팀 선택·중복 해제는 보류 | mgm04 @0x7100018060 [fn04]·main @0x71001f3be0/@0x71001f3d50 [fnMain] C 요청 |
| [미확정] mgm05 | [SURV] 26종＝VS4 21＋1VS1 5. 투표·룰렛 심볼 존재 | mgm05 @0x710000fb40/@0x71000154f0/@0x7100017bf0/@0x7100018690 [fn05]; 가중치/동표·중복·듀얼 조건 C 요청 |
| [미확정] mgm06 | [ND] Boss 5종 후보. 실제 순서/무작위 여부는 미확정 | mgm06 @0x7100011610 [fn06] C 요청. 연전이 곧 무작위라는 가정 금지 |
| [미확정] 보드 | [ND] BD01Normal/Serious 허용은 데이터. 인원 형태·배틀/듀얼·이력 정책은 별도 | bd01 `MgMgr::GetList` @0x71000afb90·`GetPlayID_` @0x71000b09f0·`SetHistoryID` @0x71000b1228·`MgCall::GetMinigameList` @0x710028cb00 [fnBD] C 요청 |

[판독: 어셈블리] 난수 엔진은 MT19937. sync 정수 분포는 n<2이면 소비0·그 외 `floor(u32*n/2^32)`로 출력1개를 소비한다. async 정수 분포는 기각 재추첨 때문에 소비 수가 달라진다. 원본 장면마다 seed 설정은 main @0x71001c94cc→@0x7100189438. 기존 [코어 §6.6·6.7](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행)을 인용하며 이번에 알고리즘 C를 다시 읽지 않았다.

[설계] 아래 식은 이식 부분집합의 추천 추첨 근사다. 원본 mgm02/보드 판독으로 확정된 식이 아니다. 근거가 된 원본 경계는 mgm02 @0x7100017408 [fn02]·mgm01 @0x71000165bc [프리 플레이 §6.3](mgm01_freeplay.md#63-끝-행과-래핑랜덤)·난수 분포는 main @0x7100189438 [코어 §6.6](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행).

```text
pool = 원본 허용 집합 ∩ 등록 게임 ∩ 완성된 입력/팀/결과 지원 ∩ 현재 규칙
if pool is empty: 시작 불가(기록/라운드/난수 소비 없음)
remaining = pool - 이번 순환에서 사용한 게임
if remaining is empty: 사용 이력 비우기; remaining = pool
if len(pool)>1 && len(remaining)>1: 직전게임을 remaining에서 제거
ordered = 원본 데이터 순서로 remaining 정렬
index = injectedSyncRandRange(0, len(ordered))
선택 = ordered[index]       # len=1이면 RNG 소비 0; 그 외1
```

[설계] 이 추천 근사는 작은 집합을 모두 소진하면 새 순환을 시작하고, 가능한 때 경계의 연속 중복도 피한다. 타입별로 먼저 뽑으면 빈 타입 재추첨과 가중치 재분배가 생기므로 원본 타입 표가 없는 상태에서는 게임 단위 균등을 명시한다. seed가 같아도 후보 집합·순서·호출 수가 달라 원본 추첨열과 같다고 주장하지 않는다. 원본 미확정 대상은 §6.1·부록C; 기준 난수는 [코어 §6.6](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행), main @0x7100189438.

[미확정] 원본 누적식 `totalCoin[p] += ?`·징수/배틀 분배·스타 동점 승리·실력 포인트 증감·MVP 기여점은 본체 C가 없어 기입하지 않았다. mgm02 `SetMgResult` @0x710001704c·mgm03 `ResultMinigameFlow` @0x710000b3a0·mgm04 `UpdateMgmWork` @0x7100015c88·mgm05 `MinigameModeFlow_AfterGame` @0x710000c210·mgm06 `VictoryFlow::MainFlow` @0x710001e5e0 [fn02]·[fn03]·[fn04]·[fn05]·[fn06]가 요청 대상이다.

### 6.2 후속 판독: 데일리 조합·시간

[데이터] [PACK]의 mgpack[].packid는 행 순서대로1~25이고 packcombo는 40행이다. packid1/packid2/packid3은 모두1~25이며 각 행의 3팩은 서로 다르다. 40조합 모두 고유하다. 기존 25팩·75슬롯·49게임 집계는 그대로다. 조합은 게임3개의 배열과 다른 층이다.

[판독] GetMgPackDailyTrialData(id)는 목록이 비어 있으면 Abort, 1<=id<=count이면 id−1 항목, 그 밖은 첫 항목을 반환한다. GetComboIndexFromNowDateTimeDailyTrialData는 FUN_71003628bc가 반환한 정수를 조합 수로 정규화한다. 이 호출에서 관찰되는 식은 n>0이면 ((day % n)+n)%n, n==0이면0이다. main @0x7100362860/@0x7100362bcc [DAILY-C]. [미확정] day의 기준·증가·clock 선택은 helper @0x71003628bc [fnMain] C가 없어 확정하지 않았다.

[판독] 남은 시간 reader는 UserSystemClock을 읽고 bool==true이면 NetworkSystemClock으로 다시 읽는다. CalendarTime 상수 {0x07b2,0x00060101,0}을 ToPosixTimeFromUtc에 전달하고 0x15180=86400초 주기로 시·분·초를 계산한다. 일반 범위에서 기준과 시각의 차이를 δ라 하면 r=positiveModulo(δ,86400), s=86400−r이며, hour=(s//3600)%24·minute=(s//60)%60·second=s%60이다. r==0일 때 반환은00:00:00이다. main @0x7100362a10 [DAILY-C]. [미확정] 매우 큰 시각 차이의 보정 분기·CalendarTime 필드 배치·실제 날짜 변경 caller는 부록 C에 남는다.

[추정] CalendarTime의 일반적인 field 순서를 적용하면 위 상수는 1970-01-01 06:00 UTC에 대응한다. 현재 C에는 field별 명칭이 없으므로 정확한 교체 시각의 구현 기본값으로 승인하지 않는다. main @0x7100362a10 [DAILY-C], 날짜 계산 callee @0x71003628bc [fnMain].

### 6.3 후속 판독: 결과 집계의 범위

[판독] 태그 결과 표시의 승수는 각 결과 byte의 bit0 누적이다. 원본 WinLose1/0/2 규칙을 이 전용 레코드의 전체 형식으로 단정하지 않는다. 결과 생성 함수의 C가 없기 때문이다. 아래는 reader에서 확인한 비교만 재현하는 의사코드다. mgmet @0x7100078e70 [callers]; main Mgm04AddMGResult @0x71001f39e0 [fnMain].

```text
[판독] 승수 = [0, 0]; 표시개수 = 0
[판독] 선택된 결과를 읽음       // getter의 index 인자는 미확정
[판독] ID >= 152이면 표시 집계 종료
[판독] 승수[0] += (byte_at_4 & 1) != 0
[판독] 승수[1] += (byte_at_5 & 1) != 0
[판독] 표시개수 += 1
[판독] 승수[0] >= 목표 또는 승수[1] >= 목표이면 표시 집계 종료
[판독] 표시개수 >= 결과개수이면 표시 집계 종료
```

[미확정] mgm02 CoinMgr의 GetRankCoinCount·AdjustBattleMgCoinCount·LevyCoin·GetBonusMgGotCoinCount·GetDistributedCoinCountRatio는 실제 원본 산식 후보다. SceneParamsGame의 RankCoinCount·BonusMgCoinCountCoef·BattleMgLeviedCoinCount가 상수 소비 후보지만 C가 없어 수치/반올림/부족 코인/승자 없음/동점 배분을 복원하지 않는다. 정확한 mgm02 주소와 이유는 부록 C의 추가 15행 [fn02]에 있다. 결과 UI의 TotalCoinCount reader를 지급 산식으로 대신하지 않는다.

## 7. 애니·효과·소리·카메라·에셋

| 범위 | 확인한 연결 | 제한·출처 |
|---|---|---|
| [데이터] 모드 레이아웃 | [mgm02](../../../extracted/bea/mgm~mgm02.nx.bea/mgm/mgm02/layout.lyt)·[mgm03](../../../extracted/bea/mgm~mgm03.nx.bea/mgm/mgm03/layout.lyt)·[mgm04](../../../extracted/bea/mgm~mgm04.nx.bea/mgm/mgm04/layout.lyt)·[mgm05](../../../extracted/bea/mgm~mgm05.nx.bea/mgm/mgm05/layout.lyt)·[mgm06](../../../extracted/bea/mgm~mgm06.nx.bea/mgm/mgm06/layout.lyt) 파일 존재 | [미확정] 개별 pane·클립 frame·FX·BGM·카메라 키는 이번에 변환/추출하지 않음 |
| [판독] 규칙창/보조 UI | Rule In/Out·하이스코어·팩 COM·태그 정보·서바이벌 정보 | mgmet §3.2 7주소 [callers]; 실제 소유·애니 재생기의 공용 판독은 [규칙 §7](mgmet_ruleconfig.md#7-애니소리레이아웃메시지-연결) |
| [판독] 보스 복귀 대기 | `WaitDeltaFrameFlow(25.0/5.0)`·NPC `bd_fear_talk00`·메시지 종료 대기 | mgmet @0x7100052f00 [callers]. 함수 호출값만 확인; 초/클립 길이는 확정하지 않음 |
| [판독] mgm05 랭킹 버튼 소리 | Update 결과4→`SQ_SE_SYS_DECI_S`→`ShowRankingFlow(this,3)` | mgmet @0x710005f5e0 [callers]. 진동 이름 인자는 C에서 빠져 미확정 |
| [판독] mgm04 RM 랭킹 소리 | 연결 안 된 경우 결과4→`SQ_SE_SYS_CURSOR_S`→`ShowRankingFlow(this,2)` | mgmet @0x71000633c0 [callers]. 온라인 처리 전체 확인은 아님 |
| [판독] 한 판 결과와 모드 시상 | MGResult는 Rule/Mode/Team/Win/Lose/Draw 패턴을 고름; Coin 판정은 코인>0 | main @0x71002ee230/@0x71002f462c [결과 §6.1](minigame_result.md#61-패턴-고르기-fun_71002ee230). 모드 코인 집계/최종 시상과 분리 |
| [데이터] 모드 결과 문구 | mgm02 `mgm02_ui_resultCoins1`·mgm03 `mgm03_mgRes_tip_starGet`·mgm04 `mgm04_res_ui_stars`·mgm06 `mgm06_resWin_ui_totalScore` | [MSG-02]·[MSG-03]·[MSG-04]·[MSG-06]. 문구 존재로 계산값/타이밍 확정하지 않음 |

[설계] 웹은 `animationDone/cameraDone/resultDone`을 공용 서비스로 주입한다. 현재 미확정 애니 길이를 임의로 원본 값처럼 기록하지 않는다. 게임·결과 무대는 main `MinigameFlow` @0x71002e0500·`MGResult` @0x71002ee230 [한 판 §12.3](minigame_scene.md#123-게임-쪽이-구현할-인터페이스-mggame)·[결과 §12](minigame_result.md#12-웹-구현-계약--3d-결과-무대-2026-10-09-mg-result3d)를 재사용한다.

[판독] 태그 RM 복귀 UI는 최고점 갱신 flag를 읽어 PlayCount00만 진행하는 경로와 PlayCount00→01→조건부02 경로를 고른다. HostRanking−1<999999이면 순위 표시 연출이 추가된다. 갱신 경로에 WaitTimeFlow(0.75)와 SQ_SE_TLP_MGMET_HIGHSCORE가 있으며 애니 완료를 기다린다. mgmet @0x7100085900 [callers]. [미확정] 잘못된 HostRanking·각 클립 길이·온라인 랭킹/연승 값 산출은 확정하지 않았다.

## 8. 상호작용

### 8.1 모집단·인원 형태·체감

[데이터] catalog는 112종. ND/CA의 `mgList`는 84+38＝122행이며 `Available!=0`이 112행·catalog와 이름 집합이 정확히 같다. 나머지 10행은 `Available=0`: mg0120·pp01~04·mf01·mg1112/1114/1115·mg1411. 런타임 상한 152는 호출 검사 범위이며 122행/112종과 구분한다. 근거: [catalog] `code`·[ND]·[CA] `mgList[].Name/Available`; main `CallMinigameScene` @0x71003601ac [프리 플레이 §3.2](mgm01_freeplay.md#32-한-판-호출과-돌아온-뒤).

[데이터] 총수의 차이는 112종(사용 가능 mg####)/122행(비활성·Extra 포함)/152 ID슬롯(호출 상한)이다. 수를112로 맞추려고 비활성 행을 지우거나 합치지 않았다. 실제 추출 데이터의 숫자 ID 부여 순서는 기존 문서의 추정이므로 이번 표는 문자열 `Name`으로만 join했다. [ND]·[CA] `mgList`·[프리 플레이 §9.1·11](mgm01_freeplay.md#91-구현-계약--개별-설정필터장르-2026-10-07).

| GameRule·형태 [데이터] | 수 | 체감 | Coin | 팩 D | 서바이벌 S | 보드 N/H | 출처 |
|---|---:|---:|---:|---:|---:|---|---|
| `VS4` · 4인 대전 | 29 | 7 | 4 | 28 | 21 | 29/27 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `1VS3` · 1대3 | 12 | 2 | 2 | 9 | 0 | 12/11 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `2VS2` · 2대2 | 12 | 3 | 2 | 12 | 0 | 12/12 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `1VS1` · 듀얼 | 5 | 1 | 0 | 0 | 5 | 5/5 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `Chara` · 챌린지 계열 | 10 | 1 | 0 | 0 | 0 | 10/10 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `Item` · 아이템 계열 | 5 | 1 | 0 | 0 | 0 | 5/5 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `Boss` · 보스 계열 | 5 | 0 | 0 | 0 | 0 | 5/5 | [ND] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `Athlon` · 쿠파 애슬론 계열 | 9 | 0 | 0 | 0 | 0 | 0/0 | [CA] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `AthlonSP` · 애슬론 특수 계열 | 5 | 0 | 0 | 0 | 0 | 0/0 | [CA] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `Busters` · 쿠파 버스터즈 계열 | 10 | 0 | 0 | 0 | 0 | 0/0 | [CA] `mgList[].GameRule/Gyro/Coin/BD01*` |
| `Rhythm` · 리듬 쿠킹 계열 | 10 | 10 | 0 | 0 | 0 | 0/0 | [CA] `mgList[].GameRule/Gyro/Coin/BD01*` |

[데이터] `Gyro!=-1`은25종 = 0형 7+1형 10+2형 8·없음 87종. 프리 플레이 `MgGyro>0`은 15종이며 Rhythm 10종은 별도 `MgRhythm` 필터다. `GyroType` 숫자별 장치/축 의미는 여기서 확정하지 않는다. [ND]·[CA] `mgList[].Gyro`·[FP] `gamedata[].MgGyro/MgRhythm`; main `UseGyro` @0x71001e1744·`GetGyroType` @0x71001e1778 [입력 §6.4](../engine/05_ui_input.md#64-미니게임별-조작-데이터-데이터--판독).

[데이터] `Battle`은 catalog/MGList의 별도 GameRule 값이 아니다. `Coin=1`은 8종(mg0701~06·mg0801~02)이고 VS4/1VS3/2VS2에 겹친다. `Chara`10종은 프리 플레이의 챌린지 필터와 연결된다. [ND] `mgList[].GameRule/Coin`·[FP] `gamedata[].MgChallenge`. [판독] MGResult의 `Battle` 명칭은 ID 0x77의 PataPata 결과 갈래이므로 112종에 더하지 않는다. main @0x71002f4758 [결과 §6.1](minigame_result.md#61-패턴-고르기-fun_71002ee230).

### 8.2 모드별 사용 근거

| 사용 표 | 확정 집합/후보 | 런타임 범위의 제한 |
|---|---|---|
| [데이터] 프리 플레이 F | [FP] `gamedata[].MgName`112종·[catalog]과 동집합 | [판독] 잠금·솔로·오프라인 조건은 mgm01 @0x7100008e70 [프리 플레이 §6.4](mgm01_freeplay.md#64-잠금new-조건-표) |
| [데이터] 데일리 팩 D | [PACK] `mgpack[].mg1~mg3`75슬롯·unique49종＝VS4 28＋1VS3 9＋2VS2 12 | [미확정] 매일 선택되는 팩·교체 시각·각 슬롯 팀 방식: mgmet @0x7100056e10/@0x7100056f40 [fnH] |
| [데이터] 서바이벌 S | [SURV] `mgList[].mg`26종＝VS4 21＋1VS1 5 | [미확정] 인원/체감별 서브셋·VS4→듀얼 트리거: mgm05 @0x710000fb40/@0x710000c210 [fn05] |
| [데이터] 보드 N/H | [ND]·[CA] `BD01Normal=1`78·`BD01Serious=1`75 | [미확정] 유형/매스별 실제 추첨. 보드 일반만 허용 3종＝mg0110/mg0121/mg0303; bd01 @0x71000afb90 [fnBD] |
| [추정] mgm02 C? | [ND] `GameRule=Chara`10종을 후보로 표시 | [미확정] 보너스/배틀을 포함한 전체 후보·회차별 배분. mgm02 @0x710000f030/@0x7100017408 [fn02] |
| [추정] mgm04 T? | [ND] `GameRule=2VS2`12종을 후보로 표시. 2vs2 동작은 [MSG-H] `mgmet_tm_mw_howToPlay00` | [미확정] 12종 모두 사용·체감 제외·중복. mgm04 @0x7100018060 [fn04] |
| [추정] mgm06 B? | [ND] `GameRule=Boss`5종을 후보로 표시. [MSG-H] `mgmet_bm_mw_howToPlay00` | [미확정] 실제 5연전·순서. mgm06 @0x7100011610 [fn06] |

### 8.3 catalog 112종 대응 표

[데이터] 아래 모든 이름은 [catalog] `code/name_ko`·규칙·체감·코인은 출처열의 [ND]/[CA] `mgList[Name=code].GameRule/Gyro/Coin`이다. F/D/S/N/H는 §8.2의 **정적 데이터 소속**이며 실제 추첨 허용과 다르다. `—`는 해당 정적 표/flag에 없음. [추정] C?/T?/B?는 §8.2의 미확정 후보 표시이며 사용 확정이 아니다.

| 코드·한국어 이름 [데이터] | GameRule | Gyro | Coin | 정적 사용 F/D/S/N/H | 미확정 후보 [추정] | 필드 출처 |
|---|---|---|---:|---|---|---|
| [`mg0101` · 데인저러스 브리지][catalog] | `VS4` | — | 0 | F·D·N·H | — | [ND] `Name=mg0101` |
| [`mg0102` · 우주 깃발 레이스][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0102` |
| [`mg0103` · 키노피오 서커스][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0103` |
| [`mg0104` · 힘을 모아 두드려라! DIY][catalog] | `VS4` | 0 | 0 | F·D·S·N·H | — | [ND] `Name=mg0104` |
| [`mg0106` · 찌릿찌릿 회전목마][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0106` |
| [`mg0107` · 피해라! 샌드위치][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0107` |
| [`mg0108` · 라이트 웨이브 배틀][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0108` |
| [`mg0109` · 전격 우주선][catalog] | `VS4` | 2 | 0 | F·D·N·H | — | [ND] `Name=mg0109` |
| [`mg0110` · 이 열쇠가 네 열쇠냐][catalog] | `VS4` | — | 0 | F·N | — | [ND] `Name=mg0110` |
| [`mg0111` · 개미병 트램펄린][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0111` |
| [`mg0112` · 아슬아슬 펭군][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0112` |
| [`mg0113` · 후름의 바람 버티기][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0113` |
| [`mg0114` · 파고 또 파고 터널 레이스][catalog] | `VS4` | 0 | 0 | F·D·S·N·H | — | [ND] `Name=mg0114` |
| [`mg0115` · 뽀꾸뽀꾸와 징오징오][catalog] | `VS4` | 2 | 0 | F·D·S·N·H | — | [ND] `Name=mg0115` |
| [`mg0116` · 틀린 쿵쿵 찾기][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0116` |
| [`mg0117` · 밝혀라! 일루미네이션][catalog] | `VS4` | 0 | 0 | F·D·S·N·H | — | [ND] `Name=mg0117` |
| [`mg0118` · 미니미니 트라이애슬론][catalog] | `VS4` | 2 | 0 | F·D·S·N·H | — | [ND] `Name=mg0118` |
| [`mg0119` · 기울이기 골프][catalog] | `VS4` | 2 | 0 | F·D·S·N·H | — | [ND] `Name=mg0119` |
| [`mg0121` · 선택! 블록 로드][catalog] | `VS4` | — | 0 | F·D·S·N | — | [ND] `Name=mg0121` |
| [`mg0122` · 다 함께 찰칵][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0122` |
| [`mg0123` · 짜자용 패닉][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0123` |
| [`mg0201` · 알록달록 스탬프][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0201` |
| [`mg0202` · 도망쳐! 데굴데굴바위][catalog] | `VS4` | — | 0 | F·D·N·H | — | [ND] `Name=mg0202` |
| [`mg0203` · 꽈당꽈당 도미노][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0203` |
| [`mg0204` · 자유 자유투!][catalog] | `VS4` | — | 0 | F·D·S·N·H | — | [ND] `Name=mg0204` |
| [`mg0301` · 클러셔 로봇을 피해 도망쳐라][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0301` |
| [`mg0303` · 직감 두더지 잡기][catalog] | `1VS3` | — | 0 | F·N | — | [ND] `Name=mg0303` |
| [`mg0304` · 대결! 킬러 머신][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0304` |
| [`mg0305` · 온 오프 데구르][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0305` |
| [`mg0306` · 뾰족뾰족 플레이트 배틀][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0306` |
| [`mg0307` · 철창으로 캐치][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0307` |
| [`mg0308` · 서둘러라! 쿠키 찍어 내기][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0308` |
| [`mg0309` · 잘 노려라! 활 사격][catalog] | `1VS3` | 2 | 0 | F·D·N·H | — | [ND] `Name=mg0309` |
| [`mg0401` · 캡슐 공장][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0401` |
| [`mg0402` · 대결! 눈싸움][catalog] | `1VS3` | — | 0 | F·D·N·H | — | [ND] `Name=mg0402` |
| [`mg0501` · 과일 컨베이어][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0501` |
| [`mg0502` · 가로세로 머신 레이스][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0502` |
| [`mg0503` · 휘적휘적 팔씨름][catalog] | `2VS2` | 0 | 0 | F·D·N·H | T? | [ND] `Name=mg0503` |
| [`mg0504` · 위험한 스윙 레이스][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0504` |
| [`mg0505` · 둘이서 카드 맞추기][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0505` |
| [`mg0508` · 거대 스테이크 자르기][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0508` |
| [`mg0509` · 돗시 보트 레이스][catalog] | `2VS2` | 2 | 0 | F·D·N·H | T? | [ND] `Name=mg0509` |
| [`mg0510` · 그림자 그림 겹치기][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0510` |
| [`mg0601` · 폭탄병 도화선][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0601` |
| [`mg0602` · 서둘러라! 킬러 건너기][catalog] | `2VS2` | — | 0 | F·D·N·H | T? | [ND] `Name=mg0602` |
| [`mg0701` · 코인 유적의 눈치 싸움][catalog] | `2VS2` | — | 1 | F·D·N·H | T? | [ND] `Name=mg0701` |
| [`mg0702` · 숲의 코인 시소][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0702` |
| [`mg0703` · 플레시의 코인 강][catalog] | `1VS3` | 2 | 1 | F·N·H | — | [ND] `Name=mg0703` |
| [`mg0704` · 스케이트 코인 모으기][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0704` |
| [`mg0705` · 밧줄로 코인 얻기][catalog] | `2VS2` | 0 | 1 | F·D·N·H | T? | [ND] `Name=mg0705` |
| [`mg0706` · 뿅망치로 코인 빼앗기][catalog] | `1VS3` | — | 1 | F·N·H | — | [ND] `Name=mg0706` |
| [`mg0801` · 맨몸 잠수 마리오][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0801` |
| [`mg0802` · 플레이트 건너기][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0802` |
| [`mg0903` · 쿠파주니어의 연속 챌린지][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0903` |
| [`mg0905` · 루이지와 수수께끼의 저택][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0905` |
| [`mg0906` · 로젤리나의 스노보드 레이스][catalog] | `Chara` | 0 | 0 | F·N·H | C? | [ND] `Name=mg0906` |
| [`mg0907` · DK의 그루브 콩가][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0907` |
| [`mg0908` · 데이지 애슬레틱][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0908` |
| [`mg0909` · 피치의 휴일][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0909` |
| [`mg0910` · 마리오의 미니게임 메들리][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0910` |
| [`mg0911` · 와루이지 핀볼][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0911` |
| [`mg0912` · 요시의 산길 레이스][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0912` |
| [`mg0913` · 와리오의 퀴즈 쇼][catalog] | `Chara` | — | 0 | F·N·H | C? | [ND] `Name=mg0913` |
| [`mg1001` · 아이템 컬링][catalog] | `Item` | — | 0 | F·N·H | — | [ND] `Name=mg1001` |
| [`mg1002` · 아이템 구슬 굴리기][catalog] | `Item` | 2 | 0 | F·N·H | — | [ND] `Name=mg1002` |
| [`mg1003` · 아이템 메달 떨어뜨리기][catalog] | `Item` | — | 0 | F·N·H | — | [ND] `Name=mg1003` |
| [`mg1004` · 아이템 페어 카드][catalog] | `Item` | — | 0 | F·N·H | — | [ND] `Name=mg1004` |
| [`mg1005` · 아이템 사다리 룰렛][catalog] | `Item` | — | 0 | F·N·H | — | [ND] `Name=mg1005` |
| [`mg1105` · 두드려라! 메카쪼르뚜][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1105` |
| [`mg1106` · 퍼즐 조각 나열하기][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1106` |
| [`mg1108` · 모래 가봉 유적][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1108` |
| [`mg1109` · 블록 크래시][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1109` |
| [`mg1111` · 갓 구워 낸! 고소한 빵집!][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1111` |
| [`mg1116` · 하이퍼 하이웨이][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1116` |
| [`mg1117` · 떨어뜨려라! 인형!][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1117` |
| [`mg1118` · 하늘을 누비는 대포][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1118` |
| [`mg1120` · 어느 쪽이 많을까?][catalog] | `Athlon` | — | 0 | F | — | [CA] `Name=mg1120` |
| [`mg1301` · 불덩이 서바이벌][catalog] | `AthlonSP` | — | 0 | F | — | [CA] `Name=mg1301` |
| [`mg1302` · 킬러 서바이벌][catalog] | `AthlonSP` | — | 0 | F | — | [CA] `Name=mg1302` |
| [`mg1303` · 쇠구슬 서바이벌][catalog] | `AthlonSP` | — | 0 | F | — | [CA] `Name=mg1303` |
| [`mg1304` · 선택 서바이벌][catalog] | `AthlonSP` | — | 0 | F | — | [CA] `Name=mg1304` |
| [`mg1305` · 드롭 서바이벌][catalog] | `AthlonSP` | — | 0 | F | — | [CA] `Name=mg1305` |
| [`mg1401` · 그림을 맞춰라][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1401` |
| [`mg1402` · 여기? 저기? 어디?][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1402` |
| [`mg1403` · 꽃충이와 발맞춰 레이스][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1403` |
| [`mg1404` · 사과 주스를 만들자][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1404` |
| [`mg1405` · 문을 지켜라!][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1405` |
| [`mg1406` · 카드 순서 바꾸기][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1406` |
| [`mg1407` · 릴레이 토스 스파이크][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1407` |
| [`mg1408` · 멍멍이 목욕 시간][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1408` |
| [`mg1412` · 대포 빙고][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1412` |
| [`mg1414` · 다 함께 퍼즐][catalog] | `Busters` | — | 0 | F | — | [CA] `Name=mg1414` |
| [`mg1601` · 순간 낚시][catalog] | `1VS1` | 0 | 0 | F·S·N·H | — | [ND] `Name=mg1601` |
| [`mg1602` · 따귀 머신 대결][catalog] | `1VS1` | — | 0 | F·S·N·H | — | [ND] `Name=mg1602` |
| [`mg1604` · 구슬 레이스][catalog] | `1VS1` | — | 0 | F·S·N·H | — | [ND] `Name=mg1604` |
| [`mg1605` · 곰실이리프트][catalog] | `1VS1` | — | 0 | F·S·N·H | — | [ND] `Name=mg1605` |
| [`mg1607` · 얼바위 볼링][catalog] | `1VS1` | — | 0 | F·S·N·H | — | [ND] `Name=mg1607` |
| [`mg1701` · 케이케이왕의 전격 퍼즐 배틀][catalog] | `Boss` | — | 0 | F·N·H | B? | [ND] `Name=mg1701` |
| [`mg1702` · 거대뚜의 대포 배틀][catalog] | `Boss` | — | 0 | F·N·H | B? | [ND] `Name=mg1702` |
| [`mg1703` · 용돌이의 수상 등껍질 배틀][catalog] | `Boss` | — | 0 | F·N·H | B? | [ND] `Name=mg1703` |
| [`mg1704` · 쿠파의 제트 어택 배틀][catalog] | `Boss` | — | 0 | F·N·H | B? | [ND] `Name=mg1704` |
| [`mg1705` · 거대딱끔의 엉덩이 찍기 배틀][catalog] | `Boss` | — | 0 | F·N·H | B? | [ND] `Name=mg1705` |
| [`mg1801` · 싹둑싹둑 수프][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1801` |
| [`mg1802` · 반짝반짝 과일 파르페][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1802` |
| [`mg1803` · 쑥쑥 바비큐][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1803` |
| [`mg1804` · 휙휙 햄버거][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1804` |
| [`mg1805` · 착착 버터][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1805` |
| [`mg1806` · 따라 할래 포즈 카레][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1806` |
| [`mg1807` · 달그락달그락 휘핑크림][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1807` |
| [`mg1808` · 따끈따끈 팬케이크][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1808` |
| [`mg1809` · 꾹꾹 샌드위치][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1809` |
| [`mg1810` · 팍팍 야채샐러드][catalog] | `Rhythm` | 1 | 0 | F | — | [CA] `Name=mg1810` |

[판독] 참가자 구성이 GameRule별로 달라진다는 기존 계약은 main `FUN_71001f1e20` @0x71001f1e20·`FUN_71001f1930` @0x71001f1930·`Mgm01GetTeamOrderDataFromGameRule` @0x71001f1ac0 [프리 플레이 §8.3](mgm01_freeplay.md#83-미니게임-호출복귀-계약)을 따른다. [미확정] Chara/Boss/Item/Athlon등의 실제 동시 참가수는 Rule 이름만으로4인/1인이라 고정하지 않는다. 최신 Rule 숫자는 [한 판 §12.1](minigame_scene.md#121-추가-판독-구현에-필요해서-이번에-읽은-것)을 사용한다.

## 9. 웹 설계

### 9.1 원본 기본과 N회 변형

| 설계 선택 | 이유·차이·승인 상태 |
|---|---|
| [설계] 가장 가까운 기본 = mgm02 | [MSG-H] `mgmet_cmgb_mw_howToPlay00~02`의 코인 경쟁과 mgmet @0x7100054640 [C][callers]의 Round 열이 근거다. 5/7/10 규칙을 우선한다. 추첨·정산 C 확보 전에는 원본 재현 완료로 판정하지 않는다. |
| [설계] N턴 = 미니게임 N회 | 보드 이동·매스·아이템·스타 구매를 제외한 웹 변형이다. 원본 라운드와 보너스 회차의 관계는 mgm02 @0x7100017008/@0x7100018800/@0x7100018920 [fn02]에서 판독해야 한다. 사용자 미승인 추천. |
| [설계] 장르 확장 | Chara 후보를 전체 112종으로 넓히면 원본과 다른 파티다. mgm03의 49종 팩 및 mgm04의 2vs2 선취와도 구분한다. §8.2의 데이터와 mgm02 @0x710000f030 [fn02]이 비교 기준이다. 미승인 추천. |
| [설계] 이식 부분집합 추첨 | 원본 후보 ∩ 등록 ∩ 입력/팀/결과 지원 게임을 쓴다. §6.1의 균등 선택·순환 이력은 가중치 미확정에 대한 근사다. 미승인 추천. |
| [설계] 현재 등록 한계 | [registry] `GAMES=[mg1801Game]`은 Rhythm 1종이며 Chara 후보와 겹치는 게임은 0종이다. Chara를 기준으로 한 추천 부분집합은 비었다. 실제 원본 mgm02 전체 후보는 미확정이다. 리듬만의 N회 파티는 별도 변형이다. |
| [설계] 승패·코인·점수 분리 | raw byte/rank/coin/모드 누적값을 각각 보존한다. 판독 전 임의 rank 포인트를 원본 코인으로 부르지 않는다. main @0x71001f2a80 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring). |

### 9.2 폴더·경계·결정성

| 책임 [설계] | 위치·연결 | 근거 |
|---|---|---|
| 재사용 추첨·집계 코어 | `game/lib/<이름>` 코어는 import 0. 난수와 자료를 주입하며 `lib/<이름>-<엔진>`에 어댑터를 둔다. | [DESIGN §10.1~10.4][design] |
| 제품 서비스 | `app/common`에서 장면 요청·입력·소리·에셋·저장을 연결한다. 실제로 공유하는 기능만 올린다. | [DESIGN §10.2·10.3][design] |
| 진입 화면·모드 | 광장/항구는 `app/scene/world`의 각 단위, 설정은 `app/scene/menu`, mgm02~06은 `app/scene/mode/<단위>`, 시스템은 `app/scene/system`. 원본 모듈별 폴더 하나. | [DESIGN §10.1·10.2][design] |
| 게임·한 판·계열 | `app/minigame/{frame,kit,mg####}`. 모드는 ID로 장면을 요청한다. 모드/게임끼리 직접 import하지 않는다. | main @0x71003601ac [프리 플레이 §3.2](mgm01_freeplay.md#32-한-판-호출과-돌아온-뒤), [DESIGN §10.3·10.5][design] |
| Work 계약 | 모드는 자신의 규칙·라운드·누적 결과를 쓴다. 한 판 틀이 setup/result를 중개한다. 결과 backing은 work.mode.results 하나이며 work.game 노출은 readonly facade로 연결하는 미승인 추천이다. | [DESIGN §10.5][design]·[공용 계약 §9.3](../engine/18_scene_work.md#93-쓰기-권한), 원본 소유 main @0x71001f0460 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring) |
| 결정적 스텝 | 고정 1/60·주입 난수·FrameGate·원본 계산 단계별 f32. Math.random/벽시계로 규칙을 판정하지 않는다. | [DESIGN §3·10][design], [한 판 §12.12.6](minigame_scene.md#12126-결정성-규칙-2026-10-09-사용자-결정--게임-계약), main @0x7100189438 [코어 §6.6](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행) |
| 개발 분리 | seed·추첨 trace·비교 fixture는 `dev`. app은 dev를 호출하지 않는다. 이번 작업은 문서만 작성한다. | [DESIGN §10.1][design] |

## 10. 검증 기대값

| 검증 항목 | 정적 확인값·향후 기대값 | 근거 |
|---|---|---|
| [데이터] 이름 join | catalog 112, MGList 122, available 112, catalog 미대응 0, 중복 Name 0, FP와 동집합 | [catalog], [ND]·[CA] `mgList.Name/Available`, [FP] `gamedata.MgName` |
| [데이터] 형태 합계 | 29+12+12+5+10+5+5+9+5+10+10 = 112 | §8.1, [ND]·[CA] `GameRule` |
| [데이터] 체감·보드 | Gyro 25/없음 87, MgGyro 필터 15, BD 일반 78/고수 75, 일반 전용 3 | [ND]·[CA] `Gyro/BD01*`, [FP] `MgGyro` |
| [데이터] 팩·서바이벌 | 팩 25, 슬롯 75, 고유 게임 49, 팩 내부 같은 게임 중복 0, SURV 26, catalog 외 게임 0 | [PACK] `mgpack`, [SURV] `mgList` |
| [판독] 규칙 구성 | CPU가 없으면 mgm02는 라운드/설명/체감/Play, mgm03은 설명/Play, mgm04는 VS/스타/설명/체감/Play | mgmet @0x7100054640/@0x7100057b00/@0x71000638a0 [callers]; 열 순서는 [규칙 §6.1](mgmet_ruleconfig.md#61-입력반복반환값) |
| [판독: 어셈블리] 랜덤 소비 | sync 후보 0/1 → 소비 0, 2 이상 → 소비 1. async 기각 재추첨은 별도 | main @0x7100189438 [코어 §6.6](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행) |
| [설계] 부분집합 경계 | 빈 집합은 시작 차단. 1종은 같은 ID 반복·RNG 0. 2종 이상은 소진 전 중복 0. 같은 seed/후보 순서/입력이면 선택·소비 기록 일치 | §6.1 추천 의사코드이며 원본 기대값과 구분 |
| [설계] 라운드·실패 | N회 변형은 commit한 결과 N개에서 종료. null/실패/중단은 Round/점수 변경 없음. 원본 mgm02의 보너스 회수 포함은 미확정 | main @0x71001f0460 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring), [한 판 §12.12.4](minigame_scene.md#12124-결과-갈래와-기록-계약) |
| [설계] 문서 품질 | 13절+부록, 실제 상대 경로, CommonMark 링크, 모듈/주소 대조, LF·BOM 없음, 대상 MD만 변경 | 부록D 검증 기록 |

[데이터] 이번 검증은 메모리에서 catalog/지정 JSON을 집계하고 링크·주소·문서 형식을 검사한 것이다. 분석 스크립트·C·INDEX·SHARED·JSON·에셋은 만들거나 수정하지 않았다. 원본/웹 실행·영상 대조는 없다. 확인 결과는 부록D에 기입한다.

[설계] 후속 reader 검증 기대값은 아래와 같다. 원본 실행 검증값이 아니라 기존 C와 데이터에서 유도한 입력/출력 기대다. main @0x7100362860/@0x7100362a10/@0x7100362bcc [DAILY-C], mgmet @0x7100078e70 [callers].

| 항목 [설계] | 기대값 | 원본 근거 |
|---|---|---|
| 데일리 조합 | 40개의 고유 3팩 조합, ID1~25, 같은 조합 안 중복0 | [PACK] packcombo[].packid1~3·mgpack[].packid |
| 팩 getter | id1→첫 팩, id25→마지막, id0/26→첫 팩, 빈 목록→Abort | main @0x7100362860 [DAILY-C] |
| 조합 정규화 | helper 결과를 주입했을 때 −1→39, 0→0, 39→39, 40→0, 41→1 | main @0x7100362bcc [DAILY-C]; helper 실제 날짜 값은 미확정 |
| 시간 reader | 일반 범위 δ=−1→00:00:01, δ=0→00:00:00, δ=1→23:59:59 | main @0x7100362a10 [DAILY-C]; 기준의 field 해석·clock 호출 결과는 별도 |
| 태그 표시 집계 | target3, byte쌍 (1,0),(0,1),(1,0),(1,0),(0,1)이면 승수3/1·표시4개에서 종료 | mgmet @0x7100078e70 [callers]; 실제 경기 종료 동일성은 미확정 |
| 결과 UI 경계 | UI Setup/발표/스크롤만 호출해 코인·스타·rank writer를 대신하지 않음 | mgmet @0x7100066610/@0x710006c4e0/@0x7100085900 [callers] |

## 11. 미확정

| 번호 [미확정] | 남은 쟁점 | 필요한 자료 | 후속 판정 [설계] | 확인 범위·남은 차단 |
|---|---|---|---|---|
| U01 | mgm02 최대 Round와 보너스 회차 포함 | mgm02 @0x7100017008/@0x7100017728 [fn02]  남음 | 최대 Round·보너스 포함의 본체 C 없음. |
| U02 | mgm02 게임 집합·유형 표·가중치·중복 초기화·난수 순서 | mgm02 @0x710000ee3c/@0x710000f030/@0x7100017408/@0x710001b580 [fn02]  남음 | 유형 getter/property까지 주소를 좁힘; 가중치·중복·RNG 본체 C 없음. |
| U03 | mgm02 코인 배분·징수·배틀·동점 순위·최종 시상 | mgm02 @0x710001704c/@0x7100018300/@0x7100018920, main @0x71001f3120 [fn02]·[fnMain]  부분 해결 | §3.5·§4.1에서 결과 표시/발표 reader 확인. CoinMgr 8함수·상수 getter 주소 식별; 원본 지급·rank writer는 남음. |
| U04 | mgm03 날짜 변경·팩 조합/순서·팀/스타 동률·저장 보상 | mgmet @0x7100056e10/@0x7100056f40, mgm03 @0x710000a440/@0x710000b3a0 [fnH]·[fn03]  부분 해결 | §6.2에서 40조합·팩 fallback·시간 reader 확인. day helper·날짜 갱신/실제 선택·스타 Data writer는 남음. |
| U05 | mgm04 후보·선택권·이력·목표 승수 비교·무승부·RM | mgm04 @0x7100015c88/@0x7100018060/@0x710001aa90, main @0x71001f3be0 [fn04]·[fnMain]  부분 해결 | §3.5·§6.3에서 표시 승수·목표·스크롤·복귀 승리/보상 호출 확인. 실제 경기 종료·이력·RM 연승·보상량은 남음. |
| U06 | mgm05 인원/체감별 26종 소비·듀얼 이동·동표·룰렛·포인트 식 | mgm05 @0x710000fb40/@0x710000c210/@0x7100018690 [fn05]  부분 해결 | §3.4에서 항구 인원 설정/연결/설정/After 순서 확인. 런타임 추첨·인원 허용 수·포인트/듀얼은 남음. |
| U07 | mgm06 보스 수/순서·실패/완주·기여점·MVP 동률·보상 | mgm06 @0x7100011610/@0x7100011750/@0x710001e5e0 [fn06]  부분 해결 | §3.4에서 보스 설정 열·시작1/취소0·cache writer 확인. 실제 보스 수/순서·MVP·보상은 남음. |
| U08 | bd01 인원 형태 선택·가중치·이력·체감/고수 분기·RNG | bd01 @0x71000afb90/@0x71000b09f0/@0x71000b1228/@0x710028cb00 [fnBD]  남음 | 보드 MgMgr/MgCall 본체 C 없음. 최소 비교 요청은 부록 C.3. |
| U09 | caller C에서 빠진 setter 값·팀 표 값·Scene+0x3b0 writer | mgmet @0x71000638a0/@0x71000633c0/@0x71000628f0 [callers]. 호출 존재 이상으로 값을 확정하지 않음  부분 해결 | §3.4의 상위 caller로 byte0의 CPU 규칙 경로·그 밖 RM 경로를 확인. writer @0x710005a1a0와 빠진 setter 값·팀 표 값은 남음. |
| U10 | Name→숫자 ID 순서·Gyro 0/1/2의 장치/축 의미 | main @0x71001e14b0/@0x71001e15d4 [fnMain], @0x71001e1778 [입력 §6.4](../engine/05_ui_input.md#64-미니게임별-조작-데이터-데이터--판독)  남음 | Name→ID getter C 없음; Gyro 물리 의미는 공용 [19_motion_input](../engine/19_motion_input.md#11-미확정) 재사용. |
| U11 | 모드별 동시 참가수·체감 지원/길이·시상 연출 | 모드 SyncedSetup/본체 C, §7 layout, main @0x71002e0500 [한 판 §12.3](minigame_scene.md#123-게임-쪽이-구현할-인터페이스-mggame)  부분 해결 | §3.5·§7에서 태그 10행 결과/스크롤·RM 연출 경계 확인. 실제 동시 참가수·체감 지원·클립 길이는 남음. |
| U12 | 원본 실행·온라인 랭킹/저장 완료·실제 한 판 commit caller | 실행은 이번 범위 밖. main @0x71001f271c [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring). 공용 수명·실제 ring caller는 [18_scene_work §11 U08](../engine/18_scene_work.md#11-미확정) 재사용  남음 | 실행/온라인 외부 결과 확인은 수행하지 않음. 실제 commit caller·공용 수명은 18 갈래 참조 유지. |

[설계] 기존 U01~U12를 같은 범위로 추적했다. 해결0·부분 해결7·남음5이며, 부분 해결은 원본 모드 전체 구현 준비를 뜻하지 않는다. 표시 reader의 확인과 정산/종료 writer의 미확정을 구분한다. [§3.4·3.5](mgm_modes.md#34-후속-판독-설정-caller의-연결)·[§6.2·6.3](mgm_modes.md#62-후속-판독-데일리-조합시간).

## 12. 사용자 확인

| 추천 [설계] | 기본 제안 | 미승인 선택의 의미 |
|---|---|---|
| 원본 모드 | mgm02의 5/7/10·코인 규칙 우선 | 본체 판독 뒤 구현. §1·§3.2, mgmet @0x7100054640 [callers] |
| 임의 N | 완료한 미니게임 수로 정의 | 원본 보드 턴/보너스 회차와 다른 웹 규칙. mgm02 @0x7100017008 [fn02] |
| 게임 범위 | 원본 후보 ∩ 완성 게임 | 장르 확장은 별도 변형. §8.2, [ND]·[CA]·[registry] |
| 반복 | 소진 후 순환·가능하면 연속 중복 회피 | 원본 중복 정책은 미확정. §6.1, mgm02 @0x7100017408 [fn02] |
| 체감 | 원본 설정 우선, 입력 미완성 게임은 후보 제외 | 키보드 대체/체감 전종 제외는 별도 선택. mgmet @0x7100054640 [callers], [ND]·[CA] `Gyro` |

[설계] 다음 구현에서 검토할 선택 목록이다. 이번 문서 작성에서는 승인을 요구하거나 구현을 시작하지 않는다. 원본 규칙 기본·사용자 선택 미승인이라는 작업 지시와 [DESIGN §10][design]를 따른다.

## 13. 준비도

| 판정 [설계] | 바로 쓸 수 있는 것 / 남은 조건 | 근거 |
|---|---|---|
| 바로 가능 | 112종 정적 분류, 체감 25/필터 15 구분, 팩 49·서바이벌 26·보드 78/75 대응, 규칙 caller 표·설정 상위 흐름·40조합 정적 검증·팩 fallback·시간/태그 결과 reader | §3.2~3.5·§6.2·6.3·§8, mgmet 7주소 [callers], [catalog]·[ND]·[CA]·[PACK]·[SURV] |
| 근사 필요 | 부분집합 균등 추첨·순환 이력, 임의 N, 연출 완료 신호 | §6·§9·§12. 사용자 미승인, 원본 추첨과 동등하지 않음 |
| 판독 필요 | mgm02~06의 게임 선택/정산/종료/시상, bd01 추첨, 누락 commit 값 | §11 U01~U11·부록C. 후속 reader는 부분 해결이며 계산/종료 본체 C 없음. 원본 mgm02는 최소 1차21주소가 선행 |
| 현재 실행 목록 제한 | mg1801 1종. Chara 기준 추천 후보 ∩ 등록은 빈 집합. 실제 mgm02 후보·정산은 판독 필요 | [registry] `GAMES`, [ND] `GameRule=Chara`, §9.1 |

## 부록 A. 출처 대응

| 사실군 [데이터] | 정확한 출처/절·필드 |
|---|---|
| 제목·활동 번호 | [허브 §4.2](mgmet_flow.md#42-모드-번호는-표별로-구분)·mgmet @0x71000e3658·[MSG-H] 안내 필드 |
| 게임 형태·입력·보드 | [catalog] `code/name_ko`＋[ND]/[CA] `mgList[Name].GameRule/Gyro/Coin/BD01*`. 숫자 ID 주소는 만들지 않음 |
| 모드용 목록 | [FP] `gamedata[].MgName`·[PACK] `mgpack[].mg1~mg3`·[SURV] `mgList[].mg` |
| 함수 존재·C 대응 | [fn02]~[fn06]·[fnH]·[fnBD]·[fnMain]의 `address/name`와 [INDEX][idx]의 `address/name/file`. 모듈을 붙여 대조 |
| 새 규칙 판독 | mgmet 8주소·[callers]. analysis/decomp 판본을 사용 |
| 공용 재사용 | §2.1의 문서/주소. SceneBase/Work 수명재판독 0 |
| 웹 판정 | [DESIGN §10][design]·[한 판 §12.12](minigame_scene.md#1212-웹-게임-연결-계약-2026-10-09-mg-connect) |

## 부록 B. 새 판독 목록

| 모듈 [판독] | 주소 | 함수 | 출처 |
|---|---|---|---|
| mgmet | 0x7100054390 | `Mgm02SetRuleForRandomMatch` | [callers] |
| mgmet | 0x7100054640 | `Mgm02SetRuleForCpu` | [callers] |
| mgmet | 0x7100057b00 | `Mgm03SetRuleFlow` | [callers] |
| mgmet | 0x710005f5e0 | `Mgm05SetRuleFlow` | [callers] |
| mgmet | 0x71000628f0 | `Mgm04SetRuleTopFlow` | [callers] |
| mgmet | 0x71000633c0 | `Mgm04SetRuleRandomMatchFlow` | [callers] |
| mgmet | 0x71000638a0 | `Mgm04SetRuleVsCpuFlow` | [callers] |
| mgmet | 0x7100052f00 | `BossrushReturnFlow_DefeatEndBefore` | [callers] |
| main | 0x7100361e00 | `bq::MinigameModeScene::LoadDailyTrialData` | [DAILY-C]; 팩/조합 로드·ID 해석·레코드 크기 |
| main | 0x7100362860 | `bq::MinigameModeScene::GetMgPackDailyTrialData` | [DAILY-C]; 1-based 팩 조회·잘못된 ID fallback·빈 목록 Abort |
| main | 0x7100362a10 | `bq::MinigameModeScene::GetRemainingTimeFromBaseDateTimeDailyTrialData` | [DAILY-C]; clock 선택·86400초 시간 reader; 큰 시각 차이는 보류 |
| main | 0x7100362bcc | `bq::MinigameModeScene::GetComboIndexFromNowDateTimeDailyTrialData` | [DAILY-C]; helper 정수의 조합수 정규화 |
| mgmet | 0x71000535f0 | `mgmet::Scene::ChallengeMgBattleSettingUiFlow` | [callers]; 챌린지 설정 caller·로컬/RM·반환 |
| mgmet | 0x7100055cb0 | `mgmet::Scene::Dailytrial_SettingUiFlow` | [callers]; 데일리 설정 caller·팩/체감/규칙 순서 |
| mgmet | 0x710005e4a0 | `mgmet::Scene::SurvivalMainFlow` | [callers]; 서바이벌 항구의 인원/연결/설정 순서 |
| mgmet | 0x7100050e10 | `mgmet::Scene::BossrushStartFlow_SettingUIFlow` | [callers]; 보스 규칙·취소0·Explain/CPU cache |
| mgmet | 0x7100066610 | `mgmet::ChallengeMgBattleResultUI::Setup` | [callers]; 코인/순위/기록 reader; GUI 문자열 조립 제외 |
| mgmet | 0x7100003b70 | `mgmet::ChallengeMgBattleResultMessage::StartAnnounceTop` | [callers]; rank0 발표 reader; 빠진 Order/메시지는 보류 |
| mgmet | 0x710006c4e0 | `mgmet::DailytrialResultUI::Setup` | [callers]; 스타/승패/rank reader; GUI 문자열 조립 제외 |
| mgmet | 0x7100078e70 | `mgmet::TagmatchResult::Impl::Setup` | [callers]; 태그 byte 집계·목표·10행·팀 reader |
| mgmet | 0x71000786d4 | `mgmet::TagmatchResultForRM::Impl::Setup` | [callers]; RM 결과 UI 준비; 값 인자 누락 보류 |
| mgmet | 0x7100085900 | `mgmet::Scene::Mgm04ReturnUiFlow` | [callers]; 스크롤 입력·RM 결과 연출 분기 |
| mgmet | 0x71000818e0 | `mgmet::Scene::Mgm04ReturnFlow` | [callers]; 승리 모션 비교·업적·보상 호출 경계; 애니 세부 제외 |

[판독] 최초 판독은 8개(규칙 7·복귀 연출 1)이며 기존 C만 사용했다. `Mgm04SetRuleTopFlow`의 네트워크 영역은 분기 경계만 확인했다. 값이 빠진 부분은 U09로 보류한다. 후속 새 판독은 15개이며 누적 23개다. GUI/애니 생성 boilerplate는 계산·reader 범위에 포함하지 않았다. 기존 판독 재판독 0·공용 SceneBase/Work 수명 새 판독 0·어셈블리 대체 판독 0·새 C/추출 0. 출처는 부록B의 모듈/주소와 [callers]·[DAILY-C].

## 부록 C. Ghidra 요청 표

[미확정] 다음은 모듈·주소별 중복 제거 요청이다. 각 심볼은 링크한 함수 TSV에서 확인했고 현재 허용 C 검색 범위에서 본체가 없다. **요청 기록만 남겼으며 Ghidra·원본 실행·추출은 하지 않았다.** [미확정] 기존 C의 불완전 인자 문제 U09는 새 주소를 만들지 않고 별도 보류한다. [INDEX][idx]와 §2.2 참조.

| 모듈 [미확정] | 주소 | TSV 심볼 | C 부재·요청 이유 | 구현 차단 [설계] |
|---|---|---|---|---|
| mgm02 | 0x710000ee3c | `mgm02::MgMgr::SyncedSetupGame` [fn02] | 본체 C 없음; 후보 목록 초기화·규칙/체감 필터  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710000ef94 | `mgm02::MgMgr::SetTargetMgIds` [fn02] | 본체 C 없음; 원본 후보 ID 집합 설정  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710000efe0 | `mgm02::MgMgr::GetMgType` [fn02] | 본체 C 없음; 라운드별 인원 형태/게임 유형  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710000f030 | `mgm02::MgMgr::LotteryNextMg` [fn02] | 본체 C 없음; 실제 게임 추첨·가중치·RNG  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100016008 | `mgm02::Scene::SyncedSetupGame` [fn02] | 본체 C 없음; 모드 고유 필드·Work 소비  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100017008 | `mgm02::Scene::GetMaxRound` [fn02] | 본체 C 없음; 5/7/10 최대 라운드 산출  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710001704c | `mgm02::Scene::SetMgResult` [fn02] | 본체 C 없음; 한 판 코인 합산·동점·순위  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100017408 | `mgm02::Scene::LotteryNextMg` [fn02] | 본체 C 없음; 이력 회피·추첨·난수 순서  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100017728 | `mgm02::Scene::MinigameModeFlow` [fn02] | 본체 C 없음; 반복/최종 종료·Round 증가  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x71000178f0 | `mgm02::Scene::FirstRoundFlow` [fn02] | 본체 C 없음; 첫 라운드 초기값  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100017b20 | `mgm02::Scene::DecideMgFlow` [fn02] | 본체 C 없음; 게임 유형·찬스 선택 흐름  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100018030 | `mgm02::Scene::StepToMinigameScene` [fn02] | 본체 C 없음; 팀/참가자·게임 setup 기록  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100018300 | `mgm02::Scene::ResultFlow` [fn02] | 본체 C 없음; 최종 코인 결과·시상  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100018740 | `mgm02::Scene::ReturnToEntranceScene` [fn02] | 본체 C 없음; 항구 복귀 값·보상 전달  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100018800 | `mgm02::Scene::DecideMgFlow_BonusMg` [fn02] | 본체 C 없음; 보너스 게임 집합·회차  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x7100018920 | `mgm02::Scene::DecideMgFlow_BattleMg` [fn02] | 본체 C 없음; 배틀 게임·징수/배분  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710001a7fc | `mgm02::SceneParamsGameMgTypeTableFiveRound::getPropertyList` [fn02] | 본체 C 없음; 5라운드 유형 표 필드/상수  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710001aa70 | `mgm02::SceneParamsGameMgTypeTableSevenRound::getPropertyList` [fn02] | 본체 C 없음; 7라운드 유형 표 필드/상수  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710001ad44 | `mgm02::SceneParamsGameMgTypeTableTenRound::getPropertyList` [fn02] | 본체 C 없음; 10라운드 유형 표 필드/상수  예: 원본 모드 규칙·진행/결과 |
| mgm02 | 0x710001b580 | `mgm02::SceneParamsGame::MgType` [fn02] | 본체 C 없음; 회차→유형 표 선택  예: 원본 모드 규칙·진행/결과 |
| mgm03 | 0x7100008960 | `mgm03::Scene::SyncedSetupGame` [fn03] | 본체 C 없음; 모드 Work·팩 초기화  예: 원본 모드 규칙·진행/결과 |
| mgm03 | 0x7100009780 | `mgm03::Scene::MinigameModeFlow` [fn03] | 본체 C 없음; 3게임 반복·종료·Round  예: 원본 모드 규칙·진행/결과 |
| mgm03 | 0x7100009bc0 | `mgm03::Scene::StartFlow` [fn03] | 본체 C 없음; 시작 안내·팩 진행 초기화  예: 원본 모드 규칙·진행/결과 |
| mgm03 | 0x710000a440 | `mgm03::Scene::DicideMinigameFlow` [fn03] | 본체 C 없음; 팩 슬롯 순서·팀/형태 결정  예: 원본 모드 규칙·진행/결과 |
| mgm03 | 0x710000b3a0 | `mgm03::Scene::ResultMinigameFlow` [fn03] | 본체 C 없음; 승리 스타·동점·최종 결과  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x71000150c8 | `mgm04::Scene::SyncedSetupGame` [fn04] | 본체 C 없음; 모드 Work·팀/승수 초기화  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100015c88 | `mgm04::Scene::UpdateMgmWork` [fn04] | 본체 C 없음; 팀 승수·뒤처진 팀 갱신  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100015f70 | `mgm04::Scene::MinigameModeFlow` [fn04] | 본체 C 없음; 목표 승수 종료·계속  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100016190 | `mgm04::Scene::FirstRoundFlow` [fn04] | 본체 C 없음; 첫 경기 시작·팀/승수 준비  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100016330 | `mgm04::Scene::ResultFlow_Cut01` [fn04] | 본체 C 없음; 한 판 복귀 결과 준비  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100016390 | `mgm04::Scene::ResultFlow_Cut02` [fn04] | 본체 C 없음; 승패/무승부 결과·시상  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100016580 | `mgm04::Scene::SelectNextMgFlow` [fn04] | 본체 C 없음; 다음 게임 선택 흐름  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x71000166f0 | `mgm04::Scene::ResetWork` [fn04] | 본체 C 없음; 고유 상태 리셋 범위  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x7100018060 | `mgm04::Scene::SelectNextMgFlow_SelectAndDecideMg` [fn04] | 본체 C 없음; 후보·팀 선택권·중복·RNG  예: 원본 모드 규칙·진행/결과 |
| mgm04 | 0x710001aa90 | `mgm04::Scene::RM_MinigameModeFlow` [fn04] | 본체 C 없음; RM 연승 루프/종료  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x7100003ff0 | `mgm05::Scene::SyncedSetupGame` [fn05] | 본체 C 없음; 규칙/인원·Work 초기화  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x710000956c | `mgm05::Scene::MinigameModeFlow` [fn05] | 본체 C 없음; 매칭/게임/결과 전체 반복  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x710000aeb0 | `mgm05::Scene::MinigameModeFlow_AfterMaching` [fn05] | 본체 C 없음; 매칭 뒤 인원 형태·게임 전환  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x710000c210 | `mgm05::Scene::MinigameModeFlow_AfterGame` [fn05] | 본체 C 없음; 승패/포인트·듀얼 이동  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x710000fb40 | `mgm05::Scene::GetMinigameIdList` [fn05] | 본체 C 없음; 26종의 필터·가중치  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x7100010d90 | `mgm05::Scene::DicideMinigameFlow` [fn05] | 본체 C 없음; 게임 선택·참가 형태  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x71000154f0 | `mgm05::Scene::MgSelectRouletteFlow` [fn05] | 본체 C 없음; 룰렛 추첨·난수 소비  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x7100017bf0 | `mgm05::Scene::MgSelectVoteFlow` [fn05] | 본체 C 없음; 투표 입력/확정  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x7100018690 | `mgm05::Scene::DicideVoteMgSelectFlow` [fn05] | 본체 C 없음; 동표 처리·최종 추첨  예: 원본 모드 규칙·진행/결과 |
| mgm05 | 0x710001a7d0 | `mgm05::Scene::GetWinPattern` [fn05] | 본체 C 없음; 승리 패턴/포인트 연결  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x7100010e54 | `mgm06::Scene::SyncedSetupGame` [fn06] | 본체 C 없음; 보스 목록/고유 필드 초기화  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x71000111c0 | `mgm06::Scene::SetMinigameResultToMinigameModeWork` [fn06] | 본체 C 없음; 모드 결과 ring writer  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x710001140c | `mgm06::Scene::MinigameModeFlow` [fn06] | 본체 C 없음; 연전/패배/완주 종료  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x71000115a0 | `mgm06::Scene::OpeningFlow` [fn06] | 본체 C 없음; 보스 연전 오프닝 연결  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x7100011610 | `mgm06::Scene::CallMinigameScene` [fn06] | 본체 C 없음; 보스 ID 순서/추첨·setup  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x7100011750 | `mgm06::Scene::RewardFlow` [fn06] | 본체 C 없음; 보상·MVP 연결  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x7100011ed0 | `mgm06::Scene::IsBossMinigameDefeated` [fn06] | 본체 C 없음; 보스 격파 판정·완주 조건  예: 원본 모드 규칙·진행/결과 |
| mgm06 | 0x710001e5e0 | `mgm06::Scene::VictoryFlow::MainFlow` [fn06] | 본체 C 없음; 완주 점수·MVP 동률/시상  예: 원본 모드 규칙·진행/결과 |
| bd01 | 0x71000afb90 | `bd01::MgMgr::GetList` [fnBD] | 본체 C 없음; 일반/고수·체감 후보 목록  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000afd70 | `bd01::MgMgr::GetList_Item` [fnBD] | 본체 C 없음; 아이템 게임 후보  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000aff40 | `bd01::MgMgr::GetList_VS` [fnBD] | 본체 C 없음; 배틀/VS 후보와 형태  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b05a0 | `bd01::MgMgr::GetList_Duel` [fnBD] | 본체 C 없음; 듀얼 후보  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b0770 | `bd01::MgMgr::GetList_Chara` [fnBD] | 본체 C 없음; 캐릭터 챌린지 후보  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b0940 | `bd01::MgMgr::GetPlayID` [fnBD] | 본체 C 없음; 일반 게임 선택 경계  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b09f0 | `bd01::MgMgr::GetPlayID_` [fnBD] | 본체 C 없음; 가중치·이력·RNG 핵심  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b0fd8 | `bd01::MgMgr::GetPlayID_Item` [fnBD] | 본체 C 없음; 아이템 추첨 경로  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b1048 | `bd01::MgMgr::GetPlayID_VS` [fnBD] | 본체 C 없음; VS 추첨 경로  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b10b8 | `bd01::MgMgr::GetPlayID_Duel` [fnBD] | 본체 C 없음; 듀얼 추첨 경로  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b1130 | `bd01::MgMgr::GetPlayID_Chara` [fnBD] | 본체 C 없음; 캐릭터 추첨 경로  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x71000b1228 | `bd01::MgMgr::SetHistoryID` [fnBD] | 본체 C 없음; 이력 길이/리셋/중복 방지  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x710028b7f0 | `bd01::event::MgCall::SetPlayerWork` [fnBD] | 본체 C 없음; 형태 선택과 참가 팀 구성  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x710028c570 | `bd01::event::MgCall::RunRoulette` [fnBD] | 본체 C 없음; 룰렛 연출과 확정 순서  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x710028cb00 | `bd01::event::MgCall::GetMinigameList` [fnBD] | 본체 C 없음; 유형/게임 후보 조립  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| bd01 | 0x710028d270 | `bd01::event::MgCall::Update` [fnBD] | 본체 C 없음; 한 턴 끝 게임 실행 흐름  예: 보드 추첨 동등성; mgm02 기본 구현과 별도 |
| main | 0x71001e14b0 | `bq::MGList::GetMinigameID` [fnMain] | 본체 C 없음; Name→ID 조회/목록 순서  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001e15d4 | `bq::MGList::GetGameRule` [fnMain] | 본체 C 없음; MGList 규칙 getter  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001e1600 | `bq::MGList::IsAvailable` [fnMain] | 본체 C 없음; Available 판정  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001e1630 | `bq::MGList::IsCoin` [fnMain] | 본체 C 없음; Coin flag 판정  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001e1690 | `bq::MGList::IsBD01` [fnMain] | 본체 C 없음; 보드 일반/고수 flag 소비  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f3120 | `bq::MinigameModeWork::Mgm02AddMgResult` [fnMain] | 본체 C 없음; mgm02 고유 결과 레코드/합산  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f3370 | `bq::MinigameModeWork::Mgm02GetTotalCoinCount` [fnMain] | 본체 C 없음; mgm02 누적 코인 getter·필드  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f3470 | `bq::MinigameModeWork::Mgm02GetTotalLeviedCoinCount` [fnMain] | 본체 C 없음; mgm02 누적 징수 코인 getter  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f35d0 | `bq::MinigameModeWork::Mgm02IsPlayedMgId` [fnMain] | 본체 C 없음; mgm02 이력 검색 범위  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f396c | `bq::MinigameModeWork::Mgm04GetTargetVictoryCount` [fnMain] | 본체 C 없음; mgm04 목표 승수 getter·필드  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f3974 | `bq::MinigameModeWork::Mgm04GetTeamVitoryCount` [fnMain] | 본체 C 없음; mgm04 팀 승수 getter·필드  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f39e0 | `bq::MinigameModeWork::Mgm04AddMGResult` [fnMain] | 본체 C 없음; mgm04 결과/팀 승수 레코드  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f3be0 | `bq::MinigameModeWork::Mgm04AddMGIDHistory` [fnMain] | 본체 C 없음; mgm04 이력 기록·길이  예: 원본 모드 규칙·진행/결과 |
| main | 0x71001f3d50 | `bq::MinigameModeWork::Mgm04IsPlayMGID` [fnMain] | 본체 C 없음; mgm04 중복 판정  예: 원본 모드 규칙·진행/결과 |
| mgmet | 0x7100055370 | `mgmet::Scene::Mgm02RewardUiFlow` [fnH] | 본체 C 없음; mgm02 항구 최종 보상 UI  예: 원본 모드 규칙·진행/결과 |
| mgmet | 0x7100056e10 | `mgmet::Scene::Dailytrial_UpdateDailyData` [fnH] | 본체 C 없음; 데일리 날짜→팩 선택/교체  예: 원본 모드 규칙·진행/결과 |
| mgmet | 0x7100056f40 | `mgmet::Scene::Mgm03GamePackFlow` [fnH] | 본체 C 없음; 팩/조합 선택 흐름  예: 원본 모드 규칙·진행/결과 |
| mgmet | 0x71000597a0 | `mgmet::Scene::DailytrialReturnFlow_CheckRewardAndDailyBonus` [fnH] | 본체 C 없음; 데일리 보상/보너스  예: 원본 모드 규칙·진행/결과 |

| mgm02 | 0x7100003e60 | `mgm02::CoinMgr::SyncedSetupGame` [fn02] | 본체 C 없음; CoinMgr 초기화·기준 값 소비 | 예: 코인 규칙 |
| mgm02 | 0x7100003f50 | `mgm02::CoinMgr::GetRankCoinCount` [fn02] | 본체 C 없음; 순위별 지급 코인 산식 | 예: 코인 규칙 |
| mgm02 | 0x71000042d0 | `mgm02::CoinMgr::AdjustBattleMgCoinCount` [fn02] | 본체 C 없음; 배틀 코인 보정·부족 코인·정수 처리 | 예: 코인 규칙 |
| mgm02 | 0x710000484c | `mgm02::CoinMgr::LevyCoin` [fn02] | 본체 C 없음; 플레이어 징수·상한/하한 | 예: 코인 규칙 |
| mgm02 | 0x7100004948 | `mgm02::CoinMgr::GetTotalLeviedCoinCount` [fn02] | 본체 C 없음; 징수 코인 합계 | 예: 코인 규칙 |
| mgm02 | 0x7100004960 | `mgm02::CoinMgr::ExistsGotCoinPlayer` [fn02] | 본체 C 없음; 획득자가 없는 경우의 분기 | 예: 코인 규칙 |
| mgm02 | 0x7100004980 | `mgm02::CoinMgr::GetBonusMgGotCoinCount` [fn02] | 본체 C 없음; 보너스 획득 코인·계수 적용 | 예: 코인 규칙 |
| mgm02 | 0x71000049c0 | `mgm02::CoinMgr::GetDistributedCoinCountRatio` [fn02] | 본체 C 없음; 승자/동점의 배분 비율 | 예: 코인 규칙 |
| mgm02 | 0x710001b0a8 | `mgm02::SceneParamsGame::getPropertyList` [fn02] | 본체 C 없음; 코인·유형 규칙 property 및 실제 값 출처 | 예: 원본 상수 |
| mgm02 | 0x710001b3e4 | `mgm02::SceneParamsGameMgTypeTableFiveRound::MgType` [fn02] | 본체 C 없음; 5라운드별 유형 getter | 예: 유형/회차 |
| mgm02 | 0x710001b438 | `mgm02::SceneParamsGameMgTypeTableSevenRound::MgType` [fn02] | 본체 C 없음; 7라운드별 유형 getter | 예: 유형/회차 |
| mgm02 | 0x710001b4a4 | `mgm02::SceneParamsGameMgTypeTableTenRound::MgType` [fn02] | 본체 C 없음; 10라운드별 유형 getter | 예: 유형/회차 |
| mgm02 | 0x710001b534 | `mgm02::SceneParamsGame::RankCoinCount` [fn02] | 본체 C 없음; 순위별 기본 코인 상수 소비 | 예: 원본 상수 |
| mgm02 | 0x710001b710 | `mgm02::SceneParamsGame::BonusMgCoinCountCoef` [fn02] | 본체 C 없음; 보너스 코인 계수 | 예: 원본 상수 |
| mgm02 | 0x710001b718 | `mgm02::SceneParamsGame::BattleMgLeviedCoinCount` [fn02] | 본체 C 없음; 배틀 징수 코인 상수 | 예: 원본 상수 |
| main | 0x71001f32cc | `bq::MinigameModeWork::Mgm02GetMgResult` [fnMain] | 본체 C 없음; Mgm02 결과 레코드 반환·전체 형식 | 예: 결과 조회 |
| main | 0x71001f3320 | `bq::MinigameModeWork::Mgm02GetMgResultCount` [fnMain] | 본체 C 없음; Mgm02 결과 수·라운드와의 관계 | 예: 결과 조회 |
| main | 0x71001f33a0 | `bq::MinigameModeWork::Mgm02SetResultRank` [fnMain] | 본체 C 없음; Mgm02 최종 rank writer·동점 원본 | 예: 순위 계산 |
| main | 0x71001f33d0 | `bq::MinigameModeWork::Mgm02GetResultRank` [fnMain] | 본체 C 없음; Mgm02 rank reader의 Order 인자·배치 | 예: 결과 조회 |
| main | 0x71001f395c | `bq::MinigameModeWork::Mgm04GetTeamData` [fnMain] | 본체 C 없음; Mgm04 TeamData 반환·팀/Order 매핑 | 예: 팀 결과 |
| main | 0x71001f3b78 | `bq::MinigameModeWork::Mgm04GetMGResultCount` [fnMain] | 본체 C 없음; Mgm04 전용 결과 수 | 예: 팀 결과 |
| main | 0x71001f3b8c | `bq::MinigameModeWork::Mgm04GetMGResult` [fnMain] | 본체 C 없음; Mgm04 결과 index·byte 형식 | 예: 팀 결과 |
| main | 0x7100362300 | `FUN_7100362300` [fnMain] | 본체 C 없음; mgpack JSON parser의 정확한 필드·오류 계약 | 아니오: 유효 JSON의 정적 분류 가능 |
| main | 0x71003624e0 | `FUN_71003624e0` [fnMain] | 본체 C 없음; packcombo JSON parser의 정확한 필드·오류 계약 | 아니오: 유효 JSON의 정적 분류 가능 |
| main | 0x71003628bc | `FUN_71003628bc` [fnMain] | 본체 C 없음; day 기준·clock·floor/음수 날짜 | 예: 데일리 교체 |
| mgmet | 0x71000083e0 | `mgmet::DailytrialResultData::Setup` [fnH] | 본체 C 없음; 로컬 DailytrialResultData 생성·스타/동점/중복 | 예: 스타 규칙 |
| mgmet | 0x7100008ba4 | `mgmet::DailytrialResultData::SetupRandomMatch` [fnH] | 본체 C 없음; RM DailytrialResultData 생성·스타 규칙 | 예: RM 스타 규칙 |
| mgmet | 0x71000091cc | `mgmet::DailytrialResultData::IsGetStar` [fnH] | 본체 C 없음; 이번 스타 판정 | 예: 결과 조회 |
| mgmet | 0x7100009234 | `mgmet::DailytrialResultData::IsWinLose` [fnH] | 본체 C 없음; 승패형 여부 판정 | 예: 결과 조회 |
| mgmet | 0x7100009298 | `mgmet::DailytrialResultData::GetRank` [fnH] | 본체 C 없음; 데일리 rank 조회 | 예: 결과 조회 |
| mgmet | 0x7100009390 | `mgmet::DailytrialResultData::IsGotStarBefore` [fnH] | 본체 C 없음; 기존 스타 판정·중복 지급 분리 | 예: 스타 규칙 |
| mgmet | 0x710005a1a0 | `mgmet::Scene::MGMSelectOpponentUiFlow` [fnH] | 본체 C 없음; Scene+0x3b0의 상대 선택 상태 writer | 예: 설정 상태의 원본 등가성 |
| mgmet | 0x71000864a0 | `mgmet::Scene::Mgm04SetRewardPlayerWinContinuousCount` [fnH] | 본체 C 없음; 태그 로컬 연승 보상 카운터 계산 | 예: 메타 보상 |
| mgmet | 0x71000866fc | `mgmet::Scene::Mgm04SetRewardPlayerWinCount` [fnH] | 본체 C 없음; 태그 로컬 승리 보상 카운터 계산 | 예: 메타 보상 |
| mgmet | 0x7100068d90 | `FUN_7100068d90` [fnH] | 본체 C 없음; Order/rank 정렬·동점의 안정 순서 | 예: 시상 표시 |
| mgmet | 0x7100004040 | `FUN_7100004040` [fnH] | 본체 C 없음; rank0 수집 후 우승 이름·메시지 설정 | 예: 시상 표시 |

[미확정] 미식별 별도 요청 1갈래는 유지한다: 원본 규칙 값의 실제 asset override/데이터 주소. mgm02는 getPropertyList @0x710001b0a8 → 유형 getter @0x710001b3e4/@0x710001b438/@0x710001b4a4와 RankCoinCount/BonusMgCoinCountCoef/BattleMgLeviedCoinCount @0x710001b534/@0x710001b710/@0x710001b718까지 좁혔다. 보드는 GetList/GetPlayID_/SetHistoryID @0x71000afb90/@0x71000b09f0/@0x71000b1228의 C가 선행이다. 기존 JSON에서 대응 필드명을 찾지 못했으므로 asset 경로나 주소를 만들지 않았다. [fn02]·[fnBD], §2.3.


### C.2 요청 범위·주소 충돌

[데이터] 요청은 총123개의 모듈·주소 쌍이며 이번에36주소를 추가했다. 기존 C·INDEX·함수 TSV를 대조한 기록이며 추출 승인을 요구하지 않는다. mgmet FUN_7100004040와 같은 숫자 주소의 matching00 C는 다른 모듈이므로 사용하지 않았다. [fnH]·[INDEX][idx]·[matching00 기존 C](../../../ghidra_work/online/out/matching00.nro.c).

### C.3 최소 1차 요청 집합

[설계] 가장 가까운 mgm02의 원본 규칙을 구현하려는 첫 요청은 아래21주소다. 추첨→코인→라운드/최종 결과 경계를 잇는 본체를 우선하며, C 확보 후 실제 callee가 확인되면 추가 범위를 결정한다. 전체123주소를 한꺼번에 요구하는 뜻이 아니다. 부록 C의 동일 심볼·주소 [fn02]·[fnMain].

| 모듈·범위 [미확정] | 정확한 주소 | 차단 이유 |
|---|---|---|
| mgm02 MgMgr 4 | 0x710000ee3c·0x710000ef94·0x710000efe0·0x710000f030 | 모집단·유형·추첨 |
| mgm02 Scene 7 | 0x7100017008·0x710001704c·0x7100017408·0x7100017728·0x7100018300·0x7100018800·0x7100018920 | 회수·이력·정산·보너스/배틀·최종 |
| mgm02 CoinMgr 6 | 0x7100003e60·0x7100003f50·0x71000042d0·0x710000484c·0x7100004980·0x71000049c0 | 순위 지급·배틀/징수·보너스/동점 |
| mgm02 SceneParamsGame 2 | 0x710001b0a8·0x710001b580 | 실제 규칙 값·회차별 유형 |
| main Mgm02 결과 writer 2 | 0x71001f3120·0x71001f33a0 | 결과 기록·최종 rank |

[설계] 다른 모드의 최소 진행 확인은 mgm03 @0x7100009780/@0x710000a440/@0x710000b3a0 + main 날짜 helper @0x71003628bc, mgm04 @0x7100015f70/@0x7100015c88/@0x7100018060, mgm05 @0x710000956c/@0x710000c210/@0x710000fb40/@0x7100018690, mgm06 @0x710001140c/@0x7100011610/@0x710001e5e0이다. 보드 비교는 bd01 @0x71000afb90/@0x71000b09f0/@0x71000b1228/@0x710028b7f0를 우선한다. 모두 기존 C 없음; [fn03]·[fn04]·[fn05]·[fn06]·[fnMain]·[fnBD].

## 부록 D. 검증·부모 통합

[데이터] 후속 정적 검증: §1~13·부록 A~D, 후속 새 판독15함수·누적23함수, 해결0·부분 해결7·남음5, 요청123주소·미식별1갈래. 주소와 C 부재는 [fn02]·[fnH]·[fnMain]·[idx]·부록 B/C에서 대조했다. 새 C·추출0개.

[데이터] <!-- FOLLOWUP_LINK_VALIDATION -->

[미확정] 원본 실행·헤드리스·화면 촬영 검증은 없다. 검증 명령은 메모리 내에서만 실행했으며 분석 스크립트 파일·코드·데이터·출처 문서·README·git index를 변경하지 않았다. [이번 범위](mgm_modes.md#2-자료).

[설계] 다음 통합은 부모가 한 번에 수행한다. 기존 줄바꿈을 보존하고 각 출처 절 끝에 정리본 링크 한 줄만 추가한다. 출처 본문 정정은 요청하지 않는다.

| 파일·절 [설계] | 추가할 정확한 한 줄 |
|---|---|
| `web/docs/shell/mgm01_freeplay.md` §11 끝 | `[데이터] 모드별 모집단·형태·체감의 정리본은 [mgm_modes.md §8](mgm_modes.md#8-상호작용)을 참조한다.` |
| `web/docs/shell/mgmet_flow.md` §4.2 끝 | `[데이터] mgm02~06의 진행·결과·사용 범위 정리본은 [mgm_modes.md §1·3](mgm_modes.md#1-기능-개요)을 참조한다.` |
| `web/docs/shell/mgmet_ruleconfig.md` §8.2 끝 | `[판독] 다른 활동의 규칙 caller 정리본은 [mgm_modes.md §3.2](mgm_modes.md#32-빈-부분에서-새로-읽은-규칙-caller)을 참조한다.` |
| `web/docs/shell/minigame_scene.md` §12.1 끝 | `[데이터] 최신 GameRule로 분류한 112종·모드 목록 대응 정리본은 [mgm_modes.md §8](mgm_modes.md#8-상호작용)을 참조한다.` |
| `web/docs/shell/minigame_result.md` §6.5 끝 | `[설계] 한 판 결과와 모드 누적/시상을 구분한 정리본은 [mgm_modes.md §4·6·9](mgm_modes.md#4-구조체필드상수)을 참조한다.` |
| `web/docs/engine/common_system_audit.md` §1.2 끝 | `[데이터] 활동0~5 대응과 mgm02~06·112종 사용 표 정리본은 [mgm_modes.md](../shell/mgm_modes.md)을 참조한다.` |

[catalog]: ../../../analysis/minigame_catalog.tsv
[ND]: ../../../extracted/bea/bq.nx.bea/common/data/mgListND.json
[CA]: ../../../extracted/bea/bq.nx.bea/common/data/mgListCA.json
[FP]: ../../../extracted/bea/mgm~mgm01.nx.bea/mgm/mgm01/data/mgm01_freeplay_mgList.json
[PACK]: ../../../extracted/bea/mgm~mgmet.nx.bea/mgm/mgmet/data/mgm_dailytrial_mgpack.json
[SURV]: ../../../extracted/bea/mgm~mgm05.nx.bea/mgm/mgm05/data/mgm05.json
[MSG-H]: ../../../extracted/message/koKR/mgmet.json
[MSG-02]: ../../../extracted/message/koKR/mgm02.json
[MSG-03]: ../../../extracted/message/koKR/mgm03.json
[MSG-04]: ../../../extracted/message/koKR/mgm04.json
[MSG-05]: ../../../extracted/message/koKR/mgm05.json
[MSG-06]: ../../../extracted/message/koKR/mgm06.json
[fn02]: ../../../analysis/functions/mgm02.nro.tsv
[fn03]: ../../../analysis/functions/mgm03.nro.tsv
[fn04]: ../../../analysis/functions/mgm04.nro.tsv
[fn05]: ../../../analysis/functions/mgm05.nro.tsv
[fn06]: ../../../analysis/functions/mgm06.nro.tsv
[fnH]: ../../../analysis/functions/mgmet.nro.tsv
[fnBD]: ../../../analysis/functions/bd01.nro.tsv
[fnMain]: ../../../analysis/functions/main.nso.tsv
[idx]: ../../../analysis/decomp/INDEX.tsv
[callers]: ../../../analysis/decomp/mgmcommon_mgmet_callers.c
[design]: ../../DESIGN.md
[registry]: ../../script/app/minigame/index.ts

[DAILY-C]: ../../../analysis/decomp/bgm_main_mgmscene.c
