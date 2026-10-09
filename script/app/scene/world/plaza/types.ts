/**
 * 광장(menu00, Party Plaza) 3D 모듈 계약 — docs/shell/plaza_3d.md §6.5.
 * A(무대·에셋·충돌·페이지) 가 world 를 만들고, B(이동·카메라)·C(NPC·상호작용·기구)·D(2D UI·온라인) 는 PlazaPart 로 붙는다.
 * import 경계(mgm_common.md §9.1): 같은 폴더·../stage3d·../mgmcommon·../online·../charselect 공개·three 만.
 * 시간 단위: 원본 프레임(60fps). update(df, frame) 의 df = 이번 갱신 프레임 수.
 */
import type * as THREE from 'three';
import type { ClipHandle, ClipOptions, Collider, SocketPose, Stage3D, StageModel } from '../../../../shell/stage3d';

/** 버튼 비트(script/game/core/pad.ts NPAD 와 같은 값) */
export const PLAZA_BTN = {
  A: 1 << 0,
  B: 1 << 1,
  X: 1 << 2,
  Y: 1 << 3,
  L: 1 << 6,
  R: 1 << 7,
  ZL: 1 << 8,
  ZR: 1 << 9,
  PLUS: 1 << 10,
  MINUS: 1 << 11,
  LEFT: 1 << 12,
  UP: 1 << 13,
  RIGHT: 1 << 14,
  DOWN: 1 << 15,
} as const;

