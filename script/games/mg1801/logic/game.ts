/**
 * mg1801 한 판 — 원본 mg1801::Scene(+ 기반 ca::rm::RmMgSceneBase, bq::MinigameScene::MinigameFlow)과 MaintainProduct 를 묶는다.
 * step() 한 번 = 원본 한 프레임 [판독: docs/engine/01_core.md, analysis/notes/mg1801_core.md 2절]:
 *   패드 읽기 → RmSoundMan 파이버(JUST 판정음 타이머) → 결과 연출 파이버 → 제품 파이버(Stage → Object → Player)
 *   → 장면 흐름 파이버(MinigameFlow 처리기 하나: 8 OnGameStartAfter, 9 OnGameMain, 10 OnGameEnd, 11 OnGameFinish,
 *     12 OnGameEndingBefore, 13 OnGameEnding). 처리기가 다음 단계를 돌려주면 다음 프레임부터 그 처리기가 돈다(@0x71002e0844).
 * 파이버 순서는 생성 순서다: RmSoundMan(SetupGame) → 결과 연출(SyncedSetupGame) → 제품(RmSyncedSetupGame) → 흐름(다음 프레임 UpdateMain).
 * 박자(G14)·곡 교대(G12)·게임 BGM L0 은 step 의 sound 관측(오디오 쪽 시퀀서 값)을 읽고, 없으면 프레임 모델(logic/rhythm.ts)이 만든다.
 *
 * OnGameMain 단계 0~10 은 원본 RmMgSceneBase::OnGameMain @0x71004441e8 의 switch 를 goto(같은 프레임에 다음 case)까지 옮긴다
 * [판독: analysis/notes/mg1801_rhythm.md 5절, main_ca_rm.c]. 모드는 RmGameWork+0x20(0 노멀 1 롱 2 하드 3 리믹스)이고,
 * 1·3 은 리듬 쿠킹(rc_stage01) 코스 안에서만 나오므로 그 경로(+0x1C = 1, 코스 index, +0x2C)를 함께 둔다(web/docs/minigame/rc_stage01.md).
 *
 * 원본과 다른 점:
 * - OnGameStartAfter 전(MinigameFlow 1~7: 장면 사운드 시작·페이드인·오프닝)은 PREROLL_FRAMES 대기로 대신한다 [미확정 길이].
 * - 리듬 쿠킹의 컨트롤 안내 와이프(RmUiCntWipe 표시)는 닫히는 때를 정하는 내부 갱신을 판독하지 못했다 [미확정]. 웹은 바로 끝난 것으로 둔다
 *   (시험은 controlWipeFrames 로 길이를 넣어 SQ_BGM_RC_CALIBRATION 조건을 본다).
 * - 리믹스 BGM(SQ_BGM_RC_REMIX)의 L0=1 시점은 mg18xx A·C 와 같은 "시작 2박 뒤"로 둔다 [추정].
 * - 원본 결과 점수판(FUN_7100448610)을 시작한 프레임을 state.resultPanelFrame 에 남기고, 점수판 람다가 끝날 때(RESULT_PANEL_FRAMES 뒤) done.
 */
import { F } from '../../../core/fmath';
import { Pads, type PadInput } from '../../../core/pad';
import { BexRandModule } from '../../../core/rng';
import type { GameLogic, GameSetup, SoundSnapshot } from '../../../game';
import { CLOSED, CLOSING, OPENING, Transition, WIPE_WHITE } from '../../../lib/transition';
import type { Mg1801Event, Mg1801Result, Mg1801State, Phase } from '../state';
import { type ChartRow, chartRows } from './chart';
import {
  BPM,
  MAIN_BEAT_TYPE,
  MAX_CUT_COUNTS,
  NPC_JOY_MOT,
  NPC_MOTION_FRAMES,
  PREROLL_FRAMES,
  RC_SPEEDUP_BPM,
  RESULT_CAMERA_POS,
  RESULT_MOTIONS,
  RESULT_PANEL_DELAY_BEATS,
  RESULT_PANEL_FRAMES,
} from './data';
import { ObjectMan } from './objectMan';
import { PlayerMan } from './playerMan';
import { BEATS_PER_BAR, RhythmClock } from './rhythm';
import { World } from './world';

/**
 * 제품 파이버 순서 [판독: 등록 순 push_back + 우선순위 안정 정렬, 세 제품 모두 우선순위 0 — mg1801_core.md 2.2].
 * Stage(MapImpl::Update 는 Wait 만) → Object → Player.
 */
export const FIBER_ORDER: readonly ('object' | 'player')[] = ['object', 'player'];

/** 원본 Scene::CalcTotalPoint @0x710000eb10 — 합계 = Σ 자르기 수·2, 레인별 자르기 수 */
export function calcTotalPoint(rows: readonly ChartRow[]): { total: number; personal: number[] } {
  const personal = [0, 0, 0, 0];
  let total = 0;
  const TYPE_OF: Record<string, number> = { L: 2, M: 1, X: 3, Z: 4 };
  for (const r of rows) {
    r.player.forEach((code, p) => {
      if (code.length === 0 || code[0] === ' ') return;
      const cuts = MAX_CUT_COUNTS[TYPE_OF[code[0]] ?? 0];
      for (let lane = p; lane < Math.min(4, p + cuts); lane++) personal[lane]++;
      total += cuts * 2;
    });
  }
  return { total, personal };
}

/** 원본 RmUiStatusMan::GetStarAchieveRate @0x7100436558 / GetStarAchieveJudge @0x7100436590 */
export function starJudge(achieved: number, total: number): { rate: number; judge: number } {
  let rate = total > 0 ? F(F(achieved / total) * 100) : 0;
  if (rate < 0) rate = 0;
  if (rate > 100) rate = 100;
  const judge = rate >= 80 ? 3 : rate >= 40 ? 2 : rate > 0 ? 1 : 0;
  return { rate, judge };
}

const PREFIX = 'SQ_BGM_MG1801';

