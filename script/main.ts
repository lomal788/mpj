/**
 * 페이지 조립 — 화면(WebGL + HUD), 설정 패널, 60Hz 고정 스텝 루프. 게임이 무엇인지는 game.ts 계약으로만 안다.
 *
 * 스텝 시계: 스텝 n 은 시계 시각 base + n/60 을 나타내고, rAF 마다 지금까지 와야 할 스텝을 돈다(밀린 스텝은 rAF 당 MAX_STEPS 까지 따라잡고,
 * MAX_BACKLOG_STEPS 보다 밀리면 넘친 시간을 버린다). 시계는 소리가 돌면 "지금 들리는 AudioContext 시각", 아니면 performance.now 다.
 * 원본은 게임 프레임이 사운드 스레드가 쓴 값(박자 G14 등)을 읽는다 — 웹도 오디오 시계로 스텝을 맞추고, 스텝마다 그 시각의 사운드 관측을
 * view.observe 로 받아 logic.step 에 넘긴다(game.ts SoundSnapshot). 탭이 숨으면 AudioContext 를 멈춰 두 시계가 함께 선다(원본 일시정지처럼).
 *
 * URL 옵션: ?game=<id> 시작할 게임, ?seed=<n> 시드, ?com=1111 플레이어별 CPU 여부, ?debug=1 디버그 줄,
 *           ?fast=N rAF 마다 N 스텝(시험용, 사운드 관측 없음), ?mute=1, ?auto=1 페이지를 열자마자 시작,
 *           ?<key>=<value> 게임별 설정(GameDef.options, 예: mg1801 ?mode=2&cpuMiss=1),
 *           ?avlat=raw|<ms> 출력 지연 보정(raw = 보정 없이 currentTime, 원본처럼 / ms = 측정값에 더 늦출 양),
 *           ?synclog=1 스텝·소리 시각 기록(window.__mpj.sync, tools/sync_measure.ts),
 *           ?charselect=1 시작 전에 캐릭터 선택 화면(독립 모듈 shell/charselect, script/charselect_page.ts)을 띄우고 고른 캐릭터로 시작
 *           ?plaza=1 플레이어 설정 → 광장 3D(shell/plaza) → 기구 → 모드 메뉴 → 항구 → 프리 플레이 목록 → 게임(docs/shell/plaza_3d.md §6.9), &skipsetup=1 설정 건너뜀(&chars=pc05,pc02 슬롯별 캐릭터, &names=A,B 이름)
 * 시험 훅: window.__mpj (stage, frame, result, error, hold(frame), dropped, sync)
 */
import './style.css';
import './view/assetMode';
import { FPS, MAX_BACKLOG_STEPS, MAX_STEPS } from './core/clock';
import { DEV } from './env';
import { type GameDef, type GameLogic, type GameSetup, type GameView, type PlayerSetup, readOptions } from './game';
import { GAMES } from './games';
import { Assets } from './view/assets';
import { appFlow } from './view/appFlow';
import { installTransition, sceneIn, sceneOut } from './view/appTransition';
import { FLOW_END_FADE } from './view/screenBgm';
import { AudioOut } from './view/audio';
import { Hud } from './view/hud';
import { KeyboardPad, padSourcesFor, type PadSource } from './view/input';
import { Renderer } from './view/renderer';
import type { CharSelectRun } from './charselect_page';
import type { Mgm01ListRun } from './mgm01_page';
import type { MgmetRun } from './mgmet_page';
import type { ModeSelectRun } from './modeselect_page';
import type { PlazaPageRun } from './plaza_page';
import type { SetPlayerRun } from './setplayer_page';
import type { MgResultEntry } from './shell/mgmcommon';
import type { Mgm01PlayRequest } from './shell/mgm01';

const runCharSelect: typeof import('./charselect_page').runCharSelect = async (...a) => (await import('./charselect_page')).runCharSelect(...a);
const runMgm01List: typeof import('./mgm01_page').runMgm01List = async (...a) => (await import('./mgm01_page')).runMgm01List(...a);
const runModeSelect: typeof import('./modeselect_page').runModeSelect = async (...a) => (await import('./modeselect_page')).runModeSelect(...a);
const runPlaza: typeof import('./plaza_page').runPlaza = async (...a) => (await import('./plaza_page')).runPlaza(...a);
const runSetPlayer: typeof import('./setplayer_page').runSetPlayer = async (...a) => (await import('./setplayer_page')).runSetPlayer(...a);

