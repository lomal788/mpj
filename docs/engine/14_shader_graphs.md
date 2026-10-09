# 14. 셰이더 그래프 판독·해시 사전

2026-10-09. 담당: shader-graphs. [데이터] 최초 선정 manifest 기준 107개 중 광장 재사용1·pending106. 현재 사전 적용70·기존 광장1·pending36(§18·§19). 옵션 전체 튜플의 고유 수 27개. 같은 해시라도 표준 조명·옵션·샘플러 배치로 SASS 전체가 달라지므로 프로그램 바이너리 일치를 그래프 식 일치로 혼동하지 않는다.

## 1. 범위·근거

대상: mg0508·mg0106·mg0101·mg0122·mg0102. 원본·extracted는 읽기 전용. 광장 §6.8·NPC §6.11·포스트 §6.13, stage3d §5, 03_graphics·07_camera_lighting·mg0508 §6.10·§7.1을 먼저 재사용한다. 광장·캐릭터 기존 동작과 common_system_audit.md는 수정하지 않는다.

## 2. 공통 노드·수치 규칙

[판독] 텍스처 핸들은 Material[0x10·i]의 실제 샘플러 위치로 읽는다. sass_dis.py의 @주석은 낮은 핸들에서 한 칸 밀리므로 uniform·bfsha 배치로 확인한다. f32 즉시값은 비트를 해석한다. FFMA는 곱셈+덧셈의 단일 반올림 의미로 판독한다. GLSL ES 3.00의 곱셈·덧셈이 실제 GPU에서 항상 FFMA로 합쳐지는지는 [미확정]이며 표본 오차를 별도로 검증한다. SNORM의 native 표본은 이미 signed이며 PNG 저장값 복원에만 2x−1을 적용한다(§30). sRGB는 기존 텍스처 색공간을 따른다. SRT·바람·마스크·overlay·fresnel·알파·노멀 재구성은 기판독 함수를 재사용한다.

[미확정] 27개는 전체 옵션 튜플 기준이며 단계별 해시가 겹친다. FS 또는 VS 해시 0은 해당 단계의 그래프가 없음을 뜻한다. 표준 셰이딩 부분을 새 그래프 식으로 중복 판독하지 않는다.

### 2.1 공통 노드의 확정 식·웹 연결

| 공통 노드 | 원본 식·수치 | 웹 입력·근거 |
|---|---|---|
| f32 즉시값 | `f32(bits)=IEEE754(binary32,bits)`. `0x3f000000=0.5`, `0x3f800000=1`, `0x40000000=2`, `0xc0000000=−2`, **`0x3c0efa35=0.008726646192371845 ≈ π/360`** | SASS raw 비트로 읽는다. 탐조등 각속도는 π/180이 아니다. |
| FFMA·LERP | `FFMA(a,b,c)=round_f32(a·b+c)`, `mix(a,b,p)=a+(b−a)·p` | G08/G12 `ffma r10,(B.x−A.x),P0.x,A.x`; RGB 최종 FFMA도 같은 순서. 코드 식의 재배치 오차를 SASS 직접 해석과 대조한다. |
| saturate·pow | `sat(x)=min(max(x,0),1)`; `pow(x,p)=exp2(log2(x)·p)` | G05 `sat(N·V)`→LG2→FMUL P0.x→EX2. 지수 입력을 임의 abs/fresnel로 바꾸지 않는다. |
| 정규화 | `normalize(x)=x·rsqrt(dot(x,x))` | G05 원본 기하 법선 v1과 View.camera−v0를 각각 정규화. `NgW`·`viewDir`로 연결한다. |
| 정점색 최종 출력 | `RGB=c·((c·base_color+emissive_scale·emissive_color)·P0.y)` | G05 c=Color0.rgb. 정점색이 **두 번** 쓰인다. 색공간·틴트를 임의 추가하지 않는다. |
| 두 표본 합성 | `A=T(utility0,uv0).rgb`, `B=T(utility1,uv1).rgb`, `q=B·((A+C0.rgb)·P0.x)`, `RGB=mix(q,C1.rgb,P0.y)+phase·mix(A.x,B.x,P0.x)·C0.rgb` | G08/G12 실제 핸들 Material[0x130/0x140]·BFSHA sampler18/19. shader_graph_patterns.py `sgSpotlight` 하나를 두 해시가 공유한다. |
| 정수 시간 위상 | `t=uint(World[0x4])`, `hi=(t·0x6c16c16d)>>32`, `q=(((t−hi)>>1)+hi)>>8`, `rem=t−360q`, `phase=0.5+0.5·sin(f32(rem·f32(0x3c0efa35)))` | SASS XMAD 고위 곱·SHR8·XMAD −360·FMUL32I·SIN·FFMA. `mpjWorldFrame%360u`는 정수 산술 식을 보존한다. World+4는 CPU 확인된 u32 누적 프레임이다(§19). 웹 60fps 누적 프레임·장면 epoch 대응은 [근사]. |
| SNORM 표본 | signed 채널 `s=2·PNG−1`; 예 0→−1, 0.5→0, 1→1; 노멀 `z=sqrt(clamp(1−x²−y²,0,1))` | graphTexture가 원본 format의 SNORM으로 판정하고 graph.ts의 T가 되돌린다. 상세 판독은 plaza_3d §6.8·stage3d §5 재사용. |
| sRGB 표본 | `linear(s)=s/12.92`(s≤0.04045), `((s+0.055)/1.055)^2.4`(그 밖); alpha는 선형 | manifest.textures.srgb를 기존 텍스처 로더가 적용한다. G08/G12 utility0=spotlight00_alb는 BC7_SRGB(256×512). T 결과에 sRGB 변환을 다시 곱하지 않는다. 03_graphics의 색공간·plaza_3d §6.13 출력 계약 재사용. |
| 무조명 출력 | `out=diffuseColor.rgb+emissive` | 세 해시 모두 shading_type0. 그래프는 원본 최종 RGB를 baseColor에 넣고 emissive=0으로 덮는다. 원본 state2 더하기·ModelOpacity 기존1 계약은 유지한다. |

### 2.2 같은 SASS·재사용 조건

[데이터] G08(p122)과 G12(p125)는 첫 재질 헤더를 뺀 **FS 명령 SHA-256 `4c62579b4c46535664a7c30d5f1946df96c15581b16bb091a7faddd0d7fe82a7`**, **VS 명령 SHA-256 `c1de1eaa377819dcf7a9aca391f1d351951b3a4531765b84a4aec10e836bbc5e`**가 모두 같다. FS 옵션 해시 1807808248/2202427043는 다르지만 판독 함수는 공유한다. 사전 키는 원본 해시 튜플을 각각 보존한다.

[데이터] 위 두 프로그램은 BNSH 단계 코드의 0x80바이트 헤더 이후 바이트도 동일하다. FS SHA-256 `f9166764e9e64fb2f5ca8b3b3aae778ffcdb10767070954313f1424e3d435467`, VS SHA-256 `b7c78cdf07923eb2fddcf4a22099a8011b8fff53df64cecce320c777a39c665d`. 명령 주석을 걷는 과정만으로 생긴 일치가 아니다.

[판독] 자동 재사용은 키 SHA-256과 원본 옵션 튜플이 모두 맞고 status가 decoded/approx일 때만 한다. 사용한 sampler 이름은 대상 FRES samplerAssign(slots)으로 다시 연결한다. 필수 sampler 누락·키/버전 불일치는 변환 실패로 표시한다. 다른 아카이브 이름·모델·텍스처로 재결합하는 시험을 포함한다. FS 또는 VS 해시만 같은 다른 조합은 단계 판독 결과를 합친 뒤 검증하며 완성된 조합을 곧바로 복사하지 않는다.

## 3. 결과 형식·사전

경로: analysis/mat/graphs/<sha256>.json. sha256 입력 = graph_key(options)를 키 정렬·공백 없는 JSON으로 직렬화한 UTF-8 바이트. 문서의 짧은 ID는 앞 12자리이며 파일명은 64자리다.

레코드: {version:1, options:{fragment_shader_graph_*·vertex_shader_graph_*}, status:'decoded'|'approx'|'partial'|'pending', graph:GraphDef|null, evidence:[], variants:[], stages?:{fs|vs:{hash,status,graph,evidence,requiredInputs}}, graphVariants?:[{selector,requiresSamplers,status,graph}]}. GraphDef는 material·models를 대표값으로 저장하고 재사용 때 대상 재질·모델·샘플러로 바꾼다. 미판독 status는 자동 적용하지 않는다. sampler null은 실제 미할당과 구별해서 근거를 남긴다.

### 3.1 단계 판독 결과의 통합 조건

병렬 결과는 FS/VS 단계의 식·GraphDef 부분·원본 sampler 위치·상수 비트·표본 시험·미확정 바인딩을 동봉한다. FS만 판독한 조합에서 VS 해시가 비영이면 VS 소유자의 결과까지 받은 뒤 통합한다. 단계별 samplers는 슬롯 이름으로 합치고 같은 이름의 충돌은 원본 배치를 확인한다. vsHelpers/vsPrelude/uv/positionOffset은 VS, fsHelpers/fsPrelude/baseColor/alpha/normal/roughness/metallic/ao/emissive/discard는 FS가 소유한다. 완성된 조합만 status decoded/approx로 승격한다.

[미확정] depth 캡처·View 역투영·Model 특수 행렬·런타임 생성 속성처럼 GraphDef가 공급하지 못하는 입력은 원본 식을 기록하고 pending을 유지한다. 입력을 표면 worldPos나 상수0으로 치환하여 pending 수만 줄이지 않는다. 기판독 VS3775346869도 원본 glb에 없는 런타임 `_c0=(aux,h,w,side)` 생성 계약이 필요하므로 정점식만 붙이지 않는다.

[판독] VS3775346869는 mg0508 §6.10의 기판독식을 G03/G13 `stages.vs`에 보존한다. `H=clamp(pos.y−0.49−P1.w,0,100)`, `offset=(1+c0.y)c0.z(1+H·P2.w)P0.xyz+(0,c0.y·P0.w·c0.z,0)−0.8·P0.w·c0.w·c0.z·H·P1.xyz`. 재판독하지 않았다. 전체 graph=null·status=pending을 유지하므로 현재 manifest에 적용되지 않는다.

## 4. 웹 반영 방식

문서 선행 설계: 공용 사전 → 아카이브 graph.json → 광장 같은 옵션 튜플 → SASS 대기. 사전에서 decoded/approx이며 options가 완전히 같은 정의만 적용한다. program에 해시 식별자를 넣어 다른 식의 캐시 충돌을 막는다. graph.ts 계약 uv0·c0·P0..P7·C0..C3·srt·ENV·T(샘플러,uv)·mpjMs를 그대로 쓴다.

## 5. 초기 해시 표·판독 분배

[데이터] 주석·재질 헤더를 제외한 SASS 명령 SHA-256으로 FS/VS 변형 수도 센다. 광장 74정의의 해시 색인과 대상 pending의 전체 튜플 일치 0개. 결과 무대·mg1801 모델 옵션의 전체 튜플 일치 0개. mg0508 정점 해시 3775346869는 §6.10·§7.1 기판독이 있으므로 재판독하지 않는다. 다른 자료의 부분 단계 일치 여부는 후속 대조한다.

| 묶음 | ID | FS / VS 그래프 해시 | 게임·재질 수 | SASS FS/VS 변형 | 상태 |
|---|---|---|---|---|---|
| G01 | `9c5e8f149831` | 0 / 2522730817 | mg0508:2 · mg0101:5 · mg0122:3 = 10 | 6/4 | [근사]9/10·정점색 누락1대기 |
| G02 | `2c34a0229931` | 0 / 3705221208 | mg0508:2 · mg0101:5 = 7 | 3/2 | 대기 |
| G03 | `bc3fe3ddd093` | 0 / 3775346869 | mg0508:1 = 1 | 1/1 | VS 기판독·FS 대기 |
| G04 | `fee875dca3a0` | 0 / 4174155460 | mg0101:1 = 1 | 1/1 | [판독]1/1 적용 |
| G05 | `dea054f523d0` | 1147244367 / 0 | mg0102:1 = 1 | 1/1 | [판독]1/1 적용·ModelOpacity 근사 |
| G06 | `ca378536ee77` | 1186080263 / 0 | mg0508:2 = 2 | 1/1 | 대기 |
| G07 | `946028a7e0b5` | 1261704893 / 3482022062 | mg0101:3 = 3 | 2/1 | [근사]3/3 FS+VS 적용 |
| G08 | `c175e471e305` | 1807808248 / 0 | mg0106:1 = 1 | 1/1 | [근사]1/1 프레임 공급 |
| G09 | `bbb6e9c88098` | 1946182249 / 0 | mg0101:24 = 24 | 2/1 | [근사]24/24 screenUV 적용 |
| G10 | `3a65d35502c8` | 1992714971 / 0 | mg0101:5 = 5 | 5/1 | [근사]5/5 packed·AO 적용 |
| G11 | `44796e19c05e` | 2077426685 / 0 | mg0102:14 = 14 | 5/2 | [근사]14/14·원본 더미 조건 |
| G12 | `9d05fd698138` | 2202427043 / 0 | mg0106:1 = 1 | 1/1 | [근사]1/1 프레임 공급 |
| G13 | `89e186140f1a` | 2248262712 / 3775346869 | mg0508:6 = 6 | 2/1 | VS 기판독·FS 대기 |
| G14 | `cb300dff746e` | 2265242073 / 0 | mg0106:1 · mg0101:1 · mg0102:1 = 3 | 1/1 | 대기 |
| G15 | `a5dd50093abf` | 2440083947 / 0 | mg0122:1 = 1 | 1/1 | [판독]1/1 발광 적용 |
| G16 | `bd2db7abea44` | 2596196817 / 0 | mg0508:2 = 2 | 1/1 | 대기 |
| G17 | `1457a8f1634c` | 2653408627 / 0 | mg0508:2 = 2 | 1/1 | 대기 |
| G18 | `dbe3081fc6eb` | 3035261389 / 0 | mg0106:1 = 1 | 1/1 | 대기 |
| G19 | `e8e6f3c1404a` | 3267081006 / 0 | mg0101:2 = 2 | 2/2 | [판독]2/2 옵션 분기 |
| G20 | `d6603c02ac54` | 3337753583 / 537144484 | mg0101:6 = 6 | 1/1 | [근사]6/6 FS+VS 적용 |
| G21 | `9624dc558047` | 3483203703 / 0 | mg0106:1 = 1 | 1/1 | 대기 |
| G22 | `19686cbb8cc0` | 3942598924 / 0 | mg0508:1 = 1 | 1/1 | 대기 |
| G23 | `e08920785b49` | 4060002986 / 0 | mg0101:2 = 2 | 2/1 | 대기 |
| G24 | `a38d96c3e7f4` | 4221260974 / 3548160070 | mg0122:1 · mg0102:1 = 2 | 1/1 | 대기 |
| G25 | `0d49812d1426` | 577305732 / 0 | mg0102:2 = 2 | 2/2 | [근사]2/2 스캔 옵션 분기 |
| G26 | `f054c5129297` | 636352889 / 0 | mg0122:3 = 3 | 3/1 | 대기 |
| G27 | `15520a47e420` | 649725027 / 2739868962 | mg0101:2 = 2 | 2/1 | 대기 |

분배 단위는 해시 묶음이며 한 묶음은 한 판독자만 소유한다. 공통 VS가 있는 G01/G02/G03/G04/G07/G13/G20/G24/G27은 VS 단계 소유자를 먼저 정하고 FS만 분리한다. 아래 대표 경로의 .fs.txt와 .vs.txt를 함께 읽고 같은 묶음의 변형을 추가 대조한다.

