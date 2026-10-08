/**
 * 흐름 예측 미리 받기·캐릭터 선택 커서 우선 시험(노드, 헤드리스 없음). 설계: docs/engine/loader_manager.md §13.
 * 가짜 시계 + 가짜 망(RTT 뒤 본문을 동시 요청이 대역폭을 똑같이 나눠 받음), 응답 크기 = 압축본(assets-dist) 실제 크기, json = 실제 명세.
 * 실제 코드: 코어(lib/assetcore)·흐름(view/flow·flowTable·flowCatalog)·Preview3D 요청 규칙·charaTiers. 가짜: 처리기(같은 kind, glb 풀기 = 실제 glb 의
 * 이미지 참조를 texture 로 P1 요청 — mpj 대리 로더와 같음). 시나리오: 열림 → 인원 설정 → 캐릭터 선택(커서 이동·결정) → 광장.
 *
 *   npx tsx tools/test_prefetch.ts
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssetManager, jsonHandler, P0, P1, P2, P3, ST_IDLE, ST_QUEUED, ST_READY, type AssetHandler, type AssetIo, type AssetManager, type FetchLike } from '../script/lib/assetcore';
import { assetHooks } from '../script/shell/charselect/assetHooks';
import { Preview3D } from '../script/shell/charselect/preview3d';
import { nodeMatrix } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import { charaTiers } from '../script/shell/charselect/screen';
import { RANDOM } from '../script/shell/charselect/state';
import type { Spec } from '../script/shell/charselect/types';
import { assetKeyFrom } from '../script/view/assetKey';
import { FlowPrefetch, type FlowKeys, type FlowMode } from '../script/view/flow';
import { flowKeys, normPath } from '../script/view/flowCatalog';
import { FLOW_TABLE } from '../script/view/flowTable';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string): void => {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
};
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} = ${JSON.stringify(b)}`);
const MB = (b: number): string => (b / 1e6).toFixed(2);
const S = (ms: number): string => (ms / 1000).toFixed(2);

// ---------------------------------------------------------------- 압축본 크기
const idx = JSON.parse(readFileSync(`${WEB}/assets-dist/index.json`, 'utf8')) as { ktx2: string[]; lossy: string[]; flac: string[] };
const KTX = new Set(idx.ktx2);
const LOSSY = new Set(idx.lossy);
const FLAC = new Set(idx.flac);
const sizes = new Map<string, number>();
function size(key: string): number {
  let s = sizes.get(key);
  if (s !== undefined) return s;
  const rel = KTX.has(key) ? key.replace(/\.png$/i, '.ktx2') : LOSSY.has(key) ? key.replace(/\.wav$/i, '.ogg') : FLAC.has(key) ? key.replace(/\.wav$/i, '.flac') : key;
  try {
    s = statSync(`${WEB}/assets-dist/${rel}`).size;
  } catch {
    try {
      s = statSync(`${WEB}/assets/${key}`).size;
    } catch {
      s = -1;
    }
  }
  sizes.set(key, s);
  return s;
}
const jsonCache = new Map<string, unknown>();
const readJson = (key: string): unknown => {
  if (!jsonCache.has(key)) jsonCache.set(key, JSON.parse(readFileSync(`${WEB}/assets/${key}`, 'utf8')));
  return jsonCache.get(key);
};
const glbImgs = new Map<string, string[]>();
function glbImages(key: string): string[] {
  let r = glbImgs.get(key);
  if (r) return r;
  const b = readFileSync(`${WEB}/assets/${key}`);
  const js = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { images?: { uri?: string }[] };
  r = (js.images ?? []).filter((i) => i.uri).map((i) => normPath(`${posix.dirname(key)}/${decodeURI(i.uri!)}`).replace(/\.ktx2$/i, '.png'));
  glbImgs.set(key, r);
  return r;
}

// ---------------------------------------------------------------- 가짜 망·시계
interface Xfer {
  key: string;
  start: number;
  left: number;
  res(r: FetchLike): void;
}
interface LogRow {
  key: string;
  t: number;
  pri: number;
  bytes: number;
  done: number;
}
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

class Net implements AssetIo {
  now = 0;
  private q: Xfer[] = [];
  readonly log: LogRow[] = [];
  readonly fetches = new Map<string, number>();
  pri: (key: string) => number = () => -1;
  constructor(
    readonly mbps: number,
    readonly rtt: number,
  ) {}

  fetch(url: string): Promise<FetchLike> {
    const key = url;
    const n = size(key);
    this.fetches.set(key, (this.fetches.get(key) ?? 0) + 1);
    const row: LogRow = { key, t: this.now, pri: this.pri(key), bytes: Math.max(0, n), done: -1 };
    this.log.push(row);
    return new Promise((res) =>
      this.q.push({
        key,
        start: this.now + this.rtt,
        left: Math.max(0, n) * 8,
        res: (r) => {
          row.done = this.now;
          res(r);
        },
      }),
    );
  }

  private response(key: string): FetchLike {
    const n = size(key);
    return {
      ok: n >= 0,
      status: n >= 0 ? 200 : 404,
      arrayBuffer: () => Promise.resolve({ byteLength: n } as ArrayBuffer),
      json: () => Promise.resolve(readJson(key)),
      text: () => Promise.resolve(''),
    };
  }

  /** 다음 사건(본문 시작·끝)까지 또는 limit 까지. 사건이 있었으면 true */
  async step(limit: number): Promise<boolean> {
    await flush();
    const act = this.q.filter((x) => x.start <= this.now);
    const rate = act.length ? (this.mbps * 1000) / act.length : 0;
    let next = Infinity;
    for (const x of this.q) next = Math.min(next, x.start > this.now ? x.start : this.now + x.left / rate);
    const to = Math.min(next, limit);
    if (to === Infinity) return false;
    for (const x of act) x.left -= (to - this.now) * rate;
    this.now = to;
    if (next > limit) return false;
    const done = this.q.filter((x) => x.start <= this.now && x.left <= 1e-6);
    this.q = this.q.filter((x) => !done.includes(x));
    for (const x of done) x.res(this.response(x.key));
    await flush();
    await flush();
    return true;
  }

  async runTo(t: number): Promise<void> {
    while (await this.step(t));
    this.now = Math.max(this.now, t);
    await flush();
  }

  async runUntil(cond: () => boolean, maxT = 1e9): Promise<boolean> {
    await flush();
    while (!cond()) if (!(await this.step(maxT))) return cond();
    return true;
  }
}

