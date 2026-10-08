/**
 * 메모리 가짜 어댑터 FakeOnline [설계, online.md 9.3] — 실제 네트워크 없이 방 목록·입장·퇴장·오류를 시간차로 흉내 낸다.
 * 시간은 tick(dt) 로만 흐른다(시험 재현). 난수는 시드 고정 xorshift.
 */
import type { ErrorCode, JoinFailReason, OnlineAdapter, OnlineEvent, OnlineSelf, RoomMember, RoomSize, RoomState, RoomSummary } from './types';
import { defaultCard, KOOPA } from './types';

export type FakeError = 'none' | 'connect' | 'join' | 'password' | 'full' | 'dissolve' | 'disconnect' | 'match' | 'timeout';

export interface FakeOptions {
  /** 검색에 나오는 방 수 */
  rooms: number;
  /** 대기실에 다른 사람이 들어오는 간격(초), 0 = 아무도 안 옴 */
  joinInterval: number;
  /** 들어온 사람이 나가는 간격(초), 0 = 안 나감 */
  leaveAfter: number;
  error: FakeError;
  seed: number;
  /** 매칭 걸리는 시간(초) */
  matchSec: number;
  self: OnlineSelf;
  /** 광장: 데이터 받은 원격 멤버가 원을 그리며 걷고 0.2 s 마다 remoteInfo 를 보낸다 [설계, plaza_3d.md §8] */
  remoteMove?: boolean;
  /** 광장: 원격 멤버 하나가 이 간격(초)마다 스탬프를 보낸다(0·없음 = 안 보냄) [설계] */
  stampEvery?: number;
  /** 광장: 걷기를 무대 충돌(MeshCollider 벽 밀어내기 + 지면 스냅)에 맞춘다 — (위치, 수평 이동) → 새 위치. 없으면 원 위 점 그대로 [설계] */
  walk?: (pos: [number, number, number], move: [number, number]) => [number, number, number];
}

/** 원격 걷기 흉내 원 중심(광장 char_start_pos 근처, plaza_3d.md §1.1) [설계] */
export const FAKE_WALK_CENTER: readonly [number, number, number] = [0, -2.36, 25];
/** 메뉴 단축 스탬프 Number 1000·25·13·9 → StampID(stampList 배열 번호) [데이터] */
export const FAKE_STAMPS: readonly number[] = [0, 28, 16, 12];

export const FAKE_NAMES = ['Mia', 'Kenta', 'Soyeon', 'Luca', 'Hana', 'Theo', 'Yuna', 'Riku', 'Jisoo', 'Noah', 'Emma', 'Daichi'];

interface Pending {
  at: number;
  run(): void;
}

export class FakeOnline implements OnlineAdapter {
  private time = 0;
  private connected = false;
  private queue: Pending[] = [];
  private out: OnlineEvent[] = [];
  private cur: RoomState | null = null;
  private rooms: (RoomSummary & { password: string })[] = [];
  private rnd: number;
  private seq = 0;
  private matching = false;
  private sendT = 0;
  private stampT = 0;
  private readonly walkPos = new Map<string, [number, number, number]>();
  readonly log: string[] = [];
  /** 이 기기가 보낸 광장 위치·스탬프(시험 확인용) */
  readonly sent: { t: 'info' | 'stamp'; slot: number; v: number[] }[] = [];

  constructor(readonly opt: FakeOptions) {
    this.rnd = opt.seed >>> 0 || 1;
    this.rooms = this.makeRooms();
  }

  private next(): number {
    let x = this.rnd;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.rnd = x;
    return x / 4294967296;
  }

