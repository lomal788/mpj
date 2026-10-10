확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 [실행]은 없다. 재구현 계산은 "재구현 계산"이라고 따로 적는다.

# LOD — 메시 단계·화면 비율 선택·카메라·임포스터

2026-10-09. 원본은 Super Mario Party Jamboree US v0. 주소는 모듈을 명시하며 main의 기본 베이스는 `0x7100000000`이다. 원본 실행 없이 기존 분석을 재사용하고 비어 있던 LOD 소비 경로를 정적 판독했다.

## 1. 범위와 기존 문서 연결

| 기존 명세 | 이 문서에서 재사용하는 확정 범위 |
|---|---|
| [03_graphics.md §4.3·§4.4·§6](03_graphics.md) | FRES 9 셰이프·버텍스·재질 구조, 전수 통계, 컨테이너와 가시 재질의 구분, glTF 변환 |
| [07_camera_lighting.md](07_camera_lighting.md) | Camera의 투영 타입·near/far·뷰 행렬·FSNB 적용. 카메라 수식을 다시 분석하지 않음 |
| [09_character.md §3.2·§4.2](09_character.md) | 모션 평가 순서, 일반/경량 캐릭터 데이터 경로 선택. 스키닝 수식은 별도 문서 범위 |
| [10_split_screen.md §2·§4·§5](10_split_screen.md) | 레이어별 정규화 viewport, draw용 보정 카메라, 분할 전환·활성 조건 |
| [mg0912.md §6.10.7](../minigame/mg0912.md) | view/low/hide/culling 자원 교체와 플레이어별 영역 마스크 |
| [mg0122.md §6](../minigame/mg0122.md) | 사진/시야 판정의 CameraCullingRange. 렌더 메시 LOD와 별개 |
| [mg1810.md §6](../minigame/mg1810.md) | 카메라 z·경계표에 따른 `map_00..04` 뼈 표시/비표시 |

이 문서는 `bex::gfx::ComModelBuffer` 설정→메시/임포스터 목록→임포스터 draw·atlas 선택과, 별도 AnimationModule FSO 평가 생략 경로를 판독한다. 경량 모델의 모든 장면별 호출자, atlas 생성 작업, FSO 우선순위·비용 공급자의 장면별 구현은 전수 조사하지 않았다.

### 핵심 계약

- **[판독]** 일반 메시 LOD는 FRES 셰이프의 여러 Mesh 중 하나를 선택한다. 가시 재질을 교체하는 분기는 확인되지 않는다.
- **[판독]** `render_info_lod_type=0`은 모델 경계구 기반, `=1`은 셰이프 경계구 기반 자동 선택으로 연결된다. 둘 다 이 경로에서 화면 비율 계산을 사용한다.
- **[판독]** 컨테이너의 type와 엔진 `LodMode`는 다른 열거형이다. `LodMode_ScreenRatio=2`이며 type0을 LOD 없음으로, type1을 거리 LOD로 해석하면 틀린다.
- **[판독]** 문턱보다 화면 비율이 **엄격히 작은 항목 수**가 선택 번호다. 이전 번호를 기준으로 한 히스테리시스·전환 시간·두 메시의 교차 페이드가 판독한 선택 경로에 없다.
- **[판독]** 카메라는 레이어의 `Viewport::GetDrawCamera`에서 얻는다. 선택식에는 draw 카메라의 투영 범위와 정규화 viewport 높이가 함께 들어간다.
- **[데이터+판독]** `_light.fmdb`는 별도 모델이며 그 안에도 여러 LOD Mesh가 있다. 일반 모델의 거리 전환 대상으로 자동 연결된 사실은 확인되지 않는다.
- **[판독]** 활성 검사 Q는 모델 전체의 최대 Mesh 수다. 최종 LOD0을 강제하는 bit13은 가시 재질의 `static_opt_geo_decal`에서 생성된다.
- **[판독+데이터]** 임포스터 pass·방향별 atlas 선택·alpha test는 존재한다. 추출한 컨테이너 551재질의 임포스터 enable은 모두 0이다.
- **[판독]** 애니메이션 FSO는 우선순위·평가 비용·예산으로 평가 생략 여부를 결정한다. 메시 번호를 본 수나 고정 평가 간격으로 변환하는 경로는 확인되지 않는다.

## 2. 원본 자료·판독 재현 경로

경로의 루트는 `C:/dev/mpj`다.

| 자료 | 경로·주소 |
|---|---|
| 실행 코드 원자료 | `extracted/exefs/main.nso`, 주소별 직접 읽기용 `main.decomp.bin` |
| main 함수 색인 | [analysis/functions/main.nso.tsv](../../../analysis/functions/main.nso.tsv) |
| 기존 컨테이너 판독 | [ghidra_work/plazaA/out_post_com.c](../../../ghidra_work/plazaA/out_post_com.c), `main FUN_7100093a00`, `FUN_7100093d10` |
| 기존 캐릭터 경로 판독 | [09_character.md §4.2](09_character.md), `analysis/decomp/scene_chardata.c`, `core_b12.c` |
| 기존 FRES 통계 | [fres_stats.json](../../../extracted/converted/graphics/stats/fres_stats.json), `shape.lods`, `mat.renderInfo`, `mat.shaderParam` |
| 추가 main 판독기 | [CoreTool.java](../../tools/analysis/ghidra_scripts/CoreTool.java), 기존 Ghidra main 프로젝트의 읽기 전용 사본 사용 |
| 데이터 판독기 | [graphics_bfres2gltf](../../tools/analysis/graphics_bfres2gltf/README.md)의 `dump`, 기존 BfresLibrary의 `Switch/Model/ShapeParser.cs` |
| 미등록 함수 판독기 | [MgmcommonDecompCreate.java](../../tools/analysis/ghidra_scripts/MgmcommonDecompCreate.java), 읽기 전용 사본에서 함수 시작점 생성 후 판독 |
| GPU 명령 판독기 | [bnsh_sass.py](../../tools/analysis/bnsh_sass.py)의 `bnsh_of`·`stage_code`·`disasm`, 기존 `F:/dev/mps/tools/nvdisasm_12.4/nvdisasm.exe` |

판독 결과는 `%TEMP%/mpj_lod_*.c`, 대표 데이터와 임포스터 전수 기록은 `%TEMP%/mpj_lod_{samples,type1,impostor_data}.json`, GPU 명령은 `%TEMP%/mpj_lod_{impostor,impostor_inst,impostor_fog,impostor_fog_inst}_{1,5}.sass`다. 영구 근거는 위 원자료와 본문 주소다. main 주소는 `main.decomp.bin`에서 베이스를 뺀 offset으로 대조한다. 아래 명령을 기존 읽기 전용 main 프로젝트에 적용해 재생성한다.

```text
CoreTool.java <임시 출력>
  dec:7100093d10:1
  dec:7100067150:1
  dec:71006b4170:0
  dec:71006b41f0:0
  dec:710005dff0:0
  dec:71000702c0:0
  dec:71006e06b0:0
  callers:710006ecbc
  disf:71006b4170
  disf:71006b41f0
  dis:7100068660-7100068800
  dis:7100069430-7100069810
  dec:71006dcff8:0
  dec:7100771100:0
  dec:7100089ac0:0
  vtgot:7101a83de0:12:1
  dec:710080cd70:0
  dec:710080cf00:0
  dec:710080d120:0
  dec:710081c6e0:0

MgmcommonDecompCreate.java <임시 출력>
  710006c6a0 710080da00 710080d2c0 710080d2e0
```

`-process -noanalysis -readOnly`로 실행한다. 프로젝트·원본·변환기는 수정하지 않았다.

## 3. Mesh LOD의 자원 구조

### 3.1 셰이프·인덱스·재질 [데이터]

기존 [03 §4.3](03_graphics.md)의 전수 결과는 셰이프당 Mesh 1개 **31,365**, 2개 **94**, 3개 **1,611**, 4개 **330**이다. 합계 33,400개 중 2,035개에 복수 Mesh가 있다. 컨테이너·fluid 같은 비가시 셰이프도 이 통계에 포함되므로 2,035를 가시 모델 수로 해석하지 않는다.

