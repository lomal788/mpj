# 미니게임 분석 문서

게임마다 원본 동작 분석과 웹 포팅 명세를 한 문서로 둔다.
- 작성 형식은 [../../../분석.txt](../../../분석.txt)의 11절 구성을 따른다.
- 전체 목록(코드 ↔ 이름)은 [../../../analysis/minigame_catalog.tsv](../../../analysis/minigame_catalog.tsv).
- 공용 기반(엔진·리듬·그래픽·사운드·UI·장면·카메라·이펙트·캐릭터)은 [../engine/](../engine/README.md).

| 코드 | 이름 | 문서 | 상태 |
|---|---|---|---|
| mg1801 | 싹둑싹둑 수프 (Soup Troupe) | [mg1801.md](mg1801.md) | 로직 판독 완료, 웹 구현(원본 모델·이펙트·소리). 원본과 남은 차이는 PROGRESS.md |
| mg0118 | 미니미니 트라이애슬론 (Tiny Triathlon) | [mg0118.md](mg0118.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 미확정: 액터 점프·허들 충돌(main actor) |
| mg0911 | 와루이지 핀볼 (Waluigi's Pinball Arcade) | [mg0911.md](mg0911.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 웹 물리 = 구-메시 직접 구현 권장 |
| mg0912 | 요시의 산길 레이스 (Yoshi's Mountain Race) | [mg0912.md](mg0912.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 액터 적분은 원본 식, PhysX 질의는 대체 필요 |
| mg0508 | 거대 스테이크 자르기 (Prime Cut) | [mg0508.md](mg0508.md) | 판독·재구현 계산 완료(실제 메시로 절단·면적 계산, 원본 실행 대조 없음) |
| mg0906 | 로젤리나의 스노보드 레이스 (Rosalina's Radical Race) | [mg0906.md](mg0906.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 미확정: UpdateTurn 정밀 식 |
| mg1002 | 아이템 구슬 굴리기 (Roll with It) | [mg1002.md](mg1002.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 웹 물리 = 구-메시 직접 구현 권장 |
| mg0107 | 피해라! 샌드위치 (Sandwiched) | [mg0107.md](mg0107.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 캐릭터 이동은 actor/PhysX 근사 필요 |
| mg0122 | 다 함께 찰칵 (Camera-Ready) | [mg0122.md](mg0122.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 근접도 함수는 디스어셈블리 기준(두 값 반환) |
| mg0101 | 데인저러스 브리지 (Lumber Tumble) | [mg0101.md](mg0101.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 미확정: 카메라 애니 프레임 진행(1.0 vs dt) |
| mg0119 | 기울이기 골프 (Tilt-a-Golf) | [mg0119.md](mg0119.md) | 판독·재구현 계산 완료(원본 실행 대조 없음). 미확정: CPU 경로 노드 좌표(nbmap 파서) |
| mg0203 | 꽈당꽈당 도미노 (Domination) | [mg0203.md](mg0203.md) | [판독] 고유 C 완전33·부분0함수; [미확정] 잔여11묶음·C 미판독13주소. [데이터] 함수 추출/상수 자료 요청0주소·미식별1묶음 |
| mg0108 | 라이트 웨이브 배틀 (Light-Wave Battle) | [mg0108.md](mg0108.md) | [판독] 고유 C 완전49·부분0함수; [미확정] 잔여10묶음·C 미판독5주소. [데이터] 함수 추출/상수 자료 요청0주소·미식별1묶음 |
| mg0113 | 후름의 바람 버티기 (Cold Front) | [mg0113.md](mg0113.md) | [판독] 고유 C 완전42·부분1함수; [미확정] 잔여12묶음·C 미판독4주소. [데이터] 함수 추출/상수 자료 요청0주소·미식별1묶음 |
| mg0116 | 틀린 쿵쿵 찾기 (Thwomp the Difference) | [mg0116.md](mg0116.md) | [판독] 고유 C 완전51·부분0함수; [미확정] 잔여12묶음·C 미판독9주소. [데이터] 함수 추출/상수 자료 요청0주소·미식별1묶음 |
| mg0110 | 이 열쇠가 네 열쇠냐 (Gate Key-pers) | [mg0110.md](mg0110.md) | [판독] 고유 C 완전38·부분1함수; [미확정] 잔여11묶음·C 미판독12주소. [데이터] 함수 추출/상수 자료 요청0주소·미식별1묶음 |

## 리듬 쿠킹 (ca::rm 리듬 프레임워크, 2026-10-02)

공용 기반은 [../engine/02_rhythm.md](../engine/02_rhythm.md). 10게임 Scene vtable 슬롯 비교는 [mg1810.md](mg1810.md) 부록 A. 모두 원본 실행 대조 없음.

| 코드 | 이름 | 문서 | 상태 |
|---|---|---|---|
| rc_stage01 | 리듬 쿠킹 모드 장면 (코스·모드·셰프 등급) | [rc_stage01.md](rc_stage01.md) | 판독·재구현 계산 완료. 노멀 3 / 롱 6(뒤 3게임 BPM 180) / 하드 3 / 리믹스 6, RmGameWork+0x2C 확정 |
| mg1801 | 싹둑싹둑 수프 (Soup Troupe) | [mg1801.md](mg1801.md) | 위 표 |
| mg1802 | 반짝반짝 과일 파르페 (Parfait the Course) | [mg1802.md](mg1802.md) | 판독·재구현 계산 완료. 가속도 상승 에지 2.4 G, JUST 5프레임 |
| mg1803 | 쑥쑥 바비큐 (En Barb!) | [mg1803.md](mg1803.md) | 판독·재구현 계산 완료. 창 ±7·JUST ±3, 한 번 찌르기로 창 안 전부 판정 |
| mg1804 | 휙휙 햄버거 (Burger Builders) | [mg1804.md](mg1804.md) | 판독·재구현 계산 완료. 티켓 구조, 프레임 순서 흐름→Player→Stage, CSV 가 코드 기본값보다 우선 |
| mg1805 | 착착 버터 (Spread 'n Butter) | [mg1805.md](mg1805.md) | 판독·재구현 계산 완료. 버터 뜨기·바르기, JUST ±6·창 ±15, 적중 등록 5프레임 지연 |
| mg1806 | 따라 할래 포즈 카레 (Copycat Curry) | [mg1806.md](mg1806.md) | 판독·재구현 계산 완료. 상승 에지 2.5 G, 판정 번호 0 FAST/1 JUST/2 SLOW |
| mg1807 | 달그락달그락 휘핑크림 (Whisk Cream) | [mg1807.md](mg1807.md) | 판독·재구현 계산 완료. 창 ±15, 그릇 단위 점수 정산. 미확정: 그릇 레인 덮음 |
| mg1808 | 따끈따끈 팬케이크 (Short-Stack Chef) | [mg1808.md](mg1808.md) | 판독·재구현 계산 완료. 바깥 창 없음(늦으면 탐), |d|<6 JUST |
| mg1809 | 꾹꾹 샌드위치 (Footlong Frenzy) | [mg1809.md](mg1809.md) | 판독·재구현 계산 완료. 티켓·커맨드 구조, CSV JUST_RANGE 0.09, 동기 난수 프레임당 3회 |
| mg1810 | 팍팍 야채샐러드 (On the Beet) | [mg1810.md](mg1810.md) | 판독·재구현 계산 완료. 자체 프레임 카운터 판정 ±15, 임계 2.4~4.8 G 가변 |

## 대표작 10개 선정 근거 (2026-10-02)

공개 순위 기사 4곳과 팬 투표 1곳에서 언급된 횟수로 골랐다. 동점(2회)은 순위가 높은 쪽을 택했다.

| 미니게임 | 언급 |
|---|---|
| Tiny Triathlon | Screen Rant 3위, Game Rant 2위, Quest Daily 1위, TheGamer 추천 |
| Waluigi's Pinball Arcade | Game Rant 3위, TheGamer Showdown 1위, Nintendo Life 투표 17% |
| Yoshi's Mountain Race | Game Rant 4위, Nintendo Life Showdown 투표 1위(19%) |
| Prime Cut | Screen Rant 5위, Game Rant 7위, Quest Daily 13위 |
| Rosalina's Radical Race | Screen Rant 1위, TheGamer 추천 |
| Roll with It | Screen Rant 4위, Nintendo Life 아이템 투표 1위(27%) |
| Sandwiched | Game Rant 8위, TheGamer 추천 |
| Camera-Ready | TheGamer 추천, Quest Daily 18위 |
| Lumber Tumble | Screen Rant 7위, TheGamer 자유 대전 1위 |
| Tilt-a-Golf | Game Rant 10위, Quest Daily 5위 |

후보에서 뺀 동점작: DK's Konga Line(Game Rant 6위, Quest Daily 15위), Hot-Hot Hop(Screen Rant 10위, TheGamer 엔드리스 추천).

출처:
- [Screen Rant](https://screenrant.com/mario-party-jamboree-best-minigames-ranked/)
- [Game Rant](https://gamerant.com/best-minigames-mario-party-jamboree-ranked/)
- [Quest Daily](https://questdaily.com.au/feature/top-20-minigames-super-mario-party-jamboree/)
- [TheGamer](https://www.thegamer.com/super-mario-party-jamboree-best-minigames/)
- [Nintendo Life 투표](https://www.nintendolife.com/news/2024/10/poll-which-are-your-favourite-minigames-in-super-mario-party-jamboree)
