/**
 * 미니게임 공용 틀 형식 — 표(tables.json)·UI 애니 길이·플레이어·사건·게임 훅(MgGame) 계약.
 * 근거·설계: docs/shell/minigame_scene.md §12. 이 폴더는 import 0(셸 경계, mgm_common §9.1) — 같은 폴더만 import 한다.
 */
import type { SplitScreenLayerList } from '@game/lib/splitscreen';
import type { Transition } from '@game/lib/transition';
import type { CreateResultStage, ResultStageHost, ResultStageInput, WinLose } from './resultContract';

/** MGSetting 한 행(문자열 열거는 정수, None = −1) — tables.json mgSetting */
export interface MgSettingRow {
  list: 'ND' | 'CA';
  openingSkip: number;
  endingChangeCut: number;
  gameEndTimerPos: number;
  gameEndTime: number;
  endlessGameEndTimerPos: number;
  endlessEndTime: number;
  orderShuffle: number;
  statusFace: number;
  statusIn: number;
  statusOut: number;
  timerIn: number;
  timerOut: number;
  endSeqWaitTime: number;
  instLoop: number;
}

/** MGList 한 행 — tables.json mgList */
export interface MgListRow {
  list: 'ND' | 'CA';
  gameRule: number;
  coin: number;
  endless: number;
  gyro: number;
  callInst: number;
}

/** MgSoundData 한 행 — tables.json mgSound(audio/data/mgsound_setting.json) */
export interface MgSoundRow {
  demoJingle: string;
  instBgm: string;
  freePlayInstBgm: string;
  opJingle: string;
  /** 0 telop_start, 1 telop_3, 2 scene_start */
  bgmPos: number;
  bgm: string;
  bgmNoIntro: string;
  introSkipRegion: string;
  bgmOffset: number;
  bgmStopOffset: number;
  bgmStopFade: string;
  finishJingle: string;
  finishJingleOffset: number;
  /** 0 start, 1 telop */
  resultPos: number;
  resultOffset: number;
  whistle: number;
  splitSe?: string;
}

export interface MgTables {
  mgSetting: Record<string, MgSettingRow>;
  mgList: Record<string, MgListRow>;
  mgSound: Record<string, MgSoundRow>;
}

/** 레이아웃 → 애니 태그 → 길이(ui.json anims 의 frameSize·loop) */
export type UiAnimTable = Record<string, Record<string, { frames: number; loop: boolean }>>;

/** 레이아웃 배치에 쓰는 페인 값(ComUiBase::SetPlace 의 x_bd_00) */
export interface UiPaneBox {
  t: [number, number];
  size: [number, number];
}

/** 틀이 받는 UI 데이터(ui.json 에서 뽑은 것) */
export interface MgUiData {
  anims: UiAnimTable;
  texts: Record<string, string>;
  /** 레이아웃 → x_bd_00 */
  boxes: Record<string, UiPaneBox>;
}

export interface MgPlayerSetup {
  pid: number;
  /** 'pcNN' */
  chara: string;
  isCom: boolean;
  teamId: number;
  /** GetOrder */
  order: number;
  gamePlay?: boolean;
}

/** PlayerWork 미니게임 기록(원본 값 그대로) */
export interface MgPlayer extends MgPlayerSetup {
  rank: number;
  winLose: WinLose;
  coin: number;
}

export interface MgSyncRand {
  u32(): number;
}

export interface MgRandModule {
  randMod(n: number): number;
  rand(): number;
  syncRandF(): number;
  syncRandMod(n: number): number;
  setSyncRandSeed(s: number): void;
  readonly calls: number;
}

export interface MgWipeApi {
  fadeOut(type: number, speed: number): void;
  fadeIn(type: number, speed: number): void;
  readonly playing: boolean;
  readonly core: Transition;
}

export interface MgPlaySettings {
  rhythm: number;
  callInst: boolean;
  useGyro: boolean;
  comLevel: number;
}

/** 이번 프레임 패드(NPAD 비트, 스틱 −32767..32767) — 게이트가 준 입력에서 만든다 */
export interface MgPadState {
  now: number;
  down: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  accX: number;
  accY: number;
  accZ: number;
}

/** 시작/종료 텔롭 종류 3·4 의 사용자 구현(IUserStartFinish vt+0x18/0x20) */
export interface MgUserTelop {
  start(): void;
  finished(): boolean;
}

/** 로직 → 화면·소리 사건(§12.6) */
export type MgSceneEvent =
  | { k: 'stage'; from: number; to: number }
  | { k: 'se'; label: string }
  | { k: 'voice'; label: string }
  | { k: 'bgm'; label: string; region: string | null }
  | { k: 'bgmStop'; fadeSec: number }
  | { k: 'jingle'; label: string }
  | { k: 'groupStop'; groups: number[]; sec: number }
  | { k: 'vib'; label: string }
  | { k: 'pauseEnable'; on: boolean }
  | { k: 'save' }
  | { k: 'resultStage'; input: ResultStageInput }
  | { k: 'exit' };

/** OnEndingInit 인자 = MGResult 핸들(minigame_result §4.1 Set 계열) */
export interface MgResultApi {
  setPlayer(pid: number): void;
  setModel(handle: unknown): void;
  setMotion(type: number, name: string): void;
  setCameraType(t: number): void;
  setCameraPattern(p: number): void;
  setCameraNearZ(z: number): void;
  setCameraFarZ(z: number): void;
  setPcPosOffset(x: number, y: number, z: number): void;
  setThemeChara(chara: string | null): void;
}

