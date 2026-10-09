# 에셋 압축 파이프라인 — 소스/배포 분리, KTX2·meshopt·Opus

2026-10-08. 상태: **구현·전체 빌드·헤드리스 대조 완료**(수치는 §9). 작성 형식·확정 수준 표기는 [03_graphics.md](03_graphics.md)와 같다.
여기서 [실행]은 "이 문서의 도구로 돌려 수치를 얻음", [설계]는 원본과 무관한 웹 쪽 결정, **사용자 확인 필요**는 품질·용량 사이에서 기본값을 정해 둔 곳이다.

---

## 1. 목표와 결론

요구: 맵·셰이더·캐릭터 등 에셋을 모바일·PC 공용 압축 형식으로, 용량은 최소로. 나중에 개발 페이지에서 고칠 수 있게 원본(소스)은 그대로 둔다.

| 결론 | 근거 |
|---|---|
| **소스와 배포 산출물을 나눈다.** `web/assets/`(변환기 출력 그대로: PNG·비압축 glb·wav·들여쓴 json)는 손대지 않는 편집용 소스, `web/assets-dist/`는 `tools/build_assets.ts`가 만드는 압축본 | 변환기 20여 개(`tools/analysis/*_assets.py`)의 출력 위치를 그대로 두면 재현 경로가 안 바뀐다 [설계] |
| **모드 전환은 URL 하나**: `?assets=src`(소스) / `?assets=dist`(압축본). 기본값 = 개발 서버 src, 배포 빌드 dist | `script/env.ts` `ASSET_MODE` [설계] |
| 텍스처 = **KTX2(Basis Universal)**. 3D 색·자료 = ETC1S 우선, 품질 기준 미달·노멀 = UASTC(+RDO), 2D UI = 품질 우선(45 dB 넘을 때만 ETC1S, 아니면 UASTC), 글꼴·LUT·큐브·HDR = 무손실 그대로 | §3, 전 텍스처 PSNR 은 `assets-dist/report.json` [실행] |
| 메시·애니 = **EXT_meshopt_compression 무손실** + 애니 회전 int16(KHR_mesh_quantization) + 중복 키 제거(1e-6) | Draco 는 위치·UV·사용자 속성을 양자화해야 이득인데, 이 프로젝트 셰이더 그래프가 `uv1`·`_c0` 를 원값으로 읽어 깨진다 §4 [설계] |
| 소리 = **Opus(.ogg) + AAC(.m4a) 두 벌**(런타임이 Opus 디코드 가능 여부로 고름), 시퀀서 악기 파형만 **FLAC**(무손실, 표본 위치 그대로) | iOS Safari 구버전의 Opus 미지원, 샘플 단위 반복 구간 §5 |
| json = 공백 제거(내용 같음) + 서버 brotli/gzip | §7 배포 설정 |

---

## 2. 소스·산출물·재현 경로

```
extracted/ (원본 추출물, 읽기 전용)
   │  tools/analysis/*_assets.py · graphics_convert.py · charsel_* · plaza_* · mgmcommon_web_assets.py   (변환기 — 바꾸지 않음)
   ▼
web/assets/            소스: PNG(BC 를 푼 원본 해상도)·glb(비압축, 외부 ../tex/*.png 참조)·wav·json   ← 개발 페이지(?assets=src)가 그대로 읽음
   │  npx tsx tools/build_assets.ts   (npm run assets)
   ▼
web/assets-dist/       배포: 같은 경로 구조. png→.ktx2(또는 png 그대로), wav→.ogg+.m4a 또는 .flac, glb→같은 이름(meshopt), json→같은 이름(공백 제거)
   ├ index.json        런타임 이름 바뀜 표 { v, ktx2[], lossy[], flac[] } — 소스 경로 목록
   ├ report.json       파일별 형식·크기·PSNR·GPU 추정, 폴더·형식별 합
   └ build-state.json  증분 캐시(소스 sha1 + 설정 문자열 + 결과)
web/vendor/basis/      three r180 의 basis_transcoder.js·wasm 복사(외부 CDN 안 씀)
```

