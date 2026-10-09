확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**.
이 문서에 [실행]은 없다. 재구현 계산은 해당 항목에 따로 표시했다.

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
| 말꼬리·페이지 초기화 | [msgwin_main_all.c](../../../analysis/decomp/msgwin_main_all.c): main `FUN_71003161d0`·`FUN_7100318b50`·`FUN_7100318e30`·`FUN_7100318ff4`·`FUN_7100316fb0`; 레이아웃 `extracted/converted/ui/bq_Parts/sys_meswin_talk_choices_00.*` |
| 가이드 보이스 | `extracted/bea/bq.nx.bea/common/ftrg/vo_message.ftrg`, [AddonAudioProject.fspj](../../../extracted/bea/_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj)의 시퀀스·뱅크·파형; 포맷은 기존 [04_sound.md](../engine/04_sound.md) §4 재사용 |

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

### 2.1 가이드 창과 말꼬리

**[판독·데이터]** 위 두 본문은 Default 위치이므로 `FUN_7100315fe0`가 자동 배치(+0x50f)를 켠다. `FUN_71003161d0`는 매 프레임 MC **엔티티 원점+높이**를 투영한다. 높이 `h`는 `CharacterData::NPCHeight`(main @`0x71001d6d18`), 즉 NPC 데이터의 height × 엔티티 scale.y다. `common/data/characterlist.json`의 NPC `KINOPIO`/Number 22는 **height=1.2**. 머리 본이나 깃발 끝 좌표를 사용하지 않는다.

- 투영은 `LytPosFrom3DPos(...,0,0)`(main @`0x71001caec0`): Renderer **scene 0 / graphics layer 0**의 Viewport DrawCamera·scissor를 사용하고, 1920×1080 기준 중앙 원점·위쪽 +Y 좌표로 반환한다. 창 배치용 점은 `P(MC.pos+(0,h,0))`다.
- 창 엔티티 좌표는 `(P.x−win_base.x, P.y+win_base.height/2+60)`. 이후 `FUN_7100318b50`가 실제 `x_bd_00`의 폭 W·높이 H·로컬 위치 bx/by로 **x를 [−(1920−W)/2−bx, +(1920−W)/2−bx], y를 [−(1080−H)/2−by, +(1080−H)/2−by]**에 제한하고 페이지 offset을 더한다. 가이드 ATR offset은 0이다.
- `sys_meswin_talk_choices_00` 데이터: `win_base=(-184,0), size=(796,256)`, `x_bd_00=(0,−64), size=(1300,490)`. **W=1300 고정으로 구현하면 안 된다.** 배치 전 `FUN_710032018c`가 선택지 실측 너비로 경계를 갱신한다: 가장 긴 선택지 글자 폭을 T라 하면 선택창 폭 w=`max(232,min(748,T+130))`; 직전 창 엔티티 x≥0일 때 W=`1300−2×(748−w)`, 음수이면 1300. T 측정은 기존 공통 폰트/텍스트 레이아웃을 사용한다.
- **재구현 계산:** 위 기본 페인 값을 식에 대입한 창 배치 보정은 `(P.x+184,P.y+188)`, y 제한은 **[−231,359]**다. x 제한은 갱신된 W에 따라 달라진다.

**[판독·데이터] 비선택형 Talking도 같은 식:** `messageWindowList.json`의 `WT_Taking`은 Layout00=`sys_meswin_talk_00`, Layout01=`sys_meswin_talk_choices_00`이다. `FUN_710031a480`만 선택 유무로 레이아웃을 고르고, Default Talking은 둘 다 `FUN_71003161d0 → FUN_7100318b50`로 투영·클램프한다. 비선택형에는 `x_parts_00/x_window`가 없어 `FUN_710032018c`의 선택지 폭 보정이 실행되지 않는다. 경계값을 선택형에서 복사하면 안 된다(근거: 두 `*.tree.txt`와 같은 이름 BFLYT).

