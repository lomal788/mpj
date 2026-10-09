/**
 * 미니게임 장면 로더 — 공용 변환기 출력(web/assets/mg/<id>/manifest.json, docs/engine/13_asset_converter.md §5·§7)을 공용 3D 무대(stage3d)에 올린다.
 * 배치(mg.layout)·부착(hookKey/hookNode, 위치·회전만 = plaza attachToSocket)·기본 애니(clip·fmab·vis)·카메라 클립(cam/*.fsnb.json)·환경(manifest.env, Stage3D 가 적용).
 * 단계 로딩(loader_manager.md §11.4, 광장 world.ts 와 같은 방식): 로더 관리자가 있으면 mg.first 로 P0(첫 카메라 0 프레임 시야)/P1/P2 를 정해 모두 요청하고
 * P0 만 기다린다. 모델은 GPU 준비가 끝난 뒤에만 보인다. 늦게 나온 모델의 기본 클립·fmab 은 무대 시작부터 돌았을 프레임으로 맞춘다.
 * 게임 로직 API: 소켓 조회·카메라 클립 재생·모델 보임/애니·배치 밖 모델·충돌 데이터(형상만 — 런타임은 다른 갈래)·결과 무대 world.
 */
import * as THREE from 'three';
import { P0, P1, P3 } from '../../lib/assetcore';
import type { PrepJob } from '../../lib/assetcore-three';
import { attachToSocket } from '../plaza/world';
import { LOAD_BUDGET_MS, Stage3D, type AssetSource, type ClipHandle, type ClipOptions, type PriorityFloor, type SocketPose, type StageGpu, type StageLoader, type StageModel } from '../stage3d';
import { KIND_GLTF, KIND_JSON, KIND_TEXTURE } from '../stage3d/assetHandlers';
import { MgCamera, parseFsnb, type FsnbClip, type MgCameraHandle } from './camera';
import { mgAnimPaths, mgStagePlan, normPath } from './plan';
import type { MgCollisionData, MgDefaultAnim, MgLayoutEntry, MgManifest } from './types';

export interface MgStageOptions {
  canvas: HTMLCanvasElement;
  id: string;
  /** web/assets/mg/<id>/ 기준 */
  assets: AssetSource;
  loader?: StageLoader;
  gpu?: StageGpu;
  floor?: PriorityFloor;
  budgetMs?: number;
  /** 압축 모드: glb 안 텍스처도 관리자를 지남 → 모델 텍스처를 모델 등급으로 미리 받는다 */
  gltfTextures?: boolean;
  onProgress?(n: number, total: number, what: string): void;
}

export interface MgResultWorld {
  scene: unknown;
  origin?: { pos: [number, number, number]; quat: [number, number, number, number] };
}

export interface MgStage {
  readonly id: string;
  readonly stage: Stage3D;
  readonly manifest: MgManifest;
  entry(key: string): StageModel | null;
  ensure(key: string, pri?: number): Promise<StageModel | null>;
  show(key: string, visible: boolean): void;
  startBackground(): void;
  loadModel(name: string, opts?: { visible?: boolean; instance?: string; pri?: number }): Promise<StageModel>;
  socket(name: string): SocketPose | null;
  socketNames(filter?: RegExp): string[];
  play(key: string, clip: string, opts?: ClipOptions): ClipHandle | null;
  playFmab(key: string, file: string, opts?: ClipOptions): Promise<ClipHandle | null>;
  cameras(): string[];
  playCamera(name: string, opts?: { loop?: boolean; speed?: number; startFrame?: number }): Promise<MgCameraHandle | null>;
  stopCamera(): void;
  readonly camera: MgCameraHandle | null;
  collision(): Promise<MgCollisionData | null>;
  resultWorld(socket?: string): Promise<MgResultWorld>;
  update(dt: number): void;
  render(): void;
  resize(w: number, h: number): void;
  dispose(): void;
  debug(): Record<string, unknown>;
}

interface FvbbJson {
  boneVisibility?: { frames: number; loop: boolean; bones: Record<string, [number, number][]> }[];
}

/** fvbb 뼈 보임 재생(stage3d 에 없어 여기서): glb 메시 노드 extras.visBone(= userData.visBone)이 그 뼈인 메시를 키 값으로 켜고 끈다 */
class VisPlayer implements ClipHandle {
  readonly name: string;
  readonly frames: number;
  readonly loop: boolean;
  frame: number;
  speed: number;
  playing = true;
  private readonly meshes: [THREE.Object3D, [number, number][]][] = [];