/**
 * 게임 BGM 이름 — 원본 FUN_7100441990 [판독]: 모드 3 이면 SQ_BGM_RC_REMIX. 아니면 SetGameBgmName 값(isGenericBgm ? SQ_BGM_RC_GENERIC : _A)이
 * "SQ_BGM_MG1801" 을 품을 때만 BPM > 120 이면 _B, 그 뒤 모드 2 이거나 chart01(+0x470)이면 _C 로 바꾼다(뒤가 앞을 덮는다).
 */
export function gameBgmName(mode: number, bpm: number, chart01: boolean, isGenericBgm: boolean): string {
  if (mode === 3) return 'SQ_BGM_RC_REMIX';
  let name = isGenericBgm ? 'SQ_BGM_RC_GENERIC' : `${PREFIX}_A`;
  if (name.includes(PREFIX)) {
    if (bpm > 120) name = `${PREFIX}_B`;
    if (mode === 2 || chart01) name = `${PREFIX}_C`;
  }
  return name;
}

/**
 * 종료 BGM 이름 — 원본 FUN_71004421a0 [판독]: SetGameBgmFinName("SQ_BGM_MG1801_MG_ENDING") 에서 시작해
 * 모드 0 이면 _A_MG_ENDING, BPM > 120 이면 _B_MG_ENDING, 모드 2 이거나 chart01 이면 _C_MG_ENDING(뒤가 앞을 덮는다).
 * 그래서 롱(모드 1)·BPM 120 만 SQ_BGM_MG1801_MG_ENDING 그대로다. 라벨은 모두 subarc_mg1801.fsst 에 있다 [데이터].
 */
export function endingBgmName(mode: number, bpm: number, chart01: boolean): string {
  let name = `${PREFIX}_MG_ENDING`;
  if (mode === 0) name = `${PREFIX}_A_MG_ENDING`;
  if (bpm > 120) name = `${PREFIX}_B_MG_ENDING`;
  if (mode === 2 || chart01) name = `${PREFIX}_C_MG_ENDING`;
  return name;
}

/** 코스 중간 게임(RmGameWork+0x2C ≠ 0)의 끝 BGM — 원본 FUN_71004429c0 [판독]: _A_INTER_END, BPM > 120 이면 _B, 모드 2·chart01 이면 _C */
export function interEndBgmName(mode: number, bpm: number, chart01: boolean): string {
  let name = `${PREFIX}_A_INTER_END`;
  if (bpm > 120) name = `${PREFIX}_B_INTER_END`;
  if (mode === 2 || chart01) name = `${PREFIX}_C_INTER_END`;
  return name;
}

export interface Mg1801Options {
  /** 시험용: 채보 직접 지정(원본 IsChartDataFree 경로 = Params.chartNo) */
  chart?: string;
  /** RmGameWork+0x20. 1·3 은 리듬 쿠킹에서만 나오므로 course 가 없으면 코스 첫 게임으로 둔다 */
  mode?: number;
  /**
   * 리듬 쿠킹 코스 안이면 index(+0x38)·count(+0x3C). 없으면 미니게임 모드 프리플레이(mgm01, PlayMode 1).
   * 코스 수: 노멀·하드 3, 롱 6, 리믹스 6. mg1801 은 리믹스에서 A 슬롯(index 0, chart05s)만 맡는다 [판독: rc_stage01.md 4.6·6.1].
   */
  course?: { index: number; count: number } | null;
  /** Params.CpuMiss(원본 기본 0) */
  cpuMiss?: boolean;
  /** 시험 전용: 리듬 쿠킹 컨트롤 안내 와이프가 닫기 요청(단계 0) 뒤 끝나는 프레임 수 */
  controlWipeFrames?: number;
  /** 시험 전용: OnGameStartAfter 전 대기 프레임 */
  prerollFrames?: number;
}

/** 모드·코스에서 정해지는 RmGameWork·RmMgSceneBase 값 */
export interface Mg1801Config {
  mode: number;
  /** RmGameWork+0x1C == 1(리듬 쿠킹 진행 중) */
  rc: boolean;
  index: number;
  count: number;
  /** RmGameWork+0x2C — 코스에서 뒤에 게임이 더 남음 (rc_stage01 PreGameWaitFunc @0x71000355ec: idx < 코스수−1) */
  midCourse: boolean;
  /** RmGameWork+0x6C5 — rc_stage01 Params.mg_result_visible(기본 1) → SetMedleyMgResultEnable [판독] */
  medley: boolean;
  bpm: number;
  chart: string;
  /** RmMgSceneBase+0x470 — 채보 경로에 "chart01." */
  chart01: boolean;
  /** 리믹스 2번째 이후(모드 3 && 코스 index > 0) — 단계 0~5 단축. mg1801 은 A 슬롯뿐이라 원본에서는 생기지 않는다 */
  remixShort: boolean;
  /** RmUiCntWipe+0x1D — 컨트롤 안내 와이프 표시. PlayMode 1(미니게임 모드)·리믹스 2번째 이후면 끈다 [판독: SyncedSetupGame @0x7100443340] */
  controlWipe: boolean;
}

export function resolveConfig(opts: Mg1801Options): Mg1801Config {
  let mode = opts.mode ?? 0;
  if (![0, 1, 2, 3].includes(mode)) mode = 0;
  let course = opts.course ?? null;
  if ((mode === 1 || mode === 3) && !course) course = { index: 0, count: mode === 1 || mode === 3 ? 6 : 3 };
  if (mode === 3 && course) course = { index: 0, count: course.count };
  const rc = course !== null;
  const index = course?.index ?? 0;
  const count = course?.count ?? 1;
  const bpm = rc && mode === 1 && index >= Math.trunc(count / 2) ? RC_SPEEDUP_BPM : BPM;
  const chart = opts.chart ?? (mode === 3 ? 'mg1801_rm_chart05s' : mode === 2 ? 'mg1801_rm_chart01' : 'mg1801_rm_chart00');
  const remixShort = mode === 3 && index > 0;
  return {
    mode,
    rc,
    index,
    count,
    midCourse: rc && index < count - 1,
    medley: rc,
    bpm,
    chart,
    chart01: `${chart}.json`.includes('chart01.'),
    remixShort,
    controlWipe: rc && !remixShort,
  };
}

