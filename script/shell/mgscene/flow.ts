/**
 * bq::MinigameScene::MinigameFlow 웹 구현 — 단계 0~0x13 처리기, 한 걸음 규칙, 강제 종료, 오프닝 건너뛰기, 시작·종료 텔롭, 종료 타이머, 상태 얼굴,
 * 결과(갈래 A 결과 무대 / 갈래 B 엔딩 5단계), 마지막 페이드, 설명 화면 반복. 판독: docs/shell/minigame_scene.md §5·§6·§12.
 * 한 프레임(tick, 게이트가 열린 때만 step): 입력 → game.update → MGSound 갱신 → OnGameSequenceBefore → 처리기 1개 → After →
 *   바뀌면 하위 0·OnSetGameSequence → (7~9) 종료 타이머 검사 → UI 틱(§12.4 순서 [추정]).
 */
import { FADE_TIME_PRESET } from '@game/lib/sound';
import { SplitScreen } from '@game/lib/splitscreen';
import type { FrameGate } from './gate';
import type { ResultStage, ResultStageHost, ResultStageInput, WinLose } from './resultContract';
import { DEFAULT_RESULT_OPTIONS } from './resultContract';
import { MgSound } from './sound';
import type {
  MgGame,
  MgListRow,
  MgPadState,
  MgPlayer,
  MgResultApi,
  MgSceneContext,
  MgSceneEvent,
  MgSceneSetup,
  MgSettingRow,
  MgStatusApi,
  MgUserTelop,
} from './types';
import { MgSkipGuide, MgTelop, MgUiMgr, MgUiStatus, MgUiTimer, MgWipe, ONESHOT_FINISH, ONESHOT_START, type UiLayer } from './ui';

const F = Math.fround;
/** GetDeltaTime — Fixed60(리듬·온라인) f32 1/60. 그 밖 오프라인 미니게임의 실측 dt 는 웹에서 1/60 고정으로 둔다(01_core) */
export const MG_DT = F(1 / 60);
/** bex 트리거 0x3000(+/−) = NPAD PLUS|MINUS */
const SKIP_BUTTONS = (1 << 10) | (1 << 11);
export const STAGE_END = 0x13;

export const STAGE_NAME: Record<number, string> = {
  0: '캐릭터 데모',
  1: '초기화',
  2: '설명 화면 초기화',
  3: '첫 페이드',
  4: '오프닝',
  5: '오프닝 건너뜀',
  6: '시작 전',
  7: '시작(텔롭)',
  8: '시작 직후',
  9: '본편',
  10: '본편 끝',
  11: '종료 텔롭',
  12: '종료 직후',
  13: '결과 시작',
  14: '결과 대기',
  15: '엔딩 건너뜀',
  16: '마지막 페이드',
  17: '나가기',
  18: '설명 화면 반복',
  19: '끝',
};

type BoolHook = keyof {
  [K in keyof MgGame as MgGame[K] extends ((...a: never[]) => boolean) | undefined ? K : never]: true;
};

class TelopSlot {
  telop: MgTelop | null = null;
  constructor(
    public type: number,
    public user: MgUserTelop | null,
  ) {}
}

