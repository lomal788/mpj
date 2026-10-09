/**
 * 공용 로더 관리자 코어 — import 0(외부 라이브러리·three·프로젝트 파일·DOM 타입 없음). 설계: docs/engine/loader_manager.md §11.
 *
 * - 논리 키 캐시(같은 키 = 같은 Promise), 우선순위 P0~P3 링 큐(올리기만, 게으른 삭제), 받기·풀기 동시 수 제한, 단계 상태,
 *   참조 수(owner 별, release 는 refs 만), 바이트·GPU 예산 숫자와 LRU 후보, 묶음, 통계 숫자, 프레임 예산 스케줄러.
 * - 형식 처리는 kind 별 처리기(fetch → decode → upload → dispose)를 꽂는다. URL 은 resolver 가, 받기·시계·rAF 는 env 가 준다.
 * - 매 프레임 경로(스케줄러 frame·pump·raise)는 할당 0: 링·항목 객체 재사용, 완료 콜백은 항목 생성 때 한 번 bind.
 * - 다른 게임(ddalkkakrider 등)에 이 파일 하나를 그대로 복사해 쓴다. 번들이 둘이면 인스턴스를 globalThis 에 둔다.
 */

export type Pri = 0 | 1 | 2 | 3;
export const P0 = 0;
export const P1 = 1;
export const P2 = 2;
export const P3 = 3;

export const ST_IDLE = 0;
export const ST_QUEUED = 1;
export const ST_FETCHING = 2;
export const ST_DECODING = 3;
export const ST_UPLOADING = 4;
export const ST_READY = 5;
export const ST_FAILED = 6;
export const ST_EVICTED = 7;
export const STATE_NAMES = ['idle', 'queued', 'fetching', 'decoding', 'uploading', 'ready', 'failed', 'evicted'] as const;

/** 스케줄러 작업 단위 반환값: 끝 / 같은 작업을 이어서 / 기다림(다음 프레임에 다시) */
export const RUN_DONE = 0;
export const RUN_MORE = 1;
export const RUN_WAIT = 2;

/** 받기 응답 — fetch Response 중 쓰는 부분만 */
export interface FetchLike {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface AssetIo {
  fetch(url: string): Promise<FetchLike>;
}

/** 생성 때 주입: 시계(ms), 다음 프레임 부르기(rAF), 받기 */
export interface AssetEnv {
  now(): number;
  tick?(fn: () => void): void;
  io?: AssetIo;
}

export interface AssetHandler<V = unknown, R = unknown> {
  readonly kind: string;
  /** 받기(L0 → L1). 받기와 풀기를 한 번에 하는 로더면 여기서 값까지 만들고 decode 를 비운다 */
  fetch(url: string, key: string, io: AssetIo | null): Promise<R>;
  /** 풀기(L1 → L2) */
  decode?(raw: R, key: string, url: string): V | Promise<V>;
  /** 올리기(L2 → L3) 한 단위. step = 앞서 RUN_MORE 를 돌려준 수. 프레임 예산 스케줄러가 부른다 */
  upload?(value: V, step: number, key: string): number;
  /** GPU 내림(값은 남김 — 다시 get 하면 upload 만 다시) */
  dispose?(value: V, key: string): void;
  bytes?(raw: R): number;
  gpuBytes?(value: V): number;
  /** 풀린 뒤에도 받은 바이트를 들고 있음(바이트 예산 대상) */
  readonly keepRaw?: boolean;
}

/** 논리 키 → 실제 URL(압축/원본 모드·루트는 바깥이 정함) */
export type AssetResolver = (key: string, kind: string) => string;

/** 프레임 예산 스케줄러 작업. sched* 필드는 스케줄러 전용(처음 값 -1, 0, -1) */
export interface SchedTask {
  schedPri: number;
  schedGen: number;
  schedMark: number;
  run(): number;
}

/** 고정 크기 링(가득 차면 2배 — 늘 때만 할당). 값과 세대 번호를 나란히 든다 */
export class Ring<T> {
  private items: (T | undefined)[];
  private tags: number[];
  private head = 0;
  size = 0;

  constructor(cap = 16) {
    this.items = new Array<T | undefined>(cap).fill(undefined);
    this.tags = new Array<number>(cap).fill(0);
  }

  get capacity(): number {
    return this.items.length;
  }

