# 09. 캐릭터 — ID·에셋·뼈, 모션 재생·전이, 시선·눈·흔들림 본, 캐릭터 glb

2026-10-09. 상태: **공용 22명 에셋·웹 구현 있음 / neck 기저·보조물리 활성 추가 판독 / 공통 FTRG 계약은 05 §7 / 남은 근거는 §11**.
문서 형식과 확정 수준은 [../../../../web/분석.txt](../../../../web/분석.txt)(실제 위치 `c:/dev/web/분석.txt`)를 따른다.
- **[실행]**: 이 문서에서는 "변환·로드·재구현 실행 확인"이다. 원본 게임을 돌린 것은 없다.
- **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**.

주소는 모두 SwitchLoader 기본 베이스 0x7100000000 기준이다. 모듈 이름과 함께 쓴다(`main @0x…`, `mg1801 @0x…`).

같은 내용을 여러 문서에 복사하지 않는다. 다음은 다른 문서가 근거다.

| 주제 | 근거 문서 |
|---|---|
| 아카이브 로딩, PlayerCharacterID 전체 표, `characterlist.json` 필드, mpat 포맷 | [06_scene_data.md §1·§2](06_scene_data.md) |
| FX 트리거(모션 프레임 이벤트 → SE·보이스·진동) | [05_ui_input.md §7](05_ui_input.md) |
| 프레임 타이밍·파이버 순서·GetDeltaTime | [01_core.md](01_core.md) |
| FRES·BNTX 변환, 회전 규약, 재질 근사 | [03_graphics.md](03_graphics.md), 변환기 `web/tools/analysis/graphics_bfres2gltf` |
| mg1801 Player 로직 | [../minigame/mg1801.md §4.6·§5.2·§6.5](../minigame/mg1801.md) |
| actorparam·이동·충돌·컴포넌트 순서 | [mg0101 §3.6·§6.5](../minigame/mg0101.md), [mg0106 §8](../minigame/mg0106.md), [mg0912 §6](../minigame/mg0912.md), [11_moving_collision](11_moving_collision.md) |
| 광장 캐릭터·Sub 모션·액터값 | [plaza_3d §3.5](../shell/plaza_3d.md), [plaza_guide](../shell/plaza_guide.md) |
| 본 부착·SRT, 결과 배치·모션 큐 | [mg0508 §4](../minigame/mg0508.md), [minigame_result §6.6·§6.8](../shell/minigame_result.md) |
| 몸 셰이더·표시 본·공용 모델/모션 | [charselect §12.1·§12.8·§12.11](../shell/charselect.md), [chara_assets §9](chara_assets.md) |

---

## 1. 기능 개요와 사용자에게 보이는 동작

플레이어 캐릭터는 22명이다. 화면의 캐릭터는 다음 요소로 움직인다.

| 요소 | 원본 구성요소 | 보이는 것 |
|---|---|---|
| 몸 모션 | `actor::ComActorMotion` → `actor::ActorAnimationSlot` → `nn::bezel::ComAnimator` | 대기·휘두름 등 뼈 애니 |
| 모션 전이 | 장면별 전이표 `chara/mpat/*.mpat` + MotionArg 블렌드 값 | 모션이 바뀔 때 섞이는 시간 |
| 표정 | 같은 슬롯 계열의 `fcl_*` 모션(눈꺼풀·눈썹·입 뼈), 얼굴 키셰이프, 재질 파라미터 애니 | 깜빡임, 웃음 등 |
| 시선 | `bex::ComHeading` | 머리·눈이 대상(채소 등)을 본다 |
| 흔들림 | `nn::bezel::ComPhysicalAnimation` + 캐릭터 `.apx` | 치마·머리카락 등(11명만) |
| 소품 | 부착 뼈 `attach_R_hand` 등에 다른 모델을 건다 | mg1801 칼 |
| 소리·진동 | 모션 프레임 이벤트(FX 트리거) | mg1801 휘두름 2프레임에 SE, 3프레임에 보이스 |

mg1801에서는 4명이 칼을 들고 `rhy_knife_idle00`을 박자에 맞춰 반복한다. 휘두르면 `rhy_knife_swing00`을 한 번 재생하고 끝나면 대기로 돌아간다. 머리는 자기 레인에 내려오는 채소를 본다.

## 2. 분석 대상 원본·버전·자료 위치

| 항목 | 위치 |
|---|---|
| 원본 | Super Mario Party Jamboree US v0 (`c:/dev/original/`, 읽기 전용) |
| 모션 코드 | main NSO `actor::ComActorMotion` @0x710002d240~, `actor::ActorAnimationSlot` @0x7100023728~, 리스너 `FUN_7100022f20` |
| 시선 코드 | main `bex::ComHeading` @0x71001bf2a8~, `bq::ComMatter::AddHeading` @0x71002b4950 |
| 물리 애니 | main `nn::bezel::ComPhysicalAnimation` @0x71004f33a0~ |
| mg1801 Player | mg1801.nro `Player::Player` @0x710000b130, `MyUpdate` @0x710000c9c0, `UpdateHeadControl` @0x710000d130, `Finish` @0x710000d580, `Ending` @0x710000d680, `ObjectManImpl::GetHeadTarget` @0x71000047e0 |
| 디컴파일 | `analysis/decomp/character_motion.c`(main 157함수), `character_anim2.c`·`character_anim3.c`·`character_anim4.c`(bezel 재생 내부), `character_anim_listener_dis.c`(리스너 디스어셈블), `character_mg1801_player_dis.c`(mg1801 Player 디스어셈블) |
| Ghidra | `ghidra_work/character`(jamboree_main, mg1801). 스크립트 `web/tools/analysis/ghidra_scripts/CharacterDisasm.java`(함수 디스어셈블+호출 이름), `CharacterDecompAddr.java`(주소·이름·vtable 포인터 표 디컴파일) |
| 에셋 | `extracted/bea/chara~pcNN.nx.bea`(22), `chara~pcMot_<key>.nx.bea`(85), `bq.nx.bea/common/data/{characterlist,pcMotionArcList,face_param}.json`, `bq.nx.bea/chara/mpat/*.mpat`(111) |
| 도구 | `web/tools/analysis/character_motion_index.py`, `web/tools/analysis/character_glb.py`, `web/tools/analysis/character_verify/{run.mjs,check.ts,shot.ts,view.html,motion_ref.ts}` |
| 산출물 | `extracted/converted/character/motion_index.json`, `extracted/converted/character/pc01/{pc01_mario.glb, tex/, meta.json, verify_three.json, filmstrip.png}` |

## 3. 진입점과 전체 호출 흐름

### 3.1 캐릭터 생성 (mg1801 예) [판독]

```
mg1801::Player::Player(lane, PlayerID)                      mg1801 @0x710000b130
  CreateSceneEntity("Player<id>")
  Entity::AddComponent<bq::ComMatter>(PlayerID, MatterType 0)   → 캐릭터 모델·모션·FX 트리거 컴포넌트 묶음
  SetTranslation(lane*2-3, 0, -2)
  ComMatter::GetMotion() → ComActorMotion
  AddAnimation("rhy_knife_idle00", 1,0,0,0)                 main @0x710002d7d0
  AddAnimation("rhy_knife_swing00",1,0,0,0)
  Play("rhy_knife_idle00") ; SetFrame(0) ; SetSpeed(BPM/120)
  GetCharacterID() → ComMatter::AddHeading() → SetHeadLookWeight(Params.HeadLookWeight 0.3) ; SetTargetNone
  캐릭터별 시선·물리 예외(§6.8)
  칼 엔티티 mg1801_knife00.fmdb → SetModelHook(attach_R_hand)
  의자(마스크 §4.1) → 엔티티 y = 의자 높이
```

### 3.2 재생 요청에서 화면까지 [판독, 일부 추정]

```
ComActorMotion::Play(MotionArg)                    main @0x710002dd98  (이름 길이 0 이면 무시)
 └ ActorAnimationSlot::Play(MotionArg)             main @0x7100023728  arg 를 슬롯+0x08 에 복사
    └ (슬롯+0x130 인터럽트 함수가 있으면 먼저 묻는다)
    └ FUN_7100022a80                               main  같은 해시 + forceRestart 0 → 무시
        · arg 를 슬롯+0x148 해시맵(키 = 이름 해시)에 저장
        · ComAnimator::GetAnimation(이름) → FUN_710081a6e8(애니메이터, 슬롯, 애니, 전이인자 arg+0x44)
             큐 비우기, 새 노드 프레임 설정, bezel 슬롯 속도 1.0
             FUN_710081a768: 컨트롤러(mpat 표가 붙는 곳)가 있으면 그쪽으로 요청을 넘긴다
        · 시작 리스너 FUN_7100022f20(vtable 0x71019cc150+0x10) — 저장한 arg 로 속도·시작 프레임·블렌드 결정(§6.4)
        · FUN_7100813940: 전이 적용, 슬롯의 현재 노드를 새 노드로 바꾸고 사건 발송
매 프레임: 애니메이션 모듈 타이밍(0x10~)에서 프레임 진행 → 뼈 행렬 → 렌더
```

- 리스너 → mpat 조회·보정 → 현재 노드 교체 → mpat 시작 프레임 보정 순서다 [판독 main @0x7100105ea0]. 자세한 주소는 §6.4~6.6.
- `Play`는 동기적으로 노드를 교체한다. 슬롯 갱신 전에 요청됐으면 새 노드도 그 갱신에 포함된다. 반면 진행 뒤 큐에서 꺼낸 노드는 다음 갱신부터 진행한다(§6.6). 첫 화면의 평가·표시 시점은 §8의 별도 문제다.

## 4. 구조체·필드·상수·열거형

### 4.1 캐릭터 ID·크기 분류 [판독 + 데이터]

PlayerCharacterID는 `characterlist.json`의 `PlayerCharacterData` 배열 인덱스다.
- `CharacterDataModule::LoadData` → `FUN_71001d5e70`이 `BeginArray("PlayerCharacterData")` 뒤 0~21번을 차례로 0x940 B 레코드에 읽는다 [판독 main @0x71001d5e70].
- `PlayerWork::GetCharacterID` = `PlayerWork+0x48` [판독 @0x710021d724].
- 전체 표(경로·이름·키)는 [06 §2.1](06_scene_data.md)에 있다. 아래는 캐릭터 동작에 필요한 열만 뽑았다.

| ID | pcNN | 키 | 이름 키 | 한국어 | height | mg1801 의자 | 시선(mg1801) | `.apx` 물리 |
|---|---|---|---|---|---|---|---|---|
| 0 | pc01 | MARIO | im_pc01_name | 마리오 | 1.54 | stool02 | 머리·눈 | 없음 |
| 1 | pc02 | LUIGI | im_pc02_name | 루이지 | 1.73 | stool02 | 머리·눈 | 없음 |
| 2 | pc03 | PEACH | im_pc03_name | 피치 | 1.80 | stool03 | 머리·눈 | 있음 |
| 3 | pc04 | DAISY | im_pc04_name | 데이지 | 1.78 | stool03 | 머리·눈 | 있음 |
| 4 | pc05 | WARIO | im_pc05_name | 와리오 | 1.67 | stool02 | 머리·눈 | 없음 |
| 5 | pc06 | WALUIGI | im_pc06_name | 와루이지 | 1.85 | 없음 | 머리·눈 | 없음 |
| 6 | pc07 | YOSHI | im_pc07_name | 요시 | 1.69 | stool02 | 머리·눈 | 없음 |
| 7 | pc08 | KINOPICO | im_pc08_name | 키노피코 | 1.20 | stool01 | 머리·눈 | 있음 |
| 8 | pc09 | KINOPIO | im_pc09_name | 키노피오 | 1.20 | stool01 | 머리·눈 | 없음 |
| 9 | pc11 | ROSETTA | im_pc11_name | 로젤리나 | 2.18 | 없음 | 머리·눈 | 있음 |
| 10 | pc12 | DK | im_pc12_name | 동키콩 | 1.65 | stool03 | 머리·눈 | 있음 |
| 11 | pc13 | CATHERINE | im_pc13_name | 캐서린 | 1.69 | stool02 | 머리·눈 | 있음 |
| 12 | pc14 | PAULINE | im_pc14_name | 폴린 | 1.90 | stool03 | 머리·눈 | 있음 |
| 13 | pc50 | KOOPA | im_pc50_name | 쿠파 | 2.32 | 없음 | 머리·눈 | 있음 |
| 14 | pc51 | KURIBO | im_pc51_name | 굼바 | 1.02 | stool01 | **눈만** | 없음 |
| 15 | pc52 | HEYHO | im_pc52_name | 헤이호 | 1.22 | stool01 | 머리·눈 | 있음 |
| 16 | pc53 | NOKONOKO | im_pc53_name | 엉금엉금 | 1.40 | stool02 | 머리·눈 | 없음 |
| 17 | pc54 | CHOROPOO | im_pc54_name | 쪼르뚜 | 1.15 | stool01 | 머리·눈 | 없음 |
| 18 | pc56 | KOOPA_JR | im_pc56_name | 쿠파주니어 | 1.52 | stool02 | 머리·눈, **물리 끔** | 있음 |
| 19 | pc58 | TERESA | im_pc58_name | 부끄부끄 | 1.53 | stool03 | **둘 다 끔** | 없음 |
| 20 | pc61 | GABON | im_pc61_name | 가봉 | 1.25 | stool01 | 머리·눈 | 있음 |
| 21 | pc62 | HAKKUN | im_pc62_name | 닌군 | 1.25 | stool01 | 머리·눈 | 없음 |

