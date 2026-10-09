/**
 * 사운드 런타임 이전 골든(노드, WebAudio·헤드리스 없음) — docs/engine/04_sound.md §13.7.
 * 가짜 AudioContext(노드 연결·이득 자동화·소스 시작/정지·ended, 가상 시계·가상 타이머)로 게임 경로 소리 소비자를 돌려
 * 틱마다 [로직이 낸 소리 사건(라벨)] + [소스 시작(버퍼 파일·when·offset·속도·반복·목적지까지 경로별 이득 곱·팬·채널)·정지 시각·이득 자동화(위쪽 첫 소스 기준)]를
 * 한 줄로 남기고 시나리오마다 sha256 을 낸다. 노드 그래프 모양(핸들 GainNode 가 하나 더 끼는 것)과 무관하게 같은 소리면 같은 기록이 된다.
 * 시나리오: mg1801 두 판(같은 AudioOut 에서 노멀 → 롱 BPM 180, 1P 사람), mgscene 더미 한 판(건너뛰기 없음/있음), 리듬 소리 직접 시나리오(한도·3D·콤보·치환·그룹).
 * 받기·풀기 횟수(파일 내용 기준)도 남긴다 — 디코드 캐시 통합 효과.
 *   npx tsx tools/sound_golden.ts [출력 폴더] [시나리오]
 *   GOLDEN_RULES=web → 코어 soundDefaults.rules = RULES_WEB(이전 전 기록 GOLDEN_SHA256_WEB 과 같아야 한다)
 *   MPJ_WEB=<web 폴더> → 에셋 위치(이전 전 코드 트리를 스크래치에 재구성해 돌릴 때)
 *   GOLDEN_ITEMS=random,groups → 웹 규칙에서 그 항목만 원본으로(04 §13.4 항목별 차이)
 * 이전 전 트리에서도 같은 파일이 돈다(lib/sound 가 없으면 규칙 설정만 건너뜀). Math.random 은 고정 시드 난수로 바꾼다(웹 규칙 시퀀서 무작위).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = process.env.MPJ_WEB ? path.resolve(process.env.MPJ_WEB) : HERE;

/**
 * 이전 전(2026-10-09, 공용 사운드 런타임 도입 전 코드 트리로 이 도구를 돌린) 기록의 sha256. 지금 코드에서 틀 단계 16 사건의 sec(0 → FadeTimePreset 6 = 0.5, 04 §13.4)만
 * 되돌린 사본을 RULES_WEB 로 돌리면 다섯 시나리오 모두 이 값과 바이트까지 같다(04 §13.7).
 */
export const GOLDEN_SHA256_PRE: Record<string, string> = {
  mg1801_normal: '3da903ffb1f4f607cd451ba6e02f6f19d3d4397be8e1d53cfbb6fe0de51648f2',
  mg1801_long180: 'd83146d00f73067fc40b81060aa61e3d535e3e7097ea5c0712ad783b8227fd2e',
  mgscene_dummy: 'aa74ca2d5bfc732abe528fbe0286b3e29daf6e50c555a3e0b26f273798bc5335',
  mgscene_skip: '7863f40940999e5dd7d0c8bcffaf8804ec05b8d0595fe39a3d00d3bc306039d5',
  rhythm_script: 'd6929b78317ca832e83c21d8c1046bcf053fa19b17d8e53c896cd3860979b8a7',
};

/**
 * RULES_WEB 실행(지금 코드) — 이전 전과 다른 줄은 틀 단계 16 groupStop 사건의 sec 한 줄뿐(rhythm_script 는 그 사건이 없어 같다)
 * shell_flow(2차, 셸 화면 흐름)는 이전 페이지 소리 코드(2차 이전 전 트리에서 이 도구가 옮긴 legacyShell)로 돌린 기록과 바이트까지 같다(04 §13.11.4).
 */
export const GOLDEN_SHA256_WEB: Record<string, string> = {
  mg1801_normal: 'f76344391133fb9ace0afd2861d61a57d5b28cbc11fac9c9d68482ca262cdf6b',
  mg1801_long180: '2f9b3c145e2122e3e2bc6b04776a184e7b450822d9039773ab41a73532a0c025',
  mgscene_dummy: '5e9bd29dd74af673f40c9c589b1621414143052851a80d480a3c9102a778d542',
  mgscene_skip: '3b2958cce970d442c12b9f431b683f274d15fb54cf86aab0f449b9fcd9f1e3e2',
  rhythm_script: 'd6929b78317ca832e83c21d8c1046bcf053fa19b17d8e53c896cd3860979b8a7',
  shell_flow: '6172d72bc2f073ead6a429721b6681811c685f89e960ee984bb4944b23f672ab',
};

/** 원본 규칙(기본) 기준 — 2026-10-09 RULES_ORIGINAL 로 돌린 기록(2차: meta·shellHooks 포함해 다시) — 3차: sceneExit·pan2d·진동 포함(shell_flow 만 바뀜) */
export const GOLDEN_SHA256: Record<string, string> = {
  mg1801_normal: '51745f96c3c93b3714a35f566cc339e667425ea01b6c60424bdcb56325711b92',
  mg1801_long180: 'bfb5a10696704d7b881b81b9ecaa4dd17d0ad62773bb46870f279253020fe0c3',
  mgscene_dummy: '5e9bd29dd74af673f40c9c589b1621414143052851a80d480a3c9102a778d542',
  mgscene_skip: '3b2958cce970d442c12b9f431b683f274d15fb54cf86aab0f449b9fcd9f1e3e2',
  rhythm_script: 'ac2504cab856b5f876e57bd9e5b13d8b315ef9abfc6d361bc7503fafabf47033',
  shell_flow: '67afe8b8fdedbb26f057d2f2a136ba93661ef48d30b6638ba159de1fdd2f5d7e',
};

/* ================================================================ 가상 시계·타이머 */

