확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**.
이 문서에 [실행]은 없다. 재구현 계산은 수행하지 않았다.

# menu00 — 가이드 키노피오 상호작용

2026-10-08. 원본 코드·명령·대화 데이터 판독과 현재 웹 소스 대조. 원본 실행·포팅 구현 없음.

## 1. 대상과 재사용 범위

**[판독·데이터]** 광장의 깃발 든 노란 키노피오다. 장소 라벨 `im_mn_guide_name` = “가이드 키노피오”, 설명 `im_mn_guide_detail` = “게임의 설정을 바꿀 수 있다”. 원본 객체는 `menu00::NpcManager` **+0x08의 MC**, `menu00::Kinopio`(NPC ID `0x20`, `KINOPIO` → `npc022`). `SetupMC`는 색 1, `mc_plaza_default_pos`(로케이터 2, x≈−5.06·z≈19.94), 몸 Y 회전 0으로 배치한다. 같은 모델을 쓰는 스탬프·카드·데이터하우스 직원이나, 기구 출발 때 새로 생성하는 MC의 쌍안경 전달은 이 대화의 대상이 아니다.

기존 분석은 다음을 그대로 사용한다. 아래에는 가이드 호출에 필요한 연결만 적는다.

| 공통 범위 | 참조 |
|---|---|
| 영역·3D 거리·PopGuide·플레이어 시선·입력 정지/재개 | [plaza_3d.md](plaza_3d.md) §3.5·§5.1·§6.10 ①·③ |
| 메시지 상태·글자 속도·넘김·소리, 선택지 위/아래·A·B | [message_window.md](message_window.md) §4~6·선택지 구현 정정, [dialog_box.md](dialog_box.md) §3.2·§5.2 |
| 인원·컨트롤러・유저 연동・캐릭터 선택 | [setplayer.md](setplayer.md) §3.2·§6 |
| 캐릭터 선택 결과・취소・중복/잠금 조건 | [charselect.md](charselect.md) §4·§6 |
| 모션/시선・소리・입력/에셋 처리 | [engine/README.md](../engine/README.md)의 04·05·06·09, [chara_assets.md](../engine/chara_assets.md) |

주요 근거(주소의 모듈을 구분):

| 근거 | 위치·심볼 |
|---|---|
| 광장 NPC·시퀀스 C | [plaza_menu00_npc_seq.c](../../../analysis/decomp/plaza_menu00_npc_seq.c): `SetupMC` 51행/menu00 @`0x7100039e3c`, `AddFrag` @`0x710003b80c`, `SelectedGuideImpl` 8305행/@`0x710005d7a0`, `UpdateImpl` @`0x7100059ed4` |
| 원본 전체 C·저장 파이버 | [menu00.nro.c](../../../ghidra_work/online/out/menu00.nro.c): `SelectedGuideImpl` 74991행, `SaveRequestFiber::Update` 118081행/@`0x71000923c0` |
| 원본 명령 이미지 | [menu00.nro](../../../extracted/romfs/nro/NX_Release/menu00.nro), [main.decomp.bin](../../../extracted/exefs/main.decomp.bin).C가 잃은 인자·반환값은 ARM64 명령으로 확인 |
| 위치/배치 | [plaza_menu00_world.c](../../../analysis/decomp/plaza_menu00_world.c): `GetAttachSocketPcFront` 10078행/menu00 @`0x710001b2b4`; 기존 영역 판독은 [plaza_menu00_c_dis.c](../../../analysis/decomp/plaza_menu00_c_dis.c) |
| 대화·화자 속성 | `extracted/message/koKR/{im_menu,menu01_main}.json`, 원본 `extracted/bea/message~koKR.nx.bea/mess/bin/koKR/menu01_main.msbt`의 ATR1, `message~mess.nx.bea/mess/bin/bq.msbp`의 속성 정의 |

## 2. 접근과 대화 시작

**[판독]** 공통 `MainImpl`(menu00 @`0x710005a170`)의 가이드 조건은 다음과 같다(판정 자체는 plaza_3d §6.10 ① 재사용).