- **증분**: 소스 내용 sha1·분류·인코더 설정(`TEX_RECIPE`·`MESH_RECIPE`·`AUDIO_RECIPE`)이 같고 산출물이 있으면 건너뛴다. glb 는 참조 텍스처의 결과(ktx2/png)도 키에 넣는다(텍스처 형식이 바뀌면 glb 의 이미지 URI 를 다시 씀). 내용이 같은 PNG 는 한 번만 인코딩해 복사한다. 경로만 바뀐 같은 텍스처·소리(분류·설정까지 같은 키)는 옛 결과를 복사한다(캐릭터 공용 폴더 `chara/` 로 옮길 때 162장, 공용 `common/` 으로 옮길 때 그림 55·소리 8 재인코딩 0 — [chara_assets.md](chara_assets.md), [common_assets.md](common_assets.md)). 30 s 마다 캐시를 저장해 중간에 끊겨도 이어서 한다.
- `--only plaza/world/` 처럼 일부만 다시 만들 수 있다(나머지는 이전 결과 유지). 변환기가 소스를 다시 쓰면 `npm run assets` 한 번이면 바뀐 것만 다시 압축된다.
- 소스에서 사라진 파일의 옛 산출물은 지우지 않고 개수만 알린다(`--prune` 을 주면 지움 — 사용자가 직접).
- 배포 빌드(`npm run build`)는 `assets-dist/`(캐시·보고서 제외)와 `vendor/` 를 `dist/` 에 싣고, 압축본이 소스보다 오래됐으면 경고한다. `npx tsx tools/build.ts --src-assets` 는 소스도 싣고 기본 모드를 src 로 한다(개발 페이지 배포용).

### 2.1 개발 페이지에서 소스/압축 전환

| 하고 싶은 것 | 방법 |
|---|---|
| 에셋을 고치고 바로 확인(개발) | `npm run dev` → 그대로(기본 src). 변환기 출력 = 화면 |
| 압축본으로 같은 화면 확인 | 같은 URL 에 `&assets=dist` (먼저 `npm run assets`) |
| 배포본에서 소스로 비교 | `tools/build.ts --src-assets` 로 만든 배포본 + `?assets=src` |
| 모바일 메모리 절약 시험 | `&texlod=1` — 밉 있는 KTX2 의 가장 큰 단계를 버림(GPU 1/4, 내려받기 같음) |
| 지금 모드·읽은 수 | 콘솔 `__mpjAssets` → `{ mode, stats: { ktx2, ktx2Bytes, png, gltf } }` |

---

## 3. 텍스처

### 3.1 형식 선택

원본(Switch BNTX)은 이미 BC1/3/4/5/7·ASTC 블록 압축이다. 소스 PNG 는 그것을 푼 값이라, 다시 GPU 블록 형식으로 싣는 것은 원본과 같은 성질의 손실을 한 번 더 겪는 일이다. 그래서 PNG(소스) 대비 PSNR 로 기준을 두고, 기준을 못 넘으면 더 좋은 형식으로 올린다.

| 종류(`tools/assets_tex.ts classify`) | 판정 | 형식(시도 순) | 밉 | 색공간(인코더) |
|---|---|---|---|---|
| keep | 글꼴 원본 시트(`font/<FFNT>/<n>.png`, 회색조 → GPU R8, [font_assets.md](font_assets.md)), LUT·램프·SSS 확산표(`_lut`·`_ramp`·`_diff`), 큐브맵 면, 가로·세로가 4의 배수가 아님, 2D 캔버스로 직접 그리는 배경(`modeselect/backdrop_temp.png`) | PNG 그대로 | 소스와 같음 | — |
| ui | 3D 폴더 밖 전부(2D 레이아웃 render2d·lyt) | ETC1S(≥ 45 dB) → UASTC RDO 0.5(≥ 42) → UASTC(≥ 40) → 그래도 미달이면 PNG | 없음(소스도 없음) | 지각(sRGB) |
| color | 3D, sRGB(매니페스트 `srgb`, glb 색 슬롯, 이름 `_alb/_emi`) | ETC1S(Y ≥ 40·RGB ≥ 32·A ≥ 36) → UASTC RDO 1(RGB ≥ 38) → UASTC | 있음(box, sRGB 공간) | 지각 |
| data | 3D, 선형(거칠기·금속·AO·마스크·높이 등) | ETC1S(채널 최소 ≥ 38) → UASTC RDO 1(≥ 38) → UASTC | 있음(box, 선형) | 선형 |
| normal | glb `normalTexture`, 이름 `_nml/_nrm` | UASTC RDO 1(≥ 36) → UASTC | 있음(box, 선형, 재정규화 안 함 = three `generateMipmap` 과 같음) | 선형 |