/** 원본 결과 기록 FUN_710042ca10 (단계 8) 가운데 쓰는 것 */
interface ResultRecord {
  scores: number[];
  rate: number;
  judge: number;
  /** 점수 == GetResultPlayerScoreMax */
  perfect: boolean[];
}

export class Mg1801Game implements GameLogic<Mg1801State, Mg1801Event, Mg1801Result> {
  private readonly w: World;
  private readonly pads = new Pads();
  readonly cfg: Mg1801Config;
  private readonly rows: ChartRow[];
  private readonly total: { total: number; personal: number[] };
  private readonly preroll: number;
  private readonly controlWipeFrames: number;
  private phase: Phase = 'ready';
  private frame = 0;
  /** MinigameFlow 단계(+0x214). 0 = OnGameStartAfter 전 대기 */
  private flow = 0;
  private nextFlow = 0;
  /** 원본 OnGameMain·OnGameEnd·OnGameEndingBefore·OnGameEnding 이 함께 쓰는 단계(this+0x370) */
  private stage = 0;
  /** +0x374 단계 타이머 */
  private stageTimer = 0;
  /** +0x37C 다음 Entry 줄 */
  private row = 0;
  /** +0x380 */
  private lastBeatState = -1;
  /** +0x384 / +0x388 Lock 배분 */
  private lockRow = 0;
  private lockBeat = -1;
  /** 단계 1·3 박 수(원본은 +0x37C 를 같이 쓰고 단계가 바뀔 때 0 으로 지운다) */
  private countBeats = 0;
  private bgmStartFrame = -1;
  private readonly bgmLabel: string;
  private endingLabel = '';
  /**
   * RmSoundMan 의 곡 교대 확인 상태 [판독 FUN_7100426948·26b8c·26c2c·269d8·26d24]:
   * +0x38 요청 때 읽은 G12, +0x3C 게임 BGM 접수, +0x3D 게임 BGM L0 == 1, +0x3E 종료 BGM 접수(한 번 참이면 계속 참)
   */
  private readonly snd = { g12: -1, accepted: false, intro: false, endAccepted: false };
  /** +0x473 TrigRmGameWipeFadeOutStart 한 번 */
  private wipeFadeTriggered = false;
  /** 컨트롤 안내 와이프 닫기 요청 프레임(FUN_7100431c5c) */
  private wipeCloseFrame = -1;
  /** +0x430 SQ_BGM_RC_CALIBRATION 핸들(시작 프레임) */
  private calibrationFrame = -1;
  /** +0x462 결과 기록 한 번 */
  private record: ResultRecord | null = null;
  /** PERFECT 텔롭을 띄운 플레이어 */
  private readonly perfectShown = [false, false, false, false];
  private statusUi = false;
  private practiceArrow = false;
  private perfectTelop = false;
  private camera: 'loop' | 'result' | 'capture' = 'loop';
  private readonly fade = new Transition();
  /** OnGameEnding +0x471 앰비언트 끝(또는 생략), +0x472 환호 끝 */
  private ambientDone = false;
  private cheerDone = false;
  /** 결과 연출 객체(+0x358) 갱신 람다 상태: −1 없음, 0 대기, 2 점수판 */
  private resultState = -1;
  private resultPanelFrame: number | undefined = undefined;
  private resultTimer = 0;
  private readonly npc: { visible: boolean; motion: string; frame: number; speed: number; restarted: boolean };
  private finished = false;
  private res: Mg1801Result | null = null;

  constructor(setup: GameSetup, opts: Mg1801Options = {}) {
    if (setup.players.length !== 4) throw new Error('mg1801: 플레이어는 4명');
    this.cfg = resolveConfig(opts);
    this.preroll = opts.prerollFrames ?? PREROLL_FRAMES;
    this.controlWipeFrames = opts.controlWipeFrames ?? 0;
    this.rows = chartRows(this.cfg.chart);
    const rng = new BexRandModule(setup.seed);
    rng.setSyncRandSeed(rng.rand());
    this.w = new World(new RhythmClock(this.cfg.bpm), rng, setup.players.map((p) => p.isCom), setup.players.map((p) => p.char));
    this.w.mode = this.cfg.mode;
    if (opts.cpuMiss !== undefined) this.w.params.cpuMiss = opts.cpuMiss;
    this.w.objectMan = new ObjectMan(this.w);
    this.w.playerMan = new PlayerMan(this.w);
    this.total = calcTotalPoint(this.rows);
    this.w.totalPoint = this.total.total;
    this.w.playerMan.setupCpuMiss(this.total.personal[0]);
    this.bgmLabel = gameBgmName(this.cfg.mode, this.cfg.bpm, this.cfg.chart01, this.w.params.isGenericBgm);
    /* MapImpl::Initialize @0x710000f9d0: RhythmNpcEnable 이고 isLineDraw 가 아니면 HEYHO 둘을 만들고 co_idle00 을 2박 길이로 [판독] */
    this.npc = {
      visible: this.w.params.rhythmNpcEnable && !this.w.params.isLineDraw,
      motion: 'co_idle00',
      frame: 0,
      speed: this.npcSpeed('co_idle00', this.w.rhythm.beatToSec(0, 2)),
      restarted: true,
    };
  }

  /** 원본 ca::rm::util::SetModelMotionSpeedAdjustFromTime @0x7100438a40: 속도 = FrameMax / (시간·60) */
  private npcSpeed(file: string, sec: number): number {
    return F(NPC_MOTION_FRAMES[file] / F(sec * 60));
  }

