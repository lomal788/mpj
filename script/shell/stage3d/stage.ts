/**
 * 공용 3D 무대 — three 렌더러·장면·카메라 슬롯·평행광·IBL·안개와, 무대 모델(glb)·클립·재질 애니(fmab)·위치 뼈(로케이터) 조회.
 * 계약은 types.ts, 쓰는 법은 docs/shell/mgmet_3d.md §8.
 *
 * 조명·안개 값은 manifest.env(tools/analysis/mgmet_world_assets.py 가 env 컨테이너 dump 에서 고른 값, 07_camera_lighting.md 7.3~7.5).
 * - 평행광 세기 = 원본 색 × π [근사: mg1801 과 같은 단위 관례]. 그림자맵 하나로 카메라 근처 절두체 조각을 덮는다 [근사: 원본 캐스케이드].
 * - 안개 [근사]: env 의 거리 안개(시작·끝·색)를 three Fog(선형)로.
 * - 톤맵·포스트(post00 블룸 등)는 넣지 않는다 [근사].
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Clip } from './clip';
import { fresOf, MaterialSetup } from './material';
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
  shadow?: { near: number; far: number; offset: number };
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
  /** 원본 World[0x4] 자리(경과 ms [추정]) */
  ms: { value: number };
  /** 표면→태양(월드, 원본 Layer[0x220]) */
  sunDir: { value: THREE.Vector3 };
  env: MatParams;
}

export interface StageCreateOptions {
  canvas: HTMLCanvasElement;
  assets: AssetSource;
  manifest?: string;
  antialias?: boolean;
}

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

const SHADOW_MAP = 2048;
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
/** menu00_sky 상자 반 길이(_p0 범위 ±0.005) [데이터] */
const SKY_HALF = 0.005;

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
  private readonly loader = new GLTFLoader();
  private readonly models = new Map<string, Model>();
  private readonly gltfs = new Map<string, Promise<GLTF>>();
  private readonly clipsLive: { step(df: number): void }[] = [];
  readonly globals: StageGlobals = { time: { value: 0 }, ms: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, env: emptyParams() };
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
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: opts.antialias ?? true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun = new THREE.DirectionalLight(0xffffff, Math.PI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.scene.add(this.sun, this.sun.target);
  }

  static async create(opts: StageCreateOptions): Promise<Stage3D> {
    const s = new Stage3D(opts);
    const t0 = performance.now();
    const res = await fetch(opts.assets.url(opts.manifest ?? 'manifest.json'));
    if (!res.ok) throw new Error(`stage3d manifest 를 읽지 못했다: ${res.status}`);
    s.manifest = (await res.json()) as StageManifest;
    s.env = (s.manifest.env ?? {}) as StageEnv;
    s.materials = new MaterialSetup(opts.assets, s.renderer, s.manifest.textures ?? {});
    s.materials.globals = s.globals;
    for (const d of (s.manifest as unknown as { graphs?: GraphDef[] }).graphs ?? []) (s.materials.graphs[d.material] ??= []).push(d);
    s.applyEnv();
    if (s.env.ibl) await s.materials.loadIbl(s.env.ibl.common, s.env.ibl.chara);
    await s.setupExtras();
    if (s.materials.common) s.scene.environment = s.materials.common.rad;
    else s.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    s.stats.loadMs += performance.now() - t0;
    return s;
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
      this.shadowFar = e.shadow.far;
      this.shadowOffset = e.shadow.offset;
    }
    if (e.clear) this.renderer.setClearColor(new THREE.Color(...e.clear));
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
    if (e.post) {
      const lut = e.post.lut ? await this.materials.texture(e.post.lut) : null;
      if (lut) {
        lut.colorSpace = THREE.NoColorSpace;
        lut.wrapS = lut.wrapT = THREE.ClampToEdgeWrapping;
        lut.generateMipmaps = false;
        lut.minFilter = THREE.LinearFilter;
        lut.needsUpdate = true;
      }
      this.post = new PostChain(this.renderer, e.post, lut);
    }
    if (e.sky && this.manifest.models[e.sky.model]) {
      const gltf = await this.loader.loadAsync(this.opts.assets.url(this.manifest.models[e.sky.model].url));
      const tex = e.sky.texture ? await this.materials.texture(e.sky.texture) : null;
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.needsUpdate = true;
      }
      const root = gltf.scene;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const p0 = (e.sky!.params.skybox_utility_parameter0 as number[] | undefined) ?? [0, 0, 1, 1];
        const m = new THREE.ShaderMaterial({
          uniforms: { mpjSky: { value: tex }, mpjSkyP0: { value: new THREE.Vector4(...(p0 as [number, number, number, number])) } },
          vertexShader: SKY_VS,
          fragmentShader: SKY_FS,
          side: THREE.DoubleSide,
          fog: false,
          depthWrite: false,
          depthTest: false,
        });
        m.userData.fres = fresOf(mesh.material as THREE.Material);
        mesh.material = m;
        mesh.renderOrder = -1000;
        mesh.frustumCulled = false;
      });
      root.name = e.sky.model;
      this.sky = root;
      this.scene.add(root);
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

  async loadModel(name: string, opts: { visible?: boolean; instance?: string } = {}): Promise<StageModel> {
    const id = opts.instance ?? name;
    const have = this.models.get(id);
    if (have) return have;
    const info = this.manifest.models[name];
    if (!info) throw new Error(`stage3d manifest 에 없는 모델: ${name}`);
    const t0 = performance.now();
    let p = this.gltfs.get(info.url);
    const first = !p;
    if (!p) {
      p = this.loader.loadAsync(this.opts.assets.url(info.url));
      this.gltfs.set(info.url, p);
    }
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
        const r = await fetch(this.opts.assets.url(path));
        return r.ok ? ((await r.json()) as FmabJson) : null;
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
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const df = dt * 60;
    this.frame += df;
    this.globals.time.value = this.frame / 60;
    this.globals.ms.value = (this.frame / 60) * 1000;
    for (const c of this.clipsLive) c.step(df);
    for (const u of this.updaters) u.update(df, this.frame);
    for (const x of this.overridden) x.o.update?.(x.mat, this.frame, this.fmabFor(x.name));
    this.cameraDriven = false;
    for (const slot of ['anim', 'follow'] as const) {
      const d = this.cameraDrivers[slot];
      if (d && d.apply(this.camera, df)) {
        this.cameraDriven = true;
        break;
      }
    }
    this.fitShadow();
    if (this.sky) {
      this.sky.position.copy(this.camera.position);
      this.sky.scale.setScalar(this.camera.far * 0.4 / SKY_HALF);
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

  render(): void {
    if (this.post) this.post.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.post?.dispose();
    this.materials?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    this.renderer.dispose();
  }
}
