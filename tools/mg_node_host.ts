/**
 * 노드 시험용 미니게임 호스트 — 페이지와 같은 script/mgrun.ts createMgRun 으로 한 판을 조립하고(틀 표·UI 는 web/assets/mgscene 파일),
 * 입력 기록을 로컬 게이트로 넣어 한 tick 씩 돌린다. mg1801 하네스는 옛 시험이 쓰던 모양(step·state·events·done·result·world·cfg)을 그대로 준다.
 * 계약: docs/shell/minigame_scene.md §12.12.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PadInput } from '@game/core/pad';
import type { GameDef, GameSetup, SoundSnapshot } from '../script/game';
import { Mg1801Logic, type Mg1801Game, type Mg1801Options } from '@app/minigame/mg1801/logic/game';
import { createMgRun, type MgRun } from '../script/mgrun';
import { localGate, mgUiData, type MgPadInput, type MgPlaySettings, type MgTables, type MgUiData } from '@app/minigame/frame/scene';

const A = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'assets');
let cache: { tables: MgTables; ui: MgUiData } | null = null;

export function nodeMgAssets(): { tables: MgTables; ui: MgUiData } {
  cache ??= {
    tables: JSON.parse(fs.readFileSync(path.join(A, 'mgscene/tables.json'), 'utf8')) as MgTables,
    ui: mgUiData(JSON.parse(fs.readFileSync(path.join(A, 'mgscene/ui.json'), 'utf8'))),
  };
  return cache;
}

export class NodeMgRun {
  readonly run: MgRun;
  private pads: readonly (MgPadInput | null)[] = [null, null, null, null];

  constructor(def: Pick<GameDef, 'id' | 'createLogic'>, setup: GameSetup, o: { play?: MgPlaySettings; endless?: boolean } = {}) {
    const { tables, ui } = nodeMgAssets();
    this.run = createMgRun({ def, setup, tables, ui, gate: localGate(() => this.pads), play: o.play, endless: o.endless });
  }

  step(input: readonly (PadInput | MgPadInput | null | undefined)[], sound?: SoundSnapshot | null): boolean {
    this.pads = [0, 1, 2, 3].map((i) => input[i] ?? null);
    return this.run.tick(sound ?? null);
  }
}

export class Mg1801Harness extends NodeMgRun {
  constructor(setup: GameSetup, opts: Mg1801Options = {}, o: { play?: MgPlaySettings } = {}) {
    super({ id: 'mg1801', createLogic: () => new Mg1801Logic(setup, opts) }, setup, o);
  }

  get logic(): Mg1801Logic {
    return this.run.logic as Mg1801Logic;
  }

  get g(): Mg1801Game {
    return this.logic.game;
  }

  get state(): Mg1801Game['state'] {
    return this.g.state;
  }

  get events(): Mg1801Game['events'] {
    return this.g.events;
  }

  get done(): boolean {
    return this.g.done;
  }

  get result(): Mg1801Game['result'] {
    return this.g.result;
  }

  get world(): Mg1801Game['world'] {
    return this.g.world;
  }

  get cfg(): Mg1801Game['cfg'] {
    return this.g.cfg;
  }
}
