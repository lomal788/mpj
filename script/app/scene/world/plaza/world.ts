/**
 * 광장 무대 — MapStructure.json(manifest.plaza.layout) 대로 모델을 올리고, 부착(hookKey/hookNode)·기본 애니·장식 보임·충돌을 맞춘다.
 * 원본: menu00::MapManager::Create(디컴파일 실패, 표 = MapStructure.json [데이터])·ApplyDecoItem @0x71000148f0·ApplyBgBd @0x71000197e0·
 * GetAttachSocketPc* @0x710001b2b4~·GetCollisionModel @0x710001bec4 (docs/shell/plaza_3d.md §6.5~6.7).
 * 장식 모델은 보일 때만 읽는다 [설계: 처음 로드 줄이기].
 * 단계 로딩(docs/engine/loader_manager.md §11.4): 로더 관리자가 있으면 plaza_first.json(tools/plaza_first.ts)로 P0(처음 보이는 것·로케이터·부착 부모)/
 * P1(시작에서 40 m 안, 거리순)/P3(그 밖)을 정해 모든 모델을 한꺼번에 요청하고 P0 만 기다린다. 모델은 GPU 준비가 끝난 뒤에만 보인다.
 * 늦게 나온 모델의 기본 클립·fmab 은 무대 시작부터 돌았을 프레임으로 맞춘다. 1P 가 다가가면(0.5 s 마다 25 m) 그 모델을 P0 로 올린다.
 * 미리 준비(loader_manager.md §14.5): 앱 수명 렌더러(gpu, 없으면 무대가 캔버스에 새로 만듦)·등급 바닥(floor — 미리 준비 = P2, 관리자 요청을 바닥보다 높게
 *   부르지 않음, 진입 때 lower)·조립 속도 조절(pace — 모델 조립 전에 기다림, 미리 준비 = 프레임마다 하나, null 이면 바로)·GPU 준비 예산(budgetMs,
 *   기본 LOAD_BUDGET_MS)을 받는다.
 */
import * as THREE from 'three';
import { P0, P1, P3 } from '@game/lib/assetcore';
import type { PrepJob } from '@game/lib/assetcore-three';
import { LOAD_BUDGET_MS, MeshCollider, Stage3D, type PriorityFloor, type StageGpu, type AssetSource, type ClipHandle, type ClipOptions, type Collider, type MeshColliderData, type SocketPose, type StageLoader, type StageModel } from '@app/common/render3d';
import { KIND_GLTF, KIND_JSON, KIND_TEXTURE } from '@app/common/render3d/assetHandlers';
import { decoVisible, defaultDecoState } from './deco';
import { loadPlazaActorWorld, type PlazaActorWorld } from './actor-world';
import type { PlazaCameraParam, PlazaDecoState, PlazaLayoutEntry, PlazaWorld } from './types';

export interface PlazaWorldOptions {
  canvas: HTMLCanvasElement;
  /** web/assets/plaza/world/ 기준 */
  assets: AssetSource;
  deco?: Partial<PlazaDecoState>;
  /** P0 진행만(n/total = 충돌 + P0 모델) */
  onProgress?(n: number, total: number, what: string): void;
  /** 로더 관리자(없으면 지금처럼 차례로 전부 읽고 끝에 보이기) */
  loader?: StageLoader;
  /** 'seq' = 이전 방식 재현(모든 모델 P0·차례 받기·끝에 한꺼번에 보이기) — 실측 비교용 ?loader=seq */
  loadMode?: 'staged' | 'seq';
  gpu?: StageGpu;
  floor?: PriorityFloor;
  budgetMs?: number;
  pace?: () => Promise<void> | null;
  /** glb 안 텍스처도 관리자를 지남(압축 모드) — 그러면 모델 텍스처를 모델 등급으로 미리 받는다 */
  gltfTextures?: boolean;
}

/** tools/plaza_first.ts 출력 */
export interface PlazaFirstFile {
  v: number;
  first: string[];
  hosts: string[];
  bounds: Record<string, [number, number, number, number]>;
  start: [number, number, number];
  /** 모델(fmdb) → glb 가 참조하는 텍스처 png(미리 받기 대상) */
  tex?: Record<string, string[]>;
}

