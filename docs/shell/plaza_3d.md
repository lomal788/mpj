확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**.
이 문서에 [실행]은 없다. 재구현 계산은 "재구현 계산"으로 따로 적는다.

# menu00 — 광장(Party Plaza) 3D 규모·막힘 조사와 구현 지시서

2026-10-08. 광장 웹 구현과 기존 판독 결과를 기록한다. 이번 보완은 원본 코드·명령·데이터와 현재 웹 소스 대조만 수행했고, 원본 실행·포팅 코드 수정은 하지 않았다. 항구 3D([mgmet_3d.md](mgmet_3d.md)) 중단 결정은 유지한다.
공용 3D 무대는 [stage3d.md](stage3d.md)(`web/script/app/common/render3d/`)를 그대로 쓴다. 온라인 대기실은 [online.md](online.md), 대화상자는 [dialog_box.md](dialog_box.md), 공용 창·안내·메시지는 [mgm_common.md](mgm_common.md)를 따른다.

[설계]·[근사]는 웹 선택, [측정]은 웹·변환 산출물·사용자 제공 캡처 대조다. 공통 엔진은 [engine/README.md](../engine/README.md)의 기존 확정 결과를 재사용한다.
기존 판독 근거 C: `analysis/decomp/plaza_menu00_world.c`(166함수: Player·PlayerManager·ComPlayerUtil·ComFollowPlayer·ComMenuCamera·CameraManager·ParameterManager·MapManager), `plaza_menu00_npc_seq.c`(143: NpcManager·NonPlayerCharacter·Kinopio 등·SequenceMainMenu·SequenceBalloon·SequenceFront·Scene::BeginScene), `plaza_menu00_ui.c`(72: ComUiPlayerStatus*·ComUiLocationTelop·ComUiMainMenuLayout). 전체 원본은 `ghidra_work/online/out/menu00.nro.c`(심볼 있음, 3458함수). 이번 조사에서 Ghidra 를 새로 돌리지는 않았다.

**menu01 과의 관계**: modeselect.md 6.2 의 "menu01 3D 맵 월드 모델 117개"는 **광장이 아니다**. menu01 은 기구를 타고 가는 **모드 선택 섬 월드**다(섬 island00~04, `menu01_loc_ev_start_*`). 그 장면의 카메라는 커서·팬(`menu01::ComMenuCamera::Focus/Pan/Shortcut`)으로만 움직이고, 플레이어 입력 이동은 없다(`SetInputControlEnabled`·`ComFollowPlayer` 호출 0) [판독]. 그래서 이 문서의 범위 밖이다.

## 1. 규모

### 1.1 `menu~menu00.nx.bea` (167 MB, 파일 1,044) [데이터]

| 분류 | 개수 | 크기·양 | 내용 |
|---|---|---|---|
| 모델 fmdb 전체 | 126(+effect 1) | 30.7 MB, 정점 717k·삼각형 669k, 재질 324(`forward_plus_color` 319) | `fragment_shader_graph` 재질 약 170 |
| **기본 배치**(MapStructure 비장식 28) | 28 | 정점 109k·삼각형 89k | 광장 본체 `menu00_central_plaza00`(정점 41.7k, 뼈 69, fmab 1200f) · 바다 `ocean00`(fskb 600f + fmab 1800f) · 먼 섬 · 구름 · 무대 `stage00`(+물 fmab 1800f) · 분수 `jet_fountain00`(240f/300f) · 상점 5채(`shop_maripacard` fskb 1800f, `shop_music`(+홀로그램) 600f, `shop_ranking` 600f, `shop_stamp` fmab 2400f, `shop_collection`) · 퀘스트 카트·원 · 친구 매치 오브제(`friendmatch_obj00` startup 80f → loop 140f) · 카펫 · 잔디 · 토피어리 받침 · 보드별 배경 오브제 `bg_bd02/03/06`(잠김 판 `_obj01` 짝) |
| **장식 세트**(`flgDeco` true 74) | 기본(`_Dft`) 7 | 정점 43k | 조각상·가랜드·분수·나무·화분·타일·풍선 — 카테고리마다 하나만 보임(보드 보상 장식 교체 `MapManager::ApplyDecoItem`). 처음엔 `_Dft` 만 |
| MapStructure 미사용 fmdb | 29 | — | 이벤트·NPC 소품(`npc00/02/07_obj`, 배드민턴 `obj_racket00/shuttle00`, `obj_guitar`, `chair00`, `air_npc03~05` 비행 경로) — 코드가 직접 붙임 |
| 로케이터 | 3 | — | `menu00_loc_attach00`(뼈 약 90: 상점 `attach_shop_*`, 기구 `balloon_pos`(0,0,0), 시작 `char_start_pos`(0,−2.4,22.3), MC `mc_plaza_default_pos`, 기구 탑승 줄 `pc_plaza_balloon_pos_pN_pcNN`, 데이터하우스·퀘스트 복귀 줄, 카메라 `attach_cam_plaza01~06`), `menu00_loc_deco_npc_attach00`(하늘 NPC 6·땅 NPC 9쌍 `attach_ground_npcNN` + `pos_npcNN_a/b`), `menu00_loc_ev_quest_start` |
| 스켈레탈 fskb | 21 | 작음 | 루프 18(위 + 하늘 NPC `air_gull` 3600f·`air_npc03~05` 1000f, 갈매기 40f, 비치볼 240f, 장식 풍선 300f) · 1회 3(`pos_balloon_takeoff` 500f, 친구 매치 startup 80f, 퀘스트 구름 320f) |
| 재질 애니 fmab | 14 | 작음 | 루프 12, 환경 `menu00_env00` 900f |
| 카메라 fsnb | 22 | 작음 | 기구 출발 `ev_balloon_start_cut00`(260f)·`cut01`(500f), 상점·퀘스트 소개 `ev_intro_*`(50~60f, 스크롤 1080f), 퀘스트 출발 cut00~02(각 325f), 장식 보기 `deco_*`(20~600f), 상점 위 `top_shop_*`(50f). fov 45°(17)·35°·27°·51.3° |
| 환경 | env 44 파일 | 1.1 MB | `menu00_env`(+fmab 900f)·`dir_light`·`sky`·`post`·상점 포인트라이트 1 |
| 텍스처 bntx | 378 + env | **111.5 MB** + 0.9 MB | alb 270·nml 287·rgh 258·mtl 48·ao 15·emi 14 등 |
| 충돌 | nbmap 2 + apx 2 | 137 KB | §3.2 |
| 이펙트 VFXB | 1 | 14.1 MB(ConvertList.xml) | 장식·분수·상점 FX(ftrg `fx_menu00_*` 70) — 후순위 |
| 게임 데이터 | json 2 | 25 KB | `MapStructure.json`(111항목: key·archive·dir·fmdb·hookKey/hookNode(부착 소켓)·nbmap·anim·flgDeco) — **배치 표를 그대로 manifest 로 옮길 수 있다**, `CameraParam.json`(§3.4) |

### 1.2 다른 아카이브

| 출처 | 쓰는 것 | 규모 |
|---|---|---|
| `menu~menu_common.nx.bea`(17 MB) | 기구 `menu_cmn_balloon00`(+anim, 소켓 `balloon_pos`), 퀘스트 받침 `menu_cmn_quest_platform00`(idle), 2D 레이아웃 `mncom_*`(§5) | fmdb 6·bntx 49 |
| NPC 11종(`Scene::BeginScene` @0x7100046160 `LoadSceneNonPlayerCharacter`) [판독] | 0x20 KINOPIO(npc022, MC·상점 직원) · 0x37 KAMECK(npc051) · 0x0b NOKONOKO(npc003, 배드민턴 `BadmintonRob/Smash`) · 0x05 HEYHO·0x09 HEYHO_STATION(npc002) · 0x01 KURIBO·0x04 KURIBO_BANDANA(npc001) · 0x2e HAMMER·0x2f BOOMERANG_BROS(npc044) · 0x29 GABON_STRAWHAT(npc029) · 0x38 PATAPATA(npc053, 하늘) | bea 합 76 MB(모델+모션 전부, 실제 쓰는 모션은 일부) |
| 플레이어 | 상주 `pcNN` + 상주 모션 `pcMot_co`(`co_idle00`·`co_walk00`·`co_run00`·`co_look02`·`co_nod00`), 전이표 `sys_pc.mpat` | charselect 와 같은 glb 경로 |

### 1.3 이미 있는 것 재사용 목록 (plaza-A, 2026-10-08 — 새로 판독하지 않고 그대로 쓴다)

| 분야 | 그대로 쓰는 것 | 광장에서 |
|---|---|---|
| 3D 무대 | `web/script/app/common/render3d/`(Stage3D·MaterialSetup·Clip, 계약 [stage3d.md](stage3d.md)) | 모델·재질(라이트맵·AO·IBL·sdw)·클립·카메라 슬롯·fmab 표본. A 가 Collider·인스턴스 적재·재질 애니·포스트·하늘을 더한다(§6.7) |
| 조명 규칙 | 엔진 [07_camera_lighting.md](../engine/07_camera_lighting.md) §6.6(overwrite 회전 → 빛 방향, R = Rz·Ry·Rx, 로컬 −Z)·§7.3~7.5·§9.4~9.5, mg1801 `view/post.ts`(포스트 순서·FXAA·블룸 대응) | §6.7 env·post 값 |
| 변환 | `graphics_convert.py`(세트 함수만 추가: menu00·menu_common)·`graphics_bntx.py`·`graphics_bfres2gltf`, 충돌 obj(`scene_apx.py` 산출물 그대로) | §6.7 |
| 셰이더 그래프 판독 | `bnbshpk_split.py` → `bfsha_dump` → `sass_dis.py`(charselect.md 12.11 경로), 바다 p59 판독(mgmet_3d.md §10.4) | §6.8 |
| 흐름 페이지 | `setplayer_page.ts`(플레이어 설정 → 캐릭터 선택 `charselect_page.ts`), `modeselect_page.ts`(모드 메뉴), `mgm01_page.ts` `runMgm01List`(프리 플레이 목록·DecideMinigameFlow·한 판 호출), main.ts `start()`(게임 실행) | §6.9 `dev/index.html?plaza=1`(흐름 코드 `app/flow`, 배포 `/` 도 같은 흐름) 이 이 순서로 부른다 |
| 2D·소리·입력 | mgmcommon(창·메시지·dialogBox·안내·정렬·소리 어댑터), online(알림·텔롭·OnlineAdapter) | D 갈래 |
| 판독 C | `analysis/decomp/plaza_menu00_world.c`·`plaza_menu00_npc_seq.c`·`plaza_menu00_ui.c` | 새 판독은 §6.6(ApplyDecoItem 키 표·main DecoItemData)만 |

## 2. 원본 동작 요약 (구현 기준)

→ 화면별 원본 BGM(라벨·시작·전환 페이드)·웹 연결: [04_sound.md §12.14](../engine/04_sound.md) (2026-10-08).

- **플레이어 자유 이동**: 로컬 1번(PlayerManager 슬롯 0)만 입력을 받는다. `PlayerManager::Start` @0x7100041060 이 슬롯 0 의 `ComFollowPlayer` 를 떼고 `ComPlayerUtil::StartInputControl` @0x710003f3f0 → `actor::ComActor::SetInputControlEnabled(true)` + `CallAction(Idle)` 을 부른다 [판독]. 이동은 main 엔진 `actor::ComActor`(레버 → 걷기/달리기·선회·중력·접지)가 맡는다. 레버는 카메라 기준이다(`Player::Player` @0x7100042980: `SetLeverCamera(CameraManager::GetCamera)`) [판독].
- **다른 로컬 플레이어**: 모두 `ComFollowPlayer` 로 **바로 앞 슬롯을 따라 걷는다**(`SetupLocalPlayer` @0x7100040a90 가 모든 로컬 슬롯에 붙이고 Start 가 0번에서만 떼며 슬롯 i 의 대상을 슬롯 i−1 로 둔다) [판독]. **CPU(PlayerType 1)는 광장에 만들지 않는다**(`SequenceMainMenu::Setup` @0x7100059700 의 GetPlayerList 반복이 PlayerType≠1·IsLocal 만 SetupLocalPlayer, 정정 — plaza-C §6.10) [판독]. §3.3 규칙대로 움직인다.
- **온라인 다른 사람**: `ComPlayerUtil::ReceiveMessageImpl` @0x710003fbd0 이 움직이는 동안(속도 4성분 제곱합 > 0.1) 0.2 s 마다 `SendRemotePlayerInfo`(위치·회전·캐릭터)를 보낸다. 받는 쪽 `PlayerManager::OnReceive` @0x71000421e0 은 거리가 5 를 넘으면 순간이동, 1 이하면 회전만 보간, 그 사이는 `ComActorAutoInterpolation` 으로 위치·회전을 보간한다 [판독].
- **상호작용**: `SequenceMainMenu::MainImpl` @0x710005a170 이 매 프레임 1번 위치로 `MapManager::GetArea` @0x710001a434 를 부른다. z < 18 이고 −9 < x < 9 이면 기구 앞 영역이고, 아니면 로케이터 0 기준 각도 구간(70·110·160·200·245·290·330°)으로 영역을 나눈다. 오프라인·호스트는 매 프레임 `ComUiLocationTelop::SetArea` 로 장소 이름(`im_mn_balloon_name`·`im_mn_guide_name`·`im_mn02~06_name`·`im_mn_friend_name`)과 설명을 띄운다. 다가가기 판정은 거리 **< 3**(가까운 대상 2곳)과 **< 7**(상점 6곳)이다. 판정되면 1번 머리 위 `ComUiPopGuide`(아이콘 1, 회전 −45°, 화면 위치 = 1번 위치 + (0, PCHeight×0.8, 0) 투영, x에 +70 px)가 뜨고, A 를 누르면 `SQ_SE_SYS_DECI` 와 함께 선택 처리로 간다. 영역 1 에서는 MC 키노피오가 플레이어를 바라본다(`LookAtEntity`) [판독]. 결과 값 ↔ 대상·영역 번호와 세션 분기는 §6.10 ① [판독].
- **기구 → 다음 장면**: 기구 선택 → `SequenceBalloon::TakeOffImpl` @0x71000470d0(안내 `ComUiGuide00`, 페이드) → `MapManager::PlayBalloonTakeOff`(`pos_balloon_takeoff` 500f + 카메라 `ev_balloon_start_cut00/01`, 이때 `CollisionMain` 을 끈다) → `CallSceneImpl` @0x7100047628: 오프라인이면 `RequestCallScene(GetScene())`(모드 선택 = menu01), 방이 있으면 `NetworkManager::PlaySession`(online.md 5.6) [판독].
- **카메라**: `ComMenuCamera::FollowPlayerImpl` @0x7100003de0 은 CameraParam 의 MainMenu 값(목표 높이 +2.5, 거리 10, 각도 15°, fov 40, 추종 속도 0.01)과 MainBalloon 값(+8, 18, 0°, 65)을 섞는다. `GetArea(T)==0`일 때 카메라 목표 T의 z로 t = clamp((T.z − 9)/−9 + 1, 0, 1)을 구한다. 눈 = 목표 + (수평 단위 방향, y=sin(각))×거리(cos 곱 없음), 세로 fov를 보간하며 near=1·far=2000이다(§3.5) [판독].

→ 광장 첫 진입 정리: [plaza_intro.md](plaza_intro.md) §1·§3~6

## 3. 자유 이동·충돌 근거

### 3.1 이동 규칙 — `actor::ComActor`·ActorParam [판독: mg0912.md §4.6·§6, §3.5]
main `ComMatter`가 `common/data/actorparam.json` 값을 액터에 적용하고, menu00은 이를 다시 덮지 않는다(`Set*Speed`·`SetTurning*` 호출 0). **걷기 2 / 달리기 6 m/s**, 레버 깊이 0.8 이상이면 달리기, 0 초과 0.8 미만이면 걷기, 0 이면 Idle(main LAB_7100012454). **땅 선회 360°/s, 각도 차가 85° 이상이면 빠른 선회 1100°/s**. 중력 9.8·배율 1, 낙하 최대 49. 접지 한계 `SetGroundedLimit(−2.5)` [판독: 0xc0200000]. `ComPlayerUtil` 은 접지되어 있으면 중력 배율 0, 공중이면 1 로 둔다 [판독].
캐릭터 13번(KOOPA)만 몸통 구 2개를 더 붙인다(반지름 1.0, 오프셋 y 1.2, 0.1). 발 IK 충돌 마스크도 있지만 웹은 생략한다.

→ 정리본: [17_actor.md](../engine/17_actor.md) §4.2, 6.2

### 3.2 충돌·지면 — **원본 데이터 있음**
- MapStructure `CollisionMain` = `menu00_central_plaza_col.nbmap` → `72cbf…apx`. **PhysX 삼각 메시(BVH33) 정점 2,666·삼각형 4,440**, 범위 x −28.7~28.8, y −3.6~13.4, z −11.5~62.0. 월드 변환은 항등이다 [데이터]. 이미 `scene_apx.py` 로 obj 까지 바꿔 두었다: `extracted/converted/scene/apx/menu~menu00__menu__menu00__map__72cbf6799dc022826ea52ed8ed6d9c3f.obj`.
- `CollisionFirst` = `start_ev_col` → `8fd1…apx`(40정점·76삼각, z 17.3~28.9). 첫 진입 이벤트 동안만 쓰는 막이다(`GetCollisionModel("CollisionFirst")`, menu00.nro.c:67425) [판독+추정].
- 속성 attr = [0,4,4,0](06_scene_data §3.3 충돌 컴포넌트) [데이터]. 지면 위 y 는 약 −2.4(로케이터 높이와 같음).
- 웹: obj 삼각형으로 stage3d `Collider` 를 구현한다. 지면 = 아래 방향 광선, 벽 = 캡슐(반지름은 캐릭터 data `bubble_radius` 0.9 [추정]) 대 삼각형 밀어내기·미끄러짐. 원본 충돌 형상·CCT 사용 여부와 계단 설정은 §7 [미확정]; 웹 STEP=0.5는 근사다.

### 3.3 따라가기(로컬 2~4P) — `ComFollowPlayer::ReceiveMessageImpl` @0x710003fec0 [판독]
대상(앞 사람) 위치를 원형 버퍼에 쌓는다(직전 점과 0.6 넘게 떨어지면 새 점). 거리가 **2.6 을 넘으면** 쌓인 점들을 따라 `ComActorAutoInterpolation::Start`(점마다 `CastRay` 로 머리 +1.0 높이에서 가시성 확인), **2.0 미만이면 Stop**. 대상 = 바로 앞 슬롯(줄 서기, 확정). 세부(버퍼 5칸·광선 1.3 m·속도 6)는 §6.10 ②.

→ 정리본: [17_actor.md](../engine/17_actor.md) §8.2

### 3.4 CameraParam.json [데이터]
`MainMenuTargetOffsetY 2.5, CameraLength 10, CameraAngle 15, Fovy 40, TargetPlayRange 3, FollowSpeed 0.01`, `MainBalloonTargetOffsetY 8, CameraLength 18, CameraAngle 0, Fovy 65`.

### 3.5 B 갈래 판독 결과 — 1번 플레이어 이동·추종 카메라 (2026-10-08, plaza-B)

근거: `FollowPlayerImpl` 은 Ghidra C 가 위치 계산을 잃어서 **어셈블리**(menu00 @0x7100003de0~0x71000047a0)로 다시 읽었다. main 은 `extracted/exefs/main.decomp.bin` 평면 이미지 어셈블리. 구현 `web/script/app/scene/world/plaza/{player,camera}.ts`, 시험 `web/tools/test_plaza_move.ts`. 캐릭터 에셋 `web/tools/analysis/plaza_player_assets.py` → 명세 `web/assets/plaza/player/spec.json` + 공용 `web/assets/chara/`([chara_assets.md](../engine/chara_assets.md), 22명, charselect 와 같은 `charsel_chara.convert` 파이프라인, 클립 co_idle00·co_walk00·co_run00·co_look02·co_nod00·mn_bnclr_get00(40f 1회)·mn_bnclr_idle00(루프, 기구 출발 쌍안경 받기 §6.10 ④) + 깜빡임, `spec.json` 에 sys_pc.mpat 전이 6항목, 크기는 chara_assets.md §9). 그리기는 charselect `Preview3D`(몸·눈 셰이더 그래프·깜빡임·보임) 한 칸의 모델을 광장 장면으로 옮기고 `stage.prepare` 로 캐릭터 IBL 을 건다. 부품 계약: `parts.ts` 의 player·camera, `ctx.actors` 에 kind 'input' 하나, 사건 `player:input`(false = 입력 끔, 원본 StopInputControl; true 면 아래 고정 모션도 풂)·`player:play`({clip, next?} = 1번 모션 직접 재생, 예 TakeOffGet `{clip:'mn_bnclr_get00', next:'mn_bnclr_idle00'}`, 입력이 다시 켜질 때까지 이동 모션이 덮지 않음)·`camera:follow`(false = 추종 끔)·`camera:reset`(목표를 char_plaza_default_pos 또는 준 Vector3 로).

**남은 판독 ② ComMatter 가 속도를 덮는가 → 덮는다, 값은 같다** [판독+데이터]. main `FUN_71002b2e00`(ComMatter 액터 설정, ComActorJumpCalculator::SetupLegacy·SetLeverMove 다음)이 ActorParam 싱글턴(`FUN_71002b9bc0` 이 `common/data/actorparam.json` 의 `ActorParam` 배열을 읽음, 행 i = +0x30+0x10·i)에서 ComActor 필드를 채운다. 땅 이동에 쓰는 값: +0x2d0 달리기 = 행0 **6**, +0x2cc 걷기 = 행1 **2**, +0x2d4 땅 선회 = 행3 **360**, +0x2d8 빠른 선회 = 행4 **1100**, +0x2dc 문턱 = 행5 **85°**, +0x2ec 레버 문턱 = 행32 **0.8**, +0x2fc 공중 가속 = 행2 40, 공중 선회 +0x2e0/+0x2e4/+0x2e8 = 행6~8 **180/720/85**(엔진 생성자 360/1100 과 다름). menu00 은 그 뒤 속도를 바꾸지 않는다. 그래서 땅 값은 §3.1 과 같고, 공중 선회만 180/720 으로 고친다.

