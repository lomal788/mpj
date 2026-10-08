/**
 * 방 서버 바이너리 배치 — HTTP 본문·socket.io 메시지(서버·클라이언트 공용). 표·크기: docs/shell/online.md 9.5. 리틀 엔디언, JSON 없음.
 */
import type { CardData, CardSticker, RoomSize, RoomSummary } from './types';

/** socket.io 네임스페이스·이벤트(ddalkkakrider 처럼 게임 id = 네임스페이스) */
export const PLAZA_GAME = 'mpj-plaza';
export const WIRE_EVENT = 'm';
export const API_BASE = `/api/v1/${PLAZA_GAME}`;
export const TOKEN_BYTES = 16;
export const NAME_MAX = 32;

/** socket 메시지 종류(첫 바이트) */
export const MSG = {
  ENTER: 0x01,
  READY: 0x02,
  LEAVE: 0x03,
  DISSOLVE: 0x04,
  START: 0x05,
  INFO: 0x10,
  STAMP: 0x11,
  ROOM: 0x81,
  JOINED: 0x82,
  MEMBER_READY: 0x83,
  LEFT: 0x84,
  DISSOLVED: 0x85,
  STARTED: 0x86,
  ERROR: 0x87,
  REMOTE_INFO: 0x90,
  REMOTE_STAMP: 0x91,
} as const;

/** HTTP 표 응답 상태 */
export const TICKET = { OK: 0, MISSED: 1, FULL: 2, PASSWORD: 3, MEMBERS: 4 } as const;
export const TICKET_REASON = ['', 'missed', 'full', 'password', 'members'] as const;
/** 위치 양자화 배율(1/256 m) */
export const POS_SCALE = 256;

export interface WirePlayer {
  chara: number;
  name: string;
  card: Omit<CardData, 'id' | 'name'>;
}
export interface WireStation {
  station: number;
  host: boolean;
  ready: boolean;
  players: WirePlayer[];
}
export interface WireRoom {
  me: number;
  id: string;
  size: RoomSize;
  entryOpen: boolean;
  password: string;
  stations: WireStation[];
}
export interface WireInfo {
  slot: number;
  pos: [number, number, number];
  yaw: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class Writer {
  private buf = new Uint8Array(64);
  private dv = new DataView(this.buf.buffer);
  n = 0;
  private need(k: number): void {
    if (this.n + k <= this.buf.length) return;
    const b = new Uint8Array(Math.max(this.buf.length * 2, this.n + k));
    b.set(this.buf);
    this.buf = b;
    this.dv = new DataView(b.buffer);
  }
  u8(v: number): this {
    this.need(1);
    this.dv.setUint8(this.n, v & 0xff);
    this.n += 1;
    return this;
  }
  i8(v: number): this {
    this.need(1);
    this.dv.setInt8(this.n, v);
    this.n += 1;
    return this;
  }
  u16(v: number): this {
    this.need(2);
    this.dv.setUint16(this.n, v & 0xffff, true);
    this.n += 2;
    return this;
  }
  i16(v: number): this {
    this.need(2);
    this.dv.setInt16(this.n, Math.max(-32768, Math.min(32767, Math.round(v))), true);
    this.n += 2;
    return this;
  }
  u32(v: number): this {
    this.need(4);
    this.dv.setUint32(this.n, v >>> 0, true);
    this.n += 4;
    return this;
  }
  bytes(b: Uint8Array): this {
    this.need(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
    return this;
  }
  str(s: string): this {
    let b = enc.encode(s);
    if (b.length > NAME_MAX) {
      let cut = NAME_MAX;
      while (cut > 0 && (b[cut] & 0xc0) === 0x80) cut--;
      b = b.subarray(0, cut);
    }
    return this.u8(b.length).bytes(b);
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.n);
  }
}

export class Reader {
  private readonly dv: DataView;
  n = 0;
  constructor(readonly b: Uint8Array) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get left(): number {
    return this.b.length - this.n;
  }
  private at(k: number): number {
    if (this.n + k > this.b.length) throw new Error('wire: 짧은 메시지');
    const i = this.n;
    this.n += k;
    return i;
  }
  u8(): number {
    return this.dv.getUint8(this.at(1));
  }
  i8(): number {
    return this.dv.getInt8(this.at(1));
  }
  u16(): number {
    return this.dv.getUint16(this.at(2), true);
  }
  i16(): number {
    return this.dv.getInt16(this.at(2), true);
  }
  u32(): number {
    return this.dv.getUint32(this.at(4), true);
  }
  bytes(k: number): Uint8Array {
    const i = this.at(k);
    return this.b.slice(i, i + k);
  }
  str(): string {
    const k = this.u8();
    return dec.decode(this.bytes(k));
  }
}

/** socket.io·fetch 가 넘기는 바이너리(Buffer·ArrayBuffer·뷰) → Uint8Array */
export function toBytes(x: unknown): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new Error('wire: 바이너리가 아님');
}

