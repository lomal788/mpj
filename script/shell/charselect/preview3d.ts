/**
 * 카드 3D 미리보기 — 슬롯마다 렌더 타깃 하나(원본 SelectPC_Camera ×4·그래픽 레이어 1~4, docs 5.5·5.6·7.2).
 * 카메라: 눈 = selectCharacterList (CamX, CamY, CamZ), 대상 = (CamX, CamY, 0) [추정: 인자 순서], fovY = FovY°, aspect = x_pict_3d 폭/높이,
 * near/far 0.1/1000 [추정]. 모델: 위치 0·회전 단위·배율 IndividualScale. 모션: 대기 co_idle00(요시·캐서린 co_chr_idle00), 결정 a → b.
 * 조명 [근사]: 평행광 색 0.6038·회전 (−30°, 0, 0) [데이터 cmm_dir_light00] + 반구광(IBL 대체). 그림자·톤맵·FXAA 생략.
 * 몸 알베도 UV 규칙(mpjUv)은 09_character.md 의 관측 규칙. 눈 오프셋 = 모션 재질 표 또는 재질 기본값.
 * docs 12.1~12.2:
 * - 메시 보임 = 메시 노드 visBone 뼈의 보임. 뼈 보임 = (지금 모션에 깜빡임 묶음이 있으면 깜빡임 vis) → 지금 모션 vis → 뼈 기본값(extras.visible).
 * - 눈동자 마스크 = albedoMask 면 (1 − 알베도 알파), 아니면 1(docs 12.8 — 12.2 의 _C1 마스크는 회귀라 되돌림).
 * - 정점색 _C1(r/b)은 몸 메시(*_body__*)에서만 눈알 표시로 쓴다: 눈꺼풀. (흰자 칠하기는 docs 12.11 판독으로 없앰)
 * - 몸 재질 셰이더 그래프(docs 12.11) [판독]: 알베도 좌표 = S·(uv0 + Σ k·정점색(_C1/_C2)·파라미터) + O, pc08·09·58 기본색 섞기.
 *   파라미터 = 깜빡임 표 → 지금 모션 표 → 재질 기본값.
 * - 눈꺼풀(셰이더 그래프, 동키콩·가봉) [추정]: eyelid 텍스처를 (frac(t2.x), t2.y − s) 에서 샘플해 덮는다.
 *   s = y + c·(아래 끝 − (가장자리 + y)), c = clamp((x기본 − x)/(x기본 − x최소), 0, 1), (x, y) = material_utility_parameter2/3.
 * stats: 로딩 구간 시간(ms) 기록(docs 12.7 측정).
 * docs 12.10:
 * - 미리 준비: 커서에 가까운 캐릭터부터 읽기(동시 2개) → 숨은 무대에서 조립 → compileAsync → 텍스처 initTexture(프레임마다 하나) → 한 번 그리기.
 *   GPU 단계는 한 프레임에 하나. 준비 안 된 캐릭터의 카드는 비워 둔다(원본 FUN_7100340180 아카이브 미적재 규칙).
 * - 슬롯마다 요청 번호: 최신 요청만 붙이고, 모션 시간축(지금 모션·다음·노드 프레임)은 모델 없이도 흘려 붙일 때 그대로 재생한다.
 * - 시작 프레임: 이전 노드가 없거나 루프면 이름에 "_idle" 이 든 모션은 난수(0..frames−1), 아니면 0(09 §6.4). 블렌드: 노드가 있으면 0.1 s [추정].
 * - 깜빡임 프레임 = 본 모션 노드 프레임(AnimationNodeBundle), 묶음 없는 모션에서는 멈춰 기본값으로.
 * docs/engine/loader_manager.md §13: assetHooks.broker(앱 로더 관리자)가 있으면 받기·풀기를 관리자에 맡긴다 — prefetch(order, now, near) 의
 *   앞 now 명 = 등급 0(커서), 다음 near 명 = 2(주변 칸), 나머지 = 3(lite 면 안 받음). 커서에서 빠진 캐릭터는 내리고, dispose 때 시작 전 요청은 뺀다.
 *   같은 URL 은 다른 Preview3D(광장 플레이어·NPC)·흐름 예측과 한 번만 받는다. GPU 단계(조립·컴파일·텍스처·한 번 그리기)는 지금처럼 이 인스턴스가 한다.
 * docs/engine/chara_assets.md: 모델·모션·텍스처는 공용 assets/chara/. 명세 glb = 모델(클립 없음), anims = 모션 glb(모션 하나에 하나) — 클립은
 *   모델 클립 + 모션 glb 클립을 합쳐 노드 이름으로 건다. anims 가 없으면(옛 명세) 모델 glb 안 클립만.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetHooks } from './assetHooks';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { BodyGraph, CharaSpec, Spec } from './types';

type MatTable = Record<string, Record<string, Record<string, number | number[]>>>;

interface MotionInfo {
  frames: number;
  loop: boolean;
  blinkName?: string;
  matFrames?: number;
  mat?: MatTable;
  visFrames?: number;
  vis?: Record<string, [number, number][]>;
}

type MotionTable = Record<string, MotionInfo>;

interface Loaded {
  gltf: GLTF;
  animGltfs: GLTF[];
  motions: MotionTable;
  eyeMap: THREE.Texture | null;
  lidMap: THREE.Texture | null;
  ms: number;
}

interface EyeUniforms {
  eyeMap: { value: THREE.Texture | null };
  eyeOffset0: { value: THREE.Vector2 };
  eyeOffset1: { value: THREE.Vector2 };
  eyeMaskAlpha: { value: number };
  lidMap: { value: THREE.Texture | null };
  lidOn: { value: number };
  lidShift: { value: THREE.Vector2 };
}

interface BodyUniforms {
  bodyP: { value: THREE.Vector4[] };
  tintColor: { value: THREE.Color };
}

interface Slot {
  rt: THREE.WebGLRenderTarget;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chara: number;
  shown: boolean;
  root: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  blink: THREE.AnimationMixer | null;
  blinkOn: boolean;
  acts: THREE.AnimationAction[];
  clips: Map<string, THREE.AnimationClip>;
  current: string;
  next: string | null;
  /** 본 모션 노드 프레임(모델이 없어도 흐른다) */
  frame: number;
  eye: EyeUniforms | null;
  body: BodyUniforms | null;
  motions: MotionTable;
  matDefaults: Record<string, number[]>;
  visMeshes: Map<string, THREE.Object3D[]>;
  boneDefault: Map<string, boolean>;
  token: number;
  /** 요청 시각·준비 여부(stats) */
  reqAt: number;
  reqReady: boolean;
  /** 첫 그리기 측정 대기 중인 stats 항목 */
  pendingStat: LoadStat | null;
}