- 3D 폴더 = `chara/`(캐릭터·NPC 공용, [chara_assets.md](chara_assets.md))·`plaza/world/`·`mg1801/{tex,effect,model}/`. 옛 캐릭터 폴더(`plaza/player/`·`charselect/chara/`·`mg1801/{chara,npc}/`)도 목록에 남겨 둔다(지금은 텍스처 없음).
- PSNR 은 basisu `-stats` 의 0번 밉, 소스 PNG 대비 8비트 채널별 값. "Y" = Rec.709 휘도.
- **작은 텍스처**: KTX2 가 PNG 보다 크고 256×256 이하면 PNG 를 쓴다(내려받기·메모리 둘 다 이득이 없음).
- HDR(BC6H 를 푼 `.hdr`: IBL rad/irr 큐브, 라이트맵 일부)은 basisu 1.16 이 UASTC HDR 을 못 만들고 크기도 6 MB 뿐이라 **그대로**(서버 압축). RGBE 는 brotli 로 잘 준다.
- 밉 필터는 box(three 의 `gl.generateMipmap` 과 같은 2×2 평균) — 소스 모드와 축소 화면이 같게.

**사용자 확인 필요**: 3D 색 ETC1S 기준(Y 40 dB·RGB 32 dB). ETC1S 는 휘도는 매우 좋고(대개 45 dB 넘음) 색차가 4×4 블록 단위로 뭉개진다(경계 몇 픽셀 최대 오차 수십). 화면 대조(§9.2)에서 문제가 보이면 `GATE.color` 를 올리면 그 텍스처만 UASTC 로 바뀐다(증분).

### 3.2 런타임 형식(three r180 KTX2Loader 우선순위)

| 기기 | ETC1S → | UASTC → | 1 픽셀 |
|---|---|---|---|
| PC(BPTC) | BC7 | BC7 | 1 B |
| PC(S3TC 만) | BC1 / BC3 | BC3 | 0.5 / 1 B |
| 모바일(ASTC·ETC2: 최근 iOS·Android 전부) | ETC1/ETC2 RGB(불투명) · ETC2 RGBA | ASTC 4×4 | 0.5 / 1 B |
| 아무것도 없음 | RGBA32 | RGBA32 | 4 B |
| PNG(소스·keep) | RGBA8 | | 4 B (+밉 1/3) |

### 3.3 색공간·flipY·밉 — 소스 모드와 같게

- KTX2 의 DFD sRGB 표시는 인코더의 지각 지표·밉 필터에만 쓰고, 런타임에서는 **모든 KTX2 를 `NoColorSpace` 로 되돌린다**(`assetLoader.ts neutral`). PNG 경로(TextureLoader·GLTFLoader 의 ImageBitmapLoader)가 NoColorSpace 로 시작해 소비자가 sRGB 를 정하는 것과 같아진다(GLTFLoader 는 색 슬롯에 SRGB 를 넣고, stage3d·mg1801 MaterialSetup 은 매니페스트 `srgb` 로, render2d 는 셰이더에서 직접 푼다).
- flipY: 모든 소비자가 false(glTF 규칙)라 KTX2 를 뒤집지 않았다(압축 텍스처는 올릴 때 못 뒤집음).
- 밉: 3D 는 KTX2 안 밉(box)을 쓰고 `minFilter` 는 LinearMipmapLinear(소스의 TextureLoader 기본과 같음). UI 는 밉 없음·LinearFilter(소스 render2d·lyt 와 같음).
- 2D 레이아웃(render2d·lyt)은 그림(Image)으로 텍스처를 만들던 것을 `textureFromImage` 로 바꿔 KTX2 면 같은 GPU 데이터를 쓰는 복제를 만든다(감김 조합마다 텍스처 하나 — 소스와 같은 구조). 9조각 창·글꼴 UV 계산에 쓰는 width/height 는 KTX2 헤더 값.

### 3.4 최대 해상도 정책

- **원본보다 키우지 않는다**(소스 해상도 그대로, 업스케일·패딩 없음). 4의 배수가 아닌 것은 PNG 로 남긴다.
- 모바일 단계 축소는 빌드가 아니라 **런타임 선택지** `?texlod=N`: 밉 있는 KTX2(3D 전부)의 위 N 단계를 버리고 올린다. N=1 이면 3D 텍스처 GPU 메모리 1/4. 내려받기는 그대로라 별도 빌드가 필요 없다. 기본 0. **사용자 확인 필요**: 기기 메모리(`navigator.deviceMemory` ≤ 4 등)로 자동 1 을 줄지.

---

## 4. 메시·애니(glb)

