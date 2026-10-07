/**
 * 온라인 화면 묶음 — 흐름(순수) + 어댑터 + 그리기. 한 틱 순서 [설계, online.md 9.4]:
 * 입력 → 어댑터 시간 진행·사건 받기 → 부품 갱신(수명·입력) → 흐름 파이버 → 레이아웃 애니.
 */
import { FiberRunner } from '../mgmcommon/fiber';
import { MgmInput, type MgmPlayer } from '../mgmcommon/input';
import type { MgmSound } from '../mgmcommon/sound';
import type { MgmPadSource, MgmSpec } from '../mgmcommon/types';
import type { MgmDrawHost } from '../mgmcommon/window';
import { OnlineFlow, type OnlineEntry } from './flow';
import type { OEv, OIO } from './panels';
import type { OnlineAdapter, OnlineSelf, RoomMember } from './types';
import { OnlineView } from './view';

export const ONLINE_PART = '../online/online.json';
export const ONLINE_FACES = '../mgm01/faces.json';

export interface OnlineExtra {
  texts: Record<string, string>;
  msgAttr: MgmSpec['msgAttr'];
  sounds: Record<string, { file: string; gain: number }>;
}

/** online.json 의 문구·메시지 속성·소리를 공용 명세에 더한다(같은 이름은 공용 쪽을 남김) */
export function applyOnlineExtra(spec: MgmSpec, extra: OnlineExtra): void {
  for (const [k, v] of Object.entries(extra.texts)) if (!(k in spec.texts)) spec.texts[k] = v;
  for (const [k, v] of Object.entries(extra.msgAttr)) if (!(k in spec.msgAttr)) spec.msgAttr[k] = v;
  for (const [k, v] of Object.entries(extra.sounds)) if (!(k in spec.sounds)) spec.sounds[k] = v;
}

export interface OnlineScreenOptions {
  host: MgmDrawHost;
  net: OnlineAdapter;
  self: OnlineSelf;
  pads: MgmPadSource;
  entry: OnlineEntry;
  firstOnline?: boolean;
  sound?: MgmSound;
  matchingTime?: number;
  onNote?(text: string): void;
}

export class OnlineScreen {
  readonly input: MgmInput;
  readonly view: OnlineView;
  readonly flow: OnlineFlow;
  readonly net: OnlineAdapter;
  private readonly runner = new FiberRunner();
  readonly notes: string[] = [];
  private shownMembers: RoomMember[] | null = null;
  frame = 0;

  constructor(o: OnlineScreenOptions) {
    this.net = o.net;
    const players = (): MgmPlayer[] => Array.from({ length: Math.max(1, o.self.humans) }, (_, pid) => ({ pid, type: 0 }));
    this.input = new MgmInput(o.pads, players);
    this.view = new OnlineView(
      o.host,
      (label) => o.sound?.playSe(label),
      (t) => {
        this.notes.push(t);
        o.onNote?.(t);
      },
    );
    const sink = { push: (e: OEv): void => this.view.push(e) };
    this.flow = new OnlineFlow({ ev: sink, net: o.net, self: o.self, firstOnline: !!o.firstOnline, matchingTime: o.matchingTime });
    this.runner.start(this.flow.run(o.entry));
  }

  get finished(): boolean {
    return this.flow.finished;
  }

  tick(dt: number): void {
    this.frame++;
    this.input.update();
    this.flow.dt = dt;
    this.net.tick?.(dt);
    for (const e of this.net.poll()) this.flow.onEvent(e);
    const io: OIO = { trig: this.input.trig(), rep: this.input.rep(), hold: this.input.hold(), done: (l, p) => this.view.done(l, p) };
    const f = this.flow;
    f.io = io;
    const modal = f.dialog.working || f.keypad.working;
    const none: OIO = { trig: 0, rep: 0, hold: 0, done: io.done };
    f.dialog.update(io);
    f.keypad.update(f.dialog.working ? none : io);
    const pio = modal ? none : io;
    f.netMenu.update(pio);
    f.opponent.update(pio);
    f.info.update(pio);
    f.lobby.update(pio, f.lobbyState());
    for (const life of [f.roomType.life, f.list.life, f.loading.life, f.timer.life, f.members.life]) life.update(io);
    if (modal) f.io = none;
    this.runner.step();
    f.io = io;
    if (f.members.members !== this.shownMembers) {
      this.shownMembers = f.members.members;
      this.view.setMembers(f.members.members);
    }
    this.view.update(dt);
  }

  draw(): void {
    this.view.draw((i) => this.flow.members.slot(i));
  }

  summary(): Record<string, unknown> {
    const f = this.flow;
    const r = f.room;
    return {
      step: f.step,
      result: f.result,
      room: r ? { id: r.id, size: r.size, password: r.password ? '****' : '', host: r.host, members: r.members.map((m) => `${m.name}(${m.chara})${m.ready ? '' : '…'}${m.host ? ' 방장' : ''}`) } : null,
      rooms: f.rooms.map((x) => `${x.id} ${x.host} ${x.members.length}/${x.size}${x.locked ? ' 잠금' : ''}`),
      searchId: f.searchId,
      notices: this.view.notices.slice(-6),
      notes: this.notes.slice(-6),
      history: f.history.slice(-20),
    };
  }
}