```text
Shape
  VertexBufferIndex          // 모든 Mesh 단계가 같은 VB 객체를 참조
  MaterialIndex              // 단계별 재질 배열이 아님
  BoneIndex / skin 정보      // LOD 단계별 skeleton 배열이 아님
  Meshes[lod]
    PrimitiveType
    IndexFormat / IndexCount
    FirstVertex
    IndexBuffer
    SubMeshes[]
  RadiusArray[lod]
  SubMeshBoundings[]
```

FRES 9의 `ShapeParser`는 `numMesh`개 Mesh와 같은 수의 radius를 읽는다. 경계 box 수는 `Σ(Mesh.SubMeshes.Count+1)`이다. 이 자원 경계와 §4의 컨테이너 지정 모델 LOD 경계구는 별개다.

**VB 공유가 동일한 정점 집합을 뜻하지 않는다.** 마리오 몸통의 `FirstVertex`는 0/4013/7717/10352다. LOD별 정점 구간이 같은 VB에 함께 들어간다. 실제 인덱스는 `IndexBuffer 값 + FirstVertex`; 작은 단계의 인덱스만 읽고 offset을 버리면 다른 단계 정점을 그린다.

### 3.2 대표 원자료 수치 [데이터]

아래 수는 **IndexCount**다. 삼각형 수는 `IndexCount/3`이다. 컨테이너·fluid 셰이프를 몸통의 삼각형 수에 더하지 않는다.

| 모델·가시 셰이프 | LOD0 | LOD1 | LOD2 | LOD3 | FirstVertex |
|---|---:|---:|---:|---:|---|
| `pc01_mario / mario_body__body_m` | 18,375 | 16,401 | 8,178 | 4,872 | 0,4013,7717,10352 |
| `pc01_mario / mario_face__body_m` | 1,620 | 3 | 3 | 3 | 0,334,337,340 |
| `pc01_mario / mario_hair__body_m` | 930 | 930 | 609 | 432 | 0,208,416,578 |
| `pc01_mario_light / mario_body__body_m` | 15,486 | 7,776 | 4,650 | — | 0,3457,5396 |
| `npc002ar_heyho / heyho_body__body_m` | 6,246 | 3,342 | 1,998 | — | 0,1398,2211 |
| `npc002ar_heyho / heyho_body__quiver_m` | 924 | 642 | 330 | — | 0,274,470 |
| `mg1801_obj00 / mg1801_obj00__lambert1` | 6 | — | — | — | 0 |

모두 triangle list·u16이다. 이 대표 집합에서 같은 Shape의 LOD 간 재질명은 변하지 않는다. 얼굴의 낮은 LOD가 3 인덱스라는 데이터 사실은 CPU에서 얼굴 Shape를 비표시하는 분기와 다르다.

| 데이터 가상 경로 | BEA 내부 파일 |
|---|---|
| `chara/pc/pc01_mario/model/pc01_mario.fmdb` | `extracted/bea/chara~pc01.nx.bea/chara/pc/pc01_mario/model/pc01_mario.fmdb` |
| 같은 경로의 `_light.fmdb` | 같은 model 폴더의 `pc01_mario_light.fmdb` |
| `chara/npc/npc002_heyho/model/npc002ar_heyho.fmdb` | `extracted/bea/chara~npc002.nx.bea/chara/npc/npc002_heyho/model/npc002ar_heyho.fmdb` |
| `mg/mg1801/model/mg1801_obj00.fmdb` | `extracted/bea/mg~mg1801.nx.bea/mg/mg1801/model/mg1801_obj00.fmdb` |

### 3.3 일반/경량 모델 [데이터·기존 판독 참조]

`pc01_mario`와`pc01_mario_light`는 각자 독립된 모델·스켈레톤·재질·VB이며, 각각4단계/3단계Mesh를 가진다. 두 파일 사이를 왕복하는 것이 위 `Meshes[lod]` 선택은 아니다.

[09 §4.2](09_character.md)의 `CharacterDataPath main @0x71002ba2bc`는 호출 인자bit0로 light/m1 경로를 정한다. `ComMatter main @0x71002b03fc..0x71002b040c`는 설정byte+6을 전달한다. 이 경로에는 거리 비교가 없다는 기존 판독을 재사용한다. 장면별 설정+6 쓰기와 장면 진행 중 모델을 재구성하는 조건은 **[미확정]**이다.

## 4. 컨테이너 설정과 ComModelBuffer 필드

### 4.1 설정 읽기·적용 순서 [판독]

가시 `forward_plus` 재질과 별도로 `container/model_buffer` 재질이 모델 설정을 제공한다. `main FUN_7100093a00`은 재질의 render info와 shader parameter 포인터를 캐시하고 `FUN_7100093d10`은 연결된`ComModelBuffer`에 값을 적용한다.

```text
FUN_7100093a00
  render_info_lod_type         -> 설정 객체+0x178
  render_info_lod_screen_ratio -> 설정 객체+0x180
  render_info_impostor_type    -> 설정 객체+0x188
  mdl_* parameter             -> 개별 CPU 파라미터 주소 캐시

FUN_7100093d10
  lod_type 값                 -> FUN_710006f6c4
  ratio RenderInfo+0x10 u16 개수 -> FUN_710006f6cc
  ratio RenderInfo+8 데이터[i]  -> FUN_710006f6d4(s0=value,w2=i)
  mdl_lod_enable != 0          -> FUN_710006f6bc
  center/radius               -> FUN_710006f6e0 / FUN_710006f7a8
  impostor 설정               -> 별도 FUN_710006f828~
```

ratio 데이터 포인터가null이거나 개수가0이면 값 복사 루프를 수행하지 않는다. 복사 함수 자체에는 문턱 정렬·히스테리시스 생성·단계 수 보정이 없다.

| ComModelBuffer 오프셋 | 자료형·의미 | setter/getter main |
|---|---|---|
| +0x4A4 | u8 `mdl_lod_enable` | `FUN_710006f6bc` |
| +0x4A8 | i32 `render_info_lod_type` | `FUN_710006f6c4` |
| +0x4AC | i32 문턱 개수 N | `FUN_710006f6cc` |
| +0x4B0 | i32 강제 번호 F; 음수면 자동 경로 | `SetForceLodLevel @0x710006ecbc`, getter`FUN_710006ecc4` |
| +0x4BC+4i | f32 `render_info_lod_screen_ratio[i]` | `FUN_710006f6d4` |
| +0x4D0/+0x4D4/+0x4D8 | f32 모델 LOD 경계구 중심 c.xyz | `FUN_710006f6e0` |
| +0x4E0 | f32 모델 LOD 경계구 반지름 r | `FUN_710006f7a8` |
| +0x4E4 | i32 자원 최대 Mesh 수 Q의 초기 복사 | 생성자 `FUN_710006c6a0 @0x710006cac8`; 선택 시 읽는 메타데이터는 §4.3 |
| +0x4E8 | u8 임포스터 활성 | setter`FUN_710006f828`, getter`FUN_710006f830` |
| +0x60 | 모델 변환 M | `FUN_710006faa8`은 이 주소를 반환 |
| +0x270 | LOD 활성 검사를 억제하는 런타임 byte | 생성자에서 0; 1로 쓰는 생산자·공식 이름은 **[미확정]** |
| +0x820 | 컬링용 경계구 주소 | `FUN_71000729a8`; 선택용`c,r`과 같은 필드가 아님 |

center/radius setter는 값이 바뀌면`+0x530` dirty bit 배열을 모두 세운다. `ComModelBuffer::UpdateGpuResources main @0x71000702c0`은 해당 중심/반지름을 모델 GPU 버퍼의`+0x300/+0x304/+0x308/+0x30C`에 복사한다. 화면 비율의 선택 번호는 이 값 자체가 아니라 §5의 CPU 렌더 목록 생성에서 결정된다.

### 4.2 대표 설정 [데이터]

