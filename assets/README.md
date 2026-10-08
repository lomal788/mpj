# assets

게임별 변환 에셋. 페이지에서는 `assets/<게임>/…`로 보인다(개발·배포 같음). 원본 추출물(`../extracted/`)은 여기 두지 않는다.

## 폴더

```
assets/
  <게임 id>/
    manifest.json     입구
    model/*.glb       FRES(fmdb + fskb …) → glb
    tex/*.png         BNTX → png
    sound/*.ogg       bfstm·사운드 아카이브 → ogg
    data/*.json       원본 데이터 그대로(채보 등)
  chara/              캐릭터·NPC 공용(모든 화면이 같은 파일): tex/*.png, <pcNN|npc키>/<모델>.glb·motions.json·motion/<모션>.glb
                      화면 명세가 상대 경로(../chara/…)로 가리킨다 — ../docs/engine/chara_assets.md
```

## manifest.json (초안)

게임이 생기면 확정한다. 지금은 다음 항목을 예정한다.

| 키 | 내용 |
|---|---|
| `game` | 게임 id |
| `source` | 원본 BEA 이름과 변환 도구·날짜 |
| `models` | 이름 → `{ file, clips: { 이름: { file, frames } } }` (frames는 원본 프레임 수, 60fps) |
| `sounds` | 원본 라벨 → `{ file, loop? }` |
| `data` | 이름 → json 경로 |
