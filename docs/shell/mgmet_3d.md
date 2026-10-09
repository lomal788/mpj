# mgmet — 미니게임 항구 3D 장면 규모 조사·웹 반영 계획

2026-10-08. 상태: **항구 3D 구현 중단(2026-10-08, 사용자 결정) — 분석·부분 구현까지.** 한 것·남은 것은 §8, 공용 3D 무대 계약은 [stage3d.md](stage3d.md)(다음 재사용처 = 광장 menu00 3D). 흐름 쪽은 [mgmet_flow.md](mgmet_flow.md)에 있다(§5.2 3D 대기 지점, §9 웹 구조). 이 문서는 그 흐름 뒤에 붙일 3D 무대(섬·바다·하늘·NPC·탈것·카메라)의 양과 위험 요소, 웹 반영 순서만 정리한다.

근거 표기: [데이터] = 추출 파일을 도구로 센 값, [판독] = 디컴파일 C·NRO 문자열, [추정] = 이름·길이로 짐작한 것, [미확정] = 근거 없음.
집계에 쓴 도구: `graphics_bfres2gltf dump/anim`(모델·fskb·fsnb·fmab), `effect_vfxb.py tree`, NRO 문자열 덤프. 임시 결과는 scratchpad에만 두었다.

## 1. 규모

### 1.1 `mgm~mgmet.nx.bea` (123 MB, 파일 444) [데이터]

| 분류 | 개수 | 크기 | 내용 |
|---|---|---|---|
| 지형 모델 fmdb | 10 | 8.4 MB | `map00`(본섬, 정점 71,235·뼈 95=로케이터) · `map00_l/_r`(BG_Map00_L/R 좌우 배경) · `map00_light` · `map01`(mgm01 무대·천막·다리, 뼈 26·fskb 300f 루프) · `map02~05`(액티비티 입구 게이트·간판, 각 약 6.7k) |
| 배경 모델 | 4 | 0.5 MB | `sky00`(구름 포함 183정점) · `sea00`/`sea00_op_c01`(바다·해저, 오프닝용 따로) · `seagul00`(갈매기, 25뼈 + idle 600f) |
| 소품 | 3 | 0.3 MB | `rockfall`(MGM06Rock, 5,246정점) · `camera`(엉금엉금 카메라맨 소품, 렌즈 굴절 재질) · `vehicle00`(탈것 로케이터 13뼈 + 120f 루프) |
| 로케이터 fmdb(3정점 더미, 뼈만 의미) | 13 | 0.3 MB | `mgmXX_result_pos`·`mgmXX_vehicle_pos`·`mgm06_pos/release_pos`·`npc_op_c01`·`mgm01_approach/departure_c01` — 캐릭터·NPC·탈것 소켓 |
| **모델 합계** | **28 + env 6** | 9.6 MB | **정점 187,768 / 삼각형 224,197**, 재질 102(전부 `forward_plus_color`) |
| 스켈레탈 애니 fskb | 26 | 0.1 MB | 위치 애니(approach/departure 240f, mgm01_approach 500f, mgm01_departure 150f, npc_op 420f, mgm06_release 330f 등) |
| 재질 애니 fmab | 4 | 작음 | `sea00`(2700f), `sea00_op_c01`(2700f), `env00`·`env00_op_c01`(900f) |
| 카메라 fsnb | 31 | 작음 | §4 표. 오프닝 `op00` 180f·`op_c01` 420f·`op_c02` 180f·`op_c03` 30f, 선택 `mgmXXin` 각 90f(6개), `mgm01_departure_c01` 150f, mgm02~05 approach/departure 각 240f, result c01 120f·c02/c03 30f, mgm06 introduce/release/htp |
| 환경 컨테이너 | 6 fmdb | — | `env00`·`dir_light00`·`post00` 각각 + 오프닝용 `_op_c01` 짝(MapLight/OPLight, Post/PostOp01 전환) |
| 텍스처 bntx | 163 + env 7 | 107.6 MB + 0.6 MB | 알베도 45·노멀 32·거칠기 29 · **라이트맵 gi 9·ao 10·sdw 9**(map01 은 `before` 짝 있음) · IBL(mgmet/sky00/cha irr·rad) · 바다 mask/flo/tide 등. 2.8 MB 짜리 7장(mgm01_stage mask, palm, sea_alb 등) |
| 셰이더 팩 | 1 | 1.7 MB | `_mgm/mgmet.bnbshpk` (셰이더 그래프 프로그램 원천) |
| 이펙트 VFXB | 1 | 0.19 MB | `mgmet_star_get_01~03` 3세트·이미터 8(별 획득 연출) |
| 게임 데이터 | 2 json | 9 KB | `mgmet_info.json`(mgm04 결과 배치 오프셋), `mgm_dailytrial_mgpack.json`(3D 무관) |
| SE 트리거 ftrg | 1 | — | `se_mgmet_mgm04_vehicle_pos` |

맵 배치는 nbmap·MapStructure가 **없다**. 배치는 전부 로케이터 모델 뼈 이름(`pos_mgmNN_pcNN(_start)`, `pos_mgmNN_guide`, `pos_npcNN(_op)`, `pos_sitting_npcNN`, `pos_boat_npcNN`, `pos_jetski_N` …)으로 정해진다 [데이터].

### 1.2 다른 아카이브에서 끌어오는 것

| 출처 | 쓰는 것 | 규모 |
|---|---|---|
| `mgm~mgm00.nx.bea`(모든 모드 장면이 싣는 공용, 06_scene_data §1.5) [판독] | 탈것: `mgm01_boat00`·`mgm01_screen00`(+`mgm01_screen00_mgmet_out` 150f)·`mgm02_submersible`·`mgm03_boat/jetski`·`mgm04_cruiser/banana/rope/ring`·`mgm05_cruiser/winch` + 이 장면 전용 fskb 5 | fmdb 36(정점 45,741), fskb 141, fmab 29, bntx 93(51.7 MB). 항구가 실제로 쓰는 것은 그 일부 [미확정: 어떤 탈것이 대기 중 보이는지] |
| 안내 NPC 5종(NRO `GuideNpc1_Kinopio`~`5_Punpun`) [판독] | `chara~npc022`(키노피오) · `npc003`(엉금엉금, 카메라맨 겸) · `npc017`(쥬겜) · `npc097`(붐붐) · `npc116`(펑펑) | bea 합 47 MB. mgm06 은 `im_npc103_name`(npc103 가짜 쿠파, 24 MB)도 참조 |
| 배경 NPC(`pos_npc00~06`, `10~15`, 앉은 NPC 7, 보트 NPC 14) | 종류 [미확정] (`Npc%02d_%02d` 형식만 확인) | 최대 약 30체 |
| 플레이어 4명 | charselect 와 같은 pcNN glb + 모션 `co_idle00/01·co_walk00·co_run00·co_joy00·co_talk00·co_applause*·co_bye*` 등, 보드 모션 `bd_*`(bd_sandart00, bd_cam_*) | 캐릭터 1명 수 MB |

