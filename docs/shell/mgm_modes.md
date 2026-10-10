# mgm02~06 — 보드 없는 라운드 파티의 원본 모드 비교

[데이터] Super Mario Party Jamboree US v0, 자료 확인일 2026-10-10. 원본·extracted는 읽기만 했고 원본 실행·헤드리스·화면 촬영은 없다. 모듈 식별은 `mgm02~06.nro`, `mgmet.nro`, `bd01.nro`, `main.nso`와 주소의 쌍이다. 제품·모듈 배경은 [허브 §2](mgmet_flow.md#2-분석-대상자료-위치), 함수 존재는 [함수 목록][fn02]·[INDEX][idx]에 근거한다.

## 1. 기능 개요

[설계] 광장 → 보드 없이 N회 미니게임 → 누적 결과에는 **mgm02 챌린지 미니게임 배틀**이 가장 가깝다. 원본 5·7·10회와 코인 경쟁을 기본으로 추천한다. 임의 N·장르 확장·부분집합 추첨은 사용자 미승인 웹 변형이다. mgmet @0x7100054640 [callers]·mgm02 @0x7100017728 [C02]·[MSG-H] `mgmet_cmgb_mw_howToPlay00~02`.

| 모드·활동 ID [데이터] | 진행·승리·결과 | 사용 범위·N회와의 차이 | 근거 |
|---|---|---|---|
| mgm02 / 활동4 / mode2 / 챌린지 미니게임 배틀 | [판독] Round0 안내 → 게임 결정 → 한 판 → 코인 결과; Round==max에서 최종 복귀. 기본 코인10/3/2/0, 보너스×2, 배틀 징수10 | [판독] Chara 후보10종. Normal/Bonus/Battle도 N회 안에 포함. [미확정] 실제 asset override·배틀 1위 비율 표 | mgm02 @0x7100017728/@0x710000f0b0/@0x710001b33c [C02]; [ND] `GameRule=Chara` |
| mgm03 / 활동1 / mode3 / 데일리 트라이얼 | [판독] 팩 선택 → mg1/mg2/mg3 순서 → 매 판 결과 → 마지막 항구 복귀. [데이터] 1위 스타 안내 | [데이터] 25팩·49게임. [판독] 선택된 팩 안에서 무작위 추첨 없음. [미확정] 스타 지급 Data·정확한 날짜 기준 | mgm03 @0x7100009780/@0x710000a440/@0x710000b3a0 [C03]; [PACK] `mgpack[].mg1~mg3`; [MSG-H] `mgmet_dt_mw_howToPlay00~02` |
| mgm04 / 활동0 / mode4 / 태그 매치 | [판독] 2vs2; 어느 팀이든 승수>=목표이면 종료. 양팀 승리면 양팀+1, 양팀 패배면 승수 변화0. RM 별도 | [판독] 2VS2 후보12종에서 체감·이력 제외. 초반/RM 룰렛·그 뒤 선택창. 총 경기 수 N과 목표 승수3/5/10은 다름 | mgm04 @0x7100015f70/@0x710001ce70/@0x710001d260/@0x710000d860 [C04]; mgmet @0x710007f338 [규칙 §4.3](mgmet_ruleconfig.md#43-값-표와-버튼-전-함수군) |
| mgm05 / 활동3 / mode5 / 서바이벌 | [판독] 매칭 → 투표/룰렛 → 한 판 → 승패·계속/재도전 → 매칭 또는 항구. [데이터] 실력 포인트·S부터 랭킹 | [판독] 명시26종 중 VS4 21·듀얼5를 분리. 4표 전원 일치만 확정; 그 밖 룰렛. [미확정] 실력 포인트 식·듀얼 전환의 정확한 누적 기준 | mgm05 @0x710000956c/@0x710000fb40/@0x7100018690/@0x710000c210 [C05]; [SURV] `mgList[].mg`; [MSG-H] `mgmet_sb_mw_howToPlay00~03` |
| mgm06 / 활동5 / mode6 / 보스 러시 | [판독] 고정5슬롯 순서·전원 WinLose==1만 격파; 실패 오프닝 또는 완주 점수·MVP → 보상 → 항구 | [판독] Round0~4가 게임, Round5가 완주. 추첨 RNG 없음. MVP는 총점 rank0인 모든 플레이어 이름 수집. [미확정] 슬롯별 ID·점수 상수 | mgm06 @0x710001140c/@0x7100011610/@0x7100011ed0/@0x710001e5e0 [C06]; `kBossMinigameIds` 포인터 슬롯 @0x7100057d98 |

[판독] [데이터] 활동0~5 → mode4/3/1/5/2/6이며 프리 플레이는 활동2/mode1이다. 이미 판독된 mgmet `SetNextMGMode` @0x71000e3658·`GetModeNumberFromID` @0x7100050248, main `CallMinigameModeScene` @0x710036027c를 재사용한다. [허브 §4.2](mgmet_flow.md#42-모드-번호는-표별로-구분)·[공용 감사 §1.2](../engine/common_system_audit.md#12-게임-호스트프리-플레이-경계).

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
| [데이터] 판독 C | 최초8+추가140=누적148함수. [callers]·[DAILY-C]·[GAP]·[MODE-H]·[BOARD-C]·[C02]~[C06]; 부록B |
| [데이터] 추가 C 보유 | 허용 C486파일. mgm02/03/04/05/06 헤더745/415/709/437/581개와 [fn02]~[fn06]·[INDEX][idx] 대조. 자체 Ghidra 추출0 |
| [데이터] 게임 이름 | [catalog][catalog] `code/name_ko/name_en/nro_size/bea` 112행. 인원 형태/모드 membership 열은 없음 |
| [데이터] 미니게임 표 | [ND] `mgList`84행·[CA] `mgList`38행; `Name/GameRule/Available/Gyro/Coin/BD01Normal/BD01Serious` |
| [데이터] 프리 플레이·팩·서바이벌 | [FP] `gamedata`112행·[PACK] `mgpack`25행·[SURV] `mgList`26행 |
| [데이터] 규칙·결과 문구 | [MSG-H]·[MSG-02]·[MSG-03]·[MSG-04]·[MSG-05]·[MSG-06]; 각 행에 실제 필드명 명시 |
| [데이터] 레이아웃 존재 | `extracted/bea/mgm~mgm02.nx.bea/mgm/mgm02/layout.lyt` 등 mgm02~06 같은 경로. §7에서 개별 링크 |
| [데이터] 현행 등록 | [script/app/minigame/index.ts][registry] `GAMES=[mg1801Game]`; 이번 확인 시 실제 등록 1종 |

[데이터] 관련 상위·대상 경로의 `AGENTS.md`와 `.agents/skills`는 발견되지 않았다. 키 값은 출력·기록하지 않았고 로컬 Codex 기억은 사용하지 않았다. 기준 검색 범위는 `C:/dev/mpj`, `web`, `web/docs`, `web/docs/shell`; 전체 저장소의 AGENTS.md/.agents 목록도 확인했다.

### 2.3 추가 C·미확정 일괄 목록

[데이터] 기존 §2.1·§3.2·§3.3의8함수는 재사용했다. 이후 확보된 C에서 표시 reader15함수·MGList/데일리/보드25함수·mgm02~06 고유 본체100함수를 추가 판독하여 누적148함수다. 대형 함수는 계산·상태·선택 구간만 읽었고 GUI 문자열 조립·일반 렌더·공용 소유권은 제외했다. 부록B·[INDEX][idx]·[fn02]~[fn06]·[fnMain].

| 공백 [데이터] | 확보·판독한 C | 남은 범위 |
|---|---|---|
| 데일리 팩·조합·시간 | main @0x7100361e00/@0x7100362860/@0x7100362a10/@0x7100362bcc [DAILY-C]; mgmet @0x7100056e10/@0x7100056f40/@0x71000597a0 [MODE-H]; mgm03 @0x710000a440 [C03] | [미확정] 날짜 helper @0x71003628bc·파서2함수·DailytrialResultData의 스타 판정 |
| MGList·모드/보드 추첨 | main @0x71001e14b0/@0x71001e15d4/@0x71001e1600/@0x71001e1630/@0x71001e1690 [GAP]; bd01 16함수 [BOARD-C]; mgm02/04/05/06 선택 [C02]·[C04]·[C05]·[C06] | [미확정] 런타임152행 초기화·JsonMgTeam 확률·C에서 빠진 RNG 상한 |
| 누적·종료·보상 | mgm02 CoinMgr·RankMgr·Scene·기본 Params, mgm04 TeamMgr·Flow, mgm05 투표/룰렛·결과, mgm06 점수 합·MVP [C02]~[C06] | [미확정] 정적 테이블3개·보스 ID 배열·보상 callee·서바이벌 실력 포인트 식 |
| 공용 Work·온라인·렌더 | [18_scene_work §11.4~11.6](../engine/18_scene_work.md#11-미확정)·[12_online_sync](../engine/12_online_sync.md)·[render_unify §3.4](../engine/render_unify.md#34-mgm06-별도-rt와-레이어-상태-교체) 재사용 | [미확정] 모드 고유 Work9함수는 C가 있으며18 담당이다. C.4에 판독 공유 요청만 남긴다. |

[데이터] mgm02 Params의 `mg_type_table_five_round/seven_round/ten_round`·`rank_coin_count`·`bonus_mg_coin_count_coef`·`battle_mg_levied_coin_count` 기본 생성값은 C에서 확보했다. 기존 extracted JSON에서 해당 override 필드를 찾지 못했다. 실제 override 부재는 증명하지 않았다. mgm02 @0x710001b0a8/@0x710001b33c [C02]·§4.2.

## 3. 진입점·호출 흐름

### 3.1 기존 허브와 본체 진입점

[판독: 어셈블리] 허브 → 모드 요청은 mgmet @0x7100049f14, main `CallMinigameModeScene` @0x710036027c·이름 표 @0x71015d840c의 기존 판독을 재사용한다. [허브 §3](mgmet_flow.md#3-진입점과-호출-흐름).

| 모듈 [판독] | 본체 연결 | 종료·제한 |
|---|---|---|
| mgm02 | SyncedSetupGame @0x7100016008 → MinigameModeFlow @0x7100017728 → Round0 FirstRoundFlow @0x71000178f0 / 그 뒤 ResultFlow @0x7100018300 → DecideMgFlow @0x7100017b20 → StepToMinigameScene @0x7100018030 [C02] | Round==max이면 ResultFlow→ReturnToEntranceScene @0x7100018740. Round>max는 Sleep(-1). SetRound 호출 인자가 C에서 빠짐 |
| mgm03 | SyncedSetupGame @0x7100008960 → MinigameModeFlow @0x7100009780 → StartFlow @0x7100009bc0 / ResultMinigameFlow @0x710000b3a0 → DicideMinigameFlow @0x710000a440 [C03] | Round>=MaxRound의 결과 분기에서 flag0x1a·Entrance9·RequestReturn. MaxRound/SetRound 값 인자는 빠짐 |
| mgm04 | SyncedSetupGame @0x71000150c8 → UpdateMgmWork @0x7100015c88 → MinigameModeFlow @0x7100015f70 → FirstRoundFlow @0x7100016190 / ResultFlow_Cut01/02 @0x7100016330/@0x7100016390 → SelectNextMgFlow @0x7100016580 [C04] | 양팀 승수<목표일 때만 계속. RM_MinigameModeFlow @0x710001aa90는 매칭/연승·Entrance10의 별도 경로 |
| mgm05 | MinigameModeFlow @0x710000956c의 Scene+0x258 상태0/1/2 → 도입/AfterMaching @0x710000aeb0/AfterGame @0x710000c210; DicideMinigameFlow @0x7100010d90 [C05] | 승패 결과 메뉴·CheckMoveMatching @0x710000f9cc 반환으로 재매칭 또는 Entrance11·RequestReturn. 온라인 계산은 공용 문서 참조 |
| mgm06 | SyncedSetupGame @0x7100010e54 → SetMinigameResultToMinigameModeWork @0x71000111c0 → MinigameModeFlow @0x710001140c → OpeningFlow @0x71000115a0 또는 CallMinigameScene @0x7100011610 [C06] | Round5는 VictoryFlow::MainFlow @0x710001e5e0 → RewardFlow @0x7100011750·Entrance12·RequestReturn. 실패는 OpeningType2 경로 |

[데이터] `Dicide`·`AfterMaching`·`FirstRount`·`TeamVitory` 등 원본 식별자의 철자는 TSV 그대로 유지한다. [fn03]·[fn04]·[fn05]·[fnMain].

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

[판독] 챌린지 결과 UI는 Order와 Mgm02GetResultRank를 네 번 읽어 PlayerOrderAndRank 4항목을 만든 뒤 FUN_7100068d90을 호출한 뒤 순위+1·TotalCoinCount·개별 게임 결과를 표시한다. 우승 발표 reader는 rank==0 조건으로 Order0~3을 수집한다. [미확정] getter의 Order 인자와 정렬/발표 helper C가 빠져 동점의 안정 순서·메시지 선택을 확정하지 않았다. 코인 지급·rank 계산은 §6.4에서 확인했고, 최종 Work setter 본체는 남는다. mgmet @0x7100066610/@0x7100003b70 [callers]; main @0x71001f33a0/@0x71001f33d0 [fnMain].

[판독] 데일리 결과 UI는 DailytrialResultData의 IsGotStarBefore·IsWinLose·IsGetStar·GetRank를 읽어 이전 스타·이번 스타·순위를 표시한다. 이 함수는 스타 지급 산식의 writer가 아니다. [미확정] 승패형 게임과 rank형 게임의 별 지급·동점 처리·중복 지급 방지는 해당 Data의 Setup/SetupRandomMatch C가 필요하다. mgmet @0x710006c4e0 [callers], @0x71000083e0/@0x7100008ba4 [fnH].

[판독] 태그 결과 UI는 ID<152인 결과의 record+4/+5 bit0을 집계하고 어느 팀이 목표 이상 또는 결과 소진이면 멈춘다. 10개 초과 결과는 스크롤하며 최대 시작 위치는count−10이다. mgmet @0x7100078e70/@0x7100085900 [callers]. 실제 종료도 >=target임은 mgm04 @0x7100015f70 [C04]에서 확인했다. [미확정] getter index 인자·Work record 물리 배치는18 추가 판독 참조다.

[판독] 태그 복귀 연출은 각 팀 승수==목표를 승리 모션/이름 선택에 사용한다. 로컬에서 승리 팀의 상대 승수가0이면 업적 ID0x45를 두 팀원에게 요청한다. 결과 UI 후 로컬 분기에서 WinContinuousCount·WinCount 보상 카운터를 호출하고 MGMRewardUiFlow → BGM 정지 → FadeOutWait 순서로 진행한다. mgmet @0x71000818e0 [callers]. [미확정] 카운터·보상량은 @0x71000864a0/@0x71000866fc [fnH] C가 없어 보류한다. UI의 >= 집계와 복귀 연출의 == 비교를 실제 모드 종료 비교로 합치지 않는다.

### 3.6 추가 C 판독: 한 판 결과에서 다음 모드 상태로

| 모드 [판독] | 결과 소비·다음 선택 | 한계·출처 |
|---|---|---|
| mgm02 | SyncedSetupGame은 직전 회차 유형으로 CoinMgr 지급→누적→RankMgr→SetMgResult→다음 LotteryNextMg 순서. Round0은 결과 추가0; 최종 전원 rank3이면 전원0으로 보정 | mgm02 @0x7100016008/@0x710001704c/@0x7100017408 [C02]. Work setter 값 인자 누락·공용 저장은18 |
| mgm03 | Rule0은 GameRank를 읽되 unsigned>2이면3. 그 밖 승자 WinLose==1이면0·비승자는 승자 수, 승자0명이면 모두3. 팩 ID 슬롯+0x5c+Round×4를 선택 | mgm03 @0x7100008960/@0x710000a440 [C03]. 팀/스타 지급의 최종 Data writer는 미확정 |
| mgm04 | TeamMgr는 팀원 중 누구라도 WinLose1이면 해당 팀 승리. 결과 code1=A만·2=B만·3=양팀·4=양팀 아님. code3은 양팀 승수+1 | mgm04 @0x710001d260/@0x710001ce70/@0x7100015c88 [C04]. 팀별 Work 기록 형식은18 |
| mgm05 | local operation player 승리 여부로 ResultWin/ResultLose. 성공·재도전 분기에서 다음 듀얼 flag를 옮기며 Round%3==2 조건을 사용 | mgm05 @0x7100003ff0/@0x7100012bf0/@0x71000141f0 [C05]. [미확정] Round가 어떤 성공 누적을 뜻하는지는 빠진 getter/setter 인자로 보류 |
| mgm06 | Round0은 결과 추가0. 직전 보스 전원 승리와 네 rank<4를 확인한 뒤 보스ID·judge0·네 rank를 mode 결과에 전달 | mgm06 @0x71000111c0/@0x7100011ed0 [C06]. ring 소유·수명·공용 writer는 [18 §4.3·5](../engine/18_scene_work.md#43-gameworkminigamemodeworksyncminigamework) 재사용 |

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
| [미확정] 모드 고유 Work | mgm02 결과/코인/이력·mgm04 승수/이력 API9함수의 C는 [GAP]에 있음 | main @0x71001f3120/@0x71001f3370/@0x71001f3470/@0x71001f35d0/@0x71001f396c/@0x71001f3974/@0x71001f39e0/@0x71001f3be0/@0x71001f3d50;18담당 판독 공유는C.4. 이번 재판독0 |

[판독] 승·패·무는 1/0/2다. 프리 플레이의 history 승점은 raw byte와 `(judge!=0)` 비교이며 코인 수·게임 rank·MVP 점수의 대체물이 아니다. main @0x71002f0ba0/@0x71002f4840/@0x71002f4a30 [결과 §6.1](minigame_result.md#61-패턴-고르기-fun_71002ee230), @0x71001f2a80 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring).

### 4.1 후속 판독: 모드 결과·팩 reader 필드

| 객체/필드 [판독] | 확인한 reader·크기 | 제한·출처 |
|---|---|---|
| 데일리 로드 레코드 | mgpack 입력 stride0x5c → 런타임 레코드0x68. MGList::GetMinigameID로 이름3개를 해석해 추가 ID3개를 저장 | main @0x7100361e00 [DAILY-C]. 숫자 ID 값/매핑은 기록하지 않음 |
| 데일리 조합 | packcombo 입력·런타임 값은 s32×3, 0xc. 로더는 mgpack/packcombo 파싱 둘 다 성공해야 진행 | main @0x7100361e00 [DAILY-C]; 파서 @0x7100362300/@0x71003624e0 [fnMain] C 없음 |
| 팩 저장 목록 | Scene+0x110/0x118 begin/end, 조합 목록+0x128/0x130. 각 목록의 smart pointer 항목 stride0x10 | main @0x7100362860/@0x7100362bcc [DAILY-C]. 공용 SceneBase/Work 수명 해석은 [18 §4·5](../engine/18_scene_work.md#5-상태수명) 재사용 |
| 챌린지 결과 reader | Mgm02GetMgResult 반환 record[0]은 thumbnail ID로 사용. record[5+Order]의 s32를 표시용으로 읽음 | mgmet @0x7100066610 [callers]; main getter @0x71001f32cc [fnMain] C 없음. 전체 record 구조·코인 writer 의미는 미확정 |
| 태그 결과 reader | ID s32 @+0, 두 팀 집계용 bit0 @+4/+5. TeamData reader는 팀당 stride0xc, 팀원 Order는 +4/+8 | mgmet @0x7100078e70/@0x71000818e0 [callers]. getter 반환 영역의 관찰이며 Work 물리 offset을 부여하지 않음 |

### 4.2 추가 C 판독: 고유 필드·기본 상수

| 객체·필드 [판독] | 확인값 | 출처·제한 |
|---|---|---|
| SceneParamsGame 기본 | +0x08/+0x0c/+0x10/+0x14 순위 코인10/3/2/0, +0x18 Bonus 계수2, +0x1c Battle징수10 | mgm02 create @0x710001b33c, getter @0x710001b534/@0x710001b710/@0x710001b718 [C02]. asset override는 미확정 |
| 회차 유형 기본 | 5회 [1,2,1,3,2]; 7회 [1,1,2,1,3,1,2]; 10회 [1,1,2,1,2,1,3,1,1,2] | mgm02 create @0x710001a954/@0x710001ac20/@0x710001af80·MgType @0x710001b580 [C02]. 1=Normal·2=Bonus·3=Battle은 DecideMgFlow @0x7100017b20 |
| ParamMgr | SyncedSetupGame이 Scene Params 참조를 받음 | mgm02 @0x7100011f48 [C02]. 실제 asset override loader 경로는 미식별 |
| CoinMgr | 4인 직전 rank·이번 지급·징수·누적 입력; +0x30은 전원 징수 요구량을 냈는지 | mgm02 @0x7100003e60/@0x710000484c [C02]. 공용 Work offset으로 전용 객체 offset을 옮기지 않음 |
| MgMgr 후보 | vector 시작/끝의 ID 배열; Rule7·Available·체감·이력을 확인 | mgm02 @0x710000f0b0 [C02]. 최대회차 표 DAT @0x710005036c의 내용은 C에 없음 |
| MGList 런타임 | 152행×0x20; 규칙 +0x10, 이름 hash +0x14, flags +0x18. Available bit0·Coin bit2·BD mode1 bit0x20/그 밖 bit0x10 | main @0x71001e14b0/@0x71001e15d4/@0x71001e1600/@0x71001e1630/@0x71001e1690 [GAP]. 배열 초기화·JSON 순서 대응은 미확정 |
| 데일리 팩 진행 | 선택 Scene+0x360 index0~2, 조합+0x368/0x370, 팩3개+0x380/0x390/0x3a0; SyncData+0 팩ID·+4 조합index·+8 zero | mgmet @0x7100056e10/@0x7100056f40 [MODE-H]. Work setter 값 누락은 보류 |
| 서바이벌 | Scene+0x230 체감flag, +0x231 현 듀얼flag, +0x232 다음 듀얼flag, +0x258 flow상태. 투표UI +0x234/238/23c 후보3·+0x240..24c 4표·+0x250 최종ID | mgm05 @0x7100003ff0/@0x7100017bf0/@0x7100018690 [C05]. 모드 객체에서 관찰한 필드 |
| 보스 course 결과 | 네 점수 +0x50..5c·네 rank +0x60..6c·정렬 playerID +0x70..7c. ScoreTable DAT @0x7100049a30 | mgm06 @0x710002329c [C06]. 점수 테이블 값·정렬 동률 표시 순서는 미확정 |

[판독] Name→ID는 FNV-1a32 hash를 계산해 152행의 +0x14와 비교하고 첫 일치 index를 반환한다. 문자열 재검증은 이 getter에 없으며 미일치는0xffffffff다. JSON122행 순서로 ID를 만들지 않는다. main @0x71001e14b0 [GAP].

## 5. 상태·수명

| 경계 [판독] | 확인한 상태 변화 | 제한·출처 |
|---|---|---|
| 규칙 UI | Rule In→Update→Out/GetResult→cache write; 설명 보기 뒤 Rule 재진입 | mgmet §3.2의7주소 [callers]. 빠진 값 인자는 보류 |
| 챌린지 한 판 | 결과 소비 → 누적·rank → 다음 후보 Lottery; Round==max는 Lottery를 생략하고 최종 결과/복귀 | mgm02 @0x7100016008/@0x7100017408/@0x7100017728 [C02]. SetRound의 실제 전달값은 빠짐 |
| 챌린지 이력 | 후보 소진 시 Clear→SetTarget→선택→AddPlayed. 회차 유형은 다음 Round의 Params를 읽음 | mgm02 @0x7100017408/@0x710000ee3c [C02]. Clear 뒤 직전게임 제외는 이 흐름에 없음 |
| 데일리 날짜 경계 | 팩 화면 남은 시간00:00:00이면 교체 안내→reset/reload; timer는 f32 dt 감소. A선택 검사가 시간 경계보다 먼저 | mgmet @0x7100056f40 [MODE-H]. 같은 틱의 A는 옛 팩을 선택할 수 있음 |
| 태그 계속/종료 | 양팀 승수<target이면 다음 게임, 어느 팀>=target이면 최종. 양팀 무승리도 계속 | mgm04 @0x7100015f70/@0x7100016390 [C04]. RM의 서버 값·이력 Work 내부는 담당 문서 |
| 서바이벌 계속/종료 | 결과 menu·CheckMoveMatching으로 매칭 재진입 또는 Entrance11 복귀; Lose RetryMenu 반환1은 재도전 | mgm05 @0x710000c210/@0x710000f9cc/@0x71000141f0 [C05]. 실력 포인트·서버 처리 완료는 미확정 |
| 보스 실패/완주 | Round0 첫 오프닝·승리 오프닝1·실패 오프닝2; 5게임 완료 시 Victory→Reward→Entrance12 | mgm06 @0x710001140c/@0x71000115a0/@0x7100011750 [C06]. 보상 callee·슬롯ID는 남음 |
| 공용 결과·Work | mode 결과 ring 소유·GameWork 참조 facade·장면 전환 수명은 기존 계약 재사용 | main @0x71001f0460·[18_scene_work §4.3·5·9](../engine/18_scene_work.md#43-gameworkminigamemodeworksyncminigamework); 이번 공용 수명 새 판독0 |

[설계] Fiber의 Wait를 상태 전환으로 옮기고 한 틱마다 In/메시지 시작을 반복하지 않는다. commit 뒤 누적하며 실패/null은 누적하지 않는 웹 계약은 [한 판 §12.12.4](minigame_scene.md#12124-결과-갈래와-기록-계약)·[DESIGN §10.5][design]를 따른다. 이는 원본 C에서 빠진 SetRound 인자를 채웠다는 뜻이 아니다. mgm02 @0x7100018030 [C02].

## 6. 계산식·의사코드

### 6.1 확인된 추첨·난수와 추천 근사

| 대상 | 후보·가중치·중복·형태 | 난수 소비·근거 |
|---|---|---|
| [판독: 어셈블리] mgm01 수동 랜덤 | 현재 필터 unlocked 후보, 0개→−1. 이 두 함수에 이력 제외 없음 | SyncRandRange(0,N), mgm01 @0x71000165bc/@0x710001b480 [프리 플레이 §6.3](mgm01_freeplay.md#63-끝-행과-래핑랜덤) 재사용 |
| [판독] mgm01 연속 후보 | unlocked·flag6·인원/필터·현재ID 제외 | mgm01 @0x710001c2a0 [프리 플레이 §8.3](mgm01_freeplay.md#83-미니게임-호출복귀-계약) 재사용 |
| [판독] mgm02 | Available·Rule7 Chara·체감·미사용; 소진 시 이력 Clear. 게임별 weight 읽기 없음 | 선택마다 SyncRandRange 하한0, 상한 인자는 빠짐. mgm02 @0x710000f0b0/@0x710000f030/@0x7100017408 [C02]·§6.4 |
| [판독] mgm03 | 날짜 조합→팩선택→팩의 mg1/mg2/mg3 고정순서 | DicideMinigameFlow 내 SyncRand 호출0. mgm03 @0x710000a440 [C03]·mgmet @0x7100056f40 [MODE-H] |
| [판독] mgm04 | Available·Rule1 2VS2·체감·history 제외 후 shuffle; 후보不足이면 history초기화 | 후보 M>=2이면 SyncRandMod M−1호출; 룰렛은 이어 RangeF/Range 각1호출. 상한 인자 빠짐. mgm04 @0x710000d860/@0x710001fc64/@0x7100022c74 [C04]·§6.6 |
| [판독] mgm05 | 명시목록26→VS4/듀얼·Available·체감. 전체 이력 필터 없음. 전원일치 또는4표 룰렛 | 투표 후보3개의 SyncRandRange·CPU 지연 RandRangeF·듀얼 후보 shuffle·룰렛 RandRangeF/Range. mgm05 @0x7100014fb0/@0x71000165b0/@0x71000154f0 [C05]·§6.6 |
| [판독] mgm06 | kBossMinigameIds[Round]·Round0~4, 고정순서. 배열 내용은 미확정 | Call/Flow 선택 구간 SyncRand0. mgm06 @0x7100011610/@0x710001140c [C06] |
| [판독] 보드 | 직전 동일rule ID·체감·피로 제외 → 최소 playcount 우선 → shuffle; 인원형태 확률은 JsonMgTeam | bd01 @0x71000b09f0/@0x710028b7f0/@0x710028cb00 [BOARD-C]·§6.5. JsonMgTeam @0x71000690e0 C 없음 |


[판독: 어셈블리] 난수 엔진은 MT19937. sync 정수 분포는 n<2이면 소비0·그 외 `floor(u32*n/2^32)`로 출력1개를 소비한다. async 정수 분포는 기각 재추첨 때문에 소비 수가 달라진다. 원본 장면마다 seed 설정은 main @0x71001c94cc→@0x7100189438. 기존 [코어 §6.6·6.7](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행)을 인용하며 이번에 알고리즘 C를 다시 읽지 않았다.

[설계] 아래 식은 이식 부분집합의 추천 추첨 근사다. 원본보다 작은 집합과 경계 중복 회피를 위한 추천 변형이다. 근거가 된 원본 경계는 mgm02 @0x7100017408 [fn02]·mgm01 @0x71000165bc [프리 플레이 §6.3](mgm01_freeplay.md#63-끝-행과-래핑랜덤)·난수 분포는 main @0x7100189438 [코어 §6.6](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행).

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

[설계] 이 추천 근사는 작은 집합을 소진하면 새 순환을 시작하고 가능한 경우 경계 연속 중복도 피한다. 원본 mgm02의 Clear 뒤 직전ID 제외는 확인되지 않았으므로 이 부분은 웹 변형이다. seed가 같아도 후보 수·순서·표시용 호출 수가 달라 원본 게임열과 같다고 주장하지 않는다. mgm02 @0x7100017408 [C02]·bd01 @0x710028c570 [BOARD-C]·main @0x7100189438 [코어 §6.6](../engine/01_core.md#66-난수-알고리즘-판독-디스어셈블리-core_b3c-1578행).

[판독] 원본 코인·순위·목표 종료·보스 점수 합은 §6.4~6.6에서 판독했다. [미확정] 배틀 rank0비율·보스 ScoreTable 값·스타 지급·실력 포인트·메타 보상량은 부록C에 남는다. mgm02 @0x71000049c0 [C02]·mgm06 @0x710002329c [C06]·mgmet @0x71000083e0 [fnH].

### 6.2 후속 판독: 데일리 조합·시간

[데이터] [PACK]의 mgpack[].packid는 행 순서대로1~25이고 packcombo는 40행이다. packid1/packid2/packid3은 모두1~25이며 각 행의 3팩은 서로 다르다. 40조합 모두 고유하다. 기존 25팩·75슬롯·49게임 집계는 그대로다. 조합은 게임3개의 배열과 다른 층이다.

[판독] GetMgPackDailyTrialData(id)는 목록이 비어 있으면 Abort, 1<=id<=count이면 id−1 항목, 그 밖은 첫 항목을 반환한다. GetComboIndexFromNowDateTimeDailyTrialData는 FUN_71003628bc가 반환한 정수를 조합 수로 정규화한다. 이 호출에서 관찰되는 식은 n>0이면 ((day % n)+n)%n, n==0이면0이다. main @0x7100362860/@0x7100362bcc [DAILY-C]. [미확정] day의 기준·증가·clock 선택은 helper @0x71003628bc [fnMain] C가 없어 확정하지 않았다.

[판독] 남은 시간 reader는 UserSystemClock을 읽고 bool==true이면 NetworkSystemClock으로 다시 읽는다. CalendarTime 상수 {0x07b2,0x00060101,0}을 ToPosixTimeFromUtc에 전달하고 0x15180=86400초 주기로 시·분·초를 계산한다. 일반 범위에서 기준과 시각의 차이를 δ라 하면 r=positiveModulo(δ,86400), s=86400−r이며, hour=(s//3600)%24·minute=(s//60)%60·second=s%60이다. r==0일 때 반환은00:00:00이다. main @0x7100362a10 [DAILY-C]. [미확정] 매우 큰 시각 차이의 보정 분기·CalendarTime 필드 배치는 미확정이며, 실제 팩 교체 caller는 §6.6에서 확인했다.

[추정] CalendarTime의 일반적인 field 순서를 적용하면 위 상수는 1970-01-01 06:00 UTC에 대응한다. 현재 C에는 field별 명칭이 없으므로 정확한 교체 시각의 구현 기본값으로 승인하지 않는다. main @0x7100362a10 [DAILY-C], 날짜 계산 callee @0x71003628bc [fnMain].

### 6.3 후속 판독: 결과 집계의 범위

[판독] 태그 결과 표시의 승수는 각 결과 byte의 bit0 누적이다. 원본 WinLose1/0/2 규칙을 이 전용 레코드의 전체 형식으로 단정하지 않는다. 공용 Work 필드 판독은18에 맡겼기 때문이다. 아래는 reader에서 확인한 비교만 재현하는 의사코드다. mgmet @0x7100078e70 [callers]; main Mgm04AddMGResult @0x71001f39e0 [fnMain].

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

[판독] mgm02 CoinMgr의 지급·징수·보정·기본 상수는 추가 C에서 판독했다. 값과 남은 배틀 rank0 테이블은 §6.4·부록C를 참조한다. mgm02 @0x7100003f50/@0x71000042d0/@0x710001b33c [C02].

### 6.4 추가 C 판독: mgm02 회차·추첨·코인

[판독] 후보는152 ID를 순서대로 검사해 Available·GameRule7·flag6 또는 !UseGyro·!Mgm02IsPlayedMgId를 모두 만족한 ID다. 유형1/2/3은 같은 Chara 후보 집합에서 Normal/Bonus/Battle 연출·코인 계산을 바꾸며 GameRule을 바꾸지 않는다. mgm02 @0x710000f0b0/@0x710000efe0/@0x7100017b20 [C02]. [데이터] 이를 [ND] `GameRule=Chara`에 대응하면10종이며 Gyro!=-1은1종이다.

[판독] MgMgr의 후보가 비었으면 추첨 결과−1; Scene은 이력 Clear→재구성→재추첨하고 여전히−1이면 Abort한다. Round==GetMaxRound는 다음 추첨을 생략한다. 선택마다 SyncRandRange를 호출하지만 상한 인자가 C에서 빠졌다. 별도 weight는 관찰되지 않는다. mgm02 @0x710000f030/@0x710000ef94/@0x7100017408 [C02]. [추정] 정상 인덱스 선택을 위한 후보 수 상한의 균등 추첨으로 해석하되 정확한 난수 상한은 승인하지 않는다.

[판독] 기본 회차 유형은 §4.2의5/7/10 길이 표다. Flow가 Round0→첫 선택, 0<Round<max→결과 후 다음 선택, Round==max→결과 후 복귀로 분기하므로 Bonus/Battle은 추가 게임 회수가 아니다. mgm02 @0x7100017728/@0x710001b580 [C02]. [판독: 어셈블리] UI5/7/10은 mgmet @0x710007efdc [규칙 §4.3](mgmet_ruleconfig.md#43-값-표와-버튼-전-함수군) 재사용. [미확정] GetMaxRound의 DAT @0x710005036c 내용과 SetRound 인자는 별도다.

| 계산 [판독] | 식·분기 | 출처 |
|---|---|---|
| 일반 | rank−1이면0, rank0..3이면 Params.RankCoinCount(rank), 기본10/3/2/0 | mgm02 @0x7100003f50/@0x710001b534/@0x710001b33c [C02] |
| 보너스 | rank 지급은 기본 rank 코인×coef; BonusMgGotCoinCount는 raw MGGotCoinCount×coef, 기본coef2 | mgm02 @0x7100003f50/@0x7100004980/@0x710001b710 [C02]. 두 입력 경로를 같은 raw 값으로 합치지 않음 |
| 배틀 징수 | 각 p: levied[p]=min(total[p],levy), total[p]=max(total[p]−levy,0), L=sum(levied), 기본levy10 | mgm02 @0x710000484c/@0x7100004948/@0x710001b718 [C02] |
| 배틀 지급 | rank0이 한 명이라도 있으면 trunc(L×ratio(rank,동순위 수)/100); rank0이 없으면 본인 levied 반환 | mgm02 @0x7100003f50/@0x71000049c0 [C02] |
| 확인된 배분율 | rank2 인원1→10%,2→5%,그 밖0; rank1 인원1/2/3→20/15/10%; rank0은 DAT 표 | mgm02 @0x71000049c0 [C02]; DAT @0x710004e3c0 내용 미확정 |
| 남은 배틀 코인 | R=L−sum(지급)>0이면 rank0부터 동순위 인원k에게1씩 지급. f32(R)/k<1이면 중단하여 잔여가 남을 수 있음 | mgm02 @0x71000042d0 [C02]. rank3 뒤는3 반복; RNG 없음 |
| 총코인 rank | coin 내림차순, 값이 감소할 때 rank+1인 dense rank. 같은 값은 같은rank. 전원0인 초기 RankMgr는3; 최종 SetMgResult에서 전원0으로 보정 | mgm02 @0x7100013200/@0x71000139a0/@0x71000146c0/@0x710001704c [C02]. 안정 표시 순서는 확정하지 않음 |
| 기록·최종 보상 | 각 결과 record+0x14/+0x18/+0x1c/+0x20==0의 최장 연속 길이→CharaMgBattleMgStreak; count/rank→CharaMgBattleRank | mgmet @0x7100055370 [MODE-H]. 실제 지급 수량은 main @0x7100231788/@0x71002318b8 C 없음 |
| 하이스코어 | 로컬 operation player 저장 +4/+8/+0xc를 tableKind0/1/2로 고르고 현재 최장 연속이 더 클 때 SaveRequest; RM 별도 | mgm02 @0x7100018cc0 [C02]. 저장 완료는 실행 확인 없음 |

[판독] CoinMgr::ExistsGotCoinPlayer는 네 지급 중 양수 존재를 검사한다. 지급자가 없으면 ResultFlow가5초 기다리는 경로를 탄다. mgm02 @0x7100004960/@0x7100018300 [C02]. [미확정] 누적 total을 Work에 쓰는 실제 setter 전달값과 전용 record 배치는18의 추가 판독 대상으로 남긴다.

### 6.5 추가 C 판독: 보드 후보·인원 형태·난수

[판독] GetList는 rule별152행을 검사하고 bypass가 false일 때 Available·IsBD01을 요구한다. VS 전용 목록은 Rule0·Coin제외·체감을 거르고 보드 종류별 고정 ID를 추가한다. GetPlayID는 Turn1 또는 BoardFlag7에서 Coin을 제외한다. bd01 @0x71000afb90/@0x71000aff40/@0x71000b0940 [BOARD-C]. [미확정] C의 고정 숫자 ID를 JSON Name으로 매핑하지 않는다.

[판독] GetPlayID_는 같은 rule의 직전 ID·Coin조건·flag6 off 체감·피로를 제거하고 ushort playcount가 최소인 후보만 남긴다. M>=2면 뒤에서 앞으로 SyncRandMod를 M−1회 호출하며, M1이면0회다. M0은 rule별 [0,22,34,70,0,0,0,54,64,74] fallback을 사용한다. modulus 인자는 C에서 빠졌으므로 호출 수와 인덱스 범위 복원을 구분한다. SetHistoryID는 마지막ID 쓰기와 AddPlayCount를 호출한다. bd01 @0x71000b09f0/@0x71000b1228 [BOARD-C].

[판독] Chara 경로는 character0x12→ID0x36,0x10→0x39,1→0x37,그 밖−1을 사용하고 후보에 없으면0x36으로 되돌린다. 이 함수에 추첨 RNG는 없다. bd01 @0x71000b1130 [BOARD-C]. [미확정] 숫자 ID의 게임 이름은 런타임 초기화가 없어 붙이지 않는다.

| 인원형태 [판독] | 입력·분기 | 결과·제한 |
|---|---|---|
| 매스색 분류 | MapColor0/1 고정색2개·그 밖 미정 u명·색0 r명 | bd01 @0x710028b7f0 [BOARD-C]. BoardMode2 특수 roster 경로는 별도 |
| 팀데이터 index | u0/4는 type0 경로; u1이면 r1~3→9−r,그 밖9; u2 r2→3/r1→4/그 밖5; u3 r1→1/그 밖2 | 같은 SetPlayerWork. JsonMgTeam::GetDataV(index,VS4Count<3)로 미정색 채움 |
| 최종 분류 | 모두 한색→Rule0,1대3→Rule2·solo Team0,2대2→Rule1·색0 Team1/색1 Team0 | 같은 SetPlayerWork. JsonMgTeam @0x71000690e0 [fnBD] C 없음으로 가중치·그 내부 RNG 미확정 |

[판독] GetMinigameList는 last/gyro 제외 후보의 최소 playcount를 우선한다. 3개 미만이면 그 최소 후보 count를 올리고 전체 후보로 돌아가 최소+1 이하·직전Choice 제외를 시도하며, 그래도3개 미만이면 전체 후보로 되돌린다. 최종 shuffle 후 처음3개를 AddCount·SetChoice한다. bd01 @0x710028cb00 [BOARD-C]. [미확정] 빈 집합/3개 미만을 안전하게 처리한다는 근거는 없으므로 작은 웹 부분집합에 그대로 적용하지 않는다.

[판독] RunRoulette는 이미 정해진 당첨ID를 받는다. 이를 decoy에서 제거·체감 필터→decoy shuffle D−1 SyncRandMod→당첨ID를 첫 슬롯과 최대5 decoy로 구성하며 Coin게임을 최대1개 표시한다. SetHit(0) 뒤 Wait한다. 이는 실제 승자 선택 뒤 추가 난수를 소비하는 표시 경로다. bd01 @0x710028c570 [BOARD-C].

[판독] Update는 SetPlayerWork→조건부 RunSelect 또는 GetPlayID→RunRoulette→ArchiveMg 준비→Coin flag/VS4 연속 횟수 갱신→RunCallMiniGame 순서다. bd01 @0x710028d270 [BOARD-C]. [미확정] RunSelect @0x710028ca18·RunCallMiniGame @0x710028a260 C가 없으므로 실제 history commit 시점은 이 Update에서 확정하지 않는다.

### 6.6 추가 C 판독: 데일리·태그·서바이벌·보스

[판독] 데일리는 GetComboIndex의 true 경로를 선택해 현재 조합을 저장하고, 세 packid를 getter로 읽어 선택 index0~2에 대응한다. A는 선택 팩을 SyncData+0와 PassMgPack에 넣는다. 날짜 교체 reset helper는 C가 없다. mgmet @0x7100056e10/@0x7100056f40/@0x7100056c50 [MODE-H]·[fnH]. 게임 선택은 팩+0x5c+Round×4로 고정되어 추첨 RNG가 없다. mgm03 @0x710000a440 [C03].

[판독] DailytrialReturnFlow는 저장 +0x14..0x90의32개 word에서 (word>>4)&0xffff를 합산하고 합>=10이면 업적0x44 요청을 한다. IsCompleteNow와 두 SaveID가 동시에0이 아닌 조건에서 DailyTrialDailyBonus를 호출한다. mgmet @0x71000597a0 [MODE-H]. [미확정] 실제 스타/중복 방지·보너스량은 Data/Reward callee가 남는다.

| 태그 [판독] | 규칙 | 출처·제한 |
|---|---|---|
| 선택권 | 뒤처진 팀; 동률이면 직전 단독 승리 팀의 반대 팀, 그 밖 Round>1의 이전 선택팀·초반 기본0. 선택팀 내 playerindex는0/1 교대 | mgm04 @0x710001ce70/@0x7100015c88 [C04]. GetMGResult code는 §3.6 |
| 후보 | Available·Rule1·체감·이력 제외→shuffle→최대 요청수+1을 남김. 선택창 요청3→최대4, 표시3 | mgm04 @0x710000d860/@0x710001ffa0 [C04]. shuffle 호출M−1 |
| 이력 해제 | Roulette 후보<5 / Selector 후보<4이면 NeedClear; 선택ID AddHistory 뒤 필요할 때 InitHistory | mgm04 @0x710001fc64/@0x7100022c74/@0x7100018060 [C04]. 해제 뒤 직전ID 유지 보장은 없음 |
| UI 경로 | Round<2 또는RM→룰렛, 그 밖 선택창. 룰렛 Setup은 후보요청4→최대5(예비1), Update는4슬롯 표시·선택 | mgm04 @0x7100016580/@0x710001e870/@0x710001ed50 [C04]. 최종 RNG 상한 인자는 빠짐 |
| RM | 결과/재매칭→현재 flow flag에 따라 continue 또는 Fade·RM HighScoreUpload·Entrance10 | mgm04 @0x710001aa90 [C04]. ClearSession·동기/온라인 소유권은 [12_online_sync](../engine/12_online_sync.md) 재사용 |

[판독] 태그 룰렛 Update는 후보 shuffle 뒤 SyncRandRangeF(1.0,1.33)와 SyncRandRange 하한0을 각각1회 호출한다. 선택 index는 회전 전 정하고, f32 dt를 누적해 대기0.07씩 늘리며 표시를 돌린 뒤 후보[index]를 최종ID로 쓴다. mgm04 @0x710001ed50 [C04]. [미확정] 정수 상한 인자는 누락되어 정확한 범위·MT 출력 소비 총수는 확정하지 않는다. In/Decide 함수에는 추가 추첨 호출이 없다. mgm04 @0x710001ed04/@0x710001f4b0 [C04].

[판독] 서바이벌 GetMinigameIdList는 JSON 로드 record의 ID+8을 Rule0/3·Available·체감으로 필터하고 PlayedHistory를 검사하지 않는다. VS4 투표는 서로 다른3후보를 SyncRandRange로 만들고15초 동안 네 표를 받는다. CPU는 선택·0.5~1.0 지연 난수를 별도로 소비한다. mgm05 @0x710000fb40/@0x71000165b0/@0x7100017bf0 [C05].

[판독] DicideVoteMgSelectFlow는 네 표가 전부 같은 때만 최종ID를 기록한다. 3:1·2:2도 룰렛으로 간다. AdvanceVoteToRoulette는 네 표를 중복 포함 네 슬롯으로 전달한다. 듀얼은5후보를 shuffle한 첫4개를 슬롯에 넣는다. 룰렛은 속도/시간용 SyncRandRangeF(1,1.33)와 당첨 index용 SyncRandRange를 호출한다. mgm05 @0x7100018690/@0x7100018c50/@0x7100014fb0/@0x71000154f0 [C05]. [추정] 슬롯 균등 상한4라면 VS4의 game 확률은 표수/4지만 상한 인자가 빠져 확정 비율로 쓰지 않는다.

[판독] GetWinPattern은 승자 수!=1을 bit0, 승자 전원이 character0x12/0x0d 중 하나인 조건을 bit1로 반환하는 연출 선택이다. 실력 포인트 식이 아니다. mgm05 @0x710001a7d0 [C05]. [미확정] Rating·SkillPoint에 대응하는 고유 계산 함수는 이 판독 구간에서 식별되지 않았다.

[판독] 보스 격파는 플레이어가 비어 있지 않고 전원 WinLose==1일 때만 true다. Round<1 또는 한 명이라도0/2/−1이면 false다. CallMinigameScene은 kBossMinigameIds[Round]를 사용하고 team/rank/win 상태를 초기화·judge0으로 호출한다. mgm06 @0x7100011ed0/@0x7100011610 [C06]. 배열의 실제 ID는 pointer slot @0x7100057d98만 확인되어 요청표에 남는다.

[판독] 완주 결과는 정확히5개 기록의 네 rank로 각 ScoreTable[rank]를 합한다. rank는 자신보다 높은 총점의 인원 수인 competition rank다. 총점[9,9,5,2]이면[0,0,2,3]이며 전원동점은 전원0이다. MainFlow는 rank0 모두의 캐릭터 이름을 MVP 목록에 넣는다. mgm06 @0x710002329c/@0x7100011ba0/@0x710001e5e0 [C06]. [미확정] 점수 테이블 DAT @0x7100049a30 내용·동률 표시 정렬 순서는 미확정이다.

[판독] 보스 Reward는 결과 record byte+8..b==0의 최장 연속 길이→BossRushStreak를 호출하고 완주점수·rank에 따른 BossRushRank 경로를 잇는다. mgm06 @0x7100011750/@0x710001e5e0 [C06]. 지급 수량은 main @0x7100231c28/@0x7100231d3c [fnMain] C가 없어 보류한다.

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

### 7.1 추가 판독·병렬 판독 재사용

| 대상 [판독] | 확인한 연출 연결 | 출처·미확정 |
|---|---|---|
| 챌린지 | 첫 안내 업적0x41, Bonus 결정의1.2 대기, Battle 징수/가진 코인 감소 표시, Result의 coin chest·move 대기 | mgm02 @0x71000178f0/@0x7100018800/@0x7100018920/@0x7100018300 [C02]. 모션 클립 길이·카메라 수학은 미판독 |
| 데일리·태그 | 팩 이름·안내·바람 단계 소리, 태그 목표 안내·업적0x3f, 결과4패턴 | mgm03 @0x7100009bc0 [C03]·mgm04 @0x7100016190/@0x7100016390 [C04]. 소리 문자열 전체 목록은 기록하지 않음 |
| 보스 완주 | 점수 표시 소리 SQ_SE_MGM06_ED_PNT_APP·MVP rank0 이름 수집·보상 안내 완료 Wait | mgm06 @0x710001e5e0/@0x7100011750 [C06]. 점수 상수·클립 시간은 미확정 |
| 결과 UI profile 재사용 | mgm03 공용4칸, mgm05 flag0→4칸/flag1→2칸·승리 라벨, mgm06 별도 rank/score/history 조립 | mgm03 @0x7100019040/@0x7100018eb0·mgm05 @0x71000240a0·mgm06 @0x710001d5a0 [UI 부품 §6.6](../engine/ui_parts_catalog.md#66-새-c의-결과표statusname-조립). 이4함수 새 판독0 |
| 보스 Versus RT 재사용 | RT 참조 flow+0x10/+0x18 저장·color/depth attachment·clear setter 호출 | mgm06 @0x7100012cf0 [render_unify §3.4·5·11](../engine/render_unify.md#34-mgm06-별도-rt와-레이어-상태-교체). bool·치수·layer 번호 인자 누락; 재판독0 |
| 카메라·공용 UI | 공용 결과 무대·렌더·Work 계약을 담당 문서에서 재사용 | main @0x71002ee230 [minigame_result §12](minigame_result.md#12-웹-구현-계약--3d-결과-무대-2026-10-09-mg-result3d)·[18_scene_work §5](../engine/18_scene_work.md#5-상태수명)·[render_unify §5](../engine/render_unify.md#5-상태수명) |

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

| 사용 표 | 데이터 집합·실제 C 필터 | 제한·출처 |
|---|---|---|
| [데이터] 프리 플레이 F | [FP] gamedata112종·catalog동집합 | [판독] 잠금·솔로·오프라인은 mgm01 @0x7100008e70 [프리 플레이 §6.4](mgm01_freeplay.md#64-잠금new-조건-표) 재사용 |
| [판독][데이터] 데일리 D | 25팩75슬롯49종=VS4 28+1VS3 9+2VS2 12. 선택된 팩의 mg1/mg2/mg3 순서 | [PACK] `mgpack`; mgm03 @0x710000a440 [C03]. 날짜 helper·스타 Data는 미확정 |
| [판독][데이터] 서바이벌 S | 명시26종=VS4 21+듀얼5; rule/Available/gyro로 분리. 듀얼 룰렛은5중4를 표시 | [SURV] `mgList[].mg`; mgm05 @0x710000fb40/@0x7100014fb0 [C05]. exact 전환/포인트는 미확정 |
| [판독][데이터] 보드 N/H | BD01Normal78·Serious75; GetList는 Available·BDflag를 검사. 일반만3종=mg0110/mg0121/mg0303 | [ND]·[CA] `BD01*`; bd01 @0x71000afb90 [BOARD-C]. 인원형태 확률은 JsonMgTeam C 없음 |
| [판독][데이터] mgm02 C | Chara10종을 기본 모집단으로 사용. 체감off이면 Gyro!=-1 1종 제외→9; 사용이력 제외 | mgm02 @0x710000f0b0 [C02]; [ND] `GameRule/Gyro`. 타입1/2/3 모두 같은 rule7 후보 |
| [판독][데이터] mgm04 T | 2VS2 12종. 체감off이면3종 제외→9; 사용이력 제외·후보부족시 해제 | mgm04 @0x710000d860/@0x7100018060 [C04]; [ND] `GameRule/Gyro` |
| [추정][데이터] mgm06 B? | Boss 데이터5종, C는 고정5슬롯 | [ND] `GameRule=Boss`·mgm06 @0x7100011610 [C06]. 슬롯ID가 없으므로 이5종과 정확한 일치·순서는 미확정 |

### 8.3 catalog 112종 대응 표

[데이터] 아래 모든 이름은 [catalog] `code/name_ko`·규칙·체감·코인은 출처열의 [ND]/[CA] `mgList[Name=code].GameRule/Gyro/Coin`이다. F/D/S/N/H는 §8.2의 **정적 데이터 소속**이며 실제 추첨 허용과 다르다. `—`는 해당 정적 표/flag에 없음. [추정] B?는 Boss5종의 슬롯 일치 미확정 표시다. [판독] C/T는 mgm02 Chara·mgm04 2VS2 기본 후보이며 체감/이력으로 추가 필터한다. mgm02 @0x710000f0b0 [C02]·mgm04 @0x710000d860 [C04].

| 코드·한국어 이름 [데이터] | GameRule | Gyro | Coin | 정적 사용 F/D/S/N/H | 원본 후보 C/T·추정 B? [판독] [추정] | 필드 출처 |
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
| [`mg0501` · 과일 컨베이어][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0501` |
| [`mg0502` · 가로세로 머신 레이스][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0502` |
| [`mg0503` · 휘적휘적 팔씨름][catalog] | `2VS2` | 0 | 0 | F·D·N·H | T | [ND] `Name=mg0503` |
| [`mg0504` · 위험한 스윙 레이스][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0504` |
| [`mg0505` · 둘이서 카드 맞추기][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0505` |
| [`mg0508` · 거대 스테이크 자르기][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0508` |
| [`mg0509` · 돗시 보트 레이스][catalog] | `2VS2` | 2 | 0 | F·D·N·H | T | [ND] `Name=mg0509` |
| [`mg0510` · 그림자 그림 겹치기][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0510` |
| [`mg0601` · 폭탄병 도화선][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0601` |
| [`mg0602` · 서둘러라! 킬러 건너기][catalog] | `2VS2` | — | 0 | F·D·N·H | T | [ND] `Name=mg0602` |
| [`mg0701` · 코인 유적의 눈치 싸움][catalog] | `2VS2` | — | 1 | F·D·N·H | T | [ND] `Name=mg0701` |
| [`mg0702` · 숲의 코인 시소][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0702` |
| [`mg0703` · 플레시의 코인 강][catalog] | `1VS3` | 2 | 1 | F·N·H | — | [ND] `Name=mg0703` |
| [`mg0704` · 스케이트 코인 모으기][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0704` |
| [`mg0705` · 밧줄로 코인 얻기][catalog] | `2VS2` | 0 | 1 | F·D·N·H | T | [ND] `Name=mg0705` |
| [`mg0706` · 뿅망치로 코인 빼앗기][catalog] | `1VS3` | — | 1 | F·N·H | — | [ND] `Name=mg0706` |
| [`mg0801` · 맨몸 잠수 마리오][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0801` |
| [`mg0802` · 플레이트 건너기][catalog] | `VS4` | — | 1 | F·D·N·H | — | [ND] `Name=mg0802` |
| [`mg0903` · 쿠파주니어의 연속 챌린지][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0903` |
| [`mg0905` · 루이지와 수수께끼의 저택][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0905` |
| [`mg0906` · 로젤리나의 스노보드 레이스][catalog] | `Chara` | 0 | 0 | F·N·H | C | [ND] `Name=mg0906` |
| [`mg0907` · DK의 그루브 콩가][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0907` |
| [`mg0908` · 데이지 애슬레틱][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0908` |
| [`mg0909` · 피치의 휴일][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0909` |
| [`mg0910` · 마리오의 미니게임 메들리][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0910` |
| [`mg0911` · 와루이지 핀볼][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0911` |
| [`mg0912` · 요시의 산길 레이스][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0912` |
| [`mg0913` · 와리오의 퀴즈 쇼][catalog] | `Chara` | — | 0 | F·N·H | C | [ND] `Name=mg0913` |
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

| 선택 [설계] | 이유·차이·승인 상태 |
|---|---|
| 가장 가까운 원본=mgm02 | 고정5/7/10회·코인누적·Chance가 회수 안에 포함되고 보드가 필요 없다. mgm02 @0x7100017728/@0x7100017b20 [C02]·mgmet @0x7100054640 [callers]. 기본 생성값은 알려졌으나 정적 테이블·override·누락 인자는 남음 |
| N턴=미니게임 N회 | 원본의 선택값5/7/10 외 N을 허용하려면 유형표를 별도 정의해야 한다. N=5/7/10은 원본 기본표를 우선한다. mgm02 @0x710001b580/@0x710001b33c [C02]. 사용자 미승인 추천 |
| 장르 확장 | Chara10종을 전체112종으로 넓히면 게임규칙·팀구성과 지급 코인을 새로 설계해야 한다. 데일리49종·태그2vs2선취와도 별도다. §8.2·mgm02 @0x710000f0b0 [C02]. 미승인 추천 |
| 이식 부분집합 | 원본 후보∩등록∩입력/팀/결과 지원을 사용한다. 균등·소진 후Clear는 원본과 구조가 가깝지만 후보 축소·직전중복 회피·기본값 적용은 근사다. mgm02 @0x7100017408 [C02]·§6.1. 미승인 추천 |
| 현재 등록 | [registry] GAMES=[mg1801Game]은 Rhythm1종이며 원본 Chara 후보와 교집합0. 현재 원본 mgm02 시작은 불가. Rhythm만의 N회 파티는 별도 변형이며 이 문서에서 승인하지 않음. [CA] `Name=mg1801/GameRule`·mgm02 @0x710000f0b0 [C02] |
| 추첨 결과와 RNG | 원본은 게임 선택·표시용 shuffle·CPU 지연도 난수를 소비한다. 웹 부분집합 trace는 같은 seed라도 원본 추첨열과 동등하지 않다. bd01 @0x710028c570 [BOARD-C]·mgm05 @0x7100017bf0 [C05] |
| 결과 분리 | raw WinLose·game rank·coin·모드 누적·MVP 점수를 각각 보존한다. 코인 dense rank와 보스 competition rank는 서로 다르다. mgm02 @0x7100013200 [C02]·mgm06 @0x7100011ba0 [C06] |

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
| [설계] 라운드·실패 | N회 변형은 commit한 결과 N개에서 종료. null/실패/중단은 Round/점수 변경 없음. 원본 mgm02의 보너스/배틀은5/7/10회 안에 포함(§6.4) | main @0x71001f0460 [프리 플레이 §6.6](mgm01_freeplay.md#66-승패-표100판-ring), [한 판 §12.12.4](minigame_scene.md#12124-결과-갈래와-기록-계약) |
| [설계] 문서 품질 | 13절+부록, 실제 상대 경로, CommonMark 링크, 모듈/주소 대조, LF·BOM 없음, 대상 MD만 변경 | 부록D 검증 기록 |

[데이터] 이번 검증은 메모리에서 catalog/지정 JSON을 집계하고 링크·주소·문서 형식을 검사한 것이다. 분석 스크립트·C·INDEX·SHARED·JSON·에셋은 만들거나 수정하지 않았다. 원본/웹 실행·영상 대조는 없다. 확인 결과는 부록D에 기입한다.

[설계] 후속 reader 검증 기대값은 아래와 같다. 원본 실행 검증값이 아니라 기존 C와 데이터에서 유도한 입력/출력 기대다. main @0x7100362860/@0x7100362a10/@0x7100362bcc [DAILY-C], mgmet @0x7100078e70 [callers].

| 항목 [설계] | 기대값 | 원본 근거 |
|---|---|---|
| 데일리 조합 | 40개의 고유 3팩 조합, ID1~25, 같은 조합 안 중복0 | [PACK] packcombo[].packid1~3·mgpack[].packid |
| 팩 getter | id1→첫 팩, id25→마지막, id0/26→첫 팩, 빈 목록→Abort | main @0x7100362860 [DAILY-C] |
| 조합 정규화 | helper 결과를 주입했을 때 −1→39, 0→0, 39→39, 40→0, 41→1 | main @0x7100362bcc [DAILY-C]; helper 실제 날짜 값은 미확정 |
| 시간 reader | 일반 범위 δ=−1→00:00:01, δ=0→00:00:00, δ=1→23:59:59 | main @0x7100362a10 [DAILY-C]; 기준의 field 해석·clock 호출 결과는 별도 |
| 태그 표시 집계 | target3, byte쌍 (1,0),(0,1),(1,0),(1,0),(0,1)이면 승수3/1·표시4개에서 종료 | mgmet @0x7100078e70 [callers]; 실제 경기 종료의 >=target 비교도 mgm04 @0x7100015f70 [C04]에서 확인 |
| 결과 UI 경계 | UI Setup/발표/스크롤만 호출해 코인·스타·rank writer를 대신하지 않음 | mgmet @0x7100066610/@0x710006c4e0/@0x7100085900 [callers] |

[설계] 추가 C에서 유도한 기대값이며 원본 실행 결과는 아니다. 아래 표의 원본 module/address와 source를 기준으로 향후 fixture를 만들 수 있다.

| 항목 [설계] | 입력→기대값 | 근거 |
|---|---|---|
| mgm02 기본유형 | 5회→N/B/N/Battle/B; 표 길이5·7·10이며 보너스 추가회수0 | mgm02 @0x710001b33c/@0x7100017728 [C02]; §4.2 |
| 징수 | total[4,10,13,0],levy10→levied[4,10,10,0],잔액[0,0,3,0],L24 | mgm02 @0x710000484c/@0x7100004948 [C02] |
| 무승자 배틀 | rank0 인원0→각자 levied 반환 | mgm02 @0x7100003f50 [C02] |
| 잔여 보정 | R1·현재rank 동점2명→1/2<1이므로 둘다+0·R1 남음 | mgm02 @0x71000042d0 [C02] |
| 총코인 rank | [100,100,90,80]→[0,0,1,2]; 전원0 최종→전원0 | mgm02 @0x7100013200/@0x71000146c0/@0x710001704c [C02] |
| 추첨 공백 | 원본Rule7∩현등록=0→웹 시작차단·추첨/round/commit0 | [registry]·mgm02 @0x710000f0b0 [C02]. 차단은 웹설계 |
| 보드 최소횟수 | 필터후 playcount[3,1,1]→뒤 두 후보 중 선택; M2→SyncRandMod1회 호출 | bd01 @0x71000b09f0 [BOARD-C]. modulus인자는 미확정 |
| 태그 무승부 | code3→양팀+1; code4→둘다+0; target3,승수[3,3]→종료 | mgm04 @0x710001ce70/@0x7100015f70 [C04] |
| 태그 이력 | Selector후보3→NeedClear true,4→false; Roulette4→true,5→false | mgm04 @0x7100022c74/@0x710001fc64 [C04] |
| 투표 | [A,A,A,A]→A즉시; [A,A,A,B]/[A,A,B,B]→네표룰렛 | mgm05 @0x7100018690/@0x7100018c50 [C05] |
| 듀얼 룰렛 | 유효후보5→shuffle 후4슬롯; 중복0; 전체pool이력제외 없음 | mgm05 @0x7100014fb0/@0x710000fb40 [C05] |
| 보스 격파 | WinLose[1,1,1,1]→true; [1,1,1,2]→false | mgm06 @0x7100011ed0 [C06] |
| 보스 rank/MVP | 총점[9,9,5,2]→rank[0,0,2,3]·MVP2명; 전원동점→4명 | mgm06 @0x7100011ba0/@0x710001e5e0 [C06]. 점수표를 주입한 기대 |
| 데일리 경계 | 남은시간00:00:00에서 A도눌림→A선택검사가 우선 | mgmet @0x7100056f40 [MODE-H] |

## 11. 미확정

| 번호 [미확정] | 남은 쟁점 | 판정 [설계] | 해결한 범위·남은 근거 |
|---|---|---|---|
| U01 | 최대 Round 실제 표·SetRound 값 | 부분 해결 | Bonus/Battle이N회 안에 포함됨·종료 비교 확인. mgm02 @0x7100017728/@0x7100017008 [C02]; DAT @0x710005036c 내용·SetRound 누락 |
| U02 | 추첨 상한·Params override·전체 소비열 | 부분 해결 | Rule7·체감·이력소진Clear·type기본표 확인. mgm02 @0x710000f0b0/@0x710000f030/@0x710001b33c [C02]. RNG 상한 인자·override 미식별 |
| U03 | 배틀 rank0비율·Work writer 값·실제 보상량 | 부분 해결 | 기본10/3/2/0·×2·징수10·잔액보정·dense rank·최장연속 확인. mgm02 @0x71000049c0/@0x71000042d0/@0x7100013200 [C02]; DAT @0x710004e3c0·main 보상2callee 남음 |
| U04 | 날짜 기준·reset·스타/동률·중복/저장 보상 | 부분 해결 | 40조합·팩fallback·시간경계·팩내고정순서·업적합계 확인. main @0x7100362bcc [DAILY-C]·mgmet @0x7100056f40/@0x71000597a0 [MODE-H]. 날짜 helper·DailytrialResultData·Reward C 없음 |
| U05 | 태그 Work 이력 형식·RM 연승·보상량·룰렛RNG 상한 | 부분 해결 | Rule1후보·뒤처진팀선택·양팀승리+1·>=target종료·이력해제 확인. mgm04 @0x710000d860/@0x710001ce70/@0x7100015f70 [C04]. Work9주소는18담당, 카운터2callee C 없음 |
| U06 | 서바이벌 동시 인원·듀얼 기준·실력포인트식 | 부분 해결 | VS4/duel후보·전원일치/네표룰렛·5중4·재매칭경계 확인. mgm05 @0x710000fb40/@0x7100018690/@0x710000c210 [C05]. setup의 누락 Round값·포인트 callee 미식별 |
| U07 | 보스 슬롯별ID·ScoreTable·동률표시순서·보상량 | 부분 해결 | 고정5슬롯·전원WinLose1·competition rank·rank0전체MVP 확인. mgm06 @0x7100011610/@0x7100011ed0/@0x7100011ba0/@0x710001e5e0 [C06]; DAT @0x7100049a30·pointer @0x7100057d98 |
| U08 | 보드 JsonMgTeam 가중치·그 RNG·history commit | 부분 해결 | 최소playcount·last/gyro/tired·후보완화·표시추가RNG·색별팀분기 확인. bd01 @0x71000b09f0/@0x710028b7f0/@0x710028cb00 [BOARD-C]; @0x71000690e0/@0x710028a260 C 없음 |
| U09 | 빠진 setter 값·팀표·Scene+0x3b0 writer | 부분 해결 | CPU/RM caller 분기 확인. mgmet @0x71000535f0/@0x71000628f0 [callers]; writer @0x710005a1a0 C 없음. 인자가 빠진 호출에 값을 보충하지 않음 |
| U10 | runtime ID 초기화·Gyro 장치/축 | 부분 해결 | MGList FNV1a 조회·152행/flag 확인. main @0x71001e14b0 [GAP]. 초기화 함수 미식별·Gyro의 물리 의미는 [19_motion_input §11](../engine/19_motion_input.md#11-미확정) 재사용 |
| U11 | 게임별 동시 참가수·체감 지원·클립/시상시간 | 부분 해결 | 4인/2인 결과 profile·RT attachment는 병렬 판독 재사용. mgm05 @0x71000240a0 [UI §6.6](../engine/ui_parts_catalog.md#66-새-c의-결과표statusname-조립)·mgm06 @0x7100012cf0 [render §3.4](../engine/render_unify.md#34-mgm06-별도-rt와-레이어-상태-교체). 참가형태 이름으로 동시수 고정하지 않음 |
| U12 | 실행·온라인/저장 완료·공용 한 판 commit caller | 남음 | 원본 실행은 이번 범위 밖. main @0x71001f271c·[18_scene_work §11 U08](../engine/18_scene_work.md#11-미확정)·[12_online_sync](../engine/12_online_sync.md) 재사용. 모드 caller 확인을 공용 commit 완료 증거로 대신하지 않음 |

[설계] 미확정12묶음은 해결0·부분 해결11·남음1이다. C 확보 뒤 판독된 범위는 §3~8에 기록했고, 남은 함수33주소·정적 데이터4주소는 부록C에 분리했다. 부분 해결은 원본 모드 전체 이식 완료를 뜻하지 않는다.

## 12. 사용자 확인

| 추천 [설계] | 기본 제안 | 미승인 선택의 의미 |
|---|---|---|
| 원본 모드 | mgm02의 5/7/10·코인 규칙 우선 | 기본값/잔여공백 확인 뒤 구현. §1·§3.2·§6.4, mgmet @0x7100054640 [callers] |
| 임의 N | 완료한 미니게임 수로 정의 | 보너스/배틀 포함N회. 임의N 유형표는 별도 웹 규칙. mgm02 @0x7100017728/@0x710001b580 [C02] |
| 게임 범위 | 원본 후보 ∩ 완성 게임 | 장르 확장은 별도 변형. §8.2, [ND]·[CA]·[registry] |
| 반복 | 소진 후 순환·가능하면 연속 중복 회피 | 원본은소진후Clear, 경계연속중복회피는웹변형. §6.1·6.4, mgm02 @0x7100017408 [C02] |
| 체감 | 원본 설정 우선, 입력 미완성 게임은 후보 제외 | 키보드 대체/체감 전종 제외는 별도 선택. mgmet @0x7100054640 [callers], [ND]·[CA] `Gyro` |

[설계] 다음 구현에서 검토할 선택 목록이다. 이번 문서 작성에서는 승인을 요구하거나 구현을 시작하지 않는다. 원본 규칙 기본·사용자 선택 미승인이라는 작업 지시와 [DESIGN §10][design]를 따른다.

## 13. 준비도

| 판정 [설계] | 바로 쓸 수 있는 것 / 남은 조건 | 근거 |
|---|---|---|
| 바로 가능 | 112종 대응·인원형태·체감·모드 모집단; 원본모드 진행/종료 비교; mgm02 기본코인/유형표·이력·dense rank; 보드 최소횟수선택; 투표일치/룰렛; 보스5슬롯·competition rank | §3~8·§10, mgm02 @0x710001b33c [C02]·bd01 @0x71000b09f0 [BOARD-C]·mgm05 @0x7100018690 [C05]·mgm06 @0x7100011ba0 [C06] |
| 근사 필요 | 부분집합 축소·원본기본값 적용·임의N 유형표·연속 중복 회피·애니완료 신호 | §6.1·§9·§12. 사용자 미승인 추천; 원본 RNG 소비/게임열과 동등하지 않음 |
| 판독 필요 | 배틀rank0비율·최대회차 표·보스ID/점수표·누락setter/RNG 상한·runtime초기화·Daily스타·보드팀가중치·실력포인트·보상량 | §11·부록C. 이미 확보한 mode본체를 다시 추출 요청하지 않음 |
| 현재 등록 제한 | mg1801 Rhythm1종. 원본 mgm02 Chara 교집합0으로 시작 차단. 최소1종 Chara의 입력/팀/결과 이식이선행 | [registry] GAMES·[ND]/[CA] `GameRule`·mgm02 @0x710000f0b0 [C02]·§9.1 |

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

[데이터] 추가 C·병렬 재사용 출처는 [GAP]·[MODE-H]·[BOARD-C]·[C02]~[C06], [18_scene_work §11](../engine/18_scene_work.md#11-미확정), [UI §6.6](../engine/ui_parts_catalog.md#66-새-c의-결과표statusname-조립), [render §3.4](../engine/render_unify.md#34-mgm06-별도-rt와-레이어-상태-교체)다. 재사용 함수는 부록B 신규 수에 포함하지 않는다.

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

[판독] 최초8함수·추가140함수(기존후속15+MGList/보드/데일리25+mode본체100)로 누적148개다. 아래125행은 기존23행 뒤 추가 목록이다. 주소는 module별TSV·C를 대조했고 GUI boilerplate·일반 렌더·공용수명·UI/렌더의 병렬5함수는 새로 읽지 않았다. 원본실행·Ghidra추출·새C·분석스크립트0. [fn02]~[fn06]·[fnMain]·[INDEX][idx].

| 모듈 [판독] | 주소 | 함수 | 출처·판독 구간 |
|---|---|---|---|
| main | 0x71001e14b0 | `bq::MGList::GetMinigameID` | [GAP]; MGList ID·rule·flag reader |
| main | 0x71001e15d4 | `bq::MGList::GetGameRule` | [GAP]; MGList ID·rule·flag reader |
| main | 0x71001e1600 | `bq::MGList::IsAvailable` | [GAP]; MGList ID·rule·flag reader |
| main | 0x71001e1630 | `bq::MGList::IsCoin` | [GAP]; MGList ID·rule·flag reader |
| main | 0x71001e1690 | `bq::MGList::IsBD01` | [GAP]; MGList ID·rule·flag reader |
| mgmet | 0x7100055370 | `mgmet::Scene::Mgm02RewardUiFlow` | [MODE-H]; 최종 보상·데일리 선택/갱신 |
| mgmet | 0x7100056e10 | `mgmet::Scene::Dailytrial_UpdateDailyData` | [MODE-H]; 최종 보상·데일리 선택/갱신 |
| mgmet | 0x7100056f40 | `mgmet::Scene::Mgm03GamePackFlow` | [MODE-H]; 최종 보상·데일리 선택/갱신 |
| mgmet | 0x71000597a0 | `mgmet::Scene::DailytrialReturnFlow_CheckRewardAndDailyBonus` | [MODE-H]; 최종 보상·데일리 선택/갱신 |
| bd01 | 0x71000afb90 | `bd01::MgMgr::GetList` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000afd70 | `bd01::MgMgr::GetList_Item` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000aff40 | `bd01::MgMgr::GetList_VS` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b05a0 | `bd01::MgMgr::GetList_Duel` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b0770 | `bd01::MgMgr::GetList_Chara` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b0940 | `bd01::MgMgr::GetPlayID` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b09f0 | `bd01::MgMgr::GetPlayID_` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b0fd8 | `bd01::MgMgr::GetPlayID_Item` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b1048 | `bd01::MgMgr::GetPlayID_VS` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b10b8 | `bd01::MgMgr::GetPlayID_Duel` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b1130 | `bd01::MgMgr::GetPlayID_Chara` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x71000b1228 | `bd01::MgMgr::SetHistoryID` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x710028b7f0 | `bd01::event::MgCall::SetPlayerWork` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x710028c570 | `bd01::event::MgCall::RunRoulette` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x710028cb00 | `bd01::event::MgCall::GetMinigameList` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| bd01 | 0x710028d270 | `bd01::event::MgCall::Update` | [BOARD-C]; 후보·추첨·인원 형태·이력/룰렛·Update의 논리 구간 |
| mgm02 | 0x7100003e60 | `mgm02::CoinMgr::SyncedSetupGame` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100003f50 | `mgm02::CoinMgr::GetRankCoinCount` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000042d0 | `mgm02::CoinMgr::AdjustBattleMgCoinCount` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710000484c | `mgm02::CoinMgr::LevyCoin` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100004948 | `mgm02::CoinMgr::GetTotalLeviedCoinCount` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100004960 | `mgm02::CoinMgr::ExistsGotCoinPlayer` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100004980 | `mgm02::CoinMgr::GetBonusMgGotCoinCount` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000049c0 | `mgm02::CoinMgr::GetDistributedCoinCountRatio` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710000ee3c | `mgm02::MgMgr::SyncedSetupGame` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710000ef94 | `mgm02::MgMgr::SetTargetMgIds` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710000efe0 | `mgm02::MgMgr::GetMgType` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710000f030 | `mgm02::MgMgr::LotteryNextMg` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100016008 | `mgm02::Scene::SyncedSetupGame` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100017008 | `mgm02::Scene::GetMaxRound` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001704c | `mgm02::Scene::SetMgResult` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100017408 | `mgm02::Scene::LotteryNextMg` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100017728 | `mgm02::Scene::MinigameModeFlow` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000178f0 | `mgm02::Scene::FirstRoundFlow` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100017b20 | `mgm02::Scene::DecideMgFlow` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100018030 | `mgm02::Scene::StepToMinigameScene` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100018300 | `mgm02::Scene::ResultFlow` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100018740 | `mgm02::Scene::ReturnToEntranceScene` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100018800 | `mgm02::Scene::DecideMgFlow_BonusMg` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100018920 | `mgm02::Scene::DecideMgFlow_BattleMg` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001a7fc | `mgm02::SceneParamsGameMgTypeTableFiveRound::getPropertyList` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001aa70 | `mgm02::SceneParamsGameMgTypeTableSevenRound::getPropertyList` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001ad44 | `mgm02::SceneParamsGameMgTypeTableTenRound::getPropertyList` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b0a8 | `mgm02::SceneParamsGame::getPropertyList` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b3e4 | `mgm02::SceneParamsGameMgTypeTableFiveRound::MgType` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b438 | `mgm02::SceneParamsGameMgTypeTableSevenRound::MgType` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b4a4 | `mgm02::SceneParamsGameMgTypeTableTenRound::MgType` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b534 | `mgm02::SceneParamsGame::RankCoinCount` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b580 | `mgm02::SceneParamsGame::MgType` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b710 | `mgm02::SceneParamsGame::BonusMgCoinCountCoef` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b718 | `mgm02::SceneParamsGame::BattleMgLeviedCoinCount` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710000f0b0 | `mgm02::MgMgr::GetTargetMgIds` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100011f48 | `mgm02::ParamMgr::SyncedSetupGame` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100013200 | `mgm02::RankMgr::SyncedSetupGame` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x7100018cc0 | `mgm02::Scene::UpdateHighScore` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001a954 | `mgm02::SceneParamsGameMgTypeTableFiveRound::createInstance` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001ac20 | `mgm02::SceneParamsGameMgTypeTableSevenRound::createInstance` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001af80 | `mgm02::SceneParamsGameMgTypeTableTenRound::createInstance` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x710001b33c | `mgm02::SceneParamsGame::createInstance` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000148d0 | `FUN_71000148d0` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000139a0 | `FUN_71000139a0` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000155f0 | `FUN_71000155f0` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm02 | 0x71000146c0 | `FUN_71000146c0` | [C02]; 회차·후보·코인·기본 Params·rank; 대형 flow/정렬은 관련 논리 구간 |
| mgm03 | 0x7100008960 | `mgm03::Scene::SyncedSetupGame` | [C03]; 팩 순서·결과 rank·진행/최종 복귀 |
| mgm03 | 0x7100009780 | `mgm03::Scene::MinigameModeFlow` | [C03]; 팩 순서·결과 rank·진행/최종 복귀 |
| mgm03 | 0x7100009bc0 | `mgm03::Scene::StartFlow` | [C03]; 팩 순서·결과 rank·진행/최종 복귀 |
| mgm03 | 0x710000a440 | `mgm03::Scene::DicideMinigameFlow` | [C03]; 팩 순서·결과 rank·진행/최종 복귀 |
| mgm03 | 0x710000b3a0 | `mgm03::Scene::ResultMinigameFlow` | [C03]; 팩 순서·결과 rank·진행/최종 복귀 |
| mgm04 | 0x71000150c8 | `mgm04::Scene::SyncedSetupGame` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100015c88 | `mgm04::Scene::UpdateMgmWork` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100015f70 | `mgm04::Scene::MinigameModeFlow` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100016190 | `mgm04::Scene::FirstRoundFlow` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100016330 | `mgm04::Scene::ResultFlow_Cut01` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100016390 | `mgm04::Scene::ResultFlow_Cut02` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100016580 | `mgm04::Scene::SelectNextMgFlow` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x71000166f0 | `mgm04::Scene::ResetWork` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100018060 | `mgm04::Scene::SelectNextMgFlow_SelectAndDecideMg` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001aa90 | `mgm04::Scene::RM_MinigameModeFlow` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001ce70 | `mgm04::TeamParamMgr::SyncedSetupGame` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001d260 | `mgm04::TeamParamMgr::GetMgResult` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001e870 | `mgm04::UIMgRoulette::SyncedSetupGame` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001ffa0 | `mgm04::UIMgSelector::SyncedSetupGame` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001fc64 | `mgm04::UIMgRoulette::NeedsClearMgHistory` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x7100022c74 | `mgm04::UIMgSelector::NeedsClearMgHistory` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710000d860 | `mgm04::GetRandTargetMinigameIds` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001ed04 | `mgm04::UIMgRoulette::In` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm04 | 0x710001f4b0 | `mgm04::UIMgRoulette::Decide` | [C04]; 팀 승수/선택권·후보·종료·RM 경계·룰렛 창 표시 |
| mgm05 | 0x7100003ff0 | `mgm05::Scene::SyncedSetupGame` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x710000956c | `mgm05::Scene::MinigameModeFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x710000aeb0 | `mgm05::Scene::MinigameModeFlow_AfterMaching` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x710000c210 | `mgm05::Scene::MinigameModeFlow_AfterGame` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x710000fb40 | `mgm05::Scene::GetMinigameIdList` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100010d90 | `mgm05::Scene::DicideMinigameFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x71000154f0 | `mgm05::Scene::MgSelectRouletteFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100017bf0 | `mgm05::Scene::MgSelectVoteFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100018690 | `mgm05::Scene::DicideVoteMgSelectFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x710001a7d0 | `mgm05::Scene::GetWinPattern` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100009690 | `mgm05::Scene::MinigameModeFlow_FlowInit` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x710000f9cc | `mgm05::Scene::CheckMoveMatchingScene` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100011ff0 | `mgm05::Scene::ResultMinigameFlowCommon` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100012bf0 | `mgm05::Scene::ResultMinigameFlowWin` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x71000141f0 | `mgm05::Scene::ResultMinigameFlowLose` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100014fb0 | `mgm05::Scene::OpenRouletteMgSelectFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x71000165b0 | `mgm05::Scene::OpenVoteMgSelectFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm05 | 0x7100018c50 | `mgm05::Scene::AdvanceVoteToRouletteMgSelectFlow` | [C05]; 일치 투표/룰렛·후보·승패/재매칭 논리; 점수식은 미확정 |
| mgm06 | 0x7100010e54 | `mgm06::Scene::SyncedSetupGame` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x71000111c0 | `mgm06::Scene::SetMinigameResultToMinigameModeWork` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x710001140c | `mgm06::Scene::MinigameModeFlow` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x71000115a0 | `mgm06::Scene::OpeningFlow` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x7100011610 | `mgm06::Scene::CallMinigameScene` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x7100011750 | `mgm06::Scene::RewardFlow` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x7100011ed0 | `mgm06::Scene::IsBossMinigameDefeated` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x710001e5e0 | `mgm06::Scene::VictoryFlow::MainFlow` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x7100011ba0 | `mgm06::CalculatePlayersGameRank` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |
| mgm06 | 0x710002329c | `mgm06::BossRushCourseResult::Tally` | [C06]; 고정5슬롯·전원승리·결과·점수/rank/MVP 논리; 렌더 재판독 제외 |

| mgm04 | 0x710001ed50 | `mgm04::UIMgRoulette::Update` | [C04]; 후보 표시·사전 난수2호출·f32 대기 논리; 문자열 마스킹 판독 |

## 부록 C. Ghidra 요청 표

[미확정] 새 C 확보 뒤 본체가 있는102개 요청은 제거했다. 남은 함수33개는 module별 TSV 심볼·허용 C 헤더를 대조했다. 정적 데이터4주소·미식별3갈래·18담당 C존재9함수는 별도다. 요청 기록만 남겼으며 Ghidra·추출·원본실행0이다. [INDEX][idx]·[fnMain]·[fnH]·[fnBD].

### C.1 본체 C 없는 함수33개

| 모듈 [미확정] | 주소 | TSV 심볼 | 요청 이유 | 필요한 범위 [설계] |
|---|---|---|---|---|
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
| mgmet | 0x7100068d90 | `FUN_7100068d90` [fnH] | 본체 C 없음; Order/rank 정렬 helper 호출·동점의 안정 순서 | 예: 시상 표시 |
| mgmet | 0x7100004040 | `FUN_7100004040` [fnH] | 본체 C 없음; rank0 수집 후 우승 이름·메시지 설정 | 예: 시상 표시 |
| main | 0x7100231588 | `bq::reward::RewardModule::DailyTrialTakeStar` [fnMain] | 본체 C 없음; 데일리 스타 실제 보상량·저장 계약 | 메타 보상 |
| main | 0x71002316a8 | `bq::reward::RewardModule::DailyTrialDailyBonus` [fnMain] | 본체 C 없음; 데일리 완료 보너스 실제 보상량 | 메타 보상 |
| main | 0x7100231788 | `bq::reward::RewardModule::CharaMgBattleMgStreak` [fnMain] | 본체 C 없음; 챌린지 최장 연속 보상량 | 메타 보상 |
| main | 0x71002318b8 | `bq::reward::RewardModule::CharaMgBattleRank` [fnMain] | 본체 C 없음; 챌린지 최종 rank 보상량 | 메타 보상 |
| main | 0x7100231c28 | `bq::reward::RewardModule::BossRushStreak` [fnMain] | 본체 C 없음; 보스 연속 기록 보상량 | 메타 보상 |
| main | 0x7100231d3c | `bq::reward::RewardModule::BossRushRank` [fnMain] | 본체 C 없음; 보스 최종 rank 보상량 | 메타 보상 |
| mgmet | 0x7100056c50 | `mgmet::Scene::Dailytrial_CheckResetDailyPlayData` [fnH] | 본체 C 없음; 날짜 변경 저장 reset·이전 팩 처리 | 데일리 갱신 |
| mgmet | 0x7100009508 | `mgmet::DailytrialResultData::IsCompleteNow` [fnH] | 본체 C 없음; 데일리 팩 완료 판정·보너스 조건 | 데일리 완료 |
| bd01 | 0x710006900c | `bd01::JsonMgTeam::JsonMgTeam` [fnBD] | 본체 C 없음; JsonMgTeam 실제 asset 경로·확률 데이터 로드 | 보드 인원 형태 |
| bd01 | 0x71000690e0 | `bd01::JsonMgTeam::GetDataV` [fnBD] | 본체 C 없음; 인원 형태 가중치·선택 RNG 소비 | 보드 인원 형태 |
| bd01 | 0x710028a260 | `bd01::event::MgCallBase::RunCallMiniGame` [fnBD] | 본체 C 없음; 게임 호출 뒤 history commit 시점 | 보드 호출/이력 |
| bd01 | 0x710028ca18 | `bd01::event::MgCall::RunSelect` [fnBD] | 본체 C 없음; 수동 후보 선택 확정과 history 호출 | 보드 수동 선택 |

[설계] 공용 Work 결과 getter/setter7주소는18에 공유하여 부모가 중복 요청을 합친다. 이 문서에서는 계산·UI reader가 요구하는 인터페이스 주소만 남긴다. main @0x71001f32cc/@0x71001f3320/@0x71001f33a0/@0x71001f33d0/@0x71001f395c/@0x71001f3b78/@0x71001f3b8c [fnMain]; 공용 소유권 재판독0.

### C.2 정적 데이터4주소·미식별3갈래

| 모듈 [미확정] | C가 참조한 실제 주소 | 요청할 내용·주소의 의미 | 근거 |
|---|---|---|---|
| mgm02 | 0x710005036c | GetMaxRound의 tableKind0/1/2 최대회차 표 내용 | mgm02 @0x7100017008 [C02] |
| mgm02 | 0x710004e3c0 | GetDistributedCoinCountRatio의 rank0 동순위 인원별 비율 표 | mgm02 @0x71000049c0 [C02] |
| mgm06 | 0x7100049a30 | BossRush ScoreTable의 rank0..3 점수 값 | mgm06 @0x710002329c/@0x7100011ba0 [C06] |
| mgm06 | 0x7100057d98 | kBossMinigameIds의 포인터 슬롯; 따라간 배열5ID·Name 대응. 실제 배열 target주소는 아직 없음 | mgm06 @0x7100011610 [C06]. 포인터 슬롯을 배열 본체주소로 기록하지 않음 |

| 미식별 [미확정] | 찾을 대상 | 현재 근거·한계 |
|---|---|---|
| 1 | SceneParamsGame 실제 asset override loader/path | mgm02 @0x7100011f48/@0x710001b33c [C02]; 기본 생성값만 확보. 주소를 만들지 않음 |
| 2 | MGList runtime152행 초기화·Name→ID 순서 | main @0x71001e14b0 [GAP]; getter만 확보. JSON122행 순서를 대응시키지 않음 |
| 3 | 서바이벌 실력 포인트 계산·서버 응답의 값 경로 | mgm05 @0x710000c210/@0x710001a7d0 [C05]·[MSG-H] `mgmet_sb_mw_howToPlay00~03`. 진행/연출은 확보했으나 수식 callee 주소를 만들지 않음 |

[데이터] 함수33+정적데이터4=중복제거37개의 모듈·주소 쌍이다. 미식별3갈래는주소수에 포함하지 않는다. mgmet @0x7100004040·bd01 @0x71000690e0와 같은 숫자 주소의 다른 NRO C는 해당 본체로 쓰지 않았다. [fnH]·[fnBD]·[INDEX][idx]. 37개 모두 한 번에 추출하라는 요청이 아니다.

### C.3 우선 확인할 남은 공백

[설계] 가장 가까운 mgm02의 Scene/MgMgr/CoinMgr/기본 Params 본체는 확보·판독 완료다. 첫 구현 전 우선 확인은 최대회차 DAT @0x710005036c·배틀 rank0비율 DAT @0x710004e3c0·실제 override 및 빠진 RNG/SetRound 인자다. 공용 기록/rank7함수는18의 공유 판독을 기다린다. mgm02 @0x7100017008/@0x71000049c0/@0x7100017408 [C02]·C.1~C.2.

[설계] 다른 모드의 우선 공백은 데일리 day helper main @0x71003628bc·Data Setup mgmet @0x71000083e0, 보드 JsonMgTeam bd01 @0x71000690e0, 보스 ID/ScoreTable 위2주소다. 태그·서바이벌의 기본 진행/투표 판독은 이미 가능하며 실력포인트·온라인 결과는별도다. [fnMain]·[fnH]·[fnBD]·[C05]·[C06].

### C.4 C가 있는 공용 Work9함수 —18 공유 요청

| 모듈 [데이터] | 주소 | 심볼 | 담당·근거 |
|---|---|---|---|
| main | 0x71001f3120 | `bq::MinigameModeWork::Mgm02AddMgResult` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f3370 | `bq::MinigameModeWork::Mgm02GetTotalCoinCount` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f3470 | `bq::MinigameModeWork::Mgm02GetTotalLeviedCoinCount` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f35d0 | `bq::MinigameModeWork::Mgm02IsPlayedMgId` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f396c | `bq::MinigameModeWork::Mgm04GetTargetVictoryCount` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f3974 | `bq::MinigameModeWork::Mgm04GetTeamVitoryCount` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f39e0 | `bq::MinigameModeWork::Mgm04AddMGResult` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f3be0 | `bq::MinigameModeWork::Mgm04AddMGIDHistory` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |
| main | 0x71001f3d50 | `bq::MinigameModeWork::Mgm04IsPlayMGID` | [GAP] C 있음·18담당. 이번 새 판독0·추출 요청0 |

[설계] 모드 고유 필드 의미는 이 문서의 caller에 필요하지만 공용 소유권·물리 배치는18의 같은 출처를 인용한다. 부모가18의 해당 절을 공유하면 그 링크로 정리할 수 있다. 이번에는 새 필드offset을 추측하지 않았다. [18_scene_work §11](../engine/18_scene_work.md#11-미확정)·[GAP].

## 부록 D. 검증·부모 통합

[데이터] 최종 정적 검증 범위: §1~13·부록A~D, 새 판독148함수(최초8+추가140), 미확정12묶음=부분11/남음1, 중복제거요청37주소=함수33+데이터4·미식별3갈래. C가 있는공용9함수는18 공유 목록으로 분리. 새 C·추출·분석스크립트0. [INDEX][idx]·부록B/C.

[데이터] 최종 링크 검증: 인라인·참조식 링크875회, 실제 로컬 대상52개, 고유 fragment35개, 출처 통합6줄. 없는 파일·없는 anchor·의도된 참조 미정의·표 열 수 오류0. 인접 확실성 태그6쌍과 코드/괄호 설명은 링크 오류 오검출에서 제외했다. UTF-8·BOM 없음·LF·줄 끝 공백0. [이 문서](mgm_modes.md).

[데이터] 새 판독148개는 각각 모듈 TSV·지정 C 헤더와 일치하고 중복0이다. catalog 대응112행·체감25·팩49·서바이벌26·함수요청33·데이터요청4·미식별3을 메모리에서 검증했다. 기존 보유 C 요청102개 제거·공용 C존재9함수 공유 분리. [catalog]·[idx]·부록B/C.

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

[GAP]: ../../../analysis/decomp/docs_gap_main.c

[MODE-H]: ../../../analysis/decomp/mgm_modes_mgmet.c

[BOARD-C]: ../../../analysis/decomp/mgm_modes_bd01.c

[C02]: ../../../analysis/decomp/mgm02.nro.c

[C03]: ../../../analysis/decomp/mgm03.nro.c

[C04]: ../../../analysis/decomp/mgm04.nro.c

[C05]: ../../../analysis/decomp/mgm05.nro.c

[C06]: ../../../analysis/decomp/mgm06.nro.c
