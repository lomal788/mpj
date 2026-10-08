# 03 그래픽 — FRES 모델·애니, BNTX 텍스처, 재질 근사, glTF 변환

2026-10-02. 상태: **포맷 분석 + 변환기 프로토타입 완료**. 웹 렌더러 구현과 원본 화면 대조는 하지 않았다.
작성 형식은 [c:/dev/web/분석.txt](../../../../web/분석.txt)를 따른다. 확정 수준: **[실행]**(이 문서에서는 "변환·로드 실행 확인"), **[판독]**, **[데이터]**, **[추정]**, **[미확정]**. 원본(Switch)을 직접 돌려 본 결과는 없다.

범위 조정(메인 스레드 지시): 카메라 애니 런타임·조명·포스트는 [07_camera_lighting.md](07_camera_lighting.md), VFXB 상세는 [08_effects.md](08_effects.md), 캐릭터 모션 시스템은 [09_character.md](09_character.md)가 맡는다. 이 문서는 그 셋을 **포맷 개요**로만 다루고 FRES/BNTX 포맷·재질 근사·범용 변환기에 집중한다.

---

## 1. 개요와 핵심 결론

원본 그래픽은 Bezel 엔진(`nn::bezel`, `bex::gfx`) 위의 nn::g3d 포맷이다. 모델·애니는 FRES 9를 **종류마다 다른 파일**(`.fmdb/.fskb/.fmab/.fvbb/.fshb/.fsnb`)로 나눴고, 텍스처는 텍스처 하나당 BNTX 4.1 파일 하나다. 셰이더는 엔진 공용 `forward_plus` 하나가 그리는 재질 전부(전 재질 14,368개 중 12,726개, 나머지는 그리지 않는 파라미터 컨테이너 등)를 맡고 정적 옵션(`static_opt_*`)으로 기능을 켠다.

| 결론 | 수준 |
|---|---|
| 좌표계는 Y 위, 오른손(three.js와 같다). 변환 없이 쓴다. 1 단위 ≈ 1 m(마리오 키 1.545) | Y-up·오른손 [데이터+실행], 1 m [추정] |
| 뼈 회전은 EulerXYZ 라디안, **R = Rz·Ry·Rx**(X 먼저). three.js `Euler(x,y,z,'ZYX')` | [데이터] 바인드 역행렬과 오차 ≤ 3.3e-7, 반대 순서는 2 |
| 스킨 인덱스 `_i0`는 `Skeleton.MatrixToBoneList` 번호. skin 0 = 셰이프 뼈에 강체, 1 = 뼈 로컬 정점, 2~4 = 모델 공간 + 역바인드 | [데이터+실행] |
| 커브는 구간별 3차 계수(값 = c0·s+o + (c1 + (c2 + c3·t)·t)·t·s). 전 클립 60fps 정수 프레임으로 구워도 원커브 재계산과 오차 ≤ 2e-7 | [실행] |
| 텍스처 참조: 재질 `TextureRef` 이름 = 같은 아카이브의 `<이름>.bntx`. `.ftxb` = 그 bntx의 역슬래시 경로 문자열 | [데이터] 49,489개 참조·17,583개 ftxb 전부 |
| BNTX: 전 17,583개가 BRTI 플래그 0x09, 타일 모드 0(블록 리니어), 텍스처당 파일 1개. 배열·큐브·3D 모두 자체 디스위즐로 풀림 | [데이터+실행] |
| HDR 텍스처(BC6H: `rad irr lmp gi …`)는 1을 넘는다(mg1801 라이트맵 최대 75.25). 8비트 png로는 잘린다 → `.hdr` 함께 출력 | [실행] |
| 재질 근사: 셰이더 슬롯 `_a0 _n0 _r0 _m0 _e0`가 albedo·normal·roughness·metallic·emissive, 베이크 슬롯 `gi_diffuse_texture2d`(lmp/gi)·`global_ao_texture2d`(ao)·`shadow_mask_texture2d`(sdw)는 베이크 UV(`static_opt_bake_texture_uv_index`)를 쓴다 | 슬롯↔텍스처 [데이터], 의미 [추정] |
| 캐릭터는 셰이더 그래프 재질이라 텍스처 좌표 변환이 셰이더 안에 있다. 마리오 몸통은 v′ = 0.5 + 0.5·v로 맞는다 | [실행: 렌더 관측][추정] |
| `env/*.fmdb`·`dir_light`·`post`는 그릴 모델이 아니라 **파라미터 컨테이너**(셰이더 `container/*`)다 | [데이터] |
| `pc*_light.fmdb`(22종)는 조명이 아니라 **경량 모델**(정점 30~50%↓, 얼굴·머리 키셰이프·fluid 없음) | [데이터] |
| `_outline00` 모델은 채소 뒤에 놓는 납작한 실루엣 메시(흰 기본색, 텍스처 끔)다. 화면 전체 툰 외곽선은 별도 기능(`static_opt_toon_*`) | [데이터], 렌더 [실행] |

---

## 2. 분석 대상과 자료 위치

