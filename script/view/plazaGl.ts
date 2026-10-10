/**
 * 앱 수명 공유 렌더러의 광장 대여·캐시(mpj 3층). 설계: docs/engine/render_unify.md §14.
 * - 앱 RenderService의 캔버스·WebGLRenderer를 광장과 게임 호스트가 빌린다. 광장에 들어가면 enter() 가 캔버스를 화면에
 *   붙이고, 나가면 leave() 가 뗀다. 광장 안 UI 도 이 렌더러로 그린다(§14.4). 게임 호스트와 공유하며 메뉴·Lyt도 같은 renderer를 빌린다.
 * - 재진입 때 남는 것(§14.3): leave() 가 부품·무대 dispose 전에 renderer.info.programs 전부를 한 번씩 고정(usedTimes + 1)하고, 무대는 gpu 모드
 *   (StageGpu = 렌더러 + 업로드 기록 + keep)로 관리자 캐시 몫 텍스처·기하를 남긴다. keep = 렌더러 수명 물건(후처리·하늘·IBL·광장 UI 그리기) — 렌더러마다 새로,
 *   drop 때 dispose.
 * - 미리 준비(§14.5): installPlazaGl() 이 [flow-prefetch] 사건을 구독한다. ready('plaza:p0') 이고 광장 밖이면 prewarm() — 광장 world 를 이 렌더러
 *   (prepareQueue의 scratch RT)에 등급 바닥 P2·모델 조립 프레임마다 하나(FramePacer)·스케줄러 예산 PREWARM_BUDGET_MS 로 만들고 후처리 프로그램을 미리 컴파일한다.
 *   enter() 는 미리 만든 world 를 넘기며 promote(바닥 P0·속도 조절 풀기·예산 LOAD) 하고, 없으면 같은 규칙으로 새로 만든다(바닥 없음).
 *   hint('chara1P') 또는 ready('plaza:player:<pc>') 면 world 뒤에 그 캐릭터를 광장 장면에 숨겨 올려 GPU 준비(프로그램 컴파일)해 두고 entered() 때 버린다.
 * - 예산(§14.6): leave() 때 들고 있을 양(광장 장면 텍스처 source 별 + 기하 바이트)이 gpuBudget × KEEP_RATIO 를 넘으면 drop()(광장 keep 정리). 공유 renderer는 종료하지 않는다. 서비스 없는 단독 경로만 dispose + forceContextLoss.
 *   문맥을 잃으면 대여를 무효화하고 준비·출력을 중단한다.
 * - 끄기: ?plazagl=0(페이지가 이 모듈을 안 씀 — 이전 방식 비교), ?loader=seq·?nowarm=1 이면 미리 준비 안 함.
 * - 노드 시험(tools/test_plaza_gl.ts)용으로 캔버스·렌더러·world 만들기·캐릭터 준비·예산을 주입(PlazaGlDeps). world 만들기 규칙은 worldStarter(env) 하나
 *   (env = 모듈·관리자·프레임 tick·에셋 루트) — 기본 env 는 DOM·관리자·광장 코드를 동적 import 한다(진입 청크를 키우지 않게, 노드에서 이 파일을 읽을 수 있게).
 */
import * as THREE from 'three';
import { appRenderService, type RenderLease, type RenderService } from '@app/common/render/service';
import { P0, P2, P3, type AssetManagerApi } from '@game/lib/assetcore';
import { textureBytes, type UploadRecord } from '@game/lib/assetcore-three';
import type { PlazaWorld } from '@app/scene/world/plaza/types';
import type { PrepareScope } from '@app/common/render/prepare';
import type { StageGpu } from '@app/common/render3d';
import { ASSET_MODE, ASSETS } from '../env';

export const PREWARM_BUDGET_MS = 2;
export const KEEP_RATIO = 0.6;
export const GPU_BUDGET_PC = 2e9;
export const GPU_BUDGET_MOBILE = 6e8;

export type Progress = (n: number, total: number, what: string) => void;

export interface WorldStart {
  gpu: StageGpu;
  params: URLSearchParams;
  prewarm: boolean;
  onProgress?: Progress;
}

export interface PlazaWorldJob {
  readonly world: Promise<PlazaWorld>;
  promote(onProgress?: Progress): void;
}

export interface Disposable {
  dispose(): void;
}

export interface PlazaGlDeps {
  service?: RenderService;
  createCanvas(): HTMLCanvasElement;
  createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer;
  startWorld(o: WorldStart): PlazaWorldJob;
  warmChara?(world: PlazaWorld, pc: string): Promise<Disposable | null>;
  gpuBudget(): number;
}

