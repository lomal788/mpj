# 캐릭터·NPC 공용 에셋 — `web/assets/chara/`

2026-10-08. 상태: **구현·변환·압축 빌드·노드 대조 완료**(설계 §1~8 은 구현 전에 적었고, 결과는 §9). 작성 형식·확정 수준 표기는 [03_graphics.md](03_graphics.md)와 같다.
여기서 [실행]은 "이 문서의 도구로 돌려 수치를 얻음", [설계]는 원본과 무관한 웹 쪽 결정, **사용자 확인 필요**는 기본값을 정해 둔 곳이다.

사용자 요구: "캐릭터, NPC 이런 거는 모든 곳에서 다 같은 걸 쓰는 공용이잖아. 공용 폴더로 관리하게끔." 나중에 개발 페이지에서 에셋을 고칠 때 **한 곳만 고치면 모든 화면에 반영**되는 구조가 목적이다.

---

## 1. 결론

| 결론 | 근거 |
|---|---|
| 캐릭터(PC 22명)·NPC 의 텍스처·모델·모션은 **`web/assets/chara/` 한 곳**에 둔다. 화면 폴더에는 그 화면의 명세(어떤 캐릭터·어떤 모션·카메라 등)만 남는다 | §2 측정: 같은 파일이 화면마다 따로 있었다(텍스처 전부, 메시·뼈·재질 전부, 공통 모션) |
| glb 를 **모델(메시·스킨·재질) 하나 + 모션 하나당 glb 하나**로 나눈다 | 원본도 모델 아카이브(`chara~pcNN.nx.bea`)와 모션 아카이브(`chara~pcMot_<그룹>.nx.bea`, 모션 이름마다 파일)가 따로다 §3. 화면마다 glb 가 달랐던 이유는 든 모션 목록뿐이었다 §2.2 |
| 공용 단위 = **원본의 단위 하나**(텍스처 하나, 모델 하나, 모션 하나). 화면 하나만 쓰는 모션도 공용 폴더에 한 벌만 둔다 | 원본에서 모션은 장면 것이 아니라 캐릭터 것(전역 아카이브)이다. 화면 폴더에 두면 "어디를 고쳐야 하나"가 화면마다 갈린다 |
| 명세는 공용 파일을 **자기 폴더 기준 상대 경로**(`../chara/…`)로 가리킨다 | 지금 명세 필드·읽는 코드(`url(p)`)를 그대로 쓴다. URL·로더 키는 모두 `new URL` 로 정규화되어 `chara/…` 하나가 된다(`view/assetKey.ts`) |

---

## 2. 지금(전) 상태 [실행]

### 2.1 폴더와 중복

| 폴더 | 변환기 | 파일 | 소스 MB |
|---|---|---|---|
| `charselect/chara/` | `charsel_web_assets.py` → `charsel_chara.convert` | 129 | 93.4 |
| `plaza/player/` | `plaza_player_assets.py` → 같은 `charsel_chara.convert` | 130 | 102.4 |
| `mg1801/chara/` + `mg1801/npc/` | `mg1801_web_charas.py` | 154 + 2 | 108.3 + 0.4 |
| `plaza/world/chara/` | `plaza_npc_assets.py` | 99 | 36.0 |
| 합 | | 514 | 340.5 |

내용 sha1 로 비교(스크래치 `dup.py`):

| 겹친 곳 | 파일 | 겹친 양 |
|---|---|---|
| charselect·plaza/player·mg1801 (PC 텍스처) | 82 묶음 | 117.2 MB |
| mg1801·plaza/world/chara (npc002 텍스처) | 4 | 3.1 MB |
| plaza/world/chara 안 (npc003 ↔ npc053 텍스처 6장, 이름 다름) | 6 | 3.3 MB |
| pc51 눈 ↔ npc001 눈(이름 다름, 1.1 KB) | 1 | — |

