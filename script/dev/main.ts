/**
 * 개발 하네스(/dev, dev/index.html) — 설정 패널·URL 옵션. 화면(WebGL + HUD)·한 판 호스트·게임 흐름은 app/flow, 개발 루프·시험 훅·화면 시험 인자는 dev/flow.ts(app/flow 공개 API 조합).
 *
 * 스텝 시계: app/flow/host.ts 머리 주석.
 *
 * URL 옵션: ?game=<id> 시작할 게임, ?seed=<n> 시드, ?com=1111 플레이어별 CPU 여부, ?debug=1 디버그 줄,
 *           ?fast=N rAF 마다 N 스텝(시험용, 사운드 관측 없음), ?mute=1, ?auto=1 페이지를 열자마자 시작,
 *           ?<key>=<value> 게임별 설정(GameDef.options, 예: mg1801 ?mode=2&cpuMiss=1),
 *           ?avlat=raw|<ms> 출력 지연 보정(raw = 보정 없이 currentTime, 원본처럼 / ms = 측정값에 더 늦출 양),
 *           ?synclog=1 스텝·소리 시각 기록(window.__mpj.sync, tools/sync_measure.ts),
 *           ?charselect=1 시작 전에 캐릭터 선택 화면(독립 모듈 app/scene/menu/charselect, script/charselect_page.ts)을 띄우고 고른 캐릭터로 시작
 *           ?plaza=1 플레이어 설정 → 광장 3D(app/scene/world/plaza) → 기구 → 모드 메뉴 → 항구 → 프리 플레이 목록 → 게임(docs/shell/plaza_3d.md §6.9), &skipsetup=1 설정 건너뜀(&chars=pc05,pc02 슬롯별 캐릭터, &names=A,B 이름)
 * 시험 훅: window.__mpj (stage, frame, result, error, hold(frame), dropped, sync)
 */
import '../style.css';
import '../view/assetMode';
import { DEV } from '../env';
import { type GameDef, type PlayerSetup, readOptions } from '../game';
import { GAMES } from '@app/minigame';
import type { SetupDraft } from '@app/flow';
import { createDevGame } from './flow';
import { sceneIn } from '../view/appTransition';
import { padSourcesFor } from '../view/input';
import { appSave } from '../view/save';
import type { CharSelectRun } from '../charselect_page';

const runCharSelect: typeof import('../charselect_page').runCharSelect = async (...a) => (await import('../charselect_page')).runCharSelect(...a);

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
    return { ...def, ...(appSave().run.get() as Partial<Prefs>) };
  } catch {
    return def;
  }
}

function savePrefs(p: Prefs): void {
  try {
    appSave().run.set(JSON.parse(JSON.stringify(p)) as Record<string, unknown>);
    appSave().request();
  } catch {
    /* 저장소 없음 */
  }
}


const app = document.getElementById('app')!;
app.className = 'jw';

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

const game = createDevGame({
  mount: (stageBox) => app.append(stageBox, panel),
  params: q,
  fast,
  avlat,
  synclog: q.get('synclog') === '1',
  status: (text) => void (status.textContent = text),
  debug: debugOn ? (text) => void (debugLine.textContent = text) : undefined,
});
const { host, flow, hook } = game;
const { stageBox, glCanvas, hudCanvas, keyboard, setMsg } = host;
host.muted = muteIn.checked;
host.fixedSeed = seedIn.value;
seedIn.addEventListener('input', () => (host.fixedSeed = seedIn.value));
host.listen((e) => {
  if (e.type === 'view') e.view.setFreeCamera?.(freeCam);
  if (e.type !== 'stage') return;
  if (e.stage === 'loading') {
    result.replaceChildren();
    startBtn.disabled = true;
    return;
  }
  if (e.stage === 'running') {
    const seed = host.seed ?? 0;
    status.textContent = `${host.def?.id ?? ''} 시드 ${seed} (0x${seed.toString(16).padStart(8, '0')})`;
    return;
  }
  const r = host.result;
  const d = host.def;
  const setup = host.setup;
  if (e.stage === 'done' && r && d && setup) {
    const { head, rows } = d.describeResult(r, setup);
    result.replaceChildren(el('h2', '', head), ...rows.map((row) => el('div', 'jw-row', `${row.player + 1}P ${row.rank + 1}위 ${row.value}`)));
  }
  startBtn.disabled = GAMES.length === 0;
});
flow.listen((e) => {
  if (e.type === 'screen' && e.name === 'setplayer') startBtn.disabled = true;
  if (e.type !== 'end') return;
  startBtn.disabled = false;
  setMsg(e.text);
});

setMsg(GAMES.length === 0 ? '등록된 게임이 없다. script/app/minigame/index.ts 에 GameDef 를 더한다.' : '');

/** ?charselect=1 에서 고른 캐릭터(pcNN, 플레이어 순) */
let chosenChars: string[] | null = null;
let charRun: CharSelectRun | null = null;

const readSetup = (): SetupDraft => {
  const players: PlayerSetup[] = comIns.map((c, i) => ({ char: chosenChars?.[i] ?? `pc0${i + 1}`, isCom: c.checked, comLevel: 0 }));
  return { players, practice: false, options: readGameOptions() };
};

function start(d: GameDef, draft: SetupDraft): Promise<void> {
  prefs.options[d.id] = { ...(draft.options ?? {}) };
  savePrefs({ game: d.id, com: draft.players.map((p) => p.isCom), muted: muteIn.checked, options: prefs.options });
  return host.start(d, draft);
}

startBtn.addEventListener('click', () => {
  if (q.get('plaza') === '1') {
    game.startFlow(comIns.map((c) => c.checked));
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
  host.stop();
  setMsg('그만뒀다');
});
muteIn.addEventListener('change', () => host.setMuted(muteIn.checked));
camBtn.addEventListener('click', () => {
  freeCam = !freeCam;
  camBtn.textContent = freeCam ? '원본 카메라' : '자유 카메라';
  host.view?.setFreeCamera?.(freeCam);
});

if (q.get('plaza') === '1') game.prepareFlow();
if (q.get('auto') === '1' && GAMES.length > 0) startBtn.click();

if (DEV) new EventSource('/esbuild').addEventListener('change', () => location.reload());