  private npcPlay(file: string, sec: number): void {
    this.npc.motion = file;
    this.npc.frame = 0;
    this.npc.speed = this.npcSpeed(file, sec);
    this.npc.restarted = true;
  }

  step(input: readonly (PadInput | null | undefined)[], sound?: SoundSnapshot | null): void {
    if (this.finished) return;
    const w = this.w;
    w.events.length = 0;
    this.pads.read(input);
    w.rhythm.observe(sound ?? null);
    this.frame++;
    this.fade.step();
    this.flow = this.nextFlow;
    w.tickExcellentSe();
    w.rhythm.tick();
    this.updateResultFiber();
    if (this.finished) return;
    for (const f of FIBER_ORDER) {
      if (f === 'object') w.objectMan.update();
      else w.playerMan.update(this.pads);
    }
    switch (this.flow) {
      case 0:
        if (this.frame >= this.preroll) this.nextFlow = 8;
        break;
      case 8:
        this.onGameStartAfter();
        this.nextFlow = 9;
        break;
      case 9:
        if (this.gameMain()) this.nextFlow = 10;
        break;
      case 10:
        this.onGameEnd();
        break;
      case 11:
        this.onGameFinish();
        break;
      case 12:
        this.onGameEndingBefore();
        break;
      case 13:
        this.onGameEnding();
        break;
    }
    this.advanceMotions();
  }

  // ------------------------------------------------------------------ MinigameFlow 처리기

  /** 원본 RmMgSceneBase::OnGameStartAfter @0x7100443fa8 (inst 아님) */
  private onGameStartAfter(): void {
    const w = this.w;
    /* FUN_71004263c8: 마스터 SQ_BGM_RC_MAIN_RHYTHM + SQ_BGM_RC_MGCMN_OP 재생(이 순서, 같은 프레임), RmSoundMan+0x28 의 limit = (60/BPM)·0.5.
       OnGameStartAfter 는 첫 줄에서 이것을 부르고 1 을 돌려주므로 MinigameFlow 8 의 한 프레임에만 돈다 [판독 @0x7100443fa8].
       원본은 RmGameWork 의 재생 중 플래그(FUN_710042cfc4·cfd4)가 서 있으면 각각 건너뛴다(리듬 쿠킹 코스 둘째 게임부터는 앞 게임의 마스터가 이어 돈다).
       웹은 앞 게임이 없어 늘 새로 튼다 [근사]. 박자 시계(rhythm.start)도 같은 프레임 = 마스터 틱 0 이다 */
    w.events.push({ k: 'bgm', label: 'SQ_BGM_RC_MAIN_RHYTHM' }, { k: 'bgm', label: 'SQ_BGM_RC_MGCMN_OP' });
    w.rhythm.start();
    w.setExcellentLimit(w.rhythm.bpm);
    this.setPhase('main');
    this.stage = 0;
    if (this.cfg.remixShort) {
      this.wipeFadeTriggered = true;
      this.lastBeatState = w.rhythm.beatState(0);
      this.stage = 2;
    }
  }

  /** 흰 페이드가 재생 중인지(원본 WipeModule::IsPlayingFadeAnim: in/out 애니 재생 중) */
  private fadePlaying(): boolean {
    return this.fade.playing;
  }

  /**
   * 원본 RmMgSceneBase::OnGameEnd @0x71004453c4 (inst 아님): 점수판 아웃(+0x42C) 뒤
   * - 모드 3 이 아니고 (메들리 결과 || +0x2C == 0): 흰 페이드아웃(1.0), +0x370 = 0, OnRmGameEnd(=1) → 단계 11
   * - 그 밖(리믹스): +0x370 = 0 이면 (+0x2C ≠ 0 이면 셰프 모자 FUN_710042a300) 페이드아웃, +0x370 = 1 → 페이드가 끝나면 RequestReturnScene
   */
  private onGameEnd(): void {
    const c = this.cfg;
    this.statusUi = false;
    if (c.mode !== 3 && (c.medley || !c.midCourse)) {
      this.fade.fadeOut(WIPE_WHITE, 1.0);
      this.stage = 0;
      this.nextFlow = 11;
      return;
    }
    if (this.stage !== 1) {
      if (this.stage !== 0) return;
      this.fade.fadeOut(WIPE_WHITE, 1.0);
      this.stage = 1;
    }
    if (!this.fadePlaying()) this.finish();
  }

  private finishFrames = 0;

  /**
   * 원본 MinigameFlow 단계 11 FUN_71002e1910: OnGameFinish(=1) 뒤 하위 0 에서 끝 텔롭(FUN_71002e2e90)을 시작한다.
   * 리듬 장면은 SetupGame 이 SetFinishTelop(−1) 이라 텔롭이 없어 하위 99 → 다음 프레임 단계 12 [판독 + 추정: 엔티티 없음 → 0].
   */
  private onGameFinish(): void {
    this.finishFrames++;
    if (this.finishFrames >= 2) this.nextFlow = 12;
  }

  /** 원본 RmMgSceneBase::OnGameEndingBefore @0x7100445518 */
  private onGameEndingBefore(): void {
    const c = this.cfg;
    if (this.stage !== 0) {
      this.resultStart();
      this.stage = 0;
      this.nextFlow = 13;
      return;
    }
    if (c.mode === 3 || (!c.medley && c.midCourse)) {
      this.nextFlow = 13;
      return;
    }
    if (this.fadePlaying()) return;
    this.statusUi = false;
    this.perfectTelop = false;
    this.trigEndingSetting();
    this.stage = 1;
  }

  /** 원본 mg1801::Scene::TrigRmGameEndingSetting @0x710000efc8: RmUiStatusMan::Hide + 채널(0,6) */
  private trigEndingSetting(): void {
    this.statusUi = false;
    /* MapImpl::ReceiveState(0,6): steam01, NPC·NPC 의자 숨김, 결과 모델·수프, 카메라 'result', post_result00. PlayerMan: Player::Ending */
    this.camera = 'result';
    this.npc.visible = false;
    this.setPhase('ending');
  }