interface Timer {
  id: number;
  due: number;
  fn: () => void;
  every: number;
  seq: number;
}

export const clock = {
  t: 0,
  seq: 0,
  timers: new Map<number, Timer>(),
  nextId: 1,
};

function addTimer(fn: () => void, ms: number, every: boolean): number {
  const id = clock.nextId++;
  const d = Math.max(0, Number(ms) || 0) / 1000;
  clock.timers.set(id, { id, due: clock.t + d, fn, every: every ? Math.max(d, 0.001) : 0, seq: clock.seq++ });
  return id;
}

const flushMicro = async (n = 30): Promise<void> => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

/* ================================================================ 기록 */

const rec = {
  lines: [] as string[],
  cur: [] as string[],
  on: false,
};
const R = (s: string): void => {
  if (rec.on) rec.cur.push(s);
};
const num = (x: number): string => (Number.isFinite(x) ? (Object.is(x, -0) ? '0' : x.toPrecision(10).replace(/\.?0+(e|$)/, '$1')) : String(x));

/* ================================================================ 가짜 WebAudio */

let srcCount = 0;

class FParam {
  base: number;
  ev: { k: 'set' | 'lin'; v: number; t: number }[] = [];
  constructor(
    readonly node: FNode,
    v: number,
    readonly name: string,
  ) {
    this.base = v;
  }
  get value(): number {
    return this.valueAt(clock.t);
  }
  set value(v: number) {
    if (this.ev.length === 0) this.base = v;
    else this.ev.push({ k: 'set', v, t: clock.t });
  }
  valueAt(t: number): number {
    let v = this.base;
    let pt = -Infinity;
    for (const e of this.ev) {
      if (e.t > t) {
        if (e.k === 'lin' && pt <= t) v = v + ((e.v - v) * (t - pt)) / (e.t - pt);
        break;
      }
      v = e.v;
      pt = e.t;
    }
    return v;
  }
  private add(k: 'set' | 'lin', v: number, t: number, op: string): this {
    /* 위쪽에 소스가 아직 없는 노드의 자동화는 뒤에 시작하는 소스의 경로 이득(start 줄)에 들어간다 — 그래프 모양과 무관하게 따로 남기지 않는다 */
    const tag = this.node.tag();
    if (tag !== '-') R(`a ${op} ${tag} ${this.name} ${num(v)} ${num(t)}`);
    let i = this.ev.length;
    while (i > 0 && this.ev[i - 1].t > t) i--;
    this.ev.splice(i, 0, { k, v, t });
    return this;
  }
  setValueAtTime(v: number, t: number): this {
    return this.add('set', v, t, 'set');
  }
  linearRampToValueAtTime(v: number, t: number): this {
    return this.add('lin', v, t, 'lin');
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    return this.add('lin', v, t, 'exp');
  }
  setTargetAtTime(v: number, t: number): this {
    return this.add('set', v, t, 'tgt');
  }
  cancelScheduledValues(t: number): this {
    const tag = this.node.tag();
    if (tag !== '-') R(`a cancel ${tag} ${this.name} ${num(t)}`);
    this.ev = this.ev.filter((e) => e.t < t);
    return this;
  }
  cancelAndHoldAtTime(t: number): this {
    return this.cancelScheduledValues(t);
  }
}

class FNode {
  outs: { d: FNode; o: number; i: number }[] = [];
  ins: FNode[] = [];
  srcId = -1;
  constructor(
    readonly ctx: FCtx,
    readonly kind: string,
  ) {}
  connect(d: FNode | FParam, o = 0, i = 0): FNode | FParam {
    if (d instanceof FParam) return d;
    this.outs.push({ d, o, i });
    d.ins.push(this);
    return d;
  }
  disconnect(): void {
    for (const { d } of this.outs) d.ins = d.ins.filter((x) => x !== this);
    this.outs = [];
  }
  /** 위쪽 첫 소스(연결 순서 깊이 우선) — 그래프 모양과 무관한 이름 */
  tag(seen = new Set<FNode>()): string {
    if (this.srcId >= 0) return `s${this.srcId}`;
    if (seen.has(this)) return '-';
    seen.add(this);
    for (const n of this.ins) {
      const t = n.tag(seen);
      if (t !== '-') return t;
    }
    return '-';
  }
  addEventListener(_k?: string, _fn?: () => void): void {}
  removeEventListener(_k?: string, _fn?: () => void): void {}
}

class FGain extends FNode {
  readonly gain: FParam;
  constructor(ctx: FCtx) {
    super(ctx, 'gain');
    this.gain = new FParam(this, 1, 'g');
  }
}
class FPan extends FNode {
  readonly pan: FParam;
  constructor(ctx: FCtx) {
    super(ctx, 'pan');
    this.pan = new FParam(this, 0, 'p');
  }
}

class FBuffer {
  private data: Float32Array[] | null = null;
  file = '';
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {}
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(c: number): Float32Array {
    this.data ??= Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
    return this.data[c];
  }
}

class FSource extends FNode {
  buffer: FBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate: FParam;
  onended: (() => void) | null = null;
  private ls: (() => void)[] = [];
  started = false;
  when = 0;
  stopT = Infinity;
  fired = false;
  endT = Infinity;
  constructor(ctx: FCtx) {
    super(ctx, 'src');
    this.srcId = srcCount++;
    this.playbackRate = new FParam(this, 1, 'r');
    ctx.sources.add(this);
  }
  override addEventListener(k: string, fn: () => void): void {
    if (k === 'ended') this.ls.push(fn);
  }
  start(when = 0, offset = 0): void {
    this.started = true;
    this.when = Math.max(when, clock.t);
    const b = this.buffer;
    const rate = this.playbackRate.value || 1;
    this.endT = this.loop || !b ? Infinity : this.when + Math.max(0, b.duration - offset) / rate;
    R(`start s${this.srcId} ${b?.file ?? '?'} w=${num(when)} o=${num(offset)} r=${num(rate)} loop=${this.loop ? `${num(this.loopStart)}-${num(this.loopEnd)}` : '0'} ${routes(this, this.when)}`);
  }
  stop(when = 0): void {
    const t = Math.max(when, clock.t);
    /* 이미 끝난(ended) 소스의 stop 은 소리에 영향이 없다 — 남기지 않는다 */
    if (this.fired) return;
    R(`stop s${this.srcId} ${num(when)}`);
    this.stopT = Math.min(this.stopT, t);
  }
  end(): number {
    return Math.min(this.stopT, this.endT);
  }
  fire(): void {
    if (this.fired) return;
    this.fired = true;
    this.ctx.sources.delete(this);
    for (const f of this.ls) f();
    this.onended?.();
  }
}

