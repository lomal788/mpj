# 렌더러 통합 — 앱 수명 WebGL 하나와 화면별 패스 계약

[설계] 2026-10-10 정적 조사본이다. 앱 수명 렌더러 통합의 근거와 이전 조건을 정리한다. 이번 변경은 이 문서뿐이며 구현 승인을 뜻하지 않는다. 폴더·의존 방향은 [DESIGN §10.1~10.7][design]을 따른다.

[후속 기록] 위 조사 당시 범위와 이후 작업을 구분한다. 광장·게임 호스트의 웹 구현은 §14, 사용자 요청으로 확인한 원본의 광장·게임·메뉴·레이아웃 UI 공용 경로와 추가 C 추출5함수는 §15에 기록한다. 기존 “신규 추출 없음” 문장은 당시 조사/구현 범위의 기록으로 보존한다. 메뉴·Lyt 통합 완료와 검증 결과는 §16에 기록한다.

[데이터] 원본·웹 실행, 헤드리스, 화면 촬영, 신규 추출, 시험 실행은 없다. 기존 판독 재사용·기존 C의 빈 판독 보충·웹 파일의 정적 읽기를 수행했다. 원본·extracted·코드·분석 파일은 수정하지 않았다. 주소는 모듈별이며 데이터에 주소를 만들지 않는다. 출처 대응은 부록 A에 둔다.

## 1. 기능 개요

[판독] 원본은 GraphicsLayer별 카메라·visibility mask·enabled·clear·attachment와 패스 등록을 구분한다. 일반 분할은 기존 레이어를 나누며 플레이어마다 기본 출력 RT를 새로 만드는 계약이 아니다. main `FUN_71000b5bd0 @0x71000b5bd0`; [감사 §3.1][audit], [분할 §5][split].

[판독] 등록 순서는 shadow 계열·culling → reflection/underwater/impostor → opaque/skybox → translucent·후속 opaque → `GuiLayoutPrePosteffect` → `Posteffect` → 후속 GUI/`TopMost`다. 이 순서만으로 GPU의 레이어·패스 중첩 제출 순서는 확정하지 않는다. main `@0x71000b5bd0`; [분할 §5][split].

