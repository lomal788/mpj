/**
 * UI 시험 항목 "미니게임 공용 틀" — 시험용 더미 게임(dev/game/mgdummy)을 공용 틀(app/minigame/frame/scene)에 올려 한 판을 처음부터 결과까지 돌린다.
 * 루프: 고정 1/60 스텝(rAF 한 번에 최대 4스텝), 스텝은 프레임 게이트(로컬)가 열 때만 진행, 그리기(3D → 틀 2D)는 매 rAF.
 * URL(dev/ui?ui=mgscene&…): mg=mg0101(MGSetting·MgSound 표 행), inst=1(설명 화면 안 실행 반복), endtime=N(시험용: GameEndTime 덮어쓰기, 원본 아님),
 *   main=N(더미 본편 프레임, 0 = 끝없음 → 종료 타이머 만료로 끝), opening=N(더미 오프닝 프레임), result3d=1(SetPlayer → 결과 3D 무대 app/minigame/frame/result), seed=N.
 * 키: J = A(사람 점수), Enter = +(오프닝 건너뛰기). 설계: docs/shell/minigame_scene.md §12.
 */
import { BexRandModule } from '@game/core/rng';
import { FPS, STEP_MS } from '@game/core/clock';
import { ASSETS } from '../env';
import type { GameSetup, GameView } from '../game';
import { GAMES } from '@app/minigame';
import { createDummyGame } from './game/mgdummy/logic';
import { createMgRun } from '../mgrun';
import { DummyView } from './game/mgdummy/view';
import { localGate, MgScene, mgUiData, STAGE_END, STAGE_NAME, type MgPadInput, type MgSettingRow, type MgTables } from '@app/minigame/frame/scene';
import { createResultStage } from '@app/minigame/frame/result';
import { logicWipe } from '../view/appTransition';
import { Assets } from '../view/assets';
import { AudioOut } from '../view/audio';
import { appBgm } from '../view/bgm';
import type { PadSource } from '../view/input';
import { MgSceneSound } from '../view/mgsceneSound';
import { MgSceneUi, type MgSceneUiJson } from '../view/mgsceneUi';
import { Renderer } from '../view/renderer';

export interface MgScenePageRun {
  readonly scene: MgScene;
  stop(): void;
  debug(): string;
}

const CHARAS = ['pc01', 'pc02', 'pc03', 'pc06'];
/** rAF 한 번에 도는 최대 스텝(고정 시계 규칙) */
const MAX_STEPS_PER_RAF = 4;

export async function runMgScenePage(
  stage: HTMLElement,
  cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; onDone(result: string): void },
): Promise<MgScenePageRun> {
  const q = new URLSearchParams(location.search);
  const reg = GAMES.find((g) => g.id === q.get('game'));
  if (reg) return runRegistered(stage, cfg, reg, q);
  const mgId = q.get('mg') ?? 'mg0101';
  const seed = Number(q.get('seed') ?? 0x5eed) >>> 0;
  const inst = q.get('inst') === '1';
  const useResult3d = q.get('result3d') === '1';
  const override: Partial<MgSettingRow> = {};
  if (q.get('endtime')) override.gameEndTime = Number(q.get('endtime'));

  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  const hudCanvas = document.createElement('canvas');
  hudCanvas.className = 'jw-hud';
  hudCanvas.width = 1920;
  hudCanvas.height = 1080;
  stage.append(canvas, hudCanvas);
  const hud = hudCanvas.getContext('2d')!;
  const renderer = new Renderer(canvas);
  const onResize = (): void => renderer.resize();
  window.addEventListener('resize', onResize);

  appBgm().stop(0.2);
  const audio = cfg.muted ? null : new AudioOut();
  void audio?.resume();
  const sa = new Assets('mgscene/');
  const da = new Assets('mgdummy/');
  const [uiJson, tables] = await Promise.all([sa.json<MgSceneUiJson & Parameters<typeof mgUiData>[0]>('ui.json'), sa.json<MgTables>('tables.json')]);
  const [ui, sound] = await Promise.all([
    MgSceneUi.load(sa),
    MgSceneSound.load(audio, [
      { assets: da, path: 'sound/sound.json' },
      { assets: sa, path: 'sound/sound.json' },
    ]),
  ]);

  const rng = new BexRandModule(seed);
  rng.setSyncRandSeed(rng.rand());
  const game = createDummyGame({
    mainFrames: q.get('main') !== null ? Number(q.get('main')) : 480,
    openingFrames: q.get('opening') !== null ? Number(q.get('opening')) : 660,
    useResultStage: useResult3d,
  });
  const view = new DummyView();
  const readPads = (): (MgPadInput | null)[] => cfg.pads.map((p) => p?.read() ?? null);
  const wipe = logicWipe();
  const scene = new MgScene(
    {
      mgId,
      players: cfg.com.map((c, i) => ({ pid: i, chara: CHARAS[i], isCom: c, teamId: i, order: i })),
      seed,
      rand: { u32: () => rng.sync.nextU32() },
      tables,
      ui: mgUiData(uiJson),
      inst,
      settingOverride: override,
      createResultStage: useResult3d ? (i, h) => createResultStage(i, h as Parameters<typeof createResultStage>[1]) : null,
      resultHost: { gl: renderer.gl, url: (p) => new URL(`${ASSETS}${p}`, document.baseURI).href },
      wipe,
    },
    game,
    localGate(readPads),
  );

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let stopped = false;
  let reported = false;
  const frame = (now: number): void => {
    if (stopped) return;
    acc += now - last;
    last = now;
    let n = 0;
    while (acc >= STEP_MS && n < MAX_STEPS_PER_RAF) {
      acc -= STEP_MS;
      n++;
      if (scene.tick()) sound.onEvents(scene.events);
    }
    if (n === MAX_STEPS_PER_RAF) acc = Math.min(acc, STEP_MS);
    if (scene.branch === 'A' && scene.resultStage && scene.stage === 14) {
      renderer.gl.setClearColor(0x000000, 1);
      renderer.gl.clear();
      scene.resultStage.render();
    } else {
      view.update(game.state, scene.stage, scene.frame);
      renderer.render(view.scene, view.camera);
    }
    hud.clearRect(0, 0, 1920, 1080);
    ui.draw(hud, scene.layers());
    if (scene.stage === STAGE_END && !reported) {
      reported = true;
      cfg.onDone(scene.players.map((p) => `${p.pid + 1}P ${p.chara} 순위 ${p.rank + 1} 승패 ${p.winLose} 점수 ${game.state.scores[p.pid]}`).join('\n'));
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    scene,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      wipe.release();
      window.removeEventListener('resize', onResize);
      sound.dispose();
      audio?.dispose();
      view.dispose();
      renderer.dispose();
      canvas.remove();
      hudCanvas.remove();
    },
    debug() {
      const s = scene;
      const lines = [
        `${s.setup.mgId} 단계 ${s.stage} ${STAGE_NAME[s.stage] ?? ''}  하위 ${s.sub}  프레임 ${s.frame} (${(s.frame / FPS).toFixed(1)} s)${s.P ? '  설명 화면 반복 ' + s.retry : ''}`,
        `텔롭 시작 ${s.startTelop.telop?.state ?? '-'} 종료 ${s.finishTelop.telop?.state ?? '-'} 승리 ${s.winTelop?.state ?? '-'}  와이프 ${s.wipe.state}  건너뜀 ${s.skipped}`,
        `타이머 ${s.endTimer ? `${s.endTimer.timer.displayValue} (${s.endTimer.timer.remainSecond().toFixed(2)} s, 표시 ${s.endTimer.timer.disp})` : '없음'}  상태 얼굴 ${s.status ? `${s.status.layer.layout} ${s.status.state}` : '없음'}`,
        `점수 ${game.state.scores.join(' / ')}  BGM ${s.sound.bgmLabel ?? '-'}${s.sound.bgmPlaying ? '' : ' (대기)'}  결과 ${s.branch ?? '-'}`,
        `소리 ${sound.log.slice(-4).join(', ')}`,
      ];
      return lines.join('\n');
    },
  };
}

