/**
 * 캐릭터 런타임 공용 코어 — import 0(외부 라이브러리·three·프로젝트 파일·DOM 없음). 설계·원본 계약: docs/engine/09_character.md §14(웹 런타임 계약),
 * 모션 이벤트(FX 트리거)는 docs/engine/05_ui_input.md §7.
 *
 * 원본 클래스 단위를 그대로 옮긴다(숫자·사건만 낸다, 그리기 없음):
 * - MotionSlot   = actor::ActorAnimationSlot + nn::bezel::AnimationSlot 재생 상태 — Play 같은 모션 판정(§6.3), 시작 리스너 속도·시작 프레임·블렌드(§6.4),
 *                  mpat 우선순위 a/b·α/β(§6.5), 프레임 진행 dt×60×slotSpeed·FrameMax·큐(§6.6), 본·shape 전이 시간 clamp(§4.2).
 * - HeadLook     = bex::ComHeading 머리 시선(§6.8): 대상 최단 회전 → 가중치 slerp → YZX 분해·한계 → ZYX 재구성 → 모드 4 따라가기, 뒤쪽 40°/60° 분기·턱·목은 원본 스위치.
 * - EyeLook      = ComHeading 눈 UV(§6.8 FUN_71001c5a58): 대상 각 → t_offset/scale/rot/min/max → 0.6 따라가기·섞임비.
 * - FtrgBank·FtrgCursor = ComFxTrigger(05 §7.5): 슬롯별 최초 평가·정/역방향·루프 횟수, 소스 참조(ref)·키 행 선택·가중 자원 → SE·보이스·진동·이펙트 사건.
 * - CharacterCore = ComMatter 한 명: 주 슬롯 + 시선 + 눈 + 이벤트 + 표정·보조 물리 자리(차단 항목은 상태만 둔다).
 *
 * 시간은 주입한다(step(dt), 고정 1/60). step·평가는 할당 0(사건 객체는 미리 만든 고리 버퍼를 다시 쓴다).
 * three 의 Quaternion·Euler 식을 같은 연산 순서로 옮겨(slerp·setFromEuler·setFromRotationMatrix·rotateTowards·normalize) 기존 웹 결과와 비트까지 같게 한다.
 * 다른 게임(ddalkkakrider 등)에 이 파일 하나를 그대로 복사해 쓸 수 있다.
 */

/** 프레임 시간 표 DAT_71015d4678[0] = 1/60 [데이터] */
export const STEP_SEC = 1 / 60;
export const FLT_MAX = 3.4028234663852886e38;
/** MotionArg.blendTime 기본값 −FLT_MAX(0xFF7FFFFF) — 노드가 있으면 리스너가 기본 블렌드로 바꾼다 */
export const BLEND_DEFAULT = -FLT_MAX;
/** 리스너 기본 블렌드 0x3DCCCCCD(f32 0.1) [판독 FUN_7100022f20] */
export const BLEND_LISTENER_F32 = Math.fround(0.1);
/** AnimationTransitionType: 1 = 기본(이전 포즈 전이), 4 = 크로스페이드 [판독 FUN_7100813940] */
export const TRANSITION_DEFAULT = 1;
export const TRANSITION_CROSSFADE = 4;
/** AnimationSlot::GetPlaybackState [판독 @0x71008135f4] */
export const STATE_NONE = 0;
export const STATE_PLAYING = 1;
export const STATE_PAUSED = 2;
export const STATE_FINISHED = 3;

const f32 = Math.fround;
const F32_EPS = 1.1920929e-7;

/** FNV-1a 64(UTF-8 바이트) — StringViewHashPair 해시 [판독+데이터 §6.1]. '0x' + 16자리 */
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n;
  const b = new TextEncoder().encode(s);
  for (let i = 0; i < b.length; i++) h = ((h ^ BigInt(b[i])) * 0x100000001b3n) & 0xffffffffffffffffn;
  return `0x${h.toString(16).padStart(16, '0')}`;
}

/* ================================================================ 모션 */

/** 모션 하나의 재생 정보(motions.json 항목의 부분집합) */
export interface MotionInfo {
  /** FSKA FrameCount = FrameMax */
  frames: number;
  /** FSKA flags bit2 */
  loop: boolean;
  /** user data "blink" 묶음 자식 모션 이름(fcl_blink00) */
  blinkName?: string;
  /** 모션 user data headLookWeight(0 이상이면 ComHeading 가중치 대신) */
  headLookWeight?: number;
  /** 모션 user data shift / shift_rec(이전 shift → 새 shift_rec 이면 블렌드 0) */
  shift?: boolean;
  shiftRec?: boolean;
}

/** actor::MotionArg (0x50 B) [판독 §4.3] */
export interface MotionArg {
  name: string;
  /** +0x38: 0 이면 지금 모션과 이름(해시)이 같을 때 요청을 버린다 */
  forceRestart: boolean;
  /** +0x39: 시작 프레임 = 난수(0..FrameMax) */
  randomStartFrame: boolean;
  /** +0x3A: 슬롯 속도 = speed */
  speedValid: boolean;
  /** +0x3C: 비루프 모션에서 넘어올 때의 시작 프레임 */
  startFrame: number;
  /** +0x40 */
  speed: number;
  /** +0x44 전이 시간(초). BLEND_DEFAULT = 기본 */
  blendTime: number;
  /** +0x48 */
  transitionType: number;
}

/** Play(name) 기본값: forceRestart 0, speedValid 1·speed 1, blend −FLT_MAX, type 1 [판독 @0x71000237f8] */
export function motionArg(name: string, o?: Partial<MotionArg>): MotionArg {
  const a: MotionArg = { name, forceRestart: false, randomStartFrame: false, speedValid: true, startFrame: 0, speed: 1, blendTime: BLEND_DEFAULT, transitionType: TRANSITION_DEFAULT };
  return o ? Object.assign(a, o) : a;
}

function copyArg(to: MotionArg, from: MotionArg): void {
  to.name = from.name;
  to.forceRestart = from.forceRestart;
  to.randomStartFrame = from.randomStartFrame;
  to.speedValid = from.speedValid;
  to.startFrame = from.startFrame;
  to.speed = from.speed;
  to.blendTime = from.blendTime;
  to.transitionType = from.transitionType;
}

/** mpat 한 행(06 §2.5 포맷, 09 §6.5 소비): a = 블렌드 프레임(≥0 이면 a/60 초), b = type(−1 유지), α·β = 시작 프레임 식 */
export interface MpatRow {
  from: string | null;
  to: string | null;
  a: number;
  b: number;
  alpha: number;
  beta: number;
}

/** assets/chara/mpat.json 한 표([from, to, a, b, α, β][]) → 행 */
export function mpatRows(t: readonly (readonly [string | null, string | null, number, number, number, number])[]): MpatRow[] {
  return t.map(([from, to, a, b, alpha, beta]) => ({ from, to, a, b, alpha, beta }));
}

/**
 * 원본 조회 [판독 FUN_7100105ea0 → FUN_7100106640]: 등록 순서(장면/캐릭터 → 장면/공통 → sys/캐릭터 → sys/공통)의 표마다 앞 행부터 첫 일치.
 * from 이 비면 아무 모션과 맞는다고 본다 [추정: sys_pc 의 빈 from 행], to 는 이름이 같아야 한다(빈 to 행은 맞지 않음) [추정].
 */
export function mpatFind(tables: readonly (readonly MpatRow[])[], from: string, to: string): MpatRow | null {
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    for (let j = 0; j < t.length; j++) {
      const r = t[j];
      if (r.to === to && (r.from === null || r.from === from)) return r;
    }
  }
  return null;
}

/** 웹 이전 광장 규칙(transitBlend): from→to 먼저, 없으면 (빈 from)→to. 결과 = a 프레임 → 초, 없으면 undefined(MotionArg 기본) */
export function mpatBlendCompat(table: readonly { from: string | null; to: string; a: number }[], from: string, to: string): number | undefined {
  const t = table.find((x) => x.from === from && x.to === to) ?? table.find((x) => x.from === null && x.to === to);
  return t ? t.a / 60 : undefined;
}

