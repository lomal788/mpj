확정 수준 표기: **[실행]** 원본 실행 확인, **[판독]** 원본 코드 판독, **[데이터]** 데이터 확인, **[추정]**, **[미확정]**. 이 문서에 [실행]은 없다. 재구현 계산은 "재구현 계산"이라고 따로 적는다.

# 스키닝: 본 계산·행렬 팔레트·정점 변형

## 1. 범위와 기존 명세

원본 `main.nso`의 CPU 본/팔레트/shape 갱신과 추출한 캐릭터 VS·FS를 정적으로 판독했다. 원본 실행, 원본 프레임 캡처는 하지 않았다. 아래 주소 `0x7100…`는 원본 `main.nso`의 Ghidra 주소이고, `VS+0x…`는 Maxwell 명령 스트림 시작 기준 바이트 오프셋이다. VS 파일의 앞 `0x80`바이트 헤더는 명령 주소에 포함하지 않는다.

- [03_graphics.md](03_graphics.md) §4.2의 FSKL·회전·bind 검증, §4.3의 정점 포맷·key shape·전체 데이터 집계는 기초 명세다. 여기서는 원본 CPU의 scale 분기와 GPU로 전달하는 최종 행렬을 보완한다.
- [09_character.md](09_character.md)의 본·shape 전이 시간 제한, Sub 슬롯·FaceSlot·눈 UV, §4.7의 APX 강체/제약 연결, §6.8의 heading, §6.9의 눈 셰이더는 해당 문서를 참조한다. 이 문서는 그 전이나 연결을 다시 분석하지 않는다.
- [README.md](README.md)의 엔진 문서와 기존 미니게임·캐릭터 문서에서 다루는 소켓/본 world 위치는 정점 스키닝의 입력 본 계산과 관련되지만, 소켓 갱신 자체는 여기서 재분석하지 않는다. LOD 선택은 별도 문서의 범위다.

### 1.1. 근거와 재판독 경로

| 자료 | 경로·용도 |
|---|---|
| 원본 코드 | `C:\dev\mpj\extracted\exefs\main`, Ghidra `C:\dev\mpj\ghidra_work\graphics\jamboree_main.gpr`의 `main.nso` |
| 함수 목록 | `C:\dev\mpj\analysis\functions\main.nso.tsv` |
| 기존 Ghidra 도구 | [CoreTool.java](../../tools/analysis/ghidra_scripts/CoreTool.java), [CharacterDisasm.java](../../tools/analysis/ghidra_scripts/CharacterDisasm.java), [CharacterDecompAddr.java](../../tools/analysis/ghidra_scripts/CharacterDecompAddr.java) |
| SASS 판독 | [sass_dis.py](../../tools/analysis/sass_dis.py), [bnsh_sass.py](../../tools/analysis/bnsh_sass.py); 기존 envydis/nvdisasm 사용 |
| VS·FS 추출 | `C:\dev\mpj\analysis\mat\prog\match.json`, `pc01__forward_plus__p8.vs1.bin`·`.fs1.bin` 등 24개 매칭 항목 |
| 원본 FRES 판독 | [graphics_bfres2gltf](../../tools/analysis/graphics_bfres2gltf/Program.cs)의 `dump --keys`와 기존 BfresLibrary reader |
| 전체 포맷 집계 | `C:\dev\mpj\extracted\converted\graphics\stats\fres_stats.json` |
| bind 검산 | `C:\dev\mpj\extracted\converted\graphics\pc01\meta\pc01_mario.json` |

**[판독]** Ghidra의 ARM64 SIMD 반환값은 디컴파일 결과에서 일부 벡터가 누락된다. `CalculateLocalTransform`의 반환 및 팔레트 전치는 어셈블리도 함께 확인했다. 함수 이름이 없는 `FUN_…`에는 SDK 클래스/메서드 이름을 임의로 붙이지 않았다.

기존 `CoreTool.java` 재판독 인자는 `dec:7100782e00:0`, `disf:7100782e00`, `disf:7100782db8`, `ptrs:7101a0a1c8:8`, `ptrs:7101a0a208:8`처럼 사용한다. `analyzeHeadless … -process main.nso -readOnly -noanalysis -scriptPath … -postScript CoreTool.java <임시 출력 경로> <인자들>`로 추출했다. 원본 프로젝트 저장이나 새 도구 작성은 하지 않았다.

## 2. 본 번호와 팔레트 번호는 다르다

### 2.1. 데이터의 세 번호 공간

**[데이터][판독]** 아래 번호를 구분해야 한다.

| 번호 | 의미 | 사용처 |
|---|---|---|
| skeleton bone index `b` | 본 리소스/현재 world 배열의 인덱스 | 부모 관계, 본 pose, `W[b]` |
| palette index `j` | smooth 다음 rigid가 연결된 행렬 배열의 인덱스 | 정점 `_i0`, GPU `Skeleton` 블록 |
| shape `BoneIndex` | shape 리소스가 가리키는 본 | skin count 0의 shape 행렬, shape의 부가 본/가시성 정보 |

`b = MatrixToBoneList[j]`다. 정점의 `_i0`를 바로 skeleton bone index로 사용할 수 없다. 기존 §4.3의 Mario smooth 예제는 이 매핑을 보여 주지만, `_i0` 전체를 smooth 전용 번호로 일반화하면 안 된다. CPU는 smooth와 rigid 모두 같은 `MatrixToBoneList`로 world 본을 찾는다.

**[데이터]** Mario 원본 `C:\dev\mpj\extracted\bea\chara~pc01.nx.bea\chara\pc\pc01_mario\model\pc01_mario.fmdb`는 본 94개, smooth 73개, rigid 0개다. 스켈레톤 본 수와 실제 팔레트 수가 일치하지 않는다.

