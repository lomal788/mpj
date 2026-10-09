/**
 * 미니게임 모드 공용 UI 상태 시험 — script/app/common/ui 의 순수 부품(메뉴 격자·창 생애·입력·흐름·소리·글자·계약)과
 * 실제 명세(assets/mgmcommon)로 만든 공용 창·항목 제약을 노드에서 돈다(WebGL 없음).
 * 기대값 근거: docs/shell/mgm_common.md 5·6·10절(판독한 규칙의 재구현 시험, 원본 실행 대조 아님).
 *
 *   npx tsx tools/test_mgmcommon.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeMatrix, type Render2D } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import {
  createWork,
  DIALOG_SE,
  DialogBoxState,
  dialogBoxSize,
  DEFAULT_MENU_ANIME,
  FiberRunner,
  insertValue,
  MemorySave,
  MenuGrid,
  MgmInput,
  MgmLayout,
  MgmSound,
  MgmWindow,
  mergeSpec,
  MODE_FLAG,
  operationPlayerId,
  paneGlobal,
  parseMessage,
  plainText,
  playedCount,
  pushResult,
  SceneStack,
  waitTime,
  WindowLife,
  type GridHost,
  type MenuEvent,
  type MenuItem,
  type MgmDrawHost,
  type MgmSceneInstance,
  type MgmSpec,
  type MgmSpecPart,
} from '@app/common/ui';

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

/** 시험용 격자 host: 보임 표·애니 끝 표 */
function fakeHost(hidden: Set<string> = new Set(), ended = true): GridHost & { hidden: Set<string>; ended: boolean } {
  const h = {
    hidden,
    ended,
    isVisible: (_it: MenuItem, r: number, c: number) => !h.hidden.has(`${r},${c}`) && !!_it.pane,
    isEnd: () => h.ended,
  };
  return h;
}
const plays = (ev: MenuEvent[]): string[] => ev.filter((e) => e.type === 'play').map((e) => (e.type === 'play' ? `${e.row},${e.col}:${e.anim}${e.next !== undefined ? `>${e.next}` : ''}` : ''));
function grid(rows: number, cols: number, wrap: boolean, check: boolean, host = fakeHost()): MenuGrid {
  const g = new MenuGrid(host);
  g.setupMenu(rows, cols, wrap, check);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) g.setupItem(r, c, `p${r}_${c}`, 0);
  return g;
}

console.log('1. 메뉴 격자 이동(6.4, 10절 기대값)');
{
  const g = grid(1, 5, true, true);
  g.setItemEnable(0, 2, false);
  g.setCursor(0, 1, true);
  g.drain();
  ok(g.moveCursorX(1), 'moveX(+1) 반환 참');
  eq([g.cursorRow, g.cursorCol], [0, 3], '불가 칸 2 건너뜀 → (0,3)');
  g.moveCursorX(1);
  g.moveCursorX(1);
  eq([g.cursorRow, g.cursorCol], [0, 0], '넘김 → (0,0)');
  g.moveCursorX(-5);
  eq([g.cursorRow, g.cursorCol], [0, 4], '크기 무시·부호만(−5 → 한 칸) + 넘김');

  const g2 = grid(1, 5, false, true);
  g2.setCursor(0, 4, true);
  g2.drain();
  ok(!g2.moveCursorX(1), 'wrap=0 끝: 반환 거짓');
  const ev = g2.drain();
  eq([g2.cursorRow, g2.cursorCol], [0, 4], '커서 그대로');
  eq(ev.filter((e) => e.type === 'edge').length, 1, 'onCursorEdge 1회');

  const h3 = fakeHost(new Set(['1,1']));
  const g3 = grid(3, 3, false, false, h3);
  g3.setCursor(0, 1, true);
  g3.moveCursorY(1);
  eq([g3.cursorRow, g3.cursorCol], [1, 0], '(1,1) 숨김 → 왼쪽 우선 (1,0)');
  const h4 = fakeHost(new Set(['1,1', '1,0']));
  const g4 = grid(3, 3, false, false, h4);
  g4.setCursor(0, 1, true);
  g4.moveCursorY(1);
  eq([g4.cursorRow, g4.cursorCol], [1, 2], '(1,0)도 숨김 → (1,2)');
  const h5 = fakeHost(new Set(['1,0', '1,1', '1,2']));
  const g5 = grid(3, 3, false, false, h5);
  g5.setCursor(0, 1, true);
  g5.moveCursorY(1);
  eq([g5.cursorRow, g5.cursorCol], [2, 1], '빈 행 1 → 다음 행 (2,1)');
  const g6 = grid(1, 3, true, false, fakeHost(new Set(['0,0', '0,1', '0,2'])));
  g6.cursorRow = 0;
  g6.cursorCol = 0;
  ok(!g6.moveCursorX(1) && g6.drain().some((e) => e.type === 'loopGuard'), '선택 가능 칸 없음 + wrap: 무한 반복 대신 한 바퀴 방어 [근사 9.4]');
  const g7 = grid(2, 2, false, false);
  ok(!g7.moveCursorX(1) && !g7.moveCursorY(1), '커서 (−1,−1) 이면 이동 없음');
  ok(!g7.setCursor(-1, -1, false), 'setCursor 같은 자리 → 거짓');
}