- 자유 이동 상태 **2(Main)**, 온라인 세션 미접속. 접속 중에는 가이드 결과와 A 안내가 억제된다.
- 기구 영역 0 판정이 먼저다. 그 밖에서 **1번 위치–로케이터 2의 3D 거리 < 3**이면 결과 **5(SelectedGuide)**. 정확히 3은 제외한다. 영역 1에 속하거나 몸이 NPC 쪽을 향해야 한다는 추가 조건, 시야 광선 검사는 이 경로에 없다.
- 접근 시 MC `FragSwing`, MC는 1번 `head`를 보고 1번도 MC를 본다. 거리 밖에서는 영역 1이면 MC의 시선만 1번으로 유지한다. A 안내는 NPC가 아닌 **1번 머리 위**에 뜬다.
- **A 트리거 `0x1`** → `SQ_SE_SYS_DECI`·결정 진동 → 상태 5. `PlayerManager::Stop`, 장소 텔롭 Out, 메인 UI Finish/종료 대기를 거쳐 전용 흐름으로 들어간다. 대화 중 이동 입력은 다시 켜지지 않는다.

**[판독]** `SelectedGuideImpl` 시작 순서:

1. `PlayReportModule::ChangeSetting`. 이미 페이드 아웃 상태라면 마지막 wipe 형식으로 **1.0 s 페이드 인**하고 끝까지 기다린다(@`0x710005d7f8`). 일반 A 진입은 이 페이드를 새로 시작하지 않는다.
2. `PlayerManager::Stop` → 모든 플레이어가 로케이터 2를 보도록 `LookAt(..., false)`.
3. MC `TurnLookAt(1번 위치)` → `Walk` → `IsMoving`이 끝날 때까지 대기 → `Idle(0.3)`(@`0x710005d8cc`~`0x710005d918`). 여기서 Walk는 **제자리 선회 동안의 모션**이다. MC의 위치 이동 Start 호출은 없다.
4. `UiManager::GetUiMessageWindow`에 아래 4지선다를 설정한다. owner는 `WorkModule::GetOperationPlayerId`로 얻은 조작 플레이어, `SetCharacterEntity`는 MC 엔티티다. `DisablePadInput(false,false)`, `SetFlagForceAllDraw(false)`, `SetCancelEnable(true)` → Start → MC Talk.
5. `IsWorking`이 끝날 때까지 기다린 뒤 MC `Idle(0.3)`, 결과를 분기한다. 기다리는 대상은 글자 완료만이 아니라 창의 동작 종료다.

**[판독·데이터]** 본문 두 라벨의 ATR은 `WT_Taking`(철자 그대로, Talking 창), `CH_NPC022_YELLOW`(속성 번호 **11**), `Position=Default`, `Emotion=Default`, `WindowInfo=WI_None`, OffsetX/Y=0. 따라서 공통 `sys_meswin_talk_choices_00`와 **3D MC를 가리키는 말꼬리**가 필요하다. `CharacterData[11]`의 VoiceID도 `CH_NPC022_YELLOW`다. 같은 보이스를 쓰는 별도 “가이드(사회자)” 레코드 [1]과 혼동하지 않는다. 선택지 라벨들은 `WT_Empty`지만 창은 본문 속성으로 선택한다.

## 3. 선택지와 재진입

**[판독·데이터]** 본문 `mn01_mainMenu_mw_setting` = “준비를 다시 할까요?”. 원본 **인덱스 순서**는 라벨 접미 숫자 순서와 다르다(@`0x710005d990`~`0x710005da44`).

| 결과 | 라벨 | 표시 | 처리 |
|---|---|---|---|
| 0 | `mn01_mainMenu_mw_setting_a1` | 인원수 변경 | `ComUiSettingPlayer` 호출 |
| 1 | `mn01_mainMenu_mw_setting_a0` | 멤버 변경 | `ComUiSelectPlayerCharacter`만 호출 |
| 2 | `mn01_mainMenu_mw_setting_a3` | 메시지 속도 | 3지선다 미리보기·설정 저장 |
| 3 | `mn01_mainMenu_mw_setting_a2` | 그만둔다 | 광장 복귀. 이 칸의 결정 SE만 `SQ_SE_SYS_CANCEL`로 덮음 |
| −1 | B 취소 | — | 그만둔다와 같은 광장 복귀 경로 |

