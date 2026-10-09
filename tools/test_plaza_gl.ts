/**
 * 로더 관리자 4단계(광장 렌더러 하나) 시험 — 노드, 헤드리스 없음. 설계: docs/engine/loader_manager.md §14(확인 표 §14.7).
 * 가짜 렌더러(FakeGl)가 three r180 의 규칙을 흉내 낸다:
 *   프로그램 = cacheKey(재질 종류·customProgramCacheKey·셰이더 단계 번호·defines·맵 유무·그리는 곳 RT/화면) 하나에 하나, 재질마다 usedTimes + 1, 재질 dispose 때 − 1
 *   → 0 이면 삭제, info.programs 공개. ShaderMaterial 의 셰이더 단계 번호는 WebGLShaderCache 처럼 코드마다 하나(쓰는 재질 수), 마지막 재질이 dispose 되면 지우고
 *   다음에 같은 코드가 오면 새 번호 → 프로그램 키가 바뀌어 다시 컴파일된다(three r180 WebGLPrograms.getProgramCacheKey 의 customVertexShaderID). 텍스처 = source × cacheKey 에 GL 텍스처 하나(usedTimes), texture.version 이 바뀌면 source.version 비교로 올림(새 GL 텍스처면 강제),
 *   텍스처 dispose 때 usedTimes − 1 → 0 이면 삭제. 기하 = 처음 그릴 때 올림, dispose 때 내림. render 는 visible·레이어를 따르고 compile 은 전부.
 * 그 위에서 실제 코드(worldStarter → createPlazaWorld → Stage3D·MaterialSetup·ScenePreparer·FrameScheduler, PostChain, PlazaUiView, PlazaGl, FramePacer)를 돌린다.
 * 부품은 흉내: 1P 캐릭터 = 자기 텍스처·재질을 가진 메시(Preview3D 처럼 진입마다 새로), UI = PlazaUiView 를 ui/part.ts 처럼 stage.keep('plaza-ui')에서 꺼내거나 만듦.
 * 시간은 가짜 시계(새 컴파일 1.5 ms·텍스처 0.8 ms·기하 0.3 ms·그리기 0.2 ms), 프레임은 손으로(16 ms).
 * 끝에 실제 광장 데이터(plaza_first.json·manifest·assets-dist/report.json)로 P0 미리 준비 양을 잰다(보고용 수치).
 *
 *   npx tsx tools/test_plaza_gl.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createAssetManager, P0, P1, P2, P3, type AssetHandler, type AssetManagerApi } from '@game/lib/assetcore';
import { Render2D } from '@app/scene/menu/charselect/render2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { parseDecoParam, defaultDecoState } from '@app/scene/world/plaza/deco';
import type { PlazaWorld } from '@app/scene/world/plaza/types';
import { PlazaUiView } from '@app/scene/world/plaza/ui/view';
import { createPlazaWorld, plazaP0Paths } from '@app/scene/world/plaza/world';
import { LOAD_BUDGET_MS, PriorityFloor } from '@app/common/render3d';
import { FramePacer, KEEP_RATIO, PlazaGl, PREWARM_BUDGET_MS, prewarmEnabled, worldStarter, type PlazaWorldJob, type WorldStart } from '../script/view/plazaGl';

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

// ---------------------------------------------------------------- 시계·프레임

const clock = { t: 0, frame: 0 };
const ticks: (() => void)[] = [];
const tick = (fn: () => void): void => void ticks.push(fn);
const flush = async (n = 8): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};
async function frame(): Promise<void> {
  clock.t += 16;
  clock.frame++;
  const q = ticks.splice(0);
  for (const f of q) f();
  await flush();
}
async function until(cond: () => boolean, max = 3000): Promise<number> {
  let n = 0;
  while (!cond() && n < max) {
    await frame();
    n++;
  }
  return n;
}
function settled<T>(p: Promise<T>): { done: boolean; value: T | null; error: unknown } {
  const s = { done: false, value: null as T | null, error: null as unknown };
  p.then(
    (v) => ((s.done = true), (s.value = v)),
    (e: unknown) => ((s.done = true), (s.error = e)),
  );
  return s;
}

// ---------------------------------------------------------------- 가짜 렌더러

interface FakeProgram {
  cacheKey: string;
  usedTimes: number;
  id: number;
}

interface LogRow {
  target: unknown;
  obj: THREE.Object3D;
  autoClear: boolean;
  clear?: boolean;
}

const isDrawable = (o: THREE.Object3D): boolean => !!((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine);

class FakeGl {
  static made = 0;
  readonly info = { programs: [] as FakeProgram[], memory: { textures: 0, geometries: 0 }, render: { calls: 0 } };
  readonly shadowMap = { enabled: false, type: 0 as THREE.ShadowMapType, autoUpdate: true, needsUpdate: false };
  outputColorSpace: string = THREE.SRGBColorSpace;
  toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  autoClear = true;
  readonly n = { compiles: 0, destroyed: 0, texUploads: 0, texDeleted: 0, geoUploads: 0, geoFreed: 0, renders: 0, disposed: 0, lost: 0 };
  readonly log: LogRow[] = [];
  readonly geoUp = new Map<THREE.BufferGeometry, number>();
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly cache = new Map<string, FakeProgram>();
  private readonly stages = new Map<string, { id: number; usedTimes: number }>();
  private readonly matStages = new Map<THREE.Material, string[]>();
  private stageIds = 0;
  private readonly matProgs = new Map<THREE.Material, Set<FakeProgram>>();
  private readonly sources = new Map<unknown, Map<string, { usedTimes: number }>>();
  private readonly srcVer = new Map<unknown, number>();
  private readonly texProps = new Map<THREE.Texture, { version: number; key: string | undefined }>();
  private readonly cc = new THREE.Color(0, 0, 0);
  private ca = 1;
  private scTest = false;
  private w = 1280;
  private h = 720;
  private ids = 0;

  constructor(readonly domElement: HTMLCanvasElement) {
    FakeGl.made++;
  }

  private stageId(code: string): number {
    let s = this.stages.get(code);
    if (!s) this.stages.set(code, (s = { id: this.stageIds++, usedTimes: 0 }));
    return s.id;
  }

  private key(m: THREE.Material): string {
    const sm = m as THREE.ShaderMaterial;
    const st = m as THREE.MeshStandardMaterial;
    if (sm.isShaderMaterial && !this.matStages.has(m)) {
      const codes = [sm.vertexShader, sm.fragmentShader];
      for (const c of codes) {
        this.stageId(c);
        this.stages.get(c)!.usedTimes++;
      }
      this.matStages.set(m, codes);
    }
    return [
      m.type,
      m.customProgramCacheKey(),
      sm.isShaderMaterial ? `${this.stageId(sm.vertexShader)}/${this.stageId(sm.fragmentShader)}` : '',
      JSON.stringify(sm.defines ?? {}),
      !!st.map,
      !!st.lightMap,
      !!st.envMap,
      (m as { fog?: boolean }).fog ?? false,
      this.target ? 'rt' : 'screen',
    ].join('|');
  }

  private program(m: THREE.Material): void {
    const k = this.key(m);
    let p = this.cache.get(k);
    if (!p) {
      p = { cacheKey: k, usedTimes: 0, id: this.ids++ };
      this.cache.set(k, p);
      this.info.programs.push(p);
      this.n.compiles++;
      clock.t += 1.5;
    }
    let set = this.matProgs.get(m);
    if (!set) {
      set = new Set();
      this.matProgs.set(m, set);
      m.addEventListener('dispose', () => this.releaseMaterial(m));
    }
    if (set.has(p)) return;
    set.add(p);
    p.usedTimes++;
  }

  private releaseMaterial(m: THREE.Material): void {
    const set = this.matProgs.get(m);
    this.matProgs.delete(m);
    for (const c of this.matStages.get(m) ?? []) {
      const st = this.stages.get(c)!;
      if (--st.usedTimes === 0) this.stages.delete(c);
    }
    this.matStages.delete(m);
    for (const p of set ?? []) {
      if (--p.usedTimes > 0) continue;
      this.cache.delete(p.cacheKey);
      this.info.programs.splice(this.info.programs.indexOf(p), 1);
      this.n.destroyed++;
    }
  }

  private texKey(t: THREE.Texture): string {
    return [t.wrapS, t.wrapT, t.magFilter, t.minFilter, t.flipY, t.colorSpace, t.generateMipmaps, t.format, t.type].join(',');
  }

  private texture(t: THREE.Texture): void {
    if (t.isRenderTargetTexture || t.version === 0) return;
    let tp = this.texProps.get(t);
    if (tp && tp.version === t.version) return;
    if (!tp) {
      tp = { version: -1, key: undefined };
      this.texProps.set(t, tp);
      t.addEventListener('dispose', () => this.releaseTexture(t));
    }
    const ck = this.texKey(t);
    let per = this.sources.get(t.source);
    if (!per) this.sources.set(t.source, (per = new Map()));
    let force = false;
    if (tp.key !== ck) {
      let e = per.get(ck);
      if (!e) {
        per.set(ck, (e = { usedTimes: 0 }));
        force = true;
        this.info.memory.textures++;
      }
      e.usedTimes++;
      tp.key = ck;
    }
    if (this.srcVer.get(t.source) !== t.source.version || force) {
      this.n.texUploads++;
      clock.t += 0.8;
      this.srcVer.set(t.source, t.source.version);
    }
    tp.version = t.version;
  }

  private releaseTexture(t: THREE.Texture): void {
    const tp = this.texProps.get(t);
    this.texProps.delete(t);
    const per = this.sources.get(t.source);
    const e = tp?.key !== undefined ? per?.get(tp.key) : undefined;
    if (!e || !per) return;
    if (--e.usedTimes > 0) return;
    per.delete(tp!.key!);
    this.n.texDeleted++;
    this.info.memory.textures--;
    if (!per.size) this.sources.delete(t.source);
  }

  private geometry(g: THREE.BufferGeometry): void {
    if (this.geoUp.has(g)) return;
    this.geoUp.set(g, (this.geoUp.get(g) ?? 0) + 1);
    this.n.geoUploads++;
    clock.t += 0.3;
    g.addEventListener('dispose', () => {
      if (!this.geoUp.delete(g)) return;
      this.n.geoFreed++;
    });
  }

  private materialTextures(m: THREE.Material): void {
    for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) this.texture(v as THREE.Texture);
    const u = (m as THREE.ShaderMaterial).uniforms;
    if (u) for (const x of Object.values(u)) if ((x?.value as THREE.Texture)?.isTexture) this.texture(x.value as THREE.Texture);
  }

  private draw(o: THREE.Object3D): void {
    const mesh = o as THREE.Mesh;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      this.program(m);
      this.materialTextures(m);
    }
    this.geometry(mesh.geometry);
  }

  render(scene: THREE.Object3D, camera: THREE.Camera): void {
    this.n.renders++;
    clock.t += 0.2;
    this.log.push({ target: this.target, obj: scene, autoClear: this.autoClear });
    const visit = (o: THREE.Object3D): void => {
      if (!o.visible) return;
      if (isDrawable(o) && o.layers.test(camera.layers)) this.draw(o);
      for (const c of o.children) visit(c);
    };
    visit(scene);
  }

  compile(scene: THREE.Object3D): void {
    scene.traverse((o) => {
      if (!isDrawable(o)) return;
      const mesh = o as THREE.Mesh;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m) this.program(m);
    });
  }

  compileAsync(scene: THREE.Object3D): Promise<THREE.Object3D> {
    this.compile(scene);
    return Promise.resolve(scene);
  }

  initTexture(t: THREE.Texture): void {
    this.texture(t);
  }

  setRenderTarget(t: THREE.WebGLRenderTarget | null): void {
    this.target = t;
  }
  getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }
  clear(): void {
    this.log.push({ target: this.target, obj: new THREE.Object3D(), autoClear: this.autoClear, clear: true });
  }
  setClearColor(c: THREE.ColorRepresentation, a = 1): void {
    this.cc.set(c);
    this.ca = a;
  }
  getClearColor(out: THREE.Color): THREE.Color {
    return out.copy(this.cc);
  }
  getClearAlpha(): number {
    return this.ca;
  }
  getScissor(v: THREE.Vector4): THREE.Vector4 {
    return v.set(0, 0, this.w, this.h);
  }
  setScissor(): void {}
  setScissorTest(on: boolean): void {
    this.scTest = on;
  }
  getScissorTest(): boolean {
    return this.scTest;
  }
  getDrawingBufferSize(v: THREE.Vector2): THREE.Vector2 {
    return v.set(this.w, this.h);
  }
  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  setPixelRatio(): void {}
  dispose(): void {
    this.n.disposed++;
  }
  forceContextLoss(): void {
    this.n.lost++;
  }
}

const asGl = (f: FakeGl): THREE.WebGLRenderer => f as unknown as THREE.WebGLRenderer;

interface FakeNode {
  parent: FakeHost | null;
  remove(): void;
}
class FakeHost {
  readonly children: FakeNode[] = [];
  append(...xs: FakeNode[]): void {
    for (const x of xs) {
      x.remove();
      this.children.push(x);
      x.parent = this;
    }
  }
}
function fakeCanvas(): HTMLCanvasElement & FakeNode {
  const listeners = new Map<string, () => void>();
  const c = {
    className: '',
    parent: null as FakeHost | null,
    remove(): void {
      const p = c.parent;
      if (!p) return;
      p.children.splice(p.children.indexOf(c), 1);
      c.parent = null;
    },
    addEventListener(n: string, fn: () => void): void {
      listeners.set(n, fn);
    },
    removeEventListener(n: string): void {
      listeners.delete(n);
    },
    fire(n: string): void {
      listeners.get(n)?.();
    },
  };
  return c as unknown as HTMLCanvasElement & FakeNode;
}

// ---------------------------------------------------------------- 가짜 광장 데이터(관리자 처리기)

const MODELS = ['A', 'B', 'C', 'ShopD'];
const LAYOUT = MODELS.map((k) => ({ key: k, archive: '', dir: 'model' as const, fmdb: `m${k}`, hookKey: '', hookNode: '', nbmap: '', anim: '', flgDeco: false }));
const POST = { exposure: 1, exposureOffset: 0, outputScale: 1, bloom: true, bloomThreshold: 1, bloomIntensity: 0.1, bloomSpread: 1, bloomClip: 10, fxaa: true, fxaaEdgeThreshold: 0.1, fxaaEdgeThresholdMin: 0.05, fxaaSubPixel: 0.5, lut: null };
const JSONS: Record<string, unknown> = {
  'plaza/world/manifest.json': {
    models: Object.fromEntries(MODELS.map((k) => [`m${k}`, { url: `model/m${k}.glb`, bytes: 1000, clips: {} }])),
    textures: Object.fromEntries(MODELS.map((k) => [`lm_${k}`, { files: [`lm_${k}.png`], srgb: false, cube: false }])),
    anims: {},
    env: { post: POST, clear: [0.2, 0.3, 0.4] },
    plaza: { layout: LAYOUT, cameraParam: {}, collision: 'col.json', defaultAnims: {} },
  },
  'plaza/world/col.json': {},
  'plaza/world/plaza_first.json': { v: 1, first: ['A', 'B'], hosts: [], bounds: { A: [0, 0, 0, 1], B: [2, 0, 0, 1], C: [10, 0, 0, 1], ShopD: [100, 0, 0, 1] }, start: [0, 0, 0], tex: {} },
};

const img = (): { width: number; height: number } => ({ width: 64, height: 64 });
const templateGeos = new Set<THREE.BufferGeometry>();
const templateTex = new Set<THREE.Texture>();
const managerTex = new Set<THREE.Texture>();

function gltfFor(key: string): { scene: THREE.Group; animations: THREE.AnimationClip[] } {
  const k = /m(\w+)\.glb$/.exec(key)![1];
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const map = new THREE.Texture(img() as unknown as HTMLImageElement);
    map.needsUpdate = true;
    templateTex.add(map);
    const m = new THREE.MeshStandardMaterial({ map, name: `mat_${k}_${i}` });
    m.userData.fres = {
      name: `mat_${k}_${i}`,
      shader: { options: { static_opt_gi_diffuse_texture: '1', static_opt_fog: i ? '1' : '0' } },
      samplers: [{ slots: ['gi_diffuse_texture2d'], texture: `lm_${k}` }],
      params: {},
    };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    templateGeos.add(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = `${k}_${i}`;
    g.add(mesh);
  }
  return { scene: g, animations: [] };
}

function texFor(): THREE.Texture {
  const t = new THREE.Texture(img() as unknown as HTMLImageElement);
  t.needsUpdate = true;
  managerTex.add(t);
  return t;
}

const handlers: AssetHandler<any, any>[] = [
  { kind: 'json', fetch: (_u, key) => Promise.resolve(JSONS[key]) },
  { kind: 'gltf', fetch: (_u, key) => Promise.resolve(gltfFor(key)) },
  { kind: 'texture', fetch: () => Promise.resolve(texFor()) },
];

const mgr = createAssetManager({ env: { now: () => clock.t, tick }, resolve: (k) => k, handlers });
const reqLog: { op: string; key: string; pri: number; frame: number; phase: string }[] = [];
let phase = 'setup';
const spy = new Proxy(mgr as unknown as AssetManagerApi, {
  get(t, p, r) {
    const v = Reflect.get(t, p, r) as unknown;
    if (p === 'get' || p === 'want' || p === 'raise')
      return (...a: unknown[]) => {
        reqLog.push({ op: p, key: a[0] as string, pri: (p === 'raise' ? a[1] : a[2]) as number, frame: clock.frame, phase });
        return (v as (...x: unknown[]) => unknown).apply(t, a);
      };
    return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
  },
});

const starter = worldStarter({
  modules: async () => ({ createPlazaWorld, parseDecoParam, PriorityFloor, LOAD_BUDGET_MS, manager: spy }),
  tick,
  assetsRoot: 'mem/',
  gltfTextures: false,
});
const jobs: PlazaWorldJob[] = [];
const fakes: FakeGl[] = [];
let budget = 2e9;
let warmDisposed = 0;
const warmPcs: string[] = [];

function makeGl(): PlazaGl {
  return new PlazaGl({
    createCanvas: () => fakeCanvas(),
    createRenderer: (c) => {
      const f = new FakeGl(c);
      fakes.push(f);
      return asGl(f);
    },
    startWorld: (o: WorldStart) => {
      const j = starter(o);
      jobs.push(j);
      return j;
    },
    warmChara: async (w, pc) => {
      warmPcs.push(pc);
      const ch = charaMesh(`warm_${pc}`);
      ch.visible = false;
      w.stage.scene.add(ch);
      await w.stage.prepareModel(ch, P2).promise;
      ch.removeFromParent();
      return {
        dispose: () => {
          warmDisposed++;
          (ch.material as THREE.Material).dispose();
          ((ch.material as THREE.MeshToonMaterial).map as THREE.Texture).dispose();
        },
      };
    },
    gpuBudget: () => budget,
  });
}

/** 부품 캐릭터 몫(Preview3D 처럼 자기 텍스처·재질 — 광장 무대 밖 자원) */
function charaMesh(name: string): THREE.Mesh {
  const map = new THREE.Texture(img() as unknown as HTMLImageElement);
  map.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshToonMaterial({ map }));
  m.name = name;
  return m;
}

