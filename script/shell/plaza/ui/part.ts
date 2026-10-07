/**
 * 광장 D 갈래 부품(PlazaPart 'ui') — 하단 파티 줄·장소 텔롭·다가가기 안내·스탬프·온라인(친구 매치·대기실)·위치 동기를 광장에 붙인다.
 * 계약: ../types.ts(A). 갈래 신호(SHARED 합의, docs/shell/plaza_3d.md §5.1):
 *   듣기 'interact:telop' {area, visible, detail?} · 'interact:decide' {result}(3 = 친구 매치 메뉴) · 'interact:pop' {visible, x, y}(레이아웃 좌표) 또는 {visible, ndc:[x,y]} · 'ui:mainLayout' boolean
 *   내기 'ui:friendMenu' boolean · 'ui:stampList' {slot, open} · 'net:remote' {station, slot, chara 'pcNN', pos, quat, mode, speed} · 'net:remoteLeft' {station} · 'net:session' boolean(방 접속 여부가 바뀔 때)
 * 시험값(URL): online=off 이면 가짜 온라인 없음, join=입장 간격 s(기본 3), stamp=원격 스탬프 간격 s(기본 6), rooms=가짜 방 수(기본 7), first=1.
 */
import { MgmSound } from '../../mgmcommon';
import { applyOnlineExtra, CHARA_PC, FakeOnline, ONLINE_FACES, ONLINE_PART, type OnlineAdapter, type OnlineExtra } from '../../online';
import { PLAZA_BTN, type PlazaActor, type PlazaContext, type PlazaPad, type PlazaPart, type PlazaPartFactory } from '../types';
import { applyPlazaUiExtra, PLAZA_UI_PART, type PlazaUiExtra } from './data';
import type { Quat, Vec3 } from './net';
import { popScreenPos } from './telop';
import { PlazaUi, type PlazaUiPlayer } from './ui';
import { PlazaUiView } from './view';

const STICK_ON = 0.5;
const DT = Math.fround(1 / 60);

