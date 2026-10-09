# 13. 공용 에셋 변환기 — 형식별 처리기·분류별 어댑터·장면 로더

2026-10-09. 담당: asset-convert. 상태: **설계 + 구현**(결과 수치는 §10, 미확정은 §12, 사용자 확인 필요는 §13).

화면·게임마다 따로 쓰던 변환 스크립트(광장 `plaza_world_assets.py`, 결과 무대 `mgresult_web_assets.py`, 공용 틀 `mgscene_web_assets.py`, mg1801 `mg1801_web_*.py` …)를 **아카이브 종류와 무관한 공용 코어 하나**로 모은다.

- 입력은 `extracted/bea/<분류>~<이름>.nx.bea` 아무거나다.
- 형식별 처리기가 아카이브 안 파일을 웹 형식으로 바꾼다.
- 분류별 어댑터가 장면 의미(배치·기본 애니·카메라 묶음·단계 로딩)를 더한다.
- 첫 적용은 미니게임 어댑터다. `mg_assets.py <id>` 하나로 게임 장면 에셋이 나오고, 로더 `script/shell/mgstage`가 그것을 공용 3D 무대(`stage3d`)에 올린다.

확정 수준 표기는 다른 엔진 문서와 같다: **[판독]** 디컴파일, **[데이터]** 추출 파일, **[실행]** 이 작업에서 돌려 본 것, **[추정]**, **[근사]**(웹에서 원본과 다르게 한 것).

---

## 1. 목표와 결론

| 목표 | 결론 |
|---|---|
| 변환기 하나 | `tools/analysis/asset_convert.py <아카이브>`(코어) — 분류 무관. 미니게임은 `tools/analysis/mg_assets.py <mgid>`(어댑터 + `--all`) |
| 기존 도구 재사용 | 새 파서·디코더를 만들지 않는다. 그래픽 = `graphics_convert.py`(graphics_bntx + graphics_bfres2gltf), 환경 = 광장 `plaza_world_assets.py` 함수, 그래프 = `plaza_graph_web.py` + SASS 도구, 충돌 = `scene_nbmap.py`·`scene_apx.py`, UI = `mg1801_web_ui.py`·`mgscene_web_assets.py` 함수, 소리 = `sound_fsar.py`·`sound_seq.py`·`sound_bfstm.py`, 이펙트 = `effect_vfxb.py`, 공용 판정 = `common_shared.py`·`font_web_assets.py`·바이트 색인 |
| 같은 규칙 | 출력 폴더 구조·manifest 형식·공용 폴더 판정·압축 분류가 분류와 무관하게 같다(§2·§8) |
| 재현 | 같은 입력이면 같은 바이트. 같은 경로에 다른 내용을 쓰면 경고하고 덮어쓴다. 이번에 쓰지 않은 옛 파일은 경고만 한다(지우지 않음) |
| 원본 보호 | `extracted/`(원본 아카이브·기존 변환물)는 읽기만 한다. 중간 변환은 `analysis/asset_convert/<분류>/<이름>/`, 셰이더 SASS 는 `analysis/mat/conv/<분류>/<이름>/` |
| 원본 에셋 그대로 | 텍스처 축소·틴트 없음(픽셀 그대로 — assets_pipeline.md §3.4 "원본보다 키우지도 줄이지도 않음"). 광장 변환기는 1024 초과를 줄였지만 공용 코어는 줄이지 않는다(§6 이전 표에 차이로 적음) |

---

## 2. 입력 → 출력 위치

### 2.1 아카이브 이름 규칙 [판독: 06_scene_data.md §1.1]

`"./Archive/" + 논리 이름('/'→'~') + ".nx" + [".<로캘>"] + ".bea"`. 코어는 이것을 거꾸로 읽는다(`Archive` 클래스).

| 아카이브 | 분류 | 출력 `web/assets/…` |
|---|---|---|
| `mg~mg0508.nx.bea` | mg | `mg/mg0508/` |
| `menu~menu00.nx.bea` | menu | `menu/menu00/` |
| `mgm~mgmet.nx.bea` | mgm | `mgm/mgmet/` |
| `object~obj00_rengablock.nx.bea` | object | `object/obj00_rengablock/` |
| `libca~mg_common.nx.bea` | libca | `libca/mg_common/` |
| `libbex~libbexgfx~libexgfx_resident.nx.bea` | libbex | `libbex/libbexgfx/libexgfx_resident/` |
| `bq.nx.bea` / `bq.nx.koKR.bea` | bq | `bq/` / `bq/koKR/` |
| `sound~subarc_mg0508.nx.bea` | sound | `sound/subarc_mg0508/` |
| `chara~pc01.nx.bea`, `font~font_kr.nx.bea` | chara, font | **코어가 쓰지 않는다** — 공용 폴더 담당(`chara_shared.py` → `assets/chara/`, `font_web_assets.py` → `assets/font/`). `--out` 으로 비교만 가능 |

규칙: `assets/<분류>/<이름…>[/<로캘>]/`. 기존 화면 폴더(`plaza/`·`mg1801/`·`mgresult/` …)와 이름이 겹치지 않는다(분류 폴더 아래에만 쓴다).

### 2.2 한 아카이브의 출력 구조

