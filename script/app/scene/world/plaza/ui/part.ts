/**
 * 광장 D 갈래 부품(PlazaPart 'ui') — 하단 파티 줄·장소 텔롭·다가가기 안내·스탬프·온라인(친구 매치·대기실)·위치 동기를 광장에 붙인다.
 * 계약: ../types.ts(A). 갈래 신호(SHARED 합의, docs/shell/plaza_3d.md §5.1):
 *   듣기 'interact:telop' {area, visible, detail?} · 'interact:decide' {result}(3 = 친구 매치 메뉴) · 'interact:pop' {visible, x, y}(레이아웃 좌표) 또는 {visible, ndc:[x,y]} · 'ui:mainLayout' boolean
 *   내기 'ui:friendMenu' boolean · 'ui:stampList' {slot, open} · 'net:remote' {station, slot, chara 'pcNN', pos, quat}(받은 패킷마다) · 'net:remoteLeft' {station} · 'net:session' boolean(방 접속 여부가 바뀔 때)
 *   대기실(docs/shell/plaza_3d.md §5.2): 내기 'net:lobby' {host, ready} · 'net:started'(PlaySession — 모두 모드 메뉴로), 듣기 'net:playSession'(방장 기구 결정)
 * 온라인(docs/shell/online.md 9.5·9.6): 기본 = 실제 방 서버(SocketIoOnline, HTTP + socket.io 바이너리, 페이지와 같은 출처 — npm run dev·server/main.ts), server=http://호스트:포트 로 바꿈.
 * 시험값(URL): online=fake = 가짜 온라인(시험·데모: join=입장 간격 s(기본 3), stamp=원격 스탬프 간격 s(기본 6), rooms=가짜 방 수(기본 7)), online=off = 가짜·방 없음 — 가짜는 개발 하네스(script/dev/flow.ts)가 ctx.online 으로 넣는다. first=1.
 * 그리기: 무대 렌더러 하나로 3D(후처리 포함) 다음 패스(afterRender)에 그린다 — UI 전용 캔버스·문맥 없음(docs/engine/loader_manager.md §14.4).
 *   앱 수명 렌더러(stage.keep)면 그리기 객체(PlazaUiView — 명세·그림·텍스처·셰이더)를 렌더러에 두고 다시 들어오면 그대로 쓴다(덧붙이기 extra 는 없는 키만 넣어 여러 번 불러도 같음).
 */
import * as THREE from 'three';
import { assetHooks } from '@app/common/render3d/assetHooks';
import { MgmSound } from '@app/common/ui';
import { applyOnlineExtra, ONLINE_FACES, ONLINE_PART, type OnlineExtra } from '@app/scene/menu/online';
import { CHARA_PC, defaultCard, type OnlineAdapter } from '@app/common/net/protocol/types';
import { SocketIoOnline } from '@app/common/net/socketio';
import { PLAZA_BTN, type PlazaActor, type PlazaContext, type PlazaPad, type PlazaPart, type PlazaPartFactory } from '../types';
import { PLAZA_CARD_PART, type PlazaCardExtra } from './card';
import { applyPlazaUiExtra, PLAZA_UI_PART, type PlazaUiExtra } from './data';
import type { Quat, Vec3 } from './net';
import { popScreenPos } from './telop';
import { PlazaUi, type PlazaUiPlayer } from './ui';
import { PlazaUiView } from './view';

