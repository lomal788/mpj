/**
 * 공용 3D 무대(shell/stage3d) 계약 — 항구(mgmet)·이후 mgm01~06 무대가 함께 쓴다(docs/shell/mgmet_3d.md §5.1·§8).
 * import 경계(mgm_common.md §9.1): 같은 폴더·three 만. script/core·games·view·game.ts·env.ts 금지.
 * 시간 단위: 원본 프레임(60fps). update(dt) 의 dt 는 초, 내부에서 frame += dt·60.
 */
import type * as THREE from 'three';

/** 에셋 경로 어댑터(페이지가 넣는다). path 는 무대 폴더 기준 상대 경로(예 'model/mgmet_map00.glb') */
export interface AssetSource {
  url(path: string): string;
}

/** 프레임마다 부르는 갱신자. frame = 무대 시작 뒤 누적 원본 프레임, df = 이번 갱신 프레임 수 */
export interface StageUpdater {
  update(df: number, frame: number): void;
}

/** 카메라 주입 지점(B: fsnb 카메라 재생기). apply 가 true 를 돌려주면 그 프레임 카메라를 자기가 정한 것 → 자유 시점이 손대지 않는다 */
export interface CameraDriver {
  apply(camera: THREE.PerspectiveCamera, df: number): boolean;
}

/** glb 재질 extras.fres(03_graphics.md 7.3) */
export interface Fres {
  name?: string;
  shader: { archive?: string; name?: string; options: Record<string, string>; samplerAssign?: Record<string, string> };
  renderInfo?: Record<string, (number | string)[]>;
  params?: Record<string, { value: unknown }>;
  samplers?: { sampler: string; texture: string; slots: string[] }[];
}

/** 프레임별로 구운 재질 애니 값 한 프레임: 재질 이름 → 파라미터 이름 → 성분 오프셋("0x00") → 값 */
export type FmabSample = Record<string, Record<string, Record<string, number>>>;

/**
 * 재질 바꿔치기 지점(B: 바다 근사 셰이더). match 가 맞는 재질(원본 이름 fres.name 또는 three material.name)을
 * create 결과로 바꾼다. update 는 프레임마다 그 재질에 fmab 값(그 재질 이름의 것만, 없으면 null)과 함께 부른다.
 */
export interface MaterialOverride {
  match: string | RegExp;
  create(mesh: THREE.Mesh, src: THREE.Material, fres: Fres | null, ctx: MaterialContext): THREE.Material | Promise<THREE.Material>;
  update?(mat: THREE.Material, frame: number, fmab: Record<string, Record<string, number>> | null): void;
}

/** 재질 만들 때 쓰는 공용 자원(A 가 채운다) */
export interface MaterialContext {
  texture(name: string): Promise<THREE.Texture | null>;
  localRad(name: string): Promise<THREE.Texture | null>;
  /** 장면 반사 큐브(PMREM)·확산 큐브(원본 irr) */
  ibl: { rad: THREE.Texture | null; irr: THREE.CubeTexture | null };
  sun: THREE.DirectionalLight;
}

/** 스켈레탈 애니(fskb, glb 에 구운 클립) 재생 옵션 */
export interface ClipOptions {
  loop?: boolean;
  startFrame?: number;
  speed?: number;
}

/** 재생 중인 클립 하나(맵 애니·로케이터·캐릭터 공통) */
export interface ClipHandle {
  readonly name: string;
  readonly frames: number;
  readonly loop: boolean;
  frame: number;
  speed: number;
  playing: boolean;
  /** 비루프면 frame ≥ frames */
  isFinished(): boolean;
  stop(): void;
}

/** 무대에 올린 모델 하나 */
export interface StageModel {
  readonly name: string;
  readonly root: THREE.Object3D;
  /** glb 의 클립 이름 → 프레임 수 */
  readonly clips: Record<string, number>;
  play(clip: string, opts?: ClipOptions): ClipHandle | null;
  setVisible(v: boolean): void;
}

/** 위치 뼈(로케이터) 월드 변환 */
export interface SocketPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  node: THREE.Object3D;
}

/** 무대 명세(manifest.json, tools/analysis/mgmet_world_assets.py) */
export interface StageManifest {
  set: string;
  models: Record<string, { url: string; bytes: number; vertices: number; triangles: number; bones: number; clips: Record<string, { frames: number; loop: boolean | null; kind: string }>; tex?: string[] }>;
  /** 재질 텍스처 색인(라이트맵·IBL·셰이더 그래프 입력): 이름 → 파일·sRGB·큐브 */
  textures: Record<string, { files: string[]; srgb: boolean; cube: boolean }>;
  /** fmab/fsnb json 경로: 파일 이름 → 'anim/x.json' */
  anims: Record<string, string>;
  /** env 컨테이너 값(env/dir_light/post) */
  env: Record<string, unknown>;
  /** 장면 구성(mgmet_world_assets.py 가 정한 무대 목록·보임) */
  layout?: { name: string; visible: boolean; anim?: string; group?: string }[];
}

/** 지면 질의 결과(월드 좌표) */
export interface GroundHit {
  y: number;
  normal: THREE.Vector3;
  object: THREE.Object3D | null;
}

/**
 * 지면·충돌 질의 — 선택 기능. 항구(mgmet)는 플레이어 입력을 끄고 소켓 자동 이동만 해서 쓰지 않는다(기본 stage.collider = null).
 * 자유 보행 장면(광장 menu00 등)이 원본 충돌 데이터로 구현해 stage.setCollider 로 넣는다.
 */
export interface Collider {
  /** (x, z) 아래 지면. fromY 아래에서 가장 높은 면(없으면 위아래 전체에서 가장 높은 면) */
  groundHeight(x: number, z: number, fromY?: number): GroundHit | null;
  /** 원기둥(반지름 radius, 발 pos.y ~ pos.y+height)을 수평으로 move 만큼 옮길 때 벽(가파른 면)에 밀려 실제로 갈 수 있는 이동 */
  collide(pos: THREE.Vector3, move: THREE.Vector3, radius: number, height: number): THREE.Vector3;
}

/** 카메라 슬롯 우선순위: anim(B 의 fsnb 재생기) > follow(C 의 플레이어 추종) > 자유 시점(페이지) */
export type CameraSlot = 'anim' | 'follow';