  push(x: T, tag = 0): void {
    if (this.size === this.items.length) this.grow();
    const i = (this.head + this.size) % this.items.length;
    this.items[i] = x;
    this.tags[i] = tag;
    this.size++;
  }

  peek(): T | undefined {
    return this.size ? this.items[this.head] : undefined;
  }

  peekTag(): number {
    return this.size ? this.tags[this.head] : -1;
  }

  shift(): T | undefined {
    if (!this.size) return undefined;
    const x = this.items[this.head];
    this.items[this.head] = undefined;
    this.head = (this.head + 1) % this.items.length;
    this.size--;
    return x;
  }

  clear(): void {
    while (this.size) this.shift();
  }

  private grow(): void {
    const n = this.items.length * 2;
    const items = new Array<T | undefined>(n).fill(undefined);
    const tags = new Array<number>(n).fill(0);
    for (let i = 0; i < this.size; i++) {
      const j = (this.head + i) % this.items.length;
      items[i] = this.items[j];
      tags[i] = this.tags[j];
    }
    this.items = items;
    this.tags = tags;
    this.head = 0;
  }
}

export interface SchedStats {
  errors: number;
  frames: number;
  units: number;
  overBudget: number;
  maxMs: number;
  lastMs: number;
}

/**
 * 프레임 예산 스케줄러 — frame() 한 번에 budgetMs 안에서 작업 단위를 높은 등급부터 꺼내 run().
 * RUN_MORE 는 같은 작업을 이어서(하나씩 끝내 먼저 보이게), RUN_WAIT 는 같은 등급 끝으로 보내고 이번 프레임에는 다시 안 본다.
 * 단위 하나가 예산보다 커도 그 프레임에 하나는 한다. env.tick 이 있으면 할 일이 있는 동안 스스로 다음 프레임을 부른다.
 */
export class FrameScheduler {
  budgetMs: number;
  readonly stats: SchedStats = { frames: 0, units: 0, overBudget: 0, maxMs: 0, lastMs: 0, errors: 0 };
  /** 작업 단위가 던진 마지막 예외(던지면 그 작업은 끝난 것으로 친다 — 스케줄러는 멈추지 않는다) */
  lastError: unknown = null;
  private readonly q: Ring<SchedTask>[] = [new Ring<SchedTask>(), new Ring<SchedTask>(), new Ring<SchedTask>(), new Ring<SchedTask>()];
  private readonly waited = [0, 0, 0, 0];
  private live = 0;
  private mark = 0;
  private ticking = false;
  private readonly onTick: () => void;

  constructor(
    private readonly env: Pick<AssetEnv, 'now' | 'tick'>,
    budgetMs = 4,
  ) {
    this.budgetMs = budgetMs;
    this.onTick = this.tickNow.bind(this);
  }

  get pending(): number {
    return this.live;
  }

  add(t: SchedTask, pri: number): void {
    if (t.schedPri >= 0) {
      this.raise(t, pri);
      return;
    }
    t.schedPri = clampPri(pri);
    t.schedGen++;
    t.schedMark = -1;
    this.q[t.schedPri].push(t, t.schedGen);
    this.live++;
    this.request();
  }

  /** 올리기만(낮추지 않음). 옛 자리는 꺼낼 때 세대가 달라 버려진다 */
  raise(t: SchedTask, pri: number): void {
    const p = clampPri(pri);
    if (t.schedPri < 0 || p >= t.schedPri) return;
    t.schedPri = p;
    t.schedGen++;
    this.q[p].push(t, t.schedGen);
  }

  /** 작업을 버린다(진행 중 작업 취소용). 큐의 자리는 세대로 버려진다 */
  remove(t: SchedTask): void {
    if (t.schedPri < 0) return;
    t.schedPri = -1;
    t.schedGen++;
    this.live--;
  }