**[판독]** 위/아래 선택, A 결정, B 취소는 공통 메시지 선택지 규칙이다. 이 호출에는 칸 비활성화·인원별 선택지 제거가 없다.

`SequenceMainMenu+0xc0`은 초기 커서 저장칸이다. 생성자에서 **0**, 창 Start 전에 메시지 `+0x43c`에 복사한다. 첫 메뉴 종료 직후 **3**으로 바꾼다(@`0x710005daec`). 설정 세 갈래는 상태 **5를 유지한 채 반환**한다. `UpdateImpl`이 끝난 파이버를 확인하고 다시 SelectedGuide를 호출하므로, **설정 후 A로 NPC를 다시 누를 필요 없이 같은 메뉴가 열리며 “그만둔다”가 기본 선택**이다. 상태 5 파이버 callable(menu00 @`0x7100060514`)은 SelectedGuide 호출만 한다. 그만둔다/B 경로만 `+0xc0=0`, `+0x24=2`를 쓰므로 다음 자유 이동에서 A로 시작하면 다시 인원수 변경이 기본이다(@`0x710005e0fc`~`0x710005e108`).

## 4. 설정별 연결

### 4.1 인원수 변경

**[판독]** menu00 @`0x710005db2c`~`0x710005dcdc`, 복귀 @`0x710005e3d8`~`0x710005ecd0`.

- `ST_DUCKING_START_OPTION`, `DuckingAmb2D/3D(true)`, `DuckingVoice(false)` → **1.0 s FadeOut** → `ComMenuCamera::Stop`.
- 현재 씬에 엔티티 **`UiSelectPlayerCharacter`**를 만들지만, 이 갈래에 붙이는 것은 **`ComUiSettingPlayer`**다. `m_IsPlayerSetting=1`(참조 GOT menu00 @`0x71001d7100`), `MenuWorkAsync::KeepLocalPlayerData`로 진입 전 데이터를 보관한다.
- `StartArg`: x1 = `GetHumanPlayerCount() | (1<<32)`, x2 = **`0x0001_0101_0000_0004`**(@`0x710005dc84`~`0x710005dc98`). [setplayer.md](setplayer.md) §3.2의 정의로 **현재 인원·최소 1·최대 4·배경 켬·캐릭터 선택 켬·인원 단계 B 허용**. 기존 menu01 호출의 B 불가 인자를 그대로 복사하면 안 된다.
- `+0x38 > 3`을 기다린 뒤 `Out(false)` → `IsFinished` 대기. 취소 플래그 `ComUiSettingPlayer+0x100`이 켜졌으면 **RestoreLocalPlayerData**. 정상 완료이면 **KeepLocalPlayerData** → 광장 로컬 플레이어를 지우고 갱신 인원/캐릭터로 다시 만든다.
- 공통 설정 UI 내부 단계와 잠금 조건은 setplayer/charselect 참조. 가이드가 새 규칙이나 COM 난이도 선택을 추가하지 않는다.

**[판독]** 정상 완료 재배치: `PlayerType≠1(COM 아님)`·`IsLocal`만 순서대로 `SetupLocalPlayer`, `GetAttachSocketPcFront(사람 수,i)` = **`pc_plaza_start_pos_p%1d_pc%02d`**.`SetVisible(true)` → 모든 플레이어가 로케이터 **1(`mc_start_pos`)**을 즉시 봄.
카메라는 새 1번 엔티티로 대상 핸들을 교체하고 내부 기준점 `+0x50`에 **GetAttachSocketPcFront(1,0)**의 위치를 넣는다(참가 인원과 관계없이 1인용 첫 소켓).MC 몸 회전은 Y=0으로 즉시 재설정한다.

