/**
 * 광장 원격 플레이어 위치 동기 — ComPlayerUtil::ReceiveMessageImpl(보내기)·PlayerManager::OnReceive(받기). docs/shell/plaza_3d.md §2·§5.1 ⑥.
 * 순수 계산(three 없음). 보간 시간은 [미확정] → 0.2 s 선형·slerp [근사].
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** 보내는 간격 [판독 fVar9 = 0.2] */
export const SEND_INTERVAL = 0.2;
/** 움직임 문턱: 속도 4성분 제곱합 > 0.1 [판독] */
export const MOVE_SPEED2 = 0.1;
/** 순간이동 거리 [판독] */
export const TELEPORT_DIST = 5;
/** 회전만 거리 [판독] */
export const ROTATE_ONLY_DIST = 1;
/** 보간 시간 [근사] */
export const INTERP_SEC = 0.2;
/** 보내는 로컬 슬롯 상한(+0x28 < 4) [판독] */
export const SEND_SLOTS = 4;

/** 로컬 슬롯 하나의 보내기 타이머 */
export class RemoteSender {
  timer = 0;
  constructor(readonly slot: number) {}

  /** 매 프레임. 보낼 차례면 true(부르는 쪽이 sendPlayerInfo) */
  step(dt: number, vel: readonly number[]): boolean {
    if (this.slot >= SEND_SLOTS) return false;
    if (this.timer <= 0) {
      this.timer = 0;
      const s2 = vel.reduce((a, v) => a + v * v, 0);
      if (s2 <= MOVE_SPEED2) return false;
      this.timer = SEND_INTERVAL;
      return true;
    }
    this.timer -= dt;
    return false;
  }
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb: Quat = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (bb[i] - v) * t) as Quat;
    const l = Math.hypot(...q);
    return q.map((v) => v / l) as Quat;
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb) as Quat;
}

export type RemoteMode = 'spawn' | 'teleport' | 'rotate' | 'interp';

/** 원격 플레이어 하나(스테이션·슬롯) — 받은 값을 표시 위치로 */
export class RemoteActor {
  pos: Vec3;
  quat: Quat;
  mode: RemoteMode = 'spawn';
  private from: { pos: Vec3; quat: Quat } | null = null;
  private to: { pos: Vec3; quat: Quat } | null = null;
  private t = 0;
  constructor(
    readonly station: string,
    readonly slot: number,
    readonly chara: number,
    pos: Vec3,
    quat: Quat,
  ) {
    this.pos = [...pos];
    this.quat = [...quat];
  }

  /** OnReceive: 거리 > 5 순간이동, ≤ 1 회전만, 사이 = 위치·회전 보간 [판독] */
  receive(pos: Vec3, quat: Quat): RemoteMode {
    const d = dist(this.pos, pos);
    if (d > TELEPORT_DIST) {
      this.pos = [...pos];
      this.quat = [...quat];
      this.to = null;
      this.mode = 'teleport';
    } else if (d <= ROTATE_ONLY_DIST) {
      this.from = { pos: [...this.pos], quat: [...this.quat] };
      this.to = { pos: [...this.pos], quat: [...quat] };
      this.t = 0;
      this.mode = 'rotate';
    } else {
      this.from = { pos: [...this.pos], quat: [...this.quat] };
      this.to = { pos: [...pos], quat: [...quat] };
      this.t = 0;
      this.mode = 'interp';
    }
    return this.mode;
  }

  /** 수평 속도(m/s, 걷기·달리기 모션 고르기용 — 부르는 쪽) */
  speed = 0;

  step(dt: number): void {
    if (!this.from || !this.to) {
      this.speed = 0;
      return;
    }
    const before = this.pos;
    this.t = Math.min(1, this.t + dt / INTERP_SEC);
    const k = this.t;
    this.pos = this.from.pos.map((v, i) => v + (this.to!.pos[i] - v) * k) as Vec3;
    this.quat = slerp(this.from.quat, this.to.quat, k);
    this.speed = dt > 0 ? Math.hypot(this.pos[0] - before[0], this.pos[2] - before[2]) / dt : 0;
    if (this.t >= 1) {
      this.from = null;
      this.to = null;
    }
  }
}

/** 원격 플레이어 표 (스테이션·슬롯 → RemoteActor) */
export class RemoteTable {
  readonly actors = new Map<string, RemoteActor>();
  key(station: string, slot: number): string {
    return `${station}#${slot}`;
  }
  /** 처음 보는 (스테이션, 슬롯) = 그 캐릭터로 만들고 바로 놓음 [판독] */
  receive(station: string, slot: number, chara: number, pos: Vec3, quat: Quat): { actor: RemoteActor; mode: RemoteMode } {
    const k = this.key(station, slot);
    let a = this.actors.get(k);
    if (!a) {
      a = new RemoteActor(station, slot, chara, pos, quat);
      this.actors.set(k, a);
      return { actor: a, mode: 'spawn' };
    }
    return { actor: a, mode: a.receive(pos, quat) };
  }
  remove(station: string): RemoteActor[] {
    const out: RemoteActor[] = [];
    for (const [k, a] of this.actors)
      if (a.station === station) {
        out.push(a);
        this.actors.delete(k);
      }
    return out;
  }
  step(dt: number): void {
    for (const a of this.actors.values()) a.step(dt);
  }
}