## 2. 특수 셰이더·위험 요소

재질 102개 중 **셰이더 그래프(`static_opt_shader_graph 1`) 42개**, mgm00 탈것 쪽 추가 약 10개 [데이터]. 기존 웹 렌더(mg1801 `material.ts`의 라이트맵·IBL, glb PBR)로 그리면 색·움직임이 틀어질 것:

| 재질 | 특징 [데이터] | 위험 |
|---|---|---|
| `mgmet_ocean00_mt`(바다) | 그래프 + `water_enable` + srt0, 샘플러 sg_utility 0~2 + 국소 반사 큐브, fmab 2700f | **가장 큼**. 알베도 슬롯이 없어 glb 그대로면 검게 나온다(mg1801 수프와 같은 문제 → `water.ts` 처럼 근사 셰이더 필요). 오프닝용 `sea00_op_c01` 따로, `ChangeSeaTexture` 호출 있음 |
| `mgmet_seabed_mt`, `mgmet_sand00/02_mt` | 그래프 + sg_utility 7장(마스크·조수 `tide`·흐름 `flo` 추정) | 해변 물결·젖은 모래 섞기 [추정]. 근사 없으면 마른 모래 한 장 |
| `mgmet_cliff_loop/remains_rock`, `palm00/bush00/leaf00` | 그래프 + sg_utility 1~2장(+ punchthrough·양면) | 식물 흔들림(정점 이동) 가능성 [추정] — 없으면 정지 |
| `mgmet_billboard00`, `mgmet_gate01~04`, `mgmet_bridge00_*` | 그래프 + sg_utility 1~4장 | 간판 잠금/해금 표시를 파라미터로 바꿀 수 있음 [추정] → 액티비티 개방 상태 반영 위험 |
| `mgm01_stage_mt`, `mgm01_fabric00_mt`(천막) | 그래프 + 반투명(state_type 1) + sg_utility 6장 | map01 fskb(300f) 천 흔들림과 함께 |
| `mgmet_cloud00_mt`, `mgmet_sky00_mt` | srt0(UV 이동) + 반투명 | fmab 없음 → 원본 이동 속도 출처 [미확정] (env fmab 900f 쪽일 수 있음) |
| `qtbd01_1107b_mt`(카메라 렌즈) | `refraction_enable` | 무시 가능 |
| 탈것 유리(`glass*`) | state_type 2 | 일반 투명으로 충분 |

그 밖의 위험:
- **라이트맵 + 이전/이후 짝**: `mgmet_map01before_*`(gi/ao/sdw) — mgm01 무대 상태에 따라 라이트맵을 바꾼다 [추정]. mg1801 `material.ts`의 라이트맵 경로가 그대로 맞는지(UV1·BC6H .hdr) 확인 필요.
- **툰 외곽선**(`toon_depth/normal_outline` 155재질)·안개(`fog` 102재질)·수중(`draw_under_water` 54): mg1801 은 외곽선·안개를 넣지 않았다. 섬 전경에서 외곽선 유무가 눈에 띌 수 있다.
- **텍스처 용량**: 원본 BC 압축 159 MB(mgmet 108 + mgm00 52) → PNG 로 풀면 수백 MB. 로딩 시간·메모리를 위해 해상도 줄이기/KTX2 검토 필요.
- 카메라는 mg1801 과 달리 **커브가 있는 애니**(30~420f)다. mg1801 `camera.ts`는 고정 시점만 다룬다 → fsnb 프레임 재생기 새로 필요.

## 3. 재사용 도구·문서 대응

| 항목 | 도구/문서 | 판단 |
|---|---|---|
| 지형·배경·소품·탈것 모델 → glb, 텍스처 → png | `graphics_convert.py`(세트 함수만 추가: mgmet, mgm00 일부) + `graphics_bfres2gltf`·`graphics_bntx.py`, 03_graphics §4·5·7 | **그대로 됨**. 로케이터 뼈는 glb 노드로 남음 |
| fskb·fmab·fsnb → 프레임 json | `graphics_bfres2gltf anim`(이번 조사에서 31 fsnb·4 fmab 모두 성공), 07_camera_lighting §6·7.2 | **그대로 됨**. Aim 모드·fovy 규칙은 07 §6.2 |
| env/dir_light/post 컨테이너 값 | `camera_probe env`, 07 §7.3~7.5 | 그대로 됨 |
| 라이트맵·IBL 재질 | mg1801 `view/material.ts`(250줄), 03 §7 | 로직 재사용 가능. 단 셸 모듈은 `script/games` import 금지(mgm_common §9.1) → **복사·이식** |
| 바다·모래 셰이더 그래프 | `bnbshpk_split.py` → `bfsha_dump` → `sass_dis.py` 경로(charselect.md 12.11), `charsel_body_graph.py` 방식 | 경로는 있음. 바다 1~2재질만 판독하고 나머지는 근사 권장. mg1801 `water.ts` 근사가 출발점 |
| 안내 NPC·배경 NPC·플레이어 | `character_glb.py`(npcNNN 지원), `charsel_chara.py` 정리 규칙, 09_character §6, charselect `preview3d.ts`(블렌드·시간축) | 그대로 됨. NPC 모션 이름 목록만 뽑으면 됨 |
| 별 이펙트 VFXB | `effect_vfxb.py dump`, 08_effects, mg1801 `view/effects.ts`(962줄) | 형식은 됨. 셸에서 쓰려면 이식 필요 → 후순위 |
| 배치 | nbmap 도구(`scene_nbmap.py`) **불필요** — 로케이터 뼈 | 표만 만들면 됨 |

## 4. 3D 신호 ↔ 3D 요소 (추가 판독 결과는 §7 ②)

`web/script/app/scene/world/mgmet/types.ts` `MgmetSignals` 8개(현재 `IMMEDIATE_SIGNALS` = 모두 즉시 참) [설계].