console.log('2. 항목 애니 세트(6.1·6.3·6.5·6.6)');
{
  const g = grid(1, 3, false, false);
  g.setCursor(0, 0, true);
  g.drain();
  g.moveCursorX(1);
  eq(plays(g.drain()), ['0,0:off>normal', '0,1:on>cursor'], '기본 세트: 옛 off→normal, 새 on→cursor');
  const MG01 = ['on', null, null, 'off', 'press', 'normal', 'on_ng', null, null, 'off_ng', 'press_ng', 'normal_ng'];
  const gm = grid(1, 3, false, false);
  const k = gm.addAnimeSet(MG01);
  eq(k, 1, 'SetupAddAnimeMenu 번호 1');
  for (let c = 0; c < 3; c++) gm.setupItem(0, c, `p0_${c}`, k);
  gm.setCursor(0, 0, true);
  eq(plays(gm.drain()), ['0,0:on'], 'mgm01 세트 즉시: L = on');
  gm.moveCursorX(1);
  eq(plays(gm.drain()), ['0,0:off>null', '0,1:on'], 'mgm01 세트: 옛 off→next null(무검사), 새 on(전환 없음)');
  gm.decide(0, 1);
  eq(plays(gm.drain()), ['0,1:press>normal'], '결정 press→normal');
  gm.setItemEnable(0, 2, false);
  eq(plays(gm.drain()), ['0,2:off_ng'], 'checkEnable=0 불가: rest(null) ?? leave_ng → off_ng');
  gm.decide(0, 2);
  eq(plays(gm.drain()), ['0,2:press_ng>normal_ng'], '불가 결정 press_ng→normal_ng');

  const gc = grid(1, 3, false, true);
  gc.setCursor(0, 0, true);
  gc.drain();
  gc.setItemEnable(0, 1, false);
  eq(plays(gc.drain()), [], 'checkEnable=1 에서 불가로 바꾸면 애니 안 바뀜(6.5)');
  gc.setItemEnable(0, 1, true);
  eq(plays(gc.drain()), ['0,1:normal'], '다시 가능: rest = normal');
  const gf = grid(1, 3, false, false);
  gf.setItemEnable(0, 2, false);
  gf.drain();
  gf.cursorRow = 0;
  gf.cursorCol = 1;
  gf.setupFinish();
  eq(plays(gf.drain()), ['0,0:normal', '0,1:cursor', '0,2:disable'], 'SetupFinish: 선택 cursor, 나머지 normal, 불가 disable');
  eq(DEFAULT_MENU_ANIME.length, 12, '기본 세트 12칸');

  const hostL = fakeHost(new Set(), true);
  const gl = grid(1, 2, false, false, hostL);
  gl.setCursor(0, 0, true);
  ok(!gl.isCursorItemAnimating(), '페인 항목: 끝났으면 거짓(재생 중이 아님)');
  gl.grid[0][0].layout = {};
  ok(gl.isCursorItemAnimating(), '항목 레이아웃: 끝났으면 참 — 원본 비대칭(6.6)');
  hostL.ended = false;
  ok(!gl.isCursorItemAnimating(), '항목 레이아웃 재생 중 → 거짓');
}

