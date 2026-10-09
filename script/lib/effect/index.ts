/**
 * 이펙트(VFX) 런타임 공용 코어 — import 0(외부 라이브러리·three·DOM·프로젝트 파일 없음). 설계·원본 계약: docs/engine/08_effects.md §14(웹 런타임 계약),
 * 판독 근거는 같은 문서 §3(이름 해석)·§5(수명·정지·부착)·§6.1~6.7(방출·입자·프로그램별 운동·정렬)·§9.4(웹 근사 목록).
 *
 * 원본 단위를 그대로 옮긴다(숫자·사건만 낸다, 그리기 없음):
 * - EffectRegistry = nn::bezel::ParticleFx2Module 리소스 목록 + 이름 해석 FUN_710072c680(§3.3): 등록 순서대로 ESFT 경로·'..\'·확장자 뺀 이미터셋 이름.
 * - EffectCore     = bex::Effect 목록(EffectModule) + vfx2 EmitterSet/Emitter: Create·Start·Stop(bool)·StopImmediately·SetPosition·SetScale·
 *                    SetSelfDestroyEnabled·SetLayerVisibilityBit·SetAnimationSpeed·Attach, 핸들 = 칸 + 세대(§5.1·§5.3).
 * - ParticlePool   = 이미터 정의 하나의 입자 배열(모든 이펙트 인스턴스가 함께 쓴다). 방출(§6.1)·CPU 입자 초기화/갱신(§6.2)·프로그램별 운동(§6.3)·
 *                    키 애니·정렬 키(§6.5)를 계산해 그리기 출력 배열(월드 위치·크기·회전·색 2개·나이·수명·기저)을 채운다.
 *
 * 규칙 두 벌(사용자 결정 2026-10-09: 기본 = 원본 규칙): RULES_WEB = mg1801 view/effects.ts 이전 웹 근사 그대로(이전 전후 골든 같음),
 * RULES_ORIGINAL = 08 의 원본 식. 항목별 차이는 08 §14.5 원본 스위치 표.
 * 결정성: Math.random·벽시계 없음. 난수는 생성자에 주입(seed), 시간은 step() 고정 1/60(재생 속도 = SetAnimationSpeed 배율).
 * 할당: step()·sync() 는 정상 상태 할당 0(입자·출력 = 미리 잡은 typed array, 인스턴스·이미터 객체는 다시 쓴다). 풀이 모자랄 때만 두 배로 늘린다.
 * 다른 게임에 이 파일 하나를 그대로 복사해 쓸 수 있다.
 */

/** 고정 스텝(초) — 리듬 장면 vfx2 갱신은 1/60 프레임 단위(08 §8) */
export const STEP_SEC = 1 / 60;
const F = Math.fround;
const TWO_PI = Math.PI * 2;
/** 이전 웹의 u32 → [0,1) 배율(double 리터럴 그대로) */
const U32_WEB = 2.3283064e-10;
/** 원본 u = float(seed)·2⁻³²(§6.2) */
const U32 = 2 ** -32;
const MAX_KEYS = 8;
const MAX_CAPACITY = 1 << 18;
/** 무한 수명 L = 268435456(0x4D800000) [판독 §6.2] */
const LIFE_INFINITE = 268435456;
const F32_EPS = 1.1920929e-7;

/* ================================================================ 데이터(effects.json, tools/analysis/mg1801_web_effects.py) */

export type Key = [number, number, number, number];
export type V3 = [number, number, number];

