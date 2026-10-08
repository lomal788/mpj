/**
 * mg1801 로직 시험(노드) — 재구현 계산 수준. 원본 실행 대조가 아니다.
 *   1) 전원 CPU(CpuMiss 끔): 레인마다 JUST = CalcTotalPoint 레인별 자르기 수, FAST·SLOW·놓침 0
 *   2) 1P 사람·입력 없음: 1P 레인 전부 놓침, 나머지 JUST
 *   3) 1P 사람이 매 프레임 JudgeInput 이 JUST 인 첫 프레임에 A 를 누름: 1P 도 전부 JUST
 *   4) CalcTotalPoint 표(문서 6.6)와 같음
 *   5) 외곽선 안내 점유, JUST 판정음 콤보, 모드별 채보·BGM 라벨, PERFECT, 결과 앰비언트 생략, 결과 흐름·NPC·머리 추적, 단계 0~3
 *   6) 사운드 관측(G14·G12·게임 BGM L0 을 소리 쪽에서 읽는 경로): 지연 0 이면 프레임 모델과 같고, 지연·늦은 접수를 그대로 따른다
 *
 *   npx tsx tools/test_mg1801.ts
 */
import { NPAD, emptyPad, type PadInput } from '../script/core/pad';
import type { GameSetup, SoundSnapshot } from '../script/game';
import { mg1801Options } from '../script/games/mg1801/index';
import { Mg1801Game, calcTotalPoint, endingBgmName, gameBgmName, interEndBgmName, type Mg1801Options } from '../script/games/mg1801/logic/game';
import { chartRows } from '../script/games/mg1801/logic/chart';
import type { Mg1801Event } from '../script/games/mg1801/state';
import { fileURLToPath } from 'node:url';
import { fmabRepeatBad } from './anim_repeat';

let bad = 0;
const check = (name: string, ok: boolean, info = ''): void => {
  if (!ok) bad++;
  console.log(`${ok ? '통과' : '실패'} ${name}${info ? `  ${info}` : ''}`);
};

const setup = (com: boolean[]): GameSetup => ({ players: com.map((c, i) => ({ char: `pc0${i + 1}`, isCom: c, comLevel: 0 })), seed: 1, practice: false });

function run(com: boolean[], press?: (g: Mg1801Game) => boolean): Mg1801Game {
  const g = new Mg1801Game(setup(com));
  for (let f = 0; f < 60 * 120 && !g.done; f++) {
    const p1: PadInput = emptyPad();
    if (press?.(g)) p1.buttons |= NPAD.A;
    g.step([p1, null, null, null]);
  }
  return g;
}

const expected: Record<string, [number, number[]]> = {
  mg1801_rm_chart00: [208, [26, 26, 26, 26]],
  mg1801_rm_chart01: [240, [30, 30, 30, 30]],
  mg1801_rm_chart05s: [48, [6, 6, 6, 6]],
};
for (const [name, [total, personal]] of Object.entries(expected)) {
  const r = calcTotalPoint(chartRows(name));
  check(`CalcTotalPoint ${name}`, r.total === total && r.personal.join() === personal.join(), `${r.total} ${r.personal.join(',')}`);
}

const allCom = run([true, true, true, true]);
{
  const r = allCom.result!;
  check('전원 CPU 점수 = 레인별 26×2 = 52', r.scores.every((x) => x === 52), r.scores.join(','));
  check('전원 CPU 달성률 100 → 별 판정 3(수프 03)', r.rate === 100 && r.starJudge === 3, `${r.rate} ${r.starJudge}`);
}
{
  /* 줄 r 배분 = BGM 시작 마디 + (6+r)·8분(15 프레임) [mg1801_rhythm.md 3.4] */
  const g = new Mg1801Game(setup([true, true, true, true]));
  let bgmFrame = -1;
  const rowFrames: number[] = [];
  let lastRow = 0;
  let endingFrame = -1;
  for (let f = 1; f < 60 * 80 && !g.done; f++) {
    g.step([null, null, null, null]);
    for (const e of g.events) {
      if (e.k === 'bgm' && e.label === 'SQ_BGM_MG1801_A') bgmFrame = f;
      /* 노멀(모드 0)의 종료 BGM 은 FUN_71004421a0 이 SQ_BGM_MG1801_MG_ENDING 을 _A_MG_ENDING 으로 바꾼다 [판독 main @0x71004421a0,
         라벨은 subarc_mg1801.fsst 에 있음]. 이전 시험은 바꾸기 전 이름을 기대했다 */
      if (e.k === 'bgm' && e.label === 'SQ_BGM_MG1801_A_MG_ENDING') endingFrame = f;
    }
    const s = g.state;
    if (s.row !== lastRow) {
      rowFrames.push(f);
      lastRow = s.row;
    }
  }
  const offs = rowFrames.slice(0, 6).map((f) => f - bgmFrame);
  check('줄 0~5 = BGM 시작 + (6+r)·15 프레임', offs.join() === [90, 105, 120, 135, 150, 165].join(), offs.join());
  check('종료 BGM = BGM 시작 + 20마디(40 s, 2400 프레임)', endingFrame - bgmFrame === 2400, `${endingFrame - bgmFrame}`);
}
check('전원 CPU 끝남', allCom.done, `frames ${allCom.result?.frames}`);
const c1 = allCom.result!.counts;
check('전원 CPU 모두 JUST', c1.every((c) => c.just === 26 && c.fast + c.slow + c.miss === 0), JSON.stringify(c1));