export class MgScene {
  readonly events: MgSceneEvent[] = [];
  /** 시험용: 지금까지 모든 사건 [프레임, 사건] */
  readonly log: [number, MgSceneEvent][] = [];
  readonly stageLog: [number, number][] = [];
  readonly players: MgPlayer[];
  readonly setting: MgSettingRow;
  readonly list: MgListRow;
  readonly wipe: MgWipe;
  readonly sound: MgSound;
  readonly uiMgr = new MgUiMgr();
  readonly split = new SplitScreen();
  frame = 0;
  stage = 1;
  sub = 0;
  /** +0x21C */
  waitSec = 0;
  /** +0x268 / +0x269 / +0x26A / +0x26B / +0x278 */
  openingSkipAllowed = false;
  gameSkipEnable = true;
  skipWaitEnd = false;
  skipped = false;
  endingChangeCut = false;
  /** +0x290 flag 0 */
  readonly P: boolean;
  /** +0x294 */
  retry = 0;
  /** +0x2A0 엔딩 하위 단계, 결과 갈래 */
  endingStep = 0;
  branch: 'A' | 'B' | null = null;
  demoSub = 0;
  charaDemoSeen: boolean;
  startTelop = new TelopSlot(0, null);
  finishTelop = new TelopSlot(2, null);
  winTelop: MgTelop | null = null;
  endTimer: { timer: MgUiTimer; state: number } | null = null;
  status: MgUiStatus | null = null;
  skipGuide: MgSkipGuide | null = null;
  pauseEnabled = false;
  /** 결과 무대(갈래 A) */
  resultPlayers: number[] = [];
  resultOpts = { ...DEFAULT_RESULT_OPTIONS, pcPosOffset: [0, 0, 0] as [number, number, number], motions: {} as ResultStageInput['opts']['motions'] };
  resultStage: ResultStage | null = null;
  private resultWaiting = false;
  private returnRequested = false;
  /** 결과 무대 승리 텔롭(MGResult+0x68) */
  resultTelop: MgTelop | null = null;
  readonly ctx: MgSceneContext;
  private pads: MgPadState[] = [];
  private prevButtons = [0, 0, 0, 0];
  private readonly emitFn = (e: MgSceneEvent): void => {
    this.events.push(e);
    this.log.push([this.frame, e]);
  };

  constructor(
    readonly setup: MgSceneSetup,
    readonly game: MgGame,
    readonly gate: FrameGate,
  ) {
    const s = setup.tables.mgSetting[setup.mgId];
    const l = setup.tables.mgList[setup.mgId];
    if (!s || !l) throw new Error(`mgscene: 표에 없는 미니게임 ${setup.mgId}`);
    this.setting = { ...s, ...(setup.settingOverride ?? {}) };
    this.list = l;
    this.P = !!setup.inst;
    this.charaDemoSeen = !!setup.charaDemoSeen;
    this.players = setup.players.map((p) => ({ ...p, rank: -1, winLose: -1, coin: 0 }));
    this.wipe = new MgWipe(this.P, setup.wipe);
    this.sound = new MgSound(setup.tables.mgSound[setup.mgId] ?? null, this.emitFn);
    this.ctx = this.makeContext();
    game.setup(this.ctx);
    this.init();
  }

  // ------------------------------------------------------------ 문맥

  private makeContext(): MgSceneContext {
    const sc = this;
    const statusApi: MgStatusApi = {
      setValue: (pid, v) => sc.status?.setValue(pid, v),
      setRank: (pid, r) => sc.status?.setRank(pid, r),
      in: (imm) => sc.status?.in(!!imm),
      out: (imm) => sc.status?.out(!!imm),
    };
    const find = (pid: number): MgPlayer | undefined => sc.players.find((p) => p.pid === pid);
    return {
      mgId: sc.setup.mgId,
      players: sc.players,
      seed: sc.setup.seed,
      rand: sc.setup.rand,
      rng: sc.setup.rng ?? null,
      play: sc.setup.play ?? null,
      wipe: {
        fadeOut: (type, speed) => sc.wipe.direct(true, type, speed),
        fadeIn: (type, speed) => sc.wipe.direct(false, type, speed),
        get playing() {
          return sc.wipe.core.playing;
        },
        core: sc.wipe.core,
      },
      requestReturnScene: () => {
        sc.returnRequested = true;
      },
      get frame() {
        return sc.frame;
      },
      dt: MG_DT,
      isInst: sc.P,
      isEndless: !!sc.setup.endless,
      get instRetry() {
        return sc.retry;
      },
      pad: (pid) => sc.pads[pid] ?? { now: 0, down: 0, lx: 0, ly: 0, rx: 0, ry: 0, accX: 0, accY: 0, accZ: 0 },
      setStartTelop: (type, user) => {
        sc.startTelop = new TelopSlot(type, user ?? null);
        sc.makeTelop(sc.startTelop);
      },
      setFinishTelop: (type, user) => {
        sc.finishTelop = new TelopSlot(type, user ?? null);
        sc.makeTelop(sc.finishTelop);
      },
      setGameOpeningSkipEnable: (on) => {
        sc.gameSkipEnable = on;
        if (!on) sc.skipGuide?.close();
      },
      isOpeningSkip: () => sc.skipped,
      endOpeningSkipWait: () => {
        sc.skipWaitEnd = true;
      },
      setRank: (pid, r) => {
        const p = find(pid);
        if (p) p.rank = r;
      },
      setWinLose: (pid, wl) => {
        const p = find(pid);
        if (p) p.winLose = wl;
      },
      setCoin: (pid, c) => {
        const p = find(pid);
        if (p) p.coin = c;
      },
      createWinTelop: (pids, place) => sc.createWinTelop(pids, place),
      createDrawTelop: (place) => sc.createWinTelop([], place),
      winTelopFinished: () => !sc.winTelop || sc.winTelop.finished(),
      winTelopOut: () => sc.winTelop?.out(),
      get status() {
        return sc.status ? statusApi : null;
      },
      se: (label) => sc.emitFn({ k: 'se', label }),
      whistle: (type) => sc.sound.whistle(type),
      fading: () => sc.wipe.playing(),
      split: {
        to: (cols, rows, focus, sec) => sc.splitTo(cols, rows, focus, sec),
        isFinished: () => sc.split.list.isFinished(),
        isSplitting: () => sc.split.list.isSplitting(),
        list: sc.split.list,
      },
    };
  }