/** 슬롯 규칙: 기존 웹 결과 유지(RULES_WEB)와 원본(RULES_ORIGINAL) — 차이는 09 §14.7·§14.9 */
export interface MotionRules {
  /** 리스너 기본 블렌드(초): 원본 f32(0.1), 웹 이전 0.1(double) */
  blendDefault: number;
  /** mpat 일치 행의 a/b 로 블렌드·type 덮기 */
  mpatBlend: boolean;
  /** mpat 일치 행의 α/β 로 시작 프레임 다시 정하기(이전 노드 없음·α=β=0 이면 0) */
  mpatStart: boolean;
  /** bezel 슬롯 blend mode(+0x54): 0 기본, 2 면 type 1 → 4 */
  blendMode: number;
  /**
   * 전이 포즈: 'mixer' = 웹 이전(three fadeIn/fadeOut — 이전 노드도 진행, 모든 뼈 같은 가중치),
   * 'original' = type 1 이전 포즈 고정 + 본/shape 별 시간 clamp(bex_no_transit_bone·bex_limit_transit_*), type 4 크로스페이드(이전 노드 진행)
   */
  transit: 'mixer' | 'original';
  /** 프레임을 f32 로 누적(원본). 웹 이전도 정수 진행이라 같은 값이다 */
  f32: boolean;
  /** 화면 칸 재생(Preview3D.play)이 같은 모션도 다시 시작(웹 이전) — 원본 Play(name) 는 forceRestart 0(§4.3) */
  playForce: boolean;
}

export const RULES_WEB: Readonly<MotionRules> = { blendDefault: 0.1, mpatBlend: false, mpatStart: false, blendMode: 0, transit: 'mixer', f32: true, playForce: true };
export const RULES_ORIGINAL: Readonly<MotionRules> = { blendDefault: BLEND_LISTENER_F32, mpatBlend: true, mpatStart: true, blendMode: 0, transit: 'original', f32: true, playForce: false };

export interface MotionSlotDeps {
  /** 모션 정보(없으면 루프·FrameMax 0 으로 본다 — 웹 이전 규칙) */
  info(name: string): MotionInfo | undefined;
  /** 시작 프레임 난수 0..n−1(원본 RandModule, 오프라인 = 비동기 계열) */
  rand(n: number): number;
  /** idle 난수 맵(AddAnimation registerIdle) — 기본: 이름에 "_idle" 이 든 모션 */
  idleRandom?(name: string): boolean;
  /** 전이표(등록 순서) */
  mpat?: readonly (readonly MpatRow[])[];
}

/**
 * 모션 슬롯 하나. frame = 클립 프레임(루프면 감김·비루프면 0..FrameMax), bundleFrame = 시작 프레임 + 진행 누적(감지 않음 —
 * AnimationNodeBundle 자식(깜빡임)과 웹 이전 Preview3D 의 노드 프레임). 새 노드가 시작되면 startSeq 가 1 늘고 startBlend·startFrame 이 그 값이다.
 */
export class MotionSlot {
  name = '';
  info: MotionInfo | null = null;
  frame = 0;
  bundleFrame = 0;
  /** +0x140 / +0x144 / ModelModule 애니 속도 */
  speed = 1;
  conditionSpeed = 1;
  modelSpeed = 1;
  paused = false;
  /** 새 노드 시작 횟수(어댑터가 바뀜을 본다) */
  startSeq = 0;
  startBlend = 0;
  startFrame = 0;
  startType = TRANSITION_DEFAULT;
  /** 전이: 이전 노드(이름·정보·프레임)와 시간(초). transitType 0 = 전이 없음 */
  prevName = '';
  prevInfo: MotionInfo | null = null;
  prevFrame = 0;
  transitType = 0;
  transitDuration = 0;
  transitElapsed = 0;
  /** 큐(EnqueuePlay) */
  readonly queued: MotionArg = motionArg('');
  hasQueue = false;
  /** 이 슬롯의 FTRG 문맥(슬롯마다 독립, 05 §7.5) */
  readonly ev = new FtrgCursor();
  private readonly tmp: MotionArg = motionArg('');

  constructor(
    readonly rules: Readonly<MotionRules>,
    private readonly deps: MotionSlotDeps,
  ) {}

  get state(): number {
    if (!this.name) return STATE_NONE;
    if (this.paused) return STATE_PAUSED;
    return this.isFinished() ? STATE_FINISHED : STATE_PLAYING;
  }

  get frameMax(): number {
    return this.info ? this.info.frames : 0;
  }

  get loop(): boolean {
    return this.info ? this.info.loop : true;
  }

  get queuedName(): string | null {
    return this.hasQueue ? this.queued.name : null;
  }

  /** 비루프 && (속도 ≥ 0 ? frame ≥ FrameMax : frame ≤ 0) [판독 @0x71008135f4] */
  isFinished(): boolean {
    if (!this.name || this.loop) return false;
    const s = this.speed * this.conditionSpeed;
    return s >= 0 ? this.frame >= this.frameMax : this.frame <= 0;
  }

  /** ComActorMotion::Play → ActorAnimationSlot::Play → FUN_7100022a80 → 리스너 → mpat → 노드 교체. 받아들이면 true */
  play(arg: MotionArg): boolean {
    if (arg.name.length === 0) return false;
    if (!arg.forceRestart && this.name !== '' && this.name === arg.name) return false;
    const info = this.deps.info(arg.name) ?? null;
    const hasNode = this.name !== '';
    const loopPrev = hasNode ? this.loop : true;
    let blend = arg.blendTime;
    let type = arg.transitionType;
    if (hasNode) {
      if (blend === BLEND_DEFAULT) blend = this.rules.blendDefault;
      if (this.info?.shift && info?.shiftRec) blend = 0;
    } else blend = 0;
    if (arg.speedValid) this.speed = arg.speed;
    const fm = info ? info.frames : 0;
    const idle = this.deps.idleRandom ? this.deps.idleRandom(arg.name) : arg.name.includes('_idle');
    let f: number;
    if (arg.randomStartFrame) f = fm >= 1 ? this.deps.rand(Math.floor(fm)) : 0;
    else if (loopPrev) f = idle && fm >= 1 ? this.deps.rand(Math.floor(fm)) : 0;
    else f = arg.startFrame;
    const row = hasNode && this.deps.mpat && (this.rules.mpatBlend || this.rules.mpatStart) ? mpatFind(this.deps.mpat, this.name, arg.name) : null;
    if (row && this.rules.mpatBlend && type !== 0) {
      if (row.a >= 0) blend = f32(row.a / 60);
      if (row.b !== -1) type = row.b;
    }
    if (type === TRANSITION_DEFAULT && this.rules.blendMode === 2) type = TRANSITION_CROSSFADE;
    if (row && this.rules.mpatStart) {
      const oldMax = this.frameMax;
      f = row.alpha === 0 && row.beta === 0 ? 0 : f32(fm * f32(row.alpha * (oldMax > 0 ? f32(this.frame / oldMax) : 0) + row.beta));
    }
    this.prevName = this.name;
    this.prevInfo = this.info;
    this.prevFrame = this.frame;
    this.transitType = hasNode && blend > 0 && type !== 0 ? type : 0;
    this.transitDuration = this.transitType ? blend : 0;
    this.transitElapsed = 0;
    this.name = arg.name;
    this.info = info;
    this.frame = f;
    this.bundleFrame = f;
    this.hasQueue = false;
    this.startSeq++;
    this.startBlend = blend;
    this.startFrame = f;
    this.startType = type;
    this.ev.reset(f);
    return true;
  }

  /** EnqueuePlay: 지금 모션이 끝나면 재생 */
  enqueue(arg: MotionArg): void {
    copyArg(this.queued, arg);
    this.hasQueue = true;
  }

  /** 같은 노드 SetFrame — FTRG 문맥은 보존한다(05 §7.8) */
  setFrame(f: number): void {
    this.frame = f;
    this.bundleFrame = f;
  }

  /** ActorAnimationSlot::SetSpeed — 같은 값이면 무시 */
  setSpeed(s: number): void {
    if (this.speed !== s) this.speed = s;
  }

  /** 지운다(노드 없음) */
  clear(): void {
    this.name = '';
    this.info = null;
    this.frame = this.bundleFrame = 0;
    this.prevName = '';
    this.prevInfo = null;
    this.transitType = 0;
    this.transitDuration = this.transitElapsed = 0;
    this.hasQueue = false;
    this.startSeq++;
  }