| 신호 | 원본 대기 [판독, mgmet_flow §5.2] | 대응 3D 요소 | 길이가 데이터로 정해지나 |
|---|---|---|---|
| `openingDone` | actor `GetFrame() > 390` → fade 1.0 s + 1.0 s → `Camera::IsFinished && IsAllPlayerIdle` | 오프닝 카메라 `mgmet_cam_op_c01`(420f)·`op_c02`(180f)·`op_c03`(30f), NPC 오프닝 위치 `mgmet_npc_op_c01`(420f, 뼈 `pos_*_op`), 오프닝 환경 `*_op_c01`, 플레이어 `GetOp2CharaStartSocket`→걷기 | 클립 길이는 [데이터]. 390 을 보는 actor 가 npc_op(420f)인지, 카메라 순서·속도 [미확정] |
| `zoomDone` | `Camera::StartOpZoom` → `IsFinished` | 줌 카메라 — 후보 `mgmet_cam_op00`(180f) 또는 `mgmet_cam00`(240f) | [미확정] (StartOpZoom 본문 미판독) |
| `coinBattleEventDone` | 복귀(+0x334) 때 `MapManager::IsFinishedCoinBattleEvent` | 액티비티 결과 연출: `cam_mgmXX_result_c01~03`(120/30/30f) + `mgmXX_result_pos`(결과 NPC `ResultNpc00~04`) | 이름과 내용 연결 [미확정] |
| `selectionCameraIdle` | `ComMgmetCamera::IsIdle` | `Camera::StartModeSelect(id)` → `mgmet_cam_mgmXXin`(각 90f) [추정: 이름] | 90f 는 [데이터], id→파일 매핑·보간 [미확정] |
| `npcReady` | 안내 NPC `ComNpc+0x58 == 1` | 안내 NPC 5종의 `GuideNpcChangeAction`·위치 `pos_mgmNN_guide(_start)`, 대사 모션(`co_talk00`·`md_talk00`) | 0x58 이 1 이 되는 조건 [미확정] |
| `modeZoomDone` | `Camera::IsFinished`(FreeplayBefore/Main·액티비티 시작) | 선택 후 줌 — 프리 플레이는 `mgm01in`(90f) 후보 | [미확정] |
| `departureDone` | 1.0 s 뒤 `MapManager::Mgm01_IsFinishedEventPosAnim` | 위치 애니 `mgmet_mgm01_departure_c01.fskb`(150f, 뼈 `pos_mgm01_jetty_guide`) + 같이 트는 카메라 `Camera::PlayAnim("mgm01_departure")` = `mgmet_cam_mgm01_departure_c01`(150f) [판독: 문자열] + 보트 `PlayFreeplayBoatAnim` | 150f 는 [데이터]. 대기 대상이 카메라가 아닌 위치 애니라는 것은 [판독] |
| `allPlayersIdle` | `PlayerManager::IsAllPlayerIdle` | 플레이어 4명 `MoveModePos` 걷기·달리기(`co_walk00/co_run00`) 끝 | 이동 속도·경로 [미확정] |

정리: **클립 길이는 모두 데이터로 있다**(위 표의 프레임 수). 모르는 것은 "어느 함수가 어느 클립을 어떤 속도로 트는가"(Camera/MapManager/NpcManager 내부, mgmet NRO 미판독 함수)다. 판독 없이 반영하려면 이름 짝으로 [추정] 매핑하고 문서에 표시한다.

## 5. 웹 반영 계획

### 5.1 모듈 위치 [설계]

- `web/script/app/common/render3d/` **공용 3D 무대**(엔진 독립, mgm_common §9.1 규칙: `three`·같은 폴더만 import, `script/games|view|core` 금지). 내용: glb 로더·라이트맵/IBL 재질(mg1801 `material.ts` 이식), fsnb 카메라 재생기(프레임 json, Aim·fovy 규칙), fmab 재질 애니(srt·파라미터), 로케이터 소켓 조회, 캐릭터 액터(charselect `preview3d.ts`의 블렌드·시간축 일부 이식). 이후 mgm01~06 항구 장면·보드에서도 재사용.
- `web/script/app/scene/world/mgmet/world3d/` **항구 전용**: `MapManager`·`NpcManager`·`PlayerManager`·`Camera` 대응 어댑터 + `MgmetSignals` 구현. 허브(`hub.ts`)는 지금처럼 신호만 받는다 → 3D 를 끄면 `IMMEDIATE_SIGNALS` 로 그대로 돌아감.
- 변환: `web/tools/analysis/mgmet_world_assets.py`(신규) → `web/assets/mgmet/world/`(glb·png·anim json·manifest). `graphics_convert.py`에는 세트 함수만 추가.

### 5.2 단계·예상 시간 — 우선순위 반영 (2026-10-08 갱신)

범위 밖(사용자 결정): 코인 배틀 등 액티비티 결과 이벤트(`IsFinishedCoinBattleEvent`·result 카메라), NPC 대화·상호작용, 별 VFXB. 웹은 `coinBattleEventDone` 을 즉시 참으로 둔다.
막힘 여부 근거는 §7.

| 순위 | # | 작업 | 막힘 | 예상 |
|---|---|---|---|---|
| 1 | 1 | 변환: mgmet 모델 34·텍스처 170·anim 35 + 배경·안내 NPC glb + 플레이어 `co_*` 모션 → web 에셋, 텍스처 축소 | 없음 | 45분 |
| 1 | 2 | `stage3d` 공용: glb·재질(라이트맵·IBL·punchthrough·양면)·fskb/fmab 재생·로케이터 소켓 | 없음 | 60분 |
| 1 | 3 | **맵 로딩**: map00~05·L/R·sky·sea + 오프닝/일반 환경 전환. **보이는 애니**: 바다·환경 fmab(2700f/900f 루프), map01 천막 fskb 300f, 탈것 로케이터 `vehicle00` 120f, 갈매기 `pos_seagull0N` + idle 600f, 구름 srt | 없음 | 45분 |
| 1 | 4 | 바다·모래 근사 셰이더(`water.ts` 출발) | 근사로 넘김 | 60분 |
| 1 | 5 | **NPC 배치·대기 애니**: 배경 NPC(`pos_npc01~06`·`pos_sitting_npc00~06`·`pos_boat_npcNN`) + 안내 NPC, 모션 `co_idle00`·`co_applause00`·`co_clap00`·`co_joy*`·앉기 `sit_*` | NPC 종류 표만 판독 20분 | 60분 |
| 1 | 6 | **플레이어 이동**: 소켓으로 자동 보간 이동(`MoveModePos`·`ArcMoveModePos`), 걷기/달리기 모션, 도착 회전, idle 판정 | 속도 출처 판독 20분 | 45분 |
| 2 | 7 | 카메라 클립 재생: 이름 표(`Camera::Initialize`)·선택 카메라 `cam00` 프레임 이동·오프닝 op_01~03·`*_in` 줌·`mgm01_departure` | 함수→클립 짝 판독 15분 | 45분 |
| 2 | 8 | 신호 연결(코인 배틀 제외 7개) + `mgmet_page` 통합 + 시험 + 헤드리스 마지막 1회 | `ComNpc+0x58==1` 판독 15분 | 45분 |
| — | 9 | (후순위) 툰 외곽선·안개·탈것 출발 애니·별 VFXB | | 60분 |

합계: 1순위 약 5.5시간(판독 40분 포함), 2순위 약 1.5시간(판독 30분 포함) → **직렬 약 7시간**(9 제외).

### 5.3 병렬 분할안 (SHARED.md 선점 필수)