  constructor(name: string, json: FvbbJson, root: THREE.Object3D, a: MgDefaultAnim) {
    const v = json.boneVisibility?.[0];
    this.name = name;
    this.frames = v?.frames ?? 0;
    this.loop = a.loop;
    this.frame = a.frame;
    this.speed = a.speed;
    root.traverse((o) => {
      const b = (o.userData as { visBone?: string }).visBone;
      const keys = b ? v?.bones[b] : undefined;
      if (keys) this.meshes.push([o, keys]);
    });
    this.apply();
  }

  isFinished(): boolean {
    return !this.loop && this.frame >= this.frames;
  }

  stop(): void {
    this.playing = false;
  }

  step(df: number): void {
    if (!this.playing || this.speed === 0) return;
    this.frame += df * this.speed;
    if (this.loop && this.frames > 0) this.frame = ((this.frame % this.frames) + this.frames) % this.frames;
    this.apply();
  }

  private apply(): void {
    for (const [o, keys] of this.meshes) {
      let v = keys[0][1];
      for (const [f, x] of keys) if (f <= this.frame) v = x;
      o.visible = v !== 0;
    }
  }
}

class MgStageImpl implements MgStage {
  readonly id: string;
  readonly manifest: MgManifest;
  private readonly byKey: Map<string, MgLayoutEntry>;
  private readonly models = new Map<string, StageModel>();
  private readonly loading = new Map<string, Promise<StageModel | null>>();
  private readonly loaded = new Map<string, Promise<StageModel>>();
  private readonly ready = new Set<string>();
  private readonly shown = new Map<string, boolean>();
  private readonly pri = new Map<string, number>();
  private readonly jobs = new Map<string, PrepJob>();
  private readonly anims = new Map<string, ClipHandle[]>();
  /** 부착 부모(다른 배치가 이 모델 뼈에 붙음)의 자기 메시 — 숨겨도 붙은 자식은 보이게 루트 대신 이것만 끈다 */
  private readonly ownMeshes = new Map<string, THREE.Object3D[]>();
  private readonly hosts: Set<string>;
  private readonly frame0: number;
  private readonly camClips = new Map<string, Promise<FsnbClip | null>>();
  private cam: MgCamera | null = null;
  private rest: MgLayoutEntry[] | null = null;
  private readonly stats = { p0: 0, p0Ms: 0, allMs: 0, t0: 0, planned: false };

  constructor(
    readonly stage: Stage3D,
    private readonly opts: MgStageOptions,
  ) {
    this.id = opts.id;
    this.manifest = stage.manifest as MgManifest;
    this.byKey = new Map(this.manifest.mg.layout.map((e) => [e.key, e]));
    this.hosts = new Set(this.manifest.mg.layout.map((e) => e.hookKey).filter((k): k is string => !!k));
    this.frame0 = stage.frame;
  }

  private json<T>(path: string, pri: number): Promise<T | null> {
    const l = this.stage.assetLoader;
    if (l) {
      const k = l.key(path);
      return l.manager.get<T>(k, KIND_JSON, this.stage.floor.key(k, pri), l.owner).catch(() => null);
    }
    return fetch(this.stage.assetUrl(path))
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .catch(() => null);
  }

  /** 항목의 관리자 키(glb + 애니 json + 압축 모드면 텍스처) */
  private keysOf(e: MgLayoutEntry): [string, string][] {
    const l = this.stage.assetLoader;
    const m = this.manifest.models[e.model];
    if (!l || !m) return [];
    const out: [string, string][] = [[l.key(m.url), KIND_GLTF]];
    for (const a of mgAnimPaths(this.manifest, e)) out.push([l.key(a), KIND_JSON]);
    if (this.opts.gltfTextures) for (const t of m.tex ?? []) out.push([l.key(normPath(`tex/${t}`)), KIND_TEXTURE]);
    return out;
  }

  private want(e: MgLayoutEntry, pr: number): void {
    const l = this.stage.assetLoader;
    if (!l) return;
    for (const [k, kind] of this.keysOf(e)) l.manager.want(k, kind, this.stage.floor.key(k, pr), l.owner);
  }

  async load(): Promise<void> {
    const t0 = performance.now();
    this.stats.t0 = t0;
    const plan = mgStagePlan(this.manifest.mg);
    for (const [k, v] of plan.pri) this.pri.set(k, v);
    const l = this.stage.assetLoader;
    const first = this.manifest.mg.first.camera;
    const camP = first ? this.cameraClip(first, P0) : Promise.resolve(null);
    const p0 = plan.order.filter((e) => plan.pri.get(e.key) === P0);
    if (l) {
      this.stats.planned = true;
      for (const [name, pr] of [['p0', P0], ['p1', P1], ['p2', 2]] as const) {
        const keys: string[] = [];
        const kinds: string[] = [];
        for (const e of plan.order)
          if (plan.pri.get(e.key) === pr)
            for (const [k, kind] of this.keysOf(e)) {
              keys.push(k);
              kinds.push(kind);
            }
        l.manager.defineBundle(`mgstage:${this.id}:${name}`, keys, kinds);
      }
      for (const e of p0) this.want(e, P0);
    }
    const total = p0.length + 1;
    let n = 0;
    await camP;
    this.opts.onProgress?.(++n, total, 'camera');
    await Promise.all(p0.map((e) => this.ensure(e.key, P0).then(() => this.opts.onProgress?.(++n, total, e.key))));
    this.stats.p0 = p0.length;
    this.stats.p0Ms = performance.now() - t0;
    this.rest = plan.order.filter((e) => plan.pri.get(e.key)! > P0 && plan.pri.get(e.key)! < P3);
  }

