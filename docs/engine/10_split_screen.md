# 10. 화면 분할 — 레이어·뷰포트·보정 카메라·경계 UI

2026-10-09. 상태: **공통 계약 정적 판독·수치 검산 완료 / 웹 공용 런타임 구현(§9 웹 구현 계약)**.
확정 수준: **[판독]** 원본 코드·ARM64 호출 인자, **[데이터]** 원본 자산, **[계산]** 정적 재구현 계산으로 원본식을 독립 검산, **[웹]** 현재 구현, **[미확정]** 미판독·원본 출력 대조가 필요한 항목. 주소는 모듈과 SwitchLoader 베이스 `0x7100000000`을 함께 쓴다. 원본 게임 실행·구현 변경은 하지 않았다.

## 1. 기존 근거와 적용 게임

카메라 행렬·FSNB 커브·aspect 적용 플래그는 [07_camera_lighting.md §4·§6·§9](07_camera_lighting.md), 시간은 [01_core.md](01_core.md), 레이아웃·입력은 [05_ui_input.md](05_ui_input.md)를 재사용한다. 포스트 셰이더·패스는 [plaza_3d.md §6.13](../shell/plaza_3d.md), 3D→레이아웃 투영은 [plaza_guide.md §2.1](../shell/plaza_guide.md)이 근거다. 기존 공통 문서에 없는 분할 계약만 이곳에 둔다.

| 게임·조건 | 원본 호출과 연결 [판독] | 게임 문서에 반영할 내용 |
|---|---|---|
| [mg0102](../minigame/mg0102.md), VS4 | `CameraMgr::Create @0x7100003860`: Camera00~03→GraphicsLayer 0~3. `InitParam @0x71000046d0`의 BL `@0x71000047d0`, `SetInitState @0x71000049c0`의 B `@0x7100004ba0`: **(2,2,0,0)**. `StartOpeningTransition(bool) @0x7100004ec0`→**(2,2,−1,skip?0:1)**, `StartCloseTransition(bool) @0x71000050f0`→**(2,2,0,skip?0:1)**. `SetFinishCamera @0x7100005500`→(2,2,0,0) | §7의 초기 호출을 네 영역 표시로 해석한 문장을 수정. 초기/닫기/결과는 화면0 전체, 오프닝 전환 후만 균등4분할. 설명 화면 안 실행 flag0도 별도 인원수 분할이 아니다. 기존 플레이어별 시점·입력 방향식 재사용 |
| [mg0122](../minigame/mg0122.md), VS4 | `CameraMgr::Initialize @0x710001fea0`: Camera(mask,index)=(1,0),(2,1),(4,2),(8,3). `CameraSplitConfig @0x710002010c`: (2,2,0,0). `StartSplitScreen(int,float) @0x7100020394`는 focus·시간을 그대로 전달. 시작 전 호출 `@0x7100027644`: **focus=−1,시간=0**. `Notify @0x71000201d4`의0x29도균등4분할, `NotifyGameMainFadedOut @0x7100020284`는 focus0 복귀 | §3.3 시작 전 `StartSplitScreen(0)`는 시간만 표시한 축약이다. 전체 인자는 (−1,0). §6.3 사진 투영과 실제 사분면 UI 투영을 구분. §9에 캡처 RT·상태 복구 계약 연결 |
| [mg0508](../minigame/mg0508.md), 2팀×2명 | `CameraMgr::Initialize @0x71000035b0`, 호출 `@0x7100003694`: **(2,1,0,0)**. `BeginSplit(float) @0x7100004350`, 호출 `@0x710000447c`: **(2,1,−1,duration)**. `ResetSplit @0x7100004840`, 호출 `@0x7100004958`: (2,1,0,0). Camera0/1→GraphicsLayer0/1; 같은 game 클립, Field 모델 bit=`1<<team` | §7의 Initialize와 BeginSplit 인자를 구분. 초기에는 팀0 전체, BeginSplit 후 좌/우 팀 화면. §3.2의 TeamID별 두 플레이어 수집 순서 유지. 최신 §7.2의 점수 UI·애니·팀 바인딩 재사용; §7·§9에 보정 aspect·원본 분할선 참조 |
| [mg0101](../minigame/mg0101.md), VS4 | 기존 `CameraMgr::CameraMgr @0x71000035b0`: Camera 하나→기본 GraphicsLayer, op0/op1/game/result 전환 | 완료된 단일 카메라 분석 재사용. VS4만으로4분할을 적용하지 않음 |
| [mg0106](../minigame/mg0106.md), VS4·Endless | 최신 §7: `CameraManager @0x71000036f0`, `ComCamera @0x7100004ca0`: Camera 하나→기본 GraphicsLayer, op00/op01/game00/game01 | 완료된 단일 카메라·UI 분석 재사용. 추가 분할 분석·문서 수정 불필요 |

NRO 디컴파일의 `SplitTo(2,2,0.0)`는 세 번째 정수 레지스터 `w3`를 누락한다. 위 인자는 원본 import `_ZN2bq20SplitScreenLayerList7SplitToEiiif`와 호출부의 `w1/w2/w3/s0`로 확인했다. 인원/CPU/컨트롤러 연결 수를 보고 분할수를 줄이는 처리는 공통 함수에 없다. 다른 게임의 적용은 기존 개별 문서의 호출부를 참조하며 전수 재분석하지 않는다.

## 2. SplitTo·정규화 좌표

[판독] `main SplitScreenLayerList::SplitTo @0x7100311674`의 계약은 **(열 수, 행 수, focus, 초)**. `CreateParams @0x7100311710`은 `열×행`개를 행 우선으로 만들고 ID=`row*cols+col`을 부여한다. 좌표 원점은 화면 왼쪽 위, +x는 오른쪽, +y는 아래다.

| Param 오프셋·크기0x20 | 의미·기본값 |
|---|---|
| +0x00 i32 | GraphicsLayer ID |
| +0x04/+0x08 f32 | 정규화 x/y |
| +0x0C/+0x10 f32 | 정규화 width/height |
| +0x14/+0x18 f32 | viewport minDepth/maxDepth = 0/1 |
| +0x1C u8 | 양의 면적에 따른 레이어 활성화 자동 적용 = 1 |

