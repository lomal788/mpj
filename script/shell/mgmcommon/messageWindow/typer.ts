/**
 * 메시지 창 글자 표시 객체(순수) — FUN_7100322e40(페이지 시작)·FUN_7100322bd0(매 프레임)·FUN_7100323660(스킵) (docs/shell/message_window.md 6.3·9.4).
 * f32 로 계산한다(Math.fround). 타이머는 더하지 않고 다시 대입한다.
 */

const f = Math.fround;
export const TEXT_MAX = 0x200;
export const COUNT_ALL = 0x201;
export const INTERVAL_NORMAL = f(0.05);
export const INTERVAL_SLOW = f(0.1);

export interface TyperOptions {
  /** 저장 데이터 메시지 속도 0(기본 0.05 s)·1(즉시)·2(0.1 s) */
  speed: number;
  online: boolean;
}

export class Typer {
  count = 0;
  typing = true;
  interval: number;
  scale = 1;
  timer: number;
  after = 0;
  readonly afterLimit = 0;

  constructor(
    readonly length: number,
    private readonly waitScale: ReadonlyMap<number, number>,
    opts: TyperOptions,
  ) {
    if (opts.online) {
      this.interval = 0;
      this.count = COUNT_ALL;
    } else if (opts.speed === 2) this.interval = INTERVAL_SLOW;
    else if (opts.speed === 1) {
      this.interval = 0;
      this.count = COUNT_ALL;
    } else this.interval = INTERVAL_NORMAL;
    const s0 = waitScale.get(this.count);
    if (s0 !== undefined) this.scale = f(s0);
    this.timer = f(this.interval * this.scale);
    if (this.count >= length) this.typing = false;
  }

  /** 남은 글자 즉시(스킵) */
  skip(): void {
    this.count = COUNT_ALL;
    this.typing = false;
  }

  /** 한 프레임. 반환 = 이번 프레임에 나온 글자 수(본문이면 글자 소리 횟수) */
  update(dt: number): number {
    if (!this.typing) {
      this.after = f(this.after + dt);
      return 0;
    }
    let n = 0;
    while (this.count < TEXT_MAX) {
      this.timer = f(this.timer - dt);
      if (this.timer >= 0) break;
      this.count += 1;
      const s = this.waitScale.get(this.count);
      if (s !== undefined) this.scale = f(s);
      this.timer = f(this.interval * this.scale);
      if (this.count <= this.length) n++;
      if (this.count >= this.length) break;
    }
    if (this.count >= this.length) this.typing = false;
    return n;
  }

  get visible(): number {
    return Math.min(this.count, this.length);
  }

  /** FUN_71003235f0 */
  get done(): boolean {
    return !this.typing && this.after >= this.afterLimit;
  }
}