- **A(맵)**: 1 → 2 → 3. `stage3d` 인터페이스(로더·소켓·애니 재생 API)를 먼저 `types.ts` 로 고정해 SHARED 에 올린다.
- **B(바다 셰이더 → 카메라)**: 4 → 7. 1이 나오기 전엔 카메라 함수→클립 짝 판독(§7 ②)부터.
- **C(인물 → 신호)**: 5 → 6 → 8. 2의 인터페이스 확정 전엔 NPC 종류 표·이동 속도·`ComNpc+0x58` 판독부터.
- 병렬 시 **약 3시간**(A 2.5시간이 임계 경로, C 가 뒤에 약 30분).

## 6. 미확정

| 항목 | 필요한 근거 |
|---|---|
| 오프닝 actor frame > 390 의 actor·클립(npc_op_c01 420f 추정) | `EnterEventFlow` 의 actor 포인터 출처, `NpcManager::SetNpcActionOp` |
| `StartOpZoom`·`StartModeSelect(id)`·모드 줌의 클립 이름·속도 | mgmet NRO `Camera::*` 본문(디컴파일 C 새로 뽑기) |
| `IsFinishedCoinBattleEvent` 가 기다리는 연출 | `MapManager` 해당 함수와 그 이벤트를 시작하는 쪽 |
| 안내 NPC `ComNpc+0x58 == 1` 의 뜻, 활동 ID ↔ 안내 NPC 5종 매핑 | `NpcManager::SetupNpc`·`GuideNpcChangeAction` |
| 배경 NPC 종류·수 | `NpcManager::SetupNpc` 의 표(Npc%02d_%02d) |
| 셰이더 그래프 식(바다·모래·간판 잠금 표시) | `mgmet.bnbshpk` SASS 판독 |
| 구름 UV 이동 속도 출처, map01 before 라이트맵 전환 조건 | env fmab 900f 내용, `MapManager` 의 map01 상태 함수 |
| 툰 외곽선·안개를 원본처럼 넣을지 | 원본 화면 대조(사용자 결정) |

## 7. 구현 막힘 요소 (2026-10-08 추가 조사)

근사로 넘어갈 수 있는 것(바다·셰이더 그래프 재질·텍스처 용량·외곽선)은 뺐다. 범위 밖(코인 배틀 이벤트·NPC 대화)도 뺐다.
근거 C: mgmet NRO 에 함수 이름 심볼이 있어서 `DecompileNamed.java`(`mgmcommon_ghidra_nro.sh`, 1회 약 30초)로 `mgmet::Camera`·`ComMgmetCamera`·`MapManager`·`PlayerManager`·`ComPlayer`·`ComNpc`·`Npc`·`NpcManager::SetupNpc/SetupBgNpc` 약 280개를 뽑았다 → `analysis/decomp/mgmet_3d_camera_npc.c`·`mgmet_3d_map_player.c`.

| # | 후보 | 막히나 | 근거 | 대안·추가 시간 |
|---|---|---|---|---|
| ① | 플레이어가 항구를 직접 걸어 다님(조작·충돌·내비) | **안 막힘** — 직접 조작 없음 | [판독] `PlayerManager`·`ComPlayer`·`MapManager` 163함수에 입력·Physics·Collision·Raycast 호출 0. 이동은 `ComPlayer::MoveModePos` @0x7100042cf0 = `ComActorAutoInterpolation::SetTranslationSpeed(기본속도×인자)`+`Start`(소켓까지 직선 보간), `ArcMoveModePos`/`UpdateArcMove` @0x7100043440 = 호 이동(진행 t/15, 0.85/0.15 이차 감속 + 캐릭터 값×0.01). 도착 판정 `ComPlayer::IsIdle` = `+0x48 == 1`, `IsAllPlayerIdle` = 전원 idle. [데이터] mgmet·mgm00 에 apx 없음 | 소켓 사이 보간 + 걷기/달리기 모션으로 재현. 지면 따라가기 불필요(소켓 높이 사용). 기본 속도 표(`this+오프셋`)·호 이동 상수만 판독 **20분** |
| ② | 대기 신호의 함수→클립·속도 | **안 막힘**(대부분 판독됨) | [판독] `Camera::Initialize` @0x710000fe90 이름 표: `camera`=cam00, `op_01~03`=op_c01~c03, `freeplay_in`=mgm01in, `coinbattle_in`=mgm02in, `tagmatch_in`=mgm04in, `dailytrial_in`=mgm03in, `endless_in`=mgm05in, `bossrush_in`=mgm06in, `mgmNN_departure/approach/result_NN`. `EnterOp/StartOp/StartOpZoom/ModeZoom/FreePlayIn` = 클립 재생 속도 1.0, `IsFinished` = 모션 끝. `StartModeSelect(id)` @0x7100011410 = **cam00(240f)을 정지 상태로 프레임 이동**: 시작 프레임 표 @0x71000e34f0 = (0, 45, 90, 135, 180, 240), `ComMgmetCamera::MoveDirection`이 45f 단위 목표로 ±방향 재생, `MoveUpdate`가 목표에서 멈추고 `+0x34=0` → `IsIdle`. `Mgm01_IsFinishedEventPosAnim` @0x710001f8c0 = **frame ≥ frameMax − 20**(150f 클립 → 130f). `SetOp2End`/`ModeZoomMax` = 끝 프레임으로 건너뜀(스킵) | 클립 길이 [데이터] + 위 규칙으로 타이밍 확정 가능. 남은 것: `EnterOp`·`StartOp`·`StartOpZoom`·`ModeZoom` 이 넘기는 이름(C 에서 해시 쌍으로만 보임) — 어셈블리 **15분**. 판독 전엔 이름 짝 [추정](EnterOp=op_01, StartOp=op_02, StartOpZoom=op_03, ModeZoom(id)=`*_in`) |
| ② | 오프닝 actor frame > 390 | 약하게 막힘 | [추정] 420f 클립은 `npc_op_c01`(NPC 오프닝 위치)과 `cam_op_c01` 둘 | 둘 다 420f 라 어느 쪽이든 390f 시점은 같음 → 실질 영향 없음 |
| ② | `npcReady` = `ComNpc+0x58 == 1` | **조금 막힘** | [판독] ComNpc 안에서는 0(생성·큐 애니 끝·mgm06)·2(`SetStateMove`)·3(`Update`)만 쓰고 1 을 쓰는 곳이 없음 → `NpcManager` 쪽 | 판독 **15분**. 그 전엔 "안내 NPC 이동 끝 + 대기 모션 시작"으로 [추정] |
| ③ | 배경 NPC 종류·배치·행동 | **안 막힘**(종류만 미확정) | [판독] `NpcManager::SetupNpc` @0x7100033cf0 → `SetupBgNpc(…, NonPlayerCharacterID, 소켓, …)` @0x71000365f0 를 서 있는 `pos_npc01~06`·앉은 `pos_sitting_npc00~06`·보트 `pos_boat_npc10~42`(mgm01_boat00 뼈)에 호출. 행동은 AI 없이 상태 함수(`ComNpc::UpdateIdle/Walk/Run/Clap/Surprise/…`) + 모션 `co_idle00·co_applause00·co_clap00·co_joy00/03·co_joyful00·co_bye00/01·bd_jump01/02·(sit_)surprise00a/b`, 시선 `ComHeading`(카메라/엔티티). [데이터] 위치 뼈는 `mgmet_map00`(pos_npc 24개)·`mgm01_boat00` 에 있음 | NPC ID 값이 C 에서 지역 구조체로만 보임 → 어셈블리 **20분**. 그 전엔 임의 NPC 로 배치 |
| ④ | 코인 배틀 이벤트 | 범위 밖 | [판독] `IsFinishedCoinBattleEvent` @0x7100020880 = 맵 이벤트 모션 frame ≥ frameMax | 즉시 참 |
| ⑤ | 다른 아카이브 누락 | **안 막힘** | [데이터] 안내 NPC 5종 bea 있음, 플레이어 모션 `co_idle00`(94)·`co_walk00`(60)·`co_run00`(49)·`co_applause00`·`bd_sandart00`·`md_drive00`·`sit_surprise00a` 모두 추출본에 있음, mgm00 탈것 fmdb 36 있음 | — |
| ⑤ | 갈매기 소켓 `pos_seagull0N` | **조금 막힘** | [판독] `SetupSeagull` @0x710001a2c0: 6마리, idle 600f 를 시작 프레임 0/450/150/300/500/100 으로 재생 [판독]. 그런데 소켓 뼈 `pos_seagull0N` 이 mgmet·mgm00 의 어떤 fmdb 뼈에도 없음 [데이터] | 소켓을 가진 모델 찾기 **15분**(다른 아카이브 또는 `+0x98` 엔티티). 못 찾으면 원본도 배치 실패일 수 있음 → 생략 |
| ⑥ | 엔진 기능 중 웹에 없는 것 | **안 막힘** | [판독] 물리 연출 없음: 낙석 `SetVisibleMGM06Rock` @0x7100022560 은 표시만(mgm06 범위). 이벤트 스크립트 없음(파이버 C 코드). 애니 형식 fskb·fmab·fsnb 는 기존 변환기로 모두 성공. `ComActorAutoInterpolation`·`ComHeading`·모션 블렌드는 09_character·charselect 에 이식 선례 | — |