focus<0이면 각 열의 폭=`1/cols`, 각 행의 높이=`1/rows`. focus≥0이면 대상 열`focus%cols`과 행`focus/cols`만1이고 나머지는0이다. 원점은 앞선 열 폭/행 높이의 누적값이며 선택되지 않은 영역도 레이어 ID를 유지한다. 유효한 열·행·focus를 전달하는 책임은 호출자에게 있다. 이 함수는 플레이어 배열을 재배치하지 않는다.

| (cols,rows,focus) | ID | (x,y,w,h) | 1920×1080의 viewport/scissor |
|---|---|---|---|
| (2,1,−1) | 0 左 / 1 右 | (0,0,.5,1) / (.5,0,.5,1) | (0,0,960,1080) / (960,0,960,1080) |
| (2,2,−1) | 0 左上 | (0,0,.5,.5) | (0,0,960,540) |
| 同上 | 1 右上 | (.5,0,.5,.5) | (960,0,960,540) |
| 同上 | 2 左下 | (0,.5,.5,.5) | (0,540,960,540) |
| 同上 | 3 右下 | (.5,.5,.5,.5) | (960,540,960,540) |
| (2,2,0) | 0 / 1 / 2 / 3 | (0,0,1,1) / (1,0,0,1) / (0,1,1,0) / (1,1,0,0) | ID0만 전체 화면, 나머지 면적0 |

[판독] `Apply @0x7100311030`→`FUN_7100310cdc`는 **현재 GfxScene의 해당 GraphicsLayer**에서 보정 카메라 ON(`Viewport @0x7100862440`), 보정 모드3(`@0x7100862688`), `SetViewportScissor @0x71008623c8` 순으로 적용한다. 자동 적용 flag가1이면 width>0 && height>0일 때만 레이어를 켠다. 카메라 할당·모델 mask·RT 생성·clear 설정은 이 함수의 책임이 아니다.

`Viewport+0x1A0..0x1B4`에 정규화 viewport와 depth 범위를, `+0x1C0..0x1CC`에 같은 사각형의 scissor를 저장한다. `@0x71008626c0`은 대상 RT 크기 W/H로 각 성분을 곱해 **float viewport**를 만들고, `@0x710086273c`는 각 성분을 곱한 뒤 개별적으로 정수 절삭해 **scissor**를 만든다. width를 `right−left`로 다시 계산하지 않는다. 따라서 W/H가 홀수이면 마지막 열/행에1px 남을 수 있다. 기준1920×1080과 그 정수배에서는 균등2/4분할이 정확히 채워진다.

[웹] GL의 왼쪽 아래 원점으로 바꿀 때 float viewport y=`H−(y+h)*H`, 정수 scissor y=`H−trunc(y*H)−trunc(h*H)`로 구분한다. 화면 논리 크기와 drawing-buffer/RT 픽셀 크기도 구분한다. three.js의 canvas용 setViewport/setScissor는 pixelRatio를 반영하므로 물리 좌표에 DPR을 두 번 곱하지 않는다.

## 3. 전환·종료·복구

[판독] 레이어 상태 크기0x80: 현재 Param+0, 목표+0x20, 시작+0x40, duration+0x60, elapsed+0x64, 콜백 목록+0x68.

- `SetParam @0x71003111f0`: 목록 크기를 맞추고 이전 전환을 취소하여 현재 Param을 설정. 즉시 Apply는 하지 않는다.
- `AnimationTo @0x7100311370`: duration≤0이면 SetParam. 양수이면 기존/목표 개수가 같아야 하며 다르면 Abort. 현재 값을 시작값으로 저장하고 elapsed=0으로 재시작한다. 진행 중 재호출도 현재값에서 이어진다.
- `FUN_7100310dd0`: f32 elapsed+=dt. 완료 전 x/y/w/h/minDepth/maxDepth에 `start+(elapsed/duration)*(target−start)`를 적용하고 콜백. elapsed≥duration이면 목표 전체를 복사하고 duration/elapsed=0 뒤 콜백. ID·자동 flag는 중간 보간하지 않는다.
- `ComSplitScreen` tick `@0x7100312900`, Entity 통지0x5F454E00: Main.GetDeltaTime→전체 상태 갱신(`@0x7100311070`)→Apply→분할 여부 변화에 따라 선 In/Out→현재 경계 갱신. 시간 공급 규칙은01_core를 따른다.
- `IsFinished @0x71003111b0`는 모든 duration≤0. `IsSplitting @0x7100311150`는 양의 면적 화면이 둘 이상인지 검사한다. 전환 중인지와 다른 개념이다. 순간 전환은 분할 SE를 생략하며, 양수 전환의 SE 연결은 `MGSound::SetSplitScreen @0x71001e5694`에 있다.

[계산] focus0→균등4분할의 진행률.5에서 사각형은 `(0,0,.75,.75)`, `(.75,0,.25,.75)`, `(0,.75,.75,.25)`, `(.75,.75,.25,.25)`다. 고정 f32 dt=1/60을 0부터 누적하면0.5초는30회,1초는61회에 완료된다. 이를 임의의30/60프레임 카운터로 교체하지 않는다.

[판독] `ComSplitScreen` 소멸 `@0x7100312ab0`는 목록·콜백을 해제하며 전체 그래픽 복구를 하지 않는다. `bq::GraphicsModule::ResetAll @0x71001db630`→`FUN_71001db3b0`가 양쪽 GfxScene 레이어의 저장 카메라·mask·enabled·color/depth clear를 복원하고 RT attachment를 원래 핸들로 돌린다(`@0x71000603a4`). viewport/scissor=(0,0,1,1,0,1), 보정 카메라 OFF, mode0으로 복귀한다. `SceneBase::BackupGraphicsLayers @0x71002ca138`만으로 이 전체 복구가 끝난다고 해석하지 않는다.

## 4. 플레이어별 카메라·투영

[판독] Split Apply는 원본 카메라의 view/projection을 복사한 **draw용 보정 카메라**를 쓴다. `Viewport::GetDrawCamera @0x710086195c`는 활성 카메라 슬롯 우선순위를 따른다. 원본 게임의 사진 판정용 Camera 행렬까지 덮어쓰는 계약이 아니다.

