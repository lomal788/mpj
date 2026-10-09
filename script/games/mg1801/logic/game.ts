/**
 * mg1801 한 판 — 원본 mg1801::Scene(+ 기반 ca::rm::RmMgSceneBase, bq::MinigameScene::MinigameFlow)과 MaintainProduct 를 묶는다.
 * 기반(RmMgSceneBase)은 리듬 공용 모듈 games/rhythm/scene.ts, 흐름 단계 진행은 공용 틀 app/scene/minigame/mgscene 이 맡는다(docs/engine/02_rhythm.md 14절).
 * 이 파일은 mg1801 고유 부분: 원본 vtable 훅 덮어쓰기, 제품 파이버(Object → Player), MapImpl NPC·카메라, state·결과 조립.
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
 * - OnGameStartAfter 전(MinigameFlow 1~7: 장면 사운드 시작·페이드인·오프닝)은 공용 틀 app/scene/minigame/mgscene 이 돈다(리듬 장면 훅은 모두 1,
 *   docs/shell/minigame_scene.md §12.12.3).
 * - 리듬 쿠킹의 컨트롤 안내 와이프(RmUiCntWipe 표시)는 닫히는 때를 정하는 내부 갱신을 판독하지 못했다 [미확정]. 웹은 바로 끝난 것으로 둔다
 *   (시험은 controlWipeFrames 로 길이를 넣어 SQ_BGM_RC_CALIBRATION 조건을 본다).
 * - 리믹스 BGM(SQ_BGM_RC_REMIX)의 L0=1 시점은 mg18xx A·C 와 같은 "시작 2박 뒤"로 둔다 [추정].
 * - 원본 결과 점수판(FUN_7100448610)을 시작한 프레임을 state.resultPanelFrame 에 남기고, 점수판 람다가 끝날 때(RESULT_PANEL_FRAMES 뒤) done.
 */
import { F } from '@game/core/fmath';
import { Pads, type PadInput } from '@game/core/pad';
import type { RandModule } from '@game/core/rng';
import type { GameLogic, GameSetup } from '../../../game';
import { CLOSED, CLOSING, OPENING, type Transition } from '@game/lib/transition';
import type { MgPlaySettings, MgSceneContext } from '@app/scene/minigame/mgscene';
import { type RmConfig, type RmOptions, resolveRmConfig } from '../../rhythm/gameWork';
import { RmMgGame } from '../../rhythm/mgGame';
import { type RmBeatData, RmMgSceneBase } from '../../rhythm/scene';
import type { RmWipe } from '../../rhythm/types';
import { rmEndingBgmName, rmGameBgmName, rmInterEndBgmName } from '../../rhythm/soundMan';
import { starJudge } from '../../rhythm/status';
import type { Mg1801Event, Mg1801Result, Mg1801State } from '../state';
import { type ChartRow, chartRows } from './chart';
import { MAIN_BEAT_TYPE, MAX_CUT_COUNTS, NPC_JOY_MOT, NPC_MOTION_FRAMES, RESULT_CAMERA_POS } from './data';
import { ObjectMan } from './objectMan';
import { PlayerMan } from './playerMan';
import { World } from './world';

export { starJudge };

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

const PREFIX = 'SQ_BGM_MG1801';

/** 게임 BGM 이름 — 원본 FUN_7100441990 (공용 games/rhythm/soundMan.ts rmGameBgmName, 접두 SQ_BGM_MG1801) */
export function gameBgmName(mode: number, bpm: number, chart01: boolean, isGenericBgm: boolean): string {
  return rmGameBgmName(PREFIX, mode, bpm, chart01, isGenericBgm);
}

/** 종료 BGM 이름 — 원본 FUN_71004421a0 (공용 rmEndingBgmName, SetGameBgmFinName = SQ_BGM_MG1801_MG_ENDING) */
export function endingBgmName(mode: number, bpm: number, chart01: boolean): string {
  return rmEndingBgmName(`${PREFIX}_MG_ENDING`, PREFIX, mode, bpm, chart01);
}

/** 코스 중간 게임(RmGameWork+0x2C ≠ 0)의 끝 BGM — 원본 FUN_71004429c0 (공용 rmInterEndBgmName) */
export function interEndBgmName(mode: number, bpm: number, chart01: boolean): string {
  return rmInterEndBgmName(PREFIX, mode, bpm, chart01);
}