| 모델 | type | N·ratio 배열 | enable | 중심 | 반지름 | 임포스터 enable |
|---|---:|---|---:|---|---:|---:|
| `pc01_mario` | 0 | 4: .6,.25,.1,.05 | 1 | (0,.8,0) | 1.2 | 0 |
| `pc01_mario_light` | 0 | 3: .25,.1,.05 | 1 | (0,.8,0) | 1.2 | 0 |
| `npc002ar_heyho` | 0 | 3: .25,.1,.05 | 1 | (0,.6,0) | .8 | 0 |
| `extra/pp00/model/pp00_gate` | 1 | 4: .6,.3,.2,.1 | 1 | (0,.5,0) | 1 | 0 |

`pp00_gate`의 각 Shape는 3 Mesh지만 ratio 배열은 4항목이다. **N과 Mesh 수는 반드시 같지 않다.** 그리기 단계에서 각 Mesh 수에 clamp한다.

기존 전수 통계에서 `container/model_buffer`는 551재질, type0=533/type1=18이다. ratio의 주된 분포는`.25,.1,.05`=202、`.6,.3,.2,.1`=180、`.6,.2,.1`=73、`.6,.3,.2`=27、`.6,.25,.1,.05`=16。`0.9,0.6,0.01,0.1` 같은 비단조 배열도 있다. 데이터를 내림차순으로 다시 정렬하는 처리는 원본 판독에 없다.

type1의 18모델은 `extra/pp00` 4개, `bd/bd05` 3개, `bd/bd04` 5개, `bd/bd02` 4개, `bd/bd01` 2개다. `pp00_gate.fmdb`를 BfresLibrary로 다시 읽고, 전체 551개 type 기록을 직접 읽어 기존 통계 533/18과 대조했다.

### 4.3 자원 Q와 억제 byte의 생산 [판독]

Q는 컨테이너 ratio 개수 N이 아니라 **FRES 모델의 최대 Mesh 수**다.

```text
FUN_71006ab3f0                       // 모델 자원 연결
  model+0x1D8 = 자원 wrapper
  FUN_71006dcff8(wrapper)
    raw FMDL+0x6A: u16 Shape 수
    raw FMDL+0x28: Shape 배열, stride 0x60
    raw Shape+0x5B: u8 numMesh
    Q = max(1, 모든 Shape의 numMesh)
    build 인자+0x20 = Q
    FUN_7100771100(runtimeModel,build 인자,...)
      runtimeModel+0x74 = Q          // i32
    wrapper+0x10 = runtimeModel
  model+0x1E0 = runtimeModel         // store @0x71006ab44c
```

`FUN_710006c6a0`은 모델 `+0x1E0`이 있으면 그 `+0x74`를 컴포넌트 `+0x4E4`에 복사하고, 없으면 1을 쓴다. selector는 모델 메타데이터의 Q를 읽어 `Q>1`을 검사한다(`@0x71000683f0..0x71000683fc`, `@0x7100068674..0x71000686d0`). 따라서 단일 Mesh 모델은 컨테이너 enable만 켠다고 자동 LOD가 활성화되지 않는다. Q=3·N=4 같은 조합은 가능하며 최종 선택은 개별 Shape의 Mesh 수에 clamp한다. 비가시 보조 Shape도 Q 산출 순회에 포함된다.

억제 byte는 같은 생성자의 `@0x710006c7d8: strh wzr,[x19,#0x270]`에서 `+0x270/+0x271`을 함께 0으로 초기화한다. `SetHqEnabled @0x710006f9d0`은 별도 `+0x4A2`를 쓰므로 이 byte와 같지 않다. main text offset `0..0x1300000`의 직접 load/store와 관련 생성자·setter를 탐색했지만 **ComModelBuffer의 +0x270을 1로 만드는 생산자는 미확정**이다. 초기값 0은 확정이나 실행 중 항상 0이라고 일반화하지 않는다.

## 5. LOD 선택식·분기

### 5.1 카메라 공통 입력 [판독]

`main FUN_7100067150`은 레이어 `+0x98`의 Viewport에서 draw 카메라를 얻고 다음 함수를 부른다.

```text
FUN_71006b4170(Viewport+0x1AC 높이, 계산 컨텍스트, drawCamera, 0)
```

`Viewport::SetViewport @0x7100862074`는 x/y/w/h를 `+0x1A0/+0x1A4/+0x1A8/+0x1AC`에 쓴다. 따라서 이 입력은 정규화된 **높이 h**다.

| Camera 필드 | 선택 계산에서 읽는 값 |
|---|---|
| +0xA0..+0xAC | 방향 4벡터를 부호 반전한 n |
| +0xB0..+0xBC | 카메라 위치 4벡터 P |
| +0x1C8/+0x1CC | 투영 bottom/top |
| +0x1D0 | near |
| +0x1E0 | 투영 타입; 3이면 orthographic |

`FUN_71006b4170 @0x71006b4170..0x71006b41e8`의 계산을 필드명으로 정리하면 다음과 같다.

```text
H = (top - bottom) * 0.5 / h
E = dot(n, P)
if projectionType == 3:
  A = 0
  B = H
else:
  A = H / near
  B = 0
```

전역 `nn::bezel::ModelModule` (`main @0x7101C3FFC0`)의 `+0xA0` byte가 0이 아니면 입력 h를 1로 바꾼다. 생성자 `FUN_71006bcc80 @0x71006bcce8`은 이 byte를 0으로 초기화한다. setter `FUN_71006bca3c`는 인자의 bool을 그대로 저장하며, 확인된 main 직접 호출자는 API bridge `FUN_710071a224 @0x710071a2a0` 1개다. 게임 장면의 직접 활성 호출·공식 API 이름·목적은 **[미확정]**이다. 여기서 h·near에 epsilon clamp를 추가하는 처리는 없다.

### 5.2 type0: 모델 경계구 [판독]

일반 모델에서 `F<0`이면 컴포넌트의 모델 변환 M, 중심 c, 반지름 r을 사용한다. affine 변환에 대해 다음과 같이 정리된다.

```text
C = M * (c.x,c.y,c.z,1)
u = (0.57735026,0.57735026,0.57735026,0)
R = r * length(M * u)
D = dot(n,C) - E
if D <= 0:
  k = 0
else:
  rho = R / (B + D*A)
  k = Σ(i=0..11) [rho < T[i]]
```

`0.57735026`은 원본 f32 상수다. M의 세 basis를 해당 상수로 더한 벡터의 길이를 쓴다. 비균등 scale에서 이를 `max(scale)`로 교체하는 것은 원본식이 아니다. 회전만 있거나 균등 scale이면 그 scale 크기와 대응한다.

rho는 구의 투영 면적·픽셀 수·카메라와의 Euclidean 거리와 다르다. perspective에서는 진행 방향의 깊이 D와 near면의 세로 half-range로 계산한다. orthographic에서는 D>0인 한 분모가 H로 일정하다. far와 구의 화면 x/y 위치는 이 비교식에 직접 들어가지 않는다.

### 5.3 문턱 배열과 동일값 [판독]

`FUN_71006b41f0(ctx,2,ratio,N,0)`은 컨텍스트 mode를 2로 쓰고 문턱 N개를 복사한다. 남은 칸은 `0xFF7FFFFF`(−FLT_MAX)로 채워 **총 12개 비교**를 수행한다. 다른 mode의 패딩은 +FLT_MAX이지만 이 ComModelBuffer 경로의 인자는 항상 2다.

선택은 배열을 앞에서 읽다가 중단하는 탐색이 아니라 12개의 엄격한 `rho<T[i]`의 합이다. 중복·비정렬 문턱도 원값대로 취급한다. 일반 유효값에서 패딩은 번호를 늘리지 않는다. 컨텍스트는 12칸을 전제로 하지만 확인한 컨테이너 배열은 1~4항목이며, 12를 넘는 설정의 안전성은 확인하지 않았다.

마리오의 `.6,.25,.1,.05`는 다음과 같다.

