/**
 * 진동 Gamepad 어댑터 — 코어(lib/vibration) 구간 목록을 Gamepad vibrationActuator 'dual-rumble' 로 순서대로 재생한다. import = 코어만.
 * 설계: docs/engine/05_ui_input.md §11.3. Gamepad 는 진폭을 연속으로 바꾸지 못해 구간마다 playEffect 를 다시 부른다(뒤 호출이 앞 효과를 대신한다).
 * 주파수는 표현할 수 없다 [근사]. 액추에이터·타이머는 주입받는다(어느 앱이든 꽂아 쓴다).
 */
import type { VibSegment } from '../vibration';

/** Gamepad.vibrationActuator 중 쓰는 부분 */
export interface RumbleActuator {
  playEffect(type: 'dual-rumble', p: { startDelay?: number; duration: number; strongMagnitude: number; weakMagnitude: number }): Promise<unknown>;
}

export interface VibTimers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const defaultTimers: VibTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** 패드 하나의 진동 출력. 새로 재생하면 앞 재생 예약을 끊는다 */
export class GamepadVibrator {
  private timers: unknown[] = [];

  constructor(
    private readonly actuator: () => RumbleActuator | null | undefined,
    private readonly t: VibTimers = defaultTimers,
  ) {}

  play(segments: readonly VibSegment[]): void {
    this.cancel();
    let at = 0;
    for (const seg of segments) {
      const go = (): void => {
        void this.actuator()
          ?.playEffect('dual-rumble', { startDelay: 0, duration: seg.ms, strongMagnitude: seg.strong, weakMagnitude: seg.weak })
          .catch(() => undefined);
      };
      if (at === 0) go();
      else this.timers.push(this.t.set(go, at));
      at += seg.ms;
    }
  }

  /** 남은 예약을 끊고 세기 0 으로 */
  stop(): void {
    this.cancel();
    void this.actuator()
      ?.playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 })
      .catch(() => undefined);
  }

  private cancel(): void {
    for (const id of this.timers) this.t.clear(id);
    this.timers = [];
  }
}