- charselect·plaza/player 의 PC 텍스처 85장은 **전부** 같고, mg1801 은 그중 83장 + npc002 4장이다(mg1801 은 동키콩·가봉 눈꺼풀을 읽지 않음). 이름 규칙만 다르다(charselect·plaza = `<이름>_<sha1 12>.png`, mg1801 = `<이름>.png`).

### 2.2 glb 가 화면마다 달랐던 이유 [실행]

세 화면 glb(22명)를 메시 접근자 바이트·노드·스킨 역바인드 행렬·재질·메시 extras(`mpjUv`)로 비교(스크래치 `glbcmp2.py`):

- 정점 속성 `_C1`·`_C2`·`TEXCOORD_2` 를 빼고 보면 **22명 모두 메시·뼈·스킨·재질·이미지 참조(해시 뗀 이름)가 같다.** 이 셋은 mg1801 변환기만 뺀다(캐릭터 선택·광장은 눈알 마스크·눈꺼풀·몸 셰이더 그래프용으로 남김, docs/shell/charselect.md 12.2·12.11).
- 나머지 차이는 **든 모션**뿐: 캐릭터 선택 = co_idle00·co_chr_slct00a/b(·co_chr_idle00), 광장 = co_idle00·co_walk00·co_run00·co_look02·co_nod00·mn_bnclr_get00·mn_bnclr_idle00, mg1801 = rhy_knife_idle00·swing00·co_idle00(+ 결과 승패 7개는 `_result.glb`). 모두 깜빡임 fcl_blink00 을 같이 든다.
- 세 화면이 같이 쓰는 co_idle00·fcl_blink00 은 모션만 떼어 낸 glb(`clips_only`)가 22명 모두 바이트까지 같고, `motions.json` 의 그 항목도 같다.
- 마리오 예: 메시·스킨 약 1.75 MB, 모션 0.17(mg1801)~0.66 MB(광장). 화면마다 1.75 MB × 22명이 다시 들어 있던 셈이다.
- NPC npc002(헤이호): 광장·mg1801 glb 가 정점 속성 셋을 빼면 같다.

---

## 3. 원본 구조 [데이터]

| 원본 | 내용 | 웹 공용 단위 |
|---|---|---|
| `chara~pcNN.nx.bea/chara/pc/<base>/model/<model>.fmdb` + 같은 아카이브 `textures/*.bntx` | 모델 하나(메시·뼈·재질)와 그 텍스처 | `chara/pcNN/<model>.glb` + `chara/tex/*.png` |
| `chara~pcMot_<그룹>.nx.bea/chara/pc/<base>/motion/<접두사><모션>.{fskb,fshb,fvbb,ftsb.fmab}` | 모션 하나 = 뼈·키셰이프·뼈 가시성·재질 네 파일(03_graphics.md §1, 06_scene_data.md §2) | `chara/pcNN/motion/<모션>.glb`(뼈 + `_shape`) + `chara/pcNN/motions.json` 의 그 항목(가시성·재질·깜빡임) |
| NPC `chara~npcNNN.nx.bea`(모델·텍스처·소품 `attach model[p]`)·NPC 모션 | 같은 구조 | `chara/<npc 키>/…`(변형 모델 npc001bd·npc002st·npc029a 는 키 따로) |

원본은 장면이 쓰는 모션 아카이브를 그때 읽을 뿐, 모델·모션을 장면마다 따로 갖지 않는다. 웹도 같은 모델·모션 파일을 화면들이 나눠 읽는다.

---

## 4. 공용 폴더 구조 [설계]

```
web/assets/chara/
  tex/<원본 텍스처 이름>_<sha1 앞 12>.png    PC·NPC 텍스처 전부(바이트 = 변환 PNG 그대로). 배열 텍스처 층·눈 알베도·눈꺼풀 포함
  pc01/
    pc01_mario.glb                           모델: 메시·스킨·재질·노드 extras(visBone 등)·메시 extras(mpjUv). 클립 없음. 이미지 uri = ../tex/…
    motions.json                             모션 표: 모션 이름 → {frames, loop, nameHash, blink, blinkName, shapeFrames, vis, mat} (compact_motions 항목)
    motion/co_idle00.glb                     모션 하나: 클립 co_idle00 + co_idle00_shape. 노드 이름·계층은 모델과 같고 메시는 모프 수만 같은 정점 1개(clips_only)
    motion/fcl_blink00.glb …
  pc02/ … pc62/
  npc002/ npc002_heyho.glb, motions.json, motion/*.glb
  npc003/ npc003_nokonoko.glb, npc003it00_hat.glb(소품), …
  …
```