console.log('3. 창 생애(5.1)');
{
  const w = new WindowLife();
  w.init();
  w.drain();
  ok(w.in(false), 'in(false) 참');
  eq(w.drain(), [{ type: 'play', anim: 'in' }, { type: 'visible', visible: true }], 'in 재생·보이기');
  ok(!w.in(false), '보임 && !closing → 무시');
  w.update(false);
  eq(w.drain(), [], 'in 재생 중');
  w.update(true);
  eq(w.drain(), [{ type: 'play', anim: 'normal' }], 'in 끝 → normal');
  ok(w.out(false), 'out(false)');
  eq(w.drain(), [{ type: 'play', anim: 'out' }], 'out 재생');
  ok(!w.out(false), 'closing 중 out 무시');
  ok(w.in(false), 'closing 중 in 은 허용');
  w.drain();
  w.out(false);
  w.drain();
  w.update(true);
  eq(w.drain(), [{ type: 'visible', visible: false }], 'out 끝 → 숨김');
  ok(w.closing, 'closing 은 1 로 남음');
  w.setAnimeWindow(['in_left', 'normal_left', 'out_left']);
  w.in(true);
  eq(w.drain(), [{ type: 'play', anim: 'normal_left' }, { type: 'visible', visible: true }], 'SetAnimeWindow + in(true) = normal_left 즉시');
  ok(w.out(true) && !w.visible, 'out(true) 즉시 숨김');
}

console.log('4. 조작 플레이어·입력(6.10)');
{
  const ps = [
    { pid: 0, type: 1 as const },
    { pid: 2, type: 0 as const },
    { pid: 1, type: 0 as const },
  ];
  eq(operationPlayerId(ps), 1, '사람 묶음 PlayerID 최소');
  eq(operationPlayerId(ps, { remembered: 2 }), 2, '기억된 조작 플레이어');
  eq(operationPlayerId(ps, { remembered: 0 }), 1, '기억된 사람이 사람 묶음에 없으면 최소');
  eq(operationPlayerId([{ pid: 3, type: 1, session: 1 }, { pid: 1, type: 1, session: 2 }]), 3, '사람 없으면 세션 1 묶음');
  eq(operationPlayerId([{ pid: 3, type: 1 }]), -1, '묶음 3 은 includeOther 일 때만');
  eq(operationPlayerId([{ pid: 1, type: 0, local: false }, { pid: 2, type: 0 }]), 2, '오프라인: 로컬만');
  let hold = 0;
  let prev = 0;
  const inp = new MgmInput({ poll: (pid) => (pid === 1 ? { hold, trig: hold & ~prev } : { hold: 0, trig: 0 }) }, () => ps);
  hold = 0x200 | 0x1;
  inp.update();
  prev = hold;
  eq([inp.operator, inp.trig(), inp.rep()], [1, 0x201, 0x201], '누름 프레임: trig = rep');
  const reps: number[] = [];
  for (let f = 0; f < 40; f++) {
    inp.update();
    reps.push(inp.rep());
  }
  const at = reps.map((r, i) => (r & 0x200 ? i + 2 : 0)).filter((x) => x);
  eq(at.slice(0, 3), [25, 31, 37], '반복 = 누른 지 25·31·37 프레임째(24f 뒤 6f 마다, RepeatGen [근사])');
  ok(reps.every((r) => !(r & 0x1)), 'A 는 반복 안 함');
  ok(inp.isCom(0) && !inp.isCom(1), 'isCom');
}