  /**
   * dt 초 진행 [판독 §6.6]: deltaFrames = f32(dt·60), clipDelta = f32(f32(deltaFrames·slotSpeed)·modelSpeed),
   * 루프면 감고 비루프면 0..FrameMax 로 자른다. 진행 뒤 이벤트 수집, 끝났고 큐가 있으면 큐 모션을 시작한다(다음 step 부터 진행).
   */
  step(dt: number): void {
    if (!this.name || this.paused) return;
    const r = this.rules.f32;
    const df = r ? f32(dt * 60) : dt * 60;
    const slotSpeed = r ? f32(this.speed * this.conditionSpeed) : this.speed * this.conditionSpeed;
    const delta = r ? f32(f32(df * slotSpeed) * this.modelSpeed) : df * slotSpeed * this.modelSpeed;
    if (this.transitType) {
      this.transitElapsed = r ? f32(this.transitElapsed + df / 60) : this.transitElapsed + df / 60;
      if (this.transitType === TRANSITION_CROSSFADE && this.prevInfo) this.prevFrame = advance(this.prevFrame, delta, this.prevInfo.frames, this.prevInfo.loop, r);
      if (this.transitElapsed >= this.transitDuration) this.transitType = 0;
    }
    const old = this.frame;
    this.frame = advance(this.frame, delta, this.frameMax, this.loop, r);
    this.bundleFrame = r ? f32(this.bundleFrame + delta) : this.bundleFrame + delta;
    this.ev.collect(old, this.frame, slotSpeed);
    if (this.hasQueue && this.isFinished()) {
      copyArg(this.tmp, this.queued);
      this.hasQueue = false;
      this.play(this.tmp);
    }
  }

  /** 새 노드 가중치(0..1) — 전이 없음 1. type 4 = elapsed/blend, type 1 = 뼈 시간 clamp D = max(min, min(blend, max)), D ≤ 0 이면 1 [판독 FUN_71006a77f0, 선형 [추정]] */
  weight(min = 0, max = FLT_MAX): number {
    if (!this.transitType) return 1;
    const d = this.transitType === TRANSITION_CROSSFADE ? this.transitDuration : Math.max(min, Math.min(this.transitDuration, max));
    if (d <= 0) return 1;
    return Math.min(1, this.transitElapsed / d);
  }
}

function advance(frame: number, delta: number, fm: number, loop: boolean, r: boolean): number {
  const next = r ? f32(frame + delta) : frame + delta;
  if (!(fm > 0)) return next;
  if (loop) {
    if (next >= fm) return r ? f32(next - fm * Math.floor(next / fm)) : next % fm;
    if (next < 0) return r ? f32(next + fm * Math.ceil(-next / fm)) : (next % fm) + fm;
    return next;
  }
  return next < 0 ? 0 : next > fm ? fm : next;
}

/* ================================================================ 사원수(three 식 그대로, 할당 0) */

/** [x, y, z, w] */
export type Quat = Float64Array;
export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => Float64Array.of(x, y, z, w);
const qcopy = (q: Quat, a: Quat): Quat => {
  q[0] = a[0];
  q[1] = a[1];
  q[2] = a[2];
  q[3] = a[3];
  return q;
};
const clampv = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clampThree = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** 실수 인자 칸: 인라인되지 않은 함수에 실수를 넘기면 상자(HeapNumber)를 만든다 — 코어 안 호출은 이 배열로 넘긴다(할당 0). [0 t, 1 step, 2 t(단위→q)] */
const SC = new Float64Array(4);

/** Quaternion.normalize */
export function qnormalize(q: Quat): Quat {
  let l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  if (l === 0) {
    q[0] = q[1] = q[2] = 0;
    q[3] = 1;
    return q;
  }
  l = 1 / l;
  q[0] = q[0] * l;
  q[1] = q[1] * l;
  q[2] = q[2] * l;
  q[3] = q[3] * l;
  return q;
}

/** Quaternion.slerp(qb, t) — this = q, t = SC[0] */
function slerpSC(q: Quat, b: Quat): Quat {
  const t = SC[0];
  if (t === 0) return q;
  if (t === 1) return qcopy(q, b);
  const x = q[0],
    y = q[1],
    z = q[2],
    w = q[3];
  let cosHalfTheta = w * b[3] + x * b[0] + y * b[1] + z * b[2];
  if (cosHalfTheta < 0) {
    q[3] = -b[3];
    q[0] = -b[0];
    q[1] = -b[1];
    q[2] = -b[2];
    cosHalfTheta = -cosHalfTheta;
  } else qcopy(q, b);
  if (cosHalfTheta >= 1.0) {
    q[0] = x;
    q[1] = y;
    q[2] = z;
    q[3] = w;
    return q;
  }
  const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;
  if (sqrSinHalfTheta <= Number.EPSILON) {
    const s = 1 - t;
    q[3] = s * w + t * q[3];
    q[0] = s * x + t * q[0];
    q[1] = s * y + t * q[1];
    q[2] = s * z + t * q[2];
    return qnormalize(q);
  }
  const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
  const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta,
    ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
  q[3] = w * ratioA + q[3] * ratioB;
  q[0] = x * ratioA + q[0] * ratioB;
  q[1] = y * ratioA + q[1] * ratioB;
  q[2] = z * ratioA + q[2] * ratioB;
  return q;
}

/** Quaternion.slerp(qb, t) */
export function qslerp(q: Quat, b: Quat, t: number): Quat {
  SC[0] = t;
  return slerpSC(q, b);
}

/** Quaternion.rotateTowards(b, step) — step = SC[1] */
function rotateTowardsSC(q: Quat, b: Quat): Quat {
  const angle = 2 * Math.acos(Math.abs(clampThree(q[0] * b[0] + q[1] * b[1] + q[2] * b[2] + q[3] * b[3], -1, 1)));
  if (angle === 0) return q;
  SC[0] = Math.min(1, SC[1] / angle);
  return slerpSC(q, b);
}

/** Quaternion.rotateTowards(b, step) */
export function qrotateTowards(q: Quat, b: Quat, step: number): Quat {
  SC[1] = step;
  return rotateTowardsSC(q, b);
}

/** Quaternion.setFromEuler(e[0], e[1], e[2], 'ZYX') */
function fromEulerZYXArr(q: Quat, e: Float64Array): Quat {
  const x = e[0],
    y = e[1],
    z = e[2];
  const c1 = Math.cos(x / 2),
    c2 = Math.cos(y / 2),
    c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2),
    s2 = Math.sin(y / 2),
    s3 = Math.sin(z / 2);
  q[0] = s1 * c2 * c3 - c1 * s2 * s3;
  q[1] = c1 * s2 * c3 + s1 * c2 * s3;
  q[2] = c1 * c2 * s3 - s1 * s2 * c3;
  q[3] = c1 * c2 * c3 + s1 * s2 * s3;
  return q;
}

const E3 = new Float64Array(3);

/** Quaternion.setFromEuler(x, y, z, 'ZYX') */
export function qfromEulerZYX(q: Quat, x: number, y: number, z: number): Quat {
  E3[0] = x;
  E3[1] = y;
  E3[2] = z;
  return fromEulerZYXArr(q, E3);
}

/** Euler.setFromQuaternion(q, 'YZX') → out[0..2] = x, y, z (Matrix4.compose 회전 → setFromRotationMatrix) */
export function eulerYZX(q: Quat, out: Float64Array): Float64Array {
  const x = q[0],
    y = q[1],
    z = q[2],
    w = q[3];
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
  const m11 = (1 - (yy + zz)) * 1;
  const m21 = (xy + wz) * 1;
  const m31 = (xz - wy) * 1;
  const m22 = (1 - (xx + zz)) * 1;
  const m23 = (yz - wx) * 1;
  const m13 = (xz + wy) * 1;
  const m33 = (1 - (xx + yy)) * 1;
  out[2] = Math.asin(clampThree(m21, -1, 1));
  if (Math.abs(m21) < 0.9999999) {
    out[0] = Math.atan2(-m23, m22);
    out[1] = Math.atan2(-m31, m11);
  } else {
    out[0] = 0;
    out[1] = Math.atan2(m13, m33);
  }
  return out;
}

