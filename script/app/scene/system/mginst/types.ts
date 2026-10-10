import type * as THREE from 'three';
import type { MgmAssetAdapter, MgmPadSource, MgmSpecPart } from '@app/common/ui/types';

export type GuideGroup = 'A' | 'B' | 'C';
export type ReadyLayout = 'vs4' | 'vs8' | '1vs3' | '2vs2' | '1vs1';
export type MgInstPhase = 'entering' | 'ready' | 'ending' | 'complete' | 'disposed';
export interface MgInstRawRow {
  Name: string;
  Title: string;
  DetailExp: string;
  AdvantagePlayerExp: string;
  [key: string]: string | number;
}
export interface MgInstAssets extends MgmSpecPart {
  texts: Record<string, string>;
  raw: {
    controller: Record<string, string | number>[];
    mgInst: MgInstRawRow[];
    mgInstRank: Record<string, string | number>[];
  };
}
export interface MgInstPlayer {
  pid: number;
  character: string;
  cpu: boolean;
  local?: boolean;
  advantage?: boolean;
}
export interface MgInstContent {
  game: string;
  title: string;
  rule: string;
  operationTitle: string;
  operations: string[];
  advantageTitle: string;
  advantage: string;
  readyLabel: string;
  okLabel: string;
  group: GuideGroup;
  controllerId: number;
  controllerHold: string;
  instLayerId: number;
  usesGyro: boolean;
  raw: Readonly<MgInstRawRow>;
}
export interface MgInstOptions {
  canvas: HTMLCanvasElement;
  assets: MgmAssetAdapter;
  game: string;
  players: readonly MgInstPlayer[];
  rowIndex?: number;
  layout?: ReadyLayout;
  group?: GuideGroup;
  pads?: MgmPadSource;
  inputGate?: 'external' | 'layoutIntroApprox';
  onReady?(): void;
}
export interface MgInstHandle {
  readonly phase: MgInstPhase;
  readonly content: MgInstContent;
  step(): void;
  render(): void;
  setInputAllowed(allowed: boolean): void;
  setReady(pid: number): void;
  setPreviewTexture(texture: THREE.Texture | null): void;
  dispose(): void;
}