**[데이터]** rigid 반례는 `C:\dev\mpj\extracted\bea\chara~npc003.nx.bea\chara\npc\npc003_nokonoko\model\npc003it00_hat.fmdb`다.

| 항목 | 값 |
|---|---|
| 본 | `model_root=0`, `container=1`, `hat=2` |
| 팔레트 | `NumSmooth=0`, `NumRigid=1`, `MatrixToBoneList=[2]` |
| `hat` 본의 매핑 | smooth index `-1`, rigid index `0` |
| shape `hat_model__hat_m` | `VertexSkinCount=1`, `BoneIndex=0`, `SkinBoneIndices=[2]` |
| 정점 | `_i0=0`인 `8_UInt`; `_w0` 없음; `_p0=16_16_16_16_Single` |

이 shape의 deformation은 `_i0=0 → palette[0] → bone[2]`다. shape의 `BoneIndex=0`을 deformation 본으로 대체하면 다른 본을 사용하게 된다. 또한 `VertexSkinCount=1`은 inverse bind 적용 여부를 직접 결정하지 않는다. 그 여부는 참조한 팔레트 항목이 smooth 영역인지 rigid 영역인지로 결정된다.

### 2.2. 영향 본 수와 입력 포맷

**[데이터]** 기존 전체 FRES 집계는 shape 33,400개 중 skin count `0:32,525`, `1:383`, `2:209`, `3:178`, `4:105`다. `_i1`·`_w1`은 이 집계에서 발견되지 않았다. 데이터의 최대 4영향과 아래 캐릭터 VS의 4영향 분기는 확인했지만, SDK 전체의 최대 영향 수로 확대하지 않는다.

| 속성 | 원본 데이터에서 발견한 포맷과 개수 |
|---|---|
| `_i0` | `8_UInt:383`, `8_8_UInt:209`, `8_8_8_8_UInt:283` |
| `_w0` | `16_16_16_16_UNorm:116`, `32_32_Single:95`, `32_32_32_Single:83`, `8_8_UNorm:67`, `32_32_32_32_Single:51`, `16_16_UNorm:47`, `8_8_8_8_UNorm:33` |

**[데이터]** Mario의 실제 버퍼 예제:

| vertex buffer | skin count | 정점 수 | `_i0` | `_w0` | 부가 사항 |
|---|---:|---:|---|---|---|
| body VB0 | 4 | 11,977 | `8_8_8_8_UInt` | `16_16_16_16_UNorm` | `_p0` float3, `_n0`·`_t0` packed signed normal 포맷 |
| face VB1 | 2 | 343 | `8_8_UInt` | `16_16_UNorm` | 팔레트 인덱스 50…67 → 본 64…82 |
| hair VB2 | 3 | 693 | `8_8_8_8_UInt` | `8_8_8_8_UNorm` | 원시 네 번째 인덱스·가중치 성분은 모두 1; 3영향 분기는 이를 읽어 계산하지 않음 |

**[판독]** 인덱스는 정수 attribute로 받아 `48 × index` 오프셋을 만든다. UNorm 가중치는 정점 포맷 단계에서 float로 해석된 뒤 shader의 곱셈에 들어간다. UNorm8/16의 단위는 각각 `1/255`, `1/65535`다. 아래 VS는 가중치 합을 다시 나누거나 마지막 가중치를 `1−합`으로 만들지 않는다. 3영향에서 저장 공간이 4성분이라는 이유로 네 성분을 모두 사용하면 Mario hair부터 결과가 달라진다.

## 3. CPU pose와 world 행렬

### 3.1. 관찰된 구조와 행렬 배치

**[판독]** `SkeletonPose`와 하위 런타임 객체 `K=*(pose+0x28)`의 판독에 필요한 필드는 다음과 같다. 필드명은 본 문서의 설명 이름이며 원본 심벌이 있는 메서드 이름과 구분한다.

| `SkeletonPose` 오프셋 | 내용 |
|---|---|
| `+0x10` / `+0x18` | Entity / ComModel 포인터 |
| `+0x28` | `K` |
| `+0x30…+0x48` | dirty bitset: 64비트 4개 |
| `+0x50` | 마지막으로 사용한 Entity generation; Entity의 `+0x190`과 비교 |
| `+0x58` | 본별 32바이트 dependency mask; dirty와 AND 검사 |
| `+0x70` | 리소스로부터 계산한 model-space 행렬 배열, 본당 64바이트 |
| `+0x78` / `+0x80` | `BeginPeek` 로컬 pose 복사 구간 시작/끝 |

`pose+0x70`을 inverse bind 배열로 혼동하면 안 된다. 이를 반환하는 심벌은 `GetModelSpaceTransformCalculatedFromResource` (`0x71006ddd70`)이며, 팔레트에서 실제 사용하는 inverse bind는 별도의 리소스 필드다.

| `K` 오프셋 | 내용 |
|---|---|
| `+0x00` | skeleton 리소스 `R` |
| `+0x08` | flags; 초기화 시 `R+0x04`의 flags를 복사 |
| `+0x09 & 3` | scale mode selector |
| `+0x0a` | buffer slot 수 `c` (u8) |
| `+0x10` | 본 리소스 배열, record 96바이트 |
| `+0x18` | 현재 local pose 배열, record 96바이트 |
| `+0x20` | 현재 world 행렬 배열, 본당 64바이트 |
| `+0x28` | 별도 scale 작업 배열; Softimage 경로에서 사용 |
| `+0x40` | GPU buffer control 배열, slot당 72바이트 |
| `+0x48` | 팔레트 유효 바이트 수 |
| `+0x50` | 본 수 u16 |
| `+0x52` / `+0x58` | callback 대상 본 i16 / callback 포인터; 초기값 `-1` / null |