- **의자 마스크** [판독 mg1801.nro.c:10015 + 데이터]: 비트 번호 = PlayerCharacterID다. 앞 마스크부터 검사한다.
  - `0x32C180` → stool01(y 0.838): 7, 8, 14, 15, 17, 20, 21
  - `0x7F7C9D3`에서 앞을 뺀 것 → stool02(y 0.568): 0, 1, 4, 6, 11, 16, 18
  - `0x7FFDDDF`에서 앞을 뺀 것 → stool03(y 0.218): 2, 3, 10, 12, 19
  - 어디에도 없음 → 의자 없음: 5, 9, 13
  - 마스크의 비트 22~26은 PlayerCharacterID 범위(< 0x16, `PCNumber` abort 검사) 밖이다. 동작에 영향이 없다.
  - 같은 결론을 scene 담당도 냈다([06 §2.1](06_scene_data.md)).
- height는 `characterlist.json` 값이다. 의자는 키 순서와 대체로 맞는다. DK(1.65)·TERESA(1.53)는 stool03이다. 체형 때문으로 보인다 **[추정]**.
- "시선" 열은 mg1801 Player 생성자의 분기다(§6.8). "`.apx` 물리" 열은 `chara~pcNN`에 `model/pcNN_*.apx`가 있는지다 [데이터].

### 4.2 캐릭터 에셋 구조 [데이터]

`chara~pcNN.nx.bea` 파일 목록은 [06 §2.3](06_scene_data.md)에 있다. 여기서는 모델 내부를 본다. 표본은 pc01이다.

**모델 변형**

| 파일 | 뼈 | 메시(셰이프) | 정점 | 차이 | 쓰임 |
|---|---|---|---|---|---|
| `pc01_mario.fmdb` (`fmdb m1`) | 94 | 7(그리는 것 3: body·face·hair, 나머지 container·fluid 4) | 13,013 | | 기본 |
| `pc01_mario_light.fmdb` (`fmdb light`) | 81 | 1(body) | 6,685 | 머리카락 4·눈꺼풀 4·fluid 5 뼈 없음, 얼굴·머리카락 메시 없음 | 저폴리 모델 [데이터]. 선택 인자는 아래, 장면 설정은 부분 판독 |

- 06 문서의 "`_light` = 라이트 리그 [추정]"은 이 비교로 틀린 것으로 본다. 모델 안에 라이트 뼈가 없고 몸 메시만 줄었다 [데이터: graphics meta 비교].
- **선택 경로** [판독]: `LoadData` @main 0x71001d744c~0x71001d7484가 `fmdb light`를 캐릭터 0x940 B 레코드+0xE8에 읽는다. `FUN_71001d6a48(id)`는 그 주소, `FUN_71001d6a1c(id)`는 기본+0x68을 돌려준다. `CharacterDataPath` 생성자 @0x71002ba2bc는 **w2.bit0=1이면 light, 0이면 m1**을 선택한다. `ComMatter` 모델 구성 @0x71002b03fc~0x71002b040c는 설정 객체+6의 byte를 w2로 넘긴다. 별도 구성 @0x710044af38·0x710044b034는 0을 직접 넘긴다. 거리 기반 LOD 판정은 이 경로에 없으며, 각 장면이 설정+6을 쓰는 지점은 아직 부족하다.
- 외곽선 전용 모델은 캐릭터 아카이브에 없다. 외곽선은 셰이더 쪽이다 **[추정]**(03_graphics 범위).
- `container_model`·`fluid_*` 셰이프는 재질이 `container`·`fluid` 셰이더다. 젖음·데칼 그림자용 보조 메시로 보인다 **[추정]**. 화면 근사에서는 숨긴다(변환기도 그리는 셰이프 3개만 냈다).

**텍스처 세트** (`model/textures/`)

| 이름 | 형식 | 용도 |
|---|---|---|
| `pc01_body_arr_alb` | 배열 2레이어 1024×2048 | 몸 알베도. 레이어1은 변형(젖음 등 **[추정]**) |
| `pc01_body_arr_nml` | 배열 2레이어 | 노멀 |
| `pc01_body_rgh`·`_mtl`·`_cvt` | 2D | 거칠기·금속·곡률(SSS) |
| `pc01_eye_arr_alb`, `pc01_eye_nml` | 배열 2 / 2D | 눈동자. UV 이동으로 시선·표정(§6.9) |
| `pc01_lut_arr` | 배열 2 | 셰이더 LUT |
| `pc01_wet_mask` | 2D | 젖음 마스크(`actor::ComWetExpression`) |
| `_Materials/cha_{body,foot}_{hgt,vlc}`, `common_decal_shadow00` | 2D | 공용 |

- 배열 텍스처는 그래픽 담당 `web/tools/analysis/graphics_bntx.py`가 레이어별 png(`_00`, `_01`)로 푼다 [실행].
- **몸 UV는 기존 그래프 판독으로 해소**: [charselect §12.11](../shell/charselect.md)의 24개 프로그램과 `analysis/mat/charsel_body_graph.json`을 따른다. 일반식은 `uv_body = S·(uv0 + Σ(C1/C2 성분·P 성분)) + O`다. 기본 v 보정은 pc01~06·08·09·11·14·51·54·58에서 `0.5v+0.5`, pc50은 `0.5u`, pc13은 **`0.8v+0.2`**, pc07·12·52·53·56·61·62는 항등이다. 텍스처 종횡비만으로 판정하던 pc13 규칙과 ‘얼굴은 보정하지 않는다’ 설명을 폐기한다.
- 눈 좌표·흰자 마스크·DK/가봉 눈꺼풀은 [charselect §12.8](../shell/charselect.md)에 있는 캐릭터별 구현·데이터 판독을 재사용한다. `_C1/_C2`의 몸 좌표식 확정이 눈 합성 전체의 확정을 뜻하지 않는다(§6.9). 과거 pc01 시험 렌더(§10)는 이 보정 이전 산출물이다.
- 현재 `script/shell/charselect/preview3d.ts`는 위 그래프 분기를 적용하지만, `script/games/mg1801/view/character.ts`에는 종횡비 기반 보정이 남아 있다. 이 차이는 현재 구현의 정합성 과제이며 원본 규칙의 불확실성과 구분한다.

**뼈 체계** (pc01, 94개) [데이터]

| 분류 | 뼈 | 쓰는 곳 |
|---|---|---|
| 루트 | `model_root` → `NDcha_pos`(캐릭터 원점) | `NDcha_pos`는 `bex_no_transit_bone`: 본 전이 시간 0(아래 소비 식). FX 트리거 훅(휘두름 SE) |
| 몸통 | `pelvis`, `spine00`, `head`, `head_aimcont` | 시선 제어 뼈는 `head_aimcont`·`chin`·`neck_roll`·`spine00`(§6.8). pc01에는 `neck_roll`이 없다 |
| 팔다리 | `L/R_thigh, calf, foot, toe, knee, hem, thigh_roll`, `L/R_clavicle, upperarm, elbow, forearm, hand, wrist, upperarm_roll`, 손가락 `L/R_finger1~4_1/2`, `L/R_thumb_1/2` | |
| 부착점 | `attach_R_hand`, `attach_L_hand`(+`_mrr` 거울용 부모), `attach_L/R_foot`(+`_mrr`), `attach_head`, `attach_body`, `attach_eff` | 소품·이펙트. mg1801 칼 = `attach_R_hand`. 캐릭터 선택 카메라 대상 = `attach_head`(`chara_select_target_bone`) |
| 머리 장식 | `cap`, `F_hair_root/F_hair`, `T_hair_root/T_hair` | |
| 얼굴 | `facial_root` 아래 `L/R_brow_1~3`, `L/R_eyeline_upper/lower`, `L/R_lip`, `chin`→`lower_lip`, `upper_lip`, `mario_upper_tooth` | 표정 모션(`fcl_*`)이 움직인다. 눈꺼풀 4개는 user data `bex_limit_transit_bone` 0.07 |
| 기타 | `NDdecal`, `container_model`, `fluid_model`→`NDinput_0`, `fluid_L/R_foot`, `fluid_body` | 데칼·유체 보조 |

- 캐릭터마다 뼈 수가 다르다. `rhy_knife_*` 애니의 뼈 수: pc01 94, pc11·pc14 114, pc58 43, pc51 44 [데이터 `bfres_probe`].
- 모델 user data(pc01) [데이터]:

| 키 | 값 | 소비 의미·확정 수준 |
|---|---|---|
| `bex_mirror_shader_param` | body_m `material_utility_parameter0` ↔ `1` (`xd`), `parameter2` ↔ `parameter2` (`ijd`) | 좌우 반전 재생 때 바꿔 쓸 셰이더 파라미터 |
| `bex_mirror_key_shape_blend` | `fcl_L/R_eye_half/close/tight_shp` 쌍 | 반전 때 키셰이프 좌우 교환 |
| `bex_mirror_bone_visibility` | `attach_L/R_hand(_mrr)`, `attach_L/R_foot(_mrr)` 쌍 | 반전 때 뼈 표시 교환 |
| `bex_limit_transit_shape` | `mario_face__body_m`, `0.07` | 해당 shape 전이 시간 최대 0.07초 [판독: 아래] |
| `motion_blur` | 0 | |

**본·shape 전이 제한 소비** [판독 main]: 초기화 `FUN_710010aaf0`은 본 user data를 읽어 `FUN_71006a4e7c`에 `{min,max}` f32 쌍을 전달한다. `bex_no_transit_bone` 존재 시 `{0,0}`(@0x710010ab80~0x710010aba8), `bex_limit_transit_bone`은 type=1·count≥1의 첫 float v로 `{0,v}`(@0x710010abd0~0x710010ac04)다. 둘 다 있으면 뒤의 limit 설정이 덮는다. 본별 배열은 컴포넌트+0x28, stride 8이다.
- `FUN_71006a77f0` @0x71006a7804~0x71006a782c: **`D_bone = max(min, min(requestDuration,max))`**. D≤0이면 이전 포즈 전이 기록을 만들지 않는다. D>0·type≠0·D>elapsed(+0xF4)이면 이전 포즈 기록에 `{D,elapsed}`(+0xE0/+0xE4)를 저장한다(@0x71006a7830~0x71006a7874). `no_transit`는 새 포즈 적용을 막는 마스크가 아니다.
- shape는 `bex_limit_transit_shape`의 이름/십진 값 쌍을 `FUN_710010aaf0` @0x710010adc8~0x710010aed8이 읽어 `FUN_71006a0f08`에 `{0,v}`를 넘긴다. shape 이름 조회→컴포넌트+0x28의 stride 12 레코드+4/+8에 쓴다(@0x71006a0f1c~0x71006a0f50). 소비 @0x71006a2d14~0x71006a2d44도 **`D_shape=clamp(requestDuration,min,max)`**이고, D>elapsed(+0xC0)이면 기록+4/+8에 D/elapsed를 저장한다(@0x71006a2d48~0x71006a2e34). 기본 min/max는 0/FLT_MAX(@0x71006a04bc~0x71006a04d8). 따라서 본·shape의 **0.07은 최대 70ms(60Hz에서 4.2프레임)의 전이 시간**이며 가중치 상한이 아니다. 요청의 초 단위는 §6.5와 같다.

**얼굴 키셰이프** (`mario_face__body_m`): `fcl_R/L_eye_tight_shp`, `fcl_R/L_eye_close_shp`, `fcl_R/L_eye_half_shp`. 머리카락 `shp_hair_in_shp` [데이터]. `rhy_knife_*.fshb`·`fcl_blink00.fshb`는 셰이프 트랙이 0개다 [데이터]. **사용 모션 확인**: pc01 `co_chr_slct00a.fshb`의 FSHA(파일 +0xF0, FrameCount 63)에 여섯 눈 키셰이프 이름이 있다. 기존 공용 `assets/chara/pc01/motion/co_chr_slct00a.glb`의 `_shape` 애니는 face(6 targets)·hair(1 target) 두 weights 채널이다. 64샘플×6 얼굴 가중치 중 40개가 0이 아니며 범위는 0~1, hair는 64샘플 모두 1이다 [데이터]. 따라서 ‘실제 사용 모션 미발견’은 해소하되 표정 슬롯 소비자는 아래 별도 항목이다.
- **정정(깜빡임 해소):** 모션 파일 user data `blink`가 있으면 `fcl_blink00`을 AnimationNodeBundle의 둘째 자식으로 묶어 함께 재생한다. 값 설정은 자식 전부, 질의는 첫 자식에 간다 [판독 main FUN_7100034aa0, FUN_71000321e0 계열]. `rhy_knife_idle00`·`co_idle00`에만 있고 swing에는 없다. 묶이는 파일 종류(fskb/fshb/ftsb)는 캐릭터마다 다르다 [데이터]. 깜빡임 프레임 = 묶음 시작 뒤 진행 프레임을 깜빡임 파일 길이로 감은 값 **[추정]**. DK·쪼르뚜·가봉은 깜빡임이 재질 애니(ftsb)뿐이다.

