# 20. 카메라 런타임 — game/lib/camera 통합 명세

[설계] 2026-10-10. 광장·`app/minigame/frame/stage/MgCamera`·mg1801의 카메라 수학과 곡선을 `game/lib/camera`로 모으는 분석 문서다. 코드 구현·에셋 변환·원본 실행 확인은 없다. 배치와 import 경계는 [DESIGN.md §10][D10]을 따른다.

[설계] 렌더 패스·context·RT·GPU 자원 소유권은 `render_unify` 갈래가 맡는다. 이 문서는 camera state → base/world view → draw projection의 수학 계약만 정한다. 기존 렌더 판독은 [10_split_screen §5·§9][SPLIT]·[common_system_audit §3.1~3.2][AUDIT]를 참조한다.

## 1. 기능 개요

[판독] 원본은 `ComMatter(MatterType=1)` → `ComCamera` → `Camera`를 연결하고, 모션 트리의 대표 카메라 애니 결과를 적용한다. 결과값의 가중 평균은 없지만 대표 자식 선택에는 가중치를 쓴다. main `@0x71002af940/0x71006c0fe0/0x71006c1120/0x710080b6d0/0x710080bd48/0x710080bc60`; [07 §3.1~3.2][CAM].

[판독] 원근/직교, Aim/twist/EulerZXY, aspect·near/far 적용 flag, 엔티티 world 합성, FSNB 소수 프레임 곡선 평가가 공통 기능이다. main `@0x71006c1120/0x71007758a4/0x7100775b90/0x7100849250`; [07 §4·§6][CAM].

[판독: 어셈블리] 광장 추종은 지속 목표와 지난 카메라 방향을 쓴다. 흔들림은 저장 위치·현재 기저·동기 난수로 위치를 바꾼다. menu00 `@0x7100003de0~0x71000047a0`; main Start `@0x71004e0e50`, Update `@0x71004e124c`, Stop `@0x71004e1184`; [plaza_3d §3.5][PLAZA], [07 §7.6][CAM].

## 2. 자료

### 2.1 기존 판독·미확정·함수·데이터 일괄 목록

[설계] 아래 자료를 먼저 목록화해 재사용했다. 이미 판독된 함수 본문은 새로 분석하지 않았다. 미확정 ID는 §11, C 존재 대조는 부록 B·C에 대응한다.

| 분류 | 재사용 범위 | 원본 모듈·주소 또는 실제 데이터 필드 | 출처 |
|---|---|---|---|
| [판독] Camera/ComCamera | 기본값·투영·pass·world | main `@0x71008458f8/0x7100846b04/0x71006c1120/0x7100849250` | [07 §3·§4·§6.1~6.3][CAM] |
| [판독: 어셈블리] FSNB | 캐시·Cubic/Linear/BakedFloat·wrap·sincos | main `@0x7100775330/0x71007753d0/0x7100772764`; SDK 이미지 offset `0x8B570C` | [07 §6.4~6.5][CAM] |
| [판독: 어셈블리] 흔들림 | Start/Update/Stop·난수 | main `@0x71004e0e50/0x71004e124c/0x71004e1184`; U02~U04 | [07 §7.6][CAM] |
| [판독] split 수학 | base/draw 분리·FOV/aspect·frustum/ortho | main `@0x710086195c/0x7100862b58` | [10 §4·§6][SPLIT] |
| [판독: 어셈블리] 광장 | 추종·기구 혼합·near1/far2000 | menu00 `@0x7100003de0~0x71000047a0`; U01 | [plaza_3d §3.4~3.5][PLAZA] |
| [판독][데이터] 인트로 | scroll/deco/Front·Cut18·시간축 | menu00 `@0x7100003c00`; op `@0x7100023b60/0x7100024190`; raw 파일의 flags/curves | [plaza_intro §7·§8][INTRO], [raw][INTRODATA] |
| [판독][데이터] 결과 | speed0→1·300f·부분 near/far override | main `@0x71002efcd4/0x71002f13c0/0x71002f4390/0x71002f4f00`; FSNB BaseData/FrameCount | [minigame_result §6.7·§7.2][RESULT] |
| [판독] 모션 시간 | 속도·완료·큐·대표 노드 | main `@0x710002dd98/0x7100023728/0x7100813940` | [09 §6.3~6.6][MOTION], [07 §3.2][CAM] |
| [판독][설계] 결정성 | sync RNG·FrameGate·f32 | main SyncRandModF `@0x7100189494`; 웹 `FrameGate.canStep/inputsFor` | [01 §6.6~6.7][CORE], [minigame_scene §12.12.6][MGSCENE] |
| [데이터] mg1801 | 4파일 중 실제 3라벨 | `mg1801_cameras.json`: FrameCount/curves/pos/aim/fovy/near/far | [07 §7.1][CAM], [덤프][MGDATA] |
| [데이터] 스캔 | 파일 존재·길이·모드 | `fsnb_scan.json`: 파일별 FrameCount/flags/BaseData | [07 §7.2][CAM], [스캔][SCAN] |
| [데이터] 추종 값 | 10개 이름 있는 필드 | `menu/menu00/data/CameraParam.json`: MainMenu*/MainBalloon* | [CameraParam][CP] |
| [데이터] 실제 웹 | 세 구현·추종·Stage3D | 원본 주소를 만들지 않고 파일·식별자로 인용 | [FsnbCamera][WB], [MgCamera][WM], [mg1801][WG], [MenuCameraFollow][WF], [Stage3D][STAGE] |
| [미확정] 확대 범위 | 별도 shake·게임별 조건 | mg1704 `@0x71000094d4/0x7100009224/0x71000094b4`; U04·U08~U12 | [함수 TSV][F1704], §7.2·§11 |

[설계] `minigame_result §6.7`의 “g3d evaluator 미확정”과 일반 Horner 예시는 최신 [07 §6.4·§11][CAM]의 어셈블리 판독으로 대체해 읽는다. 원문은 수정하지 않는다. main `@0x71007753d0→0x7100774350/0x71007743e0→0x7100772764`.

[데이터] JSON의 실제 필드 경로는 다음과 같다. [mg1801 덤프][MGDATA]는 `[].file`, `[].scenes[].cameras[].{frameCount,flags,loop,rotationMode,projection,base,curves}`이고 base는 `near/far/aspect/fovyRad/pos/rotOrAim/twist`다. [전체 스캔][SCAN]은 `items[].scenes[].cameras[]`에 같은 base 필드를 두지만 곡선 계수는 포함하지 않는다. [인트로 raw][INTRODATA]의 `[].scenes[].cameras[].curves[]`는 `animDataOffset/type/frameType/keyType/preWrap/postWrap/start/end/scale/offset/delta/keys`다. [삼각함수 표][SINCOS]는 `entries[]`다. 아래 FrameCount·BaseData는 원본 필드 개념이며 JSON에서는 frameCount·base에 대응한다.

### 2.2 조사·변경 범위

[데이터] `C:/dev/mpj`의 상위·하위에서 `AGENTS.md`를 찾았으나 발견되지 않았다. `.agents`는 저장소·web·작업용 루트에 없으므로 로컬 `.agents/skills` 지침도 없었다. 기억 자료를 판정 근거로 쓰지 않았다.

[데이터] `C:/dev/mpj`에는 `.git`이 없어 읽기용 `git status --short`가 실패했다. git 쓰기 명령은 사용하지 않았다. 자신의 [20_camera_runtime.md](20_camera_runtime.md)만 새로 쓰고, 출처·코드 13파일의 SHA-256 전후 대조는 부록 D에 기록한다.

### 2.3 구현 차단 항목 보완 조사

[데이터] 2026-10-10 02:39 UTC에 최신 `analysis/decomp/*.c`·`ghidra_work/*/out/*.c` **486파일**의 목록·수정시각·함수헤더를 INDEX와 대조했다. 최신 담당파일은 mg0116(02:22)·mg1704(02:31)이며 이미 보완한 판독과 일치했다. 현재 요청7함수의C/INDEX 항목은없다. 후속에준비된docs_gap_main 기판독12함수는선언만확인하고mg0116 5·mg1704 7함수만새로읽었다. 다른NRO의동주소는제외했다. [INDEX][IDX], [main][FMAIN], [mg0116][F0116], [mg0903][F0903], [mg1704][F1704], [보완 main C][C_GAP], [mg0116 C][C0116], [mg1704 C][C1704].

| 대상 | caller/callee·자료 목록 | C·판독 처리 |
|---|---|---|
| [데이터] common shake 생성 | main `@0x71004e0db8` → HandleSource.Reset·상수 포인터; Start `@0x71004e0e50`·Stop `@0x71004e1184`는 기판독 | 생성자 C만 새 판독. [C][C_CORE], [07 §7.6][CAM] |
| [데이터] common shake tick | main `@0x71004e14dc→0x71004e124c→0x71004e12d0`; 등록/mask/우선순위 writer는 미식별 | 최신 docs_gap_main.c에 C 추가됨·선언만대조;기존판독재사용. [INDEX][IDX], [C][C_GAP], [07 §7.6][CAM] |
| [데이터] 게임 caller·후보 | mg0116 Initialize `@0x7100004930`, CreateCamera `@0x7100004c9c`, SetQuake `@0x7100005330`; mg0903 StartShake `@0x7100033c24`·Initialize `@0x7100032ed0` | mg0116 세C새판독·common Start직접호출확정;mg0903 C없음. [mg0116 C][C0116], [mg0903 함수표][F0903] |
| [데이터] mg0116 파라미터 | GameParam.Initialize `@0x710000ffb0` → GetCsvParamF `@0x71000105a4`; 실제 `mg0116_config.csv` FLOAT행 | 두C새판독·index1=20 데이터연결. [mg0116 C][C0116], [CSV][P0116] |
| [데이터] 별도 mg1704 | ctor `@0x7100008f60`, Start `@0x71000094d4`, Receive `@0x7100009224`, Stop `@0x71000094b4`, tick mask `@0x7100009554`·priority `@0x7100009578`, Perlin `@0x710000959c` | 최신C7함수새판독. [C][C1704], [mg1704 함수표][F1704], §6.8 |
| [데이터] aspect·frustum | main SetAspectRatio `@0x71008475c8→0x71008467b0→0x71008638c8/0x7100863950/0x7100863f64`; Camera 초기화 `@0x71008455f4` | 6개 새 판독. 기판독 Fovy/Frustum/Ortho setter는 다시 읽지 않음. [C][C_CORE], [07 §4.4·6.1][CAM] |
| [데이터] type2·pass 후보 | main `@0x71008472f0`(행렬 인수·역할 미확정), `@0x71006c0c6c/0x71006c0d44` | C 없음. type2 writer라는 이름을 만들지 않고 추출 요청/미식별 표에 분리. [함수표][FMAIN], [07 §4.3][CAM] |
| [데이터] BakedFloat 경계 | main `@0x710077236c/0x71007723a8/0x71007723f0`; 인접 함수 `@0x710077228c` 크기224, 다음 `@0x710077243c` | 세 위치를 포함하는 TSV 함수 범위가 없음. 내부 위치를 시작주소로 바꾸지 않음. [함수표][FMAIN], [07 §6.4][CAM] |

[설계] 등록·프레임 전달의 기존 판독은 [mg0101 §3.6][G0101]·[mg0122 §3.5][G0122]를 추가 재사용한다. C가 없는 caller·vtable 함수를 판독한 것처럼 쓰지 않는다. 보완 결과는 §6.6, 잔여 차단은 §11·부록 C다.

## 3. 진입점·호출 흐름