`Viewport` 생성 `@0x71008601f0`: +0x16C 보정 RT aspect의 float bits=`0x3FE38E39`(16/9), +0x168 mode=0. setter `@0x71008626a8`, getter `@0x71008626a0`. `FUN_7100862b58`은 면적 성분이 FLT_EPSILON(1.1920929e−7) 미만이면 보정을 건너뛴다. 유효할 때 목표 aspect **A=(w/h)*보정 RT aspect**. 실제 화면의 CSS 폭/높이 또는 FSNB에 저장된 aspect를 무조건 대입하지 않는다.

| 모드3·Perspective(type0) | 적용값 |
|---|---|
| abs(A0−A)<FLT_EPSILON | 원본 projection 유지 |
| A<A0 | 원본 수직 FOV f0 유지, aspect=A |
| A≥A0 | 수평 FOV 보존: h0=atan(A0*tan(f0/2)), f1=2*atan(tan(h0)/A), aspect=A |

두 분기 모두 near/far 유지. 원본 tanf/atanf와 f32 순서는 동등 수치 구현 시 보존한다. 기본16:9 타깃에서 좌/우2분할 A=8/9,4분할 A=16/9다. FSNB aspect ApplyAspectEnabled의 기본OFF와 기본 카메라 aspect 설정은07_camera_lighting의 기존 판독을 따른다. mg0508 저장aspect1.520116만으로 실제 draw aspect를 결정하지 않는다.

type1(PerspectiveFrustum)·type3(Orthographic)은 원본 중심과 near/far를 유지한다. A0=원본 halfWidth/halfHeight, A≥A0일 때 halfHeight*=A0/A, A<A0이면 halfHeight 유지; 좌우=중심X±A*halfHeight, 상하=중심Y±halfHeight. 모드1/2의 다른 확대 정책을 분할 모드3에 혼용하지 않는다.

카메라·입력 인덱스는 게임별로 보존한다. mg0122는 Camera index p→layer p·mask1<<p, mg0102는 Camera00~03→layer0~3이며 입력은 `Players::GetPlayerID(index) @0x7100035040`→InputModule이다. mg0508 화면 t는 **TeamID t**이고 두 참가자 slot은 PlayerWork 순회에서 수집한 순서다. 화면0을 pad0, 화면1을 pad1로 고정하거나 CPU 자리를 제거하면 원본과 달라진다.

→ 정리본: [20_camera_runtime.md](20_camera_runtime.md) §6.1, §8~§10
## 5. 레이어·렌더타깃·clear/depth·렌더 순서

[판독] 일반 분할은 기존 GraphicsLayer와 카메라를 나눈다. SplitTo/Apply가 플레이어 수만큼 RT나 depth buffer를 만들지는 않는다. 씬 구성 `main FUN_71000b5bd0`은 layer index0에 씬 설정의 color/depth clear 값을, 추가 레이어에 clear=false·초기 disabled를 설정한다. 기본 visibility bit는 `1<<((baseID+layerIndex)&31)`이며 게임이 이를 변경할 수 있다. mg0508의 겹친 도마·칼·접시·스테이크를 같은 월드에 유지하고 team bit로 골라 그리는 근거는 기존 §3.2·§4에 있다.

GraphicsLayerExtension의 color/depth target 핸들과 clear flag는 별도 상태다. 분할 viewport는 minDepth/maxDepth=0/1을 기본으로 쓴다. 이 범위는 사진 판정의 near/far 또는 카메라별 depth attachment 개수와 다르다.

**mg0122 캡처** [판독]: `Camera::CreateRenderTarget @0x710001a174`의 ARM64 인자는 각 카메라 **960×540**, index0 추가 **1920×1080**. `Camera::SetUpGraphicsLayer @0x710001f840`은 해당 index·mask로 카메라를 연결한다. `ScreenCapture @0x710001d3ec`은 `SetGraphicsLayerExtensionScreenCaptureRenderTarget(layer=index,type=0,RT,flags=1 또는3)`으로 해당 레이어 캡처를 요청한다. 이 캡처용 RT를 매 프레임 기본 분할 출력 RT 네 개로 해석하지 않는다. 사진 완료 통지·캡처 카메라 전환·판정은 기존 mg0122 §3·§6·§9를 재사용한다.

확정한 순서는 다음과 같다.

| 범위 | 순서·근거 |
|---|---|
| 분할 상태 적용 | 상태 update→layer ID 순 Apply→경계 In/Out·배치, `main @0x7100312900/0x7100311030` |
| 일반 레이어 패스 등록 | `_RenderPassSetup`→shadow 계열·culling→reflection/underwater/impostor→OpaqueNormal/Skybox/후속 opaque→translucent·후속 opaque→GuiLayoutPrePosteffect→Posteffect→후속 GUI/TopMost, `main @0x71000b5bd0`; 개별 셰이더·포스트 세부는 기존 문서 |
| 화면선 UI | 전역 기준 레이아웃에 DrawPriority=0x8100, `main @0x7100313700`. 카메라별 HUD 스케일로 축소하지 않음 |

[미확정] GPU 명령 제출의 **레이어와 패스 사이 중첩 순서**, 실제 attachment 공유/해상도 축소, GPU clear의 전체/사각 영역, 캡처 type0/flags1·3의 정확한 복사 시점·포스트 포함 여부는 위 등록/요청만으로 확정할 수 없다. 매 화면 full color clear·depth clear를 하는 것으로 단정하지 않는다. 웹에서 autoClear를 켠 채 같은 타깃에 여러 카메라를 연달아 그리면 앞 화면을 지울 수 있으므로 레이어의 clear 정책과 target 소유권을 명시해야 한다. 이 부분의 원본 동등성은 해당 제출·복사 경로 판독과 출력 대조가 남아 있다.

## 6. 분할선과 UI 좌표

[판독·데이터] `ComSplitScreen` 생성 `main @0x71003126c0`은 같은 엔티티에 분할선 UI를 추가한다. UI 생성 `@0x7100313660/0x7100313700`은 **Parts.lyt / sys_dividing_lines.bflyt**를 사용하고 기준 변환 `(1920,−1080)+offset(−960,540)`을 저장한다.

