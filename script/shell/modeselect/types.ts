/**
 * 모드 선택(맵 메뉴) 모듈 — 명세 JSON(web/assets/modeselect/spec.json, tools/analysis/modesel_web_assets.py)과 어댑터 형식.
 * 레이아웃·폰트·텍스처 형식은 캐릭터 선택 명세(../charselect/types)를 그대로 쓴다. 근거: docs/shell/modeselect.md.
 */
import type { FontSpec, LayoutSpec } from '../charselect/types';

/** 버튼 한 칸(docs 4.1 표) */
export interface ModeEntry {
  button: number;
  /** 웹 이름(bd·rc·mf·pata·kb·ca·mgm·quest·plaza) */
  key: string;
  /** 이름 라벨(im_modeNN_name) */
  name: string;
  /** 설명 라벨(im_mn_modeNN_detail) */
  detail: string;
  /** 섬 아이콘 부품(x_parts_map 안) */
  icon: string;
  /** 사진 창 부품(x_parts_map 안) */
  win: string;
  joycon: boolean;
  /** MapMenuImpl 다음 시퀀스 번호(−2 장면 복귀, −3 광장) */
  next: number;
}

export interface PartMat {
  part: string;
  pane: string;
  tex: string[];
  srt: { t: [number, number]; r: number; s: [number, number] }[];
}

export interface ModeSpec {
  version: number;
  screen: [number, number];
  textures: Record<string, string>;
  srgb?: string[];
  layouts: Record<string, LayoutSpec>;
  fonts: Record<string, FontSpec>;
  texts: Record<string, string>;
  modes: ModeEntry[];
  partMats: Record<string, PartMat[]>;
  align: { pane: string; top: number; pitch: number; margin: number };
  /** 그림 9장으로 나눈 창(docs 6.1): 레이아웃 → [{창 이름, all = 정점색을 프레임에도, 창 크기}] */
  split: Record<string, { n: string; all: boolean; w: number; h: number }[]>;
  /** BexZabutonBlurred 창(docs 6.2): 레이아웃 → [{창 이름, 흐림 버퍼로 바뀌는 재질 칸, 창 크기}] */
  zabuton: Record<string, { pane: string; slots: number[]; w: number; h: number }[]>;
  sounds: Record<string, { file: string; gain: number }>;
}

/** 조작 플레이어 입력(비트 = state.ts PAD). hold = 누르고 있는 비트, trig = 새로 누른 비트 */
export interface ModeSelectInputAdapter {
  poll(): { hold: number; trig: number };
}

export interface ModeSelectSoundAdapter {
  /** SE(라벨, 화면 x 0..1920 — 원본 Play2D 위치) */
  play?(label: string, url: string, gain: number, x?: number): void;
  /** 진동(이름은 원본 미확정 — cursor·deci·error) */
  vibrate?(name: string): void;
}

export interface ModeSelectAssetAdapter {
  /** 'spec.json', 'tex/…' 등 assets/modeselect 기준 경로 → URL */
  url(path: string): string;
}

/** 저장·게임 플래그(docs 4.1): quest = 0x28, bd02/bd03/bd06 = 0x20/0x21/0x22, newBd·newMgm = NEW 표시 */
export interface ModeSelectFlags {
  quest?: boolean;
  bd02?: boolean;
  bd03?: boolean;
  bd06?: boolean;
  newBd?: boolean;
  newMgm?: boolean;
}

export interface ModeSelectResult {
  button: number;
  key: string;
  /** 모드 이름(koKR) */
  name: string;
  next: number;
}

export interface ModeSelectOptions {
  canvas: HTMLCanvasElement;
  input: ModeSelectInputAdapter;
  sound?: ModeSelectSoundAdapter;
  assets: ModeSelectAssetAdapter;
  flags?: ModeSelectFlags;
  /** CheckModePlayable 대체: 0 가능, 1~3 불가(알림), 4 숨김. 기본 = 오프라인(0, 버튼 7 은 flags.quest ? 0 : 4) */
  playable?: (button: number) => number;
  initialCursor?: number;
  /** 뒤 3D 장면 그림(원본 = menu01 맵 월드 화면, 고정 그림 없음 [미확정], docs 6.2). 화면 뒤 전체 + 흐린 사본을 blur 창 칸에. 없으면 자리표시 */
  backdrop?: CanvasImageSource & { width: number; height: number };
  onNotice?(label: string): void;
  onDecided?(r: ModeSelectResult): void;
  onCancel?(): void;
  onFinished?(decided: boolean): void;
}