local record는 flags `+0x00`, scale float3 `+0x10`, RT 행렬 `+0x20`이다. scale과 RT는 따로 저장한다. RT/world의 실제 저장은 16바이트 벡터 4개, 총 64바이트다. 세 basis 벡터와 translation 벡터를 담는다. 원본 심벌에는 `MatrixRowMajor4x3f`가 나타나므로 이름만 보고 glTF의 메모리 레이아웃을 대입하지 않는다.

**재구현 계산**: 이 문서의 식은 열벡터 수학 표기 `W=[A,t]`, `p'=Ap+t`로 통일한다. 원본의 네 벡터는 이 표기의 basis 열 세 개와 translation에 대응한다. GPU에는 이를 출력 성분별 행 세 개로 전치한다. 이 표기는 계산 설명을 위한 것이며 원본 타입 이름의 변경이나 좌표계의 handedness 판정이 아니다.

### 3.2. 수정·dirty·계산 호출

**[판독]** 핵심 호출과 분기:

| 원본 함수 | 주소 | 동작 |
|---|---|---|
| `SetLocalMtxRt` | `0x71006dd6f4` | 유효 본의 RT 64바이트 복사, flags `&=0xf0ffffff`, dirty 설정 |
| `SetLocalScale` | `0x71006dd7f4` | scale 벡터 저장, 같은 flags clear, dirty 설정 |
| `SetLocalTransformAsChanged` | `0x71006dd77c` | dirty 설정 |
| `CalculateLocalTransform` | `0x71006dd95c` | RT의 basis 세 벡터에 각각 scale x/y/z를 곱함; translation 유지 |
| `CalculateWorldTransform(b)` | `0x71006dd520` | Entity generation 또는 해당 본 dependency mask가 dirty와 겹치면 전체 world 계산 |
| `GetWorldTransformCalculated` | `0x71006dd630` | dirty 확인 없이 현재 world 배열에서 반환 |
| `Calculate` | `0x71006dddb0` | generation 동일·dirty 모두 0이면 반환; 아니면 아래 계산 호출 |
| `CalculateForce` | `0x71006dde98` | 캐시 조건 없이 계산 |
| `BeginPeek` / `EndPeek` | `0x71006ddf00` / `0x71006ddf90` | local record 전체 복사/복원; 복원 후 dirty 네 word 모두 1 |

`CalculateLocalTransform` 어셈블리 `0x71006dd97c…0x71006dd994`는 `basis0*sx`, `basis1*sy`, `basis2*sz`, translation 복사를 직접 보여 준다. 디컴파일의 16바이트 반환만 읽으면 전체 행렬을 놓친다.

dirty 설정은 `k=min(boneIndex,255)`, `word=k>>6`, `bit=1ULL<<(k&63)`이다. 255를 넘는 본들이 마지막 비트를 공유하므로 256본을 엔진 최대 본 수로 해석할 수 없다. dependency mask의 생성 규칙은 이번 판독에서 확정하지 않았다. `CalculateWorldTransform`의 범위 밖 본은 identity를 반환하며 `GetLocalScale` (`0x71006dd7bc`)의 범위 밖 결과는 `(1,1,1)`이다.

일반 계산 순서는 다음이다.

```text
SkeletonPose::Calculate / CalculateForce
  → ComModel::CalculateTransform (0x71006adaac)
  → world scale-mode dispatcher (0x7100782db8)
  → model+0x2c |= 8
  → dirty 네 word = 0
  → Entity generation 저장
```

**[판독]** 일반 `ComModel::CalculateTransform`은 Entity world와 모델 local을 합성해 모델의 `+0x40` 결과를 만든다. 모델 local은 `+0x80`에 있다. 이미 계산한 generation이면 캐시를 사용하고 모델 flags `+0x2c`의 `0x80` 분기도 있다. `model+0x228`이 존재하고 `ModelModule` 조회 `0x71006bde6c` 결과 bit0가 0인 별도 경로는 local을 그대로 복사한다. 따라서 아래 root 입력 `E`를 모든 상황에서 Entity world 그 자체라고 단정하지 않는다. SIMD로 반환된 합성 root가 world 계산에 전달된다.

### 3.3. scale mode와 부모 누적

**[판독]** `FUN_7100782db8`은 `K+0x09 & 3`으로 16바이트 함수/adjust 레코드를 선택한다. adjust는 확인한 8개 레코드 모두 0이다. `callbackBone!=-1 && callbackPointer!=null`이면 callback 표를 선택한다.

| selector | reader enum 이름 | 일반 함수, 표 `0x7101a0a1c8` | callback 함수, 표 `0x7101a0a208` |
|---:|---|---|---|
| 0 | None | `0x71007809f0` | `0x7100781530` |
| 1 | Standard | `0x7100780bc0` | `0x71007817d0` |
| 2 | Maya | `0x7100780e60` | `0x7100781b80` |
| 3 | Softimage | `0x71007811d0` | `0x7100781fc0` |

표를 가리키는 GOT 항목은 `0x7101a93250` / `0x7101a93258`이다. 모드 이름은 기존 BfresLibrary의 `Skeleton.ScalingMode` 값 `0,1<<8,2<<8,3<<8`과 리소스 flags 복사로 대응시켰다. 원본 함수에 해당 이름의 심벌이 있는 것은 아니다.

본 리소스 record `+0x28`의 본 번호와 `+0x2a`의 부모 번호를 읽어 destination/parent 행렬을 선택한다. root 처리 후 남은 record를 진행한다. glTF node 순서와 같은 번호라고 가정하지 않는다. local flags의 rotate-zero/translate-zero 및 scale-one 최적화가 있으나 계산식은 아래와 같다.