**[판독]** 취소/완료 공통 정리: `m_IsPlayerSetting=0`, 설정 엔티티 파괴, `StartMainMenuCamera`, `ST_DUCKING_FINISH_OPTION`, Amb2D/3D/Voice의 ducking false, **1.0 s FadeIn** → 상태 5 반환 → §3 메뉴 재표시.

### 4.2 멤버 변경

**[판독]** menu00 @`0x710005df14`~`0x710005e3a8`·`0x710005e98c`.

- 시작 ducking·1.0 s FadeOut·카메라 Stop은 인원수 갈래와 같다.
- 같은 이름의 씬 엔티티에 **`ComUiSelectPlayerCharacter(true)`**를 붙인다. 모드 `+0x104=0`, `SetBgVisible(true)`, `noAutoOut(+0xff)=1`, **`In(true)`**(@`0x710005e014`~`0x710005e06c`). 현재 인원을 유지하면서 공통 캐릭터 선택으로 간다. 페이드 인 1.0 s 후 조작을 기다린다.
- `IsFinished`·`IsDecided`·`cancelled(+0xfc)` 중 하나가 참이면 옵션 ducking을 해제하고 **1.0 s FadeOut** → `Out(false)`.
- 취소이면 재배치·BaseCharacterID 갱신을 건너뛴다. 결정이면 플레이어 목록의 `CharacterID`를 `BaseCharacterID`로 복사 → `KeepLocalPlayerData` → 로컬 플레이어 재생성. 소켓·카메라 기준점·MC 회전 재설정은 §4.1과 같다.
- 엔티티 정리 후 `StartMainMenuCamera`, 상태 **5로 반환**. 이 갈래의 최종 FadeOut은 재호출된 SelectedGuide의 처음 **1.0 s FadeIn**에서 해제되고, 기본 선택 3의 가이드 메뉴로 돌아온다.

**[판독]** 캐릭터 잠금은 기존 charselect의 폴린(GameFlag 1)·닌군(GameFlag 0), 사용 중 캐릭터 중복 제한을 그대로 따른다. 이 가이드 함수에는 해금 이벤트나 GameFlag 쓰기가 없다.

### 4.3 메시지 속도

**[판독·데이터]** 본문 `mn01_mainMenu_mw_message` = “저희가 말하는 속도를 설정할 수 있어요.”, 선택지 3개(@`0x710005dd24`~`0x710005dd6c`).

| 커서/결과 | 라벨 | 표시 | SystemData+0x74 저장값 |
|---|---|---|---|
| 0 | `mn01_mainMenu_mw_message_fast` | 빠름 | **1** |
| 1 | `mn01_mainMenu_mw_message_normal` | 보통 | **0** |
| 2 | `mn01_mainMenu_mw_message_slow` | 느림 | **2** |

**[판독]** 선택 창 초기 커서는 기존 저장값의 역매핑(1→0, 0→1, 2→2)이다.MC 엔티티·owner·입력 허용은 첫 메뉴와 같고, `SetMessageSpeedSampleMode(true)` 후 Start/Talk, 종료 후 Idle.
공통 미리보기 연결부 `FUN_710031a310`(main @`0x710031a310`)은 현재 **선택지 라벨의 `fast`/`slow` 문자열**로 글자 객체 속도를 고른다(각각 1/2, 나머지 0). 커서 변경 때 본문 출력도 다시 시작한다. 따라서 위 원본 라벨과 미리보기 모드가 필요하다. 실제 글자 시간은 message_window §6.3을 재사용한다.

**[판독]** 끝나면 `FindPreselectedUserSaveData → GetSystemData`의 **+0x74**에 매핑한 값을 씀(@`0x710005de90`~`0x710005deb0`) → `SetMessageSpeedSampleMode(false)` → `SaveRequestFiber` 생성/완료 대기. 파이버는 **SaveRequest → IsProcessing이 false가 될 때까지 Wait**한다(menu00 @`0x71000923c0`). 페이드·카메라 Stop·옵션 ducking은 이 갈래에 없다. 저장 대기 후 상태 5로 돌아가 §3 메뉴를 재표시한다.

