/**
 * 화면 전환(와이프·페이드) 공용 코어 — import 0(외부 라이브러리·three·프로젝트 파일·DOM 타입 없음). 설계·원본 계약: docs/engine/15_transition.md.
 *
 * - 원본 bq::WipeModule 한 개(앱 수명 싱글턴)를 옮긴 상태기계: 열림 → 닫히는 중 → 닫힘 → 열리는 중. 종류 Black·White·CrossFade·Loading 과
 *   "마지막 종류"(GetLastUsedWipeType) 기억. 시간은 원본처럼 속도(애니 20프레임 × 1/속도) 또는 초(웹 편의)로 받고, 1/60 고정 스텝으로만 진행한다.
 * - 그리기는 하지 않는다: 어댑터(DOM 등)가 phase·type·frame·alpha() 를 읽어 그린다. 시계도 주입받는다(TransitionDriver).
 * - 로직 시간으로 진행해야 하는 쪽(미니게임 틀·게임 로직)은 자기 Transition 을 스텝하고, 앱 인스턴스는 follow 로 그것을 그대로 비춘다.
 * - step·advance·alpha 는 할당 0. 다른 게임(ddalkkakrider 등)에 이 파일 하나를 그대로 복사해 쓴다. 번들이 둘이면 appTransition() 이 globalThis 에 둔다.
 */

export const WIPE_BLACK = 0;
export const WIPE_WHITE = 1;
export const WIPE_CROSSFADE = 2;
export const WIPE_LOADING = 3;
export const WIPE_NAMES = ['Black', 'White', 'CrossFade', 'Loading'] as const;

export const OPEN = 0;
export const CLOSING = 1;
export const CLOSED = 2;
export const OPENING = 3;

export const STEP_SEC = 1 / 60;

/** 원본 Parts.lyt wipe.bflan 의 페인 알파 키 [프레임, 값, 기울기] — 종류마다 N_Wipe<종류>_00 하나만 움직인다 */
export type WipeKeys = readonly (readonly [number, number, number])[];
const OUT_20: WipeKeys = [
  [0, 0, 12.75],
  [20, 255, 12.75],
];
const IN_20: WipeKeys = [
  [0, 255, -12.75],
  [20, 0, -12.75],
];
export const WIPE_KEYS: { readonly out: readonly WipeKeys[]; readonly in: readonly WipeKeys[] } = {
  out: [
    OUT_20,
    OUT_20,
    [
      [0, 0, 255],
      [1, 255, 255],
    ],
    OUT_20,
  ],
  in: [IN_20, IN_20, IN_20, IN_20],
};
/** 애니 길이(frameSize) — out: Black 20·White 20·CrossFade 1·Loading 20, in: 전부 20 */
export const WIPE_FRAMES = {
  out: [20, 20, 1, 20] as readonly number[],
  in: [20, 20, 20, 20] as readonly number[],
};

/** BFLAN hermite 곡선 값(기울기 = 프레임당) */
export function hermite(keys: WipeKeys, f: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && f > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const d = b[0] - a[0];
  if (d <= 0) return b[1];
  const t = (f - a[0]) / d;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * d * a[2] + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * d * b[2];
}

const EPS = 1e-6;

export class Transition {
  /** OPEN·CLOSING·CLOSED·OPENING */
  phase = OPEN;
  /** 지금 그리는 종류 */
  type = WIPE_BLACK;
  /** GetLastUsedWipeType(+0x50) — FadeOut·FadeIn·cover 가 모두 바꾼다 */
  lastType = WIPE_BLACK;
  /** 지금 애니(out·in) 프레임. 닫힘·열림에서는 0 */
  frame = 0;
  /** 프레임당 진행(원본 AnimationSlot::SetSpeed) */
  speed = 1;
  /** fadeOut·fadeIn·cover·clear 를 부를 때마다 1 씩(어댑터가 새 전환을 알아보는 데 쓴다 — CrossFade 화면 담기) */
  serial = 0;
  private src: Transition | null = null;
  private readonly waiters: (() => void)[] = [];

  constructor(o?: { closed?: boolean; type?: number }) {
    if (o?.type !== undefined) this.type = this.lastType = o.type;
    if (o?.closed) this.phase = CLOSED;
  }