```
assets/<분류>/<이름>/
  manifest.json      stage3d 형식(models·textures·anims·env·graphs) + asset{…}(코어 공통) + <어댑터>{…}(장면 의미, 예 mg{…})
  model/<모델>.glb   이미지 uri = ../tex/<png>(공용 폴더와 같은 바이트면 그 경로)
  tex/<png|hdr|f16.bin>  glb 이미지 + 재질이 직접 읽는 슬롯(라이트맵·국소 반사 큐브·그래프 입력) + 환경(IBL·안개·LUT·하늘·바람 노이즈)
  anim/<파일>.fmab.json|.fvbb.json   재질 애니·뼈 보임(프레임별 구운 값)
  cam/<파일>.fsnb.json               카메라 클립(프레임별 구운 값, 광장 FsnbCamera 형식)
  collision.json     nbmap 충돌 엔티티 → 삼각형(월드)·기본 형상 — 데이터만
  ui/ui.json, ui/tex/   lyt(SARC) 레이아웃·애니·그림·글꼴 참조·글
  msg/<파일>.json    msbt(아카이브에 있을 때)
  sound/sound.json, sound/*.wav   시퀀스 렌더 [근사]·BFSTM 디코드
  fx/fx.json, fx/tex/, fx/primitives.bfres   VFXB 원본 데이터(런타임 준비용)
  data/<아카이브 안 경로>   json·csv·msgpack 원본 바이트
```

---

## 3. 코어 — 형식별 처리기 (`asset_convert.py` `HANDLERS`)

처리기는 `Handler(이름, 부분, run(job))` 로 목록에 꽂는다. 목록 순서 = 실행 순서다. `--only gfx,ui,sound,fx,data` 로 부분만 다시 만들 수 있다(나머지는 이전 manifest 값 유지).

| 처리기 | 부분 | 원본 형식 | 재사용 도구 | 출력 |
|---|---|---|---|---|
| gfx | gfx | FMDB·FSKB·FSHB·FMAB·FVBB·FSNB·BNTX | `graphics_convert.convert`(SETS 에 아카이브 스펙을 꽂고 OUT 만 바꿔 부름) → graphics_bntx·graphics_bfres2gltf | `model/`·`tex/`·`anim/`·`cam/`, manifest models·anims, asset.cameras·sockets |
| env | gfx | env/ 폴더 FMDB(셰이딩 모델 environment·directional_light·posteffect·skybox·point_light 컨테이너) | graphics_bfres2gltf dump + 광장 `plaza_world_assets` 함수(euler_dir·sampler_textures·read_hdr) | manifest.env(광장 env 와 같은 필드), asset.envChosen·envVariants |
| graph | gfx | 셰이더 그래프 재질(`static_opt_shader_graph 1`) + `.bnbshpk` | `plaza_graph_web.build`(판독식 정리), `bnbshpk_split.py`·`bfsha_dump`·`sass_dis.py` | manifest.graphs(graph.ts GraphDef), asset.pending.graphs |
| collision | gfx | `.nbmap` 충돌 컴포넌트 → `.apx` | `scene_nbmap.Nbmap`·`scene_apx.Apx/shapes/leading_meshes` | `collision.json`, asset.collision·collisionModels |
| ui | ui | `.lyt`(SARC: bflyt·bflan·bntx), `.msbt` | `ui_sarc`·`ui_lyt`·`ui_render.LazyTextures`·`mg1801_web_ui`(pane_masks·clean_*)·`mgscene_web_assets`(part_refs·font_families)·`font_web_assets.font_ref`·`msbt.parse` | `ui/ui.json`·`ui/tex/`·`msg/`, asset.ui·msg |
| sound | sound | `.fsst`·`.fspj`(FSAR), romfs `stream/*.bfstm` | `sound_fsar.Fsar`·`sound_seq.py render`·`sound_bfstm.info/decode` | `sound/sound.json`·`*.wav`, asset.sound |
| fx | fx | `_Vfx/**/ConvertList.xml`(VFXB) | `effect_vfxb.cmd_dump`(+ png) | `fx/fx.json`·`fx/tex/`·`fx/primitives.bfres`, asset.fx |
| data | data | `.json`·`.csv`·`.msgpack` | — (원본 바이트) | `data/…`, asset.data |

세부 규칙:

- **모델 스펙** [추정: 폴더 관례]: `env/` 폴더의 FMDB 는 장면 파라미터 컨테이너(dump)로, 그 밖 FMDB 는 모델로 본다. fskb 는 같은 폴더에서 이름 앞부분이 가장 긴 모델에 붙인다(`graphics_convert.prefix_anims`, menu00·mgmet 과 같은 규칙). fshb 는 같은 이름 모델에, fmab·fvbb·fsnb 는 anim 으로 굽는다(`.ftsb.fmab` 캐릭터 표정 애니 제외).
- **하늘**: 고른 skybox 컨테이너는 `--all` 로 glb 를 하나 더 만든다(광장과 같은 명령).
- **텍스처 범위**: glb 이미지 + 재질이 직접 읽는 슬롯(`gi_diffuse_texture2d`·`local_specular_texturecube`·`shadow_texture2d`·`sg_utility_texture*`, mg1801_web_models 와 같은 규칙) + 그래프 재질은 샘플러 전부(판독 식이 `_r0` 등을 읽는다) + 환경 텍스처. manifest.textures = 광장 tex_entry 와 같은 색인(files·srgb·cube·format·w·h·depth, 국소 반사 큐브는 specNorm).
- **VAT 텍스처**(R16G16B16A16 FLOAT, 03_graphics.md §4.4.4·§5.3)는 graphics_bntx 표에 없다. PNG 로 담을 수 없어 디스위즐한 원본 half float RGBA 를 `<이름>.f16.bin` 으로 쓴다(도구는 고치지 않고 디스위즐 함수만 재사용). 웹 VAT 재생은 없다 [미확정 §12].
- **환경 고르기**: 같은 종류 컨테이너가 여럿이면 어댑터가 고르고(`env_pick`), 없으면 접미가 없는 이름(`_env`·`_dir_light`·`_post`·`_skybox`) → `_game` → 첫 이름 [추정]. 나머지는 `asset.envVariants{이름: {kind, env}}` 로 같은 필드로 싣는다(결과·오프닝 환경 전환용).
- **평행광 방향**: overwrite 1 이면 overwrite_rotation(도), 0 이면 컨테이너 뼈 회전(라디안 → 도) — 07_camera_lighting.md §6.6. 높이 안개(env_height_fog)는 값만 싣는다(stage3d 미구현 [근사]).
- **셰이더 그래프** 순서: ① 이 아카이브의 판독 파일 `analysis/mat/conv/<분류>/<이름>/graph.json`(광장 plaza_graph_*.json 과 같은 형식) → plaza_graph_web 로 정리. ② 광장 판독 재사용 — 재질 옵션의 그래프 해시(`fragment_shader_graph_*`·`vertex_shader_graph_*` 값)가 광장 재질과 같으면 그 정의를 복사하고 샘플러만 이 재질 것으로 바꾼다 [추정: 같은 그래프 해시 = 같은 식]. ③ 나머지는 **판독 대기** — SASS 까지 자동으로 준비(`analysis/mat/conv/<…>/sass/<tag>.fs.txt`)하고 `asset.pending.graphs` 에 적는다. 판독(SASS → 식)은 사람·판독 갈래 몫이고, 판독 전에는 stage3d 재질이 알베도·라이트맵만 쓴다(stage3d.md §3 [근사]).
- **충돌**: nbmap 엔티티 트랜스폼을 부모 기준으로 곱한다 [추정: 06_scene_data.md §3.3 미확정]. 삼각 메시·볼록체는 월드 삼각형(`vertices`·`indices` = stage3d `MeshColliderData` 형식), box·sphere·capsule 은 `shapes`. 추가 데이터 위치를 확정 못 한 메시는 `unread: true`.
- **소리**: 어댑터 `sound_sources()` 가 FSAR 목록과 라벨 거르개를 준다(generic = 아카이브 안 fsst·fspj 전부). 시퀀스는 `sound_seq.py render`(재구현 근사, 04_sound.md), 스트림은 BFSTM 디코드(반복·리전). 리듬 BGM 시퀀스(`SQ_BGM_*`)는 전역 변수·BPM 에 따라 달라 건너뛴다(`skipped`, 게임 전용 변환기 몫).

## 4. 공용 폴더 판정

| 대상 | 규칙 | 모듈 |
|---|---|---|
| sys_ UI 그림·범주 밖 공용 그림 표 | `assets/common/tex/` 에 쓰고 상대 경로를 명세에 | `common_shared.tex` |
| SQ_SE_SYS_* 효과음(+별칭) | `assets/common/sound/` | `common_shared.sound` |
| 글꼴 | `assets/font/` 원본 시트를 `{dir, chars}` 로 가리킴 | `font_web_assets.font_ref` |
| 캐릭터·NPC | `assets/chara/` — chara~ 아카이브는 코어가 쓰지 않음 | `chara_shared.py` |
| 그 밖 모든 png·hdr·wav·otf | 공용 폴더(`common`·`chara`·`font`)에 **같은 바이트**가 있으면 쓰지 않고 그 경로를 가리킨다(glb 이미지 uri·manifest.textures files 를 `../../../<공용>/…` 로) | `asset_convert.SharedIndex` |

→ 시험 `tools/test_mg_assets.ts` 가 "게임 폴더에 공용 폴더와 같은 바이트 0" 을 확인한다.

## 5. 분류별 어댑터

`Adapter`(generic) 를 상속해 필요한 훅만 덮는다.

| 훅 | 뜻 | generic |
|---|---|---|
| `out_rel(arc)` | 출력 위치 | §2.1 규칙 |
| `env_pick(job)` | 종류 → 고를 컨테이너 | {} (이름 규칙) |
| `collision_nbmaps(job)` | 충돌로 쓸 nbmap | 전부 |
| `texts(job)` | ui.json texts | {} |
| `sound_sources(job)` | [(FSAR, 라벨 거르개)], [(추가 스트림 라벨, 근거)] | 아카이브 안 fsst·fspj |
| `extend(job)` → manifest.<어댑터 이름> | 장면 의미 | 없음 |

메뉴(광장)·결과 무대·항구는 같은 코어 위에 어댑터 하나로 붙인다(§6 이전 표). 이번에 만든 어댑터는 미니게임 하나다.