function makeManager(net: Net, gltfTex: boolean): AssetManager {
  const raw = (kind: string): AssetHandler<ArrayBuffer, ArrayBuffer> => ({
    kind,
    fetch: (url, _k, io) =>
      io!.fetch(url).then((r) => {
        if (!r.ok) throw new Error(`404 ${url}`);
        return r.arrayBuffer();
      }),
    bytes: (b) => b.byteLength,
  });
  let mgr: AssetManager;
  const texture: AssetHandler<unknown, { byteLength: number }> = {
    kind: 'texture',
    fetch: (url, _k, io) =>
      io!.fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`404 ${url}`);
        const n = (await r.arrayBuffer()).byteLength;
        return { byteLength: n, clone: () => ({ byteLength: n }) };
      }),
    bytes: (b) => b.byteLength,
  };
  const gltf: AssetHandler<unknown, ArrayBuffer> = {
    ...raw('gltf'),
    decode: async (_r, key) => {
      if (gltfTex) await Promise.all(glbImages(key).map((k) => mgr.get(k, 'texture')));
      return { key };
    },
  };
  mgr = createAssetManager({ env: { now: () => net.now, io: net }, resolve: (k) => k, handlers: [jsonHandler('json'), raw('bytes'), texture, raw('uiimage'), gltf], maxFetch: 6, maxDecode: 2 });
  net.pri = (k) => mgr.priority(k);
  return mgr;
}

const sumBytes = (keys: Iterable<string>): number => {
  let s = 0;
  for (const k of keys) s += Math.max(0, size(k));
  return s;
};