| 항목 | 결정 | 이유 |
|---|---|---|
| 압축 | EXT_meshopt_compression, 필터 없음(정점·인덱스·애니 바이트 무손실) | three `MeshoptDecoder`(wasm, 번들에 들어 있음 — 외부 파일 없음)가 빠르다(수 ms/MB). Draco 는 애니를 못 줄이고 디코더 wasm 이 크다 |
| 양자화 | **위치·UV·법선·사용자 속성은 안 함** | KHR_mesh_quantization 위치 양자화는 노드 변환을 바꾸고, UV·`_C0..` 양자화는 정규화 정수가 되어 셰이더 그래프(`graph.ts`·`npcMaterial.ts`·preview3d)가 원값을 읽는 곳이 깨진다 |
| 애니 회전 | int16 정규화(KHR_mesh_quantization) | 성분 오차 ≤ 1/65534(각 ≈ 3e-5 rad), GLTFLoader 가 float 로 되돌림 |
| 애니 키 | 이웃 보간으로 1e-6 안에서 다시 나오는 키 제거(gltf-transform `resample`) | 처음·끝 키는 남아 클립 길이(`duration`, `track.times` 끝)가 같다 |
| 정점·삼각형 순서 | 바꾸지 않음(reorder 안 함) | 반투명 메시 하나 안의 삼각형 순서 = 그리기 순서 |
| 외부 텍스처 | `../tex/x.png` 참조 그대로, KTX2 가 된 것만 `.ktx2`·`image/ktx2`·`KHR_texture_basisu` | 여러 glb·매니페스트가 같은 텍스처를 나눠 쓴다(넣으면 중복) |

gltf-transform 의 GLB 쓰기는 이미지를 안에 넣어 버리므로 JSON 으로 쓰고 GLB 를 직접 묶는다(`tools/assets_mesh.ts`). meshopt 대체 버퍼(fallback)는 데이터 없이 남는다(GLTFLoader 가 읽지 않음).

**무손실 meshopt 의 효과는 서버 압축과 섞어 봐야 한다**(전 glb 253개 [실행]):

| | 원본 glb | meshopt |
|---|---|---|
| 그대로 | 190.4 MB | 99.3 MB |
| gzip -9 | 70.1 MB | 50.0 MB |
| brotli q9 | 51.0 MB | 40.4 MB |

반복 메시가 많은 장식(예 `menu00_deco_tree05` brotli 157 KB → meshopt+brotli 268 KB)은 원본+brotli 가 더 작지만 합계는 meshopt 가 이긴다.

---

## 5. 소리

| 대상 | 형식 | 이유 |
|---|---|---|
| `*/sound/wave/*.wav`(mg1801 시퀀서 악기 파형 65개) | FLAC(무손실) | 코드가 반복 구간을 원본 rate 의 표본 번호로 계산한다(`view/seq.ts` `loopStart / rate`). 손실 코덱은 짧은 반복 파형에서 이음매 잡음·위상 오차를 낸다 |
| 그 밖(BGM·스트림·SE·음성) | Opus 64 kbps(모노)/128 kbps(스테레오) `.ogg` + AAC-LC 96/160 kbps `.m4a` | Opus 가 같은 음질에서 더 작다. iOS Safari 는 판에 따라 Ogg Opus 를 못 푼다 → 런타임이 20 ms 무음 Opus 를 실제로 decodeAudioData 해 보고 안 되면 .m4a |

- 시작 정렬: Opus 는 pre-skip, AAC(mp4)는 편집 목록으로 인코더 앞 지연을 적어 디코더가 잘라낸다 → 원본과 시작 표본이 같다(§9.4 측정). 리듬 게임 BGM 시작 시각이 바뀌지 않는다.
- 반복 BGM 구간은 초 단위(`loop.startSec`)라 rate 가 바뀌어도(Opus 는 48 kHz 로 풂) 같다.
- BGM(명세가 BGM 라벨로 가리키는 wav)은 통파일에 더해 스트리밍 조각 `<이름>.bgm/NNN.ogg|.m4a`(4 s + 앞뒤 패드 80 ms, 반복 경계에서 자름)를 만들고 `index.json` `streams` 에 배치를 적는다 — 설계·검증: [04_sound.md §12](04_sound.md).
- 런타임: 소리는 페이지마다 fetch → decodeAudioData 로 읽는 곳이 많아(charselect_page·plaza_page·view/audio 등 12곳) 압축 모드에서만 전역 fetch 를 감싸 `.wav` 요청을 바꾼다(`installFetchShim`). 압축본 루트 밖·다른 확장자는 그대로 지나간다 [설계].

---

## 6. 런타임 로더

`script/app/common/render3d/assetLoader.ts` 한 곳. 셸 경계(mgm_common.md §9.1 — stage3d 는 자기 폴더만 import)상 stage3d 안에 두고, 다른 셸·게임 뷰가 import 한다.