export function plazaGlEnabled(params: URLSearchParams): boolean {
  return params.get('plazagl') !== '0';
}

export function prewarmEnabled(params: URLSearchParams): boolean {
  return plazaGlEnabled(params) && params.get('loader') !== 'seq' && params.get('nowarm') !== '1';
}

export class FramePacer {
  private readonly q: (() => void)[] = [];
  private open = false;
  private pending = false;
  private readonly release: () => void;

  constructor(private readonly tick: (fn: () => void) => void) {
    this.release = () => {
      this.pending = false;
      this.q.shift()?.();
      if (this.q.length) this.kick();
    };
  }

  get waiting(): number {
    return this.q.length;
  }

  wait(): Promise<void> | null {
    if (this.open) return null;
    return new Promise<void>((r) => {
      this.q.push(r);
      this.kick();
    });
  }

  flush(): void {
    this.open = true;
    for (const r of this.q.splice(0)) r();
  }

  private kick(): void {
    if (this.pending) return;
    this.pending = true;
    this.tick(this.release);
  }
}

export function sceneGpuBytes(root: THREE.Object3D): { bytes: number; textures: number; geometries: number } {
  const sources = new Set<unknown>();
  const geos = new Set<THREE.BufferGeometry>();
  let bytes = 0;
  const tex = (t: THREE.Texture): void => {
    if (t.isRenderTargetTexture || sources.has(t.source)) return;
    sources.add(t.source);
    bytes += textureBytes(t);
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
    const g = mesh.geometry;
    if (g && !geos.has(g)) {
      geos.add(g);
      for (const a of Object.values(g.attributes)) bytes += ((a as THREE.BufferAttribute).array as ArrayLike<number> & { byteLength?: number }).byteLength ?? 0;
      bytes += (g.index?.array as { byteLength?: number } | undefined)?.byteLength ?? 0;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) tex(v as THREE.Texture);
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) if ((x?.value as THREE.Texture)?.isTexture) tex(x.value as THREE.Texture);
    }
  });
  return { bytes, textures: sources.size, geometries: geos.size };
}

export class PlazaGl {
  readonly stats = { renderers: 0, enters: 0, prewarms: 0, adopted: 0, fresh: 0, pinned: 0, drops: 0, keptBytes: 0, warmCharas: 0 };
  private canvas_: HTMLCanvasElement | null = null;
  private renderer_: THREE.WebGLRenderer | null = null;
  private uploads: UploadRecord = new WeakMap();
  private keep = new Map<string, unknown>();
  private readonly pinned = new WeakSet<object>();
  private job: PlazaWorldJob | null = null;
  private preparation: PrepareScope | null = null;
  private inPlaza = false;
  private lease: RenderLease | null = null;
  private yielding: Promise<void> | null = null;
  private lost = false;
  private wantPc = '';
  private warmPc = '';
  private warm: Promise<Disposable | null> | null = null;
  private warmCleanup: Promise<void> = Promise.resolve();
  private readonly onLost = (): void => {
    this.lost = true;
  };

  constructor(private readonly deps: PlazaGlDeps) {}

  get contexts(): number {
    return this.renderer_ ? 1 : 0;
  }

  get inside(): boolean {
    return this.inPlaza;
  }

  get prewarming(): boolean {
    return !!this.job;
  }

  async reserve(): Promise<void> {
    if (this.yielding) await this.yielding;
    if (this.deps.service && !this.lease?.valid) this.bindLease(await this.deps.service.acquire('plaza'));
  }

  private bindLease(lease: RenderLease): void {
    this.lease = lease;
    lease.onLost(() => { if (!this.inPlaza) void this.yieldPreparation().catch(console.error); });
  }

  onContextLost(fn: () => void): () => void { return this.lease?.onLost(fn) ?? (() => undefined); }

  yieldForMenu(): Promise<void> {
    return this.preparation ? Promise.resolve() : this.yieldPreparation();
  }

  yieldPreparation(): Promise<void> {
    if (this.inPlaza) return Promise.resolve();
    if (this.yielding) return this.yielding;
    const job = this.job;
    this.job = null;
    const preparation = this.preparation; this.preparation = null; preparation?.cancel();
    const lease = this.lease;
    const warm = this.warm;
    this.warm = null; this.warmPc = this.wantPc = '';
    const task = (async () => {
      try {
        const world = await job?.world.catch(() => null);
        (await warm?.catch(() => null))?.dispose();
        await this.warmCleanup;
        if (world) {
          await world.settle?.();
          this.pin(); world.disposeActors?.(); world.stage.dispose();
        }
      } finally {
        if (this.lease === lease) this.lease = null;
        lease?.release();
      }
    })();
    this.yielding = task;
    void task.finally(() => { if (this.yielding === task) this.yielding = null; }).catch(() => undefined);
    return task;
  }

