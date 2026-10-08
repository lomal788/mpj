/**
 * mg1801 이펙트(파티클) — 원본 bex::Effect / nn::vfx2 이미터셋을 웹에서 재현한다.
 *
 * 자료: assets/mg1801/effect/effects.json(tools/mg1801_web_effects.py 가 effect_vfxb.py 덤프 raw 값을 그대로 옮긴 것),
 *       tex/*.png(원본 텍스처 그대로), primitives.glb(BFRES 메시 프리미티브 4개). 명세: docs/engine/08_effects.md.
 *
 * 쓰는 이미터셋: mg1801_steam00/01, mg1801_water_entry00/01, mg1800_success00/01, mg_common_pt_effect_00(PERFECT, 배율 1.5).
 * 로직 사건 별칭: 'ca::rm::util::ShowCommonEffect#0' = mg1800_success01(JUST), '#1' = mg1800_success00(FAST·SLOW).
 * 이름 해석은 원본 3단계(소문자·'/'→'\'·경로 비교, 확장자 제거 뒤 이미터셋 이름 비교)를 이름 비교만으로 줄였다 [판독 3.3].
 * 없는 이름: 원본은 Abort, 웹은 경고 후 -1 을 돌려준다(08_effects.md 10.2).
 *
 * 시간: 원본 vfx2 는 고정 60 fps 프레임 단위다. update(dtSec) 가 dt·60 프레임을 쌓고, 방출은 이미터 정수 프레임마다 한다.
 * 입자 상태는 생성 때 한 번 GPU 인스턴스 속성으로 올리고, 위치·색·크기는 정점 셰이더가 나이(프레임)로 계산한다
 * (원본도 Static 블록을 상수 버퍼로 넘겨 셰이더가 계산한다 [판독 4.3]). 이미터 정의마다 InstancedBufferGeometry 하나(링 버퍼).
 *
 * 원본 판독으로 따른 것 [판독: main vfx2, analysis/decomp/effect_vfx2_calc.c 와 이번에 디컴파일한 함수]:
 * - 방출 난수 = 이미터 LCG x' = x·0x41C64E6D + 0x3039, u = x·2^-32(갱신 전 값).
 * - one-time 보정 duration < interval → interval = duration, 간격 = interval+1 프레임, 방출 창 [start, start+duration).
 * - 한 번 방출 수: CircleDiv(2)·LineDiv(13)·primEmitType 0 이면 (numDivide − ⌊u·divRandom·0.01·numDivide⌋) × rate 개
 *   (FUN_710074f620). 분할 위치 i = 입자 번호 mod (분할 수+1), 각 = 시작 − 경도/2 + 경도/분할 수·i + surfacePosRandom·(2u−1)
 *   (FUN_7100752c38). 원 시작각은 sweepStartRandom 이면 호출 단위 난수 2πu.
 * - Circle(1): 각 = 시작 + 경도·u − 경도/2, 위치 (sin·rx, 0, cos·rz), 방향 = (sin,0,cos)·allDirection (FUN_7100750f28).
 * - Box(10): 면 하나(u<1/3 Z면, <2/3 Y면, 나머지 X면)를 고르고 그 축은 ±반경, 나머지 축은 [−r, r] 균등, 방향 = 정규화(위치)·allDirection.
 * - 크기 난수 = base·(1 − u·scaleRandom/100)(xyz 같으면 난수 하나), 수명 = ⌊L·(1 − ⌊u·lifeRandom⌋/100)⌋,
 *   momentumRandom m → 1 + m − 2um (FUN_710074f880).
 * - xzDiffusion: 속도 += 정규화(위치.xz)·값, positionRandom: 위치 += 단위벡터·값, diffusionDirAngle: cos 범위 1 − 각/90 (FUN_710074fea4 일부).
 *
 * 근사(원본과 다를 수 있는 것):
 * 1. 입자 운동: 프레임마다 v = v·airRes + gravity, p += v 를 닫힌 식으로 계산(08_effects.md 6.3 CPU 근사의 해석식). 원본 셰이더 식 미판독.
 * 2. 색 합성: rgb = mix(color1, color0, tex.rgb) × colorScale, a = alpha0 × alpha1 × texA. 컴바이너 열거 미판독
 *    (color1 이 JUST 주황·FAST 파랑 반짝임을 정하므로 텍스처 보간형으로 둠). 알파 없는 텍스처(BC1·BC7 RGB)는 max(r,g,b) 를 알파로 쓴다.
 *    두 번째 텍스처(같은 그림 스크롤)는 곱한다. flowmap(wave00/01 의 두 번째)은 쓰지 않는다.
 * 3. 커스텀 셰이더(SHADER_1, 샘플러 0 = *_nml, 1 = water_land00_01, 2 = 알베도): water_land00_01 을 매트캡(구형 환경맵)으로 보고
 *    노말(노말맵 또는 메시 법선)로 찾은 색 × 위 2번 색. CSDP 값·굴절·소프트 파티클·깊이 페이드는 쓰지 않는다.
 *    UV 없는 mg1801_bubble00 메시는 알베도를 뷰 법선 y 로 찾는다.
 * 4. 키 보간: 시간 비율 r = 나이/수명, 첫 키 앞은 첫 키, 끝 키 뒤는 끝 키, 사이는 선형(08_effects.md 6.3 [추정]).
 * 5. billboardType: 0 = 화면 정렬 사각형(또는 프리미티브 메시의 xy), 3 = 메시를 월드에 그대로(회전 ZYX), 4 = XZ 수평판(Y 회전).
 *    사각형은 1×1(−0.5..0.5), UV 왼쪽 위 원점(텍스처 flipY=false). 회전 순서 ZYX(= FRES EulerXYZ)는 [추정].
 * 6. 텍스처: wrap 0 = Mirror, 1 = Repeat, repeat 0/1/2/3 = UV 1×1/2×1/1×2/2×2 [데이터·추정 4.4]. invRandU/V = 입자마다 1/2 확률 반전,
 *    텍스처 스크롤·회전·스케일은 uv = 회전(uv) × scale × repeat + scroll + scrollAdd·나이 로 근사.
 * 7. 필드(FRND 흔들림·FSPN 스핀·FRN1)는 적용하지 않는다. 자식 이미터(steam00 bubble00 → crown00)는 부모 입자 나이 ⌊수명·timing/100⌋ 에
 *    그 위치에서 한 번 방출한다. 이미터 회전·크기는 위치·속도에만 적용하고 입자 크기에는 적용하지 않는다.
 * 8. 방출 정지(stop): 연속 방출만 멈추고 남은 입자는 수명대로 사라진다(원본 Stop(bool) 동작 미판독). 레이어 비트·정렬(sortType)·
 *    alphaFadeTime(정지 페이드)·intervalRandom 은 쓰지 않는다. isAlphaFadeIn 은 이미터 시작부터 fadeInTime 프레임 동안 알파를 올린다.
 * 9. Point(0) 방향은 원본 512개 단위벡터 표 대신 LCG 로 고른 균등 단위벡터. Sphere(4)도 같은 단위벡터 × 반경(위도·경도 범위 전체일 때만 맞다).
 *    이미터 LCG 시드는 원본 값을 모른다(시스템 LCG 로 정한다).
 * 10. 깊이 기록은 하지 않는다(isDepthMask 무시, depthWrite false). isDepthTest 는 따른다. 그리기 순서는 이미터셋·이미터 순서.
 * 11. 이미터셋 배율(bex::Effect::SetScale → 내부+0x60, 행렬로 반영)은 방출 위치(모양)·속도·입자 크기에 곱한다. 모양·allDirection 에 곱하는 것은
 *    08_effects.md 4절 [판독], 입자 크기·지정 방향 속도에 곱하는 것은 [추정]. 중력은 곱하지 않는다. SetAnimationSpeed(PlayRate)는 쓰지 않는다(BPM 120 에서 1).
 */
