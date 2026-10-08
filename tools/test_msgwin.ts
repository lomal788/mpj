/**
 * 메시지 창·메시지 흐름 상태 시험 — script/shell/mgmcommon/messageWindow·messageFlow 를 실제 명세(assets/mgmcommon/spec.json, sys_meswin_00)로
 * 노드에서 돈다(WebGL 없음). 기대값 근거: docs/shell/message_window.md 5·6·10절, mgm_common.md 5.3·10절(판독한 규칙의 재구현 시험).
 *
 *   npx tsx tools/test_msgwin.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Render2D } from '../script/shell/charselect/render2d';
import { LayoutInst } from '../script/shell/charselect/scene2d';
import type { Spec } from '../script/shell/charselect/types';
import {
  FiberRunner,
  measure,
  MessageFlow,
  MessageWindow,
  MgmSound,
  parseMessage,
  setPlace,
  Typer,
  type MgmDrawHost,
  type MgmSpec,
} from '../script/shell/mgmcommon';
import { resolveFontsFromDisk } from './fontSpecNode';

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
const near = (a: number, b: number, e = 1e-3): boolean => Math.abs(a - b) <= e;
const DT = Math.fround(1 / 60);

const spec = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/spec.json'), 'utf8')) as MgmSpec;
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
const all = spec as unknown as Spec;
const texts = spec.texts;
const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} };

/** 시험 입력: 플레이어 0 사람, 1 COM. press(pid, bits) 는 다음 update 한 번만 */
class FakeInput {
  com = new Set<number>([1]);
  private next = new Map<number, number>();
  private cur = new Map<number, number>();
  press(pid: number, bits = 0x1): void {
    this.next.set(pid, (this.next.get(pid) ?? 0) | bits);
  }
  tick(): void {
    this.cur = this.next;
    this.next = new Map();
  }
  trigOf(pid: number): number {
    return this.cur.get(pid) ?? 0;
  }
  isCom(pid: number): boolean {
    return this.com.has(pid);
  }
}

function make(): { mw: MessageWindow; inp: FakeInput; snd: MgmSound; step: () => void } {
  const inp = new FakeInput();
  const snd = new MgmSound(spec.sounds, (p) => p);
  const mw = new MessageWindow(host, inp, snd);
  return {
    mw,
    inp,
    snd,
    step: () => {
      inp.tick();
      mw.update(DT);
    },
  };
}

console.log('1. 글자 진행(6.3)');
{
  const t = new Typer(10, new Map(), { speed: 0, online: false });
  const at: number[] = [];
  let sounds = 0;
  for (let f = 1; f <= 60 && t.typing; f++) {
    const before = t.visible;
    sounds += t.update(DT);
    if (t.visible !== before) at.push(f);
  }
  const gaps = at.slice(1).map((v, i) => v - at[i]);
  ok(at[0] === 3 || at[0] === 4, `첫 글자 프레임 3 또는 4 (${at[0]})`);
  ok(at[0] === 3 && gaps.every((g) => g === 2), `의사코드 그대로: 첫 글자 3번째 틱, 이후 2틱마다(글자 낸 틱에도 timer −= dt, message_window.md 6.3 정정) (${gaps.join(',')})`);
  ok(!t.typing && t.done && t.visible === 10, '10번째 글자 뒤 typing = 0');
  eq(sounds, 10, '글자마다 소리 1회');
  console.log(`   0.05 s 글자 프레임: ${at.join(',')}`);
  const t1 = new Typer(10, new Map(), { speed: 1, online: false });
  eq([t1.visible, t1.typing, t1.update(DT)], [10, false, 0], '설정 1: 즉시 전부, 소리 없음');
  const to = new Typer(10, new Map(), { speed: 0, online: true });
  eq([to.visible, to.typing], [10, false], '온라인: 즉시');
  const t2 = new Typer(3, new Map(), { speed: 2, online: false });
  const at2: number[] = [];
  for (let f = 1; f <= 40 && t2.typing; f++) {
    const b = t2.visible;
    t2.update(DT);
    if (t2.visible !== b) at2.push(f);
  }
  ok(at2[0] === 7 && at2[1] - at2[0] === 6, `설정 2: 0.1 s → 첫 글자 7번째 틱, 이후 6틱마다(f32 경계) (${at2.join(',')})`);
  const tw = new Typer(4, new Map([[2, 8]]), { speed: 0, online: false });
  const atw: number[] = [];
  for (let f = 1; f <= 80 && tw.typing; f++) {
    const b = tw.visible;
    tw.update(DT);
    if (tw.visible !== b) atw.push(f);
  }
  ok(atw[2] - atw[1] >= 23 && atw[2] - atw[1] <= 25, `Wait_Scale 8.0: 2번째 글자 뒤 0.4 s (${atw.join(',')})`);
  const ts = new Typer(10, new Map(), { speed: 0, online: false });
  ts.update(DT);
  ts.skip();
  eq([ts.visible, ts.done], [10, true], '스킵 = 남은 글자 즉시');
}