- G01: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p67.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p67.vs.txt`
- G02: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p83.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p83.vs.txt`
- G03: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p17.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p17.vs.txt`
- G04: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p151.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p151.vs.txt`
- G05: `analysis/mat/conv/mg/mg0102/sass/mg0102__forward_plus__p54.fs.txt` / VS `analysis/mat/conv/mg/mg0102/sass/mg0102__forward_plus__p54.vs.txt`
- G06: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p35.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p35.vs.txt`
- G07: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p67.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p67.vs.txt`
- G08: `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p122.fs.txt` / VS `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p122.vs.txt`
- G09: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p38.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p38.vs.txt`
- G10: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p98.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p98.vs.txt`
- G11: `analysis/mat/conv/mg/mg0102/sass/mg0102__forward_plus__p35.fs.txt` / VS `analysis/mat/conv/mg/mg0102/sass/mg0102__forward_plus__p35.vs.txt`
- G12: `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p125.fs.txt` / VS `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p125.vs.txt`
- G13: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p21.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p21.vs.txt`
- G14: `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p119.fs.txt` / VS `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p119.vs.txt`
- G15: `analysis/mat/conv/mg/mg0122/sass/mg0122__forward_plus__p30.fs.txt` / VS `analysis/mat/conv/mg/mg0122/sass/mg0122__forward_plus__p30.vs.txt`
- G16: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p91.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p91.vs.txt`
- G17: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p26.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p26.vs.txt`
- G18: `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p86.fs.txt` / VS `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p86.vs.txt`
- G19: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p13.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p13.vs.txt`
- G20: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p148.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p148.vs.txt`
- G21: `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p131.fs.txt` / VS `analysis/mat/conv/mg/mg0106/sass/mg0106__forward_plus__p131.vs.txt`
- G22: `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p43.fs.txt` / VS `analysis/mat/conv/mg/mg0508/sass/mg0508__forward_plus__p43.vs.txt`
- G23: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p83.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p83.vs.txt`
- G24: `analysis/mat/conv/mg/mg0122/sass/mg0122__forward_plus__p182.fs.txt` / VS `analysis/mat/conv/mg/mg0122/sass/mg0122__forward_plus__p182.vs.txt`
- G25: `analysis/mat/conv/mg/mg0102/sass/mg0102__forward_plus__p57.fs.txt` / VS `analysis/mat/conv/mg/mg0102/sass/mg0102__forward_plus__p57.vs.txt`
- G26: `analysis/mat/conv/mg/mg0122/sass/mg0122__forward_plus__p78.fs.txt` / VS `analysis/mat/conv/mg/mg0122/sass/mg0122__forward_plus__p78.vs.txt`
- G27: `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p74.fs.txt` / VS `analysis/mat/conv/mg/mg0101/sass/mg0101__forward_plus__p74.vs.txt`

## 6. 이전 가능성

| 기존 자료 | 형식 | 이전 조건 | 이번 동작 |
|---|---|---|---|
| plaza_graph_1/2.json | plaza_graph_web → GraphDef | 옵션 튜플·식·근거 동봉 | 기존 경로 유지 |
| charsel_body_graph.json·plaza_npc_graph.json | npcMaterial 전용 | 배열 표본·림·SSS·눈 SRT 계약 추가 확인 | 표만 작성, 이전 안 함 |
| mg1801 water.ts·material.ts | 게임 전용 셰이더 | 옵션 튜플·원본식 확인 | 기존 코드 유지 |
| 결과 무대 | stage3d·캐릭터 전용 | 재질 옵션 대조 | 기존 코드 유지 |

## 7. 검증 계약

노드 시험만: graphSource 조각 생성·GLSL 컴파일, 샘플러/파라미터 누락 0, 같은 해시 재사용, f32 표본 수치 대조. 5개 게임 mg_assets.py 재변환 → pending 비교 → build_assets.ts --only mg/ 증분 빌드. 기존 노드 시험 전체 1회·tsc·npm run build. 받기 경로가 변할 때만 실제 페이지 콘솔·404 확인 1회(1분 이내, 촬영 없음). 헤드리스 화면 검증은 하지 않는다.

## 8. 게임별 pending 전후

| 게임 | 전 | 후 |
|---|---:|---:|
| mg0508 | 18 | 17 |
| mg0106 | 5 | 3 |
| mg0101 | 56 | 10 |
| mg0122 | 8 | 4 |
| mg0102 | 19 | 2 |

## 9. 사용자 확인 필요

- [근사] World+4 단위는 u32 프레임으로 확정. 웹 Stage60fps 누적의 원본 gate·logic scheduler·renderer lifetime/epoch 대응, env sampler filter/address/LOD는 원본 확정(§30), 웹 대응 미지원. ms로 환산하지 않는다.
- [미확정] G01 철판 _c0의 외부NVN 최종fetch값, G02 draw별Model·Mode instance translation, 캡처 깊이/역투영·스텐실·texture array·추가 Layer 입력은 대기36에 기록. 원본 값 대신 임의 상수를 쓰지 않는다.
- [근사] G09 화면 viewport 역수·1픽셀 근사(원본 Layer CPU는 §31 확정), ModelOpacity1·PBR/IBL/TBN은 기존/명시 근사.
- [근사] 표준 조명·IBL·굴절·런타임 정점 속성 생성은 기존 stage3d 수준을 유지한다. 사용자 외형 확인은 게임별 적용한 식이 확정된 뒤 항목을 적는다.

## 10. 직접 담당 판독 결과·API 한계

| 묶음 | 상태 | 식·근거 |
|---|---|---|
| G05 FS1147244367 | [판독] | Hologram p54 FS: n=normalize(v1), V=normalize(View[0x160]−v0), a=pow(clamp(n·V,0,1),P0.x)·Model[0x20c]; RGB=c0.rgb·(c0.rgb·material_base_color+material_emissive_color_scale·material_emissive_color)·P0.y. VS 마지막 v14.xyz=Color0.xyz; VS 그래프0. |
| G08 FS1807808248·G12 FS2202427043 | [판독]·시간 [근사] | p122/p125 명령 전체 동일. A=T(sg_utility_texture2d0,uv0).rgb, B=T(sg_utility_texture2d1,uv1).rgb, q=B·(A+C0.rgb)·P0.x; RGB=mix(q,C1.rgb,P0.y)+(0.5+0.5·sin((World[0x4]%360)·f32(0x3c0efa35)))·mix(A.x,B.x,P0.x)·C0.rgb; α=Model[0x20c]. 실제 raw c11[0x130/0x140]=BFSHA sampler18/19=utility0/1, VS v10=a_Uv0.xy·v11=a_Uv0.zw. World[0x4]는 CPU 확정 u32 누적 프레임, mpjWorldFrame으로 공급(§19). Stage tick·epoch 대응 [근사]. |
| G14 FS2265242073 | 식 [판독]·적용 [미확정] | 화면 위치→Layer 화면범위 정규화→깊이 Layer[0x4f0] texelFetch→View[0x120..0x15c] 역투영→(Model[0x1c0..]−world)/Model[0x1e4] 거리→utility0(u=clamp(length/radius,0,1),v=0.5)×base_color, α=Model[0x20c]. GraphDef에 캡처 깊이·뷰 역행렬·모델 반경 입력이 없어 pending 유지. 모델 표면 worldPos로 치환하지 않는다. |

G05/G08/G12는 static_opt_shading_type=0의 최종 RGB이므로 baseColor에 식을 넣고 emissive=0으로 기존 발광의 중복 가산을 막는다. G08/G12는 원본 state_type=2 더하기를 유지한다. G05는 원본 정점색과 재질값의 곱이며 임의 색 보정이 아니다. ModelOpacity=1은 기존 graph.ts 계약의 [근사]이다.

최초 직접 담당 단계에서는 27개 옵션 튜플 레코드 중 위3개만 적용했다. 현재 적용·대기는 §18이며 원본식 단계 레코드로 SASS 경로·프로그램 변형·원본 옵션을 보존한다. `shader_graph_patterns.py`가 두 탐조등의 같은 식을 한 함수로 생성하며, `shader_graph_dictionary.py`가 키·옵션·상태·필수 sampler를 검증하고 대상 samplerAssign으로 재결합한다. 사전 조회 오류는 변환을 실패시켜 조용한 원본 오배정을 막는다.

### 10.1 정점색 선언 결합

G05의 mul_vertex_base_color=1과 GraphDef.c0가 `_c0`를 각각 선언한다. 비동기 graph 적용 순서가 달라도 GLSL 선언은 하나여야 하므로 graph.ts와 material.ts의 두 onBeforeCompile에서 이미 선언한 attribute 줄을 중복하지 않는다. 그래프는 emissivemap 뒤 원본 최종 RGB를 덮고 표준 정점색 곱은 그 앞 map 단계에 남는다.

## 11. 첫 통합 시점의 검증 이력·외형 확인 항목

[데이터] 직접 담당 첫 통합: 고유 조합27 중 판독1·시간 바인딩 근사2·대기24, pending106→103(표 §8). 원본 파일·텍스처 픽셀·모델은 동일하며 manifest2개만 변했다. 압축 `--only mg/`는 새 텍스처0·새 소리0·manifest 해시2개 갱신, 10초 완료.

[데이터] 신규 노드 시험416/416, 사전 재사용/오배정 방지·필수 sampler/파라미터 누락0, 원본 SASS RGB/alpha 표본240 최대절대오차1.1920928955078125e−7, GLSL 6/6 컴파일·링크(세 그래프×정점색 패치 순서2). WGL 숨은 컨텍스트에서 **compile/link만** 호출했으며 화면 그리기·촬영은 없다. 이 첫 수치는 시간 위상을 주입한 RGB/alpha 시험이며, 뒤의 f32 시간 상수 재대조·정수/SIN 확대 시험 및 §18 최종 집계와 구분한다.

[데이터] 기존 노드 시험 전체1회: 27파일 중26통과, test_mg_assets1825/1825·test_plaza_world437/437. test_mgmet은 별도 transition 작업의 fade.ts 이동 도중 모듈 없음으로 실패. 첫 tsc통과, 이후 npm run build도 같은 mgmet/fade 미연결2건으로 실패. 해당 파일은 shader-graphs가 수정하지 않는다.

사용자 외형 체크: mg0106 탐조등 두 표본의 색 혼합·밝기 위상, mg0102 홀로그램의 정점색·시선 각도별 알파, mg0508/mg0101/mg0122는 첫 통합에서 새 식 적용 없음. [판독] 당시 시험은 시간 CPU 단위·화면 모양의 증거가 아니었다. 이후 World 단위는 u32 프레임으로 확정(§19·29), 실제 화면 모양은 사용자 확인 대상이다. 현재 게임별 외형 체크는 §20을 따른다.

[데이터] 시간 상수 원본 비트 대조 수정 뒤 확대 시험593/593: 위상 상수 비트1건·uint 정수 나머지11경계·시간/SIN176표본·RGB/alpha240표본을 포함하며 최대절대오차1.1920928955078125e−7, GLSL컴파일/링크6/6. 당시 사전 적용3개였으며 현재 반영70·대기36 집계는 §18이다.

[데이터] transition 담당의 연결 수정 후 `test_mgmet` 218/218 재검증, `tsc --noEmit`·`npm run build` 통과. 전체 최초 실행의 실패1건은 이 재검증으로 해소했다. VS 중간 수치는 6묶음×100표본+깊이 clip5표본이었다. 이후 최종 단계식의 결합·적용 결과는 §18, CPU 생산자 후속은 §32로 구분한다.

[데이터] 실제 재변환 manifest의 식·해시 일치 18건을 추가하여 신규 노드 시험611/611. PBR 병렬 결과를 위해 GLSL 시험의 무조명 패치도 원본 shading_type=0인 경우에만 적용한다.

## 12. 병렬 FS A·C 판독 보존·적용 차단

[데이터] FS A: 5묶음13재질, 노드503개·원본 FS digest13개 대조 통과. 공용 런타임 입력을 확정하기 전 판독 완료와 자동 반영을 구별한다.

| 묶음 | 판독식·근거 | 적용 차단 |
|---|---|---|
| G06 | 화면 두 정수 texel의 flag0x80 OR→utility1.r 곱 k; color=mix(albedo,C0,k), roughness=mix(rgh,P0.y,k), normal=mix(N1,N2,k) | Layer[0x500] 정수 스텐실·뷰포트·원본 비정규화 normal mix |
| G13 | 기존 mg0508 §7.1 재사용. 깊이 역투영→칼 평면 mask=sat((0.025−abs(d))×40); C0·mask·sat(sin(tangent×40+phase))·abs(Ng.y)^3 최종 가산 | 깊이·View 역행렬·World[0x0] u32 위상·P3/P4/C0 갱신·VS 런타임 _C0 |
| G16 | alpha=max(P0.x,min(T(_a0,uv0).a·mul_opacity,P0.y))·ModelOpacity; 표준 roughness texture 유지 | ModelOpacity CPU 바인딩. 칼 P0 런타임 투명도 §6.9 별도 |
| G17 | F2I.U16.RN(P0.x)로 원본6층 배열 mask; color/roughness/normal 세 출력 mix | sampler2DArray·ties-even 층 변환·비정규화 normal mix |
| G22 | A=sat(albedo·mul_base_color), B=sat(abs(c0)^f32(0x400ccccd)); A<0.5이면2AB, 그 밖1−2(1−A)(1−B) | ModelOpacity CPU 바인딩. 정점 pow2.2는 sRGB 변환과 별개 |

[판독] normal XY 복원 `z=sqrt(clamp(1−x²−y²,0,1))`. G06/G17 utility normal에는 TBN 곱이 없고 mix 뒤 원본 normalize도 없다. 기존 GraphDef normal 출력은 항상 normalize하므로 입력 확장만으로 동등성이 생기지 않는다. G16/G22 후보는 식 판독이 완료됐지만 원본 모델 알파 입력이 없어 strict 자동 적용은 보류한다.

[판독] FS C G07/G20/G27 공통: `h=fract(P.y)`, `j=fract(h+0.5)`, `w=abs(2h−1)`, `Ui=U·P.w+flow·{h,j}·P.z`, `pair=mix(sample(U0),sample(U1),w)`. flow=(2R−1,1−2G), color 마스크=step(1−area.r,pair.rgb), 물 roughness=material_roughness·(1−0.5·(1−sat(N·V))^4). FS에는 World 시간 reader가 없으며 원본 재질 애니 P.y를 사용한다. G07/G27 노멀은 **RGBA 네 채널** `normalize(2pair−1)` 후 XY를 사용한다. UNORM 입력에 SNORM 복원을 중복하지 않는다.

[최초 보고] FS C 세 조합은 VS 결과와 결합 전 pending이었다. 현재 G07/G20은 §17 결합 완료, G27만 대기. 원본 IBL cube/LOD·ModelOpacity·G27 화면 color/depth 캡처·View 역투영·안개 입력을 보존한다. G07/G20 read_under_water=0인데 기존 patchWater가 water_enable만으로 muddy 합성을 붙여 원본 결과를 가리는 차이를 확인했다. 해당 조건은 최종 통합에서 read_under_water 기준으로 수정했고 G07/G20 적용을 검증했다(§17~19). 최초 C 중간 numericValidation은 실행 예정이었다. 최종320표본·max4.172325134277344e−7은 §18에 별도 집계했다.

[데이터] 사용자 우선순위: G09(24) → G11(14) → G01(10) → G02(7) → G10(5), 합60재질. 먼저 이 다섯 전체 조합의 FS/VS·공용 런타임 상태를 해소한다. 위 A·C 원본식과 후보는 사전 stages.fs에 보존하고 전체 pending은 유지한다.

## 13. 우선 G11 옵션 분기·샘플러 조건 설계

