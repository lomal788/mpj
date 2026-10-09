/**
 * 미니게임 장면 로더 계약 — 공용 에셋 변환기(tools/analysis/asset_convert.py + mg_assets.py 미니게임 어댑터)가 만든 web/assets/mg/<id>/manifest.json 형식.
 * 설계: docs/engine/13_asset_converter.md §5·§7. import 경계(mgm_common.md §9.1): 같은 폴더·three·../stage3d·../plaza(attachToSocket)·../../lib/assetcore 만.
 */
import type { StageManifest } from '@app/common/render3d';

/** 배치 항목 기본 애니(clip = glb 스켈레탈, fmab = 재질 애니, vis = fvbb 뼈 보임) */
export interface MgDefaultAnim {
  kind: 'clip' | 'fmab' | 'vis';
  name: string;
  loop: boolean;
  speed: number;
  frame: number;
}

/** 장면 배치 한 항목(mg_assets.build_layout) */
export interface MgLayoutEntry {
  key: string;
  model: string;
  visible: boolean;
  /** table(게임 표 판독)·rule(이름 규칙 추정)·spawn(부모 뼈마다)·nbmap:<이름>·hook-host */
  source: string;
  hookKey?: string;
  hookNode?: string;
  pos?: [number, number, number];
  quat?: [number, number, number, number];
  scale?: [number, number, number];
  anims: MgDefaultAnim[];
}

/** fsnb 카메라 클립 색인(asset.cameras) */
export interface MgCameraInfo {
  file: string;
  frames: number;
  loop: boolean;
  mode: string | null;
  cameras: number;
  lights: number;
  fogs: number;
}

/** 단계 로딩 계획(변환기가 첫 카메라 시야로 정함): p0 = 0 프레임에 보임, p1 = 첫 카메라 다른 프레임, p2 = 그 밖 보이는 배치 */
export interface MgFirst {
  camera: string | null;
  p0: string[];
  p1: string[];
  p2: string[];
  /** 키 → 월드 경계 구 [x, y, z, r] */
  bounds: Record<string, [number, number, number, number]>;
}

/** manifest.mg (미니게임 어댑터) */
export interface MgExt {
  id: string;
  /** 배치 근거 */
  scene: string;
  layout: MgLayoutEntry[];
  camera: { first: string | null; game: string | null };
  first: MgFirst;
}

/** manifest.asset (코어 처리기 공통) */
export interface AssetExt {
  archive: string;
  category: string;
  name: string;
  cameras?: Record<string, MgCameraInfo>;
  sockets?: string[];
  envChosen?: Record<string, string>;
  envVariants?: Record<string, { kind: string; env: Record<string, unknown> }>;
  collision?: string | null;
  collisionModels?: string[];
  ui?: { file: string; layouts: number; textures: number; texts: number; externalParts: string[] } | null;
  msg?: string[] | null;
  sound?: { file: string; se: number; bgm: number; skipped: number } | null;
  fx?: { file: string; emitterSets: string[]; textures: number } | null;
  data?: string[];
  pending?: { graphs: { material: string; model: string; graph: Record<string, string>; sass: string | null }[] };
  shared?: string[];
}

export interface MgManifest extends StageManifest {
  adapter: string;
  asset: AssetExt;
  mg: MgExt;
  models: StageManifest['models'] & Record<string, { tex?: string[] }>;
}

/** collision.json 한 항목 — 충돌 형상 데이터만(런타임은 다른 갈래). vertices = 월드 xyz 나열, indices = 삼각형, shapes = 기본 형상(box·sphere·capsule …) */
export interface MgCollisionEntry {
  apx: string;
  attr: number[];
  vertices: number[];
  indices: number[];
  shapes: { geometry: string | number; pos: number[]; quat: number[]; halfExtents?: number[]; radius?: number; halfHeight?: number; unread?: boolean }[];
}

export type MgCollisionData = Record<string, MgCollisionEntry>;