| 흐름 | 원본 계약 | 모듈·주소·출처 |
|---|---|---|
| [판독] 생성 | 엔티티→ComMatter(1)→ComCamera→기본 layer→AddAnimation→Play | main `@0x71002af940`; mg1801 `@0x710000f9d0`; [07 §3.1][CAM] |
| [판독] 애니 | 대표 모션 노드→CameraAnimObj 결과→pass→world view | main `@0x71006c0fe0→0x71006c1120→0x7100849250`; [07 §3.2·§6.1][CAM] |
| [판독: 어셈블리] 곡선 | SetRes: BaseData 복사/캐시 초기화→Calculate: 같은 frame 생략→offset별 f32 쓰기 | main `@0x7100775330→0x710077431c`, `@0x71007753d0→0x7100774350/0x71007743e0→0x7100772764`; [07 §6.4][CAM] |
| [판독: 어셈블리] 추종 | StartMainMenuCamera→Fiber마다 목표 이동→기구 혼합→LookAt | menu00 `@0x7100003ae0→0x7100003de0`; [plaza_3d §3.5][PLAZA] |
| [판독: 어셈블리] shake | Start→event0x5F454E00 콜백→Update→위치 적용→Stop | main `@0x71004e0e50→0x71004e14dc→0x71004e124c→0x71004e12d0→0x71004e1184`; [07 §7.6][CAM] |
| [판독] 결과 | 생성·선택·Play·speed0→Start speed1→IsFinished | main `@0x71002efcd4/0x71002f13c0/0x71002f4390/0x71002f4470`; [결과 §6.7][RESULT] |
| [판독] draw | base 복사→split projection 보정→draw/scissor로 HUD 투영 | main `@0x710086195c/0x7100862b58/0x71001caec0`; [10 §4·§6][SPLIT] |

[설계] 웹은 승인된 logic tick에서 시간·추종·shake를 1회 진행하고 draw는 snapshot을 읽는다. `CameraDriver.apply(camera,df)`를 시간 주인으로 두면 렌더 빈도·FrameGate에 의존하므로 연결을 나눈다. [Stage3D.update][STAGE], [FrameGate][MGSCENE], [DESIGN §10][D10]. animation/world와 shake의 정확한 원본 상대 순서는 U02다.

## 4. 구조체·필드·상수

### 4.1 원본 필드

| 객체·필드 | 뜻·기본값 | 모듈·주소·출처 |
|---|---|---|
| [판독] CameraAnimObj+48 결과 | 0x2C B: near+00,far+04,aspect+08,fovy+0C,pos+10,aim/rot+1C,twist+28 | main `@0x71006c1120`; [07 §4.1][CAM] |
| [판독] ResCameraAnim+4 | 0x0100=EulerZXY,0x0400=Perspective; 해제하면 Aim/Orthographic | main `@0x71006c1120`; [07 §4.2][CAM] |
| [데이터][추정] 나머지 flag | 0x0001=BakedCurve 이름,0x0004=Looping; 슬롯 loop 연결의 해석 수준 유지 | FSNB ResCameraAnim.Flags; [07 §4.2][CAM], [09 §6.6][MOTION] |
| [판독] pass+18/+19 | byte 기본0/1: aspect 유지/near-far 적용 | main `@0x71006c0e5c/0x71006c1120`; [07 §4.3][CAM] |
| [추정] flag 이름·경로 | ApplyAspectEnabled↔+18,ApplyNearAndFarEnabled↔+19; mg1801 기본 pass 가정은 U01 | main `@0x71006c0d44/0x71006c0c6c`; [07 §4.3][CAM] |
| [판독] Camera+1D0/1D4/1D8/1DC/1E0 | near/far/aspect/fovy(rad)/type; 0=Fovy,1=Frustum,2=Lighty,3=Orthographic | main `@0x7100846b04/0x71008458f8`; [07 §4.4][CAM] |
| [판독] Reset | eye(0,0,10),aim(0,0,0),up(0,1,0),focus10; fovy0.6605948805809021,aspect=f32(16/9),near0.1,far1000 | main `@0x71008458f8/0x7100848e30`; [07 §4.4][CAM] |
| [판독] ComCamera+20/+28/+40~7F/+80 | owner/camera handle/anim view/anim focus; focus−1=없음 | main `@0x7100849204/0x7100849250`; [07 §4.5][CAM] |
| [판독] Camera+2F8 | focus≥0만 기록; DOF 중심 자동 연동 없음 | main `@0x7100849250`; [07 §6.3][CAM] |
| [판독: 어셈블리] ResAnimCurve | +00 frames,+08 coeffs,+10 flags,+12 keyCount,+14 AnimDataOffset,+18/1C start/end,+20/24/28 scale/offset/delta | main `@0x7100774350/0x71007743e0/0x7100772764`; [07 §6.4][CAM] |
| [판독: 어셈블리] shake state | +50 elapsed,+54 duration,+58 freq,+5C amp,+60 savedBase,+70/74 freq endpoints,+78/7C amp endpoints,+80/+90 vectors,+A0 phase | main `@0x71004e0e50/0x71004e124c/0x71004e12d0`; [07 §7.6][CAM] |

### 4.2 광장 파라미터

[데이터] 표 전체는 실제 [CameraParam.json][CP]의 필드 값이다. 주소 없는 데이터에 주소를 만들지 않는다. 소비 함수는 menu00 `@0x7100003de0` [plaza_3d §3.5][PLAZA]다.

| 필드 | 값 | 필드 | 값 |
|---|---|---|---|
| [데이터] MainMenuTargetOffsetY | 2.5 | MainBalloonTargetOffsetY | 8 |
| [데이터] MainMenuCameraLength | 10 | MainBalloonCameraLength | 18 |
| [데이터] MainMenuCameraAngle | 15° | MainBalloonCameraAngle | 0° |
| [데이터] MainMenuCameraFovy | 40° | MainBalloonCameraFovy | 65° |
| [데이터] MainMenuCameraTargetPlayRange | 3 | MainMenuCameraFollowSpeed | 0.01 |

## 5. 상태·수명

[판독] mg1801은 Initialize에서 loop, (0,6)에서 result, 캡처가 켜진 모드의 (2,2)에서 capture를 요청한다. (0,1)/(0,2)/(0,5)에는 전환이 없고 cam01은 등록하지 않는다. mg1801 `@0x710000f9d0/0x7100010a90`; [07 §3.1·§5.1][CAM].

[데이터] mg1801 4개 FSNB 모두 FrameCount0·커브0이다. loop라는 이름은 시간이 도는 루프의 증거가 아니다. `mg1801_cameras.json` 파일별 FrameCount/curves; [07 §7.1][CAM], [덤프][MGDATA].

[판독] 결과 무대는 준비 speed0→시작 speed1→슬롯 IsFinished다. near/far override는 각각 음수이면 현재 값을 유지한다. 엔티티에는 pos_result world 위치·회전을 적용한다. main `@0x71002efcd4/0x71002f4390/0x71002f4470/0x71002f4f00`; [결과 §6.7][RESULT].

[판독: 어셈블리] shake Start는 기존 동작을 Stop하고 base를 저장한다. duration>0일 때 시작하고 주파수 endpoints는 최소1이다. 종료 repeat은 elapsed만0, Stop은 저장 위치 복원·활성/축 bit 제거다. main `@0x71004e0e50/0x71004e124c/0x71004e1184`; [07 §7.6][CAM].

[설계] 상태·frame cache·shake 소비 이력은 장면 카메라 인스턴스가 소유한다. 해제는 driver 제거·shake 정지·state 폐기다. 렌더러/RT 수명은 코어 API에 넣지 않는다. [DESIGN §10][D10], [10 §7·§9][SPLIT]; Stop 복원은 main `@0x71004e1184` [07 §7.6][CAM]이다.

## 6. 계산식·의사코드

### 6.1 pass·투영·world

[판독] fovy는 원근이면 full vertical radians, 직교이면 화면 높이다. aspect=applyAspect?res.aspect:camera.aspect, near/far=applyNearFar?res값:현재값이다. 원근 top=near*tan(fovy/2); 직교 top=fovy/2,bottom=−top,left=−aspect*top,right=aspect*top이다. main `@0x71006c1120/0x7100846b04/0x71008470ac`; [07 §6.1·§4.4][CAM].

[판독] 원본 오른손·시선−Z·깊이0..1의 열벡터 표기는 P00=1/(tan(fovy/2)*aspect),P11=1/tan(fovy/2),P22=−far/(far−near),P23=−near*far/(far−near),P32=−1이다. main `@0x7100846b04`; [07 §4.4][CAM].

[판독] `camWorld=entity.worldMatrix * inverse(animView)`다. Aim focus=length(pos−aim),Euler focus=−1이다. mg1801은 identity이지만 결과에는 world를 한 번만 곱해야 한다. main `@0x7100849250/0x710084b4a0/0x71002efcd4`; [07 §6.3][CAM], [결과 §6.7][RESULT].

[설계] three 어댑터는 WebGL 깊이−1..1과 열벡터로 변환한다. 원본 깊이항을 그대로 복사하지 않는다. split은 base를 바꾸지 않고 draw snapshot만 보정한다. main `@0x7100846b04/0x7100862b58`; [07 §9.1][CAM], [10 §4][SPLIT], [DESIGN §10][D10].

### 6.2 Aim·Euler·삼각함수

[판독] d=pos−aim; 일반 Aim은 Z=normalize(d),r=normalize(d.z,0,−d.x),u=Z×r,X=cos(twist)*r+sin(twist)*u,Y=−sin(twist)*r+cos(twist)*u다. 행벡터 view의 열0/1/2는 X/Y/Z, 마지막 행은−dot(pos,axis)다. main `@0x71007758a4`; [07 §6.2][CAM].

[판독] d.x=d.z=0이면 twist를 무시한다. d.y>0은 X=(1,0,0),Y=(0,0,−1),Z=(0,1,0); 그 밖은 X=(1,0,0),Y=(0,0,1),Z=(0,−1,0)이다. three.lookAt의 수직 fallback으로 대체하지 않는다. main `@0x71007758a4`; [07 §6.2][CAM].

[판독] EulerZXY 회전은 Ry(y)*Rx(x)*Rz(z), three YXZ와 대응한다. yaw를 ±π로 감싸면 scroll 경로를 바꾼다. main `@0x7100775b90`; [07 §6.2][CAM], [plaza_intro §7.3][INTRO].

[판독: 어셈블리][데이터] camera sincos는 SDK 256행 표 보간이다. idx=fcvtzs(rad*(2^31/pi)),행=(idx>>24)&255,fraction=(idx&0xffffff)*2^-24; 결과는 행 값+fraction*delta다. main Euler `@0x7100775b90`; SDK 이미지 offset `0x8B570C`, [sincos_table.json][SINCOS]; [07 §6.5][CAM].

[설계] 정확 경로는 표·f32·FMA를 보존한다. Math.sin/cos는 근사 추천이며 미승인이다. 광장 추종 sinf를 SDK 표 호출과 동일하다고 단정하지 않는다. menu00 `@0x7100004360~0x71000043d0/0x7100004644~0x71000046cc`; [plaza_3d §3.5][PLAZA], [07 §6.5][CAM], [DESIGN §10][D10].

### 6.3 FSNB 곡선·프레임

[판독: 어셈블리] BaseData 복사 뒤 곡선별 AnimDataOffset에 쓴다. 같은 frame은 cache hit다. frameType0=f32,1=signed Decimal10x5(i16/32),2=u8; 키 구간은 a≤frame<b다. i16 탐색 floor(frame*32),byte 탐색 trunc(frame)을 쓰되 t는 원래 소수 frame으로 계산한다. main `@0x7100775330/0x71007753d0/0x7100774350/0x71007743e0`; [07 §6.4][CAM].

[판독: 어셈블리] 아래는 기존 식이다. F=f32,FMA=곱·합을 합쳐 한 번 반올림이다. main Cubic `@0x7100771dfc/0x7100771ee0/0x7100771fdc`,Linear `@0x71007720d8`,최종 `@0x7100772878~0x710077287c`; [07 §6.4][CAM], [plaza_intro §7.3][INTRO].

```text
[판독: 어셈블리] t = F(F(frame-a) * F(1/F(b-a)))
[판독: 어셈블리] h = FMA(k3,t,k2); l = FMA(k1,t,k0)
[판독: 어셈블리] cubic = FMA(F(h*t),t,l)
[판독: 어셈블리] linear = FMA(k1,t,k0)
[판독: 어셈블리] result = FMA(value,scale,offsetPrime)
```

