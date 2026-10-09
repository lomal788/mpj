/**
 * 플레이어 설정 흐름(app/scene/menu/setplayer) 상태 시험 — 순수 상태기계(SetPlayerFlow)·컨트롤러 애플릿 대체·이름 규칙을 노드에서 돌리고,
 * 실제 명세(assets/mgmcommon/spec.json + assets/setplayer/setplayer.json)로 흐름이 내는 애니 경로·태그·문구 페인·라벨이 있는지 본다(WebGL 없음).
 * 기대값 근거: docs/shell/setplayer.md 3.2·6.1~6.9·9.4(판독 규칙의 재구현 시험, 원본 실행 대조 아님).
 *
 *   npx tsx tools/test_setplayer.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk } from './fontSpecNode';
import { mergeSpec, PAD, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';
import {
  ALL_WINS,
  ControllerPool,
  defaultSlots,
  displayName,
  hardIcon,
  mapMenuArg,
  NAME_MAX,
  PA_MODE_ARG,
  padTypeOfGamepad,
  SetPlayerFlow,
  win,
  type Controller,
  type ControllerInput,
  type SetPlayerStartArg,
  type SlotWork,
  type SpEvent,
} from '@app/scene/menu/setplayer';
const legacySpec = (s: string): string => s.replace(/^(\.\.\/)+shell\/(mgmcommon|stage3d)/, '../$2').replace(/^@app\/scene\/(?:menu|world|minigame)\//, '../');

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let count = 0;
const ok = (cond: boolean, msg: string): void => {
  count++;
  if (!cond) {
    fails++;
    console.log('  실패:', msg);
  }
};
const eq = <T>(a: T, b: T, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

class FakeInput implements ControllerInput {
  ctrls: Controller[] = [
    { id: 'kb', kind: 'keyboard', padType: 2 },
    { id: 'gp0', kind: 'gamepad', padType: 4 },
    { id: 'gp1', kind: 'gamepad', padType: 5 },
    { id: 'gp2', kind: 'gamepad', padType: 2 },
  ];
  next = new Map<string, number>();
  list(): Controller[] {
    return this.ctrls;
  }
  poll(id: string): { hold: number; trig: number } {
    const t = this.next.get(id) ?? 0;
    return { hold: t, trig: t };
  }
}

interface Rig {
  flow: SetPlayerFlow;
  input: FakeInput;
  pool: ControllerPool;
  log: SpEvent[];
  frame(bits?: Record<string, number>): SpEvent[];
  run(n: number): void;
}

function rig(arg: SetPlayerStartArg, slots: SlotWork[] = defaultSlots()): Rig {
  const input = new FakeInput();
  const pool = new ControllerPool(() => input.ctrls.map((c) => c.id));
  pool.assign[0] = 'kb';
  let guideHidden = true;
  const log: SpEvent[] = [];
  const flow = new SetPlayerFlow(arg, slots, pool, { idle: () => true, guideFinished: () => guideHidden, guideIdle: () => !guideHidden });
  const eat = (): SpEvent[] => {
    const es = flow.takeEvents();
    for (const e of es) {
      if (e.k === 'guideIn') guideHidden = false;
      if (e.k === 'guideOut') guideHidden = true;
    }
    log.push(...es);
    return es;
  };
  flow.start();
  eat();
  const frame = (bits: Record<string, number> = {}): SpEvent[] => {
    input.next = new Map(Object.entries(bits));
    flow.update(input);
    input.next = new Map();
    return eat();
  };
  return { flow, input, pool, log, frame, run: (n) => { for (let i = 0; i < n; i++) frame(); } };
}
const has = (es: SpEvent[], k: SpEvent['k']): boolean => es.some((e) => e.k === k);
const se = (es: SpEvent[]): string[] => es.filter((e): e is Extract<SpEvent, { k: 'se' }> => e.k === 'se').map((e) => e.label);

console.log('1. Start: COM 캐릭터 채우기·인원 클램프 (3.2)');
{
  const slots = defaultSlots();
  slots[0].character = 3;
  slots[1].character = 0;
  slots[2].type = 1;
  slots[3].type = 1;
  const r = rig({ ...mapMenuArg(2) }, slots);
  eq(slots.map((s) => s.character), [3, 0, 1, 2], 'COM = 사람이 안 쓴 앞 번호 1·2');
  eq(r.flow.count, 2, '처음 인원 2');
  eq(slots.map((s) => s.type), [0, 0, 1, 1], 'setCount 가 type 다시 씀');
  eq(rig({ ...mapMenuArg(9) }).flow.count, 4, '처음 9 → 최대 4');
  eq(rig({ ...PA_MODE_ARG, initial: 0 }).flow.count, 1, '처음 0 → 최소 1');
  eq(r.flow.uiState, 0, 'In → uiState 0');
  ok(r.log.some((e) => e.k === 'root' && e.tag === 'in'), '본체 in');
}

console.log('2. 인원 단계: 좌우·경계·같은 프레임 (6.1)');
{
  const r = rig(mapMenuArg(1));
  r.run(3);
  eq(r.flow.step, 0, '단계 0');
  ok(r.log.some((e) => e.k === 'title' && e.mode === 0), '제목 모드 0');
  let es = r.frame({ kb: PAD.LEFT });
  eq(r.flow.count, 1, '최소에서 왼쪽 무시');
  eq(se(es), [], '소리 없음');
  for (let i = 0; i < 5; i++) r.frame({ kb: PAD.RIGHT });
  eq(r.flow.count, 4, '오른쪽 → 최대 4');
  es = r.frame({ kb: PAD.STICK_LEFT });
  eq(r.flow.count, 3, '스틱 왼쪽 → 3');
  eq(se(es), ['SQ_SE_SYS_CURSOR'], 'CURSOR');
  ok(es.some((e) => e.k === 'anim' && e.tag === 'in_userwin'), 'in_userwin');
  es = r.frame({ kb: PAD.LEFT | PAD.RIGHT });
  eq(r.flow.count, 3, '좌우 동시 = 그대로');
  eq(se(es), [], '좌우 동시 소리 없음');
  r.frame({ gp0: PAD.RIGHT });
  eq(r.flow.count, 3, '조작 플레이어(1P) 컨트롤러만 읽음');
  es = r.frame({ kb: PAD.B });
  eq(r.flow.step, 0, '맵 메뉴(B 불가)에서 B 무시');
  ok(r.log.some((e) => e.k === 'guideOut') || !r.log.some((e) => e.k === 'guideIn'), 'B 불가면 안내 안 띄움');
  r.flow.slots[3].manageIdx = 5;
  r.flow.slots[3].nickname = 'X';
  r.frame({ kb: PAD.LEFT });
  eq(r.flow.count, 2, '2명');
  es = r.frame({ kb: PAD.A });
  eq(se(es), ['SQ_SE_SYS_DECI'], 'DECI');
  eq(r.flow.step, 1, 'A → 단계 1');
  eq(r.flow.slots.map((s) => s.type), [0, 0, 1, 1], '2명 → 3·4P COM');
  eq([r.flow.slots[3].manageIdx, r.flow.slots[3].nickname], [-1, ''], 'COM 이 된 칸 연동 해제');
  ok(es.some((e) => e.k === 'titleOut'), '제목 out');
}

console.log('3. 인원 단계 B(허용)·1명 끝 (6.1·6.2)');
{
  const r = rig(PA_MODE_ARG);
  r.run(2);
  ok(r.log.some((e) => e.k === 'guideIn'), 'B 허용이면 안내 In');
  const es = r.frame({ kb: PAD.B });
  eq(se(es), ['SQ_SE_SYS_CANCEL'], 'CANCEL');
  eq([r.flow.step, r.flow.cancelled], [4, true], 'B → 끝·취소');
  ok(has(es, 'done'), 'done 사건');
  const r2 = rig(PA_MODE_ARG);
  r2.run(2);
  r2.frame({ kb: PAD.A });
  r2.run(2);
  eq(r2.flow.step, 4, '1명·캐릭터 선택 없음 → 단계 4');
  ok(r2.log.some((e) => e.k === 'done' && !e.cancelled), 'done(취소 아님)');
  const r3 = rig(mapMenuArg(1));
  r3.run(2);
  r3.frame({ kb: PAD.A });
  r3.run(1);
  eq(r3.flow.step, 3, '1명·캐릭터 선택 → 단계 3');
  ok(r3.log.some((e) => e.k === 'anim' && e.path === win(1, 1) && e.tag === 'to_charasel'), '1인 창 to_charasel');
}

function toUser(n: number, pre?: (r: Rig) => void): Rig {
  const r = rig(mapMenuArg(n));
  pre?.(r);
  r.run(2);
  r.frame({ kb: PAD.A });
  r.run(1);
  return r;
}

console.log('4. 컨트롤러 애플릿 대체 (6.2·9.4)');
{
  const r = toUser(3);
  eq(r.flow.step, 1, '컨트롤러 부족 → 단계 1 유지');
  ok(r.log.some((e) => e.k === 'applet' && e.count === 3), '애플릿 열림(3칸)');
  eq([r.pool.min, r.pool.max], [3, 3], 'SetControllerPlayers(3,3)');
  r.frame({ kb: PAD.A });
  eq(r.flow.step, 1, '빈 칸 있으면 1P A 무시');
  r.frame({ gp1: PAD.A });
  r.frame({ gp0: PAD.A });
  eq(r.pool.assign.slice(0, 3), ['kb', 'gp1', 'gp0'], '누른 순서대로 빈 칸');
  r.frame({ gp1: PAD.B });
  eq(r.pool.assign.slice(0, 3), ['kb', null, 'gp0'], '2P B → 빠짐');
  r.frame({ gp2: PAD.A });
  eq(r.pool.assign[1], 'gp2', '빈 칸 채움');
  const es = r.frame({ kb: PAD.A });
  ok(es.some((e) => e.k === 'appletClose' && e.ok), '1P A → 확인');
  eq([r.flow.step, r.flow.row, r.flow.col], [2, 2, 0], '단계 2, 커서 (2,0)');
  ok(es.some((e) => e.k === 'anim' && e.path === win(3, 3) && e.tag === 'to_user'), 'to_user');

  const c = toUser(2);
  c.frame({ kb: PAD.B });
  eq(c.flow.step, 0, '1P B → 취소 → 컨트롤러 부족 → 단계 0');
  const full = toUser(2, (x) => (x.pool.assign[1] = 'gp0'));
  eq(full.flow.step, 2, '이미 할당돼 있으면 애플릿 없이 단계 2');
  ok(!full.log.some((e) => e.k === 'applet'), '애플릿 안 열림');
}

function userRig(n: number, linked: number[] = []): Rig {
  const r = toUser(n, (x) => {
    for (let p = 1; p < n; p++) x.pool.assign[p] = ['gp0', 'gp1', 'gp2'][p - 1];
    for (const p of linked) {
      x.flow.slots[p].manageIdx = 10 + p;
      x.flow.slots[p].nickname = `U${p}`;
    }
  });
  r.run(1);
  return r;
}

console.log('5. 유저 단계 이동표 (6.3)');
{
  const r = userRig(4, [2]);
  eq(r.flow.step, 2, '단계 2');
  ok(r.log.some((e) => e.k === 'title' && e.mode === 1), '제목 모드 1');
  const mv = (bits: number): [number, number] => {
    r.frame({ kb: bits });
    return [r.flow.row, r.flow.col];
  };
  eq(mv(PAD.DOWN), [2, 1], '게스트 2P: 아래 → 이름 버튼');
  eq(mv(PAD.DOWN), [2, 2], '아래 → OK');
  eq(mv(PAD.RIGHT), [2, 2], 'OK 에서는 좌우 무시');
  eq(mv(PAD.UP), [2, 1], '위 → 이름(게스트)');
  eq(mv(PAD.RIGHT), [3, 0], '오른쪽 → 3P(연동) → 열 0');
  eq(mv(PAD.DOWN), [3, 2], '연동 칸: 아래 → 이름 건너뛰고 OK');
  eq(mv(PAD.UP), [3, 0], '연동 칸: 위 → 이름 건너뛰고 0');
  eq(mv(PAD.RIGHT), [4, 0], '→ 4P');
  eq(mv(PAD.RIGHT), [4, 0], '4명에서 4P 오른쪽 끝');
  eq(mv(PAD.LEFT), [3, 0], '← 3P');
  eq(mv(PAD.LEFT), [2, 0], '← 2P');
  const es = r.frame({ kb: PAD.LEFT });
  eq([r.flow.row, r.flow.col], [2, 0], '2P 에서 왼쪽 끝');
  eq(se(es), [], '안 바뀌면 소리 없음');
  const e2 = r.frame({ kb: PAD.DOWN });
  ok(e2.some((e) => e.k === 'anim' && e.path === `${win(4, 2)}/x_parts_btn_01` && e.tag === 'cursor'), '버튼 표시 cursor');
  ok(e2.some((e) => e.k === 'anim' && e.path === `${win(4, 3)}/x_parts_btn_01` && e.tag === 'disable'), '연동 칸 이름 버튼 disable');
  ok(e2.some((e) => e.k === 'se' && e.at === `${win(4, 2)}/x_parts_btn_01`), 'Play2D 위치 = 새 버튼');
}

console.log('6. 유저 단계 A: 연동·해제·이름 (6.3·6.7)');
{
  const r = userRig(3, [2]);
  let es = r.frame({ kb: PAD.A });
  eq(se(es), ['SQ_SE_SYS_DECI'], '연동하기 DECI');
  ok(es.some((e) => e.k === 'titleOut'), '파이버 끝 → 제목 out(원본 LAB_7100348444)');
  es = r.frame();
  const acc = es.find((e) => e.k === 'account');
  ok(!!acc && acc.k === 'account' && acc.pid === 1, '유저 선택 요청 pid 1(다음 프레임에 파이버 시작)');
  r.run(3);
  ok(!r.log.slice(-3).some((e) => e.k === 'title'), '애플릿 동안 단계 파이버 재시작 없음');
  r.flow.resolveAccount(1, { uid: 'u-1', nickname: '마리오' });
  const mark = r.log.length;
  r.run(2);
  ok(r.flow.slots[1].manageIdx !== -1 && r.flow.slots[1].nickname === '마리오', '연동 → 닉네임');
  ok(r.log.slice(mark).some((e) => e.k === 'title' && e.mode === 1), '단계 2 다시 시작');
  es = r.frame({ kb: PAD.DOWN });
  eq(r.flow.col, 2, '연동됨 → 아래 = OK');
  r.frame({ kb: PAD.UP });
  r.frame({ kb: PAD.A });
  r.run(1);
  eq([r.flow.slots[1].manageIdx, r.flow.slots[1].nickname], [-1, ''], '연동 해제');
  r.run(1);
  r.frame({ kb: PAD.DOWN });
  eq(r.flow.col, 1, '게스트 → 이름 버튼');
  r.frame({ kb: PAD.A });
  es = r.frame();
  const nm = es.find((e) => e.k === 'name');
  ok(!!nm && nm.k === 'name' && nm.maxLen === NAME_MAX && nm.pid === 1, '이름 입력 요청(최대 10)');
  r.flow.resolveName(1, 'ABCDEFGHIJKLMN');
  r.run(2);
  eq(r.flow.slots[1].nickname, 'ABCDEFGHIJ', '10자 자름');
  r.frame({ kb: PAD.DOWN });
  r.frame({ kb: PAD.UP });
  r.frame({ kb: PAD.RIGHT });
  r.frame({ kb: PAD.DOWN });
  eq([r.flow.row, r.flow.col], [3, 2], '3P 연동 → OK');
}

console.log('7. 유저 단계 끝: OK·B·컨트롤러 끊김, 캐릭터 선택 왕복 (6.3·6.6)');
{
  const r = userRig(2);
  r.frame({ kb: PAD.DOWN });
  r.frame({ kb: PAD.DOWN });
  let es = r.frame({ kb: PAD.A });
  eq(se(es), ['SQ_SE_SYS_DECI_L'], 'OK = DECI_L');
  eq(r.flow.step, 3, '캐릭터 선택으로');
  ok(es.some((e) => e.k === 'anim' && e.tag === 'to_charasel_00'), 'to_charasel_00');
  es = r.frame();
  ok(has(es, 'charSelect'), 'charSelect 사건');
  ok(es.some((e) => e.k === 'title' && e.mode === 2), '제목 모드 2');
  r.flow.resolveCharSelect(false);
  es = r.frame();
  eq(r.flow.step, 2, '캐릭터 선택 B → 단계 2');
  ok(es.some((e) => e.k === 'anim' && e.tag === 'back_user'), 'back_user');
  r.run(2);
  r.frame({ kb: PAD.DOWN });
  r.frame({ kb: PAD.DOWN });
  r.frame({ kb: PAD.A });
  r.run(1);
  r.flow.slots[1].character = 7;
  r.flow.resolveCharSelect(true, [4, 7, 0, 1]);
  es = r.frame();
  eq(r.flow.step, 4, '결정 → 끝');
  eq(r.flow.slots.map((s) => s.baseCharacter), [4, 7, 0, 1], 'BaseCharacterID = CharacterID');
  ok(has(es, 'done'), 'done');

  const b = userRig(3);
  es = b.frame({ kb: PAD.B });
  eq(se(es), ['SQ_SE_SYS_CANCEL'], 'B CANCEL');
  eq(b.flow.step, 0, 'B → 단계 0');
  ok(es.some((e) => e.k === 'anim' && e.tag === 'back_number_00'), 'back_number_00');

  const d = userRig(3);
  d.input.ctrls = d.input.ctrls.filter((c) => c.id !== 'gp1');
  d.frame();
  eq(d.flow.step, 0, '컨트롤러 끊김 → 단계 0');

  const n = rig({ ...mapMenuArg(2), toCharSelect: false });
  n.pool.assign[1] = 'gp0';
  n.run(2);
  n.frame({ kb: PAD.A });
  n.run(2);
  n.frame({ kb: PAD.DOWN });
  n.frame({ kb: PAD.DOWN });
  n.frame({ kb: PAD.A });
  n.run(1);
  eq(n.flow.step, 4, '캐릭터 선택 없음 → OK 로 끝');
}

console.log('8. 이름 규칙·아이콘 (6.8·6.9)');
{
  const s = defaultSlots();
  s[2].type = 1;
  s[3].type = 1;
  s[3].nickname = '루이지봇';
  s[2].character = 5;
  const cn = (c: number): string => `캐릭터${c}`;
  eq([0, 1, 2, 3].map((p) => displayName(s[p], '게스트', cn)), ['게스트', '게스트', '캐릭터5', '루이지봇'], '게스트 번호 없음·COM 캐릭터 이름');
  s[2].session = 3;
  eq(displayName(s[2], '게스트', cn), '게스트', 'COM 이라도 SessionState 3 이면 사람 규칙');
  eq([2, 3, 4, 5, 6].map((t) => hardIcon(t as 2)), ['FullKey', 'Handheld', 'Dual', 'JoyConH', 'JoyConH'], '아이콘(가로)');
  eq([hardIcon(5, true), hardIcon(6, true)], ['JoyConV_Left', 'JoyConV_Right'], '아이콘(세로)');
  eq(['Joy-Con (L) (Vendor: 057e)', 'Joy-Con (R)', 'Joy-Con L+R', 'Xbox Wireless Controller'].map(padTypeOfGamepad), [5, 6, 4, 2], 'Gamepad id → PadType');
}

console.log('9. 실제 명세: 경로·태그·페인·라벨');
{
  const spec = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/spec.json'), 'utf8')) as MgmSpec;
  const part = JSON.parse(readFileSync(join(WEB, 'assets/setplayer/setplayer.json'), 'utf8')) as MgmSpecPart & { texts: Record<string, string>; sounds: Record<string, unknown> };
  await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
  await resolveFontsFromDisk(part.fonts as Record<string, unknown> | undefined, join(WEB, 'assets/mgmcommon'));
  const all = mergeSpec(spec, part) as unknown as Spec;
  const texts = { ...spec.texts, ...part.texts };
  const sounds = { ...spec.sounds, ...part.sounds };
  const base = new LayoutInst('sys_connect_base_00', all.layouts['sys_connect_base_00'], all);
  for (const n of ['sys_bg_set_00', 'sys_connect_tlp_00', 'sys_guide_03', 'sys_guide_pos_01']) ok(!!all.layouts[n], `레이아웃 ${n}`);
  for (const a of ['in', 'normal', 'out']) ok(!!all.layouts['sys_connect_base_00'].anims[a] && !!all.layouts['sys_connect_tlp_00'].anims[a], `본체·제목 애니 ${a}`);
  const paths = new Map<string, Set<string>>();
  const note = (es: SpEvent[]): void => {
    for (const e of es) if (e.k === 'anim') (paths.get(e.path) ?? paths.set(e.path, new Set()).get(e.path)!).add(e.tag).add(e.next ?? e.tag);
  };
  for (const n of [1, 2, 3, 4]) {
    const r = userRig(n, n > 2 ? [2] : []);
    for (const b of [PAD.DOWN, PAD.RIGHT, PAD.DOWN, PAD.UP, PAD.LEFT, PAD.DOWN, PAD.DOWN, PAD.A]) r.frame({ kb: b });
    r.run(2);
    r.flow.resolveCharSelect(false);
    r.run(3);
    r.frame({ kb: PAD.B });
    r.run(3);
    note(r.log);
  }
  let missPath = 0;
  let missTag = 0;
  for (const [p, tags] of paths) {
    const inst = base.part(p);
    if (!inst) {
      missPath++;
      console.log('  경로 없음', p);
      continue;
    }
    for (const t of tags)
      if (!inst.spec.anims[t]) {
        missTag++;
        console.log('  태그 없음', p, t, Object.keys(inst.spec.anims));
      }
  }
  eq(paths.size, 25, '애니 경로 = 본체 부품 3 + 창 10 + 버튼 12');
  eq([missPath, missTag], [0, 0], '모든 애니 경로·태그가 명세에 있음');
  const panes = ['x_parts_user/x_btn_ok/x_text_ok', 'x_parts_user/x_text_00', 'x_parts_user/x_cursor_num/x_text_num', 'x_parts_user/x_cursor_num/x_text_num_shadow', 'x_parts_user/x_cursor_num/x_icon_cursor_left', 'x_parts_user/x_cursor_num/x_icon_cursor_right', 'x_parts_user/x_cursor_num/cursor_left'];
  for (let n = 1; n <= 4; n++) panes.push(`x_parts_user/x_win_${n}`);
  for (const w of ALL_WINS) {
    panes.push(`${w}/x_parts_username/x_text_01`, `${w}/x_parts_hard/x_icon_05`, `${w}/x_parts_hard/x_null_lamp`, `${w}/x_parts_hard/x_pict_lamp_03`, `${w}/x_parts_hard/x_icon_hard_04_right`);
    const m = /x_user_(\d)_(\d)P$/.exec(w)!;
    if (m[2] === '1' && m[1] !== '1') panes.push(`${w}/x_text_mess`);
    if (m[2] !== '1') panes.push(`${w}/x_parts_btn_00/x_text_00`, `${w}/x_parts_btn_01/x_text_00`);
  }
  const missPane = panes.filter((p) => !base.find(p));
  eq(missPane, [], `문구·보임 페인 ${panes.length}개`);
  const title = new LayoutInst('sys_connect_tlp_00', all.layouts['sys_connect_tlp_00'], all);
  ok(!!title.find('x_text_title_00'), '제목 글자 페인');
  const labels = ['mn01_ui_ok', 'mn01_connect_ui_user_sub', 'mn01_connect_ui_user_connected', 'mn01_connect_ui_user_name', 'mn01_connect_ui_user_account', 'mn01_connect_ui_user_release',
    'mn01_connect_ui_number_title', 'mn01_connect_ui_user_title', 'mn01_connect_ui_chara_title', 'im_guest00_name', 'sys_ctrl_back', 'sys_swkbd_username_header',
    ...[1, 2, 3, 4].map((n) => `mn01_connect_ui_player_number0${n}`)];
  eq(labels.filter((l) => !texts[l]), [], `라벨 ${labels.length}개 존재`);
  eq(texts['im_guest00_name'], '게스트', 'im_guest00_name = 게스트');
  eq(texts['mn01_connect_ui_player_number03'], '3명', '3명');
  eq(['SQ_SE_SYS_CURSOR', 'SQ_SE_SYS_DECI', 'SQ_SE_SYS_DECI_L', 'SQ_SE_SYS_CANCEL'].filter((l) => !sounds[l]), [], '소리 4개');
  const font = (part.fonts ?? {})['bqfont_large'];
  ok(!!font && [...'1234명'].every((ch) => font.glyphs[ch.codePointAt(0)!] !== undefined || (font.glyphs as unknown as Record<string, unknown>)[ch] !== undefined), '큰 글꼴에 "1234명"');
  const wn = base.find('x_parts_user/x_win_2');
  ok(!!wn, 'x_win_2');
  const w22 = base.find(`${win(2, 2)}`);
  ok(!!w22 && Math.abs(w22[0].nodes[w22[0].byName.get('null_user_2_2P')!].t[0] - 232) < 1e-6, '2인 2P 창 x = +232 [데이터]');
}

console.log('10. import 경계 (mgm_common.md 9.1 과 같음)');
{
  const dir = join(WEB, 'script/app/scene/menu/setplayer');
  const bad: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/from '([^']+)'/g)) {
      const p = legacySpec(m[1]);
      const okImp = p.startsWith('./') || p === '../mgmcommon' || p.startsWith('../charselect/') || p === '../charselect' || p === 'three' || p === '@game/lib/assetcore' || p === '@game/lib/assetcore-three';
      if (!okImp) bad.push(`${f}: ${p}`);
    }
  }
  eq(bad, [], 'app/scene/menu/setplayer 금지 import 0');
}

console.log(fails ? `실패 ${fails} / ${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