/** 소스에서 목적지까지 경로마다 이득 곱·팬·채널 표시 */
function routes(src: FNode, t: number): string {
  const out: string[] = [];
  const walk = (n: FNode, g: number, tags: string, depth: number): void => {
    if (depth > 32) return;
    if (n.kind === 'dest') {
      out.push(`${num(g)}${tags}`);
      return;
    }
    let gg = g;
    let tg = tags;
    if (n instanceof FGain) gg = g * n.gain.valueAt(t);
    if (n instanceof FPan) tg += `|p${num(n.pan.valueAt(t))}`;
    for (const e of n.outs) {
      let t2 = tg;
      if (n.kind === 'split') t2 += `|s${e.o}`;
      if (e.d.kind === 'merge') t2 += `|m${e.i}`;
      walk(e.d, gg, t2, depth + 1);
    }
  };
  walk(src, 1, '', 0);
  out.sort();
  return out.join(',') || 'x';
}

const decodeLog = new Map<string, number>();
const fetchLog = new Map<string, number>();
const total = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
/** 시나리오마다 [받기, 풀기] 누적(끝난 때) */
export const ioMarks: [string, number, number][] = [];
const mark = (name: string): void => void ioMarks.push([name, total(fetchLog), total(decodeLog)]);
const contentName = new Map<string, string>();

function hashOf(b: ArrayBuffer): string {
  return crypto.createHash('sha1').update(new Uint8Array(b)).digest('hex');
}

function parseWavInfo(b: ArrayBuffer): { ch: number; rate: number; frames: number } {
  const v = new DataView(b);
  let p = 12;
  let ch = 1;
  let rate = 48000;
  let bits = 16;
  let frames = 0;
  while (p + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
    const size = v.getUint32(p + 4, true);
    if (id === 'fmt ') {
      ch = v.getUint16(p + 10, true);
      rate = v.getUint32(p + 12, true);
      bits = v.getUint16(p + 22, true);
    } else if (id === 'data') {
      frames = Math.floor(size / (ch * (bits / 8)));
      break;
    }
    p += 8 + size + (size & 1);
  }
  return { ch, rate, frames };
}

class FCtx {
  readonly destination: FNode;
  readonly sampleRate = 48000;
  state = 'running';
  readonly sources = new Set<FSource>();
  constructor() {
    this.destination = new FNode(this, 'dest');
    ctxs.push(this);
  }
  get currentTime(): number {
    return clock.t;
  }
  get baseLatency(): number {
    return 0;
  }
  get outputLatency(): number {
    return 0;
  }
  createGain(): FGain {
    return new FGain(this);
  }
  createStereoPanner(): FPan {
    return new FPan(this);
  }
  createBufferSource(): FSource {
    return new FSource(this);
  }
  createChannelSplitter(): FNode {
    return new FNode(this, 'split');
  }
  createChannelMerger(): FNode {
    return new FNode(this, 'merge');
  }
  createBuffer(ch: number, len: number, rate: number): FBuffer {
    return new FBuffer(ch, len, rate);
  }
  decodeAudioData(b: ArrayBuffer): Promise<FBuffer> {
    const h = hashOf(b);
    const name = contentName.get(h) ?? h.slice(0, 8);
    decodeLog.set(name, (decodeLog.get(name) ?? 0) + 1);
    const w = parseWavInfo(b);
    const buf = new FBuffer(Math.min(2, w.ch), w.frames, w.rate);
    buf.file = name;
    return Promise.resolve(buf);
  }
  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    /* 컨텍스트를 닫으면 남은 소스가 그 자리에서 멎는다 — 정지와 같게 남긴다 */
    for (const s of [...this.sources].sort((a, b) => a.srcId - b.srcId)) if (s.started && !s.fired) s.stop(0);
    return Promise.resolve();
  }
  getOutputTimestamp(): { contextTime: number; performanceTime: number } {
    return { contextTime: clock.t, performanceTime: clock.t * 1000 };
  }
}
const ctxs: FCtx[] = [];

class FOffline extends FCtx {
  constructor() {
    super();
    ctxs.pop();
  }
}

/** 가상 시간을 dt 만큼: 끝난 소스 ended → 기한 된 타이머(순서대로), 사이마다 마이크로태스크 비우기 */
async function advance(dt: number): Promise<void> {
  const to = clock.t + dt;
  for (;;) {
    let next: Timer | null = null;
    for (const tm of clock.timers.values()) if (tm.due <= to + 1e-12 && (!next || tm.due < next.due || (tm.due === next.due && tm.seq < next.seq))) next = tm;
    let src: FSource | null = null;
    for (const c of ctxs) for (const s of c.sources) if (s.started && !s.fired && s.end() <= to + 1e-12 && (!src || s.end() < src.end() || (s.end() === src.end() && s.srcId < src.srcId))) src = s;
    if (!next && !src) break;
    if (src && (!next || src.end() <= next.due)) {
      clock.t = Math.max(clock.t, src.end());
      src.fire();
    } else if (next) {
      clock.t = Math.max(clock.t, next.due);
      if (next.every > 0) {
        next.due += next.every;
        next.seq = clock.seq++;
      } else clock.timers.delete(next.id);
      next.fn();
    }
    await flushMicro();
  }
  clock.t = to;
  await flushMicro();
}