const UI_SPEC = { screen: [1920, 1080], srgb: [], textures: {}, fonts: {}, layouts: {}, texts: {}, sounds: {} };
function uiView(gl: THREE.WebGLRenderer): PlazaUiView {
  const r2d = new Render2D(UI_SPEC as unknown as Spec);
  return Reflect.construct(PlazaUiView as unknown as new (...a: unknown[]) => PlazaUiView, [UI_SPEC, gl, r2d, (p: string) => p]);
}

const snap = (f: FakeGl): FakeGl['n'] => ({ ...f.n });
const diff = (a: FakeGl['n'], b: FakeGl['n']): Record<string, number> => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v - a[k as keyof FakeGl['n']]]));

/** 진입 한 번: 부품(1P 캐릭터·UI) 붙이고 warmup → 첫 그리기(무대 + UI). 돌려준 것으로 나간다 */
async function enterPlaza(gl: PlazaGl, host: FakeHost, params: URLSearchParams, pc: string): Promise<{ world: PlazaWorld; prewarmed: boolean; view: PlazaUiView; chara: THREE.Mesh; frames: number; logFrom: number }> {
  const e = gl.enter(host as unknown as HTMLElement, params);
  const s = settled(e.world);
  const n = await until(() => s.done);
  if (s.error) throw s.error;
  const world = s.value!;
  const stage = world.stage;
  const chara = charaMesh(`player_${pc}`);
  stage.scene.add(chara);
  const kept = stage.keep?.get('plaza-ui') as PlazaUiView | undefined;
  const view = kept ?? uiView(stage.renderer);
  if (!kept) stage.keep?.set('plaza-ui', view);
  const w = settled(stage.warmup());
  await until(() => w.done);
  stage.budget(4);
  const logFrom = (stage.renderer as unknown as FakeGl).log.length;
  stage.render();
  view.begin();
  view.end();
  gl.entered();
  return { world, prewarmed: e.prewarmed, view, chara, frames: n, logFrom };
}