console.log('2. 배치·화자(6.1·6.5)');
{
  eq(setPlace(7, { w: 1920, h: 450, x: 0, y: -45 }), [0, -270], 'sys_meswin_00 Bottom_Center → (0, −270)');
  eq(setPlace(1, { w: 1920, h: 450, x: 0, y: -45 }), [0, 360], 'Top_Center → (0, +360)');
  const { mw } = make();
  mw.setMessageLabel('mgmet_entFirst_mw_guide01');
  mw.start();
  eq([mw.base[2], mw.base[5]], [0, -270], 'mgmet 안내(WT_Name·Bottom_Center) 창 위치');
  const inst = mw.layoutInst!;
  eq(inst.name, 'sys_meswin_00', 'WT_Name → sys_meswin_00');
  const nameF = inst.find('x_text_name')!;
  eq(nameF[0].texts.get(nameF[1]), '키노피오', '이름표 = im_npc022_name(CH_NPC022_GREEN)');
  const ts = nameF[0].nodes[nameF[1]].spec.txt!;
  const w = measure(spec.fonts[ts.font], ts.fs, ts.cs, '키노피오');
  const bf = inst.find('x_base_name')!;
  ok(near(bf[0].nodes[bf[1]].z[0], w + 60), `이름표 폭 = 글자 폭 + 60 (${(w + 60).toFixed(1)})`);
  ok(!inst.nodes[inst.byName.get('x_icon')!].v && inst.nodes[inst.byName.get('x_name')!].v, 'Name 형식: 얼굴 숨김, 이름표 보임');
}

console.log('3. 상태기계: 열기·글자·넘김(사람)·닫기(5절, 6.2)');
{
  const { mw, inp, snd, step } = make();
  const label = 'mgmet_entFirst_mw_guide02';
  const n = parseMessage(texts[label], texts).units.length;
  mw.setMessageLabel(label);
  mw.setOwner(0);
  mw.setTalkSkip(0);
  mw.disablePadInput(false, false);
  mw.start();
  eq([mw.st.state, mw.currentMessageNo(), mw.isEnd()], [0, -1, false], 'Start: 상태 0(열기), 번호 −1');
  step();
  eq(mw.layoutInst!.current, 'in', '하위 0: in 재생, 보이기');
  ok(mw.layoutInst!.visible, '창 보임');
  let f = 1;
  while (mw.st.state === 0 && f < 50) {
    step();
    f++;
  }
  const inLen = spec.layouts.sys_meswin_00.anims.in.len;
  eq(inLen, 5, 'sys_meswin_00 in 5f');
  eq(f, inLen + 1, `in(5f) 끝을 본 틱에 상태 1 (Start 뒤 ${f}번째 갱신)`);
  step();
  eq([mw.currentMessageNo(), mw.layoutInst!.current], [0, 'normal'], '페이지 0, normal');
  const putBefore = snd.log.filter((e) => e.type === 'se' && e.label === 'SQ_VOI_SYS_MES_PUT').length;
  let F = 0;
  for (let k = 0; k < 400 && !mw.isNextInputWait(); k++) {
    step();
    F++;
  }
  ok(mw.isNextInputWait(), `글자 다 나옴 → IsNextInputWait (${F} 틱, ${n} 글자)`);
  ok(mw.isAllTalkEnd(), '마지막 페이지 글자 완료 → IsAllTalkEnd');
  const puts = snd.log.filter((e) => e.type === 'se' && e.label === 'SQ_VOI_SYS_MES_PUT').length - putBefore;
  ok(puts >= Math.min(n, 60) - 1, `글자 소리 = 모드 프리셋 SQ_VOI_SYS_MES_PUT (${puts})`);
  let lockFrames = 0;
  for (; lockFrames < 30; lockFrames++) {
    inp.press(0);
    step();
    if (!mw.isNextInputWait()) break;
  }
  let lk = Math.fround(0.2);
  let expectLock = 0;
  do {
    lk = Math.fround(lk - DT);
    expectLock++;
  } while (lk > 0);
  eq(lockFrames + 1, expectLock, `완료 뒤 0.2 s(f32 누적) 동안 A 무시 → ${expectLock}번째 대기 틱에 넘김`);
  ok(!snd.log.some((e) => e.type === 'se' && e.label === 'SQ_SE_SYS_MES_PROC'), '잠금이 풀리는 틱에 바로 누르면 화살표가 아직 안 보여 PROC 없음(원본 순서 그대로)');
  step();
  eq([mw.st.state, mw.isOut()], [3, true], '마지막 페이지 → 상태 3(닫기), IsOut');
  step();
  eq(mw.layoutInst!.current, 'out', 'out 재생');
  let g = 0;
  while (!mw.isEnd() && g < 30) {
    step();
    g++;
  }
  eq(mw.st.state, -1, '닫기 끝 → 상태 −1');
  ok(!mw.layoutInst!.visible, '창 숨김');
  console.log(`   열기 ${f} 틱, 글자 ${F} 틱, 잠금 ${lockFrames + 1} 틱, 닫기 ${g + 2} 틱`);
}

