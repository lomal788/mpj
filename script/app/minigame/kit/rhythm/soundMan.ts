/**
 * 리듬 공용 소리 로직 — 원본 main ca::rm::RmSoundMan(docs/engine/02_rhythm.md 9.1·6.3). 사건만 낸다(소리는 view/sound.ts).
 * - PlayExcellentSe 겹침 수와 그 보조 파이버
 * - 게임 BGM·종료 BGM 곡 교대 확인(사운드 전역 G12·G14, 게임 BGM L0 을 읽는다)
 * - BGM 이름 규칙(접두 = "SQ_BGM_" + 대문자 미니게임 이름)
 */
import type { RhythmClock } from './clock';
import { F } from './data';
import type { RmEventSink } from './types';

/**
 * RmSoundMan+0x28 의 0x38 B 파이버(FUN_7100426fcc 생성, 본문 FUN_7100427040) — PlayExcellentSe 상태 [판독: main].
 * 파이버는 매 프레임 timer += dt, timer ≥ limit 이면 count = 1. limit 은 마스터 시작(FUN_71004263c8) 때 (60/BPM)·0.5.
 */
interface ExcellentSe {
  /** +0x28 마지막 새 재생 뒤 경과(초) */
  timer: number;
  /** +0x2C 반 박(초). 마스터 시작 전 0 */
  limit: number;
  /** +0x30 L0 로 쓰는 수 */
  count: number;
  /** +0x10..0x20 SQ_SE_RC_JUST 핸들이 있는지 */
  handle: boolean;
}

/**
 * 게임 BGM 이름 — 원본 FUN_7100441990 [판독]: 모드 3 이면 SQ_BGM_RC_REMIX. 아니면 SetGameBgmName 값(isGenericBgm ? SQ_BGM_RC_GENERIC : _A)이
 * "SQ_BGM_MG1801" 을 품을 때만 BPM > 120 이면 _B, 그 뒤 모드 2 이거나 chart01(+0x470)이면 _C 로 바꾼다(뒤가 앞을 덮는다).
 */
/** @orig main:7100441990 ref */
export function rmGameBgmName(PREFIX: string, mode: number, bpm: number, chart01: boolean, isGenericBgm: boolean): string {
  if (mode === 3) return 'SQ_BGM_RC_REMIX';
  let name = isGenericBgm ? 'SQ_BGM_RC_GENERIC' : `${PREFIX}_A`;
  if (name.includes(PREFIX)) {
    if (bpm > 120) name = `${PREFIX}_B`;
    if (mode === 2 || chart01) name = `${PREFIX}_C`;
  }
  return name;
}

/**
 * 종료 BGM 이름 — 원본 FUN_71004421a0 [판독]: SetGameBgmFinName("SQ_BGM_MG1801_MG_ENDING") 에서 시작해
 * 모드 0 이면 _A_MG_ENDING, BPM > 120 이면 _B_MG_ENDING, 모드 2 이거나 chart01 이면 _C_MG_ENDING(뒤가 앞을 덮는다).
 * 그래서 롱(모드 1)·BPM 120 만 SQ_BGM_MG1801_MG_ENDING 그대로다. 라벨은 모두 subarc_mg1801.fsst 에 있다 [데이터].
 * finName = SetGameBgmFinName 값(mg1801 은 `${PREFIX}_MG_ENDING`).
 */
/** @orig main:71004421a0 ref */
export function rmEndingBgmName(finName: string, PREFIX: string, mode: number, bpm: number, chart01: boolean): string {
  let name = finName;
  if (mode === 0) name = `${PREFIX}_A_MG_ENDING`;
  if (bpm > 120) name = `${PREFIX}_B_MG_ENDING`;
  if (mode === 2 || chart01) name = `${PREFIX}_C_MG_ENDING`;
  return name;
}

/** 코스 중간 게임(RmGameWork+0x2C ≠ 0)의 끝 BGM — 원본 FUN_71004429c0 [판독]: _A_INTER_END, BPM > 120 이면 _B, 모드 2·chart01 이면 _C */
/** @orig main:71004429c0 ref */
export function rmInterEndBgmName(PREFIX: string, mode: number, bpm: number, chart01: boolean): string {
  let name = `${PREFIX}_A_INTER_END`;
  if (bpm > 120) name = `${PREFIX}_B_INTER_END`;
  if (mode === 2 || chart01) name = `${PREFIX}_C_INTER_END`;
  return name;
}

export class RmSoundMan {
  private readonly excellent: ExcellentSe = { timer: 0, limit: 0, count: 0, handle: false };
  /**
   * RmSoundMan 의 곡 교대 확인 상태 [판독 FUN_7100426948·26b8c·26c2c·269d8·26d24]:
   * +0x38 요청 때 읽은 G12, +0x3C 게임 BGM 접수, +0x3D 게임 BGM L0 == 1, +0x3E 종료 BGM 접수(한 번 참이면 계속 참)
   */
  readonly snd = { g12: -1, accepted: false, intro: false, endAccepted: false };

  constructor(
    private readonly events: RmEventSink,
    private readonly rhythm: RhythmClock,
    /** 원본 bex::MainModule::GetDeltaTime */
    private readonly dt: number,
  ) {}

