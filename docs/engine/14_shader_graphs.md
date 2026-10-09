# 14. 셰이더 그래프 판독·해시 사전

2026-10-09. 담당: shader-graphs. [데이터] 최초 선정 manifest 기준 107개 중 광장 재사용1·pending106. 현재 사전 적용52·기존 광장1·pending54(§18). 옵션 전체 튜플의 고유 수 27개. 같은 해시라도 표준 조명·옵션·샘플러 배치로 SASS 전체가 달라지므로 프로그램 바이너리 일치를 그래프 식 일치로 혼동하지 않는다.

## 1. 범위·근거

대상: mg0508·mg0106·mg0101·mg0122·mg0102. 원본·extracted는 읽기 전용. 광장 §6.8·NPC §6.11·포스트 §6.13, stage3d §5, 03_graphics·07_camera_lighting·mg0508 §6.10·§7.1을 먼저 재사용한다. 광장·캐릭터 기존 동작과 common_system_audit.md는 수정하지 않는다.

## 2. 공통 노드·수치 규칙

[판독] 텍스처 핸들은 Material[0x10·i]의 실제 샘플러 위치로 읽는다. sass_dis.py의 @주석은 낮은 핸들에서 한 칸 밀리므로 uniform·bfsha 배치로 확인한다. f32 즉시값은 비트를 해석한다. FFMA는 곱셈+덧셈의 단일 반올림 의미로 판독한다. GLSL ES 3.00의 곱셈·덧셈이 실제 GPU에서 항상 FFMA로 합쳐지는지는 [미확정]이며 표본 오차를 별도로 검증한다. SNORM은 표본 2x−1, sRGB는 기존 텍스처 색공간을 따른다. SRT·바람·마스크·overlay·fresnel·알파·노멀 재구성은 기판독 함수를 재사용한다.

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
| 정수 시간 위상 | `t=uint(World[0x4])`, `hi=(t·0x6c16c16d)>>32`, `q=(((t−hi)>>1)+hi)>>8`, `rem=t−360q`, `phase=0.5+0.5·sin(f32(rem·f32(0x3c0efa35)))` | SASS XMAD 고위 곱·SHR8·XMAD −360·FMUL32I·SIN·FFMA. `uint(mpjMs)%360u`는 정수 산술 식을 보존한다. CPU 시간 단위는 기존 stage3d §5 계약 [근사]. |
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
| G01 | `9c5e8f149831` | 0 / 2522730817 | mg0508:2 · mg0101:5 · mg0122:3 = 10 | 6/4 | 대기 |
| G02 | `2c34a0229931` | 0 / 3705221208 | mg0508:2 · mg0101:5 = 7 | 3/2 | 대기 |
| G03 | `bc3fe3ddd093` | 0 / 3775346869 | mg0508:1 = 1 | 1/1 | VS 기판독·FS 대기 |
| G04 | `fee875dca3a0` | 0 / 4174155460 | mg0101:1 = 1 | 1/1 | 대기 |
| G05 | `dea054f523d0` | 1147244367 / 0 | mg0102:1 = 1 | 1/1 | [판독] 적용 |
| G06 | `ca378536ee77` | 1186080263 / 0 | mg0508:2 = 2 | 1/1 | 대기 |
| G07 | `946028a7e0b5` | 1261704893 / 3482022062 | mg0101:3 = 3 | 2/1 | 대기 |
| G08 | `c175e471e305` | 1807808248 / 0 | mg0106:1 = 1 | 1/1 | 시간 [근사] 적용 |
| G09 | `bbb6e9c88098` | 1946182249 / 0 | mg0101:24 = 24 | 2/1 | 대기 |
| G10 | `3a65d35502c8` | 1992714971 / 0 | mg0101:5 = 5 | 5/1 | 대기 |
| G11 | `44796e19c05e` | 2077426685 / 0 | mg0102:14 = 14 | 5/2 | 대기 |
| G12 | `9d05fd698138` | 2202427043 / 0 | mg0106:1 = 1 | 1/1 | 시간 [근사] 적용 |
| G13 | `89e186140f1a` | 2248262712 / 3775346869 | mg0508:6 = 6 | 2/1 | VS 기판독·FS 대기 |
| G14 | `cb300dff746e` | 2265242073 / 0 | mg0106:1 · mg0101:1 · mg0102:1 = 3 | 1/1 | 대기 |
| G15 | `a5dd50093abf` | 2440083947 / 0 | mg0122:1 = 1 | 1/1 | 대기 |
| G16 | `bd2db7abea44` | 2596196817 / 0 | mg0508:2 = 2 | 1/1 | 대기 |
| G17 | `1457a8f1634c` | 2653408627 / 0 | mg0508:2 = 2 | 1/1 | 대기 |
| G18 | `dbe3081fc6eb` | 3035261389 / 0 | mg0106:1 = 1 | 1/1 | 대기 |
| G19 | `e8e6f3c1404a` | 3267081006 / 0 | mg0101:2 = 2 | 2/2 | 대기 |
| G20 | `d6603c02ac54` | 3337753583 / 537144484 | mg0101:6 = 6 | 1/1 | 대기 |
| G21 | `9624dc558047` | 3483203703 / 0 | mg0106:1 = 1 | 1/1 | 대기 |
| G22 | `19686cbb8cc0` | 3942598924 / 0 | mg0508:1 = 1 | 1/1 | 대기 |
| G23 | `e08920785b49` | 4060002986 / 0 | mg0101:2 = 2 | 2/1 | 대기 |
| G24 | `a38d96c3e7f4` | 4221260974 / 3548160070 | mg0122:1 · mg0102:1 = 2 | 1/1 | 대기 |
| G25 | `0d49812d1426` | 577305732 / 0 | mg0102:2 = 2 | 2/2 | 대기 |
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
| mg0508 | 18 | 18 |
| mg0106 | 5 | 3 |
| mg0101 | 56 | 15 |
| mg0122 | 8 | 7 |
| mg0102 | 19 | 11 |

