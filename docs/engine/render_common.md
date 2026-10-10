# B2·B7 후처리·재질 공통화 구현 기록

2026-10-10. 사용자 범위: 기존 웹 처리 공통화만 수행한다. 원본 추가 판독·추출·그래프 생성·계산식 보정은 하지 않는다. 기존 근거는 [07 §3.3](07_camera_lighting.md#33-조명포스트-만들기-판독-mg1801-0x710000f9d0), [03 §4.4](03_graphics.md#44-재질)을 재사용한다.

## 1. 구현 계약

- `app/common/render3d/post.ts`: 장면 HDR 타깃, 크기 변경, 패스 실행, FXAA, 영역 출력, 해제의 공용 소유자. 기존 광장 합성과 mg1801 Neutral/UnrealBloom 근사는 명시적인 선택으로 보존한다. 공통화하면서 톤맵·블룸·DOF 식이나 적용 순서를 바꾸지 않는다.
- `app/common/render3d/postApprox.ts`: 기존 mg1801 DOF·UnrealBloom·OutputPass 근사를 옮긴 선택 처리. 게임 이름·프리셋을 알지 않는다.
- `app/minigame/mg1801/view/post.ts`: 기존 post/post_result00 값과 전환을 공용 PostChain에 전달하는 어댑터.
- `app/common/render3d/material.ts`: 그림자 플래그·기본색·GI·IBL·캐시·텍스처·PMREM 수명·조명 패치를 하나로 사용한다. 외부 로더는 주입한다. 기존 광장의 그래프·물·굴절·SSS 처리는 유지한다.
- `app/minigame/mg1801/view/material.ts`: 텍스처 색인·환경 큐브 이름·B4 로더·기존 lightingOnlyApprox 범위만 지정한다. 기존 mg1801에서 없던 광장의 물 합성·SSS·굴절 등을 새로 켜지 않는다.
- `app/minigame/mg1801/view/water.ts`: 수프 고유 그래프·애니메이션을 유지하고 공용 재질 준비 및 자원을 사용한다. 광장 물과 수프 표면의 식을 억지로 합치지 않는다.

공용 코드는 게임·view·dev를 import하지 않는다. 기존 파일은 삭제하지 않고 소비자 어댑터로 남긴다. 기존 주석은 이동 시 보존하고 낡아진 설명만 수정한다.

## 2. 단계별 상태

| 단계 | 상태 |
|---|---|
| 기존 경로·차이 및 보존 범위 확인 | 완료 |
| B2 공통 패스 수명·선택 처리·프리셋 이전 | 완료. neutralBloomApprox·fxaaDigits=4 보존 |
| B7 재질 준비·자원·물 그래프 연결 | 완료. lightingOnlyApprox 및 수프 고유 그래프 보존 |
| 기존 구현 대비 Node 회귀·타입·번들·경계 검증 | 완료. 기존 카메라 골든 8건 실패는 아래 분리 |

## 3. 근사·보류

- R1: mg1801 Neutral 톤맵, UnrealBloom, 노출 곱셈, DOF 초점 구간/6px·32표본은 기존 근사 그대로다. 원본 식 복원은 이번 범위 밖이다.
- R2: 광장의 LDR FXAA 순서·물 깊이 상수·IBL 정규화 등 기존 근사도 유지한다.
- R3: mg1801 수프의 미판독 흐름·반사·수중 입력은 새로 분석하거나 기능을 채우지 않는다.
- R4: 실제 WebGL 픽셀 일치는 Node 시험으로 확정하지 않는다. 브라우저·헤드리스 실행은 하지 않는다.

공용 API의 영역 출력은 기존 광장 경로에만 적용한다. 기존 mg1801 근사 및 새 DOF 선택의 영역 출력은 지원하지 않으며 명시적으로 거절한다(과거에도 분할 출력 경로가 없었다). 사전 컴파일은 선택한 근사 패스의 실제 셰이더와 출력 타깃을 준비한다.

공용 해제 시험에서 three r180 `UnrealBloomPass.dispose()`가 `materialHighPassFilter`를 해제하지 않는 기존 누락을 확인했다. 공용 소유자가 이 재질도 명시적으로 해제한다. 셰이더 식·출력에는 영향이 없다.

## 4. 검증 기록

기준은 통합 전 커밋 `6c38cc1`. 기존 두 post.ts·두 material.ts를 `git show`로 읽어 메모리 esbuild에 주입하여 동일 fixture를 실행했고, 그 결과를 `tools/render_common_golden.json`에 새로 기록했다. 기존 시험 기대값은 변경하지 않았다. 소스 함수의 toString·무작위 UUID는 기록에서 제외하고 실제 shader source·uniform·재질 상태·타깃/패스 순서·렌더러 복원 상태를 비교한다.

| 시험 | 결과 | 범위 |
|---|---|---|
| `test_render_common` | 129/129 | 통합 전 출력 계약 122건 + 프리셋 격리·사전 컴파일·자원 해제·로더 주입·경계 7건 |
| `test_plaza_world` | 471/471 | 물/굴절 패치·데이터·import 경계. PLAZA_SKIP_GLSL=1 |
| `test_plaza_gl` | 60/60 | 가짜 GL·실제 PhysX를 쓰는 Node 시험 |
| `test_splitscreen` | 115/115 | 기존 광장 PostChain 영역 출력·상태 복원 포함 |
| `test_game_assets` | 16/16 | B4 캐시·소유권·캐릭터 복제 |
| `test_entry` | 410/410 | app/dev import 경계 |
| `test_mg1801` | exit 0 | 게임 로직·수프 애니 반복·결정성 |
| `test_mg_assets` | 2052/2052 | 다른 게임 자산·그래프·경계 |
| `test_character` | 127/135 | 기존 결과 무대 카메라 골든 8건 실패 유지 |
| `npm run typecheck` | 통과 | TypeScript 전체 |
| 배포 옵션 메모리 esbuild | 통과, 165 outputs | write:false, 배포 파일 생성 없음 |

집계 가능한 시험은 3380/3388이고 mg1801은 별도 exit 0이다. 새 공통화 시험의 통합 전 비교는 후처리 12건(세 해상도·FXAA on/off·프리셋 전환·리사이즈·직교 카메라), mg1801 재질 99건, 수프 6프레임, 공용 물/굴절/SSS/unlit/가산 5건이다. GLSL 실행·실제 GPU 픽셀 검증을 뜻하지 않는다.

`test_character` 실패는 [20_camera_runtime §14.4](20_camera_runtime.md#144-b4-검증에서-발견한-기존-회귀-2026-10-10)와 [loader_manager §15](loader_manager.md#15-b4-게임-에셋-로더-통합-2026-10-10)에 앞서 기록한 실패와 모두 같은 해시다. 카메라 코드·기존 골든 수정은 이번 공통화 범위에 넣지 않았다. 실패 원문:

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

## 5. 사용자 확인 필요·추출 요청

이번 범위에서 추가 결정이 필요한 항목은 없다. 원본 추가 분석·Ghidra 추출 요청은 0건이다. 원본 식 복원(R1~R3)과 기존 카메라 골든 문제는 별도 작업으로 남긴다.

## 6. 분할 화면 DOF·Neutral/UnrealBloom 영역 출력 수정 (2026-10-10)

[실행: 사용자] `/dev/ui` 분할 화면 시작 시 `Approx post does not support region rendering`, PostChain.renderRegion → SplitRenderer.render → MgStageImpl.renderSplit. 실제 기본 게임 `assets/mg/mg0508/manifest.json`의 env.post는 dof=true다. 기존 §3의 명시적 거절이 실제 소비자를 막았다. 이번 절이 §3의 영역 미지원 상태를 대체하며 기존 기록은 보존한다.

[설계: 구현 전] DOF 또는 neutralBloomApprox일 때는 분할 scissor 크기의 독립 HDR/DOF/블룸/FXAA 중간 타깃을 사용한다. 장면 viewport는 전체 화면 좌표에서 scissor 원점을 뺀 값으로 이동하여 분할 전환 중 큰 viewport·잘린 영역을 보존한다. 마지막 패스만 canvas/출력 RT의 해당 scissor에 배치한다. 인접 화면의 색/깊이를 DOF·블룸 표본으로 읽지 않으며 표시/RT의 viewport·scissor·autoClear·target을 복원한다.

[근사] 기존 DOF 식과 local 높이에 따른 6px/1080 비율을 사용한다. 원본 분할 DOF의 경계 표본 방식은 새로 판독하지 않는다. DOF·Neutral 없는 기존 전체 RT 영역 경로와 단일 화면 식·패스 순서는 유지한다. 레이어마다 후처리하므로 비용은 레이어 수에 비례한다.

[검증 계획] Node로 실제 mg0508 설정 + SplitRenderer 2×1·2×2·focus/전환·홀수 크기·DPR·RT/capture·예외 복원과 Neutral/UnrealBloom+DOF 모드를 확인한다. 기존 단일 화면 golden과 분할 코어/기존 영역 출력 기대값을 유지한다. 과거 미지원 거절 시험은 새 지원 계약의 시험으로 대체한다. 브라우저/헤드리스는 실행하지 않는다.

[구현 완료] `common/render3d/post.ts`에 영역 크기 선택·viewport 원점 이동·최종 출력 영역·finally 복원을 적용했다. `tools/test_splitscreen.ts`에는 실제 mg0508 설정을 사용하는 44개 검사를 추가했다(기존 115개 유지). `tools/test_render_common.ts`의 기존 영역 미지원 거절 검사를 지원/복원 검사로 바꾸고 `tools/render_common_fixture.ts`에 필요한 renderer 상태 인터페이스를 추가했다.

[검증] 수정 전 실제 설정 + SplitRenderer 시험에서 `Error: Approx post does not support region rendering`을 재현했다(`test/out/game_prepare_split_before.log`). 수정 후 분할 시험 **159/159**, 공용 재질/물/후처리 golden·수명·경계 시험 **129/129**, `npm run typecheck` 통과. 2×1·2×2·focus·viewport/scissor 차이·DPR1.25/1.5·홀수 크기·RT·capture·FXAA on/off·stage/neutralBloomApprox·빈 영역·예외 복원·다음 단일 화면 크기를 확인했다. 분할 코어의 GC 0회 기대값은 유지했다. 워밍업의 지연 GC 통지가 측정에 섞여 `FAIL ... GC 0회 ... — gc 1`이 발생하여 측정을 GPU fixture 생성 전에 두고 워밍업 뒤 이벤트 통지를 기다리도록 했다. 이후 두 차례 159/159 통과했다.

[한계] 독립 중간 타깃은 다른 레이어 표본이 섞이지 않는 구조지만 실제 GL 픽셀/브라우저 화면은 실행하지 않았다. 분할 크기 변경 때 RT를 재할당하며 각 레이어에 체인을 실행하는 비용이 있다. 원본 미확정 식 R1~R3은 이 수정으로 확정되지 않는다. 새 원본 판독·Ghidra 추출 요청 0건, 사용자 추가 결정 필요 없음.