import * as THREE from 'three';
import { loadTexture } from '../../../shell/stage3d/assetLoader';
import type { Assets } from '../../../view/assets';

type Vec3 = { x: number; y: number; z: number };
type Key = [number, number, number, number];

interface SamplerDef {
  slot: number;
  texture: string;
  wrapU: number;
  wrapV: number;
  repeat: number;
  invRandU: number;
  invRandV: number;
  scroll: [number, number];
  scrollAdd: [number, number];
  scale: [number, number];
  rotation: number;
  rotationAdd: number;
}

interface EmitterDef {
  name: string;
  emit: { oneTime: boolean; start: number; timing: number; duration: number; rate: number; rateRandom: number; interval: number; positionRandom: number; emitDist: boolean };
  shape: {
    type: number;
    sweepStartRandom: number;
    sweepLongitude: number;
    sweepStart: number;
    surfacePosRandom: number;
    lineCenter: number;
    lineLength: number;
    radius: [number, number, number];
    formScale: [number, number, number];
    primEmitType: number;
    numDivideCircle: number;
    numDivideCircleRandom: number;
    numDivideLine: number;
    numDivideLineRandom: number;
  };
  trs: { trans: [number, number, number]; transRand: [number, number, number]; rotate: [number, number, number]; scale: [number, number, number] };
  emitterColor0: [number, number, number, number];
  emitterColor1: [number, number, number, number];
  fade: { isAlphaFadeIn: number; fadeInTime: number };
  particle: {
    life: number;
    lifeRandom: number;
    infiniteLife: boolean;
    billboardType: number;
    momentumRandom: number;
    isRotate: [number, number, number];
    rotRevRand: [number, number, number];
    primitive: string | null;
  };
  velocity: {
    allDirection: number;
    designatedDirScale: number;
    designatedDir: [number, number, number];
    diffusionDirAngle: number;
    xzDiffusion: number;
    diffusion: [number, number, number];
    velRandom: number;
  };
  gravity: [number, number, number];
  airRes: number;
  rotate: { init: [number, number, number]; initRand: [number, number, number]; add: [number, number, number]; addRand: [number, number, number]; regist: number };
  color: {
    color0Type: number;
    alpha0Type: number;
    color1Type: number;
    alpha1Type: number;
    color0: [number, number, number];
    alpha0: number;
    color1: [number, number, number];
    alpha1: number;
    colorScale: number;
    color0Keys: Key[];
    alpha0Keys: Key[];
    color1Keys: Key[];
    alpha1Keys: Key[];
  };
  scale: { base: [number, number, number]; random: [number, number, number]; keys: Key[] };
  render: { blendType: number; isDepthTest: boolean; isAlphaTest: boolean; alphaThreshold: number };
  samplers: SamplerDef[];
  children: EmitterDef[];
}

