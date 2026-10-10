# menu00 / op — 광장 진입·최초 소개·세레모니 분석

## 1. 개요와 실제 장면 경계

**[판독] 세레모니와 광장 안내는 다른 장면이다.** boot가 `op`를 요청하고, 영상 → Cut18 실시간 세레모니 → 타이틀 → `menu00` 교체 순으로 진행한다. 광장 안내의 주체는 `SequenceEntrance`; `SequenceFront`는 인원·캐릭터 설정과 재개를 맡는다. boot @`0x71000048e4`, op `GameFlow @0x7100022ca0`, menu00 `SequenceManager::Update @0x71000633d4`; [BOOT], [OP], [M00]; [공용 장면 수명 §5.2](../engine/01_core.md#52-bqscenebaseupdatemain-this0x38-판독-0x71002ca780).

| 구분 | 연출·원본 호출자 | 경계·저장값 |
|---|---|---|
| [판독] 부팅 영상 | boot GameFlow → RequestExchangeScene("op") → op Cut00 | `flow/op/movie/bq_op.mp4`; 버튼 스킵 허용=GameFlag0x18; [BOOT], [OP] |
| [판독] 광장 세레모니 | op StartCut18 @`0x7100023b60` → UpdateCut18 @`0x7100024190` | 카멕·PC20·색종이·전용 카메라. 광장 배경을 쓰지만 menu00 안내가 아니다; [OPCHAR], [OPMAP] |
| [판독] 타이틀 | op UiManager::UpdateTitle @`0x71000265c0`, ComUiTitle::Update @`0x7100027850` | Cut18 로컬20초부터 In; L/R계열 동시 Hold → 흰색 전환·저장·menu00; [OPT], [OP] |
| [판독] 첫 기구 안내 | menu00 SelectDestination @`0x71000513a0` → InitialRideBalloon @`0x7100051d80` | MenuData bit0 off. MC 설명·광장 전경·직접 걸어 기구 앞 A; [M00] |
| [판독] 첫 섬 소개 | menu01 Entrance::UpdateImpl @`0x710003bfb0` → InitialGuidanceImpl @`0x710003c4a0` | 별도 모드 메뉴, 소개 완료 후 bit0 기록; [M01]; [모드 선택 §3](modeselect.md#3-진입점과-호출-흐름-판독) |
| [판독] 첫 귀환 시설 소개 | menu00 Initialize @`0x7100062750` → Entrance(arg1) → InitialGuidance @`0x7100052dd0` | ReturnCode1·offline·bit1 off; 일곱 시설 설명 완료 후 bit1 기록; [M00] |
| [판독] 항구 소개 | mgmet opening/entrance/firstHowto | MinigameModeData opSkip/firstHowto, 위 MenuData와 별도; [항구 3D §10.1](mgmet_3d.md#101-카메라-클립-표--mgmetcamerainitialize-0x710000fe90-판독), [항구 흐름 §6.2](mgmet_flow.md#62-첫-설명과-저장)·[§8](mgmet_flow.md#8-다른-기능과의-상호작용저장되는-값) |

[데이터] 동일 주제 MD와 타이틀/오프닝 전용 MD는 검색에서 발견하지 못했다. 일반 광장·가이드·항구·모드 선택 문서는 재사용하고 고유 도입 연결을 추가한다. [광장 §2](plaza_3d.md#2-원본-동작-요약-구현-기준), [가이드 §1](plaza_guide.md#1-대상과-재사용-범위).

[판독] 정적 C·ARM64 인자·원시 데이터·기존 SASS 판독만 사용했다. **원본 게임·웹 화면·헤드리스·스크린샷 실행 증거 없음.** 초 환산과 모의 틱은 재구현 계산이며 원본 실측 시간이 아니다. 원본/extracted 읽기 전용, 키 출력·기록 없음. 이번 마감은 이 문서와 지정 기존7 MD의 절 끝 연결·정정만 변경한다. 도구/웹 코드/에셋/INDEX/README/SHARED/git 인덱스는 변경하지 않는다.

## 2. 원본·자료·재사용

주소 베이스는 `0x7100000000`이며 모듈을 함께 읽는다. 출처 약칭은 아래 파일 링크다.

표기: **[판독]**=기존/추가 원본 C, **[판독: 어셈블리]**=정적 ARM64 인자·참조, **[데이터]**=원시 자원·기존 파일 내용, **[추정]**=원본 동작의 근거 있는 해석, **[설계]**=웹 적용 판단·제안, **[미확정]**=확보하지 못한 원본 연결·출력 한계. 함께 붙은 표기는 복수 근거다. **[재구현 계산]**은 식을 계산한 값이며 원본 실측과 구별한다. 사용자 선택은 §15, 설계만인 구현 계획은 §16이다.

| 약칭 | 자료 |
|---|---|
| [BOOT] | 기존 [scene_boot.c](../../../analysis/decomp/scene_boot.c) |
| [M00] | 기존 [menu00.nro.c](../../../ghidra_work/online/out/menu00.nro.c), [함수 목록](../../../analysis/functions/menu00.nro.tsv) |
| [M01] | 기존 [menu01.nro.c](../../../ghidra_work/online/out/menu01.nro.c), [함수 목록](../../../analysis/functions/menu01.nro.tsv) |
| [OP] | 신규 [plaza_intro_op_boundary.c](../../../analysis/decomp/plaza_intro_op_boundary.c), [op 함수 목록](../../../analysis/functions/op.nro.tsv) |
| [OPT] | 신규 [plaza_intro_op_timing.c](../../../analysis/decomp/plaza_intro_op_timing.c): 제목 시작·캐릭터 초기화 |
| [OPF] | 신규 [plaza_intro_op_followup.c](../../../analysis/decomp/plaza_intro_op_followup.c): 배치·모션·Map·수명·title 풍선23함수 |
| [POOL] | 신규 [plaza_intro_pool_dof.c](../../../analysis/decomp/plaza_intro_pool_dof.c): main 풀 등록/해제·DOF getter3함수; [pool_callback.c](../../../analysis/decomp/plaza_intro_pool_callback.c)3함수·[pool_virtual.c](../../../analysis/decomp/plaza_intro_pool_virtual.c)3함수 |
| [GATE] | 신규 [plaza_intro_menu00_gates.c](../../../analysis/decomp/plaza_intro_menu00_gates.c): 상태 람다5·카메라 종료1 |
| [CAMRAW] | [plaza_intro_camera_raw.json](../../../analysis/plaza_intro_camera_raw.json): op/scroll/deco 원시 키 |
| [OPENV] | [plaza_intro_op_env_raw.json](../../../analysis/plaza_intro_op_env_raw.json): 환경·광원·포스트·배치 본 |
| [MOTION] | [캐릭터 클립 원시 자료602개](../../../analysis/plaza_intro_character_motion_raw.json) |
| op 고유 애니 | [op 배치/환경/VAT 원시 애니](../../../analysis/plaza_intro_op_motion_raw.json) |
| [FTRGRAW] | [PC20·NPC051 FTRG 자료180개](../../../analysis/plaza_intro_op_ftrg.json): 참조 체인·키·조건 |
| [VFXRAW] | [ESET·EMTR·GTNT](../../../analysis/plaza_intro_op_vfx_raw.json), [BNSH SM53 인덱스](../../../analysis/plaza_intro_op_shader_index.json) |
| [VAT] | [4색 재질](../../../analysis/plaza_intro_vat_mats.json), [프로그램 선택](../../../analysis/plaza_intro_vat_prog/match.json), [원본 shader pack 복사](../../../analysis/plaza_intro_shader_pack) |
| [MOVIE] | [MP4 컨테이너 메타](../../../analysis/plaza_intro_movie_metadata.json) |
| [TITLE] | [opTitleCharacterList.json](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opTitleCharacterList.json) |
| [OPCHAR] | [opCharacterList.json](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opCharacterList.json) |
| [OPMAP] | [opMapStructure00.json](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opMapStructure00.json) |
| [OPMSG] | [opMessageList.json](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opMessageList.json) |
| [MAP] | [MapStructure.json](../../../extracted/bea/menu~menu00.nx.bea/menu/menu00/data/MapStructure.json), [CameraParam.json](../../../extracted/bea/menu~menu00.nx.bea/menu/menu00/data/CameraParam.json) |
| [KO] | [menu01_mode.json](../../../extracted/message/koKR/menu01_mode.json), [menu01_main.json](../../../extracted/message/koKR/menu01_main.json) |

[판독] [INDEX.tsv](../../../analysis/decomp/INDEX.tsv)·함수 목록을 먼저 대조했다. 1차 op23+2·menu00 6함수, 후속 op23·main9함수: 합계63함수다. 기존 CharacterDecompAddr/MgmcommonDecompCreate로 묶어서 추출했다. 추가 전 대상 함수·자료 공백을 보고했다. 앞선5 C의57함수는 **INDEX 등록됨(2026-10-10)**을 이번에 읽어 확인했으며(§14), 이 작업에서 INDEX는 수정하지 않았다. `-noanalysis -readOnly`로 Ghidra 프로젝트 변경을 폐기했다. 원본 NRO는 `extracted/romfs/nro/NX_Release/{boot,op,menu00,menu01}.nro`. camera_probe의 baked 값은 원본 f32 평가 증거로 쓰지 않고 **원시 키만** 재사용한다. [CAMRAW]; [07 §6.4](../engine/07_camera_lighting.md#64-커브-평가키-경계-fres-animcurve-판독-main-arm64).

| 공통 기능 | 재판독 없이 재사용할 절 |
|---|---|
| [판독] 시간·Fiber·장면 | [01 §4.4](../engine/01_core.md#44-장면별-프레임레이트-강제-판독)·[§6.5](../engine/01_core.md#65-대기-함수-판독-fun_710018ddb0-fun_710018de1c-fun_710018dbb0-fun_710018df14-fun_710018e070) |
| [판독][데이터] 모델·재질·텍스처 | [03 §4.4.2](../engine/03_graphics.md#442-재질-구성-요소)·[§4.5](../engine/03_graphics.md#45-텍스처-참조-ftxb-데이터): SamplerAssigns 경유 필수 |
| [판독] 소리·UI·입력·FTRG | [04 §12.14](../engine/04_sound.md#1214-화면별-원본-bgm-판독-2026-10-08), [05 §7.5](../engine/05_ui_input.md#75-comfxtriggerplay참조애니-이벤트-판독), [가이드 §5.1](plaza_guide.md#51-a-입력부터-보이스-요청출력까지) |
| [판독] 로딩·Params·카메라·조명 | [06 §1.3](../engine/06_scene_data.md#13-경로-문자열--파일-해석-판독--데이터)·[§6](../engine/06_scene_data.md#6-장면-파라미터-rtti-params), [07 §6.1](../engine/07_camera_lighting.md#61-적용기-fun_71006c1120-판독)·[§6.4](../engine/07_camera_lighting.md#64-커브-평가키-경계-fres-animcurve-판독-main-arm64)·[§6.6](../engine/07_camera_lighting.md#66-평행광-transform렌더-연결-판독데이터) |
| [판독] 효과·캐릭터·표정 | [08 §5.3](../engine/08_effects.md#53-내부-갱신정지부착-행렬), [09 §6.6](../engine/09_character.md#66-프레임-진행framemax큐-순서-판독)·[§6.9](../engine/09_character.md#69-눈동자-uv마스크-판독--데이터) |
| [판독] 셰이더·와이프·저장 | [14 §2.2](../engine/14_shader_graphs.md#22-같은-sass재사용-조건), [15 §1](../engine/15_transition.md#1-원본-계약-판독), [16 §1.2](../engine/16_save.md#12-savedata-안-배치-판독)·[§2](../engine/16_save.md#2-저장-요청-수명-판독) |
| [판독] 현재 연결·캐시 | [로더 §11.4](../engine/loader_manager.md#114-3단계--광장-단계-로딩)·[§14](../engine/loader_manager.md#14-4단계--광장-렌더러-하나-광장만-설계--구현-전에-먼저-적음-plaza-gl), [공용 감사 §3](../engine/common_system_audit.md#3-그래픽카메라후처리)·[§5.2](../engine/common_system_audit.md#52-세이브보고업적보상영상)·[§5.4](../engine/common_system_audit.md#54-자원-로딩캐시수명) |

## 3. 진입점·전체 시퀀스

### 3.1 부팅에서 광장까지

1. [판독] boot GameFlow @`0x7100004520`: 공용 아카이브 준비·로딩 대기 → 컨트롤러 안내 → DefaultEntry("menu01") → **RequestExchangeScene("op")** → 계정/저장 대기·Work 변환. DefaultEntry를 최초 광장 장면으로 오해하지 않는다. 문자열 인자 @`0x71000048d0/48e4`; [BOOT], [06 §1.5](../engine/06_scene_data.md#15-장면이-아카이브를-싣는-경로-판독).
2. [판독] op BeginScene @`0x7100021984` NPC·모션 준비, SetupGame @`0x7100021a20` Sequence 생성. Sequence::Setup @`0x7100022250`: 1920×1080 RT, picture.bflyt/x_pict, Movie bq_op.mp4 preload, b/g/r/y 풍선 모델 풀·색종이 준비. [OP].
3. [판독] GameFlow @`0x7100022ca0`: preload 완료 → flag18 캐시 → Character/Pos/Camera/Map/UI/Sound/Balloon00/01 관리자 → SetupChara → Cut00 루프 → Cut18 루프 → CharacterManager 해제 → 타이틀 기구 관리자 시작. [OP].
4. [판독] Cut00는 Movie 위치(마이크로초)를 f32 초로 변환해 메시지·Sound에 전달. SceneParams의 **Cut(+8)**!=0이면 영상 시작·Sound 타임라인을 건너뛰는 별도 경로. StartCut00 @`0x7100023800`, UpdateCut00 @`0x71000239dc`; [OP].
5. [판독] 자연 Cut18는 영상 페인을 숨기고 카메라·배치 애니·normal confetti를 시작. 스킵은 White out(speed1) 완료 → Sleep(0.5초) → 캐릭터 초기화 → 카메라/배치 FrameMax → skip confetti/UI/소리 정리 → in. StartCut18 @`0x7100023b60`; [OP].
6. [판독] Cut18 elapsed>=20이면 제목 In과 SM_BGM_TITLE. In 종료 후 안내 In·state2, `(hold&0x50)!=0 && (hold&0xa0)!=0`이면 시작 SE·진동·Out. UiManager UpdateTitle @`0x71000265c0`, ComUiTitle Update @`0x7100027850`; [OPT], [OP].
7. [판독] 제목 종료 → White out 완료 → flag18 on → SaveRequest/IsProcessing 대기 → **NextScene(+0xc)==0**이면 ReturnCode(4,0)·Exchange("menu00")·Sleep(-1). TITLE은 여기서 따로 Stop하지 않아 Front로 이어진다. GameFlow @`0x7100022ca0`, 문자열 @`0x7100022ef4`; [OP], [04 §12.14](../engine/04_sound.md#1214-화면별-원본-bgm-판독-2026-10-08).

### 3.2 menu00 생성과 Front/Entrance

[판독] BeginScene @`0x7100046160`: 동기화 완료 뒤 PC ID0..21 LoadModel(id,0,1)·NPC 모델 준비. **22모델 준비는 22명 배치가 아니다.** SyncedSetupGame @`0x7100045cf0`: Parameter→Sound→UI→Map→Camera→Player→NPC→Sequence Initialize→Network. [M00], [06 §2.1](../engine/06_scene_data.md#21-id-판독--데이터).

| 계기 | 시퀀스·인자·동작 |
|---|---|
| [판독] ReturnCode!=1,2,3 | Front(0,arg0). op의 code4도 여기. 재개/MenuAsync 조건도 code4 생성; Initialize @`62750`·Update @`633d4`; [M00] |
| [판독] Front 설정 끝 | SettingPlayerImpl @`0x7100054c10`: RestoreLocalPlayer→설정 창 완료→KeepLocalPlayer→창/배경 Out→Entrance(1,arg0). Front destructor @`0x7100054440` StopTitle preset2; [M00] |
| [판독] ReturnCode1·offline·bit1 off | Entrance(1,arg1): 임시 인간 PC를 Front 소켓에 만들고 state6; [M00], [GATE] |
| [판독] ReturnCode1·bit1 on/session | Main(2,arg1) 또는 BoardMode2·장식 보상/퀘스트 분기. 최초 소개 강제 금지; [M00] @`62750` |
| [판독] ReturnCode2/3 | Quest(4) / DataHouse(8,arg1), BoardMode2 예외 존재; [M00] @`62750` |

[판독] Front Setup @`0x71000547d8`와 Entrance Setup @`0x7100050e38`: 기구 표시·MC·Front 카메라·Disconnect·TITLE 없으면 MENU·ambience duck. Front state3 ReEntryImpl @`0x71000553f0`은 유효 재개 데이터가 없으면 state2 설정으로 간다. [M00], [가이드 §4.1](plaza_guide.md#41-인원수-변경).

### 3.3 Entrance 상태와 선택

[판독] Start @`0x7100053b44`: +0x20=arg,+0x24=1. UpdateImpl @`0x71000510b0`은 Fiber 미완료/Wipe 재생 중이면 다음 상태를 만들지 않는다. arg1→state6, arg0→state2. [M00], [GATE], [01 §5.4](../engine/01_core.md#54-파이버-수명-판독).

| 상태/선택 | 작업·종료 조건 |
|---|---|
| [판독] state2 | SelectDestination @`0x71000513a0`. bit0 off→5; on→mn01_connect_mw_start00 두 선택지; [M00], GATE @`53bc4` |
| [판독] 선택0 | MC FragSwing→Sleep(2초)→4. 결정 SE SQ_SE_SYS_DECI_L·진동 bv_vib_sys_deci_l; [M00] |
| [판독] 선택1 | offline·bit1 off: StopTitle preset3=0.2초·PlayMenu→6. 그 밖 StopTitle preset2=0.7초→3; [M00], [04 §12.14](../engine/04_sound.md#1214-화면별-원본-bgm-판독-2026-10-08) |
| [판독] state3 | ToMainMenu @`0x7100051c20`: White out 완료·임시 PC 파괴→manager(2,1)·Entrance7; [M00], GATE @`53c24` |
| [판독] state4 | ToMode @`0x7100051d00`/GATE @`53c90`: White out 완료→manager(3,0)·Entrance7 |
| [판독] state5 | InitialRideBalloon @`0x7100051d80`; 기구 앞 A→4; [M00], GATE @`53d60` |
| [판독] state6 | InitialGuidance @`0x7100052dd0`; 마지막 대사·저장 완료→3; [M00], GATE @`53dc0` |
| [판독] state7 | IsEnd/Finish, SequenceManager가 수명 정리; [M00] @`53b44` |

[판독] m_Param+8은 **GroupUnlock**이다. 참이면 로컬 정보 복구·TITLE 정지 후 bit1 off→시설 소개, on→Main 직행하는 디버그 분기다. 저장값으로 해석하지 않는다. menu00 Params::getPropertyList의 GroupUnlock offset8·EnableSave9·DebugVisible0xa·DebugReturnCode0xc와 대조했다. [M00] @`513a0`; [06 §6](../engine/06_scene_data.md#6-장면-파라미터-rtti-params).


[판독] Front 재개는 별도 경로다. ReEntryImpl @`0x71000553f0`: 유효 저장·+0x10이 없으면 설정. `sys_reentry_dlg_check00`에서 계속 선택하면 계정/컨트롤러 복구·ReturnCode(0,1)·네트워크 확인 후 ReEntryFiber를 만든다. 폐기 확정(`check01`) 또는 접속 실패(`check03`)는 ReentryData Clear→SaveRequest 완료→설정으로 돌아간다. 재개 성공의 보드별 목적지는 공용 ReEntryFiber 영역이며 광장 소개로 합치지 않는다. [M00], [공용 저장 §1.2](../engine/16_save.md#12-savedata-안-배치-판독).

[판독] op Params::getPropertyList @`0x7100001710`: Cut8/NextScene0xc/DrawTime0x10/DrawTitle0x14/DrawTitleGuide0x18/DrawMessageWindow0x1c. Cut!=0은 Cut00만 생략하고 +bc를 켜지 않으므로 사용자 버튼 스킵의 FrameMax 경로와 같지 않다. 디버그 표시 옵션과 최초 저장 flag18을 분리한다. [OPF], [06 §6](../engine/06_scene_data.md#6-장면-파라미터-rtti-params).

## 4. 저장·최초/재진입·스킵·수명

| 값 | 읽기·쓰기·조건 |
|---|---|
| [판독] GameFlag0x18 | op GameFlow에서 +0xbd에 캐시. Cut00 trigger&0x3000은 허용일 때만 +0xbc(skip). 첫 시청 버튼 스킵 불가. 타이틀 종료 후 On(0x18,0,PlayerID=-1)·저장 완료; [OP] @`2ca0/239dc` |
| [판독] MenuData bit0 | menu00 SelectDestination·BalloonTakeOff와 menu01 CheckSaveFlag(0)이 읽는다. menu01 SetSaveFlagOn @`0x71000b80f0`: Work+0x10과 host 저장 u64에 OR1, InitialGuidance 마지막 RequestSave; [M00], [M01] @`3c4a0/b81a0`; [16 §1.2](../engine/16_save.md#12-savedata-안-배치-판독) |
| [판독] MenuData bit1 | offline ReturnCode1·선택1에서 읽음. 시설 소개 끝 OR2→SaveRequestFiber 완료 대기; [M00] @`62750/513a0/52dd0`; [16 §2](../engine/16_save.md#2-저장-요청-수명-판독) |
| [판독] 재개 | ReentryData validity/+0x10·MenuAsync·session은 별도 Front 복구 분기; [M00] @`62750/553f0` |
| [판독] 항구 | MinigameModeData opSkip/firstHowto는 MenuData bit0/1과 별도; [항구 §8](mgmet_flow.md#8-다른-기능과의-상호작용저장되는-값), [16 §1.2](../engine/16_save.md#12-savedata-안-배치-판독) |

[판독] 확인한 menu00 전체 C의 GetMenuData 경로에는 bit0 OR1 writer가 없다. **TakeOffImpl @`0x71000470d0`은 읽기만 한다.** 기존 [광장 §6.10④](plaza_3d.md#610-c-갈래-판독-결과--npc따라가기상호작용기구-출발-plaza-c-2026-10-08)의 “첫 출발 때 켬”은 menu01 섬 소개 완료 기록과 구분해야 한다. 현재 웹 [balloon.ts](../../script/app/scene/world/plaza/balloon.ts)는 이륙 끝 setMenuBit(0)이므로 기록 시점이 다르다. [M00], [M01] @`3c4a0/b80f0`.

[판독] 기구 스킵은 bit0 on·offline·Wipe 미재생·덮이지 않은 동안 +/-0x3000. SQ_SE_SYS_SKIP·transition who·White out 뒤 menu01 Call. 시설 소개에는 같은 전체 스킵 검사 없이 메시지 IsWorking 대기만 있다. 대사 넘기기와 전체 스킵을 합치지 않는다. [M00] @`470d0/52dd0`; [광장 §6.10](plaza_3d.md#610-c-갈래-판독-결과--npc따라가기상호작용기구-출발-plaza-c-2026-10-08).

[판독] bit1은 마지막 대사·저장 완료 뒤 Main에 인계한다. 그 전에 중단하면 아직 off여서 다음 적합한 귀환에 재진행 가능. 저장 실패 UI·재시도 정책까지 판독한 것은 아니다. [M00] @`539d8~53b34`; [16 §2](../engine/16_save.md#2-저장-요청-수명-판독).

## 5. 첫 기구 안내: 대사·배치·입력

[판독] InitialRideBalloonImpl @`0x7100051d80`: 메시지 owner=OperationPlayer, DisablePadInput=false·ForceAllDraw·MC 지정. MC Talk/Idle의 0.3은 모션 블렌드 인자이며 Sleep 시간이 아니다. [M00], [KO]; [가이드 §5](plaza_guide.md#5-모션카메라소리와-종료).

| 순서 | 대사·연출·종료 |
|---|---|
| [판독] 1 | Front·TITLE duck 해제→mn01_mode_mw_first_start00/01(환영·준비). Talk→IsWorking false→Idle(0.3); @`51ea0` |
| [판독] 2 | White out→enum16 deco_00→in→first_plaza00/01(광장 전경·설명은 나중). ev_intro_shop 개별 클립 호출 없음; @`52068` |
| [판독] 3 | White out→StopAnim·Front·in→first_depart00(기구로 섬 이동)→대사 완료·out; @`52238` |
| [판독] 4 | 임시 PcTakeOff 파괴→로컬 인간 Player 생성·Default 소켓·표시→추종 target=첫 PC, targetPos=locater3, constrain(+0x60)=1→CollisionFirst on→in·PlayerManager Start; @`51d80` |
| [판독] 5 | MC FragSwing·첫 PC 시선→first_guide(기구에 타라는 안내), DisablePadInput=true·PopGuide type0. 이동과 접근을 기다림; @`52690` |
| [판독] 6 | GetArea==0·A trigger bit1→SQ_SE_SYS_DECI·bv_vib_sys_deci→**SetVisible(false)**·Player Stop·Pop 파괴→state4. 영역 밖 Pop out; @`52aa4/52ac4` |

위 주소는 menu00이며 모든 행의 원본은 [M00], 한국어 라벨은 [KO]다. SetVisible의 bool은 ARM64 @`52b14`의 `mov w1,wzr`→@`52b18` 호출로 확인했다. Pop 생성 @`52748`은 type0 저장→@`5274c` 호출이다. [ARM].

[판독] Front 소켓=`pc_plaza_start_pos_p%1d_pc%02d`, Default=`pc_plaza_balloon_pos_p%1d_pc%02d`; 인간 수·인간 목록 순번을 인자로 쓴다. locater1=mc_start_pos, 2=mc_plaza_default_pos, 3=char_plaza_default_pos. 본 위치·회전 사용, authored scale을 인물에 상속하지 않는다. MapManager @`0x710001b2b4/1b3ec/1a5cc`; [M00], [배치 glb](../../assets/plaza/world/model/menu00_loc_attach00.glb), [광장 §6.10](plaza_3d.md#610-c-갈래-판독-결과--npc따라가기상호작용기구-출발-plaza-c-2026-10-08).

[판독] 접근 영역0은 z<18·−9<x<9. Pop 아이콘1·회전−45°, WorldToViewport 머리 좌표를 x×960+70,y×540에 배치. 메시지 Out은 camera targetPos와 locater3의 거리가0보다 크고 메시지 working·notOut일 때. 고정 시간 자동 종료가 아니다. [M00] @`51d80`; [광장 §2](plaza_3d.md#2-원본-동작-요약-구현-기준)·[§5.1](plaza_3d.md#51-d-갈래-판독-결과--2d-ui스탬프위치-동기-2026-10-08-plaza-d).

## 6. 첫 귀환 시설 소개: 순서·대사·카메라

[판독] InitialGuidance @`0x7100052dd0`: NpcManager Setup→상점 NPC3 Idle(0.3)·카멕 busy→메시지 owner/MC 설정→Front·duck 해제·필요한 in 완료→PlayMenu. 각 대사는 Talk→메시지 종료→Idle. [M00], [KO]; [가이드 §5](plaza_guide.md#5-모션카메라소리와-종료).

접두사=`mn01_main_mw_first_`. camera enum15=guidance(scroll), enum16=deco_00. 아래 상태·라벨의 원본은 [M00] @`52dd0`, 구간 정지는 [GATE] @`6810`, 키는 [CAMRAW]다.

| 단계 | 카메라·프레임 | 대사 접미사·내용 | 인계 |
|---|---|---|---|
| [판독] 귀환 | Front | start00: 돌아와 반갑다는 안내 | CrossFade out |
| [판독] 전경 | deco_00 0부터 | look00/start01: 중앙 분수·일곱 시설 | 대사 끝→Cross out→StopAnim |
| [판독] 스탬프 | guidance **0→100** | stampShop00/01 | 시작 전 직원3 Bye·카멕 busy·Cross in |
| [판독] 카드 | **100→160** | cardShop00/01 | 이동 끝 뒤 대사 |
| [판독] 음악 | **260→320** | musicShop00 | 이동 끝 뒤 대사 |
| [판독] 기록 | **420→480** | dataHouse00 | 이동 끝 뒤 대사 |
| [판독] 랭킹 | **580→640** | ranking00/01 | 이동 끝 뒤 대사 |
| [판독] 친구 | **740→840** | friend00 | 이동 끝 뒤 대사 |
| [판독] 퀘스트 | **940→980** | quest00/01 | 이동 끝 뒤 대사 |
| [판독] 마무리 | Cross out→StopAnim→Front→in | end00/01/02: 자유 이동 안내 | OR2→저장 Fiber 완료→state3→White out→Main |

[판독] PlayAnim(enum,from,to) @`0x7100005380`: 이전 추종 Fiber 파괴→Play·speed1·SetFrame(from)→종료 Fiber 생성. **currentFrame>to**일 때 SetFrame(to)·StopAnim·Wait·IsFinished. >=로 바꾸면 경계가 달라진다. 첫0→100은 in/대사와 겹치며 나머지 이동은 완료 뒤 대사. [GATE], [M00]; [07 §5.2](../engine/07_camera_lighting.md#52-일반-카메라-클립-수명-다른-게임용-판독--09-참조).

[판독] 별칭 표 @`0x71001c7a58`와 경로 상대 표 @`0x710019b2e4`, Initialize @`0x7100004800`: enum15→menu00_ev_intro_scroll_cam.fsnb, enum16→menu00_deco_all_cam.fsnb. 개별 stamp/card/music/collection/ranking/quest/friend fsnb가 있어도 위 호출은 scroll 분할 재생이다. [M00], [CAMRAW], [변환 자료](../../assets/plaza/world/anim).

## 7. 시간표·f32 보간·페이드

### 7.1 시간과 와이프

[판독] menu 장면 dt는 리듬 장면 강제1/60과 같다고 가정할 수 없다. 애니60fps 시간축·MainModule dt·Fiber 조건 대기는 별개. [01 §4.4](../engine/01_core.md#44-장면별-프레임레이트-강제-판독)·[§6.1](../engine/01_core.md#61-프레임-스텝-fun_7100987af8-다음-프레임용-fun_7100983e48이-부른다-판독-디스어셈블리-확인), [09 §6.6](../engine/09_character.md#66-프레임-진행framemax큐-순서-판독).

[판독] Fade s0=**속도**, 1=White·2=CrossFade. White in/out20f, Cross out1f/in20f; speed0.5이면 White40f. 기존 “1초/0.5초 페이드”를 그대로 쓰면 틀린다. Sleep(0.5/2)는 초 그대로. [15 §1](../engine/15_transition.md#1-원본-계약-판독)·[§1.1](../engine/15_transition.md#11-레이아웃-wipebflyt-데이터).
[재구현 계산] 일정 dt1/60이면20f≈0.333333초·40f≈0.666667초. 카메라 완료는 current>to·Fiber 판정 순서 때문에 Δframe만으로 최종 tick을 보장하지 않는다. [GATE], [01 §6.5](../engine/01_core.md#65-대기-함수-판독-fun_710018ddb0-fun_710018de1c-fun_710018dbb0-fun_710018df14-fun_710018e070).

### 7.2 광장 카메라

[데이터] scroll1080f·비루프·EulerZXY/Perspective, 위치(−0.031747665,1.8872774,33.297558) 고정. raw near0.1/far100000/aspect1.78; rotX(+1c)·rotY(+20)·fovy(+0c)만 Cubic. 아래는 변환 JSON 샘플이며 원본 f32 마지막 비트와 동일하다고 주장하지 않는다. [CAMRAW], [scroll JSON](../../assets/plaza/world/anim/menu00_ev_intro_scroll_cam.fsnb.json), [07 §4.3](../engine/07_camera_lighting.md#43-animationpasscamera-0x20-b-판독-main-생성자-fun_71006c0e5c)·[§6.4](../engine/07_camera_lighting.md#64-커브-평가키-경계-fres-animcurve-판독-main-arm64).

| 도착f | pitch / yaw(rad) | fovy(rad) | Δf / 명목 초(재구현 계산) |
|---|---|---|---|
| [데이터] 100 | −0.06981256 / −1.5707898 | 0.47108996 | 100 / 1.666667 |
| [데이터] 160 | −0.06981256 / −2.3561988 | 0.47108996 | 60 / 1 |
| [데이터] 320 | −0.06981256 / −3.141597 | 0.47108996 | 60 / 1 |
| [데이터] 480 | −0.06981256 / −3.926995 | 0.47108996 | 60 / 1 |
| [데이터] 640 | −0.06981256 / −4.7123976 | 0.47108996 | 60 / 1 |
| [데이터] 840 | −0.19635016 / −6.6322546 | 0.34934464 | 100 / 1.666667 |
| [데이터] 980 | −0.06981214 / −7.0685883 | 0.4710963 | 40 / 0.666667 |

[데이터] deco600f: eye0=(16.680866,26,77.91267),300=(−15.238501,26,78.42547),600=(−36.487766,26,63.91442), pitch−0.5235988·fovy0.7853982. 대사 완료 후 Stop하며 600f 끝 대기는 없다. [deco JSON](../../assets/plaza/world/anim/menu00_deco_all_cam.fsnb.json), [M00] @`51d80/52dd0`.

[판독] Front eye/target: target=locater1+(0,1.5,2), eye=target+(−3.5358784e−7,3.9453404,8.089147). Fovy=MainMenuCameraFovy40°×0.017453292, near1/far2000. FSNB near/far/aspect는 pass 적용 flag를 따른다. FrontImpl @`0x7100003c00`; [M00], [MAP]; [07 §6.1](../engine/07_camera_lighting.md#61-적용기-fun_71006c1120-판독).

### 7.3 f32 평가 계약

[판독] key interval a≤frame<b, signed Int16 계수 수치 변환. f32는 각 연산 단정도, FMA는 곱/합 합쳐 한 번 반올림. **일반 double/Horner 재배열·scale0→1 금지.** main @`0x7100771dfc/771ee0/772878`; [07 §6.4](../engine/07_camera_lighting.md#64-커브-평가키-경계-fres-animcurve-판독-main-arm64).

```text
t = f32(f32(frame-a) * f32(1 / f32(b-a)))
h = FMA(k3,t,k2)
l = FMA(k1,t,k0)
v = FMA(f32(h*t),t,l)
result = FMA(v,scale,offset')
```

[데이터] scroll yaw100.1→159.9: k=[−1.5707898,−0.0078037134,−2.332783,1.5551885],scale1,offset0,Clamp. pitch740→799.2: k=[15609,−28,−32767,12927],scale4.053354e−6,offset−0.13308136. 전체 pitch9/yaw32/fovy14키는 [CAMRAW]. 설명 사이 이동을 끝점 선형 보간으로 대체하지 않는다.
[판독] yaw를 ±π로 감싸면 친구/퀘스트 이동 경로가 바뀐다. EulerZXY는 원본 행벡터 뷰·three YXZ로 적용. [07 §6.2](../engine/07_camera_lighting.md#62-뷰-행렬-판독-fun_71007758a4--fun_7100775b90-재구현-계산으로-threejs-동치-확인).

## 8. Cut18 캐릭터·카메라·시간

### 8.1 등장·모션·표정

[판독][데이터] Cut18은 카멕5행+PC20명×2=45행. SetupChara @`0x7100023120`: Locator HookModel·행별 SyncRandRangeF(0,Rand)→AddTimr. Update @`0x7100024190`: 미재생 행의 f32(Time+AddTimr)<elapsed→Played→Anim00 Play→01/02 Enqueue→LookAt. [OP], [OPCHAR], [09 §6.3](../engine/09_character.md#63-play-같은-모션-판정-판독-fun_7100022a80)·[§6.6](../engine/09_character.md#66-프레임-진행framemax큐-순서-판독)·[§6.8](../engine/09_character.md#68-시선-comheading-판독).

| 로컬초 / 명목f(재구현 계산) | 동작 |
|---|---|
| [데이터] 0 / 0 | KAMECK op_c18_1→fly_idle00, pos_npc051·시선 pos_npc051_look_at |
| [데이터] 3 / 180 | fly_talk00b |
| [데이터] 7.5 / 450 | fly_idle00 |
| [데이터] 8.2+[0,0.3] /492~510 | PC20 bd_turn_ready00→co_idle00, pos_pcNN·시선 pos_look_at |
| [데이터] 11 /660 | KAMECK fly_hand_up00a→fly_hand_up00b |
| [데이터] 13+[0,0.166] /780~789.96 | bd_start00a/b; PEACH만 co_guts_pose00a/b, KINOPICO만 co_joy00a/b |
| [데이터] 15.5 /930 | KAMECK op_c18_2→fly_idle00 |
| [판독] elapsed>=20 /약1200 | 제목 In·BGM_TITLE; [OPT] |

[데이터] PC20=MARIO/LUIGI/PEACH/DAISY/WARIO/WALUIGI/YOSHI/KINOPICO/KINOPIO/ROSETTA/DK/CATHERINE/KOOPA/KURIBO/HEYHO/NOKONOKO/CHOROPOO/KOOPA_JR/TERESA/GABON. 선택된 플레이어 목록과 별도 고정 등장 목록. [OPCHAR].

[판독] PC ComPC ctor @`0x710000c440`: Matter type3·Heading 추가·co_idle00. NPC ctor @`d6e0`: Heading·ID0x37은 fly_idle00. PlayAnimation @`cd20/ded0`은 none 무시·없으면 AddAnimation(1,0,0,0) 후 Play; 후속 큐·FTRG는 공용 캐릭터 계약을 따른다. 시선은 SetTargetLookAtPosition @`d4b0/e680`: 지정 본 FindBoneIndex→CalculateWorldTransform→Heading target이다. [OPF], [09 §6.8](../engine/09_character.md#68-시선-comheading-판독)·[§6.9](../engine/09_character.md#69-눈동자-uv마스크-판독--데이터).

[데이터] 아래는 `op_c18`의 PC local T·yaw와 실제 선택 클립 FSkb 길이다. root Identity·PC 본은 root 자식, pitch/roll0·scale1. ready는 모두 **80f/비루프**; a는 비루프, b는 루프. a/b 길이를 모두59/60으로 통일하면 대기 전환이 달라진다. [MOTION], [OPENV], [OPCHAR].

| PC | local T(x,y,z) / yaw rad | 13초 행의 a/b 길이(f) |
|---|---|---|
| [데이터] 01 | (1.0606519,0,-2.3867028) / -0.12092653 | bd_start00a/b: 59/60 |
| [데이터] 02 | (2.3813276,0,-3.8827455) / -0.20448932 | bd_start00a/b: 59/60 |
| [데이터] 03 | (4.1814404,0,-1.8548744) / -0.43382645 | co_guts_pose00a/b: 69/60 |
| [데이터] 04 | (0.07465084,0,-4.8967533) / 0 | bd_start00a/b: 59/60 |
| [데이터] 05 | (3.825817,0,1.7142471) / -0.58783585 | bd_start00a/b: 49/90 |
| [데이터] 06 | (-2.0237565,0,-5.9857173) / 0.12598193 | bd_start00a/b: 39/50 |
| [데이터] 07 | (2.5133798,0,-1.1417079) / -0.2743664 | bd_start00a/b: 59/60 |
| [데이터] 08 | (0.22117318,0,-0.5111438) / -0.026179941 | co_joy00a/b: 109/60 |
| [데이터] 09 | (1.5104276,0,0.4867491) / -0.19198623 | bd_start00a/b: 105/60 |
| [데이터] 11 | (5.497863,0,-0.93864065) / -0.5679685 | bd_start00a/b: 109/90 |
| [데이터] 12 | (4.295433,0,-4.5284734) / -0.33114436 | bd_start00a/b: 39/192 |
| [데이터] 13 | (2.0070014,0,-6.862475) / -0.1420446 | bd_start00a/b: 55/160 |
| [데이터] 50 | (-4.5152607,0,-3.8805134) / 0.37362513 | bd_start00a/b: 105/80 |
| [데이터] 51 | (-3.2311068,0,-0.115876034) / 0.39452034 | bd_start00a/b: 89/120 |
| [데이터] 52 | (-1.9407818,0,0.44329348) / 0.26973376 | bd_start00a/b: 59/60 |
| [데이터] 53 | (-5.120193,0,-1.4669627) / 0.5118543 | bd_start00a/b: 59/50 |
| [데이터] 54 | (-1.0420493,0,-1.9869776) / 0.11211263 | bd_start00a/b: 91/100 |
| [데이터] 56 | (-3.8615785,0,1.3785045) / 0.5504248 | bd_start00a/b: 69/60 |
| [데이터] 58 | (-2.7136402,0,-3.1050305) / 0.25646126 | bd_start00a/b: 45/100 |
| [데이터] 61 | (-5.417109,0,-0.09788289) / 0.6203693 | bd_start00a/b: 59/60 |

[데이터] 카멕은 root→pos_npc051_move→pos_npc051→pos_npc051_look_at 계층이다. `op_c18.fskb`1200f·비루프: move T base=(2.7470815,5.609079,12.916114), R=(−1.6165448,1.1801069,−1.613102); XYZ회전곡선19/18/19·이동42/29/39개. npc051 local T0·R=(0.18434136,1.5707964,0), 회전29/26/27·Y이동59개. look_at local T=(0,1,3.5), 회전12/10/11·이동95/120/117개다. PC용 pos_look_at은 별도 root 자식·T base=(2.7351565,6.09305,12.392228), XYZ이동72/70/82개. FMDb 정적 본 위치를 애니 재생 후 world 위치로 쓰지 않는다. ComPos @`eeb0/f2e0`, Add/GetPos @`e990/ed80`; [OPF], [op 배치/환경/VAT 원시 애니](../../../analysis/plaza_intro_op_motion_raw.json), [07 §6.4](../engine/07_camera_lighting.md#64-커브-평가키-경계-fres-animcurve-판독-main-arm64).

[데이터][판독] 얼굴은 몸 FSkb의 jaw/eyelid 등 본 곡선과 FMAb의 실제 눈 UV/utility SRT를 함께 적용한다. 예: PC01 ready80f 얼굴 곡선 본6개, start-a59f5개/start-b60f0개; PEACH guts-a69f3개, KINOPICO joy-a109f3개. NPC051 op_c18_1=150f 비루프, op_c18_2=140f 비루프(후자 얼굴 본1개). 파일은 `chara~pcMot_bd.nx.bea/chara/pc/pcNN_*/motion`, co는 pcMot_co 패키지, NPC는 npc051 패키지다. 애니 재료 이름→재질 바인딩·채널 적용은 [09 §4.2](../engine/09_character.md#42-캐릭터-에셋-구조-데이터)·[§6.9](../engine/09_character.md#69-눈동자-uv마스크-판독--데이터)·[캐릭터 선택 §12.11](charselect.md#1211-몸-재질-셰이더-그래프-판독--캐서린-배까지-전부-분홍22명-_c1_c2-규칙-2026-10-07-코드-수정-전에-기록) 재사용. [MOTION]. 초기 FSHb 덤프의 비정상 FrameCount(65536 등)는 파서 필드 순서 문제로 확인해 폐기했다. 아래 원본 헤더 대조 자료를 우선한다. 임의 smile/눈UV/스케일 보정 없음.

[데이터] FSHb112개를 원본 FSHA 헤더와 직접 대조했다: +0x40 FrameCount,+44 BakedSize,+48 userData수,+4a shape수,+4c keyShape수,+4e curve수. 이름은 u16 길이 접두사·NUL을 검증했으며 shape/curve 합계 검사112개 모두 일치·곡선220개다. 기존 ShapeAnimParser의 version9 필드 순서는 이 파일과 달라 웹/도구 수정 없이 보완 근거만 보관했다. [shape 원시](../../../analysis/plaza_intro_shape_raw.json), [기존 parser](../../../tools/oss/BfresLibrary/BfresLibrary/Switch/ShapeAnim/ShapeAnimParser.cs).

[데이터] PC01 ready80f는 mario_face__body_m의 close/half shape4곡선, start-a59f는 tight/close/half6곡선이며 mario_hair__body_m은 shp_hair_in_shp base1이다. start-b60f는 곡선0이어도 base값 적용이 필요하다. PEACH guts-a69f는 face alfa/body 각각 open/close4곡선(합8); KINOPICO joy-a109f는 좌우 눈 shape 각6키·곡선0/base0. **본 곡선·FMAb 눈UV·FSHb 눈 shape를 한 종류로 대체하지 않는다.** shape curve/scale/offset/key계수는 원시 자료에 있으며 f32 평가는 §7.3 재사용, mesh KeyShape 바인딩 계약은 [03 §4.3](../engine/03_graphics.md#43-셰이프버텍스)·[09 §4.2](../engine/09_character.md#42-캐릭터-에셋-구조-데이터) 재사용한다. [shape 원시](../../../analysis/plaza_intro_shape_raw.json).

### 8.2 Cut18 카메라·두 시간축

[데이터] op_cam_c18은1200f·Aim/Perspective·비루프. Base eye=(0,5.5,16),aim=(0,2.75,−1.7),fovy0.5235988,near1/far750/aspect1.78. posY/Z·aimY만 Cubic/Int16. **Aim의 rotY는 yaw가 아니다.** Y/aimY key0/210/1010/1040/1170/1200, Z0/210/1010. 초반 전진/하강→210..1010정지→끝 시선 상승. 스킵은 FrameMax 즉시. [CAMRAW], [OP] @`23b60`, [07 §6.2](../engine/07_camera_lighting.md#62-뷰-행렬-판독-fun_71007758a4--fun_7100775b90-재구현-계산으로-threejs-동치-확인).

[판독] UpdateCut18 로컬+0xb8=f32(dt+elapsed); 자막 global+0xb4는 첫 Cut18 갱신에서 dt를 더하지 않고 이후 더한다. 캐릭터/Title은 local, 자막은 Movie 끝 위치에 이어진 global. 자막199.2를 영상 길이로 역산해 확정하지 않는다. [OP] @`24190`, [OPMSG].



### 8.3 세레모니 이후 타이틀 기구

[판독][데이터] Cut18 종료 뒤 PC CharacterManager를 파괴하고 Balloon00/01을 시작한다. 이들은 ESET의 b/g/r/y 소형 풍선과 별도 **NPC 탑승 타이틀 기구**다. Balloon00 Start @`0x7100003a90`는 List01 시작 index를 SyncRandRange로 뽑고 이전 InTime에서 시간을 시작한다. UpdateCreate @`3d10`: elapsed>=InTime→Balloon entity·ComBalloon→ModelColor/CharaType/Hook·3모션/시간→Play→camera position LookAt; 끝index에서 index/time0으로 순환. UpdateDelete @`3b50`는 IsEndAnimation이면 entity Destroy·목록 제거. [OP], [OPF], [TITLE].

[데이터] List01 24행·InTime3..60초: KINOPIO/HEYHO BalloonR/L, PATAPATA Normal/Flower/Bubble. 예: 첫 행3초·KINOPIO·color1·title_pos_balloon_npc00·op_balllon00·idle00→bye00→idle00(0/4.5/7.4초). 오른쪽 idle00/bye00, 왼쪽 idle01/bye01, PATAPATA Normal co_fly00/co_bye01, Flower bd_flower00, Bubble bd_bubble00; none는 미재생이다. List02 31행·PATATENTEN co_fly00·InTime12..100초·title_pos_npc057_0..5. 철자 **op_balllon**은 데이터 그대로다. [TITLE].

[판독] Balloon01 Start @`51d0`는 List02용 풀을 준비하고 Update @`5790`은 dt 누적·InTime 게이트 뒤 pool index를 선택해 Setup·Play한다. ComBalloon ctor @`5a14`는 모델명이 none인지 확인한 뒤 `flow/op/model/` 경로를 조립한다. 타이틀 종료까지 두 관리자가 갱신되고 Sequence 해제 시 소유 entity도 정리된다. [OPF], [OP] @`22ca0/2488c`, [01 §5.4](../engine/01_core.md#54-파이버-수명-판독).

## 9. BGM·SE·VO·FTRG·진동

| 계기 | 호출·인자·시간 |
|---|---|
| [판독][데이터] Movie | SoundManager Update @`0x7100024eb0/24f10`: Params+8=0일 때 네 목록, 미재생·row.Time<movieSeconds면1회. Play=fade0→volume Parameter1·pan Parameter2, Stop=동일 라벨 핸들 Stop_Time(Parameter1), Preset=LoadSettingPreset. NONE도 Played; [OP], [BGM 목록](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opSoundList_bgm.json), [SE](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opSoundList_se.json), [VO](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opSoundList_vo.json), [VB](../../../extracted/bea/flow~op.nx.bea/flow/op/data/opSoundList_vb.json) |
| [데이터] Movie BGM | Time0 SM_BGM_OP·volume1/pan0. MP4는 avc1 영상 트랙만 있고 오디오 트랙 없음; [MOVIE], 위 BGM 목록 |
| [데이터] Movie 진동 | 49.85 bv_vib_op_bd04_car,87.21 op_rc_beat,103.56 op_mf01_press,108.1 op_mgm_boat,170.48 op_magic_hit,172.56 bv_vib_bd06_boss_land,191.38 op_shout. 축약 항목 접두사 bv_vib_. 유효 Input0..3에 SetPlayerCom/Play; [OP] @`24f10`, VB 목록 |
| [판독] Cut18 | LoadSettingPreset("op_cut18") @`0x71000256d8`, FX_C18_CONFETTI00. [OP], [FTRG](../../../extracted/bea/flow~op.nx.bea/flow/op/ftrg/fx_op_c18.ftrg) |
| [판독] Movie skip | StopGroup_Time(0.3초) 그룹0x22/0x23/1/0x25/0x29→같은 그룹 EntryCancel1. SoundManager::Skip @`0x71000255e0`; [OP] |
| [판독] 제목 | elapsed>=20 SM_BGM_TITLE; 시작 확정 SQ_SE_SYS_START_TITLE·bv_vib_sys_start_title; [OPT], [OP] @`27850` |
| [판독] Front/Entrance | TITLE 유지/duck·Front destructor StopTitle preset2=0.7초. TITLE 없으면 MENU. PlayMenu는 유효 재생 핸들을 중복하지 않음; [M00] @`54440/50e38/52dd0`, [04 §12.14](../engine/04_sound.md#1214-화면별-원본-bgm-판독-2026-10-08) |
| [판독] 첫 안내 A | SQ_SE_SYS_DECI·bv_vib_sys_deci, 첫 PC가 영역0일 때; [M00] @`52aa4/52ac4` |
| [판독] 대사 voice | 메시지 In 완료→state1 초기화에서 요청. Talk 시작과 동일하지 않음. 태그·FTRG·PlayOffsetSec를 합쳐 해석; [가이드 §5.1](plaza_guide.md#51-a-입력부터-보이스-요청출력까지), [05 §7.5](../engine/05_ui_input.md#75-comfxtriggerplay참조애니-이벤트-판독) |
| [판독] 기구 인계 | SM_JIN_MENU_TO_MAP·SQ_SE_MENU00_TRANSITION_WHO, camera260/400 경계는 기판독 재사용. CallSceneImpl StopBgm preset0=0.1초. Wipe 속도는 §7.1; [M00] @`47870/47628`, [광장 §6.10](plaza_3d.md#610-c-갈래-판독-결과--npc따라가기상호작용기구-출발-plaza-c-2026-10-08) |

[데이터] TITLE archive volume40/127·loop501760..2558901, MENU28/127·loop114688..2561414,48kHz. 곡 길이·FSEQ·MENU_RHYTHM 3D 층은 [04 §12.14.1](../engine/04_sound.md#12141-곡-데이터)·[§12.14.3](../engine/04_sound.md#12143-웹-연결-설계) 재사용.

[판독] UpdateCut18 자체에 SoundManager Update 호출은 없다. Movie SE 마지막 관련 Stop195.66·VO 마지막191.3이므로 Cut18 자막을 이유로 SoundList를 계속 갱신하지 않는다. [OP] @`24190`, [OPMSG], 위 SoundList.

[데이터] `bq_op.mp4`=244,792,303B·avc1 vide 트랙만 존재·timescale60000/duration11740000=195.6666667초. 패키지 movie 엔트리는 실제 MP4를 가리키는 짧은 XML이다. 별도 FSAR(`_Resident/AddonAudioProject.fspj`)의 **SM_BGM_OP** sound0/file294: `stream/SM_BGM_OP_JMP.dspadpcm.bfstm`, 2ch·48kHz·10239104 samples·비루프·archive volume34/priority118/group57345/pitch1. 길이213.3146667초는 샘플 수 환산이다. DH_JMP sound1은 같은 file294·volume31. [MOVIE], [FSAR](../../../extracted/bea/_ResidentAudio.nx.bea/_Resident/AddonAudioProject.fspj), [04 §5](../engine/04_sound.md#5-상태-전이와-수명)·[§12.14](../engine/04_sound.md#1214-화면별-원본-bgm-판독-2026-10-08).

[판독][데이터] UiManager::UpdateMessage는 global 시간을 쓴다. `menuOp_op18_subtitle25`199.2..204.1,26=207.2..209.2. **[재구현 계산]** Movie 메타의 끝을 기준으로 빼면 local 약3.533..8.433/11.533..13.533초이나 f32 movie position·첫 Cut18 tick 보정이 있으므로 원본 tick 확정값은 아니다. op_cut18 BSPP 레코드86의 T-string1은 **SQ_SE_OP_FOUNTAIN_1_CUT18**. LoadSettingPreset @`256d8`과 분수 분위기 SE를 연결한다. [OP], [OPMSG], [프리셋](../../../extracted/bea/audio.nx.bea/audio/settingpreset/sound_settingpreset.bspp), [04 §4](../engine/04_sound.md#4-구조체포맷).

[판독][데이터] Character FTRG는 `chara/pc/ftrgBase/ftrg/{se,vo,vb,st,fx,rc}_pc_base` 참조와 개별 PC override를 해석한다. **fake 계열은 이 장면 ctor의 선택 경로가 아니므로 합치지 않는다.** 아래 f는 각 모션의 로컬 프레임이며 delay/volume/hook/condition까지 적용한다. [FTRGRAW], [OPF] @`c440/d6e0`, [05 §7.3](../engine/05_ui_input.md#73-트리거0x9101-데이터)·[§7.5](../engine/05_ui_input.md#75-comfxtriggerplay참조애니-이벤트-판독), [09 §6.8](../engine/09_character.md#68-시선-comheading-판독).

| 선택 클립·트랙 | 실제 이벤트·조건 |
|---|---|
| [데이터] PC base ready SE/VO | bd_turn_ready00: SE jump5/land24/turn-ready38; VO ACTION_MID5/READY27. base 라벨의 PC01 부분을 모든 PC에 고정하지 않고 개별 참조/override 적용 |
| [데이터] PC base start-a | SE run_sml11(volume0.5),land26; VO SYMBOL0·helper MUTE2. `NDcha_pos` hook·delay0. ready/start 모두 개별 SE 타이밍 override가 존재 |
| [데이터] PEACH guts-a | VO12=SQ_VOI_PC03_JOY_MID; 개별 SE walk23(volume0.5). 실제13초 행은 bd_start가 아님 |
| [데이터] KINOPICO joy-a | VO5=SQ_VOI_PC08_JOY_MID; SE jump11/land33·volume1 |
| [데이터][판독] PC VB | start-a0의 announce/symbol은 enum 문자열 `bv_vib_bd00_turn_start_switch`의 **"1"/"2" 동등 비교**. 새 owner의 기본값은 빈 문자열이라 두 행 모두 불일치. PEACH guts12·KINOPICO joy11은 별도 키/조건을 적용; [COND] |
| [데이터] NPC051 op_c18_1 | f60 SQ_SE_NPC051_FLY,f80 FLY_LOOP(flags256),f112 LOOP_STP(NONE)와 SQ_SE_MFA_VOLUME0_NPC051_OP_C18_1_STP |
| [데이터] NPC051 op_c18_2 | f60 SQ_SE_NPC051_FLY_START,f80 SQ_SE_NPC051_FLY_LOOP(flags256). 선택된 op/fly 클립의 직접 VO 키는 해당 파일에 없음 |
| [데이터] ST | base start-a f0 ON→Group_29 value0/fade.1/delay0, f1 OFF→value1/fade.7/**PlayOffsetSec1.18**. 두 행 모두 `st_pc_bdturn_is_first == false`·flags256. **769=0x301은 bool형3/동등연산1이고 조건값이 아니다.** 새 owner의 기본 bool도 false. SoundSystemEvent=DuckingGroup; [ST 원시](../../../analysis/plaza_intro_st_raw.json) |

[판독][데이터] 조건을 공용 미확정으로 남기지 않고 기존 [ui_ftrg_res.c](../../../analysis/decomp/ui_ftrg_res.c)와 typed payload를 연결했다. `0x7101113590`은 owner 문맥에 참조/개별 자료 최대8개를 등록하면서 `11149e0`(enum)→`1114b70`(변수) 순으로 초기화한다. enum은 runtime형2 string·초기값 `""`이며 같은 이름/형이 이미 있으면 변수 선언이 덮지 않는다. 선언형4→runtime형2 변환 표는 `0x710165b558`; bool형3 분기는 기존 C에서 누락된 jump target `1114d40`이다. `1114d70→110dc80`, `1114d78 w1=0→110dcf0`으로 **false·valid**를 만든다. C 누락 블록만 [정적 ARM](../../../analysis/plaza_intro_ftrg_init_raw_arm.txt)으로 대조했으며 새 C 추출은 없다. [05 §7.5](../engine/05_ui_input.md#75-comfxtriggerplay참조애니-이벤트-판독)·[§7.9](../engine/05_ui_input.md#79-남은-근거사용자-확인-필요), [COND].

| 조건 자료·소비자 | Cut18에 적용할 계약 |
|---|---|
| [데이터] `vb_pc_base.ftrg` enum/변수 | enum 이름+choices "1","2"; 변수 @42408 kind4/slot0208. start-a의 조건 @26af0/26c94는 0x401, 문자열 @26b24="1"/@26cc8="2". 선택되면 각각 `bv_vib_bd_turn_start_sys_announce`/`bv_vib_symbol_pc01_mario`,weight50,flags256,offset0; [COND], [FTRGRAW] |
| [데이터] `st_pc_base.ftrg` 변수/조건 | 선언 @100 kind3/slot0204·byte @12c=false. 조건 @58c/870의 bool @5b8/89c도 false; 일반 string 파서의 빈 문자열을 bool 값으로 해석하지 않음; [COND] |
| [판독] `0x710110e9d0` evaluator | 이름·형·valid(+10) 확인, 없으면 false. type3은 +58 bool 대조, type4는 runtime형2 문자열 대조; operator1=동등. 따라서 **새 owner 초기 문맥에서 ST 두 행은 조건 통과, VB 위 두 행은 조건 불일치**. 행의 실제 발생은 선택 모션·frame·PlayOffsetSec·개별 override가 결정; [ui_ftrg_res.c](../../../analysis/decomp/ui_ftrg_res.c) |
| [판독][데이터] 장면 외 setter 경계 | 해당 이름의 직접 문자열 참조는 bd01 `OverlayMgr::CreateOverlay @0x710008e1a4`(VB @8e944/ST @8e99c), `flowPlayerBegin::Update @0x71002da980`(VB @2dac0c)에 있음. 이 board 흐름의 값 설정을 op Cut18에 이식하지 않음; [정적 참조](../../../analysis/plaza_intro_bd01_ftrg_string_refs.json), [bd01 함수 목록](../../../analysis/functions/bd01.nro.tsv) |

[판독] Cut18 PC는 `op::ComPC ctor @c440`의 새 ComMatter/owner 생성 경로를 사용한다. 위 결과는 그 초기 문맥의 계약이며, 별도 owner 재사용·후행 SetEnum/SetBool을 추가하는 웹 구현에는 그 값을 명시해야 한다. 직접 이름 검색 부재만으로 모든 동적 문자열 writer가 없다고 증명하지 않는다. base 두 조건의 판독을 20PC/모든 VB 그래프의 무조건 출력으로 확대하지 않는다. [OPF], [COND], [09 §6.6](../engine/09_character.md#66-프레임-진행framemax큐-순서-판독).

[미확정] 음원 내부 음성의 청각적 내용·mix 체감은 재생하지 않아 판정하지 않는다. 직접 NPC VO 키가 없다는 사실로 전체 음원이 무음/무성이라고 결론내리지 않는다. 이 제한은 FTRG 조건식 미판독과 별개다. [FTRGRAW], [MOVIE].

## 10. 텍스처·재질·셰이더·효과·포스트

### 10.1 menu00 소개에서 재사용

[판독][데이터] 소개 전경 전용 재질을 생성하지 않고 기존 MapStructure의 광장·상점·기구·바다·분수·장식·NPC 경로를 쓴다. [M00] @`51d80/52dd0`, [manifest](../../assets/plaza/world/manifest.json); [광장 §6.7](plaza_3d.md#67-에셋환경포스트맵-애니-plaza_world_assetspy--webassetsplazaworld).

| 연결 | 확정값·재사용·경계 |
|---|---|
| [판독] World SG | [plaza_graph_1](../../../analysis/mat/plaza_graph_1.json)/[graph_2](../../../analysis/mat/plaza_graph_2.json):70고유 프로그램. 슬롯·wind/ocean·SASS는 [광장 §6.8](plaza_3d.md#68-셰이더-그래프-재질-판독-plaza-a-sg1sg2-보조-판독-판독-sass) 재사용 |
| [판독] NPC SG | [plaza_npc_graph](../../../analysis/mat/plaza_npc_graph.json):21프로그램/22재질. npc022 몸 array6색·MC color1; eyes/mouth SRT는 실제 fmab/Heading 공급. [광장 §6.11](plaza_3d.md#611-npc-셰이더-그래프-plaza-c-sg-판독-2026-10-08-판독-sass) |
| [데이터] 광장 조명 | overwrite(−50,−40,0)°·color(1.3338,1.2702,1.0658),shadow3/near0.1/far100/offset1000. 웹 ×π·단일 shadow는 기판독 근사; [광장 §6.7](plaza_3d.md#67-에셋환경포스트맵-애니-plaza_world_assetspy--webassetsplazaworld) |
| [데이터] IBL/fog | common/char menu00_plaza_irr/rad; fog sampler=menu01_ibl_irr·200..800·0.8; windnoise00. 파일명만 보고 menu01_fog를 쓰지 않음; [광장 §6.7](plaza_3d.md#67-에셋환경포스트맵-애니-plaza_world_assetspy--webassetsplazaworld) |
| [판독][데이터] menu00 post | [plaza_post](../../../analysis/mat/plaza_post.json),amalgam55: FXAA→bloom→exposure0.99+offset−0.01→tone3→vignette→gamma0.4545898→LUT menu00_lut_00(16³). bloom0.7/3/2/5,DOF off; [광장 §6.13](plaza_3d.md#613-포스트-판독화면-바램-수정-plaza-a-post-판독-2026-10-08-판독-sass) |

[판독] 환경의 일반 생산자 부재는 기존 후속으로 해소됐다. `00905a0` 이름/offset 캐시→`0090790/0090c90` ComEnvironment setter→`0073e8c` Layer 업로드, raw 평행광 +Z, P7 애니 공급은 [14 §29](../engine/14_shader_graphs.md#29-worldlayer-방향g27-fog-cpu-공급-후속)·[§30](../engine/14_shader_graphs.md#30-fsdeg-환경-samplerarray-후속-통합)·[§32](../engine/14_shader_graphs.md#32-vs-cpu-생산자-후속--modelmodeopacity누락-color0)을 재사용한다. FSC capture/stencil은 [§31](../engine/14_shader_graphs.md#31-fsc-capturestencil-후속과-직접-layer-writer-연결)의 별도 RT 경계다. op의 옵션에서 쓰지 않는 capture·array 그래프까지 이 장면의 신규 공백으로 묶지 않는다. 남은 first_down 필터는 §10.3·§13.2로 좁혔다.

### 10.2 op Cut18 고유 연결

[데이터] Map14=Env/DirLight/PointLight00/Skybox/PostEffect/AttachLocater/AttachLocaterQuest/Ocean/DistantIslands/Stage/Cloud/bd02_Obj/bd03_Obj/bd06_Obj. Ocean=menu00_ocean00_op, 일반 menu00 Ocean과 이름이 다름. 이 목록에 CentralPlaza를 임의 추가하지 않는다. [OPMAP].

[데이터] op에 포함된 sky·collection pointlight·stage00·ocean00_op·cloud00·island_small00 여섯 FMDb는 menu00 패키지 동일 경로와 SHA256 일치. 재질 바이트 재사용 가능; 고유 env/light/post까지 확대 금지. 원본 flow~op.nx.bea/menu/menu00와 menu~menu00.nx.bea/menu/menu00; [OPMAP], [14 §2.2](../engine/14_shader_graphs.md#22-같은-sass재사용-조건).

| 리소스 | 값·연결 |
|---|---|
| [데이터] op_env_c18 | common/char plaza irr/rad·fog=menu01_ibl_irr,200..800/0.8. wind0;utility0=(6,0.7,2,0.125),1=(3.5,0.8,−66,0.01). fmab900f·루프·Map AnimFileName 지정, 실제 Play; [OPENV], [op 배치/환경/VAT 원시 애니](../../../analysis/plaza_intro_op_motion_raw.json), [OPF] @`16eb0` |
| [데이터] op_dir_light_c18 | overwrite1·pos(0,5,33)·rot(−50,−12,0)°·color(1.3,1.28,1.08);shadow4/near3/far35/offset100/lambda0.5/fade0.05/normalBias0.5×4. **DirLight AnimFileName은 빈 문자열**이라 fmab 파일 존재만으로 재생되지 않음. authored 본 회전과 구분; [OPENV], [OPMAP], [OPF] @`16eb0`, [07 §6.6](../engine/07_camera_lighting.md#66-평행광-transform렌더-연결-판독데이터) |
| [데이터] op_post_c18 | **tone1·LUT off·DOF on**. exposure0.98/offset−0.01/outputScale1.1,bloom0.7/2/2/5,FXAA0.1666/0.08333/0.75;DOF focal50/region12/farTransition30/farBokeh0.5/nearBokeh0; [OPENV] |
| [데이터] op_c18 | 배치 FMDb/FSkb·카멕 이동/시선 본·PC20 본; [OPENV], [OPCHAR] |
| [판독][데이터] confetti FTRG | FX_C18_CONFETTI00→op_c18_confetti00.eset,skip→op_c18_confetti00_skip.eset. 조건·delay 없음,Stop키도 동일 세트 참조; [FTRG](../../../extracted/bea/flow~op.nx.bea/flow/op/ftrg/fx_op_c18.ftrg), [05 §7.3](../engine/05_ui_input.md#73-트리거0x9101-데이터)·[§7.5](../engine/05_ui_input.md#75-comfxtriggerplay참조애니-이벤트-판독) |
| [데이터] VFX 실체 | [_Vfx/flow/op/ConvertList.xml](../../../extracted/bea/flow~op.nx.bea/_Vfx/flow/op/ConvertList.xml)=VFXB240384B,.bnsh75248B,.compute70272B. 풍선 effect/model b/g/r/y와 alb/nml/rgh/pos 텍스처; [08 §2](../engine/08_effects.md#2-분석-대상-원본버전자료-위치) |

### 10.3 환경·포스트 시간 변화와 적용

[판독][데이터] MapManager00::Create @`0x7100016eb0`은 AnimFileName.length!=0일 때 model virtual+0x180로 Add/LoadAnimation 후 +0x1a8 Play한다. op_env_c18 FMAb900f 루프: utility1.x f0=5→450=10→900=5(계수 [5,0,15,−10]/[10,0,−15,10]); y f0=2→900=0([2,−3,3,−2]); w f0=.0025,150=.007,300=.0025,450=.01,600=.0025,750=.007,900=.0025; z=−66 유지. FMDb 초기(3.5,.8,−66,.01)를 재생 전체값으로 고정하지 않는다. [OPF], [op 배치/환경/VAT 원시 애니](../../../analysis/plaza_intro_op_motion_raw.json), [14 §29](../engine/14_shader_graphs.md#29-worldlayer-방향g27-fog-cpu-공급-후속)·[§30](../engine/14_shader_graphs.md#30-fsdeg-환경-samplerarray-후속-통합).

[판독][데이터] `op_env_c18.fmdb` FMAT @208, sampler array @610/count6/stride20: `_a0,_a1,_a2,_a5,_a6,_a7` 모두 **ClampUVW(2), filter flags0x2a=min/mag Bilinear·mip Linear, LOD0..13/bias0**다. 논리 alias utility2d→_a5, common/char diffuse→_a7, specular→_a6, mipfog→_a1. 원본 textureRefs 순서는 menu01_rad/irr/fog,windnoise00,plaza_rad/irr이므로 fog 입력은 **menu01_ibl_irr**다. [ENVHDR], [OPENV], [광장 §6.7](plaza_3d.md#67-에셋환경포스트맵-애니-plaza_world_assetspy--webassetsplazaworld), [03 §4.4.2](../engine/03_graphics.md#442-재질-구성-요소).

[판독] 기존 `00905a0`는 logical sampler 이름을 ShaderAssign `0088cf0`로 물리 alias에 대응시켜 FMAT+48 dictionary index를 캐시한다. `0090c90→06b2458`은 **materialInstance+f8→+58 textureHandle[index]**와 **materialInstance+c0→sampler[index]+40**을 `08645f0`으로 결합하고 `0074774(slot0..10)`→ComEnvironment+190→Layer로 넘긴다. fog는 slot8→Layer80이다. 단순 파일명/큐브 평균으로 원본 TEX를 대체하지 않는다. [환경 C](../../../analysis/decomp/shader_fs_deg_env_sampler.c), [reader C](../../../ghidra_work/plazaA/out_post_com.c), [14 §29.1](../engine/14_shader_graphs.md#291-환경-재질컴포넌트layer)·[§30.1](../engine/14_shader_graphs.md#30-fsdeg-환경-samplerarray-후속-통합).

| 원본 BNTX 헤더 | view·mip·format·component |
|---|---|
| [데이터] menu00_plaza_irr / menu01_ibl_irr | 큐브6면·32²·1mip·BC6H_UFLOAT·RGB1 |
| [데이터] menu00_plaza_rad / menu01_ibl_rad | 큐브6면·128²·8mip·BC6H_UFLOAT·RGB1 |
| [데이터] menu01_fog | 큐브6면·128²·8mip·BC7_UNORM·RGBA. 패키지 존재와 이 fog alias의 선택은 별개 |
| [데이터] windnoise00 | 2D·256²·9mip·BC4_UNORM·RRR1 |

[데이터] 위 헤더의 정확한 자료는 [ENVHDR], 원본 `flow~op.nx.bea/flow/op/env/textures/*.bntx`다. decode/이미지 추출/화면 검사는 하지 않았다. 원본 cube/mip/filter의 웹 공급은 향후 구현이며, 이미 읽은 descriptor를 원본 미확정으로 다시 남기지 않는다. [14 §30.2](../engine/14_shader_graphs.md#302-g27-fog-cube에-담당-자료-재사용).

[데이터] op_dir_light_c18 FMAb1200f 비루프에는1100→1200 near3→10,far35→50 곡선이 있다. **현재 Map의 빈 AnimFileName 때문에 이 곡선을 연출에 적용할 근거는 없다.** 데이터 존재와 원본 호출을 구분해 near3/far35를 사용한다. [OPMAP], [op 배치/환경/VAT 원시 애니](../../../analysis/plaza_intro_op_motion_raw.json), [OPF] @`16eb0`.

[판독] DOF는 `nearInvisible=1/depthMask=0`이다. main getter @`0x71000777b4`는 ComPost+0x64를 읽고 기존 `out_post_render.c @acf00`은 참이면 기본 shader index17(first_far)·31(resolve_far)을 선택한다. 레이어 설정8이 참이면 첫 패스만19(first_far_debug)로 바뀌는 공용 분기도 있다. op에서 이 설정을 켜는 장면 고유 호출은 확인되지 않았다. depthMask는 첫 패스 플래그이며 꺼짐. 원래 nearBokeh0이라고만 추측한 분기를 실제 선택과 대조했다. [POOL], [포스트 C](../../../ghidra_work/plazaA/out_post_render.c), [포스트 메타](../../../analysis/mat/plaza_post.json), [07 §7.5](../engine/07_camera_lighting.md#75-포스트-mg1801_postfmdb--mg1801_post_result00fmdb-데이터).

```text
D(z) = abs(near*far / (z*(far-near)-far))
CoCfar = sat((D-50-12/2)/30)
resolve weight = CoCfar * 0.5
```

[재구현 계산] Cut18 D=56/71/86에서 CoCfar=0/.5/1, resolve weight=0/.25/.5. 초점은 시선축 거리이며 Camera의 Aim distance를 자동 사용하지 않는다. 기존 DOF·bloom·amalgam SASS를 재사용한다: **DOF→bloom first_down/down/up/tent→amalgam7→copy**, amalgam 안에서 HDR scene FXAA→bloom 가산→노출 `c*.98−.01`→tone1 유리식의 max(0)·**outputScale1.1 곱**→vignette(.1,aspect.25)→gamma0.4545898. LUT·color grading·motion blur·graph-last 꺼짐. tone1을 ACES/Neutral로 바꾸지 않는다. variant=`FXAA1+BLOOM2+(tone1<<2)=7`; [OPENV], [07 §7.5](../engine/07_camera_lighting.md#75-포스트-mg1801_postfmdb--mg1801_post_result00fmdb-데이터), [광장 §6.13](plaza_3d.md#613-포스트-판독화면-바램-수정-plaza-a-post-판독-2026-10-08-판독-sass).

[판독] bloom `first_down`은 기존 `0x71000acf00`의 shader index11 분기다. pass record base=&uStack_208에서 **+d8=uStack_130=2**를 지정하고 제출 시 `00bc300(cache,record+d8)`로 가져온 sampler를 color texture(+b0)와 `08645f0`으로 결합한다. color의 두 번째 binding은 ID6, depth는 ID8이다. `00bc300`의 getter는 cache+620+16*ID→object+40; **필터 정체까지 확정한 것은 아니다.** 후보 `00bbe60`가 cache+620부터 slot을 만들고 `087c07c→08839b4→084dc14`를 호출하는 것만 정적 ARM으로 식별했다. 이 생성자의 기존 C가 없어 ID2의 descriptor 분기는 추가 추출 보류 대상이다. [포스트 C](../../../ghidra_work/plazaA/out_post_render.c), [sampler C](../../../ghidra_work/plazaA/out_post_sampler.c), [후보 ARM](../../../analysis/plaza_intro_post_sampler_candidate_arm.txt), [07 §7.5](../engine/07_camera_lighting.md#75-포스트-mg1801_postfmdb--mg1801_post_result00fmdb-데이터).

### 10.4 normal/skip ESET·텍스처·계산기

[데이터] normal17이미터와 skip11이미터는 구조가 다르다. calcType0=CPU,2=GPU+SO. 시간/수명은 효과 프레임 단위다. 같은 이름의 이미터라도 원본 calcType·CADP·시작값을 보존한다. [VFXRAW], [08 §4](../engine/08_effects.md#4-구조체필드상수열거형)·[§6.3](../engine/08_effects.md#63-입자-프로그램별-운동시간키-판독).

| 세트·그룹 | 시작·지속·간격·수명·배치 |
|---|---|
| [데이터] normal balloon b/g/r/y 4 | GPU2, 시작950/1025/1100/1175f·duration1·rate1·interval299·life3000, emitter Y−10/Z−12/−14/−16/−18·volume radius(30,.1,20),속도Y.035·gravity0/air1·billboard3/rot4·scale.0087·scaleRandom25 |
| [데이터] normal add balloon4 | GPU2·같은 시작·interval599·life1000·radius(17,.1,17.5) |
| [데이터] normal 색종이 top/bottom6 | CPU0·start0/timing60/duration900·oneTime1·rate1/interval15·life1800 |
| [데이터] normal 색종이 _2 3 | CPU0·start600/duration10/interval7·life1800 |
| [데이터] skip balloon8 | CPU0·start0/75/150/**210**·Y0, Z와299/599간격 유지. CADP548B·actionIndex3·색별 풍선 FMDb/FMAb 경로 |
| [데이터] skip 색종이3 | GPU2·start0/timing60/duration10/interval7·life1800 |

[데이터][판독] GTNT ID ff95ae9f=silver,df3abeae=gold,786e9fa5=color: `sample_confetti_sphere_{silver,gold,color}00`. normal 색종이/skip 색종이의 FS @BNSH0x10000은 기존 **mg1801 variant12 FS0x44600과 SHA256 일치**하여 [08 §6.5](../engine/08_effects.md#65-추가-billboard-대표정렬draw-state)의 texture/color/alpha 판독을 재사용했다. normal top VS0xed00/bottom VS0x10300은 emitter 변형이며 임의 billboard로 통일하지 않는다. 원본 bindless sampler와 GTNT ID 연결을 따른다. [VFXRAW], [셰이더 인덱스](../../../analysis/plaza_intro_op_shader_index.json), [VS2](../../../analysis/plaza_intro_op_sass/vs_02.txt), [VS4](../../../analysis/plaza_intro_op_sass/vs_04.txt).

[판독] balloon 계열의 공유 VS0xe000/FS0xeb00은 이 BNSH 경로에서 TEX가 없다. FS는 RGB 입력(a80/a84/a88), `alpha=sat(a8c)*aA0`·c9[8d8] threshold discard를 쓴다. 이것을 VAT 모델의 재질 FS와 혼동하지 않는다. skip CADP에는 실제 모델/애니 경로가 있고 Sequence Setup은4색 모델을 사전 pool 등록한다. normal은 CADP가 없어 **동일한 외부 모델 callback 연결을 단정할 수 없다**. [VS0](../../../analysis/plaza_intro_op_sass/vs_00.txt), [FS0](../../../analysis/plaza_intro_op_sass/fs_00.txt), [VFXRAW], [OP] @`22250`.

[판독][데이터] CS0 @compute0xc000/10880B는 기존 mg0508 CS0과 코드 바이트가 같고, CS1 @0xeb00/5504B는 skip 색종이 적분기다. CS1은 `Pnew=FMA(dt*velocity,momentum,P)` 후 `air^dt`·gravity를 적용한다. 공용 SSBO/Static/Dynamic 배열·수명/tangent 계약은 [08 §6.3](../engine/08_effects.md#63-입자-프로그램별-운동시간키-판독)·[§6.4](../engine/08_effects.md#64-좌표계픽셀식과-판독-경계-판독)을 재사용한다. **wave00의 FRN1 sine 힘을 op FRND로 이식하지 않는다.** [셰이더 인덱스](../../../analysis/plaza_intro_op_shader_index.json), [CS0](../../../analysis/plaza_intro_op_sass/cs_00.txt), [CS1](../../../analysis/plaza_intro_op_sass/cs_01.txt).

[판독][데이터] 풍선16정의(normal GPU8/skip CPU8)의 FRND payload 첫 word65536은 byte **F0=0,F1=0,F2=1**이다. amplitude main xyz=.1/add=.05,K=1000,air=1. 그러므로 사용자 파형표/위상 이동 F0·F1 가지는 사용하지 않고, F2의 감쇠 시간 가지도 a*=1에서 **t*=age**가 된다. 필요한 난수는 생성 때 저장한 U.xyz이고 매 프레임 새 noise 난수/표를 뽑는 경로가 아니다. U/LCG·소비 순서는 [08 §6.2](../engine/08_effects.md#62-초기화cpu-입자-갱신-판독) 재사용; **[미확정] 공유 seed의 초기 상태·원천과 생성 콜백/선계산→ParticleFx2Module 계산 단계의 전체 선후는 원본 공용 의존 공백**으로 남긴다(§13.2). [VFXRAW], [CPU C](../../../analysis/decomp/sound_powf_callers.c) @`7100757a70`, [CS0] @`04b0~0650`.

[판독] CPU FRND의 전역 분자 `DAT_7101c405f8`는 초기화 코드 **0x71007588c0..88d8**에서 외부 SDK `FloatPi`를 읽고 `FADD s0,s0,s0`하여 쓴다. 기존 SDK 값3.1415927410125732→분자 **6.2831854820251465**다. BSS의 파일 바이트를 초기값으로 읽은 결론이 아니다. [정적 writer](../../../analysis/plaza_intro_residual_static.txt), [07 §4.4](../engine/07_camera_lighting.md#44-nnbezelcamera-필드-판독-setprojectionperspectivefovy-0x7100846b04-reset-0x71008458f8), [CPU C](../../../analysis/decomp/sound_powf_callers.c), [08 §6.2](../engine/08_effects.md#62-초기화cpu-입자-갱신-판독).

```text
# 재구현용 수학 표현; CPU 0757a70→0758470의 기존 식
nu = f32(6.2831854820251465 / K)
x_j = f32(f32(age + f32(K*U_j)) * nu)
B(x) = 4*sin(1.6666666*x) + 3*sin(2.3809524*x)
     + 2*sin(4.347826*x) + 1.5*sin(6.6666665*x)
P_j += A_j * (B(x_j + dt*nu) - B(x_j))
```

[판독] GPU FRND 자료 공급은 기존 **07491a0**의 `R[308]`(C의 param_1[61])→Field buffer로 해소된다. payload+4/8/c→Field0/4/8(A),+10 int→float Fieldc(K); payload+2c..38→Field10..1c(weights),+1c..28→Field20..2c(periods); F0/F1/F2 byte→float Field30/34/38,zero3c,+14/18→Field40/44. `Map(buffer)+R[404]`에 쓰고 Unmap한다. CS0 `c0[290/294]`가 Field,`c0[350/354]`가 U이며 배열 stride16을 소비한다. 자료 형식이 없는 것이 아니다. [effect_vfx2_calc.c](../../../analysis/decomp/effect_vfx2_calc.c):1684~1708, [08 §6.3](../engine/08_effects.md#63-입자-프로그램별-운동시간키-판독), [CS0] @`0238~0288/04b0~0650`.

[판독] 같은 CS0의 F0=0/F1=0·air1 가지에서 `t_j=age+K*U_j`, `BG(t)=Σ w_i*sin(kappa*t/(K*p_i))`, `p=(.6,.42,.23,.15),w=(4,3,2,1.5)`, **kappa=6.283184051513672**다. 먼저 이전 V로 이동한 P에 `A_j*(BG(t_j+dt)-BG(t_j))`를 더한다. X는 @0610~0988, Y는 @1078~1ac8, Z는 @1ad0~24e8, 최종 xyz FFMA @2530/2538/2548이다. 위 BG 표기는 수학적 정규형이며 원본은 **MUFU.RCP→FMUL·RRO.SINCOS→MUFU.SIN·FFMA.FTZ** 순서다. CPU의 2π 값·host sin을 GPU 비트 동등으로 간주하지 않는다. [CS0], [VFXRAW], [FRND 연결 요약](../../../analysis/plaza_intro_frnd_contract.json).

### 10.5 skip 풍선 FMDb/FMAb·VAT·PBR

[판독][데이터] `_flow/op.bnbshpk`를 기존 bnbshpk_split/bfsha_dump로 분리·match했다. forward_plus와 container 두 archive, 4색 principledshader1→**forward_plus/forward_plus_color static program21**, unknown options=[]·error=null. 읽은 코드는 BinaryData1 **SM53** VS/FS이며 BinaryData0 GLSL reflection의 빈 sampler 목록으로 실제 TEX 부재를 주장하지 않는다. [VAT], [프로그램 match](../../../analysis/plaza_intro_vat_prog/match.json), [모델 메타](../../../analysis/plaza_intro_shader_model.json).

[데이터] vat_type3/normalize1/pack_normal1/**linear0**/uv_index1,shading_type1/fog0/localLighting0/shadowmapDraw0. SamplerAssign=`vat_postiton_texture2d→_a0`(원본 오타 그대로·pos·Point/Clamp/NoMip), `_a0→_a2`(색별 alb), `_n0→_a6`(nml), `_r0→_a1`(rgh). 텍스처는 `bd00_scn_chance_balloon00_{pos,nml,rgh}`,4색 `bd00_scn_chance_balloon00{b,g,r,y}_alb`; 목록의 모든 alb를 동시 샘플하지 않는다. params currentFrame0/numFrames1199/boundsMax33.549114/boundsMin−27.391308. [op FMDb 원시](../../../analysis/plaza_intro_op_motion_raw.json), [03 §4.4.2](../engine/03_graphics.md#442-재질-구성-요소).

[판독] SM53 VS @`0x10~0x368`: Material c[b]0x560/564/568/56c=currentFrame/numFrames/max/min,0x1b0=position texture handle. UV1.v에 `fract(ceil(currentFrame)/floor(numFrames))`를 더해 point LOD0 샘플, 위치는 sample RGB의 **(R,B,G)** 순서에 `(max−min)`을 곱하고 min+원래 position을 더한다. 선형 프레임 보간이 아니다. alpha×1023를32단위로 분리→두5bit값/31→×4−2; 두 값 u/v로 `r²=u²+v²`, normalXY≈(u,v)√(1−r²/4),normalZ=clamp(1−r²/2,−1,1). 마지막 복원은 RSQ/RCP·FTZ·clamp 명령을 보존해야 하며 위 수식은 **재구현용 수학 표현**이다. 다음 Skeleton/Mode/View는 [03 §4.2](../engine/03_graphics.md#42-스켈레톤)·[14 §32](../engine/14_shader_graphs.md#32-vs-cpu-생산자-후속--modelmodeopacity누락-color0) 재사용. [VAT VS](../../../analysis/plaza_intro_op_sass/vat_p21_vs.txt).

[데이터] 색별 FMAb900f 루프: VAT frame f0=0→449=600→899=0, Cubic계수 [0,0,1800,−1200]/[600,0,−1800,1200]. ESET의 emit start/life와 독립된 **모델 재질 애니 시간**이다. skip을 카메라 FrameMax처럼 VAT끝값으로 고정하지 않는다. [op FMAb 원시](../../../analysis/plaza_intro_op_motion_raw.json), [OPF] @`f2e0`(배치의 SetFrameMax와 구분).

[판독] p21 FS는 normal RG·roughness·albedo·IBL cube TEX와 방향광/PBR·alpha를 읽는다. glb 단색 풍선·색종이 BNSH의 TEX 없는 FS로 대체할 근거가 없다. 공용 PBR/IBL과 Material sampler 공급 계약은 [14 §2.2](../engine/14_shader_graphs.md#22-같은-sass재사용-조건)·[§32](../engine/14_shader_graphs.md#32-vs-cpu-생산자-후속--modelmodeopacity누락-color0)·[09 §4.2](../engine/09_character.md#42-캐릭터-에셋-구조-데이터) 재사용한다. **실제 동적 패스 selector·커스텀 모델 callback까지 p21만으로 완결했다고 단정하지 않는다.** [VAT FS](../../../analysis/plaza_intro_op_sass/vat_p21_fs.txt), [VAT].

[판독][데이터] dynamic key는 static p21과 별도다. forward_plus_color 메타의 `dynamic_opt_shader_type`: default0,choices0..9,keyOffset5,shift28,maskf0000000;system_id는 default0/choice0/shift27이다. main 문자열 @`0x71015a381b`의 정적 참조 **0088624→00896e0(name lookup)→materialInstance+330 저장 @88634**, 값이 유효하면 **0088648→07850cc(w2=0)**로 초기 option0을 설정한다. 이 참조를 포함하는 실제 prologue는 **00880b0**이며 INDEX의 직전 0087f74(size308)에 포함되지 않는다. 00880b0·00896e0·07850cc의 기존 C가 없으므로 이후 pass별 변경/키 조합은 보류했다. 초기0을 모든 shadow/depth/forward pass 값으로 고정하지 않는다. [모델 메타](../../../analysis/plaza_intro_shader_model.json), [동적 selector 참조](../../../analysis/plaza_intro_dynamic_shader_refs.json), [main 함수 목록](../../../analysis/functions/main.nso.tsv), [14 §32.2](../engine/14_shader_graphs.md#322-modeinstance-record).

## 11. 로드·해제·인계

[판독] scene 아카이브 준비→Begin/Setup→GameFlow, Movie preload 완료 전 대기·별도1920×1080RT. **op→menu00 Exchange, 기구→menu01 Call**. ReturnCode와 history를 URL 하나로 대체하면 첫 귀환 분기가 사라짐. [BOOT], [OP], [M00] @`47628`, [06 §1.4~1.5](../engine/06_scene_data.md#14-bqarchivemodule-범주로더-판독).

[판독] menu00 CleanupGame @`0x7100045f30`: forceWipe·보고→Network→Sequence→+170보조→Sound→UI→Map→Camera→Player→NPC 파괴. 임시 PC/Pop/Fiber를 Main에 남기지 않는다. op CleanupGame @`0x7100021ad0`은 Sequence를 파괴한다. 내부 Movie/RT/관리자 해제는 아래 소유권 순서를 따른다. [M00], [OP], [01 §5.4](../engine/01_core.md#54-파이버-수명-판독).

[판독] op Sequence dtor @`0x7100022720`: **EffectModule UnregisterPoolInstance 해제 요청 먼저**→Camera(+18)·Character(+20)·Pos(+28)·Map(+30)·UI(+38)·Sound(+40)·Balloon00(+48)·01(+50) 소유 핸들 파괴→RT entity(+58)·picture(+70)·Movie weak(+a0) 파괴→Fiber(+10) 지연삭제 큐→singleton clear. Character는 정상 GameFlow에서 먼저 해제됐으면 null 검사로 건너뛴다. [OPF], SetupMgr [OP] @`22f20`, [01 §5.4](../engine/01_core.md#54-파이버-수명-판독).

[판독] UI Skip @`0x71000269d0`은 TitleIn(true)·titleStarted=1·기존 subtitle/message 소유 핸들(+28/+40) 정리. 스킵 뒤 일반 Cut18의 actor45행/자막을 다시 재생하지 않는다. [OPF], [OP] @`23b60/24190`.

[판독] 풀 등록 @`0x71000222e4/22314/22344/22374`: 모델 경로·현재World3d·uint1·int512를 전달(ARM64 w3=1,w4=0x200). main @`0x7100127320`은 두 값이 유효인지 검사→정규화된 경로 hash+World 비교→신규 pool/virtual+0x10 준비 또는 기존 instance 확인. 전체 해제 @`126920`은 각 pool virtual+0x38에 true를 전달한다. 실제 vtable @`0x71019d31f0`의 슬롯+38→`127a0c`는 pool+60에 flag만 기록하므로 즉시 전체 파괴로 해석하지 않는다. ctor @`125d40`는 확장자를 뺀 entity 이름을 생성·World에 귀속; prepare(+10→`126134`)는 생성자를 통해 instance 목록을 준비, query(+48→`126660`)는 uint식별자와 일치하는 weak handle을 반환한다. 등록만으로 모든normal 이미터의 모델 draw를 입증하지 않는다. [pool C](../../../analysis/decomp/plaza_intro_pool_callback.c), [virtual C](../../../analysis/decomp/plaza_intro_pool_virtual.c), [vtable](../../../analysis/plaza_intro_pool_vtable_functions.txt). [OP], [POOL], [08 §5](../engine/08_effects.md#5-상태-전이와-전체-수명).

[설계] intro 전경의 전체 가시 모델/모션/UI를 fade 열기 전 P0로 준비해야 한다. 기존 first-view P0는 일반 시점이므로 충분하다고 보장하지 않음. PlazaGl/GPU 캐시·owner release는 기존 구조 재사용. [로더 §11.4](../engine/loader_manager.md#114-3단계--광장-단계-로딩)·[§13](../engine/loader_manager.md#13-흐름-예측-미리-받기캐릭터-선택-커서-우선-5단계-일부-설계--구현-전에-먼저-적음)·[§14](../engine/loader_manager.md#14-4단계--광장-렌더러-하나-광장만-설계--구현-전에-먼저-적음-plaza-gl), [plaza_page](../../script/plaza_page.ts).

## 12. 현재 웹과 차이

[데이터] 아래 웹 파일을 읽어 현재 연결을 대조했다. D1~D7은 구현 판단 [설계]이며 원본 계약은 해당 절·모듈 주소를 따른다. §16은 같은 ID의 변경 대상·순서·Node 검증 계획이다.

| ID·웹 근거 | 현재 차이와 구현 판단 |
|---|---|
| D1 [plaza_page](../../script/plaza_page.ts), [parts](../../script/app/scene/world/plaza/parts.ts), [scene](../../script/app/scene/world/plaza/scene.ts) | [설계] 현재 일반 player/camera/follow/npc/interact/balloon/UI/overview만 생성한다. Front/Entrance·InitialRide/Guidance 상태·임시 actor 수명을 추가한다. menu00 @62750/633d4/51d80/52dd0; [M00], §3~6·§11 |
| D2 [flow index](../../script/app/flow/index.ts), [flow host](../../script/app/flow/host.ts), [dev flow](../../script/dev/flow.ts) | [설계] 현재 설정→광장 중심이며 boot Movie·op Cut18·원본 타이틀이 없다. 제품 선택 뒤 op→menu00 Exchange 경계와 ReturnCode를 전달한다. boot @48e4, op @22ca0; [BOOT], [OP], §3.1·§15 |
| D3 [balloon](../../script/app/scene/world/plaza/balloon.ts), [save](../../script/view/save.ts), [flow index](../../script/app/flow/index.ts) | [설계] 현재 `callScene`에서 bit0을 쓰며 bit1 시설 소개 소비자가 없다. 섬 소개 완료 OR1·시설 소개 완료 OR2·저장 대기를 분리한다. menu01 @3c4a0/b80f0, menu00 @52dd0; [M01], [M00], §4 |
| D4 [anim](../../assets/plaza/world/anim), [manifest](../../assets/plaza/world/manifest.json), [parts](../../script/app/scene/world/plaza/parts.ts) | [설계] FSNB·CollisionFirst·소켓 자료 보유와 소개 시퀀스 연결은 별도다. 실제 scroll 구간·deco·Front 소켓·인간 순번을 연결한다. menu00 @5380/4800/1b2b4; [M00], [GATE], §5~7 |
| D5 [camera](../../script/app/scene/world/plaza/camera.ts), [scene](../../script/app/scene/world/plaza/scene.ts) | [설계] 현재 constrain=false이고 world의 활성 충돌은 CollisionMain뿐이다. 첫 걷기에 constrain=true·CollisionFirst를 켜고 완료/취소에서 복구한다. menu00 @51d80/52aa4; [M00], §5·§7.2 |
| D6 [04 §12.14.3](../engine/04_sound.md#12143-웹-연결-설계), [광장 §6.13](plaza_3d.md#613-포스트-판독화면-바램-수정-plaza-a-post-판독-2026-10-08-판독-sass), [scene](../../script/app/scene/world/plaza/scene.ts) | [설계] MENU_RHYTHM·공용 FXAA 위치 등 기존 차이는 재사용한다. intro 직접 BGM/SE·FTRG 조건·진동 요청과 fade를 같은 상태 시간축에 연결한다. op @24d6c/24f10, menu00 @51d80/52dd0; [OP], [M00], §7.1·§9~10 |
| D7 [flow index](../../script/app/flow/index.ts), [parts](../../script/app/scene/world/plaza/parts.ts), [scene](../../script/app/scene/world/plaza/scene.ts) | [설계] op 렌더 연결이 없다. DOF far·amalgam7·ESET·VAT·actor 모션/표정·shape 자료를 공급한다. 원본 normal draw/동적 pass/post 필터 등은 §13.2에 남긴다. op @22250/23b60, main @126134/0088624/0acf00; [OP], §8~11 |

## 13. 검증 기대값·후속 해소·미확정

아래는 향후 **로직·자료 대조 기대값**이며 이번 게임/화면 실행 결과가 아니다.

| 입력/지점 | 기대값·근거 |
|---|---|
| [판독] flag18 off/on·동일 +/- | off Movie유지,on skip Cut18 FrameMax·skipFX·group0.3초 정리; [OP] |
| [판독] bit0 off·설정 완료 | state5·대사/전경·CollisionFirst·직접 걷기·영역0 A; [M00] |
| [판독] bit0 on·선택1·bit1 off/on | 시설 state6/preset3 또는 Main state3/preset2; [M00] @`513a0` |
| [판독] ReturnCode1·offline·bit1 off/on | Entrance(arg1) / Main·보상. session은 첫 소개 강제 금지; [M00] @`62750` |
| [판독] current==to / >to | ==계속,>SetFrame(to)+Stop·Fiber 완료; [GATE] |
| [판독] 마지막 시설 대사 | OR2→저장 완료→ToMain; [M00] @`52dd0` |
| [데이터] Cut18 | PC8.2+rand/13+rand,Kameck0/3/7.5/11/15.5,Title>=20; [OPCHAR], [OPT] |
| [판독] Wipe | White20f,Cross out1/in20; [15 §1.1](../engine/15_transition.md#11-레이아웃-wipebflyt-데이터) |

### 13.1 1차 이후 해소한 공백

| 1차 공백 | 후속 결론·본문 반영 |
|---|---|
| [판독] Params·재개 | GroupUnlock/debug와 Cut/NextScene 명칭·재개 실패/폐기·계정 복구 분리: §3.3~4, [M00], [OPF] |
| [판독][데이터] PC·카멕 배치 | PC20 전체 local T/yaw·부모 계층·카멕/시선1200f 곡선: §8.1, [op 배치/환경/VAT 원시 애니](../../../analysis/plaza_intro_op_motion_raw.json) |
| [판독][데이터] 모션·표정 |20PC 클립 ready/a/b 길이·루프·FSkb 얼굴/FMAb·FSHb112 원본 헤더/shape/곡선220 확보: §8.1, [MOTION], [shape 원시](../../../analysis/plaza_intro_shape_raw.json) |
| [판독][데이터] FTRG·VO·ST | 실제/개별/base 체인·모션별 SE/VO/VB조건·ST 수치·op_cut18 분수 preset: §9, [FTRGRAW], [ST 원시](../../../analysis/plaza_intro_st_raw.json) |
| [판독] C 소실 인자 | 첫 안내 A→SetVisible(false),Pop type0;Fade=속도 재확인: §5·§7.1, [ARM] |
| [판독][데이터] 환경 시간 | Env fmab900f 루프 실제Play·DirLight AnimFileName 빈문자열: §10.3, [OPF], [OPMAP] |
| [판독] 포스트 | nearInvisible1→far 전용·amalgam7·CoC56..86: §10.3, [POOL], 기존SASS 재사용 |
| [판독][데이터] confetti/VAT | normal17/skip11·GTNT·CPU/GPU·byte-shared FS·VAT p21 복원: §10.4~5, [VFXRAW], [VAT] |
| [판독] 해제·title | pool선해제·RT/Movie/Fiber·NPC 타이틀 기구24/31행: §8.3·§11, [OPF], [TITLE] |
| [데이터] Movie와 음원 | video-only195.666667초·별도stream213.314667초, global/local 자막 분리: §9, [MOVIE] |
| [판독][데이터] FTRG 조건 기본값 | ST 0x301=bool 동등/false,VB 0x401=enum 동등/"1","2",새 owner false/빈문자열: §9, [COND], 기존 ui_ftrg_res C 재사용 |
| [판독][데이터] 환경 sampler·텍스처 | 논리→물리 alias→index→ComEnvironment→Layer,Clamp/Bilinear/Linear/LOD·BNTX6개 헤더: §10.3, [ENVHDR], 기존14§29~30 재사용 |
| [판독] bloom sampler 선택 | first_down pass11의 record+d8=ID2와 getCacheSampler 연결: §10.3. **ID2 생성 descriptor는 보류** |
| [판독][데이터] FRND 공급·사용 가지 | CPU 2π 초기화 writer,GPU Field packing·F0/1=0/F2=1·air1 시간·파형을 기존 C/동일 SASS에 연결: §10.4, [FRND] |
| [판독][데이터] 동적 selector 시작 | 이름 lookup→instance+330→default0 setter·메타 mask 식별: §10.5. **이후 pass 선택은 보류** |

### 13.2 남은 원본 연결·추가 C 요청

[미확정] 아래 **8검토 항목**은 같은 수준의 C 공백8개가 아니다. 기존5행에서 seed 원천과 콜백 선후를 분리해 **원본 연결6항목**으로 정리하고, 외부 GPU 비트·청각적 출력 한계2개를 별도 행으로 넣었다. shape 웹 바인딩은 확보된 계약의 구현 과제(§13.3)이며 미판독 수에 넣지 않는다. FTRG typed 기본값·env/Layer/Model 생산자·FRND 분자/선택 가지도 해소된 상태다. 필요한 **추가 C 주소는 main.nso 9함수**, menu00.nro/menu01.nro/op.nro의 확인된 진입·저장·시퀀스에는 이번 추가 C 요청이 없다.

[데이터] 2026-10-10에 [analysis/decomp](../../../analysis/decomp)·[online/out](../../../ghidra_work/online/out)·기존 [plazaA](../../../ghidra_work/plazaA) `.c` 정의와 [INDEX](../../../analysis/decomp/INDEX.tsv)를 대조했다. 아래9주소의 C 정의/등록은 없었다. `0745f60/074f620`은 기존 C가 있어 재추출 대상에서 제외했다. 신규 Ghidra·SASS 추출0, 기존 [요청 JSON](../../../analysis/plaza_intro_pending_c_request.json)은 수정하지 않았다.

| #·구분 | 확보된 경계·출처 | 필요한 C 함수 주소·모듈 / 필요한 이유 |
|---|---|---|
| 1 [미확정] normal balloon model/custom draw | op @22250→main @127320 등록·@126134 준비→@126200. GPU+SO8·primitive None·CADP 없음; skip은 CADP action3·4색 FMDb/FMAb. draw main @73e904의 E+370/380/388 callback+50·E+390 mask callback까지 확인. [VFXRAW], [POOL], [pool C](../../../analysis/decomp/plaza_intro_pool_callback.c), [virtual C](../../../analysis/decomp/plaza_intro_pool_virtual.c), [draw C](../../../analysis/decomp/effect_runtime_b13.c), [vtable](../../../analysis/plaza_intro_pool_vtable.txt) | **main.nso: 0x7100126200, 0x7100126460, 0x71001264a4, 0x71001265ac, 0x7100127a20.** instance→ComModel/material→callback 등록·SO stream/vertex binding 연결. vtable +18/+20/+30/+40와 기판독 Query+48를 대조해야 하며 normal/skip 동일 draw 가정 금지 |
| 2 [미확정] runtime dynamic shader pass | static p21/SM53·dynamic default0/choices0..9/maskf0000000. main @0088624→00896e0→instance+330→07850cc(option0). §10.5, [동적 참조](../../../analysis/plaza_intro_dynamic_shader_refs.json), [모델 메타](../../../analysis/plaza_intro_shader_model.json) | **main.nso: 0x71000880b0, 0x71000896e0, 0x71007850cc.** 실제 pass별 setter/키 조합/선택 program index가 필요. 00880b0은 정적 prologue지만 기존 INDEX 범위 밖이다. p21을 모든 depth/shadow pass로 확장 금지 |
| 3 [미확정] bloom first_down 필터 | main [out_post_render.c](../../../ghidra_work/plazaA/out_post_render.c) @0acf00: pass11/+d8=ID2→[out_post_sampler.c](../../../ghidra_work/plazaA/out_post_sampler.c) @0bc300→object+40. [후보 ARM](../../../analysis/plaza_intro_post_sampler_candidate_arm.txt) @0bbe60에서 cache+620..6e0·descriptor helper087c07c/08839b4/084dc14 확인; §10.3 | **main.nso: 0x71000bbe60.** ID2의 UVW/min/mag/mip/LOD 생성값 필요. env Bilinear descriptor를 post에 자동 적용 금지. [07 §7.5](../engine/07_camera_lighting.md#75-포스트-mg1801_postfmdb--mg1801_post_result00fmdb-데이터)의 공백과 연결 |
| 4 [미확정] 공유 xorshift seed 원천 | U/LCG 소비·E[4A0/4A2/4A4] 계약 확보. N/Q 고정 테이블 생성 main @0759410과 일반 seed 선택 @0759750을 원천 초기 상태 증거로 대체하지 않음. [08 §6.2](../engine/08_effects.md#62-초기화cpu-입자-갱신-판독)·[§14.8](../engine/08_effects.md#148-사용자-확인-필요) | **main.nso: 원천 상태 writer/초기화 호출자 주소 미식별.** callable 주소 확보가 먼저이며 새 C 목록을 임의로 늘리지 않음. 고정 주입 seed는 웹 결정성 설계일 뿐 원본 stream 동등성을 보장하지 않음 |
| 5 [미확정] 생성 콜백/선계산→vfx 계산 선후 | 일반 Start 무방출·dirty TRS 제출은 확보. **main.nso @0x7100745f60** 기존 [effect_runtime_b5.c](../../../analysis/decomp/effect_runtime_b5.c)·[b8.c](../../../analysis/decomp/effect_runtime_b8.c), **@0x710074f620** 기존 [b7.c](../../../analysis/decomp/effect_runtime_b7.c) 보유; [08 §5.3](../engine/08_effects.md#53-내부-갱신정지부착-행렬)·[§11 #7](../engine/08_effects.md#11-미확정-사항과-추가-분석에-필요한-근거) | **main.nso: ParticleFx2Module timing/호출자 주소 미식별.** 두 보유 함수를 다시 요청하지 않음. 별도 생성·선계산과 계산 callback의 전체 호출 순서 식별 필요. 1번 draw callback만 확보해도 이 계산 선후는 별도 공백 |
| 6 [미확정] DefaultGlobalLighting 우선순위 | `_SystemLighting.nx.bea/_BezelSystemResources/GlobalLightings/DefaultGlobalLighting.nbgllt`4009B/msgpack/type_id=bezel_global_lighting. 실제 ComDirectionalLight→Layer220은 [14 §29.3](../engine/14_shader_graphs.md#293-layer220-방향p7y)에 확보; [07 §7.4](../engine/07_camera_lighting.md#74-환경-mg1801_envfmdb-데이터) | **main.nso: type_id 등록·nbgllt loader·동일 layer 덮어쓰기 호출자 주소 미식별.** 이름 검색 실패로 미사용을 확정하지 않음. op 명시 환경/DirLight 값을 덮는 근거 없음. 주소 없는 무작정 C 추출 제외 |
| 7 [미확정] 외부 GPU/NVN·마지막 비트 | CPU 분자6.2831854820251465와 CS0 kappa6.283184051513672, MUFU/FTZ/RRO·정적 sampler 계약 보존; §10.4, [CS0], [14 §30~33](../engine/14_shader_graphs.md#33-분담-후속-통합-준비도사용자-확인-필요) | **모듈: main.nso→외부 NVN/driver; 추가 C 주소 없음.** 정적 수학식/헤더만으로 fetch/filtering·최종 픽셀 동일성을 인증할 수 없는 출력 경계. 새 SASS 추출·화면 보정으로 메우지 않음 |
| 8 [미확정] 실제 음원 내용·mix/VO 체감 | op.nro @0x7100024d6c/0x7100024f10·FTRG/자막·preset 호출은 §9에 확보. [OP], [FTRGRAW], [MOVIE] | **모듈: op.nro→공용 소리; 추가 C 주소 없음.** 호출 타이밍과 실제 청각 내용은 구별. 청취/원본 실행 없이 내부 음성·mix 체감을 확정할 수 없으며 이번 금지 범위 유지 |

[미확정] 1~3의 main.nso 9함수만 주소가 확정된 후속 C 후보다. **C 추출 허가 대기 중이며 아직 실행하지 않았다.** 4~6은 원천 writer/timing/loader 주소 확보가 먼저, 7~8은 추가 C9개로 해결되는 항목이 아니다. 기존 `MgmcommonDecompCreate`의 readOnly 일괄 추출 여부는 별도 확인 뒤 진행할 일로 남긴다.

### 13.3 향후 웹 공급·검증 설계

[설계] 원본 계약을 웹에 공급하는 작업은 §13.2의 원본 공백과 구별한다. 이 마감에서 코드·에셋·화면은 변경/실행하지 않는다. 아래 대응은 §16 D6~D7에 연결한다.

| 향후 과제 | 확보한 계약·웹 검증 설계 |
|---|---|
| [설계] shape 바인딩 | FSHb112/FSHA v9 원시 frame·vertexShape/KeyShape명·base·곡선220 확보. `pc01_bd_start00a`의 mario_face__body_m·fcl_R/L_eye_* 등은 원본 기본형/타깃 `_pk`,glTF delta=`_pk−_p0` 계약([03 §4.3](../engine/03_graphics.md#43-셰이프버텍스))으로 mesh.extras.targetNames/morph delta/FSHb channel을 연결하고 배열 fixture 대조. [shape 원시](../../../analysis/plaza_intro_shape_raw.json), §8.1 |
| [설계] FTRG/오디오 | §9의 새 owner bool=false/enum=빈문자열, 비교·frame/offset·override를 적용. 모든20명에 base key 합집합 재생 금지. Node 사건 로그로 키·시각·조건을 검증하되 청각 체감은 §13.2 #8로 유지 |
| [설계] env/Model/pass | §10.3 native cube/mip/Clamp/LOD·utility FMAb·Layer fog/raw +Z와 [14 §32](../engine/14_shader_graphs.md#32-vs-cpu-생산자-후속--modelmodeopacity누락-color0)의 Model/Mode/opacity를 draw별 공급. Entity/R/L/socket scale/layer q/instance active·변환의 입력 fixture를 대조. pass/normal draw/post 필터는 §13.2 #1~3 해결 전 완성 주장 금지 |
| [설계] 입자 계약 | §10.4와 [08 §6.2](../engine/08_effects.md#62-초기화cpu-입자-갱신-판독)의 U/LCG 소비·일반 Start/step·field 전후·CPU/GPU 수명 경계를 적용. seed 주입·같은 입력 반복 로그로 결정성을 검증. 원본 seed/생성·계산 선후는 §13.2 #4~5의 미확정으로 유지; 임의 noise·시각 맞추기 보정 금지 |

## 14. 최종 준비도·통합 항목

[판독] **1차 결과**는 실제 장면 경계·Front/Entrance·bit0/1·대사·카메라 분할·입력/저장·Fade 계약이다. **후속 결과**는 §13.1의15묶음을 본문 §3·§5·§8~11에 반영했다. 이번 잔여 감사는 기존 C 재사용·정적 ARM/헤더 대조만 했고 새 C 추출0이다. 추가 판독63함수, 원시카메라3·환경4·배치/환경/VAT13·캐릭터602자료·FTRG180·FSHb112/곡선220·ESET2·BNSH인덱스·고유SASS/바이너리메타를 확보했다. 공용 기능·포스트·공유FS는 기존 절/사전 재사용, 새 도구 코드·웹·에셋 수정 없음. §13.2의 한계를 숨기지 않는다.

| 구현 영역 — 확보 근거 | 준비도 [설계] |
|---|---|
| [판독] menu00/01 소개 흐름 | 구현 계약 작성 가능: state/flag/조건·라벨·순서·프레임 구간·저장 writer·인계 확보 |
| [판독][데이터] Cut18 actor/camera/title | 고유 flow·45행·모션길이·local배치/카멕경로·camera원시·제목조건·타이틀기구 자료 확보. f32/Heading/표정 공용 계약 적용 필요 |
| [판독][데이터] 소리·진동 | 직접BGM/SE·preset·FTRG/자막·두 조건의 새 owner 기본 선택 확보. 실제 모션/override 적용은 웹 구현,음원내 청각적 내용은 청취 미확인 |
| [판독][미확정] 그래픽 | sceneenv·light·post분기/sampler ID·ESET·FRND writer/식·VAT식 확보. **원본 공백=normal draw/동적 pass/post 필터(9C 요청),공유 seed 초기 상태·생성 콜백/선계산→ParticleFx2Module 계산 선후(별도 공용 의존),nbgllt 우선순위**. **향후 웹 과제=shape/draw 입력/native sampler/정밀도 적용**. 전체 재현 준비 완료로 판정하지 않음 |

[데이터] INDEX의 아래5파일 등록 행을 C 함수 헤더와 대조했다. **등록됨(2026-10-10)**이며 이번에는 읽기만 했다. 기존63함수 중 callback/virtual의6함수는 이번57등록 범위 밖이며 INDEX에 이 두 파일의 등록 행은 없었다.

| 등록 C 파일 | INDEX 함수 행 |
|---|---:|
| [plaza_intro_op_boundary.c](../../../analysis/decomp/plaza_intro_op_boundary.c) | 23 |
| [plaza_intro_op_timing.c](../../../analysis/decomp/plaza_intro_op_timing.c) | 2 |
| [plaza_intro_menu00_gates.c](../../../analysis/decomp/plaza_intro_menu00_gates.c) | 6 |
| [plaza_intro_op_followup.c](../../../analysis/decomp/plaza_intro_op_followup.c) | 23 |
| [plaza_intro_pool_dof.c](../../../analysis/decomp/plaza_intro_pool_dof.c) | 3 |
| 합계 — [INDEX.tsv](../../../analysis/decomp/INDEX.tsv) | **57** |

[데이터] 지정 기존7문서는 원문을 유지하고 절 끝에 연결·정정만 덧붙였다. 이 문서 §15~16은 미승인 선택과 설계만 정리한다.

| 통합 위치 | 추가 연결·정정 |
|---|---|
| [plaza_3d](plaza_3d.md) §2 / §6.10 / §8 | 장면 경계·소개·첫 걷기·사용자 선택 연결. §6.10④ bit0 writer와 Fade 속도 인자 정정 |
| [16_save](../engine/16_save.md) §1.2 | bit0=menu01 섬 소개 끝 OR1,bit1=menu00 시설 소개 끝 OR2·저장 완료 대기 정정/연결 |
| [modeselect](modeselect.md) §3 | ComUiMap 메뉴와 menu01 섬 소개 시퀀스 경계 연결 |
| [mgmet_flow](mgmet_flow.md) §6.2 / §8, [mgmet_3d](mgmet_3d.md) §10.1 | 항구 intro·MinigameModeData와 op/MenuData 경계 연결 |
| [05_ui_input](../engine/05_ui_input.md) §7.9 | ST/VB typed 조건과 새 owner 기본값 판독 연결 |
| [08_effects](../engine/08_effects.md) §6.2 / §14.7 | FRND 전역2π writer 판독 해소·원본 seed/콜백 공백·웹 미구현 구분 정정/연결 |

[설계] FSHb v9 parser/shape 에셋 반영, callback/virtual6함수 INDEX 추가 등록, engine README·17_actor·공용 감사의 통합은 이번 변경 범위 밖의 후속 항목이다. 해당 파일은 수정하지 않았다. 전체 그래픽 재현 완료로 판정하지 않는다.

### 14.1 문서 마감 검증 — 2026-10-10

[데이터] 지정8 MD의 인라인 링크와 참조형 정의/사용을 모두 검사했다. 이 문서의 상대 파일·MD 절 앵커 오류0, 새 연결11줄·정정4줄의 링크 오류0이다. 26출처 약칭을 유지했고 표28개의 열 수·16개 본절·금지 실행 증거 표기 부재를 확인했다. 외부 URL의 실시간 접속 검증은 하지 않았다.

[데이터] 기존7 MD는 추가 블록을 제거한 바이트의 SHA256이 시작본과 모두 같아 원문 보존을 확인했다. plaza_3d/16_save/08_effects는 LF, modeselect/mgmet_flow/mgmet_3d/05_ui_input은 CRLF를 그대로 유지했다. 기존 문장 속 배열/태그 괄호가 Markdown 링크로 해석되어 경로 검사에 실패한 **16곳은 원문 보존 조건에 따라 그대로 남겼다**: plaza_3d7,16_save1,modeselect2,mgmet_3d1,05_ui_input2,08_effects3. 신규 오류와 구별하며 기존 문장 교정은 후속 범위다.

[데이터] 이 마감의 파일 쓰기는 지정 MD8개뿐이다. INDEX 및 parts/balloon/camera/save/flow index는 시작 해시와 동일했다. 검사 중 scene.ts/dev/flow.ts의 외부 변경을 발견해 현재 온라인 주입 연결을 다시 읽었다; 소개 상태·writer·op 연결 공백 및 §16의 설계 판정은 유지된다. 두 TS의 전체 작업공간 무변경을 주장하지 않으며 이 작업에서는 수정하지 않았다. 새 Ghidra/C/SASS·원본/웹 실행·에셋 변경·git 인덱스 작업은 없다.

## 15. 사용자 확인 필요

[설계] 아래4항목은 **사용자가 선택/승인한 것으로 간주하지 않는다.** 원본 규칙을 설계 기본값으로 삼되, 보드게임을 제외한 제품의 노출 범위는 명시적 선택이 필요하다. 이 표는 구현을 시작했다는 뜻이 아니다.

| 선택 항목 | 원본 동작 | 웹 선택지 | 권고안·현재 상태 |
|---|---|---|---|
| [설계] boot Movie / op Cut18 / 타이틀 포함 | boot @48e4→op @22ca0→Movie/Cut18/title→ReturnCode4·menu00 Exchange; flag18은 Movie 버튼 skip·제목 저장. [BOOT], [OP], §3.1·§4 | 원본 전체 포함 / Movie만 제외하고 Cut18·title 유지 / 설정→광장 진입 유지 | 원본 전체 포함을 기본 설계로 권고. 보드게임 제외 제품에서 어느 범위를 보여줄지는 **미선택**. 개발 fixture의 우회는 제품 기본과 별도 |
| [설계] bit0 writer 이동 | menu01 @3c4a0 완료→SetSaveFlagOn @b80f0 OR1→저장 대기. menu00 기구는 bit0을 skip 조건으로 읽음. [M01], [M00], §4 | 실제 섬 소개 끝으로 이동 / 현재 웹 기구 `callScene` 기록 유지 | 실제 섬 소개 완료 신호를 구현한 뒤 이동 권고. 현재 웹에는 그 신호가 없음. 기존 bit0=on 세이브는 지우지 않음. **미승인** |
| [설계] bit1 첫 귀환 시설 완료 소비자 | ReturnCode1·offline·bit1 off 또는 Entrance 선택1 조건→InitialGuidance @menu00 52dd0→일곱 시설/마무리→OR2·저장 대기→Main. [M00], §3.2~3.3·§6 | 원본 분기·소비자 구현 / 시설 소개를 제품에서 생략 | 원본 조건·소개 완료에서만 bit1 쓰기 권고. 단순 광장 진입/일반 모드 메뉴 종료를 완료로 치환하지 않음. **미승인** |
| [설계] 첫 걷기 constrain·CollisionFirst 활성 | InitialRide @menu00 51d80→constrain=true·CollisionFirst on·직접 이동→영역0에서 A→state4. [M00], §5 | 원본 첫 걷기 구간에만 활성 / 현재 자유 걷기 유지 | 원본 조건에서 활성·소개 종료/중단에 소유 상태 정리 권고. x=±9/z=18 경계·A trigger를 보존. **미승인** |

## 16. 웹 구현 계획 — 설계만

### 16.1 적용 전제·소유권

[설계] 다음 순서는 §12 D1~D7 전체를 실제 파일에 연결한 **후속 작업안**이다. 이번에는 `.ts`·도구·에셋을 수정하지 않았다. 아래 entry/intro 완료 이벤트·GameFlag18 API·op renderer 계약은 제안 이름/역할이며 현재 존재하는 API로 오해하지 않는다. §15의 제품 선택이 정해지기 전에도 원본 자료와 순수 상태 fixture 계약은 작성할 수 있다.

[데이터] [parts.ts](../../script/app/scene/world/plaza/parts.ts)의 생성/갱신 순서는 player→camera→follow→npc→interact→balloon→ui→overview다. [scene.ts](../../script/app/scene/world/plaza/scene.ts)는 parts 갱신 후 stage.update(df/60), stop에서 parts.dispose→stage.dispose를 수행한다. [save.ts](../../script/view/save.ts)의 plaza adapter는 menuBit/setMenuBit/request/isProcessing이며 GameFlag18 저장 영역은 없다. [modeselect_page.ts](../../script/modeselect_page.ts)의 cfg는 메뉴 결정/종료만 제공하고 섬 소개 완료를 제공하지 않는다.

[설계] 상태·시간은 app 소유, dev는 공개 API 입력/읽기 전용 trace 소비자다. **app→dev import 금지.** entry는 ReturnCode·online/BoardMode·bit0/1·op GameFlag18을 구별해서 전달한다. 테스트는 MemoryStorage·명시적 seed·60Hz 모의 틱·고정 입력을 주입하고 실제 사용자 저장을 변경하지 않는다. frame/time 샘플과 비동기 완료 epoch를 trace에 기록하되 날짜·Math.random·호스트 frame rate를 상태 결정 근거로 쓰지 않는다. 원본 delta/Fiber 평가 계약(§7.1)은 보존하고 고정1/60 테스트 결과를 원본 실측으로 부르지 않는다.

### 16.2 변경 순서·Node 검증 계획

[설계] 각 행의 Node 검증은 **향후 구현에서 실행할 계획**이다. 지금 수행한 검증은 문서/링크/바이트 대조뿐이다. DOM·GPU·음원·원본 실행·브라우저 헤드리스 없이 상태, 가짜 scene/world/sound/save adapter와 원시 자료 fixture로 검증한다. 실측 픽셀/청각 인증은 포함하지 않는다.

| 순서·차이 ID | 실제 변경 대상·내용 | Node 검증 계획 |
|---|---|---|
| 1 — D2·D3 | [flow/index.ts](../../script/app/flow/index.ts): 최초/귀환/재개 entry와 ReturnCode·online/BoardMode 전달, Exchange/Call 구별, 비동기 전환 epoch/stop 중복 방지. [save.ts](../../script/view/save.ts): MenuData bit0/1와 별도 GameFlag18 영역/adapter 설계·저장 요청 완료 계약. [dev/flow.ts](../../script/dev/flow.ts): 공개 API로 entry/메모리 저장/seed fixture 주입 | ReturnCode0/1/2/3/4×offline/session·bit0/1 조합에서 §3.2~4의 다음 상태를 표 대조. bit0/1/flag18 독립성·request/isProcessing 지연·1회 기록·저장소 실패 고리 검증. 기존 [test_save.ts](../../tools/test_save.ts)의 저장 계약 재사용. 늦게 완료된 이전 scene을 활성화하지 않는 epoch 시험·app→dev import 정적 검사 |
| 2 — D1·D4 | [parts.ts](../../script/app/scene/world/plaza/parts.ts): intro 소유 part 등록. [scene.ts](../../script/app/scene/world/plaza/scene.ts): 첫 입력 갱신 전에 entry gate 설치, intro 상태 진행을 player 이동보다 앞에 배치·임시 actor/UI/Fiber owner 준비/해제. [camera.ts](../../script/app/scene/world/plaza/camera.ts): Front/deco/scroll 소유권·원시 f32 평가/구간 완료 계약. actor/socket·모션은 §5~8 자료/공용 API 재사용 | bit0 off→state5,선택0→4,선택1 조건→6/3·Wipe/Fiber 중 재진입 금지 대조. 인간/COM 혼합에서 소켓 이름의 인간 순번·임시 actor 수 검증. scroll 구간 `[0,100],[100,160],[260,320],[420,480],[580,640],[740,840],[940,980]`, current>to에서 clamp/stop·frame==to는 미완료. §7.3 f32 곡선 key 직전/동일/직후·Repeat fixture 검사 |
| 3 — D5 | [camera.ts](../../script/app/scene/world/plaza/camera.ts): follow constrain의 명시적 setter/event·intro 카메라와 follow 소유권 교체. [scene.ts](../../script/app/scene/world/plaza/scene.ts)/intro part: 현재 [world.ts](../../script/app/scene/world/plaza/world.ts)의 setCollisionEnabled로 CollisionFirst를 첫 걷기에만 활성, 종료/중단 시 소유 상태 복구. [balloon.ts](../../script/app/scene/world/plaza/balloon.ts): state4로 받은 입력만 1회 출발 | constrain 시 target.x=0·target.z 제한, CollisionFirst 활성과 player Start 순서 trace. x=−9/+9·z=18 경계 제외,영역 안 A trigger만 결정·held A/영역 밖 A 무효. pause/재진입/stop에서 Pop·collider·camera owner 정리,완료 후 중복 출발 없음 |
| 4 — D3 | [balloon.ts](../../script/app/scene/world/plaza/balloon.ts): 실제 섬 소개 완료가 붙은 뒤 `callScene`의 bit0 writer 제거·skip은 bit0 reader로 유지. [flow/index.ts](../../script/app/flow/index.ts): **menu01 InitialGuidance 완료 신호** 수신→OR1·저장 대기. [scene.ts](../../script/app/scene/world/plaza/scene.ts)/intro: 시설 마지막 대사 끝→OR2·저장 대기→state3/Main. [save.ts](../../script/view/save.ts): 기존 on 비트 유지 | 이륙/기구 skip/일반 modeselect onDone만으로 bit0을 쓰지 않음. 섬 intro 중단=off,진짜 완료=on·1회 request. bit1은 전체 시설/마무리 완료 전 off·완료 후 on,이후 ReturnCode1에서는 반복하지 않음. 기존 save bit0 on을 회귀 마이그레이션에서 보존. **추가 구현 의존:** 현재 [modeselect_page.ts](../../script/modeselect_page.ts)와 menu 모듈에 섬 소개 상태/완료 API를 제공해야 함; 위7파일만 고쳐 writer를 안전하게 옮길 수는 없음 |
| 5 — D2·D7 | [flow/index.ts](../../script/app/flow/index.ts): 제품 선택에 따라 Movie→Cut18→title→ReturnCode4 광장으로 인계하는 op screen 계약 추가. [parts.ts](../../script/app/scene/world/plaza/parts.ts)/[scene.ts](../../script/app/scene/world/plaza/scene.ts): 일반 menu00 part와 op actor/Map/UI 수명 분리·45행 배치/카멕·title 풍선 owner 연결. [dev/flow.ts](../../script/dev/flow.ts): 모의 Movie 시계·flag18·skip fixture | §3.1 Cut00 natural/SceneParams Cut/flag18 off/on의 +/- 분기 trace. 정상과 skip은 actor/FX/카메라 FrameMax·subtitle 정리 차이를 대조. Cut18 elapsed<20/=20 제목1회·L/R계열 양쪽 Hold 조건·flag18 쓰기 후 저장 완료 전에 Exchange 금지. exit/late preload/stop 2회에서 owner release 횟수 검사. **추가 구현 의존:** 현재 FlowScreens에 op renderer가 없으므로 Movie/3D/title 화면 adapter가 필요; menu00 parts를 통째 op에 돌리지 않음 |
| 6 — D6 | [scene.ts](../../script/app/scene/world/plaza/scene.ts)/intro part: ctx.sound·UI·진동 adapter에 §9 직접 호출/FTRG 요청과 §7.1 fade를 상태 tick으로 전달. [balloon.ts](../../script/app/scene/world/plaza/balloon.ts): 기존 기구 BGM/JIN/SE 인계와 intro 소리 owner 정리. [dev/flow.ts](../../script/dev/flow.ts): 음원 재생 없는 사건 trace 제공. 공용 MENU_RHYTHM·FXAA 차이는 §12 D6의 기존 절에서 처리 | Movie cue 마이크로초→f32 초·Cut18 preset/SE·title BGM·이륙 JIN 순서 로그. ST0x301 bool=false 통과/VB0x401 enum 빈값 실패·"1"/"2" 동등 조건·owner override별 FTRG 중복 금지. Fade 인자 speed1→20f,White speed0.5→40f,Cross out1f/in20f 모의 틱 대조. 진동 요청 이름/시각만 검증·체감/청취 주장 금지 |
| 7 — D7·D4 | [scene.ts](../../script/app/scene/world/plaza/scene.ts): intro 가시 모델/모션/UI P0 사전 준비·shared GPU owner/lease·stop 뒤 비동기 무효화. [parts.ts](../../script/app/scene/world/plaza/parts.ts): op renderer adapter가 actor/shape/VAT/env/post/FX 자료를 명시적으로 받도록 연결. [camera.ts](../../script/app/scene/world/plaza/camera.ts): op 카메라 raw near/far/DOF 선택 제공. 렌더/변환 공용 모듈 수정과 미보유 op 에셋 공급은 별도 구현 범위 | mock cache owner acquire/release 균형·first fade 전 P0 준비·중단 후 late asset 적용 금지. actor/FSHb targetNames·색별 VAT alias/Point/ceil frame·env cube/mip/Clamp/LOD·Model/Mode 입력 배열 fixture 대조. FRND CPU/GPU 분자 구별·고정 seed 반복 trace. §13.2 #1~6은 pending으로 검출하고 웹 값/근사로 확정하지 않음. Node 검증 통과를 최종 GPU 픽셀 동일성으로 확대하지 않음 |

[설계] 순서1~4로 menu00/01 소개 계약을 먼저 준비하고, 순서5~7의 op/그래픽은 제품 범위 및 §13.2 의존 해소에 따라 연결한다. 각 변경은 해당 Node 검증이 통과한 뒤 다음 소유권 경계로 진행한다. 현재 코드/에셋이 없는 완료 신호·op renderer·추가 공용 공급 계약은 **구현 의존**으로 명시했으며 작성 완료/실행 완료로 표시하지 않았다.

[BOOT]: ../../../analysis/decomp/scene_boot.c
[M00]: ../../../ghidra_work/online/out/menu00.nro.c
[M01]: ../../../ghidra_work/online/out/menu01.nro.c
[OP]: ../../../analysis/decomp/plaza_intro_op_boundary.c
[OPT]: ../../../analysis/decomp/plaza_intro_op_timing.c
[GATE]: ../../../analysis/decomp/plaza_intro_menu00_gates.c
[CAMRAW]: ../../../analysis/plaza_intro_camera_raw.json
[OPENV]: ../../../analysis/plaza_intro_op_env_raw.json
[OPCHAR]: ../../../extracted/bea/flow~op.nx.bea/flow/op/data/opCharacterList.json
[OPMAP]: ../../../extracted/bea/flow~op.nx.bea/flow/op/data/opMapStructure00.json
[OPMSG]: ../../../extracted/bea/flow~op.nx.bea/flow/op/data/opMessageList.json
[MAP]: ../../../extracted/bea/menu~menu00.nx.bea/menu/menu00/data/MapStructure.json
[KO]: ../../../extracted/message/koKR/menu01_main.json


[OPF]: ../../../analysis/decomp/plaza_intro_op_followup.c
[POOL]: ../../../analysis/decomp/plaza_intro_pool_dof.c
[MOTION]: ../../../analysis/plaza_intro_character_motion_raw.json
[FTRGRAW]: ../../../analysis/plaza_intro_op_ftrg.json
[VFXRAW]: ../../../analysis/plaza_intro_op_vfx_raw.json
[VAT]: ../../../analysis/plaza_intro_vat_mats.json
[MOVIE]: ../../../analysis/plaza_intro_movie_metadata.json
[TITLE]: ../../../extracted/bea/flow~op.nx.bea/flow/op/data/opTitleCharacterList.json
[ARM]: ../../../analysis/plaza_intro_ride_args.txt

[COND]: ../../../analysis/plaza_intro_ftrg_conditions.json
[ENVHDR]: ../../../analysis/plaza_intro_env_sampler_headers.json

[CS0]: ../../../analysis/plaza_intro_op_sass/cs_00.txt
[FRND]: ../../../analysis/plaza_intro_frnd_contract.json