/** 단위 → q slerp(최단 경로, t 가 1 을 넘으면 연장). 거의 같으면 선형 [판독 FUN_71001c5a58 앞머리] */
function slerpFromIdentitySC(out: Quat, q: Quat): Quat {
  const t = SC[2];
  const dot = q[3];
  const sg = dot < 0 ? -1 : 1;
  const c = Math.abs(dot);
  let s0 = 1 - t;
  let s1 = t * sg;
  if (c <= 1 - F32_EPS) {
    const th = Math.acos(c);
    const si = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / si;
    s1 = (sg * Math.sin(t * th)) / si;
  }
  out[0] = q[0] * s1;
  out[1] = q[1] * s1;
  out[2] = q[2] * s1;
  out[3] = s0 + q[3] * s1;
  return out;
}

/** 단위 → q slerp(t 가 1 을 넘으면 연장) */
export function qslerpFromIdentity(out: Quat, q: Quat, t: number): Quat {
  SC[2] = t;
  return slerpFromIdentitySC(out, q);
}

/**
 * 3×3 회전(행 우선 m[i*3+j]) → 사원수, 최대 대각 후보 선택 [판독 @0x71001c4aa4~0x71001c4bec, 09 §6.8]. 동률은 뒤 후보가 이긴다.
 */
export function quatFromMat3(m: ArrayLike<number>, out: Quat, zeroOnNull = false): Quat {
  const m00 = m[0],
    m01 = m[1],
    m02 = m[2],
    m10 = m[3],
    m11 = m[4],
    m12 = m[5],
    m20 = m[6],
    m21 = m[7],
    m22 = m[8];
  const ax = 1 + m00 - m11 - m22,
    ay = 1 - m00 + m11 - m22,
    az = 1 - m00 - m11 + m22,
    aw = 1 + m00 + m11 + m22;
  let k = 0;
  let best = ax;
  if (ay >= best) {
    k = 1;
    best = ay;
  }
  if (az >= best) {
    k = 2;
    best = az;
  }
  if (aw >= best) k = 3;
  if (k === 0) {
    out[0] = ax;
    out[1] = m01 + m10;
    out[2] = m02 + m20;
    out[3] = m21 - m12;
  } else if (k === 1) {
    out[0] = m01 + m10;
    out[1] = ay;
    out[2] = m12 + m21;
    out[3] = m02 - m20;
  } else if (k === 2) {
    out[0] = m02 + m20;
    out[1] = m12 + m21;
    out[2] = az;
    out[3] = m10 - m01;
  } else {
    out[0] = m21 - m12;
    out[1] = m02 - m20;
    out[2] = m10 - m01;
    out[3] = aw;
  }
  if (zeroOnNull && out[0] === 0 && out[1] === 0 && out[2] === 0 && out[3] === 0) return out;
  return qnormalize(out);
}

/* ================================================================ 머리 시선 */

const DEG = Math.PI / 180;
/** 대상 각속도 경계(rad/s): 이하 = 스프링, 이상 = 선형, 사이 = 둘의 slerp [판독 같은 곳] */
const HEAD_W_LO = 2.0943952;
const HEAD_W_HI = 4.1887903;
/** 눈 따라가기 [판독 FUN_71001c5a58] */
const EYE_RATE = 0.6;

/** characterlist head_* (도). 없는 값은 impl 기본(FUN_71001bee00) */
export interface HeadParams {
  minDeg?: readonly [number, number, number];
  maxDeg?: readonly [number, number, number];
  weight?: number;
  chinCoef?: number;
}

/** 원본 스위치(기본 끔 = 기존 웹 결과) */
export interface HeadRules {
  /** 뒤쪽 진입 40°/60° 기저 분기·이전 부호 유지 [판독 @0x71001bfe08] */
  back: boolean;
  /** chin 보정 effectiveMax.x [판독 @0x71001c3780~] */
  chin: boolean;
  /** neck_roll 0.5 성분 보간 [판독 @0x71001c4948~] — 어댑터가 neckQuat 로 쓴다 */
  neck: boolean;
  /** 스프링 속도 초기값: 웹 이전 = three Vector4() 기본(0,0,0,1) — 원본은 0 [추정] */
  velInitW: number;
}

export const HEAD_RULES_WEB: Readonly<HeadRules> = { back: false, chin: false, neck: false, velInitW: 1 };
export const HEAD_RULES_ORIGINAL: Readonly<HeadRules> = { back: true, chin: true, neck: true, velInitW: 0 };

/** 기본 규칙 — 2026-10-09 사용자 결정: 원본(09 §14.7). 소비자는 만들 때 읽는다. RULES_WEB·HEAD_RULES_WEB 로 바꾸면 이전 웹 결과(골든 WEB) */
export const characterDefaults: { motion: Readonly<MotionRules>; head: Readonly<HeadRules> } = { motion: RULES_ORIGINAL, head: HEAD_RULES_ORIGINAL };

/** HeadLook.update 입력(어댑터가 three 행렬로 채운다) */
export interface HeadInput {
  /** 대상 있음(SetTarget*) */
  has: boolean;
  /** head_aimcont 부모 공간 방향(정규화 전, 원점 = head_aimcont 위치) */
  dx: number;
  dy: number;
  dz: number;
  /** 캐릭터 공간 방향(정규화 전) */
  cx: number;
  cy: number;
  cz: number;
  /** 머리 시선 켬(+0x234) / 눈 시선 켬(+0x235) */
  headOn: boolean;
  eyesOn: boolean;
  /** 주 슬롯 모션 user data headLookWeight(없으면 NaN) */
  motionWeight: number;
  /** 따라가기 시간 배율 = |주 슬롯 속도|(+0xC8) · 대상 속도 배율(+0x1E0) */
  speedScale: number;
  /** chin 본 로컬 X 각(rad, 없으면 NaN) */
  chinX: number;
}

export const headInput = (): HeadInput => ({ has: false, dx: 0, dy: 0, dz: 0, cx: 0, cy: 0, cz: 0, headOn: true, eyesOn: true, motionWeight: NaN, speedScale: 1, chinX: NaN });

/**
 * bex::ComHeading 머리·눈 각 [판독 FUN_71001bea18 → FUN_71001bfe08·FUN_71001c0c90 → FUN_71001c1694 → FUN_71001c5a58, 09 §6.8].
 * 출력 cur = head_aimcont 쉬는 자세 앞에 곱할 회전(apply = 단위가 아님), eyePitch·eyeYaw = 눈 회전 각, eyesActive.
 */
export class HeadLook {
  readonly min = new Float64Array(3);
  readonly max = new Float64Array(3);
  /**
   * 실수 값·상태는 Float64Array 한 칸씩(최적화된 코드에서 실수를 상자에 담지 않게 — 매 스텝 할당 0).
   * [0 weight, 1 chinCoef, 2 speedCoef, 3 linearSpeed, 4 eyesWeight, 5 backA, 6 backB, 7 backD, 8 front, 9 eyePitch, 10 eyeYaw, 11 usedWeight, 12~14 방향 d, 15 cz]
   */
  private readonly k = new Float64Array(16);
  /** impl+0x200 현재 회전, +0x220 스프링 속도, +0x210 지난 대상(0 으로 시작) */
  readonly cur = quat();
  readonly vel = quat();
  readonly prevT = quat();
  apply = false;
  eyesActive = false;
  /** 마지막 대상 회전(눈 계산용 qT)과 가중치 */
  readonly qT = quat();
  private readonly q = quat();
  private readonly lin = quat();
  private readonly spr = quat();
  private readonly qS = quat();
  private readonly qU = quat();
  private readonly e3 = new Float64Array(3);
  private readonly m9 = new Float64Array(9);

