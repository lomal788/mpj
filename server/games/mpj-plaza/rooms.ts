/**
 * 광장 프렌드 매치 방 상태 PlazaRooms — HTTP(찾기·만들기·참가 → 입장 표) + socket(입장 뒤 방 안 메시지). 전송과 분리된 순수 상태(시험이 직접 부른다).
 * 배치·수명·오류: docs/shell/online.md 9.5. 원본 규칙: 5.3(검색 거르기)·5.4(참가 검사)·5.5·5.6.
 */
import { randomBytes } from 'node:crypto';
import { JOIN_TIMEOUT_S, KOOPA, ROOM_ID_LEN, type RoomSize, type RoomSummary } from '@app/common/net/protocol/types';
import {
  decCreate,
  decJoin,
  decSearch,
  decSearchId,
  encError,
  encJoined,
  encRooms,
  encRoom,
  encSimple,
  encStationMsg,
  encTicket,
  MSG,
  relay,
  TICKET,
  TOKEN_BYTES,
  toBytes,
  type WirePlayer,
  type WireStation,
} from '@app/common/net/protocol/wire';

/** 연결 하나에 보내기(volatile = 밀리면 버려도 되는 위치) */
export type Send = (bytes: Uint8Array, volatile: boolean) => void;

interface Conn {
  station: number;
  send: Send;
  kick: () => void;
  room: Room | null;
  players: WirePlayer[];
  host: boolean;
  ready: boolean;
  openedAt: number;
}

interface Room {
  id: string;
  size: RoomSize;
  password: string;
  entryOpen: boolean;
  started: boolean;
  members: Conn[];
  hostName: string;
  createdAt: number;
}

interface Ticket {
  room: Room;
  players: WirePlayer[];
  host: boolean;
  at: number;
}