console.log('5. 흐름(fiber) — waitTime 3.0 s f32');
{
  const fr = new FiberRunner();
  const dt = Math.fround(1 / 60);
  let frames = 0;
  const h = fr.start(
    (function* () {
      yield* waitTime(3.0, () => dt);
      return 7;
    })(),
  );
  while (!h.done && frames < 400) {
    fr.step();
    frames++;
  }
  ok(frames === 181 || frames === 182, `3.0 s 대기 = 180~181 Wait + 끝 step (${frames})`);
  eq(h.result, 7, '흐름 반환값');
  let t = 0;
  let n = 0;
  do {
    n++;
    t = Math.fround(t + dt);
  } while (t < 3);
  console.log(`   f32 누적 1/60 이 3.0 이상이 되는 Wait 수 = ${n}`);
}

console.log('6. 소리(6.9·7.3)');
{
  const out: string[] = [];
  const s = new MgmSound({ SQ_SE_SYS_DECI: { file: 'sound/d.wav', gain: 1 } }, (p) => p, {
    play: (l) => out.push(`se ${l}`),
    bgm: (l, u) => out.push(`bgm ${l} ${u}`),
    bgmStop: (f) => out.push(`stop ${f}`),
    stopGroups: (g, f) => out.push(`groups ${g.join(',')} ${f}`),
  });
  ok(!s.playBgm(33) && !s.playBgm(41) && !s.playBgm(-1), 'kind 33·41 이상 무효');
  ok(s.playBgm(4) && s.currentBgm === 'SM_BGM_MGM01_FREEPLAY', 'kind 4 = SM_BGM_MGM01_FREEPLAY');
  s.playBgm(5);
  eq(out.slice(-2), ['stop 0', 'bgm SM_JIN_MGM01_FREEPLAY_ENDSTINGER null'], '새 BGM(징글 포함) = 이전 즉시 끊기');
  s.stopBgm(6);
  eq(out[out.length - 1], 'stop 0.5', 'StopBgm 프리셋 6 = 0.5 s');
  ok(!s.isPlayBgm(), 'IsPlayBgm 거짓');
  s.playSe('SQ_SE_SYS_DECI');
  eq(out[out.length - 1], 'se SQ_SE_SYS_DECI', 'SE 재생');
  s.playSe('SQ_SE_SYS_MES_PUT');
  eq(s.log[s.log.length - 1], { type: 'se', label: 'SQ_VOI_SYS_MES_PUT' }, '모드 프리셋 치환 MES_PUT → SQ_VOI');
  s.playBgm(1);
  s.fadeAndEntryCancel();
  ok(out.includes('groups 34,1,37,41 0.5'), 'FadeAndEntryCancel 그룹 0x22·1·0x25·0x29, 0.5 s');
  s.playSe('SQ_SE_SYS_DECI');
  ok(!s.playBgm(2) && s.log[s.log.length - 1].type === 'blocked', '막힌 뒤 BGM·SE 재생 안 됨');
  s.releaseEntryCancel();
  ok(s.playBgm(2), '해제 뒤 재생 [설계]');
}