[판독: 어셈블리] BakedFloat는 i=trunc(frame)−trunc(start),u=frame−trunc(frame),`FMA(K[i+1],u,F((1−u)*K[i]))`다. scale0은0 그대로이며 마지막 키 이상도 계수 평가를 생략하지 않는다. Step/정수 evaluator는 이 float 식으로 덮지 않는다. main 코드 위치 `@0x710077236c/0x71007723a8/0x71007723f0`; [07 §6.4][CAM]. 함수 시작 미식별은 부록 C다.

[판독: 어셈블리] wrap은 start≤frame≤end에서 frame을 유지한다. 바깥은 L=end−start,d=pre?start−frame:frame−end,q=trunc(d/L),r=F(d−L*q)다. 아래 표 전체는 main `@0x7100772764~0x7100772840` [07 §6.4][CAM]다.

| wrap | pre | post | offsetPrime |
|---|---|---|---|
| [판독: 어셈블리] Clamp0 | start | end | offset |
| [판독: 어셈블리] Repeat1 | end−r | start+r | offset |
| [판독: 어셈블리] Mirror2 | q짝 start+r / q홀 end−r | q짝 end−r / q홀 start+r | offset |
| [판독: 어셈블리] RelativeRepeat3 | end−r | start+r | offset±(q+1)*delta; pre−/post+ |

[설계] L=0 반복을 임의 정상화하지 않는다. slot loop/speed/완료와 curve wrap을 분리하고 `frame%=FrameCount`를 공통 원본 규칙으로 삼지 않는다. main `@0x7100772764/0x7100023728`; [07 §6.4][CAM], [09 §6.6][MOTION], [DESIGN §10][D10].

### 6.4 광장 추종

[판독: 어셈블리] menu00 `@0x7100003de0~0x71000047a0`의 식을 재사용한다. T는 ComMenuCamera+50 지속 목표, P는 첫 플레이어 발 위치, 시작 T는 char_plaza_default_pos다. [plaza_3d §3.5][PLAZA].

```text
[판독: 어셈블리] d=P-T; if length(d)>range:
[판독: 어셈블리]   k=dot(d,d)/(range*range)
[판독: 어셈블리]   T += d*k*followSpeed
[추정]             f=normalize(-previousCameraBack.x,0,-previousCameraBack.z)
[판독: 어셈블리]   T += f*dot(d,f)*k*followSpeed
[판독: 어셈블리]   if entranceClamp: T.x=0; T.z=clamp(T.z,balloon.z,default.z)
[판독: 어셈블리] if T.z<18 and -9<T.x<9:
[판독: 어셈블리]   t=clamp((T.z-9)/-9+1,0,1); copiedZ=t>=1?9:T.z
[판독: 어셈블리]   at=((1-t)*T.x,T.y+lerp(menuOffset,balloonOffset,t),copiedZ)
[판독: 어셈블리]   angle/length/fovy=각 menu→balloon lerp(t)
[판독: 어셈블리] else: at=T+(0,menuOffset,0); angle/length/fovy=menu값
[판독: 어셈블리] v=normalizeXZ(camera00-at); v.y=sin(angle*0.017453292)
[판독: 어셈블리] eye=at+v*length; near=1; far=2000
```

[추정] +0xA0를 지난 world z열로 보는 해석은 원 자료 수준을 유지한다. d는 T 갱신 전 값이다. menu00 `@0x7100003de0`; [plaza_3d §3.5][PLAZA].

[판독: 어셈블리] v에 cos(angle)을 곱하거나 y 추가 뒤 재정규화하지 않는다. 혼합 기준은 P가 아닌 T의 z다. followSpeed0.01은 dt를 곱하지 않는 프레임당 값이며 원본 메뉴 Variable60과 웹 고정60은 별개다. menu00 `@0x7100004360~0x71000043d0/0x7100004644~0x71000046cc`; [plaza_3d §3.5][PLAZA], [01 §4.3~4.4][CORE].

### 6.5 흔들림·난수 소비

[판독: 어셈블리] elapsed+=dt,t=min(elapsed/duration,1),freq/amp는 endpoints FMA 보간이다. phase=min(phase+dt/(1/freq),1),v=vStart+(vTarget−vStart)*phase다. 위치는 savedBase+amp*(basisX*v.x+basisY*v.y+basisZ*v.z)다. main `@0x71004e124c/0x71004e12d0`; [07 §7.6][CAM].

[판독: 어셈블리] phase≥1이면 X/Y가 켜진 순서대로 SyncRandModF(2)−1을 뽑고 z=0을 쓴다. len²=0이면 UnitY,0<len²≤1이면 정규화,len²>1은 그대로다. phase는0으로 되돌려 초과분을 버린다. main `@0x71004e12d0/0x7100189494`; [07 §7.6][CAM], [01 §6.6][CORE].

| 조건 | sync 출력 소비 | 근거 |
|---|---|---|
| [판독: 어셈블리] Stop 뒤 Start의 첫 target | 0회·UnitY; 새 축 bool 저장보다 생성이 먼저 | main `@0x71004e0e50/0x71004e1184`; [07 §7.6][CAM] |
| [판독: 어셈블리] phase 경계 X만/Y만 | 각1회 | main `@0x71004e12d0/0x7100189494`; [07 §7.6][CAM] |
| [판독: 어셈블리] phase 경계 X+Y | 2회·X→Y | 같은 main 주소·[07 §7.6][CAM] |
| [판독: 어셈블리] phase 미도달/축 모두OFF | 0회 | 같은 main 주소·[07 §7.6][CAM] |
| [판독] mg1801 카메라 | shake 미사용·소비0 | mg1801 `@0x710000f9d0/0x7100010a90`; [07 §8][CAM] |
| [설계] Gate 닫힘/draw/resize/snapshot | 소비0·phase/frame/추종 목표 유지 | [FrameGate][MGSCENE], [DESIGN §10][D10] |

[설계] randModF(max)는 host sync stream을 주입한다. 독립 seed·Math.random·카메라 전용 RNG를 만들지 않는다. SyncRandModF의 `f32(f32(ucvtf(u)*max)*2^-32)`는 async RandModF의 FMA와 다르다. main `@0x7100189494`; [01 §6.6][CORE], [rng.ts][RNG], [DESIGN §10][D10].

### 6.6 보완 판독 — 생성·aspect·frustum·시간 순서

[판독] common shake 생성자는 elapsed/duration(+50/+54), freq/amp(+58/+5C), endpoints(+70~7C), phase(+A0)를 0으로 쓴다. savedBase(+60)와 두 벡터(+80/+90)는 `PTR_ConstantZero_7101a837a8`이 가리키는 값을 복사한다. 생성자에는 RNG 호출이나 tick 등록 호출이 없다. main `@0x71004e0db8`; [camera_core.c][C_CORE].

[판독] Camera 초기화는 +1E0에 type4를 쓴 뒤 SetViewLookAt·SetProjectionPerspectiveFovy를 호출한다. 최종 기본 투영은 기판독 Fovy setter의 type0이므로 type4를 별도 게임 카메라 모드라고 단정하지 않는다. main `@0x71008455f4/0x7100846b04`; [C][C_CORE], [07 §4.4][CAM].

[판독] `FUN_71008467b0`은 이미 저장된 view/projection의 합성·역행렬·frustum을 갱신하는 함수다. 그 안의 type switch는 투영행렬 생성 switch가 아니다. frustum 출력은 Camera+1F0, 입력 변환 행렬은 Camera+80이다. main `@0x71008467b0`; [C][C_CORE].

| type | frustum helper·수학 | 판정·출처 |
|---|---|---|
| [판독] 0 | `@0x71008638c8`: SDK 표로 tan(fovy/2) 계산, top=near*tan,bottom=−top,left=−top*aspect,right=top*aspect → `@0x7100863950` | Fovy → 원근 frustum. main `@0x71008467b0/0x71008638c8`; [C][C_CORE] |
| [판독] 1·4 | `@0x7100863950`: near면 x/y를 far/near로 확대해 far면 점을 만들고 입력 행렬로 변환 | 원근형 frustum 계산 공유. type4의 투영행렬 규칙은 별도 미확정. main `@0x71008467b0/0x7100863950`; [C][C_CORE] |
| [판독] 2·3 | `@0x7100863f64`: near/far에 같은 x/y 경계를 써 변환점 생성 | 직교형 frustum 계산 공유이며 type2=직교 투영이라는 증거는 아님. main `@0x71008467b0/0x7100863f64`; [C][C_CORE] |
| [판독] 나머지 | UnexpectedDefaultImpl | 임의 mode fallback 없음. main `@0x71008467b0`; [C][C_CORE] |

[판독] 두 경계 helper는 변환된 여덟 점으로 축별 min/max와 평면식을 쓴다. 원근 helper에는 `far*(1/near)`가 있지만 직교 helper는 x/y를 far에서 확대하지 않는다. 이 구분을 투영행렬의 동등성으로 확대하지 않는다. main `@0x7100863950/0x7100863f64`; [C][C_CORE].

[판독] SetAspectRatio는 새 aspect와 +1D8이 같으면 type 검사 없이 반환한다. 값이 다르면 type0은 Fovy setter, type1·3은 중심과 높이를 유지하며 폭을 바꾼다. type2·4 및 다른 type은 UnexpectedDefaultImpl이다. main `@0x71008475c8`; [C][C_CORE].

```text
[판독] centerX = (left+right)*0.5
[판독] height = top-bottom; halfWidth = height*0.5*newAspect
[판독] left' = centerX-halfWidth; right' = centerX+halfWidth
[판독] top/bottom/near/far 유지; type1=Frustum, type3=Orthographic 재계산
```

[판독] 위 식은 main `@0x71008475c8` [C][C_CORE]의 저장·계산 순서다. 비대칭 원근에서 left/right 중심을 0으로 다시 만들면 원본과 달라진다.

[설계] type2·4의 changed-aspect 코어 계약은 아직 미지원이다. main `@0x71008475c8`; [C][C_CORE].

[판독] 기존 등록 판독으로 슬롯 frame 진행은 0x0B, Entity tick 전달은 0x0E의 Scene→Fiber→Entity 뒤다. Entity의 그룹/수신 목록 및 같은 Entity의 컴포넌트 배열 순서가 전달 순서에 관여한다. main `@0x710080c858/0x710080cd70/0x710089f9f0/0x710089fce0/0x7100899450`; [mg0101 §3.6][G0101], [mg0122 §3.5][G0122].

[미확정] 슬롯 frame 진행이 shake tick보다 앞이라는 범위만 좁혀졌다. AnimationPass.Apply/ComCamera.world 갱신 완료와 shake의 실제 상대 순서, 두 게임의 생성·활성화 순서는 확보되지 않았다. main `@0x71006c0fe0/0x7100849250/0x71004e14dc`; [07 §3.2·7.6][CAM], [mg0101 §3.6][G0101].

[설계] 순수 shake 상태·정해진 인수·정해진 호출 순서의 난수 소비식은 바로 구현 가능하다. 게임 연결은 host가 base/basis·tick 순서를 명시하고 U02~U04 해결 전 원본 동등 판정을 보류한다. 생성자에서 새 난수 소비를 추가하지 않는다. main `@0x71004e0db8/0x71004e0e50/0x71004e12d0`; [C][C_CORE], [07 §7.6][CAM], [DESIGN §10][D10].

### 6.7 보완 판독 — mg0116 연결·인수·실제 CSV

[판독] CreateCamera는 GameMgr handle(+B0~C0) 저장→Entity 생성/SetEntity→ComMatter(1) 추가→`camOp00`/`camGame00` 애니 등록→default layer 카메라 지정→`camOp00` Play·SetFrame(0)을 한다. Matter handle은 Camera+C8~D8이다. mg0116 `@0x7100004c9c`; [C][C0116].

[판독] Initialize는 이미 연결된 Entity를 얻고 `AddComponent<wl::util::ComponentCameraShaking>`을 호출한다. 반환된 valid handle을 Camera+F8/+100/+108에 저장한다. CreateCamera와 Initialize 각각의 동작은 확정이며 게임 전체에서 두 진입점의 호출 스케줄까지 이 함수 둘로 확정하지 않는다. mg0116 `@0x7100004930`; [C][C0116].

