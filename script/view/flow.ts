/**
 * 흐름 예측 미리 받기 — 화면이 들어올 때(enter)·지금 상태를 알릴 때(state) 흐름 표(flowTable.ts)대로 묶음을 관리자에 요청한다.
 * 설계: docs/engine/loader_manager.md §13. 자기 묶음은 P0, 예측은 표의 등급(P2·P3) — 같은 묶음은 올리기만. lite(데이터 절약·느린 망)면 next 표시만.
 * 예측은 자기 묶음 키가 정해져 P0 로 요청된 뒤에 낸다 — 그 사이 P0 가 비는 틈에 P2·P3 명세 json 이 먼저 시작하지 않게.
 * 표의 예측은 등급 순으로 낸다(P2 묶음이 다 준비된 뒤 P3) — 코어는 P2 가 받는 중이어도 P3 를 시작하므로 다음 화면이 두 화면 뒤와 망을 나눠 쓰지 않게.
 * 묶음 키 목록은 주입한 catalog 가 명세 json 을 관리자 json(그 묶음 등급)으로 읽어 만든다. 관리자 밖 의존 없음(노드 시험 tools/test_prefetch.ts).
 * 사건(on): enter·predict·ready — [plaza-gl] 광장 GPU 미리 준비가 ready('plaza:p0') 에 맞춰 시작한다(§13.6).
 */
import { P0, type AssetManagerApi } from '@game/lib/assetcore';
import { FLOW_TABLE, type FlowEntry, type FlowScreen } from './flowTable';

export type FlowKeys = readonly (readonly [key: string, kind: string])[];
export type FlowJson = <T>(key: string) => Promise<T>;
/** 묶음 이름 → 키 목록(모르는 이름 = null) */
export type FlowCatalog = (bundle: string, json: FlowJson) => Promise<FlowKeys | null>;
export type FlowMode = 'full' | 'lite' | 'off';

export type FlowEvent =
  | { type: 'enter'; screen: FlowScreen }
  | { type: 'predict'; screen: FlowScreen; bundle: string; pri: number }
  | { type: 'ready'; bundle: string }
  | { type: 'hint'; key: string; value: string };

export interface FlowOptions {
  catalog: FlowCatalog;
  mode(): FlowMode;
  /** 'game:<이름>' 묶음을 요청할 때 코드 청크 받기 */
  loadCode?(bundle: string): void;
  table?: Readonly<Record<FlowScreen, FlowEntry>>;
}

type Manager = Pick<AssetManagerApi, 'get' | 'want' | 'raise' | 'state' | 'defineBundle'>;

export class FlowPrefetch {
  screen: FlowScreen | null = null;
  readonly hints = new Map<string, string>();
  private readonly keys = new Map<string, FlowKeys>();
  private readonly resolving = new Map<string, Promise<FlowKeys | null>>();
  private readonly specKeys = new Map<string, Set<string>>();
  private readonly pri = new Map<string, number>();
  private readonly readyP = new Map<string, Promise<void>>();
  private readonly subs = new Set<(e: FlowEvent) => void>();
  private readonly table: Readonly<Record<FlowScreen, FlowEntry>>;
  private gen = 0;
  /** 시험·개발: 묶음 요청 기록 [묶음, 등급] */
  readonly requests: [string, number][] = [];

  constructor(
    readonly mgr: Manager,
    private readonly o: FlowOptions,
  ) {
    this.table = o.table ?? FLOW_TABLE;
  }