- 텍스처 이름 = 지금 캐릭터 선택·광장 규칙(`<이름>_<sha1 12>`). 변환기를 어느 순서로 돌려도 이름이 같고, 원본 이름이 같은데 내용이 다른 일이 생겨도 겹치지 않는다. 이름은 식별자다 — 개발 페이지에서 그림을 고쳐도 이름은 그대로 둔다(해시는 "변환 때 원본 내용"의 표시).
- **모델 정점 속성 = 상위 집합**(캐릭터 선택·광장 규칙: `_C0`·`_C3`·`TEXCOORD_3` 만 뺌, `_C1`·`_C2`·`TEXCOORD_2` 남김). mg1801 은 이 셋을 읽지 않는다(셰이더에 쓰는 곳 없음 — three 는 쓰지 않는 속성을 무시). 대신 mg1801 이 받는 양이 조금 는다(§9 에 수치) — 화면 사이에 같은 파일을 나눠 쓰는 쪽이 이긴다.
- **모션 = 모션 이름 하나에 glb 하나**. 화면 명세가 쓰는 모션 목록을 들고, 읽는 쪽이 모델 + 그 모션 glb 들을 읽어 클립을 합친다. 클립은 노드 이름으로 묶이므로(three `PropertyBinding`) 모델 장면 하나에 어느 모션 glb 의 클립이든 걸린다 — mg1801 결과 승패 클립(`_result.glb`)이 이미 이 방식이었다.
- `motions.json` = 이 캐릭터를 쓰는 화면들의 모션 항목의 **합집합**. 변환기마다 자기 모션 항목만 넣고 고친다(같은 이름 항목은 내용이 같음 §2.2). 키 순서는 정렬.

### 4.1 공용으로 올리는 기준

| 대상 | 어디 | 이유 |
|---|---|---|
| 캐릭터·NPC 텍스처·모델·모션·소품 | `chara/` | 원본의 캐릭터 에셋(장면 것이 아님). 단위마다 한 벌 |
| 화면 명세(`charselect/spec.json`·`plaza/player/spec.json`·`plaza/world/chara/spec.json`·`mg1801/chara/index.json`) | 원래 폴더 | 그 화면이 고른 캐릭터·모션·카메라·눈 파라미터·셰이더 규칙 등 화면 데이터 |
| 2D UI·소리·무대 모델 | 원래 폴더 | 캐릭터 에셋 아님 |
| 같은 내용인데 원본 이름이 다른 텍스처(npc003 ↔ npc053 6장 3.3 MB, pc51 ↔ npc001 눈 1장) | `chara/tex/` 에 **이름별로 따로** | 원본에서 다른 텍스처(다른 bntx 항목)다. 하나로 합치면 한쪽을 고칠 때 다른 캐릭터가 같이 바뀐다 — **사용자 확인 필요** |

---

## 5. 명세가 공용 파일을 가리키는 방식 [설계]

경로는 모두 **그 명세 파일이 있는 폴더 기준 상대 경로**다(지금과 같은 규칙, 앞에 `../` 가 붙을 뿐).