[판독] SetQuake는 Matter/motion handle이 유효해야 하며 `ComActorMotion::Stop` 뒤 `GameParam::GetCsvParamF(index=1)`을 읽는다. `frequency=param1; if(param1<=threshold) frequency=threshold`를 쓴 뒤 유효한 shake handle이면 common Start를 직접 호출한다. 잘못된 Matter/GameMgr handle은 AbortImpl이다. mg0116 `@0x7100005330`; [C][C0116].

[판독] GameParam.Initialize는 `mg/mg0116/data/mg0116_config.csv`를 읽어 type열이 정확히 FLOAT인 행의 값열을 `atof→float`로 순서대로 별도 vector(+00/+08/+10)에 넣는다. GetCsvParamF는 이 float vector를 index*4로 조회하고 범위를 벗어나면 AbortImpl이다. mg0116 `@0x710000ffb0/0x71000105a4`; [C][C0116].

[데이터] 실제 [mg0116_config.csv][P0116]의 2행은 `60,FLOAT`,3행은 `20,FLOAT`다. 따라서 FLOAT만 모은 0기반 index1=20이다. CSV의 전체 행번호1이나 INT행 번호와 혼동하지 않는다. 주소 없는 자료 근거는 이 파일의 3행·값열(1열)이며, 연결 판독은 mg0116 `@0x710000ffb0/0x71000105a4/0x7100005330` [C][C0116]이다.

| SetQuake 로컬 저장 | 확정 값 | 원본 ShakeArg 대응 해석 |
|---|---|---|
| [판독][추정] local_48 | param2의32bit 값 | arg+00 duration 후보 |
| [판독][추정] fStack_44·local_40 | 위 비교로구한frequency·같은값두번 | arg+04/+08 freq endpoints 후보 |
| [판독][추정] uStack_3c·local_38 | floatBits0x3dcccccd=f32(0.1) | arg+0C/+10 amp endpoints 후보 |
| [판독][추정] local_34·local_32 | 0x0101·0 | arg+14/+15 X/Y=true, +16 repeat=false 후보 |

[판독] 표의 로컬 저장은 mg0116 `@0x7100005330` [C][C0116]에 있다. [추정] 연속 로컬의 0x17 B 배치는 main Start의 기판독 ShakeArg(+00~+16)와 맞는다. main `@0x71004e0e50`; [07 §7.6][CAM]. [미확정] 이 C의 import prototype에는 Start의 두 번째 인수/로컬 주소가 생략됐다. 필드 대응을 확정으로 승격하지 않으며 ABI 복구는 U03에 남긴다. [mg0116 C][C0116], [함수표][F0116].

[데이터] 같은 C의 호출 메타데이터에는 CameraManager.CreateCameraManager `@0x71000054b8→Camera.CreateCamera`와 Dossun.Update `@0x710000db80→Camera.SetQuake`가 있다. 이 두 caller 본체는 새 판독 수에 넣지 않았고 trigger조건/param1·2 계산 의미를 확정하지 않았다. [mg0116 C][C0116], [함수표][F0116].

[설계] mg0116 연결은 motion.Stop과 하한20의 비교식을 보존한다. field 대응의 추정이 해소되면 common shake 인수로 연결하며, 추정 bool에 따른 소비 기대값을 원본 실행 결과로 쓰지 않는다. main Start 첫target 소비0은 이미 확정된 별도 규칙이다. mg0116 `@0x7100005330`,main `@0x71004e0e50`; [C][C0116], [07 §7.6][CAM], [DESIGN §10][D10].

