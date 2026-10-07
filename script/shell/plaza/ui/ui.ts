/**
 * 광장 2D UI 묶음 — menu00::ComUiMainMenuLayout(하단 파티 줄·장소 텔롭·안내들) + bq::UiStamp + 온라인(OnlineScreen 재사용) + 위치 동기.
 * 근거: docs/shell/plaza_3d.md §5·§5.1. WebGL 없이 도는 상태 묶음(시험 = tools/test_plaza_ui.ts), 그리기는 view.ts.
 * 한 틱 순서 [설계]: 입력 → 어댑터(광장 사건 가르기) → 온라인 화면 → 메인 레이아웃 시작/끝 → 하단 줄·스탬프·텔롭 갱신.
 */
import type { LayoutInst } from '../../charselect/scene2d';
import { IDENTITY, operationPlayerId, type Mat3, type MgmDrawHost, type MgmPadSource, type MgmPlayer, type MgmSound } from '../../mgmcommon';
import { OnlineScreen, type OnlineAdapter, type OnlineEvent, type OnlineSelf, type RoomState } from '../../online';
import { listStamps, stampSe, type PlazaUiExtra } from './data';
import { RemoteSender, RemoteTable, type Quat, type RemoteMode, type Vec3 } from './net';
import { PlayerStatusMgr, type PlayerStatus, type StatusPlayer } from './status';
import { StampBalloon, StampCtrl, type StampEvent, type StampSlot } from './stamp';
import { LocationTelop, OnlineGuide, PopGuide } from './telop';

/** 이 기기 플레이어(PlazaPlayerSetup 의 필요한 부분) */
export interface PlazaUiPlayer {
  slot: number;
  /** PlayerCharacterID 0..21 */
  chara: number;
  isCom: boolean;
  name: string;
}

export type PlazaUiOut =
  | { t: 'friendMenu'; open: boolean }
  | { t: 'stampList'; slot: number; open: boolean }
  | { t: 'remote'; station: string; slot: number; chara: number; pos: Vec3; quat: Quat; mode: RemoteMode; speed: number }
  | { t: 'remoteLeft'; station: string }
  | { t: 'session'; on: boolean }
  | { t: 'se'; label: string }
  | { t: 'vib'; slot: number; label: string };

/** 광장 사건(remoteInfo·stamp)을 온라인 흐름과 나누는 어댑터 대리 [설계] — 온라인 흐름의 inbox 에 광장 사건이 쌓이지 않게 */
export class PlazaNet implements OnlineAdapter {
  readonly plaza: OnlineEvent[] = [];
  constructor(readonly net: OnlineAdapter) {}
  connect(): void {
    this.net.connect();
  }
  isConnected(): boolean {
    return this.net.isConnected();
  }
  disconnect(): void {
    this.net.disconnect();
  }
  createRoom(size: 4 | 8, password: string): void {
    this.net.createRoom(size, password);
  }
  searchRooms(size: 4 | 8 | -1): void {
    this.net.searchRooms(size);
  }
  searchRoomById(id: string): void {
    this.net.searchRoomById(id);
  }
  joinRoom(id: string, password: string): void {
    this.net.joinRoom(id, password);
  }
  leaveRoom(): void {
    this.net.leaveRoom();
  }
  dissolveRoom(): void {
    this.net.dissolveRoom();
  }
  startRoom(): void {
    this.net.startRoom();
  }
  matchmake(): void {
    this.net.matchmake();
  }
  cancelMatchmake(): void {
    this.net.cancelMatchmake();
  }
  room(): RoomState | null {
    return this.net.room();
  }
  poll(): OnlineEvent[] {
    const out: OnlineEvent[] = [];
    for (const e of this.net.poll()) {
      if (e.t === 'remoteInfo' || e.t === 'stamp') this.plaza.push(e);
      else {
        if (e.t === 'memberLeft') this.plaza.push(e);
        out.push(e);
      }
    }
    return out;
  }
  tick(dt: number): void {
    this.net.tick?.(dt);
  }
  sendPlayerInfo(slot: number, chara: number, pos: Vec3, quat: Quat): void {
    this.net.sendPlayerInfo?.(slot, chara, pos, quat);
  }
  sendStamp(slot: number, stamp: number, chara: number): void {
    this.net.sendStamp?.(slot, stamp, chara);
  }
}

export interface PlazaUiOptions {
  host: MgmDrawHost;
  extra: PlazaUiExtra;
  net: OnlineAdapter;
  players: () => readonly PlazaUiPlayer[];
  /** bex 비트(online_page toBex 와 같은 규칙) 이 기기 슬롯별 */
  pads: MgmPadSource;
  sound?: MgmSound;
  selfName?: string;
  firstOnline?: boolean;
}

