/**
 * 온라인 화면 상태 시험 — script/app/scene/menu/online 을 실제 명세(assets/mgmcommon/spec.json + assets/online/online.json + assets/mgm01/faces.json)와
 * 가짜 어댑터(FakeOnline)로 노드에서 돈다(WebGL 없음). 기대값 근거: docs/shell/online.md 4~6절(판독 규칙의 재구현 시험, 원본 실행 대조 아님).
 * 흐름: 메뉴 → 방 만들기(4/8·패스워드)/찾기(목록·방 ID) → 대기실(입장·준비·정보·해산/나가기·시작) → 전 세계 매칭(찾기·취소·실패 재시도).
 * 사건이 가리키는 페인 경로·쓰는 라벨이 명세에 있는지도 함께 본다.
 *
 *   npx tsx tools/test_online.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Render2D } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk } from './fontSpecNode';
import { mergeSpec, type MgmDrawHost, type MgmPadSource, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';
import {
  applyOnlineExtra,
  BTN,
  FakeOnline,
  KOOPA,
  LAYOUT,
  OnlineScreen,
  SessionListView,
  type FakeError,
  type OEv,
  type OIO,
  type OnlineEntry,
  type OnlineExtra,
} from '@app/scene/menu/online';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
const read = <T>(p: string): T => JSON.parse(readFileSync(join(WEB, 'assets', p), 'utf8')) as T;

const part = read<MgmSpecPart & OnlineExtra>('online/online.json');
let spec = mergeSpec(read<MgmSpec>('mgmcommon/spec.json'), part);
spec = mergeSpec(spec, read<MgmSpecPart>('mgm01/faces.json'));
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
applyOnlineExtra(spec, part);
const all = spec as unknown as Spec;
const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} };

class Pads implements MgmPadSource {
  private next = 0;
  holdBits = 0;
  press(bits: number): void {
    this.next |= bits;
  }
  poll(pid: number): { hold: number; trig: number } {
    if (pid !== 0) return { hold: 0, trig: 0 };
    const t = this.next;
    this.next = 0;
    return { hold: this.holdBits | t, trig: t };
  }
}

const badPaths = new Set<string>();
const usedLabels = new Set<string>();

function make(entry: OnlineEntry, o: { error?: FakeError; humans?: number; chara?: number; rooms?: number; joinInterval?: number; leaveAfter?: number; first?: boolean; matchSec?: number } = {}) {
  const pads = new Pads();
  const net = new FakeOnline({
    rooms: o.rooms ?? 7,
    joinInterval: o.joinInterval ?? 2,
    leaveAfter: o.leaveAfter ?? 0,
    error: o.error ?? 'none',
    seed: 7,
    matchSec: o.matchSec ?? 3,
    self: { name: 'Tester', chara: o.chara ?? 0, humans: o.humans ?? 1 },
  });
  const s = new OnlineScreen({ host, net, self: { name: 'Tester', chara: o.chara ?? 0, humans: o.humans ?? 1 }, pads, entry, firstOnline: o.first ?? false });
  const push = s.view.push.bind(s.view);
  s.view.push = (e: OEv): void => {
    if ('l' in e && 'path' in e && e.path && !e.path.startsWith('#')) {
      if (!s.view.inst[e.l].find(e.path)) badPaths.add(`${LAYOUT[e.l]}:${e.path}`);
    }
    if (e.t === 'text' || e.t === 'notice') {
      usedLabels.add(e.label);
      if (!(e.label in spec.texts)) badPaths.add(`라벨 없음 ${e.label}`);
    }
    if (e.t === 'guide') for (const l of e.labels ?? []) if (!(l in spec.texts)) badPaths.add(`라벨 없음 ${l}`);
    if (e.t === 'raw' && e.path.startsWith('#digit:') && !s.view.inst[e.l].find(e.path.slice(7))) badPaths.add(`${LAYOUT[e.l]}:${e.path}`);
    push(e);
  };
  return { s, pads, net };
}

type Ctx = ReturnType<typeof make>;
function until(c: Ctx, pred: () => boolean, max = 1200): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    c.s.tick(DT);
  }
  return -1;
}
function frames(c: Ctx, n: number): void {
  for (let i = 0; i < n; i++) c.s.tick(DT);
}
/** 누르고 다음 틱 */
function press(c: Ctx, bits: number, after = 1): void {
  c.pads.press(bits);
  frames(c, after);
}
const dlgIdle = (c: Ctx) => (): boolean => c.s.flow.dialog.life.idle && c.s.flow.dialog.result < 0;
const kpIdle = (c: Ctx) => (): boolean => c.s.flow.keypad.life.idle && c.s.flow.keypad.result === undefined;
const lastDialogLabel = (c: Ctx): string => {
  const e = [...c.s.view.log].reverse().find((x) => x.t === 'text' && x.l === 'dialog' && x.path === 'x_text');
  return e && e.t === 'text' ? e.label : '';
};