| 레이아웃 | win_base 위치·크기 | x_bd_00 위치·크기 | offset=0에서 **재구현 계산** |
|---|---|---|---|
| 비선택형 `talk_00` | (0,0), 796×256 | (0,−45), **880×452** | 보정 전 (P.x,P.y+188), x **[−520,520]**, y **[−269,359]** |
| 선택형 `talk_choices_00` | (−184,0), 796×256 | (0,−64), 초기 1300×490 | 보정 전 (P.x+184,P.y+188), x는 동적 W, y **[−231,359]** |

**[판독]** 말꼬리는 별도 점 `P(MC.pos+(0,h/2,0))`과 **보정 후 창 엔티티 위치+win_base 로컬 위치** 사이 방향을 정규화하고 `atan2(y,x)`로 고른다. `x_l_00..11`·`x_r_00..11`을 모두 숨긴 뒤 한 페인만 켠다(`FUN_71003161d0`·`FUN_7100318ff4`). 각도 범위와 선택 페인은 다음과 같다(각도는 +X 기준, +Y 쪽이 양수).

| 양의 각도 θ | 페인 | 음의 각도 θ | 페인 |
|---|---|---|---|
| 0≤θ<15° | x_r_02 | −15°<θ<0 | x_r_03 |
| 15≤θ<30° | x_r_11 | −30°<θ≤−15° | x_r_10 |
| 30≤θ<50° | x_r_01 | −50°<θ≤−30° | x_r_04 |
| 50≤θ<70° | x_r_08 | −70°<θ≤−50° | x_r_09 |
| 70≤θ<95° | x_r_06 | −85°<θ≤−70° | x_r_07 |
| 95≤θ<110° | x_l_06 | −110°<θ≤−85° | x_l_07 |
| 110≤θ<130° | x_l_08 | −130°<θ≤−110° | x_l_09 |
| 130≤θ<150° | x_l_01 | −150°<θ≤−130° | x_l_04 |
| 150≤θ<165° | x_l_11 | −165°<θ≤−150° | x_l_10 |
| 165≤θ<180° | x_l_02 | −180°≤θ≤−165° | x_l_03 |

**[판독·데이터]** θ=+180°도 x_l_03으로 간다. 방향 선택은 페이지 초기화 `FUN_7100316fb0`의 +0x512=1에서 **한 번** 수행한 뒤 플래그를 지운다. `FUN_7100318e30`가 매 프레임 방향을 다시 계산하게 하는 `TalkTailDirAuto` 목록에는 테스트 라벨만 있고 가이드 두 라벨은 없다. 따라서 **창 위치는 매 프레임 추종하되 말꼬리 방향은 페이지 동안 유지**한다. MC weak handle이 없으면 x_l_05를 보이는 대체 경로지만, 가이드는 MC를 명시적으로 연결한다.

### 2.2 다른 NPC에 재사용할 위치 데이터

**[데이터]** 기존 [msgwin_atr.py](../../tools/analysis/msgwin_atr.py)의 `read_msbp/read_atr/hash_table_names`를 쓰기 없이 재사용했다. `bq.msbp`의 OffsetX/Y는 **f32(+4/+8)**, Character/Position은 enum(+0x0e/+0x0f)이다. `extracted/bea/message~koKR.nx.bea/mess/bin/koKR/*.msbt` **71개** 중 `Character=CH_NPC*`, `WindowType=WT_Taking`으로 한정한 **29파일·25화자·2,337레코드**의 분포다. 다른 창 형식·언어·실제 호출 빈도는 이 집계에 포함하지 않는다.

| ATR Position | offset=(0,0) | 비영점 offset | 합계 |
|---|---:|---:|---:|
| Default | 457 | 780 | 1,237 |
| Top_Center | 95 | 283 | 378 |
| Top_Right | 28 | 286 | 314 |
| Top_Left | 45 | 129 | 174 |
| Center_Center | 0 | 85 | 85 |
| Center_Right | 0 | 75 | 75 |
| Center_Left | 0 | 74 | 74 |