| 명세 | 기준 폴더 | 필드 | 예 |
|---|---|---|---|
| `charselect/spec.json` `chars[]` | `charselect/` | `glb`(모델)·`motions`·`anims[]`(모션 glb)·`eye.tex`·`eye.lid.tex` | `../chara/pc01/pc01_mario.glb`, `../chara/pc01/motion/co_idle00.glb`, `../chara/tex/pc01_eye_arr_alb_00_b864302bfe02.png` |
| `plaza/player/spec.json` `chars[]` | `plaza/player/` | 같음 | `../../chara/pc01/pc01_mario.glb` |
| `plaza/world/chara/spec.json` `chars[]` | `plaza/world/chara/` | 같음 + `layers{텍스처: [png…]}`·`attach.glb` | `../../../chara/npc003/npc003it00_hat.glb` |
| `mg1801/chara/index.json` | `mg1801/chara/` | `glb`·`motions`·`anims[]`·`resultAnims[]`(결과 승패, 뒤에 읽음)·`eyeTex`·`color.albedo` | `../../chara/pc01/motion/co_win00a.glb` |

- `anims` 가 없으면(옛 명세) 모델 glb 안 클립을 그대로 쓴다(읽는 쪽 호환).
- `layers` 는 지금까지 `../tex/…`(앞 `../` 를 읽는 쪽이 떼던 꼴)였다 → 다른 필드와 같은 상대 경로로 바꾸고 읽는 쪽(`npcMaterial.ts`)의 떼기를 없앤다.
- `mg1801/chara/index.json` 의 `resultGlb`(모션 7개 묶음)는 `resultAnims`(모션 glb 7개)로 바뀐다.

---

## 6. 변환기 [설계]

새 공용 모듈 `web/tools/analysis/chara_shared.py` 를 네 변환기가 같이 쓴다. 원본(`C:/dev/original`)·`extracted/` 는 읽기만 한다(중간 변환 `extracted/converted/{charsel,plaza_player,plaza_npc,character}/` 는 지금처럼 각자).

| 함수 | 하는 일 |
|---|---|
| `ship_tex(src_tex, png)` | `chara/tex/<이름>_<sha1 12>.png` 에 바이트 그대로 → `tex/…` |
| `write_model(key, name, js, rest, src_tex, uv_rule)` | 클립을 모두 뺀 모델(정점 속성 상위 집합, `mwc.slim(keep=∅)`) + 이미지 uri `../tex/…` |
| `write_motions(key, js, rest, names)` | 모션 이름마다 `mwc.clips_only(js, rest, {이름, 이름_shape})` → `motion/<이름>.glb`(glb 에 그 클립이 있을 때만) |
| `merge_motions(key, table)` | `motions.json` 에 이 변환기의 항목을 넣고 고친다(정렬) |
| `rel(spec_dir, p)` | 명세 폴더 기준 상대 경로 |

- **같은 경로에 다른 내용을 쓰면 경고**(`공용 파일 내용이 바뀜`)하고 덮어쓴다. 변환기끼리 결과가 다르면 안 되는 것을 지키는 장치이고, 변환기를 다시 돌리면 원본 변환 값으로 되돌아간다(재현 경로).
- 변환기 출력:

| 변환기 | 공용 폴더에 쓰는 것 | 원래 폴더에 쓰는 것 |
|---|---|---|
| `charsel_web_assets.py chara`(→ `charsel_chara.convert`) | PC 22 모델·모션 4~5개·텍스처 | `charselect/spec.json` |
| `plaza_player_assets.py` | PC 22 모델·광장 모션 7개·텍스처 | `plaza/player/spec.json` |
| `plaza_npc_assets.py` | NPC 10 모델·모션·배열 층 텍스처·소품 | `plaza/world/chara/spec.json` |
| `mg1801_web_charas.py` | PC 22 모델·모션(대기·칼·결과)·npc002 | `mg1801/chara/index.json` |

- 다시 만들기: 네 변환기를 다시 돌리면 된다(순서 무관). `chara/` 를 비우고 새로 만들 때는 넷 다 돌린다(모션 표·모션 glb 가 화면들의 합이라서).

---

## 7. 읽는 쪽·캐시 [설계]