  /**
   * 결과 시작 — 원본 FUN_7100447030 [판독]: 네 명에게 결과 모션 키 rm_co_idle00(파일 co_idle00)을 속도 1.0 으로,
   * 리듬 쿠킹·메들리·코스 중간이면 rc_pract_idle00 을 GetPlayRate 속도로. 이어서 FUN_7100446b60 이 머리 시선을 켜고 카메라 위치를 보게 한다.
   */
  private resultStart(): void {
    const c = this.cfg;
    const pract = c.rc && c.medley && c.midCourse;
    for (const p of this.w.playerMan.players) {
      p.resultMotion = pract
        ? { name: RESULT_MOTIONS.pract, next: null, speed: F(this.w.rhythm.bpm / 120), frame: 0 }
        : { name: RESULT_MOTIONS.idle, next: null, speed: 1, frame: 0 };
      p.look.head = true;
      p.headTarget = { ...RESULT_CAMERA_POS };
    }
  }

  /** 원본 RmMgSceneBase::OnGameEnding @0x7100445620 */
  private onGameEnding(): void {
    const w = this.w;
    const c = this.cfg;
    const rec = this.record;
    const rate = rec?.rate ?? 0;
    if (this.stage === 0) {
      this.fade.fadeIn(WIPE_WHITE, 1.0);
      /* FUN_71004431cc: LoadSettingPreset("<mg>_result") */
      w.events.push({ k: 'soundPreset', name: 'mg1801_result' });
      /* f32(rate / 20) 을 double 로 0.1 과 비교 — 작으면 앰비언트 생략(+0x471 = 1) [판독 @0x7100445694~0x71004456b4] */
      if (F(rate / 20) < 0.1) this.ambientDone = true;
      this.stageTimer = 0;
      this.stage = 1;
    }
    if (this.stage === 1) {
      this.stageTimer = F(w.dt + this.stageTimer);
      if (this.stageTimer > F(0.1)) {
        if (!this.ambientDone) {
          w.events.push({ k: 'bgm', label: 'SM_AMB_MG1801_MG_RESULT' });
          this.ambientDone = true;
        }
        if (!this.cheerDone) {
          /* SQ_SE_RC_CHEER_MG_FIN(+0x2C ≠ 0 이면 _MG), 지역 변수 5 = (int)달성률 */
          w.events.push({ k: 'seLocal', label: c.midCourse ? 'SQ_SE_RC_CHEER_MG' : 'SQ_SE_RC_CHEER_MG_FIN', index: 5, value: Math.trunc(rate) });
          this.cheerDone = true;
        }
      }
      if (this.fadePlaying()) return;
      /* FUN_7100447a90: (+0x2C == 0) 결과 징글 GOOD(판정 > 1)/BAD, 결과 연출 갱신 람다 시작 */
      if (!c.midCourse) w.events.push({ k: 'bgm', label: (rec?.judge ?? 0) > 1 ? 'SM_JIN_MG1801_MG_RESULT_GOOD' : 'SM_JIN_MG1801_MG_RESULT_BAD' });
      this.resultState = 0;
      this.resultTimer = 0;
      this.stageTimer = 0;
      this.stage = 2;
    }
  }

  /**
   * 결과 연출 파이버(FUN_7100446b20) — 람다 @0x7100447d10 상태 0 [판독]: timer += dt, timer ≥ (1/PlayRate)·0.5 이면
   * 승패 모션(FUN_71004475d0, 리듬 쿠킹이 아니거나 코스 마지막)과 결과 점수판(FUN_7100448610). 웹은 점수판에서 끝낸다.
   */
  private updateResultFiber(): void {
    if (this.resultState === 3) {
      /* 결과 점수판 람다(@0x71004495f0)가 끝 플래그(+0x48)를 세울 때까지 결과 장면을 유지한다 */
      if (this.frame - (this.resultPanelFrame ?? this.frame) >= RESULT_PANEL_FRAMES) this.finish();
      return;
    }
    if (this.resultState !== 0) return;
    const w = this.w;
    this.resultTimer = F(w.dt + this.resultTimer);
    const playRate = F(w.rhythm.bpm / 120);
    if (this.resultTimer < F(F(1 / playRate) * RESULT_PANEL_DELAY_BEATS)) return;
    const c = this.cfg;
    if (!c.rc || !c.midCourse) {
      /* FUN_71004475d0 → FUN_7100446d90: 판정 3 → co_win00a→b, 2 → co_joy00a→b, 1 이하 → co_lose00a→b(속도는 바꾸지 않는다) */
      const judge = this.record?.judge ?? 0;
      const a = judge > 1 ? (judge === 2 ? RESULT_MOTIONS.joy : RESULT_MOTIONS.win) : RESULT_MOTIONS.lose;
      for (const p of w.playerMan.players) p.resultMotion = { name: a, next: a.replace(/a$/, 'b'), speed: p.resultMotion?.speed ?? 1, frame: 0 };
    }
    /* FUN_7100448610: 결과 점수판 시작(같은 프레임) */
    this.resultState = 3;
    this.resultPanelFrame = this.frame;
  }

  // ------------------------------------------------------------------ OnGameMain

  /** 컨트롤 안내 와이프가 끝났는지(원본 RmUiCntWipe::IsWipeFinished = 내부 +0x80, 표시하지 않으면 생성자 값 1) */
  private wipeFinished(): boolean {
    if (!this.cfg.controlWipe) return true;
    return this.wipeCloseFrame >= 0 && this.frame - this.wipeCloseFrame >= this.controlWipeFrames;
  }

  /** 원본 TrigRmGameMainBgmPracticeStart(0,1): PlayerMan 입력 켬, MapImpl 은 isLineDraw 일 때만 선 모델 'demo' */
  private practiceStart(): void {
    this.w.playerMan.receiveState(1);
  }

