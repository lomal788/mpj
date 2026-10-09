/**
 * 리듬 공용 박자 시계 — 원본 main ca::rm::snd 와 마스터 박자 시퀀스.
 * [판독: GetBeatToSec @0x7100425d90, GetBeatState @0x7100425ce0(frintp = 올림)]
 * [데이터: subarc_rc_cmn SEQ_BGM_RC_RHYTHM countTrack — docs/engine/02_rhythm.md, analysis/notes/mg1801_rhythm.md 3절]
 *
 * 원본 박자 변수 G14 는 마스터 시퀀스가 쓰는 "마디 안 16분음표 위치 1..16"이다.
 * - timebase 96(4분 = 96틱), 16분 = 24틱. 틱 길이 = 60 / BPM / 96 초.
 * - 마스터는 시작 트리거(G13=1)를 받은 다음 틱부터 센다: 틱 1 에 G14 = 1.
 * - 게임 BGM 은 마디 경계에서 시작한다(G12 핸드셰이크).
 * 원본은 게임이 이 값들을 사운드 스레드에서 읽기만 한다(사운드 → 게임). 웹도 두 경로로 같은 값을 얻는다:
 * - 관측(브라우저, 소리 있음): 페이지가 스텝마다 오디오 쪽 시퀀서(view/seq.ts·view/sound.ts)가 그 스텝 시각까지 쓴 G12·G14 와
 *   게임 BGM 지역 변수 L0 을 넘긴다(observe). 원본 구조 그대로다. 그 시각은 지금 들리는 소리 기준이다(출력 지연 보정 — 원본에 없는 [근사], main.ts).
 * - 프레임 모델(노드 시험·무음): 마스터 시작 뒤 프레임 수로 같은 값을 계산한다. 관측 지연 0 [미확정: 원본 사운드 → 프레임 관측 지연].
 */
import { BEAT_SCALE, F, RM_FPS as FPS } from './data';
import type { RmSoundSnapshot as SoundSnapshot } from './types';

/** 마디 틱 수(timebase 96 × 4박), 게임 BGM 트랙 1 이 L0 = 1 을 쓰는 틱(시작 2박 뒤) [데이터: 02_rhythm.md 5.3] */
const BAR_TICKS = 384;
const BGM_L0_TICK = 192;

export class RhythmClock {
  /** 마스터 시퀀스 시작 뒤 프레임(−1 = 시작 전) */
  masterFrame = -1;
  /** 이번 스텝의 사운드 관측(null = 프레임 모델) */
  private obs: SoundSnapshot | null = null;
  /** 관측으로 센 마디(G14 가 1 이 된 횟수 − 1) */
  private obsBar = -1;
  private obsLastG14 = -1;
  /** 프레임 모델의 리듬 BGM 요청: 접수(G12 = 곡) 틱 */
  private readonly reqs: { label: string; tick: number }[] = [];

  constructor(readonly bpm: number) {}

  /** (60 / BPM) · n · BEAT_SCALE[type] — 원본 float 연산 순서 */
  beatToSec(type: number, n: number): number {
    return F(F(F(60 / this.bpm) * n) * BEAT_SCALE[type]);
  }

  /** 시퀀서 틱 길이(초) */
  get tickSec(): number {
    return 60 / this.bpm / 96;
  }

  /** 마스터 시작(원본 OnGameStartAfter: SQ_BGM_RC_MAIN_RHYTHM + SQ_BGM_RC_MGCMN_OP) */
  start(): void {
    this.masterFrame = 0;
  }

  tick(): void {
    if (this.masterFrame >= 0) this.masterFrame++;
  }

  /** 스텝 첫머리에 이번 스텝의 사운드 관측을 받는다(없으면 null) */
  observe(s: SoundSnapshot | null): void {
    this.obs = s;
    if (!s) return;
    const g = s.globals[14];
    if (g === 1 && this.obsLastG14 !== 1) this.obsBar++;
    this.obsLastG14 = g;
  }

  /** 이번 스텝이 관측값을 쓰는지 */
  get observed(): boolean {
    return this.obs !== null;
  }

  /** 마스터 시작 뒤 시퀀서 틱(−1 = 시작 전) — 프레임 모델 */
  get masterTick(): number {
    if (this.masterFrame < 0) return -1;
    return Math.floor(this.masterFrame / FPS / this.tickSec + 1e-9);
  }

