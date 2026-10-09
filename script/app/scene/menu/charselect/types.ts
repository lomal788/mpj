/**
 * 캐릭터 선택 모듈 — 명세 JSON(web/assets/charselect/spec.json, tools/analysis/charsel_web_assets.py)과 어댑터 형식.
 * 명세 필드 뜻: tools/analysis/charsel_web_assets.py 머리 주석, 근거: docs/shell/charselect.md.
 * fonts: json 에는 공용 글꼴 참조 {dir, chars}(fontTable.ts FontRef)만 있고 Render2D.load(resolveFonts)가 FontSpec 필드를 채운다.
 *   GlyphSpec.sheet = 원본 시트 URL(앱 텍스처 키), rgba = 컬러 시트(아니면 회색조 → R8), u0..v1 = 시트 안 글리프 사각형(docs/engine/font_assets.md).
 */

export type Rgba = [number, number, number, number];

export interface NodeSpec {
  /** 원본 페인 이름 */
  n: string;
  /** 부모 노드 번호(−1 = 루트) */
  p: number;
  k: 'null' | 'pic' | 'txt' | 'wnd' | 'part';
  v: boolean;
  /** 자식에 알파 전파 */
  ia: boolean;
  /** 원점: x −1 왼·0 가운데·1 오른, y 1 위·0 가운데·−1 아래 */
  o: [number, number];
  po: [number, number];
  t: [number, number];
  /** z 회전(도) */
  r: number;
  s: [number, number];
  z: [number, number];
  a: number;
  vc?: Rgba[];
  m?: number;
  uv?: number[];
  txt?: { font: string; fs: [number, number]; cs: number; al: [number, number]; text: string };
  wnd?: { fs: { l: number; r: number; t: number; b: number }; frame: number; content: number; flags: number };
  part?: string;
  mag?: [number, number];
  /** 부품 덮어쓰기: 보이기·정점색, pane 기본 정보(t 위치·s 배율·z 크기, docs 12.5) */
  ov?: { n: string; vis?: boolean; vc?: Rgba[]; t?: [number, number]; s?: [number, number]; z?: [number, number] }[];
}

export interface MatSpec {
  name: string;
  black: Rgba;
  white: Rgba;
  tex: { name: string; wu: string; wv: string }[];
  srt: { t: [number, number]; r: number; s: [number, number] }[];
  /** 재질 블렌드(원본 mat1 flags bit10): op 1 더하기·2 빼기·3 거꾸로 빼기, 계수 0 영·1 하나·2 대상색·3 1−대상색·4 원본 알파·5 1−원본 알파·6 대상 알파·7 1−대상 알파·8 원본색·9 1−원본색 */
  blend?: { op: number; src: number; dst: number };
}

export interface TrackSpec {
  node?: number;
  mat?: number;
  prop: string;
  step: boolean;
  keys: number[][];
}

export interface AnimSpec {
  len: number;
  loop: boolean;
  tracks: TrackSpec[];
}

export interface LayoutSpec {
  size: [number, number];
  nodes: NodeSpec[];
  mats: MatSpec[];
  anims: Record<string, AnimSpec>;
}

export interface GlyphSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  left: number;
  adv: number;
  baseline: number;
  /** 컬러 아이콘 글리프(extension 폰트) */
  color: boolean;
  sheet: string;
  rgba: boolean;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface FontSpec {
  height: number;
  width: number;
  ascent: number;
  lineFeed?: number;
  glyphs: Record<string, GlyphSpec>;
}

export interface CharaSpec {
  /** 표 번호(selectCharacterList 순서) */
  index: number;
  btn: number;
  pc: string;
  label: string;
  scale: number;
  cam: [number, number, number];
  fov: number;
  idle: string;
  /** 잠금 플래그 번호(폴린 1, 닌군 0), 없으면 null */
  lock: number | null;
  glb: string | null;
  motions?: string;
  anims?: string[];
  clips?: Record<string, { frames: number; loop: boolean }>;
  eye?: {
    tex: string | null;
    material: string | null;
    params: [string, string];
    /** 눈알 정점의 알베도 알파가 0(흰자)인 캐릭터 — 알베도 알파를 눈동자 마스크에 곱한다(docs 12.2) */
    albedoMask?: boolean;
    /** 셰이더 그래프 눈꺼풀(동키콩·가봉) [추정 식, docs 12.2] */
    lid?: { tex: string; edge: number; x0: [number, number]; y0: [number, number]; xmin: [number, number]; bottom: number };
  };
  albedo?: [number, number];
  /** 몸 재질 셰이더 그래프 규칙(docs 12.11) [판독]: 알베도 좌표 = S·(uv0 + Σ k·정점색·파라미터) + O, 기본색 섞기 */
  body?: BodyGraph;
}