**mpat** = 장면·캐릭터별 모션 전이표다(포맷 [06 §2.5](06_scene_data.md)). `characterlist.json`의 `anim transit table`(`anim_transit.mpat`)은 파일이 없다. 실제로는 `chara/mpat/<장면>_<pcNN|pc>.mpat`·`sys_*`를 붙인다 [판독 main FUN_71002b3a30]. mg1801은 `mg1801_pc.mpat` 3항목이다(§6.5).

**표정**: 따로 된 표정 텍스처 패턴은 없다(`ftsb.fmab`의 `patterns`가 비어 있다) [데이터]. 표정은 세 경로다.
1. 얼굴 뼈 스켈레탈 모션 `fcl_*`(`chara~pcMot_fcl`, 상주): `fcl_blink00`(pc01 380프레임 루프, 눈꺼풀 뼈 4개 RotateX 곡선), `fcl_default00`·`happy00`·`sorrow00`·`smile00`·`sad00`·`standard00`·`blink01`·`blink02`(1프레임 포즈) [데이터]. `face_param.json` = `fcl_notice00, happy00, sad00, sorrow00, dizzy00, bad_item00, close_tight00` 7개 이름 목록이다 [데이터]. 독립 슬롯의 실제 사례는 NPC `ComPataPataActor`다: `FaceSlot`을 추가/조회(@main 0x7100498604~0x7100498644), 핸들을 +0x688에 보관하고 `PlayFaceAnim(index)` @0x7100499fc0이 정적 이름표(@0x71019f5f40: 0=`fcl_default00`, 1=`fcl_happy00`)를 `ActorAnimationSlot::Play` @0x710049a07c로 보낸다 [판독]. 이는 슬롯 이름 목록 7개를 로드하는 경로가 아니며 **22명 공통 `face_param` 소비자·겹침 우선순위는 미확정**이다. main과 NRO 문자열 대조에서 `face_param` 직접 참조를 찾지 못했으나 미사용으로 단정하지 않는다. `CharacterDataModule::LoadData` @0x71001d5a0c에서 확인한 입력도 characterlist·pcMotionArcList이며 FaceParam 소비는 연결되지 않는다. 7개 이름 데이터 자체에는 슬롯 번호·모드·겹침 우선순위가 없어 NPC FaceSlot이나 blink 묶음 순서만으로 이를 채울 수 없다.
2. 몸 모션마다 딸린 `.ftsb.fmab` = body_m 셰이더 파라미터 애니다. 눈동자 UV(`material_utility_parameter0/1`, `material_texture_srt1/2`)를 움직인다. 예: `rhy_knife_idle00` 상수 (0.0144, 0.09)·(2.0144, 0.09). swing은 v가 −0.160 → 0.090으로 20프레임 동안 변한다 [데이터].
3. 몸 모션의 `.fvbb`(뼈 표시)와 `.fclb.fmab`·`.fcmb.fmab`(색 애니 — 젖음 시작·끝 `co_wet_start00/end00` 등) [데이터]. `rhy_knife_*.fvbb`는 애니 뼈 0개다(전부 보임 고정).

### 4.3 actor::MotionArg (0x50 B) [판독]

기준 객체: `actor::MotionArg`. `ActorAnimationSlot+0x08`에 같은 배치로 들어 있다(슬롯 오프셋 = MotionArg 오프셋 + 8). 리스너의 해시맵 노드에는 +0x18에 들어 있다.

| +오프셋 | 타입 | 웹 권장 이름 | `Play(name)` 기본값 | 의미·근거 |
|---|---|---|---|---|
| 0x00 | string(24 B) | `name` | 이름 | `MotionArg::AnimationName` @0x710000b900이 복사 |
| 0x18 | StringViewHashPair{vt, ptr, len, **+0x30 hash**} | `nameHash` | FNV-1a 64 | 해시 비교로 같은 모션 판정 |
| 0x38 | u8 | `forceRestart` | 0 | 0이면 지금 재생 중인 모션과 해시가 같을 때 요청을 버린다 (FUN_7100022a80) |
| 0x39 | u8 | `randomStartFrame` | 0 | 1이면 시작 프레임 = 난수(0..FrameMax) (리스너) |
| 0x3A | u8 | `speedValid` | 0 → 재생 직전 1 | 1이면 슬롯 속도(+0x140) = `speed` (리스너). `Play(name)`도 1로 둔다. 그래서 이름만으로 재생하면 속도 1.0이 들어간다 |
| 0x3C | f32 | `startFrame` | 0.0 | 비루프 모션에서 넘어올 때의 시작 프레임(§6.4) |
| 0x40 | f32 | `speed` | 1.0 | 재생 속도 |
| 0x44 | f32 | `blendTime` | −FLT_MAX(0xFF7FFFFF) | 전이 시간. −FLT_MAX = 기본(리스너가 0.1로 바꿈). 단위 **초**(§6.5) |
| 0x48 | i32 | `transitionType` | 1 | `nn::bezel::AnimationTransitionType`. 4 = 크로스페이드(§6.5) |
| 0x4C | u8 | `transitionDefaultsInitialized`(설명용 이름) | 1 | `Play(name)`의 전이 기본값 초기화 래치. Actor 슬롯 +0x54(§6.5의 bezel 슬롯 +0x54와 다른 객체) |

`Play(name, float blend, AnimationTransitionType type)` @0x71000238dc는 `blendTime`·`transitionType`만 바꾼다.

`Play(name)` @0x71000237f8은 Actor 슬롯 +0x54가 0이면 1로 바꾸고 `{blend=−FLT_MAX, type=1}`을 +0x4C/+0x50에 함께 쓴다(@0x7100023838~). 이미 1이면 blend만 기본값으로 되돌리고 기존 type은 유지한다. 두 경로 모두 speedValid=1·speed=1이다 [판독]. +0x4C를 상태값이나 bezel blendMode로 읽으면 안 된다.

**mg1801 `MyUpdate`의 MotionArg** [판독 mg1801 @0x710000cb94~0x710000ccc8 디스어셈블]. 원 질문의 `local_44`·`local_3c`는 각각 +0x3C~0x43, +0x44~0x4B다.

| 필드 | 값 | 비고 |
|---|---|---|
| `local_44` = 0x3F800000_00000000 | +0x3C `startFrame` 0.0, +0x40 `speed` 1.0 | 바로 뒤에 +0x40 = `(float)GetBPM()/120.0f`로 덮어쓴다 |
| `local_3c` = 0x00000001_FF7FFFFF | +0x44 `blendTime` −FLT_MAX, +0x48 `transitionType` 1 | 기본값 |
| `local_3c` = 0x00000001_3E4CCCCD (SyncIdleMot) | +0x44 `blendTime` **0.2**, +0x48 1 | idle 재생이고 `Params.SyncIdleMot`(기본 0)일 때만 |
| `local_44` 하위 (SyncIdleMot) | +0x3C `startFrame` = `(float)(GetElapsedFrame() % 30)` | idle 길이 30과 같은 주기 |
| +0x38 | 1 | 항상 재시작 |
| +0x39 | 0 (SyncIdleMot 때 `strb wzr` 명시) | 난수 시작 끔 |
| +0x3A | 1 | 속도 적용 |
| +0x4C | 1 | |

### 4.4 actor::ActorAnimationSlot (0x170 B) [판독]

| +오프셋 | 웹 권장 이름 | writer | reader |
|---|---|---|---|
| 0x08~0x57 | `arg` (MotionArg) | `Play`, `EnqueuePlay` | 재생 함수 |
| 0x90/0x98/0xA0 | `owner` ComActorMotion 핸들 | 생성자 FUN_7100022420 | |
| 0xA8/0xB0/0xB8 | `slot` nn::bezel::AnimationSlot 핸들 | 생성자 | 모든 질의 |
| 0x130 | `interrupt` (SetInterruptFunction의 함수 객체) | `ComActorMotion::SetInterruptFunction` | `Play` |
| 0x140 | `speed` | `SetSpeed`, 리스너(speedValid) | 리스너, `SetConditionSpeed` |
| 0x144 | `conditionSpeed` (기본 1.0) | `SetConditionSpeed` | bezel 속도 = speed × conditionSpeed |
| 0x148~ | `pendingArgs` (해시 → MotionArg) | FUN_7100022a80 | 리스너(쓰고 나서 지운다) |

`ComActorMotion`(0xD8 B): +0x28 ComAnimator 핸들, +0x40 주 슬롯, +0x58 슬롯 맵(이름 해시 → 슬롯), +0x80 접두 문자열(`SetPrefix`), +0x98 idle 난수 맵(해시 → bool), +0xC0 AnimatinType 벡터 [판독].

### 4.5 nn::bezel::AnimationSlot 재생 상태 [판독 main @0x71008135f4]

| 값 | 이름(웹) | 조건 |
|---|---|---|
| 0 | `None` | 노드 없음 |
| 1 | `Playing` | 아래 아님, 일시정지 아님 |
| 2 | `Paused` | 슬롯+0x1B4 ≠ 0 (`SetPauseEnabled`) |
| 3 | `Finished` | **루프가 꺼진 노드**에서: 속도(+0x50) ≥ 0이고 frame ≥ FrameMax, 또는 속도 < 0이고 frame ≤ 0 |

`IsFinished()` = 상태 == 3이다(@0x7100024094). **루프 모션은 끝나지 않는다.** 루프 여부는 `AnimationNode::IsLoopEnabled`이고, 클립 초기값은 FSKA flags bit2에서 온다 [판독 §6.6].

### 4.6 bex::ComHeading [판독]

기준 객체: `bex::ComHeading`. 실제 값은 `ComHeading+0x28`이 가리키는 구현체(아래 "impl")에 있다.

| impl+오프셋 | 웹 권장 이름 | 세터 | 원천(PC) |
|---|---|---|---|
| 0x58 | `headBone` | FUN_71001bf41c("head_aimcont") | 고정 |
| 0x5C / 0x60 / 0x64 | `chinBone`, `neckBone`, `spineBone` | "chin", "neck_roll", "spine00" | 고정 |
| 0x40~ | `skeletalSlot` | `SetSkeletalAnimationSlot(AnimationSlotName_Main)` | |
| 0x70 | `limitMin` (rad xyz) | `SetLimitAngleMin` | `head_min_x/y/z`(도 → ×0.017453292) |
| 0x80 | `limitMax` (rad) | `SetLimitAngleMax` | `head_max_*` |
| 0x90 | `offsetAngle` (x만) | `SetOffsetAngle` | `head_offset_x`(도→rad) |
| 0xA0 | `chinCoef` | FUN_71001bf648 | `head_chincoef` |
| 0xA4 / 0xA8 / 0xAC | 뒤 yaw 폭 / 뒤 방향 원뿔 한계 / 보정 분기 각(rad) | `SetBackAngleDeadZoneDegree` 등 | 기본 20° / 60° / 40°, §6.8 |
| 0xB0 | `speedCoef` | `SetSpeedCoef` | |
| 0xB4 | `linearSpeed` | `SetLinearSpeed` | |
| 0xB8 | `headLookWeight` | `SetHeadLookWeight` | `head_weight`(마리오 0.5). mg1801은 0.3으로 덮어씀 |
| 0xBC | `eyesLookWeight` | `SetEyesLookWeight` | |
| 0xC0 / 0xC4 / 0xC8 / 0xC9 | 눈 보정 켬(1) / 따라가기 모드(4) / 슬롯 속도 반영(1) / neck_roll 보정(1) | 생성자 `FUN_71001bee00` | §6.8 |
| 0x150 + i·0x30 (i = 0, 1) | 눈 i: 재질 파라미터(MaterialParam) | FUN_71001bf66c | `eye{i}_material`, `eye{i}_shaderparam` |
| 0xD0/0xD8/0xE0/0xE8/0xF0 + i·0x40 | `eye[i].uvOffset / uvScale / uvMin / uvMax / uvRot` | FUN_71001bf820/838/850/868/880 | `eye{i}_t_offset_*`, `_t_scale_*`, `_t_min_*`, `_t_max_*`, `_t_rot` |
| 0x1B0 | `targetType` 0 None / 1 Position / 2 Entity / 3 Direction / 4 Camera | `SetTarget*` | 5 이상이면 abort |
| 0x1C0~0x1D0 | `target` (위치·방향 또는 엔티티/카메라 핸들) | `SetTarget*` | |
| 0x1D8 | `targetBone` (Entity 대상, 기본 −1) | `SetTargetLookAtEntity(e, bone)` | |
| 0x1E0 | `targetSpeedScale` | 모든 `SetTarget*`가 1.0, `SetSpeedScaleForCurrentTarget` | |
| 0x234 / 0x235 | `headLookEnabled` / `eyesLookEnabled` | `SetHeadLookEnabled` / `SetEyesLookEnabled` | |

`characterlist.json` 레코드 오프셋(0x940 B 중): head_min +0x7A0, head_max +0x7AC, head_offset_x +0x7B8, head_weight +0x7BC, head_chincoef +0x7C0, 눈 i 블록 +0x7C8 + i·0x68 {material +0, shaderparam +0x20, t_offset +0x40, t_scale +0x48, t_rot +0x50, t_min +0x58, t_max +0x60} [판독 접근자 FUN_71001d672c~FUN_71001d69e0]. JSON 키와의 짝은 기록 순서로 맞췄다 **[추정]**.

마리오 값 [데이터]:

| 항목 | 값 |
|---|---|
| head_min / head_max (도) | (−40, −60, −5) / (20, 60, 5) |
| head_offset_x / head_weight / head_chincoef | 0 / 0.5 / 0 |
| eye0 | body_m `material_utility_parameter1`, offset (2, 0), scale (0.3, 0.1), min (1.98, −0.1), max (2.35, 0.22), rot 0 |
| eye1 | body_m `material_utility_parameter0`, offset (0, 0), scale (0.3, 0.1), min (−0.35, −0.1), max (0.02, 0.22), rot 0 |

### 4.7 nn::bezel::ComPhysicalAnimation [판독 + 데이터]

| 함수 | 주소 | 동작 |
|---|---|---|
| `SetEnabled(bool)` | main @0x71004f5000 | 켜기/끄기 |
| `RequestTeleport()` | @0x71004f4d58 | 다음 갱신에서 `Teleport` 예약(플래그 1개) |
| `Teleport()` | @0x71004f4940 | 강체들을 현재 애니 포즈로 옮긴다(속도 초기화) **[추정: 이름 + 강체 순회]** |
| `ApplyScale()` | @0x71004f33a0 | 엔티티 스케일 y가 바뀌면 강체·조인트 위치를 비율만큼 늘린다 |

- 원천 데이터는 `chara~pcNN/…/model/pcNN_*.apx`(PhysX 4.1 컬렉션, [06 §5](06_scene_data.md))다. 11명에게만 있다: pc03, 04, 08, 11, 12, 13, 14, 50, 52, 56, 61 [데이터].
- **컴포넌트 생성 기본값은 enabled=1·teleportPending=1** [판독 main @0x71004f1ee4~0x71004f1ee8: `mov w8,#0x101; str w8,[x19,#0x60]`, 다른 생성 경로 @0x71004f1f8c도 같음]. 갱신 @0x71004f350c는 +0x60, @0x71004f3620은 +0x61을 검사한다. 따라서 컴포넌트가 붙은 캐릭터는 기본 켜짐이고 mg1801 KOOPA_JR의 끄기가 예외다. `.apx` 없는 캐릭터까지 물리가 있다는 뜻은 아니다.
- `RequestTeleport`는 +0x61=1, `Teleport`는 현재 애니 포즈로 강체를 옮기고 +0x61을 0으로 지운다(@0x71004f4a5c). 이 예약은 다음 활성 갱신에서 소비된다 [판독].
- 생성 후 활성은 고정값이 아니다. `FUN_71004f3780`은 준비 조건을 +0x5C 비트 마스크에 모으고 **popcount=5일 때 +0x60=1**로 갱신한다(@0x71004f3940~0x71004f3974). 스케일·슬롯 상태도 그 검사에 들어간다. 다섯 비트의 판정은 다음과 같다 [판독: [활성/부모 C](../../../analysis/decomp/character_ftrg_c_runtime.c), [노드 user data C](../../../analysis/decomp/character_ftrg_c_callbacks.c), [요청 비트 C](../../../analysis/decomp/character_ftrg_c_sound.c)].

| +0x5C 비트 | 활성 조건·쓰기 근거 |
|---|---|
| 0 | `SetEnabled(v)`의 요청 `v&1`(@0x71004f5000) |
| 1 | 이벤트 `0x5f454e0d`에서 1, `0x5f454e0e`에서 0(@0x71004f47b0); 이벤트의 상위 발생 주체 이름은 미확정 |
| 2 | `abs(Entity.scale.y−component[+0x58])<1e−6`(@0x71004f3780) |
| 3 | Animator 노드 순회 중 `bezel_physical_animation` user data의 첫 int가 0인 노드가 **하나도 없음**(@0x71004f6de8). 속성 없음은 허용, Animator 없음도 1 |
| 4 | `ComAnimator[+0x23E]==0`(@0x71004f3780); Animator 없음은 1. 이 플래그를 pause로 명명할 근거는 부족 |

  `popcount(mask)==5`가 바뀔 때 boneIndex≠−1·role≠0 레코드의 collision을 함께 Enable/Disable하고, 다시 활성되면 +0x61=1로 포즈 동기화를 예약한다. 따라서 API 요청 비트 하나와 실제 +0x60 활성 상태를 같은 값으로 취급하지 않는다.
- **APX→본 연결** [판독]: `FUN_71004f5550`은 collision 생성 `FUN_7100960ba0`의 이름을 `FUN_71004f4010`에 넘긴다(@0x71004f5668~0x71004f5674). 후자는 stride **0x48** 레코드에 handle(+0), 복사 이름(+0x28), **`ComModel::FindBoneIndex(name)` 결과(+0x40, 없으면 −1)**를 저장한다(@0x71004f41b0). +0x44는 collision+0x274가 참이면 0, 아니고 +0x275가 참이면 1, 둘 다 거짓이면 2다. 단순 파일 순서나 glTF node 번호로 본을 선택하지 않는다.
- **스켈레톤 부모 레코드** [판독 `FUN_71004f2110`]: boneIndex≠−1·role≠0마다 `SkeletonPose::GetBoneParentIndex` @0x71006dd430으로 부모 본을 찾고, 그 boneIndex와 같은 물리 레코드의 collision weak handle을 +0x10/+0x18/+0x20에 저장한다(없으면 0). 아래 Constraint actor0/1 연결과 별도의 관계다.
- **11명 전수 대조** [데이터]: 각 APX extra data의 길이 접두 actor 이름을 원본 FRES `boneIndex`가 보존된 공용 `assets/chara/pcNN/*.glb`와 대조했다. **RigidDynamic 81개 전부 이름 일치, Constraint 44개**다. 아래 `[n]`은 원본 boneIndex이며, 화살표는 Constraint의 actor0→actor1 참조이지 스켈레톤 부모 관계가 아니다.

| pc | RigidDynamic 이름[원본 boneIndex] | Constraint 연결 |
|---|---|---|
| 03 | COL_ground[11], skirt_all[28], spine00[34], COL_general[35], head_aimcont[73], hair_1[88], hair_2[89] | spine00→COL_general; head_aimcont→hair_1→hair_2 |
| 04 | COL_ground[11], spine00[34], COL_general[35], head[72], head_aimcont[73], hair[86] | spine00→COL_general; spine00→head→head_aimcont→hair |
| 08 | spine00[25], R/L_upperarm[44/27], head_aimcont[61], R/L_forearm[45/28], R_kpc_hair_1/2/3[65/66/67], L_kpc_hair_1/2/3[62/63/64] | head_aimcont→R_kpc_hair_1→2→3; head_aimcont→L_kpc_hair_1→2→3 |
| 11 | COL_ground[11], pelvis[13], spine00[37], head_aimcont[86], rz_hair_B_1/2/3[103/104/105] | head_aimcont→rz_hair_B_1→2→3 |
| 12 | COL_ground[2], R/L_thigh[14/5], spine00[23], dnky_tie_all[73], dnky_tie_1/2/3[74/75/76] | dnky_tie_all→dnky_tie_1→2→3 |
| 13 | head_aimcont[67], R/L_ribbon[69/68] | head_aimcont→{R_ribbon,L_ribbon} |
| 14 | COL_ground[11], pelvis[13], spine00[46], COL_general[47], R/L_upperarm[67/49], head_aimcont[86], hair_1/2/3[101/102/105], R/L_side_hair[104/103] | pelvis→spine00→COL_general; head_aimcont→hair_1→hair_2→{R_side_hair,L_side_hair,hair_3} |
| 50 | COL_ground[2], spine00[24], head_aimcont[68], kp_R/L_hair[84/83], kp_hair1_1/2[85/86], kp_hair2_1/2[87/88], kp_hair3_1/2[89/90] | head_aimcont→{kp_R_hair,kp_L_hair,kp_hair1_1→1_2,kp_hair2_1→2_2,kp_hair3_1→3_2} |
| 52 | COL_ground[2], head_aimcont[38], cap[40] | head_aimcont→cap |
| 56 | COL_ground[2], kpj_mask_a_root[63], kpj_mask_a_R/L_knot[71/70], head_aimcont[51], kpj_hair1[60], kpj_hair2_1/2[61/62] | kpj_mask_a_root→{kpj_mask_a_R_knot,kpj_mask_a_L_knot}; head_aimcont→{kpj_hair1,kpj_hair2_1→2_2} |
| 61 | shell[70], head_aimcont[55], hair_3[69], hair_2[68] | head_aimcont→{hair_3,hair_2} |

- **APX 내부 ref→manifest index**를 사용했다: `USER_1025+0x10→EXT_261`, `EXT_261+0x60→Constraint`, `Constraint+0x10/+0x18→actor0/actor1`. pc03의 USER indices 24/25/26→EXT 19/21/23→Constraint 18/20/22→actor (9,11)/(13,15)/(15,17)로 위 세 연결이 재현된다. `groundPlane`(RigidStatic), `*Shape`, `*Constraint` 이름을 본으로 매핑하지 않는다. USER+0x18의 0/6 의미·D6 제한/감쇠 수치 전체는 아직 부족하다.
- **양방향 포즈 갱신** [판독]: `FUN_71004f3a10`은 +0x40=−1 또는 role=0을 건너뛰고 collision+0x274/+0x275가 모두 0인 본의 월드 포즈를 collision transform 경로 `FUN_710062e8bc`로 보낸다(@0x71004f3acc~0x71004f3cf4). 반대 `FUN_71004f2910`은 `Collision::GetTransform` @0x7100600334, 부모 본 조회/월드 변환 @0x71006dd430/0x71006dd520, 부모 기저 역변환·스케일 보정 뒤 `SetLocalMtxRt` @0x71004f2c08을 호출한다. 새 물리 솔버를 만들 근거와 모델 본 연결 근거는 구분한다.

### 4.8 이동·충돌·배치의 기존 판독 재사용

캐릭터별 모델·애니 문제와 ComActor 공통 이동 규칙을 분리한다. `MatterType=2`의 `main @0x71002b2e00` actorparam 소비는 [mg0101 §6.5](../minigame/mg0101.md)와 [plaza_3d §3.5](../shell/plaza_3d.md)에서 완료됐다. 행 `i`는 싱글턴 `+0x30+0x10·i`: 행0/1의 6/2 → Actor +0x2D0/+0x2CC, 행2의 40 → +0x2FC, 행3~5의 360/1100/85° → +0x2D4/+0x2D8/+0x2DC, 행6~8의 180/720/85° → +0x2E0/+0x2E4/+0x2E8, 행32의 0.8 → +0x2EC다. mg0106의 전용 크기·반경을 다른 장면에 일반화하지 않는다. 이동·접지·레이블과 형상 소비는 [mg0912 §6](../minigame/mg0912.md), [11_moving_collision](11_moving_collision.md)를 따른다. 캡슐 높이·비균일 스케일의 미완료 소비는 여기서 재확정하지 않는다.

결과 무대의 폭 누적 배치·KOOPA 보정과 A 재생/B 큐는 [minigame_result §6.6·§6.8](../shell/minigame_result.md)에서 해소한다. 광장 `Sub` 슬롯의 `co_look02/co_nod00`도 [plaza_3d §3.5](../shell/plaza_3d.md)에 판독돼 있다. 이 사례가 `face_param.json` 7개 표정의 슬롯을 증명하지는 않는다.

## 5. 상태 전이와 전체 수명

### 5.1 모션 슬롯 수명 [판독]

```
(없음) --Play--> Playing --frame>=FrameMax(비루프)--> Finished
   Playing --SetPauseEnabled(true)--> Paused --false--> Playing
   어떤 상태든 --Play(다른 이름 | forceRestart)--> Playing(새 모션)
   Play(같은 이름, forceRestart=0) → 변화 없음(진행 중인 프레임 유지)
```

Finished 상태에서는 비루프 프레임 컨트롤러가 0~FrameMax로 자르므로 끝 포즈를 유지한다 [판독 §6.6]. 다음 `Play`가 올 때까지 그대로다.

### 5.2 mg1801 Player 모션 [판독 mg1801 @0x710000c9c0]

| 필드 | 값 |
|---|---|
| `Player+0xA8 motion` | 0 idle / 1 swing |
| `Player+0xAC motionReq` | −1 없음 / 0 / 1 |

1. `UpdateAttack`: 휘두름 입력 프레임에 `motionReq = 1`. 판정 결과와 무관하다.
2. `MyUpdate` 끝부분:
   - `motionReq == −1`이고 `motion == 1`이고 `IsFinished()`이면 `motionReq = 0`.
   - `motionReq ≠ −1`이면 `Play(MotionArg)`(§4.3), `motion = motionReq`.
   - 마지막에 `motionReq = −1`.
3. `inputEnabled == 0`이어도 2는 매 프레임 돈다. 연습 전·Finish 뒤에도 휘두름이 끝나면 idle로 돌아간다.
4. 휘두름 쿨다운은 `beatToSec(1,1)` = 반 박이다(120 BPM 15프레임). swing 20프레임보다 짧다. 그래서 **휘두르는 중에 다시 휘두르면 swing이 0프레임부터 다시 시작한다**(forceRestart 1).
5. `Finish`: `inputEnabled = 0`, `ComHeading::SetTargetNone()`. 시선 기능을 끄는 것이 아니라 대상을 없앤다. mg1801.md §5.2의 "머리 추적을 끈다"는 이 뜻이다 [판독 @0x710000d580].
6. `Ending`: 칼·의자 `SetVisible(false)` → `ComPhysicalAnimation::SetEnabled(true)` → `RequestTeleport()` [판독 디스어셈블 @0x710000d6e8, 0x710000d740, 0x710000d858 `mov w1,#0x1`].