## 9. 사용자 확인 필요

- [미확정] World 시간·Layer 환경 값은 기판독 계약 범위에서만 적용한다. SASS 식과 CPU 바인딩 근거가 없는 부분은 사전 pending으로 남긴다.
- [근사] 표준 조명·IBL·굴절·런타임 정점 속성 생성은 기존 stage3d 수준을 유지한다. 사용자 외형 확인은 게임별 적용한 식이 확정된 뒤 항목을 적는다.

## 10. 직접 담당 판독 결과·API 한계

| 묶음 | 상태 | 식·근거 |
|---|---|---|
| G05 FS1147244367 | [판독] | Hologram p54 FS: n=normalize(v1), V=normalize(View[0x160]−v0), a=pow(clamp(n·V,0,1),P0.x)·Model[0x20c]; RGB=c0.rgb·(c0.rgb·material_base_color+material_emissive_color_scale·material_emissive_color)·P0.y. VS 마지막 v14.xyz=Color0.xyz; VS 그래프0. |
| G08 FS1807808248·G12 FS2202427043 | [판독]·시간 [근사] | p122/p125 명령 전체 동일. A=T(sg_utility_texture2d0,uv0).rgb, B=T(sg_utility_texture2d1,uv1).rgb, q=B·(A+C0.rgb)·P0.x; RGB=mix(q,C1.rgb,P0.y)+(0.5+0.5·sin((World[0x4]%360)·f32(0x3c0efa35)))·mix(A.x,B.x,P0.x)·C0.rgb; α=Model[0x20c]. 실제 raw c11[0x130/0x140]=BFSHA sampler18/19=utility0/1, VS v10=a_Uv0.xy·v11=a_Uv0.zw. World[0x4] CPU 시간 단위는 기존 mpjMs 계약 [근사]. |
| G14 FS2265242073 | 식 [판독]·적용 [미확정] | 화면 위치→Layer 화면범위 정규화→깊이 Layer[0x4f0] texelFetch→View[0x120..0x15c] 역투영→(Model[0x1c0..]−world)/Model[0x1e4] 거리→utility0(u=clamp(length/radius,0,1),v=0.5)×base_color, α=Model[0x20c]. GraphDef에 캡처 깊이·뷰 역행렬·모델 반경 입력이 없어 pending 유지. 모델 표면 worldPos로 치환하지 않는다. |