원본 `bq.nx.bea/Parts.lyt`의 대상 데이터:

| 항목 | 원본 값 |
|---|---|
| 레이아웃 | 중심 원점1920×1080, Root→Null_all |
| 수직 pane | x_v_00~12, size=(8,1080), rotationZ=0° |
| 수평 pane | x_h_00~12, size=(8,1920), rotationZ=90° |
| texture/material | `sys_dividing_line^s`, clamp·linear, black=#00000000, white=#020202ff; 원본 UV 유지(수직 V 끝38.57143, 수평66.206894) |
| 애니 | in:9f, Null_all alpha0→255; out:9f,255→0; normal:1f,255. 모두비루프·Hermite, 끝점 slope0 |

`FUN_7100313e40`은 현재 viewport 네 변에서 내부 경계(0<좌표<1)만 모은다(`Line2DPacker @0x7100312f40`). 같은 축좌표 오차≤0.0001이며 구간이 접하거나 겹치면 합친다(`@0x71003133a0`). 따라서 좌/우2분할은 수직선1개, 균등4분할은 수직·수평 각1개가 된다. 분할선8px을 viewport에서 공제하는 gutter는 없다.

- 수직선 x: paneX=`−960+1920*x`. 끝점Y=`540−1080*y0/y1`; 중심은 평균, pane height는 차의 절댓값.
- 수평선 y: paneY=`540−1080*y`. 끝점X=`−960+1920*x0/x1`; 중심은 평균, 회전된 pane height에 길이를 넣는다.
- 코드가 변경하는 것은 위치·길이·표시 여부다. width8·회전·재질·UV는 원본 자산을 유지하고 남는 pane은 숨긴다. 완성2분할 수직선은 (0,0), length1080;4분할 수평선도 (0,0), length1920이다.
- In(false) `@0x7100313c90`→in→normal, Out(false) `@0x7100313d80`→out→숨김. true 인자는 해당 끝 상태로 즉시 간다. SplitTo 시간0이어도 tick에서 호출하는 선 In(false)의 원본9f 알파는 별개다.

**3D→HUD** [판독]: 기존 `LytPosFrom3DPos main @0x71001caec0`은 draw camera와 해당 layer scissor를 사용한다. NDC(u,v)를 정규화 rect(x,y,w,h)에 옮기는 기준식은 `X=1920*(x+(u+1)*w/2)−960`, `Y=540−1080*(y+(1−v)*h/2)`이며 실제 함수의 scissor 픽셀 변환을 따른다. 전역 타이머·점수·사진 창은 원본 레이아웃 pane/그룹·애니·해당 game 갱신을 따른다. 모든 HUD를 사분면 안으로 자동 재배치하는 공통 계약은 없다.

**mg0122 사진 좌표**: `Camera::CalcScreenPosition @0x710001fe1c`의 `(u*960,v*540)`는 플레이어 사진 내부 중심 좌표다. 이를 화면 사분면의 전역 좌표로 사용하면 위치가 틀어진다. 화면 anchor가 필요할 때 별도 레이어 rect로 옮기고 사진 판정·캡처에는 원본 행렬/좌표를 유지한다. mg0508은 최신 §7.2의 `mg0508_point_pos.flyt` 부품·애니·텍스트 바인딩을 재사용한다. L_circle_1P/2P·L_point_1P/2P의 1P/2P는 팀0/팀1이며, 전역1920×1080 레이아웃을 원본 그대로 유지한다.

## 7. 현재 웹 지원과 필요한 경계

[웹] 우선5게임은 [app/minigame/index.ts](../../script/app/minigame/index.ts)에 등록되지 않았고 현재 등록은 mg1801 하나다. 다음은 구현 계약이며 이 문서에서 코드를 추가하지 않았다.

| 현재 소스 | 지원 | 분할에 필요한 인터페이스·차이 |
|---|---|---|
| [view/renderer.ts](../../script/view/renderer.ts) | 1920×1080 비율, DPR≤2, 공개 gl, 단일 render(scene,camera), setPost | 레이어별 normalized rect/depth/autoEnabled·보정 카메라·clear/target·화면전환 상태를 묶는 계약 없음. raw gl의 viewport/scissor 기능만 존재 |
| [stage3d/stage.ts](../../script/app/common/render3d/stage.ts) | 단일 카메라·애니·resize·GPU 대여 | 시뮬레이션/애니는 tick에 한 번, 같은 상태를 여러 카메라로 render. Stage.update를 화면 수만큼 부르면 시간이 배속됨. resize가 카메라 aspect를 전체 비율로 덮는 경로도 분리 필요 |
| [stage3d/post.ts](../../script/app/common/render3d/post.ts) | scene HDR RT→bloom→composite→선택FXAA→canvas | resize는 drawing buffer 전체, render는 target/viewport/scissor 원상복구 없음. 네 scissor 아래 render를4회 호출하는 방식으로 동일 분할이 되지 않음. 레이어 target/영역·sampling 경계·합성 출력·복구를 명시하는 인터페이스 필요 |
| [view/lyt.ts](../../script/view/lyt.ts) | 원본 pane·애니 렌더, 1920×1080 결과 합성 | 분할선 assembler·drawCamera/scissor 기반 HUD projector 없음. 원본 sys_dividing_lines 및 game layout을 연결해야 함 |
| [assetcore-three](../../script/lib/assetcore-three/index.ts) | 카메라·scene 준비와 warmup 상태 보존 | 런타임 SplitScreenLayerList, 레이어별 clear/capture 없음. ScenePreparer의 예약 layer31을 원본 플레이어 mask와 혼용하지 않음 |

필요한 처리 경계: 게임 입력/모델·카메라 상태를1회 갱신→분할 상태 적용·draw camera 계산→각 레이어의 가시성·target·viewport/scissor·clear 정책에 따라 원본 패스/캡처 처리→원본 전역 UI·분할선 합성→호출 전 상태 복구. 현재 PostRenderer는 출력 target/영역 인자를 받지 않으므로 이 경계를 표현할 수 없다. 카메라별 post 타깃을 새로 만드는 설계도 원본의 layer/RT 판독 없이 동등하다고 확정하지 않는다.

