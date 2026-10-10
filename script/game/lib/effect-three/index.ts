/**
 * 이펙트 런타임 three 어댑터 — three + 코어(lib/effect)만. 설계: docs/engine/08_effects.md §14.1·§14.2.
 * 코어가 채운 입자 출력(월드 위치·크기·회전·색 2개·나이·수명·기저)을 이미터 정의마다 InstancedBufferGeometry 하나에 그 순서대로 올리고,
 * 정점 셰이더는 billboard 변환(§6.5: 0 = 화면 정렬, 3 = 메시, 4 = XZ 판)·UV 애니만, 조각 셰이더는 텍스처·색 합성·알파 시험만 한다.
 * 셰이더·텍스처 감김·repeat·재질 값은 mg1801 view/effects.ts 의 웹 구현을 옮겼다(RULES_WEB 에서 그리기 상태가 이전과 같다).
 * 원본 규칙(render 'original'): blend 표 6종(RGB·alpha 별도, §6.6)·isBlendEnable·cull(displaySide)·depthMask·depthFunc·alphaFunc,
 *   billboard 4 = 로컬 Rᵧ·Rₓ·R_z 뒤 (x,y,z)→(x,z,−y)에 이미터 기저(§6.4), mg1800 twinkle FS 변형 4(tex²)·8/11, wave flowmap FS(§6.4).
 * 에셋은 EffectLoader 끼움점으로 받는다(json·texture·gltf) — mpj 는 view/effect.ts 가 Assets(공용 로더 경유 가능)로 만든다.
 * 그리기 순서용 카메라는 배치 메시 onBeforeRender 에서 마지막 카메라 view 행렬을 코어에 넘긴다(다음 sync 에 쓰임, 한 프레임 늦음 [근사]).
 */
import * as THREE from 'three';
import { type EffectCore, type EffectsJson, type EmitterDef, type ParticlePool, type SamplerDef } from '../effect';

/** 에셋 받기 끼움점(경로 = json 기준 상대 경로를 붙인 값) */
export interface EffectLoader {
  json<T>(path: string): Promise<T>;
  texture(path: string): Promise<THREE.Texture>;
  gltf(path: string): Promise<{ scene: THREE.Object3D }>;
}

const VERT = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aScl;
attribute vec4 aRot;
attribute vec4 aC0;
attribute vec4 aC1;
attribute vec4 aMisc;
#ifdef BASIS
attribute vec3 aBx;
attribute vec3 aBy;
attribute vec3 aBz;
#endif
uniform vec4 uUvA[3];
uniform vec4 uUvB[3];
uniform vec2 uInv[3];
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
varying vec4 vC0;
varying vec4 vC1;
varying vec3 vN;
varying vec2 vAge;