| 항목 | 위치 |
|---|---|
| 원본 | Super Mario Party Jamboree US v0, RomFS `Archive/*.bea` → `extracted/bea/<아카이브>/…` ([docs/00](../analysis/00_extraction_pipeline.md)) |
| mg1801 에셋 | `extracted/bea/mg~mg1801.nx.bea/mg/mg1801/{model,env}/…`, 이펙트 `_Vfx/mg/mg1801/ConvertList.xml` |
| 캐릭터 | `chara~pc01.nx.bea/chara/pc/pc01_mario/model/…`, 모션 `chara~pcMot_<그룹>.nx.bea/chara/pc/pc01_mario/motion/pc01_<그룹>_*.{fskb,fshb,fvbb,ftsb.fmab}` |
| 엔진 공용 | `_SystemLighting`, `_SystemBuiltinPostFx`, `libbex~libbexgfx~libexgfx_resident`(셰이더 `forward_plus.bfsha` 경로는 main 문자열) |
| FRES 리더 | [BfresLibrary](../../../tools/oss/BfresLibrary)(수정 안 함) |
| 도구(이 문서) | `web/tools/analysis/graphics_bfres2gltf/`(C#, [README](../../tools/analysis/graphics_bfres2gltf/README.md)), `web/tools/analysis/graphics_bntx.py`, `web/tools/analysis/graphics_convert.py`, `web/tools/analysis/graphics_verify/` |
| 변환 결과 | `extracted/converted/graphics/{mg1801,pc01}/{model,tex,anim,meta}/`, `manifest.json`, `verify_three.json`, 통계 `stats/{fres_stats,bntx_stats}.json`, 스크린샷 `shots/` |

---

## 3. 로딩 흐름 (그래픽 쪽에서 본 것)

자세한 아카이브·경로 규칙은 [06_scene_data.md](06_scene_data.md) 1절. 여기서는 그래픽 리소스가 어떻게 이어지는지만 적는다.

1. 게임 코드가 전역 가상 경로로 모델을 붙인다. 예: mg1801 `MapImpl::Initialize` → `AddComponent<ComMatter>("mg/mg1801/env/mg1801_env.fmdb")` [판독, 06 인용].
2. `.fmdb`의 재질은 텍스처를 **이름**(`TextureRef.Name`, 예 `mg1801_obj00_alb`)으로만 가진다. 같은 아카이브의 `…/textures/<이름>.bntx`가 그 텍스처다. 옆의 `<이름>.ftxb`는 그 bntx의 경로 문자열(`mg\mg1801\model\textures\mg1801_obj00_alb.bntx`, 역슬래시, 끝 NUL 없음)이다.
   - 전 게임 모델 5,547개의 텍스처 참조 49,489개가 **모두 같은 아카이브 안에서** 풀린다 [데이터, `stats tex.resolve`].
   - 17,583개 ftxb가 모두 같은 폴더의 같은 이름 bntx를 가리킨다 [데이터].
3. 애니는 모델과 같은 이름이거나(`mg1801_obj00.fskb`), 캐릭터는 `motion/<접두사><모션>.<확장자>`로 따로 온다(06 2.2절). 한 모션 이름이 `.fskb`(뼈)·`.fshb`(키셰이프)·`.fvbb`(뼈 가시성)·`.ftsb.fmab`(재질) 네 파일로 나뉜다.
4. 장면 환경은 `env/<장면>_env.fmdb`(IBL·포그), `_dir_light.fmdb`(방향광), `_post*.fmdb`(포스트)와 `*.fsnb`(카메라)다. 런타임 처리는 [07](07_camera_lighting.md).

웹은 같은 구조를 그대로 둔다: 모델 glb는 이미지 URI로 `tex/<이름>.png`를 가리키고(공유 텍스처 중복 없음), 비스켈레탈 애니는 별도 JSON이다.

---

## 4. FRES 9 포맷

### 4.1 분리 파일 구조 [데이터]

전 파일 버전 `9.0.1.0`(VersionMajor 9, Minor 1)이다(`stats file.version`).

| 확장자 | BEA 타입 | 수 | 담긴 것 | 읽기 | 상태 |
|---|---|---|---|---|---|
| `.fmdb` | `_G3DMDL` | 5,547 | 모델 1개(뼈·셰이프·재질·버텍스 버퍼) | BfresLibrary | [실행] 전부 로드 |
| `.fskb` | `_G3DSKA` | 22,897 | 스켈레탈 애니 1개 | BfresLibrary | [실행] |
| `.fmab` | `_G3DMAA` | 21,176 | 재질 애니 1개(셰이더 파라미터·텍스처 SRT·패턴·색) | BfresLibrary(`MaterialAnims`는 internal → 리플렉션) | [실행] |
| `.fvbb` | `_G3DVBA` | 20,152 | 뼈 가시성 애니 | BfresLibrary | [실행] |
| `.fshb` | `_G3DSHA` | 13,839 | 키셰이프 애니 | **자체 파서**(4.7.3) — BfresLibrary v9 경로가 틀림 | [실행] |
| `.fsnb` | `_G3DSNA` | 899 | 씬 애니(카메라). 라이트·포그 애니는 전 게임 0개 | BfresLibrary | [실행] |

재질 애니 파일 이름의 중간 확장자는 의도를 나타낼 뿐 구조는 같다: `.ftsb.fmab` 19,130(텍스처 SRT·유틸리티 파라미터, 캐릭터 표정), `.fmab` 1,761, `.fclb.fmab` 171(색, 예 `material_emissive_color`), `.ftpb.fmab` 67(텍스처 패턴), `.fcmb.fmab` 47(예 `material_utility_parameter0`) [데이터].

### 4.2 스켈레톤

| 항목 | 값 | 수준 |
|---|---|---|
| 회전 저장 | `EulerXYZ` 5,545 / `Quaternion` 2 모델. Euler면 `Rotation.xyz` 라디안, w는 1(무시) | [데이터] |
| 회전 순서 | `R = Rz·Ry·Rx` (열벡터, X가 먼저 적용) | [데이터] 4.2.1 |
| 로컬 변환 | `T·R·S`, 월드 = 부모 월드 · 로컬 | [데이터] 바인드 검사로 확인 |
| 스케일 모드 | 모델 `Standard` 5,349 / `Maya` 197 / `None` 1. 클립 `Standard` 21,506 / `Maya` 1,391 | [데이터] |
| 세그먼트 스케일 보정 | 클립 뼈 7,828개에 `SegmentScaleCompensate` 플래그 | [데이터], 영향 [미확정] |
| 빌보드 뼈 | 전 게임 0개 | [데이터] |
| 바인드 때 숨은 뼈 | 1,205개(`Bone.Visible = false`) | [데이터] |
| 뼈 유저데이터 | `bex_no_transit_bone` 130, `bex_limit_transit_bone` 48, `select00..04`(mg1117), `LightAutoSetup` 19, `BEZ_ANIM_TRANSIT` 4 | [데이터], 의미는 09 |
| 뼈 수 분포 | 1개 2,493 모델, ≤16 3,000여, 최대 ≤1024 | [데이터] |

#### 4.2.1 회전 순서 확인 [데이터]

`pc01_mario`의 스무스 행렬 뼈 73개에 대해, 바인드 TRS로 계산한 월드 행렬 × 파일의 `Skeleton.InverseModelMatrices[SmoothMatrixIndex]`가 단위 행렬과 최대 3.3e-7 차이 난다(`R = Rz·Ry·Rx`). 반대 가설 `R = Rx·Ry·Rz`는 최대 2.0 차이다. 근거: `meta/pc01_mario.json` `bindCheck`.

- BfresLibrary v9에서 `Bone.InverseMatrix`는 0행렬로 읽힌다. 역바인드는 `Skeleton.InverseModelMatrices`(스무스 행렬 번호 순)에 있다 [실행].

### 4.3 셰이프·버텍스

| 항목 | 내용 | 수준 |
|---|---|---|
| 셰이프 | `Shape` = 버텍스 버퍼 1 + 재질 1 + LOD 메시 1~4 + (선택) 키셰이프. 이름 규칙 `<노드>__<재질>` | [데이터] |
| LOD | 셰이프당 1개 31,365 / 3개 1,611 / 4개 330 / 2개 94. LOD는 같은 버텍스 버퍼를 공유하고 인덱스만 다르다. 전환 기준은 모델 컨테이너 재질 `render_info_lod_screen_ratio`(예 `0.6,0.3,0.2,0.1`)와 `LodMode_ScreenRatio`(main 문자열) | 구조 [데이터], 전환 규칙 [추정] |
| 프리미티브 | 전부 삼각형 목록. 인덱스 u16 33,286 / u32 114. 실제 인덱스 = 값 + `Mesh.FirstVertex` | [데이터] |
| 셰이프 가시성 뼈 | `Shape.BoneIndex`. 뼈 가시성 애니·로직이 이 뼈를 끄면 셰이프가 안 그려진다 | 구조 [데이터], 동작 [추정: nn::g3d 규약] |

#### 버텍스 속성 [데이터, `stats vtx.attrib` 상위]

| 이름 | 뜻 | 대표 형식(개수) |
|---|---|---|
| `_p0` | 위치 | `32_32_32_Single` 26,855, `16_16_16_16_Single`(half) 6,545 |
| `_n0` | 노멀 | `10_10_10_2_SNorm` 33,238 (w = 1) |
| `_t0` | 탄젠트, w = ±1 부호 | `10_10_10_2_SNorm` 17,570, `8_8_8_8_SNorm` 2,708 |
| `_b0 _b1` | 바이노멀 | `16_16_16_16_Single` 49 |
| `_u0.._u3` | UV | `16_16_Single` 8,665, `16_16_UNorm` 1,500, `8_8_UNorm` 602 |
| `_g3d_02_<A>_<B>` | **UV 두 벌 묶음**: xy = A, zw = B(빈 이름 = 안 씀). 예 `_g3d_02_u0_u1` 12,389, `_g3d_02__u3` 1,530 | `16_16_16_16_Single` 등 |
| `_c0.._c3` | 정점 색/용도 데이터 | `8_8_8_8_UNorm` 9,061 |
| `_i0` `_w0` | 스킨 인덱스·가중치 | `_i0 8_UInt / 8_8_UInt / 8_8_8_8_UInt`, `_w0 16_16_16_16_UNorm` 등 |
| `_p1..` `_n1..` | 키셰이프 타깃 위치·노멀 | `32_32_32_Single` |

- 재질의 `ShaderAssign.AttribAssigns`가 셰이더 입력 → 버텍스 속성을 잇는다. `_u0 = _g3d_02_u0_u1` 6,274, `_u2 = _g3d_02_u2_u3` 672, `_u2 = _g3d_02__u3` 374. 즉 **셰이더 `_uN` ← 묶음이면 xy = UV N, zw = UV N+1** [데이터].
- 정점 색 `_c*`가 무엇에 쓰이는지는 셰이더 옵션마다 다르다(`static_opt_mul_vertex_base_color`, 외곽선 색 `static_opt_toon_vertex_outline_color_index` 등) [추정].

#### 스키닝 [데이터+실행]

| skin count | 셰이프 수 | 정점 공간 | 웹 처리 |
|---|---|---|---|
| 0 | 32,525 | `Shape.BoneIndex` 뼈의 로컬 | 그 뼈 노드의 자식 강체 메시 |
| 1 | 383 | `_i0`가 가리키는 뼈의 로컬 | 바인드 월드를 곱해 모델 공간으로 옮기고 가중치 1 스킨 |
| 2~4 | 492 | 모델 공간(바인드 자세) | 역바인드 행렬 스키닝 |

- `_i0` 값은 `Skeleton.MatrixToBoneList`의 인덱스(= 뼈의 `SmoothMatrixIndex`)다. `Shape.SkinBoneIndices`(셰이프가 쓰는 뼈 목록)의 인덱스가 아니다. 근거: `mario_face` `_i0` 범위 50..67 ↔ skinBones 64·71·75·76·81·82의 SmoothMatrixIndex 50·56·60·61·66·67 [데이터].
- 가중치 수는 최대 4다(`_i1/_w1` 없음) [데이터].
- three.js에서 바인드 자세 스키닝 결과가 저장 위치와 최대 1.0e-6 차이 [실행, `verify_three.json`].

#### 키셰이프 [데이터]

- `Shape.KeyShapes` 첫 키가 기본형(셰이프 이름과 같음, 예 `mario_face`), 나머지가 타깃이다. 타깃 k의 위치는 버텍스 속성 `_p<k>`다(마리오 얼굴 `_p1.._p6`).
- 키셰이프를 가진 셰이프는 전 게임 81개, 키 2~10개(캐릭터 얼굴·머리, `bd07_honeycomb` 등) [데이터].
- 웹: glTF morph target(`POSITION` = `_pk − _p0`), 이름은 `mesh.extras.targetNames`.

### 4.4 재질

#### 4.4.1 셰이더 [데이터, `stats mat.shading`]

| 아카이브/셰이딩 모델 | 재질 수 | 뜻 |
|---|---|---|
| `forward_plus/forward_plus_color` | 12,726 | 일반 그리기(PBR + 툰 요소). 셰이더 바이너리는 `libbex/libbexgfx/resident/shader/material/forward_plus.bfsha`(main 문자열) |
| `container/model_buffer` | 551 | **그리지 않는** 모델 설정: 데칼 그림자, LOD, 임포스터, 오라(`mdl_*` 파라미터) |
| `container/environment` | 260 | 장면 IBL 큐브·포그·라이트그리드(`env_*`) |
| `container/directional_light` | 250 | 방향광(`directional_light_*`) |
| `container/posteffect` | 250 | 톤맵·블룸·DOF·FXAA·컬러그레이딩(`posteffect_*`) |
| `container/point_light` / `spot_light` | 134 / 68 | 점·스포트 광원 |
| `container/skybox` / `global` | 27 / 9 | 하늘, 전역 |
| `fluid/fluid` | 71 | 캐릭터 발·몸 젖음 높이/속도 맵(`cha_*_hgt`, `_vlc`) |
| `d_buffer/d_buffer` | 6 | 데칼 버퍼 |
| `bezel_post_fx` 12, `bezel_billboard`·`bezel_lens_flare`·`bezel_light_renderer`·`bezel_sky` 각 1 | 16 | 엔진 내장 |

`container/*`·`fluid`·`d_buffer`·`bezel_*` 셰이프는 화면에 그리는 메시가 아니다. 변환기는 기본으로 빼고 `extras.skippedShapes`에 남긴다.

#### 4.4.2 재질 구성 요소

| 요소 | 내용 | 예(mg1801 `mt_vegetable00`) |
|---|---|---|
| 샘플러 목록 | 재질 샘플러 이름(`_a0`, `_n0`, `_s0` …) i번째 = `TextureRefs[i]` | `_a0 → mg1801_vegetable00_alb`, `_r0 → _rgh`, `_n0 → _nml` |
| `SamplerAssigns` | **셰이더 슬롯 → 재질 샘플러**. 슬롯 이름이 의미를 가진다 | `_a0=_a0, _n0=_n0, _r0=_r0` |
| `ShaderOptions` | `static_opt_*` 약 120개 문자열 값 | `base_color_texture=1, normal_texture=1, roughness_texture=1, metallic_texture=0, shading_type=1, toon_depth_outline=1` |
| `RenderInfos` | 그리기 단계 설정 | `render_info_draw_shadowmap`, `render_info_draw_decal_shadow`, `render_info_write_mask_stencil` |
| `ShaderParams` | 균일 값 | `material_base_color (1,1,1)`, `material_roughness 0.5`, `material_metallic 0`, `material_toon_hue_offset 0.1`, `material_texture_srt0..3` |
| 샘플러 상태 | wrap(Wrap/Mirror/Clamp), 필터, 밉 | 전부 Wrap·Bilinear·Linear 밉 |

- 슬롯 이름 ≠ 재질 샘플러 이름일 수 있다. 마리오 `body_m`: 셰이더 `_r0`(거칠기) ← 재질 `_s0` = `pc01_body_rgh`, 셰이더 `_m0`(금속) ← 재질 `_r0` = `pc01_body_mtl` [데이터]. **반드시 `SamplerAssigns`를 거쳐 푼다.**

#### 4.4.3 셰이더 슬롯 ↔ 텍스처 이름 접미사 [데이터, `stats tex.slot->suffix` 상위]

| 셰이더 슬롯 | 텍스처 접미사(개수) | 의미(근사용) |
|---|---|---|
| `_a0` | `alb` 9,153 | 기본색(sRGB) |
| `_n0` | `nml` 8,126 | 노멀(BC5 SNORM, RG만) |
| `_r0` | `rgh` 7,318 | 거칠기(BC4) |
| `_m0` | `mtl` 2,489 | 금속도(BC4) |
| `_e0` | `emi` 451, `alb` 239 | 발광 |
| `global_ao_texture2d` | `ao` 3,578 | 베이크 AO |
| `gi_diffuse_texture2d` | `lmp` 2,067, `gi` 1,979 | 베이크 라이트맵(BC6H HDR) |
| `shadow_mask_texture2d` | `sdw` 1,585, `shadow` 333 | 베이크 그림자 마스크 |
| `local_specular_texturecube` / `local_diffuse_texturecube` | `rad` 2,156 / `irr` 1,132 | 국소 IBL(반사/확산) 큐브 |
| `env_common_{diffuse,specular}_texturecube` | `irr` 238 / `rad` 237 | 장면 IBL(배경용) |
| `env_char_{diffuse,specular}_texturecube` | `irr` 227 / `rad` 229 | **캐릭터 전용** IBL |
| `env_mip_fog_texturecube0` | `irr` 63, `fog` 53 | 밉 포그 색 큐브 |
| `sss_curvature_texture2d`, `sss_diffusion_map_texture2d` | `cvt` 54, `lut_arr` | 피부 SSS 곡률·확산 LUT(캐릭터) |
| `height_texture2d`, `velocity_texture2d` | `hgt`, `vlc` 69 | fluid 셰이더 |
| `pack_texture2d0/1` | `a`/`b`, `alb`/`nml` | 묶음 텍스처(`static_opt_pack_texture`) |
| `sg_utility_texture2d0..7`, `sg_utility_texture2darray0..3` | 여러 가지 | **셰이더 그래프 전용 입력**(의미는 그래프마다 다름) |
| `mdl_decal_shadow_1_texture_texture2d` | `shadow00` 148 | 모델 컨테이너의 발밑 데칼 그림자 |

UV 선택: PBR 텍스처는 `static_opt_pbr_texture_uv_index`(0이 12,720/12,726), 베이크 텍스처는 `static_opt_bake_texture_uv_index`(0 7,674 / 1 4,513 / 3 494 / 2 45) [데이터]. 즉 라이트맵·AO는 대부분 UV0 또는 UV1이다.

#### 4.4.4 주요 정적 옵션 분포 [데이터, forward_plus 12,726개 기준]

| 옵션 | 분포 | 웹 근사에서의 쓰임 |
|---|---|---|
| `static_opt_shading_type` | 1: 10,997 / 0: 1,639 / 2: 80 / 3: 9 / 4: 1 | 마리오 body = 2. 값의 뜻 [미확정] |
| `static_opt_state_type` | 0: 11,073 / 2: 764 / 1: 737 / 4: 102 / 3: 42 / 7: 6 / 6: 2 | 0 = 불투명. 1은 mg1801 `line01`(불투명도 0.5, 반투명 띠)에서 확인 → 반투명 [추정]. 2 이상 [미확정] |
| `static_opt_punchthrough` | 1: 1,322 | 알파 테스트(`material_punchthrough_threshold`, 기본 0.5) [추정] |
| `static_opt_two_side` | 1: 829 | 양면 |
| `static_opt_base/normal/roughness/metallic_texture` | 1: 10,074 / 8,699 / 7,796 / 4,062 | 텍스처 사용 여부 |
| `static_opt_emissive_color(_texture)` | 1: 1,706 / 715 | 발광 |
| `static_opt_mul_vertex_base_color` | 1: 925 | 정점 색 곱 |
| `static_opt_gi_diffuse_texture` / `global_ao_texture` / `shadow_mask_texture` | 1: 4,305 / 3,682 / 2,100 | 베이크 라이팅. 이런 면은 `directional_lighting_enable = 0`인 경우가 많다(mg1801 `mt_floor00`, `mt_obj00`) |
| `static_opt_diffuse_ibl_type` / `specular_ibl_type` | 0/1/2 | 캐릭터 = 1 |
| `static_opt_toon_depth_outline` / `toon_normal_outline` | 사실상 전부 1 | 화면 공간 툰 외곽선(깊이·노멀 기반) [추정] |
| `static_opt_receive_shadow` | 1: 4,665 | 그림자 받음 |
| `static_opt_fog` | 1: 3,604 | 포그 |
| `static_opt_water_enable` / `refraction_enable` | 1: 175 / 259 | 물·굴절(셰이더 그래프 동반이 많다) |
| `static_opt_vat_type` | 2: 15 / 3: 13 | 정점 애니 텍스처(`*_pos` `*_rot` R16G16B16A16 float) |
| `static_opt_shader_graph` | 1: 3,981 | **셰이더 그래프**(`fragment/vertex_shader_graph_color` 해시). 캐릭터·물 등. 원본 식을 모른다 |
| `static_opt_texture_srt0..3` | 1: 2,147 / 214 / 232 / 131 | `material_texture_srt0..3`(TexSrt, 모드 Maya) UV 변환. fmab가 움직인다 |

### 4.5 텍스처 참조 (.ftxb) [데이터]

- 내용 = 아카이브 루트 기준 bntx 경로, 구분자 `\`, NUL 없음. 예 46바이트 `mg\mg1801\model\textures\mg1801_obj00_alb.bntx`.
- 재질은 이 파일을 직접 가리키지 않는다. 이름이 같은 텍스처를 쓴다(3절 2).

### 4.6 애니메이션 커브

#### 4.6.1 AnimCurve (Switch, 0x30 B) [판독: BfresLibrary 로더 + 데이터]

| 오프셋 | 필드 |
|---|---|
| +0x00 u64 | 프레임 배열 오프셋 |
| +0x08 u64 | 키 배열 오프셋 |
| +0x10 u16 | 플래그: bit0-1 프레임 형식(0 f32, 1 s16/32 고정소수, 2 u8), bit2-3 키 형식(0 f32, 1 s16, 2 s8), bit4-6 커브 형식(0 cubic, 1 linear, 2 baked float, 4 step int, 5 baked int, 6 step bool, 7 baked bool) |
| +0x12 u16 | 키 수 |
| +0x14 u32 | 대상 오프셋(애니 데이터 구조체 안 바이트 오프셋) |
| +0x18 f32 ×5 | start, end, scale, offset, delta |

평가(프레임 f, 구간 i: `F[i] ≤ f < F[i+1]`, `t = (f − F[i]) / (F[i+1] − F[i])`, `s = scale`(0이면 1), `o = offset`):

```
cubic : v = K[i][0]·s + o + (K[i][1] + (K[i][2] + K[i][3]·t)·t)·t·s
linear: v = K[i][0]·s + o + K[i][1]·s·t
step  : v = K[i][0] (+ o, 정수형)
f ≤ F[0] → K[0][0]·s + o,  f ≥ F[n−1] → K[n−1][0]·s + o
```

- 스켈레탈 커브 형식 분포: `Cubic, 프레임 u8, 키 s16` 1,620,307 / `Cubic u8 s8` 190,013 / 그 밖 소수. Linear는 1,024개. 전 클립 `Baked = False` [데이터].
- wrap(pre/post): Clamp/Clamp 1,892,537, 그 밖(Repeat, 3) 약 3,600 [데이터]. ~~변환은 0..FrameCount 안만 쓰므로 영향 없음~~ → **정정(2026-10-08)**: 커브 구간 [start, end] 가 클립 길이보다 짧거나 엇갈린 Repeat 커브가 있어(물 흐름 30~1800f 주기, 뼈 키 −50~490f 등) 끝값 고정으로 구우면 흐름이 멈춘다. 변환기 `Curves.cs` 가 pre/post wrap(Repeat·Mirror)을 원본대로 접는다. 다시 만든 파일·시험은 shell/plaza_3d.md §8.
- 프레임이 소수인 커브 3,387개(이펙트 모델 등) [데이터]. 정수 프레임 베이크는 키 사이 값을 그대로 샘플하므로 문제 없다.
- 이 식을 C#(변환기)과 파이썬(`curve_check.py`)으로 따로 구현해 three.js 재생값과 대조했다(10절).

#### 4.6.2 스켈레탈 애니(.fskb) [데이터]

| 필드 | 값 |
|---|---|
| FrameCount | 클립 길이(프레임). 분포 ≤64 9,502 / ≤32 5,751 / ≤128 3,592 … 최대 ≤65536 |
| Loop | True 12,279 / False 10,618 |
| 회전 | 전부 EulerXYZ(라디안) |
| BoneAnim | 뼈 이름, `FlagsBase`(초기값 S/R/T 존재), `FlagsCurve`(어느 성분에 커브), `FlagsTransform`(ScaleOne/RotateZero/TranslateZero/SegmentScaleCompensate) |
| 대상 오프셋 | 0x04/08/0C = 스케일 xyz, 0x10/14/18 = 이동 xyz, 0x20/24/28/2C = 회전 xyzw |

뼈 값 = 초기값(없으면 Transform 플래그의 1/0, 그것도 없으면 바인드 값) 위에 커브 성분을 덮어쓴 것. 회전은 Euler → `Rz·Ry·Rx`.

- 프레임레이트: 원본은 고정 60fps(`boot.nbinit`)이고 FrameCount는 그 프레임 수로 보인다. 마리오 `rhy_knife_idle00` 30프레임, mg1801 채소 클립(FRES 이름 `mg1801_obj0N`, 게임 코드의 모션 이름 `move`) 30프레임이 BPM 120의 1박 0.5초와 같다 [데이터][추정: 60fps 단위]. 클립 재생 속도(BPM/120 배속 등)는 로직이 정한다([mg1801.md](../minigame/mg1801.md) 7절).
- 원본 재생 시스템(블렌드·전환)은 [09_character.md](09_character.md).

### 4.7 그 밖의 애니

#### 4.7.1 뼈 가시성(.fvbb) [데이터]

- `Names` = 뼈 이름 목록, `BaseDataList` = 초기 표시 여부, 커브(StepBool)의 대상 오프셋 = 이름 목록 번호.
- FrameCount 0인 파일이 17,680/20,152(초기값만, 커브 없음). 마리오 `rhy_knife_*.fvbb`도 0프레임·전부 표시다.
- 웹: `anim/<파일>.json` `{ bones: { <뼈>: [[frame, 0|1], …] } }`(바뀌는 프레임만). 그 뼈를 `visBone`으로 갖는 메시를 켜고 끈다.

#### 4.7.2 재질 애니(.fmab) [데이터]

- 재질마다 `ParamAnimInfo`(파라미터 이름, 커브 시작·개수, 상수 시작·개수)와 `PatternAnimInfo`(샘플러 이름, 커브 번호, 기본 텍스처 번호 → `TextureNames`).
- 대상 오프셋은 파라미터 구조체 안 바이트 오프셋이다: TexSrt = `0x00 모드(u32), 0x04/0x08 스케일, 0x0C 회전, 0x10/0x14 이동`, Float4 = `0x00/04/08/0C`.
- 애니되는 파라미터 상위: `material_utility_parameter0/1`, `material_texture_srt1/2`(캐릭터 `.ftsb.fmab` 표정·눈), `material_mul_opacity`, `material_emissive_color` [데이터].
- mg1801: `mg1801_line01.fmab` 120프레임 = `material_mul_opacity` 0 → 0.7 → 0.2 왕복(판정 띠 깜빡임), `mg1801_water00.fmab` 3,600프레임 = `material_texture_srt1` 이동(물결 흐름) [실행: 베이크 JSON].
- 웹: `anim/<파일>.json` `{materials: {<재질>: {params: {<파라미터>: {"<오프셋>": 상수 | [프레임별 값]}}, patterns: {<샘플러>: [[frame, 텍스처]]}}}}`.

#### 4.7.3 키셰이프 애니(.fshb) — BfresLibrary v9 오류 [데이터]

BfresLibrary `Switch/ShapeAnimParser`는 v9에서 카운터 순서를 잘못 읽는다(FrameCount = 65,536, VertexShapeAnim 0개로 나옴). 실제 배치(FSHA 블록 시작 기준, 오프셋 u64는 파일 절대 위치):

| 오프셋 | 필드 |
|---|---|
| +0x00 | `FSHA` |
| +0x04 u32 | 플래그(bit2 루프) |
| +0x08..0x38 u64 | 이름, 경로, 바인드 모델, 바인드 인덱스, VertexShapeAnim 배열, 유저데이터 배열, 유저데이터 사전 |
| +0x40 u32 | FrameCount |
| +0x44 u32 | BakedSize |
| +0x48 u16 ×4 | 유저데이터 수, VertexShapeAnim 수, KeyShapeAnim 수, 커브 수 |

VertexShapeAnim(0x30 B): `+0 이름(셰이프 전체 이름, 예 mario_face__body_m), +8 커브, +0x10 기본 가중치(f32 × (키−1)), +0x18 KeyShapeAnimInfo 배열, +0x20 u16 커브 수, +0x22 u16 키 수, +0x24 i32 시작 커브, +0x28 i32 시작 키`. KeyShapeAnimInfo(0x10 B): `+0 이름, +8 s8 커브 번호, +9 s8 서브 바인드`.

- 전 게임 13,839개 중 커브 있는 것 3,500, 상수만 10,339. 키 이름 59종(`fcl_L/R_eye_{close,tight,half,open,sad,angry}_shp`, `shp_hair_in_shp` 등) [데이터].
- 유저데이터 `blink` 2,673개는 따로 겹칠 깜빡임 클립 파일 이름(예 `pc01_fcl_blink00.fshb`), `shift`·`shift_rec`·`bezel_physical_animation`도 있다 [데이터]. 쓰임은 09.
- 변환기는 `Fsha.cs`로 읽어 glTF `weights` 채널 클립 `<모션>_shape`를 만든다.

#### 4.7.4 씬 애니(.fsnb) — 개요

- 카메라만 있다(라이트·포그 애니 0개). 플래그: `Perspective` 707, `EulerZXY, Perspective` 170, 루프 22. 즉 대부분 **Aim 모드**(위치 + 주시점 + twist) [데이터].
- 대상 오프셋 0x00 near, 0x04 far, 0x08 aspect, 0x0C fovy(라디안), 0x10~0x18 위치, 0x1C~0x24 회전 또는 주시점, 0x28 twist [판독: BfresLibrary].
- 변환기 `anim` 명령이 프레임별 배열로 굽는다. mg1801 `cam00` = 정지, pos (0,2,23), aim (0,3,−3), fovy 0.349066 rad(20°), near 0.1, far 10000, aspect 1.78 [데이터].
- 런타임(어느 카메라를 언제, twist 부호, EulerZXY 행렬)은 [07_camera_lighting.md](07_camera_lighting.md).

### 4.8 장면 파라미터 컨테이너 (env / dir_light / post) — 개요 [데이터]

그리는 메시 없이 재질 파라미터만 쓰는 모델이다. mg1801 값(런타임 해석은 [07](07_camera_lighting.md)):

| 파일 | 셰이더 | 주요 값 |
|---|---|---|
| `env/mg1801_env.fmdb` | `container/environment` | 큐브: `env_common_diffuse = mg1801_bg00_irr`, `env_common_specular = mg1801_bg00_rad`, `env_char_diffuse = mg1801_cha_irr`, `env_char_specular = mg1801_cha_rad`, `env_mip_fog = bg00_irr`. `env_mip_fog_enable 1`, start 80, end 150, intensity 0.5. `env_height_fog_enable 0`, `env_lightgrid_enable 0`, `env_cloud_shadow_enable 0` |
| `env/mg1801_dir_light.fmdb` | `container/directional_light` | 뼈 회전 (−1.221731, 0, −0.174533) rad = (−70°, 0, −10°), 위치 (−1.05, 5.09, 0.33). `directional_light_color (0.8,0.8,0.8)`, `transform_overwrite 1`, `overwrite_rotation (−60,−30,−10)`(도로 보임), 그림자맵 near 1 / far 30 / 배열 4 / lambda 0.5 |
| `env/mg1801_post.fmdb` | `container/posteffect` | `tonemap_type 1`, exposure 1, `fxaa 1`, `bloom 1`(threshold 1, intensity 1), `dof 1`(focal 17, region 25, far transition 7), 컬러 그레이딩 0, 모션블러 0 |
| `env/mg1801_post_result00.fmdb` | 같음 | 결과 화면용: DOF focal 20, region 30, far transition 15, bloom clip 1000 |

- 방향광 기준 벡터(어느 축을 회전하는지)와 `overwrite_rotation`·뼈 회전 중 무엇을 쓰는지는 [미확정] → 07.
- 텍스처 `*_irr`(32² 큐브, 밉 1)·`*_rad`(128² 큐브, 밉 8)는 BC6H UFLOAT [데이터]. 이름대로 irradiance / 프리필터 radiance로 보인다 [추정]. 밉 수준과 거칠기 대응 [미확정].

### 4.9 VFXB 이펙트 — 개요

`_Vfx/<경로>/ConvertList.xml`(이름은 xml이지만 매직 `VFXB`, 이펙트 시스템 nn::vfx2)와 셰이더 `ConvertList.xml.bnsh`, `.compute.bnsh`. mg1801 파일 안에 ESTA(이미터 세트 4개: `mg1801_steam00` 등)·EMTR 18·GRTF(BNTX 텍스처 묶음)·PRMA/G3PR(FRES 프리미티브) 태그가 있다 [데이터]. 텍스처는 VFXB 안 BNTX라서 같은 디스위즐 도구로 풀 수 있다 [추정]. 구조·런타임·웹 파티클 설계는 [08_effects.md](08_effects.md).

### 4.10 boot.nbinit 그래픽 값 [데이터]

| 모듈 | 값 |
|---|---|
| CoreSystem | 기준 1920×1080, `FrameRateMode_Fixed`, `FixedFrameRate_Fps60`, `FixUpdateSubStepFps 60` |
| `bezel_graphics_core_init` | 샘플러·텍스처 뷰 디스크립터 슬롯 각 2,048 |
| `bezel_render_pipeline_init` | 클리어 색 (0.25,0.25,0.25,1), PC 창 1600×900(개발용) |
| `bezel_particle_fx2_init` | 이미터 1,024, 이미터 세트 256, 리소스 128, 스트라이프 200 / 슈퍼 400, GPU 버퍼 16 MiB, 버퍼 텍스처 800×450 |
| `bezel_gui_layout_init` | 레이아웃·폰트 상수 버퍼 각 10 MiB, 동적 텍스처 공유 96 |

렌더러 기능 이름(main 심볼 `bex::gfx::*`): 평면 반사, 데칼 그림자, 캐릭터 그림자맵, 보조 IBL 블렌드, 구름 그림자, 톤맵(exposure/offset/output scale), DOF, FXAA, 스텐실 마스크, 동적 해상도(`RendererModule::IsDynamicResolutionEnabled`) [데이터: 심볼]. 동작은 판독하지 않았다.

---

## 5. BNTX 4.1

### 5.1 파일 구조 [데이터]

| 위치 | 필드 | 값 |
|---|---|---|
| +0x00 | `BNTX` + 패딩 | |
| +0x08 u32 | 버전 | 전부 `0x00040100`(4.1) |
| +0x0C | BOM `FF FE`, 정렬, 주소 크기 | |
| +0x20 | `NX  ` | |
| +0x24 u32 | 텍스처 수 | **전부 1**(파일 하나 = 텍스처 하나) |
| +0x28 u64 | BRTI 포인터 배열 | |
| +0x30 u64 | 데이터 블록(BRTD) | |

### 5.2 BRTI (텍스처 정보, nn::gfx ResTextureInfo) [데이터 + BNTX-Extractor 구조]

| 오프셋 | 타입 | 필드 | 관측값 |
|---|---|---|---|
| +0x10 | u8 | 플래그 | **전 17,583개 0x09** |
| +0x11 | u8 | 저장 차원 | 2 = 2D(17,554), 3 = 3D(29) |
| +0x12 | u16 | 타일 모드 | 전부 0(블록 리니어) |
| +0x14 | u16 | 스위즐 | 전부 0 |
| +0x16 | u16 | 밉 수 | 1~14 |
| +0x18 | u32 | 샘플 수 | 1 |
| +0x1C | u32 | 형식(상위 바이트 = 채널 형식, 하위 = 타입: 1 UNORM, 2 SNORM, 5 FLOAT, 6 SRGB, 0x0A UFLOAT) | 5.3 |
| +0x20 | u32 | GPU 접근 | 전부 0x21 |
| +0x24 | i32 ×4 | 너비, 높이, 깊이, 배열 길이 | |
| +0x34 | i32 | 텍스처 레이아웃: bit0-2 = 블록 높이 log2(GOB 단위), bit4-6 = 블록 깊이 log2(3D) | 2D 4 (8,593), 3 (4,481), 2, 0, 1 / 3D LUT `0x40` |
| +0x38 | i32 | 레이아웃 2 | `0x10007` |
| +0x50 | u32 | 이미지 크기(모든 레이어·밉) | |
| +0x54 | u32 | 정렬 | 512 |
| +0x58 | u8 ×4 | 채널 매핑 R,G,B,A(0 = 0, 1 = 1, 2..5 = R,G,B,A) | `RGBA` 6,528, `RRR1` 3,982, `RG01` 3,180, `RGB1` 2,901, `RRRG` 809 … |
| +0x5C | u8 | 뷰 차원 | 1 2D 15,542, 3 Cube 1,860, 5 2DArray 152, 2 3D 29 |
| +0x60 | u64 ×3 | 이름, 부모, 밉 포인터 배열 | |

- **플래그 0x09**: docs/01이 BNTX-Extractor가 이 바이트를 타일 모드로 읽는 문제를 적었다. 실제 타일 모드는 +0x12(u16)이고 +0x10은 플래그 바이트다. 전 텍스처가 같은 값이라 데이터로 비트 의미를 가를 수 없다. 이 값을 무시하고 블록 리니어로 풀면 2D·배열·큐브·3D가 모두 정상 영상이 된다(5.5) [실행]. 비트 0x08의 의미는 **[미확정]**(nn::gfx 텍스처 정보 플래그로 보이나 해당 SDK 함수 이름이 main에 없다).
- 배열·큐브의 레이어 간격 = 이미지 크기 / 배열 길이. 전 텍스처에서 나누어떨어진다 [데이터]. 레이어 안 밉 위치는 밉 포인터 배열(레이어 0 기준)을 그대로 쓴다.

### 5.3 형식 분포 [데이터, `stats/bntx_stats.json`]

| 형식 | 개수 | 바이트(전 밉) | 대표 용도 |
|---|---|---|---|
| BC4_UNORM | 3,897 | 1.01 GB | rgh, mtl, ao, sdw, 마스크 |
| BC1_SRGB | 3,700 | 1.04 GB | alb |
| BC5_SNORM | 3,105 | 1.93 GB | nml |
| BC6H_UFLOAT | 2,506 | 0.82 GB | rad, irr, lmp, gi(HDR) |
| BC3_SRGB | 841 | 0.33 GB | 알파 있는 alb, 데칼 그림자 |
| BC5_UNORM | 805 | 0.36 GB | rgh(2채널, 715개. 둘째 채널 의미 [미확정]), flow |
| ASTC (4×4~12×12, SRGB/UNORM) | 1,662 | 0.40 GB | 보드·kb 맵 등 큰 배경(8×8 838, 12×12 587) |
| BC7_SRGB / BC7_UNORM | 278 / 202 | 0.28 GB | 캐릭터 alb, 묶음 텍스처 |
| BC1_UNORM, BC3_UNORM, BC4_SNORM, BC6H_FLOAT | 164, 65, 50, 19 | | |
| R8_UNORM/SNORM, R8G8_UNORM/SNORM, R8G8B8A8_UNORM/SRGB | 116+10, 25+48, 16+46 | | 그라데이션, 속도맵(`vlc`), LUT |
| `0x15` R16G16B16A16 FLOAT | 27 | | VAT `*_pos`·`*_rot`, BRDF LUT(`AmbientBrdfPbrRg16f`) |
| `0x0F` R11G11B10 FLOAT | 1 | | `Prefiltered_DefaultSkyboxTexture` |

- 합계 17,583개, 이미지 데이터 6,103.6 MiB(파일 크기 합 `_TEXDATA` 6,122.8 MiB에서 헤더·정렬을 뺀 크기).
- sRGB는 형식 타입(6)으로만 표시된다. alb·emi는 SRGB, rgh/mtl/nml/ao/lmp는 선형 [데이터: suffix→format 표].
- 크기: 512² 4,918, 256² 3,958, 1024² 3,309, 128² 2,420, 2048² 298 … 정사각이 아닌 것도 있다(1024×2048 캐릭터 alb 등).

### 5.4 배열·큐브·3D 텍스처 [데이터+실행]

| 종류 | 수 | 예 | 레이어 의미 |
|---|---|---|---|
| 큐브(6면) | 1,860 | `*_rad`, `*_irr`, `*_fog`, `sky00_ibl_sky` | +X −X +Y −Y +Z −Z 순 [추정: nn::gfx 표준 순서, 영상으로 확인 안 함] |
| 2D 배열 `*_arr_*` | 캐릭터 `body_arr_alb/nml`(2), `eye_arr_alb`(2), `lut_arr`(2), NPC `body_arr_alb`(3~6) | 레이어 0 = 기본 색. 레이어 1 = 회청색 변형(마리오) — 쓰임 [미확정]. 셰이더 그래프 `sg_utility_texture2darray*`가 읽는다 |
| 2D 배열(그 밖) | 보드 숫자판 `bd06_blackboard_number_arr`(10), `mg0905_panel_mask`(25) | 프레임·패턴 선택 |
| 3D | 29 | `LutColorFilterNeutral16`(16³ RGBA8 sRGB), `bd02_map_lut` 등 컬러 그레이딩 LUT | 블록 깊이 16 GOB(`layout = 0x40`) |

- 3D LUT 확인: `LutColorFilterNeutral16`를 풀면 슬라이스 z, 행 y, 열 x의 값이 정확히 (16x, 16y, 16z)다(0..240) — 항등 LUT로 맞는다 [실행]. 웹에는 가로로 슬라이스를 이어 붙인 256×16 png로 낸다.

### 5.5 디스위즐 (Tegra X1 블록 리니어) [실행: 자체 구현 `web/tools/analysis/graphics_bntx.py`]

```
GOB = 64 B × 8 행 (512 B). 블록 = 1 GOB 너비 × gobH GOB 높이 (× gobD 깊이)
행 바이트 = ceil(w/bw)·bpp, gobsX = ceil(행 바이트 / 64)
주소(x 바이트, y 행) = (y / (8·gobH))·512·gobH·gobsX + (x / 64)·512·gobH + ((y % (8·gobH)) / 8)·512
                     + ((x % 64) / 32)·256 + ((y % 8) / 2)·64 + ((x % 32) / 16)·32 + (y % 2)·16 + (x % 16)
mip0: gobH = 1 << (layout & 7) 그대로. 작은 밉: 블록 행 수 ≤ gobH/2·8 이면 gobH 를 반으로 줄인다
3D : 블록 = (z / gobD)·blocksY·gobsX + (y / 8gobH)·gobsX + x/64, 블록 안 (z % gobD)·gobH·512 + …
```

- 디코드: BC1~BC7은 Pillow `bcn`, ASTC는 `texture2ddecoder`(pip), BC6H는 Pillow(8비트, 잘림) + `imagecodecs.bcn_decode`(float16) 두 가지로 낸다. SNORM은 `v·0.5 + 0.5`로 png에 담는다.
- 확인한 것: BC1/BC3/BC4/BC5/BC6H/BC7/ASTC 4×4·6×6·8×8·12×12/R8G8 SNORM/RGBA8 3D 표본이 모두 정상 영상 [실행, 스크래치 접촉 시트]. 전 17,583개를 다 풀어 보지는 않았다(mg1801 114개·pc01 14개는 전부).

### 5.6 HDR(BC6H) [실행]

| 텍스처 | 최댓값(float) | 8비트 png에서 255 포화 비율 |
|---|---|---|
| `mg1801_map00_lmp`(라이트맵) | 75.25 | 12.5% |
| `mg1801_cha_rad`(캐릭터 반사 큐브) | 108.69 | 6.4% |
| `mg1801_bg00_rad` / `mg1801_water00_rad` | 108.69 / 114.0 | — |
| `mg1801_map01_lmp` | 35.72 | 1.8% |
| `mg1801_bg00_irr` / `mg1801_cha_irr` | 0.90 / 0.77 | 0% |

라이트맵·반사 큐브는 1을 크게 넘는다. 변환은 BC6H마다 `<이름>[_NN].hdr`(Radiance RGBE)를 함께 쓰고 메타에 `hdrMax`를 남긴다. RGBE 왕복 오차 최대 0.47(최댓값 75.25 대비 0.6%) [실행].

---

## 6. 좌표계·단위·회전 규약

| 항목 | 값 | 근거·수준 |
|---|---|---|
| 축 | Y 위, 오른손, 화면 안쪽 = −Z(카메라는 +Z에서 −Z를 본다) | mg1801 cam00 pos (0,2,23) → aim (0,3,−3), 채소 z 0·플레이어 z −2(mg1801.md 4.5·4.6)가 카메라 앞뒤 순서와 맞고, 렌더(`shots/mg1801.png`)에서 무대가 화면에 정상으로 잡힌다 [데이터+실행] |
| 단위 | 모델 정점 = 월드 단위, 변환 없음. 1 단위 ≈ 1 m | 마리오 키 1.545, 의자 높이 0.84~1.0, 바닥 상면 y 0, 판정 띠 `line01` y 1.17~1.67(판정 y 1.5와 맞음) [데이터], m [추정] |
| 화면 높이 | cam00 fovy 20°, 거리 23 → z 0에서 보이는 y 약 −1.1~6.9. 채소 등장 y 7.5는 화면 위 바깥, 판정 y 1.5는 띠 안 | 계산 + 렌더 [실행] |
| 뼈 회전 | EulerXYZ, R = Rz·Ry·Rx | 4.2.1 [데이터] |
| 로직 회전 | mg1801 `rot0 = (−π/2, 0, 0)` 등 로직 오일러도 같은 규약으로 읽힌다 [추정: 엔진 공용 Vector3f 회전] — 로직 문서 쪽에서 확인할 것 |
| UV | glTF와 같은 원점(좌상단 0, v 아래로). png 첫 행 = 위. 뒤집지 않는다 | 비셰이더그래프 재질(채소·무대) 렌더가 맞음 [실행] |
| 탄젠트 | `_t0.w` = ±1(비트탄젠트 부호) | [데이터] |
| 노멀맵 | BC5 RG, Z 재구성. 녹색 채널 방향(OpenGL/DirectX) | [미확정] |
| 시간 | 1 프레임 = 1/60 초 | `boot.nbinit` [데이터] |

---

## 7. glTF 변환 규칙 (웹 명세)

변환기 사용법은 [web/tools/analysis/graphics_bfres2gltf/README.md](../../tools/analysis/graphics_bfres2gltf/README.md). 여기서는 웹 코드가 기대할 규칙만 적는다.

### 7.1 노드·메시

| 원본 | glb | 웹에서 할 일 |
|---|---|---|
| 모델 | 노드 0 `<모델>__model`, 장면 `<모델>__scene` | 모델 배치(위치·회전·크기)는 로직 state가 준다 |
| 뼈 | 같은 이름 노드, 바인드 TRS. `extras.boneIndex`, 숨은 뼈 `extras.visible = false` | 붙이기 훅(`attach_R_hand`, `attach00` …)은 이름으로 찾아 자식으로 붙인다 |
| 셰이프 | `<셰이프>__mesh`, `extras.visBone` / `skinCount` / `material` / `lods` / `uv` / `custom` | 뼈 가시성 = `visBone` 뼈가 꺼지면 메시 숨김 |
| LOD | LOD0 인덱스만. 버텍스 버퍼는 LOD 공용이라 안 쓰는 정점이 남는다(마리오 몸통 정점 11,977, LOD0 삼각형 6,125) | 필요하면 `--lod n`으로 따로 만든다 |
| 키셰이프 | morph target | 클립 `<모션>_shape`의 `weights` |
| container·fluid·d_buffer·bezel 셰이프 | 뺌, `extras.skippedShapes` | — |

mg1801 채소: 본체 `mg1801_obj0N.fmdb`는 0.01 크기 더미 사각형(`lambert1`) + 훅 뼈 `attach00..`이고, 조각 `mg1801_obj0N_<i>.fmdb`가 훅에 붙는다. 조각 모델은 뼈 `<채소><k>`·`_fast00`·`_just00`·`_slow00` 아래 셰이프 네 벌을 가진다. 판정 결과 뼈만 켜는 것이 `ApplyCutBoneVisible`이다([mg1801.md](../minigame/mg1801.md) 6.2). 렌더 확인에서는 `_fast/_just/_slow`를 숨기고 기본 조각만 켰다.

### 7.2 클립

- 스켈레탈: 정수 프레임 0..FrameCount 전부 키(LINEAR), 시간 = 프레임/60. 모든 뼈의 T·R·S 채널. `extras = {frames, loop, fps, scaleMode, missingBones}`.
- 끝 프레임을 정확히 보려면 three `LoopOnce + clampWhenFinished`로 두고 로직이 시간(프레임)을 감는다(LoopRepeat는 t = 길이에서 0으로 돈다).
- 키셰이프: `<모션>_shape`(weights). 마리오 `rhy_knife_idle00_shape`는 상수(머리 `shp_hair_in_shp` = 1, 눈 0).
- fvbb·fmab·fsnb: 별도 JSON(4.7).

### 7.3 재질 근사 (원본 셰이더 재사용 불가)

BNSH/BFSHA 셰이더 바이너리는 웹에서 쓸 수 없다. glb에는 glTF PBR 근사 + `extras.fres`(옵션·파라미터·샘플러 원값 전부)를 넣는다. 웹 재질은 `MeshStandardMaterial`(또는 이후 커스텀 셰이더)로 만들고 아래 규칙을 쓴다.

| glTF/three | 출처 | 조건 |
|---|---|---|
| `map`(sRGB) | 슬롯 `_a0` | `base_color_texture ≠ 0` 또는 셰이더 그래프 |
| `color` × `opacity` | `material_base_color`, `material_mul_opacity` | 항상 |
| `normalMap` | 슬롯 `_n0`(BC5 → Z 재구성 png) | `normal_texture ≠ 0` 또는 셰이더 그래프 |
| `roughnessMap`/`metalnessMap` | `_r0`, `_m0`을 합친 `<rgh>__<mtl>.mr.png`(G = 거칠기, B = 금속) | 텍스처 있으면 factor 1, 없으면 `material_roughness`·`material_metallic` |
| `emissiveMap`, `emissive` | `_e0`, `material_emissive_color × emissive_color_scale`(1 초과는 `KHR_materials_emissive_strength`) | `emissive_color(_texture)` |
| `aoMap`(UV = 베이크 UV) | `global_ao_texture2d` | `global_ao_texture = 1` |
| `lightMap`(UV = 베이크 UV, HDR) | `gi_diffuse_texture2d`(`lmp`/`gi`, `.hdr`) | `gi_diffuse_texture = 1`. glb에는 넣지 않았다(`extras.fres.samplers`에 있음) — 웹 재질 팩토리가 붙인다 |
| `alphaTest` | `material_punchthrough_threshold` | `punchthrough = 1` |
| `transparent` | — | `state_type ≠ 0` [추정] |
| `side = DoubleSide` | — | `two_side = 1` |
| `envMap` | 장면 env 컨테이너의 common(배경)·char(캐릭터) 큐브 | 캐릭터 재질은 char 큐브, 나머지는 common [추정: 슬롯 이름] |
| UV 변환 | `material_texture_srt0..3`(Maya 모드) + fmab | `texture_srt0..3 = 1`. 모드별 행렬 식 [미확정] |

- 베이크 라이팅 면(`directional_lighting_enable = 0` + 라이트맵)은 방향광을 받지 않게 해야 원본과 비슷하다 [추정].
- 툰 요소(`material_toon_hue_offset`, `toon_brightness_intensity`, 화면 공간 외곽선)는 근사하지 않았다. 외곽선은 포스트 패스(깊이·노멀 엣지)로 따로 만들어야 한다 [추정] → 07.
- 원본 그림에 그림자·외곽선·틴트를 임의로 더하지 않는다(DESIGN.md 7). 위 근사는 원본 데이터가 켜는 기능만 옮긴다.

### 7.4 셰이더 그래프 재질(캐릭터 등)

- 마리오 `body_m`은 `static_opt_shader_graph = 1`, `shading_type = 2`이고 고정 텍스처 옵션(`base_color_texture` 등)을 끈 채 `sg_utility_texture2darray*` 슬롯으로 같은 텍스처를 읽는다 [데이터]. 변환기는 이 경우에도 `_a0 _n0 _r0 _m0` 슬롯 텍스처를 붙인다(배열은 레이어 0).
- 그대로 그리면 몸통 색이 어긋난다. 몸통·머리 셰이프에서 **v′ = 0.5 + 0.5·v**로 샘플하면 모자(빨강 + M 로고)·멜빵 청바지·갈색 신발·장갑이 모두 맞는다(`shots/mario_uvfix_1.png`, 영역별 UV 표본 대조) [실행: 렌더 관측][추정: 원본 그래프 식 미확인]. 얼굴(눈꺼풀) 셰이프와 눈동자(`_a1 = pc01_eye_arr_alb`)는 맞추지 못했다.
- 1024×2048 텍스처의 아래 절반이 몸통 아틀라스, 위 절반이 눈꺼풀·얼굴 변형이다 [데이터: 텍스처 영상]. 레이어 1(회청색)과 `lut_arr`·`cvt`(SSS)·`wet_mask`의 쓰임은 [미확정] → 09.

### 7.5 `_outline00`와 `_light` 모델

| 모델 | 정체 | 근거 |
|---|---|---|
| `mg1801_obj0N_outline00.fmdb` | 채소 뒤(z 0 평면)에 놓는 납작한 실루엣 메시. 재질 `mt_obj00`(forward_plus, `base_color_texture = 0`, 기본색 흰색, 조명 받음). 셰이프 2개(실루엣 + `<채소>_just00` 뼈에 붙은 조각)는 뼈 가시성으로 바뀐다 | [데이터], 렌더에서 당근 둘레 흰 띠 [실행]. 표시 규칙은 mg1801.md 6.10 |
| `pc*_<이름>_light.fmdb` | 같은 재질의 경량 모델. 22쌍 모두 정점 감소(pc01 13,073 → 6,694), 얼굴·머리 키셰이프 셰이프와 fluid 셰이프 없음, 뼈 감소(pc01 94 → 81: `F/T_hair*`, `*_eyeline_*`, `fluid_*`, `NDinput_0`) | [데이터]. 어느 장면이 쓰는지 [미확정] → 09. 06의 "라이트 리그" 추정은 맞지 않는다 |

---

## 8. 웹 전달 형식과 용량

| 원본 | 지금 변환 | 제안 | 비고 |
|---|---|---|---|
| BC1/3/4/5/7, ASTC (LDR) | png(mip0만) | 1단계 png → 2단계 KTX2(UASTC/ETC1S, `KTX2Loader`) | 용량: mg1801 BNTX 30.2 MB(전 밉) → png 24.1 MB(mip0) |
| BC6H (HDR) | png(잘림) + `.hdr` | `.hdr`(RGBELoader / `HDRCubeTextureLoader`), 또는 KTX2 RGBA16F | mg1801 `.hdr` 3.7 MB |
| 큐브 | 면별 `_00.._05` | `CubeTextureLoader`/`HDRCubeTextureLoader` 순서 [px,nx,py,ny,pz,nz] | 면 순서 [추정] |
| 2D 배열 | 레이어별 png | `DataArrayTexture`가 필요하면 세로로 이어 붙여 올린다 | |
| 3D LUT | 가로 띠 png(16 슬라이스 × 16) | `Data3DTexture` | 값 = 16·i(항등) |
| 밉 | 버림 | GPU 생성(`generateMipmaps`). 원본 밉 그대로가 필요하면 KTX2 | 원본 밉 수 1~14 |
| sRGB | `manifest.textures.*.srgb` | alb·emi만 `SRGBColorSpace` | |
| 모델 | glb(이미지 외부 참조) | 그대로. meshopt/Draco 압축은 이후 | mg1801 glb 6.2 MB, 마리오 2.4 MB(경량 1.3 MB) |

전 게임 텍스처는 BNTX 6.1 GiB다. 웹에는 게임별로 필요한 아카이브만 변환한다(06 1.7절의 의존 아카이브 표).

---

## 9. 웹 포팅 구조와 구현 순서

### 9.1 모듈 (웹 권장 이름, 원본 이름 아님)

| 모듈 | 책임 | 입력 → 출력 |
|---|---|---|
| `view/assets.ts`(기존) | manifest·glb·png·hdr·json 로드 | URL → three 객체 |
| `view/gfx/model.ts` | glb 인스턴스화, 뼈 맵, 훅 붙이기, `visBone` 메시 표, SkinnedMesh `frustumCulled = false` | glb → `ModelInstance { root, bones, meshesByVisBone, attach(name, child) }` |
| `view/gfx/material.ts` | `extras.fres` → three 재질(7.3 표), 라이트맵·IBL 연결, 셰이더 그래프 예외(7.4) | 재질 extras + env → `Material` |
| `view/gfx/anim.ts` | 클립 재생(프레임 → 시간), 뼈 가시성 트랙, 재질 애니 트랙 | 로직 state(모션 이름·프레임·뼈 표시) → 노드/재질 갱신 |
| `view/gfx/env.ts` | env/dir_light/post 컨테이너 해석 | 메타 JSON → 조명·IBL·포스트 설정(07) |

로직 → 화면 단방향(DESIGN 4): 모션 이름·프레임·뼈 표시는 로직 state에 있고 화면은 읽기만 한다.

### 9.2 갱신 의사코드

```ts
// 매 렌더 프레임 (로직 step 이후)
for (const inst of instances) {
  inst.root.position.copy(state.pos); inst.root.rotation.set(rx, ry, rz, 'ZYX');   // 로직 오일러, 규약은 6절
  const clip = inst.clips[state.motion];
  clip.action.time = Math.min(state.motionFrame, clip.frames) / 60;              // LoopOnce + clamp, 로직이 감는다
  for (const [bone, vis] of state.boneVisible) for (const m of inst.meshesByVisBone[bone] ?? []) m.visible = vis;
  for (const t of inst.matTracks) t.apply(state.matFrame);                         // fmab 베이크 JSON
}
mixer.update(0);
```

### 9.3 구현 순서

1. `graphics_convert.py`에 게임 세트 추가 → `extracted/converted/graphics/<set>/` 확인 → 필요한 것만 `web/assets/<game>/`로 복사(manifest 형식은 [web/assets/README.md](../../assets/README.md)).
2. `model.ts`(뼈·훅·가시성) — mg1801 채소 본체 + 조각 + 외곽선으로 시험.
3. `material.ts` 기본 PBR(7.3) → 라이트맵·AO(베이크 UV) → IBL(char/common).
4. `anim.ts` 스켈레탈·셰이프 → 가시성 → 재질 트랙.
5. 셰이더 그래프 재질·툰 외곽선·포스트는 07·09 결과를 보고 커스텀 셰이더로.

### 9.4 원본과 같게 지켜야 할 것

- 뼈 이름·계층·바인드 값(가시성·훅이 이름에 의존).
- 회전 순서 Rz·Ry·Rx, 프레임 = 1/60초, 클립 끝 프레임 처리(LoopOnce + clamp, 루프는 로직).
- 텍스처는 원본 그대로(색 보정·외곽선 추가 금지). 근사는 재질 계산에서만.

### 9.5 웹 때문에 바꾸는 것

| 원본 | 웹 | 동등성 |
|---|---|---|
| 커브 실시간 평가 | 정수 프레임 베이크 + LINEAR | 정수 프레임에서 원커브와 오차 ≤ 2e-7(10절). 프레임 사이 값은 선형 보간이라 3차 커브와 미세하게 다를 수 있다. 로직이 정수 프레임만 쓰면 같다 |
| BCn/ASTC GPU 압축 | png | 디코드 값 동일(손실 없음), 밉은 재생성 |
| BC6H HDR | `.hdr` RGBE | 상대 오차 ≤ 0.6% |
| forward_plus 셰이더 | MeshStandardMaterial 근사 | 같지 않다. 근사 항목은 7.3 |

---

## 10. 검증 — 실제로 돌린 것

모두 이 저장소의 도구로 실행했다. 원본(Switch) 실행·원본 화면 대조는 없다.

| 검사 | 방법 | 결과 |
|---|---|---|
| FRES 전수 로드 | `graphics_bfres2gltf stats extracted/bea` | 84,510개 실패 0 [실행] |
| BNTX 전수 헤더 | `graphics_bntx.py stats` | 17,583개, 플래그 0x09 전부, 레이어 간격 나누어떨어짐 전부 [실행] |
| 텍스처 참조 해석 | stats `tex.resolve`, ftxb 경로 검사 | 49,489개 같은 아카이브, ftxb 17,583개 같은 폴더 bntx [실행] |
| 회전 규약 | 바인드 월드 × 파일 역바인드 | 오차 3.3e-7(반대 순서 2.0) [실행] |
| glb 독립 로드 | three.js `GLTFLoader`(노드, 텍스처 스텁) `web/tools/analysis/graphics_verify/check.ts` | mg1801 43개·pc01 2개: 메시 수·정점 수·삼각형 수 = 변환 메타, 뼈 이름 누락 0, 클립 길이 = 프레임/60, 바인드 자세 스키닝 오차 ≤ 1.02e-6, 오류 0 [실행] (`verify_three.json`) |
| 커브 베이크 대조 | 파이썬으로 원커브(`dump --keys`) 재평가 vs three `AnimationMixer` 샘플(프레임 0, 중간, 끝−1) `curve_check.py` | 마리오 idle/swing 66건 최대 차 T 2.8e-8, Q 1.8e-7, S 0 / 채소 `move`·물·화살표 전부 ≤ 1e-7 [실행] |
| 키셰이프 클립 | 자체 FSHA 파서 | idle 30프레임 루프(채널 2, 상수), `apj_apl_damage00` 44프레임 커브 6개 [실행] |
| 텍스처 디코드 | 접촉 시트 육안 | BC1·BC5 SNORM·BC6H 큐브·BC7 배열·ASTC 8×8/12×12·R8G8 SNORM 정상, 3D LUT 항등 정확 [실행] |
| HDR | RGBE 왕복 | 최대 오차 0.47 / 75.25 [실행] |
| 헤드리스 렌더 | `shot.ts`(크로미움 + three, 원본 텍스처, 조명은 단순 근사) | `shots/mg1801.png`: cam00 값으로 무대·의자 4개·채소(판정 높이)·외곽선이 화면에 정상 배치. `shots/mario.png`: 바인드·idle 15·swing 8 자세 정상, 칼 훅 정상, 몸통 색 어긋남(7.4) → `mario_uvfix_1.png`에서 맞음. 콘솔 오류는 favicon 404 하나 [실행] |

검증하지 않은 것: 원본과 같은 밝기·색(셰이더 근사), 방향광 방향, 노멀맵 녹색 방향, 큐브 면 순서의 원본 근거, LOD 전환, 세그먼트 스케일 보정 클립, 전 텍스처 디코드.

---

## 11. 미확정 사항과 필요한 근거

| 항목 | 지금 아는 것 | 확인 방법 |
|---|---|---|
| BRTI 플래그 0x08 비트 | 전부 0x09라 데이터로 못 가름. 무시해도 디코드 정상 | nn::gfx 텍스처 초기화 함수 디스어셈블(main에 SDK 심볼이 거의 없음) |
| `static_opt_state_type` 1~7 뜻 | 1 = 반투명(line01) 추정 | `forward_plus.bfsha` 옵션 표·블렌드 상태 판독, 또는 값별 재질 표본 비교 |
| `static_opt_shading_type` 0~4 뜻 | 1 일반, 2 캐릭터 | 같음 |
| 셰이더 그래프 식(캐릭터 UV·배열 레이어·SSS·툰) | 몸통 v′ = 0.5 + 0.5·v 관측 | BNSH 그래프 셰이더 디스어셈블(Ryujinx 셰이더 디컴파일러 등) — 09와 협의 |
| 큐브 면 순서 | 표준 순서로 가정 | 하늘 큐브(`sky00_ibl_sky`) 면 영상 대조 |
| 노멀맵 녹색 방향 | — | 볼록 무늬가 뚜렷한 표본을 렌더해 비교 |
| 방향광 기준 축·`overwrite_rotation` 사용 여부 | 이름상 overwrite 우선 | `ComDirectionalLight` 판독 → 07 |
| LOD 전환 | 컨테이너 `lod_screen_ratio` | `ComModelBuffer`/LodMode 판독 |
| 세그먼트 스케일 보정(Maya) 클립 | 1,391 클립 | 해당 클립을 원본 식으로 돌려 비교 |
| TexSrt 모드별 행렬 | 모드 Maya | nn::g3d TexSrt 규약 확인 |
| `_light` 모델 쓰는 장면 | 경량 모델 | characterlist 소비 코드 → 09 |
| 레이어 1(회청색) 배열 텍스처 쓰임 | 셰이더 그래프가 읽음 | 09 |

---

## 부록 A. 변환 산출물 (extracted/converted/graphics/)

| 세트 | 모델(glb) | 텍스처 | 애니 JSON |
|---|---|---|---|
| `mg1801` | 43개: 무대 `bg00 floor00 water00 line00 line01 stool00~03 stool_npc00 result00 soup00~03 arrow00 knife00`, 채소 `obj00~04`(본체 + 클립 30프레임) + 조각 `obj0N_<i>` + `obj0N_outline00` | 114개(png, BC6H 8개는 `.hdr` 함께) | `mg1801_cam00/01/02/cam_capture00.fsnb.json`, `mg1801_line01.fmab.json`, `mg1801_water00.fmab.json` / env·light·post 덤프 `meta/*.dump.json` |
| `pc01` | `pc01_mario`(94뼈, 클립 idle 30 루프·swing 20 + `_shape` 둘), `pc01_mario_light` | 14개 | `pc01_rhy_knife_{idle00,swing00}.{fvbb,ftsb.fmab}.json` |

mg1801 주요 모델 수치: `mg1801_bg00` 정점 9,086 / 삼각형 10,121 / 메시 13, `mg1801_result00` 14,512 / 18,418, `mg1801_obj03_0`(당근 조각) 1,065 / 1,458, `pc01_mario` 13,013 / 6,975(LOD0) [실행].