## 6. 계산식·조건·상세 의사코드

### 6.1 이름 해시 [판독 + 데이터]

모든 모션·슬롯 이름은 `nn::bezel::StringViewHashPair`로 다닌다. 해시는 **FNV-1a 64**다.

```ts
function fnv1a64(s: string): bigint {           // basis 0xcbf29ce484222325, prime 0x100000001b3, 바이트(UTF-8) 단위
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(s)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h;
}
```

| 이름 | 원본 상수 | 계산 |
|---|---|---|
| `rhy_knife_idle00` | 0xE7AA2E3319496287 (mg1801 @0x710000b438 movk) | 같음 |
| `rhy_knife_swing00` | 0xB47E176ED5263B75 (@0x710000b49c) | 같음 |
| 빈 문자열 | 0xCBF29CE484222325 (`GetCurrentAnimation` 기본) | |

MyUpdate는 이름 표 `PTR_s_rhy_knife_idle00_7100037a48[motion]`에서 이름을 꺼내 같은 루프로 해시를 계산한다 [판독 @0x710000cc10].

### 6.2 AddAnimation과 파일 해석 [판독]

`ComActorMotion::AddAnimation(nameHash, fileSuffix, registerIdle, AnimatinType, bool, bool)` @0x710002d7d0:
- `actor::Util::AddAnimation`(@0x7100036490)이 경로 = **접두(+0x80, `SetPrefix`) + 이름**으로 ComAnimator에 애니를 붙인다.
- 접두는 `characterlist.json`의 `motion filename prefix[p]`다(예 `motion/pc01_`). 기준 폴더는 `base directory`(`chara/pc/pc01_mario`)다. 그래서 `rhy_knife_idle00` → `chara/pc/pc01_mario/motion/pc01_rhy_knife_idle00.{fskb,fvbb,fshb,ftsb.fmab}`가 된다 [데이터: 파일 존재. 접두를 붙이는 쪽 코드는 판독].
- `registerIdle == 1`이면 이름에 `"_idle"`이 들어 있는지를 idle 맵(+0x98)에 저장한다. mg1801은 둘 다 1로 넘긴다 → `rhy_knife_idle00`: true, `rhy_knife_swing00`: false.
- 파일이 어느 아카이브에 있든 전역 경로로 찾는다. mg1801은 `chara~pcMot_rhy`(pcMotionArcList `mg1801: [rhy]`)를 싣는다. 리듬 공용 장면은 `rhy`·`rc`도 싣는다([06 §1.5](06_scene_data.md)).

### 6.3 Play: 같은 모션 판정 [판독 FUN_7100022a80]

```ts
play(arg) {
  if (arg.name.length === 0) return;                       // ComActorMotion::Play
  if (slot.interrupt && !slot.interrupt(arg, slot)) return;  // 슬롯+0x130 (mg1801은 설정 안 함)
  if (!arg.forceRestart && current && current.hash === arg.hash) return;
  pendingArgs.set(arg.hash, copy(arg));
  animator.play(slot, clip(arg.hash), { blend: arg.blendTime, type: arg.transitionType });
}
```

### 6.4 시작 리스너: 속도·시작 프레임·블렌드 [판독]

```ts
onStart(slot, newNode, transitionArg) {
  const a = pendingArgs.get(hashOf(newNode)); if (!a) return;
  const node = slot.currentNode;                 // 아직 이전 노드: 컨트롤러 호출 순서 판독
  const hasNode = node != null;
  const loopPrev = hasNode ? node.loop : true;   // 노드 없으면 1
  transitionArg = { blend: a.blendTime, type: a.transitionType };
  if (hasNode) {
    if (a.blendTime === -FLT_MAX) transitionArg.blend = 0.1;              // 0x3DCCCCCD
    if (userData(prevSkeletal).has('shift') && userData(newSkeletal).has('shift_rec')) transitionArg.blend = 0;
  } else transitionArg.blend = 0;
  if (a.speedValid) slot.speed = a.speed;                                 // +0x140
  bezelSlot.speed = slot.speed * slot.conditionSpeed;
  let f;
  if (a.randomStartFrame) f = rand(uint(newNode.frameMax));
  else if (loopPrev) f = idleRandom.get(hash) ? rand(uint(newNode.frameMax)) : 0;   // 맵에 없거나 false → 0
  else f = a.startFrame;
  newNode.setFrame(f);
  pendingArgs.delete(hash);
}
```

- 난수: 네트워크 모드 −1(오프라인)이면 `FUN_7100031b8c`(RandModule 구현체 +0x28→[0] = 비동기 계열). 온라인 동기 중이면 `[1]`(동기 계열)이다. 인자는 `(uint)FrameMax`다 [판독]. 난수 함수 자체는 [01_core.md](01_core.md)의 RandModule이다.
- **`loopPrev`는 이전 노드의 플래그** [판독]: Actor 슬롯 생성 @0x7100022420 → `FUN_7100818200`(ComAnimator +0x28 컨트롤러) → 리스너 등록 `FUN_7100105d80`. 컨트롤러 vtable +0x38의 실제 함수는 **`FUN_7100105ea0`**(`FUN_710080ade4`는 가상 호출 래퍼)다. @0x7100105ee0~0x7100105efc의 리스너 반복 호출이 @0x7100105f18의 이전 노드 읽기·mpat 조회와 @0x7100106250의 전이 적용보다 앞선다.
- 위 의사코드는 리스너 출력까지다. mpat가 맞으면 **그 뒤** blend/type과 새 시작 프레임을 다시 정한다(§6.5). 아래 표는 리스너가 정한 값이며 최종 값과 구분한다.

mg1801에 적용하면 이렇다(SyncIdleMot 기본 0).

| 전이 | loopPrev | 시작 프레임 |
|---|---|---|
| 생성: (없음) → idle | 1 | 난수 → 바로 `SetFrame(0)` = **0** |
| idle → swing | 1 (idle 루프) | idle 맵[swing] = false → **0** |
| swing → swing (재휘두름) | 0 | `startFrame` = **0** |
| swing → idle | 0 | `startFrame` = **0** (SyncIdleMot면 `GetElapsedFrame() % 30`) |

### 6.5 전이 블렌드·mpat 우선순위 [판독 + 데이터]

`FUN_7100813940`은 `type==1 && bezelSlot.mode(+0x54)==2`를 type 4로 바꾼다. `type==4 && blend>0`이면 이전 노드를 보존하고 새 weight=0·rate=1/blend, 이전 weight 감소율=−1/blend를 둔다(`FUN_7100813bf0`). 그 외는 즉시 교체한다. bezel 슬롯 생성 @0x7100812fc8의 64비트 쓰기 `0x000000003F800000`으로 **speed(+0x50)=1, mode(+0x54)=0**이 확정된다. Actor 슬롯 생성자 @main 0x71000225cc~0x71000225e0도 `ComAnimator::AddSlot`에 mode=0과 별도 flag.bit0를 넘긴다. **mode=2 실제 호출**은 `menu00::SequenceStartQuest::CancelImpl` @menu00 0x710006e4c8~0x710006e4cc다. `GetMotion`→`GetAnimationSlot("Sub")`(@0x710006e474)→bezel 슬롯(@0x710006e4a0)→`SetBlendMode(2)` 순서이며 PLT 0x71000e42c0/relocation 0x1DA7D0의 원본 심볼로 확인했다. mg1801에는 이 setter import가 없으며, 다른 장면의 Sub 설정을 mg1801 Main에 전용하지 않는다.

**시간 단위는 초**: weight 갱신 @0x7100814644~0x7100814668은 `clamp(fma(rate, deltaFrames/60, weight),0,1)`이다. `FUN_710080b834`도 elapsed(+0x50)에 `deltaFrames/60`을 더해 duration(+0x40)으로 자른다. 슬롯 전이 시간은 슬롯 재생 속도를 곱하기 전 context를 쓴다(@0x71008145b0~). `EndTransition` @0x71000242b0의 `elapsed/blend>=1`과 일치한다. 보존된 이전 노드도 갱신되며 ‘이전 frame 고정’은 웹 근사다.

컨트롤러 `FUN_7100105ea0`은 리스너 후 등록 전이표를 조회한다. 표 등록 순서는 [06 §2.5](06_scene_data.md)의 장면/캐릭터 → 장면/공통 → sys/캐릭터 → sys/공통이며, `FUN_7100106640`은 목록 앞부터 찾아 일치 행을 반환한다. 소비 필드는 다음과 같다.

| 항목 +오프셋 | 소비 식·순서 | 주소(main) |
|---|---|---|
| +0x10 `a`(signed 판정) | 요청 type≠0이고 a≥0이면 **blend=a/60초**로 덮음; 음수면 기존 blend 유지 | @0x7100106018~0x7100106040 |
| +0x14 `b` | 같은 조건에서 b≠−1이면 type=b; −1은 유지 | @0x7100106044~0x7100106050 |
| +0x18·+0x1C `α,β`(f32 둘) | 노드 교체 뒤 `newFrame=FrameMaxNew·fma(α,oldFrame/FrameMaxOld,β)`; 이전 노드 없음 또는 둘 다 0이면 0 | @0x7100106270~0x71001062c0 |
| +0x20 / +0x28 | 중간 전이 모션 / 컨트롤러의 `add` 슬롯 모션 경로; 이름 포인터가 없으면 건너뜀 | @0x7100106058~0x710010622c / @0x71001062c4~ |

기존 파서의 `c=f32, d=u32` 중 **d는 소비 시 f32 β로 읽힌다**. 문자열 포맷 자체는 06을 재사용한다. type=0은 위 a/b 덮기를 건너뛰지만 뒤의 시작 프레임 처리는 별도다. 일치 행이 없으면 리스너 값이 유지된다.

`mg1801_pc.mpat` [데이터]:

| from → to | a | b | α | β | blend 결과 |
|---|---|---|---|---|---|
| swing → idle | 1 | −1 | 0 | 0 | 1/60초 |
| idle → swing | 1 | −1 | 0 | 0 | 1/60초 |
| swing → swing | 0 | −1 | 0 | 0 | 0 |

따라서 일치 행은 리스너 기본 0.1초·SyncIdleMot 0.2초보다 우선하고, 최종 시작 프레임도 **0으로 다시 설정**한다(생성 시 SetFrame(0)은 별도 후속 호출). 최종 type=1이라면 mode=0에서 즉시, mode=2에서 한 60Hz 프레임의 크로스페이드다. mg1801의 확인된 생성·Play 경로는 mode=0이다. 장면 밖 간접 변경까지 전수 확인한 결과는 아니므로 1/60초 mpat 값만으로 가시적인 크로스페이드를 단정하지 않는다.

### 6.6 프레임 진행·FrameMax·큐 순서 [판독]

`FUN_710080ce30~0x710080ce94`는 `g_FrameStep(+4)`(GOT @0x7101a84100 → @0x7101bc5d08)의 **deltaSeconds×60**을 작업자 +0x20에 쓴다. 작업자 `FUN_710080d8cc` → `FUN_710081cf30`은 이를 context+0x10에 전달한다. 슬롯 `FUN_71008144bc` @0x71008144f8은 `slotSpeed=speed·conditionSpeed`를 곱한다. 스켈레탈 노드 `FUN_7100696fc8`은 여기에 `ModelModule::GetAnimationSpeed`(@0x71006bc66c, module+0x78)를 곱해 프레임 컨트롤러에 더한다.

```
deltaFrames = f32(deltaSeconds * 60)
clipDelta = f32(f32(deltaFrames * slotSpeed) * modelAnimationSpeed)
next = f32(frame + clipDelta)
frame = loop ? wrap(next, 0, FrameMax) : clamp(next, 0, FrameMax)
isFinished = !loop && (slotSpeed >= 0 ? frame >= FrameMax : frame <= 0)
```

전역 모델 속도는 `SetAnimationSpeed` @0x71006bc664로 변경 가능하다(직접 호출 @0x7100718a60). 위 식에서 이를 임의로 1로 없애지 않는다. 고정 1/60초·전역 속도 1일 때만 기존 `frame+=speed·conditionSpeed`로 줄어든다. 가변 dt를 쓰는 경로 자체는 확정이다.

**FrameMax = FSKA FrameCount**: 노드 실제 vtable(@0x7101a04f60)+0xC8 → `FUN_7100696ea0` → node+0x78의 frameController+8(endFrame). `FUN_710077bf70`가 리소스 +0x40의 FrameCount를 `FUN_710076e718`에 넘겨 f32 endFrame으로 둔다. 루프는 리소스 +4 flags의 bit2다. 비루프 callback @0x710076e53c는 [0,N] clamp, 루프 @0x710076e550는 범위를 감는다.

**진행 뒤 큐 소비**: 슬롯은 현재 노드를 진행한 뒤 `FUN_71008140b0`에서 큐를 검사한다. 그러므로 갱신 전에 동기 `Play`로 교체한 노드는 당회 진행 대상이고, 이번 진행의 종료로 큐에서 새로 꺼낸 노드는 다음 회 대상이다. `FUN_710080fa7c`의 node+0x18 tick 비교는 같은 tick의 이중 진행을 막는다. 첫 렌더 포즈의 시점은 §8에서 구분한다.