export interface SamplerDef {
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

/** 원본 규칙용 raw 값(08 §14.3) — info0 = EmitterData+0xCC0..0xCCF, inherit0 = +0xD48..0xD57 */
export interface EmitterOrig {
  info0: number[];
  seed: number;
  drawPath: number;
  alphaFadeTime: number;
  fadeInTime: number;
  depthFunc: number;
  alphaFunc: number;
  shader: [number, number, number];
  fluct: [number, number, number, number];
  fluctParam: number[];
  loopOn: number[];
  loopRandom: number[];
  loopPeriod: number[];
  soft: [number, number, number];
  inherit0: number[];
  inheritD58: number;
  inheritRate: [number, number];
  velInheritMax: number;
  worldOrientedVelocity: number;
  fspn?: { f32: number[]; u32: number[] };
  frn1?: { f32: number[]; u32: number[] };
  frnd?: { f32: number[]; u32: number[] };
}

export interface EmitterDef {
  name: string;
  calcType?: number;
  followType?: number;
  emit: { oneTime: boolean; start: number; timing: number; duration: number; rate: number; rateRandom: number; interval: number; intervalRandom?: number; positionRandom: number; emitDist: boolean; worldGravity?: boolean };
  shape: {
    type: number;
    sweepStartRandom: number;
    arcType?: number;
    sweepLongitude: number;
    sweepLatitude?: number;
    sweepStart: number;
    surfacePosRandom: number;
    caliberRatio?: number;
    lineCenter: number;
    lineLength: number;
    radius: V3;
    formScale: V3;
    primEmitType: number;
    numDivideCircle: number;
    numDivideCircleRandom: number;
    numDivideLine: number;
    numDivideLineRandom: number;
  };
  trs: { trans: V3; transRand: V3; rotate: V3; rotateRand?: V3; scale: V3 };
  emitterColor0: [number, number, number, number];
  emitterColor1: [number, number, number, number];
  fade: { isAlphaFadeIn: number; fadeInTime: number; alphaFadeTime?: number };
  particle: {
    life: number;
    lifeRandom: number;
    infiniteLife: boolean;
    billboardType: number;
    momentumRandom: number;
    isRotate: [number | boolean, number | boolean, number | boolean];
    rotRevRand: [number | boolean, number | boolean, number | boolean];
    primitive: string | null;
  };
  velocity: {
    allDirection: number;
    designatedDirScale: number;
    designatedDir: V3;
    diffusionDirAngle: number;
    xzDiffusion: number;
    diffusion: V3;
    velRandom: number;
    emVelInherit?: number;
  };
  gravity: V3;
  airRes: number;
  rotate: { init: V3; initRand: V3; add: V3; addRand: V3; regist: number };
  color: {
    color0Type: number;
    alpha0Type: number;
    color1Type: number;
    alpha1Type: number;
    color0: V3;
    alpha0: number;
    color1: V3;
    alpha1: number;
    colorScale: number;
    color0Keys: Key[];
    alpha0Keys: Key[];
    color1Keys: Key[];
    alpha1Keys: Key[];
  };
  scale: { base: V3; random: V3; keys: Key[] };
  render: { blendType: number; isBlendEnable?: boolean; isDepthTest: boolean; isDepthMask?: boolean; displaySide?: number; isAlphaTest: boolean; alphaThreshold: number };
  samplers: SamplerDef[];
  fields?: Record<string, number[]>;
  orig?: EmitterOrig;
  children: EmitterDef[];
}

export interface EmitterSetDef {
  source?: string;
  /** ESFT 경로(이름 해석 1·2단계) */
  path?: string;
  emitters: EmitterDef[];
}

export interface EffectsJson {
  aliases: Record<string, string>;
  textures: Record<string, { file: string; srgb: boolean; alpha: boolean }>;
  sets: Record<string, EmitterSetDef>;
  resources?: { name: string; sets: string[] }[];
}

/* ================================================================ 규칙 */

/** 원본 스위치(08 §14.5). 항목마다 'web' = 이전 웹 근사, 'original' = 08 의 원본 식 */
export interface EffectRules {
  readonly id: 'web' | 'original';
  /** 이름 해석: web = 별칭 → 소문자 basename·확장자 제거, original = 등록 순서 ESFT 경로 → '..\' → 확장자 뺀 이름 strcmp(§3.3) */
  readonly resolve: 'web' | 'original';
  /** 운동식: web = 속도에 drag 먼저 곱한 닫힌 식(m 은 v0 에), original = P += dt·m·V 뒤 drag·gravity(§6.2), calcType 1 해석식·2 wave CS(§6.3) */
  readonly motion: 'web' | 'original';
  /** 표본 분포·난수 계열: web = LCG 균등 단위벡터·[0,rand) 회전·정수 수명·시스템 LCG 씨앗, original = N/Q 표·(U−0.5) 회전·float 수명·seed 선택·이미터 TRS 난수(§6.2) */
  readonly sampling: 'web' | 'original';
  /** 방출: web = 생성 즉시 방출, original = Start 뒤 첫 갱신에서 방출·첫 방출 rate 최소 1·intervalRandom(§5.3·§6.1) */
  readonly emission: 'web' | 'original';
  /** 필드: FSPN·FRN1(CPU)·wave CS 주기 힘(§6.2·§6.3). FRND 는 전역 주파수 분자 미판독이라 둘 다 쓰지 않는다 */
  readonly fields: boolean;
  /** 키·흔들림: original = 8슬롯 패딩·루프 위상·color type 3·scale/alpha fluctuation(§6.2·§6.3) */
  readonly keys: 'web' | 'original';
  /** 정지: web = 방출만 멈추고 남은 입자는 수명대로, original = Stop(false) 즉시 kill·Stop(true) fade(§5.3) */
  readonly stop: 'web' | 'original';
  /** 웹: info CCB(파서 이름 isAlphaFadeIn)를 시작 페이드인으로 씀. 원본은 CCB/CCC 가 정지 fade 선택(§5.3) */
  readonly fadeIn: boolean;
  /** sortType 정렬·이미터셋 key(§6.5·§6.7) */
  readonly sort: boolean;
  /** followType 0/1/2(§5.3 정렬 reader): 입자 위치를 현재/생성 때 이미터 행렬로 */
  readonly follow: boolean;
  /** 자식 상속 D[D50..D57](§6.2) */
  readonly inherit: boolean;
  /** SetAnimationSpeed(재생 속도)를 dt 에 곱함 */
  readonly playRate: boolean;
  /** 그리기 상태: original = blend 표 6종·cull·depthMask·alphaFunc·billboard 4 축 치환·twinkle/flowmap FS(§6.4·§6.6) */
  readonly render: 'web' | 'original';
  /** f32(Math.fround) 산술 */
  readonly f32: boolean;
}

export const RULES_WEB: Readonly<EffectRules> = {
  id: 'web',
  resolve: 'web',
  motion: 'web',
  sampling: 'web',
  emission: 'web',
  fields: false,
  keys: 'web',
  stop: 'web',
  fadeIn: true,
  sort: false,
  follow: false,
  inherit: false,
  playRate: false,
  render: 'web',
  f32: false,
};

export const RULES_ORIGINAL: Readonly<EffectRules> = {
  id: 'original',
  resolve: 'original',
  motion: 'original',
  sampling: 'original',
  emission: 'original',
  fields: true,
  keys: 'original',
  stop: 'original',
  fadeIn: false,
  sort: true,
  follow: true,
  inherit: true,
  playRate: true,
  render: 'original',
  f32: true,
};

/** 기본 규칙 — 2026-10-09 사용자 결정: 원본(08 §14.5). 소비자는 만들 때 읽는다. RULES_WEB 으로 바꾸면 이전 웹 결과(골든 WEB) */
export const effectDefaults: { rules: Readonly<EffectRules> } = { rules: RULES_ORIGINAL };

/* ================================================================ 난수 */

/** 원본 vfx2 이미터 난수 [판독: FUN_710074f620 등] */
export class Lcg {
  constructor(public s: number) {}
  raw(): number {
    const r = this.s;
    this.s = (Math.imul(r, 0x41c64e6d) + 0x3039) >>> 0;
    return r;
  }
  /** 이전 웹: raw·2.3283064e-10(double) */
  next(): number {
    return this.raw() * U32_WEB;
  }
  /** 원본: u = float(이전 seed)·2⁻³²(f32 반올림으로 최상단은 1 이 될 수 있다) [판독 §6.2] */
  u(): number {
    return F(F(this.raw()) * U32);
  }
}

/** xorshift128(shift 11/8/19) — N/Q 표와 공유 seed 원천 [판독 §6.2 0759410] */
export class Xorshift128 {
  constructor(
    public x = 0x178eab2c,
    public y = 0xe318145e,
    public z = 0x45f0cdb4,
    public w = 0x720a056d,
  ) {}
  next(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = (this.w ^ (this.w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return this.w;
  }
}

const bitsF32 = new Float32Array(1);
const bitsU32 = new Uint32Array(bitsF32.buffer);
/** (bitcast_f32(3F800000 | (rng>>9)) − 1)·2 − 1 */
function rngSigned(r: number): number {
  bitsU32[0] = (0x3f800000 | (r >>> 9)) >>> 0;
  return F(F(F(bitsF32[0] - 1) * 2) - 1);
}

let nqN = new Float32Array(0);
let nqQ = new Float32Array(0);
/** 512 개 float4 표 N(그대로)·Q(다음 xyz 정규화, w=0). 인덱스마다 N 4개 → Q 3개 순서로 뽑는다 [판독 §6.2·b31 0759410] */
export function nqTables(): { N: Float32Array; Q: Float32Array } {
  ensureNQ();
  return { N: nqN, Q: nqQ };
}
function ensureNQ(): void {
  if (nqN.length === 0) {
    const g = new Xorshift128();
    nqN = new Float32Array(2048);
    nqQ = new Float32Array(2048);
    for (let i = 0; i < 512; i++) {
      for (let k = 0; k < 4; k++) nqN[i * 4 + k] = rngSigned(g.next());
      const x = rngSigned(g.next());
      const y = rngSigned(g.next());
      const z = rngSigned(g.next());
      const l = Math.sqrt(x * x + y * y + z * z);
      const s = l > 0 ? 1 / l : 0;
      nqQ[i * 4] = F(x * s);
      nqQ[i * 4 + 1] = F(y * s);
      nqQ[i * 4 + 2] = F(z * s);
      nqQ[i * 4 + 3] = 0;
    }
  }
}

/** nn::util SinCoefficients 기반 SinCPU(§6.2) — 비트 [32D46A65,36391B32,39500FBD,3C088896,3E2AAAAB] */
const SIN_C = ((): number[] => {
  const u = new Uint32Array([0x32d46a65, 0x36391b32, 0x39500fbd, 0x3c088896, 0x3e2aaaab]);
  return Array.from(new Float32Array(u.buffer));
})();
const PI_F = F(Math.PI);
const TWO_PI_F = F(TWO_PI);
const HALF_PI_F = F(Math.PI / 2);
const INV_TWO_PI_F = F(1 / TWO_PI);
export function sinCpu(y: number): number {
  const s = y < 0 ? -1 : 1;
  let v = F(y - F(Math.trunc(F(s * 0.5) + F(y * INV_TWO_PI_F)) * TWO_PI_F));
  if (v > HALF_PI_F) v = F(PI_F - v);
  else if (v < -HALF_PI_F) v = F(-PI_F - v);
  const z = F(v * v);
  const [c0, c1, c2, c3, c4] = SIN_C;
  const inner = F(F(F(c3 + F(z * F(F(F(c1 - F(z * c0)) * z) - c2))) * z) - c4);
  return F(v * F(1 + F(z * inner)));
}

/* ================================================================ 작은 수학(three 연산 순서 그대로 — 이전 웹과 비트 같게) */

/** Quaternion.setFromEuler(order 'ZYX') → Matrix4.compose(position, q, scale) */
function composeZYX(out: Float64Array, t: readonly number[], r: readonly number[], s: readonly number[]): void {
  const c1 = Math.cos(r[0] / 2);
  const c2 = Math.cos(r[1] / 2);
  const c3 = Math.cos(r[2] / 2);
  const s1 = Math.sin(r[0] / 2);
  const s2 = Math.sin(r[1] / 2);
  const s3 = Math.sin(r[2] / 2);
  const x = s1 * c2 * c3 - c1 * s2 * s3;
  const y = c1 * s2 * c3 + s1 * c2 * s3;
  const z = c1 * c2 * s3 - s1 * s2 * c3;
  const w = c1 * c2 * c3 + s1 * s2 * s3;
  const x2 = x + x,
    y2 = y + y,
    z2 = z + z;
  const xx = x * x2,
    xy = x * y2,
    xz = x * z2;
  const yy = y * y2,
    yz = y * z2,
    zz = z * z2;
  const wx = w * x2,
    wy = w * y2,
    wz = w * z2;
  const sx = s[0],
    sy = s[1],
    sz = s[2];
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  out[15] = 1;
}

/** out = a·b (열 우선 4×4) */
function mul4(out: Float64Array, a: Float64Array, b: Float64Array): void {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4],
      b1 = b[c * 4 + 1],
      b2 = b[c * 4 + 2],
      b3 = b[c * 4 + 3];
    tmp16[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    tmp16[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    tmp16[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    tmp16[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  out.set(tmp16);
}
const tmp16 = new Float64Array(16);
const IDENT = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** 부착 행렬 원천(바깥이 매 스텝 월드 행렬 16칸 열 우선을 채운다) — bex::Effect::Attach(§5.3) */
export interface MatrixSource {
  readMatrix(out: Float64Array): void;
}

/* ================================================================ 이름 해석 */

interface Resource {
  name: string;
  names: string[];
  paths: string[];
  sets: EmitterSetDef[];
}

export interface Resolved {
  name: string;
  set: EmitterSetDef;
  resource: string;
}

/** ParticleFx2Module 리소스 목록 + Create(name) 해석(§3.3). 등록 순서 = 충돌 우선순위 */
export class EffectRegistry {
  private readonly res: Resource[] = [];
  private readonly alias = new Map<string, string>();
  /** web 해석용(이전 웹: 모든 이미터셋 한 표) */
  private readonly all = new Map<string, EmitterSetDef>();

  /** 리소스 하나 등록(_Vfx 경로 이름, 이미터셋 순서 = ESFT 순서) */
  register(name: string, sets: readonly (readonly [string, EmitterSetDef])[]): void {
    const r: Resource = { name, names: [], paths: [], sets: [] };
    for (const [n, s] of sets) {
      r.names.push(n);
      r.paths.push((s.path ?? '').toLowerCase());
      r.sets.push(s);
      if (!this.all.has(n)) this.all.set(n, s);
    }
    this.res.push(r);
  }

  /** effects.json 하나(resources 순서, 없으면 sets 순서 한 리소스) + 별칭 */
  registerJson(data: EffectsJson, fallbackName = 'effects'): void {
    const groups = data.resources ?? [{ name: fallbackName, sets: Object.keys(data.sets) }];
    for (const g of groups) this.register(g.name, g.sets.filter((n) => data.sets[n]).map((n) => [n, data.sets[n]] as const));
    for (const [k, v] of Object.entries(data.aliases ?? {})) this.alias.set(k, v);
  }

  addAlias(from: string, to: string): void {
    this.alias.set(from, to);
  }

  get resources(): readonly string[] {
    return this.res.map((r) => r.name);
  }

  /** 등록된 이미터셋 이름(등록 순서, 중복 제외) */
  get names(): string[] {
    return [...this.all.keys()];
  }

  set(name: string): EmitterSetDef | undefined {
    return this.all.get(name);
  }

  resolve(name: string, mode: 'web' | 'original' = 'original'): Resolved | null {
    const a = this.alias.get(name);
    if (a !== undefined) name = a;
    if (mode === 'web') {
      const base = name.toLowerCase().split(/[\\/]/).pop() ?? '';
      const dot = base.lastIndexOf('.');
      const key = dot > 0 ? base.slice(0, dot) : base;
      const n = this.all.has(key) ? key : this.all.has(name) ? name : null;
      if (!n) return null;
      for (const r of this.res) {
        const i = r.names.indexOf(n);
        if (i >= 0) return { name: n, set: r.sets[i], resource: r.name };
      }
      return null;
    }
    const p = name.toLowerCase().replace(/\//g, '\\');
    const dot = name.lastIndexOf('.');
    const base = dot >= 0 ? name.slice(0, dot) : name;
    for (const r of this.res) {
      let i = r.paths.indexOf(p);
      if (i < 0) i = r.paths.indexOf(`..\\${p}`);
      if (i < 0) i = r.names.indexOf(base);
      if (i >= 0) return { name: r.names[i], set: r.sets[i], resource: r.name };
    }
    return null;
  }
}

/* ================================================================ 이미터 정의의 런타임 값(정의마다 한 번) */

/** 키 표(8슬롯 × xyzt) — web = 이전 셰이더 uniform 값(이미터 색 곱 포함), original = 패딩한 원본 슬롯 */
export interface KeyTab {
  v: Float64Array;
  n: number;
}

export function keyTabWeb(type: number, constant: readonly number[], keys: readonly Key[], alpha: boolean): KeyTab {
  const v = new Float64Array(MAX_KEYS * 4);
  if (type === 0 || keys.length === 0) {
    const c = alpha ? [constant[0], constant[0], constant[0]] : constant;
    v[0] = c[0];
    v[1] = c[1];
    v[2] = c[2];
    v[3] = 0;
    return { v, n: 1 };
  }
  const n = Math.min(keys.length, MAX_KEYS);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) v[i * 4 + k] = keys[i][k];
  return { v, n };
}

/** 고정값은 첫 슬롯, 1~7키 채널의 남은 슬롯은 마지막 xyz 와 '마지막 time + 슬롯 번호' [판독 §6.3 FUN_71007491a0] */
export function keyTabOrig(type: number, constant: readonly number[], keys: readonly Key[], alpha: boolean): KeyTab {
  const v = new Float64Array(MAX_KEYS * 4);
  const fixed = type === 0 || keys.length === 0;
  const n = fixed ? 1 : Math.min(keys.length, MAX_KEYS);
  for (let i = 0; i < n; i++) {
    const k: readonly number[] = fixed ? (alpha ? [constant[0], constant[0], constant[0], 0] : [constant[0], constant[1], constant[2], 0]) : keys[i];
    for (let c = 0; c < 4; c++) v[i * 4 + c] = F(k[c]);
  }
  for (let i = n; i < MAX_KEYS; i++) {
    v[i * 4] = v[(n - 1) * 4];
    v[i * 4 + 1] = v[(n - 1) * 4 + 1];
    v[i * 4 + 2] = v[(n - 1) * 4 + 2];
    v[i * 4 + 3] = F(v[(n - 1) * 4 + 3] + i);
  }
  return { v, n: fixed ? 0 : n };
}

/** 이전 셰이더 keyAt(GLSL mix = a·(1−t)+b·t) */
export function keyAtWeb(t: KeyTab, r: number, out: Float64Array, o: number): void {
  const k = t.v;
  const n = t.n;
  if (n <= 1 || r <= k[3]) {
    out[o] = k[0];
    out[o + 1] = k[1];
    out[o + 2] = k[2];
    return;
  }
  for (let i = 1; i < MAX_KEYS; i++) {
    if (i >= n) break;
    if (r <= k[i * 4 + 3]) {
      const a = (i - 1) * 4;
      const b = i * 4;
      const s = (r - k[a + 3]) / Math.max(k[b + 3] - k[a + 3], 1e-6);
      out[o] = k[a] * (1 - s) + k[b] * s;
      out[o + 1] = k[a + 1] * (1 - s) + k[b + 1] * s;
      out[o + 2] = k[a + 2] * (1 - s) + k[b + 2] * s;
      return;
    }
  }
  const z = (n - 1) * 4;
  out[o] = k[z];
  out[o + 1] = k[z + 1];
  out[o + 2] = k[z + 2];
}

/** 원본 키 보간: 첫 키 이전 = 첫 값, 구간 (q−tᵢ)/(tᵢ₊₁−tᵢ) 선형, 마지막 이후 = 마지막 값(패딩 슬롯이 이어 줌) [판독 §6.3] */
export function keyAtOrig(t: KeyTab, q: number, out: Float64Array, o: number): void {
  ARG[2] = q;
  keyAtOrigA(t, out, o);
}

/** keyAtOrig(위상 = ARG[2]) — 스텝 경로용(실수 인자 없음) */
function keyAtOrigA(t: KeyTab, out: Float64Array, o: number): void {
  const q = ARG[2];
  const k = t.v;
  if (q <= k[3]) {
    out[o] = k[0];
    out[o + 1] = k[1];
    out[o + 2] = k[2];
    return;
  }
  for (let i = 0; i < MAX_KEYS - 1; i++) {
    const b = (i + 1) * 4;
    if (q < k[b + 3]) {
      const a = i * 4;
      const s = F(F(q - k[a + 3]) / F(k[b + 3] - k[a + 3]));
      out[o] = F(k[a] + F(F(k[b] - k[a]) * s));
      out[o + 1] = F(k[a + 1] + F(F(k[b + 1] - k[a + 1]) * s));
      out[o + 2] = F(k[a + 2] + F(F(k[b + 2] - k[a + 2]) * s));
      return;
    }
  }
  const z = (MAX_KEYS - 1) * 4;
  out[o] = k[z];
  out[o + 1] = k[z + 1];
  out[o + 2] = k[z + 2];
}

/** 이미터 정의 하나에서 미리 계산한 값 */
export class EmitterRt {
  /** 웹 셰이더 uniform 과 같은 값(이미터 색 곱) */
  readonly c0: KeyTab;
  readonly a0: KeyTab;
  readonly c1: KeyTab;
  readonly a1: KeyTab;
  readonly sk: KeyTab;
  /** 원본 슬롯 */
  readonly oc0: KeyTab;
  readonly oa0: KeyTab;
  readonly oc1: KeyTab;
  readonly oa1: KeyTab;
  readonly osk: KeyTab;
  readonly calcType: number;
  readonly follow: number;
  readonly sortType: number;
  readonly seedType: number;
  readonly transRandEmit: boolean;
  readonly fadeAlpha: boolean;
  readonly fadeScale: boolean;
  readonly seed: number;
  /** 한 번 방출 보정 뒤 interval */
  readonly interval: number;
  /** 원본 최대 입자 수(§6.1 식 4) */
  readonly maxParticles: number;
  readonly rotOn: [boolean, boolean, boolean];
  readonly revOn: [boolean, boolean, boolean];
  readonly fluct: { alpha: boolean; scale: boolean; scaleY: boolean; amp: V3; cycle: V3; rnd: V3; phase: V3 };
  readonly loopPeriod: Float64Array;
  readonly loopRandom: Float64Array;
  readonly fspn: { angle: number; axis: number; radial: number } | null;
  readonly frn1: { a: V3; k: number } | null;
  readonly inheritVel: boolean;
  readonly inheritScale: boolean;
  readonly inheritRot: boolean;
  readonly inheritRate: [number, number];
  /** 부모 수명 timing(bit17 D[D5C]) */
  readonly parentTiming: boolean;
  readonly gravityOn: boolean;

  constructor(readonly def: EmitterDef) {
    const c = def.color;
    const ec0 = def.emitterColor0;
    const ec1 = def.emitterColor1;
    const mulE = (k: KeyTab, e: readonly number[], alpha: boolean): KeyTab => {
      for (let i = 0; i < MAX_KEYS; i++) {
        if (alpha) k.v[i * 4] *= e[3];
        else {
          k.v[i * 4] = k.v[i * 4] * e[0];
          k.v[i * 4 + 1] = k.v[i * 4 + 1] * e[1];
          k.v[i * 4 + 2] = k.v[i * 4 + 2] * e[2];
        }
      }
      return k;
    };
    this.c0 = mulE(keyTabWeb(c.color0Type, c.color0, c.color0Keys, false), ec0, false);
    this.a0 = mulE(keyTabWeb(c.alpha0Type, [c.alpha0], c.alpha0Keys, true), ec0, true);
    this.c1 = mulE(keyTabWeb(c.color1Type, c.color1, c.color1Keys, false), ec1, false);
    this.a1 = mulE(keyTabWeb(c.alpha1Type, [c.alpha1], c.alpha1Keys, true), ec1, true);
    this.sk = def.scale.keys.length ? keyTabWeb(2, [1, 1, 1], def.scale.keys, false) : keyTabWeb(0, [1, 1, 1], [], false);
    this.oc0 = keyTabOrig(c.color0Type === 3 ? 2 : c.color0Type, c.color0, c.color0Keys, false);
    this.oa0 = keyTabOrig(c.alpha0Type, [c.alpha0], c.alpha0Keys, true);
    this.oc1 = keyTabOrig(c.color1Type === 3 ? 2 : c.color1Type, c.color1, c.color1Keys, false);
    this.oa1 = keyTabOrig(c.alpha1Type, [c.alpha1], c.alpha1Keys, true);
    this.osk = keyTabOrig(def.scale.keys.length ? 2 : 0, [1, 1, 1], def.scale.keys, false);
    const o = def.orig;
    const i0 = o?.info0 ?? [];
    this.calcType = def.calcType ?? i0[2] ?? 0;
    this.follow = def.followType ?? i0[3] ?? 0;
    this.sortType = i0[1] ?? 0;
    this.seedType = i0[4] ?? 0;
    this.transRandEmit = !!i0[5];
    this.fadeAlpha = !!i0[11];
    this.fadeScale = !!i0[12];
    this.seed = o?.seed ?? 0;
    const e = def.emit;
    this.interval = e.oneTime && !e.emitDist && e.duration < e.interval ? e.duration : e.interval;
    const step = this.interval + 1;
    const dur = e.duration !== 0 ? e.duration : 1;
    const k = e.oneTime ? Math.floor(dur / step) : Math.floor(def.particle.life / step);
    let n = Math.floor(Math.floor(e.rate * k) + Math.floor(e.rate) * 2);
    const sh = def.shape;
    if (sh.primEmitType === 0) {
      if (sh.type === 13) n *= Math.max(1, sh.numDivideLine);
      else if (sh.type === 2) n *= Math.max(1, sh.numDivideCircle);
    }
    this.maxParticles = Math.max(1, n);
    const b = (x: number | boolean): boolean => !!x;
    this.rotOn = [b(def.particle.isRotate[0]), b(def.particle.isRotate[1]), b(def.particle.isRotate[2])];
    this.revOn = [b(def.particle.rotRevRand[0]), b(def.particle.rotRevRand[1]), b(def.particle.rotRevRand[2])];
    const fp = o?.fluctParam ?? [1, 1, 20, 20, 0, 0, 0, 0];
    this.fluct = {
      alpha: !!o?.fluct[0],
      scale: !!o?.fluct[1],
      scaleY: !!o?.fluct[2],
      amp: [fp[0], fp[1], 0],
      cycle: [fp[2], fp[3], 0],
      rnd: [fp[4], fp[5], 0],
      phase: [fp[6], fp[7], 0],
    };
    this.loopPeriod = new Float64Array(5);
    this.loopRandom = new Float64Array(5);
    for (let j = 0; j < 5; j++) {
      this.loopPeriod[j] = o?.loopOn[j] ? (o.loopPeriod[j] ?? 0) : 0;
      this.loopRandom[j] = o?.loopRandom[j] ? 1 : 0;
    }
    this.fspn = o?.fspn ? { angle: o.fspn.f32[0], axis: o.fspn.u32[1], radial: o.fspn.f32[2] } : null;
    this.frn1 = o?.frn1 ? { a: [o.frn1.f32[0], o.frn1.f32[1], o.frn1.f32[2]], k: o.frn1.u32[3] } : null;
    const ih = o?.inherit0 ?? [];
    this.inheritVel = !!ih[8];
    this.inheritScale = !!ih[9];
    this.inheritRot = !!ih[10];
    this.inheritRate = o?.inheritRate ?? [1, 1];
    this.parentTiming = !!(Math.floor((o?.inheritD58 ?? 0) / 2 ** 32) & 0xff);
    this.gravityOn = def.gravity[0] !== 0 || def.gravity[1] !== 0 || def.gravity[2] !== 0;
  }

  /** 이전 웹 초기 풀 크기(2 거듭제곱) */
  webCapacity(): number {
    const def = this.def;
    const e = def.emit;
    const sh = def.shape;
    const div = sh.primEmitType === 0 && sh.type === 2 ? sh.numDivideCircle : sh.primEmitType === 0 && sh.type === 13 ? sh.numDivideLine : 1;
    const step = (e.oneTime && e.duration < e.interval ? e.duration : e.interval) + 1;
    const emissions = e.oneTime ? Math.ceil(Math.max(1, e.duration) / step) : Math.ceil(def.particle.life / step) + 1;
    const want = Math.ceil(e.rate) * Math.max(1, div) * emissions * 2;
    return Math.min(MAX_CAPACITY, 2 ** Math.ceil(Math.log2(Math.max(16, want))));
  }
}

/* ================================================================ 입자 풀 */

/** 이미터 정의 하나의 입자 묶음(모든 이펙트 인스턴스가 함께 쓴다). 링 버퍼, 살아 있는 칸을 덮으려 하면 두 배로 늘린다 */
export class ParticlePool {
  cap = 0;
  head = 0;
  used = 0;
  lastDeath = 0;
  /** 이번 sync 의 그리기 순서(칸 번호)와 개수 */
  order = new Int32Array(0);
  count = 0;
  /** 소유 이미터 인스턴스 id(−1 = 빈 칸) */
  owner = new Int32Array(0);
  birth = new Float64Array(0);
  death = new Float32Array(0);
  life = new Float32Array(0);
  p = new Float32Array(0);
  v = new Float32Array(0);
  rot0 = new Float32Array(0);
  rotV = new Float32Array(0);
  scl = new Float32Array(0);
  /** web: (r0, r1, emitFrame, −) / original: U.xyzw */
  u = new Float32Array(0);
  m = new Float32Array(0);
  /** 생성 때 행렬(3×4, follow 1·2·web 이 아닌 원본 자식) */
  bm = new Float32Array(0);
  /** 원본 자식 방출 진행(부모 칸의 다음 자식 방출 나이) */
  childNext = new Float64Array(0);
  /** 출력: 월드 위치·크기·회전·색0·색1·(나이, 수명, r0, r1)·기저(3×3)·fade */
  oPos = new Float32Array(0);
  oScl = new Float32Array(0);
  oRot = new Float32Array(0);
  oC0 = new Float32Array(0);
  oC1 = new Float32Array(0);
  oMisc = new Float32Array(0);
  oBasis = new Float32Array(0);
  oFade = new Float32Array(0);
  oKey = new Float64Array(0);
  private tmpOrder = new Int32Array(0);

  constructor(
    readonly id: number,
    readonly rt: EmitterRt,
    capacity: number,
  ) {
    this.alloc(capacity);
  }

  get def(): EmitterDef {
    return this.rt.def;
  }

  /** 늘리기(방출 때만) — 기존 값 복사, 새 칸은 빈 칸 */
  alloc(cap: number): void {
    const old = this.cap;
    const grow = <T extends Float32Array | Float64Array | Int32Array>(a: T, n: number, fill?: number): T => {
      const b = new (a.constructor as new (n: number) => T)(cap * n);
      if (old) b.set(a);
      if (fill !== undefined) b.fill(fill, old * n);
      return b;
    };
    this.owner = grow(this.owner, 1, -1);
    this.birth = grow(this.birth, 1);
    this.death = grow(this.death, 1, -1);
    this.life = grow(this.life, 1);
    this.p = grow(this.p, 3);
    this.v = grow(this.v, 3);
    this.rot0 = grow(this.rot0, 3);
    this.rotV = grow(this.rotV, 3);
    this.scl = grow(this.scl, 3);
    this.u = grow(this.u, 4);
    this.m = grow(this.m, 1);
    this.bm = grow(this.bm, 12);
    this.childNext = grow(this.childNext, 1);
    this.oPos = grow(this.oPos, 3);
    this.oScl = grow(this.oScl, 3);
    this.oRot = grow(this.oRot, 3);
    this.oC0 = grow(this.oC0, 4);
    this.oC1 = grow(this.oC1, 4);
    this.oMisc = grow(this.oMisc, 4);
    this.oBasis = grow(this.oBasis, 9);
    this.oFade = grow(this.oFade, 1);
    this.oKey = grow(this.oKey, 1);
    this.order = new Int32Array(cap);
    this.tmpOrder = new Int32Array(cap);
    this.cap = cap;
  }

  /** web 칸 고르기: 머리 칸이 아직 살아 있으면 끝에 붙이며 두 배로 */
  takeWeb(clock: number): number {
    let i = this.head;
    if (this.death[i] > clock) {
      if (this.cap < MAX_CAPACITY) {
        i = this.cap;
        this.alloc(this.cap * 2);
      }
    }
    this.head = (i + 1) % this.cap;
    this.used = Math.max(this.used, i + 1);
    return i;
  }

  /** original 칸 고르기: 머리부터 빈 칸, 꽉 차면 두 배로 */
  takeOrig(): number {
    for (let k = 0; k < this.cap; k++) {
      const i = (this.head + k) % this.cap;
      if (this.owner[i] < 0) {
        this.head = (i + 1) % this.cap;
        this.used = Math.max(this.used, i + 1);
        return i;
      }
    }
    const i = this.cap;
    this.alloc(this.cap * 2);
    this.head = (i + 1) % this.cap;
    this.used = Math.max(this.used, i + 1);
    return i;
  }

  /** 정렬 버퍼(order[a..b) 를 key 로, 같으면 칸 번호 오름차순 — 안정 병합) */
  sortRange(a: number, b: number, desc: boolean, negFlip: boolean): void {
    const key = this.oKey;
    const o = this.order;
    const t = this.tmpOrder;
    for (let w = 1; w < b - a; w *= 2) {
      for (let lo = a; lo < b; lo += 2 * w) {
        const mid = Math.min(lo + w, b);
        const hi = Math.min(lo + 2 * w, b);
        let i = lo,
          j = mid,
          k = lo;
        while (i < mid && j < hi) t[k++] = sortBefore(key, o[j], o[i], desc, negFlip) ? o[j++] : o[i++];
        while (i < mid) t[k++] = o[i++];
        while (j < hi) t[k++] = o[j++];
      }
      for (let k = a; k < b; k++) o[k] = t[k];
    }
  }
}

/** 정렬 비교: key 같으면 칸 번호 오름차순. negFlip = 두 key 가 모두 음수이면 방향을 뒤집는 원본 comparator(§6.5 sortType 2) */
function sortBefore(key: Float64Array, x: number, y: number, desc: boolean, negFlip: boolean): boolean {
  const kx = key[x];
  const ky = key[y];
  if (kx === ky) return x < y;
  if (negFlip && kx < 0 && ky < 0) return desc ? kx < ky : kx > ky;
  return desc ? kx > ky : kx < ky;
}

/* ================================================================ 이미터·이펙트 인스턴스 */

class EmitterInst {
  /** 웹 */
  step = 1;
  next = 0;
  accum = 0;
  done = false;
  readonly matrix = new Float64Array(16);
  readonly dir = new Float64Array(9);
  /** 원본: 이미터 시각 E[28]·다음 방출·첫 방출 bit1·살아 있는 입자 수·fade F */
  t = 0;
  nextEmit = 0;
  emitted = false;
  live = 0;
  fadeF = 1;
  /** 원본 이미터 로컬 E[180..](회전·이동 난수 포함)·월드 W(이펙트·E) */
  readonly E = new Float64Array(16);
  readonly W = new Float64Array(16);
  readonly basis = new Float64Array(9);
  readonly basisLen = new Float64Array(3);
  /** 원본 이번 스텝 dt(그리기 나이 = E[28] − dt − b, §6.4 UBO writer) */
  dtLast = 1;
  /** N/Q 표 cursor E[4A0/4A2](초기 seed 하위/상위 16비트) [판독 §6.2] */
  curN = 0;
  curQ = 0;
  lcg = new Lcg(0);
  readonly children: EmitterInst[] = [];

  constructor(
    readonly id: number,
    readonly rt: EmitterRt,
    readonly pool: ParticlePool,
    readonly parent: EmitterInst | null,
    readonly inst: EffectInst,
  ) {}

  get def(): EmitterDef {
    return this.rt.def;
  }
}

interface Pending {
  time: number;
  em: EmitterInst;
  x: number;
  y: number;
  z: number;
}

class EffectInst {
  slot = 0;
  gen = 0;
  handle = -1;
  name = '';
  resource = '';
  seq = 0;
  readonly pos = new Float64Array(3);
  readonly rot = new Float64Array(3);
  /** 이미터셋 배율(SetScale) */
  scale = 1;
  readonly M = new Float64Array(16);
  dirty = true;
  attach: MatrixSource | null = null;
  readonly attachM = new Float64Array(16);
  selfDestroy = false;
  started = false;
  stopped = false;
  fading = false;
  killed = false;
  layerBits = 0xfff;
  rate = 1;
  priority = 0;
  /** 웹 */
  t0 = 0;
  lastDeath = 0;
  pending: Pending[] = [];
  emitters: EmitterInst[] = [];
  all: EmitterInst[] = [];
  /** 이미터셋 seed W[264](seed 선택 1) */
  setSeed = 0;
  /** 정렬 key(§6.7) */
  drawKey = 0;

  constructor(readonly set: EmitterSetDef) {}
}

/* ================================================================ 사건 */

export type EffectEventKind = 'create' | 'start' | 'stop' | 'fade' | 'kill' | 'release' | 'missing' | 'emit';

export interface EffectEvent {
  kind: EffectEventKind;
  handle: number;
  name: string;
  /** emit = 이번에 만든 입자 수, 그 밖 0 */
  count: number;
  step: number;
}

/* ================================================================ 코어 */

export interface EffectCoreOptions {
  registry?: EffectRegistry;
  rules?: Readonly<EffectRules>;
  /** web: 시스템 LCG 씨앗(이전 웹 0x12345678) */
  webSeed?: number;
  /** original: 공유 seed 원천(seed 선택 0·1) — u32 를 돌려준다. 기본 = xorshift128(주입 씨앗 4개) */
  seed?: () => number;
}

const OUT = new Float64Array(16);
const V = new Float64Array(16);
/** 실수 인자 칸 — 인라인 안 되는 호출에 double 을 넘기면 상자(heap number)가 생겨 스텝 할당이 된다 */
const ARG = new Float64Array(8);

export class EffectCore {
  readonly rules: Readonly<EffectRules>;
  readonly registry: EffectRegistry;
  readonly pools: ParticlePool[] = [];
  private readonly poolOf = new Map<EmitterDef, ParticlePool>();
  private readonly rtOf = new Map<EmitterDef, EmitterRt>();
  private readonly slots: (EffectInst | null)[] = [];
  private readonly gens: number[] = [];
  private readonly freeSlots: number[] = [];
  private readonly spare = new Map<EmitterSetDef, EffectInst[]>();
  /** 생성 순서(갱신 순서) */
  private active: EffectInst[] = [];
  private readonly emById: (EmitterInst | null)[] = [];
  private readonly freeEm: number[] = [];
  private readonly sys: Lcg;
  private readonly seedSrc: () => number;
  private seq = 0;
  /** web 시계(프레임) */
  clock = 0;
  /** 진행한 스텝 수 */
  steps = 0;
  /** 사건 고리(최근 64) */
  readonly events: EffectEvent[] = Array.from({ length: 64 }, () => ({ kind: 'create' as EffectEventKind, handle: -1, name: '', count: 0, step: 0 }));
  eventCount = 0;
  /** 카메라 view 행렬(열 우선 16, 정렬 key) — sync 전에 바깥이 넣는다 */
  readonly view = new Float64Array(IDENT);
  private readonly warned = new Set<string>();
  warn: (msg: string) => void = () => undefined;

  constructor(o: EffectCoreOptions = {}) {
    this.rules = o.rules ?? effectDefaults.rules;
    this.registry = o.registry ?? new EffectRegistry();
    this.sys = new Lcg(o.webSeed ?? 0x12345678);
    ensureNQ();
    if (o.seed) this.seedSrc = o.seed;
    else {
      const g = new Xorshift128(0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654321);
      this.seedSrc = () => g.next();
    }
  }

  private event(kind: EffectEventKind, inst: EffectInst | null, count = 0, name = ''): void {
    const e = this.events[this.eventCount++ & 63];
    e.kind = kind;
    e.handle = inst ? inst.handle : -1;
    e.name = inst ? inst.name : name;
    e.count = count;
    e.step = this.steps;
  }

  private warnOnce(msg: string): void {
    if (this.warned.has(msg)) return;
    this.warned.add(msg);
    this.warn(msg);
  }

  rt(def: EmitterDef): EmitterRt {
    let r = this.rtOf.get(def);
    if (!r) this.rtOf.set(def, (r = new EmitterRt(def)));
    return r;
  }

  pool(def: EmitterDef): ParticlePool {
    let p = this.poolOf.get(def);
    if (p) return p;
    const rt = this.rt(def);
    p = new ParticlePool(this.pools.length, rt, this.rules.id === 'web' ? rt.webCapacity() : Math.min(MAX_CAPACITY, 2 ** Math.ceil(Math.log2(Math.max(16, rt.maxParticles)))));
    this.pools.push(p);
    this.poolOf.set(def, p);
    return p;
  }

  private get(h: number): EffectInst | null {
    if (h < 0) return null;
    const slot = h & 0xfff;
    const inst = this.slots[slot];
    return inst && inst.handle === h ? inst : null;
  }

  /** 핸들이 아직 가리키는 이펙트가 있는가(세대 일치) */
  has(h: number): boolean {
    return !!this.get(h);
  }

  /* ---------------- Create / Setup */

  /** bex::Effect::Create(name) + Setup — 해석 실패 = −1(원본 Abort, 웹은 경고 후 무시) */
  create(name: string): number {
    const r = this.registry.resolve(name, this.rules.resolve);
    if (!r) {
      this.warnOnce(`이펙트 이름을 찾지 못했다: ${name}`);
      this.event('missing', null, 0, name);
      return -1;
    }
    const inst = this.spare.get(r.set)?.pop() ?? this.build(r.set);
    let slot = this.freeSlots.pop();
    if (slot === undefined) {
      slot = this.slots.length;
      this.slots.push(null);
      this.gens.push(0);
    }
    const gen = (this.gens[slot] = (this.gens[slot] + 1) & 0x7ffff);
    inst.slot = slot;
    inst.gen = gen;
    inst.handle = gen * 4096 + slot;
    inst.name = r.name;
    inst.resource = r.resource;
    inst.seq = this.seq++;
    inst.pos.fill(0);
    inst.rot.fill(0);
    inst.scale = 1;
    inst.dirty = true;
    inst.attach = null;
    inst.selfDestroy = false;
    inst.started = false;
    inst.stopped = false;
    inst.fading = false;
    inst.killed = false;
    inst.layerBits = 0xfff;
    inst.rate = 1;
    inst.pending.length = 0;
    inst.t0 = this.clock;
    inst.lastDeath = this.clock;
    inst.setSeed = this.rules.sampling === 'original' ? this.seedSrc() >>> 0 : 0;
    this.slots[slot] = inst;
    this.active.push(inst);
    for (const em of inst.all) this.resetEmitter(em);
    this.event('create', inst);
    return inst.handle;
  }

  private build(set: EmitterSetDef): EffectInst {
    const inst = new EffectInst(set);
    const mk = (def: EmitterDef, parent: EmitterInst | null): EmitterInst => {
      let id = this.freeEm.pop();
      if (id === undefined) {
        id = this.emById.length;
        this.emById.push(null);
      }
      const em = new EmitterInst(id, this.rt(def), this.pool(def), parent, inst);
      this.emById[id] = em;
      inst.all.push(em);
      for (const c of def.children) em.children.push(mk(c, em));
      return em;
    };
    for (const d of set.emitters) inst.emitters.push(mk(d, null));
    return inst;
  }

  /** 이미터 시작 상태(웹 = emitterInst, 원본 = 073b83c·073d770) — 난수 소비 순서는 이전 웹처럼 전위(부모 → 자식) */
  private resetEmitter(em: EmitterInst): void {
    const def = em.def;
    const rt = em.rt;
    em.done = false;
    em.accum = 0;
    em.live = 0;
    em.fadeF = 1;
    em.t = 0;
    em.emitted = false;
    if (this.rules.sampling === 'web') {
      const t = def.trs;
      composeZYX(em.matrix, t.trans, t.rotate, t.scale);
      const m = em.matrix;
      em.dir[0] = m[0];
      em.dir[1] = m[1];
      em.dir[2] = m[2];
      em.dir[3] = m[4];
      em.dir[4] = m[5];
      em.dir[5] = m[6];
      em.dir[6] = m[8];
      em.dir[7] = m[9];
      em.dir[8] = m[10];
      em.lcg.s = this.sys.raw();
      em.step = rt.interval + 1;
      em.next = def.emit.start;
    } else {
      em.lcg.s = this.seedFor(em);
      em.curN = em.lcg.s & 0xffff;
      em.curQ = em.lcg.s >>> 16;
      em.dtLast = 1;
      this.emitterTrs(em);
      em.step = rt.interval + 1;
      em.nextEmit = def.emit.start;
    }
  }

  /** seed 선택 D[CC4]: 0 = 공유 xorshift 다음 값, 1 = 이미터셋 W[264], 2 = D[CD0]·0xDFDC1C35 [판독 §6.2] */
  private seedFor(em: EmitterInst): number {
    const rt = em.rt;
    if (rt.seedType === 2) return Math.imul(rt.seed >>> 0, 0xdfdc1c35) >>> 0;
    if (rt.seedType === 1) return em.inst.setSeed;
    return this.seedSrc() >>> 0;
  }

  /** 073d770: 회전 D[CF8]+(2u−1)⊙D[D04] 3회, 이동 D[CE0]+(2u−1)⊙D[CEC] 3회로 E 를 만든다 [판독 §6.2]. 회전 순서 ZYX 는 이전 웹과 같은 [근사] */
  private emitterTrs(em: EmitterInst): void {
    const t = em.def.trs;
    const rr = t.rotateRand ?? [0, 0, 0];
    const L = em.lcg;
    for (let j = 0; j < 3; j++) V[j] = F(t.rotate[j] + F(F(2 * L.u() - 1) * rr[j]));
    for (let j = 0; j < 3; j++) V[3 + j] = F(t.trans[j] + F(F(2 * L.u() - 1) * t.transRand[j]));
    composeZYX(em.E, [V[3], V[4], V[5]], [V[0], V[1], V[2]], t.scale);
  }

  /* ---------------- 설정 */

  setPosition(h: number, x: number, y: number, z: number): void {
    const i = this.get(h);
    if (!i) return;
    i.pos[0] = x;
    i.pos[1] = y;
    i.pos[2] = z;
    i.dirty = true;
  }

  setRotation(h: number, x: number, y: number, z: number): void {
    const i = this.get(h);
    if (!i) return;
    i.rot[0] = x;
    i.rot[1] = y;
    i.rot[2] = z;
    i.dirty = true;
  }

  /** SetScale(이미터셋 배율) */
  setScale(h: number, s: number): void {
    const i = this.get(h);
    if (!i) return;
    i.scale = s;
    i.dirty = true;
  }

  setSelfDestroy(h: number, b: boolean): void {
    const i = this.get(h);
    if (i) i.selfDestroy = b;
  }

  setLayerBits(h: number, bits: number): void {
    const i = this.get(h);
    if (i) i.layerBits = bits >>> 0;
  }

  /** SetAnimationSpeed — 원본 규칙에서 이미터 dt 배율(PlayRate) */
  setAnimationSpeed(h: number, rate: number): void {
    const i = this.get(h);
    if (i) i.rate = rate;
  }

  /** Attach(엔티티 월드 행렬) / null = 떼기 */
  attach(h: number, src: MatrixSource | null): void {
    const i = this.get(h);
    if (!i) return;
    i.attach = src;
    i.dirty = true;
  }

  layerBits(h: number): number {
    return this.get(h)?.layerBits ?? 0;
  }

  /* ---------------- Start / Stop */

  /** Start(update) — web: 생성 즉시 방출(이전 웹 create), original: 다음 step 의 첫 계산에서 방출(§5.3) */
  start(h: number, update = false): void {
    const i = this.get(h);
    if (!i) return;
    if (i.started && this.rules.emission === 'original') {
      for (const em of i.all) this.killEmitter(em);
      for (const em of i.all) this.resetEmitter(em);
    }
    i.started = true;
    i.stopped = false;
    i.fading = false;
    this.event('start', i);
    if (this.rules.emission === 'web') {
      i.t0 = this.clock;
      i.lastDeath = this.clock;
      this.webAdvance(i);
      for (const p of this.pools) this.webFlush(p);
    } else if (update) this.updateMatrix(i);
  }

  /** Stop(fade) — web: 방출만 멈춘다. original: false = 이미터셋 즉시 kill, true = fade 요청(§5.3) */
  stop(h: number, fade = false): void {
    const i = this.get(h);
    if (!i) return;
    if (this.rules.stop === 'web') {
      i.stopped = true;
      for (const em of i.emitters) em.done = true;
      this.event('stop', i);
      return;
    }
    if (!fade) {
      for (const em of i.all) this.killEmitter(em);
      i.killed = true;
      this.event('stop', i);
      return;
    }
    i.fading = true;
    this.event('fade', i);
  }

  stopImmediately(h: number): void {
    const i = this.get(h);
    if (!i) return;
    for (const em of i.all) this.killEmitter(em);
    i.killed = true;
    this.event('stop', i);
  }

  /** 핸들을 버린다(입자 제거·인스턴스 반납) */
  release(h: number): void {
    const i = this.get(h);
    if (i) this.free(i);
  }

  private killEmitter(em: EmitterInst): void {
    const p = em.pool;
    for (let s = 0; s < p.used; s++)
      if (p.owner[s] === em.id) {
        p.owner[s] = -1;
        p.death[s] = -1;
      }
    em.live = 0;
    em.done = true;
  }

  private free(i: EffectInst): void {
    for (const em of i.all) this.killEmitter(em);
    this.event('release', i);
    this.slots[i.slot] = null;
    this.freeSlots.push(i.slot);
    i.handle = -1;
    const k = this.active.indexOf(i);
    if (k >= 0) {
      for (let j = k; j < this.active.length - 1; j++) this.active[j] = this.active[j + 1];
      this.active.length--;
    }
    let list = this.spare.get(i.set);
    if (!list) this.spare.set(i.set, (list = []));
    list.push(i);
  }

  /** 살아 있는 이펙트 수 */
  get activeCount(): number {
    return this.active.length;
  }

  /** 원본 생존 판정(§5.3 0727394): 방출이 남았거나 입자가 살아 있다 */
  alive(h: number): boolean {
    const i = this.get(h);
    return !!i && this.isAlive(i);
  }

  private isAlive(i: EffectInst): boolean {
    if (this.rules.emission === 'web') return !(i.emitters.every((em) => em.done) && i.pending.length === 0 && i.lastDeath <= this.clock);
    if (i.killed) return false;
    for (let k = 0; k < i.all.length; k++) {
      const em = i.all[k];
      if (em.live > 0 || (!em.done && em.parent === null)) return true;
    }
    return false;
  }

  /* ---------------- 진행 */

  /** 고정 스텝 하나(1/60) */
  step(): void {
    this.steps++;
    if (this.rules.emission === 'web') {
      this.clock += 1;
      for (let k = 0; k < this.active.length; k++) {
        const i = this.active[k];
        if (!i.started) continue;
        const n = this.active.length;
        this.webAdvance(i);
        if (this.active.length < n) k--;
      }
      for (const p of this.pools) this.webFlush(p);
      return;
    }
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k];
      if (!i.started || i.killed) continue;
      this.updateMatrix(i);
      for (let e = 0; e < i.emitters.length; e++) this.origEmitter(i, i.emitters[e]);
    }
    /* selfDestroy 지연 정리(0x12 갱신 → 0x14 해제, §5.3) */
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k];
      if (i.started && i.selfDestroy && !this.isAlive(i)) {
        this.free(i);
        k--;
      }
    }
  }

  /** 부착·위치 dirty → 이펙트 행렬 M = 부모 · T·R·S(011f090·011d900) */
  private updateMatrix(i: EffectInst): void {
    if (!i.dirty && !i.attach) return;
    const s = i.scale;
    composeZYX(OUT, [i.pos[0], i.pos[1], i.pos[2]], [i.rot[0], i.rot[1], i.rot[2]], [s, s, s]);
    if (i.attach) {
      i.attach.readMatrix(i.attachM);
      mul4(i.M, i.attachM, OUT);
    } else i.M.set(OUT);
    i.dirty = false;
    for (let k = 0; k < i.all.length; k++) {
      const em = i.all[k];
      if (em.parent) continue;
      mul4(em.W, i.M, em.E);
      this.basisOf(em);
    }
  }

  private basisOf(em: EmitterInst): void {
    const w = em.W;
    for (let j = 0; j < 3; j++) {
      const x = w[j * 4],
        y = w[j * 4 + 1],
        z = w[j * 4 + 2];
      const l = Math.sqrt(x * x + y * y + z * z);
      em.basisLen[j] = l;
      const r = l > 0 ? 1 / l : 0;
      em.basis[j * 3] = x * r;
      em.basis[j * 3 + 1] = y * r;
      em.basis[j * 3 + 2] = z * r;
    }
  }

  /* ================================================================ web 경로(이전 mg1801 view/effects.ts 그대로) */

  private webAdvance(inst: EffectInst): void {
    const elapsed = this.clock - inst.t0;
    for (const em of inst.emitters) {
      const e = em.def.emit;
      while (!em.done && em.next <= elapsed + 1e-6) {
        if (e.oneTime && em.next >= e.start + e.duration) {
          em.done = true;
          break;
        }
        this.webEmit(inst, em, inst.t0 + em.next, em.next, inst.pos[0], inst.pos[1], inst.pos[2]);
        em.next += em.step;
      }
      if (e.oneTime && em.next >= e.start + e.duration) em.done = true;
    }
    if (inst.pending.length) {
      inst.pending.sort((a, b) => a.time - b.time);
      while (inst.pending.length && inst.pending[0].time <= this.clock + 1e-6) {
        const c = inst.pending.shift()!;
        this.webEmitChild(inst, c.em, c.time, c.x, c.y, c.z);
      }
    }
    const finished = inst.emitters.every((em) => em.done) && inst.pending.length === 0 && inst.lastDeath <= this.clock;
    if (finished && (inst.selfDestroy || inst.stopped)) this.free(inst);
  }

  /** 자식 이미터: 부모 입자 위치에서 one-time 창(duration) 동안 방출 */
  private webEmitChild(inst: EffectInst, em: EmitterInst, time: number, x: number, y: number, z: number): void {
    const e = em.def.emit;
    for (let f = 0; f < Math.max(1, e.duration); f += em.step) this.webEmit(inst, em, time + f, f, x, y, z);
  }

  private webEmit(inst: EffectInst, em: EmitterInst, spawn: number, emitFrame: number, ox: number, oy: number, oz: number): void {
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
    const pool = em.pool;
    for (let i = 0; i < n; i++) {
      this.webInitParticle(em, i, div, callU, ox, oy, oz, inst.scale);
      const s = pool.takeWeb(this.clock);
      const q = Q;
      pool.owner[s] = em.id;
      pool.birth[s] = spawn;
      pool.p[s * 3] = q[0];
      pool.p[s * 3 + 1] = q[1];
      pool.p[s * 3 + 2] = q[2];
      pool.v[s * 3] = q[3];
      pool.v[s * 3 + 1] = q[4];
      pool.v[s * 3 + 2] = q[5];
      pool.life[s] = q[6];
      pool.rot0[s * 3] = q[7];
      pool.rot0[s * 3 + 1] = q[8];
      pool.rot0[s * 3 + 2] = q[9];
      pool.rotV[s * 3] = q[10];
      pool.rotV[s * 3 + 1] = q[11];
      pool.rotV[s * 3 + 2] = q[12];
      pool.scl[s * 3] = q[13];
      pool.scl[s * 3 + 1] = q[14];
      pool.scl[s * 3 + 2] = q[15];
      pool.u[s * 4] = q[16];
      pool.u[s * 4 + 1] = q[17];
      pool.u[s * 4 + 2] = emitFrame;
      pool.death[s] = spawn + q[6];
      pool.lastDeath = Math.max(pool.lastDeath, spawn + q[6]);
      inst.lastDeath = Math.max(inst.lastDeath, spawn + q[6]);
      for (const c of em.children) {
        const age = Math.floor((q[6] * c.def.emit.timing) / 100);
        this.webPositionAt(def, age);
        inst.pending.push({ time: spawn + age, em: c, x: Q2[0], y: Q2[1], z: Q2[2] });
      }
    }
    this.event('emit', inst, n);
  }

  private webPositionAt(def: EmitterDef, n: number): void {
    const a = def.airRes;
    const g = def.gravity;
    if (Math.abs(1 - a) < 1e-5) {
      const k = (n * (n + 1)) / 2;
      Q2[0] = Q[0] + Q[3] * n + g[0] * k;
      Q2[1] = Q[1] + Q[4] * n + g[1] * k;
      Q2[2] = Q[2] + Q[5] * n + g[2] * k;
      return;
    }
    const s = (a * (1 - a ** n)) / (1 - a);
    const k = (n - s) / (1 - a);
    Q2[0] = Q[0] + Q[3] * s + g[0] * k;
    Q2[1] = Q[1] + Q[4] * s + g[1] * k;
    Q2[2] = Q[2] + Q[5] * s + g[2] * k;
  }

  /** 이전 웹 단위벡터(LCG 2개) → V[0..2] */
  private randUnit(L: Lcg, o: number): void {
    const z = L.next() * 2 - 1;
    const a = L.next() * TWO_PI;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    V[o] = r * Math.cos(a);
    V[o + 1] = r * Math.sin(a);
    V[o + 2] = z;
  }

  /** 모양별 방출 위치(이미터 로컬)와 법선 방향 [판독: 원본 볼륨 함수표 0x7101b59378] */
  private webVolume(em: EmitterInst, i: number, div: number, callU: number): void {
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
        if (sh.type === 1) {
          setP(s * rx, 0, c * rz);
          setN(s, 0, c);
          return;
        }
        const k = Math.sqrt(L.next());
        setP(s * rx * k, 0, c * rz * k);
        const l = Math.sqrt(Q[0] * Q[0] + Q[2] * Q[2]) || 1;
        setN(Q[0] * (1 / l), 0 * (1 / l), Q[2] * (1 / l));
        return;
      }
      case 2:
      case 13: {
        const full = Math.abs(sh.sweepLongitude - TWO_PI) < 1e-6;
        const d = div - (!full && div !== 1 && div > 0 ? 1 : 0);
        const idx = i % (d + 1);
        if (sh.type === 13) {
          const x = sh.lineCenter - sh.lineLength * 0.5 + (d > 0 ? (sh.lineLength / d) * idx : 0);
          setP(x * sh.formScale[0], 0, 0);
          setN(Math.sign(x), 0, 0);
          return;
        }
        const a = start - sh.sweepLongitude * 0.5 + (sh.sweepLongitude / Math.max(d, 1)) * idx + sh.surfacePosRandom * (2 * L.next() - 1);
        const s = Math.sin(a);
        const c = Math.cos(a);
        setP(s * rx, 0, c * rz);
        setN(s, 0, c);
        return;
      }
      case 10: {
        const w9 = L.raw();
        const w8 = L.raw();
        const s3 = L.raw() * U32_WEB * 2 - 1;
        const s1 = L.raw() * U32_WEB * 2 - 1;
        const s4 = L.raw() * U32_WEB * 2 - 1;
        const sign = w8 < 0x7fffffff ? 1 : -1;
        if (w9 <= 0x55555554) setP(rx * s3, ry * s1, rz * sign);
        else if (w9 <= 0xaaaaaaa9) setP(rx * s3, ry * sign, rz * s4);
        else setP(rx * sign, ry * s1, rz * s4);
        const lsq = Q[0] * Q[0] + Q[1] * Q[1] + Q[2] * Q[2];
        if (lsq > 0) {
          const l = Math.sqrt(lsq) || 1;
          setN(Q[0] * (1 / l), Q[1] * (1 / l), Q[2] * (1 / l));
        } else setN(0, 0, 0);
        return;
      }
      case 4: {
        this.randUnit(L, 0);
        setP(V[0] * rx, V[1] * ry, V[2] * rz);
        return;
      }
      default:
        if (sh.type !== 0) this.warnOnce(`volumeType ${sh.type} 미구현(점으로 근사): ${em.def.name}`);
        setP(0, 0, 0);
        this.randUnit(L, 0);
    }
  }

