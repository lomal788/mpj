/**
 * 방 서버 시험 — docs/shell/online.md 9.5(HTTP + socket.io 바이너리·연결 수명·케이스) + docs/shell/plaza_3d.md §5.2(광장 대기실). 재구현 시험(원본 실행 대조 아님).
 * ① 바이너리 배치·바이트 수 ② PlazaRooms 순수 상태(가상 시계) ③ SocketIoOnline ↔ 실제 서버(server/main.ts: express API + socket.io /mpj-plaza)·연결 수명·케이스
 * ④ 광장 대기실 두 PlazaUi(실제 명세): 만들기 → 찾기·참가 → 입장 알림·하단 줄·원격 위치·−/+ 카드 → 기구 PlaySession → 둘 다 started
 * ⑤ 광장 방 흐름(online.md 9.6): 세 PlazaUi — 손님 나감·다시 참가·핑 끊김·탭 닫기·방장 해산 뒤 잔상 없음, 목록 반영·참가 거절, 서버 없음 B3, 가짜 어댑터 같은 정리
 *
 *   npx tsx tools/test_room_server.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { Render2D } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';
import { mergeSpec, type MgmDrawHost, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';
import {
  applyOnlineExtra,
  BTN,
  decInfo,
  decRoom,
  decRooms,
  decTicket,
  defaultCard,
  encCreate,
  encEnter,
  encInfo,
  encJoin,
  encSearch,
  encSearchId,
  encSimple,
  encStamp,
  FakeOnline,
  MSG,
  relay,
  SocketIoOnline,
  TICKET,
  wirePlayer,
  type OnlineEvent,
  type OnlineExtra,
  type OnlineSelf,
  type SioConnect,
} from '../script/shell/online';
import { applyPlazaUiExtra, PlazaUi, type PlazaUiExtra, type PlazaUiPlayer } from '../script/shell/plaza/ui';
import * as THREE from 'three';
import { leverToward, RemoteMotion } from '../script/shell/plaza/follow';
import { NO_LEVER, PlazaMover, type Lever } from '../script/shell/plaza/player';
import type { PlazaCardExtra } from '../script/shell/plaza/ui/card';
import { createPlaza } from '../server/games/mpj-plaza';
import { PlazaRooms } from '../server/games/mpj-plaza/rooms';
import { startPlazaServer } from '../server/main';
import { resolveFontsFromDisk } from './fontSpecNode';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_FILES = ['online/online.json', 'plaza/ui/plaza_ui.json', 'plaza/ui/plaza_card.json', 'mgmcommon/spec.json', 'mgm01/faces.json'];
const specCache = new Map<string, unknown>();
for (const p of SPEC_FILES) {
  const f = join(WEB, 'assets', p);
  const j = JSON.parse(readFileSync(f, 'utf8')) as { fonts?: Record<string, unknown> };
  await resolveFontsFromDisk(j.fonts, join(WEB, 'assets/mgmcommon'));
  specCache.set(p, j);
}
let fails = 0;
let count = 0;
function ok(cond: boolean, msg: string): void {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
}
function eq<T>(a: T, b: T, msg: string): void {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
const DT = Math.fround(1 / 60);
const P1 = (name: string, chara: number) => [wirePlayer(name, chara, defaultCard('', name))];

// ── ① 바이너리 배치 ──
{
  console.log('① 바이너리 배치·바이트 수');
  const info = encInfo(1, [3.3, -2.36, 22.316], Math.PI / 2);
  eq(info.length, 10, '위치 한 건 INFO = 10 B');
  const rel = relay(info, 0x1234);
  eq(rel.length, 12, '중계 REMOTE_INFO = 12 B');
  eq([...rel.subarray(3)], [...info.subarray(1)], '중계 = 스테이션만 끼우고 나머지 바이트 그대로');
  const d = decInfo(rel);
  eq([d.station, d.slot], [0x1234, 1], '중계 스테이션·순번');
  ok(d.pos.every((v, i) => Math.abs(v - [3.3, -2.36, 22.316][i]) <= 1 / 512), `위치 양자화 오차 ≤ 1/512 m (${d.pos})`);
  ok(Math.abs(d.yaw - Math.PI / 2) < 1e-4, '회전 yaw u16');
  eq(encStamp(0, 28).length, 3, '스탬프 3 B');
  eq(relay(encStamp(0, 28), 7).length, 5, '스탬프 중계 5 B');
  eq(encEnter(new Uint8Array(16)).length, 17, 'ENTER 17 B');
  eq(encSimple(MSG.READY).length, 1, 'READY·LEAVE·DISSOLVE·START 1 B');
  eq(encSearch(-1, 1).length, 2, '검색 요청 2 B');
  eq(encSearchId('123456', 1).length, 5, 'ID 검색 요청 5 B');
  eq(encCreate(4, '', P1('Aya', 0)).length, 19, '만들기 요청(사람 1·이름 3 B) 19 B');
  eq(encJoin('123456', '2900', P1('Bo', 3)).length, 21, '참가 요청(이름 2 B) 21 B');
  eq(encCreate(4, '0042', P1('Aya', 0)).length, 19, '패스워드 있어도 같은 크기(u16)');
  const players2 = [wirePlayer('가나', 1), wirePlayer('Di', 6)];
  eq(encCreate(4, '', players2).length, 4 + 1 + (11 + 6) + (11 + 2), '사람 2 프로필(UTF-8 이름)');
}

// ── ② PlazaRooms 순수 상태 ──
{
  console.log('② PlazaRooms 순수 상태');
  let now = 0;
  let rr = 0.37;
  let tk = 0;
  const srv = new PlazaRooms({ now: () => now, random: () => (rr = (rr * 9301 + 0.49297) % 1), token: () => new Uint8Array(16).fill(++tk) });
  const box = new Map<number, Uint8Array[]>();
  const kicked: number[] = [];
  const conn = (): number => {
    const q: Uint8Array[] = [];
    const id = srv.open((b) => q.push(b), () => kicked.push(id));
    box.set(id, q);
    return id;
  };
  const take = (id: number): Uint8Array[] => box.get(id)!.splice(0);
  const create = (size: 4 | 8, pw: string, players = P1('Aya', 0)) => decTicket(srv.http('create', encCreate(size, pw, players))!);
  const join = (id: string, pw: string, players = P1('Bo', 3)) => decTicket(srv.http('join', encJoin(id, pw, players))!);
  const enter = (token: Uint8Array): number => {
    const c = conn();
    srv.message(c, encEnter(token));
    return c;
  };

  const t1 = create(4, '');
  eq(t1.status, TICKET.OK, 'HTTP 만들기 → 입장 표');
  ok(/^\d{6}$/.test(t1.id), `방 ID 6자리 (${t1.id})`);
  eq(decRooms(srv.http('search', encSearch(-1, 1))!).length, 0, '방장이 들어오기 전엔 검색에 안 나옴');
  const a = enter(t1.token!);
  const ra = take(a);
  eq(ra.map((b) => b[0]), [MSG.ROOM], '입장 → ROOM');
  const roomA = decRoom(ra[0]);
  eq([roomA.me, roomA.id, roomA.stations.length, roomA.stations[0].host, roomA.stations[0].ready], [a, t1.id, 1, true, true], 'ROOM: 내 스테이션·방장·준비');
  eq(ra[0].length, 12 + 3 + 1 + 14, 'ROOM 바이트(스테이션 1·사람 1·이름 3 B) = 30 B');
  const found = decRooms(srv.http('search', encSearch(-1, 1))!);
  eq(found.map((r) => [r.id, r.host, r.size, r.members, r.locked]), [[t1.id, 'Aya', 4, [0], false]], '검색: 방장 이름·캐릭터');
  eq(decRooms(srv.http('search-id', encSearchId(t1.id, 1))!).map((r) => r.id), [t1.id], 'ID 검색');
  eq(decRooms(srv.http('search-id', encSearchId('999999', 1))!).length, 0, '없는 ID');
  eq(srv.http('nope', new Uint8Array(0)), null, '모르는 경로 = null(404)');

  eq(join(t1.id, '', P1('Copy', 0)).status, TICKET.MEMBERS, '같은 캐릭터 → members');
  eq(join('999999', '').status, TICKET.MISSED, '없는 방 → missed');
  const jb = join(t1.id, '');
  eq(jb.status, TICKET.OK, '참가 표');
  const b = enter(jb.token!);
  const rb = take(b);
  eq(rb.map((x) => x[0]), [MSG.ROOM], '손님 입장 → ROOM');
  eq(decRoom(rb[0]).stations.map((s) => [s.station, s.host]), [[a, true], [b, false]], '손님이 받은 방 = 방장 + 나');
  const ja = take(a);
  eq(ja.map((x) => x[0]), [MSG.JOINED], '방장에게 JOINED');
  srv.message(b, encSimple(MSG.READY));
  eq(take(a).map((x) => [...x]), [[MSG.MEMBER_READY, b & 0xff, b >> 8]], 'READY → MEMBER_READY 3 B');
  eq(take(b).length, 0, '자기 READY 는 안 받음');
  const inf = encInfo(0, [1, -2.4, 20], 0);
  srv.message(b, inf);
  const got = take(a);
  eq(got.map((x) => x.length), [12], '위치 중계 12 B');
  eq([...got[0].subarray(3)], [...inf.subarray(1)], '중계 바이트 그대로');
  srv.message(b, encInfo(3, [0, 0, 0], 0));
  eq(take(a).length, 0, '없는 순번(슬롯 3, 사람 1명) 무시');
  srv.message(a, encStamp(0, 28));
  eq(take(b).map((x) => [...x]), [[MSG.REMOTE_STAMP, a & 0xff, a >> 8, 0, 28]], '스탬프 중계 5 B');
  const lone = conn();
  srv.message(lone, inf);
  ok(!take(a).length && !take(b).length, '방 밖(입장 전) 위치는 중계 안 함');

  console.log('  패스워드·인원·8인·표 시간 제한');
  const tp = create(4, '2900', P1('Pw', 1));
  const hp = enter(tp.token!);
  take(hp);
  ok(decRooms(srv.http('search', encSearch(4, 1))!).some((r) => r.id === tp.id && r.locked), '자물쇠 방 locked');
  eq(join(tp.id, '1111').status, TICKET.PASSWORD, '패스워드 틀림');
  const t3 = join(tp.id, '2900', [wirePlayer('T1', 7), wirePlayer('T2', 8), wirePlayer('T3', 9), wirePlayer('T4', 10)]);
  eq(t3.status, TICKET.FULL, '1 + 사람 4 > 4 → full');
  const t2 = join(tp.id, '2900', [wirePlayer('L1', 7), wirePlayer('L2', 8)]);
  eq(t2.status, TICKET.OK, '사람 2 참가 표');
  eq(join(tp.id, '2900', [wirePlayer('L3', 11), wirePlayer('L4', 12)]).status, TICKET.FULL, '예약한 자리까지 셈: 1 + 2(예약) + 2 > 4');
  now += 20.1;
  srv.tick();
  eq(join(tp.id, '2900', [wirePlayer('L3', 11), wirePlayer('L4', 12)]).status, TICKET.OK, '표 20 s 지나면 자리 풀림');
  const late = enter(t2.token!);
  eq(take(late).map((x) => [...x]), [[MSG.ERROR, 3]], '지난 표로 입장 → ERROR B3');
  ok(kicked.includes(late), '지난 표 연결 끊음');
  eq(create(8, '', [wirePlayer('A', 1), wirePlayer('B', 2)]).status, TICKET.MEMBERS, '8인 방 만들기는 사람 1명만');
  eq(create(8, '', P1('Koopa', 13)).status, TICKET.MEMBERS, '8인 방 쿠파 금지');
  const t8 = create(8, '', P1('Eight', 2));
  enter(t8.token!);
  eq(join(t8.id, '', [wirePlayer('X', 3), wirePlayer('Y', 4)]).status, TICKET.FULL, '8인 방 참가는 사람 1명만');
  eq(join(t8.id, '', P1('Koopa', 13)).status, TICKET.MEMBERS, '8인 방 쿠파 참가 금지');
  const ghost = create(4, '', P1('Ghost', 5));
  now += 20.1;
  srv.tick();
  ok(!srv.rooms.has(ghost.id), '방장이 20 s 안에 안 들어온 방 지움');
  const idle = conn();
  now += 20.1;
  srv.tick();
  ok(kicked.includes(idle), '입장 없이 20 s 지난 연결 끊음');

  console.log('  로컬 2 + 원격 2·나가기·해산·시작');
  const th = create(4, '', [wirePlayer('H1', 0), wirePlayer('H2', 1)]);
  const h = enter(th.token!);
  take(h);
  const tg = join(th.id, '', [wirePlayer('G1', 2), wirePlayer('G2', 3)]);
  const g = enter(tg.token!);
  eq(decRoom(take(g)[0]).stations.map((s) => s.players.length), [2, 2], '스테이션 2개·사람 2명씩');
  eq(join(th.id, '', P1('Late', 4)).status, TICKET.FULL, '4/4 → full');
  eq(decRooms(srv.http('search', encSearch(4, 1))!).some((r) => r.id === th.id), false, '가득 찬 방 검색 제외');
  take(h);
  srv.message(g, encInfo(1, [1, 0, 1], 0));
  eq(take(h).map((x) => decInfo(x).slot), [1], '두 번째 로컬 사람(순번 1) 위치');
  srv.message(g, encSimple(MSG.READY));
  take(h);
  srv.message(g, encSimple(MSG.START));
  eq(take(g).length + take(h).length, 0, '손님 START 무시');
  srv.message(h, encSimple(MSG.START));
  eq([take(h).map((x) => x[0]), take(g).map((x) => x[0])], [[MSG.STARTED], [MSG.STARTED]], '방장 START → 모두 STARTED 1 B');
  srv.close(h);
  eq(take(g).map((x) => x[0]), [MSG.LEFT], '시작 뒤 방장이 끊겨도 해산 아님(LEFT)');
  const tx = create(4, '', P1('Solo', 8));
  const x = enter(tx.token!);
  take(x);
  srv.message(x, encSimple(MSG.START));
  eq(take(x).map((y) => [...y]), [[MSG.ERROR, 9]], '혼자 START → B9');
  const ty = join(tx.id, '', P1('Two', 9));
  const y = enter(ty.token!);
  take(y);
  take(x);
  srv.message(y, encSimple(MSG.LEAVE));
  eq(take(x).map((z) => z[0]), [MSG.LEFT], '나가기 → LEFT');
  const tz = join(tx.id, '', P1('Three', 10));
  const z = enter(tz.token!);
  take(z);
  srv.message(x, encSimple(MSG.DISSOLVE));
  eq(take(z).map((w) => w[0]), [MSG.DISSOLVED], '해산 → DISSOLVED');
  ok(!srv.rooms.has(tx.id), '해산한 방 지움');
  const tw = create(4, '', P1('Host', 11));
  const w = enter(tw.token!);
  const tv = join(tw.id, '', P1('Guest', 12));
  const v = enter(tv.token!);
  take(v);
  srv.close(w);
  eq(take(v).map((q) => q[0]), [MSG.DISSOLVED], '방장 끊김 → 해산');
  ok(srv.status().bytes.out > 0, `바이트 집계 ${JSON.stringify(srv.status().bytes)}`);
}

// ── ③ SocketIoOnline ↔ 실제 서버 ──
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const io = (createRequire(import.meta.url)('socket.io-client') as typeof import('../node_modules/socket.io-client/build/index')).io as unknown as SioConnect;
async function pump(nets: SocketIoOnline[], inbox: Map<SocketIoOnline, OnlineEvent[]>, pred: () => boolean, max = 5000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < max) {
    for (const n of nets) {
      n.tick(DT);
      inbox.get(n)!.push(...n.poll());
    }
    if (pred()) return true;
    await sleep(5);
  }
  return false;
}
const self = (name: string, chara: number, more: [string, number][] = []): OnlineSelf => ({
  name,
  chara,
  humans: 1 + more.length,
  card: defaultCard('', name),
  players: [[name, chara] as [string, number], ...more].map(([n, c]) => ({ name: n, chara: c })),
});

{
  console.log('③ SocketIoOnline ↔ 서버(HTTP + socket.io)');
  const plaza = createPlaza();
  const srv = await startPlazaServer({ port: 0, build: false, games: [plaza.game], routers: [plaza.router] });
  const base = srv.url.replace(/\/$/, '');
  try {
    const mk = (s: OnlineSelf) => new SocketIoOnline({ base, self: s, io });
    const A = mk(self('Aya', 0));
    const B = mk(self('Bo', 3));
    const inbox = new Map<SocketIoOnline, OnlineEvent[]>([
      [A, []],
      [B, []],
    ]);
    const has = (n: SocketIoOnline, t: string) => inbox.get(n)!.find((e) => e.t === t);
    A.connect();
    B.connect();
    await pump([A, B], inbox, () => !!has(A, 'connected') && !!has(B, 'connected'));
    eq([A.stat.http, A.stat.sockets, B.stat.http, B.stat.sockets], [0, 0, 0, 0], '메뉴(논리 접속)까지 HTTP·소켓 없음');
    A.sendPlayerInfo(0, 0, [0, 0, 0], [0, 0, 0, 1]);
    eq(A.stat.sent, 0, '방 밖에서는 아무것도 안 보냄');
    A.createRoom(4, '');
    ok(await pump([A, B], inbox, () => !!has(A, 'created')), 'HTTP 만들기 → 소켓 입장 → created');
    eq([A.stat.http, A.stat.sockets, A.socketOpen], [1, 1, true], '만들기 = HTTP 1 + 소켓 1');
    const id = A.room()!.id;
    B.searchRooms(-1);
    ok(await pump([A, B], inbox, () => !!has(B, 'searchDone')), '검색');
    eq([B.stat.http, B.stat.sockets], [1, 0], '검색은 HTTP 만(소켓 없음)');
    ok((has(B, 'searchDone') as { rooms: { id: string }[] }).rooms.some((r) => r.id === id), '검색에 방');
    B.joinRoom(id, '');
    ok(await pump([A, B], inbox, () => !!has(B, 'joined') && !!has(A, 'memberReady')), '참가 → joined, 방장 memberReady');
    eq(A.room()!.members.map((m) => [m.name, m.host, m.ready, m.local]), [['Aya', true, true, true], ['Bo', false, true, false]], '방장 쪽 멤버');
    eq(B.room()!.members.map((m) => [m.name, m.host, m.local]), [['Aya', true, false], ['Bo', false, true]], '손님 쪽 멤버');
    const before = A.stat.sentBytes;
    A.sendPlayerInfo(0, 0, [1, -2.4, 20], [0, 1, 0, 0]);
    eq(A.stat.sentBytes - before, 10, '보낸 위치 10 B');
    B.sendStamp(0, 16, 3);
    ok(await pump([A, B], inbox, () => !!has(B, 'remoteInfo') && !!has(A, 'stamp')), '위치·스탬프 중계');
    const ri = has(B, 'remoteInfo') as { pos: number[]; chara: number; quat: number[] };
    eq([ri.pos, ri.chara], [[1, -2.3984375, 20], 0], '받은 위치(1/256 양자화)·캐릭터 = 입장 프로필');
    ok(Math.abs(Math.abs(ri.quat[1]) - 1) < 1e-4, '받은 회전');
    eq((has(A, 'stamp') as { chara: number }).chara, 3, '스탬프 캐릭터 = 프로필');
    A.startRoom();
    ok(await pump([A, B], inbox, () => !!has(A, 'started') && !!has(B, 'started')), 'START → 둘 다 started');
    B.disconnect();
    ok(await pump([A, B], inbox, () => !!has(A, 'memberLeft')), '손님 끊김 → memberLeft');

    console.log('  나가기·해산 → 소켓 끊음, 로컬 2 + 원격 2');
    const C = mk(self('Cy', 4, [['Cy2', 5]]));
    const D = mk(self('Di', 6, [['Di2', 7]]));
    const E = mk(self('Ed', 8));
    for (const n of [C, D, E]) {
      inbox.set(n, []);
      n.connect();
    }
    C.createRoom(4, '');
    ok(await pump([C], inbox, () => !!has(C, 'created')), '사람 2 기기 방 만들기');
    eq(C.room()!.members.map((m) => [m.name, m.slot, m.local]), [['Cy', 0, true], ['Cy2', 1, true]], '한 스테이션 = 사람 2(순번 0·1)');
    D.joinRoom(C.room()!.id, '');
    ok(await pump([C, D], inbox, () => !!has(D, 'joined') && (C.room()?.members.length ?? 0) === 4 && inbox.get(C)!.filter((e) => e.t === 'memberJoined').length === 2), '사람 2 기기 참가 → 4명');
    eq(C.room()!.members.map((m) => `${m.name}${m.local ? '*' : ''}`), ['Cy*', 'Cy2*', 'Di', 'Di2'], '로컬 2 + 원격 2');
    E.joinRoom(C.room()!.id, '');
    ok(await pump([E], inbox, () => !!has(E, 'joinFailed')), '4/4 방에 더 못 들어감');
    eq(E.stat.sockets, 0, '실패한 참가는 소켓을 안 엶');
    D.sendPlayerInfo(1, 7, [2, -2.4, 18], [0, 0, 0, 1]);
    ok(await pump([C, D], inbox, () => inbox.get(C)!.some((e) => e.t === 'remoteInfo' && e.slot === 1)), '원격 두 번째 사람(순번 1) 위치');
    eq((inbox.get(C)!.find((e) => e.t === 'remoteInfo') as { chara: number }).chara, 7, '순번 1 캐릭터');
    D.leaveRoom();
    eq(D.socketOpen, false, '나가기 → 소켓 끊음');
    ok(await pump([C], inbox, () => !!has(C, 'memberLeft') && C.room()!.members.length === 2), '방장 쪽 2명(한 스테이션 이탈 = 두 사람)');
    const F = mk(self('Fu', 9));
    inbox.set(F, []);
    F.connect();
    F.joinRoom(C.room()!.id, '');
    ok(await pump([C, F], inbox, () => !!has(F, 'joined')), '다시 참가');
    C.dissolveRoom();
    eq(C.socketOpen, false, '해산 → 방장 소켓 끊음');
    ok(await pump([F], inbox, () => !!has(F, 'dissolved')), 'dissolved');
    eq(F.socketOpen, false, '해산당함 → 소켓 끊음');
    const G = mk(self('Gi', 10));
    inbox.set(G, []);
    G.connect();
    G.createRoom(4, '');
    await pump([G], inbox, () => !!has(G, 'created'));
    await srv.close();
    ok(await pump([G], inbox, () => (has(G, 'error') as { code?: string } | undefined)?.code === 'B3'), '서버 끊김(방 안) → B3');
    eq(G.socketOpen, false, '끊기면 소켓 정리');
    const H = new SocketIoOnline({ base: 'http://127.0.0.1:9', self: self('H', 1), io, timeout: 2 });
    inbox.set(H, []);
    H.connect();
    H.createRoom(4, '');
    ok(await pump([H], inbox, () => (has(H, 'error') as { code?: string } | undefined)?.code === 'B3', 4000), '서버 없음 → 만들기 통신 오류 B3(online.md 9.6 ⑥, 이전 기대 createFailed)');
    H.searchRooms(-1);
    ok(await pump([H], inbox, () => inbox.get(H)!.filter((e) => e.t === 'error' && e.code === 'B3').length === 2, 4000), '서버 없음 → 찾기 통신 오류 B3(이전 기대 빈 검색)');
    A.disconnect();
  } finally {
    await srv.close().catch(() => undefined);
  }
}

// ── ④ 광장 대기실(두 PlazaUi) ──
{
  console.log('④ 광장 대기실 두 PlazaUi');
  const plaza = createPlaza();
  const srv = await startPlazaServer({ port: 0, build: false, games: [plaza.game], routers: [plaza.router] });
  const base = srv.url.replace(/\/$/, '');
  const read = <T>(p: string): T => structuredClone(specCache.get(p)) as T;
  const onl = read<MgmSpecPart & OnlineExtra>('online/online.json');
  const ext = read<PlazaUiExtra>('plaza/ui/plaza_ui.json');
  const card = read<MgmSpecPart & PlazaCardExtra>('plaza/ui/plaza_card.json');
  let spec = mergeSpec(read<MgmSpec>('mgmcommon/spec.json'), onl);
  spec = mergeSpec(spec, read<MgmSpecPart>('mgm01/faces.json'));
  spec = mergeSpec(spec, ext);
  spec = mergeSpec(spec, card);
  applyOnlineExtra(spec, onl);
  applyPlazaUiExtra(spec, ext);
  for (const [k, v] of Object.entries(card.texts)) if (!(k in spec.texts)) spec.texts[k] = v;
  const all = spec as unknown as Spec;
  const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} };
  const textOf = (inst: LayoutInst, path: string): string => {
    const f = inst.find(path);
    return f ? (f[0].texts.get(f[1]) ?? '') : '<없음>';
  };

  interface Side {
    ui: PlazaUi;
    net: SocketIoOnline;
    sounds: string[];
    outs: string[];
    sent: number;
    next: number;
    players: PlazaUiPlayer[];
  }
  const make = (players: PlazaUiPlayer[]): Side => {
    const net = new SocketIoOnline({ base, self: { name: players[0].name, chara: players[0].chara, humans: 1 }, io });
    const s: Side = { ui: null as unknown as PlazaUi, net, sounds: [], outs: [], sent: 0, next: 0, players };
    s.ui = new PlazaUi({ host, extra: ext, net, players: () => players, pads: { poll: () => ({ hold: 0, trig: 0 }) }, sound: { playSe: (l: string) => s.sounds.push(l) } as never, card, selfCard: defaultCard('', players[0].name) });
    return s;
  };
  const P = (slot: number, chara: number, isCom: boolean, name: string): PlazaUiPlayer => ({ slot, chara, isCom, name });

  console.log('  케이스: 혼자·사람 1 + CPU·로컬 사람 2 + CPU 는 통신 없음');
  for (const ps of [[P(0, 0, false, 'Solo')], [P(0, 0, false, 'One'), P(1, 3, true, 'C'), P(2, 4, true, 'C'), P(3, 5, true, 'C')], [P(0, 0, false, 'L1'), P(1, 2, false, 'L2'), P(2, 4, true, 'C')]]) {
    const s = make(ps);
    for (let i = 0; i < 240; i++) {
      s.ui.out.length = 0;
      s.ui.tick(DT, new Map());
      s.ui.sendLocal(DT, 0, 0, [3, 0, 0, 0], [0, 0, 0], [0, 0, 0, 1], i === 0);
    }
    eq([s.net.stat.http, s.net.stat.sockets, s.net.stat.sent], [0, 0, 0], `${ps.filter((p) => !p.isCom).length}명 + CPU ${ps.filter((p) => p.isCom).length}: 4 s 동안 HTTP·소켓·송신 0`);
  }

  const H = make([P(0, 0, false, 'Aya')]);
  const C = make([P(0, 3, false, 'Bo')]);
  const step = (s: Side): void => {
    const t = s.next;
    s.next = 0;
    s.ui.out.length = 0;
    s.ui.tick(DT, new Map([[0, { hold: t, trig: t }]]));
    const all2 = s.ui.takeSendAll();
    if (s.ui.sendLocal(DT, 0, s.players[0].chara, [0, 0, 0, 0], [s === H ? 1 : -1, -2.4, 21], [0, 1, 0, 0], all2)) s.sent++;
    for (const e of s.ui.out) s.outs.push(e.t === 'lobby' ? `lobby:${e.host}:${e.ready}` : e.t);
  };
  const run = async (pred: () => boolean, max = 6000): Promise<boolean> => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
      step(H);
      step(C);
      if (pred()) return true;
      await sleep(2);
    }
    return false;
  };
  const press = async (s: Side, bits: number): Promise<void> => {
    s.next = bits;
    step(H);
    step(C);
    await sleep(1);
  };
  try {
    await run(() => H.ui.main && C.ui.main && H.ui.onlineGuide.life.st === 1 && C.ui.onlineGuide.life.st === 1);
    await press(H, 0x8);
    const hf = (): NonNullable<typeof H.ui.online>['flow'] => H.ui.online!.flow;
    ok(await run(() => hf().netMenu.life.idle), '방장: 친구 매치 메뉴');
    eq([H.net.stat.http, H.net.stat.sockets], [0, 0], '메뉴만 열면 통신 없음');
    await run(() => false, 300);
    await press(H, BTN.A);
    ok(await run(() => hf().roomType.life.idle), '방 종류');
    await run(() => false, 300);
    await press(H, BTN.A);
    ok(await run(() => hf().dialog.life.idle && hf().dialog.result < 0), '패스워드 확인');
    await press(H, BTN.A);
    ok(await run(() => hf().step === 'lobby:host' && H.ui.main), '방장 대기실 = 광장 메인');
    eq([H.net.stat.http, H.net.stat.sockets], [1, 1], '방 만들기 = HTTP 1 + 소켓 1');
    ok(H.outs.includes('lobby:true:false'), 'net:lobby 방장·준비 안 됨(혼자)');

    await press(C, 0x8);
    const cf = (): NonNullable<typeof C.ui.online>['flow'] => C.ui.online!.flow;
    ok(await run(() => cf().netMenu.life.idle), '손님: 친구 매치 메뉴');
    await run(() => false, 300);
    await press(C, 0x40200);
    await run(() => false, 200);
    await press(C, BTN.A);
    ok(await run(() => cf().list.life.idle && cf().rooms.length > 0 && !cf().list.rowsAnimating()), '방 목록에 방장 방');
    eq(C.net.stat.sockets, 0, '방 목록까지 소켓 없음(HTTP 만)');
    await run(() => false, 1200);
    await press(C, BTN.A);
    ok(await run(() => cf().dialog.life.idle && cf().dialog.result < 0), '참가 확인 대화상자');
    await press(C, BTN.A);
    ok(await run(() => cf().step === 'lobby:client' && C.ui.main, 8000), '손님 대기실 = 광장 메인');
    ok(await run(() => H.ui.online!.view.notices.some((n) => n.includes('Bo') && n.includes('참가'))), '방장 입장 알림');
    ok(await run(() => H.ui.status.bySlot.size === 2 && C.ui.status.bySlot.size === 2), '하단 줄 두 칸(양쪽)');
    eq([H.ui.status.bySlot.get(1)?.name, C.ui.status.bySlot.get(0)?.name], ['Bo', 'Aya'], '하단 줄 순서 = 방 멤버 순서');
    ok(await run(() => H.ui.remote.actors.size === 1 && C.ui.remote.actors.size === 1), '서로의 원격 캐릭터(가만히 있어도 SendRemotePlayerInfoAll)');
    const hr = [...H.ui.remote.actors.values()][0];
    eq([hr.pos[0], hr.chara], [-1, 3], '방장이 받은 손님 위치·캐릭터');
    const sentStill = H.net.stat.sent;
    await run(() => false, 600);
    eq(H.net.stat.sent, sentStill, '멈춰 있으면 위치를 더 보내지 않음');
    ok(await run(() => H.outs.includes('lobby:true:true') && C.outs.includes('lobby:false:true')), 'net:lobby 준비됨');
    eq(hf().lobby.telop, 1, '방장 텔롭 = 파티로 출발할 수 있습니다');

    console.log('  −/+ 카드');
    ok(await run(() => !!C.ui.cardGuide?.shown), '손님 카드 안내(위치 0xc)');
    eq(textOf(C.ui.cardGuide!.inst, 'sys_guide_right_00/x_text'), '/ 마리오 파티 카드', '안내 문구');
    await press(C, 0x1000);
    ok(C.sounds.includes('SQ_SE_SYS_DECI_S'), '열기 소리');
    eq(C.ui.card!.cards.map((x) => x.name), ['Aya', 'Bo'], '카드 = 방 멤버 순서');
    ok(C.outs.includes('friendMenu'), '카드 동안 이동 멈춤(ui:friendMenu)');
    ok(await run(() => C.ui.card!.st === 1), '카드 대기');
    eq(textOf(C.ui.card!.inst, 'x_parts_status/x_text_username'), 'Aya', '첫 카드 이름');
    eq(textOf(C.ui.card!.inst, 'x_parts_status/x_text_title'), spec.texts.im_achieve401_name, '업적 없음 = 수습 플레이어');
    await press(C, 0x40200);
    eq(textOf(C.ui.card!.inst, 'x_parts_status/x_text_username'), 'Bo', '오른쪽 → 다음 카드');
    await press(C, 0x2);
    eq(cf().step, 'lobby:client', 'B 는 카드만 닫음');
    ok(!cf().dialog.working, '나가기 대화상자 안 열림');
    ok(await run(() => C.ui.card!.finished), '카드 닫힘');

    console.log('  기구 → PlaySession');
    H.ui.playSession();
    ok(await run(() => H.outs.includes('started') && C.outs.includes('started')), '방장 기구 → 둘 다 net:started');
    ok(H.sounds.includes('SQ_SE_MENU00_TRANSITION_WHO') && C.sounds.includes('SQ_SE_MENU00_TRANSITION_WHO'), '전환 소리 양쪽');
    ok(await run(() => H.ui.online!.flow.result === 'started' && C.ui.online!.flow.result === 'started'), '두 흐름 끝 = started');
    console.log(`   바이트: 방장 보냄 ${H.net.stat.sentBytes} B/${H.net.stat.sent}건·받음 ${H.net.stat.recvBytes} B/${H.net.stat.recv}건·HTTP ${H.net.stat.httpBytes} B, 서버 ${JSON.stringify(plaza.rooms.status().bytes)}`);
    H.net.disconnect();
    C.net.disconnect();
  } finally {
    await srv.close();
  }
}

// ── ⑤ 광장 방 흐름(실제 서버, 세 페이지): 나가기·해산·끊김·다시 참가 잔상 ──
const uiHost = (): { host: MgmDrawHost; ext: PlazaUiExtra; card: MgmSpecPart & PlazaCardExtra } => {
  const read = <T>(p: string): T => structuredClone(specCache.get(p)) as T;
  const onl = read<MgmSpecPart & OnlineExtra>('online/online.json');
  const ext = read<PlazaUiExtra>('plaza/ui/plaza_ui.json');
  const card = read<MgmSpecPart & PlazaCardExtra>('plaza/ui/plaza_card.json');
  let spec = mergeSpec(read<MgmSpec>('mgmcommon/spec.json'), onl);
  spec = mergeSpec(spec, read<MgmSpecPart>('mgm01/faces.json'));
  spec = mergeSpec(spec, ext);
  spec = mergeSpec(spec, card);
  applyOnlineExtra(spec, onl);
  applyPlazaUiExtra(spec, ext);
  for (const [k, v] of Object.entries(card.texts)) if (!(k in spec.texts)) spec.texts[k] = v;
  const all = spec as unknown as Spec;
  return { host: { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} }, ext, card };
};
type EngineLike = { sendPacket: (...a: unknown[]) => void; onPacket: (...a: unknown[]) => void; close(): void };
const engineOf = (n: SocketIoOnline): EngineLike | null => (n as unknown as { sock: { io: { engine: EngineLike } } | null }).sock?.io.engine ?? null;

{
  console.log('⑤ 광장 방 흐름(실제 서버·세 페이지): 나가기·해산·끊김·다시 참가');
  const plaza = createPlaza();
  const srv = await startPlazaServer({ port: 0, build: false, games: [plaza.game], routers: [plaza.router], socket: { pingInterval: 200, pingTimeout: 300 } });
  const base = srv.url.replace(/\/$/, '');
  const { host, ext, card } = uiHost();
  const LEFT = 0x10100;

  interface Side {
    name: string;
    ui: PlazaUi;
    net: SocketIoOnline | FakeOnline;
    next: number;
    x: number;
    /** follow.ts 와 같은 규칙(키 스테이션#순번, 이탈 = 스테이션의 모든 순번)으로 'net:remote'·'net:remoteLeft' 를 받아 둔 3D 원격 표 */
    shown: Set<string>;
    sounds: string[];
    disp: Map<string, RemoteMotion>;
    mover: PlazaMover | null;
    lever: Lever;
    lastPos: THREE.Vector3 | null;
  }
  const sides: Side[] = [];
  const make = (name: string, chara: number, x: number, net?: FakeOnline, b = base): Side => {
    const n = net ?? new SocketIoOnline({ base: b, self: { name, chara, humans: 1 }, io, timeout: 3 });
    const players = [{ slot: 0, chara, isCom: false, name }];
    const s: Side = { name, ui: null as unknown as PlazaUi, net: n, next: 0, x, shown: new Set(), sounds: [], disp: new Map(), mover: null, lever: NO_LEVER, lastPos: null };
    s.ui = new PlazaUi({ host, extra: ext, net: n, players: () => players, pads: { poll: () => ({ hold: 0, trig: 0 }) }, sound: { playSe: (l: string) => s.sounds.push(l) } as never, card, selfCard: defaultCard(`${name}-card`, name) });
    sides.push(s);
    return s;
  };
  const step = (s: Side): void => {
    const t = s.next;
    s.next = 0;
    s.mover?.tick(s.lever);
    for (const m of s.disp.values()) m.tick();
    s.ui.out.length = 0;
    s.ui.tick(DT, new Map([[0, { hold: t, trig: t }]]));
    if (s.mover) {
      const p = s.mover.pos;
      const lp = s.lastPos ?? p.clone();
      s.lastPos = p.clone();
      const yaw = THREE.MathUtils.degToRad(s.mover.yaw);
      s.ui.sendLocal(DT, 0, 0, [(p.x - lp.x) / DT, (p.y - lp.y) / DT, (p.z - lp.z) / DT, 0], [p.x, p.y, p.z], [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], s.ui.takeSendAll());
    } else s.ui.sendLocal(DT, 0, 0, [0, 0, 0, 0], [s.x, -2.4, 21], [0, 1, 0, 0], s.ui.takeSendAll());
    for (const e of s.ui.out) {
      if (e.t === 'remote') {
        const k = `${e.station}#${e.slot}`;
        s.shown.add(k);
        const pos = new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);
        const yaw = THREE.MathUtils.radToDeg(2 * Math.atan2(e.quat[1], e.quat[3]));
        const d = s.disp.get(k);
        if (d) d.receive(pos, yaw);
        else {
          const m = new RemoteMotion(new PlazaMover({ radius: 0.9, height: 1.6 }, null));
          m.spawn(pos, yaw);
          s.disp.set(k, m);
        }
      } else if (e.t === 'remoteLeft') {
        for (const k of [...s.shown]) if (k.startsWith(`${e.station}#`)) s.shown.delete(k);
        for (const k of [...s.disp.keys()]) if (k.startsWith(`${e.station}#`)) s.disp.delete(k);
      }
    }
  };
  const run = async (pred: () => boolean, max = 8000): Promise<boolean> => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
      for (const s of sides) step(s);
      if (pred()) return true;
      await sleep(2);
    }
    return false;
  };
  const press = async (s: Side, bits: number): Promise<void> => {
    s.next = bits;
    for (const x of sides) step(x);
    await sleep(1);
  };
  const flow = (s: Side) => s.ui.online?.flow ?? null;
  const stations = (s: Side): string[] => [...new Set([...s.ui.remote.actors.values()].map((a) => a.station))].sort();
  const shownSt = (s: Side): string[] => [...new Set([...s.shown].map((k) => k.split('#')[0]))].sort();
  const remoteSt = (s: Side): string[] => [...new Set((s.ui.room?.members ?? []).filter((m) => !m.local).map((m) => m.station))].sort();
  const names = (s: Side): string[] => [...s.ui.status.bySlot.values()].map((p) => p.name);
  const idleMain = (s: Side): Promise<boolean> => run(() => s.ui.main && s.ui.onlineGuide.life.st === 1 && !s.ui.online);
  const openFriend = async (s: Side): Promise<boolean> => {
    await idleMain(s);
    await press(s, 0x8);
    return run(() => !!flow(s)?.netMenu.life.idle);
  };
  const create = async (s: Side): Promise<boolean> => {
    if (!(await openFriend(s))) return false;
    await run(() => false, 300);
    await press(s, BTN.A);
    if (!(await run(() => !!flow(s)?.roomType.life.idle))) return false;
    await run(() => false, 300);
    await press(s, BTN.A);
    if (!(await run(() => !!flow(s)?.dialog.life.idle && flow(s)!.dialog.result < 0))) return false;
    await press(s, BTN.A);
    return run(() => flow(s)?.step === 'lobby:host' && s.ui.main);
  };
  const openList = async (s: Side): Promise<boolean> => {
    if (!(await openFriend(s))) return false;
    await run(() => false, 300);
    await press(s, 0x40200);
    await run(() => false, 200);
    await press(s, BTN.A);
    return run(() => !!flow(s)?.list.life.idle && flow(s)!.busy === 0 && !flow(s)!.list.rowsAnimating());
  };
  const joinFirst = async (s: Side): Promise<boolean> => {
    await run(() => false, 1200);
    await press(s, BTN.A);
    if (!(await run(() => !!flow(s)?.dialog.life.idle && flow(s)!.dialog.result < 0))) return false;
    await press(s, BTN.A);
    return run(() => flow(s)?.step === 'lobby:client' && s.ui.main, 10000);
  };
  const confirmYes = async (s: Side): Promise<boolean> => {
    await run(() => !!flow(s)?.lobby.life.idle && !flow(s)!.dialog.working, 3000);
    await press(s, BTN.B);
    if (!(await run(() => !!flow(s)?.dialog.life.idle && flow(s)!.dialog.result < 0))) return false;
    await press(s, LEFT);
    await run(() => false, 100);
    await press(s, BTN.A);
    return true;
  };
  const closeError = async (s: Side, label: string): Promise<boolean> => {
    if (!(await run(() => flow(s)?.step === `error:${label}` && !!flow(s)?.dialog.life.idle))) return false;
    await press(s, BTN.A);
    return run(() => !s.ui.online);
  };
  const solo = (s: Side, what: string): void => {
    eq([!!s.ui.online, !!s.ui.room, stations(s), [...s.shown]], [false, false, [], []], `${what}: 혼자 광장(흐름 끝·방 없음·원격 표·3D 없음)`);
    eq(s.disp.size, 0, `${what}: 원격 표시 actor(보간기) 없음`);
    if (s.net instanceof SocketIoOnline) eq(s.net.socketOpen, false, `${what}: 소켓 닫힘`);
  };

  try {
    const H = make('Aya', 0, 1);
    const C = make('Bo', 3, -1);
    const D = make('Cy', 5, 0);
    ok(await create(H), '방장 방 만들기 → 대기실');
    const roomId = H.ui.room!.id;
    ok(await openList(C), '손님 방 찾기 목록');
    eq(flow(C)!.rooms.map((r) => [r.id, r.host, r.members]), [[roomId, 'Aya', [0]]], '목록 = 방장 방(방장 이름·캐릭터)');
    ok(await joinFirst(C), '손님 참가 → 대기실');
    ok(await run(() => stations(H).length === 1 && stations(C).length === 1 && shownSt(H).length === 1 && shownSt(C).length === 1), '양쪽 광장에 서로 보임(원격 표·3D)');
    eq([names(H), names(C)], [['Aya', 'Bo'], ['Aya', 'Bo']], '하단 줄 양쪽');

    console.log('  원격 위치 보간(실제 서버·두 광장 UI → 표시 actor 의 AutoInterpolation 하나, 12_online_sync §6.2.1)');
    eq(C.disp.size, 1, '손님 화면 원격 표시 actor 1');
    const hKey = [...C.disp.keys()][0];
    const disp = C.disp.get(hKey)!;
    ok(Math.abs(disp.mover.pos.x - H.x) < 1e-6 && disp.mode === 'spawn', '첫 표시 = sendAll 좌표');
    H.mover = new PlazaMover({ radius: 0.9, height: 1.6 }, null);
    H.mover.place(new THREE.Vector3(H.x, -2.4, 21), 180);
    const errOf = (): number => Math.hypot(H.mover!.pos.x - disp.mover.pos.x, H.mover!.pos.z - disp.mover.pos.z);
    const trial = async (depth: number, moveTicks: number): Promise<{ maxErr: number; finalErr: number; modes: Record<string, number>; acts: Record<string, number>; lastWire: number }> => {
      const modes: Record<string, number> = {};
      const acts: Record<string, number> = {};
      let rx = disp.rx;
      let maxErr = 0;
      H.lever = leverToward(1, 0, depth);
      for (let i = 0; i < moveTicks + 90; i++) {
        if (i === moveTicks) H.lever = NO_LEVER;
        for (const s of sides) step(s);
        acts[disp.mover.action] = (acts[disp.mover.action] ?? 0) + 1;
        if (disp.rx !== rx) {
          modes[disp.mode] = (modes[disp.mode] ?? 0) + 1;
          rx = disp.rx;
        }
        if (i < moveTicks) maxErr = Math.max(maxErr, errOf());
        await sleep(2);
      }
      return { maxErr, finalErr: errOf(), modes, acts, lastWire: C.ui.remote.actors.get(hKey)!.pos[0] };
    };
    const walk = await trial(0.5, 120);
    console.log(`   걷기 2 m/s 2 s: 틱별 최대 오차 ${walk.maxErr.toFixed(3)} m, 멈춘 뒤 ${walk.finalErr.toFixed(3)} m(송신자 x ${H.mover.pos.x.toFixed(3)}·마지막 수신 ${walk.lastWire.toFixed(3)}·표시 ${disp.mover.pos.x.toFixed(3)}), 수신 분기 ${JSON.stringify(walk.modes)}, 표시 액션 ${JSON.stringify(walk.acts)}`);
    ok((walk.modes.rotate ?? 0) > 0 && (walk.modes.interp ?? 0) > 0, '걷기: 표시 위치 기준 ≤ 1 회전만·> 1 보간이 섞임');
    ok(walk.maxErr <= 1 + (13 / 60) * 2 + 0.3, `걷기 틱별 오차 ≤ 1 + 13틱×2 m/s + 지연 여유 0.3: ${walk.maxErr.toFixed(3)}`);
    ok(!walk.acts.Walk, '표시 actor 보간 = Run(속도 6)');
    ok(walk.finalErr <= 1 + (13 / 60) * 2 + 1e-6, `걷기 멈춘 뒤 차이 ≤ 회전만 1 + 미송신 13틱: ${walk.finalErr.toFixed(3)}`);
    const runR = await trial(1, 120);
    console.log(`   달리기 6 m/s 2 s: 틱별 최대 오차 ${runR.maxErr.toFixed(3)} m, 멈춘 뒤 ${runR.finalErr.toFixed(3)} m(송신자 x ${H.mover.pos.x.toFixed(3)}·마지막 수신 ${runR.lastWire.toFixed(3)}·표시 ${disp.mover.pos.x.toFixed(3)}), 수신 분기 ${JSON.stringify(runR.modes)}, 표시 액션 ${JSON.stringify(runR.acts)}`);
    ok((runR.modes.interp ?? 0) >= 8 && (runR.modes.rotate ?? 0) <= 1, '달리기: 출발 첫 패킷 말고 모두 보간');
    ok(runR.maxErr <= (13 / 60) * 6 + 0.1 + 0.6, `달리기 틱별 오차 ≤ 13틱×6 m/s + 한 틱 + 지연 여유 0.6: ${runR.maxErr.toFixed(3)}`);
    ok(runR.finalErr <= (13 / 60) * 6 + 1e-6, `달리기 멈춘 뒤 차이 ≤ 미송신 13틱: ${runR.finalErr.toFixed(3)}`);
    ok(Math.abs(disp.mover.pos.x - runR.lastWire) <= 1 + 1e-6, '멈춘 뒤 표시 = 마지막 수신에서 ≤ 1(회전만 구간)');
    const sentStop = (H.net as SocketIoOnline).stat.sent;
    for (let i = 0; i < 30; i++) {
      for (const s of sides) step(s);
      await sleep(2);
    }
    eq((H.net as SocketIoOnline).stat.sent, sentStop, '정지 뒤 위치 추가 송신 없음(원본과 같음)');
    const tpX = H.mover.pos.x - 8;
    H.mover.place(new THREE.Vector3(tpX, -2.4, 21), 90);
    ok(await run(() => disp.mode === 'teleport'), '송신자 8 m 이동 → 표시 위치 기준 > 5 순간이동');
    ok(Math.abs(disp.mover.pos.x - tpX) < 0.01, `순간이동 = 받은 좌표 즉시: ${disp.mover.pos.x.toFixed(3)}`);
    H.x = H.mover.pos.x;
    H.mover = null;
    H.lastPos = null;
    ok(await openList(D), '셋째 방 찾기');
    eq(flow(D)!.rooms.map((r) => [r.id, r.members]), [[roomId, [0, 3]]], '목록 인원 = 2(참가 반영)');
    ok(await joinFirst(D), '셋째 참가');
    ok(await run(() => [H, C, D].every((s) => stations(s).length === 2 && shownSt(s).length === 2 && s.ui.status.bySlot.size === 3)), '세 명 서로 보임·하단 줄 3칸');
    eq(flow(H)!.lobbyState().count, 3, '방장 인원 텔롭 3');

    console.log('  손님 나가기');
    await run(() => !!H.ui.cardGuide?.shown);
    await press(H, 0x1000);
    eq(H.ui.card!.cards.map((x) => x.name), ['Aya', 'Bo', 'Cy'], '방장 카드 3장');
    const cSt = remoteSt(H).find((st) => H.ui.room!.members.find((m) => m.station === st)?.name === 'Bo')!;
    ok(await confirmYes(C), '손님 B → 나가기 예');
    ok(await run(() => !C.ui.online && C.ui.main && !C.ui.status.online), '손님 = 흐름 끝, 혼자 광장 메인(원본: 나가기 뒤 광장, online.md 9.3)');
    solo(C, '나간 손님');
    eq(names(C), ['Bo'], '나간 손님 하단 줄 = 나만');
    ok(await run(() => !remoteSt(H).includes(cSt) && !stations(H).includes(cSt) && !shownSt(H).includes(cSt) && names(H).length === 2), '방장 화면: 나간 손님 원격·3D·하단 줄 사라짐');
    eq([names(H), names(D)], [['Aya', 'Cy'], ['Aya', 'Cy']], '남은 하단 줄');
    eq([flow(H)!.lobbyState().count, flow(D)!.lobbyState().count], [2, 2], '인원 텔롭 2');
    eq(H.ui.card!.cards.map((x) => x.name), ['Aya', 'Cy'], '열려 있던 카드 뷰어에서 나간 손님 카드 빠짐');
    ok([...H.ui.stamps.keys()].every((k) => !k.startsWith(`${cSt}#`)), '나간 손님 스탬프 칸 없음');
    await press(H, BTN.B);
    await run(() => H.ui.card!.finished);

    console.log('  같은 방 다시 참가');
    ok(await openList(C), '다시 방 찾기');
    eq(flow(C)!.rooms.map((r) => [r.id, r.members]), [[roomId, [0, 5]]], '목록 인원 = 2(나간 것 반영)');
    ok(await joinFirst(C), '다시 참가');
    ok(await run(() => [H, C, D].every((s) => stations(s).length === 2 && shownSt(s).length === 2 && s.ui.status.bySlot.size === 3)), '다시 셋: 잔상 없이 원격 2·3D 2·하단 줄 3');
    ok(!stations(H).includes(cSt) && !shownSt(H).includes(cSt), '이전 스테이션 잔상 없음');
    ok([H, C, D].every((s) => s.disp.size === 2) && ![...H.disp.keys()].some((k) => k.startsWith(`${cSt}#`)), '다시 셋: 원격 표시 actor(보간기) 2·이전 스테이션 잔상 없음');
    eq(stations(H), remoteSt(H), '방장 원격 표 = 방 멤버 스테이션');

    console.log('  네트워크 끊김(핑 시간 초과)');
    const dSt = remoteSt(H).find((st) => H.ui.room!.members.find((m) => m.station === st)?.name === 'Cy')!;
    const eng = engineOf(D.net as SocketIoOnline)!;
    eng.sendPacket = () => {};
    eng.onPacket = () => {};
    const t0 = Date.now();
    ok(await run(() => !remoteSt(H).includes(dSt) && !stations(H).includes(dSt) && !shownSt(H).includes(dSt) && !stations(C).includes(dSt) && !shownSt(C).includes(dSt), 5000), '서버 핑 시간 초과 → 남은 사람 화면에서 정리');
    console.log(`   끊김 → 정리 ${Date.now() - t0} ms (핑 간격 200 + 시간 초과 300)`);
    ok(await closeError(D, 'sys_error_B3'), '끊긴 쪽 = 통신 오류 B3 대화상자 → 닫으면 광장');
    solo(D, '끊긴 쪽');

    console.log('  탭 닫기(전송 끊김)');
    const cSt2 = remoteSt(H)[0];
    engineOf(C.net as SocketIoOnline)!.close();
    ok(await run(() => remoteSt(H).length === 0 && stations(H).length === 0 && shownSt(H).length === 0 && names(H).length === 1, 3000), '탭 닫음 → 방장 화면 즉시 정리');
    ok(!stations(H).includes(cSt2), '닫은 탭 스테이션 없음');
    await closeError(C, 'sys_error_B3');

    console.log('  방장 해산');
    ok(await openList(C), '손님 다시 찾기');
    ok(await joinFirst(C), '손님 다시 참가');
    ok(await openList(D), '셋째 다시 찾기');
    ok(await joinFirst(D), '셋째 다시 참가');
    ok(await run(() => [H, C, D].every((s) => stations(s).length === 2 && shownSt(s).length === 2)), '해산 전 셋');
    ok(await confirmYes(H), '방장 B → 해산 예');
    ok(await run(() => !H.ui.online && H.ui.main && !H.ui.status.online), '방장 = 혼자 광장 메인');
    solo(H, '해산한 방장');
    for (const s of [C, D]) {
      ok(await run(() => flow(s)?.step === 'error:mn01_friend_mw_lobby_dismiss_client' && !s.ui.room && stations(s).length === 0 && s.shown.size === 0), `${s.name}: 해산 알림 대화상자, 원격·3D 바로 정리`);
      ok(await closeError(s, 'mn01_friend_mw_lobby_dismiss_client'), `${s.name}: 닫으면 광장`);
      solo(s, `해산당한 ${s.name}`);
    }
    ok(!plaza.rooms.rooms.has(roomId), '서버에서 방 지움');
    ok(await openList(C), '해산 뒤 찾기');
    eq(flow(C)!.rooms.length, 0, '해산한 방은 목록에 없음');
    await press(C, BTN.B);
    await run(() => !C.ui.online, 6000);

    console.log('  방장 탭 닫기');
    ok(await create(H), '방장 다시 만들기');
    ok(await openList(C), '손님 찾기');
    ok(await joinFirst(C), '손님 참가');
    ok(await run(() => stations(H).length === 1 && shownSt(C).length === 1 && names(C).length === 2), '만남');
    engineOf(H.net as SocketIoOnline)!.close();
    ok(await run(() => flow(C)?.step === 'error:mn01_friend_mw_lobby_dismiss_client' && !C.ui.room && stations(C).length === 0 && C.shown.size === 0, 3000), '방장 탭 닫음 → 손님 해산 알림, 원격·3D 바로 정리');
    ok(await closeError(C, 'mn01_friend_mw_lobby_dismiss_client'), '닫으면 광장');
    solo(C, '방장 끊긴 손님');
    ok(await run(() => names(C).length === 1 && C.ui.status.bySlot.get(0)?.name === 'Bo'), '손님 하단 줄 = 나만');
    await closeError(H, 'sys_error_B3');
    solo(H, '탭 닫은 방장');
  } finally {
    await srv.close();
  }

  console.log('  목록 반영·참가 거절(SocketIoOnline)');
  const plaza2 = createPlaza();
  const srv2 = await startPlazaServer({ port: 0, build: false, games: [plaza2.game], routers: [plaza2.router] });
  const base2 = srv2.url.replace(/\/$/, '');
  try {
    const mk = (s: OnlineSelf) => new SocketIoOnline({ base: base2, self: s, io });
    const inbox = new Map<SocketIoOnline, OnlineEvent[]>();
    const nets: SocketIoOnline[] = [];
    const add = (s: OnlineSelf): SocketIoOnline => {
      const n = mk(s);
      nets.push(n);
      inbox.set(n, []);
      n.connect();
      return n;
    };
    const last = <T extends OnlineEvent['t']>(n: SocketIoOnline, t: T) => inbox.get(n)!.filter((e) => e.t === t).pop() as Extract<OnlineEvent, { t: T }> | undefined;
    const search = async (n: SocketIoOnline): Promise<string[]> => {
      inbox.get(n)!.length = 0;
      n.searchRooms(-1);
      await pump(nets, inbox, () => !!last(n, 'searchDone'));
      return last(n, 'searchDone')!.rooms.map((r) => `${r.id}:${r.members.length}`);
    };
    const A = add(self('Aya', 0));
    const S = add(self('See', 9));
    const P = add(self('Pw', 1));
    eq(await search(S), [], '처음 = 빈 목록');
    A.createRoom(4, '');
    await pump(nets, inbox, () => !!last(A, 'created'));
    const id = A.room()!.id;
    eq(await search(S), [`${id}:1`], '만들기 바로 반영');
    P.createRoom(4, '1234');
    await pump(nets, inbox, () => !!last(P, 'created'));
    const pid = P.room()!.id;
    const g1 = add(self('G1', 2));
    g1.joinRoom(pid, '9999');
    ok(await pump(nets, inbox, () => !!last(g1, 'joinFailed')), '비밀번호 틀림 → 거절');
    eq(last(g1, 'joinFailed')!.reason, 'password', '거절 이유 password');
    eq(g1.stat.sockets, 0, '거절은 소켓 안 엶');
    const gs = [add(self('G2', 3)), add(self('G3', 4)), add(self('G4', 6))];
    for (const g of gs) {
      g.joinRoom(id, '');
      ok(await pump(nets, inbox, () => !!last(g, 'joined')), `${g.opt.self.name} 참가`);
    }
    ok(!(await search(S)).some((x) => x.startsWith(id)), '가득 참 바로 반영(목록에서 빠짐)');
    const g5 = add(self('G5', 7));
    g5.joinRoom(id, '');
    ok(await pump(nets, inbox, () => !!last(g5, 'joinFailed')), '가득 찬 방 → 거절');
    eq(last(g5, 'joinFailed')!.reason, 'full', '거절 이유 full');
    gs[2].leaveRoom();
    await pump(nets, inbox, () => A.room()!.members.length === 3);
    ok((await search(S)).includes(`${id}:3`), '한 명 나가면 다시 목록에');
    A.startRoom();
    await pump(nets, inbox, () => !!last(A, 'started'));
    ok(!(await search(S)).some((x) => x.startsWith(id)), '시작됨 바로 반영(목록에서 빠짐)');
    P.dissolveRoom();
    await pump(nets, inbox, () => !plaza2.rooms.rooms.has(pid));
    eq(await search(S), [], '해산 바로 반영');
    for (const n of nets) n.disconnect();
  } finally {
    await srv2.close();
  }

  console.log('  서버 없음 → 통신 오류 대화상자, 광장 계속');
  sides.length = 0;
  const X = make('Xo', 2, 0, undefined, 'http://127.0.0.1:9');
  ok(await openList(X) || flow(X)?.step.startsWith('error:') === true, '서버 없이 방 찾기');
  ok(await closeError(X, 'sys_error_B3'), '방 찾기 HTTP 실패 → sys_error_B3 대화상자 → 닫으면 광장');
  ok(await run(() => X.ui.main), '광장 메인 계속');
  solo(X, '서버 없음');
  ok(await openFriend(X), '다시 메뉴');
  await run(() => false, 300);
  await press(X, BTN.A);
  await run(() => !!flow(X)?.roomType.life.idle);
  await run(() => false, 300);
  await press(X, BTN.A);
  await run(() => !!flow(X)?.dialog.life.idle && flow(X)!.dialog.result < 0);
  await press(X, BTN.A);
  ok(await closeError(X, 'sys_error_B3'), '방 만들기 HTTP 실패 → sys_error_B3 → 광장');
  solo(X, '서버 없음 만들기');

  console.log('  가짜 어댑터(?online=fake)도 같은 정리');
  sides.length = 0;
  const fake = new FakeOnline({ rooms: 0, joinInterval: 0.5, leaveAfter: 0, error: 'none', seed: 7, matchSec: 4, self: { name: 'Fk', chara: 0, humans: 1 }, remoteMove: true, stampEvery: 0 });
  const F = make('Fk', 0, 0, fake);
  ok(await create(F), '가짜 방 만들기');
  ok(await run(() => stations(F).length >= 2 && shownSt(F).length >= 2), '가짜 멤버 원격·3D');
  ok(await confirmYes(F), '가짜 해산');
  ok(await run(() => !F.ui.online && F.ui.main), '가짜: 혼자 광장');
  await run(() => false, 1000);
  solo(F, '가짜 해산 1 s 뒤');
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
