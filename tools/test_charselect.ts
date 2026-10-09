/**
 * 캐릭터 선택 상태기계 시험 — script/app/scene/menu/charselect/state.ts 를 노드에서 돈다.
 * 기대값 근거: docs/shell/charselect.md 5절(원본 main FUN_710033a1e0·b540·c650·c3f0 판독). 원본 실행 대조가 아니라 판독한 규칙의 재구현 시험이다.
 *
 *   npx tsx tools/test_charselect.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { motionStart, Preview3D } from '@app/scene/menu/charselect/preview3d';
import { CharSelectState, PAD, RANDOM, RepeatGen, type CharSelectEvent, type PadFrame } from '@app/scene/menu/charselect/state';
import type { Spec } from '@app/scene/menu/charselect/types';

// selectCharacterList.json BtnNo (표 번호 순) [데이터]
const BTN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21];

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

function make(players: (0 | 1)[], opt: { unlocked?: { pauline: boolean; ninji: boolean }; initial?: number[]; disabled?: number[]; rand?: (n: number) => number } = {}) {
  const s = new CharSelectState({
    btnNo: BTN,
    unlocked: opt.unlocked ?? { pauline: false, ninji: false },
    players: players.map((t, i) => ({ type: t, initial: opt.initial?.[i] })),
    disabled: opt.disabled,
    rand: opt.rand ?? (() => 0),
  });
  s.start(false);
  // in 5프레임 → 상태 1
  for (let i = 0; i < 6; i++) s.step([]);
  return s;
}

/** 칸 p 만 trig 를 누른 한 프레임 */
function press(s: CharSelectState, p: number, trig: number, rep = 0): CharSelectEvent[] {
  const pads: PadFrame[] = [];
  pads[p] = { trig, rep };
  return s.step(pads);
}
function idle(s: CharSelectState, n: number): void {
  for (let i = 0; i < n; i++) s.step([]);
}
const btnOfCursor = (s: CharSelectState, p: number): number => s.btnOf(s.players[p].cursor);

console.log('1. 시작 상태');
{
  const s = make([0, 0, 0, 1]);
  eq(s.phase, 1, 'in 5프레임 뒤 상태 1');
  eq(s.players.map((p) => p.cursor), [0, 1, 2, 3], '초기 커서 = 칸 번호(이전 캐릭터 없음)');
  eq(s.players.map((p) => p.slot), [0, 1, 2, -1], '사람만 카드 슬롯');
  ok(s.occ(0) && s.occ(2) && !s.occ(3), 'COM(onGrid 0)은 점유가 아니다');
  const t = make([0, 0], { initial: [5, 5] });
  eq(t.players.map((p) => p.cursor), [5, 0], '앞 플레이어와 겹치면 첫 빈 칸');
}

console.log('2. 가로 이동·줄 넘김·랜덤');
{
  const s = make([0]);
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 1, '0 → 1');
  s.players[0].cursor = s.charaOf(10);
  press(s, 0, PAD.RIGHT);
  eq(s.players[0].cursor, RANDOM, '오른쪽 끝(10)에서 오른쪽 → 랜덤');
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 0, '랜덤에서 오른쪽 → 0');
  s.players[0].cursor = RANDOM;
  press(s, 0, PAD.LEFT);
  eq(btnOfCursor(s, 0), 10, '랜덤에서 왼쪽 → 10');
  s.players[0].cursor = RANDOM;
  press(s, 0, PAD.RIGHT | PAD.DOWN);
  eq(btnOfCursor(s, 0), 11, '랜덤에서 오른쪽+아래 → 11');
  s.players[0].cursor = s.charaOf(11);
  press(s, 0, PAD.LEFT);
  eq(s.players[0].cursor, RANDOM, '11 에서 왼쪽 → 랜덤');
}

console.log('3. 점유 건너뛰기·랜덤 점유 시 다음 줄');
{
  const s = make([0, 0]);
  // 0P = 0, 1P = 1
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 2, '1(2P 점유)을 건너뛰어 2');
  // 1P 를 랜덤으로
  s.players[1].cursor = RANDOM;
  s.players[0].cursor = s.charaOf(10);
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 11, '랜덤이 점유면 10 → 11');
  s.players[0].cursor = s.charaOf(21);
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 0, '랜덤이 점유면 21 → 0');
}