  /** 이전 웹 initParticle → Q[0..17] = p(3) v(3) life rot(3) rotV(3) scl(3) r0 r1(p·v 는 double, 풀에 넣을 때 f32) */
  private webInitParticle(em: EmitterInst, i: number, div: number, callU: number, ox: number, oy: number, oz: number, setScale: number): void {
    const def = em.def;
    const L = em.lcg;
    const vel = def.velocity;
    this.webVolume(em, i, div, callU);
    let px = Q[0],
      py = Q[1],
      pz = Q[2];
    let vx = V[0] * vel.allDirection,
      vy = V[1] * vel.allDirection,
      vz = V[2] * vel.allDirection;
    if (def.emit.positionRandom) {
      this.randUnit(L, 3);
      px += V[3] * def.emit.positionRandom;
      py += V[4] * def.emit.positionRandom;
      pz += V[5] * def.emit.positionRandom;
    }
    if (vel.xzDiffusion) {
      let dx = px,
        dz = pz;
      if (dx * dx + 0 * 0 + dz * dz <= 1.1920929e-7) {
        dx = L.next() * 2 - 1;
        dz = L.next() * 2 - 1;
      }
      const l = Math.sqrt(dx * dx + 0 * 0 + dz * dz) || 1;
      dx *= 1 / l;
      dz *= 1 / l;
      vx += dx * vel.xzDiffusion;
      vy += 0 * (1 / l) * vel.xzDiffusion;
      vz += dz * vel.xzDiffusion;
    }
    if (vel.designatedDirScale) {
      let dx = vel.designatedDir[0],
        dy = vel.designatedDir[1],
        dz = vel.designatedDir[2];
      if (vel.diffusionDirAngle > 0) {
        const cosT = 1 - L.next() * (vel.diffusionDirAngle / 90);
        const phi = L.next() * TWO_PI;
        const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nl = len || 1;
        const tx = dx * (1 / nl),
          ty = dy * (1 / nl),
          tz = dz * (1 / nl);
        quatFromUnitY(tx, ty, tz);
        applyQuat(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi));
        dx = V[6] * len;
        dy = V[7] * len;
        dz = V[8] * len;
      }
      vx += dx * vel.designatedDirScale;
      vy += dy * vel.designatedDirScale;
      vz += dz * vel.designatedDirScale;
    }
    const vr = 1 - (L.next() * vel.velRandom) / 100;
    vx *= vr;
    vy *= vr;
    vz *= vr;
    if (vel.diffusion[0] !== 0 || vel.diffusion[1] !== 0 || vel.diffusion[2] !== 0) {
      this.randUnit(L, 3);
      vx += vel.diffusion[0] * V[3];
      vy += vel.diffusion[1] * V[4];
      vz += vel.diffusion[2] * V[5];
    }
    const tr = def.trs.transRand;
    if (tr[0] !== 0 || tr[1] !== 0 || tr[2] !== 0) {
      const a = tr[0] * (L.next() * 2 - 1);
      const b = tr[1] * (L.next() * 2 - 1);
      const c = tr[2] * (L.next() * 2 - 1);
      px += a;
      py += b;
      pz += c;
    }
    const e = em.matrix;
    const w = 1 / (e[3] * px + e[7] * py + e[11] * pz + e[15]);
    const wx = (e[0] * px + e[4] * py + e[8] * pz + e[12]) * w;
    const wy = (e[1] * px + e[5] * py + e[9] * pz + e[13]) * w;
    const wz = (e[2] * px + e[6] * py + e[10] * pz + e[14]) * w;
    Q[0] = wx * setScale + ox;
    Q[1] = wy * setScale + oy;
    Q[2] = wz * setScale + oz;
    const d = em.dir;
    const ax = d[0] * vx + d[3] * vy + d[6] * vz;
    const ay = d[1] * vx + d[4] * vy + d[7] * vz;
    const az = d[2] * vx + d[5] * vy + d[8] * vz;
    vx = ax * setScale;
    vy = ay * setScale;
    vz = az * setScale;
    const sc = def.scale;
    let sx = sc.base[0],
      sy = sc.base[1],
      sz = sc.base[2];
    if (sc.random[0] === sc.random[1] && sc.random[1] === sc.random[2]) {
      const k = 1 - (L.next() * sc.random[0]) / 100;
      sx *= k;
      sy *= k;
      sz *= k;
    } else {
      sx = sc.base[0] * (1 - (L.next() * sc.random[0]) / 100);
      sy = sc.base[1] * (1 - (L.next() * sc.random[1]) / 100);
      sz = sc.base[2] * (1 - (L.next() * sc.random[2]) / 100);
    }
    sx *= setScale;
    sy *= setScale;
    sz *= setScale;
    const m = def.particle.momentumRandom;
    const mom = m + 1 - L.next() * m * 2;
    vx *= mom;
    vy *= mom;
    vz *= mom;
    const pt = def.particle;
    const life = pt.infiniteLife ? 1e8 : Math.max(1, Math.trunc(pt.life * (1 - Math.floor(L.next() * pt.lifeRandom) / 100)));
    const ro = def.rotate;
    Q[7] = Q[8] = Q[9] = Q[10] = Q[11] = Q[12] = 0;
    for (let k = 0; k < 3; k++) {
      if (!em.rt.rotOn[k]) continue;
      let r0 = ro.init[k] + L.next() * ro.initRand[k];
      let add = ro.add[k] + L.next() * ro.addRand[k];
      if (em.rt.revOn[k] && L.next() < 0.5) {
        r0 = -r0;
        add = -add;
      }
      Q[7 + k] = r0;
      Q[10 + k] = add;
    }
    Q[3] = vx;
    Q[4] = vy;
    Q[5] = vz;
    Q[6] = life;
    Q[13] = sx;
    Q[14] = sy;
    Q[15] = sz;
    Q[16] = L.next();
    Q[17] = L.next();
  }

  /** 프레임마다: 모두 죽었으면 비운다(이전 Batch.flush 의 링 머리 되감기) */
  private webFlush(p: ParticlePool): void {
    if (p.used > 0 && p.lastDeath <= this.clock) {
      p.used = 0;
      p.head = 0;
    }
  }

  /* ================================================================ original 경로 */

  /** 최상위 이미터 하나의 한 스텝: fade → 방출(074d580 → 074cb60) → 입자 갱신·자식 방출 → 시각 진행 */
  private origEmitter(inst: EffectInst, em: EmitterInst): void {
    const rt = em.rt;
    const def = em.def;
    const e = def.emit;
    const dt = this.rules.playRate ? inst.rate : 1;
    if (inst.fading) {
      this.origFade(em, dt);
      em.done = true;
    }
    if (!em.done) {
      const t = em.t;
      const end = e.start + e.duration;
      if (t >= e.start && (!e.oneTime || t < end || !em.emitted)) {
        let guard = 0;
        while (t >= em.nextEmit - 1e-6 && guard++ < 64) {
          this.origEmit(inst, em, null, -1);
          em.nextEmit += this.nextInterval(em);
          if (e.oneTime && em.nextEmit >= end) break;
        }
      }
      if (e.oneTime && em.t + dt >= end && em.nextEmit >= end) em.done = true;
    }
    this.origUpdate(inst, em, dt);
    this.origAdvance(em, dt);
    if (inst.fading && em.fadeF === 0 && (rt.fadeAlpha || rt.fadeScale)) this.killTree(em);
  }

  /** Stop(true) fade: F = max(0, F − dt/D[CD8]), CD8 < 1 또는 F ≤ ε 이면 0(D[CCB]/D[CCC] 일 때) [판독 §5.3] */
  private origFade(em: EmitterInst, dt: number): void {
    const rt = em.rt;
    if (rt.fadeAlpha || rt.fadeScale) {
      const ft = em.def.orig?.alphaFadeTime ?? em.def.fade.alphaFadeTime ?? 0;
      em.fadeF = ft < 1 ? 0 : Math.max(0, F(em.fadeF - F(dt / ft)));
      if (em.fadeF <= F32_EPS) em.fadeF = 0;
    }
    for (let k = 0; k < em.children.length; k++) this.origFade(em.children[k], dt);
  }

  private killTree(em: EmitterInst): void {
    this.killEmitter(em);
    for (let k = 0; k < em.children.length; k++) this.killTree(em.children[k]);
  }

  private origAdvance(em: EmitterInst, dt: number): void {
    em.t += dt;
    em.dtLast = dt;
    for (let k = 0; k < em.children.length; k++) this.origAdvance(em.children[k], dt);
  }

  /** 다음 간격 = (interval+1+int32(high32(oldSeed·intervalRandom)))·배율, LCG 1회(073dcec) [판독 §6.1]. 1 미만은 1 [근사: 무한 반복 방지] */
  private nextInterval(em: EmitterInst): number {
    const ir = em.def.emit.intervalRandom ?? 0;
    const old = em.lcg.raw();
    const hi = Math.floor((old * ir) / 4294967296);
    return Math.max(1, em.rt.interval + 1 + (hi | 0));
  }

  /** 방출 한 번(074cb60 → 074f620 → 074fea4·074f880). parentSlot ≥ 0 = 자식(부모 입자 위치) */
  private origEmit(inst: EffectInst, em: EmitterInst, parentPool: ParticlePool | null, parentSlot: number): void {
    const def = em.def;
    const e = def.emit;
    const L = em.lcg;
    const u = L.u();
    let r = F(F(e.rate * F(100 - F(u * e.rateRandom))) / 100);
    if (!em.emitted && r <= 1) r = 1;
    em.emitted = true;
    em.accum = F(em.accum + r);
    let n = Math.floor(em.accum);
    em.accum = F(em.accum - n);
    if (n <= 0) return;
    if (em.rt.transRandEmit) {
      this.emitterTrs(em);
      if (!em.parent) {
        mul4(em.W, inst.M, em.E);
        this.basisOf(em);
      }
    }
    const sh = def.shape;
    const callU = L.u();
    let div = 0;
    if (sh.primEmitType === 0 && (sh.type === 2 || sh.type === 13)) {
      const nd = sh.type === 2 ? sh.numDivideCircle : sh.numDivideLine;
      const ndr = sh.type === 2 ? sh.numDivideCircleRandom : sh.numDivideLineRandom;
      div = nd - Math.trunc(F(F(F(callU * (ndr >>> 0)) * 0.01) * nd));
      n *= div;
    }
    const pool = em.pool;
    const max = em.rt.maxParticles * (em.parent ? Math.max(1, em.parent.rt.maxParticles) : 1);
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (em.live >= max) break;
      const s = pool.takeOrig();
      ARG[7] = callU;
      this.origInit(inst, em, pool, s, i, div, parentPool, parentSlot);
      em.live++;
      made++;
    }
    if (made) this.event('emit', inst, made);
  }

  /** Q 표 다음 값 → V[o..o+2] */
  private nextQ(em: EmitterInst, o: number): void {
    const k = (em.curQ++ & 0x1ff) * 4;
    em.curQ &= 0xffff;
    V[o] = nqQ[k];
    V[o + 1] = nqQ[k + 1];
    V[o + 2] = nqQ[k + 2];
  }

  /** 형상 표본(로컬) → V[0..2] = P, V[3..5] = 형상 속도 방향(vₐ 곱 전) [판독 §6.2 표] */
  private origShape(em: EmitterInst, i: number, div: number): void {
    const callU = ARG[7];
    const sh = em.def.shape;
    const L = em.lcg;
    const rx = F(sh.radius[0] * sh.formScale[0]);
    const ry = F(sh.radius[1] * sh.formScale[1]);
    const rz = F(sh.radius[2] * sh.formScale[2]);
    const start = sh.sweepStartRandom ? F(TWO_PI * callU) : sh.sweepStart;
    const c = sh.caliberRatio ?? 1;
    switch (sh.type) {
      case 0:
        V[0] = V[1] = V[2] = 0;
        this.nextQ(em, 3);
        return;
      case 1:
      case 3:
      case 8:
      case 9: {
        const th = F(start + F(sh.sweepLongitude * F(L.u() - 0.5)));
        const s = Math.sin(th);
        const co = Math.cos(th);
        V[0] = F(rx * s);
        V[1] = 0;
        V[2] = F(rz * co);
        V[3] = s;
        V[4] = 0;
        V[5] = co;
        if (sh.type === 3 || sh.type === 9) {
          const uu = L.u();
          const k = F(1 - c);
          const rho = F(Math.sqrt(F(uu + F(F(1 - uu) * F(k * k)))));
          V[0] = F(V[0] * rho);
          V[2] = F(V[2] * rho);
          const l = Math.sqrt(V[0] * V[0] + V[2] * V[2]);
          if (l > 0) {
            V[3] = F(V[0] / l);
            V[5] = F(V[2] / l);
          } else {
            V[3] = 0;
            V[5] = 1;
          }
        }
        if (sh.type === 8 || sh.type === 9) V[1] = F(ry * F(2 * L.u() - 1));
        return;
      }
      case 2:
      case 13: {
        const nDiv = Math.max(1, div || 1);
        if (sh.type === 13) {
          const len = sh.lineLength;
          const h = nDiv === 1 ? 0.5 : 0;
          const j = i % nDiv;
          const frac = nDiv === 1 ? 0 : j / (nDiv - 1);
          V[0] = V[1] = 0;
          V[2] = F(len * F(h + frac - (1 + sh.lineCenter) / 2));
          V[3] = V[4] = 0;
          V[5] = 1;
          return;
        }
        const full = Math.abs(sh.sweepLongitude - TWO_PI) < 1e-6;
        const den = full ? nDiv : nDiv > 1 ? nDiv - 1 : 1;
        const j = i % nDiv;
        const th = F(F(start - F(sh.sweepLongitude * 0.5)) + F(F(sh.sweepLongitude * j) / den) + F(sh.surfacePosRandom * F(2 * L.u() - 1)));
        const s = Math.sin(th);
        const co = Math.cos(th);
        V[0] = F(rx * s);
        V[1] = 0;
        V[2] = F(rz * co);
        V[3] = s;
        V[4] = 0;
        V[5] = co;
        return;
      }
      case 4:
      case 7: {
        const y = F(2 * L.u() - 1);
        const ph = F(start + F(sh.sweepLongitude * F(L.u() - 0.5)));
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const dx = F(r * Math.sin(ph));
        const dz = F(r * Math.cos(ph));
        V[3] = dx;
        V[4] = y;
        V[5] = dz;
        let rho = 1;
        if (sh.type === 7) rho = F(F(1 - c) + F(c * Math.sqrt(L.u())));
        V[0] = F(F(rx * dx) * rho);
        V[1] = F(F(ry * y) * rho);
        V[2] = F(F(rz * dz) * rho);
        return;
      }
      case 10: {
        const w9 = L.raw();
        const w8 = L.raw();
        const a = F(2 * L.u() - 1);
        const b = F(2 * L.u() - 1);
        const d = F(2 * L.u() - 1);
        const sign = w8 < 0x7fffffff ? 1 : -1;
        if (w9 <= 0x55555554) {
          V[0] = F(rx * a);
          V[1] = F(ry * b);
          V[2] = F(rz * sign);
        } else if (w9 <= 0xaaaaaaa9) {
          V[0] = F(rx * a);
          V[1] = F(ry * sign);
          V[2] = F(rz * d);
        } else {
          V[0] = F(rx * sign);
          V[1] = F(ry * b);
          V[2] = F(rz * d);
        }
        normTo(3);
        return;
      }
      default:
        this.warnOnce(`volumeType ${sh.type} 원본 표본 미구현(점으로): ${em.def.name}`);
        V[0] = V[1] = V[2] = 0;
        this.nextQ(em, 3);
    }
  }

  /** 입자 하나 생성(074fea4·074f880) [판독 §6.2]. 위치·속도는 이미터 로컬, 자식은 부모 입자 위치가 원점 */
  private origInit(inst: EffectInst, em: EmitterInst, pool: ParticlePool, s: number, i: number, div: number, parentPool: ParticlePool | null, parentSlot: number): void {
    const def = em.def;
    const L = em.lcg;
    const vel = def.velocity;
    this.origShape(em, i, div);
    let px = V[0],
      py = V[1],
      pz = V[2];
    const va = vel.allDirection;
    let vx = F(V[3] * va),
      vy = F(V[4] * va),
      vz = F(V[5] * va);
    if (def.emit.positionRandom) {
      const sx = V[0],
        sz = V[2];
      this.nextQ(em, 6);
      px = F(px + F(def.emit.positionRandom * V[6]));
      py = F(py + F(def.emit.positionRandom * V[7]));
      pz = F(pz + F(def.emit.positionRandom * V[8]));
      V[0] = sx;
      V[2] = sz;
    }
    if (vel.xzDiffusion) {
      let dx = V[0],
        dz = V[2];
      if (dx * dx + dz * dz <= 2 ** -23) {
        dx = F(2 * L.u() - 1);
        dz = F(2 * L.u() - 1);
      }
      const l = Math.sqrt(dx * dx + dz * dz);
      if (l > 0) {
        vx = F(vx + F(F(dx / l) * vel.xzDiffusion));
        vz = F(vz + F(F(dz / l) * vel.xzDiffusion));
      }
    }
    let dx = vel.designatedDir[0],
      dy = vel.designatedDir[1],
      dz = vel.designatedDir[2];
    if (vel.diffusionDirAngle !== 0) {
      const A = vel.diffusionDirAngle;
      const phi = F(TWO_PI * L.u());
      const cosT = F(F(1 - A / 90) + F(F(L.u() * A) / 90));
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nl = len || 1;
      quatFromUnitY(dx / nl, dy / nl, dz / nl);
      applyQuat(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi));
      dx = F(V[6] * len);
      dy = F(V[7] * len);
      dz = F(V[8] * len);
    }
    const dd = vel.designatedDirScale;
    vx = F(vx + F(dx * dd));
    vy = F(vy + F(dy * dd));
    vz = F(vz + F(dz * dd));
    const uv = L.u();
    const k0 = F(1 - F(F(uv * vel.velRandom) / 100));
    vx = F(vx * k0);
    vy = F(vy * k0);
    vz = F(vz * k0);
    const nk = (em.curN++ & 0x1ff) * 4;
    em.curN &= 0xffff;
    vx = F(vx + F(nqN[nk] * vel.diffusion[0]));
    vy = F(vy + F(nqN[nk + 1] * vel.diffusion[1]));
    vz = F(vz + F(nqN[nk + 2] * vel.diffusion[2]));
    /* 074f880: 크기 → m → 수명 → U */
    const sc = def.scale;
    const ss = inst.scale;
    if (sc.random[0] === sc.random[1] && sc.random[1] === sc.random[2]) {
      const k = F(1 - F(F(L.u() * sc.random[0]) / 100));
      pool.scl[s * 3] = F(F(sc.base[0] * ss) * k);
      pool.scl[s * 3 + 1] = F(F(sc.base[1] * ss) * k);
      pool.scl[s * 3 + 2] = F(F(sc.base[2] * ss) * k);
    } else for (let j = 0; j < 3; j++) pool.scl[s * 3 + j] = F(F(sc.base[j] * ss) * F(1 - F(F(L.u() * sc.random[j]) / 100)));
    const mr = def.particle.momentumRandom;
    pool.m[s] = F(F(1 + mr) - F(F(2 * L.u()) * mr));
    const pt = def.particle;
    let life: number;
    if (pt.infiniteLife && def.emit.oneTime) life = LIFE_INFINITE;
    else {
      const old = L.raw();
      const k = Math.floor((old * (pt.lifeRandom & 0xff)) / 4294967296);
      life = F(pt.life * F(1 - k * F(0.01)));
      if (Math.trunc(life) <= 0) life = 1;
    }
    for (let j = 0; j < 4; j++) pool.u[s * 4 + j] = L.u();
    const ro = def.rotate;
    for (let j = 0; j < 3; j++) pool.rot0[s * 3 + j] = em.rt.rotOn[j] ? F(ro.init[j]) : 0;
    /* 자식 상속(074f278, 부모 현재 나이 평가) — 속도·크기·회전 [판독 §6.2]. 색·알파 상속은 미구현 */
    if (parentPool && parentSlot >= 0 && this.rules.inherit) {
      const rt = em.rt;
      if (rt.inheritVel) {
        const r = rt.inheritRate[0];
        vx = F(vx + F(r * parentPool.v[parentSlot * 3]));
        vy = F(vy + F(r * parentPool.v[parentSlot * 3 + 1]));
        vz = F(vz + F(r * parentPool.v[parentSlot * 3 + 2]));
      }
      if (rt.inheritScale) for (let j = 0; j < 3; j++) pool.scl[s * 3 + j] = F(rt.inheritRate[1] * parentPool.oScl[parentSlot * 3 + j]);
      if (rt.inheritRot) for (let j = 0; j < 3; j++) pool.rot0[s * 3 + j] = parentPool.oRot[parentSlot * 3 + j];
    }
    pool.owner[s] = em.id;
    pool.birth[s] = em.t;
    pool.life[s] = life;
    pool.death[s] = em.t + life;
    pool.p[s * 3] = px;
    pool.p[s * 3 + 1] = py;
    pool.p[s * 3 + 2] = pz;
    pool.v[s * 3] = vx;
    pool.v[s * 3 + 1] = vy;
    pool.v[s * 3 + 2] = vz;
    pool.childNext[s] = -1;
    /* 생성 때 행렬(3×4): 최상위 = 이미터 월드 W, 자식 = 부모 입자 월드 위치 + 자식 E·SetScale [근사: 자식은 follow 1 처럼] */
    const bm = pool.bm;
    const b = s * 12;
    if (parentPool && parentSlot >= 0) {
      const sc2 = inst.scale;
      const E = em.E;
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) bm[b + c * 3 + r] = F(E[c * 4 + r] * sc2);
      bm[b + 9] = F(parentPool.oPos[parentSlot * 3] + E[12] * sc2);
      bm[b + 10] = F(parentPool.oPos[parentSlot * 3 + 1] + E[13] * sc2);
      bm[b + 11] = F(parentPool.oPos[parentSlot * 3 + 2] + E[14] * sc2);
    } else {
      const w = em.W;
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) bm[b + c * 3 + r] = F(w[c * 4 + r]);
      bm[b + 9] = F(w[12]);
      bm[b + 10] = F(w[13]);
      bm[b + 11] = F(w[14]);
    }
  }

  /** 입자 갱신(074e070 → 0755834, calcType 1 = 해석식(그릴 때)·2 = wave CS) + 자식 방출, 자식 이미터로 내려간다 */
  private origUpdate(inst: EffectInst, em: EmitterInst, dt: number): void {
    const pool = em.pool;
    const rt = em.rt;
    const def = em.def;
    const a = F(def.airRes);
    const g = def.gravity;
    const drag = a === 1 ? 1 : F(Math.pow(a, dt));
    const id = em.id;
    const fields = this.rules.fields;
    const P = pool.p,
      W = pool.v;
    for (let k = 0; k < em.children.length; k++) em.children[k].t = em.t;
    for (let s = 0; s < pool.used; s++) {
      if (pool.owner[s] !== id) continue;
      const age = em.t - pool.birth[s];
      const L = pool.life[s];
      if (age >= L) {
        pool.owner[s] = -1;
        pool.death[s] = -1;
        em.live--;
        continue;
      }
      for (let k = 0; k < em.children.length; k++) {
        ARG[0] = age;
        ARG[1] = L;
        this.origChild(inst, em, em.children[k], pool, s);
      }
      if (rt.calcType === 1) continue;
      const m = pool.m[s];
      const o = s * 3;
      const dm = F(dt * m);
      if (rt.calcType === 2) {
        /* wave CS(§6.3): P′ = P + Δt·m·V, V′ = |a|^Δt·V + Δt·g + N(주기 힘) */
        if (L <= 0 || age > L || age < 0) continue;
        P[o] = F(P[o] + F(dm * W[o]));
        P[o + 1] = F(P[o + 1] + F(dm * W[o + 1]));
        P[o + 2] = F(P[o + 2] + F(dm * W[o + 2]));
        const e = F(Math.pow(2, F(dt * Math.log2(Math.abs(a)))));
        let nx = 0,
          ny = 0,
          nz = 0;
        const f = rt.frn1;
        if (fields && f && f.k !== 0 && Math.trunc(age) % f.k === 0) {
          const ux = pool.u[s * 4],
            uy = pool.u[s * 4 + 1],
            uz = pool.u[s * 4 + 2];
          const kk = 6.283184051513672;
          const t2 = F(age * age);
          nx = F(f.a[0] * Math.sin(F(F(kk * F(uz - 0.5)) + F(uz * t2))));
          ny = F(f.a[1] * Math.sin(F(F(kk * F(ux - 0.5)) + F(uy * t2))));
          nz = F(f.a[2] * Math.sin(F(F(kk * F(uy - 0.5)) + F(ux * t2))));
        }
        W[o] = F(F(F(e * W[o]) + F(dt * g[0])) + nx);
        W[o + 1] = F(F(F(e * W[o + 1]) + F(dt * g[1])) + ny);
        W[o + 2] = F(F(F(e * W[o + 2]) + F(dt * g[2])) + nz);
        continue;
      }
      /* CPU(§6.2): P₁ = P + Δt·m·V(감쇠·중력 전 V) → V·a^Δt → V += Δt·g(m 곱 없음) → 필드 */
      P[o] = F(P[o] + F(dm * W[o]));
      P[o + 1] = F(P[o + 1] + F(dm * W[o + 1]));
      P[o + 2] = F(P[o + 2] + F(dm * W[o + 2]));
      if (drag !== 1) {
        W[o] = F(W[o] * drag);
        W[o + 1] = F(W[o + 1] * drag);
        W[o + 2] = F(W[o + 2] * drag);
      }
      if (rt.gravityOn) {
        W[o] = F(W[o] + F(dt * g[0]));
        W[o + 1] = F(W[o + 1] + F(dt * g[1]));
        W[o + 2] = F(W[o + 2] + F(dt * g[2]));
      }
      if (!fields) continue;
      const sp = rt.fspn;
      if (sp) {
        /* FSPN: θ = Δt·m·angle, ρ = Δt·m·radial — 축 평면 회전 뒤 반경 r 에 1+ρ/r */
        const th = F(dm * sp.angle);
        const rho = F(dm * sp.radial);
        const c = Math.cos(th),
          sn = Math.sin(th);
        const i0 = sp.axis === 0 ? 1 : 0;
        const i1 = sp.axis === 2 ? 1 : 2;
        const x0 = P[o + i0],
          x1 = P[o + i1];
        let y0: number, y1: number;
        if (sp.axis === 1) {
          y0 = F(c * x0 - sn * x1);
          y1 = F(sn * x0 + c * x1);
        } else {
          y0 = F(c * x0 + sn * x1);
          y1 = F(c * x1 - sn * x0);
        }
        const r = Math.sqrt(y0 * y0 + y1 * y1);
        if (r > 0) {
          const kk = F(1 + F(rho / r));
          y0 = F(y0 * kk);
          y1 = F(y1 * kk);
        }
        P[o + i0] = y0;
        P[o + i1] = y1;
      }
      const f1 = rt.frn1;
      if (f1) {
        /* FRN1(CPU): age 의 unsigned 정수가 K 의 배수이면 V += A⊙Nnext(Δt·m 없음) */
        const ai = Math.trunc(age) >>> 0;
        if ((f1.k === 0 && ai === 0) || (f1.k !== 0 && ai % f1.k === 0)) {
          const nk = (em.curN++ & 0x1ff) * 4;
          em.curN &= 0xffff;
          W[o] = F(W[o] + F(f1.a[0] * nqN[nk]));
          W[o + 1] = F(W[o + 1] + F(f1.a[1] * nqN[nk + 1]));
          W[o + 2] = F(W[o + 2] + F(f1.a[2] * nqN[nk + 2]));
        }
      }
    }
    for (let k = 0; k < em.children.length; k++) this.origUpdate(inst, em.children[k], dt);
  }

  /** 자식 방출: 부모 수명 timing(bit17)이면 S = L·timing/100(§6.1), 아니면 이전 웹 ⌊L·timing/100⌋ [근사]. one-time 끝 = S + duration */
  private origChild(inst: EffectInst, parent: EmitterInst, c: EmitterInst, pool: ParticlePool, s: number): void {
    const age = ARG[0];
    const L = ARG[1];
    const e = c.def.emit;
    let next = pool.childNext[s];
    const S = c.rt.parentTiming ? F((L * e.timing) / 100) : Math.floor((L * e.timing) / 100);
    if (next < 0) next = S;
    const end = e.oneTime ? S + Math.max(1, e.duration) : L;
    if (age + 1e-6 < next || age >= end) {
      pool.childNext[s] = next;
      return;
    }
    ARG[0] = age;
    this.origOutputOne(pool, s, parent);
    this.origEmit(inst, c, pool, s);
    pool.childNext[s] = next + c.step;
  }

  /* ================================================================ 그리기 출력 */

  /** 그리기 전에: 모든 풀의 출력 배열·그리기 순서를 지금 시각으로 채운다(할당 0) */
  sync(): void {
    if (this.rules.emission === 'web') {
      for (let k = 0; k < this.pools.length; k++) this.webOutput(this.pools[k]);
      return;
    }
    if (this.rules.sort) this.updateDrawKeys();
    for (let k = 0; k < this.pools.length; k++) this.origOutput(this.pools[k]);
  }

  private webOutput(p: ParticlePool): void {
    const rt = p.rt;
    const def = rt.def;
    const drag = def.airRes;
    const g = def.gravity;
    const regist = def.rotate.regist;
    const fadeIn = this.rules.fadeIn && def.fade.isAlphaFadeIn ? def.fade.fadeInTime : 0;
    let n = 0;
    for (let s = 0; s < p.used; s++) {
      if (p.owner[s] < 0) continue;
      const age = this.clock - p.birth[s];
      const life = p.life[s];
      if (age < 0 || age >= life) continue;
      p.order[n++] = s;
      const o = s * 3;
      const r = age / life;
      if (Math.abs(1 - drag) < 1e-5) {
        const k = age * (age + 1) * 0.5;
        p.oPos[o] = p.p[o] + p.v[o] * age + g[0] * k;
        p.oPos[o + 1] = p.p[o + 1] + p.v[o + 1] * age + g[1] * k;
        p.oPos[o + 2] = p.p[o + 2] + p.v[o + 2] * age + g[2] * k;
      } else {
        const sd = (drag * (1 - Math.pow(drag, age))) / (1 - drag);
        const k = age - sd;
        p.oPos[o] = p.p[o] + p.v[o] * sd + (g[0] / (1 - drag)) * k;
        p.oPos[o + 1] = p.p[o + 1] + p.v[o + 1] * sd + (g[1] / (1 - drag)) * k;
        p.oPos[o + 2] = p.p[o + 2] + p.v[o + 2] * sd + (g[2] / (1 - drag)) * k;
      }
      const rf = Math.abs(1 - regist) < 1e-5 ? age : (1 - Math.pow(regist, age)) / (1 - regist);
      p.oRot[o] = p.rot0[o] + p.rotV[o] * rf;
      p.oRot[o + 1] = p.rot0[o + 1] + p.rotV[o + 1] * rf;
      p.oRot[o + 2] = p.rot0[o + 2] + p.rotV[o + 2] * rf;
      keyAtWeb(rt.sk, r, OUT, 0);
      p.oScl[o] = p.scl[o] * OUT[0];
      p.oScl[o + 1] = p.scl[o + 1] * OUT[1];
      p.oScl[o + 2] = p.scl[o + 2] * OUT[2];
      const fade = fadeIn > 0 ? Math.min(Math.max((p.u[s * 4 + 2] + age) / fadeIn, 0), 1) : 1;
      keyAtWeb(rt.c0, r, OUT, 0);
      keyAtWeb(rt.a0, r, OUT, 4);
      keyAtWeb(rt.c1, r, OUT, 8);
      keyAtWeb(rt.a1, r, OUT, 12);
      const c = s * 4;
      p.oC0[c] = OUT[0];
      p.oC0[c + 1] = OUT[1];
      p.oC0[c + 2] = OUT[2];
      p.oC0[c + 3] = OUT[4] * fade;
      p.oC1[c] = OUT[8];
      p.oC1[c + 1] = OUT[9];
      p.oC1[c + 2] = OUT[10];
      p.oC1[c + 3] = OUT[12];
      p.oMisc[c] = age;
      p.oMisc[c + 1] = life;
      p.oMisc[c + 2] = p.u[c];
      p.oMisc[c + 3] = p.u[c + 1];
      p.oFade[s] = 1;
      identBasis(p.oBasis, s);
    }
    p.count = n;
  }

  /** 원본 키 위상 → ARG[2]: 루프 주기 P > 0 이면 fmod(age + P·Uₓ·랜덤위상, P)/P, 아니면 age/L [판독 §6.2·§6.3]. 입력 ARG[3..5] = age·L·Uₓ */
  private phase(rt: EmitterRt, ch: number): void {
    const P = rt.loopPeriod[ch];
    const age = ARG[3];
    if (P > 0) ARG[2] = F(F((age + F(F(P * ARG[5]) * rt.loopRandom[ch])) % P) / P);
    else ARG[2] = F(age / ARG[4]);
  }

  /** 원본 출력 하나(월드 위치·기저·크기·회전·색). age = 그리기 나이 */
  private origOutputOne(p: ParticlePool, s: number, em: EmitterInst): void {
    const age = ARG[0];
    const rt = p.rt;
    const def = rt.def;
    const o = s * 3;
    const c4 = s * 4;
    const L = p.life[s];
    const U = p.u;
    const ux = U[c4],
      uy = U[c4 + 1],
      uz = U[c4 + 2],
      uw = U[c4 + 3];
    const m = p.m[s];
    /* 위치(로컬): calcType 1 = p₀ + m(v₀F(T) + gG(T)), T = t + τ(τ = dt) [판독 §6.3] */
    let lx = p.p[o],
      ly = p.p[o + 1],
      lz = p.p[o + 2];
    if (rt.calcType === 1) {
      const a = F(def.airRes);
      const T = F(age + em.dtLast);
      let Fv: number, Gv: number;
      if (a === 1) {
        Fv = T;
        Gv = F(F(T * T) / 2);
      } else {
        const E = F(Math.pow(2, F(T * Math.log2(Math.abs(a)))));
        Fv = F(F(1 - E) / F(1 - a));
        Gv = F(F(T - F(F(F(E - 1) * 1.4426950216293335) / Math.log2(a))) / F(1 - a));
      }
      const g = def.gravity;
      lx = F(lx + F(m * F(F(p.v[o] * Fv) + F(g[0] * Gv))));
      ly = F(ly + F(m * F(F(p.v[o + 1] * Fv) + F(g[1] * Gv))));
      lz = F(lz + F(m * F(F(p.v[o + 2] * Fv) + F(g[2] * Gv))));
    }
    /* 월드: follow 0 = 현재 이미터 W, 1 = 생성 때 행렬, 2 = 생성 때 기저 + 현재 이동 [판독 §5.3]. 자식 = 생성 때 행렬 */
    const bm = p.bm;
    const b = s * 12;
    const child = em.parent !== null;
    const follow = child || !this.rules.follow ? 1 : rt.follow;
    const B = p.oBasis;
    const k9 = s * 9;
    if (follow === 0) {
      const w = em.W;
      p.oPos[o] = F(w[0] * lx + w[4] * ly + w[8] * lz + w[12]);
      p.oPos[o + 1] = F(w[1] * lx + w[5] * ly + w[9] * lz + w[13]);
      p.oPos[o + 2] = F(w[2] * lx + w[6] * ly + w[10] * lz + w[14]);
      for (let j = 0; j < 9; j++) B[k9 + j] = em.basis[j];
    } else {
      const tx = follow === 2 ? em.W[12] : bm[b + 9];
      const ty = follow === 2 ? em.W[13] : bm[b + 10];
      const tz = follow === 2 ? em.W[14] : bm[b + 11];
      p.oPos[o] = F(bm[b] * lx + bm[b + 3] * ly + bm[b + 6] * lz + tx);
      p.oPos[o + 1] = F(bm[b + 1] * lx + bm[b + 4] * ly + bm[b + 7] * lz + ty);
      p.oPos[o + 2] = F(bm[b + 2] * lx + bm[b + 5] * ly + bm[b + 8] * lz + tz);
      for (let j = 0; j < 3; j++) {
        const x = bm[b + j * 3],
          y = bm[b + j * 3 + 1],
          z = bm[b + j * 3 + 2];
        const l = Math.sqrt(x * x + y * y + z * z);
        const r = l > 0 ? 1 / l : 0;
        B[k9 + j * 3] = F(x * r);
        B[k9 + j * 3 + 1] = F(y * r);
        B[k9 + j * 3 + 2] = F(z * r);
      }
    }
    /* 크기: scale₀ ⊙ key, scale 흔들림(FC5) X/Y(FC6 = Y 별도) */
    ARG[3] = age;
    ARG[4] = L;
    ARG[5] = ux;
    this.phase(rt, 4);
    keyAtOrigA(rt.osk, OUT, 0);
    let fx = 1,
      fy = 1;
    const fl = rt.fluct;
    const keysOrig = this.rules.keys === 'original';
    if (keysOrig && (fl.scale || fl.alpha)) fluInto(fl, 0);
    if (keysOrig && fl.scale) {
      fx = ARG[6];
      if (fl.scaleY) {
        fluInto(fl, 1);
        fy = ARG[6];
        fluInto(fl, 0);
      } else fy = fx;
    }
    const fadeS = rt.fadeScale ? em.fadeF : 1;
    p.oScl[o] = F(F(F(p.scl[o] * OUT[0]) * fx) * fadeS);
    p.oScl[o + 1] = F(F(F(p.scl[o + 1] * OUT[1]) * fy) * fadeS);
    p.oScl[o + 2] = F(F(p.scl[o + 2] * OUT[2]) * fadeS);
    /* 회전: CPU 07571ec / GPU 대표(§6.2·§6.5) — θ = σ⊙(θ₀ + H·ω) + (U − 0.5)⊙initRand */
    const ro = def.rotate;
    const q = ro.regist;
    const gpu = rt.calcType !== 0;
    let H: number;
    if (q === 1) H = age;
    else if (q === 0) H = 0;
    else H = F(F(1 - F(Math.pow(gpu ? Math.abs(q) : q, age))) / F(1 - q));
    for (let j = 0; j < 3; j++) {
      if (!rt.rotOn[j]) {
        p.oRot[o + j] = 0;
        continue;
      }
      const ua = j === 2 ? ux : j === 0 ? ux : uy;
      const ub = j === 0 ? uy : uz;
      const w = gpu ? F(ro.add[j] + F(F(F(ua + ub) - 1) * ro.addRand[j])) : F(ro.add[j] + F(ro.addRand[j] * F(F(ua + ub) / 2)));
      const sel = j === 0 ? uz : j === 1 ? ux : uy;
      const sg = rt.revOn[j] && sel >= 0.5 ? -1 : 1;
      const uj = j === 0 ? ux : j === 1 ? uy : uz;
      p.oRot[o + j] = F(F(sg * F(p.rot0[o + j] + F(H * w))) + F(F(uj - 0.5) * ro.initRand[j]));
    }
    /* 색·알파: 키 × 이미터 색, color type 3 = uint32(Uₓ·keyCount) 번째 키, alpha 흔들림(FC4)은 [0,1] */
    const cc = def.color;
    const ec0 = def.emitterColor0,
      ec1 = def.emitterColor1;
    if (keysOrig && cc.color0Type === 3 && cc.color0Keys.length) pickKey(rt.oc0, cc.color0Keys.length, OUT, 0);
    else {
      this.phase(rt, 0);
      keyAtOrigA(rt.oc0, OUT, 0);
    }
    this.phase(rt, 1);
    keyAtOrigA(rt.oa0, OUT, 4);
    if (keysOrig && cc.color1Type === 3 && cc.color1Keys.length) pickKey(rt.oc1, cc.color1Keys.length, OUT, 8);
    else {
      this.phase(rt, 2);
      keyAtOrigA(rt.oc1, OUT, 8);
    }
    this.phase(rt, 3);
    keyAtOrigA(rt.oa1, OUT, 12);
    let a0 = F(OUT[4] * ec0[3]);
    if (keysOrig && fl.alpha) a0 = Math.min(1, Math.max(0, F(a0 * ARG[6])));
    p.oC0[c4] = F(OUT[0] * ec0[0]);
    p.oC0[c4 + 1] = F(OUT[1] * ec0[1]);
    p.oC0[c4 + 2] = F(OUT[2] * ec0[2]);
    p.oC0[c4 + 3] = a0;
    p.oC1[c4] = F(OUT[8] * ec1[0]);
    p.oC1[c4 + 1] = F(OUT[9] * ec1[1]);
    p.oC1[c4 + 2] = F(OUT[10] * ec1[2]);
    p.oC1[c4 + 3] = F(OUT[12] * ec1[3]);
    p.oMisc[c4] = age;
    p.oMisc[c4 + 1] = L;
    p.oMisc[c4 + 2] = uw;
    p.oMisc[c4 + 3] = uz;
    p.oFade[s] = rt.fadeAlpha ? em.fadeF : 1;
  }

  private origOutput(p: ParticlePool): void {
    let n = 0;
    for (let s = 0; s < p.used; s++) {
      const id = p.owner[s];
      if (id < 0) continue;
      const em = this.emById[id]!;
      ARG[0] = em.t - em.dtLast - p.birth[s];
      this.origOutputOne(p, s, em);
      p.order[n++] = s;
    }
    p.count = n;
    if (!this.rules.sort || n < 2) return;
    /* 이미터셋 key 내림차순(같으면 생성 순서)으로 묶고, 묶음 안은 sortType [판독 §6.5·§6.7] */
    for (let k = 0; k < n; k++) {
      const s = p.order[k];
      const inst = this.emById[p.owner[s]]!.inst;
      p.oKey[s] = inst.drawKey * 1048576 + (1048575 - (inst.seq & 0xfffff));
    }
    p.sortRange(0, n, true, false);
    const st = p.rt.sortType;
    if (st !== 1 && st !== 2 && st !== 3) return;
    const v = this.view;
    const depthWrite = !!p.rt.def.render.isDepthMask;
    let a = 0;
    while (a < n) {
      const key0 = p.oKey[p.order[a]];
      let b = a + 1;
      while (b < n && p.oKey[p.order[b]] === key0) b++;
      for (let k = a; k < b; k++) {
        const s = p.order[k];
        p.oKey[s] = st === 2 ? v[2] * p.oPos[s * 3] + v[6] * p.oPos[s * 3 + 1] + v[10] * p.oPos[s * 3 + 2] + v[14] : p.birth[s];
      }
      if (st === 1) p.sortRange(a, b, true, false);
      else if (st === 3) p.sortRange(a, b, false, false);
      else p.sortRange(a, b, !depthWrite, true);
      for (let k = a; k < b; k++) p.oKey[p.order[k]] = key0;
      a = b;
    }
  }

  /** 이미터셋 정렬 key(§6.7): 상위 8비트 priority, 하위 24비트 = min(0, 카메라 깊이)의 f32 압축 — unsigned 내림차순 */
  updateDrawKeys(): void {
    const v = this.view;
    for (let k = 0; k < this.active.length; k++) {
      const i = this.active[k];
      const z = v[2] * i.M[12] + v[6] * i.M[13] + v[10] * i.M[14] + v[14];
      packF[0] = Math.min(0, z);
      i.drawKey = (((i.priority & 0xff) << 24) >>> 0) + packDepthBits();
    }
  }

  /** 디버그·시험: 이펙트 하나의 이미터 상태(이름·시각·살아 있는 입자·월드 행렬·방출 끝) */
  emitters(h: number): { id: number; name: string; t: number; live: number; done: boolean; W: Float64Array; pool: ParticlePool }[] {
    const i = this.get(h);
    return i ? i.all.map((em) => ({ id: em.id, name: em.def.name, t: em.t, live: this.liveOf(em), done: em.done, W: em.W, pool: em.pool })) : [];
  }

  /** 디버그·보기: 이펙트 목록 */
  list(): { handle: number; name: string; started: boolean; alive: boolean; particles: number }[] {
    return this.active.map((i) => ({ handle: i.handle, name: i.name, started: i.started, alive: this.isAlive(i), particles: i.all.reduce((s, em) => s + this.liveOf(em), 0) }));
  }

  private liveOf(em: EmitterInst): number {
    if (this.rules.emission === 'original') return em.live;
    const p = em.pool;
    let n = 0;
    for (let s = 0; s < p.used; s++) if (p.owner[s] === em.id && this.clock - p.birth[s] < p.life[s] && this.clock >= p.birth[s]) n++;
    return n;
  }

  /** 모든 이펙트를 버린다 */
  clear(): void {
    while (this.active.length) this.free(this.active[this.active.length - 1]);
  }
}