const pwOut = (w: Writer, pw: string): void => {
  const ok = /^\d{4}$/.test(pw);
  w.u8(ok ? 1 : 0).u16(ok ? Number(pw) : 0);
};
const pwIn = (r: Reader): string => {
  const has = r.u8();
  const v = r.u16();
  return has ? String(v).padStart(4, '0') : '';
};

export function writeProfile(w: Writer, players: readonly WirePlayer[]): void {
  w.u8(players.length);
  for (const p of players) {
    w.u8(p.chara).str(p.name).i16(p.card.achievement).u8(p.card.rank).u32(p.card.time).u8(p.card.design).u8(p.card.stickers.length);
    for (const s of p.card.stickers) w.u8(s.id).i16(s.x).i16(s.y).u8(s.rot).u8(s.scale);
  }
}

export function readProfile(r: Reader): WirePlayer[] {
  const n = Math.min(4, r.u8());
  const out: WirePlayer[] = [];
  for (let i = 0; i < n; i++) {
    const chara = r.u8();
    const name = r.str();
    const achievement = r.i16();
    const rank = r.u8();
    const time = r.u32();
    const design = r.u8();
    const ns = r.u8();
    const stickers: CardSticker[] = [];
    for (let k = 0; k < ns; k++) stickers.push({ id: r.u8(), x: r.i16(), y: r.i16(), rot: r.u8(), scale: r.u8() });
    out.push({ chara, name, card: { achievement, rank, time, design, stickers } });
  }
  return out;
}

/** 프로필 한 사람(카드 없으면 빈 카드 기본값) */
export function wirePlayer(name: string, chara: number, card?: CardData): WirePlayer {
  return { chara, name, card: { achievement: card?.achievement ?? -1, rank: card?.rank ?? 0, time: card?.time ?? 0, design: card?.design ?? 0, stickers: card?.stickers ?? [] } };
}

// ── HTTP ──
export const encSearch = (size: RoomSize | -1, humans: number): Uint8Array => new Writer().i8(size).u8(humans).done();
export const decSearch = (b: Uint8Array): { size: number; humans: number } => {
  const r = new Reader(b);
  return { size: r.i8(), humans: r.u8() };
};
export const encSearchId = (id: string, humans: number): Uint8Array => new Writer().u32(Number(id) || 0).u8(humans).done();
export const decSearchId = (b: Uint8Array): { id: string; humans: number } => {
  const r = new Reader(b);
  return { id: String(r.u32()), humans: r.u8() };
};
export function encRooms(rooms: readonly RoomSummary[]): Uint8Array {
  const w = new Writer().u8(rooms.length);
  for (const x of rooms) {
    w.u32(Number(x.id)).u8(x.size).u8(x.locked ? 1 : 0).str(x.host).u8(x.members.length);
    for (const c of x.members) w.u8(c);
  }
  return w.done();
}
export function decRooms(b: Uint8Array): RoomSummary[] {
  const r = new Reader(b);
  const n = r.u8();
  const out: RoomSummary[] = [];
  for (let i = 0; i < n; i++) {
    const id = String(r.u32());
    const size = r.u8() === 8 ? 8 : 4;
    const locked = r.u8() === 1;
    const host = r.str();
    const k = r.u8();
    const members: number[] = [];
    for (let j = 0; j < k; j++) members.push(r.u8());
    out.push({ id, host, size, members, locked });
  }
  return out;
}
export const encCreate = (size: RoomSize, password: string, players: readonly WirePlayer[]): Uint8Array => {
  const w = new Writer().u8(size);
  pwOut(w, password);
  writeProfile(w, players);
  return w.done();
};
export const decCreate = (b: Uint8Array): { size: number; password: string; players: WirePlayer[] } => {
  const r = new Reader(b);
  const size = r.u8();
  const password = pwIn(r);
  return { size, password, players: readProfile(r) };
};
export const encJoin = (id: string, password: string, players: readonly WirePlayer[]): Uint8Array => {
  const w = new Writer().u32(Number(id) || 0);
  pwOut(w, password);
  writeProfile(w, players);
  return w.done();
};
export const decJoin = (b: Uint8Array): { id: string; password: string; players: WirePlayer[] } => {
  const r = new Reader(b);
  const id = String(r.u32());
  const password = pwIn(r);
  return { id, password, players: readProfile(r) };
};
export const encTicket = (status: number, id = '', token?: Uint8Array): Uint8Array =>
  status === TICKET.OK && token ? new Writer().u8(0).u32(Number(id)).bytes(token).done() : new Writer().u8(status).done();
