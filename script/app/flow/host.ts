/**
 * 게임 화면과 미니게임 한 판 호스트 — 화면(WebGL + HUD) 상자, 렌더러 하나(앱 수명), 오디오 시계, 한 판 시작·스텝·그리기. 게임이 무엇인지는 game.ts 계약으로만 안다.
 *
 * 스텝 시계: 스텝 n 은 시계 시각 base + n/60 을 나타내고, rAF 마다 지금까지 와야 할 스텝을 돈다(밀린 스텝은 rAF 당 MAX_STEPS 까지 따라잡고,
 * MAX_BACKLOG_STEPS 보다 밀리면 넘친 시간을 버린다). 시계는 소리가 돌면 "지금 들리는 AudioContext 시각", 아니면 performance.now 다.
 * 원본은 게임 프레임이 사운드 스레드가 쓴 값(박자 G14 등)을 읽는다 — 웹도 오디오 시계로 스텝을 맞추고, 스텝마다 그 시각의 사운드 관측을
 * view.observe 로 받아 run.tick 에 넘긴다(game.ts SoundSnapshot, 한 판 호스트 mgrun.ts). 탭이 숨으면 AudioContext 를 멈춰 두 시계가 함께 선다(원본 일시정지처럼).
 *
 * 공개 API: start(한 판 시작) · step(한 스텝) · prime/due/resync(시계) · draw · stop · 읽기 전용 상태(stage·frame·seed·result·error …) · listen(사건).
 * 설정: muted(소리 끄기) · fixedSeed(빈 문자열 = 무작위) · audioClock(오디오 시계를 따름) · latency(출력 지연 보정, 기본 자동). 루프는 runGameLoop.
 */
import { GamePreparation } from './preparation';
import type { FrameResultPort } from '@app/common/work';
import { commitMinigameResult } from '@app/minigame/frame/return';
import { FrameMotionPad } from '@app/common/input';
import { KeyboardMouseMotion } from '@game/lib/motion-dom';
import { FPS, MAX_BACKLOG_STEPS, MAX_STEPS } from '@game/core/clock';
import type { GameDef, GameLogic, GameSetup, GameView } from '../../game';
import type { LogicTransition } from '@game/lib/transition';
import { createMgRun, localSeed, type MgRun, type MgRunSave } from '../../mgrun';
import { localGate, mgUiData, type MgPlaySettings, type MgTables, type MgUiData } from '@app/minigame/frame/scene';
import { Assets } from '../../view/assets';
import { installTransition, logicWipe, sceneIn } from '../../view/appTransition';
import { AudioOut, appAudio } from '../../view/audio';
import { Hud } from '../../view/hud';
import { KeyboardPad, padSourcesFor, type PadSource } from '../../view/input';
import { Renderer } from '../../view/renderer';
import { appRenderService, type RenderLease } from '@app/common/render/service';
import { plazaGl } from '../../view/plazaGl';
import type { MgSceneSound } from '../../view/mgsceneSound';
import type { MgSceneUi, MgSceneUiJson } from '../../view/mgsceneUi';

export type Stage = 'idle' | 'loading' | 'running' | 'done' | 'error';

export type SetupDraft = Omit<GameSetup, 'seed'>;

export interface StartOptions {
  play?: MgPlaySettings;
  endless?: boolean;
  save?: MgRunSave;
  leaveWipe?: boolean;
  frame?: FrameResultPort;
  signal?: AbortSignal;
}

export type HostEvent = { type: 'stage'; stage: Stage } | { type: 'view'; view: GameView } | { type: 'step'; t: number; observed: boolean };