**[판독] 속도 메뉴는 B 취소 불가:** 첫 메뉴 종료 후 공통 out 완료 처리 `FUN_7100315e5c`가 `FUN_7100318340`을 호출한다. 이 초기화는 **+0x514(sample)와 +0x515(cancelEnable)를 함께 0**으로 쓴다(main @`0x7100318394`: `strh wzr,[x0,#0x514]`). 속도 갈래는 sample만 다시 켜고 `SetCancelEnable(true)`는 부르지 않으므로 B가 무시되고 A로 세 값 중 하나를 결정해야 한다. `Start`의 동작만 보고 첫 메뉴의 취소 허용을 상속한다고 판단하면 안 된다. 저장식은 `r==2 ? 2 : (r!=1)`이지만 정상 입력에서 취소 결과 −1로 들어오는 경로는 없다.

## 5. 모션·카메라·소리와 종료

**[판독·데이터]** MC `AddFrag`는 `menu00_guide_flag00.fmdb`를 `attach_R_hand`에 `kinopio_flag`로 붙이고 모션 이름을 아래처럼 등록한다. 현재 변환 명세 [world/chara/spec.json](../../assets/plaza/world/chara/spec.json)의 npc022 클립 길이/loop도 확인했다.

| 동작 | 원본 클립 | 프레임·반복 |
|---|---|---|
| Idle | `bd_flag_idle00` | 120·loop |
| Talk | `bd_flag_talk00` | 160·loop |
| FragSwing | `bd_flag_swing00` | 30·loop |
| Walk(대화 전 선회) | `bd_flag_walk00` | 29·loop |

