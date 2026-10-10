/**
 * 공용 3D 무대 — three 렌더러·장면·카메라 슬롯·평행광·IBL·안개와, 무대 모델(glb)·클립·재질 애니(fmab)·위치 뼈(로케이터) 조회.
 * 계약은 types.ts, 쓰는 법은 docs/shell/mgmet_3d.md §8.
 *
 * 조명·안개 값은 manifest.env(tools/analysis/mgmet_world_assets.py 가 env 컨테이너 dump 에서 고른 값, 07_camera_lighting.md 7.3~7.5).
 * - 평행광 세기 = 원본 색 × π [근사: mg1801 과 같은 단위 관례]. 그림자맵 하나로 카메라 근처 절두체 조각을 덮는다 [근사: 원본 캐스케이드].
 * - 안개 [근사]: env 의 거리 안개(시작·끝·색)를 three Fog(선형)로.
 * - 톤맵·포스트(post00 블룸 등)는 넣지 않는다 [근사].
 * 앱 수명 렌더러(gpu 옵션 StageGpu = 렌더러 + 업로드 기록, docs/engine/loader_manager.md §14.3): 렌더러를 만들지도 버리지도 않고, dispose 때 관리자 캐시 몫
 *   (glTF 템플릿과 같이 쓰는 기하·관리자 텍스처 복제)의 GPU 데이터를 남긴다. 무대 전용(준비 RT·HDR·뼈 텍스처)만 버린다. keep = 렌더러 수명 물건 —
 *   env 가 같으면 무대마다 같은 것: 후처리 체인('post:<값>')·하늘('sky:<모델>')·IBL(PMREM 생성기 + 큐브 캐시 'ibl') — 다시 만들지 않고 dispose 하지 않는다.
 *   ShaderMaterial 은 마지막 재질이 dispose 되면 three 가 셰이더 단계 번호를 지워 같은 코드라도 프로그램 키가 바뀌므로(WebGLShaderCache) 재질째 들고 있어야
 *   재진입 컴파일이 0 이다.
 * 등급 바닥(PriorityFloor, §14.5): value 보다 높은(작은) 등급 요청은 value 로 낮춰 부르고 [키|작업, 원래 등급] 을 적어 둔다. lower(to) 때 무대가 적어 둔 것을
 *   원래 등급으로 올린다. 기본 P0 = 바닥 없음.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FrameScheduler, P0, P1, type AssetManagerApi } from '@game/lib/assetcore';
import { ScenePreparer, type PrepJob, type UploadRecord } from '@game/lib/assetcore-three';
import { createGltfLoader } from './assetLoader';
import { hdrCube, hdrTexture, type HdrSource } from './hdr';
import { KIND_BYTES, KIND_GLTF, KIND_JSON, KIND_TEXTURE } from './assetHandlers';
import { Clip } from './clip';
import { createIblShare, fresOf, MaterialSetup, type IblShare } from './material';
import type { GraphDef } from './graph';
import { emptyParams, FmabPlayer, type MatParams } from './params';
import { PostChain, type PostParams } from './post';
import type { AssetSource, CameraDriver, CameraSlot, Collider, ClipHandle, ClipOptions, FmabSample, MaterialOverride, SocketPose, StageManifest, StageModel, StageUpdater } from './types';

interface FmabJson {
  materialAnims: { name: string; frames: number; loop: boolean; materials: Record<string, { params?: Record<string, Record<string, number | number[]>> }> }[];
}

export interface StageEnv {
  light?: { dir: [number, number, number]; color: [number, number, number] };
  fog?: { start: number; end: number; color: [number, number, number]; intensity?: number; cube?: string } | null;
  ibl?: { common: [string, string]; chara: [string, string] | null };
  shadow?: { near: number; far: number; offset: number; cascades?: number; lambda?: number };
  clear?: [number, number, number];
  post?: PostParams;
  sky?: { model: string; texture: string | null; params: Record<string, unknown>; graph?: string; position: number[] };
  pointLights?: { name: string; position: [number, number, number]; color: [number, number, number]; radius: number; coreRadius: number }[];
  envUtility?: Record<string, number[]>;
  envAnim?: string;
  windNoise?: string;
}

/** 모든 무대 재질이 같이 쓰는 값(셰이더 그래프 유니폼): 시간(초)·env 재질 파라미터(env_utility_parameterN → P) */
export interface StageGlobals {
  time: { value: number };
  /** 이전 광장 그래프의 경과 ms 계약. 원본 World[0x4]는 worldFrame. */
  ms: { value: number };
  worldFrame?: { value: number };
  /** 표면→태양(월드, 원본 Layer[0x220]) */
  sunDir: { value: THREE.Vector3 };
  env: MatParams;
}

