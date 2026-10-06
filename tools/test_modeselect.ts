/**
 * 모드 선택 상태기계 시험 — script/shell/modeselect/state.ts 를 노드에서 돈다.
 * 기대값 근거: docs/shell/modeselect.md 3·5절(menu01.nro ComUiMap::UpdateProcess·Cursor·Start·Out 판독). 원본 실행 대조가 아니라 판독한 규칙의 재구현 시험이다.
 *
 *   npx tsx tools/test_modeselect.ts
 */
import { RepeatGen } from '../script/shell/charselect/state';
import { ModeSelectState, NOTICE_COOLDOWN, PAD, type ModeEvent } from '../script/shell/modeselect/state';

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

const OFFLINE = (b: number): number => (b === 7 ? 4 : 0);
const IN_LEN = 15;

/** in 애니(15f)를 흘려 대기(상태 1) + 안내 In 까지 */
function make(playable = OFFLINE, cursor?: number): ModeSelectState {
  const s = new ModeSelectState(playable);
  if (cursor !== undefined) s.cursor = cursor;
  s.start();
  for (let f = 0; f <= IN_LEN; f++) s.step({ trig: 0, rep: 0, hold: 0 }, f >= IN_LEN);
  return s;
}
const frame = (s: ModeSelectState, trig = 0, rep = 0, hold = trig): ModeEvent[] => s.step({ trig, rep, hold }, true);
const has = (ev: ModeEvent[], pred: (e: ModeEvent) => boolean): boolean => ev.some(pred);
const se = (ev: ModeEvent[]): string[] => ev.filter((e) => e.type === 'se').map((e) => (e as { label: string }).label);

console.log('1. 시작');
{
  const s = new ModeSelectState(OFFLINE);
  eq(s.phase, -1, '생성 직후 숨김(+0x3c = −1)');
  const ev = s.start();
  eq(s.phase, 0, 'In → 상태 0');
  eq(s.cursor, 0, '처음 커서 = 처음으로 보이고 가능한 버튼(0)');
  ok(has(ev, (e) => e.type === 'layout' && e.anim === 'in'), '"in" 재생');
  ok(has(ev, (e) => e.type === 'btn' && e.button === 0 && e.anim === 'on' && e.next === 'cursor'), '버튼 0 on → cursor');
  ok(has(ev, (e) => e.type === 'btn' && e.button === 3 && e.anim === 'normal'), '다른 버튼 normal');
  ok(has(ev, (e) => e.type === 'win' && e.button === 0 && e.visible), '사진 창 0 보임');
  ok(has(ev, (e) => e.type === 'icon' && e.button === 0 && e.anim === 'on'), '섬 아이콘 0 on');
  ok(has(ev, (e) => e.type === 'text' && e.button === 0), '설명 0');
  eq(s.shown, [true, true, true, true, true, true, true, false, true], '오프라인: 파티 지원 여행(7) 숨김');
  for (let f = 0; f < IN_LEN; f++) {
    const e2 = s.step({ trig: PAD.A, rep: 0, hold: PAD.A }, false);
    ok(!has(e2, (e) => e.type === 'decided') && s.phase === 0, `in 중(${f}) 입력 무시`);
    if (f > 2) break;
  }
  const e3 = s.step({ trig: 0, rep: 0, hold: 0 }, true);
  eq(s.phase, 1, 'in 끝 → 대기');
  ok(has(e3, (e) => e.type === 'guide' && e.anim === 'in'), '안내 In(같은 프레임)');
  const s2 = new ModeSelectState(OFFLINE);
  s2.cursor = 7;
  s2.start();
  eq(s2.cursor, 0, '이전 커서가 숨김 버튼이면 처음 가능한 버튼');
  const s3 = new ModeSelectState(OFFLINE);
  s3.cursor = 5;
  s3.start();
  eq(s3.cursor, 5, '이전 커서 유지');
}