| 함수 | 쓰는 곳 |
|---|---|
| `createGltfLoader()` — MeshoptDecoder 늘, KTX2Loader 는 압축 모드만 | stage3d `Stage3D`, charselect `Preview3D`(광장 플레이어·NPC 도), `view/assets.ts`(mg1801), plaza `npc.ts` |
| `loadTexture(url)` — 압축 모드 + index 에 있으면 KTX2, 아니면 TextureLoader | stage3d·mg1801 `MaterialSetup.texture`, preview3d·mg1801 character `loadTex`, mg1801 effects |
| `loadUiImage(url)` / `textureFromImage(img)` | charselect `Render2D`(modeselect·mgmcommon·setplayer·plaza ui 공용), `view/lyt.ts`·mg1801 ui |
| `installFetchShim()` / `audioUrlFor()` | 소리(§5) |

- 모드·경로는 `script/view/assetMode.ts`(main.ts·ui_main.ts 가 맨 먼저 import)가 `env.ts` 값으로 넣는다. 셸은 env 를 import 하지 않는다.
- KTX2 형식 지원은 잠깐 만든 WebGL 문맥에서 확인한다(렌더러 없이 어디서나 텍스처를 읽게). 트랜스코더는 `vendor/basis/`(웹 워커 4개).
- HDR(`.hdr`)·큐브 IBL·LUT 는 바뀌지 않으므로 기존 HDRLoader·HDRCubeTextureLoader 경로 그대로.

---

## 7. 배포 설정 메모(서버)

- `assets-dist/` 의 `.json`·`.glb`·`.hdr`·`.otf`·(이득 있는)`.flac` 와 `index.json` 은 brotli(없으면 gzip)로 보내야 §9.1 의 전송량이 된다. `build_assets.ts` 가 **기본으로** 해시 이름 옆에 `.br`·`.gz` 를 증분으로 만들고(`--no-precompress` 로 끔), `tools/build.ts` 가 번들·html·index.json·sw.js·vendor 것을 만든다 → `server/static.ts`(배포 미리보기 `server/main.ts --dist`·`tools/serve.ts --dist`)가 그대로 보냄, nginx 면 `brotli_static on; gzip_static on;`. 규칙·측정: [loader_manager.md](loader_manager.md) §5.8.4.
- `.ktx2`(ETC1S = BasisLZ, UASTC = zstd)·`.ogg`·`.m4a`·`.flac`·`.png` 는 이미 압축돼 있어 서버 압축을 끈다.
- MIME: `.ktx2` = `image/ktx2`, `.glb` = `model/gltf-binary`, `.wasm` = `application/wasm`(스트리밍 컴파일), `.ogg` = `audio/ogg`, `.m4a` = `audio/mp4`, `.flac` = `audio/flac`.
- 캐시(2026-10-08 6단계): 압축본은 내용 해시 이름(`x.<sha256 8>.ktx2`, 표 = `index.json` `names`) → `Cache-Control: public, max-age=31536000, immutable`. `index.html`·`index.json`·`sw.js`·vendor 만 `no-cache` + ETag. 서비스 워커가 해시 파일을 Cache Storage 에 둔다. 상세 [loader_manager.md](loader_manager.md) §5.8.
- 개발 서버(esbuild serve)는 압축하지 않는다 — 로컬 로드 시간은 디스크·디코드 비용만 본다.

---

## 8. 검증 방법

| 검증 | 도구 | 내용 |
|---|---|---|
| 텍스처 품질 | `build_assets.ts` → `report.json` | 파일마다 시도한 형식·통과 여부·PSNR(R,G,B,A,RGB,Y)·최대 오차 |
| 화면 대조 | `tools/shot_assets.ts` | 같은 장면을 `?assets=src`·`?assets=dist` 로 찍어 픽셀 차이(PSNR·평균·최대·8/24 넘는 비율·열지도 `*_diff.png`). Playwright 가짜 시계(멈춤)+`fast=1` 로 같은 프레임, Math.random 고정 |
| 로드·전송·GPU | 같은 스크립트 | 로드 시간(실제 ms), 자원 바이트(Resource Timing), GPU 텍스처 바이트(WebGL texStorage·texImage·compressedTexImage·generateMipmap·deleteTexture 감싸 살아 있는 합) |
| 소리 | 같은 스크립트 `audio` | 원본 wav 와 압축본을 같은 decodeAudioData(48 kHz)로 풀어 길이 차·시작 어긋남(교차 상관)·SNR |

---

## 9. 결과

### 9.1 용량(전체 빌드 [실행], `assets-dist/report.json`)

소스 2,373 파일(PNG 1,700·glb 253·wav 187·json 145·기타 88). 첫 빌드 1,572 s(16 논리 코어, basisu 4 동시), 색 텍스처 재판정 증분 64 s.