/** P1 경계(시작에서 거리 − 반지름, m)·올리기 거리·올리기 주기(원본 프레임) [추정 — loader_manager.md §10 6] */
export const P1_RANGE = 40;
export const RAISE_RANGE = 25;
export const RAISE_PERIOD = 30;
/** 첫 화면에 안 보이면 거리와 무관하게 P3(상점 — 사용자 지시 묶음 표) */
export const P3_KEYS = /^Shop/;

export interface PlazaDefaultAnim {
  kind: 'clip' | 'fmab';
  name: string;
  loop: boolean;
  speed: number;
  frame: number;
}

interface PlazaManifestExt {
  layout: PlazaLayoutEntry[];
  /** MapStructure 밖이지만 무대가 늘 올리는 것: 장식 NPC C 비행 경로 air_npc03~05(AttachLocaterDecoNpc/attach_air_npc03~05, 뼈 npc03~05_anim) [판독 C 갈래 §6.11 표] */
  extraLayout?: PlazaLayoutEntry[];
  cameraParam: PlazaCameraParam;
  collision: string;
  defaultAnims: Record<string, PlazaDefaultAnim[]>;
}

/**
 * 광장 단계 로딩 계획(순수 함수 — 시험용으로 밖에 둠): P0 = (처음 보이는 것 ∪ 로케이터) ∩ 필요 + 부착 부모, 나머지 = 상점이 아니고 시작에서
 * (거리 − 반지름) ≤ P1_RANGE 면 P1, 아니면 P3. 부착 부모는 자식 등급 이상으로 올림. 순서 = 등급, 같은 등급은 거리순.
 */
export function plazaPlan(list: readonly PlazaLayoutEntry[], byKey: ReadonlyMap<string, PlazaLayoutEntry>, f: PlazaFirstFile): { pri: Map<string, number>; order: PlazaLayoutEntry[] } {
  const pri = new Map<string, number>();
  const want = new Set(list.map((e) => e.key));
  const p0 = new Set<string>();
  const add = (k: string): void => {
    if (!want.has(k) || p0.has(k)) return;
    p0.add(k);
    const h = byKey.get(k)?.hookKey;
    if (h) add(h);
  };
  for (const k of [...f.first, ...f.hosts]) add(k);
  const [sx, sy, sz] = f.start;
  const dist = (k: string): number => {
    const b = f.bounds[k];
    return b ? Math.max(0, Math.hypot(b[0] - sx, b[1] - sy, b[2] - sz) - b[3]) : 0;
  };
  for (const e of list) pri.set(e.key, p0.has(e.key) ? P0 : P3_KEYS.test(e.key) || dist(e.key) > P1_RANGE ? P3 : P1);
  for (const e of list) {
    let h = e.hookKey;
    const pr = pri.get(e.key)!;
    while (h) {
      if ((pri.get(h) ?? P3) > pr) pri.set(h, pr);
      h = byKey.get(h)?.hookKey ?? '';
    }
  }
  return { pri, order: [...list].sort((a, b) => pri.get(a.key)! - pri.get(b.key)! || dist(a.key) - dist(b.key)) };
}

/**
 * 광장 진입 전 미리 받기용 P0 목록(loader_manager.md §13.3) — World.needed·plan·assetKeysOf·defineBundles(plaza:p0)와 같은 규칙을 무대 없이.
 * 돌려주는 경로는 plaza/world/ 기준: 충돌·plaza_first.json(json) + P0 모델 glb(gltf) + withTex 면 glb 참조 텍스처(texture).
 */
