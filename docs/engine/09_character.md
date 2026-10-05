# 09. 캐릭터 — ID·에셋·뼈, 모션 재생·전이, 시선·눈·흔들림 본, 캐릭터 glb

2026-10-02. 상태: **분석 진행 / 변환 시험 완료(pc01) / 웹 구현 없음**.
문서 형식과 확정 수준은 [../../../분석.txt](../../../분석.txt)(실제 위치 `c:/dev/web/분석.txt`)를 따른다.
- **[실행]**: 이 문서에서는 "변환·로드·재구현 실행 확인"이다. 원본 게임을 돌린 것은 없다.
- **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**.

주소는 모두 SwitchLoader 기본 베이스 0x7100000000 기준이다. 모듈 이름과 함께 쓴다(`main @0x…`, `mg1801 @0x…`).

같은 내용을 여러 문서에 복사하지 않는다. 다음은 다른 문서가 근거다.

| 주제 | 근거 문서 |
|---|---|
| 아카이브 로딩, PlayerCharacterID 전체 표, `characterlist.json` 필드, mpat 포맷 | [06_scene_data.md §1·§2](06_scene_data.md) |
| FX 트리거(모션 프레임 이벤트 → SE·보이스·진동) | [05_ui_input.md §7](05_ui_input.md) |
| 프레임 타이밍·파이버 순서·GetDeltaTime | [01_core.md](01_core.md) |
| FRES·BNTX 변환, 회전 규약, 재질 근사 | [03_graphics.md](03_graphics.md), 변환기 `tools/graphics_bfres2gltf` |
| mg1801 Player 로직 | [../minigame/mg1801.md §4.6·§5.2·§6.5](../minigame/mg1801.md) |

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
| Ghidra | `ghidra_work/character`(jamboree_main, mg1801). 스크립트 `tools/ghidra_scripts/CharacterDisasm.java`(함수 디스어셈블+호출 이름), `CharacterDecompAddr.java`(주소·이름·vtable 포인터 표 디컴파일) |
| 에셋 | `extracted/bea/chara~pcNN.nx.bea`(22), `chara~pcMot_<key>.nx.bea`(85), `bq.nx.bea/common/data/{characterlist,pcMotionArcList,face_param}.json`, `bq.nx.bea/chara/mpat/*.mpat`(111) |
| 도구 | `tools/character_motion_index.py`, `tools/character_glb.py`, `tools/character_verify/{run.mjs,check.ts,shot.ts,view.html,motion_ref.ts}` |
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

- 리스너가 "노드를 바꾸기 전"에 불린다는 순서는 [추정]이다. 근거는 §6.4에 적었다.
- 게임 파이버(타이밍 0x0E)가 정한 재생 요청을 같은 프레임 뒤 타이밍의 애니메이션 처리기가 반영한다 [판독: 01_core §타이밍]. 새 모션이 요청 프레임에 바로 한 칸 진행하는지는 [미확정]이다(§8).

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
| `pc01_mario_light.fmdb` (`fmdb light`) | 81 | 1(body) | 6,685 | 머리카락 4·눈꺼풀 4·fluid 5 뼈 없음, 얼굴·머리카락 메시 없음 | 저폴리 모델 [데이터]. 쓰는 장면 **[미확정]** |

- 06 문서의 "`_light` = 라이트 리그 [추정]"은 이 비교로 틀린 것으로 본다. 모델 안에 라이트 뼈가 없고 몸 메시만 줄었다 [데이터: graphics meta 비교].
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

- 배열 텍스처는 그래픽 담당 `tools/graphics_bntx.py`가 레이어별 png(`_00`, `_01`)로 푼다 [실행].
- **정정(전 캐릭터 규칙, 웹 22명 렌더 관측):** body_m UV를 "텍스처 가로 = 1" 단위로 본다. 알베도 1:2(1024×2048·512×1024) → v′ = 0.5 + 0.5v, 2:1(쿠파) → u′ = 0.5u, 정사각·캐서린(1024×1280) → 그대로. **얼굴(눈꺼풀) 셰이프에도 같은 규칙을 건다** — 아래 '얼굴은 보정하지 않는다'는 틀렸다(걸지 않으면 피치·데이지·폴린 눈가가 어긋나고, 걸면 마리오 포함 모두 맞는다) [실행: 렌더 관측][추정: 원본 그래프 `pcNN.bnbshpk` 미해독]. 눈동자 좌표 = (TEXCOORD_1.u − p.x, TEXCOORD_1.v + p.y), p = utility_parameter0/1(Maya srt 부호; 피치 p.y = 8.19로 확인), 덮는 곳 = 몸 알베도 알파 0 칸(흰자 모양과 같음) [데이터]. 쿠파주니어(pc56)는 알베도 오른쪽 띠 패턴을 고르는 그래프라 미재현.
- 몸 UV는 TEXCOORD_0을 그대로 쓰면 색이 어긋난다. `v' = 0.5 + 0.5·v`로 맞는다는 관측이 있다(그래픽 담당, `extracted/converted/graphics/shots/mario_uvfix_1.png`). 원본 셰이더 그래프 식은 **[미확정]**이다. 이 문서의 렌더(§10)는 UV를 고치지 않았다. 그래서 색이 어긋나 보인다.
- 셰이프별 UV 범위 [데이터, pc01 glb 계산]:
  - body·hair의 TEXCOORD_0 v는 [−1, 1](hair −0.45~−0.23)이다. v′ = 0.5 + 0.5v면 알베도 아래 3/4(옷·얼굴·모자·머리카락)에 들어간다.
  - face(눈꺼풀, 모프 6)의 TEXCOORD_0은 [0.04~0.64, 0.025~0.241]이다. 알베도 위 1/4의 눈꺼풀 칸이다. 그래서 보정하지 않는다.