console.log('2. 이동(누름은 넘어감, 반복은 끝에서 멈춤, 숨김 건너뜀)');
{
  const s = make();
  let ev = frame(s, PAD.UP & 0x800);
  eq(s.cursor, 8, '0 에서 위 누름 → 마지막 보이는 버튼(8, 7 은 숨김)');
  eq(se(ev), ['SQ_SE_SYS_CURSOR'], '커서 SE');
  ok(has(ev, (e) => e.type === 'se' && e.button === 8), 'Play2D 위치 = 새 버튼');
  ok(has(ev, (e) => e.type === 'vib'), '진동');
  ev = frame(s, 0x400);
  eq(s.cursor, 0, '8 에서 아래 누름 → 0');
  frame(s, 0, 0, 0);
  frame(s, 0, 0x800, 0x800);
  eq(s.cursor, 0, '0 에서 위 반복 → 그대로');
  ev = frame(s, 0, 0x800, 0x800);
  ok(!has(ev, (e) => e.type === 'se'), '움직이지 않으면 SE 없음');
  for (let i = 0; i < 6; i++) frame(s, 0, 0x400, 0x400);
  eq(s.cursor, 6, '반복 아래 6번 → 6');
  frame(s, 0, 0x400, 0x400);
  eq(s.cursor, 8, '6 에서 반복 아래 → 8(7 숨김 건너뜀)');
  frame(s, 0, 0x400, 0x400);
  eq(s.cursor, 8, '마지막에서 반복 아래 → 멈춤');
  frame(s, 0x20000, 0, 0x20000);
  eq(s.cursor, 6, '스틱 위 누름');
  const s2 = make((b) => (b === 2 || b === 4 ? 4 : 0));
  frame(s2, 0x400);
  frame(s2, 0x400);
  eq(s2.cursor, 3, '숨김 2 건너뜀: 0 → 1 → 3');
}

console.log('3. 십자/스틱 겹침 규칙');
{
  const s = make(OFFLINE, 3);
  frame(s, 0x20000, 0, 0x20000 | 0x400);
  eq(s.cursor, 3, '십자 아래를 누르고 있으면 스틱 위 누름은 위로 안 감');
  const s2 = make(OFFLINE, 3);
  frame(s2, 0x20000 | 0x400, 0, 0x20000 | 0x400);
  eq(s2.cursor, 4, '같은 상태에서 십자 아래 누름 → 아래로');
  const s3 = make(OFFLINE, 3);
  frame(s3, 0x80000, 0, 0x80000 | 0x800);
  eq(s3.cursor, 3, '십자 위를 누르고 있으면 스틱 아래 누름 무시');
  const s4 = make(OFFLINE, 3);
  frame(s4, 0x800 | 0x400, 0, 0x800 | 0x400);
  eq(s4.cursor, 2, '위·아래 동시 누름 → 위 우선');
}

console.log('4. 결정');
{
  const s = make();
  let ev = frame(s, PAD.A);
  ok(has(ev, (e) => e.type === 'btn' && e.button === 0 && e.anim === 'press'), 'press');
  eq(se(ev), ['SQ_SE_SYS_DECI'], 'DECI');
  eq([s.closing, s.result], [true, 0], '결정 기록');
  ev = frame(s);
  ok(has(ev, (e) => e.type === 'decided' && e.button === 0), '다음 프레임 결정 사건');
  ok(has(ev, (e) => e.type === 'guide' && e.anim === 'out'), '안내 Out');
  eq(s.running, false, '진행 끝');
  ev = frame(s, PAD.A | 0x400);
  eq(ev.length, 0, '끝난 뒤 입력 무시');
  eq(s.phase, 1, '결정 뒤에도 대기(다음 시퀀스가 Out 한다)');

  const s2 = make();
  ev = frame(s2, PAD.A | 0x400);
  eq(s2.cursor, 1, '같은 프레임 이동 + A → 이동만');
  ok(!s2.closing, 'A 무시');
}