**재구현 계산 — None**: local RT를 `L_b=[R_b,t_b]`라고 두면 root `W_0=E L_0`, 자식 `W_b=W_parent L_b`. 이 모드는 local scale을 world basis에 적용하지 않는다. rotate/translate가 모두 zero라는 flags 경로는 부모 행렬을 복사한다.

**재구현 계산 — Standard**: local scale 대각행렬을 `S_b`라 두면 첫 pass는 자신의 scale을 제외한 `H_b`를 만든다.

```text
H_0 = E L_0
H_b = H_parent S_parent L_b
두 번째 pass: W_b = H_b S_b
```

그 결과 일반 경로의 자식은 `W_b=W_parent L_b S_b`와 같은 계산이다. scale이 RT와 분리되어 있고 두 번째 pass에서 자기 scale을 넣는 구현임을 구분한다.

**재구현 계산 — Maya**: `H_b=[A_b,u_b]`라 두고 자식 flags bit23을 segment scale 조건 `SSC_b`로 나타내면, 판독한 일반 경로는 다음과 같다.

```text
D = (SSC_b ? I : S_parent)
A_b = A_parent D R_b
u_b = u_parent + A_parent S_parent t_b
W_b = [A_b S_b, u_b]
```

root는 `H_0=E L_0`로 시작한다. parent scale-one flags이면 동등한 곱셈을 생략한다. SSC가 켜져도 부모 scale은 자식 translation에는 적용되고, 자식 basis를 계산할 때의 부모 즉시 scale만 제외된다. 이 경로에서 reciprocal/inverse-scale 나눗셈을 사용하지 않는다. 처음부터 자기 scale을 제외한 `H`를 유지하기 때문이다. Standard와 Maya에서 같은 scale 공식으로 glTF world를 만들면 SSC 본에서 차이가 날 수 있다.

**[판독][미확정]** Softimage 별도 함수와 `K+0x28` scale 배열 사용은 확인했다. 전체 누적 scale 식은 확정하지 않았으므로 위 Standard 식을 대입하지 않는다. callback 경로는 지정 본에서 callback vtable `+0x10`을 호출하고 world/local scale 관련 포인터를 전달한다. callback 내부의 변형과 수명, 보조 물리와의 전체 호출 순서는 별도 미확정이다.

## 4. bind와 최종 GPU 팔레트

### 4.1. smooth / rigid 행렬 생성

**[판독]** 업로드 함수 `FUN_7100782e00(K,bufferIndex)`의 리소스 입력:

| skeleton 리소스 `R` | 내용 |
|---|---|
| `+0x18` | `MatrixToBoneList`, 원본 load는 signed halfword |
| `+0x20` | inverse bind 행렬 배열, smooth 항목당 48바이트 |
| `+0x3a` | smooth 수 `Ns`, u16 |
| `+0x3c` | rigid 수 `Nr`, u16 |

**재구현 계산**:

```text
j < Ns:          P[j] = W[MatrixToBoneList[j]] × inverseBind[j]
Ns ≤ j < Ns+Nr:  P[j] = W[MatrixToBoneList[j]]
```

**[판독]** smooth 루프 `0x7100782e54…0x7100782edc`는 world 64바이트와 inverse bind 48바이트를 곱한다. rigid 루프 `0x7100782f40…0x7100782f88`는 inverse bind를 읽지 않고 world를 전치한다. 두 루프 모두 GPU 출력은 48바이트다. rigid 정점은 본 local 공간에 있으며, smooth 정점은 inverse bind를 필요로 하는 공간에 놓인다는 데이터/변환기 해석과 일치한다. 그러나 그 구분을 `VertexSkinCount==1`만으로 구현하면 안 된다.

**[데이터]** inverse bind의 유효 입력은 기존 reader의 `Skeleton.InverseModelMatrices`다. `Bone.InverseMatrix`를 읽어 0 행렬을 얻던 reader 문제와 Mario의 bind 검산은 [03_graphics.md](03_graphics.md) §4.2를 참조한다. Mario smooth 73개에 대한 저장된 검산 최대 오차 `3.258414e-7`은 **재구현 계산** 결과이고 원본 실행 결과가 아니다. Euler 후보 비교도 해당 검산의 범위다.

### 4.2. 64바이트 CPU 행렬에서 48바이트 GPU 행렬로

**[판독]** 팔레트 항목의 GPU 배치는 다음이다.

```text
float q[12] = {
  A00, A01, A02, tx,
  A10, A11, A12, ty,
  A20, A21, A22, tz
};                      // 48 bytes per palette entry
```

**재구현 계산**: 위치의 출력 성분 `r=0,1,2`는 `q[4r]*x+q[4r+1]*y+q[4r+2]*z+q[4r+3]`; 방향 벡터는 마지막 translation 항을 제외한다. homogeneous 4×4 마지막 행을 GPU에 저장하지 않는다. CPU world stride `64`, inverse bind stride `48`, GPU 팔레트 stride `48`을 서로 바꾸면 안 된다.

### 4.3. 할당·slot·Map/Unmap

**[판독]** 팔레트 유효 크기는 `n=48*(Ns+Nr)`다. `FUN_7100782a7c`의 할당 크기는 alignment `a`에 대해 `((n+a−1)&−a)*c`; `c=K+0x0a`는 생성 인자로 정해진 slot 수다. alignment는 조회 함수 `0x710087c8fc`를 경유하며 고정 256으로 단정하지 않는다. GPU buffer control stride 72는 행렬 stride와 무관하다.