console.log('4. 스킵·COM 자동·패드 막음');
{
  const { mw, inp, step } = make();
  mw.setMessageLabel('mgmet_entFirst_mw_guide01');
  mw.setOwner(0);
  mw.disablePadInput(false, false);
  mw.start();
  for (let k = 0; k < 8; k++) step();
  ok(mw.st.state === 1 && !!mw.st.typer?.typing, '글자 진행 중');
  inp.press(0);
  step();
  ok(mw.st.typer!.visible === mw.st.typer!.length, 'A = 남은 글자 즉시');
  ok(!mw.isNextInputWait(), '같은 틱에 넘기지 않음');
  step();
  ok(mw.isNextInputWait(), '다음 틱 IsNextInputWait');

  for (let k = 0; k < 30 && !mw.st.arrow; k++) step();
  ok(mw.st.arrow, '잠금 0.2 s 뒤 화살표 보임');
  inp.press(0);
  step();
  ok(mw.log.some((e) => e.type === 'se' && e.label === 'SQ_SE_SYS_MES_PROC'), '화살표가 보일 때 A → 넘김 SE SQ_SE_SYS_MES_PROC');

  const c = make();
  c.mw.setMessageLabel('mgmet_entFirst_mw_guide02');
  c.mw.setOwner(1);
  c.mw.disablePadInput(false, false);
  c.mw.start();
  let t = 0;
  while (!c.mw.isNextInputWait() && t < 400) {
    c.step();
    t++;
  }
  let auto = 0;
  while (c.mw.isNextInputWait() && auto < 200) {
    c.step();
    auto++;
  }
  ok(auto >= 51 && auto <= 53, `COM 소유자: 0.2 + 0.6667 s ≈ 52 틱 뒤 자동 넘김 (${auto})`);
  ok(!c.mw.st.arrow, 'COM 소유자면 화살표 안 보임');

  const p = make();
  p.mw.setMessageLabel('mgmet_entFirst_mw_guide02');
  p.mw.setOwner(0);
  p.mw.disablePadInput(true, false);
  p.mw.start();
  for (let k = 0; k < 200; k++) {
    p.inp.press(0);
    p.step();
  }
  ok(p.mw.isNextInputWait() && p.mw.st.state === 1, '패드 막음: A 로 안 넘어감');
  p.mw.requestNext(false);
  p.step();
  ok(!p.mw.isNextInputWait(), 'RequestNextMessage 는 받음');
}