interface EffectsJson {
  aliases: Record<string, string>;
  textures: Record<string, { file: string; srgb: boolean; alpha: boolean }>;
  sets: Record<string, { emitters: EmitterDef[] }>;
}

const FPS = 60;
const MAX_KEYS = 8;
const MAX_CAPACITY = 1 << 18;
const U32 = 2.3283064e-10;
const TWO_PI = Math.PI * 2;

/** 원본 vfx2 이미터 난수 [판독: FUN_710074f620 등] */
class Lcg {
  constructor(public s: number) {}
  raw(): number {
    const r = this.s;
    this.s = (Math.imul(r, 0x41c64e6d) + 0x3039) >>> 0;
    return r;
  }
  next(): number {
    return this.raw() * U32;
  }
}

const VERT = /* glsl */ `
attribute vec4 aP0;
attribute vec4 aV0;
attribute vec4 aRot;
attribute vec4 aRotV;
attribute vec4 aScl;
uniform float uTime;
uniform vec3 uGravity;
uniform float uDrag;
uniform float uRegist;
uniform float uFadeIn;
uniform vec4 uScaleK[${MAX_KEYS}];
uniform int uScaleN;
uniform vec4 uC0[${MAX_KEYS}];
uniform int uC0N;
uniform vec4 uA0[${MAX_KEYS}];
uniform int uA0N;
uniform vec4 uC1[${MAX_KEYS}];
uniform int uC1N;
uniform vec4 uA1[${MAX_KEYS}];
uniform int uA1N;
uniform vec4 uUvA[3];
uniform vec4 uUvB[3];
uniform vec2 uInv[3];
varying vec2 vUv0;
varying vec2 vUv1;
varying vec2 vUv2;
varying vec4 vC0;
varying vec4 vC1;
varying vec3 vN;

vec4 keyAt(vec4 k[${MAX_KEYS}], int n, float r) {
  if (n <= 1 || r <= k[0].w) return k[0];
  for (int i = 1; i < ${MAX_KEYS}; i++) {
    if (i >= n) break;
    if (r <= k[i].w) return mix(k[i - 1], k[i], (r - k[i - 1].w) / max(k[i].w - k[i - 1].w, 1e-6));
  }
  return k[n - 1];
}

mat3 rotZYX(vec3 r) {
  float cx = cos(r.x), sx = sin(r.x), cy = cos(r.y), sy = sin(r.y), cz = cos(r.z), sz = sin(r.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return rz * ry * rx;
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
  float age = uTime - aP0.w;
  float life = aV0.w;
  if (age < 0.0 || age >= life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float r = age / life;
  vec3 p;
  if (abs(1.0 - uDrag) < 1e-5) {
    p = aP0.xyz + aV0.xyz * age + uGravity * (age * (age + 1.0) * 0.5);
  } else {
    float s = uDrag * (1.0 - pow(uDrag, age)) / (1.0 - uDrag);
    p = aP0.xyz + aV0.xyz * s + uGravity / (1.0 - uDrag) * (age - s);
  }
  float rf = abs(1.0 - uRegist) < 1e-5 ? age : (1.0 - pow(uRegist, age)) / (1.0 - uRegist);
  vec3 rot = aRot.xyz + aRotV.xyz * rf;
  vec3 scl = aScl.xyz * keyAt(uScaleK, uScaleN, r).xyz;
  vec4 mv;
#if BILLBOARD == 3
  mat3 R = rotZYX(rot);
  mv = viewMatrix * vec4(p + R * (position * scl), 1.0);
  vN = normalize(mat3(viewMatrix) * (R * normal));
#elif BILLBOARD == 4
  float cy = cos(rot.y), sy = sin(rot.y);
  vec2 q = position.xy * scl.xy;
  mv = viewMatrix * vec4(p + vec3(cy * q.x + sy * q.y, 0.0, -sy * q.x + cy * q.y), 1.0);
  vN = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
#else
  float cz = cos(rot.z), sz = sin(rot.z);
  vec2 q = position.xy * scl.xy;
  mv = viewMatrix * vec4(p, 1.0);
  mv.xy += vec2(cz * q.x - sz * q.y, sz * q.x + cz * q.y);
  vN = vec3(cz * normal.x - sz * normal.y, sz * normal.x + cz * normal.y, normal.z);
#endif
  gl_Position = projectionMatrix * mv;
  vUv0 = uvAt(0, uv, age, aRot.w);
  vUv1 = uvAt(1, uv, age, aRotV.w);
  vUv2 = uvAt(2, uv, age, aRot.w);
#ifdef NO_UV
  vUv2 = vec2(0.5, 0.5 - 0.5 * vN.y);
#endif
  float fade = uFadeIn > 0.0 ? clamp((aScl.w + age) / uFadeIn, 0.0, 1.0) : 1.0;
  vC0 = vec4(keyAt(uC0, uC0N, r).xyz, keyAt(uA0, uA0N, r).x * fade);
  vC1 = vec4(keyAt(uC1, uC1N, r).xyz, keyAt(uA1, uA1N, r).x);
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

vec4 texA(sampler2D t, vec2 uv, float redA) {
  vec4 c = texture2D(t, uv);
  if (redA > 0.5) c.a = max(c.r, max(c.g, c.b));
  return c;
}

void main() {
#if MODE == 1
  vec3 n = vN;
#ifndef MESH_NORMAL
  vec3 nm = texture2D(uTex0, vUv0).xyz * 2.0 - 1.0;
  n = normalize(vec3(nm.xy, max(nm.z, 0.0)));
#endif
  vec3 cap = texture2D(uTex1, vec2(0.5 + 0.5 * n.x, 0.5 - 0.5 * n.y)).rgb;
  vec4 t = texA(uTex2, vUv2, uRedA.z);
  vec3 rgb = cap * mix(vC1.rgb, vC0.rgb, t.rgb) * uColorScale;
#else
  vec4 t = texA(uTex0, vUv0, uRedA.x);
#if SAMPLERS >= 2
  t *= texA(uTex1, vUv1, uRedA.y);
#endif
  vec3 rgb = mix(vC1.rgb, vC0.rgb, t.rgb) * uColorScale;
#endif
  float a = vC0.a * vC1.a * t.a;
  if (a <= uAlphaRef) discard;
  gl_FragColor = vec4(rgb, a);
#include <colorspace_fragment>
}
`;