**[판독]** 위 호출의 모션 섞기는 **0.3 s**다. 모션 끝이 대화 종료 조건은 아니다. 머리 시선은 기존 ComHeading 규칙 참조.
몸 선회는 menu00 `ComNpcAutoInterpolation`의 회전만 사용한다. 기본값은 **360°/s**, 각차 **85° 이상**에서 **1100°/s**로 들어가며 빠른 선회 플래그는 도착 때 해제된다(생성자 @`0x71000910e4`: +0x5c/+0x60/+0x64, `StepRotation` @`0x7100091ee0`의 `LAB_71000921fc`). 항구 NPC의 120° 문턱(mgmet_3d §9.1 #3)을 가져오지 않는다.

**[판독]** 일반 가이드 대화에는 전용 카메라 컷/확대 호출이 없다. 추종 카메라가 남고 플레이어는 정지한다. 인원수·멤버 변경에서만 카메라 Stop/재개·페이드가 있으며, **새 씬으로 RequestCallScene 하지 않고 현재 광장 씬 안의 UI 컴포넌트**를 교체한다.
소리는 접근 A의 `SQ_SE_SYS_DECI`, 마지막 칸/B의 `SQ_SE_SYS_CANCEL`, 옵션 화면 시작/끝 FX 두 라벨, 메시지 공통 넘김·커서·화자 보이스가 연결된다. 메시지 ducking·보이스 선택은 기존 message_window/04_sound 명세를 쓴다. 가이드 전용 새 BGM/보상 징글 호출은 이 함수에 없다.

**[판독]** 그만둔다/B는 상태 **2**·초기 커서 **0**으로 복귀시키고 MC `Turn(Y=0)` → `Idle(0.3)` 후 반환한다.MC 복귀 회전 완료를 추가로 기다리지는 않는다. 재진입한 `MainImpl`이 `StartMainMenuCamera`, `PlayerManager::Start`, MC Idle, 메인 UI 생성/Start를 수행하고 거리 안내를 다시 평가한다. 가이드 상호작용의 영구 진행·첫 대화·해금 플래그는 확인되지 않았고, 변경하는 것은 로컬 플레이어 작업 데이터와 메시지 속도 저장값이다.

## 6. 현재 웹과 필요한 연결

**웹 소스 대조**(원본 동작과 구분):

| 항목 | 현재 웹 | 필요한 연결 |
|---|---|---|
| 대상·접근·A | [npc.ts](../../script/shell/plaza/npc.ts)의 `MC` 색 1·깃발·4클립, [interact.ts](../../script/shell/plaza/interact.ts)의 거리/온라인 억제·상태 5까지 있음 | 기존 판정/공통 NPC 재사용 |
| 대화 수명 | `decide`가 `interact:decide {result:5,target:'guide'}`를 내고 **다음 프레임 `resume`**. 상태 5 처리 부품은 [parts.ts](../../script/shell/plaza/parts.ts)에 없음.UI `decide`는 결과 3만 처리([ui.ts](../../script/shell/plaza/ui/ui.ts)) | 메뉴 종료까지 상태 5·플레이어 입력 정지 유지, 재진입 커서 3/종료 커서 0 |
| 첫 선회·Talk | 접근 FragSwing·머리 시선과 클립 등록까지 있음 | 몸 TurnLookAt/완료 대기, Talk/Idle, 종료 Y=0 |
| 메뉴 데이터 | [plaza_ui.json](../../assets/plaza/ui/plaza_ui.json)에 장소 이름/설명만 있음.mgmcommon spec·mgm01/mgmet 추가 데이터에도 **위 대화 9개 라벨 없음** | menu01_main 9라벨·ATR, 선택지 원본 순서, 화자 11 |
| Talking 창 | 공통 MessageWindow에 선택지 API는 있음. 현재 mgmcommon/plaza 명세에 **`sys_meswin_talk_*` 레이아웃 없음** | 기존 Parts.lyt `sys_meswin_talk_choices_00`와 참조 부품, MC 엔티티/카메라 투영·말꼬리 연결. 공통 상태기계는 재사용 |
| 설정 화면 | `setplayer`·`charselect`는 별도 화면 구현이 있음 | §4의 호출 인자·취소 복원·BaseCharacterID·광장 플레이어 재배치·카메라 대상 교체 |
| 메시지 속도 | 공통 `MessageWindow.setSpeed`는 있음. 속도 sample mode/선택 라벨에 따른 재출력 API는 없음 | sample mode on/off, 커서 미리보기, 0/1/2 매핑·저장 대기, B 취소 불가 |
| 페이드·소리 | 가이드 옵션 분기의 수명/ducking 처리는 없음 | 두 설정 화면의 1.0 s 페이드·옵션 ducking·공통 메시지 소리 어댑터 |

NPC 모델/모션/깃발은 이미 변환되어 있으므로 다시 추출할 필요가 없다. 추가 데이터는 위 메시지/ATR·Talking 선택창과 참조 부품이며, 모델 경로·폰트·메시지 파서·패드 비트·캐릭터 잠금·인원 UI를 별도로 재분석하지 않는다.

## 7. 남은 미확정과 검증 범위

- **[미확정]** Talking 말꼬리의 정확한 3D→2D 앵커·화면 가장자리 처리. 공통 문서에서도 범위 밖인 `FUN_71003161d0` 연결이며, 이 문서에서는 원본의 MC `SetCharacterEntity`와 창 데이터까지만 확정했다.
- **[미확정]** Default 감정에서 실제 재생되는 보이스 변형/타이밍은 message_window §6.5의 기존 미확정으로 유지한다.
- **[미확정]** 선회/페이드/말꼬리와 속도 미리보기의 시각 결과는 원본 실행 대조가 필요하다. 코드의 상태·값·취소 허용 분기는 위 판독 근거와 구분해서 검증한다.

검증은 기존 문서 재사용, 원본 C 및 필요한 호출 인자의 ARM64 판독, 한국어 JSON/원본 MSBT ATR·NPC 변환 명세 확인, 현재 웹 소스와 에셋 명세 대조에 한정했다. 원본 실행·웹 실행·빌드·포팅·기존 파일/스테이징 수정은 하지 않았다.