명시 위치는 **1,100건**, 비영점 offset은 **1,712건**, offset 쌍은 **136종**이다. 예: `bd00.msbt` 레코드 98 `bd00_p01_mw_start00` = CH_NPC_GUIDE / Default / (0,175), 레코드 154 `bd00_s01_mw_whatBuy00` = CH_NPC003 / Top_Right / (−70,0); `bd07.msbt` 레코드 13 `bd07_gmk4_mw_welcome00` = CH_NPC029 / Default / (−107,38). **같은 노란 키노피오**도 `qtbd01.msbt` 레코드 64 `qtbd01_1100_00_mw_st00`은 Center_Right / (−108,56)이다(레코드 번호는 0부터).

**[판독] 공통 규칙과 가이드 예외:** 위치는 NPC 종류로 고정하지 않고 **페이지 ATR**에서 읽는다. [message_window.md](message_window.md) §6.1의 우선순위를 재사용한다: 명시 Position이면 `FUN_71003188c0/SetPlace`의 9방향 배치, Default Talking이면 §2.1의 화자 엔티티 투영; 양쪽 모두 pageOffset을 나중에 더한다. `SetOffset`의 x/y 중 하나라도 비영점이면 ATR offset을 대체하고, 비영점 absPos는 최종 위치를 대체한다. **클램프 뒤 offset에는 재클램프가 없다.** Default를 WindowData의 Top_Center로 바꾸거나 offset을 화자 높이에 섞지 않는다. 가이드 두 본문은 모두 Default / (0,0)이며 별도 위치 override 호출도 없다.

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

보충(2026-10-09, [../engine/16_save.md](../engine/16_save.md) §8): 저장·적용 쪽은 구현했다 — `view/save.ts` `guideMessageSpeedCursor`(초기 커서)·`guideMessageSpeedValue`(저장식)·`setGuideMessageSpeed`(+0x74 쓰기 → SaveRequestFiber 대기), 모든 MessageWindow 가 저장값을 페이지마다 읽음. 화면 UI(상태 5 부품·sample mode·라벨 재타이핑·B 취소 불가)는 아직 없다.

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

**[판독·데이터] 가이드 본문 보이스:** 공통 message_window §6.5의 키 선택 규칙에 아래 실제 ATR을 적용한다. `mn01_mainMenu_mw_setting`(koKR ATR 레코드 38)의 VoiceKey는 빈 문자열이므로 **선택형 Default의 `VoiceKey_Choices=VO_MV_QUESTION`**을 쓴다. `mn01_mainMenu_mw_message`(레코드 43)의 VoiceKey는 **`VO_MV_ETC_04`**로 지정되어 감정 기본값보다 우선한다. `GetAttrVoiceKeyText`의 문자열 위치는 ATR1 본문+레코드 첫 u32 offset이다(main `FUN_71001df824` → `FUN_71004e4610`); 일반/선택형이라는 이유로 두 번째 키를 QUESTION으로 바꾸면 안 된다.

| 본문 | 트리거 → 사운드 | 고정 시퀀스·파형 근거 |
|---|---|---|
| 설정 4지선다 | `VO_MV_QUESTION` → `SQ_VOI_NPC022_MV_QUESTION` | vo_message.ftrg의 노란 키노피오 항목 @파일 0xb8ac; sound 6022, FSEQ 시작 0x9ac, prg 12·note 60 → BNK_VOI_NPC022의 파형 49 |
| 속도 3지선다 | `VO_MV_ETC_04` → `SQ_VOI_NPC022_MV_ETC_04` | 같은 그룹 @파일 0x7dd00; sound 6005, FSEQ 시작 0x8e0, prg 6·note 63 → 같은 뱅크의 파형 0 |

