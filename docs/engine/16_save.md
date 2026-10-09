# 16. 공용 저장(Save) — 원본 구조·저장 요청 수명·웹 계약

사용자 결정(2026-10-09): "메시지 속도는 localStorage 하나 정해서", "localStorage 관리, 저장하는 것도 공통으로 관리되게끔", 원본 규칙을 따른다. 상시 원칙: 나중에 공통으로 쓸 만한 것은 처음부터 공통으로, 어디에도 종속·의존하지 않게.

확정 수준: **[판독]** 디컴파일 C, **[데이터]**, **[추정]**, **[설계]**(웹에서 정한 것), **[미확정]**. 새 디컴파일은 main(`ghidra_work/mgmcommon/jamboree_main`, `MgmcommonDecompCreate.java`)에서 함수 16개만 했다(§9). 이미 분석된 내용(가이드 속도 setter·메시지 글자 속도·첫 안내 비트·플레이 횟수 함수)은 해당 문서를 가리키고 다시 판독하지 않았다.

관련 문서: [message_window.md](../shell/message_window.md) §6.3(글자 속도), [plaza_guide.md](../shell/plaza_guide.md) §4.3(메시지 속도 설정·SaveRequestFiber), [mgmet_flow.md](../shell/mgmet_flow.md) §6.2·§8(opSkip·첫 안내), [mgm01_freeplay.md](../shell/mgm01_freeplay.md) §6.4·§8.4(NEW·즐겨찾기), [minigame_scene.md](../shell/minigame_scene.md) §6.5·§6.7·§12.12(플레이 횟수·마지막 페이드 저장), [plaza_3d.md](../shell/plaza_3d.md) §6.10 ④(기구 건너뛰기), [common_system_audit.md](common_system_audit.md) §5.1·§5.2.

## 1. 원본 저장 구조

### 1.1 SaveDataMgr — 사용자 칸 4개 [판독]

| 함수 | 주소 | 동작 |
|---|---|---|
| `FindPreselectedUserSaveData()` | main @0x7100240424 | 칸 0 의 유효 바이트(`mgr+0xe6c0`)가 켜져 있으면 `mgr+0x28`(칸 0 SaveData), 아니면 null |
| `GetSaveData(int n)` | main @0x71002403ec | n<4 이고 칸 n 유효면 `mgr+0x28+n*0xf2e0`, 유효 아님 null, n≥4 abort |
| `GetSaveData(int n, Uuid)` | main @0x710024036c | 위 + 칸 n 의 Uuid(`+0xe6b0/+0xe6b8`)가 현재 값과 같을 때만 |
| `GetSaveData(PlayerID)` | main @0x7100240274 | PlayerWork 를 PlayerID 로 찾아 `GetManageIdx()`(<4)를 칸 번호로 쓰고, 유효·Uuid 같을 때만. 없으면 null |

- 칸 하나 = `0xf2e0` 바이트, 사용자(계정) 하나. 칸 0 = 앱을 띄운 계정(Preselected). 손님(계정 없는 로컬 플레이어)은 `GetSaveData(PlayerID)` 가 null 이라 아무것도 기록되지 않는다.
- 칸 객체 생성 `FUN_710023dbc0` → 데이터 초기화 `FUN_710023dcc0(obj+0x18)`(전부 0, `SystemData+0x70` = −1). 새 세이브 만들기 `FUN_710023e890`: `memset(obj+0x18, 0, 0xe680)`, Uuid 생성(`obj+0xe688`), 머리 u32 `0x78a4de2e`(`obj+0x18`), 판 문자열(`obj+0x1c`, 16바이트), `SystemData+0x70` = 0, 메뉴·카드·기록 기본값. **`SystemData+0x74`(메시지 속도)는 두 초기화 모두 0** 이다.

### 1.2 SaveData 안 배치 [판독]

