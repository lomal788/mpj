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

- **증분**: 소스 내용 sha1·분류·인코더 설정(`TEX_RECIPE`·`MESH_RECIPE`·`AUDIO_RECIPE`)이 같고 산출물이 있으면 건너뛴다. glb 는 참조 텍스처의 결과(ktx2/png)도 키에 넣는다(텍스처 형식이 바뀌면 glb 의 이미지 URI 를 다시 씀). 내용이 같은 PNG(캐릭터 텍스처는 charselect·plaza/player·mg1801/chara 에 같은 것이 있음)는 한 번만 인코딩해 복사한다. 30 s 마다 캐시를 저장해 중간에 끊겨도 이어서 한다.
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
| keep | 글꼴 아틀라스(`font/`), LUT·램프·SSS 확산표(`_lut`·`_ramp`·`_diff`), 큐브맵 면, 가로·세로가 4의 배수가 아님, 2D 캔버스로 직접 그리는 배경(`modeselect/backdrop_temp.png`) | PNG 그대로 | 소스와 같음 | — |
| ui | 3D 폴더 밖 전부(2D 레이아웃 render2d·lyt) | ETC1S(≥ 45 dB) → UASTC RDO 0.5(≥ 42) → UASTC(≥ 40) → 그래도 미달이면 PNG | 없음(소스도 없음) | 지각(sRGB) |
| color | 3D, sRGB(매니페스트 `srgb`, glb 색 슬롯, 이름 `_alb/_emi`) | ETC1S(Y ≥ 40·RGB ≥ 32·A ≥ 36) → UASTC RDO 1(RGB ≥ 38) → UASTC | 있음(box, sRGB 공간) | 지각 |
| data | 3D, 선형(거칠기·금속·AO·마스크·높이 등) | ETC1S(채널 최소 ≥ 38) → UASTC RDO 1(≥ 38) → UASTC | 있음(box, 선형) | 선형 |
| normal | glb `normalTexture`, 이름 `_nml/_nrm` | UASTC RDO 1(≥ 36) → UASTC | 있음(box, 선형, 재정규화 안 함 = three `generateMipmap` 과 같음) | 선형 |

- 3D 폴더 = `plaza/world/`·`plaza/player/`·`charselect/chara/`·`mg1801/{tex,chara,effect,npc,model}/`.
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
- 런타임: 소리는 페이지마다 fetch → decodeAudioData 로 읽는 곳이 많아(charselect_page·plaza_page·view/audio 등 12곳) 압축 모드에서만 전역 fetch 를 감싸 `.wav` 요청을 바꾼다(`installFetchShim`). 압축본 루트 밖·다른 확장자는 그대로 지나간다 [설계].

---

## 6. 런타임 로더

`script/shell/stage3d/assetLoader.ts` 한 곳. 셸 경계(mgm_common.md §9.1 — stage3d 는 자기 폴더만 import)상 stage3d 안에 두고, 다른 셸·게임 뷰가 import 한다.

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

- `assets-dist/` 의 `.json`·`.glb`·`.hdr`·`.otf` 와 `index.json` 은 brotli(없으면 gzip)로 보내야 §9.1 의 전송량이 된다. `build_assets.ts --precompress` 가 옆에 `.br`·`.gz` 를 만든다 → nginx `brotli_static on; gzip_static on;` 또는 CDN 의 사전 압축 제공.
- `.ktx2`(ETC1S = BasisLZ, UASTC = zstd)·`.ogg`·`.m4a`·`.flac`·`.png` 는 이미 압축돼 있어 서버 압축을 끈다.
- MIME: `.ktx2` = `image/ktx2`, `.glb` = `model/gltf-binary`, `.wasm` = `application/wasm`(스트리밍 컴파일), `.ogg` = `audio/ogg`, `.m4a` = `audio/mp4`, `.flac` = `audio/flac`.
- 캐시: 파일 이름에 해시가 없으므로 `Cache-Control: no-cache` + ETag(또는 배포마다 경로 바꾸기). 
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

(빌드·대조 수치 — 아래 절에 채움)
