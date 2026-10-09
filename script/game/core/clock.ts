/**
 * 시간 — 로직 한 step = 원본 한 프레임. 원본 게임 코드는 bex::MainModule::GetDeltaTime()(초)을 빼서 타이머를 줄인다.
 *
 * [판독: docs/engine/01_core.md] boot.nbinit 은 Fixed60 이지만 nnMain 이 Variable60 으로 덮어쓴다.
 * - 리듬 장면(RmMgSceneBase 파생, mg1801~mg1810)과 온라인은 Fixed60 을 강제한다 → GetDeltaTime = f32(1/60) = 0x3C888889 (FRAME_DT 와 비트 일치).
 * - 그 밖의 오프라인 미니게임은 실측 프레임 시간(최대 0.05 s)이다. 그런 게임을 옮길 때는 게임 쪽에서 dt 공급을 바꾼다.
 */
import { F } from './fmath';

export const FPS = 60;

/** 한 프레임의 델타 시간(초, f32) */
export const FRAME_DT = F(1 / FPS);

/** 브라우저 루프 한 스텝(ms) */
export const STEP_MS = 1000 / FPS;

/**
 * rAF 한 번에 도는 최대 스텝 수(2 s). 더 밀린 스텝은 다음 rAF 로 넘긴다 — 무거운 렌더(느린 GPU, 초당 1~2 장)에서도 로직이 시계를 따라가게.
 * 로직 스텝 하나는 mg1801 에서 0.5 ms 안쪽이다[실행: tools/sync_measure.ts, 화면 쪽 onStep 포함]
 */
export const MAX_STEPS = 120;

/** 밀린 스텝이 이보다 많으면(5 s, 긴 멈춤) 넘친 시간을 버린다(main.ts) */
export const MAX_BACKLOG_STEPS = 300;