console.log('1. 코어 lower·drop (내리기·큐에서 빼기)');
{
  const net = new Net(100, 0);
  const m = makeManager(net, false);
  m.maxFetch = 1;
  const keys = ['charselect/spec.json', 'mgmcommon/spec.json', 'modeselect/spec.json', 'setplayer/setplayer.json'];
  m.want('plaza/world/manifest.json', 'json', P0);
  for (const k of keys) m.want(k, 'json', P0);
  eq(m.stats.p0Active, 5, 'P0 5개 활성');
  m.lower(keys[0], P2);
  eq([m.priority(keys[0]), m.stats.p0Active], [P2, 4], '시작 전 P0 → P2 내림, p0Active −1');
  m.lower('plaza/world/manifest.json', P3);
  eq(m.priority('plaza/world/manifest.json'), P0, '받는 중 항목은 내리지 않음');
  m.drop(keys[1]);
  eq([m.state(keys[1]), m.stats.p0Active], [ST_IDLE, 3], '시작 전 항목 drop → idle');
  await net.runUntil(() => m.state(keys[3]) === ST_READY);
  const order = net.log.map((r) => r.key);
  eq(order, ['plaza/world/manifest.json', keys[2], keys[3], keys[0]], '받기 순서: 내린 항목은 뒤로, 뺀 항목은 안 받음');
  const p = m.get(keys[1], 'json', P1);
  await net.runUntil(() => m.state(keys[1]) === ST_READY);
  ok((await p) !== undefined && net.fetches.get(keys[1]) === 1, 'drop 뒤 다시 요청 → 받음(1회)');
}

console.log('2. 흐름 표 형식');
{
  for (const [s, e] of Object.entries(FLOW_TABLE)) {
    for (const p of [...e.predict, ...Object.values(e.states ?? {}).flat()]) ok(p.pri === P2 || p.pri === P3, `${s} 예측 ${p.bundle} 등급 P2/P3`);
  }
  eq(FLOW_TABLE.boot.own, ['setplayer'], '열림 = 인원 설정 2D 를 P0');
  ok(FLOW_TABLE.setplayer.predict.filter((p) => p.next).map((p) => p.bundle).join() === 'charselect,char:first,charselect:sound', '인원 설정 lite = 캐릭터 선택(2D·1P 캐릭터·소리)만');
}

console.log('3. 묶음 키(실제 명세)');
const catalog = (b: string, json: <T>(k: string) => Promise<T>) => flowKeys(b, json, { gltfTextures: true, gameDir: (n) => (n === 'mg1801' ? 'mg1801/' : null) });
const directJson = <T>(k: string): Promise<T> => Promise.resolve(readJson(k) as T);
const bundles = new Map<string, FlowKeys>();
for (const b of ['setplayer', 'charselect', 'charselect:sound', 'char:first', 'plaza:p0', 'plaza:ui', 'plaza:npc', 'plaza:player:pc01', 'modeselect', 'mgmet', 'mgm01', 'game:mg1801']) {
  const k = await catalog(b, directJson);
  ok(!!k && k.length > 0, `${b} 키 있음`);
  if (!k) continue;
  bundles.set(b, k);
  const miss = k.filter(([key]) => size(key) < 0);
  ok(miss.length === 0, `${b} 파일 전부 있음 ${miss.map((x) => x[0]).slice(0, 3).join(',')}`);
  console.log(`   ${b.padEnd(18)} ${String(k.length).padStart(4)} 키  ${MB(sumBytes(k.map((x) => x[0])))} MB(+glb 안 텍스처는 따로)`);
}
{
  const p0 = bundles.get('plaza:p0')!;
  eq(p0.filter(([, k]) => k === 'gltf').length, 22, '광장 P0 모델 22(§12.2)');
  const cs = readJson('charselect/spec.json') as Spec;
  eq(bundles.get('char:first')![0], ['chara/pc01/pc01_mario.glb', 'gltf'], '1P 처음 커서 = 마리오 glb');
  ok(cs.chars.length === 22, '캐릭터 22');
}