const idle = run([false, true, true, true]);
const c2 = idle.result!.counts;
check('1P 무입력 → 1P 전부 놓침', c2[0].miss === 26 && c2[0].just === 0, JSON.stringify(c2[0]));
check('1P 무입력 → 나머지 JUST', c2.slice(1).every((c) => c.just === 26), JSON.stringify(c2.slice(1)));

let wasDown = false;
const perfect = run([false, true, true, true], (g) => {
  const om = (g as unknown as { w: { objectMan: { judgeInput(l: number): { type: number; diff: number } } } }).w.objectMan;
  const j = om.judgeInput(0);
  const want = j.type === 0 && j.diff < 2 && !wasDown;
  wasDown = want;
  return want;
});
const c3 = perfect.result!.counts;
check('1P 판정 시점에 A → 1P 전부 JUST', c3[0].just === 26 && c3[0].miss === 0, JSON.stringify(c3[0]));

const a = new Mg1801Game(setup([true, true, true, true]));
const b = new Mg1801Game(setup([true, true, true, true]));
let same = true;
for (let f = 0; f < 3000; f++) {
  a.step([null, null, null, null]);
  b.step([null, null, null, null]);
  if (JSON.stringify([a.state, a.events]) !== JSON.stringify([b.state, b.events])) {
    same = false;
    break;
  }
}
check('결정성(같은 시드 두 번)', same);

// ------------------------------------------------------------------ 외곽선 안내 [판독: Obj::UpdateOutlineOnOff @0x7100008e40]
{
  /* 점유 규칙: OutlineAloneSize2 && 자르기 ≥ 2 면 레인 0..3 전체, 아니면 자기 레인. 막히면 안 보인다 */
  const g = new Mg1801Game(setup([true, true, true, true]));
  const w = g.world;
  const pool = w.objectMan.pool;
  const tomatoes = pool.filter((o) => o.type === 0);
  const eggplant = pool.find((o) => o.type === 2)!;
  const objs = [tomatoes[0], tomatoes[1], eggplant];
  tomatoes[0].entry(true, 0);
  tomatoes[1].entry(true, 3);
  eggplant.entry(true, 0);
  for (const o of objs) o.update();
  check('외곽선: 토마토 레인 0·3 은 각자 레인을 점유해 보인다', tomatoes[0].view().outline === true && tomatoes[1].view().outline === true);
  check('외곽선: 가지(자르기 3)는 레인 0..3 이 막혀 안 보인다', eggplant.view().outline === false, w.outlinePlace.join());
  check('외곽선: 점유표 = 1,0,0,1', w.outlinePlace.join() === '1,0,0,1', w.outlinePlace.join());
  let f = 0;
  while (tomatoes[0].active && tomatoes[0].elapsed <= 1.75 && f++ < 200) for (const o of objs) o.update();
  /* 낙하 첫 프레임: 토마토 둘이 끄며 레인을 풀고, 막혀 있던 가지가 같은 프레임 끝의 켜기에서 레인 0..3 을 잡는다(원본 특이점) */
  check('외곽선: 낙하하면 토마토는 끄고, 막혀 있던 가지가 그때 켜진다', tomatoes[0].view().outline === false && eggplant.view().outline === true && w.outlinePlace.join() === '1,1,1,1', w.outlinePlace.join());
  for (const o of objs) o.update();
  check('외곽선: 가지도 다음 프레임 낙하 끄기로 레인을 푼다', eggplant.view().outline === false && w.outlinePlace.join() === '0,0,0,0', w.outlinePlace.join());
}
const outlineFrames = (mode: number): number => {
  const g = new Mg1801Game(setup([true, true, true, true]), { mode });
  let n = 0;
  for (let f = 0; f < 6000 && !g.done; f++) {
    g.step([null, null, null, null]);
    if (g.state.objs.some((o) => o.outline)) n++;
  }
  return n;
};
{
  const normal = outlineFrames(0);
  const hard = outlineFrames(2);
  check('외곽선: 노멀(모드 0)은 OBJ1 L 줄에서 보인다', normal > 0, `${normal} 프레임`);
  check('외곽선: 하드(모드 2)는 IsOutLineGuideDispEnable(모드 < 2) 거짓이라 없다', hard === 0, `${hard} 프레임`);
}