**결론**: 맵 로딩·보이는 애니·NPC 배치·플레이어 이동을 아예 막는 요소는 없다. 플레이어는 직접 조작하지 않고 소켓 사이를 자동 보간으로 움직이며, 충돌·물리 데이터가 필요 없다. 신호 타이밍도 클립 길이와 판독한 규칙으로 대부분 정해진다. 남은 짧은 판독 5건(이동 속도 20분, 카메라 이름 15분, `ComNpc+0x58` 15분, 배경 NPC ID 20분, 갈매기 소켓 15분)은 **합 약 1.5시간**이다. 갈매기 15분을 뺀 4건은 §5.2 시간에 넣었다. 판독 전에도 [추정] 값으로 구현을 진행할 수 있다.

## 10. B 갈래 결과 — 카메라 클립 재생 규칙·바다 셰이더 판독 (2026-10-08, 사용자 결정으로 구현 중단)

상태: **판독·문서만. 웹 코드·에셋 변경 없음**(`stage3d/cameraAnim.ts`·`ocean.ts`·변환기·시험은 만들지 않았다). 아래는 다음 광장(menu00) 3D 등에서 재사용할 규칙이다. 임시 산출물(fsnb 커브 덤프·SASS)은 scratchpad 에만 있다 — 다시 만드는 명령은 10.4.

### 10.1 카메라 클립 표 — `mgmet::Camera::Initialize` @0x710000fe90 [판독]

라벨 → `mgm/mgmet/env/<파일>.fsnb`. 31개 모두 Aim 모드·Perspective·비루프, near 1, 커브 Cubic 129·Linear 8, 키 wrap 전부 Clamp, twist 커브 없음 [데이터: `camera_probe cam`].

| 라벨 | 파일 | 프레임 | fovy | 부르는 함수(속도) [판독: 어셈블리 해시 대조] |
|---|---|---|---|---|
| `camera` | `mgmet_cam00` | 240 | 32° | `StartModeSelect(id)`·`MoveDirection` (아래 10.2) |
| `op_01` | `mgmet_cam_op_c01` | 420 | 32°(커브 있음) | `EnterOp` (1.0) |
| `op_02` | `mgmet_cam_op_c02` | 180 | 32° | `StartOp` (1.0), `SetOp2End` = frameMax 로 건너뛰고 속도 0 |
| `op_03` | `mgmet_cam_op_c03` | 30 | 32° | `StartOpZoom` (1.0) |
| `freeplay_in` | `mgmet_cam_mgm01in` | 90 | 32° | `FreePlayIn` (1.0), `ModeZoom(2)` |
| `tagmatch_in`·`dailytrial_in`·`endless_in`·`coinbattle_in`·`bossrush_in` | `mgm04in`·`mgm03in`·`mgm05in`·`mgm02in`·`mgm06in` | 각 90 | 32° | `ModeZoom(id)` (1.0) / `ModeZoomMax(id)` = frameMax·속도 0. 이름 표 @0x71000fcaf8 = id 0..5 → tagmatch, dailytrial, freeplay, endless, coinbattle, bossrush (= `tables.ts` ACTIVITIES 순서) |
| `mgm01_departure` | `mgmet_cam_mgm01_departure_c01` | 150 | 32° | `PlayAnim(name, speed, frame)` |
| `mgm02~05_departure`·`_approach` | `..._c01` | 각 240 | 32°, far 10000 | `PlayAnim` (mgm02·03 departure 는 Linear 커브) |
| `mgm02_result_01~03`·`mgm03_result`·`mgm04_result01~03` | `..._result_c01~c03` | 120/30/30 | 35° | 결과 연출(범위 밖) |
| `mgm06_introduce`·`mgm06_release_01/02`·`mgm06_htp` | | 120·330·30·1 | 32° | mgm06 |

`op00`(180f)은 표에 없다 → 이 장면에서 안 쓴다 [판독]. `PlayAnimReverse(name, s, f)` = 속도 −s, 시작 프레임 frameMax − 1 − f. `SetStartFrame(name)` = 프레임 0·속도 0. `IsFinished` = 모션 끝, `IsOverAnimFrameMax` = frame ≥ frameMax.

### 10.2 선택 카메라 구간 이동 — `ComMgmetCamera` [판독]