[설계 이력] 이 절의 실제 할당5재질·미할당9대기는 최초 조건부 통합 시점이다. 현재 판독·변환은 원본 resident dummy 조건까지 반영해 G11 14/14 적용·대기0이며 §18~§19가 최종 기준이다.
[판독] ndv=sat(N·V), noise=T(utility1,srt0(uv0)·P0.z).r, film=T(utility0,(fract(ndv+noise),0.5)).rgb, k=pow(1−ndv,P0.y)·P0.x. base=mix(B,film,k)이며 k를 임의 clamp하지 않는다. B는 원본 base_color_texture/mul_base_color 옵션에 따라 albedo·base_color·mul_base_color를 선택한다. thin-film은 발광 가산이 아니다. PBR·노멀·sRGB는 기존 경로를 재사용한다.

[데이터] 14재질·FS5변형. utility0/1 둘 다 할당된 spco_05_up_mt·spco_05_under_mt·spco_01_mt·spco_00_under_mt·spco_00_up_mt 5개가 최초 반영 후보였다. 나머지9개의 원본 resident texture7/sampler4를 후속에서 확정해 현재14/14 적용(§19). 검정 표본은 null 추정이 아닌 원본2D dummy 근거로 한정한다. 담당 Node 검증은 최종 JSON의 passed 수치를 사용한다.

사전 확장: 전체 해시 키는 그대로 유지하고 graphVariants에 순수 원본 옵션 selector·requiresSamplers·status·GraphDef를 저장한다. 조회에 대상 FRES를 넘겨 selector 완전 일치+필수 sampler 실제 비null인 분기만 선택한다. 불완전 분기는 None으로 남겨 기존 pending 경로로 간다. 복수 분기가 겹치면 오류다. 재질 이름으로 고르지 않으므로 다른 아카이브에도 재사용한다. program=graph:<tupleSHA>:<selectorSHA>로 분기별 GLSL 캐시 충돌을 막는다. record status=partial은 일부 재질 반영이며 전체14 완료를 뜻하지 않는다.

[근사] 위5개도 기존 stage3d ModelOpacity=1·PBR/IBL 근사는 남는다. 새 틴트·시간·opacity 상수를 추가하지 않고 명시된 기존 계약에서 판독한 baseColor만 반영한다. G16/G22 엄격 후보는 뒤 우선순위에서 원본 모델 불투명도 바인딩을 별도 해결한다.

[데이터] FS C 최종 보고: 노드 수치320표본 통과·의존성76검사 누락0. 원수치·전체식·캡처/IBL/ModelOpacity 차단은 사전 stages.fs와 shader_fs_c.json에 보존. 후보를 적용하기 전 VS·water 합성 조건을 검증한다.

## 14. 우선 G09 화면 입력 설계

[판독] U=(pixelXY−Layer470.xy)·Layer488.xy, screenUV=clamp(U,0,1−Layer458.xy); baseColor=T(_a0,uv0).rgb·(C1.rgb+(C0.rgb−C1.rgb)·T(utility0,screenUV).rgb). 마스크는 RGB 각 채널이며 P0.x는 이 식에 쓰지 않는다. 24재질·FS2명령변형의 그래프 의미가 같다. 표준 normal/roughness/metallic/ao는 덮지 않는다.

GraphDef 조각식의 새 이름 screenUV는 필요한 그래프에서만 uniform을 선언한다. material.onBeforeRender가 현재 물리 viewport=(x,y,w,h)를 공급하고, 조각 위치를 `(gl_FragCoord.x−x,h−(gl_FragCoord.y−y))`로 좌상단 원점으로 바꾼다(03_graphics UV·PNG 첫 행·flipY=false 계약). viewport 역크기와 한 픽셀 edge로 `clamp(local/w,h,0,1−1/(w,h))`를 계산한다. viewport 변경 때 uniform 갱신을 보장한다. 원본 표준 재질·광장 그래프에는 screenUV가 없어 새 경로를 사용하지 않는다.

[근사] 최초 반영 당시 Layer470/488/458 CPU 갱신 함수가 없어 현재 그리기 viewport·그 역크기를 웹 대응으로 사용했다. 후속 §31에서 원본 depthRT·scissor writer를 확보했으나 runtime은 이 근사를 유지한다. 한 픽셀 edge와 캡처/분할 viewport의 원본 범위는 사용자 확인 필요에 남긴다. 모델 UV·worldPos·상수 마스크로 바꾸지 않는다. 원본 screen 식 산술은 판독, 웹 입력 대응은 근사이며 runtime 완전 동등성으로 세지 않는다.

[데이터] G11 FRES 재확인: 14개 모두 texture_srt0=1·pbr_uv=0, SRT scale1.5~25, P0.x=0.57~2로 활성 강도다. 미할당9개를 강도0으로 간주할 수 없다. slots 자체가 FRES samplers에 없으며 converter의 null 표본 기본값은 원본 fallback 근거가 아니다. 최초에는 sampler0/1 실제 할당5개만 통과했다. 후속 원본 dummy 바인딩 확인과 미할당 조건으로 현재14/14 적용(§19).

## 15. 우선 G01·G02 원본식·입력 상태

[판독] G01은 광장 grass_card와 같은 VS2522730817 단계식을 재사용. E=ENV0(Layer120, CPU 07_camera_lighting 정정 근거), U=u32 World4, D=f32(E.y·1000), phase=float(U%uint(D))/D. W.xz·0.1·E.x를 각(−E.z−45)°로 회전 후 frac(+phase), 잡음R·E.w=amp. deltaWorld=amp·(sin(E.z°),0,−cos(E.z°))·c0.y+amp·비정규화 nrmW·c0.x. 법선 자체는 변위로 다시 계산하지 않는다. 기존 광장 ENV1 연결은 변경하지 않는다.

[데이터] env_sg_utility_texture2d0에서 manifest.windNoise로 이미 원본 이름을 보존한다. mg0508/mg0101/mg0122 ENV0=[15,2,0.5,0.012]/[5,2,25,0.35]/[1,0.8,1,0.07], noise=leafnoise00/windnoise00/grass00_noise. G01 10재질 중 mg0508_griddle의 grass00_mt만 attribAssign._c0가 없다. CPU descriptor/항목제거 경로는 §32 확정, 외부NVN 최종Color0.xy fetch값은 미확정. 잡음 handle Layer10·World 프레임 CPU 후속 근거는 §19에서 확정했다. 원본 sampler descriptor는 §30에서 확정했고 웹 sampler/mip 대응은 미구현이다. World 생성/gate 경로는 §29에서 확정했으나 owner epoch/Core timing의 웹 대응은 근사다. 원본 정점색을 임의0/1로 만들지 않는다.

[판독] G02: c=c0.xyz·f32(0x3c23d70a), D=E.y·100, ph=float(U%uint(D))/D+(c.x+c.z)E.x. pivot=Model100..12c·vec4(c,1)+instance.translation. axis=normalize((sin((E.z−45)°),0,−cos((E.z−45)°))), theta=sin((2ph−1)π)·E.w·20°. deltaWorld=pivot+Rodrigues(axis,theta)(W−pivot)−W. c0.w 미사용·법선/탄젠트 회전 없음. 현재 mesh.modelMatrix를 원본 Model100으로 간주하면 Shape/뼈 변환이 두 번 적용될 수 있어 아직 대기7재질. Model producer·Mode packing은 §32에서 확정했고 실제 draw별 행렬·instance 값/순서의 웹 공급이 남는다.

[데이터] VS605표본·순서회귀1·GraphSource6검사 통과. 원본식 판독과 입력 공급은 구별한다. 후속 G01 9/10은 환경 잡음+프레임 근사 공급으로 반영했으며 G02는 원본 Model 생산·Mode packing 확정 후에도 draw별 Model·instance writer/순서·웹 binding이 없어7재질 대기(§32).

## 16. 우선 G10 packed 표면·AO 설계

[판독] packB.xy를2x−1→z복원→TBN으로 기본N, detail.xy·sat(P4.y)를 기본N과 tangent로 다시 TBN. roughness=sat(packB.b+detailRgh·sat(P4.z)), detailAO=sat(1+detailAOTexture−sat(P4.w)). detailUV는 기존 광장 tileRotate 원식(P3·f32(−π/180))을 재사용. P4.x는 미사용. 최종 원본 AO=(globalAO?min(packA.a,globalAO(uv1).r):packA.a)·detailAO.

기존 GraphDef.ao는 three baseline에 곱한다. G10에서 원본 AO를 중복 곱하지 않도록 선택 필드 aoMode='replace'를 추가하고 해당 정의에서만 기본 aomap fragment를 대체한다. 기본 동작은 multiply다. global_ao_texture=0/1 분기는 원본 옵션 selector로 재사용하며 samplerAssign으로 packA/B·detail·globalAO를 연결한다. 기존 광장 그래프에는 aoMode가 없어 변하지 않는다. 원본 direct/specular AO 전체 엔진 차이는 기존 PBR 근사로 남긴다.

## 17. 나머지 작은 결합과 대기 구분

| 묶음 | 확보한 원본식 | 이번 결합 |
|---|---|---|
| G04 | noiseR·2−1→P0.xyz·P0.w→각 채널 maskRGB→월드 offset; noise=srt2(uv2), mask=srt1(uv1) | VS·UV0/1/2·두 sampler 모두 확보, 단일 그래프 |
| G07 | VS raw uv0 flow·두 높이 blue 표본·triangular phase→`vec3((height·2−1)·P0.x·0.1)`; FS §12 flowPair·RGBA 노멀·색 마스크 | FS+VS 합집합, 기존 PBR/IBL·ModelOpacity 근사 |
| G20 | VS `Y=mask.g·(height·P0.x·2−1)·0.1`, FS 같은 flowPair 색·기하 법선·roughness | FS+VS 합집합, 진폭 곱 순서·G 채널 보존 |
| G15 | rim=sat(pow(max(1−Ng·V,0),P0.x)), h=sat(worldY·P0.w), q=sat((rim·h−P0.y)/(P0.z−P0.y)), emissive=C0.rgb·C0.a·q²(3−2q) | smoothstep 공통 원식, 기본 표면값 보존 |
| G19 | albedo·(1+maskRGB−P0.x)·mix(C0.rgb,C1.rgb,gradientR); sat 없음 | 원본 srt0 켜기 분기·uv1·세 sampler 재결합 |
| G25 | 스캔UV=회전/scale/offset 원식, RGB=sat(scan·P0.z)·sat(B)+sat(scan)·sat(fresnel·E); 마지막 합 sat 없음 | base/emissive texture·정점색 원본 옵션2분기, 기존 ModelOpacity 근사 |

물 합성 충돌의 범위 제한: **이번 사전에서 반영된 graph: 프로그램**이고 read_under_water=0일 때만 legacy patchWater를 생략한다. 원본 FS에 없는 muddy 틴트가 그래프를 덮는 것을 막는다. 기존 광장·아카이브 그래프는 프로그램 식별자가 graph:가 아니므로 동작을 유지한다. setup 호출에 실제 선택된 GraphDef를 전달해 같은 이름의 다른 모델에도 오배정하지 않는다.

G27 물속 color/depth 캡처·역투영·안개, G06 스텐실 캡처, G13/G14 깊이 복원, G17/G26 texture array, G18 draw별 Model 중심·G21 화면/곱하기 합성·G23 raw Layer 방향의 draw yaw/scale 웹 공급, G24 VS 깊이/varying은 대기다. 이들은 원본식을 사전에 보존하되 대규모 렌더패스나 미확정 바인딩을 상수로 대체하지 않는다.

## 18. 현재 반영·검증 집계

[데이터] 최초 pending106 중 신규 사전 반영70·남음36. 기존 광장 재사용1을 포함한 static_graph107은71반영·36대기. 전체 옵션 튜플27개·FS 비영23·VS 비영8. 단일 정의8개·조건부5개, 전체 적용12묶음·부분 G01 1묶음·전체 대기14묶음.

| 우선 | 전체 | 반영 | 남음 | 상태 |
|---|---:|---:|---:|---|
| G09 |24|24|0|색 식 판독·screen 입력 근사|
| G11 |14|14|0|옵션+실제/미할당 sampler 조건·원본 dummy 판독|
| G01 |10|9|1|ENV0/잡음 연결 확정·프레임 tick/epoch·sampler 근사; _c0 누락1|
| G02 |7|0|7|회전 식·Model producer/Mode packing 확정; draw별값·instance 순서/웹 binding 대기|
| G10 |5|5|0|packed/detail·globalAO 분기·AO replace|

[데이터] 원본 식 분류 판독5재질(G04 1·G05 1·G15 1·G19 2), 런타임 입력/조명 근사65재질, 미반영36. 판독5도 ModelOpacity·표준 PBR 전체 정확성을 뜻하지 않는다. 적용묶음 G01/G04/G05/G07/G08/G09/G10/G11/G12/G15/G19/G20/G25의 원본식과 변형 SASS·옵션은 사전에 보존했다.

[데이터] 최종 통합 Node1971/1971, 실제70재질×패치순서2의 GLSL compile/link140/140(NVIDIA RTX4060 GL4.6). sampler/raw/필요 uv1/uv2/uv3/c0 누락0. RGB/alpha304·프레임/SIN176·screen5 SASS 직접 표본, maxAbsError1.1920928955078125e−7. 필수 World 입력·환경 잡음 로드 실패 거절, 다른 게임 env 재결합, 누락 attribute 차단, 원본 dummy/실제 texture 분기 cache key를 회귀로 검증. shader_graph_compile.py는 native WGL 컴파일/링크만 호출하며 그리기·촬영 없음.

[데이터] test_mg_assets2048/2048(참조2283·없음0, GLB131·문제0), test_plaza_world438/438, 기존 test_plaza_gl60/60, tsc 통과. 기존 전체 최초27파일 실행의 mgmet 실패1건은 transition 수정 후218/218로 해소. 이 런타임 통합 시점에는 관련 노드 회귀를 재실행했고, 이후 분석·문서 후속은 §29~33의 검증 범위로 구분한다.

[데이터] 별도 판독 표본: FS A503·digest13; FS B/F5034·SASS17; FS C320표본·max4.172325134277344e−7·의존성76; FS D/E/G3968·GraphSource20, G11 후속4851비교·max1.7881393432617188e−7·후보14; VS605·순서회귀1·GraphSource6, CPU 후속54·GraphSource2. 단위가 다른 수를 합산하지 않는다.

[데이터] 5게임 재변환은 모델·텍스처 같은 내용 재사용, manifest만 갱신. 증분 압축11초·새 텍스처0·새 소리0·해시 manifest5개·사전압축5개. 옛 산출물162개는 삭제하지 않았다. npm run build 최종 결과와 실제 페이지 콘솔은 §20.

사용자 외형 확인: mg0508 배경 grass 바람(철판 grass1 미반영), mg0101 풀 바람·화면 마스크 영역/크기·packed 세부노멀/roughness/AO·수면/폭포 흐름, mg0102 thin-film14재질의 시선색(02는 검정 film 원식)·스캔2재질·홀로그램 알파, mg0106 탐조등 색·프레임 위상, mg0122 풀/꽃/잎 바람·나무줄기 높이/시선 림 발광. 화면 모양은 사용자 확인 항목이다.

## 19. World 프레임·환경 샘플러·더미 바인딩 후속 설계

[판독] World+4는 ms가 아닌 u32 누적 프레임. main 00968a4에서 renderer+218/+21c=0, 00970dc..0097144에서 두 gate가 해제되면 +21c에 Core+1c+1(1..4, 무효 handle은1)을 w-register add, 0097d1c/0097d34에서 World+4에 그대로 저장한다. `counter=(counter+increment)>>>0`. 기존 광장 mpjMs는 이전 계약을 유지하며 이번 G01/G08/G12만 `uniform uint mpjWorldFrame`을 쓴다. Stage의 `floor(frame)>>>0`를 명시적 공급한다. [근사] Stage의 dt×60 누적은 원본 gate·logic tick·renderer lifetime 재현이 아니며 이 대응을 정확 판독으로 표기하지 않는다. uint 공급이 없으면 해당 그래프 적용은 오류로 거절한다.