**남은 판독 ③ `SetGroundedAdjustFunc` 람다 → 빈 함수** [어셈블리]. `Player::Player` @0x7100042da8~0x7100042db8 은 std::function 의 대상 포인터 자리(x29−0x78)에 0 을 쓰고 넘긴다(`stur xzr,[x29,#-0x78]`). 즉 지면 보정 함수를 **비운다**. 웹은 엔진 접지 판정(mg0912 §6.4: 아래로 d+0.4 안 지면에 붙이기, 법선 0.7071 이상)만 하고 추가 보정은 하지 않는다. 같은 생성자: `SetGroundedLimit((0, −2.5, 0))`(@0x7100192ec0), `SetActorType(0xc7)`, `CallAction(Idle)`, 모션 슬롯 "Sub" 에 `co_look02`·`co_nod00` 추가.

**이동 한 프레임** [판독: main DefaultCharacterActionIdle/Walk/Run @0x710002fbfc/fc78/fda0, GetPadActorDeg @0x710001e8b8, mg0912 §6.1·§6.3·§6.4]:
- 레버 = 스틱 (x, y) 를 레버 카메라(`SetLeverCamera(CameraManager::GetCamera)`)로 돌린 것. 깊이 = |스틱|, 방향 = atan2 [판독]. 카메라 기준 = 카메라 수평 앞·오른쪽 [추정: 돌리는 가상함수 +0x30 미판독].
- 땅: 깊이 ≥ 0.8 → Run, 0 < 깊이 < 0.8 → Walk, 0 → Idle(들어갈 때 속도 0). Walk/Run 은 매 프레임 `MoveLeverDirection(속도)` = 레버 단위 방향 × 2 또는 6(가속 단계 없음), 목표 회전 = 레버 각.
- 회전: 각차 ≥ 85° 면 1100°/s, 아니면 360°/s(공중 720/180). 이동 방향은 레버를 바로 따르고 몸 방향만 돈다.
- 중력: `ComPlayerUtil` 이 접지면 배율 0, 공중이면 1. 공중 낙하 가속 = 9.8 × 계수 5(점프 계산기 꺼짐) = 49 m/s², 낙하 최대 49 m/s. 공중 수평 = 가속 40(깊이 < 0.8 이면 ×0.075)·레버 없으면 감속 40·최대 6.
- 모션: Idle = `co_idle00`, Walk = `co_walk00`(액터 +0xf0), Run = `co_run00`(+0x110) [판독: 액션이 슬롯 모션을 재생 / 이름은 상주 모션 pcMot_co 와 §1.2 [추정]]. 섞기 = `chara/mpat/sys_pc.mpat`(menu00 전용 mpat 없음 → `sys_pc` 만 등록) 의 a 프레임: →co_walk00 12, →co_run00 8, co_walk00→co_idle00 12, co_run00→co_idle00 10 [데이터; a = 보간 프레임은 06 §2.5 [추정]].
- LookAt [판독+어셈블리]: `PlayerManager::LookAt(pos, bool)` 은 false 면 슬롯마다 `ComPlayerUtil::TurnLookAt`(@0x710003f5d0: 수평 방향 → `CalcTurnDegY` → main `ComActorAutoInterpolation::StartRotateY`(@0x7100020698, 목표 사원수 +0x50·회전 진행 플래그 +0x61)), true 면 `SetRotateLookAt`(즉시). 회전 진행 중 `ComActor::GetMoveLever`(@0x7100013500)가 `Calculate` 의 목표 회전·0 레버를 레버로 쓰므로 **회전 속도는 액터 선회 규칙 그대로**(땅 360°/s, 85° 이상 1100°/s; 180° = 18 f), 이동 없음. 웹 사건 `player:lookAt` {target, immediate?}.
- 시작 자리: `SequenceMainMenu::Setup` → `MapManager::GetAttachSocketPcDefault` = `pc_plaza_balloon_pos_p%1d_pc%02d`(사람 수, 슬롯) 위치·회전 [판독].

**추종 카메라 `FollowPlayerImpl`** [어셈블리, 매 프레임 1회(파이버)]. 로케이터: 0 = `camera00_pos`(0, 2, 33, 광장 중심), 3 = `char_plaza_default_pos`, 5 = `balloon_pos` (`GetPosNodeLocater` switch) [판독+데이터 loc_attach00 뼈].
```ts
// T = 카메라 목표(ComMenuCamera +0x50, 지속 상태), P = 1번 플레이어 엔티티 위치(발), 시작 T = char_plaza_default_pos [판독: StartMainMenuCamera 호출 7곳]
d = P − T; dist = |d|                                  // y 포함
if (dist > TargetPlayRange /*3*/) {
  k = dist² / range²
  T += d · k · FollowSpeed /*0.01*/
  f = normalize((−cam[+0xa0].x, 0, −cam[+0xa0].z))     // 지난 프레임 카메라 앞(월드 행렬 z 열의 반대) [추정: +0xa0 = 월드 z 열, SHARED mgE 의 +0xb0 = 위치와 같은 줄]
  T += f · dot(d, f) · k · FollowSpeed                  // 카메라 앞뒤 방향은 두 배로 따라감
  if (+0x60) { T.x = 0; T.z = clamp(T.z, balloon_pos.z, char_plaza_default_pos.z) }   // 첫 진입 InitialRideBalloon 만 켬
}
if (GetArea(T) != 0) {                                 // 기구 앞(z < 18 && −9 < x < 9) 이 아니면
  A = T + (0, MainMenuTargetOffsetY, 0)
  v = normalize_xz(camera00_pos − A); v.y = sin(MainMenuCameraAngle°)
  eye = A + v · MainMenuCameraLength;  fovy = MainMenuCameraFovy
} else {
  t = clamp((T.z − 9) / −9 + 1, 0, 1); if (t ≥ 1) T'.z = 9      // T' = 복사본
  A = (T'.x·(1 − t), T'.y + lerp(OffY, BalloonOffY, t), T'.z)
  v = normalize_xz(camera00_pos − A); v.y = sin(lerp(Angle, BalloonAngle, t)°)
  eye = A + v · lerp(Length, BalloonLength, t);  fovy = lerp(Fovy, BalloonFovy, t)
}
SetProjectionPerspectiveFovy(fovy°, 1.0, 2000.0); SetViewLookAt(at = A, up = (0,1,0), eye)
```
- 정정(§2 카메라 줄): fov 를 1~2000 으로 자르는 게 아니라 **near 1·far 2000** 이다. 위치는 sin·cos 가 아니라 `v.y = sin(각)`(수평 단위 벡터에 그대로 y 를 얹음, cos 곱 없음)이다. 섞는 축은 **카메라 목표 T 의 z** 이고 섞는 조건은 `GetArea(T) == 0` 이다. 카메라는 광장 중심(`camera00_pos`) 쪽에서 플레이어를 바라본다.
- **재검증(사용자 지적 "카메라 이동·확대·축소가 다르다", 2026-10-08, plaza-B)** [어셈블리 재대조 + 캡처 10·11·6 대조]:
  - 파라미터 대응은 문자열 길이 바이트로 다시 맞췄다: s8 = TargetPlayRange(29자), [sp+0x50] = FollowSpeed(25), [sp+0x70] = TargetOffsetY(21), [sp+0x60] = CameraLength(20), s12 = CameraAngle(19), s10 = Fovy(18). 기구 갈래: s15 = BalloonOffY, s8 = BalloonLength, s12 = BalloonAngle, s11 = BalloonFovy.
  - 눈 위치 @0x7100004360~0x71000043d0(평소)·@0x7100004644~0x71000046cc(기구): `v = camera00 − A` → `v.y = 0` → 정규화(0 이면 0) → `v.y = sinf(각 × 0.017453292)`(**라디안**) → `eye = A + v × 길이`. cos 곱 없음이 맞다. 그래서 수평 거리 = 길이, 높이 = 길이·sin(각), 내려보는 각 = atan(sin 각)(평소 14.5°, 각 0 이면 0°).
  - `SetProjectionPerspectiveFovy(fovy × 0.017453292, 1.0, 2000.0)` — 첫 인자 = **세로** 시야각(라디안), 나머지 = 근·원 클립. 가로 비는 화면 비.
  - 추종 속도는 **프레임 단위**다: 이 함수는 파이버 루프(`Fiber::Wait` 한 번 = 1 프레임) 안에서 dt 를 읽지 않고 `T += d·k·0.01` 을 한다. 메뉴는 Variable60(01_core §4.3) 이라 60 fps 기준 = 웹 1/60 s 틱 1회. 웹 camera.ts 는 df 를 정수 틱으로 누적해 틱마다 1회 — 초 단위 섞임 없음.
  - **−/+ 는 카메라 줌이 아니다** [판독]: menu00 에 줌·카메라 파라미터 쓰기 코드가 없다(`zoom`·`SetCameraParam` 0, `GetCameraParam` 은 매 프레임 json 값을 이름으로 읽기만). `0x3000`(PLUS|MINUS) 입력은 `SequenceMainMenu::MainImpl` 에서 **세션 중일 때만** 파이버(@0x7100060a40 호스트 / @0x7100061360 손님) = `ComUiCardViewer::ClearCardData` → 멤버마다 `GetNetworkPlayerCardData`·`AddCardData` → `Start` = **멤버 카드(방 정보) 보기**다. 그 밖 0x3000 은 기구 출발 건너뛰기(TakeOffImpl)뿐. 캡처 10·11 오른쪽 위 "−/+" 는 이 안내(D 갈래 UI)다. 원본에서 확대·축소처럼 보이는 것은 **기구 앞 섞기**(목표 z 18 → 9 에서 fov 40 → 65, 길이 10 → 18, 높이 +2.5 → +8, 각 15° → 0°)이고, 오른쪽 스틱 등 사용자 카메라 조작은 없다. 높은 전경은 X "광장 보기"(OverView, overview.ts §6.14 ⑧).
  - 캡처 대조: **11.png**(기구 앞, 수평 시선) = t = 1: 내려보는 각 0 → 수평선이 화면 가운데(캡처 410/778 ≈ 0.53) ✓, 눈 (0, T.y+8, 27)·주시 (0, T.y+8, 9)·세로 fov 65 → 기구 바구니(지름 약 5 m, 거리 약 27 m) 화면 폭의 약 11% ✓. **10.png** = 1번(와리오)이 계단 앞 z ≈ 14.4 인 섞임 t ≈ 0.4: 각 9° → 내려보는 각 8.9°·fov 51 → 수평선 높이 화면 위에서 약 0.33(캡처 먼 언덕 ≈ 0.29) ✓ — 평소값(14.5°·fov 40)이면 0.145 로 맞지 않는다. 눈은 별 분수 중심 `camera00_pos`(분수 반지름 약 7.5, 충돌 원형 벽 z 25.49) 쪽 10~14 m 라 분수 별 조각상 뒤에서 기구 쪽을 본다 ✓. **6.png**(계단 앞 근경)도 같은 섞임 구간. 캡처는 가로가 잘리거나 크기가 바뀐 영상이라 화소 단위 대조는 [측정: 비율만].

→ 정리본: [17_actor.md](../engine/17_actor.md) §4.2, 7, 8.2, 9.4

## 4. 막힘 요소 (기존 판독 결과 재사용)

초기 조사 후보 ② 속도 출처·③ 지면 보정은 §3.5, ④ 영역 번호·⑤ 결과 값·⑥ NPC 짝은 §6.10, ⑧ 스탬프·UI 부품은 §5.1에서 해소됐다. 공용 충돌은 `MeshCollider`, 실제 방은 HTTP + socket.io로 구현돼 있다(§5.2·online.md 9.5~9.6). 남은 원본 수치·그래픽 연결부는 §7, 웹 근사·미구현은 §8에 적는다.

## 5. 광장 2D UI (사용자 추가 범위)

`ComUiMainMenuLayout` @0x71000741b4 이 하위 UI 를 묶는다: `UiPlayerStatus`·`UiModeSelectShortcutGuide`·`UiLocationTelop`·`UiGuide`·`UiGuideTop`·`UiGuidePop`·`UiGuideOnline`(+`GetUiGuideBottom`) [판독].

| UI | 원본 | 레이아웃·라벨 | 웹 재사용 / 새로 |
|---|---|---|---|
| **하단 파티 줄** | `ComUiPlayerStatusMgr` @0x71000806c0·`SetPlayers` @0x7100080a30, 칸마다 `ComUiPlayerStatus`(`SetCharacterId` → `x_face`) / 빈 칸 `ComUiPlayerStatusEmpty` | `menu/menu_common/layout.lyt` 의 `mncom_base_status_00`(목록 `x_null_list`, 스탬프 `x_null_stamp`) + 부품 `mncom_status_00/01`, 손님 이름 `im_guest00_name` [판독][데이터] | **구현**: menu_common 덤프·얼굴·이름 세터는 §5.1 ①. charselect·online의 `sys_username`·`sys_face` 규칙 재사용 |
| **파티 입장** | 온라인 참가 → `UiNoticeModule::RegisterNotice`·`SetJoinPlayerName`(18·3회 호출) + 3D 캐릭터 등장(`SetupLocalPlayer`/원격 `Player` 생성) + 하단 줄 `SetPlayers` 갱신 | `sys_notice_00/01`, `Notice_JoinSession` | **재사용**: online `widgets.ts` 알림(online.md 9.3 정정: `x_pict` 숨김·`x_text_00`, in → 2 s → out, `SQ_SE_SYS_NOTICE`) |
| **상단 알림·대기 텔롭** | `UiNoticeModule`(상단 알림) + `ComUiNetLobbySessionStatus`(대기 N/4 ↔ 출발 가능) | `mn00_base_lobby_00`/`mn00_tlp_lobby_00` | **재사용**: `web/script/app/scene/menu/online/`(텔롭·알림·안내 글자). 광장 장면 위에 얹기만 |
| 장소 텔롭 | `ComUiLocationTelop` @0x7100073740/`SetArea` @0x7100073ac8 | `menu/menu00/layout.lyt`의 `mn00_text_plaza_00` [판독 §5.1 ③], in/normal/out, `x_icon_new`, 설명 `x_null_text_mess` | **새로**(작음). 메시지 라벨 §2 |
| 다가가기 안내 | `bq::ComUiPopGuide`(main) | bq Parts `sys_guide_pop_00` [판독 §5.1 ④] | **새로**: 위치 규칙은 §2. 그림은 원본 `sys_guide_pop_00` |
| 하단 버튼 안내 | `ComUiGuide00`·GuideTop/Bottom/Online | `sys_guide_*`(charselect 와 같음) | **재사용**: mgmcommon 안내 |
| 친구 매치 메뉴·방 목록·대화상자 | online.md 그대로 | | **재사용**: online 모듈 + mgmcommon `dialogBox.ts` |

### 5.1 D 갈래 판독 결과 — 2D UI·스탬프·위치 동기 (2026-10-08, plaza-D)

새 판독 C: `analysis/decomp/plaza_main_stamp.c`(main `bq::UiStamp`·`bq::ComUiStamp`·스탬프 조작부 0x7100353640~0x710035a60c), `plaza_main_stamp_list.c`(목록·안내 0x710035a60c~0x710035de84), `plaza_main_popguide.c`(`bq::ComUiPopGuide` 0x710027a194~). menu00 쪽은 기존 `plaza_menu00_ui.c` 를 읽었고 잃은 문자열은 `online_strrefs.py`(adrp+add) 로 찾았다. 레이아웃 덤프 `extracted/converted/ui/menu_common/`(이번에 `ui_lyt.py dump`). 앞 표의 "[추정]·[미확정]" 칸은 아래로 대체한다.

**① 하단 파티 줄 `ComUiPlayerStatusMgr`** [판독 @0x71000806c0·SetPlayers @0x7100080a30·Start @0x7100082fb0, 문자열 = 어셈블리]
- 레이아웃: Mgr = `mncom_base_status_00`(in/normal/out, 칸 `x_null_status_{k}P_4`·`x_null_status_{k}P_8` [데이터]), 사람 칸 = `mncom_status_00`(`x_parts_username`=sys_username_01, `x_face`=sys_face_00, `x_null_stamp`(−28,154)·`x_null_guide`(0,60)·`x_null_list`(−28,94)), 빈 칸 = `mncom_status_01`(`x_base_name` + 점 3개). 둘 다 애니 없음(In = 보임·상태 0, Out = 숨김·−1).
- Start: 칸 수 n = 8인 방(게임싱크 최대 8) 이면 8, 아니면 4 → 빈 칸 n개를 만들어 칸 `x_null_status_{i+1}P_{n}` 에 붙이고(SetConstraint, 칸 이름은 문자열표 [데이터], i 순서 대응은 [추정]) SetPlayers, Mgr "in". Update: 상태 1(대기) 동안 **매 프레임 SetPlayers**.
- SetPlayers 오프라인: PlayerID 0..n−1 마다 PlayerWork 가 없거나 **PlayerType ≠ 0(COM) 이면 빈 칸 In**·사람 칸 지움, 사람이면 빈 칸 Out + 사람 칸(없으면 만듦: 이름 = 닉네임, 비면 `im_guest00_name`, 얼굴 = 캐릭터) In. 온라인: 세션 멤버(정렬 FUN_7100084460 [미확정: 키])마다 캐릭터 ID 를 받은 사람만 앞에서부터 칸을 채우고(이미 있으면 SetCharacterId), 나머지 칸 = 빈 칸.
- 얼굴: `SetCharacterId(c)` c > 0x15 면 `x_face` 숨김, 아니면 보임 + `UiControlStatusFace` 세터 → 웹은 online 과 같은 `face_128_pcNN^u` 를 `x_face/x_face_pc64` 에 [재사용]. 이름 = `UiControlStatusName` 세터 → `x_text_00`·`x_text_01` 둘 다(online.md 9.3 정정과 같음).

**② 스탬프** [판독]
- 데이터 `bq.nx.bea/common/data/stampList.json` 46개(StampID = 배열 번호, Number 1000~1002 = 캐릭터 스탬프 Type PC, 0~42 = COMMON) + `StampShortcutData` 4개(L·R·X·Y 의 Bd/Menu 번호, 메뉴 = 1000·25·13·9) [데이터]. 텍스처 = Parts BNTX `stamp_%02d%03d`(PC = PCNumber·번호, COMMON = 00·번호) [데이터: 123장, GetTextureName 은 이름 규칙 정황 [추정]]. 글자 = `Stamp_MessageLabel`(koKR stamp.json, 예 13 "좋아!"), 글자색 = TextColorRGB.
- `ComUiPlayerStatusMgr::SetPlayers` 가 사람 칸을 만들 때 **칸 수가 4일 때만**(8인 방은 스탬프 없음) `UiStamp::Add(StampInfo)` → `SetConstraint(정보, 칸 레이아웃, "x_null_stamp", "x_null_list", "x_null_guide")` → **이 사람 ≠ 조작 플레이어(GetOperationPlayerId)이고 로컬이면 `UiStamp::In`**(어셈블리 0x7100081a1c·0x7100082a14 cmp). 즉 1번(조작·이동하는 사람)은 스탬프 조작부를 받지 않고, 따라 걷는 로컬 2~4P 만 받는다. 원격 멤버는 조작부 없이 말풍선만.
- 조작부(FUN_7100355b30 생성·FUN_7100356e20 갱신, 레이아웃 `sys_stamp_base_00`): 안내 `sys_stamp_guide_00`(글자 `smp_ctrl_several_top` "🕹 스탬프", 그리기 순위 0x9100) 는 In 때 "in". **스틱(입력 0xf0000)** 을 넣으면 안내 "out" + 목록 "in"(한 번만, +0xed). **L·ZL(0x50)/R·ZR(0xa0)/X(0x4)/Y(0x8)** = 단축 0~3 → 목록·안내 즉시 숨김 + 그 스탬프 보내기. 보낼 수 있음 = 말풍선이 없거나 끝남(FUN_7100357510).
- 목록(FUN_710035ae30): 이 기기 사람(로컬·PlayerType 0) 이 **2명 이상이면 `sys_stamp_list_00`(6칸), 1명이면 `sys_stamp_list_01`(8칸, `x_text_close`=smp_oneList_ctrl_back "B 닫기", `x_text_stamp`=smp_oneList_ctrl_muteCheck)**. 항목 = 46개 중 가진 것(StampData::IsGet) 또는 해금 그룹 −1(FUN_7100298518 [추정: UnlockGroup]) 순서대로. 입력(FUN_710035c9b4, 반복 입력): 왼쪽(0x10100)/오른쪽(0x40200) 칸 이동(페이지 안 넘김), 위(0x20800)/아래(0x80400) 페이지 이동(넘김), A = 칸 "press" + 결정 콜백(보내기).
- 말풍선 `ComUiStamp`(생성 @0x7100359c98, 레이아웃 = 데이터 LayoutName `stamp_00`, 순위 0x9100): `x_stamp_00` 재질 텍스처 교체 + `x_text_00` = 메시지 라벨 + 글자색, **`inout` 애니 1회(−25..65 = 90 프레임 = 1.5 s [데이터])** 가 끝나면 끝(IsFinished). 위치 = 칸의 `x_null_stamp` 전역 위치. 소리 = 로컬 `SQ_SE_STAMP_%dP`(PlayerID+1), 원격·플레이어 없음 `SQ_SE_STAMP_PC`(+로컬 변수 0 캐릭터 번호·1 Number%1000·2 [미확정]), 진동 `bv_vib_stamp_deci`. 네트워크 = `NetTransfer(0xf019)`.