// 캐릭터 한 명 = 모델 glb + 모션 glb + motions + 눈 + glb 안 텍스처(압축본)
const csSpec = readJson('charselect/spec.json') as Spec;
const charKeys = (i: number): string[] => {
  const c = csSpec.chars[i];
  const f = [`charselect/${c.glb}`, ...(c.anims ?? []).map((a) => `charselect/${a}`), `charselect/${c.motions}`, c.eye?.tex ? `charselect/${c.eye.tex}` : '', c.eye?.lid ? `charselect/${c.eye.lid.tex}` : ''].filter(Boolean).map(normPath);
  return [...new Set([...f, ...glbImages(f[0])])];
};
const LOCKED = new Set([12, 21]);
const openChars = csSpec.chars.map((c) => c.index).filter((c) => !LOCKED.has(c));
const charBytes = (i: number): number => sumBytes(charKeys(i));
const allOpenBytes = openChars.reduce((a, i) => a + charBytes(i), 0);
console.log(`   캐릭터 선택 3D: 잠기지 않은 ${openChars.length}명 ${MB(allOpenBytes)} MB(전: 진입 때 전부 요청), 마리오 ${MB(charBytes(0))} MB`);

// 격자 칸 위치(screen.ts 와 같은 노드)
const grid = new LayoutInst('sys_base_charasel_01', csSpec.layouts.sys_base_charasel_01, csSpec);
const btnXY = new Map<number, [number, number]>();
for (const c of [...csSpec.chars.map((x) => x.index), RANDOM]) {
  const m = nodeMatrix(grid, c === RANDOM ? 'x_parts_btn_random' : `x_parts_btn_${String(csSpec.chars[c].btn).padStart(2, '0')}`);
  if (m) btnXY.set(c, [m[2], m[5]]);
}

console.log('4. 커서 등급 나누기(charaTiers)');
{
  const t = charaTiers(btnXY, [0, 1, 2, 3], [0], openChars);
  eq([t.order[0], t.now], [0, 1], '사람 커서 마리오 = 지금 1명');
  ok(t.near >= 2 && t.near <= 8, `주변 칸 ${t.near}(8 이웃 이하)`);
  ok(!t.order.includes(12) && !t.order.includes(21), '잠긴 칸 제외');
  const r = charaTiers(btnXY, [RANDOM], [RANDOM], openChars);
  eq(r.now, 0, '랜덤 칸 커서 = 지금 캐릭터 없음');
  ok(r.near > 0, '랜덤 칸 주변은 주변 등급');
}

interface Run {
  mode: FlowMode;
  mbps: number;
  rtt: number;
  setplayerShown: number;
  csEnter: number;
  cs2dWait: number;
  csCursorWait: number;
  csEntryBytes: number;
  csEntryOther: string[];
  csEnterRatio: number;
  moveWaits: number[];
  plazaEnter: number;
  plazaRatio: number;
  plazaWait: number;
  dupes: number;
  firstLowBefore: number;
  requests: [string, number][];
  csRestRequested: number;
  lowered: boolean;
  totalBytes: number;
}

/** 사람 체류 가정(ms): 인원 설정 8 s, 캐릭터 선택: 3 s 뒤 오른쪽 → 1 s 뒤 오른쪽 → 0.3 s 뒤 오른쪽 → 진입 10 s 에 결정, 결정 → 광장 1.5 s */
const DWELL = { setplayer: 8000, move: [3000, 4000, 4300], decide: 10000, toPlaza: 1500 };