| rho 구간 | 계산 k | 임포스터 없는 4 Mesh 셰이프의 실제 번호 |
|---|---:|---:|
| rho≥.6 | 0 | 0 |
| .25≤rho<.6 | 1 | 1 |
| .1≤rho<.25 | 2 | 2 |
| .05≤rho<.1 | 3 | 3 |
| rho<.05 | 4 | 3 |

정확히 `.25`이면 k=1이고, `.25`보다 작아지면 k=2다. 비교·제곱근·division은 원본 f32 연산과 NEON reduction 순서를 따른다. 문턱에 매우 가까운 값에서는 double 계산·임의 허용오차가 원본 번호를 바꿀 수 있다.

### 5.4 type1: 셰이프별 경계구 [판독]

type1의 자동 조건이 켜지면 모델 목록의 32 B 레코드 `+0x18`에 셰이프별 자동 계산 flag를 세운다. 후속 순회는 `ShapeInstance+0xD8`가 가리키는 경계구의 xyz/r을 읽는다.

```text
C_s = ShapeInstance의 계산된 경계구 중심
R_s = 같은 경계구의 반지름
D_s = dot(n,C_s) - E
k_s = D_s <= 0 ? 0 : Σ[rho_s<T[i]]
rho_s = R_s / (B + D_s*A)
L_s = min(k_s, ShapeInstance+0xD0 Mesh수 - 1)
```

이 분기에서 컨테이너의 c/r을 다시 곱하지 않는다. 현재 셰이프 경계구를 사용하므로 대표 구 하나로 모든 셰이프 번호를 정하는 type0과 다르다. 애니메이션 적용 뒤 셰이프 경계구를 갱신하는 생산자 전체는 이번 범위에서 판독하지 않았다.

### 5.5 활성·강제 선택·최종 번호 [판독]

자동/강제 LOD의 상위 활성 조건은 다음 AND다.

```text
ComModelBuffer+0x4A4 != 0
ComModelBuffer+0x270 == 0
모델쪽 추가 resource metadata의 +0x74 정수 Q > 1
N > 0
```

metadata가 없으면 Q=1로 취급한다. Q의 생성과 최대 Mesh 수 식은 §4.3에 적었다. 문턱 수 N, Shape 수, 카메라 수와 구분한다.

- 활성 조건이 false이면 이 경로의 기본 번호는 0, 셰이프별 자동 flag는 off다. 강제 번호도 이 상위 활성 조건을 우회하지 않는다.
- 일반 모델, type0, F<0: §5.2의 k를 기록한다.
- 일반 모델, type1, F<0: 모델 번호 0과 셰이프별 자동 flag를 기록하고 후속 순회에서 §5.4를 평가한다.
- 일반 모델, F≥0: 자동 계산 대신 F를 사용하며 type1에서도 셰이프별 자동 flag를 끈다. 비임포스터 경로의 일부 분기는 먼저 `min(F,N)`을 적용한다.
- 유효한 자동 분기에서 type가 0/1이 아니면 `UnexpectedDefaultImpl`에 진입한다.
- 각 셰이프의 최종 Mesh 번호는 `min(선택번호, Mesh수−1)`이다. 가시 재질 flags의 bit13(`0x2000`)은 셰이프별 자동 계산을 우회하고 최종 LOD 상위 비트를 0으로 쓴다. 생산자는 아래 `static_opt_geo_decal` 분기다.

렌더 목록의 flags는 기존 하위 29bit를 보존하고 `L<<29`로 번호를 담는다(`main FUN_7100067150`, 셰이프별/공통 선택 후속 분기). 단계 수를 넘어선 번호로 Mesh 배열을 읽는 방식이 아니다.

bit13은 레이어 flag가 아니다. `FUN_7100067150`은 재질 인스턴스를 `FUN_71006b562c`로 변환한 그래픽 재질 레코드 `+0xA0`에서 읽는다. 생산자 `FUN_7100089ac0`은 `FUN_710008a730`으로 `static_opt_geo_decal` 옵션을 찾고, 포인터가 null이 아니고 첫 문자가 `'0'`이 아니면 재질 `+0x8D=1`, `+0xA0|=0x2000`을 쓴다(`@0x710008a03c`). 이 조건으로 만들어진 decal 재질의 가시 Shape가 LOD0을 사용한다. 재질명이나 pass 이름만으로 bit13을 추측해 세우지 않는다.

실제 강제 호출 예는 `main sb::pp::Birds::Create @0x71004c3690`의 BL `@0x71004c3994`이며 `SetForceLodLevel(...,2)`다. `FUN_71002ee410`의 호출 `@0x71002ef028`, `FUN_71002f0290`의 호출 `@0x71002f0784`는 0을 지정한다. 후자의 장면 식별은 이번 범위에서 확장하지 않았다. `menu00::ModelBase::SetForceLodLevel @menu00 0x710002ac30`은 모델의 ComModelBuffer로 위임한다.

### 5.6 인스턴스·임포스터 연결 [판독]

추가 변환 배열이 모델 `+0x228`에 있는 경로는 별도 처리한다. 배열 개수는 `+0x70`, 요소 stride는 `0x54`이며 요소 `+0x50`의 활성 byte를 검사한다.

- type0·LOD 활성·임포스터 활성일 때 추가 변환과 M을 합성한 각 인스턴스 구로 §5.2를 계산한다. F≥0이면 각 활성 요소에 강제 번호를 쓴다.
- 각 번호는 4bit로 패킹한다. `byte[j>>1]`, shift=`(j&1)*4`. k≥N 또는 강제 번호가 14보다 크면 `0xF`를 쓴다.
- 일시 버퍼와 `{ComModelBuffer*, 패킹배열*}` 레코드가 임포스터 목록에 들어간다. 일반 모델도 임포스터가 켜져 있고 k≥N이면 `{ComModelBuffer*,null}`을 추가한다.
- 판독한 추가 변환 배열 경로에서 위 조건 밖의 자동 선택은 0으로 귀결되는 분기가 있다. 모든 GPU instancing·개별 pass가 같은 정책이라고 일반화하지 않는다.

`FUN_7100069ba8(배열,j)`는 nibble을 추출하고 `0xF`만 −1로 돌려준다. 임포스터 pass는 이 반환값이 음수인 활성 인스턴스만 그린다(§7.4). 패킹된 0..14는 Mesh 쪽 선택값이며 임포스터 draw 대상이 아니다. 전수 551개 컨테이너에서 enable은 모두 0이므로 데이터에 없는 실행 중 활성화를 전제해 마지막 문턱 아래에서 모델이 사라진다고 해석하지 않는다.

## 6. 카메라별·분할 화면별 선택

### 6.1 레이어와 독립 선택 [판독]

`FUN_710005dff0`은 자기 활성 byte `+0x38`과 연결 레이어 enabled `+0x95`를 확인한 뒤 `FUN_7100067150(자기+0x428의 목록,레이어)`을 부른다(`main @0x710005e03c`). 선택 함수는 매 호출 목록 끝 포인터와 일시 개수 `+0x1D0`을 리셋하고 해당 레이어 카메라로 재구성한다.

LOD를 모델 전역 번호 하나로 먼저 정해 모든 카메라에 재사용한다는 근거는 없다. 같은 모델도 서로 다른 draw 카메라·투영·viewport 높이를 가진 레이어에서 다른 번호를 기록할 수 있다. 강제 번호 F와 컨테이너 설정은 모델 컴포넌트 상태를 공유한다.

[10 §4](10_split_screen.md)의 보정 카메라를 사용한다. 원래 게임 Camera의 FSNB aspect만으로 선택하거나 화면 수에 따라 문턱 배열을 직접 바꾸는 분기는 없다.

### 6.2 정규화 높이의 영향 [판독]

§5.1에서 H는 h로 나누므로 다른 조건이 같으면 rho는 h에 비례한다. 세로 FOV를 f라 하고 일반 perspective의 near면이 대칭이면 `rho=R*h/(D*tan(f/2))`로 정리된다. 이는 원본식의 정리이며 별도 거리 LOD 표가 아니다.