| 부분 | 위치(SaveData 기준) | 근거 | 웹이 쓰는 칸 |
|---|---|---|---|
| 머리·판 | +0x18 u32 `0x78a4de2e`, +0x1c 판 문자열 | `FUN_710023e890` | 없음 |
| SystemData | +0x2c | `GetSystemData` @0x710023ea9c | **+0x74 u32 메시지 속도** |
| MenuData | +0xf8 | `GetMenuData` @0x710023eb3c | **첫 바이트 비트 0 = 기구 출발 건너뛰기 허용**(plaza_3d §6.10 ④). menu00 은 비트 1·0x28·0x29·0x30 도 쓴 뒤 SaveRequestFiber 를 돈다 |
| MinigameData[152] | +0x118 + id×6 | `GetMinigameData` @0x710023eb44, 초기화 루프 152칸 | **+0 u16 플레이 횟수(head), +4 u8 비트(NEW 1·즐겨찾기 4)** |
| MinigameModeData | +0x8a40 | `GetMinigameModeData` @0x710023eb94 | **선두 u32 비트(opSkip 1·프리 플레이 준비 4·첫 안내 8)**(mgmet_flow §8) |

### 1.3 쓰는 곳 [판독, 기존 문서]

| 값 | 쓰는 함수 | 저장 요청 |
|---|---|---|
| SystemData+0x74 | 가이드 메시지 속도 결정 menu00 @0x710005de90~0x710005deb0: `r==2 ? 2 : (r!=1)` | `SaveRequestFiber` 생성, 끝날 때까지 대기(plaza_guide §4.3) |
| MenuData 비트 0 | 기구 출발(plaza_3d §6.10 ④, 쓰는 곳 [판독 기존]) | 다른 메뉴 비트와 같은 꼴(비트 OR → SaveRequestFiber) [추정] |
| MinigameModeData 비트 1 | `MgmetSetupOpSkipFlag` main @0x710022eafc(기존 0 일 때만) | SaveRequest(대기 없음) |
| 비트 8 | `SaveFirstHowtoPlayViewMgm01` main @0x710022ee20 | SaveRequest(대기 없음) |
| 비트 4·NEW 켬 | mgm01 `SetupPlayData` @0x7100009850 | SaveRequest |
| NEW 끔·즐겨찾기 | `UpdateNewIcon`·`MgSettingFlow_Favorite` | **없음** — 다음 SaveRequest 까지 메모리(mgm01_freeplay §8.4) |
| 한 판 시작 | mgm01 MgStartFlow | SaveRequest(mgm01_freeplay §8.3) |
| 플레이 횟수 +1 | 미니게임 장면 단계 11 `FUN_71002db9f0`: 참가 목록(`GetMGEntryPlayerList(…,0)`) 중 PlayerType≠1 마다 `GetSaveData(PlayerID)` 의 head +1, 999 상한, 세이브 없으면 건너뜀 | 없음(단계 16 이 함) |
| 통계·저장 | 단계 16 `FUN_71002dbb80` + `SaveDataMgr.SaveRequest()`(!P) | sub 1 = 페이드 끝 && **IsProcessing 아님** 까지 대기 |
| 활동 진입 | mgmet `FreeplayAfterFlow` `AddAwakeCount(7)` | SaveRequest |

## 2. 저장 요청 수명 [판독]

- `SaveDataMgr::SaveRequest` main @0x710023ff64: 칸 0~3 중 유효한 칸마다 `FUN_710018a370(SaveModule, 칸 객체)`(저장 모듈에 요청 넣기). 반환은 항상 1. 실제 기록은 저장 모듈 쪽 비동기다.
- `SaveDataMgr::IsProcessing` main @0x7100240168: `mgr+0x3cbb8`·`+0x78e30` 바이트가 켜졌거나, 네 칸 중 하나라도 저장 모듈이 처리 중(`FUN_710018a5d0`)이거나, 사진·기타 저장 객체(`+0x3cbc0` 포인터, `+0x3cbe0`·`+0x4bc70`·`+0x5ad00`·`+0x69d90`)가 처리 중이면 참.
- 완료·오류: 공개 API 는 **처리 중 여부 하나**뿐이다. 오류 값을 돌려주는 함수는 없다. 저장 모듈 내부 오류 처리 [미확정](범위 밖).
- 기다리는 쪽: `SaveRequestFiber` menu00 @0x71000923c0 = SaveRequest → IsProcessing 거짓까지 Wait. 미니게임 단계 16 sub 1. 나머지(mgmet·mgm01)는 요청만 하고 기다리지 않는다.
- 요청 전 수정은 메모리 SaveData 에만 있다. SaveRequest 가 그때까지의 메모리 전체를 기록한다.

