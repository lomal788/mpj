/**
 * 실제 방 서버 어댑터 SocketIoOnline — 방 찾기·만들기·참가는 HTTP(바이너리), 방에 들어가는 순간 socket.io `/mpj-plaza`(바이너리), 나가거나 해산되면 끊는다.
 * 클라이언트 라이브러리는 ddalkkakrider 처럼 서버의 `/socket.io/socket.io.js` 를 script 로 읽고 `io('/<게임 id>', {reconnection, transports})`.
 * 연결 수명·배치·오류 자리: docs/shell/online.md 9.5. 혼자·로컬만이면 아무 통신도 하지 않는다(connect() 는 논리 접속).
 */
import type { CardData, JoinFailReason, OnlineAdapter, OnlineEvent, OnlineSelf, RoomMember, RoomSize, RoomState } from './types';
import { JOIN_TIMEOUT_S } from './types';
import {
  API_BASE,
  decInfo,
  decJoined,
  decRoom,
  decRooms,
  decStamp,
  decTicket,
  encCreate,
  encEnter,
  encInfo,
  encJoin,
  encSearch,
  encSearchId,
  encSimple,
  encStamp,
  MSG,
  PLAZA_GAME,
  quatOfYaw,
  Reader,
  TICKET,
  TICKET_REASON,
  toBytes,
  WIRE_EVENT,
  wirePlayer,
  yawOfQuat,
  type WireRoom,
  type WireStation,
} from './wire';

/** socket.io-client Socket 의 쓰는 부분 */
export interface SioSocket {
  on(ev: string, fn: (...a: unknown[]) => void): unknown;
  emit(ev: string, ...a: unknown[]): unknown;
  disconnect(): unknown;
}
export type SioConnect = (url: string, opts: { reconnection: boolean; transports: string[]; forceNew?: boolean }) => SioSocket;

export interface SocketIoOnlineOptions {
  /** 서버 출처(예 http://127.0.0.1:8787), 빈 값 = 페이지와 같은 출처 */
  base: string;
  self: OnlineSelf;
  /** 시험: socket.io-client io(기본 = 서버 /socket.io/socket.io.js 를 읽은 window.io) */
  io?: SioConnect;
  /** 시험: fetch(기본 전역 fetch) */
  fetch?: typeof fetch;
  timeout?: number;
}

type Pending = 'created' | 'joined';
const CODE = { 3: 'B3', 4: 'B4', 6: 'B6', 9: 'B9' } as const;

let ioLoad: Promise<SioConnect> | null = null;
function loadIo(base: string): Promise<SioConnect> {
  const w = globalThis as unknown as { io?: SioConnect; document?: Document };
  if (w.io) return Promise.resolve(w.io);
  ioLoad ??= new Promise<SioConnect>((resolve, reject) => {
    const doc = w.document;
    if (!doc) return reject(new Error('socket.io 클라이언트 없음'));
    const s = doc.createElement('script');
    s.src = `${base}/socket.io/socket.io.js`;
    s.onload = () => (w.io ? resolve(w.io) : reject(new Error('socket.io 클라이언트 없음')));
    s.onerror = () => {
      ioLoad = null;
      reject(new Error('방 서버가 실행되지 않았습니다.'));
    };
    doc.head.append(s);
  });
  return ioLoad;
}

export class SocketIoOnline implements OnlineAdapter {
  private logical = false;
  private sock: SioSocket | null = null;
  private entered = false;
  private me = -1;
  private cur: RoomState | null = null;
  private out: OnlineEvent[] = [];
  private pending: { kind: Pending; at: number } | null = null;
  private time = 0;
  /** 시험·디버그: 보낸 메시지 바이트 수(종류별)·HTTP 호출 수 */
  readonly stat = { http: 0, httpBytes: 0, sockets: 0, sent: 0, sentBytes: 0, recv: 0, recvBytes: 0 };
  readonly log: string[] = [];

  constructor(readonly opt: SocketIoOnlineOptions) {}

  /** 온라인 흐름이 쓰는 self(캐릭터 다시 고르기가 바꾼다)를 같이 본다 */
  setSelf(self: OnlineSelf): void {
    this.opt.self = self;
  }

  private get limit(): number {
    return this.opt.timeout ?? JOIN_TIMEOUT_S;
  }

  private emit(e: OnlineEvent): void {
    this.out.push(e);
    this.log.push(`${this.time.toFixed(2)} ${e.t}`);
  }

  private profile() {
    const s = this.opt.self;
    const ps = s.players?.length ? s.players : [{ name: s.name, chara: s.chara, card: s.card }];
    return ps.slice(0, 4).map((p, i) => wirePlayer(p.name, i === 0 ? s.chara : p.chara, p.card));
  }

