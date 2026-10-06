/**
 * 카드 3D 미리보기 — 슬롯마다 렌더 타깃 하나(원본 SelectPC_Camera ×4·그래픽 레이어 1~4, docs 5.5·5.6·7.2).
 * 카메라: 눈 = selectCharacterList (CamX, CamY, CamZ), 대상 = (CamX, CamY, 0) [추정: 인자 순서], fovY = FovY°, aspect = x_pict_3d 폭/높이,
 * near/far 0.1/1000 [추정]. 모델: 위치 0·회전 단위·배율 IndividualScale. 모션: 대기 co_idle00(요시·캐서린 co_chr_idle00), 결정 a → b.
 * 조명 [근사]: 평행광 색 0.6038·회전 (−30°, 0, 0) [데이터 cmm_dir_light00] + 반구광(IBL 대체). 그림자·톤맵·FXAA 생략.
 * 몸 알베도 UV 규칙(mpjUv)은 09_character.md 의 관측 규칙. 눈 오프셋 = 모션 재질 표 또는 재질 기본값.
 * docs 12.1~12.2:
 * - 메시 보임 = 메시 노드 visBone 뼈의 보임. 뼈 보임 = (지금 모션에 깜빡임 묶음이 있으면 깜빡임 vis) → 지금 모션 vis → 뼈 기본값(extras.visible).
 * - 눈동자 마스크 = albedoMask 면 (1 − 알베도 알파), 아니면 1(docs 12.8 — 12.2 의 _C1 마스크는 회귀라 되돌림).
 * - 정점색 _C1(r/b)은 몸 메시(*_body__*)에서만 눈알 표시로 쓴다: 흰자 칠하기(sclera, 캐서린)·눈꺼풀.
 * - 눈꺼풀(셰이더 그래프, 동키콩·가봉) [추정]: eyelid 텍스처를 (frac(t2.x), t2.y − s) 에서 샘플해 덮는다.
 *   s = y + c·(아래 끝 − (가장자리 + y)), c = clamp((x기본 − x)/(x기본 − x최소), 0, 1), (x, y) = material_utility_parameter2/3.
 * stats: 로딩 구간 시간(ms) 기록(docs 12.7 측정).
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharaSpec, Spec } from './types';

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
  scleraOn: { value: number };
  scleraColor: { value: THREE.Color };
}

interface Slot {
  rt: THREE.WebGLRenderTarget;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  chara: number;
  root: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  blink: THREE.AnimationMixer | null;
  clips: Map<string, THREE.AnimationClip>;
  current: string;
  next: string | null;
  frame: number;
  blinkFrame: number;
  eye: EyeUniforms | null;
  motions: MotionTable;
  matDefaults: Record<string, number[]>;
  visMeshes: Map<string, THREE.Object3D[]>;
  boneDefault: Map<string, boolean>;
  token: number;
  /** 첫 그리기 측정 대기 중인 stats 항목 */
  pendingStat: LoadStat | null;
}

