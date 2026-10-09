/**
 * 결과 3D 무대 계약 — 호출 계약은 shell/mgscene/resultContract.ts(미니게임 공용 틀 [mg-scene] 소유) 를 그대로 쓰고, 이 무대만의 선택 확장을 더한다.
 * 확장(SHARED.md [mg-result3d] ③④): 주사위 갈래 텔롭·눈 표시, 게임 3D 장면에 올리기, PataPata 판정용 MGList 숫자 id, MGEntry 인원, 결과 쓰기.
 * 명세 web/assets/mgresult/spec.json(tools/analysis/mgresult_web_assets.py), 문서 docs/shell/minigame_result.md §12.
 */
import type * as THREE from 'three';
import type { CharaSpec, Spec } from '../charselect/types';
import type { ResultStage, ResultStageHost, ResultStageInput } from '../mgscene/resultContract';
import type { LogicSpec } from './logic';

export type { ResultPlayer, ResultStage, ResultStageHost, ResultStageInput, ResultStageOptions, WinLose } from '../mgscene/resultContract';

export interface ResultStageInputExt extends ResultStageInput {
  listId?: number;
  entryCount?: number;
}

export interface ResultStageHostExt extends ResultStageHost {
  genericTelop?: { start(msg: string): void; out(): void; finished(): boolean };
  dice?(pid: number, value: number): void;
  world?: { scene: THREE.Scene; origin?: { pos: [number, number, number]; quat: [number, number, number, number] } };
  onEvent?(e: ResultStageEvent): void;
}

export type ResultStageEvent =
  | { type: 'pattern'; pattern: number; model: string | null; camera: string | null; telopNo: number; telopPlace: string; dice: boolean }
  | { type: 'fadeOut' | 'setup' | 'fadeIn' | 'cameraStart' | 'cameraEnd' | 'telopOut' | 'done' }
  | { type: 'telopIn'; frame: number; no: number; place: string; coin: boolean }
  | { type: 'motion'; pid: number; a: string; b: string | null }
  | { type: 'dice'; pid: number; value: number }
  | { type: 'diceWinner'; pid: number; writes: { pid: number; winLose: 0 | 1 }[] };

export interface ResultStageExt extends ResultStage {
  readonly writes: { pid: number; winLose: 0 | 1 }[];
  readonly debug: () => Record<string, unknown>;
}

export interface MgResultSpec extends LogicSpec {
  version: number;
  clips: string[];
  env: Spec['env'];
  cams: string[];
  chars: CharaSpec[];
}

export const SPEC_PATH = 'mgresult/spec.json';
export const camPath = (name: string): string => `mgresult/cam/${name}.json`;