// ------------------------------------------------------------------ JUST 판정음 [판독: RmSoundMan::PlayExcellentSe @0x7100426e38]
{
  const g = new Mg1801Game(setup([true, true, true, true]));
  const w = g.world;
  const just = (): { combo: number; play?: boolean } => {
    w.events.length = 0;
    w.playExcellentSe();
    const e = w.events[0] as Extract<Mg1801Event, { k: 'justSound' }>;
    return { combo: e.combo, play: e.play };
  };
  w.setExcellentLimit(120);
  const seq = [just(), just(), just(), just(), just()];
  check('콤보: 같은 프레임 1·2·3·4, 다섯째는 콤보 > 3 이라 새로 1', seq.map((x) => x.combo).join() === '1,2,3,4,1', JSON.stringify(seq));
  check('콤보: 새 재생은 첫째·다섯째뿐', seq.map((x) => (x.play ? 1 : 0)).join() === '1,0,0,0,1');
  w.tickExcellentSe();
  const next = just();
  check('콤보: 반 박 안(1 프레임 뒤)이면 +1, 재생 안 함', next.combo === 2 && next.play === false, JSON.stringify(next));
  for (let i = 0; i < 16; i++) w.tickExcellentSe();
  const fresh = just();
  check('콤보: 반 박(0.25 s) 지나면 새로 1', fresh.combo === 1 && fresh.play === true, JSON.stringify(fresh));
}
{
  /* 실채보: 당근(4 레인)을 CPU 넷이 같은 프레임에 자르면 L0 = 1..4 */
  const g = new Mg1801Game(setup([true, true, true, true]));
  let max = 0;
  let plays = 0;
  let bad4 = false;
  for (let f = 0; f < 6000 && !g.done; f++) {
    g.step([null, null, null, null]);
    const js = g.events.filter((e) => e.k === 'justSound') as Extract<Mg1801Event, { k: 'justSound' }>[];
    if (js.length === 0) continue;
    max = Math.max(max, ...js.map((e) => e.combo));
    if (js[0].play) plays++;
    if (js.length === 4 && js.map((e) => e.combo).join() !== '1,2,3,4') bad4 = true;
  }
  check('콤보(실채보): 최대 L0 = 4, 넷이 같은 프레임이면 1,2,3,4', max === 4 && !bad4, `max ${max}`);
  check('콤보(실채보): 판정 줄의 첫 JUST 는 새로 재생', plays > 0, `${plays}`);
}

// ------------------------------------------------------------------ 모드별 채보·BGM [판독: RmSyncedSetupGame, FUN_7100441990, FUN_71004421a0, FUN_71004429c0]
check('BGM 이름: 리믹스 > 제네릭', gameBgmName(3, 120, false, true) === 'SQ_BGM_RC_REMIX' && gameBgmName(0, 120, false, true) === 'SQ_BGM_RC_GENERIC');
check('BGM 이름: BPM > 120 → _B, 모드 2·chart01 → _C(뒤가 덮음)', gameBgmName(1, 180, false, false) === 'SQ_BGM_MG1801_B' && gameBgmName(2, 180, true, false) === 'SQ_BGM_MG1801_C');
check(
  '종료 BGM 이름: 0 → _A_MG_ENDING, 1·120 → _MG_ENDING, 1·180 → _B_, 2 → _C_',
  endingBgmName(0, 120, false) === 'SQ_BGM_MG1801_A_MG_ENDING' &&
    endingBgmName(1, 120, false) === 'SQ_BGM_MG1801_MG_ENDING' &&
    endingBgmName(1, 180, false) === 'SQ_BGM_MG1801_B_MG_ENDING' &&
    endingBgmName(2, 120, true) === 'SQ_BGM_MG1801_C_MG_ENDING',
);
check(
  '코스 중간 끝 BGM: _A_INTER_END / _B_ / _C_',
  interEndBgmName(1, 120, false) === 'SQ_BGM_MG1801_A_INTER_END' && interEndBgmName(1, 180, false) === 'SQ_BGM_MG1801_B_INTER_END' && interEndBgmName(2, 120, true) === 'SQ_BGM_MG1801_C_INTER_END',
);