/** 로딩 구간 시간(ms) — docs 12.7 */
export interface LoadStat {
  pc: string;
  /** 캐시에 있었는가 */
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

const BODY_MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const;
const PARAM_LID = ['material_utility_parameter2', 'material_utility_parameter3'];

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

async function loadTex(url: string): Promise<THREE.Texture> {
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Preview3D {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<Loaded | null>>();
  readonly slots: Slot[] = [];
  readonly stats: LoadStat[] = [];

  constructor(
    private readonly spec: Spec,
    private readonly url: (p: string) => string,
  ) {}

  /** 슬롯 n 개를 (폭, 높이) 렌더 타깃으로 만든다 */
  setup(sizes: [number, number][]): void {
    this.dispose();
    const env = this.spec.env;
    for (const [w, h] of sizes) {
      const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * env.rtScale)), Math.max(1, Math.round(h * env.rtScale)), { samples: 4 });
      // 렌더 타깃 = 선형 색(2D 렌더러도 선형으로 합성), 아래가 v = 0 이라 뒤집는다(userData.flipV)
      rt.texture.userData.flipV = true;
      rt.texture.userData.linear = true;
      const scene = new THREE.Scene();
      const lc = env.lightColor;
      const dir = new THREE.DirectionalLight(new THREE.Color(lc[0], lc[1], lc[2]), Math.PI);
      const e = new THREE.Euler((env.lightRotDeg[0] * Math.PI) / 180, (env.lightRotDeg[1] * Math.PI) / 180, (env.lightRotDeg[2] * Math.PI) / 180, 'XYZ');
      const d = new THREE.Vector3(0, 0, -1).applyEuler(e);
      dir.position.copy(d.clone().multiplyScalar(-10));
      dir.target.position.set(0, 0, 0);
      scene.add(dir, dir.target);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.6));
      const camera = new THREE.PerspectiveCamera(30, w / h, env.near, env.far);
      this.slots.push({
        rt,
        scene,
        camera,
        chara: -1,
        root: null,
        mixer: null,
        blink: null,
        clips: new Map(),
        current: '',
        next: null,
        frame: 0,
        blinkFrame: 0,
        eye: null,
        motions: {},
        matDefaults: {},
        visMeshes: new Map(),
        boneDefault: new Map(),
        token: 0,
        pendingStat: null,
      });
    }
  }

  private load(c: CharaSpec): Promise<Loaded | null> {
    if (!c.glb) return Promise.resolve(null);
    let p = this.cache.get(c.pc);
    if (!p) {
      p = (async () => {
        const t0 = performance.now();
        const [gltf, motions, eyeMap, lidMap] = await Promise.all([
          this.loader.loadAsync(this.url(c.glb!)),
          c.motions ? fetch(this.url(c.motions)).then((r) => r.json() as Promise<MotionTable>) : Promise.resolve({} as MotionTable),
          c.eye?.tex ? loadTex(this.url(c.eye.tex)) : Promise.resolve(null),
          c.eye?.lid ? loadTex(this.url(c.eye.lid.tex)) : Promise.resolve(null),
        ]);
        return { gltf, motions, eyeMap, lidMap, ms: performance.now() - t0 };
      })().catch((e) => {
        console.warn(`charselect: 캐릭터를 읽지 못했다 ${c.pc}`, e);
        return null;
      });
      this.cache.set(c.pc, p);
    }
    return p;
  }

  /** 미리 읽기(전부) */
  preload(): Promise<unknown> {
    return Promise.all(this.spec.chars.map((c) => this.load(c)));
  }

  /** 슬롯 캐릭터 바꾸기(5.5): 숨김이면 모델을 지운다 */
  setChara(slot: number, chara: number, shown: boolean): void {
    const s = this.slots[slot];
    if (!s) return;
    s.token++;
    if (s.root) s.scene.remove(s.root);
    s.root = null;
    s.mixer = s.blink = null;
    s.eye = null;
    s.chara = chara;
    if (!shown) return;
    const c = this.spec.chars[chara];
    s.camera.fov = c.fov;
    s.camera.position.set(c.cam[0], c.cam[1], c.cam[2]);
    s.camera.lookAt(c.cam[0], c.cam[1], 0);
    s.camera.updateProjectionMatrix();
    const token = s.token;
    const cached = this.cache.has(c.pc);
    const t0 = performance.now();
    void this.load(c).then((l) => {
      if (!l || s.token !== token) return;
      const t1 = performance.now();
      this.build(s, c, l);
      const stat: LoadStat = { pc: c.pc, cached, loadMs: cached ? 0 : l.ms, waitMs: t1 - t0, buildMs: performance.now() - t1, firstRenderMs: -1 };
      this.stats.push(stat);
      s.pendingStat = stat;
      this.play(slot, c.idle);
    });
  }

  private build(s: Slot, c: CharaSpec, l: Loaded): void {
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
          scleraOn: { value: c.eye?.sclera ? 1 : 0 },
          scleraColor: { value: new THREE.Color(...(c.eye?.sclera ?? [1, 1, 1])) },
        }
      : null;
    const cache = new Map<string, THREE.Material>();
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
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (src.name !== 'body_m' || !src.isMeshStandardMaterial) return;
      const rule = o.userData.mpjUv as string | undefined;
      const g = mesh.geometry;
      const useEye = !!eye && src.name === (c.eye?.material ?? 'body_m') && !!g.getAttribute('uv1');
      const key = `${rule ?? ''}|${useEye}`;
      let m = cache.get(key);
      if (!m) {
        m = bodyMaterial(src, rule, useEye ? eye : null);
        cache.set(key, m);
      }
      mesh.material = m;
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
    s.scene.add(root);
    s.root = root;
    s.mixer = new THREE.AnimationMixer(root);
    s.clips = new Map(l.gltf.animations.map((a) => [a.name, a]));
    const blinkClips = l.gltf.animations.filter((a) => a.name === 'fcl_blink00' || a.name === 'fcl_blink00_shape');
    s.blink = null;
    if (blinkClips.length) {
      s.blink = new THREE.AnimationMixer(root);
      for (const b of blinkClips) s.blink.clipAction(b).play();
    }
    s.blinkFrame = 0;
    s.eye = eye;
    s.motions = l.motions;
    const mats = (l.gltf.parser.json.materials ?? []) as { name: string; extras?: { fres?: { params?: Record<string, { value: number[] }> } } }[];
    const body = mats.find((mm) => mm.name === (c.eye?.material ?? 'body_m'));
    const defs: Record<string, number[]> = {};
    for (const p of [...(c.eye?.params ?? []), ...PARAM_LID]) if (body?.extras?.fres?.params?.[p]) defs[p] = body.extras.fres.params[p].value;
    s.matDefaults = defs;
  }

  /** 모션 재생(next = 끝나면 이어서, 원본 EnqueuePlay) */
  play(slot: number, clip: string, next?: string): void {
    const s = this.slots[slot];
    if (!s || !s.mixer) {
      if (s) {
        s.current = clip;
        s.next = next ?? null;
      }
      return;
    }
    const a = s.clips.get(clip);
    if (!a) return;
    s.mixer.stopAllAction();
    const info = this.spec.chars[s.chara]?.clips?.[clip];
    const act = s.mixer.clipAction(a);
    act.reset();
    act.setLoop(info && !info.loop ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = true;
    act.play();
    const shape = s.clips.get(`${clip}_shape`);
    if (shape) {
      const sa = s.mixer.clipAction(shape);
      sa.reset();
      sa.setLoop(info && !info.loop ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      sa.clampWhenFinished = true;
      sa.play();
    }
    s.current = clip;
    s.next = next ?? null;
    s.frame = 0;
  }

  /** 1틱(1/60 s) */
  update(): void {
    const dt = 1 / 60;
    this.slots.forEach((s, i) => {
      if (!s.mixer) return;
      const mt = s.motions[s.current];
      const bundled = !!mt?.blinkName;
      s.mixer.update(dt);
      if (bundled) {
        s.blink?.update(dt);
        s.blinkFrame++;
      }
      s.frame++;
      const info = this.spec.chars[s.chara]?.clips?.[s.current];
      if (s.next && info && !info.loop && s.frame >= info.frames) this.play(i, s.next);
      const cur = s.motions[s.current];
      const blink = cur?.blinkName ? s.motions[cur.blinkName] : undefined;
      const f = cur?.loop ? wrap(s.frame, cur.visFrames ?? cur.frames) : s.frame;
      const bf = blink ? wrap(s.blinkFrame, blink.visFrames ?? blink.frames) : 0;
      // 뼈 보임 → 메시 보임 (docs 12.1)
      for (const [bone, meshes] of s.visMeshes) {
        let v: number | undefined;
        if (blink?.vis?.[bone]) v = stepAt(blink.vis[bone], bf);
        else if (cur?.vis?.[bone]) v = stepAt(cur.vis[bone], f);
        const on = v === undefined ? s.boneDefault.get(bone) !== false : v !== 0;
        for (const m of meshes) m.visible = on;
      }
      if (s.eye) this.applyEyes(s, cur, blink, bf);
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
    const prev = gl.getRenderTarget();
    const clear = gl.getClearColor(new THREE.Color());
    const ca = gl.getClearAlpha();
    for (const s of this.slots) {
      gl.setRenderTarget(s.rt);
      gl.setClearColor(0xffffff, 0);
      gl.clear();
      if (s.root) {
        const t0 = performance.now();
        gl.render(s.scene, s.camera);
        if (s.pendingStat) {
          s.pendingStat.firstRenderMs = performance.now() - t0;
          s.pendingStat = null;
        }
      }
    }
    gl.setRenderTarget(prev);
    gl.setClearColor(clear, ca);
  }

  dispose(): void {
    for (const s of this.slots) s.rt.dispose();
    this.slots.length = 0;
  }
}

function uvTransform(t: THREE.Texture, rule: string | undefined): THREE.Texture {
  const c = t.clone();
  if (rule === 'v2') {
    c.repeat.set(1, 0.5);
    c.offset.set(0, 0.5);
  } else if (rule === 'u2') {
    c.repeat.set(0.5, 1);
    c.offset.set(0, 0);
  }
  c.needsUpdate = true;
  return c;
}

/** body_m 재질: UV 규칙 + 흰자 칠하기(캐서린) + 눈동자 합성(TEXCOORD_1 − 오프셋, 마스크 = albedoMask 면 1 − 알베도 알파) + 눈꺼풀(docs 12.2·12.8) */
function bodyMaterial(src: THREE.MeshStandardMaterial, rule: string | undefined, eye: EyeUniforms | null): THREE.MeshStandardMaterial {
  const m = src.clone();
  if (rule) {
    for (const k of BODY_MAPS) {
      const t = m[k];
      if (t) m[k] = uvTransform(t, rule);
    }
  }
  if (!eye) return m;
  m.customProgramCacheKey = () => 'charselect-body-eye3';
  m.onBeforeCompile = (sh) => {
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
uniform float scleraOn;
uniform vec3 scleraColor;
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
  if (scleraOn > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, scleraColor, eyeball);
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