/* ================================================================ 보조 */

/** 이전 웹 입자 초기화 결과 칸 */
const Q = new Float64Array(18);
const Q2 = new Float64Array(3);

function setP(x: number, y: number, z: number): void {
  Q[0] = x;
  Q[1] = y;
  Q[2] = z;
}
function setN(x: number, y: number, z: number): void {
  V[0] = x;
  V[1] = y;
  V[2] = z;
}
/** V[0..2] 정규화 → V[o..o+2](0 이면 0) */
function normTo(o: number): void {
  const x = V[0],
    y = V[1],
    z = V[2];
  const l = Math.sqrt(x * x + y * y + z * z);
  const r = l > 0 ? 1 / l : 0;
  V[o] = F(x * r);
  V[o + 1] = F(y * r);
  V[o + 2] = F(z * r);
}
function identBasis(B: Float32Array, s: number): void {
  const k = s * 9;
  B[k] = 1;
  B[k + 1] = 0;
  B[k + 2] = 0;
  B[k + 3] = 0;
  B[k + 4] = 1;
  B[k + 5] = 0;
  B[k + 6] = 0;
  B[k + 7] = 0;
  B[k + 8] = 1;
}

/** Quaternion.setFromUnitVectors((0,1,0), t) → V[9..12] */
function quatFromUnitY(tx: number, ty: number, tz: number): void {
  let r = 0 * tx + 1 * ty + 0 * tz + 1;
  let x: number, y: number, z: number;
  if (r < 1e-8) {
    r = 0;
    x = 0;
    y = -0;
    z = 1;
  } else {
    x = 1 * tz - 0 * ty;
    y = 0 * tx - 0 * tz;
    z = 0 * ty - 1 * tx;
  }
  let l = Math.sqrt(x * x + y * y + z * z + r * r);
  if (l === 0) {
    V[9] = 0;
    V[10] = 0;
    V[11] = 0;
    V[12] = 1;
    return;
  }
  l = 1 / l;
  V[9] = x * l;
  V[10] = y * l;
  V[11] = z * l;
  V[12] = r * l;
}