export class PlazaUi {
  readonly status: PlayerStatusMgr;
  readonly telop: LocationTelop;
  readonly pop: PopGuide;
  readonly onlineGuide: OnlineGuide;
  readonly stamps = new Map<string, StampSlot>();
  readonly remote = new RemoteTable();
  readonly net: PlazaNet;
  online: OnlineScreen | null = null;
  /** ComUiMainMenuLayout +0x28 */
  main = false;
  readonly out: PlazaUiOut[] = [];
  readonly log: string[] = [];
  private readonly senders = new Map<number, RemoteSender>();
  private friendOpen = false;
  private sessionOn = false;
  private decideFriend = false;
  private pads: Map<number, { hold: number; trig: number }> = new Map();
  frame = 0;

  constructor(private readonly o: PlazaUiOptions) {
    this.net = new PlazaNet(o.net);
    this.status = new PlayerStatusMgr(o.host);
    this.status.onChange = (c) => this.onStatusChange(c.added, c.removed);
    this.telop = new LocationTelop(o.host);
    this.pop = new PopGuide(o.host);
    this.onlineGuide = new OnlineGuide(o.host);
  }

  private se(label: string): void {
    this.out.push({ t: 'se', label });
    this.o.sound?.playSe(label);
  }

  /** 이 기기 사람 수(GetHumanPlayerCount) */
  humans(): number {
    return this.o.players().filter((p) => !p.isCom).length;
  }

  /** 조작 플레이어 = GetOperationPlayerId [mgmcommon operationPlayerId 재사용] */
  operator(): number {
    const ps: MgmPlayer[] = this.o.players().map((p) => ({ pid: p.slot, type: p.isCom ? 1 : 0 }));
    return operationPlayerId(ps);
  }

  get room(): RoomState | null {
    return this.online?.flow.room ?? null;
  }

  get inSession(): boolean {
    return !!this.room;
  }

  /** SetPlayers 입력: 오프라인 = 이 기기 플레이어(PlayerID = 슬롯), 온라인 = 방 멤버(데이터 받은 사람만 캐릭터) */
  statusPlayers(): StatusPlayer[] {
    const room = this.room;
    if (!room) return this.o.players().map((p) => ({ pid: p.slot, key: `p${p.slot}`, name: p.name, chara: p.chara, human: !p.isCom, local: true }));
    let localPid = 0;
    return room.members.map((m) => ({ pid: m.local ? localPid++ : -1, key: m.station, name: m.name, chara: m.ready || m.local ? m.chara : -1, human: true, local: m.local }));
  }

  /** ComUiMainMenuLayout::Start [판독 @0x7100074b98] — 하단 줄 Start(+ 대기 텔롭은 온라인 흐름이) */
  startMain(): void {
    if (this.main) return;
    this.main = true;
    const room = this.room;
    this.status.start(room?.size === 8, !!room, () => this.statusPlayers());
    for (const s of this.stamps.values()) s.ctrl?.in(false);
    if (!room) this.onlineGuide.in(this.humans());
    this.log.push(`main:start ${room ? 'online' : 'offline'}`);
  }

  /** ComUiMainMenuLayout::Finish [판독 @0x7100074c0c] — 하단 줄 Finish(+UiStamp::Out)·안내 Out·다가가기 Out */
  finishMain(): void {
    if (!this.main) return;
    this.main = false;
    this.status.finish();
    for (const s of this.stamps.values()) s.ctrl?.out(false);
    this.onlineGuide.out();
    this.pop.out();
    this.telop.out();
    this.log.push('main:finish');
  }

  /** UiStamp::Add/Delete — SetPlayers 가 사람 칸을 만들고 없앨 때, 칸 수 4 일 때만 [판독] */
  private onStatusChange(added: PlayerStatus[], removed: PlayerStatus[]): void {
    for (const s of removed) this.stamps.delete(s.key);
    if (this.status.eight) return;
    const op = this.operator();
    const extra = this.o.extra;
    const items = listStamps(extra.stamps);
    const localHumans = this.humans();
    for (const s of added) {
      const local = s.pid >= 0;
      const ctrl =
        local && s.pid !== op
          ? new StampCtrl(this.o.host, s.pid, s.chara, items, extra.stampShortcuts.menu, localHumans, extra.stamps)
          : null;
      this.stamps.set(s.key, { key: s.key, pid: s.pid, chara: s.chara, remote: !local, balloon: new StampBalloon(this.o.host), ctrl });
      if (ctrl) ctrl.in(false);
    }
  }

