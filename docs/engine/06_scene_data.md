# 06. 장면 데이터·리소스 로딩·물리

2026-10-02. 담당: scene. 상태: **분석 1차 완료**(미확정은 9절).

웹 포팅에서 "어떤 파일을 언제 싣고, 그 안의 데이터를 어떻게 읽는가"를 정한다. 그래픽 변환(03), 사운드(04), UI(05), 캐릭터 모션 재생(09)은 각 문서가 맡는다. 이 문서는 그 입력이 되는 아카이브·경로·데이터 형식을 다룬다.

확정 수준 표기:
- **[실행]**: 이 문서에서는 "파서 실행 확인"이다. 원본 게임을 돌린 것은 없다.
- **[판독]**: Ghidra 디컴파일 판독.
- **[데이터]**: 추출 파일 확인.
- **[추정]**, **[미확정]**.

주소는 SwitchLoader 기본 베이스(0x7100000000) 기준이고, 모듈 이름을 함께 적는다. 디컴파일 덤프는 `analysis/decomp/scene_*.c`에 있다.

---

## 1. 리소스 로딩

### 1.1 아카이브 파일 이름 규칙 [판독]

코드는 아카이브를 논리 이름(`mg/mg1801`, `chara/npc002`)으로 다룬다. 파일 경로는 다음 규칙으로 만든다.

```
"./Archive/" + 논리이름( '/' 와 '\' 를 '~' 로 ) + ".nx" + [ "." + 로캘 ] + ".bea"
```