G05/G08/G12는 static_opt_shading_type=0의 최종 RGB이므로 baseColor에 식을 넣고 emissive=0으로 기존 발광의 중복 가산을 막는다. G08/G12는 원본 state_type=2 더하기를 유지한다. G05는 원본 정점색과 재질값의 곱이며 임의 색 보정이 아니다. ModelOpacity=1은 기존 graph.ts 계약의 [근사]이다.

최초 직접 담당 단계에서는 27개 옵션 튜플 레코드 중 위3개만 적용했다. 현재 적용·대기는 §18이며 원본식 단계 레코드로 SASS 경로·프로그램 변형·원본 옵션을 보존한다. `shader_graph_patterns.py`가 두 탐조등의 같은 식을 한 함수로 생성하며, `shader_graph_dictionary.py`가 키·옵션·상태·필수 sampler를 검증하고 대상 samplerAssign으로 재결합한다. 사전 조회 오류는 변환을 실패시켜 조용한 원본 오배정을 막는다.

### 10.1 정점색 선언 결합

G05의 mul_vertex_base_color=1과 GraphDef.c0가 `_c0`를 각각 선언한다. 비동기 graph 적용 순서가 달라도 GLSL 선언은 하나여야 하므로 graph.ts와 material.ts의 두 onBeforeCompile에서 이미 선언한 attribute 줄을 중복하지 않는다. 그래프는 emissivemap 뒤 원본 최종 RGB를 덮고 표준 정점색 곱은 그 앞 map 단계에 남는다.

## 11. 중간 검증·외형 확인 항목

[데이터] 직접 담당 첫 통합: 고유 조합27 중 판독1·시간 바인딩 근사2·대기24, pending106→103(표 §8). 원본 파일·텍스처 픽셀·모델은 동일하며 manifest2개만 변했다. 압축 `--only mg/`는 새 텍스처0·새 소리0·manifest 해시2개 갱신, 10초 완료.

[데이터] 신규 노드 시험416/416, 사전 재사용/오배정 방지·필수 sampler/파라미터 누락0, 원본 SASS RGB/alpha 표본240 최대절대오차1.1920928955078125e−7, GLSL 6/6 컴파일·링크(세 그래프×정점색 패치 순서2). WGL 숨은 컨텍스트에서 **compile/link만** 호출했으며 화면 그리기·촬영은 없다. 이 첫 수치는 시간 위상을 주입한 RGB/alpha 시험이며, f32 시간 상수 재대조 후 정수·SIN 단계까지 확대 시험 중이다.

[데이터] 기존 노드 시험 전체1회: 27파일 중26통과, test_mg_assets1825/1825·test_plaza_world437/437. test_mgmet은 별도 transition 작업의 fade.ts 이동 도중 모듈 없음으로 실패. 첫 tsc통과, 이후 npm run build도 같은 mgmet/fade 미연결2건으로 실패. 해당 파일은 shader-graphs가 수정하지 않는다.

사용자 외형 체크: mg0106 탐조등 두 표본의 색 혼합·밝기 위상, mg0102 홀로그램의 정점색·시선 각도별 알파, mg0508/mg0101/mg0122는 첫 통합에서 새 식 적용 없음. [미확정] 시간 CPU 단위·실제 화면 모양은 이 시험으로 확인되지 않는다. 병렬 판독 결과는 문서 본문에 식·근거를 먼저 적고 사전·시험으로 반영한다.

[데이터] 시간 상수 원본 비트 대조 수정 뒤 확대 시험593/593: 위상 상수 비트1건·uint 정수 나머지11경계·시간/SIN176표본·RGB/alpha240표본을 포함하며 최대절대오차1.1920928955078125e−7, GLSL컴파일/링크6/6. 현재 사전 적용3개를 유지하고 다른 담당 결과 대기 중이다.