function leavePlaza(gl: PlazaGl, r: { world: PlazaWorld; view: PlazaUiView; chara: THREE.Mesh }): void {
  gl.leave(r.world.stage.scene, () => {
    if (!r.world.stage.keep) r.view.dispose();
    r.chara.removeFromParent();
    (r.chara.material as THREE.Material).dispose();
    ((r.chara.material as THREE.MeshToonMaterial).map as THREE.Texture).dispose();
    r.chara.geometry.dispose();
    r.world.stage.dispose();
  });
}

const report: Record<string, unknown> = {};

console.log('1. 작은 부품(FramePacer·PriorityFloor·켜기 조건)');
{
  const q: (() => void)[] = [];
  const p = new FramePacer((fn) => void q.push(fn));
  const got: number[] = [];
  for (let i = 0; i < 3; i++) void p.wait()!.then(() => got.push(i));
  eq([q.length, p.waiting], [1, 3], '기다림 3개에 tick 요청 1개');
  q.shift()!();
  await flush();
  eq(got, [0], '프레임 하나에 하나만 풀림');
  q.shift()!();
  await flush();
  eq(got, [0, 1], '다음 프레임에 다음 것');
  p.flush();
  await flush();
  eq(got, [0, 1, 2], 'flush 면 남은 것 전부');
  eq(p.wait(), null, 'flush 뒤에는 바로(null)');

  const f = new PriorityFloor(P2);
  eq([f.key('a', P0), f.key('b', P1), f.key('c', P3)], [P2, P2, P3], '바닥보다 높은 등급은 바닥으로, 낮은 것은 그대로');
  eq(f.keys, [['a', P0], ['b', P1]], '바닥에 걸린 것만 적음');
  const seen: number[] = [];
  f.onLower((to) => seen.push(to, f.keys.length));
  f.lower(P0);
  eq([seen, f.value, f.keys.length], [[P0, 2], P0, 0], '내릴 때 적은 것을 넘기고 비움');
  f.lower(P1);
  eq(f.value, P0, '올리지는 않음');

  const P = (s: string): URLSearchParams => new URLSearchParams(s);
  eq([prewarmEnabled(P('plaza=1')), prewarmEnabled(P('loader=seq')), prewarmEnabled(P('nowarm=1')), prewarmEnabled(P('plazagl=0'))], [true, false, false, false], '미리 준비 켜기 조건');
}