- 좌/우 2분할은 기존 분할 계약에서 h=1이므로 높이 항 자체는 동일하다. draw 카메라의 보정 FOV가 바뀌면 그 변화도 반영된다.
- 균등 4분할은 h=.5다. 보정 뒤 세로 FOV가 같다면 rho도 전체 화면의 절반이다.
- 분할 보간 중에는 현재 viewport 높이와 draw 카메라로 다시 계산한다. 전환 완료 시 한 번만 LOD를 고르는 분기는 없다.
- RT 픽셀 크기·CSS 크기·DPR은 이 식의 직접 입력이 아니다. 같은 정규화 viewport와 투영 조건이면 RT만 2배로 키워도 rho가 2배가 되지 않는다.

### 6.3 재구현 계산

원본 실행 관측이 아닌 식 검산이다. `M=identity`, r=1.2, D=20, 세로 FOV20°, 문턱 `.6,.25,.1,.05`, 임포스터 off, 4 Mesh를 가정했다. 표는 double 검산을 소수 6자리로 표시한다.

| h | rho | k·최종 LOD |
|---:|---:|---:|
| 1 | .340277 | 1 |
| .75 | .255208 | 1 |
| .5 | .170138 | 2 |

h=1일 때 각 문턱과 같아지는 깊이는 `.6→11.342564`, `.25→27.222153`, `.1→68.055382`, `.05→136.110764`다. **같은 FOV·구 크기를 고정해서 역산한 값**이며 원본 상수인 거리 표가 아니다.

## 7. 컬링·애니메이션·자원 갱신과의 경계

### 7.1 컬링과 LOD [판독·기존 명세 참조]

모델 목록 생성은 레이어 visibility mask, 유효 모델·재질, 컬링 구 검사를 먼저 한다. `ComModelBuffer+0x820`의 구를 `FUN_7100776f60`으로 검사하고 통과한 모델의 LOD를 선택한다. 구 반지름≤0은 이 상위 검사를 우회한다. 기본 카메라 frustum와 추가 등록 frustum들 중 통과한 경우를 허용하는 OR 경로도 있다.

`FUN_7100776f60`은 plane count가 0이면 true이고, 어느 plane에서 `dot(plane,C)+offset>radius`이면 false다. 반면 LOD는 rho로 **어떤 Mesh를 그릴지** 고른다. 두 검사의 sphere 필드와 조건을 혼합하지 않는다.

`mg0122 CameraCullingRange`의 방향 내적, `mg0912` 영역 마스크·view/low/hide 교체, `mg1810` 맵 가시성 뼈는 각 문서의 기존 판독을 참조한다. 이를 §5의 FRES Mesh 번호로 대신하거나 far를 LOD 문턱으로 쓰는 근거는 없다.

### 7.2 애니메이션 FSO와 Mesh LOD의 분리 [판독]

Mesh selector는 계산된 모델 변환·Shape 경계구로 렌더 목록을 쓴다. 번호를 다른 스켈레톤·클립·본 수로 변환하는 호출은 없다. 같은 Shape의 LOD Mesh는 같은 skin 정보를 공유한다. 모션→뼈 행렬→렌더 계약은 [09 §3.2](09_character.md)를 참조하며 스키닝 수식은 이 문서에서 재분석하지 않는다.

별도로 **AnimationModule FSO는 애니메이션 평가를 생략하는 스케줄러**다. 여기의 등급·생략 횟수는 Mesh 번호와 다른 상태다.

| 객체·오프셋 | 자료형·의미 | 근거 main |
|---|---|---|
| ComAnimator+0x230 | i64 평가 비용 c | `FUN_710081cdf4` 저장 |
| +0x238 | f32 우선순위 P | `FUN_710080da00` 공급자 결과 저장 |
| +0x23C | u16 연속 생략 횟수 K | `FUN_710080d120`, 0이면 후속 평가 허용 |
| +0x23E | u8 비용 등급 g | `FUN_710080cf00` |
| +0x23F | u8 개별 FSO enable | `SetFsoEnabled @0x710081c670` |
| +0x240 | u8 이번 평가 필요 상태 | `CalculateAndApply @0x710081c6e0` 입구 검사·clear |
| +0x241 | u8 모듈 등록 상태 | 개별 enable 변경 시 등록 수 조정 조건 |
| AnimationModule+0x70/+0x78 | 우선순위/비용·예산 공급자 포인터 | `FUN_710080d00c` |
| +0x80/+0x88 | i64 총 예산 B/선택 평가 비용 합 | `FUN_710080cf00` / `FUN_710080d120` |
| +0x98 | i32 등록된 FSO 활성 animator 수 | `FUN_710080cd30` 증가 / `FUN_710080cd50` 감소 |
| +0x9F | u8 전역 FSO enable | `AnimationModule::SetFsoEnabled @0x710080cb80` |

개별 setter는 enable이 바뀌고 `+0x241!=0`일 때만 모듈 활성 수를 원자적으로 증감한다. 확인한 직접 호출자는 RTTS 설정 적용 `FUN_7100838980`(설정 객체 `+0x250`)과 API bridge `FUN_7100844554`다. 전역 setter의 게임 쪽 호출자 `FUN_710010c4e0`은 1을 전달한다. 이 사실만으로 특정 캐릭터의 개별 FSO가 활성화됐다고 확정하지 않는다.

#### 활성 조건과 공급자 계약

`FUN_710080cd70`은 animator 목록이 비어 있지 않고 전역 enable!=0, 두 공급자!=null, 등록 활성 수!=0일 때 `FUN_710080cf00`을 실행한다. 직전 FSO 실행 상태 `+0x9E`가 1이었다가 조건이 꺼지면 모든 animator의 c=0, P=FLT_MAX, K=0, g=0과 모듈 계측값을 초기화한다. 따라서 전역 off는 직전 생략 상태를 유지하지 않는다. 이후 프레임 진행용 병렬 job은 FSO 분기의 양쪽에서 제출된다. 화면 컬링만으로 게임 tick 전체를 중단하는 경로로 해석할 수 없다.

`FUN_710080d00c`의 호출 순서:

```text
priorityProvider.vtable+0x28()        // 사전 준비
B = costProvider.vtable+0x28()       // 이번 전체 예산
ParallelExecute(FUN_710080da00, animator 수)
  pair = { animator*, animator의 entity* }
  if animator.FSO:
    P = priorityProvider.vtable+0x30(pair)
    c = costProvider.vtable+0x30(pair)
  else:
    P = FLT_MAX
    c = Module+0x9C != 0 ? costProvider.vtable+0x30(pair) : 0
```

비용 공급자 `vtable+0x38`의 반환 bit0는 평가 시간 계측 상태 `Module+0x9D`에 쓰인다. 우선순위 공급자의 구체적 P 생산식은 미확정이다. `FUN_710080cbcc`는 공급자를 `Module+0x70`에 쓰는 2명령 setter이며, raw ARM64와 RVA 포인터 검색에서도 main의 직접 호출·함수 포인터 참조를 찾지 못했다. 모듈 생성자 `FUN_710080c960`은 두 공급자를 null로 초기화한다. 다른 모듈의 연결이나 직접 필드 쓰기까지 없다고 단정하지 않는다.

비용 공급자는 다음 두 구현을 확인했다.

| 구현 | 연결·기본값 | 예산·비용·계측 |
|---|---|---|
| 고정 항목 수 | static 객체 `main @0x7101C42128`, 생성 `FUN_710080c324`, vtable `0x7101A0DBA8`; 모듈 준비 callback `FUN_710080d460 @0x710080d4b8`이 +0x78에 연결 | `FUN_710080c38c`: 객체+8의 i32를 B로 반환; 초기 **32**. `FUN_710080c394`: **c=1**. `FUN_710080c39c`: 계측 off |
| 평가 시간 기반 | static 객체 `main @0x7101C42138`, 생성 `FUN_710080f6a0`, vtable `0x7101A0DD98`; 초기 계수 **.05,.5,.1**, 이전값0 | `FUN_710080f72c`: 아래 적응 예산. `FUN_710080f7e8`: animator+0x228의 직전 평가 시간. `FUN_710080f7f4`: 계측 on. 이 객체를 비용 공급자로 교체하는 호출은 **미확정** |