GPU 대여 종료 시 target·viewport·scissor/test·autoClear 및 clearColor/depth 정책·camera/layers·post 연결·출력 크기를 소유권에 맞게 복구한다. RT 변경이 viewport/scissor를 바꾸는 경로까지 포함하며 게임이 빌린 Renderer를 dispose하지 않는다. 게임별 사진 RT는 기본 분할 출력과 분리하여 완료 통지 뒤 해제한다.

## 8. 검산과 남은 확인

[계산·데이터] 정적 재구현 계산·원본 데이터 파싱 검증 결과:

| 확인 | 결과 |
|---|---|
| 2×1·2×2, 균등 및 모든 유효 focus | 총 면적1, 균등은2/4개의 양의 면적, focus는1개; ID·원점 유지 확인 |
| 1920×1080·3840×2160 | 각 성분 float viewport와 정수 scissor 일치.4분할 각960×540 /1920×1080 |
| 1919×1079 |4분할 scissor 각959×539, 마지막 열/행1px 미포함; 개별 절삭 확인 |
| 선 위치·크기 | 2분할 수직1080,4분할 수직1080+수평1920, 중심(0,0), 원본 pane폭8·회전0/90° |
| projection mode3 | 기준A0=16/9·fovy20°: A=8/9와16/9는20°,비교용A=32/9는약10.076737°. 32/9 적용 게임을 확인했다는 뜻은 아님 |
| 전환 | focus0→4분할 halfway 사각형·중도 현재값 재시작식, f32 dt 누적 완료 경계 확인 |
| 원본 UI 파싱 | 대상 BFLYT·in/out/normal BFLAN의 parser check=[]; pane26개·curve endpoint·비루프 확인 |

[미확정] §5의 GPU 제출/clear/캡처 시점과 원본 사진 출력 픽셀, 포스트가 경계 밖을 샘플하는 정확한 처리, 현재 웹에서의 분할 렌더·UI 합성 결과는 미검증이다. 원본 실행 없이 확보한 호출·데이터·수치와 이 항목들을 구분하여 후속 구현/대조한다.

## 9. 웹 구현 계약 (2026-10-09, [splitscreen])

§2~§8 판독을 웹 공용 런타임 하나로 옮긴다. mg0102(2×2)·mg0122(2×2)·mg0508(2×1)이 같은 모듈을 쓰고 게임마다 분할 코드를 만들지 않는다. 구현이 이 절과 달라지면 이 절을 먼저 고친다. §7의 "이 문서에서 코드를 추가하지 않았다"는 2026-10-09 이전 상태다.

### 9.1 모듈과 경계

| 폴더 | 내용 | import |
|---|---|---|
| `script/game/lib/splitscreen/` | **코어**: Param·SplitTo·SetParam/AnimationTo 보간·IsFinished/IsSplitting(§2·§3), viewport float/scissor 정수 절삭·GL y 변환(§2), 보정 aspect/FOV(§4), 분할선 경계 모으기·병합·pane 배치·in/out 알파(§6), 3D→HUD 식(§6), mg0122 캡처 RT 크기 상수(§5). 시간은 호출자가 `step(dt)`로 넣는다(기본 f32 1/60). 매 스텝 할당 0 | **0**(외부·three·DOM·프로젝트 파일 없음, 한 파일) |
| `script/game/lib/splitscreen-three/` | **three 어댑터**: 한 번 갱신한 장면을 레이어마다 viewport/scissor·draw용 보정 카메라로 그림, clear 정책, 레이어 영역 후처리 호출, renderer 상태 복구, 레이어별 3D→HUD 투영, 캡처 요청 자리 | `three` + 코어만 |
| `script/game/lib/splitscreen-dom/` | **분할선 DOM**: 원본 `sys_dividing_lines` pane 26개를 div 로, 코어가 정한 위치·길이·회전·알파를 style 에 쓴다 | 코어만 |
| `script/app/common/render3d/post.ts` | `PostChain.render(scene, camera, region?)` — 선택 인자 `region`(출력 target·viewport·scissor) 추가. 인자가 없으면 지금과 같은 출력 | 기존 그대로 |
| `script/app/minigame/frame/stage/` | `MgStage.renderSplit(list, cameras, opts?)` — 무대 장면·후처리로 어댑터 호출. `update` 는 부르지 않는다 | + `../../lib/splitscreen`·`../../lib/splitscreen-three` |
| `script/app/minigame/frame/scene/` | 틀이 `SplitScreen` 하나를 갖고 `ctx.split` 으로 게임에 준다. 틀 step 의 UI 틱에서 `split.step(MG_DT)` | + `../../lib/splitscreen`(import 0 코어, lib 예외 — transition 과 같은 규칙) |
| `script/splitscreen_page.ts` | dev/ui.html 항목 "분할 화면" 보기 페이지 | 페이지 |
| `assets/splitscreen/lines.json` | 원본 `bq.nx.bea/Parts.lyt` 의 `sys_dividing_lines` bflyt·in/out/normal bflan 정리본 ← `tools/analysis/splitscreen_web_assets.py`(mgscene 변환기 함수 재사용). 그림 `sys_dividing_line^s`(8×8, 열 3·4 만 불투명 흰색 [데이터])는 공용 규칙대로 `assets/common/tex/sys_dividing_line_s.png` | — |

### 9.2 코어 API (`lib/splitscreen`)