export interface BodyGraph {
  uv: {
    s: [number, number];
    o: [number, number];
    /** axis 0 = u, 1 = v. color = 'c1.x' 꼴(정점색 _C1/_C2 성분), param = material_utility_parameterN, comp = x/y/z/w */
    terms: { axis: 0 | 1; color: string; param: string; comp: string; k: number }[];
  };
  /** base = mix(base, base·f + color, mask) — mask·f 는 GLSL 식(c1·c2·PN.x 이름) */
  tint?: { mask: string; f: string; color: [number, number, number] };
}

export interface Spec {
  version: number;
  screen: [number, number];
  textures: Record<string, string>;
  /** sRGB 형식 텍스처 이름 */
  srgb?: string[];
  layouts: Record<string, LayoutSpec>;
  fonts: Record<string, FontSpec>;
  texts: Record<string, string>;
  chars: CharaSpec[];
  sounds: Record<string, { file: string; gain: number }>;
  /** 배경음악(menu01 SM_BGM_MENU_MAP, docs 12.3) */
  bgm?: { label: string; file: string; gain: number; loopStart: number; loopEnd: number };
  /** 캐릭터 보이스 변형(docs 12.4) */
  voices?: Record<string, { label: string; files: string[]; gain: number }>;
  env: { lightColor: [number, number, number]; lightRotDeg: [number, number, number]; near: number; far: number; rtScale: number };
}

/** 플레이어 칸마다 이번 프레임 입력(비트 = state.ts PAD). hold = 누르고 있는 비트, trig = 새로 누른 비트 */
export interface CharSelectInputAdapter {
  poll(player: number): { hold: number; trig: number };
}

export interface CharSelectSoundAdapter {
  /** SE(라벨, 화면 x 0..1920 — 원본 Play2D 위치) */
  play?(label: string, url: string, gain: number, x?: number): void;
  /** 캐릭터 보이스(원본 SQ_VOI_PC%02d_MENU00_SELECT, 변형 하나를 고른 파일, docs 12.4). slot = 카드 슬롯(정지용) */
  voice?(label: string, url: string, gain: number, slot: number): void;
  voiceStop?(slot: number): void;
  /** 배경음악 시작(이미 같은 라벨이 돌고 있으면 무시) — 루프 구간 초 단위(docs 12.3) */
  bgm?(label: string, url: string, gain: number, loopStart: number, loopEnd: number): void;
  /** 배경음악 정지(페이드 초) */
  bgmStop?(fade: number): void;
  vibrate?(player: number, name: string): void;
  /** 화면 진입 때 미리 받아 디코드할 소리 URL(SE·보이스·BGM, docs 12.10) */
  preload?(urls: string[]): void;
}

export interface CharSelectAssetAdapter {
  /** 'spec.json', 'tex/…', 'chara/…' 등 assets/charselect 기준 경로 → URL */
  url(path: string): string;
}

export interface CharSelectPlayer {
  type: 'human' | 'com';
  /** 계정 이름(카드 이름표) */
  name?: string;
  /** 이전 캐릭터 표 번호 */
  initial?: number;
  /** 컨트롤러 본체 색 '#rrggbb'(원본 = 하드웨어 색, 기본 = 캡처의 네온 블루 #06b6df) [참고 이미지, docs 12.5] */
  controllerColor?: string;
}

export interface CharSelectOptions {
  canvas: HTMLCanvasElement;
  input: CharSelectInputAdapter;
  sound?: CharSelectSoundAdapter;
  assets: CharSelectAssetAdapter;
  players: CharSelectPlayer[];
  unlocked?: { pauline: boolean; ninji: boolean };
  disabled?: number[];
  /** 0..n−1 정수 */
  rand?: (n: number) => number;
  onDecided?(result: number[]): void;
  onCancel?(): void;
  onFinished?(decided: boolean): void;
}
