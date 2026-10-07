/**
 * 컨트롤러 할당 — 원본 HidModule::SetNumberOfGameControllerPlayers / IsMinimalGameControllerAssigned 대역과
 * 시스템 컨트롤러 지원 애플릿(nn::hid::ShowControllerSupport) 대체 규칙 [설계: docs/shell/setplayer.md 9.4].
 */
import { PAD } from '../mgmcommon';
import type { ControllerInput } from './types';

/** 플레이어 번호(pid 0..3) ↔ 컨트롤러 id */
export class ControllerPool {
  readonly assign: (string | null)[] = [null, null, null, null];
  /** SetNumberOfGameControllerPlayers(min, max) */
  min = 1;
  max = 1;

  constructor(private readonly connected: () => readonly string[]) {}

  setPlayers(min: number, max: number): void {
    this.min = min;
    this.max = max;
  }

  isConnected(id: string | null): boolean {
    return id !== null && this.connected().includes(id);
  }

  /** IsMinimalGameControllerAssigned: 칸 0..min−1 모두 연결된 컨트롤러가 있다 */
  minimal(): boolean {
    for (let p = 0; p < this.min; p++) if (!this.isConnected(this.assign[p])) return false;
    return true;
  }

  pidOf(id: string, upTo = 4): number {
    for (let p = 0; p < upTo; p++) if (this.assign[p] === id) return p;
    return -1;
  }

  /** 끊긴 컨트롤러를 칸에서 뺀다 */
  prune(): void {
    for (let p = 0; p < 4; p++) if (this.assign[p] !== null && !this.isConnected(this.assign[p])) this.assign[p] = null;
  }
}

export type AppletState = 'open' | 'ok' | 'cancel';

/**
 * 대체 애플릿 [설계 9.4]: 칸 1..count. 칸에 없는 컨트롤러가 A → 첫 빈 칸, 칸 2.. 의 컨트롤러가 B → 빠짐,
 * 1P 컨트롤러가 B → 취소, 모두 찬 뒤 1P 가 A → 확인. 컨트롤러는 목록 순서대로 처리한다.
 */
export class ControllerApplet {
  state: AppletState = 'open';

  constructor(
    readonly pool: ControllerPool,
    readonly count: number,
  ) {
    pool.prune();
  }

  full(): boolean {
    for (let p = 0; p < this.count; p++) if (this.pool.assign[p] === null) return false;
    return true;
  }

  step(input: ControllerInput): void {
    if (this.state !== 'open') return;
    this.pool.prune();
    for (const c of input.list()) {
      const t = input.poll(c.id).trig;
      if (!t) continue;
      const p = this.pool.pidOf(c.id, this.count);
      if (p < 0) {
        if (t & PAD.A) {
          const empty = this.pool.assign.findIndex((v, i) => i < this.count && v === null);
          if (empty >= 0) {
            const old = this.pool.pidOf(c.id);
            if (old >= 0) this.pool.assign[old] = null;
            this.pool.assign[empty] = c.id;
          }
        }
        continue;
      }
      if (p === 0) {
        if (t & PAD.B) {
          this.state = 'cancel';
          return;
        }
        if (t & PAD.A && this.full()) {
          this.state = 'ok';
          return;
        }
      } else if (t & PAD.B) this.pool.assign[p] = null;
    }
  }
}