### 5.1 미니게임 어댑터 (`mg_assets.py`, `ADAPTERS['mg']`)

**입력**: 게임 id → `extracted/bea/mg~<id>.nx.bea`(장면 아카이브) + `sound~subarc_<id>.nx.bea`(게임 소리 뱅크) + 상주 소리 프로젝트 `_ResidentAudio/AddonAudioProject.fspj` 의 `_<ID>_` 라벨 + `audio.nx.bea audio/data/mgsound_setting.json` 의 게임 BGM 라벨 + `extracted/message/koKR/*.json` 중 라벨에 id 가 든 것(`im_<id>_name`·`inst_<id>_*`·`<id>_*`).
(공용 리듬 아카이브 `mg~mg1800`·`libca~mg_common`·NPC `chara~npcNNN` 은 그 아카이브를 코어로 따로 변환한다 — 06_scene_data.md §1.5 분류 2 규칙 [판독].)

**출력**: `assets/mg/<id>/`(§2.2) + `assets/mg/index.json`(변환한 게임 목록·이름·카메라 — 보기 페이지·미리 받기가 읽음).

**변환 범위와 우선순위**:

| 순위 | 무엇 | 처리기 |
|---|---|---|
| P0 | 맵·소품 모델, 텍스처, 스켈레탈(fskb)·재질(fmab)·뼈 보임(fvbb) 애니, 카메라 FSNB, 조명·환경·IBL·후처리·하늘, 배치(§5.2), 셰이더 그래프(§3), 충돌 데이터 | gfx·env·graph·collision + extend |
| P1 | 레이아웃(layout.lyt), 메시지(게임 라벨), 게임 소리 뱅크·BGM | ui·sound |
| P2 | 이펙트 원본 데이터(VFXB → fx.json, 런타임 없음 08_effects.md §9) | fx |
| — | 게임 데이터(data/ json·csv) | data |

**manifest.mg**:

```jsonc
{
  "id": "mg0508",
  "scene": "근거(게임 표 evidence 또는 '규칙 [추정]')",
  "layout": [{ "key", "model", "visible", "source": "table|rule|spawn|nbmap:<이름>|hook-host",
               "hookKey"?, "hookNode"?, "pos"?, "quat"?, "scale"?, "anims": [{ "kind": "clip|fmab|vis", "name", "loop", "speed", "frame" }] }],
  "camera": { "first": "<첫 카메라>", "game": "<본편 카메라>" },
  "first": { "camera", "p0": [키], "p1": [키], "p2": [키], "bounds": { "키": [x, y, z, r] } }
}
```

### 5.2 배치 — MapStructure 가 없는 미니게임

원본 미니게임에는 광장의 `MapStructure.json` 이 **없다**. 장면 엔티티는 게임 코드(`SyncedSetupGame`·`MapImpl`·`CreateBG`)가 경로로 만든다 [판독: 06_scene_data.md §1.7, 게임 문서]. 그래서 배치는 아래 순서로 정한다.

1. **게임 표** `SCENES[id]` [판독 — 항목마다 evidence]: `base`(원점에 보임) · `hidden`(장면에 있으나 그리지 않음) · `hooks`(모델, 부모 키, 부모 뼈) · `spawn`(부모 모델 뼈마다 모델 — 뼈 이름 정규식의 `t`·`iv` 묶음으로 모델 이름을 만든다) · `anims` · `cameras` · `env` · `envAnim` · `nbmap` · `collision`.
2. **nbmap 모델 엔티티**: 모델 컴포넌트가 있는 엔티티를 그 트랜스폼으로(`source: nbmap:<이름>`). guide·pos·col 모델은 숨김.
3. **표 없는 게임(`--all`)**: 이름 규칙 `_(bg|fld|ground|map|stage|field|sky|roof|wall)` 을 원점에 [추정], `_col`·`pos_`·`_guide` 는 숨김.

부착은 부모 뼈의 **위치·회전만** 따른다(배율 무시 — ComAttachment, minigame_result.md §6 [판독]; plaza world.ts `attachToSocket` 과 같은 규칙). 기본 애니는 표에 없으면 같은 이름 fskb 클립·fmab 를 루프 [추정].

