/**
 * 입력 도우미 — bq::mgm::GetOperationPlayerId / GetInputTrigger / GetInputRepeat (docs/shell/mgm_common.md 6.10).
 * 반복 간격은 원본 bex [미확정] → charselect RepeatGen 24/6f [근사, 9.4].
 */
import { RepeatGen } from '../charselect/state';
import type { MgmPadSource } from './types';

/** bex 비트(6.10 쓰임; 0x4 = X·0x8 = Y 는 online.md 4.9 정정 [판독: 안내 글리프 위치 ↔ 입력 비트], 0x10~0x80 의 버튼 이름은 [추정]) */
export const PAD = {
  A: 0x1,
  B: 0x2,
  BTN4: 0x4,
  BTN8: 0x8,
  X: 0x4,
  Y: 0x8,
  L: 0x10,
  R: 0x20,
  ZL: 0x40,
  ZR: 0x80,
  LEFT: 0x100,
  RIGHT: 0x200,
  DOWN: 0x400,
  UP: 0x800,
  STICK_LEFT: 0x10000,
  STICK_UP: 0x20000,
  STICK_RIGHT: 0x40000,
  STICK_DOWN: 0x80000,
} as const;

export interface MgmPlayer {
  pid: number;
  /** PlayerType: 0 사람, 1 COM */
  type: 0 | 1;
  /** IsLocal(기본 참) */
  local?: boolean;
  /** SessionState(1·2 → 묶음 1·2, 그 밖 → 3) */
  session?: number;
}

/**
 * WorkModule::GetOperationPlayerId(INT_MIN, localOnly, includeOther) — 묶음 0(사람) → 1 → 2 → 3(includeOther 일 때만) 순서로
 * 처음 비지 않은 묶음에서 기억된 조작 플레이어가 있으면 그 사람, 아니면 PlayerID 최소. 모두 비면 −1(원본 abort).
 */
export function operationPlayerId(players: readonly MgmPlayer[], opts: { remembered?: number; localOnly?: boolean; includeOther?: boolean } = {}): number {
  const localOnly = opts.localOnly ?? true;
  const cand = players.filter((p) => !localOnly || p.local !== false);
  const group = (p: MgmPlayer): number => (p.type === 0 ? 0 : p.session === 1 ? 1 : p.session === 2 ? 2 : 3);
  for (let g = 0; g < 4; g++) {
    if (g === 3 && !opts.includeOther) break;
    const list = cand.filter((p) => group(p) === g);
    if (list.length === 0) continue;
    if (opts.remembered !== undefined && list.some((p) => p.pid === opts.remembered)) return opts.remembered;
    return Math.min(...list.map((p) => p.pid));
  }
  return -1;
}

/** 매 프레임 update() 한 번 뒤 조작 플레이어의 누름·반복 비트와 플레이어별 누름 비트를 준다 */
export class MgmInput {
  private reps = new RepeatGen();
  private cur = new Map<number, { hold: number; trig: number }>();
  private op = -1;
  remembered: number | undefined;
  /** 온라인 세션(조작 플레이어 후보를 로컬로 한정하지 않음) */
  online = false;

  constructor(
    private readonly pads: MgmPadSource,
    private readonly players: () => readonly MgmPlayer[],
  ) {}

  update(): void {
    const ps = this.players();
    this.cur.clear();
    for (const p of ps) this.cur.set(p.pid, p.type === 0 ? this.pads.poll(p.pid) : { hold: 0, trig: 0 });
    const op = operationPlayerId(ps, { remembered: this.remembered, localOnly: !this.online });
    if (op !== this.op) this.reps = new RepeatGen();
    this.op = op;
    const c = this.cur.get(op) ?? { hold: 0, trig: 0 };
    this.rep_ = c.trig | this.reps.next(c.hold, c.trig);
  }

  private rep_ = 0;

  get operator(): number {
    return this.op;
  }

  /** GetInputTrigger */
  trig(): number {
    return this.cur.get(this.op)?.trig ?? 0;
  }

  /** GetInputRepeat = 누름 | 반복 */
  rep(): number {
    return this.rep_;
  }

  hold(): number {
    return this.cur.get(this.op)?.hold ?? 0;
  }

  trigOf(pid: number): number {
    return this.cur.get(pid)?.trig ?? 0;
  }

  isCom(pid: number): boolean {
    return this.players().find((p) => p.pid === pid)?.type === 1;
  }
}
