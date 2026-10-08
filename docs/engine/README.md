# 포팅 기반 분석 (엔진·그래픽·사운드·UI·장면)

게임 하나에 묶이지 않는 원본 시스템을 웹으로 옮기기 위한 명세다. 작성 형식과 확정 수준 표기는 [../../../분석.txt](../../../분석.txt)를 따른다. 게임별 문서는 [../minigame/](../minigame/README.md).

| 문서 | 범위 | 상태 |
|---|---|---|
| [01_core.md](01_core.md) | 메인 루프·시간, 파이버 순서, 난수, 장면 수명, 엔티티·컴포넌트 | 작성 중 |
| [02_rhythm.md](02_rhythm.md) | 리듬 미니게임 공용 프레임워크(`ca::rm`, mg1801~mg1810) | 작성 중 |
| [03_graphics.md](03_graphics.md) | FRES 모델·애니, BNTX 텍스처, 재질 근사, 이펙트, glTF 변환 | 작성 중 |
| [04_sound.md](04_sound.md) | 사운드 모듈, 라벨 체계, fsst·fspj·bfstm, 3D 사운드, 추출 | 작성 중 |
| [05_ui_input.md](05_ui_input.md) | 레이아웃(.lyt), 폰트, 메시지 태그, 입력·자이로, FX 트리거·진동 | 작성 중 |
| [06_scene_data.md](06_scene_data.md) | 아카이브 로딩·의존, 캐릭터·모션 데이터, nbmap, 게임 데이터, PhysX | 작성 중 |
| [07_camera_lighting.md](07_camera_lighting.md) | 카메라 시스템·씬 카메라 애니, mg1801 카메라 값, 조명·IBL, 포스트이펙트 | 작성 중 |
| [08_effects.md](08_effects.md) | VFXB 파티클 구조, bex::Effect 런타임, mg1801 이펙트, 웹 파티클 설계 | 작성 중 |
| [09_character.md](09_character.md) | 캐릭터 ID·에셋·뼈, 모션 시스템(재생·블렌드), 시선·흔들림 본, 캐릭터 glb 변환 | 작성 중 |
| [chara_assets.md](chara_assets.md) | 캐릭터·NPC 공용 에셋 폴더 `assets/chara/`(텍스처·모델·모션 한 벌, 화면 명세가 가리킴) | 구현 |
| [common_assets.md](common_assets.md) | 시스템 효과음·공용 UI 그림 공용 폴더 `assets/common/{sound,tex}/`(여러 화면이 같은 바이트로 쓰던 것 한 벌, 화면 명세가 가리킴) | 구현 |
