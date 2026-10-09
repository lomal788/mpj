/**
 * 시험용 더미 미니게임 로직 — 원본 게임이 아니다. 미니게임 공용 틀(app/scene/minigame/mgscene)을 처음부터 결과까지 돌려 보기 위한 최소 게임.
 * 본편: 정해진 프레임 동안 각 플레이어 점수가 오른다(사람 = A 를 누를 때마다 +3, COM = 동기 난수 0~2 매 6 프레임). 끝나면 점수로 순위.
 * 오프닝: openingFrames 동안 OnGameOpening 거짓(건너뛰기 안내가 뜬다). 결과: 1위(동점 포함) 승리 1, 나머지 0, 모두 같으면 무승부 2.
 * 입력·난수는 틀이 준 것(ctx.pad·ctx.rand)만 쓴다(docs/shell/minigame_scene.md §12 게이트 계약).
 */
import { simpleMgGame, type MgGame, type MgSceneContext, type WinLose } from '@app/scene/minigame/mgscene';

export interface DummyOptions {
  /** 본편 길이(프레임). 0 이하면 끝나지 않음(종료 타이머 시험용) */
  mainFrames: number;
  openingFrames: number;
  useResultStage: boolean;
}

export interface DummyState {
  scores: number[];
  mainFrame: number;
  openingFrame: number;
  randCalls: number;
}

const NPAD_A = 1;

export function createDummyGame(opt: DummyOptions): MgGame & { readonly state: DummyState; readonly ctx: MgSceneContext | null } {
  const state: DummyState = { scores: [0, 0, 0, 0], mainFrame: 0, openingFrame: 0, randCalls: 0 };
  const g = simpleMgGame({
    useResultStage: opt.useResultStage,
    setup(ctx) {
      state.scores = ctx.players.map(() => 0);
      state.mainFrame = 0;
      state.openingFrame = 0;
    },
    step(ctx) {
      state.mainFrame++;
      ctx.players.forEach((p, i) => {
        if (p.isCom) {
          if (state.mainFrame % 6 === 0) {
            state.scores[i] += ctx.rand.u32() % 3;
            state.randCalls++;
          }
        } else if (ctx.pad(p.pid).down & NPAD_A) state.scores[i] += 3;
        ctx.status?.setValue(p.pid, state.scores[i]);
      });
    },
    isFinished: () => opt.mainFrames > 0 && state.mainFrame >= opt.mainFrames,
    result() {
      const s = state.scores;
      const ranks = s.map((v) => s.filter((w) => w > v).length);
      const allSame = s.every((v) => v === s[0]);
      const winLose = ranks.map((r): WinLose => (allSame ? 2 : r === 0 ? 1 : 0));
      return { ranks, winLose, coins: s.map(() => 0) };
    },
  });
  return Object.assign(g, {
    state,
    onGameOpening(): boolean {
      state.openingFrame++;
      return state.openingFrame >= opt.openingFrames || !!g.ctx?.isOpeningSkip();
    },
    onGameOpeningSkip(): boolean {
      return true;
    },
  });
}