## 3. 웹 계층·경계 [설계]

```
script/game/lib/save                (코어, import 0) 섹션 등록·버전/마이그레이션·요청 수명·변경 감지·직렬화. 게임을 모른다
script/game/lib/save-localstorage   (어댑터) localStorage 키 하나·모든 접근 try/catch·메모리 대체. lib/save 의 타입만 import
script/view/save.ts            (mpj 연결) mpj 섹션 정의·옛 키 마이그레이션·앱 싱글턴 appSave()·MgmSave 연결·메시지 속도 원천·광장 저장·한 판 저장 고리
```

| 모듈 | import 해도 되는 것 | 금지 |
|---|---|---|
| `lib/save` | 없음 | 모든 import(시험 `test_save.ts` 6절이 검사) |
| `lib/save-localstorage` | `../save` | 그 밖 전부 |
| `view/save.ts` | `lib/save`·`lib/save-localstorage`·`app/common/ui/contracts`·`app/common/ui/messageWindow`·`app/scene/minigame/mgm01/playResult`·`app/scene/world/plaza/types`(타입) | DOM 은 `appSave()` 안 어댑터 생성에서만 |
| 셸(`shell/*`) | 저장을 **구조 인터페이스로만** 받는다: `MgmSaveBacking`(contracts.ts), `PlazaSave`(plaza/types.ts), `setMessageSpeedSource`(messageWindow) | `lib/save`·`view/save` import 금지(mgm_common 9.1 경계 그대로) |

- 다른 게임(ddalkkakrider 포털 등)은 `lib/save` + `lib/save-localstorage` 를 그대로 쓰고 자기 섹션만 등록한다.
- 앱 전체 싱글턴은 `view/save.ts::appSave()` 하나. `main.ts`(index.html)·`ui_main.ts`(dev/ui.html)가 시작할 때 한 번 부른다(메시지 속도 원천 설치).

## 4. 웹 저장 문서 [설계]

localStorage 키 **`mpj.save`** 하나. 값은 JSON:

```json
{"format":"mpj.save","version":1,"sections":{
  "system":{"messageSpeed":0},
  "menu":{"bits":[0]},
  "minigameMode":{"flags":13},
  "minigame":{"101":[3,4],"7":[0,1]},
  "run":{"game":"mg1801","com":[false,true,true,true],"muted":false,"options":{}}}}
```

| 섹션 | 원본 | 필드 | 쓰는 쪽(소유) | 읽는 쪽 |
|---|---|---|---|---|
| `system` | 칸 0 SystemData | `messageSpeed` u32 원값(0 보통 0.05 s·1 즉시·2 느림 0.1 s, 그 밖 값은 0 처럼 동작) | 가이드 메시지 속도 설정(`setGuideMessageSpeed`) | 모든 MessageWindow(페이지 시작마다) |
| `menu` | 칸 0 MenuData | `bits` 켜진 비트 번호 목록(u64 비트를 수로 다루지 않으려고) | 광장 기구(`PlazaSave.setMenuBit(0)`) | 기구 건너뛰기 안내·입력 |
| `minigameMode` | 칸 0 MinigameModeData 선두 u32 | `flags` | mgmet 허브(1·8)·mgm01(4) | 같은 곳 |
| `minigame` | 칸 0 MinigameData[152] | `"id": [head u16, flags u8]`, 0·0 칸은 쓰지 않음 | mgm01(NEW·즐겨찾기)·한 판 단계 11(head) | 목록·허브(플레이한 수) |
| `run` | **없음**(웹 실행 패널) | `game`·`com`·`muted`·`options` | main.ts 실행 패널 | main.ts |