  private telopDeps() {
    return {
      anims: this.setup.ui.anims,
      texts: this.setup.ui.texts,
      inst: this.P,
      emit: this.emitFn,
      resultSound: (type: number) => this.sound.resultSound(1, type, this.list.gameRule, this.players),
    };
  }

  private makeTelop(slot: TelopSlot): void {
    slot.telop = slot.type >= 0 && slot.type < 3 ? new MgTelop(slot.type, this.telopDeps()) : null;
  }

  splitTo(cols: number, rows: number, focus: number, sec: number): void {
    this.split.to(cols, rows, focus, sec);
    const se = this.sound.rec?.splitSe;
    if (sec > 0 && se) this.emitFn({ k: 'se', label: se });
  }

  /** CreateWinTelop / CreateDrawTelop — P 면 아무것도 안 한다 */
  createWinTelop(pids: readonly number[], place = -1): void {
    if (this.P) return;
    const ps = pids.map((pid) => this.players.find((p) => p.pid === pid)!).filter(Boolean);
    const type = ps.length === 0 ? 8 : 5;
    void place;
    this.winTelop = new MgTelop(type, this.telopDeps(), ps, 0x8800);
    this.winTelop.start();
  }

  // ------------------------------------------------------------ 초기화 FUN_71002e0548

  private init(): void {
    this.uiMgr.entries.length = 0;
    this.uiMgr.timers.length = 0;
    this.sub = 0;
    this.stage = 1;
    this.game.onSetGameSequence?.(1);
    const s = this.setting;
    if (this.setup.isChara && !this.charaDemoSeen) {
      this.stage = 0;
      this.demoSub = 0;
    }
    this.openingSkipAllowed = s.openingSkip === 1;
    this.endingChangeCut = s.endingChangeCut === 1;
    const anims = this.setup.ui.anims;
    const box = this.setup.ui.boxes.sys_timer_00;
    this.endTimer = null;
    this.status = null;
    if (!this.setup.endless) {
      if (s.gameEndTimerPos !== -1) {
        const t = new MgUiTimer(anims, box, this.emitFn);
        t.setPlace(s.gameEndTimerPos);
        this.endTimer = { timer: t, state: 0 };
      }
      if (s.statusFace !== -1) {
        const match = this.list.gameRule >= 0 && this.list.gameRule <= 3 ? this.list.gameRule : 0;
        const st = new MgUiStatus(0x10, match, s.statusFace, this.players, anims, this.P);
        this.status = st;
        this.uiMgr.entry({ inTiming: s.statusIn, outTiming: s.statusOut, in: (i) => st.in(i), out: (i) => st.out(i) });
      }
    } else if (s.endlessGameEndTimerPos !== -1) {
      const t = new MgUiTimer(anims, box, this.emitFn);
      t.setPlace(s.endlessGameEndTimerPos);
      this.endTimer = { timer: t, state: 0 };
    }
    if (this.endTimer) {
      const t = this.endTimer.timer;
      this.uiMgr.entryTimer({ inTiming: this.setup.endless ? -1 : s.timerIn, outTiming: s.timerOut, in: (i) => t.in(i), out: (i) => t.out(i) });
    }
    this.makeTelop(this.startTelop);
    this.makeTelop(this.finishTelop);
  }