[데이터] 현재 웹은 제품 직접 생성 지점 7곳과 dev 직접 생성 지점 4곳을 가진다. 한 판 호스트·광장·Lyt의 유지 렌더러와 화면마다 생기는 메뉴·Stage3D 렌더러가 섞여 있다. 생성 지점 수는 동시에 살아 있는 context 수가 아니다. [DESIGN §10.7][design], [§2.2](#sources-web).

[설계] 기본 출력 canvas와 WebGLRenderer는 앱이 소유하고 화면은 scene·camera·viewport·UI·post·화면 전용 RT를 빌려 쓴다. 2D HUD·텍스트 canvas의 존재와 WebGL context 하나 조건은 별개다. UI 합성·화면 전환 순서를 보존한다. [DESIGN §10.7 단계6][design], [로더 §14.4][loader].

<a id="sources"></a>

## 2. 자료

<a id="sources-existing"></a>

### 2.1 기존 판독·관련 함수·미확정 일괄 목록

[데이터] 문서 절과 주소를 먼저 대조해 기존 완료 판독을 재사용했다. 후속 C 추가와 기존 미확정 부분의 보충은 §2.5·3.3에 구분한다. C 보유 여부는 [INDEX.tsv][index]와 [main.nso.tsv][mainfunc]를 대조하고 허용된 C 경로의 함수 헤더만 확인했다. INDEX는 모듈 열이 없으므로 주소만으로 모듈을 결정하지 않는다.

| 수준 | 재사용 대상·모듈·주소 | 기존 문서와 C 보유 | 남은 범위 |
|---|---|---|---|
| [판독] | main `FUN_71000b5bd0 @0x71000b5bd0` | [감사 §3.1][audit]·[분할 §5][split]; INDEX의 [shader_fs_c_capture_setup.c][passc]에 헤더 있음 | 등록과 실제 제출 구분 |
| [판독] | main `SplitScreenLayerList::Apply @0x7100311030` → `FUN_7100310cdc @0x7100310cdc` | [분할 §2][split]; main 함수 목록 있음, 허용 C 헤더 없음 | 기존 viewport/enabled 계약 재사용 |
| [판독] | main `GraphicsModule::ResetAll @0x71001db630` → `FUN_71001db3b0 @0x71001db3b0` → `FUN_71000603a4 @0x71000603a4` | [분할 §3][split]; main 함수 목록 있음, 허용 C 헤더 없음 | 기존 전체 복구 계약 재사용 |
| [판독] | main 캡처 요청 `@0x71000bc310` | [카메라 §3.4][camera]·[분할 §5][split]; INDEX의 [camera_gfx_components.c][gfxc]에 헤더 있음 | 요청 소비·복사 시점 미확정 |
| [판독] | main `FUN_710007a93c @0x710007a93c`, 공통 코드 `@0x7100063060..0x71000635f0` | [LOD §7.4][lod] 재사용; 후속 [docs_gap_main.c L3058~3532][gapc]·INDEX에 created C 추가, main.tsv에는 주소 미발견 | §3.3에서 빈 RT 선택/bind만 보충; 공유 구간을 독립 함수로 확정하지 않음 |
| [판독] | main 포스트 구성 `FUN_71000acf00 @0x71000acf00` | [카메라 §3.3·9.3][camera]; INDEX/main 함수 목록·허용 C 헤더 미발견 | 기존 포스트 판독만 재사용; 함수 경계 확정 안 함 |
| [판독] | main `ComGuiLayout::SetRenderPassId @0x710079e238` | [main.tsv][mainfunc] 크기8; 후속 [docs_gap_main.c L3003~3014][gapc]·INDEX에 C 추가 | layout+0x130 write 확인; 실제 설정 caller/GUI pass 소비는 남음 |
| [판독] | main `ComModel::Create @0x71006ab2b0` | [감사 §3.1][audit]·[그래픽 §3·7][graphics] | 모델·재질 변환은 재사용; renderer 통합과 분리 |
| [판독] | main `AnimationPassCamera @0x71006c0fe0/0x71006c1120` | [카메라 §3.2][camera] | 카메라 수학 신규 판독은 20_camera_runtime 소유; [정리본 §9.3][camerawork]의 snapshot 경계 재사용 |
| [판독] | main `SceneBase @0x71002c9bd4`, `OnEntry @0x71002c9f68`, `CleanupScene @0x71002e0344` | [DESIGN §10.5][design] | 공용 수명은 [18_scene_work §3.1·9.2][scenework] 재사용; 부모 instance 보존은 그 문서 U01 |
| [미확정] | 원본 GPU 제출·clear 범위·capture 소비·GUI 설정 호출부 | [분할 §5·8][split]·[감사 §8][audit] | §11 U1~U5와 부록 C |

[데이터] 기존 [그래픽 §9][graphics]의 `view/gfx/*`, [분할 §9][split]의 `lib/*`·`scene/minigame/*`, [로더 §14][loader]의 `shell/stage3d`는 당시 명칭이다. 이번 문서는 실제 `script/game/lib/*`, `script/app/common/render3d/*`, `script/app/minigame/frame/*`를 인용한다. [DESIGN §10.7][design].

[데이터] `C:/`, `C:/dev/`, 저장소·web·docs·engine의 상위/하위에서 관련 `AGENTS.md`를 찾지 못했고 저장소·web의 `.agents/skills`도 발견되지 않았다. 로컬 기억은 사용하지 않았다. 사용자 지정 생성 경로는 모두 `web/script/` 아래에 존재하며 두 lib의 실제 위치는 §2.4다. [DESIGN §10.7][design].

<a id="sources-web"></a>

### 2.2 웹 생성 지점 전체 목록

[데이터] web 전체의 소유 TS/TSX/JS/JSX/MJS/HTML을 텍스트 검색하고 `script/tools/test`는 기존 TypeScript 파서로 실제 생성 표현식·import 별칭·변수 별칭·팩토리를 교차 확인했다. 이 세 경로 밖의 추가 생성 지점은 미발견이다. 배포 산출물·vendor·node_modules의 복제 코드는 제품 소유 지점으로 중복 계산하지 않는다. 다음 표의 행은 파일 정적 근거이며 실행 횟수가 아니다.

| 수준 | 실제 경로·함수·줄 | 생성·수명 |
|---|---|---|
| [데이터] | [view/renderer.ts][renderer] `Renderer.constructor` L22 | 제품; `new THREE.WebGLRenderer`; 호스트마다1개 |
| [데이터] | [view/plazaGl.ts][plazagl] `plazaGl` L390 → getter `renderer` L165 | 제품; 기본 `createRenderer(canvas)` 팩토리; 광장 유지1개 |
| [데이터] | [view/lyt.ts][lyt] `LytRenderer.constructor` L527 | 제품; 정적 `shared`1개; 화면 밖 canvas |
| [데이터] | [common/ui/view.ts][mgmview] `MgmView.create` L103 | 제품; 설정·항구·프리 플레이 진입마다 생성 |
| [데이터] | [charselect/screen.ts][charscreen] `createCharSelect` L65 | 제품; 화면 진입마다 생성 |
| [데이터] | [modeselect/screen.ts][modescreen] `createModeSelect` L41 | 제품; 화면 진입마다 생성 |
| [데이터] | [common/render3d/stage.ts][stage] constructor L222 | 제품; `opts.gpu?.renderer ?? new THREE.WebGLRenderer`; gpu 주입 시 생성0 |
| [데이터] | [dev/character_page.ts](../../script/dev/character_page.ts) L48 | dev 직접 생성 |
| [데이터] | [dev/collision_page.ts](../../script/dev/collision_page.ts) L48 | dev 직접 생성 |
| [데이터] | [dev/effect_page.ts](../../script/dev/effect_page.ts) L39 | dev 직접 생성 |
| [데이터] | [dev/mgresult_page.ts](../../script/dev/mgresult_page.ts) L91 | dev 직접 생성 |
| [데이터] | [app/flow/host.ts][host] L94 | 제품 래퍼 `new Renderer(glCanvas)`1곳; 첫 행과 같은 생성 |
| [데이터] | [dev/mgscene_page.ts](../../script/dev/mgscene_page.ts) L59·181 | dev 래퍼2곳; Renderer 내부에서 생성 |

[데이터] `WebGLRenderer as ...` import·생성자 변수 별칭·`WebGL1Renderer`·`Reflect.construct(WebGLRenderer,...)` 생성 경로는 위 검색 범위에서 미발견이다. 생산 팩토리는 `PlazaGlDeps.createRenderer` L50 / 기본 구현 L390 / 호출 L165 하나이며 [test_plaza_gl.ts](../../tools/test_plaza_gl.ts) L463은 주입용 fake다. [PlazaGl][plazagl].

[데이터] 보조 직접 생성은 [character_verify/view.html](../../tools/analysis/character_verify/view.html) L26, [graphics_verify/view.html](../../tools/analysis/graphics_verify/view.html) L23, [chara_gallery_page.ts](../../test/out/chara_gallery_page.ts) L26이다. 템플릿 문자열 안 생성은 [effects_preview.ts](../../test/out/effects_preview.ts) L23, [fx_multi.ts](../../test/tmp/fx_multi.ts) L23, [fx_replay.ts](../../test/tmp/fx_replay.ts) L24다. 템플릿 래퍼 `new Renderer`는 `test/out/shot_{face,mg1801_charas,mg1801_render,mg1801_result,mg1801_ui}.ts`의 L31/28/24/29/29이며 각 파일은 [test/out](../../test/out/)에 있다. 이 도구들은 실행하지 않았다.

<a id="sources-probe"></a>

### 2.3 렌더러 밖의 WebGL 문맥

[데이터] [assetLoader.ts][assetloader] `detectSupport` L149~160은 임시 canvas의 `getContext('webgl2') ?? getContext('webgl')`로 KTX2 확장을 조사하고 `WEBGL_lose_context`를 요청한다. 별도 WebGLRenderer 없이도 추가 context를 만든다. 따라서 renderer 생성1곳만 검사해서 context1개를 보장할 수 없다.

[데이터] [measure_loader.ts](../../tools/measure_loader.ts) L76, [shot_assets.ts](../../tools/shot_assets.ts) L204도 측정용 context를 만든다. 제품 경로가 아닌 도구이며 이번 조사에서는 실행하지 않았다.

[설계] KTX2 지원 판단은 공용 렌더 서비스에서 실제 renderer의 capability를 어댑터에 제공하도록 이전한다. context 손실 후 capability와 transcode 선택 재평가 조건을 명시한다. 임시 probe를 유지하면서 “context 하나”라고 표기하지 않는다. [assetLoader.ts::detectSupport][assetloader], [DESIGN §10.7][design].

### 2.4 실제 공용 경로

| 수준 | 요청 명칭 | 실제 경로·역할 |
|---|---|---|
| [데이터] | `lib/assetcore-three ScenePreparer` | [script/game/lib/assetcore-three/index.ts][prep]; renderer 주입, 직접 생성 없음 |
| [데이터] | `lib/splitscreen-three` | [script/game/lib/splitscreen-three/index.ts][splitthree]; renderer 주입, 직접 생성 없음 |
| [데이터] | `app/common/render3d/stage.ts` | [script/app/common/render3d/stage.ts][stage] |
| [데이터] | `app/common/ui/view.ts` | [script/app/common/ui/view.ts][mgmview] |
| [데이터] | `SceneBase` 수명 정리본 | [web/docs/engine/18_scene_work.md §3.1·9.2][scenework]; onLoadComplete→setup·cleanup 완료 gate 재사용 |

<a id="followup-inventory"></a>

### 2.5 미확정 후속의 판독 전 목록

[데이터] 후속 후보를 먼저 문서·INDEX·모듈별 함수 목록과 대조했다. 기존 판독은 다음 표대로 재사용하고 빈 함수만 읽었다. 신규 20함수와 기존 부분 판독 보충2주소의 C 줄은 부록 B에 둔다. 최신 재대조는 §2.6이다. 원본 실행·추출·어셈블리 추가 판독은 없다. [INDEX][index]·[main.tsv][mainfunc]·[rc_stage01.tsv][rcfunc].

| 수준 | 범위·모듈·주소 | 기존/신규·남은 구현 장애 |
|---|---|---|
| [판독] | main `@0x710005dfa8/0x710005dfc8/0x710005a0d0/0x71000609bc/0x710005f750/0x7100063630` | 기존 [shader §31.1~31.4][shaderdoc] 재사용; 요청 저장·Layer binding/writer·좌표 공급의 자료 부재를 반복하지 않음. copy/clear/RT snapshot은 미확정 |
| [판독] | main `WipeModule @0x710029c710/0x710029c940` | 기존 [전환 §1·1.3][wipedoc] 재사용; overlay·Scene(0) capture 구분. 사진에 wipe가 빠진다는 문장은 추정 유지 |
| [판독] | main `FUN_710079fa50 @0x710079fa50`, `FUN_71007a3b70 @0x71007a3b70` | 기존 [mgm_common §6.7][mgmcommon]의 제약 행렬/알파·owner visibility 판독 재사용; 본문 재읽기0 |
| [데이터] | main `@0x71000521d8`; GUI `@0x710079ce14/0x710079cfb0/0x710079e0e4/0x710079e240/0x710079e96c/0x710079ed3c/0x71007a4c30` | INDEX·main.tsv·허용 C 있음; 신규 장면 생성·default/overlay 연결·GUI RT 참조/해제 판독. 실제 제출·pass ID 배정은 남음. [부록 B](#new-readings) |
| [데이터] | rc_stage01.nro `@0x710000db1c/0x710003d6b8/0x710003dd3c/0x710003e2e0` | INDEX·rc_stage01.tsv·허용 C 있음; 신규 Scene(0)/(1)·layer/type/flags 호출 판독. copy/완료와 flags 종료는 남음. [부록 B](#new-readings) |
| [데이터] | main `@0x710079d330/0x710079f570/0x710079ff0c/0x71007a00dc` | 후보 C 있음; 신규 읽기 후 문자열·통지·가상 호출 준비로 분류. layout 필드와 vtable offset을 혼동하지 않고 pass 증거에서 제외. [부록 B](#new-readings) |
| [데이터] | main `@0x710007a93c/0x7100063060/0x710079e238` | 최신 docs_gap_main.c·INDEX에 C 추가; 이전 Q1~Q3의 C 부재 해소. 기존 부분 판독과 새 gap 판독은 §3.3·부록 B/C로 구분. [gap C][gapc] |
| [데이터] | main `@0x710087d660/0x71000bd2fc` | 새 gap의 호출에서 좁힌 후보; INDEX/main.tsv·[b18 C][b18c] 있음. 새 RT descriptor 전달·buffer bind 판독. `@0x71008627b0/0x71000b5044`의 viewport/profile 판독은 [shader §31.3][shaderdoc]·[이펙트 §6.7][effectsdoc] 재사용 |

<a id="latest-c-inventory"></a>

### 2.6 02:36 UTC 후속 — docs_gap 이후 추가 C 대조

[데이터] 2026-10-10 후속 요청에서 허용 경로 `analysis/decomp/*.c`·`ghidra_work/*/out/*.c`의 C486개 목록·수정 시각·함수 헤더를 대조했다. 이전 `docs_gap_main.c` 수정02:19:45 UTC 뒤의 추가/변경11개를 아래에 둔다. 현재 INDEX 수정 시각은02:31:46 UTC다. 각 파일의 헤더 수와 INDEX 대응 행 수가 같고 해당 모듈 함수 TSV가 존재한다. 시각은 파일 metadata이며 원본 실행/추출 시각으로 해석하지 않는다. [INDEX][index]·[함수 TSV 폴더](../../../analysis/functions/).

| 수준 | 모듈·기존 C | 수정 UTC | 헤더/INDEX 행 | 담당 연결 |
|---|---|---|---|---|
| [데이터] | mg0113.nro [mg0113.nro.c](../../../analysis/decomp/mg0113.nro.c) | 02:21:42 | 697/697 | 카메라/게임·RTTI GUI property; 이 갈래 신규 판독 제외 |
| [데이터] | mg0116.nro [mg0116.nro.c](../../../analysis/decomp/mg0116.nro.c) | 02:22:31 | 894/894 | HUD lookup·게임; 전역 pass 소비 본체 미발견 |
| [데이터] | mg0203.nro [mg0203.nro.c](../../../analysis/decomp/mg0203.nro.c) | 02:23:07 | 467/467 | 게임·RTTI GUI property; 이 갈래 신규 판독 제외 |
| [데이터] | mg1704.nro [mg1704.nro.c](../../../analysis/decomp/mg1704.nro.c) | 02:31:39 | 1239/1239 | 카메라/게임; 카메라 수학·게임 로직 신규 판독 제외 |
| [데이터] | mgm02.nro [mgm02.nro.c](../../../analysis/decomp/mgm02.nro.c) | 02:24:16 | 745/745 | guide/HUD lookup·모드; [모드 정리본][modesdoc] 소유 |
| [데이터] | mgm03.nro [mgm03.nro.c](../../../analysis/decomp/mgm03.nro.c) | 02:25:24 | 415/415 | HUD lookup·모드; [모드 정리본][modesdoc] 소유 |
| [데이터] | mgm04.nro [mgm04.nro.c](../../../analysis/decomp/mgm04.nro.c) | 02:27:20 | 709/709 | guide/HUD lookup·모드; [모드 정리본][modesdoc] 소유 |
| [데이터] | mgm05.nro [mgm05.nro.c](../../../analysis/decomp/mgm05.nro.c) | 02:28:14 | 437/437 | guide/HUD lookup·모드; [모드 정리본][modesdoc] 소유 |
| [데이터] | mgm06.nro [mgm06.nro.c][mgm06c] | 02:30:09 | 581/581 | `VersusFlow::Initialize @0x7100012cf0`의 RT 설정 구간만 신규 판독; 일반 getter `TryGetExtension @0x7100018298` 본문은 제외 |
| [데이터] | bd01.nro [mgm_modes_bd01.c](../../../analysis/decomp/mgm_modes_bd01.c) | 02:28:56 | 16/16 | 보드 모드; [모드 정리본][modesdoc] 소유 |
| [데이터] | mg0906.nro [motion_gap_mg0906.c](../../../analysis/decomp/motion_gap_mg0906.c) | 02:19:46 | 1/1 | motion 보충; [motion 정리본][motiondoc] 소유 |

[데이터] 원본 API 이름·getter/셋터 주소의 caller 헤더를 허용 C 전체에서 교차 검색했다. 이번11개에는 main `@0x710005dfc8` capture getter의 소비나 `@0x710079e238` 명명된 setter caller가 추가되지 않았다. 같은 주소의 다른 NRO 함수를 main 함수로 합치지 않았다. 새 main dispatcher C가 생겼다고 판정할 근거도 미발견이다. [INDEX][index]·[main.tsv][mainfunc]·부록 C.

[판독] 새 담당 후보는 mgm06.nro `VersusFlow::Initialize @0x7100012cf0`의 renderer 구간1함수다. 모듈·주소·크기8400은 [mgm06.tsv][mgm06func]와 INDEX에 있고 C는 [L15255~15325][mgm06c]다. 모드 흐름·SceneBase·카메라 수학은 읽지 않고 담당 문서를 재사용한다. [모드 정리본][modesdoc]·[18_scene_work][scenework]·[20_camera_runtime][camerawork].

## 3. 진입점·호출 흐름

### 3.1 원본 레이어·패스

| 수준 | 범위 | 흐름과 보존 계약·근거 |
|---|---|---|
| [판독] | 레이어 구성 | main `@0x71000b5bd0`: layer0은 scene color/depth clear 값, 추가 layer는 clear=false·초기 disabled; 기본 mask=`1<<((baseID+layerIndex)&31)`. [분할 §5][split] |
| [판독] | 렌더 등록 | main `@0x71000b5bd0`: shadow/culling → reflection/underwater/impostor → opaque/skybox → translucent·후속 opaque → pre-post GUI → post → GUI/TopMost. [감사 §3.1][audit]·[분할 §5][split] |
| [판독] | 분할 적용 | main `@0x7100312900/0x7100311030/0x7100310cdc`: 상태 갱신 → layer ID 순 Apply → 선 In/Out·배치; Apply는 RT·clear·camera 할당을 만들지 않음. [분할 §2~3][split] |
| [판독] | 임포스터 | main `@0x710007a93c` → 공통 `@0x7100063060..0x71000635f0`: 첫 작업 인덱스0에서 target/viewport/layer 준비; 작업3개는 CPU 명령 분할. [LOD §7.4][lod] |
| [판독] | 종료 복구 | main `ResetAll @0x71001db630` → `@0x71001db3b0/0x71000603a4`: 양쪽 GfxScene camera·mask·enabled·clear·attachment 복원. [분할 §3][split] |
| [미확정] | 실제 제출 | 위 등록에서 layer0의 모든 pass 후 layer1인지, pass별 모든 layer인지 확정 불가. [분할 §5·8][split]; §11 U1 |

[판독] main `FUN_71000521d8 @0x71000521d8`은 `FUN_71000b5714`로 만든 장면들에 기존 `@0x71000b5bd0` 구성을 적용한다. `this+0x7a0` 장면 layer0을 default GraphicsLayer로, `this+0x800` 장면 layer0을 default overlay GraphicsLayer로 지정한다. 추가 RT 장면의 layer0은 초기 disabled다. 생성·기본 레이어 지정은 실제 GPU 제출 순서의 증거가 아니다. [camera_callers_anim.c L14330~14994][callerc], [분할 §5][split].

[판독] main GUI 생성 `@0x710079ce14→0x710079cfb0`은 지정 GraphicsLayer 핸들의 node/generation이 무효하면 `GetDefaultOverlayGraphicsLayer`를 택해 `ComGuiLayout::Attach @0x710079e0e4`로 연결한다. 지정 핸들이 유효하면 그 레이어를 사용하므로 모든 GUI를 기본 overlay로 고정하지 않는다. [GUI C L608~854·1566~1619][guic].

[판독] `Attach @0x710079e0e4`는 GraphicsLayer weak handle/type을 검사해 GUI extension 핸들을 구한다. 후속 `@0x710079e96c`은 유효한 이전 extension에서 layout 연결을 제거하고 새 extension에 연결한 뒤 `+0x48/+0x50/+0x58`에 pointer/node/generation을 저장한다. 여기서 등록 호출은 보이나 실제 pass ID·그리기 큐 순서는 보이지 않는다. main; [GUI C L1566~1619·2028~2110][guic].

[설계] 원본이 pre-post GUI와 post 뒤 GUI를 구분하므로 공용 렌더 계약도 `prePostUi`·`postUi`·`topMost` 슬롯을 구분한다. 슬롯 존재가 모든 원본 효과 구현을 뜻하지 않으며 비활성 패스의 활성 조건은 기존 문서를 따른다. main `@0x71000b5bd0`; [분할 §5][split].

### 3.2 현재 웹 화면별 흐름

| 수준 | 화면·소비자 | 현재 canvas/context·그리기·종료 |
|---|---|---|
| [데이터] | 한 판 호스트 | [host][host] L87~98: WebGL canvas + 2D HUD canvas; `Renderer` 유지. L288~291: game view → 틀 UI. 판 종료 dispose L133~144는 view만 해제하고 renderer는 유지 |
| [데이터] | 플레이어 설정 | [setplayer/screen.ts](../../script/app/scene/menu/setplayer/screen.ts) L60 → MgmView. [setplayer_page.ts][setpage] L217~235: charselect 동안 설정 canvas를 숨기고 handle을 유지; 숨김은 context 해제가 아님 |
| [데이터] | 캐릭터 선택 | [screen][charscreen] L316~328: 기본 화면 clear → Preview3D 카드 RT → Render2D 레이아웃 → sRGB 불투명 출력. [Preview3D][preview] L631~648: 슬롯별 scene/camera/RT; 화면 전체 3D 배경 합성과 다른 흐름 |
| [데이터] | 모드 메뉴 | [screen][modescreen] L386~411: clear → backdrop/base/text/guide → Render2D; create 끝에 render1회로 초기 컴파일 준비 |
| [데이터] | 항구·프리 플레이 | [mgmet_page.ts][mgmetpage] L146 / [mgm01_page.ts][freepage] L118 → MgmView; UI 선형 RT→불투명 출력. 페이지 종료 시 view.dispose |
| [데이터] | 광장 | [plaza_page.ts][plazapage] L77~99: PlazaGl enter canvas/gpu를 world에 주입; 없으면 Stage3D 자체 생성. 무대/post→공유 [PlazaUiView.end][plazaui] L95~115→기구 DOM overlay |
| [데이터] | 공용 MgStage | [frame/stage/stage.ts][mgstage] `createMgStage` → Stage3D.create(gpu). `renderSplit` → SplitRenderer; update를 renderSplit에서 다시 부르지 않음 |
| [데이터] | mg1801 | [view/index.ts][mgview] L390: ctx.renderer.render; [view/stage.ts][mgviewstage]는 게임 post를 setPost하고 종료 때 null·shadow enabled/type 복원 |
| [데이터] | 틀 HUD Lyt | [lyt.ts][lyt] L523~535·662~666: 정적 화면 밖 WebGL1개→2D HUD drawImage; 인스턴스 dispose는 텍스처·기하를 해제하고 정적 renderer는 유지 |
| [데이터] | 화면 전환 | [appTransition.ts][transition] 앱 DomWipe 유지; [transition-dom][transitiondom] L34의 기본 zIndex=1000. [flow/index.ts][flow] L108~139는 wipe 아래 화면을 숨김·재표시하며 같은 문서에서 복귀 |

[데이터] 정적 경로에는 숨겨진 호스트·부모 메뉴·광장 보관·Lyt의 renderer 유지가 각각 존재한다. 이들이 실제 동시에 활성인 context 수는 관측하지 않았다. 로더 §14.6의 “최대3개”는 당시 화면 계산이며 현재 배포 전체의 실측 상한으로 재사용하지 않는다. [host L94][host], [setplayer_page L217~235][setpage], [로더 §14.6][loader].

### 3.3 최신 gap C — RT bind와 GUI pass 필드

[데이터] `docs_gap_main.c`·최신 INDEX에 main `@0x710007a93c/0x7100063060/0x710079e238`가 추가되어 이전 C 부재3건을 해소했다. `@0x710007a93c/0x7100063060` 헤더는 created이며 후자는 void signature·`unaff_*`를 사용한다. main.tsv에는 앞 두 주소가 없고 원본 모듈 대응은 기존 LOD 판독에 의존한다. [gap C L3003~3532][gapc]·[INDEX][index]·[main.tsv][mainfunc]·[LOD §7.4][lod].

[판독] 작업3분할·셰이더0x56~59·instance 순번·quad draw는 기존 [LOD §7.4][lod]를 그대로 재사용한다. 새 보충은 그 앞의 RT 선택/bind 구간뿐이다. main `@0x710007a93c`, 공유 구간 `@0x7100063060`; [gap C L3146~3243·3356~3455][gapc].

[판독] 첫 작업 경로는 extension의 기본 RT 쌍 `+0x298/+0x2b0`과 대체 쌍 `+0x2c8/+0x2e0`의 weak node/generation을 검사한다. 대체 color pointer가 유효하면 대체 쌍을 선택한다. 선택 color의 descriptor ushort+8이2이면 상태 인수1,4이면2이고 다른 값은 abort한다. 이 숫자를 해상도나 MSAA로 이름 붙이지 않는다. color virtual+0xc8·depth virtual+0xd8 및 color width/height를 얻어 bind helper에 전달한다. main `@0x710007a93c/0x7100063060`; [gap C L3147~3212·3358~3425][gapc].

[판독] main `FUN_710087d660 @0x710087d660`은 color descriptor별 `+8/+0x10`을 두 배열로 모으고 depth descriptor의 같은 두 값을 읽어 외부 함수 포인터에 전달한다. 임포스터 caller는 color count1 뒤 viewport/scissor를 적용한다. 이 wrapper에 clear 값/요청은 없다. 외부 API 이름·attachment format·driver 제출 완료는 이 C로 확정하지 않는다. [b18 C L338~397][b18c], caller [gap C L3205~3212][gapc].

[판독] viewport 확장 후속 `FUN_71000bd2fc @0x71000bd2fc`는 현재 GraphicsCore 슬롯으로 `object+0x20`의 buffer를 얻어 handle로 바꾸고 `(3,0)/(3,4)` 인수의 bind helper를 호출한다. 이를 color/depth clear 함수로 분류하지 않는다. main; [b18 C L793~812][b18c], caller [gap C L3226~3236][gapc].

[판독] main `ComGuiLayout::SetRenderPassId @0x710079e238`은 인자 int를 layout+0x130에 저장한다. 따라서 생성 `@0x710079cfb0`의 +0x130 초기값−1 및 config+0x24 복사는 pass ID 필드의 생산 경로다. 이 후속에서 허용 C의 명명된 setter caller는 미발견이다. 값−1의 sentinel 의미와 특정 pre-post/post/TopMost ID 대응은 유보한다. [gap C L3003~3014][gapc]·[GUI C L748·825][guic].

[미확정] `@0x7100063060` C는 `@0x710007a93c`의 `LAB_7100063060..3310` 내용과 겹치는 공유 구간을 담는다. 별도 dispatcher나 추가 GPU 제출1회로 세지 않으며 함수 경계를 확정하지 않는다. RT bind/viewport의 확인과 GPU full/rect clear·전체 pass/layer 제출·capture 완료는 구분한다. main; [gap C L3131~3313·3317~3532][gapc], [분할 §5][split].

### 3.4 mgm06 별도 RT와 레이어 상태 교체

[판독] mgm06.nro `VersusFlow::Initialize @0x7100012cf0` C는 `GraphicsCoreModule::CreateRenderTarget` 호출 직후 `local_90/local_88`을 flow+0x10/+0x18에 저장하고 기존 참조를 반납한다. 현재 GfxScene type→`RendererModule::GetScene`→`Scene::GetGraphicsLayer`를 구하고 weak node/generation을 검증한 뒤 extension에 접근한다. 화면별 attachment 설정 caller를 보강한다. [mgm06 C L15255~15315][mgm06c].

[판독] 같은 구간은 저장한 두 필드의 pointer/node/generation 형태를 color/depth setter 직전에 각각 준비하고 `SetColorRenderTarget`·`SetDepthRenderTarget`·두 clear flag setter를 호출한다. API 이름에 대응하는 main 주소는 color `@0x7100060228`, depth `@0x71000602e4`, clear flags `@0x7100060648/0x7100060658`다. setter 내부는 새로 읽지 않았다. [mgm06 C L15308~15325][mgm06c]·[main.tsv][mainfunc], 기존 RT 참조/clear 분리는 [분할 §5][split] 재사용.

[추정] 호출 순서·RT setter 직전의 핸들 배치로 flow+0x10/+0x18을 Versus 화면의 별도 RT 참조로 해석한다. 생략된 생성 out 인자의 직접 대응은 이 C만으로 확정하지 않는다. mgm06.nro `@0x7100012cf0`; [C L15255~15325][mgm06c].

[미확정] 이 NRO C는 일부 메서드 인자를 생략한다. 특히 clear flag 호출이 pointer 하위 byte 표현으로 출력되어 실제 bool을 true/false로 판정하지 않는다. RT descriptor 구간의 packed low/high 값1920/1080은 보이나 CreateRenderTarget 인자 연결·구조체 해석이 불완전하므로 최종 RT 치수·format·MSAA·layer 번호도 확정하지 않는다. color/depth setter가 같은 객체를 받는 의도와 실제 attachment alias는 구분한다. mgm06.nro `@0x7100012cf0`; [C L15255~15325][mgm06c].

[설계] 화면 lease는 scene/layer의 attachment·clear 상태를 자기 RT 소유권과 함께 교체/반납하도록 명세한다. 이 caller를 매 화면 새 renderer/context 생성 규칙으로 옮기지 않는다. 전역 clear 소비·RT 완료/해제·mode return의 실제 복원은 U2/U11과 기존 SceneBase 계약에 남긴다. [mgm06 C][mgm06c]·[18_scene_work §9.2·11][scenework]·[DESIGN §10.7][design].

## 4. 구조체·필드·상수

| 수준 | 대상 | 유지할 필드·상수·근거 |
|---|---|---|
| [판독] | Split Param 0x20 B | main `CreateParams @0x7100311710`: +0 ID, +4/+8 x/y, +0xC/+0x10 w/h, +0x14/+0x18 min/maxDepth, +0x1C autoEnable. [분할 §2][split] |
| [판독] | 레이어 복구 | main `ResetAll @0x71001db630`: camera·mask·enabled·color/depth clear·attachment·viewport/scissor=(0,0,1,1,0,1)·보정 camera OFF·mode0. [분할 §3][split] |
| [판독] | draw camera | main `Viewport::GetDrawCamera @0x710086195c`: 원본 camera와 draw용 보정 camera 구분. 카메라 식·슬롯 우선순위는 [분할 §4][split]·[카메라 §4·6][camera] 재사용 |
| [판독] | capture 요청 저장 | main `@0x710005dfa8`: GraphicsLayerExtension `+0x40/+0x48/+0x50` handle, `+0x58` flags, `+0x5c=flags&1`; `@0x710005dfc8`은 handle/flags getter. type 인자 미사용은 type 의미의 증거가 아님. [shader §31.1][shaderdoc] |
| [판독] | Layer RT 참조·GPU binding | main `@0x710005f750`: color weak `+0x298/+0x2a0/+0x2a8`, depth weak `+0x2b0/+0x2b8/+0x2c0`와 generation 검사. `@0x710005a0d0/0x71000609bc`은 extension+0x248의0x5f0 Layer buffer·slot1/2/9 binding. 실제 attachment alias/clear는 별도. [shader §31.1~31.3][shaderdoc] |
| [판독] | GUI pass ID | main `SetRenderPassId @0x710079e238`: int→layout+0x130; 생성 시−1 뒤 config+0x24를 복사. 실제 ID/slot 대응·sentinel 의미는 미확정. [gap C L3003~3014][gapc]·[GUI C L748·825][guic] |
| [판독] | GUI 연결·RT | main `@0x710079e96c`의 extension weak handle `+0x48/+0x50/+0x58`; `SetRenderTarget @0x71007a4c30`의 RT 참조 `+0x148/+0x150`와 UI 투영 저장 `+0x160..0x19f`. RT 크기로 투영을 구성하나 clear·pass 배정은 하지 않음. [GUI C L2028~2110·6805~6871][guic] |
| [데이터] | StageGpu | [stage.ts][stage] L69~73: `{renderer, uploads: UploadRecord, keep: Map<string,unknown>}`; 외부 renderer를 dispose하지 않는 현재 주입 계약 |
| [데이터] | UploadRecord | [assetcore-three][prep] L98·233~241: `source → {v,data}`; 같은 source/data의 version만 바뀐 재업로드를 억제 |
| [데이터] | 준비 상태 | [ScenePreparer][prep] L154~200: `meshDone/texDone/live/rt`는 준비기별; uploads는 renderer별 공유 가능. dispose는 진행 job을 끝내 promise를 풀고 준비 RT 해제 |
| [데이터] | renderer 전역 상태 | [Renderer][renderer]의 post/clear/output/DPR, [Stage3D][stage]의 shadow 설정, [SplitRenderer][splitthree]의 target/viewport/scissor/autoClear 복구 범위가 각각 다름 |
| [설계] | RenderService | `canvas, renderer, generation, uploads, keep, activeFrame, prepareQueue`를 앱 수명으로 소유; `keep`의 키는 화면/환경/출력설정 범위를 함께 구분. [StageGpu][stage]·[PlazaGl][plazagl] |
| [설계] | ScreenRenderLease | `scene, cameras, layers, clearPolicy, post, prePostUi, postUi, topMost, resources`; lease 종료와 renderer 종료를 분리. main `@0x71000b5bd0/0x71001db630`; [분할 §3·5][split] |
| [설계] | RendererStateScope | target·RT viewport/scissor/test·canvas viewport/scissor/test·clear 색/alpha·autoClear·shadow enabled/type/autoUpdate/needsUpdate·toneMapping/exposure·outputColorSpace를 필요한 범위에서 저장/복원. [Stage3D][stage]·[SplitRenderer][splitthree]·[PlazaUiView][plazaui] |

[데이터] 기준 1920×1080은 [renderer.ts][renderer] `SCREEN_W/H`와 [DESIGN §8][design]의 기존 데이터 규칙이다. 메뉴는 DPR1·spec.screen, Renderer는 표시 폭과 최대DPR2, Stage3D는 resize(w,h)를 사용한다. [MgmView L104~105][mgmview], [Renderer.resize][renderer], [Stage3D.resize L575][stage].

[설계] canvas CSS 크기·drawing-buffer 물리 픽셀·RT 픽셀·1920×1080 UI 논리 좌표를 분리한다. 기본 canvas의 resize/DPR은 서비스만 수행하고 RT 크기는 화면이 정한다. [분할 §2·9.3][split], [로더 §14.4][loader].

## 5. 상태·수명

### 5.1 현재 소유권

| 수준 | 자원 | 현재 생성·준비·종료 |
|---|---|---|
| [데이터] | 메뉴 renderer/Render2D | MgmView·charselect·modeselect create에서 생성·load; 첫 draw에서 UI 텍스처/프로그램 사용; dispose가 둘 다 해제. [MgmView][mgmview]·[charselect][charscreen]·[modeselect][modescreen] |
| [데이터] | Preview3D | 자체 warmRt8×8·카드별 RT; pump에서 compileAsync·initTexture·warm draw; dispose가 슬롯·warm 자원을 해제하고 받은 gl은 버리지 않음. [preview3d.ts L218·351~421·631~658][preview] |
| [데이터] | Stage3D | gpu 없으면 자체 gl; gpu 있으면 uploads/keep 사용; warmup은 숨은 모델 포함 draw→복구→다시 draw. dispose는 preparer·화면 자원 정리, gpu 시 캐시 geometry/renderer 보존. [stage.ts L222·650~712][stage] |
| [데이터] | PlazaGl | 첫 getter에서 canvas/gl; enter 부착; leave 프로그램 pin→화면 정리→canvas 떼기; 예산 초과/lost 재진입에서 drop. [plazaGl.ts L161~177·205~286][plazagl] |
| [데이터] | 광장 keep | post·하늘·IBL·UI 객체를 renderer 수명에 보관; 프로그램만 pin하면 ShaderMaterial 키가 달라지는 기존 문제를 보완. [로더 §14.3 정정][loader] |
| [데이터] | 한 판 renderer | host 생성 때1개; game stage가 setPost/일부 shadow 상태를 바꾸고 종료 때 복원; host의 dispose는 앱 renderer 종료 경로를 구현하지 않음. [host L94·133~144][host]·[mg1801 Stage.dispose][mgviewstage] |
| [데이터] | Lyt shared | 처음 사용 때1개; 인스턴스별 mesh/texture dispose; 정적 renderer 종료 API 없음. [lyt.ts L523~535·816~824][lyt] |

[설계] 앱 서비스 `ready → attached → detached`는 정상 수명이고 화면 `lease → prepare → active/suspended → release`는 별도 수명이다. call로 숨겨진 부모는 데이터·scene를 유지할 수 있지만 canvas/context를 추가로 소유하지 않는다. 구체적인 call/return 보존 시점은 [18_scene_work §5·11 U01][scenework]의 미확정을 유지한다. 부모 scene를 보관하는 웹 정책은 원본 동일 인스턴스 보존 판독이 아니다. [DESIGN §10.5][design].

[설계] 화면 cleanup은 준비 job 취소·post hook 해제·전용 RT/mesh/material/skeleton 정리·캐시 retain 반환까지 수행한다. renderer.dispose/forceContextLoss는 앱 서비스 종료/복구 책임이다. “참조 해제”와 “공유 GPU 자원 dispose”를 같은 작업으로 취급하지 않는다. [Stage3D.dispose][stage], [로더 §14.3][loader].

[판독] 원본 SceneBase는 onLoadComplete→setup→syncedSetup→첫 update의 프레임 경계를 가지며, cleanup 호출과 isCleanupComplete 확인을 구분한다. main OnLoadComplete @0x71002ca400·OnSetup @0x71002ca4b0·OnStartUpdate @0x71002ca65c·IsCleanupComplete @0x71001c7cc4; [18_scene_work §3.1·9.2][scenework].

[설계] 웹 render lease의 준비 승인·출력 활성화·반납을 위 경계에 연결한다. cleanup 호출만으로 다음 lease를 활성화하지 않고 완료 gate를 기다리는 제안이다. lease는 웹 소유권 명세이며 원본 구조체나 API로 판독한 것이 아니다. [18_scene_work §9.2][scenework], [DESIGN §10.5·10.7][design].

<a id="context-loss"></a>

### 5.2 context loss와 준비 취소

[데이터] PlazaGl은 `webglcontextlost`에서 lost=true를 기록하고 다음 enter/prewarm에서 drop 후 새 renderer/UploadRecord/keep을 만든다. lost handler에는 preventDefault나 restored 처리 분기가 없다. 따라서 “그 자리에서 자동 복구 완료”로 읽지 않는다. [plazaGl.ts L145~177·188~210·267~285][plazagl].

[설계] 공용 서비스는 `ready → lost → recovering → ready`와 generation을 가진다. 손실 시 draw와 준비 승인을 멈추고 이전 generation의 늦은 async 완료는 새 화면 활성화에 사용하지 않는다. uploads·준비완료 집합·RT·프로그램 보관은 새 generation 기준으로 재구축한다. 재생성/복구 정책은 §12의 미승인 추천이다. [PlazaGl][plazagl]·[ScenePreparer.dispose/compile][prep].

[데이터] ScenePreparer의 compile은 성공/실패 모두 `job.onCompiled`를 부르고 dispose는 job.promise를 풀어 준다. promise 완료만으로 실제 GPU 성공·현재 generation·취소 아님을 판단할 수 없다. [assetcore-three L129~·193~200·312~325][prep].

## 6. 계산식·의사코드

### 6.1 픽셀과 clear

[판독] main `Viewport @0x71008626c0/0x710086273c`는 각 정규화 성분×W/H로 float viewport와 개별 절삭 scissor를 만든다. main `@0x7100311710`의 row-major ID와 focus 값은 원본대로 유지한다. [분할 §2][split].

[설계] GL 좌하 원점 변환은 `viewportY = H - (y+h)·H`, `scissorY = H - trunc(y·H) - trunc(h·H)`다. canvas API에는 DPR을 한 번 적용하며 RT 좌표는 RT 물리 픽셀이다. 현재 SplitRenderer의 `(px+0.25)/pixelRatio`·viewport 반올림 규칙을 이동 중 유지한다. [분할 §9.3][split], [split-three][splitthree].

[설계] 기본 프레임 clear는 화면 출력 정책이 담당하고 UI·준비·추가 레이어가 앞 출력까지 지우지 않는다. 기존 분할의 전체1회 clear는 웹 근사 계약이며 원본 GPU clear 범위 확정이 아니다. 현재 코드는 color/depth/stencil 모두 clear한다. main `@0x71000b5bd0`; [분할 §5·9.3][split], [SplitRenderer::clearOutput L200][splitthree].

<a id="prepare-output"></a>

### 6.2 준비와 출력의 분리

[데이터] ScenePreparer는 수집 → 텍스처1장 단위 initTexture → compileAsync → 메시 묶음 upload 순이다. 기본 `meshesPerUnit=32`이며 준비시간은 로직 dt가 아니다. [assetcore-three L165~168·222~262·328~381][prep].

[데이터] linear=false upload는 target=null·scissor(0,0,1,1)로 실제 기본 framebuffer에 draw한다. 복구는 scissor/test·target·카메라 mask·노드 visibility/culling·shadow update 플래그이며 이미 쓴 픽셀을 복원하지 않는다. [assetcore-three L328~380][prep].

[설계] 공유 renderer의 백그라운드 prepare는 항상 전용 scratch RT에 그린다. 표시 프레임과 prepare의 gl 상태 변경은 직렬화하고 각 작업 scope를 복구한다. 전용 RT의 출력 키가 본 draw의 화면/선형 키와 일치하는지는 별도로 검증한다. ScenePreparer의 `linear` 의미를 무조건 true로 바꾸는 이전은 승인하지 않는다. [ScenePreparer.compile/upload][prep], [PostChain.precompile L361~384][post].

[설계] 다음은 구현 지시가 아닌 공용 계약 의사코드다. 고정1/60·주입 난수·FrameGate·f32는 로직 경계를 유지하고 draw/prewarm이 추가 step이나 RNG 소비를 만들지 않는다. [DESIGN §3·4·10][design], [분할 §9.6][split].

```text
[설계] 앱 시작: RenderService 하나 생성; 화면에는 lease와 asset/prepare 어댑터 주입
[설계] 프레임 경계: 승인된 scene 요청 적용; 이전 출력 lease를 suspend/release
[설계] 논리 step: FrameGate가 열릴 때만 fixed f32(1/60)로 update; RNG는 주입값 사용
[설계] 출력 준비: 현 lease의 scene/camera state를 반영; Stage3D.update 중복 호출 금지
[설계] 기본 출력: 전체 상태 scope → 화면 clear → layer별 3D/prePostUi/post
[설계] UI: 화면별 기존 합성 계약 → split lines/틀 HUD → topMost
[설계] 화면 전환: 앱 수명 DomWipe가 가장 위에서 기존 상태를 계속 표시
[설계] 준비 작업: 남은 예산으로 별도 scratch RT 사용; 상태 복구; generation 확인
[설계] 화면 종료: 자기 자원·job만 정리; 공유 renderer는 앱 종료까지 유지
```

## 7. 애니·효과·소리·카메라·에셋

| 수준 | 연결 | 유지 조건·근거 |
|---|---|---|
| [판독] | 카메라 적용 | main `@0x71006c0fe0/0x71006c1120`의 기존 슬롯 적용과 draw camera 분리; 20_camera_runtime에서 수학 추가 판독; [정리본 §9.3][camerawork]의 base 불변 snapshot 재사용. [카메라 §3.2][camera]·[분할 §4][split] |
| [판독] | post 교체·사진 | main `RmMgSceneBase::OnGameExit @0x7100445ae8`·helper `@0x710042d1a0`; result→capture 요청 및 기본 capture OFF를 재사용. 렌더러 통합으로 이를 매 화면 캡처로 바꾸지 않음. [카메라 §3.4][camera] |
| [판독: 어셈블리] | mg0122 사진 RT | mg0122 `CreateRenderTarget @0x710001a174` 호출 인자960×540, index0 추가1920×1080; `ScreenCapture @0x710001d3ec` 요청 type0/flags1·3. 일반 분할 RT와 구분. [분할 §5][split] |
| [데이터] | UI 자원 | [Render2D][r2d]의 `spec.screen/textures/srgb`; [Lyt][lyt]의 images/telopCache; [splitscreen lines.json](../../assets/splitscreen/lines.json)의 pane/애니 자료. 주소 없는 변환 데이터는 이 경로·필드를 근거로 사용 |
| [판독] | 분할선 우선순위 | main `@0x7100313700`에서 DrawPriority0x8100. 원본 우선순위를 재사용. [분할 §6][split] |
| [설계] | 웹 출력 순서 | 기본 canvas → 분할선 → 틀 HUD → 전환 합성 위치를 기존 웹 계약대로 유지. 원본의 모든 GUI pass 배정을 확정한 순서가 아님. [분할 §9.5][split]·[§7.2](#ui-composition) |
| [데이터] | 모델·셰이더 자원 | glb의 `extras.fres`, 별도 env/dir_light/post/fsnb 자료를 기존 파이프라인으로 소비. 재질 근사는 renderer 수명 변경과 별도다. [그래픽 §3·7.3][graphics] |
| [판독] | 임포스터 | main `@0x710007a93c`와 shader ID0x56~59; UnderWater→Impostor→OpaqueNormal 등록 위치를 유지. atlas·선택·애니는 [LOD §7.4][lod]를 재사용 |
| [설계] | 애니·VFX·소리 | 화면 순서·모션 프레임·effect/SE 사건은 로직 출력대로 소비한다. prewarm이 애니 진행·SE 재생·진동을 유발하지 않아야 한다. [DESIGN §3~4][design] |
| [미확정] | 효과 등가 | 원본 shadow cascade/EVSM·water/reflection·post HDR FXAA·DOF와 웹의 차이는 단일 context로 해결되지 않는다. main `@0x71000b5bd0`·포스트 `@0x71000acf00`; [감사 §3][audit], [카메라 §9.2~9.3][camera] |

<a id="ui-composition"></a>

### 7.1 GUI·3D 합성의 세 계약

[데이터] 일반 메뉴 Render2D는 1920×1080 계열 HalfFloat/MSAA4 선형 RT를 불투명 검정으로 clear한 뒤 sRGB 변환·alpha1로 기본 화면에 출력한다. Preview3D 카드는 먼저 슬롯 RT에 그려 UI 텍스처로 사용한다. [Render2D L170~190·314~321][r2d], [charselect.render L316~328][charscreen].

[데이터] 광장 UI는 투명 HalfFloat/MSAA4 RT → RGBA8 sRGB 프리멀티 RT → 기본 화면에 premultiplied over이며 무대/post 뒤에서 clear 없이 합성한다. `PlazaUiView.end`는 target·clear 색/alpha·autoClear를 복구한다. [PlazaUiView][plazaui], [로더 §14.4][loader].

[데이터] Lyt는 LinearSRGB 출력·투명 WebGL canvas를 2D HUD로 drawImage한다. Render2D의 불투명 gamma 출력과 같은 루트가 아니다. [LytRenderer constructor/end][lyt].

[설계] 첫 이전은 위 세 계약을 별도 어댑터로 유지한다. Lyt의 offscreen gl을 제거할 때는 UI를 전용 RT에 그려 같은 최종 합성 위치를 재현한다. drawImage 대상이 공유 기본 canvas로 바뀌어 3D까지 HUD에 재복사되는 경로를 만들지 않는다. [lyt.ts L662~666][lyt], [로더 §14.4][loader].

[설계] UI 부품·템플릿과 3D 자리의 경계: [ui_parts_catalog.md](ui_parts_catalog.md).
### 7.2 원본 GUI RT·캡처·전환 후속

[판독] main `ComGuiLayout::SetRenderTarget @0x71007a4c30`은 기존 RT 참조를 반납하고 새 RT의 참조를 보유한 뒤 width/height를 조회해 UI 투영 저장값을 바꾼다. `@0x710079ed3c`은 RT 유무 등에 따라 그리기 컨텍스트의 투영/행렬을 임시 적용하고 layout 처리 뒤 바꾼 값을 복구한다. 카메라 수학 신규 판독은 하지 않는다. [GUI C L6805~6871·2204~2324][guic].

[판독] main `@0x710079e240`은 GUI 파괴/정리 경로로 RT 참조와 layout 자원을 반납한다. 이름 없는 함수를 렌더 통지로 잘못 해석하지 않는다. `@0x710079f570`의 layout+0x134는 callback 통지 gate이며 pass ID 증거로 쓰지 않는다. [GUI C L1620~1966·2509~2526][guic].

| 수준 | 원본 호출·모듈·주소 | 확인한 캡처 요청 |
|---|---|---|
| [판독] | rc_stage01.nro `MapMan::Capture @0x710000db1c` | 유효 RT와 renderer module이 있을 때 `GetScene(0)`·layer=`param1+1`·type0·flags1. [RC C L11684~11718][rcc] |
| [판독] | rc_stage01.nro `TypeLayout::CaptureFunc @0x710003dd3c` | `GetScene(1)`·layer0·type0·flags1 요청 뒤 `SetCaptureTexture`. 요청 뒤 UI texture 연결이 실제 GPU copy 완료를 뜻하지 않음. [RC C L50843~50874][rcc] |
| [판독] | rc_stage01.nro `TypeLayout::PreCapture @0x710003e2e0` | 표시/선행 처리 뒤 Scene(1)·layer0·type0·flags1; `+0x190/+0x198` 초기화. 일부 선행 component가 무효하면 abort 경로 있음. [RC C L51090~51197][rcc] |
| [판독] | rc_stage01.nro `TypeLayout::End @0x710003d6b8` | Scene(1)·layer0·type0·flags1 요청·texture 연결·`+0x190/+0x198` 초기화. 이 본문에는 flags0 요청이 없으므로 End를 capture OFF로 판정하지 않음. [RC C L50597~50631][rcc] |

[판독] main `WipeModule @0x710029c710`은 앱 수명 overlay GUI·DrawPriority0x9A00을 갖고 `FadeOut @0x710029c940`의 CrossFade는 `GetScene(0)`을 담아 `P_WipeCrossFade_00`에 놓는다. Fade 인자는 초가 아닌 speed다. [전환 §1][wipedoc].

[데이터] `extracted/bea/bq.nx.bea/Parts.lyt`의 `wipe.bflyt` `WipeBlack/White/Loading` out/in20f·`WipeCrossFade` out1f/in20f를 재사용한다. 원본 자산을 새로 읽거나 추출하지 않았다. [전환 §1.1][wipedoc].

[추정] Scene(0) capture와 overlay wipe의 분리로 사진에 wipe가 제외될 가능성은 있으나, 모든 capture의 post/GUI 포함 여부를 확정하지 않는다. main `@0x710029c940/0x71000bc310`; [전환 §1.3][wipedoc]·[shader §31.4][shaderdoc].

[설계] 공유 렌더 계약은 capture의 scene/layer/RT/flags와 UI가 읽는 texture를 분리해 기록한다. 완료·취소·generation이 정의되기 전 RT 반납이나 재사용을 승인하지 않는다. UI 컨텍스트·overlay 전환 상태 복구는 화면 lease 범위로 설계하고 원본 capture 종료 규칙으로 부르지 않는다. [RC C의 요청 호출][rcc]·[GUI C의 RT 참조][guic]·[DESIGN §10.7][design].

## 8. 상호작용

| 수준 | 경계 | 통합 조건·근거 |
|---|---|---|
| [설계] | 장면 수명 | onEntry→begin/load→onLoadComplete→setup→syncedSetup→update·cleanup 완료 gate에 lease 연결. renderer가 Work 쓰기 주인이 되지 않음. main @0x71001c8190/0x71002ca400/0x71002ca4b0/0x71002caaf0; [18_scene_work §3.1·9.2][scenework] |
| [설계] | asset manager | CPU 캐시·참조 주인·우선순위는 기존 로더; renderer별 uploads와 화면별 ScenePreparer는 분리. cache retain이 있다는 이유로 모든 material/skeleton까지 영구 보관하지 않음. [로더 §14.3][loader]·[StageGpu][stage] |
| [설계] | 로직 게이트 | split.step은 틀 UI tick에서 FrameGate를 따른다. 렌더 어댑터는 단계/분할 시간을 갱신하지 않음. [분할 §9.6][split]·[DESIGN §3][design] |
| [설계] | 화면 전환 | DomWipe/기구 fade/메뉴창/분할선 z순서와 입력 차단 위치를 유지; renderer 교체·canvas 부착 때문에 와이프 상태를 초기화하지 않음. [appTransition][transition]·[분할 §9.5][split] |
| [설계] | input/resize | 공유 canvas의 입력 소유자는 active lease 하나. 숨긴 부모의 리스너는 활성 lease를 다시 조작하지 않게 함. resize는 canvas1회+해당 RT 크기 정책으로 분리. [setplayer_page][setpage]·[Renderer.resize][renderer] |
| [설계] | 게임 post | Renderer.setPost와 Stage3D.post를 화면 lease의 출력 hook으로 연결; 메뉴 진입 때 게임 post·shadow·viewport가 남지 않음. 같은 이전에서 post 수식까지 교체하지 않음. [mg1801 Stage.dispose][mgviewstage]·[Stage3D.render][stage] |
| [설계] | dev | dev는 앱 공개 API로 renderer를 주입받아 단독 화면을 조립할 수 있다. app→dev 의존0을 유지하며 측정·시험 훅은 dev 소유. [DESIGN §10.1·10.4][design] |

## 9. 웹 설계

### 9.1 공용 서비스·코어·어댑터

| 수준 | 위치 | 책임·의존 |
|---|---|---|
| [설계] | `game/lib/<render-contract>` 후보 | 순수 layer/pass/clear/lease 상태·검증 코어, import0; 실제 폴더명은 구현 때 확정. 이미 존재하는 splitscreen 코어를 복제하지 않음. [DESIGN §10.1~10.4][design] |
| [설계] | `game/lib/<render-contract>-three` 후보 | renderer 상태 scope·RT 출력·카메라 draw 연결 어댑터; three+자기 코어. 기존 [splitscreen-three][splitthree]·[assetcore-three][prep]의 주입 계약 재사용 |
| [설계] | `app/common/render` | 앱 수명 RenderService·canvas/context·capability·keep/업로드 generation·화면 lease 조립. `view/renderer`·`view/plazaGl`의 제품 역할 이전. [DESIGN §10.7 단계2·6][design] |
| [설계] | `app/common/render3d`·`app/common/ui` | scene/material/post·UI 조립; 공유 renderer 빌림; 다른 화면 폴더의 Render2D/Preview3D 직접 의존은 공용 층으로 올리는 선행 단계. [MgmView import L8][mgmview], [DESIGN §10.7 단계5][design] |
| [설계] | `app/scene/{menu,world,mode,system}` | 화면 전용 scene/camera/UI/전환 요청; renderer 생성·global 설정 소유하지 않음. [DESIGN §10.2~10.5][design] |
| [설계] | `app/minigame/{frame,kit,mg####}` | frame에서 렌더 lease·split·결과 무대 제공, kit/game은 주입값만 사용. [DESIGN §10.2~10.5][design] |
| [설계] | `dev` | 보기·측정·fake renderer와 수명 기록. app은 dev를 부르지 않음. [DESIGN §10.1][design] |

[설계] RenderService 공개 표면은 `acquireScreen/releaseScreen/activateScreen/resize/prepare/draw/dispose` 정도로 좁힌다. lease가 gl을 빌리더라도 화면의 setPixelRatio/setSize·dispose/forceContextLoss는 허용하지 않는다. 원본의 계층별 소유권을 유지한다. main `@0x71000b5bd0/0x71001db630`; [분할 §3·5][split], [DESIGN §10.7][design].

### 9.2 split-screen 계약

| 수준 | 항목 | 유지할 웹 계약·원본 근거 |
|---|---|---|
| [설계] | 갱신 | scene/update1회 후 여러 draw camera; SplitRenderer 안에서 Stage3D.update 금지. main `@0x7100312900`; [분할 §3·9.3][split] |
| [설계] | 카메라/visibility | 배열 index=GraphicsLayer ID; draw clone 보정, 원본 사진 판정 camera·layers.mask 보존. main `@0x7100311030/0x710086195c`; [분할 §2·4][split] |
| [설계] | target/clear | 기존 전체 clear1회+추가 레이어 clear0; target 및 canvas/RT viewport/scissor 복구. main `@0x71000b5bd0`; [분할 §5·9.3][split]·[SplitRenderer.render][splitthree] |
| [설계] | post region | 기존 `PostRegion {target,viewport,scissor}` 주입·경계 clamp·비네트/FXAA 근사 유지; region없는 기본 출력도 scope 안에서 호출. [분할 §9.4][split]·[PostChain][post] |
| [설계] | 그림자 | 현재 첫 유효 레이어만 갱신하는 근사와 화면0 카메라 맞춤을 명시; 원본 layer별 shadow 등록과 동등하다고 하지 않음. main `@0x71000b5bd0`; [분할 §9.3][split] |
| [설계] | 캡처 | 실제 캡처 요청만 별도 RT; 호출 완료 뒤 소유자가 해제. 현재 runCaptures는 대상 RT viewport/scissor를 변경하며 빈 카메라에서도 onDone을 호출하므로 성공 판정/대상 상태 복구를 별도 정의. [split-three L303~326][splitthree]; mg0122 `@0x710001d3ec` [분할 §5][split] |

[설계] 카메라 어댑터는 CameraState snapshot을 받아 writeThree만 수행하고, SplitRenderer는 base를 보존하는 correctDrawProjection 결과를 받는다. sample/apply/draw를 섞어 draw마다 시간·난수를 진행시키지 않는다. [20_camera_runtime §9.3][camerawork], main @0x71006c1120·Viewport @0x710086195c의 [카메라 §3.2][camera]·[분할 §4][split].

### 9.3 이전 순서

| 수준 | 순서 | 완료 조건·근거 |
|---|---|---|
| [설계] | 1 경계 정리 | DESIGN 단계2/4/5의 view/page/dev·공용 UI/캐릭터 이동을 먼저 정리; 생성 목록과 기존 출력 trace를 명세로 고정. [DESIGN §10.7][design] |
| [설계] | 2 서비스 주입 | 호스트 Renderer와 PlazaGl 소유권을 서비스 하나로 연결; 출력 hook·state scope·resize·KTX2 capability 주입. 초기 서비스는 기존 화면 규칙대로 그림. [Renderer][renderer]·[PlazaGl][plazagl]·[assetLoader][assetloader] |
| [설계] | 3 메뉴 lease | MgmView→modeselect→charselect에 gl 주입; create/dispose에서 context 생성·폐기 제거, 카드 RT·불투명 UI 출력 보존. [MgmView][mgmview]·[charselect][charscreen]·[modeselect][modescreen] |
| [설계] | 4 광장 준비 | detach canvas 방식 prewarm을 공유 context의 scratch RT 준비로 전환; active 화면의 canvas 크기·출력 색·shadow·clear를 덮지 않음. [ScenePreparer][prep]·[Stage3D.warmup][stage] |
| [설계] | 5 게임·HUD | 게임 renderer/post를 같은 lease로 연결, Lyt 별도 context 제거; 2D HUD 요소와 전환 DOM 순서 유지. [host][host]·[Lyt][lyt]·[로더 §14.4][loader] |
| [설계] | 6 분할·복귀·손실 | SplitRenderer/capture/region post 상태 복구·중도취소·부모 복귀·generation 재준비 확인. 18_scene_work/20_camera_runtime 결과와 계약 합치기. [분할 §9][split]·[DESIGN §10.5][design] |
| [설계] | 7 소유권 고정 | 제품 gl 직접 생성1곳·raw context probe0·화면 renderer.dispose0·app→dev0을 정적 검사 대상으로 확정. 시각 확인은 §10·§12에서 따로 판단. [§2](#sources)·[DESIGN §10][design] |

<a id="validation"></a>

## 10. 검증 기대값

[설계] 다음은 후속 검증 명세이며 이번에 실행한 시험 결과가 아니다. Node로 확인할 수 있는 호출·수명 불변성과 GPU/화면 확인을 구분한다. 기존 [test_plaza_gl.ts](../../tools/test_plaza_gl.ts)·[test_splitscreen.ts](../../tools/test_splitscreen.ts)·[test_entry.ts](../../tools/test_entry.ts)는 참고만 했다.

| 수준 | Node·fake renderer로 확인 가능한 항목 | 기대값·근거 |
|---|---|---|
| [설계] | 생성·raw context | 제품 renderer 생성 factory1, raw getContext(webgl/webgl2) 추가0; dev 생성은 제품 import graph 밖. [§2](#sources), [DESIGN §10.1][design] |
| [설계] | 화면 A→B→A | 같은 정상 generation/canvas/renderer 참조, B 해제 시 A 캐시·app renderer dispose0. [로더 §14.3][loader] |
| [설계] | scope 종료·예외 | target/viewport/scissor/test/clear/autoClear/shadow/output 값이 들어오기 전 값과 동일; 전용 capture target 변경도 계약대로 복구. [SplitRenderer][splitthree]·[PlazaUiView][plazaui] |
| [설계] | prewarm 안전성 | prepare draw는 전용 RT만, active 기본 framebuffer draw/clear/resize0; cancelled/old generation 결과로 activate0. [ScenePreparer.upload][prep] |
| [설계] | split 1920×1080 | 2×1은960×1080, 2×2는960×540; ID 순서·focus0 출력1회, camera 원본 무변경. main `@0x7100311710/0x71008626c0/0x710086273c`; [분할 §2·8][split] |
| [설계] | 홀수 크기1919×1079 | 4분할 scissor959×539, 마지막 열/행1px 미포함; DPR 이중 적용0. main `@0x710086273c`; [분할 §2·8][split] |
| [설계] | 업데이트·게이트 | 논리 step당 Stage3D.update 최대1회, split.step은 열린 FrameGate만; draw/prepare 추가 난수 소비0. [DESIGN §3][design]·[분할 §9.6][split] |
| [설계] | compile/upload 통계 | 같은 source/data 재사용 시 version 복원·initTexture 호출 기록은 확인 가능. stats.textures는 실제 GL upload 수가 아님; stats.compiles도 실제 driver compile 수가 아님. [ScenePreparer L233~242·312~325][prep] |
| [설계] | capture 요청과 완료 분리 | fake 호출에서 scene/layer/type/flags·RT 참조를 기록하고 UI 연결만으로 completed가 되지 않음; 취소/세대 전환 후 이전 RT 조기 반납0. rc_stage01.nro `@0x710000db1c/0x710003dd3c`; [RC C][rcc]·[shader §31.4][shaderdoc] |
| [설계] | context loss | job 취소·세대 증가·uploads/keep 교체·늦은 완료 무시·화면별 재준비 요청 순서. 실제 브라우저 context 복구는 아래 범위. [PlazaGl][plazagl]·[ScenePreparer][prep] |

| 수준 | Node만으로 확정 불가능한 항목 | 후속 확인 조건·근거 |
|---|---|---|
| [미확정] | 실 GPU compile/upload0·메모리 절감·진입 속도 | fake 호출수와 driver 비용을 동일시하지 않음. [로더 §14.3·14.6·14.9][loader] |
| [미확정] | 메뉴/카드/광장 UI 합성 픽셀 | gamma·premultiplied alpha·RT MSAA·확대 필터·DPR 가장자리 사용자 화면 확인. [Render2D][r2d]·[PlazaUiView][plazaui] |
| [미확정] | 분할 경계 bloom/FXAA·그림자 | 현재 경계 clamp·화면0 그림자 근사와 원본을 구분. main `@0x71000b5bd0`; [분할 §8·9.4][split] |
| [미확정] | capture의 원본 사진·화면 전환 공백 | main `@0x71000bc310`, mg0122 `@0x710001d3ec` 요청과 실제 출력 대조 필요. 이번 원본 실행 확인 없음. [분할 §5·8][split] |
| [미확정] | 실 context loss/restored 이벤트 | 복구 후 화면·압축 텍스처·입력·전환 지속은 실제 환경 확인 필요. [PlazaGl][plazagl]·[assetLoader][assetloader] |

[데이터] 이번 정적 검증은 파일 존재·함수 목록/헤더·생성 AST/템플릿 구분·문서 링크 및 LF만 확인한다. 기존 문서의 과거 시험 통과나 과거 렌더 관측을 이번 실행 결과로 옮기지 않는다. [감사 §9][audit], [로더 §14.9][loader].

[데이터] 최종 검증: CommonMark 파서의 실제 링크 429개·참조 정의 52개 모두 대상 존재/내부 앵커 오류0, 표25개 열수 일치, 문장 태그 누락0, UTF-8 BOM 없음·LF. 괄호 안 설명·의사코드·인라인 코드의 후속 통합 문구는 실제 링크와 구분했다. git stage/commit은 하지 않았고 다른 갈래 변경을 보존했다.

<a id="unknowns"></a>

## 11. 미확정

[미확정] U1~U12의 완전 해소0·부분 해소3(U2/U3/U4)·나머지9다. 부분 해소 항목에도 핵심 미확정이 남으므로 미확정 ID는12개를 유지한다. Layer handle/binding·요청 저장·GUI overlay/RT 참조의 확인된 범위를 더 이상 자료 부재로 세지 않는다. 웹/시각/부모 instance 항목은 이 갈래 신규 C로 해소하지 않는다. [shader §31][shaderdoc], [§2.5](#followup-inventory)·[§7.2](#ui-composition).

| 수준 | ID | 항목·현재 근거 | 다음 근거 |
|---|---|---|---|
| [미확정] | U1 | layer/pass 실제 중첩 제출 순서; main `@0x71000b5bd0`은 등록. [분할 §5][split] | 제출/clear dispatcher 식별·부록 C X1 |
| [미확정] | U2 | 부분: main `@0x710005f750/0x710005a0d0/0x71000609bc`의 RT weak/generation·Layer binding은 확인. attachment 공유/축소 해상도·전체/사각 clear는 남음. [shader §31.1~31.3][shaderdoc]·[LOD §7.4][lod] | RT 선택/bind는 §3.3, mgm06.nro `@0x7100012cf0` attachment/clear 설정 caller는 §3.4에서 보강. [mgm06 C][mgm06c]. bool·실 snapshot·clear 소비자 X1 |
| [미확정] | U3 | 부분: main `@0x710005dfa8/0x710005dfc8`의 flags/enable 저장과 rc_stage01.nro `@0x710000db1c/0x710003dd3c/0x710003d6b8/0x710003e2e0`의 Scene(0)/(1) 요청을 확인. type0/flags1·3 copy/post/종료는 남음. [shader §31.1·31.4][shaderdoc]·[RC C][rcc] | getter/final pass의 실제 소비자 X2; End를 OFF로 가정하지 않음 |
| [미확정] | U4 | 부분: main `@0x71000521d8/0x710079cfb0/0x710079e0e4/0x710079e96c/0x71007a4c30`의 default/overlay·GUI 연결·RT 수명은 확인. 실제 pre-post/post/TopMost 배정은 남음; setter `@0x710079e238` +0x130 write 추가 확인. [장면 생성 C][callerc]·[GUI C][guic]·[gap C][gapc] | SetRenderPassId +0x130 write는 확인; 실제 설정 caller·pass 소비자 X3 |
| [미확정] | U5 | reflection/underwater·shadow의 레이어별 실제 활성/효과 등가; main `@0x71000b5bd0`. [감사 §3.1][audit] | 활성 장면별 기존 효과 문서와 제출 근거 |
| [미확정] | U6 | 일반 Render2D·광장 UI·Lyt를 동일 context에서 합성한 픽셀 등가. [§7.1](#ui-composition) | 사용자가 실제 화면 확인 |
| [미확정] | U7 | 실제 재진입 driver compile/upload 비용0·GPU 메모리; 현재 pin/keep/version 조정만 확인. [로더 §14.3][loader] | 실제 측정; 이번에는 실행 안 함 |
| [미확정] | U8 | scratch RT의 화면/선형 프로그램 키·PMREM/shadow warm draw 격리. [ScenePreparer][prep]·[PostChain.precompile][post] | 후속 어댑터 구현·키/상태 정적 명세 |
| [미확정] | U9 | context loss 복구 정책·capability/transcode 재선택·늦은 완료 안전성. [PlazaGl][plazagl]·[assetLoader][assetloader] | 공용 generation 설계와 실제 환경 확인 |
| [미확정] | U10 | split의 영역 밖 post 표본·그림자 맞춤·capture 성공 및 RT 복구. main `@0x71000b5bd0`; [분할 §8·9.3~9.6][split] | 기존 근사 표시·사용자 화면 확인·캡처 소비 판독 |
| [미확정] | U11 | 숨김 부모·프리 플레이 복귀 때의 renderer state/입력/RT 유지 범위. [setplayer_page][setpage]·[flow/index][flow] | [18_scene_work §3.1·5·11 U01][scenework]의 수명/부모 instance 미확정과 결합 |
| [미확정] | U12 | CameraState snapshot→writeThree와 renderer lease/split draw의 통합 상태 복구 | [20_camera_runtime §9.3][camerawork]의 sample/apply/보정 분리·base 불변·draw 시간/난수 진행0을 재사용했지만 통합 코드는 미실시. SceneBase는 [18_scene_work][scenework] 연결 완료 |

## 12. 사용자 확인

[설계] 원본 규칙을 기본으로 한다. 아래는 구현 전 사용자 선택을 위한 미승인 추천이며 이번 문서 작성으로 승인된 것이 아니다. 기존 숫자·근사를 새로운 원본 규칙으로 정하지 않는다. [DESIGN §1·10][design].

| 수준 | 선택 항목 | 미승인 추천·판정 근거 |
|---|---|---|
| [설계] | 정상 수명 자원 내림 | context를 버리기 전에 전용 RT/미사용 cache를 내림; renderer는 앱 종료까지 유지. PlazaGl의 budget drop을 그대로 전역화하지 않음. [로더 §14.6][loader] |
| [설계] | 손실 복구 | 한 generation의 출력·준비를 중단하고 새 generation으로 재준비; DOM 와이프는 유지. 동일 객체 복구/재생성 중 최종 방식은 실제 환경 확인 후 선택. [PlazaGl][plazagl]·[appTransition][transition] |
| [설계] | UI 이전 범위 | 첫 이전은 기존 불투명 메뉴·광장 premult over·Lyt 출력 유지; 2D HUD 자체 삭제나 post 수식 변경은 별도 결정. [§7.1](#ui-composition) |
| [설계] | 캐시 예산 | 기존 KEEP_RATIO0.6·PC2GB/모바일600MB는 참고만; RT 포함 추정과 앱 전체 자원 경쟁 기준을 다시 정함. [plazaGl constants][plazagl]·[로더 §14.6][loader] |
| [설계] | 분할 근사 유지 | 기존 clear1회·영역 clamp·첫 레이어 그림자·viewport 정수화는 표시된 근사로 유지; 제출 판독 없이 원본 동등 판정하지 않음. main `@0x71000b5bd0`; [분할 §9.9][split] |

## 13. 준비도

| 수준 | 준비도 | 해당 작업·근거 |
|---|---|---|
| [설계] | 바로 가능 | 생성 위치·소유권 목록을 기준으로 renderer 주입/lease 경계·dispose 분리·상태 scope·KTX2 capability 주입 명세. [§2~5](#sources)·[DESIGN §10.7][design] |
| [설계] | 바로 가능 | 기존 split 좌표·draw camera·region post·FrameGate 계약 재사용. main `@0x7100311030/0x710086195c`; [분할 §9][split] |
| [설계] | 바로 가능 | 확인된 scene/layer/RT/flags 요청 자료형·GUI 참조 보유/반납 명세; copy 완료·pass 슬롯 선택은 미확정 gate로 남김. main `@0x710005dfa8/0x71007a4c30`, rc_stage01.nro `@0x710003dd3c`; [shader §31.1][shaderdoc]·[GUI C][guic]·[RC C][rcc] |
| [설계] | 근사 필요 | UI 색/알파/MSAA·공유 scratch 준비·캐시 메모리·실 context 복구는 실제 화면/환경 검증 전 등가 미보장. [§10](#validation) |
| [설계] | 판독 필요 | 실제 layer/pass 제출·GPU clear·캡처 소비·GUI pass 배정·미구현 reflection/underwater 활성. main `@0x71000b5bd0/0x71000bc310/0x710079e238`; [§11](#unknowns)·부록 C |
| [설계] | 판독 필요 | [18_scene_work §11 U01][scenework]의 부모 instance 미확정·20_camera_runtime 결과와 카메라 계약 연결. [DESIGN §10.5][design], U11/U12 |

[설계] “바로 가능”은 명세·구현 착수 준비도다. 앱 전체가 이미 context1개이거나 원본 출력과 같다는 판정은 아니다. [§2.2~2.3](#sources-web)·[§10](#validation).

## 부록 A. 출처 대응·후속 통합

| 수준 | 출처 | 이 문서 대응 | 부모가 추가할 한 줄 |
|---|---|---|---|
| [설계] | `web/docs/engine/README.md` 문서표 | 전체 | `\| [render_unify.md](render_unify.md) \| 앱 수명 WebGL 렌더러 통합·화면별 패스·준비/복구 계약 \| 분석·설계, 실행 미확인 \|` |
| [설계] | `03_graphics.md` §9 끝 | §2·7·9 | `[설계] 앱 수명 렌더러·화면별 GPU 준비 정리: [render_unify.md §5·9](render_unify.md).` |
| [설계] | `07_camera_lighting.md` §9.3 끝 | §3·7·9 | `[설계] 공유 렌더러의 post·RT·UI 상태 소유권: [render_unify.md §3·7·9](render_unify.md).` |
| [설계] | `10_split_screen.md` §9.3 끝 | §4·6·9.2 | `[설계] 앱 수명 공유 렌더러의 레이어·상태 복구 연결: [render_unify.md §9.2](render_unify.md).` |
| [설계] | `lod.md` §7.4 끝 | §3·7·부록 C | `[설계] 임포스터 등록과 공유 렌더 패스 경계 정리: [render_unify.md §3·7](render_unify.md).` |
| [설계] | `loader_manager.md` §14 끝 | §2~5·9 | `[설계] 광장 유지 렌더러를 앱 전체로 확장하는 분석: [render_unify.md](render_unify.md).` |
| [설계] | `common_system_audit.md` §3.1 끝 | §1~3·11 | `[설계] 렌더러 생성 전수 목록·패스 통합 판정: [render_unify.md](render_unify.md).` |
| [설계] | `web/DESIGN.md` §10.7 끝 | §9·13 | `[설계] 렌더러 하나로 통합하기 위한 원본/웹 분석: [render_unify.md](docs/engine/render_unify.md).` |
| [설계] | `18_scene_work.md` §9.2 끝 | §5·8·9 | `[설계] 장면 수명과 공유 렌더 lease 연결: [render_unify.md §5·8·9](render_unify.md).` |
| [설계] | `20_camera_runtime.md` §9.3 끝 | §9.2·11 U12 | `[설계] CameraState snapshot과 공유 렌더러/split draw 연결: [render_unify.md §9.2](render_unify.md).` |
| [설계] | `14_shader_graphs.md` §31.4 끝 | §4·7.2·11 U2/U3 | `[설계] 확인된 Layer binding·capture 요청과 공유 렌더러의 잔여 submit/copy 경계: [render_unify.md §4·7.2·11](render_unify.md).` |
| [설계] | `15_transition.md` §1.3 끝 | §7.2·9 | `[설계] overlay 와이프와 장면 capture를 보존하는 공유 렌더러 계약: [render_unify.md §7.2·9](render_unify.md).` |
| [설계] | `web/docs/shell/mgm_modes.md` §7 끝 | §2.6·3.4·5·11 U2 | `[설계] mgm06 별도 RT·레이어 상태 교체와 공유 렌더러 계약: [render_unify.md §3.4·5·11](../engine/render_unify.md).` |

[데이터] 위 출처 문서·README·DESIGN은 이번에 수정하지 않았다. 부모는 해당 절 끝에 한 줄만 추가하고 기존 줄바꿈을 보존한다. 병렬 문서의 기존 본문을 대체하지 않는다. [DESIGN §10.7][design].

<a id="new-readings"></a>

## 부록 B. 새 판독 목록

[데이터] 후속 신규 함수 판독20개는 직접 보강16개·증거 제외4개다. 최신 추가분은 mgm06 renderer 구간1함수이며 전체 모드 함수의 판독을 뜻하지 않는다. 기존 부분 판독의 RT 준비 보충은2주소이며 공유 구간 중복을 독립 함수로 집계하지 않는다. 함수 크기·모듈은 [main.tsv][mainfunc]·[rc_stage01.tsv][rcfunc], C 대응은 [INDEX][index]로 확인했다. 기존 완료 판독 본문 재읽기0이며 LOD 미확정 RT 구간만 C로 보충했다. 신규 어셈블리 판독/추출0이다. 카메라 식과 SceneBase 본문은 이 갈래에서 새로 읽지 않았다.

| 수준 | 모듈·신규 주소 | 기존 C·줄 | 신규 결론·범위 |
|---|---|---|---|
| [판독] | main `FUN_71000521d8 @0x71000521d8` | [camera_callers_anim.c L14330~14994][callerc] | 장면 생성·default/overlay 별도 지정·추가 RT scene layer0 disabled; submit 미확정 |
| [판독] | main `@0x710079ce14/0x710079cfb0` (2함수) | [GUI C L608~854][guic] | 생성 wrapper/초기화·무효 지정 layer의 overlay fallback |
| [판독] | main `ComGuiLayout::Attach @0x710079e0e4` | [GUI C L1566~1619][guic] | layer weak/type 검증·extension 연결 helper |
| [판독] | main `@0x710079e96c` | [GUI C L2028~2110][guic] | 이전 연결 제거·신규 연결·weak handle 저장 |
| [판독] | main `SetRenderTarget @0x71007a4c30` | [GUI C L6805~6871][guic] | old RT 반납·new RT 참조 보유·크기 기반 UI 투영; clear/pass 아님 |
| [판독] | main `@0x710079ed3c` | [GUI C L2204~2324][guic] | GUI 컨텍스트 임시 적용·복구; 행렬 수학 추가 판독 제외 |
| [판독] | main `@0x710079e240` | [GUI C L1620~1966][guic] | 파괴/정리·RT 참조 반납; 렌더 통지로 분류하지 않음 |
| [판독] | rc_stage01.nro `MapMan::Capture @0x710000db1c` | [RC C L11684~11718][rcc] | Scene(0), layer=param1+1,type0,flags1 |
| [판독] | rc_stage01.nro `TypeLayout::End @0x710003d6b8` | [RC C L50597~50631][rcc] | Scene(1),layer0,type0,flags1; 이 본문에 flags0 없음 |
| [판독] | rc_stage01.nro `TypeLayout::CaptureFunc @0x710003dd3c` | [RC C L50843~50874][rcc] | Scene(1),layer0,type0,flags1·UI texture 연결 |
| [판독] | rc_stage01.nro `TypeLayout::PreCapture @0x710003e2e0` | [RC C L51090~51197][rcc] | 선행 처리·같은 요청·보조 필드 초기화 |
| [판독] | mgm06.nro `VersusFlow::Initialize @0x7100012cf0` (renderer 구간만) | [mgm06 C L15255~15325][mgm06c]·[mgm06.tsv][mgm06func] | 최신 신규1함수; 별도 RT 보유·현재 GfxScene attachment/clear setter 호출. 인자 누락 때문에 bool/치수/layer 번호 확정 제외 |
| [판독] | main `SetRenderPassId @0x710079e238` | [gap C L3003~3014][gapc] | 신규1함수; layout+0x130 write·config 복사 대응 |
| [판독] | main `@0x710087d660/0x71000bd2fc` (2함수) | [b18 C L338~397·793~812][b18c] | 신규2함수; RT descriptor 전달·viewport 후속 buffer bind; clear 증거에서 제외 |
| [판독] | main `@0x710007a93c/0x7100063060` (보충2주소) | [gap C L3146~3243·3317~3532][gapc] | 기존 LOD 준비 빈 곳만 RT 선택/bind 보충; created C·공유 구간의 함수 경계 유보 |
| [판독] | main `@0x710079d330/0x710079f570/0x710079ff0c/0x71007a00dc` (4함수) | [GUI C L855~1008·2509~2526·3160~3208·3232~3281][guic] | 문자열 helper·callback gate·vtable+0x130/0x158/0x160 호출 준비. layout pass 필드로 오인하지 않고 pass 배정 증거에서 제외 |

| 수준 | 분류 | 수·내역 |
|---|---|---|
| [데이터] | 기존 재사용 | shader §31 요청/Layer writer·전환 §1·mgm_common §6.7·기존 감사/분할/카메라/LOD/SceneBase 정리본. [§2.1·2.5](#sources-existing) |
| [데이터] | 웹 정적 조사 | 제품 직접 gl 생성7·dev4·제품 Renderer 래퍼1·dev 래퍼2·제품 raw probe1; 별칭 미발견. [§2](#sources) |
| [데이터] | 신규 중요 정적 발견 | prepare 기본 framebuffer1×1 draw, KTX2 임시 context, 준비 promise와 실제 성공 구분. [§2.3](#sources-probe)·[§5.2](#context-loss)·[§6.2](#prepare-output) |
| [데이터] | 최신 C 재대조 | 허용 C486개·docs_gap 뒤 추가/변경11개·새 담당 renderer 구간1함수. main 최종 소비/제출 C 추가 미발견. [§2.6](#latest-c-inventory) |
| [미확정] | 후속 집계 | 완전 해소0·부분3·나머지9; 미확정12개 유지. renderer submit/clear/copy/pass 배정의 직접 본체 C는 확보하지 못함. [§11](#unknowns) |

## 부록 C. 추출 요청 표

[데이터] 최신 docs_gap_main.c/INDEX로 이전 요청 Q1~Q3의 C 부재3건은 해소됐다. 02:36 UTC 후속의 허용 C486개·추가/변경11개 대조에서도 main의 최종 소비/제출 본체 추가는 미발견이며 mgm06 RT 설정 caller만 보강했다. [§2.6](#latest-c-inventory)·[mgm06 C][mgm06c]. 활성 추출 요청의 식별 주소는0개·미식별3건이다. C 존재 해소와 구현 장애 해소를 같은 숫자로 세지 않는다. 신규 추출은 하지 않았으며 최종 소비/제출 본체를 확보하지 못한 범위만 아래에 남긴다. [gap C][gapc]·[INDEX][index]·[main.tsv][mainfunc].

| 수준 | 이전 요청 | 현재 C·판독 결과 | 남은 범위 |
|---|---|---|---|
| [판독] | Q1 main `0x710007a93c` | [gap C L3058~3316][gapc] created C 있음. 기존 [LOD §7.4][lod] 재사용·RT 선택/bind 보충 | 전체 pass/layer dispatcher·GPU 완료 X1; 같은 C 재요청하지 않음 |
| [미확정] | Q2 main `0x7100063060` | [gap C L3317~3532][gapc] created C 있음. unaff signature·Q1 내부 label과 공유 구간 겹침 | 독립 함수 경계는 유보; clear/전체 제출 X1. 기존 C를 “없음”으로 요청하지 않음 |
| [판독] | Q3 main `0x710079e238` | [gap C L3003~3014][gapc] setter +0x130 write 확인 | 실제 설정 caller/GUI pass 소비 X3; setter C 재요청하지 않음 |

| 수준 | 활성 요청 | 주소·모듈·좁힌 근거 | 막힌 구현·필요 자료 |
|---|---|---|---|
| [미확정] | X1 | main, 주소 미식별. 장면 producer `@0x71000521d8`→등록 `@0x71000b5bd0`; 임포스터 RT bind `@0x710007a93c/0x7100063060`→`@0x710087d660` 및 buffer bind `@0x71000bd2fc`까지. [장면 C][callerc]·[gap C][gapc]·[b18 C][b18c] | 실제 GfxScene pass/layer 순서·clear flag를 소비하는 full/rect clear·프레임 submit 종료(U1/U2). 등록을 소비하는 dispatcher와 clear 명령 caller의 C/xref 필요; 현재 주소를 dispatcher로 바꾸지 않음 |
| [미확정] | X2 | main, 주소 미식별. 요청 `@0x71000bc310`→저장 `@0x710005dfa8`, getter `@0x710005dfc8`, `ScreenCaptureFinal` 등록. getter 호출 소비 C는 허용 경로에서 미발견. [카메라 §3.4][camera]·[shader §31.1·31.4][shaderdoc] | flags1/3·type0의 post/GUI 포함·copy 완료·요청 해제와 RT 반납(U3/U10). getter xref와 Final pass callback/완료 handler의 C 필요 |
| [미확정] | X3 | main, 주소 미식별. setter `@0x710079e238`→layout+0x130, 생성 `@0x710079cfb0`의 config+0x24 복사·`@0x710079e96c` 연결까지. [gap C][gapc]·[GUI C][guic] | 실제 GUI별 pass ID와 pre-post/post/TopMost 대응(U4). config 생산 caller·+0x130을 읽는 GUI pass dispatcher의 C/xref 필요; callback gate+0x134·vtable+0x130을 대체 증거로 쓰지 않음 |

[설계] 위3건은 caller·등록·필드·함수 목록으로 좁힌 최소 미식별 요청이다. 지금 확보 C의 RT bind/buffer bind를 clear/copy/완료로 해석하지 않는다. 범용 screenshot API·ParticleFx2를 같은 소비자로 대체하지 않는다. 직접 소비 본체의 C가 없어 남은 요청을 유지하며 추출 승인이나 원본 실행은 요청하지 않는다. [shader §31.4][shaderdoc]·[LOD §7.4][lod]·[DESIGN §10.5][design].

[camerawork]: 20_camera_runtime.md
[scenework]: 18_scene_work.md
[design]: ../../DESIGN.md
[graphics]: 03_graphics.md
[camera]: 07_camera_lighting.md
[split]: 10_split_screen.md
[lod]: lod.md
[loader]: loader_manager.md
[audit]: common_system_audit.md
[index]: ../../../analysis/decomp/INDEX.tsv
[mainfunc]: ../../../analysis/functions/main.nso.tsv
[passc]: ../../../analysis/decomp/shader_fs_c_capture_setup.c
[gfxc]: ../../../analysis/decomp/camera_gfx_components.c
[renderer]: ../../script/view/renderer.ts
[plazagl]: ../../script/view/plazaGl.ts
[lyt]: ../../script/view/lyt.ts
[mgmview]: ../../script/app/common/ui/view.ts
[charscreen]: ../../script/app/scene/menu/charselect/screen.ts
[modescreen]: ../../script/app/scene/menu/modeselect/screen.ts
[stage]: ../../script/app/common/render3d/stage.ts
[prep]: ../../script/game/lib/assetcore-three/index.ts
[splitthree]: ../../script/game/lib/splitscreen-three/index.ts
[host]: ../../script/app/flow/host.ts
[assetloader]: ../../script/app/common/render3d/assetLoader.ts
[r2d]: ../../script/app/scene/menu/charselect/render2d.ts
[preview]: ../../script/app/scene/menu/charselect/preview3d.ts
[plazaui]: ../../script/app/scene/world/plaza/ui/view.ts
[post]: ../../script/app/common/render3d/post.ts
[mgstage]: ../../script/app/minigame/frame/stage/stage.ts
[mgview]: ../../script/app/minigame/mg1801/view/index.ts
[mgviewstage]: ../../script/app/minigame/mg1801/view/stage.ts
[flow]: ../../script/app/flow/index.ts
[transition]: ../../script/view/appTransition.ts
[transitiondom]: ../../script/game/lib/transition-dom/index.ts
[setpage]: ../../script/setplayer_page.ts
[mgmetpage]: ../../script/mgmet_page.ts
[freepage]: ../../script/mgm01_page.ts
[plazapage]: ../../script/plaza_page.ts
[shaderdoc]: 14_shader_graphs.md
[wipedoc]: 15_transition.md
[mgmcommon]: ../shell/mgm_common.md
[callerc]: ../../../analysis/decomp/camera_callers_anim.c
[guic]: ../../../analysis/decomp/mgmcommon_main_guilayout_all.c
[rcc]: ../../../analysis/decomp/rhythm_rc_stage01_all.c
[rcfunc]: ../../../analysis/functions/rc_stage01.nro.tsv
[gapc]: ../../../analysis/decomp/docs_gap_main.c
[b18c]: ../../../analysis/decomp/effect_runtime_b18.c
[effectsdoc]: 08_effects.md
[mgm06c]: ../../../analysis/decomp/mgm06.nro.c
[mgm06func]: ../../../analysis/functions/mgm06.nro.tsv
[modesdoc]: ../shell/mgm_modes.md
[motiondoc]: 19_motion_input.md

## 14. 웹 구현 기록 — 광장·mg1801 렌더러 대여 (2026-10-10)

사용자 승인 범위: 광장과 mg1801/게임 호스트가 앱 수명 renderer/canvas 하나를 빌려 쓰는 §9.3 단계2 및 게임 연결을 구현한다. 기존 원본 판독만 재사용하며 새 추출·분석·후처리 식 변경은 하지 않는다. §1~13의 조사 당시 문장은 그대로 보존한다.

### 14.1 파일·계약 (구현 전)

- `app/common/render/service.ts`: 단일 renderer/canvas, 배타적 화면 lease, 대기열, generation, uploads 및 화면별 keep, 부착/resize/반납 소유권.
- `app/common/render/state.ts`: 렌더 타깃·viewport/scissor·색/alpha·autoClear·shadow·톤맵·출력 색·DPR/크기를 대여 경계에서 저장/복원.
- `view/renderer.ts`·`app/flow/host.ts`: 제품 호스트는 서비스 renderer를 주입받고 게임 시작~GPU 준비/정리 완료까지 lease를 유지한다. 중도취소 뒤 늦은 load 완료는 활성화하지 않고 정리를 마친 뒤 반납한다. 기존 dev 단독 Renderer 생성은 호환 경로로 남긴다.
- `view/plazaGl.ts`·`plaza_page.ts`: 기존 광장 캐시는 서비스의 광장 keep으로 연결한다. 미리 준비와 게임은 배타적이다. 게임 진입 시 이미 진행 중인 광장 모델/캐릭터 준비를 drain하고 무대 인스턴스를 정리한 뒤 반납한다. 캐시·renderer는 유지한다. 광장 활성 중에는 다른 출력 대여를 허용하지 않는다.
- `render3d/stage.ts`·`assetcore-three`: 서비스의 크기 변경과 준비 guard를 주입한다. 공유 준비 draw는 scratch RT에만 수행한다. `linear` 의미는 바꾸지 않고 화면 출력용 compile과 scratch 업로드 키의 완전 일치는 보장하지 않는다.
- `assetLoader.ts`: 제품 경로의 KTX2 지원 판단에 서비스 renderer capability를 주입한다. 미이전 단독 화면 fallback probe는 별도로 남긴다.

추가 변경 파일: `app/common/assets/index.ts`, `app/common/render3d/material.ts`, `app/minigame/mg1801/view/index.ts`, `app/scene/world/plaza/{scene,types,world}.ts`, `view/assetMode.ts`. 새 시험은 `tools/test_render_service.ts`, 기존 경계 갱신은 `tools/test_plaza_gl.ts`, 준비 세대 만료 시험 추가는 `tools/test_game_assets.ts`다. `Assets.prepare`는 generation이 만료되면 준비 성공으로 반환하지 않는다.

### 14.2 범위·근사·보류

- 이번 완료 조건은 **광장과 게임 호스트의 3D renderer 동일 객체**다. 메뉴·Lyt HUD의 별도 renderer 제거(§9.3 단계3/5 나머지)는 미이전이며 앱 전체 WebGL context 1개라고 보고하지 않는다.
- 활성 게임과 광장 prewarm을 동시에 GL 실행하지 않는다. prewarm drain 대기는 원본 submit 판독이 아닌 웹 소유권 정책이다. 게임 중 새 광장 prewarm은 연기한다.
- 정상 광장 budget drop은 광장 전용 keep 정리만 한다. 공유 renderer dispose/forceContextLoss는 화면 종료 경로에서 금지한다.
- context loss에서 generation을 무효화하고 늦은 준비/출력을 막는다. 브라우저의 같은 renderer 복구 뒤 새 대여가 가능하며, 기존 게임의 자동 재개/완전한 GPU 복구는 이번 범위에서 보장하지 않는다.
- DOM 와이프·2D HUD·로직 dt·RNG·B2/B7 수식은 보존한다. 브라우저/헤드리스·추출은 실행하지 않는다.

광장 keep의 IBL PMREM·RT·큐브와 하늘 geometry/material에도 명시적 해제를 연결한다. context 복구가 먼저 오더라도 이전 lease의 drain이 끝난 뒤 keep을 비워 늦게 쓰인 옛 캐시가 다음 대여로 넘어가지 않게 한다. 프로그램 pin의 완전한 예산 회수는 별도 후속이며 전체 GPU 메모리 상한을 보장하지 않는다.

### 14.3 상태·시험

구현 완료(광장·게임 호스트 3D 공유 범위). 메뉴·Lyt 통합 및 선택 시 사전 로딩은 미완료다.

| 검증 | 결과 |
|---|---|
| `npm run typecheck` | 통과 |
| `test_render_service.ts` | 15/15 — 동일 renderer 재사용, 배타 대여·FIFO, 상태·RT 복원, 종료 소유권, context loss·generation, 광장 drain·재진입, scratch 준비, IBL 캐시 해제 |
| `test_plaza_gl.ts` | 60/60 — 새 공용 서비스 import를 허용 목록에 추가. 기존 동작 기대값 변경 없음 |
| `test_plaza_world.ts` | 471/471 (`PLAZA_SKIP_GLSL=1`) |
| `test_game_assets.ts` | 17/17 |
| `test_render_common.ts` | 129/129 — 기존 출력·재질·물 그래프 스냅샷 유지 |
| `test_assetcore.ts` / `test_prefetch.ts` | 47/47, 133/133 |
| `test_entry.ts` / `test_splitscreen.ts` | 414/414, 115/115 |
| `test_mg1801.ts` | 종료 코드0, 통과 출력97개 |
| `test_character.ts` | 127/135 — 기존 결과 카메라 골든8개 동일 실패. 이번 변경에서 카메라·골든 수정 없음 |
| 메모리 esbuild | 출력165개, 디스크 번들 생성 없음 |

작업 중 새 시험의 `loadIbl` 두 번째 인자 누락으로 타입 검사1회 실패(TS2554) → `null` 명시 후 통과. 광장 경계 검사1건은 공용 render 서비스 의존 추가를 허용 목록에 반영한 뒤 통과. 브라우저/헤드리스·픽셀 비교·실제 context 복구·로딩 시간 측정은 하지 않았다. 따라서 실기 화면 등가·로딩 지연0을 보장하지 않는다.

기존 카메라 실패의 원인 분리 기록은 [20_camera_runtime §14.4](20_camera_runtime.md) 및 [render_common §4](render_common.md#4-검증-기록)에 있다. 이번 실행의 실패 원문:

```text
실패: 원본 규칙(기본) mgresult_win1 틱 477 기준과 같음 (7a0a7362897717c4e12174cb86832c8344f08a30fe70cdce82dc97563bf97132)
실패: 원본 규칙(기본) mgresult_draw 틱 477 기준과 같음 (10d3d208a785b68df2f7b5ed9288c147557c75a11ab5060884c3492c77d3d501)
실패: 원본 규칙(기본) mgresult_win2_theme 틱 477 기준과 같음 (3f1018388fe0ce6916ff1b02f75240d720a255b597a87da89748f529794cad75)
실패: 원본 규칙(기본) mgresult_dice 틱 1001 기준과 같음 (1654eb8ea0f1926afc47d708a8ccee6189b6e1f9c7497b338b25ec1f58c4142e)
실패: RULES_WEB mgresult_win1 = 이전 전 코드 기록 (1a129c5018e3c79c80e344505870f7644554163ffb5fd06f1c7108cc7d3ee856)
실패: RULES_WEB mgresult_draw = 이전 전 코드 기록 (40bba936a815146ed55406312cd29aeb54d9d3c6d018b784ed5fe915386dfe46)
실패: RULES_WEB mgresult_win2_theme = 이전 전 코드 기록 (487093d7b12516c4e33ed91c8ffba386f5e3a6e0cb87a446adf9a963e2a9fd21)
실패: RULES_WEB mgresult_dice = 이전 전 코드 기록 (3a7dfc775ccc25f3fac752509e5697e5319c982bd75f397ab1293e0c46403870)
```

추가 수명 계약: 광장 GPU 포트는 생성 당시 lease를 캡처하여 재진입 뒤에도 옛 작업이 다시 유효해지지 않는다. context loss 중 광장 prewarm은 drain 후 반납하며, 활성 광장은 페이지 stop으로 정리한다. 정상 종료도 background load 및 캐릭터 준비를 drain한 뒤 반납한다. 게임 선택 시 사전 로딩의 예약·완성 장면 인계는 별도 미구현이다.


### 14.4 후속 작업 순서·원본 대응

사용자 질의에 대한 범위 정리: §9.3의 전체 순서는 경계 → 서비스 → 메뉴 → 광장 준비 → 게임/HUD → 분할·복귀·손실 → 소유권 고정이다. 이번 요청은 서비스·광장 준비·게임 연결부터 적용한 부분 이전이다. 다음에는 메뉴 MgmView/modeselect/charselect 및 Lyt 합성을 이전한 뒤 게임 선택 시 준비 예약·선택 변경 취소·프레임 예산 GPU 준비·완성 장면 인계를 연결하는 순서를 권한다. 게임 사전 로딩은 메뉴 통합의 필수 종속은 아니지만, 먼저 만들면 메뉴 통합 시 준비와 출력의 작업 배분·전환 검증을 다시 조정해야 한다.

현재는 출력 소유권을 대여 수명 전체에서 배타적으로 잡는다. 메뉴도 같은 renderer로 옮긴 뒤 표시 중인 메뉴와 게임 prewarm을 함께 처리하려면 §6.2의 프레임/작업별 상태 scope 및 prepareQueue를 추가해야 한다. 현재 코드가 이 시간 분할 실행까지 완성한 것은 아니다. 다만 renderer/canvas·generation·uploads·scratch 준비 경계는 재사용할 수 있어 기반 전체를 다시 만들 필요는 없다. 이후 추가 화면을 독자 renderer로 계속 늘리면 후속 이전 비용도 커진다.

원본에서 확인한 것은 §3.1의 공통 장면 구성·기본/overlay GraphicsLayer·GUI attachment·공통 ResetAll이다. 원본 내부 renderer 객체 수가 정확히1이라는 판독은 없다. 웹의 renderer1개와 lease는 이 공용 기반/장면별 구성 관계를 구현하는 웹 설계이며, GPU submit·모든 GUI pass 순서까지 복제했다는 뜻이 아니다.


## 15. 원본 공용 렌더 경로 후속 확인 (2026-10-10)

### 15.1 결론과 확인 범위

[판독] 확인한 광장·mg1801·메뉴·레이아웃 UI 소비자는 원본의 공용 `RendererModule`/`GraphicsCoreModule`이 보유한 장면·그래픽 레이어를 사용한다. 게임·메뉴가 공용 모듈의 장면을 조회하고, 광장·mg1801 카메라는 공용 기본 레이어에 연결하며, 레이아웃 UI는 지정 레이어 또는 기본 오버레이 레이어에 붙는다. 아래 호출부와 새 getter 본문이 근거다.

[미확정] 이 결과는 원본 내부 renderer 객체·GPU device·명령 큐의 총수가 정확히1이라는 판독이 아니다. `RendererModule`과 `GraphicsCoreModule`도 역할이 다른 모듈이며 하나의 객체로 합쳐 부르지 않는다. 레이어별 실제 pass 제출 순서·GPU clear·모든 GUI 합성 위치는 §11의 미확정을 유지한다.

### 15.2 화면별 원본 연결 근거

| 수준 | 소비자 | 확인한 공용 경로 | 모듈·주소·C 근거 |
|---|---|---|---|
| [판독] | 광장 3D | `CameraManager::Initialize`에서 `GraphicsCoreModule::GetDefaultGraphicsLayer()` → `GraphicsLayer::SetCamera` | menu00.nro `@0x7100004800`, [plaza_menu00_world.c](../../../analysis/decomp/plaza_menu00_world.c) L817·878~884 |
| [판독] | mg1801 3D | `MapImpl::Initialize`에서 같은 기본 레이어 API → `GraphicsLayer::SetCamera`; 게임의 env/light/post는 별도 장면 구성요소로 생성 | mg1801.nro `@0x710000f9d0`, [mg1801.nro.c](../../../analysis/decomp/mg1801.nro.c) L14109·14171~14240 |
| [판독] | mg1801이 사용하는 공통 게임 틀 | `RmMgSceneBase::SyncedSetupGame`에서 전역 `RendererModule::g_Module` → `GetScene(GetCurrentGfxSceneType())` → layer0 조회·enabled 변경 | main `@0x7100443340`, [main_ca_rm.c](../../../analysis/decomp/main_ca_rm.c) L7715~7723 |
| [판독] | 캐릭터 선택 메뉴 | 공용 `RendererModule::GetScene(..., 0)` → `Scene::GetGraphicsLayer` → 레이어 enabled 제어. 카드 카메라는 기존 레이어1~4를 사용 | main `@0x710033fab0`·`@0x7100341090`, [charsel_select_pc.c](../../../analysis/decomp/charsel_select_pc.c) L5092~5099·6459~6463; 카드 구성은 [charselect §3.1](../shell/charselect.md#31-생성-판독) 기존 판독 재사용 |
| [판독] | 광장·메뉴 레이아웃 UI | 광장 `ComUiLocationTelop`과 메뉴 `ComUiMinigameModeLayoutCommon::Setup` 모두 `ComUiBase::CreateLayoutImpl` 사용 | menu00.nro `@0x7100073740`, [plaza_menu00_ui.c](../../../analysis/decomp/plaza_menu00_ui.c) L203; main `@0x71003649cc`, [mgmcommon_main1.c](../../../analysis/decomp/mgmcommon_main1.c) L110~131 |
| [판독] | 레이아웃 공용 생성·연결 | `ComUiBase::CreateLayoutImpl` → helper → `ComGuiLayout::Create`; 기존 생성 경로는 지정 레이어가 무효하면 공용 `GraphicsCoreModule`의 기본 overlay를 조회하고 `Attach` | main `@0x710020bf18` → `@0x710020b8a0`; [render_shared_module.c](../../../analysis/decomp/render_shared_module.c) L57~, [render_shared_ui.c](../../../analysis/decomp/render_shared_ui.c) L28~30; 기존 `@0x710079cfb0` 연결은 [mgmcommon_main_guilayout_all.c](../../../analysis/decomp/mgmcommon_main_guilayout_all.c) L813~825 및 §3.1 재사용 |

[설계 대응] 웹의 `LytRenderer`는 원본 클래스 이름이나 별도 GPU 시스템의 대응물이 아니라 레이아웃을 그리기 위한 웹 구현이다. 원본 레이아웃 UI의 대응은 위 `ComGuiLayout`·그래픽 레이어 연결로 설명한다. 현재 웹 구현은 [common/ui/layout/render.ts](../../script/app/common/ui/layout/render.ts)의 정적 공유 WebGLRenderer를 별도로 생성하며 [view/lyt.ts](../../script/view/lyt.ts)는 이를 재수출한다. 광장·게임 호스트의 공유 완료를 메뉴·Lyt까지 완료한 것으로 읽지 않는다.

### 15.3 추가 추출5함수와 본문 확인

[추출] 이전 확인 요청에서 [디컴파일 가이드](../analysis/decompile_guide.md)에 따라 main.nso 기존 프로젝트를 `-noanalysis -readOnly`로 열어 아래 함수만 C로 추출했다. `INDEX.tsv`에 새 파일 행5개를 추가했고, C 머리줄5개·색인5행 일치, `no function at`/`decompile failed`0건을 확인했다. 이 문서 반영에서는 추가 추출이나 런타임 코드 변경을 하지 않는다.

| 모듈·주소 | 함수·파일 | 본문에서 확인한 동작 |
|---|---|---|
| main `@0x710004f334` | `RendererModule::GetScene`, [render_shared_module.c](../../../analysis/decomp/render_shared_module.c) L1 | 모듈의 `+0x7a0 + SceneType×0x10`에서 기존 장면 핸들과 generation을 반환. renderer/장면 신규 생성 없음 |
| main `@0x710084d8f4` | `GraphicsCoreModule::GetDefaultGraphicsLayer`, 같은 C L25 | `*(this+0x68)+0x18`의 기본 레이어 참조 위치 반환. 신규 생성 없음 |
| main `@0x710084d908` | `GraphicsCoreModule::GetDefaultOverlayGraphicsLayer`, 같은 C L36 | `*(this+0x68)`의 `+0x30/+0x38/+0x40`에서 기존 overlay 핸들 복사. 신규 생성 없음 |
| main `@0x710020bf18` | `ComUiBase::CreateLayoutImpl`, 같은 C L57 | 기본 `GuiLayoutCreateArg` 구성 후 `@0x710020b8a0` 등 공용 helper 호출 |
| main `@0x710020b8a0` | `FUN_710020b8a0`, [render_shared_ui.c](../../../analysis/decomp/render_shared_ui.c) L1 | `ComGuiLayout::Create`로 UI 컴포넌트를 만들고 엔티티에 추가. 화면 전용 renderer 생성 경로가 아님 |

### 15.4 통합 설계에 반영할 원칙

[설계] 앱이 공용 WebGLRenderer/canvas를 소유하고 광장·게임·메뉴·레이아웃 UI가 장면별 camera·layer·post·전용 RT를 연결하는 방향을 유지한다. 이는 확인한 원본의 공용 그래픽 기반과 장면별 구성 관계에 대응하는 웹 설계다. 웹 lease API 자체를 원본 API로 판정하지 않는다.

[설계] 메뉴·Lyt 이전에서도 고유 그래프·후처리 설정·UI 색공간·알파·합성 순서는 보존한다. 공용 renderer를 쓴다는 이유로 모든 UI를 같은 overlay/pass에 강제하지 않는다. 원본도 유효한 지정 레이어와 기본 overlay 경로를 구분한다. §7.1의 UI 전용 RT·기존 합성 계약과 §9.3의 후속 이전 순서를 유지한다.

[미완료] §14의 광장·게임 호스트 연결 이후 메뉴·Lyt의 별도 renderer 제거와 선택 시 사전 로딩은 후속 작업이다. 이번 원본 확인은 그 방향의 근거를 보완하며 해당 구현·원본 픽셀 등가·내부 renderer 객체 수1을 완료 판정하는 근거로 쓰지 않는다.


## 16. 메뉴·Lyt 공유 렌더러 이전 (2026-10-10)

### 16.1 구현 범위와 계약 (착수)

[설계] MgmView·modeselect·charselect는 앱 RenderService의 renderer/canvas를 대여한다. 메뉴 전용 MenuSurface가 크기·상태와 suspend/resume/해제를 관리한다. 인원 설정→캐릭터 선택, 게임 목록→게임은 부모의 CPU 레이아웃을 유지하고 출력 대여만 반납한다. 비활성 부모는 GL을 호출하지 않으며 복귀 시 재획득한다. 대기 중 종료·손실·초기화 실패에서도 후속 소유자의 canvas를 제거하지 않는다.

[설계] Lyt의 별도 WebGLRenderer를 제거하고 호출자가 현재 renderer를 명시한다. hudPremultiplied 프로필을 1920×1080 RGBA8/MSAA4 투명 RT로 그린 뒤 공유 화면에 premultiplied over로 합성한다. 이전 Canvas2D HUD 내용은 Lyt 직전에 텍스처로 올려 먼저 합성하고 지운다. 이후 Canvas2D 내용은 기존 DOM HUD 위에 남겨 호출 순서를 보존한다. 게임 3D 복사·readPixels는 하지 않는다. 메뉴 menuLinear의 HalfFloat/MSAA4→sRGB 경로와 캐릭터 카드 RT는 그대로 둔다.

[설계] HUD 합성의 상태 scope 복원은 크기·DPR가 실제 바뀐 때만 resize한다. 같은 크기를 재설정하여 직전 게임 프레임버퍼를 지우지 않는다. Lyt RT는 linear 출력의 기존 표시값을 유지하며 최종 합성에서 sRGB 변환을 중복하지 않는다.

[제한] 활성 메뉴와 게임 사전 준비의 동시 시간 분할·prepareQueue·게임 선택 시 사전 로딩은 이번 범위에 포함하지 않는다. 메뉴 진입은 기존 광장 prewarm을 drain하고, 메뉴가 renderer를 보유할 때 새로운 GPU prewarm은 시작하지 않는다. Canvas2D→GPU 업로드 비용과 실제 픽셀 등가는 Node 시험만으로 확정하지 않는다.

### 16.2 단계 상태

| 단계 | 착수 상태 |
|---|---|
| 메뉴 대여·부모 복귀·실패/손실 처리 | 구현 중 |
| Lyt 전용 RT·HUD 순서·명시적 renderer 연결 | 구현 중 |
| Node 회귀·경계·타입 검사 | 예정 |

[설계 보완] 메뉴→게임은 기존 장면 와이프가 닫힌 뒤 반납하고, 메뉴를 재획득한 뒤 와이프를 연다. charselect의 진행 중 compileAsync는 종료 시 settle한 뒤 카드 RT와 대여를 해제한다. context loss에서는 렌더 호출을 멈추고 복구 이벤트 뒤 새 generation으로 메뉴 대여를 재획득한다.

[설계 보완] Canvas2D 텍스처는 업로드부터 `premultiplyAlpha=true`로 유지한다. 투명 가장자리의 선형 필터링도 premultiplied 값에 적용하며 Lyt RT와 같은 over 패스로 합성한다.


### 16.3 완료 기록·파일 구성

[구현 완료] §16.2의 착수 항목 세 가지를 완료했다. 제품 광장·게임 호스트·메뉴·Lyt는 같은 앱 renderer를 사용한다. 이전 §14·§15의 메뉴/Lyt 미완료 문장은 당시 상태이며 현재 상태는 이 절을 따른다. standalone dev의 3D renderer 생성 경로는 유지하되, 그 화면의 Lyt도 호출자가 가진 renderer를 사용하여 추가 context를 생성하지 않는다.

| 구분 | 파일·변경 |
|---|---|
| 신규 공용 대여 | `script/app/common/render/menu.ts`: MenuSurface, suspend/resume·대기 중 종료·복구·compile 정리 대기 |
| 신규 HUD 합성 | `script/app/common/render/hud.ts`: 투명 UI RT·Canvas2D 선행 내용 업로드·premultiplied over·상태 복원·자원 해제 |
| 신규 화면 연결 | `script/view/menuRenderer.ts`: 광장 준비 drain 뒤 앱 canvas 제공 |
| 서비스 | `script/app/common/render/service.ts`: 재부착 시 canvas를 DOM HUD/와이프 아래에 놓음; `state.ts`: 불필요한 resize 제거 |
| 메뉴 소비자 | `script/app/common/ui/view.ts`, `script/app/scene/menu/{charselect,modeselect,setplayer}/screen.ts`: 독립 renderer 생성·dispose 제거, 비활성 출력 차단, 초기화 실패 정리 |
| 카드 준비 | `script/app/scene/menu/charselect/preview3d.ts`: compileAsync 추적·settle, 종료 뒤 결과 적용 차단 |
| 제품 페이지 | `script/{charselect,modeselect,setplayer,mgmet,mgm01}_page.ts`: 앱 canvas 연결; 자식 메뉴·게임 전환 시 대여 반납/복귀; 오래된 페이지의 canvas.remove 제거 |
| UI 소비자·호스트 | `script/app/common/ui/layout/render.ts`, `script/view/{mgsceneUi,hud}.ts`, `script/app/minigame/kit/rhythm/view/ui.ts`, `script/app/minigame/mg1801/view/index.ts`, `script/app/flow/{host,index}.ts`: 명시적 renderer 인자·UI 수명·와이프 복귀 순서 |
| 개발 소비자 | `script/dev/{mgmcommon,mgmscreens,online,partyrule}_page.ts`: 같은 메뉴 경로; `script/dev/mgscene_page.ts`: 기존 3D renderer를 Lyt에 전달, UI dispose |
| 시험·문서 | `tools/test_render_service.ts`, 이 문서, `DESIGN.md`, `docs/engine/common_roadmap.md` |

메뉴의 종료 대기 중에는 그리기와 context 복구 재획득을 먼저 막고, 카드 compile 정리 뒤 대여를 반납한다. 잃은 context가 복구되더라도 종료한 메뉴가 다음 장면의 canvas를 다시 가져오지 않는다. 메뉴 명세·애니메이션·카드 카메라·후처리 그래프·기존 골든 기대값은 변경하지 않았다.

### 16.4 검증 결과

Node 시험20개 스크립트 모두 종료 코드0. 기존 시험 기대값 변경 없음. 결과 로그는 `test/out/menu_*.log`에 둔다.

| 시험 | 통과 |
|---|---|
| `test_render_service` | 29/29 — 기존15 + 메뉴 중첩/복귀·취소·손실/복구·실패·compile drain·HUD 순서/상태/수명·생성/import 경계14 |
| `test_layout` / `test_layout_draw` / `test_layout_runtime` | 68/68 · 68/68 · 16/16 |
| `test_charselect` / `test_modeselect` / `test_setplayer` | 67/67 · 71/71 · 116/116 |
| `test_mgmcommon` / `test_mgm01` / `test_mgmet` / `test_mgmscreens` | 119/119 · 277/277 · 218/218 · 38통과/0실패 |
| `test_render_common` / `test_game_assets` | 129/129 · 17/17 |
| `test_entry` / `test_plaza_gl` / `test_plaza_world` | 418/418 · 60/60 · 471/471 (`PLAZA_SKIP_GLSL=1`) |
| `test_mg1801` / `test_mgscene` | 통과 출력97개, 종료0 · 79/79 |
| `test_splitscreen` / `test_prefetch` | 115/115 · 133/133 |
| `npm run typecheck` | 통과 |
| 메모리 esbuild | 출력171개, 디스크 번들 생성 없음 |
| `git diff HEAD --check` | 오류 없음 |

작업 중 타입 검사에서 아래 두 오류를 수정한 뒤 최종 통과했다. 첫 오류는 renderer 생성 제거 뒤 남은 미사용 import, 두 번째는 새 시험 probe의 색공간 필드가 하나의 문자열 리터럴로 좁혀진 문제였다.

```text
script/app/scene/menu/charselect/screen.ts(6,1): error TS6133: 'THREE' is declared but its value is never read.
tools/test_render_service.ts(291,35): error TS2322: Type '"srgb"' is not assignable to type '"srgb-linear"'.
```

브라우저/헤드리스·실제 GPU context 복구·픽셀 비교·프레임 비용 측정은 하지 않았다. HUD 선형 필터링의 투명 가장자리를 보존하려고 CanvasTexture도 premultiplied로 업로드하며 sRGB 재변환을 넣지 않았다. 기존 별도 canvas의 구현별 MSAA 샘플 수와 새 RT의 고정 samples4가 모든 GPU에서 같은 픽셀이라는 보장은 없다. §14.3에 기록된 기존 `test_character` 카메라 골든8개는 이번 변경 대상/재실행 대상이 아니다.

### 16.5 남은 범위

- 선택 시 게임 사전 로딩·준비 취소·완성 장면 인계와 메뉴 표시 중 prepareQueue의 프레임 예산 분배는 미구현이다. 메뉴가 활성 대여를 가진 동안 광장 GPU prewarm은 시작하지 않으며 CPU/네트워크 캐시는 기존 경로를 유지한다.
- 실제 화면의 UI 색·반투명 가장자리·DOM HUD 순서와 업로드 비용은 별도 실기 확인 대상이다. Node 검증은 호출 순서·상태·수명·레이아웃 명령 골든을 확인한다.
- 새 원본 판독·C 추출 없음. 사용자 결정 대기 항목 없음. Ghidra 추출 요청 주소0개.

## 17. 원본 사전 로딩과 prepareQueue 대응 조사 (2026-10-10)

[범위] 사용자 요청으로 원본의 사전 로딩 시점·공용 큐·완료 대기·안내 화면을 조사했다. §6·§16.5의 웹 `prepareQueue`와 게임 선택 사전 준비는 구현하지 않았다. 앞 절의 “신규 추출 없음”, “mgInst 범위 밖”은 각 작업 당시 기록으로 보존한다. 기존 판독은 [06_scene_data §1.4~1.7](06_scene_data.md)·[18_scene_work §3·§5](18_scene_work.md)·[mgm01_freeplay §3.2·§5.5](../shell/mgm01_freeplay.md)·[minigame_scene §5·§8](../shell/minigame_scene.md)을 재사용했다. 부족한 C만 [디컴파일 가이드](../analysis/decompile_guide.md)에 따라 보충했다.

### 17.1 결론과 범위

[판독] 원본은 **공용 ArchiveModule/AssetModule이 자원을 적재하고, 장면이 필요한 묶음을 등록한 뒤 완료를 기다리는 구조**다. 부팅 시 상주 공용 자원을 먼저 싣는다. 설명을 표시하는 `mgInst`에서는 **실제 미니게임 장면을 다른 sequence로 호출하고 설명용 게임 초기화 완료 콜백을 받은 뒤 안내 UI를 시작**한다. 따라서 게임 시작 버튼 뒤에서 모든 적재를 처음 시작하는 구조로 볼 수 없다. 다만 `mgInst`를 거치지 않는 경로도 있다.

[판독] 이번에 확인한 AssetModule 아래 큐는 mutex/condition variable로 보호한 **파일 읽기 job 큐**다. `0x400000`은 읽기 처리의 최대 조각 크기(4MiB)로 이어진다. 이는 밀리초 프레임 예산이나 GPU 업로드 묶음 수가 아니다. [render_prepare_asset_jobs.c](../../../analysis/decomp/render_prepare_asset_jobs.c) main `@0x71008dead0/0x71008df750`, [render_prepare_queue.c](../../../analysis/decomp/render_prepare_queue.c) main `@0x71008dfe28/0x71008e00a0/0x71008e0574`.

[미확정] 메뉴 커서가 가리키는 게임 전체를 미리 준비하는 경로, 표시 프레임 뒤 남은 시간을 GPU 준비에 배분하는 원본 큐, 안내 중 게임 인스턴스의 본게임 직접 인계는 이번 근거에서 확인되지 않았다. **웹의 `prepareQueue`·커서 기반 예측 준비·완성 장면 인계를 모두 원본 구현이라고 설명하지 않는다.** 공용 자원과 장면별 설정을 나누는 방향은 원본에 대응하며, 구체적인 브라우저 GPU 준비 정책은 웹 설계다.

### 17.2 원본 자원 적재 흐름

| 수준 | 단계 | 확인한 처리·근거 |
|---|---|---|
| [판독: 기존] | 부팅 상주 | boot `GameFlow` main `@0x7100004520`: 캐릭터22명·mgInst/mgResult·공용 오브젝트·모션을 category0에 등록하고 `LoadAsync(0)`; [06 §1.5](06_scene_data.md), [scene_boot.c](../../../analysis/decomp/scene_boot.c). 상주 자원 사전 적재이며 모든 미니게임 무대 적재를 뜻하지 않음 |
| [판독: 기존] | 장면이 요구 등록 | `EntryArchive @0x71001d493c`: 상주/같은 category에 이미 있으면 중복 등록을 피함. `SceneLoadAsync @0x71001d4b60`: 게임 본체 category1, 게임 계열 공통 category2, 모드3/4·메뉴5/6·모션7/8 등을 구분; [06 §1.4~1.5](06_scene_data.md), [scene_load.c](../../../analysis/decomp/scene_load.c) |
| [판독: 기존] | 비동기 요청 | `LoadAsync @0x71001d4a50` → `FUN_7100109020`: 아직 loaded/loading이 아닌 항목에 pending 요청을 세움. 호출 그 자체가 즉시 GPU 준비 완료가 아님; [scene_load.c](../../../analysis/decomp/scene_load.c) |
| [판독] | 자원 I/O job | `FUN_71008d7b90`: 이미 있는 아카이브 재사용, 파일 레코드별 `FUN_71008df750(...,0x400000)` 요청. `FUN_71008dead0`은 AssetModule의 공용 처리 객체를 돌려줌. job 생성 후 `FUN_71008e0574`가 보호된 큐에 넣고 큐가 비어 있었으면 condition variable 신호; [scene_load.c](../../../analysis/decomp/scene_load.c), [render_prepare_asset_jobs.c](../../../analysis/decomp/render_prepare_asset_jobs.c), [render_prepare_queue.c](../../../analysis/decomp/render_prepare_queue.c) |
| [판독] | 조각 읽기·통지 | `FUN_71008dfe28`에서 job의 +0x10에 조각 한도를 저장. `FUN_71008e00a0`은 남은 크기와 한도의 min만큼 버퍼를 할당하고 파일 객체 virtual+0x40으로 읽음. 결과 버퍼·크기·최종 조각 여부를 쌓고 LightEvent 신호. 종료 요청 비트(+0x2d bit0)를 확인하는 경로도 있음; [render_prepare_queue.c](../../../analysis/decomp/render_prepare_queue.c) |
| [판독: 기존] | 완료 대기 | `FUN_7100109370`: pending(+0x1b)/loading(+0x1a)이 남으면 완료 아님. `SceneBase::OnLoaded @0x71002ca37c`: 모션7/8 적재 단계와 가상 `IsLoadingArchive`·사운드 로딩 조건을 기다림. 이후 Setup/SyncedSetup/FrameGate는 기존 장면 수명에 따름; [06 §1.5](06_scene_data.md), [18 §3](18_scene_work.md) |
| [판독] | 해제 | `ArchiveLoader::ReleaseAll @0x7100109620`: 참조 수(+0x20)·유지 플래그(+0x19)를 확인하고 조건 충족 항목에 해제 요청(+0x1c)을 기록. 이미 판독된 이름별 해제 `FUN_7100109700`와 함께 사용. 즉시 모든 실행 job을 강제 중단하는 웹 AbortController와 같은 계약으로 단정하지 않음; [render_prepare_archive.c](../../../analysis/decomp/render_prepare_archive.c), [scene_load.c](../../../analysis/decomp/scene_load.c) |

[판독] 보충한 `FUN_7100108ef0`은 미적재 항목의 `AssetModule::LoadArchive` 핸들을 얻고 완료 상태를 검사하는 경로다. 이 함수 하나를 비동기 로더의 매 프레임 update 전체라고 이름 붙이지 않는다. `FUN_71008e00a0`의 I/O 큐·이벤트는 확인했지만 worker 개수·스레드 우선순위·프레임 시간 할당 정책까지 판독한 것은 아니다.

### 17.3 게임 선택·설명·본게임의 정확한 구분

[판독: 기존 + 공백 보충] mgm01 `PrepareLoadArchives @0x7100004d78`은 모드 공통 묶음·NPC 적재다. 목록의 `MgListFlow_MoveCursor @0x71000166ec`와 `ApplyChangeMgList2 @0x7100015550`에서 확인한 처리는 커서·SE/FX·새 게임 표시·목록 UI이며, 이 두 함수에서 선택 게임 본체에 대한 archive 요청은 발견하지 않았다. 이는 조사한 경로의 결과이지 모든 메뉴·간접 콜백에 사전 적재가 없다는 증명은 아니다. [mgm01_stage3.c](../../../analysis/decomp/mgm01_stage3.c).

[판독: 기존] 시작 확정 후 `MgStartFlow @0x7100011a50`은 Work/플레이어 준비와 와이프를 거쳐 `CallMinigameScene`을 호출한다. main `CallMinigameScene @0x71003601ac`는 gyro 경로를 우선하고, flag4와 `MGList::IsCallInst` 조건이면 `mgInst`, 그렇지 않으면 실제 게임 이름으로 장면을 호출한다. [mgm01_freeplay §3.2](../shell/mgm01_freeplay.md), [minigame_scene §8](../shell/minigame_scene.md). 원본 와이프의 속도1.0을 1초로 해석하지 않는다.

[판독: 신규] 아래 주소는 모두 **mgInst.nro**이며 같은 주소의 main 함수와 구별한다. C는 [mgInst.nro.c](../../../analysis/decomp/mgInst.nro.c), 기능 주소는 [mgInst.nro.tsv](../../../analysis/functions/mgInst.nro.tsv)와 대조했다.

1. `Scene ctor @0x7100004608`: `MgStartInst`를 SystemCallBackModule의 번호5에 등록하고 완료 표시 `this+0x110`을0으로 시작한다.
2. `BeginScene @0x7100005064`: NetTransferSceneBegin 동기화를 기다리고 GameWork의 게임 ID를 받는다. 이 함수에서 커서 기반 archive prefetch를 호출하지 않는다.
3. `SetupGame @0x7100004b28`: 두 sequence의 gfx scene type·공용 renderer의 레이어/overlay를 연결하고 안내 UI·네트워크 관리자를 만든다.
4. `GameFlow @0x7100004ea0`: flag0을 켜고 `MGList::GetName(id)`의 실제 게임을 `CallScene(name, currentSequence == 0, -1)`로 호출한다. 즉 현재0이면1, 현재1이면0인 다른 sequence다.
5. 같은 GameFlow는 `this+0x110`이 참이 될 때까지 Fiber::Wait한다. callback5의 `MgStartInst @0x7100004828`은 공용 렌더 설정·소리 처리를 하고 이 표시를1로 바꾼다. 그 뒤에만 `MgInstUI::Start`한다. 단순 파일 다운로드 완료가 아니라 설명용 초기화 성공까지 기다리는 경로다. 콜백5는 본플레이의 OnGameStart가 아니라 기존 미니게임 틀 단계2의 OnGameInstInit 성공 시점이다([minigame_scene §5](../shell/minigame_scene.md)).
6. 안내 UI의 `IsEnd`를 기다린 뒤 콜백 호출·와이프·전환 소리를 처리하고, 와이프 완료 후 `RequestExchangeScene`을 요청한다. C가 일부 호출 인자를 생략하는 문제는 기존 [18 §5](18_scene_work.md)와 같으므로 잘못 복원된 `this` 인자를 게임 이름으로 새로 판정하지 않는다.
7. `CleanupGame @0x7100004da0`: 반대 sequence의 `ShutdownCurrentScene`, overlay/gfx 설정 복원, flag0 Off. `IsCleanupComplete @0x7100004e6c`은 반대 sequence에 실행 장면이 남지 않을 때 완료한다.

[판독: 기존] flag0은 `IsInstActive`, 즉 설명 화면 안의 게임 실행을 뜻하며 미니게임 틀은 이때 오프닝·결과 없는 반복 경로를 쓴다. [minigame_scene §4·§5·§8](../shell/minigame_scene.md). 따라서 이 경로는 **게임을 실제로 실행하는 설명/연습 장면**이다. 로직을 전혀 진행하지 않는 웹 GPU prewarm과 같지 않다.

[미확정] cleanup에서 안내용 게임의 shutdown은 확인된다. 준비된 게임 객체·RNG 상태·진행 프레임이 본게임 인스턴스로 그대로 넘어간다고 볼 수 없다. 같은 아카이브 재사용 경로는 있지만, 안내 종료 시 게임 자원의 정확한 유지 범위·재생성 비용과 본게임까지 무적재임은 추가 lifecycle 근거가 필요하다. 설명 생략/gyro 조건에서도 동일한 시간 여유가 있다고 가정하지 않는다.

### 17.4 웹 설계에 반영할 계약

[설계] 원본과 대응되는 책임 분리는 **공용 자원 관리 + 장면별 적재 요구 + 시작 전 완료 확인 + 공용 renderer/장면별 레이어**다. 메뉴에서 선택한 게임을 더 일찍 받아 준비하는 것은 이 구조 위의 웹 최적화로 표시한다. `mgInst` 자체 구현이나 원본 연습 로직을 이번에 추가하지 않는다.

| 원본 근거 | 웹 대응 | 동일성의 한계 |
|---|---|---|
| 부팅 상주·category 공통 묶음 | AssetManager의 앱 공용 캐시와 scope별 요구 | 웹 키·fetch/parse·캐시 퇴출 규칙은 웹 포맷에 따른다 |
| 공용 파일 I/O job 큐 | AssetManager의 fetch/decode 요청·동시성 관리 | 원본4MiB 조각을 WebGL 작업 단위나 browser budget으로 옮기지 않는다 |
| 장면 로딩 완료·Setup·설명용 초기화 콜백 | CPU 자원 완료 → GPU 준비 완료 → 장면 활성화의 별도 상태 | 다운로드 Promise 완료만으로 GPU/게임 ready 판정 금지 |
| 하나의 renderer와 scene/layer 구분 | RenderService의 표시 프레임과 GPU prepare 직렬화 | `activeFrame/prepareQueue`는 웹 계약, 원본 동명의 자료형 아님 |
| 안내 중 실제 게임 실행 | 향후 mgInst 소비자의 별도 장면 수명 | 일반 prewarm에서 game.step·FrameGate·RNG·소리/저장 부작용을 대신 실행하지 않는다 |
| 참조/유지 조건과 해제 요청 | 준비 owner/scope 해제·늦은 완료 무효화 | 실행 I/O/GPU 작업의 즉시 강제 중단·원본 generation 체계는 미확정 |

[설계] `prepareQueue`는 **GPU 준비 전용**으로 RenderService에 붙인다. 메뉴가 활성 대여를 가진 상태에서도 프레임 경계에서 표시 draw와 준비 단위를 같은 renderer로 직렬 실행하고, scratch RT와 상태 복원 scope를 사용한다. 준비 작업이 일반 대여를 다시 요청해 메뉴 종료까지 기다리는 방식으로 만들면 메뉴 표시 중 준비 목적을 달성하지 못한다. 기존 독점 lease의 수명과 프레임 단위 준비 권한을 구분하는 후속 구현이 필요하다.

[설계] 텍스처 initTexture → compileAsync → 메시 버퍼 upload라는 기존 ScenePreparer 단위를 재사용한다. PC4ms/모바일2ms 예산·메시32개 묶음은 [loader_manager §11](loader_manager.md)의 **웹 설정**이다. 한 단위/compile 호출 비용은 선점할 수 없어 엄격한 프레임 상한을 보장하지 않으며, 실측으로 조정한다. 원본은 컴파일된 shader 자원을 사용한다는 기존 [03_graphics](03_graphics.md)·[14_shader_graphs §30](14_shader_graphs.md)와 shader 자원 처리 `main @0x7100883ab0`([shader_fs_deg_env_sampler.c](../../../analysis/decomp/shader_fs_deg_env_sampler.c))의 binary 복사/메모리 pool 경로를 재사용한다. 이를 WebGL 런타임 compileAsync나 드라이버 비용0과 동일시하지 않는다.

[설계] 게임 선택 요청은 game ID·설정·owner·renderer generation과 연결한다. 선택 변경/화면 종료 뒤 늦은 결과를 현재 장면에 활성화하지 않고 scope를 해제한다. 완료 여부는 CPU ready/GPU ready/activated를 구분하며, 준비가 끝나지 않은 경우 기존 장면 전환의 완료 조건에서 기다린다. **선택 시 미리 받기와 완성 장면 직접 인계는 별도 기능**이다. 후자는 게임 로직·RNG·물리·소리 수명까지 검증하기 전 원본 등가라고 선언하지 않는다.

### 17.5 추출·검증·남은 조사

[데이터] 신규 산출물4개와 INDEX 행443개를 추가했다. main 추출본16헤더에는 이미 있던 `FUN_71008d7b90`의 호출 체인 재출력1개를 포함한다. mgInst 작은 NRO는 가이드대로 전체 추출했으며 **427함수 전부를 새로 판독했다는 뜻은 아니다**. 이번 의미 판독은 위 장면 수명7함수와 필요한 main 호출 체인으로 제한했다.

| 모듈 | 파일 | 함수 헤더·추출 실패 | 조사 목적 |
|---|---|---|---|
| main.nso | [render_prepare_archive.c](../../../analysis/decomp/render_prepare_archive.c) | 7·0 | loader 상태·수명·동기 적재·해제 |
| main.nso | [render_prepare_asset_jobs.c](../../../analysis/decomp/render_prepare_asset_jobs.c) | 6·0 | 공용 처리 객체·파일 job 생성 |
| main.nso | [render_prepare_queue.c](../../../analysis/decomp/render_prepare_queue.c) | 3·0 | job 조각 크기·읽기·큐 통지 |
| mgInst.nro | [mgInst.nro.c](../../../analysis/decomp/mgInst.nro.c) | 427·0 | 설명 화면의 실제 게임 호출·설명용 초기화 대기·정리 |

[데이터] main은 기존 프로젝트 `-noanalysis -readOnly`, mgInst는 원본 NRO를 읽기만 하여 별도 `ghidra_work/render_prepare/mginst_prepare` 프로젝트에 import/분석했다. 로그는 `test/out/render_prepare_{archive,asset_jobs,queue,mginst}_ghidra.log`다. mgInst import의 `.got section` 경고는 가이드의 알려진 경고이며 최종 import 성공·decompiled=427 failed=0을 확인했다. 최초 시도는 프로젝트 디렉터리 부재로 실패했고 디렉터리 생성 후 재시도로 완료했다. 생성된 C는 Ghidra 추정 인자/외부 블록 경고가 포함될 수 있으며 의미 확정은 근거 본문 범위에 한정한다.

[검증] C 헤더 수·추출 실패 표식·INDEX와 헤더의 1:1 대응·문서 링크/줄바꿈·diff 공백을 정적으로 확인한다. 런타임 코드 변경이 없어 Node 회귀/typecheck는 재실행하지 않았고 브라우저/헤드리스도 실행하지 않았다. §16의 구현·시험 결과와 이번 조사 검증을 구분한다.

| 번호 | 남은 미확정 | 후속 조사 기준 |
|---|---|---|
| P01 | 메뉴 커서에서 게임 전체를 준비하는 모든 간접 호출 경로 | 이번 확인은 mgm01 커서/목록2함수; 전체 콜백까지 부재를 확정하지 않음 |
| P02 | 원본 GPU 준비 job에 프레임 예산 분배가 있는지 | 확인된 공용 큐는 파일 I/O; GPU dispatcher와 frame budget을 임의 연결하지 않음 |
| P03 | 안내 종료 → 본게임의 자원 유지 범위·객체 재생성 비용 | 다른 sequence shutdown과 exchange 하위 수명, ArchiveModule 유지/참조 증감의 교차 근거 필요 |

[상태] 사용자 결정 대기 없이 문서 반영 완료. 이번 추출 대상은 모두 확보하여 Ghidra 추출 요청 잔여 주소0개다. P01~P03은 새로 특정하지 않은 분석 범위이며 원본 동작을 임의 기본값으로 채우지 않는다.

[최종 검증 결과] 기존 본문 보존/작업 전 줄바꿈8항목, 추가 링크43개, C 헤더와 INDEX 대응443개 모두 통과했다. 추출 실패0, `git diff --check` 공백 오류0. 처음 검증기의 줄바꿈 비교는 git blob의 LF를 작업 트리 CRLF와 비교해 실패했으며, 작업 전 실제 줄바꿈을 기준으로 고쳐 재검증했다. 문서 줄바꿈은 변환하지 않았다.

## 18. 선택 게임 실제 에셋·메뉴 중 GPU 준비 구현 (2026-10-10)

[설계: 구현 전 기록] 사용자 요청으로 game 코드/manifest 예측을 필수 에셋까지 확장하고 RenderService prepareQueue를 추가한다. 게임별 자원 준비와 활성화를 분리한다. §17의 원본과 웹의 차이를 유지하며 mgInst·게임 로직의 선행 실행은 추가하지 않는다.

- 파일 구성: `app/common/render/prepare.ts`의 취소 가능한 GPU 준비 scope·budget 큐, RenderService와 MenuSurface의 표시 프레임 경계; `app/flow/preparation.ts`의 선택 준비 수명; GameView 준비/활성화 계약; mg1801 소비자와 game 에셋 목록; flowCatalog·mgm01·게임 호스트 연결.
- 선택 범위: 현재 제품 등록 게임 mg1801. 다른 게임은 준비 계약을 제공할 때 같은 경로를 사용한다. 현재 목록/설정에서 선택 게임을 유지하고 선택 변경·목록 종료 때 취소한다. 옵션/캐릭터의 준비 키와 renderer generation을 확인하고 완료된 그래픽 준비 결과만 활성화에 사용한다.
- 자원 준비: 게임 manifest·모델·재질/IBL 파일·이펙트·캐릭터/모션·UI·소리의 실제 필요 경로를 열거한다. 공용 AssetManager를 재사용하며 입력/논리 frame/난수/소리 재생은 진행하지 않는다. 사운드 디코드·시퀀서 연결은 활성화에서 수행한다.
- GPU 경계: PMREM·post 생성/준비·ScenePreparer 작업을 같은 renderer의 취소 가능한 준비 scope에 등록한다. GPU 단위는 scratch RT와 RendererState 복원으로 표시 상태를 보존한다. 메뉴 draw 뒤 예산 내 단위를 실행하며 활성 화면이 없을 때도 준비가 진행된다. PC4ms/모바일2ms는 웹 정책이며 비선점 단위의 엄격한 시간 상한을 보장하지 않는다.
- 취소: 더 이상 필요한 준비가 아니면 scope와 자원 owner를 해제하고 늦은 완료를 활성화하지 않는다. 진행 중 compileAsync는 완료를 기다린 후 그래픽 자원을 정리한다. 실패/취소를 ready와 구별하고 게임 시작에서 재시도할 수 있게 한다.
- 시험: 기존 기대값 유지. Node로 필수 에셋 목록·CPU 캐시 재사용·메뉴 중 GPU 호출/상태 복원·예산/취소/실패/손실·준비→활성화·선택 변경·늦은 완료·재시도를 검증한다. typecheck와 관련 기존 시험을 실행한다. 브라우저/헤드리스·새 npm 의존성·원본 추가 판독은 수행하지 않는다.

[진행] 문서 기록 완료, 구현/검증 진행 중. 구현 결과·제한·시험 결과는 이 절에 추가한다.

### 18.1 시작 화면부터 광장 준비 — 추가 사용자 요청

[설계: 구현 전 기록] 첫 게임 시작의 인원 설정·캐릭터 선택부터 광장 필수 에셋 다운로드와 GPU 준비를 진행한다. boot에서 광장 P0/UI/NPC 묶음을 유휴 P3로 예측하고 현재 화면 P0와 캐릭터 선택 P2를 우선한다. 데이터 절약 lite/off 정책은 유지한다. 광장 코드/manifest 준비를 기다리는 동안 메뉴 진행을 막지 않는다.

[설계] 기존 광장 prewarm의 독점 lease를 준비 scope로 바꾼다. 메뉴 진입에서 준비 world를 정리하지 않으며 메뉴 표시 프레임 뒤에 광장 ScenePreparer·PMREM·post 작업을 실행한다. 공유 renderer의 canvas·크기·출력 상태를 준비 때문에 바꾸지 않는다. 광장 진입은 표시 lease를 얻은 뒤 기존 world를 promote/adopt하고, 표시용 상태 적용을 따로 수행한다. 게임 진입/문맥 손실은 준비 scope를 취소하고 진행 중 작업 종료 후 world를 해제한다.

[검증 계획] 메뉴 활성 상태에서 광장 준비·GPU 상태 복원·world 재사용·취소/손실을 Node로 확인한다. 부팅 광장 예측을 새로 검증하고 기존 인원 설정/캐릭터 선택 우선순위·캐시·광장 동작 시험을 유지한다. 실제 GPU 드라이버 비용·시각적 결과는 이번 Node 검증으로 확정하지 않는다.

[설계 보완] 광장 P0 목록은 첫 모델뿐 아니라 env의 IBL·sky·LUT·env animation을 포함한다. HDR 바이트도 공용 관리자에서 받아 재사용하며 준비 중 직접 HDR 다운로드로 같은 파일을 중복 받지 않는다. 준비 실패/취소된 IBL 캐시 항목은 재시도 가능하게 비운다.

[설계 보완] HDR 변환의 자원 인터페이스만 `common/render3d/hdr.ts`로 옮기고 기존 `common/assets/hdr.ts`는 재수출한다. render3d가 assets 폴더에 의존하지 않도록 기존 경계를 유지한다. envAnim은 이름이 아닌 manifest.anims의 실제 JSON 경로를 받는다. 설치 시 이미 setplayer에 진입한 경우에도 광장 예측을 요청하여 boot → setplayer의 빠른 전환에 누락되지 않게 한다.

[설계 보완] 광장 준비의 자원 owner는 실행 광장과 구별한다. 준비 취소 시 owner를 release하고 모델/compile 정리를 기다린다. 인계된 stage도 같은 owner를 보유하다가 stage 해제 때 release한다. CPU 캐시를 삭제하지 않으며 다른 장면 참조를 취소하지 않는다. Node 렌더 서비스의 이전 독점 prewarm 시험은 메뉴 중 scope 준비 계약으로 갱신하고, 기존 광장 수치 기대값은 유지한다.

### 18.2 사용자 보고 시작 실패 — 재현·수정 방침

[실행: 사용자] 프리 플레이 → 싹둑싹둑 수프에서 `시작 실패: GPU preparation failed`. 상세 스택은 `TypeError: Cannot read properties of undefined (reading 'length')`, three.module.js:4295 WebGLMorphtargets.update → ScenePreparer.upload다.

[판독: 웹 코드/에셋] 설치된 three의 WebGLMorphtargets.update는 object.morphTargetInfluences.length를 읽는다. 모션 GLB의 Points는 원본 파싱 결과에 morphTargetInfluences가 있지만 SkeletonUtils.clone 뒤에는 없다(Points.copy가 Mesh.copy와 달리 morph 배열을 복사하지 않음). Assets.prepare의 숨겨진 모션 템플릿 업로드에서 노출된다. 실제 pc01~04 모션 GLB의 복제 Points에서 같은 결손을 Node로 확인했다. 원본 ComActor/모션 계산 규칙의 변경이 아니다.

[수정 방침] Assets.gltf의 Points 복제에 source의 morphTargetInfluences·morphTargetDictionary를 독립 복사한다. 기존 가중치를 0으로 덮어쓰거나 모션을 생략하지 않는다. 실제 모션 파일과 three의 WebGLMorphtargets.update를 Node에서 호출하여 같은 예외 경로를 재현/검증한다. GPU 준비의 후속 실패는 원인도 전달하도록 개선한다.

[설계 보완] 광장 world 생성 도중 실패/취소한 경우에도 공유 CPU scheduler 예산을 복원한다. 캐릭터 GPU 준비 실패 시 생성한 캐릭터도 정리한다. 준비 scope의 owner 해제를 별도 Node 검사한다.

### 18.3 완료 파일·상태·검증

[완료] 선택 게임 실제 에셋 예측, 메뉴 중 GPU prepareQueue, view 준비/활성화 분리와 취소/완료 인계, 초기 메뉴부터 광장 준비/입장 재사용을 적용했다. 앞선 진행 중 기록의 최종 상태다. 현재 등록 소비자는 mg1801과 광장이다. 다른 게임은 선택적 준비 계약을 구현하면 같은 호스트 경로를 사용한다.

| 구성 | 만든·변경한 파일(web 기준) |
|---|---|
| 공용 큐/메뉴 프레임 | `script/app/common/render/{prepare,service,menu}.ts`, `script/app/common/ui/view.ts`, `script/app/scene/menu/{charselect,modeselect}/screen.ts` |
| 자원/GPU | `script/app/common/assets/{index,hdr}.ts`, `script/app/common/render3d/{hdr,material,stage}.ts`, `script/game/lib/assetcore-three/index.ts` |
| 선택/호스트 계약 | `script/game.ts`, `script/app/flow/{preparation,host,index}.ts`, `script/mgm01_page.ts`, `script/view/{appFlow,flow,flowCatalog,flowTable,menuRenderer}.ts` |
| mg1801 소비자 | `script/app/minigame/mg1801/{assets,index}.ts`, `script/app/minigame/mg1801/view/{index,material,stage}.ts` |
| 초기 광장 | `script/view/plazaGl.ts`, `script/app/scene/world/plaza/world.ts` |
| 신규/보완 시험 | `tools/test_{game_prepare,game_assets,render_service,plaza_gl}.ts` |
| 분할 오류 후속 | `script/app/common/render3d/post.ts`, `tools/{test_splitscreen,test_render_common,render_common_fixture}.ts`, `docs/engine/{10_split_screen,render_common}.md` |
| 문서 | 이 문서 §18, `docs/engine/loader_manager.md` §17, `DESIGN.md` 후속 |

[시작 실패 수정 완료] 실제 pc01~04의 idle/swing/blink/win 모션 GLB16개와 Points32개를 검사했다. 수정 전 **17/18**에서 복제 morph 배열 결손을 재현했으며 수정 후 game_assets **18/18** 통과했다. 복제 weights/dictionary의 독립성과 설치된 Three WebGLMorphtargets.update 호출도 확인했다. GPU 실패 메시지에는 원인을 포함한다. 이후 추가 사용자 보고의 `/dev/ui` 분할 오류는 [render_common §6](render_common.md#6-분할-화면-dofneutralunrealbloom-영역-출력-수정-2026-10-10)에 별도 재현·수정·회귀 결과를 기록했다.

| Node 시험 | 통과 수 |
|---|---:|
| test_game_prepare / test_game_assets / test_assetcore | 8/8 (실재 367키) · 18/18 · 47/47 |
| test_render_service / test_plaza_gl | 42/42 · 69/69 |
| test_splitscreen / test_render_common | 159/159 · 129/129 |
| test_prefetch / test_entry / test_mgm01 | 136/136 · 429/429 · 277/277 |
| test_mg1801 / test_mgscene | 97/97 · 79/79 |
| test_charselect / test_setplayer / test_modeselect | 67/67 · 116/116 · 71/71 |
| test_layout / test_layout_runtime / test_layout_draw | 68/68 · 16/16 · 68/68 |
| test_plaza_world (PLAZA_SKIP_GLSL=1) | 474/474 |

[검증] 관련 Node 검사 합계 **2370/2370**, `npm run typecheck` 통과. 로그 `test/out/game_prepare_*.log`. 브라우저/헤드리스 실행 없음. 광장 GLSL 검증은 기존 시험 옵션으로 제외했고 WebGL 픽셀/첫 프레임 실측은 수행하지 않았다. 기존 문서의 별도 character/camera 골든 실패를 이번 관련 검사 전체 통과에 포함하지 않는다.

[검증 중 보완] 실제 envAnim 이름을 파일 경로로 해석한 예측 키 누락은 manifest.anims 매핑으로, render3d→assets import 경계 위반은 공용 HDR 인터페이스 이동으로 수정했다. 새 실패 fixture의 typecheck 오류 `Type '{}' is missing ... PlazaDecoState: display, unlockBd`는 올바른 fixture 반환 구조로 수정했다. 기존 광장/분할 수치 기대값은 바꾸지 않았다. 이전 독점 prewarm과 영역 거절의 시험 계약만 이번 구현 계약으로 갱신했다.

### 18.4 웹 정책·한계·사용자 확인

- 준비는 game.step/물리/실제 RNG/패드/소리 재생을 진행하지 않는다. 실제 게임 setup/audio/pads는 활성화에서 주입한다. 사운드 파일 예측과 디코드 완료는 구별하며 BGM의 나머지 chunk는 스트리밍한다.
- PC4ms/저메모리2ms·scratch RT·메뉴 프레임 남은 시간은 웹 정책이다. GPU 단위를 선점하지 못해 드라이버 compile/PMREM이 한 프레임 예산을 넘을 수 있다. 동적 이펙트/Lyt·shadow/RT 최초 할당까지 모두 0ms가 되는 보장은 없다.
- 광장 초기 요청은 기본 full 정책에서 인원 설정부터, lite는 캐릭터 선택 시점부터 진행하고 off는 끈다. 현재 메뉴/캐릭터의 우선순위를 유지한다. 설치 시 boot 화면을 놓친 경우에도 초기 광장 묶음을 요청한다.
- GPU 준비 scope/Assets owner는 취소·해제하고 진행 중 compile 완료 뒤 정리한다. 공용 CPU 캐시와 이미 요청한 owner 없는 예측 fetch는 삭제/강제 취소하지 않는다. 늦은 결과는 활성 장면에 인계하지 않는다.
- 프리패치의 게임별 CPU 목록 캐시는 선택 캐릭터가 바뀌면 이전 조합을 보유할 수 있다. 최종 view 준비는 현재 preparationKey/캐릭터로 다시 확인하여 실제 자원을 받는다. 캐시 키 세분화는 후속 최적화이며 시작 정확성의 조건으로 사용하지 않는다.

[사용자 확인 필요] 이번 구현/오류 수정에서 추가 결정 필요 없음. 실제 브라우저 화면·GPU 시간 확인은 미실행으로 남는다. 원본 추가 분석 없음, 신규 Ghidra 추출 요청 주소 **0개**. 기존 P01~P03·후처리 R1~R3 미확정은 유지한다.