- 앞 네 섹션은 원본 사용자 칸 0(Preselected) 하나의 SaveData 부분이다. 웹에는 계정이 하나뿐이라 칸 1~3 은 없다(§10 확인 필요).
- 문서에 모르는 섹션이 있으면 그대로 두었다가 다시 쓴다(새 판에서 옛 판으로 돌아가도 잃지 않게).

## 5. 버전·마이그레이션 [설계]

| 경우 | 처리 | 상태(`loadReport.source`) |
|---|---|---|
| `mpj.save` 있음, version = 현재 | 섹션별 `normalize`(모양이 틀린 필드는 기본값) | `storage` |
| version < 현재 | 등록한 마이그레이션(`from → from+1`)을 차례로, 끝나면 바로 한 번 쓴다 | `storage`(migrated 수) |
| version > 현재 | 기본값으로 메모리 동작, **쓰기 막음**(새 판 데이터 보호), 오류 `version` | `newer` |
| JSON 깨짐·format 다름 | 기본값, 오류 `parse`, 다음 요청 때 덮어씀 | `corrupt` |
| 읽기 예외(사생활 모드·차단) | 기본값·메모리 동작, 오류 `read`. 요청마다 다시 써 보고 실패는 오류로 남김 | `readError` |
| `mpj.save` 없음 | 옛 키 3개를 한 번 읽어 version 0 문서로 만들고 마이그레이션 → 바로 한 번 씀 | `legacy` |
| 아무것도 없음 | 기본값(메시지 속도 0 = 원본 새 세이브와 같음) | `empty` |

옛 키(version 0 → 1 마이그레이션, `view/save.ts`):

| 옛 키 | 옛 쓰는 곳 | 옮길 곳 |
|---|---|---|
| `jamboree-web/prefs` | main.ts `savePrefs` | `run` 그대로 |
| `mpj.mgm01.save` | mgm01_page `MemorySave.toJSON` `{modeFlags, mg:[[id,{head,flags}]]}` | `minigameMode.flags`·`minigame` |
| `mpj.plaza.menuData0` = `'1'` | balloon.ts | `menu.bits` 에 0 |

옛 키는 **지우지 않는다**(되돌아갈 때 쓸 수 있게). `mpj.save` 가 생기면 다시 읽지 않는다.

## 6. 웹 저장 수명 [설계 — 원본 §2 를 옮김]

```
request()        : 요청 수 +1. 처리 대기 중이 아니면 대기로 두고 schedule(process)  (기본 queueMicrotask)
isProcessing()   : 대기 중이면 참                                  (원본 IsProcessing)
process()        : 대기 해제 → 문서 직렬화 → 마지막으로 쓴 글과 같으면 'unchanged'(쓰기 없음)
                   → 다르면 storage.write: 성공 'written' / 예외 'error'(lastError, 메모리는 그대로) / 막힘 'blocked'
```

- 여러 요청이 처리 전에 모이면 **한 번** 쓴다. 처리 중 새 요청은 다음 처리로 간다.
- 원본처럼 **쓰기는 요청 때만** 한다. 섹션 값 수정은 메모리에만 있다(`dirty()` = 마지막으로 쓴 글과 다름).
- 실패해도 isProcessing 은 거짓이 된다(원본 대기 흐름이 멈추지 않게). 오류는 `lastError`·`stats.errors`·`lastResult` 로 본다.
- `saveRequestFiber(core)` 생성기 = SaveRequestFiber(요청 → 처리 중이 아닐 때까지 yield).

웹의 요청 지점(원본과 같은 자리):