  // ------------------------------------------------------------ 한 프레임

  /** 게이트가 열렸으면 한 프레임 진행. 진행했으면 true */
  tick(): boolean {
    if (this.stage === STAGE_END) return false;
    if (!this.gate.canStep(this.frame)) return false;
    this.step(this.gate.inputsFor(this.frame));
    return true;
  }

  private step(inputs: readonly ({ buttons: number; lx: number; ly: number; rx: number; ry: number; accX?: number; accY?: number; accZ?: number } | null)[]): void {
    this.events.length = 0;
    this.pads = [];
    for (let i = 0; i < 4; i++) {
      const p = inputs[i];
      const b = p?.buttons ?? 0;
      this.pads[i] = { now: b, down: b & ~this.prevButtons[i], lx: p?.lx ?? 0, ly: p?.ly ?? 0, rx: p?.rx ?? 0, ry: p?.ry ?? 0, accX: p?.accX ?? 0, accY: p?.accY ?? 0, accZ: p?.accZ ?? 0 };
      this.prevButtons[i] = b;
    }
    this.game.update?.();
    this.game.onGameSequenceBefore?.();
    this.sound.update(MG_DT);
    const cur = this.stage;
    const next = this.handler(cur);
    this.game.onGameSequenceAfter?.();
    if (next !== cur) this.setStage(next);
    if (this.returnRequested && this.stage !== STAGE_END) this.setStage(STAGE_END);
    if (this.stage >= 7 && this.stage <= 9 && this.endTimer && this.endTimerStep()) {
      this.game.onThreeMinTimerEnd?.();
      this.setStage(10);
    }
    this.uiTick();
    this.frame++;
  }

  private setStage(next: number): void {
    const from = this.stage;
    this.stage = next;
    this.sub = 0;
    this.stageLog.push([this.frame, next]);
    this.emitFn({ k: 'stage', from, to: next });
    this.game.onSetGameSequence?.(next);
    if (next === STAGE_END) this.emitFn({ k: 'exit' });
  }

  private uiTick(): void {
    this.wipe.tick();
    this.startTelop.telop?.tick(MG_DT);
    this.finishTelop.telop?.tick(MG_DT);
    this.winTelop?.tick(MG_DT);
    this.resultTelop?.tick(MG_DT);
    this.endTimer?.timer.tick(MG_DT);
    this.status?.tick();
    this.skipGuide?.tick();
    this.split.step(MG_DT);
  }

  private hook(name: BoolHook): boolean {
    const f = this.game[name] as (() => boolean) | undefined;
    return f ? f.call(this.game) : true;
  }

  /** 그릴 레이아웃(그리기 순서 = order 오름차순) */
  layers(): UiLayer[] {
    const out: UiLayer[] = [];
    if (this.status?.layer.visible) out.push(this.status.layer);
    if (this.endTimer?.timer.layer.visible) out.push(this.endTimer.timer.layer);
    for (const t of [this.startTelop.telop, this.finishTelop.telop, this.winTelop, this.resultTelop]) if (t?.layer.visible) out.push(t.layer);
    if (this.skipGuide?.layer.visible) out.push(this.skipGuide.layer);
    return out.sort((a, b) => a.order - b.order);
  }

  // ------------------------------------------------------------ 텔롭 시작·끝 FUN_71002e2e90 / FUN_71002e30a0

  private telopStart(slot: TelopSlot): boolean {
    const t = slot.type;
    if (t < 3) {
      if (t < 0 || !slot.telop) return false;
      if (t === 0) slot.telop.setOneshot(ONESHOT_START);
      if (t === 2) slot.telop.setOneshot(ONESHOT_FINISH);
      slot.telop.start();
      if (t !== 2) this.sound.bgmAt(t, 0);
      else this.sound.finishJingle();
      return true;
    }
    if (t === 3 || t === 4) slot.user?.start();
    return true;
  }