### 6.7 mg1801 칼 모션 길이 [데이터 + 재구현 계산]

`web/tools/analysis/bfres_probe`로 22명 모두의 `chara~pcMot_rhy/…/pcNN_rhy_knife_*.fskb`를 읽었다.

| 모션 | FrameCount | Loop | 22명 공통 | 속도 BPM/120일 때 |
|---|---|---|---|---|
| `rhy_knife_idle00` | **30** | **루프** | 예 | 한 바퀴 = 30·120/BPM 프레임 = **정확히 1박** |
| `rhy_knife_swing00` | **20** | **비루프** | 예 | 끝까지 ≈ 20·120/BPM 프레임 = 2/3박 |

swing 길이(요청 프레임부터 idle을 다시 요청하는 프레임까지)는 `web/tools/analysis/character_verify/motion_ref.ts`로 계산했다. 프레임을 f32로 누적하고, IsFinished는 다음 프레임 MyUpdate에서 본다.

| BPM | 속도(f32) | swing 프레임 | 초 |
|---|---|---|---|
| 90 | 0.75 | 27 | 0.450 |
| 100 | 0.8333333 | **24** (double 계산이면 25) | 0.400 |
| **120** | **1.0** | **20** | **0.333** |
| 150 | 1.25 | 16 | 0.267 |
| 180 | 1.5 | 14 | 0.233 |
| 240 | 2.0 | 10 | 0.167 |

- 초기 회색 박스의 0.3초 근사와 달리, 표의 120 BPM 기준은 20회 진행(0.333초)이다. 일반식은 "f32 누적 프레임 ≥ 20이 되는 진행 횟수"다.
- mg1801의 BPM은 리듬 담당 결론상 120이다(파티·단독 모드. 롱 모드 후반만 180) — SHARED.md.
- 위 표는 기존 재구현 계산이다. 새 노드의 갱신 포함 조건은 §6.6으로 좁혔지만, 전역 모델 속도·게임 파이버에서 끝을 관찰하는 시점·첫 표시 포즈는 계산과 구분한다(§8).

### 6.8 시선 (ComHeading) [판독]

**AddHeading** @0x71002b4950:
1. 모델에 `head_aimcont` 뼈가 없으면 컴포넌트를 만들지 않는다.
2. 제어 뼈를 `head_aimcont`, `chin`, `neck_roll`, `spine00`으로 두고, 주 애니 슬롯에 건다.
3. PC면 `characterlist.json` 값으로 한계·오프셋·가중치·턱 계수·눈 두 개를 설정한다(§4.6). NPC면 같은 항목을 NPC 레코드에서 읽는다.

**mg1801 Player 생성자** [판독 디스어셈블 @0x710000b5fc~0x710000b744]:

```ts
heading.setHeadLookWeight(params.HeadLookWeight /* 0.3 */);
heading.setTargetNone();
switch (charId) {
  case 14 /* KURIBO */: head = false; eyes = true; break;
  case 19 /* TERESA */: head = false; eyes = false; break;
  case 18 /* KOOPA_JR */: physicalAnimation?.setEnabled(false); head = true; eyes = true; break;
  default: head = true; eyes = true;
}
heading.setHeadLookEnabled(head); heading.setEyesLookEnabled(eyes);
```

**대상** — `UpdateHeadControl` @0x710000d130, 입력이 켜진 프레임마다 `UpdateAttack` 뒤:

```ts
const pos = objectMan.getHeadTarget(lane);          // mg1801 ObjectManImpl::GetHeadTarget @0x71000047e0
if (!pos) heading.setTargetNone();
else heading.setTargetLookAtPosition({ x: player.translation.x, y: pos.y, z: pos.z });
```

`GetHeadTarget(lane)`: 살아 있는 채소(Obj+0x170) 중 레인 `[Obj+0x140, +폭)`를 덮는 첫 채소를 고른다. `k = (int)(elapsed(Obj+0x174)·60)`이 다음을 만족해야 한다.
- `(int)(beatToSec(0,1)·60) ≤ k` — 1박 이상 지남
- `(int)(beatToSec(1,1)·60) ≤ (int)(beatToSec(0,3)·60) − k` — 3박 중 반 박 이상 남음

그 채소의 엔티티 위치를 돌려준다. 120 BPM이면 k ∈ [30, 150]이다.

**머리·눈 갱신 식** [판독 `FUN_71001bea18`(이벤트) → `FUN_71001bfe08`·`FUN_71001c0c90`(대상) → `FUN_71001c1694`(머리) → `FUN_71001c5a58`(눈), 디컴파일 analysis/decomp/character_heading_*.c]:
- 이벤트 0x5f454e00: `SetLocalMtxRt(head_aimcont, 단위)`. **애니 클립에는 head_aimcont 트랙이 없으므로** 매 프레임 이렇게 되돌린 뒤 시선 회전을 넣는다(웹이 되돌리지 않아 회전이 누적되던 버그의 원인).
- 대상 회전 qT: 대상 위치를 head_aimcont 부모(head) 공간으로 바꾼 방향 d 로, +Z(상수 0x71015d1f50)에서 d 로 가는 최단 회전(1 + d.z ≤ ulp 면 (1,0,0,0)). 대상 없음·`headLookEnabled` 꺼짐이면 단위. 같은 대상의 캐릭터 공간 방향 z 를 impl+0x230 에 둔다. 마지막에 offset 각(+0x90, 모두 0)을 곱한다. 뒤쪽 분기의 입력·조건은 아래에 명시한다.
- 머리: q = slerp(단위, qT, w). w = 주 슬롯 모션(fskb) user data `headLookWeight` 가 0 이상이면 그 값(+0x23C, `FUN_71001c1380`), 아니면 +0xB8. 대상이 있으면 YZX 분해(x = atan2(2(wx−yz), w²−x²+y²−z²), y = atan2(2(wy−xz), w²+x²−y²−z²), z = asin 2(xy+zw)) → [min, max] 자름(chinCoef ≠ 0 이면 max.x 에 chin 각 보정) → ZYX 로 재구성(SinCos 표 항목 = cos 먼저로 봄 **[추정]**).
- 따라가기(+0xC4 모드, 기본 4): ω = acos(q·지난 q)/dt. ω ≤ 120°/s 면 임계 감쇠 스프링(k = min(2000, speedCoef^2.252184·17851.338), 감쇠 2√k, 쿼터니언 성분별, 정규화), ω ≥ 240°/s 면 선형(linearSpeed rad/s 로 회전), 사이는 둘을 (ω−120°/s)/(120°/s) 로 slerp. dt = 프레임 시간(1/60)·|주 슬롯 속도|(+0xC8)·대상 속도 배율(+0x1E0). 결과를 head_aimcont 로컬에 곱한다. neck_roll(+0xC9, pc54 만 있음)은 이어서 보정.
- 눈: +0xC0 = 1 이면 t = min(2, clamp(+0x230 + 1.8, 0, 2)·(eyesW − 머리 w)), qe = slerp(단위, qT, t)(1 을 넘으면 연장). qe 의 X(pitch)·Y(yaw)로 uv = t_offset + (yaw·cos r + pitch·sin r, −(−yaw·sin r + pitch·cos r))·t_scale 를 [t_min, t_max]로 자른다. 출력(+0x100/+0x140) += (uv − 출력)·0.6, 섞임비(+0xF8/+0x138) += 0.6·(1 − 섞임비). 대상 없음·눈 꺼짐이면 uv = t_offset, 둘 다 0.3 이고 섞임비는 0 쪽. 셰이더 파라미터(모드 2) = 모션 값 + (출력 − 모션 값)·섞임비, 그 값이 다음 출력.
- impl 기본값(`FUN_71001bee00`): limitMin/Max (−10°, −90°)/(10°, 90°), speedCoef 0.12, linearSpeed 5, headLookWeight 0.5, eyesLookWeight 1, 눈 따라가기 0.6, +0x230 = 1, +0x240 = 1.
- chin 본이 있고 coef≠0일 때의 보정 [판독 @0x71001c3780~0x71001c38b8]: `GetLocalMtxRt(chinBone=impl+0x5C)`에서 얻은 X각을 θchin, 자르기 전 머리 X각을 θhead라 하면 `effectiveMax.x = limitMax.x + chinCoef·max(0, θchin−θhead)`, 이어 각 성분을 `[limitMin,effectiveMax]`로 자른다. 턱 본 자체를 새 시선 회전으로 덮는 식이 아니다.
- 뒤쪽 진입 [판독 기존 `character_motion.c @0x71001bfe08`]: **캐릭터 공간** 단위 방향 c로 `a=acos(clamp(c·(0,0,−1),−1,1))`, `impl+0x230=−c·(0,0,−1)`를 정한다. 회전을 만들 방향 d는 **head 부모 공간**이다. `a≤A` 및 `π−|atan2(d.x,d.z)|<D`이면 지난 qP(+0x200)의 정면 벡터 x=`2(qP.x·qP.z+qP.w·qP.y)`의 **부호 비트만** d.x에 복사한다(@0x71001bfed0~1bffb4). d.x의 크기·d.y/z·a는 그대로다. A=+0xA8=60°, B=+0xAC=40°, D=+0xA4=20°이며 경계 D와 정확히 같으면 부호 유지 분기에 들어가지 않는다.
- 뒤 보정 회전: `qS=ShortestArc((0,0,1),d)`; `r=normalize₀((0,1,0)×d)`, `u=normalize₀(d×r)`, `qU=normalize₀(Q([r,u,d]))`다. normalize₀는 길이 0일 때 0을 반환한다. 기저는 열벡터 r/u/d이며 Q는 최대 대각 성분을 선택하는 행렬→quat 변환이다: 대각 후보 `(1+rx−uy−dz, 1−rx+uy−dz, 1−rx−uy+dz, 1+rx+uy+dz)` 중 최대(동률은 뒤 x→y→z→w)를 골라 해당 quat 후보를 정규화한다. w 후보는 `(uz−dy, dx−rz, ry−ux, 1+rx+uy+dz)`다. **a>A는 qS**(@0x71001bffd0~1c008c), **a<B는 qU**(@0x71001c0090~1c02d0), **B≤a≤A는 `t=(a−A)/(B−A)`로 qS→qU 보간**(@0x71001c02d4~1c089c). 따라서 B 경계는 qU, A 경계는 qS다.
- 보간은 dot의 부호를 맞춘 slerp다: `h=qS·qU`, `s=h<0?−1:1`, `θ=acos(|h|)`, `q=qS·sin((1−t)θ)/sinθ + s·qU·sin(tθ)/sinθ`. `|h|>1−FloatQuaternionEpsilon`이면 `(1−t)qS+s·t·qU`를 사용하며 **보간 뒤 정규화는 없다**. 원본은 atan/sin 계수 다항식과 NEON 역제곱근 보정을 쓰므로 위 식은 연산 의미이며 비트 단위 libc 동등성을 주장하지 않는다. 마지막 offset quat 곱(@0x71001c08a0 이후)은 세 분기 공통이며 현재 기본 offset=(0,0,0)이다.
- **neck 최종 기저·부호** [판독 @0x71001c4948~0x71001c4de0]: +0xC9=1, neck(+0x60)·spine(+0x64)≠−1일 때만 실행한다. `H`는 바로 앞에서 **head_aimcont에 쓴 로컬 RT 행렬**이고 `N`은 기존 neck 로컬 RT다. `det(H.rotation)==0`이면 neck 쓰기를 건너뛴다. spine 인덱스는 이 구간에서 존재 검사만 하며 spine 월드 기저를 곱하지 않는다. `qH=Q(inverse(H).rotation)`, `qN=Q(N.rotation)`를 각각 정규화한 뒤 **`q=qN+0.5·(qH−qN)`**로 섞는다(@0x71001c4d08~0x71001c4d18). 이 뒤의 재정규화·dot<0 부호 맞춤·slerp는 없다. 기존 C의 `GetLocalMtxRt` 반환형(16 B)이 실제 q0~q3 **64 B 반환**(@0x71006dd6d4~0x71006dd6d8)을 누락해 이 구간에 한해 기존 `character_heading_dis.c`와 상수 표를 대조했다.
  - `Q(M)`는 `a=(1+m00−m11−m22, 1−m00+m11−m22, 1−m00−m11+m22, 1+trace(M))`의 최대 성분을 선택한다(동률은 y→z→w 후순위가 이김). x/y/z/w 후보는 각각 `(a.x,m01+m10,m02+m20,m21−m12)`, `(m01+m10,a.y,m12+m21,m02−m20)`, `(m02+m20,m12+m21,a.z,m10−m01)`, `(m21−m12,m02−m20,m10−m01,a.w)`이고 선택한 후보를 정규화한다(@0x71001c4aa4~0x71001c4bec, 기존 N도 같은 식). `mij`는 행 i·열 j다.
  - `q=(x,y,z,w)`에서 neck의 최종 3×3은 `[[1−2(y²+z²),2(xy−zw),2(xz+yw)],[2(xy+zw),1−2(x²+z²),2(yz−xw)],[2(xz−yw),2(yz+xw),1−2(x²+y²)]]`이며 **로컬 이동은 0**으로 쓴다(@0x71001c4c20·0x71001c4d1c~0x71001c4de0). 보통 라이브러리의 자동 quaternion normalize를 추가하면 원본 식과 달라진다. pc54의 `neck_roll`과 다른 캐릭터의 본 없음 우회를 구분한다.