[데이터] transition 담당의 연결 수정 후 `test_mgmet` 218/218 재검증, `tsc --noEmit`·`npm run build` 통과. 전체 최초 실행의 실패1건은 이 재검증으로 해소했다. VS 담당의 중간 수치 파일은 6묶음×100표본+깊이 clip5표본이며, 최종 단계식이 도착하기 전에는 사전에 승격하지 않는다.

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

[미확정] FS C 세 조합은 VS 결과와 결합 전 pending. 원본 IBL cube/LOD·ModelOpacity·G27 화면 color/depth 캡처·View 역투영·안개 입력을 보존한다. G07/G20 read_under_water=0인데 기존 patchWater가 water_enable만으로 muddy 합성을 붙여 원본 결과를 가리는 차이를 확인했다. 해당 조건 수정 여부는 원본 옵션과 공용 시험을 확인한 뒤 결정한다. C 담당 중간 numericValidation은 실행 예정이며 통과 수로 세지 않는다.

[데이터] 사용자 우선순위: G09(24) → G11(14) → G01(10) → G02(7) → G10(5), 합60재질. 먼저 이 다섯 전체 조합의 FS/VS·공용 런타임 상태를 해소한다. 위 A·C 원본식과 후보는 사전 stages.fs에 보존하고 전체 pending은 유지한다.

## 13. 우선 G11 옵션 분기·샘플러 조건 설계

[판독] ndv=sat(N·V), noise=T(utility1,srt0(uv0)·P0.z).r, film=T(utility0,(fract(ndv+noise),0.5)).rgb, k=pow(1−ndv,P0.y)·P0.x. base=mix(B,film,k)이며 k를 임의 clamp하지 않는다. B는 원본 base_color_texture/mul_base_color 옵션에 따라 albedo·base_color·mul_base_color를 선택한다. thin-film은 발광 가산이 아니다. PBR·노멀·sRGB는 기존 경로를 재사용한다.

[데이터] 14재질·FS5변형. utility0/1 둘 다 할당된 spco_05_up_mt·spco_05_under_mt·spco_01_mt·spco_00_under_mt·spco_00_up_mt 5개만 반영 후보. 나머지9개는 원본 미할당 sampler 기본 바인딩이 미확정. null을 검정 표본으로 치환하지 않는다. 담당 Node 검증은 최종 JSON의 passed 수치를 사용한다.

사전 확장: 전체 해시 키는 그대로 유지하고 graphVariants에 순수 원본 옵션 selector·requiresSamplers·status·GraphDef를 저장한다. 조회에 대상 FRES를 넘겨 selector 완전 일치+필수 sampler 실제 비null인 분기만 선택한다. 불완전 분기는 None으로 남겨 기존 pending 경로로 간다. 복수 분기가 겹치면 오류다. 재질 이름으로 고르지 않으므로 다른 아카이브에도 재사용한다. program=graph:<tupleSHA>:<selectorSHA>로 분기별 GLSL 캐시 충돌을 막는다. record status=partial은 일부 재질 반영이며 전체14 완료를 뜻하지 않는다.

[근사] 위5개도 기존 stage3d ModelOpacity=1·PBR/IBL 근사는 남는다. 새 틴트·시간·opacity 상수를 추가하지 않고 명시된 기존 계약에서 판독한 baseColor만 반영한다. G16/G22 엄격 후보는 뒤 우선순위에서 원본 모델 불투명도 바인딩을 별도 해결한다.

[데이터] FS C 최종 보고: 노드 수치320표본 통과·의존성76검사 누락0. 원수치·전체식·캡처/IBL/ModelOpacity 차단은 사전 stages.fs와 shader_fs_c.json에 보존. 후보를 적용하기 전 VS·water 합성 조건을 검증한다.

## 14. 우선 G09 화면 입력 설계

[판독] U=(pixelXY−Layer470.xy)·Layer488.xy, screenUV=clamp(U,0,1−Layer458.xy); baseColor=T(_a0,uv0).rgb·(C1.rgb+(C0.rgb−C1.rgb)·T(utility0,screenUV).rgb). 마스크는 RGB 각 채널이며 P0.x는 이 식에 쓰지 않는다. 24재질·FS2명령변형의 그래프 의미가 같다. 표준 normal/roughness/metallic/ao는 덮지 않는다.

