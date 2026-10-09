/**
 * 리듬 공용 사건 → 공용 UI·소리(화면 어댑터). mg1801/view/index.ts onStep 에서 옮긴 몇 줄(docs/engine/02_rhythm.md 14절).
 * 게임 화면은 이것을 부른 뒤 자기 것(디버그 글자, 3D 이펙트)을 더한다.
 */
import type * as THREE from 'three';
import type { RmEvent } from '../types';
import type { RmSoundMap } from './sound';
import type { RmUi } from './ui';

/** 시작·끝·판정 텔롭: 원본 레이아웃 텔롭(RmUi) + 레이아웃 FX 트리거 소리(START/FINISH 의 SE·보이스, FINISH 의 SQ_SE_MG_FINISH) */
export function rmTelopView(ui: RmUi, sound: RmSoundMap, e: Extract<RmEvent, { k: 'telop' }>, frame: number, bpm: number, camera: THREE.Camera): void {
  ui.push(e, frame);
  if (e.judge === 'FINISH') sound.onEvent({ k: 'se', label: 'SQ_SE_MG_FINISH' }, bpm, camera);
  if (e.judge === 'START' || e.judge === 'FINISH') for (const label of [`SQ_SE_TLP_${e.judge}`, `WD_VOI_LOC_SYS_${e.judge}`]) sound.onEvent({ k: 'se', label }, bpm, camera);
}

/** PERFECT 텔롭(RmUi) + SQ_SE_MG1800_PERFECT */
export function rmPerfectView(ui: RmUi, sound: RmSoundMap, e: Extract<RmEvent, { k: 'perfect' }>, frame: number, bpm: number, camera: THREE.Camera): void {
  ui.push(e, frame);
  sound.onEvent({ k: 'se', label: 'SQ_SE_MG1800_PERFECT' }, bpm, camera);
}