  private telopFinished(slot: TelopSlot): boolean {
    const t = slot.type;
    if (t < 3) {
      if (t < 0 || !slot.telop) return true;
      if (t === 1) return slot.telop.isEndCountdown();
      return slot.telop.finished();
    }
    if (t - 3 < 2) return slot.user ? slot.user.finished() : true;
    return true;
  }

  // ------------------------------------------------------------ 종료 타이머 FUN_71002e3260 / 2020 / 33a0

  private endTimerStart(): void {
    const e = this.endTimer!;
    const sec = this.setup.endless ? this.setting.endlessEndTime : this.setting.gameEndTime;
    if (sec >= 1) {
      e.timer.startTimer(sec);
      e.state = 1;
    }
  }

  private endTimerStep(): boolean {
    const e = this.endTimer!;
    if (e.state === 3) return true;
    if (e.state === 2) {
      if (e.timer.isEnd()) {
        e.timer.out(false);
        this.uiMgr.timersOut();
        e.state = 3;
        return true;
      }
    } else if (e.state === 1 && e.timer.remainSecond() <= 30) {
      e.timer.in(false);
      e.state = 2;
    }
    return false;
  }

  private endTimerStop(): void {
    const e = this.endTimer;
    if (!e) return;
    if (e.state === 2) {
      e.timer.out(false);
      e.timer.suspend();
    }
    e.state = 3;
    e.timer.suspend();
  }

  private skipInput(): boolean {
    for (const p of this.players) if (!p.isCom && (this.pads[p.pid]?.down ?? 0) & SKIP_BUTTONS) return true;
    return false;
  }

  // ------------------------------------------------------------ 단계 처리기

  private handler(st: number): number {
    switch (st) {
      case 0:
        return this.stage0();
      case 1:
        return this.hook('onGameInit') ? (this.P ? 2 : 3) : 1;
      case 2: {
        if (!this.hook('onGameInstInit')) return 2;
        return this.retry !== 0 ? 6 : 3;
      }
      case 3:
        return this.stage3();
      case 4:
        return this.stage4();
      case 5:
        return this.hook('onGameOpeningSkip') ? 6 : 5;
      case 6:
        return this.stage6();
      case 7:
        return this.stage7();
      case 8:
        return this.hook('onGameStartAfter') ? 9 : 8;
      case 9:
        if (!this.hook('onGameMain')) return 9;
        this.endTimerStop();
        return 10;
      case 10: {
        if (!this.hook('onGameEnd')) return 10;
        if (!this.P) return 11;
        if (this.setting.instLoop === 0) return 16;
        if (this.setting.instLoop === 1) return 12;
        return 10;
      }
      case 11:
        return this.stage11();
      case 12:
        if (!this.hook('onGameFinishAfter')) return 12;
        return this.P && this.setting.instLoop === 1 ? 16 : 13;
      case 13:
        return this.stage13();
      case 14:
        return this.stage14();
      case 15:
        return this.hook('onGameEndingSkip') ? 16 : 15;
      case 16:
        return this.stage16();
      case 17:
        if (!this.hook('onGameExit')) return 17;
        return this.P ? 18 : STAGE_END;
      case 18:
        return this.stage18();
    }
    return st;
  }

  /** 단계 0 캐릭터 데모(§6.2) */
  private stage0(): number {
    switch (this.demoSub) {
      case 0:
        this.skipGuide = new MgSkipGuide(this.setup.ui.anims, this.setup.ui.texts);
        this.skipGuide.show();
        this.demoSub = 1;
        return 0;
      case 1:
        if (this.skipGuide?.shown && this.skipInput()) {
          this.emitFn({ k: 'se', label: 'SQ_SE_SYS_SKIP' });
          this.emitFn({ k: 'groupStop', groups: [0x22, 0x23, 1, 0x25, 0x29], sec: 0.3 });
          this.emitFn({ k: 'vib', label: 'bv_vib_sys_skip' });
          this.hook('onCharaGameDemoSkipStart');
          this.demoSub = 3;
          return 0;
        }
        if (this.hook('onCharaGameDemoStart')) {
          this.wipe.fadeIn(1);
          this.demoSub = 2;
        }
        return 0;
      case 2:
        if (this.skipGuide?.shown && this.skipInput()) {
          this.wipe.fadeOut(1);
          this.hook('onCharaGameDemoSkipStart');
          this.demoSub = 4;
          return 0;
        }
        if (this.hook('onCharaGameDemo')) this.demoSub = 3;
        return 0;
      case 4:
        if (this.wipe.playing()) return 0;
        this.hook('onCharaGameDemoSkipEnd');
        this.demoSub = 3;
        return 0;
      default:
        if (this.wipe.playing()) return 0;
        if (!this.hook('onCharaGameDemoEnd')) return 0;
        this.skipGuide?.close();
        this.skipGuide = null;
        this.charaDemoSeen = true;
        return 1;
    }
  }

