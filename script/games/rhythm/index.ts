/**
 * 리듬 공용 모듈(ca::rm) 공개 API — 로직(import 0). 화면 어댑터는 ./view/*(three·view 사용)에서 따로 import 한다.
 * 설계·경계·mgscene 연결 계획: docs/engine/02_rhythm.md 14절.
 */
export * from './data';
export * from './types';
export { RhythmClock } from './clock';
export { type RmChartRow, type RmRawChart, readChartRows } from './chart';
export { type RmChartRule, type RmConfig, type RmCourse, RmGameWork, type RmOptions, resolveRmConfig } from './gameWork';
export { RmSoundMan, rmEndingBgmName, rmGameBgmName, rmInterEndBgmName } from './soundMan';
export { starJudge } from './status';
export { type RmBeatData, RmMgSceneBase, type RmSceneInit } from './scene';
