/**
 * 소리 도우미 — MinigameModeScene PlaySe/PlaySe2D/PlayBgm/StopBgm/IsPlayBgm/FadeAndEntryCancel (docs/shell/mgm_common.md 6.9·7.3·7.4).
 * BGM 은 핸들 하나(새로 틀면 이전 것을 즉시 끊음). 그룹 소속은 6.9 표의 라벨 규칙.
 */
import type { MgmSoundAdapter } from './types';

/** MGM_BGM_KIND → 라벨(main @0x71015d8470, 41칸; 33 = 무효) */
export const MGM_BGM_KIND: readonly (string | null)[] = [
  'SM_JIN_MGMET_OPENING',
  'SM_BGM_MGMET_ENTRANCE_JMP',
  'SM_BGM_MGMET_ENTRANCE_NOINTRO_JMP',
  'SM_BGM_MGM00_RESULT',
  'SM_BGM_MGM01_FREEPLAY',
  'SM_JIN_MGM01_FREEPLAY_ENDSTINGER',
  'SM_BGM_MGM02_NORMAL_JMP',
  'SM_JIN_MGM02_NORMAL_END',
  'SM_BGM_MGM02_NORMAL_NOINTRO_JMP',
  'SM_BGM_MGM02_BBMG_JMP',
  'SM_BGM_MGM02_FINAL_JMP',
  'SM_JIN_MGM02_FINAL_END',
  'SM_BGM_MGM03_LEVEL01_JMP',
  'SM_BGM_MGM03_LEVEL02_JMP',
  'SM_BGM_MGM03_LEVEL03_JMP',
  'SM_BGM_MGM04_PHASE1_JMP',
  'SM_BGM_MGM00_MGSEL_ROLL',
  'SM_JIN_MGM04_PHASE1_END',
  'SM_BGM_MGM04_PHASE1_NOINTRO_JMP',
  'SM_BGM_MGM04_PHASE2_JMP',
  'SM_BGM_MGM04_PHASE2_NOINTRO_JMP',
  'SM_JIN_MGM04_PHASE2_END',
  'SM_BGM_MGM04_FINAL_JMP',
  'SM_BGM_MGM04_FINAL_NOINTRO_JMP',
  'SM_JIN_MGM04_FINAL_END',
  'SM_BGM_MGM04_RM_OPENING_JMP',
  'SM_BGM_MGM04_RM_MAIN_JMP',
  'SM_BGM_MGM04_RM_MGRES',
  'SM_BGM_MGM04_RM_RESULT_SUCCESS',
  'SM_BGM_MGM04_RM_RESULT_FAIL',
  'SM_BGM_MGM05_OPENING_JMP',
  'SM_BGM_MGM05_MAIN_JMP',
  'SM_BGM_MGM05_MGRES',
  null,
  'SM_BGM_MGM05_RESULT_SUCCESS',
  'SM_BGM_MGM05_RESULT_FAIL',
  'SM_JIN_MGM06_OPENING',
  'SM_BGM_MGM06_MAIN',
  'SM_JIN_MGM06_BFMG',
  'SM_BGM_MGM06_RESULT_SUCCESS',
  'SM_BGM_MGM06_RES',
];

/** FadeTimePreset 칸 → 초(global 프리셋 덮어쓴 값, 6.9). 11 이후 0 */
export const FADE_TIME_PRESET: readonly number[] = [0.1, 0, 0.7, 0.2, 1.4, 2.0, 0.5, 6.0, 0.5, 4.0, 10.0];

export const fadeTime = (preset: number): number => FADE_TIME_PRESET[preset] ?? 0;

/** 모드 장면 사운드 프리셋의 U 레코드 치환(message_window.md 7절) */
export const MODE_PRESET_REPLACE: Readonly<Record<string, string>> = { SQ_SE_SYS_MES_PUT: 'SQ_VOI_SYS_MES_PUT' };

/** FadeAndEntryCancel 그룹(6.9): 0x22 BGM·0x01 SQ_SE 전부·0x25 보이스·0x29 환경음 */
export const FADE_ENTRY_GROUPS: readonly number[] = [0x22, 0x01, 0x25, 0x29];

