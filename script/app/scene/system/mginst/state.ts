import type { MgInstPhase, MgInstPlayer } from './types';

export const MG_INST_READY_MASK = 0x3000;
export const MG_INST_END_WAIT = Math.fround(0.5);
const DT = Math.fround(1 / 60);

export class MgInstState {
  phase: MgInstPhase = 'entering';
  inputAllowed = false;
  readonly players: readonly MgInstPlayer[];
  readonly ready = new Set<number>();
  elapsed = 0;

  constructor(players: readonly MgInstPlayer[]) {
    if (players.length < 1 || players.length > 8 || new Set(players.map(p => p.pid)).size !== players.length)
      throw new Error('mginst: expected 1..8 unique players');
    if (players.some(p => !Number.isInteger(p.pid) || p.pid < 0 || p.pid > 7)) throw new Error('mginst: invalid player id');
    this.players = players.map(p => ({ ...p }));
  }

  setInputAllowed(allowed: boolean): void {
    if (this.phase === 'disposed' || this.phase === 'complete') return;
    this.inputAllowed = allowed;
  }

  setReady(pid: number): void {
    if (this.phase !== 'ready' || !this.inputAllowed) return;
    if (this.players.some(p => p.pid === pid && !p.cpu)) this.ready.add(pid);
  }

  step(triggers: ReadonlyMap<number, number>, introFinished: boolean): void {
    if (this.phase === 'disposed' || this.phase === 'complete') return;
    if (this.phase === 'entering') {
      if (introFinished) this.phase = 'ready';
      return;
    }
    if (this.phase === 'ending') {
      this.elapsed = Math.fround(this.elapsed + DT);
      if (this.elapsed >= MG_INST_END_WAIT) {
        for (const p of this.players) this.ready.add(p.pid);
        this.phase = 'complete';
      }
      return;
    }
    if (!this.inputAllowed) return;
    for (const p of this.players)
      if (!p.cpu && p.local !== false && ((triggers.get(p.pid) ?? 0) & MG_INST_READY_MASK)) this.ready.add(p.pid);
    if (this.players.every(p => p.cpu || this.ready.has(p.pid))) this.phase = 'ending';
  }

  dispose(): void {
    this.phase = 'disposed';
    this.inputAllowed = false;
  }
}