**[판독·데이터]** 두 음원은 Resident `AddonAudioProject.fspj`의 FSEQ fileId 46·bank 47(fileId 165)·waveArchive 47(fileId 253)에 있다. 각 FTRG 자원은 하나이며 `PlayOffsetSec=0`, 해당 FSEQ 경로에도 wait/랜덤/조건 분기 없이 위 note를 낸다. **이 두 호출에 임의의 _01~03 변형을 고르는 처리는 없다.** 페이지 초기화 `FUN_7100316fb0`가 본문 출력 시작 후 `FUN_710031fe30`에서 보이스를 요청한다. 속도 커서 변경(`FUN_71003197d0` → `FUN_710031a310`·`FUN_71003235a8`)은 글자 출력만 다시 시작하고 보이스는 다시 요청하지 않는다.

**[데이터]** 같은 Talking 선택창의 BFLAN은 본문 `in` **5프레임**, 선택지 `in_choice` **30프레임**, `out` **5프레임**이다. 본문/선택지 그룹 알파를 바꾸며 out은 말꼬리 그룹 `null_02`도 첫 1프레임에 숨긴다. 애니 종료·선택 입력 허용 순서는 기존 message_window 상태기계를 재사용한다.

### 5.1 A 입력부터 보이스 요청·출력까지

**[판독]** 새로 여는 가이드 창의 순서는 아래와 같다. 공통 파이버 처리·Wait의 프레임 의미는 [01_core.md](../engine/01_core.md) §5.4·§6.4~6.5, 창 상태는 [message_window.md](message_window.md) §5를 재사용한다. **A→청취를 고정 ms/프레임으로 정한 타이머는 이 경로에 없다.**

| 단계 | 실행·대기 조건 | 근거 |
|---|---|---|
| A → 상태 5 | 결정 SE·진동 후 플레이어 Stop, 카드/로컬 안내 Out, 메인 UI Finish → `IsFinished`까지 Fiber Wait | menu00 `MainImpl` @0x710005a170 |
| 가이드 파이버 진입 | `UpdateImpl`이 기존 메인 파이버 완료와 wipe 종료를 확인한 갱신에서 생성. 생성 시점에 따른 첫 실행 프레임은 공통 파이버 규칙 | menu00 @0x7100059ed4 |
| MC 선회 → Start/Talk | §2의 선택적 FadeIn 완료·MC `IsMoving==false`를 기다린 뒤 호출. `Idle(0.3)`은 블렌드 인자이며 0.3초 Sleep이 아님 | `SelectedGuideImpl` @0x710005d7a0 |
| Start → 창 in 완료 | 새 창의 `Start`(직전 상태≠2)는 상태 0/하위 0을 설정. 창 갱신에서 `in` 재생→하위 1, 이후 PlaybackState==3까지 반환 | main @0x710031e660·0x71003153e8 |
| 페이지 초기화 → 보이스 요청 | in 완료를 확인한 갱신은 상태 1/하위 0 설정 후 반환. **다음 메시지 창 갱신**에 normal→본문 시작→`FUN_710031fe30`의 키 선택/FX Play | main @0x7100315328·0x7100315630·0x7100316fb0 |
| FX 큐 → 재생 이벤트 | Play 내부가 재생 항목을 manager+0x188 목록에 등록. FX 관리자 갱신 `FUN_7101111800` → `FUN_710111c050` → 항목 상태 처리 `FUN_710111a4e4`가 offset 충족 시 콜백 호출. 두 키의 offset=0 항목은 등록 후 첫 FX 처리에서 추가 offset 대기 없이 호출 | main @0x71005f0cec→0x7101112940, 항목 생성 @0x71011167e0 |
| 오디오 제출 지점 | 사운드 처리 루프 @0x71005dd7a0에서 @0x71005dd9bc → `FUN_71005c77a0` → `nn::audio::RequestUpdateAudioRenderer`(@0x710144b840) 호출. 이 API 호출 자체는 청취 시작 확인이 아님 | main ARM64; FX 이벤트에서 이 제출까지의 정확한 갱신 위상·첫 음원 반영은 미확정 |

