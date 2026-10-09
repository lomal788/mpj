/**
 * 미니게임 항구 화면 상태 시험 — script/app/scene/world/mgmet(액티비티 선택·첫 설명·규칙 설정)과 mgmcommon/alignment 를 실제 명세(assets/mgmcommon + assets/mgmet/extra.json)로
 * 노드에서 돈다(WebGL 없음). 기대값 근거: docs/shell/mgmet_flow.md 4~8, mgmet_ruleconfig.md 4~8, ui2d_alignment.md 6.4(판독한 규칙의 재구현 시험, 원본 실행 대조 아님).
 *
 *   npx tsx tools/test_mgmet.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeMatrix, rectOf, type Render2D } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { resolveFontsFromDisk } from './fontSpecNode';
import { existsSync } from 'node:fs';
import { fmabRepeatBad, glbRepeatBad } from './anim_repeat';
import {
  computeAlignment,
  createWork,
  MemorySave,
  mergeSpec,
  MessageFlow,
  MessageWindow,
  MgmetGuides,
  MgmInput,
  MgmSound,
  MODE_FLAG,
  waitFrames,
  type Flow,
  type MgmDrawHost,
  type MgmPlayer,
  type MgmSpec,
  type MgmSpecPart,
} from '../script/shell/mgmcommon';
import {
  ACTIVITIES,
  adjustStartPoint,
  applyMgmetExtra,
  COL_TITLE,
  commitFreePlay,
  CPU_LEVELS,
  emptyConfig,
  EXPLAIN_LABELS,
  freePlayConfig,
  GREETING_FIRST,
  HOWTO_KINDS,
  idFromStartPoint,
  inputVec,
  MgmetHub,
  MODE_ID_FROM_NUMBER,
  RuleConfigState,
  RuleConfigView,
  type MgmetExtra,
  type MgmetHowto,
  type MgmetResult,
} from '@app/scene/world/mgmet';

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

const read = <T>(p: string): T => JSON.parse(readFileSync(join(WEB, p), 'utf8')) as T;
const extra = read<MgmetExtra>('assets/mgmet/extra.json');
const spec = mergeSpec(mergeSpec(read<MgmSpec>('assets/mgmcommon/spec.json'), read<MgmSpecPart>('assets/mgmcommon/mgmet.json')), extra);
await resolveFontsFromDisk(spec.fonts as Record<string, unknown>, join(WEB, 'assets/mgmcommon'));
applyMgmetExtra(spec, extra);
const all = spec as unknown as Spec;
const host: MgmDrawHost = { all, spec, r2d: null as unknown as Render2D, layout: (n) => new LayoutInst(n, spec.layouts[n], all), draw: () => {} };

console.log('1. 표·입력 방향 (mgmet_flow.md 4.2, mgmet_ruleconfig.md 6.1)');
{
  for (const a of ACTIVITIES) {
    ok(MODE_ID_FROM_NUMBER[a.nextMode - 1] === a.id, `IDFromNumber(NumberFromID(${a.id}) − 1) = ${a.id}`);
    ok(idFromStartPoint(a.startPoint) === a.id, `시작 지점 ${a.startPoint} → ID ${a.id}`);
  }
  eq([0, 1, 7, 8, 13].map(idFromStartPoint), [2, 2, 2, 2, 2], '시작 지점 2~6 밖 → 2');
  eq([adjustStartPoint(7, true, true), adjustStartPoint(12, true, true), adjustStartPoint(12, true, false), adjustStartPoint(6, false, false), adjustStartPoint(7, false, true)], [1, 6, 1, 1, 7], 'GetAndResetStartMode 보정');
  eq([inputVec(0x800, 0), inputVec(0, 0x400), inputVec(0x100 | 0x800, 0), inputVec(0x20000, 0), inputVec(0, 0x20000), inputVec(0x40000, 0x100)], [1, 2, 1, 1, 0, 3], 'GetInputVec 우선순위(스틱은 누름만)');
  const labels = [
    ...ACTIVITIES.flatMap((a) => [a.title, a.guide]),
    ...GREETING_FIRST,
    'mgmet_entAgain_mw_guide00',
    'mgmet_ui_activity_name',
    ...CPU_LEVELS,
    ...EXPLAIN_LABELS,
    ...COL_TITLE.flatMap((t) => (t ? [t[1]] : [])),
    'mgmet_rule_ui_cpulevel00',
    'mgmet_rule_ui_round00',
    'mgmet_rule_ui_fp00',
    'mgmet_rule_ui_fp01',
    'mgmet_rule_ui_fp02',
    'im_guest00_name',
    ...HOWTO_KINDS.flatMap((k) => Array.from({ length: k.pages }, (_, p) => `${k.message}${String(p).padStart(2, '0')}`)),
  ];
  for (const l of labels) ok(l in spec.texts, `라벨 ${l}`);
  for (const a of ACTIVITIES) ok(!!spec.msgAttr[a.guide], `앞 안내 메시지 속성 ${a.guide}`);
  for (const k of HOWTO_KINDS) for (let p = 0; p < k.pages; p++) ok(`${k.pict}_${String(p).padStart(2, '0')}^o` in spec.textures, `설명 그림 ${k.pict}_${p}`);
  for (const l of ['SQ_SE_SYS_DECI_L', 'SQ_SE_SYS_CURSOR_S']) ok(!!spec.sounds[l], `소리 ${l}`);
  const TAG = /\[\d+:\d+:[0-9a-f]*\]/g;
  for (const a of ACTIVITIES) {
    const miss = [...(spec.texts[a.guide] ?? '').replace(TAG, '')].filter((c) => c !== '\r' && c !== '\n' && !spec.fonts.bqfont_middle.glyphs[c]);
    ok(miss.length === 0, `${a.guide} 글리프(중간 글꼴) 빠짐 ${miss.join('')}`);
  }
}

console.log('2. Alignment 계산 (ui2d_alignment.md 6.2·6.4)');
{
  const P = { horizontal: true, kind: 2, gap: -75, stretch: false };
  const col = (w: number, v = true) => ({ visible: v, extent: w, bias: 0, pos: 0 });
  const widths = [470, 446, 446, 446, 446, 366];
  eq(computeAlignment(P, 1504, widths.map((w) => col(w))).pos, [-1258, -875, -504, -133, 238, 569], '여섯 열 = 저장 x');
  const withCpu = computeAlignment(P, 1504, widths.map((w, i) => col(w, i === 3 || i === 4)));
  eq([withCpu.pos[3], withCpu.pos[4]], [158, 529], 'CPU·설명 로컬 x');
  const noCpu = computeAlignment(P, 1504, widths.map((w, i) => col(w, i === 4)));
  eq(noCpu.pos[4], 529, 'CPU 숨김: 설명 그대로');
  ok(noCpu.pos[3] === 0 && !noCpu.written[3], 'CPU 숨김: 위치 쓰지 않음');
  const left = computeAlignment({ ...P, kind: 0 }, 100, [col(20), col(999, false), col(30)]);
  eq(left.pos, [-40, 0, -90], 'kind0: 숨김 폭 999 제외, 둘째 gap −75');
  const center = computeAlignment({ ...P, kind: 1, gap: 10 }, 100, [col(20), col(30)]);
  eq(center.pos, [-20, 15], 'kind1: 총길이 절반 보정');
  const vert = computeAlignment({ horizontal: false, kind: 0, gap: 5, stretch: false }, 100, [col(20), { visible: true, extent: 30, bias: 3, gap: 5, pos: 0 }]);
  eq(vert.pos, [40, 50 - 20 - 5 - 15 - 3], '세로 top: own gap·bias');
  const st = computeAlignment({ horizontal: true, kind: 0, gap: 0, stretch: true }, 100, [col(20), { ...col(10), size: 10 }]);
  ok(st.size[1] === 80 && near(st.pos[1], -30 + 40), 'stretch kind0: 끝 자식 크기 = 남은 길이, 위치 +remaining/2');
}

console.log('3. 규칙 상태 (mgmet_ruleconfig.md 5·6)');
{
  const work = createWork();
  const cfg = freePlayConfig(work, 3);
  eq([cfg.displayCpu, cfg.displayExplain, cfg.indexExperience, cfg.indexCpu], [1, 1, 0, 0], '프리 플레이 config(캐시 없음 → index 0)');
  const s = new RuleConfigState();
  s.setupMgm(cfg);
  const ev0 = s.drain();
  eq([s.first, s.current], [3, 3], 'CPU 있음: 첫 열 3');
  eq(s.visible, [false, false, false, true, true, false, true], '표시 열 = CPU·설명·플레이');
  ok(!ev0.some((e) => e.t === 'se'), 'SetupMgm 즉시 PlayMove: 소리 없음');
  ok(ev0.some((e) => e.t === 'anim' && e.col === 3 && e.anim === 'on' && e.imm) && ev0.some((e) => e.t === 'anim' && e.col === 4 && e.anim === 'off'), 'on/off 즉시');
  eq(s.update(0x800, 0x800), 0, '위 = 0');
  eq(s.index[3], 1, 'CPU index +1');
  ok(s.drain().some((e) => e.t === 'se' && e.label === 'SQ_SE_SYS_CURSOR_S'), '값 변경 CURSOR_S');
  for (let i = 0; i < 5; i++) s.update(0, 0x800);
  eq(s.index[3], 3, '반복으로 끝(3)까지');
  s.drain();
  s.update(0x800, 0x800);
  ok(s.index[3] === 3 && !s.drain().some((e) => e.t === 'se'), '끝에서 무음 정지');
  eq(s.update(0x100, 0x100), 0, '첫 열에서 왼쪽 = 0');
  eq(s.current, 3, '왼쪽 경계');
  s.update(0x200, 0x200);
  eq(s.current, 4, '오른쪽 → 설명');
  ok(s.drain().some((e) => e.t === 'se' && e.label === 'SQ_SE_SYS_CURSOR'), '열 이동 CURSOR');
  s.update(0x1, 0);
  eq(s.current, 6, 'A → 숨긴 열 건너 플레이');
  ok(s.drain().some((e) => e.t === 'se' && e.label === 'SQ_SE_SYS_DECI'), 'A 다음 열 DECI');
  eq(s.update(0x200, 0), 0, '플레이에서 오른쪽 = 0');
  eq(s.update(0x2, 0), 0, 'B → 이전 열');
  eq(s.current, 4, 'B 로 설명');
  ok(s.drain().some((e) => e.t === 'se' && e.label === 'SQ_SE_SYS_CANCEL'), 'B 이전 열 CANCEL');
  eq(s.update(0x8, 0), 2, '0x8 = 설명 다시 보기(2)');
  eq(s.update(0x4, 0), 4, '0x4 = 4');
  eq(s.update(0x1 | 0x800, 0x800), 0, '방향과 A 동시: 방향 우선');
  eq(s.index[4], 1, '설명 index 1(없음)');
  s.update(0x2, 0);
  eq(s.update(0x2, 0), 3, '첫 열 B = 취소(3)');
  s.update(0x200, 0);
  s.update(0x200, 0);
  eq(s.update(0x1, 0), 1, '플레이 A = 시작(1)');
  ok(s.drain().some((e) => e.t === 'anim' && e.col === 6 && e.anim === 'press'), '플레이 press');
  const r = s.getResult();
  eq([r.indexCpu, r.indexExplain, r.displayCpu, r.displayExplain], [3, 1, 0, 0], 'GetResult = 버튼 index, 표시 0');

  const s2 = new RuleConfigState();
  s2.setupMgm(freePlayConfig(work, 0));
  eq([s2.first, s2.visible[3]], [4, false], 'CPU 없음: 첫 열 4, CPU 숨김');
  const s3 = new RuleConfigState();
  s3.setupMgm({ ...emptyConfig(), displayRound: 1, displayStar: 1, displayExplain: 2 });
  eq([s3.first, s3.viewOnly[4]], [2, true], 'Round+Star: 마지막 Star 처리로 첫 열 2, 설명 잠금');

  const w2 = createWork();
  const c1 = commitFreePlay({ ...emptyConfig(), indexCpu: 2, indexExplain: 0 }, w2);
  ok(w2.rule.valid && w2.rule.cpu === 2 && w2.rule.explain === 0 && w2.flags.has(4) && c1.flag4, 'commit: 캐시·flag4');
  commitFreePlay({ ...emptyConfig(), indexCpu: 1, indexExplain: 1 }, w2);
  ok(!w2.flags.has(4), '설명 없음 → flag4 끔');
  const cfg2 = freePlayConfig(w2, 1);
  eq([cfg2.indexCpu, cfg2.indexExplain], [1, 1], 'LoadWorkData: valid 캐시 복사');
}

console.log('4. 규칙 화면(실제 명세): 열 배치·배경·글자 (ui2d_alignment.md 6.4, mgmet_ruleconfig.md 6.3·7.2)');
{
  const rv = new RuleConfigView(host);
  rv.setupMgm(freePlayConfig(createWork(), 3));
  rv.update(0, 0);
  const x = (p: string): number => {
    const f = rv.win.inst.find(p);
    return f ? f[0].nodes[f[1]].t[0] : NaN;
  };
  eq([x('x_rule_03'), x('x_rule_04'), x('x_play_00')], [158, 529, 910], 'CPU 있음: 열 x(Alignment 로컬)');
  eq(x('null_01'), 158 - 22 - (390 - 310) / 2, 'SetupBaseBg: CPU 폭 보정');
  eq(rv.win.textOf('x_rule_03/x_text_cpu_01'), spec.texts.im_comLevel00, 'CPU 값 글자');
  eq(rv.win.textOf('x_rule_04/x_text_explain_01'), spec.texts.mgmet_rule_ui_explain00, '설명 값 글자');
  eq(rv.win.textOf('x_play_00/x_text_00'), spec.texts.mgmet_rule_ui_play, '플레이 글자');
  const vis = (p: string): boolean => {
    const f = rv.win.inst.find(p);
    return !!f && f[0].nodes[f[1]].v;
  };
  ok(vis('x_rule_03/x_bd_01') && !vis('x_rule_03/x_bd_00') && vis('x_rule_03/x_rule_cpu') && !vis('x_rule_03/x_rule_round'), 'SetVisibleOption01: CPU 는 x_bd_01·x_rule_cpu');
  ok(vis('x_rule_03/x_cursor_00/right') === false && vis('x_rule_03/x_cursor_00/left') === true, 'index 0: right 숨김·left 보임');
  rv.update(0x800, 0x800);
  const f = rv.win.inst.find('x_rule_03/x_icon_cpu')!;
  ok(near(f[0].mats[f[0].nodes[f[1]].spec.m!].srt[0].t[1], 0.25), 'CPU 아이콘 텍스처 이동 (0, index × 0.25)');
  const rv2 = new RuleConfigView(host);
  rv2.setupMgm(freePlayConfig(createWork(), 0));
  rv2.update(0, 0);
  const x2 = (p: string): number => {
    const g = rv2.win.inst.find(p)!;
    return g[0].nodes[g[1]].t[0];
  };
  eq([x2('x_rule_04'), x2('null_01')], [529, 529 - 22], 'CPU 없음: 설명 그대로·배경 = 설명 기준');
  const span = (inst: LayoutInst, p: string): number[] => {
    const m = nodeMatrix(inst, p)!;
    const f = inst.find(p)!;
    const n = f[0].nodes[f[1]];
    const [l, , r] = rectOf(n.spec.o, n.z[0], n.z[1]);
    return [m[0] * l + m[2], m[0] * r + m[2]].map((v) => Math.round(v * 1000) / 1000);
  };
  eq(span(rv.win.inst, 'x_play_00/base'), [688, 1120], '플레이 버튼 판 = 원본 규칙 계산 688..1120(오른쪽 160 px 화면 밖은 원본 데이터, ui2d_alignment.md 12.2)');
  ok(span(rv.win.inst, 'x_play_00/cursor')[1] <= 960 && span(rv.win.inst, 'x_play_00/x_text_00')[1] <= 960, '플레이 아이콘·글자 칸 오른쪽 끝 ≤ 960');
  eq([span(rv.win.inst, 'x_rule_03/x_bd_01'), span(rv.win.inst, 'x_rule_04/x_bd_00')], [[-59, 331], [352, 662]], 'CPU·설명 카드 화면 x(12.2)');
  eq(span(rv2.win.inst, 'x_rule_04/x_bd_00'), [352, 662], 'CPU 없음: 설명 카드 그대로');
}

console.log('5. 허브 흐름 (mgmet_flow.md 5·6)');
class Pads {
  private next = 0;
  private cur = 0;
  press(b: number): void {
    this.next |= b;
  }
  poll(pid: number): { hold: number; trig: number } {
    if (pid !== 0) return { hold: 0, trig: 0 };
    this.cur = this.next;
    this.next = 0;
    return { hold: this.cur, trig: this.cur };
  }
}
class StubHowto implements MgmetHowto {
  calls: string[] = [];
  frames = 0;
  setup(kind: number, first: boolean): void {
    this.calls.push(`setup ${kind} ${first}`);
  }
  *update(): Flow<number> {
    this.calls.push('update');
    yield* waitFrames(5);
    return 1;
  }
  destroy(): void {
    this.calls.push('destroy');
  }
  tick(): void {
    this.frames++;
  }
  draw(): void {}
}
function makeHub(o: { com: boolean[]; sp?: number; modeFlags?: number; boss?: boolean; entry?: 'hub' | 'rule' }) {
  const pads = new Pads();
  const players: MgmPlayer[] = o.com.map((c, pid) => ({ pid, type: c ? 1 : 0 }));
  const input = new MgmInput(pads, () => players);
  const sound = new MgmSound(spec.sounds, (p) => p);
  const msg = new MessageWindow(host, input, sound);
  const flow = new MessageFlow(() => msg, { operator: () => input.operator, dt: () => Math.fround(1 / 60) });
  flow.initialize();
  const guides = new MgmetGuides(host, sound, () => input.operator);
  const save = new MemorySave();
  save.modeFlags = o.modeFlags ?? 0;
  const work = createWork();
  work.entranceStartPoint = o.sp ?? 0;
  const howto = new StubHowto();
  const calls: string[] = [];
  let done: MgmetResult | null = null;
  const hub = new MgmetHub({
    host,
    input,
    sound,
    msg,
    flow,
    guides,
    save,
    work,
    players: () => players,
    howto,
    bossOpen: o.boss ?? true,
    entry: o.entry,
    router: { call: (n) => calls.push(`call ${n}`), ret: () => calls.push('ret'), current: 'mgmet', depth: 1 },
    onDone: (r) => (done = r),
  });
  const until = (pred: () => boolean, max = 2000): boolean => {
    for (let i = 0; i < max; i++) {
      if (pred()) return true;
      hub.step();
    }
    return pred();
  };
  const tap = (b: number): void => {
    pads.press(b);
    hub.step();
  };
  return { hub, pads, sound, msg, save, work, howto, calls, until, tap, done: () => done };
}
{
  const h = makeHub({ com: [false, true, true, true], sp: 0 });
  ok(h.until(() => h.hub.seq === 4 && h.msg.isNextInputWait()), '시작 지점 0 → 인사 메시지');
  ok(!!(h.save.modeFlags & MODE_FLAG.OP_SKIP) && h.save.saveRequests === 1 && !h.hub.opSkip, '첫 방문: 이번엔 opSkip 0, 세이브 bit0 기록');
  eq(h.sound.log.filter((e) => e.type === 'bgm').map((e) => (e as { label: string }).label), ['SM_JIN_MGMET_OPENING', 'SM_BGM_MGMET_ENTRANCE_JMP'], 'BGM 0 → 1');
  for (let p = 0; p < 3; p++) {
    h.until(() => h.msg.isNextInputWait());
    h.until(() => false, 15);
    h.tap(0x1);
  }
  ok(h.until(() => h.hub.seq === 7 && h.hub.guideId === h.hub.selected), '인사 끝 → 상태 7, 앞 안내 표시');
  eq(h.hub.selected, 2, '처음 ID 2');
  eq(h.hub.title.titleText(), spec.texts.im_mode10_name, '제목 = 프리 플레이');
  h.tap(0x100);
  eq([h.hub.selected, h.hub.seq], [3, 6], '왼쪽 → ID 3, 상태 6');
  ok(h.sound.log.some((e) => e.type === 'se' && e.label === 'SQ_SE_SYS_CURSOR'), '화살표 SE');
  ok(h.until(() => h.hub.seq === 7 && h.hub.guideId === h.hub.selected), '카메라 즉시 → 상태 7, 서바이벌 안내');
  eq(h.hub.title.titleText(), spec.texts.im_mode14_name, '제목 = 서바이벌');
  h.tap(0x200);
  h.until(() => h.hub.seq === 7 && h.hub.guideId === h.hub.selected);
  h.tap(0x1);
  eq(h.hub.seq, 8, 'A → 상태 8');
  ok(h.until(() => h.howto.calls.length >= 3), '첫 설명(flag 8 없음) 호출');
  eq(h.howto.calls.slice(0, 3), ['setup 1 true', 'update', 'destroy'], 'FirstHowToPlayFlow Setup(1, true)');
  ok(!!(h.save.modeFlags & MODE_FLAG.FIRST_HOWTO_MGM01), '첫 설명 저장 flag 8');
  ok(h.until(() => h.hub.phase === '규칙 설정'), '규칙 설정');
  eq([h.hub.rule.state.first, h.hub.rule.state.current], [3, 3], 'CPU 있음 → 열 3');
  h.tap(0x800);
  h.tap(0x8);
  ok(h.until(() => h.hub.phase === '규칙 설정' && h.howto.calls.length >= 6), 'Y(0x8) → 설명 다시 보기 → 규칙');
  eq(h.howto.calls[3], 'setup 1 false', 'HowToPlayFlow Setup(1, false)');
  eq([h.hub.rule.state.current, h.hub.rule.state.index[3]], [3, 1], '설명 왕복 뒤 커서·값 유지');
  h.tap(0x2);
  ok(h.until(() => h.hub.seq === 7, 400), '첫 열 B → 페이드 → 항구(상태 7)');
  ok(h.work.rule.valid && h.work.rule.cpu === 1, '취소도 CPU 캐시 commit');
  eq(h.hub.selected, 2, '취소 뒤 ID 2');
  h.until(() => h.msg.isAllTalkEnd());
  h.tap(0x1);
  ok(h.until(() => h.hub.phase === '규칙 설정'), '다시 결정 → 첫 설명 생략 → 규칙');
  eq(h.howto.calls.length, 6, '두 번째는 첫 설명 없음');
  eq(h.hub.rule.state.index[3], 1, '캐시에서 CPU 1 불러옴');
  h.tap(0x1);
  h.tap(0x1);
  h.tap(0x1);
  ok(h.until(() => h.done() !== null, 200), '플레이 A → 출발 → 끝');
  eq(h.done(), { kind: 'mgm01', nextMode: 1, rule: { cpu: 1, explain: 0, flag4: true } } as MgmetResult, '결과 mgm01');
  eq(h.calls, ['call mgm01'], 'CallMinigameModeScene(mgm01)');
  ok(h.sound.log.some((e) => e.type === 'bgmStop' && near(e.fade, 0.7)), 'StopBgm(2) = 0.7 s');
}
{
  const h = makeHub({ com: [false, false, false, false], sp: 4, modeFlags: MODE_FLAG.OP_SKIP | MODE_FLAG.FIRST_HOWTO_MGM01 });
  ok(h.until(() => h.hub.seq === 7 && h.hub.guideId === h.hub.selected), '시작 지점 4 → 바로 선택');
  eq(h.hub.selected, 0, 'ID 0(태그 매치)');
  const vis = (p: string): boolean => {
    const f = h.hub.title.win.inst.find(p)!;
    return f[0].nodes[f[1]].v;
  };
  ok(!vis('x_cursor_00/x_null_right') && vis('x_cursor_00/x_null_left'), 'ID 0: 오른쪽 화살표 숨김');
  h.until(() => h.msg.isAllTalkEnd());
  h.tap(0x200);
  eq([h.hub.selected, h.hub.seq], [0, 7], '오른쪽 끝에서 정지');
  ok(h.sound.log.some((e) => e.type === 'bgm' && e.label === 'SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP'), '앞 안내 뒤 BGM 2');
  h.tap(0x1);
  ok(h.until(() => h.done() !== null, 50), '다른 액티비티 결정 → 끝');
  eq(h.done(), { kind: 'activity', id: 0, nextMode: 4 } as MgmetResult, '결과 = 태그 매치(진입 미구현)');
}
{
  const h = makeHub({ com: [false, true, true, true], sp: 2, boss: false });
  ok(h.until(() => h.hub.seq === 7) && h.hub.selected === 4, '시작 지점 2 → ID 4');
  h.until(() => h.msg.isAllTalkEnd());
  h.tap(0x100);
  eq(h.hub.selected, 4, '보스 미개방: ID 4 왼쪽 막힘');
  const seLabels = (): string[] => h.sound.log.flatMap((e) => (e.type === 'se' ? [e.label] : []));
  const se0 = seLabels().length;
  h.tap(0x2);
  eq(seLabels()[se0], 'SQ_SE_SYS_CANCEL', 'B → SQ_SE_SYS_CANCEL 먼저');
  ok(h.until(() => h.hub.phase === '나가기 확인' && h.msg.isNextInputWait(), 300), 'B → 나가기 확인(메시지 창 선택지)');
  eq(h.msg.st.pages[0]?.label, 'mgmet_back_mw_guide', '문구 mgmet_back_mw_guide');
  eq(h.msg.layoutInst?.name, 'sys_meswin_choices_00', 'wt 4 선택지 레이아웃');
  eq([h.msg.st.choiceCount, h.msg.st.choiceCursor, h.msg.st.cancelEnable], [2, 1, true], '2지·기본 아니요·B 취소 가능');
  eq(h.msg.st.choices.slice(0, 2).map((c) => [c.label, c.deciSe, c.deciVib]), [['mgmet_back_mw_guide_a0', 'SQ_SE_SYS_DECI_L', 'bv_vib_sys_deci_l'], ['mgmet_back_mw_guide_a1', 'SQ_SE_SYS_CANCEL', 'bv_vib_sys_deci']], '칸 문구·SE·진동');
  h.until(() => false, 60);
  h.tap(0x2);
  ok(h.until(() => h.hub.phase === '액티비티 선택(상태 7)', 100), 'B(취소) → 상태 7 재진입');
  eq([h.done(), h.hub.seq, h.hub.exitRequested, h.msg.choiceResult()], [null, 7, false, -1], '나가지 않음(결과 −1)');
  ok(h.until(() => h.hub.guideId === h.hub.selected, 300), '앞 안내 다시');
  h.until(() => h.msg.isAllTalkEnd());
  h.tap(0x2);
  ok(h.until(() => h.hub.phase === '나가기 확인' && h.msg.isNextInputWait(), 300), '다시 나가기 확인');
  h.until(() => false, 60);
  h.tap(0x800);
  eq(h.msg.st.choiceCursor, 0, '위 → 예');
  h.tap(0x1);
  ok(h.until(() => h.done() !== null, 200), '예 → 나가기');
  ok(seLabels().includes('SQ_SE_SYS_DECI_L') && h.msg.log.some((e) => e.type === 'vib' && e.label === 'bv_vib_sys_deci_l'), '예 SE DECI_L·진동 deci_l');
  eq(h.calls, ['ret'], 'ReturnScene');
}
{
  const h = makeHub({ com: [false, false, true, true], sp: 7, modeFlags: 9 });
  ok(h.until(() => h.hub.seq === 10) && h.until(() => h.hub.seq === 7), '시작 지점 7 → 복귀 흐름 → 선택');
  eq(h.hub.selected, 2, '복귀 ID 2');
}
{
  const h = makeHub({ com: [false, false, false, false], entry: 'rule', modeFlags: 9 });
  ok(h.until(() => h.hub.phase === '규칙 설정'), '규칙만 진입');
  eq(h.hub.rule.state.first, 4, 'COM 없음 → 설명 열');
  h.tap(0x800);
  h.tap(0x1);
  h.tap(0x1);
  ok(h.until(() => h.done() !== null, 100), '플레이 A');
  eq(h.done(), { kind: 'rule', update: 1, rule: { cpu: 0, explain: 1, flag4: false } } as MgmetResult, '규칙 결과');
}

console.log('6. 3D 애니 커브 반복(원본 wrap Repeat — 변환기 Curves.cs, plaza_3d.md §6.14 #14c ③). web 은 아직 mgmet 3D 를 안 쓰므로 변환 산출물(extracted/converted/graphics/mgmet)을 본다');
{
  const G = join(WEB, '..', 'extracted', 'converted', 'graphics', 'mgmet');
  if (!existsSync(G)) console.log('   건너뜀: 변환 산출물 없음', G);
  else {
    const sea: [string, string, string, number, number][] = [['mgmet_ocean00_mt', 'utility_parameter0', '0x08', 0, 450]];
    for (const f of ['mgmet_sea00', 'mgmet_sea00_op_c01']) {
      const r = fmabRepeatBad(join(G, 'anim', f + '.fmab.json'), sea);
      ok(r.length === 0, `${f}.fmab 바다 커브 450f 뒤에도 반복 ${r.join(' · ')}`);
    }
    const map: [string, number, number][] = [['fabric_joint_l2', 60, 360], ['fabric_joint_l3', 120, 420], ['fabric_joint_r2', 140, 440], ['fabric_joint_r3', 190, 490]];
    const veh: [string, number, number][] = [['pos_banana_1', 35, 155], ['pos_jetski_0', 85, 205], ['pos_jetski_2', 25, 145], ['pos_jetski_3', 50, 170], ['pos_submarine_0', 45, 165], ['pos_submarine_2', 60, 180], ['pos_submarine_3', 15, 135]];
    for (const [f, rows] of [['mgmet_map01', map], ['mgmet_vehicle00', veh]] as const) {
      const r = glbRepeatBad(join(G, 'model', f + '.glb'), f, [...rows]);
      ok(r.length === 0, `${f}.glb 뼈 ${rows.length}개(키 구간이 엇갈린 Repeat)가 구간 밖에서도 반복 ${r.slice(0, 3).join(' · ')}`);
    }
  }
}

console.log(`${count - fails}/${count} 통과`);
if (fails) process.exit(1);