type Stage = 'idle' | 'loading' | 'running' | 'done' | 'error';

interface Hook {
  stage: Stage;
  frame: number;
  seed: number | null;
  result: unknown;
  error: string | null;
  /** 이 프레임에 닿으면 멈춘다(스크린샷용) */
  held: number | null;
  hold(frame: number | null): void;
  /** 밀려서 버린 스텝 수(이 판) */
  dropped: number;
  /**
   * ?synclog=1 — steps: 스텝마다 [프레임, performance.now, currentTime, 들리는 오디오 시각, g14, row, stage, BGM 사건, 스텝 시각, 관측 여부],
   * frames: rAF 마다 [들리는 오디오 시각, 마지막 스텝 시각], audio: 소리 쪽(view/sound.ts)
   */
  sync: { steps: unknown[]; frames: unknown[]; audio: unknown[] } | null;
  /** ?charselect=1 결과(pcNN 목록, 취소 null) */
  charselect?: string[] | null;
  /** ?plaza=1 흐름 단계(setplayer·plaza·modeselect·mgmet·mgm01·game·end)와 광장 실행기 debug */
  flow?: string;
  plaza?: () => Record<string, unknown> | null;
  /** 광장 P0 진행(n/total 항목) — 화면 문구 대신(loader_manager.md §13.5) */
  plazaLoad?: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const q = new URLSearchParams(location.search);
const fast = Math.max(0, Number(q.get('fast') ?? 0) | 0);
const avlat = q.get('avlat');
const debugOn = q.get('debug') === '1';
const PREFS_KEY = 'jamboree-web/prefs';

interface Prefs {
  game: string;
  com: boolean[];
  muted: boolean;
  /** 게임 id → 게임별 설정 */
  options: Record<string, Record<string, string>>;
}

function loadPrefs(): Prefs {
  const def: Prefs = { game: GAMES[0]?.id ?? '', com: [false, true, true, true], muted: false, options: {} };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return def;
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* 저장소 없음 */
  }
}

const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;
const parseSeed = (s: string | null): number | null => (s && /^\s*(0x[0-9a-f]+|\d+)\s*$/i.test(s) ? Number(s) >>> 0 : null);

// ---------------------------------------------------------------- DOM
const app = document.getElementById('app')!;
app.className = 'jw';
const stageBox = el('div', 'jw-stage');
const glCanvas = el('canvas', 'jw-gl');
const hudCanvas = el('canvas', 'jw-hud');
const msg = el('div', 'jw-msg');
stageBox.append(glCanvas, hudCanvas, msg);
installTransition(stageBox);

const panel = el('aside', 'jw-panel');
const title = el('h1', '', '슈퍼 마리오 파티 잼버리 웹');
const gameSel = el('select');
const seedIn = el('input');
seedIn.placeholder = '시드(비우면 무작위)';
const optBox = el('div', 'jw-options');
const comBox = el('div', 'jw-com');
const muteIn = el('input');
muteIn.type = 'checkbox';
const startBtn = el('button', '', '시작');
const stopBtn = el('button', '', '그만');
const camBtn = el('button', '', '자유 카메라');
camBtn.title = '켜면 마우스로 시점을 움직인다: 왼쪽 드래그 회전, 오른쪽 드래그 이동, 휠 확대·축소. 다시 누르면 원본 카메라';
let freeCam = false;
const status = el('div', 'jw-status');
const debugLine = el('pre', 'jw-debug');
const result = el('div', 'jw-result');
const label = (text: string, input: HTMLElement): HTMLLabelElement => {
  const l = el('label', '', text);
  l.append(input);
  return l;
};
panel.append(title, label('게임', gameSel), optBox, label('시드', seedIn), comBox, label('소리 끄기', muteIn), el('div', 'jw-buttons'), status, result);
panel.querySelector('.jw-buttons')!.append(startBtn, stopBtn, camBtn);
if (debugOn) panel.append(debugLine);
app.append(stageBox, panel);