  startBackground(): void {
    const r = this.rest;
    if (!r) return;
    this.rest = null;
    for (const e of r) this.want(e, this.pri.get(e.key) ?? P1);
    const t0 = this.stats.t0;
    void Promise.all(r.map((e) => this.ensure(e.key, this.pri.get(e.key) ?? P1).catch((err: unknown) => console.warn(`미니게임 장면 모델 뒤 읽기 실패: ${e.key}`, err)))).then(
      () => (this.stats.allMs = performance.now() - t0),
    );
  }

  private raise(key: string, pr: number): void {
    const cur = this.pri.get(key);
    if (cur !== undefined && cur <= pr) return;
    this.pri.set(key, pr);
    const e = this.byKey.get(key);
    const l = this.stage.assetLoader;
    if (l && e) for (const [k] of this.keysOf(e)) l.manager.raise(k, this.stage.floor.key(k, pr));
    const j = this.jobs.get(key);
    if (j) this.stage.preparer.raise(j, pr);
    if (e?.hookKey) this.raise(e.hookKey, pr);
  }

  ensure(key: string, pri: number = P1): Promise<StageModel | null> {
    let p = this.loading.get(key);
    if (p) {
      this.raise(key, pri);
      return p;
    }
    const e = this.byKey.get(key);
    if (!e || !this.manifest.models[e.model]) return Promise.resolve(null);
    if (!this.pri.has(key)) this.pri.set(key, pri);
    const lp = this.loadOne(e, pri);
    this.loaded.set(key, lp);
    p = lp.then(async (m) => {
      const job = this.stage.prepareModel(m.root, this.pri.get(key) ?? pri);
      this.jobs.set(key, job);
      await job.promise;
      this.jobs.delete(key);
      this.ready.add(key);
      this.setShown(key, m, this.shown.get(key) ?? e.visible);
      return m;
    });
    this.loading.set(key, p);
    return p;
  }