- mg1801 모션 중 `headLookWeight` user data(값 0.0)가 있는 것은 pc01·pc02·pc06·pc13 의 co_win00a/b 뿐이다 [데이터].

### 6.9 눈동자 UV·마스크 [판독 + 데이터]

`material_utility_parameter0/1`의 모션 값은 ftsb.fmab, 시선 합성은 §6.8의 `motion+(look−motion)·blend`다. body 좌표·DK/가봉 눈꺼풀의 기존 결과는 [charselect §12.11·§12.8](../shell/charselect.md)을 재사용한다. 추가 판독 근거는 기존 `analysis/mat/sass/pcNN__forward_plus__pN.vs.txt/fs.txt`와 `analysis/mat/prog/match.json`의 대응 프로그램이다.

**눈 정점 좌표**: P0/P1은 `material_utility_parameter0/1`, C는 원본 정점 색, `(u1,v1)`은 UV1이다. 공통 v11 출력은 **`uEye=u1−C.x·P1.x−C.z·P0.x`, `vEye=v1+C.x·P1.y+C.z·P0.y`** [판독: VS 출력식]. 따라서 P0/P1의 x 간격 2는 좌우 눈 좌표 영역을 고르는 식에 쓰이며 배열 layer 선택식과 다르다.

| 프로그램/캐릭터 | 눈 좌표 분기 |
|---|---|
| pc01·02·03·04·06·11(body p8)·14 | 위 식, C=C2 |
| pc05·07·12·13·50·61 | 위 식, C=C1 |
| pc53 | `(C1.x+C1.z)·(u1,v1)+(−C1.x·P1.x−C1.z·P0.x, C1.x·P1.y+C1.z·P0.y)` |
| pc56 | UV1 그대로 |
| pc54·58 | `(u1,0.5v1+0.5)` |

pc08·09·51·52·62 및 pc11의 별도 p16/p23 재질은 clamp/별도 식까지 같은 식으로 환원하지 못했다. 표의 확정은 읽은 body 프로그램 범위다.

**pc01 p8 fragment 연결** [판독]: `_a0=body_arr_alb`, `_a1=eye_arr_alb`, `_n0=body_arr_nml`, `_n1=eye_nml`은 원본 재질 sampler 대응이다. body/eye 알베도 array 좌표의 layer는 **`int(Model[0x2AC])`**, body normal array layer는 VS v16.y의 **C2.y**다. 시선 파라미터의 x로 layer를 고르는 현재 근사와 구분한다.
- 눈 영역 판정은 **`I = max(|2uEye−1|,|2vEye−1|)≤1 ? 1 : 0`**(FS의 v11 로드→절댓값→max→비교). eye albedo alpha=E.a, body alpha=B.a일 때 눈 normal의 섞임 계수는 **`M=I·E.a·(1−B.a)`**이며 body/eye의 normal.xy를 이 계수로 섞은 뒤 z를 복원한다. 사각 마스크 전체를 눈 RGB의 단순 alpha-over 식으로 일반화하지 않는다.
- RGB 경로는 눈 sample에 c1[0x10/0x14/0x18/0x1C]가 관여하는 별도 곱·합을 거친다. 그 상수 버퍼의 실제 바인딩과 특수 캐릭터/눈꺼풀 프로그램 전체가 아직 부족해 최종 색 합성을 확정식으로 적지 않는다. 현재 `preview3d.ts`와 mg1801의 근사는 이 부분의 원본 동등성 확인과 구분한다.

### 6.10 흔들림 본 [판독]

mg1801은 생성 때 KOOPA_JR를 끄고 Ending에서 `SetEnabled(true)`·`RequestTeleport`를 호출한다. 그 외 컴포넌트 기본값은 §4.7의 enabled=1이다. 따라서 ‘Ending에서만 활성’은 잘못된 일반화다. 결과 위치 이동 뒤 다음 활성 갱신에서 포즈·강체를 맞추는 예약과, APX 본 대응의 남은 근거를 §4.7에서 구분한다.

## 7. 애니메이션·이펙트·소리·카메라·에셋 연결

| 연결 | 내용 | 근거 |
|---|---|---|
| 모션 → 소리 | `rhy_knife_swing00` 프레임 2 `RC_RHY_KNIFE_SWING00` → `SQ_SE_MG1801_SWING`(훅 `NDcha_pos`), 프레임 3 `VO_RHY_KNIFE_SWING00` → `SQ_VOI_PCNN_JUMP`(pc62는 프레임 2, `ACTION_HIGH`). 일부 캐릭터는 프레임 15 `SE_FS_LAND_SML` | [05 §7.4](05_ui_input.md) [데이터] |
| 보이스 음소거 | 세팅 프리셋 `mg1800_cmn`이 캐릭터 액션 보이스를 MUTE | [04_sound.md](04_sound.md) |
| 진동 | `VB_MG1801_*`는 모션 이벤트가 아니라 코드(`UpdateAttack`)가 직접 | [05 §7.4](05_ui_input.md) |
| 소품 | `ca::rm::util::SetModelHook(player, "attach_R_hand", knifeEntity)` | mg1801 @0x710000b85c |
| 뼈 표시 | 모션별 `.fvbb`(rhy_knife는 변화 없음) | [데이터] |
| 재질 | 모션별 `.ftsb.fmab`(눈 UV), `.fclb/.fcmb.fmab`(색) | [데이터] |
| 카메라 | 캐릭터 선택 카메라 대상 `attach_head`, 회전 −25°, 거리 2(`chara_select_*`) | [데이터] |

FX 트리거의 애니 프레임 이벤트는 "프레임 f를 지나는 순간" 발생한다고 본다 **[추정: 05 §7.5]**. 속도가 1이 아니면 정수 프레임을 건너뛸 수 있다. 웹은 `이전 frame < f ≤ 새 frame`(루프면 감김 포함)으로 판정한다.

## 8. 다른 기능과의 상호작용

- **타이밍**: 파이버/컴포넌트의 기존 순서는 [01_core](01_core.md), [mg0101 §3.6](../minigame/mg0101.md), [mg0122 §3.5](../minigame/mg0122.md)를 재사용한다. `IsFinished`는 조회 순간까지 진행한 프레임을 읽는다. §6.6은 동기 Play와 큐 교체의 진행 순서를 확정했지만, mg1801에서 요청 뒤 평가·첫 렌더가 어느 포즈를 표시하는지까지의 완전한 타이밍 연결은 남는다. 기존 웹의 요청 프레임 진행 포함은 현재 구현 선택이다.
- **BPM 변화**: 속도는 생성 때(`SetSpeed`)와 매 `Play`(speedValid)에서만 정해진다. 재생 중 BPM이 바뀌면 다음 `Play`부터 반영된다 [판독].
- **시선과 애니**: ComHeading은 주 슬롯 애니 결과 위에 덮는다(`SetSkeletalAnimationSlot(Main)`). 로직(판정)에는 영향이 없는 화면 전용이다.
- **물리**: 화면 전용이다. 판정·위치 로직과 무관하다.
- **입력 차단**: `inputEnabled = 0`이어도 모션 상태기계는 돈다(§5.2).

## 9. 웹 포팅 구조와 구현 순서

### 9.1 현재 구현과 남은 정합성

| 현재 파일·공용 데이터 | 확인한 책임·한계 |
|---|---|
| `script/games/mg1801/view/character.ts` | 모델 인스턴스·모션/shape 채널·blink·시선·칼 부착. MPAT 프레임 표를 사용하지만 이전 포즈 고정과 재질 보정은 원본과 차이가 있음 |
| `script/shell/charselect/preview3d.ts` | 캐릭터 선택·광장에서 공유하는 몸/눈 셰이더·본 표시·모션 화면 |
| `assets/chara/pcNN/` | 공용 모델·텍스처·`motion/<name>.glb`·`motions.json`; 22명 및 NPC 공용화 결과는 [chara_assets §9](chara_assets.md) |
| `tools/analysis/character_verify/motion_ref.ts` | §6.7의 과거 기준 계산. 범용 `script/core/motion.ts`는 아직 없음 |

원본 동등성을 맞출 계약은 `{clip,frame,speed,prevClip,prevFrame,blendSeconds,blendElapsedSeconds}`다. 초 단위 전이와 계속 진행하는 이전 노드, mpat의 시작 프레임 덮기, `modelAnimationSpeed`를 현재 코드에 자동으로 구현됐다고 간주하지 않는다.

### 9.2 원본 이름 ↔ 웹 권장 이름

| 원본(확인된 이름) | 웹 권장 |
|---|---|
| `actor::ComActorMotion` | `MotionComponent` |
| `actor::ActorAnimationSlot` | `MotionSlot` |
| `actor::MotionArg` (+0x38 … +0x4C) | `MotionArg { forceRestart, randomStartFrame, speedValid, startFrame, speed, blendTime, transitionType }` |
| `ActorAnimationSlot+0x140 / +0x144` | `speed` / `conditionSpeed` |
| `ComActorMotion+0x98` | `idleRandom: Map<hash, boolean>` |
| `AnimationSlot::GetPlaybackState` 0~3 | `PlaybackState.None/Playing/Paused/Finished` |
| `nn::bezel::StringViewHashPair` | `{ name, hash: bigint }` (FNV-1a 64) |
| `bex::ComHeading` impl+0x1B0 | `HeadLook.targetType` |
| `bq::PlayerWork::GetCharacterID` | `charId` (PlayerCharacterID) |
| `mg1801::Player+0xA8 / +0xAC` | `motion` / `motionReq` |

### 9.3 MotionSlot 의사코드 (로직)

`web/tools/analysis/character_verify/motion_ref.ts`는 과거 기준 구현이다. 아래는 §6.3~6.6에 맞출 포팅 계약이며, 이번 작업에서 구현하지 않는다.

```ts
class MotionSlot {
  play(arg: MotionArg): void            // §6.3~6.5: 리스너 이후 mpat 보정까지
  setFrame(f: number): void
  setSpeed(s: number): void             // ActorAnimationSlot::SetSpeed: 같은 값이면 무시
  step(deltaSeconds: number): void      // §6.6, f32 누적·전역 모델 속도
  isFinished(): boolean                 // 비루프 && frame >= FrameMax
  crossed(f: number): boolean           // 이번 step이 프레임 f를 지났는지 (FX 트리거)
}
```

mg1801 Player는 mg1801.md §6.5와 이 문서 §5.2·§4.3의 MotionArg 값으로 구동한다.
- idle: `{forceRestart:1, speedValid:1, speed:f32(BPM/120), startFrame: SyncIdleMot ? elapsed%30 : 0, blend: SyncIdleMot ? 0.2 : default}`
- swing: 같은 값에 `startFrame 0`

### 9.4 화면(three.js)의 원본 정합성 과제

- 클립은 `frame/60`으로 샘플한다. 전이 type/mode를 먼저 판정하고, 크로스페이드면 이전 클립도 진행시킨다(§6.5). 현재 mg1801의 이전 frame 고정은 근사다. `bex_no_transit_bone`·`bex_limit_transit_bone/shape`는 §4.2의 본/shape별 **시간 클램프**로 적용한다. 0.07을 가중치나 전체 슬롯 공통 상한으로 쓰지 않는다.
- 부착은 [mg0508 §4](../minigame/mg0508.md)의 `ComAttachment` position/rotation/scale 모드·부모 본 SRT를 따른다. 해당 예의 모드는 1/1/0이고 `main @0x7100887fc8`은 scale 모드 1일 때만 Entity scale을 쓴다. mg1801 `SetModelHook` 호출에 별도 오프셋 인자가 없다는 사실만으로 공용 부착의 로컬 오프셋·scale을 항등으로 확정하지 않는다.
- 시선은 애니 평가 뒤 `head_aimcont`를 초기화하고 §6.8을 적용한다. 현재 mg1801 구현의 chin·neck·뒤쪽 분기 생략은 남은 화면 차이다. 눈은 뼈 회전 대신 재질 값과 시선 출력의 섞임을 따른다.
- 표정은 fskb/fshb/ftsb/fvbb 묶음·shape weights·표시 본을 함께 다룬다(§4.2 및 charselect 참조). ‘눈꺼풀 네 본만’은 전 캐릭터 규칙이 아니다. 독립 `face_param` 표정 슬롯의 재생 주체는 별도로 남는다.
- PhysX 흔들림을 스프링으로 근사/생략하는 것은 웹 결정이다. 기본 활성 상태는 §4.7에 따라 다루며 Ending만의 기능으로 제한하지 않는다.

### 9.5 현재 공용 에셋·지연 로드

모델은 예를 들어 `assets/chara/pc01/pc01_mario.glb`, 클립은 `assets/chara/pc01/motion/rhy_knife_idle00.glb`, 메타는 `motions.json`이다. 이전 제안의 `model.glb`·`motion/<archive key>/` 경로는 실제 구조와 다르다. 원본 이름은 `rhy_knife_idle00`처럼 pcNN 접두 없이 유지한다. shape 애니가 있는 파일은 별도 `_shape` clip도 포함하므로 ‘glb당 클립 항상 하나’로 처리하지 않는다. 변환·압축·공용 로더 계약은 [chara_assets §3·§9](chara_assets.md)를 재사용한다. 원본 `pcMotionArcList`와 장면 AddAnimation 목록의 역할은 [06 §2.4](06_scene_data.md)다.

