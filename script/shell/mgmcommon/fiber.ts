/**
 * 장면 흐름(원본 bex::Fiber) 대체 — 제너레이터 한 번 yield = Fiber::Wait() 1프레임. docs/shell/mgm_common.md 9.6 프레임 순서.
 */

export type Flow<T = void> = Generator<void, T, void>;

export function* waitFrames(n: number): Flow {
  for (let i = 0; i < n; i++) yield;
}

export function* waitUntil(pred: () => boolean): Flow {
  while (!pred()) yield;
}

/** Wait 뒤 dt 를 f32 로 더해 sec 이상이 될 때까지(원본 do { Wait; t += dt } while (t < sec), mgm_common.md 5.3) */
export function* waitTime(sec: number, dt: () => number): Flow {
  let t = 0;
  const lim = Math.fround(sec);
  do {
    yield;
    t = Math.fround(t + dt());
  } while (t < lim);
}

export interface FiberHandle<T> {
  readonly done: boolean;
  readonly result: T | undefined;
  cancel(): void;
}

interface Running {
  gen: Flow<unknown>;
  done: boolean;
  result: unknown;
  onDone?: (r: unknown) => void;
}

export class FiberRunner {
  private list: Running[] = [];

  /** 흐름 시작. 첫 실행은 다음 step() 에서(원본 파이버 생성 뒤 다음 갱신) */
  start<T>(gen: Flow<T>, onDone?: (r: T) => void): FiberHandle<T> {
    const r: Running = { gen, done: false, result: undefined, onDone: onDone as ((r: unknown) => void) | undefined };
    this.list.push(r);
    return {
      get done() {
        return r.done;
      },
      get result() {
        return r.result as T | undefined;
      },
      cancel: () => {
        r.done = true;
        this.list = this.list.filter((x) => x !== r);
      },
    };
  }

  get active(): number {
    return this.list.length;
  }

  /** 프레임마다 한 번: 시작 순서대로 다음 yield 까지 */
  step(): void {
    for (const r of [...this.list]) {
      if (r.done) continue;
      const it = r.gen.next();
      if (it.done) {
        r.done = true;
        r.result = it.value;
        this.list = this.list.filter((x) => x !== r);
        r.onDone?.(it.value);
      }
    }
  }
}