  /** WipeModule::FadeOut(type, speed): Wipe<종류>_out 을 처음부터 속도 speed 로, 끝나면 _normal(닫힘) */
  fadeOut(type: number, speed = 1): void {
    this.begin(CLOSING, type, speed);
  }

  /** WipeModule::FadeIn(type, speed): Wipe<종류>_in 을 처음부터, 끝나면 숨김(열림). 종류를 안 주면 마지막 종류 */
  fadeIn(type = this.lastType, speed = 1): void {
    this.begin(OPENING, type, speed);
  }

  /** 초 단위(웹 편의): 속도 = 애니 길이 / (초 × 60). 0 이하면 바로 닫힘 */
  fadeOutSec(type: number, sec: number): void {
    if (sec <= 0) this.cover(type);
    else this.fadeOut(type, WIPE_FRAMES.out[type] / (sec * 60));
  }

  fadeInSec(type: number, sec: number): void {
    if (sec <= 0) this.clear(type);
    else this.fadeIn(type, WIPE_FRAMES.in[type] / (sec * 60));
  }

  /** WipeModule::SetVisibleForce(true, type): 바로 닫힘(_normal) */
  cover(type = this.lastType): void {
    this.type = this.lastType = type;
    this.phase = CLOSED;
    this.frame = 0;
    this.speed = 1;
    this.serial++;
    this.flush();
  }

  /** WipeModule::SetVisibleForce(false, type): 바로 열림(숨김) */
  clear(type = this.lastType): void {
    this.type = this.lastType = type;
    this.phase = OPEN;
    this.frame = 0;
    this.speed = 1;
    this.serial++;
    this.flush();
  }

  private begin(phase: number, type: number, speed: number): void {
    this.type = this.lastType = type;
    this.phase = phase;
    this.frame = 0;
    this.speed = speed;
    this.serial++;
  }

  /** IsPlayingFadeAnim: out·in 애니가 아직 끝나지 않았다 */
  get playing(): boolean {
    return this.phase === CLOSING || this.phase === OPENING;
  }

  /** IsFinishedFadeOut: _normal(닫힘)을 재생 중 */
  get closed(): boolean {
    return this.phase === CLOSED;
  }

  get open(): boolean {
    return this.phase === OPEN;
  }

  /** 지금 애니 길이(프레임) */
  get length(): number {
    return this.phase === CLOSING ? WIPE_FRAMES.out[this.type] : this.phase === OPENING ? WIPE_FRAMES.in[this.type] : 1;
  }

  /** 1/60 한 스텝: frame += speed, 길이에 닿은 스텝에서 닫힘·열림으로(애니 슬롯 끝 = 그 스텝 뒤 질의부터 보인다) */
  step(): void {
    if (this.phase !== CLOSING && this.phase !== OPENING) return;
    this.frame += this.speed;
    if (this.frame >= this.length - EPS) {
      this.phase = this.phase === CLOSING ? CLOSED : OPEN;
      this.frame = 0;
      this.speed = 1;
      this.flush();
    }
  }

  /** 덮은 정도 0~1(원본 페인 알파 키 그대로) */
  alpha(): number {
    switch (this.phase) {
      case CLOSING:
        return hermite(WIPE_KEYS.out[this.type], this.frame) / 255;
      case OPENING:
        return hermite(WIPE_KEYS.in[this.type], this.frame) / 255;
      case CLOSED:
        return 1;
      default:
        return 0;
    }
  }

  /** 다른 인스턴스 상태를 그대로 옮긴다(할당 0) */
  copyFrom(o: Transition): void {
    this.phase = o.phase;
    this.type = o.type;
    this.lastType = o.lastType;
    this.frame = o.frame;
    this.speed = o.speed;
    this.serial = o.serial;
    if (!this.playing) this.flush();
  }

  /** 밖에서 진행시킨 상태(로직 상태 값)를 그대로 놓는다 */
  set(phase: number, type: number, frame: number, speed = 1): void {
    if (phase !== this.phase && (phase === CLOSING || phase === OPENING)) this.serial++;
    this.phase = phase;
    this.type = this.lastType = type;
    this.frame = frame;
    this.speed = speed;
    if (!this.playing) this.flush();
  }

