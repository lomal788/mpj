/**
 * 공용 로더 관리자 three 어댑터 — import 는 three 와 코어(../assetcore)뿐(프로젝트 파일 금지). 설계: docs/engine/loader_manager.md §11.1·§11.3.
 *
 * - ScenePreparer: 물체(모델 뿌리)를 프레임 예산 안에서 GPU 준비 — 텍스처 initTexture(한 장 = 한 단위) → compileAsync 1회(KHR_parallel_shader_compile 이면
 *   비동기 완료까지 기다림) → 메시 묶음을 카메라 레이어로 1×1 렌더해 버퍼·VAO·뼈 텍스처 업로드(ddalkkakrider render-preparation.js prepareScene 과 같은 방법).
 *   작업의 promise 가 풀린 뒤에만 부른 쪽이 visible 을 켠다 → 그리는 순간의 컴파일·업로드 없음.
 * - 셰이더 키는 렌더 타깃 유무(선형 색공간·톤맵)와 빛 수에 따라 달라진다: 장면을 RT 에 그리면(후처리) 1×1 RT 에서, 아니면 캔버스 1×1 가위로 준비하고,
 *   무대의 빛에도 준비 레이어를 켜 둔다(three r180 WebGLPrograms.getParameters·WebGLRenderer.projectObject).
 * - glTF·텍스처 처리기: 로더 인스턴스·읽기 함수는 바깥에서 주입한다. 텍스처 캐시 값은 깨끗한 원본, 쓰는 쪽은 clone()(GPU 데이터는 source 공유).
 * - 렌더러를 오래 들고 쓸 때(uploads 기록): clone()·needsUpdate 는 source.version 을 올려 같은 그림을 다시 올리게 한다 — 이미 올린 source 가
 *   같은 data 객체 그대로면 initTexture 전에 올린 version 으로 되돌린다(GL 텍스처가 지워졌으면 three 가 강제 업로드). docs/engine/loader_manager.md §14.3.
 *   UploadRecord = source → {올린 version, data}, 같은 렌더러를 쓰는 준비기들이 하나를 같이 쓴다(PreparerOptions.uploads, 없으면 되돌리지 않음).
 */
import * as THREE from 'three';
import { RUN_DONE, RUN_MORE, RUN_WAIT, type AssetHandler, type AssetIo, type FrameScheduler, type SchedTask } from '../assetcore';

export const PREP_LAYER = 31;

// ---------------------------------------------------------------- 처리기

export interface GltfParserLike {
  parseAsync(data: ArrayBuffer, path: string): Promise<unknown>;
}

async function okBytes(io: AssetIo | null, url: string): Promise<ArrayBuffer> {
  if (!io) throw new Error('assetcore-three: env.io 가 없다');
  const r = await io.fetch(url);
  if (!r.ok) throw new Error(`assetcore-three: 받기 실패 ${r.status} ${url}`);
  return r.arrayBuffer();
}

/** glTF(glb) — 바이트를 받고(io) 주입한 로더의 parseAsync 로 푼다. 값 = 로더 결과(GLTF, 깨끗한 원본 — 쓰는 쪽이 복제) */
export function gltfHandler(loader: GltfParserLike, kind = 'gltf'): AssetHandler<unknown, ArrayBuffer> {
  return {
    kind,
    fetch: (url, _k, io) => okBytes(io, url),
    decode: (raw, _k, url) => loader.parseAsync(raw, THREE.LoaderUtils.extractUrlBase(url)),
    bytes: (b) => b.byteLength,
  };
}

/** 텍스처 GPU 바이트 추정(압축 = 밉 데이터 합, 그 밖 = 폭 × 높이 × 4 × 밉 4/3) */
export function textureBytes(t: THREE.Texture): number {
  const c = t as THREE.CompressedTexture;
  if (c.isCompressedTexture) {
    let n = 0;
    for (const m of c.mipmaps ?? []) n += (m.data as ArrayBufferView | undefined)?.byteLength ?? 0;
    return n;
  }
  const img = t.image as { width?: number; height?: number } | null;
  const px = (img?.width ?? 0) * (img?.height ?? 0) * 4;
  return t.generateMipmaps ? Math.round((px * 4) / 3) : px;
}

/** 텍스처 — 받기·풀기를 한 번에 하는 읽기 함수를 주입(값 = 깨끗한 원본). dispose = GPU 내림(이미지·밉 데이터는 남아 다시 올리기만) */
export function textureHandler(load: (url: string) => Promise<THREE.Texture>, kind = 'texture'): AssetHandler<THREE.Texture, THREE.Texture> {
  return { kind, fetch: (url) => load(url), gpuBytes: textureBytes, dispose: (t) => t.dispose() };
}

export interface TextureLoaderLike {
  load(url: string, onLoad: (t: THREE.Texture) => void, onProgress?: (e: unknown) => void, onError?: (e: unknown) => void): unknown;
}

/**
 * GLTFLoader 가 텍스처를 읽는 로더 자리(setKTX2Loader 등)에 끼우는 대리 객체 — get(url) 이 Promise 를 주면 관리자 캐시의 원본을 clone 해서 넘기고,
 * null 이면 원래 로더로 읽는다.
 */