console.log('4. 세로 이동');
{
  const s = make([0, 0]);
  press(s, 0, PAD.DOWN);
  eq(btnOfCursor(s, 0), 11, '0 아래 → 11');
  press(s, 0, PAD.DOWN);
  eq(btnOfCursor(s, 0), 11, '아랫줄에서 아래는 그대로');
  press(s, 0, PAD.UP);
  eq(btnOfCursor(s, 0), 0, '11 위 → 0');
  press(s, 1, PAD.DOWN); // 1P 1 → 12
  s.players[0].cursor = s.charaOf(1);
  press(s, 0, PAD.DOWN);
  eq(btnOfCursor(s, 0), 1, '아래 칸(12)이 점유면 그대로');
  s.players[0].cursor = RANDOM;
  press(s, 0, PAD.DOWN);
  eq(s.players[0].cursor, RANDOM, '랜덤에서 세로는 무시');
}

console.log('5. 반복 입력: 줄 끝에서 멈춤, 왼쪽은 랜덤까지');
{
  const s = make([0]);
  s.players[0].cursor = s.charaOf(9);
  press(s, 0, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 10, '9 → 10');
  press(s, 0, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 10, '반복은 10 에서 멈춤');
  s.players[0].cursor = s.charaOf(0);
  press(s, 0, 0, PAD.LEFT);
  eq(s.players[0].cursor, RANDOM, '0 에서 왼쪽 반복 → 랜덤');
  s.players[0].cursor = s.charaOf(11);
  press(s, 0, 0, PAD.LEFT);
  eq(s.players[0].cursor, RANDOM, '11 에서 왼쪽 반복 → 랜덤');
}

console.log('6. 잠김 결정 = miss·ERROR, 해금되면 결정');
{
  const s = make([0]);
  s.players[0].cursor = 12; // 폴린(BtnNo 10)
  const ev = press(s, 0, PAD.A);
  ok(ev.some((e) => e.type === 'btn' && e.anim === 'miss' && e.chara === 12), '폴린 miss');
  ok(ev.some((e) => e.type === 'se' && e.label === 'SQ_SE_SYS_ERROR'), 'ERROR SE');
  ok(!s.players[0].decided, '결정 안 됨');
  const u = make([0], { unlocked: { pauline: true, ninji: true } });
  u.players[0].cursor = 21;
  const e2 = press(u, 0, PAD.A);
  ok(u.players[0].decided, '해금된 닌군 결정');
  ok(e2.some((e) => e.type === 'voice' && e.chara === 21), '보이스 사건');
  ok(e2.some((e) => e.type === 'motion' && e.clip === 'co_chr_slct00a' && e.next === 'co_chr_slct00b'), '선택 모션 a → b');
}

console.log('7. 랜덤 결정: 점유·잠김 제외 풀에서 rand');
{
  const s = make([0, 0], { rand: (n) => n - 1 });
  s.players[0].cursor = RANDOM;
  press(s, 0, PAD.A);
  // 풀 = 0..21 − {1(2P)} − {12, 21 잠김} − {RANDOM 아닌 자기} ... 마지막 = 20
  eq(s.players[0].cursor, 20, '풀 마지막 = 20(가봉)');
  ok(s.players[0].decided, '결정');
  // 사건 순서(docs 12.10 H): 고른 칸 카드 → 선택 모션 → 보이스(같은 프레임)
  const r = make([0], { rand: (n) => n - 1 });
  r.players[0].cursor = RANDOM;
  const ev = press(r, 0, PAD.A);
  const at = (t: string): number => ev.findIndex((e) => e.type === t);
  const card = ev.find((e) => e.type === 'card');
  ok(!!card && card.type === 'card' && card.chara === r.players[0].cursor && card.shown, '랜덤 결정 카드 = 고른 캐릭터·보임');
  ok(at('card') >= 0 && at('card') < at('motion') && at('motion') < at('voice'), `사건 순서 card → motion → voice: ${ev.map((e) => e.type).join(',')}`);
}

console.log('8. 결정 취소(B)·결정 뒤 이동 안 함');
{
  const s = make([0, 0]);
  press(s, 0, PAD.A);
  ok(s.players[0].decided, '결정');
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 0, '결정 뒤 이동 안 함');
  const ev = press(s, 0, PAD.B);
  ok(!s.players[0].decided, 'B 로 결정 취소');
  ok(ev.some((e) => e.type === 'motion' && e.clip === 'co_idle00'), '대기 모션 복귀');
  ok(ev.some((e) => e.type === 'voiceStop'), '보이스 정지');
}

console.log('9. 결정 안 한 조작 플레이어 B = 화면 취소, 다른 사람 B 는 무시');
{
  const s = make([0, 0]);
  press(s, 1, PAD.B);
  eq(s.phase, 1, '2P B 무시');
  const ev = press(s, 0, PAD.B);
  ok(ev.some((e) => e.type === 'cancel'), '1P B → cancel');
  eq(s.phase, 4, 'out 대기');
  idle(s, 6);
  eq(s.phase, 5, '끝');
  ok(!s.decided, 'IsDecided 0');
}