/* ================================================================ 전역 설치 */

function fileOfUrl(u: string): string | null {
  let s = String(u);
  s = s.replace(/^https?:\/\/[^/]+\//, '').replace(/^\.\//, '').replace(/^\//, '');
  s = s.split(/[?#]/)[0];
  if (!s.startsWith('assets/')) s = `assets/${s}`;
  return path.join(WEB, decodeURIComponent(s));
}

function install(): void {
  const G = globalThis as Any;
  G.AudioContext = FCtx;
  G.OfflineAudioContext = FOffline;
  G.setTimeout = (fn: () => void, ms?: number) => addTimer(fn, ms ?? 0, false);
  G.clearTimeout = (id: number) => void clock.timers.delete(id);
  G.setInterval = (fn: () => void, ms?: number) => addTimer(fn, ms ?? 0, true);
  G.clearInterval = (id: number) => void clock.timers.delete(id);
  G.requestAnimationFrame = (fn: (t: number) => void) => addTimer(() => fn(clock.t * 1000), 16, false);
  G.cancelAnimationFrame = (id: number) => void clock.timers.delete(id);
  Object.defineProperty(G, 'performance', { value: { now: () => clock.t * 1000 }, configurable: true, writable: true });
  let s = 0x9e3779b9;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  G.fetch = async (u: string | URL) => {
    const f = fileOfUrl(typeof u === 'string' ? u : u.href);
    const rel = f ? path.relative(path.join(WEB, 'assets'), f).replace(/\\/g, '/') : String(u);
    fetchLog.set(rel, (fetchLog.get(rel) ?? 0) + 1);
    const ok = !!f && fs.existsSync(f);
    const bytes = ok ? fs.readFileSync(f!) : Buffer.alloc(0);
    const ab = (): ArrayBuffer => {
      const a = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      contentName.set(hashOf(a), rel);
      return a;
    };
    return { ok, status: ok ? 200 : 404, arrayBuffer: async () => ab(), json: async () => JSON.parse(bytes.toString('utf8')), text: async () => bytes.toString('utf8') };
  };
}

/* ================================================================ 시나리오 */

function fakeAssets(dir: string): Any {
  const file = (p: string): string => path.join(WEB, 'assets', dir, p);
  return {
    dir,
    url: (p: string) => `./assets/${dir}${p}`,
    json: async (p: string) => JSON.parse(fs.readFileSync(file(p), 'utf8')),
    dispose: () => undefined,
  };
}

const SOUND_KINDS = new Set(['justSound', 'bgm', 'bgmStop', 'se', 'se3d', 'seLocal', 'soundStop', 'soundPreset']);

interface Mods {
  MgmSound: Any;
  MessageWindow: Any;
  mgmSpec: Any;
  mgmHost: Any;
  appAssets: Any;
  assetKeyOf: Any;
  AudioOut: Any;
  RmSoundMap: Any;
  MgSceneSound: Any;
  rmTelopView: Any;
  rmPerfectView: Any;
  Mg1801Harness: Any;
  NodeMgRun: Any;
  mg1801Options: Any;
  createDummyGame: Any;
  THREE: Any;
}

let mods: Mods;

function camera(): Any {
  const c = new mods.THREE.PerspectiveCamera(30, 16 / 9, 0.1, 1000);
  c.position.set(0, 6, 14);
  c.lookAt(0, 1, 0);
  c.updateMatrixWorld();
  return c;
}

const uiStub = { push: () => undefined };
/** 로직 상태 해시(소리와 무관한 값이 바뀌지 않았는지) */
const stHash = (x: unknown): string => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);

async function mg1801Two(out: Map<string, string[]>): Promise<void> {
  const audio = new mods.AudioOut();
  const cam = camera();
  const plays: [string, Any, number][] = [
    ['mg1801_normal', mods.mg1801Options({ mode: '0' }), 1],
    ['mg1801_long180', mods.mg1801Options({ mode: '1', longPos: 'rc3' }), 3],
  ];
  for (const [name, opts, seed] of plays) {
    rec.cur = [];
    rec.on = true;
    srcCount = 0;
    const sound = new mods.RmSoundMap(fakeAssets('mg1801/'), audio, 'mg1801');
    await sound.load();
    const mgs = await mods.MgSceneSound.load(audio, [{ assets: fakeAssets('mgscene/'), path: 'sound/sound.json' }]);
    await flushMicro();
    const setup = { players: ['pc01', 'pc51', 'pc58', 'pc13'].map((c, i) => ({ char: c, isCom: i > 0, comLevel: 0 })), seed, practice: false, options: {} };
    const g = new mods.Mg1801Harness(setup, opts);
    for (let f = 1; f < 60 * 200 && !g.run.ended; f++) {
      await advance(1 / 60);
      R(`# ${f} t=${num(clock.t)}`);
      const snap = sound.observe(clock.t);
      const p1 = { buttons: f % 37 === 0 ? 1 : 0, lx: 0, ly: 0, rx: 0, ry: 0 };
      if (!g.step([p1, null, null, null], snap)) continue;
      const st = g.state;
      const evs: string[] = [];
      for (const e of g.events) {
        if (SOUND_KINDS.has(e.k)) {
          evs.push(JSON.stringify(e));
          sound.onEvent(e, st.bpm, cam);
        } else if (e.k === 'telop') {
          evs.push(`telop:${e.judge}`);
          mods.rmTelopView(uiStub, sound, e, st.frame, st.bpm, cam);
        } else if (e.k === 'perfect') {
          evs.push('perfect');
          mods.rmPerfectView(uiStub, sound, e, st.frame, st.bpm, cam);
        }
      }
      for (const e of g.run.scene.events) if (['se', 'voice', 'bgm', 'bgmStop', 'jingle', 'groupStop'].includes(e.k)) evs.push(`scene:${JSON.stringify(e)}`);
      mgs.onEvents(g.run.scene.events);
      if (evs.length) R(`ev ${evs.join(' ')}`);
      if (snap) R(`obs ${snap.globals.join(',')} ${JSON.stringify(snap.locals)}`);
      R(`st ${stHash([st, g.run.scene.stage, g.run.scene.sub])}`);
      await flushMicro();
    }
    R('dispose');
    sound.stopBgm();
    mgs.dispose();
    await advance(1);
    out.set(name, rec.cur);
    rec.on = false;
    mark(name);
  }
}

async function mgsceneDummy(out: Map<string, string[]>, name: string, skip: boolean): Promise<void> {
  const audio = new mods.AudioOut();
  rec.cur = [];
  rec.on = true;
  srcCount = 0;
  const mgs = await mods.MgSceneSound.load(audio, [
    { assets: fakeAssets('mgdummy/'), path: 'sound/sound.json' },
    { assets: fakeAssets('mgscene/'), path: 'sound/sound.json' },
  ]);
  const def = { id: 'mg0101', createLogic: () => mods.createDummyGame({ mainFrames: 480, openingFrames: 660, useResultStage: false }) };
  const setup = { players: ['pc01', 'pc02', 'pc03', 'pc04'].map((c, i) => ({ char: c, isCom: i > 0, comLevel: 0 })), seed: 1234, practice: false };
  const r = new mods.NodeMgRun(def, setup);
  let pressed = false;
  for (let f = 1; f < 20000 && !r.run.ended; f++) {
    await advance(1 / 60);
    R(`# ${f} t=${num(clock.t)}`);
    const sc = r.run.scene;
    let p1 = null;
    if (skip && !pressed && sc.stage === 4 && sc.sub === 1 && sc.frame >= 40) {
      p1 = { buttons: 1 << 10, lx: 0, ly: 0, rx: 0, ry: 0 };
      pressed = true;
    }
    if (!r.step([p1, null, null, null])) continue;
    const evs = r.run.scene.events.filter((e: Any) => ['se', 'voice', 'bgm', 'bgmStop', 'jingle', 'groupStop'].includes(e.k)).map((e: Any) => JSON.stringify(e));
    mgs.onEvents(r.run.scene.events);
    if (evs.length) R(`ev ${evs.join(' ')}`);
    R(`st ${stHash([r.run.logic.state, r.run.scene.stage, r.run.scene.sub, r.run.scene.frame])}`);
    await flushMicro();
  }
  R('dispose');
  mgs.dispose();
  await advance(1);
  out.set(name, rec.cur);
  rec.on = false;
  mark(name);
}

/** 리듬 소리 직접 시나리오 — 시퀀서 마스터·핸드셰이크·한도·3D·콤보·치환·그룹 정지(틀 + 게임 같은 AudioOut) */
async function rhythmScript(out: Map<string, string[]>): Promise<void> {
  const audio = new mods.AudioOut();
  const cam = camera();
  rec.cur = [];
  rec.on = true;
  srcCount = 0;
  const sound = new mods.RmSoundMap(fakeAssets('mg1801/'), audio, 'mg1801');
  await sound.load();
  const mgs = await mods.MgSceneSound.load(audio, [{ assets: fakeAssets('mgscene/'), path: 'sound/sound.json' }]);
  const P = (x: number, y: number, z: number): Any => ({ x, y, z });
  const script: Record<number, Any[]> = {
    2: [{ k: 'se', label: 'SQ_BGM_RC_MAIN_RHYTHM' }],
    4: [{ k: 'se', label: 'SQ_BGM_RC_MGCMN_OP' }],
    30: [{ k: 'se3d', label: 'SQ_SE_MG1801_JUST', pos: P(-3, 1.5, 0) }, { k: 'justSound', combo: 1, play: true }],
    40: [{ k: 'justSound', combo: 2, play: false }, { k: 'se3d', label: 'SQ_SE_MG1801_SUCCESS', pos: P(3, 1.5, 0) }],
    50: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ k: 'se3d', label: ['SQ_SE_MG1801_FOOD_FALL_WAT_SML', 'SQ_SE_MG1801_FOOD_FALL_WAT_LRG', 'SQ_SE_MG1801_FOOD_FALL_WAT_EXSML'][i % 3], pos: P(i - 3, -0.6, 30 + i * 8) })),
    60: [{ k: 'se', label: 'SQ_BGM_MG1801_A' }],
    90: [{ k: 'seLocal', label: 'SQ_SE_RC_CHEER_MG', index: 5, value: 3 }, { k: 'se3d', label: 'SQ_SE_MG1800_COUNT_STICK', pos: P(0, 2, 60) }],
    200: [{ k: 'bgm', label: 'SQ_BGM_RC_GENERIC' }],
    260: [{ k: 'bgm', label: 'SQ_BGM_RC_CALIBRATION' }],
    300: [{ k: 'se', label: 'SQ_SE_MG1800_MGRES_CNT' }, { k: 'se', label: 'SQ_SE_MG1800_MGRES_CNT' }],
    320: [{ k: 'soundStop', label: 'SQ_SE_MG1800_MGRES_CNT' }],
    340: [{ k: 'soundPreset', name: 'mg1801_result' }, { k: 'se', label: 'SM_JIN_MG1801_MG_RESULT_GOOD' }, { k: 'se', label: 'SM_AMB_MG1801_MG_RESULT' }],
    400: [{ k: 'bgmStop' }],
  };
  const scene: Record<number, Any[]> = {
    20: [{ k: 'se', label: 'SQ_SE_SYS_WHISTLE' }, { k: 'voice', label: 'SQ_VOI_PC01_JUMP' }, { k: 'se', label: 'SQ_SE_FS_PC01_WALK' }],
    100: [{ k: 'jingle', label: 'SM_JIN_MG_WIN' }],
    120: [{ k: 'bgm', label: 'SM_BGM_MGINST' }],
    350: [{ k: 'groupStop', groups: [0x23, 1, 0x25], sec: 0.3 }],
    420: [{ k: 'groupStop', groups: [0x20], sec: 0.5 }],
  };
  for (let f = 1; f <= 480; f++) {
    await advance(1 / 60);
    R(`# ${f} t=${num(clock.t)}`);
    const snap = sound.observe(clock.t);
    for (const e of script[f] ?? []) {
      R(`ev ${JSON.stringify(e)}`);
      sound.onEvent(e, 120, cam);
    }
    if (scene[f]) {
      R(`ev scene:${JSON.stringify(scene[f])}`);
      mgs.onEvents(scene[f]);
    }
    if (snap && f % 30 === 0) R(`obs ${snap.globals.join(',')}`);
    await flushMicro();
  }
  R('dispose');
  sound.stopBgm();
  mgs.dispose();
  await advance(1);
  out.set('rhythm_script', rec.cur);
  rec.on = false;
  mark('rhythm_script');
}