  get renderer(): THREE.WebGLRenderer {
    if (this.deps.service) {
      this.renderer_ = this.deps.service.renderer; this.canvas_ = this.deps.service.canvas;
      this.uploads = this.deps.service.uploads; this.keep = this.deps.service.keep('plaza');
      return this.renderer_;
    }
    if (!this.renderer_) {
      const c = (this.canvas_ ??= this.deps.createCanvas());
      c.addEventListener?.('webglcontextlost', this.onLost);
      this.renderer_ = this.deps.createRenderer(c);
      this.uploads = new WeakMap();
      this.keep = new Map();
      this.lost = false;
      this.stats.renderers++;
    }
    return this.renderer_;
  }

  get canvas(): HTMLCanvasElement {
    void this.renderer;
    return this.canvas_!;
  }

  gpu(): StageGpu {
    const lease = this.lease, preparation = this.preparation;
    return { ...(preparation ? { preparation } : {}), renderer: this.renderer, uploads: this.uploads, keep: this.keep,
      ...(this.deps.service ? { valid: () => preparation ? preparation.valid() && (!this.inPlaza || !!this.lease?.valid) : !!lease?.valid, resize: (w: number, h: number) => { if (this.inPlaza && this.lease?.valid) this.lease.resize(w, h); }, offscreen: true } : {}) };
  }

  prewarm(params: URLSearchParams): boolean {
    if (this.inPlaza || this.job || this.yielding || !prewarmEnabled(params)) return false;
    if (this.deps.service) {
      if (!this.deps.service.ready) return false;
      void this.renderer;
      const scope = this.deps.service.prepareQueue.create();
      this.preparation = scope;
      scope.signal.addEventListener('abort', () => {
        if (this.preparation === scope && !this.inPlaza) void this.yieldPreparation().catch(console.error);
      }, { once: true });
    }
    if (this.lost) this.drop();
    this.stats.prewarms++;
    const job = this.deps.startWorld({ gpu: this.gpu(), params, prewarm: true });
    this.job = job;
    job.world.catch(() => {
      if (this.job === job) void this.yieldPreparation().catch(console.error);
    });
    this.maybeWarm();
    return true;
  }

  hintChara(pc: string): void {
    if (!pc || this.wantPc) return;
    this.wantPc = pc;
    this.maybeWarm();
  }

  private maybeWarm(): void {
    const job = this.job;
    const warm = this.deps.warmChara;
    if (!job || !warm || !this.wantPc || this.warmPc || this.yielding) return;
    const pc = (this.warmPc = this.wantPc);
    this.stats.warmCharas++;
    this.warm = job.world.then((w) => warm(w, pc)).catch(() => null);
  }

  enter(host: HTMLElement, params: URLSearchParams, onProgress?: Progress): { canvas: HTMLCanvasElement; gpu: StageGpu; world: Promise<PlazaWorld>; prewarmed: boolean } {
    if (this.lost) this.drop();
    this.inPlaza = true;
    this.stats.enters++;
    const canvas = this.canvas;
    if (this.deps.service) {
      this.lease?.assert();
      if (!this.lease) throw new Error('Reserve plaza renderer before enter');
      this.lease.attach(host);
    } else host.append(canvas);
    let job = this.job;
    this.job = null;
    const prewarmed = !!job;
    if (job) {
      job.promote(onProgress);
      this.stats.adopted++;
    } else {
      job = this.deps.startWorld({ gpu: this.gpu(), params, prewarm: false, onProgress });
      this.stats.fresh++;
    }
    return { canvas, gpu: this.gpu(), world: job.world.then(world => { world.stage.activate?.(); return world; }), prewarmed };
  }

  entered(): void {
    const w = this.warm;
    this.warm = null;
    this.warmPc = this.wantPc = '';
    this.warmCleanup = w?.then((x) => x?.dispose()).catch(console.error) ?? Promise.resolve();
  }

  pin(): number {
    const list = this.renderer_?.info.programs ?? [];
    let n = 0;
    for (const p of list) {
      if (this.pinned.has(p)) continue;
      this.pinned.add(p);
      p.usedTimes++;
      n++;
    }
    this.stats.pinned += n;
    return n;
  }

