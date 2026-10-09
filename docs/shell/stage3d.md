# stage3d — 공용 3D 무대 모듈 (계약·구현 범위·남은 것)

2026-10-08. 위치 `web/script/shell/stage3d/`. 항구(mgmet) 3D 를 위해 만들기 시작했고 **항구 3D 는 사용자 결정으로 중단**했다([mgmet_3d.md](mgmet_3d.md) 머리). 다음 재사용처는 **광장(menu00) 3D**.
상태: 계약(types.ts)·코어(stage.ts)·재질(material.ts)·클립(clip.ts) 까지 작성, tsc 통과. **페이지·시험·에셋이 없어 실제 화면에서 돌려 본 적은 없다.**

## 1. import 경계

[mgm_common.md](mgm_common.md) §9.1 과 같다: 같은 폴더·`three` 만. `script/game/core·games·view·game.ts·env.ts` 금지. 바깥은 `./stage3d` 의 `index.ts` 만 import 한다. 에셋 URL 은 페이지가 `AssetSource{url(path)}` 로 넣는다.

## 2. 계약 (`types.ts`, `stage.ts`)

시간 단위 = 원본 프레임(60fps). `update(dt초)` 안에서 `df = dt·60`, `stage.frame` 누적.

| API | 뜻 |
|---|---|
| `Stage3D.create({ canvas, assets, manifest? = 'manifest.json', antialias? })` | WebGLRenderer(sRGB 출력·PCF 그림자)·`scene`·`camera`(PerspectiveCamera 슬롯)·평행광 `sun`. manifest 를 읽어 `env`(빛 방향·색, 안개, IBL 큐브 이름, 그림자 범위, 배경색)를 적용하고 IBL 큐브를 PMREM 으로 읽는다 |
| `loadModel(name, {visible?})` → `StageModel` | manifest.models[name].url 의 glb 를 읽어 재질 준비(§3)·재질 바꿔치기 후 장면에 올림. `StageModel{ name, root, clips{이름:프레임}, play(clip, {loop, startFrame, speed}) → ClipHandle, setVisible }` |
| `model(name)`, `loadedModels()` | 올린 모델 조회 |
| `getSocket(name)` → `{pos, quat, node}` | 올린 모든 모델에서 노드(로케이터 뼈) 이름 검색, 월드 변환. `socketNames(filter?)` 목록 |
| `prepare(root)` | 밖에서 만든 모델(캐릭터·NPC)의 재질을 원본 옵션대로(ibl_type 1 → cha IBL) |
| `playClip(root, AnimationClip, opts)` → `ClipHandle` | 임의 루트에 클립 재생(무대 update 로 진행) |
| `ClipHandle{ name, frames, loop, frame, speed, playing, isFinished(), stop() }` | 비루프는 마지막 프레임에서 멈춤, time = frame/60 |
| `addUpdater({update(df, frame)})` → 해제 함수 | 프레임 갱신자 |
| `setCameraDriver(d, slot = 'anim')` | 카메라 슬롯 우선순위 `anim`(fsnb 재생기) > `follow`(플레이어 추종) > 자유 시점(페이지). `d.apply(camera, df)` 가 true 면 그 프레임 확정. `stage.cameraDriven` |
| `addMaterialOverride({ match, create(mesh, src, fres, ctx), update?(mat, frame, fmab) })` | 재질 이름(원본 fres.name 또는 three 이름, 문자열·RegExp)으로 바꿔치기(바다 근사 셰이더 등). `ctx = { texture(name), localRad(name), ibl{rad, irr}, sun }`. update 3번째 인자 = 그 재질 이름의 현재 fmab 값 |
| `fmab(file, frame?)` → `FmabSample` / `preloadFmab(files)` | 변환기 anim json(프레임별 구운 값)의 현재 프레임 값 `재질 → 파라미터 → 성분("0x00") → 값`, 루프면 frame mod frames |
| `collider: Collider \| null`, `setCollider(c)` | **선택 기능(기본 null)**. `Collider{ groundHeight(x, z, fromY?) → GroundHit{y, normal, object} \| null, collide(pos, move, radius, height) → 실제 수평 이동 }`. 항구는 소켓 자동 이동이라 안 씀. 광장(menu00) 자유 보행에서 원본 충돌 데이터로 구현해 넣을 자리 |
| `resize(w, h)` · `update(dt)` · `render()` · `dispose()` | |