| 단계 | 함수/근거 |
|---|---|
| 모델 skeleton 생성 | `0x71006b2170` → 크기 조회 `0x71007823f8` → builder `0x71007824e0` |
| 리소스 local pose 초기화 | `0x71007825f0`: scale·rotation·translation과 최적화 flags 복사 |
| buffer 설정 | `0x7100782c54` 용량 확인 → `0x7100782b10` slot별 buffer 생성, `K+0x48=n`, `K+0x08` bit0 설정 |
| 업로드 | `0x7100782e00`, `K+0x48==0`이면 반환; 선택 control=`K+0x40+slot*0x48` |
| Map | `0x7100782e34`에서 `Map` (`0x710087cb44`) 호출 |
| 쓰기 후 동기화 | `0x7100782fa0`에서 `FUN_710087cb5c(control,0,n)` |
| Unmap | `0x7100782fb8`에서 `Unmap` (`0x710087cb58`) 호출 |
| 해제 | `0x7100782d30`이 slot별 `0x710087cb0c`, `0x710087ca28`을 호출하고 크기/flags 등을 clear |

`FUN_710087cb5c`는 control `+1`의 bit1 조건으로 함수 포인터 `0x7101a96700`을 호출하는 wrapper다. 쓰기 후 범위 동기화 호출은 확인했지만 backend 메서드까지 판독하지 않았으므로 이를 특정 API의 cache flush로 확정하지 않는다. slot 수가 반드시 2/3이라는 근거도 없다.

**[판독]** CPU의 palette 곱셈은 single-precision SIMD `FMUL/FMLA`다. VS는 `FMUL.FTZ`, `FFMA.FTZ`, `FADD.FTZ`를 사용한다. VS 계산은 float32이며 FTZ가 표시된 연산은 작은 subnormal 값 처리에 영향을 준다. 원본 입력 quantization과 f32 누적을 double 계산 결과와 같은 비트값으로 기대할 수 없다.

## 5. 원본 캐릭터 VS의 실제 계산

### 5.1. 셰이더 입력과 분기 선택

**[판독]** `match.json`의 24개 캐릭터 항목을 기존 SASS 도구로 비교했다. `pc11alfa`를 제외한 23개는 `VS+0x0008`의 첫 mode 판정부터 `VS+0x1be0` 직전까지 동일하다. `sass_dis.disasm()` 결과를 LF로 연결한 뒤 첫 `isetp`부터 `00001be0:` 라벨 직전까지 취한 문자열의 SHA-256 앞 16자는 `f86d5bcfdc6e4354`이다. 이 비교 범위는 전체 셰이더의 동일성을 뜻하지 않는다.

| 매칭 항목 | 선택 VS program |
|---|---|
| pc01, pc02, pc03, pc04, pc11body, pc12, pc14, pc50, pc51, pc56, pc61, pc62 | forward_plus p8 |
| pc05, pc06, pc07, pc08, pc09, pc13, pc52, pc53, pc54, pc58 | forward_plus p0 |
| pc11stick | forward_plus p16 |
| pc11alfa | forward_plus p23 |

**[데이터][판독]** pc01 `forward_plus_color`의 reflection은 `Mode=48`바이트, `Shape=96`바이트, `Skeleton=6144`바이트다. 이 VS에서는 각각 SASS constant bank `c8`, `c9`, `c10`에 대응한다. `Skeleton`의 선언 크기는 48바이트 팔레트 128항목이다. 이것만으로 전체 엔진 최대 본 수나 모든 shader의 최대 팔레트 수를 정할 수 없다.

pc01 reflection attribute location은 `_p0:0`, `_i0:1`, `_w0:2`, `_n0:3`, `_t0:4`, `_t1:5`, `_t2:6`, `_t3:7`, `_u0:8`, `_u2:9`, `_c0:10`, `_c1:11`, `_c2:12`, `_c3:13`이다. common skin 구간은 `_t0.xyz`를 tangent로 사용한다. 다른 tangent 선택 옵션의 모든 프로그램은 조사 범위에 포함하지 않았다.

**[판독]** `Shape+0x30`의 count를 `VS+0x130`에서 읽고 다음 selector를 만든다.

```text
selector = min_u32(count - 1, 4)
```

`VS+0x138`에서 뺄셈, `+0x148`에서 unsigned min, `+0x158`에서 jump table 읽기, `+0x168`에서 `BRX`다. jump table의 상대 목적지는 `0x170`, `0x360`, `0x898`, `0x1040`, `0x1a60`이다. control/scheduling word를 포함한 주소이므로 모든 목적지에 일반 명령이 있는 것은 아니다.

| count | selector | 동작 |
|---:|---:|---|
| 1 | 0 | `_i0.x`의 팔레트 하나; 가중치 load 없음 |
| 2 | 1 | 인덱스·가중치 2개 |
| 3 | 2 | 인덱스·가중치 3개; 저장된 `.w` 무시 |
| 4 | 3 | 인덱스·가중치 4개 |
| 0 | 4 | unsigned underflow 뒤 min; `Shape`의 직접 행렬 사용 |
| 5 이상 | 4 | 같은 직접 행렬 분기로 떨어짐; 5영향 스키닝이 아님 |

### 5.2. 위치·normal·tangent

**재구현 계산 — count 1…4**: 정점 `p`, normal `n`, tangent xyz `t`, 팔레트의 affine 행렬 `P[i]=[A_i,u_i]`를 사용한다.

```text
count 1:
  p_s = A_i p + u_i
  n_s = A_i n
  t_s = A_i t

count 2…4:
  p_s = Σ_k w_k (A_i[k] p + u_i[k])
  n_s = Σ_k w_k A_i[k] n
  t_s = Σ_k w_k A_i[k] t
```

