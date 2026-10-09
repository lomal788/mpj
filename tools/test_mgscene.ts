/**
 * 미니게임 공용 틀(shell/mgscene) 시험 — 노드, 헤드리스 없음. 설계·근거: docs/shell/minigame_scene.md §12.
 * 1) 표 열거 변환  2) 일반 흐름 단계 순서·프레임(와이프 20·텔롭 60·120 프레임)  3) 텔롭·SE·BGM 사건 프레임
 * 4) 오프닝 건너뛰기  5) 종료 타이머(30초 표시·5초 경고음·만료 → 10)  6) 설명 화면 반복(4프레임)·InstLoop Result
 * 7) 결과 갈래 A(가짜 무대 계약)·B(엔딩 5단계·승리 텔롭)  8) 프레임 게이트(멈춤 → 상태·타이머·난수 그대로, 다시 열면 이어서)
 * 9) 경계(import 0)·미리 받기 파일 존재  10) 더미 게임 처음부터 끝까지
 *
 *   npx tsx tools/test_mgscene.ts            (먼저 web/tools/analysis/mgscene_web_assets.py)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BexRandModule } from '@game/core/rng';
import { createDummyGame } from '../script/games/mgdummy/logic';
import {
  localGate,
  MgScene,
  mgscenePrefetch,
  mgUiData,
  MgTelop,
  MG_DT,
  ONESHOT_FINISH,
  ONESHOT_START,
  STAGE_END,
  type FrameGate,
  type MgPadInput,
  type MgSceneEvent,
  type MgSceneSetup,
  type MgTables,
  type ResultStage,
  type ResultStageHost,
  type ResultStageInput,
} from '../script/shell/mgscene';
import { freePlayJudgeType, minigameResultEntry, type MgGame, type MgSceneContext } from '../script/shell/mgscene';
import { WIPE_WHITE } from '@game/lib/transition';
import type { GameLogic, GameSetup } from '../script/game';
import { determinismCheck, staticLogicCheck } from './mg_determinism';
import { NodeMgRun } from './mg_node_host';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = path.join(WEB, 'assets');
const ui = JSON.parse(fs.readFileSync(path.join(A, 'mgscene/ui.json'), 'utf8'));
const tables = JSON.parse(fs.readFileSync(path.join(A, 'mgscene/tables.json'), 'utf8')) as MgTables;
const uiData = mgUiData(ui);

let count = 0;
let fails = 0;
const ok = (cond: boolean, msg: string, detail = ''): void => {
  count++;
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}${detail ? `  — ${detail}` : ''}`);
};
const F = Math.fround;

const PLAYERS = [
  { pid: 0, chara: 'pc01', isCom: false, teamId: 0, order: 0 },
  { pid: 1, chara: 'pc02', isCom: true, teamId: 1, order: 1 },
  { pid: 2, chara: 'pc03', isCom: true, teamId: 2, order: 2 },
  { pid: 3, chara: 'pc06', isCom: true, teamId: 3, order: 3 },
];

function rng(seed: number): { u32(): number; calls(): number } {
  const r = new BexRandModule(seed);
  r.setSyncRandSeed(r.rand());
  return { u32: () => r.sync.nextU32(), calls: () => r.sync.calls };
}

interface Run {
  scene: MgScene;
  game: ReturnType<typeof createDummyGame>;
  rand: ReturnType<typeof rng>;
  pads: (MgPadInput | null)[];
}

function make(o: Partial<MgSceneSetup> & { mainFrames?: number; openingFrames?: number; useResultStage?: boolean; gate?: (pads: () => (MgPadInput | null)[]) => FrameGate } = {}): Run {
  const rand = rng(o.seed ?? 1234);
  const game = createDummyGame({ mainFrames: o.mainFrames ?? 300, openingFrames: o.openingFrames ?? 30, useResultStage: !!o.useResultStage });
  const pads: (MgPadInput | null)[] = [null, null, null, null];
  const read = (): (MgPadInput | null)[] => pads;
  const gate = o.gate ? o.gate(read) : localGate(read);
  const scene = new MgScene(
    {
      mgId: o.mgId ?? 'mg0101',
      players: PLAYERS,
      seed: o.seed ?? 1234,
      rand,
      tables,
      ui: uiData,
      inst: o.inst,
      settingOverride: o.settingOverride,
      createResultStage: o.createResultStage,
      resultHost: { gl: null, url: (p: string) => p },
    },
    game,
    gate,
  );
  return { scene, game, rand, pads };
}

function runToEnd(r: Run, max = 20000, each?: (r: Run) => void): void {
  for (let i = 0; i < max && r.scene.stage !== STAGE_END; i++) {
    each?.(r);
    r.scene.tick();
  }
}

const events = (s: MgScene, k: MgSceneEvent['k']): [number, MgSceneEvent][] => s.log.filter(([, e]) => e.k === k);
const seFrames = (s: MgScene, label: string): number[] => s.log.filter(([, e]) => (e.k === 'se' || e.k === 'voice') && e.label === label).map(([f]) => f);

// ---------------------------------------------------------------- 1) 표
{
  const s = tables.mgSetting;
  ok(s.mg0101.statusFace === 0 && s.mg0101.statusIn === 0 && s.mg0101.statusOut === 2, '표: mg0101 StatusFace Corner=0, In Telop=0, Out FadeOut=2');
  ok(s.mg0102.gameEndTimerPos === 1 && s.mg0102.gameEndTime === 180, '표: mg0102 GameEndTimerPos TC=1, 180초');
  ok(s.mg0106.endlessGameEndTimerPos === 6 && s.mg0106.endlessEndTime === 600, '표: mg0106 Endless 위치 BL=6, 600초');
  ok(tables.mgList.mg0508.gameRule === 1 && tables.mgList.mg0101.gameRule === 0, '표: GameRule 2VS2=1, VS4=0');
  const loopResult = Object.entries(s).filter(([, r]) => r.instLoop === 1).map(([k]) => k);
  ok(loopResult.join() === 'mg1601', '표: InstLoopTiming Result = mg1601 하나', loopResult.join());
  ok(tables.mgSound.mg0101.bgmPos === 2 && tables.mgSound.mg0101.bgmOffset === 614 && tables.mgSound.mg0101.bgm === 'SM_BGM_MG0101_JMP', '표: mg0101 BGM scene_start=2·614 프레임');
  ok(uiData.anims.wipe.WipeBlack_out.frames === 20 && uiData.anims.sys_tlp_start_00.in.frames === 20 && uiData.anims.sys_tlp_start_00.out.frames === 15, '애니 길이: 와이프 20, START in 20·out 15');
  ok(!!uiData.boxes.sys_timer_00 && uiData.boxes.sys_timer_00.size[0] === 280, '타이머 x_bd_00 280×170', JSON.stringify(uiData.boxes.sys_timer_00));
}

// oneshot 틱 수(f32 누적)
let oneshotTicks = 0;
let finishTicks = 0;
{
  let t = 0;
  while (true) {
    oneshotTicks++;
    t = F(t + MG_DT);
    if (ONESHOT_START <= t) break;
  }
  ok(oneshotTicks === 25, 'START oneshot 0.41667 초 = 25 틱(f32 누적)', String(oneshotTicks));
  t = 0;
  while (true) {
    finishTicks++;
    t = F(t + MG_DT);
    if (ONESHOT_FINISH <= t) break;
  }
  ok(finishTicks === 86, 'FINISH oneshot 1.41667 초 = 86 틱(f32 누적 1/60 이 85 틱에서 모자람)', String(finishTicks));
}

// ---------------------------------------------------------------- 2·3) 일반 흐름
{
  const r = make({ mainFrames: 300, openingFrames: 30 });
  runToEnd(r);
  const seq = r.scene.stageLog.map(([, s]) => s);
  ok(seq.join(',') === '3,4,6,7,8,9,10,11,12,13,14,16,17,19', '일반 흐름 단계 순서(P=0): 1→3→4→6→7→8→9→10→11→12→13→14→16→17→끝', seq.join(','));
  const at = (st: number): number => r.scene.stageLog.find(([, s]) => s === st)![0];
  ok(at(4) - at(3) === 1 + 20 + 1, '단계 3 첫 페이드: (다음 프레임 처리기) + 와이프 in 20 틱 + (끝을 본 다음 프레임) = 22', String(at(4) - at(3)));
  ok(at(6) - at(4) === 30, '단계 4 오프닝: 더미 오프닝 30 프레임', String(at(6) - at(4)));
  ok(at(7) - at(6) === 1, '단계 6: 건너뛰지 않으면 1 프레임', String(at(7) - at(6)));
  const telop = 20 + oneshotTicks + 15;
  ok(at(8) - at(7) === 1 + telop + 1, `단계 7: START in 20 + normal ${oneshotTicks} + out 15 = ${telop} 틱 (+1·+1) → 8`, String(at(8) - at(7)));
  ok(at(10) - at(9) === 300, '단계 9 본편 300 프레임', String(at(10) - at(9)));
  const startVoice = seFrames(r.scene, 'WD_VOI_LOC_SYS_START');
  ok(startVoice.length === 1 && startVoice[0] === at(7) + 1, 'START 보이스·SE = 텔롭 in 프레임 0(단계 7 처리기 첫 프레임)', String(startVoice));
  const whistle = seFrames(r.scene, 'SQ_SE_SYS_WHISTLE');
  ok(whistle.length === 1 && whistle[0] === at(8), '호루라기(whistle_entry_type 0) = 텔롭 끝 프레임', `${whistle} / ${at(8)}`);
  const finishLen = 20 + finishTicks + 15;
  ok(at(12) - at(11) === 1 + finishLen + 1, `단계 11: FINISH in 20 + normal ${finishTicks} + out 15 = ${finishLen} 틱 (+1·+1), EndSeqWaitTime 0`, String(at(12) - at(11)));
  ok(seFrames(r.scene, 'WD_VOI_LOC_SYS_FINISH')[0] === at(11) + 1, 'FINISH 보이스 = 단계 11 처리기 첫 프레임');
  ok(events(r.scene, 'bgm').length === 0, '오프닝 30 프레임: MG BGM(614 프레임 지연)은 종료 텔롭의 정지(대기 중 해제) 때문에 울리지 않는다');
  const ui = r.scene.uiMgr.log.map(([k, n]) => `${k}${n}`).join(',');
  ok(ui === 'in0,in1,out0,out1,in2', 'MGUiMgr 시점: In0(텔롭 전)·In1(본편)·Out0·Out1·In2(엔딩 3; 컷 전환 없음이라 Out2 없음)', ui);
  ok(at(14) - at(13) === 1, '단계 13 결과 시작 1 프레임(갈래 B)', String(at(14) - at(13)));
  ok(r.scene.branch === 'B', '갈래 B(SetPlayer 없음)');
  const winVoice = r.scene.log.filter(([, e]) => e.k === 'voice' && e.label.startsWith('WD_VOI_LOC_SYS_WINNER'));
  ok(winVoice.length === 1, '승리 텔롭 보이스 1번(CreateWinTelop)', JSON.stringify(winVoice));
  const jingle = events(r.scene, 'jingle');
  ok(jingle.length === 0, '갈래 B·컷 전환 없음·result_jingle start(0): 기반 클래스는 결과 징글을 내지 않는다(텔롭 시점 1 아님)', JSON.stringify(jingle));
  const last = at(17) - at(16);
  ok(last === 22, '단계 16 마지막 페이드: 1 + out 20 틱 + 1 → 17', String(last));
  ok(r.scene.status !== null && r.scene.status.layer.layout === 'sys_mgstat_pos4_00', '상태 얼굴 mg0101 Corner(0) → sys_mgstat_pos4_00', r.scene.status?.layer.layout);
  ok(r.scene.status !== null && r.scene.status.state === 1, '갈래 B·EndingChangeCut 0: 엔딩 0(TimingOut 2)을 건너뛰므로 상태 얼굴(Out FadeOut)은 엔딩 동안 남는다(원본 기반 클래스 그대로)');
  const ranks = r.scene.players.map((p) => p.rank).join(',');
  ok(r.scene.players.every((p) => p.rank >= 0 && p.winLose >= 0), '결과 기록(순위·승패) = OnEndingInit', ranks);
}


// ---------------------------------------------------------------- 3b) MG BGM 시점(오프닝이 지연보다 긴 경우·건너뛰기)
{
  const r = make({ mainFrames: 120, openingFrames: 700 });
  runToEnd(r);
  const bgm = events(r.scene, 'bgm');
  let tb = F(614 / 60);
  let fb = 1;
  while (tb > 0) {
    fb++;
    tb = F(tb - MG_DT);
  }
  ok(bgm.length === 1 && bgm[0][0] === fb && (bgm[0][1] as { label: string }).label === 'SM_BGM_MG0101_JMP', `MG BGM = 단계 3 첫 프레임(1) + 614/60 초를 dt 로 뺀 프레임 ${fb}`, JSON.stringify(bgm));
  const at11 = r.scene.stageLog.find(([, s]) => s === 11)![0];
  const stop = events(r.scene, 'bgmStop');
  ok(stop.length === 1 && stop[0][0] === at11 + 1 && (stop[0][1] as { fadeSec: number }).fadeSec === 0.7, 'BGM 정지 = 종료 텔롭 시작 프레임, FADE_TIME_02 0.7 초', JSON.stringify(stop));
  const s2 = make({ mainFrames: 60, openingFrames: 2000 });
  let pressed = -1;
  runToEnd(s2, 20000, (x) => {
    x.pads[0] = x.scene.stage === 4 && x.scene.sub === 1 && pressed < 0 && x.scene.frame >= 100 ? { buttons: 1 << 11, lx: 0, ly: 0, rx: 0, ry: 0 } : null;
    if (x.pads[0]) pressed = x.scene.frame;
  });
  const b2 = events(s2.scene, 'bgm');
  const at7 = s2.scene.stageLog.find(([, s]) => s === 7)![0];
  ok(b2.length === 1 && b2[0][0] === at7 + 1 && (b2[0][1] as { region: string | null }).region === 'REG_SEQ_MAIN', '건너뛰면 BGM 은 시작 텔롭(위치 0)에서 즉시 + 리전 REG_SEQ_MAIN', JSON.stringify(b2));
}

// ---------------------------------------------------------------- 4) 오프닝 건너뛰기
{
  const r = make({ mainFrames: 60, openingFrames: 600 });
  let pressed = -1;
  runToEnd(r, 20000, (x) => {
    if (x.scene.stage === 4 && x.scene.sub === 1 && pressed < 0 && x.scene.frame >= 40) {
      x.pads[0] = { buttons: 1 << 10, lx: 0, ly: 0, rx: 0, ry: 0 };
      pressed = x.scene.frame;
    } else x.pads[0] = null;
  });
  const seq = r.scene.stageLog.map(([, s]) => s).join(',');
  ok(seq.startsWith('3,4,5,6,7,8,9'), '건너뛰기: 4 → 5 → 6 → 7', seq);
  const at = (st: number): number => r.scene.stageLog.find(([, s]) => s === st)![0];
  ok(seFrames(r.scene, 'SQ_SE_SYS_SKIP')[0] === pressed, 'SQ_SE_SYS_SKIP = + 누른 프레임', `${seFrames(r.scene, 'SQ_SE_SYS_SKIP')} / ${pressed}`);
  ok(at(5) - pressed === 21, '건너뛰기 페이드아웃 20 틱 뒤 훅 참 → 5', String(at(5) - pressed));
  ok(at(7) - at(6) === 22, '단계 6: 건너뛰었으면 1 + 페이드인 20 틱 + 1 → 7', String(at(7) - at(6)));
  const gs = events(r.scene, 'groupStop')[0];
  ok(!!gs && gs[0] === pressed, '소리 그룹 0.3 초 정지 사건', JSON.stringify(gs));
  ok(r.scene.skipped && r.game.ctx!.isOpeningSkip(), 'IsOpeningSkip 참');
}

// ---------------------------------------------------------------- 5) 종료 타이머
{
  const r = make({ mgId: 'mg0102', mainFrames: 0, settingOverride: { gameEndTime: 35 } });
  let inFrame = -1;
  let shownAtIn = -1;
  runToEnd(r, 20000, (x) => {
    const t = x.scene.endTimer?.timer;
    if (t && inFrame < 0 && t.disp === 1) {
      inFrame = x.scene.frame;
      shownAtIn = t.displayValue;
    }
  });
  const t = r.scene.endTimer!.timer;
  ok(t.layer.layout === 'sys_timer_00' && t.layer.pos.y > 0 && t.layer.pos.x === 0, '타이머 TC(1): 가운데 위', JSON.stringify(t.layer.pos));
  ok(shownAtIn === 30 || shownAtIn === 29, '남은 30 초 이하에서 In(표시 정수 trunc)', String(shownAtIn));
  const cd = seFrames(r.scene, 'SQ_SE_SYS_MG_COUNT_TIMER');
  ok(cd.length === 5, '경고음 5번(남은 ≤ 5 초에서 정수가 바뀔 때: 4·3·2·1·0)', String(cd.map((f) => f - cd[0])));
  ok(cd.length >= 2 && cd[1] - cd[0] === 60, '경고음 간격 60 프레임');
  const seq = r.scene.stageLog.map(([, s]) => s).join(',');
  ok(seq.includes('9,10,11'), '만료 → OnThreeMinTimerEnd → 단계 10(본편이 끝나지 않아도)', seq);
  ok(t.layer.anim === 'out_red' || t.disp === 0, '만료 Out = out_red(남은 ≤ 경고 초)', `${t.layer.anim} ${t.disp}`);
}

// ---------------------------------------------------------------- 6) 설명 화면(P)
{
  const r = make({ inst: true, mainFrames: 30 });
  for (let i = 0; i < 2000 && r.scene.retry < 2; i++) r.scene.tick();
  const seq = r.scene.stageLog.map(([, s]) => s).join(',');
  ok(seq.startsWith('2,3,6,7,8,9,10,16,17,18,1,2,6,7'), 'P: 1→2→3→6→7→8→9→10→16→17→18→(4f)→1→2→6(반복 회차)…', seq);
  const at18 = r.scene.stageLog.find(([, s]) => s === 18)![0];
  const at1 = r.scene.stageLog.filter(([, s]) => s === 1)[0][0];
  ok(at1 - at18 === 5, '단계 18: 하위 0 한 프레임 + 4 프레임 뒤 1', String(at1 - at18));
  ok(seFrames(r.scene, 'WD_VOI_LOC_SYS_START').length === 0, 'P: 시작 텔롭(종류 0)은 Start 가 바로 끝(보이스 없음)');
  ok(r.scene.retry >= 2 && r.scene.status !== null && r.scene.status.layer.paneVisible.get('RootPane') === false, 'P: 반복 횟수 증가, 상태 얼굴 루트 숨김');
  const r2 = make({ inst: true, mgId: 'mg0101', mainFrames: 30, settingOverride: { instLoop: 1 } });
  for (let i = 0; i < 2000 && r2.scene.retry < 1; i++) r2.scene.tick();
  ok(r2.scene.stageLog.map(([, s]) => s).join(',').includes('10,12,16'), 'P + InstLoop Result: 10 → 12 → 16');
}

// ---------------------------------------------------------------- 7) 결과 갈래 A(가짜 무대)
{
  let gotInput: ResultStageInput | null = null;
  let host: ResultStageHost | null = null;
  const STEPS = 200;
  const fake = (input: ResultStageInput, h: ResultStageHost): Promise<ResultStage> => {
    gotInput = input;
    host = h;
    let n = 0;
    const st: ResultStage = {
      get done() {
        return n >= STEPS;
      },
      step() {
        n++;
        if (n === 1) h.fade('out', 1);
        if (n === 90) {
          h.winTelop.start(7, 'WinRightBottom');
          h.resultSound(7);
        }
        if (n === 150) h.winTelop.out();
      },
      render() {},
      dispose() {},
    };
    return Promise.resolve(st);
  };
  const r = make({ mainFrames: 60, useResultStage: true, createResultStage: fake });
  for (let i = 0; i < 20000 && r.scene.stage !== STAGE_END; i++) {
    r.scene.tick();
    if (r.scene.stage === 14) await Promise.resolve();
  }
  ok(r.scene.branch === 'A', '갈래 A(SetPlayer 4명)');
  ok(gotInput !== null && (gotInput as ResultStageInput).players.length === 4 && (gotInput as ResultStageInput).gameRule === 0, '무대 입력: 등록 4명·GameRule 0', JSON.stringify((gotInput as ResultStageInput | null)?.players.map((p) => [p.chara, p.winLose, p.rank])));
  ok(host !== null && typeof (host as ResultStageHost).winTelop.start === 'function', '호스트 계약(fade·winTelop·resultSound·uiTimingOut)');
  const j = events(r.scene, 'jingle');
  ok(j.length === 1 && ['SM_JIN_MG_WIN', 'SM_JIN_MG_DRAW'].includes((j[0][1] as { label: string }).label), 'TryStartResultSound(0, 7) → 결과 징글 38/60 초 뒤', JSON.stringify(j));
  const at14 = r.scene.stageLog.find(([, s]) => s === 14)![0];
  const at16 = r.scene.stageLog.find(([, s]) => s === 16)![0];
  ok(at16 - at14 >= STEPS, '무대 step 이 done 일 때까지 단계 14', String(at16 - at14));
  ok(r.scene.stage === STAGE_END, '갈래 A 끝까지');
  const r2 = make({ mainFrames: 60, useResultStage: true, createResultStage: null });
  runToEnd(r2);
  ok(r2.scene.branch === 'B' && r2.scene.stage === STAGE_END, '무대 팩토리 없음 → 갈래 B 로 끝까지');
}

// ---------------------------------------------------------------- 7b) 텔롭 모델: 321go·무승부
{
  const evs: MgSceneEvent[] = [];
  const t = new MgTelop(1, { anims: uiData.anims, texts: uiData.texts, inst: false, emit: (e) => evs.push(e), resultSound: () => undefined });
  t.start();
  let endAt = -1;
  for (let i = 1; i < 400; i++) {
    t.tick(MG_DT);
    if (endAt < 0 && t.isEndCountdown()) endAt = i;
  }
  ok(endAt === 181, '321go: count 60×3 틱 뒤 판정 틱(181)에 "go" 시작과 함께 IsEndCountdown 참', String(endAt));
  ok(evs.filter((e) => e.k === 'voice').map((e) => (e as { label: string }).label).join(',') === 'WD_VOI_LOC_SYS_3,WD_VOI_LOC_SYS_2,WD_VOI_LOC_SYS_1,WD_VOI_LOC_SYS_GO', '321go 보이스 3·2·1·GO');
  ok(t.finished(), '321go: go 끝나면 숨김(상태 4)');
  const d = new MgTelop(8, { anims: uiData.anims, texts: uiData.texts, inst: false, emit: () => undefined, resultSound: () => undefined });
  d.start();
  ok(d.layer.layout === 'sys_tlp_draw_00' && d.layer.texts.get('x_text_draw') === 'DRAW', '무승부 텔롭 sys_tlp_draw_00 mg_tl303');
  const w = new MgTelop(7, { anims: uiData.anims, texts: uiData.texts, inst: false, emit: () => undefined, resultSound: () => undefined }, [
    { pid: 0, chara: 'pc01' },
    { pid: 1, chara: 'pc02' },
    { pid: 2, chara: 'pc03' },
  ]);
  w.start();
  ok(w.layer.layout === 'sys_tlp_win_01' && w.layer.texts.get('x_text_name_01') === '루이지' && w.layer.paneVisible.get('x_text_name_03') === false, '승리 텔롭 3명 → sys_tlp_win_01, 이름 im_pcNN_name, x_text_name_03 숨김');
}

// ---------------------------------------------------------------- 8) 프레임 게이트
{
  const base = make({ mainFrames: 300, seed: 77 });
  runToEnd(base);
  let closed = 0;
  const N = 50;
  let stopFrame = -1;
  const g = make({
    mainFrames: 300,
    seed: 77,
    gate: (read) => ({
      canStep(frame: number) {
        if (frame === 200 && closed < N) {
          closed++;
          return false;
        }
        return true;
      },
      inputsFor: () => read(),
    }),
  });
  let snap: string | null = null;
  let same = true;
  for (let i = 0; i < 20000 && g.scene.stage !== STAGE_END; i++) {
    const stepped = g.scene.tick();
    if (!stepped) {
      if (stopFrame < 0) stopFrame = g.scene.frame;
      const s = JSON.stringify([g.game.state, g.scene.stage, g.scene.sub, g.rand.calls(), g.scene.endTimer?.timer.remain ?? null, g.scene.startTelop.telop?.layer.frame]);
      if (snap === null) snap = s;
      else if (snap !== s) same = false;
    }
  }
  ok(closed === N && stopFrame === 200, `게이트가 프레임 200 에서 ${N} 번 false`, `${closed} ${stopFrame}`);
  ok(same, '게이트 false 동안 게임 상태·단계·난수 호출 수·타이머·텔롭 프레임이 그대로');
  ok(JSON.stringify(g.game.state.scores) === JSON.stringify(base.game.state.scores) && g.rand.calls() === base.rand.calls(), '다시 열면 이어서 진행 — 끝 점수·난수 소비가 게이트 없는 실행과 같다', `${g.game.state.scores} / ${base.game.state.scores}`);
  ok(g.scene.frame === base.scene.frame, '진행한 프레임 수도 같다(멈춘 시간은 프레임으로 세지 않음)', `${g.scene.frame} / ${base.scene.frame}`);
}

// ---------------------------------------------------------------- 9) 경계·미리 받기
{
  const dir = path.join(WEB, 'script/shell/mgscene');
  const bad: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*from\s+'([^']+)'/g)) if (!m[1].startsWith('./') && m[1] !== '@game/lib/transition' && m[1] !== '@game/lib/splitscreen' && m[1] !== '@game/lib/sound') bad.push(`${f}: ${m[1]}`);
  }
  ok(bad.length === 0, 'shell/mgscene import 0(같은 폴더 + import 0 공용 코어 lib/transition·lib/splitscreen, mgm_common §9.1 lib 예외)', bad.join(' '));
  const pre = mgscenePrefetch(ui);
  const miss = pre.filter((p) => !fs.existsSync(path.join(A, p)));
  ok(miss.length === 0 && pre.length > 10, `미리 받기 ${pre.length}개 파일 존재`, miss.join(' '));
  const snd = JSON.parse(fs.readFileSync(path.join(A, 'mgscene/sound/sound.json'), 'utf8'));
  const sm = [...Object.values(snd.se), ...Object.values(snd.voice)].map((e) => (e as { file: string }).file).filter((f) => !fs.existsSync(path.join(A, 'mgscene', f)));
  ok(sm.length === 0, '소리 명세 파일 존재(SQ_SE_SYS_* = 공용 assets/common/sound)', sm.join(' '));
}

{
  const seen: number[] = [];
  let wipeStart = -1;
  let wipeEnd = -1;
  let mainCalls = 0;
  let gctx: MgSceneContext | null = null;
  const game: MgGame = {
    setup(ctx) {
      gctx = ctx;
    },
    onGameMain() {
      const c = gctx!;
      mainCalls++;
      seen.push(c.pad(0).accX);
      if (mainCalls === 1) {
        c.wipe.fadeOut(WIPE_WHITE, 1);
        wipeStart = c.frame;
      } else if (wipeEnd < 0 && !c.wipe.playing) wipeEnd = c.frame;
      if (wipeEnd >= 0) c.requestReturnScene();
      return false;
    },
  };
  const pads: (MgPadInput | null)[] = [{ buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, accX: 1.5, accY: 0, accZ: -0.5 }, null, null, null];
  const scene = new MgScene({ mgId: 'mg1801', players: PLAYERS, seed: 5, rand: rng(5), tables, ui: uiData, resultHost: { gl: null, url: (p: string) => p } }, game, localGate(() => pads));
  for (let i = 0; i < 400 && scene.stage !== STAGE_END; i++) scene.tick();
  ok(seen[0] === 1.5 && gctx!.pad(0).accZ === -0.5, '게이트 패드의 가속도(accX/Y/Z)가 ctx.pad 까지(체감 입력 손실 해소)', `${seen[0]} ${gctx!.pad(0).accZ}`);
  ok(wipeEnd - wipeStart === 20, '게임이 부른 WipeModule 직접 페이드(ctx.wipe): 20 프레임 뒤 처리기에서 playing 거짓(틀 UI 틱이 한 번만 진행)', `${wipeEnd - wipeStart}`);
  const last = scene.stageLog.slice(-2).map(([, st]) => st).join();
  ok(scene.stage === STAGE_END && last === '9,19', 'ctx.requestReturnScene → 그 프레임 끝에 단계 0x13(RequestReturnScene)', last);
  ok(scene.log.some(([, e]) => e.k === 'exit'), 'RequestReturnScene 도 exit 사건');
}
{
  ok(freePlayJudgeType(0) === 0 && freePlayJudgeType(7) === 0 && freePlayJudgeType(1) === 1 && freePlayJudgeType(10) === 1, 'judge = GameRule ∉ {0,7}(Mgm01SetupMinigamePlayInfo @0x71001f1c60)');
  const ps = [
    { pid: 0, rank: 0, winLose: 1 as const },
    { pid: 1, rank: 2, winLose: 0 as const },
    { pid: 2, rank: 1, winLose: 2 as const },
    { pid: 3, rank: -1, winLose: -1 as const },
  ];
  ok(minigameResultEntry(5, 0, 0, ps).results.join() === '0,2,1,255', '기록 byte judge 0 → rank byte(−1 = 255)', minigameResultEntry(5, 0, 0, ps).results.join());
  ok(minigameResultEntry(5, 1, 1, ps).results.join() === '1,0,2,255', '기록 byte judge ≠ 0 → WinLose byte(무승부 2 그대로)', minigameResultEntry(5, 1, 1, ps).results.join());
  ok(minigameResultEntry(5, 1, 10, ps).results.join() === '2,2,2,2' && minigameResultEntry(5, 0, 8, ps).results.join() === '255,255,255,255', 'GameRule 8·10: judge ≠ 0 → 2×4, judge 0 → 255×4(FUN_71001f271c)');
}
{
  const dummyDef = {
    id: 'mg0101',
    createLogic: () => Object.assign(createDummyGame({ mainFrames: 300, openingFrames: 30, useResultStage: false }), { sound: null, events: [], done: false, result: null }) as unknown as GameLogic,
  };
  const setup: GameSetup = { players: PLAYERS.map((p) => ({ char: p.chara, isCom: p.isCom, comLevel: 0 })), seed: 99, practice: false };
  const d = determinismCheck(
    () => new NodeMgRun(dummyDef, setup),
    () => ({ pads: (f: number) => [{ buttons: f % 7 === 0 ? 1 : f % 50 === 0 ? 1 << 10 : 0, lx: 0, ly: 0, rx: 0, ry: 0 }, null, null, null] }),
  );
  ok(d.ok && d.ended, '결정성: 더미 게임 같은 seed·입력 기록 두 번 → 매 틱 상태 해시 같음(끝까지)', `${d.ticks} 틱 ${d.firstDiff}`);
  const root = path.join(WEB, 'script');
  const st = staticLogicCheck([path.join(root, 'shell/mgscene'), path.join(root, 'games/mgdummy/logic.ts'), path.join(root, 'game/lib/transition/index.ts'), path.join(root, 'game/lib/splitscreen'), path.join(root, 'game/lib/sound')]);
  ok(st.bad.length === 0 && st.files >= 10, `정적 검사: 틀·더미 로직 ${st.files} 파일에 Math.random·벽시계·직접 입력·DOM 없음`, st.bad.join(' '));
}

console.log(`\n${count - fails}/${count} 통과`);
if (fails) process.exit(1);