  /** 단계 3 첫 페이드 */
  private stage3(): number {
    const h = this.hook('onGameFirstFade');
    if (this.sub === 0) {
      if (!this.P) this.sound.bgmAt(2, 0);
      else if (this.retry === 0 && this.sound.rec?.freePlayInstBgm) this.emitFn({ k: 'bgm', label: this.sound.rec.freePlayInstBgm, region: null });
      this.wipe.fadeIn(1);
      this.sub = 1;
      return 3;
    }
    if (this.sub === 1) {
      if (this.wipe.playing()) return 3;
      this.sub = 99;
    }
    return h ? (this.P ? 6 : 4) : 3;
  }

  /** 단계 4 오프닝(§6.3) */
  private stage4(): number {
    const h = this.hook('onGameOpening');
    if (this.sub === 0) {
      if (this.openingSkipAllowed && !h) {
        this.skipGuide?.close();
        this.skipGuide = new MgSkipGuide(this.setup.ui.anims, this.setup.ui.texts);
        if (this.gameSkipEnable) this.skipGuide.show();
        this.sub = 1;
        return 4;
      }
      this.sub = 99;
    } else if (this.sub === 1) {
      if (!h) {
        const g = this.skipGuide!;
        if (!g.shown && this.gameSkipEnable) g.show();
        if (this.skipWaitEnd) this.sub = 99;
        else if (g.shown && this.skipInput()) {
          g.close();
          this.skipped = true;
          this.sound.openingSkip();
          this.emitFn({ k: 'vib', label: 'bv_vib_sys_skip' });
          this.wipe.fadeOut(1);
          this.sub = 2;
        }
        return 4;
      }
    } else if (this.sub === 2) {
      if (this.wipe.playing()) return 4;
      this.sub = 99;
    }
    if (!h) return 4;
    this.skipGuide?.close();
    this.skipGuide = null;
    return this.skipped ? 5 : 6;
  }

  /** 단계 6 시작 전 */
  private stage6(): number {
    if (this.sub === 0 && this.skipped) this.emitFn({ k: 'groupStop', groups: [0x23, 1, 0x25], sec: 0 });
    const h = this.hook('onGameStartBefore');
    if (!h) return 6;
    if (!this.skipped && !this.P) return 7;
    if (this.sub === 0) {
      this.wipe.fadeIn(1);
      this.sub = 1;
    }
    return this.wipe.playing() ? 6 : 7;
  }

  /** 단계 7 시작(텔롭) FUN_71002e16c0 */
  private stage7(): number {
    const h = this.hook('onGameStart');
    if (this.sub === 0) {
      if (!this.hook('onGameStartTelopBefore')) return 7;
      this.uiMgr.timingIn(0);
      if (this.telopStart(this.startTelop)) {
        this.sub = 1;
        return 7;
      }
      this.sub = 99;
    } else if (this.sub === 1) {
      if (!this.telopFinished(this.startTelop)) return 7;
      if (this.startTelop.type === 1) this.sound.bgmAt(0, 0);
      this.sound.whistle(0);
      if (!this.P) {
        this.pauseEnabled = true;
        this.emitFn({ k: 'pauseEnable', on: true });
      }
      this.sub = 99;
    }
    if (!h) return 7;
    if (this.endTimer) this.endTimerStart();
    this.uiMgr.timingIn(1);
    return 8;
  }