**[판독·데이터]** 위의 in은 §5의 **5프레임 애니메이션**이고 완료 확인 뒤 **메시지 갱신 1회 경계**가 추가된다. 글자 출력 완료·`in_choice` 30프레임·`inputLock=0.2 s`는 이후 입력 단계에 속하므로 보이스 요청 전 대기에 합산하지 않는다. 두 키는 PlayOffsetSec=0이고 FSEQ 첫 note 전 wait도 없어 **데이터에 지정된 추가 대기는 0**이다. 다만 창 갱신과 FX 관리자 갱신의 상대 순서, 사운드 스레드·렌더러 버퍼가 첫 샘플을 받는 시점은 이 값으로 정할 수 없다. [04_sound.md](../engine/04_sound.md) §6.1의 5 ms 시퀀서 근사도 A→청취 지연 측정값으로 사용하지 않는다.

**[판독]** 그만둔다/B는 상태 **2**·초기 커서 **0**으로 복귀시키고 MC `Turn(Y=0)` → `Idle(0.3)` 후 반환한다.MC 복귀 회전 완료를 추가로 기다리지는 않는다. 재진입한 `MainImpl`이 `StartMainMenuCamera`, `PlayerManager::Start`, MC Idle, 메인 UI 생성/Start를 수행하고 거리 안내를 다시 평가한다. 가이드 상호작용의 영구 진행·첫 대화·해금 플래그는 확인되지 않았고, 변경하는 것은 로컬 플레이어 작업 데이터와 메시지 속도 저장값이다.

## 6. 현재 웹과 필요한 연결

**웹 소스 대조**(원본 동작과 구분):

| 항목 | 현재 웹 | 필요한 연결 |
|---|---|---|
| 대상·접근·A | [npc.ts](../../script/app/scene/world/plaza/npc.ts)의 `MC` 색 1·깃발·4클립, [interact.ts](../../script/app/scene/world/plaza/interact.ts)의 거리/온라인 억제·상태 5까지 있음 | 기존 판정/공통 NPC 재사용 |
| 대화 수명 | `decide`가 `interact:decide {result:5,target:'guide'}`를 내고 **다음 프레임 `resume`**. 상태 5 처리 부품은 [parts.ts](../../script/app/scene/world/plaza/parts.ts)에 없음.UI `decide`는 결과 3만 처리([ui.ts](../../script/app/scene/world/plaza/ui/ui.ts)) | 메뉴 종료까지 상태 5·플레이어 입력 정지 유지, 재진입 커서 3/종료 커서 0 |
| 첫 선회·Talk | 접근 FragSwing·머리 시선과 클립 등록까지 있음 | 몸 TurnLookAt/완료 대기, Talk/Idle, 종료 Y=0 |
| 메뉴 데이터 | [plaza_ui.json](../../assets/plaza/ui/plaza_ui.json)에 장소 이름/설명만 있음.mgmcommon spec·mgm01/mgmet 추가 데이터에도 **위 대화 9개 라벨 없음** | menu01_main 9라벨·ATR, 선택지 원본 순서, 화자 11 |
| Talking 창 | 공통 MessageWindow에 선택지 API는 있음. 현재 mgmcommon/plaza 명세에 **`sys_meswin_talk_*` 레이아웃 없음** | 기존 Parts.lyt `sys_meswin_talk_choices_00`와 참조 부품, §2.1의 MC 높이·카메라 투영·실측 경계·페이지별 말꼬리 연결. 공통 상태기계는 재사용 |
| 설정 화면 | `setplayer`·`charselect`는 별도 화면 구현이 있음 | §4의 호출 인자·취소 복원·BaseCharacterID·광장 플레이어 재배치·카메라 대상 교체 |
| 메시지 속도 | 공통 `MessageWindow.setSpeed`는 있음. 속도 sample mode/선택 라벨에 따른 재출력 API는 없음 | sample mode on/off, 커서 미리보기, 0/1/2 매핑·저장 대기, B 취소 불가 |
| 페이드·소리 | 가이드 옵션 분기의 수명/ducking 처리는 없음 | 두 설정 화면의 1.0 s 페이드·옵션 ducking·§5의 두 고정 보이스와 공통 소리 어댑터 |

