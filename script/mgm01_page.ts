/**
 * 페이지 ↔ 프리 플레이(shell/mgm01) 화면 연결 — 어댑터(입력·소리·에셋·저장)와 60Hz 고정 스텝 루프, ui.html 시험값 패널. mgmcommon_page.ts 와 같은 방식.
 * 화면: 개별 설정(runMgm01Setting)·필터(runMgm01Filter)·목록 전체 흐름(runMgm01List). 공용 환경 createMgm01Env 는 다른 mgm01 화면도 쓸 수 있다.
 * 시험값(URL 또는 화면 오른쪽 위 패널): mg=게임 이름, filter=enum, cpu·team·rhythm=값, endless=1, resume=1, connected=1, boss=1(보스 개방), fav=이름,이름, save=0(저장 무시)
 * 목록 흐름 시험값: new=all|이름,이름(NEW 켬), played=이름:횟수,…(플레이 횟수), rounds=N(승패 기록 미리 넣기), filter=enum(처음 필터)
 * bex 비트: A 0x1, B 0x2, X 0x4, Y 0x8 (online.md 4.9 정정), L 0x10, R 0x20, ZL 0x40, ZR 0x80, 십자 0x100~0x800, 스틱 0x10000~0x80000 (docs/shell/mgm_common.md 6.10, mgm01_freeplay.md 6.2)
 * 시험 배치(패널·저장 키·기본 기록 = gamerecord 초기값)는 docs/shell/mgm01_freeplay.md 9절 [설계].
 */
import { ASSETS } from './env';
import { NPAD, STICK_MAX, type PadInput } from './core/pad';
import { createWork, FiberRunner, MemorySave, MG_FLAG, MgmInput, MgmSound, MgmView, plainText, pushResult, SceneStack, type Flow, type MgmPlayer, type MgmSceneInstance, type MgResultEntry, type MgmWork } from './shell/mgmcommon';
import {
  FilterScreen,
  FILTER,
  Mgm01Catalog,
  Mgm01Scene,
  SettingScreen,
  type Mgm01Carry,
  type Mgm01PlayRequest,
  type FilterApplied,
  type LockEnv,
  type Mgm01CatalogJson,
  type Mgm01Player,
  type SettingOutcome,
} from './shell/mgm01';
import { appFlow } from './view/appFlow';
import type { PadSource } from './view/input';

const STICK_ON = 0.5 * STICK_MAX;
export const MGM01_DT = Math.fround(1 / 60);
const SAVE_KEY = 'mpj.mgm01.save';

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
  if (p.buttons & NPAD.X) b |= 0x4;
  if (p.buttons & NPAD.Y) b |= 0x8;
  if (p.buttons & NPAD.L) b |= 0x10;
  if (p.buttons & NPAD.R) b |= 0x20;
  if (p.buttons & NPAD.ZL) b |= 0x40;
  if (p.buttons & NPAD.ZR) b |= 0x80;
  if (p.buttons & NPAD.LEFT) b |= 0x100;
  if (p.buttons & NPAD.RIGHT) b |= 0x200;
  if (p.buttons & NPAD.DOWN) b |= 0x400;
  if (p.buttons & NPAD.UP) b |= 0x800;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

export interface Mgm01Cfg {
  com: boolean[];
  pads: (PadSource | null)[];
  muted: boolean;
  /** 한 판 요청을 페이지가 실제 게임으로 돌릴 때(index.html ?plaza=1). null·없음 = 가짜 한 판 */
  play?(req: Mgm01PlayRequest): Promise<MgResultEntry | null>;
  onDone(result: string): void;
}

export interface Mgm01Env {
  readonly view: MgmView;
  readonly input: MgmInput;
  readonly sound: MgmSound;
  readonly save: MemorySave;
  readonly work: MgmWork;
  readonly catalog: Mgm01Catalog;
  readonly players: Mgm01Player[];
  readonly params: URLSearchParams;
  readonly overlay: HTMLElement;
  press(bits: number): void;
  persist(): void;
  favorite(id: number): boolean;
  setFavorite(id: number, on: boolean): void;
  lockEnv(): LockEnv;
  loop(step: () => void, render: () => void): void;
  stop(): void;
}