  leave(scene: THREE.Object3D | null, stop: () => void, settled?: Promise<void>): void {
    if (this.deps.service && settled) {
      this.inPlaza = false;
      this.canvas_?.remove();
      const pending = Promise.all([settled.catch(() => undefined), this.warmCleanup]).then(() => this.leave(scene, stop));
      this.yielding = pending;
      void pending.finally(() => {
        if (this.yielding === pending) this.yielding = null;
        if (this.stats.keptBytes > this.deps.gpuBudget() * KEEP_RATIO) this.drop();
      }).catch(console.error);
      return;
    }
    this.pin();
    let kept = scene ? sceneGpuBytes(scene).bytes : 0;
    for (const v of this.keep.values()) {
      const root = v instanceof THREE.Object3D ? v : (v as { r2d?: { scene?: THREE.Object3D } } | null)?.r2d?.scene;
      if (root && root !== scene) kept += sceneGpuBytes(root).bytes;
    }
    try {
      stop();
    } finally {
      this.canvas_?.remove();
      this.inPlaza = false;
      this.stats.keptBytes = kept;
      const preparation = this.preparation; this.preparation = null; preparation?.cancel();
      this.lease?.release(); this.lease = null;
      if (kept > this.deps.gpuBudget() * KEEP_RATIO) this.drop();
    }
  }

  drop(): void {
    if (this.deps.service) {
      if (this.inPlaza || this.job || this.yielding) return;
      this.deps.service.trim('plaza'); this.stats.drops++; return;
    }
    const r = this.renderer_;
    this.job = null;
    if (!r) return;
    this.renderer_ = null;
    this.canvas_?.removeEventListener?.('webglcontextlost', this.onLost);
    this.canvas_?.remove();
    this.canvas_ = null;
    this.uploads = new WeakMap();
    for (const v of this.keep.values()) (v as Partial<Disposable> | null)?.dispose?.();
    this.keep = new Map();
    r.dispose();
    r.forceContextLoss();
    this.stats.drops++;
  }

  debug(): Record<string, unknown> {
    return { ...this.stats, contexts: this.contexts, inside: this.inPlaza, prewarming: !!this.job, programs: this.renderer_?.info.programs?.length ?? 0, memory: this.renderer_ ? { ...this.renderer_.info.memory } : null };
  }
}

const frameTick = (fn: () => void): void => void (typeof document !== 'undefined' && document.hidden ? setTimeout(fn, 16) : requestAnimationFrame(fn));

export interface WorldModules {
  createPlazaWorld: typeof import('@app/scene/world/plaza/world').createPlazaWorld;
  parseDecoParam: typeof import('@app/scene/world/plaza/deco').parseDecoParam;
  PriorityFloor: typeof import('@app/common/render3d').PriorityFloor;
  LOAD_BUDGET_MS: number;
  manager: AssetManagerApi;
}

export interface WorldEnv {
  modules(): Promise<WorldModules>;
  tick(fn: () => void): void;
  assetsRoot: string;
  gltfTextures: boolean;
}

export function worldStarter(env: WorldEnv): (o: WorldStart) => PlazaWorldJob {
  let serial = 0;
  return (o) => {
    const owner = o.gpu.preparation ? `plaza-prepare:${++serial}` : 'plaza';
    const pace = o.prewarm ? new FramePacer(env.tick) : null;
    o.gpu.preparation?.signal.addEventListener('abort', () => pace?.flush(), { once: true });
    let promoted = !o.prewarm;
    let progress: Progress | null = o.onProgress ?? null;
    let floor: { lower(to?: number): void } | null = null;
    let loadBudget = 0;
    let sched: { budgetMs: number } | null = null;
    const world = (async (): Promise<PlazaWorld> => {
      const m = await env.modules();
      if (o.gpu.preparation && !o.gpu.preparation.valid()) throw new Error('Plaza preparation expired');
      const mgr = m.manager;
      sched = mgr.scheduler;
      loadBudget = m.LOAD_BUDGET_MS;
      const before = mgr.scheduler.budgetMs;
      const f = new m.PriorityFloor(promoted ? P0 : P2);
      floor = f;
      try {
        const w = await m.createPlazaWorld({
          canvas: o.gpu.renderer.domElement,
          gpu: o.gpu,
          floor: f,
          budgetMs: promoted ? m.LOAD_BUDGET_MS : PREWARM_BUDGET_MS,
          pace: pace ? () => pace.wait() : undefined,
          assets: { url: (p) => `${env.assetsRoot}plaza/world/${p}` },
          loader: { manager: mgr, key: (p) => `plaza/world/${p}`, owner },
          deco: o.params.has('deco') ? m.parseDecoParam(o.params.get('deco') ?? '') : undefined,
          onProgress: (n, t, what) => progress?.(n, t, what),
          loadMode: 'staged',
          gltfTextures: env.gltfTextures,
        });
        try {
          if (!promoted) {
            if (o.gpu.preparation) {
              await o.gpu.preparation.run(() => w.stage.post?.precompile());
              if (!o.gpu.preparation.valid() || w.stage.preparer?.stats.errors) throw new Error('Plaza preparation failed or expired');
            } else await w.stage.post?.precompile().catch(() => undefined);
          }
          return w;
        } catch (error) { await w.settle?.(); w.disposeActors?.(); w.stage.dispose(); throw error; }
      } finally { if (!promoted) mgr.scheduler.budgetMs = before; }
    })();
    return {
      world,
      promote(onProgress) {
        if (promoted) return;
        promoted = true;
        progress = onProgress ?? null;
        floor?.lower(P0);
        pace?.flush();
        if (sched && loadBudget) sched.budgetMs = loadBudget;
      },
    };
  };
}