export function managedTextureLoader(get: (url: string) => Promise<THREE.Texture> | null, fallback: TextureLoaderLike): TextureLoaderLike {
  return {
    load(url, onLoad, onProgress, onError) {
      const p = get(url);
      if (!p) return fallback.load(url, onLoad, onProgress, onError);
      p.then(
        (t) => onLoad(t.clone()),
        (e: unknown) => onError?.(e),
      );
      return undefined;
    },
  };
}

// ---------------------------------------------------------------- GPU 준비

export interface PreparerOptions {
  renderer: THREE.WebGLRenderer;
  /** 무대 장면(빛·안개·환경맵이 셰이더 키에 들어감) */
  scene: THREE.Scene;
  camera(): THREE.Camera;
  scheduler: FrameScheduler;
  /** 장면을 렌더 타깃에 그리는가(후처리 체인) */
  linear(): boolean;
  layer?: number;
  /** 업로드 렌더 한 단위의 메시 수 */
  meshesPerUnit?: number;
  uploads?: UploadRecord;
}

export type UploadRecord = WeakMap<object, { v: number; data: unknown }>;

const PH_COLLECT = 0;
const PH_TEXTURES = 1;
const PH_COMPILE = 2;
const PH_UPLOAD = 3;
const PH_DONE = 4;

export class PrepJob implements SchedTask {
  schedPri = -1;
  schedGen = 0;
  schedMark = -1;
  readonly promise: Promise<void>;
  phase = PH_COLLECT;
  i = 0;
  compiling = false;
  compiled = false;
  textures: THREE.Texture[] = [];
  meshes: THREE.Object3D[] = [];
  nodes: THREE.Object3D[] = [];
  vis: Uint8Array = new Uint8Array(0);
  cull: Uint8Array = new Uint8Array(0);
  ms = 0;
  private settle: (() => void) | null = null;
  readonly onCompiled: () => void;

  constructor(
    readonly prep: ScenePreparer,
    readonly root: THREE.Object3D,
  ) {
    this.promise = new Promise<void>((r) => (this.settle = r));
    this.onCompiled = () => {
      this.compiled = true;
    };
  }

  get done(): boolean {
    return this.phase === PH_DONE;
  }

  run(): number {
    return this.prep.step(this);
  }

  /** @internal */
  finish(): void {
    this.phase = PH_DONE;
    this.textures.length = this.meshes.length = this.nodes.length = 0;
    const s = this.settle;
    this.settle = null;
    s?.();
  }
}