  /** 예산 안에서 작업을 돌린다. 돌린 단위 수를 돌려준다 */
  frame(): number {
    if (!this.live) return 0;
    const now = this.env;
    const t0 = now.now();
    const m = ++this.mark;
    this.waited[0] = this.waited[1] = this.waited[2] = this.waited[3] = 0;
    let units = 0;
    let el = 0;
    for (;;) {
      if (units > 0 && el >= this.budgetMs) break;
      let p = -1;
      for (let i = 0; i < 4; i++) {
        const ring = this.q[i];
        while (ring.size) {
          const h = ring.peek()!;
          if (h.schedPri === i && ring.peekTag() === h.schedGen) break;
          ring.shift();
        }
        if (ring.size > this.waited[i]) {
          p = i;
          break;
        }
      }
      if (p < 0) break;
      const ring = this.q[p];
      const t = ring.peek()!;
      if (t.schedMark === m) {
        ring.shift();
        ring.push(t, t.schedGen);
        continue;
      }
      let r: number;
      try {
        r = t.run();
      } catch (e) {
        r = RUN_DONE;
        this.stats.errors++;
        this.lastError = e;
      }
      units++;
      if (r === RUN_DONE) {
        if (t.schedPri === p && ring.peek() === t) ring.shift();
        if (t.schedPri >= 0) {
          t.schedPri = -1;
          t.schedGen++;
          this.live--;
        }
      } else if (r === RUN_WAIT) {
        if (ring.peek() === t) ring.shift();
        if (t.schedPri >= 0) {
          t.schedMark = m;
          this.waited[t.schedPri]++;
          this.q[t.schedPri].push(t, t.schedGen);
        }
      }
      el = now.now() - t0;
    }
    const s = this.stats;
    s.frames++;
    s.units += units;
    s.lastMs = el;
    if (el > s.maxMs) s.maxMs = el;
    if (el > this.budgetMs) s.overBudget++;
    return units;
  }

  private request(): void {
    if (this.ticking || !this.env.tick) return;
    this.ticking = true;
    this.env.tick(this.onTick);
  }

  private tickNow(): void {
    this.ticking = false;
    this.frame();
    if (this.live) this.request();
  }
}

const clampPri = (p: number): number => (p <= 0 ? 0 : p >= 3 ? 3 : p | 0);

export interface AssetStats {
  /** get·want 호출 수 / 이미 준비된 것에 대한 get */
  requested: number;
  hits: number;
  fetchStarted: number;
  fetched: number;
  /** 받은 바이트(처리기 bytes 가 알려 준 것) */
  bytes: number;
  decoded: number;
  ready: number;
  failed: number;
  evicted: number;
  inflight: number;
  inflightDecode: number;
  maxInflight: number;
  /** 큐·진행 중인 P0 항목 수(> 0 이면 P2·P3 새 시작 안 함) */
  p0Active: number;
  gpuBytes: number;
  rawBytes: number;
  /** 우선순위 등급별 받기 시작 수 */
  startedByPri: [number, number, number, number];
}

/** 셸·게임이 받는 인터페이스(R12) */
export interface AssetManagerApi {
  get<V = unknown>(key: string, kind: string, pri?: number, owner?: string): Promise<V>;
  want(key: string, kind: string, pri: number, owner?: string): void;
  raise(key: string, pri: number): void;
  lower(key: string, pri: number): void;
  drop(key: string): void;
  peek<V = unknown>(key: string): V | undefined;
  state(key: string): number;
  release(owner: string): void;
  defineBundle(name: string, keys: readonly string[], kinds: string | readonly string[]): void;
  wantBundle(name: string, pri: number, owner?: string): void;
  whenBundle(name: string): Promise<void>;
  bundleReady(name: string): number;
  bundleSize(name: string): number;
  readonly scheduler: FrameScheduler;
  readonly stats: AssetStats;
}

export interface AssetManagerOptions {
  env: AssetEnv;
  resolve: AssetResolver;
  handlers: readonly AssetHandler<any, any>[];
  maxFetch?: number;
  maxDecode?: number;
  budgetMs?: number;
  gpuBudget?: number;
  byteBudget?: number;
}

class Entry implements SchedTask {
  pri = P3;
  state = ST_IDLE;
  refs = 0;
  bytes = 0;
  gpuBytes = 0;
  lastUse = 0;
  step = 0;
  url = '';
  raw: unknown = null;
  value: unknown = undefined;
  error: unknown = null;
  promise: Promise<unknown> | null = null;
  res: ((v: unknown) => void) | null = null;
  rej: ((e: unknown) => void) | null = null;
  qGen = 0;
  inDecodeQ = false;
  schedPri = -1;
  schedGen = 0;
  schedMark = -1;
  readonly onFetched: (raw: unknown) => void;
  readonly onFetchFail: (e: unknown) => void;
  readonly onDecoded: (v: unknown) => void;
  readonly onDecodeFail: (e: unknown) => void;