console.log('10. 전원 결정 → press 끝까지 기다림 → OK → A → 결과');
{
  const s = make([0, 0, 1], { rand: () => 0 });
  press(s, 0, PAD.A);
  press(s, 1, PAD.A);
  eq(s.phase, 1, 'press 애니(19f) 중에는 OK 안 나옴');
  idle(s, 20);
  eq(s.phase, 2, 'press 끝난 뒤 상태 2');
  ok(s.btnAnim(5) === 'disable', '안 고른 칸 disable');
  // 2P B → 상태 1 복귀
  press(s, 1, PAD.B);
  eq(s.phase, 1, '상태 2 에서 B → 1');
  ok(s.btnAnim(5) !== 'disable', 'disable 풀림');
  press(s, 1, PAD.A);
  idle(s, 20);
  eq(s.phase, 2, '다시 상태 2');
  press(s, 1, PAD.A);
  eq(s.phase, 2, '조작 플레이어가 아니면 OK 안 됨');
  const ev = press(s, 0, PAD.A);
  const d = ev.find((e) => e.type === 'decided') as { result: number[] } | undefined;
  eq(d?.result, [0, 1, 2], '결과: 사람 커서 + COM 은 남은 첫 칸(rand 0)');
  eq(s.phase, 3, 'OK press 대기');
  idle(s, 19);
  eq(s.phase, 4, 'press 끝 → out');
  ok(s.decided, 'IsDecided');
  idle(s, 6);
  eq(s.phase, 5, '끝');
}

console.log('11. 사용 불가 칸 건너뛰기');
{
  const s = make([0], { disabled: [1, 2] });
  press(s, 0, PAD.RIGHT);
  eq(btnOfCursor(s, 0), 3, '1·2 사용 불가 → 3');
}

console.log('12. 키 반복 생성(근사 24f/6f)');
{
  const r = new RepeatGen();
  const out: number[] = [];
  for (let f = 0; f < 40; f++) out.push(r.next(PAD.RIGHT & 0x200, f === 0 ? 0x200 : 0) ? f : -1);
  eq(out.filter((x) => x >= 0), [0, 24, 30, 36], '첫 프레임, 24, 30, 36');
}

console.log('13. 3D 모션 시간축(docs 12.10 B·E·F): 모델 없이도 흐르고, 시작 프레임 규칙');
{
  const spec = JSON.parse(readFileSync(join(import.meta.dirname, '../assets/charselect/spec.json'), 'utf8')) as Spec;
  eq(motionStart(null, 'co_idle00', 120, (n) => n - 1), { frame: 119, blend: 0 }, '노드 없음 → idle 난수, 블렌드 0');
  eq(motionStart(true, 'co_chr_slct00a', 63, (n) => n - 1), { frame: 0, blend: 0.1 }, 'idle → slct00a = 0, 블렌드 0.1');
  eq(motionStart(false, 'co_chr_slct00b', 58, (n) => n - 1), { frame: 0, blend: 0.1 }, 'a(비루프) → b = startFrame 0');
  eq(motionStart(true, 'co_chr_idle00', 180, (n) => n - 1), { frame: 179, blend: 0.1 }, 'b(루프) → idle = 난수');
  const p = new Preview3D(spec, (u) => u, (n) => n - 1);
  p.setup([[100, 100]]);
  const s0 = p.slots[0];
  p.setChara(0, 0, true);
  eq([s0.current, s0.frame, s0.root], ['co_idle00', 119, null], '마리오 카드: 준비 전에도 대기 시간축(난수 시작), 모델 없음');
  p.setChara(0, 6, true);
  eq([s0.current, s0.frame], ['co_chr_idle00', 179], '요시 대기 = co_chr_idle00');
  p.setChara(0, 0, true);
  p.play(0, 'co_chr_slct00a', 'co_chr_slct00b');
  const a = spec.chars[0].clips!.co_chr_slct00a.frames;
  for (let i = 0; i < a - 1; i++) p.update();
  eq([s0.current, s0.frame], ['co_chr_slct00a', a - 1], '모델 없이 결정 모션 진행');
  p.update();
  eq([s0.current, s0.frame, s0.next], ['co_chr_slct00b', 0, null], 'a 끝 → b(EnqueuePlay)');
  p.play(0, 'co_idle00');
  eq([s0.current, s0.frame], ['co_idle00', 119], '결정 취소 → 대기 난수 시작');
  p.setChara(0, RANDOM, false);
  p.play(0, 'co_chr_slct00a');
  eq([s0.current, s0.shown], ['', false], '숨김 카드는 모션 무시');
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