[판독] G01 Layer+10: 이름표019cf4f8 env_sg_utility_texture2d0 → reader+3b4 → 0090dec..0090e1c에서 texture handle, setter0074774의 slot1 → ComEnvironment+1a0 → 0073f58 Layer memmove. 기존 manifest.env.windNoise가 바로 이 자산이다. BC4_UNORM RRR1·linear·mip9. [판독] 원본 sampler는 ClampUVW·Bilinear min/mag·Linear mip·LOD0..13·bias0으로 확정(§30). [근사] 웹 sampler 상태·원본 mip 체인 공급은 미지원. 사전 `environmentSamplers:{sgLayer10:windNoise}`를 대상 manifest.env로 해결하고 GraphDef.samplerSources에 environment 출처를 보존한다. 실제 자산이 없으면 분기 불성립, 로드 실패는 오류이며 검정 텍스처로 대신하지 않는다. `requiresAttributes:[_c0]`가 없는 mg0508_griddle 1재질은 pending.

[판독] G02 Model+100/+110/+120은 ComModelBuffer+60의 column 행렬을 CPU zip/ext/st2로 전치한 affine3행. Three elements 인덱스 [0,4,8,12]/[1,5,9,13]/[2,6,10,14]에 대응한다. Model 생산자·instance translation 위치/packing은 §32에서 확정했다. 실제 draw별 M·instance writer/순서·웹 binding이 없어 자동 적용하지 않는다. mesh.matrixWorld로 Shape까지 재적용하는 반례: 원본 pivot(1,2,3), 잘못된 mesh 대체(200,400,600). 원본 행렬 입력은 draw별 공급 계약으로 남긴다. 후속 Node54/54·GraphSource2/2 통과.

[판독] G11 미할당9재질의 원본 음수 texture index → resident_texture2d_dummy(texture7/sampler4). 실데이터1×1 RGBA8_UNORM=(0,0,0,255), 정규화(0,0,0,1). noise 미할당은 R=0, spco02의 film 미할당도 RGB=0으로 식 특수화한다. 옵션 selector에 `requiresMissingSamplers`를 더해 실제 미할당일 때만 적용하고, 실제 할당된 변형에 상수0을 오배정하지 않는다. 분기 program cache key에 selector·할당/미할당·attribute 조건을 포함한다. ModelOpacity1·PBR/IBL 기존 근사는 유지한다. 같은 음수 규칙을 다른 pending에 적용하려면 기존 samplerAssign 데이터가 음수/부재인지 별도 확인하고, array·capture·Layer 입력을 더미로 대신하지 않는다.

[데이터] 기존 사전 단계식·현재 FRES samplerAssign 대조: 전체 대기 중 G21 shadow_mt의 sg_utility_texture2d0가 미할당이다. 같은 원본 더미 R/RGB=0 자료를 참조할 수 있으나 Layer 좌표source/Opacity CPU 식은 확보했으나 실제 RT snapshot·draw별Opacity와 state4 곱하기 합성 계약이 남아 자동 적용을 늘리지 않았다. G17/G26 array·G06 캡처·G13/G14 깊이는 resident 2D 더미로 대체할 수 없다. 함수 재판독 없음.

## 20. 최종 빌드·받기 경로 검증

[데이터] `npm run build` 통과: 번들57·사전압축63, 2585KB→br677KB, assets 기본 dist. 실제 Chrome `http://localhost:51811/ui.html?ui=mgstage&mg=mg0101&assets=dist&auto=1` 단일 점검28.366초·콘솔 오류0·404 0. 네트워크 idle 후 로그 확인, 촬영·외형 평가 없음. 5게임의 최종 pending은 §8, 최종 변환 집계는 §18. 최초5반영9대기였던 G11은 현재14반영0대기로 갱신했다.

## 21. G23·G26 확보 식과 입력 계약

### 21.1 G23 FS4060002986 — 투영 caustics

[판독] `D=(Layer220,224,228)`는 원본의 **비정규화 방향**이다. `Q=worldPos·P7.x`에서

```
u=(Q.x·(D.y²+D.z²)−Q.y·D.x·D.y−Q.z·D.x·D.z, Q.z·D.y−Q.y·D.z)
j=T(utility7,u).r·f32(0.3)−f32(0.15)
caustic=T(utility7,u+vec2(j)).rgb+T(utility7,u+vec2(j+fract(P7.y))).rgb
k=sat(dot(normalize(NgW),D))·sat((P7.z−worldPos.y)/P7.w)
emissive=caustic·k
```

`0.3=0x3e99999a`, `0.15=0x3e19999a`. P7.y가 위상이며 ms·World·ENV를 새로 더하지 않는다. cliff00/01 P7=(.25,0,0,5)/(.25,0,−20,20). p103은 mul_base_color=1의 표준 표면만 달라지고 그래프 식은 같다. [판독] D는 최종 light transform의 +Z를 그대로 저장한 Layer 입력이고 P7.y는 기존 FMAB의 −0.002/frame 채널이다(§29). [미확정] draw layer yaw·socket scale와 FMAB native scheduler의 웹 대응; normalized sunDir로 대신하지 않는다. P7.w=0은 특이점이며 epsilon을 넣지 않는다. 근거 mg0101 p83 FS 4~27(투영),117~141(두 표본),191/209(가중),220~229(발광), p103 변형. 원본식은 사전 `e08920785b49…json:stages.fs.sourceExpressions`.

### 21.2 G26 FS636352889 — 두 array 층 표면 혼합

[판독] `U0=v10.xy`(현재 SRT0 scale20), `U1=v11.xy`, `q0=tileRot(U0,P1)`, `q1=tileRot(U0,P4)`. tileRot는 광장 §6.8의 scale/degree 회전/offset 식 그대로. 층별 입력:

```
Ai=array0(qi,i).rgba; Ni=array1(qi,i).xy; Ri=array2(qi,i).ra; Mi=array3(qi,i).r
m=T(utility2,U1).rg
w0=sat(2·sat(m.r·(1+A0.a))+P2.x−1)
w1=sat(2·sat(m.g·(1+A1.a))+P2.x−1)
B=mix(mix(T(_a0,U0).rgb,A0.rgb,w0),A1.rgb,w1)
roughness=mix(mix(T(_r0,U0).r,R0.r,w0),R1.r,w1)
metallic=mix(mix(material_metallic,M0,w0),M1,w1)
AO=mix(mix(1,R0.a,w0),R1.a,w1), 이후 원본 globalAO 합성
Nb=TBN(Ng,nz(T(_n0,U0).xy),Tw,tw)
Nl0=TBN(Ng,nz(N0),Tw,tw); Nl1=TBN(Ng,nz(N1),Tw,tw)
N=mix(mix(Nb,Nl0,w0),Nl1,w1)
```

array0 RGB=sRGB, alpha=선형; array1 xy=SNORM 표본(T 복원 이후 추가2x−1 없음); array2 R=roughness/A=AO(TEX mask0x9로 r/a 축약); array3 R=metallic. **마지막 N은 재정규화하지 않는다.** 현재 GraphDef.normal의 정규화는 원본 BRDF 입력을 바꾸므로 자동 적용 보류. 실제 array3 미할당은 2D resident dummy의 층 동작으로 확정할 수 없다. P1=(1,1,1,1),P4=(3,1,1,1),P2.x=1. [판독] 원본 array 층/metadata/sampler와 array3 CPU 기본handle은 §30 확정. [미확정] 웹2DArray/mip·비정규화 normal 출력·2D TIC/array TEX 차원 불일치의 GPU 표본. 근거 mg0122 p78 FS2~50(UV),53~58/162/170~172(array),131~148/174(weight),149~180(normal),214~241/294~326(표면), p82/p74 변형. 사전 `f054c5129297…json:stages.fs`.

## 22. G14·G18·G21·G24 확보 식과 입력 계약

### 22.1 G14 FS2265242073 — 깊이 복원 거리 ramp

[판독] native fragment XY에서 `u=max(min((XY−Layer470/474)·Layer488/48c,1−Layer458/45c),0)`, `pixel=ivec2(trunc(u·Layer478/47c+Layer470/474))`, `z=texelFetch(Layer4f0,pixel,0).r`. clip=`(2u.x−1,1−2u.y,z,1)`이며 **z에2z−1을 적용하지 않는다**. View120/130/140/150의 vec4 행과 dot해 H를 만들고 W=H.xyz/H.w. `rampU=sat(length(Model1c0/1c4/1c8−W)/Model1e4)`, RGB=`T(utility0,(rampU,.5)).rgb·material_base_color`, alpha=Model20c. PBR을 추가하는 식이 아니다. [판독] Layer viewport 좌표source·capture handle writer는 §31 확정. [미확정] RT snapshot/view format·View 역행렬 depth/Y·Model 중심/반경의 draw 공급·최종 출력 경로. H.w=0·radius0 임의 보정 없음. 근거 mg0106 p119 FS2~26(화면),27~46(역투영),47~60(거리/색); 같은 FS 식 mg0101/mg0102 포함.

### 22.2 G18 FS3035261389 — 모델 중심 발광

[판독] 원본 Model affine행 M으로 `center=M·(0,.7,.1,1)`, .7=0x3f333333,.1=0x3dcccccd(FFMA 순서 보존). `q=worldPos−center`, `d=length(q)`, `rad=sat(1−d+f32(0.8500000238418579)·P0.x)`, `facing=sat(dot(viewDir,normalize(q)))`, `weight=rad³+1.5·P0.x·facing`. 발광=`weight·material_emissive_color_scale·material_emissive_color·(1−T(utility0,uv0).r·P0.y)`, weight·마스크 억제에 추가 sat 없음. 표준 PBR에 가산; alpha=ModelOpacity. [판독] Model100..12c 생산·전치 업로드는 §32 확정. [미확정] 실제 draw별 M 값·웹 공급; q=0 원본 RSQ 경계. 근거 mg0106 p86 FS136~175(중심/weight),182~210(mask),518~525(최종 가산), utility0=linear BC4 R.

### 22.3 G21 FS3483203703 — 화면 왜곡 곱하기 계수

[판독] 화면 u는 G14와 같은 Layer 정규화/edge clamp. `a=T(utility0,u).r`, `u2=u+vec2(P0.y+a·f32(.05))`, `b=T(utility0,u2).r`, `mask=sat(b+P0.z)`. `f=sat(pow(max(1−dot(normalize(NgW),viewDir),0),P0.x))`, `k=c0.r·(1−f)·mask`, RGBA=`vec4(1−ModelOpacity)+ModelOpacity·k·C0`. dot 자체를 먼저 sat하지 않는다. **state_type4 곱하기**이며 RGB/alpha 독립 식. .05=0x3d4ccccd. 후속 공통 resident dummy로 미할당 utility0의 R0을 참조할 수 있으므로 a=b=0·mask=sat(P0.z) 특수화 가능; 이를 sampler 자료만으로 렌더 state 정확성까지 확정하지 않는다. [판독] Layer 좌표source·ModelOpacity CPU 식은 §31~32 확정. [미확정] 실제 RT/viewport snapshot·draw별Opacity 공급·곱하기 패스의 alpha 중복 여부. 원본 현재 P0.z=10,C0=1이라는 데이터와 런타임 계약을 구분한다. 근거 mg0106 p131 FS2~21(왜곡),24~58(Fresnel),59~72(RGBA).

### 22.4 G24 VS3548160070·FS4221260974 — 깊이 비교 flare

[판독] M=Model100..12c affine3행, VP=View70..ac, B=View190..1b8 3행, C=View1c0..1c8, A=View1d0..1d8, P=P0.xyz,v=a_Position.

```
origin=M·(0,0,0,1); shifted=C−origin+2A; delta=P−shifted; D=normalize(delta)
angular=pow(sat(dot(D,A)),16)
clip=VP·(M·(P+vec3(f32(.1)),1),1); ndc=clip.xyz/clip.w
scale=(1−delta.z)·f32(.8)·angular
local=shifted+D·(delta.z·10)+B·(v.xy·scale,0)
out=any(abs(ndc)>1)||ndc.z<0
pixel=(trunc(sat(ndc.x*.5+.5)·Layer478+Layer470),trunc((1−sat(ndc.y*.5+.5))·Layer47c+Layer474))
visibility=out?0:float(texelFetch(Layer4f0,pixel,0).r>=ndc.z)
local*=visibility
```

이후 Shape/Skeleton·Mode 변환→VP. visibility0은 local0을 후속 변환하므로 discard와 같지 않다. depth 비교는 geu(unordered 포함). v10.xy=uv0, v14.w=angular이며 angular에 visibility를 다시 곱하지 않는다. FS RGB=`T(utility0,perspective(v10.xy)).rgb·perspective(v14.w)`; alpha=Model20c(표본 alpha·gain 미곱). FS IPA.pass×rcp(pos.w),FMUL.RZ 순서. [판독] Model 생산/행 패킹·Layer depth handle/좌표source는 §31~32 확정. [미확정] draw별Model·View 축/depth 규약·RT snapshot·float varying 웹 계약. gain을 c0.a나1로 대신하지 않는다. 근거 mg0122 p182 VS9~147/148~168/514~531, FS2~14; mg0102 동일 그래프 변형. 사전 `a38d96c3e7f4…json:stages.vs/fs`.

## 23. G27 VS2739868962·FS649725027 — 강물 굴절·깊이 합성

### 23.1 VS 높이 흐름

[판독] flow=utility1(raw uv1).rg, F=(2flow.r−1,1−2flow.g), p=fract(P0.y), j=fract(p+.5), w=abs(2p−1), qi=raw uv0·P0.w+F·(p 또는 j)·P0.z. h=mix(utility0(q0).b,utility0(q1).b,w), `deltaWorld=(0,(2h−1)·P0.x·f32(.2),0)`(.2=0x3e4ccccd). 법선/탄젠트 재계산 없음. FS 전달 v10=srt0(uv0),v11=raw uv1; VS 높이 UV에는 SRT0 미사용. P0.y만 위상이며 새 World/ms 식을 넣지 않는다. 근거 mg0101 p74 VS672~705/737~755. 현재 fmab 강물60fps/200f loop·폭포100f loop가 parameter y채널을 갱신한다.

### 23.2 FS 표면·IBL

[판독] pair는 §12 flowPair(반주기 두 표본·삼각 weight) 그대로. U=v10,Fuv=AreaUv=v11. `M=step(vec3(1−utility3(AreaUv).r),pairColor(U,F,P1).rgb)`, `B=material_base_color+P1.x·M+P2.x·utility4(uv1).rgb`. GE 경계 포함. `Q=normalize(2·pairNormal(U,F,P0).rgba−1)`은 **네 채널 정규화**, xy=Q.xy·P0.x, N=normalize(T·xy.x+cross(Ng,T)·tw·xy.y+Ng·sqrt(sat(1−dot(xy,xy)))). roughness=`material_roughness·(1−.5·pow(1−sat(N·V),4))`. 알파=Model20c.

원본 환경 BRDF: r=위 roughness, n=NoV=sat(N·V), `k=min((1−r)²,exp2(f32(0xc1147ae1)·n))`, `z=(1−r)·k+c1[0]·r+f32(0x3d2e147b)`, F0=mix(vec3(f32(0x3d23d70a)),B,metallic),