  constructor(
    readonly mgr: AssetManager,
    readonly key: string,
    readonly kind: string,
    readonly h: AssetHandler<unknown, unknown>,
  ) {
    this.onFetched = (raw) => mgr.fetched(this, raw);
    this.onFetchFail = (e) => mgr.failed(this, e, true, false);
    this.onDecoded = (v) => mgr.decoded(this, v);
    this.onDecodeFail = (e) => mgr.failed(this, e, false, true);
  }

  run(): number {
    return this.mgr.runUpload(this);
  }
}

const isActive = (s: number): boolean => s >= ST_QUEUED && s <= ST_UPLOADING;
const byLastUse = (a: Entry, b: Entry): number => a.lastUse - b.lastUse;

export class AssetManager implements AssetManagerApi {
  readonly scheduler: FrameScheduler;
  readonly stats: AssetStats = {
    requested: 0,
    hits: 0,
    fetchStarted: 0,
    fetched: 0,
    bytes: 0,
    decoded: 0,
    ready: 0,
    failed: 0,
    evicted: 0,
    inflight: 0,
    inflightDecode: 0,
    maxInflight: 0,
    p0Active: 0,
    gpuBytes: 0,
    rawBytes: 0,
    startedByPri: [0, 0, 0, 0],
  };
  maxFetch: number;
  maxDecode: number;
  gpuBudget: number;
  byteBudget: number;
  private readonly entries = new Map<string, Entry>();
  private readonly handlers = new Map<string, AssetHandler<unknown, unknown>>();
  private readonly fetchQ: Ring<Entry>[] = [new Ring<Entry>(64), new Ring<Entry>(64), new Ring<Entry>(64), new Ring<Entry>(64)];
  private readonly decodeQ: Ring<Entry>[] = [new Ring<Entry>(), new Ring<Entry>(), new Ring<Entry>(), new Ring<Entry>()];
  private readonly owners = new Map<string, Set<Entry>>();
  private readonly bundles = new Map<string, { keys: readonly string[]; kinds: readonly string[] }>();
  private readonly scratch: Entry[] = [];
  private useClock = 0;

  constructor(private readonly o: AssetManagerOptions) {
    this.scheduler = new FrameScheduler(o.env, o.budgetMs ?? 4);
    this.maxFetch = o.maxFetch ?? 6;
    this.maxDecode = o.maxDecode ?? 2;
    this.gpuBudget = o.gpuBudget ?? Infinity;
    this.byteBudget = o.byteBudget ?? Infinity;
    for (const h of o.handlers) this.handlers.set(h.kind, h as AssetHandler<unknown, unknown>);
  }

  addHandler(h: AssetHandler<any, any>): void {
    this.handlers.set(h.kind, h as AssetHandler<unknown, unknown>);
  }

  hasKind(kind: string): boolean {
    return this.handlers.has(kind);
  }

  private entry(key: string, kind: string): Entry {
    let e = this.entries.get(key);
    if (e) {
      if (e.kind !== kind) throw new Error(`assetcore: 키 ${key} 의 종류가 다르다(${e.kind} ≠ ${kind})`);
      return e;
    }
    const h = this.handlers.get(kind);
    if (!h) throw new Error(`assetcore: 처리기 없음 ${kind}`);
    e = new Entry(this, key, kind, h);
    this.entries.set(key, e);
    return e;
  }

  get<V = unknown>(key: string, kind: string, pri: number = P1, owner?: string): Promise<V> {
    const e = this.entry(key, kind);
    if (e.state === ST_READY) this.stats.hits++;
    this.request(e, clampPri(pri), owner);
    if (!e.promise) {
      if (e.state === ST_READY) e.promise = Promise.resolve(e.value);
      else if (e.state === ST_FAILED) e.promise = Promise.reject(e.error);
      else
        e.promise = new Promise((res, rej) => {
          e.res = res;
          e.rej = rej;
        });
    }
    return e.promise as Promise<V>;
  }

  want(key: string, kind: string, pri: number, owner?: string): void {
    this.request(this.entry(key, kind), clampPri(pri), owner);
  }

  raise(key: string, pri: number): void {
    const e = this.entries.get(key);
    if (e) this.raiseEntry(e, clampPri(pri));
  }