```ts
class SplitParam { id; x; y; w; h; minDepth; maxDepth; autoEnable }          // §2 Param 0x20 B
createParams(cols, rows, focus, out: SplitParam[]): number                     // CreateParams, 행 우선 ID = row*cols+col
class SplitScreenLayerList {                                                   // §3 레이어 상태 0x80
  count; cols; rows; layers: SplitLayer[]                                      // layer = { cur, target, start, duration, elapsed }
  splitTo(cols, rows, focus, sec)        // CreateParams → AnimationTo(sec)
  setParam(params, n)                    // 크기 맞춤·전환 취소·현재값 설정(즉시 Apply 아님)
  animationTo(params, n, sec)            // sec ≤ 0 → setParam, 개수 다르면 Error(원본 Abort), 진행 중 재호출 = 현재값에서 다시 시작
  update(dt)                             // f32 elapsed += dt → 완료면 목표 전체 복사·duration/elapsed 0, 아니면 x/y/w/h/min/maxDepth 보간(ID·autoEnable 제외)
  isFinished()  isSplitting()  clear()   // clear = ResetAll(레이어 0개 = 보통 한 화면 그리기)
}
viewportPx(p, W, H, out) / scissorPx(p, W, H, out)       // f32 곱 / 성분마다 정수 절삭(right−left 로 다시 계산하지 않음)
glViewportY(vp, H) / glScissorY(sc, H)                    // H−(y+h) / H−trunc(y·H)−trunc(h·H)
drawAspect(w, h, rtAspect = f32(16/9))                    // A = (w/h)·보정 RT aspect(0x3FE38E39)
correctPerspective(fovy0, aspect0, A, out)                // §4 모드3 type0. 면적 < FLT_EPSILON 이면 건너뜀
correctFrustum(l, r, b, t, A, out)                        // §4 type1·type3
ndcToLayout(u, v, rect, out) / ndcToLayoutPx(u, v, scissor, W, H, out)   // §6 3D→HUD(1920×1080 중심 원점, y 위)
class DividingLines { panes[26]; alpha; in(immediate); out(immediate); advance(); layout(list) }  // §6
class SplitScreen { list; lines; splitting; to(cols, rows, focus, sec); step(dt = STEP_SEC); finish(); reset() }  // ComSplitScreen
```