  /** 앱 인스턴스용: src 가 있는 동안 스스로 진행하지 않고 src 를 비춘다(로직 시간으로 진행하는 소유자). 마지막 follow 가 이긴다 */
  follow(src: Transition): void {
    this.src = src;
    this.copyFrom(src);
  }

  /** follow 끝: 마지막 상태를 받아 두고 다시 스스로 진행한다 */
  unfollow(src: Transition): void {
    if (this.src !== src) return;
    this.copyFrom(src);
    this.src = null;
  }

  get following(): boolean {
    return this.src !== null;
  }

  /** 앱 시계 한 스텝: follow 중이면 비추기만, 아니면 step */
  advance(): void {
    if (this.src) this.copyFrom(this.src);
    else this.step();
  }

  /** 지금 전환이 끝날 때(playing 이 거짓이 될 때) 부른다. 이미 끝났으면 바로 */
  whenIdle(cb: () => void): void {
    if (!this.playing) cb();
    else this.waiters.push(cb);
  }

  wait(): Promise<void> {
    return new Promise((res) => this.whenIdle(res));
  }

  private flush(): void {
    const w = this.waiters;
    if (w.length === 0) return;
    const n = w.length;
    for (let i = 0; i < n; i++) w[i]();
    w.splice(0, n);
  }
}

/**
 * 로직 시간으로 진행하는 소유자용: 처음 fadeOut·fadeIn·cover·clear 때 target(앱 인스턴스) 상태를 받아 이어 가고 target 이 자기를 비추게 한다.
 * 소유자가 step() 을 부르고, 끝나면 release() 로 target 에 마지막 상태를 넘긴다.
 */
export class LogicTransition extends Transition {
  private taken = false;

  constructor(private readonly target: Transition) {
    super();
  }

  private take(): void {
    if (this.taken) return;
    this.taken = true;
    this.copyFrom(this.target);
    this.target.follow(this);
  }

  override fadeOut(type: number, speed = 1): void {
    this.take();
    super.fadeOut(type, speed);
  }

  override fadeIn(type?: number, speed = 1): void {
    this.take();
    super.fadeIn(type ?? this.lastType, speed);
  }

  override cover(type?: number): void {
    this.take();
    super.cover(type ?? this.lastType);
  }

  override clear(type?: number): void {
    this.take();
    super.clear(type ?? this.lastType);
  }

  get active(): boolean {
    return this.taken;
  }

  release(): void {
    if (!this.taken) return;
    this.taken = false;
    this.target.unfollow(this);
  }
}

/** 앱에 하나(globalThis[key]). 처음 부를 때 만든다 */
export function appTransition(key = '__transition', init?: { closed?: boolean; type?: number }): Transition {
  const g = globalThis as unknown as Record<string, Transition | undefined>;
  let t = g[key];
  if (!t) g[key] = t = new Transition(init);
  return t;
}

/** 주입 시계: now() = 밀리초, request(cb) = 다음 그리기 때 cb(밀리초) 부르기(rAF 등) */
export interface TransitionClock {
  now(): number;
  request(cb: (ms: number) => void): void;
}

/** 앱 시계로 1/60 고정 스텝을 돌리고 매 그리기마다 draw 를 부른다(밀린 스텝은 maxSteps 까지, 넘치면 버림). 할당 0 */
export class TransitionDriver {
  private last = NaN;
  private acc = 0;
  private running = false;
  private readonly loop = (ms: number): void => {
    if (!this.running) return;
    this.tick(ms);
    this.clock.request(this.loop);
  };

  constructor(
    readonly t: Transition,
    private readonly clock: TransitionClock,
    private readonly draw: (t: Transition) => void,
    private readonly maxSteps = 4,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = NaN;
    this.clock.request(this.loop);
  }

  stop(): void {
    this.running = false;
  }

  /** 한 그리기: 지난 시간만큼 스텝 → draw(시험은 이것을 직접 부른다) */
  tick(ms: number): void {
    if (this.last !== this.last) this.last = ms;
    this.acc += (ms - this.last) / 1000;
    this.last = ms;
    let n = 0;
    while (this.acc >= STEP_SEC - EPS && n < this.maxSteps) {
      this.acc -= STEP_SEC;
      this.t.advance();
      n++;
    }
    if (this.acc > STEP_SEC) this.acc = 0;
    this.draw(this.t);
  }
}
