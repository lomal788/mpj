# @orig 연결·상수 비교 — web/script/app/minigame/mg1801

- 파일 23 · 연결 26 · 이미 표시 0 · 약한 연결(표시 안 함) 14 · 함수 시작 아님 10 · 모듈 모름 0
- 상수 차이 후보 3 · --apply 없이 실행(코드 그대로)

## 상수 차이 후보 (C에 있는 실수 상수가 웹 선언·파일에 없음)

| 함수 | 웹 | C 파일 | C에만 있는 값 |
|---|---|---|---|
| mg1801:7100007bd0 | web/script/app/minigame/mg1801/logic/obj.ts:89 entry | mg1801.nro.c | 5.96046e-8 |
| mg1801:7100008a64 | web/script/app/minigame/mg1801/logic/obj.ts:163 update | mg1801.nro.c | 1.19209e-7 |
| mg1801:71000095f0 | web/script/app/minigame/mg1801/logic/obj.ts:290 cutObj | mg1801.nro.c | 0.0174533 |

## 연결

| 함수 | 원본 이름 | 웹 | 근거 |
|---|---|---|---|
| mg1801:710000e7e4 | mg1801::Scene::Params::createInstance | web/script/app/minigame/mg1801/logic/data.ts:44 PARAMS | 주석 주소 + 이름 일치 |
| mg1801:710000eb10 | mg1801::Scene::CalcTotalPoint | web/script/app/minigame/mg1801/logic/game.ts:52 calcTotalPoint | 주석 주소 + 이름 일치 |
| main:7100441990 | FUN_7100441990 | web/script/app/minigame/mg1801/logic/game.ts:70 gameBgmName | 주석 주소 하나 |
| main:71004421a0 | FUN_71004421a0 | web/script/app/minigame/mg1801/logic/game.ts:75 endingBgmName | 주석 주소 하나 |
| main:71004429c0 | FUN_71004429c0 | web/script/app/minigame/mg1801/logic/game.ts:80 interEndBgmName | 주석 주소 하나 |
| main:7100438a40 | ca::rm::util::SetModelMotionSpeedAdjustFromTime | web/script/app/minigame/mg1801/logic/game.ts:159 npcSpeed | 주석 주소 하나 |
| mg1801:7100010a90 | mg1801::MapImpl::ReceiveState | web/script/app/minigame/mg1801/logic/game.ts:191 trigRmGameMainBgmTopStart | 주석 주소 하나 |
| mg1801:710000efc8 | mg1801::Scene::TrigRmGameEndingSetting | web/script/app/minigame/mg1801/logic/game.ts:204 trigRmGameEndingSetting | 주석 주소 + 이름 일치 |
| mg1801:7100007bd0 | mg1801::Obj::Entry | web/script/app/minigame/mg1801/logic/obj.ts:89 entry | 이름 일치(클래스·메서드) |
| mg1801:710000849c | mg1801::Obj::RecieveHit | web/script/app/minigame/mg1801/logic/obj.ts:148 recieveHit | 이름 일치(클래스·메서드) |
| mg1801:7100008a64 | mg1801::Obj::Update | web/script/app/minigame/mg1801/logic/obj.ts:163 update | 주석 주소 + 이름 일치 |
| mg1801:7100008e40 | mg1801::Obj::UpdateOutlineOnOff | web/script/app/minigame/mg1801/logic/obj.ts:235 updateOutlineOnOff | 주석 주소 + 이름 일치 |
| mg1801:7100009060 | mg1801::Obj::EntrySe | web/script/app/minigame/mg1801/logic/obj.ts:255 entrySe | 이름 일치(클래스·메서드) |
| mg1801:71000095f0 | mg1801::Obj::CutObj | web/script/app/minigame/mg1801/logic/obj.ts:290 cutObj | 이름 일치(클래스·메서드) |
| mg1801:7100009480 | mg1801::Obj::Stop | web/script/app/minigame/mg1801/logic/obj.ts:332 stop | 이름 일치(클래스·메서드) |
| mg1801:71000047e0 | mg1801::ObjectManImpl::GetHeadTarget | web/script/app/minigame/mg1801/logic/objectMan.ts:77 getHeadTarget | 주석 주소 + 이름 일치 |
| mg1801:710000c9c0 | mg1801::Player::MyUpdate | web/script/app/minigame/mg1801/logic/player.ts:69 myUpdate | 이름 일치(클래스·메서드) |
| mg1801:710000cd10 | mg1801::Player::UpdateAttack | web/script/app/minigame/mg1801/logic/player.ts:130 updateAttack | 이름 일치(클래스·메서드) |
| mg1801:710000d130 | mg1801::Player::UpdateHeadControl | web/script/app/minigame/mg1801/logic/player.ts:155 updateHeadControl | 주석 주소 + 이름 일치 |
| mg1801:710000d580 | mg1801::Player::Finish | web/script/app/minigame/mg1801/logic/player.ts:161 finish | 이름 일치(클래스·메서드) |
| main:7100427040 | FUN_7100427040 | web/script/app/minigame/mg1801/logic/world.ts:53 tickExcellentSe | 주석 주소 하나 |
| main:71004263c8 | FUN_71004263c8 | web/script/app/minigame/mg1801/logic/world.ts:58 setExcellentLimit | 주석 주소 하나 |
| main:7100426e38 | ca::rm::RmSoundMan::PlayExcellentSe | web/script/app/minigame/mg1801/logic/world.ts:63 playExcellentSe | 주석 주소 + 이름 일치 |
| main:710042a6b8 | FUN_710042a6b8 | web/script/app/minigame/mg1801/logic/world.ts:68 addScore | 주석 주소 하나 |
| main:71001c5a58 | FUN_71001c5a58 | web/script/app/minigame/mg1801/view/character.ts:534 applyEyes | 주석 주소 하나 |
| mg1801:7100010730 | mg1801::MapImpl::GetResultPlayerPosRots | web/script/app/minigame/mg1801/view/stage.ts:340 resultPlayerTransform | 주석 주소 하나 |