/** 로더 관리자 연결(docs/engine/loader_manager.md §11.4). 없으면 지금처럼 무대마다 직접 읽는다 */
export interface StageLoader {
  manager: AssetManagerApi;
  /** 무대 상대 경로(assets.url 에 넣는 것) → 논리 키 */
  key(path: string): string;
  /** 참조 주인 이름(release 용) */
  owner: string;
}

export interface StagePreparation {
  readonly signal: AbortSignal;
  readonly scheduler: Pick<FrameScheduler, 'add' | 'raise' | 'remove'>;
  configure?(state: () => void): void;
  valid(): boolean;
  run<T>(unit: () => T): Promise<T>;
}

export interface StageGpu {
  preparation?: StagePreparation;
  valid?(): boolean;
  resize?(w: number, h: number): void;
  offscreen?: boolean;
  renderer: THREE.WebGLRenderer;
  uploads: UploadRecord;
  keep: Map<string, unknown>;
}

export class PriorityFloor {
  readonly keys: [string, number][] = [];
  readonly jobs: [PrepJob, number][] = [];
  private readonly hooks: ((to: number) => void)[] = [];
  constructor(public value: number = P0) {}

  key(k: string, p: number): number {
    if (p >= this.value) return p;
    this.keys.push([k, p]);
    return this.value;
  }

  onLower(fn: (to: number) => void): void {
    this.hooks.push(fn);
  }

  lower(to: number = P0): void {
    if (to >= this.value) return;
    this.value = to;
    for (const h of this.hooks) h(to);
    this.keys.length = 0;
    this.jobs.length = 0;
  }
}

export interface StageCreateOptions {
  canvas: HTMLCanvasElement;
  assets: AssetSource;
  manifest?: string;
  antialias?: boolean;
  loader?: StageLoader;
  gpu?: StageGpu;
  floor?: PriorityFloor;
}

/** 무대 템플릿: 관리자 캐시의 깨끗한 glTF 장면을 재질까지 복제(MaterialSetup 이 재질을 고쳐 쓰므로 무대 사이에 나누지 않는다) */
function stageTemplate(src: THREE.Object3D): THREE.Object3D {
  const root = cloneSkinned(src);
  const done = new Map<THREE.Material, THREE.Material>();
  const cl = (m: THREE.Material): THREE.Material => {
    let c = done.get(m);
    if (!c) done.set(m, (c = m.clone()));
    return c;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cl) : cl(mesh.material);
  });
  return root;
}

/** 첫 로딩 동안 프레임 예산(ms) — 로딩 화면 뒤라 크게, 그래도 매 프레임 양보 [추정] */
export const LOAD_BUDGET_MS = 50;
export const PLAY_BUDGET_MS = 4;

class Model implements StageModel {
  readonly clips: Record<string, number> = {};
  readonly mixer: THREE.AnimationMixer;
  constructor(
    readonly name: string,
    readonly root: THREE.Object3D,
    private readonly gltf: GLTF,
    frames: Record<string, number>,
    private readonly stage: Stage3D,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const a of gltf.animations) this.clips[a.name] = frames[a.name] ?? Math.round(a.duration * 60);
  }

  play(clip: string, opts: ClipOptions = {}): ClipHandle | null {
    const c = this.gltf.animations.find((a) => a.name === clip);
    if (!c) return null;
    return this.stage.track(new Clip(this.mixer, c, this.clips[clip], opts));
  }

  playFmab(file: string, opts: ClipOptions = {}): Promise<ClipHandle | null> {
    return this.stage.playFmab(this.root, file, opts);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }
}