**③ 장소 텔롭 `ComUiLocationTelop`** [판독 @0x7100073740·SetArea @0x7100073ac8, 어셈블리 문자열]: 레이아웃 `mn00_text_plaza_00`(menu00 lyt, in/normal/out, 그리기 순위 0x400). 제목 `x_text_title` = `mn00_mainMenu_ui_name`(Text0 삽입 = 이름 라벨) 후 `A_alignment_00` 정렬, 설명 `x_text_mess` = `mn00_mainMenu_ui_detail`(Text0 = 설명 라벨), `SetVisibleDetail` = `x_null_text_mess`. AREA → 이름/설명: 0 기구 `im_mn_balloon_*`, 1 `im_mn_guide_*`, 2~6 `im_mn02~06_*`(스탬프 숍·카드 숍·뮤직 숍·데이터 하우스·랭킹), 7 `im_mn_friend_*`, 8 `im_mode19_name`/`im_mn_quest_detail`, −1 = 아무것도 안 함. `x_icon_new` = 2~6 의 새 항목 여부(저장 데이터) — 웹은 저장이 없어 숨김.

**④ 다가가기 안내 `bq::ComUiPopGuide`** [판독 main @0x710027a194~]: 레이아웃 **`sys_guide_pop_00`**(bq Parts, `x_baloon`·`x_icon_btn`=sys_icon_btn_00, 순위 0x8800). SetIcon(1) = `x_icon_btn_right`(A 위치)만 보임, SetPopRotateZ(−45) = `x_baloon` 회전 −45°·`x_icon_btn` +45°. In = "in"(상태 1) → 끝나면 "normal" + `x_icon_btn` "normal"(2), Out = "out"(3) → 끝나면 숨김(0). 위치(MainImpl) = 1번 위치 + (0, PCHeight×0.8, 0) 뷰포트 투영 → 레이아웃 좌표 (x·960 + 70, y·540).

**⑤ 온라인 안내 `ComUiOnlineGuide`**(UiGuideOnline, `mn00_friend_guide_00`): `x_text_btn` = `mn01_mainMenu_ctrl_friend_btn`(E001 = Y), `x_text_friend` = "친구", `x_text_guide` = `mn00_mainMenu_ctrl_look`("X 광장 보기"), In 때 `null_friend`·`x_btn` 보임 = 사람 수 < 4. 세션 중이면 Out [판독 MainImpl].

**⑥ 위치 동기** [판독 `ComPlayerUtil::ReceiveMessageImpl` @0x710003fbd0·`SendRemotePlayerInfo` @0x710003fd64·`PlayerManager::OnReceive` @0x71000421e0]: 로컬 슬롯 < 4 만, 타이머 ≤ 0 이고 **속도 벡터 제곱합(4성분) > 0.1** 이면 보내고 타이머 = 0.2, 아니면 타이머 −= Δt(멈춰 있으면 타이머 0 유지 → 다시 움직이는 순간 바로 보냄). 보내는 값 = 스테이션·슬롯·캐릭터·위치·회전(쿼터니언), 세션 연결·스테이션 ≥ 2 일 때만. 받는 쪽: 처음 보는 (스테이션, 슬롯) 이면 그 캐릭터로 Player 를 만들고 위치·회전을 바로 놓음(첫 표시 플래그면 기본 소켓). 그 뒤 거리 > 5 순간이동, ≤ 1 회전만 `ComActorAutoInterpolation`, 사이 = 위치·회전 보간. **0.2 s는 송신 주기이며 원본 보간 시간이 아니다** [판독]. 수신 분기의 PLT(menu00 @0x710004275c~0x7100042804, GOT +0x1d9710/+0x1d9718)는 `Start(Vector3f,Quaternion)` / `Start(Quaternion)`이다. main @0x710002023c·@0x7100020628은 목표를 +0x40/+0x50에 저장하고 위치/회전 플래그 +0x60/+0x61을 켠다; 시간 인자는 없다. 위치 진행은 §6.10 ②의 이동 속도 6과 도착 판정, 회전은 §3.5의 액터 선회 규칙을 재사용한다. **웹 현재 구현**(2026-10-09, plaza-interp): `RemoteActor`·`RemoteTable`은 수신 목표·(스테이션, 슬롯)·수명만 맡고, `PlazaUi`는 받은 패킷마다 `net:remote` {station, slot, chara, pos, quat}(mode·speed 없음)를 낸다. 표시 actor(`follow.ts RemoteMotion`)의 `AutoInterpolation` 하나가 **표시 위치 기준** 5/1 m 분기·위치/회전 flag를 처리한다. 위치 진행의 Run6 액션 대응·로컬 충돌/접지 보정은 [근사]로 남는다. 정지 좌표는 원본처럼 보내지 않고 d>5 순간이동도 진행 중 보간기를 멈추지 않는다. 웹 송신 타이머는0.2 s, 고정60 Hz의 실제 간격은13틱(0.2167 s)이다. **수정 전 과거 경로**는 UI 내부 pos의0.2 s 선형·slerp → 매 틱 목표 발행 → mover 재추종이었으며 현재는 제거됐다. 변경 내역·현재 구현·시험 수치는 [12_online_sync.md §6.2.1](../engine/12_online_sync.md).

**웹 모듈(D)** `web/script/app/scene/world/plaza/ui/`: `status.ts`(①, 순수 상태) · `stamp.ts`(②, 순수 상태) · `telop.ts`(③④⑤ 순수 상태) · `net.ts`(⑥ 보내기 타이머·수신 목표/수명 보관, 순수) · `view.ts`(그리기: 투명 WebGL 캔버스 + charselect Render2D, online `OnlineScreen` 을 같은 캔버스에 얹음) · `part.ts`(PlazaPart `createPlazaUi`) · `index.ts`. 에셋 `web/assets/plaza/ui/plaza_ui.json`(+tex/font/sound) ← `web/tools/analysis/plaza_ui_assets.py`(online_web_assets.py 방식). 갈래 신호(SHARED 합의): D 가 듣는 것 `interact:telop` {area, visible, detail}·`interact:pop` {x, y, visible}(레이아웃 좌표)·`ui:mainLayout` boolean, D 가 내는 것 `ui:friendMenu` boolean(친구 매치 메뉴 열림 = 이동 멈춤)·`ui:stampList` {slot, open}·`net:remote` {station, slot, chara, pos, quat}(수신 패킷마다 전달하는 원본 목표, mode·speed 없음; C 의 RemoteMotion 이 표시 보간).

정정(구현 뒤): 묶음 상태 = `ui.ts`(`PlazaUi`: ComUiMainMenuLayout Start/Finish·UiStamp 맵·`PlazaNet`(광장 사건 remoteInfo·stamp 를 온라인 흐름 inbox 와 가르는 어댑터 대리)·친구 매치 = 조작 플레이어 Y(bex 0x8)·대기실 A 막음), 명세 확장 = `data.ts`. C 요청 반영: `interact:decide` {result:3}(친구 매치 오브제 앞 A) → 친구 매치 메뉴, 메뉴가 닫히면 메인 레이아웃 복귀, `net:session` boolean(방 접속 여부가 바뀔 때). `interact:pop` 은 `ndc:[x,y]`(뷰포트 −1..1, D 가 §5.1 ④ 식으로 바꿈)도 받는다. 스탬프 소리 SQ_SE_STAMP_1P~4P·PC 는 별도 소리 묶음 `sound~subarc_voi_stamp`(fsst, 캐릭터 목소리 + 로컬 변수) 에 있어 공용 렌더 도구(sound_seq.py, 상주 fspj 만)로 만들지 못함 → 소리 없음(라벨 사건만) [§8]. 검증: `npx tsx tools/test_plaza_ui.ts` 119/119(재구현 시험, 원본 실행 대조 아님), `tools/test_online.ts` 154/154 그대로, tsc 새 오류 0.

### 5.2 대기실(방) 흐름 점검·수정 (2026-10-08, plaza-room)

사용자 지적("파티를 만들거나 참가하면 광장에서 사람들과 만나고 대기실로 쓰는데 안 되어 있다")으로 가짜 어댑터 흐름을 코드·상태로 따라가 끊긴 곳을 찾고, 판독(online.md 5.5·5.6 정정·5.8, C `analysis/decomp/plaza_menu00_lobby.c`·`plaza_main_card*.c`·`plaza_main_cardviewer_upd.c`)대로 고쳤다. 실제 방 서버는 online.md 9.5.

| # | 끊긴 곳(수정 전) | 원본 [판독] | 수정 |
|---|---|---|---|
| 1 | 방장이 기구로 가면 세션 중에도 오프라인 출발 연출(페이드 1 s → SequenceBalloon 기구 이륙) 뒤 `exit session`, `startRoom` 을 아무도 부르지 않아 **다른 멤버는 그대로 광장** | `SelectedBalloonImpl` 세션 분기 = 카메라·플레이어 Stop·LookAt(balloon_pos) 뒤 바로 `PlaySession`(연출 없음) | balloon.ts `begin()`: 세션이면 'net:playSession' 을 내고 대기(phase 'session'). D(PlazaUi) 가 온라인 흐름 `requestPlay()` → `playSession`(startRoom) |
| 2 | 손님은 `started` 를 받아도 대기실 흐름이 무시 | 메시지 7 → 손님도 FinishSequence·Stop·같은 PlaySessionFiber | flow.ts `lobbyFlow` 가 `started` 를 받으면 방장·손님 모두 같은 끝(`SQ_SE_MENU00_TRANSITION_WHO`·텔롭 Out·1 s). D 가 'net:started' → balloon.ts 가 입력·카메라 멈춤 → **0.5 s 페이드 아웃 → 1.0 s → `exit({k:'session'})`**(PlaySessionFiber 순서) → main.ts 모드 메뉴 |
| 3 | 원격 멤버는 움직일 때만 위치를 보내서 **가만히 있는 사람은 광장에 안 보임** | 참가자 = 지도 데이터 뒤 `SendRemotePlayerInfoAll`, 기존 멤버 = 새 멤버 데이터(사건 4) 받으면 `SendRemotePlayerInfoAll` | PlazaUi 가 `joined`(내가 참가)·`memberReady`(남의 데이터 도착) 때 다음 틱에 모든 로컬 슬롯 위치를 타이머와 무관하게 보냄 |
| 4 | 방을 나가거나 해산·오류로 세션이 끝나도 원격 3D 캐릭터가 남음 | `ResetRemotePlayer`(세션 끝) | 세션이 끝나면 원격 표·3D 모두 지움('net:remoteLeft' 스테이션마다) |
| 5 | follow.ts 원격 키 = 스테이션만(슬롯 무시, 타입 number) | `PlayerManager` 원격 맵 키 = (스테이션, 슬롯) `NetworkPlayerInfo` | 키 = `스테이션#슬롯`, 이탈은 스테이션의 모든 슬롯 |
| 6 | 대기실 −/+ 안내·멤버 카드 없음 | MainImpl 세션 분기: 입력 없으면 ComUiGuide00 위치 0xc `mn01_friend_ctrl_lobby_card`, **0x3000 → 카드 뷰어**(online.md 5.8) | `plaza/ui/card.ts`(ComUiCard·ComUiCardViewer) + 안내. 카드가 열려 있는 동안 대기실 입력(Y·X·B)·이동을 막고, 닫히면 돌려준다. 기구 출발 건너뛰기(+/−)는 오프라인 SequenceBalloon 에서만 쓰여 겹치지 않음(세션이면 기구 연출 자체가 없음) |
| 7 | 손님도 기구 앞에서 다가가기·기구 결정이 됨 | 세션 중 손님은 판정 안 함, 방장 기구는 IsReadyNetworkPlayerData 일 때만 | interact.ts 는 다른 갈래 파일 → SHARED 요청(D 가 'net:lobby' {host, ready} 를 냄). 받기 전까지는 손님이 기구로 가도 `startRoom` 을 보내지 않는다(서버·흐름이 방장만 허용) |

- 참가 뒤 위치: 원본 `OnlineMenuImpl` 끝은 `RestoreLocalPlayerData` 가 참(로컬 플레이어 데이터가 바뀜 — 예: 참가 때 캐릭터 다시 고르기)일 때만 로컬 플레이어를 `pc_plaza_balloon_pos_p<사람 수>_pc<i>` 에 다시 만들고 카메라를 로케이터 3 으로 옮긴다. 아니면 **친구 매치 기계 앞 그 자리 그대로** 대기실이 된다 [판독 @0x710005c780 끝]. 웹은 캐릭터 다시 고르기가 자동 교체 [설계, online.md 9.3]라 3D 캐릭터를 바꾸지 않고 그 자리 그대로(§8).
- 원격 첫 표시: 받은 위치에 바로 놓는다. 첫 표시 플래그(광장 재진입 `SendRemotePlayerInfoAll_Setup`)의 기본 소켓 경로는 웹 흐름(광장 재진입 없음)에서 쓰이지 않아 구현하지 않음(online.md 5.5 정정 줄).
- 연결 수명·메시지 배치·바이트 수·케이스(혼자 / 사람 1 + CPU / 로컬 사람 2~4 + CPU / 로컬 2 + 원격 2)는 online.md 9.5 표. 광장 입장·로컬 플레이만으로는 HTTP·소켓을 부르지 않고, 방 찾기·만들기·참가는 HTTP, 방에 들어가는 순간 socket.io `/mpj-plaza` 에 연결한다. 로컬 여러 명은 한 소켓(스테이션)에 사람 순번 슬롯으로 묶여 원격에서 `스테이션#순번` 캐릭터로 보인다.
- 시험: `tools/test_room_server.ts`(방 상태·바이너리 크기·HTTP·소켓·케이스·두 광장 UI), 헤드리스 `tools/shot_plaza_room.ts`(두 페이지가 같은 서버로 만나 출발까지, 마지막 1회).
- 정정(2026-10-08, plaza-room2 — 사용자 지적 "파티에서 나가면 그 파티 플레이어들이 그대로 남음, socket.io 방 만들기·찾기 반영 안 됨"): 원인·원본 규칙·수정 표는 [online.md](online.md) 9.6. 요약: ① 광장 기본 어댑터가 가짜였음 → **기본 = 실제 서버**(`?online=fake` 만 가짜), `npm run dev` 가 방 서버를 같이 띄움. ② 위 4번 "세션이 끝나면 원격 표·3D 를 지움"은 세션 끝 한 순간만 지우고 그 뒤(같은 틱·가짜 0.5 s)에 온 위치로 다시 만들어져 남았다 → `PlazaUi` 가 **매 틱 원격 표를 방 멤버 스테이션에 맞춤**(비멤버 위치·스탬프 버림, 남은 비멤버 = 'net:remoteLeft' → follow.ts dispose). ③ 나가기·해산 뒤 친구 매치 메뉴가 아니라 원본처럼 **혼자 광장 메인**(흐름 옵션 `lobbyExit: 'end'`). ④ 열린 카드 뷰어에서 나간 사람 카드를 뺌 [설계]. ⑤ 로컬 2명 스테이션 준비 반영. ⑥ 서버 없음·HTTP 실패 = `sys_error_B3`(시간 초과 B4) 대화상자 → 광장 계속. 끊김 규칙(탭 닫기 즉시, 네트워크 끊김 ≈ 15 s 핑)도 online.md 9.6. 시험 `tools/test_room_server.ts` ⑤(실제 서버에 광장 UI 세 개: 만들기·찾기·참가·서로 보임·손님 나감·다시 참가·핑 끊김·탭 닫기·방장 해산, 목록 반영·참가 거절, 서버 없음, 가짜 어댑터 같은 정리), 헤드리스 `tools/shot_plaza_room.ts` 는 `npm run dev` 와 같은 `tools/serve.ts` 구성으로.

## 6. 구현 지시서

### 6.1 모듈 위치 [설계]
- `web/script/app/common/render3d/` — 공용(계약 stage3d.md). 광장 갈래가 채울 남은 일: 텍스처 축소(또는 KTX2), `Collider` 구현(`MeshCollider`, 원본 obj 입력), follow 카메라 슬롯 driver, `test_stage3d.ts`. import 경계는 mgm_common §9.1 을 지킨다.
- `web/script/app/scene/world/plaza/` — 광장 전용(신규): `world.ts`(MapStructure → 배치·부착·애니), `actor.ts`(ComActor 이동 근사), `follow.ts`(ComFollowPlayer), `camera.ts`(ComMenuCamera 추종), `npc.ts`, `interact.ts`(GetArea·거리 판정·PopGuide·장소 텔롭), `balloon.ts`(기구 출발 연출), `ui/`(하단 파티 줄·장소 텔롭, online·mgmcommon 재사용), `flow.ts`(SequenceMainMenu 축소판: 광장 ↔ 친구 매치 ↔ 기구), `index.ts`.
- 변환: `web/tools/analysis/plaza_world_assets.py`(신규) → `web/assets/plaza/world/{model,tex,anim,chara,collision.json,manifest.json}`. `graphics_convert.py` 에는 세트 함수만 추가한다.
- 페이지: `web/script/plaza_page.ts`(신규). **index.html 진입** = `script/main.ts` 에 `?plaza=1` 한 갈래를 더한다(`?charselect=1` 과 같은 꼴: 시작 전에 광장 → 기구 → 기존 `modeselect_page`(모드 메뉴) → 미니게임 항구/프리 플레이 `mgm01_page` 목록 → 고른 게임 시작). 시험 훅 `window.__mpj.plaza`(위치·영역·상태).

### 6.2 단계·시간 (실측 기준: 화면 하나 30~60분)

| # | 작업 | 근거 파일 | 예상 |
|---|---|---|---|
| 1 | 에셋: MapStructure 기본 28 + `_Dft` 장식 7 + menu_common 기구·받침 + 로케이터 3 → glb, 텍스처 축소, fskb·fmab·fsnb json, env 컨테이너, 충돌 obj → `collision.json`, NPC 8 아카이브·플레이어 co 모션 | §1, `MapStructure.json`, 06_scene_data §5 | 60분 |
| 2 | 무대: 맵 로딩·루프 애니(바다·분수·상점·하늘 NPC 경로·갈매기·풍선)·환경, `?plaza=1` 페이지 골격 | stage3d.md | 45분 |
| 3 | Collider(지면 광선 + 캡슐 미끄러짐) + `test_stage3d` | §3.2 | 45분 |
| 4 | 플레이어 이동: 레버(카메라 기준) → 걷기/달리기·선회·중력·접지, co_idle/walk/run 전이 + 판독 ②③ | §3.1, mg0912.md §4.6·§6, `plaza_menu00_world.c` | 60분 |
| 5 | 추종 카메라(CameraParam 섞기) + 따라가기(로컬 사람 2~4P) | §2·§3.3·§3.4 | 45분 |
| 6 | NPC 배치·대기 애니(11종, MC 시선) + 판독 ⑥ | §1.2, `plaza_menu00_npc_seq.c` | 60분 |
| 7 | 상호작용: 영역·거리 판정·PopGuide·장소 텔롭 + 판독 ④⑤ | §2, `plaza_menu00_npc_seq.c`(MainImpl)·`plaza_menu00_ui.c` | 45분 |
| 8 | 기구 출발 연출(카메라 cut00/01·takeoff 500f·충돌 끔) → 모드 메뉴·프리 플레이 연결 | §2 | 45분 |
| 9 | 2D UI: mncom 덤프 → 하단 파티 줄, online 텔롭·알림·친구 매치 메뉴 연결, 가짜 원격 플레이어 이동 + 스탬프(main UiStamp 판독 30분 포함) | §5, online.md, `plaza_menu00_ui.c` | 135분 |
| 10 | 통합 시험(`test_plaza.ts`: 배치·소켓·이동 수치·영역·따라가기) + **index.html 헤드리스 촬영 마지막 1회** | §6.4 | 45분 |

합계 **직렬 약 9.5시간**(VFX·셰이더 그래프 근사 제외).

### 6.3 병렬 4갈래 (SHARED.md 선점 필수, 결과 줄에 web 코드 분석 포함)

| 갈래 | 단계 | 쓰는 곳 | 지시 요점 |
|---|---|---|---|
| **A 무대·에셋·페이지** | 1 → 2 → 3 | `tools/analysis/plaza_world_assets.py`, `assets/plaza/world/`, `app/common/render3d/`(Collider·텍스처 축소·test), `script/plaza_page.ts`, `main.ts` `?plaza=1` | 먼저 manifest 형식(`layout` = MapStructure 항목·부착 소켓)과 `collision.json` 형식을 SHARED 에 올린다. stage3d 코어 소유자와 겹치면 계약 추가만 한다 |
| **B 이동·카메라** | 4 → 5 | `app/scene/world/plaza/{actor,follow,camera}.ts` | A 의 에셋 전에는 obj 충돌 + 빈 바닥으로 시작한다. 판독 ②③(ComMatter 덮기·지면 보정) 먼저. 수치는 §3 그대로, 근사는 문서에 [근사]로 적는다 |
| **C NPC·상호작용·기구** | 6 → 7 → 8 | `app/scene/world/plaza/{npc,interact,balloon,flow}.ts` | 판독 ④⑤⑥ 먼저(어셈블리). 모드 메뉴·mgm01 목록은 기존 페이지 모듈을 부르기만 한다(수정은 SHARED 조율) |
| **D 2D UI·온라인** | 9 | `app/scene/world/plaza/ui/`, mncom 덤프(`extracted/converted/ui/menu_common/`), online 모듈 작은 Edit | online `widgets.ts`·`view.ts` 의 알림·텔롭을 광장 위에 얹는다. 하단 줄은 새로. 스탬프도 원본대로 구현한다(main `bq::UiStamp` 판독 → `x_null_stamp` 말풍선, 가짜 온라인 멤버가 가끔 보냄 [설계]) |

**모든 갈래 공통 규칙**: 최대한 원본과 같게 만든다. 판단이 필요하면 멈추지 말고 **원본에 가장 가까운 쪽으로 정해 진행**한 뒤, 그 항목을 §8 '사용자 확인 필요'에 한 줄(무엇을·왜 그렇게 정했나·근거)로 덧붙인다. 근사·설계 값은 코드와 문서에 [근사]/[설계]로 표시한다. 헤드리스는 마지막 1회만 쓴다.