/** 라벨의 그룹 소속(6.9 표: 0x01 = SQ_SE 전부 [데이터 fspj 집계], 0x22~0x25·0x29 = 라벨 글자). 0x20·0x21 은 모든 소리 */
export function groupsOf(label: string): number[] {
  const g = [0x20, 0x21];
  if (label.startsWith('SQ_SE')) g.push(0x01);
  if (label.includes('_BGM_')) g.push(0x22);
  if (label.includes('_JIN_')) g.push(0x23);
  if (label.includes('_SE_')) g.push(0x24);
  if (label.includes('_VOI_')) g.push(0x25);
  if (label.includes('_AMB_')) g.push(0x29);
  return g;
}

export type SoundLog = { type: 'se'; label: string; x?: number } | { type: 'bgm'; label: string } | { type: 'bgmStop'; fade: number } | { type: 'stopGroups'; groups: number[]; fade: number } | { type: 'blocked'; label: string };

export class MgmSound {
  private bgmLabel: string | null = null;
  readonly entryCancel = new Set<number>();
  /** 시험·디버그용 최근 사건 */
  readonly log: SoundLog[] = [];

  constructor(
    private readonly sounds: Record<string, { file: string; gain: number }>,
    private readonly url: (p: string) => string,
    private readonly out: MgmSoundAdapter = {},
    /** 모드 장면 프리셋 치환을 쓸지 */
    private readonly modePreset = true,
  ) {}

  private blocked(label: string): boolean {
    return groupsOf(label).some((g) => this.entryCancel.has(g));
  }

  private record(e: SoundLog): void {
    this.log.push(e);
    if (this.log.length > 64) this.log.shift();
  }

  /** SoundModule::Play / Play2D(x = 화면 x 0..1920) */
  playSe(label: string, x?: number): void {
    const l = this.modePreset ? (MODE_PRESET_REPLACE[label] ?? label) : label;
    if (this.blocked(l)) {
      this.record({ type: 'blocked', label: l });
      return;
    }
    this.record(x === undefined ? { type: 'se', label: l } : { type: 'se', label: l, x });
    const s = this.sounds[l];
    if (s) this.out.play?.(l, this.url(s.file), s.gain, x);
  }

  playSe2D(label: string, x: number): void {
    this.playSe(label, x);
  }

  /** PlayBgm(kind): kind < 41 && kind ≠ 33 일 때만, 이전 핸들 즉시 끊고 새로 */
  playBgm(kind: number): boolean {
    const label = kind >= 0 && kind < MGM_BGM_KIND.length ? MGM_BGM_KIND[kind] : null;
    if (!label) return false;
    if (this.bgmLabel) {
      this.out.bgmStop?.(0);
      this.record({ type: 'bgmStop', fade: 0 });
      this.bgmLabel = null;
    }
    if (this.blocked(label)) {
      this.record({ type: 'blocked', label });
      return false;
    }
    this.bgmLabel = label;
    this.record({ type: 'bgm', label });
    const s = this.sounds[label];
    this.out.bgm?.(label, s ? this.url(s.file) : null);
    return true;
  }

  /** StopBgm(preset) */
  stopBgm(preset: number): void {
    if (!this.bgmLabel) return;
    const f = fadeTime(preset);
    this.out.bgmStop?.(f);
    this.record({ type: 'bgmStop', fade: f });
    this.bgmLabel = null;
  }

  /** IsPlayBgm = 핸들이 붙어 있음(곡 끝 감지는 어댑터 범위 [근사]) */
  isPlayBgm(): boolean {
    return this.bgmLabel !== null;
  }

  get currentBgm(): string | null {
    return this.bgmLabel;
  }

  /** FadeAndEntryCancel: 네 그룹을 프리셋 6(0.5 s)으로 멈추고 새 재생을 막는다 */
  fadeAndEntryCancel(): void {
    const groups = [...FADE_ENTRY_GROUPS];
    const f = fadeTime(6);
    this.out.stopGroups?.(groups, f);
    this.record({ type: 'stopGroups', groups, fade: f });
    if (this.bgmLabel) {
      this.out.bgmStop?.(f);
      this.bgmLabel = null;
    }
    for (const g of groups) this.entryCancel.add(g);
  }

  /** SetEntryCancelGroup(…, 0) — 원본 해제 위치는 이 범위 밖 [설계] */
  releaseEntryCancel(): void {
    this.entryCancel.clear();
  }

  vibrate(pid: number, name: string): void {
    this.out.vibrate?.(pid, name);
  }

  voice(key: string, voiceId: string): void {
    this.out.voice?.(key, voiceId);
  }

  duck(group: number, on: boolean): void {
    this.out.duck?.(group, on);
  }
}
