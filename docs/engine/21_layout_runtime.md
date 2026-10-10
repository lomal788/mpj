# 21. 레이아웃 공용 런타임

2026-10-10. B5 구현 기록. 근거는 [로드맵 B5](common_roadmap.md), [05 §3](05_ui_input.md), [ui2d Alignment](../shell/ui2d_alignment.md), [render_unify §7.1](render_unify.md). 이미 판독한 원본 함수를 다시 분석하지 않는다.

## 1. 범위와 경계

| 경로 | 역할 | 상태 |
|---|---|---|
| `script/game/lib/layout/index.ts` | import0 공용 타입·페인/재질 상태·Hermite/step·재생·부품·계층 변환 | 완료 |
| `script/game/lib/layout-three/index.ts` | 공용 페인 순회·사각형/글자/창/마스크·GPU 자원, three+자기 코어만 | 완료 |
| `script/app/common/ui/layout/` | 기존 JSON 두 형식 연결·폰트/이미지/문자 raster provider·HUD 출력 연결 | 완료 |
| `script/app/common/render3d/assetHooks.ts` | 공용 로더 hook의 단일 인스턴스; 종전 경로는 재수출 | 완료 |
| charselect scene2d/render2d, view/lyt | 이전 import의 호환 export만 남김; 소비자도 공용 경로로 이동 | 완료 |

원본의 nn::ui2d/ComGuiLayout 기반과 화면별 UI 매니저 구분을 따른다. 선택 상태·문구·메시지 태그·효과음·표시 시점·Alignment 요청은 app에 남는다. 원본 Alignment 수학은 기존 공용 UI 구현을 재사용하며 새 범용 측정기로 확장하지 않는다.

## 2. 기존 차이와 보존 계약

| 항목 | 메뉴 | HUD | 통합 처리 |
|---|---|---|---|
| 입력 | 평평한 nodes/mats/트랙 | BFLYT 트리·이름 기반 BFLAN | app에서 공통 LayoutSpec으로 정규화 |
| 상태 | 단일 애니·next·부품 | main+페인별 애니·부품 | 하나의 상태/트랙 적용기에 채널 지원 |
| 색 값 | 0..255 clamp 후 반올림 | 소수 값 유지 | 명시적인 hudLegacy 호환 정책 |
| 부모 가운데 원점 | 로컬0 | 부모 사각형 가운데 | hudLegacy에만 기존 bounds-center 유지 |
| 부품 루트 | 부모 anchor 분리·mag 적용 | 부품 페인을 부모로 사용 | 정책 보존 |
| 창 | 내용 재질 별도·테두리 흰 정점색 | 프레임 재질로9칸·전체 정점색 | 정책 보존 |
| 글자 | 컬러 glyph·시스템 글꼴 fallback | 커버리지·OTF 텔롭·없는 폰트 생략 | glyph 공급/문자 raster는 app provider |
| GPU | 선형 RT/MSAA4→불투명 sRGB | 감마 근사·premultiplied 투명→HUD canvas | 두 출력 profile을 명시적으로 유지 |
| 텍스처 | 첫 SRT·동적 RT·flipV | 두 SRT·FLTP·마스크 | 공용 renderer가 기능 합집합 지원 |

## 3. 근사·보류

- L01: 기존 JS 배정밀도 Hermite·삼각함수·시계 계산을 보존한다. 이번 구조 이전을 원본 f32/SDK 비트 동등으로 주장하지 않는다. 난수/벽시계를 재생에 추가하지 않는다.
- L02: 위 hudLegacy 정책과 두 GPU 출력은 기존 웹 호환이다. 원본과 어느 쪽이 일치하는지는 개별 판독/화면 검증 없이는 승격하지 않는다.
- L03: TEV 두 텍스처 곱·창9칸·시스템 폰트·OTF raster·mask 합성 등 기존 근사는 유지한다. 전체 nn::ui2d 구현은 아니다.
- L04: WebGL context 단일화·RT 소유권은 render_unify 범위다. 재생기/그리기 통합과 구분하며 이번에 HUD canvas를 제거하지 않는다.
- L05: 기존 출력의 픽셀 동등은 브라우저/헤드리스 미실행으로 미검증이다. 노드에서 이전 전 상태·draw command 골든, 실제 에셋, 기존 시험을 검증한다.
- 새 Ghidra 추출 요청0. 추가 사용자 결정 없이 기존 동작 보존으로 진행한다.

## 4. 검증 및 적용 결과