- 눈동자 [데이터 + 추정]:
  - body 흰자 정점의 TEXCOORD_1은 왼눈 u 0~0.62, 오른눈 u 2.38~3.00이다. 오른눈 u = 3 − 왼눈 u로 거울 대칭이다. 이것이 utility_parameter0/1의 (0,0)/(2,0) 간격과 맞는다.
  - 웹은 `eye_arr_alb`를 `TEXCOORD_1 − 오프셋`(대기값 (0.0144, 0.09)/(2.0144, 0.09))에서 샘플한다. 그 알파로 흰자(알베도 밝기 마스크) 위에 덮는다.
  - 빼는 방향과 마스크는 **[추정]**이다. 렌더에서 눈동자가 흰자 안 코 쪽에 맞게 나온다 [실행: `web/test/out/chara_face.png`].
  - 구현: `web/script/games/mg1801/view/character.ts`.

**뼈 체계** (pc01, 94개) [데이터]

| 분류 | 뼈 | 쓰는 곳 |
|---|---|---|
| 루트 | `model_root` → `NDcha_pos`(캐릭터 원점) | `NDcha_pos`는 user data `bex_no_transit_bone`: 전이 블렌드에서 제외 [추정: 이름]. FX 트리거 훅(휘두름 SE) |
| 몸통 | `pelvis`, `spine00`, `head`, `head_aimcont` | 시선 제어 뼈는 `head_aimcont`·`chin`·`neck_roll`·`spine00`(§6.8). pc01에는 `neck_roll`이 없다 |
| 팔다리 | `L/R_thigh, calf, foot, toe, knee, hem, thigh_roll`, `L/R_clavicle, upperarm, elbow, forearm, hand, wrist, upperarm_roll`, 손가락 `L/R_finger1~4_1/2`, `L/R_thumb_1/2` | |
| 부착점 | `attach_R_hand`, `attach_L_hand`(+`_mrr` 거울용 부모), `attach_L/R_foot`(+`_mrr`), `attach_head`, `attach_body`, `attach_eff` | 소품·이펙트. mg1801 칼 = `attach_R_hand`. 캐릭터 선택 카메라 대상 = `attach_head`(`chara_select_target_bone`) |
| 머리 장식 | `cap`, `F_hair_root/F_hair`, `T_hair_root/T_hair` | |
| 얼굴 | `facial_root` 아래 `L/R_brow_1~3`, `L/R_eyeline_upper/lower`, `L/R_lip`, `chin`→`lower_lip`, `upper_lip`, `mario_upper_tooth` | 표정 모션(`fcl_*`)이 움직인다. 눈꺼풀 4개는 user data `bex_limit_transit_bone` 0.07 |
| 기타 | `NDdecal`, `container_model`, `fluid_model`→`NDinput_0`, `fluid_L/R_foot`, `fluid_body` | 데칼·유체 보조 |

- 캐릭터마다 뼈 수가 다르다. `rhy_knife_*` 애니의 뼈 수: pc01 94, pc11·pc14 114, pc58 43, pc51 44 [데이터 `bfres_probe`].
- 모델 user data(pc01) [데이터]:

| 키 | 값 | 뜻 **[추정: 이름]** |
|---|---|---|
| `bex_mirror_shader_param` | body_m `material_utility_parameter0` ↔ `1` (`xd`), `parameter2` ↔ `parameter2` (`ijd`) | 좌우 반전 재생 때 바꿔 쓸 셰이더 파라미터 |
| `bex_mirror_key_shape_blend` | `fcl_L/R_eye_half/close/tight_shp` 쌍 | 반전 때 키셰이프 좌우 교환 |
| `bex_mirror_bone_visibility` | `attach_L/R_hand(_mrr)`, `attach_L/R_foot(_mrr)` 쌍 | 반전 때 뼈 표시 교환 |
| `bex_limit_transit_shape` | `mario_face__body_m`, `0.07` | 얼굴 키셰이프 전이 제한 |
| `motion_blur` | 0 | |

**얼굴 키셰이프** (`mario_face__body_m`): `fcl_R/L_eye_tight_shp`, `fcl_R/L_eye_close_shp`, `fcl_R/L_eye_half_shp`. 머리카락 `shp_hair_in_shp` [데이터]. `rhy_knife_*.fshb`·`fcl_blink00.fshb`는 셰이프 트랙이 0개다 [데이터]. 키셰이프를 실제로 움직이는 모션은 찾지 못했다 **[미확정]**.
- **정정(깜빡임 해소):** 모션 파일 user data `blink`가 있으면 `fcl_blink00`을 AnimationNodeBundle의 둘째 자식으로 묶어 함께 재생한다. 값 설정은 자식 전부, 질의는 첫 자식에 간다 [판독 main FUN_7100034aa0, FUN_71000321e0 계열]. `rhy_knife_idle00`·`co_idle00`에만 있고 swing에는 없다. 묶이는 파일 종류(fskb/fshb/ftsb)는 캐릭터마다 다르다 [데이터]. 깜빡임 프레임 = 묶음 시작 뒤 진행 프레임을 깜빡임 파일 길이로 감은 값 **[추정]**. DK·쪼르뚜·가봉은 깜빡임이 재질 애니(ftsb)뿐이다.