**재구현 연결 요구 — 공통 책임과 가이드 데이터:** 현재 웹에 없는 API의 요구 범위이며 새 구현은 하지 않았다.

| 공통에서 맡을 계약 | 가이드가 전달·제어할 것 |
|---|---|
| MessageWindow: 본문/선택지 ATR, owner·화자 엔티티, 선택 결과·닫힘 수명, sample/cancel 설정 | MC·조작 플레이어·§3의 라벨 순서/커서, §4.3의 sample on/off. out에서 cancel이 초기화되는 공통 동작 보존 |
| Talking 배치: Layout00/01, x_bd·win_base, 카메라 투영·NPCHeight, Position/offset/override, 말꼬리 갱신 | 가이드 두 본문의 Default/0과 MC만 전달. 가이드 전용 클램프식·키노피오 공통 고정 위치를 만들지 않음 |
| Voice: 페이지 초기화에서 VoiceID·VoiceKey/Choices 기본값→FTRG→사운드, 요청/재생 상태 구분 | §5의 두 키·파형. A 이벤트에 바로 소리를 붙이거나 별도 고정 지연을 넣지 않음 |
| 광장 상호작용 수명과 설정 UI의 기존 계약 | §2의 선회 대기, 상태 5 유지/2 복귀, §4의 UI 인자·플레이어 재배치·저장·페이드 순서 |

NPC 모델/모션/깃발은 이미 변환되어 있으므로 다시 추출할 필요가 없다. 추가 데이터는 위 메시지/ATR·Talking 선택창과 참조 부품이며, 모델 경로·폰트·메시지 파서·패드 비트·캐릭터 잠금·인원 UI를 별도로 재분석하지 않는다.

## 7. 남은 미확정과 검증 범위

- **[미확정]** 선회·페이드·창/말꼬리의 최종 화면과 속도 미리보기의 원본 일치. 필요한 근거는 같은 인원·캐릭터·언어에서 **A 진입→각 설정의 결정/취소→자동 메뉴 재표시→종료**, 속도 커서 이동, 화면 가장자리 접근을 담은 원본 프레임 캡처와 당시 카메라/MC 위치·scale·선택지 실측 폭·활성 말꼬리 페인이다. §2.1의 계산과 BFLAN 프레임 값은 화면 확인 결과가 아니다.
- **[미확정]** §5.1로 A→보이스 요청의 조건 대기와 FX 큐·SDK 제출 지점은 좁혔다. 남은 것은 메시지/FX 갱신의 상대 위상, FX 사운드 콜백 수신→첫 음원의 렌더러 반영, 기기 출력 버퍼·파형 첫 유효 샘플까지의 시간, 최종 음량·동시 음원 억제다. 필요 근거는 원본의 A/Start/페이지 초기화/FX 갱신/사운드 시작/SDK 제출 타임스탬프와 오디오·화면 동시 기록이다. 파이버·BFLAN·offset 값만 합산한 가상 지연은 제시하지 않는다. 공통 FX 그래프·믹서의 나머지는 05_ui_input §10·04_sound를 참조한다.

검증 범위는 원본 C·ARM64 정적 판독, koKR 71파일의 NPC Talking ATR 위치/offset 집계와 가이드 ATR 문자열·JSON·캐릭터 높이·두 Talking BFLYT/BFLAN·FTRG·Resident FSEQ/뱅크/파형 데이터 확인, 현재 웹 소스/에셋 대조다. 원본·웹 실행이나 빌드 검증은 하지 않았다. 이 보완에서는 `plaza_guide.md`만 수정했고 코드·다른 문서·에셋·스테이징은 변경하지 않았다.