type PrepState = 'queued' | 'loading' | 'loaded' | 'compiling' | 'textures' | 'warm' | 'ready' | 'failed';

interface Prep {
  c: CharaSpec;
  state: PrepState;
  loaded: Loaded | null;
  warm: THREE.Object3D | null;
  textures: THREE.Texture[];
  stat: PrepStat;
  /** 관리자에 요청한 등급(-1 = 아직) */
  pri: number;
}

/** 미리 준비 구간별 메인 스레드 시간(ms) — docs 12.10 */
export interface PrepStat {
  pc: string;
  /** 요청부터 glb·motions·눈 텍스처 도착까지(비동기, 막지 않음) */
  fetchMs: number;
  /** 숨은 무대 조립(복제·재질) */
  buildMs: number;
  /** compileAsync 호출의 동기 부분 */
  compileMs: number;
  /** 컴파일 완료 대기(비동기) */
  compileWaitMs: number;
  texCount: number;
  texMs: number;
  texMaxMs: number;
  /** 한 번 그리기(남은 링크·정점 버퍼·뼈 텍스처) */
  warmMs: number;
  /** 화면 시작부터 준비 끝까지 */
  doneAt: number;
}

/** 로딩 구간 시간(ms) — docs 12.7 */
export interface LoadStat {
  pc: string;
  /** 요청 때 이미 준비(읽기·컴파일·텍스처)가 끝나 있었는가 */
  cached: boolean;
  /** glb fetch + 파싱 + 텍스처(눈·눈꺼풀) + motions.json */
  loadMs: number;
  /** 요청부터 모델 조립까지 */
  waitMs: number;
  /** 복제·재질 조립 */
  buildMs: number;
  /** 첫 그리기(셰이더 컴파일·텍스처 올리기 포함, CPU 쪽) */
  firstRenderMs: number;
}

/** 시작 프레임(09 §6.4): 이전 노드가 없거나 루프면 "_idle" 모션은 난수, 아니면 0. 블렌드 = 노드가 있으면 0.1 s [추정] */
export function motionStart(prevLoop: boolean | null, clip: string, frames: number, rand: (n: number) => number): { frame: number; blend: number } {
  const loopPrev = prevLoop === null ? true : prevLoop;
  const frame = loopPrev && clip.includes('_idle') && frames >= 1 ? rand(Math.floor(frames)) : 0;
  return { frame, blend: prevLoop === null ? 0 : 0.1 };
}

function makeScene(env: Spec['env']): THREE.Scene {
  const scene = new THREE.Scene();
  const lc = env.lightColor;
  const dir = new THREE.DirectionalLight(new THREE.Color(lc[0], lc[1], lc[2]), Math.PI);
  const e = new THREE.Euler((env.lightRotDeg[0] * Math.PI) / 180, (env.lightRotDeg[1] * Math.PI) / 180, (env.lightRotDeg[2] * Math.PI) / 180, 'XYZ');
  const d = new THREE.Vector3(0, 0, -1).applyEuler(e);
  dir.position.copy(d.clone().multiplyScalar(-10));
  dir.target.position.set(0, 0, 0);
  scene.add(dir, dir.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6));
  return scene;
}

const BODY_MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
const PARAM_LID = ['material_utility_parameter2', 'material_utility_parameter3'];
const PARAM_ALL = Array.from({ length: 8 }, (_, i) => `material_utility_parameter${i}`);
const COMP_KEY = ['0x00', '0x04', '0x08', '0x0C'];

function paramAt(v: number | number[] | undefined, f: number): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(f)))];
}

function stepAt(steps: [number, number][], f: number): number {
  let v = steps[0]?.[1] ?? 1;
  for (const [fr, val] of steps) {
    if (fr > f) break;
    v = val;
  }
  return v;
}