interface ModeRun {
  g: Mg1801Game;
  bgm: string[];
  se: Mg1801Event[];
  telop: string[];
  perfect: number[];
}
function runMode(opts: Mg1801Options, com = [true, true, true, true], press?: (g: Mg1801Game) => boolean): ModeRun {
  const g = new Mg1801Game(setup(com), opts);
  const out: ModeRun = { g, bgm: [], se: [], telop: [], perfect: [] };
  for (let f = 0; f < 60 * 120 && !g.done; f++) {
    const p1: PadInput = emptyPad();
    if (press?.(g)) p1.buttons |= NPAD.A;
    g.step([p1, null, null, null]);
    for (const e of g.events) {
      if (e.k === 'bgm') out.bgm.push(e.label);
      if (e.k === 'seLocal' || e.k === 'soundStop' || e.k === 'soundPreset') out.se.push(e);
      if (e.k === 'telop' && e.player < 0) out.telop.push(e.judge);
      if (e.k === 'perfect') out.perfect.push(e.player);
    }
  }
  return out;
}
const table: [string, Mg1801Options, string, number, string[]][] = [
  ['노멀 단독', mg1801Options({ mode: '0' }), 'mg1801_rm_chart00', 120, ['SQ_BGM_RC_MAIN_RHYTHM', 'SQ_BGM_RC_MGCMN_OP', 'SQ_BGM_MG1801_A', 'SQ_BGM_MG1801_A_MG_ENDING', 'SM_AMB_MG1801_MG_RESULT', 'SM_JIN_MG1801_MG_RESULT_GOOD']],
  ['하드 단독', mg1801Options({ mode: '2' }), 'mg1801_rm_chart01', 120, ['SQ_BGM_RC_MAIN_RHYTHM', 'SQ_BGM_RC_MGCMN_OP', 'SQ_BGM_MG1801_C', 'SQ_BGM_MG1801_C_MG_ENDING', 'SM_AMB_MG1801_MG_RESULT', 'SM_JIN_MG1801_MG_RESULT_GOOD']],
  ['롱 1번째', mg1801Options({ mode: '1', longPos: 'rc0' }), 'mg1801_rm_chart00', 120, ['SQ_BGM_RC_MAIN_RHYTHM', 'SQ_BGM_RC_MGCMN_OP', 'SQ_BGM_MG1801_A', 'SQ_BGM_MG1801_A_INTER_END', 'SM_AMB_MG1801_MG_RESULT']],
  ['롱 4번째(스피드 업)', mg1801Options({ mode: '1', longPos: 'rc3' }), 'mg1801_rm_chart00', 180, ['SQ_BGM_RC_MAIN_RHYTHM', 'SQ_BGM_RC_MGCMN_OP', 'SQ_BGM_MG1801_B', 'SQ_BGM_MG1801_B_INTER_END', 'SM_AMB_MG1801_MG_RESULT']],
  ['롱 마지막', mg1801Options({ mode: '1', longPos: 'rc5' }), 'mg1801_rm_chart00', 180, ['SQ_BGM_RC_MAIN_RHYTHM', 'SQ_BGM_RC_MGCMN_OP', 'SQ_BGM_MG1801_B', 'SQ_BGM_MG1801_B_MG_ENDING', 'SM_AMB_MG1801_MG_RESULT', 'SM_JIN_MG1801_MG_RESULT_GOOD']],
  ['리믹스(A 슬롯)', mg1801Options({ mode: '3' }), 'mg1801_rm_chart05s', 120, ['SQ_BGM_RC_MAIN_RHYTHM', 'SQ_BGM_RC_MGCMN_OP', 'SQ_BGM_RC_REMIX']],
];
for (const [name, opts, chart, bpm, bgm] of table) {
  const r = runMode(opts);
  const s = r.g.state;
  check(`모드 ${name}: 채보 ${chart}, BPM ${bpm}, mode ${opts.mode}`, s.chart === chart && s.bpm === bpm && s.mode === opts.mode, `${s.chart} ${s.bpm} ${s.mode}`);
  check(`모드 ${name}: BGM 순서`, r.bgm.join() === bgm.join(), r.bgm.join());
  check(`모드 ${name}: 끝남·전원 JUST`, r.g.done && r.g.result!.counts.every((c) => c.miss === 0 && c.fast + c.slow === 0), `${r.g.done}`);
  const rc = s.course !== null;
  check(`모드 ${name}: 시작·끝 텔롭은 리듬 쿠킹이 아닐 때만`, r.telop.join() === (rc ? '' : 'START,FINISH'), r.telop.join());
}

