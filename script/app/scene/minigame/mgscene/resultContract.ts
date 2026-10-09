/**
 * 결과 3D 무대 호출 계약 — 미니게임 공용 틀(app/scene/minigame/mgscene, 단계 13·14)과 결과 무대(app/scene/minigame/mgresult, [mg-result3d] 담당) 사이.
 * 근거: docs/shell/minigame_result.md §3·§6.1~6.9, docs/shell/minigame_scene.md §6.6·§12. import 0(three 타입도 쓰지 않는다 — gl 은 unknown 으로 넘기고 무대가 THREE.WebGLRenderer 로 본다).
 *
 * 흐름: 게임이 결과 직전(OnEndingInit 까지) setPlayer 로 플레이어를 1명 이상 등록하면(MGResult+0x13C = 1) 틀이 단계 13 에서
 *   createResultStage(input, host) → 매 프레임 step() → done 이면 단계 14 → 16. 등록이 없으면 엔딩 5단계(틀 ending.ts)만 돈다.
 * 3D 는 무대가 host.gl 로 그리고(render), 틀이 그 위에 2D UI(와이프·승리 텔롭·코인)를 합성한다.
 */

/** PlayerWork 승패 열거 [판독 minigame_result §6.1]: 1 승, 0 패, 2 무, −1 미정 */
export type WinLose = -1 | 0 | 1 | 2;

export interface ResultPlayer {
  /** PlayerID 0..3 */
  pid: number;
  /** 캐릭터 'pcNN' */
  chara: string;
  /** GetOrder(자리 순서) */
  order: number;
  teamId: number;
  isCom: boolean;
  winLose: WinLose;
  /** 0 = 1위 */
  rank: number;
  coin: number;
}

/** MGResult Set 계열 [판독 minigame_result §4.1] */
export interface ResultStageOptions {
  /** SetCameraType: 0 Normal, 그 외 Overlook */
  cameraType: number;
  /** SetCameraPattern: −1 기본, 0/1 */
  cameraPattern: number;
  /** SetCameraNearZ/FarZ: −1 = 그대로 */
  nearZ: number;
  farZ: number;
  /** SetPcPosOffset */
  pcPosOffset: [number, number, number];
  /** SetThemeChara('pcNN', 없으면 null) */
  themeChara: string | null;
  /** SetMotion(type 0~4) — 빈 값이면 기본 co_idle00 / co_win00a·b / co_lose00a·b */
  motions: { idle?: string; winA?: string; winB?: string; loseA?: string; loseB?: string };
}

export interface ResultStageInput {
  mgId: string;
  /** MGList GameRule 숫자(0 VS4, 1 2VS2, 2 1VS3, 3 1VS1, … 9 Boss) */
  gameRule: number;
  isCoin: boolean;
  isChara: boolean;
  judgeType: number;
  boardMode: number;
  playMode: number;
  /** SetPlayer 로 등록한 플레이어만(등록 순서) */
  players: ResultPlayer[];
  opts: ResultStageOptions;
  /** 동기 난수 SyncRand(u32) — 주사위 Fisher–Yates */
  rand(): number;
}

/** 틀이 무대에 주는 것 */
export interface ResultStageHost {
  /** THREE.WebGLRenderer(틀 캔버스, 1920×1080 기준). 무대는 자기 장면·카메라로 3D 만 그린다 */
  gl: unknown;
  /** WipeModule.FadeOut/FadeIn(sec) — 와이프 그림은 틀 2D */
  fade(dir: 'out' | 'in', sec: number): void;
  fading(): boolean;
  /** 승리 텔롭(ComUiMGTelop, MGResult+0x68). no = +0x140, place = list.Telop_1/Telop_2 값 */
  winTelop: { start(no: number, place: string): void; out(): void; finished(): boolean };
  /** Coin 갈래 코인 표시(ea810) */
  coinShow(pid: number, coin: number): void;
  se(label: string): void;
  bgm(label: string | null): void;
  /** MGSound::TryStartResultSound(0, no) */
  resultSound(no: number): void;
  /** MGUiMgr::TimingOut(n) */
  uiTimingOut(n: number): void;
  /** assets/ 기준 경로 → URL */
  url(path: string): string;
  /** 게임 3D 장면(THREE.Scene)과 결과 기준점 — 있으면 무대가 그 장면에 올린다(SetModel pos_result) */
  world?: { scene: unknown; origin?: { pos: [number, number, number]; quat: [number, number, number, number] } };
  /** 주사위 갈래 ComUiGenericTelop(mg_tl401_windice) — 없으면 무대가 건너뛴다 */
  genericTelop?: { start(msg: string): void; out(): void; finished(): boolean };
  dice?(pid: number, value: number): void;
}

export interface ResultStage {
  /** 1/60 고정 한 프레임 = 원본 결과 파이버 Wait 한 번 */
  step(): void;
  /** 결과 파이버 완료(MGResult+0xB8) → 틀 단계 14 → 16 */
  readonly done: boolean;
  /** 주사위 갈래가 쓴 승패(후보만) — 틀이 done 뒤 PlayerWork 에 반영한다 */
  readonly writes?: readonly { pid: number; winLose: WinLose }[];
  /** 3D 패스만. 틀이 그 뒤 2D 를 합성한다 */
  render(): void;
  dispose(): void;
}

export type CreateResultStage = (input: ResultStageInput, host: ResultStageHost) => Promise<ResultStage>;

export const DEFAULT_RESULT_OPTIONS: Readonly<ResultStageOptions> = {
  cameraType: 0,
  cameraPattern: -1,
  nearZ: -1,
  farZ: -1,
  pcPosOffset: [0, 0, 0],
  themeChara: null,
  motions: {},
};