| 곳 | 바꾸는 것 |
|---|---|
| `app/scene/menu/charselect/preview3d.ts`(캐릭터 선택·광장 플레이어·광장 NPC 공용) | 요청 파일 = 모델 glb + `anims` glb + motions + 눈·눈꺼풀. 클립 = 모델 클립 + 모션 glb 클립 합침 |
| `app/scene/menu/charselect/types.ts` | `CharaSpec.anims?: string[]` |
| `app/scene/world/plaza/npcMaterial.ts` | `layers` 경로 떼기 없앰 |
| `app/scene/world/plaza/npc.ts`·`player.ts` | 그대로(명세 상대 경로를 `url()` 이 붙임) |
| `app/minigame/mg1801/view/character.ts` | `CharaInfo.anims`·`resultAnims`, 템플릿이 클립 목록을 들고 액터·깜빡임이 그것을 씀 |
| `view/flowCatalog.ts` | `charaFiles` 에 `anims`(gltf) — Preview3D 요청과 같은 키 |
| `tools/assets_tex.ts` | `TEX3D_ROOTS` 에 `chara/` — 밉·색공간·노멀 판정이 지금(3D 폴더)과 같게 |
| `tools/build_assets.ts` | 경로만 바뀐 같은 내용은 옛 결과를 그대로 복사(증분 키에서 경로를 뺀 비교) — 형식·PSNR 이 전과 같다 |

- 로더 키(`assetKeyFrom`)는 URL 을 페이지 기준으로 풀어 `..` 를 접는다 → 세 화면이 같은 텍스처·모델·모션을 **같은 키 `chara/…`·같은 주소**로 요청한다.
- 캐릭터 선택 → 광장(플레이어·NPC): Preview3D 가 앱 로더 관리자(broker)를 지나므로 **같은 키 = 한 번 받고 한 번 풂**(loader_manager.md §13.4 의 "다른 파일이라 키를 나눠 쓰지 않는다"가 풀림).
- mg1801: 게임 화면은 자기 `Assets` 캐시를 쓴다(관리자 밖). 같은 주소라 압축본(해시 이름 + immutable + 서비스 워커)에서는 **다시 받지 않는다**(풀기는 다시). mg1801 을 관리자에 넣는 것은 이 작업 밖 — **사용자 확인 필요**.

## 8. 개발 페이지에서 고칠 때 [설계]

| 고칠 것 | 고칠 파일(한 곳) | 반영되는 화면 |
|---|---|---|
| 캐릭터 텍스처 | `chara/tex/<이름>.png` | 캐릭터 선택·광장·mg1801(모델 glb 와 명세가 같은 파일을 가리킴) |
| 모델(메시·재질) | `chara/pcNN/<model>.glb` | 셋 다 |
| 모션 | `chara/pcNN/motion/<모션>.glb` + `motions.json` 그 항목 | 그 모션을 쓰는 화면 전부 |
| 어느 화면이 어떤 모션을 쓰는지 | 그 화면 명세(`anims`) | 그 화면 |

- 압축본은 `npm run assets` 증분이 바뀐 공용 파일만 다시 만든다.
- 변환기를 다시 돌리면 원본 변환 값으로 돌아간다(§6). 개발 페이지 편집을 변환기 재실행에서 지키는 방법(덮어쓰기 목록 등)은 개발 페이지 설계 때 정한다 — **사용자 확인 필요**.

---

## 9. 결과 [실행]

### 9.1 공용 폴더

| | 파일 | 소스 MB | 압축본 MB(해시 이름) | 전송 MB(json·glb brotli) |
|---|---|---|---|---|
| `chara/tex/` | 162(내용 155 + 이름만 다른 7) | 85.1 | 43.4 | 43.4 |
| 모델 glb(PC 22 + NPC 10 + 소품 1) | 33 | 29.4 | 13.8 | 8.1 |
| 모션 glb | 463 | 60.1 | 29.6 | 8.0 |
| `motions.json` | 32 | 2.2 | 2.3 | 0.2 |
| **합** | **690** | **176.8** | **89.1** | **59.8** |