// ── 1. 방 만들기(4인, 패스워드 없음) → 대기실 방장 → 입장·준비 → 방 정보 → 시작 ──
{
  console.log('1. 방 만들기 → 대기실(방장) → 시작');
  const c = make('friend', { first: true });
  ok(until(c, dlgIdle(c)) >= 0, '첫 접속 안내 대화상자');
  eq(lastDialogLabel(c), 'sys_network_check_dlg00', '안내 1');
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '안내 2');
  eq(lastDialogLabel(c), 'sys_network_check_dlg01', '안내 2 라벨');
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.netMenu.life.idle) >= 0, '방 만들기/찾기 대기');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'sys_network_load_tlp'), '로딩 텔롭 문구');
  eq(c.s.flow.netMenu.sel, 0, '기본 선택 = 방 만들기');
  frames(c, 30);
  press(c, BTN.RIGHT);
  eq(c.s.flow.netMenu.sel, 1, '오른쪽 → 찾기');
  frames(c, 30);
  press(c, BTN.RIGHT);
  eq(c.s.flow.netMenu.sel, 1, '넘김 없음');
  press(c, BTN.LEFT);
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'roomType' && c.s.flow.roomType.life.idle) >= 0, '방 종류');
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '패스워드 확인 대화상자');
  eq(lastDialogLabel(c), 'mn01_friend_mw_roomSet_passCheck', '패스워드 확인');
  eq(c.s.flow.dialog.cursor, 1, '기본 커서 = 설정하지 않는다');
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'lobby:host') >= 0, '대기실(방장)');
  eq(c.s.flow.room?.size, 4, '4인 방');
  eq(c.s.flow.room?.password, '', '패스워드 없음');
  frames(c, 30);
  eq(c.s.flow.lobby.telop, 0, '혼자 = 대기 텔롭');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mn01_friend_ctrl_lobby_info'), '방장 안내 방 정보');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mn01_friend_ctrl_lobby_dismiss'), '방장 안내 해산');
  ok(until(c, () => (c.s.flow.room?.members.length ?? 0) >= 3) >= 0, '시간차 입장 2명');
  frames(c, 40);
  ok(c.s.view.notices.some((n) => n.includes('님이 참가했습니다')), '입장 알림');
  eq(c.s.flow.lobby.telop, 1, '모두 데이터 받음 = 출발 가능 텔롭');
  eq(c.s.flow.lobby.count, c.s.flow.room?.members.length, '인원 수 = 데이터 받은 인원');
  press(c, BTN.Y);
  ok(until(c, () => c.s.flow.info.life.idle) >= 0, '방 정보 창');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mn01_friend_ui_info_ID'), '방 ID 표시');
  press(c, BTN.B);
  ok(until(c, () => c.s.flow.info.life.finished) >= 0, '방 정보 닫힘');
  frames(c, 5);
  press(c, BTN.A);
  ok(until(c, () => c.s.finished) >= 0, '시작');
  eq(c.s.flow.result, 'started', '결과 started');
}