console.log('5. 불가 결정(miss·ERROR·알림 3 s)');
{
  const s = make((b) => (b === 7 ? 4 : b === 4 ? 1 : 0), 4);
  eq(s.enabled[4], false, '버튼 4 불가');
  let ev = frame(s, PAD.A);
  ok(has(ev, (e) => e.type === 'btn' && e.button === 4 && e.anim === 'miss' && e.next === 'disable_cursor'), 'miss → disable_cursor');
  eq(se(ev), ['SQ_SE_SYS_ERROR'], 'ERROR');
  ok(has(ev, (e) => e.type === 'notice' && e.id === 'Notice_PlayModeMissed00'), '알림 PlayModeMissed00');
  ok(Math.abs(s.noticeTimer - NOTICE_COOLDOWN) < 1e-9, '타이머 3.0');
  ok(!s.closing, '닫히지 않음');
  frame(s, 0, 0, 0);
  ev = frame(s, PAD.A);
  ok(!has(ev, (e) => e.type === 'notice'), '3 s 안 다시 누르면 알림 없음');
  eq(se(ev), ['SQ_SE_SYS_ERROR'], 'ERROR 는 다시');
  for (let f = 0; f < 180; f++) frame(s, 0, 0, 0);
  ev = frame(s, PAD.A);
  ok(has(ev, (e) => e.type === 'notice'), '3 s 뒤 알림 다시');
  const s2 = make((b) => (b === 7 ? 4 : b === 2 ? 1 : 0), 1);
  ev = frame(s2, 0x400);
  ok(has(ev, (e) => e.type === 'btn' && e.button === 2 && e.anim === 'disable_on' && e.next === 'disable_cursor'), '불가 버튼에 커서 → disable_on');
  ok(has(ev, (e) => e.type === 'btn' && e.button === 1 && e.anim === 'normal'), '떠난 버튼 normal');
  const s3 = make((b) => (b === 0 ? 1 : b === 7 ? 4 : 0));
  eq(s3.cursor, 1, '처음 커서 = 처음 가능한 버튼(0 불가 → 1)');
}

console.log('6. 취소');
{
  const s = make(OFFLINE, 2);
  let ev = frame(s, PAD.B | 0x400 | PAD.A);
  eq(se(ev), ['SQ_SE_SYS_CANCEL'], '취소 SE(이동·결정보다 먼저)');
  eq([s.cursor, s.result], [2, 9], '커서 그대로, 결과 9');
  ev = frame(s);
  ok(has(ev, (e) => e.type === 'cancel'), '취소 사건');
  const s2 = make();
  frame(s2, PAD.Y);
  eq(s2.result, 9, '0x8 비트도 취소');
  const o = s2.out(false);
  ok(has(o, (e) => e.type === 'layout' && e.anim === 'out') && s2.phase === 2, 'Out(false) → out');
  s2.step({ trig: 0, rep: 0, hold: 0 }, false);
  eq(s2.phase, 2, 'out 애니 중');
  const e3 = s2.step({ trig: 0, rep: 0, hold: 0 }, true);
  ok(s2.finished && has(e3, (e) => e.type === 'visible' && !e.visible), 'out 끝 → 숨김(IsFinished)');
  eq(s2.out(false).length, 0, '이미 끝났으면 Out 무시');
  const s3 = make();
  s3.out(true);
  eq(s3.phase, -1, 'Out(true) 즉시 숨김');
}

console.log('7. 키 반복과 이어서');
{
  const s = make();
  const r = new RepeatGen();
  let n = 0;
  for (let f = 0; f < 40; f++) {
    const hold = 0x400;
    const trig = f === 0 ? 0x400 : 0;
    const before = s.cursor;
    s.step({ trig, rep: r.next(hold, trig), hold }, true);
    if (s.cursor !== before) n++;
  }
  eq(n, 1 + 3, '40프레임 아래 누르고 있기: 누름 1 + 반복(24f 뒤 6f 간격) 3');
  const s2 = make((b) => (b === 7 ? 0 : 0));
  eq(s2.shown.filter(Boolean).length, 9, '파티 지원 여행 해금이면 9칸');
  for (let i = 0; i < 7; i++) frame(s2, 0x400);
  eq(s2.cursor, 7, '해금 시 7 로 이동');
  frame(s2, PAD.A);
  frame(s2);
  eq(s2.result, 7, '7 결정');
  const s4 = make(() => 4);
  eq(s4.cursor, -1, '모두 숨김이면 커서 없음');
  const ev = frame(s4, 0x400);
  ok(has(ev, (e) => e.type === 'text' && e.button === -1), '목록이 비면 Cursor(−1)');
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