console.log('5. 메시지 흐름(5.3)');
{
  const op = () => 0;
  const run = (fr: FiberRunner, step: () => void, until: () => boolean, max = 3000): number => {
    let k = 0;
    while (!until() && k < max) {
      fr.step();
      step();
      k++;
    }
    return k;
  };
  {
    const m = make();
    const fr = new FiberRunner();
    const flow = new MessageFlow(() => m.mw, { operator: op, dt: () => DT });
    flow.initialize();
    flow.prepare(['mgmet_entFirst_mw_guide00', 'mgmet_entFirst_mw_guide01', 'mgmet_entFirst_mw_guide02'], undefined, undefined, { Text0: 'im_mode03_name' });
    eq(flow.prepared, 0, 'PrepareMessage → +0x108 = 0');
    const h = fr.start(flow.flow(1));
    let k = 0;
    while (!h.done && k < 2000) {
      fr.step();
      m.step();
      if (m.mw.isNextInputWait() && k % 20 === 0) m.inp.press(0);
      k++;
    }
    ok(h.done, `MessageFlow(1) 끝 (${k} 틱)`);
    eq([m.mw.currentMessageNo(), m.mw.st.state], [1, 1], 'ContinueMessageFlow(1) → 페이지 1 표시 틱에 돌아옴, 창은 열린 채 [추정 해석]');
    const h2 = fr.start(flow.continueFlow(0));
    k = 0;
    while (!h2.done && k < 3000) {
      fr.step();
      m.step();
      if (m.mw.isNextInputWait() && k % 20 === 0) m.inp.press(0);
      k++;
    }
    ok(h2.done && m.mw.isEnd() && m.mw.st.state === -1, 'ContinueMessageFlow(0) → 끝까지');
    const rt = parseMessage(texts.mgmet_entFirst_mw_guide00, texts, { Text0: 'im_mode03_name' });
    eq(rt.units.map((u) => u.ch).join(''), '미니게임 항구에 잘 오셨습니다!', '첫 페이지 삽입');
  }
  {
    const m = make();
    const fr = new FiberRunner();
    const flow = new MessageFlow(() => m.mw, { operator: op, dt: () => DT });
    flow.initialize();
    flow.prepare(['mgmet_fp_mw_howToPlay00', 'mgmet_fp_mw_howToPlay01']);
    const h = fr.start(flow.autoFlow(0));
    let waitStart = -1;
    let req = -1;
    let k = 0;
    while (!h.done && k < 3000) {
      fr.step();
      const before = m.mw.isNextInputWait();
      m.step();
      if (!before && m.mw.isNextInputWait() && waitStart < 0) waitStart = k;
      if (waitStart >= 0 && req < 0 && m.mw.currentMessageNo() === 1) req = k;
      if (k % 7 === 0) m.inp.press(0);
      k++;
    }
    ok(h.done && m.mw.isEnd(), `AutoMessageFlow 끝 (${k} 틱)`);
    const gap = req - waitStart;
    ok(gap >= 180 && gap <= 184, `페이지 완료 뒤 3.0 s(≈181 Wait) + 창 처리 틱에 다음 페이지 (${gap})`);
    ok(m.mw.st.padDisabled, 'OpenAutoMessage: 패드 막음(사람 A 무시)');
  }
  {
    const m = make();
    const fr = new FiberRunner();
    const flow = new MessageFlow(() => m.mw, { operator: op, dt: () => DT });
    flow.initialize();
    flow.prepare('mgmet_entFirst_mw_guide02');
    const h = fr.start(flow.flow(-1));
    const k = run(fr, () => {
      m.inp.press(0);
      m.step();
    }, () => h.done);
    ok(h.done && h.result === -1, `MessageFlow(−1): 끝만 기다림, 선택 결과 −1 (${k} 틱)`);
  }
  {
    const m = make();
    m.mw.setMessageLabel('mgmet_entFirst_mw_guide02');
    m.mw.setManualClose(true);
    m.mw.setOwner(0);
    m.mw.disablePadInput(false, false);
    m.mw.start();
    for (let k = 0; k < 300; k++) {
      if (m.mw.isNextInputWait()) m.inp.press(0);
      m.step();
      if (m.mw.st.state === 2) break;
    }
    eq([m.mw.st.state, m.mw.isEnd()], [2, true], 'SetManualClose: 마지막 뒤 상태 2(창 남음), IsEnd');
    m.mw.setMessageLabel('mgmet_entFirst_mw_guide01');
    m.mw.start();
    eq(m.mw.st.state, 1, '상태 2 에서 Start → 바로 1(열기 없음)');
  }
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