/** PlazaPad(NPAD 비트·스틱 −1..1) → bex 비트(online_page toBex 와 같은 규칙) */
export function padToBex(p: PlazaPad | null): number {
  if (!p) return 0;
  let b = 0;
  const m: [number, number][] = [
    [PLAZA_BTN.A, 0x1],
    [PLAZA_BTN.B, 0x2],
    [PLAZA_BTN.X, 0x4],
    [PLAZA_BTN.Y, 0x8],
    [PLAZA_BTN.L, 0x10],
    [PLAZA_BTN.R, 0x20],
    [PLAZA_BTN.ZL, 0x40],
    [PLAZA_BTN.ZR, 0x80],
    [PLAZA_BTN.LEFT, 0x100],
    [PLAZA_BTN.RIGHT, 0x200],
    [PLAZA_BTN.DOWN, 0x400],
    [PLAZA_BTN.UP, 0x800],
    [PLAZA_BTN.PLUS, 0x1000],
    [PLAZA_BTN.MINUS, 0x2000],
  ];
  for (const [n, x] of m) if (p.buttons & n) b |= x;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

const charaIndex = (pc: string): number => Math.max(0, (CHARA_PC as readonly string[]).indexOf(pc));

export const createPlazaUi: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const q = ctx.params;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  ctx.overlay.append(canvas);
  const url = (p: string): string => ctx.assetUrl(`mgmcommon/${p}`);
  const view = await PlazaUiView.create(canvas, url, [ONLINE_PART, ONLINE_FACES, PLAZA_UI_PART]);
  const extra = (await (await fetch(url(PLAZA_UI_PART))).json()) as PlazaUiExtra;
  const onlineExtra = (await (await fetch(url(ONLINE_PART))).json()) as OnlineExtra;
  applyOnlineExtra(view.spec, onlineExtra);
  applyPlazaUiExtra(view.spec, extra);

  let audio: AudioContext | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const muted = q.get('mute') === '1' || q.get('muted') === '1';
  const play = (label: string, file: string, gain: number): void => {
    if (muted) return;
    try {
      audio ??= new AudioContext();
    } catch {
      return;
    }
    const c = audio;
    let b = buffers.get(file);
    if (!b) {
      b = fetch(file)
        .then((r) => r.arrayBuffer())
        .then((a) => c.decodeAudioData(a))
        .catch(() => null);
      buffers.set(file, b);
    }
    void b.then((buf) => {
      if (!buf) {
        ctx.sound.se(label);
        return;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(c.destination);
      src.start();
    });
  };
  const sound = new MgmSound(view.spec.sounds, view.url, { play: (l, u, gain) => play(l, u, gain) });

  const locals = (): PlazaUiPlayer[] => ctx.players.filter((p) => p.local).map((p) => ({ slot: p.slot, chara: charaIndex(p.chara), isCom: p.isCom, name: p.name }));
  const num = (k: string, d: number): number => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? v : d;
  };
  const self = locals()[0];
  const net: OnlineAdapter = new FakeOnline({
    rooms: q.get('online') === 'off' ? 0 : num('rooms', 7),
    joinInterval: num('join', 3),
    leaveAfter: num('leave', 0),
    error: 'none',
    seed: 20261008,
    matchSec: 4,
    self: { name: self?.name ?? 'Player', chara: self?.chara ?? 0, humans: Math.max(1, locals().filter((p) => !p.isCom).length) },
    remoteMove: q.get('online') !== 'off',
    stampEvery: q.get('online') === 'off' ? 0 : num('stamp', 6),
  });

  const prevHold = new Map<number, number>();
  const ui = new PlazaUi({ host: view, extra, net, players: locals, pads: { poll: () => ({ hold: 0, trig: 0 }) }, sound, firstOnline: q.get('first') === '1' });

  const offs = [
    ctx.on('interact:telop', (v) => {
      const t = v as { area: number; visible: boolean; detail?: boolean };
      ui.setTelop(t.area, t.visible, t.detail ?? true);
    }),
    ctx.on('interact:pop', (v) => {
      const t = v as { visible: boolean; x?: number; y?: number; ndc?: [number, number] };
      const [x, y] = t.ndc ? popScreenPos(t.ndc[0], t.ndc[1]) : [t.x ?? 0, t.y ?? 0];
      ui.setPop(t.visible, x, y);
    }),
    ctx.on('interact:decide', (v) => {
      ui.decide((v as { result: number }).result);
    }),
    ctx.on('ui:mainLayout', (v) => {
      ui.wantMain = !!v;
    }),
  ];

  const lastPos = new Map<number, Vec3>();
  let acc = 0;
  const step = (): void => {
    const pads = new Map<number, { hold: number; trig: number }>();
    for (const p of locals()) {
      const hold = p.isCom ? 0 : padToBex(ctx.pad(p.slot));
      pads.set(p.slot, { hold, trig: hold & ~(prevHold.get(p.slot) ?? 0) });
      prevHold.set(p.slot, hold);
    }
    ui.out.length = 0;
    ui.tick(DT, pads);
    const actors = ctx.actors.filter((a: PlazaActor) => (a.kind === 'input' || a.kind === 'follow') && a.slot < 4);
    for (const a of actors) {
      const pos: Vec3 = [a.pos.x, a.pos.y, a.pos.z];
      const lp = lastPos.get(a.slot) ?? pos;
      lastPos.set(a.slot, pos);
      const vel = [(pos[0] - lp[0]) / DT, (pos[1] - lp[1]) / DT, (pos[2] - lp[2]) / DT, 0];
      const quat: Quat = [0, Math.sin(a.yaw / 2), 0, Math.cos(a.yaw / 2)];
      ui.sendLocal(DT, a.slot, charaIndex(a.chara), vel, pos, quat);
    }
    for (const e of ui.out) {
      if (e.t === 'friendMenu') ctx.emit('ui:friendMenu', e.open);
      else if (e.t === 'stampList') ctx.emit('ui:stampList', { slot: e.slot, open: e.open });
      else if (e.t === 'remote') ctx.emit('net:remote', { station: e.station, slot: e.slot, chara: CHARA_PC[e.chara] ?? CHARA_PC[0], pos: e.pos, quat: e.quat, mode: e.mode, speed: e.speed });
      else if (e.t === 'remoteLeft') ctx.emit('net:remoteLeft', { station: e.station });
      else if (e.t === 'session') ctx.emit('net:session', e.on);
    }
  };

  return {
    name: 'ui',
    update(df: number): void {
      acc += df;
      while (acc >= 1) {
        acc -= 1;
        step();
      }
    },
    afterRender(): void {
      view.begin();
      for (const [inst, m] of ui.drawList()) view.draw(inst, m);
      ui.online?.draw();
      view.end();
    },
    debug: () => ui.debug(),
    dispose(): void {
      for (const off of offs) off();
      view.dispose();
      canvas.remove();
      void audio?.close();
    },
  };
};
