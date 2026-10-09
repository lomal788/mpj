/**
 * 앱 하나의 화면 전환(globalThis.__transition) 설치와 장면 들고 남 규칙 — mpj 연결. 설계: docs/engine/15_transition.md §5.
 * - installTransition(stage): 앱 화면 상자(.jw-stage) 맨 위에 DOM 와이프 하나를 붙이고 rAF·performance.now 시계로 1/60 스텝을 돌린다(멱등).
 *   처음 설치 때 bootTransition() = 원본 부팅처럼 Black 으로 덮는다(첫 화면 준비 뒤 sceneIn 이 Black 으로 연다).
 *   화면(페이지)이 바뀌어도 이 div 와 상태는 그대로라 전환이 끊기지 않는다.
 * - sceneIn(): 원본 SceneBase::UpdateMain 단계 2(장면 시작 FadeIn(마지막 종류, 1.0)) — 웹은 닫혀 있을 때만.
 * - sceneOut(): 단계 4(장면 바꾸기 요청 → FadeOut(White, 1.0) 끝까지) — 이미 닫혀 있으면 바로.
 * - logicWipe(): 로직 시간으로 진행하는 소유자(항구·결과 무대·모드 선택·미니게임 틀)의 Transition — 처음 쓸 때 앱 상태를 이어받고 앱이 그것을 비춘다(release = 끝).
 */
import { appTransition, LogicTransition, Transition, TransitionDriver, WIPE_BLACK, WIPE_WHITE } from '../lib/transition';
import { DomWipe } from '../lib/transition-dom';

const G = globalThis as { __transitionView?: { wipe: DomWipe; driver: TransitionDriver } };

export function installTransition(stage: HTMLElement): Transition {
  const t = appTransition();
  if (G.__transitionView) return t;
  bootTransition();
  const wipe = new DomWipe({ parent: stage });
  const driver = new TransitionDriver(t, { now: () => performance.now(), request: (cb) => void requestAnimationFrame(cb) }, (x) => wipe.draw(x));
  driver.start();
  G.__transitionView = { wipe, driver };
  return t;
}

export function bootTransition(): void {
  appTransition().cover(WIPE_BLACK);
}

export function sceneIn(): void {
  const t = appTransition();
  if (t.closed && !t.following) t.fadeIn(t.lastType, 1);
}

export function sceneOut(): Promise<void> {
  const t = appTransition();
  if (t.following || t.closed) return Promise.resolve();
  t.fadeOut(WIPE_WHITE, 1);
  return t.wait();
}

export function logicWipe(): LogicTransition {
  return new LogicTransition(appTransition());
}