export function plazaP0Paths(
  models: Readonly<Record<string, { url: string }>>,
  ext: { layout: readonly PlazaLayoutEntry[]; extraLayout?: readonly PlazaLayoutEntry[]; collision: string },
  first: PlazaFirstFile,
  deco: PlazaDecoState,
  withTex: boolean,
): [string, string][] {
  const all = [...ext.layout, ...(ext.extraLayout ?? [])];
  const byKey = new Map(all.map((e) => [e.key, e]));
  const isModel = (e: PlazaLayoutEntry): boolean => e.dir === 'model' && !!models[e.fmdb];
  const want = new Set<string>();
  const add = (k: string): void => {
    const e = byKey.get(k);
    if (!e || want.has(k) || !isModel(e)) return;
    want.add(k);
    if (e.hookKey) add(e.hookKey);
  };
  for (const e of all) if (isModel(e) && decoVisible(e, deco)) add(e.key);
  const r = plazaPlan(
    all.filter((e) => want.has(e.key)),
    byKey,
    first,
  );
  const out: [string, string][] = [
    [ext.collision, KIND_JSON],
    ['plaza_first.json', KIND_JSON],
  ];
  for (const e of r.order) {
    if (r.pri.get(e.key) !== P0) continue;
    out.push([models[e.fmdb].url, KIND_GLTF]);
    if (withTex) for (const t of first.tex?.[e.fmdb] ?? []) out.push([`tex/${t}`, KIND_TEXTURE]);
  }
  return out;
}

class OffCollider implements Collider {
  groundHeight(): null {
    return null;
  }
  collide(_pos: THREE.Vector3, move: THREE.Vector3): THREE.Vector3 {
    return move.clone();
  }
}

class World implements PlazaWorld {
  actorWorld?: PlazaActorWorld;
  readonly deco: PlazaDecoState;
  readonly anims = new Map<string, ClipHandle[]>();
  private readonly models = new Map<string, StageModel>();
  private readonly loading = new Map<string, Promise<StageModel | null>>();
  private readonly loaded = new Map<string, Promise<StageModel>>();
  private readonly colliders = new Map<string, MeshCollider>();
  private readonly enabled = new Set<string>(['CollisionMain']);
  private readonly off = new OffCollider();
  private readonly byKey: Map<string, PlazaLayoutEntry>;
  private readonly ready = new Set<string>();
  private readonly pri = new Map<string, number>();
  private readonly jobs = new Map<string, PrepJob>();
  private readonly assetKeys = new Map<string, string[]>();
  private readonly frame0: number;
  private nearKeys: string[] = [];
  private nearB = new Float32Array(0);
  private nearLeft = new Uint8Array(0);
  private focus: THREE.Vector3 | null = null;
  private acc = 0;
  private stagedAt = { p0: 0, p0Ms: 0, allMs: 0, t0: 0, raised: 0, planned: false };
  private rest: { first: PlazaFirstFile; order: PlazaLayoutEntry[] } | null = null;
  private firstTex: Record<string, string[]> | null = null;
  collider: Collider;

  constructor(
    readonly stage: Stage3D,
    private readonly ext: PlazaManifestExt,
    deco: PlazaDecoState,
    private readonly opts: Pick<PlazaWorldOptions, 'loadMode' | 'gltfTextures' | 'pace'> = {},
  ) {
    this.deco = deco;
    this.collider = this.off;
    this.byKey = new Map([...ext.layout, ...(ext.extraLayout ?? [])].map((e) => [e.key, e]));
    this.frame0 = stage.frame;
  }

  get layout(): readonly PlazaLayoutEntry[] {
    return this.ext.layout;
  }

  get cameraParam(): PlazaCameraParam {
    return this.ext.cameraParam;
  }

  get frame(): number {
    return this.stage.frame;
  }

  private isModel(e: PlazaLayoutEntry): boolean {
    return e.dir === 'model' && !!this.stage.manifest.models[e.fmdb];
  }

  /** 보일 항목 + 그 부착 대상(보이지 않아도 뼈 위치가 필요) */
  private needed(): PlazaLayoutEntry[] {
    const want = new Set<string>();
    const add = (k: string): void => {
      const e = this.byKey.get(k);
      if (!e || want.has(k) || !this.isModel(e)) return;
      want.add(k);
      if (e.hookKey) add(e.hookKey);
    };
    const all = [...this.ext.layout, ...(this.ext.extraLayout ?? [])];
    for (const e of all) if (this.isModel(e) && decoVisible(e, this.deco)) add(e.key);
    return all.filter((e) => want.has(e.key));
  }