// ── 2. 패스워드 설정 + 8인 방(사람 1명) + 쿠파 확인 ──
{
  console.log('2. 8인 방 + 쿠파 + 패스워드');
  const c = make('friend', { chara: KOOPA, joinInterval: 0 });
  ok(until(c, () => c.s.flow.netMenu.life.idle) >= 0, '메뉴');
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.roomType.life.idle) >= 0, '방 종류');
  frames(c, 30);
  eq(c.s.flow.roomType.enabled, [true, true], '사람 1명 = 8인 켬');
  press(c, BTN.RIGHT);
  frames(c, 30);
  eq(c.s.flow.roomType.sel, 1, '8인 선택');
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '쿠파 대화상자');
  eq(lastDialogLabel(c), 'mn01_friend_mw_search_koopaChange', '쿠파 금지 문구');
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '패스워드 확인');
  ok(c.s.flow.self.chara !== KOOPA, '캐릭터 바뀜');
  press(c, BTN.LEFT);
  press(c, BTN.A);
  ok(until(c, kpIdle(c)) >= 0, '숫자 입력');
  press(c, BTN.UP);
  press(c, BTN.UP);
  press(c, BTN.RIGHT);
  press(c, BTN.DOWN);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'lobby:host') >= 0, '대기실');
  eq(c.s.flow.room?.size, 8, '8인 방');
  eq(c.s.flow.room?.password, '2900', '패스워드 2900');
  frames(c, 30);
  press(c, BTN.B);
  ok(until(c, dlgIdle(c)) >= 0, '해산 확인');
  eq(lastDialogLabel(c), 'mn01_friend_mw_lobby_dismiss', '해산 문구');
  eq(c.s.flow.dialog.cursor, 1, '기본 = 아니요');
  press(c, BTN.LEFT);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'netMenu') >= 0, '해산 → 메뉴로');
}

// ── 3. 사람 2명: 8인 끔 + 안내 대화상자 ──
{
  console.log('3. 사람 2명 8인 방 막힘');
  const c = make('friend', { humans: 2 });
  ok(until(c, () => c.s.flow.netMenu.life.idle) >= 0, '메뉴');
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.roomType.life.idle) >= 0, '방 종류');
  frames(c, 30);
  eq(c.s.flow.roomType.enabled, [true, false], '8인 끔');
  press(c, BTN.RIGHT);
  eq(c.s.flow.roomType.sel, 0, '끈 버튼으로 못 감');
  press(c, BTN.B);
  ok(until(c, () => c.s.flow.step === 'netMenu') >= 0, 'B → 메뉴');
}

// ── 4. 방 찾기 → 목록 → 참가 → 대기실(참가자) → 나가기 ──
{
  console.log('4. 방 찾기 → 참가 → 나가기');
  const c = make('friend', { joinInterval: 0 });
  ok(until(c, () => c.s.flow.netMenu.life.idle) >= 0, '메뉴');
  frames(c, 30);
  press(c, BTN.RIGHT);
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'sessionList' && c.s.flow.rooms.length > 0) >= 0, '검색 결과');
  ok(c.s.view.notices.some((n) => n.includes('방을 찾고 있습니다')), '찾는 중 알림');
  const rooms = c.s.flow.rooms;
  ok(rooms.every((r) => r.size === 4), '처음 = 4인 방');
  ok(rooms.every((r) => r.members.length > 0 && r.members.length < r.size), '거르기(0 < 인원 < 최대)');
  frames(c, 40);
  const L = c.s.flow.list;
  press(c, BTN.DPAD_UP);
  eq(L.cursor, rooms.length - 1, '위 누름 = 마지막으로 넘김');
  press(c, BTN.DPAD_DOWN);
  eq(L.cursor, 0, '아래 누름 = 처음으로');
  const target = rooms.findIndex((r) => !r.locked);
  for (let i = 0; i < target; i++) press(c, BTN.DPAD_DOWN, 2);
  eq(L.cursor, target, '자물쇠 없는 방으로');
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '참가 확인');
  eq(lastDialogLabel(c), 'mn01_friend_mw_search_join', '참가 확인 문구');
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'lobby:client', 2400) >= 0, '대기실(참가자)');
  frames(c, 30);
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mn01_friend_ctrl_lobby_leave'), '참가자 안내 = 방 나가기');
  eq(c.s.flow.lobby.telop, 1, '참가자 모두 준비 = 출발 가능');
  press(c, BTN.B);
  ok(until(c, dlgIdle(c)) >= 0, '나가기 확인');
  eq(lastDialogLabel(c), 'mn01_friend_mw_lobby_leave', '나가기 문구');
  press(c, BTN.LEFT);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'netMenu') >= 0, '나가기 → 메뉴');
  eq(c.s.flow.netMenu.sel, 1, '지난 선택 유지(찾기)');
}