/* ================================================================ 셸 화면(04 §13.11) */

/** 화면 하나의 소리 출력 — 지금 코드 = view/sound.ts shellSound, 이전 전 트리 = 이전 페이지 playSe·보이스 코드를 그대로 옮긴 것(페이지는 DOM 이 있어 노드에서 못 돈다) */
interface ShellOut {
  play(label: string, url: string, gain: number, x?: number): void;
  voice(label: string, url: string, gain: number, slot: number): void;
  voiceStop(slot: number): void;
  preload(urls: readonly string[]): void;
  mgm(hooks?: Any): Any;
  close(ms: number): void;
}

let shellNew: ((o: Any) => ShellOut) | null = null;

/** 이전 페이지 코드(2026-10-09 2차 이전 전): 페이지마다 AudioContext·AudioBuffer 맵, 바이트 = 앱 흐름 assetHooks.loadBytes(관리자 bytes 키 + 복사) */
function legacyShell(pan2d: boolean): ShellOut {
  const c = new (globalThis as Any).AudioContext();
  void c.resume();
  const buffers = new Map<string, Promise<Any>>();
  const bytes = (url: string): Promise<ArrayBuffer> => {
    const key = mods.assetKeyOf(url);
    return key ? mods.appAssets().get(key, 'bytes', 1).then((a: ArrayBuffer) => a.slice(0)) : fetch(url).then((r) => r.arrayBuffer());
  };
  const buffer = (url: string): Promise<Any> => {
    let b = buffers.get(url);
    if (!b) {
      b = bytes(url)
        .then((a) => c.decodeAudioData(a))
        .catch(() => null);
      buffers.set(url, b);
    }
    return b;
  };
  const play = (_l: string, url: string, gain: number, x?: number): void => {
    void buffer(url).then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      if (pan2d) {
        const pan = c.createStereoPanner();
        pan.pan.value = x === undefined ? 0 : Math.max(-1, Math.min(1, (x - 960) / 960));
        src.connect(g).connect(pan).connect(c.destination);
      } else src.connect(g).connect(c.destination);
      src.start();
    });
  };
  const voices = new Map<number, Any>();
  const voiceToken = new Map<number, number>();
  const voiceStop = (slot: number): number => {
    voices.get(slot)?.stop();
    voices.delete(slot);
    const t = (voiceToken.get(slot) ?? 0) + 1;
    voiceToken.set(slot, t);
    return t;
  };
  return {
    play,
    voice(_l, url, gain, slot) {
      const token = voiceStop(slot);
      void buffer(url).then((buf) => {
        if (!buf || voiceToken.get(slot) !== token) return;
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.value = gain;
        src.connect(g).connect(c.destination);
        src.start();
        voices.set(slot, src);
      });
    },
    voiceStop: (slot) => void voiceStop(slot),
    preload(urls) {
      for (const u of urls) void buffer(u);
    },
    mgm: (hooks = {}) => ({ ...hooks, play: (l: string, u: string, g: number, x?: number) => play(l, u, g, x) }),
    close: (ms) => void setTimeout(() => void c.close(), ms),
  };
}