  /** 단계 11 종료 텔롭 FUN_71002e1910 */
  private stage11(): number {
    const h = this.hook('onGameFinish');
    let next = 11;
    if (this.sub === 2) {
      this.waitSec = F(this.waitSec - MG_DT);
      if (this.waitSec <= 0) {
        this.sub = 99;
        next = 12;
      }
    } else if (this.sub === 1) {
      if (this.telopFinished(this.finishTelop)) {
        this.waitSec = this.setting.endSeqWaitTime;
        this.uiMgr.timingOut(1);
        this.sub = 2;
        if (this.waitSec < 1) next = 12;
      }
    } else if (this.sub === 0) {
      this.uiMgr.timingOut(0);
      if (this.telopStart(this.finishTelop)) {
        this.sound.stopBgm(false);
        this.sub = 1;
      } else this.sub = 99;
      this.emitFn({ k: 'save' });
      this.pauseEnabled = false;
      this.emitFn({ k: 'pauseEnable', on: false });
    } else next = 12;
    return h ? next : 11;
  }

  private resultApi(): MgResultApi {
    const o = this.resultOpts;
    return {
      setPlayer: (pid) => {
        if (!this.resultPlayers.includes(pid)) this.resultPlayers.push(pid);
      },
      setModel: () => undefined,
      setMotion: (type, name) => {
        const k = (['idle', 'winA', 'winB', 'loseA', 'loseB'] as const)[type];
        if (k) o.motions = { ...o.motions, [k]: name };
      },
      setCameraType: (t) => (o.cameraType = t),
      setCameraPattern: (p) => (o.cameraPattern = p),
      setCameraNearZ: (z) => (o.nearZ = z),
      setCameraFarZ: (z) => (o.farZ = z),
      setPcPosOffset: (x, y, z) => (o.pcPosOffset = [x, y, z]),
      setThemeChara: (c) => (o.themeChara = c),
    };
  }

  /** 단계 13 결과 시작 FUN_71002e1b14 */
  private stage13(): number {
    if (!this.game.onEndingInit || this.game.onEndingInit(this.resultApi())) {
      if (this.resultPlayers.length === 0 || !this.setup.createResultStage) {
        if (this.resultPlayers.length > 0) console.warn('mgscene: 결과 무대 팩토리가 없어 엔딩 5단계(갈래 B)로 간다');
        this.branch = 'B';
        this.endingStep = this.endingChangeCut ? 0 : 2;
      } else {
        this.branch = 'A';
        this.startResultStage();
      }
      return 14;
    }
    return 13;
  }

  resultInput(): ResultStageInput {
    const ps = this.resultPlayers.map((pid) => this.players.find((p) => p.pid === pid)!).filter(Boolean);
    return {
      mgId: this.setup.mgId,
      gameRule: this.list.gameRule,
      isCoin: this.list.coin === 1,
      isChara: !!this.setup.isChara,
      judgeType: this.setup.judgeType ?? 0,
      boardMode: this.setup.boardMode ?? 0,
      playMode: this.setup.playMode ?? 1,
      players: ps.map((p) => ({ pid: p.pid, chara: p.chara, order: p.order, teamId: p.teamId, isCom: p.isCom, winLose: p.winLose, rank: p.rank, coin: p.coin })),
      opts: { ...this.resultOpts },
      rand: () => this.setup.rand.u32(),
    };
  }

  private resultHost(input: ResultStageInput): ResultStageHost {
    const h = this.setup.resultHost;
    return {
      gl: h?.gl,
      url: h?.url ?? ((p) => p),
      world: h?.world,
      fade: (dir, speed) => (dir === 'out' ? this.wipe.fadeOut(speed) : this.wipe.fadeIn(speed)),
      fading: () => this.wipe.playing(),
      winTelop: {
        start: (no) => {
          if (no < 5 || no > 8) return;
          const winners = input.players.filter((p) => (input.isCoin ? p.coin > 0 : p.winLose === 1));
          this.resultTelop = new MgTelop(no, this.telopDeps(), no === 8 ? [] : winners, 0x8800);
          this.resultTelop.start();
        },
        out: () => this.resultTelop?.out(),
        finished: () => !this.resultTelop || this.resultTelop.finished(),
      },
      coinShow: () => undefined,
      se: (label) => this.emitFn({ k: 'se', label }),
      bgm: (label) => (label ? this.emitFn({ k: 'bgm', label, region: null }) : this.emitFn({ k: 'bgmStop', fadeSec: 0 })),
      resultSound: (no) => void this.sound.resultSound(0, no, this.list.gameRule, this.players),
      uiTimingOut: (n) => this.uiMgr.timingOut(n),
    };
  }