```
brdf=F0·(c1[4]+c1[1]·r+c1[3]·z)+(c1[2]·r−f32(0x3d23d70a)+c1[4]·z)
spec=CubeSpec(cube(reflect(−V,N)),LOD)·brdf·pow(1−sat(−dot(Ng,reflect(−V,N))),2)·f32(0x3e828f5c)
diffuse=CubeDiffuse(cube(N),0)·B·(1−metallic)
```

c1=[−0.027499999850988388,−0.5720000267028809,0.02199999988079071,−1.0399999618530273,1.0399999618530273]. p74의 spec cube=Material local_specular(index37,handle260), p70=Layer50; 이는 표면 그래프 해시 동일 여부와 별개인 환경 변형. 원본 cube/LOD 및 표준 BRDF를 three IBL과 동일하다고 표기하지 않는다.

### 23.3 굴절·색/깊이 캡처

[판독] Nx=dot(N,View40/44/48),Nz=dot(N,View60/64/68),eta=water_ior, k=1−eta²(1−Nz²). k<0 전반사면 dx=0, 아니면 dx=clamp(Nx·(eta·Nz−sqrt(k))·water_uv_offset_scale,−limit,+limit). **dy=clamp(0,−limit,+limit)**; N.y로 보완하지 않는다.

```
screen=clamp(nativeFragXY·Layer488/48c−Layer480/484,0,1−Layer458/45c)
u=screen+(dx·Layer4a4,dy)
depth=T_Layer550(u,lod0).r; captured=T_Layer540(u,lod0).rgb
H=View_inverse_rows120..15c·(2u−1,depth,1); underWorld=H.xyz/H.w
muddy=sat(length(underWorld−worldPos)/water_muddy_range)
under=mix(captured,water_muddy_color,muddy)
FinalRGB=spec+water_opacity·diffuse+(1−water_opacity)·under
```

알파는 water_opacity가 아니라 Model20c. water_mt/low의 IOR1.2/1.33,opacity.65/.6,muddy_range17/5를 보존. 캡처 UV의 y 반전·depth 범위는 CPU→WebGL 계약에서 확인해야 한다. 표면 worldPos를 underWorld로 재사용하거나 depth1·muddy 상수로 대신하지 않는다.

[판독] 안개 분기 `Layer100>−Model318`, view depth 입력 View170..178, 거리/높이 입력 Layer104..11c, fogCube=Layer80. LOD=`7·(1−sat(depth·Layer108−Layer104))`. [판독] 누락했던 최종 거리/높이 가중식은 후속 §26에서 확보했다. CPU 계수·enable·cube slot/descriptor/metadata는 후속 §29~30에서 확정했다. native cube LOD와 웹 공급 계약은 미확정이며 런타임은 미반영이다.

근거 mg0101 p74/p70 FS: 2(flow),12(RGBA),41~42(color/area),138(cube),190(Layer550),212(Layer540),286(역투영),317(muddy),341(alpha); normalized SHA p74=6f3ec41c85b8e2f07eaa4a6fbacfb98e3eb3b0fa8fb01c1728b4053eb46275ad. [미지원] render-target 색/깊이·pass 수명·View rows/basis·cube/LOD·안개·ModelOpacity; VS 식 지원과 FS 전체 이식은 구분해 graph=null 유지. 사전 `15520a47e420…json:stages.vs/fs`.

## 24. 다른 대기 묶음의 확보 식·예외

[판독] G03/G13 VS3775346869는 mg0508 §6.10·§7.1 기판독을 재사용한다. `h=clamp(pos.y−.49−P1.w,0,100)`에서 object offset=`(1+c0.y)·c0.z·(1+h·P2.w)·P0.xyz+(0,c0.y·P0.w·c0.z,0)−.8·P0.w·c0.w·c0.z·h·P1.xyz`. 원본 runtime _C0=(aux,h,w,side)는 GLB에 없으며 createMeshPost·P0/P1/P2 갱신이 남았다. FS0인 G03에도 미공급 _C0 때문에 자동 적용하지 않는다.

[판독] G06: 화면 s는 §22.1, o=utility0(uv0).r, qp=(sat(s.x+o·P1.x),sat(s.y+(o−1)·P1.y)), qm=(sat(s.x−P1.x),qp.y). ip/im=trunc(qp/qm·Layer478/47c+Layer470/474), `g=sat(float((uintFetch(Layer500,ip).r&0x80)!=0)+float((uintFetch(Layer500,im).r&0x80)!=0))`, k=utility1(uv0).r·g. B=mix(_a0.rgb,C0.rgb,k),r=mix(_r0.r,P0.y,k), N=mix(normalize(TBN·nz(_n0.xy)),normalize(nz(utility2.xy)),k), 최종 N 재정규화 없음. [미지원] 정수 스텐실 bit0x80·capture 수명/viewport·비정규화 노멀. 근거 mg0508 p35 FS(대표 경로 §5), 원본 화면/bit fetch·표면 연산 줄은 사전 evidence로 보존.

[판독] G13 FS2248262712: 화면 깊이 G14 방식으로 W 복원. d=W−P3.xyz, plane=dot(d,P4.xyz), tangent=d.z·P4.x−d.x·P4.z, mask=sat((f32(.025)−abs(plane))·40). U=World0 u32, quotient=(uint64(U)·0xa7c61a3b)>>48, rem=U−quotient·99999, phase=f32(rem)·.25. emission=C0.rgb·mask·sat(sin(tangent·40+phase))·pow(abs(normalize(Ng).y),3). [미확정] World0 규약은 World4와 별도이며 새 frame을 대신 쓰지 않는다. 화면깊이/역투영·cutLineUpdate의 P3/P4/C0도 미공급. 근거 G13 FS 단계 evidence와 mg0508 기판독 cutline 계약.

[판독] G16 FS2596196817: alpha=`max(P0.x,min(T(_a0,uv0).a·material_mul_opacity,P0.y))·Model20c`; B는 표준 알베도·mul_base_color, 노멀/roughness 텍스처 보존. G22 FS3942598924: A=sat(_a0.rgb·material_mul_base_color),B=sat(pow(abs(c0.rgb),f32(0x400ccccd))) 즉 지수2.2. RGB는 **채널별** A<.5면2AB, 나머지1−2(1−A)(1−B); alpha=Model20c. 두 그래프는 현재 사전 단계식을 확보했으나 ModelOpacity CPU 식/생산자 확정 후에도 실제 draw/GraphicsLayer별값의 엄격 바인딩 조건으로 자동 적용을 보류했다(기존 근사로 반영한 묶음과 구분).

[판독] G17 FS2653408627: layer=F2I.U16.RN(P0.x), mask=array0((uv0,layer)).r. B=mix(_a0.rgb,C0.rgb,mask), r=mix(_r0.r,P0.y,mask), N=mix(normalize(TBN·nz(_n0.xy)),normalize(nz(utility0.xy)),mask), 최종 N 재정규화 없음. [미지원] array 층 선택·비정규화 N·Model20c. sampler2D 더미 규칙으로 array 층을 추정하지 않는다. G06/G13/G16/G17/G22 담당503수치·digest13은 §18이며, 개별 SASS 경로·줄·상수·옵션은 각 사전의 stages.fs에 동봉했다.

## 25. 공통 원인·분담 경계 — CPU 후속 통합 상태

2026-10-09 후속은 **분석·문서만**. 웹 런타임·변환기·manifest·압축자산·시험 코드를 수정하지 않는다. 현재106재질을 실제 사전 조건과 manifest에 재대조:70반영·36대기(§8 unchanged). `analysis/mat/shader_graph_uncertainty_inventory.json`은 각 재질의 실제 `_c0`/UV 배치·sampler·선택 GraphDef·stage 차단 입력을 저장한다. 초기 직접 소유는 **G27 마지막 fog 가중식**과 시험 근거 정리였다. 부모 배정 후 World/Layer/fog 직접 결과와 분담3의 CPU 생산자를 §29~32에 통합했다. 아래 표는 현재 상태다. 기판독 SASS 식·VS/DEG 결과·03/07은 재사용한다.

| 공통 원인 | 적용/대기 재질 | 공통 함수·데이터 경계 | 현재 판독 상태 | 차단 조건 |
|---|---|---|---|---|
| `_c0` 누락/생성 | G01대기1; G03/G13대기7 | G01 FRES attribAssign 누락과 native vertex fetch 기본 상태; mg0508 createMeshPost의 aux/h/w/side 버퍼 | G03/G13 생성식 재사용; G01 descriptor/제거 경로 §32 확정 | 외부NVN 최종fetch 미확정; 0/1 보충 금지 |
| Model/Mode | G02대기7·G18대기1·G24대기2 | ComModelBuffer UpdateGpuResources0070340 전치 업로드; +60 producer·entity placement·Mode instance translation | E×local/instance branch·전치·Mode/record packing §32 확정 | draw별실제M·instance writer/순서·웹context 미공급 |
| ModelOpacity | 전체106의 FS가 Model20c reader; 엄격 차단 G16/G22 3 | ComModelBuffer의20c upload source·setter/animation·model instance 범위 | global/baseline·GraphicsLayer별 overwrite 식·setter §32 확정 | 실제draw/레이어 값·갱신 공급 미확정; 1.0은 근사 |
| World tick/epoch | 적용 G01/G08/G12 11; G13대기6의World0 | 0096864 초기0→00970c4 gate·Core+1c(1..4)→0097bd0 upload | factory·등록·카운터 gate·upload·해제 확정(§29) | 원본 owner 수명/Core timing·Stage dt×60 floor 대응 미확정 |
| env sampler | 적용 G01 9 | 00905a0 name cache→0090c90 handle→0074774 slot1→0073e8c Layer10; 원본 sampler descriptor | windNoise 자산·BC4 linear RRR1 mip9 확정 | 원본 상태 확정(§30); 웹 sampler·mip 계약 미지원 |
| texture array·N 혼합 | G17대기2·G26대기3 | BNTX arrayLength/viewDimension·native 2DArray descriptor·layer 선택·array3 default | G17 mask R8_UNORM256²,arrayLength6/viewDimension5; G26 층0/1·채널·sampler·array3 CPU fallback 확정(§30) | T는2D, 최종 blended N 강제정규화, array3의 차원 불일치 GPU 표본값 미확정 |
| 화면/capture/stencil | G06/G13/G14/G21/G24/G27대기16; G09적용24 | Layer458..550/Viewport·View120..15c·render-target pass 수명; uintStencil bit80 | 식·reader는 기존 SASS; 직접 Layer writer·sampler·좌표source §31 확정 | actual RT snapshot/View depthY 규약 미공급; G09는 currentViewport 역수/1pixel 근사 |
| Layer 방향·P7.y | G23대기2 | Layer220/224/228 raw direction producer·P7.y parameter animation | projectedUV·jitter·caustics와 raw +Z·FMAB 채널 확정(§29) | draw yaw/socket scale·native animation scheduler의 웹 대응 미확정 |
| G21 state4 | 위 대기16에 포함한1 | native multiply blend·RGBA opacity·resident utility0 | RGBA식·state4·dummy R0은 기판독 | three alpha와 중복 곱 여부 미확정 |
| G27 fog | 위 대기16에 포함한2 | p74/p70 FS337~373·Layer100/104..11c/80·Model318 | §26 가중식·§29 CPU coefficient/enable·cube slot8 확정 | descriptor/metadata §30 확정; Model gate·native cube LOD·웹 final RGB 공급은 별도 |

원인별 수는 중복되므로 합산하지 않는다. 65근사의 그래프 추가식 분류: G01 9(프레임/샘플러),G08/G12 2(프레임),G09 24(screenUV),G07/G10/G11/G20/G25 30(기존PBR/IBL/TBN/ModelOpacity 및 출력계약). **5판독+65근사는 추가 그래프 식 분류**다. 판독5도 전체 셰이더·원본GPU의 정확성 수치가 아니다. 기존 FS를 새 분석 없이 문자열 대조했을 때 Model20c reader는70반영+36대기 전부에 있다. 선택 GraphDef에서 `modelOpacity`를 직접 쓰는 것은28재질(G05 1,G08/G12 2,G07 3,G11 14,G20 6,G25 2); 나머지는 baseline alpha 경로의 별도 검증 대상이다. 원본 전체 런타임 대응까지 확정한70재질이라는 의미로 세지 않는다. 표준 shading_type1 적용64의 일반PBR/IBL은03/07 재사용 대상으로, 중복 판독하지 않는다.

## 26. G27 누락 fog 거리·높이 최종 가중 — 후속 판독

[판독] 새 범위는 mg0101 p74/p70 FS **346~373 말단**뿐. 원본 물/IBL/VS를 재판독하지 않았다. 앞의 입력 provenance만 연결했다:101의 r4=v0.y,117/119/125에서 world−camera,130/132/133/136으로 r5/6/7=normalize(camera−worldPos),282/288/289/295/316/321의 r15=`dot(worldPos−camera,View170/174/178)`. 이는 Euclidean length가 아닌 **부호 있는 view-depth 내적**이다.

```
applyFog = Layer100 > -Model318                  // 337 GT; 345 false면 기존 RGB·alpha로 exit
D = sat(FFMA(viewDepth, Layer108, -Layer104))     // 351
H = sat(FFMA(worldY, Layer118, -Layer114))        // 359
h = exp2(log2(1-H) * Layer11c)                   // 360~364
h = min(h, Layer110)                            // 365 FMNMX(predicate true): min
k = sat(FFMA(D, Layer10c, h))                    // 366
V = normalize(camera - worldPos)
a = max(abs(V.x),abs(V.y),abs(V.z))              // 346/348 FMNMX(not true): max
cubeDir = (-V.x,-V.y,+V.z) / a                   // 350/353~355
lod = 7 * (1-D)                                // 352/356, 7=0x40e00000
fogRGB = textureCubeLod(Layer80,cubeDir,lod)     // 357
outRGB = FFMA(fogRGB-preFogRGB,k,preFogRGB)      // 367~372, 각 RGB 채널
outAlpha = Model20c                            // 341, fog 말단은 r3 변경 없음
```

[판독] height와 distance의 최종 조합은 **곱셈이 아니라 거리항+높이항 후 sat**. L110은 height cap이고, L10c는 distance 강도; CPU 이름·업로드는 §29에서 연결했다. LOD는 거리항 D만 사용하고 최종 k/height를 LOD에 다시 넣지 않는다. cube 방향은 world camera→surface의 직접 정규화가 아니라 V의 x/y 부호를 뒤집고 최대절댓값으로 나눈 원본 식. α에 fog를 곱하거나 water_opacity로 대신하지 않는다. false gate도 값 변경 없이 반환한다.

| raw 입력 | shader 의미 | CPU 공급 상태 |
|---|---|---|
| Layer100, Model318 | `L100 > -M318` 원본 gate | L100=mip fog enable 0/1 확정(§29); Model318 draw별 gate 값/producer는 미확정; §32의 Model행/Opacity 판독으로 대체하지 않음 |
| View160..168,170..178 | camera와 signed depth 축 | 기존 View/03/07 연결 참조, native field→web draw 계약 별도 |
| Layer104/108 | depth offset/scale | 원본 start/end와 f32 최소폭 처리 확정(§29) |
| Layer10c | distance 강도 | env_mip_fog_intensity 직접 복사 확정(§29) |
| Layer114/118 | world-height offset/scale | 원본 height start/end와 f32 최소폭 처리 확정(§29) |
| Layer11c/110 | height exponent/cap | falloff 직접 복사·height enable 0/1 cap 확정(§29) |
| Layer80 | mip fog cube handle | slot8→Layer80·원본 descriptor 확정(§29/30); 단일mip view/LOD 웹 대응 별도 |