/** 시험 패드: 진동 구간·rumble 을 기록 줄로 */
const fakePad = { read: () => null, rumble: (ms: number) => R(`rumble ${ms}`), vibrate: (segs: Any[]) => R(`vib ${segs.map((g) => `${num(g.ms)}:${num(g.strong)}/${num(g.weak)}`).join(' ')}`) };

const shellOut = (pan2d: boolean, scene: string): ShellOut => (shellNew ? shellNew({ muted: false, pan2d, scene, pads: () => fakePad }) : legacyShell(pan2d));

const steps = async (n: number, tag: string): Promise<void> => {
  for (let i = 0; i < n; i++) {
    await advance(1 / 60);
    R(`# ${tag} t=${num(clock.t)}`);
  }
};

/** 셸 화면 흐름: 광장 → 인원 설정 → 캐릭터 선택 → 모드 선택 → 항구(메시지 창 상태기계) → 프리 플레이 → 온라인. 화면마다 출력을 새로 만든다(이전 = 페이지마다 컨텍스트) */
async function shellFlow(out: Map<string, string[]>): Promise<void> {
  rec.cur = [];
  rec.on = true;
  srcCount = 0;
  const mg = mods.mgmSpec;
  const url = (p: string): string => `./assets/mgmcommon/${p}`;
  const cs = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/charselect/spec.json'), 'utf8'));
  const csUrl = (p: string): string => `./assets/charselect/${p}`;
  const se = (o: ShellOut, label: string, x?: number): void => {
    const s = mg.sounds[label] ?? cs.sounds[label];
    if (s) o.play(label, mg.sounds[label] ? url(s.file) : csUrl(s.file), s.gain, x);
  };
  // 광장(팬 없음)
  let o = shellOut(false, 'menu00');
  for (const l of ['SQ_SE_SYS_DECI', 'SQ_SE_SYS_CURSOR', 'SQ_SE_SYS_CANCEL']) {
    se(o, l);
    await steps(6, 'plaza');
  }
  o.close(0);
  // 인원 설정(팬 없음)
  o = shellOut(false, 'menu00');
  for (const l of ['SQ_SE_SYS_CURSOR', 'SQ_SE_SYS_CURSOR', 'SQ_SE_SYS_DECI']) {
    se(o, l);
    await steps(5, 'setplayer');
  }
  o.close(300);
  await steps(20, 'setplayer-out');
  // 캐릭터 선택(Play2D 팬·슬롯 보이스·미리 받기)
  o = shellOut(true, 'menu01');
  o.preload([csUrl(cs.voices.pc01.files[0]), csUrl(cs.voices.pc02.files[0])]);
  await steps(2, 'charselect');
  se(o, 'SQ_SE_SYS_CURSOR', 300);
  se(o, 'SQ_SE_SYS_CURSOR', 1500);
  await steps(3, 'charselect');
  o.voice(cs.voices.pc01.label, csUrl(cs.voices.pc01.files[0]), cs.voices.pc01.gain, 0);
  await steps(10, 'charselect');
  o.voice(cs.voices.pc02.label, csUrl(cs.voices.pc02.files[0]), cs.voices.pc02.gain, 0);
  o.voice(cs.voices.pc01.label, csUrl(cs.voices.pc01.files[1]), cs.voices.pc01.gain, 1);
  o.voiceStop(1);
  se(o, 'SQ_SE_SYS_DECI', 960);
  await steps(30, 'charselect');
  o.close(600);
  await steps(40, 'charselect-out');
  // 모드 선택(Play2D 팬)
  o = shellOut(true, 'menu01');
  se(o, 'SQ_SE_SYS_CURSOR', 200);
  await steps(4, 'modeselect');
  se(o, 'SQ_SE_SYS_DECI', 1700);
  await steps(10, 'modeselect');
  o.close(300);
  // 항구: 메시지 창 상태기계(열기 → 글자 → 넘김 → 선택지 → 커서 → 결정 → 닫기)
  o = shellOut(true, 'mgmet');
  const pad = { next: 0, cur: 0 };
  const inp = {
    com: new Set<number>(),
    tick() {
      pad.cur = pad.next;
      pad.next = 0;
    },
    trigOf: (pid: number) => (pid === 0 ? pad.cur : 0),
    isCom: () => false,
  };
  const snd = new mods.MgmSound(mg.sounds, url, o.mgm());
  const mw = new mods.MessageWindow(mods.mgmHost, inp, snd);
  const step = async (n = 1): Promise<void> => {
    for (let i = 0; i < n; i++) {
      inp.tick();
      mw.update(Math.fround(1 / 60));
      await steps(1, 'msg');
    }
  };
  mw.setMessageLabel('mgmet_entFirst_mw_guide02');
  mw.setOwner(0);
  mw.disablePadInput(false, false);
  mw.start();
  for (let k = 0; k < 400 && !mw.isNextInputWait(); k++) await step();
  await step(30);
  pad.next = 0x1;
  await step(2);
  for (let k = 0; k < 60 && !mw.isEnd(); k++) await step();
  mw.setChoiceCount(2);
  mw.setMessageLabel('mgmet_entFirst_mw_guide01');
  mw.setChoiceLabel(0, 'mgmet_entFirst_mw_guide01');
  mw.setChoiceLabel(1, 'mgmet_entFirst_mw_guide01');
  mw.setCancelEnable(true);
  mw.setInitialChoice(1);
  mw.setOwner(0);
  mw.start();
  for (let k = 0; k < 400 && !mw.isNextInputWait(); k++) await step();
  await step(40);
  pad.next = 0x800;
  await step(10);
  pad.next = 0x1;
  await step(2);
  for (let k = 0; k < 120 && !mw.isEnd(); k++) await step();
  snd.playSe('SQ_SE_SYS_DECI');
  await step(5);
  snd.fadeAndEntryCancel();
  await step(40);
  o.close(300);
  // 프리 플레이(팬 없음)
  o = shellOut(false, 'mgm01');
  const s2 = new mods.MgmSound(mg.sounds, url, o.mgm());
  for (const l of ['SQ_SE_SYS_CURSOR', 'SQ_SE_SYS_DECI', 'SQ_SE_SYS_CANCEL', 'SQ_SE_SYS_MES_PROC']) {
    s2.playSe(l);
    await steps(4, 'mgm01');
  }
  o.close(300);
  // 온라인(팬 없음)
  o = shellOut(false, 'menu00');
  const s3 = new mods.MgmSound(mg.sounds, url, o.mgm());
  s3.playSe('SQ_SE_SYS_DECI');
  s3.playSe('SQ_SE_SYS_CURSOR');
  await steps(30, 'online');
  o.close(300);
  await steps(30, 'end');
  R(`msglog ${JSON.stringify(snd.log.map((e: Any) => e.type + ':' + (e.label ?? e.groups ?? '')))}`);
  out.set('shell_flow', rec.cur);
  rec.on = false;
  mark('shell_flow');
}