**mpat** = 장면·캐릭터별 모션 전이표다(포맷 [06 §2.5](06_scene_data.md)). `characterlist.json`의 `anim transit table`(`anim_transit.mpat`)은 파일이 없다. 실제로는 `chara/mpat/<장면>_<pcNN|pc>.mpat`·`sys_*`를 붙인다 [판독 main FUN_71002b3a30]. mg1801은 `mg1801_pc.mpat` 3항목이다(§6.5).

**표정**: 따로 된 표정 텍스처 패턴은 없다(`ftsb.fmab`의 `patterns`가 비어 있다) [데이터]. 표정은 세 경로다.
1. 얼굴 뼈 스켈레탈 모션 `fcl_*`(`chara~pcMot_fcl`, 상주): `fcl_blink00`(pc01 380프레임 루프, 눈꺼풀 뼈 4개 RotateX 곡선), `fcl_default00`·`happy00`·`sorrow00`·`smile00`·`sad00`·`standard00`·`blink01`·`blink02`(1프레임 포즈) [데이터]. `face_param.json` = `fcl_notice00, happy00, sad00, sorrow00, dizzy00, bad_item00, close_tight00` 7개 이름 목록이다 [데이터]. 몸 모션 위에 겹치는 슬롯 구성은 **[미확정]**(`ComActorMotion::AddAnimationSlot(name)`이 슬롯을 더 만든다 [판독 @0x710002e414]).
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
| 0x44 | f32 | `blendTime` | −FLT_MAX(0xFF7FFFFF) | 전이 시간. −FLT_MAX = 기본(리스너가 0.1로 바꿈). 단위 **[미확정]**(§6.5) |
| 0x48 | i32 | `transitionType` | 1 | `nn::bezel::AnimationTransitionType`. 4 = 크로스페이드(§6.5) |
| 0x4C | u8 | `unk4C` | 1 | 슬롯 쪽에서는 "첫 기본값 적용됨" 표시로 쓰인다(`Play(name)` @0x71000237f8). 의미 **[미확정]** |

`Play(name, float blend, AnimationTransitionType type)` @0x71000238dc는 `blendTime`·`transitionType`만 바꾼다.

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

`IsFinished()` = 상태 == 3이다(@0x7100024094). **루프 모션은 끝나지 않는다.** 루프 여부는 `AnimationNode::IsLoopEnabled`이고, 값은 클립 데이터(FSKA Loop 플래그)에서 온다 **[추정: AddAnimation이 다른 값을 주지 않음]**.

### 4.6 bex::ComHeading [판독]

기준 객체: `bex::ComHeading`. 실제 값은 `ComHeading+0x28`이 가리키는 구현체(아래 "impl")에 있다.

| impl+오프셋 | 웹 권장 이름 | 세터 | 원천(PC) |
|---|---|---|---|
| 0x58 | `headBone` | FUN_71001bf41c("head_aimcont") | 고정 |
| (FUN_71001bf47c/4d0/524) | `chinBone`, `neckBone`, `spineBone` | "chin", "neck_roll", "spine00" | 고정 |
| 0x40~ | `skeletalSlot` | `SetSkeletalAnimationSlot(AnimationSlotName_Main)` | |
| 0x70 | `limitMin` (rad xyz) | `SetLimitAngleMin` | `head_min_x/y/z`(도 → ×0.017453292) |
| 0x80 | `limitMax` (rad) | `SetLimitAngleMax` | `head_max_*` |
| 0x90 | `offsetAngle` (x만) | `SetOffsetAngle` | `head_offset_x`(도→rad) |
| 0xA0 | `chinCoef` | FUN_71001bf648 | `head_chincoef` |
| 0xA8/0xAC | `backDeadZone` (rad, 0 이상) | `SetBackAngleDeadZoneDegree` | |
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
- 기본 켜짐 여부, 어떤 뼈에 걸리는지는 **[미확정]**이다(apx 안 강체 이름·조인트 대응을 아직 읽지 않았다).

## 5. 상태 전이와 전체 수명

### 5.1 모션 슬롯 수명 [판독]

```
(없음) --Play--> Playing --frame>=FrameMax(비루프)--> Finished
   Playing --SetPauseEnabled(true)--> Paused --false--> Playing
   어떤 상태든 --Play(다른 이름 | forceRestart)--> Playing(새 모션)
   Play(같은 이름, forceRestart=0) → 변화 없음(진행 중인 프레임 유지)
```

Finished 상태에서는 마지막 프레임 포즈를 유지한다 **[추정: 프레임이 FrameMax에 멈춤]**. 다음 `Play`가 올 때까지 그대로다.

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

### 6.4 시작 리스너: 속도·시작 프레임·블렌드 [판독 FUN_7100022f20 + 디스어셈블, 순서는 추정]