// ------------------------------------------------------------------ PERFECT [판독: FUN_710043af00, RmCmnParamMan+0x30 기본 1 → COM 제외]
{
  const com = runMode({ mode: 0 });
  check('PERFECT: 전원 CPU 는 점수 = 최대지만 텔롭은 COM 제외라 없음', com.perfect.length === 0 && com.g.result!.perfect!.every((x) => x), JSON.stringify(com.g.result!.perfect));
  let down = false;
  const press = (g: Mg1801Game): boolean => {
    const j = g.world.objectMan.judgeInput(0);
    const want = j.type === 0 && j.diff < 2 && !down;
    down = want;
    return want;
  };
  const hit = runMode({ mode: 0 }, [false, true, true, true], press);
  check('PERFECT: 1P 사람 전부 JUST → 1P 텔롭(이벤트 player 0), state.perfect[0]', hit.perfect.join() === '0' && hit.g.state.perfect![0] === true, hit.perfect.join());
  const miss = runMode({ mode: 0 }, [false, true, true, true]);
  check('PERFECT: 1P 무입력이면 없음', miss.perfect.length === 0 && miss.g.result!.perfect![0] === false);
  down = false;
  const rc = runMode(mg1801Options({ mode: '0', course: 'rc2' }), [false, true, true, true], press);
  check('PERFECT: 리듬 쿠킹(+0x1C == 1)은 텔롭 없음', rc.perfect.length === 0 && rc.g.result!.perfect![0] === true);
}

// ------------------------------------------------------------------ 결과 흐름 [판독: OnGameEnd/EndingBefore/OnGameEnding, FUN_7100447a90]
{
  const none = runMode({ mode: 0 }, [false, false, false, false]);
  const cheer = none.se.find((e) => e.k === 'seLocal') as Extract<Mg1801Event, { k: 'seLocal' }> | undefined;
  check('앰비언트: 달성률/20 < 0.1 이면 생략, 환호는 그대로(L5 = 0)', !none.bgm.includes('SM_AMB_MG1801_MG_RESULT') && cheer?.label === 'SQ_SE_RC_CHEER_MG_FIN' && cheer.value === 0, none.bgm.join());
  check('징글: 별 판정 ≤ 1 → BAD', none.bgm.includes('SM_JIN_MG1801_MG_RESULT_BAD'));
  check('결과: 별 0 → 패배 모션 co_lose00a→b', none.g.state.players.every((p) => p.resultMotion?.name === 'co_lose00a' && p.resultMotion.next === 'co_lose00b'));
  const all = runMode({ mode: 0 });
  const c2c = all.se.find((e) => e.k === 'seLocal') as Extract<Mg1801Event, { k: 'seLocal' }> | undefined;
  check('환호: L5 = (int)달성률 = 100', c2c?.value === 100, JSON.stringify(c2c));
  const stops = all.se.filter((e) => e.k === 'soundStop').map((e) => (e as Extract<Mg1801Event, { k: 'soundStop' }>).label);
  check('단계 9: 게임 BGM·마스터·OP 만 멈춘다(종료 BGM 은 계속)', stops.join() === 'SQ_BGM_MG1801_A,SQ_BGM_RC_MAIN_RHYTHM,SQ_BGM_RC_MGCMN_OP', stops.join());
  const mid = runMode(mg1801Options({ mode: '1', longPos: 'rc0' }));
  const c3c = mid.se.find((e) => e.k === 'seLocal') as Extract<Mg1801Event, { k: 'seLocal' }> | undefined;
  check('코스 중간(+0x2C ≠ 0): 환호 SQ_SE_RC_CHEER_MG, 징글 없음, 결과 모션 rc_pract_idle00', c3c?.label === 'SQ_SE_RC_CHEER_MG' && !mid.bgm.some((x) => x.startsWith('SM_JIN')) && mid.g.state.players[0].resultMotion?.name === 'rc_pract_idle00');
}
{
  /* 시각: 페이드아웃 20 → (0,6) 결과 카메라 → 다음 프레임 결과 시작 → 페이드인 20 → 징글 → 0.5/PlayRate s 뒤 끝 */
  const g = new Mg1801Game(setup([true, true, true, true]));
  const t: Record<string, number> = {};
  for (let f = 1; f < 6000 && !g.done; f++) {
    g.step([null, null, null, null]);
    const s = g.state;
    if (s.flow === 10 && t.end === undefined) t.end = f;
    if (s.camera === 'result' && t.cam === undefined) t.cam = f;
    if (s.players[0].resultMotion && t.res === undefined) t.res = f;
    for (const e of g.events) {
      if (e.k === 'bgm' && e.label === 'SM_AMB_MG1801_MG_RESULT') t.amb = f;
      if (e.k === 'bgm' && e.label.startsWith('SM_JIN')) t.jin = f;
    }
    if (g.done) t.done = f;
  }
  const rel = [t.cam - t.end, t.res - t.cam, t.amb - t.res, t.jin - t.res, t.done - t.jin];
  /* 끝 = 결과 점수판 시작(+30) + 점수판 람다 길이(@0x71004495f0: 0.5 s + 1프레임 + 0.5 s + 3.0 s = 241프레임). 이전 기대값 +30 은 점수판 시작에서 끊던 웹 단순화였다 */
  check('결과 시각: (0,6) = 페이드아웃 +20, 결과 시작 +1, 앰비언트 +7(0.1 s 넘김), 징글 +21(페이드인 20), 끝 +271(점수판 30 + 241)', rel.join() === '20,1,7,21,271', rel.join());
  const s = g.state;
  check('결과: 별 3 → 승리 모션 co_win00a→b', s.players.every((p) => p.resultMotion?.name === 'co_win00a' && p.resultMotion.next === 'co_win00b'));
  check('결과: 머리 시선은 결과 카메라(0,5.5,20)', s.players.every((p) => p.head?.target?.z === 20 && p.look?.head === true));
}

