/**
 * 파티 규칙 화면 상태 시험 — script/shell/partyrule 을 실제 명세(assets/mgmcommon/spec.json + assets/partyrule/partyrule.json + assets/mgm01/faces.json)로
 * 노드에서 돈다(WebGL 없음). 기대값 근거: docs/shell/partyrule.md 4~6·10절(판독한 규칙의 재구현 시험, 원본 실행 대조 아님).
 *
 *   npx tsx tools/test_partyrule.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Render2D } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';
import { resolveFontsFromDisk } from './fontSpecNode';
import { mergeSpec, MgmSound, type MgmDrawHost, type MgmPadSource, type MgmSpec, type MgmSpecPart } from '../script/shell/mgmcommon';
import {
  applyPartyRuleExtra,
  CHECK_MINUTES,
  CHECK_TURN,
  checkTurnIndex,
  defaultConfig,
  PartyRuleScreen,
  type PartyRuleConfig,
  type PartyRuleExtra,
  type Scr,
} from '../script/shell/partyrule';

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

const base = read<MgmSpec>('mgmcommon/spec.json');
const part = read<MgmSpecPart & PartyRuleExtra>('partyrule/partyrule.json');
let spec = mergeSpec(base, part);
spec = mergeSpec(spec, read<MgmSpecPart>('mgm01/faces.json'));
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
applyPartyRuleExtra(spec, part);
const all = spec as unknown as Spec;
const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} };

class Pads implements MgmPadSource {
  private next = 0;
  private holdBits = 0;
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

const A = 0x1;
const B = 0x2;
const UP = 0x800;
const DOWN = 0x400;
const LEFT = 0x100;
const RIGHT = 0x200;

function make(cfg: PartyRuleConfig, start?: string): { s: PartyRuleScreen; pads: Pads; se: string[] } {
  const pads = new Pads();
  const se: string[] = [];
  const sound = new MgmSound(spec.sounds, (p) => p, { play: (l) => se.push(l) });
  const s = new PartyRuleScreen({ host, cfg, pads, sound, start });
  return { s, pads, se };
}

function until(s: PartyRuleScreen, pred: () => boolean, max = 600): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    s.tick(DT);
  }
  return -1;
}

function textOf(s: PartyRuleScreen, scr: Scr, path: string): string {
  const f = s.view.inst[scr].find(path);
  return f ? (f[0].texts.get(f[1]) ?? '') : '';
}

function visOf(s: PartyRuleScreen, scr: Scr, path: string): boolean {
  const f = s.view.inst[scr].find(path);
  return !!f && f[0].nodes[f[1]].v;
}

/** 선택지가 입력을 받을 수 있게 될 때까지(in_choice 끝·입력 잠금 지남) */
function waitChoice(s: PartyRuleScreen): number {
  return until(s, () => s.msg.st.choice && s.msg.st.nextInputWait && s.msg.st.inputLock <= 0 && !!s.msg.layoutInst?.done);
}

function press(s: PartyRuleScreen, pads: Pads, bits: number, after = 1): void {
  pads.press(bits);
  for (let i = 0; i < after; i++) s.tick(DT);
}