// ── 5. 방 ID 로 찾기 · 탭 · 자물쇠 방 패스워드 틀림 ──
{
  console.log('5. 방 ID·탭·패스워드');
  const c = make('friend', { joinInterval: 0 });
  ok(until(c, () => c.s.flow.netMenu.life.idle) >= 0, '메뉴');
  frames(c, 30);
  press(c, BTN.RIGHT);
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'sessionList' && c.s.flow.rooms.length > 0) >= 0, '목록');
  frames(c, 40);
  const locked = c.net.fakeRooms.find((r) => r.locked && r.size === 4 && r.members.length < 4)!;
  press(c, BTN.X);
  ok(until(c, kpIdle(c)) >= 0, '방 ID 입력');
  c.s.flow.keypad.set(locked.id);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.searchId === locked.id) >= 0, 'ID 모드');
  frames(c, 40);
  eq(c.s.flow.rooms.length, 1, 'ID 결과 1개');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mn01_friend_ui_search_detail02'), '"방을 찾았습니다."');
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '참가 확인');
  press(c, BTN.A);
  ok(until(c, kpIdle(c)) >= 0, '패스워드 입력(자물쇠 방)');
  press(c, BTN.A);
  ok(until(c, () => c.s.view.notices.some((n) => n.includes('참가하지 못했습니다'))) >= 0, '패스워드 틀림 → 참가 실패 알림');
  frames(c, 120);
  press(c, BTN.B);
  ok(until(c, () => c.s.flow.searchId === '') >= 0, 'B = 목록으로 돌아가기');
  frames(c, 120);
  press(c, BTN.TAB_R);
  ok(until(c, () => c.s.flow.list.type === 8 && c.s.flow.rooms.every((r) => r.size === 8)) >= 0, 'R = 8인 탭');
  frames(c, 120);
  press(c, BTN.TAB_L);
  ok(until(c, () => c.s.flow.list.type === 4 && c.s.flow.rooms.length > 0 && c.s.flow.rooms.every((r) => r.size === 4), 600) >= 0, 'L = 4인 탭');
  frames(c, 120);
  press(c, BTN.B);
  ok(until(c, () => c.s.flow.step === 'netMenu') >= 0, 'B → 메뉴');
}

// ── 6. 방장 해산(가짜 오류) → 오류 문구 ──
{
  console.log('6. 방장 해산 → 오류');
  const c = make('lobbyClient', { error: 'dissolve', joinInterval: 0 });
  ok(until(c, () => c.s.flow.step === 'lobby:client', 1200) >= 0, '바로 대기실(참가자)');
  ok(until(c, dlgIdle(c), 1200) >= 0, '오류 대화상자');
  eq(lastDialogLabel(c), 'mn01_friend_mw_lobby_dismiss_client', '호스트가 방을 해산했습니다');
  press(c, BTN.A);
  ok(until(c, () => c.s.finished) >= 0, '끝');
  eq(c.s.flow.result, 'error', '결과 error');
}

// ── 7. 접속 실패 ──
{
  console.log('7. 접속 실패');
  const c = make('friend', { error: 'connect' });
  ok(until(c, dlgIdle(c)) >= 0, '오류');
  eq(lastDialogLabel(c), 'sys_error_B3', '통신이 끊어졌습니다');
  press(c, BTN.A);
  ok(until(c, () => c.s.finished) >= 0, '끝');
  eq(c.s.flow.result, 'connectFailed', '결과');
}

// ── 8. 전 세계 매칭: 성공 ──
{
  console.log('8. 전 세계 매칭 성공');
  const c = make('world');
  ok(until(c, () => c.s.flow.opponent.life.idle) >= 0, '대전 상대 선택');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mn01_bd_ui_match_com'), '버튼 0 = CPU(사람 1명·세션 없음)');
  press(c, BTN.RIGHT);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'matchMake') >= 0, '매칭 시작');
  frames(c, 2);
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mtch00_tlp_wait'), '찾는 중 텔롭');
  ok(c.s.flow.timeLeft > 119 && c.s.flow.timeLeft <= 120, `타이머 120 s 시작 (${c.s.flow.timeLeft})`);
  ok(until(c, () => c.s.flow.step === 'setupSession') >= 0, '매칭 성공');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mtch00_tlp_loading'), '매칭 성공 텔롭');
  ok(until(c, () => c.s.flow.step === 'playerList') >= 0, '참가자 목록');
  eq(c.s.flow.members.members.length, 4, '4명');
  ok(c.s.view.log.some((e) => e.t === 'text' && e.label === 'mtch00_tlp_start'), '곧 시작 텔롭');
  ok(until(c, () => c.s.finished, 900) >= 0, '끝');
  eq(c.s.flow.result, 'started', '결과');
}