  /** 내리기: 아직 시작 전(받기 큐·풀기 큐)인 항목만 낮은 등급 큐 뒤로. 진행 중·끝난 항목은 그대로 */
  lower(key: string, pri: number): void {
    const e = this.entries.get(key);
    const p = clampPri(pri);
    if (!e || p <= e.pri) return;
    if (e.state === ST_QUEUED) {
      if (e.pri === P0) this.stats.p0Active--;
      e.pri = p;
      e.qGen++;
      this.fetchQ[p].push(e, e.qGen);
      this.pump();
    } else if (e.inDecodeQ) {
      if (e.pri === P0) this.stats.p0Active--;
      e.pri = p;
      e.qGen++;
      this.decodeQ[p].push(e, e.qGen);
      this.pump();
    }
  }

  /** 받기 큐에서 뺀다(시작 전 항목만 — idle 로, 걸린 Promise 는 다시 요청되면 풀린다). 진행 중·끝난 항목은 그대로 */
  drop(key: string): void {
    const e = this.entries.get(key);
    if (!e || e.state !== ST_QUEUED) return;
    if (e.pri === P0) this.stats.p0Active--;
    e.state = ST_IDLE;
    e.qGen++;
    this.pump();
  }

  peek<V = unknown>(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e || e.state !== ST_READY) return undefined;
    e.lastUse = ++this.useClock;
    return e.value as V;
  }

  state(key: string): number {
    return this.entries.get(key)?.state ?? ST_IDLE;
  }

  priority(key: string): number {
    return this.entries.get(key)?.pri ?? -1;
  }