async function scenario(mode: FlowMode, mbps: number, rtt: number): Promise<Run> {
  const net = new Net(mbps, rtt);
  const mgr = makeManager(net, true);
  const flow = new FlowPrefetch(mgr, { catalog, mode: () => mode });
  const asked = new Map<string, number>();
  const ask = (u: string, p: number): void => void asked.set(u, Math.min(p, asked.get(u) ?? 9));
  assetHooks.broker = {
    get: (u, k, p) => {
      ask(u, p);
      try {
        return mgr.get(u, k, p);
      } catch {
        return null;
      }
    },
    want: (u, k, p) => {
      ask(u, p);
      mgr.want(u, k, p);
    },
    lower: (u, p) => mgr.lower(u, p),
    drop: (u) => mgr.drop(u),
    lite: () => mode !== 'full',
  };
  const readyKeys = async (b: string): Promise<string[]> => ((await flow.resolve(b)) ?? []).map((x) => x[0]);
  const ready = (keys: string[]): boolean => keys.every((k) => mgr.state(k) === ST_READY);
  const ratio = (keys: string[]): number => {
    const all = sumBytes(keys);
    return all ? sumBytes(keys.filter((k) => mgr.state(k) === ST_READY)) / all : 1;
  };

  flow.enter('boot');
  flow.enter('setplayer');
  await net.runUntil(() => flow.keysOf('setplayer') !== undefined);
  const spKeys = await readyKeys('setplayer');
  await net.runUntil(() => ready(spKeys));
  const setplayerShown = net.now;
  const lowStarts = net.log.filter((r) => r.pri >= P2).map((r) => r.t);
  const firstLowBefore = lowStarts.length ? Math.min(...lowStarts) - setplayerShown : 0;
  await net.runTo(setplayerShown + DWELL.setplayer);

  // 캐릭터 선택 진입
  const csEnter = net.now;
  const ownCs = flow.keysOf('charselect')?.map((x) => x[0]) ?? [];
  const cursorKeys0 = charKeys(0);
  const csEnterRatio = ratio([...ownCs, ...cursorKeys0]);
  const logAt = net.log.length;
  flow.enter('charselect');
  const csKeys = await (async () => {
    await net.runUntil(() => flow.keysOf('charselect') !== undefined);
    return readyKeys('charselect');
  })();
  await net.runUntil(() => ready(csKeys.filter((k) => !k.endsWith('.wav'))));
  const cs2dWait = net.now - csEnter;
  const p3d = new Preview3D(csSpec, (p) => normPath(`charselect/${p}`));
  const visited = new Set<number>();
  const prefetchAt = (cursor: number): void => {
    const t = charaTiers(btnXY, [cursor, 1, 2, 3], [cursor], openChars);
    for (const c of t.order.slice(0, t.now + t.near)) visited.add(c);
    p3d.prefetch(t.order, t.now, t.near);
  };
  prefetchAt(0);
  await net.runUntil(() => ready(charKeys(0)));
  const csCursorWait = net.now - csEnter;
  const entryRows = net.log.slice(logAt).filter((r) => r.t < net.now);
  const csEntryBytes = entryRows.reduce((a, r) => a + r.bytes, 0);
  const allowed = new Set([...csKeys, ...cursorKeys0]);
  const csEntryOther = entryRows.filter((r) => !allowed.has(r.key)).map((r) => r.key);

  // 커서 이동
  const moveAt: [number, number][] = [];
  let lowered = false;
  for (let i = 0; i < DWELL.move.length; i++) {
    await net.runTo(csEnter + DWELL.move[i]);
    const c = i + 1;
    prefetchAt(c);
    if (i === DWELL.move.length - 1) {
      const prev = charKeys(c - 1)[0];
      lowered = mgr.state(prev) !== ST_QUEUED || mgr.priority(prev) >= P2;
      ok(mgr.priority(charKeys(c)[0]) === P0 || mgr.state(charKeys(c)[0]) === ST_READY, `${mode} 커서 캐릭터 ${c} → P0`);
    }
    moveAt.push([c, net.now]);
  }
  await net.runTo(csEnter + DWELL.decide);
  const chosen = csSpec.chars[3].pc;
  flow.state('charselect', 'decided', [chosen]);
  await net.runTo(net.now + 600);
  p3d.dispose();
  const csRestRequested = openChars.filter((i) => !visited.has(i) && asked.get(charKeys(i)[0]) === P3).length;
  await net.runTo(net.now + DWELL.toPlaza - 600);

  // 광장 진입
  const plazaEnter = net.now;
  const plazaBundles = ['plaza:p0', 'plaza:ui', 'plaza:npc', `plaza:player:${chosen}`];
  flow.enter('plaza', { chars: [chosen] });
  for (const b of plazaBundles) await net.runUntil(() => flow.keysOf(b) !== undefined);
  const plazaKeys = (await Promise.all(plazaBundles.map(readyKeys))).flat();
  const glbTex = plazaKeys.filter((k) => k.endsWith('.glb')).flatMap(glbImages);
  const allPlaza = [...new Set([...plazaKeys, ...glbTex])];
  const fetchedBeforePlaza = new Set(net.log.filter((r) => r.done >= 0 && r.done <= plazaEnter).map((r) => r.key));
  const plazaRatio = sumBytes(allPlaza.filter((k) => fetchedBeforePlaza.has(k))) / sumBytes(allPlaza);
  await net.runUntil(() => ready(plazaKeys));
  const doneAt = (k: string): number => net.log.find((r) => r.key === k && r.done >= 0)?.done ?? (mgr.state(k) === ST_READY ? 0 : Infinity);
  const moveWaits = moveAt.map(([c, t]) => {
    const d = Math.max(...charKeys(c).map(doneAt));
    return d === Infinity ? -1 : Math.max(0, d - t);
  });
  const plazaWait = net.now - plazaEnter;
  let dupes = 0;
  for (const n of net.fetches.values()) if (n > 1) dupes++;
  assetHooks.broker = null;
  return {
    mode,
    mbps,
    rtt,
    setplayerShown,
    csEnter,
    cs2dWait,
    csCursorWait,
    csEntryBytes,
    csEntryOther,
    csEnterRatio,
    moveWaits,
    plazaEnter,
    plazaRatio,
    plazaWait,
    dupes,
    firstLowBefore,
    requests: flow.requests.slice(),
    csRestRequested,
    lowered,
    totalBytes: net.log.reduce((a, r) => a + r.bytes, 0),
  };
}