mat3 rotZYX(vec3 r) {
  float cx = cos(r.x), sx = sin(r.x), cy = cos(r.y), sy = sin(r.y), cz = cos(r.z), sz = sin(r.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return rz * ry * rx;
}

mat3 rotYXZ(vec3 r) {
  float cx = cos(r.x), sx = sin(r.x), cy = cos(r.y), sy = sin(r.y), cz = cos(r.z), sz = sin(r.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return ry * rx * rz;
}

vec2 uvAt(int i, vec2 uv, float age, float rnd) {
  vec4 a = uUvA[i];
  vec4 b = uUvB[i];
  if (uInv[i].x > 0.5 && fract(rnd * 2.0) < 0.5) uv.x = 1.0 - uv.x;
  if (uInv[i].y > 0.5 && fract(rnd * 4.0) < 0.5) uv.y = 1.0 - uv.y;
  float ang = b.z + b.w * age;
  if (ang != 0.0) {
    float c = cos(ang), s = sin(ang);
    uv = vec2(c * (uv.x - 0.5) - s * (uv.y - 0.5), s * (uv.x - 0.5) + c * (uv.y - 0.5)) + 0.5;
  }
  return uv * a.xy + a.zw + b.xy * age;
}

void main() {
  float age = aPos.w;
  float life = aScl.w;
  vec3 p = aPos.xyz;
  vec3 rot = aRot.xyz;
  vec3 scl = aScl.xyz;
  vec4 mv;
#if BILLBOARD == 3
  mat3 R = rotZYX(rot);
#ifdef BASIS
  R = mat3(aBx, aBy, aBz) * R;
#endif
  mv = viewMatrix * vec4(p + R * (position * scl), 1.0);
  vN = normalize(mat3(viewMatrix) * (R * normal));
#elif BILLBOARD == 4
#ifdef BB4_ORIG
  vec3 q = rotYXZ(rot) * vec3(position.xy * scl.xy, 0.0);
  mat3 E = mat3(aBx, aBy, aBz);
  mv = viewMatrix * vec4(p + E * vec3(q.x, q.z, -q.y), 1.0);
  vN = normalize(mat3(viewMatrix) * (E * vec3(0.0, 1.0, 0.0)));
#else
  float cy = cos(rot.y), sy = sin(rot.y);
  vec2 q = position.xy * scl.xy;
  mv = viewMatrix * vec4(p + vec3(cy * q.x + sy * q.y, 0.0, -sy * q.x + cy * q.y), 1.0);
  vN = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
#endif
#else
  float cz = cos(rot.z), sz = sin(rot.z);
  vec2 q = position.xy * scl.xy;
  mv = viewMatrix * vec4(p, 1.0);
  mv.xy += vec2(cz * q.x - sz * q.y, sz * q.x + cz * q.y);
  vN = vec3(cz * normal.x - sz * normal.y, sz * normal.x + cz * normal.y, normal.z);
#endif
  gl_Position = projectionMatrix * mv;
  vUv0 = uvAt(0, uv, age, aRot.w);
  vUv1 = uvAt(1, uv, age, aMisc.x);
  vUv2 = uvAt(2, uv, age, aRot.w);
#ifdef NO_UV
  vUv2 = vec2(0.5, 0.5 - 0.5 * vN.y);
#endif
  vC0 = aC0;
  vC1 = aC1;
  vAge = vec2(life > 0.0 ? age / life : 0.0, aMisc.y);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform vec3 uRedA;
uniform float uColorScale;
uniform float uAlphaRef;
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
varying vec4 vC0;
varying vec4 vC1;
varying vec3 vN;
varying vec2 vAge;

vec4 texA(sampler2D t, vec2 uv, float redA) {
  vec4 c = texture2D(t, uv);
  if (redA > 0.5) c.a = max(c.r, max(c.g, c.b));
  return c;
}

void main() {
  float fade = vAge.y;
#if FS == 1 || FS == 2
  vec4 t = texA(uTex0, vUv0, uRedA.x);
#if FS == 1
  vec3 tc = t.rgb * t.rgb;
  float tr = t.r * t.r;
#else
  vec3 tc = t.rgb;
  float tr = t.r;
#endif
  vec3 rgb = (vC1.rgb + tc * (vC0.rgb - vC1.rgb)) * uColorScale;
  float a = clamp(clamp(tr * vC0.a, 0.0, 1.0) * fade, 0.0, 1.0);
#elif FS == 3
  float h = fract(vAge.x);
  vec2 d = texture2D(uTex1, vUv1).rg * 0.7400000095367432 - 0.3700000047683716;
  vec4 T0 = texture2D(uTex0, vUv0 - d * h);
  vec4 T1 = texture2D(uTex0, vUv0 - d * fract(h + 0.5));
  float w = 0.5 + 0.5 * cos(6.2831854820251465 * h);
  vec4 t = T0 + (T1 - T0) * w;
  vec3 rgb = t.rgb * vC0.rgb * uColorScale;
  float a = clamp(t.a * vC0.a, 0.0, 1.0) * fade;
#elif MODE == 1
  vec3 n = vN;
#ifndef MESH_NORMAL
  vec3 nm = texture2D(uTex0, vUv0).xyz * 2.0 - 1.0;
  n = normalize(vec3(nm.xy, max(nm.z, 0.0)));
#endif
  vec3 cap = texture2D(uTex1, vec2(0.5 + 0.5 * n.x, 0.5 - 0.5 * n.y)).rgb;
  vec4 t = texA(uTex2, vUv2, uRedA.z);
  vec3 rgb = cap * mix(vC1.rgb, vC0.rgb, t.rgb) * uColorScale;
  float a = vC0.a * vC1.a * t.a * fade;
#else
  vec4 t = texA(uTex0, vUv0, uRedA.x);
#if SAMPLERS >= 2
  t *= texA(uTex1, vUv1, uRedA.y);
#endif
  vec3 rgb = mix(vC1.rgb, vC0.rgb, t.rgb) * uColorScale;
  float a = vC0.a * vC1.a * t.a * fade;
#endif
#if ALPHA_LT
  if (a < uAlphaRef) discard;
#else
  if (a <= uAlphaRef) discard;
#endif
  gl_FragColor = vec4(rgb, a);
#include <colorspace_fragment>
}
`;

function quadGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

const ATTRS = [
  ['aPos', 4],
  ['aScl', 4],
  ['aRot', 4],
  ['aC0', 4],
  ['aC1', 4],
  ['aMisc', 4],
  ['aBx', 3],
  ['aBy', 3],
  ['aBz', 3],
] as const;
type AttrName = (typeof ATTRS)[number][0];

/** 이미터 정의 하나의 그리기 묶음(풀 하나 ↔ 메시 하나) */
class Batch {
  readonly mesh: THREE.Mesh;
  private geo!: THREE.InstancedBufferGeometry;
  private arrays = {} as Record<AttrName, Float32Array>;
  private cap = 0;

  constructor(
    private readonly base: THREE.BufferGeometry,
    material: THREE.ShaderMaterial,
    capacity: number,
    private readonly basis: boolean,
  ) {
    this.mesh = new THREE.Mesh(undefined, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.alloc(capacity);
  }

  private alloc(cap: number): void {
    this.cap = cap;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = this.base.index;
    for (const name of ['position', 'normal', 'uv']) {
      const a = this.base.getAttribute(name);
      if (a) geo.setAttribute(name, a);
    }
    for (const [name, n] of ATTRS) {
      if (!this.basis && (name === 'aBx' || name === 'aBy' || name === 'aBz')) continue;
      const arr = new Float32Array(cap * n);
      this.arrays[name] = arr;
      const attr = new THREE.InstancedBufferAttribute(arr, n);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
    }
    this.geo?.dispose();
    this.geo = geo;
    this.mesh.geometry = geo;
  }

  /** 프레임마다: 바뀐 범위만 올리고, 모두 죽었으면 비운다 */
  flush(pool: ParticlePool): void {
    const n = pool.count;
    if (n > this.cap) {
      let c = this.cap;
      while (c < n) c *= 2;
      this.alloc(c);
    }
    const A = this.arrays;
    const o = pool.order;
    for (let k = 0; k < n; k++) {
      const s = o[k];
      const s3 = s * 3,
        s4 = s * 4,
        k4 = k * 4;
      A.aPos[k4] = pool.oPos[s3];
      A.aPos[k4 + 1] = pool.oPos[s3 + 1];
      A.aPos[k4 + 2] = pool.oPos[s3 + 2];
      A.aPos[k4 + 3] = pool.oMisc[s4];
      A.aScl[k4] = pool.oScl[s3];
      A.aScl[k4 + 1] = pool.oScl[s3 + 1];
      A.aScl[k4 + 2] = pool.oScl[s3 + 2];
      A.aScl[k4 + 3] = pool.oMisc[s4 + 1];
      A.aRot[k4] = pool.oRot[s3];
      A.aRot[k4 + 1] = pool.oRot[s3 + 1];
      A.aRot[k4 + 2] = pool.oRot[s3 + 2];
      A.aRot[k4 + 3] = pool.oMisc[s4 + 2];
      for (let j = 0; j < 4; j++) {
        A.aC0[k4 + j] = pool.oC0[s4 + j];
        A.aC1[k4 + j] = pool.oC1[s4 + j];
      }
      A.aMisc[k4] = pool.oMisc[s4 + 3];
      A.aMisc[k4 + 1] = pool.oFade[s];
      A.aMisc[k4 + 2] = 0;
      A.aMisc[k4 + 3] = 0;
      if (this.basis) {
        const k3 = k * 3,
          s9 = s * 9;
        for (let j = 0; j < 3; j++) {
          A.aBx[k3 + j] = pool.oBasis[s9 + j];
          A.aBy[k3 + j] = pool.oBasis[s9 + 3 + j];
          A.aBz[k3 + j] = pool.oBasis[s9 + 6 + j];
        }
      }
    }
    if (n > 0)
      for (const [name, w] of ATTRS) {
        const attr = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute | undefined;
        if (!attr) continue;
        /* 범위는 쌓기만 한다 — 업로드는 그릴 때 한 번이고 three 가 그 뒤 비운다. 여기서 지우면 같은 프레임 앞 spawn 의 범위가 빠진다 */
        attr.addUpdateRange(0, n * w);
        attr.needsUpdate = true;
      }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  /** 시험용: 지금 올린 값(칸 k 의 속성) */
  read(name: AttrName): Float32Array | undefined {
    return this.arrays[name];
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** blend 표(§6.6) → three 사용자 blend. isBlendEnable=false 는 NoBlending */
function applyBlend(mat: THREE.ShaderMaterial, type: number, enable: boolean): void {
  if (!enable) {
    mat.blending = THREE.NoBlending;
    return;
  }
  const T = THREE;
  const tab: Record<number, [THREE.BlendingSrcFactor, THREE.BlendingDstFactor, THREE.BlendingEquation, THREE.BlendingSrcFactor, THREE.BlendingDstFactor, THREE.BlendingEquation]> = {
    0: [T.SrcAlphaFactor, T.OneMinusSrcAlphaFactor, T.AddEquation, T.OneFactor, T.OneMinusSrcAlphaFactor, T.AddEquation],
    1: [T.SrcAlphaFactor, T.OneFactor, T.AddEquation, T.OneFactor, T.OneFactor, T.AddEquation],
    2: [T.SrcAlphaFactor, T.OneFactor, T.ReverseSubtractEquation, T.OneFactor, T.OneFactor, T.ReverseSubtractEquation],
    3: [T.ZeroFactor, T.SrcColorFactor, T.AddEquation, T.ZeroFactor, T.SrcAlphaFactor, T.AddEquation],
    4: [T.OneMinusDstColorFactor, T.OneFactor, T.AddEquation, T.OneMinusDstAlphaFactor, T.OneFactor, T.AddEquation],
    5: [T.OneFactor, T.OneMinusSrcAlphaFactor, T.AddEquation, T.OneFactor, T.OneMinusSrcAlphaFactor, T.AddEquation],
  };
  const b = tab[type] ?? tab[0];
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = b[0];
  mat.blendDst = b[1];
  mat.blendEquation = b[2];
  mat.blendSrcAlpha = b[3];
  mat.blendDstAlpha = b[4];
  mat.blendEquationAlpha = b[5];
}

const DEPTH_FUNC = [THREE.NeverDepth, THREE.LessDepth, THREE.EqualDepth, THREE.LessEqualDepth, THREE.GreaterDepth, THREE.NotEqualDepth, THREE.GreaterEqualDepth, THREE.AlwaysDepth];

/** 코어 하나를 three 장면에 그린다 */
export class EffectView {
  readonly group = new THREE.Group();
  private data: EffectsJson | null = null;
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly prims = new Map<string, THREE.BufferGeometry>();
  private readonly quad = quadGeometry();
  readonly batches = new Map<ParticlePool, Batch>();
  private readonly order = new Map<EmitterDef, number>();
  private readonly resourceOf = new Map<EmitterDef, string>();
  private orderN = 0;
  private readonly onCam = (_r: unknown, _s: unknown, camera: THREE.Camera): void => {
    this.core.view.set(camera.matrixWorldInverse.elements);
  };

  constructor(
    readonly core: EffectCore,
    readonly parent: THREE.Object3D,
    name = 'effects',
  ) {
    this.group.name = name;
    this.parent.add(this.group);
  }

  get loaded(): boolean {
    return !!this.data;
  }

  /** effects.json 하나 읽기 → 텍스처·프리미티브 → 코어 registry 등록(resources 순서) */
  async load(loader: EffectLoader, jsonPath: string): Promise<EffectsJson> {
    const dir = jsonPath.slice(0, jsonPath.lastIndexOf('/') + 1);
    const data = await loader.json<EffectsJson & { primitivesFile?: string }>(jsonPath);
    await Promise.all(
      Object.entries(data.textures).map(async ([name, t]) => {
        const tex = await loader.texture(`${dir}${t.file}`);
        tex.flipY = false;
        tex.colorSpace = t.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.needsUpdate = true;
        this.textures.set(name, tex);
      }),
    );
    const usesPrim = Object.values(data.sets).some((s) => s.emitters.some(function walk(e: EmitterDef): boolean {
      return !!e.particle.primitive || e.children.some(walk);
    }));
    if (usesPrim) {
      const gltf = await loader.gltf(`${dir}primitives.glb`);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const geometry = m.geometry.clone();
        geometry.userData.hasUv = !!geometry.getAttribute('uv');
        this.prims.set(m.name || o.parent?.name || '', geometry);
      });
    }
    const walk = (e: EmitterDef, res: string): void => {
      this.order.set(e, this.orderN++);
      this.resourceOf.set(e, res);
      e.children.forEach((c) => walk(c, res));
    };
    for (const [n, s] of Object.entries(data.sets)) s.emitters.forEach((e) => walk(e, data.resources?.find((r) => r.sets.includes(n))?.name ?? s.source ?? ''));
    this.core.registry.registerJson(data);
    if (this.data) {
      this.data = { ...this.data, textures: { ...this.data.textures, ...data.textures }, sets: { ...this.data.sets, ...data.sets }, aliases: { ...this.data.aliases, ...data.aliases } };
    } else this.data = data;
    return data;
  }

  /** 코어 출력 → GPU(코어 sync 포함). 렌더 전에 부른다 */
  sync(): void {
    this.core.sync();
    const pools = this.core.pools;
    for (let k = 0; k < pools.length; k++) this.batch(pools[k]).flush(pools[k]);
  }

  /** 풀 하나의 배치(처음 보면 재질을 만든다) */
  batch(pool: ParticlePool): Batch {
    let b = this.batches.get(pool);
    if (b) return b;
    const def = pool.def;
    const prim = def.particle.primitive ? this.prims.get(def.particle.primitive) : undefined;
    if (def.particle.primitive && !prim) this.core.warn(`프리미티브 없음: ${def.particle.primitive}`);
    const base = prim ?? this.quad;
    if (!base.getAttribute('uv')) base.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(base.getAttribute('position').count * 2), 2));
    if (!base.getAttribute('normal')) base.computeVertexNormals();
    const orig = this.core.rules.render === 'original';
    const bb = def.particle.billboardType;
    b = new Batch(base, this.material(def, !!prim && !prim.userData.hasUv), Math.max(16, pool.cap), orig && (bb === 3 || bb === 4));
    b.mesh.renderOrder = 1000 + (this.order.get(def) ?? 0);
    b.mesh.name = def.name;
    b.mesh.onBeforeRender = this.onCam as unknown as THREE.Mesh['onBeforeRender'];
    this.group.add(b.mesh);
    this.batches.set(pool, b);
    return b;
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const g of this.prims.values()) g.dispose();
    this.prims.clear();
    this.quad.dispose();
  }

  private texture(s: SamplerDef | undefined): THREE.Texture | null {
    if (!s) return null;
    const src = this.textures.get(s.texture);
    if (!src) return null;
    const key = `${s.texture}#${s.wrapU}${s.wrapV}`;
    let t = this.textures.get(key);
    if (!t) {
      t = src.clone();
      t.wrapS = s.wrapU === 0 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      t.wrapT = s.wrapV === 0 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      t.needsUpdate = true;
      this.textures.set(key, t);
    }
    return t;
  }

  /** 원본 FS 변형(§6.4): mg1800 twinkle 4 = tex², 8·11 = tex, mg1801 wave 13·15 = flowmap. 그 밖 0 = 웹 합성 [근사] */
  private fsVariant(def: EmitterDef): number {
    const res = this.resourceOf.get(def) ?? '';
    const k = def.orig?.shader?.[0] ?? -1;
    if (res === 'mg/mg1800' && def.name.startsWith('twinkle')) return k === 4 ? 1 : k === 8 || k === 11 ? 2 : 0;
    if (res === 'mg/mg1801' && (k === 13 || k === 15) && def.samplers.some((s) => s.texture.includes('flowmap'))) return 3;
    return 0;
  }

  private material(def: EmitterDef, meshNoUv: boolean): THREE.ShaderMaterial {
    const d = this.data!;
    const c = def.color;
    const orig = this.core.rules.render === 'original';
    const fs = orig ? this.fsVariant(def) : 0;
    const matcap = def.samplers.length >= 3 && def.samplers[0].texture.endsWith('_nml');
    const plain = def.samplers.filter((s) => !s.texture.includes('flowmap'));
    const used = fs === 3 ? def.samplers.slice(0, 2) : matcap ? def.samplers.slice(0, 3) : plain.slice(0, 2);
    const uvA = [0, 1, 2].map((i) => {
      const s = used[i];
      if (!s) return new THREE.Vector4(1, 1, 0, 0);
      const rep = [1, 1];
      if (s.repeat === 1 || s.repeat === 3) rep[0] = 2;
      if (s.repeat === 2 || s.repeat === 3) rep[1] = 2;
      return new THREE.Vector4(rep[0] * (s.scale[0] || 1), rep[1] * (s.scale[1] || 1), s.scroll[0], s.scroll[1]);
    });
    const uvB = [0, 1, 2].map((i) => {
      const s = used[i];
      return s ? new THREE.Vector4(s.scrollAdd[0], s.scrollAdd[1], s.rotation, s.rotationAdd) : new THREE.Vector4();
    });
    const inv = [0, 1, 2].map((i) => new THREE.Vector2(used[i]?.invRandU ?? 0, used[i]?.invRandV ?? 0));
    const redA = new THREE.Vector3(...[0, 1, 2].map((i) => (used[i] && !d.textures[used[i].texture]?.alpha ? 1 : 0)));
    const white = this.textures.get(used[0]?.texture ?? '') ?? null;
    const bb = def.particle.billboardType;
    const defines: Record<string, string | number | boolean> = {
      BILLBOARD: bb === 3 || bb === 4 ? bb : 0,
      MODE: matcap ? 1 : 0,
      SAMPLERS: used.length,
    };
    if (matcap && def.particle.primitive) defines.MESH_NORMAL = 1;
    if (meshNoUv) defines.NO_UV = 1;
    if (orig) {
      defines.FS = fs;
      if (bb === 3 || bb === 4) defines.BASIS = 1;
      if (bb === 4) defines.BB4_ORIG = 1;
      if (def.orig?.alphaFunc === 6) defines.ALPHA_LT = 1;
    }
    const r = def.render;
    const mat = new THREE.ShaderMaterial({
      name: `fx_${def.name}`,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { FS: 0, ALPHA_LT: 0, ...defines },
      uniforms: {
        uUvA: { value: uvA },
        uUvB: { value: uvB },
        uInv: { value: inv },
        uTex0: { value: this.texture(used[0]) ?? white },
        uTex1: { value: this.texture(used[1]) ?? white },
        uTex2: { value: this.texture(used[2]) ?? white },
        uRedA: { value: redA },
        uColorScale: { value: c.colorScale },
        uAlphaRef: { value: r.isAlphaTest ? r.alphaThreshold : -1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: r.isDepthTest,
      side: THREE.DoubleSide,
      blending: r.blendType === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (orig) {
      applyBlend(mat, r.blendType, r.isBlendEnable ?? true);
      mat.depthWrite = !!r.isDepthMask;
      mat.depthFunc = DEPTH_FUNC[def.orig?.depthFunc ?? 3] ?? THREE.LessEqualDepth;
      mat.side = r.displaySide === 1 ? THREE.FrontSide : r.displaySide === 2 ? THREE.BackSide : THREE.DoubleSide;
    }
    return mat;
  }
}
