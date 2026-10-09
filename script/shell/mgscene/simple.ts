/**
 * 짧은 게임용 도우미 simpleMgGame — 본편 step·끝 판정·결과만 주면 원본 훅으로 바꾼다(docs/shell/minigame_scene.md §12.3).
 * onGameMain = step 후 isFinished, onEndingInit = 결과(순위·승패·코인) 기록(+ useResultStage 면 SetPlayer = 갈래 A),
 * onGameEnding = 승자 텔롭(CreateWinTelop / 승자 없으면 CreateDrawTelop)을 띄우고 normal 이 된 뒤 holdSec 초 뒤 Out, 끝나면 참.
 * 승자 텔롭을 엔딩에서 띄우는 것은 미니게임마다 다르다(원본 각 게임 OnGameEnding) — 이 도우미의 기본은 [설계].
 */
import type { MgGame, MgSceneContext } from './types';
import type { WinLose } from './resultContract';

export interface SimpleMgResult {
  /** 0 = 1위 */
  ranks: number[];
  winLose: WinLose[];
  coins: number[];
}

export interface SimpleMgSpec {
  setup(ctx: MgSceneContext): void;
  /** 본편 한 프레임(게이트가 연 프레임에만 불린다) */
  step(ctx: MgSceneContext): void;
  isFinished(ctx: MgSceneContext): boolean;
  /** pid 순서 결과 */
  result(ctx: MgSceneContext): SimpleMgResult;
  /** 본편 밖(오프닝·결과 중)에도 도는 게임 갱신 */
  update?(ctx: MgSceneContext): void;
  useResultStage?: boolean;
  /** 승자 텔롭 유지 초(기본 2.0) */
  holdSec?: number;
}

export function simpleMgGame(spec: SimpleMgSpec): MgGame & { readonly ctx: MgSceneContext | null } {
  let ctx: MgSceneContext | null = null;
  let endingSub = 0;
  let hold = 0;
  return {
    get ctx() {
      return ctx;
    },
    setup(c) {
      ctx = c;
      endingSub = 0;
      hold = 0;
      spec.setup(c);
    },
    update() {
      spec.update?.(ctx!);
    },
    onGameMain() {
      spec.step(ctx!);
      return spec.isFinished(ctx!);
    },
    onEndingInit(api) {
      const c = ctx!;
      const r = spec.result(c);
      c.players.forEach((p, i) => {
        c.setRank(p.pid, r.ranks[i] ?? -1);
        c.setWinLose(p.pid, r.winLose[i] ?? -1);
        c.setCoin(p.pid, r.coins[i] ?? 0);
      });
      if (spec.useResultStage) for (const p of c.players) api.setPlayer(p.pid);
      return true;
    },
    onGameEnding() {
      const c = ctx!;
      if (endingSub === 0) {
        const winners = c.players.filter((p) => p.winLose === 1).map((p) => p.pid);
        if (winners.length > 0) c.createWinTelop(winners);
        else c.createDrawTelop();
        endingSub = 1;
        hold = 0;
        return false;
      }
      if (endingSub === 1) {
        hold = Math.fround(hold + c.dt);
        if (hold >= (spec.holdSec ?? 2)) {
          c.winTelopOut();
          endingSub = 2;
        }
        return false;
      }
      return c.winTelopFinished();
    },
  };
}