const startWorldDefault = worldStarter({
  modules: async () => {
    const [w, d, sd, a] = await Promise.all([import('@app/scene/world/plaza/world'), import('@app/scene/world/plaza/deco'), import('@app/common/render3d'), import('./appAssets')]);
    return { createPlazaWorld: w.createPlazaWorld, parseDecoParam: d.parseDecoParam, PriorityFloor: sd.PriorityFloor, LOAD_BUDGET_MS: sd.LOAD_BUDGET_MS, manager: a.appAssets() };
  },
  tick: frameTick,
  assetsRoot: ASSETS,
  gltfTextures: ASSET_MODE === 'dist',
});

async function warmCharaDefault(w: PlazaWorld, pc: string): Promise<Disposable | null> {
  const { PlazaCharaLoader } = await import('@app/scene/world/plaza/player');
  const stage = w.stage;
  const loader = await PlazaCharaLoader.create((p) => `${ASSETS}${p}`);
  const ch = await loader.load(pc, stage.renderer, (r) => stage.prepare(r), undefined, () => new Promise<void>((r) => frameTick(r)));
  try {
    ch.root.visible = false;
    stage.scene.add(ch.root);
    await stage.prepareModel(ch.root, P2).promise;
    ch.root.removeFromParent();
    return ch;
  } catch (error) { ch.root.removeFromParent(); ch.dispose(); throw error; }
}

function gpuBudgetDefault(): number {
  const mem = typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory : undefined;
  return mem !== undefined && mem <= 4 ? GPU_BUDGET_MOBILE : GPU_BUDGET_PC;
}

const G = globalThis as { __mpjPlazaGl?: PlazaGl; __mpjPlazaGlInstalled?: boolean };

export function plazaGl(): PlazaGl {
  return (G.__mpjPlazaGl ??= new PlazaGl({
    service: appRenderService(),
    createCanvas: () => {
      const c = document.createElement('canvas');
      c.className = 'jw-gl';
      return c;
    },
    createRenderer: (canvas) => new THREE.WebGLRenderer({ canvas, antialias: true }),
    startWorld: startWorldDefault,
    warmChara: warmCharaDefault,
    gpuBudget: gpuBudgetDefault,
  }));
}

export function installPlazaGl(params: URLSearchParams = new URLSearchParams()): void {
  if (G.__mpjPlazaGlInstalled || typeof location === 'undefined') return;
  if (!prewarmEnabled(params)) return;
  G.__mpjPlazaGlInstalled = true;
  void import('./appFlow').then(({ appFlow, prefetchMode }) => {
    const flow = appFlow();
    if (prefetchMode() === 'off') return;
    const early = (): void => {
      if (flow.screen === 'boot' || flow.screen === 'setplayer' || flow.screen === 'charselect') {
        for (const bundle of ['plaza:p0', 'plaza:ui', 'plaza:npc']) flow.request(bundle, P3);
        plazaGl().prewarm(params);
      }
    };
    if (prefetchMode() === 'full' || flow.screen === 'charselect') early();
    flow.on((e) => {
      const gl = plazaGl();
      if (e.type === 'enter' && (prefetchMode() === 'full' || e.screen === 'charselect')) early();
      else if (e.type === 'ready' && e.bundle === 'plaza:p0' && flow.screen !== 'plaza' && !gl.inside) gl.prewarm(params);
      else if (e.type === 'ready' && e.bundle.startsWith('plaza:player:')) gl.hintChara(e.bundle.slice('plaza:player:'.length));
      else if (e.type === 'hint' && e.key === 'chara1P') gl.hintChara(e.value);
    });
  });
}