async function runRegistered(
  stage: HTMLElement,
  cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; onDone(result: string): void },
  def: (typeof GAMES)[number],
  q: URLSearchParams,
): Promise<MgScenePageRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  const hudCanvas = document.createElement('canvas');
  hudCanvas.className = 'jw-hud';
  hudCanvas.width = 1920;
  hudCanvas.height = 1080;
  stage.append(canvas, hudCanvas);
  const hud = hudCanvas.getContext('2d')!;
  const renderer = new Renderer(canvas);
  const onResize = (): void => renderer.resize();
  window.addEventListener('resize', onResize);
  appBgm().stop(0.2);
  const audio = cfg.muted ? null : new AudioOut();
  void audio?.resume();
  const sa = new Assets('mgscene/');
  const [uiJson, tables] = await Promise.all([sa.json<MgSceneUiJson & Parameters<typeof mgUiData>[0]>('ui.json'), sa.json<MgTables>('tables.json')]);
  const [ui, sound] = await Promise.all([MgSceneUi.load(sa), MgSceneSound.load(audio, [{ assets: sa, path: 'sound/sound.json' }]), def.load?.()]);
  const setup: GameSetup = {
    players: cfg.com.map((c, i) => ({ char: CHARAS[i], isCom: c, comLevel: 0 })),
    seed: Number(q.get('seed') ?? 0x5eed) >>> 0,
    practice: false,
    options: Object.fromEntries((def.options ?? []).filter((o) => q.has(o.key)).map((o) => [o.key, q.get(o.key)!])),
  };
  const view: GameView = def.createView({ renderer, hud, audio, setup, pads: cfg.pads }, new Assets(def.assetsDir));
  await view.load(() => undefined);
  const wipe = logicWipe();
  const run = createMgRun({ def, setup, tables, ui: mgUiData(uiJson), gate: localGate(() => cfg.pads.map((p) => p?.read() ?? null)), wipe });
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let stopped = false;
  let reported = false;
  const frame = (now: number): void => {
    if (stopped) return;
    acc += now - last;
    last = now;
    let n = 0;
    while (acc >= STEP_MS && n < MAX_STEPS_PER_RAF) {
      acc -= STEP_MS;
      n++;
      if (run.tick(null)) {
        view.onStep(run.logic.state, run.logic.events);
        sound.onEvents(run.scene.events);
      }
    }
    if (n === MAX_STEPS_PER_RAF) acc = Math.min(acc, STEP_MS);
    view.render(run.logic.state);
    ui.draw(hud, run.scene.layers());
    if (run.ended && !reported) {
      reported = true;
      const e = run.resultEntry(-1);
      cfg.onDone(`${def.id} 끝 — 기록 judge ${e.judge} byte ${e.results.join(',')}`);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    scene: run.scene,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      wipe.release();
      window.removeEventListener('resize', onResize);
      sound.dispose();
      view.dispose();
      audio?.dispose();
      renderer.dispose();
      canvas.remove();
      hudCanvas.remove();
    },
    debug() {
      const s = run.scene;
      return [`${def.id} 단계 ${s.stage} ${STAGE_NAME[s.stage] ?? ''}  하위 ${s.sub}  프레임 ${s.frame} (${(s.frame / FPS).toFixed(1)} s)  결과 ${s.branch ?? '-'}`, view.debug(run.logic.state, run.logic.events)].join('\n');
    },
  };
}