| 폴더 | 소스 MB | 압축본 MB | 전송 추정 MB(json·glb brotli) | +m4a MB(대체 소리) | GPU 소스 MB | GPU PC MB | GPU 모바일 MB |
|---|---|---|---|---|---|---|---|
| mg1801 | 217.4 | 83.6 | 66.1 | 7.6 | 777 | 203 | 165 |
| plaza/world | 208.0 | 124.2 | 95.3 | 0.0 | 946 | 252 | 209 |
| charselect | 110.6 | 47.7 | 40.1 | 2.0 | 561 | 146 | 122 |
| plaza/player | 102.5 | 48.4 | 38.2 | 0.0 | 542 | 136 | 112 |
| plaza/ui | 39.8 | 26.1 | 25.6 | 0.0 | 341 | 223 | 223 |
| mgm01 | 27.3 | 16.7 | 16.7 | 0.1 | 104 | 26 | 26 |
| partyrule | 8.3 | 7.8 | 7.4 | 0.0 | 246 | 240 | 240 |
| mgmet | 8.2 | 7.9 | 7.9 | 0.0 | 37 | 37 | 37 |
| online | 6.6 | 4.5 | 3.9 | 0.2 | 108 | 87 | 87 |
| mgmcommon | 5.8 | 5.1 | 3.8 | 0.1 | 102 | 95 | 95 |
| modeselect | 2.8 | 2.1 | 2.0 | 0.0 | 23 | 19 | 19 |
| setplayer | 2.1 | 1.8 | 1.5 | 0.0 | 51 | 49 | 49 |
| (plaza 합) | 350.3 | 198.7 | 159.1 | 0.0 | 1830 | 611 | 544 |
| **합계** | **739.5** | **376.0** | **308.5** | 10.1 | **3839** | **1515** | **1386** |

- MB = 10⁶ 바이트(`du` 의 711 MiB 와 같은 양). "GPU" 는 그 폴더 텍스처를 **한꺼번에** 올렸을 때(3D 는 밉 포함) 추정 — 실제 한 장면 값은 §9.3.
- 2D 화면 폴더(partyrule·mgmet·mgmcommon·setplayer·online·plaza/ui)는 GPU 가 거의 안 준다: 대부분 **글꼴 아틀라스(무손실 PNG, 45개 660 MB RGBA8)** 몫이다(§10).

| 종류 | 소스 MB | 압축본 MB | 비고 |
|---|---|---|---|
| 텍스처 1,700 | 432.9 | 252.8 | KTX2 1,284 + PNG 416(작은 것 337·글꼴 45·4배수 아님 71·LUT·큐브 등) |
| glb 253 | 190.4 | 95.8(brotli 40.2) | 애니 키 2,439,808 → 1,812,864(−26%), 회전 접근자 22,965 개 int16(최대 성분 오차 1.53e-5), 이미지 참조 KTX2 1,006·PNG 124 |
| 소리 187 | 96.8 | Opus 7.3 + FLAC 5.0 (+AAC 10.1) | 손실 122개 89.4 MB → 7.3 MB(Opus), 무손실 65개 7.4 → 5.0 MB |
| json 145 | 13.2 | 8.8(brotli 0.74) | 공백 제거만 |
| 기타 88(hdr·otf·md) | 6.1 | 6.1(brotli 2.4) | 그대로 |

텍스처 형식별(PSNR = 채널 최소, 소스 PNG 대비):

| 종류:형식 | 개수 | 소스 MB | 압축 MB | 최소 PSNR | 평균 PSNR |
|---|---|---|---|---|---|
| color:etc1s | 244 | 92.1 | 23.6 | 28.3 (Y ≥ 40 기준) | 35.2 |
| color:uastc-rdo | 51 | 6.9 | 5.9 | 36.1 | 46.3 |
| data:etc1s | 212 | 46.6 | 14.9 | 38.1 | 42.1 |
| data:uastc-rdo / uastc | 99 / 4 | 45.5 / 1.6 | 40.1 / 0.8 | 38.1 / 34.9 | 44.2 / 37.1 |
| normal:uastc-rdo / uastc | 182 / 27 | 120.4 / 21.6 | 82.2 / 12.7 | 36.1 / 26.1 | 43.8 / 33.7 |
| ui:etc1s / uastc-rdo / uastc | 115 / 305 / 45 | 0.4 / 64.1 / 1.0 | 0.2 / 38.8 / 0.6 | 46.9 / 42.1 / 40.0 | — / 50.0 / 41.3 |
| png(작은 것·기준 미달 UI 38·keep) | 416 | 34.9 | 34.9 | 무손실 | |