console.log('1. 표·라벨');
{
  const turns = [10, 12, 15, 20, 25, 30, 7];
  eq(
    turns.map((t) => [CHECK_TURN[checkTurnIndex(t)], CHECK_MINUTES[checkTurnIndex(t)]]),
    [
      [10, 90],
      [12, 100],
      [15, 120],
      [20, 150],
      [25, 180],
      [30, 210],
      [15, 120],
    ],
    '턴 → (표시 턴, 약 N분)',
  );
  const labels = [
    'mn01_bd_mw_member_check', 'mn01_bd_mw_member_check_a0', 'mn01_bd_mw_member_check_a1', 'mn01_bd_mw_member_check_a2',
    'mn01_bd_mw_member_chara', 'mn01_bd_mw_member_level', 'mn01_bd_mw_member_speed', 'mn01_bd_mw_member_handi',
    'mn01_bd_mw_check', 'mn01_bd_mw_check_a0', 'mn01_bd_mw_check_a1', 'mn01_bd_mw_check_a2', 'mn01_bd_ui_check_aboutTime',
    'mn01_bd_ui_mode_party', 'mn01_bd_ui_check_map', 'mn01_bd_ctrl_detail_end', 'im_comLevel01', 'im_mn_com_speed_normal',
    'mn01_bd_ui_member_handi_off', 'mn01_bd_mw_detail_turn', 'mn01_bd_ui_detail_choice_turn', 'im_bd07_name', 'sys_ctrl_back',
  ];
  const miss = labels.filter((l) => !(l in spec.texts));
  eq(miss, [], '라벨 존재');
  eq(spec.texts.mn01_bd_mw_member_handi, '핸디캡을 설정합니다.', '핸디캡 메시지 문구');
  eq(spec.meswin.window[spec.msgAttr.mn01_bd_mw_check.wt].type, 'Model', '확인 메시지 창 형식 = Model');
  ok(!!spec.layouts.sys_meswin_model_choices_00 && !!spec.layouts.mn01_base_set_member_03, '레이아웃 있음');
  ok([...((part.fonts?.bqfont_small as { chars?: string } | undefined)?.chars ?? '')].every((c) => !!spec.fonts.bqfont_small.glyphs[c]) && (spec.fonts.bqfont_small as { dir?: string }).dir === '../font/', '화면 글꼴 = 공용 글꼴(화면 글자 전부 있음)');
}

console.log('2. 멤버 확인 → 멤버 설정(사람 3·CPU 1)');
const cfg = defaultConfig(3);
const { s, pads, se } = make(cfg);
{
  ok(waitChoice(s) >= 0, '멤버 확인 선택지 열림');
  eq(s.flow.step, 'checkMember', '단계');
  eq(s.msg.layoutInst?.name, 'sys_meswin_model_choices_00', '선택지 레이아웃');
  eq(textOf(s, 'telop', 'x_text_title'), '거대꽃충이와 과자의 숲', '보드 이름 띠(보드 6)');
  ok(visOf(s, 'telop', 'x_base_06') && !visOf(s, 'telop', 'x_base_00'), '띠 색 x_base_06 만');
  eq(textOf(s, 'title', 'x_text_mode'), '마리오 파티: 파티 규칙', '제목 띠');
  eq(s.msg.layoutInst?.find('x_parts_01/x_text_dialog')?.[0].texts.get(s.msg.layoutInst!.find('x_parts_01/x_text_dialog')![1]), '멤버 설정', '선택지 칸 1 = 멤버 설정');
  press(s, pads, UP);
  eq(s.msg.st.choiceCursor, 0, '위: 첫 칸에서 멈춤(순환 없음)');
  press(s, pads, DOWN);
  eq(s.msg.st.choiceCursor, 1, '아래 → 1');
  press(s, pads, A);
  eq(s.msg.choiceResult(), 1, '결과 1');
  ok(until(s, () => s.flow.step === 'settingMember') >= 0, '멤버 설정으로');
  ok(until(s, () => s.member.life.idle) >= 0, '멤버 판 대기 상태');
  eq(s.member.rowOn, [true, true, true, true], '행 사용');
  eq(s.member.comCount, 1, 'COM 수');
  eq(s.member.levelMerge, 4, 'COM 1명 → 개별(4)');
  eq([0, 1, 2, 3, 4, 5].map((i) => visOf(s, 'member', `x_parts_list/x_btn_level/x_parts_0${i}`)), [true, true, true, true, false, false], '난이도 칸 보임');
  eq(textOf(s, 'member', 'x_parts_list/x_btn_level/x_parts_03/x_text_personal'), '보통', 'CPU 난이도 보통');
  eq(textOf(s, 'member', 'x_parts_list/x_btn_speed/x_parts_03/x_text_speed'), '보통', 'CPU 속도 보통');
  ok(visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_04') && !visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_00'), '핸디캡 모두 0 → 없음 칸');
  eq(textOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_04/x_text_speed'), '없음', '없음 글자');
  ok(visOf(s, 'member', 'x_parts_list/x_btn_cpu/x_pc_03/x_cpu') && !visOf(s, 'member', 'x_parts_list/x_btn_cpu/x_pc_00/x_cpu'), 'CPU 표시는 4P 만');
  eq(s.member.row, 0, '커서 = 멤버 행');
  const rows: number[] = [];
  for (let i = 0; i < 4; i++) {
    press(s, pads, DOWN, 2);
    rows.push(s.member.row);
  }
  eq(rows, [1, 2, 3, 0], '아래 네 번 → 순환');
  press(s, pads, UP, 2);
  eq(s.member.row, 3, '위 → 핸디캡 행(순환)');
  ok(until(s, () => s.msg.st.typer?.done === true) >= 0, '행 설명 글자 끝까지');
  eq(s.msg.st.current?.rt.units.map((u) => u.ch).join(''), '핸디캡을 설정합니다.', '행 설명 = 핸디캡을 설정합니다.');
  eq(s.msg.layoutInst?.name, 'sys_meswin_model_00', '행 설명 창 = Model');
}

