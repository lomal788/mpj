/**
 * 미니게임 한 판 호스트(DOM 없음 — 페이지와 노드 시험이 같이 쓴다): seed → BexRandModule(원본 장면 시작 SetSyncRandSeed(async.Rand()))
 * → GameDef.createLogic(MgGame) → 공용 틀 MgScene(게이트) 조립, 한 tick 진행, 끝난 뒤 모드 결과 기록 한 칸(SetMinigameResult 계약).
 * seed 는 게임이 아니라 호스트가 판 시작에 한 번 만든다(localSeed: 주어진 값 또는 무작위 한 번). 계약: docs/shell/minigame_scene.md §12.12.
 */
import { BexRandModule } from './core/rng';
import type { GameDef, GameLogic, GameSetup, PlayerSetup, SoundSnapshot } from './game';
import type { Transition } from './lib/transition';
import {
  freePlayJudgeType,
  MgScene,
  minigameResultEntry,
  STAGE_END,
  type FrameGate,
  type MgPlaySettings,
  type MgResultBytes,
  type MgTables,
  type MgUiData,
} from './shell/mgscene';

export interface MgRunInit {
  def: Pick<GameDef, 'id' | 'createLogic'>;
  setup: GameSetup;
  tables: MgTables;
  ui: MgUiData;
  gate: FrameGate;
  play?: MgPlaySettings;
  endless?: boolean;
  wipe?: Transition;
}

export interface MgRun {
  readonly scene: MgScene;
  readonly logic: GameLogic;
  readonly rng: BexRandModule;
  readonly judgeType: number;
  readonly ended: boolean;
  tick(sound?: SoundSnapshot | null): boolean;
  resultEntry(id: number): MgResultBytes;
}

export function parseSeed(s: string | null | undefined): number | null {
  return s && /^\s*(0x[0-9a-f]+|\d+)\s*$/i.test(s) ? Number(s) >>> 0 : null;
}

export function localSeed(given: string | null | undefined): number {
  return parseSeed(given) ?? (Math.random() * 0x100000000) >>> 0;
}

export interface FreePlayRequest {
  cpu: number;
  endless: boolean;
  rhythm: number;
  useGyro: boolean;
  callInst: boolean;
  team: { teamIdByPid: readonly number[]; gamePlayByPid: readonly boolean[] };
}

export function freePlaySetup(req: FreePlayRequest, chars: readonly string[], com: readonly boolean[]): { players: PlayerSetup[]; play: MgPlaySettings; endless: boolean } {
  return {
    players: com.map((c, i) => ({ char: chars[i] ?? `pc0${i + 1}`, isCom: c, comLevel: req.cpu ?? 0, teamId: req.team.teamIdByPid[i] ?? 0, gamePlay: req.team.gamePlayByPid[i] ?? true })),
    play: { rhythm: req.rhythm, callInst: req.callInst, useGyro: req.useGyro, comLevel: req.cpu ?? 0 },
    endless: req.endless,
  };
}

export function createMgRun(init: MgRunInit): MgRun {
  const { def, setup, tables } = init;
  const rng = new BexRandModule(setup.seed);
  rng.setSyncRandSeed(rng.rand());
  const logic = def.createLogic(setup, init.play);
  const gameRule = tables.mgList[def.id]?.gameRule ?? 0;
  const judgeType = freePlayJudgeType(gameRule);
  const scene = new MgScene(
    {
      mgId: def.id,
      players: setup.players.map((p, i) => ({ pid: i, chara: p.char, isCom: p.isCom, teamId: p.teamId ?? 0, order: i, gamePlay: p.gamePlay ?? true })),
      seed: setup.seed,
      rand: { u32: () => rng.sync.nextU32() },
      rng,
      tables,
      ui: init.ui,
      endless: !!init.endless,
      judgeType,
      playMode: 1,
      play: init.play,
      wipe: init.wipe,
    },
    logic,
    init.gate,
  );
  return {
    scene,
    logic,
    rng,
    judgeType,
    get ended() {
      return scene.stage === STAGE_END;
    },
    tick(sound) {
      logic.sound = sound ?? null;
      return scene.tick();
    },
    resultEntry: (id) => minigameResultEntry(id, judgeType, gameRule, scene.players),
  };
}