  constructor(
    p: HeadParams,
    readonly rules: Readonly<HeadRules> = characterDefaults.head,
  ) {
    const mn = p.minDeg ?? [-10, -90, 0];
    const mx = p.maxDeg ?? [10, 90, 0];
    for (let i = 0; i < 3; i++) {
      this.min[i] = mn[i] * DEG;
      this.max[i] = mx[i] * DEG;
    }
    const k = this.k;
    k[0] = p.weight ?? 0.5;
    k[1] = p.chinCoef ?? 0;
    /** ComHeading 기본값 [판독 impl 생성자 FUN_71001bee00]: speedCoef(+0xB0), linearSpeed(+0xB4, rad/s), eyesLookWeight(+0xBC), 눈 따라가기(+0xF4·+0x134) */
    k[2] = 0.12;
    k[3] = 5;
    k[4] = 1;
    /** 뒤쪽 분기 각(rad): A = +0xA8 60°, B = +0xAC 40°, D = +0xA4 20° */
    k[5] = 60 * DEG;
    k[6] = 40 * DEG;
    k[7] = 20 * DEG;
    /** impl+0x230 대상 방향(캐릭터 공간) z — 생성자 1.0 */
    k[8] = 1;
    this.vel[3] = rules.velInitW;
  }

  get weight(): number {
    return this.k[0];
  }
  set weight(v: number) {
    this.k[0] = v;
  }
  get chinCoef(): number {
    return this.k[1];
  }
  set chinCoef(v: number) {
    this.k[1] = v;
  }
  get speedCoef(): number {
    return this.k[2];
  }
  set speedCoef(v: number) {
    this.k[2] = v;
  }
  get linearSpeed(): number {
    return this.k[3];
  }
  set linearSpeed(v: number) {
    this.k[3] = v;
  }
  get eyesWeight(): number {
    return this.k[4];
  }
  set eyesWeight(v: number) {
    this.k[4] = v;
  }
  get front(): number {
    return this.k[8];
  }
  get eyePitch(): number {
    return this.k[9];
  }
  get eyeYaw(): number {
    return this.k[10];
  }
  get usedWeight(): number {
    return this.k[11];
  }

  /**
   * 머리 시선 [판독 FUN_71001bea18 이벤트 0x5f454e00·04·05 → FUN_71001bfe08·FUN_71001c1694]. steps = 지난 원본 프레임 수(따라가기 진행).
   * 반환 = 같은 대상 회전으로 눈 계산(FUN_71001c5a58)이 쓰는 값. (0 이면 대상·눈 각만 다시 계산)
   */
  update(steps: number, inp: HeadInput): void {
    const k = this.k;
    /* 대상 회전 qT: 대상 위치를 head(부모) 공간 방향으로 바꿔 +Z → 그 방향 최단 회전(1 + 내적 ≤ ulp 면 (1,0,0,0)).
       대상 없음·머리 시선 꺼짐이면 단위 [판독 FUN_71001c0c90 앞머리]. impl+0x230 = 같은 대상의 캐릭터 공간 방향 z */
    const qT = this.qT;
    qT[0] = qT[1] = qT[2] = 0;
    qT[3] = 1;
    const dx = inp.dx,
      dy = inp.dy,
      dz = inp.dz;
    const cx = inp.cx,
      cy = inp.cy,
      cz = inp.cz;
    const dl = dx * dx + dy * dy + dz * dz;
    const cl = cx * cx + cy * cy + cz * cz;
    if (inp.has && inp.headOn && dl > 0 && cl > 0) {
      const kd = 1 / (Math.sqrt(dl) || 1);
      k[12] = dx * kd;
      k[13] = dy * kd;
      k[14] = dz * kd;
      const kc = 1 / (Math.sqrt(cl) || 1);
      k[15] = cz * kc;
      k[8] = k[15];
      if (this.rules.back) this.backTarget(qT);
      else this.shortestArc(qT);
    }
    /* 가중치: 모션 user data headLookWeight(0 이상) 가 있으면 그것, 아니면 SetHeadLookWeight 값(mg1801 0.3) */
    const mw = inp.motionWeight;
    k[11] = mw === mw && mw >= 0 ? mw : k[0];
    const q = this.q;
    q[0] = q[1] = q[2] = 0;
    q[3] = 1;
    SC[0] = k[11];
    slerpSC(q, qT);
    if (inp.has) {
      /* YZX 분해 → head_min/max 로 자름 → ZYX 재구성 [판독 디스어셈블리 @0x71001c1ad8·@0x71001c38b4~0x71001c39b0] */
      const e = eulerYZX(q, this.e3);
      let maxX = this.max[0];
      const cx2 = inp.chinX;
      if (this.rules.chin && k[1] !== 0 && cx2 === cx2) maxX = this.max[0] + k[1] * Math.max(0, cx2 - e[0]);
      e[0] = clampv(e[0], this.min[0], maxX);
      e[1] = clampv(e[1], this.min[1], this.max[1]);
      e[2] = clampv(e[2], this.min[2], this.max[2]);
      fromEulerZYXArr(q, e);
    }
    /* 따라가기 모드 4: 대상 각속도 ω = acos(대상·지난 대상)/dt 로 스프링·선형을 고른다. 시간 = dt·|모션 속도| */
    const cur = this.cur;
    const vel = this.vel;
    const pt = this.prevT;
    const sp = Math.abs(inp.speedScale);
    /** 모드 4 스프링 강성 = min(2000, speedCoef^2.252184 · 17851.338), 감쇠 = 2√k [판독 FUN_71001c1694 case 4] */
    const K = Math.min(2000, Math.pow(k[2], 2.252184) * 17851.338);
    const C = 2 * Math.sqrt(K);
    const lin = this.lin;
    const spr = this.spr;
    for (let n = 0; n < steps; n++) {
      const w = Math.acos(clampv(q[0] * pt[0] + q[1] * pt[1] + q[2] * pt[2] + q[3] * pt[3], -1, 1)) / STEP_SEC;
      const hasLin = w > HEAD_W_LO;
      if (hasLin) {
        lin[0] = cur[0];
        lin[1] = cur[1];
        lin[2] = cur[2];
        lin[3] = cur[3];
        const angle = 2 * Math.acos(Math.abs(Math.max(-1, Math.min(1, lin[0] * q[0] + lin[1] * q[1] + lin[2] * q[2] + lin[3] * q[3]))));
        if (angle !== 0) {
          SC[0] = Math.min(1, (STEP_SEC * sp * k[3]) / angle);
          slerpSC(lin, q);
        }
      }
      const hasSpr = w < HEAD_W_HI;
      if (hasSpr) {
        const h = STEP_SEC * sp;
        vel[0] += ((cur[0] - q[0]) * -K - vel[0] * C) * h;
        vel[1] += ((cur[1] - q[1]) * -K - vel[1] * C) * h;
        vel[2] += ((cur[2] - q[2]) * -K - vel[2] * C) * h;
        vel[3] += ((cur[3] - q[3]) * -K - vel[3] * C) * h;
        spr[0] = cur[0] + vel[0] * h;
        spr[1] = cur[1] + vel[1] * h;
        spr[2] = cur[2] + vel[2] * h;
        spr[3] = cur[3] + vel[3] * h;
        qnormalize(spr);
      }
      if (hasLin && hasSpr) {
        SC[0] = (w - HEAD_W_LO) / HEAD_W_LO;
        qcopy(cur, slerpSC(spr, lin));
      } else qcopy(cur, hasLin ? lin : spr);
      qcopy(pt, q);
    }
    this.apply = Math.abs(Math.abs(cur[3]) - 1) >= F32_EPS;
    /* 눈 회전(impl+0xC0 = 1): 단위 → qT 를 clamp(앞쪽 + 1.8, 0, 2)·(눈 가중치 − 머리 가중치) (≤ 2) 만큼 — 1 을 넘으면 넘어서 돈다 */
    SC[2] = Math.min(2, clampv(k[8] + 1.8, 0, 2) * (k[4] - k[11]));
    const ee = eulerYZX(slerpFromIdentitySC(spr, qT), this.e3);
    k[9] = ee[0];
    k[10] = ee[1];
    this.eyesActive = inp.has && inp.eyesOn;
  }

  /** +Z → d 최단 회전(1 + d.z ≤ ulp 면 (1,0,0,0)) — d = k[12..14] */
  private shortestArc(out: Quat): Quat {
    const k = this.k;
    const d1 = 1 + k[14];
    if (d1 <= F32_EPS) {
      out[0] = 1;
      out[1] = out[2] = out[3] = 0;
      return out;
    }
    const s = Math.sqrt(d1 + d1);
    out[0] = -k[13] / s;
    out[1] = k[12] / s;
    out[2] = 0;
    out[3] = s * 0.5;
    return out;
  }