- `SplitScreen.step(dt)` 순서 = §3 ComSplitScreen tick: ① 분할선 애니 1프레임 진행 ② `list.update(dt)` ③ (Apply 는 그리기 때 어댑터가 현재값으로) ④ `isSplitting()` 이 바뀌었으면 거짓→참 `lines.in(false)`, 참→거짓 `lines.out(false)` ⑤ 현재 경계로 pane 배치. 애니 진행을 상태 변화보다 먼저 두어 In 을 부른 스텝의 그림은 in 0 프레임(알파 0)이고 9 스텝 뒤 normal(255)이다 [추정: 레이아웃 애니 갱신과 컴포넌트 tick 의 상대 순서 미판독].
- f32: dt·elapsed·보간·aspect·FOV 식은 `Math.fround` 로 각 연산 뒤 반올림(§3·§4). 1/60 누적 완료 0.5 s = 30 스텝, 1 s = 61 스텝.
- 경계 모으기: 레이어마다 네 변 중 0<좌표<1 인 것만, 길이 0 인 변은 뺀다(보이는 결과 같음). 같은 축 좌표 |Δ| ≤ 0.0001 이고 구간이 접하거나 겹치면 합친다. pane 배정 = 좌표 오름차순(x_v_00 부터) [추정: Line2DPacker 출력 순서 미판독]. 13 개를 넘는 선은 그리지 않는다. 남는 pane 은 숨긴다.
- `finish()` = 지금 cols×rows 로 `splitTo(cols, rows, 0, 0)`(mg0102 SetFinishCamera·mg0508 ResetSplit 와 같은 호출). `reset()` = ResetAll(레이어 0개·선 즉시 숨김).
- 위치·길이 식: §6 그대로(수직 paneX = −960+1920x, 끝점 Y = 540−1080y; 수평 paneY = 540−1080y, 끝점 X = −960+1920x). 알파 = Null_all FLVC hermite(in (0,0,0)→(9,255,0), out (0,255,0)→(9,0,0), normal 255).
- 원본 값 상수 `DIVIDING_LINES`(pane 8×1080 / 8×1920·회전 0°/90°·재질 black #00000000 white #020202ff·UV V 끝 38.57143/66.206894·애니 키·DrawPriority 0x8100)는 시험이 `assets/splitscreen/lines.json`(원본 변환본)과 대조한다.

### 9.3 three 어댑터 (`lib/splitscreen-three`)

```ts
interface PostRegion { target: WebGLRenderTarget | null; viewport: Vector4; scissor: Vector4 }  // target 픽셀, GL 원점(왼쪽 아래), 정수
interface RegionPost { render(scene, camera, region?: PostRegion): void }                       // stage3d PostChain 이 구조적으로 맞는다
class SplitRenderer {
  constructor(gl)                                   // WebGLRenderer(시험은 같은 모양 가짜)
  render(scene, cameras, list, { post?, target?, clear?, rtAspect?, enabled? })
  drawCamera(i)                                     // 지난 그리기의 레이어 i draw 카메라
  project(world, i, out)                            // 레이어 i 의 draw 카메라·scissor 로 1920×1080 레이아웃 좌표
  capture(req: { layer, target, type, flags, post?, onDone? })   // mg0122 캡처 자리(§9.6)
}
```

한 프레임 순서(§7 필요한 처리 경계):
1. 저장: 현재 render target, `getViewport`·`getScissor`·`getScissorTest`(논리 단위), `autoClear`, 그림자 `autoUpdate`/`needsUpdate`, 출력이 RT 면 그 RT 의 `viewport`·`scissor`·`scissorTest`.
2. 출력 크기 W×H = canvas 면 `getDrawingBufferSize`(물리 픽셀), RT 면 그 크기. 레이어 0개(ResetAll 뒤)면 지금처럼 `post.render(scene, cameras[0])` 또는 `gl.render` 한 번.
3. clear: `clear` 기본 참 = 레이어를 그리기 전에 출력 전체를 scissor 없이 color+depth 한 번(원본 layer0 = 씬 clear 값, 추가 레이어 clear=false — §5). 레이어 rect 는 화면을 나누므로(면적 합 1) 레이어 ≥1 은 clear 하지 않는다. 홀수 크기에서 어느 scissor 에도 들지 않는 마지막 1 px 열/행은 clear 색으로 남는다.
4. 레이어 ID 순(목록 순)으로, 자동 적용 flag 가 참이면 w>0 && h>0 인 레이어만(거짓이면 `enabled[i]`): 카메라 = `cameras[id]`(없으면 건너뜀) → draw 카메라 = 원본 카메라 값을 복사(fov·aspect·near·far·zoom·`layers.mask`·`matrixWorld`·`matrixWorldInverse`, `matrixWorldAutoUpdate=false`)한 뒤 §4 보정. 원본 카메라는 바꾸지 않는다(사진 판정 행렬 보존). A0 = 원본 카메라 aspect(웹 Stage3D.resize 가 화면 비율 16:9 로 둔 값). three `Layers` 마스크 = 원본 visibility bit(mg0508 팀 bit = `1<<team`)를 카메라마다 그대로 쓴다.
5. viewport = float 를 가장자리 반올림한 정수(WebGL viewport 는 정수 [근사: 1920×1080 과 정수배에서 같음, 그 밖 ≤ 0.5 px]), scissor = §2 정수 절삭. GL 원점 y 는 §2 식. canvas 에 걸 때는 three 가 pixelRatio 를 곱하므로 물리 픽셀을 `(px + 0.25) / pixelRatio` 논리 값으로 넘긴다(DPR 한 번만, three 의 round·floor 양쪽에서 같은 정수). RT 면 RT 의 viewport/scissor 필드에 물리 값 그대로.
6. 후처리 없음: 출력에 viewport·scissor·scissor test 를 걸고 `autoClear=false` 로 `gl.render(scene, draw)`. 후처리 있음: `post.render(scene, draw, region)`(§9.4).
7. 그림자 맵은 프레임 첫 레이어에서만 다시 그린다(이후 레이어는 `autoUpdate=false·needsUpdate=false`) [근사: 원본은 레이어 패스마다 shadow 계열 등록. 웹 Stage3D 그림자 맞춤은 `stage.camera`(화면 0 카메라) 하나 기준].
8. 복구: target·viewport·scissor·scissor test·autoClear·그림자 갱신값, 출력 RT 의 viewport/scissor/scissorTest 를 저장값으로. 렌더러·장면·원본 카메라는 dispose 하지 않는다. **Stage3D.update 는 부르지 않는다**(호출자가 프레임마다 한 번).

[설계] 앱 수명 공유 렌더러의 레이어·상태 복구 연결: [render_unify.md §9.2](render_unify.md).
### 9.4 레이어 영역 후처리 (`PostChain.render(scene, camera, region)`)

- 장면 패스: 후처리 HDR RT 의 viewport/scissor 를 레이어 값으로, 그 scissor 안만 color+depth clear(WebGL clear 는 scissor 를 따른다) → `autoClear=false` 로 그린다 → RT 필드를 전체·scissor 끔으로 되돌린다.
- 블룸: 체인은 지금과 같은 전체 크기 RT 로 돈다. first_down 표본 UV 를 레이어 scissor 안(반 텍셀 안쪽)으로 clamp 해 **레이어 하나를 clamp-to-edge 그림처럼** 다룬다 — 다른 레이어·지난 프레임 값이 번지지 않는다. 비용 = 레이어 수 × 블룸 [근사: 원본 포스트가 레이어 viewport 밖을 어떻게 표본하는지 §8 미확정].
- 합성(+FXAA): 출력(region.target, 없으면 canvas)에 viewport 전체·scissor = 레이어 scissor 로 쓴다. 비네트 좌표는 레이어 rect 안 정규화 좌표 [추정]. FXAA 는 경계 1 px 이웃을 다른 레이어에서 읽을 수 있다 [근사].
- 끝나면 유니폼(clamp·비네트 rect)을 기본 (0,0,1,1) 로, 바꾼 gl·RT 상태를 들어올 때 값으로 되돌린다. `region` 이 없으면 셰이더 결과·패스 순서가 지금과 같다(clamp 기본값은 내부 표본점에서 무효, 비네트 rect 기본 = 전체 화면).
- `region.target` 이 RT 이면 내부 RT 크기를 그 RT 크기로 맞춘다(크기가 바뀌면 다시 만든다 — 캡처처럼 드문 호출용).

### 9.5 분할선 DOM (`lib/splitscreen-dom`)

- 웹의 장점대로 three 를 거치지 않는다. 1920×1080 기준 div 하나(Null_all)를 부모 크기에 맞춰 `transform: scale(k)`, 알파 = `opacity`(Null_all influencedAlpha → 자식에 곱). pane 26 개 = 절대 위치 div(폭 8, 높이 = 코어 길이, `transform: translate(…) rotate(0 | −90deg)` — 레이아웃 y 위·회전 +90° = CSS 반시계).
- 재질: `background-color: #020202` + `mask-image: url(sys_dividing_line_s.png)`(`mask-size: 100% 100%`, 브라우저 쌍선형 = 원본 linear). 원본 식 색 = black + (white−black)·tex 에서 그림 RGB 가 전부 255 라 RGB = 2, 알파 = tex.a 와 정확히 같다. 정점색 흰색은 곱해도 그대로. 원본 UV V 끝 38.57143/66.206894 + clamp 는 그림 행이 모두 같아 V 를 늘인 것과 같은 결과다. **render2d 로 그려야 할 부분은 없다**(원본과 다른 점 0).
- 시간은 CSS transition 을 쓰지 않는다. `draw(lines)` 가 그리기마다 바뀐 값만 style 에 쓴다.
- 겹침 순서: 게임 3D canvas < **분할선(DrawPriority 0x8100)** < 틀 2D HUD canvas(텔롭 0x8800·타이머 0x8900·안내 0x8a00 [판독 minigame_scene §12.1]) < 디버그 글(z 2) < 화면 전환 DOM(z 1000). 분할선 div 는 z-index 를 두지 않고 HUD 앞(`before`)에 넣어 DOM 순서로 정한다. 카메라별 HUD 스케일로 줄이지 않는다(§5).

### 9.6 게임 연결

- **틀(`app/minigame/frame/scene`)**: `MgScene.split: SplitScreen`, `ctx.split = { to(cols, rows, focus, sec), isFinished(), isSplitting(), list }`. `to` 가 sec > 0 이면 그 프레임에 `{k:'se', label}`(MgSound 표 `camera_split_se_label` → tables.json `mgSound[id].splitSe`, 없으면 내지 않음; mg0102 = `SQ_SE_SYS_MNG_CMR_SPLT_4`, mg0122·mg0508 = 없음 [데이터]) [추정: MGSound::SetSplitScreen 미판독, 소리 파일은 아직 변환하지 않음]. 틀 step 의 UI 틱(와이프·텔롭 다음)에서 `split.step(MG_DT)` — 게이트가 닫히면 분할도 멈춘다(로직). 결과 무대(갈래 A)를 시작할 때 분할 중이면 `split.finish()`(focus0 즉시) [설계: 원본은 게임이 SetFinishCamera/ResetSplit 을 부름 — 같은 값이라 이중 호출 무해].
- **게임 화면**: 게임은 로직에서 `ctx.split.to(...)` 만 부르고, 화면은 프레임마다 `stage.update(dt)` 1회 → 레이어 카메라 갱신 → `mgStage.renderSplit(scene.split.list, cameras)` → `domLines.draw(scene.split.lines)` → 틀 2D. 카메라 배열 index = GraphicsLayer ID(mg0102 Camera00~03, mg0122 index p, mg0508 화면 t = TeamID t).
- **mg0102**: 초기 `(2,2,0,0)` → 오프닝 끝 `(2,2,−1,skip?0:1)` → 닫기 `(2,2,0,skip?0:1)` → 결과 `(2,2,0,0)`. **mg0122**: `(2,2,0,0)` → 시작 전 `(2,2,−1,0)` → 0x29 균등 → FadedOut focus0. **mg0508**: `(2,1,0,0)` → BeginSplit `(2,1,−1,duration)` → ResetSplit `(2,1,0,0)`.
- **결과 무대(`app/minigame/frame/result`)**: 수정 없음. 틀이 focus0 로 돌리고, 어댑터가 매 프레임 renderer 상태를 되돌리므로 결과 무대의 전체 화면 그리기에 viewport/scissor 가 남지 않는다.
- **mg0122 캡처 자리**: 코어 `MG0122_CAPTURE = { perCamera: [960, 540], extra: [1920, 1080], extraCamera: 0 }`, 어댑터 `capture({ layer, target, type, flags, post?, onDone? })` = 다음 `render` 끝에 그 레이어 draw 카메라로 target 전체에 한 번 그리고(기본 후처리 없음) `onDone`. 복사 시점·포스트 포함·type0/flags1·3 의미는 §5 [미확정] 그대로, 사진 판정은 게임 포팅 때 붙인다.

### 9.7 보기 페이지 (`dev/ui?ui=splitscreen`)

`mgstage` 장면 위에 분할 런타임을 그대로 쓴다. `?mg=mg0508|mg0102|mg0122`(기본 mg0508), 단추·키로 바꾼다. 레이어 카메라는 서로 다르게 둔다: 레이어 0 = 장면 카메라 클립(`mg.camera.game`, 무대 anim 슬롯), 레이어 1 = 다른 원본 클립, 레이어 2·3 = 레이어 0 자세를 월드 원점 Y 축으로 90°·270° 돌린 것(보기용, 원본 아님). 각 레이어 왼쪽 위에 카메라 이름을 보기 전용 DOM 글로 띄운다.

| 조작 | 동작 |
|---|---|
| 단추 "전체(focus0)"·"균등 분할", 키 **S** | focus0 ↔ 균등(−1) 을 지금 전환 시간으로 |
| 키 **1~4** | 그 화면 focus(2×1 은 1·2) |
| 단추·키 **T** | 전환 시간 0 / 0.5 / 1 초 순환 |
| 단추·키 **G** | 다음 게임(mg0508 → mg0102 → mg0122) |

### 9.8 시험 (`tools/test_splitscreen.ts`, 노드 — 헤드리스 없음)

rect·ID(2×1·2×2·균등·모든 focus), 1920×1080·3840×2160·1919×1079 scissor 절삭, GL y, 전환 중간값(focus0→4분할 진행 0.5 = (0,0,.75,.75) 등)·완료 스텝 30/61·진행 중 재호출·개수 다름 Error, IsFinished/IsSplitting, 보정 FOV(A0 16/9·fovy 20°: A=8/9·16/9 → 20°, 32/9 → 10.076737°)·type1/3, 분할선 개수·위치·길이·알파 9f·원본 json 대조, 3D→HUD, 어댑터(가짜 renderer·실제 three 카메라): 레이어 render 호출 순서·viewport/scissor 값·DPR·clear 정책·상태 복구·원본 카메라 무변경·그림자 1회·Stage3D.update 1회, post region 가짜 renderer 상태 복구, 틀 ctx.split·SE·결과 focus0, 코어 import 0·어댑터 import 경계, 매 스텝 할당 0(같은 객체 재사용 검사).

### 9.9 사용자 확인 필요 (이 절)

| 항목 | 정한 것(원본 쪽) | 이유 |
|---|---|---|
| 레이어 clear | 프레임 처음 출력 전체 color+depth 1회, 레이어 ≥1 clear 없음, 후처리 HDR RT 는 레이어 scissor 안 clear | GPU clear 전체/사각 §5 미확정. 레이어가 화면을 나누므로 두 해석의 결과가 같다(홀수 크기 1 px 만 다름) |
| 레이어 영역 후처리 | 레이어마다 전체 체인, 블룸 표본을 레이어 안으로 clamp, 비네트 = 레이어 rect | 원본 Posteffect 는 레이어 패스마다 등록(§5). 경계 밖 표본 처리 §8 미확정. 비용 = 레이어 수배 |
| 그림자 맵 | 프레임당 1회(화면 0 카메라 기준 맞춤) | Stage3D 그림자 맞춤이 카메라 하나 기준 [근사] |
| 분할선 pane 배정 순서·애니 진행 순서 | 좌표 오름차순, 애니 진행 → 상태 변화 | Line2DPacker 출력 순서·레이아웃 애니 갱신 순서 미판독 |
| 분할 SE | `to(sec>0)` 그 프레임에 표 라벨 SE, 소리 파일 미변환 | MGSound::SetSplitScreen 미판독 |
| 결과 무대 진입 | 틀이 분할 중이면 focus0 즉시 | 원본은 게임 몫(같은 값) |
| viewport 정수화 | float 가장자리 반올림 | WebGL viewport 정수 |