### 9.6 초기 변환 표본의 용량 [실행: 과거 측정 + 계산]

| 항목 | 크기 |
|---|---|
| pc01 모델 지오메트리+스킨(glb, 클립 제외) | 2.34 MB |
| pc01 텍스처 png(쓰는 것: alb_00 1.60 MB, nml_00 2.29 MB, mr 0.80 MB, eye 0.02 MB) | 약 4.7 MB |
| 베이크 클립 1프레임(94뼈 × T3·R4·S3 f32) | 약 3.8 KB |
| `rhy_knife_idle00` / `swing00` / `co_idle00` / `fcl_blink00` | 117 KB / 79 KB / 455 KB / 62 KB |
| 마리오 모션 전체 897개(50,819 샘플) | 약 191 MB(무압축) |
| 상주 `co·mg·fcl·mn` 105개 | 약 34 MB |
| mg1801에 필요한 마리오 클립 | 약 0.2 MB |

- 전체 모션을 미리 받는 것은 맞지 않다. 장면 단위로 지연 로드한다.
- 변하지 않는 트랙을 빼면 크게 줄어든다(예: `fcl_blink00`은 12트랙). 정수 프레임 베이크는 원본 곡선 대신이다. 클립 경계 동작은 그대로다.
- 텍스처는 KTX2 등으로 압축할 수 있다. 원본 그림 자체는 바꾸지 않는다.

### 9.7 남은 포팅 순서 (권장)

기존 공용 변환을 다시 수행하는 대신, §6.5의 type/mode·초 단위 블렌드·mpat 시작 프레임과 §6.6의 dt/모델 속도 계약부터 대조한다. 이어 mg1801 재질을 charselect 판독과 맞추고, chin 식·표시 본·표정 묶음의 캐릭터별 차이를 검증한다. 뒤쪽 분기·neck은 §6.8 판독 식을 사용하고, 물리 조인트의 남은 USER 정책·공통 표정 소비자는 §11에 남긴다.

### 9.8 웹 환경 때문에 바꾸는 부분과 동등성

| 원본 | 웹 포팅 계약·근사 | 동등성 조건 |
|---|---|---|
| FRES 곡선(Hermite·Cubic) 실시간 평가 | 60fps 정수 프레임 베이크 + 선형 보간 | 로직 프레임은 정수×속도다. 속도 1이면 정수 프레임만 샘플하므로 같다. 속도 ≠ 1이면 프레임 사이 선형 보간 오차가 있다(화면 전용) |
| bezel 슬롯·컨트롤러·리스너 | 단일 `MotionSlot` 제안(현재 구현은 §9.1) | §6.3~6.6의 전이·프레임·속도·끝 판정 결과를 맞춤 |
| ComHeading 갱신 식 | §6.8 그대로(chin·neck_roll·뒤쪽 데드존 제외) | 화면 전용. 로직 영향 없음 |
| PhysX 물리 애니 | 스프링 근사 또는 생략 | 화면 전용 |

## 10. 검증 코드·실행 결과·기대값

| 종류 | 내용 | 결과 |
|---|---|---|
| 원본 명령 판독 | Ghidra 디컴파일·디스어셈블(§2 파일), 정적 NSO/NRO 주소·vtable·MPAT·user data 소비·기존 SASS 대조 | §4.2·§4.7·§6.4~6.6·§6.8~6.9 신규 판독 |
| 물리 데이터 대조 | 원본 11 APX의 actor 이름·내부 ref와 공용 GLB의 원본 boneIndex 전수 대조 | RigidDynamic 81/81 이름 일치, Constraint 44 연결 확인(§4.7) |
| 데이터 확인 | `bfres_probe`로 22명 `rhy_knife_*` | 전원 idle 30·루프, swing 20·비루프 |
| 데이터 확인 | `web/tools/analysis/character_motion_index.py` | 85 아카이브, 이름 1,027개, fskb 18,910개 프로브 오류 0, 캐릭터마다 길이가 다른 이름 302개 → `extracted/converted/character/motion_index.json` |
| 데이터 확인 | FNV-1a 64 계산 vs mg1801 상수 2개 | 일치 |
| 변환 실행 | `python web/tools/analysis/character_glb.py`(기본 pc01 + rhy_knife_idle00·swing00·co_idle00·fcl_blink00) | `pc01_mario.glb` 3,055,120 B, 노드 98, 메시 3, 정점 13,013, 삼각형 6,975, bindErr 3.3e−7, 누락 텍스처 0 |
| 독립 로드 | `node web/tools/analysis/character_verify/run.mjs web/tools/analysis/character_verify/check.ts pc01` (three GLTFLoader, 텍스처 스텁) | `ok: true`. 스켈레톤 뼈 94 = FRES 94. 클립 4개의 길이×60 = FSKA FrameCount(30/20/120/380), loop 일치. 정수 프레임 믹서 포즈 = 저장 키(오차 ≤ 1e−6). swing 0→8프레임 `attach_R_hand` 이동 0.963. idle 0↔30프레임 손 위치 차 0(루프 이음매) → `verify_three.json` |
| 재구현 계산 | 같은 check의 `motion_ref.ts` + mg1801 MyUpdate 흉내 | §6.7 표(120 BPM 20프레임) |
| 헤드리스 렌더 | `node web/tools/analysis/character_verify/run.mjs web/tools/analysis/character_verify/shot.ts pc01` (chromium swiftshader) | `extracted/converted/character/pc01/filmstrip.png`: idle f0 \| swing f0·4·8·12·16·20 \| co_idle f60, 칼 부착. 포즈 변화 확인. 몸 색은 UV 미보정이라 어긋남(§4.2). 콘솔 오류는 404 1건(favicon 추정)뿐 |
| 원본 실행 | 없음 | — |

위 변환·로드·렌더·재구현 실행 수치는 과거 결과다. 이번 검증은 원본 NSO와 데이터 및 현재 소스를 읽은 정적 대조다. §6.7의 120 BPM=20회 진행·idle 30프레임 주기는 `deltaSeconds=1/60`, 전역 모델 속도 1의 기대값이며, 원본 첫 표시 포즈 대조는 §11에 남는다.

## 11. 최신 항목 대조·남은 근거

편집 전 최신 09에는 범례를 제외한 ‘미확정’ 문자열이 **19회**였으나 제목·반복 설명을 포함했다. 마지막 목록은 **10행**이고 각 행 안에 하위 문제가 묶여 있다. 아래는 그 실제 목록의 대응 결과다. 기존 참조 해소와 신규 판독을 나누고 부분 해소의 남은 근거를 적는다.

| 기존 항목 | 이번 결과 | 남은 근거·영향 |
|---|---|---|
| 리스너/노드 교체 순서 | 신규 판독 완료: 리스너 → mpat → 노드 교체 → 시작 프레임 재설정(§6.4~6.5) | 리스너가 이전 노드를 읽는다는 추정 해소 |
| blend 단위·mpat a/우선순위·slot mode | 초·a/60·b·α/β 유지; Actor 생성 mode=0, menu00 퀘스트 취소 Sub mode=2 호출 추가 판독(§6.5) | mg1801의 확인된 경로는 0; 다른 장면 설정의 전용 금지 |
| dt·FrameMax | 신규 판독 완료: dt×60·slotSpeed·ModelModule 속도, FSKA FrameCount/loop bit2(§6.6) | 장면별 전역 모델 속도 값은 추가 호출/설정 근거 필요 |
| 새 모션 첫 진행/표시 | 동기 Play와 진행 후 큐 교체 차이 신규 판독(§6.6); 공통 틱 순서는 기존 참조(§8) | **mg1801 평가→첫 렌더의 전체 연결** 부족; 표시 0/speed 및 요청~관찰 ±1은 유지 |
| chin·neck·뒤 데드존 | chin 상한·neck 역기저/부호/0.5 성분 보간, 뒤 40°/60° 기저·slerp·이전 부호 유지 판독 완료(§6.8) | 원본 부동소수점 비트 일치는 별도 검증 |
| fcl 슬롯·얼굴 모프 | blink/표시 본 기존 참조·shape 구동 유지; NPC FaceSlot의 생성→PlayFaceAnim 경로 추가 판독(§4.2) | **22명 face_param 소비자·겹침 우선순위** 부족; NPC/광장 슬롯을 공통 규칙으로 일반화 금지 |
| 물리 기본값·본 대응 | 기본값 유지; 11명 81강체/44Constraint·USER 참조·FindBoneIndex·양방향 포즈 경로 추가 판독(§4.7) | **USER+0x18 의미·D6 제한/감쇠값**, 활성 bit1 상위 이벤트·Animator +0x23E 쓰기 주체 부족; 비트별 판정 자체는 해소 |
| `_light` 사용 장면 | 설정+6→CharacterDataPath 인자 bit0→fmdb light/m1 선택 경로 추가 판독(§4.2) | **장면별 설정+6 쓰기 호출자** 부족; 거리 LOD 단정 금지 |
| body UV·눈 합성 | body/눈 회귀 기존 참조; 눈 VS selector·pc01 layer·영역 마스크·normal 식 추가 판독(§6.9) | **특수 캐릭터 전체식·c1 바인딩·RGB/눈꺼풀 최종 합성** 부족 |
| MotionArg +0x4C | `Play(name)` 기본 blend/type 초기화 래치 신규 판독(§4.3) | 설명용 이름이며 bezel mode와 다른 객체 |

**FTRG 연계**는 [05 §7.5·§7.7](05_ui_input.md)로 해소한다. 애니 슬롯 0~3의 첫 평가·방향·루프를 독립 이벤트 문맥으로 추적하므로 첫 화면 포즈의 미확정과 프레임 0 이벤트 포함 여부를 혼동하지 않는다.

목록 밖에 반복되던 본/shape user data의 미해소 설명도 **초 단위 전이 시간 클램프의 설정→소비 주소**로 해소했다(§4.2·§9.4). 목록 밖의 actorparam·이동/충돌·본 부착·결과 배치·광장 캐릭터는 §4.8·§9.4의 기존 문서를 근거로 해소했다. 병렬 07 카메라/조명·온라인 문서는 읽기 전용 범위이며 이번 변경 대상이 아니다.

## 부록 A. 도구 사용법

```sh
# 모션 색인 (약 40초)
.venv/Scripts/python web/tools/analysis/character_motion_index.py
# 캐릭터 glb (기본 pc01 + 4클립). 다른 캐릭터·모션: web/tools/analysis/character_glb.py pc03 rhy_knife_idle00 rhy_knife_swing00
.venv/Scripts/python web/tools/analysis/character_glb.py
# 독립 검증·렌더 (web/node_modules 의 three·esbuild·playwright-core 사용, 설치 없음)
node web/tools/analysis/character_verify/run.mjs web/tools/analysis/character_verify/check.ts pc01
node web/tools/analysis/character_verify/run.mjs web/tools/analysis/character_verify/shot.ts pc01
# Ghidra (캐릭터 전용 사본)
MSYS_NO_PATHCONV=1 ./tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/character jamboree_main \
  -process main.nso -noanalysis -readOnly -scriptPath c:/dev/mpj/tools/ghidra_scripts \
  -postScript CharacterDecompAddr.java <out.c> <주소> name:<전체이름> ptr:<주소>:<개수>
```

## 12. 사용자 확인 필요

- 원본 동등성이 필요한 범위: 22명 공통 7표정의 독립 슬롯, APX D6 솔버까지인지 결정이 필요하다. 아래 공백을 기존 웹 근사값으로 확정하지 않는다.
- 보조물리를 생략/근사하는 제품 결정과 원본의 활성 조건은 별개다. 생략을 선택해도 컴포넌트·본 존재 검사와 예약 teleport 계약은 유지할 수 있다.

## 13. 런타임 구현 준비도

| 필요한 항목 | 분석 상태 | 구현 차단 여부 |
|---|---|---|
| 모델·본·모션·mpat·부착·액터값 | 기존 참조 해소 + §4·§6 확정 식 | 기본 캐릭터 런타임 비차단; 충돌 수치는 11 담당 결과 참조 |
| 모션→SE/VO/VB/FX 이벤트 | [05 §7](05_ui_input.md)의 첫 평가·참조·자원·Sound Space 계약 | 확인된 디스패처 진행 가능; 장면별 발소리 공간은 추가 매핑 필요, Effect 내부는 08 담당 결과 참조 |
| head/chin/neck | neck 기저·뒤 40°/60° 분기·보간 신규 판독 | 수식 구현 비차단; 원본 비트 일치는 별도 검증 |
| 공통 face_param 독립 슬롯 | 데이터 7개·NPC 예만 확인; 공통 소비자/겹침 정책 부족 | 독립 표정 자동 적용은 차단; blink 묶음은 기존 참조 사용 |
| 보조물리 | 81본/44Constraint·활성 판정·양방향 포즈 해소; USER/D6 수치 부족 | 본 연결·활성 관리 비차단, 원본 솔버 동등성은 차단 |
| `_light`·특수 눈 최종색 | 기존 부분 판독 유지, 셰이더는 별도 담당 | 일반 모델/확정 눈 좌표 비차단; 장면 light 선택·특수색 동등성은 차단 |