게임 쪽 `FUN_710010c4e0`은 `FUN_710080cbd4`로 첫 객체를 얻고 `FUN_710080c384(...,0x20)`을 호출해 B=32를 다시 설정한다. 고정 구현의 B는 항목 비용 단위이며 시간이나 삼각형 수가 아니다. 둘째 구현의 c는 `CalculateAndApply`가 system tick 차를 `nn::os::ConvertToTimeSpan`으로 변환해 `animator+0x228`에 저장한 값이다.

시간 기반 공급자의 식은 다음과 같다. 정수 변환은 truncate이며 미확정 프레임 필드는 이름을 붙이지 않았다.

```text
W = FUN_71009926cc() = 3
Uprev = Module+0x88
T = i64 FrameStep+0x10
E = FUN_71009847f8()               // 전역 객체+0x58 - 객체+0x68
lo = trunc(float(T)*객체+0x08 계수)     // 초기 .05
hi = trunc(float(T)*객체+0x0C 계수)     // 초기 .5
reserve = trunc(float(T)*객체+0x10 계수) // 초기 .1
raw = T + Uprev/W - E - reserve
x = raw < lo ? lo : min(raw,hi)
new = x*W
B = trunc((new + 객체+0x18)/2)
객체+0x18 = new
```

이는 다른 구현의 예산 식이다. 초기 연결된 고정 비용 구현과 합쳐 사용하지 않는다.

#### 등급과 평가 예산

`FUN_710080cf00`은 `FUN_710080db00`과 비교자 `FUN_710080d2c0`으로 **P 내림차순** 정렬한다. 원본 정수 division·shift를 보존하면 등급 계산은 다음과 같다.

```text
S = max(B >> 1, 1)
C = 0
for animator in P 내림차순:
  g = FSO ? min(C / S, P < 0 ? 7 : 6) : 0
  C += c                           // 등급 계산 뒤 누적
```

g는 고정 거리 구간이나 `2^g`프레임마다 평가하라는 주기값이 아니다. `FUN_710080d120`은 이 등급별로 다음 선택을 수행한다.

```text
U = 0                              // 실제 선택된 비용 합
맨 앞 g=0 그룹: 모든 K=0, U += c
L = B >> 1
나머지 각 g 그룹:
  K 내림차순 정렬                  // 비교자 FUN_710080d2e0
  L += B >> (g+1)
  for 그룹 내 animator:
    if 그룹 첫 항목 또는 U+c <= L:
      K = 0; U += c
    else:
      K = min(K+1, 0xFFFF)
Module+0x88 = U
```

등급별 첫 항목은 예산을 넘더라도 평가한다. 후속 항목은 예산 검사와 포화하는 생략 카운터를 사용한다. 오래 생략된 항목을 먼저 정렬하므로 고정 등급별 일정 주기와 다르다.

#### 생략이 실제 적용되는 위치

`CalculateAndApply @0x710081c6e0`은 `+0x240!=0`, 전역 상태 검사 2개, entity flag bit2=0, entity 상태=3이라는 입구 조건 후 blend 처리 `FUN_710081cff0`, slot 처리 `FUN_7100814b70`, `+0x240=0`을 먼저 수행한다. **K=0일 때만** 하위 animation node의 `FUN_710081253c` 평가와 entity message `0x5F414E03`을 수행한다. K>0을 모든 모션 시간·slot 처리 정지로 확대하지 않는다.

`CalculateAndApplyImmediately @0x710081c6a8`은 K를 저장하고 0으로 만든 뒤 위 함수를 호출하고 원래 K를 복원한다. 입구의 다른 상태 검사를 우회하는 함수는 아니다. `main @0x710069bd20`, `@0x71006a1530`은 K>0일 때 모델 애니메이션 시간 누적 필드를 유지·증가시키고, K=0에서 누적을 다시 시작하는 명령도 포함한다. 평가를 생략한 시간까지 멈춘 것으로 처리하면 안 된다.

모델 갱신 `FUN_71006c3d98`은 모듈의 직전 FSO 실행 상태+0x9E가 켜지면 우선순위 공급자의 +0x28 준비 함수를 호출한다. `FUN_71006ae6f0`은 모델 flag+0x2C의 bit7·bit8과 ModelModule+0xE0==1에 따라 공급자 +0x38(model)의 bit0로 갱신 허용 여부를 검사한다. 판독한 경로에서 허용되지 않으면 이미 계산된 모델 변환·구 갱신을 건너뛴다. 이 인터페이스가 카메라 컬링과 같은 검사인지, 모든 장면에서 사용되는지, enum `FsoSkipModelCalculationTarget_None/OutOfView/All`의 설정과 연결되는지는 **[미확정]**이다. Mesh 선택 단계의 culling과 이 모델 업데이트 분기를 구분한다. 거리·가시성 P 생산식, 실제 공급자 교체와 개별 캐릭터 enable 값도 미확정이다.

### 7.3 메시·재질·텍스처·셰이더 [판독·데이터]

```text
fmdb Shape.Meshes[] + VB + 동일 MaterialIndex
  -> 모델/셰이프 LOD 번호 선택
  -> 가시 재질별 렌더 목록(flags 상위 3bit)
  -> 해당 Mesh 그리기
```

컨테이너 shader는 `libbex/libbexgfx/resident/shader/container/container.bfsha`, 가시 재질은 `.../material/forward_plus.bfsha`다. 원본 BEA는 `extracted/bea/libbex~libbexgfx~libexgfx_resident.nx.bea/`이다.

같은 아카이브의 `shader/gfxshader/{impostor,impostor_inst,impostor_fog,impostor_fog_inst}.bnsh`가 실재한다 **[데이터]**. 일반 Mesh 번호 선택을 이 shader의 atlas 선택과 동일하게 취급하지 않는다.

단계 변경 때 fmdb/bntx를 새로 읽는 호출은 선택 함수에 없다. 낮은 단계도 같은 모델 자원에 들어 있다. sampler mip와 roughness/굴절 capture의 texture LOD는 별도의 텍스처 표본 선택이다. 이 문서는 [plaza_3d.md](../shell/plaza_3d.md)의 capture LOD·GSAA 미확정을 해결한 것이 아니다.

### 7.4 임포스터 pass·GPU 입력·atlas [판독·데이터]

#### 목록에서 draw까지

```text
FUN_71000517b4: "RenderPassImpostor" 등록
  factory GOT 0x7101A83DD8 -> FUN_710007a524
  생성자 FUN_710007a588
  vtable GOT 0x7101A83DE0 -> 0x71019CE7F0
    +0x28 FUN_710007a838: 목록이 비었는지 검사
    +0x30 FUN_710007a93c: render
레이어 목록: FUN_710006154c -> FUN_7100069ba0(owner+0x188)
  16 B {ComModelBuffer*, nibble 배열 또는 null}
```

레이어 pass 순서는 기존 [10 §5](10_split_screen.md)의 `FUN_71000b5bd0`에 따른 `UnderWater → Impostor → OpaqueNormal`을 참조한다. `FUN_710007a93c`는 공통 코드 `@0x7100063060..0x71000635f0`으로 이어진다. 첫 작업 인덱스 0에서 color/depth target·viewport·레이어 상태를 준비한다. 목록 수 n을 `q=n/3`으로 분할해 작업 0/1은 q개, 작업 2는 나머지를 그린다. **3개 작업은 CPU 명령 작업 분할이며 화면·카메라 수가 아니다.** 별도 인자 `param_4`는 GPU 버퍼 인덱스다.

| 후보 | fog=0 | fog≠0 | draw 조건 |
|---|---:|---:|---|
| nibble 포인터 null | shader ID 0x56 | 0x57 | 일반 모델의 임포스터 후보 |
| nibble 포인터 있음 | shader ID 0x58 | 0x59 | 활성 요소 중 `FUN_7100069ba8(nibble,j)<0` |