  /** 뒤쪽 진입 [판독 @0x71001bfed0~0x71001c08a0]: a = acos(c·(0,0,−1)); a ≤ A 이고 π−|atan2(d.x,d.z)| < D 면 지난 qP 정면 x 부호를 d.x 에 복사 → qS/qU/보간 */
  private backTarget(out: Quat): void {
    const k = this.k;
    const a = Math.acos(clampv(-k[15], -1, 1));
    if (a <= k[5] && Math.PI - Math.abs(Math.atan2(k[12], k[14])) < k[7]) {
      const c = this.cur;
      const fx = 2 * (c[0] * c[2] + c[3] * c[1]);
      k[12] = (fx < 0 || Object.is(fx, -0) ? -1 : 1) * Math.abs(k[12]);
    }
    const dx = k[12],
      dy = k[13],
      dz = k[14];
    const qS = this.shortestArc(this.qS);
    if (a > k[5]) {
      qcopy(out, qS);
      return;
    }
    let rx = 1 * dz - 0 * dy,
      ry = 0 * dx - 0 * dz,
      rz = 0 * dy - 1 * dx;
    let l = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (l > 0) {
      rx /= l;
      ry /= l;
      rz /= l;
    } else rx = ry = rz = 0;
    let ux = dy * rz - dz * ry,
      uy = dz * rx - dx * rz,
      uz = dx * ry - dy * rx;
    l = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (l > 0) {
      ux /= l;
      uy /= l;
      uz /= l;
    } else ux = uy = uz = 0;
    const m = this.m9;
    m[0] = rx;
    m[1] = ux;
    m[2] = dx;
    m[3] = ry;
    m[4] = uy;
    m[5] = dy;
    m[6] = rz;
    m[7] = uz;
    m[8] = dz;
    const qU = quatFromMat3Ties(m, this.qU);
    if (a < k[6]) {
      qcopy(out, qU);
      return;
    }
    const t = (a - k[5]) / (k[6] - k[5]);
    const h = qS[0] * qU[0] + qS[1] * qU[1] + qS[2] * qU[2] + qS[3] * qU[3];
    const s = h < 0 ? -1 : 1;
    const ah = Math.abs(h);
    if (ah > 1 - F32_EPS) {
      for (let i = 0; i < 4; i++) out[i] = (1 - t) * qS[i] + s * t * qU[i];
      return;
    }
    const th = Math.acos(ah);
    const si = Math.sin(th);
    const ka = Math.sin((1 - t) * th) / si;
    const kb = (s * Math.sin(t * th)) / si;
    for (let i = 0; i < 4; i++) out[i] = qS[i] * ka + qU[i] * kb;
  }
}

/** 뒤 보정 기저 qU = normalize₀(Q([r,u,d])) — 길이 0 이면 0 [판독 @0x71001c0090~] */
function quatFromMat3Ties(m: ArrayLike<number>, out: Quat): Quat {
  quatFromMat3(m, out, true);
  return out;
}

/**
 * neck_roll 최종 회전 [판독 @0x71001c4948~0x71001c4de0]: qH = Q(inverse(H).rotation), qN = Q(N.rotation) 정규화 → q = qN + 0.5·(qH − qN).
 * 재정규화·부호 맞춤 없음. hInv·n = 3×3 행 우선. 결과 q 는 정규화되지 않은 성분 그대로(어댑터가 행렬로 쓴다).
 */
export function neckQuat(hInv: ArrayLike<number>, n: ArrayLike<number>, out: Quat, tmp: Quat): Quat {
  quatFromMat3(hInv, tmp);
  quatFromMat3(n, out);
  for (let i = 0; i < 4; i++) out[i] = out[i] + 0.5 * (tmp[i] - out[i]);
  return out;
}

/* ================================================================ 눈 */

/** characterlist eye{i}_t_* (eye i 의 UV 이동 규칙) */
export interface EyeParams {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  rot: number;
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

/**
 * 눈 UV [판독 FUN_71001c5a58 §6.8]. mode 'blend'(원본): steps 마다 섞임비 += rate·(목표 − 섞임비), 따라간 uv = 출력 + (목표 − 출력)·rate,
 * 출력 = 모션 값 + (따라간 uv − 모션 값)·섞임비(다음 출력의 출발). 'npc'(웹 이전 광장 NPC): 출력 = 지난 출력 + (목표 − 지난 출력)·rate, 모션 값과 섞지 않음.
 * rate = 눈 켬 0.6 / 끔 0.3.
 * 눈 오프셋 = 모션 ftsb 의 utility_parameter0/1 (없으면 재질 기본) 위에 ComHeading 눈 시선을 섞는다 [판독 FUN_71001c5a58].
 * 모드 2(Vector4 파라미터): 출력 = 모션 값 + (따라간 uv − 모션 값)·섞임비. 그 출력이 다음 프레임 따라가기의 출발(impl+0x100/+0x140).
 * 대상이 없거나 눈 시선이 꺼지면 uv 목표 = t_offset, 따라가기·섞임비 속도는 절반(섞임비는 0 쪽으로).
 */
export class EyeLook {
  /** [ox, oy, sx, sy, rot, minx, miny, maxx, maxy] */
  private readonly k = new Float64Array(9);
  /**
   * 눈 i: impl+0x100/+0x140 지난 출력, +0xF8/+0x138 섞임비
   * [0 outX, 1 outY, 2 섞임비, 3 has, 4 모션 x, 5 모션 y, 6 yaw, 7 pitch]
   */
  private readonly s = new Float64Array(8);

  constructor(
    readonly p: EyeParams,
    readonly mode: 'blend' | 'npc' = 'blend',
  ) {
    const k = this.k;
    k[0] = p.ox;
    k[1] = p.oy;
    k[2] = p.sx;
    k[3] = p.sy;
    k[4] = p.rot;
    k[5] = p.minx;
    k[6] = p.miny;
    k[7] = p.maxx;
    k[8] = p.maxy;
  }

  get outX(): number {
    return this.s[0];
  }
  get outY(): number {
    return this.s[1];
  }
  get blend(): number {
    return this.s[2];
  }
  get has(): boolean {
    return this.s[3] !== 0;
  }

  /** 지금 모션의 셰이더 파라미터 값(ftsb, 없으면 재질 기본) — updateFrom 앞에 */
  setMotion(ax: number, ay: number): void {
    this.s[4] = ax;
    this.s[5] = ay;
  }

  update(steps: number, on: boolean, yaw: number, pitch: number, ax: number, ay: number): void {
    const s = this.s;
    s[4] = ax;
    s[5] = ay;
    s[6] = yaw;
    s[7] = pitch;
    this.run(steps, on);
  }

  /** 할당 없는 경로: 머리 시선의 눈 각(eyesActive·eyeYaw·eyePitch)과 setMotion 값으로 */
  updateFrom(steps: number, look: HeadLook): void {
    const s = this.s;
    s[6] = look.eyeYaw;
    s[7] = look.eyePitch;
    this.run(steps, look.eyesActive);
  }