  /**
   * 원본 RmMgSceneBase::OnGameMain 한 프레임. 참 = 1 반환(단계 10). 단계 사이 goto 는 continue 로 같은 프레임에 이어 간다.
   * 꼬리(줄 배분)를 타지 않고 돌아가는 곳(단계 0 대기, 리믹스 단계 2, 단계 10)은 원본처럼 꼬리 없이 끝난다.
   */
  private gameMain(): boolean {
    const w = this.w;
    const r = w.rhythm;
    const c = this.cfg;
    const beat = r.beatState(MAIN_BEAT_TYPE);
    const beat4 = r.beatState(0);
    let skipCount = false;
    stages: for (;;) {
      switch (this.stage) {
        case 0:
          if (beat4 !== 1) return false;
          /* (!inst) FUN_7100431c5c 와이프 닫기 요청, 코스 첫 게임이면 FUN_710042a300(셰프 모자, 모드 3 만) */
          if (c.controlWipe && this.wipeCloseFrame < 0) this.wipeCloseFrame = this.frame;
          if (!c.controlWipe && !this.wipeFadeTriggered) this.wipeFadeTriggered = true;
          this.countBeats = 0;
          this.lastBeatState = 1;
          this.stage = 1;
          skipCount = true;
          continue stages;
        case 1:
          if (!skipCount && this.lastBeatState !== beat4) {
            this.lastBeatState = beat4;
            this.countBeats++;
          }
          if (c.controlWipe && this.countBeats > 4 && (this.calibrationFrame < 0 || this.frame - this.calibrationFrame >= CALIBRATION_FRAMES)) {
            w.events.push({ k: 'bgm', label: 'SQ_BGM_RC_CALIBRATION' });
            this.calibrationFrame = this.frame;
          }
          if (beat4 > 3 && this.wipeFinished()) {
            this.countBeats = 0;
            this.stage = 2;
            continue stages;
          }
          break stages;
        case 2:
          if (!(beat4 === 1 && r.g14 !== 16)) break stages;
          this.row = 0;
          this.lastBeatState = -1;
          this.lockRow = 0;
          this.lockBeat = -1;
          if (c.remixShort) {
            this.practiceStart();
            this.stage = 4;
            return false;
          }
          this.practiceStart();
          /* 게임 BGM 이름 확정(FUN_7100441990) + 재생 요청(FUN_7100426948). 소리는 시퀀스 핸드셰이크로 다음 마디 첫 틱에 난다.
             요청(SoundModule::Play)은 'se' 로 낸다 — 시퀀스가 곧바로 G13 = 곡 ID 를 써 OP 를 끝내고 마스터 킥을 쉬게 한다. 'bgm' 은 단계 3 의 접수 */
          this.requestGameBgm();
          this.practiceArrow = true;
          this.countBeats = 0;
          this.stage = 3;
          continue stages;
        case 3:
          if (this.gameBgmAccepted()) {
            /* FUN_7100426b8c 참(G12 가 바뀜) → PracticeFinish, +0x37C = 0, +0x380 = −1 */
            w.events.push({ k: 'bgm', label: this.bgmLabel });
            this.bgmStartFrame = r.masterFrame;
            this.row = 0;
            this.lastBeatState = -1;
            this.stage = 4;
            continue stages;
          }
          if (this.lastBeatState !== beat4) {
            if (this.countBeats < 4) w.se('SQ_SE_MG1800_COUNT_STICK');
            this.lastBeatState = beat4;
            this.countBeats++;
          }
          if (beat4 > 2) this.practiceArrow = false;
          break stages;
        case 4:
          if (c.remixShort ? beat4 > 3 : this.gameBgmIntro()) {
            /* FUN_7100426c2c(게임 BGM 지역 변수 L0 == 1, 시작 2박 뒤) → FUN_7100426380 + IntroStart */
            this.stage = 5;
            continue stages;
          }
          break stages;
        case 5:
          if (beat4 !== 1) break stages;
          w.events.push({ k: 'soundPreset', name: 'mg1800_cmn' });
          /* TrigRmGameMainBgmTopStart(0,2): MapImpl NPC 'co_joyful00' 키(파일 joy_mot[MotNo]) 를 8분 4개(MotNo 1 이면 2개) 길이로 */
          this.topStart();
          if (!c.rc) w.events.push({ k: 'telop', player: -1, judge: 'START', pos: { x: 0, y: 0, z: 0 } });
          this.statusUi = true;
          this.stage = 6;
          continue stages;
        case 6: {
          const n = this.rows.length;
          let go = false;
          if (c.mode === 3) {
            /* 모드 3: +0x2C == 0 이면 줄수 ≤ Lock && (게임 BGM 핸들 없음 || L1 == 1), +0x2C ≠ 0 이면 핸들 무효 || 줄수 ≤ Lock.
               mg1801 리믹스는 늘 코스 중간(A 슬롯)이고 BGM 은 이어 울리므로 줄수 ≤ Lock 이다. L1 은 [미확정]이라 참으로 둔다 */
            go = n <= this.lockRow;
          } else if (n - 4 <= this.lockRow) {
            go = true;
            this.endingLabel = c.midCourse ? interEndBgmName(c.mode, c.bpm, c.chart01) : endingBgmName(c.mode, c.bpm, c.chart01);
            /* 종료 BGM 재생 요청(FUN_71004269d8, +0x2C ≠ 0 이면 +0x448 직접 Play) — 단계 2 와 같이 'se' 가 요청, 단계 7 'bgm' 이 접수 */
            this.requestEndingBgm(c.midCourse);
          }
          if (!go) break stages;
          this.stageTimer = 0;
          this.stage = 7;
          continue stages;
        }
        case 7:
          if (c.mode === 3 || this.endingBgmAccepted()) {
            if (c.mode !== 3) w.events.push({ k: 'bgm', label: this.endingLabel });
            /* TrigRmGameMainChartEnd(0,5): Player::Finish ×4, MapImpl NPC co_idle00(2박 길이) */
            w.playerMan.receiveState(5);
            if (this.npc.visible) this.npcPlay('co_idle00', r.beatToSec(0, 2));
            if (!c.rc) w.events.push({ k: 'telop', player: -1, judge: 'FINISH', pos: { x: 0, y: 0, z: 0 } });
            this.stageTimer = 0;
            this.stage = 8;
            continue stages;
          }
          break stages;
        case 8:
          if (c.mode !== 3) {
            this.stageTimer = F(w.dt + this.stageTimer);
            if (this.stageTimer < r.beatToSec(0, 1)) break stages;
          }
          this.recordResult();
          if (!c.rc && !c.midCourse) this.showPerfect();
          this.stageTimer = 0;
          this.stage = 9;
          /* 원본 case 8 은 break 없이 case 9 로 이어진다 */
          continue stages;
        case 9:
          if (c.mode !== 3) {
            this.stageTimer = F(w.dt + this.stageTimer);
            if (!c.midCourse && this.stageTimer < r.beatToSec(0, 7)) break stages;
            w.events.push({ k: 'soundStop', label: this.bgmLabel });
          }
          if (!c.midCourse) {
            /* StopMainBgm @0x71004261bc(마스터·OP) + FUN_7100426264(게임 BGM) */
            w.events.push({ k: 'soundStop', label: 'SQ_BGM_RC_MAIN_RHYTHM' }, { k: 'soundStop', label: 'SQ_BGM_RC_MGCMN_OP' });
            if (c.mode === 3) w.events.push({ k: 'soundStop', label: this.bgmLabel });
          }
          this.stageTimer = 0;
          this.stage = 10;
          continue stages;
        case 10:
          this.stage = 0;
          this.stageTimer = 0;
          return true;
        default:
          break stages;
      }
    }
    if (this.stage < 6) {
      /* SetMgBgmBeforeOneBeatStart(1,0): 단계 4·5 에서 4분 상태 == 마디 마지막 박이면 꼬리를 돈다 */
      if (this.stage > 3 && beat4 === BEATS_PER_BAR[0]) this.entryTail(beat);
    } else {
      if (this.lockBeat !== beat && this.lockRow < this.rows.length) {
        this.lockBeat = beat;
        this.lockRow++;
      }
      this.entryTail(beat);
    }
    return false;
  }