- 필드: +0x30 방향 상태(0..5), +0x34 이동 중, +0x38 목표 프레임, +0x3c 역방향. `InitState` = 상태 2(이동 아님). `IsIdle` = `+0x34 == 0`.
- `StartModeSelect(id)` @0x7100011410: `camera` 재생, 상태 = 표 @0x71000e3508[id] = id, 프레임 = 표 @0x71000e34f0[id] = **(0, 45, 90, 135, 180, 240)**, 속도 0.
- `MoveDirection(fwd)` @0x710000fbd0 (이동 중이면 무시): 앞(fwd=1) = 상태 s → s+1, 목표 = 다음 표 값, 속도 +1 (상태 5 에서는 무시). 뒤 = s → s−1, 목표 = 이전 값, 속도 −1 (상태 0 에서는 무시). **상태 5 에서 뒤로 갈 때만 `SetFrame(239.9)` 후 속도 −1**.
- `MoveUpdate` @0x710000fa50 (틱 메시지 `0x5f454e00` 마다): 이동 중이고 앞이면 frame ≥ 목표, 뒤면 frame ≤ 목표일 때 frame = 목표, 속도 0, 이동 끝(→ `selectionCameraIdle` 참). 한 칸 이동 = 45 프레임(0.75 s), 180↔240 칸만 60 프레임.
- 허브 `move(1)`(왼쪽) = id+1 = 앞 방향과 맞는다.

### 10.3 커브 평가·끝 신호 (웹 구현 시)

- 평가식은 07_camera_lighting.md §6.4 그대로(정수 키 × scale + offset, Cubic t = 구간 비율). fovy 커브(op_c01)만 키형 Single(scale 1).
- 적용은 07 §6.1·6.2(Aim: `lookAt` + `rotateZ(twist)`, fovy = 전체 세로각, aspect 미적용, near/far 적용).
- 끝 신호 제안 [설계]: 재생기 `isFinished()`(비루프 frame ≥ frameMax 또는 역재생 frame ≤ 0), `isIdle()`(구간 이동 끝), `onFinished(label)` 콜백. 신호 대응: `openingDone` ← op_01→op_02 끝, `zoomDone` ← op_03 끝, `selectionCameraIdle` ← isIdle, `modeZoomDone` ← `*_in` 끝. 진행 순서(틱 안에서 frame 진행과 MoveUpdate 중 무엇이 먼저인지)는 [미확정] — 1프레임 차이.
- 주입 지점: A 계약 `stage.setCameraDriver({ apply(camera, df) })` 에서 frame += df·speed 후 적용.
- **커브 wrap 해결(2026-10-08)**: 맵 애니 `mgmet_map01.fskb`(천 뼈 4개, 키 60~490f 로 엇갈린 Repeat)·`mgmet_vehicle00.fskb`(위치 뼈 7개)·바다 `mgmet_sea00`·`sea00_op_c01.fmab`(450f 주기 Repeat)가 변환기에서 끝값 고정으로 구워져 있었다 → `Curves.cs` 가 원본 wrap 으로 접게 고치고 extracted/converted/graphics/mgmet 을 다시 만듦(glb 는 애니 바이트만 바뀜). 시험 test_mgmet 6절. 근거·전체 목록 plaza_3d.md §8.

### 10.4 바다 `mgmet_ocean00_mt` 셰이더 판독 (프로그램 p59, 오프닝 `sea00_op_c01` 은 p55) [판독: SASS]

경로: `bnbshpk_split.py _mgm/mgmet.bnbshpk` → `bfsha_dump match`(재질 옵션 = fmdb dump 의 shader.options) → `sass_dis.py` 의 `disasm/annotate`(PROG·SHPK 경로만 scratchpad 로 바꿔 호출). 샘플러: `sg_utility_texture2d0` = `mgmet_ocean01_flw_0`(흐름, uv1), `sg_utility_texture2d1` = `mgmet_ocean00_nml`(uv0 × srt0 = 30배), `local_specular_texturecube` = `mgmet_ocean00_ibl_rad`. **`sg_utility_texture2d2`(`mgmet_ocean00_tide`)는 p59 FS·VS 에서 읽지 않는다.**

| 단계 | 식 (P0 = utility_parameter0 (fmab x, 1.25, fmab z, 5), P1 = utility_parameter1 (1, 0.025, 18, 1)) |
|---|---|
| 흐름 UV | flow = (2·f.r − 1, 1 − 2·f.g), φ0 = frac(P0.x), φ1 = frac(φ0 + 0.5), n = World[0xe0] 전역 텍스처(uv0·P1.z).r; uvA = uv0' + flow·φ0·P1.x + n·P1.y, uvB = 같은 식 φ1 |
| 노멀 | A = nml(uvA), B = nml(uvB) 의 xy 를 w = \|2φ0 − 1\| 로 섞어 2x−1, z = √(1 − x² − y²), TBN |
| 기본색 | Fresnel f = sat((1 − N·V)^utility_color0.w(=10)), base = mix(base_color (0, 1, 0.35), utility_color0.rgb (0, 0.1, 0.3), f) |
| 거품 | foam = round(P0.y·(mix(A.a, B.a, w) + \|flow.b\|^P0.w · P0.z)) 을 base.rgb 에 더함(툰식 계단) |
| 합성 | 수중 = mix(수중 장면색(Layer 버퍼, 굴절 uv 오프셋 = water_uv_offset_scale 0.03·한계 0.1, ior 1.33), muddy_color (0, 0.05, 0.55), sat(수중 거리 / muddy_range 69)); 출력 = 수중·(1 − water_opacity 0.25) + 조명된 표면·water_opacity + 반사(국소 큐브, roughness 0.01) + emissive (0, 0.025, 0.1) |

fmab `mgmet_sea00`(2700f 루프): P0.x = 0 → 1 선형(흐름 위상 = 45 s 주기), P0.z = 0.45 → 0.69(100~200f) → 0.45(≈500f 이후 고정, 거품 세기). 오프닝판 재질은 base_color (0, 0.15, 1)·water_opacity 0.1·emissive 0 만 다르다 [데이터].

웹 근사 제안 [근사]: three `MeshStandardMaterial` + `onBeforeCompile`(mg1801 `water.ts` 를 stage3d 로 복사·이식), 흐름 2겹 노멀·Fresnel 기본색·거품 계단은 위 식대로, 전역 잡음 n = 0, 수중 장면 버퍼 대신 premultiplied 투명(α = water_opacity + (1 − water_opacity)·m, m 은 깊이 버퍼가 없어 상수 또는 0) — 해저 메시가 없는 먼 바다가 muddy 색이 아닌 배경색으로 보이는 차이가 남는다.

### 10.5 정정 근거 — 항구의 플레이어 직접 조작 [판독: 어셈블리]

`mgmet::ComPlayer` 생성자 @0x7100042650·`Stop` @0x7100042810 모두 `SetInputControlEnabled(false)`(`mov w1, wzr`), 다른 호출 없음. `mgmet::Input::GetInputVec` 의 유일한 호출은 `ModeSelectCameraIdle`(@0x710004d9a8, 좌우 선택). 자유 이동·열기구·추종 카메라(`menu00::ComMenuCamera::FollowPlayerImpl`, `SequenceBalloon`)는 광장 menu00 의 기능이다.

