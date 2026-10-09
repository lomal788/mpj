/**
 * 분할 화면 공용 런타임 시험(노드, 헤드리스 없음) — docs/engine/10_split_screen.md §9.8.
 *   npx tsx tools/test_splitscreen.ts            (먼저 web/tools/analysis/splitscreen_web_assets.py)
 * 1) rect·ID  2) viewport/scissor 절삭·GL y  3) 전환·완료 스텝·재호출  4) 보정 FOV·frustum  5) 분할선·원본 json  6) 3D→HUD
 * 7) three 어댑터(가짜 renderer): 호출 순서·값·DPR·clear·복구·원본 카메라·그림자·update 1회·후처리 region  8) PostChain region  9) 틀 ctx.split
 * 10) import 경계  11) 할당 0
 */
import fs from 'node:fs';
import path from 'node:path';
import { PerformanceObserver } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  correctFrustum,
  correctPerspective,
  createParams,
  DIVIDING_LINES,
  drawAspect,
  FIX_HORIZONTAL,
  FIX_KEEP,
  FIX_SKIP,
  FIX_VERTICAL,
  glScissorY,
  glViewportY,
  hermite,
  LINE_HIDDEN,
  LINE_NORMAL,
  MG0122_CAPTURE,
  ndcToLayout,
  ndcToLayoutPx,
  rect4,
  scissorPx,
  SplitParam,
  SplitScreen,
  SplitScreenLayerList,
  STEP_SEC,
  viewportInt,
  viewportPx,
  type FrustumFix,
  type PerspectiveFix,
} from '@game/lib/splitscreen';
import { SplitRenderer, type PostRegion, type RegionPost, type SplitGl } from '@game/lib/splitscreen-three';
import { PostChain, type PostParams } from '../script/shell/stage3d/post';
import { localGate, MgScene, mgUiData, type MgTables, type ResultStage } from '@app/scene/minigame/mgscene';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(WEB, 'assets');
const F = Math.fround;