  /** 원본 FUN_7100427040 한 프레임 — RmSoundMan 생성(SetupGame)이 제품보다 먼저라 같은 프레임에서 제품 파이버보다 앞서 돈다 */
  /** @orig main:7100427040 ref */
  tickExcellentSe(): void {
    const e = this.excellent;
    e.timer = F(this.dt + e.timer);
    if (e.limit <= e.timer) e.count = 1;
  }

  /** 마스터 시작(FUN_71004263c8) 때 +0x2C = (60 / BPM) · 0.5 */
  /** @orig main:71004263c8 ref */
  setExcellentLimit(bpm: number): void {
    this.excellent.limit = F(F(60 / bpm) * 0.5);
  }

  /**
   * 원본 RmSoundMan::PlayExcellentSe(-1, true) @0x7100426e38 [판독]:
   *   핸들 없음 || limit ≤ timer || count > 3 → 새로 Play("SQ_SE_RC_JUST"), timer = 0, count = 1
   *   그 밖 → (60/BPM)·0.5 < timer 면 새로 Play(timer 는 그대로), count + 1
   *   끝에 L0 = count.
   * 핸들 수명: 원본은 시퀀스가 끝나면 핸들이 죽는다. 코드표에 있는 G8 이면 시퀀스가 마지막 단계 뒤 wait 96(2박) 이라
   * 반 박 조건이 먼저 걸려 결과가 같고, 코드표 밖 G8(무음 fin)만 핸들이 바로 죽는다. 로직은 G8 을 모르므로 핸들은 첫 재생 뒤 살아 있다고 둔다 [근사].
   */
  /** @orig main:7100426e38 ref */
  playExcellentSe(): void {
    const e = this.excellent;
    let play = false;
    if (!e.handle || e.limit <= e.timer || e.count > 3) {
      play = true;
      e.handle = true;
      e.timer = 0;
      e.count = 1;
    } else {
      if (F(F(60 / this.rhythm.bpm) * 0.5) < e.timer) play = true;
      e.count = e.count + 1;
    }
    this.events.push({ k: 'justSound', combo: e.count, play });
  }

  // ------------------------------------------------------------------ RmSoundMan 곡 교대 (사운드 전역 G12·G14, 게임 BGM L0 을 읽는다)

  /** 원본 FUN_7100426948 [판독]: (재생 중이 아니면) +0x38 = G12, Play(게임 BGM). 끝에 +0x3C·+0x3D 를 함께 0(16비트 쓰기) */
  /** @orig main:7100426948 ref */
  requestGameBgm(bgmLabel: string): void {
    const r = this.rhythm;
    this.snd.g12 = r.g12;
    this.events.push({ k: 'se', label: bgmLabel });
    r.requestBgm(bgmLabel);
    this.snd.accepted = false;
    this.snd.intro = false;
  }

  /** 원본 FUN_7100426b8c [판독]: +0x3C 면 참. G14 == 16 이면 거짓. G12 == +0x38 이면 거짓. 아니면 +0x3C = 1, +0x38 = G12, 참 */
  /** @orig main:7100426b8c ref */
  gameBgmAccepted(): boolean {
    const r = this.rhythm;
    if (this.snd.accepted) return true;
    if (Math.trunc(r.g14) === 16) return false;
    const g12 = r.g12;
    if (g12 === this.snd.g12) return false;
    this.snd.accepted = true;
    this.snd.g12 = g12;
    return true;
  }

  /** 원본 FUN_7100426c2c [판독]: +0x3D 면 참. 게임 BGM 핸들이 없거나 (int)(G14·0.25) == 4 면 거짓. 핸들 L0 == 1 이면 +0x3D = 1, 참 */
  /** @orig main:7100426c2c ref */
  gameBgmIntro(bgmLabel: string): boolean {
    const r = this.rhythm;
    if (this.snd.intro) return true;
    const l0 = r.local(bgmLabel, 0);
    if (l0 === null || Math.trunc(F(r.g14 * 0.25)) === 4) return false;
    if (l0 !== 1) return false;
    this.snd.intro = true;
    return true;
  }

  /**
   * 종료 BGM 요청 — 원본 FUN_71004269d8 [판독]: +0x38 = G12, Play, +0x3C = 0, +0x3E(16비트) = 0.
   * 코스 중간(+0x2C ≠ 0)은 OnGameMain 이 +0x448 을 직접 Play 해 +0x38·+0x3E 를 건드리지 않는다(+0x38 은 단계 3 접수 때 값).
   */
  /** @orig main:71004269d8 ref */
  requestEndingBgm(endingLabel: string, direct: boolean): void {
    const r = this.rhythm;
    if (!direct) {
      this.snd.g12 = r.g12;
      this.snd.accepted = false;
      this.snd.endAccepted = false;
    }
    this.events.push({ k: 'se', label: endingLabel });
    r.requestBgm(endingLabel);
  }

  /** 원본 FUN_7100426d24 [판독]: +0x3E 면 참. G12 == +0x38 이면 거짓. 아니면 +0x3E = 1, +0x38 = G12, 참 */
  /** @orig main:7100426d24 ref */
  endingBgmAccepted(): boolean {
    const r = this.rhythm;
    if (this.snd.endAccepted) return true;
    const g12 = r.g12;
    if (g12 === this.snd.g12) return false;
    this.snd.endAccepted = true;
    this.snd.g12 = g12;
    return true;
  }
}