/** 공용 옵션(chart·mode·course·controlWipeFrames)은 games/rhythm/gameWork.ts RmOptions */
export interface Mg1801Options extends RmOptions {
  /** Params.CpuMiss(원본 기본 0) */
  cpuMiss?: boolean;
}

/** 모드·코스에서 정해지는 RmGameWork·RmMgSceneBase 값(games/rhythm/gameWork.ts RmConfig) */
export type Mg1801Config = RmConfig;

/** mg1801 채보 고르기 — 노멀·롱 chart00, 하드 chart01, 리믹스 chart05s(A 슬롯 index 0 만) */
const CHART_RULE = {
  chartName: (mode: number): string => (mode === 3 ? 'mg1801_rm_chart05s' : mode === 2 ? 'mg1801_rm_chart01' : 'mg1801_rm_chart00'),
  remixCourse: (course: { index: number; count: number }): { index: number; count: number } => ({ index: 0, count: course.count }),
};

export function resolveConfig(opts: Mg1801Options): Mg1801Config {
  return resolveRmConfig(opts, CHART_RULE);
}

export interface Mg1801Env {
  rng: RandModule;
  wipe: RmWipe;
  fade: Transition;
}

export class Mg1801Game extends RmMgSceneBase {
  private readonly w: World;
  private readonly pads = new Pads();
  private readonly total: { total: number; personal: number[] };
  private camera: 'loop' | 'result' | 'capture' = 'loop';
  private readonly fade: Transition;
  private readonly npc: { visible: boolean; motion: string; frame: number; speed: number; restarted: boolean };
  private res: Mg1801Result | null = null;