/** 상태 얼굴(ComUiStatus) 조작 */
export interface MgStatusApi {
  setValue(pid: number, v: number): void;
  setRank(pid: number, rank: number): void;
  in(immediate?: boolean): void;
  out(immediate?: boolean): void;
}

export interface MgSplitApi {
  to(cols: number, rows: number, focus: number, sec: number): void;
  isFinished(): boolean;
  isSplitting(): boolean;
  readonly list: SplitScreenLayerList;
}

/** 틀이 게임에 주는 문맥(§12.3) */
export interface MgSceneContext {
  readonly mgId: string;
  readonly players: readonly MgPlayer[];
  /** 틀이 받은 시드(게임은 Math.random·URL 을 읽지 않는다) */
  readonly seed: number;
  /** 동기 난수 — 게이트가 연 프레임 안에서만 쓴다 */
  readonly rand: MgSyncRand;
  readonly rng: MgRandModule | null;
  readonly play: MgPlaySettings | null;
  readonly wipe: MgWipeApi;
  requestReturnScene(): void;
  /** 지금 프레임 번호(틀 step 수) */
  readonly frame: number;
  /** GetDeltaTime(f32 1/60) */
  readonly dt: number;
  /** flag 0 — 조작 설명 화면 안 실행 */
  readonly isInst: boolean;
  /** flag 1 — 엔드리스 */
  readonly isEndless: boolean;
  /** 설명 화면 반복 횟수(+0x294) */
  readonly instRetry: number;
  pad(pid: number): MgPadState;
  setStartTelop(type: number, user?: MgUserTelop): void;
  setFinishTelop(type: number, user?: MgUserTelop): void;
  setGameOpeningSkipEnable(on: boolean): void;
  isOpeningSkip(): boolean;
  /** +0x26A — 단계 4 스킵 대기 하위 상태를 끝낸다 */
  endOpeningSkipWait(): void;
  setRank(pid: number, rank: number): void;
  setWinLose(pid: number, wl: WinLose): void;
  setCoin(pid: number, coin: number): void;
  /** CreateWinTelop(PlayerList, LytPlace) — 빈 목록이면 종류 8 */
  createWinTelop(pids: readonly number[], place?: number): void;
  createDrawTelop(place?: number): void;
  winTelopFinished(): boolean;
  winTelopOut(): void;
  readonly status: MgStatusApi | null;
  se(label: string): void;
  whistle(type: number): void;
  fading(): boolean;
  readonly split: MgSplitApi;
}

/** 게임이 구현하는 것(원본 훅 이름 그대로, bool 훅 기본 참) — §12.3 */
export interface MgGame {
  setup(ctx: MgSceneContext): void;
  update?(): void;
  cleanup?(): void;
  onSetGameSequence?(stage: number): void;
  onGameSequenceBefore?(): void;
  onGameSequenceAfter?(): void;
  onThreeMinTimerEnd?(): void;
  onCharaGameDemoStart?(): boolean;
  onCharaGameDemo?(): boolean;
  onCharaGameDemoSkipStart?(): boolean;
  onCharaGameDemoSkipEnd?(): boolean;
  onCharaGameDemoEnd?(): boolean;
  onGameInit?(): boolean;
  onGameInstInit?(): boolean;
  onGameFirstFade?(): boolean;
  onGameOpening?(): boolean;
  onGameOpeningSkip?(): boolean;
  onGameStartBefore?(): boolean;
  onGameStartTelopBefore?(): boolean;
  onGameStart?(): boolean;
  onGameStartAfter?(): boolean;
  onGameMain?(): boolean;
  onGameEnd?(): boolean;
  onGameFinish?(): boolean;
  onGameFinishAfter?(): boolean;
  onEndingInit?(result: MgResultApi): boolean;
  onGameEndingFade?(): boolean;
  onGameEndingChangeCut?(): boolean;
  onGameEndingBefore?(): boolean;
  onGameEnding?(): boolean;
  onGameEndingAfter?(): boolean;
  onGameEndingSkip?(): boolean;
  onGameLastFade?(): boolean;
  onGameExit?(): boolean;
}

export interface MgSceneSetup {
  mgId: string;
  players: readonly MgPlayerSetup[];
  seed: number;
  /** 시드로 만든 동기 난수(페이지가 core/rng 로 만든다 — 셸 경계) */
  rand: MgSyncRand;
  rng?: MgRandModule;
  play?: MgPlaySettings;
  tables: MgTables;
  ui: MgUiData;
  /** flag 0 */
  inst?: boolean;
  /** flag 1 */
  endless?: boolean;
  /** flag 2 — 이번 세션에 캐릭터 데모를 봤음 */
  charaDemoSeen?: boolean;
  /** 캐릭터 미니게임(MGList::IsCharaMiniGame) */
  isChara?: boolean;
  playMode?: number;
  boardMode?: number;
  judgeType?: number;
  /** 시험용 덮어쓰기(원본 아님 — 페이지가 표시한다) */
  settingOverride?: Partial<MgSettingRow>;
  /** 결과 3D 무대(없으면 갈래 B) */
  createResultStage?: CreateResultStage | null;
  /** 결과 무대 호스트 중 페이지가 채우는 것(gl·url·world) */
  resultHost?: Pick<ResultStageHost, 'gl' | 'url'> & Partial<Pick<ResultStageHost, 'world'>>;
  wipe?: Transition;
}