export interface GameHost {
  readonly stageBox: HTMLElement;
  readonly glCanvas: HTMLCanvasElement;
  readonly hudCanvas: HTMLCanvasElement;
  readonly msg: HTMLElement;
  readonly keyboard: KeyboardPad;
  readonly stage: Stage;
  readonly frame: number;
  readonly seed: number | null;
  readonly result: GameLogic['result'];
  readonly error: string | null;
  readonly dropped: number;
  readonly def: GameDef | null;
  readonly setup: GameSetup | null;
  readonly run: MgRun | null;
  readonly logic: GameLogic | null;
  readonly view: GameView | null;
  readonly audio: AudioOut | null;
  muted: boolean;
  fixedSeed: string;
  audioClock: boolean;
  latency: { compensate: boolean; extraMs: number };
  listen(fn: (e: HostEvent) => void): () => void;
  setMsg(s: string): void;
  setMuted(muted: boolean): void;
  setError(error: string | null): void;
  prepare(d: GameDef, draft: SetupDraft): void;
  cancelPreparation(): void;
  start(d: GameDef, draft: SetupDraft, o?: StartOptions): Promise<void>;
  step(): boolean;
  prime(): boolean;
  due(): number;
  resync(): void;
  draw(): void;
  heardTime(): number | null;
  stepTime(): number;
  stop(): void;
  dispose(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function createGameHost(mount: (stageBox: HTMLElement) => void): GameHost {
  // ---------------------------------------------------------------- DOM
  const stageBox = el('div', 'jw-stage');
  const renderService = appRenderService();
  const glCanvas = renderService.canvas;
  const hudCanvas = el('canvas', 'jw-hud');
  const msg = el('div', 'jw-msg');
  stageBox.append(glCanvas, hudCanvas, msg);
  installTransition(stageBox);
  mount(stageBox);

  const renderer = new Renderer(glCanvas, renderService);
  const hudCtx = hudCanvas.getContext('2d')!;
  const hud = new Hud(hudCtx);
  const preparation = new GamePreparation(renderService.prepareQueue, (d, setup) => {
    const assets = new Assets(d.assetsDir); assets.setPriority(2);
    const context = { renderer, hud: hudCtx, audio: null, setup, pads: [] };
    try { return { view: d.createView(context, assets), context, assets }; }
    catch (error) { assets.dispose(); throw error; }
  });
  const keyboard = new KeyboardPad();
  window.addEventListener('resize', () => renderer.resize());

  const setMsg = (s: string): void => {
    msg.textContent = s;
    msg.hidden = s === '';
  };

  // ---------------------------------------------------------------- 상태
  const listeners = new Set<(e: HostEvent) => void>();
  const emit = (e: HostEvent): void => {
    for (const fn of listeners) fn(e);
  };
  let stage: Stage = 'idle';
  let frame = 0;
  let seed: number | null = null;
  let result: GameLogic['result'] = null;
  let error: string | null = null;
  let dropped = 0;
  let def: GameDef | null = null;
  let logic: GameLogic | null = null;
  let run: MgRun | null = null;
  let runWipe: LogicTransition | null = null;
  let leaveWipe = false;
  let mgSound: MgSceneSound | null = null;
  let curSetup: GameSetup | null = null;
  let mgHost: Promise<{ tables: MgTables; data: MgUiData; ui: MgSceneUi }> | null = null;
  let mgUi: MgSceneUi | null = null;
  let view: GameView | null = null;
  let gameAssets: Assets | null = null;
  let gameLease: RenderLease | null = null;
  let loadingView: Promise<void> | null = null;
  let pads: (PadSource | null)[] = [];
  let audio: AudioOut | null = null;
  let token = 0;
  let returnFrame: FrameResultPort | null = null;
  let motionPad: FrameMotionPad | null = null;
  let releaseAbort: (() => void) | null = null;
  /** 스텝 시계 종류(판마다 시작 때 정한다)와 스텝 0 의 시계 시각(초, NaN = 첫 그리기 뒤 정함). 스텝 n = base + n/FPS, n = frame */
  let clockKind: 'audio' | 'wall' = 'wall';
  let base = 0;

  const dispose = (): void => {
    token++;
    motionPad?.dispose(); motionPad = null;
    releaseAbort?.(); releaseAbort = null;
    returnFrame?.cancel(); returnFrame = null;
    const oldView = view, oldLoading = loadingView, oldLease = gameLease, oldAssets = gameAssets;
    view = null; loadingView = null; gameLease = null;
    oldAssets?.cancel(); gameAssets = null;
    const cleanup = (): void => {
      try { oldView?.dispose(); }
      finally { oldAssets?.dispose(); if (oldLease) renderer.release(oldLease); }
    };
    if (oldLoading) void oldLoading.catch(() => undefined).then(cleanup).catch(console.error);
    else cleanup();
    logic = null;
    run = null;
    mgSound?.dispose();
    mgSound = null;
    runWipe?.release();
    runWipe = null;
    def = null;
    hud.clear();
  };

  const loadMgHost = (): Promise<{ tables: MgTables; data: MgUiData; ui: MgSceneUi }> =>
    (mgHost ??= (async () => {
      const sa = new Assets('mgscene/');
      try {
        const [uiJson, tables, { MgSceneUi: Ui }] = await Promise.all([sa.json<MgSceneUiJson & Parameters<typeof mgUiData>[0]>('ui.json'), sa.json<MgTables>('tables.json'), import('../../view/mgsceneUi')]);
        return { tables, data: mgUiData(uiJson), ui: await Ui.load(sa) };
      } finally { sa.dispose(); }
    })().catch((e: unknown) => {
      mgHost = null;
      throw e;
    }));

  const finish = (s: Stage): void => {
    stage = s;
    emit({ type: 'stage', stage: s });
  };

  async function start(d: GameDef, draft: SetupDraft, o: StartOptions = {}): Promise<void> {
    if (o.signal?.aborted) return;
    const { play, endless = false, save } = o;
    dispose();
    const my = ++token;
    returnFrame = o.frame ?? null;
    if (o.signal) {
      const signal = o.signal;
      const abort = (): void => { if (my === token) { preparation.cancel(); stop(); } };
      signal.addEventListener('abort', abort, { once: true });
      releaseAbort = () => signal.removeEventListener('abort', abort);
    }
    const setup: GameSetup = { ...draft, seed: localSeed(host.fixedSeed) };
    curSetup = setup;
    leaveWipe = !!o.leaveWipe;
    stage = 'loading';
    seed = setup.seed;
    result = null;
    error = null;
    frame = 0;
    emit({ type: 'stage', stage });
    if (!host.muted) {
      try {
        audio ??= appAudio() ?? new AudioOut();
        await audio.resume();
      } catch (e) {
        console.warn('소리를 열지 못했다', e);
        audio = null;
      }
    }
    pads = padSourcesFor(
      setup.players.map((p) => p.isCom),
      keyboard,
    );
    if (my !== token) return;
    let assets: Assets | null = null;
    try {
      await d.load?.();
      if (my !== token) return;
      const prepared = d.preparationKey ? await preparation.take(d, setup, o.signal) : null;
      if (my !== token) { prepared?.view.dispose(); prepared?.assets.dispose(); return; }
      assets = prepared?.assets ?? new Assets(d.assetsDir); gameAssets = assets;
      view = prepared?.view ?? null;
      const host = await loadMgHost();
      if (my !== token) return;
      await plazaGl().yieldPreparation();
      if (my !== token) return;
      const lease = await renderer.activate(stageBox);
      if (my !== token) { renderer.release(lease); return; }
      gameLease = lease;
      lease?.onLost(() => {
        stop(); setMsg('그래픽 연결이 끊겼습니다. 복구 후 게임을 다시 시작해 주세요.');
      });
      if (prepared) Object.assign(prepared.context, { renderer, hud: hudCtx, audio, setup, pads });
      else view = d.createView({ renderer, hud: hudCtx, audio, setup, pads }, assets);
      emit({ type: 'view', view: view! });
      setMsg('에셋 읽는 중…');
      const pending = prepared ? view!.activate!() : view!.load((n, total, what) => {
        if (my === token && stage === 'loading') setMsg(`에셋 읽는 중 ${n}/${total}\n${what}`);
      });
      loadingView = pending;
      await pending;
      if (loadingView === pending) loadingView = null;
      if (my !== token) return;
      const { MgSceneSound: Snd } = await import('../../view/mgsceneSound');
      const soundAssets = new Assets('mgscene/');
      const snd = await Snd.load(audio, [{ assets: soundAssets, path: 'sound/sound.json' }]).finally(() => soundAssets.dispose());
      if (my !== token) {
        snd.dispose();
        return;
      }
      mgSound = snd;
      mgUi = host.ui;
      const padsNow = pads;
      const firstHuman = setup.players.findIndex(p => !p.isCom);
      if (d.motionProfile && firstHuman >= 0) motionPad = new FrameMotionPad(() => padsNow[firstHuman]?.read() ?? null,
        new KeyboardMouseMotion(window, d.motionProfile, event => event.target instanceof Node && stageBox.contains(event.target) && event.target instanceof HTMLCanvasElement));
      const motionNow = motionPad;
      runWipe = logicWipe();
      run = createMgRun({ def: d, setup, tables: host.tables, ui: host.data, gate: localGate(frame => padsNow.map((p, i) => motionNow && i === firstHuman ? motionNow.read(frame) : p?.read() ?? null)), play, endless, wipe: runWipe, save });
      logic = run.logic;
    } catch (e) {
      console.error(e);
      if (my === token) {
        setMsg(`시작 실패: ${(e as Error).message}`);
        error = String((e as Error).stack ?? e);
        returnFrame?.fail();
        dispose();
        sceneIn();
        finish('error');
      }
      return;
    }
    if (my !== token) return;
    def = d;
    setMsg('');
    stage = 'running';
    emit({ type: 'stage', stage });
    sceneIn();
    dropped = 0;
    clockKind = audio && audio.ctx.state === 'running' && host.audioClock ? 'audio' : 'wall';
    /* 첫 rAF 의 그리기가 끝난 뒤 정한다 — 첫 그리기(셰이더·텍스처 올리기)의 긴 멈춤을 따라잡지 않게 */
    base = NaN;
  }

  const stop = (): void => {
    token++;
    audio?.stopAll();
    dispose();
    sceneIn();
    finish('idle');
  };
  document.addEventListener('visibilitychange', () => {
    /* 숨으면 소리 시계를 멈춘다 — 로직(rAF)과 시퀀서(타이머)가 서는 동안 오디오만 가지 않게. 벽시계면 숨은 동안을 건너뛴다 */
    if (audio) void (document.hidden ? audio.ctx.suspend() : audio.ctx.resume());
    if (clockKind === 'wall') base = clockNow() - frame / FPS;
  });

  // ---------------------------------------------------------------- 루프
  function stepOnce(): boolean {
    if (!run || !logic || !view || !def) return false;
    /* 이 스텝이 나타내는 시각(스텝 n+1 은 시계가 base + (n+1)/FPS 를 지나면 돈다) */
    const t = base + (frame + 1) / FPS;
    const sound = clockKind === 'audio' ? (view.observe?.(t) ?? null) : null;
    if (!run.tick(sound)) return false;
    view.onStep(logic.state, logic.events);
    mgSound?.onEvents(run.scene.events);
    frame++;
    emit({ type: 'step', t, observed: sound !== null });
    if (run.ended) {
      result = logic.result;
      if (returnFrame) commitMinigameResult(run, returnFrame.id, returnFrame);
      finish('done');
      if (!leaveWipe) {
        runWipe?.release();
        runWipe = null;
        sceneIn();
      }
    }
    return true;
  }

  /**
   * 지금 스피커로 나가는 소리의 AudioContext 시각(초) — getOutputTimestamp(출력 장치가 내고 있는 시각)를 지금으로 늘인다.
   * 원본은 출력 지연을 보정하지 않는다(게임이 시퀀서가 막 쓴 값을 읽는다, docs/engine/04_sound.md 8절·9.5).
   * 웹은 판정·화면을 들리는 소리에 맞추려고 보정한다 [근사: 원본에 없는 보정]. latency.compensate = false 면 currentTime(보정 없음), latency.extraMs 면 그만큼 더 늦춘다.
   */
  function heardTime(): number | null {
    if (!audio) return null;
    const ctx = audio.ctx;
    if (!host.latency.compensate) return ctx.currentTime;
    const extra = host.latency.extraMs / 1000;
    const ts = ctx.state === 'running' ? ctx.getOutputTimestamp?.() : undefined;
    if (!ts?.contextTime || !ts.performanceTime) return ctx.currentTime - (ctx.outputLatency ?? 0) - ctx.baseLatency - extra;
    return ts.contextTime + (performance.now() - ts.performanceTime) / 1000 - extra;
  }

  /** 스텝 시계(초) */
  function clockNow(): number {
    return clockKind === 'audio' ? (heardTime() ?? performance.now() / 1000) : performance.now() / 1000;
  }

  function drawFrame(): void {
    if (!view || !logic || !renderer.active) return;
    view.render(logic.state);
    if (run) mgUi?.draw(hudCtx, run.scene.layers(), renderer.gl);
  }

  const host: GameHost = {
    stageBox,
    glCanvas,
    hudCanvas,
    msg,
    keyboard,
    get stage() {
      return stage;
    },
    get frame() {
      return frame;
    },
    get seed() {
      return seed;
    },
    get result() {
      return result;
    },
    get error() {
      return error;
    },
    get dropped() {
      return dropped;
    },
    get def() {
      return def;
    },
    get setup() {
      return curSetup;
    },
    get run() {
      return run;
    },
    get logic() {
      return logic;
    },
    get view() {
      return view;
    },
    get audio() {
      return audio;
    },
    muted: false,
    fixedSeed: '',
    audioClock: true,
    latency: { compensate: true, extraMs: 0 },
    listen(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    setMsg,
    setMuted(muted) {
      host.muted = muted;
      audio?.setMuted(muted);
    },
    setError(e) {
      error = e;
    },
    prepare(d, draft) {
      if (!d.preparationKey) return;
      void preparation.select(d, { ...draft, seed: 0 }).catch(() => undefined);
    },
    cancelPreparation: () => preparation.cancel(),
    start,
    step: stepOnce,
    prime() {
      if (!Number.isNaN(base)) return true;
      drawFrame();
      base = clockNow() - frame / FPS;
      return false;
    },
    due() {
      let due = Math.floor((clockNow() - base) * FPS + 1e-6) - frame;
      if (due > MAX_BACKLOG_STEPS) {
        /* 너무 밀렸다(긴 멈춤): 넘친 시간을 버린다. 소리 시계면 로직이 그만큼 건너뛰어 소리를 다시 따라간다 */
        dropped += due - MAX_STEPS;
        base += (due - MAX_STEPS) / FPS;
        due = MAX_STEPS;
      }
      return Math.max(0, Math.min(MAX_STEPS, due));
    },
    resync() {
      base = clockNow() - frame / FPS;
    },
    draw: drawFrame,
    heardTime,
    stepTime: () => base + frame / FPS,
    stop: () => { preparation.cancel(); stop(); },
    dispose: () => { preparation.cancel(); dispose(); },
  };
  return host;
}

export function runGameLoop(host: GameHost): void {
  const loop = (): void => {
    requestAnimationFrame(loop);
    if (host.stage !== 'running' || !host.logic || !host.view) return;
    if (!host.prime()) return;
    const budget = host.due();
    for (let i = 0; i < budget && host.stage === 'running'; i++) host.step();
    host.draw();
  };
  requestAnimationFrame(loop);
}
