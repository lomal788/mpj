/**
 * 온라인 멀티 화면 독립 모듈 — 공개 진입점. 엔진층(script/game/core·games·view)에 의존하지 않는다(import 경계 = mgm_common.md 9.1).
 * 명세: docs/shell/online.md. 에셋: assets/online(tools/analysis/online_web_assets.py) + assets/mgm01/faces.json.
 */
export * from './flow';
export * from './panels';
export * from './screen';
export * from './view';
export * from './widgets';