export interface PlazaRoomsOptions {
  now?: () => number;
  random?: () => number;
  token?: () => Uint8Array;
  timeout?: number;
  log?: (s: string) => void;
}

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export class PlazaRooms {
  readonly rooms = new Map<string, Room>();
  readonly conns = new Map<number, Conn>();
  private readonly tickets = new Map<string, Ticket>();
  private seq = 0;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly token: () => Uint8Array;
  private readonly timeout: number;
  /** 바이트 수 집계(시험·status) */
  readonly bytes = { in: 0, out: 0, http: 0 };

  constructor(private readonly opt: PlazaRoomsOptions = {}) {
    this.now = opt.now ?? (() => performance.now() / 1000);
    this.random = opt.random ?? Math.random;
    this.token = opt.token ?? (() => new Uint8Array(randomBytes(TOKEN_BYTES)));
    this.timeout = opt.timeout ?? JOIN_TIMEOUT_S;
  }

  private log(s: string): void {
    this.opt.log?.(s);
  }

  private players(r: Room): number {
    let n = r.members.reduce((a, m) => a + m.players.length, 0);
    for (const t of this.tickets.values()) if (t.room === r) n += t.players.length;
    return n;
  }

  private summary(r: Room): RoomSummary {
    return { id: r.id, host: r.hostName, size: r.size, members: r.members.flatMap((m) => m.players.map((p) => p.chara)), locked: r.password !== '' };
  }

  /** 검색 거르기 = 열린 방, 방장 입장함, 0 < 사람 < 최대 [판독 GetSessionIndexList] */
  private visible(size: RoomSize, id = ''): RoomSummary[] {
    const out: RoomSummary[] = [];
    for (const r of this.rooms.values()) {
      if (r.size !== size || !r.entryOpen || r.started || r.members.length === 0) continue;
      const n = this.players(r);
      if (n >= r.size) continue;
      if (id && r.id !== id) continue;
      out.push(this.summary(r));
    }
    return out;
  }

  private newRoomId(): string {
    const lo = 10 ** (ROOM_ID_LEN - 1);
    for (;;) {
      const id = String(lo + Math.floor(this.random() * 9 * lo));
      if (!this.rooms.has(id)) return id;
    }
  }

  private ticket(room: Room, players: WirePlayer[], host: boolean): Uint8Array {
    const tok = this.token();
    this.tickets.set(hex(tok), { room, players, host, at: this.now() + this.timeout });
    return encTicket(TICKET.OK, room.id, tok);
  }

  /** HTTP 한 건 — op = 경로 끝(search·search-id·create·join), 본문·응답 바이너리. 모르는 op 는 null */
  http(op: string, body: Uint8Array): Uint8Array | null {
    this.bytes.http += body.length;
    let out: Uint8Array | null;
    try {
      out = this.httpImpl(op, body);
    } catch {
      out = op === 'create' || op === 'join' ? encTicket(TICKET.MISSED) : op.startsWith('search') ? encRooms([]) : null;
    }
    if (out) this.bytes.http += out.length;
    return out;
  }

  private httpImpl(op: string, body: Uint8Array): Uint8Array | null {
    switch (op) {
      case 'search': {
        const q = decSearch(body);
        let rooms = this.visible(q.size === 8 ? 8 : 4);
        if (q.size === -1 && rooms.length === 0 && q.humans === 1) rooms = this.visible(8);
        return encRooms(rooms);
      }
      case 'search-id': {
        const q = decSearchId(body);
        let rooms = this.visible(4, q.id);
        if (rooms.length === 0 && q.humans === 1) rooms = this.visible(8, q.id);
        return encRooms(rooms);
      }
      case 'create': {
        const q = decCreate(body);
        const size: RoomSize = q.size === 8 ? 8 : 4;
        if (q.players.length === 0 || (size === 8 && (q.players.length > 1 || q.players.some((p) => p.chara === KOOPA)))) return encTicket(TICKET.MEMBERS);
        const r: Room = { id: this.newRoomId(), size, password: q.password, entryOpen: true, started: false, members: [], hostName: q.players[0].name, createdAt: this.now() };
        this.rooms.set(r.id, r);
        this.log(`create ${r.id} ${size}${r.password ? ' pw' : ''}`);
        return this.ticket(r, q.players, true);
      }
      case 'join': {
        const q = decJoin(body);
        const r = this.rooms.get(q.id);
        if (!r || !r.entryOpen || r.started || r.members.length === 0 || q.players.length === 0) return encTicket(TICKET.MISSED);
        if (r.password !== '' && r.password !== q.password) return encTicket(TICKET.PASSWORD);
        if (this.players(r) + q.players.length > r.size || (r.size === 8 && q.players.length > 1)) return encTicket(TICKET.FULL);
        const used = new Set([...r.members.flatMap((m) => m.players), ...[...this.tickets.values()].filter((t) => t.room === r).flatMap((t) => t.players)].map((p) => p.chara));
        if (q.players.some((p) => used.has(p.chara) || (r.size === 8 && p.chara === KOOPA))) return encTicket(TICKET.MEMBERS);
        return this.ticket(r, q.players, false);
      }
      default:
        return null;
    }
  }

  // ── socket ──
  open(send: Send, kick: () => void): number {
    const station = (++this.seq & 0xffff) || ++this.seq;
    this.conns.set(station, { station, send, kick, room: null, players: [], host: false, ready: false, openedAt: this.now() });
    return station;
  }

  private out(c: Conn, b: Uint8Array, volatile = false): void {
    this.bytes.out += b.length;
    c.send(b, volatile);
  }

  private others(r: Room, from: Conn | null, b: Uint8Array, volatile = false): void {
    for (const m of r.members) if (m !== from) this.out(m, b, volatile);
  }

  private wireStation(c: Conn): WireStation {
    return { station: c.station, host: c.host, ready: c.ready, players: c.players };
  }

  private leave(c: Conn, why: string): void {
    const r = c.room;
    if (!r) return;
    r.members = r.members.filter((m) => m !== c);
    c.room = null;
    if ((c.host || why === 'dissolve') && !r.started) {
      for (const m of r.members) {
        m.room = null;
        this.out(m, encSimple(MSG.DISSOLVED));
      }
      r.members = [];
    } else this.others(r, c, encStationMsg(MSG.LEFT, c.station));
    if (r.members.length === 0) this.drop(r);
    this.log(`${c.station} ${why} ${r.id} (${r.members.length})`);
  }

  private drop(r: Room): void {
    this.rooms.delete(r.id);
    for (const [k, t] of this.tickets) if (t.room === r) this.tickets.delete(k);
  }

  close(station: number): void {
    const c = this.conns.get(station);
    if (!c) return;
    this.leave(c, 'close');
    this.conns.delete(station);
  }

  /** socket 메시지 한 건(첫 바이트 = 종류) */
  message(station: number, raw: unknown): void {
    const c = this.conns.get(station);
    if (!c) return;
    const b = toBytes(raw);
    this.bytes.in += b.length;
    if (b.length === 0) return;
    const t = b[0];
    if (!c.room) {
      if (t !== MSG.ENTER || b.length !== 1 + TOKEN_BYTES) return;
      const key = hex(b.subarray(1));
      const k = this.tickets.get(key);
      this.tickets.delete(key);
      if (!k || k.at < this.now() || !this.rooms.has(k.room.id) || (!k.host && !k.room.entryOpen)) {
        this.out(c, encError(3));
        c.kick();
        return;
      }
      const r = k.room;
      c.room = r;
      c.players = k.players;
      c.host = k.host;
      c.ready = k.host;
      r.members.push(c);
      this.out(c, encRoom({ me: c.station, id: r.id, size: r.size, entryOpen: r.entryOpen, password: r.password, stations: r.members.map((m) => this.wireStation(m)) }));
      if (!k.host) this.others(r, c, encJoined(this.wireStation(c)));
      this.log(`${c.station} enter ${r.id} (${r.members.length})`);
      return;
    }
    const r = c.room;
    switch (t) {
      case MSG.READY:
        if (c.ready) return;
        c.ready = true;
        this.others(r, c, encStationMsg(MSG.MEMBER_READY, c.station));
        break;
      case MSG.LEAVE:
        this.leave(c, 'leave');
        break;
      case MSG.DISSOLVE:
        if (c.host) this.leave(c, 'dissolve');
        break;
      case MSG.START: {
        if (!c.host || r.started) return;
        if (r.members.filter((m) => m.ready).length < 2) {
          this.out(c, encError(9));
          return;
        }
        r.entryOpen = false;
        r.started = true;
        for (const [k, tk] of this.tickets) if (tk.room === r) this.tickets.delete(k);
        this.others(r, null, encSimple(MSG.STARTED));
        this.log(`${c.station} start ${r.id} (${r.members.length})`);
        break;
      }
      case MSG.INFO:
        if (b.length === 10 && b[1] < c.players.length) this.others(r, c, relay(b, c.station));
        break;
      case MSG.STAMP:
        if (b.length === 3 && b[1] < c.players.length) this.others(r, c, relay(b, c.station));
        break;
      default:
        break;
    }
  }

  /** 입장 표 20 s·입장 없는 연결 20 s 정리 */
  tick(): void {
    const t = this.now();
    for (const [k, tk] of this.tickets) {
      if (tk.at > t) continue;
      this.tickets.delete(k);
      if (tk.host && tk.room.members.length === 0) this.drop(tk.room);
    }
    for (const c of this.conns.values()) if (!c.room && t - c.openedAt > this.timeout) c.kick();
  }

  status(): { rooms: number; stations: number; players: number; bytes: { in: number; out: number; http: number } } {
    let players = 0;
    for (const r of this.rooms.values()) players += r.members.reduce((a, m) => a + m.players.length, 0);
    return { rooms: this.rooms.size, stations: this.conns.size, players, bytes: { ...this.bytes } };
  }
}
