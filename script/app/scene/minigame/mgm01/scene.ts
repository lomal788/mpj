/**
 * 프리 플레이 화면 상태기계 — DecideMinigameFlow(0 처음·2 목록·3 승패 표·4 개별 설정·5 자이로·6/7 연출 정리·8 한 판 호출·9 끝)를 한 Fiber 로 묶는다.
 * 한 판은 Mgm01PlayRequest 를 바깥(call)으로 내고 장면이 버려진다. 돌아오면(returned) 결과 기록·ContinueFlow(선택 복원, resume1 → 목록).
 * 근거: docs/shell/mgm01_freeplay.md 3.1·3.2(Enter/Continue)·5.2·5.5(전이·안내·SE)·8.3·8.4(호출·복귀 계약). 웹 결정 9.2.
 * BGM(docs/engine/04_sound.md §12.14): Start/ContinueFlow PlayBgm(4), MgStartFlow 맨 앞 StopBgm(3)+PlayBgm(5), ExitFlow StopBgm(2).
 */
import { pushResult, type MgmSave, type MgmWork, type MgResultEntry } from '../../../../shell/mgmcommon/contracts';
import { FiberRunner, waitTime, type Flow } from '../../../../shell/mgmcommon/fiber';
import { MgmGuide } from '../../../../shell/mgmcommon/guides';
import type { MgmInput } from '../../../../shell/mgmcommon/input';
import type { MgmSound } from '../../../../shell/mgmcommon/sound';
import type { MgmView } from '../../../../shell/mgmcommon/view';
import { consumeNew } from './announce';
import { FILTER, type Mgm01Catalog } from './catalog';
import { HistoryScreen } from './historyScreen';
import { historyFromWork } from './historyView';
import { ListScreen, type ListOutcome } from './listScreen';
import { PLACEHOLDER_THUMB, thumbKey } from './listView';
import { SettingScreen, type SettingOutcome } from './settingScreen';
import type { LockEnv, Mgm01PlayRequest, Mgm01Player, Mgm01SettingValues } from './types';

export const MG_START_WAIT = 1.0;
export const FLAG_ENDLESS = 1;

export interface Mgm01Carry {
  values: Mgm01SettingValues;
}

export interface Mgm01SceneDeps {
  view: MgmView;
  input: MgmInput;
  sound: MgmSound;
  catalog: Mgm01Catalog;
  work: MgmWork;
  save: MgmSave;
  players(): readonly Mgm01Player[];
  lockEnv(): LockEnv;
  online?: boolean;
  rand(n: number): number;
  record(id: number, endless: boolean): number | null;
  faces: readonly string[];
  carry: Mgm01Carry;
  call(req: Mgm01PlayRequest): void;
  exit(): void;
  dt?: number;
  newRate?: number;
  startEnum?: number;
}

export type SceneEvent =
  | { type: 'state'; from: number; to: number }
  | { type: 'list'; outcome: ListOutcome }
  | { type: 'setting'; outcome: SettingOutcome }
  | { type: 'call'; request: Mgm01PlayRequest }
  | { type: 'record'; entry: MgResultEntry; round: number }
  | { type: 'exit' };

export class Mgm01Scene {
  state = 0;
  prev = -1;
  resume = false;
  enumNo: number = FILTER.MgAll;
  index = 0;
  selectedId = -1;
  request: Mgm01PlayRequest | null = null;
  readonly list: ListScreen;
  readonly guide: MgmGuide;
  setting: SettingScreen | null = null;
  history: HistoryScreen | null = null;
  readonly log: SceneEvent[] = [];
  private readonly fibers = new FiberRunner();
  private reasons = new Map<number, number>();

  constructor(
    readonly deps: Mgm01SceneDeps,
    returned?: MgResultEntry | null,
  ) {
    const { work } = deps;
    deps.carry.values = { ...deps.carry.values, team: 0 };
    if (returned) {
      work.round += 1;
      pushResult(work, returned);
      this.log.push({ type: 'record', entry: returned, round: work.round });
    }
    deps.sound.playBgm(4);
    this.refreshLock();
    this.guide = new MgmGuide(deps.view, 17, 'sys_ctrl_back');
    this.list = new ListScreen(deps.view, {
      catalog: deps.catalog,
      reason: (id) => this.reason(id),
      favorite: (id) => this.favorite(id),
      isNew: (id) => !!work.mg.get(id)?.isNew,
      rand: deps.rand,
      sound: deps.sound,
      input: () => ({ trig: deps.input.trig(), rep: deps.input.rep() }),
      operator: () => deps.input.operator,
      consumeNew: (id) => consumeNew(work, deps.save, id),
      guide: this.guide,
      newRate: deps.newRate,
    });
    const sel = work.freeplaySelect;
    if (work.round >= 1 && sel) {
      this.enumNo = sel.filter;
      this.index = sel.index;
      this.selectedId = sel.id;
      this.resume = true;
    }
    this.fibers.start(this.decide());
  }