// ------------------------------------------------------------------ NPC·머리 추적 [판독: MapImpl::ReceiveState, UpdateHeadControl, GetHeadTarget]
{
  const g = new Mg1801Game(setup([true, true, true, true]));
  const seen: string[] = [];
  let headOn = 0;
  let headXOk = true;
  for (let f = 0; f < 6000 && !g.done; f++) {
    g.step([null, null, null, null]);
    const n = g.state.npc!;
    const key = `${n.motion}/${n.speed}/${n.visible}`;
    if (seen[seen.length - 1] !== key) seen.push(key);
    for (const p of g.state.players) {
      if (g.state.phase === 'main' && p.head?.target) {
        headOn++;
        if (p.head.target.x !== p.pos.x) headXOk = false;
      }
    }
  }
  check('NPC: co_idle00(180/60 = 3) → TopStart co_joyful02(60/60) → ChartEnd co_idle00 → (0,6) 숨김', seen.join(' ') === 'co_idle00/3/true co_joyful02/1/true co_idle00/3/true co_idle00/3/false', seen.join(' '));
  check('머리 추적: 본편에 목표가 생기고 x 는 플레이어 x', headOn > 0 && headXOk, `${headOn}`);
}

// ------------------------------------------------------------------ 단계 0~3 [판독: OnGameMain 단계 0·1·2·3]
{
  const g = new Mg1801Game(setup([true, true, true, true]));
  const count: number[] = [];
  let startAfter = -1;
  let stage3 = -1;
  let bgm = -1;
  let bgmRequest = -1;
  const master: string[] = [];
  for (let f = 1; f < 600; f++) {
    g.step([null, null, null, null]);
    if (g.state.flow === 8 && startAfter < 0) startAfter = f;
    if (g.state.stage === 3 && stage3 < 0) stage3 = f;
    for (const e of g.events) {
      if (e.k === 'se' && e.label === 'SQ_SE_MG1800_COUNT_STICK') count.push(f);
      if (e.k === 'bgm' && e.label === 'SQ_BGM_MG1801_A') bgm = f;
      if (e.k === 'se' && e.label === 'SQ_BGM_MG1801_A') bgmRequest = f;
      if (e.k === 'bgm' && e.label.startsWith('SQ_BGM_RC_')) master.push(`${f}:${e.label}`);
    }
  }
  /* OnGameStartAfter @0x7100443fa8 첫 줄 FUN_71004263c8: MAIN_RHYTHM 다음 MGCMN_OP, 그 프레임 한 번 [판독] */
  check('OnGameStartAfter 프레임에 마스터·OP(이 순서) 한 번', master.join() === `${startAfter}:SQ_BGM_RC_MAIN_RHYTHM,${startAfter}:SQ_BGM_RC_MGCMN_OP`, master.join());
  /* 단계 2 의 재생 요청 FUN_7100426948 [판독] */
  check('게임 BGM 재생 요청(se)은 단계 2 프레임(= 카운트 첫 번째)', bgmRequest === stage3 && bgmRequest === count[0], `${bgmRequest} ${stage3}`);
  check('단계 0~1: 와이프 없음(미니게임 모드)이면 마스터 0 마디 4박에 단계 2, 1 마디 1박에 연습 시작(OnGameStartAfter + 121)', stage3 - startAfter === 121, `${stage3 - startAfter}`);
  check('단계 2→3: 카운트 SE 첫 번째가 연습 시작 프레임에, 박마다 4회', count.length === 4 && count[0] === stage3 && count[3] - count[0] === 90, count.join());
  check('게임 BGM: 다음 마디 첫 틱(카운트 첫 번째 + 1 마디)', bgm - count[0] === 120, `${bgm - count[0]}`);
}
{
  /* 리듬 쿠킹 컨트롤 안내 와이프(길이 미판독)를 넣으면 4박 넘게 떠 있을 때 SQ_BGM_RC_CALIBRATION */
  const g = new Mg1801Game(setup([true, true, true, true]), { mode: 0, course: { index: 0, count: 3 }, controlWipeFrames: 400 });
  const cal: number[] = [];
  for (let f = 1; f < 900; f++) {
    g.step([null, null, null, null]);
    for (const e of g.events) if (e.k === 'bgm' && e.label === 'SQ_BGM_RC_CALIBRATION') cal.push(f);
  }
  check('컨트롤 와이프: 4박 넘으면 SQ_BGM_RC_CALIBRATION 한 번(6 s 핸들 동안 다시 안 냄)', cal.length === 1, cal.join());
  check('컨트롤 와이프: 끝난 뒤 단계 2 로', g.state.stage >= 3, `${g.state.stage}`);
}