const params = new URLSearchParams('plaza=1');
const host = new FakeHost();
const gl = makeGl();

console.log('2. 미리 준비(인원 설정·캐릭터 선택에 있는 동안) — 화면 밖 캔버스, 바닥 P2, 모델 하나씩, 예산 2 ms');
let prewarmWorld: PlazaWorld;
{
  phase = 'prewarm';
  const sch = mgr.scheduler;
  sch.budgetMs = 4;
  eq(gl.prewarm(params), true, '미리 준비 시작');
  eq(gl.prewarm(params), false, '두 번 불러도 하나');
  gl.hintChara('pc05');
  eq([gl.contexts, fakes.length, host.children.length], [1, 1, 0], '렌더러 1개(화면에 안 붙음)');
  const s = settled(jobs[0].world);
  const frameMs: number[] = [];
  let prevT = 0;
  let maxSched = 0;
  const frames = await until(() => {
    const st = sch.stats;
    if (st.lastMs > maxSched) maxSched = st.lastMs;
    frameMs.push(clock.t - prevT);
    prevT = clock.t;
    return s.done && warmPcs.length > 0 && gl.debug().prewarming === true && fakes[0].n.compiles > 0 && (sch.pending === 0);
  });
  if (s.error) console.log((s.error as Error).stack);
  ok(!s.error, `world 만들기 오류 없음 ${String(s.error)}`);
  prewarmWorld = s.value!;
  await until(() => sch.pending === 0);
  await flush(20);
  const f = fakes[0];
  const pre = reqLog.filter((r) => r.phase === 'prewarm');
  ok(pre.length > 0 && pre.every((r) => r.pri >= P2), `미리 준비 중 관리자 요청 등급 ≥ P2 (${pre.length}건, 최소 ${Math.min(...pre.map((r) => r.pri))})`);
  const gltfFrames = pre.filter((r) => r.op === 'get' && r.key.endsWith('.glb')).map((r) => r.frame);
  ok(gltfFrames.length === 2 && new Set(gltfFrames).size === 2, `P0 모델 조립이 서로 다른 프레임(속도 조절): ${JSON.stringify(gltfFrames)}`);
  ok(sch.stats.maxMs <= PREWARM_BUDGET_MS + 3 + 0.5, `스케줄러 프레임당 최대 ${sch.stats.maxMs.toFixed(1)} ms ≤ 예산 ${PREWARM_BUDGET_MS} + 단위 하나(컴파일 2개 3 ms + 그리기)`);
  eq(sch.budgetMs, 4, '미리 준비가 끝나면 예산을 앞 값으로 되돌림');
  const models = prewarmWorld.stage.loadedModels();
  eq(models.sort(), ['A', 'B'], '미리 만든 world = P0 모델만(P1·P3 는 진입 뒤)');
  eq(prewarmWorld.stage.unpreparedVisible().count, 0, '보이는데 GPU 준비 안 된 메시 0');
  const postPrograms = f.info.programs.filter((p) => p.cacheKey.startsWith('ShaderMaterial')).length;
  ok(postPrograms >= 5, `후처리 프로그램 미리 컴파일(RT 4 + 화면 1): ${postPrograms}`);
  ok(f.info.programs.some((p) => p.cacheKey.startsWith('MeshToonMaterial')), '1P 캐릭터(힌트 pc05) 재질 프로그램 미리 컴파일');
  eq(warmPcs, ['pc05'], '힌트 캐릭터 1명만');
  report.prewarm = { frames, compiles: f.n.compiles, texUploads: f.n.texUploads, geoUploads: f.n.geoUploads, schedMaxMs: +sch.stats.maxMs.toFixed(2), requests: pre.length };
  console.log('  미리 준비:', JSON.stringify(report.prewarm));
}