임계 경로: A(2.5시간) → 통합 10(45분). B·C·D 는 A 의 manifest 계약만 받으면 같이 간다. **병렬 약 3.5시간**.

### 6.4 마지막 확인 = index.html 헤드리스 촬영 (tools/shot_plaza.ts, 1회)
`dev/index.html?plaza=1&fast=…` 로 ① 맵 로딩 직후 전경, ② 1번 레버 이동(걷기·달리기 모션), ③ 로컬 사람 2~4P 따라가기, ④ 상점 앞 PopGuide·장소 텔롭, ⑤ 가짜 온라인 입장 → 상단 알림 + 하단 파티 줄 + 대기 텔롭, ⑥ 기구 접근(카메라 섞임) → 출발 컷 → 모드 메뉴. 콘솔 오류 0. `test_plaza.ts`는 판독값을 이용한 재구현 시험이며 원본 실행 확인이 아니다(헤드리스는 웹 촬영).

### 6.5 A 계약 — `web/script/app/scene/world/plaza/` (plaza-A, 2026-10-08) [설계]

- 파일: `types.ts`(계약)·`world.ts`(무대)·`deco.ts`(장식 규칙 §6.6)·`scene.ts`(실행기 `startPlaza`)·`parts.ts`(부품 목록)·`index.ts`. 페이지 `web/script/plaza_page.ts`.
- **현재 무대 로드 완료** = `createPlazaWorld()` 반환 시 충돌·P0 모델/부착/GPU 준비 완료. 나머지는 관리자 등급에 따라 뒤에 나타나고, 애니는 무대 시작 프레임으로 맞춘다(`world.ts`, [loader_manager.md](../engine/loader_manager.md) §11.4·§14.9 재사용). 전체 모델을 기다리는 옛 계약은 `loadMode:'seq'` 경로.
- **부품**: 갈래마다 `PlazaPartFactory = (ctx) => Promise<PlazaPart>` 를 자기 파일에서 내보내고 `parts.ts` 의 `PLAZA_PARTS` 에 자기 줄만 더한다(순서 = update 순서: B player·camera → C follow·npc·interact·balloon → D ui). `PlazaPart{ name, update?(df, frame), afterRender?(), resize?(), debug?(), dispose?() }`.
- **ctx**(`PlazaContext`): `world`, `players`(slot·pcNN·isCom·local·name), `actors`(B·C 가 넣는 움직이는 사람 목록: 발 위치·yaw·속도·모션·키), `pad(slot)`(NPAD 비트 + 스틱 −1..1), `sound{se,bgm}`, `overlay`(2D 겹), `assetUrl(web/assets 기준)`, `params`, `on/emit`(갈래 사이 사건 `'<갈래>:<사건>'`), `exit({k:'balloon'|'session'|'cancel'})`.
- **world**(`PlazaWorld`): `stage`(Stage3D), `collider`(원본 CollisionMain), `cameraParam`(CameraParam.json), `layout`(MapStructure 111항목), `deco`, `entry(key)`, `socket(name)`, `pcSocket(kind,p,pc)` = `pc_plaza_<kind>_pos_p<p>_pc<NN>`(MapManager::GetAttachSocketPc* 이름 규칙 [판독]), `play(key, clip, opts)`, `setCollisionEnabled('CollisionMain', on)`(PlayBalloonTakeOff 가 끔 [판독 @0x710001bcd8]), `setDeco()`, `addUpdater()`.
- **카메라**: stage3d 슬롯 `anim`(fsnb 컷) > `follow`(B) > 둘 다 없으면 scene.ts 가 `char_start_pos` 뒤 MainMenu 값(높이 +2.5·거리 10·15°·fov 40) 고정 시점 [설계: 빈 자리 채움].
- **부착**(MapStructure hookKey/hookNode): 대상 모델의 노드 밑 자식으로 붙인다(뼈 애니를 따라감). 예 `Balloon` → `AttachLocater/balloon_pos`, 갈매기 3마리 → `Deco_D_AirGullLocater/gull_anim{,2,3}` [데이터].
- **기본 애니**: MapStructure `anim` 이름의 fskb 클립을 루프로, 같은 이름의 `.fmab` 를 무대 재질 애니로 돈다. MapStructure 에 없는 클립(친구 매치 startup/loop, 기구 `takeoff` = `AttachLocater` 의 `pos_balloon_takeoff` [판독 PlayBalloonTakeOff], 퀘스트 컷)은 C 가 `world.play` 로 튼다.

### 6.6 장식·배경 보임 규칙 [판독]

- `SequenceMainMenu::Setup` @0x7100059700 → `MapManager::ApplyDecoItem(SaveData::GetDecoItemData())`·`ActivateDecoNpc` [판독].
- `ApplyDecoItem` @0x71000148f0: DecoItemID 0..0x43 마다 MapStructure key 모델에 `SetVisible(IsDisplay(id))`(가상 +0x58). 키 문자열(스택 조립)을 복원한 표 = `deco.ts` `DECO_ITEMS`: 0~6 Sculpture(Dft·Bd01·Bd04·Bd05·Bd06·Bd07·Star), 7~16 Garland(+Blue·Green·Yellow), 17~23 Fountain, 24~30 Tree, 31~35 Plant(Bd01~07, Dft 없음), 36~43 Tile(+LittleStar), 44~51 Balloon(_00·_01 두 개씩), 52~61 Pick(캐릭터 10), 0x3e 갈매기(AirGullLocater+Gull00~02), **0x3f·0x40·0x41 = 장식 NPC B·C·E 묶음**(+0x70/+0x88/+0xa0 목록 Activate 0x60/Deactivate 0x68, 플래그 +0x68~0x6a), 0x42 Rainbow, **0x43 = CentralPlaza 분수 별 FX**(`FX_DECO_FOUNTAIN_STAR00`·`SE_MENU00_FX_DECO_FOUNTAIN_STAR00`, VFX 후순위).
- main `bq::save::DecoItemData` @0x710023aaa0~(새로 판독, `ghidra_work/plazaA/out_deco.c`): id 마다 3비트 [get, new, display]. 종류 표 @0x71015d7ad0 = [0×7, 1×10, 2×7, 3×7, 4×5, 5×8, 6×8, 7×10, 8×6] [데이터]. `IsDefault` = id < 0x2d 이고 마스크 0x101001020081(= 0·7·17·24·36·44 = 각 `_Dft`). `SetDisplay(id,true)` 는 종류가 4(Plant)·8(특수)가 아니면 같은 종류 display 를 먼저 지운다(`IsMultipleDisplay`). `IsExistDefault(type)` = 0x6f 마스크(종류 0·1·2·3·5·6).
- **처음 값** = 기본 6개(id 0·7·17·24·36·44)만 display, 나머지 끔 [추정: 새 저장 초기화 함수는 main 호출자 0건이라 못 찾음 — IsDefault 표와 "기본 장식은 해제 불가"(SetGet 이 기본 id 는 끄지 않음) 근거]. 시험값 `?deco=all|none|default|<key 또는 id>,…|bd=<비트>`(앞에서부터 SetDisplay(true) 규칙 그대로).
- `ApplyBgBd(UnlockBd)` @0x71000197e0: bit0 bd02·bit8 bd03·bit16 bd06, 0(잠김)이면 `bdNNObj` 숨김·`bdNNObj_lock` 보임, 1 이면 반대 [판독]. 처음 값 0(모두 잠김) [추정: 새 저장]. 가상 +0x60 = 켜기, +0x68 = 끄기(CollisionMain 에 +0x68 를 부르는 PlayBalloonTakeOff 와 같은 뜻) [판독].
- 장식 모델은 **보일 때만 읽는다**(처음 로드 줄이기) — 보임이 바뀌면 그때 읽는다 [설계].

### 6.7 에셋·환경·포스트·맵 애니 (`plaza_world_assets.py` → `web/assets/plaza/world/`)