| 웹 | 원본 |
|---|---|
| 허브 `opSkip`·첫 안내·`freeplayAfterFlow`(app/scene/world/mgmet/hub.ts) | mgmet_flow §8 |
| mgm01 `setupPlayData`(announce.ts) | SetupPlayData |
| mgm01 한 판 호출(mgm01_page `call` → `persist`) | MgStartFlow SaveRequest |
| 한 판 단계 16 `save` 사건(mgrun `save.request`) | `FUN_71002e1c68` SaveRequest |
| 가이드 메시지 속도 결정(`setGuideMessageSpeed` + `saveRequestFiber`) | SaveRequestFiber |
| 기구 첫 출발(balloon `callScene`) | 메뉴 비트 OR + SaveRequestFiber [추정] |
| 실행 패널 설정(main `savePrefs`) | 원본 없음(웹 설정은 바로 요청) |

목록 나가기·설정 화면 시험 끝·페이지 정리 때 하던 즉시 기록은 원본 근거가 없어 뺐다(NEW 끔·즐겨찾기는 다음 요청 때 기록, §10).

## 7. 소비자 이전

| 소비자 | 전 | 후 |
|---|---|---|
| main.ts 실행 설정 | localStorage `jamboree-web/prefs` 직접 | `appSave().run` 섹션 + 요청 |
| mgm01_page 목록 Save | `MemorySave.fromJSON(localStorage)`·`onSave`→setItem | `appSave().mgm`(앱 공용 MemorySave). `?save=0` 이면 저장과 떨어진 새 MemorySave(시험값이 실제 저장을 건드리지 않게) |
| mgmet_page 허브 Save | 매번 새 MemorySave, 저장 없음 | **같은 `appSave().mgm`** → 첫 안내·opSkip·플레이 횟수가 목록과 공유되고 요청 때 기록 |
| balloon.ts 기구 건너뛰기 | localStorage `mpj.plaza.menuData0` 직접 | `ctx.save?.menuBit(0)`·`setMenuBit(0,true)`+`request()`(plaza_page 가 `appSave().plaza` 를 꽂음, 없으면 끔) |
| `MemorySave`(contracts.ts) | 자기 Map | `MgmSaveBacking` 구조 인터페이스를 본다(기본 = 메모리). 공개 `MgmSave`·`saveRequests`·`onSave`·`toJSON/fromJSON` 유지, `isProcessing()` 추가 |
| 플레이 횟수 +1 | 결과가 돌아오면 목록 페이지(`settlePlayResult`) | 실제 한 판: 단계 11 `save` 사건 → mgrun `save.playCount(참가자)` → `commitPlayCount`(사람·참가·세이브 있는 칸만). `settlePlayResult(…, countedByScene=true)` 는 다시 세지 않음. 가짜 한 판(dev/ui.html 단독)은 그대로 |
| 메시지 속도 | `setSpeed` 부르는 곳 0 | `setMessageSpeedSource(() => appSave().messageSpeed())`: 모든 MessageWindow 가 생성·start·update 때 원천 값을 `st.speed` 에 둔다(페이지 시작 때 Typer 가 읽음 = 원본 페이지 시작마다 SystemData 읽기). `setSpeed(s)` 는 창별 덮어쓰기(원본 `+0x90/+0x94`) |

## 8. 메시지 속도 연결 범위

- 기본값 0(원본 새 세이브 §1.1). 원천은 `system.messageSpeed`, 창은 페이지마다 읽는다.
- 가이드 setter 경로: `guideMessageSpeedCursor(raw)` = 초기 커서(`raw==2?2:(raw==0)`), `guideMessageSpeedValue(r)` = 저장값(`r==2?2:(r!=1)`), `setGuideMessageSpeed(save, r)` = 값 쓰기 + `saveRequestFiber`. 시험으로 확인.
- **화면 UI(가이드 상태 5 부품·미리보기 sample mode·라벨 fast/slow 재타이핑·B 취소 불가)는 구현하지 않았다**(광장 상태 5 부품 자체가 없음, plaza_guide §6 표). 남은 일로 둔다.
- 온라인 즉시 표시(`setOnline`)는 범위 밖(P2).

## 9. 결정성·근거·검증