2026-10-10 완료. 메뉴·광장 UI·공용 창·리듬 HUD가 같은 `LayoutInst` 상태/트랙 적용기와 `LayoutRenderer` 페인 순회·quad 생성기를 사용한다. BFLYT/BFLAN은 app에서 정규화하고, `LayoutInstance`/`AnimPlayer`는 같은 core 상태를 노출하는 호환 연결부다. main·페인별 채널·부품은 호출당 한 번 진행한다. `LayoutDocument`에는 화면별 선택 상태나 게임 규칙을 넣지 않는다.

메뉴 `Render2D`와 HUD `LytRenderer`는 공용 renderer를 호출하는 app 연결부다. 시스템/OTF raster는 app provider, glyph 배치·마스크·SRT·창은 공용 renderer에 둔다. 폰트 메트릭·시트 캐시는 공용 위치로 옮기고 이전 경로는 재수출하여 중복 캐시를 만들지 않는다. UV 배열은 인스턴스별로 복사한다. renderer가 만든 자원은 dispose하고 외부에서 빌린 동적 텍스처·폰트 시트는 보존한다.

### 4.1 노드 검증

| 시험 | 결과 |
|---|---|
| `test_layout.ts` — 실제 68개 레이아웃, 이전 전 상태·계층 변환 골든 | 68/68 |
| `test_layout_draw.ts` — 이전 전 기하·UV·색·SRT·mask·순서·blend 명령 골든 | 68/68 |
| `test_layout_runtime.ts` — 보간/끝/반복·채널/부품 수명·텍스처 교체·문자 배치·마스크·자원 소유권·import 경계 | 16/16 |
| `check_charselect.ts`, `test_charselect.ts` | 2410/2410, 67/67 |
| `test_plaza_ui.ts`, `test_plaza_world.ts`, `test_plaza_gl.ts` | 126/126, 466/466, 60/60 |
| `check_mgmcommon.ts`, `test_mgmcommon.ts` | 12966/12966, 119/119 |
| `test_mgscene.ts`, `test_mgmet.ts`, `test_mgm01.ts` | 79/79, 218/218, 277/277 |
| `test_setplayer.ts`, `test_partyrule.ts`, `test_mgmscreens.ts`, `test_entry.ts` | 116/116, 106/106, 38/38, 404/404 |
| `test_mg_freeplay.ts`, `test_fonts.ts`, `test_assetcore.ts` | 13/13, 138/138, 47/47 |
| `test_mg1801.ts` | 종료 코드0 |
| `npm run typecheck` | 통과 |
| esbuild 기존 options(false), write:false 메모리 번들 | 통과, 출력165개 |

계수 시험 합계17802/17802. 브라우저·헤드리스·실제 WebGL 실행은 하지 않았다. `test_plaza_world`는 `PLAZA_SKIP_GLSL=1`; `test_plaza_gl`은 가짜 GL 규칙과 실제 광장 코드·PhysX 자산을 사용하는 노드 시험이다.

골든은 이전 구현에서 저장한 `tools/layout_golden.json`·`tools/layout_draw_golden.json`이다. 상태 숫자는 1e-9, draw 숫자는 1e-7로 반올림해 해시한다. draw 골든은 텍스트를 비우고 빈 이미지 공급자를 쓰므로 실제 이미지/글꼴 픽셀 검증을 뜻하지 않는다. 글리프 메트릭·alpha·색 mode·배치는 별도 합성 자료 시험으로 확인한다. 골든 재기록 옵션은 최종 시험에 남기지 않았다.

### 4.2 발견한 실패와 수정

- 이전 경로를 제한하던 import 경계 시험은 공용 core/adapter/provider 경로만 허용 목록에 추가했다. 기존 화면 동작 기대값은 변경하지 않았다.
- draw 골든 2건의 초기 불일치는 시험이 재사용 SRT 행렬의 배열을 참조로 저장했기 때문이다. 배열을 복사하도록 고친 뒤, 보관한 **이전 구현**으로 기준을 다시 기록하고 새 구현 68건을 대조했다.
- `test_plaza_gl` 초기 실패 원문: `TypeError: Failed to parse URL from mem/plaza/world/physics/physics.json`. actor 이전 이후 필요한 fetch/wasm 경로가 가짜 에셋 관리자 밖에 있어 기존 시험이 로드를 못 했다. 시험에 제한된 로컬 파일 fetch와 wasm URL 모듈 hook을 추가하여 실제 PhysX·APX·ActorParam을 읽게 했다. 제품 로더·충돌 규칙·60개 기대값은 변경하지 않았다. Node24.13.0에서 통과했다.
- 최종 실패0. 픽셀 동등·출력 profile 원본 일치 여부·WebGL context 단일화는 §3 L02~L05에 남긴다. 추가 사용자 확인 필요 없음, Ghidra 추출 요청0.