const wrap = (f: number, n: number | undefined): number => (n && n > 0 ? f % n : f);

function eyeTex(t: THREE.Texture): THREE.Texture {
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function loadTex(url: string): Promise<THREE.Texture> {
  return eyeTex(await assetHooks.loadTexture(url));
}

type FileKind = 'gltf' | 'json' | 'texture';

export class Preview3D {
  private readonly loader = assetHooks.createGltfLoader();
  private readonly preps = new Map<string, Prep>();
  private order: number[] = [];
  private loading = 0;
  private readonly warmScene: THREE.Scene;
  private readonly warmCam = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  private readonly warmRt = new THREE.WebGLRenderTarget(8, 8);
  private readonly t0 = performance.now();
  readonly slots: Slot[] = [];
  readonly stats: LoadStat[] = [];
  readonly prepStats: PrepStat[] = [];

  constructor(
    private readonly spec: Spec,
    private readonly url: (p: string) => string,
    /** 시작 프레임 난수(원본 오프라인 = 비동기 RandModule, 09 §6.4) */
    private readonly rand: (n: number) => number = (n) => Math.floor(Math.random() * n),
  ) {
    this.warmScene = makeScene(spec.env);
    this.warmCam.position.set(0, 50, 300);
    this.warmCam.lookAt(0, 50, 0);
  }

  /** 슬롯 n 개를 (폭, 높이) 렌더 타깃으로 만든다 */
  setup(sizes: [number, number][]): void {
    this.disposeSlots();
    const env = this.spec.env;
    for (const [w, h] of sizes) {
      const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * env.rtScale)), Math.max(1, Math.round(h * env.rtScale)), { samples: 4 });
      // 렌더 타깃 = 선형 색(2D 렌더러도 선형으로 합성), 아래가 v = 0 이라 뒤집는다(userData.flipV)
      rt.texture.userData.flipV = true;
      rt.texture.userData.linear = true;
      const scene = makeScene(env);
      const camera = new THREE.PerspectiveCamera(30, w / h, env.near, env.far);
      this.slots.push({
        rt,
        scene,
        camera,
        chara: -1,
        shown: false,
        root: null,
        mixer: null,
        blink: null,
        blinkOn: false,
        acts: [],
        clips: new Map(),
        current: '',
        next: null,
        frame: 0,
        eye: null,
        body: null,
        motions: {},
        matDefaults: {},
        visMeshes: new Map(),
        boneDefault: new Map(),
        token: 0,
        reqAt: 0,
        reqReady: false,
        pendingStat: null,
      });
    }
  }

  private prep(chara: number): Prep | null {
    const c = this.spec.chars[chara];
    if (!c?.glb) return null;
    let p = this.preps.get(c.pc);
    if (!p) {
      p = {
        c,
        state: 'queued',
        loaded: null,
        warm: null,
        textures: [],
        pri: -1,
        stat: { pc: c.pc, fetchMs: 0, buildMs: 0, compileMs: 0, compileWaitMs: 0, texCount: 0, texMs: 0, texMaxMs: 0, warmMs: 0, doneAt: 0 },
      };
      this.preps.set(c.pc, p);
    }
    return p;
  }

  /**
   * 미리 준비 순서(캐릭터 표 번호, 앞일수록 먼저). 화면이 커서에 가까운 순으로 넘긴다.
   * 관리자가 있으면 앞 now 명은 등급 0, 다음 near 명은 2, 나머지는 3(lite 면 요청 안 함). 등급 0 에서 빠진 캐릭터는 내린다
   */
  prefetch(order: number[], now = order.length, near = 0): void {
    this.order = order.slice();
    for (const i of order) this.prep(i);
    const b = assetHooks.broker;
    if (!b) return;
    const upto = b.lite() ? Math.min(order.length, now + near) : order.length;
    const want = new Map<Prep, number>();
    for (let k = 0; k < upto; k++) {
      const p = this.prep(order[k]);
      if (p && !want.has(p)) want.set(p, k < now ? 0 : k < now + near ? 2 : 3);
    }
    for (const p of this.preps.values()) {
      const to = want.get(p) ?? 3;
      if (p.pri >= 0 && to > p.pri) this.setPri(p, to);
    }
    for (const [p, pri] of want) this.request(p, pri);
  }

  private files(c: CharaSpec): [string, FileKind][] {
    const f: [string, FileKind][] = [[this.url(c.glb!), 'gltf']];
    for (const a of c.anims ?? []) f.push([this.url(a), 'gltf']);
    if (c.motions) f.push([this.url(c.motions), 'json']);
    if (c.eye?.tex) f.push([this.url(c.eye.tex), 'texture']);
    if (c.eye?.lid) f.push([this.url(c.eye.lid.tex), 'texture']);
    return f;
  }

  private request(p: Prep, pri: number): void {
    if (p.state === 'queued') this.startLoad(p, pri);
    else if (p.pri >= 0 && pri < p.pri) this.setPri(p, pri);
  }

  /** 아직 받는 중인 캐릭터의 등급을 바꾼다(올리기 = want, 내리기 = lower) */
  private setPri(p: Prep, pri: number): void {
    const b = assetHooks.broker;
    const up = pri < p.pri;
    p.pri = pri;
    if (!b || p.state !== 'loading') return;
    for (const [u, k] of this.files(p.c)) {
      if (up) b.want(u, k, pri);
      else b.lower(u, pri);
    }
  }

  private startLoad(p: Prep, pri = 0): void {
    const c = p.c;
    p.state = 'loading';
    p.pri = pri;
    this.loading++;
    const t0 = performance.now();
    const b = assetHooks.broker;
    const viaBroker = <T>(url: string, kind: FileKind, direct: () => Promise<T>): Promise<T> => (b?.get(url, kind, pri) as Promise<T> | null) ?? direct();
    const tex = (url: string): Promise<THREE.Texture> => viaBroker<THREE.Texture | null>(url, 'texture', () => Promise.resolve(null)).then((t) => (t ? eyeTex(t.clone()) : loadTex(url)));
    const gltfOf = (url: string): Promise<GLTF> => viaBroker(url, 'gltf', () => this.loader.loadAsync(url)) as Promise<GLTF>;
    void (async () => {
      const [gltf, animGltfs, motions, eyeMap, lidMap] = await Promise.all([
        gltfOf(this.url(c.glb!)),
        Promise.all((c.anims ?? []).map((a) => gltfOf(this.url(a)))),
        c.motions ? viaBroker(this.url(c.motions), 'json', () => fetch(this.url(c.motions!)).then((r) => r.json() as Promise<MotionTable>)) : Promise.resolve({} as MotionTable),
        c.eye?.tex ? tex(this.url(c.eye.tex)) : Promise.resolve(null),
        c.eye?.lid ? tex(this.url(c.eye.lid.tex)) : Promise.resolve(null),
      ]);
      return { gltf, animGltfs, motions, eyeMap, lidMap, ms: performance.now() - t0 };
    })()
      .then((l) => {
        p.loaded = l;
        p.stat.fetchMs = l.ms;
        p.state = 'loaded';
      })
      .catch((e) => {
        console.warn(`charselect: 캐릭터를 읽지 못했다 ${c.pc}`, e);
        p.state = 'failed';
      })
      .finally(() => this.loading--);
  }

  /** 준비 작업(한 프레임에 GPU 단계 하나). render 앞에서 부른다. 지금 슬롯이 원하는 캐릭터가 먼저, 그다음 미리 준비 순서 */
  private pump(gl: THREE.WebGLRenderer): void {
    const want = this.slots.filter((s) => s.shown && !s.root).map((s) => s.chara);
    const seq = [...want, ...this.order];
    const b = assetHooks.broker;
    for (const i of b ? want : seq) {
      if (!b && this.loading >= 2) break;
      const p = this.prep(i);
      if (p?.state === 'queued') this.startLoad(p, 0);
    }
    for (const i of seq) {
      const p = this.prep(i);
      if (!p) continue;
      if (p.state === 'loaded') return this.prepCompile(gl, p);
      if (p.state === 'textures') return this.prepTexture(gl, p);
      if (p.state === 'warm') return this.prepWarm(gl, p);
    }
  }

  private prepCompile(gl: THREE.WebGLRenderer, p: Prep): void {
    const l = p.loaded!;
    let t = performance.now();
    const root = this.buildRoot(p.c, l).root;
    root.traverse((o) => (o.visible = true));
    this.warmScene.add(root);
    p.warm = root;
    p.stat.buildMs = performance.now() - t;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.warmRt);
    t = performance.now();
    const done = gl.compileAsync(this.warmScene, this.warmCam);
    p.stat.compileMs = performance.now() - t;
    gl.setRenderTarget(prev);
    p.state = 'compiling';
    const t1 = performance.now();
    void done.then(() => {
      p.stat.compileWaitMs = performance.now() - t1;
      const set = new Set<THREE.Texture>();
      root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (!m || Array.isArray(m)) return;
        for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) set.add(v as THREE.Texture);
      });
      if (l.eyeMap) set.add(l.eyeMap);
      if (l.lidMap) set.add(l.lidMap);
      const seen = new Set<unknown>();
      p.textures = [...set].filter((x) => (seen.has(x.source) ? false : (seen.add(x.source), true)));
      p.state = 'textures';
    });
  }

  private prepTexture(gl: THREE.WebGLRenderer, p: Prep): void {
    const tex = p.textures.shift();
    if (tex) {
      const t = performance.now();
      gl.initTexture(tex);
      const ms = performance.now() - t;
      p.stat.texCount++;
      p.stat.texMs += ms;
      p.stat.texMaxMs = Math.max(p.stat.texMaxMs, ms);
    }
    if (!p.textures.length) p.state = 'warm';
  }

  private prepWarm(gl: THREE.WebGLRenderer, p: Prep): void {
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.warmRt);
    const t = performance.now();
    gl.render(this.warmScene, this.warmCam);
    p.stat.warmMs = performance.now() - t;
    gl.setRenderTarget(prev);
    if (p.warm) this.warmScene.remove(p.warm);
    p.warm = null;
    p.state = 'ready';
    p.stat.doneAt = performance.now() - this.t0;
    this.prepStats.push(p.stat);
    for (const s of this.slots) if (s.shown && !s.root && this.spec.chars[s.chara]?.pc === p.c.pc) this.attach(s);
  }

  /** 슬롯 캐릭터 바꾸기(5.5): 숨김이면 모델을 지운다. 새 모델은 대기 모션(노드 없음 → "_idle" 이면 난수 시작) */
  setChara(slot: number, chara: number, shown: boolean): void {
    const s = this.slots[slot];
    if (!s) return;
    s.token++;
    if (s.root) s.scene.remove(s.root);
    s.root = null;
    s.mixer = s.blink = null;
    s.blinkOn = false;
    s.acts = [];
    s.eye = null;
    s.body = null;
    s.chara = chara;
    s.shown = shown;
    s.current = '';
    s.next = null;
    s.frame = 0;
    s.pendingStat = null;
    if (!shown) return;
    const c = this.spec.chars[chara];
    s.camera.fov = c.fov;
    s.camera.position.set(c.cam[0], c.cam[1], c.cam[2]);
    s.camera.lookAt(c.cam[0], c.cam[1], 0);
    s.camera.updateProjectionMatrix();
    this.play(slot, c.idle);
    const p = this.prep(chara);
    s.reqAt = performance.now();
    s.reqReady = p?.state === 'ready';
    if (p?.state === 'ready') this.attach(s);
  }

  /** 준비된 캐릭터를 슬롯에 붙인다: 지금 모션 시간축 그대로 걸고 첫 자세를 만든 뒤 그린다(T 포즈 방지) */
  private attach(s: Slot): void {
    const c = this.spec.chars[s.chara];
    const p = this.prep(s.chara);
    if (!p?.loaded || p.state !== 'ready') return;
    const t1 = performance.now();
    this.build(s, c, p.loaded);
    this.applyPlay(s, 0);
    this.pose(s, 0);
    const stat: LoadStat = { pc: c.pc, cached: s.reqReady, loadMs: p.stat.fetchMs, waitMs: t1 - s.reqAt, buildMs: performance.now() - t1, firstRenderMs: -1 };
    this.stats.push(stat);
    s.pendingStat = stat;
  }

  private buildRoot(c: CharaSpec, l: Loaded): { root: THREE.Object3D; eye: EyeUniforms | null; body: BodyUniforms | null } {
    const root = cloneSkinned(l.gltf.scene);
    root.scale.setScalar(c.scale);
    const eye: EyeUniforms | null = l.eyeMap
      ? {
          eyeMap: { value: l.eyeMap },
          eyeOffset0: { value: new THREE.Vector2() },
          eyeOffset1: { value: new THREE.Vector2() },
          eyeMaskAlpha: { value: c.eye?.albedoMask ? 1 : 0 },
          lidMap: { value: l.lidMap },
          lidOn: { value: l.lidMap ? 1 : 0 },
          lidShift: { value: new THREE.Vector2() },
        }
      : null;
    const bg = c.body && (c.body.uv.terms.length || c.body.tint) ? c.body : null;
    const body: BodyUniforms | null = bg
      ? { bodyP: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, tintColor: { value: new THREE.Color(...(bg.tint?.color ?? [0, 0, 0])) } }
      : null;
    const cache = new Map<string, THREE.Material>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (src.name !== 'body_m' || !src.isMeshStandardMaterial) return;
      // 알베도 좌표 기본 변환 = 셰이더 판독 S·O(docs 12.11), 표가 없으면 가로세로 비 규칙(mpjUv)
      const so: UvSO | null = c.body
        ? [c.body.uv.s, c.body.uv.o]
        : o.userData.mpjUv === 'v2'
          ? [[1, 0.5], [0, 0.5]]
          : o.userData.mpjUv === 'u2'
            ? [[0.5, 1], [0, 0]]
            : null;
      const g = mesh.geometry;
      const useEye = !!eye && src.name === (c.eye?.material ?? 'body_m') && !!g.getAttribute('uv1');
      const key = `${so ? so.flat().join(',') : ''}|${useEye}`;
      let m = cache.get(key);
      if (!m) {
        m = bodyMaterial(src, so, useEye ? eye : null, bg, body, c.pc);
        cache.set(key, m);
      }
      mesh.material = m;
      if (bg) {
        const n = g.getAttribute('position').count;
        for (const [name, from] of [['bodyC1', '_c1'], ['bodyC2', '_c2']] as const)
          if (!g.getAttribute(name)) g.setAttribute(name, g.getAttribute(from) ?? new THREE.BufferAttribute(new Float32Array(n * 4), 4));
      }
      if (useEye) {
        const n = g.getAttribute('position').count;
        if (!g.getAttribute('eyeUv')) g.setAttribute('eyeUv', g.getAttribute('uv1'));
        // 눈알 정점색 _C1 이 없는 메시는 1 (1차 규칙과 같음), 눈 국소 좌표 TEXCOORD_2 가 없으면 눈꺼풀 없음(−1)
        // 눈알 표시 _C1 은 몸 메시만(얼굴·표정 메시의 _C1 은 몇 정점뿐이라 쓰지 않는다, docs 12.8)
        const c1 = o.name.includes('_body__') ? g.getAttribute('_c1') : undefined;
        if (!g.getAttribute('eyeMask')) g.setAttribute('eyeMask', c1 ?? new THREE.BufferAttribute(new Float32Array(n * 4), 4));
        if (!g.getAttribute('eyeT2')) g.setAttribute('eyeT2', g.getAttribute('uv2') ?? new THREE.BufferAttribute(new Float32Array(n * 2).fill(-1), 2));
      }
    });
    return { root, eye, body };
  }

  private build(s: Slot, c: CharaSpec, l: Loaded): void {
    const { root, eye, body } = this.buildRoot(c, l);
    s.visMeshes = new Map();
    s.boneDefault = new Map();
    root.traverse((o) => {
      if (o.userData.visible === false) s.boneDefault.set(o.name, false);
      const vb = o.userData.visBone as string | undefined;
      if (vb && (o as THREE.Mesh).isMesh) {
        let list = s.visMeshes.get(vb);
        if (!list) s.visMeshes.set(vb, (list = []));
        list.push(o);
      }
    });
    s.scene.add(root);
    s.root = root;
    s.mixer = new THREE.AnimationMixer(root);
    s.acts = [];
    const anims = [...l.gltf.animations, ...l.animGltfs.flatMap((g) => g.animations)];
    s.clips = new Map(anims.map((a) => [a.name, a]));
    s.blink = anims.some((a) => a.name === 'fcl_blink00' || a.name === 'fcl_blink00_shape') ? new THREE.AnimationMixer(root) : null;
    s.blinkOn = false;
    s.eye = eye;
    s.body = body;
    s.motions = l.motions;
    const mats = (l.gltf.parser.json.materials ?? []) as { name: string; extras?: { fres?: { params?: Record<string, { value: number[] }> } } }[];
    const bodyMat = mats.find((mm) => mm.name === (c.eye?.material ?? 'body_m'));
    const defs: Record<string, number[]> = {};
    for (const p of [...(c.eye?.params ?? []), ...PARAM_ALL]) if (bodyMat?.extras?.fres?.params?.[p]) defs[p] = bodyMat.extras.fres.params[p].value;
    s.matDefaults = defs;
  }

  /** 모션 재생(next = 끝나면 이어서, 원본 EnqueuePlay). 모델이 없어도 시간축은 바뀐다 */
  play(slot: number, clip: string, next?: string, blendSec?: number): void {
    const s = this.slots[slot];
    if (!s || !s.shown) return;
    const clips = this.spec.chars[s.chara]?.clips;
    const prev = s.current ? (clips?.[s.current]?.loop ?? true) : null;
    const st = motionStart(prev, clip, clips?.[clip]?.frames ?? 0, this.rand);
    s.current = clip;
    s.next = next ?? null;
    s.frame = st.frame;
    if (s.mixer) this.applyPlay(s, prev === null ? st.blend : (blendSec ?? st.blend));
  }

  /** 믹서에 지금 모션을 노드 프레임 s.frame 으로 건다(blend 초 크로스페이드) */
  private applyPlay(s: Slot, blend: number): void {
    const mixer = s.mixer!;
    const info = this.spec.chars[s.chara]?.clips?.[s.current];
    const once = !!info && !info.loop;
    const acts: THREE.AnimationAction[] = [];
    for (const name of [s.current, `${s.current}_shape`]) {
      const clip = s.clips.get(name);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = true;
      a.time = (once ? Math.min(s.frame, info!.frames) : wrap(s.frame, info?.frames)) / 60;
      a.play();
      if (blend > 0 && s.acts.length) a.fadeIn(blend);
      acts.push(a);
    }
    for (const clip of s.clips.values()) {
      const a = mixer.existingAction(clip);
      if (!a || acts.includes(a)) continue;
      if (blend > 0 && s.acts.includes(a)) a.fadeOut(blend);
      else a.stop();
    }
    s.acts = acts;
  }

  /** 믹서를 dt 초 진행하고 깜빡임(프레임 = 본 모션 노드 프레임)·보임·눈을 지금 프레임으로 맞춘다 */
  private pose(s: Slot, dt: number): void {
    const cur = s.motions[s.current];
    const blink = cur?.blinkName ? s.motions[cur.blinkName] : undefined;
    if (!blink && s.blinkOn) {
      s.blink?.stopAllAction();
      s.blinkOn = false;
    }
    s.mixer!.update(dt);
    if (blink && s.blink) {
      for (const name of ['fcl_blink00', 'fcl_blink00_shape']) {
        const clip = s.clips.get(name);
        if (!clip) continue;
        const a = s.blink.clipAction(clip);
        if (!s.blinkOn) a.reset().play();
        a.time = wrap(s.frame, blink.frames) / 60;
      }
      s.blinkOn = true;
      s.blink.update(0);
    }
    const f = cur?.loop ? wrap(s.frame, cur.visFrames ?? cur.frames) : s.frame;
    const bf = blink ? wrap(s.frame, blink.visFrames ?? blink.frames) : 0;
    // 뼈 보임 → 메시 보임 (docs 12.1)
    for (const [bone, meshes] of s.visMeshes) {
      let v: number | undefined;
      if (blink?.vis?.[bone]) v = stepAt(blink.vis[bone], bf);
      else if (cur?.vis?.[bone]) v = stepAt(cur.vis[bone], f);
      const on = v === undefined ? s.boneDefault.get(bone) !== false : v !== 0;
      for (const m of meshes) m.visible = on;
    }
    if (s.eye) this.applyEyes(s, cur, blink, wrap(s.frame, blink?.frames));
    if (s.body) this.applyBody(s, cur, blink, wrap(s.frame, blink?.frames));
  }

  /** 몸 셰이더 그래프 파라미터(docs 12.11): 깜빡임 표 → 지금 모션 표 → 재질 기본값 [순서 추정, 눈꺼풀과 같은 규칙] */
  private applyBody(s: Slot, cur: MotionInfo | undefined, blink: MotionInfo | undefined, bf: number): void {
    const mat = cur?.mat?.body_m;
    const f = cur?.loop ? wrap(s.frame, cur.matFrames ?? cur.frames) : s.frame;
    const bmat = blink?.mat?.body_m;
    const bfm = blink ? wrap(bf, blink.matFrames ?? blink.frames) : 0;
    PARAM_ALL.forEach((p, i) => {
      const d = s.matDefaults[p] ?? [0, 0, 0, 0];
      const v = COMP_KEY.map((k, j) => paramAt(bmat?.[p]?.[k], bfm) ?? paramAt(mat?.[p]?.[k], f) ?? d[j] ?? 0);
      s.body!.bodyP.value[i].set(v[0], v[1], v[2], v[3]);
    });
  }

  /** 1틱(1/60 s): 시간축은 모델이 없어도 흐른다(붙을 때 그 프레임부터) */
  update(): void {
    const dt = 1 / 60;
    this.slots.forEach((s, i) => {
      if (!s.shown || !s.current) return;
      s.frame++;
      const info = this.spec.chars[s.chara]?.clips?.[s.current];
      if (s.next && info && !info.loop && s.frame >= info.frames) {
        this.play(i, s.next);
        if (s.mixer) this.pose(s, 0);
        return;
      }
      if (s.mixer) this.pose(s, dt);
    });
  }

  private applyEyes(s: Slot, cur: MotionInfo | undefined, blink: MotionInfo | undefined, bf: number): void {
    const eye = s.eye!;
    const c = this.spec.chars[s.chara];
    const matName = c.eye?.material ?? 'body_m';
    const mat = cur?.mat?.[matName];
    const f = cur?.loop ? wrap(s.frame, cur.matFrames ?? cur.frames) : s.frame;
    const bmat = blink?.mat?.[matName];
    const bfm = blink ? wrap(bf, blink.matFrames ?? blink.frames) : 0;
    const value = (p: string, comp: string, def: number): number => paramAt(bmat?.[p]?.[comp], bfm) ?? paramAt(mat?.[p]?.[comp], f) ?? def;
    const [p0, p1] = c.eye?.params ?? ['material_utility_parameter1', 'material_utility_parameter0'];
    const d0 = s.matDefaults[p0] ?? [0, 0];
    const d1 = s.matDefaults[p1] ?? [0, 0];
    eye.eyeOffset0.value.set(paramAt(mat?.[p0]?.['0x00'], f) ?? d0[0], paramAt(mat?.[p0]?.['0x04'], f) ?? d0[1]);
    eye.eyeOffset1.value.set(paramAt(mat?.[p1]?.['0x00'], f) ?? d1[0], paramAt(mat?.[p1]?.['0x04'], f) ?? d1[1]);
    const lid = c.eye?.lid;
    if (lid) {
      const shift = (i: number): number => {
        const x = value(PARAM_LID[i], '0x00', lid.x0[i]);
        const y = value(PARAM_LID[i], '0x04', lid.y0[i]);
        const range = lid.x0[i] - lid.xmin[i];
        const k = range > 1e-6 ? Math.min(1, Math.max(0, (lid.x0[i] - x) / range)) : 0;
        return y + k * (lid.bottom - (lid.edge + y));
      };
      eye.lidShift.value.set(shift(0), shift(1));
    }
  }

  render(gl: THREE.WebGLRenderer): void {
    this.pump(gl);
    const prev = gl.getRenderTarget();
    const clear = gl.getClearColor(new THREE.Color());
    const ca = gl.getClearAlpha();
    for (const s of this.slots) {
      gl.setRenderTarget(s.rt);
      gl.setClearColor(0xffffff, 0);
      gl.clear();
      const t0 = performance.now();
      gl.render(s.scene, s.camera);
      if (s.root && s.pendingStat) {
        s.pendingStat.firstRenderMs = performance.now() - t0;
        s.pendingStat = null;
      }
    }
    gl.setRenderTarget(prev);
    gl.setClearColor(clear, ca);
  }

  private disposeSlots(): void {
    for (const s of this.slots) s.rt.dispose();
    this.slots.length = 0;
  }

  dispose(): void {
    this.disposeSlots();
    this.warmRt.dispose();
    const b = assetHooks.broker;
    if (b) for (const p of this.preps.values()) if (p.state === 'loading' && p.pri >= 2) for (const [u] of this.files(p.c)) b.drop(u);
  }
}