- 화면 폴더에는 명세만 남았다: `charselect/spec.json`, `plaza/player/spec.json`, `plaza/world/chara/spec.json`, `mg1801/chara/index.json`.
- 전(§2.1): 소스 514 파일 340.5 MB, 압축본 166.1 MB(전송 131.8 MB) → 후: 소스 176.8 MB(−163.7), 압축본 89.1 MB(−77.0), 전송 59.8 MB(−72.0).
- 에셋 전체(`assets-dist/report.json`): 소스 739.5 → 576.3 MB, 압축본 376.0 → 299.4 MB, 전송 추정 308.5 → 236.0 MB.
- 모션 glb 는 하나마다 뼈 목록(JSON)을 들어 소스가 크지만(평균 130 KB) brotli 로 8.0 MB 다.
- 옛 소스 511개(340.4 MB)는 지우지 않고 작업 스크래치로 옮겼다. 압축본의 옛 산출물(캐릭터 1,394개 393.6 MB — 작업본·해시본·.br·.gz)은 `--prune` 전까지 남는다(배포 `dist/` 에는 `index.json names` 에 있는 것만 실린다).

### 9.2 변환기가 서로 같은 것을 쓰는지

- 네 변환기를 두 번씩 차례로 돌려 **공용 파일 경고 0**(§6 의 "같은 경로에 다른 내용" 검사). 캐릭터 선택·광장·mg1801 이 같은 모델·co_idle00·fcl_blink00 을, 광장 NPC·mg1801 이 같은 npc002 를 바이트까지 같게 쓴다.
- 맞춘 것 하나: 광장 NPC 변환(`plaza_npc_assets.py convert_raw`)은 모션 extras 에 `archive` 를 넣지 않아 npc002 모션 glb 가 mg1801 쪽(character_glb.py)과 그 한 항목만 달랐다 → character_glb 와 같은 `archive`(그 모션 파일의 아카이브 이름)를 넣는다. 런타임은 이 값을 읽지 않는다.
- 옛 텍스처 PNG 전부가 내용 그대로 `chara/tex/` 에 있다(빠진 것 0).

### 9.3 모델 + 모션 glb 가 원본 변환과 같은 자세인지 (노드, three GLTFLoader)

| 대상 | 도구 | 결과 |
|---|---|---|
| mg1801 23(PC 22 + npc002), 대기·칼·깜빡임·결과 승패 모션 | `tools/analysis/character_verify/web_same.ts all`(모델 + `anims` + `resultAnims` vs `extracted/converted/character`) | 모든 클립·정수 프레임의 뼈 월드 행렬·모프 가중치 최대 오차 2.31e-6, 전부 ok |
| 캐릭터 선택 22·광장 플레이어 22·광장 NPC 10 | 같은 방식(스크래치, 명세의 모델 + `anims` vs `extracted/converted/{charsel,plaza_player,plaza_npc}`) | 54명 전부 ok(최대 7.04e-5 = npc051 빗자루, 옛 파일도 같은 값), 모션 트랙 15,273개 모두 모델 노드에 걸림(못 건 것 0) |

### 9.4 키·캐시

- `tools/test_prefetch.ts` 8절(새로 추가 7건): 세 화면이 실제로 만드는 URL(캐릭터 선택 `assets/charselect/…`, 광장 `assets/plaza/player/…`, mg1801 `Assets('mg1801/').url('chara/…')`)을 `assetKeyFrom` 으로 풀면 22명 모두 모델·눈 텍스처·co_idle00·모델 텍스처가 **같은 키 `chara/…`**. npc002 모델도 광장·mg1801 같은 키. 명세가 가리키는 공용 키 690개가 모두 소스에 있고(404 0) 압축본 해시 표(`index.json names`)에도 있다.
- 압축 빌드: 공용 텍스처 162장은 **새 인코딩 0**, 옛 결과 복사(분류 키 = 내용·종류·sRGB·밉·판정 이유가 같음 → 형식·밉·색공간이 전과 같다). 빌드 46 s.
- 받는 양(압축본, json·glb 는 brotli, glb 안 텍스처 포함):