| 단계 | 근거 |
|---|---|
| 앞붙임 `./Archive/`, 뒷붙임 `.bea` | main `FUN_71008dcefc` (문자열 `0x7101589817`, `0x710153e07d`) |
| `/`·`\` → `~` 치환 | main `FUN_71008dd090` |
| 플랫폼 `nx` | `romfs/ac.nx.archiveconfig` 내용 `nx`. 읽는 곳 main `FUN_71008db1c8` |
| 로캘 붙임 | `FUN_71008dcefc`의 모드 1·2. 데이터상 로캘 아카이브는 `bq.nx.<locale>.bea` 15개뿐이다 [데이터] |

| 논리 이름 | 파일 |
|---|---|
| `mg/mg1801` | `Archive/mg~mg1801.nx.bea` |
| `chara/pcMot_rhy` | `Archive/chara~pcMot_rhy.nx.bea` |
| `libca/mg_common` | `Archive/libca~mg_common.nx.bea` |
| `bq` (+ 로캘) | `Archive/bq.nx.bea`, `Archive/bq.nx.koKR.bea` |
| `libbex/libbexgfx/libexgfx_resident` | `Archive/libbex~libbexgfx~libexgfx_resident.nx.bea` |

### 1.2 BEA 헤더 refs — 쓰이지 않음 [데이터]

BEA 헤더에는 다른 아카이브를 가리키는 ref 목록 자리가 있다(+0x24 개수, +0x50 오프셋). 하지만 949개 아카이브 **전부 개수 0**이다. 확인 도구는 `web/tools/analysis/scene_bea_index.py`이고, 결과는 `extracted/converted/scene/bea_refs.tsv`와 `bea_index.json`(아카이브별 파일·타입·플래그)이다.

- 결론: 아카이브 사이의 의존은 파일에 없다. **코드가 정한다**(1.4~1.6).
- 6개는 파일 0개짜리 빈 아카이브다: `_ResidentFont`, `_ResidentGuiLayout`, `_ResidentLocalizeMessage`, `_SystemAudio`, `_SystemGuiLayout`, `_SystemPhysics`. 그래서 `extracted/bea`에는 943개만 있다.

ASST 항목의 `unk`/`unk2` 필드(+0x10, +0x12)는 에셋 분류와 일대일이다 [데이터].

| unk2 | 타입 |
|---|---|
| 2 | `_TEXREF`, `_FXTRIG`, 데이터(json·csv 등) |
| 3 | 애니(`_G3DSKA`·`MAA`·`VBA`·`SHA`·`SNA`), `_ENTITY`, 일부 `_G3DMDL` |
| 4 | `MPAT`, `_RTTS` |
| 5 | (빈 타입) 16개 |
| 7 | `_PHYSX` |
| 9 | `_TEXDATA` |
| 12 | `_G3DMDL`, 셰이더, `_VFX2`, `_LAYOUT` |

사운드 아카이브(`_ADDAUD`·`_MAINAUD`)만 unk = 258이고 나머지는 2다. 이 값을 로딩에 어떻게 쓰는지는 **[미확정]**이다(로드 순서나 메모리 풀 구분으로 추정).

### 1.3 경로 문자열 → 파일 해석 [판독 + 데이터]

- 아카이브 안 파일 이름은 **전역 가상 경로**다. 예: `mg/mg1801/model/mg1801_knife00.fmdb`. 게임 코드는 아카이브 이름 없이 이 경로만 넘긴다.
  - mg1801 `MapImpl::Initialize`: `AddComponent<ComMatter>("mg/mg1801/env/mg1801_env.fmdb")`
  - mg0101: `actor::Util::LoadNbmap("mg/mg0101/map/mg0101_fld0_col.nbmap")` (mg0101.nro.c:15202)
  - 존재 확인은 `nn::bezel::AssetModule::ExistsAsset(path)`, 읽기는 `CreateFileView(path)`다.
- 다른 아카이브의 파일도 같은 방식으로 경로만으로 참조한다 [데이터].
  - `kb/kb01/data/kb01_camera.json`의 `anim.path`는 `kb/kb00/env/kb00_cam_op_00.fsnb`다(kb00 아카이브 파일).
  - 보드의 `bd01_MapStructure.json`은 `bd\bd01\model\…`처럼 **역슬래시** 경로를 쓴다.
- 확장자 없는 경로를 쓰기도 한다. 예: `mg/mg1801/env/mg1801_cam00`(카메라 애니), `common/model/cmm_cam00`. 엔진이 형식별 확장자를 붙인다 **[추정]**.
- `.ftxb`(`_TEXREF`)는 내용 전체가 짝 `.bntx`의 역슬래시 경로 문자열이다. 예: `mg\mg1801\model\textures\mg1801_knife00_alb.bntx` [데이터].
- 같은 경로가 여러 아카이브에 들어 있는 경우가 1,531개다 [데이터].
  - 예: `_Materials/textures/common_decal_shadow00.bntx`는 pc·npc 아카이브 거의 전부에 있다.
  - 예: `mg/mg1702/model/mg1702_manhole_cover.fmdb`는 `bd~qtbd05`와 `mg~mg1702` 양쪽에 있다.
  - 아카이브가 스스로 완결되도록 복사해 둔 것이다. 엔진은 경로로 하나만 쓴다 **[추정]**.

**웹 규칙.** 변환기는 이렇게 만든다.
- 에셋을 아카이브와 무관하게 **전역 경로 키**로 저장한다.
- 게임별 manifest는 "필요한 아카이브 목록"(1.7 표)에서 경로를 모은다.
- 역슬래시는 `/`로 정규화한다.
- 중복 경로는 처음 것 하나만 쓴다.

→ 정리본: [17_actor.md](17_actor.md) §2, 8.6

### 1.4 `bq::ArchiveModule` 범주(로더) [판독]

`bq::ArchiveModule` 생성 함수(main `FUN_71001d4714`)가 엔진 로더 9개를 이름으로 만든다. 범주 번호는 `this+0x28 + 범주×8`의 순서다.

| 범주 | 로더 이름 | 쓰는 곳 |
|---|---|---|
| 0 | `bq_System` | 상주. `font/font*`, `bq`, boot가 넣는 캐릭터·오브젝트 전부(1.6) |
| 1 | `bq_Minigame` | 미니게임 본 아카이브 `mg/<이름>` |
| 2 | `bq_MinigameCommon` | 미니게임 묶음 공용 `mg/mg1000`, `mg/mg1800`, `kb/kbmg` |
| 3 | `bq_Mode` | 모드 아카이브 `ca/…` `kb/…` `rc/…` `extra/…` `flow/…` `mgm/<이름>`, 리듬 NPC 캐시 |
| 4 | `bq_ModeCommon` | `ca/ca00` `kb/kb00` `extra/pp00` `mgm/mgm00` |
| 5 | `bq_Flow` | `menu/<이름>`, `flow/matching…` |
| 6 | `bq_FlowCommon` | `menu/menu_common`, `menu/menu_playstyle` |
| 7 | `bq_Player` | 장면 플레이어 모션 `chara/pcMot_*` |
| 8 | `bq_CharaCommon` | 장면 NPC `chara/npc%03d` |

| 함수 (main) | 동작 |
|---|---|
| `EntryArchive(cat, name, sync)` @0x71001d493c | 범주 0(상주)에 이미 있으면 아무것도 안 한다. 아니면 해당 로더에 이름을 넣는다(`FUN_7100109920`). sync=1이면 그 자리에서 읽는다(`FUN_7100109428`) |
| `LoadAsync(cat)` @0x71001d4a50 | 등록만 되고 아직 안 읽힌 항목을 비동기로 읽기 시작(`FUN_7100109020`) |
| `IsLoading(cat)` @0x71001d4a5c | 로더가 끝났는지 |
| `ReleaseAll(cat, …)` | 범주를 비운다 |
| 로더 항목 추가 `FUN_7100109920` | 같은 이름이 있으면 참조 수를 +1 한다. 없으면 `ArchiveInfo`(0x50 B)를 만들어 붙인다 |

### 1.5 장면이 아카이브를 싣는 경로 [판독]

**장면 분류** `SceneCategory` (main `FUN_710029e4fc`, 장면 이름 문자열로 판정)

| 값 | 조건 | 예 |
|---|---|---|
| 0 | `mg`로 시작, 셋째 글자가 `m`이 아니고 `Test` 미포함 | `mg1801` |
| 1 | `mgm…` | `mgm01` |
| 2 | `bd…` | `bd01` |
| 3 | `caet` 포함 또는 `ca<숫자>` | `ca01` |
| 4 | `kb…` | `kb01` |
| 5 | `rc…` | `rc_stage01` |
| 6 | `mf…` | `mf01` |
| 7 | `pp…` | `pp01` |
| 8 | `menu` 포함 | `menu01` |
| 9 | `matching` 포함, `op`·`ed`로 시작, `boot` | |
| −1 | 그 밖 | `gyroPadChange` |

**`bq::SceneBase::OnEntry` @0x71002c9f68 → `FUN_71002ca17c(this, 분류, 이름)`**

| 분류 | 하는 일 |
|---|---|
| 0 (미니게임) | `RefreshControlPlayerArchives()`(빈 함수) → `SceneLoadAsync(1, 이름)`, `SceneLoadAsync(2, 이름)` |
| 3~7 | 범주 5·6 해제 → `SceneLoadAsync(3, 이름)`, `SceneLoadAsync(4, 이름)` |
| 8~9 | `SceneLoadAsync(5)`, `(6)` → `(3)`, `(4)` |
| 1, 2, −1 | `SceneLoadAsync` 하지 않음. 미니게임 모드(mgm)는 `bq::MinigameModeScene::BeginScene` @0x710035fab8이 `EntryArchive(4,"mgm/mgm00",1)`과 `EntryArchive(3 또는 4, "mgm/<이름>", 1)`로 직접 싣는다. 보드(bd)는 미추적 **[미확정]** |
| 공통 끝 | 가상 +0x190 = **`LoadPlayerMotionArchive(분류, 이름)`** |

**`bq::ArchiveModule::SceneLoadAsync(cat, name)` @0x71001d4b60**

| 범주 | 규칙 |
|---|---|
| 1 | `"mg/" + name` (name이 `mgInst`로 시작하면 하지 않음). **범주 1의 다른 항목은 해제**(`FUN_7100109700`) |
| 2 | name 안의 첫 숫자열 N이 1000~1099면 `mg/mg1000`, 1800~1899면 `mg/mg1800`, 1400~1499면 `kb/kbmg` |
| 3 | `ca*`·`kb*`·`rc*` → `"<접두>/" + name`. `mf*`·`pp*` → `"extra/" + name`. `op`·`ed`·`boot` → `"flow/" + name` |
| 4 | `ca*` → `ca/ca00`, `kb*` → `kb/kb00`, `pp*` → `extra/pp00` |
| 5 | `menu*` → `"menu/" + name`. `menu00`이면 `menu/menu02~06`도. `matching*` → `"flow/" + name` |
| 6 | `menu*` → `menu/menu_common`. `menu01`이면 `menu/menu_playstyle`도 |
| 끝 | `LoadAsync(cat)` |

**`bq::SceneBase::LoadPlayerMotionArchive(분류, 이름)` @0x71002cafc8**

| 분류 | 모션 목록 키 |
|---|---|
| 0 | 장면 이름(예 `mg1801`) |
| 1~4 | `mode` → 이어서 `etc` |
| 6 | `mf01` |
| 7 | `pp00` |
| 5, 8, 9 | 없음 |

- 키 목록은 `bq.nx.bea common/data/pcMotionArcList.json`에서 찾는다(`FUN_710021c6c0`).
- keyList의 각 키 k마다 `"chara/pcMot_" + k`가 있으면(`AssetModule` 확인 `FUN_71008de52c`) 범주 7로 `EntryArchive`한다.
- 끝에 범주 7·8 `LoadAsync`(`FUN_71001d5c34`)를 부른다.

**장면 쪽 추가 등록**

| 함수 | 동작 |
|---|---|
| `bex::GameScene::AddLoadArchive(name)` @0x71001c9ffc | 장면 자신의 목록(`this+0x28` 객체의 +0x10 vector)에 이름을 넣고, 시스템 로더(`bex::ArchiveModule::GetSystemLoader`)에도 넣는다. vtable +0xF8 |
| `bex::GameScene::IsLoadCompleted` | vtable +0x100. 장면 로더 +0x18 가상 함수 |
| `bq::SceneBase::IsLoadingArchive` @0x71002cb064 | 범주 1~6 중 하나라도 로딩 중이면 1. 아니면 범주 7·8 확인(`FUN_71001d5ca8`) |
| `bq::SceneBase::OnLoaded` @0x71002ca37c | 단계 0에서 `LoadAsync(7)`, `(8)`. 단계 1에서 가상 +0x198(IsLoadingArchive)과 사운드 모듈 로딩이 모두 끝나면 다음으로 |

### 1.6 상주 아카이브 [판독 + 데이터]

| 넣는 곳 | 아카이브 |
|---|---|
| `bq::ArchiveModule` 생성 (main `FUN_71001d4714`) | 언어별 `font/font`·`font/font_kr`·`font/font_cn`·`font/font_tw` 중 하나(컬처 0xC=kr, 0xD=cn, 0xE=tw), `bq` (동기) |
| `boot::Scene::GameFlow` (boot.nro @0x7100004520) | `chara/pc%02d` **22개 전부**(PlayerCharacterID 0~21의 Number), `mg/mgInst`, `mg/mgResult`, `object/obj00_rengablock`~`object/obj22_joycon_hand` 19개, `PlayerMotionArcList::LoadArchiveSysData()` → 키 `co`의 목록 `co, mg, fcl, mn` = `chara/pcMot_co/mg/fcl/mn`. 끝에 `LoadAsync(0)` |
| 엔진(코드 위치 미추적) | main 문자열에 이름이 있다: `_ResidentAudio`, `_ResidentPhysics`, `_ResidentFont`, `_ResidentGuiLayout`, `_ResidentLocalizeMessage`, `_System*`, `audio`, `vib`, `message/mess`, `libbex/libbexgfx/libexgfx_resident`, `libca/common`(ca·kb 장면 생성자가 `AddLoadArchive`) **[데이터, 로드 시점 미확정]** |

`bq::CharacterDataModule::LoadData` (main @0x71001d5a0c, boot `SetupGame`에서 호출)는 다음을 읽는다.
- `common/data/characterlist.json`(`PlayerCharacterData`, `NPCCharacterData`)
- `common/data/resultCharaParam.json`
- `PlayerMotionArcList`(pcMotionArcList.json, `FUN_710021caa0`)

### 1.7 mg1801 실행에 필요한 아카이브·파일 [판독 + 데이터]

| 아카이브 | 범주 | 싣는 곳 | mg1801이 쓰는 내용 | 크기·파일 수 |
|---|---|---|---|---|
| `mg~mg1801` | 1 | OnEntry `SceneLoadAsync(1)` | 무대·채소·칼·의자 모델 47, 텍스처 115, 카메라 4, 애니 9, `_Vfx/mg/mg1801/ConvertList.xml`(`mg1801_water_entry00/01`, `mg1801_steam00/01`), `layout.lyt`, 셰이더 팩, 채보 3 | 16.6 MiB / 299 |
| `mg~mg1800` | 2 | OnEntry `SceneLoadAsync(2)` + `RmMgSceneBase` 생성자 `AddLoadArchive` | 리듬 공용 `mg1800_arrow00`·`ring00` 모델/애니, `layout.lyt`, `_Vfx`(`mg1800_success00/01`, `ring02` …), `mg1800_cmnparam_org.json`, `mg1800_rm_file_npclist.json` | 0.3 MiB / 13 |
| `libca~mg_common` | 시스템 | `RmMgSceneBase` 생성자 `AddLoadArchive` | 미니게임 공용 `layout.lyt`, `_Vfx`(`mg_common_star_00/01`, `ring_00`, `pt_effect_00`) | 5 |
| `chara~pcMot_rhy` | 7 | `LoadPlayerMotionArchive(0,"mg1801")` → `["rhy"]` 그리고 `RmMgSceneBase` 생성자 `PlayerMotionArcList::LoadArchive("rhy")` | `pcNN_rhy_knife_idle00`, `pcNN_rhy_knife_swing00` (22명 × fskb·fvbb·fshb·ftsb.fmab) | 11.7 MiB / 3,625 |
| `chara~pcMot_rc` | 7 | `RmMgSceneBase` 생성자 `LoadArchive("rc")` | `rc_success*`, `rc_gutspose*` 등 리듬 결과 모션. mg1801 본편 사용은 **[미확정]** | 3.2 MiB / 517 |
| `chara~npc002` | 8 | `mg1801::Scene::Scene` @0x710000e874 `LoadSceneNonPlayerCharacter(5, 0, 1)` | NonPlayerCharacterID 5 = `HEYHO` → `CharacterData::NPCNumber(5)` = 2 → `"chara/npc%03d"`. 모델 `npc002_heyho.fmdb`, 모션 `npc002_co_idle00`·`co_joyful00/01/02` | 6.3 MiB / 326 |
| `chara~pc01`…`pc62` | 0 (상주) | boot | 플레이어 4명 모델·텍스처·FX 트리거 | 각 ~7 MiB |
| `chara~pcMot_co/mg/fcl/mn` | 0 (상주) | boot | 공용·표정 모션 | |
| `mg~mgInst`, `mg~mgResult` | 0 (상주) | boot | 조작 설명(`mgInst.json`), 결과 연출(`mgResultList.json`, 결과 카메라) | |
| `bq` | 0 | ArchiveModule 생성 | `common/data/*.json`, `chara/mpat/mg1801_pc.mpat`, FX 트리거 `chara/pc/ftrgBase/ftrg/vb_pc_base.ftrg`(`VB_MG1801_JUST` 들어 있음), 공용 env | 39.1 MiB |
| `sound~subarc_rc_cmn` | 사운드 | `RmMgSceneBase` 생성자 `SoundModule::LoadSoundArchiveAsync("sound/subarc_rc_cmn")` | 리듬 공용 SE | 3.3 MiB |
| `sound~subarc_mg1801` | 사운드 | 이름 규칙 `"sound/subarc_" + MGList 이름`. 해제는 `ca::rm` `FUN_7100429760`에서 판독, 로드 지점은 **[미확정]** (04_sound) | `SQ_SE_MG1801_*` | 1.4 MiB |
| `audio` | 상주 | | `audio/settingpreset/sound_settingpreset.bspp`(`LoadSettingPreset("mg1800_cmn")`의 대상) | |
| `message~<locale>` | 상주 | | `im_mg.msbt`(`im_mg1801_name`), `mg_inst.msbt`(`inst_mg1801_ctrl00`) | |
| romfs `stream/SM_BGM_MG1801_DH.dspadpcm.bfstm` | 스트림 | 사운드 | BGM (04_sound) | |

정리하면 이렇다.
- mg1801에는 `.nbmap`, `.apx`, `database.json`이 **없다**. 무대는 `MapImpl` 코드가 경로로 모델을 하나씩 만든다.
- 리듬 NPC는 두 가지 길로 실린다.
  - `mg1800_rm_file_npclist.json`의 `"mg1801": [{"name":"Heyho"}, …]`를 `ca::rm::RmFileMan::AddMgNpcArchiveFileCache` @0x7100430880이 읽는다. `CharacterData::NPCName`과 이름을 맞춰 `NPCArchiveName`을 범주 3 캐시로 넣는다. 리믹스 등 연속 플레이용 **[추정]**.
  - mg1801 단독 실행에서는 장면 생성자의 `LoadSceneNonPlayerCharacter(5)`가 같은 `chara/npc002`를 범주 8로 싣는다.
- `rc~rc_result`에는 `rc_result_mg18NN_dish_*` 모델과 mg1801 채소 결과 텍스처가 있다. 리듬 쿠킹 모드 결과 화면용이고, 미니게임 단독 실행에서는 필요 없다 **[추정]**.

### 1.8 웹 로딩 제안

| 원본 | 웹 |
|---|---|
| 범주별 로더 + 참조 수 | 게임 시작 전에 manifest의 에셋을 모두 받는다(장면 하나 = 게임 하나). 상주(범주 0)에 해당하는 공용 에셋(캐릭터 22명 모델, 공용 모션)은 `assets/common/`에 한 번만 둔다 |
| 장면 이름 → 아카이브 규칙(1.5) | 변환 도구가 같은 규칙으로 필요한 아카이브를 정한다. 예: mg1801 = `mg/mg1801` + `mg/mg1800` + `libca/mg_common` + `chara/pcMot_rhy` + `chara/npc002` + 상주 |
| 비동기 로딩 대기(`IsLoadingArchive`) | 로직 시작 전에 `await assets.load()`. 로딩 시간은 로직 프레임에 넣지 않는다 |

---

## 2. 캐릭터 데이터

캐릭터 모델·모션 **재생** 방식은 [09_character.md](09_character.md)가 다룬다. 이 절은 데이터 구성과 ID다.

### 2.1 ID [판독 + 데이터]

**PlayerCharacterID.** `characterlist.json`의 `PlayerCharacterData` 배열 인덱스 0~21이다.
- 메모리에는 항목당 0x940 B로 읽힌다(`CharacterData::PCNumber` @0x71001d65d8: `id < 0x16`, `+id*0x940+0x44`).
- `bq::GetPlayerCharacterIDList` @0x7100323860 = `[0..21]`, `GetPlayerCharacterIDCount` = 22.

| ID | 키 | Number | 아카이브 | 기본 경로 | 이름(ko / en) | height |
|---|---|---|---|---|---|---|
| 0 | MARIO | 1 | `chara/pc01` | `chara/pc/pc01_mario` | 마리오 / Mario | 1.54 |
| 1 | LUIGI | 2 | `chara/pc02` | `chara/pc/pc02_luigi` | 루이지 / Luigi | 1.73 |
| 2 | PEACH | 3 | `chara/pc03` | `chara/pc/pc03_peach` | 피치 / Peach | 1.80 |
| 3 | DAISY | 4 | `chara/pc04` | `chara/pc/pc04_daisy` | 데이지 / Daisy | 1.78 |
| 4 | WARIO | 5 | `chara/pc05` | `chara/pc/pc05_wario` | 와리오 / Wario | 1.67 |
| 5 | WALUIGI | 6 | `chara/pc06` | `chara/pc/pc06_waluigi` | 와루이지 / Waluigi | |
| 6 | YOSHI | 7 | `chara/pc07` | `chara/pc/pc07_yoshi` | 요시 / Yoshi | 1.69 |
| 7 | KINOPICO | 8 | `chara/pc08` | `chara/pc/pc08_kinopico` | 키노피코 / Toadette | 1.20 |
| 8 | KINOPIO | 9 | `chara/pc09` | `chara/pc/pc09_kinopio` | 키노피오 / Toad | 1.20 |
| 9 | ROSETTA | 11 | `chara/pc11` | `chara/pc/pc11_rosetta` | 로젤리나 / Rosalina | |
| 10 | DK | 12 | `chara/pc12` | `chara/pc/pc12_dk` | 동키콩 / Donkey Kong | 1.65 |
| 11 | CATHERINE | 13 | `chara/pc13` | `chara/pc/pc13_catherine` | 캐서린 / Birdo | 1.69 |
| 12 | PAULINE | 14 | `chara/pc14` | `chara/pc/pc14_pauline` | 폴린 / Pauline | 1.90 |
| 13 | KOOPA | 50 | `chara/pc50` | `chara/pc/pc50_koopa` | 쿠파 / Bowser | |
| 14 | KURIBO | 51 | `chara/pc51` | `chara/pc/pc51_kuribo` | 굼바 / Goomba | 1.02 |
| 15 | HEYHO | 52 | `chara/pc52` | `chara/pc/pc52_heyho` | 헤이호 / Shy Guy | 1.22 |
| 16 | NOKONOKO | 53 | `chara/pc53` | `chara/pc/pc53_nokonoko` | 엉금엉금 / Koopa Troopa | 1.40 |
| 17 | CHOROPOO | 54 | `chara/pc54` | `chara/pc/pc54_choropoo` | 쪼르뚜 / Monty Mole | 1.15 |
| 18 | KOOPA_JR | 56 | `chara/pc56` | `chara/pc/pc56_koopa_jr` | 쿠파주니어 / Bowser Jr. | 1.52 |
| 19 | TERESA | 58 | `chara/pc58` | `chara/pc/pc58_teresa` | 부끄부끄 / Boo | 1.53 |
| 20 | GABON | 61 | `chara/pc61` | `chara/pc/pc61_gabon` | 가봉 / Spike | 1.25 |
| 21 | HAKKUN | 62 | `chara/pc62` | `chara/pc/pc62_hakkun` | 닌군 / Ninji | 1.25 |

- 이름 키는 `im_pc<Number 2자리>_name`이다(메시지 koKR/enUS) [데이터].
- height 빈칸은 이 표에 옮기지 않은 값이다. 원본은 `characterlist.json`을 본다.

**NonPlayerCharacterID.** `NPCCharacterData` 배열 인덱스 0~111이다(`NPCNumber` @0x71001d6c50: `id < 0x70`, 기준 오프셋 0xCB80 = 22×0x940).
- 한 NPC 번호에 변종 여러 개가 있다. 예: 1~4 = KURIBO, KURIBO_GOLD, KURIBO_PAINT, KURIBO_BANDANA가 모두 `chara/npc001`.
- **mg1801의 5 = `HEYHO`(Number 2, `chara/npc002`, `chara/npc/npc002_heyho`)**. 6~10은 HEYHO_PROPELLER·ZENMAI·POSTMAN·STATION·ARCHER다.

**mg1801 의자 마스크 해석** [판독 mg1801.nro.c:10015 + 데이터]. `GetCharacterID()`를 PlayerCharacterID 비트로 본다.

| 마스크 | 의자 | 들어 있는 캐릭터(PlayerCharacterID) |
|---|---|---|
| `0x32C180` | stool01 (y 0.838) | 7 KINOPICO, 8 KINOPIO, 14 KURIBO, 15 HEYHO, 17 CHOROPOO, 20 GABON, 21 HAKKUN |
| `0x7F7C9D3` | stool02 (y 0.568) | 위 + 0 MARIO, 1 LUIGI, 4 WARIO, 6 YOSHI, 11 CATHERINE, 16 NOKONOKO, 18 KOOPA_JR |
| `0x7FFDDDF` | stool03 (y 0.218) | 위 + 2 PEACH, 3 DAISY, 10 DK, 12 PAULINE, 19 TERESA |
| 해당 없음 | 의자 없음 | 5 WALUIGI, 9 ROSETTA, 13 KOOPA |

- 앞 마스크부터 검사하므로 작은 캐릭터일수록 높은 의자에 앉는다. 키(height) 순서와 맞는다.
- 마스크에 비트 22~26이 켜져 있지만 PlayerCharacterID는 21까지다. 쓰이지 않는 비트로 본다 **[추정]**.

### 2.2 `characterlist.json` 필드 [데이터]

항목마다 키가 85개다. 그룹별로 정리한다.

| 그룹 | 키 | 뜻 |
|---|---|---|
| 식별 | `charaname`, `Number`, `text label`, `team`, `sound_no`, `body_type` | 키 이름, 파일 번호, 이름 메시지 키 |
| 경로 | `archive`, `base directory`, `fmdb m1`, `fmdb light`, `motion directory`, `motion filename prefix[p]`, `attribute filename prefix[p]`, `external_path`, `anim transit table` | 모델 = `base directory/fmdb m1`, 모션 = `base directory/motion filename prefix[p]` + 모션 이름 + 확장자. 예: `chara/pc/pc01_mario/` + `motion/pc01_` + `rhy_knife_idle00` + `.fskb`. 파일 존재와 일치한다 [데이터]. 조립 코드는 판독하지 않았다 |
| 부착 | `attach model[p]`, `attach bone`, `attach_offset_trans_*`, `attach_offset_rot_*`, `create_with_attach`, `item_1*`, `item_2` | NPC 소품(`CharacterData::NPCAttachModelFilePath`, `NPCItemPath` 등) |
| 몸 색 | `body_color_material`, `body_color_shader`, `body_color_no` | |
| 크기·배치 | `IndividualScale`, `IndividualBigScale`, `width`, `height`, `space_width`, `shadow_size`, `board_height`, `ride_height`, `flat_scale`, `bubble_radius`, `bubble_float_y`, `amiibo_*` | |
| 머리 추적 | `head_min_*`, `head_max_*`, `head_offset_x`, `head_weight`, `head_chincoef` | `CharacterData::PCHeadControlLimitMax`, `PCHeadControlWeight` |
| 눈 | `eye0_*`, `eye1_*` (material, shaderparam, t_offset/scale/rot/min/max) | 눈동자 UV 이동 |
| 캐릭터 선택 | `chara_select_target_bone`, `chara_select_rotate_degree`, `chara_select_distance` | |

`anim transit table`은 모든 항목이 `anim_transit.mpat`인데, 그런 파일은 없다. 실제 전이표는 2.5의 `chara/mpat/*.mpat`이다 [데이터].

### 2.3 `chara~pcNN` 구조 [데이터]

예시는 pc01, 41개 파일이다.

| 경로 | 내용 |
|---|---|
| `chara/pc/pc01_mario/model/pc01_mario.fmdb` | 본 모델 (`fmdb m1`) |
| `chara/pc/pc01_mario/model/pc01_mario_light.fmdb` | `fmdb light`. 캐릭터 전용 라이트 리그로 추정 **[추정]** — 03_graphics |
| `…/model/textures/pc01_{body_arr_alb,body_arr_nml,body_cvt,body_mtl,body_rgh,eye_arr_alb,eye_nml,lut_arr,wet_mask}.bntx`(+`.ftxb`) | 텍스처. `_arr_`는 배열 텍스처(docs/01) |
| `chara/pc/pc01_mario/ftrg/{fx,rc,se,vb,vo}_pc01_mario[_base\|_fake].ftrg` | FX 트리거(이펙트·리듬·SE·진동·보이스) — 05_ui_input |
| `_chara/pc01.bnbshpk` | 셰이더 팩 |
| `_Materials/textures/cha_{body,foot}_{hgt,vlc}.bntx`, `common_decal_shadow00.bntx` | 공용 재질 텍스처(아카이브마다 복사) |

- **pc 아카이브에는 모션이 없다.** 모션은 전부 `chara~pcMot_*`에 있다.
- NPC 아카이브(`chara~npc002`)는 모델 3개(`npc002_heyho`, `npc002ar_heyho`(궁수), `npc002st_heyho`(역무원)), `.apx` 1개(5.3), 모션 134개(`npc002_<모션>.fskb/.fvbb`), FX 트리거 7개다.

### 2.4 모션 아카이브 [데이터 + 판독]

- `chara~pcMot_<key>.nx.bea`는 **85개**다. `pcMotionArcList.json`에 나오는 키 85종과 1:1이다.
- 파일 경로 규칙: `chara/pc/pcNN_<영문이름>/motion/pcNN_<key>_<동작><번호>[a|b].<ext>`
  - 69,737개 전수 검사에서 동작 이름이 `<key>_`로 시작한다. 예외는 `pmg`·`wmg` 아카이브의 `bd_*` 16개 [실행: 검사 스크립트].
  - 22명 전부 들어 있다.

| 확장자 | 수 | 종류 |
|---|---|---|
| `.fskb` | 18,910 | 스켈레탈 애니 |
| `.fvbb` | 18,825 | 본 가시성 |
| `.ftsb.fmab` | 18,020 | 머티리얼 애니(텍스처 SRT·패턴, 표정용 추정) |
| `.fshb` | 13,763 | 셰이프 애니 |
| `.fmab` | 219 | 머티리얼 애니 |

**`common/data/pcMotionArcList.json`** (`{"PlayerMotArcList":[{name, keyList}]}`, 91항목)

| name | keyList | 쓰는 곳 |
|---|---|---|
| `co` | co, mg, fcl, mn | boot 상주(`LoadArchiveSysData`, 범주 0) |
| `mode` | bd, coin, md, kb, rc | 분류 1~4 장면 |
| `etc` | bq | 분류 1~4 장면(`mode` 다음) |
| `pp00` | pp | 분류 7 |
| (`mf01`) | **목록에 없음** | 분류 6이 이 키를 찾지만 항목이 없어 아무것도 싣지 않는다(`FUN_710021c6c0`는 −1이면 건너뜀) |
| `all` | 키 85개 전부 | 쓰는 곳 미확인(디버그용 추정) **[추정]** |
| `mg####` (86개) | 미니게임별. 예 `mg0101`: maze, `mg1801`~`mg1810`: rhy | 분류 0 장면 |

**모션 이름 → 파일.**
- 게임 코드는 접두 없는 이름(`rhy_knife_idle00`, `co_idle00`)을 쓴다.
- 캐릭터 컴포넌트가 `motion filename prefix[p]`(예 `motion/pc01_`)를 붙인다.
- mpat 설정 함수(main `FUN_71002b3a30`)는 끝에 `"%s_"`(예 `pc01_`)를 접두로 등록한다(`FUN_7100105a2c`) [판독]. 그 의미는 09_character에 넘긴다.

### 2.5 모션 전이표 `.mpat` (`MPAT`, 매직 `tapm`) [판독 + 실행]

**경로 선택** (main `FUN_71002b3a30`): 장면 이름 S, 캐릭터 키 C(예 `pc01`, `npc002`), C에서 숫자 앞까지 C'(예 `pc`, `npc`). 다음 순서로 존재하는 것을 **모두** 등록한다(`FUN_710010589c`).

1. `chara/mpat/S_C.mpat`
2. `chara/mpat/S_C'.mpat`
3. `chara/mpat/sys_C.mpat`
4. `chara/mpat/sys_C'.mpat`

`bq.nx.bea`에 111개가 있다. 예: `mg1801_pc.mpat`, `sys_pc.mpat`, `mg0101_npc002.mpat`, `sys_npc103.mpat`.

**형식** (`web/tools/analysis/scene_mpat.py`, 111개 전부 파싱, 남는 바이트 0)

| 오프셋 | 타입 | 내용 |
|---|---|---|
| 0x00 | char[4] | `tapm` |
| 0x04 | u32 | 버전 1 |
| 0x08 | u64 | 표1 오프셋 |
| 0x10 | u64 | 표1 항목 수 |
| 0x18 | i64 | 표2 오프셋 (−1 = 없음) |
| 0x20 | u64 | 표2 항목 수 |
| 0x28~ | | 문자열 풀(NUL 종결) |
| 항목 0x30 B | u64 from 이름 오프셋(−1 = 아무 모션), u64 to 이름 오프셋, u32 **a**, i32 b, f32 c, u32 d, i64, i64 e | |

| 필드 | 값 분포 | 해석 |
|---|---|---|
| a | 24(141), 0(61), 20, 30, 16, 12, 18, 2, 48, 32, 60 … | 전이 보간 프레임 **[추정]** |
| b | −1(610), 3(3), 4(1) | **[미확정]** |
| c | 0.0, 1.0(1개: `co_run00`→`mmt_hurdle_goal00`) | **[미확정]** |
| d, e | 0, −1 | 미사용으로 보임 |

- 표2는 6개 파일에만 있고 항목이 전부 이름 −1·값 0이다.
- `mg1801_pc.mpat`는 3항목이다 [데이터].

| from | to | a |
|---|---|---|
| `rhy_knife_swing00` | `rhy_knife_idle00` | 1 |
| `rhy_knife_idle00` | `rhy_knife_swing00` | 1 |
| `rhy_knife_swing00` | `rhy_knife_swing00` | 0 |

웹에서는 a를 크로스페이드 프레임으로 쓰는 것을 09_character에서 확정한다.

### 2.6 그 밖의 캐릭터 관련 공용 데이터 [데이터]

| 파일(`bq.nx.bea common/data/`) | 구조 | 뜻 |
|---|---|---|
| `resultCharaParam.json` | `ResultData[22]` (`resultWinMotionWidth`, `resultEyePosY`, `resultWinTelop_*` …) | 결과 화면 배치. `CharacterData::GetResultWinMotionW` 등 |
| `selectCharacterList.json` | `CharacterList[22]` (`BtnNo`, `CameraPosition*`, `CameraFovY`) | 캐릭터 선택 카메라 |
| `objectlist.json` | `ObjectData[35]` (`name`, `archive`, `base directory`, `fmdb`, `motion filename prefix`, `env fmdb`) | ObjectID → `object/objNN_*` 아카이브(`ObjectList::ArchiveName`). mgInst의 `ObjectID_JOYCON_R` 등 |
| `face_param.json` | `FaceParam[7]` | 표정 파라미터 (09) |
| `actorparam.json` | `ActorParam[33]`, 원소 `[int,0,0,0]` | **[미확정]** |
| `charaMgTitleParam.json` | `ChMgTitleParam[10]` | 캐릭터 미니게임 타이틀 연출 |

---

→ 정리본: [17_actor.md](17_actor.md) §4.2, 8.6

## 3. 엔티티 배치 `.nbmap` (`BEEGENTY`, BEA 타입 `_ENTITY`)

### 3.1 로딩 [판독]

- `actor::Util::LoadNbmap(parent, path, bool)` main @0x71000375d0는 경로의 마지막 `/` 뒤를 엔티티 이름으로 잘라 @0x71000374a0을 부른다.
- @0x71000374a0은 `nn::bezel::ClassicMapModule::CreateMap(이름, 경로)`으로 엔티티 트리를 만든다.
- bool 인자가 1이면 만든 루트의 자식들(`ForEachChildren`)을 따로 처리한다(부모 교체로 추정 **[추정]**).
- mg0101 사용 예:
  - `LoadNbmap("mg/mg0101/map/mg0101_fld0_col.nbmap")`
  - `sprintf("mg/mg0101/map/mg0101_parts_%c_col.nbmap")` → `LoadNbmap(…, true)` (mg0101.nro.c:17844)
- 250개가 65개 아카이브에 있다. **mg1801에는 없다.**

→ 정리본: [17_actor.md](17_actor.md) §8.6

### 3.2 바이너리 구조 [실행: 파서 250개 전부 성공]

BEA·NW 계열 헤더다. 모든 오프셋은 파일 절대값이다.

| 위치 | 타입 | 내용 |
|---|---|---|
| +0x00 | char[8] | `BEEGENTY` |
| +0x08 | u32 | 버전 0x000C0000 (250개 동일) |
| +0x0C | u16 | BOM `FFFE` |
| +0x0E | u8 | alignment 3 |
| +0x16 | u16 | 첫 블록 0x38 |
| +0x18 | u32 | `_RLT` 오프셋 |
| +0x1C | u32 | 파일 크기 |
| +0x20 | u64, u64 | 루트 엔티티 포인터 배열, 개수(전부 1) |

**ENTY 블록**

| +오프셋 | 타입 | 내용 |
|---|---|---|
| 0x00 | char[4], u32, u64 | `ENTY`, 블록 크기 ×2 |
| 0x10 | u8[16] | GUID |
| 0x20 | u64 | 이름(문자열 포인터. 루트는 `NoName`) |
| 0x28 | u64 | 슬롯 배열 포인터(= ENTY+0x48) |
| 0x30, 0x38 | u64 ×2 | 0 |
| 0x40 | u8 ×4 | 슬롯 수, flagA(항상 0), **flagB**, flagC |
| 0x48 | u64[슬롯 수] | 컴포넌트 포인터 |

- flagB = 1인 엔티티 수(1,428)가 모델 컴포넌트 수(1,428)와 정확히 같다. flagB는 엔티티 종류로 추정한다 **[추정]**. 2·3·5·6·7 값의 뜻은 **[미확정]**이다.
- flagC는 0/1이다(**[미확정]**).

**문자열**: `_STR` 블록. 포인터는 `u16 길이` 위치를 가리키고, 뒤에 바이트와 NUL이 온다. `_RLT`는 재배치 표다(파서는 쓰지 않는다).

### 3.3 컴포넌트 [실행 + 데이터]

컴포넌트 첫 u32가 타입 코드다. 250개 전체 통계: 엔티티 5,853.

| 코드 | 크기 | 종류 | 레이아웃 | 수 |
|---|---|---|---|---|
| 0 | 0x30 | 트랜스폼 | u32 0, f32 pos[3], f32 quat[4](x,y,z,w), f32 scale[3], u32 | 5,394 |
| 1 | 0x90 | 모델 | u32 1, u32 0, u64 모델 경로(`…fmdb`), u64 문자열2(관측값 전부 빈 문자열), f32 ×30(앞 12개가 1,0,0,0 반복 — 의미 **[미확정]**) | 1,428 |
| 2 | 0x18 | 충돌 | u32 2, u32 0, u64 `.apx` 경로(`<아카이브>/map/<32자 해시>.apx`), u8[4] 속성, u32 0 | 2,582 |
| 5 | 0x20 | 미상 | u32 5, f32 ×7 (예 1, .5, .5, .15, 0…) | 15 (mg1003) |
| 7 | 0x18+ | 자식 목록 | u32 7, u32 0, u64 자식 ENTY 포인터 배열, u64 자식 수 | 5,644 |
| 8 | 가변 | 경로(레일) | u32 8, u32 0, u64 구간 배열, u64 구간 수. 구간 = {u64 점 배열, u64 보조, u64 점 수}. 점 레코드 형식 **[미확정]** | 209 |

**충돌 속성 u8[4]** 분포:

| 값 | 수 |
|---|---|
| (0,2,3,0) | 895 |
| (0,1,3,0) | 699 |
| (0,4,3,0) | 287 |
| (1,16,1,0) | 171 |
| (1,2,3,0) | 148 |
| (0,12,3,0) | 113 |
| … | |

CollisionLabel·PhysicsAttribute(5.2)와의 대응은 **[미확정]**이다.

**좌표.** 트랜스폼이 부모 기준(로컬)인지 월드인지 확정하지 못했다 **[미확정]**.
- mg0703 `CoinGroup000`(z 35) 아래 `Coin0`(z 65)처럼 그룹과 자식의 z 차가 일정하게 30인 사례가 있다.
- 해당 게임 코드로 확인해야 한다.

### 3.4 덤프 [실행]

`python web/tools/analysis/scene_nbmap.py --all` → `extracted/converted/scene/nbmap/<아카이브>__<이름>.json`(전체 트리), `.txt`(한 줄 요약).

mg0101 (12개). 모두 루트 `NoName` 아래 `*_col` 엔티티 하나가 트랜스폼 항등과 충돌 컴포넌트(`attr (0,4,3,0)`)를 갖는다.

| 파일 | 엔티티 | 충돌 apx |
|---|---|---|
| `mg0101_fld0_col` | `GuideSizeObject`(트랜스폼만), `mg0101_fld0_col` | `86517d7dcb956427fccc1bc484ee67d4.apx` (정점 55, 삼각형 77) |
| `mg0101_cource_{a,b,c}{0,1}_col` | 같은 이름 하나 | 각각 다른 apx |
| `mg0101_parts_{p,q,r,s,t}_col` | 같은 이름 하나 | 1,568 B짜리 apx(삼각 메시 없음, 박스 등) |

mg1801: nbmap 없음(1.7).

---

## 4. 게임 데이터 카탈로그

### 4.1 개수와 읽는 방식 [데이터 + 판독]

`python web/tools/analysis/scene_data_catalog.py --summary` → `extracted/converted/scene/data_catalog.tsv`. 열은 아카이브, 경로, 종류, 크기, 최상위 키, 모양이다.

| 형식 | 수 | 읽는 방식 |
|---|---|---|
| `.json` | 393 | `nn::bezel::JsonReader`(UTF-8 BOM). 고정 구조는 코드가 키 이름으로 직접 읽는다(예: `CharacterDataModule`이 `PlayerCharacterData` 배열). 일부는 `bq::DataBaseJsonReader::DeserializeRTTI_` @0x71001e2080 — JSON 키 = rtti `Property` 이름이고, 타입 플래그에 따라 int/float/bool/str을 `TryGet`해 `Property::set` |
| `.csv` | 258 | 게임별 코드(형식 다양. 예 `mg1804_param.csv` = `key,type,values`, `//` 주석) |
| `.msgpack` | 174 | 오디오 점프 설정·진동 (04_sound) |

`DataBaseJsonReader`를 import하는 모듈은 bd01, ed, kb01, menu00/01, mg0101, mg0202, mg0401, mg0602, mg0801, mg0802, mg1401, mg1402, mg1405, mg1406, mg1407, mg1703, mg1806, mgm01, mgm05, op다. **mg1801은 쓰지 않는다** [데이터: 함수 목록].
- 예: mg0101 `MapMgr::LoadMapData` → `ParseFromAsset` → `DeserializeRTTI<mg0101::BarData>("barPatternA|B|C")` → `{frameL, posL, frameR, posR}` 배열.

### 4.2 미니게임 `data/` 종류 [데이터]

| 종류(파일 이름 규칙) | 수 | 뜻 |
|---|---|---|
| `database.json`, `mg####_database.json` | 2 + 7 | RTTI 구조 배열 묶음. 예 mg0202 `PlayerParam`, `GameParam`, `ShakeParam`, `ObstacleParam`(Mass, Restitution …), `ComParam` |
| `mg####_rm_chart##.json`, `…##s.json` | 20 + 15 | 리듬 채보 `{1P..4P, OBJ1..4}` (mg1801.md 4.7, 02_rhythm) |
| `mg####_param.json` | 9 | 게임 파라미터. 키가 **일본어 설명문**이다(예 mg1802 `"有効判定範囲時間": 0.15`) |
| `mg####_param.csv`, `mg####_configs.csv`, `mg####_config.csv` | 5 + 12 + 9 | `key,type,values` 형 파라미터 |
| `mg####_cpu_table.csv`, `mg####_com*.csv`, `mg####_com_param.csv` | 10 + 9 + 4 | CPU 난이도 표 |
| `mg####_pattern*.json`, `e_pattern*`, `piece_pattern*`, `coin_pattern_lv*`, `stagedata*`, `course#_put` | 다수 | 스테이지·출현 패턴 |
| `mg####_question.csv`, `mg####_q#*.csv` 등 | | 퀴즈·문항 표 |
| `GameData.json` (mg0602, mg0910), `Room#Post.json` (mg0905) | | 게임별 |
| `mg1800_cmnparam_org.json` | 1 | 리듬 공용 `{"Param":{"isPerfectComDispCheckEnable":false}}` |
| `mg1800_rm_file_npclist.json` | 1 | 리듬 게임별 NPC 이름 4칸(1.7) |

### 4.3 보드·모드·메뉴 데이터 [데이터]

| 파일 | 구조 | 뜻 |
|---|---|---|
| `bd/bd0N/data/bd0N_MapStructure.json` | `MapStructure[1]`: `MapNodeJson`, `MapCameraJson`, `MapPathJson`, `MapQuestJson`, `NodeModel`, `MapModel[{DataName, FileName, Animation[]}]` | 보드 맵 입구. 다른 파일 경로를 역슬래시로 든다 |
| `bd0N_MapNode.json` | `MapNode[]`: `MassAttr`, `MassFlag`, `NodeNo`, `NextNodeNo`, `PrevNodeNo`, `BranchNodeNo0/1`, `MapNodeNo*`, `NpcNodeNo*`, `AuxNodeNo*`, `MarkNodeNo0..3`, `AuxParam0..3`, … | 칸 그래프 |
| `bd0N_MapPath.json` | `MapPath[]`: `NodeNo`, `Path[{NodeNo, Attribute, Length, Bezier[{Position0/1, Anchor0/1, Length, Ratio}]}]` | 칸 사이 베지어 경로 |
| `bd0N_MapCamera.json` | `CameraData[]`: `Type`, `Shadow`, `Dof`, `Tonemap`, `NodeNo`, `Kind`, `Time`, `Fovy`, `Center*`, `Rotate*`, `Zoom`, `LinkNodeNo0..3` | 칸별 카메라 |
| `bd0N_MapQuest.json`, `bd00_*` (ItemShop, ItemBag, ItemMass, LuckyMass, KoopaMass …) | | 보드 규칙 표(docs/01) |
| `menu0N/…/MapStructure.json`, `CameraParam.json`, `flow/ed/edMapStructure#.json` | | 메뉴·엔딩 맵 |
| `kb/kb0N/data/kb0N_camera.json` | `anim[{name,path}]`, `dof[]`, `camera[{name, dof, anim}]` | 쿠파 버스터즈 카메라 |
| `ca/ca00/data/mg_param.json`, `item_probability.json`, `ca0N_path#.json`, `ca0N_course#.json` | | 쿠파 애슬론 |
| `rc/rc_stage01/data/rc_stage01_param.json` | `StageInfo`, `WaitBeatVal` | 리듬 쿠킹 |
| `extra/pp00/data/pp00_stage%02d.json`, `pp00_pattern%02d.json`, `pp00_island0N_shadowmask.csv` | | 파타파타 모드(코드 문자열과 일치) |

### 4.4 공용 데이터 (`bq.nx.bea common/data/`, `mg~mgInst`, `mg~mgResult`, `mgm~*`) [데이터]

| 파일 | 최상위 | 필드와 뜻 |
|---|---|---|
| `mgListND.json` | `mgList[84]`, `mgSetting[84]` | 일반 미니게임 목록. `mgList`: `Name`, `DebugTitleName`(일본어), `GameRule`(VS4 29, 1VS3 12, 2VS2 12, Chara 10, Item 5, 1VS1 5, Boss 5, Extra 5, None 1), `Available`, `Classic`, `Coin`, `Tired`, `BD01Normal`, `BD01Serious`, `BD01DrawCoinDisp`, `Gyro`(−1/0/1/2), `Endless`, `CallInst`, `CallResultTest`. `mgSetting`: `OpeningSkip`, `EndingChangeCut`, `GameEndTimerPos`(None/TC/CC/TL/BC/BL/TR), `GameEndTime`(180/300), `EndlessGameEndTimerPos`, `EndlessEndTime`, `OrderShuffle`, `StatusFace`, `StatusInTiming`, `StatusOutTiming`, `TimerInTiming`, `TimerOutTiming`, `EndSeqWaitTime`, `InstLoopTiming` |
| `mgListCA.json` | `mgList[38]`, `mgSetting[38]` | 모드 전용 미니게임 목록. `GameRule`이 Athlon 12, AthlonSP 5, Busters 11, **Rhythm 10**. mg1801 행: `GameRule "Rhythm"`, `Available 1`, `Gyro 1`, `CallInst 1`, 설정은 `OpeningSkip 0`, `GameEndTime 180`, 나머지 None/0. "ND/CA"의 약자 뜻은 **[미확정]** |
| `mg/mgInst/data/mgInst.json` | `controller[28]`, `mgInst[120]`, `mgInstRank[10]` | 조작 설명. `controller`: `ID`, `Hold`(Horizontal/Vertical), `HandAnim`, `StrapAnim`, `AnimSpeed`, `Controller`(ObjectID_JOYCON_L/R), `ControllerHook`, `HeadModel`, `HeadAnim`. `mgInst`: `Name`, `Title`, `DetailExp`, `ControllerID_0..2`, `Inst_LayerID_0..2`, `Pause_LayerID_0..2`, `Gyro{0,1,2}_{A,B,C}`, `InputTitle_{A,B,…}`, `Input{0..3}_{A,B,…}`. **mg1801**: `ControllerID_0 16`(JOYCON_R Vertical), `Inst_LayerID_0 1`, `Pause_LayerID_0 11`, `Gyro0_A 1`, `Input0_A inst_mg1801_ctrl00` |
| `mg/mgResult/data/mgResultList.json` | `pattern[55]`, `list[55]` | 결과 연출. `pattern`: `Rule`, `Mode`, `Team`, `Win`, `Lose`, `Draw` → `Pattern` 번호. `list`: `Telop_1/2`, `TelopIn`, `WinLoseType`, `PosType`, `CamType`, `Pos_Normal_*`, `Pos_Overlook_*`, `Cam_Normal_*`, `Cam_Overlook_*` |
| `mgm/mgm01/data/mgm01_freeplay_mgList.json` | `gamedata[112]`, `filterdata[14]` | 자유 플레이 목록. `MgName`, `MgAll`(정렬 번호), 장르 플래그 `Mg4vs`… `MgRhythm`, `SetLock`, `SoloPlayOnly`, `OfflinePlayOnly`. mg1801: `MgAll 103`, `MgRhythm 1`, `OfflinePlayOnly 1` |
| `mgm05.json`, `mgm_dailytrial_mgpack.json`, `mgmet_info.json` | | 다른 미니게임 모드 목록 |
| `characterlist.json`, `pcMotionArcList.json`, `resultCharaParam.json`, `selectCharacterList.json`, `objectlist.json` | | 2절 |
| `musicBgmList.json`[188], `musicSetList.json`[22] | | 음악 감상(04_sound) |
| `messageWindowList.json` | `WindowData`, `CharacterData`, `MotionData`, `PositionData`, `WindowInfo`, `Emotion`, `TalkTailDirAuto` | 대화창 (05_ui) |
| `achievement`, `gamerecord`, `reward`, `rewardList`, `stampList`, `cardDesignList`, `cardStickerList`, `noticeList`, `tipsList`, `udemae`, `uiparamQuestMap` | | 기록·보상·UI(포팅 범위 밖일 가능성) |
| `audio/data/mgsound_setting.json` | `MgSoundData[104]` | 미니게임별 사운드 설정(04_sound) |

---

## 5. 물리 — PhysX `.apx`

### 5.1 형식과 판독 결과 [실행: 파서]

- `.apx`는 **PhysX 4.1.2 `PxSerialization::serializeCollectionToBinary` 결과**다.
- 기준 소스: `tools/oss/PhysX-4.1`(NVIDIAGameWorks/PhysX 4.1 브랜치, sparse checkout), `SnBinarySerialization.cpp`.
- 1,493개가 모두 같은 헤더다: 버전 `0x04010200`, 빌드 `77E92B17A4084033A0FDB51332D5A6BB`, 플랫폼 `NX64`, `markedPadding=1`.
  - 패딩은 0xCD·0x42(`B`)로 채워져 있다.
  - 포인터 자리에는 표지값 `0x12345678`이 들어 있다(NULL은 0).
  - 객체 참조는 `0x80000000|n` 값이고, 내부 참조 표로 객체 인덱스에 연결된다.

**파일 순서**(`web/tools/analysis/scene_apx.py`가 이 순서로 읽는다)

| 순서 | 내용 |
|---|---|
| 헤더 0x30 | `SEBD`, u32 버전, char[32] 빌드, char[4] 플랫폼, u32 markedPadding |
| align16 | u32 객체 수 |
| align16 | u32 manifest 수, `{u32 offset, u16 PxConcreteType, u16}`[], u32 객체 버퍼 크기 |
| align16 | import 참조 `{u64 id, u16 type}`[] (16 B) |
| align16 | export 참조 `{u64 id, u32 objIndex}`[] (16 B) |
| align16 | 내부 포인터 참조 `{u64 ref, u32 objIndex}`[] (16 B) + handle16 `{u16, u16, u32}`[] |
| align16 | 객체 버퍼(manifest offset 기준) |
| 그 뒤 | 객체마다 align16 후 `exportExtraData` |

**객체 타입 통계** (1,493개)

| 타입 | 수 |
|---|---|
| TRIANGLE_MESH_BVH33 (3) | 3,098 |
| SHAPE (7) | 3,979 |
| MATERIAL (8) | 1,509 |
| USER_1024 | 1,479 |
| RIGID_STATIC (6) | 1,105 |
| RIGID_DYNAMIC (5) | 477 |
| CONSTRAINT (9) | 48 |
| 261 | 48 |
| USER_1025 | 48 |
| CONVEX_MESH (2) | 38 |

- BVH34·높이맵은 없다.
- 261은 PhysX 확장 0x100+5다. `PxJointConcreteType` 순서상 D6 조인트로 추정한다 **[추정]**.
- USER_1024·1025는 게임 정의 객체이고 내용은 **[미확정]**이다.
- 대표 컬렉션 구성:
  - `메시, 재질, 셰이프, 정적 액터, USER_1024` 433개
  - `재질, 셰이프, 정적 액터, USER_1024` 431개
  - `재질, 셰이프, 동적 액터, USER_1024` 309개

**추출 결과**
- 삼각 메시 **3,098개 전부**, 볼록체 **38개 전부**의 정점·인덱스를 꺼냈다.
- 검사 방법:
  - 삼각 메시: 인덱스가 정점 수 안이고, 모든 정점이 저장된 AABB 안이다.
  - 볼록체: 모든 다각형 정점이 그 평면 위에 있다(오차 < 1e-2).
- 결과: `extracted/converted/scene/apx/<아카이브>__<경로>.obj` 739개, `index.json`(파일별 객체·셰이프·메시 요약). 83 MiB.

**객체 필드** (NX64 = LP64. 표본에서 맞춘 뒤 전체 분포로 검증)

| 객체 | 필드 | 검증 |
|---|---|---|
| TriangleMesh(BVH33) | +0x08 u16 type, +0x0A u16 flags, +0x18 refCount, **+0x1C nbVertices, +0x20 nbTriangles**, +0x28 vertices*, +0x30 triangles*, +0x38 AABB(center, extents), +0x50 extraTrigData*, +0x58 geomEpsilon, **+0x5C flags(bit1 = 16비트 인덱스)**, +0x60 materialIndices*, +0x68 faceRemap*, +0x70 adjacencies*, +0xA0 RTree(… **+0xF0 mTotalPages**) | 3,098개 검사 통과 |
| 추가 데이터(BVH33) | RTree 페이지(**align128**, 112 B × pages) → 정점 f32×3 → 인덱스 u16 또는 u32 ×3 → extraTrigData u8 → materialIndices u16 → faceRemap u32 (각 align16) | 같음 |
| ConvexMesh | +0x20 AABB, +0x38 centerOfMass, +0x44 u16 nbEdges(bit15 GRB), +0x46 u8 nbHullVertices, +0x47 u8 nbPolygons, +0x48 polygons*, +0x68 mNb, +0x70 bigConvexData* | 38개 평면 검사 통과 |
| 추가 데이터(Convex) | HullPolygonData 20 B ×nP `{plane n,d, u16 vref8, u8 nbVerts, u8 minIndex}` → 정점 → u8×2nE → u8×3nV → [u16×2nE] → vertexData8 u8×mNb (4 정렬) | 같음 |
| Shape | +0x70 quat(x,y,z,w) 로컬 포즈, +0x80 pos, +0x98 **PxGeometryType**, +0x9C 형상 값(box 반폭 / sphere 반지름 / capsule 반지름·반높이 / mesh scale + rot), +0xC0 메시 참조 | 형상 타입 수가 trimesh 3,098·convex 38로 메시 수와 정확히 같다. box 681, sphere 80, capsule 71, plane 11. 메시 참조가 메시 아닌 객체를 가리키는 경우 0 |
| RigidStatic | +0x90 quat, +0xA0 pos (전역 포즈) | 1,105개 전부 항등 |
| Material | +0x30 dynamicFriction, staticFriction, restitution, +0x3C u16 flags, +0x3E u8 combine | (0.5, 0.5, 0.9, 0) 1,478개, (0.5,0.5,1.0, combine 0x11) 11, (0,0,0) 8, (0.2,0.2,0.6) 7 … |

- 셰이프 로컬 포즈는 3,828개가 항등이고 151개는 아니다(박스·구 등).
- 메시 scale은 3,136개 전부 (1,1,1)이다.
- 삼각형별 materialIndices는 3,098개 메시 전부 0이다. 삼각형 단위 재질 구분은 쓰지 않는다 [데이터].

**배치**
- 맵 apx: `<아카이브>/map/<32자 해시>.apx`. nbmap 충돌 컴포넌트(3.3)가 전체 경로로 가리킨다. 월드 위치 = nbmap 엔티티 트랜스폼 × 셰이프 로컬 포즈.
- 캐릭터 apx: `chara/npc/npcNNN_*/model/*.apx`.
  - 예: npc002는 재질 2, plane+static, box+dynamic, sphere+dynamic, capsule+dynamic, constraint, D6, USER_1025.
  - 머리·몸 흔들림 같은 물리 애니용으로 추정 **[추정]**.
- main 문자열 `_nbcolm/%s.apx`, `_nbcolm/%s.json`은 실제 경로 규칙과 다르다. 쓰임새는 **[미확정]**이다.

**PC/웹에서 원본 PhysX로 직접 읽기.**
- PhysX는 플랫폼 태그가 다르면 역직렬화를 거부한다. NX64 → PC는 `PxBinaryConverter`와 양쪽 메타데이터가 필요한데, NX64 메타데이터는 없다.
- 그래서 **원본 바이너리를 그대로 PhysX에 넣는 길은 막혀 있다** [판단].
- 대신 위 파서가 기하(정점·인덱스·형상·포즈)를 모두 꺼내므로, 웹에서 다시 만들면 된다.

### 5.2 `_ResidentPhysics` 정의 CSV [데이터]

| 파일 | 내용 |
|---|---|
| `_Resident/CollisionLabelDefine.csv` | `Bit,Name`. 32비트 중 이름이 붙은 것은 1→`CollisionLabel_1`, 2→`_2`, 4→`_3`, 8→`_4`, 128→`_8`, 32768→`_16`, 2³¹→`_32`뿐이다. 나머지는 빈 이름 |
| `_Resident/PhysicsAttributeDefine.csv` | `Id,Name`. 1~5, 11~15, 101~105, 1001~1005 → `PhysicsAttribute_<Id>` |

- 머리말에 "직접 편집 금지, xlsm에서 CSV 출력"이라고 적혀 있다.
- 이름이 자리표시자라서 게임별 의미는 데이터로 알 수 없다.
- main은 `_BezelSystemResources/Physics/*.csv` 경로로 참조한다(`_SystemPhysics` 아카이브는 비어 있음). `_Resident/…` 파일이 그 대체인지는 **[미확정]**이다.
- `boot.nbinit`: `IsCcdEnabled: true`, `SolverType: PhysicsSolverType_Pgs` (docs/01).

### 5.3 웹 대안

| 안 | 내용 | 판단 |
|---|---|---|
| A. 직접 충돌 근사 | 꺼낸 OBJ·형상을 three.js 지오메트리로 싣고, 게임이 쓰는 질의(레이캐스트, 접지, 박스 겹침)만 직접 구현한다. 큰 메시는 BVH(예: three-mesh-bvh)로 가속 | **기본안.** 결정성을 지키기 쉽다(DESIGN.md 3절). 미니게임 대부분은 접지·벽 충돌 수준 |
| B. PhysX wasm(physx-js 계열, PhysX 4.1/5) | 기하를 다시 쿠킹해 강체 시뮬레이션 | 원본 PGS·CCD 설정과 같은 빌드를 맞춰도 부동소수 결과가 같다는 보장이 없다. 강체 물리가 결과를 좌우하는 게임(예: mg0202 `ObstacleParam` Mass·Torque)에만 검토 |
| C. Rapier·cannon 등 다른 엔진 | | 원본과 다른 해법이다. 시각용 물리(래그돌·흔들림)에만 |

**mg1801**
- 충돌이 없다. 물리는 엔딩의 `ComPhysicalAnimation`(시각 전용, mg1801.md 7절)뿐이다.
- 웹에서는 정해진 결과 포즈로 대신해도 로직 동등성에 영향이 없다 **[판단]**.

---

## 6. 장면 파라미터 (rtti Params)

| 항목 | 내용 | 근거 |
|---|---|---|
| 얻는 경로 | `mg1801::Scene::GetSceneParam` = vtable +0x88 = `bex::SceneBase::GetSceneParams` @0x71001a2cc8. 장면 모듈 등록부에서 장면 이름 `HashedString`으로 항목을 찾아 +0x30의 Params 인스턴스를 돌려준다(`FUN_71001a3c20`) | [판독] |
| 인스턴스 | `rtti::Typeinfo("mg1801::Params", "mg1801::Scene::Params", getPropertyList, createInstance, deleteInstance, 0x48, …, checkGuiProperty, createGuiProperty)`. 기본값은 `createInstance` @0x710000e7e4(mg1801.md 4.3) | [판독] |
| 파일 덮어쓰기 | **없다.** 근거 세 가지:<br>① mg1801 아카이브에 param 류 파일 없음 [데이터]<br>② mg1801.nro가 `DataBaseJsonReader`를 import하지 않음 [데이터]<br>③ Params 속성 이름 19개 + 타입 이름 3개의 해시를 CRC32·FNV-1/1a 32·FNV-1a 64·Murmur3·djb2·xxHash32/64로 구해 데이터 파일 3,004개(텍스처·모델·애니·사운드 본체 제외)와 mg1801.nro에서 찾았다. 0건이다(`chartNo` xxh32가 폰트 파일 글리프 영역에서 1건 우연히 맞음) [실행: web/tools/analysis/scene_hash_search.py] | [판독][데이터] |
| GUI 편집 | `checkGuiProperty`·`createGuiProperty`와 `LockParams`·`UnlockParams`(vtable +0x90/+0x98)는 개발용 실시간 편집 경로로 보인다 | [추정] |
| 다른 게임 | 파라미터 파일을 게임 코드가 따로 읽는다. 예 mg1802 `mg1802_param.json`(일본어 키), mg1804·1809 `*_param.csv`(`key,type,values`). rtti Params와는 별개다 | [데이터] |

덧붙여 같은 검색에서 `audio/settingpreset/sound_settingpreset.bspp`(매직 `BSPP`)가 **프리셋 이름의 FNV-1a 32비트 해시를 키로 쓴다**는 것을 확인했다. mg0101~mg1810 등 118개 이름이 맞는다 [데이터]. 해석은 04_sound에 넘긴다.

**웹**: Params는 `logic/data.ts`의 상수 기본값으로 둔다(mg1801.md 4.3 표). 파일에서 읽는 층은 만들지 않는다.

---

## 7. 도구·산출물·재현

| 도구 | 입력 → 출력 | 실행 결과 |
|---|---|---|
| `web/tools/analysis/scene_bea_index.py` | `romfs/Archive/*.bea` → `extracted/converted/scene/bea_index.json`, `bea_refs.tsv` | 949개, refs 전부 0 |
| `web/tools/analysis/scene_mpat.py` | `bq.nx.bea chara/mpat/*.mpat` → `scene/mpat.json` | 111개, 남는 바이트 0 |
| `web/tools/analysis/scene_nbmap.py --all` | `*.nbmap` → `scene/nbmap/*.json`, `*.txt` | 250개, 엔티티 5,853 |
| `web/tools/analysis/scene_apx.py --all` | `*.apx` → `scene/apx/*.obj`, `index.json` | 1,493개, 삼각 메시 3,098·볼록체 38 추출 검사 통과 |
| `web/tools/analysis/scene_data_catalog.py --summary` | `extracted/bea/**/*.{json,csv,msgpack}` → `scene/data_catalog.tsv` | 825개 |
| `web/tools/analysis/scene_hash_search.py` | 이름 → 해시 검색 | 3,004 파일, 176 패턴 |
| `web/tools/analysis/scene_strings.py <bin> <정규식>` | 바이너리 ASCII 문자열 + 오프셋 | main 경로 문자열 조사 |
| `web/tools/analysis/ghidra_scripts/SceneXrefDecomp.java` | 데이터 주소 → 참조 함수 디컴파일 | `scene_xref_*.c` |
| `web/tools/analysis/ghidra_scripts/SceneCallersOfExternal.java` | 이름 패턴(외부·썽크 포함) → 호출자 디컴파일 | `scene_boot.c` |

디컴파일 덤프 (`analysis/decomp/`):

| 파일 | 내용 |
|---|---|
| `scene_load.c` | GameScene·ArchiveModule·CharacterDataModule·SceneBase 로딩 |
| `scene_loader.c` | 로더 내부, 장면 분류, GetSceneParams |
| `scene_load_callers.c` | RmMgSceneBase 생성자 등 |
| `scene_xref_paths.c` | `./Archive/`, mpat, `chara/pc%02d` |
| `scene_xref_sound.c` | ArchiveModule 생성, `sound/subarc_` |
| `scene_xref_npclist.c` | `AddMgNpcArchiveFileCache` |
| `scene_arcpath.c` | 경로 조립 |
| `scene_chardata.c` | CharacterData |
| `scene_nbmap.c` | LoadNbmap, DataBaseJsonReader |
| `scene_boot.c` | boot.nro: 전용 프로젝트 `ghidra_work/scene`에 `boot.nro`를 가져옴 |

재현 명령:

```sh
cd c:/dev/mpj
.venv/Scripts/python web/tools/analysis/scene_bea_index.py
.venv/Scripts/python web/tools/analysis/scene_mpat.py
.venv/Scripts/python web/tools/analysis/scene_nbmap.py --all
.venv/Scripts/python web/tools/analysis/scene_apx.py --all
.venv/Scripts/python web/tools/analysis/scene_apx.py "extracted/bea/mg~mg0101.nx.bea/mg/mg0101/map/86517d7dcb956427fccc1bc484ee67d4.apx" --obj out.obj
.venv/Scripts/python web/tools/analysis/scene_data_catalog.py --summary
.venv/Scripts/python web/tools/analysis/scene_hash_search.py
```

PhysX 4.1 참고 소스 받기:

```sh
git clone --depth 1 --branch 4.1 --filter=blob:none --sparse https://github.com/NVIDIAGameWorks/PhysX.git tools/oss/PhysX-4.1
cd tools/oss/PhysX-4.1
git sparse-checkout set physx/source/physxextensions/src/serialization physx/source/geomutils/src physx/source/physx/src physx/include/common physx/include/geometry
```

---

## 8. mg1801 웹 구현 체크리스트

1. 에셋 manifest(`assets/mg1801/manifest.json`)에 1.7 표의 아카이브에서 쓰는 경로만 넣는다.
   - 모델·텍스처는 `mg/mg1801/**`.
   - `mg/mg1800/model/mg1800_{arrow00,ring00}`, 리듬 공용 이펙트·레이아웃.
   - 플레이어 4명의 `chara/pc/pcNN_*/model/*` + `motion/pcNN_rhy_knife_{idle00,swing00}.*`.
   - NPC `chara/npc/npc002_heyho/model/npc002_heyho.fmdb` + `motion/npc002_co_{idle00,joyful00,joyful02}.*`.
2. 캐릭터 경로는 `characterlist.json`의 `base directory`·`fmdb m1`·`motion filename prefix[p]`로 만든다(2.2). PlayerCharacterID → 의자는 2.1 마스크 표.
3. 모션 전이는 `mg1801_pc.mpat`(2.5) 값을 쓴다. 해석은 09_character.
4. nbmap·apx·database.json 은 필요 없다.
5. Params는 코드 기본값(6절).

---

## 9. 미확정 사항

| 항목 | 영향 | 필요한 근거 |
|---|---|---|
| ASST `unk`(2/258)·`unk2`의 로딩상 의미 | 없음(웹은 경로로 읽는다) | 엔진 로더 `FUN_7100109428` 이하 판독 |
| `sound~subarc_mg1801` 로드 지점 | 사운드 manifest | 04_sound 담당. `RmFileMan` 생성·`SoundModule::LoadSoundArchiveAsync` 호출자 |
| `_Resident*`·`audio`·`vib`·`message`·`libca/common` 상주 로드 시점 | 없음(웹은 미리 싣는다) | 엔진 초기화(`boot.nbinit` 해석부) |
| 모델 경로 조립 함수(`ComMatter(PlayerCharacterID)`) | 낮음(데이터와 일치 확인) | `bq::ComMatter` 생성자 판독(09_character) |
| `fmdb light` 모델의 용도 | 화면 | 03_graphics |
| mpat 필드 b·c와 a의 단위(프레임/초) | 모션 전이 | 09_character, `FUN_710010589c` 소비 측 |
| nbmap flagB/flagC, 모델 컴포넌트 f32×30, 타입 5, 경로(타입 8) 점 형식, 트랜스폼 로컬/월드 | nbmap 쓰는 게임 | 각 게임 코드의 nbmap 사용부, `nn::bezel::ClassicMapModule::CreateMap` 판독 |
| 충돌 속성 u8[4] ↔ CollisionLabel/PhysicsAttribute | 충돌 필터 | `actor::ComCollision*` 판독 |
| PhysX USER_1024/1025 내용, 객체 261 = D6 조인트 여부 | 게임 충돌 속성, 래그돌 | main의 사용자 직렬화기 등록부(`PxSerializationRegistry::registerSerializer`) 판독 |
| `_nbcolm/%s.apx` 경로의 쓰임 | 없음 | 문자열 참조 함수 추적 |
| `pcMotionArcList` `all` 항목의 쓰임 | 없음 | 호출자 |
| `mgListND`/`mgListCA`의 ND·CA 뜻 | 없음 | 이름 근거만 있음(CA = 쿠파 애슬론 계열 모드 추정) |

참고: 작업 지침 문서 `분석.txt`는 프로젝트 루트(`c:/dev/mpj/분석.txt`)와 상위 폴더 어디에도 없다. 이 문서의 형식은 `web/docs/minigame/mg1801.md`를 따랐다.
→ 정리본: [17_actor.md](17_actor.md) §11.1, 11.3