**[판독]** 각 본의 위치 변환에서는 homogeneous 위치의 마지막 성분을 1로 취급하고 translation을 더한 뒤 해당 weight를 곱한다. 결과 `p_s`의 homogeneous 성분을 `Σw`로 만들어 후속 행렬에 넘기는 계산이 아니다. count 1은 weight 1을 암묵적으로 사용한다. count 2…4는 저장 가중치를 그대로 사용한다. 가중치 재정규화, zero-weight 분기, palette 인덱스 범위 검사는 이 skin 구간에 없다.

**재구현 계산 — count 0**: `Shape+0x00…+0x2c`의 3×4 행렬 `Q=[A_Q,u_Q]`로 `p_s=A_Qp+u_Q`, `n_s=A_Qn`, `t_s=A_Qt`. 이 분기는 palette와 `_i0`를 사용하지 않는다.

**[판독]** VS normal/tangent는 위치와 같은 3×3 선형부를 사용한다. inverse transpose, VS 내 길이 정규화, Gram–Schmidt 직교화는 없다. tangent `.w`는 xyz처럼 행렬 변환하지 않고 부호용 varying으로 별도 전달한다. nonuniform scale이 들어간 본에 일반적인 normal inverse-transpose 규칙을 적용하면 원본 VS 식과 달라진다.

### 5.3. instancing과 projection 이후 처리

**[판독]** `VS+0x8`에서 `Mode+0x04!=0`을 검사한다. 활성 시 instance ID attribute `0x2f8`과 `c0[0x644]` base-instance 값을 더하고, `VS+0x90/0x98`에서 80바이트 stride를 계산한다. `c0[0x130/0x134]`의 64비트 포인터를 통해 instance record의 `+0x00/+0x10/+0x20` float4 세 개를 읽는다. record 전체 80바이트 중 이 skin 변환이 사용하는 부분은 48바이트다.

**재구현 계산**: skin 분기 합류 `VS+0x1be0` 이후 활성 instance affine `I=[A_I,u_I]`에 대해 `p_w=A_Ip_s+u_I`, `n_w=A_In_s`, `t_w=A_It_s`. 비활성 시 identity다. normal/tangent에도 instance 선형부 그대로 적용하며 inverse transpose는 하지 않는다.

**[판독]** pc01의 `VS+0x1d40` 이후 projection용 y는 다음과 같다.

```text
p_clip_input.y = p_w.y * Mode[0x10]
               + Mode[0x14]
               + Mode[0x18] * material_planar_reflection_y_offset
```

x/z는 유지하고 `View+0x70…+0xac`의 4×4 계수로 clip position을 만든다. world-position varying은 이 projection용 y 수정 전 위치를 전달한다. normal/tangent는 위의 projection용 y 처리에 맞춰 뒤집지 않는다. pc12/pc13/pc61 등의 이후 projection·UV 명령 차이는 common skin 구간의 차이가 아니다.

### 5.4. FS 정규화와 확인한 예외

**[판독]** pc01 FS는 normal varying `v1`과 tangent varying `v2`를 perspective interpolation하고 tangent 부호 `v6.x`를 별도 읽는다. 각 벡터의 `dot(v,v)`에 `RSQ`를 적용해 **FS에서 각각 정규화**한다. 이어 `cross(N,T) × tangent.w`로 bitangent를 구성하는 구간이 있다. 이 FS 구간에서도 먼저 T를 N에 대해 직교화하는 계산은 없다. normal map 이후의 재질 계산은 [03_graphics.md](03_graphics.md)의 재질 판독을 참조한다. pc01의 FS 결과를 모든 캐릭터/패스에 확대하지 않는다.

**[판독]** `pc11alfa forward_plus p23`은 skin count 분기와 palette 위치·normal 변환을 갖지만 common 구간처럼 tangent xyz를 skin하지 않는다. `_t0.xyz`의 대응 load/변환이 없는 예외다. pc11stick p16은 위 23개 common skin 구간에 포함된다.

**[미확정]** 여기서 비교한 항목은 기존 매칭의 forward_plus 캐릭터 VS다. shadow/depth, 별도 instancing/VAT/fluid, 임의 재질 permutation까지 같은 입력·팔레트 크기·normal 식이라고 확정하지 않는다. 모든 FS의 normal/tangent 정규화도 미확정이다.

## 6. morph: CPU 정점 버퍼 갱신 뒤 VS 스키닝

### 6.1. shape 상수와 key shape 호출

**[판독]** 모델 shape 갱신 `FUN_7100771ac0(model+0x1e0,slot)`은 0x70바이트 runtime shape record를 순회한다. shape 상수 갱신은 `FUN_71007790a0`, morph 계산은 조건 충족 시 `FUN_7100778020`으로 진행한다. runtime shape `+0x08`의 morph 관련 bits2/3과 morph 함수 자체의 bit1 조건이 있다. 비트 전체의 원본 enum 이름은 확정하지 않았다.

`FUN_71007790a0`은 shape 리소스 `+0x5a`의 skin count를 `Shape UBO+0x30`에 쓴다. skin count 0 등에 사용하는 본 world 행렬은 `UBO+0x00…+0x2c`에 전치한다. slot/instance 선택에는 shape `+0x0e`, `+0x0d` 조건이 있다. 마지막 범위 동기화 인자는 `0x100`이며, 이것은 pc01 shader reflection의 논리 블록 96바이트와 별개의 호출 범위다.

### 6.2. 가중치 임계값과 누적식

**[판독]** `FUN_7100778020`은 attribute slot 18개(`0x12`)와 key shape를 순회한다. key shape 수는 shape 리소스 `+0x5c`의 u8, weight 배열은 runtime shape `+0x28`이다. key별 attribute index 레코드는 20바이트 간격이다.

`0x71007780ec/0x7100778124`에 float 상수 bits `0x3a83126f`가 나타나고 `0x71007781a4…0x71007781ac`에서 절댓값 비교한다. 따라서 참여 조건은 `abs(beta)>=float32(0.001)`이다. 음수 weight도 절댓값 기준으로 참여한다.