- 저장 값은 셸·설정에만 쓴다. 미니게임 로직은 저장을 읽지 않는다(minigame_scene §12.12.6). mgrun 의 저장 고리는 사건을 읽기만 하고 로직에 값을 돌려주지 않는다. 단계 16 sub 1 의 "IsProcessing 아님" 대기는 웹 틀에 넣지 않았다 — 웹 기록은 같은 프레임 마이크로태스크에서 끝나 1.0 s 페이드 안에 항상 끝나므로 프레임이 바뀌지 않고, 로직이 저장 상태를 읽지 않게 하려는 것이다. 시험 `test_save` 7절: 저장 고리 있음/없음 두 실행의 틱별 로직 해시가 같음.
- 새 디컴파일(scratchpad, 저장 안 함): `FUN_710023dcc0`·`FUN_710023e890`·`GetSystemData`·`GetMenuData`·`GetMinigameData`·`GetMinigameModeData`·`FUN_710023f1f0`·`SaveRequest`·`IsProcessing`·`GetSaveData`×3·`FindPreselectedUserSaveData`·`FUN_710024003c`·`SaveRequestAppBootAccount`·`FUN_710023dbc0`. 가이드 setter·글자 속도 읽기는 기존 `menu00.nro.c` 75177~75214행·`msgwin_main_all.c` 11792행을 확인만 했다.
- 시험: `npx tsx tools/test_save.ts`(§11 결과).

## 10. 사용자 확인 필요

| 항목 | 정한 것(원본에 가까운 쪽) | 이유 |
|---|---|---|
| 웹 계정 수 | 칸 0 하나. PlayerID 0 = ManageIdx 0 = 세이브 있음, 1~3P 는 손님(세이브 없음) → 플레이 횟수는 1P 가 사람·참가일 때만 +1 | 웹에 계정 선택이 없다. 사람마다 칸을 주려면 `users[0..3]` 로 늘릴 수 있음 |
| 참가 목록 | `gamePlay` 참인 플레이어 | `GetMGEntryPlayerList(…,0)` 목록 종류 0 의 내용 미판독 |
| NEW 끔·즐겨찾기 기록 시점 | 다음 SaveRequest 까지 메모리(원본). 목록 나가기·탭 닫기 때 따로 기록하지 않음 | 원본 근거 없음. 탭 닫기 전 기록(pagehide)을 원하면 한 줄 추가 |
| 단계 16 IsProcessing 대기 | 틀에 넣지 않음(§9) | 로직이 저장을 읽지 않게. 결과는 같음 |
| 깨진 문서 | 다음 요청 때 덮어씀 | 키 하나라 백업 칸이 없다 |
| 새 판 문서 | 쓰기 막음, 메모리 동작 | 데이터 보호 |
| 기구 비트 요청 | 첫 출발 때 비트 + 요청 | 비트를 켜는 원본 위치는 plaza_3d 판독을 따랐고 요청은 다른 메뉴 비트 꼴 [추정] |
| `?save=0` | 앱 저장과 떨어진 메모리 저장 | 옛 뜻 "저장 무시". 옛 코드는 무시하면서도 나갈 때 덮어썼다 |

## 11. 남은 것·검증 기록

- 가이드 메시지 속도 화면 UI(§8).
- 원본 저장 범위 중 웹에 없는 것: 보드·퀘스트·카드·스탬프·업적·보상·기록(MGRecorder) 섹션 — 해당 기능을 만들 때 섹션 등록.
- 세션 Work(MinigameModeWork)는 저장이 아니므로 허브·목록이 아직 따로 만든다(이번 범위 밖).
- 검증(2026-10-09): `tools/test_save.ts` 65/65(문서 7·마이그레이션 15·수명 6·실패 9·공유 6·commit 6·결정성 2(3,246 틱 같음)·메시지 속도 9·경계 5). 기존 노드 시험 전체(test_* 38개 + check_mgmcommon·check_logic·check_charselect·check_modeselect) 기대값 변경 없이 통과. `tsc`·`npm run build` 통과. :51811 페이지 1회(헤드리스, 촬영 없음): 옛 키 3개 → `mpj.save` 한 번 생성·옛 키 남음·실행 패널 COM 값 복원·dev/ui.html 목록 화면 콘솔 오류 0·4xx 0.