// ── 9. 매칭 취소·실패 재시도·혼자 세션 ──
{
  console.log('9. 매칭 취소 / 실패');
  const c = make('world', { matchSec: 30 });
  ok(until(c, () => c.s.flow.opponent.life.idle) >= 0, '선택');
  press(c, BTN.RIGHT);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'matchMake') >= 0, '매칭');
  frames(c, 30);
  press(c, 0x1000);
  ok(until(c, dlgIdle(c)) >= 0, '취소 확인');
  eq(lastDialogLabel(c), 'mtch00_dlg_cancel', '취소 문구');
  press(c, BTN.LEFT);
  press(c, BTN.A);
  ok(until(c, () => c.s.finished) >= 0, '끝');
  eq(c.s.flow.result, 'cancel', '취소');

  const d = make('world', { error: 'match', matchSec: 1 });
  ok(until(d, () => d.s.flow.opponent.life.idle) >= 0, '선택');
  press(d, BTN.RIGHT);
  press(d, BTN.A);
  ok(until(d, dlgIdle(d), 1200) >= 0, '실패 대화상자');
  eq(lastDialogLabel(d), 'sys_error_E', '참가자를 찾지 못했습니다');
  press(d, BTN.A);
  const solo = until(d, () => d.s.flow.history.includes('soloSession'), 1200);
  ok(solo >= 0, `두 번째 실패 = FAIL_LIMIT 2 → 혼자 세션 (${d.s.flow.history.slice(-8).join(' ')})`);
  ok(until(d, () => d.s.finished, 900) >= 0, '끝');
  eq(d.s.flow.result, 'started', '결과');

  const e = make('world', { humans: 2 });
  ok(until(e, () => e.s.flow.opponent.life.idle) >= 0, '선택');
  eq(e.s.flow.opponent.enabled, [true, false], '사람 2명 = 전 세계 끔');
  ok(e.s.view.log.some((x) => x.t === 'text' && x.label === 'mn01_bd_ui_match_local'), '버튼 0 = 가까이 있는 사람');
  press(e, BTN.RIGHT);
  eq(e.s.flow.opponent.sel, 0, '못 감');
}

// ── 10. 순수: 목록 커서 반복 입력 ──
{
  console.log('10. 목록 커서 규칙');
  const evs: OEv[] = [];
  const L = new SessionListView({ push: (e) => evs.push(e) });
  const io = (trig: number, rep: number, hold = 0): OIO => ({ trig, rep, hold, done: () => true });
  L.cursor = 6;
  L.top = 2;
  ok(!L.move(io(0, BTN.DOWN), 7), '반복 아래 끝 = 멈춤');
  ok(L.move(io(BTN.DOWN, BTN.DOWN), 7) && L.cursor === 0 && L.top === 0, '누름 아래 끝 = 처음, 첫 칸 0');
  ok(!L.move(io(0, BTN.UP), 7), '반복 위 0 = 멈춤');
  ok(L.move(io(BTN.UP, 0), 7) && L.cursor === 6 && L.top === 2, '누름 위 0 = 마지막, 첫 칸 n−5');
}