const SHADOW_MAP = 4096;
/**
 * 하늘(container/skybox p0) [판독 sg1]: 무조명, r = 카메라→하늘 시선 방향(월드), u = (atan(r.x, −r.z) + π)/2π + P0.y, v = P0.x + acos(r.y)·2/π,
 * 출력 = 텍스처 rgba 그대로(조명·안개 없음, V 는 Mirror 감싸기). P0 = skybox_utility_parameter0.
 */
const SKY_VS = `varying vec3 vDir;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = w.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SKY_FS = `uniform sampler2D mpjSky;
uniform vec4 mpjSkyP0;
varying vec3 vDir;
void main() {
  vec3 r = normalize(vDir);
  vec2 uv = vec2((atan(r.x, -r.z) + 3.14159265) * 0.15915494 + mpjSkyP0.y, mpjSkyP0.x + acos(clamp(r.y, -1.0, 1.0)) * 0.63661977);
  gl_FragColor = texture2D(mpjSky, uv);
  #include <colorspace_fragment>
}`;

function setEnvParam(mp: MatParams, name: string, i: number, v: number): void {
  const m = /^env_utility_parameter(\d)$/.exec(name);
  if (m) mp.P[+m[1]].setComponent(i, v);
}
const SHADOW_BIAS_WORLD = 0.05;

export class Stage3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 5000);
  readonly sun: THREE.DirectionalLight;
  frame = 0;
  cameraDriven = false;
  manifest!: StageManifest;
  env: StageEnv = {};
  materials!: MaterialSetup;
  readonly stats = { loadMs: 0, models: 0, bytes: 0 };
  private readonly loader = createGltfLoader();
  readonly scheduler: FrameScheduler;
  readonly preparer: ScenePreparer;
  private readonly models = new Map<string, Model>();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly sharedGeo = new WeakSet<THREE.BufferGeometry>();
  readonly floor: PriorityFloor;
  readonly keep: Map<string, unknown> | null;
  private readonly clipsLive: { step(df: number): void }[] = [];
  readonly globals: StageGlobals = { time: { value: 0 }, ms: { value: 0 }, worldFrame: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, env: emptyParams() };
  post: PostChain | null = null;
  private sky: THREE.Object3D | null = null;
  private readonly updaters = new Set<StageUpdater>();
  private readonly overrides: MaterialOverride[] = [];
  private readonly overridden: { mat: THREE.Material; o: MaterialOverride; name: string }[] = [];
  private readonly fmabs = new Map<string, FmabJson | null>();
  private readonly fmabLoading = new Map<string, Promise<FmabJson | null>>();
  private readonly cameraDrivers: Record<CameraSlot, CameraDriver | null> = { anim: null, follow: null };
  collider: Collider | null = null;
  private lightDir = new THREE.Vector3(0, 1, 0);
  private shadowFar = 120;
  private shadowOffset = 500;

  private constructor(private readonly opts: StageCreateOptions) {
    this.renderer = opts.gpu?.renderer ?? new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: opts.antialias ?? true });
    if (!opts.gpu?.preparation) this.activate();
    opts.gpu?.preparation?.configure?.(() => this.activate());
    this.sun = new THREE.DirectionalLight(0xffffff, Math.PI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.scene.add(this.sun, this.sun.target);
    this.scheduler = opts.loader?.manager.scheduler ?? new FrameScheduler({ now: () => performance.now(), tick: (fn) => void requestAnimationFrame(fn) }, PLAY_BUDGET_MS);
    this.preparer = new ScenePreparer({ renderer: this.renderer, scene: this.scene, camera: () => this.camera, scheduler: opts.gpu?.preparation?.scheduler ?? this.scheduler, linear: () => !!this.post, uploads: opts.gpu?.uploads, valid: opts.gpu?.valid, offscreen: opts.gpu?.offscreen });
    opts.gpu?.preparation?.signal.addEventListener('abort', () => { this.preparer.dispose(); this.opts.loader?.manager.release(this.opts.loader.owner); }, { once: true });
    this.floor = opts.floor ?? new PriorityFloor(P0);
    this.keep = opts.gpu?.keep ?? null;
    this.floor.onLower(() => {
      const l = this.opts.loader;
      for (const [k, p] of this.floor.keys) l?.manager.raise(k, p);
      for (const [j, p] of this.floor.jobs) this.preparer.raise(j, p);
    });
  }

  activate(): void {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    if (this.env.clear) this.renderer.setClearColor(new THREE.Color(...this.env.clear));
    if (this.post) this.renderer.toneMapping = THREE.NoToneMapping;
  }

  get assetLoader(): StageLoader | null {
    return this.opts.loader ?? null;
  }

  /** 프레임 예산(ms) — 첫 로딩 동안 LOAD_BUDGET_MS, 그 뒤 PLAY_BUDGET_MS */
  budget(ms: number): void {
    this.scheduler.budgetMs = ms;
  }

  /** 관리자가 있으면 관리자로(무대 상대 경로), 없으면 fetch 로 json 을 읽는다 */
  private async json<T>(path: string, pri: number): Promise<T | null> {
    const l = this.opts.loader;
    if (this.opts.gpu?.preparation?.signal.aborted) throw this.opts.gpu.preparation.signal.reason;
    if (l) {
      const k = l.key(path);
      return l.manager.get<T>(k, KIND_JSON, this.floor.key(k, pri), l.owner).catch(() => null);
    }
    const r = await fetch(this.opts.assets.url(path));
    return r.ok ? ((await r.json()) as T) : null;
  }

  static async create(opts: StageCreateOptions): Promise<Stage3D> {
    const s = new Stage3D(opts);
    try {
      const t0 = performance.now();
      const man = await s.json<StageManifest>(opts.manifest ?? 'manifest.json', P0);
      if (!man) throw new Error('stage3d manifest 를 읽지 못했다');
      s.manifest = man;
      s.env = (s.manifest.env ?? {}) as StageEnv;
      const keep = s.keep;
      let ibl = keep?.get('ibl') as IblShare | undefined;
      if (keep && !ibl) keep.set('ibl', (ibl = createIblShare(s.renderer)));
      const l = opts.loader;
      const hdr: HdrSource = {
        dir: l?.key('') ?? '',
        get disposed() { return !!opts.gpu?.preparation?.signal.aborted; },
        bytes: path => l ? l.manager.get<ArrayBuffer>(l.key(path), KIND_BYTES, s.floor.key(l.key(path), P1), l.owner).then(bytes => bytes.slice(0)) : fetch(opts.assets.url(path)).then(response => { if (!response.ok) throw new Error(`HDR fetch failed: ${path}`); return response.arrayBuffer(); }),
      };
      s.materials = new MaterialSetup(opts.assets, s.renderer, s.manifest.textures ?? {}, ibl, { gpu: opts.gpu?.preparation ? unit => opts.gpu!.preparation!.run(unit) : undefined, hdrCube: paths => hdrCube(hdr, paths), hdrTexture: path => hdrTexture(hdr, path) });
      if (l)
        s.materials.fetchTexture = (p) => {
          const k = l.key(p);
          return l.manager.get<THREE.Texture>(k, KIND_TEXTURE, s.floor.key(k, P1), l.owner).then((t) => t.clone());
        };
      s.materials.globals = s.globals;
      for (const d of (s.manifest as unknown as { graphs?: GraphDef[] }).graphs ?? []) (s.materials.graphs[d.material] ??= []).push(d);
      s.applyEnv();
      if (s.env.ibl) await s.materials.loadIbl(s.env.ibl.common, s.env.ibl.chara);
      await s.setupExtras();
      if (s.materials.common) s.scene.environment = s.materials.common.rad;
      else s.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      if (opts.gpu?.preparation?.signal.aborted) throw opts.gpu.preparation.signal.reason;
      s.stats.loadMs += performance.now() - t0;
      return s;
    } catch (error) { await s.preparer.settled; s.dispose(); throw error; }
  }

  private applyEnv(): void {
    const e = this.env;
    if (e.light) {
      this.lightDir.set(...e.light.dir).normalize();
      this.globals.sunDir.value.copy(this.lightDir);
      this.sun.color.setRGB(...e.light.color);
    }
    if (e.fog) this.scene.fog = new THREE.Fog(new THREE.Color(...e.fog.color), e.fog.start, e.fog.start + (e.fog.end - e.fog.start) / (e.fog.intensity ?? 1));
    if (e.shadow) {
      const n = Math.max(1, e.shadow.cascades ?? 1);
      const k = Math.max(1, n - 1);
      const lam = e.shadow.lambda ?? 0.5;
      const near = Math.max(1e-3, e.shadow.near);
      this.shadowFar = n > 1 ? lam * near * (e.shadow.far / near) ** (k / n) + (1 - lam) * (near + ((e.shadow.far - near) * k) / n) : e.shadow.far;
      this.shadowOffset = e.shadow.offset;
    }
    if (e.clear && !this.opts.gpu?.preparation) this.renderer.setClearColor(new THREE.Color(...e.clear));
  }

  private async setupExtras(): Promise<void> {
    const e = this.env;
    for (const [k, v] of Object.entries(e.envUtility ?? {})) for (let i = 0; i < v.length; i++) setEnvParam(this.globals.env, k, i, v[i]);
    if (e.envAnim) {
      const j = await this.loadFmab(e.envAnim);
      if (j) this.track(new FmabPlayer(e.envAnim, j, null, { loop: true }, new Map([['env', [this.globals.env]]])));
    }
    for (const pl of e.pointLights ?? []) {
      const l = new THREE.PointLight(new THREE.Color(...pl.color), Math.PI, pl.radius, 2);
      l.name = pl.name;
      l.position.set(...pl.position);
      this.scene.add(l);
    }
    const postKey = e.post ? `post:${JSON.stringify(e.post)}` : '';
    const keptPost = this.keep?.get(postKey) as PostChain | undefined;
    if (keptPost) this.post = keptPost;
    else if (e.post) {
      const lut = e.post.lut ? await this.materials.texture(e.post.lut) : null;
      if (lut) {
        lut.colorSpace = THREE.NoColorSpace;
        lut.wrapS = lut.wrapT = THREE.ClampToEdgeWrapping;
        lut.generateMipmaps = false;
        lut.minFilter = THREE.LinearFilter;
        lut.needsUpdate = true;
      }
      this.post = this.opts.gpu?.preparation
        ? await this.opts.gpu.preparation.run(() => new PostChain(this.renderer, e.post!, lut))
        : new PostChain(this.renderer, e.post, lut);
      this.keep?.set(postKey, this.post);
    }
    const skyKey = e.sky ? `sky:${e.sky.model}:${e.sky.texture ?? ''}` : '';
    const keptSky = this.keep?.get(skyKey) as THREE.Object3D | undefined;
    if (keptSky) {
      this.sky = keptSky;
      this.scene.add(keptSky);
    } else if (e.sky) {
      const tex = e.sky.texture ? await this.materials.texture(e.sky.texture) : null;
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.needsUpdate = true;
      }
      const p0 = (e.sky.params.skybox_utility_parameter0 as number[] | undefined) ?? [0, 0, 1, 1];
      const m = new THREE.ShaderMaterial({
        uniforms: { mpjSky: { value: tex }, mpjSkyP0: { value: new THREE.Vector4(...(p0 as [number, number, number, number])) } },
        vertexShader: SKY_VS,
        fragmentShader: SKY_FS,
        side: THREE.DoubleSide,
        fog: false,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), m);
      mesh.name = e.sky.model;
      mesh.renderOrder = -1000;
      mesh.frustumCulled = false;
      this.sky = mesh;
      this.scene.add(mesh);
      this.keep?.set(skyKey, Object.assign(mesh, { dispose: () => { mesh.removeFromParent(); mesh.geometry.dispose(); m.dispose(); } }));
    }
  }

  addMaterialOverride(o: MaterialOverride): void {
    this.overrides.push(o);
    for (const m of this.models.values()) void this.applyOverrides(m.root);
  }

  setCameraDriver(d: CameraDriver | null, slot: CameraSlot = 'anim'): void {
    this.cameraDrivers[slot] = d;
  }

  setCollider(c: Collider | null): void {
    this.collider = c;
  }

  addUpdater(u: StageUpdater): () => void {
    this.updaters.add(u);
    return () => this.updaters.delete(u);
  }

  track<T extends { step(df: number): void }>(c: T): T {
    this.clipsLive.push(c);
    return c;
  }

  /** 재질 애니(fmab json) 재생 — root 안 재질 중 이름이 맞는 것의 파라미터(P·C·srt·raw)를 프레임마다 덮는다 */
  async playFmab(root: THREE.Object3D, file: string, opts: ClipOptions = {}): Promise<ClipHandle | null> {
    const j = await this.loadFmab(file);
    if (!j) return null;
    return this.track(new FmabPlayer(file, j, root, opts));
  }

  playClip(root: THREE.Object3D, clip: THREE.AnimationClip, opts: ClipOptions = {}): ClipHandle {
    return this.track(new Clip(new THREE.AnimationMixer(root), clip, undefined, opts));
  }

  model(name: string): StageModel | undefined {
    return this.models.get(name);
  }

  loadedModels(): string[] {
    return [...this.models.keys()];
  }

  assetUrl(path: string): string {
    return this.opts.assets.url(path);
  }

  async loadModel(name: string, opts: { visible?: boolean; instance?: string; pri?: number } = {}): Promise<StageModel> {
    if (this.opts.gpu?.preparation?.signal.aborted) throw this.opts.gpu.preparation.signal.reason;
    const id = opts.instance ?? name;
    const have = this.models.get(id);
    if (have) return have;
    const info = this.manifest.models[name];
    if (!info) throw new Error(`stage3d manifest 에 없는 모델: ${name}`);
    const t0 = performance.now();
    let p = this.gltfs.get(info.url);
    const first = !p;
    const l = this.opts.loader;
    if (!p) {
      const k = l?.key(info.url) ?? '';
      p = l
        ? l.manager.get<GLTF>(k, KIND_GLTF, this.floor.key(k, opts.pri ?? P1), l.owner).then((g) => {
            g.scene.traverse((o) => {
              const geo = (o as THREE.Mesh).geometry;
              if (geo) this.sharedGeo.add(geo);
            });
            return { ...g, scene: stageTemplate(g.scene) as THREE.Group };
          })
        : this.loader.loadAsync(this.opts.assets.url(info.url));
      this.gltfs.set(info.url, p);
    } else if (l && opts.pri !== undefined) l.manager.raise(l.key(info.url), this.floor.key(l.key(info.url), opts.pri));
    const gltf = await p;
    const root = first ? gltf.scene : cloneSkinned(gltf.scene);
    root.name = id;
    await this.materials.prepare(root, name);
    await this.applyOverrides(root);
    const frames: Record<string, number> = {};
    for (const [k, v] of Object.entries(info.clips ?? {})) frames[k] = v.frames;
    const m = new Model(id, root, gltf, frames, this);
    root.visible = opts.visible ?? true;
    this.scene.add(root);
    this.models.set(id, m);
    this.stats.models++;
    if (first) this.stats.bytes += info.bytes;
    this.stats.loadMs += performance.now() - t0;
    return m;
  }

  prepare(root: THREE.Object3D): Promise<void> {
    return this.materials.prepare(root);
  }

  /** GPU 준비(텍스처 업로드·셰이더 컴파일·버퍼 업로드)를 프레임 예산으로 — job.promise 가 풀린 뒤에만 보이게 한다(loader_manager.md §11.3) */
  prepareModel(root: THREE.Object3D, pri: number): PrepJob {
    const f = this.floor;
    const job = this.preparer.prepare(root, pri < f.value ? f.value : pri);
    if (pri < f.value) f.jobs.push([job, pri]);
    return job;
  }

  /** 개발·시험: 지금 그려지는(자신과 조상이 모두 보이는) 메시 중 GPU 준비를 안 거친 수 */
  unpreparedVisible(): { count: number; names: string[] } {
    const names: string[] = [];
    const walk = (o: THREE.Object3D): void => {
      if (!o.visible) return;
      if (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && !this.preparer.isPrepared(o)) names.push(o.name || o.parent?.name || '?');
      for (const c of o.children) walk(c);
    };
    walk(this.scene);
    return { count: names.length, names: names.slice(0, 20) };
  }

  private matches(o: MaterialOverride, name: string): boolean {
    return typeof o.match === 'string' ? o.match === name : o.match.test(name);
  }

  private async applyOverrides(root: THREE.Object3D): Promise<void> {
    if (!this.overrides.length) return;
    const jobs: Promise<void>[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((src, i) => {
        if ((src.userData as { stage3dOverride?: boolean }).stage3dOverride) return;
        const fres = fresOf(src);
        const name = fres?.name ?? src.name;
        const o = this.overrides.find((x) => this.matches(x, name) || this.matches(x, src.name));
        if (!o) return;
        jobs.push(
          (async () => {
            const mat = await o.create(mesh, src, fres, this.materials.context(this.sun));
            (mat.userData as { stage3dOverride?: boolean }).stage3dOverride = true;
            if (Array.isArray(mesh.material)) mesh.material[i] = mat;
            else mesh.material = mat;
            this.overridden.push({ mat, o, name });
          })(),
        );
      });
    });
    await Promise.all(jobs);
  }

  private loadFmab(file: string): Promise<FmabJson | null> {
    let p = this.fmabLoading.get(file);
    if (!p) {
      const path = this.manifest.anims[file];
      p = (async () => {
        if (!path) return null;
        return this.json<FmabJson>(path, P1);
      })().catch(() => null);
      p.then((j) => this.fmabs.set(file, j));
      this.fmabLoading.set(file, p);
    }
    return p;
  }

  async preloadFmab(files: string[]): Promise<void> {
    await Promise.all(files.map((f) => this.loadFmab(f)));
  }

  fmab(file: string, frame = this.frame): FmabSample | null {
    const j = this.fmabs.get(file);
    if (j === undefined) {
      void this.loadFmab(file);
      return null;
    }
    if (!j) return null;
    const out: FmabSample = {};
    for (const a of j.materialAnims) {
      const n = a.frames > 0 ? Math.floor(a.loop ? ((frame % a.frames) + a.frames) % a.frames : Math.min(frame, a.frames)) : 0;
      for (const [mat, v] of Object.entries(a.materials)) {
        const pm = (out[mat] ??= {});
        for (const [param, comps] of Object.entries(v.params ?? {})) {
          const pc = (pm[param] ??= {});
          for (const [c, arr] of Object.entries(comps)) pc[c] = typeof arr === 'number' ? arr : arr[Math.min(n, arr.length - 1)];
        }
      }
    }
    return out;
  }

  private fmabFor(name: string): Record<string, Record<string, number>> | null {
    for (const file of this.fmabs.keys()) {
      const s = this.fmab(file);
      if (s && s[name]) return s[name];
    }
    return null;
  }

  getSocket(name: string): SocketPose | null {
    for (const m of this.models.values()) {
      const node = m.root.getObjectByName(name);
      if (!node) continue;
      node.updateWorldMatrix(true, false);
      return { pos: node.getWorldPosition(new THREE.Vector3()), quat: node.getWorldQuaternion(new THREE.Quaternion()), node };
    }
    return null;
  }

  socketNames(filter?: RegExp): string[] {
    const out: string[] = [];
    for (const m of this.models.values())
      m.root.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh && o.name && (!filter || filter.test(o.name))) out.push(o.name);
      });
    return out;
  }

  resize(w: number, h: number): void {
    if (this.opts.gpu?.resize) this.opts.gpu.resize(w, h);
    else this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const df = dt * 60;
    this.frame += df;
    this.globals.time.value = this.frame / 60;
    this.globals.ms.value = (this.frame / 60) * 1000;
    this.globals.worldFrame!.value = Math.floor(this.frame) >>> 0;
    for (const c of this.clipsLive) c.step(df);
    for (const u of this.updaters) u.update(df, this.frame);
    for (const x of this.overridden) x.o.update?.(x.mat, this.frame, this.fmabFor(x.name));
    this.cameraDriven = false;
    for (const slot of ['anim', 'follow'] as const) {
      const d = this.cameraDrivers[slot];
      if (d && d.step(this.camera, df)) {
        d.apply(this.camera);
        this.cameraDriven = true;
        break;
      }
    }
    this.fitShadow();
    if (this.sky) {
      this.sky.position.copy(this.camera.position);
      this.sky.scale.setScalar(this.camera.far * 0.4);
    }
  }

  private fitShadow(): void {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    const near = cam.near;
    const far = Math.min(cam.far, this.shadowFar);
    const corners: THREE.Vector3[] = [];
    const t = Math.tan(((cam.fov * Math.PI) / 180) * 0.5);
    for (const d of [near, far]) {
      const h = d * t;
      const w = h * cam.aspect;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) corners.push(new THREE.Vector3(sx * w, sy * h, -d).applyMatrix4(cam.matrixWorld));
    }
    const center = new THREE.Vector3();
    for (const c of corners) center.add(c);
    center.multiplyScalar(1 / corners.length);
    this.sun.position.copy(center).addScaledVector(this.lightDir, this.shadowOffset);
    this.sun.target.position.copy(center);
    this.sun.updateMatrixWorld(true);
    this.sun.target.updateMatrixWorld(true);
    const view = new THREE.Matrix4().lookAt(this.sun.position, center, new THREE.Vector3(0, 1, 0));
    view.setPosition(this.sun.position).invert();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const c of corners) {
      const p = c.clone().applyMatrix4(view);
      min.min(p);
      max.max(p);
    }
    const sc = this.sun.shadow.camera;
    sc.left = min.x;
    sc.right = max.x;
    sc.bottom = min.y;
    sc.top = max.y;
    sc.near = 0.1;
    sc.far = -min.z + this.shadowOffset;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -SHADOW_BIAS_WORLD / (sc.far - sc.near);
    this.sun.shadow.normalBias = SHADOW_BIAS_WORLD;
  }

  /**
   * 첫 그리기 렉 없애기 [설계]: 장면 전체(이미 준비한 메시 제외)를 프레임 예산 작업으로 GPU 준비(텍스처 initTexture 한 장씩 → compileAsync →
   * 메시 묶음 1×1 업로드, loader_manager.md §11.3) — 첫 로딩 동안 LOAD_BUDGET_MS. 끝에 지금처럼 숨은 모델·화면 밖 메시까지 잠깐 보이게 한 번 그려
   * (그림자 맵·후처리 패스 변형) 되돌린 뒤 다시 그린다.
   */
  async warmup(): Promise<{ ms: number; textures: number; programs: number }> {
    const t0 = performance.now();
    const tex0 = this.preparer.stats.textures;
    const budget = this.scheduler.budgetMs;
    if (budget < LOAD_BUDGET_MS) this.scheduler.budgetMs = LOAD_BUDGET_MS;
    try {
      await this.preparer.prepare(this.scene, P0).promise;
    } finally {
      this.scheduler.budgetMs = budget;
    }
    const shown: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    const held: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && !this.preparer.isPrepared(o)) {
        if (o.visible) {
          held.push(o);
          o.visible = false;
        }
        return;
      }
      if (!o.visible) {
        shown.push(o);
        o.visible = true;
      }
      if ((o as THREE.Mesh).isMesh && o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    try {
      this.render();
    } finally {
      for (const o of shown) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
      for (const o of held) o.visible = true;
    }
    this.render();
    const programs = (this.renderer.info.programs ?? []).length;
    return { ms: Math.round(performance.now() - t0), textures: this.preparer.stats.textures - tex0, programs };
  }

  render(): void {
    if (this.opts.gpu?.valid && !this.opts.gpu.valid()) return;
    if (this.post) this.post.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    const keep = !!this.opts.gpu;
    this.preparer.dispose();
    if (this.opts.gpu?.preparation && this.opts.loader) this.opts.loader.manager.release(this.opts.loader.owner);
    if (!keep) this.post?.dispose();
    if (keep) this.sky?.removeFromParent();
    this.materials?.dispose(keep);
    const skeletons = new Set<THREE.Skeleton>();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (keep && (o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton);
      if (!mesh.isMesh) return;
      if (!keep || !this.sharedGeo.has(mesh.geometry)) mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    for (const sk of skeletons) sk.dispose();
    if (!keep) this.renderer.dispose();
  }
}