  private run(steps: number, on: boolean): void {
    const e = this.k;
    const st = this.s;
    const ax = st[4],
      ay = st[5],
      yaw = st[6],
      pitch = st[7];
    let tx = e[0];
    let ty = e[1];
    if (on) {
      const c = Math.cos(e[4]);
      const s = Math.sin(e[4]);
      tx = clampv(e[0] + (yaw * c + pitch * s) * e[2], e[5], e[7]);
      ty = clampv(e[1] - (-s * yaw + pitch * c) * e[3], e[6], e[8]);
    }
    if (this.mode === 'npc') {
      const rate = on ? 0.6 : 0.3;
      st[2] += rate * ((on ? 1 : 0) - st[2]);
      const px = st[3] !== 0 ? st[0] : e[0];
      const py = st[3] !== 0 ? st[1] : e[1];
      st[0] = px + (tx - px) * rate;
      st[1] = py + (ty - py) * rate;
      st[3] = 1;
      return;
    }
    const rate = on ? EYE_RATE : EYE_RATE * 0.5;
    for (let n = 0; n < steps; n++) {
      st[2] += rate * ((on ? 1 : 0) - st[2]);
      const px = st[3] !== 0 ? st[0] : ax;
      const py = st[3] !== 0 ? st[1] : ay;
      const sx = px + (tx - px) * rate;
      const sy = py + (ty - py) * rate;
      st[0] = ax + (sx - ax) * st[2];
      st[1] = ay + (sy - ay) * st[2];
      st[3] = 1;
    }
  }
}

/* ================================================================ FX 트리거(모션 이벤트) */

/** 소스 한 행: [종류 0 SE·1 FX·2 VB, 훅, [[라벨, 가중치]…], 볼륨, 지연 초, [조건 이름…]] (tools/analysis/chara_ftrg.py) */
export type FtrgRow = readonly [number, string, readonly (readonly [string, number])[], number, number, readonly string[]];
/** 애니 이벤트: [프레임, 키, 플래그 u32(+0x0C), 길이(+0x10), 루프 K(+0x14), 모드 M(+0x18)] */
export type FtrgEvent = readonly [number, string, number, number, number, number];

export interface FtrgSource {
  ref: string | null;
  rows: Readonly<Record<string, readonly FtrgRow[]>>;
  anim: Readonly<Record<string, readonly FtrgEvent[]>>;
}

export type CharacterEventKind = 'se' | 'voice' | 'vib' | 'fx';

/** 모션 이벤트 사건(고리 버퍼에서 다시 쓰는 객체 — 받는 쪽은 콜백 안에서만 읽는다) */
export interface CharacterEvent {
  kind: CharacterEventKind;
  /** 트리거 키(RC_RHY_KNIFE_SWING00 등) */
  key: string;
  /** 고른 자원의 라벨(SQ_SE_*·SQ_VOI_*·bv_vib_*·.eset 이름) */
  label: string;
  /** 훅 본/로케이터(NDcha_pos 등) */
  hook: string;
  volume: number;
  delaySec: number;
  /** 모션·프레임·슬롯 */
  motion: string;
  frame: number;
  slot: number;
  /** 키를 찾은 소스 이름 */
  source: string;
  /** 행 조건 이름(조건 그래프 미해석 [미확정]) */
  cond: readonly string[];
  /** 발소리 지면(co_ground) — 장면이 setGround 로 정한 값 */
  ground: string | null;
}

const ev0 = (): CharacterEvent => ({ kind: 'se', key: '', label: '', hook: '', volume: 1, delaySec: 0, motion: '', frame: 0, slot: 0, source: '', cond: [], ground: null });

/** +0x0C 플래그: 바이트 0 = 방향(0 양쪽·1 정·2 역), 바이트 3(+0x0F) = 즉시(최초 평가) [판독 §7.5], 바이트 1 = 구간 [추정] */
const EV_DIR = (f: number): number => f & 0xff;
const EV_IMMEDIATE = (f: number): boolean => ((f >>> 24) & 0xff) !== 0;

/**
 * 슬롯 하나의 이벤트 문맥(owner+0x10+slot×0x14) [판독 §7.5]: 이전/현재 프레임·루프 카운터·최초 플래그.
 * reset = 노드 교체(@0x710111c280), collect = 진행 수집(@0x71005f3ccc), count = 이벤트 하나의 통과 횟수, commit = 평가 후 확정(@0x710111c2f4).
 */
export class FtrgCursor {
  p = 0;
  f = 0;
  P = 0;
  C = 0;
  first = true;
  reverse = false;

  reset(start: number): void {
    this.p = this.f = start;
    this.P = this.C = 0;
    this.first = true;
    this.reverse = false;
  }

  /** 진행 뒤 현재 프레임: |f−old| ≤ ε 면 감김 없음, 그 밖에는 속도 부호와 (f−old) 부호가 다르면 감김 */
  collect(old: number, f: number, speed: number): void {
    const neg = speed < 0 || Object.is(speed, -0);
    this.reverse = neg;
    const d = f - old;
    if (Math.abs(d) > 1.1920929e-7 && (d < 0 || Object.is(d, -0)) !== neg) this.C += neg ? -1 : 1;
    this.f = f;
  }

  /** 이벤트 하나(프레임 e, 방향, 루프 K·모드 M)의 이번 평가 통과 횟수 */
  count(e: number, dir: number, K: number, M: number, immediate: boolean, frameMax: number): number {
    if (immediate) return this.first ? 1 : 0;
    const { p, f, P, C } = this;
    if (this.reverse) {
      if (dir === 1) return 0;
      let n: number;
      if (P === C) n = f < e && e <= p ? 1 : 0;
      else if (p < f) n = P - C - 1 + (e <= p || f < e ? 1 : 0);
      else n = P - C + (f < e && e <= p ? 1 : 0);
      return n > 0 ? n : 0;
    }
    if (dir === 2) return 0;
    let n = 0;
    for (let L = P; L <= C; L++) {
      if ((M === 0 && L < K) || (M === 1 && L !== K) || (M === 2 && L > K)) continue;
      const end = L === C ? f : frameMax;
      if (L === P) {
        if ((p < e && e <= end) || (this.first && L === C && e === f)) n++;
      } else if (e <= end || (this.first && L === C && e === f)) n++;
    }
    return n;
  }

  commit(): void {
    this.first = false;
    this.p = this.f;
    this.P = this.C;
  }
}

/** 소스 이름 접두 → 사건 종류(SE 행) — vo_ = 보이스, 나머지 SE */
const kindOf = (src: string, k: number): CharacterEventKind => (k === 1 ? 'fx' : k === 2 ? 'vib' : src.startsWith('vo_') ? 'voice' : 'se');

/** 자동 부착 접두(ComMatter helper @0x71001d8d30 / AddFxTrigger @0x71019cccc0): fx_ → se_ → vb_ → vo_ → pg_ → st_ [판독 §7.5] */
export const FTRG_PREFIXES = ['fx_', 'se_', 'vb_', 'vo_', 'pg_', 'st_'] as const;

/**
 * 캐릭터 하나의 FX 트리거 소스 묶음(최대 8개) [판독 §7.5]. 모션 트랙과 키 행은 소스 안에서 찾고, 없으면 ref 를 따라간다.
 * 같은 키의 조건 행은 조건 그래프를 해석하지 못해 "조건 없는 첫 행, 없으면 첫 행" 하나만 쓴다 [근사]. 자원은 가중 선택(W·r) [판독 @0x7101117380].
 */
export class FtrgBank {
  /** 붙은 소스 이름(순서 = 부착 순서) */
  readonly attached: string[] = [];
  /** 트랙 이름 접두(모델 이름 앞 pcNN — 캐릭터 소스의 'pc62_rhy_knife_swing00' 꼴 트랙) */
  private readonly prefix: string;
  /** 모션 이름 → 붙은 소스별 트랙(처음 한 번 만들어 둔다) */
  private readonly cache = new Map<string, (readonly FtrgEvent[] | null)[]>();

  constructor(
    readonly sources: Readonly<Record<string, FtrgSource>>,
    model: string,
    extraPrefixes: readonly string[] = [],
  ) {
    for (const p of [...FTRG_PREFIXES, ...extraPrefixes]) {
      const n = `${p}${model}`;
      if (sources[n] && this.attached.length < 8) this.attached.push(n);
    }
    this.prefix = `${model.split('_')[0]}_`;
  }

  /** 소스 src 에서 모션 트랙(없으면 ref 를 따라감). 트랙 이름 = 모션 이름, 없으면 pcNN_모션 이름(애니 자원 경로 대조 [근사]) — 노드 교체 때만 부른다 */
  track(src: string, motion: string): readonly FtrgEvent[] | null {
    for (let s: string | null = src, guard = 0; s && guard < 8; guard++) {
      const so: FtrgSource | undefined = this.sources[s];
      if (!so) return null;
      const t = so.anim[motion] ?? so.anim[this.prefix + motion];
      if (t) return t;
      s = so.ref;
    }
    return null;
  }

  /** 모션의 붙은 소스별 트랙(노드 교체 때 — 두 번째부터 할당 없음) */
  tracksFor(motion: string): readonly (readonly FtrgEvent[] | null)[] {
    let t = this.cache.get(motion);
    if (!t) this.cache.set(motion, (t = this.attached.map((src) => this.track(src, motion))));
    return t;
  }