| 게임 | 표 근거 | base / hooks / spawn | 첫 카메라 → 본편 | 환경 |
|---|---|---|---|---|
| mg0508 | mg0508.md §3.2·§7 SyncedSetupGame @0x710000f570·Field::Field @0x7100007640 | bg00(+fmab)·tablecloth·griddle(+fmab) / 도마·접시 → bg00 `pos_cuttingboard0t` / — | cam_start → cam_game | env·dir_light·post (변형: dir_light_start/_end, post_start/_result) |
| mg0106 | mg0106.md §7 ComMap @0x7100008784·CreateObj @0x7100009020 | bg00·bg01·bg_roof00·rotate_floor00·search_light / pos_obj_grp05 → rotate_floor00 `pos_locator00` / grp05 `pos_obj[A-E]NN` → objX00 (GetGameStage 0) | cam_op00 → cam_game00 | env_dark·dir_light·post, bg00_light·roof00_light fmab |
| mg0101 | mg0101.md §6.6·§7 CreateBG·CreateFloorParts @0x7100012ba0 | fld0~5·river·cliff·palm·leaf·statue·sunbeams·water_fall·lever·plants_op / — / 코스 a0 `pos_(iv_)?<t>NN` → floor_<t>(iv 면 floor_invisible.fvbb) | cam_op0 → cam_game | env·dir_light·post, 충돌 fld0_col·cource_a0_col |
| mg0122 | mg0122.md §5.6 map00.nbmap | nbmap Bg·Ground(기믹은 GimmickMgr 런타임) | cam_op00 → cam_game | env00·dir_light00·skybox, envAnim env00_game.fmab, 충돌 map00 |
| mg0102 | mg0102.md §7 | bg_ground00(+fmab)·bg_distant_view00(+fskb) | cam_op → cam_00 | env·dir_light·post |
| mg1801 | games/mg1801/view/stage.ts MapImpl 표 @0x7100037ff8 | bg00·floor00·water00·stool_npc00 | cam00 | env·dir_light·post (비교만, §9) |

### 5.3 단계 로딩 계획 (`mg.first`)

변환기가 정한다(로더는 읽기만): 각 배치 항목의 월드 경계 구(glb 바인드 자세 AABB × 배치 행렬)를 **첫 카메라** 시야(세로 화각·16:9·near/far, FsnbCamera 와 같은 자세 계산)와 겹쳐 본다.

| 등급 | 조건 | 로더 |
|---|---|---|
| P0 | 첫 카메라 0 프레임 시야에 걸치는 보이는 배치 + 부착 부모 | 이것만 기다린다(진입 = P0 준비 끝) |
| P1 | 첫 카메라 다른 프레임(10 프레임 간격) 시야에 걸침 | 뒤에서 받기(첫 화면 뒤) |
| P2 | 그 밖 보이는 배치 | 뒤에서 받기 |
| P3 | 숨김 배치·배치 밖 모델 | 게임이 부를 때 |

[근사] 애니로 움직이는 모델은 바인드 자세 경계로 본다.

---

## 6. 기존 화면별 변환기 이전 표 (이번에는 고치지 않음 — 다음 작업)

| 기존 변환기 | 원본 | 옮길 처리기 | 남는 어댑터 몫(장면 의미) | 공용 코어와 다른 점 |
|---|---|---|---|---|
| `plaza_world_assets.py` | menu~menu00·menu_common | gfx·env·graph·collision | `menu` 어댑터: MapStructure 배치·EXTRA_MODELS·SPECIAL_ANIMS·CameraParam·plaza_first | 텍스처 1024 초과 축소(코어는 축소 없음), 충돌은 기존 obj 덤프(코어는 nbmap→apx 직접), MENU00_EXTRA_ANIMS(코어 어댑터 훅으로 옮김) |
| `plaza_npc_assets.py`·`plaza_player_assets.py`·`charsel_chara.py`·`mg1801_web_charas.py` | chara~npc/pc | gfx(모델·모션) → `chara_shared` | `chara` 어댑터(모션 분리·속성 줄이기 = chara_shared.write_model/write_motions) | 공용 폴더 담당이라 코어 직접 쓰기 금지(§2.1) |
| `plaza_npc_graph.py`·`charsel_body_graph.py` | 캐릭터 bnbshpk | graph(SASS 준비) | — | 판독 결과 형식이 광장과 다름(npcMaterial.ts) — 형식 통일은 판독 갈래 |
| `mgresult_web_assets.py` | mg~mgResult | gfx(pos 모델 뼈)·cam | `mgresult` 어댑터: 결과 목록·캐릭터 파라미터·카메라 곡선 계수(camera_probe cam — 코어는 프레임 굽기) | 카메라 형식이 다름(곡선 원계수 vs 구운 프레임) |
| `mgscene_web_assets.py` | bq Parts.lyt·audio·stream | ui·sound | `bq` 어댑터: 루트 레이아웃 목록(ROOTS)·텔롭 글꼴 서브셋·tables(MGSetting 열거) | 코어 ui 는 아카이브 lyt 전부 |
| `mg1801_web_models.py`·`mg1801_web_ui.py`·`mg1801_web_effects.py`·`mg1801_web_assets.py` | mg~mg1801·mg1800·libca~mg_common·sound | gfx·ui·fx·sound | `mg` 어댑터(이미 있음) + 리듬 BGM 시퀀스 렌더(BPM)·이펙트 웹 형식(effects.json) | 리듬 BGM·이펙트 런타임 형식은 게임 전용으로 남김 |
| `mgmet_web_assets.py`·`mgm01_web_assets.py`·`mgmcommon_web_assets.py`·`modesel_web_assets.py`·`partyrule_web_assets.py`·`online_web_assets.py`·`setplayer`·`charsel_web_assets.py` | mgm~·menu~·bq | ui·sound(+gfx: mgmet) | 화면 어댑터: 루트 레이아웃·라벨 선택 | 화면이 쓰는 레이아웃만 고름(코어는 전부) |
| `font_web_assets.py` | font~ | — (공용 폴더 담당) | — | |
| `common_shared.py`·`chara_shared.py` | — | 코어가 부르는 공용 판정 | — | |