export const decTicket = (b: Uint8Array): { status: number; id: string; token: Uint8Array | null } => {
  const r = new Reader(b);
  const status = r.u8();
  if (status !== TICKET.OK) return { status, id: '', token: null };
  return { status, id: String(r.u32()), token: r.bytes(TOKEN_BYTES) };
};

// ── socket ──
export const encSimple = (t: number): Uint8Array => new Uint8Array([t]);
export const encEnter = (token: Uint8Array): Uint8Array => new Writer().u8(MSG.ENTER).bytes(token).done();
export const encStationMsg = (t: number, station: number): Uint8Array => new Writer().u8(t).u16(station).done();
export const encError = (code: 3 | 4 | 6 | 9): Uint8Array => new Uint8Array([MSG.ERROR, code]);

/** 회전 쿼터니언(Y 축) → yaw rad */
export const yawOfQuat = (q: readonly number[]): number => 2 * Math.atan2(q[1], q[3]);
export const quatOfYaw = (y: number): [number, number, number, number] => [0, Math.sin(y / 2), 0, Math.cos(y / 2)];

export function encInfo(slot: number, pos: readonly number[], yaw: number): Uint8Array {
  const turn = (((yaw / (2 * Math.PI)) % 1) + 1) % 1;
  return new Writer()
    .u8(MSG.INFO)
    .u8(slot)
    .i16(pos[0] * POS_SCALE)
    .i16(pos[1] * POS_SCALE)
    .i16(pos[2] * POS_SCALE)
    .u16(Math.round(turn * 65536))
    .done();
}
/** INFO(0x10, 10 B) 또는 REMOTE_INFO(0x90, 12 B) 읽기 */
export function decInfo(b: Uint8Array): WireInfo & { station: number } {
  const r = new Reader(b);
  const t = r.u8();
  const station = t === MSG.REMOTE_INFO ? r.u16() : -1;
  const slot = r.u8();
  const pos: [number, number, number] = [r.i16() / POS_SCALE, r.i16() / POS_SCALE, r.i16() / POS_SCALE];
  const yaw = (r.u16() / 65536) * 2 * Math.PI;
  return { station, slot, pos, yaw };
}
export const encStamp = (slot: number, stamp: number): Uint8Array => new Uint8Array([MSG.STAMP, slot, stamp]);
export function decStamp(b: Uint8Array): { station: number; slot: number; stamp: number } {
  const r = new Reader(b);
  const t = r.u8();
  const station = t === MSG.REMOTE_STAMP ? r.u16() : -1;
  return { station, slot: r.u8(), stamp: r.u8() };
}
/** 서버 중계: INFO·STAMP 의 종류만 바꾸고 스테이션을 끼운 뒤 나머지 바이트를 그대로 */
export function relay(b: Uint8Array, station: number): Uint8Array {
  const out = new Uint8Array(b.length + 2);
  out[0] = b[0] === MSG.INFO ? MSG.REMOTE_INFO : MSG.REMOTE_STAMP;
  out[1] = station & 0xff;
  out[2] = (station >> 8) & 0xff;
  out.set(b.subarray(1), 3);
  return out;
}

export function writeStation(w: Writer, s: WireStation): void {
  w.u16(s.station).u8((s.host ? 1 : 0) | (s.ready ? 2 : 0));
  writeProfile(w, s.players);
}
export function readStation(r: Reader): WireStation {
  const station = r.u16();
  const f = r.u8();
  return { station, host: !!(f & 1), ready: !!(f & 2), players: readProfile(r) };
}
export function encRoom(room: WireRoom): Uint8Array {
  const w = new Writer().u8(MSG.ROOM).u16(room.me).u32(Number(room.id)).u8(room.size).u8((room.entryOpen ? 1 : 0) | (room.password ? 2 : 0));
  w.u16(room.password ? Number(room.password) : 0).u8(room.stations.length);
  for (const s of room.stations) writeStation(w, s);
  return w.done();
}
export function decRoom(b: Uint8Array): WireRoom {
  const r = new Reader(b);
  r.u8();
  const me = r.u16();
  const id = String(r.u32());
  const size: RoomSize = r.u8() === 8 ? 8 : 4;
  const f = r.u8();
  const pw = r.u16();
  const n = r.u8();
  const stations: WireStation[] = [];
  for (let i = 0; i < n; i++) stations.push(readStation(r));
  return { me, id, size, entryOpen: !!(f & 1), password: f & 2 ? String(pw).padStart(4, '0') : '', stations };
}
export function encJoined(s: WireStation): Uint8Array {
  const w = new Writer().u8(MSG.JOINED);
  writeStation(w, s);
  return w.done();
}
export function decJoined(b: Uint8Array): WireStation {
  const r = new Reader(b);
  r.u8();
  return readStation(r);
}