/** 한 프레임 입력. 스틱 −1..1(위·오른쪽 +) */
export interface PlazaPad {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

/** CameraParam.json [데이터] */
export interface PlazaCameraParam {
  MainMenuTargetOffsetY: number;
  MainMenuCameraLength: number;
  MainMenuCameraAngle: number;
  MainMenuCameraFovy: number;
  MainMenuCameraTargetPlayRange: number;
  MainMenuCameraFollowSpeed: number;
  MainBalloonTargetOffsetY: number;
  MainBalloonCameraLength: number;
  MainBalloonCameraAngle: number;
  MainBalloonCameraFovy: number;
}

/** MapStructure.json 한 항목 + 변환기가 붙인 값(manifest.plaza.layout) */
export interface PlazaLayoutEntry {
  key: string;
  archive: string;
  dir: 'env' | 'map' | 'model';
  /** 모델 이름(fmdb 줄기). env·충돌은 manifest.models 에 없을 수 있다 */
  fmdb: string;
  hookKey: string;
  hookNode: string;
  nbmap: string;
  anim: string;
  flgDeco: boolean;
}

/**
 * 장식·배경 보임 상태(원본 저장 데이터 bq::save::DecoItemData 대신) — deco.ts 규칙.
 * display[id] = DecoItemData::IsDisplay(DecoItemID id), id 0..0x43(표 = deco.ts DECO_ITEMS). 0x3f·0x40·0x41 = 장식 NPC B·C·E(MapManager +0x68·+0x69·+0x6a)
 */
export interface PlazaDecoState {
  display: boolean[];
  /** MapManager::ApplyBgBd(UnlockBd) 비트: bit0 bd02, bit8 bd03, bit16 bd06 (1 = 해금) */
  unlockBd: number;
}

export interface PlazaWorld {
  readonly stage: Stage3D;
  /** 원본 CollisionMain(PhysX 삼각 메시) — stage.collider 와 같다 */
  readonly collider: Collider;
  readonly cameraParam: PlazaCameraParam;
  readonly layout: readonly PlazaLayoutEntry[];
  readonly deco: PlazaDecoState;
  /** MapStructure key → 올린 모델(없거나 env·충돌이면 null) */
  entry(key: string): StageModel | null;
  /** 모든 무대 모델의 노드(로케이터 뼈) 이름 검색, 월드 변환 */
  socket(name: string): SocketPose | null;
  /** kind 'start'|'balloon'|'quest_return'|'datahouse' → pc_plaza_<kind>_pos_p<p>_pc<pc 2자리> (MapManager::GetAttachSocketPc* 이름 규칙) */
  pcSocket(kind: 'start' | 'balloon' | 'quest_return' | 'datahouse', p: number, pc: number): SocketPose | null;
  /** 항목 key 의 모델에 클립 재생(맵 기본 루프는 world 가 이미 돈다) */
  play(key: string, clip: string, opts?: ClipOptions): ClipHandle | null;
  /** 'CollisionMain' 끄기·켜기(PlayBalloonTakeOff 가 끈다). 꺼지면 collider 질의가 null/원래 이동을 돌려준다 */
  setCollisionEnabled(key: 'CollisionMain' | 'CollisionFirst', on: boolean): void;
  setDeco(state: Partial<PlazaDecoState>): Promise<void>;
  addUpdater(u: { update(df: number, frame: number): void }): () => void;
  readonly frame: number;
  /** 단계 로딩: 다가가면 올리기의 기준 위치(1P 발, 매 프레임 바뀌는 같은 객체) — docs/engine/loader_manager.md §11.4 */
  setFocus?(pos: THREE.Vector3): void;
  /** 단계 로딩: P1·P3 뒤 받기 시작(첫 화면 뒤) */
  startBackground?(): void;
  /** 개발·시험: 단계 로딩 상태 */
  loaderDebug?(): Record<string, unknown>;
}

/** 무대 위 움직이는 사람(플레이어·따라가기·원격). B·C 가 ctx.actors 에 넣고 서로·D 가 읽는다 */
export interface PlazaActor {
  readonly slot: number;
  readonly kind: 'input' | 'follow' | 'remote' | 'npc';
  /** pcNN(플레이어) 또는 npcNNN */
  readonly chara: string;
  readonly root: THREE.Object3D;
  /** 발 위치(월드) */
  readonly pos: THREE.Vector3;
  /** Y 축 회전(라디안) */
  yaw: number;
  /** 수평 속도(m/s) */
  speed: number;
  /** 지금 모션 이름(co_idle00 등) */
  motion: string;
  /** 머리 높이(PCHeight) */
  height: number;
}

export interface PlazaPlayerSetup {
  slot: number;
  /** pcNN */
  chara: string;
  isCom: boolean;
  /** 이 기기 플레이어(false = 온라인 원격) */
  local: boolean;
  name: string;
}

export interface PlazaSound {
  se(label: string): void;
  bgm(label: string | null): void;
  /** 명세 소리 하나(부품 UI SE) — 페이지 공용 소리 출력(docs/engine/04_sound.md §13.11.1). 없으면 부품이 스스로 낸다 */
  play?(label: string, url: string, gain: number): void;
}

/** 앱 저장 중 광장이 쓰는 칸(원본 칸 0 MenuData·SystemData, docs/engine/16_save.md §4). 페이지가 꽂는다 */
export interface PlazaSave {
  menuBit(n: number): boolean;
  setMenuBit(n: number, on: boolean): void;
  request(): void;
  isProcessing(): boolean;
}

/** 장면 나가기(페이지가 다음 화면으로) */
export type PlazaExit = { k: 'balloon' } | { k: 'session' } | { k: 'cancel' };

export interface PlazaContext {
  readonly world: PlazaWorld;
  readonly players: readonly PlazaPlayerSetup[];
  readonly actors: PlazaActor[];
  pad(slot: number): PlazaPad | null;
  readonly sound: PlazaSound;
  readonly save?: PlazaSave;
  /** 2D UI 겹(캔버스 위 HTML 상자, 크기 = 캔버스) */
  readonly overlay: HTMLElement;
  /** web/assets/ 기준 URL(예 'plaza/ui/x.png') */
  assetUrl(path: string): string;
  readonly params: URLSearchParams;
  /** 갈래 사이 사건(이름 → 값). 이름 규칙: '<갈래>:<사건>' 예 'interact:area' */
  on(name: string, fn: (v: unknown) => void): () => void;
  emit(name: string, v?: unknown): void;
  /** 장면 끝내기 */
  exit(e: PlazaExit): void;
}

/** 갈래가 붙이는 부품. update 순서 = parts.ts 목록 순서, 무대 맵 애니 뒤·카메라 driver 앞 */
export interface PlazaPart {
  readonly name: string;
  update?(df: number, frame: number): void;
  /** 카메라·렌더 뒤(2D UI 배치) */
  afterRender?(): void;
  resize?(w: number, h: number): void;
  /** 시험 훅 window.__mpj.plaza.parts[name] */
  debug?(): unknown;
  dispose?(): void;
}

export type PlazaPartFactory = (ctx: PlazaContext) => Promise<PlazaPart>;