console.log('5. 흐름 시나리오(열림 → 인원 설정 8 s → 캐릭터 선택 이동·결정 10 s → 광장)');
const runs: Run[] = [];
for (const [mbps, rtt] of [
  [9, 170],
  [100, 20],
] as const) {
  for (const mode of ['full', 'lite', 'off'] as const) {
    const r = await scenario(mode, mbps, rtt);
    runs.push(r);
    console.log(
      `   ${String(mbps).padStart(3)} Mbps ${mode.padEnd(4)}: 인원 설정 표시 ${S(r.setplayerShown)} s | 캐릭터 선택 진입: 미리 받음 ${(r.csEnterRatio * 100).toFixed(0)}%, 2D ${S(r.cs2dWait)} s·커서 3D ${S(r.csCursorWait)} s, 진입~커서 준비 받은 양 ${MB(r.csEntryBytes)} MB | 이동 뒤 대기 ${r.moveWaits.map((w) => (w < 0 ? '미완' : S(w))).join('/')} s | 광장 진입: 미리 받음 ${(r.plazaRatio * 100).toFixed(0)}%, 대기 ${S(r.plazaWait)} s | 나머지 캐릭터 요청 ${r.csRestRequested} | 전체 ${MB(r.totalBytes)} MB`,
    );
    ok(r.dupes === 0, `${mbps}/${mode} 같은 키 중복 받기 0 (${r.dupes})`);
    ok(r.firstLowBefore >= 0, `${mbps}/${mode} 인원 설정 2D(P0) 끝나기 전 P2·P3 받기 시작 없음 (${r.firstLowBefore} ms)`);
    ok(r.csEntryOther.length === 0, `${mbps}/${mode} 캐릭터 선택 진입~커서 준비 동안 화면 2D·커서 캐릭터 밖 받기 없음 ${r.csEntryOther.slice(0, 3).join(',')}`);
    ok(r.lowered, `${mbps}/${mode} 커서에서 빠진 캐릭터는 내림(또는 이미 시작)`);
    if (mode === 'full') {
      ok(r.requests.some(([b, p]) => b === 'plaza:p0' && p === P3) && r.requests.some(([b, p]) => b === 'plaza:p0' && p === P2) && r.requests.some(([b, p]) => b === 'plaza:p0' && p === P0), `${mbps} 광장 P0 묶음 P3(설정) → P2(결정) → P0(진입) 올리기`);
      ok(r.csRestRequested > 0, `${mbps} full: 나머지 캐릭터도 유휴로 요청`);
    }
    if (mode === 'lite') {
      const before = r.requests.slice(0, r.requests.findIndex(([b, p]) => b === 'charselect' && p === P0));
      ok(!before.some(([b]) => b.startsWith('plaza:')), `${mbps} lite: 인원 설정 화면에서는 광장 예측 없음`);
      eq(r.csRestRequested, 0, `${mbps} lite: 캐릭터 선택 나머지(먼 칸) 요청 없음`);
    }
    if (mode === 'off') ok(r.requests.every(([, p]) => p === P0), `${mbps} off: 자기 묶음(P0)만`);
  }
}
{
  const f9 = runs.find((r) => r.mbps === 9 && r.mode === 'full')!;
  const o9 = runs.find((r) => r.mbps === 9 && r.mode === 'off')!;
  ok(f9.csEnterRatio > 0.99, `4G full: 캐릭터 선택 진입 때 2D·커서 캐릭터 이미 받음 ${(f9.csEnterRatio * 100).toFixed(1)}%`);
  ok(f9.plazaWait < o9.plazaWait, `4G 광장 진입 대기 full ${S(f9.plazaWait)} s < off ${S(o9.plazaWait)} s`);
  const f100 = runs.find((r) => r.mbps === 100 && r.mode === 'full')!;
  ok(f100.plazaRatio > 0.99, `100 Mbps full: 광장 진입 때 미리 받음 ${(f100.plazaRatio * 100).toFixed(1)}%`);
}

