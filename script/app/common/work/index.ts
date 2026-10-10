import { createWork, pushResult, type MgmWork, type MgResultEntry } from './mode';
export * from './mode';

export type MinigameStatus = 'idle' | 'requested' | 'completed' | 'cancelled' | 'failed';
export interface WorkPlayer {
  playerId: number;
  chara: string;
  isCom: boolean;
  comLevel: number;
  teamId: number;
  gamePlay: boolean;
}

export interface FrameResultPort {
  readonly id: number;
  readonly run: number;
  valid(): boolean;
  commit(entry: MgResultEntry): boolean;
  cancel(): boolean;
  fail(): boolean;
}

export class WorkModule<Request extends { id: number }> {
  private serial = 0;
  private active: { run: number; request: Request; status: MinigameStatus; claimed: boolean } | null = null;
  private roster: WorkPlayer[] = [];
  constructor(readonly mode: MgmWork = createWork()) {}

  get player(): readonly Readonly<WorkPlayer>[] { return this.roster.map(p => ({ ...p })); }
  setPlayers(players: readonly WorkPlayer[]): void { this.roster = players.map(p => ({ ...p })); }
  beginMode(): void {
    if (this.active?.status === 'requested') this.active.status = 'cancelled';
    this.active = null;
    Object.assign(this.mode, createWork());
  }
  get game(): Readonly<{ request: Request | null; status: MinigameStatus; run: number; result: MgResultEntry | null }> {
    return { request: this.request, status: this.status, run: this.run, result: this.result };
  }
  get request(): Request | null { return this.active ? structuredClone(this.active.request) : null; }
  get status(): MinigameStatus { return this.active?.status ?? 'idle'; }
  get run(): number { return this.active?.run ?? 0; }
  get result(): MgResultEntry | null {
    if (this.status !== 'completed') return null;
    const entry = this.mode.results.at(-1);
    return entry ? { ...entry, results: [...entry.results] } : null;
  }

  prepare(request: Request): void {
    if (!Number.isInteger(request.id) || request.id < 0) throw new Error('Invalid minigame ID');
    const snapshot = structuredClone(request);
    if (this.active?.status === 'requested') this.active.status = 'cancelled';
    this.active = { run: ++this.serial, request: snapshot, status: 'requested', claimed: false };
  }

  openFrame(): FrameResultPort {
    const active = this.active;
    if (!active || active.status !== 'requested' || active.claimed) throw new Error('Minigame request unavailable');
    active.claimed = true;
    const valid = (): boolean => this.active === active && active.status === 'requested';
    const finish = (status: 'cancelled' | 'failed'): boolean => {
      if (!valid()) return false;
      active.status = status;
      return true;
    };
    return {
      id: active.request.id, run: active.run, valid,
      commit: entry => {
        if (!valid()) return false;
        if (entry.id !== active.request.id || !Number.isInteger(entry.judge) || entry.results.length !== 4 ||
            entry.results.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error('Invalid minigame result');
        const snapshot: MgResultEntry = { id: entry.id, judge: entry.judge, results: [...entry.results] };
        this.mode.round += 1;
        pushResult(this.mode, snapshot);
        active.status = 'completed';
        return true;
      },
      cancel: () => finish('cancelled'), fail: () => finish('failed'),
    };
  }
}