/** Vector3.applyQuaternion(V[9..12]) → V[6..8] */
function applyQuat(vx: number, vy: number, vz: number): void {
  const qx = V[9],
    qy = V[10],
    qz = V[11],
    qw = V[12];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  V[6] = vx + qw * tx + qy * tz - qz * ty;
  V[7] = vy + qw * ty + qz * tx - qx * tz;
  V[8] = vz + qw * tz + qx * ty - qy * tx;
}

/** 흔들림 mode0 → ARG[6]: 1 − A·(cos(2πτ)+1)/2, τ = (phase + age)/period + U·randomPhase [판독 §6.2 0755ccc]. 파형 선택 비트(FC7) 미연결 → cos [근사] */
function fluInto(fl: EmitterRt['fluct'], j: number): void {
  const age = ARG[3];
  const u = ARG[5];
  const period = fl.cycle[j];
  if (period === 0) {
    ARG[6] = 1;
    return;
  }
  const tau = F(F(F(fl.phase[j] + age) / period) + F(u * fl.rnd[j]));
  ARG[6] = F(1 - F(F(fl.amp[j] * F(Math.cos(F(TWO_PI * tau)) + 1)) / 2));
}


/** color type 3: uint32(Uₓ·keyCount) 번째 키(Uₓ = ARG[5]) */
function pickKey(t: KeyTab, n: number, out: Float64Array, o: number): void {
  const i = Math.min(n - 1, Math.floor(ARG[5] * n) >>> 0);
  out[o] = t.v[i * 4];
  out[o + 1] = t.v[i * 4 + 1];
  out[o + 2] = t.v[i * 4 + 2];
}

const packF = new Float32Array(1);
const packU = new Uint32Array(packF.buffer);
/** key 하위 24비트: sign = bits>>8 & 0x800000, e = (bits>>23 & 0xFF) − 0x40(0 이면 0), e<0 → sign, e≥0x80 → 0x7F0000 [판독 §6.7] */
export function packDepth(x: number): number {
  packF[0] = x;
  return packDepthBits();
}
function packDepthBits(): number {
  const x = packF[0];
  const bits = packU[0];
  const sign = (bits >>> 8) & 0x800000;
  if (x === 0) return sign;
  const e = ((bits >>> 23) & 0xff) - 0x40;
  if (e < 0) return sign;
  if (e >= 0x80) return 0x7f0000;
  return (((bits >>> 7) & 0xffff) | ((e & 0x7f) << 16) | sign) >>> 0;
}