  /** 키 행 찾기(소스 → ref). 결과 객체는 다시 쓴다(할당 0) */
  readonly hit: { src: string; row: FtrgRow | null } = { src: '', row: null };
  row(src: string, key: string): { src: string; row: FtrgRow | null } | null {
    for (let s: string | null = src, guard = 0; s && guard < 8; guard++) {
      const so: FtrgSource | undefined = this.sources[s];
      if (!so) return null;
      const rows = so.rows[key];
      if (rows && rows.length) {
        let row = rows[0];
        for (let i = 0; i < rows.length; i++)
          if (!rows[i][5].length) {
            row = rows[i];
            break;
          }
        this.hit.src = s;
        this.hit.row = row;
        return this.hit;
      }
      s = so.ref;
    }
    return null;
  }
}

/** 가중 선택: W = Σw, r = u·W, 배열 순서대로 r ≤ wᵢ 인 첫 자원, 아니면 r −= wᵢ [판독 @0x710110f2e0] */
export function pickWeighted(res: readonly (readonly [string, number])[], u: number): number {
  if (res.length <= 1) return 0;
  let W = 0;
  for (const r of res) W += r[1];
  let x = u * W;
  for (let i = 0; i < res.length; i++) {
    if (x <= res[i][1]) return i;
    x -= res[i][1];
  }
  return res.length - 1;
}

/* ================================================================ 캐릭터 한 명 */

export interface CharacterCoreOptions {
  info(name: string): MotionInfo | undefined;
  rand(n: number): number;
  /** 가중 선택 난수 0..1 */
  rand01?(): number;
  rules?: Readonly<MotionRules>;
  headRules?: Readonly<HeadRules>;
  head?: HeadParams | null;
  eyes?: readonly EyeParams[];
  eyeMode?: 'blend' | 'npc';
  mpat?: readonly (readonly MpatRow[])[];
  ftrg?: FtrgBank | null;
  idleRandom?(name: string): boolean;
}

/** play 옵션 — 원본 MotionArg 의 웹 이름 */
export interface PlayOptions {
  /** 전이 초(없으면 기본: 노드 있으면 0.1, 없으면 0) */
  blend?: number;
  speed?: number;
  /** 시작 프레임(비루프에서 넘어올 때, 또는 random) */
  start?: number | 'random';
  /** 같은 모션이어도 다시 시작(기본 false = 원본 Play(name)) */
  force?: boolean;
  /** 끝나면 이어서(EnqueuePlay) */
  next?: string;
  type?: number;
}

/** 표정(face_param) 자리 — 22명 공통 소비자·겹침 우선순위 [미확정](09 §13)이라 요청만 기록하고 적용하지 않는다 */
export class FaceSlot {
  requested = '';
  readonly applied = false;
  set(name: string): void {
    this.requested = name;
  }
}

/** 보조 물리(ComPhysicalAnimation) 자리 — 솔버 없음. 생성 기본 enabled=1·teleportPending=1 [판독 §4.7], 포즈는 애니 값 그대로 */
export class PhysicsSlot {
  enabled = true;
  teleportPending = true;
  setEnabled(v: boolean): void {
    this.enabled = v;
  }
  requestTeleport(): void {
    this.teleportPending = true;
  }
}

type Listener = (e: CharacterEvent) => void;

const NO_OPTS: PlayOptions = {};

/** 캐릭터 한 명(ComMatter): 주 슬롯 + 시선 + 눈 + 모션 이벤트 + 표정·보조 물리 자리 */
export class CharacterCore {
  readonly main: MotionSlot;
  readonly head: HeadLook | null;
  readonly eyes: EyeLook[];
  readonly face = new FaceSlot();
  readonly physics = new PhysicsSlot();
  readonly headIn = headInput();
  /** 발소리 지면(co_ground 이름, 장면이 정한다) */
  ground: string | null = null;
  ftrg: FtrgBank | null;
  /** 모션 이벤트 평가 끄기(웹 이전 소비자는 소리를 따로 낸다) */
  eventsOn = true;
  private readonly listeners: Listener[] = [];
  private readonly ring: CharacterEvent[] = Array.from({ length: 16 }, ev0);
  private ringAt = 0;
  private trackSeq = -1;
  private tracks: readonly (readonly FtrgEvent[] | null)[] = [];
  private readonly argPlay: MotionArg = motionArg('');
  private readonly argNext: MotionArg = motionArg('');
  private readonly rand01: () => number;

  constructor(readonly o: CharacterCoreOptions) {
    this.main = new MotionSlot(o.rules ?? characterDefaults.motion, { info: o.info, rand: o.rand, mpat: o.mpat, idleRandom: o.idleRandom });
    this.head = o.head ? new HeadLook(o.head, o.headRules ?? characterDefaults.head) : null;
    this.eyes = (o.eyes ?? []).map((e) => new EyeLook(e, o.eyeMode ?? 'blend'));
    this.ftrg = o.ftrg ?? null;
    this.rand01 = o.rand01 ?? (() => o.rand(0x1000000) / 0x1000000);
  }

  /** ComActorMotion::Play(MotionArg) — play(name, {blend, speed, start, force, next}) */
  play(name: string, o: PlayOptions = NO_OPTS): boolean {
    const a = this.argPlay;
    a.name = name;
    a.forceRestart = !!o.force;
    a.randomStartFrame = o.start === 'random';
    a.speedValid = true;
    a.startFrame = typeof o.start === 'number' ? o.start : 0;
    a.speed = o.speed ?? 1;
    a.blendTime = o.blend ?? BLEND_DEFAULT;
    a.transitionType = o.type ?? TRANSITION_DEFAULT;
    const ok = this.main.play(a);
    if (ok && o.next) {
      const n = this.argNext;
      n.name = o.next;
      n.forceRestart = n.randomStartFrame = false;
      n.speedValid = true;
      n.startFrame = 0;
      n.speed = 1;
      n.blendTime = BLEND_DEFAULT;
      n.transitionType = TRANSITION_DEFAULT;
      this.main.enqueue(n);
    }
    return ok;
  }

  on(cb: Listener): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** 고정 스텝 하나: 주 슬롯 진행 → 모션 이벤트 평가(진행 뒤, 큐 교체 뒤) */
  step(dt = STEP_SEC): void {
    this.main.step(dt);
    if (this.eventsOn) this.evaluate();
  }

  /** 명시 키(로직의 VB_MG1801_JUST 등)를 같은 디스패처로 보낸다(05 §7.8) */
  trigger(key: string): void {
    const b = this.ftrg;
    if (!b) return;
    for (let i = 0; i < b.attached.length; i++) this.fire(b.attached[i], key, this.main.name, this.main.frame);
  }

  private evaluate(): void {
    const s = this.main;
    const b = this.ftrg;
    if (!b || !s.name) return;
    if (this.trackSeq !== s.startSeq) {
      this.trackSeq = s.startSeq;
      this.tracks = b.tracksFor(s.name);
    }
    const c = s.ev;
    for (let i = 0; i < b.attached.length; i++) {
      const t = this.tracks[i];
      if (!t) continue;
      for (let k = 0; k < t.length; k++) {
        const e = t[k];
        const n = c.count(e[0], EV_DIR(e[2]), e[4], e[5], EV_IMMEDIATE(e[2]), s.frameMax);
        for (let j = 0; j < n; j++) this.fire(b.attached[i], e[1], s.name, e[0]);
      }
    }
    c.commit();
  }

  private fire(src: string, key: string, motion: string, frame: number): void {
    const b = this.ftrg!;
    const hit = b.row(src, key);
    if (!hit) return;
    const r = hit.row;
    if (!r || !r[2].length) return;
    const res = r[2][r[2].length > 1 ? pickWeighted(r[2], this.rand01()) : 0];
    const ev = this.ring[this.ringAt];
    this.ringAt = (this.ringAt + 1) % this.ring.length;
    ev.kind = kindOf(src, r[0]);
    ev.key = key;
    ev.label = res[0];
    ev.hook = r[1];
    ev.volume = r[3];
    ev.delaySec = r[4];
    ev.motion = motion;
    ev.frame = frame;
    ev.slot = 0;
    ev.source = hit.src;
    ev.cond = r[5];
    ev.ground = key.startsWith('SE_FS_') ? this.ground : null;
    for (let i = 0; i < this.listeners.length; i++) this.listeners[i](ev);
  }
}
