/**
 * 미니게임 모드 공용 UI 모듈 — 명세 JSON(web/assets/mgmcommon/{spec,mgmet,mgm01}.json, tools/analysis/mgmcommon_web_assets.py)과 어댑터 형식.
 * 레이아웃·폰트·텍스처 형식은 캐릭터 선택 명세(../charselect/types)를 그대로 쓴다. 근거: docs/shell/mgm_common.md 9.6, message_window.md 9.4.
 */
import type { FontSpec, LayoutSpec } from '@game/lib/layout';

/** 메시지 속성(msbt ATR1): 번호는 meswin.attrLists 의 목록 순서 */
export interface MsgAttr {
  wt: number;
  ch: number;
  pos: number;
  ox: number;
  oy: number;
  emo: number;
  wi: number;
}

export interface MeswinData {
  /** WindowData 9칸 = ATR WindowType 번호 */
  window: { type: string; pos: string; layout: string; layoutChoice: string }[];
  /** CharacterData = ATR Character 번호 */
  chara: { id: string; type: string; voice: string; icon: string; name: string | null }[];
  positions: string[];
  /** Emotion 표(ATR Emotion 번호) → 보이스 키(VoiceKey_Normal / VoiceKey_Choices) */
  emotion?: { normal: string | null; choices: string | null }[];
  attrLists: Record<'WindowType' | 'Character' | 'Position' | 'Emotion' | 'WindowInfo', string[]>;
}

export interface MgmSpecPart {
  version: number;
  screen: [number, number];
  textures: Record<string, string>;
  srgb?: string[];
  layouts: Record<string, LayoutSpec>;
  /** 그림 9장으로 나눈 창(modeselect.md 6.1) */
  split: Record<string, { n: string; all: boolean; w: number; h: number }[]>;
  /** BexZabutonBlurred 창(modeselect.md 6.2) */
  zabuton: Record<string, { pane: string; slots: number[]; w: number; h: number }[]>;
  lineSpace: Record<string, Record<string, number>>;
  /** 화면별 글꼴(같은 이름의 공용 글꼴을 덮어씀, partyrule.md 9.2). 없으면 공용 그대로 */
  fonts?: Record<string, FontSpec>;
}

export interface MgmSpec extends MgmSpecPart {
  fonts: Record<string, FontSpec>;
  texts: Record<string, string>;
  msgAttr: Record<string, MsgAttr>;
  meswin: MeswinData;
  sounds: Record<string, { file: string; gain: number }>;
  soundNotes?: Record<string, { volume: number; note: string }>;
  missingTextures?: Record<string, string[]>;
}

export interface MgmAssetAdapter {
  /** 'spec.json', 'tex/…' 등 assets/mgmcommon 기준 경로 → URL */
  url(path: string): string;
}

/** 플레이어마다 이번 프레임 입력(bex 비트, input.ts PAD). hold = 누르고 있는 비트, trig = 새로 누른 비트 */
export interface MgmPadSource {
  poll(pid: number): { hold: number; trig: number };
}

/** 소리 출력 어댑터. 없는 함수는 무시한다 */
export interface MgmSoundAdapter {
  /** SE. x = 화면 x 0..1920(원본 Play2D 위치), 없으면 가운데 */
  play?(label: string, url: string, gain: number, x?: number): void;
  /** BGM 시작(같은 핸들 하나 — 이전 것은 sound.ts 가 먼저 stopBgm(0) 으로 끊는다). 파일이 없으면 url = null */
  bgm?(label: string, url: string | null): void;
  /** BGM 정지(페이드 초) */
  bgmStop?(fade: number): void;
  /** 그룹 정지(FadeAndEntryCancel) — 그룹 번호 목록과 페이드 초 */
  stopGroups?(groups: number[], fade: number): void;
  vibrate?(pid: number, name: string): void;
  /** 메시지 보이스 트리거(vo_message.ftrg 키, 화자 VoiceID) — 변형 고르기 [미확정] */
  voice?(key: string, voiceId: string): void;
  /** 더킹(그룹 0x13 = 무음 0.3 s, 0x0d = BGM 0.6 배 0.3 s; 끌 때 1.0 으로 0.3 s — mgm_common.md 6.9) */
  duck?(group: number, on: boolean): void;
}