console.log('3. 핸디캡 편집(취소·저장)');
{
  until(s, () => s.view.done('member', 'x_parts_list/x_btn_handicap'));
  press(s, pads, A, 2);
  ok(s.member.busy, '편집 파이버');
  until(s, () => visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_00'));
  press(s, pads, UP, 1);
  eq(s.member.handicap[0], 1, '위 → 1P 1');
  eq(textOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_00/x_text_handicap'), '1', '값 글자');
  press(s, pads, DOWN, 1);
  press(s, pads, DOWN, 1);
  eq(s.member.handicap[0], 5, '아래 두 번 → 5(순환)');
  press(s, pads, LEFT, 1);
  eq(s.member.handiCursor, 3, '왼쪽 → 4P(순환)');
  press(s, pads, B, 1);
  ok(until(s, () => !s.member.busy) >= 0, '취소로 편집 끝');
  eq(cfg.players.map((p) => p.handicap), [0, 0, 0, 0], '취소 → 저장 안 함');
  ok(visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_04'), '다시 없음 칸');
  until(s, () => s.view.done('member', 'x_parts_list/x_btn_handicap'));
  press(s, pads, A, 2);
  until(s, () => visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_00'));
  press(s, pads, UP, 1);
  press(s, pads, A, 1);
  ok(until(s, () => !s.member.busy) >= 0, '저장으로 편집 끝');
  eq(cfg.players.map((p) => p.handicap), [1, 0, 0, 0], 'A → SetBoardHandicap');
  ok(visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_00') && !visOf(s, 'member', 'x_parts_list/x_btn_handicap/x_parts_04'), '값 칸 보임');
  ok(se.includes('SQ_SE_SYS_CURSOR_S') && se.includes('SQ_SE_SYS_CANCEL'), '소리: 값 바꿈·취소');
}

console.log('4. 난이도·속도 편집(COM 1명 = 개별)');
{
  press(s, pads, UP, 2);
  press(s, pads, UP, 2);
  eq(s.member.row, 1, '난이도 행');
  until(s, () => s.view.done('member', 'x_parts_list/x_btn_level'));
  press(s, pads, A, 3);
  until(s, () => s.member.levelCursor === 3 && s.member.busy);
  for (let i = 0; i < 5; i++) s.tick(DT);
  press(s, pads, UP, 1);
  eq(s.member.level[3], 2, '위 → 강함');
  eq(textOf(s, 'member', 'x_parts_list/x_btn_level/x_parts_03/x_text_personal'), '강함', '글자 강함');
  press(s, pads, A, 1);
  until(s, () => !s.member.busy);
  eq(cfg.players.map((p) => p.level), [1, 1, 1, 2], 'A → COM 만 SetComLevel');
  press(s, pads, DOWN, 2);
  eq(s.member.row, 2, '속도 행');
  until(s, () => s.view.done('member', 'x_parts_list/x_btn_speed'));
  press(s, pads, A, 3);
  until(s, () => s.view.inst.member.part('x_parts_list/x_btn_speed/x_parts_03')?.current === 'cursor');
  press(s, pads, DOWN, 1);
  eq(textOf(s, 'member', 'x_parts_list/x_btn_speed/x_parts_03/x_text_speed'), '빠름', '속도 빠름');
  press(s, pads, A, 1);
  until(s, () => !s.member.busy);
  eq(cfg.flag8, true, 'flag 8 = 빠름');
}

console.log('5. 닫기 → 멤버 확인 → 예 → 규칙 확인');
{
  press(s, pads, B, 1);
  ok(s.member.closing, 'B → 닫기 요청');
  ok(until(s, () => s.flow.step === 'checkMember' && s.flow.history.length >= 3) >= 0, '멤버 확인으로 되돌아감');
  eq(cfg.menuLevel, [1, 1, 1, 2], 'Menu+0x20.. 저장');
  eq(cfg.menuSpeed, true, 'Menu+0x24 저장');
  ok(waitChoice(s) >= 0, '선택지 다시');
  eq(s.msg.st.choiceCursor, 0, '초기 커서 0');
  press(s, pads, A);
  ok(until(s, () => s.flow.step === 'checkRule') >= 0, '규칙 확인으로');
  ok(waitChoice(s) >= 0, '확인 선택지 열림');
  eq(textOf(s, 'check', 'x_parts_win/x_text_turn'), '10', '턴 수 10');
  eq(textOf(s, 'check', 'x_parts_win/x_text_time'), '약 90분', '약 90분');
  eq(textOf(s, 'check', 'x_parts_win/x_parts_set_01/x_text_set'), '있음', '보너스 스타 있음');
  eq(textOf(s, 'check', 'x_parts_win/x_parts_set_02/x_text_set'), '있음', '미니게임 설명 있음');
  eq(textOf(s, 'check', 'x_parts_win/x_parts_set_03/x_text_set'), '있음', '체감 미니게임 있음');
  eq(textOf(s, 'check', 'x_parts_win/x_text_mg'), '미니게임 설정', '구분 제목');
  eq(s.view.inst.check.part('x_parts_win')?.current, 'normal_4', '판 4행(GameFlag 0x20 없음)');
  ok(visOf(s, 'telop', 'x_base_06') && s.view.inst.telop.visible, '보드 이름 띠 보임');
  const lay = s.msg.layoutInst!;
  const names = [0, 1, 2].map((i) => lay.find(`x_parts_0${i}/x_text_dialog`)).map((f) => (f ? f[0].texts.get(f[1]) : ''));
  eq(names, ['스타트!', '플레이 방법 설정', '뒤로'], '선택지 순서');
  press(s, pads, DOWN);
  press(s, pads, DOWN);
  press(s, pads, DOWN);
  eq(s.msg.st.choiceCursor, 2, '끝에서 멈춤');
  press(s, pads, UP);
  eq(s.msg.st.choiceCursor, 1, '위 → 플레이 방법 설정');
  press(s, pads, A);
  ok(until(s, () => s.check.result !== -1) >= 0, '결과');
  eq(s.check.result, 2, '결과 2(플레이 방법 설정)');
}

console.log('6. 플레이 방법 설정 → 턴 15 → 규칙 확인');
{
  ok(until(s, () => s.flow.step === 'settingRule') >= 0, '플레이 방법 설정으로');
  ok(until(s, () => s.rule.life.idle) >= 0, '판 대기');
  eq(s.rule.rowOn, [true, true, true, true, false], '행 사용(정하는 법 없음)');
  eq(s.rule.lists[1], [0, 2], '보너스 목록(있음·없음)');
  eq(s.rule.row, 0, '커서 = 턴');
  eq(textOf(s, 'rule', 'x_parts_win/x_parts_set_00/x_parts_cursor_00/x_text_yes_no'), '10', '턴 값 글자');
  eq(textOf(s, 'rule', 'x_parts_win/x_parts_pict_00/x_text_turn'), '90', '그림 분');
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, RIGHT, 1);
  eq(s.rule.value[0], 1, '오른쪽 → TURN 1(15)');
  press(s, pads, LEFT, 1);
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, LEFT, 1);
  eq(s.rule.value[0], 0, '왼쪽 → 다시 10(press 애니 끝까지 입력 무시)');
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, LEFT, 1);
  eq(s.rule.value[0], 4, '왼쪽 → 30(순환)');
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, RIGHT, 1);
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, RIGHT, 1);
  eq(s.rule.value[0], 1, '→ 15');
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, DOWN, 1);
  eq(s.rule.row, 1, '아래 → 보너스 행');
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, RIGHT, 1);
  eq(cfg.bonusType, 1, 'Finish 전에는 BoardWork 그대로');
  eq(s.rule.value[1], 2, '보너스 → 없음');
  press(s, pads, B, 1);
  eq(cfg.turnMax, 10, 'press 애니 중 B 는 무시(UpdateProcess 가 다섯 행 애니 끝을 먼저 봄)');
  until(s, () => [0, 1, 2, 3, 4].every((i) => s.view.done('rule', `x_parts_win/x_parts_set_0${i}/x_parts_cursor_00`)));
  press(s, pads, B, 1);
  eq(cfg.turnMax, 15, 'B(설정 완료) → TurnMax 15');
  eq(cfg.bonusType, 0, 'BonusStarType 0(없음)');
  ok(until(s, () => s.flow.step === 'checkRule' && s.flow.history.filter((h) => h === 'checkRule').length === 2) >= 0, '규칙 확인으로 돌아감');
  ok(waitChoice(s) >= 0, '선택지');
  eq(textOf(s, 'check', 'x_parts_win/x_text_time'), '약 120분', '약 120분');
  eq(textOf(s, 'check', 'x_parts_win/x_parts_set_01/x_text_set'), '없음', '보너스 없음');
  press(s, pads, A);
  ok(until(s, () => s.finished) >= 0, '스타트! → 끝');
  ok(se.includes('SQ_SE_SYS_DECI_L'), '스타트! 결정 SE = DECI_L');
}