// ------------------------------------------------------------------ 사운드 관측(원본: 게임이 시퀀서가 쓴 G14·G12·게임 BGM L0 을 읽는다)
/**
 * 시험용 사운드 쪽 흉내 — 브라우저의 view/sound.ts 가 주는 관측을 같은 규칙으로 만든다 [데이터: 02_rhythm.md 5.1·5.3]:
 * 마스터는 시작 사건을 처리한 시각에 틱 0, 틱 1 부터 G14 = 1..16(24틱마다), 0 마디 첫 틱에 G12 = 1(오프닝).
 * 리듬 BGM 요청(se)은 처리 시각의 틱이 마디 안 376 전이면 다음 마디, 아니면 다다음 마디 첫 틱에 G12 = 곡, 그 뒤 192틱에 L0 = 1.
 * lag = 관측이 소리 처리보다 늦는 프레임(브라우저의 출력 지연 보정과 같은 꼴: 스텝은 들리는 시각을 읽고, 요청은 지금 처리된다).
 * 곡 ID 는 라벨마다 다른 수면 된다(게임은 요청 때 값과 다른지만 본다).
 */
class SoundSim {
  private start = -1;
  private readonly reqs: { label: string; id: number; tick: number }[] = [];
  private readonly tickF: number;
  constructor(
    bpm: number,
    private readonly lag = 0,
  ) {
    this.tickF = (60 / bpm / 96) * 60;
  }

  private tickAt(frames: number): number {
    return frames < 0 ? -1 : Math.floor(frames / this.tickF + 1e-9);
  }

  /** 스텝 step(1 부터)에 줄 관측(마스터 전이면 null) */
  snapshot(step: number): SoundSnapshot | null {
    if (this.start < 0) return null;
    const t = this.tickAt(step - this.start - this.lag);
    const g = new Array<number>(16).fill(-1);
    if (t >= 1) {
      g[14] = (Math.floor((t - 1) / 24) % 16) + 1;
      g[12] = 1;
    }
    const locals: Record<string, number[]> = {};
    for (const r of this.reqs) {
      if (t >= r.tick) g[12] = r.id;
      locals[r.label] = [t < r.tick ? -1 : t < r.tick + 192 ? 0 : 1];
    }
    return { time: step / 60, globals: g, locals };
  }

  /** 스텝 step 의 사건을 소리 쪽이 처리한다(지금 시각 = 지연 없는 틱) */
  onEvents(step: number, events: readonly Mg1801Event[]): void {
    for (const e of events) {
      if (e.k === 'bgm' && e.label === 'SQ_BGM_RC_MAIN_RHYTHM') this.start = step;
      if (e.k === 'se' && e.label.startsWith('SQ_BGM_') && this.start >= 0) {
        const t = this.tickAt(step - this.start);
        const bar = t < 1 ? 0 : Math.floor((t - 1) / 384);
        const at = t < 1 ? 1 : 1 + 384 * ((t - 1) % 384 < 376 ? bar + 1 : bar + 2);
        this.reqs.push({ label: e.label, id: 1000 + this.reqs.length, tick: at });
      }
    }
  }
}