console.log('6. 시간 추정(압축본 크기 ÷ 망 속도, 가짜 망과 별개 확인)');
for (const b of ['setplayer', 'charselect', 'charselect:sound', 'char:first', 'plaza:p0', 'plaza:ui', 'plaza:npc', 'plaza:player:pc01']) {
  const k = bundles.get(b)!.map((x) => x[0]);
  const all = [...new Set([...k, ...k.filter((x) => x.endsWith('.glb')).flatMap(glbImages)])];
  const n = sumBytes(all);
  console.log(`   ${b.padEnd(18)} ${MB(n).padStart(6)} MB  4G 9 Mbps ${S((n * 8) / 9e3).padStart(6)} s  100 Mbps ${S((n * 8) / 1e5).padStart(5)} s`);
}

console.log('7. URL → 키(상대 URL 은 페이지 기준 — assets/assets 회귀)');
{
  const page = 'http://localhost:51811/index.html?plaza=1';
  const root = 'http://localhost:51811/assets/';
  ok(assetKeyFrom('assets/mgmcommon/tex/common/a.png', page, root) === 'mgmcommon/tex/common/a.png', '페이지 상대 assets/… → 루트 기준 키');
  ok(assetKeyFrom('./assets/plaza/world/x.glb', page, root) === 'plaza/world/x.glb', './assets/… → 키');
  ok(assetKeyFrom('http://localhost:51811/assets/a/b.3f2c9a1b.ktx2', page, root) === 'a/b.png', '해시·ktx2 → 소스 png 키');
  ok(assetKeyFrom('bundle/main.js', page, root) === null, '루트 밖 → null');
}