const STICK_ON = 0.5;
/** 가짜 원격 걷기 몸 크기 = 마리오 bubble_radius·키(plaza_3d.md §8 (B) 맵 충돌) [근사] */
const FAKE_RADIUS = 0.9;
const FAKE_HEIGHT = 1.6;
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
  const url = (p: string): string => ctx.assetUrl(`mgmcommon/${p}`);
  const keep = ctx.world.stage.keep;
  const kept = keep?.get('plaza-ui') as PlazaUiView | undefined;
  const view = kept ?? (await PlazaUiView.create(ctx.world.stage.renderer, url, [ONLINE_PART, ONLINE_FACES, PLAZA_UI_PART, PLAZA_CARD_PART]));
  if (!kept) keep?.set('plaza-ui', view);
  const extra = (await (await fetch(url(PLAZA_UI_PART))).json()) as PlazaUiExtra;
  const cardExtra = (await (await fetch(url(PLAZA_CARD_PART))).json()) as PlazaCardExtra;
  const onlineExtra = (await (await fetch(url(ONLINE_PART))).json()) as OnlineExtra;
  applyOnlineExtra(view.spec, onlineExtra);
  applyPlazaUiExtra(view.spec, extra);
  for (const [k, v] of Object.entries(cardExtra.texts)) if (!(k in view.spec.texts)) view.spec.texts[k] = v;

  let audio: AudioContext | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const muted = q.get('mute') === '1' || q.get('muted') === '1';
  const play = (label: string, file: string, gain: number): void => {
    if (muted) return;
    if (ctx.sound.play) {
      ctx.sound.play(label, file, gain);
      return;
    }
    try {
      audio ??= new AudioContext();
    } catch {
      return;
    }
    const c = audio;
    let b = buffers.get(file);
    if (!b) {
      b = assetHooks.loadBytes(file)
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
  const self = locals()[0];
  const selfInfo = { name: self?.name ?? 'Player', chara: self?.chara ?? 0, humans: Math.max(1, locals().filter((p) => !p.isCom).length) };
  const selfCard = defaultCard(`${selfInfo.name}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`, selfInfo.name);
  const walk = (p: [number, number, number], m: [number, number]): [number, number, number] => {
    const col = ctx.world.collider;
    const pos = new THREE.Vector3(p[0], p[1], p[2]);
    const mv = col.collide(pos, new THREE.Vector3(m[0], 0, m[1]), FAKE_RADIUS, FAKE_HEIGHT);
    const g = col.groundHeight(p[0] + mv.x, p[2] + mv.z, p[1]);
    return g && g.y > p[1] - 1.5 ? [p[0] + mv.x, g.y, p[2] + mv.z] : p;
  };
  const net: OnlineAdapter = ctx.online?.({ self: { ...selfInfo, card: selfCard }, walk }) ?? new SocketIoOnline({ base: (q.get('server') ?? '').replace(/\/$/, ''), self: { ...selfInfo, card: selfCard } });

  const prevHold = new Map<number, number>();
  const ui = new PlazaUi({ host: view, extra, net, players: locals, pads: { poll: () => ({ hold: 0, trig: 0 }) }, sound, firstOnline: q.get('first') === '1', card: cardExtra, selfCard });

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
    ctx.on('net:playSession', () => {
      ui.playSession();
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
    const all = ui.takeSendAll();
    const order = locals()
      .filter((p) => !p.isCom)
      .map((p) => p.slot);
    for (const a of actors) {
      const k = order.indexOf(a.slot);
      if (k < 0) continue;
      const pos: Vec3 = [a.pos.x, a.pos.y, a.pos.z];
      const lp = lastPos.get(k) ?? pos;
      lastPos.set(k, pos);
      const vel = [(pos[0] - lp[0]) / DT, (pos[1] - lp[1]) / DT, (pos[2] - lp[2]) / DT, 0];
      const quat: Quat = [0, Math.sin(a.yaw / 2), 0, Math.cos(a.yaw / 2)];
      ui.sendLocal(DT, k, charaIndex(a.chara), vel, pos, quat, all);
    }
    for (const e of ui.out) {
      if (e.t === 'friendMenu') ctx.emit('ui:friendMenu', e.open);
      else if (e.t === 'stampList') ctx.emit('ui:stampList', { slot: e.slot, open: e.open });
      else if (e.t === 'remote') ctx.emit('net:remote', { station: e.station, slot: e.slot, chara: CHARA_PC[e.chara] ?? CHARA_PC[0], pos: e.pos, quat: e.quat });
      else if (e.t === 'remoteLeft') ctx.emit('net:remoteLeft', { station: e.station });
      else if (e.t === 'session') ctx.emit('net:session', e.on);
      else if (e.t === 'lobby') ctx.emit('net:lobby', { host: e.host, ready: e.ready });
      else if (e.t === 'started') ctx.emit('net:started', true);
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
      for (const [inst, m] of ui.cardDrawList()) view.draw(inst, m);
      view.end();
    },
    debug: () => ui.debug(),
    dispose(): void {
      for (const off of offs) off();
      net.disconnect();
      if (!keep) view.dispose();
      void audio?.close();
    },
  };
};