function keyUniform(type: number, constant: number[], keys: Key[], alpha: boolean): { v: THREE.Vector4[]; n: number } {
  const v = Array.from({ length: MAX_KEYS }, () => new THREE.Vector4());
  if (type === 0 || keys.length === 0) {
    const c = alpha ? [constant[0], constant[0], constant[0]] : constant;
    v[0].set(c[0], c[1], c[2], 0);
    return { v, n: 1 };
  }
  keys.slice(0, MAX_KEYS).forEach((k, i) => v[i].set(k[0], k[1], k[2], k[3]));
  return { v, n: Math.min(keys.length, MAX_KEYS) };
}

function quadGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

interface ParticleInit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  spawn: number;
  life: number;
  rot: THREE.Vector3;
  rotV: THREE.Vector3;
  scl: THREE.Vector3;
  emitFrame: number;
  r0: number;
  r1: number;
}

const ATTRS = ['aP0', 'aV0', 'aRot', 'aRotV', 'aScl'] as const;

/** 이미터 정의 하나의 입자 묶음(모든 이펙트 인스턴스가 함께 쓴다). 링 버퍼, 살아 있는 칸을 덮으려 하면 두 배로 늘린다 */
class Batch {
  readonly mesh: THREE.Mesh;
  private geo!: THREE.InstancedBufferGeometry;
  private arrays: Record<(typeof ATTRS)[number], Float32Array> = {} as never;
  private death = new Float32Array(0);
  private cap = 0;
  private head = 0;
  private used = 0;
  private lastDeath = 0;
  private dirtyLo = Infinity;
  private dirtyHi = -1;