[데이터] 현재 mg0101 manifest는 fog(start20,end150,intensity.5,cube=mg0101_fog_irr),heightFog(start−100,end−10,falloff.6)를 보존한다. [판독] 두 객체의 존재는 변환기 asset_convert.py:563/569의 원본 enable==1 분기를 통과한 결과다. CPU C의 실제 packing은 §29; manifest 색[.34543,.5093,.72877]을 cube 표본 대신 쓰는 것은 원본 식이 아니다.

[데이터] 두 말단의 텍스트 SHA256=`f61fa1c3b211d24a875c6a2954587e7ce8da280c43b6e8c05f8716fc07a9914c`로 동일. 분석용 Node는 실제 SASS 줄을 읽어 FADD/FMUL/FFMA/FMNMX/MUFU 순서를 실행하고 독립 pow/mix 식과 대조했다. **320표본·641검사 통과**, RGB maxAbsError=`5.960464477539063e−8`, α변경0. gate off·거리/높이 경계·height cap0·거리 강도.5/1 포함. cube 값은 합성 표본 주입이므로 native texture sampling·GPU SFU bit 일치 시험이 아니다. [미확정] V=0·(H=1,exponent=0)의 LG20×0·FTZ/NaN 경계는 보정하지 않았다.

분석 자료: `analysis/mat/shader_graph_g27_fog.json`, scratchpad `shader_graph_g27_fog_numeric.ts/json`. 후속 CPU decomp C 목록은 §29; INDEX는 부모 통합 담당이며 이 작업에서 변경하지 않았다. [판독] G27 수학식 완료·런타임 미반영. G27 fog 수학식의 기존 문서 공백1건 해소; capture snapshot/View·native cube LOD·Model draw 공급 및 웹 구현 계약이 남아 G27 2재질 pending 유지. 사전27·70반영·36대기 집계는 변하지 않는다.

## 27. 직전 검증의 정확한 범위·병행 작업 구분

### 27.1 mgmet 실패와218/218의 의미

[데이터] shader-graphs 소유 전체 실행 기록은 scratchpad `shader_graph_tests/summary.json`:27파일 중26 exit0,**test_mgmet exit1**. 실패 로그는 `mgmet/index.ts`가 이미 이동된 `./fade`를 export해 ERR_MODULE_NOT_FOUND였으며 assertion failure 수치가 아니다. 당시 build도 index/hub의 fade 연결로 실패했다.

[데이터] 수정자는 **병행 transition 담당**. SHARED transition 결과와 현 파일 대조: `shell/mgmet/hub.ts:16`의 `./fade` import를 `../../lib/transition`의 Transition으로 바꾸고, fade 필드76=Transition·생성110=`o.transition ?? new Transition()`·종료487/488 fadeOut/closed·갱신534 step을 공용 코어에 연결. `shell/mgmet/index.ts`의 `export * from './fade'`는 제거됐고 이전 fade.ts는 지정 scratchpad로 이동했다. shader-graphs는 이 파일들을 수정하지 않았다. 전체 공용화 계약은15_transition.md를 재사용한다.

[데이터] 그 뒤 shader-graphs가 `test_mgmet`를 개별 재실행하여218/218·exit0, tsc/build를 재실행해 통과했다. **최종 동일 worktree의 전체27파일을 다시 한 번27/27로 실행한 기록은 없다**. 따라서 정확한 표현은 “전체 최초26/27, 유일 실패 mgmet은 병행 수정 후 개별218/218로 해소; 후속 관련 시험·tsc/build 통과”다. scratchpad 다른 `alltests.log`는 별도 더 이른 작업의 기록이므로 이 전체 실행의 최종 증거로 합치지 않는다.

### 27.2 실제 GLSL140검사의 구현·한계

[데이터] `tools/test_shader_graphs.ts`는 실제106원본 재질에 사전 조건을 적용해 현재70재질을 선택한다. 각 재질에 THREE.ShaderLib.standard VS/FS를 쓰고 원본 shading_type0에서만 patchUnlit, mul_vertex_base_color1에서 patchVertexColor를 적용한다. **applyGraph 앞/뒤 두 패치 순서**를 만들어 onBeforeCompile 실행→ShaderChunk include 재귀 확장→unroll loop·light count 치환→`#version 300 es` 선언을 붙여70×2=140 **VS/FS program pair**를 JSON stdin으로 Python에 넘긴다. 140은 원본 BNSH 바이너리 프로그램140개나 화면140개라는 뜻이 아니다.

[데이터] `tools/analysis/shader_graph_compile.py`는 ctypes로 user32/gdi32/opengl32 호출. WS_VISIBLE 없는1×1 STATIC 창의 DC에서 ChoosePixelFormat/SetPixelFormat→wglCreateContext/wglMakeCurrent, glCreateShader/glShaderSource/glCompileShader(140×VS/FS=280 shader objects), compile status 확인→glAttachShader/glLinkProgram140 및 link status/info log를 확인한다. 성공 renderer=NVIDIA RTX4060 Laptop GPU, OpenGL4.6.0 driver595.79. 끝에서 shader/program/context/window를 해제한다. **ShowWindow·draw call·framebuffer readback·SwapBuffers·screenshot 호출은 없다.** 실제 GPU 드라이버의 컴파일·링크 검증이며 헤드리스 화면 판독이 아니다.

[미확정] 이 시험의 map/normal/roughness·directional-light 대표 define과 three patched source가 컴파일 가능함을 검증한다. 모든 native pipeline/skin/instance/shadow 변형, 실제 sampler 색공간/값·draw state·capture pass·GPU SFU·화면 모양을 검증하지 않는다. dummy THREE.Texture로 loader 입력을 만들므로 수치 SASS 대조와 texture binding 자료는 별도 근거다. 모델 속성/파라미터/샘플러 누락0은 사전·GLB·manifest 정적 대조 결과이고 compile 성공 하나로 추론하지 않는다.

## 28. CPU 후속 통합 후 남은 표·사용자 확인 필요

| 묶음 | 미반영 재질 | 확보된 추가식 | 남은 원본 입력/계약 |
|---|---:|---|---|
| G01 |1|바람 offset·ENV/noise identity|CPU descriptor 경로 확정; 외부NVN 최종_c0.xy fetch|
| G02 |7|pivot Rodrigues 회전·Model행 전치|draw별Model·Mode instance writer/순서·tick/epoch|
| G03 |1|mg0508 기판독 변형|runtime _C0 버퍼·P0/P1/P2 갱신|
| G06 |2|stencil bit80 마스크·색/r/N 혼합|uint capture/viewport·최종 N 비정규화|
| G13 |6|VS 기판독·깊이 plane scan emission|_C0·capture inverse·World0 lifetime·cutLineUpdate|
| G14 |3|깊이 inverse→거리 ramp|depth/View·center/radius·final color path|
| G16 |2|alpha clamp|ModelOpacity 엄격 바인딩|
| G17 |2|array layer mask·색/r/N 혼합|2DArray층 선택·N 비정규화|
| G18 |1|model 기준점·radial/facing emission|원본 Model 중심식 확정; draw별값 웹 공급|
| G21 |1|화면 왜곡·RGBA multiply 계수|viewport·state4 alpha·ModelOpacity|
| G22 |1|abs(c0)^2.2 채널 overlay|ModelOpacity 엄격 바인딩|
| G23 |2|투영caustics|Layer raw +Z·FMAB 채널 확정; draw yaw/scale·native scheduler 웹 대응|
| G24 |2|camera-facing/depth flare VS·gain FS|Model/View·depth pass·float varying|
| G26 |3|두 array 층 표면값|metadata/sampler·CPU default 확정; array3 GPU차원 불일치·웹층/mip·비정규화 N|
| G27 |2|flow VS·water/IBL·굴절/depth·**최종fog 신규확보**|capture/cube·View/Layer/Model 공급|
| 합계 |36|추가식 확보와 런타임 공급을 분리|중복 원인을 재질 수로 다시 합산하지 않음|

[데이터] **변환·런타임 미반영36은 유지**. 이번에 실제 확인한 문서식 공백은 G27 fog1건이며 §26으로 해소했다. 이를 “36개 모두 수학 미판독” 또는 “원본 전체 식/GPU 대응27개 완전 확정”으로 바꾸어 세지 않는다. 본문에 확보한 식·CPU 생산자를 표시하고, 실제 draw값/웹 binding·외부NVN/TIC 규약·RT snapshot·기존 PBR 근사를 남은 계약으로 구분한다. 70 적용에도 runtime opacity70·정확PBR64·clock11·screen24·env sampler9 등 중복 검증 항목이 남는다. “판독5/근사65”는 이전 추가식 분류를 유지한 집계다.

[판독] World0와World4의 기존 CPU 후속 근거는 별개로 재사용: gate 해제 후 renderer218은+1(00970ec..00970f4),renderer21c는Core+1c+1 또는1(0097124..0097144),0097d00/0097d10은World0에218,0097d1c/0097d34는World4에21c를 복사. 둘 다00968a4에서0 초기화. **G13의 World0를 mpjWorldFrame(World4)로 대신하지 않는다.** 생성0·등록·해제·counter gate 경로는 §29에서 확정했다. owner World3d 생성/보존 epoch·Core callback timing/frame step·Core+30 설정 원인의 웹 대응은 남는다. counter 식/주소는 기존 shader_vs_batch 판독을 재사용한다.

[미확정] 사용자 확인 필요는 구현 허가 요청이 아니라 남은 판단/공급 목록이다: 외부NVN missing attribute fetch값과 기판독 mg0508 _C0의 웹 생성; Model/Mode/Opacity draw 단위 값; World 객체 lifetime/gated logic tick; 원본 env sampler/mip 상태의 웹 대응; native viewport/depth/Y범위·stencil/underwater capture 시점; array3 2D TIC/array TEX 차원 불일치 표본과N 비정규화; raw Layer +Z의draw yaw/scale와P7.y native 재생; G21 multiply state; fog 웹 계약·Model318·native cube LOD(원본 coefficient/descriptor는 §29~30에서 확정). 웹 외형은 사용자 확인이며 이번 분석 후속에서 브라우저·화면·촬영을 실행하지 않았다.

부모 분담용 기존 C 목록은 `analysis/mat/shader_graph_uncertainty_cpu_sources.json`. analysis/decomp의 createMeshPost 근거는 mg0508.nro.c·mgC_mg0508_dis.c·mgC_mg0508_game.c. 기존Ghidra C는 ghidra_work/plazaA/out_post_com.c(0074774/0090c90/06b2458),out_post_sampler.c(0097bd0/06b2458). 부모 배정 후 새 C는 직접8개/37주소(§29),FSDEG4개/20함수(§30),FSC2개/11함수(§31),VS4개/40함수(§32)로 보관했다. 주소 중복은 각 provenance로 구분하고 INDEX 통합은 부모/A 담당이다. 이 작업의 INDEX 수정0.


## 29. World·Layer 방향·G27 fog CPU 공급 후속

### 29.1 환경 재질→컴포넌트→Layer

[판독] `00905a0`는 원본 이름 표 `019cf548`을 찾아 ResShaderParam `+0x12`의 바이트 오프셋을 reader `+0x1b0+8*i`에 캐시한다. `0090790`은 유효한 컴포넌트 참조에서 원본 값을 setter로 넘긴다. 각 setter는 아래 ComEnvironment 필드에 그대로 복사한다. `005f750`은 환경 참조가 유효하면 `0073e8c(env,drawLayer,LayerBuffer)`를 호출하고 무효면 Layer0..20f를 0으로 만든다. **Layer220은 이 환경 블록 밖이다.**

| 원본 이름 | reader 오프셋 | setter | ComEnvironment | Layer 쓰기 |
|---|---:|---|---:|---|
| env_mip_fog_enable |1d0|00746d4|90|100 = bool→f32 0/1|
| env_mip_fog_start_distance |1d8|00746dc|94|104 = start/폭|
| env_mip_fog_end_distance |1e0|00746e4|98|108 = 1/폭|
| env_mip_fog_intensity |1e8|00746ec|9c|10c = 원본 f32|
| env_height_fog_enable |1f0|00746f4|a0|110 = bool→f32 0/1|
| env_height_fog_start_height |1f8|00746fc|a4|114 = start/폭|
| env_height_fog_end_height |200|0074704|a8|118 = 1/폭|
| env_height_fog_falloff |208|007470c|ac|11c = 원본 f32|

[판독] 거리·높이에 같은 packing을 쓴다. 모든 항은 원본 f32이며 `end <= f32(start+0.0001)`이면 end를 그 값으로 바꾼다. `폭=f32(end−start)`, offset=`f32(start/폭)`, scale=`f32(1/폭)`. shader는 `sat(FFMA(value,scale,−offset))`로 읽는다. 범용 epsilon을 shader에 추가하는 규칙이 아니다. 큰 start에서 f32 덧셈이 start에 흡수되는 특이점은 별도 보정하지 않는다.

[판독] fog cube는 이름 표 `019cf4f0`의 **slot8 `env_mip_fog_texturecube0`**. 기존 `0090c90→06b2458→0074774(slot8)`를 재사용한다. `0074774`는 ComEnvironment `190+slot*10`에 handle을 쓰고, `0073e8c`의 `memmove(Layer,env+190,b0)`가 **Layer80**으로 넘긴다. 미지정 texture index는 reader+430의 원본 fallback 참조 경로다. FSDEG의 원본 descriptor 자료에서 mg0101 fog `_a3`(@FMAT+6b0)도 확인했다: ClampUVW, Bilinear min/mag, Linear mip, LOD0..13,bias0,compare/anisotropy off. 원본 cube metadata는 §30. fallback 색이나 임의 PMREM으로 대체하지 않는다.

[데이터] mg0101의 native 입력은 distance enable1, start20,end150,intensity.5; height enable1,start−100,end−10,falloff.6. f32 packing: Layer100=1,104=0.1538461595773697,108=0.007692307699471712,10c=.5,110=1,114=−1.1111111640930176,118=0.011111111380159855,11c=0.6000000238418579. **height cap은 enable 0/1**, 독립 intensity가 아니다. G27 guard의 다른 항 Model318은 draw별 gate 값/producer 미확정이며, §32의 Model행/Opacity 판독으로 공급이 해소된 것은 아니다. 여기서 생산자를 추가 판독하지 않는다.

근거 C: [환경 업로드](../../../analysis/decomp/shader_graph_environment_fields.c), [Layer 배치·fog setter](../../../analysis/decomp/shader_graph_environment_supply.c), [원본 이름 캐시·reader](../../../analysis/decomp/shader_graph_world_env.c). 이름 표는 scratchpad `shader_graph_name_tables.txt`. FSDEG의 `shader_fs_deg_env_sampler.c`에 이미 있는 00905a0·0074774·06b2458도 재사용한다.

### 29.2 World 생성·등록·갱신·업로드·해제

[판독] factory `00957ac(owner)`는 Allocate(0x220,8)→owner 참조 생성 `08ab658`→`0096864` 생성자→`0095810` 초기화 순서다. 생성자가 CPU renderer+218/21c를 함께 0으로 만든다. 초기화는 크기0x130의 GPU World 버퍼 **슬롯0/1을 모두 Map→memset0→Unmap**하고 `0056160(RendererModule,renderer)`로 등록한다. 등록은 Module+850 mutex 아래 vector `[+870,+878)`에 renderer 포인터를 append한다.

[판독] 모듈 callback `004f174`→`0055dd0`는 그 vector의 renderer 각각에 `00970c4`를 1회 호출한다. 아래 카운터 gate는 renderer 목록/리소스 처리 전체가 아니라 **두 카운터 증가만** 감싼다.

```text
if ((CoreSystem+30).bit0 == 0 && (0984814() & 1) == 0):
    renderer218 = u32(renderer218 + 1)
    renderer21c = u32(renderer21c + (validCoreRef ? CoreRef1c + 1 : 1))
```