  private async json<T>(path: string): Promise<T | null> {
    const l = this.stage.assetLoader;
    if (l) return l.manager.get<T>(l.key(path), KIND_JSON, this.stage.floor.key(l.key(path), P0), l.owner).catch(() => null);
    const r = await fetch(this.stage.assetUrl(path));
    return r.ok ? ((await r.json()) as T) : null;
  }

  async load(onProgress?: PlazaWorldOptions['onProgress']): Promise<void> {
    const t0 = performance.now();
    this.stagedAt.t0 = t0;
    const list = this.needed();
    const l = this.stage.assetLoader;
    const [col, first] = await Promise.all([
      this.json<Record<string, MeshColliderData>>(this.ext.collision),
      l && this.opts.loadMode !== 'seq' ? this.json<PlazaFirstFile>('plaza_first.json') : Promise.resolve(null),
    ]);
    if (!col) throw new Error('광장 충돌 데이터를 읽지 못했다');
    for (const [k, v] of Object.entries(col)) this.colliders.set(k, new MeshCollider(v));
    this.actorWorld = await loadPlazaActorWorld(path => this.stage.assetUrl(path));
    this.refreshCollider();
    this.stagedAt.planned = !!first;
    if (!first) {
      const total = list.length + 1;
      let n = 0;
      onProgress?.(++n, total, 'collision');
      for (const e of list) {
        this.pri.set(e.key, P0);
        await this.ensure(e.key, P0, false);
        onProgress?.(++n, total, e.key);
      }
      for (const e of list) this.ready.add(e.key);
      this.applyVisibility();
      this.stagedAt.p0 = list.length;
      this.stagedAt.p0Ms = this.stagedAt.allMs = performance.now() - t0;
      return;
    }
    this.firstTex = first.tex ?? null;
    const order = this.plan(list, first);
    for (const e of order) this.assetKeysOf(e);
    this.defineBundles(order);
    const p0 = order.filter((e) => this.pri.get(e.key) === P0);
    for (const e of p0) this.want(e, P0);
    const total = p0.length + 1;
    let n = 0;
    onProgress?.(++n, total, 'collision');
    await Promise.all(p0.map((e) => this.ensure(e.key, P0).then(() => onProgress?.(++n, total, e.key))));
    this.stagedAt.p0 = p0.length;
    this.stagedAt.p0Ms = performance.now() - t0;
    this.rest = { first, order: order.filter((e) => this.pri.get(e.key) !== P0) };
  }

  /** P1·P3 뒤 받기 시작(첫 화면 뒤 — 부품 생성이 망을 쓰는 동안 다투지 않게, loader_manager.md §11.4) */
  startBackground(): void {
    const r = this.rest;
    if (!r) return;
    this.rest = null;
    for (const e of r.order) this.want(e, this.pri.get(e.key) ?? P1);
    const t0 = this.stagedAt.t0;
    const all = r.order.map((e) => this.ensure(e.key, this.pri.get(e.key) ?? P1).catch((err: unknown) => console.warn(`광장 모델 뒤 읽기 실패: ${e.key}`, err)));
    this.watchNear(r.first, r.order);
    void Promise.all(all).then(() => (this.stagedAt.allMs = performance.now() - t0));
  }

  private plan(list: PlazaLayoutEntry[], f: PlazaFirstFile): PlazaLayoutEntry[] {
    const r = plazaPlan(list, this.byKey, f);
    for (const [k, v] of r.pri) this.pri.set(k, v);
    return r.order;
  }

  /** 항목의 관리자 키(glb + 압축 모드면 모델 텍스처) — 한 번 만들어 둔다 */
  private assetKeysOf(e: PlazaLayoutEntry): string[] {
    let keys = this.assetKeys.get(e.key);
    const l = this.stage.assetLoader;
    const info = this.stage.manifest.models[e.fmdb];
    if (keys || !l || !info) return keys ?? [];
    keys = [l.key(info.url)];
    if (this.opts.gltfTextures) for (const t of this.firstTex?.[e.fmdb] ?? []) keys.push(l.key(`tex/${t}`));
    this.assetKeys.set(e.key, keys);
    return keys;
  }