  // ------------------------------------------------------------------ RmSoundMan 곡 교대 (사운드 전역 G12·G14, 게임 BGM L0 을 읽는다)

  /** 원본 FUN_7100426948 [판독]: (재생 중이 아니면) +0x38 = G12, Play(게임 BGM). 끝에 +0x3C·+0x3D 를 함께 0(16비트 쓰기) */
  private requestGameBgm(): void {
    const r = this.w.rhythm;
    this.snd.g12 = r.g12;
    this.w.events.push({ k: 'se', label: this.bgmLabel });
    r.requestBgm(this.bgmLabel);
    this.snd.accepted = false;
    this.snd.intro = false;
  }

  /** 원본 FUN_7100426b8c [판독]: +0x3C 면 참. G14 == 16 이면 거짓. G12 == +0x38 이면 거짓. 아니면 +0x3C = 1, +0x38 = G12, 참 */
  private gameBgmAccepted(): boolean {
    const r = this.w.rhythm;
    if (this.snd.accepted) return true;
    if (Math.trunc(r.g14) === 16) return false;
    const g12 = r.g12;
    if (g12 === this.snd.g12) return false;
    this.snd.accepted = true;
    this.snd.g12 = g12;
    return true;
  }

  /** 원본 FUN_7100426c2c [판독]: +0x3D 면 참. 게임 BGM 핸들이 없거나 (int)(G14·0.25) == 4 면 거짓. 핸들 L0 == 1 이면 +0x3D = 1, 참 */
  private gameBgmIntro(): boolean {
    const r = this.w.rhythm;
    if (this.snd.intro) return true;
    const l0 = r.local(this.bgmLabel, 0);
    if (l0 === null || Math.trunc(F(r.g14 * 0.25)) === 4) return false;
    if (l0 !== 1) return false;
    this.snd.intro = true;
    return true;
  }

  /**
   * 종료 BGM 요청 — 원본 FUN_71004269d8 [판독]: +0x38 = G12, Play, +0x3C = 0, +0x3E(16비트) = 0.
   * 코스 중간(+0x2C ≠ 0)은 OnGameMain 이 +0x448 을 직접 Play 해 +0x38·+0x3E 를 건드리지 않는다(+0x38 은 단계 3 접수 때 값).
   */
  private requestEndingBgm(direct: boolean): void {
    const r = this.w.rhythm;
    if (!direct) {
      this.snd.g12 = r.g12;
      this.snd.accepted = false;
      this.snd.endAccepted = false;
    }
    this.w.events.push({ k: 'se', label: this.endingLabel });
    r.requestBgm(this.endingLabel);
  }

  /** 원본 FUN_7100426d24 [판독]: +0x3E 면 참. G12 == +0x38 이면 거짓. 아니면 +0x3E = 1, +0x38 = G12, 참 */
  private endingBgmAccepted(): boolean {
    const r = this.w.rhythm;
    if (this.snd.endAccepted) return true;
    const g12 = r.g12;
    if (g12 === this.snd.g12) return false;
    this.snd.endAccepted = true;
    this.snd.g12 = g12;
    return true;
  }

  /** 원본 꼬리 ENTRY: 경과 프레임 +1, 8분 상태가 바뀌면 줄 하나 */
  private entryTail(beat: number): void {
    const w = this.w;
    w.elapsedFrame++;
    if (beat !== this.lastBeatState && this.row < this.rows.length) {
      w.objectMan.entry(this.rows[this.row]);
      this.lastBeatState = beat;
      this.row++;
    }
  }