console.log('7. 글자(6.8, 05_ui_input 5.2)');
const spec = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/spec.json'), 'utf8')) as MgmSpec;
const texts = spec.texts;
{
  const rt = parseMessage(texts.mgmet_entFirst_mw_guide00, texts, { Text0: 'im_mode03_name' });
  const s = rt.units.map((u) => u.ch).join('');
  eq(s, '미니게임 항구에 잘 오셨습니다!', 'Text0 = im_mode03_name 삽입');
  eq(rt.units[0].color, [0xfa, 0x1e, 0x04, 0xff], '삽입어 색 #fa1e04');
  eq(rt.units[7].color, [255, 255, 255, 255], '[0:3:ffffffff] 뒤 흰색');
  eq(insertValue('im_mode03_name', texts), '미니게임 항구', '값이 라벨이면 문구');
  eq(insertValue('x'.repeat(80), texts).length, 64, '라벨 아니면 문자열 64자');
  eq(insertValue(12, texts), '12', '숫자');
  eq(plainText('[1:1:00cd][2:4:01cd] 혼자', texts, { Text0: '서바이벌' }), '서바이벌은 혼자', '조사 ha: 받침 있음 → 은');
  eq(plainText('[1:1:00cd][2:4:03cd]', texts, { Text0: '키노피오' }), '키노피오가', '조사 ga: 받침 없음 → 가');
  eq(plainText('[1:0:00cd]승', texts, { Number0: 3 }), '3승', 'Number0');
  const ws = parseMessage('ab[3:0:00000041]cd', texts);
  eq([...ws.waitScale.entries()], [[2, 8]], 'Wait_Scale f32 8.0 이 글자 2 위치');
  eq(parseMessage(texts.mgmet_fp_mw_howToPlay00, texts).units.filter((u) => u.ch === '\n').length, 1, '\\r\\n = 두 줄');
}

console.log('8. 계약: 장면 전환·저장소');
{
  const made: string[] = [];
  const disposed: string[] = [];
  let last: unknown;
  const st = new SceneStack(
    async (name, _ctx, args, returned): Promise<MgmSceneInstance> => {
      made.push(`${name}:${JSON.stringify(args ?? null)}:${JSON.stringify(returned ?? null)}`);
      return { step() {}, render() {}, dispose: () => disposed.push(name) };
    },
    new MemorySave(),
    createWork(),
    (r) => (last = r),
  );
  await st.start('mgmet');
  st.ctx.work.entranceStartPoint = 1;
  st.call('mgm01', { from: 'mgmet' });
  eq(st.current, 'mgmet', '요청은 다음 step 경계에서');
  st.step();
  await new Promise((r) => setTimeout(r, 0));
  eq([st.current, st.depth], ['mgm01', 2], 'call → 자식');
  st.ctx.work.entranceStartPoint = 7;
  st.ret({ ok: true });
  st.step();
  await new Promise((r) => setTimeout(r, 0));
  eq([st.current, st.depth], ['mgmet', 1], 'ret → 부모 새로 만듦 [설계]');
  eq(made, ['mgmet:null:null', 'mgm01:{"from":"mgmet"}:null', 'mgmet:null:{"ok":true}'], '공장 호출(복귀값 전달)');
  eq(disposed, ['mgmet', 'mgm01'], '부모는 call 때, 자식은 ret 때 버림');
  eq(st.ctx.work.entranceStartPoint, 7, 'Work 는 장면을 넘어 유지(시작 지점 7)');
  st.ret('end');
  st.step();
  eq(last, 'end', '마지막 ret → onEmpty');

  const sv = new MemorySave();
  sv.modeFlags |= MODE_FLAG.FIRST_HOWTO_MGM01;
  sv.setMinigame(5, { head: 3, flags: 0x5 });
  const sv2 = MemorySave.fromJSON(sv.toJSON());
  eq([sv2.modeFlags, sv2.minigame(5), sv2.minigame(6)], [8, { head: 3, flags: 5 }, { head: 0, flags: 0 }], 'MemorySave JSON 왕복');
  eq(playedCount(sv2, [4, 5, 6]), 1, 'playedCount = 선두 u16 ≠ 0');
  const wk = createWork();
  for (let i = 0; i < 105; i++) pushResult(wk, { id: i, judge: 0, results: [0, 0, 0, 0] });
  eq([wk.results.length, wk.results[0].id], [100, 5], '결과 고리 100칸');
  sv.requestSave();
  eq(sv.saveRequests, 1, 'SaveRequest 횟수');
}