let count = 0;
let fails = 0;
const ok = (cond: boolean, msg: string, detail = ''): void => {
  count++;
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${detail ? `  — ${detail}` : ''}`);
};
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
const near = (a: number, b: number, e = 1e-6): boolean => Math.abs(a - b) <= e;
const rects = (l: SplitScreenLayerList): number[][] => l.layers.slice(0, l.count).map((x) => [x.cur.id, x.cur.x, x.cur.y, x.cur.w, x.cur.h]);
const r4 = (p: { x: number; y: number; w: number; h: number }): number[] => [p.x, p.y, p.w, p.h];

console.log('1) rect·ID');
{
  const out: SplitParam[] = [];
  eq(createParams(2, 1, -1, out), 2, '2×1 균등 = 2개');
  eq(out.slice(0, 2).map((p) => [p.id, ...r4(p)]), [[0, 0, 0, 0.5, 1], [1, 0.5, 0, 0.5, 1]], '2×1 균등: 0 左 (0,0,.5,1) / 1 右 (.5,0,.5,1)');
  createParams(2, 2, -1, out);
  eq(out.slice(0, 4).map((p) => [p.id, ...r4(p)]), [[0, 0, 0, 0.5, 0.5], [1, 0.5, 0, 0.5, 0.5], [2, 0, 0.5, 0.5, 0.5], [3, 0.5, 0.5, 0.5, 0.5]], '2×2 균등: 행 우선 ID·원점 누적(§2 표)');
  createParams(2, 2, 0, out);
  eq(out.slice(0, 4).map((p) => [p.id, ...r4(p)]), [[0, 0, 0, 1, 1], [1, 1, 0, 0, 1], [2, 0, 1, 1, 0], [3, 1, 1, 0, 0]], '(2,2,0): ID0 전체, 나머지 면적 0·ID 유지(§2 표)');
  for (const [c, r] of [[2, 1], [2, 2]]) {
    for (let f = -1; f < c * r; f++) {
      const n = createParams(c, r, f, out);
      const ps = out.slice(0, n);
      const area = ps.reduce((s, p) => s + p.w * p.h, 0);
      const pos = ps.filter((p) => p.visible).length;
      const ids = ps.map((p) => p.id).join(',');
      ok(near(area, 1) && pos === (f < 0 ? n : 1) && ids === [...Array(n).keys()].join(',') && (f < 0 || ps[f].visible), `${c}×${r} focus ${f}: 면적 합 1·양의 면적 ${pos}개·ID 0..${n - 1}${f >= 0 ? `·focus 화면 ${f} 보임` : ''}`);
    }
  }
  createParams(2, 2, 3, out);
  eq(r4(out[3]), [0, 0, 1, 1], '(2,2,3): 화면 3 = 전체(앞 열·행 폭 0 누적)');
}

console.log('2) viewport/scissor 절삭·GL y');
{
  const out: SplitParam[] = [];
  const vp = rect4();
  const sc = rect4();
  createParams(2, 1, -1, out);
  eq([r4(scissorPx(out[0], 1920, 1080, sc)), r4(scissorPx(out[1], 1920, 1080, rect4()))], [[0, 0, 960, 1080], [960, 0, 960, 1080]], '2×1 1920×1080 scissor (0,0,960,1080)/(960,0,960,1080)');
  createParams(2, 2, -1, out);
  const at = (W: number, H: number): number[][] => out.slice(0, 4).map((p) => r4(scissorPx(p, W, H, rect4())));
  eq(at(1920, 1080), [[0, 0, 960, 540], [960, 0, 960, 540], [0, 540, 960, 540], [960, 540, 960, 540]], '2×2 1920×1080 scissor 각 960×540');
  eq(at(3840, 2160), [[0, 0, 1920, 1080], [1920, 0, 1920, 1080], [0, 1080, 1920, 1080], [1920, 1080, 1920, 1080]], '2×2 3840×2160 scissor 각 1920×1080');
  const odd = at(1919, 1079);
  eq(odd, [[0, 0, 959, 539], [959, 0, 959, 539], [0, 539, 959, 539], [959, 539, 959, 539]], '2×2 1919×1079 scissor 각 959×539(성분별 절삭)');
  ok(odd[1][0] + odd[1][2] === 1918 && odd[2][1] + odd[2][3] === 1078, '1919×1079: 마지막 열·행 1 px 미포함');
  viewportPx(out[1], 1919, 1079, vp);
  eq(r4(vp), [F(0.5 * 1919), 0, F(0.5 * 1919), F(0.5 * 1079)], '1919×1079 viewport = float(959.5…)');
  eq(r4(viewportInt(vp, rect4())), [960, 0, 959, 540], 'viewport 정수 = 가장자리 반올림(x0 round 959.5 → 960, x1 round 1919)');
  viewportPx(out[2], 1920, 1080, vp);
  ok(glViewportY(vp, 1080) === 0 && glScissorY(scissorPx(out[2], 1920, 1080, sc), 1080) === 0, 'GL y: 왼쪽 아래 화면 2 → 0');
  viewportPx(out[0], 1920, 1080, vp);
  ok(glViewportY(vp, 1080) === 540 && glScissorY(scissorPx(out[0], 1920, 1080, sc), 1080) === 540, 'GL y: 왼쪽 위 화면 0 → H−(y+h)·H = 540');
  viewportPx(out[0], 1919, 1079, vp);
  ok(glViewportY(vp, 1079) === F(1079 - F(0 + F(0.5 * 1079))) && glScissorY(scissorPx(out[0], 1919, 1079, sc), 1079) === 1079 - 0 - 539, 'GL y 1919×1079: viewport float H−(y+h) = 539.5 / scissor H−trunc(y)−trunc(h) = 540');
}

console.log('3) 전환·완료 스텝·재호출');
{
  const l = new SplitScreenLayerList();
  l.splitTo(2, 2, 0, 0);
  ok(l.isFinished() && !l.isSplitting(), 'SetParam(2,2,0,0): 끝·분할 아님');
  l.splitTo(2, 2, -1, 1);
  ok(!l.isFinished(), 'AnimationTo 1 s: 진행 중');
  l.update(0.5);
  eq(rects(l), [[0, 0, 0, 0.75, 0.75], [1, 0.75, 0, 0.25, 0.75], [2, 0, 0.75, 0.75, 0.25], [3, 0.75, 0.75, 0.25, 0.25]], 'focus0→4분할 진행 .5 = (0,0,.75,.75) (.75,0,.25,.75) (0,.75,.75,.25) (.75,.75,.25,.25)');
  ok(l.isSplitting(), '전환 중간: 양의 면적 4개 = 분할');
  const steps = (sec: number, from: number, to: number): number => {
    const x = new SplitScreenLayerList();
    x.splitTo(2, 2, from, 0);
    x.splitTo(2, 2, to, sec);
    let n = 0;
    while (!x.isFinished() && n < 1000) {
      x.update(STEP_SEC);
      n++;
    }
    return n;
  };
  eq([steps(0.5, 0, -1), steps(1, 0, -1), steps(1, -1, 0)], [30, 61, 61], 'f32 1/60 누적 완료: 0.5 s = 30 스텝, 1 s = 61 스텝');
  {
    const x = new SplitScreenLayerList();
    x.splitTo(2, 1, 0, 0);
    x.splitTo(2, 1, -1, 1);
    for (let i = 0; i < 59; i++) x.update(STEP_SEC);
    ok(!x.isFinished() && x.layers[0].cur.w !== 0.5, '1 s: 59 스텝 뒤 아직 진행 중');
    x.update(STEP_SEC);
    ok(!x.isFinished(), '60 스텝(f32 합 < 1) 아직 진행 중');
    x.update(STEP_SEC);
    ok(x.isFinished() && x.layers[0].cur.w === 0.5 && x.layers[1].cur.x === 0.5, '61 스텝째 목표 복사');
  }
  {
    const x = new SplitScreenLayerList();
    x.splitTo(2, 2, 0, 0);
    x.splitTo(2, 2, -1, 1);
    for (let i = 0; i < 15; i++) x.update(STEP_SEC);
    const mid = x.layers[0].cur.w;
    x.splitTo(2, 2, 0, 1);
    ok(x.layers[0].start.w === mid && x.layers[0].elapsed === 0 && x.layers[0].target.w === 1, '진행 중 재호출: 시작값 = 현재값, elapsed 0, 새 목표');
    x.update(STEP_SEC);
    const t = F(STEP_SEC / F(1));
    ok(x.layers[0].cur.w === F(mid + F(t * F(1 - mid))), '재호출 뒤 첫 스텝 = start + (elapsed/duration)·(target−start) (f32)');
    x.update(STEP_SEC);
    x.splitTo(2, 2, -1, 0);
    ok(x.isFinished() && x.layers[0].cur.w === 0.5, 'SetParam: 전환 취소·현재값 바로 설정');
  }
  {
    const x = new SplitScreenLayerList();
    x.splitTo(2, 2, 0, 0);
    let threw = false;
    try {
      x.splitTo(2, 1, -1, 1);
    } catch {
      threw = true;
    }
    ok(threw, 'AnimationTo 개수 다름 → Error(원본 Abort)');
    x.splitTo(2, 1, -1, 0);
    ok(x.count === 2, '개수 다름 + 시간 0 = SetParam 으로 크기 맞춤');
  }
  {
    const x = new SplitScreenLayerList();
    x.splitTo(2, 2, -1, 0);
    x.layers[0].target.id = 9;
    x.splitTo(2, 2, 0, 1);
    x.layers[0].target.id = 7;
    x.update(0.25);
    ok(x.layers[0].cur.id === 0, 'ID 는 중간 보간하지 않음');
    x.update(1);
    ok(x.layers[0].cur.id === 7, '완료 때 목표 전체(ID 포함) 복사');
  }
}

console.log('4) 보정 FOV·frustum');
{
  const fovy = F((20 * Math.PI) / 180);
  const A0 = F(16 / 9);
  const pf: PerspectiveFix = { fovy: 0, aspect: 0, mode: 0 };
  const deg = (r: number): number => (r * 180) / Math.PI;
  correctPerspective(fovy, A0, 0.5, 1, pf);
  ok(pf.mode === FIX_VERTICAL && near(deg(pf.fovy), 20, 1e-5) && pf.aspect === F(F(0.5) * F(16 / 9)), 'A=8/9 (2×1 화면) < A0 → 수직 FOV 20° 유지, aspect 8/9', `${deg(pf.fovy)} ${pf.aspect}`);
  ok(pf.aspect === drawAspect(0.5, 1), 'A = (w/h)·보정 RT aspect 16/9');
  correctPerspective(fovy, A0, 0.5, 0.5, pf);
  ok(pf.mode === FIX_KEEP && near(deg(pf.fovy), 20, 1e-5) && pf.aspect === A0, 'A=16/9 (4분할) = A0 → 원본 projection 유지');
  correctPerspective(fovy, A0, 1, 0.5, pf);
  ok(pf.mode === FIX_HORIZONTAL && near(deg(pf.fovy), 10.076737, 1e-5) && pf.aspect === F(32 / 9), 'A=32/9 → 수평 FOV 보존 ≈ 10.076737°', `${deg(pf.fovy)}`);
  correctPerspective(fovy, A0, 0, 1, pf);
  ok(pf.mode === FIX_SKIP && pf.fovy === fovy && pf.aspect === A0, '면적 성분 < FLT_EPSILON → 건너뜀');
  const ff: FrustumFix = { l: 0, r: 0, b: 0, t: 0, mode: 0 };
  correctFrustum(-16, 16, -9, 9, 0.5, 1, ff);
  const a89 = drawAspect(0.5, 1);
  eq([ff.l, ff.r, ff.b, ff.t, ff.mode], [-F(a89 * 9), F(a89 * 9), -9, 9, FIX_VERTICAL], 'type3 A=8/9 < A0: halfHeight 유지, 좌우 = ±A·9');
  correctFrustum(-16, 16, -9, 9, 1, 0.5, ff);
  ok(near(ff.t, 4.5, 1e-5) && near(ff.r, 16, 1e-4) && near(ff.l, -16, 1e-4) && ff.mode === FIX_HORIZONTAL, 'type3 A=32/9 ≥ A0: halfHeight·A0/A = 4.5, 좌우 = ±16', `${ff.l} ${ff.r} ${ff.t}`);
  correctFrustum(-10, 30, -5, 15, 0.5, 0.5, ff);
  ok(near((ff.l + ff.r) / 2, 10) && near((ff.b + ff.t) / 2, 5), 'type1·3: 원본 중심 유지');
}

console.log('5) 분할선');
{
  const s = new SplitScreen();
  const panes = (): number[][] => s.lines.panes.filter((p) => p.visible).map((p) => [p.vertical ? 1 : 0, p.x, p.y, p.length, p.rotate]);
  s.to(2, 1, 0, 0);
  s.step();
  eq([s.lines.vCount, s.lines.hCount, s.lines.state], [0, 0, LINE_HIDDEN], '2×1 focus0: 내부 경계 0·숨김');
  s.to(2, 1, -1, 0);
  s.step();
  eq(panes(), [[1, 0, 0, 1080, 0]], '2×1 균등: 수직선 1개 (0,0) 길이 1080 회전 0');
  ok(s.lines.state === 1 && s.lines.alpha === 0, '시간 0 SplitTo 도 tick 의 In(false): 그 스텝 알파 0(in 0 프레임)');
  const alphas: number[] = [];
  for (let i = 0; i < 9; i++) {
    s.step();
    alphas.push(Math.round(s.lines.alpha));
  }
  ok(alphas[8] === 255 && s.lines.state === LINE_NORMAL && alphas[3] > 0 && alphas[3] < 255, 'in 9프레임 뒤 normal 255', alphas.join(','));
  ok(near(hermite(DIVIDING_LINES.anim.in.keys, 4.5), 127.5), 'in 알파 hermite(끝점 기울기 0) 중간 = 127.5');
  const s4 = new SplitScreen();
  s4.to(2, 2, 0, 0);
  s4.step();
  s4.to(2, 2, -1, 1);
  for (let i = 0; i < 61; i++) s4.step();
  eq(s4.lines.panes.filter((p) => p.visible).map((p) => [p.name, p.x, p.y, p.length, p.rotate]), [['x_v_00', 0, 0, 1080, 0], ['x_h_00', 0, 0, 1920, 90]], '2×2 균등: 수직 x_v_00 (0,0) 1080 + 수평 x_h_00 (0,0) 1920 회전 90(내부 경계 병합)');
  const sm = new SplitScreen();
  sm.to(2, 2, 0, 0);
  sm.list.splitTo(2, 2, -1, 1);
  sm.list.update(0.5);
  sm.lines.layout(sm.list);
  eq(sm.lines.panes.filter((p) => p.visible).map((p) => [p.vertical ? 1 : 0, p.x, p.y, p.length]), [[1, 480, 0, 1080], [0, 0, -270, 1920]], '전환 .5: 수직 x=.75 → paneX 480·길이 1080, 수평 y=.75 → paneY −270·길이 1920');
  s4.to(2, 2, 0, 1);
  let outStep = -1;
  for (let i = 0; i < 80; i++) {
    s4.step();
    if (outStep < 0 && s4.lines.state === 3) outStep = i + 1;
  }
  ok(outStep === 61 && s4.lines.state === LINE_HIDDEN && s4.lines.vCount === 0, '균등 → focus0 1 s: 61 스텝째 분할 끝 → Out(false) → 9 프레임 뒤 숨김', `${outStep}`);
  {
    const x = new SplitScreen();
    x.list.splitTo(4, 1, -1, 0);
    x.lines.layout(x.list);
    ok(x.lines.vCount === 3 && x.lines.hCount === 0 && x.lines.vertical.slice(0, 3).every((p, i) => near(p.x, -960 + 1920 * (i + 1) * 0.25, 1e-3)), '4×1: 수직 3개 좌표 오름차순 배정');
  }
  const json = JSON.parse(fs.readFileSync(path.join(A, 'splitscreen/lines.json'), 'utf8')) as {
    layout: { root: { size: number[]; children: { name: string; children: { name: string; size: number[]; rotate: number[]; uvs: number[][]; material: string }[] }[] }; materials: { name: string; black: string; white: string; texMaps: { tex: string; wrapU: string; wrapV: string; minFilter: string }[] }[]; textures: string[] };
    anims: Record<string, { frameSize: number; loop: boolean; entries: { name: string; tags: { tag: string; tracks: { keys: number[][] }[] }[] }[] }>;
    textures: Record<string, string>;
  };
  const all = json.layout.root.children[0];
  const kids = all.children;
  ok(all.name === DIVIDING_LINES.group && kids.length === 26, '원본 json: Null_all 아래 pane 26개');
  eq(kids.map((k) => k.name), [...Array(13).keys()].map((i) => `x_v_${String(i).padStart(2, '0')}`).concat([...Array(13).keys()].map((i) => `x_h_${String(i).padStart(2, '0')}`)), 'pane 이름 = 코어 순서(x_v_00..12, x_h_00..12)');
  eq(new SplitScreen().lines.panes.map((p) => p.name), kids.map((k) => k.name), '코어 pane 이름 일치');
  ok(kids.slice(0, 13).every((k) => k.size[0] === DIVIDING_LINES.paneWidth && k.size[1] === DIVIDING_LINES.vLength && k.rotate[2] === DIVIDING_LINES.vRotate && k.uvs[0][5] === DIVIDING_LINES.uvV), '수직 pane 8×1080·회전 0·UV V 끝 38.57143');
  ok(kids.slice(13).every((k) => k.size[0] === DIVIDING_LINES.paneWidth && k.size[1] === DIVIDING_LINES.hLength && k.rotate[2] === DIVIDING_LINES.hRotate && k.uvs[0][5] === DIVIDING_LINES.uvH), '수평 pane 8×1920·회전 90·UV V 끝 66.206894');
  const m = json.layout.materials;
  const hex = (c: number[]): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  ok(m.length === 26 && m.every((x) => x.black === hex([...DIVIDING_LINES.black]) && x.white === hex([...DIVIDING_LINES.white]) && x.texMaps[0].tex === DIVIDING_LINES.texture && x.texMaps[0].minFilter === 'linear'), '재질 black #00000000·white #020202ff·sys_dividing_line^s·linear');
  for (const t of ['in', 'normal', 'out'] as const) {
    const a = json.anims[t];
    const keys = a.entries[0].tags[0].tracks[0].keys;
    ok(a.frameSize === DIVIDING_LINES.anim[t].frames && !a.loop && a.entries[0].name === DIVIDING_LINES.group && JSON.stringify(keys) === JSON.stringify(DIVIDING_LINES.anim[t].keys), `애니 ${t}: ${a.frameSize}f 비루프 Null_all 알파 키 = 코어`);
  }
  ok(json.textures[DIVIDING_LINES.texture] === '../common/tex/sys_dividing_line_s.png' && fs.existsSync(path.join(A, 'common/tex/sys_dividing_line_s.png')), '그림 = 공용 assets/common/tex/sys_dividing_line_s.png');
}

console.log('6) 3D→HUD');
{
  const out: SplitParam[] = [];
  createParams(2, 2, -1, out);
  const p = { x: 0, y: 0 };
  eq(r4o(ndcToLayout(0, 0, out[0], p)), [-480, 270], '화면 0 중심 NDC(0,0) → (−480, 270)');
  eq(r4o(ndcToLayout(1, 1, out[3], p)), [960, 0], '화면 3 NDC(1,1) → (960, 0)');
  eq(r4o(ndcToLayout(-1, -1, out[0], p)), [-960, 0], '화면 0 NDC(−1,−1) → (−960, 0)');
  const sc = scissorPx(out[1], 1920, 1080, rect4());
  eq(r4o(ndcToLayoutPx(0.5, -0.5, sc, 1920, 1080, p)), r4o(ndcToLayout(0.5, -0.5, out[1], { x: 0, y: 0 })), '1920×1080: scissor 픽셀 식 = 정규화 식');
  const sco = scissorPx(out[1], 1919, 1079, rect4());
  ndcToLayoutPx(1, 1, sco, 1919, 1079, p);
  ok(p.x < 960 && near(p.x, (1920 * 1918) / 1919 - 960, 1e-9), '1919×1079: 실제 scissor 픽셀로 변환(오른쪽 끝 1 px 안쪽)');
  createParams(2, 1, -1, out);
  eq(r4o(ndcToLayout(0, 0, out[1], p)), [480, 0], '2×1 화면 1 중심 → (480, 0)');
}
function r4o(p: { x: number; y: number }): number[] {
  return [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6];
}

console.log('7) three 어댑터');
interface LogRow {
  op: string;
  target: THREE.WebGLRenderTarget | null;
  vp: number[];
  sc: number[];
  test: boolean;
  autoClear: boolean;
  smAuto: boolean;
  cam?: THREE.Camera;
  obj?: THREE.Object3D;
}
class FakeGl implements SplitGl {
  autoClear = true;
  readonly shadowMap = { autoUpdate: true, needsUpdate: false };
  toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  pr = 1.5;
  W = 1920;
  H = 1080;
  vp = new THREE.Vector4(0, 0, 1280, 720);
  sc = new THREE.Vector4(5, 6, 7, 8);
  test = false;
  target: THREE.WebGLRenderTarget | null = null;
  readonly cur = { vp: new THREE.Vector4(), sc: new THREE.Vector4(), test: false };
  readonly log: LogRow[] = [];
  getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }
  setRenderTarget(t: THREE.WebGLRenderTarget | null): void {
    this.target = t;
    if (t) {
      this.cur.vp.copy(t.viewport);
      this.cur.sc.copy(t.scissor);
      this.cur.test = t.scissorTest;
    } else {
      this.cur.vp.copy(this.vp).multiplyScalar(this.pr).floor();
      this.cur.sc.copy(this.sc).multiplyScalar(this.pr).floor();
      this.cur.test = this.test;
    }
  }
  getViewport(o: THREE.Vector4): THREE.Vector4 {
    return o.copy(this.vp);
  }
  setViewport(x: number | THREE.Vector4, y?: number, w?: number, h?: number): void {
    if (typeof x === 'number') this.vp.set(x, y!, w!, h!);
    else this.vp.copy(x);
    this.cur.vp.copy(this.vp).multiplyScalar(this.pr).round();
  }
  getScissor(o: THREE.Vector4): THREE.Vector4 {
    return o.copy(this.sc);
  }
  setScissor(x: number | THREE.Vector4, y?: number, w?: number, h?: number): void {
    if (typeof x === 'number') this.sc.set(x, y!, w!, h!);
    else this.sc.copy(x);
    this.cur.sc.copy(this.sc).multiplyScalar(this.pr).round();
  }
  getScissorTest(): boolean {
    return this.test;
  }
  setScissorTest(on: boolean): void {
    this.test = on;
    this.cur.test = on;
  }
  getDrawingBufferSize(o: THREE.Vector2): THREE.Vector2 {
    return o.set(this.W, this.H);
  }
  getPixelRatio(): number {
    return this.pr;
  }
  private row(op: string, extra: Partial<LogRow> = {}): void {
    this.log.push({ op, target: this.target, vp: this.cur.vp.toArray(), sc: this.cur.sc.toArray(), test: this.cur.test, autoClear: this.autoClear, smAuto: this.shadowMap.autoUpdate, ...extra });
  }
  clear(): void {
    this.row('clear');
  }
  render(obj: THREE.Object3D, cam: THREE.Camera): void {
    this.row('render', { cam, obj });
  }
  state(): unknown {
    return { target: this.target, vp: this.vp.toArray(), sc: this.sc.toArray(), test: this.test, autoClear: this.autoClear, sm: { ...this.shadowMap } };
  }
}
const mkCams = (): THREE.PerspectiveCamera[] =>
  [0, 1, 2, 3].map((i) => {
    const c = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 100);
    c.position.set(i, 0, 0);
    c.layers.set(i);
    c.updateMatrixWorld(true);
    return c;
  });
{
  const gl = new FakeGl();
  const sr = new SplitRenderer(gl);
  const scene = new THREE.Scene();
  const cams = mkCams();
  const before = cams.map((c) => [c.fov, c.aspect, ...c.projectionMatrix.elements]);
  const s = new SplitScreen();
  s.to(2, 2, -1, 0);
  const st0 = JSON.stringify(gl.state());
  let updates = 0;
  const stage = { update: (): void => void updates++ };
  stage.update();
  sr.render(scene, cams, s.list);
  const rows = gl.log;
  eq(rows.map((r) => r.op), ['clear', 'render', 'render', 'render', 'render'], '순서: 출력 전체 clear 1회 → 레이어 4개 render');
  ok(rows[0].target === null && !rows[0].test && JSON.stringify(rows[0].vp) === JSON.stringify([0, 0, 1920, 1080]), 'clear = canvas 전체(scissor 끔, 물리 1920×1080)');
  eq(rows.slice(1).map((r) => [r.vp, r.sc]), [
    [[0, 540, 960, 540], [0, 540, 960, 540]],
    [[960, 540, 960, 540], [960, 540, 960, 540]],
    [[0, 0, 960, 540], [0, 0, 960, 540]],
    [[960, 0, 960, 540], [960, 0, 960, 540]],
  ], '레이어 ID 순 viewport/scissor(GL 원점, DPR 1.5 에서 물리 픽셀 그대로 — 두 번 곱하지 않음)');
  ok(rows.slice(1).every((r) => r.test && !r.autoClear), '레이어 그리기: scissor test 켬·autoClear 끔(레이어 ≥1 clear 없음)');
  eq(rows.slice(1).map((r) => r.smAuto), [true, false, false, false], '그림자 맵은 첫 레이어만 갱신');
  eq(JSON.stringify(gl.state()), st0, '끝나면 target·viewport·scissor·test·autoClear·그림자 값 복구');
  ok(rows.slice(1).every((r, i) => r.cam !== cams[i] && (r.cam as THREE.PerspectiveCamera).layers.mask === cams[i].layers.mask && (r.cam as THREE.Camera).matrixWorld.equals(cams[i].matrixWorld)), 'draw 카메라 = 복사본(layers·matrixWorld 같음, 원본 아님)');
  eq(cams.map((c) => [c.fov, c.aspect, ...c.projectionMatrix.elements]), before, '원본 카메라 fov·aspect·projection 무변경');
  ok(updates === 1 && sr.stats.renders === 4, 'Stage3D.update 1회 + 레이어 4회 그리기(어댑터는 update 를 부르지 않음)');
  const src = fs.readFileSync(path.join(WEB, 'script/app/scene/minigame/mgstage/stage.ts'), 'utf8');
  const body = src.slice(src.indexOf('  renderSplit('), src.indexOf('  resize(w: number'));
  ok(body.length > 0 && !/\.update\(/.test(body), 'MgStage.renderSplit 은 update 를 부르지 않음');

  gl.log.length = 0;
  const s2 = new SplitScreen();
  s2.to(2, 1, -1, 0);
  sr.render(scene, cams, s2.list);
  const d0 = gl.log[1].cam as THREE.PerspectiveCamera;
  ok(near(d0.aspect, F(8 / 9) * 1, 1e-6) && near(d0.fov, 20, 1e-5), '2×1: draw 카메라 aspect 8/9·수직 FOV 20° 유지');
  eq(gl.log.slice(1).map((r) => r.sc), [[0, 0, 960, 1080], [960, 0, 960, 1080]], '2×1 scissor 좌/우');
  gl.log.length = 0;
  const s0 = new SplitScreen();
  s0.to(2, 2, 0, 0);
  sr.render(scene, cams, s0.list);
  eq(gl.log.map((r) => r.op), ['clear', 'render'], 'focus0: 면적 0 레이어 건너뜀(자동 적용 flag)');
  ok(sr.drawCamera(1) === null && sr.drawCamera(0) !== null, 'focus0: 화면 1 draw 카메라 없음');
  gl.log.length = 0;
  const sr0 = new SplitScreen();
  sr0.reset();
  sr.render(scene, cams, sr0.list);
  ok(gl.log.length === 1 && gl.log[0].op === 'render' && gl.log[0].cam === cams[0], 'ResetAll(레이어 0개): 원본 카메라 0 으로 보통 한 번 그리기');

  gl.log.length = 0;
  const rt = new THREE.WebGLRenderTarget(960, 540);
  rt.viewport.set(1, 2, 3, 4);
  rt.scissor.set(5, 6, 7, 8);
  rt.scissorTest = true;
  sr.render(scene, cams, s.list, { target: rt });
  eq(gl.log.slice(1).map((r) => [r.target === rt, r.sc]), [
    [true, [0, 270, 480, 270]],
    [true, [480, 270, 480, 270]],
    [true, [0, 0, 480, 270]],
    [true, [480, 0, 480, 270]],
  ], 'RT 출력(960×540): RT 필드에 물리 값');
  ok(rt.viewport.equals(new THREE.Vector4(1, 2, 3, 4)) && rt.scissor.equals(new THREE.Vector4(5, 6, 7, 8)) && rt.scissorTest && gl.target === null, 'RT 출력 뒤 RT viewport/scissor/test·현재 target 복구');

  const regions: number[][] = [];
  const post: RegionPost = {
    render(_s: THREE.Scene, _c: THREE.Camera, r?: PostRegion) {
      regions.push(r ? [r.target ? 1 : 0, ...r.viewport.toArray(), ...r.scissor.toArray()] : []);
    },
  };
  sr.render(scene, cams, s.list, { post });
  eq(regions, [
    [0, 0, 540, 960, 540, 0, 540, 960, 540],
    [0, 960, 540, 960, 540, 960, 540, 960, 540],
    [0, 0, 0, 960, 540, 0, 0, 960, 540],
    [0, 960, 0, 960, 540, 960, 0, 960, 540],
  ], '후처리: 레이어마다 post.render(region = 출력 null·viewport·scissor 물리 GL 원점)');

  const p = { x: 0, y: 0 };
  const cam = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 100);
  cam.updateMatrixWorld(true);
  sr.render(scene, [cam, cam, cam, cam], s.list);
  sr.project(new THREE.Vector3(0, 0, -10), 3, p);
  ok(near(p.x, 480, 1e-6) && near(p.y, -270, 1e-6), '어댑터 project: 화면 3 카메라 정면 점 → 화면 3 중심 (480, −270)', `${p.x} ${p.y}`);
  let done = 0;
  const cap = new THREE.WebGLRenderTarget(MG0122_CAPTURE.perCamera[0], MG0122_CAPTURE.perCamera[1]);
  sr.capture({ layer: 2, target: cap, type: 0, flags: 1, onDone: () => done++ });
  gl.log.length = 0;
  sr.render(scene, cams, s.list);
  const last = gl.log[gl.log.length - 1];
  ok(done === 1 && last.target === cap && JSON.stringify(last.vp) === JSON.stringify([0, 0, 960, 540]) && sr.stats.captures === 1, 'mg0122 캡처 자리: 960×540 RT 에 레이어 2 draw 카메라로 한 번 + onDone');
  ok(JSON.stringify(gl.state()) === st0, '캡처 뒤에도 상태 복구');
  eq([MG0122_CAPTURE.perCamera, MG0122_CAPTURE.extra, MG0122_CAPTURE.extraCamera], [[960, 540], [1920, 1080], 0], 'mg0122 캡처 RT 크기 상수(§5)');
  const ortho = new THREE.OrthographicCamera(-16, 16, 9, -9, 0.1, 100);
  ortho.updateMatrixWorld(true);
  gl.log.length = 0;
  sr.render(scene, [ortho, ortho], s2.list);
  const oc = gl.log[1].cam as THREE.OrthographicCamera;
  ok(oc.isOrthographicCamera && near(oc.top, 9) && near(oc.right, F(F(F(0.5) * F(16 / 9)) * 9), 1e-5) && ortho.right === 16, 'type3 정사영: 복사본에 frustum 보정, 원본 무변경');
}

console.log('8) PostChain region(가짜 renderer)');
{
  const gl = new FakeGl();
  const params: PostParams = { tonemapType: 3, exposure: 1, exposureOffset: 0, outputScale: 1, bloom: true, bloomThreshold: 1, bloomIntensity: 0.5, bloomSpread: 1, bloomClip: 10, fxaa: true, fxaaEdgeThreshold: 0.1, fxaaEdgeThresholdMin: 0.05, fxaaSubPixel: 0.75 };
  const pc = new PostChain(gl as unknown as THREE.WebGLRenderer, params, null);
  const inner = pc as unknown as { scene: THREE.WebGLRenderTarget; first: THREE.ShaderMaterial; comp: THREE.ShaderMaterial };
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera();
  pc.render(scene, cam);
  const plain = gl.log.map((r) => [r.op, r.target === null ? 'canvas' : r.target === inner.scene ? 'scene' : 'rt']);
  const st0 = JSON.stringify(gl.state());
  gl.log.length = 0;
  const reg: PostRegion = { target: null, viewport: new THREE.Vector4(960, 540, 960, 540), scissor: new THREE.Vector4(960, 540, 960, 540) };
  pc.render(scene, cam, reg);
  const rows = gl.log;
  const sceneRow = rows.find((r) => r.target === inner.scene && r.obj === scene)!;
  ok(!!sceneRow && JSON.stringify(sceneRow.vp) === '[960,540,960,540]' && JSON.stringify(sceneRow.sc) === '[960,540,960,540]' && sceneRow.test && sceneRow.autoClear, '장면 패스: HDR RT viewport/scissor = 레이어, scissor 안 clear(autoClear)');
  const fin = rows[rows.length - 1];
  ok(fin.target === null && fin.test && JSON.stringify(fin.sc) === '[960,540,960,540]' && JSON.stringify(fin.vp) === '[0,0,1920,1080]', '마지막(FXAA) 패스: canvas, viewport 전체·scissor = 레이어(DPR 1.5 물리)');
  eq(rows.map((r) => [r.op, r.target === null ? 'canvas' : r.target === inner.scene ? 'scene' : 'rt']), plain, '패스 순서·대상은 region 없을 때와 같음');
  eq(JSON.stringify(gl.state()), st0, 'region 뒤 gl 상태 복구');
  ok(!inner.scene.scissorTest && inner.scene.viewport.equals(new THREE.Vector4(0, 0, 1920, 1080)), 'HDR RT viewport 전체·scissor 끔으로 복구');
  ok((inner.first.uniforms.region.value as THREE.Vector4).equals(new THREE.Vector4(0, 0, 1, 1)) && (inner.comp.uniforms.vigRect.value as THREE.Vector4).equals(new THREE.Vector4(0, 0, 1, 1)), 'clamp·비네트 유니폼 기본 (0,0,1,1) 로 복구');
  const fs1 = inner.first.fragmentShader;
  const fs2 = inner.comp.fragmentShader;
  ok(fs1.includes('clamp(vUv, region.xy, region.zw)') && fs2.includes('(vUv - vigRect.xy) / vigRect.zw * 2.0 - 1.0'), '셰이더: 기본값이면 표본·비네트 식이 전과 같음(clamp [0,1]·(vUv−0)/1)');
  const out = new THREE.WebGLRenderTarget(960, 540);
  gl.log.length = 0;
  pc.render(scene, cam, { target: out, viewport: new THREE.Vector4(0, 0, 960, 540), scissor: new THREE.Vector4(0, 0, 960, 540) });
  const fo = gl.log[gl.log.length - 1];
  ok(fo.target === out && inner.scene.width === 960 && !out.scissorTest, 'region.target RT: 내부 RT 크기 = 그 RT, 마지막 패스 = 그 RT, RT 필드 복구');
}

console.log('9) 틀 ctx.split');
{
  const ui = JSON.parse(fs.readFileSync(path.join(A, 'mgscene/ui.json'), 'utf8'));
  const tables = JSON.parse(fs.readFileSync(path.join(A, 'mgscene/tables.json'), 'utf8')) as MgTables;
  const players = [0, 1, 2, 3].map((pid) => ({ pid, chara: 'pc01', isCom: pid > 0, teamId: pid, order: pid }));
  const make = (mgId: string, createResultStage?: () => Promise<ResultStage>, rows = 2): MgScene =>
    new MgScene(
      { mgId, players, seed: 1, rand: { u32: () => 1 }, tables, ui: mgUiData(ui), createResultStage, resultHost: { gl: null, url: (p: string) => p } },
      { setup: (c) => c.split.to(2, rows, 0, 0) },
      localGate(() => [null, null, null, null]),
    );
  const sc = make('mg0102');
  ok(sc.split.list.count === 4 && !sc.ctx.split.isSplitting(), 'setup 에서 ctx.split.to(2,2,0,0) = 화면 0 전체');
  sc.ctx.split.to(2, 2, -1, 1);
  eq(sc.events.filter((e) => e.k === 'se').map((e) => (e as { label: string }).label), ['SQ_SE_SYS_MNG_CMR_SPLT_4'], 'mg0102 양수 전환 → 표 분할 SE');
  let n = 0;
  while (!sc.ctx.split.isFinished() && n < 200) {
    sc.tick();
    n++;
  }
  ok(n === 61 && sc.split.steps === 61 && sc.ctx.split.isSplitting(), '틀 step 마다 split.step 1회, 1 s = 61 틱 뒤 균등 4분할', `${n}`);
  const s8 = make('mg0508', undefined, 1);
  s8.ctx.split.to(2, 1, -1, 0.5);
  ok(!s8.events.some((e) => e.k === 'se'), 'mg0508: 표 라벨 없음 → SE 없음');
  const s22 = make('mg0122');
  s22.ctx.split.to(2, 2, -1, 0);
  ok(!s22.events.some((e) => e.k === 'se') && s22.split.list.isSplitting(), 'mg0122 (2,2,−1,0): 즉시·SE 없음');
  const sr = make('mg0102', () => new Promise<ResultStage>(() => undefined));
  sr.ctx.split.to(2, 2, -1, 0);
  (sr as unknown as { startResultStage(): void }).startResultStage();
  ok(!sr.split.list.isSplitting() && sr.split.list.param(0).w === 1, '결과 무대 시작 → focus0 즉시');
}

console.log('10) import 경계');
{
  const read = (p: string): string => fs.readFileSync(path.join(WEB, p), 'utf8');
  const imps = (src: string): string[] => [...src.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);
  const coreFiles = fs.readdirSync(path.join(WEB, 'script/game/lib/splitscreen'));
  eq(coreFiles, ['index.ts'], '코어 = 한 파일');
  eq(imps(read('script/game/lib/splitscreen/index.ts')), [], '코어 lib/splitscreen import 0');
  eq([...new Set(imps(read('script/game/lib/splitscreen-three/index.ts')))].sort(), ['../splitscreen', 'three'], 'three 어댑터 = three + 코어만');
  eq(imps(read('script/game/lib/splitscreen-dom/index.ts')), ['../splitscreen'], 'DOM 어댑터 = 코어만');
  ok(!/\btransition\s*:/.test(read('script/game/lib/splitscreen-dom/index.ts')), 'DOM 어댑터: CSS transition 안 씀');
}

console.log('11) 할당 0');
{
  const s = new SplitScreen();
  s.to(2, 2, 0, 0);
  s.step();
  const layers = s.list.layers.slice();
  const cur = layers.map((l) => l.cur);
  const panes = s.lines.panes.slice();
  let gcs = 0;
  const obs = new PerformanceObserver((list) => {
    gcs += list.getEntries().length;
  });
  for (let k = 0; k < 2000; k++) {
    s.to(2, 2, k % 2 ? 0 : -1, 0.5);
    for (let i = 0; i < 40; i++) s.step();
  }
  obs.observe({ entryTypes: ['gc'] });
  for (let k = 0; k < 20000; k++) {
    s.to(2, 2, k % 2 ? 0 : -1, 0.5);
    for (let i = 0; i < 40; i++) s.step();
  }
  await new Promise((r) => setTimeout(r, 50));
  obs.disconnect();
  ok(s.list.layers.every((l, i) => l === layers[i] && l.cur === cur[i]) && s.lines.panes.every((p, i) => p === panes[i]), '스텝·SplitTo 반복 뒤 레이어·Param·pane 객체 그대로(재사용)');
  ok(gcs === 0, `80만 스텝 + 2만 SplitTo 동안 GC 0회(매 스텝 할당 0)`, `gc ${gcs}`);
}

console.log(fails ? `실패 ${fails}/${count}` : `통과 ${count}/${count}`);
process.exit(fails ? 1 : 0);