function runObserved(lag: number | null, opts: Mg1801Options = {}): { g: Mg1801Game; trace: string[]; rows: number[]; bgm: number; ending: number } {
  const g = new Mg1801Game(setup([true, true, true, true]), opts);
  const sim = lag === null ? null : new SoundSim(g.cfg.bpm, lag);
  const trace: string[] = [];
  const rows: number[] = [];
  let lastRow = 0;
  let bgm = -1;
  let ending = -1;
  for (let f = 1; f < 60 * 150 && !g.done; f++) {
    g.step([null, null, null, null], sim?.snapshot(f) ?? null);
    sim?.onEvents(f, g.events);
    trace.push(JSON.stringify([g.state, g.events]));
    if (g.state.row !== lastRow) {
      rows.push(f);
      lastRow = g.state.row;
    }
    for (const e of g.events) {
      if (e.k === 'bgm' && e.label === g.state.bgmLabel) bgm = f;
      if (e.k === 'bgm' && e.label.endsWith('_MG_ENDING')) ending = f;
    }
  }
  return { g, trace, rows, bgm, ending };
}
{
  /* 관측이 프레임 모델과 같은 시각이면(지연 0) 단계 전이(G12 변화로 접수, L0 로 인트로, G12 변화로 종료 BGM 접수)·줄 배분이 프레임마다 같다 */
  const frame = runObserved(null);
  const obs0 = runObserved(0);
  const first = frame.trace.findIndex((x, i) => x !== obs0.trace[i]);
  check('관측(지연 0) = 프레임 모델: 매 프레임 state·events 같음', first < 0 && frame.trace.length === obs0.trace.length, `${first} ${frame.trace.length}/${obs0.trace.length}`);
  /* 관측이 3 프레임 늦으면(출력 지연 50 ms) 게임 BGM 접수·줄 배분·종료가 모두 3 프레임 늦고 판정은 그대로 */
  const obs3 = runObserved(3);
  const shifted = obs3.rows.length === frame.rows.length && obs3.rows.every((f, i) => f === frame.rows[i] + 3);
  check('관측 3 프레임 늦음: 줄 배분이 모두 +3 프레임', shifted, `${obs3.rows.slice(0, 4).join()} / ${frame.rows.slice(0, 4).join()}`);
  check('관측 3 프레임 늦음: 게임 BGM·종료 BGM 접수 +3 프레임', obs3.bgm === frame.bgm + 3 && obs3.ending === frame.ending + 3, `${obs3.bgm - frame.bgm} ${obs3.ending - frame.ending}`);
  check(
    '관측 3 프레임 늦음: 끝남·전원 JUST, 길이 +3',
    obs3.g.done && obs3.g.result!.counts.every((c) => c.just === 26 && c.miss + c.fast + c.slow === 0) && obs3.g.result!.frames === frame.g.result!.frames + 3,
    `${obs3.g.result?.frames} ${frame.g.result?.frames}`,
  );
  /* 롱 4번째(BPM 180, _B·_B_INTER_END)도 관측 지연 0 이면 같다 */
  const f180 = runObserved(null, { mode: 1, course: { index: 3, count: 6 } });
  const o180 = runObserved(0, { mode: 1, course: { index: 3, count: 6 } });
  check('관측(지연 0) = 프레임 모델: 롱 BPM 180 코스 중간', f180.trace.join('\n') === o180.trace.join('\n'), `${f180.trace.length}/${o180.trace.length}`);
  const fr3 = runObserved(null, { mode: 3 });
  const or3 = runObserved(0, { mode: 3 });
  check('관측(지연 0) = 프레임 모델: 리믹스', fr3.trace.join('\n') === or3.trace.join('\n'), `${fr3.trace.length}/${or3.trace.length}`);
}
{
  /* 게임 BGM 접수는 G12 가 "요청 때 읽은 값"에서 바뀔 때다(FUN_7100426b8c) — 소리 쪽이 늦게 받아 한 마디 뒤에 접수하면 로직도 그 마디를 따른다 */
  const g = new Mg1801Game(setup([true, true, true, true]));
  const sim = new SoundSim(120, 0);
  let req = -1;
  let acc = -1;
  for (let f = 1; f < 900 && acc < 0; f++) {
    g.step([null, null, null, null], sim.snapshot(f));
    /* 요청을 소리 쪽에 118 프레임(376틱 = 117.5 프레임 넘게) 늦게 넘긴다 = 소리가 그 마디 ENDPLAY_CHECK 를 지난 뒤 받은 꼴 */
    if (req < 0 && g.events.some((e) => e.k === 'se' && e.label === 'SQ_BGM_MG1801_A')) req = f;
    sim.onEvents(f, req > 0 && f === req ? g.events.filter((e) => e.k !== 'se' || !e.label.startsWith('SQ_BGM_')) : g.events);
    if (req > 0 && f === req + 118) sim.onEvents(f, [{ k: 'se', label: 'SQ_BGM_MG1801_A' }]);
    if (g.events.some((e) => e.k === 'bgm' && e.label === 'SQ_BGM_MG1801_A')) acc = f;
  }
  check('G12 접수: 소리 쪽이 다다음 마디에 접수하면 로직도 그때(요청 + 2 마디 = 240 프레임)', acc - req === 240, `${acc - req}`);
}

{
  const r = fmabRepeatBad(fileURLToPath(new URL('../assets/mg1801/model/mg1801_water00.fmab.json', import.meta.url)), [
    ['mt_water00', 'texture_srt1', '0x10', 0, 1199],
    ['mt_water00', 'utility_parameter0', '0x04', -1, 300],
  ]);
  check('물 fmab Repeat 커브 2개가 구간 뒤에도 반복(원본 wrap — 변환기 Curves.cs, plaza_3d.md §6.14 #14c ③)', r.length === 0, r.join(' · '));
}

process.exitCode = bad ? 1 : 0;