console.log('7. 뒤로 / B 취소 / COM 3명 합친 칸');
{
  const c2 = defaultConfig(1);
  c2.players[1].level = 2;
  c2.players[2].level = 2;
  c2.players[3].level = 2;
  const r = make(c2, 'check');
  ok(waitChoice(r.s) >= 0, '규칙 확인에서 시작');
  press(r.s, r.pads, B);
  ok(until(r.s, () => r.s.check.result !== -1) >= 0, 'B 결과');
  eq(r.s.check.result, 1, 'B(취소 가능) → 뒤로');
  ok(until(r.s, () => r.s.flow.step === 'checkMember') >= 0, '멤버 확인으로');
  ok(waitChoice(r.s) >= 0, '선택지');
  press(r.s, r.pads, DOWN);
  press(r.s, r.pads, A);
  ok(until(r.s, () => r.s.member.life.idle) >= 0, '멤버 설정');
  eq(r.s.member.comCount, 3, 'COM 3');
  eq(r.s.member.levelMerge, 2, '모두 강함 → 합친 값 2');
  eq([0, 1, 2, 3, 4, 5].map((i) => visOf(r.s, 'member', `x_parts_list/x_btn_level/x_parts_0${i}`)), [true, false, false, false, false, true], '00 + 3칸 너비 05');
  eq(textOf(r.s, 'member', 'x_parts_list/x_btn_level/x_parts_05/x_text_personal'), '강함', '합친 칸 글자');
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