  private async post(op: string, body: Uint8Array): Promise<Uint8Array | null> {
    const f = this.opt.fetch ?? fetch;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.limit * 1000);
    this.stat.http++;
    this.stat.httpBytes += body.length;
    try {
      const r = await f(`${this.opt.base}${API_BASE}/${op}`, { method: 'POST', body: body as BodyInit, headers: { 'Content-Type': 'application/octet-stream' }, signal: ac.signal });
      if (!r.ok) return null;
      const b = new Uint8Array(await r.arrayBuffer());
      this.stat.httpBytes += b.length;
      return b;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  private send(b: Uint8Array): void {
    if (!this.sock) return;
    this.stat.sent++;
    this.stat.sentBytes += b.length;
    this.sock.emit(WIRE_EVENT, b);
  }

  private member(st: WireStation, k: number): RoomMember {
    const p = st.players[k];
    const local = st.station === this.me;
    const card: CardData = { id: `${st.station}#${k}`, name: p.name, ...p.card };
    return { station: String(st.station), slot: k, name: p.name, chara: p.chara, host: st.host && k === 0, ready: st.ready || local, local, card };
  }

  private state(w: WireRoom): RoomState {
    const members = w.stations.flatMap((st) => st.players.map((_, k) => this.member(st, k)));
    return { id: w.id, size: w.size, password: w.password, host: w.stations.some((s) => s.station === w.me && s.host), entryOpen: w.entryOpen, members };
  }

  private fail(kind: Pending): void {
    if (kind === 'created') this.emit({ t: 'createFailed' });
    else this.emit({ t: 'joinFailed', reason: 'missed' });
  }

  /** 소켓 끊기(나가기·해산·오류·광장 나감) */
  private closeSocket(): void {
    const s = this.sock;
    this.sock = null;
    this.entered = false;
    this.me = -1;
    this.pending = null;
    s?.disconnect();
  }

  /** 입장 표로 socket.io 네임스페이스에 들어간다 */
  private async enter(token: Uint8Array, kind: Pending): Promise<void> {
    this.pending = { kind, at: this.time + this.limit };
    let io: SioConnect;
    try {
      io = this.opt.io ?? (await loadIo(this.opt.base));
    } catch {
      this.pending = null;
      this.fail(kind);
      return;
    }
    if (!this.pending) return;
    const s = io(`${this.opt.base}/${PLAZA_GAME}`, { reconnection: true, transports: ['websocket', 'polling'], forceNew: true });
    this.sock = s;
    this.stat.sockets++;
    s.on('connect', () => {
      if (this.sock === s && !this.entered) this.send(encEnter(token));
    });
    s.on(WIRE_EVENT, (data: unknown) => {
      if (this.sock === s) this.receive(toBytes(data));
    });
    s.on('disconnect', () => {
      if (this.sock !== s) return;
      const had = this.entered;
      const p = this.pending;
      this.closeSocket();
      if (had && this.cur) {
        this.cur = null;
        this.emit({ t: 'error', code: 'B3' });
      } else if (p) this.fail(p.kind);
    });
  }

  private receive(b: Uint8Array): void {
    if (b.length === 0) return;
    this.stat.recv++;
    this.stat.recvBytes += b.length;
    switch (b[0]) {
      case MSG.ROOM: {
        const w = decRoom(b);
        this.me = w.me;
        this.entered = true;
        const kind = this.pending?.kind ?? 'joined';
        this.pending = null;
        this.cur = this.state(w);
        this.emit(kind === 'created' ? { t: 'created', room: structuredClone(this.cur) } : { t: 'joined', room: structuredClone(this.cur) });
        if (kind === 'joined') this.send(encSimple(MSG.READY));
        break;
      }
      case MSG.JOINED: {
        const st = decJoined(b);
        if (!this.cur) return;
        for (let k = 0; k < st.players.length; k++) {
          const m = this.member(st, k);
          this.cur.members.push(m);
          this.emit({ t: 'memberJoined', member: { ...m } });
        }
        break;
      }
      case MSG.MEMBER_READY: {
        const st = String(new Reader(b.subarray(1)).u16());
        const ms = this.cur?.members.filter((m) => m.station === st) ?? [];
        for (const m of ms) m.ready = true;
        this.emit({ t: 'memberReady', station: st, card: ms[0]?.card });
        break;
      }
      case MSG.LEFT: {
        const st = String(new Reader(b.subarray(1)).u16());
        if (this.cur) this.cur.members = this.cur.members.filter((m) => m.station !== st);
        this.emit({ t: 'memberLeft', station: st });
        break;
      }
      case MSG.DISSOLVED:
        this.cur = null;
        this.closeSocket();
        this.emit({ t: 'dissolved' });
        break;
      case MSG.STARTED:
        if (!this.cur) return;
        this.cur.entryOpen = false;
        this.emit({ t: 'started', room: structuredClone(this.cur) });
        break;
      case MSG.ERROR: {
        const code = CODE[b[1] as 3 | 4 | 6 | 9] ?? 'B3';
        if (this.pending) {
          const p = this.pending;
          this.closeSocket();
          this.fail(p.kind);
          return;
        }
        if (code === 'B9') {
          this.emit({ t: 'error', code });
          return;
        }
        this.cur = null;
        this.closeSocket();
        this.emit({ t: 'error', code });
        break;
      }
      case MSG.REMOTE_INFO: {
        const x = decInfo(b);
        const st = String(x.station);
        const m = this.cur?.members.find((y) => y.station === st && (y.slot ?? 0) === x.slot);
        if (!m) return;
        this.emit({ t: 'remoteInfo', station: st, slot: x.slot, chara: m.chara, pos: x.pos, quat: quatOfYaw(x.yaw) });
        break;
      }
      case MSG.REMOTE_STAMP: {
        const x = decStamp(b);
        const st = String(x.station);
        const m = this.cur?.members.find((y) => y.station === st && (y.slot ?? 0) === x.slot);
        if (!m) return;
        this.emit({ t: 'stamp', station: st, slot: x.slot, stamp: x.stamp, chara: m.chara });
        break;
      }
      default:
        break;
    }
  }

  /** 논리 접속: 통신하지 않는다(실제 통신은 방 찾기·만들기·참가부터) */
  connect(): void {
    this.logical = true;
    this.emit({ t: 'connected' });
  }

  isConnected(): boolean {
    return this.logical;
  }

  disconnect(): void {
    this.logical = false;
    this.cur = null;
    this.closeSocket();
  }

  createRoom(size: RoomSize, password: string): void {
    void this.post('create', encCreate(size, password, this.profile())).then((b) => {
      const tk = b ? decTicket(b) : null;
      if (!tk || tk.status !== TICKET.OK || !tk.token) return this.emit({ t: 'createFailed' });
      void this.enter(tk.token, 'created');
    });
  }

  searchRooms(size: RoomSize | -1): void {
    void this.post('search', encSearch(size, this.profile().length)).then((b) => this.emit({ t: 'searchDone', rooms: b ? decRooms(b) : [] }));
  }

  searchRoomById(id: string): void {
    void this.post('search-id', encSearchId(id, this.profile().length)).then((b) => this.emit({ t: 'searchDone', rooms: b ? decRooms(b) : [] }));
  }

  joinRoom(id: string, password: string): void {
    void this.post('join', encJoin(id, password, this.profile())).then((b) => {
      const tk = b ? decTicket(b) : null;
      if (!tk || tk.status !== TICKET.OK || !tk.token) return this.emit({ t: 'joinFailed', reason: (TICKET_REASON[tk?.status ?? 1] || 'missed') as JoinFailReason });
      void this.enter(tk.token, 'joined');
    });
  }

  leaveRoom(): void {
    this.send(encSimple(MSG.LEAVE));
    this.cur = null;
    this.closeSocket();
  }

  dissolveRoom(): void {
    this.send(encSimple(MSG.DISSOLVE));
    this.cur = null;
    this.closeSocket();
  }

  startRoom(): void {
    if (!this.cur) return;
    this.cur.entryOpen = false;
    this.send(encSimple(MSG.START));
  }

  /** 전 세계 매칭은 이 서버에서 지원하지 않음 [설계 online.md 9.5] */
  matchmake(): void {
    this.emit({ t: 'matchFailed' });
  }

  cancelMatchmake(): void {}

  room(): RoomState | null {
    return this.cur ? structuredClone(this.cur) : null;
  }

  poll(): OnlineEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  tick(dt: number): void {
    this.time += dt;
    if (this.pending && this.time > this.pending.at) {
      const p = this.pending;
      this.closeSocket();
      this.fail(p.kind);
    }
  }

  /** 방 안일 때만(원본: 세션·스테이션 ≥ 2) */
  sendPlayerInfo(slot: number, _chara: number, pos: [number, number, number], quat: [number, number, number, number]): void {
    if (this.entered && this.cur && this.cur.members.length >= 2) this.send(encInfo(slot, pos, yawOfQuat(quat)));
  }

  sendStamp(slot: number, stamp: number, _chara: number): void {
    if (this.entered && this.cur) this.send(encStamp(slot, stamp));
  }

  get socketOpen(): boolean {
    return !!this.sock;
  }
}