console.log('3. 진입 — 미리 만든 world 넘겨받기, 남은 일 = 새 부품 몫만');
let visit1: Awaited<ReturnType<typeof enterPlaza>>;
{
  phase = 'enter1';
  const f = fakes[0];
  const a = snap(f);
  visit1 = await enterPlaza(gl, host, params, 'pc05');
  const d = diff(a, snap(f));
  eq([visit1.prewarmed, visit1.world === prewarmWorld, gl.stats.adopted, gl.stats.fresh], [true, true, 1, 0], '미리 만든 world 를 그대로 씀');
  eq([fakes.length, gl.contexts, host.children.length], [1, 1, 1], '새 렌더러 0, 문맥 1, 캔버스 붙음');
  eq(mgr.scheduler.budgetMs, 4, 'warmup 뒤 플레이 예산');
  eq(d.compiles, 2, `진입 때 새 컴파일 = UI 2(내보내기·합성 — 레이아웃 사각형은 그릴 것이 있으면 +1)만, 무대·후처리·1P 캐릭터는 미리 준비됨 (${d.compiles})`);
  eq(d.texUploads, 1, `진입 때 텍스처 업로드 = 1P 캐릭터 자기 텍스처 1장만 (${d.texUploads})`);
  report.enter1 = { compiles: d.compiles, texUploads: d.texUploads, geoUploads: d.geoUploads, frames: visit1.frames };
  console.log('  진입(미리 준비 있음) 남은 일:', JSON.stringify(report.enter1));

  console.log('4. 그리기 순서 — 3D(후처리 끝 = 화면) 다음 UI(선형 RT → 8비트 RT → 화면 프리멀티 합성)');
  const lastFrame = f.log.slice(visit1.logFrom);
  const shader = (r: LogRow): string => ((r.obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.fragmentShader ?? '';
  const iFxaa = lastFrame.findIndex((r) => r.target === null && /FXAA|_ContrastThreshold/.test(shader(r)));
  const view = visit1.view as unknown as { target: unknown; ldr: unknown; r2d: Render2D };
  const iR2d = lastFrame.findIndex((r) => r.obj === view.r2d.scene);
  const iOut = lastFrame.findIndex((r) => r.target === view.ldr && !r.clear);
  const iComp = lastFrame.findIndex((r, i) => i > iOut && r.target === null && !r.clear);
  ok(iFxaa >= 0 && iR2d > iFxaa && iOut > iR2d && iComp > iOut, `순서 FXAA(화면) ${iFxaa} < UI 레이아웃 ${iR2d} < UI 내보내기 ${iOut} < 합성(화면) ${iComp}`);
  eq(lastFrame[iR2d]?.target === view.target, true, 'UI 레이아웃은 UI 선형 RT 에');
  const uiRows = lastFrame.slice(iR2d - 1);
  ok(uiRows.every((r) => !r.clear || r.target !== null), 'UI 패스는 화면(3D 결과)을 지우지 않음');
  ok(uiRows.filter((r) => !r.clear).every((r) => !r.autoClear), 'UI 패스 동안 autoClear 끔');
  const comp = (lastFrame[iComp].obj.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
  eq([comp.blending, comp.blendSrc, comp.blendDst, comp.blendEquation], [THREE.CustomBlending, THREE.OneFactor, THREE.OneMinusSrcAlphaFactor, THREE.AddEquation], '합성 = 프리멀티 over(ONE, ONE_MINUS_SRC_ALPHA)');
  const r = asGl(f);
  eq([r.autoClear, r.getRenderTarget(), r.getClearColor(new THREE.Color()).toArray().map((x) => +x.toFixed(3)), r.getClearAlpha()], [true, null, [0.2, 0.3, 0.4], 1], 'UI 뒤 렌더러 상태 되돌림(autoClear·타깃·무대 지우기 색)');
  eq(gl.stats.renderers, 1, 'UI 용 렌더러 없음(무대 렌더러 하나)');
}

console.log('5. 나가기 — 프로그램 고정, 관리자 몫 GPU 데이터 남김, 무대 전용만 버림');
{
  const f = fakes[0];
  const a = snap(f);
  let tplGeoDisposed = 0;
  for (const g of templateGeos) g.addEventListener('dispose', () => tplGeoDisposed++);
  let mgrTexDisposed = 0;
  for (const t of managerTex) t.addEventListener('dispose', () => mgrTexDisposed++);
  const progs = f.info.programs.length;
  leavePlaza(gl, visit1);
  const d = diff(a, snap(f));
  eq([gl.stats.pinned, d.destroyed], [progs, 0], `프로그램 ${progs}개 고정, 삭제 0`);
  eq([tplGeoDisposed, d.geoFreed], [0, 1], '관리자 템플릿 기하 dispose 0 (내린 기하 = 부품 캐릭터 1 — 후처리·UI 는 렌더러 수명 keep)');
  eq(mgrTexDisposed, 0, '관리자 캐시 텍스처(원본) dispose 0');
  eq(d.texDeleted, 1, 'GL 텍스처 삭제 = 부품 캐릭터 1장만(라이트맵 복제는 남김)');
  eq([d.disposed, d.lost, gl.contexts, host.children.length, gl.inside], [0, 0, 1, 0, false], '렌더러 그대로, 캔버스만 뗌');
  ok(gl.stats.keptBytes > 0 && gl.stats.keptBytes < budget * KEEP_RATIO, `들고 있을 양 ${gl.stats.keptBytes} B < 예산 × ${KEEP_RATIO}`);
  report.leave = { pinned: progs, keptBytes: gl.stats.keptBytes };
}

console.log('6. 재진입(모드 메뉴 → 광장 복귀, 미리 준비 없음) — 새 렌더러 0, 새 컴파일 0, 무대 업로드 0');
let visit2: Awaited<ReturnType<typeof enterPlaza>>;
{
  phase = 'enter2';
  const f = fakes[0];
  const a = snap(f);
  const tplUp = [...templateGeos].map((g) => f.geoUp.get(g) ?? 0);
  visit2 = await enterPlaza(gl, host, params, 'pc05');
  const d = diff(a, snap(f));
  eq([visit2.prewarmed, gl.stats.fresh, fakes.length, FakeGl.made], [false, 1, 1, 1], '새 world(미리 준비 없음)·새 렌더러 0');
  eq(d.compiles, 0, `재진입 새 컴파일 0 (${d.compiles})`);
  eq(d.texUploads, 1, `재진입 텍스처 업로드 = 부품 캐릭터 자기 텍스처 1장만 (${d.texUploads})`);
  const reused = visit2.world.stage.preparer.stats.reused;
  eq(reused, 2, `복제가 올린 source.version 되돌림 = 라이트맵 복제 A·B 2회 → 다시 올리기 0`);
  const tplUp2 = [...templateGeos].map((g) => f.geoUp.get(g) ?? 0);
  eq(tplUp2.filter((v, i) => v !== tplUp[i]).length, 0, '관리자 템플릿 기하 다시 올리기 0');
  const enter2Pri = reqLog.filter((r) => r.phase === 'enter2' && r.op !== 'raise');
  ok(enter2Pri.some((r) => r.pri === P0), '미리 준비 없는 진입은 바닥 없음(P0 요청 있음)');
  report.enter2 = { compiles: d.compiles, texUploads: d.texUploads, geoUploads: d.geoUploads, reusedVersions: reused, frames: visit2.frames };
  console.log('  재진입 남은 일:', JSON.stringify(report.enter2));
  leavePlaza(gl, visit2);
}

console.log('7. 비교 — 이전 방식(진입마다 새 문맥)이면 재진입 때');
{
  phase = 'old';
  const f = new FakeGl(fakeCanvas());
  const job = starter({ gpu: { renderer: asGl(f), uploads: new WeakMap(), keep: new Map() }, params, prewarm: false });
  const s = settled(job.world);
  await until(() => s.done);
  const w = s.value!;
  w.stage.scene.add(charaMesh('player_old'));
  const view = uiView(w.stage.renderer);
  const ws = settled(w.stage.warmup());
  await until(() => ws.done);
  w.stage.render();
  view.begin();
  view.end();
  report.oldReenter = { compiles: f.n.compiles, texUploads: f.n.texUploads, geoUploads: f.n.geoUploads };
  console.log('  이전 방식 재진입:', JSON.stringify(report.oldReenter));
  ok(f.n.compiles > 3 && f.n.texUploads > 1, '이전 방식은 다시 컴파일·업로드(비교 기준)');
  view.dispose();
  w.stage.dispose();
  mgr.scheduler.budgetMs = 4;
}

console.log('8. GPU 예산 — 들고 있을 양이 예산 × 0.6 을 넘으면 문맥째 내림');
{
  phase = 'budget';
  const v = await enterPlaza(gl, host, params, 'pc05');
  budget = 1000;
  const f = fakes[0];
  leavePlaza(gl, v);
  eq([f.n.disposed, f.n.lost, gl.contexts, gl.stats.drops], [1, 1, 0, 1], '내림 = dispose + forceContextLoss, 문맥 0');
  budget = 2e9;
  const v2 = await enterPlaza(gl, host, params, 'pc05');
  eq([fakes.length, gl.contexts], [2, 1], '다음 진입에 새 렌더러 1개');
  leavePlaza(gl, v2);
  (fakes[1].domElement as unknown as { fire(n: string): void }).fire('webglcontextlost');
  const v3 = await enterPlaza(gl, host, params, 'pc05');
  eq([fakes.length, fakes[1].n.disposed, gl.contexts], [3, 1, 1], '문맥을 잃었으면 다음 진입 때 버리고 새로');
  ok(!gl.prewarm(params), '광장 안에서는 미리 준비 안 함');
  leavePlaza(gl, v3);
}

console.log('9. 코드 경계·문맥 수(정적)');
{
  const src = (p: string): string => readFileSync(join(WEB, p), 'utf8');
  const plazaFiles = (dir: string): string[] => readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? plazaFiles(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
  const makers = plazaFiles('script/app/scene/world/plaza').filter((p) => /new THREE\.WebGLRenderer\(/.test(src(p)));
  eq(makers, [], '광장 셸(UI 포함)에서 렌더러 만들기 0');
  ok(/opts\.gpu\?\.renderer \?\? new THREE\.WebGLRenderer\(/.test(src('script/app/common/render3d/stage.ts')), '무대는 gpu 렌더러가 있으면 만들지 않음');
  ok(/plazaGl\(\)/.test(src('script/plaza_page.ts')) && /gl\.leave\(/.test(src('script/plaza_page.ts')), '광장 페이지 = 앱 수명 렌더러 사용');
  const core = src('script/game/lib/assetcore/index.ts');
  eq((core.match(/^import /gm) ?? []).length, 0, '코어 import 0');
  const adapterImports = [...src('script/game/lib/assetcore-three/index.ts').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  ok(adapterImports.every((m) => m === 'three' || m === '../assetcore'), `어댑터 import ⊂ {three, 코어}: ${adapterImports.join(',')}`);
  const glStatic = [...src('script/view/plazaGl.ts').matchAll(/^import (?!type).* from '([^']+)'/gm)].map((m) => m[1]);
  ok(glStatic.every((m) => ['three', '@game/lib/assetcore', '@game/lib/assetcore-three', '../env'].includes(m)), `plazaGl 정적 import = three·lib·env 만(광장 코드는 동적): ${glStatic.join(',')}`);
}

console.log('10. 실제 광장 데이터 — P0 미리 준비 양(보고용)');
{
  const W = join(WEB, 'assets', 'plaza', 'world');
  const man = JSON.parse(readFileSync(join(W, 'manifest.json'), 'utf8')) as { models: Record<string, { url: string }>; plaza: Parameters<typeof plazaP0Paths>[1] };
  const first = JSON.parse(readFileSync(join(W, 'plaza_first.json'), 'utf8')) as Parameters<typeof plazaP0Paths>[2];
  const p0 = plazaP0Paths(man.models, man.plaza, first, defaultDecoState(), true);
  const rep = JSON.parse(readFileSync(join(WEB, 'assets-dist', 'report.json'), 'utf8')) as { files: { src: string; kind: string; codec: string; w: number; h: number; alpha: boolean }[] };
  const by = new Map(rep.files.map((f) => [f.src, f]));
  const gpu = (f: { codec: string; w: number; h: number; alpha: boolean }, mobile: boolean): number => f.w * f.h * (4 / 3) * (mobile && f.codec === 'etc1s' && !f.alpha ? 0.5 : 1);
  const tex = p0.filter(([, k]) => k === 'texture').map(([p]) => by.get(`plaza/world/${p}`)).filter((x) => !!x);
  const models = p0.filter(([, k]) => k === 'gltf').length;
  const pc = tex.reduce((s, f) => s + gpu(f!, false), 0) / 1e6;
  const mob = tex.reduce((s, f) => s + gpu(f!, true), 0) / 1e6;
  const all = rep.files.filter((f) => f.kind === 'tex' && f.src.startsWith('plaza/world/tex/'));
  report.realP0 = { models, textures: tex.length, gpuPcMB: +pc.toFixed(1), gpuMobileMB: +mob.toFixed(1), worldTextures: all.length, worldPcMB: +(all.reduce((s, f) => s + gpu(f, false), 0) / 1e6).toFixed(1) };
  console.log('  실제 P0:', JSON.stringify(report.realP0));
  ok(models > 0 && tex.length > 0, '실제 P0 목록');
  ok(pc < (GPU_BUDGET_MOBILE_MB() * KEEP_RATIO), `P0 미리 준비 GPU(PC 추정 ${pc.toFixed(1)} MB) < 모바일 예산 × ${KEEP_RATIO}`);
}

function GPU_BUDGET_MOBILE_MB(): number {
  return 600;
}

console.log(`\n${count - fails}/${count} 통과`);
console.log('수치:', JSON.stringify(report));
if (fails) process.exit(1);