첫 참여 key는 `FUN_71007782b4`의 assignment helper를 사용하고, 뒤의 참여 key들은 `FUN_71007784bc`의 accumulation helper를 사용한다.

**재구현 계산**:

```text
active = { k | abs(beta[k]) >= float32(0.001) }
첫 active k: destination = beta[k] * source[k]
나머지 k:   destination += beta[k] * source[k]
```

즉 CPU kernel 자체는 전달된 **절대 target 값의 가중합**이다. kernel 내부에서 기본 정점에 `target−base`를 더하는 형태가 아니다. 기본 key의 `beta[0]`를 누가 어떻게 채우는지, 기본 계수를 항상 `1−Σ(beta[1…])`로 만드는지는 이 함수만으로 확정할 수 없다. active가 하나도 없는 경우 helper가 값을 쓰지 않는다. 상위 초기화가 이전/기본 버퍼를 어떻게 보장하는지는 미확정이다.

### 6.3. 포맷·buffer 갱신

**[판독]** attribute descriptor는 16바이트이며 format `+0x08` u32, offset `+0x0c` u16, buffer index `+0x0e` u8을 사용한다. vertex count는 vertex-buffer 리소스 `+0x50` u32다. source buffer와 stride 레코드를 이용해 원래 interleaved 레이아웃으로 이동하고, destination은 runtime shape `+0x48`의 buffer control에서 slot을 고른다. 동일 destination buffer의 중복 Map은 64비트 4개 bitset으로 억제한다.

처음 destination을 Map할 때 `FUN_710087cb7c(control,0,sourceBufferSize)`를 호출한다. 이 backend의 세부 의미는 확정하지 않았으며, 이름 없는 호출을 버퍼 0 초기화로 해석하지 않는다. 여러 key의 처리 후 buffer를 동기화/Unmap하는 구조다.

| 원본 포맷 코드 | helper | 계산 |
|---|---|---|
| float3 `0x1805` | 첫 값 `0x71007797c0`, 누적 `0x7100779f40` | 세 float `FMUL` / `FMADD` |
| float4 `0x1905` | 첫 값 `0x7100779810`, 누적 `0x7100779f90` | 네 float 곱/누적 |
| packed signed 10bit 계열 | 예: `0x7100779860` | sign extension → float weight 곱 → 정수 변환 → bit packing |

지원 포맷 분기와 integer/packed 처리도 있으며 예상 밖 포맷은 `UnexpectedDefaultImpl` 경로다. 일부 packed/integer helper는 `FCVTZ`와 narrow store를 사용한다. 모든 포맷이 float3과 같은 정밀도거나 CPU에서 normal을 재정규화한다고 가정하지 않는다. packed 포맷 전체의 overflow/saturation 규칙은 미확정이다.

**[데이터]** Mario face는 base 포함 key 7개, 추가 `_p1…_p6` float3가 buffer11의 offset `0,12,24,36,48,60`에 있다. target attribute 수는 1이며 `_n1`/tangent target이 없다. 이 데이터의 morph는 위치만 바꾸고 normal/tangent 입력은 그대로다. 다른 모델은 kernel의 18 attribute slot을 이용할 수 있으므로 엔진 전체가 위치 morph만 지원한다고 확대하지 않는다.

**[판독]** 조사한 캐릭터 VS는 `_p0`, `_n0`, `_t0`를 입력으로 skin하며 `_p1…`나 morph weight를 읽지 않는다. 이 CPU 함수가 destination vertex buffer를 만든 다음 그 결과를 GPU vertex 입력으로 소비한다. 따라서 이 경로의 기하학적 적용 순서는 **morph → vertex skin → instance transform → projection**이다.

## 7. CPU/GPU 분담과 보조 물리의 경계

### 7.1. 업로드 호출 순서

**[판독]** 모델 upload worker `FUN_71006c4930`은 atomic으로 모델 배열의 작업 번호를 확보하고, `model+0x28!=0 && (model+0x2c & 1)!=0`인 모델에 `FUN_71006ae9c0(model,slot)`을 호출한다. 모델 배열을 병렬로 분배하는 CPU 작업이며 vertex마다 CPU skin을 수행하는 루프는 아니다.

일반 `FUN_71006ae9c0`의 관련 순서:

```text
일반 갱신 허용 조건: model+0x228 == null 또는 instance+0x7c != 0
  → 필요 시 shape cache 처리 (0x71006b415c)
  → SkeletonPose 존재 시 palette 업로드 (0x7100782e00)
  → shape 런타임 존재 시 Shape UBO·morph 갱신 (0x7100771ac0)
  → 추가 frame/shape/instance 갱신 및 callback
GPU draw
  → shape/count 분기, vertex skin, instance, projection
```

CPU에서 palette 쓰기가 morph 쓰기보다 먼저 호출된다고 해서 정점에 skin을 먼저 적용한다는 뜻은 아니다. palette와 변형된 정점 버퍼를 따로 준비하고 GPU가 둘을 함께 읽는다.

**[판독][미확정]** `FUN_71006aeee0`에는 pose를 섞어 world/palette를 갱신하는 별도 경로가 있다. local scale의 0.5 혼합과 rotation 혼합 `0x7100986938` 호출은 확인했다. 이 경로의 프레임 의미와 선택 조건 전체를 확정하지 않았으므로 모든 draw가 직전 두 pose의 50% 보간이라고 적지 않는다.

### 7.2. 보조 물리에서 팔레트까지

**[판독]** 보조 물리와 본 양방향 연결은 [09_character.md](09_character.md) §4.7을 참조한다. 이미 판독된 animation→collision `0x71004f3a10`과 collision→local bone `0x71004f2910`, 후자의 `SetLocalMtxRt` 호출 `0x71004f2c08`이 이 문서의 dirty/재계산 경로에 연결된다.