GraphDef 조각식의 새 이름 screenUV는 필요한 그래프에서만 uniform을 선언한다. material.onBeforeRender가 현재 물리 viewport=(x,y,w,h)를 공급하고, 조각 위치를 `(gl_FragCoord.x−x,h−(gl_FragCoord.y−y))`로 좌상단 원점으로 바꾼다(03_graphics UV·PNG 첫 행·flipY=false 계약). viewport 역크기와 한 픽셀 edge로 `clamp(local/w,h,0,1−1/(w,h))`를 계산한다. viewport 변경 때 uniform 갱신을 보장한다. 원본 표준 재질·광장 그래프에는 screenUV가 없어 새 경로를 사용하지 않는다.

[근사] 원본 Layer470/488/458 CPU 갱신 함수가 아직 확보되지 않아 현재 그리기 viewport·그 역크기를 웹 대응으로 사용한다. 한 픽셀 edge와 캡처/분할 viewport의 원본 범위는 사용자 확인 필요에 남긴다. 모델 UV·worldPos·상수 마스크로 바꾸지 않는다. 원본 screen 식 산술은 판독, 웹 입력 대응은 근사이며 runtime 완전 동등성으로 세지 않는다.

[데이터] G11 FRES 재확인: 14개 모두 texture_srt0=1·pbr_uv=0, SRT scale1.5~25, P0.x=0.57~2로 활성 강도다. 미할당9개를 강도0으로 간주할 수 없다. slots 자체가 FRES samplers에 없으며 converter의 null 표본 기본값은 원본 fallback 근거가 아니다. sampler0/1 모두 실제 할당된5개만 분기 조건을 통과한다. 원본 null fallback을 정의한 CPU 코드가 추가 필요하다.

## 15. 우선 G01·G02 원본식·입력 상태

[판독] G01은 광장 grass_card와 같은 VS2522730817 단계식을 재사용. E=ENV0(Layer120, CPU 07_camera_lighting 정정 근거), U=u32 World4, D=f32(E.y·1000), phase=float(U%uint(D))/D. W.xz·0.1·E.x를 각(−E.z−45)°로 회전 후 frac(+phase), 잡음R·E.w=amp. deltaWorld=amp·(sin(E.z°),0,−cos(E.z°))·c0.y+amp·비정규화 nrmW·c0.x. 법선 자체는 변위로 다시 계산하지 않는다. 기존 광장 ENV1 연결은 변경하지 않는다.

[데이터] env_sg_utility_texture2d0에서 manifest.windNoise로 이미 원본 이름을 보존한다. mg0508/mg0101/mg0122 ENV0=[15,2,0.5,0.012]/[5,2,25,0.35]/[1,0.8,1,0.07], noise=leafnoise00/windnoise00/grass00_noise. G01 10재질 중 mg0508_griddle의 grass00_mt만 attribAssign._c0가 없으며 기본 정점값 미확정. 잡음 handle Layer10·시간 CPU 추가 추적은 VS 담당 소유다. 원본 정점색을 임의0/1로 만들지 않는다.

[판독] G02: c=c0.xyz·f32(0x3c23d70a), D=E.y·100, ph=float(U%uint(D))/D+(c.x+c.z)E.x. pivot=Model100..12c·vec4(c,1)+instance.translation. axis=normalize((sin((E.z−45)°),0,−cos((E.z−45)°))), theta=sin((2ph−1)π)·E.w·20°. deltaWorld=pivot+Rodrigues(axis,theta)(W−pivot)−W. c0.w 미사용·법선/탄젠트 회전 없음. 현재 mesh.modelMatrix를 원본 Model100으로 간주하면 Shape/뼈 변환이 두 번 적용될 수 있어 아직 대기7재질. 실제 모델 행렬 공급은 VS 담당 추가 추적 중이다.