const isDrawable = (o: THREE.Object3D): boolean => !!((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite);

export class ScenePreparer {
  readonly stats = { jobs: 0, done: 0, textures: 0, compiles: 0, meshes: 0, units: 0, errors: 0, reused: 0 };
  private readonly meshDone = new WeakSet<THREE.Object3D>();
  private readonly texDone = new WeakSet<THREE.Texture>();
  private readonly live = new Set<PrepJob>();
  private readonly layer: number;
  private readonly per: number;
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly scissor = new THREE.Vector4();
  private readonly now: () => number;

  constructor(private readonly o: PreparerOptions) {
    this.layer = o.layer ?? PREP_LAYER;
    this.per = o.meshesPerUnit ?? 32;
    this.now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  }

  /** 뿌리 아래(이미 준비한 메시·텍스처 제외)를 준비하는 작업. promise 가 풀리면 보여도 된다 */
  prepare(root: THREE.Object3D, pri: number): PrepJob {
    const job = new PrepJob(this, root);
    this.live.add(job);
    this.stats.jobs++;
    this.o.scheduler.add(job, pri);
    return job;
  }

  raise(job: PrepJob, pri: number): void {
    if (!job.done) this.o.scheduler.raise(job, pri);
  }

  isPrepared(o: THREE.Object3D): boolean {
    return this.meshDone.has(o);
  }

  get pending(): number {
    return this.live.size;
  }

  /** 진행 중 작업을 모두 끝냄(무대를 버릴 때) — promise 는 풀린다 */
  dispose(): void {
    for (const j of this.live) {
      this.o.scheduler.remove(j);
      j.finish();
    }
    this.live.clear();
    this.rt?.dispose();
    this.rt = null;
  }

  /** @internal 스케줄러가 부르는 한 단위. 예외면 그 작업을 끝냄(보이기는 부른 쪽이 그대로 — 그리는 순간 three 가 처리) */
  step(job: PrepJob): number {
    if (job.phase === PH_DONE) return RUN_DONE;
    try {
      return this.stepInner(job);
    } catch (e) {
      console.warn('assetcore-three: GPU 준비 실패 — 준비 없이 보인다', job.root.name, e);
      this.stats.errors++;
      this.live.delete(job);
      job.finish();
      return RUN_DONE;
    }
  }

  private stepInner(job: PrepJob): number {
    const t0 = this.now();
    this.stats.units++;
    let r: number;
    switch (job.phase) {
      case PH_COLLECT:
        this.collect(job);
        job.phase = PH_TEXTURES;
        r = RUN_MORE;
        break;
      case PH_TEXTURES:
        if (job.i < job.textures.length) {
          const t = job.textures[job.i++];
          if (!this.texDone.has(t)) {
            this.texDone.add(t);
            if (t.version > 0) {
              const up = this.o.uploads;
              const src = t.source as { version: number; data: unknown };
              const was = up?.get(src);
              if (was && was.data === src.data && src.version !== was.v) {
                src.version = was.v;
                this.stats.reused++;
              }
              this.o.renderer.initTexture(t);
              if (up) up.set(src, { v: src.version, data: src.data });
              this.stats.textures++;
            }
          }
          r = RUN_MORE;
        } else {
          job.phase = PH_COMPILE;
          job.i = 0;
          r = RUN_MORE;
        }
        break;
      case PH_COMPILE:
        if (!job.compiling) {
          job.compiling = true;
          this.compile(job);
          r = RUN_WAIT;
        } else if (!job.compiled) r = RUN_WAIT;
        else {
          job.phase = PH_UPLOAD;
          r = RUN_MORE;
        }
        break;
      case PH_UPLOAD:
        if (job.i < job.meshes.length) {
          this.upload(job);
          r = RUN_MORE;
        } else {
          for (let k = 0; k < job.meshes.length; k++) this.meshDone.add(job.meshes[k]);
          this.stats.meshes += job.meshes.length;
          this.stats.done++;
          this.live.delete(job);
          job.ms += this.now() - t0;
          job.finish();
          return RUN_DONE;
        }
        break;
      default:
        r = RUN_DONE;
    }
    job.ms += this.now() - t0;
    return r;
  }

  private collect(job: PrepJob): void {
    const texs = new Set<THREE.Texture>();
    const L = this.layer;
    this.o.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(L);
    });
    job.root.traverse((o) => {
      job.nodes.push(o);
      if (!isDrawable(o) || this.meshDone.has(o)) return;
      job.meshes.push(o);
      const mat = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture && !(v as THREE.Texture).isRenderTargetTexture) texs.add(v as THREE.Texture);
        const u = (m as THREE.ShaderMaterial).uniforms;
        if (u) for (const x of Object.values(u)) if ((x?.value as THREE.Texture)?.isTexture && !(x.value as THREE.Texture).isRenderTargetTexture) texs.add(x.value as THREE.Texture);
      }
    });
    for (let a = job.root.parent; a; a = a.parent) job.nodes.push(a);
    for (const t of texs) if (!this.texDone.has(t)) job.textures.push(t);
    job.vis = new Uint8Array(job.nodes.length);
    job.cull = new Uint8Array(job.meshes.length);
  }

  private target(): THREE.WebGLRenderTarget {
    this.rt ??= new THREE.WebGLRenderTarget(1, 1);
    return this.rt;
  }

  private compile(job: PrepJob): void {
    const r = this.o.renderer;
    const prev = r.getRenderTarget();
    let p: Promise<unknown>;
    try {
      if (this.o.linear()) r.setRenderTarget(this.target());
      p = r.compileAsync(job.root, this.o.camera(), this.o.scene);
    } catch (e) {
      p = Promise.reject(e);
    } finally {
      r.setRenderTarget(prev);
    }
    this.stats.compiles++;
    p.then(job.onCompiled, job.onCompiled);
  }

  private upload(job: PrepJob): void {
    const r = this.o.renderer;
    const cam = this.o.camera();
    const L = this.layer;
    const from = job.i;
    const to = Math.min(job.meshes.length, from + this.per);
    const nodes = job.nodes;
    const meshes = job.meshes;
    const prev = r.getRenderTarget();
    const sm = r.shadowMap;
    const auto = sm.autoUpdate;
    const need = sm.needsUpdate;
    const linear = this.o.linear();
    const scTest = r.getScissorTest();
    const mask = cam.layers.mask;
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    if (linear) r.setRenderTarget(this.target());
    else {
      r.setRenderTarget(null);
      r.getScissor(this.scissor);
      r.setScissorTest(true);
      r.setScissor(0, 0, 1, 1);
    }
    for (let k = 0; k < nodes.length; k++) {
      job.vis[k] = nodes[k].visible ? 1 : 0;
      nodes[k].visible = true;
    }
    for (let k = from; k < to; k++) {
      const m = meshes[k];
      job.cull[k] = m.frustumCulled ? 1 : 0;
      m.frustumCulled = false;
      m.layers.enable(L);
    }
    cam.layers.set(L);
    try {
      r.render(this.o.scene, cam);
    } finally {
      cam.layers.mask = mask;
      for (let k = from; k < to; k++) {
        const m = meshes[k];
        m.frustumCulled = job.cull[k] === 1;
        m.layers.disable(L);
      }
      for (let k = 0; k < nodes.length; k++) nodes[k].visible = job.vis[k] === 1;
      if (!linear) {
        r.setScissor(this.scissor);
        r.setScissorTest(scTest);
      }
      r.setRenderTarget(prev);
      sm.autoUpdate = auto;
      sm.needsUpdate = need;
    }
    job.i = to;
  }
}