## 약한 연결 (주석에 주소가 여럿이고 이름이 다름 — 사람이 확인)

| 주소 | 원본 이름 | 웹 |
|---|---|---|
| main:7100438a40 | SetModelMotionSpeedAdjustFromTime | web/script/app/minigame/mg1801/logic/data.ts:83 NPC_MOTION_FRAMES |
| main:7100446b60 | FUN_7100446b60 | web/script/app/minigame/mg1801/logic/data.ts:92 RESULT_CAMERA_POS |
| mg1801:710000b130 | Player | web/script/app/minigame/mg1801/logic/data.ts:106 STOOLS |
| mg1801:? | 이름 같은 원본 2개 | web/script/app/minigame/mg1801/logic/obj.ts:70 Obj |
| mg1801:? | 이름 같은 원본 3개 | web/script/app/minigame/mg1801/logic/player.ts:50 Player |
| main:71001c1380 | FUN_71001c1380 | web/script/app/minigame/mg1801/view/character.ts:51 MOTION_HEAD_WEIGHT |
| main:71001bea18 | FUN_71001bea18 | web/script/app/minigame/mg1801/view/character.ts:51 MOTION_HEAD_WEIGHT |
| main:71001bea18 | FUN_71001bea18 | web/script/app/minigame/mg1801/view/character.ts:565 applyHead |
| main:71001bfe08 | FUN_71001bfe08 | web/script/app/minigame/mg1801/view/character.ts:565 applyHead |
| main:71001c1694 | FUN_71001c1694 | web/script/app/minigame/mg1801/view/character.ts:565 applyHead |
| main:71001c5a58 | FUN_71001c5a58 | web/script/app/minigame/mg1801/view/character.ts:565 applyHead |
| main:710043ce38 | FUN_710043ce38 | web/script/app/minigame/mg1801/view/index.ts:293 p |
| main:710043af00 | FUN_710043af00 | web/script/app/minigame/mg1801/view/index.ts:293 p |
| main:7100425e60 | GetPlayRate | web/script/app/minigame/mg1801/view/index.ts:293 p |

## 함수 시작 아님·모듈 모름

- mg1801:7100031690 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/data.ts:11 MAX_CUT_COUNTS
- mg1801:71000316b8 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/data.ts:14 OFFSET_X
- mg1801:710003b0f0 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/data.ts:86 NPC_JOY_MOT
- mg1801:710000b608 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/data.ts:116 LOOK_EXCEPTIONS
- mg1801:7100446b60 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/data.ts:116 LOOK_EXCEPTIONS
- mg1801:7100007f20 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/obj.ts:56 outlinePos
- mg1801:7100007f64 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/obj.ts:56 outlinePos
- mg1801:7100008e34 (함수 시작 아님) — web/script/app/minigame/mg1801/logic/obj.ts:163 update
- mg1801:710000d26c (함수 시작 아님) — web/script/app/minigame/mg1801/logic/player.ts:155 updateHeadControl
- mg1801:710000b5fc (함수 시작 아님) — web/script/app/minigame/mg1801/view/index.ts:390 cid