type UvSO = [[number, number], [number, number]];

function uvTransform(t: THREE.Texture, so: UvSO): THREE.Texture {
  const c = t.clone();
  c.repeat.set(so[0][0], so[0][1]);
  c.offset.set(so[1][0], so[1][1]);
  c.needsUpdate = true;
  return c;
}

const glslRef = (e: string): string => e.replace(/\bP(\d)\.([xyzw])/g, 'bodyP[$1].$2').replace(/\bc([12])\.([xyzw])/g, 'vBodyC$1.$2');

/** 몸 셰이더 그래프 정점 코드(docs 12.11): bodyD = Σ k·정점색·파라미터 를 알베도·노멀·거칠기·금속 좌표에 더한다(텍스처 변환 S·O 앞) */
function bodyVertex(bg: BodyGraph): string {
  const d = bg.uv.terms.map((t) => `bodyD.${'xy'[t.axis]} += ${t.k.toFixed(6)} * bodyC${t.color[1]}.${t.color[3]} * bodyP[${t.param.slice(-1)}].${t.comp};`).join('\n');
  const maps = [
    ['USE_MAP', 'vMapUv', 'mapTransform', 'MAP_UV'],
    ['USE_NORMALMAP', 'vNormalMapUv', 'normalMapTransform', 'NORMALMAP_UV'],
    ['USE_ROUGHNESSMAP', 'vRoughnessMapUv', 'roughnessMapTransform', 'ROUGHNESSMAP_UV'],
    ['USE_METALNESSMAP', 'vMetalnessMapUv', 'metalnessMapTransform', 'METALNESSMAP_UV'],
  ]
    .map(([def, v, m, uv]) => `#ifdef ${def}\n${v} = ( ${m} * vec3( ${uv} + bodyD, 1 ) ).xy;\n#endif`)
    .join('\n');
  return `{\nvec2 bodyD = vec2(0.0);\n${d}\n${maps}\n}\nvBodyC1 = bodyC1;\nvBodyC2 = bodyC2;`;
}