async function shellMods(): Promise<Pick<Mods, 'MgmSound' | 'MessageWindow' | 'mgmSpec' | 'mgmHost' | 'appAssets' | 'assetKeyOf'>> {
  const mgm = await import('../script/shell/mgmcommon');
  const { LayoutInst } = await import('@app/scene/menu/charselect/scene2d');
  const { resolveFontsFromDisk } = await import('./fontSpecNode');
  const aa = await import('../script/view/appAssets');
  const spec = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/mgmcommon/spec.json'), 'utf8'));
  await resolveFontsFromDisk(spec.fonts, path.join(WEB, 'assets/mgmcommon'));
  const host = { all: spec, spec, r2d: null, layout: (n: string) => new LayoutInst(n, spec.layouts[n], spec), draw: () => undefined };
  const vs = (await import('../script/view/sound')) as Any;
  shellNew = typeof vs.shellSound === 'function' ? vs.shellSound : null;
  return { MgmSound: mgm.MgmSound, MessageWindow: mgm.MessageWindow, mgmSpec: spec, mgmHost: host, appAssets: aa.appAssets, assetKeyOf: aa.assetKeyOf };
}

export const SCENARIOS = ['mg1801_normal', 'mg1801_long180', 'mgscene_dummy', 'mgscene_skip', 'rhythm_script', 'shell_flow'];