  private startResultStage(): void {
    this.split.finish();
    const input = this.resultInput();
    this.emitFn({ k: 'resultStage', input });
    this.resultWaiting = true;
    this.setup.createResultStage!(input, this.resultHost(input)).then(
      (s) => {
        this.resultStage = s;
        this.resultWaiting = false;
      },
      (e: unknown) => {
        console.warn('mgscene: 결과 무대를 만들지 못해 엔딩 5단계로 간다', e);
        this.resultWaiting = false;
        this.branch = 'B';
        this.endingStep = this.endingChangeCut ? 0 : 2;
      },
    );
  }

  /** 단계 14 결과 대기 — 결과 파이버(갈래 A 무대 / 갈래 B 엔딩 5단계 FUN_71002e34d0) */
  private stage14(): number {
    if (this.branch === 'A') {
      if (this.resultWaiting || !this.resultStage) return 14;
      this.resultStage.step();
      if (!this.resultStage.done) return 14;
      for (const w of this.resultStage.writes ?? []) {
        const p = this.players.find((x) => x.pid === w.pid);
        if (p) p.winLose = w.winLose as WinLose;
      }
      return 16;
    }
    return this.endingTick() ? 16 : 14;
  }

  /** 엔딩 5단계 한 프레임 — 끝(5)이면 true */
  private endingTick(): boolean {
    const step = this.endingStep;
    let next = step;
    if (step === 0) {
      const h = this.hook('onGameEndingFade');
      if (this.sub === 0) {
        this.wipe.fadeOut(1);
        this.sub = 1;
      } else if (this.sub === 1 && !this.wipe.playing()) this.sub = 99;
      if (this.sub === 99 && h) {
        this.uiMgr.timingOut(2);
        next = 1;
      }
    } else if (step === 1) {
      if (this.hook('onGameEndingChangeCut')) next = 2;
    } else if (step === 2) {
      const h = this.hook('onGameEndingBefore');
      if (!this.endingChangeCut) next = h ? 3 : 2;
      else if (h) {
        if (this.sub === 0) {
          this.sound.resultSound(0, -1, this.list.gameRule, this.players);
          this.wipe.fadeIn(1);
          this.sub = 1;
        }
        next = this.wipe.playing() ? 2 : 3;
      }
    } else if (step === 3) {
      if (this.sub === 0) {
        this.uiMgr.timingIn(2);
        this.sub = 1;
      }
      if (this.hook('onGameEnding')) next = 4;
    } else if (step === 4) {
      if (this.hook('onGameEndingAfter')) next = 5;
    }
    if (next !== step) {
      this.endingStep = next;
      this.sub = 0;
    }
    return this.endingStep === 5;
  }

  /** 단계 16 마지막 페이드 FUN_71002e1c68 */
  private stage16(): number {
    const h = this.hook('onGameLastFade');
    if (this.sub === 0) {
      if (!this.P) {
        this.emitFn({ k: 'save' });
        this.sound.stopBgm(false);
      }
      this.wipe.fadeOut(1);
      this.emitFn({ k: 'groupStop', groups: [0x20], sec: FADE_TIME_PRESET[6] });
      this.sub = 1;
      return 16;
    }
    if (this.sub === 1) {
      if (this.wipe.playing()) return 16;
      this.sub = 99;
    }
    return h ? 17 : 16;
  }

  /** 단계 18 설명 화면 반복 FUN_71002e1e8c — 4 프레임 뒤 다시 1 */
  private stage18(): number {
    if (this.sub === 1) {
      this.waitSec = F(this.waitSec + 1);
      if (this.waitSec >= 4) {
        this.game.setup(this.ctx);
        this.winTelop = null;
        this.init();
        this.sub = 99;
        this.stageLog.push([this.frame, this.stage]);
        this.emitFn({ k: 'stage', from: 18, to: this.stage });
        return 18;
      }
      return 18;
    }
    this.retry++;
    this.game.cleanup?.();
    this.skipped = false;
    this.skipWaitEnd = false;
    this.waitSec = 0;
    this.sub = 1;
    return 18;
  }
}