  constructor(
    private readonly base: THREE.BufferGeometry,
    material: THREE.ShaderMaterial,
    capacity: number,
  ) {
    this.mesh = new THREE.Mesh(undefined, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.alloc(capacity);
  }

  private alloc(cap: number): void {
    const old = this.arrays;
    const oldCap = this.cap;
    const oldDeath = this.death;
    this.cap = cap;
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = this.base.index;
    for (const name of ['position', 'normal', 'uv']) {
      const a = this.base.getAttribute(name);
      if (a) geo.setAttribute(name, a);
    }
    for (const name of ATTRS) {
      const arr = new Float32Array(cap * 4);
      if (oldCap) arr.set(old[name]);
      this.arrays[name] = arr;
      const attr = new THREE.InstancedBufferAttribute(arr, 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
    }
    this.death = new Float32Array(cap);
    if (oldCap) this.death.set(oldDeath);
    else this.death.fill(-1);
    if (oldCap) this.death.fill(-1, oldCap);
    this.geo?.dispose();
    this.geo = geo;
    this.mesh.geometry = geo;
    this.dirtyLo = 0;
    this.dirtyHi = this.used - 1;
  }

  write(q: ParticleInit, clock: number): void {
    let i = this.head;
    if (this.death[i] > clock) {
      if (this.cap < MAX_CAPACITY) {
        i = this.cap;
        this.alloc(this.cap * 2);
      }
    }
    const o = i * 4;
    const A = this.arrays;
    A.aP0.set([q.p.x, q.p.y, q.p.z, q.spawn], o);
    A.aV0.set([q.v.x, q.v.y, q.v.z, q.life], o);
    A.aRot.set([q.rot.x, q.rot.y, q.rot.z, q.r0], o);
    A.aRotV.set([q.rotV.x, q.rotV.y, q.rotV.z, q.r1], o);
    A.aScl.set([q.scl.x, q.scl.y, q.scl.z, q.emitFrame], o);
    this.death[i] = q.spawn + q.life;
    this.lastDeath = Math.max(this.lastDeath, q.spawn + q.life);
    this.head = (i + 1) % this.cap;
    this.used = Math.max(this.used, i + 1);
    this.dirtyLo = Math.min(this.dirtyLo, i);
    this.dirtyHi = Math.max(this.dirtyHi, i);
  }

  /** 프레임마다: 바뀐 범위만 올리고, 모두 죽었으면 비운다 */
  flush(clock: number): void {
    if (this.used > 0 && this.lastDeath <= clock) {
      this.used = 0;
      this.head = 0;
      this.dirtyLo = Infinity;
      this.dirtyHi = -1;
    }
    if (this.dirtyHi >= this.dirtyLo) {
      for (const name of ATTRS) {
        const attr = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
        /* 범위는 쌓기만 한다 — 업로드는 그릴 때 한 번이고 three 가 그 뒤 비운다. 여기서 지우면 같은 프레임 앞 spawn 의 범위가 빠진다 */
        attr.addUpdateRange(this.dirtyLo * 4, (this.dirtyHi - this.dirtyLo + 1) * 4);
        attr.needsUpdate = true;
      }
      this.dirtyLo = Infinity;
      this.dirtyHi = -1;
    }
    this.geo.instanceCount = this.used;
    this.mesh.visible = this.used > 0;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface EmitterInst {
  def: EmitterDef;
  batch: Batch;
  lcg: Lcg;
  step: number;
  next: number;
  accum: number;
  done: boolean;
  matrix: THREE.Matrix4;
  dirMatrix: THREE.Matrix3;
  children: EmitterInst[];
}

interface Instance {
  handle: number;
  set: string;
  pos: THREE.Vector3;
  t0: number;
  selfDestroy: boolean;
  /** 이미터셋 배율(SetScale) */
  scale: number;
  stopped: boolean;
  emitters: EmitterInst[];
  lastDeath: number;
  pending: { time: number; em: EmitterInst; origin: THREE.Vector3 }[];
}

export class EffectSystem {
  private data: EffectsJson | null = null;
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly prims = new Map<string, THREE.BufferGeometry>();
  private readonly quad = quadGeometry();
  private readonly batches = new Map<EmitterDef, Batch>();
  private readonly order = new Map<EmitterDef, number>();
  private readonly instances = new Map<number, Instance>();
  private readonly time = { value: 0 };
  private readonly group = new THREE.Group();
  private readonly seed = new Lcg(0x12345678);
  private clock = 0;
  private nextHandle = 1;
  private readonly warned = new Set<string>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: Assets,
  ) {
    this.group.name = 'mg1801_effects';
    this.scene.add(this.group);
  }

  async load(): Promise<void> {
    const data = await this.assets.json<EffectsJson>('effect/effects.json');
    await Promise.all(
      Object.entries(data.textures).map(async ([name, t]) => {
        const tex = await loadTexture(this.assets.url(`effect/${t.file}`));
        tex.flipY = false;
        tex.colorSpace = t.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.needsUpdate = true;
        this.textures.set(name, tex);
      }),
    );
    const gltf = await this.assets.gltf('effect/primitives.glb');
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.userData.hasUv = !!m.geometry.getAttribute('uv');
      this.prims.set(m.name || o.parent?.name || '', m.geometry);
    });
    let n = 0;
    const walk = (e: EmitterDef): void => {
      this.order.set(e, n++);
      e.children.forEach(walk);
    };
    for (const s of Object.values(data.sets)) s.emitters.forEach(walk);
    this.data = data;
  }

  /** 원본 Create + SetPosition(+ SetScale) + Start, selfDestroy = true. 반환 = 핸들(실패 −1) */
  spawn(name: string, pos: Vec3, scale = 1): number {
    return this.create(name, pos, true, scale);
  }

  /** 반복 이미터(김)용. stop 할 때까지 남는다 */
  start(name: string, pos: Vec3): number {
    return this.create(name, pos, false);
  }

  /** 방출을 멈춘다. 남은 입자는 수명대로 사라지고 인스턴스도 그때 지운다 */
  stop(handle: number): void {
    const inst = this.instances.get(handle);
    if (!inst) return;
    inst.stopped = true;
    for (const em of inst.emitters) em.done = true;
  }

  update(dtSec: number): void {
    if (!this.data) return;
    this.clock += Math.min(Math.max(dtSec, 0), 0.25) * FPS;
    this.time.value = this.clock;
    for (const inst of this.instances.values()) this.advance(inst);
    for (const b of this.batches.values()) b.flush(this.clock);
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const g of this.prims.values()) g.dispose();
    this.prims.clear();
    this.quad.dispose();
    this.instances.clear();
  }

  /** 살아 있는 인스턴스 수(시험용) */
  get activeCount(): number {
    return this.instances.size;
  }

  private resolve(name: string): string | null {
    const d = this.data!;
    if (d.aliases[name]) return d.aliases[name];
    const base = name.toLowerCase().split(/[\\/]/).pop() ?? '';
    const dot = base.lastIndexOf('.');
    const key = dot > 0 ? base.slice(0, dot) : base;
    return d.sets[key] ? key : d.sets[name] ? name : null;
  }

  private create(name: string, pos: Vec3, selfDestroy: boolean, scale = 1): number {
    if (!this.data) return -1;
    const set = this.resolve(name);
    if (!set) {
      if (!this.warned.has(name)) {
        this.warned.add(name);
        console.warn(`이펙트 이름을 찾지 못했다: ${name}`);
      }
      return -1;
    }
    const handle = this.nextHandle++;
    const inst: Instance = {
      handle,
      set,
      pos: new THREE.Vector3(pos.x, pos.y, pos.z),
      t0: this.clock,
      selfDestroy,
      scale,
      stopped: false,
      emitters: this.data.sets[set].emitters.map((e) => this.emitterInst(e)),
      lastDeath: this.clock,
      pending: [],
    };
    this.instances.set(handle, inst);
    this.advance(inst);
    for (const b of this.batches.values()) b.flush(this.clock);
    return handle;
  }