/** 시나리오를 돌려 이름 → 기록 줄. 받기·풀기 횟수도 */
export async function runSoundGolden(rules?: 'web' | 'original', only?: string): Promise<{ lines: Map<string, string[]>; fetches: Map<string, number>; decodes: Map<string, number> }> {
  install();
  const core = (await import('@game/lib/sound' as string).catch(() => null)) as Any;
  if (core && rules) core.soundDefaults.rules = rules === 'web' ? core.RULES_WEB : core.RULES_ORIGINAL;
  const vib = (await import('@game/lib/vibration' as string).catch(() => null)) as Any;
  if (vib && rules) vib.vibDefaults.rules = rules === 'web' ? vib.VIB_RULES_WEB : vib.VIB_RULES_ORIGINAL;
  /* GOLDEN_ITEMS=random,groups → 웹 규칙에서 그 항목만 원본으로(항목별 차이 확인) */
  if (core && process.env.GOLDEN_ITEMS) {
    const r: Any = { ...core.RULES_WEB, id: 'web' };
    for (const k of process.env.GOLDEN_ITEMS.split(',')) r[k] = core.RULES_ORIGINAL[k];
    core.soundDefaults.rules = r;
    if (vib) vib.vibDefaults.rules = process.env.GOLDEN_ITEMS.split(',').includes('vib') ? vib.VIB_RULES_ORIGINAL : vib.VIB_RULES_WEB;
  }
  const THREE = await import('three');
  mods = {
    AudioOut: (await import('../script/view/audio')).AudioOut,
    RmSoundMap: (await import('../script/games/rhythm/view/sound')).RmSoundMap,
    MgSceneSound: (await import('../script/view/mgsceneSound')).MgSceneSound,
    rmTelopView: await import('../script/games/rhythm/view/events'),
    rmPerfectView: null,
    Mg1801Harness: (await import('./mg_node_host')).Mg1801Harness,
    NodeMgRun: (await import('./mg_node_host')).NodeMgRun,
    mg1801Options: (await import('../script/games/mg1801/index')).mg1801Options,
    createDummyGame: (await import('../script/games/mgdummy/logic')).createDummyGame,
    ...(await shellMods()),
    THREE,
  };
  const ev = mods.rmTelopView as Any;
  mods.rmTelopView = ev.rmTelopView;
  mods.rmPerfectView = ev.rmPerfectView;
  const out = new Map<string, string[]>();
  const want = (n: string): boolean => !only || n.startsWith(only) || only.startsWith(n);
  if (want('mg1801')) await mg1801Two(out);
  if (want('mgscene_dummy')) await mgsceneDummy(out, 'mgscene_dummy', false);
  if (want('mgscene_skip')) await mgsceneDummy(out, 'mgscene_skip', true);
  if (want('rhythm_script')) await rhythmScript(out);
  if (want('shell_flow')) await shellFlow(out);
  return { lines: out, fetches: fetchLog, decodes: decodeLog };
}

const sha = (lines: string[]): string => crypto.createHash('sha256').update(lines.join('\n')).digest('hex');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] && process.argv[2] !== '-' ? path.resolve(process.argv[2]) : null;
  const only = process.argv[3];
  const rules = process.env.GOLDEN_RULES === 'web' ? 'web' : process.env.GOLDEN_RULES === 'original' ? 'original' : undefined;
  const { lines, fetches, decodes } = await runSoundGolden(rules, only);
  if (dir) fs.mkdirSync(dir, { recursive: true });
  for (const [n, l] of lines) {
    const h = sha(l);
    const st = sha(l.filter((x) => x.startsWith('st ') || x.startsWith('ev ') || x.startsWith('# ')));
    console.log(`${n} ${h} 로직 ${st.slice(0, 16)} ${l.length}줄 시작 ${l.filter((x) => x.startsWith('start ')).length} 정지 ${l.filter((x) => x.startsWith('stop ')).length} 자동화 ${l.filter((x) => x.startsWith('a ')).length}`);
    if (dir) fs.writeFileSync(path.join(dir, `${n}.txt`), l.join('\n'));
  }
  const sum = (m: Map<string, number>): [number, number] => [[...m.values()].reduce((a, b) => a + b, 0), m.size];
  const dupF = [...fetches].filter(([, c]) => c > 1);
  const dupD = [...decodes].filter(([, c]) => c > 1);
  console.log(`받기 ${sum(fetches)[0]}회(파일 ${sum(fetches)[1]}, 두 번 이상 ${dupF.length}) 풀기 ${sum(decodes)[0]}회(내용 ${sum(decodes)[1]}, 두 번 이상 ${dupD.length})`);
  let pf = 0;
  let pd = 0;
  for (const [n, f, d] of ioMarks) {
    console.log(`  ${n}: 받기 ${f - pf} 풀기 ${d - pd}`);
    pf = f;
    pd = d;
  }
  if (dir) fs.writeFileSync(path.join(dir, 'io.json'), JSON.stringify({ fetches: Object.fromEntries(fetches), decodes: Object.fromEntries(decodes) }, null, 1));
  process.exit(0);
}