```ts
onStart(slot, newNode, transitionArg) {
  const a = pendingArgs.get(hashOf(newNode)); if (!a) return;
  const node = slot.currentNode;                 // 아래 [추정] 참고: 아직 "이전" 노드
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
- **`loopPrev`가 "이전" 노드의 루프 플래그라는 것은 [추정]이다.** 근거는 다음과 같다.
  - 리스너는 `bezelSlot+0x38`(현재 노드)의 `IsLoopEnabled`를 읽는다.
  - `FUN_7100813940`이 +0x38을 새 노드로 바꾸는 것은 전이 적용 단계다. 리스너가 받는 사건 구조 `{slot, , newNode, , transitionArg}`는 그보다 앞선 `FUN_710081a6e8`의 요청 구조와 모양이 같다. 그래서 리스너는 노드를 바꾸기 전에 불린다고 본다.
  - 이 해석이면 다음 세 원본 동작이 모두 설명된다.
    - mg1801 생성자의 `Play` 직후 `SetFrame(0)`: 노드가 없어 `loopPrev = 1` → idle 맵 true → 난수 시작 프레임이 된다. 이것을 0으로 되돌린다.
    - SyncIdleMot의 `startFrame`: swing(비루프) → idle에서 쓰인다.
    - idle → swing: 프레임 0.
  - 반대 해석(새 노드 기준)이면 루프 idle의 `startFrame`이 영원히 무시된다. 그러면 SyncIdleMot 코드가 쓸모없어진다.

mg1801에 적용하면 이렇다(SyncIdleMot 기본 0).

| 전이 | loopPrev | 시작 프레임 |
|---|---|---|
| 생성: (없음) → idle | 1 | 난수 → 바로 `SetFrame(0)` = **0** |
| idle → swing | 1 (idle 루프) | idle 맵[swing] = false → **0** |
| swing → swing (재휘두름) | 0 | `startFrame` = **0** |
| swing → idle | 0 | `startFrame` = **0** (SyncIdleMot면 `GetElapsedFrame() % 30`) |

### 6.5 전이 블렌드 [판독 + 데이터, 단위 미확정]

`FUN_7100813940`(전이 적용):

```ts
let { blend, type } = transitionArg;
if (type === 1 && bezelSlot.mode /* +0x54 */ === 2) type = 4;
if (type === 4 && blend > 0) { crossfade(from = 이전 노드, rate = 1 / blend); }   // FUN_7100813bf0
else { 즉시 교체; }
```

- 크로스페이드는 **type 4(또는 type 1이면서 슬롯 모드 2)일 때만** 일어난다. 슬롯 모드 +0x54를 누가 2로 두는지는 **[미확정]**이다.
- `ActorAnimationSlot::EndTransition` @0x71000242b0: `경과(전이 객체+0x50) / blend ≥ 1`이면 전이 끝.
- 전이표 `mg1801_pc.mpat`(로더 main FUN_71002b3a30, 컨트롤러에 등록) [데이터]:

| from | to | a | b | c |
|---|---|---|---|---|
| rhy_knife_swing00 | rhy_knife_idle00 | 1 | −1 | 0.0 |
| rhy_knife_idle00 | rhy_knife_swing00 | 1 | −1 | 0.0 |
| rhy_knife_swing00 | rhy_knife_swing00 | 0 | −1 | 0.0 |

- `a`는 111개 파일 전체에서 0, 1, 2, …, 24(141번), 30, 48, 60, 90 같은 정수다. 전이 프레임 수로 본다 **[추정]**.
- mpat 값이 MotionArg의 blend(기본 0.1, SyncIdleMot 0.2)보다 우선하는지는 **[미확정]**이다. MotionArg blend의 단위(초인지 프레임인지)도 **[미확정]**이다.
- 결론: **mg1801에서 idle↔swing 전이는 0~1프레임이다.** 두 해석 모두 그렇다(mpat 1프레임, 또는 type 1이라 크로스페이드 없음). 다만 mpat를 무시하고 blend 0.1을 초로 쓰는 조합이면 6프레임이 된다. 이 조합은 type 1 조건 때문에 일어나지 않는다고 본다 **[추정]**.

### 6.6 프레임 진행과 끝 판정 [판독 + 추정]

```ts
// 애니메이션 처리기(게임 파이버 뒤 타이밍)에서 프레임마다
frame = f32(frame + speed * conditionSpeed);   // 리듬 장면은 고정 1/60 (01_core). 한 프레임 = 클립 1프레임 × 속도 [추정]
if (loop) frame = wrap(frame, 0, FrameMax); else frame = clamp(frame, 0, FrameMax);
isFinished = !loop && (speed >= 0 ? frame >= FrameMax : frame <= 0);
```

- FrameMax = FSKA `FrameCount`로 본다 **[추정: `AnimationNodeClip::GetFrameMax` @0x7100811820 미판독]**. 클립의 마지막 키는 FrameCount 프레임에 있다(변환기가 0..N 정수 프레임을 구웠고 N 샘플이 마지막 포즈다).
- 가변 프레임 장면에서 dt를 곱하는지는 **[미확정]**이다(리듬 장면은 고정 60이라 영향 없음).

### 6.7 mg1801 칼 모션 길이 [데이터 + 재구현 계산]

`tools/bfres_probe`로 22명 모두의 `chara~pcMot_rhy/…/pcNN_rhy_knife_*.fskb`를 읽었다.

| 모션 | FrameCount | Loop | 22명 공통 | 속도 BPM/120일 때 |
|---|---|---|---|---|
| `rhy_knife_idle00` | **30** | **루프** | 예 | 한 바퀴 = 30·120/BPM 프레임 = **정확히 1박** |
| `rhy_knife_swing00` | **20** | **비루프** | 예 | 끝까지 ≈ 20·120/BPM 프레임 = 2/3박 |

swing 길이(요청 프레임부터 idle을 다시 요청하는 프레임까지)는 `tools/character_verify/motion_ref.ts`로 계산했다. 프레임을 f32로 누적하고, IsFinished는 다음 프레임 MyUpdate에서 본다.

| BPM | 속도(f32) | swing 프레임 | 초 |
|---|---|---|---|
| 90 | 0.75 | 27 | 0.450 |
| 100 | 0.8333333 | **24** (double 계산이면 25) | 0.400 |
| **120** | **1.0** | **20** | **0.333** |
| 150 | 1.25 | 16 | 0.267 |
| 180 | 1.5 | 14 | 0.233 |
| 240 | 2.0 | 10 | 0.167 |

- **mg1801 회색 박스의 임시 휘두름 0.3초는 120 BPM 기준 20프레임(0.333초)으로 바꾼다.** 일반식은 "f32 누적 프레임 ≥ 20이 되는 진행 횟수"다.
- mg1801의 BPM은 리듬 담당 결론상 120이다(파티·단독 모드. 롱 모드 후반만 180) — SHARED.md.
- 같은 프레임에 새 모션이 한 칸 진행하는지에 따라 ±1프레임 차이가 날 수 있다 **[미확정]**(§8).

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
- 대상 회전 qT: 대상 위치를 head_aimcont 부모(head) 공간으로 바꾼 방향 d 로, +Z(상수 0x71015d1f50)에서 d 로 가는 최단 회전(1 + d.z ≤ ulp 면 (1,0,0,0)). 대상 없음·`headLookEnabled` 꺼짐이면 단위. 같은 대상의 캐릭터 공간 방향 z 를 impl+0x230 에 둔다. 마지막에 offset 각(+0x90, 모두 0)을 곱한다. 뒤쪽 데드존(+0xA4 20°·+0xA8 60°·+0xAC 40°) 분기가 있다(대상이 등 뒤일 때).
- 머리: q = slerp(단위, qT, w). w = 주 슬롯 모션(fskb) user data `headLookWeight` 가 0 이상이면 그 값(+0x23C, `FUN_71001c1380`), 아니면 +0xB8. 대상이 있으면 YZX 분해(x = atan2(2(wx−yz), w²−x²+y²−z²), y = atan2(2(wy−xz), w²+x²−y²−z²), z = asin 2(xy+zw)) → [min, max] 자름(chinCoef ≠ 0 이면 max.x 에 chin 각 보정) → ZYX 로 재구성(SinCos 표 항목 = cos 먼저로 봄 **[추정]**).
- 따라가기(+0xC4 모드, 기본 4): ω = acos(q·지난 q)/dt. ω ≤ 120°/s 면 임계 감쇠 스프링(k = min(2000, speedCoef^2.252184·17851.338), 감쇠 2√k, 쿼터니언 성분별, 정규화), ω ≥ 240°/s 면 선형(linearSpeed rad/s 로 회전), 사이는 둘을 (ω−120°/s)/(120°/s) 로 slerp. dt = 프레임 시간(1/60)·|주 슬롯 속도|(+0xC8)·대상 속도 배율(+0x1E0). 결과를 head_aimcont 로컬에 곱한다. neck_roll(+0xC9, pc54 만 있음)은 이어서 보정.
- 눈: +0xC0 = 1 이면 t = min(2, clamp(+0x230 + 1.8, 0, 2)·(eyesW − 머리 w)), qe = slerp(단위, qT, t)(1 을 넘으면 연장). qe 의 X(pitch)·Y(yaw)로 uv = t_offset + (yaw·cos r + pitch·sin r, −(−yaw·sin r + pitch·cos r))·t_scale 를 [t_min, t_max]로 자른다. 출력(+0x100/+0x140) += (uv − 출력)·0.6, 섞임비(+0xF8/+0x138) += 0.6·(1 − 섞임비). 대상 없음·눈 꺼짐이면 uv = t_offset, 둘 다 0.3 이고 섞임비는 0 쪽. 셰이더 파라미터(모드 2) = 모션 값 + (출력 − 모션 값)·섞임비, 그 값이 다음 출력.
- impl 기본값(`FUN_71001bee00`): limitMin/Max (−10°, −90°)/(10°, 90°), speedCoef 0.12, linearSpeed 5, headLookWeight 0.5, eyesLookWeight 1, 눈 따라가기 0.6, +0x230 = 1, +0x240 = 1.
- mg1801 모션 중 `headLookWeight` user data(값 0.0)가 있는 것은 pc01·pc02·pc06·pc13 의 co_win00a/b 뿐이다 [데이터].

### 6.9 눈동자 UV [데이터 + 추정]

- body_m 재질의 `material_utility_parameter0/1`이 눈 두 개의 UV 이동이다(characterlist `eye{0,1}_shaderparam`, 모델 user data mirror 쌍). `material_texture_srt1/2`가 같은 값을 따라간다 [데이터: ftsb.fmab].
- 모션의 ftsb.fmab가 기본값(대기 (0.0144, 0.09)·(2.0144, 0.09))을 준다. 시선이 그 위에 더해진다 **[추정]**. 눈 UV가 x 2.0만큼 떨어진 것은 눈 배열 텍스처 안에서 좌우 눈 영역이 다르기 때문으로 보인다 **[추정]**.

### 6.10 흔들림 본 [판독 + 미확정]

- mg1801은 Ending에서만 명시적으로 켠다(`SetEnabled(true)` + `RequestTeleport`). 생성자에서는 KOOPA_JR만 끈다. 다른 캐릭터의 기본 상태는 **[미확정]**이다.
- `RequestTeleport`는 결과 위치로 순간 이동한 직후 강체가 튀지 않게 하는 용도다 **[추정]**.

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

- **타이밍**: 게임 파이버(0x0E)가 `Play`·`SetSpeed`를 부르고, 애니메이션 처리기가 같은 프레임 뒤 타이밍에서 진행한다([01_core](01_core.md)). 그래서 `IsFinished()`는 이전 프레임까지의 진행 결과다. 새로 재생한 모션이 그 프레임 진행에 포함되는지(첫 표시 프레임이 0인지 speed인지)는 **[미확정]**이다. 웹은 "요청 프레임 진행 포함"으로 두고 골든이 생기면 맞춘다.
- **BPM 변화**: 속도는 생성 때(`SetSpeed`)와 매 `Play`(speedValid)에서만 정해진다. 재생 중 BPM이 바뀌면 다음 `Play`부터 반영된다 [판독].
- **시선과 애니**: ComHeading은 주 슬롯 애니 결과 위에 덮는다(`SetSkeletalAnimationSlot(Main)`). 로직(판정)에는 영향이 없는 화면 전용이다.
- **물리**: 화면 전용이다. 판정·위치 로직과 무관하다.
- **입력 차단**: `inputEnabled = 0`이어도 모션 상태기계는 돈다(§5.2).

## 9. 웹 포팅 구조와 구현 순서

### 9.1 모듈과 책임 (권장 — 아직 web/script에 없음)

| 모듈(웹 권장 이름) | 위치 | 책임 |
|---|---|---|
| `core/motion.ts` `MotionSlot` | 로직(노드에서도 돎) | §6.3~6.6 규칙 그대로: 이름 해시, forceRestart, speedValid, 시작 프레임(idle 맵·loopPrev), f32 프레임 진행, 루프·끝 판정, FX 이벤트 프레임 통과 사건 |
| `core/chara.ts` | 로직 | PlayerCharacterID 표(§4.1), 의자 분류, 시선 예외(14·18·19), `characterlist` 값 |
| `view/chara_library.ts` | 화면 | 캐릭터 모델 glb 로드·캐시, 클립 지연 로드, `SkeletonUtils.clone`으로 4인 인스턴스 |
| `view/chara_actor.ts` | 화면 | state의 `{clip, frame}`을 `mixer.setTime(frame/60)`로 적용(누적 시간 쓰지 않음), 전이 크로스페이드, 소품 부착, 시선 근사, 눈 UV |
| 도구 `tools/character_glb.py` | 변환 | 모델 glb + 클립(이미 있음). 다음 단계로 "클립만 든 glb" 출력 옵션 추가 |

로직 → 화면 계약(state)에 플레이어마다 다음을 넣는다. DESIGN §4: 골든 대조용.

```ts
interface CharaMotionState { clip: string; frame: number /* f32 */; speed: number; prevClip: string | null; blendFrames: number; blendElapsed: number }
interface CharaState { charId: number; motion: CharaMotionState; headTarget: [number, number, number] | null; headLook: boolean; eyesLook: boolean; physics: boolean; propsVisible: boolean }
```

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

`tools/character_verify/motion_ref.ts`가 실행 가능한 기준 구현이다. 웹 `core/motion.ts`는 이것을 옮긴다.

```ts
class MotionSlot {
  play(arg: MotionArg): void            // §6.3 + §6.4 (pendingArgs 없이 바로 적용해도 결과 같음)
  setFrame(f: number): void
  setSpeed(s: number): void             // ActorAnimationSlot::SetSpeed: 같은 값이면 무시
  step(): void                          // §6.6, f32 누적
  isFinished(): boolean                 // 비루프 && frame >= FrameMax
  crossed(f: number): boolean           // 이번 step이 프레임 f를 지났는지 (FX 트리거)
}
```

mg1801 Player는 mg1801.md §6.5와 이 문서 §5.2·§4.3의 MotionArg 값으로 구동한다.
- idle: `{forceRestart:1, speedValid:1, speed:f32(BPM/120), startFrame: SyncIdleMot ? elapsed%30 : 0, blend: SyncIdleMot ? 0.2 : default}`
- swing: 같은 값에 `startFrame 0`

### 9.4 화면(three.js)

- **클립 적용**: 매 렌더에서 `action.time = frame/60`(또는 `mixer.setTime`)로 둔다. 루프는 로직이 이미 감았다. 원본처럼 클립 끝 프레임(N/60)까지 샘플이 있다.
- **전이**: `blendFrames > 0`이면 이전 클립을 `prevFrame`에 고정하고 가중치 `1 − elapsed/blendFrames`로 섞는다. mg1801은 0~1프레임이라 즉시 교체해도 화면 차이가 1프레임 이하다. 블렌드에서 `NDcha_pos`는 제외한다(user data `bex_no_transit_bone`) **[추정]**.
- **소품**: `attach_R_hand` 노드에 칼 glb를 자식으로 붙인다(오프셋 없음 — `SetModelHook`에 오프셋 인자 없음 [판독]).
- **시선** [판독, §6.8 식 그대로 — mg1801 view/character.ts]:
  1. 애니 적용 뒤 `head_aimcont` 로컬을 바인드(단위)로 되돌린다(클립에 이 뼈 트랙이 없어 안 되돌리면 누적된다).
  2. 대상 위치를 head 공간 방향으로 바꿔 +Z 에서의 최단 회전 → slerp(가중치) → YZX 분해·자름·ZYX 재구성.
  3. 모드 4 따라가기(스프링·선형)를 원본 프레임(장면 프레임 수)마다 진행해 `head_aimcont` 로컬에 넣는다.
  - 눈은 같은 대상 회전으로 §6.8 의 uv 를 구해 모션 값과 섞임비로 섞는다.
  - 남은 근사: chin 각 보정(pc05·pc56), neck_roll 보정(pc54), 뒤쪽 데드존 분기, SinCos 표 배치(cos 먼저) — mg1801 대상은 늘 앞쪽이다.
- **흔들림 본**: apx(PhysX) 대신 뼈 체인 스프링으로 근사한다 **[추정]**. mg1801은 Ending 연출에만 의미가 있다. 우선순위가 낮다.
- **표정**: 우선은 `fcl_blink00`을 눈꺼풀 뼈 4개에만 겹쳐 재생한다(가산이 아니라 해당 뼈 덮어쓰기). 원본 슬롯 구성은 미확정이다.

### 9.5 클립 이름 규칙과 지연 로드

- 클립 이름 = 원본 모션 이름(접두 `pcNN_` 없음, `rhy_knife_idle00`). glb `animations[i].extras`에 `{frames, loop, fps:60, archive, nameHash}`를 둔다(`tools/character_glb.py`가 이미 한다).
- 모델과 클립을 나눈다.
  - `assets/chara/pcNN/model.glb`: 클립 없음, 텍스처 png 별도
  - `assets/chara/pcNN/motion/<archive key>/<motion>.glb`: 뼈 노드 + 클립 하나. three.js는 트랙 이름(`뼈이름.quaternion`)으로 묶으므로 모델에 그대로 쓴다.
  - 장면은 원본처럼 `pcMotionArcList[장면]` 키 목록을 읽는다. 그중 코드가 `AddAnimation`하는 이름만 실제로 받는다. mg1801 = `rhy/rhy_knife_idle00`, `rhy/rhy_knife_swing00`.
- 상주 키(`co`, `mg`, `fcl`, `mn`)는 원본에서 boot 때 전부 싣는다. 웹은 쓰는 것만 받는다.

### 9.6 용량 추정 [실행: 측정 + 계산]

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

### 9.7 구현 순서 (권장)

1. `core/motion.ts`를 `motion_ref.ts`에서 옮긴다. 노드 시험: §6.7 표와 같은 swing 프레임 수, idle 루프, 같은 이름 재요청 무시.
2. mg1801 Player 로직에 연결한다(회색 박스 0.3초 → 20프레임 상당). `npm run check` 결정성을 확인한다.
3. 변환: `tools/character_glb.py`를 22명에 돌린다. 클립만 든 glb 출력을 추가한다.
4. 화면: 모델 + 클립 적용(frame 직접 지정), 칼 부착, 의자 높이.
5. FX 트리거 프레임 이벤트(SE 프레임 2). 보이스는 프리셋상 MUTE다.
6. 시선 근사, 눈 UV, 깜빡임.
7. Ending 물리 근사(선택).

### 9.8 웹 환경 때문에 바꾸는 부분과 동등성

| 원본 | 웹 | 동등성 유지 |
|---|---|---|
| FRES 곡선(Hermite·Cubic) 실시간 평가 | 60fps 정수 프레임 베이크 + 선형 보간 | 로직 프레임은 정수×속도다. 속도 1이면 정수 프레임만 샘플하므로 같다. 속도 ≠ 1이면 프레임 사이 선형 보간 오차가 있다(화면 전용) |
| bezel 슬롯·컨트롤러·리스너 | 단일 `MotionSlot` | §6.3~6.6 결과(프레임·속도·끝 판정)가 같아야 한다 |
| ComHeading 갱신 식 | §6.8 그대로(chin·neck_roll·뒤쪽 데드존 제외) | 화면 전용. 로직 영향 없음 |
| PhysX 물리 애니 | 스프링 근사 또는 생략 | 화면 전용 |

## 10. 검증 코드·실행 결과·기대값

| 종류 | 내용 | 결과 |
|---|---|---|
| 원본 명령 판독 | Ghidra 디컴파일·디스어셈블(§2 파일) | 이 문서 §4~§6 |
| 데이터 확인 | `bfres_probe`로 22명 `rhy_knife_*` | 전원 idle 30·루프, swing 20·비루프 |
| 데이터 확인 | `tools/character_motion_index.py` | 85 아카이브, 이름 1,027개, fskb 18,910개 프로브 오류 0, 캐릭터마다 길이가 다른 이름 302개 → `extracted/converted/character/motion_index.json` |
| 데이터 확인 | FNV-1a 64 계산 vs mg1801 상수 2개 | 일치 |
| 변환 실행 | `python tools/character_glb.py`(기본 pc01 + rhy_knife_idle00·swing00·co_idle00·fcl_blink00) | `pc01_mario.glb` 3,055,120 B, 노드 98, 메시 3, 정점 13,013, 삼각형 6,975, bindErr 3.3e−7, 누락 텍스처 0 |
| 독립 로드 | `node tools/character_verify/run.mjs tools/character_verify/check.ts pc01` (three GLTFLoader, 텍스처 스텁) | `ok: true`. 스켈레톤 뼈 94 = FRES 94. 클립 4개의 길이×60 = FSKA FrameCount(30/20/120/380), loop 일치. 정수 프레임 믹서 포즈 = 저장 키(오차 ≤ 1e−6). swing 0→8프레임 `attach_R_hand` 이동 0.963. idle 0↔30프레임 손 위치 차 0(루프 이음매) → `verify_three.json` |
| 재구현 계산 | 같은 check의 `motion_ref.ts` + mg1801 MyUpdate 흉내 | §6.7 표(120 BPM 20프레임) |
| 헤드리스 렌더 | `node tools/character_verify/run.mjs tools/character_verify/shot.ts pc01` (chromium swiftshader) | `extracted/converted/character/pc01/filmstrip.png`: idle f0 \| swing f0·4·8·12·16·20 \| co_idle f60, 칼 부착. 포즈 변화 확인. 몸 색은 UV 미보정이라 어긋남(§4.2). 콘솔 오류는 404 1건(favicon 추정)뿐 |
| 원본 실행 | 없음 | — |

함수·변환 시험 통과는 원본 동작 재현 확인이 아니다. 다음은 검증하지 않았다.
- 원본 실행 화면과의 프레임 대조
- 리스너 호출 순서(§6.4)
- 전이 블렌드 실제 길이(§6.5)
- 시선 식
- 물리

기대값(웹 구현 뒤, 같은 가정):
- 120 BPM에서 휘두름 요청 프레임 t에 swing frame 0 → t+20 프레임 MyUpdate에서 idle 재생(frame 0).
- idle은 30프레임마다 정확히 한 바퀴.
- 같은 프레임에 두 번 휘둘러도 swing은 0부터 한 번.

## 11. 미확정 사항과 추가 분석에 필요한 근거

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| 시작 리스너가 노드 교체 전인지(§6.4) | idle 시작 프레임(0 / 난수) | `FUN_710080ade4`(컨트롤러 요청 처리)와 리스너 등록 객체(`FUN_7100818200` 반환, `FUN_7100105d80` 목록)의 호출 순서 판독 |
| blendTime 단위, mpat `a`의 의미와 우선순위, 슬롯 모드 +0x54 | 전이 길이(mg1801은 0~1프레임) | `FUN_7100813bf0`, `AnimationExpressionTransition` 갱신(+0x50 증가량), mpat를 읽는 컨트롤러(`FUN_710010589c` 등록 대상) 판독 |
| 프레임 진행량(dt 곱 여부), FrameMax = FrameCount 여부 | 가변 프레임 장면의 모션 속도 | `AnimationNodeClip::GetFrameMax` @0x7100811820, 슬롯 갱신 함수 |
| 새 모션의 첫 진행 시점 | ±1프레임 | 애니메이션 처리기 타이밍과 재생 요청 적용 순서 |
| ComHeading chin 각 보정·neck_roll 보정·뒤쪽 데드존 | pc05·pc56 턱, pc54 목, 등 뒤 대상 | `FUN_71001c1694` @0x71001c3780 부근(chin), @0x71001c4948 이후(neck_roll), `FUN_71001bfe08` 데드존 분기 디스어셈블리 판독 |
| 표정 슬롯 구성(fcl_* 재생 주체), 얼굴 키셰이프 구동 | 깜빡임·표정 | `AddAnimationSlot(name)` 호출자 검색, `face_param.json` 소비자 |
| ComPhysicalAnimation 기본 상태·뼈 대응 | 흔들림 | apx 강체 이름(scene 담당 파서로 덤프), `SetEnabled` 호출자 |
| `_light` 모델 사용 장면 | LOD | `fmdb light` 레코드 접근자 호출자 |
| 몸 UV 식(v' = 0.5+0.5v 관측, 웹 적용됨)·눈동자 합성 식(TEXCOORD_1 − 오프셋, 흰자 마스크 추정) | 색(현재 렌더는 맞아 보임) | 셰이더 그래프(그래픽 담당) |
| MotionArg +0x4C 의미 | 없음(mg1801 항상 1) | 슬롯 +0x54 사용처 |

## 부록 A. 도구 사용법

```sh
# 모션 색인 (약 40초)
.venv/Scripts/python tools/character_motion_index.py
# 캐릭터 glb (기본 pc01 + 4클립). 다른 캐릭터·모션: tools/character_glb.py pc03 rhy_knife_idle00 rhy_knife_swing00
.venv/Scripts/python tools/character_glb.py
# 독립 검증·렌더 (web/node_modules 의 three·esbuild·playwright-core 사용, 설치 없음)
node tools/character_verify/run.mjs tools/character_verify/check.ts pc01
node tools/character_verify/run.mjs tools/character_verify/shot.ts pc01
# Ghidra (캐릭터 전용 사본)
MSYS_NO_PATHCONV=1 ./tools/ghidra_12.1.2_PUBLIC/support/analyzeHeadless.bat c:/dev/mpj/ghidra_work/character jamboree_main \
  -process main.nso -noanalysis -readOnly -scriptPath c:/dev/mpj/tools/ghidra_scripts \
  -postScript CharacterDecompAddr.java <out.c> <주소> name:<전체이름> ptr:<주소>:<개수>
```