  private emitterInst(def: EmitterDef): EmitterInst {
    const e = def.emit;
    let interval = e.interval;
    if (e.oneTime && !e.emitDist && e.duration < interval) interval = e.duration;
    const t = def.trs;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...t.trans),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(t.rotate[0], t.rotate[1], t.rotate[2], 'ZYX')),
      new THREE.Vector3(...t.scale),
    );
    return {
      def,
      batch: this.batch(def),
      lcg: new Lcg(this.seed.raw()),
      step: interval + 1,
      next: e.start,
      accum: 0,
      done: false,
      matrix,
      dirMatrix: new THREE.Matrix3().setFromMatrix4(matrix),
      children: def.children.map((c) => this.emitterInst(c)),
    };
  }

  private advance(inst: Instance): void {
    const elapsed = this.clock - inst.t0;
    for (const em of inst.emitters) {
      const e = em.def.emit;
      while (!em.done && em.next <= elapsed + 1e-6) {
        if (e.oneTime && em.next >= e.start + e.duration) {
          em.done = true;
          break;
        }
        this.emit(inst, em, inst.t0 + em.next, em.next, inst.pos);
        em.next += em.step;
      }
      if (e.oneTime && em.next >= e.start + e.duration) em.done = true;
    }
    if (inst.pending.length) {
      inst.pending.sort((a, b) => a.time - b.time);
      while (inst.pending.length && inst.pending[0].time <= this.clock + 1e-6) {
        const c = inst.pending.shift()!;
        this.emitChild(inst, c.em, c.time, c.origin);
      }
    }
    const finished = inst.emitters.every((em) => em.done) && inst.pending.length === 0 && inst.lastDeath <= this.clock;
    if (finished && (inst.selfDestroy || inst.stopped)) this.instances.delete(inst.handle);
  }

  /** 자식 이미터: 부모 입자 위치에서 one-time 창(duration) 동안 방출 */
  private emitChild(inst: Instance, em: EmitterInst, time: number, origin: THREE.Vector3): void {
    const e = em.def.emit;
    for (let f = 0; f < Math.max(1, e.duration); f += em.step) this.emit(inst, em, time + f, f, origin);
  }

  private emit(inst: Instance, em: EmitterInst, spawn: number, emitFrame: number, origin: THREE.Vector3): void {
    const def = em.def;
    const e = def.emit;
    const L = em.lcg;
    em.accum += e.rate * ((100 - L.next() * e.rateRandom) / 100);
    let n = Math.floor(em.accum);
    em.accum -= n;
    if (n <= 0) return;
    const sh = def.shape;
    const callU = L.next();
    let div = 0;
    if (sh.primEmitType === 0 && (sh.type === 2 || sh.type === 13)) {
      const nd = sh.type === 2 ? sh.numDivideCircle : sh.numDivideLine;
      const ndr = sh.type === 2 ? sh.numDivideCircleRandom : sh.numDivideLineRandom;
      div = nd - Math.trunc(callU * ndr * 0.01 * nd);
      n *= div;
    }
    for (let i = 0; i < n; i++) {
      const q = this.initParticle(em, i, div, callU, origin, inst.scale);
      q.spawn = spawn;
      q.emitFrame = emitFrame;
      em.batch.write(q, this.clock);
      inst.lastDeath = Math.max(inst.lastDeath, spawn + q.life);
      for (const c of em.children) {
        const age = Math.floor((q.life * c.def.emit.timing) / 100);
        inst.pending.push({ time: spawn + age, em: c, origin: this.positionAt(def, q, age) });
      }
    }
  }

  private positionAt(def: EmitterDef, q: ParticleInit, n: number): THREE.Vector3 {
    const a = def.airRes;
    const g = new THREE.Vector3(...def.gravity);
    if (Math.abs(1 - a) < 1e-5) return q.p.clone().addScaledVector(q.v, n).addScaledVector(g, (n * (n + 1)) / 2);
    const s = (a * (1 - a ** n)) / (1 - a);
    return q.p.clone().addScaledVector(q.v, s).addScaledVector(g, (n - s) / (1 - a));
  }

  private randUnit(L: Lcg): THREE.Vector3 {
    const z = L.next() * 2 - 1;
    const a = L.next() * TWO_PI;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z);
  }

  /** 모양별 방출 위치(이미터 로컬)와 법선 방향 [판독: 원본 볼륨 함수표 0x7101b59378] */
  private volume(em: EmitterInst, i: number, div: number, callU: number): { p: THREE.Vector3; n: THREE.Vector3 } {
    const sh = em.def.shape;
    const L = em.lcg;
    const rx = sh.radius[0] * sh.formScale[0];
    const ry = sh.radius[1] * sh.formScale[1];
    const rz = sh.radius[2] * sh.formScale[2];
    const start = sh.sweepStartRandom ? TWO_PI * callU : sh.sweepStart;
    switch (sh.type) {
      case 1:
      case 3: {
        const a = start + sh.sweepLongitude * L.next() - sh.sweepLongitude * 0.5;
        const s = Math.sin(a);
        const c = Math.cos(a);
        if (sh.type === 1) return { p: new THREE.Vector3(s * rx, 0, c * rz), n: new THREE.Vector3(s, 0, c) };
        const k = Math.sqrt(L.next());
        const p = new THREE.Vector3(s * rx * k, 0, c * rz * k);
        return { p, n: new THREE.Vector3(p.x, 0, p.z).normalize() };
      }
      case 2:
      case 13: {
        const full = Math.abs(sh.sweepLongitude - TWO_PI) < 1e-6;
        const d = div - (!full && div !== 1 && div > 0 ? 1 : 0);
        const idx = i % (d + 1);
        if (sh.type === 13) {
          const x = sh.lineCenter - sh.lineLength * 0.5 + (d > 0 ? (sh.lineLength / d) * idx : 0);
          return { p: new THREE.Vector3(x * sh.formScale[0], 0, 0), n: new THREE.Vector3(Math.sign(x), 0, 0) };
        }
        const a = start - sh.sweepLongitude * 0.5 + (sh.sweepLongitude / Math.max(d, 1)) * idx + sh.surfacePosRandom * (2 * L.next() - 1);
        const s = Math.sin(a);
        const c = Math.cos(a);
        return { p: new THREE.Vector3(s * rx, 0, c * rz), n: new THREE.Vector3(s, 0, c) };
      }
      case 10: {
        const w9 = L.raw();
        const w8 = L.raw();
        const s3 = L.raw() * U32 * 2 - 1;
        const s1 = L.raw() * U32 * 2 - 1;
        const s4 = L.raw() * U32 * 2 - 1;
        const sign = w8 < 0x7fffffff ? 1 : -1;
        let p: THREE.Vector3;
        if (w9 <= 0x55555554) p = new THREE.Vector3(rx * s3, ry * s1, rz * sign);
        else if (w9 <= 0xaaaaaaa9) p = new THREE.Vector3(rx * s3, ry * sign, rz * s4);
        else p = new THREE.Vector3(rx * sign, ry * s1, rz * s4);
        return { p, n: p.lengthSq() > 0 ? p.clone().normalize() : new THREE.Vector3() };
      }
      case 4: {
        const n = this.randUnit(L);
        return { p: new THREE.Vector3(n.x * rx, n.y * ry, n.z * rz), n };
      }
      default:
        if (sh.type !== 0) this.warnOnce(`volumeType ${sh.type} 미구현(점으로 근사): ${em.def.name}`);
        return { p: new THREE.Vector3(), n: this.randUnit(L) };
    }
  }

  private initParticle(em: EmitterInst, i: number, div: number, callU: number, origin: THREE.Vector3, setScale: number): ParticleInit {
    const def = em.def;
    const L = em.lcg;
    const vel = def.velocity;
    const { p, n } = this.volume(em, i, div, callU);
    const v = n.multiplyScalar(vel.allDirection);
    if (def.emit.positionRandom) p.addScaledVector(this.randUnit(L), def.emit.positionRandom);
    if (vel.xzDiffusion) {
      const d = new THREE.Vector3(p.x, 0, p.z);
      if (d.lengthSq() <= 1.1920929e-7) d.set(L.next() * 2 - 1, 0, L.next() * 2 - 1);
      v.addScaledVector(d.normalize(), vel.xzDiffusion);
    }
    if (vel.designatedDirScale) {
      const dir = new THREE.Vector3(...vel.designatedDir);
      if (vel.diffusionDirAngle > 0) {
        const cosT = 1 - L.next() * (vel.diffusionDirAngle / 90);
        const phi = L.next() * TWO_PI;
        const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
        const len = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        dir.set(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi)).applyQuaternion(q).multiplyScalar(len);
      }
      v.addScaledVector(dir, vel.designatedDirScale);
    }
    v.multiplyScalar(1 - (L.next() * vel.velRandom) / 100);
    if (vel.diffusion.some((x) => x !== 0)) {
      const r = this.randUnit(L);
      v.add(new THREE.Vector3(vel.diffusion[0] * r.x, vel.diffusion[1] * r.y, vel.diffusion[2] * r.z));
    }
    const tr = def.trs.transRand;
    if (tr.some((x) => x !== 0)) p.add(new THREE.Vector3(tr[0] * (L.next() * 2 - 1), tr[1] * (L.next() * 2 - 1), tr[2] * (L.next() * 2 - 1)));
    p.applyMatrix4(em.matrix).multiplyScalar(setScale).add(origin);
    v.applyMatrix3(em.dirMatrix).multiplyScalar(setScale);

    const sc = def.scale;
    const scl = new THREE.Vector3(...sc.base);
    if (sc.random[0] === sc.random[1] && sc.random[1] === sc.random[2]) scl.multiplyScalar(1 - (L.next() * sc.random[0]) / 100);
    else scl.set(sc.base[0] * (1 - (L.next() * sc.random[0]) / 100), sc.base[1] * (1 - (L.next() * sc.random[1]) / 100), sc.base[2] * (1 - (L.next() * sc.random[2]) / 100));
    scl.multiplyScalar(setScale);
    const m = def.particle.momentumRandom;
    const mom = m + 1 - L.next() * m * 2;
    v.multiplyScalar(mom);
    const pt = def.particle;
    const life = pt.infiniteLife ? 1e8 : Math.max(1, Math.trunc(pt.life * (1 - Math.floor(L.next() * pt.lifeRandom) / 100)));

    const ro = def.rotate;
    const rot = new THREE.Vector3();
    const rotV = new THREE.Vector3();
    for (let k = 0; k < 3; k++) {
      if (!pt.isRotate[k]) continue;
      let r0 = ro.init[k] + L.next() * ro.initRand[k];
      let add = ro.add[k] + L.next() * ro.addRand[k];
      if (pt.rotRevRand[k] && L.next() < 0.5) {
        r0 = -r0;
        add = -add;
      }
      rot.setComponent(k, r0);
      rotV.setComponent(k, add);
    }
    return { p, v, spawn: 0, life, rot, rotV, scl, emitFrame: 0, r0: L.next(), r1: L.next() };
  }

  private warnOnce(msg: string): void {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    console.warn(msg);
  }

  private batch(def: EmitterDef): Batch {
    let b = this.batches.get(def);
    if (b) return b;
    const prim = def.particle.primitive ? this.prims.get(def.particle.primitive) : undefined;
    if (def.particle.primitive && !prim) this.warnOnce(`프리미티브 없음: ${def.particle.primitive}`);
    const base = prim ?? this.quad;
    if (!base.getAttribute('uv')) base.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(base.getAttribute('position').count * 2), 2));
    if (!base.getAttribute('normal')) base.computeVertexNormals();
    b = new Batch(base, this.material(def, !!prim && !prim.userData.hasUv), this.capacity(def));
    b.mesh.renderOrder = 1000 + (this.order.get(def) ?? 0);
    b.mesh.name = def.name;
    this.group.add(b.mesh);
    this.batches.set(def, b);
    return b;
  }

  private capacity(def: EmitterDef): number {
    const e = def.emit;
    const sh = def.shape;
    const div = sh.primEmitType === 0 && sh.type === 2 ? sh.numDivideCircle : sh.primEmitType === 0 && sh.type === 13 ? sh.numDivideLine : 1;
    const step = (e.oneTime && e.duration < e.interval ? e.duration : e.interval) + 1;
    const emissions = e.oneTime ? Math.ceil(Math.max(1, e.duration) / step) : Math.ceil(def.particle.life / step) + 1;
    const want = Math.ceil(e.rate) * Math.max(1, div) * emissions * 2;
    return Math.min(MAX_CAPACITY, 2 ** Math.ceil(Math.log2(Math.max(16, want))));
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

  private material(def: EmitterDef, meshNoUv: boolean): THREE.ShaderMaterial {
    const d = this.data!;
    const c = def.color;
    const ec0 = def.emitterColor0;
    const ec1 = def.emitterColor1;
    const scale = (k: { v: THREE.Vector4[]; n: number }, e: number[], alpha: boolean): { v: THREE.Vector4[]; n: number } => {
      for (const v of k.v) {
        if (alpha) v.x *= e[3];
        else v.set(v.x * e[0], v.y * e[1], v.z * e[2], v.w);
      }
      return k;
    };
    const c0 = scale(keyUniform(c.color0Type, c.color0, c.color0Keys, false), ec0, false);
    const a0 = scale(keyUniform(c.alpha0Type, [c.alpha0], c.alpha0Keys, true), ec0, true);
    const c1 = scale(keyUniform(c.color1Type, c.color1, c.color1Keys, false), ec1, false);
    const a1 = scale(keyUniform(c.alpha1Type, [c.alpha1], c.alpha1Keys, true), ec1, true);
    const sk = def.scale.keys.length ? keyUniform(2, [1, 1, 1], def.scale.keys, false) : keyUniform(0, [1, 1, 1], [], false);
    const matcap = def.samplers.length >= 3 && def.samplers[0].texture.endsWith('_nml');
    const plain = def.samplers.filter((s) => !s.texture.includes('flowmap'));
    const used = matcap ? def.samplers.slice(0, 3) : plain.slice(0, 2);
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
    return new THREE.ShaderMaterial({
      name: `fx_${def.name}`,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines,
      uniforms: {
        uTime: this.time,
        uGravity: { value: new THREE.Vector3(...def.gravity) },
        uDrag: { value: def.airRes },
        uRegist: { value: def.rotate.regist },
        uFadeIn: { value: def.fade.isAlphaFadeIn ? def.fade.fadeInTime : 0 },
        uScaleK: { value: sk.v },
        uScaleN: { value: sk.n },
        uC0: { value: c0.v },
        uC0N: { value: c0.n },
        uA0: { value: a0.v },
        uA0N: { value: a0.n },
        uC1: { value: c1.v },
        uC1N: { value: c1.n },
        uA1: { value: a1.v },
        uA1N: { value: a1.n },
        uUvA: { value: uvA },
        uUvB: { value: uvB },
        uInv: { value: inv },
        uTex0: { value: this.texture(used[0]) ?? white },
        uTex1: { value: this.texture(used[1]) ?? white },
        uTex2: { value: this.texture(used[2]) ?? white },
        uRedA: { value: redA },
        uColorScale: { value: c.colorScale },
        uAlphaRef: { value: def.render.isAlphaTest ? def.render.alphaThreshold : -1 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: def.render.isDepthTest,
      side: THREE.DoubleSide,
      blending: def.render.blendType === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
}