fog getter `FUN_710006f88c`는 컴포넌트 `+0x51C`를 읽는다. shader는 `FUN_71000b9d44(ID,variant=0)`으로 bind한다. `FUN_7100071964`로 모델 GPU 파라미터를 bind한 뒤 공통 quad 인덱스 버퍼를 `FUN_710087d014`로 그린다. 인스턴스 배열은 stride `0x54`, 활성 byte `+0x50`을 사용한다. inactive 요소는 baseInstance 순번에 넣지 않는다. 활성 요소의 순번은 Mesh를 선택한 요소도 포함해 증가하고, 임포스터 선택 요소만 그 순번을 baseInstance로 draw한다. 원래 배열 index를 그대로 쓰면 GPU instance 버퍼와 어긋난다.

resident shader loader `FUN_71000b9470`의 이름 테이블은 `main @0x71019D0A20`, 8 B/ID다.

| ID·이름 포인터 슬롯 | 원본 BEA 내부 shader 경로 |
|---|---|
| 0x56 · `0x71019D0CD0` | `libbex/libbexgfx/resident/shader/gfxshader/impostor.bnsh` |
| 0x57 · `0x71019D0CD8` | 같은 폴더 `impostor_fog.bnsh` |
| 0x58 · `0x71019D0CE0` | 같은 폴더 `impostor_inst.bnsh` |
| 0x59 · `0x71019D0CE8` | 같은 폴더 `impostor_fog_inst.bnsh` |

#### CPU 설정→모델 GPU 버퍼

`FUN_7100093d10`의 설정 캐시와 setter, `UpdateGpuResources @0x71000702c0`을 연결하면 다음과 같다. GPU 오프셋은 shader constant buffer `c[7]` 기준이다.

| 설정 이름 | 설정 캐시 | 컴포넌트 | setter main | GPU |
|---|---:|---:|---|---:|
| `render_info_impostor_type` | +0x188 | +0x4EC i32 | `FUN_710006f838` | +0x34C |
| `mdl_impostor_rows` | +0x2C8 | +0x4F0 i32 | `FUN_710006f840` | +0x320 f32 |
| `mdl_impostor_columns` | +0x2D0 | +0x4F4 i32 | `FUN_710006f848` | +0x324 f32 |
| `mdl_impostor_rotation` | +0x2D8 | +0x4F8 f32 | `FUN_710006f850` | +0x328 |
| `mdl_impostor_frame` | +0x2E0 | +0x4FC i32 | `FUN_710006f858` | +0x32C f32 |
| `mdl_impostor_offset` | +0x2E8 | +0x500..+0x508 vec3 | `FUN_710006f860` | +0x340..+0x348 |
| `mdl_impostor_scale` | +0x2F0 | +0x510 f32 | `FUN_710006f86c` | +0x338 |
| `mdl_impostor_rounding_offset_x` | +0x2F8 | +0x514 f32 | `FUN_710006f874` | +0x330 |
| `mdl_impostor_rounding_offset_y` | +0x300 | +0x518 f32 | `FUN_710006f87c` | +0x334 |
| `mdl_impostor_fog` | +0x308 | +0x51C u8 | `FUN_710006f884` | CPU shader ID 선택 |

이름 테이블 `main @0x71019CF8A8`에서 설정 캐시는 `+0x1B0+8i`다(`FUN_7100093a00 @0x7100093c80..0x7100093ce8`). `rows/columns`라는 원본 이름과 shader의 수평/수직 축이 반대다. 위 표의 이름을 관례대로 바꾸면 안 된다.

생성자 `FUN_710006c6a0`의 기본값은 enable=0, type=0, columns=rows=8, rotation=frame=0, offset=(0,0,0), scale=1, rounding=(0,0), fog=0이다. 전수 FRES 컨테이너 551개에서 enable=0, columns=rows=8, frame=rotation=rounding=fog=0, scale=1을 직접 읽었다. offset의 첫 성분도 모두 0이다. 전수 기록만으로 atlas 텍스처 내용이나 실행 중 enable 변경을 증명하지 않는다.

전수 읽기의 구조는 FMAT `+0x50` ShaderParam 배열, `+0x60` 원본 parameter 데이터, `+0x9E` u16 parameter 수다. descriptor stride `0x20`에서 이름 포인터 `+8`, type/size byte `+0x10/+0x11`, 데이터 offset u16 `+0x12`를 읽어 이름별 원값을 대조했다. 대표 파일은 기존 BfresLibrary dump와 일치했다.

#### 방향·프레임 선택과 표본화

4개 BNSH 모두 variant 0의 vertex stage 1·fragment stage 5를 판독했다. 다음 PC는 main VA가 아니라 **shader 명령 offset**이다. 일반 vertex code 블록은 BNSH 내부 `0x2000`, fragment는 `0x2900`; inst fragment는 `0x2A00`이다. 명령은 stage 블록의 SPH `0x80` 뒤에 있다.

vertex는 카메라 위치에서 모델/offset 기준 위치를 뺀 방향을 모델 역변환의 3×3(`c[7][0x100..0x128]`)으로 변환해 정규화한 n을 사용한다. quad 크기는 scale, 위치는 offset으로 조정한다. `PC 0x228..0x4A8`은 `atan2(n.z,n.x)`에 대응하는 GPU 근사 경로이며 `abs(n.x)<0.0001` 등의 특수 분기가 있다. π 상수는 f32 `3.141592741`, π/2는 `1.5707963705`, 방위각의 역 2π는 `0.15915493667`이다. 유한 일반 입력의 근사 다항식은 다음과 같다(`PC 0x398..0x498`). 아래 reciprocal은 실제 `MUFU.RCP`, 연산은 FTZ/FMA다.

```text
r = min(abs(n.x),abs(n.z)) * RCP(max(abs(n.x),abs(n.z)))
z = r*r
numer = z * (z * (-.8233629465*z - 5.6748671532) - 6.5655550957)
den = z * (z * (z + 11.3353881836) + 28.8424682617) + 19.6966705322
v = r + (r*numer)*RCP(den)
if abs(n.z)>abs(n.x): v = π/2 - v
if n.x<0: v = π - v
if n.z<0: v = -v
θ = v
```

선행 조건 `abs(n.x)<0.0001`은 `(float(n.z>0)-float(n.z<0))*π/2`를 쓴다. zero/∞ 특수 조건도 일반 다항식보다 앞에 존재한다. 아래 θ는 이 GPU 결과를 뜻하며 host의 double atan2와 bit 단위 동일하다고 가정하지 않는다.

```text
a = frac(rotation - θ*0.15915493667 + 0.25)
cols = GPU+0x320   // 원본 이름 mdl_impostor_rows, 실제 shader 수평 분할 수
rows = GPU+0x324   // 원본 이름 mdl_impostor_columns, 실제 shader 수직 분할 수
uv = quad의 원래 UV
```

| type | vertex atlas 좌표식 | 분기 근거 |
|---|---|---|
| 0 | `ix=floor(a*cols-roundX)`; `iy=min(floor((.5-.5*n.y)*rows-roundY),rows-1)`; `UV=((uv.x+ix)/cols,(uv.y+iy)/rows)` | 기본 방향의 방위각·높이 격자 |
| 1 | `t=floor(cols*rows*min(a,.9999899864))`; `q=t/cols`; `UV=(uv.x/cols+q,uv.y/rows+floor(q)/rows)` | 일반 VS `PC 0x640` |
| 2 | `ix=floor(a*cols)`; `iy=floor(frame)`; `UV=((uv.x+ix)/cols,(uv.y+iy)/rows)` | 일반 VS `PC 0x660` |
| 그 외 | `UV=uv` | 일반 VS `PC 0x698`; type−1 unsigned의 `min(...,2)` 마지막 case |

그 외 type의 최종 branch는 ALD로 읽은 원래 UV 레지스터를 그대로 출력한다. 수평/수직 분할 수를 곱하거나 나누는 tile 선택 결과를 출력하지 않는다.