정정(2026-10-08, C 갈래): "항구에서 플레이어가 자유 이동한다"는 지적을 확인한 결과, **항구(mgmet)는 플레이어 입력을 끈다. 자유 이동(사람·CPU 가 걸어 다니고 기구로 가서 시작)은 광장(menu00)의 동작이다.** 근거 3개: ① mgmet `ComPlayer::ComPlayer` @0x71000424d0 의 끝이 `mov w1,wzr; b actor::ComActor::SetInputControlEnabled`(입력 끔) [판독+어셈블리, analysis/decomp/mgmet_3d_dis.c] ② mgmet NRO 심볼·임포트에 Stick·Lever·Raycast·Controller·Plaza·Navi 가 0건이고, 입력은 `mgmet::Input::GetInputVec`(선택 흐름의 좌우 입력)뿐이다 [데이터: nro.py] ③ online.md §1 "방장의 '시작'은 광장(menu00)에서 기구(모드 메뉴)로 가는 것" [판독]. 사용자 결정: 자유 이동·충돌·CPU 이동·상호작용은 광장 3D 갈래에서 한다. 위 ① 행의 "안 막힘" 결론은 항구에 한해 그대로 유효하다.

## 9. C 갈래(인물·신호) 판독 결과 — 구현 중단 시점 기록 (2026-10-08)

상태: 사용자 결정으로 **항구 3D 구현을 중단했다.** C 갈래는 판독만 마쳤다. 웹 코드·hub.ts·에셋 변환은 손대지 않았다.
새로 뽑은 C: `analysis/decomp/mgmet_3d_npcmgr.c`(NpcManager 75함수), `mgmet_3d_npcinterp.c`(ComNpcAutoInterpolation·Npc·FreeplayAfter/ReturnFlow 등 43함수), `mgmet_3d_dis.c`(Camera::EnterOp~FreePlayIn·SetupNpc·ComPlayer 생성자 어셈블리). 모두 INDEX 에 들어 있다.

### 9.1 짧은 판독 5건

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 플레이어 이동 속도 | `ComPlayer` 기본값은 +0x28 = **6.0**(달리기, bool=1), +0x2c = **3.9**(걷기, bool=0), +0x30 = 10.0, +0x34 = 6.0(호 이동용). `MoveModePos(소켓, bool, 배율)`는 속도 = (bool ? 6.0 : 3.9) × 배율로 `ComActorAutoInterpolation` 직선 보간을 하고, 소켓 회전을 도착 회전으로 저장한다. 단위는 [추정] 단위/초(mg0912 actor walk 2.0·run 7.8 과 같은 계열). 호출하는 쪽: 오프닝은 `pos_mgm_pc0K_start` → `pos_mgm01_pc0{id}` **걷기**(EnterEventFlow), 선택 복원은 `pos_mgm0N_pc0K` → `pos_mgm0N_pc0{id}` **달리기**(InitSelectMode·ModeSelectStart), 배율은 모두 1.0. 호 이동: 진행 t = 누적 deltaRate/15, 속도 계수 = 0.15→k→1.0 이차 베지어(k = 장면 파라미터 +0x1c ×0.01 [미확정 값]), 각속도 = 계수×속도×dt×180/((14−Δr)π)°, 중심 = 원점 | [판독] map_player.c @0x71000424d0·0x7100042bc0·0x7100042cf0·0x7100043090·0x7100043440, stage2.c @0x710004a328·0x710004c630·0x710004d270 |
| 2 | 카메라 함수 → 클립 | 어셈블리 해시 대조: `EnterOp` = op_01(**op_c01** 420f), `StartOp` = op_02(**op_c02** 180f), `StartOpZoom` = op_03(**op_c03** 30f), `FreePlayIn` = freeplay_in(mgm01in 90f). `ModeZoom(id)`는 표 @0x71000fcaf8 `[tagmatch_in, dailytrial_in, freeplay_in, endless_in, coinbattle_in, bossrush_in]`[id]를 FNV-1a 로 해시한다. 모두 속도 1.0. 오프닝 `GetFrame() > 390` 의 actor 는 **카메라 엔티티 모션(op_c01)**이다(EnterEventFlow 가 Camera+0x8 → +0xd8 의 ComActorMotion 을 읽음). `StartModeSelect` 시작 프레임 표 = (0, 45, 90, 135, 180, 240) | [판독+어셈블리] mgmet_3d_dis.c, nro.py |
| 3 | `ComNpc+0x58 == 1` | 쓰는 곳은 `ComNpc::Update` 상태 3: 회전이 끝나면 `*(u64*)(+0x54) = 0x1_00000000`이다(8바이트 쓰기라 앞 판독에서 놓침). 흐름: `ModeSelectStart` 가 안내 NPC(NpcManager+8, KINOPIO)에 `SetStateMove`(+0x58=2) → 이동 보간이 없으면 카메라 위치 쪽 Y 회전을 시작(`CalcTurnDegY`, +0x58=3) → 회전이 끝나면 **+0x58=1** + 다음 동작 idle. 회전 속도: 남은 각 < 120° 면 **360°/s**, 그 이상이면 1100°/s(`StepRotation` @0x710007bb50). 즉 npcReady = 선택 카메라 쪽으로 몸을 다 돌린 시점 | [판독] camera_npc.c @0x710002b550, mgmet_3d_npcinterp.c |
| 4 | 배경 NPC 종류 | `SetupNpc` 표 13칸 중 idx 3·9 는 `SetupBgNpc` 첫머리에서 return → **실제 11체**. NPC ID: 0x20 = KINOPIO(**npc022**), 0x2d = KANIBO(**npc036**), 0x0b = NOKONOKO(**npc003**) [데이터 characterlist.json]. 표: idx0 sitting_npc00 sit_talk00 c1 / 1 sitting01 sit_talk00 c3 / 2 sitting02 sit_idle01 c1 / 4 sitting04 sit_idle01 c5 / 5 sitting05 sit_talk00 c1 / 6 sitting06 sit_talk00 c3 / 7 pos_npc01 bd_jump00 c3 / 8 pos_npc02 bd_jump01 c1 (이상 npc022) / 10 pos_npc04 co_joy00·11 pos_npc05 co_idle00 (npc036, 색 없음) / 12 pos_npc06 bd_sandart00 (npc003, c1). c = `container_m` 의 `mdl_utility_parameter0` 값(키노피오 색 변형) [판독, −1 이면 안 바꿈]. 시선: idx 비트 0x11f3 은 ComHeading(엔티티/카메라), 키노피오끼리는 `BgKinopioLookAtEachOther`. 그 밖: 안내 NPC 본체(Npc 0x20) at `pos_mgm01_guide`, 엉금엉금 카메라맨 1, 보트 NPC 14(`SetupBoatNpc` 호출 14회, `pos_boat_npc10~42`, 모두 co_idle00, ID 는 [미확정]), 액티비티 안내 5(`CreateGuideNpc`). 엔티티 이름 `Npc%02d_%02d`(idx, ID) | [판독+어셈블리] mgmet_3d_npcmgr.c @0x7100033cf0·0x71000365f0, mgmet_3d_dis.c |
| 5 | 갈매기 소켓 `pos_seagull0N` | **판독 안 함**(중단). §7 ⑤ 그대로 [미확정] | — |