const prefs = loadPrefs();
if (GAMES.length === 0) {
  gameSel.append(el('option', '', '(등록된 게임 없음)'));
  gameSel.disabled = true;
  startBtn.disabled = true;
} else {
  for (const g of GAMES) {
    const o = el('option', '', `${g.id} ${g.title}`);
    o.value = g.id;
    gameSel.append(o);
  }
  gameSel.value = q.get('game') ?? prefs.game;
}
const comQ = q.get('com');
const comIns = [0, 1, 2, 3].map((i) => {
  const c = el('input');
  c.type = 'checkbox';
  c.checked = comQ ? comQ[i] === '1' : (prefs.com[i] ?? i > 0);
  comBox.append(label(`${i + 1}P CPU`, c));
  return c;
});
muteIn.checked = q.get('mute') === '1' || prefs.muted;
prefs.options ??= {};

/** 게임별 설정 칸 — 고른 게임의 GameDef.options. 처음 값은 URL ?<key>= → 저장값 → 기본값 */
const optSels = new Map<string, HTMLSelectElement>();
const optLabels = new Map<string, HTMLLabelElement>();
let urlOptsUsed = false;
const currentDef = (): GameDef | undefined => GAMES.find((g) => g.id === gameSel.value);
const readGameOptions = (): Record<string, string> => {
  const d = currentDef();
  const given: Record<string, string> = {};
  for (const [k, sel] of optSels) given[k] = sel.value;
  return readOptions(d?.options, given);
};
const refreshOptionVisibility = (): void => {
  const d = currentDef();
  const vals = readGameOptions();
  for (const o of d?.options ?? []) {
    const l = optLabels.get(o.key);
    if (l) l.style.display = o.when && !o.when.values.includes(vals[o.when.key]) ? 'none' : '';
  }
};
const buildOptions = (): void => {
  optBox.replaceChildren();
  optSels.clear();
  optLabels.clear();
  const d = currentDef();
  if (!d?.options?.length) return;
  const saved = prefs.options[d.id] ?? {};
  const given: Record<string, string> = { ...saved };
  if (!urlOptsUsed) for (const o of d.options) if (q.has(o.key)) given[o.key] = q.get(o.key)!;
  urlOptsUsed = true;
  const vals = readOptions(d.options, given);
  for (const o of d.options) {
    const sel = el('select');
    for (const c of o.choices) {
      const op = el('option', '', c.label);
      op.value = c.value;
      sel.append(op);
    }
    sel.value = given[o.key] !== undefined && o.choices.some((c) => c.value === given[o.key]) ? given[o.key] : vals[o.key];
    if (o.note) sel.title = o.note;
    sel.addEventListener('change', refreshOptionVisibility);
    const l = label(o.label, sel);
    optSels.set(o.key, sel);
    optLabels.set(o.key, l);
    optBox.append(l);
  }
  refreshOptionVisibility();
};
buildOptions();
gameSel.addEventListener('change', buildOptions);
seedIn.value = q.get('seed') ?? '';

const renderer = new Renderer(glCanvas);
const hudCtx = hudCanvas.getContext('2d')!;
const hud = new Hud(hudCtx);
const keyboard = new KeyboardPad();
window.addEventListener('resize', () => renderer.resize());

const setMsg = (s: string): void => {
  msg.textContent = s;
  msg.hidden = s === '';
};
setMsg(GAMES.length === 0 ? '등록된 게임이 없다. script/games/index.ts 에 GameDef 를 더한다.' : '');

// ---------------------------------------------------------------- 상태
const hook: Hook = {
  stage: 'idle',
  frame: 0,
  seed: null,
  result: null,
  error: null,
  held: null,
  hold(frame) {
    this.held = frame;
  },
  dropped: 0,
  sync: q.get('synclog') === '1' ? { steps: [], frames: [], audio: [] } : null,
};
(window as unknown as { __mpj: Hook }).__mpj = hook;

let def: GameDef | null = null;
let logic: GameLogic | null = null;
let view: GameView | null = null;
let pads: (PadSource | null)[] = [];
let audio: AudioOut | null = null;
let token = 0;
/** ?charselect=1 에서 고른 캐릭터(pcNN, 플레이어 순) */
let chosenChars: string[] | null = null;
let charRun: CharSelectRun | null = null;
/** 스텝 시계 종류(판마다 시작 때 정한다)와 스텝 0 의 시계 시각(초, NaN = 첫 그리기 뒤 정함). 스텝 n = base + n/FPS, n = hook.frame */
let clockKind: 'audio' | 'wall' = 'wall';
let base = 0;