  /** 모델 glb(+ 압축 모드면 텍스처)를 등급으로 미리 요청 */
  private want(e: PlazaLayoutEntry, pr: number): void {
    const l = this.stage.assetLoader;
    const keys = this.assetKeysOf(e);
    if (!l || !keys.length) return;
    const f = this.stage.floor;
    l.manager.want(keys[0], KIND_GLTF, f.key(keys[0], pr), l.owner);
    for (let i = 1; i < keys.length; i++) l.manager.want(keys[i], KIND_TEXTURE, f.key(keys[i], pr), l.owner);
  }

  /** 묶음 plaza:p0·p1·p3(관리자 진행 조회용 — 요청은 want 가 이미 함) */
  private defineBundles(order: PlazaLayoutEntry[]): void {
    const l = this.stage.assetLoader;
    if (!l) return;
    for (const [name, pr] of [['plaza:p0', P0], ['plaza:p1', P1], ['plaza:p3', P3]] as const) {
      const keys: string[] = pr === P0 ? [l.key(this.ext.collision), l.key('plaza_first.json')] : [];
      const kinds: string[] = pr === P0 ? [KIND_JSON, KIND_JSON] : [];
      for (const e of order) {
        if (this.pri.get(e.key) !== pr) continue;
        (this.assetKeys.get(e.key) ?? []).forEach((k, i) => {
          keys.push(k);
          kinds.push(i === 0 ? KIND_GLTF : KIND_TEXTURE);
        });
      }
      l.manager.defineBundle(name, keys, kinds);
    }
  }

  /** 다가가면 올리기 준비: P0 아닌 모델의 경계 구를 배열로(할당은 여기서 한 번) */
  private watchNear(f: PlazaFirstFile, order: PlazaLayoutEntry[]): void {
    const keys = order.filter((e) => this.pri.get(e.key) !== P0 && f.bounds[e.key]).map((e) => e.key);
    this.nearKeys = keys;
    this.nearB = new Float32Array(keys.length * 4);
    this.nearLeft = new Uint8Array(keys.length).fill(1);
    keys.forEach((k, i) => this.nearB.set(f.bounds[k], i * 4));
    this.stage.addUpdater({ update: (df) => this.near(df) });
  }

  setFocus(pos: THREE.Vector3): void {
    this.focus = pos;
  }

