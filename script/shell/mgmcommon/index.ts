/**
 * 미니게임 모드 공용 UI 독립 모듈 — 공개 진입점(B 항구 허브·규칙, C 프리 플레이, D 미니게임 틀이 쓰는 계약). 엔진층(script/game/core·games·view)에 의존하지 않는다(tools/check_mgmcommon.ts 가 검사).
 * 계약: docs/shell/mgm_common.md 9.6, message_window.md 9.4. 에셋: assets/mgmcommon(tools/analysis/mgmcommon_web_assets.py).
 */
export * from './alignment';
export * from './contracts';
export * from './dialogBox';
export * from './fiber';
export * from './guides';
export * from './input';
export * from './itemLayout';
export * from './menuGrid';
export * from './messageFlow';
export * from './messageWindow';
export * from './messageWindow/layout';
export * from './messageWindow/state';
export * from './messageWindow/typer';
export * from './sound';
export * from './text';
export * from './types';
export * from './view';
export * from './window';
export * from './windowLife';