[판독] `09847e4`는 전역 CoreSystem 포인터 `1c45478`의 +30 byte를 반환하고 **0984814는 이 빌드에서 상수0**. 유효 CoreRef는 `0983ab4` 반환 참조의 generation/owner를 검사하며 +1c 값은 `0987ad0`로 읽는다. 값0..3만 허용하고 3 초과는 UnexpectedDefaultImpl. 따라서 허용 증가량은 World0=1,World4=1..4; 두 값은 같은 counter가 아니다. Core+30의 특수 모드는 [01_core §3.2](01_core.md) 기존 판독을 재사용하며 “게임 pause”와 동일하다고 확대하지 않는다.

[판독] 기존 `0097bd0`는 renderer+20 버퍼를 GraphicsCoreModule 현재 슬롯으로 Map하고 renderer218→World0,renderer21c→World4를 그대로 쓴다. 슬롯마다 독립 timer를 늘리는 경로가 아니다. `0096ab0` 해제는 먼저 `00562f0`으로 동일 vector에서 찾고 마지막 원소와 교환해 삭제한 뒤 GPU 참조·목록·RcArena를 해제한다. 객체 재생성은 생성자 초기0을 다시 거친다. 동일 객체에서 게임이나 draw layer가 바뀐다는 이유만으로 0으로 재설정하는 코드는 이 범위에 없다.

[미확정] factory owner의 World3d 생성/보존 시점, 004f174의 정확한 Core timing 번호, Core+30의 설정 원인과 대상 게임 pause의 대응은 남는다. 원본 callback 1회·Core+1c 증가와 웹 `dt*60→floor(Stage.frame)`·Stage 생성 epoch를 동등하다고 확정하지 않는다. 필요한 최소 계약은 **원본 World 소유 객체 수명·callback 횟수·Core frame-step 값·gate**, 별도 ms 계수는 아니다. G13은 World0, G01/G08/G12는 World4 판독을 유지한다.

근거 C: [생성자·counter gate](../../../analysis/decomp/shader_graph_world_env.c), [모듈 전체 목록 갱신](../../../analysis/decomp/shader_graph_world_lifetime.c), [factory·버퍼 초기화](../../../analysis/decomp/shader_graph_direction_lifecycle.c), [callback·해제](../../../analysis/decomp/shader_graph_world_phase.c), [등록](../../../analysis/decomp/shader_graph_world_register.c), [목록 제거](../../../analysis/decomp/shader_graph_world_registry.c). upload는 기존 `ghidra_work/plazaA/out_post_sampler.c` 0097bd0 C 재사용.

### 29.3 Layer220 방향·P7.y

[판독] `005f750`의 유효 평행광 참조는 `00751d0(light,drawLayer,LayerBuffer+210)`를 호출한다. 따라서 G23의 `(Layer220,224,228)`는 light UBO `(10,14,18)`이고, 기존 [07_camera_lighting §6.6](07_camera_lighting.md)의 **최종 R′ +Z xyz**와 동일하다. 원본 부호는 표면→광원; shader 투영 입력에서 다시 normalize하지 않는다. overwrite=1이면 degree XYZ로 Rz·Ry·Rx, 아니면 socket matrix; owner flag와 draw layer q에 따라 `Ry(−qπ/180)·R` 추가 yaw. socket scale나 draw q를 버린 normalized manifest direction은 완전한 공급 계약이 아니다. 평행광 참조가 없으면 `005f750`은 Layer210..44f를 0으로 만든다.

[판독] 주소 정정: 기존 문서의 `00751cc`는 원본 word0의 함수 앞 패딩이고 실제 첫 명령은 **00751d0**. 751cc 임시 C의 UndefinedInstructionException은 잘못된 함수 경계 증거이며 scratchpad에 보관했다. 유효 751d0 C는 `00760d4` 다중 레지스터 반환을 일부 누락하므로 +Z 산식은 새로 재판독하지 않고 §6.6의 기존 @759c8/@75b94~75ba0 근거를 재사용한다. 기존 문서의 transform·저장 식을 철회하는 정정이 아니다.

[데이터] 기존 `mg0101_cliff00/01.fmab.json` 두 채널은 `material_utility_parameter7/0x04`=P7.y, frames1000·loop true, 값1001개, `y(f)=−0.002*f`(0≤f≤1000). 두 재질 각각 first0,last−2; 2002값의 선형식 최대오차2.220446049250313e−16(변환된 소수 기준). manifest layout은 두 fmab를 frame0,speed1,loop true로 연결한다. 기존 `FmabPlayer→setParam`은 byte04→P[7].y이며 게임 무대가 재생기를 연결한다. 그래프는 `fract(P7.y)`를 직접 소비한다. 데이터 위상은 500프레임마다 반복하지만 이는 native 실제 경과시간을 확정하지 않는다. 새 World/ms 위상을 더하지 않는다.

[미확정] P7.y의 **채널 공급 부재**는 해소했다. 남는 계약은 원본 animation start/step/loop 경계·draw layer q/socket scale의 웹 대응이다. runtime/manifest/변환 결과는 변경하지 않았고 G23 2재질·G27 2재질은 계속 pending이다.

### 29.4 후속 결과·검증 범위

[데이터] 새 영구 C8개는 아래와 같다. readOnly/noanalysis의 격리 Ghidra 사본에서만 추출했으며 원본 프로젝트는 저장하지 않았다. 함수명·주소→INDEX 통합은 부모 담당이다. 00905a0는 병행 FSDEG C와 주소가 중복되므로 provenance를 합쳐 처리한다.

| 새 C | 함수 header 수 | 범위 |
|---|---:|---|
| shader_graph_world_env.c |7|생성·gate getter·원본 env cache/reader|
| shader_graph_environment_fields.c |8|환경 UBO·lightgrid/decal setter|
| shader_graph_world_lifetime.c |2|RcArena 참조·모듈 목록 갱신|
| shader_graph_environment_supply.c |9|Layer 배치·fog setter8|
| shader_graph_direction_lifecycle.c |7|실제751d0·vtable·factory·버퍼 초기화|
| shader_graph_world_phase.c |2|모듈 callback·renderer 해제|
| shader_graph_world_registry.c |1|renderer vector 제거|
| shader_graph_world_register.c |1|renderer vector 등록|

[데이터] 총37 header, 고유37주소. 기존 G27 합성 계수 320표본·641검사에 이어, 새로 확정한 **원본 mg0101 CPU 계수**로 320표본·641검사를 추가 실행해 모두 통과했다. 추가 maxAbsError=5.960464477539063e−8, α변경0; 합성 cube 표본·Model318=0을 주입한 산술 시험이며 실제 cube sampling/draw는 시험하지 않았다. 기존 FMAB 2002값도 선형식과 대조했다. 이 후속은 분석·문서만이므로 전체 Node/GLSL/tsc/build를 재실행하지 않았으며 §27의 검증 범위를 확대하지 않는다. 현재 고유27·신규70반영·36대기(사전 formula5/runtime 근사65), 게임별 pending17/3/10/4/2는 그대로다. 새 구현 완료나 화면 정확도 완료로 집계하지 않는다.

[미확정] §30~32 결합 결과를 포함한 최소 웹 작업: World 수명·gate 계약, raw Layer +Z 공급, P7 FMAB native 재생 계약, fog f32 packing·cube sampler·Model gate 및 final RGB 적용 위치. 사용자 확인 필요는 이 계약과 게임 외형이며 임의 보정값 승인 요청이 아니다.

후속 수치 자료: scratchpad `shader_graph_g27_fog_native_coeff_numeric.ts/json`; 영구 분석 계약 `analysis/mat/shader_graph_world_env_contract.json`. 원본 계수 표본에서 (depth85,y−10)→D=.5,H=1,k=.25,LOD3.5; (depth150,y0)→D=1,H=1,k=.5,LOD0; height 시작 이하에서는 height1과 거리항의 합이 sat된다.


## 30. FSDEG 환경 sampler·array 후속 통합

[판독·데이터] 담당자의 `shader_fs_deg.json.environmentArrayFollowup`·동명 MD 후속을 통합했다. 원본 FMAT59개 descriptor와 texture7개, CPU 생성·소비 근거의 **Node 정적 대조440/440**. 식·해시·기존 GPU loader를 재판독하지 않았다. 영구 자료 `analysis/mat/shader_graph_env_array_contract.json`; C4개·20함수의 INDEX 통합은 부모/A 담당으로 그대로 전달된다.

[판독] FMAT+40 descriptor stride20, count+9c→`06b5860→084dc0c→08514e0→08839b4→088310c`. descriptor 첫20바이트 FNV32와 필드 byte 동일성이 cache 기준이다. u16+6에서 mip=`v&3`,min=`(v>>4)&3`,mag=`(v>>2)&3`; `0x2a`→native min5/mag1, `0x15`→native min2/mag0. wrap enum 표 `[1,6,7,5,3,0]`; float+8/+c가 LOD clamp,+10이bias. texture와 해당 material sampler가 하나의 handle로 조합되므로 texture만 재사용하는 계약으로 축소하지 않는다.

| 입력 | FMAT sampler / byte 위치 | UVW·LOD bias | 원본 texture view·mip·채널 |
|---|---|---|---|
| mg0508 leafnoise | env:_a2,688 | Clamp³,0 | BC4_UNORM256²,2D,1층·9mip,RRR1 |
| mg0101 windnoise | env:_a2,610 | Clamp³,0 | BC4_UNORM256²,2D,1층·9mip,RRR1 |
| mg0122 grass noise | env_mt:_a0,9a8 | Clamp³,0 | BC4_UNORM256²,2D,1층·9mip,RRR1 |
| G17 array0 mask | 도마00/01:_a1,e88 | Clamp³,0 | R8_UNORM256²,2DArray,6층·9mip,RRR1 |
| G26 array0 albedo | ground00_mt/no_s:_a1 | Wrap,Wrap,Clamp;−2 | BC1_SRGB512²,2DArray,2층·10mip,RGBA |
| G26 array1 normal | ground00_mt/no_s:_a4 | Wrap,Wrap,Clamp;−2 | BC5_SNORM512²,2DArray,2층·10mip,RG01 |
| G26 array2 roughness | ground00_mt/no_s:_a5 | Wrap,Wrap,Clamp;0 | BC4_UNORM32²,2DArray,2층·6mip,RRR1 |

[판독·데이터] 표의 min/mag는 Bilinear,mip Linear(`0x2a`),LOD0..13,bias는 표의 값, compare/anisotropy off(Ratio1). noise .r는 linear이며 sRGB/SNORM 변환을 더하지 않는다. albedo RGB만 sRGB→linear, alpha는 linear. BC5 native xy는 이미 signed, PNG 저장값을 되돌릴 때만2x−1. **G26 array2 alpha=1**(RRR1)이라 그 array AO 중첩 mix는1로 접을 수 있지만 별도 globalAO 결합은 유지한다. G17 layer=기판독 F2I.U16.RN(P0.x)·유효0..5,ties-even; G26 layer0/1과 최종 N 비정규화 식은 유지한다. W wrap을 array 층 보간이나 layer0 고정으로 해석하지 않는다.

### 30.1 미할당 array3 — CPU 바인딩 확정과 GPU 차원 불일치

[판독] native43슬롯 중 array0..3은33..36. array3 이름 포인터019cf020, cache=`forward_plus+3c8`, UBO=`Material+240`. G26 세 재질에 samplerAssign이 없어서 `00880b0`가−1을 저장한다. `00891b0`는 array 예외 없이 공용 +3f0 handle을 올리며 그 handle은 `0087f74`의 **textureId7+samplerId4**다. texture7은 G11 기존 판독의 1×1·RGBA8_UNORM·RGB0,A1·**2D view1·1층·1mip**. sampler4는 ClampUVW,Point min/mag/mip,LOD−1000..1000,bias0(`0x15`).

[판독] `085d9b0`는 BRTI+5c view_dim·+30 arrayLength를 view descriptor로 복사한다. `0886248→0882a50` target table은 view1→native1(2D),view5→native4(2DArray); `0851be0→087ed28`이 pool에 등록한다. array3용 별도 array view 생성은 확인되지 않았다.

[미확정] G26은 `M0=array3(q0,0).r; M1=array3(q1,1).r; metallic=mix(mix(material_metallic,M0,w0),M1,w1)`이다. **CPU default handle 공급 부재는 해소**, 그러나 2D TIC를 array TEX로 읽는 층0/1의 GPU 표본 결과는 미확정이다. G11 2D lookup의0 접기를 여기에 전용하지 않는다. 최소 자료는 NVN texture-pool이 만드는 TIC 차원과 Maxwell array TEX의 차원 불일치 처리 규약이다. M0=M1=0,흰색/1층 array dummy,base metallic0을 이유로 입력을 없애는 대체는 근거가 없다.

### 30.2 G27 fog cube에 담당 자료 재사용

[데이터] FSDEG raw sampler59자료 중 `mg0101_env.fmdb env:_a3`는 `env_mip_fog_texturecube0`→mg0101_fog_irr. descriptor+6b0 첫20byte=`0202020000012a00000000000000504100000000`: Clamp³,Bilinear min/mag,Linear mip,LOD0..13,bias0,compare/anisotropy off. §29의 slot8→Layer80과 연결했다.

[데이터] 기존 graphics_bntx metadata reader로 원본 cube header만 읽은 결과 **BC6H_UFLOAT32²,6면,Cube view,1mip,RGB1,sRGB=false**. 원본 바이트나 이미지 파일은 변경하지 않았다. shader LOD=`7*(1−D)`는 이 자산에 존재하는 mip 수를 뜻하지 않는다. [미확정] native view mip-range/explicit LOD 처리·GPU SFU와 웹 cube 공급은 별도 계약이다. 7개 mip나 PMREM을 새로 만들어 원본이라고 표기하지 않는다. 내용 hash와 descriptor 원본 경로는 `shader_graph_world_env_contract.json.fogCube`에 보존했다.

### 30.3 남은 구현·집계

[미확정] GraphDef T(vec2)에서 native array layer/mip,env sampler 상태·원본 mip 체인,최종 N 비정규화의 공급 계약을 구현해야 한다. G26 array3 GPU 처리 자료는 여전히 필요하다. runtime/manifest/변환기/압축 결과는 이번 후속에서 변경하지 않았고 G17 2·G26 3·G27 2재질의 pending도 유지했다. Node440은 정적 descriptor/metadata 대조이며 원본 실행·GPU 표본·화면 일치 시험이 아니다.

근거 C: [sampler 생성](../../../analysis/decomp/shader_fs_deg_env_sampler.c), [texture view·pool](../../../analysis/decomp/shader_fs_deg_env_texture.c), [view 공급](../../../analysis/decomp/shader_fs_deg_env_texture_supply.c), [dummy 등록](../../../analysis/decomp/shader_fs_deg_env_dummy_registration.c). 0883ab0는 조사 중 shader loader로 확인된 후보라 sampler 결론에 사용하지 않는다.
## 31. FSC capture/stencil 후속과 직접 Layer writer 연결

[판독·데이터] 담당자의 `shader_fs_c.json.captureCpuFollowup`·MD를 기존 `005f750` C와 연결했다. 영구 계약 `analysis/mat/shader_graph_capture_contract.json`. FSC 새 C2개·11함수 검증, CPU 좌표 Node2/2(7표본)는 담당 결과를 재사용한다. 새 SASS 판독·웹 반영·화면 시험은 없다.

### 31.1 요청·RT 참조·binding

[판독] GraphicsLayerExtension color weak 참조는 +298/+2a0/+2a8, depth는 +2b0/+2b8/+2c0. null과 owner generation 일치를 검사한다. `005dfa8`는 요청 handle→+40/+48/+50,flags→+58,enabled+5c=`flags&1`; `005dfc8`은 +40 handle과 +58 flags를 읽는다. 두 helper의 미사용 type 인자만으로 capture 종류·flags bit1의 최종 포스트 포함 시점을 확정하지 않는다.