  private near(df: number): void {
    this.acc += df;
    if (this.acc < RAISE_PERIOD) return;
    this.acc = 0;
    const p = this.focus;
    if (!p) return;
    const b = this.nearB;
    const keys = this.nearKeys;
    for (let i = 0; i < keys.length; i++) {
      if (!this.nearLeft[i]) continue;
      const k = keys[i];
      if (this.ready.has(k)) {
        this.nearLeft[i] = 0;
        continue;
      }
      const dx = b[i * 4] - p.x;
      const dy = b[i * 4 + 1] - p.y;
      const dz = b[i * 4 + 2] - p.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - b[i * 4 + 3] >= RAISE_RANGE) continue;
      this.nearLeft[i] = 0;
      this.raise(k, P0);
      this.stagedAt.raised++;
    }
  }

  /** 항목(과 부착 부모)의 받기·GPU 준비를 올린다(낮추지 않음, 할당 0) */
  private raise(key: string, pr: number): void {
    const cur = this.pri.get(key);
    if (cur !== undefined && cur <= pr) return;
    this.pri.set(key, pr);
    const l = this.stage.assetLoader;
    const keys = this.assetKeys.get(key);
    const f = this.stage.floor;
    if (l && keys) for (let i = 0; i < keys.length; i++) l.manager.raise(keys[i], f.key(keys[i], pr));
    const j = this.jobs.get(key);
    if (j && pr >= f.value) this.stage.preparer.raise(j, pr);
    else if (j) f.jobs.push([j, pr]);
    const h = this.byKey.get(key)?.hookKey;
    if (h) this.raise(h, pr);
  }

  /** 항목 모델을 (아직 없으면) 읽어 부착·기본 애니 → GPU 준비 끝 → 보이기. gate=false 면 보이기는 부른 쪽(이전 방식) */
  ensure(key: string, pri: number = P1, gate = true): Promise<StageModel | null> {
    let p = this.loading.get(key);
    if (p) {
      this.raise(key, pri);
      return p;
    }
    const e = this.byKey.get(key);
    if (!e || !this.isModel(e)) return Promise.resolve(null);
    if (!this.pri.has(key)) this.pri.set(key, pri);
    const lp = this.loadOne(e, pri, gate);
    this.loaded.set(key, lp);
    p = gate
      ? lp.then(async (m) => {
          const job = this.stage.prepareModel(m.root, this.pri.get(key) ?? pri);
          this.jobs.set(key, job);
          await job.promise;
          this.jobs.delete(key);
          this.ready.add(key);
          m.setVisible(decoVisible(e, this.deco));
          return m;
        })
      : lp;
    this.loading.set(key, p);
    return p;
  }

  /** 읽기·부착·기본 애니까지(GPU 준비 전). 부착 자식은 부모의 이 단계만 기다린다 */
  private async loadOne(e: PlazaLayoutEntry, pri: number, gate: boolean): Promise<StageModel> {
    const key = e.key;
    let host: StageModel | null = null;
    if (e.hookKey) {
      void this.ensure(e.hookKey, this.pri.get(key) ?? pri, gate).catch(() => null);
      host = (await this.loaded.get(e.hookKey)) ?? null;
    }
    const wait = this.opts.pace?.();
    if (wait) await wait;
    const m = await this.stage.loadModel(e.fmdb, { visible: false, instance: e.key, pri: this.pri.get(key) ?? pri });
    if (e.hookKey) {
      const node = host?.root.getObjectByName(e.hookNode);
      if (node) node.add(m.root);
      else console.warn(`광장 부착 소켓 없음: ${e.key} → ${e.hookKey}/${e.hookNode}`);
    }
    const handles: ClipHandle[] = [];
    for (const a of this.ext.defaultAnims[e.key] ?? []) {
      const opts = { loop: a.loop, speed: a.speed, startFrame: a.frame };
      const h = a.kind === 'clip' ? m.play(a.name, opts) : await this.stage.playFmab(m.root, a.name, opts);
      if (!h) continue;
      const late = this.stage.frame - this.frame0;
      if (late > 0 && a.speed !== 0) {
        const f = a.frame + late * a.speed;
        h.frame = h.loop && h.frames > 0 ? ((f % h.frames) + h.frames) % h.frames : f;
      }
      handles.push(h);
    }
    this.anims.set(e.key, handles);
    this.models.set(e.key, m);
    return m;
  }

  /** 개발·시험: 단계 로딩 상태 */
  loaderDebug(): Record<string, unknown> {
    const byPri = [0, 0, 0, 0];
    for (const v of this.pri.values()) byPri[v]++;
    let visibleNotReady = 0;
    for (const [k, m] of this.models) {
      if (this.ready.has(k)) continue;
      let o: THREE.Object3D | null = m.root;
      let vis = true;
      while (o) {
        if (!o.visible) vis = false;
        o = o.parent;
      }
      if (vis) visibleNotReady++;
    }
    const l = this.stage.assetLoader;
    const bundles: Record<string, string> = {};
    if (l) for (const b of ['plaza:p0', 'plaza:p1', 'plaza:p3']) bundles[b] = `${l.manager.bundleReady(b)}/${l.manager.bundleSize(b)}`;
    return { mode: l ? (this.opts.loadMode ?? 'staged') : 'none', byPri, ready: this.ready.size, models: this.models.size, visibleNotReady, bundles, ...this.stagedAt };
  }

  private refreshCollider(): void {
    const on = [...this.enabled].map((k) => this.colliders.get(k)).filter((c): c is MeshCollider => !!c);
    this.collider = on.length === 0 ? this.off : on.length === 1 ? on[0] : MeshCollider.merge(on);
    this.stage.setCollider(this.collider);
  }

  private applyVisibility(): void {
    for (const e of [...this.ext.layout, ...(this.ext.extraLayout ?? [])]) if (this.ready.has(e.key)) this.models.get(e.key)?.setVisible(decoVisible(e, this.deco));
  }

  entry(key: string): StageModel | null {
    return this.models.get(key) ?? null;
  }

  socket(name: string): SocketPose | null {
    return this.stage.getSocket(name);
  }

  pcSocket(kind: 'start' | 'balloon' | 'quest_return' | 'datahouse', p: number, pc: number): SocketPose | null {
    return this.socket(`pc_plaza_${kind}_pos_p${p}_pc${String(pc).padStart(2, '0')}`);
  }

  play(key: string, clip: string, opts?: ClipOptions): ClipHandle | null {
    return this.models.get(key)?.play(clip, opts) ?? null;
  }

  setCollisionEnabled(key: 'CollisionMain' | 'CollisionFirst', on: boolean): void {
    if (on) this.enabled.add(key);
    else this.enabled.delete(key);
    this.actorWorld?.setEnabled(key, on);
    this.refreshCollider();
  }

  async setDeco(state: Partial<PlazaDecoState>): Promise<void> {
    if (state.display) this.deco.display = [...state.display];
    if (state.unlockBd !== undefined) this.deco.unlockBd = state.unlockBd;
    await Promise.all(this.needed().map((e) => this.ensure(e.key, P1)));
    this.applyVisibility();
  }

  addUpdater(u: { update(df: number, frame: number): void }): () => void {
    return this.stage.addUpdater(u);
  }
  async settle(): Promise<void> {
    let count = -1;
    while (count !== this.loading.size) {
      count = this.loading.size;
      await Promise.allSettled([...this.loading.values()]);
    }
    await this.stage.preparer.settled;
  }
  disposeActors(): void { this.actorWorld?.dispose(); this.actorWorld = undefined; }
}