| 화면 묶음 | 전 MB | 후 MB |
|---|---|---|
| 캐릭터 선택 22명 | 36.7 | 37.2 |
| 광장 플레이어(마리오) | 3.06 | 3.09 |
| 광장 NPC 10 | 16.5 | 16.7 |
| mg1801 4명 + npc002(결과 모션 포함) | 10.7 | 11.0 |
| 흐름 합(캐릭터 선택 → 광장 → mg1801) | 67.0(공유 0) | **54.8**(같은 키 한 번, 공유 13.2) |

- 후의 광장 마리오 묶음은 97 %, mg1801 묶음은 93 % 가 앞 화면에서 이미 받은 파일이다. 화면 하나만 보면 0.03~0.5 MB 늘었다(모션 glb 마다 뼈 목록, mg1801 모델의 정점 속성 셋).
- 실제 페이지 콘솔 확인 1회(개발 서버, `?plaza=1`·`?plaza=1&skipsetup=1` × 소스·`&assets=dist`, 40 s): `chara/` 응답 121~130건, 404·실패 0.

### 9.5 바꾼 파일

| 종류 | 파일 |
|---|---|
| 변환기 | 새 `tools/analysis/chara_shared.py`, `charsel_chara.py`(convert → 공용, 반환 경로 = 명세 기준), `charsel_web_assets.py`, `plaza_player_assets.py`, `plaza_npc_assets.py`(공용 + `archive` extras), `mg1801_web_charas.py` |
| 런타임 | `app/scene/menu/charselect/preview3d.ts`·`types.ts`(`anims`), `app/scene/world/plaza/npcMaterial.ts`(layers 떼기 없앰), `app/minigame/mg1801/view/character.ts`(`anims`·`resultAnims`), `view/flowCatalog.ts`(`anims`) |
| 빌드 | `tools/assets_tex.ts`(`TEX3D_ROOTS` 에 `chara/`), `tools/build_assets.ts`(경로만 바뀐 텍스처 옛 결과 복사) |
| 시험·도구 | `tools/check_charselect.ts`(동키콩 glb 경로), `tools/test_prefetch.ts`(마리오 glb 키·캐릭터 파일에 모션 glb, 8절 추가), `tools/test_plaza_actors.ts`(layers 경로 = 읽는 쪽 규칙), `tools/analysis/character_verify/web_same.ts`(모델 + 모션 glb) |
| 문서 | 이 문서, `README.md`, `assets_pipeline.md` §2·§3, `loader_manager.md` §13.3·§13.4, `shell/plaza_3d.md`, `assets/README.md` |

---

## 10. 사용자 확인 필요

| 항목 | 지금 결정 | 다른 선택 |
|---|---|---|
| 같은 내용·다른 원본 이름 텍스처(npc003 ↔ npc053 6장 3.3 MB, pc51 ↔ npc001 눈) | 이름별로 따로(원본 단위) | 내용으로 합치면 −3.3 MB, 대신 한쪽 편집이 다른 캐릭터에 번짐 |
| 화면 하나만 쓰는 모션(mg1801 칼·결과, 광장 걷기 등) | 공용 폴더(캐릭터 것) | 화면 폴더에 두기 |
| mg1801 모델에 정점 속성 `_C1`·`_C2`·`TEXCOORD_2` 가 같이 옴 | 받음(공용 파일 하나) | mg1801 전용 얇은 모델을 따로 두면 공용이 깨짐 |
| mg1801 을 앱 로더 관리자에 넣기 | 안 함(같은 주소 → HTTP·서비스 워커 캐시만) | 넣으면 캐릭터 선택·광장에서 푼 glb 를 그대로 씀 |
| 개발 페이지 편집과 변환기 재실행 | 변환기가 덮어씀(재현 우선) | 편집 목록을 두고 변환기가 건너뜀 |
| 광장 NPC 모션 extras `archive` | character_glb 와 같게 넣음(npc002 공용 파일을 두 변환기가 같게 쓰려고) | — |
| 압축본 옛 캐릭터 산출물 1,394개 393.6 MB | 남김(`--prune` 은 사용자 실행) | `npx tsx tools/build_assets.ts --prune` |