const dispose = (): void => {
  view?.dispose();
  view = null;
  logic = null;
  def = null;
  hud.clear();
};

const finish = (stage: Stage): void => {
  hook.stage = stage;
  startBtn.disabled = GAMES.length === 0;
};

const readSetup = (): GameSetup => {
  const players: PlayerSetup[] = comIns.map((c, i) => ({ char: chosenChars?.[i] ?? `pc0${i + 1}`, isCom: c.checked, comLevel: 0 }));
  return { players, seed: parseSeed(seedIn.value) ?? randomSeed(), practice: false, options: readGameOptions() };
};

async function start(d: GameDef, setup: GameSetup): Promise<void> {
  const my = ++token;
  dispose();
  result.replaceChildren();
  prefs.options[d.id] = { ...(setup.options ?? {}) };
  savePrefs({ game: d.id, com: setup.players.map((p) => p.isCom), muted: muteIn.checked, options: prefs.options });
  hook.stage = 'loading';
  hook.seed = setup.seed;
  hook.result = null;
  hook.error = null;
  hook.frame = 0;
  startBtn.disabled = true;
  if (!muteIn.checked) {
    try {
      audio ??= new AudioOut();
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
  const assets = new Assets(d.assetsDir);
  try {
    await d.load?.();
    logic = d.createLogic(setup);
    view = d.createView({ renderer, hud: hudCtx, audio, setup, pads }, assets);
    view.setFreeCamera?.(freeCam);
    setMsg('에셋 읽는 중…');
    await view.load((n, total, what) => {
      if (my === token && hook.stage === 'loading') setMsg(`에셋 읽는 중 ${n}/${total}\n${what}`);
    });
  } catch (e) {
    console.error(e);
    if (my === token) {
      setMsg(`시작 실패: ${(e as Error).message}`);
      hook.error = String((e as Error).stack ?? e);
      dispose();
      sceneIn();
      finish('error');
    }
    return;
  }
  if (my !== token) return;
  def = d;
  setMsg('');
  status.textContent = `${d.id} 시드 ${setup.seed} (0x${setup.seed.toString(16).padStart(8, '0')})`;
  hook.stage = 'running';
  sceneIn();
  hook.dropped = 0;
  clockKind = audio && audio.ctx.state === 'running' && fast === 0 ? 'audio' : 'wall';
  /* 첫 rAF 의 그리기가 끝난 뒤 정한다 — 첫 그리기(셰이더·텍스처 올리기)의 긴 멈춤을 따라잡지 않게 */
  base = NaN;
}

// ---------------------------------------------------------------- ?plaza=1 흐름(docs/shell/plaza_3d.md §6.9)
interface FlowRun {
  stop(): void;
}
let flowRun: FlowRun | null = null;
let plazaPage: PlazaPageRun | null = null;
const flowPlayers = { com: [] as boolean[], chars: [] as string[], names: undefined as string[] | undefined, pads: [] as ReturnType<typeof padSourcesFor> };

const flowStep = (name: string, r: FlowRun | null): void => {
  flowRun?.stop();
  flowRun = r;
  if (r) sceneIn();
  hook.flow = name;
  (window as unknown as { __flow?: FlowRun | null }).__flow = r;
};

const endFlow = (text: string): void => {
  flowStep('end', null);
  sceneIn();
  void import('./view/bgm').then((m) => m.appBgm().stop(FLOW_END_FADE));
  plazaPage = null;
  glCanvas.style.visibility = hudCanvas.style.visibility = '';
  startBtn.disabled = false;
  setMsg(text);
};

async function playFromList(req: Mgm01PlayRequest): Promise<MgResultEntry | null> {
  const d = GAMES.find((g) => g.id === req.name);
  if (!d) return null;
  await sceneOut();
  const others = [...stageBox.children].filter((c) => c !== glCanvas && c !== hudCanvas && c !== msg && !c.classList.contains('tr-wipe')) as HTMLElement[];
  for (const c of others) c.style.visibility = 'hidden';
  glCanvas.style.visibility = hudCanvas.style.visibility = '';
  hook.flow = 'game';
  appFlow().enter('game');
  chosenChars = flowPlayers.chars;
  const setup: GameSetup = { ...readSetup(), players: flowPlayers.com.map((c, i) => ({ char: flowPlayers.chars[i] ?? `pc0${i + 1}`, isCom: c, comLevel: req.cpu ?? 0 })) };
  await start(d, setup);
  await new Promise<void>((res) => {
    const t = setInterval(() => {
      if (hook.stage === 'done' || hook.stage === 'error' || hook.stage === 'idle') {
        clearInterval(t);
        res();
      }
    }, 100);
  });
  const r = hook.result;
  const rows = r && def ? def.describeResult(r as never, setup).rows : [];
  await sceneOut();
  dispose();
  glCanvas.style.visibility = hudCanvas.style.visibility = 'hidden';
  for (const c of others) c.style.visibility = '';
  sceneIn();
  hook.flow = 'mgm01';
  const results = [0, 1, 2, 3].map((p) => (!req.team.gamePlayByPid[p] ? 255 : rows.find((x) => x.player === p)?.rank === 0 ? 1 : 0)) as [number, number, number, number];
  return { id: req.id, judge: 1, results };
}

function flowMgm01(): void {
  flowStep('mgm01-loading', null);
  appFlow().enter('mgm01');
  void runMgm01List(stageBox, {
    com: flowPlayers.com,
    pads: flowPlayers.pads,
    muted: muteIn.checked,
    play: playFromList,
    onDone: () => void sceneOut().then(flowMgmet),
  }).then((r: Mgm01ListRun) => flowStep('mgm01', r));
}

function flowMgmet(): void {
  flowStep('mgmet-loading', null);
  appFlow().enter('mgmet');
  void import('./mgmet_page').then(({ runMgmet, mgmetTestValues }) => runMgmet('hub', stageBox, {
    com: flowPlayers.com,
    pads: flowPlayers.pads,
    muted: muteIn.checked,
    test: mgmetTestValues(),
    onDone: (text) => queueMicrotask(() => (text.startsWith('프리 플레이 시작') ? flowMgm01() : flowModeSelect())),
  })).then((r: MgmetRun) => flowStep('mgmet', r));
}

function flowModeSelect(): void {
  flowStep('modeselect-loading', null);
  appFlow().enter('modeselect');
  void runModeSelect(stageBox, {
    pad: flowPlayers.pads[0] ?? null,
    muted: muteIn.checked,
    onDone: (r) => queueMicrotask(() => (r?.key === 'mgm' ? flowMgmet() : flowPlaza())),
  }).then((r: ModeSelectRun) => flowStep('modeselect', r));
}

function flowPlaza(): void {
  flowStep('plaza-loading', null);
  appFlow().enter('plaza', { chars: flowPlayers.chars.filter((_, i) => !flowPlayers.com[i]) });
  void runPlaza(stageBox, {
    com: flowPlayers.com,
    chars: flowPlayers.chars,
    names: flowPlayers.names,
    pads: flowPlayers.pads,
    muted: muteIn.checked,
    params: q,
    onProgress: (n, total, what) => void (hook.flow === 'plaza-loading' && (hook.plazaLoad = `${n}/${total} ${what}`)),
    onExit: (e) =>
      void sceneOut().then(() => {
        plazaPage = null;
        if (e.k === 'balloon' || e.k === 'session') flowModeSelect();
        else endFlow('광장 나감');
      }),
  })
    .then((r) => {
      setMsg('');
      plazaPage = r;
      flowStep('plaza', r);
      (window as unknown as { __plaza?: PlazaPageRun }).__plaza = r;
    })
    .catch((e: unknown) => {
      console.error(e);
      hook.error = String((e as Error).stack ?? e);
      endFlow(`광장 실패: ${(e as Error).message}`);
    });
}

function plazaFlow(): void {
  flowStep('setplayer', null);
  appFlow().enter('setplayer');
  startBtn.disabled = true;
  glCanvas.style.visibility = hudCanvas.style.visibility = 'hidden';
  const com = comIns.map((c) => c.checked);
  flowPlayers.com = com;
  flowPlayers.chars = com.map((_, i) => `pc0${i + 1}`);
  flowPlayers.names = undefined;
  flowPlayers.pads = padSourcesFor(com, keyboard);
  if (q.get('skipsetup') === '1') {
    const cq = q.get('chars');
    if (cq) cq.split(',').forEach((c, i) => c && i < flowPlayers.chars.length && (flowPlayers.chars[i] = c));
    const nq = q.get('names');
    if (nq) flowPlayers.names = com.map((_, i) => nq.split(',')[i] || `${i + 1}P`);
    flowPlaza();
    return;
  }
  let got = false;
  void runSetPlayer(stageBox, {
    com,
    keyboard,
    muted: muteIn.checked,
    onResult: (r, chars, pads) => {
      if (r.cancelled || !chars) return;
      got = true;
      flowPlayers.com = r.slots.map((sl) => sl.type !== 'human');
      flowPlayers.chars = chars;
      flowPlayers.names = r.slots.map((sl) => sl.displayName);
      flowPlayers.pads = pads;
    },
    onDone: () => void sceneOut().then(() => (got ? flowPlaza() : endFlow('플레이어 설정 취소'))),
  }).then((r: SetPlayerRun) => flowStep('setplayer', r));
}
hook.plaza = () => plazaPage?.debug() ?? null;

startBtn.addEventListener('click', () => {
  if (q.get('plaza') === '1') {
    plazaFlow();
    return;
  }
  const d = GAMES.find((g) => g.id === gameSel.value) ?? GAMES[0];
  if (!d) return;
  if (q.get('charselect') !== '1') {
    void start(d, readSetup());
    return;
  }
  // 캐릭터 선택 → 고른 캐릭터(PlayerSetup.char)로 시작. 게임 로직은 바꾸지 않는다
  charRun?.stop();
  chosenChars = null;
  startBtn.disabled = true;
  glCanvas.style.visibility = hudCanvas.style.visibility = 'hidden';
  const com = comIns.map((c) => c.checked);
  void runCharSelect(stageBox, {
    com,
    pads: padSourcesFor(com, keyboard),
    muted: muteIn.checked,
    onDone(chars) {
      charRun = null;
      glCanvas.style.visibility = hudCanvas.style.visibility = '';
      startBtn.disabled = false;
      hook.charselect = chars;
      if (!chars) {
        setMsg('캐릭터 선택 취소');
        return;
      }
      chosenChars = chars;
      void start(d, readSetup());
    },
  }).then((r) => {
    charRun = r;
    sceneIn();
    (window as unknown as { __charselect?: CharSelectRun }).__charselect = r;
  });
});
stopBtn.addEventListener('click', () => {
  token++;
  audio?.stopAll();
  dispose();
  setMsg('그만뒀다');
  finish('idle');
});
muteIn.addEventListener('change', () => audio?.setMuted(muteIn.checked));
camBtn.addEventListener('click', () => {
  freeCam = !freeCam;
  camBtn.textContent = freeCam ? '원본 카메라' : '자유 카메라';
  view?.setFreeCamera?.(freeCam);
});
document.addEventListener('visibilitychange', () => {
  /* 숨으면 소리 시계를 멈춘다 — 로직(rAF)과 시퀀서(타이머)가 서는 동안 오디오만 가지 않게. 벽시계면 숨은 동안을 건너뛴다 */
  if (audio) void (document.hidden ? audio.ctx.suspend() : audio.ctx.resume());
  if (clockKind === 'wall') base = clockNow() - hook.frame / FPS;
});

// ---------------------------------------------------------------- 루프
function stepOnce(): void {
  if (!logic || !view || !def) return;
  /* 이 스텝이 나타내는 시각(스텝 n+1 은 시계가 base + (n+1)/FPS 를 지나면 돈다) */
  const t = base + (hook.frame + 1) / FPS;
  const sound = clockKind === 'audio' ? (view.observe?.(t) ?? null) : null;
  logic.step(
    pads.map((p) => p?.read() ?? null),
    sound,
  );
  view.onStep(logic.state, logic.events);
  hook.frame++;
  if (hook.sync) logSync(t, sound !== null);
  if (logic.done) {
    const r = logic.result;
    hook.result = r;
    if (r) {
      const { head, rows } = def.describeResult(r, readSetup());
      result.replaceChildren(el('h2', '', head), ...rows.map((row) => el('div', 'jw-row', `${row.player + 1}P ${row.rank + 1}위 ${row.value}`)));
    }
    finish('done');
  }
}

/**
 * 지금 스피커로 나가는 소리의 AudioContext 시각(초) — getOutputTimestamp(출력 장치가 내고 있는 시각)를 지금으로 늘인다.
 * 원본은 출력 지연을 보정하지 않는다(게임이 시퀀서가 막 쓴 값을 읽는다, docs/engine/04_sound.md 8절·9.5).
 * 웹은 판정·화면을 들리는 소리에 맞추려고 보정한다 [근사: 원본에 없는 보정]. ?avlat=raw 면 currentTime(보정 없음), ?avlat=<ms> 면 그만큼 더 늦춘다.
 */
function heardTime(): number | null {
  if (!audio) return null;
  const ctx = audio.ctx;
  if (avlat === 'raw') return ctx.currentTime;
  const extra = (Number(avlat) || 0) / 1000;
  const ts = ctx.state === 'running' ? ctx.getOutputTimestamp?.() : undefined;
  if (!ts?.contextTime || !ts.performanceTime) return ctx.currentTime - (ctx.outputLatency ?? 0) - ctx.baseLatency - extra;
  return ts.contextTime + (performance.now() - ts.performanceTime) / 1000 - extra;
}

/** 스텝 시계(초) */
function clockNow(): number {
  return clockKind === 'audio' ? (heardTime() ?? performance.now() / 1000) : performance.now() / 1000;
}

function logSync(t: number, observed: boolean): void {
  const st = logic!.state as { g14?: number; row?: number; stage?: number };
  const ev = (logic!.events as { k: string; label?: string }[]).filter((e) => (e.k === 'bgm' || e.k === 'se') && e.label?.startsWith('SQ_BGM')).map((e) => `${e.k}:${e.label}`);
  hook.sync!.steps.push([hook.frame, performance.now(), audio?.ctx.currentTime ?? null, heardTime(), st.g14 ?? null, st.row ?? null, st.stage ?? null, ev.length ? ev : null, t, observed]);
}

const loop = (): void => {
  requestAnimationFrame(loop);
  if (hook.stage !== 'running' || !logic || !view) return;
  if (hook.held !== null && hook.frame >= hook.held) {
    /* 멈춘 동안은 시계를 따라 옮긴다(풀면 그 자리부터) */
    base = clockNow() - hook.frame / FPS;
    view.render(logic.state);
    return;
  }
  if (Number.isNaN(base)) {
    view.render(logic.state);
    base = clockNow() - hook.frame / FPS;
    return;
  }
  let budget: number;
  if (fast > 0) {
    budget = fast;
  } else {
    let due = Math.floor((clockNow() - base) * FPS + 1e-6) - hook.frame;
    if (due > MAX_BACKLOG_STEPS) {
      /* 너무 밀렸다(긴 멈춤): 넘친 시간을 버린다. 소리 시계면 로직이 그만큼 건너뛰어 소리를 다시 따라간다 */
      hook.dropped += due - MAX_STEPS;
      base += (due - MAX_STEPS) / FPS;
      due = MAX_STEPS;
    }
    budget = Math.max(0, Math.min(MAX_STEPS, due));
  }
  for (let i = 0; i < budget && hook.stage === 'running'; i++) {
    if (hook.held !== null && hook.frame >= hook.held) break;
    stepOnce();
  }
  if (hook.sync) hook.sync.frames.push([heardTime(), base + hook.frame / FPS]);
  if (view && logic) {
    view.render(logic.state);
    const s = view.status(logic.state);
    status.textContent = `${def?.id ?? ''} 프레임 ${hook.frame} ${s.phase}${s.timeLeft !== null ? ` 남은 ${s.timeLeft}` : ''}`;
    if (debugOn) debugLine.textContent = view.debug(logic.state, logic.events);
  }
};
requestAnimationFrame(loop);

if (q.get('plaza') === '1') appFlow().enter('boot');
if (q.get('plaza') === '1') void import('./view/plazaGl').then((m) => m.installPlazaGl());
if (q.get('auto') === '1' && GAMES.length > 0) startBtn.click();

if (DEV) new EventSource('/esbuild').addEventListener('change', () => location.reload());