- color:etc1s 최악 = `menu01_balloon01_alb`(RGB 32.3·Y 43.0·최대 206), `npc022_body_arr_alb_03`(B 28.8·Y 45.3·최대 255): 휘도는 좋고 색 경계 몇 픽셀만 크게 틀린다(ETC1S 의 4×4 색차 공유).
- normal:uastc 27개(RDO 기준 36 dB 미달 → RDO 없이도 26~35 dB)는 결이 아주 잘거나(`mg1801_placemat_nml` 27 dB) 경계가 날카로운 노멀이다. UASTC 의 블록 끝점 한계라 더 올리려면 PNG 로 둬야 한다(**사용자 확인 필요**: 지금은 UASTC 그대로).
- UI 기준 미달 38개(캐릭터 얼굴 아이콘 `face_128_*` 등, UASTC 38~39 dB)는 PNG 로 남았다.

### 9.2 화면 대조 [실행]

`tools/shot_assets.ts`, 헤드리스 Chromium(SwiftShader — BPTC·ASTC·ETC2·S3TC 모두 지원, UASTC → ASTC 4×4, ETC1S → BC7 로 풀림), 1280×720, 결과 `test/out/assets/`.

| 장면 | 전체 PSNR | 평균 오차 | >8 / >24 픽셀 | 정지 픽셀만(움직임 제외) | 판정 |
|---|---|---|---|---|---|
| 광장 c1 계단 앞(프레임 300) | 28.97 dB | 2.84 | 10.4% / 2.49% | 76.7% 픽셀: **34.6 dB**, 평균 1.66, >8 4.5%, >24 0.65% | 잡음 범위 + 압축 손실 |
| 캐릭터 선택(프레임 90) | 21.66 dB | 4.36 | 8.3% / 5.2% | 2D 칸 영역(아래 격자) 47.6 dB, 캐릭터 영역 평균색 차 < 1 | 캐릭터 = 자세 어긋남(잡음), UI = 거의 같음 |
| mg1801(프레임 420, seed 1) | 38.67 dB | 1.24 | 2.9% / 0.55% | — | 압축 손실 수준 |

- **기준선**: 소스 모드를 두 번 찍으면 세 장면 모두 비트까지 같다(PSNR 99). 그런데 늦게 붙는 캐릭터(광장 2P 루이지·캐릭터 선택 3D)는 준비 단계가 `compileAsync` 폴링·`setTimeout` 에 걸려 가짜 시계에서 모드마다 다른 프레임에 시작한다 → 자세·위치가 몇 프레임 어긋난다(확대 비교: 같은 동작, 위치·위상만 다름, 평균색 차 < 1). 분수 물기둥(굴절)·하늘·새처럼 시간에 따라 움직이는 요소도 같은 이유로 남는다. 이 차이는 **잡음 범위**로 본다(압축과 무관).
- 압축 손실만의 크기는 "정지 픽셀"(소스 모드에서 10 프레임 동안 2 이하로만 바뀐 픽셀) 값: 광장 34.6 dB(평균 1.66/255). 남은 큰 오차(최대 215)는 분수 굴절 안쪽(노멀 UASTC 오차를 굴절이 키움)과 ETC1S 색 경계다.
- 육안(`plaza_src.png`·`plaza_dist.png` 확대): 계단·바닥·깃발·생울타리 차이 안 보임, 분수 물 거품 무늬 세부만 다름.
- **사용자 확인 필요**: 기준을 올릴 후보 — ① 분수 노멀(`menu00_fountain*`·굴절 재질 노멀)은 `normal` GATE 를 올리거나 keep(PNG) 로, ② 색 경계 오차가 큰 ETC1S 알베도(§9.1 최악 목록: `menu01_balloon01_alb`·`npc022_body_arr_alb_03`·`menu01_deco_tile05/06_alb`·`menu00_deco_pick05_alb`)는 그 텍스처만 UASTC 로. 둘 다 재빌드·재촬영은 하지 않았다(`assets_tex.ts` 의 `GATE`/`classify` 에 이름 규칙 한 줄 + `npm run assets` 증분이면 됨).

### 9.3 장면 로드·전송·GPU [실행]

실제 시계, 로컬 esbuild 서버(압축 전송 없음 — 실제 배포의 json·glb 는 brotli 로 더 준다), 같은 SwiftShader.

