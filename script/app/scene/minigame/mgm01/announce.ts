/**
 * 잠금 안내(mgm01_mes_announce_00)와 NEW 표시 관찰 — 순수 상태. 목록 화면(listView, 다음 단계)에 끼우는 부품.
 * 근거: docs/shell/mgm01_freeplay.md 6.2(잠금 A·skip)·6.4(잠금·NEW 조건, wait < 누적 rate, NEW 소비 commit)·7(PlayAnnounce 표·AnnounceUpdate in→normal→0.75 s 또는 skip→out)·8.4(NEW 소비 저장).
 */
import { MG_FLAG, type MgmSave, type MgmWork } from '@app/common/ui/contracts';

export const ANNOUNCE_LABEL: readonly (string | null)[] = [null, 'mgm01_ui_announce00', 'mgm01_ui_announce01', 'mgm01_ui_announce02'];
export const ANNOUNCE_HOLD = 0.75;
export const NEW_ICON_WAIT = 12;
export const LOCK_SE = 'SQ_SE_SYS_ERROR';

export type AnnounceEvent = { type: 'text'; label: string } | { type: 'anim'; name: 'in' | 'normal' | 'out' } | { type: 'show'; visible: boolean };

export class AnnounceState {
  phase: 'idle' | 'in' | 'normal' | 'out' = 'idle';
  reason = -1;
  skip = false;
  private t = 0;
  private events: AnnounceEvent[] = [];

  get active(): boolean {
    return this.phase !== 'idle';
  }

  play(reason: number): boolean {
    const label = ANNOUNCE_LABEL[reason] ?? null;
    if (!label) return false;
    this.reason = reason;
    this.skip = false;
    this.t = 0;
    this.phase = 'in';
    this.events.push({ type: 'text', label }, { type: 'show', visible: true }, { type: 'anim', name: 'in' });
    return true;
  }

  input(trig: number): void {
    if (this.active && trig > 1) this.skip = true;
  }

  step(dt: number, animDone: boolean): void {
    switch (this.phase) {
      case 'in':
        if (animDone) {
          this.phase = 'normal';
          this.t = 0;
          this.events.push({ type: 'anim', name: 'normal' });
        }
        break;
      case 'normal':
        this.t = Math.fround(this.t + dt);
        if ((animDone && this.t >= Math.fround(ANNOUNCE_HOLD)) || this.skip) {
          this.phase = 'out';
          this.events.push({ type: 'anim', name: 'out' });
        }
        break;
      case 'out':
        if (animDone) {
          this.phase = 'idle';
          this.events.push({ type: 'show', visible: false });
        }
        break;
    }
  }

  drain(): AnnounceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function isNewIcon(work: MgmWork, id: number, reason: number): boolean {
  return !!work.mg.get(id)?.isNew && reason !== 0;
}

export function consumeNew(work: MgmWork, save: MgmSave, id: number): void {
  const w = work.mg.get(id);
  if (w) w.isNew = false;
  const e = save.minigame(id);
  save.setMinigame(id, { head: e.head, flags: e.flags & ~MG_FLAG.NEW });
}

export function setupPlayData(save: MgmSave, work: MgmWork, ids: readonly number[]): boolean {
  if (save.modeFlags & 0x4) return false;
  for (const id of ids) {
    const w = work.mg.get(id) ?? { isNew: false, unlock: false, favorite: false };
    w.isNew = true;
    w.unlock = true;
    work.mg.set(id, w);
    const e = save.minigame(id);
    save.setMinigame(id, { head: e.head, flags: e.flags | MG_FLAG.NEW });
  }
  save.modeFlags |= 0x4;
  save.requestSave();
  return true;
}

export class NewObserver {
  id = -1;
  index = 0;
  private started = false;
  private acc = 0;

  constructor(readonly wait = NEW_ICON_WAIT) {}

  start(id: number, index: number): void {
    this.id = id;
    this.index = index;
    this.started = true;
    this.acc = 0;
  }

  stop(): void {
    this.started = false;
    this.acc = 0;
  }

  get running(): boolean {
    return this.started;
  }

  get accumulated(): number {
    return this.acc;
  }

  step(rate: number): number | null {
    if (!this.started) return null;
    this.acc = Math.fround(this.acc + rate);
    if (this.wait < this.acc) {
      this.started = false;
      return this.id;
    }
    return null;
  }
}