type0의 iy는 상한만 clamp하며 하한 clamp는 없다. ix에도 별도 범위 clamp가 없다. type1의 q는 float division이며 x의 정수부는 후속 fract로 제거된다. 이 식들은 유효한 양수 cols/rows와 유한 방향 입력의 연산 정리다. 원본은 atlas 행·열 수가 0인 설정을 이 shader에서 보정하지 않는다.

fragment는 **각 UV 성분의 fract**를 취하고 모델 buffer `c[7]+0xB0`의 bindless texture handle로 RGBA를 표본화한다. alpha가 **0.5 미만이면 KIL/discard**, 통과하면 출력 alpha는 **1**이다. fog shader도 같은 alpha test 후 fog RGB 처리를 한다. 일반/inst fragment는 16개, fog/fog_inst는 54개 non-NOP 명령으로 이 조건이 대응한다. 이 4개 shader에 Mesh/임포스터 LOD 교차 페이드 가중치나 이전 LOD 번호는 없다. 다른 pass의 blend 상태 전체를 조사한 결론은 아니다.

이 pass는 준비된 atlas를 소비한다. main의 enable setter `FUN_710006f828`와 type setter `FUN_710006f838`의 확인된 직접 호출자는 컨테이너 적용 `FUN_7100093d10` 1개씩이다. raw 데이터의 enable0과 대조하면 이 직접 호출만으로 활성 장면이 증명되지 않는다. atlas를 생성·촬영하는 작업과 그 텍스처를 연결하는 장면별 생산자는 아직 미확정이다. CPU 후보 조건은 화면 비율 k≥N이며 GPU 방향/프레임 선택은 별개이므로 두 문턱을 혼합하지 않는다.

[설계] 임포스터 등록과 공유 렌더 패스 경계 정리: [render_unify.md §3·7](render_unify.md).
## 8. 현재 웹 구현과 차이

이 절은 현재 웹 소스의 비교이며 원본 사실로 대체하지 않는다.

| 현재 소스 | 확인된 상태 |
|---|---|
| [GltfExport.cs](../../tools/analysis/graphics_bfres2gltf/GltfExport.cs) | `Opt.Lod` 기본0. `s.Meshes[min(o.Lod,Count−1)]` 한 단계만 glb에 넣고 `FirstVertex`를 더한다. `extras.lods`는 수만 기록하며 전체 인덱스 배열을 보존하지 않음 |
| [mg1801/view/character.ts](../../script/app/minigame/mg1801/view/character.ts) | SkinnedMesh의 `frustumCulled=false`; 원본 화면 비율 Mesh 전환 코드 없음 |
| [stage3d/stage.ts](../../script/app/common/render3d/stage.ts) | SkinnedMesh 컬링 off. 원본 LOD 컨테이너 소비·거리별 경량 모델 전환 미확인 |
| [stage3d/assetLoader.ts](../../script/app/common/render3d/assetLoader.ts) | `texLod`는 KTX2 상위 mip 제거 설정. 모델 Mesh LOD와 다름 |
| [assetcore-three/index.ts](../../script/lib/assetcore-three/index.ts) | GPU 준비 중 임시 `frustumCulled=false`와 복원. LOD 선택 아님 |

**재구현 계산/구현에 필요한 계약:** 복수 Mesh의 인덱스·FirstVertex·공유 VB·재질을 보존하고 컨테이너 type/enable/N/ratio/c/r/F를 별도 상태로 읽는다. 레이어 draw 카메라와 현재 정규화 viewport 높이로 원본식의 k를 계산한 뒤 각 Shape의 Mesh 수에 clamp한다. type1은 현재 Shape 경계구가 필요하다. 근거 없는 거리 표·히스테리시스·일괄 light 교체·애니 update 간격을 원본 계약으로 넣지 않는다.

## 9. LOD가 확인되지 않은 영역과 남은 미확정

| 영역 | 근거·탐색 범위 | 결론 |
|---|---|---|
| 단일 Mesh 셰이프 | 전수 통계31,365개, 대표 `mg1801_obj00` | **[데이터]** Shape 내부의 다른 Mesh 단계 없음. 다른 모델 교체까지 없다는 뜻은 아님 |
| 일반 Mesh의 재질 LOD | 단일 MaterialIndex, 대표5모델 dump, `FUN_7100067150` | **[판독]** 이 경로의 단계별 재질 교체 미확인. decal은 §5.5의 재질 flag로 LOD0 |
| 실제 거리 mode 사용 | `FUN_71006e06b0`의 None0/Distance1/ScreenRatio2/Invalid−1 등록; Distance 문자열 `0x710153DAF8` 참조는 이 등록 함수 1개; `FUN_71006b41f0` 호출자와 Mesh selector | **[판독]** enum은 존재하지만 조사한 selector의 두 설정 호출은 mode2. 다른 호출 방식·모듈의 거리 mode 활성·문턱은 **[미확정]** |
| 히스테리시스·fade | 매 호출 목록 reset, 현재 rho 비교, 4개 임포스터 shader | **[판독]** 이 Mesh 선택 경로와 임포스터 shader의 LOD 교차 fade 없음. 다른 pass의 전체 blend 정책은 **[미확정]** |
| light 거리 교체 | 기존 `09 §4.2` 캐릭터 경로 | **[미확정]** 장면별 설정+6 생성·변경 조건 |
| 애니메이션 거리/가시성 우선순위 | §7.2 FSO 공급자 인터페이스와 스케줄러·CalculateAndApply | **[판독]** 평가 생략 스케줄러 존재. P 생산식·실제 공급자 연결/교체·개별 enable은 **[미확정]**. 고정 비용1/예산32와 시간 공급자 식은 판독됨. 고정 거리별 주기나 본 수 변경은 확인되지 않음 |
| 억제 byte | §4.3 생성자 초기화, main text 직접 load/store 탐색 | **[판독]** 초기값0·활성 검사 확정. +0x270을 1로 쓰는 생산자와 장면 값은 **[미확정]** |
| viewport 높이 override | `FUN_71006b4170`·생성자·`FUN_71006bca3c`·API bridge | **[판독]** 초기값0, bool setter 확정. h=1 override 목적·활성 장면은 **[미확정]** |
| 임포스터 실제 활성·atlas 생산 | §7.4 pass·셰이더·전수551재질 enable0 | **[판독+데이터]** 소비·방향/프레임 선택 확정. 런타임 enable 변경·atlas 생성과 장면별 texture 연결은 **[미확정]** |
| 경계구 갱신 | 모델 c/r setter와 ShapeInstance 구 소비 | **[미확정]** 모든 애니·morph·부속 모델의 경계구 생산 상세 순서 |

## 10. 검증

- 기존 문서의 LOD·컬링·light·카메라·분할 내용을 검색해 참조했으며 해당 문서와 코드는 수정하지 않았다.
- 전수 통계의 Mesh 분포·컨테이너551개·type533/18을 확인했다. type 기록 직접 읽기는 551개 모두 기존 통계와 일치했다.
- 원본5모델(마리오/경량/헤이호/단일 Mesh 소품/type1 gate)을 기존 FRES 판독기로 읽어 IndexCount·FirstVertex·ratio·경계구를 확인했다.
- 디컴파일과 ARM64를 대조해 setter, 강제 인자0/2, mode2, viewport 높이, 번호 포장, Q 최대 Mesh 수 생산, 재질 geo_decal bit13, 억제 byte 초기화를 확인했다.
- FMAT의 ShaderParam descriptor와 데이터 offset을 직접 읽어 551개 임포스터 설정을 대조했다. 4개 BNSH의 vertex/fragment 총8 stage에서 atlas 분기와 alpha test를 판독했다.
- FSO 우선순위·생략 횟수 비교자, 비용 등급, 예산 선택, 포화 카운터, CalculateAndApply 소비와 전역 off 초기화를 대조했다. 고정 비용1/예산32와 별도 시간 기반 공급자 식을 구분했다.
- 재구현 계산은 rho·문턱 경계·4분할 높이 영향을 검산했다. 원본 실행·픽셀 대조·GPU 계측은 수행하지 않았다.