| 장면 | 준비 시간 src → dist | 준비까지 전송 src → dist | GPU 텍스처(살아 있는 합, 렌더 타깃 포함) src → dist |
|---|---|---|---|
| 광장(menu00 첫 로드) | 13.3~13.9 s → 12.2~16.4 s | 90.8 → 61.3 MB | 1,116.5 → 413.5 MB(압축 234.5 MB·텍스처 320/632) |
| 캐릭터 선택 | 0.7~2.6 s → 0.8~1.1 s(카드 3D 전부: 26~28 s → 19.5~19.8 s) | 96.9 → 52.4 MB | 131 → 45~48 MB(3D 프레임 90 시점 441.7 → 129.0 MB) |
| mg1801 | 4.2~7.4 s → 7.5~7.6 s | 62.9 → 39.7 MB | 267.9 → 101.1 MB |

- 광장 첫 로드 전송은 프레임 300(계단 앞, 늦게 읽는 장식·캐릭터 포함)까지 201.4 → 127.4 MB.
- mg1801 준비가 4.2 → 7.6 s 로 늘어난 것 [추정]: 로컬 서버라 내려받기 이득이 0 인데 KTX2 트랜스코드(워커 4개, SwiftShader CPU 위)와 meshopt 디코드가 처음 한 번 더 들고, mg1801 은 캐릭터·채소 텍스처를 준비 전에 한꺼번에 읽어 그 비용이 준비 시간에 그대로 쌓인다(src 쪽 7.4 s 측정도 있어 변동 폭이 크다). 실제 네트워크(수십 Mbps)에서는 23 MB 덜 받는 쪽이 이긴다. 줄이려면 트랜스코더 워커 수(`setWorkerLimit`)·mg1801 텍스처 지연 읽기를 볼 것.

### 9.4 소리 [실행]

같은 Chromium 의 decodeAudioData(48 kHz)로 원본 wav 와 압축본을 풀어 비교:

| 파일 | 형식 | 길이(표본) | 시작 어긋남 | 파형 SNR |
|---|---|---|---|---|
| mg1801 BGM `SQ_BGM_MG1801_A_120` | Opus / AAC | 1,965,257 = 원본 / = 원본 | 0 / 0 | 18.1 / 22.0 dB |
| mg1801 스트림 `SM_JIN_RC01_MG_SUCCESS` | Opus / AAC | = 원본 / = 원본 | 0 / 0 | 18.4 / 15.1 dB |
| mg1801 파형 `main_war1_065`·`main_war12_003` | FLAC | = 원본 | 0 | 205·225 dB(비트 일치, float 반올림만) |
| SE `SQ_SE_SYS_DECI` | Opus / AAC | = 원본 / = 원본 | 0 / 0 | 27.4 / 13.1 dB |
| 음성 `pc01_0` | Opus / AAC | +2 표본 / = 원본 | 0 / 0 | 27.1 / 25.1 dB |

- **시작 어긋남 0 표본·길이 같음**(Opus 한 파일 끝 +2 표본) → 리듬 BGM 시작 시각·반복 구간(초 단위)이 원본과 같다.
- 파형 SNR 은 지각 코덱(Opus·AAC)의 고역 위상 변경 때문에 낮게 나오는 지표다(들리는 음질과 다름). 청취 평가는 하지 않았다 — **사용자 확인 필요**(비트레이트 `OPUS_KBPS`·`AAC_KBPS` 한 줄로 바꿈).

---

## 10. 남은 일·사용자 확인 필요

| 항목 | 지금 | 선택지 |
|---|---|---|
| 3D 색 ETC1S 기준 | Y ≥ 40·RGB ≥ 32 | 올리면 UASTC 로(용량 ↑). §9.2 후보 텍스처만 올리기 |
| 노멀 UASTC 27개(26~35 dB)·분수 노멀 | UASTC | PNG 로 두기(용량 +9 MB 정도) |
| 노멀 RDO 강도 | λ 1 | λ 3(기준 34 dB)이면 노멀 약 −10~13 MB [실험 표본 추정] |
| 자료 ETC1S 기준 | 채널 최소 38 dB | 35 dB 면 자료 약 −25 MB [추정] |
| 글꼴 아틀라스 45개 | PNG(무손실, GPU RGBA8 660 MB 합) | UASTC(GPU 1/4, 글자 가장자리 오차) — 품질 우선으로 안 함 |
| 모바일 texlod 자동 | 수동 `?texlod=1` | `navigator.deviceMemory ≤ 4` 면 1 |
| 소리 비트레이트 | Opus 64/128, AAC 96/160 kbps | 청취 평가 후 조정 |
| assets-dist·vendor 의 git | `.gitignore` 에 넣음(재생성 가능) | 배포 저장소에 넣을지 |
| meshopt 무손실 | 위치·UV 양자화 안 함 | 셰이더 그래프가 원값을 읽어 지금은 불가 |