console.log('9. 실제 명세: 명세 합치기·공용 창·항목 제약(6.7)');
{
  const part = JSON.parse(readFileSync(join(WEB, 'assets/mgmcommon/mgm01.json'), 'utf8')) as MgmSpecPart;
  const merged = mergeSpec(spec, part);
  ok(!!merged.layouts.mgm01_base_freeplay_00 && !!merged.layouts.mgm00_cursor_00 && !!merged.fonts.bqfont_small, '합친 명세 = mgm01 + mgm00 + 공용 글꼴');
  const all = merged as unknown as Spec;
  const host: MgmDrawHost = {
    all,
    spec: merged,
    r2d: null as unknown as Render2D,
    layout: (n) => new LayoutInst(n, merged.layouts[n], all),
    draw: () => {},
  };
  const w = new MgmWindow(host, 'mgm01_base_freeplay_00');
  ok(!w.isVisible() && !w.inst.visible, '생성 직후 숨김');
  w.in(false);
  eq(w.inst.current, 'in', 'in 재생');
  const inLen = merged.layouts.mgm01_base_freeplay_00.anims.in.len;
  let f = 0;
  while (w.inst.current === 'in' && f < 100) {
    w.update();
    f++;
  }
  eq([w.inst.current, f], ['normal', inLen + 1], `in(${inLen}f) 끝 다음 틱에 normal`);
  const N = 15;
  w.setupMenu(1, N, { wrap: true, checkEnable: false });
  const k = w.addAnimeSet(['on', null, null, 'off', 'press', 'normal', 'on_ng', null, null, 'off_ng', 'press_ng', 'normal_ng']);
  const items: MgmLayout[] = [];
  for (let c = 0; c < N; c++) {
    w.setupItem(0, c, `x_thum_02_${String(c).padStart(2, '0')}`, k);
    const it = new MgmLayout(host.layout('mgm01_thum_00'));
    items.push(it);
    w.hookItem(0, c, it);
  }
  ok(items.every((it) => it.constraint !== null), 'hookItem = SetConstraint');
  w.setupFinish();
  w.setCursor(0, 0, false);
  eq(items[0].inst.current, 'on', '커서 항목 레이아웃 on');
  w.moveX(1);
  eq([items[0].inst.current, items[1].inst.current], ['off', 'on'], '이동: 옛 off, 새 on');
  w.moveX(-1);
  w.moveX(-1);
  eq(w.cursor, { row: 0, col: N - 1 }, '넘김(왼쪽 끝 → 마지막)');
  w.decide();
  eq(items[N - 1].inst.current, 'press', '결정 press');
  ok(w.isCursorItemAnimating() === items[N - 1].isEnd(), 'isCursorItemAnimating = 항목 IsEndAnimation(6.6)');
  const pane = 'x_thum_02_03';
  const g = paneGlobal(w.inst, pane)!;
  const m = nodeMatrix(w.inst, pane)!;
  ok(near(g.m[2], m[2]) && near(g.m[5], m[5]), 'paneGlobal 행렬 = nodeMatrix');
  const pl = items[3].placement()!;
  ok(near(pl.m[2], m[2]) && near(pl.m[5], m[5]) && near(pl.alpha, g.alpha), '항목 루트 = 페인 전역 행렬, 알파 = 페인 전역 알파');
  w.out(false);
  let outF = 0;
  const pls: number[] = [];
  while (w.isVisible() && outF < 100) {
    w.update();
    const p = items[3].placement();
    if (p) pls.push(p.alpha);
    outF++;
  }
  ok(!w.isVisible() && items[3].placement() === null, 'out 끝 → 창 숨김 → 항목 안 그림');
  console.log(`   out ${outF} 틱, 항목 알파 ${pls.slice(0, 3).map((a) => a.toFixed(0)).join('→')}…`);
  w.setText('x_text_00', 'mgm01_ui_mgNameBig', { Text0: 'im_mg0101_name' });
  eq(w.textOf('x_text_00'), plainText(texts.mgm01_ui_mgNameBig, texts, { Text0: texts.im_mg0101_name }), 'setText + Text0 삽입');
  w.insert('x_text_00', 'Text0', 'im_mg0102_name');
  ok(w.textOf('x_text_00').includes(texts.im_mg0102_name), 'insert 로 Text0 바꿈');
}