/** body_m 재질: UV 규칙(S·O + 정점색 오프셋) + 기본색 섞기(docs 12.11) + 눈동자 합성(TEXCOORD_1 − 오프셋, 마스크 = albedoMask 면 1 − 알베도 알파) + 눈꺼풀(docs 12.2·12.8) */
function bodyMaterial(src: THREE.MeshStandardMaterial, so: UvSO | null, eye: EyeUniforms | null, bg: BodyGraph | null, body: BodyUniforms | null, pc: string): THREE.MeshStandardMaterial {
  const m = src.clone();
  if (so) {
    for (const k of BODY_MAPS) {
      const t = m[k];
      if (t) m[k] = uvTransform(t, so);
    }
  }
  if (!eye && !bg) return m;
  m.customProgramCacheKey = () => `charselect-body4|${eye ? 'eye' : ''}|${bg ? pc : ''}`;
  m.onBeforeCompile = (sh) => {
    if (bg && body) {
      Object.assign(sh.uniforms, body);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 bodyC1;\nattribute vec4 bodyC2;\nuniform vec4 bodyP[8];\nvarying vec4 vBodyC1;\nvarying vec4 vBodyC2;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n${bodyVertex(bg)}`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 bodyP[8];\nuniform vec3 tintColor;\nvarying vec4 vBodyC1;\nvarying vec4 vBodyC2;');
      if (bg.tint)
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>\n{\n  float tintM = ${glslRef(bg.tint.mask)};\n  float tintF = ${glslRef(bg.tint.f)};\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tintF + tintColor, tintM);\n}`,
        );
    }
    if (!eye) return;
    Object.assign(sh.uniforms, eye);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 eyeUv;\nattribute vec4 eyeMask;\nattribute vec2 eyeT2;\nvarying vec2 vEyeUv;\nvarying vec4 vEyeMask;\nvarying vec2 vEyeT2;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEyeUv = eyeUv;\nvEyeMask = eyeMask;\nvEyeT2 = eyeT2;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D eyeMap;
uniform sampler2D lidMap;
uniform vec2 eyeOffset0;
uniform vec2 eyeOffset1;
uniform float eyeMaskAlpha;
uniform float lidOn;
uniform vec2 lidShift;
varying vec2 vEyeUv;
varying vec4 vEyeMask;
varying vec2 vEyeT2;
float eyeInside(vec2 uv) { return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float eyeball = max(vEyeMask.r, vEyeMask.b);
  float sclera = mix(1.0, 1.0 - diffuseColor.a, eyeMaskAlpha);
  vec2 e0uv = vec2(vEyeUv.x - eyeOffset0.x, vEyeUv.y + eyeOffset0.y);
  vec2 e1uv = vec2(vEyeUv.x - eyeOffset1.x, vEyeUv.y + eyeOffset1.y);
  vec4 e0 = texture2D(eyeMap, e0uv);
  vec4 e1 = texture2D(eyeMap, e1uv);
  diffuseColor.rgb = mix(diffuseColor.rgb, e0.rgb, e0.a * eyeInside(e0uv) * sclera);
  diffuseColor.rgb = mix(diffuseColor.rgb, e1.rgb, e1.a * eyeInside(e1uv) * sclera);
  if (lidOn > 0.5 && vEyeT2.x >= 0.0) {
    float m0 = vEyeMask.r;
    float s = m0 > 0.5 ? lidShift.x : lidShift.y;
    vec4 lid = texture2D(lidMap, vec2(fract(vEyeT2.x), vEyeT2.y - s));
    diffuseColor.rgb = mix(diffuseColor.rgb, lid.rgb, lid.a * eyeball);
  }
  diffuseColor.a = 1.0;
}`,
      );
  };
  return m;
}