`StageManifest`(에셋 변환 도구가 만들 것): `models{이름: url·bytes·vertices·triangles·bones·clips}`, `textures{이름: files·srgb·cube}`(라이트맵·IBL·셰이더 그래프 입력 색인), `anims{파일: 'anim/x.json'}`, `env`(위 env 값), `layout?[{name, visible, anim?, group?}]`.

## 3. 현재 구현 범위

- **재질(material.ts)** — mg1801 `view/material.ts` 복사·이식(셸 경계 때문에 import 아님). 그림자 플래그, 평행광 끔, 라이트맵 gi(UV = bake_texture_uv_index, 세기 π×scale), AO = glb occlusionTexture, 확산 IBL = irr 큐브 직접, 반사 = rad PMREM·국소 큐브, contains_ibl, mul_base_color. 추가: 라이트맵 그림자 `shadow_texture2d`(sdw) R 을 평행광에 곱함 [근사·추정: 슬롯 뜻]. 셰이더 그래프 재질은 알베도·라이트맵만 [근사].
- **무대(stage.ts)** — 위 계약 전부. 그림자맵 하나로 카메라 근처 절두체(env.shadow.far) 조각을 덮음 [근사: 원본 캐스케이드]. 안개 = three 선형 Fog [근사]. 톤맵·포스트 없음 [근사].
- **클립(clip.ts)** — glb 구운 fskb 클립을 원본 프레임 시간축으로.

## 4. 남은 것 (광장에 재사용할 때)

1. 장면별 에셋 도구(`web/tools/analysis/<장면>_world_assets.py`): `graphics_convert.py` 세트 → `web/assets/<장면>/world/{model,tex,anim,manifest.json}`, 텍스처 축소(용량 대책)·env 값(env/dir_light/post 컨테이너 dump → `manifest.env`)을 고르는 부분. 아직 하나도 없다.
2. 시험 `web/tools/test_stage3d.ts`(로드 목록·소켓 좌표·클립 길이·import 경계) — 없음.
3. 페이지(자유 시점 카메라)·dev/ui.html 항목 — 없음.
4. 실제 렌더 확인 전이라 sdw 패치·IBL 큐브 면 순서·그림자 범위는 화면으로 검증 필요.
5. ~~광장 전용: Collider 구현~~ → §5 `MeshCollider`(plaza-A). 추종 카메라(follow 슬롯 driver)는 plaza B 갈래.
6. 1번 "페이지·시험 없음" → 광장 페이지(`plaza_page.ts`, index.html?plaza=1)·`test_plaza_world.ts` 로 처음 실제 화면에서 돌림(2026-10-08 짧은 확인 1회).

## 5. 광장(menu00)에서 더한 것 (plaza-A, 2026-10-08) [설계]

광장 갈래 A 가 코어 소유를 이어받아 더한다(계약 추가만, 기존 API 동작 그대로). 광장 쪽 쓰는 법은 [plaza_3d.md](plaza_3d.md) §6.5~6.9.