이 문서에서 확정한 부분 순서는 다음이다.

```text
local RT/scale 수정
  → dirty 설정
  → Calculate 계열에서 world 갱신
  → smooth/rigid palette 생성·업로드
  → morph로 갱신된 vertex buffer + palette를 GPU에서 skin
```

**[미확정]** 전역 프레임의 animation, heading, APX step, callback, cloth/보조 본의 최종 우선순위를 이번 판독으로 확정하지 않았다. local 수정 후 `GetWorldTransformCalculated`처럼 캐시를 바로 읽는 경로와 `CalculateWorldTransform`처럼 dirty를 검사하는 경로를 구분해야 한다. 물리 결과가 모든 pass의 palette에 같은 프레임 적용되는지는 상위 스케줄러 추가 근거가 필요하다.

## 8. 현재 웹 구현과의 비교

아래는 **웹 코드 판독**이며 원본 동작의 근거로 사용하지 않는다. 수정 제안이나 원본 확정 사항과 혼합하지 않는다.

| 부분 | 현재 웹 코드 | 원본과 비교할 때의 차이 |
|---|---|---|
| glTF joints | [GltfExport.cs](../../tools/analysis/graphics_bfres2gltf/GltfExport.cs): 모든 본을 joints로 생성, `world[i].Inverse()`를 inverse bind로 사용 | 원본 palette는 smooth+rigid 항목만 생성하며 두 영역의 행렬 식이 다름 |
| 1영향 변환 | 같은 변환기: `skinCount==1` 정점을 해당 본의 bind world로 미리 변환 | 원본 VS는 단일 palette affine을 그대로 적용; CPU palette 영역으로 inverse bind 여부가 결정됨 |
| 가중치 | 같은 변환기: 사용 성분의 합으로 나눔; 합 0이면 첫 성분 1 | 원본 VS는 2…4영향의 가중치를 그대로 사용 |
| 방향 벡터 | 같은 변환기: normal/tangent 정규화 및 zero tangent fallback | 원본 VS에는 정규화/fallback 없음; 확인한 pc01 FS에서 정규화 |
| morph | 변환기는 `pK−p0` glTF delta target, 웹은 `morphTargetInfluences` 설정 | 원본 CPU kernel은 절대 key 값의 가중합; 기본 key 계수·0.001 임계값 대응은 별도 검증 필요 |
| 캐릭터 복제/갱신 | [character.ts](../../script/games/mg1801/view/character.ts): `SkeletonUtils.clone`, SkinnedMesh frustum 설정, morph influence 쓰기, `root.updateMatrixWorld(true)` | 원본 local/world 캐시·palette slot과 같은 구현이라고 볼 수 없음 |

**웹 코드 판독**: 설치된 Three.js `node_modules/three/src/objects/Skeleton.js`의 `update()`는 `bone.matrixWorld × boneInverse`를 16-float 항목으로 평탄화하고 bone texture가 있으면 `needsUpdate`를 설정한다. `computeBoneTexture()`는 RGBA float texture에 행렬당 네 pixel을 사용한다. 원본의 48바이트 uniform 팔레트와 업로드 경로가 다르다.

`ShaderChunk/skinning_vertex.glsl.js`는 `bindMatrix`로 위치를 옮긴 후 네 bone matrix를 weight로 합성하고 `bindMatrixInverse`를 적용한다. `skinnormal_vertex.glsl.js`는 weighted skin matrix의 선형부로 방향을 처리한다. 이후 `defaultnormal_vertex.glsl.js`의 object normal 경로에는 `normalMatrix`가 적용된다. 원본의 VS palette/instance 선형부 적용 및 projection 처리와 수학적으로 동일하다고 일반화할 수 없다. 특히 비정규 가중치, nonuniform scale/SSC, rigid palette, morph 임계값, normal 처리 시점은 데이터·포즈별 검산 대상이다.

## 9. 남은 미확정과 정적 검증

| 미확정 | 현재 확정 범위 |
|---|---|
| Softimage 누적 scale 전체식 | dispatcher·함수 주소·별도 scale 배열 사용 |
| callback의 실제 기능/보조 물리 최종 순서 | 지정 본 callback 호출과 local 수정→dirty→world→palette 부분 순서 |
| morph 기본 key 계수/무참여 시 버퍼 상태 | CPU 절대 가중합, 첫 assignment/뒤 accumulation, abs 0.001 임계값 |
| backend 동기화 API 이름 | Map/범위 wrapper/Unmap 호출과 주소·범위 |
| 전체 shader/엔진의 최대 본·팔레트·영향 수 | 조사 FRES 최대 4영향, 캐릭터 common VS 1…4분기, pc01 Skeleton 6144바이트 |
| handedness·임의 root/instance 경로의 좌표 의미 | 실제 storage stride·전치·곱셈 방향·관찰된 root 분기 |
| 전체 packed morph 정밀도·overflow | 확인한 float3/4 helper와 일부 packed helper |

**[판독][데이터]** 검증은 원본 실행 없이 진행했다. CPU local scale 반환·world dispatcher·smooth/rigid palette·morph helper를 ARM64 디컴파일과 어셈블리로 대조했고, 24개 VS의 skin 구간을 비교했다. Mario와 rigid NPC 원본을 기존 `dump --keys`로 읽어 매핑·포맷·key shape를 대조했다. 기존 bind 검산은 재계산하지 않고 저장된 결과의 의미를 명시했다. 문서 상대 링크, 주소/상수, 집계 수, 변경 diff를 확인했다. 코드·다른 문서·staging은 변경하지 않았다.