같은 원본을 코어로 변환했을 때 기존 산출물과 같은지 — §9.

---

## 7. 장면 로더 `script/shell/mgstage/`

### 7.1 경계

셸 경계(mgm_common.md §9.1): 같은 폴더·`three`·`../stage3d`·`../plaza`(attachToSocket)·`../../lib/assetcore`(상수) 만. `script/core·games·view` 금지. 로더 코어(`lib/assetcore`)는 import 0 그대로.

### 7.2 API

```ts
createMgStage({ canvas, id, assets: AssetSource /* assets/mg/<id>/ 기준 */, loader?: StageLoader, gpu?, floor?, budgetMs?, gltfTextures?, onProgress? }): Promise<MgStage>
interface MgStage {
  readonly id: string; readonly stage: Stage3D; readonly manifest: MgManifest;
  // 배치
  entry(key): StageModel | null;  ensure(key, pri?): Promise<StageModel | null>;  show(key, visible): void;  startBackground(): void;
  loadModel(name, opts?): Promise<StageModel>   // 배치 밖 모델(스테이크·칼 등 게임이 만드는 것)
  // 소켓·애니
  socket(name): SocketPose | null;  socketNames(filter?): string[];
  play(key, clip, opts?): ClipHandle | null;  playFmab(key, file, opts?): Promise<ClipHandle | null>;
  // 카메라
  cameras(): string[];  playCamera(name, { loop?, speed?, startFrame? }): Promise<MgCameraHandle | null>;  stopCamera(): void;
  // 충돌·결과 무대
  collision(): Promise<MgCollisionData | null>      // 형상 데이터만 — 충돌 런타임은 다른 갈래(MeshCollider 등)가 만든다
  resultWorld(socket = 'pos_result'): Promise<{ scene: unknown; origin?: { pos, quat } }>   // ResultStageHost.world
  update(dt): void;  render(): void;  resize(w, h): void;  dispose(): void;  debug(): Record<string, unknown>;
}
mgStagePlan(ext) / mgStageP0Paths(manifest, withTex) / mgStageKey(id, path)   // 순수 함수(시험·미리 받기)
```

- 기본 애니: clip(glb 스켈레탈) = `StageModel.play`, fmab = `Stage3D.playFmab`, vis(fvbb 뼈 보임) = glb 메시 `userData.visBone` 이 그 뼈인 메시를 프레임 값으로 켜고 끈다(stage3d 에 없어 로더가 함).
- 카메라 클립: 구운 fsnb json(광장 `FsnbCamera` 와 같은 자세 규칙: EulerZXY → three 'YXZ', Aim → lookAt + twist, fovy 전체 세로각)을 stage3d 카메라 슬롯 `anim` 에. near 는 광장과 같은 하한 0.3 [근사: 24비트 깊이]. `MgCameraHandle{ name, frame, frames, loop, speed, finished, stop() }`.
- 늦게 나온 모델의 기본 클립은 무대 시작부터 돌았을 프레임으로 맞춘다(광장 world.ts 와 같음).

### 7.3 공용 틀(`shell/mgscene`)과의 경계

minigame_scene.md §12.2 합성 순서 "게임 3D(후처리 포함) → 결과 무대 3D → 틀 2D" 의 **게임 3D** 가 `MgStage.render()` 다. 게임은 `MgGame` 훅 안에서 `MgStage` 를 갖고, 결과 갈래 A 에서는 `resultWorld()` 를 `ResultStageHost.world{scene, origin}`(resultContract.ts 확장 필드)로 넘긴다 — origin = `pos_result` 소켓(mg0122 `mg0122_pos_result` 처럼 게임 모델에 있을 때, 없으면 생략 = 원점).

### 7.4 미리 받기

`view/flowCatalog.ts` 묶음 `mgstage:<id>` = `mg/index.json`(변환된 게임인지) + manifest + `mgStageP0Paths`. `view/flowTable.ts` 의 mgm01 `game:*` 상태 예측에 `mgstage:{v}`(P2) 를 더한다.

---

## 8. 출력 폴더 ↔ 압축 빌드 분류

코어가 쓸 때마다 `assets/converted.json` 에 출력 루트와 폴더 역할을 적는다. `tools/assets_tex.ts` 가 이 파일을 읽어 루트 아래 텍스처를 3D/UI 로 나눈다 → **새 아카이브를 변환하면 압축 형식이 자동으로 맞는다**. glb·wav·json 은 확장자 규칙이라 원래 자동이다.

| 출력 폴더(루트 기준) | 역할 | 압축 빌드(`tools/build_assets.ts`) |
|---|---|---|
| `model/*.glb` | mesh | meshopt(무손실), 외부 텍스처 uri → .ktx2 |
| `tex/*.png` | 3d | KTX2(밉, 색/데이터/노멀 분류) |
| `tex/*.hdr`·`*.f16.bin` | keep | 사전 압축만(br·gz) |
| `anim/`·`cam/`·`ui/*.json`·`msg/`·`manifest.json`·`collision.json` | json | 공백 제거 + 사전 압축 |
| `fx/tex/*.png` | 3d | KTX2(밉) |
| `fx/*.bfres`·`data/*.csv·*.msgpack` | keep | 복사(+ 사전 압축) |
| `data/*.json` | json | 공백 제거 |
| `ui/tex/*.png` | ui | KTX2(밉 없음, UI 기준) |
| `sound/*.wav` | audio | ogg+m4a(손실). sound.json 의 `bgm{SM_BGM_…}` 항목은 BGM 조각 스트리밍(04_sound.md §12) |

