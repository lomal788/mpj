/**
 * 플레이어 설정 흐름(bq::ComUiSettingPlayer) 독립 모듈 — 공개 진입점. 엔진층(script/core·games·view)에 의존하지 않는다.
 * 명세: docs/shell/setplayer.md, 에셋: assets/setplayer(tools/analysis/setplayer_web_assets.py).
 */
export { ControllerApplet, ControllerPool, type AppletState } from './applet';
export { displayName, hardIcon, hasLamp, padTypeOfGamepad } from './names';
export { createSetPlayer, defaultSlots, type SetPlayerHandle, type SetPlayerOptions } from './screen';
export { ALL_WINS, BTN_OK, CHARA_COUNT, CURSOR_NUM, MULTI_WINS, NAME_MAX, SetPlayerFlow, USER, win, type SpEnv, type SpEvent } from './state';
export * from './types';
