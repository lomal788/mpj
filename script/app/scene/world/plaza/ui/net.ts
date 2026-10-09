/**
 * 광장 원격 플레이어 위치 동기 — ComPlayerUtil::ReceiveMessageImpl(보내기)·PlayerManager::OnReceive(받기). docs/shell/plaza_3d.md §2·§5.1 ⑥.
 * 순수 계산(three 없음). 받기 표는 수신 목표·(스테이션, 슬롯)·수명만 — 보간·거리 분기는 표시 actor(follow.ts RemoteMotion) 하나가 한다(docs/engine/12_online_sync.md §6.2.1).
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

export type RemoteMode = 'spawn' | 'teleport' | 'rotate' | 'interp';

/** 원격 플레이어 하나(스테이션·슬롯) — 받은 값(표시 actor 의 목표) */
export class RemoteActor {
  pos: Vec3;
  quat: Quat;
  rx = 1;
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

  receive(pos: Vec3, quat: Quat): void {
    this.pos = [...pos];
    this.quat = [...quat];
    this.rx++;
  }
}

/** 원격 플레이어 표 (스테이션·슬롯 → RemoteActor) */
export class RemoteTable {
  readonly actors = new Map<string, RemoteActor>();
  key(station: string, slot: number): string {
    return `${station}#${slot}`;
  }
  /** 처음 보는 (스테이션, 슬롯) = 그 캐릭터로 만들고 바로 놓음 [판독] */
  receive(station: string, slot: number, chara: number, pos: Vec3, quat: Quat): { actor: RemoteActor; first: boolean } {
    const k = this.key(station, slot);
    let a = this.actors.get(k);
    if (!a) {
      a = new RemoteActor(station, slot, chara, pos, quat);
      this.actors.set(k, a);
      return { actor: a, first: true };
    }
    a.receive(pos, quat);
    return { actor: a, first: false };
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
}
