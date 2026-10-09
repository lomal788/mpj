/**
 * 광장 2D UI(D 갈래) 상태 시험 — script/app/scene/world/plaza/ui 를 실제 명세(mgmcommon/spec.json + online/online.json + mgm01/faces.json +
 * plaza/ui/plaza_ui.json)와 가짜 어댑터(FakeOnline)로 노드에서 돈다(WebGL 없음). 기대값 근거: docs/shell/plaza_3d.md §5.1(판독 규칙의 재구현 시험, 원본 실행 대조 아님).
 * ① 하단 줄 칸·이름·얼굴 ② 스탬프 조작부·목록·말풍선 시간·소리 ③ 장소 텔롭·다가가기 안내·온라인 안내 ④ 친구 매치 → 대기실 입장 알림·하단 줄 갱신·원격 스탬프
 * ⑤ 위치 동기(보내기 간격·받기 표 = 수신 목표·수명, 패킷마다 net:remote — 거리 분기·보간은 test_plaza_actors.ts RemoteMotion)
 *
 *   npx tsx tools/test_plaza_ui.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Render2D } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk } from './fontSpecNode';
import { mergeSpec, type MgmDrawHost, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';
import { applyOnlineExtra, BTN, FakeOnline, type OnlineExtra } from '@app/scene/menu/online';
import {
  applyPlazaUiExtra,
  listStamps,
  PlazaUi,
  RemoteActor,
  RemoteSender,
  RemoteTable,
  StampBalloon,
  StampCtrl,
  STAMP_INOUT_FRAMES,
  stampTexture,
  type PlazaUiExtra,
  type PlazaUiPlayer,
} from '@app/scene/world/plaza/ui';

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

const onl = read<MgmSpecPart & OnlineExtra>('online/online.json');
const ext = read<PlazaUiExtra>('plaza/ui/plaza_ui.json');
let spec = mergeSpec(read<MgmSpec>('mgmcommon/spec.json'), onl);
spec = mergeSpec(spec, read<MgmSpecPart>('mgm01/faces.json'));
spec = mergeSpec(spec, ext);
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
applyOnlineExtra(spec, onl);
applyPlazaUiExtra(spec, ext);
const all = spec as unknown as Spec;
const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} };
const T = (l: string): string => spec.texts[l] ?? `(${l})`;
const textOf = (inst: LayoutInst, path: string): string => {
  const f = inst.find(path);
  return f ? (f[0].texts.get(f[1]) ?? '') : '<없음>';
};
const visOf = (inst: LayoutInst, path: string): boolean => {
  const f = inst.find(path);
  return !!f && f[0].nodes[f[1]].v;
};
const texOf = (inst: LayoutInst, path: string, slot: number): string | undefined => {
  const f = inst.find(path);
  if (!f) return undefined;
  const m = f[0].nodes[f[1]].spec.m ?? -1;
  return f[0].texOverride.get(m)?.get(slot);
};

class Pads {
  private next = new Map<number, number>();
  hold = new Map<number, number>();
  press(slot: number, bits: number): void {
    this.next.set(slot, (this.next.get(slot) ?? 0) | bits);
  }
  frame(): Map<number, { hold: number; trig: number }> {
    const out = new Map<number, { hold: number; trig: number }>();
    for (const s of [0, 1, 2, 3]) {
      const t = this.next.get(s) ?? 0;
      out.set(s, { hold: (this.hold.get(s) ?? 0) | t, trig: t });
    }
    this.next.clear();
    return out;
  }
}

function make(players: PlazaUiPlayer[], o: { join?: number; stamp?: number; remoteMove?: boolean; rooms?: number } = {}) {
  const sounds: string[] = [];
  const net = new FakeOnline({
    rooms: o.rooms ?? 5,
    joinInterval: o.join ?? 0,
    leaveAfter: 0,
    error: 'none',
    seed: 11,
    matchSec: 3,
    self: { name: players[0].name, chara: players[0].chara, humans: players.filter((p) => !p.isCom).length },
    remoteMove: o.remoteMove ?? false,
    stampEvery: o.stamp ?? 0,
  });
  const ui = new PlazaUi({
    host,
    extra: ext,
    net,
    players: () => players,
    pads: { poll: () => ({ hold: 0, trig: 0 }) },
    sound: { playSe: (l: string) => sounds.push(l) } as never,
  });
  const pads = new Pads();
  const tick = (n = 1): void => {
    for (let i = 0; i < n; i++) ui.tick(DT, pads.frame());
  };
  const press = (slot: number, bits: number, after = 1): void => {
    pads.press(slot, bits);
    tick(after);
  };
  const until = (pred: () => boolean, max = 1500): number => {
    for (let i = 0; i < max; i++) {
      if (pred()) return i;
      tick();
    }
    return -1;
  };
  return { ui, net, sounds, pads, tick, press, until };
}

const P = (slot: number, chara: number, isCom: boolean, name: string): PlazaUiPlayer => ({ slot, chara, isCom, name });

// ── ① 하단 파티 줄 ──
{
  console.log('① 하단 파티 줄(오프라인)');
  const c = make([P(0, 0, false, 'Mario1'), P(1, 3, true, 'COM'), P(2, 5, true, 'COM'), P(3, 7, true, 'COM')]);
  c.tick();
  const st = c.ui.status;
  eq(st.slots, 4, '칸 4');
  eq(st.st, 0, 'Mgr in 재생 중');
  eq(st.root.current, 'in', 'mncom_base_status_00 in');
  c.tick(6);
  eq(st.st, 1, 'in 끝 → 대기');
  eq(st.slotPane(0), 'x_null_status_1P_4', '칸 페인 이름');
  ok(!!st.root.find('x_null_status_4P_4') && !!st.root.find('x_null_status_8P_8'), '칸 페인이 레이아웃에 있음');
  eq([...st.bySlot.keys()], [0], 'COM 칸은 빈 칸(PlayerType ≠ 0)');
  eq(st.empties.map((e) => e.inst.visible), [false, true, true, true], '빈 칸 보임 = COM 3칸');
  const s0 = st.bySlot.get(0)!;
  eq(textOf(s0.inst, 'x_parts_username/x_text_00'), 'Mario1', '이름 x_text_00');
  eq(textOf(s0.inst, 'x_parts_username/x_text_01'), 'Mario1', '이름 x_text_01');
  eq(texOf(s0.inst, 'x_face/x_face_pc64', 1), 'face_128_pc01^u', '얼굴 텍스처');
  ok(visOf(s0.inst, 'x_face'), '얼굴 보임');
  eq(c.ui.stamps.size, 1, '스탬프 = 사람 칸마다');
  eq(c.ui.stamps.get('p0')?.ctrl, null, '1번(조작 플레이어)은 조작부 없음');
  eq(st.empties[1].inst.name, 'mncom_status_01', '빈 칸 레이아웃');
  const base = st.slotBase(1);
  eq([Math.round(base[2]), Math.round(base[5])], [-180, -508], '2번 칸 위치(x_null_status_2P_4)');
  const g = make([P(0, 0, false, ''), P(1, 1, false, 'L')]);
  g.tick();
  eq(textOf(g.ui.status.bySlot.get(0)!.inst, 'x_parts_username/x_text_00'), T('im_guest00_name'), '빈 이름 = im_guest00_name');
  eq(T('im_guest00_name'), '게스트', '게스트 문구');
}

// ── ② 스탬프 ──
{
  console.log('② 스탬프(로컬 2P)');
  const items = listStamps(ext.stamps);
  eq(items, [0, 1, 2, 4, 5, 12, 15, 16, 17, 23, 28, 40], '목록 항목 = 해금 그룹 −1(캐릭터 3 + 공용 9)');
  eq(ext.stampShortcuts.menu, [0, 28, 16, 12], '메뉴 단축 L·R·X·Y = Number 1000·25·13·9');
  eq(stampTexture(ext.stamps[0], 1), 'stamp_02000^u', '캐릭터 스탬프 텍스처(루이지)');
  eq(stampTexture(ext.stamps[16], 1), 'stamp_00013^u', '공용 스탬프 텍스처');
  ok(!!spec.textures['stamp_02000^u'] && !!spec.textures['stamp_00013^u'], '텍스처가 명세에 있음');
  eq(T(ext.stamps[16].label), '좋아!', '13번 문구');

  const c = make([P(0, 0, false, 'A'), P(1, 1, false, 'B'), P(2, 2, true, 'C'), P(3, 3, true, 'D')]);
  c.tick(8);
  const s1 = c.ui.stamps.get('p1')!;
  ok(!!s1.ctrl, '2P 조작부');
  eq(c.ui.stamps.get('p0')?.ctrl, null, '1P 조작부 없음');
  const ctrl = s1.ctrl!;
  eq(ctrl.list.inst.name, 'sys_stamp_list_00', '사람 2명 = 6칸 목록');
  eq(ctrl.perPage, 6, '6칸');
  eq(ctrl.guide.st, 1, '안내 in → 대기');
  eq(textOf(ctrl.guide.inst, 'x_text_00'), T('smp_ctrl_several_top').replace(/\r/g, ''), '안내 문구');
  eq(ctrl.list.st, -1, '처음엔 목록 숨김');
  c.press(1, 0x10000);
  eq(ctrl.guide.st, 2, '스틱 → 안내 out');
  eq(ctrl.list.st, 0, '스틱 → 목록 in');
  ok(c.ui.out.some((e) => e.t === 'stampList' && e.open), '목록 열림 사건');
  c.tick(8);
  eq(ctrl.list.st, 1, '목록 대기');
  eq(ctrl.guide.st, -1, '안내 숨김');
  eq(texOf(ctrl.list.inst, 'x_parts_icon_00/x_icon_stamp', 0), 'stamp_02000^u', '첫 칸 = 캐릭터 스탬프');
  ok(visOf(ctrl.list.inst, 'x_parts_icon_05'), '6칸 보임');
  c.press(1, 0x200);
  eq(ctrl.cursor, 1, '오른쪽 → 칸 1');
  eq(c.sounds.at(-1), 'SQ_SE_SYS_CURSOR_S', '칸 이동 소리');
  eq(ctrl.list.inst.part('x_parts_icon_01')?.current, 'on', '커서 칸 on → cursor');
  c.press(1, 0x100);
  c.press(1, 0x100);
  eq(ctrl.cursor, 5, '왼쪽 넘김 = 페이지 끝 칸');
  c.press(1, 0x400);
  eq([ctrl.top, ctrl.cursor], [6, 5], '아래 = 다음 페이지');
  c.press(1, 0x400);
  eq(ctrl.top, 0, '마지막 페이지 다음 = 처음');
  c.press(1, 0x800);
  eq(ctrl.top, 6, '위 넘김 = 마지막 페이지');
  c.press(1, 0x1);
  eq(s1.balloon.stamp, items[11], 'A = 커서 스탬프 보냄');
  eq(c.sounds.at(-1), 'SQ_SE_STAMP_2P', '로컬 2P 소리');
  eq(ctrl.list.st, -1, '보낸 뒤 목록 즉시 숨김');
  eq(s1.balloon.inst.current, 'inout', '말풍선 inout');
  eq(textOf(s1.balloon.inst, 'x_text_00'), T(ext.stamps[items[11]].label).replace(/\r/g, ''), '말풍선 문구');
  const vc = s1.balloon.inst.find('x_text_00')!;
  eq(vc[0].nodes[vc[1]].vc[0], [...ext.stamps[items[11]].color, 255], '글자색 = 데이터 RGB');
  const before = c.sounds.length;
  c.press(1, 0x10);
  eq(c.sounds.length, before, '말풍선 중에는 못 보냄(FUN_7100357510)');
  const left = c.until(() => s1.balloon.finished);
  eq(left + 1 + 1, STAMP_INOUT_FRAMES, '말풍선 표시 = inout 90 프레임(1.5 s)');
  c.press(1, 0x8);
  eq(s1.balloon.stamp, ext.stampShortcuts.menu[3], 'Y = 단축 3(Number 9)');
  c.until(() => s1.balloon.finished);
  c.press(1, 0x20);
  eq(s1.balloon.stamp, ext.stampShortcuts.menu[1], 'R = 단축 1(Number 25)');
  const m = c.ui.status.paneBase(c.ui.status.bySlot.get(1)!, 'x_null_stamp')!;
  eq([Math.round(m[2]), Math.round(m[5])], [-180 - 28, -508 + 154], '말풍선 위치 = 칸 + x_null_stamp');
  ok(c.ui.drawList().some(([i]) => i === s1.balloon.inst), '말풍선 그리기 목록');

  console.log('② 1인 목록(sys_stamp_list_01)');
  const solo = new StampCtrl(host, 1, 0, items, ext.stampShortcuts.menu, 1, ext.stamps);
  eq(solo.list.inst.name, 'sys_stamp_list_01', '1인 = 8칸 목록');
  eq(solo.perPage, 8, '8칸');
  eq(textOf(solo.list.inst, 'x_text_close'), T('smp_oneList_ctrl_back').replace(/\r/g, ''), '닫기 문구');
  const b = new StampBalloon(host);
  b.play(ext.stamps[0], 21);
  eq(texOf(b.inst, 'x_stamp_00', 0), 'stamp_62000^u', '하쿤 캐릭터 스탬프');
}

// ── ③ 장소 텔롭·다가가기 안내·온라인 안내 ──
{
  console.log('③ 텔롭·안내');
  const c = make([P(0, 0, false, 'A')]);
  c.tick(8);
  c.ui.setTelop(2, true);
  eq(textOf(c.ui.telop.inst, 'x_text_title'), '스탬프 숍', '제목 = mn00_mainMenu_ui_name(Text0 im_mn02_name)');
  eq(textOf(c.ui.telop.inst, 'x_text_mess'), T('im_mn02_detail'), '설명');
  eq(c.ui.telop.life.st, 0, 'in');
  c.tick(6);
  eq(c.ui.telop.life.st, 1, 'normal');
  c.ui.setTelop(-1, true);
  eq(c.ui.telop.area, 2, '−1 = 그대로');
  c.ui.setTelop(7, true, false);
  eq(textOf(c.ui.telop.inst, 'x_text_title'), '프렌드 매치', '프렌드 매치 이름');
  ok(!visOf(c.ui.telop.inst, 'x_null_text_mess'), 'SetVisibleDetail(false)');
  c.ui.setTelop(7, false);
  eq(c.ui.telop.life.st, 2, '안 보이면 out');
  c.ui.setPop(true, 300, 100);
  eq(c.ui.pop.st, 1, '다가가기 in');
  eq(c.ui.pop.icon, 1, '아이콘 1 = x_icon_btn_right');
  ok(visOf(c.ui.pop.inst, 'x_icon_btn/x_icon_btn_right') && !visOf(c.ui.pop.inst, 'x_icon_btn/x_icon_btn_top'), 'A 위치 아이콘만');
  eq(c.ui.pop.rotate, -45, '회전 −45°');
  c.tick(10);
  eq(c.ui.pop.st, 2, 'in 9 프레임 뒤 normal');
  c.ui.setPop(false, 0, 0);
  eq(c.ui.pop.st, 3, 'out');
  c.tick(10);
  eq(c.ui.pop.st, 0, '숨김');
  eq(textOf(c.ui.onlineGuide.inst, 'x_text_btn'), T('mn01_mainMenu_ctrl_friend_btn'), '온라인 안내 Y 글리프');
  ok(visOf(c.ui.onlineGuide.inst, 'null_friend'), '사람 < 4 = 친구 보임');
  const f = make([P(0, 0, false, 'A'), P(1, 1, false, 'B'), P(2, 2, false, 'C'), P(3, 3, false, 'D')]);
  f.tick(8);
  ok(!visOf(f.ui.onlineGuide.inst, 'null_friend'), '사람 4 = 친구 숨김');
}

// ── ④ 친구 매치 → 대기실(광장) ──
{
  console.log('④ 친구 매치 → 대기실 입장 알림·하단 줄·원격 스탬프');
  const c = make([P(0, 0, false, 'Host'), P(1, 4, true, 'C'), P(2, 5, true, 'C'), P(3, 6, true, 'C')], { join: 2, stamp: 3, remoteMove: true });
  c.tick(8);
  eq(c.ui.onlineGuide.life.st, 1, '온라인 안내 대기');
  const sessionLog: boolean[] = [];
  const tick0 = c.ui.tick.bind(c.ui);
  c.ui.tick = (dt, pads) => {
    tick0(dt, pads);
    for (const e of c.ui.out) if (e.t === 'session') sessionLog.push(e.on);
  };
  c.press(0, 0x8);
  ok(!!c.ui.online, 'Y(bex 0x8, 글리프 E001) = 친구 매치 메뉴');
  ok(c.ui.out.some((e) => e.t === 'friendMenu' && e.open), '메뉴 열림 사건');
  eq(c.ui.main, false, '메뉴 동안 메인 레이아웃 Finish');
  const fl = (): NonNullable<typeof c.ui.online>['flow'] => c.ui.online!.flow;
  ok(c.until(() => fl().netMenu.life.idle) >= 0, '방 만들기/찾기');
  c.tick(30);
  c.press(0, BTN.A);
  ok(c.until(() => fl().roomType.life.idle) >= 0, '방 종류');
  c.tick(30);
  c.press(0, BTN.A);
  ok(c.until(() => fl().dialog.life.idle && fl().dialog.result < 0) >= 0, '패스워드 확인');
  c.press(0, BTN.A);
  ok(c.until(() => fl().step === 'lobby:host') >= 0, '대기실');
  ok(c.until(() => c.ui.main) >= 0, '대기실 = 광장 메인 레이아웃 다시 Start');
  eq(c.ui.status.online, true, '하단 줄 온라인 모드');
  eq(c.ui.status.bySlot.get(0)?.name, 'Host', '1칸 = 나');
  eq(c.ui.status.empties.filter((e) => e.inst.visible).length, 3, '나머지 빈 칸 3(COM 은 방 멤버 아님)');
  ok(c.until(() => (c.ui.room?.members.length ?? 0) >= 2) >= 0, '입장');
  c.tick(2);
  ok(c.ui.online!.view.notices.some((n) => n === `${c.ui.room!.members[1].name} 님이 참가했습니다.`), '입장 알림 문구(sys_notice_joinSession)');
  eq(c.ui.status.bySlot.size, 1, '데이터 받기 전엔 칸 안 채움');
  ok(c.until(() => c.ui.status.bySlot.size === 2) >= 0, '데이터 받으면 2칸');
  const guest = c.ui.status.bySlot.get(1)!;
  eq(guest.name, c.ui.room!.members[1].name, '2칸 = 들어온 사람');
  ok(c.until(() => c.ui.room!.members.length >= 3 && c.ui.status.bySlot.size === 3) >= 0, '3번째 사람');
  const ord = c.ui.online!.view.notices.filter((n) => n.includes('님이 참가했습니다'));
  eq(ord, c.ui.room!.members.slice(1, 3).map((m) => `${m.name} 님이 참가했습니다.`), '알림 순서 = 입장 순서');
  eq(fl().lobby.telop, 1, '대기 텔롭 = 출발 가능');
  const remoteSlot = c.ui.stamps.get(guest.key)!;
  eq(remoteSlot.ctrl, null, '원격 = 조작부 없음');
  ok(c.until(() => c.sounds.includes('SQ_SE_STAMP_PC')) >= 0, '원격 스탬프 소리 SQ_SE_STAMP_PC');
  ok([...c.ui.stamps.values()].some((s) => s.remote && s.balloon.st === 0), '원격 말풍선');
  ok(c.ui.remote.actors.size >= 1, '원격 위치 받음');
  ok(c.until(() => c.ui.out.some((e) => e.t === 'remote')) >= 0, 'net:remote 사건');
  c.ui.out.length = 0;
  c.tick(60);
  const nRemote = c.ui.out.filter((e) => e.t === 'remote').length;
  const nMembers = c.ui.remote.actors.size;
  ok(nRemote >= 4 * nMembers && nRemote <= 6 * nMembers, `net:remote = 받은 패킷마다(1 s·원격 ${nMembers}: ${nRemote}건, 매 틱 발행이면 ${60 * nMembers})`);
  c.press(0, BTN.A, 3);
  eq(fl().step, 'lobby:host', '대기실 A(출발)는 막음 — 출발은 기구');  ok(c.ui.out.length >= 0 && sessionLog.includes(true), 'net:session true(방 생김)');

  console.log('④ C 신호 interact:decide {result:3} → 친구 매치, net:session');
  const d = make([P(0, 0, false, 'Host')], { join: 0 });
  d.tick(8);
  d.ui.wantMain = false;
  d.ui.decide(5);
  d.tick();
  eq(d.ui.online, null, '결과 5 = 친구 매치 아님');
  d.ui.decide(3);
  d.tick();
  ok(!!d.ui.online, '결과 3 = 친구 매치 메뉴');
  ok(d.ui.out.some((e) => e.t === 'friendMenu' && e.open), '메뉴 열림 사건');
  const df = (): NonNullable<typeof d.ui.online>['flow'] => d.ui.online!.flow;
  ok(d.until(() => df().netMenu.life.idle) >= 0, '메뉴 대기');
  d.tick(30);
  d.press(0, BTN.A);
  ok(d.until(() => df().roomType.life.idle) >= 0, '방 종류');
  d.tick(30);
  d.press(0, BTN.A);
  ok(d.until(() => df().dialog.life.idle && df().dialog.result < 0) >= 0, '패스워드 확인');
  d.press(0, BTN.A);
  ok(d.until(() => d.ui.out.some((e) => e.t === 'session' && e.on)) >= 0, 'net:session true');
  ok(d.until(() => d.ui.main) >= 0, '메뉴가 끝나면 메인 레이아웃 복귀(wantMain 다시 켬)');
  d.ui.online!.net.dissolveRoom();
  d.ui.online!.flow.room = null;
  let off = false;
  for (let i = 0; i < 120 && !off; i++) {
    d.tick();
    off = d.ui.out.some((e) => e.t === 'session' && !e.on);
  }
  ok(off, 'net:session false(방 없어짐)');
}

// ── ⑤ 위치 동기 ──
{
  console.log('⑤ 위치 동기');
  const s = new RemoteSender(0);
  const sent: number[] = [];
  for (let f = 0; f < 60; f++) if (s.step(DT, f < 40 ? [2, 0, 0, 0] : [0, 0, 0, 0])) sent.push(f);
  eq(sent.slice(0, 4), [0, 13, 26, 39], '움직이면 바로 → 0.2 s(13 프레임: 타이머 0.2 를 다 깎은 다음 프레임) 간격');
  eq(sent.length, 4, '멈추면 안 보냄');
  ok(!new RemoteSender(0).step(DT, [0.3, 0, 0.1, 0]), '속도² 0.1 이하 = 안 보냄');
  ok(!new RemoteSender(4).step(DT, [3, 0, 0, 0]), '슬롯 4 이상 안 보냄');
  const q0: [number, number, number, number] = [0, 0, 0, 1];
  const q1: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
  const a = new RemoteActor('st', 0, 1, [0, 0, 0], q0);
  a.receive([0.5, 0, 0], q1);
  eq([a.pos, a.quat, a.rx], [[0.5, 0, 0], q1, 2], '받기 표 = 마지막 수신 목표 그대로(거리 무관, 보간 없음)');
  const tb = new RemoteTable();
  eq(tb.receive('s1', 0, 3, [1, 0, 0], q0).first, true, '처음 보는 (스테이션, 슬롯) = 새 항목');
  eq(tb.receive('s1', 0, 3, [9, 0, 0], q1).first, false, '다음 수신 = 같은 항목 갱신');
  tb.receive('s1', 1, 4, [2, 0, 0], q0);
  tb.receive('s2', 0, 5, [3, 0, 0], q0);
  eq(tb.remove('s1').length, 2, '이탈 = 그 스테이션의 모든 슬롯');
  eq([...tb.actors.keys()], ['s2#0'], '다른 스테이션은 남음');
  const c = make([P(0, 0, false, 'Host')]);
  eq(c.ui.sendLocal(DT, 0, 0, [3, 0, 0, 0], [0, 0, 0], q0), false, '세션 없으면 안 보냄');
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