  /** 말풍선 보이기(로컬 = SQ_SE_STAMP_%dP, 원격 = SQ_SE_STAMP_PC) [판독 FUN_7100358350·FUN_71003589c0] */
  private showStamp(slot: StampSlot, stamp: number): void {
    const def = this.o.extra.stamps[stamp];
    if (!def) return;
    slot.balloon.play(def, slot.chara);
    this.se(stampSe(slot.pid, slot.remote));
    this.log.push(`stamp ${slot.key} ${stamp}`);
  }

  /** C 갈래 신호: 장소 텔롭 */
  setTelop(area: number, visible: boolean, detail = true): void {
    if (area !== this.telop.area) this.telop.setArea(area);
    this.telop.setVisibleDetail(detail);
    if (visible && this.main) this.telop.in();
    else this.telop.out();
  }

  /** C 갈래 신호: 다가가기 안내(레이아웃 좌표) */
  setPop(visible: boolean, x: number, y: number): void {
    this.pop.show(visible && this.main, x, y);
  }

  /** 로컬 플레이어 위치 보내기(ComPlayerUtil) — 세션·스테이션 ≥ 2 일 때만 */
  sendLocal(dt: number, slot: number, chara: number, vel: readonly number[], pos: Vec3, quat: Quat): boolean {
    let s = this.senders.get(slot);
    if (!s) this.senders.set(slot, (s = new RemoteSender(slot)));
    const room = this.room;
    const go = s.step(dt, vel);
    if (!go || !room || room.members.length < 2) return false;
    this.net.sendPlayerInfo(slot, chara, pos, quat);
    return true;
  }

  private padOf(slot: number): { hold: number; trig: number } {
    return this.pads.get(slot) ?? { hold: 0, trig: 0 };
  }

  private openFriend(): void {
    const self: OnlineSelf = { name: this.o.selfName ?? this.o.players()[0]?.name ?? 'Player', chara: this.o.players()[0]?.chara ?? 0, humans: Math.max(1, this.humans()) };
    const pads: MgmPadSource = {
      poll: (pid: number) => {
        const p = this.padOf(pid);
        const f = this.online?.flow;
        const lobbyIdle = !!f && f.step.startsWith('lobby:') && !f.dialog.working && !f.keypad.working && f.info.life.st === -1;
        const mask = lobbyIdle ? ~0x1 : ~0;
        return { hold: p.hold & mask, trig: p.trig & mask };
      },
    };
    this.online = new OnlineScreen({ host: this.o.host, net: this.net, self, pads, entry: 'friend', firstOnline: this.o.firstOnline, sound: this.o.sound });
    this.log.push('friend:open');
  }

  /** C 갈래 'interact:decide' — 결과 3(친구 매치 오브제 앞 A, 원본 OnlineMenuImpl) 이면 다음 틱에 친구 매치 메뉴 */
  decide(result: number): void {
    if (result === 3) this.decideFriend = true;
  }