console.log('8. 공용 캐릭터 에셋(docs/engine/chara_assets.md) — 세 화면이 같은 키, 명세가 가리키는 파일 전부 존재(소스·압축본)');
{
  const page = 'http://localhost:51811/index.html?plaza=1';
  const root = 'http://localhost:51811/assets/';
  const key = (u: string): string | null => assetKeyFrom(u, page, root);
  const names = (JSON.parse(readFileSync(`${WEB}/assets-dist/index.json`, 'utf8')) as { names: Record<string, string> }).names;
  type C = { pc: string; glb: string | null; motions?: string; anims?: string[]; eye?: { tex: string | null; lid?: { tex: string } }; layers?: Record<string, string[]>; attach?: { glb: string } | null };
  type M = { glb: string; motions: string; anims?: string[]; resultAnims?: string[]; eyeTex: string | null; color?: { albedo: string } };
  const cs = readJson('charselect/spec.json') as { chars: C[] };
  const pp = readJson('plaza/player/spec.json') as { chars: C[] };
  const npc = readJson('plaza/world/chara/spec.json') as { chars: C[] };
  const mi = readJson('mg1801/chara/index.json') as Record<string, M>;
  const csUrl = (p: string): string => `assets/charselect/${p}`;
  const plUrl = (p: string): string => `assets/plaza/player/${p}`;
  const npcUrl = (p: string): string => `assets/plaza/world/chara/${p}`;
  const mgUrl = (p: string): string => new URL(`assets/mg1801/chara/${p}`, page).href;
  const all = new Set<string>();
  const add = (k: string | null): string | null => {
    if (k) {
      all.add(k);
      if (k.endsWith('.glb')) for (const t of glbImages(k)) all.add(t);
    }
    return k;
  };
  const charFiles = (u: (p: string) => string, c: C): void => {
    for (const p of [c.glb!, c.motions ?? '', ...(c.anims ?? []), c.eye?.tex ?? '', c.eye?.lid?.tex ?? '', ...Object.values(c.layers ?? {}).flat(), c.attach?.glb ?? ''].filter(Boolean)) add(key(u(p)));
  };
  let sameModel = 0;
  let sameEye = 0;
  let sameIdle = 0;
  let sameTex = 0;
  for (const c of cs.chars) {
    const p = pp.chars.find((x) => x.pc === c.pc)!;
    const m = mi[c.pc];
    charFiles(csUrl, c);
    charFiles(plUrl, p);
    for (const f of [m.glb, m.motions, ...(m.anims ?? []), ...(m.resultAnims ?? []), m.eyeTex ?? ''].filter(Boolean)) add(key(mgUrl(f)));
    const models = [key(csUrl(c.glb!)), key(plUrl(p.glb!)), key(mgUrl(m.glb))];
    if (models.every((k) => k === `chara/${c.pc}/${posix.basename(c.glb!)}`)) sameModel++;
    const eyes = [c.eye?.tex ? key(csUrl(c.eye.tex)) : null, p.eye?.tex ? key(plUrl(p.eye.tex)) : null, m.eyeTex ? key(mgUrl(m.eyeTex)) : null];
    if (new Set(eyes).size === 1 && (eyes[0] === null || eyes[0].startsWith('chara/tex/'))) sameEye++;
    const idle = (u: (q: string) => string, list: string[] | undefined): string | null => {
      const f = list?.find((x) => x.endsWith('/co_idle00.glb'));
      return f ? key(u(f)) : null;
    };
    const idles = [idle(csUrl, c.anims), idle(plUrl, p.anims), idle(mgUrl, m.anims)];
    if (idles[0] && new Set(idles).size === 1) sameIdle++;
    const tex = glbImages(models[0]!);
    if (tex.length && tex.every((t) => t.startsWith('chara/tex/'))) sameTex++;
  }
  eq(sameModel, 22, '모델 glb 키 = chara/pcNN/… (캐릭터 선택·광장·mg1801 같음)');
  eq(sameEye, 22, '눈 텍스처 키 같음(세 화면)');
  eq(sameIdle, 22, '대기 모션 co_idle00 glb 키 같음(세 화면)');
  eq(sameTex, 22, '모델 텍스처 = chara/tex/…(모델 하나라 세 화면 같은 키)');
  for (const c of npc.chars) charFiles(npcUrl, c);
  add(key(mgUrl(mi.npc002.glb)));
  eq(key(mgUrl(mi.npc002.glb)), key(npcUrl(npc.chars.find((x) => x.pc === 'npc002')!.glb!)), 'npc002 모델 광장·mg1801 같은 키');
  for (const f of [mi.npc002.motions, ...(mi.npc002.anims ?? []), mi.npc002.color?.albedo ?? ''].filter(Boolean)) add(key(mgUrl(f)));
  const keys = [...all];
  const srcMiss = keys.filter((k) => size(k) < 0 || !k.startsWith('chara/'));
  const distMiss = keys.filter((k) => !names[KTX.has(k) ? k.replace(/\.png$/i, '.ktx2') : k]);
  eq(srcMiss, [], `명세 파일 ${keys.length}개 모두 chara/ 안에 있음(404 0)`);
  eq(distMiss, [], '압축본 해시 표(index.json names)에 모두 있음');
  console.log(`   공용 키 ${keys.length}개(모델·모션·motions·텍스처·소품)`);
}

console.log(fails ? `실패 ${fails} / ${count}` : `통과 ${count}/${count}`);
if (fails) process.exit(1);