그 밖 기존 화면 폴더는 지금처럼 `TEX3D_ROOTS` 목록을 따른다.

---

## 9. 기존 산출물과 비교 [실행]

같은 원본을 새 코어로 변환해 scratch 에 쓰고(`--out`, 기존 폴더 안 건드림) 바이트를 비교했다. 시험 6절이 중간 출력(`analysis/asset_convert/`)으로 같은 비교를 다시 한다.

| 대상 | 같음 | 다름 | 새 쪽에만 | 옛 쪽에만 | 설명 |
|---|---|---|---|---|---|
| mg1801 모델 glb ↔ `assets/mg1801/model` | 40 | 0 | 3 | 0 | line00·line01·stool00 — mg1801_web_models 가 뺀 것(코어는 아카이브 전부, 배치는 어댑터 몫) |
| mg1801 텍스처(게임 폴더에 나간 것 140) ↔ `assets/mg1801/tex` 139 | 139 | 0 | 1 | 0 | line_alb(line00 모델 것) |
| mg1801 재질 애니 water00.fmab | 1 | 0 | 1 | — | line01.fmab. 위치만 다름(옛 = model/, 새 = anim/) |
| mg1801 textures.json(옛 model/ 안) | — | — | — | 1 | 새 코어는 manifest.textures 로(같은 files·srgb·cube + format·w·h) |
| 광장 menu00_carpet00·ocean00·deco_tree05 glb ↔ `assets/plaza/world/model` | 3 | 0 | 0 | — | |
| 그 세 모델 텍스처 ↔ `assets/plaza/world/tex` | 27 | 0 | 0 | — | 1024 초과 텍스처가 있는 모델이면 광장 쪽 축소로 다르다(§6) |

결론: 같은 원본 파일은 **바이트까지 같다**. 다른 것은 모두 "무엇을 고르느냐"(어댑터 몫)다.

---

## 10. 결과 [실행 2026-10-09]

`mg_assets.py mg0508 mg0106 mg0101 mg0122 mg0102`(중간 변환 캐시 없을 때 게임당 15~60 초, 캐시 있으면 3~10 초 — 대부분 소리 렌더).

| 게임 | 파일 | 소스 MB | 모델 | 배치(P0) | 카메라 | 그래프(재사용/판독 대기) | UI 레이아웃·글 | 소리 SE·BGM | 이펙트 세트 | 충돌 | 데이터 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mg0508 | 175 | 64.3 | 17 | 8 (7) | 2 | 0 / 18 | 3·4 | 13·1 | 4 | — | 0 |
| mg0106 | 204 | 81.0 | 17 | 46 (45) | 4 | 0 / 5 | 0·4 | 10·1 | 8 | — | 3 |
| mg0101 | 286 | 212.1 | 57 | 149 (13) | 6 | 0 / 56 | 0·3 | 28·1 | 17 | 2 | 1 |
| mg0122 | 249 | 71.1 | 32 | 18 (2) | 2 | 1 / 8 | 5·6 | 18·1 | 4 | 2 | 5 |
| mg0102 | 154 | 55.3 | 8 | 2 (2) | 2 | 0 / 19 | 1·3 | 3·1 | 2 | — | 2 |

소스 용량의 대부분은 텍스처 PNG·HDR 와 소리 wav(BGM 1곡 10 MB 안팎)다. 압축본은 §10.1.

### 10.1 압축 빌드 [실행]

`npx tsx tools/build_assets.ts --only mg/` (처음 432 s, 다시 8 s). `assets-dist/report.json` 폴더 합:

| 게임 | 소스 MB | 압축본 MB(ogg 제외) | 전송 MB(사전 압축) | GPU 추정 MB 소스 → 데스크톱 |
|---|---|---|---|---|
| mg0508 | 64.3 | 25.6 | 24.1 | 201 → 52 |
| mg0106 | 81.0 | 35.6 | 28.2 | 164 → 41 |
| mg0101 | 212.1 | 66.9 | 47.9 | 146 → 40 |
| mg0122 | 71.1 | 28.3 | 24.7 | 172 → 48 |
| mg0102 | 55.3 | 30.0 | 15.2 | 157 → 43 |

압축 분류는 converted.json 으로 자동이었다: 게임 폴더 `tex/` 362장 = color 120·data 149·normal 90·keep 33(큐브·LUT·4의 배수 아님), `fx/tex/` 50장 = 3D(color 2·data 47·keep 1), `ui/tex/` 6장 = ui 2·keep 4. 게임 BGM 5곡은 sound.json 의 `bgm{SM_BGM_…}` 로 조각 스트리밍이 붙었다.

## 11. 시험

`tools/test_mg_assets.ts`(노드, 헤드리스 없음): 게임 5개 manifest 유효성·참조 파일 존재(404 0)·glb 로드(three GLTFLoader, 텍스처 대신 빈 텍스처)·셰이더 그래프가 graph.ts 형식인지(graphSource 로 GLSL 조각 생성)·공용 폴더 중복 0·mg1801 비교 표·로더 단계 묶음(mgStagePlan·mgStageP0Paths)·카메라 클립 형식·경계(import) 검사.