  private pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)];
  }

  private makeRooms(): (RoomSummary & { password: string })[] {
    const out: (RoomSummary & { password: string })[] = [];
    for (let i = 0; i < this.opt.rooms; i++) {
      const size: RoomSize = i % 3 === 2 ? 8 : 4;
      const n = 1 + Math.floor(this.next() * (size - 1));
      const members: number[] = [];
      while (members.length < n) {
        const c = Math.floor(this.next() * 22);
        if (!members.includes(c) && !(size === 8 && c === KOOPA)) members.push(c);
      }
      const locked = i % 4 === 1;
      out.push({ id: String(100000 + Math.floor(this.next() * 900000)), host: this.pick(FAKE_NAMES), size, members, locked, password: locked ? '1234' : '' });
    }
    return out;
  }

  private at(delay: number, run: () => void): void {
    this.queue.push({ at: this.time + delay, run });
  }

  private emit(e: OnlineEvent): void {
    this.out.push(e);
    this.log.push(`${this.time.toFixed(2)} ${e.t}`);
  }

  private member(chara: number, host: boolean, local: boolean, name?: string): RoomMember {
    const station = `st${++this.seq}`;
    const n = name ?? this.pick(FAKE_NAMES);
    return { station, name: n, chara, host, ready: local, local, card: local && this.opt.self.card ? this.opt.self.card : defaultCard(station, n) };
  }

  private freeChara(room: RoomState): number {
    for (let k = 0; k < 40; k++) {
      const c = Math.floor(this.next() * 22);
      if (room.size === 8 && c === KOOPA) continue;
      if (!room.members.some((m) => m.chara === c)) return c;
    }
    return room.members.length;
  }

  /** 대기실에 시간차로 사람을 들이고(입장 → 0.5 s 뒤 데이터) 필요하면 내보낸다 */
  private scheduleGuests(room: RoomState): void {
    const iv = this.opt.joinInterval;
    if (iv <= 0) return;
    const arrive = (): void => {
      if (this.cur !== room || !room.entryOpen) return;
      if (room.members.length < room.size) {
        const m = this.member(this.freeChara(room), false, false);
        m.ready = false;
        room.members.push(m);
        this.emit({ t: 'memberJoined', member: { ...m } });
        this.at(0.5, () => {
          if (this.cur !== room || !room.members.includes(m)) return;
          m.ready = true;
          this.emit({ t: 'memberReady', station: m.station });
        });
        if (this.opt.leaveAfter > 0)
          this.at(this.opt.leaveAfter, () => {
            if (this.cur !== room || !room.entryOpen) return;
            const i = room.members.indexOf(m);
            if (i < 0) return;
            room.members.splice(i, 1);
            this.emit({ t: 'memberLeft', station: m.station });
          });
      }
      this.at(iv, arrive);
    };
    this.at(iv, arrive);
  }

  private scheduleTrouble(room: RoomState): void {
    if (this.opt.error === 'dissolve' && !room.host)
      this.at(6, () => {
        if (this.cur !== room) return;
        this.cur = null;
        this.emit({ t: 'dissolved' });
      });
    if (this.opt.error === 'disconnect')
      this.at(6, () => {
        if (this.cur !== room) return;
        this.cur = null;
        this.connected = false;
        this.emit({ t: 'error', code: 'B3' });
      });
  }

  connect(): void {
    this.at(0.8, () => {
      if (this.opt.error === 'connect') {
        this.emit({ t: 'connectFailed' });
        return;
      }
      this.connected = true;
      this.emit({ t: 'connected' });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    this.cur = null;
    this.matching = false;
  }

  createRoom(size: RoomSize, password: string): void {
    this.at(0.6, () => {
      const room: RoomState = { id: String(100000 + Math.floor(this.next() * 900000)), size, password, host: true, entryOpen: true, members: [] };
      room.members.push(this.member(this.opt.self.chara, true, true, this.opt.self.name));
      this.cur = room;
      this.emit({ t: 'created', room: structuredClone(room) });
      this.scheduleGuests(room);
      this.scheduleTrouble(room);
    });
  }

  private visible(size: RoomSize): RoomSummary[] {
    return this.rooms.filter((r) => r.size === size && r.members.length > 0 && r.members.length < r.size).map(({ password: _p, ...r }) => ({ ...r, members: [...r.members] }));
  }

  searchRooms(size: RoomSize | -1): void {
    this.at(1.0, () => {
      let rooms = this.visible(size === 8 ? 8 : 4);
      if (size === -1 && rooms.length === 0 && this.opt.self.humans === 1) rooms = this.visible(8);
      this.emit({ t: 'searchDone', rooms });
    });
  }

  searchRoomById(id: string): void {
    this.at(1.0, () => {
      const r = this.rooms.find((x) => x.id === id);
      this.emit({ t: 'searchDone', rooms: r ? this.visible(r.size).filter((x) => x.id === id) : [] });
    });
  }

  joinRoom(id: string, password: string): void {
    this.at(1.0, () => {
      const r = this.rooms.find((x) => x.id === id);
      const fail = (reason: JoinFailReason): void => this.emit({ t: 'joinFailed', reason });
      if (!r || this.opt.error === 'join') return fail('missed');
      if (this.opt.error === 'full' || r.members.length + this.opt.self.humans > r.size) return fail('full');
      if (this.opt.error === 'password' || (r.locked && r.password !== password)) return fail('password');
      const room: RoomState = { id: r.id, size: r.size, password: r.password, host: false, entryOpen: true, members: [] };
      r.members.forEach((c, i) => room.members.push({ ...this.member(c, i === 0, false, i === 0 ? r.host : undefined), ready: true }));
      room.members.push(this.member(this.opt.self.chara, false, true, this.opt.self.name));
      this.cur = room;
      this.emit({ t: 'joined', room: structuredClone(room) });
      this.scheduleGuests(room);
      this.scheduleTrouble(room);
    });
  }

  leaveRoom(): void {
    this.cur = null;
  }

  dissolveRoom(): void {
    this.cur = null;
  }

  startRoom(): void {
    const room = this.cur;
    if (!room) return;
    room.entryOpen = false;
    this.at(1.0, () => {
      if (this.cur !== room) return;
      this.emit({ t: 'started', room: structuredClone(room) });
    });
  }

  matchmake(): void {
    this.matching = true;
    this.at(this.opt.matchSec, () => {
      if (!this.matching) return;
      this.matching = false;
      if (this.opt.error === 'match') {
        this.emit({ t: 'matchFailed' });
        return;
      }
      const room: RoomState = { id: 'match', size: 4, password: '', host: false, entryOpen: false, members: [] };
      room.members.push(this.member(this.opt.self.chara, false, true, this.opt.self.name));
      while (room.members.length < 4) room.members.push({ ...this.member(this.freeChara(room), room.members.length === 1, false), ready: true });
      this.cur = room;
      this.emit({ t: 'matchFound', members: structuredClone(room.members) });
    });
  }

  cancelMatchmake(): void {
    this.matching = false;
  }

  room(): RoomState | null {
    return this.cur ? structuredClone(this.cur) : null;
  }

  poll(): OnlineEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  sendPlayerInfo(slot: number, chara: number, pos: [number, number, number], quat: [number, number, number, number]): void {
    this.sent.push({ t: 'info', slot, v: [chara, ...pos, ...quat] });
  }

  sendStamp(slot: number, stamp: number, chara: number): void {
    this.sent.push({ t: 'stamp', slot, v: [stamp, chara] });
  }

  /** 원격 멤버 걷기·스탬프 흉내(옵션이 켜졌을 때만, 기존 동작·난수 순서 무변경) */
  private plazaFake(dt: number): void {
    const room = this.cur;
    if (!room) return;
    const remote = room.members.filter((m) => !m.local && m.ready);
    if (this.opt.remoteMove) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT += 0.2;
        remote.forEach((m, k) => {
          const r = 3 + k;
          const a = (this.time * 2) / r + k * 1.7;
          let pos: [number, number, number] = [FAKE_WALK_CENTER[0] + Math.cos(a) * r, FAKE_WALK_CENTER[1], FAKE_WALK_CENTER[2] + Math.sin(a) * r];
          const walk = this.opt.walk;
          if (walk) {
            const cur = this.walkPos.get(m.station) ?? walk([...FAKE_WALK_CENTER], [0, 0]);
            const dx = pos[0] - cur[0];
            const dz = pos[2] - cur[2];
            const d = Math.hypot(dx, dz);
            const k2 = d > 0.6 ? 0.6 / d : 1;
            pos = walk(cur, [dx * k2, dz * k2]);
            this.walkPos.set(m.station, pos);
          }
          const yaw = -a;
          this.emit({ t: 'remoteInfo', station: m.station, slot: 0, chara: m.chara, pos, quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] });
        });
      }
    }
    const every = this.opt.stampEvery ?? 0;
    if (every > 0 && remote.length > 0) {
      this.stampT += dt;
      if (this.stampT >= every) {
        this.stampT -= every;
        const m = this.pick(remote);
        this.emit({ t: 'stamp', station: m.station, slot: 0, stamp: this.pick(FAKE_STAMPS), chara: m.chara });
      }
    }
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.opt.remoteMove || this.opt.stampEvery) this.plazaFake(dt);
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at);
      const p = this.queue[0];
      if (!p || p.at > this.time) break;
      this.queue.shift();
      p.run();
    }
    if (this.opt.error === 'timeout' && this.connected && this.time > 4 && !this.cur) {
      this.connected = false;
      this.emit({ t: 'error', code: 'B4' as ErrorCode });
    }
  }

  /** 시험·패널: 검색에 나올 방 목록(패스워드 포함) */
  get fakeRooms(): readonly (RoomSummary & { password: string })[] {
    return this.rooms;
  }
}