/**
 * 소켓 뼈 아래에 붙이되 소켓의 배율은 따르지 않는다(위치·회전만). 원본 MapManager::GetPosFromBone/GetRotFromBone @0x710001b8cc/@0x710001b92c 은
 * BoneSocket 가상 +0x30 (위치, 회전, 배율) 중 위치·회전만 쓴다 [판독]. 로케이터 뼈는 표시용 배율 100(mc_plaza_default_pos·pc_plaza_*)·50(기구 pos_*)을 가진다 [데이터].
 */
export function attachToSocket(node: THREE.Object3D, obj: THREE.Object3D): void {
  node.add(obj);
  node.updateWorldMatrix(true, false);
  const s = new THREE.Vector3();
  node.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  obj.scale.set(1 / (s.x || 1), 1 / (s.y || 1), 1 / (s.z || 1));
}

/** 무대 만들기 → 보이는 모델·충돌·기본 애니 전부 올린 뒤 돌려준다(= 무대 로드 완료) */
export async function createPlazaWorld(opts: PlazaWorldOptions): Promise<PlazaWorld> {
  const stage = await Stage3D.create({ canvas: opts.canvas, assets: opts.assets, loader: opts.loader, gpu: opts.gpu, floor: opts.floor });
  stage.budget(opts.budgetMs ?? LOAD_BUDGET_MS);
  const ext = (stage.manifest as unknown as { plaza: PlazaManifestExt }).plaza;
  if (!ext) { stage.dispose(); throw new Error('광장 manifest 에 plaza 절이 없다'); }
  const deco = defaultDecoState();
  if (opts.deco?.display) deco.display = [...opts.deco.display];
  if (opts.deco?.unlockBd !== undefined) deco.unlockBd = opts.deco.unlockBd;
  const w = new World(stage, ext, deco, { loadMode: opts.loadMode, gltfTextures: opts.gltfTextures, pace: opts.pace });
  try { await w.load(opts.onProgress); }
  catch (error) { await w.settle(); w.disposeActors(); stage.dispose(); throw error; }
  return w;
}