[판독] `005a0d0`는 extension+248에 **0x5f0 Layer buffer**, 슬롯0/1 zero 초기화를 만든다. `00609bc`는 +248을 slot1(stage0/4)에 bind한다. +258+16*i는 slot2(stage0/4), **크기0x30**; +288은 slot9(stage0/4). slot2를 View 역투영 UBO라 부른 담당 초기 추정은 철회한다. 이 문서에는 그 추정을 넣지 않았다.

### 31.2 005f750 직접 writer — 미확정 범위 정정

[판독] 환경 담당 C `005f750`은 extension+38이 enabled일 때 +248의 현재 GraphicsCore 슬롯을 Map해 Layer를 쓰고 Unmap한다. `00bc300` sampler0=lVar13, sampler4=lVar5, texture7+sampler0=uVar6 fallback이다. `08645f0(view,sampler)` 조합을 다음 위치에 직접 쓴다.

| Layer | CPU 입력·view getter(vtable byte offset) | sampler | 참조 무효 시 |
|---|---|---:|---|
| 4e0 | color weak +298, virtual100 |0|texture7+sampler0|
| 4f0 | depth weak +2b0, virtual108 |4|texture7+sampler0|
| 500 | depth virtual110; 유효+2e0 resource의 ushort+8≥2이면 +208 virtual100 |4|depth 무효이면 texture7+sampler0|
| 540 | extension+1d8 virtual100 |0|해당 코드에 별도 fallback 없음|
| 550 | extension+1e8 virtual108 |4|해당 코드에 별도 fallback 없음|

[판독] 따라서 담당 후속의 “Layer540/550·4f0 직접 writer 미확정”은 **해소**했다. virtual108/110의 view format을 depth/stencil로 이름 붙이는 것, extension+1d8/+1e8 객체의 생성·capture pass snapshot·resize/alias/lifetime, uintStencil bit0x80을 쓰는 producer는 아직 미확정이다. CPU handle 연결만으로 G27 적용 또는 stencil 식 제거를 승인하지 않는다.

### 31.3 Layer 좌표·viewport/scissor

[판독] 같은 `005f750`의 유효 depth weak +2b0 virtual48/50→W,H, `Viewport.GetScissor`→sx,sy,sw,sh를 사용한다. `Layer450/454=(W,H)`, `458/45c=(1/(W−1),1/(H−1))`, `478/47c=(sw*W,sh*H)`, `480/484=((sx*W)/(sw*W),(sy*H)/(sh*H))`, `488/48c=(1/(sw*W),1/(sh*H))`, `4a4=1/((sw*W)/(sh*H))`. C의 f32 곱·나눗셈 순서를 보존한다. W=1·빈 scissor의 epsilon이나 대체값을 새로 넣지 않는다. **이 필드들의 CPU source 부재는 해소**, 실제 shader draw의 RT snapshot과 View120..15c 역투영 연결은 별도다.

[판독] `0862028/0862380` viewport는 normalized +1a0/1a4/1a8/1ac 각각 W/H f32 곱, +1b0/+1b4 min/max depth는 그대로. `08626c0/08627b0` scissor는 +1c0/1c4/1c8/1cc 각각 곱 뒤 int 절삭이며 right−left로 다시 계산하지 않는다. 기존 [10_split_screen §2](10_split_screen.md) 재사용. 1919×1079,rect(.5,.5,.5,.5)→viewport(959.5,539.5,959.5,539.5),scissor(959,539,959,539). WebGL 변환 `H−y−h` 결과는 각각0/1이다. 이 변환은 **native G27 texture Y 방향 증거가 아니다**.

### 31.4 stencil feedback·pass·잔여

[판독] `0063630`은 enabled+4f8·유효 depthRT·W/H>0일 때 +508의 현재 buffer index를 Map한다. `x=trunc(sat(+4fc)*(W−1)); y=trunc(sat(+500)*(H−1))`; **새 draw 전에** +504에 mapped int[2]를 읽는다. depth attachment, 전체 RT viewport/scissor, shader0x6d·buffer slot6를 bind하고 1vertex draw. scalar feedback는 G06의 uintStencil bit0x80 texture와 동일 입력이 아니며 fence·정확한 frame latency는 미확정이다.

[판독] `00b5bd0`의 UnderWater/OpaqueNormal/Translucent/ScreenCaptureFinal pass 등록은 기존 [10_split_screen §5](10_split_screen.md)를 재사용한다. 등록 순서만으로 GPU copy·최종 포스트 포함·capture 요청 종료를 확정하지 않는다. `0728e64→072d7c4→0768730/0729b90`는 ParticleFx2라 G27 Model/Layer 증거에서 제외했다. 0056fe8 padding의 C 오류 및 getter/빈 helper도 writer 근거에서 제외했다.

[미확정] 남은 최소 계약은 **RT 객체 생성·view format·pass snapshot, View120..15c depth/Y 역투영, stencil0x80 write/copy, capture flags/type 종료·포스트 의미, feedback fence/latency**다. 확인된 직접 writer와 sampler·좌표 공급을 다시 “자료 없음”으로 집계하지 않는다. 고유27·신규70반영·36대기와 게임별17/3/10/4/2는 그대로다. 화면 외형은 사용자가 기존 게임별 체크 목록으로 확인한다.

근거 C: [capture core9함수](../../../analysis/decomp/shader_fs_c_capture_core.c), [setup2함수](../../../analysis/decomp/shader_fs_c_capture_setup.c), [직접 handle·좌표 writer005f750](../../../analysis/decomp/shader_graph_environment_supply.c), [기존 RT 참조 setter](../../../analysis/decomp/camera_gfx_components.c). 새 C의 INDEX 통합은 부모/A 담당이다.

## 32. VS CPU 생산자 후속 — Model·Mode·Opacity·누락 Color0

[판독·데이터] 담당자 `shader_vs_batch.json.producerFollowup`·MD와 `shader_vs_producer_c_inventory.json`을 통합했다. 영구 계약 `analysis/mat/shader_graph_vs_producer_contract.json`, 새 C4개·고유40함수, Node **805/805**. World/env/capture·기존 shader 식·motion/bone C는 소유별 결과를 재사용하며 추가 판독하지 않았다.

### 32.1 Model 생산·전치 업로드

[판독] `0099fb0→00726b4→ComModel::CalculateTransform(06adaac)`의 q0..q3 반환을 ComModelBuffer+60..9f에 보관하고 `00702c0`가 Model UBO+100/+110/+120의 3 vec4행으로 전치한다. C가 외부 param1..4로 잘못 표시한 다중 SIMD 반환은 **00726b4..26dc 44byte** ASM만 대조했다. translation은 각 row.w(+10c/+11c/+12c)다.

[판독] `E=EntityTransform`, `R=ComModel+100..13f`, `L=SetLocalTransform` 인자(+c0..ff), 합성 local `B=R*L`(+80..bf). 일반 `M=E*B`; ComModel+228 instance buffer가 존재하고 ModelModule+e4 bit0=0이면 `M=B`. Entity+190 generation과 cache+140이 다르고 Model+2c bit80=0이면 재계산; SetLocalTransform은 cache140을−1로 무효화한다. Shape/skin은 이 M에 추가되지 않는다. 기존7 GLB의 Shape·scale200 중복 반례를 재사용하며 mesh.modelMatrix를 M으로 바꾸지 않는다.

[미확정] **Model producer와 행 의미 부재는 해소**. 실제 장면별 Entity·R/L 값/갱신 시점·instance branch→웹 draw별 M 공급은 미구현/미검증이다. G02 7·G18 1·G24 2재질의 원본 Model origin/pivot 계약이 남는다. 루트 identity는 완성된 대체 입력이 아니다.

### 32.2 Mode·instance record

[판독] 실제 constructor `006c6a0`는 ComModel+228 존재 여부를 Mode+4 uint에 저장(일반/planar),shadow 슬롯은0. 과거006c3d0는 vector helper라 constructor 근거에서 제외한다. `06ba3f0`는 CPU stride**0x54** record의 active byte+50≠0인 항목만 첫**0x50** byte를 GPU stride0x50으로 compact copy한다. allocated/live byte+51과 draw active+50는 다르다. matrix 첫0x30 byte는 row-major3×4 affine, translation은+c/+1c/+2c; record+30 opaque 기본1은 Model20c와 별도다.

[판독] `06ba710`의 named ConstantIdentity 초기 copy·opaque1·allocated51, `06bb400`의 capacity×0x50 GPU 할당, `06ba6dc`의 frame/draw buffer 객체 stride0x58, `007172c`의 VS/FS storage slot0 binding을 확정했다. 0x58은 instance record stride가 아니다. 외부 ConstantIdentity의 byte 주소는 main Ghidra map 밖이므로 직접 측정으로 집계하지 않는다.

[미확정] 게임별 actual instance matrix/active writer·GPU culling 후 buffer 순서와 Mode branch의 draw 공급은 남는다. 초기 identity/opaque1을 모든 프레임 값으로 대체하지 않는다.

### 32.3 ModelOpacity — GraphicsLayer별 덮어쓰기

[판독] `g=Buffer+258`, `b=Buffer+1dc`, `l[i]=Buffer+1e0+4*i`(i=0..14). 원본 ordered comparison 기준 `clamp01(x)=x<=0?0:(x>1?1:x)`이다.

```text
baseline Model20c = f32(clamp01(g) * clamp01(b))
layer overwrite Model20c = f32(clamp01(g) * (l[i]>1 ? 1 : l[i]))
```

[판독] layer 식은 유한값에서 min(l[i],1)이며 **음수 하한 clamp가 없다**. NaN은 ordered comparison을 통과해 곱에서 전파한다. g=.5,b/l=−2이면 baseline0,layer−1; g=0,l=−2이면 layer−0. scratch Buffer+21c+4*i의4byte만 UBO20c에 overwrite한다. `0069be0→0060210(extension+30 uint)→006fab8 param4`로 i는 **GraphicsLayer 번호**, param5는+660의0x18-stride resource descriptor 선택임을 확인했다. material/instanceID가 아니다.

[판독] constructor의 global/baseline/15layer는1 초기화. SetOpaque(float)006eb70은16float 전체, SetOpaque(index,float)006eb8c는 해당 layer만(range 검사 없음),006eba4는 raw global258을 쓴다.0093d10의 외부float+310과 ModelBase Transparency/DitherTransparency setter도 연결된다. `mdl_model_opaque` 문자열→+310 binding C xref는 확보하지 못해 이름 대응을 확정하지 않는다.

[미확정] 실제5게임 global float/SetOpaque 갱신·GraphicsLayer overwrite 호출 순서·draw별20c 값을 공급해야 한다. 기본1 생성만으로106재질 runtime opacity1을 확정하지 않는다. graph.ts의 `modelOpacity→1.0`은 근사 유지, 엄격 G16/G22 3재질은 pending. 직접식28·baseline78은 동일 원본 float 계약의 검증 대상이다.

### 32.4 누락 _c0·검증

[판독] G01 griddle grass는344정점/258삼각형, POSITION/NORMAL/TANGENT/TEXCOORD_0만 있으며 원본 export가 custom attribute를 보존하므로 단순 이름 손실로 보지 않는다. `06db430→06db9e0→06dbb00` lookup 실패 후 `_internalNeedToBindAllVertexBuffer(08647b0)=0`이므로 항목을 제거하고 dummy buffer를 붙이지 않는다. VertexAttributeStateInfo::SetDefault는 descriptor 초기화다.0885260의 attribute hole 기본 설정은 외부 NVN `nvnVertexAttribStateSetDefaults`로 이어진다.

[미확정] **CPU descriptor 경로는 확정**, 외부 driver의 최종 Color0.xy fetch값과 bind 수명은 main C에서 확보하지 못했다. 0/1 buffer 또는 requiresAttributes 제거 근거가 아니다. G03/G13 스테이크 stride0x40,+30의 aux/h/w/side 생성은 기존 mg0508 createMeshPost 판독을 재사용하고 정적 grass에 적용하지 않는다.

[데이터] Node805는 opacity 음수/NaN/signed-zero, Model 합성/transpose, instance54→50 compact bytes/translation,Mode flags의 **합성 산술·패킹 검사**. 실제 Entity/레이어/instance 시퀀스·NVN fetch·GPU/화면·NEON fused bit 동일성 시험은 아니다. 기존 shader605·runtime54 표본과 별도 집계한다. C4파일 함수수9/9/7/15=40과 전체주소/원본batch/SHA는 영구 JSON의 cpuCArtifacts에 보존했다. API등록087ef00은 기존effect_runtime_b11.c를 재사용하여 새 C에서 제외했다.

근거 C: [Model9](../../../analysis/decomp/shader_vs_model_producers.c), [Opacity9](../../../analysis/decomp/shader_vs_opacity_producers.c), [native attribute7](../../../analysis/decomp/shader_vs_native_attributes.c), [instance15](../../../analysis/decomp/shader_vs_instance_producers.c). INDEX 통합은 부모/A 담당이다.

## 33. 분담 후속 통합 준비도·사용자 확인 필요

[데이터] §29~32는 원본 공급 근거를 늘린 **분석·문서 후속**이다. 사전27·신규70반영·36대기(5판독/65근사), 게임별 pending17/3/10/4/2는 변하지 않는다. 최초 pending106→36 집계와 후속 CPU 증거 확보를 별도 집계한다.

| 영역 | 원본 근거 확보 | 남은 웹 공급/외부 증거 |
|---|---|---|
| World | 생성0·등록·gate·0/4 각counter·upload·해제 | owner epoch·Core callback timing/frame step·Stage lifetime 대응 |
| Model/Mode/Opacity | E×local/instance branch·transpose·record packing·GraphicsLayer별20c 식 | draw별 실제 값/갱신·instance writer/culling 순서·외부NVN missing Color0.xy |
| Layer+Z/P7.y | 751d0→Layer220 raw +Z·draw yaw·cliff FMAB2002값 | socket scale/draw q·native animation start/step/loop 웹 대응 |
| env/array/fog | descriptor59·metadata7·array3 CPU fallback·G27 coefficient/cube slot/view | 확정한 원본 mip/state·array layer의 웹 공급·비정규화N·2D TIC/array TEX GPU 불일치·native cube explicit LOD |
| capture/stencil | 요청·RT weak ref·binding·직접handle/좌표writer·feedback | upstream RT snapshot/view format·View120..15c depth/Y·bit80 write/copy·flags 종료·fence |

[미확정] “CPU producer 전체 부재”를 남은 원인으로 반복하지 않는다. 검증할 대상은 표의 구체적 웹 공급과 외부 경계다. 사용자 확인 필요는 **게임별 기존 외형 체크 목록과 실제 장면/GraphicsLayer 입력 선택**이며, tint·임의 보정값 승인을 요구하는 항목이 아니다. Model/instance/Opacity1·원본없는 Color0 상수·World ms 치환·fog PMREM/추가mip를 근거 없이 확정하지 않는다.

[데이터] 이번 후속 검증: 원본 mg0101 fog 계수 산술641/641(max5.960464477539063e−8),FMAB2002값(max2.220446049250313e−16); 담당 Node env/array440/440,VS805/805,capture2/2. 문서 UTF8·fence·근거링크 및 계약 JSON 파싱 확인. capture C 전달 당시/현재 해시가 달라 원본batch의 **11함수 코드 토큰 일치**를 확인하고 전달·현재해시를 함께 보존했다(005a0d0 batch의xref 출력꼬리는 본문 밖으로 분리). 런타임 후속 변경이 없어 전체시험/tsc/build를 재실행하지 않았으며 §27의 기존 증거 범위를 확대하지 않는다.