- 변환 원천: `extracted/converted/graphics/{menu00,menu_common}`(graphics_convert.py 세트 menu00·menu_common, 텍스처 387+49 디코드 실패 0, 누락 0) [데이터].
- 나오는 것: `model/*.glb`(MapStructure model 항목 94종: menu00 92 + 기구·퀘스트 받침 2, 하늘 `menu00_sky.glb`), `tex/*`(그 모델이 쓰는 이미지 + 재질 색인 텍스처 + env 큐브·LUT), `anim/*.json`(fmab·env fmab·fsnb), `collision.json`(CollisionMain 2,666/4,440 + CollisionFirst 40/76, obj 그대로), `manifest.json`(StageManifest + `plaza{layout, cameraParam, collision, defaultAnims}` + `env`).
- **텍스처**: KTX2 도구(basisu)가 없어 PNG/HDR 그대로. 최대 변 1024 로 줄인다(해당 1장, 2048² → 1024² [근사]). 그 밖은 원본 해상도. 목표 = 처음 보이는 세트(장식 기본) 로드 ≤ 100 MB, 로컬 서버 15 s 안 [설계]. 실측은 §6.12.
- **env**(07 규칙 재사용): 빛 방향 = overwrite 회전 (−50°, −40°, 0°) → 빛 쪽 (−0.4132, 0.7660, 0.4924) [재구현 계산, mg1801 검산 일치], 색 (1.3338, 1.2702, 1.0658) × π [근사: 07 관례]. 그림자 캐스케이드 3·near 0.1·far 100·offset 1000 → 단일 맵 근사(07 §9.4). IBL: env 샘플러 순서 [_a0.._a2,_a5.._a7] = [menu01_ibl_rad, menu01_ibl_irr, menu01_fog, windnoise00, menu00_plaza_rad, menu00_plaza_irr] → 공통·캐릭터 확산 = `menu00_plaza_irr`, 반사 = `menu00_plaza_rad`, mip 안개 큐브 = `menu01_ibl_irr`, `env_sg_utility_texture2d0` = `windnoise00`(셰이더 그래프 바람) [데이터]. mip 안개 200~800·세기 0.8, 색 = 안개 큐브 평균 [근사: three 선형 Fog, 세기는 끝 거리 늘림]. `env_utility_parameter0/1` = (6,0.7,2,0.125)/(3.5,0.8,−66,0.01), `menu00_env00.fmab`(900f 루프)가 parameter1 .x 5~10·.y 0~2·.w 0.0025~0.01 을 움직인다 [데이터] → 셰이더 그래프 유니폼으로 넘긴다(§6.8).
- **포스트**(`menu00_post`): 톤맵 종류 **3**, exposure 0.99·offset −0.01·scale 1, 3D LUT `menu00_lut_00`(16³, 256×16 띠) 색 보정 켜짐, 블룸 threshold 0.7·intensity 3·spread 2·clip 5, FXAA 0.1666/0.08333/0.75, DOF·모션 블러 끔, utility_parameter0 (0.75,1,1,1) [데이터]. 원본 합성·톤맵 3·블룸·LUT는 §6.13에서 판독 완료. 웹 `stage3d/post.ts`는 그 식을 쓰며 FXAA만 마지막 LDR 단계에 둔다 [근사].
- **하늘**(`menu00_sky`, container/skybox, 셰이더 그래프 skybox 2824417686, 텍스처 `menu00_sky` 1000×250 Wrap/Mirror, param0 (−0.1, 0.05, 1, 1)): 카메라를 따라가는 상자로 그린다. 그래프 식은 §6.8 판독 대상.
- **점광원** `menu00_shop_collection_pointlight00`(반지름 2.8·core 1.35·색 (2.5,1.767,0.479), 위치 (−16.26, 0.50, 49.56)) → three PointLight(distance 2.8) [근사: 감쇠식].
- **맵 애니 전부**: fskb(맵 모델 클립, glb 에 구움) + fmab(+env)를 원본 프레임 시간축으로 돈다. 표준 재질의 fmab 값(`texture_srt0..3`, 재질 색 등)은 stage3d 재질 애니가 프레임마다 재질에 넣는다; 셰이더 그래프 재질의 sg_utility 값은 그래프 재질 유니폼으로 [설계].
- **충돌**: `collision.json` → stage3d `MeshCollider`(XZ 2 m 격자). 지면 = 수직선 교점 중 발 + STEP(0.5) 아래 가장 높은 위향 면(n.y > 0.05, 가파른 챌판도 허용). 벽 = |n.y| < cos 45°인 면에 반구 아랫면을 적용해 수평 밀어내기 3회 반복(§6.14 #13). STEP·벽 문턱은 웹 근사이며 원본 PhysX 컨트롤러 기본값으로 확정한 것이 아니다.

- **음악 상점 박자** [판독·데이터]: `MapManager::Create` menu00 @0x7100008fbc~0x7100008fd4가 `ShopMusic`에 별칭 `beat` → `menu/menu00/model/menu00_shop_music`를 `AddAnim`으로 등록한다(기존 `plaza_menu00_c_dis.c`). `SoundManager::Update` @0x710007051c는 유효 BGM 핸들의 `GetBeatCount(0)` 하위 바이트를 signed 값으로 비교/저장하고, 값이 바뀌며 bit7=0일 때 `PlayMusicHouseBeat` @0x7100020148를 호출한다. 이 함수의 MapModel 가상 +0x1b0은 `ModelBase::PlayAnimForce` @0x7100027300이며 인자는 `"beat"`; 속도 변경이 아니라 같은 모션도 다시 시작하는 경로다(모션 슬롯은 09_character §6.4 재사용). 본체 fskb=600f·loop=true, fmab=600f·loop=false, 홀로그램 fmab=600f·loop=true [데이터: glb extras·변환 anim JSON]. 웹 `manifest.plaza.defaultAnims.ShopMusic`은 둘 다 loop=true·speed=1로 계속 돌리며 박자 재시작 연결이 없다 [근사]. BGM 라벨·3D 층은 04_sound §12.14 참조.

### 6.8 셰이더 그래프 재질 판독 (plaza-A-sg1·sg2 보조 판독) [판독: SASS]
- 광장 모델 재질 273개 중 `static_opt_shader_graph = 1` 149개, 고유 재질 70개(모델별 옵션 변형 포함 75항목) [데이터]. 셰이더 팩 `_menu/menu00.bnbshpk`·`menu_common.bnbshpk` → `bnbshpk_split.py` → `bfsha_dump` → 재질별 프로그램(forward_plus 62 + 하늘 container p0) → `web/tools/analysis/plaza_graph_sass.py`(sass_dis 경로 래퍼) → `analysis/mat/plaza/sass/*.txt`. 식 = `analysis/mat/plaza_graph_1.json`(34재질+하늘+shading_type 0/2, sg1)·`plaza_graph_2.json`(36재질, sg2), 줄 번호 근거 포함.
- **핸들 규칙 정정** [판독]: 바인드리스 텍스처 핸들 = Material[0x10 × 샘플러 위치]. `sass_dis.py` 의 `Material.@` 주석은 위치 0~17 에서 한 칸 앞 이름이 붙는다(`@_a0` = 실제 _n0 …). 판독 식에는 바른 규칙을 적용했다. charselect 12.11 판독도 같은 도구를 썼으므로 다시 볼 필요가 있다 [미확정: 그 판독의 슬롯이 0~17 이었는지].
- 웹: `tools/analysis/plaza_graph_web.py` 가 판독 식을 이름만 정리(설명 꼬리 제거, 장면 UBO 이름 → 웹 유니폼)해 manifest.graphs(74 정의)로 넣고, stage3d `graph.ts` 가 재질 이름(+모델)으로 찾아 three 표준 재질의 정점(begin_vertex 뒤)·조각(emissivemap 뒤 한곳) 셰이더에 끼운다. 전부 GLSL ES 3.00 으로 컴파일 확인(test_plaza_world 6절, moderngl, 148 변형 + 무조명·SSS·srt0 패치).
- 그래프 효과 요약: 림(1−N·V)^p 색 더하기·태양 N·L^p screen 합성(덤불·섬·잎·탁자), 정점색 _C0/_C1 로 층 색(풍선·카펫 오버레이·나무 그늘/덧색·픽 물들임), HSV 이동(분수대·정원 테), 흐름맵 2겹 노멀+프레넬+거품(바다 p245 = mgmet p59 골격 + water_color_mask·스펙큘러 ×0.4), 회전·타일 스크롤 노멀(분수 물·무대 물), 카우스틱 2겹(fmab 회전), 마스크 층 칠하기+층별 거칠기(무대 콘크리트), 정점 바람 흔들림(grass_card·기구 balloon01·나무 잎 tree00·야자 leaf00·tree03 깃발 물결 — 월드 공간), 무대 깃발 물결(정점 z·노멀 섞기), 모니터·스크린(무조명 발광, srt0 이동 = 화면 넘김, 망점 hard-light), 홀로그램(3단 림 색·램프²·점무늬 맥동·림 알파), 라이트튜브(잡음 2겹 반대 흐름, 더하기 블렌드), 금박 시퀸(9배 타일 시퀸 노멀·거칠기 섞기).
- **shading_type** [판독 sg1]: 0 = 무조명(출력 = 기본색 또는 그래프 색 + 발광, 구름 p421·모니터 p40) → stage3d `patchUnlit`. 2 = SSS(덤불 atlas p366): 직접 확산 = mix(N·L, sss_diffusion_map(Ns·L·0.5+0.5, |2·curv.x−1|), curv.w), Ns = mix(Nw, 정점 노멀, curv.w·sss_normal_blend) → `patchSss`. 1 = 일반.
- **state_type** [판독 sg2]: 1 = 반투명(홀로그램), 2 = 더하기(라이트튜브·스탬프 유리), 4 = 곱하기(스탬프 망점·그림자) → stage3d `MaterialSetup.blend`.
- **하늘** [판독 sg1, container/skybox p0]: 무조명, u = (atan(r.x, −r.z)+π)/2π + P0.y, v = P0.x + acos(r.y)·2/π, 텍스처 rgba 그대로(시간 스크롤 없음) → stage3d 하늘 ShaderMaterial.
- 장면 UBO 값(원본 Layer·World 블록은 bfsha 에 필드 이름이 없음) [추정]: 바람 Layer[0x120..0x12c] = env_utility_parameter1(3.5 주파수, 0.8 주기 s, −66 방향°, 0.01 진폭 — menu00_env00.fmab 가 x·y·w 를 움직임) [sg1 추정], Layer[0x130..0x13c](야자잎) = env_utility_parameter2 [추정: 다음 vec4 — 값 (1,1,1,1)], 잡음 Layer[0x10]·World[0xe0] = windnoise00 [추정], World[0x4] = 경과 ms [추정], 태양 Layer[0x220] = 평행광 방향.
- [근사]로 남은 것: World[0xf0](기구 주름 마스크) 정체 미확정 → windnoise00, 미할당 슬롯(_m0·_n0·stage_concrete sg_utility_texture2d1)의 원본 기본 텍스처 → 0 / 평면 노멀, Model 불투명도 = 1, SSS 의 그림자 결합(원본 min(sh,·) → three 곱)·환경 확산 Ns 생략, punchthrough 색 패스에 discard 없음(깊이 선행 패스 몫 [추정]) → glb alphaTest 유지, 변환기 결함: carpet00·quest_entrance 의 uv3(bake AO) 가 TEXCOORD_2 에 0 으로 들어감(GltfExport.cs Packed 정규식, 안 고침).

### 6.9 페이지 진입 `dev/index.html?plaza=1` [설계]
- main.ts `?charselect=1` 과 같은 꼴: 시작 버튼 → `setplayer_page.runSetPlayer`(플레이어 설정 → 캐릭터 선택) → `plaza_page.runPlaza`(광장, 고른 캐릭터·COM) → 기구(`exit({k:'balloon'})`) → `modeselect_page.runModeSelect`(모드 메뉴) → 프리 플레이면 `mgm01_page.runMgm01List`(목록·설정) → 한 판 요청 = 웹에 있는 게임(GAMES)이면 main.ts `start()` 로 실행, 없으면 목록 페이지의 가짜 한 판 → 목록으로 돌아감. 다른 모드·취소는 광장으로 돌아간다.
- `?plaza=1&skipsetup=1` 은 플레이어 설정·캐릭터 선택을 건너뛰고 pc01~04(설정 패널 COM 체크) 로 바로 광장 [설계: 시험용]. `?deco=…` 는 §6.6.
- 시험 훅 `window.__mpj.plaza` = 실행기 debug(프레임·모델 수·로드 통계·카메라·actors·부품 debug), `window.__plaza` = 실행기.

### 6.10 C 갈래 판독 결과 — NPC·따라가기·상호작용·기구 출발 (plaza-C, 2026-10-08)

근거: `analysis/decomp/plaza_menu00_npc_seq.c`·`plaza_menu00_world.c`(C) + C 가 인자·반환값·점프표를 잃은 곳만 어셈블리(capstone, `nro.py`): GetArea·GetPosNodeLocater/GetAttachSocket 점프표·`MapManager::Create`(@0x7100007280, 51,728 B, 디컴파일 실패) 전체·ChangeColor 인자·Fiber 람다 본체. 발췌는 `analysis/decomp/plaza_menu00_c_dis.c`(INDEX 갱신). 로케이터 좌표는 fmdb dump 의 뼈 TRS(EulerXYZ)로 계산 [데이터].

**① 영역·다가가기·결과 [판독: 어셈블리 @0x710001a434, MainImpl @0x710005a170]**

- `GetArea(p)`: z < 18 이고 −9 < x < 9 → **0(기구 앞)**. 아니면 d = `camera00_pos`(로케이터 0, (0, 2, 33)) − p, d.y = 0, 각 = `CalcTurnDegY(d)` = atan2(d.x, d.z)° 를 [0, 360)으로(main @0x71002deb10): < 70 → **1**, < 110 → **6**, < 160 → **5**, < 200 → **4**, < 245 → **3**, < 290 → **2**, < 330 → **8**, 나머지 → **7**. 로케이터 좌표로 맞춰 보면 1 가이드(MC (−5.06, 19.94)), 2 스탬프 숍, 3 카드 숍, 4 뮤직, 5 데이터 하우스(컬렉션 건물), 6 랭킹, 7 친구 매치, 8 퀘스트 = D 계약 AREA 와 같다. **부호 확인**(사용자 캡처 9.png 문의): `CalcTurnDegY` 는 `atan2f(s0 = d.x, s1 = d.z)`(main @0x71002deb10 → PLT @0x710144a570 = atan2f) [판독], 웹 좌표 = 원본 좌표(x 반전 없음 — MC(x −5.06) 화면 왼쪽·친구 매치 기계(x +5.06) 오른쪽이 원본 캡처 6.png 와 같다). 그래서 기구 계단 앞(z ≥ 18)은 중심선 x = 0 을 경계로 **x < 0 → 1 가이드, x > 0 → 7 친구 매치**(330~360° 쐐기)다. 시작 자리: p1_pc00(x 0) → 0° → 1, p2_pc00·p3_pc00·p4_pc00/01(x < 0) → 1, p2_pc01·p4_pc02/03(x > 0) → 7. 9.png 의 DK 는 중심선 오른쪽(x ≈ +1.8)이라 원본도 '프렌드 매치' 텔롭이다(웹 동작 = 원본).
- `GetPosNodeLocater(i)`/`GetAttachSocket(i)` 점프표(i → `AttachLocater` 뼈): 0 `camera00_pos` · 1 `mc_start_pos` · 2 `mc_plaza_default_pos` · 3 `char_plaza_default_pos` · 4 `char_quest_return_pos` · 5 `balloon_pos` · 6 `shop_npc00_pos` · 7 `shop_npc01_pos` · 8 `attach_shop_music` · 9 `shop_npc02_pos` · 10 `attach_shop_ranking` · 11 `friendmatch_obj00_pos` · 12 `pc_plaza_start_pos_p1_pc00`. `LOCATER_QUEST` 0 = `menu00_ev_quest_start_cut00_npc00_pos`(1 cut01_npc00 · 2 cut02_npc00 · 3 cut00_pc00 · 4 cut00_cloud00).
- 매 프레임(오프라인·호스트): 영역 0 → 결과 **6(기구)**. 그 밖에는 MC(로케이터 2)와 거리 < 3 이면 결과 **5(가이드)** + MC `FragSwing` + MC 가 1번 `head` 뼈를 보고 1번도 MC 를 봄. 아니면 순서대로 퀘스트(LOCATER_QUEST 0) < 3 → **7**, 로케이터 6 < 7 → **8(스탬프)**, 7 < 7 → **9(카드)**, 8 < 7 → **10(뮤직)**, 9 < 7 → **11(데이터 하우스)**, 10 < 7 → **12(랭킹)**, 11(친구 매치) < 3 → 사람 < 4 면 **3**(아니면 안내 없음), 어디에도 없으면 안내 없음. 거리는 3D. 온라인 접속 중이면 기구 외 결과는 0(안내 없음), 기구는 네트워크 플레이어 데이터가 준비됐을 때만 6.
- 안내(`ComUiPopGuide`): 위치 = **1번 위치 + (0, PCHeight×0.8, 0)** 을 뷰포트(−1..1)로 투영 → 레이아웃 (x·960 + 70, y·540). 결과가 있으면 끝난 상태일 때 `SetIcon(1)`·`SetPopRotateZ(−45)`·`In`, 없으면 Idle 일 때 `Out`. 결과가 있을 때 A(트리거 0x1) → `SQ_SE_SYS_DECI` + 진동 + 상태 = 결과. 별도로(오프라인) Y(0x8, 사람 < 4) → 상태 3 친구 매치, X(0x4) → 상태 0xd OverView(광장 보기), 둘 다 `SQ_SE_SYS_DECI_S`(버튼 이름 = online.md 4.9 정정).
- 상태 → 처리(UpdateImpl 람다 vtable 확인): 2 Main · 3 OnlineMenu · 4 FriendInvited · 5 SelectedGuide · 6 SelectedBalloon · 7 Quest · 8 StampShop · 9 CardShop · 10 Music · 11 DataHouse · 12 Ranking · 13 OverView. 나갈 때 `PlayerManager::Stop`·텔롭 Out·`ComUiMainMenuLayout::Finish`.
- NPC 반응(같은 루프): MC 는 매 프레임 `Idle(0.3)`, 영역 1 이면 1번을 봄(`LookAtEntity`), 아니면 `LookAtNone`. 스탬프 직원은 영역 2, 카드 직원은 영역 3, 데이터 하우스 직원은 영역 5 에서 1번을 보고 `New`(새 표시 있으면 co_joy03) 또는 `Bye`(co_bye00), 영역 밖이면 `LookAtNone`+`Idle`. 그다음 텔롭 `SetArea(영역)`·`In` — **영역이 바뀔 때가 아니라 매 프레임**(오프라인·호스트, In 은 표시 중이면 무시). 접속 중이면 텔롭 `Out`(@0x710005b8ac 경로). 그래서 거리·영역에 들어가는 즉시 안내와 텔롭이 함께 뜬다 [판독 @0x710005b9bc~0x710005b9f0].

**② 따라가기 `ComFollowPlayer` [판독 @0x710003fec0 + 어셈블리, PlayerManager::Start @0x7100041060]**

- 대상 = 바로 앞 슬롯(줄 서기). 버퍼 = 5칸 원형(생성자 `FUN_71000445a0(+0x50, 5)`), 대상 위치가 마지막 점과 3D 거리 0.6 을 넘으면 새 점(가장 새 점이 앞, 가득 차면 가장 오래된 점을 덮음).
- 자기–대상 거리 > 2.6: 점을 **새 것부터** 보며 자기 위치 +(0,1,0) 에서 그 점 방향 단위벡터로 **길이 1.3** 광선(필터 4, CastRayAll)을 쏴 막히지 않은 첫 점으로 `ComActorAutoInterpolation::Start(점)`(매 프레임 다시). 점과 자기가 같거나 모두 막히면 Stop. 거리 < 2.0 → Stop.
- `ComActorAutoInterpolation`(main): 기본 속도 **6.0**(@0x710001fed4), 목표까지 수평(중력 축 제거) 단위 방향을 액터 이동 방향으로 주고, 남은 거리 ≤ 속도·dt 면 목표 위치로 맞추고 끝(@0x71000208e8·@0x71000202c0) [판독]. 웹은 B 의 `PlazaMover` 에 깊이 1(달리기 6)·그 방향 레버로 넣는다 [근사: 회전은 ComActor 선회 360/1100 규칙 그대로].
- 광장에 만드는 플레이어는 PlayerType≠1(COM 아님)·IsLocal 인 사람뿐(Setup @0x7100059700). 시작 소켓 `GetAttachSocketPcDefault(GetHumanPlayerCount(), i)` = `pc_plaza_balloon_pos_p<사람 수>_pc<i>`.

**③ NPC 배치 — 11종 [판독: NpcManager::Setup*·SequenceMainMenu::Setup·SequenceBalloon::Setup·MapManager::Create 어셈블리]**

| 묶음 | 엔티티 | NPC(ID → 모델) | 색 | 붙는 곳 | 동작 |
|---|---|---|---|---|---|
| NpcManager | MC | KINOPIO 0x20 → npc022 | 1 | `mc_plaza_default_pos`(회전 0) | `AddFrag`: R손 `menu00_guide_flag00`, idle/talk/swing/walk → `bd_flag_*00`. `Idle(0.3)` |
| NpcManager | Kameck | KAMECK 0x37 → npc051 | — | LOCATER_QUEST 0 + Y 180° | talk co_talk00·bye co_bye01·walk co_walk00·busy co_busy00, Setup 이 **busy** 재생 |
| NpcManager | 스탬프/카드/데이터 직원 | KINOPIO | 5 / 4 / 3 | `shop_npc00/01/02_pos` | `Idle(0.3)` = co_idle00 |
| E (+0xa0, 장식 0x41) | Group00 npc00·01·02·03 | NOKONOKO 0x0B → npc003 | 1 | `pos_npc00_a/b`·`pos_npc07_a/b` | 배드민턴: R손 라켓, `Group00_item00/01_loc`(npc00_obj·npc07_obj 94f 루프, `attach_ground_npc00/07`)의 `shuttle_anim` 뼈에 셔틀. _a = Smash(궤적 프레임 ≥ 90 → park_bmt_swing00), _b = Rob(≥ 46 → park_bmt_swing01), 끝나면 park_bmt_idle00, 궤적 프레임이 다시 문턱 이하가 될 때까지 대기 |
| E | Group01 npc00/01 | HEYHO_STATION 0x09 → npc002st / KURIBO_BANDANA 0x04 → npc001bd | — | `pos_npc01_a/b` | co_talk00 / co_talk01 |
| E | Group02 npc00/01 | KURIBO 0x01 → npc001 | — | `pos_npc02_a/b` | bd_volley00 / bd_volley01, `npc02_obj`(240f, `attach_ground_npc02`)의 `ball_anim` 에 비치볼. **비치볼 자체 애니는 재생하지 않는다**(정정 §6.14 #15: `menu00_ast_beachball00_anm00` 은 menu00.nro·main 어디에도 이름이 없음) |
| E | Group03 npc00/01/02 | HAMMER_BROS 0x2E → npc044 / HEYHO 0x05 → npc002 / NOKONOKO | — / 1 / 1 | `pos_npc03_a/b/c`, 의자 `pos_chiar_b/c` | park_guitar00(L손 기타) / sit_idle01 / sit_idle01 |
| E | Group04 npc00/01 | BOOMERANG_BROS 0x2F → npc044 / NOKONOKO | — / **0** | `pos_npc04_a/b` | co_talk00 / co_talk00, npc01 만 모자(`NPCAttachModelFilePath(0x0B)` → `head_aimcont`, 레코드 오프셋) |
| E | Group05 npc00/01 | NOKONOKO / HEYHO | 1 / 1 | `pos_npc05_a/b`, 돗자리 `attach_ground_npc05` | sit_talk00 / sit_talk00 |
| E | Group06 npc00/01 | KURIBO_BANDANA / GABON_STRAWHAT 0x29 → npc029a | — | `pos_npc06_a/b` | co_talk00 / co_talk00 |
| E | Group07 npc00/01 | KURIBO / HEYHO | — / **2** | `pos_npc08_a/b`, 돗자리 `attach_ground_npc08` | bd_sit_talk00 / sit_talk00 |
| B (+0x70, 장식 0x3F) | Group00a npc00~02 | `Patapata` 0x38 → npc053 | 1 | `attach_air_npc00~02` | bd_bubble00, L손 bubble00·R손 bubble01 |
| C (+0x88, 장식 0x40) | Group01a npc00~02 | PATAPATA 0x38(색 안 바꿈) | — | `air_npc03~05`(1000f 루프 경로, `attach_air_npc03~05`)의 `npc03~05_anim` 뼈 | bd_flower00, R손 basket00 |
| SequenceBalloon | MC(기구) | KINOPIO | 1 | 기구 `pos_takeoff_mc` | ④ |

- 소켓은 모두 `AttachLocaterDecoNpc`(`menu00_loc_deco_npc_attach00`) 뼈. 장식 묶음 B/C/E 는 `ApplyDecoItem` 끝에서 `DecoItemData::IsDisplay(0x3F/0x40/0x41)` 로 켜고 끈다(+0x68/0x69/0x6a).
- 장식 NPC 일반 동작은 `AddAnimation(이름, 이름)` + `Play(이름)`(섞기 없음) — co_talk00 쌍이 같은 프레임에서 함께 시작한다.
- `ChangeColor(c)` = 모델 `container_m` 의 `mdl_utility_parameter0.x = c`(나머지 성분 유지). 색 → 알베도 층 식은 셰이더 그래프 판독(plaza-C-sg, `analysis/mat/plaza_npc_graph.json`).
- `NonPlayerCharacter` 생성자: idle → co_idle00 등록·`PlayAnimation(idle, 0.3)`, 몸 캡슐 반지름 0.5(충돌 층 1). `PlayAnimation(이름, 0.3, 1)` 은 같은 모션이면 다시 시작하지 않는다(09 §6.3, 강제 재시작은 `PlayAnimForce`). 부착 모델(모자·캡)은 코드가 부를 때만(위 Group04 npc01 하나).

**④ 기구 출발 [판독: SelectedBalloonImpl @0x710005ed30, SequenceBalloon::Setup @0x7100046ca0·TakeOffImpl @0x71000470d0·람다 @0x7100047870·CallSceneImpl @0x7100047628]**

1. SelectedBalloon: 메뉴 카메라 멈춤, `PlayerManager::Stop`, 플레이어들이 `balloon_pos` 를 봄, (페이드 아웃 상태면 페이드 인 1 s 후) **페이드 아웃 1.0 s**(`fmov s0, #1.0` @0x710005ee90, 정정) → 장면 순서 3 = SequenceBalloon. 방이 있으면 대신 `NetworkManager::PlaySession`.
2. Setup: 기구 보임, 로컬·원격 플레이어와 NpcManager NPC 지움(장식 NPC 는 그대로), 새 키노피오(색 1)를 기구 `pos_takeoff_mc` 에, **사람 수만큼** `PcTakeOff` 를 `pos_takeoff_<사람 수>p_pc<i>` 에.
3. 람다: (페이드 아웃이면) 페이드 인 1 s → MC `TakeOffIdle`(R손 쌍안경, bnclr_idle00), PC 모두 `TakeOffIdle`(co_look02) → `PlayBalloonTakeOff`(`CollisionMain` 끔, `AttachLocater` 에 `pos_balloon_takeoff` 500f 1회 — `balloon_pos` 가 떠올라 기구·탑승자가 따라감) → 카메라 `balloon_cut00`(260f) 끝까지 → `balloon_cut01` 을 **프레임 260 부터**(출발 애니와 같은 시간축) → MC·1번이 서로를 즉시 봄, 1번 Idle → **0.6667 s** → MC `TakeOffPass`(bnclr_pass00, 0.25 s 뒤 쌍안경 숨김, 끝나면 idle) · 1번 `TakeOffGet`(쌍안경 숨긴 채 mn_bnclr_get00, 0.25 s 뒤 보임, 끝나면 mn_bnclr_idle00) → BGM 멈춤 + `SM_JIN_MENU_TO_MAP` → 카메라 프레임 ≥ 400 → `SQ_SE_MENU00_TRANSITION_WHO`·소리 정리 → **페이드 아웃 0.5 s**.
4. TakeOffImpl 루프: 메뉴 저장값 비트 0(첫 출발 때 켬)이 켜져 있으면 안내 `sys_ctrl_skip`(ComUiGuide00, 위치 12)·**+/−(0x3000) = 건너뛰기**(`SQ_SE_SYS_SKIP`·`SQ_SE_MENU00_TRANSITION_WHO`·페이드 아웃 1 s).
5. CallSceneImpl: 오프라인 → `RequestCallScene`(menu01 모드 선택), 방 있음 → `NetworkManager::PlaySession`.

**⑤ 웹 구현 대응 (C 소유 `web/script/app/scene/world/plaza/`)**

| 파일 | 원본 | 내용 |
|---|---|---|
| `npc.ts` | NpcManager·NonPlayerCharacter·Kinopio/Nokonoko/Heyho/Patapata·MapManager::Create 장식 묶음 | ③ 표 그대로 배치·소품·모션 이름 표(AddAnimation)·같은 모션 무시·`Idle(0.3)`·LookAt·배드민턴 문턱. 모델 = charselect `Preview3D`(모델 키마다 한 개, 칸 = NPC 하나)를 광장 장면으로 옮김. 에셋 = 명세 `web/assets/plaza/world/chara/spec.json` + 공용 `web/assets/chara/`(`tools/analysis/plaza_npc_assets.py`, [chara_assets.md](../engine/chara_assets.md)) |
| `heading.ts` | bex::ComHeading 머리 시선 | 09 §6.8 식(대상 회전·head_weight·head_min/max 자름·모드 4 스프링/선형) |
| `follow.ts` | ComFollowPlayer·ComActorAutoInterpolation·PlayerManager::OnReceive | 사람 2~4P 를 B 의 `PlazaCharaLoader`·`PlazaMover` 로 만들고 ② 규칙으로 레버를 줌. 원격 멤버('net:remote')도 같은 로더로 그림 |
| `interact.ts` | SequenceMainMenu::MainImpl·GetArea | ① 그대로. 사건 'interact:telop'·'interact:pop'·'interact:decide'·'ui:mainLayout'·'player:input'·'player:look' |
| `balloon.ts` | SelectedBalloon·SequenceBalloon | ④ 그대로. 카메라 = fsnb 베이크 json 을 stage 'anim' 슬롯에(07 §6.2 EulerZXY → three 'YXZ', fovy 전체 세로각). 끝나면 `ctx.exit({k:'balloon'})`(방 있으면 `{k:'session'}`) |

→ 정리본: [17_actor.md](../engine/17_actor.md) §8.2

[정정 2026-10-10] [판독] ④의 MenuData bit0 writer는 첫 출발이 아니라 menu01.nro InitialGuidance 완료 @0x710003c4a0→SetSaveFlagOn @0x71000b80f0(OR1)이다. Fade 인자1.0/0.5는 초가 아닌 speed이며 White20/40f, Sleep은 별도 초 단위다. (근거: [plaza_intro.md](plaza_intro.md) §4·§7.1)
→ 광장 첫 진입 정리: [plaza_intro.md](plaza_intro.md) §4·§7.1·§11

### 6.12 A 갈래 결과·실측 (2026-10-08)
- 처음 로드(장식 기본·보드 잠김): MapStructure 항목 33개(모델 32종 — 늘 보임 26 = 비장식 모델 30 − 잠긴 보드 짝 3 − 갈매기 로케이터(장식 0x3e) 1, + 장식 기본 7), glb 13.1 MB + 텍스처 244장 78.5 MB, 정점 156k [측정: test_plaza_world 1절]. 브라우저 짧은 확인(swiftshader)에서 무대 33 모델 로드 1.8 s(로컬). 전체 에셋(장식 111항목 전부 + 하늘·env) = 모델 95·텍스처 색인 365·anim 44, 약 160 MB.
- LUT 축 [데이터]: 256×16 띠의 (x = 조각·16 + r, y = g) 칸이 (r, g, b) 항등에 가깝다(조각 0 의 (15,0) = (255,0,0), 조각 15 의 (0,0) = (0,0,255)).
- 셰이딩 종류(static_opt_shading_type): 광장 재질 0 = 21(구름·모니터), 1 = 243, 2 = 9(덤불 atlas, 램프·sss 슬롯) [데이터]. 0 = 무조명, 2 = SSS 확산 [판독 §6.8].
- 셰이더 그래프 74 정의 적용·GLSL 컴파일 148 변형 + 패치 3종 통과(test_plaza_world 6절). 브라우저 화면 확인은 그래프 적용 전 짧은 확인 1회뿐 — 그래프·하늘·SSS·블렌드가 들어간 화면은 조정자 최종 촬영에서 처음 본다.
- **조정자 촬영 뒤 수정(2026-10-08)**:
  - 카메라 앞 갈색 큰 물체 = MC 키노피오(npc022, `MC < mc_plaza_default_pos`)가 **100배**로 그려진 것(몸 정점 범위 75×122×74 m, 카메라에서 3.9 m) [측정: 헤드리스 정점 투영]. 원인: `menu00_loc_attach00` 의 로케이터 뼈(mc_plaza_default_pos·char_plaza_default_pos·pc_plaza_*)는 배율 100, 기구 `pos_*` 는 50 [데이터]인데, 그 뼈 밑에 자식으로 붙여 배율까지 물려받음. 원본 `MapManager::GetPosFromBone`/`GetRotFromBone` @0x710001b8cc/@0x710001b92c 은 BoneSocket 가상 +0x30 의 (위치, 회전, 배율) 중 위치·회전만 쓴다 [판독] → `world.ts attachToSocket(node, obj)`(배율 상쇄)를 만들어 C 의 NPC·소품·기구 출발 부착에 씀. 02b 아래 덩어리는 같은 키노피오의 일부였음.
  - 카메라 근접 숨김: menu00 `ModelBase::SetDitherTransparencyViewportId` 는 빈 함수, `Get…` 은 1.0 고정이고 호출 0 [판독: menu00.nro.c:22153] → 원본 광장에 카메라 근접 페이드·충돌 처리 없음. 넣지 않음.
  - 반짝이는 기둥 4개 = 분수 물기둥 `menu00_jet_fountain00`(jet_fountain01~05, 재질 jet_fountain00 = state 2 더하기 + jet_fountain01 = **굴절**) [데이터]. 굴절 재질을 불투명으로 그려 잡음 노멀 반사가 번쩍였음. 핸들 밀림 문제는 아님(판독 식은 바른 규칙, 잡음 노멀 BC5_SNORM 은 2x−1 처리 확인). stage3d `patchRefraction`(굴절 opacity·rim 으로 뒤 장면 비침, 반사·발광 가산, 미리 곱한 알파) [근사: 굴절 왜곡 생략]. 쇼핑 컬렉션 유리(refraction_opacity 0.1)도 같은 처리.
  - 원격 멤버(가짜 온라인)가 바닥 밑으로 떨어짐: 가짜 걷기 원(online/fake.ts 중심 (0,−2.4,16), 반지름 3~5)이 기구 계단·난간 블록을 지나 y −2.4 고정 위치가 고체 안이 됨. follow.ts 원격 수신 때 지면에 맞추고, 지면보다 1 m 넘게 내려가면 가장 높은 면으로 올림 [설계: 가짜 데이터 보정 — 실제 원본 원격 위치는 땅 위].
- MapStructure 밖 소품 17종(C 요청)·비행 경로 air_npc03~05(extraLayout, 늘 올림) 추가 → 모델 112·텍스처 색인 396.
- 재질 슬롯: lightmap(gi_diffuse) 없음, global_ao 17(glb occlusionTexture 로 들어감), sss·diffuse_ramp 9, height_map 6 [데이터].

### 6.11 NPC 셰이더 그래프 (plaza-C-sg 판독, 2026-10-08) [판독: SASS]

근거 표 `analysis/mat/plaza_npc_graph.json`(근거 줄 번호·GLSL 식), 디스어셈블 `analysis/mat/plaza_npc/sass/`, 도구 `web/tools/analysis/plaza_npc_graph.py`(split·match·sass·summary). 21프로그램·22재질. 웹 반영 = `web/script/app/scene/world/plaza/npcMaterial.ts` 의 `GRAPH` 표, 텍스처 = `plaza_npc_assets.py` 가 재질 샘플러 텍스처(배열 층 전부·눈 알베도)를 `spec.layers` 에 싣는다.

- **핸들 정정**: sass_dis 의 표준 샘플러 이름(`_a0`·`_n0`…)은 한 칸 밀려 있다(Material[0x0] = `_a0`). `sg_utility_texture2dN`(0x130+0x10N)·`sg_utility_texture2darray0`(0x210)은 맞다. charselect §12.11 주석도 같은 밀림일 수 있다(확인 권장).
- **색 번호 P** = Model[0x280] = container `mdl_utility_parameter0.x`(ChangeColor). 기본값: npc001·001bd·002·003·022·053 = 0, 그 밖 = 1(읽지 않음).
- **TexSrt**: UBO 에 미리 계산된 2×3 행렬(열 우선), VS 는 적용만 → 식은 CPU. 데이터 5건(키노피오 깜빡임 2칸, 노코노코 눈 중심, 가봉 S=2 대칭, 모자 S.y=2 → v′=2v−1, 역무원 모자 ty=1)이 공개 nn::g3d Maya 식과 맞음(회전 항은 R=0 뿐이라 미검증).

| 모델·재질 | 알베도(슬롯 → 텍스처) | 식 |
|---|---|---|
| 키노피오 body_m | darray0 `npc022_body_arr_alb` 6층, uv0 | 층 = P(0..5), P ≥ 6 → 4, P < 0 → 0(6층 표본 후 switch). 1 노랑·3 보라/분홍·4 초록·5 파랑(0 빨강) |
| 키노피오 eye_m / mouth_m | eyelid_alb / mouth_alb, srt0(uv0) | srt1/srt2 를 읽지 않음 → **ComHeading 눈 시선이 원본에서도 안 보임** |
| 노코노코·파타파타 body_m | darray0 `npc003/053_body_arr_alb` 2층(**glb 에 알베도 없음**) | 층 = round(P) 를 [0, 층수−1] 로. 0 초록·1 빨강. 림색 mix(_C0, _C1, P) |
| 노코노코·파타파타 eye_m | darray0 층 0(눈꺼풀·피부) + `npc003/053_eye_alb` | 눈 uv = _C2.x·srt1(uv1) + _C2.z·srt2(uv2), base = mix(mix(흰자 utility_color0, eye.rgb, eye.a), arr0.rgb, arr0.a). 흰자: 노코노코 (1,1,1), 파타파타 (0.807, 0.771, 0.771) |
| 헤이호 body_m | darray0 `npc002_body_arr_alb` 5층 | 층 = round(P). 1 노랑·2 파랑(0 빨강). 림 _C[int P] |
| 헤이호 역무원·노코노코 모자 | `_a0` | P 안 읽음 → 고정색. 모자 srt0 S.y = 2 |
| 쿠리보(반다나 포함) body_m | `npc001_body_alb` + `npc001_eye_alb` | 몸 uv = (u0 + _C1.y·P2.x, 0.5·(v0 + _C1.y·P2.y) + 0.5), 눈 uv = (u1 − _C1.x·P1.x − _C1.z·P0.x, v1 + _C1.x·P1.y + _C1.z·P0.y), base = mix(body, eye, eye.a·(1 − body.a)). Pn = `material_utility_parameterN`(모션 ftsb 값 → 재질 기본값). ComHeading 은 srt 에만 써서 **쿠리보는 시선을 안 따름** |
| 쿠리보 반다나 bandanna_m | `npc001bd_bandanna_alb` | base = a.rgb · mix(1, C[ip], a.a), ip = `material_utility_integer_parameter0.x`(기본 0 → color0 빨강) |
| 해머·부메랑 브로스 body_m | `npc044_body_alb` | base = mix(a.rgb, C[ip], a.a)(대체), ip 기본 2(빨강) |
| 가봉·해머 eye_m | lid = eyelid_alb srt0(uv0), 눈동자 A = eye_alb srt2(uv2)·B = srt1(uv1) | base = mix(mix(C0, mix(B, A, A.a), A.a + B.a), L.rgb, L.a), C0 = 흰자 utility_color0. 샘플러 Clamp |
| 카멕·가봉 몸·밀짚모자·날개 등 | `_a0` | 특이 없음(림·SSS 는 [근사]: 웹 생략) |

- 웹 [근사]: 림(17프로그램, (1−N·V)^3.5·(1−N·L)^3·_C0)·SSS·카멕 _C0.a 반사·노멀 배열은 안 넣는다. 파타파타 캡·해머 integer_parameter 실행 중 변경 여부는 [미확정](캡은 웹에서 안 붙임).
- 눈 시선(ComHeading 눈, 09 §6.8)은 srt1/srt2 를 읽는 노코노코·파타파타·가봉·해머 눈에만 보인다: srt1 = eye0, srt2 = eye1 이동값.

### 6.13 포스트 판독·화면 바램 수정 (plaza-A-post 판독, 2026-10-08) [판독: SASS]
- 근거: `analysis/mat/plaza_post.json`, SASS `analysis/mat/plaza/post_sass/`(posteffect_amalgam0 320변형·bloom 4종, 도구 `web/tools/analysis/bnsh_sass.py` = mps 복사본), main `FUN_71000acf00`(패스 목록)·`FUN_710007741c`(UBO). menu00 = amalgam 변형 55(블룸·FXAA·톤맵 3·LUT 하나).
- 합성: 장면 FXAA → + 블룸 밉0·intensity → x = c·exposure + exposure_offset(더하기) → 톤맵 → 비네트 → g = |t|^0.4545898 → 3D LUT(반 텍셀 보정 없음, R8G8B8A8_SRGB). 화면 = LUT 바이트 [추정: 표시 단계].
- 톤맵 종류: 0 min(x,1), 1 유리식(mps 종류 5 상수), 2 ACES fitted, **3 = x(x(x(3.775909x − 2.699740) + 1.373769) + 0.02414888) / (x(x(x(3.776773x − 2.686816) + 1.188946) + 0.4051593) + 0.1080957)**, 4 PBR Neutral. 종류 3 은 0.5 → 0.500, 1 → 0.886 (중간 톤 거의 항등) — 바램의 원인 아님.
- 블룸: first_down(절반 해상도) c·exposure, w = smoothstep(threshold, threshold + 1, 휘도), y = c·w/spread⁵, 길이 ≤ clip; down 13탭 ×spread; up out = cur + (low − cur)·(7/9 | 2/3), 밉 6. 고른 밝은 면 실효 +0.80·c·w. **웹의 옛 UnrealBloom 대체가 2~5배 셌다 = 하얗게 바랜 주원인** [재구현 계산 + 측정].
- 수정: stage3d `post.ts` 를 판독식 그대로 다시 씀(블룸 체인·합성 셰이더·톤맵 0~4·감마 0.4545898·LUT 3D 흉내). FXAA 만 마지막(LDR)에 [근사].
- 측정(헤드리스 같은 프레임, 화면 sRGB): 고치기 전 → 고친 뒤 / 원본 식(웹 장면 HDR 값 + 웹 블룸 값으로 계산): 계단 (179,183,181) → (151,156,176) / (155,163,183), 잔디 (165,231,171) → (94,162,42) / (96,164,43), 하늘 (186,218,232) → (153,173,196) / (155,175,198), 바닥 (241,224,198) → (239,212,182) / (236,213,186), 깃발 빨강 (245,194,195) → (218,95,95) / (219,105,106). 웹 = 원본 식 ±10 이내(애니 프레임 차) [측정].
- 그 밖 점검: 빛 ×π·확산 IBL 은 three Lambert(1/π)와 상쇄되어 원본 "알베도·광색·N·L, irr·알베도"와 같다(mps 판독과 같은 관례). 안개(200~800·0.8)는 끄고 켜도 가까운 화면 값이 같고 먼 섬·하늘만 달라 바램 원인이 아님. 출력 sRGB 이중 없음(LUT 바이트를 그대로 화면에). 분수 발광 0.77 은 블룸 수정 뒤 국소적으로만 밝다.

### 6.14 원본 캡처 대조 (사용자 캡처 6·7·8.png, 2026-10-08)
비교 그림 `web/test/out/plaza/compare_{stairs,overview,lobby}.png`(`tools/analysis/plaza_compare.py <캡처 폴더>`). 차이 → 원인 → 수정:

| # | 차이 | 원인 | 수정 |
|---|---|---|---|
| 1 | 하늘이 회색으로 뿌옇다(웹 (125,125,133), 원본 (59,180,231)) | **하늘이 아예 안 그려지고 지움색 0.25 가 보였다**: 하늘 glb 상자가 뼈 이동 (0,−9,0) 을 가진 채 400000 배로 커져 카메라 밖으로 감 [측정: 구름 끄고 같은 값] | 하늘을 카메라 중심 상자(판독식 셰이더, 시선 방향 → uv)로 직접 만듦. 고친 뒤 하늘 점 (89,191,242)·(71,180,238) ↔ 원본 (68,175,231)·(43,163,229) |
| 2 | 구름·먼 섬이 뿌연 회청색 | 재질 `static_opt_fog`(광장 287 재질 중 39개만 1) 를 무시하고 전부 안개를 먹임 → 더하기 구름 띠(state 2)에 안개색이 더해짐 [데이터] | three `material.fog = (static_opt_fog == 1)` |
| 3 | 구름 선·얇은 구름이 너무 진함 | `static_opt_mul_vertex_base_color` 1 인데 정점색(_c0, 알파 0.6~0.7·회색 0.23~0.56)을 안 곱함 [데이터] | stage3d `patchVertexColor`(그래프 아닌 재질). 그래프 재질은 식 안에서 c0 를 이미 씀 |
| 4 | 바다가 밝은 청록(원본 진한 파랑), 분수 물이 짙은 남색 | 물 합성(water_enable: 수면 × water_opacity 0.1~0.2 + 물속·탁함 muddy) 미구현 — 수면 그래프 색(프레넬 C0 = (0.88, 7.2, 10) HDR)만 불투명으로 보임 [데이터] | stage3d `patchWater`: out = op·수면 + (1−op)·k·muddy, 뒤 장면 (1−op)(1−k) 비침. k = muddy_range ≥ 10 이면 1(바다), 아니면 1/range(분수·무대 물) [근사: 물 깊이 대신 상수] |
| 5 | 분수 물기둥이 하얗게 반짝이는 잡음 기둥 | ① 굴절 재질에서 반사를 α 밖에 더해 가운데까지 번쩍임 ② 더하기 물(jet_fountain00, state 2 + water_enable)을 불투명도 1 로 더함 | ① (확산 + 반사)·α + 발광(판독 순서 "굴절 합성 → 그 위 발광") ② 더하기 물은 α = water_opacity(0.15) [추정]. 영역 평균 웹 (163,191,198) ↔ 원본 (142,211,216) — 굴절 왜곡(장면 uv 0.03) 없음이 남은 차이 [근사] |
| 6 | 전체 색이 탁함 | 블룸(§6.13)·하늘·안개 위 1~3 이 겹친 것 | 위 수정 뒤 영역 평균: 바닥 웹 (211,208,183) ↔ 원본 (226,220,196), 계단 (148,145,152) ↔ (157,161,168), 잔디 (102,184,49) ↔ (116,182,55) — 카메라 위치·시각 차 범위 [측정] |
| 7 | 그림자 흐림 | 그림자맵 2048 하나가 카메라 100 m 를 덮음 | 원본 캐스케이드 3·lambda 0.5 의 둘째 경계(38.4 m)까지만 맵 4096 하나로 [근사: 캐스케이드 대신]. 마리오 발밑 그림자 확인 |
| 8 | 전경 높은 시점(7.png) 없음 | 광장 보기(OverView) 미구현: C 의 결과 13 은 다음 프레임 돌아옴 | `app/scene/world/plaza/overview.ts`: `OverViewImpl` @0x710005f930 [판독] = CameraManager::PlayAnim(0x10)·SetSpeed(0) → 카메라 표 16 `deco_00` = `menu00_deco_all_cam.fsnb` 프레임 0 [데이터: menu00.nro 이름 표 0x1c7a58·경로 표 0x19b2e4], 조작 플레이어 B·X(bex 0x2·0x4) 트리거까지 대기 → SQ_SE_SYS_CANCEL → 해제. 7.png 와 구도 같음(바다·섬·나무·분수) |
| 9 | 7.png 키노피오 메시지 창(얼굴 아이콘형) | 7.png 는 첫 진입 안내(`SequenceFront`·guidance 카메라 `menu00_ev_intro_scroll_cam`)의 장면 — §8 에서 범위 밖으로 정한 첫 진입 연출 | 범위 밖 그대로(§8). 카메라·메시지 형식은 이후 첫 진입 연출 구현 때 |
| 10 | 8.png 대기실 4/4 | 웹도 4/4 에서 "방 정보 / 해산하기"(초대하기 없음) [측정]. 마지막 입장 직후 잠깐 "참가자를 기다리는 중…" 이 보이는 것은 가짜 멤버 준비 지연(D). 원격 멤버가 광장에 서 있는 모습은 가짜 걷기 원(online/fake.ts, D) | D 에 SHARED 로 알림 |
| 11 | 시간이 빨리 감(사용자 실기) | plaza_page 루프가 밀린 시간을 버리지 않아(한 번에 4 스텝 상한 뒤 남은 밀림 누적) 셰이더 컴파일 등 긴 멈춤 뒤 몇 초 동안 4배속으로 따라잡음 [코드 분석] | `scene.ts FixedClock`: 1/60 고정 스텝, 한 번 최대 4 스텝·넘친 밀림 버림(main.ts MAX_BACKLOG 규칙). 시험: 30·60·75·120·144·240 Hz 10 초 = 600 프레임, 3 초 멈춤 뒤 1 초 = 60 프레임 |
| 13 | **계단을 못 올라감**(사용자) — z 13.38 에서 y −2.38 로 떨어져 갇힘 | `MeshCollider.groundHeight` 가 아래를 향한 면(계단 밑판 ny −1, y −2.38)도 지면으로 셌고(|ny| 판정), 챌판 사이 점에서 그 밑판으로 떨어진 뒤 다음 챌판이 벽이 됨. 반지름 0.9 몸은 다음 단 챌판 윗모서리(발 위 0.61)에도 걸림 [측정: 조정자 stairs_sim·삼각 597·598·601·607] | 지면 = 위를 향한 면(ny > 0.05)만, 가파른 위향 면도 STEP 안이면 디딤. 벽 판정에 PhysX autostep 처럼 발 + STEP 에서 시작하는 반구 아랫면 적용 [근사]. 회귀 시험 test_plaza_move 6절: 시작 → 기구 앞(z < 9, y ≥ 0) x 0·±1 통과(벽 밀기 결과는 전과 같음) |
| 14 | 물기둥이 구겨진 은박지 같음(9.png) | ① 그래프 재질에는 srt0 을 표준 텍스처(_n0 물 노멀)에 안 걸어 노멀 무늬가 2배 촘촘하고 멈춰 있었음(원본 srt0 배율 0.5·fmab 스크롤 300f) ② 굴절 재질 반사·림 알파가 잡음 노멀로 반짝임 | ① srt0 을 그래프 재질 표준 텍스처에도 적용 [판독 sg1 "노멀 = 표준 _n0(srt0 스크롤)"] ② (확산 + 반사)·α + 발광 유지. 굵기는 원본과 같음(화면 폭 10~11 %, 6.png·9.png 대조), 바깥 큰 원기둥 + 안쪽 물줄기 두 겹도 원본과 같음. 남은 차이: 원본은 뒤 장면을 굴절(uv 0.03)해 비치고 세로 결이 보임 — 웹은 굴절 왜곡 없이 비침 + 반사 잡음 [근사] |
| 14b | 물기둥 2차 수정(원본 6.png 대조) | ① 굴절을 장면 캡처 없이 배경 그대로 비치게 했었음 ② 국소 반사 큐브 `fountain_hdr_test_rad` 가 매우 밝음(평균 휘도 3.4, 해 748)인데 원본 `specular_ibl_normalization_enable` 1 을 무시 → 잡음 노멀마다 해 반사가 흰 점으로 번쩍임 [데이터: HDR 측정] ③ 반사에 굴절 불투명도 a 를 곱했었음 | ① three 투과 패스(불투명 장면 → transmissionSamplerMap, 원본 색 버퍼 캡처 자리)로 굴절 재질을 물리 재질로 바꾸고 transmission_fragment 를 원본 식으로: 장면(화면 uv + clamp(refract(V,N,1/ior).xy × 0.03, ±0.03)) × (1−a) + 확산 × a [판독: p386 330~584] ② 국소 큐브 평균 휘도를 공통 큐브(menu00_plaza_rad)에 맞추는 배율 specNorm(분수 0.153, 바다 0.222, 금 0.94·0.82)을 envMapIntensity 로 [근사: 정규화 식 미판독] ③ 반사는 a 를 곱하지 않음(SASS 끝부분: r16·r7 은 확산만) [판독]. 물기둥 영역 평균·표준편차: 웹 (142,183,182)/(64,48,58) ↔ 원본 (139,193,191)/(59,43,64) [측정]. 남은 차이: 잡음 무늬가 원본은 세로 결, 웹은 둥근 칸 — 노멀 잡음 좌표(uv1 회전·타일)·GSAA(원본 반사 LOD = max(분산^0.6, …) 추정) 미판독 [근사] |
| 14c | 물기둥 3차 수정(사용자 4회째 지적, 13.png: 기둥 전체가 우윳빛 반투명 흰색·잔 점 잡음, 세로 결 없음, 뒤가 안 비침 ↔ 원본 6.png 거의 투명·세로로 흐르는 물결·윗부분만 흰 물보라, 7.png 원경 = 아랫부분은 가는 흰 물줄기만 보이고 굵은 기둥은 거의 안 보임) | **원인 셋**(실 GPU RTX 4060 d3d11 창 띄움, 계단 앞 시점 = 6.png 구도, 가까운 기둥 둘 영역 46k 화소, 항목별 끄기·켜기. 수치 = 평균 RGB / 휘도 표준편차 / 채도 / 배경 차이(분수 끈 화면과 휘도 차 평균, 작을수록 투명) / 배경 상관(클수록 뒤가 비침) / 세로 결 지표(가로 기울기 ÷ 세로 기울기, 1 보다 크면 세로 결) [측정]) ① **자기 뒷면이 굴절 장면에 한 겹 더 들어감**: 물기둥 재질은 양면(two_side 1)인데 three 투과 패스가 DoubleSide 투과 재질의 뒷면을 투과 버퍼에 먼저 그린다(three 0.180 `renderTransmissionPass`). 원본은 색 버퍼를 캡처한 뒤 그 캡처를 읽으며 굴절 재질을 그리므로(캡처 버퍼 = 읽는 텍스처, 같은 그리기의 뒷면은 들어갈 수 없음) 밖에서 보면 앞면 한 겹만 보인다 [판독: p386 장면 표본 = capture_color_buffer + 설계]. 웹은 뒷면의 (확산·림 흰빛 × a + 잡음 왜곡)이 두 번 겹쳐 우윳빛·잔 점이 됨. 앞면만으로 바꾸면 배경 차이 30.3 → 25.1, 배경 상관 0.40 → 0.53(아래쪽 0.60 → 0.71), 채도 0.34 → 0.42, 원경(광장 보기) 배경 차이 27.2 → 22.7·상관 0.58 → 0.65 — 단일 원인 중 가장 큼 ② **안쪽 가는 물줄기(jet_fountain00, 반지름 0.12 m, 굵은 기둥 반지름 0.6~1.1 m 안)가 아예 안 보임**: (a) 웹이 더하기 물에 water_opacity 0.15 를 곱했음(#5 ② [추정]) — p418 SASS 는 물 파라미터를 하나도 읽지 않고 출력 α = Model[0x20c](모델 불투명도) [판독: p418 fs 410~438] → #5 ② 철회, α = 1 (b) 투명 목록(굴절 기둥 뒤)에서 그려져 기둥 깊이에 가려짐 — noAdd 를 꺼도 화면이 화소 하나 안 바뀜(차이 0) [측정]. 원본 6.png·7.png 는 기둥 안 흰 물줄기가 보인다. 두 재질만 capture_color_buffer_type 2 로 묶여 있고(광장 287 재질 중 0 아닌 것은 넷: 굴절 = 컬렉션 유리 1·물기둥 2, 더하기 = 음악 상점 유리 1·물줄기 2) 더하기 쪽은 캡처를 읽지 않으므로, 이 옵션은 "그 캡처 전에 그린다"는 순서 표시로 본다 [추정: 옵션 이름·짝 구조·6/7.png] ③ **흐름 애니가 멈춰 있었음(세로 결 없음의 원인)**: fmab 커브가 원본에서 pre/post wrap = Repeat 인데 변환기(`graphics_bfres2gltf/Curves.cs`)가 끝 프레임 뒤를 끝 값으로 고정 [데이터: 커브 덤프 — srt0 이동 y(0x14) 0~30f 0 → −1, sg P1.w·P2.w(0x0C) 0~60f 0 → −1, srt0 이동 x(0x10) 0~300f 0 → 1, 모두 Repeat]. 그래서 세로 흐름(srt0 y = 30f 마다 노멀 한 장 = 초당 2장, 잡음 P1.w = 60f 마다 한 장)이 첫 0.5~1 초 뒤 멈추고 300f 가로 흐름만 남았다 — 수정 전 연속 8 프레임의 기둥 무늬 이동 = (0, 0) px/프레임 [측정]. 같은 결함이 광장 fmab 6개(중앙 분수 물 15·무대 물 8·물기둥 6·바다 1·바다 op 1·광장 본체 1 커브)·물기둥 fskb 4 커브(기둥 2~5 의 키가 −50~264 로 엇갈려 끝 뒤 0.8 % 높이 흔들림이 멈춤)에 있다 [데이터]. 그 밖 기여(끄기 실험, 근경 배경 차이/상관): 굴절 불투명도 a(림 0.5·(1−N·V)) → 0 이면 26.5/0.51, 반사 끄기 27.3/0.42, 발광 끄기 28.7/0.45(윗부분만), 블룸 끄기 27.9/0.41, 잡음 노멀 끄기 30.3/0.40(영향 없음), 표준 노멀(_n0) 끄기 23.9/0.53 — a·반사·발광·_n0 는 원본 식 그대로라 [판독 p386 140~200·440~584: 림 a 는 잡음 섞은 최종 N, 기본색 프레넬은 _n0 만 쓴 N1, 확산 × a, 반사는 a 밖, 발광 c0.r·C0 는 맨 끝 가산] 고치지 않음. 원본 메시도 확인: uv1 = uv0(원본 속성 `_g3d_02_u0_u0` 가 같은 uv 두 벌) [데이터], 노멀 텍스처는 512² 물결(u·v 기울기 0.062/0.079 — 가로 물결), 잡음은 둥근 방울(256²) — 정지 화면의 무늬 자체에는 세로 결이 없고, 원본의 세로 결은 초당 2장 세로 흐름에서 온다. ④ **굴절 오프셋 식이 #14b 판독과 달랐음(망치 자국처럼 기둥 전체가 일그러진 원인)**: p386 332~372 를 다시 읽으면 오프셋 = refract(I = (0, 0, −1) 고정 시선, N_view, η = material_refraction_ior 1.333 그대로).xy — k = 1 − η²(1 − N_z²) < 0(전반사, N_z < 0.66 = 시선과 48° 넘게 기운 노멀)이면 오프셋 0, 화면 y 는 아래 방향 uv 라 −N_y 부호, x 에만 Layer[0x4a4] 배율 [판독]. 웹은 실제 시선·η = 1/ior 이라 전반사가 없어 기둥 가장자리까지 노멀 무늬대로 크게 일그러졌다(원본 6.png 아랫부분은 뒤 무대 벽이 거의 그대로 보임) | ① `patchRefraction`: DoubleSide 굴절 재질은 FrontSide 로(투과 버퍼에 자기 뒷면이 안 들어감) [판독+설계] ② `MaterialSetup.blend`: 더하기에 water_opacity 를 곱하던 것 삭제 [판독], capture_color_buffer_type ≠ 0 인 비굴절 재질(물줄기·음악 상점 유리)은 불투명 목록 맨 끝(renderOrder `CAPTURE_ORDER`, 혼합은 그대로, 깊이 쓰기 없음)에서 그려 투과 버퍼(원본 캡처 자리)에 들어가게 [추정] ④ `patchRefraction` 오프셋 = clamp(refract((0,0,−1), normal, ior).xy × scale, ±limit) — GLSL refract 가 전반사면 0 을 돌려 원본 분기와 같음, WebGL uv 는 위 방향이라 y 부호 그대로 [판독], Layer[0x4a4](x 배율)는 값 미확보라 1 [근사] ③ `Curves.cs Eval`: pre/post wrap Repeat·Mirror 를 원본 규칙대로(구간 [start, end] 밖 프레임을 접음), 물기둥 fmab JSON 을 다시 만듦(`graphics_bfres2gltf anim`). 나머지 fmab 5개·물기둥 fskb(glb)도 다시 만듦(§8, 조정자 지시 — 원본 Repeat 쪽)**전후 측정**(실 GPU, 계단 앞, 같은 영역, 전 = 원인 실험 기준 화면 / 후 = ①~④): 평균 (161,201,201) → (153,201,199), 휘도 표준편차 28.0 → 31.2, 채도 0.34 → 0.40, 배경 차이 30.3 → 26.2, 배경 상관 0.40 → 0.56(윗부분 0.04 → 0.31, 아랫부분 0.60 → 0.69), 세로 결 지표 1.04 → 1.09, 4 프레임(1/15 s) 평균 1.02 → 1.12, 기둥 무늬 이동 (0, 0) → (0~1, 5) px/프레임(세로로 흐름). 원본 6.png 같은 자리 직사각형: 윗부분 (155,222,238)·채도 0.36·세로 결 1.15, 아랫부분 채도 0.29·세로 결 1.39 [측정]. 원경(광장 보기)은 굵은 기둥이 덜 뿌옇고 기둥 안 흰 물줄기가 보인다. 그림 `test/out/plaza/jet14c_{near,far}_compare.png`(원본·전·후), `jet14c_stairs_{before,after}.png`, `jet14c_far_{before,after}.png`, 원인 실험 `jet14c_cause_variants.png`. **남은 차이**: 원본은 굵은 기둥의 아랫부분(정점색 g ≥ 1 구간)이 거의 안 보이고 윗부분만 흰 물보라가 보이는데, 판독식으로는 잡음이 평평한 곳에서 N = N1(_n0 만 쓴 노멀)이 되어 위·아래가 같다 — 웹은 아랫부분도 _n0 무늬로 흰 림·일그러짐이 남는다. 원인 후보(미판독): 원본 Layer[0x4a4]·캡처 LOD(Layer[0x4d0]), 패스 상태(스텐실 mask_stencil_value_flag 1) [미확정] |
| 15 | 새·그림자가 아주 빠름(사용자, 3회 지적: "하늘에 날아다니는 물체가 너무 빠름, 그림자가 휙휙") | **정정**: 이전 판단(#11 밀림 따라잡기)은 원인이 아니었다. 실측(실 GPU 창 띄움, 아래)으로 시계·클립은 정상이고, 빠른 물체는 **비치볼**이었다. `npc.ts DECO_PROPS` 가 Group02_item(비치볼)에 glb 에 묶여 온 `menu00_ast_beachball00_anm00`(240f) 을 틀었는데, 이 클립은 보드(bd01) 장면용으로 `beach_ball` 뼈 이동이 월드 좌표 (−60.1, 4.3, 21.9)다 [데이터: glb·fskb]. 그래서 공이 `ball_anim` 에서 64 m 떨어진 채 `ball_anim` 회전(배구 공 회전)을 따라 반지름 64 m 로 돌아 광장 하늘(x −29~12, y −27~50, z −7~74)을 평균 120 m/s(최대 210 m/s)로 가로지르고, 그림자가 바닥을 휙휙 지났다 [측정]. 원본은 이 클립을 틀지 않는다: MapManager::Create 의 Group02_item 블록은 fmdb·`ball_anim` 부착뿐이고(같은 블록의 npc02_obj 는 애니 이름 `npc02_obj` 를 넘김), menu00.nro·main 에 `menu00_ast_beachball00_anm00`·`_anm0` 문자열이 없다(menu00 아카이브 안 fskb 자기 자신만) [판독: plaza_menu00_c_dis.c 0x710000c6c8~0x710000c918 + 데이터]. 클립 시계도 원본과 같은 단위임을 확인: 원본 애니메이션 모듈 갱신 `FUN_710080cd70` 이 슬롯마다 진행량 = `g_FrameStep.delta × 60` × 슬롯 속도(+0x50)로 넘긴다(`FUN_710081cf30` → `FUN_71008144bc`) — **실시간 1 초 = 클립 60 프레임**, 실제 fps 와 무관 [판독: 즉석 디컴파일]. MapStructure 에는 속도 칸이 없고 하늘 NPC·갈매기·장식 모델에 SetSpeed 호출도 없다 [데이터+판독] → glb 클립 길이 = 원본 프레임/60 은 맞다. | `DECO_PROPS` Group02_item 의 `clip` 을 뺌(공은 `ball_anim` 에 붙어 배구 궤적만 따라감). 측정(무대 프레임 기준, `deco=all`, 606 스텝): 고치기 전 공 메시 114~120 m/s → 고친 뒤 공 = `ball_anim` 8.8 m/s. 그 밖 갈매기 4.7·5.6·5.6 m/s, air_gull 경로 4.7~5.6 m/s, 하늘 파타파타(C) 1.39 m/s, B 파타파타 홀더 0(몸 뼈 1.2~1.6), 셔틀 10.9 m/s(npc00/07_obj 94f 배드민턴 궤적), 카멕 빗자루 뼈 105 m/s 는 배율 0(숨은 뼈, 안 보임). 한 스텝에 같은 클립·믹서가 두 번 진행된 일 0, `stage.frame` 증가 = 1/스텝, 모든 NPC Preview3D 믹서 dt = 1/60/스텝 [측정]. 실시간: RTX 4060 창 띄움(d3d11) 10 s 에 무대 603 프레임(60.2/s, rAF 651), 5 s 302 프레임(rAF 44/s 에서도 60/s), 고친 뒤 10 s 602 프레임(60.1/s) [측정]. 고친 뒤 공 범위 x 31~35·y −0.7~3.2·z 51~55(배구 코트 위) [측정]. 시험: test_plaza_actors(소품 애니 = 원본이 이름을 넘기는 것만, 비치볼 클립 없음, anm00 = 월드 좌표)·test_plaza_world 7(클립 진행 = 스텝당 1 프레임) |
| 16 | 이동하다 새 물체가 보일 때 렉(사용자) | 처음 보이는 재질의 셰이더 컴파일·텍스처 업로드 | `Stage3D.warmup()`: 숨은·화면 밖 메시까지 잠깐 보이게 해 `compileAsync`(장면 전체) → 재질 텍스처 `initTexture` → 한 번 그리기(그림자·후처리 포함) → 되돌림. 실 GPU 카메라 한 바퀴 8 초: 전 50 ms 넘는 프레임 5개·최대 1944 ms → 후 0개·최대 35 ms. 대신 로드가 약 10 s 늘어남(프로그램 196·텍스처 469) [측정]. 헤드리스 swiftshader 는 이 비교에 쓰지 않음 |
| 12 | 장식 배치 | 7.png ↔ c2_overview: 기본 장식(분수·나무·가랜드·풍선·타일·조각상) 위치·종류 같음 [측정: 화면 대조]. 배율 상속 문제는 §6.12 에서 소켓 부착만 해당(장식 hook 노드는 배율 1) | 변경 없음 |

## 7. 미확정

속도·빈 지면 보정 함수·카메라 섞기·앞 슬롯 따라가기·영역/결과·NPC 배치·UI 부품 이름은 기존 판독으로 확정(§3.5·§5.1·§6.10). 음악 상점 박자·광장 보기 안내·원격 이동 연결도 각 기존 절에 반영했다. 공통 엔진 미확정은 다시 분석하지 않았다.

| 항목 | 필요한 근거 |
|---|---|
| 레버 카메라 변환·`Util::InterpolateRot` | main @0x710001e8b8의 ComActorPad +0xc0 객체 생성/vtable +0x30, @0x71000367f0의 각속도 적용식. 웹 수평 앞·오른쪽 변환은 §3.5의 [추정] 유지 |
| 추종식의 Camera +0xa0 의미 | §3.5 명령에서 읽는 x/z 성분은 확정. 공통 Camera 월드 행렬 설정 함수에서 +0xa0가 z축인지 확인해야 “지난 프레임 카메라 앞” 해석을 [판독]으로 올릴 수 있음 |
| 플레이어 기본 충돌 형상·계단 | `ComMatter` MatterType 2 설정(main `FUN_71002b2e00`)의 HitShape 생성→`SetSourceCapsule/Sphere` 인자·층과 `DefaultAdjustCharacterVsMap` 연결. `bubble_radius`가 그 반지름인지, CCT가 실제 쓰이는지부터 필요; 웹 STEP=0.5를 원본 stepOffset으로 취급하지 않음 |
| 새 저장의 장식·보드 배경 초기값 | main `DecoItemData` @0x710023aaa0 계열의 새 저장 초기화 호출자/초기 저장 바이트. `IsDefault` 마스크와 `ApplyBgBd`는 확정이지만 display 6개·UnlockBd=0 초기화는 §6.6 [추정] |
| 그래프 UBO·기본 텍스처 | §6.8의 Layer[0x120/0x130]·World[0x4/0xe0/0xf0]에 쓰는 CPU 바인딩, 미할당 sampler의 실제 대체 텍스처가 필요. env 값만으로 의미를 확정하지 않음 |
| 공용 포스트·반사 정규화 | §6.13 first_down sampler 6의 바인딩(main `FUN_71000acf00` 패스·`FUN_710007741c` UBO), `specular_ibl_normalization_enable`의 반사 UBO 생성식이 필요. 기존 셰이더 식 재판독은 하지 않음 |
| 스탬프·파티 줄 | §5.1의 정렬 `FUN_7100084460` 비교 키, 목록 입력 `FUN_710035c9b4`의 B 분기, 결정 콜백 +0x3f0 대상, `SQ_SE_STAMP_PC` 로컬 변수 2 소비처가 필요. 글리프/레이아웃 존재만으로 입력 처리까지 확정하지 않음 |
| NPC 자동 부착·재질 번호 변경 | NPC용 `ComMatter` 자동 부착 조건과 해당 액터의 `material_utility_integer_parameter0` 쓰기 경로. 광장 코드의 명시적 부착은 §6.10 ③ 확정; 자동 부착 없음은 아직 [추정] |
| 물기둥 패스·파라미터 | §6.14 #14c의 Layer[0x4a4/0x4d0] 공급값·capture 패스 순서·스텐실 상태. **사용자 결정으로 물기둥 아랫부분 추가 판독·근사는 중단**; 현재 식을 유지 |

→ 정리본: [17_actor.md](../engine/17_actor.md) §11.3

## 8. 사용자 확인 필요 (진행은 원본 쪽으로 이미 정함 — 갈래들이 여기에 덧붙인다)

| 항목 | 정한 것 | 이유·근거 |
|---|---|---|
| 스탬프(채팅 말풍선) 구현 여부 | 하단 파티 줄 `x_null_stamp`에 구현, 실제 방의 원격 스탬프와 FakeOnline 시험값 지원 | 원본 하단 UI 규칙 §5.1 ② [판독]. 실제 방 서버는 §5.2·online.md 9.5~9.6 |
| 장식 세트 | **111항목 전부 원본 규칙(ApplyDecoItem·DecoItemData·ApplyBgBd)으로 구현**, 처음 값 = 기본 6개(`_Dft`, 풍선 2개 포함 모델 7) display·보드 배경 모두 잠김. `?deco=all` 등 시험값 | §6.6 [판독]. 새 저장 초기화 함수는 못 찾아 처음 값만 [추정] (조정자 지시로 "기본 세트만" 결정을 고침) |
| 퀘스트·상점·데이터하우스·음악·랭킹 선택 | 다가가기 안내·텔롭까지만 하고, 들어가는 화면은 없음(A 는 무시) | 사용자가 정한 범위 밖(이벤트·NPC 대화) |
| 첫 진입 연출(`SequenceFront`·`CollisionFirst`·intro 카메라) | 건너뛰고 `pc_plaza_balloon_pos_p<사람 수>_pc00`에서 바로 조작(§3.5) | 범위 밖 이벤트. 막(`CollisionFirst`)도 쓰지 않음 |
| 진입 경로 | `dev/index.html?plaza=1`(배포 `/` 도 같은 흐름) → 광장 → 기구 → 모드 메뉴 → 미니게임 항구 프리 플레이 목록 → 게임 | 원본 흐름(기구 → menu01 모드 선택). menu01 3D 섬 월드는 기존 modeselect 2D 화면(임시 배경)으로 대신 [근사] |
| VFX(분수·장식 FX) | 후순위(0x43 분수 별 FX 포함) | 막힘 아님, 용량·시간 |
| 셰이더 그래프 재질 | **판독해서 식대로 구현**(§6.8), 못 끝낸 것만 [근사] 목록 | 조정자 지시(원본 일치 우선) |
| (A) 텍스처 축소 | 최대 변 1024(2048 한 장만 해당), KTX2 안 씀 | §6.7 [근사], 도구 없음 |
| (A) 톤맵 종류 3·블룸·LUT | **판독식 그대로**(§6.13). FXAA 순서만 마지막 [근사], first_down 의 둘째 표본(샘플러 6) 정체 [미확정] | posteffect_amalgam0·bloom SASS [판독] (이전 Neutral·UnrealBloom 근사 철회) |
| (A) 그래프 바람·야자 값 | Layer[0x120..] = env_utility_parameter1, Layer[0x130..] = env_utility_parameter2, 잡음 = windnoise00, 시간 = 장면 ms | 장면 UBO 필드 이름이 없어 배치 순서로 [추정] (§6.8). 다르면 나무·풀 흔들림 크기·방향만 달라짐 |
| (A) 분수 물 노멀(BC5 z=0) | 판독 그대로(z 재구성이 0 이 되어 노멀이 접평면에 눕는 식) | 원본 식 그대로가 원칙. 화면이 이상하면 z=1 로 바꾸는 선택지 — 원본 화면 대조 필요 [판독] |
| (A) 기구 주름 마스크 World[0xf0] | windnoise00 로 대신 | 전역 텍스처 정체 미확정 [근사] |
| (A) 소켓 부착 배율 | 위치·회전만 따르고 로케이터 뼈 배율(100·50)은 상쇄 | GetPosFromBone/GetRotFromBone [판독] |
| (A) 굴절 재질(분수 물기둥 jet_fountain01·컬렉션 유리) | 판독식(§6.14 #14b·#14c ④): 장면(화면 uv + clamp(refract((0,0,−1), N_view, ior).xy × 0.03, ±0.03), 전반사면 0) × (1−a) + 확산 × a + 반사 + 발광. 양면 굴절 재질은 앞면만 그림(#14c ①) | 원본은 캡처 뒤 그리므로 자기 뒷면이 굴절 장면에 없다 [판독+설계]. 원본 LOD(Layer[0x4d0])·x 오프셋 배율 Layer[0x4a4]·GSAA·국소 반사 정규화는 값 미확보 [근사] |
| (A) 캡처 순서(capture_color_buffer_type ≠ 0 인 비굴절 재질: 물기둥 안 물줄기·음악 상점 유리) | 불투명 목록 끝에서 그려 투과 버퍼(캡처)에 들어가게 — 굴절 기둥을 통해 물줄기가 보인다 | 원본 패스 순서 미판독 [추정: 옵션 이름·짝 구조·6/7.png 에서 물줄기가 기둥 안에 보임]. 다르면 물줄기가 기둥에 가려 안 보이게 됨 |
| (A) 물기둥 아랫부분 | 판독식 그대로(위·아래 같은 식, 정점색 g 로 잡음만 섞음) — 원본 6/7.png 처럼 아랫부분이 거의 안 보이게 하는 근사는 넣지 않음 | 원본 화면과 다름(#14c 남은 차이). 식 밖 원인(스텐실·캡처 LOD 등) 미확정. **사용자 결정(2026-10-08): 현재 상태로 확정, 추가 근사·판독 안 함** |
| ~~(A) fmab·fskb 커브 반복(Repeat)~~ → 해결 | 변환기 `Curves.cs` 를 원본 wrap 규칙(Repeat·Mirror)으로 고치고 광장 결함 파일을 모두 다시 만듦: fmab 6개(물기둥·중앙 분수 물·무대 물·바다·바다 op·광장 본체, Repeat 커브 32개)와 물기둥 glb(fskb — glb JSON·메타는 같고 애니 접근자 304 바이트만 바뀜). `extracted/converted/graphics/menu00` 사본·`assets-dist`(build_assets 증분) 갱신 | 상태 시험 test_plaza_world 10절: 원본 커브 덤프의 Repeat 32개가 구간 끝 뒤에도 주기대로 반복, 바다·중앙 분수가 한 주기 뒤에도 값이 변함 [측정: 다시 만들기 전 끝값 고정 트랙 중앙 분수 16/18·무대 물 8/13·바다 1/2]. 광장 밖 같은 결함(사용자 결정 2026-10-08 — 전부 다시 만듦): menu_common `menu_cmn_balloon00.fmab`(3)·`menu_cmn_quest_platform00_ev_quest_start_cut02.fskb`(1), mgm00 `mgm04_result00_banana00/01_shake00a.fskb`(63씩), mgm01 `mgm01_sea00.fmab`(4), mgmet `mgmet_map01.fskb`(8)·`mgmet_sea00.fmab`(1)·`mgmet_sea00_op_c01.fmab`(1)·`mgmet_vehicle00.fskb`(7), mg1801 `mg1801_water00.fmab`(2) — 괄호 = 해당 커브 수. 캐릭터 모션 fskb 는 표본 300개에 0 [데이터]. 다시 만든 곳: `menu_cmn_balloon00.fmab`·`menu_cmn_quest_platform00.glb` → extracted menu_common + web plaza/world, `mg1801_water00.fmab` → extracted mg1801 + web mg1801/model, mgmet 4개(map01·vehicle00 glb, sea00·sea00_op_c01 fmab) → extracted mgmet 만(web 은 mgmet 3D 를 아직 안 씀), mgm00 바나나·mgm01 바다 → 변환 산출물이 아예 없어 갱신할 사본 없음(다음 변환 때 자동 반영). glb 4개 모두 glb JSON·메타 같고 바뀐 바이트는 전부 애니 접근자 안(퀘스트 발판 855·map01 7542·vehicle00 895). assets-dist 증분 갱신. 시험: 공용 검사 `tools/anim_repeat.ts`(한 주기 사이 두 프레임 값이 같은지, 범위 밖이면 구간 앞뒤가 끝값 고정이 아닌지) — test_plaza_world 11절(기구·퀘스트 발판), test_mg1801(물), test_mgmet 6절(extracted 산출물), test_mgm01 11절(바다·바나나는 변환기를 그 자리에서 돌려 test/out/anim_repeat/ 에 구움, 바나나는 같은 뼈를 가진 요시 모델에 붙임) |
| (A) 물 표면(water_enable: 바다·분수 물·무대 물) | 물 합성 근사(§6.14 ④): 탁함 k = 상수(바다 1, 그 밖 1/muddy_range) | 물 깊이·수중 장면 굴절 없음 [근사] |
| (A) 광장 보기(OverView) | overview.ts 가 카메라·대기·해제, interact.ts 는 결과 13 에서 `overview:end` 까지 상태 유지 후 resume(작은 Edit) | OverViewImpl [판독]. 안내 = `ComUiGuide00`, `SetGuidePos(0x11)`, `SetMessageLabel("sys_ctrl_back")`, `In(false)` [판독 menu00 @0x710005f9d8~0x710005fa08]. 시작/끝 FX = `ST_DUCKING_START_LOOKMENU` / `ST_DUCKING_FINISH_LOOKMENU`(@0x710005f954~0x710005f960·0x710005fadc~0x710005fae4). 현재 `overview.ts`는 카메라·B/X 해제·취소 SE만 구현; 안내·ducking은 미구현 |
| (A) 국소 반사 정규화 | 국소 큐브 평균 휘도를 공통 반사 큐브 평균에 맞춤(specNorm) | specular_ibl_normalization 식 미판독 [근사] |
| (A) 캐릭터 충돌 반지름 0.9 와 계단 | 자동 오르기 근사(발 + STEP 반구)로 계단을 오르게 함 | 반지름은 B 의 [추정](bubble_radius). 원본 컨트롤러 반지름·stepOffset 미판독 [근사] |
| (A) 첫 그리기 준비 | 현재 앱은 P0 준비·앱 수명 렌더러 재사용·등급별 나머지 로딩 | [loader_manager.md](../engine/loader_manager.md) §11.4·§14.9의 기존 구현 결과 재사용. §6.14 #16의 전부 warmup(+약 10 s)은 이전 구현 측정 |
| (A) 그림자 범위 | 캐스케이드 둘째 경계 38.4 m 까지 맵 하나 | 원본 캐스케이드 3·정적 EVSM [근사] |
| (A) 가짜 원격 멤버 위치 | 수신 위치를 지면에 맞춤·낙하 보정 | 가짜 걷기 원이 장애물을 지남(online/fake.ts, D) [설계] |
| (C) 장식 소품 애니 | MapManager::Create 가 애니 이름을 넘기는 것만 튼다(npc00_obj·npc07_obj·npc02_obj·air_npc03~05). glb 에 묶여 온 다른 클립(비치볼 `menu00_ast_beachball00_anm00`)은 틀지 않음 | 원본 코드·main 에 그 이름이 없음 [판독+데이터, §6.14 #15]. 그 클립은 보드 장면용 월드 좌표라 틀면 공이 하늘을 120 m/s 로 돈다 |
| (A) 광장 애니 재생 속도 | 클립·fmab 모두 실시간 1 초 = 60 프레임(속도 1) | 원본 애니 모듈 진행량 = delta × 60 × 슬롯 속도 [판독 §6.14 #15]. 원본 실기에서 갈매기·하늘 NPC 가 더 느려 보이면 사용자 확인 필요(코드상 근거는 없음) |
| (A) 비행 파타파타 경로 | air_npc03~05 를 AttachLocaterDecoNpc/attach_air_npc03~05 에 늘 붙여 1000f 루프(뼈 npc03~05_anim 을 C 가 getSocket) | C 판독 표(§6.10 장식 NPC C). MapStructure 밖 — manifest.plaza.extraLayout [판독+설계] |
| (A) 충돌 계단 0.5·벽 경사 45° | 웹 STEP와 벽 제외 문턱(지면은 n.y>0.05) | 원본 접지 법선 0.7071 판독(§3.5)과 웹 디딤 판정은 별개. CCT 사용·stepOffset은 §7 [미확정] |
| (D) 원격 위치 보간·정지 좌표 | 표시 actor의 `RemoteMotion`·`AutoInterpolation` 하나(표시 위치 기준 5/1 m, 위치 진행 중 Run6), 정지 좌표 미송신, d>5 때 보간기 안 멈춤 | 원본 OnReceive·보간기 [판독 12_online_sync §3.4]. 로컬 충돌/접지·Run 액션 대응은 [근사]. 정지 뒤 차이는 평지 시험 수치이며 공통 오차 상한이 아니다. 구현·시험·후속 선택지는 [12_online_sync.md §6.2.1](../engine/12_online_sync.md) 참조 |
| (A) 블룸 세기 | ~~mg1801 대응 UnrealBloom~~ → 판독식(§6.13)으로 바꿔 해결 | 화면 바램 원인이었음 [측정] |
| (A) 음악 상점 기본 애니 | 웹은 `menu00_shop_music` 클립·fmab를 속도 1로 계속 반복 | **원본은 BGM 박자 변화마다 `PlayAnimForce("beat")` 재시작**(§6.7). 속도 변경 추정은 철회. 본체 fmab 원본 loop=false인데 웹 명세 loop=true이며 박자 연동도 없어 [근사]; 홀로그램은 별도 루프 |
| (A) 친구 매치 오브제 처음 | startup 클립·fmab 0 프레임 정지(오프라인 Sleep 처음 상태) | `MapManager::Update`·`PlayFriendObj_Sleep` [판독]: 네트워크 상태 0 이면 boot_s/boot_m 프레임 0·속도 0 |
| (A) index.html 흐름의 항구 | 모드 메뉴에서 미니게임(key mgm) → 기존 항구 2D 페이지(`runMgmet` hub) → 프리 플레이 시작이면 목록 | 원본 흐름 mgm → mgmet → mgm01. 항구 3D 는 사용자 결정으로 중단 상태라 2D 판 |

| (B) 1번 시작 자리 | `pc_plaza_balloon_pos_p<사람 수>_pc00` 위치·회전(뒤 기구 쪽, 회전 π) — 첫 진입을 건너뛰므로 `SequenceMainMenu::Setup` 의 `GetAttachSocketPcDefault` 경로를 따름. 정정(C 판독 §2·§6.10): 사람 수 = 이 기기 플레이어 중 **COM 을 뺀** 수(광장에는 CPU 를 만들지 않는다), 1~4 (`player.ts startSocketCount`) | §3.5 시작 자리 [판독] |
| (B) 카메라 +0x60(목표 x=0·z 범위 고정) | 끔 | 켜는 곳은 첫 진입 `SequenceEntrance::InitialRideBalloonImpl` 하나(menu00.nro.c:67421). 첫 진입을 건너뛰므로 생성자 값 0 [판독] |
| (B) 카메라 목표 시작값 | `char_plaza_default_pos` | `StartMainMenuCamera` 를 부르는 곳 대부분이 로케이터 3 을 넣는다(Setup 경로는 이전 값 유지 — 첫 진입 뒤 값과 같음) [판독] |
| (B) 모션 섞기 길이 | `sys_pc.mpat` 의 a 를 프레임으로 씀(→walk 12, →run 8, walk→idle 12, run→idle 10). 표에 없는 전이는 MotionArg 기본 0.1 s | mpat a 단위 [추정, 06 §2.5]. charselect `Preview3D.play` 에 섞기 시간 인자(선택)만 더해 같은 캐릭터 파이프라인을 씀 |
| (B) 맵 충돌 반지름·키 | 반지름 = characterlist `bubble_radius`(마리오 0.9), 높이 = `height`(PCHeight) | ComMatter HitShape 미판독 [추정]. 쿠파 추가 구 2개(반지름 1.0, (0,1.2,0.1))는 벽 판정 반지름을 max 로 반영 [근사] |
| (B) 계단 오르기 | 발 위 0.5(meshCollider STEP) 안의 걸을 수 있는 면은 그 높이로 올림 | 원본 = PhysX 침투 밀어내기(`DefaultAdjustCharacterVsMap`) [근사] |
| (B) 착지 모션 | 공중 → 땅이면 바로 Idle/Walk/Run(Landing·Fall 모션 없음) | 광장에는 점프가 없고 낭떠러지 낙하만 드묾. Fall/Landing 모션(co_fall·co_jump_land)은 아직 변환 안 함 [근사] |
| (B) 고정 60 Hz | 이동·카메라를 원본 프레임 단위(1/60 s)로 진행, df 가 1 이 아니면 정수 틱 누적 | 원본 FollowPlayerImpl 은 프레임당 1회, 액터 적분은 1/60 서브스텝 [판독] |
| (D) 스탬프 조작부를 받는 사람 | 로컬 사람 중 **1번(조작 플레이어)을 뺀** 2~4P 만(안내 "🕹 스탬프"·목록·L/R/X/Y 단축). 1번은 스탬프를 못 보냄 | SetPlayers 의 `GetOperationPlayerId` 비교 [판독: 어셈블리]. 조작 플레이어 = 1번(슬롯 0) [추정]. 사용자 캡처의 스탬프 줄·말풍선은 2P 이상 또는 원격 멤버의 것과 맞음 |
| (D) 스탬프 목록을 여는 입력 | 왼쪽 스틱(웹 bex 0xf0000 = 왼쪽 스틱 방향, online_page toBex 와 같은 규칙) | 원본 비트 0xf0000 [판독], 안내 글리프 E015 = 스틱 그림 [데이터]. 따라 걷는 2~4P 의 스틱이라 이동과 겹치지 않음 |
| (D) 스탬프 목록 항목 | 저장 데이터가 없으므로 UnlockGroup −1 인 12개(캐릭터 3 + 공용 1·2·9·12·13·14·20·25·37) | `IsGet || FUN_7100298518 == -1` [판독], FUN_7100298518 = UnlockGroup [추정] |
| (D) 목록 B 닫기 | 1인 목록(`sys_stamp_list_01`)만 B = 닫기, 2인 이상 목록은 단축 키·보내기로만 닫힘 | 닫기 글자 `smp_oneList_ctrl_back` 이 1인 목록에만 있음 [판독], 입력 코드 위치는 [미확정] |
| (D) 목록에서 A 로 보낸 뒤 | 목록·안내 즉시 숨김(단축 키와 같은 처리) | 결정 콜백 본문(+0x3f0) [미확정] → 단축 키 경로와 같게 [추정] |
| (D) 수신 차단(`smp_oneList_ctrl_muteCheck` "−/+ 스탬프 수신") | 글자만 보이고 기능 없음 | 범위 밖(설정 저장) [설계] |
| (D) 가짜 온라인 멤버 스탬프·이동 | FakeOnline 옵션 `stampEvery`(초, 0 = 없음)·`remoteMove`(원격 멤버가 0.2 s 마다 위치 보냄) | 실제 네트워크 없음 [설계] |
| (D) 대기실 입력 | 대기실(방 안) 동안 online 흐름의 Y·X·B·+ 를 그대로 쓰고 **A(출발)는 막음**(출발 = 기구, C) | online.md 9.3 의 "A = 출발" 은 광장 없는 대역이었음 [설계]. 대기실 버튼 ↔ 동작은 online.md 11 ② 미확정 그대로 |
| (D) 원격 이동 | `ui/net.ts`는 수신 목표·수명만 보관 → 패킷마다 `net:remote` → `follow.ts RemoteMotion`의 표시 위치 기준 거리 분기·`AutoInterpolation` 하나 → `PlazaMover` 이동·충돌/접지 | 원본은 시간 인자 없는 `ComActorAutoInterpolation::Start`(§5.1 ⑥). 0.2 s는 송신 타이머이며 웹 실제 간격은13틱(0.2167 s); 보간시간이 아니다. 수정 전 UI 선형·slerp와 mover 추종의 이중 보간은 제거됐다. 현재 로컬 충돌/접지·Run 액션 대응의 [근사]는 §6.10 ②·[12_online_sync.md §6.2.1](../engine/12_online_sync.md)에 유지 |
| (D) 스탬프 소리 | 없음(SQ_SE_STAMP_* 사건만 냄) | 소리가 `subarc_voi_stamp.fsst` 하위 묶음(캐릭터 목소리, 로컬 변수 0 = 캐릭터 번호) — sound_seq.py 가 상주 fspj 만 렌더 [미확정: 하위 묶음 렌더 도구 필요] |
| (C) CPU 의 광장 등장 | **안 나옴**(사람만: 1번 조작 + 2~4P 따라가기). 지시서의 "CPU 따라가기" 를 원본대로 고침 | `SequenceMainMenu::Setup`·MainImpl 의 GetPlayerList 반복이 PlayerType≠1·IsLocal 만 SetupLocalPlayer [판독]. B 의 시작 소켓 p<사람 수> 도 COM 을 빼야 원본과 같음(B 는 COM 포함으로 추정 — SHARED 로 알림) |
| (C) 장식 NPC 묶음 B·C·E | **처음부터 셋 다 보임**(`?decoNpc=` 로 고름, 예 `?decoNpc=` 빈 값 = 없음) | 원본은 장식 아이템 0x3F/0x40/0x41 을 얻어 표시해야 보인다(`ApplyDecoItem` IsDisplay) [판독]. 새 저장이면 안 보이지만, 사용자 지시("장식·NPC 는 모두 원본처럼 보이고 애니메이션 다")로 얻은 상태를 기본으로 [설계] |
| (C) 상점 직원 반응 New/Bye | 항상 Bye(co_bye00) | 새 표시(IsVisibleNewIcon*)는 저장 데이터 기준 → 없음 [판독+설계] |
| (C) 결정 뒤 기구 외 화면 | 가이드·상점·퀘스트·랭킹·뮤직·데이터 하우스는 `interact:decide` 뒤 다음 프레임 복귀. 친구 매치(3)는 메뉴를 열고, 광장 보기(13)는 `overview:end`까지 유지 | 가이드 원본 전용 흐름은 [plaza_guide.md](plaza_guide.md), 광장 보기는 §6.14 #8. 현재 `interact.ts`의 결과 13 예외를 반영 |
| (C) NPC 부착 모델 | 코드가 명시적으로 붙이는 것만(Group04 npc01 노코노코 모자). 파타파타 캡·해머 브로스 망치 등은 안 붙임 | menu00 이 `NPCAttachModelFilePath` 로 한 번만 직접 붙임 → ComMatter 자동 부착은 없다고 봄 [추정: ComMatter(NPC) 부착 규칙 미판독] |
| (C) NPC 몸 충돌(캡슐 반지름 0.5, 층 1) | 웹은 넣지 않음(1번이 NPC 를 통과) | B 의 이동기는 맵 충돌만 씀. 액터끼리 충돌은 B 이동기 범위 [미구현, B 협의] |
| (C) 기구 출발 첫 페이드 시간 | 1.0 s | 어셈블리 확인(정정) [판독]. 정정(plaza-B): 선택 때 1번이 `balloon_pos` 를 보는 회전(`PlayerManager::LookAt(pos, false)`)은 **구현함** — balloon.ts `begin()` 이 `player:input` false(PlayerManager::Stop) + `player:lookAt` {target: balloon_pos} 를 내고 player.ts 가 §3.5 LookAt 규칙으로 돈다 |
| (C) 출발 카메라 컷 near | fsnb near 0.01 대신 **0.3**, far 1000·fov·위치·EulerZXY(three 'YXZ')는 그대로 | 원본은 ApplyNearAndFar(기본 켬)로 0.01 이지만 웹 24비트 깊이에서 near 0.01 이면 바다·섬·원경이 깜빡임(z 싸움). 컷 카메라는 물체에서 수 m 이상 떨어져 있어 잘림 차이 없음 [근사] |
| (C) 출발 건너뛰기 | 두 번째 출발부터 `sys_ctrl_skip` 안내·+/− 건너뛰기(첫 출발 때 브라우저 저장소에 메뉴 비트 기록) | 원본 메뉴 저장값 비트 0 [판독]. 저장 = localStorage `mpj.plaza.menuData0` [설계] |
| (C) 화면 페이드 | 공용 화면 전환 White, 인자 = 속도(선택·건너뛰기 1.0 = 20f, 끝·세션 0.5 = 40f) | 판독 완료(2026-10-09) — [../engine/15_transition.md](../engine/15_transition.md) |
| (C) 따라가기 이동 | 목표 쪽 수평 단위 방향을 B `PlazaMover`의 깊이 1 레버로, 도착하면 목표 위치로 맞춤 | `ComActor::GetMoveLever` main @0x7100013500이 진행 중 `Calculate` 결과로 입력 레버를 대체(§3.5 기존 판독). 속도 6·도착 판정은 §6.10 ② [판독]; 웹 충돌은 [근사] |
| (C) NPC 셰이더 그래프 | §6.11 판독 식대로(색 층·눈 합성·쿠리보 UV·틴트). 림·SSS·노멀 배열은 생략 | plaza-C-sg [판독], 생략분 [근사] |
| (room) 세션 중 기구 선택 | 오프라인 출발 연출 없이 바로 PlaySession → 모두 0.5 s 페이드 아웃 → 1.0 s → 모드 메뉴 | `SelectedBalloonImpl`·`PlaySessionFiber` [판독, online.md 5.6 정정]. WaitSync(1) 는 서버 `started` 방송 한 번으로 맞춤 [근사] |
| (room) 모드 메뉴 이후 | 방 연결은 광장을 나가면 끊고, 모드 메뉴는 기존 오프라인 화면 | menu01 온라인 동기(플레이어 Work·WaitSync)는 범위 밖 [설계] |
| (room) 카드 내용 | 이름 = 플레이어 이름, 업적 −1(`im_achieve401_name` "수습 플레이어")·랭크 0·플레이 시간 0(숨김)·디자인 0(`card_bg_07`)·스티커 없음 | 저장 데이터 없음 → 원본 빈 카드 기본값(`GetNetworkPlayerCardData` 초기값)과 같게 [설계] |
| (room) 카드 소리 | `SQ_SE_SYS_DECI_S`(열기)·`SQ_SE_SYS_CANCEL_S`(닫기)·`SQ_SE_SYS_CURSOR_S`(넘기기) 라벨만, 덕킹 `ST_DUCKING_*_CARD` 없음 | 공용 명세에 있는 소리만 남 [설계] |
| (room) 참가 때 캐릭터 다시 고르기 | 온라인 흐름이 다음 빈 캐릭터로 자동 교체해도 광장 3D 캐릭터·위치는 그대로 | 원본은 RestoreLocalPlayerData 참이면 기본 소켓에 다시 만듦 [판독] — 웹 자동 교체가 [설계]라 3D 교체는 하지 않음 |
| (room) 손님 기구 판정 | interact 담당에 SHARED 요청('net:lobby' {host, ready}) — 반영 전에는 손님도 기구 안내가 뜰 수 있으나 출발은 방장만 | MainImpl 세션 분기 [판독] |
| (room) 서버·통신 | 방 찾기·만들기·참가 = HTTP(바이너리), 방 입장부터 socket.io `/mpj-plaza`(바이너리, 위치 10 B·중계 12 B), 나가기·해산 = 소켓 끊음, 혼자·로컬만 = 통신 없음 — online.md 9.5 표 | 원본 NEX 대신 ddalkkakrider 와 같은 http + socket.io 구조 [설계: 사용자 지시] |
| (room) 가짜 원격 걷기 | FakeOnline 옵션 `walk`(광장 MeshCollider `collide` 벽 밀어내기 + `groundHeight` 지면 스냅, 몸 반지름 0.9·키 1.6) 로 원 위 목표점을 0.2 s 마다 최대 0.6 m 따라감, 원 중심 (0, −2.36, 25)(1번 시작 자리 뒤 광장 바닥) | 광장 A 지적(가짜 원이 기구 계단·난간 위를 지남) — 실제 원본 멤버는 사람이 조작 [설계: 가짜 데이터] |
| (room) 가짜 어댑터의 로컬 여러 명 | FakeOnline 은 이 기기를 멤버 한 명으로만 넣는다(사람 2 + 가짜 3 = 하단 줄 4칸) — 실제 서버(SocketIoOnline)는 사람마다 멤버(스테이션#순번) | 가짜 데이터 단순화 [설계], 실제 규칙은 test_room_server ③ |
| (room2) 광장 기본 온라인 | 실제 방 서버(`SocketIoOnline`, 같은 출처). 가짜는 `?online=fake`·`?online=off`(방 없음)만 | 사용자 지시(online.md 9.6 ①). 서버 없는 정적 호스팅이면 친구 매치에서 B3 대화상자 |
| (room2) 나가기·해산 뒤 | 친구 매치 메뉴로 돌아가지 않고 혼자 광장 메인 | MainImpl 람다 LeaveSession/DissolveSession 뒤 광장 [판독 online.md 5.5]. 단독 온라인 페이지만 메뉴로 |
| (room2) 열린 카드 뷰어와 멤버 이탈 | 나간 사람 카드를 빼고 0장이면 닫힘 | 원본 람다는 열 때 한 번 채움 — 이탈 때 고치는지 미판독 [설계] |
| (room2) 끊김 감지 | 탭 닫기 = 즉시, 네트워크 끊김 = socket.io 핑 최대 ≈ 15 s(5 s 간격 + 10 s 시간 초과), 재접속 없음 | 원본 NEX 시간 초과 값 미판독 [설계] |

보충(2026-10-09, [../engine/16_save.md](../engine/16_save.md)): (C) 의 저장은 앱 공용 저장 `mpj.save` 의 `menu.bits` 비트 0 으로 옮겼다(`ctx.save` = `PlazaSave`, 첫 출발 때 비트 + 저장 요청). 옛 키 `mpj.plaza.menuData0` 는 처음 한 번 옮기고 지우지 않는다.

→ 광장 첫 진입 정리: [plaza_intro.md](plaza_intro.md) §15·§16