→ 정리본: [mg0116.md](../minigame/mg0116.md#73-추가-c의-모션소리카메라-연결) §7.3
### 6.8 보완 판독 — mg1704 별도 shake·Perlin

[판독] mg1704 생성자는 owner Entity(+20), active(+28)=0, mode(+2C)=3, remaining(+30)/amplitude(+34)/frequency(+38)/requestPriority(+3C)=0, baseTerm(+40~4C)=`PTR_ConstantZero_710009b1e8` 값, Camera handle(+50/+58/+60)을 설정한다. owner에서 ComCamera를 찾지 못하면 AbortImpl이다. mg1704 `@0x7100008f60`; [C][C1704].

[판독] Start는 현재 requestPriority≤새 priority일 때만 priority/type/active/remaining/amplitude/frequency를 덮어쓴다. duration>0 검사·Stop 선행·현재 camera 위치 저장·endpoint/phase 보간이 없다. 낮은 priority는 무시하고 같은 priority는 재시작한다. mg1704 `@0x71000094d4`; [C][C1704].

[판독] ReceiveMessageImpl은 active && message0x5F454E00일 때 remaining-=GetDeltaTime부터 수행한다. remaining≤0이면 active와requestPriority를0으로 만들고 SetTranslation 경로로 간다. remaining>0이지만 Camera handle이 무효면 위치·난수를 진행하지 않는다. 반환값은0x8000이다. mg1704 `@0x7100009224`; [C][C1704].

[판독] q=remaining*frequency이며 각 mode가 만든(x,y)는 `baseTerm + amplitude*(Camera+80기저*x + Camera+90기저*y)`에 들어가 owner Entity.SetTranslation을 부른다. common shake의 Camera.SetPosition과 대상이 다르다. mg1704 `@0x7100009224`; [C][C1704], main `@0x71004e12d0` [07 §7.6][CAM].

| mode | 신호(x,y)·처리 | sync RNG 소비·출처 |
|---|---|---|
| [판독] 0 | sinf(q)*UnitY의x/y | 0회. mg1704 `@0x7100009224`; [C][C1704] |
| [판독] 1 | sinf(q)*UnitX의x/y | 0회. 같은주소·[C][C1704] |
| [판독] 2 | 순서대로SyncRandRangeF(0,1) 두값→XY정규화 | tick당2회·첫값x/다음값y. 같은주소·[C][C1704],main `@0x71001894a8` [01 §6.6][CORE] |
| [판독] 3(기본) | x=2*Perlin(UnitX*q)−1,y=2*Perlin(UnitY*q)−1→XY정규화 | Perlin2회·sync0회. mg1704 `@0x7100009224/0x710000959c`; [C][C1704] |
| [판독] 4 | sinf(q)*(1−q)*UnitY의x/y | 0회·1−q를clamp하지않음. mg1704 `@0x7100009224`; [C][C1704] |
| [판독] >4 | Zero상수의x/y | 0회. 같은주소·[C][C1704] |

[판독] mode2/3 정규화는 NEON 역제곱근 추정·두 번 보정을 쓴다. length²=0이면 결과를0으로 mask하며 common shake의 UnitY fallback·length²>1 유지 규칙과 다르다. 종료tick/invalid handle/inactive/non-tick에는 난수0회다. mg1704 `@0x7100009224`; [C][C1704],main `@0x71004e12d0` [07 §7.6][CAM].

[판독] 수신 priority getter는0x80을 반환한다. 이것은 Start가 비교하는requestPriority(+3C)와 다른 값이다. tick mask getter는 `PTR_NnBezelDetailTickMessageBitFlagSet_710009b278`의 지시값을 반환하므로 실제 bit 값은 C 본문만으로 확정하지 않는다. mg1704 `@0x7100009578/0x7100009554`; [C][C1704].

[판독] Stop은 active/requestPriority를0으로 만들고 owner Entity.SetTranslation을 호출한다. [미확정] Stop과만료분기 C에는 SetTranslation의vector 인수가 생략돼 복원vector의주소/값은확정하지않는다. 활성갱신의baseTerm 위치식과Stop인수복원을분리한다. mg1704 `@0x71000094b4/0x7100009224`; [C][C1704].

[판독] 이 모듈의 SinglePerlinNoise는 외부 RNG 없이 고정 permutation/gradient 표를 조회한다. 좌표정수부는 `(int)` 변환, 격자 index는 &255, 소수부는v−(float)(int)v다. fade(t)=t³*((6t−15)t+10),여덟gradient내적의x→y→z보간 뒤 `(noise+1)*0.5`를 반환한다. floor나다른표로치환하지않는다. mg1704 `@0x710000959c`; [C][C1704].

[미확정] permutation `DAT_7100086e0d`와16슬롯×3f32 gradient `DAT_7100087010`의 실제 값은 C에 없고 허용된 기존 camera 데이터에도 없다. 값/범위를 신설하지 않고 부록 C.5 데이터 요청으로 남긴다. mg1704 `@0x710000959c`,데이터참조 `@0x7100086e0d/0x7100087010`; [C][C1704].

[설계] `game/lib/camera`에는 common phaseTarget과remainingSignal을 별도정책으로 둔다. host가 `randModF`/`randRangeF`와동일sync stream,원본noise표·sinf·normalize 수치provider를주입한다. mg1704 adapter는 ownerEntity translation으로 출력하며 임의로Camera위치에만쓰지않는다. 표값없는기본mode3은정확지원보류다. §6.5·6.8, [DESIGN §10][D10], [C][C1704], [01 §6.6][CORE].

## 7. 애니·효과·소리·카메라·에셋

### 7.1 mg1801 정적 기대값

[데이터] 아래 표 전체는 [mg1801_cameras.json][MGDATA]의 pos/aim/fovy/near/far와 [07 §7.1][CAM]이다. 소비는 mg1801 Initialize `@0x710000f9d0`,ReceiveState `@0x7100010a90`다.

| 라벨/파일 | pos→aim | fovy(rad) | near/far | 저장 aspect |
|---|---|---|---|---|
| [데이터] loop/mg1801_cam00 | (0,2,23)→(0,3,−3) | 0.34906584 | 0.1/10000 | 1.78 |
| [데이터] result/mg1801_cam02 | (0,5.5,20)→(0,0,−1.5) | 0.34906656 | 0.1/10000 | 1.78 |
| [데이터] capture/mg1801_cam_capture00 | (0,14.531198,23.946115)→(0,0,3.74) | 0.2617994 | 0.1/10000 | 1.777 |

[판독][추정] 라벨은 보간없이 바뀌며 기본 pass라면 저장 aspect를 적용하지 않는다. 대표 노드 조건은 main `@0x71006c1120/0x710080b6d0` [07 §3.2·§4.3][CAM]이다. 캡처 활성 여부·result→capture 요청은 main `@0x7100445ae8/0x710042d4ac` [07 §3.4][CAM]를 재사용한다.

### 7.2 문서화된 게임별 카메라 사용 표

[설계] 기존 카메라 절·명시 사용 행을 묶은 표다. FSNB 존재를 호출 증거로 바꾸거나 전체112게임의 지원표로 해석하지 않는다. [common_system_audit §7.2][AUDIT].

| 게임 | 문서화된 사용 | 모듈·주소 또는 데이터 필드·출처 |
|---|---|---|
| [판독][데이터] mg0101 | 단일 layer;op0/op1/game/result;game4750f,카메라 frame이 게임 시계 | mg0101 `@0x71000035b0/0x7100003d70~0x7100004094`; [§6.1][G0101] |
| [판독] mg0102 | Camera00~03→layer0~3;시작focus0→opening 균등4분할→종료focus0 | mg0102 `@0x7100003860/0x7100004ec0/0x7100005500`; [10 §1][SPLIT], [§7][G0102] |
| [판독] mg0106 | 단일 공동 화면;op00/op01/game00/game01 | mg0106 `@0x71000036f0/0x7100004ca0`; [§7][G0106] |
| [판독] mg0107 | 최저 칸 높이 변경 때 y를1초 선형 보간 | mg0107 `@0x7100008fdc`; [§6.9][G0107] |
| [판독] mg0116 | camOp00/camGame00 등록·op frame0;motion.Stop→common Start;FLOATindex1 하한20 | mg0116 `@0x7100004c9c/0x7100004930/0x7100005330`; §6.7, [C][C0116], [CSV][P0116] |
| [판독][미확정] mg0118 | 선두x·지연추종·zoom/22*120 frame;파일-번호 U08 | mg0118 `@0x7100003b30/0x7100003f10/0x710001d8e4`; [§6.12][G0118] |
| [판독] mg0122 | 플레이어4카메라·mask1<<p;사진base와split draw 분리 | mg0122 `@0x710001fea0/0x710001f840/0x710001b1c8/0x710001fe1c`; [10 §1·4·6][SPLIT], [§6.1][G0122] |
| [판독] mg0508 | 팀0/1→layer0/1;focus0→좌우2분할→focus0 | mg0508 `@0x71000035b0/0x7100004350/0x7100004840`; [10 §1][SPLIT], [§7][G0508] |
| [판독][미확정] mg0906 | 플레이어별 추적4카메라·op01/op02/game/ending;소인원 split 미확정 | mg0906 CameraMgr.UpdateMain(i) 기존 요약;`env/mg0906_cam_*.fsnb` 이름·frame; [§7·11][G0906], [스캔][SCAN]; 요약에 주소를 새로 만들지 않음 |
| [데이터][미확정] mg0911 | game/fever/mirrorball/tower/waluigi/op;선택 U09 | `env/mg0911_cam_*.fsnb` mode/fov/frame40~540; [§7][G0911], [스캔][SCAN] |
| [판독][미확정] mg0912 | 4카메라·회전/위치 보간·낙하고정·복귀해제;F60 U10 | mg0912 Camera.Update/Initialize 기존 요약;`analysis/mgB_cameras.json` 카메라 값; [§6.11·7.4][G0912]; 요약에 주소를 새로 만들지 않음 |
| [판독][미확정] mg1704 | ownerEntity에별도shake 출력·기본Perlin mode3;FSNB선택/실인수는이범위에서확정안함 | mg1704 `@0x7100008f60/0x7100009224/0x71000094d4`; §6.8, [C][C1704] |
| [판독][데이터] mg1801 | loop/result/capture 고정3시점;cam01 미사용·shake 없음 | mg1801 `@0x710000f9d0/0x7100010a90`; [07 §3.1·7.1][CAM] |
| [데이터] mg1802 | game/result/captureNormal/Long;FrameCount0 Aim | `mg1802_cam00/10/10_cap/10_long.fsnb` FrameCount/BaseData; [§7.4][G1802], [스캔][SCAN] |
| [판독][데이터] mg1803 | cam00 loop→cam01 result→cam_cap result_ss | mg1803 `@0x71000143f0~0x7100014510`; [§7.4][G1803] |
| [데이터] mg1804 | cam00 게임/cam01 result/cam01_cap capture | 파일별 BaseData;요청(3,7)/(3,8)은 [§7.4][G1804], [스캔][SCAN] |
| [데이터] mg1805 | op_cam120f speed0→1;result/result_ss;db_cam0/1 | `mg1805_cam00/01/ss/db_cam00/01` FrameCount/BaseData; [§7.5][G1805], [스캔][SCAN] |
| [판독][데이터] mg1806 | game·좌우/8명 zoom9/10/19f·result/captureNormal/Long | mg1806 `@0x71000049b0/0x71000110d0/0x71000042b0`; [§6.9·7.3][G1806] |
| [데이터] mg1807 | opening60f/game300f 키없음/result·capture1f | `mg1807_cam_op/00/result00/capture00` FrameCount/curves; [§7.2][G1807], [스캔][SCAN] |
| [데이터][추정] mg1808 | cameraIndex로cam00/01;cam02 결과/capture00;번호 대응은 표 순서 해석 | 파일별 BaseData·Params.cameraIndex; [§7.5][G1808], [스캔][SCAN] |
| [데이터][추정][미확정] mg1809 | cam00 게임/cam01 결과 해석;cam01/cap60f 곡선 U11 | `mg1809_cam00/01/01_cap` FrameCount/BaseData; [§7.4][G1809], [스캔][SCAN] |
| [데이터][추정][미확정] mg1810 | move100f loop·거리로speed;cam01 결과 해석/capture00;cam02 U12 | 파일별 frame/posZ/aimZ·모션move; [§7.4][G1810], [스캔][SCAN] |

[판독] mg1704의 별도 ComCameraShake는 새 C에서 common shake와 다른 remaining/mode/우선순위/RNG 규칙을 확인했다. §6.8·U04를 따른다. mg1704 `@0x71000094d4/0x7100009224/0x71000094b4`; [C][C1704].

### 7.3 효과·소리·에셋 연결 경계

[판독] focus 거리와 ComPosteffect DOF 중심은 자동 연결되지 않는다. mg1801 loop focus≈26.019지만 DOF 중심17은 별도 post 값이다. main `@0x7100849250/0x710007741c`; [07 §6.3·7.5][CAM].

[설계] 코어는 클립·수치·완료 사건만 제공한다. 컷·와이프·SE·결과 UI·DOF 요청은 해당 app이 처리한다. 원본 연결은 [plaza_intro §7~9][INTRO]·[결과 §6.7·7][RESULT]·[10 §9.6][SPLIT]를 재사용한다. 소리·패스 구현은 여기서 확정하지 않는다. [DESIGN §10][D10].

## 8. 상호작용

| 상대 | 계약·혼동 방지 | 근거 |
|---|---|---|
| [판독] 모션 | 대표 자식만 적용;속도/완료는 슬롯 규칙 | main `@0x710080b6d0/0x710080bd48/0x710080bc60`; [07 §3.2][CAM], [09 §6.6][MOTION] |
| [판독] world/socket | 합성1회;pos_result를 다시 더하지 않음 | main `@0x7100849250/0x71002efcd4`; [07 §6.3][CAM], [결과 §6.7][RESULT] |
| [판독] split/사진/HUD | 사진base·HUD draw/scissor;PlayerID/TeamID 유지 | main `@0x710086195c/0x71001caec0`;mg0122 `@0x710001fe1c`; [10 §4·6][SPLIT] |
| [판독: 어셈블리] 광장 입력 | −/+는 줌 아닌 세션 카드/기구skip;혼합은 목표z | menu00 `@0x7100003de0/0x7100060a40/0x7100061360`; [plaza_3d §3.5][PLAZA] |
| [설계] Gate | 막힌tick은clip·추종·shake·sync 소비 정지;draw 유지 | [minigame_scene §12.12.6][MGSCENE], [DESIGN §10][D10] |
| [판독] 인트로 clocks | clip frame/MainModule dt/Fiber/Movie global 자막 분리 | op `@0x7100024190`; [plaza_intro §7.1·8.2][INTRO] |
| [설계] resize | pass aspect와split draw aspect는 별개;frame/RNG 진행 없음 | main `@0x71006c1120/0x7100862b58`; [07 §4.3][CAM], [10 §4][SPLIT], [DESIGN §10][D10] |

## 9. 웹 설계

### 9.1 실제 웹 세 구현 차이

[데이터] 현재 파일의 정적 판독이다. 원본 판정은 main `@0x71006c1120/0x71007753d0/0x7100849250` [07 §6][CAM]·[감사 §3.2][AUDIT]다. 각 열의 실제 출처는 [FsnbCamera][WB]·[MgCamera][WM]·[applyCamera][WG]다.

| 항목 | 광장 FsnbCamera | frame/stage MgCamera | mg1801 applyCamera |
|---|---|---|---|
| [데이터] 입력 | sceneAnims[0].cameras[0] 구운 배열 | 같은 배열/FsnbClip | CAMERAS 상수3개 |
| [데이터] 시간 | frame+=df·frames clamp;playing=false면 유지 | frame+=df*speed;loop modulo/비loop clamp;stopped false 반환 | 시간 없음;state.camera/ending으로label 변경 |
| [데이터] 평가 | floor(frame)·index clamp | floor(frame)·index clamp | 고정pose |
| [데이터] 자세 | Aim lookAt+twist/Euler YXZ | 같은 식 복제 | Aim3개·twist0 |
| [데이터] 투영 | Perspective만·near=max(raw,0.3) | Perspective만·같은 near 하한 | near0.1 그대로·Perspective만 |
| [데이터] flags/aspect | 저장aspect/projection/near-far flag 없음 | FsnbClip에aspect/projection flag 없음 | 현재aspect 유지·기본pass 가정 |
| [데이터] world/focus | entity world 합성/focus field 없음 | 같은 항목 없음 | identity3클립의 현재 범위만 대응 |
| [데이터] 수치/shake | three/double·일반 곡선/FMA/SDK표/shake 없음 | 같은 부족 | 일반 곡선/shake 없음 |
| [설계] 통합 판정 | 샘플 근사 경로로 구분 | 원본 evaluator로 교체 대상 | 게임은label 선택만 남기고 공통pose 적용 |

[데이터] MenuCameraFollow도 three 계산이며 df를 정수tick으로 누적한다. Stage3D.update는 df=dt*60로 anim→follow 중 첫 성공 driver를 적용하며 resize는 aspect=w/h다. [plaza/camera.ts][WF], [Stage3D.cameraDrivers/update/resize][STAGE], [CameraDriver/CameraSlot][TYPES].

[설계] near0.3 하한은 원본 기본에서 제거할 대상이다. 필요하면 어댑터의 명시적 근사 옵션으로 추천하되 미승인이다. main `@0x71006c1120` [07 §6.1][CAM];현재 [TAKEOFF.minNear][WB]·[CAMERA_MIN_NEAR][WM]; [DESIGN §10][D10].

### 9.2 모듈·import·mpj 연결

[설계] 아래 경로는 제안이며 파일을 만들지 않았다. 코어 import0, 어댑터→자기코어는 상대경로, app→game은 별칭이다. [DESIGN §10.1~10.4][D10].

| 경로 | 소유·연결 | 근거 |
|---|---|---|
| [설계] script/game/lib/camera | plain 타입·투영·pose·world·곡선·캐시·state·shake;import0 | main `@0x71006c1120/0x71007753d0/0x7100849250/0x71004e124c`; [07][CAM], [DESIGN][D10] |
| [설계] script/game/lib/camera-three | snapshot→three matrix/projection;Perspective/Orthographic 선택·WebGL depth 변환 | import ../camera+three; [07 §9.1][CAM], [10 §4][SPLIT] |
| [설계] app/common/render3d | mpj service:provider·asset/flag 정규화·Stage3D 연결;tick/draw 분리 | @game/lib/camera·@game/lib/camera-three; [Stage3D][STAGE], [DESIGN][D10] |
| [설계] app/scene/world/plaza | FollowPlayer 정책·locator·CameraParam·Front/scroll/overview/balloon 선택 유지;공통수학 사용 | menu00 `@0x7100003de0/0x7100003c00`; [plaza_3d §3.5][PLAZA], [intro §7][INTRO] |
| [설계] app/scene/system/op | Cut18 clip·skipFrameMax·local/global 시간 유지 | op `@0x7100023b60/0x7100024190`; [intro §8][INTRO], [DESIGN][D10] |
| [설계] app/scene/menu,world,mode,system | 분류/단위2단 유지;카메라 때문에 장면 재배치 없음 | [DESIGN §10.1~10.3][D10] |
| [설계] app/minigame/frame/stage,result | MgCamera handle·clip호출·result부분override;공통수학은service | [MgStage.playCamera][MSTAGE];main `@0x71002f4f00` [결과 §6.7][RESULT] |
| [설계] app/minigame/kit,mg#### | 계열/게임label·speed·frame명령;mg1801 3label 유지 | mg1801 `@0x710000f9d0/0x7100010a90`; [07 §5.1][CAM], [DESIGN][D10] |
| [설계] script/dev | 확인하네스·frame/f32/소비표;app은dev를 부르지 않음 | [DESIGN §10.1][D10];이번 하네스 실행 없음 |

### 9.3 import0 API·수치 계약

[설계] 포인터 복제보다 수치·상태를 명시적으로 넘긴다. raw와구운 배열은 별도 clip 형태다. main `@0x7100775330/0x71007753d0` [07 §6.4][CAM], [DESIGN §10][D10].

```text
[설계] CameraState: type,bounds/fovy/aspect/near/far,
       animView,entityWorld,worldView,focus,basePosition,basis
[설계] CameraClip: raw BaseData+flags+Curves 또는 명시적 bakedSamples
[설계] NumericOps: fma32(a,b,c),cameraSinCos(rad,out),trig/normalize 계약
[설계] CameraRandom: randModF(max),randRangeF(min,max) — host sync stream 그대로
[설계] sampleClip(clip,frameF32,cache,out): 시간 진행 없는 평가
[설계] applyPass(sample,flags,passFlags,currentProjection,entityWorld,out)
[설계] correctDrawProjection(base,aspect,mode3,out): base 불변
[설계] CameraPlayer: play/setSpeed/setFrame/stop/snapshot;slot clock 주입
[설계] CameraShake: start/step/stop/snapshot;phaseTarget/remainingSignal 정책;NumericOps·CameraRandom 주입
[설계] writeThree(snapshot,cameraHandle): 시간·난수·로딩 진행 없음
```

[설계] 코어는 F=Math.fround와 주입 provider를 쓰고 game/core/fmath도 import하지 않는다. 저장·중간 연산은 원본 f32/FMA 순서를 보존한다. FMA를 F(a*b+c)나 Horner 재배열로 치환하지 않는다. provider가 미검증이면 비트 동등 판정을 하지 않는다. main `@0x7100771dfc/0x7100772878`; [07 §6.4][CAM], [01 §6.6][CORE], [fmath.ts][FMATH], [DESIGN][D10].

[설계] tick=고정1/60·frame/speed=f32다. Gate 승인 뒤 slot clock·추종·shake를 각1회 진행하고 snapshot을 저장한다. 막힌 tick·draw·반복apply·resize는frame/cache/난수 호출수를 바꾸지 않는다. slot 속도와 curve wrap은 분리한다. [FrameGate §12.12.6][MGSCENE], [09 §6.6][MOTION], [DESIGN §10][D10].

[설계] 광장 원본은 Variable60이므로 웹 고정tick이 원본 벽시계와 항상 같다는 판정은 하지 않는다. 추종 정책은 광장에 두고 tick당 원본1회식으로 연결한다. 코어에 광장 필드명을 넣지 않는다. menu00 `@0x7100003de0`; [plaza_3d §3.5][PLAZA], [01 §4.4][CORE], [DESIGN §10.2][D10].

[설계] type2·type4의 미확정 투영·미지원 curve·자료 부족은 명시적 미지원으로 반환한다. 다른mode/frame/near를 조용히 대입하지 않는다. type2 이름은 main `@0x71008458f8` [07 §4.4][CAM]; changed-aspect 제한은 `@0x71008475c8` [C][C_CORE];U06·U07. 렌더패스/자원계약은 담당 갈래에서 이 snapshot/어댑터 경계를 받는다.

[설계] CameraState snapshot과 공유 렌더러/split draw 연결: [render_unify.md §9.2](render_unify.md).

## 10. 검증 기대값

[설계] 아래는 후속 구현의 기대값이며 이번 원본 실행 결과가 아니다. 기존 계산은 [07 §10][CAM], 수치·데이터는 각 출처를 인용한다. 새 시험/분석 스크립트·원본 실행·헤드리스·화면 촬영은 없다.

| 검증 | 기대값·판정 | 모듈·주소/데이터·출처 |
|---|---|---|
| [판독] Reset | fovy0.6605948805809021/aspectf32(16/9)/near0.1/far1000 | main `@0x71008458f8`; [07 §4.4][CAM] |
| [판독] pass | aspectOFF/nearfarOFF는현재값;ON은sample;직교fovy높이 | main `@0x71006c1120`; [07 §6.1][CAM] |
| [판독] vertical Aim | 지정기저·twist무시;Euler YXZ | main `@0x71007758a4/0x7100775b90`; [07 §6.2][CAM] |
| [설계] world | 비identity에서world와inverse(animView)1회합성;base 불변 | main `@0x7100849250`; [07 §6.3][CAM] |
| [판독: 어셈블리] wrap | [10,20] Repeat f20→20,f30→10,f0→20;Mirror f9→11,f21→19 | main `@0x7100772764`; [07 §6.4][CAM] |
| [판독: 어셈블리] 곡선 | scale0→offset;소수frameBaked보간;마지막key평가유지 | main `@0x7100772878`,Baked코드 `@0x710077236c`; [07 §6.4][CAM] |
| [데이터] mg1801 | §7.1 pose;FrameCount0/curves0;카메라 소비0 | [덤프][MGDATA];mg1801 `@0x710000f9d0/0x7100010a90`, [07 §7.1·8][CAM] |
| [설계] 기존NDC재사용 | loop 레인0등장y≈1.128/판정y≈−0.342/발y≈−0.674;정확bits주장없음 | 데이터(−3,7.5,0)/(−3,1.5,0)/(−3,0,−2); [07 §7.1·10][CAM] |
| [판독: 어셈블리][데이터] 추종 | dist≤3 목표유지;18>z>9에서40→65°/길이10→18;cos곱없음 | menu00 `@0x7100003de0`; [CameraParam][CP], [plaza_3d §3.5][PLAZA] |
| [판독: 어셈블리] shake | Start 첫targetUnitY/소비0;phase경계XY2회X→Y;Stopbase복원;repeat elapsed만0 | main `@0x71004e0e50/0x71004e12d0/0x71004e1184`; [07 §7.6][CAM] |
| [판독][데이터] result | speed0→1;95클립300f/FOV0.43633232/near1/far10000;한쪽음수override는현재값 | main `@0x71002f4390/0x71002f4f00`; [결과 §6.7][RESULT] |
| [판독] split | base/사진행렬불변;A8/9·16/9·32/9에서FOV20°·20°·≈10.076737° | main `@0x7100862b58`; [10 §4·9.8][SPLIT] |
| [데이터] intro | scroll1080f Euler/Cubic·Cut18 1200f Aim | [raw][INTRODATA] frame/flags/curves; [intro §7·8][INTRO] |
| [판독] aspect·type | 같은aspect면type검사없음;변경type2/4는오류;type1/3은중심·높이유지 | main `@0x71008475c8`; §6.6, [C][C_CORE] |
| [판독] frustum | type1/4는far면확대;type2/3은같은x/y;이는투영동등판정아님 | main `@0x71008467b0/0x7100863950/0x7100863f64`; §6.6, [C][C_CORE] |
| [판독] shake 생성 | 생성시elapsed/duration/freq/amp/phase0·RNG호출0 | main `@0x71004e0db8`; §6.6, [C][C_CORE] |
| [판독] mg1704 | lowpriority 무시/equal 재시작;mode2 validtick2회/expiry0회;mode3 Perlin2회/RNG0;receivePriority0x80 | mg1704 `@0x71000094d4/0x7100009224/0x710000959c/0x7100009578`; §6.8, [C][C1704] |
| [설계] 결정성 | 같은입력/seed면snapshot·소비순서동일;닫힌Gate/draw2회/resize 상태변경0;coreimport0/app→dev0 | [FrameGate][MGSCENE], [DESIGN §10][D10] |

## 11. 미확정

[미확정] 12개를 유지한다. 보완 결과는 완전 해소 0개·부분 확정 4개(U02/U03/U04/U06)·나머지 8개다. 부분 확정도 남은 질문이 있으므로 잔여 12개로 센다. 이미 확정된07 곡선식을 미확정으로 되돌리지 않는다. 근거는 아래 표·§6.6·부록 B/C다.

| ID | 남은 항목 | 처리·근거 |
|---|---|---|
| [미확정] U01 | pass 속성명+18/+19 대응·mg1801 default 경로 | 기능/byte는확정;이름/호출가정은추정 유지. main `@0x71006c0d44/0x71006c0c6c/0x71006c0e5c`; [07 §4.3][CAM] |
| [미확정] U02 | 부분 확정: 슬롯0x0B→shake Entity tick0x0E. 남음: animation/world와shake 적용 완료 순서·움직이는base | 저장base/Stop복원은기판독확정;등록mask/실제생성순서C없음. main `@0x710080cd70/0x7100899450/0x71006c0fe0/0x7100849250/0x71004e14dc`; §6.6, [mg0101 §3.6][G0101], [07 §7.6][CAM] |
| [미확정] U03 | 부분 확정: mg0116 motion.Stop→common Start·주파수하한20·축bool 로컬. 남음: C의숨은ShakeArg 인수확인·mg0903 directcall/인수·전체trigger | mg0116 `@0x7100005330/0x71000105a4/0x710000ffb0`,mg0903 `@0x7100033c24`; §6.7, [mg0116 C][C0116], [CSV][P0116], [mg0903 함수표][F0903] |
| [미확정] U04 | 부분 확정: mg1704 별도remaining/mode/Start우선순위/난수·Perlin·수신priority0x80. 남음: Perlin표값·tick mask포인터값·SetTranslation 숨은vector 인수·게임별실인수 | mg17047C확보/판독·공용phase shake로합병금지. `@0x7100008f60/0x7100009224/0x71000094b4/0x71000094d4/0x7100009554/0x7100009578/0x710000959c`; §6.8, [C][C1704] |
| [미확정] U05 | 웹FMA32/SDK표/normalize·projection trig 비트대조 | 원본식기판독·provider미구현. main `@0x7100771dfc/0x7100775b90/0x7100846b04`; [07 §6.4~6.5][CAM], [fmath.ts][FMATH] |
| [미확정] U06 | 부분 확정: type2/3 frustum 공유·type2/4 changed-aspect 제한·type4 생성중상태. 남음: type2 투영writer/행렬·type4 외부사용·퇴화입력/L=0 | type2=직교투영으로합병안함. main `@0x71008467b0/0x71008475c8/0x71008455f4/0x7100772764`; §6.6, [C][C_CORE], [07 §6.4][CAM] |
| [미확정] U07 | sampled JSON이 잃은flag/rawcoeff/world/pass 복구 범위 | pos/rot만으로일반FSNB보장불가. [FsnbClip][WM], [FsnbCamera.CamClip][WB];main `@0x71006c1120/0x71007753d0`, [07][CAM] |
| [미확정] U08 | mg0118 애니번호↔game/start 파일 | 기존미확정유지. mg0118 pointer표 `@0x710005b4a8`,Update `@0x7100003b30`; [§6.12][G0118] |
| [미확정] U09 | mg0911 이벤트별 선택 | 파일존재로조건확정안함;`env/mg0911_cam_*` FrameCount/이름; [§7][G0911], [스캔][SCAN] |
| [미확정] U10 | mg0912 F60 SetPosition_X 실값 | Camera.Initialize 요약의미확정;F60=−30과대입값은별개. [§6.11][G0912];주소없는요약에주소신설안함 |
| [미확정] U11 | mg1809cam01/cap60f곡선·game/result배정 | BaseData/길이만재사용·배정은추정. `mg1809_cam00/01/01_cap`; [§7.4][G1809], [스캔][SCAN] |
| [미확정] U12 | mg1810cam02 사용 | frame100/이름mg1212_cam2 데이터만. `mg1810_cam02.fsnb`; [§7.4][G1810], [스캔][SCAN] |

## 12. 사용자 확인

[설계] 미승인 추천을 기록하며 새 승인을 요구하지 않는다. 원본 규칙이 기본이다. main `@0x71006c1120` [07 §6.1][CAM], [DESIGN §10][D10].

| 선택 | 원본 기본·미승인 추천 | 근거 |
|---|---|---|
| [설계] near0.3 | raw near 기본;깊이 대응 옵션은어댑터근사로만추천 | 현재[FsnbCamera][WB]·[MgCamera][WM];main `@0x71006c1120` [07][CAM] |
| [설계] 수치 근사 | SDK표/FMA 기본;Math.sin/cos·double은보기용근사추천 | main `@0x7100775b90`; [07 §6.5][CAM] |
| [설계] 샘플 근사 | raw없으면명시적bakedSamples;잃은원본성질복구판정금지 | main `@0x71007753d0` [07 §6.4][CAM], [FsnbClip][WM] |
| [설계] 움직이는base+shake | 저장base복원이기본;자동rebase는U02전확정안함 | main `@0x71004e0e50/0x71004e1184`; [07 §7.6][CAM] |

## 13. 준비도

| 준비도 | 범위·이유 | 근거 |
|---|---|---|
| [설계] 바로 가능 | 원근/직교·Aim/Euler·pass기능·world·mg1801·split분리 설계 | main `@0x71006c1120/0x71007758a4/0x7100775b90/0x7100849250/0x7100862b58`; [07][CAM], [10 §4][SPLIT] |
| [설계] 바로 가능 | rawfloatcurve/wrap/slotclock분리·광장1tick추종·결과95클립 | main `@0x7100772764`,menu00 `@0x7100003de0`,main `@0x71002f4390`; [07 §6.4][CAM], [plaza_3d §3.5][PLAZA], [결과 §6.7][RESULT] |
| [설계] 바로 가능 | common shake 독립 상태/인수 계약·소비표, SetAspectRatio type0/1/3 중심유지, frustum 분기 | main `@0x71004e0db8/0x71004e12d0/0x71008475c8/0x71008467b0`; §6.5~6.6, [C][C_CORE], [07 §7.6][CAM] |
| [설계] 바로 가능 | mg1704remaining/priority·mode0/1/2/4 수학/소비설계;출력Entity어댑터는별도 | mg1704 `@0x7100009224/0x71000094d4`; §6.8, [C][C1704];수치비트/숨은인수는U04/U05 |
| [설계] 근사 필요 | sampled JSON만있는경로·미검증JSprovider;raw/표/FMA충족하면근사제거 | U05/U07; [FsnbClip][WM], [07 §6.4~6.5][CAM] |
| [설계] 판독 필요 | shake 게임결합 순서/mg0903 실인수·mg1704 상수표/숨은vector·type2/4미확정투영·퇴화입력 | U02~U04/U06;수학자체와게임연결분리. §6.6·부록C, [07][CAM], [함수표][F1704] |
| [설계] 판독 필요 | 일부게임selector/unknownclip/F60값 | U08~U12·해당게임기존미확정;공용수학설계를막는조건아님 |

[설계] 현재 웹은 완성된 공용 runtime이 아니다. 이번 결과는 구현 가능한 계약과 남은 범위를 나눈 문서다. [FsnbCamera][WB], [MgCamera][WM], [mg1801][WG], [DESIGN §10][D10].

## 부록 A. 출처 대응

| 새 문서 절 | 재사용 절 | 모듈·주소 |
|---|---|---|
| [판독] §1·3·4·6.1~6.2 | [07 §3·4·6.1~6.3][CAM] | main `@0x71006c1120/0x7100849250/0x71007758a4/0x7100775b90` |
| [판독: 어셈블리] §6.3 | [07 §6.4~6.5][CAM]·[intro §7.3][INTRO] | main `@0x71007753d0/0x7100772764/0x7100771dfc` |
| [판독: 어셈블리] §6.4 | [plaza_3d §3.5][PLAZA] | menu00 `@0x7100003de0~0x71000047a0` |
| [판독: 어셈블리] §5·6.5 | [07 §7.6][CAM] | main `@0x71004e0e50/0x71004e124c/0x71004e1184` |
| [판독][데이터] §5·7.1 | [07 §3.4·5.1·7.1][CAM] | mg1801 `@0x710000f9d0/0x7100010a90` |
| [판독][데이터] §5·7~10 | [결과 §6.7·7.2][RESULT]·[intro §7·8][INTRO] | main `@0x71002f4390/0x71002f4f00`;op `@0x7100024190` |
| [판독] §6.1·8·10 | [10 §4·6][SPLIT] | main `@0x7100862b58/0x71001caec0` |
| [판독] §2.3·6.6·10·11·부록B/C | 신규 [camera_core.c][C_CORE] + 기존 [mg0101 §3.6][G0101] | main `@0x71004e0db8/0x71008455f4/0x71008467b0/0x71008475c8/0x71008638c8/0x7100863950/0x7100863f64` |
| [판독][데이터] §2.3·6.7·11·부록B | 신규 [mg0116 C][C0116]·[config.csv][P0116] | mg0116 `@0x7100004930/0x7100004c9c/0x7100005330/0x71000105a4/0x710000ffb0`;CSV3행값열/FLOATindex1 |
| [판독] §6.8·11·부록B/C | 신규 [mg1704 C][C1704] | mg1704 `@0x7100008f60/0x7100009224/0x71000094b4/0x71000094d4/0x7100009554/0x7100009578/0x710000959c` |
| [설계][데이터] §9·12~13 | [DESIGN §10][D10]·[감사 §3.2][AUDIT]·[실제웹][WM] | 원본주소는§9.1;웹은파일/식별자 |

## 부록 B. 새 판독 목록·C 존재 대조

[데이터] 최초 정리에서는 새 판독 0개였다. 이번 보완은 **19개**(main7+mg0116 5+mg1704 7)이며 기존 `camera_core.c`와 후속에 준비된 `mg0116.nro.c`·`mg1704.nro.c`의 미판독 공백이다. 기판독 함수·원본 어셈블리·바이너리를 새 분석하지 않았다. 선언·INDEX·함수 TSV에 대응한다. [INDEX][IDX], [C][C_CORE], [mg0116 C][C0116], [main][FMAIN], [mg0116 함수표][F0116].

| 새 판독 함수 | 모듈·주소 | 확정한 범위·미확정 경계 |
|---|---|---|
| [판독] ComponentCameraShaking 생성자 | main `@0x71004e0db8` | 상태초기화/RNG호출0;등록순서는확정안함. §6.6, [C][C_CORE] |
| [판독] Camera 초기화 FUN_71008455f4 | main `@0x71008455f4` | type4 임시기록→Fovy설정;type4게임모드단정안함. §6.6, [C][C_CORE] |
| [판독] view/projection/frustum 갱신 FUN_71008467b0 | main `@0x71008467b0` | type별helper선택;투영생성식단정안함. §6.6, [C][C_CORE] |
| [판독] Camera.SetAspectRatio | main `@0x71008475c8` | 동등값early-return·type제약·경계중심유지. §6.6, [C][C_CORE] |
| [판독] Fovy frustum helper | main `@0x71008638c8` | SDK표tan·원근helper인수. §6.6, [C][C_CORE] |
| [판독] 원근형 경계 helper | main `@0x7100863950` | far면확대·변환점/minmax/평면쓰기. 상세SIMD 비트동등성은U05. §6.6, [C][C_CORE] |
| [판독] 직교형 경계 helper | main `@0x7100863f64` | 같은x/y의near/far면·변환점/minmax/평면쓰기. type2투영은U06. §6.6, [C][C_CORE] |
| [판독] mg0116.Camera.CreateCamera | mg0116 `@0x7100004c9c` | entity/Matter/애니/layer 연결. §6.7, [C][C0116] |
| [판독] mg0116.Camera.Initialize | mg0116 `@0x7100004930` | 같은 Entity에common shake 추가·handle저장. §6.7, [C][C0116] |
| [판독] mg0116.Camera.SetQuake | mg0116 `@0x7100005330` | motion.Stop→하한비교→common Start;숨은인수대응은추정. §6.7, [C][C0116] |
| [판독] mg0116.GameParam.GetCsvParamF | mg0116 `@0x71000105a4` | float vector index4B조회/범위오류. §6.7, [C][C0116] |
| [판독] mg0116.GameParam.Initialize | mg0116 `@0x710000ffb0` | 실제config.csv의FLOAT만순서별적재. §6.7, [C][C0116] |
| [판독] mg1704.ComCameraShake 생성자 | mg1704 `@0x7100008f60` | owner/camera·mode3/0초기화. §6.8, [C][C1704] |
| [판독] mg1704.ComCameraShake.ReceiveMessageImpl | mg1704 `@0x7100009224` | remaining/mode·기저/Entity출력·RNG소비. §6.8, [C][C1704] |
| [판독] mg1704.ComCameraShake.Stop | mg1704 `@0x71000094b4` | active/priority clear·SetTranslation;숨은vector는미확정. §6.8, [C][C1704] |
| [판독] mg1704.ComCameraShake.Start | mg1704 `@0x71000094d4` | priority비교·인수저장·base미저장. §6.8, [C][C1704] |
| [판독] mg1704 tick mask getter | mg1704 `@0x7100009554` | 포인터지시mask·실값미확정. §6.8, [C][C1704] |
| [판독] mg1704 receive priority getter | mg1704 `@0x7100009578` | 0x80 반환·requestPriority와구분. §6.8, [C][C1704] |
| [판독] mg1704.SinglePerlinNoise | mg1704 `@0x710000959c` | 고정표·trunc/index/fade/보간·RNG0. §6.8, [C][C1704] |

[설계] 아래는 기존 판독의 C 존재 대조다. 새 함수 수에 포함하지 않는다. 원본 근거는 행별 출처를 재사용한다.


| 재사용군 | 모듈·주소 | INDEX/C | 재사용 근거 |
|---|---|---|---|
| [데이터] pass | main `@0x71006c1120` | camera_apply.c/camera_callers_anim.c/camera_callers_apply.c 있음 | [INDEX][IDX], [C][C_APPLY];판독 [07 §6.1][CAM] |
| [데이터] pose/ortho | main `@0x71007758a4/0x7100775b90/0x71008470ac` | camera_apply.c 있음 | [INDEX][IDX], [C][C_APPLY];[07 §6.2][CAM] |
| [데이터] projection/world | main `@0x7100846b04/0x7100849250` | camera_core.c 있음 | [INDEX][IDX], [C][C_CORE];[07 §4.4·6.3][CAM] |
| [데이터] shake Start/Stop | main `@0x71004e0e50/0x71004e1184` | camera_core.c 있음 | [INDEX][IDX], [C][C_CORE];[07 §7.6][CAM] |
| [데이터] SetRes | main `@0x7100775330` | camera_core.c 있음 | [INDEX][IDX], [C][C_CORE];[07 §6.4][CAM] |
| [데이터] follow | menu00 `@0x7100003de0` | plaza_menu00_world.c 있음;기존C손실로어셈블리재사용 | [INDEX][IDX], [함수표][FMENU];[plaza_3d §3.5][PLAZA] |
| [데이터] mg1801 | mg1801 `@0x710000f9d0/0x7100010a90` | mg1801.nro.c 등복수있음 | [INDEX][IDX], [함수표][F1801];[07 §3.1·5.1][CAM] |
| [데이터] split | main `@0x7100862b58` | camera_core.c/camera_callers_anim.c 있음 | [INDEX][IDX];[10 §4][SPLIT] |
| [데이터] missingC | 부록C 식별7함수주소 | 해당모듈C선언없음;기존요청20주소는C확보로제거 | [INDEX][IDX], [main][FMAIN], [mg0903][F0903];별도상수데이터2주소는C.5 |

## 부록 C. Ghidra 추출 요청 표

[설계] 이번에 추출하지 않았다. 모듈+주소로 중복 제거한 **7함수주소**이며, 최소 1차 2개·추가 판독 5개다. 이전요청20개(main12+mg0116 2+mg1704 6)는C확보로제거했다. 별도상수데이터요청2주소를합하면식별주소는9개다. C 존재 최종 조사는 02:39 UTC의 `analysis/decomp/*.c`·`ghidra_work/*/out/*.c` 486파일과 [INDEX][IDX]다. [main][FMAIN], [mg0116][F0116], [mg0903][F0903], [mg1704][F1704]. [데이터] 초기 요청15주소에 mg0116 CreateCamera/SetQuake 2주소(`@0x7100004c9c/0x7100005330`)와 mg1704 생성자/mask/priority 3주소(`@0x7100008f60/0x7100009554/0x7100009578`)를 추가한 집합이 후속 판독 대상20주소이며, 현재 제거20주소와 남은9주소(함수7·데이터2)는 모듈·주소 기준으로 중복되지 않는다.

### C.1 최소 1차 — mg0903 shake 게임 연결 2주소

[설계] 아래 2개는 U02~U03의 게임 연결을 더 좁힐 최소 1차 요청이다. 독립 camera 수학·곡선·mg1801 구현은 막지 않는다. 이 C만으로 등록/mask의 미식별 함수까지 자동 해결된다고 보장하지 않는다. §6.6·§11 및 행별 함수표가 근거다.

| 모듈 | 주소·식별자 | C | 요청 이유·구현 차단 |
|---|---|---|---|
| [데이터] mg0903 | `@0x7100032ed0` BaseCamera.Initialize | 없음 | U02/U03 camera·shake owner/생성/활성화연결;gamebinding차단. [함수표][F0903] |
| [데이터] mg0903 | `@0x7100033c24` BaseCamera.StartShake | 없음 | U03 common Start 직접호출/인수/저장base;인수/난수소비시점차단. [함수표][F0903] |

### C.2 추가 판독 — 제한 기능 5주소

| 모듈 | 주소·식별자 | C | 요청 이유·구현 차단 |
|---|---|---|---|
| [데이터] main | `@0x71008472f0` FUN_71008472f0 | 없음 | U06 행렬인수후보의역할/type쓰기확인;type2 writer로단정안함·type0/1/3통합차단없음. [main][FMAIN] |
| [데이터] main | `@0x71006c0c6c` code pass 생성 경로 | 없음 | U01 mg1801 default pass 호출연결확인;명시적pass인수코어차단없음. [07 §4.3][CAM], [main][FMAIN] |
| [데이터] main | `@0x71006c0d44` serialized pass 생성 경로 | 없음 | U01 ApplyAspectEnabled/ApplyNearAndFarEnabled 속성→byte연결;직렬화동등판정차단. [07 §4.3][CAM], [main][FMAIN] |
| [데이터] mg0903 | `@0x71000be334` Q18Wanwan.ShakeCamera | 없음 | U03 게임trigger 인수/호출조건;StartShake규칙확정뒤trigger동등판정차단. [함수표][F0903] |
| [데이터] mg0903 | `@0x71000c6418` Q24Dossun.ShakeCamera | 없음 | U03 별도trigger 인수/호출조건;StartShake규칙확정뒤trigger동등판정차단. [함수표][F0903] |


### C.3 요청에서 제외 — 기판독 C 12주소 확보

[데이터] 아래 main12주소는 최신 `docs_gap_main.c`와 INDEX에 존재한다. C 부재 요청에서 제거하고 선언만 대조했다. 판독은 기존 [07 §6.4·7.6][CAM]을 재사용하며 새 판독19개에 포함하지 않는다. [C][C_GAP], [INDEX][IDX], [main][FMAIN].

| 모듈 | 확보 주소 | 처리 |
|---|---|---|
| [데이터] main | `@0x71004e124c/0x71004e12d0/0x71004e14dc` | Update·위치/target·콜백C 확보;[판독: 어셈블리] [07 §7.6][CAM] 재사용 |
| [데이터] main | `@0x71007753d0/0x7100772764/0x710077431c/0x7100774350/0x71007743e0` | cache/wrap/copy/curve loop C확보;[판독: 어셈블리] [07 §6.4][CAM] 재사용 |
| [데이터] main | `@0x7100771dfc/0x7100771ee0/0x7100771fdc/0x71007720d8` | Cubic3·LinearC확보;[판독: 어셈블리] [07 §6.4][CAM] 재사용 |

[데이터] mg0116 요청2주소 CreateCamera `@0x7100004c9c`·SetQuake `@0x7100005330`,mg1704 요청6주소 ctor `@0x7100008f60`/Receive `@0x7100009224`/Stop `@0x71000094b4`/Start `@0x71000094d4`/mask `@0x7100009554`/priority `@0x7100009578`도C확보로제거했다. 미판독이었으므로§6.7~6.8·부록B의새판독에포함한다. [C][C0116], [C][C1704].

### C.4 미식별 요청 3항목

| 항목 | 좁힌 자료·알려진 위치 | 필요한 식별·차단 |
|---|---|---|
| [미확정] M01 BakedFloat 실제 함수 시작 | main 코드 `@0x710077236c/0x71007723a8/0x71007723f0`; TSV 시작/크기구간대조에도포함함수없음 | 기존float식은구현가능;내부위치를시작주소로만들지않고경계식별후C보관. [07 §6.4][CAM], [main][FMAIN] |
| [미확정] M02 type2 투영 writer/실제사용caller | main enum과type별frustum `@0x71008467b0`·aspect제약 `@0x71008475c8`만확정;`@0x71008472f0`은역할미확정후보 | type2투영식/실사용동등지원차단;setter주소를만들지않음. §6.6, [C][C_CORE], [main][FMAIN] |
| [미확정] M03 common shake 등록/mask/priority writer | main ctor `@0x71004e0db8`에는등록호출없음;콜백 `@0x71004e14dc`·Entity전달 `@0x7100899450`만확보 | vtable/등록함수식별·게임생성순서와연결필요;U02 동시사용순서판정차단. [C][C_CORE], [mg0101 §3.6][G0101], [main][FMAIN] |

[데이터] 기존의 “common Start caller 미식별”은 mg0116·mg0903의 구체 후보/import 주소로 좁혀 C.1/C.2로 옮겼다. 외부 import thunk(16 B)나 placeholder(1 B)를 main Start 구현으로 세지 않는다. mg0116 import `@0x710002de60`, mg0903 import `@0x71001213e0`; [mg0116][F0116], [mg0903][F0903].

[미확정] 우선 차단 후보의 기존 C 공백을 보완했다. 남은 미확정은 C 없는 함수·미식별 경계/등록·숨은인수 타입손실·웹 수치 검증·게임자료 매핑이다. 이번에 추출·실행·승인 요청은 하지 않았다. §11, 부록 B/C, [INDEX][IDX].

### C.5 별도 상수 데이터 요청 2주소

[설계] C 재추출 요청이 아닌 기존 참조표의 값 확인 요청이다. 이번에는 읽기 허용된 C만 사용했고 원본 표를 새로 추출하지 않았다. 함수7주소+데이터2주소=식별9주소이며 미식별3항목과 별도집계다. mg1704 `@0x710000959c`; [C][C1704].

| 모듈 | 실제 C 참조 데이터 주소 | 이유·차단 |
|---|---|---|
| [미확정] mg1704 | `@0x7100086e0d` permutation DAT | 고정lookup byte값/범위확인;기본mode3 Perlin정확지원차단. `@0x710000959c`; [C][C1704] |
| [미확정] mg1704 | `@0x7100087010` gradient DAT | hash&15·stride0xC의3f32슬롯값확인;기본mode3 Perlin정확지원차단. `@0x710000959c`; [C][C1704] |

## 부록 D. 문서 검증·통합할 링크

[데이터] UTF-8·LF·BOM 없음. CommonMark 링크 466개·서로 다른 대상 58개·참조 정의 56개가 해석됐고 실제 링크/미정의 참조 오류0개다. 연속 표기 [판독][데이터] 등은 상태 라벨이고 수식 [10,20]·괄호 설명도 링크 오류가 아니다. 통합용 코드 블록의 링크는 각 출처 위치 기준으로 별도 대조한다.

[데이터] 최초 조사에서는 출처7개·DESIGN·INDEX·웹 카메라 코드4개, 합계13파일의 SHA-256이 전후 동일했다. 부모의 후속 통합이 있으므로 이번 보완에는 최신 값을 별도 기준으로 잡았다. 보완 전후12파일은동일하며INDEX는다른작업에서갱신됐다. 최신486C파일(02:39 UTC)대조로C확보요청20주소를제거했고부모의render_unify 연결한줄을보존했다. 이 갈래의 쓰기 대상은 본 문서 하나다.

[설계] 부모가 다음 위치에 한 줄씩 통합하며 이미 있는 정리본 링크는 중복 추가하지 않는다. 원문 변경은 엔진 README 한 행과 출처 절 끝 정리본 링크만 허용하며 기존 줄바꿈을 보존한다. 이번에는 출처·README를 고치지 않았다.

[설계] `web/docs/engine/README.md` 문서표에 추가할 행:

```text
| [20_camera_runtime.md](20_camera_runtime.md) | 카메라 수학·FSNB·추종·흔들림 통합, import 0 코어·three 어댑터 설계 | 판독 재사용·미확정 12개 |
```

[설계] `web/docs/engine/07_camera_lighting.md` §9.1 끝:

```text
→ 정리본: [20_camera_runtime.md](20_camera_runtime.md) §4~§6, §9
```

[설계] `web/docs/engine/10_split_screen.md` §4 끝:

```text
→ 정리본: [20_camera_runtime.md](20_camera_runtime.md) §6.1, §8~§10
```

[설계] `web/docs/shell/plaza_3d.md` §3.5 끝:

```text
→ 정리본: [20_camera_runtime.md](../engine/20_camera_runtime.md) §6.4, §9
```

[설계] `web/docs/shell/minigame_result.md` §6.7 끝:

```text
→ 정리본: [20_camera_runtime.md](../engine/20_camera_runtime.md) §5, §6.1~§6.3, §9
```

[설계] `web/docs/shell/plaza_intro.md` §7.3 끝:

```text
→ 정리본: [20_camera_runtime.md](../engine/20_camera_runtime.md) §6.2~§6.3, §8~§10
```

[설계] `web/docs/engine/common_system_audit.md` §3.2 끝:

```text
→ 정리본: [20_camera_runtime.md](20_camera_runtime.md) §9~§13
```

[D10]: ../../DESIGN.md
[CAM]: 07_camera_lighting.md
[SPLIT]: 10_split_screen.md
[AUDIT]: common_system_audit.md
[PLAZA]: ../shell/plaza_3d.md
[INTRO]: ../shell/plaza_intro.md
[RESULT]: ../shell/minigame_result.md
[MOTION]: 09_character.md
[CORE]: 01_core.md
[MGSCENE]: ../shell/minigame_scene.md
[IDX]: ../../../analysis/decomp/INDEX.tsv
[FMAIN]: ../../../analysis/functions/main.nso.tsv
[FMENU]: ../../../analysis/functions/menu00.nro.tsv
[F1801]: ../../../analysis/functions/mg1801.nro.tsv
[F1704]: ../../../analysis/functions/mg1704.nro.tsv
[F0116]: ../../../analysis/functions/mg0116.nro.tsv
[F0903]: ../../../analysis/functions/mg0903.nro.tsv
[C_GAP]: ../../../analysis/decomp/docs_gap_main.c
[C0116]: ../../../analysis/decomp/mg0116.nro.c
[C1704]: ../../../analysis/decomp/mg1704.nro.c
[P0116]: ../../../extracted/bea/mg~mg0116.nx.bea/mg/mg0116/data/mg0116_config.csv
[C_APPLY]: ../../../analysis/decomp/camera_apply.c
[C_CORE]: ../../../analysis/decomp/camera_core.c
[MGDATA]: ../../../extracted/converted/camera/mg1801_cameras.json
[SCAN]: ../../../extracted/converted/camera/fsnb_scan.json
[SINCOS]: ../../../extracted/converted/camera/sincos_table.json
[INTRODATA]: ../../../analysis/plaza_intro_camera_raw.json
[CP]: ../../../extracted/bea/menu~menu00.nx.bea/menu/menu00/data/CameraParam.json
[WB]: ../../script/app/scene/world/plaza/balloon.ts
[WM]: ../../script/app/minigame/frame/stage/camera.ts
[WG]: ../../script/app/minigame/mg1801/view/camera.ts
[WF]: ../../script/app/scene/world/plaza/camera.ts
[STAGE]: ../../script/app/common/render3d/stage.ts
[TYPES]: ../../script/app/common/render3d/types.ts
[MSTAGE]: ../../script/app/minigame/frame/stage/stage.ts
[RNG]: ../../script/game/core/rng.ts
[FMATH]: ../../script/game/core/fmath.ts
[G0101]: ../minigame/mg0101.md
[G0102]: ../minigame/mg0102.md
[G0106]: ../minigame/mg0106.md
[G0107]: ../minigame/mg0107.md
[G0118]: ../minigame/mg0118.md
[G0122]: ../minigame/mg0122.md
[G0508]: ../minigame/mg0508.md
[G0906]: ../minigame/mg0906.md
[G0911]: ../minigame/mg0911.md
[G0912]: ../minigame/mg0912.md
[G1802]: ../minigame/mg1802.md
[G1803]: ../minigame/mg1803.md
[G1804]: ../minigame/mg1804.md
[G1805]: ../minigame/mg1805.md
[G1806]: ../minigame/mg1806.md
[G1807]: ../minigame/mg1807.md
[G1808]: ../minigame/mg1808.md
[G1809]: ../minigame/mg1809.md
[G1810]: ../minigame/mg1810.md