  /** 원본 MapImpl::ReceiveState(0,2) [판독 @0x7100010a90]: 두 NPC 에 co_joyful00 키, 길이 GetBeatToSec(1, MotNo != 1 ? 4 : 2), SetFrame(0) */
  private topStart(): void {
    if (!this.npc.visible) return;
    const motNo = this.w.params.rhythmNpcMotNo;
    this.npcPlay(NPC_JOY_MOT[motNo] ?? NPC_JOY_MOT[0], this.w.rhythm.beatToSec(1, motNo !== 1 ? 4 : 2));
  }

  /** 원본 결과 기록 FUN_710042ca10(단계 8, +0x462 로 한 번) — 점수·달성률·별 판정과 GetResultPlayerScoreMax 비교 */
  private recordResult(): void {
    if (this.record) return;
    const w = this.w;
    const j = starJudge(w.teamScore(), this.total.total);
    /* GetResultPlayerScoreMax(idx, p) = ExtA·ExtB + personalPlayNum·2 (mg1801 은 Ext 없음). personalPlayNum 은 SetPersonalPlayNum(레인) 이고
       점수는 PlayerID 칸이다. 웹은 PlayerID = 레인이라 같은 칸을 비교한다 */
    const perfect = w.scores.map((s, p) => s === this.total.personal[p] * 2);
    this.record = { scores: [...w.scores], rate: j.rate, judge: j.judge, perfect };
  }

  /**
   * PERFECT 텔롭 — 원본 FUN_710043af00 [판독]: 플레이어 0~3 마다 GetResultPlayerScore == GetResultPlayerScoreMax 면 띄운다.
   * RmCmnParamMan+0x30(생성자 기본 1)이면 COM 은 뺀다(IsPlayerCom). 이 값을 덮어쓰는 곳은 찾지 못해 기본 1 로 둔다.
   */
  private showPerfect(): void {
    const rec = this.record!;
    rec.perfect.forEach((ok, p) => {
      if (ok && !this.w.isCom[p]) {
        this.perfectShown[p] = true;
        this.w.events.push({ k: 'perfect', player: p });
        this.perfectTelop = true;
      }
    });
  }

  /** 모션 진행(애니메이션 갱신은 파이버 뒤) — NPC 와 결과 모션. 이번 프레임에 다시 시작한 것은 0 프레임에 둔다 */
  private advanceMotions(): void {
    const n = this.npc;
    if (n.restarted) n.restarted = false;
    else {
      const max = NPC_MOTION_FRAMES[n.motion];
      n.frame = F(n.frame + n.speed);
      if (max > 0 && n.frame >= max) n.frame = F(n.frame - max);
    }
    for (const p of this.w.playerMan.players) if (p.resultMotion) p.resultMotion.frame = F(p.resultMotion.frame + p.resultMotion.speed);
  }

  private finish(): void {
    const w = this.w;
    this.setPhase('result');
    this.flow = 14;
    this.finished = true;
    const j = starJudge(w.teamScore(), this.total.total);
    this.res = {
      quit: false,
      ranks: [0, 0, 0, 0],
      frames: this.frame,
      counts: w.objectMan.counts.map((c) => ({ ...c })),
      totalPoint: this.total.total,
      scores: [...w.scores],
      achieved: Math.min(w.teamScore(), this.total.total),
      rate: j.rate,
      starJudge: j.judge,
      perfect: this.record ? [...this.record.perfect] : [false, false, false, false],
      mode: this.cfg.mode,
    };
  }

  private setPhase(p: Phase): void {
    this.phase = p;
  }

  private fadeView(): Mg1801State['fade'] {
    const f = this.fade;
    if (f.phase === OPENING) return { anim: 'WipeWhite_in', frame: f.frame };
    if (f.phase === CLOSING) return { anim: 'WipeWhite_out', frame: f.frame };
    return f.phase === CLOSED ? { anim: 'WipeWhite_normal', frame: 0 } : null;
  }

  get state(): Mg1801State {
    const w = this.w;
    const j = starJudge(w.teamScore(), this.total.total);
    const c = this.cfg;
    return {
      frame: this.frame,
      phase: this.phase,
      stage: this.stage,
      chart: c.chart,
      bpm: w.rhythm.bpm,
      g14: w.rhythm.g14,
      bar: w.rhythm.bar,
      bgmTime: this.bgmStartFrame < 0 ? -1 : (w.rhythm.masterFrame - this.bgmStartFrame) / 60,
      row: this.row,
      rows: this.rows.length,
      objs: w.objectMan.pool.filter((o) => o.active).map((o) => o.view()),
      players: w.playerMan.players.map((p) => p.view()),
      counts: w.objectMan.counts.map((cnt) => ({ ...cnt })),
      scores: [...w.scores],
      totalPoint: this.total.total,
      personal: [...this.total.personal],
      rate: j.rate,
      starJudge: j.judge,
      mode: c.mode,
      camera: this.camera,
      npc: { visible: this.npc.visible, motion: this.npc.motion, frame: this.npc.frame, speed: this.npc.speed },
      perfect: [...this.perfectShown],
      perfectTelop: this.perfectTelop,
      resultPanelFrame: this.resultPanelFrame,
      flow: this.flow,
      fade: this.fadeView(),
      statusUi: this.statusUi,
      practiceArrow: this.practiceArrow,
      bgmLabel: this.bgmLabel,
      course: c.rc ? { index: c.index, count: c.count, midCourse: c.midCourse } : null,
    };
  }

  get events(): readonly Mg1801Event[] {
    return this.w.events;
  }

  get done(): boolean {
    return this.finished;
  }

  get result(): Mg1801Result | null {
    return this.res;
  }

  /** 시험용: 머리 목표·외곽선 점유 확인 */
  get world(): World {
    return this.w;
  }
}

/**
 * SQ_BGM_RC_CALIBRATION 핸들 수명 — 단계 1 은 핸들이 죽었을 때만 다시 재생한다. 시퀀스 길이 6.0 s(BPM 120 렌더)
 * [데이터: extracted/audio/mg1801/seq/SQ_BGM_RC_CALIBRATION.wav, 렌더 근사].
 */
const CALIBRATION_FRAMES = 360;