[데이터] VS605표본·순서회귀1·GraphSource6검사 통과. 원본식 판독과 입력 공급은 구별한다. G01/G02가 추가 추적 중인 동안 우선5 G10의 이미 완성된 FS 결합을 진행한다.

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

G27 물속 color/depth 캡처·역투영·안개, G06 스텐실 캡처, G13/G14 깊이 복원, G17/G26 texture array, G18/G21/G23 추가 Layer 입력, G24 VS 깊이/varying은 대기다. 이들은 원본식을 사전에 보존하되 대규모 렌더패스나 미확정 바인딩을 상수로 대체하지 않는다.

## 18. 현재 반영·검증 집계

[데이터] 초기 pending106 중 사전 반영52·남음54. 기존 광장 재사용1을 포함한 static_graph107은 53반영·54대기. 사전 키27개, 단일 정의8개·조건부 정의4개(원본 옵션+sampler 실제할당); 전부 적용되는 묶음11개·부분적용 G11 1개·전체 대기15개. 판독한 식과 런타임 지원 여부를 별도로 저장한다.

| 우선 | 전체 | 반영 | 남음 | 현재 전체 상태 |
|---|---:|---:|---:|---|
| G09 | 24 | 24 | 0 | 색 식 판독·screen 입력 근사; viewport 변경 노드 회귀 통과 |
| G11 | 14 | 5 | 9 | 옵션 분기 완료·9개 원본 null fallback 추가 추적 중 |
| G01 | 10 | 0 | 10 | ENV0 정정·식 보존; 잡음/시간 추가 추적·누락 _c0 1변형 |
| G02 | 7 | 0 | 7 | 중심회전 식 보존; 원본 Model/Mode 공급 추가 추적 |
| G10 | 5 | 5 | 0 | packed/detail·globalAO 분기·AO replace 완료 |

[데이터] 판독 식을 직접 공급하는 단일·조건부 정의 전체는 G04/G05/G07/G08/G09/G10/G11/G12/G15/G19/G20/G25. 원본식 분류 판독5재질(G04 1·G05 1·G15 1·G19 2), 기존/새 입력 근사47재질. 이는 원본 전체 PBR·모델 알파까지 정확하다는 수치가 아니다.

[데이터] 통합 노드1722/1722, RGB/alpha304·시간/SIN176·screen5 SASS 표본, 직접 판독 표본 maxAbsError1.1920928955078125e−7. 현재 적용52재질 각각 패치순서2를 GLSL compile/link104/104로 검증했다. sampler/raw/필요 uv1/uv2/uv3/c0 누락0. 사전 옵션 중복·잘못된 키·미할당 sampler·다른 아카이브 재결합·selector별 cache key를 코드 시험으로 검증한다.

[데이터] 공용 회귀: test_mg_assets2007/2007(참조2301·없음0, GLB131·문제0), test_plaza_gl60/60(가짜 renderer, headless 없음), test_plaza_world438/438, tsc 통과. 기존 전체 최초27파일 실행의 mgmet 실패1건은 transition 수정 후218/218로 해소. shader_graph_compile.py는 실제 NVIDIA OpenGL compile/link만 호출하며 그리기·촬영은 없다.

[데이터] 병렬 판독 수치: FS A503·digest13; FS B/F5034·SASS17; FS C320표본·maxAbsError4.172325134277344e−7·의존성76; FS D/E/G3968·GraphSource20, G11은640비교·max1.1920928955078125e−7; VS605·순서회귀1·GraphSource6. 표본·비교·의존성 단위를 섞어 한 성공 개수로 합산하지 않는다.

사용자 외형 확인: mg0101은 화면 마스크의 영역/크기·packed 표면 세부노멀·roughness·AO·수면/폭포 흐름 및 RGB 노멀, mg0102는 thin-film5재질의 시선색·스캔2재질·홀로그램 알파, mg0106은 탐조등 두 식의 색/위상, mg0122는 나무줄기 높이·시선 림 발광. mg0508은 현재 새 반영 없이 기존 상태다. 원본 viewport edge/분할·시간 CPU 단위·ModelOpacity·PBR/IBL 차이는 사용자 확인 필요에 유지한다.