  /** 한 틱(1/60 s). pads 는 이 기기 슬롯별 bex 비트 */
  tick(dt: number, pads: Map<number, { hold: number; trig: number }>): void {
    this.frame++;
    this.pads = pads;
    const op = this.operator();
    const opPad = this.padOf(op);
    if (this.online) {
      this.online.tick(dt);
      if (this.online.finished) {
        this.log.push(`friend:end ${this.online.flow.result}`);
        if (!this.online.flow.room) this.online = null;
      }
    } else {
      this.net.tick(dt);
      this.net.poll();
    }
    if (this.decideFriend) {
      this.decideFriend = false;
      if (!this.online && this.humans() < 4) this.openFriend();
    } else if (this.main && !this.online && opPad.trig & 0x8 && this.humans() < 4 && this.onlineGuide.life.st === 1) {
      this.se('SQ_SE_SYS_DECI');
      this.openFriend();
    }
    if (this.inSession !== this.sessionOn) {
      this.sessionOn = this.inSession;
      this.out.push({ t: 'session', on: this.sessionOn });
    }
    const f = this.online?.flow;
    const menuOpen = !!this.online && !(f && f.step.startsWith('lobby:'));
    if (menuOpen !== this.friendOpen) {
      if (!menuOpen) this.wantMain = true;
      this.friendOpen = menuOpen;
      this.out.push({ t: 'friendMenu', open: menuOpen });
    }
    if (this.main && (menuOpen || !this.wantMain || this.status.online !== this.inSession)) this.finishMain();
    else if (!this.main && !menuOpen && this.wantMain && (this.status.finished || this.status.online === this.inSession)) this.startMain();
    if (this.main && this.inSession && this.onlineGuide.life.st >= 0) this.onlineGuide.out();

    for (const e of this.net.plaza.splice(0)) {
      if (e.t === 'remoteInfo') {
        const r = this.remote.receive(e.station, e.slot, e.chara, e.pos, e.quat);
        this.log.push(`remote ${e.station} ${r.mode}`);
      } else if (e.t === 'stamp') {
        const slot = this.stamps.get(e.station);
        if (slot && slot.balloon.finished) this.showStamp(slot, e.stamp);
      } else if (e.t === 'memberLeft') {
        if (this.remote.remove(e.station).length) this.out.push({ t: 'remoteLeft', station: e.station });
      }
    }
    this.remote.step(dt);
    for (const a of this.remote.actors.values())
      this.out.push({ t: 'remote', station: a.station, slot: a.slot, chara: a.chara, pos: [...a.pos], quat: [...a.quat], mode: a.mode, speed: a.speed });

    const df = dt * 60;
    this.status.update(df);
    for (const s of this.stamps.values()) {
      if (s.ctrl && this.main) {
        const p = this.padOf(s.pid);
        const ev: StampEvent[] = [];
        const id = s.ctrl.input(p.trig, p.hold, s.balloon.finished, ev);
        for (const e of ev) {
          if (e.t === 'se') this.se(e.label);
          else if (e.t === 'vib') this.out.push({ t: 'vib', slot: s.pid, label: e.label });
          else if (e.t === 'list') this.out.push({ t: 'stampList', slot: s.pid, open: e.open });
        }
        if (id >= 0) {
          this.showStamp(s, id);
          if (this.room) this.net.sendStamp(s.pid, id, s.chara);
        }
      }
      s.ctrl?.update(df);
      s.balloon.update(df);
    }
    this.telop.update(df);
    this.pop.update(df);
    this.onlineGuide.update(df);
  }

  /** 메인 레이아웃을 켜 둘지(다른 갈래의 'ui:mainLayout' 신호, 기본 켬) */
  wantMain = true;

  /** 그리기 목록(원본 그리기 순위 순: 텔롭 0x400 → 하단 줄 0x700·0x701 → 안내 → 다가가기 0x8800 → 목록 0x90fe → 스탬프 안내·말풍선 0x9100) */
  drawList(): [LayoutInst, Mat3][] {
    const out: [LayoutInst, Mat3][] = [];
    if (this.telop.inst.visible) out.push([this.telop.inst, IDENTITY]);
    out.push(...this.status.drawList());
    if (this.onlineGuide.inst.visible) out.push([this.onlineGuide.inst, IDENTITY]);
    if (this.pop.inst.visible) out.push([this.pop.inst, [1, 0, this.pop.x, 0, 1, this.pop.y]]);
    const at = (s: StampSlot, pane: string): Mat3 | null => {
      const st = this.status.byKey.get(s.key);
      return st && st.inst.visible ? this.status.paneBase(st, pane) : null;
    };
    for (const s of this.stamps.values()) {
      const m = s.ctrl && s.ctrl.list.inst.visible ? at(s, 'x_null_list') : null;
      if (m && s.ctrl) out.push([s.ctrl.list.inst, m]);
    }
    for (const s of this.stamps.values()) {
      const m = s.ctrl && s.ctrl.guide.inst.visible ? at(s, 'x_null_guide') : null;
      if (m && s.ctrl) out.push([s.ctrl.guide.inst, m]);
    }
    for (const s of this.stamps.values()) {
      const m = s.balloon.inst.visible ? at(s, 'x_null_stamp') : null;
      if (m) out.push([s.balloon.inst, m]);
    }
    return out;
  }

  debug(): Record<string, unknown> {
    return {
      main: this.main,
      status: { st: this.status.st, slots: this.status.slots, players: [...this.status.bySlot].map(([i, s]) => `${i}:${s.name}(${s.chara})`) },
      stamps: [...this.stamps.values()].map((s) => ({ key: s.key, ctrl: s.ctrl ? { list: s.ctrl.list.st, guide: s.ctrl.guide.st } : null, balloon: s.balloon.st })),
      telop: { area: this.telop.area, st: this.telop.life.st },
      pop: this.pop.st,
      online: this.online ? this.online.summary() : null,
      remote: [...this.remote.actors.values()].map((a) => `${a.station}:${a.mode}`),
      log: this.log.slice(-20),
    };
  }
}