export async function createMgm01Env(stage: HTMLElement, cfg: Mgm01Cfg): Promise<Mgm01Env> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'absolute',
    right: '8px',
    top: '8px',
    maxWidth: '320px',
    padding: '6px 8px',
    background: 'rgba(0,0,0,0.6)',
    font: '12px/1.5 sans-serif',
    zIndex: '3',
  });
  stage.append(overlay);
  let actx: AudioContext | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  if (!cfg.muted) {
    try {
      actx = new AudioContext();
      void actx.resume();
    } catch {
      actx = null;
    }
  }
  const playSe = (url: string, gain: number): void => {
    if (!actx) return;
    const c = actx;
    let b = buffers.get(url);
    if (!b) {
      b = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((a) => c.decodeAudioData(a))
        .catch(() => null);
      buffers.set(url, b);
    }
    void b.then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(c.destination);
      src.start();
    });
  };

  const bgParam = new URLSearchParams(location.search).get('bg');
  const bgUrl = bgParam === 'none' ? null : (bgParam ?? `${ASSETS}modeselect/backdrop_temp.png`);
  let backdrop: HTMLImageElement | undefined;
  if (bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    try {
      await img.decode();
      backdrop = img;
    } catch {
      console.warn(`mgm01: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }
  const view = await MgmView.create({ canvas, assets: { url: (p) => `${ASSETS}mgmcommon/${p}` }, parts: ['mgm01.json', '../mgm01/faces.json', '../mgm01/thumbs.json'], backdrop });
  const cr = await fetch(`${ASSETS}mgm01/catalog.json`);
  if (!cr.ok) throw new Error(`mgm01: catalog.json 을 읽지 못했다 (${cr.status})`);
  const catalog = new Mgm01Catalog((await cr.json()) as Mgm01CatalogJson);
  const params = new URLSearchParams(location.search);
  const players: Mgm01Player[] = [0, 1, 2, 3].map((pid) => ({ pid, type: cfg.com[pid] ? 1 : 0 }));
  if (players.every((p) => p.type === 1)) players[0].type = 0;
  const mgmPlayers: MgmPlayer[] = players.map((p) => ({ pid: p.pid, type: p.type }));

  let stored: string | null = null;
  try {
    stored = params.get('save') === '0' ? null : localStorage.getItem(SAVE_KEY);
  } catch {
    stored = null;
  }
  const save = MemorySave.fromJSON(stored);
  const persist = (): void => {
    try {
      localStorage.setItem(SAVE_KEY, save.toJSON());
    } catch {
      return;
    }
  };
  save.onSave = persist;
  const work = createWork();
  for (const g of catalog.games) work.mg.set(g.id, { isNew: (save.minigame(g.id).flags & MG_FLAG.NEW) !== 0, unlock: true, favorite: (save.minigame(g.id).flags & MG_FLAG.FAVORITE) !== 0 });
  for (const n of (params.get('fav') ?? '').split(',').filter(Boolean)) {
    const g = catalog.gameByName(n);
    if (g) work.mg.get(g.id)!.favorite = true;
  }

  const prev = new Map<number, number>();
  let extra = 0;
  const input: MgmInput = new MgmInput(
    {
      poll(pid: number): { hold: number; trig: number } {
        let hold = toBex(cfg.pads[pid]?.read() ?? null);
        if (pid === input.operator || (input.operator < 0 && pid === 0)) {
          hold |= extra;
          extra = 0;
        }
        const t = hold & ~(prev.get(pid) ?? 0);
        prev.set(pid, hold);
        return { hold, trig: t };
      },
    },
    () => mgmPlayers,
  );
  const sound = new MgmSound({ ...view.spec.sounds, ...catalog.json.sounds }, (p) => (p.startsWith('mgm01/') ? `${ASSETS}${p}` : view.url(p)), {
    play: (_l, url, gain) => playSe(url, gain),
  });

  let raf = 0;
  let stopped = false;
  const env: Mgm01Env = {
    view,
    input,
    sound,
    save,
    work,
    catalog,
    players,
    params,
    overlay,
    press(bits) {
      extra |= bits;
    },
    persist,
    favorite: (id) => !!work.mg.get(id)?.favorite,
    setFavorite(id, on) {
      const w = work.mg.get(id);
      if (w) w.favorite = on;
      const e = save.minigame(id);
      save.setMinigame(id, { head: e.head, flags: on ? e.flags | MG_FLAG.FAVORITE : e.flags & ~MG_FLAG.FAVORITE });
    },
    lockEnv: () => ({
      bossOpen: params.get('boss') === '1',
      playCount: (id) => save.minigame(id).head,
      connected: params.get('connected') === '1',
      players,
    }),
    loop(step, render) {
      cancelAnimationFrame(raf);
      let last = performance.now();
      let acc = 0;
      const tick = (now: number): void => {
        if (stopped) return;
        acc += Math.min(250, now - last);
        last = now;
        let n = 0;
        while (acc >= 1000 / 60 && n < 4) {
          input.update();
          step();
          acc -= 1000 / 60;
          n++;
        }
        view.begin();
        render();
        view.end();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      view.dispose();
      canvas.remove();
      overlay.remove();
      const c = actx;
      setTimeout(() => void c?.close(), 300);
    },
  };
  return env;
}

function field(box: HTMLElement, label: string, el: HTMLElement): void {
  const l = document.createElement('label');
  l.style.display = 'block';
  l.textContent = `${label} `;
  l.append(el);
  box.append(l);
}

function select(options: [string, string][], value: string): HTMLSelectElement {
  const s = document.createElement('select');
  for (const [v, t] of options) s.append(new Option(t, v));
  s.value = value;
  return s;
}

function check(on: boolean): HTMLInputElement {
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = on;
  return c;
}

export interface Mgm01Run {
  readonly phase: string;
  readonly env: Mgm01Env;
  readonly screen: SettingScreen | FilterScreen;
  readonly last: unknown;
  press(bits: number): void;
  restart(): void;
  stop(): void;
  debug(): string;
}

function filterSummary(env: Mgm01Env, r: FilterApplied): string {
  const texts = env.view.spec.texts;
  const names = r.ids.map((id) => `${id}:${plainText(texts[env.catalog.game(id)?.nameLabel ?? ''] ?? '', texts)}`);
  return [
    `필터 enum ${r.enumNo} ${r.name} (표시 ${r.index}) "${plainText(texts[r.label] ?? '', texts)}"`,
    `게임 ${r.ids.length}개 · unlocked ${r.unlocked.length}개 · 형식 type${r.type}${r.emptyFavorite ? ' · 빈 즐겨찾기' : ''}`,
    `ID: ${names.join(', ')}`,
  ].join('\n');
}

export async function runMgm01Setting(stage: HTMLElement, cfg: Mgm01Cfg): Promise<Mgm01Run> {
  const env = await createMgm01Env(stage, cfg);
  const { catalog, params } = env;
  const texts = env.view.spec.texts;
  const gameSel = select(
    catalog.filterList(FILTER.MgAll).map((id): [string, string] => {
      const g = catalog.game(id)!;
      return [g.name, `${g.name} ${plainText(texts[g.nameLabel] ?? '', texts)} (${g.rule})`];
    }),
    params.get('mg') ?? 'mg0106',
  );
  const filterSel = select(
    catalog.filters.map((f): [string, string] => [String(f.enumNo), plainText(texts[f.label] ?? f.name, texts)]),
    params.get('filter') ?? '0',
  );
  const cpuIn = select(['0', '1', '2', '3'].map((v): [string, string] => [v, v]), params.get('cpu') ?? '0');
  const endlessIn = check(params.get('endless') === '1');
  const resumeIn = check(params.get('resume') === '1');
  const connIn = check(params.get('connected') === '1');
  const bossIn = check(params.get('boss') === '1');
  const apply = document.createElement('button');
  apply.textContent = '적용(다시 시작)';
  const title = document.createElement('div');
  title.textContent = '개별 설정 시험값 (사람/CPU = 왼쪽 COM 체크)';
  env.overlay.append(title);
  field(env.overlay, '게임', gameSel);
  field(env.overlay, '필터', filterSel);
  field(env.overlay, 'CPU 초기', cpuIn);
  field(env.overlay, '엔드리스 초기', endlessIn);
  field(env.overlay, 'resume(Play 커서)', resumeIn);
  field(env.overlay, '온라인 접속', connIn);
  field(env.overlay, '보스 개방', bossIn);
  env.overlay.append(apply);

  let screen = new SettingScreen(env.view, {
    catalog,
    players: () => env.players,
    filter: { enumNo: 0, index: 0 },
    unlocked: [],
    isFavorite: env.favorite,
    setFavorite: env.setFavorite,
    rand: (n) => Math.floor(Math.random() * n),
    sound: env.sound,
    input: () => ({ trig: env.input.trig(), rep: env.input.rep() }),
    record: (id) => catalog.defaultRecord(catalog.game(id)?.name ?? ''),
    playCount: (id) => env.save.minigame(id).head,
  });
  let fibers = new FiberRunner();
  let phase = '시작';
  let last: SettingOutcome | null = null;

  const start = (): void => {
    params.set('connected', connIn.checked ? '1' : '0');
    params.set('boss', bossIn.checked ? '1' : '0');
    const g = catalog.gameByName(gameSel.value) ?? catalog.games[0];
    const enumNo = Number(filterSel.value);
    const lock = env.lockEnv();
    const unlocked = catalog.mgIdList(enumNo, false, (id) => catalog.lockReason(id, lock), env.favorite);
    screen = new SettingScreen(env.view, { ...screen.deps, filter: { enumNo, index: catalog.filterIndexOf(enumNo) }, unlocked });
    fibers = new FiberRunner();
    phase = '설정';
    const flow = function* (): Flow<SettingOutcome> {
      return yield* screen.flow({ id: g.id, team: 0, cpu: Number(cpuIn.value), endless: endlessIn.checked, rhythm: 0, resume: resumeIn.checked });
    };
    fibers.start(flow(), (o) => {
      last = o;
      phase = '끝';
      env.persist();
      const name = plainText(texts[catalog.game(o.id)?.nameLabel ?? ''] ?? '', texts);
      const lines = [`결과 ${o.result} (${o.result === 'play' ? '한 판 호출' : o.result === 'list' ? '목록으로' : o.result}) — ${o.id} ${name}`, `설정값 ${JSON.stringify(o.values)} 즐겨찾기 변경 ${o.favoriteDirty ? 1 : 0}`];
      if (o.request) lines.push(`호출 계약 ${JSON.stringify(o.request)}`);
      cfg.onDone(lines.join('\n'));
    });
  };
  apply.addEventListener('click', start);
  start();
  env.loop(
    () => {
      fibers.step();
      screen.update();
    },
    () => screen.draw(),
  );
  return {
    get phase() {
      return phase;
    },
    env,
    get screen() {
      return screen;
    },
    get last() {
      return last;
    },
    press: (b) => env.press(b),
    restart: start,
    stop: () => env.stop(),
    debug() {
      const s = screen.state;
      if (!s) return `phase ${phase}`;
      return [
        `phase ${phase}  조작 ${env.input.operator + 1}P  게임 ${s.id} ${s.game.name} (${s.game.rule}, rule ${s.game.ruleNo ?? '?'})`,
        `커서 ${s.cursor} valid ${s.valid.map((v) => (v ? 1 : 0)).join('')} 값 ${s.values.join(',')} 팀표 ${s.teamTable}(${s.teamCount}) pane ${s.rulePane.join(',')}`,
        `후보 ${s.ids.length}개 위치 ${s.pos}  상태 ${s.phase}`,
      ].join('\n');
    },
  };
}

export async function runMgm01Filter(stage: HTMLElement, cfg: Mgm01Cfg): Promise<Mgm01Run> {
  const env = await createMgm01Env(stage, cfg);
  const { catalog, params } = env;
  const favIn = document.createElement('input');
  favIn.value = params.get('fav') ?? '';
  favIn.placeholder = 'mg0101,mg0203';
  const connIn = check(params.get('connected') === '1');
  const bossIn = check(params.get('boss') === '1');
  const apply = document.createElement('button');
  apply.textContent = '적용(다시 시작)';
  const title = document.createElement('div');
  title.textContent = '필터 시험값 (L/ZL·Q = 이전, R/ZR·E = 다음, B = 닫기)';
  const live = document.createElement('pre');
  Object.assign(live.style, { margin: '4px 0 0', whiteSpace: 'pre-wrap', maxHeight: '240px', overflow: 'auto' });
  env.overlay.append(title);
  field(env.overlay, '즐겨찾기(이름,이름)', favIn);
  field(env.overlay, '온라인 접속', connIn);
  field(env.overlay, '보스 개방', bossIn);
  env.overlay.append(apply, live);

  let last: FilterApplied | null = null;
  const mk = (): FilterScreen => {
    params.set('connected', connIn.checked ? '1' : '0');
    params.set('boss', bossIn.checked ? '1' : '0');
    const fav = new Set(favIn.value.split(',').map((n) => catalog.gameByName(n.trim())?.id).filter((x): x is number => x !== undefined));
    for (const g of catalog.games) env.work.mg.get(g.id)!.favorite = fav.has(g.id) || (env.save.minigame(g.id).flags & 0x4) !== 0;
    const lock = env.lockEnv();
    return new FilterScreen(
      env.view,
      catalog,
      {
        reason: (id) => catalog.lockReason(id, lock),
        favorite: env.favorite,
        sound: env.sound,
        input: () => ({ trig: env.input.trig(), rep: env.input.rep() }),
        onApplied: (r) => {
          last = r;
          live.textContent = filterSummary(env, r);
        },
      },
      Number(params.get('filter') ?? '0'),
    );
  };
  let screen = mk();
  let fibers = new FiberRunner();
  let phase = '시작';
  const start = (): void => {
    screen = mk();
    fibers = new FiberRunner();
    phase = '필터';
    fibers.start(screen.flow(), (r) => {
      phase = '끝';
      cfg.onDone(filterSummary(env, r));
    });
  };
  apply.addEventListener('click', start);
  start();
  env.loop(
    () => {
      fibers.step();
      screen.update();
    },
    () => screen.draw(),
  );
  return {
    get phase() {
      return phase;
    },
    env,
    get screen() {
      return screen;
    },
    get last() {
      return last;
    },
    press: (b) => env.press(b),
    restart: start,
    stop: () => env.stop(),
    debug() {
      const s = screen.state;
      return `phase ${phase}  필터 상태 ${s.phase}  enum ${s.applied.enumNo} ${s.applied.name}  N ${s.applied.ids.length} type${s.applied.type}\n창 애니 ${screen.win.inst.current ?? '-'}`;
    },
  };
}

export interface Mgm01ListRun {
  readonly phase: string;
  readonly env: Mgm01Env;
  readonly scene: Mgm01Scene | null;
  readonly calls: Mgm01PlayRequest[];
  press(bits: number): void;
  stop(): void;
  debug(): string;
}

/** ui.html 가짜 한 판(9.2 [설계]): 참가자 중 무작위 승자(팀이면 그 팀 전부) 1·나머지 0·불참 255, judge 1, 플레이 횟수 +1(최대 999) */
function fakeResult(env: Mgm01Env, req: Mgm01PlayRequest): MgResultEntry {
  const play = req.team.gamePlayByPid;
  const pids = [0, 1, 2, 3].filter((p) => play[p]);
  const w = pids.length ? pids[Math.floor(Math.random() * pids.length)] : 0;
  const team = req.team.teamIdByPid[w];
  const results = [0, 1, 2, 3].map((p) => (!play[p] ? 255 : p === w || (team >= 0 && req.team.teamIdByPid[p] === team && req.team.format !== 0 && req.team.format !== 3) ? 1 : 0)) as [number, number, number, number];
  const e = env.save.minigame(req.id);
  env.save.setMinigame(req.id, { head: Math.min(999, e.head + 1), flags: e.flags });
  return { id: req.id, judge: 1, results };
}

export async function runMgm01List(stage: HTMLElement, cfg: Mgm01Cfg): Promise<Mgm01ListRun> {
  const env = await createMgm01Env(stage, cfg);
  const { catalog, params, work, save } = env;
  const byName = (n: string): number | undefined => catalog.gameByName(n.trim())?.id;
  const newArg = params.get('new') ?? '';
  for (const g of catalog.games) {
    const on = newArg === 'all' || newArg.split(',').some((n) => byName(n) === g.id);
    if (!on) continue;
    work.mg.get(g.id)!.isNew = true;
    const e = save.minigame(g.id);
    save.setMinigame(g.id, { head: e.head, flags: e.flags | MG_FLAG.NEW });
  }
  for (const kv of (params.get('played') ?? '').split(',').filter(Boolean)) {
    const [n, c] = kv.split(':');
    const id = byName(n);
    if (id === undefined) continue;
    const e = save.minigame(id);
    save.setMinigame(id, { head: Math.max(0, Math.min(999, Number(c) || 0)), flags: e.flags });
  }
  const rounds = Math.max(0, Math.min(250, Number(params.get('rounds') ?? 0) || 0));
  for (let r = 1; r <= rounds; r++) {
    const w = (r * 7) % 5;
    const results: [number, number, number, number] = [0, 0, 0, 0];
    if (w < 4) results[w] = 1;
    else results.fill(2);
    work.round = r;
    pushResult(work, { id: catalog.games[(r * 13) % catalog.games.length].id, judge: 1, results });
  }
  const startEnum = params.has('filter') ? Number(params.get('filter')) : undefined;
  const carry: Mgm01Carry = { values: { team: 0, cpu: Math.max(0, Math.min(3, Number(params.get('cpu') ?? 0) || 0)), endless: params.get('endless') === '1', rhythm: 0 } };
  const faces = env.players.map((p) => `pc${String(p.pid + 1).padStart(2, '0')}`);
  const calls: Mgm01PlayRequest[] = [];
  let scene: Mgm01Scene | null = null;
  let phase = '시작';
  let cursorGame: string | undefined;
  const noteCursor = (sc: Mgm01Scene): void => {
    const l = sc.list.state;
    const id = l.ids[l.cursor];
    const name = id === undefined ? undefined : catalog.game(id)?.name;
    if (name === cursorGame) return;
    cursorGame = name;
    if (name) appFlow().state('mgm01', 'game', name);
  };
  let stack: SceneStack;
  const factory = async (name: string, _ctx: unknown, args: unknown, returned?: unknown): Promise<MgmSceneInstance> => {
    if (name === 'minigame') {
      const req = args as Mgm01PlayRequest;
      scene = null;
      phase = `한 판(가짜) ${req.name}`;
      let done = false;
      let real: MgResultEntry | null | undefined = cfg.play ? undefined : null;
      if (cfg.play)
        void cfg
          .play(req)
          .then((r) => (real = r))
          .catch(() => (real = null));
      return {
        step() {
          if (done || real === undefined) return;
          done = true;
          stack.ret(real ?? fakeResult(env, req));
        },
        render() {},
        dispose() {},
      };
    }
    const sc = new Mgm01Scene(
      {
        view: env.view,
        input: env.input,
        sound: env.sound,
        catalog,
        work,
        save,
        players: () => env.players,
        lockEnv: env.lockEnv,
        online: params.get('connected') === '1',
        rand: (n) => Math.floor(Math.random() * n),
        record: (id) => catalog.defaultRecord(catalog.game(id)?.name ?? ''),
        faces,
        carry,
        call: (req) => {
          calls.push(req);
          env.persist();
          stack.call('minigame', req);
        },
        exit: () => stack.ret(),
        dt: MGM01_DT,
        startEnum,
      },
      (returned as MgResultEntry | undefined) ?? null,
    );
    scene = sc;
    phase = '프리 플레이';
    return {
      step: () => {
        sc.step();
        noteCursor(sc);
      },
      render: () => sc.draw(),
      dispose: () => {},
    };
  };
  stack = new SceneStack(factory, save, work, () => {
    phase = '끝';
    env.persist();
    const texts = env.view.spec.texts;
    cfg.onDone(
      [`항구로 돌아감(목록 B) — 한 판 ${calls.length}회, Round ${work.round}`, ...calls.map((c) => `${c.id} ${plainText(texts[`im_${c.name}_name`] ?? '', texts)} cpu ${c.cpu} 팀 ${c.team.teamIdByPid.join(',')}`)].join('\n'),
    );
  });
  await stack.start('mgm01');
  env.loop(
    () => stack.step(),
    () => stack.render(),
  );
  return {
    get phase() {
      return phase;
    },
    env,
    get scene() {
      return scene;
    },
    calls,
    press: (b) => env.press(b),
    stop: () => {
      env.persist();
      stack.dispose();
      env.stop();
    },
    debug() {
      const sc = scene;
      if (!sc) return `phase ${phase}`;
      const l = sc.list.state;
      const id = l.ids[l.cursor];
      const g = id === undefined ? undefined : catalog.game(id);
      return [
        `phase ${phase}  상태 ${sc.state}(이전 ${sc.prev})  Round ${work.round}  조작 ${env.input.operator + 1}P`,
        `목록 필터 enum ${l.enumNo} ${l.filter.applied.name}  N ${l.ids.length} type${l.type}  커서 ${l.cursor} ${g ? `${g.id} ${g.name} reason ${sc.reason(g.id)}` : '-'}  ${l.phase}`,
        `NEW 관찰 ${l.observer.running ? `${l.observer.id} ${l.observer.accumulated}` : '-'}  안내 ${sc.list.announce.state.phase}`,
        sc.setting?.state ? `설정 ${sc.setting.state.id} 커서 ${sc.setting.state.cursor} 값 ${sc.setting.state.values.join(',')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    },
  };
}