// ── 대화상자 bq::ComUiDialogBox (dialog_box.md 4~6) ──
{
  console.log('대화상자(ComUiDialogBox)');
  const s1 = dialogBoxSize(2, 60, 500, 40, 130);
  eq([s1.btnW, s1.winW, s1.winH], [360, 1234, 426], '짧은 글자: 버튼 360·창 1234·높이 426');
  const s2 = dialogBoxSize(3, 400, 1000, 700, 130);
  eq([s2.btnW, s2.winW, s2.winH], [520, 3 * 520 + 200, 954], '긴 선택지: 버튼 520·창 3w+200·높이 954');
  eq(dialogBoxSize(1, 400, 2000, 40, 130).winW, 1794, '긴 본문: 창 폭 상한 1794');
  eq(dialogBoxSize(0, 0, 100, 40, 130).winW, 1234, '선택지 없음: 창 = clamp(글자+200)');
  const d = new DialogBoxState();
  d.setChoiceCount(3);
  d.initial = 1;
  d.cancelEnable = true;
  d.disabled[0] = true;
  d.deciSe[2] = 'SQ_SE_SYS_DECI_L';
  const ev0 = d.open(false);
  eq([d.st, d.cursor, d.result], [1, 1, -1], 'In: 상태 1·커서 = 기본·결과 −1');
  eq(ev0.filter((e) => e.t === 'anim').map((e) => (e.t === 'anim' ? e.tag : '')), ['disable', 'cursor', 'normal'], '칸 disable/cursor/normal');
  eq(d.input(0x1).close, false, 'in 중 입력 없음');
  d.inDone();
  eq(d.st, 2, 'in 끝 → 2');
  let r = d.input(0x10100);
  eq([d.cursor, r.close], [1, false], '왼쪽: 불가 칸 0 건너뜀 → 그대로(넘김 없음)');
  r = d.input(0x40200);
  eq(d.cursor, 2, '오른쪽 → 2');
  ok(r.ev.some((e) => e.t === 'se2d' && e.label === DIALOG_SE.CURSOR) && r.ev.some((e) => e.t === 'vib' && e.label === 'bv_vib_sys_cursor'), '이동 SE2D·진동');
  eq(r.ev.filter((e) => e.t === 'anim').map((e) => (e.t === 'anim' ? `${e.tag}>${e.next}` : '')), ['off>normal', 'on>cursor'], '불가 아닌 칸만 on/off → cursor/normal');
  d.input(0x40200);
  eq(d.cursor, 2, '오른쪽 끝 정지');
  r = d.input(0x1 | 0x2);
  eq([r.close, d.result], [true, 2], '결정이 B 보다 먼저');
  ok(r.ev.some((e) => e.t === 'se' && e.label === 'SQ_SE_SYS_DECI_L') && r.ev.some((e) => e.t === 'vib' && e.label === 'bv_vib_sys_deci'), '칸 결정 SE·기본 진동');
  d.out(false);
  eq(d.st, 3, 'Out → 3');
  d.outDone();
  eq([d.st, d.count, d.result], [0, 0, 2], 'out 끝 → 초기화(결과는 남음)');
  d.setChoiceCount(2);
  d.cancelEnable = true;
  d.open(true);
  r = d.input(0x2);
  eq([r.close, d.result, r.ev[0]], [true, -1, { t: 'se', label: DIALOG_SE.CANCEL }], 'B 취소 → −1·CANCEL');
  d.out(true);
  d.open(true);
  r = d.input(0x2);
  eq(r.close, false, '선택지 없음: B 무시');
  r = d.input(0x1);
  eq([r.close, d.result, r.ev[0]], [true, -1, { t: 'se', label: DIALOG_SE.MES_PROC }], '선택지 없음: A → MES_PROC·결과 −1');
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