// ── 12. 대화상자 크기·사용자명·알림 (online.md 9.3 정정) ──
{
  console.log('12. 대화상자 크기·사용자명·알림');
  const c = make('friend', { joinInterval: 0 });
  ok(until(c, () => c.s.flow.netMenu.life.idle) >= 0, '메뉴');
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.roomType.life.idle) >= 0, '방 종류');
  frames(c, 30);
  press(c, BTN.A);
  ok(until(c, dlgIdle(c)) >= 0, '패스워드 확인(선택지 3)');
  const d = c.s.view.inst.dialog;
  const win = d.find('x_win_dialog')!;
  const W = win[0].nodes[win[1]].z;
  const btn = (i: number): number => d.part(`x_choise_0${i}`)!.find('x_btn')![0].nodes[d.part(`x_choise_0${i}`)!.find('x_btn')![1]].z[0];
  const w = btn(0);
  ok(w >= 360 && w <= 520, `버튼 폭 clamp(min(520, 글자+240), 360) = ${w}`);
  eq(btn(1), w, '모든 칸 같은 폭');
  ok(Math.abs(W[0] - Math.max(3 * w + 200, 1234)) < 0.01, `창 폭 = max(3w+200, 1234) = ${W[0]}`);
  ok(W[1] >= 426 && W[1] <= 954, `창 높이 clamp = ${W[1]}`);
  const xs = [0, 1, 2].map((i) => { const f = d.find(`x_choise_0${i}`)!; return f[0].nodes[f[1]].t[0]; });
  ok(Math.abs(xs[1] - xs[0] - (w + 20)) < 0.01 && Math.abs(xs[2] - xs[1] - (w + 20)) < 0.01 && Math.abs(xs[1]) < 0.01, `칸 간격 w+20, 가운데 (${xs.map((x) => x.toFixed(1)).join(',')})`);
  const lt = win[0].nodes[win[0].byName.get('x_win_dialog#RT')!];
  ok(Math.abs(lt.t[0] - (W[0] / 2 - lt.spec.z[0] / 2)) < 0.01, '창 조각 오른쪽 위 모서리 재배치');
  press(c, BTN.A);
  ok(until(c, () => c.s.flow.step === 'lobby:host') >= 0, '대기실');

  const e = make('friend', { joinInterval: 0 });
  ok(until(e, () => e.s.flow.netMenu.life.idle) >= 0, '메뉴');
  frames(e, 30);
  press(e, BTN.RIGHT);
  frames(e, 30);
  press(e, BTN.A);
  ok(until(e, () => e.s.flow.step === 'sessionList' && e.s.flow.rooms.length > 0 && e.s.flow.list.rowAnim.some((a) => a !== 6)) >= 0, '목록');
  const li = e.s.view.inst.list;
  const f1 = li.find('x_btn_00/x_parts_username/x_text_01')!;
  eq(f1[0].texts.get(f1[1]), e.s.flow.rooms[0].host, '방장 이름 = 보이는 x_text_01');
  ok(f1[0].nodes[f1[1]].v, 'x_text_01 보임(부품 덮어쓰기)');
  const n = e.s.view as unknown as { notice: LayoutInst };
  ok(!n.notice.find('x_pict')![0].nodes[n.notice.find('x_pict')![1]].v, '찾는 중 알림 = 아이콘 숨김');
  ok(n.notice.find('x_text_01')![0].nodes[n.notice.find('x_text_01')![1]].v, '참가 외 알림 = x_text_01');
  eq(Math.round(n.notice.find('x_text_01')![0].nodes[n.notice.find('x_text_01')![1]].t[0]), -375, '아이콘 없을 때 글자 왼쪽 끝 −375(정렬)');
}

// ── 11. 경로·라벨 ──
{
  console.log('11. 페인 경로·라벨');
  ok(badPaths.size === 0, `없는 경로/라벨: ${[...badPaths].slice(0, 12).join(', ')}`);
  const src = readdirSync(join(WEB, 'script/app/scene/menu/online'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(WEB, 'script/app/scene/menu/online', f), 'utf8'))
    .join('\n');
  const labels = new Set([...src.matchAll(/'((?:mn0[01]|mtch00|sys)_[A-Za-z0-9_]+)'/g)].map((m) => m[1]));
  const missing = [...labels].filter((l) => !(l in spec.texts) && !spec.layouts[l]);
  ok(missing.length === 0, `코드가 쓰는 라벨이 명세에 없음: ${missing.join(', ')}`);
  for (const l of Object.values(LAYOUT)) ok(!!spec.layouts[l], `레이아웃 ${l}`);
  const se = [...src.matchAll(/'(SQ_SE_[A-Z0-9_]+)'/g)].map((m) => m[1]);
  const noSe = [...new Set(se)].filter((l) => !spec.sounds[l]);
  ok(noSe.length === 0, `소리 없음: ${noSe.join(', ')}`);
  console.log(`  라벨 ${labels.size}개, 사건 라벨 ${usedLabels.size}개, SE ${new Set(se).size}개`);
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