  constructor(setup: GameSetup, opts: Mg1801Options, env: Mg1801Env) {
    if (setup.players.length !== 4) throw new Error('mg1801: 플레이어는 4명');
    const events: Mg1801Event[] = [];
    super(opts, { mg: 'mg1801', chart: CHART_RULE, events, wipe: env.wipe, isCom: setup.players.map((p) => p.isCom), resultCameraPos: RESULT_CAMERA_POS });
    this.fade = env.fade;
    /* RmSyncedSetupGame: SetMainBeatType(1), SetMgBgmBeforeOneBeatStart(1,0), 채보 읽기 [판독 mg1801 @0x710000e914] */
    this.setMainBeatType(MAIN_BEAT_TYPE);
    this.setMgBgmBeforeOneBeatStart(true, 0);
    this.setChartData(chartRows(this.cfg.chart));
    this.w = new World(
      this.clock,
      env.rng,
      setup.players.map((p) => p.isCom),
      setup.players.map((p) => p.char),
      events,
      this.gameWork,
      this.soundMan,
    );
    this.w.mode = this.cfg.mode;
    if (opts.cpuMiss !== undefined) this.w.params.cpuMiss = opts.cpuMiss;
    this.w.objectMan = new ObjectMan(this.w);
    this.w.playerMan = new PlayerMan(this.w);
    this.setPlayerEntities(this.w.playerMan.players);
    this.total = calcTotalPoint(this.rows);
    this.w.totalPoint = this.total.total;
    this.gameWork.setStarTotalScore(this.total.total);
    this.total.personal.forEach((n, p) => this.gameWork.setPersonalPlayNum(p, n));
    this.w.playerMan.setupCpuMiss(this.total.personal[0]);
    this.setGameBgmLabel(gameBgmName(this.cfg.mode, this.cfg.bpm, this.cfg.chart01, this.w.params.isGenericBgm));
    this.setGameBgmFinName(`${PREFIX}_MG_ENDING`);
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

  readInput(input: readonly (PadInput | null | undefined)[]): void {
    this.pads.read(input);
  }

  /** 제품 파이버(Stage → Object → Player) */
  protected updateProducts(): void {
    const w = this.w;
    for (const f of FIBER_ORDER) {
      if (f === 'object') w.objectMan.update();
      else w.playerMan.update(this.pads);
    }
  }

  // ------------------------------------------------------------------ 원본 mg1801::Scene vtable 덮어쓰기

  /** 원본 TrigRmGameMainBgmPracticeStart(0,1): PlayerMan 입력 켬, MapImpl 은 isLineDraw 일 때만 선 모델 'demo' */
  protected trigRmGameMainBgmPracticeStart(): void {
    this.w.playerMan.receiveState(1);
  }

  /** 원본 MapImpl::ReceiveState(0,2) [판독 @0x7100010a90]: 두 NPC 에 co_joyful00 키, 길이 GetBeatToSec(1, MotNo != 1 ? 4 : 2), SetFrame(0) */
  protected trigRmGameMainBgmTopStart(): void {
    if (!this.npc.visible) return;
    const motNo = this.w.params.rhythmNpcMotNo;
    this.npcPlay(NPC_JOY_MOT[motNo] ?? NPC_JOY_MOT[0], this.w.rhythm.beatToSec(1, motNo !== 1 ? 4 : 2));
  }

  /** TrigRmGameMainChartEnd(0,5): Player::Finish ×4, MapImpl NPC co_idle00(2박 길이) */
  protected trigRmGameMainChartEnd(): void {
    this.w.playerMan.receiveState(5);
    if (this.npc.visible) this.npcPlay('co_idle00', this.w.rhythm.beatToSec(0, 2));
  }

  /** 원본 mg1801::Scene::TrigRmGameEndingSetting @0x710000efc8: RmUiStatusMan::Hide + 채널(0,6) */
  protected trigRmGameEndingSetting(): void {
    this.statusUi = false;
    /* MapImpl::ReceiveState(0,6): steam01, NPC·NPC 의자 숨김, 결과 모델·수프, 카메라 'result', post_result00. PlayerMan: Player::Ending */
    this.camera = 'result';
    this.npc.visible = false;
  }

  /** 원본 OnRmRecieveBeatEntry: ObjectManImpl::Entry(Data) — 줄 하나 */
  protected onRmRecieveBeatEntry(d: RmBeatData): void {
    this.w.objectMan.entry(d.item);
  }

  /** 원본 OnRmGameMain: 0 반환(리듬 10종 모두 덮어 0 — 02_rhythm.md 14.3) */
  protected onRmGameMain(): boolean {
    return false;
  }

  /** NPC 모션 진행(기반 updateAnimation 이 결과 모션보다 먼저 부른다). 이번 프레임에 다시 시작한 것은 0 프레임에 둔다 */
  protected updateGameAnimation(): void {
    const n = this.npc;
    if (n.restarted) n.restarted = false;
    else {
      const max = NPC_MOTION_FRAMES[n.motion];
      n.frame = F(n.frame + n.speed);
      if (max > 0 && n.frame >= max) n.frame = F(n.frame - max);
    }
  }

  protected onResultReady(): void {
    const w = this.w;
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

  get result(): Mg1801Result | null {
    return this.res;
  }

  /** 시험용: 머리 목표·외곽선 점유 확인 */
  get world(): World {
    return this.w;
  }
}

export class Mg1801Logic extends RmMgGame<Mg1801Game, MgSceneContext> implements GameLogic<Mg1801State, Mg1801Event, Mg1801Result> {
  constructor(setup: GameSetup, opts: Mg1801Options = {}) {
    super((ctx) => {
      if (!ctx.rng) throw new Error('mg1801: 호스트가 난수 모듈(ctx.rng)을 넘기지 않았다');
      const w = ctx.wipe;
      return new Mg1801Game(setup, opts, {
        rng: ctx.rng,
        wipe: {
          fadeOut: (t, sp) => w.fadeOut(t, sp),
          fadeIn: (t, sp) => w.fadeIn(t, sp),
          get playing() {
            return w.playing;
          },
        },
        fade: w.core,
      });
    });
  }

  get game(): Mg1801Game {
    if (!this.scene) throw new Error('mg1801: 틀이 아직 setup 을 부르지 않았다');
    return this.scene;
  }

  get state(): Mg1801State {
    return this.game.state;
  }

  get events(): readonly Mg1801Event[] {
    return this.game.events;
  }

  get result(): Mg1801Result | null {
    return this.game.result;
  }
}

export function mg1801PlayOptions(opts: Mg1801Options, play: MgPlaySettings | undefined): Mg1801Options {
  return play ? { ...opts, mode: play.rhythm ? 2 : 0, course: null } : opts;
}