  on(fn: (e: FlowEvent) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  keysOf(bundle: string): FlowKeys | undefined {
    return this.keys.get(bundle);
  }

  priority(bundle: string): number {
    return this.pri.get(bundle) ?? -1;
  }

  /** 묶음 키가 정해질 때까지 기다린다(모르는 묶음 = null) */
  resolve(bundle: string): Promise<FlowKeys | null> {
    const k = this.keys.get(bundle);
    return k ? Promise.resolve(k) : (this.resolving.get(bundle) ?? Promise.resolve(null));
  }

  /** 화면 진입: 자기 묶음 P0, 그다음 표의 예측. vars.chars = '{chars}' 자리 */
  enter(screen: FlowScreen, vars: { chars?: readonly string[] } = {}): void {
    this.screen = screen;
    const gen = ++this.gen;
    const e = this.table[screen];
    const own = e.own.flatMap((b) => expand(b, vars.chars));
    for (const name of own) this.request(name, P0, screen);
    this.emit({ type: 'enter', screen });
    const mode = this.o.mode();
    if (mode === 'off') return;
    const list = e.predict.filter((p) => mode === 'full' || p.next);
    void Promise.all(own.map((n) => this.resolve(n))).then(async () => {
      for (const pri of [...new Set(list.map((p) => p.pri))].sort((a, b) => a - b)) {
        if (gen !== this.gen) return;
        const now = list.filter((p) => p.pri === pri);
        for (const p of now) this.request(p.bundle, p.pri, screen);
        await Promise.all(now.map((p) => this.whenReady(p.bundle)));
      }
    });
  }

  /** 묶음 키 전부 준비(받기 + CPU 풀기). 키를 못 정하거나 실패하면 그냥 끝난다 */
  whenReady(bundle: string): Promise<void> {
    return this.resolve(bundle).then(() => this.readyP.get(bundle) ?? undefined);
  }

  /** 지금 화면의 상태 알림(커서·결정 등). 다른 화면이면 무시 */
  state(screen: FlowScreen, name: string, value: string | readonly string[]): void {
    if (screen !== this.screen) return;
    const mode = this.o.mode();
    if (mode === 'off') return;
    const st = this.table[screen].states;
    if (!st) return;
    for (const v of typeof value === 'string' ? [value] : value) {
      const list = st[`${name}:${v}`] ?? st[`${name}:*`] ?? [];
      for (const p of list) if (mode === 'full' || p.next) this.request(p.bundle.replace('{v}', v), p.pri, screen);
    }
  }

  /** 받기와 무관한 알림(예: 'chara1P' = 캐릭터 선택에서 고른 1P 캐릭터 — 광장 GPU 미리 준비가 그 재질을 컴파일) */
  hint(key: string, value: string): void {
    this.hints.set(key, value);
    this.emit({ type: 'hint', key, value });
  }

  /** 묶음 요청(올리기만). 키를 모르면 catalog 로 정한 뒤 */
  request(bundle: string, pri: number, screen: FlowScreen | null = this.screen): void {
    const prev = this.pri.get(bundle);
    if (prev !== undefined && prev <= pri) return;
    this.pri.set(bundle, pri);
    this.requests.push([bundle, pri]);
    if (bundle.startsWith('game:')) this.o.loadCode?.(bundle);
    const keys = this.keys.get(bundle);
    if (keys) {
      this.apply(bundle, keys, pri, screen);
      return;
    }
    const spec = this.specKeys.get(bundle);
    if (spec) for (const k of spec) this.mgr.raise(k, pri);
    if (this.resolving.has(bundle)) return;
    const seen = new Set<string>();
    this.specKeys.set(bundle, seen);
    const json: FlowJson = <T>(key: string): Promise<T> => {
      seen.add(key);
      return this.mgr.get<T>(key, 'json', this.pri.get(bundle) ?? pri);
    };
    const r = this.o
      .catalog(bundle, json)
      .catch((err: unknown) => {
        console.warn(`flow: 묶음 ${bundle} 키를 정하지 못했다`, err);
        return null;
      })
      .then((k) => {
        this.resolving.delete(bundle);
        if (!k) return null;
        const seenKey = new Set<string>();
        k = k.filter((x) => !seenKey.has(x[0]) && !!seenKey.add(x[0]));
        this.keys.set(bundle, k);
        this.mgr.defineBundle(
          bundle,
          k.map((x) => x[0]),
          k.map((x) => x[1]),
        );
        this.apply(bundle, k, this.pri.get(bundle) ?? pri, screen);
        return k;
      });
    this.resolving.set(bundle, r);
  }

  private apply(bundle: string, keys: FlowKeys, pri: number, screen: FlowScreen | null): void {
    for (const [k, kind] of keys) {
      try {
        this.mgr.want(k, kind, pri);
      } catch (err) {
        console.warn(`flow: ${bundle} 의 ${k} 를 요청하지 못했다`, err);
      }
    }
    if (pri > P0 && screen) this.emit({ type: 'predict', screen, bundle, pri });
    if (this.readyP.has(bundle)) return;
    const all: Promise<unknown>[] = [];
    for (const [k, kind] of keys) {
      try {
        all.push(this.mgr.get(k, kind, this.pri.get(bundle) ?? pri));
      } catch (err) {
        all.push(Promise.reject(err));
      }
    }
    this.readyP.set(
      bundle,
      Promise.all(all).then(
        () => this.emit({ type: 'ready', bundle }),
        () => undefined,
      ),
    );
  }

  private emit(e: FlowEvent): void {
    for (const fn of this.subs) {
      try {
        fn(e);
      } catch {
        /* 구독 쪽 오류는 흐름을 멈추지 않는다 */
      }
    }
  }
}

function expand(name: string, chars: readonly string[] | undefined): string[] {
  if (!name.includes('{chars}')) return [name];
  return [...new Set(chars ?? [])].map((c) => name.replace('{chars}', c));
}