  private async loadOne(e: MgLayoutEntry, pri: number): Promise<StageModel> {
    let host: StageModel | null = null;
    if (e.hookKey) {
      void this.ensure(e.hookKey, this.pri.get(e.key) ?? pri).catch(() => null);
      host = (await this.loaded.get(e.hookKey)) ?? null;
    }
    const m = await this.stage.loadModel(e.model, { visible: false, instance: e.key, pri: this.pri.get(e.key) ?? pri });
    if (this.hosts.has(e.key)) {
      const own: THREE.Object3D[] = [];
      m.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) own.push(o);
      });
      this.ownMeshes.set(e.key, own);
    }
    if (e.hookKey && e.hookNode) {
      const node = host?.root.getObjectByName(e.hookNode);
      if (node) attachToSocket(node, m.root);
      else console.warn(`미니게임 장면 부착 뼈 없음: ${e.key} → ${e.hookKey}/${e.hookNode}`);
    } else {
      if (e.pos) m.root.position.set(...e.pos);
      if (e.quat) m.root.quaternion.set(...e.quat);
      if (e.scale) m.root.scale.set(...e.scale);
    }
    const handles: ClipHandle[] = [];
    for (const a of e.anims) {
      const opts = { loop: a.loop, speed: a.speed, startFrame: a.frame };
      let h: ClipHandle | null = null;
      if (a.kind === 'clip') h = m.play(a.name, opts);
      else if (a.kind === 'fmab') h = await this.stage.playFmab(m.root, a.name, opts);
      else {
        const path = this.manifest.anims[a.name];
        const j = path ? await this.json<FvbbJson>(path, this.pri.get(e.key) ?? pri) : null;
        if (j) h = this.stage.track(new VisPlayer(a.name, j, m.root, a));
      }
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

  entry(key: string): StageModel | null {
    return this.models.get(key) ?? null;
  }

  show(key: string, visible: boolean): void {
    this.shown.set(key, visible);
    const m = this.models.get(key);
    if (this.ready.has(key) && m) this.setShown(key, m, visible);
    else if (visible) void this.ensure(key, P0);
  }

  /** 보임 — 부착 부모는 루트를 켜 두고 자기 메시만 바꾼다(붙은 자식 배치는 각자 보임을 따름) */
  private setShown(key: string, m: StageModel, visible: boolean): void {
    const own = this.ownMeshes.get(key);
    if (!own) {
      m.setVisible(visible);
      return;
    }
    m.setVisible(true);
    for (const o of own) o.visible = visible;
  }

  loadModel(name: string, opts: { visible?: boolean; instance?: string; pri?: number } = {}): Promise<StageModel> {
    return this.stage.loadModel(name, opts);
  }

  socket(name: string): SocketPose | null {
    return this.stage.getSocket(name);
  }

  socketNames(filter?: RegExp): string[] {
    return this.stage.socketNames(filter);
  }

  play(key: string, clip: string, opts?: ClipOptions): ClipHandle | null {
    return this.models.get(key)?.play(clip, opts) ?? null;
  }

  async playFmab(key: string, file: string, opts?: ClipOptions): Promise<ClipHandle | null> {
    const m = this.models.get(key);
    return m ? this.stage.playFmab(m.root, file, opts) : null;
  }

  cameras(): string[] {
    return Object.keys(this.manifest.asset.cameras ?? {}).sort();
  }

  private cameraClip(name: string, pri: number): Promise<FsnbClip | null> {
    let p = this.camClips.get(name);
    if (!p) {
      const info = this.manifest.asset.cameras?.[name];
      p = info ? this.json<unknown>(info.file, pri).then((j) => (j ? parseFsnb(j) : null)) : Promise.resolve(null);
      this.camClips.set(name, p);
    }
    return p;
  }

  get camera(): MgCameraHandle | null {
    return this.cam;
  }

  async playCamera(name: string, opts: { loop?: boolean; speed?: number; startFrame?: number } = {}): Promise<MgCameraHandle | null> {
    const clip = await this.cameraClip(name, P0);
    if (!clip) return null;
    const c = new MgCamera(name, clip, opts, (x) => {
      if (this.cam === x) this.stopCamera();
    });
    this.cam = c;
    this.stage.setCameraDriver(c, 'anim');
    return c;
  }

  stopCamera(): void {
    this.cam = null;
    this.stage.setCameraDriver(null, 'anim');
  }

  collision(): Promise<MgCollisionData | null> {
    const p = this.manifest.asset.collision;
    return p ? this.json<MgCollisionData>(p, P1) : Promise.resolve(null);
  }

  async resultWorld(socket = 'pos_result'): Promise<MgResultWorld> {
    let s = this.socket(socket);
    if (!s && this.manifest.asset.sockets?.includes(socket)) {
      for (const e of this.manifest.mg.layout) {
        if (this.models.has(e.key)) continue;
        await this.ensure(e.key, P0);
        s = this.socket(socket);
        if (s) break;
      }
    }
    return {
      scene: this.stage.scene,
      origin: s ? { pos: s.pos.toArray() as [number, number, number], quat: [s.quat.x, s.quat.y, s.quat.z, s.quat.w] } : undefined,
    };
  }

  update(dt: number): void {
    this.stage.update(dt);
  }

  render(): void {
    this.stage.render();
  }

  resize(w: number, h: number): void {
    this.stage.resize(w, h);
  }

  dispose(): void {
    this.stopCamera();
    this.stage.dispose();
  }

  debug(): Record<string, unknown> {
    const byPri = [0, 0, 0, 0];
    for (const v of this.pri.values()) byPri[v]++;
    const l = this.stage.assetLoader;
    const bundles: Record<string, string> = {};
    if (l) for (const b of ['p0', 'p1', 'p2']) bundles[b] = `${l.manager.bundleReady(`mgstage:${this.id}:${b}`)}/${l.manager.bundleSize(`mgstage:${this.id}:${b}`)}`;
    return {
      id: this.id,
      byPri,
      ready: this.ready.size,
      models: this.models.size,
      layout: this.manifest.mg.layout.length,
      camera: this.cam ? `${this.cam.name} ${Math.floor(this.cam.frame)}/${this.cam.frames}` : null,
      bundles,
      ...this.stats,
    };
  }
}

/** 무대 만들기 → P0 배치·첫 카메라까지 올린 뒤 돌려준다(P1·P2 는 startBackground) */
export async function createMgStage(opts: MgStageOptions): Promise<MgStage> {
  const stage = await Stage3D.create({ canvas: opts.canvas, assets: opts.assets, loader: opts.loader, gpu: opts.gpu, floor: opts.floor });
  stage.budget(opts.budgetMs ?? LOAD_BUDGET_MS);
  const man = stage.manifest as MgManifest;
  if (!man.mg) throw new Error(`미니게임 장면 manifest 에 mg 절이 없다: ${opts.id}`);
  const s = new MgStageImpl(stage, opts);
  await s.load();
  return s;
}