  /** 마디 번호(0 부터, 틱 1 이 0 마디 첫 16분). 시작 전 −1. 관측이면 관측한 마디 첫머리 수 */
  get bar(): number {
    if (this.obs) return this.obsBar;
    const t = this.masterTick;
    return t < 1 ? -1 : Math.floor((t - 1) / BAR_TICKS);
  }

  /** 사운드 전역 변수 14 — 마디 안 16분음표 위치 1..16 (프레임 모델: 시작 전·첫 틱 전 0) */
  get g14(): number {
    if (this.obs) return this.obs.globals[14];
    const t = this.masterTick;
    if (t < 1) return 0;
    return (Math.floor((t - 1) / 24) % 16) + 1;
  }

  /**
   * 사운드 전역 변수 12 — 마스터 countTrack 이 마디 첫 틱에 접수한 곡.
   * 프레임 모델은 값이 아니라 "바뀌는 틱"만 원본과 같다(게임은 요청 때 값과 다른지만 본다 — FUN_7100426b8c·26d24):
   * 시작 전 −1, 0 마디부터 1(오프닝 SQ_BGM_RC_MGCMN_OP 의 G13 = 1 [데이터]), 요청한 곡이 접수되면 웹 대리 값 −(2 + 요청 순번)(원본 곡 ID 아님).
   */
  get g12(): number {
    if (this.obs) return this.obs.globals[12];
    const t = this.masterTick;
    let v = t >= 1 ? 1 : -1;
    this.reqs.forEach((r, i) => {
      if (t >= r.tick) v = -(2 + i);
    });
    return v;
  }

  /**
   * 그 라벨로 재생 요청한 사운드 핸들의 지역 변수 i(원본 SoundHandle::ReadLocalVariable). 핸들이 없으면 null.
   * 프레임 모델은 리듬 BGM 의 L0 만: 접수 전 −1, 접수 틱 0, 접수 + 192틱(2박) 1 [데이터: 게임 BGM 트랙 1, 02_rhythm.md 5.3].
   */
  local(label: string, i: number): number | null {
    if (this.obs) return this.obs.locals[label]?.[i] ?? null;
    const r = this.reqs.find((q) => q.label === label);
    if (!r) return null;
    if (i !== 0) return -1;
    const t = this.masterTick;
    return t >= r.tick + BGM_L0_TICK ? 1 : t >= r.tick ? 0 : -1;
  }

  /**
   * 프레임 모델에 리듬 BGM 재생 요청을 남긴다(원본 SoundModule::Play → 시퀀스가 G13 = 곡 ID). 접수 마디는 bgmStartBar().
   * 관측일 때도 남긴다(관측이 끊기면 프레임 모델이 이어받는다).
   */
  requestBgm(label: string): void {
    this.reqs.push({ label, tick: 1 + BAR_TICKS * this.bgmStartBar() });
  }

  /** 마디 시작 틱(바 b 의 첫 16분, 틱 1 + 384b) 이 지난 첫 프레임인지 */
  isBarStartFrame(b: number): boolean {
    if (this.masterFrame < 1) return false;
    const startSec = (1 + BAR_TICKS * b) * this.tickSec;
    const now = this.masterFrame / FPS;
    const prev = (this.masterFrame - 1) / FPS;
    return prev < startSec - 1e-9 && now >= startSec - 1e-9;
  }

  /**
   * 프레임 모델: 지금 요청한 리듬 BGM 이 시작하는 마디. 재생 중 시퀀스의 ENDPLAY_CHECK 가 마디 끝 8틱 전(마디 안 376틱)에 새 요청을 보고
   * 다음 마디 첫 틱에 G12 = G13 으로 넘긴다 [데이터: rc_cmn/mg1801 FSEQ][재구현 계산: tools/rhythm_seqsim.py, mg1801_rhythm.md 3.3 표].
   * 그래서 마디 안 376틱 전에 요청하면 다음 마디, 그 뒤면 다다음 마디다.
   */
  bgmStartBar(): number {
    const t = this.masterTick;
    if (t < 1) return 0;
    const bar = Math.floor((t - 1) / BAR_TICKS);
    return (t - 1) % BAR_TICKS < 376 ? bar + 1 : bar + 2;
  }

  /** 원본 GetBeatState(type) = ceil(G14 × {0.25 | 0.5 | 1}) */
  beatState(type: number): number {
    const g = this.g14;
    if (type === 0) return Math.ceil(F(g * 0.25));
    if (type === 1 || type === 2) return Math.ceil(F(g * 0.5));
    return g;
  }
}