결과 [실행 2026-10-09]: **1818/1818 통과** — 참조 2,353개 없음 0, glb 131개 로드(메시·클립) 문제 0, 그래프 1(재사용)·판독 대기 106(SASS 준비 확인), 공용 폴더(색인 400) 같은 바이트 0, mg1801·광장 비교 §9, mg0101 등급 P0/P1/P2/P3 = 13/2/134/0.
기존 시험 26개 전체 1회 통과, `tsc`·`npm run build` 통과.

### 11.1 실제 페이지 콘솔 확인 1회 [실행]

`dev/ui?ui=mgstage&mg=mg0508&auto=1`(개발 서버, 촬영 없음, 각 1분 안):

| 모드 | 요청 | 실패·404 | 콘솔 오류 | P0 준비 |
|---|---|---|---|---|
| 원본(`assets=src`) | 127 | 0 | 0 (경고 1 = 헤드리스 swiftshader 의 KHR_parallel_shader_compile 없음) | 7 모델 1.2 s |
| 압축(`assets=dist`) | 162 | 0 | 0 (같은 경고 1) | 7 모델 2.4 s |

## 12. 미확정·원본에서 판독이 필요한 칸

| 칸 | 지금 | 필요한 근거 |
|---|---|---|
| 표 없는 게임의 배치 | 이름 규칙 [추정] | 게임별 SyncedSetupGame/MapImpl 판독(게임 문서) |
| 기본 애니 루프 여부 | 같은 이름 클립·fmab 루프 [추정] | 게임별 ComAnimator/PlayAnim 호출 |
| nbmap 트랜스폼 로컬/월드 | 부모 기준 곱 [추정] | 06_scene_data.md §3.3 |
| 셰이더 그래프 식 | 광장 해시 재사용 + 나머지 판독 대기(SASS 준비) | 그래프 재질 SASS 판독(plaza §6.8 방식) |
| VAT(정점 애니 텍스처) 재생 | 원본 half float 만 실음 | static_opt_vat_type 셰이더 판독 |
| 높이 안개 | 값만 | env 셰이더 판독 |
| 환경 변형 전환 시점(결과·오프닝) | envVariants 로 실음, 전환 안 함 | 게임별 ReceiveState 판독 |
| 충돌 속성 attr 뜻 | 원값 | CollisionLabel 대응(06 §3.3) |
| 시퀀스 효과음 | 렌더 근사 | 원본 출력 대조(04_sound.md) |

## 13. 사용자 확인 필요

(진행은 원본 쪽으로 이미 정함.)

| 항목 | 정한 것 | 이유 |
|---|---|---|
| 텍스처 축소 | 하지 않음(원본 해상도) | assets_pipeline.md §3.4·원본 에셋 그대로 규칙. 광장 변환기의 1024 축소와 다름 |
| 코어가 chara~·font~ 를 쓰지 않음 | 공용 폴더 담당 변환기 몫 | 같은 경로에 다른 내용(속성 줄이기·모션 분리 차이)을 쓰면 공용 파일이 바뀜 |
| mg0101 코스 | a0 (표 첫 칸) | 원본은 매 판 코스 선택 |
| mg0106 배치 그룹 | grp05 (GetGameStage 0) | 원본은 스테이지 값 |
| 그래프 해시 재사용 | 같은 해시면 광장 식 사용 | 같은 그래프 = 같은 식 [추정] |
| 카메라 near 하한 0.3 | 광장 FsnbCamera 와 같음 | 원본 near 0.01~0.05 는 웹 24비트 깊이에서 z 싸움 |

## 14. 사용자 체크 목록 (보기 페이지 `dev/ui?ui=mgstage&mg=<id>`)

1. `mg=mg0508`: 식탁·식탁보·철판, 도마 2개·접시 2개가 식탁 위 자리에 붙어 있는가. 시작 카메라(300 프레임)가 식탁 쪽으로 움직이고 끝나면 본편 카메라(위에서 내려다봄)로 바뀌는가.
2. `mg=mg0106`: 회전 판 위에 Boo·멍멍 등 배치 물체 39개가 판 자리에 놓이는가(grp05). 위치 표 모델(작은 표시)이 안 보이는가.
3. `mg=mg0101`: 강·절벽·폭포 배경과 코스 a0 발판이 이어지는가. `iv` 발판은 parts 가 숨고 floor 면만 보이는가.
4. `mg=mg0122`: 공원 바닥·배경·하늘(skybox)이 보이는가(사람·기믹은 런타임이라 없음).
5. `mg=mg0102`: 구체 바닥·먼 배경이 보이는가.
6. 오른쪽 아래 단추·C 키로 카메라를 바꾸고 Space 로 멈추는가. `&assets=dist` 로 압축 모드도 같은가.
7. 셰이더 그래프 재질(풀·잎·도마·접시·스테이크 등)은 판독 전이라 알베도·라이트맵 근사다(§12) — 색이 원본과 다른 것은 판독 대기 목록(`asset.pending.graphs`)으로 확인.