  private refreshLock(): void {
    const env = this.deps.lockEnv();
    this.reasons = new Map(this.deps.catalog.games.map((g) => [g.id, this.deps.catalog.lockReason(g.id, env)]));
  }

  reason(id: number): number {
    return this.reasons.get(id) ?? -1;
  }

  favorite(id: number): boolean {
    return !!this.deps.work.mg.get(id)?.favorite;
  }

  setFavorite(id: number, on: boolean): void {
    const w = this.deps.work.mg.get(id);
    if (w) w.favorite = on;
    const e = this.deps.save.minigame(id);
    this.deps.save.setMinigame(id, { head: e.head, flags: on ? e.flags | 0x4 : e.flags & ~0x4 });
  }

  thumb(id: number): string | null {
    const g = this.deps.catalog.game(id);
    if (!g) return null;
    return this.reason(id) === 0 ? PLACEHOLDER_THUMB : thumbKey(g.name);
  }

  private go(to: number): void {
    this.log.push({ type: 'state', from: this.state, to });
    this.prev = this.state;
    this.state = to;
  }

  private *decide(): Flow {
    const d = this.deps;
    this.go(this.resume ? 2 : 0);
    for (;;) {
      switch (this.state) {
        case 0:
          this.enumNo = d.startEnum ?? FILTER.MgAll;
          this.index = Math.max(0, d.catalog.filterIndexOf(this.enumNo));
          this.go(2);
          break;
        case 2: {
          this.refreshLock();
          const o = yield* this.list.flow({ resume: this.resume, selectedId: this.selectedId, index: this.index });
          this.resume = false;
          this.log.push({ type: 'list', outcome: o });
          this.enumNo = o.enumNo;
          this.index = o.index;
          this.selectedId = o.id;
          this.go(o.result);
          break;
        }
        case 3: {
          this.history = new HistoryScreen(d.view, d.input, d.sound, historyFromWork(d.work), d.faces, (id) => this.thumb(id));
          yield* this.history.run();
          this.history = null;
          this.resume = true;
          this.go(2);
          break;
        }
        case 4: {
          const o = yield* this.settingFlow();
          this.log.push({ type: 'setting', outcome: o });
          this.selectedId = o.id;
          d.carry.values = { ...o.values };
          if (o.result === 'play') {
            this.request = o.request;
            this.go(5);
          } else {
            this.resume = true;
            this.go(2);
          }
          break;
        }
        case 5:
          this.go(6);
          break;
        case 6:
          this.go(8);
          break;
        case 7:
          this.go(9);
          break;
        case 8: {
          d.sound.stopBgm(3);
          d.sound.playBgm(5);
          yield* waitTime(MG_START_WAIT, () => d.dt ?? Math.fround(1 / 60));
          const req = this.request!;
          d.work.freeplaySelect = { filter: this.enumNo, index: this.index, id: req.id, fromFavorite: this.enumNo === FILTER.MgFavorite };
          if (req.endless) d.work.flags.add(FLAG_ENDLESS);
          else d.work.flags.delete(FLAG_ENDLESS);
          this.log.push({ type: 'call', request: req });
          d.call(req);
          for (;;) yield;
        }
        case 9:
          this.log.push({ type: 'exit' });
          d.sound.stopBgm(2);
          d.exit();
          return;
        default:
          this.go(7);
          break;
      }
    }
  }

  private *settingFlow(): Flow<SettingOutcome> {
    const d = this.deps;
    const unlocked = d.catalog.mgIdList(this.enumNo, false, (id) => this.reason(id), (id) => this.favorite(id));
    const resume = this.resume;
    this.resume = false;
    if (resume) this.guide.in();
    const scr = new SettingScreen(d.view, {
      catalog: d.catalog,
      players: d.players,
      online: d.online,
      filter: { enumNo: this.enumNo, index: this.index },
      unlocked,
      isFavorite: (id) => this.favorite(id),
      setFavorite: (id, on) => this.setFavorite(id, on),
      rand: d.rand,
      sound: d.sound,
      input: () => ({ trig: d.input.trig(), rep: d.input.rep() }),
      record: d.record,
      playCount: (id) => d.save.minigame(id).head,
      thumb: (id) => this.thumb(id),
      onShow: (id) => {
        if (d.work.mg.get(id)?.isNew) consumeNew(d.work, d.save, id);
      },
    });
    this.setting = scr;
    const v = d.carry.values;
    const o = yield* scr.flow({ id: this.selectedId, team: v.team, cpu: v.cpu, endless: v.endless, rhythm: v.rhythm, resume });
    if (o.result === 'play') this.guide.out();
    this.setting = null;
    return o;
  }

  step(): void {
    this.fibers.step();
    this.list.update(this.deps.dt ?? Math.fround(1 / 60));
    this.setting?.update();
    this.history?.update();
    this.guide.update();
  }

  draw(): void {
    this.list.draw();
    this.setting?.draw();
    this.history?.draw();
    this.guide.draw();
  }
}