  refs(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  release(owner: string): void {
    const set = this.owners.get(owner);
    if (!set) return;
    for (const e of set) e.refs--;
    this.owners.delete(owner);
  }

  defineBundle(name: string, keys: readonly string[], kinds: string | readonly string[]): void {
    this.bundles.set(name, { keys: [...keys], kinds: typeof kinds === 'string' ? keys.map(() => kinds) : [...kinds] });
  }

  wantBundle(name: string, pri: number, owner?: string): void {
    const b = this.bundles.get(name);
    if (!b) return;
    for (let i = 0; i < b.keys.length; i++) this.want(b.keys[i], b.kinds[i], pri, owner);
  }

  whenBundle(name: string): Promise<void> {
    const b = this.bundles.get(name);
    if (!b) return Promise.resolve();
    return Promise.all(b.keys.map((k, i) => this.get(k, b.kinds[i], this.priority(k) < 0 ? P1 : this.priority(k)))).then(() => undefined);
  }

  bundleReady(name: string): number {
    const b = this.bundles.get(name);
    if (!b) return 0;
    let n = 0;
    for (let i = 0; i < b.keys.length; i++) if (this.entries.get(b.keys[i])?.state === ST_READY) n++;
    return n;
  }

  bundleSize(name: string): number {
    return this.bundles.get(name)?.keys.length ?? 0;
  }

  /** 앱 루프가 렌더 뒤 부를 수 있다(env.tick 이 있으면 스스로 돈다) */
  frame(): number {
    return this.scheduler.frame();
  }

  /** GPU 예산 LRU 후보: refs 0·준비 끝·GPU 바이트 > 0 을 오래 안 쓴 순으로 need 바이트까지 out 에 키를 넣는다. 고른 바이트 합을 돌려준다 */
  gpuCandidates(out: string[], need: number): number {
    return this.candidates(out, need, true);
  }

  /** 바이트 예산 LRU 후보(keepRaw 항목의 받은 바이트) */
  byteCandidates(out: string[], need: number): number {
    return this.candidates(out, need, false);
  }

  private candidates(out: string[], need: number, gpu: boolean): number {
    out.length = 0;
    const s = this.scratch;
    s.length = 0;
    for (const e of this.entries.values()) {
      if (gpu ? e.state === ST_READY && e.refs <= 0 && e.gpuBytes > 0 : e.raw !== null && e.state === ST_READY) s.push(e);
    }
    s.sort(byLastUse);
    let sum = 0;
    for (let i = 0; i < s.length && sum < need; i++) {
      out.push(s[i].key);
      sum += gpu ? s[i].gpuBytes : s[i].bytes;
    }
    s.length = 0;
    return sum;
  }

  /** 예산을 넘으면 처리기 dispose 로 GPU 를 내리고(값은 남김) 받은 바이트를 버린다. 내린 항목 수를 돌려준다 */
  trim(out: string[] = []): number {
    let n = 0;
    const st = this.stats;
    if (st.gpuBytes > this.gpuBudget) {
      this.gpuCandidates(out, st.gpuBytes - this.gpuBudget);
      for (const k of out) {
        const e = this.entries.get(k)!;
        e.h.dispose?.(e.value, e.key);
        st.gpuBytes -= e.gpuBytes;
        e.state = ST_EVICTED;
        st.evicted++;
        n++;
      }
    }
    if (st.rawBytes > this.byteBudget) {
      this.byteCandidates(out, st.rawBytes - this.byteBudget);
      for (const k of out) {
        const e = this.entries.get(k)!;
        e.raw = null;
        st.rawBytes -= e.bytes;
        n++;
      }
    }
    out.length = 0;
    return n;
  }

  /** 개발 패널·시험용(할당함) */
  snapshot(): { key: string; kind: string; state: string; pri: number; refs: number; bytes: number; gpuBytes: number }[] {
    return [...this.entries.values()].map((e) => ({ key: e.key, kind: e.kind, state: STATE_NAMES[e.state], pri: e.pri, refs: e.refs, bytes: e.bytes, gpuBytes: e.gpuBytes }));
  }

  // ---------------------------------------------------------------- 내부(항목 콜백이 부름)

  private request(e: Entry, pri: number, owner?: string): void {
    this.stats.requested++;
    e.lastUse = ++this.useClock;
    if (owner !== undefined) {
      let set = this.owners.get(owner);
      if (!set) this.owners.set(owner, (set = new Set()));
      if (!set.has(e)) {
        set.add(e);
        e.refs++;
      }
    }
    if (e.state === ST_IDLE) {
      e.pri = pri;
      e.state = ST_QUEUED;
      if (pri === P0) this.stats.p0Active++;
      e.qGen++;
      this.fetchQ[pri].push(e, e.qGen);
      this.pump();
      return;
    }
    if (e.state === ST_EVICTED) {
      e.pri = pri;
      this.afterDecode(e);
      return;
    }
    this.raiseEntry(e, pri);
  }

  private raiseEntry(e: Entry, pri: number): void {
    if (pri >= e.pri) return;
    if (isActive(e.state) && pri === P0) this.stats.p0Active++;
    e.pri = pri;
    if (e.state === ST_QUEUED) {
      e.qGen++;
      this.fetchQ[pri].push(e, e.qGen);
      this.pump();
    } else if (e.inDecodeQ) {
      e.qGen++;
      this.decodeQ[pri].push(e, e.qGen);
      this.pump();
    } else if (e.state === ST_UPLOADING) this.scheduler.raise(e, pri);
  }

  private pickFrom(q: Ring<Entry>[]): Entry | null {
    const low = this.stats.p0Active === 0;
    for (let p = 0; p < 4; p++) {
      if (p >= P2 && !low) return null;
      const ring = q[p];
      while (ring.size) {
        const tag = ring.peekTag();
        const e = ring.shift()!;
        if (e.pri === p && e.qGen === tag) return e;
      }
    }
    return null;
  }

  private pump(): void {
    const st = this.stats;
    while (st.inflight < this.maxFetch) {
      const e = this.pickFrom(this.fetchQ);
      if (!e) break;
      if (e.state !== ST_QUEUED) continue;
      this.startFetch(e);
    }
    while (st.inflightDecode < this.maxDecode) {
      const e = this.pickFrom(this.decodeQ);
      if (!e) break;
      if (!e.inDecodeQ) continue;
      this.startDecode(e);
    }
  }

  private startFetch(e: Entry): void {
    const st = this.stats;
    e.state = ST_FETCHING;
    st.inflight++;
    st.fetchStarted++;
    st.startedByPri[e.pri]++;
    if (st.inflight > st.maxInflight) st.maxInflight = st.inflight;
    let p: Promise<unknown>;
    try {
      e.url = this.o.resolve(e.key, e.kind);
      p = e.h.fetch(e.url, e.key, this.o.env.io ?? null);
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(e.onFetched, e.onFetchFail);
  }

  /** @internal */
  fetched(e: Entry, raw: unknown): void {
    const st = this.stats;
    st.inflight--;
    st.fetched++;
    e.raw = raw;
    e.bytes = e.h.bytes?.(raw) ?? 0;
    st.bytes += e.bytes;
    if (e.h.decode) {
      e.state = ST_DECODING;
      e.inDecodeQ = true;
      e.qGen++;
      this.decodeQ[e.pri].push(e, e.qGen);
    } else {
      e.value = raw;
      this.keepOrDrop(e);
      this.afterDecode(e);
    }
    this.pump();
  }

  private startDecode(e: Entry): void {
    e.inDecodeQ = false;
    this.stats.inflightDecode++;
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(e.h.decode!(e.raw, e.key, e.url));
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(e.onDecoded, e.onDecodeFail);
  }

  /** @internal */
  decoded(e: Entry, v: unknown): void {
    this.stats.inflightDecode--;
    this.stats.decoded++;
    e.value = v;
    this.keepOrDrop(e);
    this.afterDecode(e);
    this.pump();
  }

  private keepOrDrop(e: Entry): void {
    if (e.h.keepRaw && e.raw !== null) this.stats.rawBytes += e.bytes;
    else e.raw = null;
  }

  private afterDecode(e: Entry): void {
    e.gpuBytes = e.h.gpuBytes?.(e.value) ?? 0;
    if (e.h.upload) {
      if (e.state !== ST_UPLOADING) {
        if (e.state === ST_EVICTED && e.pri === P0) this.stats.p0Active++;
        e.state = ST_UPLOADING;
        e.step = 0;
        this.scheduler.add(e, e.pri);
      }
      return;
    }
    if (e.state === ST_EVICTED && e.pri === P0) this.stats.p0Active++;
    this.finish(e);
  }

  /** @internal */
  runUpload(e: Entry): number {
    if (e.state !== ST_UPLOADING) return RUN_DONE;
    let r: number;
    try {
      r = e.h.upload!(e.value, e.step, e.key);
    } catch (err) {
      this.failed(e, err, false, false);
      return RUN_DONE;
    }
    if (r === RUN_MORE) e.step++;
    else if (r === RUN_DONE) this.finish(e);
    return r;
  }

  private finish(e: Entry): void {
    const st = this.stats;
    if (e.pri === P0 && isActive(e.state)) st.p0Active--;
    e.state = ST_READY;
    st.ready++;
    st.gpuBytes += e.gpuBytes;
    const res = e.res;
    e.res = e.rej = null;
    res?.(e.value);
  }

  /** @internal */
  failed(e: Entry, err: unknown, inFetch: boolean, inDecode: boolean): void {
    const st = this.stats;
    if (inFetch) st.inflight--;
    if (inDecode) st.inflightDecode--;
    if (e.pri === P0 && isActive(e.state)) st.p0Active--;
    e.state = ST_FAILED;
    e.error = err;
    e.inDecodeQ = false;
    st.failed++;
    const rej = e.rej;
    e.res = e.rej = null;
    rej?.(err);
    this.pump();
  }
}

export function createAssetManager(o: AssetManagerOptions): AssetManager {
  return new AssetManager(o);
}

// ---------------------------------------------------------------- 형식과 무관한 처리기

function mustIo(io: AssetIo | null): AssetIo {
  if (!io) throw new Error('assetcore: env.io 가 없다');
  return io;
}

async function okResponse(io: AssetIo | null, url: string): Promise<FetchLike> {
  const r = await mustIo(io).fetch(url);
  if (!r.ok) throw new Error(`assetcore: 받기 실패 ${r.status} ${url}`);
  return r;
}

/** json 객체(공유 — 쓰는 쪽은 고치지 않는다) */
export function jsonHandler(kind = 'json'): AssetHandler<unknown, unknown> {
  return { kind, fetch: (url, _k, io) => okResponse(io, url).then((r) => r.json()) };
}

/** 받은 바이트 그대로(ArrayBuffer — 쓰는 쪽이 떼어 가면(decodeAudioData 등) 복사해서 쓴다) */
export function bytesHandler(kind = 'bytes'): AssetHandler<ArrayBuffer, ArrayBuffer> {
  return { kind, fetch: (url, _k, io) => okResponse(io, url).then((r) => r.arrayBuffer()), bytes: (b) => b.byteLength, keepRaw: false };
}

export function textHandler(kind = 'text'): AssetHandler<string, string> {
  return { kind, fetch: (url, _k, io) => okResponse(io, url).then((r) => r.text()), bytes: (s) => s.length };
}