| 추가 | 뜻 |
|---|---|
| `loadModel(name, { visible?, instance? })` | 같은 glb 를 여러 번 올림(MapStructure 의 `Balloon_*_00/_01`, 갈매기 3마리). 두 번째부터 `SkeletonUtils.clone`, 재질 공유. 모델 조회 키 = instance |
| `assetUrl(path)` | 무대 폴더 기준 URL |
| `MeshCollider`(`meshCollider.ts`) | `Collider` 구현: 원본 삼각 메시(`{vertices, indices}`)·XZ 2 m 격자. 지면 = 수직선 교점 중 `fromY + COLLIDER_STEP(0.5)` 아래 가장 높은 **위향 면**(ny > 0.05; 아래향 밑판 제외, 가파른 위향 면도 STEP 안이면 디딤), 벽 = 원기둥 대 가파른 면 수평 밀어내기 3회, 아랫면은 발 + STEP 에서 시작하는 반구(PhysX autostep 근사). `merge` 로 여러 개 합침. 계단·경사 값은 PhysX 컨트롤러 미판독 [근사] |
| 재질 애니(`materialAnim.ts`) | fmab json 값 중 표준 재질이 쓰는 것(texture_srt0..3 → 텍스처 offset/repeat/rotation, material_mul_base_color·emissive 등)을 프레임마다 그 재질에 넣는다. 셰이더 그래프 재질은 graph.ts 유니폼으로 |
| 셰이더 그래프(`graph.ts`) | 판독 식(manifest `graphs`, tools/analysis/plaza_graph_web.py 가 정리)을 재질 이름(+모델 이름)으로 찾아 three 표준 재질 onBeforeCompile 에 끼움. 이름: uv0..3·c0..2(_C0.._C2)·pos·nrm·worldPos·nrmW / P0..7·C0..3·srtN(uv)·material_*·ENV0..3·mpjMs·T("샘플러", uv)(SNORM 은 2x−1) / Nw·NgW·viewDir·sunDir·Tw·tw·base. 정점 오프셋 world 공간은 모델 행렬 역으로. 조각 식은 emissivemap 뒤 한곳(diffuseColor·roughness·metalness·emissive·normal), ao 는 간접 확산 ×ao·반사 ×min(ao,1). `graphSource(def)` 로 셰이더 조각만 만들 수 있어 시험이 GLSL 컴파일을 확인한다 |
| 굴절(`patchRefraction`) | static_opt_refraction_enable 1: α = refraction_opacity ↔ rim_opacity·(1−N·V)^rim_power, 확산 ×α + 반사·발광 가산(미리 곱한 알파), 굴절 왜곡 없음 [근사] |
| shading_type·state_type | 0 = 무조명(`patchUnlit`), 2 = SSS 확산(`patchSss`, sss_curvature·sss_diffusion_map). state 2 = 더하기, 4 = 곱하기 블렌드(`MaterialSetup.blend`) [판독: plaza_3d.md §6.8] |
| `warmup()` | 숨은·화면 밖 메시까지 compileAsync + initTexture + 한 번 그리기(그림자·후처리) — 첫 등장 렉 제거 |
| 물·굴절·정점색·안개 | `patchWater`(물 합성 근사)·`patchRefraction`·`patchVertexColor`(mul_vertex_base_color)·`material.fog = static_opt_fog` |
| 전역 유니폼 `stage.globals` | time(초)·ms(원본 World[0x4] 자리)·sunDir(평행광 방향)·env(env_utility_parameterN, env fmab 가 움직임) |
| 포스트(`post.ts`) | 원본 bex::gfx 포스트 판독식(plaza_3d.md §6.13): HDR → 블룸(first_down·down 13탭·up 7/9·2/3, 밉 6) → 합성(+블룸·intensity, x = c·exposure + offset, 톤맵 종류 0~4, 비네트, g = t^0.4545898, 3D LUT) → FXAA(마지막 [근사]). `post.set({bloom, lut})` 시험 훅 |
| 하늘(`sky`) | env.sky: 카메라를 따라가는 하늘 모델(glb, 변환기 --all) + 판독식 ShaderMaterial(시선 방향 → 방위각·천정각 uv, 무조명) |
| env 추가 필드 | `post`, `sky`, `pointLights[]`, `envUtility{parameter0..3}`, `fogCube`, `windNoise` |