배경 NPC 이동 속도: `Npc::ResetTranslationSpeed` = 장면 파라미터(+0x20 int) × 6.0 × 0.01 [판독, 파라미터 값 미확정].

### 9.2 신호 8개 대응 (구현 안 함, 다음 구현용)

| 신호 | 판독으로 정해진 조건 |
|---|---|
| openingDone | op_c01 frame > 390 → fade 1 s + 1 s → op_c02(180f) 끝 **그리고** 4명 걷기(3.9) 도착 [판독] |
| zoomDone | op_c03(30f) 끝 [판독+어셈블리] |
| coinBattleEventDone | 범위 밖 → 즉시 참 |
| selectionCameraIdle | cam00 이 목표 프레임(0/45/90/135/180/240)에 도착 [판독] |
| npcReady | 안내 NPC 가 카메라 쪽으로 회전을 마침(각/360 s, 120° 이상이면 1100°/s) [판독] |
| modeZoomDone | `ModeZoom(id)`(`*_in`, 90f) 또는 `FreePlayIn`(mgm01in 90f) 끝 [판독+어셈블리] |
| departureDone | 1 s 뒤 `mgm01_departure_c01` 위치 애니 frame ≥ 150−20 [판독] |
| allPlayersIdle | 4명 모두 `MoveModePos` 보간 도착(`ComPlayer+0x48 == 1`) [판독] |

### 9.3 다음 광장(menu00) 구현에서 다시 쓸 것

- 캐릭터·NPC 변환: `web/tools/analysis/character_glb.py`(pcNN·npcNNN glb), `web/tools/analysis/charsel_chara.py`(정리 규칙), 런타임 `web/script/app/scene/menu/charselect/preview3d.ts`(눈·몸 셰이더 그래프·모션·깜빡임). NPC 모델·모션 경로는 `bq.nx.bea/common/data/characterlist.json` `NPCCharacterData[id]`(`archive`·`motion filename prefix`)에서 정해진다. 이 갈래에서는 **변환을 실행하지 않았다.**
- NPC 회전(360/1100°/s)·플레이어 보간 속도(6.0/3.9) 규칙은 광장의 CPU·NPC 자동 이동에 같은 actor 계열로 쓰일 가능성이 있다 [추정].

## 8. 중단 시점 정리 — A 갈래(공용 무대·맵 로딩·맵 애니) (2026-10-08)

### 8.1 한 것
- **공용 3D 무대 `web/script/app/common/render3d/`**(types·stage·material·clip·index): 계약과 코어 구현, tsc 통과. 페이지·시험이 없어 화면 실행은 안 했다. 계약·범위·남은 것은 [stage3d.md](stage3d.md).
- **변환**: `web/tools/analysis/graphics_convert.py` 에 `mgmet` 세트 함수만 추가(모델별 fskb 짝 표 `MGMET_ANIMS`: 위치 모델 vehicle_pos ← vehicle_approach/departure, mgm06_pos ← approach/course_selection/departure, mgm06_release_pos ← release_c01, seagul00 ← seagul00_idle, 나머지는 같은 이름). 실행 결과 → `extracted/converted/graphics/mgmet/`(새 폴더, 원본 무변경) [데이터]:
  - glb 28개(18.5 MB, 정점 187,744·삼각형 224,185), 재질 텍스처 누락 0, 바인드 오류 0
  - 텍스처 169장 → png/hdr 496파일 129 MB(디코드 실패 0). **웹에 그대로 싣기엔 큼** → 축소(알베도·노멀·거칠기 1/2~1/4) 또는 KTX2 필요(§2), 미결정
  - 스켈레탈 클립 26개 모두 glb 에 구움: map01 300f 루프, vehicle00 120f 루프, seagul00_idle 600f 루프, npc_op_c01 420f, mgm01_approach 500f·departure 150f, mgm02~05 vehicle approach/departure 각 240f(mgm04 는 c01·c02), mgm06 approach 240/240/30f·course_selection 80/80f·departure 240f·release 330f, mgm03_result_pos 120f, mgm02/04_result_pos 1f
  - anim json 35개(fmab 4 + fsnb 31), env 컨테이너 dump 6개
- **fmab 내용** [데이터]: `mgmet_sea00.fmab`(2700f 루프) = `mgmet_ocean00_mt` 의 `material_utility_parameter0` 성분 0x00·0x08 만(선형 증가 = 흐름 오프셋 [추정]). `mgmet_env00.fmab`(900f 루프) = `env_env00_mt` 의 `env_utility_parameter0/1` 성분 0x00·0x04·0x0C(값 5.0 근처에서 서서히 변함, 뜻 [미확정]).
- **정정** [데이터]: §7 ⑤ "갈매기 소켓 `pos_seagull0N` 이 어떤 fmdb 뼈에도 없음"은 틀렸다 — `mgmet_map00` 뼈 95개 안에 `pos_seagull00~05` 가 있다(map00 dump). 같은 뼈 목록에 `pos_mgm_pc00~03_start`·`pos_pc_mgm01~06` 도 있고, map00 메시 중 `pos_pc_mgm01~06__lambert1` 6개는 입구 표지 메시다 [추정: 용도].
- 충돌 데이터 [데이터]: mgmet·mgm00 bea 에 apx·nbmap·`*_col` fmdb 없음(항구는 소켓 자동 이동이라 불필요, §7 ①). stage3d 의 Collider 는 광장용 선택 기능으로 비워 둠.

### 8.2 남은 일 (재개 시)
1. `web/tools/analysis/mgmet_world_assets.py`: 위 변환물 → `web/assets/mgmet/world/`(텍스처 축소, `manifest.textures` 색인, env dump → `manifest.env`: 빛 방향·색·안개·IBL 큐브 `mgmet_ibl_*`/`mgmet_cha_*`/`sky00_ibl_*`), `layout`(보일 모델: map00·L/R·light·map01~05·sky00·sea00·seagul00·vehicle00 + 로케이터)
2. 페이지 `web/script/mgmet3d_page.ts`(자유 시점) + `ui_main.ts` UIS 항목 — 만들지 않음
3. 시험 `web/tools/test_stage3d.ts` — 만들지 않음
4. 맵 애니 연결: 갈매기 6마리(시작 프레임 0/450/150/300/500/100, §7 ⑤), map01 천막 300f, vehicle00 120f, env fmab, 구름 srt
5. B(바다·카메라)·C(인물·신호) 갈래 결과 붙이기

자유 이동(플레이어 조작·CPU 따라가기·기구 진입)은 항구가 아니라 광장이다 — [plaza_3d.md](plaza_3d.md).
