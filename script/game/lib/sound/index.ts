/**
 * 사운드 런타임 공용 코어 — import 0(외부 라이브러리·DOM·WebAudio·프로젝트 파일 없음). 설계·원본 계약: docs/engine/04_sound.md §13(웹 런타임 계약),
 * 판독 근거는 같은 문서 §3(공개 API)·§4.1(INFO·플레이어 최대치)·§4.7(세팅 프리셋)·§6.7(3D)·§13.10(엔진 난수)과 docs/shell/mgm_common.md 6.9(그룹·FadeTimePreset·Ducking).
 *
 * 원본 단위를 그대로 옮긴다(숫자·명령만 낸다, 소리 출력 없음):
 * - SoundCatalog = 사운드 아카이브 라벨 표 하나(웹 manifest 하나) + 세팅 프리셋 U 레코드(라벨 치환).
 * - SoundCore    = bex::sound::SoundModule Play/Play3D·SoundHandle(칸 + 세대)·StopGroup_Type·DuckingGroup·플레이어 한도(playableSoundMax)·
 *                  아카이브 전체 한도(0x220B)·3D(Sound3DEngine::UpdateAmbientParam). 명령(start/stop/stopAt/gain/pan/pause/local)을 쌓고 어댑터가 비운다.
 * - SoundRandom  = nn::atk 시퀀스 엔진 난수(FUN_71005df19c 전역 LCG).
 *
 * 규칙 두 벌(사용자 결정 2026-10-09: 기본 = 원본 규칙): RULES_WEB = 이전 웹 결과 그대로(이전 전후 골든 같음), RULES_ORIGINAL = 원본. 항목별 차이는 04 §13.4.
 * 결정성: Math.random·벽시계 없음. 시각(오디오 시각, 초)은 생성 때 주입한 now(), 난수는 SoundRandom.
 * 할당: update()·drain() 은 정상 상태 할당 0(명령 객체 풀, 핸들 칸 배열은 모자랄 때만 늘린다).
 */

/** 로직 고정 스텝(초) */
export const STEP_SEC = 1 / 60;

export type SoundBus = 'se' | 'voice' | 'bgm';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------- 3D [판독 main, 04_sound.md 6.7]
/** 리스너 하나(nn::atk Sound3DListener). view = 리스너 행렬(카메라 뷰 행렬, 열 우선 16칸, 앞 = −Z) */
export interface Listener3d {
  pos: V3;
  view: ArrayLike<number>;
  interiorSize: number;
  maxVolumeDistance: number;
  unitDistance: number;
  /** 출력 대상 플래그 비트 0 */
  output: boolean;
}

/** 사운드 3D 정보(FSAR) */
export interface Sound3dInfo {
  flags: number;
  decayRatio: number;
  decayCurve: number;
  dopplerFactor: number;
}

/** 관리자(nn::atk Sound3DManager) 기본값 [판독 FUN_71005b92b0: +0x40 = 32, +0x44 = 0.9f, +0x48 = 0] */
export const SOUND3D_MANAGER = { maxPriorityReduction: 32, panRange: 0.9, sonicVelocity: 0 };
/** 팬 계산의 스피커 각 [판독 FUN_71005b8df0: 앞 π/6, 뒤 2π/3, 서라운드 오프셋 0] */
const FRONT = Math.PI / 6;
const REAR = (2 * Math.PI) / 3;

export interface Ambient3d {
  volume: number;
  priority: number;
  /** −1(왼)..1(오른) */
  pan: number;
  /** 앞뒤 서라운드 팬(스테레오 출력에서는 쓰지 않는다) */
  span: number;
}

const vp: [number, number] = [0, 0];
const ps: [number, number] = [0, 0];
const fr = Math.fround;

/** volumeAndPriority 의 원본 float 판(할당 없음, 결과 = vp) */
function volumeAndPriorityF32(d: number, l: Listener3d, s: Sound3dInfo): [number, number] {
  let v = 1;
  if (l.maxVolumeDistance < d) {
    const x = fr(fr(d - l.maxVolumeDistance) / l.unitDistance);
    if (s.decayCurve === 2) v = Math.max(0, fr(fr(fr(1 - s.decayRatio) * -x) + 1));
    else if (s.decayCurve === 1) v = fr(Math.pow(s.decayRatio, x));
  }
  vp[0] = v;
  vp[1] = -Math.trunc(fr(fr(1 - v) * SOUND3D_MANAGER.maxPriorityReduction));
  return vp;
}

/** panSurround 의 원본 float 판(할당 없음, 결과 = ps). 구간 식은 같고 연산마다 float 로 자른다 */
function panSurroundF32(l: Listener3d, pos: V3): [number, number] {
  const m = l.view;
  let x = fr(fr(fr(fr(m[0] * pos.x) + fr(m[4] * pos.y)) + fr(m[8] * pos.z)) + m[12]);
  const y = fr(fr(fr(fr(m[1] * pos.x) + fr(m[5] * pos.y)) + fr(m[9] * pos.z)) + m[13]);
  let z = fr(fr(fr(fr(m[2] * pos.x) + fr(m[6] * pos.y)) + fr(m[10] * pos.z)) + m[14]);
  const dist = fr(Math.sqrt(fr(fr(fr(x * x) + fr(y * y)) + fr(z * z))));
  const interior = l.interiorSize;
  if (dist === 0) {
    x = 0;
    z = 0;
  } else {
    let h = fr(Math.sqrt(fr(fr(x * x) + fr(z * z))));
    if (interior < h) h = interior;
    x = fr(fr(x * h) / dist);
    z = fr(fr(z * h) / dist);
  }
  const th = fr(Math.atan2(x, -z));
  const PI = Math.PI;
  let pan: number;
  let sur: number;
  if (th < -REAR) {
    pan = PI === REAR ? -0.5 : PI / (REAR - PI) + th / (REAR - PI);
    sur = 1;
  } else if (th < -PI / 2) {
    pan = -1;
    sur = -REAR === -PI / 2 ? 0.5 : (PI / 2) / (-REAR + PI / 2) + th / (-REAR + PI / 2);
  } else if (th < -FRONT) {
    pan = -1;
    sur = -PI / 2 === -FRONT ? -0.5 : (PI / 2) / (-PI / 2 + FRONT) + th / (-PI / 2 + FRONT);
  } else if (th < FRONT) {
    pan = FRONT !== 0 ? th / FRONT : 0;
    sur = -1;
  } else if (th < PI / 2) {
    pan = 1;
    sur = PI / 2 === FRONT ? -0.5 : (PI / 2) / (FRONT - PI / 2) - th / (FRONT - PI / 2);
  } else if (th < REAR) {
    pan = 1;
    sur = PI / 2 === REAR ? 0.5 : (PI / 2) / (PI / 2 - REAR) - th / (PI / 2 - REAR);
  } else {
    pan = PI === REAR ? 0.5 : -PI / (REAR - PI) + th / (REAR - PI);
    sur = 1;
  }
  pan = fr(pan);
  sur = fr(sur);
  const r = fr(fr(Math.sqrt(fr(fr(x * x) + fr(z * z)))) / interior);
  const c = fr((Math.cos(FRONT) + Math.cos(REAR)) * 0.5);
  const range = SOUND3D_MANAGER.panRange;
  ps[0] = fr(fr(r * pan) * range);
  ps[1] = fr(fr(fr(fr(1 - r) * fr(c / fr(c - Math.cos(REAR)))) + fr(fr(r * sur) * range)) + 1);
  return ps;
}

/** calc3d 를 out 에 쓴다. f32 = 원본 float 산술(할당 없음), 아니면 이전 웹 식(calc3d) 결과를 옮긴다 */
export function calc3dInto(out: Ambient3d, listeners: readonly Listener3d[], s: Sound3dInfo, pos: V3, f32 = false): Ambient3d {
  if (!f32) {
    const a = calc3d(listeners, s, pos);
    out.volume = a.volume;
    out.priority = a.priority;
    out.pan = a.pan;
    out.span = a.span;
    return out;
  }
  const f = s.flags & 0x1f;
  out.volume = 1;
  out.priority = 0;
  out.pan = 0;
  out.span = 0;
  if (f & 2) out.priority = -SOUND3D_MANAGER.maxPriorityReduction;
  if (f & 1) out.volume = 0;
  let outputs = 0;
  for (let i = 0; i < listeners.length; i++) if (listeners[i].output) outputs++;
  for (let i = 0; i < listeners.length; i++) {
    const l = listeners[i];
    if (f & 3) {
      const dx = fr(pos.x - l.pos.x);
      const dy = fr(pos.y - l.pos.y);
      const dz = fr(pos.z - l.pos.z);
      const vq = volumeAndPriorityF32(fr(Math.sqrt(fr(fr(fr(dx * dx) + fr(dy * dy)) + fr(dz * dz)))), l, s);
      if (l.output && f & 1) out.volume = Math.max(out.volume, vq[0]);
      if (f & 2) out.priority = Math.max(out.priority, vq[1]);
    }
    if (f & 0xc && l.output && outputs === 1) {
      const pq = panSurroundF32(l, pos);
      if (f & 4) out.pan = pq[0];
      if (f & 8) out.span = pq[1];
    }
  }
  return out;
}

/** 볼륨·우선순위 [판독 FUN_71005b8858] */
/** @orig main:71005b8858 ref */
function volumeAndPriority(d: number, l: Listener3d, s: Sound3dInfo): [number, number] {
  let v = 1;
  if (l.maxVolumeDistance < d) {
    const x = (d - l.maxVolumeDistance) / l.unitDistance;
    if (s.decayCurve === 2) v = Math.max(0, (1 - s.decayRatio) * -x + 1);
    else if (s.decayCurve === 1) v = s.decayRatio ** x;
  }
  return [v, -Math.trunc((1 - v) * SOUND3D_MANAGER.maxPriorityReduction)];
}

/** 팬·서라운드 [판독 FUN_71005b8918 → FUN_71005b8ab8] */
function panSurround(l: Listener3d, pos: V3): [number, number] {
  const m = l.view;
  let x = m[0] * pos.x + m[4] * pos.y + m[8] * pos.z + m[12];
  const y = m[1] * pos.x + m[5] * pos.y + m[9] * pos.z + m[13];
  let z = m[2] * pos.x + m[6] * pos.y + m[10] * pos.z + m[14];
  const dist = Math.sqrt(x * x + y * y + z * z);
  const interior = l.interiorSize;
  if (dist === 0) {
    x = 0;
    z = 0;
  } else {
    let h = Math.sqrt(x * x + z * z);
    if (interior < h) h = interior;
    x = (x * h) / dist;
    z = (z * h) / dist;
  }
  const th = Math.atan2(x, -z);
  const PI = Math.PI;
  let pan: number;
  let sur: number;
  if (th < -REAR) {
    pan = PI === REAR ? -0.5 : PI / (REAR - PI) + th / (REAR - PI);
    sur = 1;
  } else if (th < -PI / 2) {
    pan = -1;
    sur = -REAR === -PI / 2 ? 0.5 : (PI / 2) / (-REAR + PI / 2) + th / (-REAR + PI / 2);
  } else if (th < -FRONT) {
    pan = -1;
    sur = -PI / 2 === -FRONT ? -0.5 : (PI / 2) / (-PI / 2 + FRONT) + th / (-PI / 2 + FRONT);
  } else if (th < FRONT) {
    pan = FRONT !== 0 ? th / FRONT : 0;
    sur = -1;
  } else if (th < PI / 2) {
    pan = 1;
    sur = PI / 2 === FRONT ? -0.5 : (PI / 2) / (FRONT - PI / 2) - th / (FRONT - PI / 2);
  } else if (th < REAR) {
    pan = 1;
    sur = PI / 2 === REAR ? 0.5 : (PI / 2) / (PI / 2 - REAR) - th / (PI / 2 - REAR);
  } else {
    pan = PI === REAR ? 0.5 : -PI / (REAR - PI) + th / (REAR - PI);
    sur = 1;
  }
  const r = Math.sqrt(x * x + z * z) / interior;
  const c = (Math.cos(FRONT) + Math.cos(REAR)) * 0.5;
  const range = SOUND3D_MANAGER.panRange;
  return [r * pan * range, (1 - r) * (c / (c - Math.cos(REAR))) + r * sur * range + 1];
}

/**
 * 원본 Sound3DEngine::UpdateAmbientParam [판독 main 0x71005b8e40~0x71005b90c0].
 * 볼륨은 출력 플래그가 선 리스너들의 최댓값, 우선순위는 최댓값.
 * 팬·서라운드는 출력 플래그가 선 리스너가 정확히 하나일 때만 계산한다(둘 이상이면 0).
 * 도플러(피치)·필터는 계산하지 않는다(mg1801 사운드의 dopplerFactor 0, 필터 비트는 COUNT_STICK 만).
 */
export function calc3d(listeners: readonly Listener3d[], s: Sound3dInfo, pos: V3, f32 = false): Ambient3d {
  if (f32) return calc3dInto({ volume: 1, priority: 0, pan: 0, span: 0 }, listeners, s, pos, true);
  const f = s.flags & 0x1f;
  const out: Ambient3d = { volume: 1, priority: 0, pan: 0, span: 0 };
  if (f & 2) out.priority = -SOUND3D_MANAGER.maxPriorityReduction;
  if (f & 1) out.volume = 0;
  const outputs = listeners.filter((l) => l.output).length;
  for (const l of listeners) {
    if (f & 3) {
      const d = Math.hypot(pos.x - l.pos.x, pos.y - l.pos.y, pos.z - l.pos.z);
      const [v, p] = volumeAndPriority(d, l, s);
      if (l.output && f & 1) out.volume = Math.max(out.volume, v);
      if (f & 2) out.priority = Math.max(out.priority, p);
    }
    if (f & 0xc && l.output && outputs === 1) {
      const [pan, span] = panSurround(l, pos);
      if (f & 4) out.pan = pan;
      if (f & 8) out.span = span;
    }
  }
  return out;
}

// ---------------------------------------------------------------- 표 [판독 docs/shell/mgm_common.md 6.9]

/** FadeTimePreset 칸 → 초(global 프리셋이 덮은 값). 11 이후 0 */
export const FADE_TIME_PRESET: readonly number[] = [0.1, 0, 0.7, 0.2, 1.4, 2.0, 0.5, 6.0, 0.5, 4.0, 10.0];

/** mgsound_setting 의 'FADE_TIME_NN' 이름 → 초(NN = 칸 번호 [추정]). 이름 꼴이 아니면 fallback */
export function fadeTimeSec(name: string, fallback = 0.7): number {
  const m = /^FADE_TIME_(\d+)$/.exec(name);
  if (!m) return fallback;
  return FADE_TIME_PRESET[Number(m[1])] ?? 0;
}

/** Ducking 칸 → {목표 음량, 켤 때 시간, 해제 시간}(초) */
export const DUCKING_PRESET: Readonly<Record<number, { readonly volume: number; readonly onSec: number; readonly offSec: number }>> = {
  0x0d: { volume: 0.6, onSec: 0.3, offSec: 0.3 },
  0x13: { volume: 0, onSec: 0.3, offSec: 0.3 },
};

/** 아카이브 전체 동시 재생 한도(INFO 0x220B, 메인·서브 같음) [데이터 04 §4.1] */
export const INSTANCE_MAX = { seq: 64, stream: 6, wave: 16 } as const;

/** 소리 그룹(bex::sound::Group) 번호 — 소속 규칙은 soundGroupsOf */
export const GROUP_ALL = 0x20;
export const GROUP_BGM = 0x22;
export const GROUP_JIN = 0x23;
export const GROUP_SE = 0x24;
export const GROUP_VOI = 0x25;
export const GROUP_STREAM = 0x26;
export const GROUP_SEQ = 0x27;
export const GROUP_WAVE = 0x28;
export const GROUP_AMB = 0x29;

export type OrigKind = 'seq' | 'stream' | 'wave';

/**
 * 라벨 하나의 그룹 소속 [판독 FUN_71000c4730·FUN_71000c3dcc, 6.9 표]. lo = 0x00~0x1f(사운드 사용자 파라미터 비트 29 칸), hi = 0x20~0x29 의 비트(g − 0x20).
 * userBits 가 없으면 접두로 대신한다: SQ_SE → 0x01, SQ_VOI → 0x02 [데이터 집계]. 종류값 그룹 0x26/0x27/0x28 = 스트림·시퀀스·웨이브 [추정].
 */
export function soundGroupsOf(label: string, kind: OrigKind, userBits?: number, out: [number, number] = [0, 0]): [number, number] {
  let lo = userBits ?? 0;
  if (userBits === undefined) {
    if (label.startsWith('SQ_SE')) lo |= 1 << 1;
    else if (label.startsWith('SQ_VOI')) lo |= 1 << 2;
  }
  let hi = 0b11;
  if (label.includes('_BGM_')) hi |= 1 << (GROUP_BGM - 0x20);
  if (label.includes('_JIN_')) hi |= 1 << (GROUP_JIN - 0x20);
  if (label.includes('_SE_')) hi |= 1 << (GROUP_SE - 0x20);
  if (label.includes('_VOI_')) hi |= 1 << (GROUP_VOI - 0x20);
  if (label.includes('_AMB_')) hi |= 1 << (GROUP_AMB - 0x20);
  hi |= 1 << ((kind === 'stream' ? GROUP_STREAM : kind === 'seq' ? GROUP_SEQ : GROUP_WAVE) - 0x20);
  out[0] = lo >>> 0;
  out[1] = hi;
  return out;
}

function inGroup(lo: number, hi: number, g: number): boolean {
  if (g < 0x20) return ((lo >>> g) & 1) === 1;
  if (g < 0x40) return ((hi >>> (g - 0x20)) & 1) === 1;
  return false;
}

// ---------------------------------------------------------------- 규칙

/** 원본 스위치(04 §13.4). 'web' = 이전 웹 근사, 'original' = 원본 */
export interface SoundRules {
  readonly id: 'web' | 'original';
  /** 그룹 정지: web = 틀 소리 채널만(0x22·0x20), original = 소속 규칙으로 같은 코어의 모든 핸들 */
  readonly groups: 'web' | 'original';
  /** 시퀀스 엔진 난수: web = Math.random(소비자 쪽), original = SoundRandom(LCG) */
  readonly random: 'web' | 'original';
  /** BGM 끼리: web = 새 BGM 이 반복하는 이전 BGM 을 지금 멈춤, original = 그런 규칙 없음 */
  readonly supersede: 'web' | 'original';
  /** 아카이브 전체 한도(시퀀스 64·스트림 6·웨이브 16) */
  readonly instanceLimit: boolean;
  /** 프리셋 치환: web = 같은 이름만, original = '**' 두 글자 와일드카드도. 둘 다 대상이 표에 있을 때만(웹 명세는 치환된 파일을 원래 라벨 아래 두기도 한다) */
  readonly resolve: 'web' | 'original';
  /** 살아 있는 3D 핸들을 update 마다 다시 계산 */
  readonly track3d: boolean;
  /** 3D 식 f32 */
  readonly f32: boolean;
  /** 원본 사운드 정보 표(meta.json: 그룹 비트·플레이어·우선순위·무음 라벨)를 쓴다(04 §13.11.3) */
  readonly meta: boolean;
  /** 셸 메시지·시스템 고리(덕킹·진동·보이스, 04 §13.11.2) — 코어는 보관만, 연결 층이 읽는다 */
  readonly shellHooks: boolean;
  /** 장면 퇴장: 다른 장면이 시작되면 앞 장면 소리 0x20 즉시 정지(04 §13.12.1). web = 화면이 ms 뒤 자기 소리 정지 */
  readonly sceneExit: boolean;
  /** Play2D 위치 → 팬: original = FUN_71000c044c 식 f32, web = clamp((x − 960)/960)(04 §13.12.2) */
  readonly pan2d: 'web' | 'original';
}

export const RULES_WEB: Readonly<SoundRules> = {
  id: 'web',
  groups: 'web',
  random: 'web',
  supersede: 'web',
  instanceLimit: false,
  resolve: 'web',
  track3d: false,
  f32: false,
  meta: false,
  shellHooks: false,
  sceneExit: false,
  pan2d: 'web',
};

export const RULES_ORIGINAL: Readonly<SoundRules> = {
  id: 'original',
  groups: 'original',
  random: 'original',
  supersede: 'original',
  instanceLimit: true,
  resolve: 'original',
  track3d: true,
  f32: true,
  meta: true,
  shellHooks: true,
  sceneExit: true,
  pan2d: 'original',
};

/** 기본 규칙 — 2026-10-09 사용자 결정: 원본(04 §13.4). 소비자는 만들 때 읽는다. RULES_WEB 으로 바꾸면 이전 웹 결과(골든 WEB) */
export const soundDefaults: { rules: Readonly<SoundRules> } = { rules: RULES_ORIGINAL };

// ---------------------------------------------------------------- Play2D 팬 [판독 FUN_71000c044c, 04 §13.12.2]

/** 화면 폭(FUN_7100984dc0 = *DAT_7101c45478) — 1920 으로 본다 [추정] */
export const SCREEN_W = 1920;

/**
 * Play2D(label, pos) 의 팬. x = 화면 x(0..W, 레이아웃 x + W/2).
 * original: p = pos.x · (1 / (W · 0.5)) f32, p < −1 → −1, 아니면 min(p, 1). web: 이전 페이지 식 clamp((x − 960)/960).
 */
export function pan2d(x: number | undefined, rules: Readonly<SoundRules> = soundDefaults.rules): number {
  if (x === undefined) return 0;
  if (rules.pan2d === 'web') return Math.max(-1, Math.min(1, (x - 960) / 960));
  const F = Math.fround;
  const p = F(F(x - SCREEN_W / 2) * F(1 / F(SCREEN_W * 0.5)));
  return p < -1 ? -1 : Math.min(p, 1);
}

// ---------------------------------------------------------------- 엔진 난수 [판독 FUN_71005df19c, 04 §13.10]

const LCG_A = 0x19660d;
const LCG_C = 0x3c6ef35f;
/** 사운드 프레임(초) [판독 FUN_71005cdd50 예산 5 ms] */
export const SOUND_FRAME_SEC = 0.005;

/** nn::atk 시퀀스 엔진 전역 난수 — 상태 u32, 값 = 상위 16비트. 사운드 프레임마다 한 칸(FUN_71005dd1e0) */
export class SoundRandom {
  state: number;
  /** 지난 사운드 프레임 수(epoch 기준) */
  frames = 0;

  constructor(
    /** 프레임 0 의 오디오 시각 */
    public epoch = 0,
    seed = 0x12345678,
  ) {
    this.state = seed >>> 0;
  }

  /** FUN_71005df19c */
  /** @orig main:71005df19c ref */
  next(): number {
    this.state = (Math.imul(this.state, LCG_A) + LCG_C) >>> 0;
    return this.state >>> 16;
  }

  /** random 접두 인자 [판독 FUN_71005c9b10 case 4]: min + ((r + r·(max − min)) >> 16) */
  /** @orig main:71005c9b10 ref */
  range(min: number, max: number): number {
    const r = this.next() & 0xffff;
    return min + ((r + Math.imul(r, max - min)) >> 16);
  }

  /** randvar [판독 FUN_71005c9c80 case 0x86]: ±(u16)((r + r·|n|) >> 16) */
  /** @orig main:71005c9c80 ref */
  randvar(n: number): number {
    const r = this.next() & 0xffff;
    const a = n >= 0 ? n : (-n << 16) >> 16;
    const u = (((r + Math.imul(r, a)) >>> 0) >>> 16) & 0xffff;
    const v = n >= 0 ? u : -u & 0xffff;
    return (v << 16) >> 16;
  }

  /** n 칸 건너뛰기(LCG 거듭 적용을 제곱으로) */
  advance(n: number): void {
    let a = LCG_A;
    let c = LCG_C;
    let s = this.state;
    while (n > 0) {
      if (n & 1) s = (Math.imul(s, a) + c) >>> 0;
      c = Math.imul(c, (a + 1) >>> 0) >>> 0;
      a = Math.imul(a, a) >>> 0;
      n = Math.floor(n / 2);
    }
    this.state = s;
  }

  /** 오디오 시각 t 까지 지난 사운드 프레임만큼 돌린다(프레임 끝 소비 FUN_71005dd1e0) */
  /** @orig main:71005dd1e0 ref */
  frame(t: number): void {
    const target = Math.floor((t - this.epoch) / SOUND_FRAME_SEC + 1e-9);
    if (target > this.frames) {
      this.advance(target - this.frames);
      this.frames = target;
    }
  }
}

// ---------------------------------------------------------------- 라벨 표

/** 라벨 하나의 정의(아카이브 INFO 사운드 정보 + 웹 재생 자료) */
export interface SoundDef {
  /** 웹 재생 종류: seq = 실시간 시퀀스, stream = 통파일, wave = 파형, bgm = 렌더 BGM 스트림 */
  kind: 'seq' | 'stream' | 'wave' | 'bgm';
  bus: SoundBus;
  /** 플레이어(PLY_*) 이름과 playableSoundMax. null = 한도 없음 */
  player: string | null;
  playerMax: number;
  /** 플레이어 우선순위(u8) */
  priority: number;
  sound3d: Sound3dInfo | null;
  /** 어댑터 처리기 이름 */
  voice: string;
  /** 처리기 자료(코어는 보지 않는다) */
  payload: unknown;
  /** 사용자 파라미터 그룹 비트(0x00~0x1f). 없으면 라벨 접두 — 원본 규칙(meta)이면 원본 정보 표가 앞선다 */
  userGroups?: number;
  /** Play2D: 팬 노드를 늘 둔다(화면 x 팬, 04 §13.11.1) */
  pan2d?: boolean;
  /** 원본 사운드 종류(그룹 0x26~0x28·아카이브 한도). 없으면 라벨 접두(SQ_ = 시퀀스, 그 밖 스트림) */
  orig?: OrigKind;
}

interface Wild {
  pre: string;
  post: string;
  to: string;
  preset: string;
}

/** 라벨 표 하나 + 세팅 프리셋 치환(U 레코드)과 켜진 프리셋 */
export class SoundCatalog {
  readonly defs = new Map<string, SoundDef>();
  private readonly subs = new Map<string, { to: string; preset: string }>();
  private readonly wild: Wild[] = [];
  readonly presets = new Set<string>();

  constructor(readonly name = '') {}

  define(label: string, def: SoundDef): this {
    this.defs.set(label, def);
    return this;
  }

  /** U 레코드: src → dst(preset 이 켜졌을 때). '**' 는 두 글자 와일드카드(원본 규칙) */
  substitute(src: string, to: string, preset: string): this {
    this.subs.set(src, { to, preset });
    const i = src.indexOf('**');
    if (i >= 0) this.wild.push({ pre: src.slice(0, i), post: src.slice(i + 2), to, preset });
    return this;
  }

  /** 원본 LoadSettingPreset — 웹은 켠 프리셋을 쌓는다(장면이 바뀌면 표를 새로 만든다) */
  loadPreset(name: string): this {
    this.presets.add(name);
    return this;
  }

  /** 라벨 → 실제 라벨(프리셋 치환). known = 표 밖에서 아는 라벨(원본 정보 표의 무음 라벨) */
  resolve(label: string, rules: Readonly<SoundRules> = soundDefaults.rules, known?: (l: string) => boolean): string {
    const s = this.subs.get(label);
    const has = (l: string): boolean => this.defs.has(l) || (!!known && known(l));
    if (rules.resolve === 'web') return s && this.presets.has(s.preset) && has(s.to) ? s.to : label;
    if (s && this.presets.has(s.preset) && has(s.to)) return s.to;
    for (const w of this.wild) {
      if (!this.presets.has(w.preset) || label.length !== w.pre.length + 2 + w.post.length) continue;
      if (!label.startsWith(w.pre) || !label.endsWith(w.post)) continue;
      const to = w.to.replace('**', label.slice(w.pre.length, w.pre.length + 2));
      if (has(to)) return to;
    }
    return label;
  }
}

// ---------------------------------------------------------------- 명령

export type SoundOp = 'start' | 'stop' | 'stopAt' | 'gain' | 'pan' | 'pause' | 'local';

/** 어댑터로 가는 명령 하나(객체는 풀에서 다시 쓴다 — drain 콜백 밖에서 들고 있지 말 것) */
export interface SoundCmd {
  op: SoundOp;
  h: number;
  /** 요청 라벨 / 실제 라벨(치환 뒤) */
  label: string;
  target: string;
  cat: SoundCatalog | null;
  def: SoundDef | null;
  payload: unknown;
  /** 오디오 시각 */
  at: number;
  /** start·gain: 핸들 음량(3D·SetVolume·덕킹 곱), stop·pause: 페이드 초, gain: 바뀌는 데 걸리는 초 = time */
  gain: number;
  pan: number;
  /** 3D 팬을 쓰는 핸들(flags & 4) */
  pan3d: boolean;
  time: number;
  on: boolean;
  index: number;
  value: number;
  local: Readonly<Record<number, number>> | null;
  flags: number;
  /** start: 처리기 이름 */
  voice: string;
}

function blankCmd(): SoundCmd {
  return { op: 'start', h: 0, label: '', target: '', cat: null, def: null, payload: null, at: 0, gain: 1, pan: 0, pan3d: false, time: 0, on: false, index: 0, value: 0, local: null, flags: 0, voice: '' };
}

// ---------------------------------------------------------------- 핸들

const FREE = 0;
const PLAYING = 1;
const STOPPING = 2;

class Slot {
  gen = 0;
  state = FREE;
  serial = 0;
  cat: SoundCatalog | null = null;
  def: SoundDef | null = null;
  label = '';
  target = '';
  prio = 0;
  basePrio = 0;
  started = 0;
  lo = 0;
  hi = 0;
  orig: OrigKind = 'seq';
  flags = 0;
  voice = '';
  player: string | null = null;
  playerMax = 0;
  has3d = false;
  px = 0;
  py = 0;
  pz = 0;
  /** SetVolume / 3D / 덕킹 곱 */
  vol = 1;
  amb = 1;
  pan = 0;
  duck = 1;
  paused = false;
}

export interface PlayOpts {
  /** Play3D 위치(사운드에 3D 정보가 있을 때) */
  pos?: V3 | null;
  /** 시퀀스 지역 변수 초기값(재생 직후 WriteLocalVariable) */
  local?: Readonly<Record<number, number>> | null;
  /** 처리기 자료(없으면 def.payload) */
  payload?: unknown;
  /** 시작 오디오 시각(없으면 지금) */
  at?: number;
  /** 플레이어 우선순위 덮기(없으면 def.priority) */
  priority?: number;
  /** 소비자 표시 비트(코어는 보관만 — 웹 리듬: 1 = BGM, 2 = 반복) */
  flags?: number;
  /** 한도를 통과한 뒤·시작 명령 전(웹 규칙의 BGM 끼리 정지 자리) */
  onAdmit?: () => void;
  /** 처리기 덮기(없으면 def.voice) */
  voice?: string;
  /** 2D 팬(−1..1, Play2D 화면 위치) */
  pan?: number;
}

export interface SoundCoreOptions {
  rules?: Readonly<SoundRules>;
  /** 지금 오디오 시각(초) */
  now(): number;
  /** 핸들 h 의 목소리가 아직 살아 있는가(어댑터). 없으면 ended() 로만 끝난다 */
  probe?(h: number): boolean;
}

/** 원본 사운드 정보 표 한 줄: [그룹 비트(사용자 파라미터 비트 29), 플레이어, playableSoundMax, 플레이어 우선순위, 종류] */
export type SoundMetaRow = [number, string | null, number, number, string];

/** assets/common/sound/meta.json(web/tools/analysis/sound_meta.py) */
export interface SoundMeta {
  labels: Record<string, SoundMetaRow>;
  silent: string[];
}

export interface SoundCoreStats {
  silent: number;
  played: number;
  rejected: number;
  evicted: number;
  unknown: number;
  ended: number;
}

const SLOT_BITS = 1024;
const EMPTY_OPTS: PlayOpts = {};
const DUCK_GROUPS = 64;

/** SoundModule + SoundHandle 표 */
export class SoundCore {
  rules: Readonly<SoundRules>;
  readonly stats: SoundCoreStats = { silent: 0, played: 0, rejected: 0, evicted: 0, unknown: 0, ended: 0 };
  private readonly slots: Slot[] = [];
  private serial = 0;
  private listeners: readonly Listener3d[] = [];
  private readonly amb: Ambient3d = { volume: 1, priority: 0, pan: 0, span: 0 };
  private readonly cmds: SoundCmd[] = [];
  private ncmd = 0;
  private readonly groupsTmp: [number, number] = [0, 0];
  /** 그룹별 덕킹: 지금 값·목표·변화 시작 시각·걸리는 초·시작 값 */
  private readonly duckCur = new Float64Array(DUCK_GROUPS).fill(1);
  private readonly duckFrom = new Float64Array(DUCK_GROUPS).fill(1);
  private readonly duckTo = new Float64Array(DUCK_GROUPS).fill(1);
  private readonly duckT0 = new Float64Array(DUCK_GROUPS);
  private readonly duckSec = new Float64Array(DUCK_GROUPS);
  private ducking = 0;

  constructor(private readonly o: SoundCoreOptions) {
    this.rules = o.rules ?? soundDefaults.rules;
  }

  now(): number {
    return this.o.now();
  }

  /** 원본 사운드 정보 표(04 §13.11.3) — 라벨 → [그룹 비트, 플레이어, playableSoundMax, 플레이어 우선순위, 종류], 무음 라벨 */
  setMeta(meta: SoundMeta | null): void {
    this.meta = meta;
    this.silent = new Set(meta?.silent ?? []);
  }

  private meta: SoundMeta | null = null;
  private silent = new Set<string>();
  private readonly knownSilent = (l: string): boolean => this.rules.meta && this.silent.has(l);

  /** 프리셋 치환(원본 규칙 meta 면 무음 라벨도 대상) */
  resolve(cat: SoundCatalog, label: string): string {
    return cat.resolve(label, this.rules, this.knownSilent);
  }

  /** 원본 정보 표 한 줄(규칙 meta 일 때만) */
  metaOf(label: string): SoundMetaRow | null {
    return (this.rules.meta && this.meta?.labels[label]) || null;
  }

  /** 라벨 하나의 그룹 [lo, hi](원본 정보 표 → 없으면 접두 근사) */
  groupsFor(label: string, kind: OrigKind, out: [number, number] = [0, 0]): [number, number] {
    const m = this.metaOf(label);
    return soundGroupsOf(label, kind, m ? m[0] : undefined, out);
  }

  /** 그룹 [lo, hi] 의 덕킹 목표 곱(지금 켜진 덕킹들) */
  duckTargetFor(lo: number, hi: number): number {
    let v = 1;
    for (let g = 0; g < DUCK_GROUPS; g++) if (this.duckTo[g] !== 1 && inGroup(lo, hi, g)) v *= this.duckTo[g];
    return v;
  }

  setListeners(list: readonly Listener3d[]): void {
    this.listeners = list;
  }

  // ------------------------------------------------ 명령

  private cmd(op: SoundOp, s: Slot, h: number): SoundCmd {
    let c = this.cmds[this.ncmd];
    if (!c) {
      c = blankCmd();
      this.cmds.push(c);
    }
    this.ncmd++;
    c.op = op;
    c.h = h;
    c.label = s.label;
    c.target = s.target;
    c.cat = s.cat;
    c.def = s.def;
    c.payload = null;
    c.at = this.o.now();
    c.gain = s.vol * s.amb * s.duck;
    c.pan = s.pan;
    c.pan3d = !!s.def?.sound3d && s.has3d && (s.def.sound3d.flags & 4) !== 0;
    c.time = 0;
    c.on = false;
    c.index = 0;
    c.value = 0;
    c.local = null;
    c.flags = s.flags;
    c.voice = s.voice;
    return c;
  }

  /** 쌓인 명령을 순서대로 넘기고 비운다 */
  drain(fn: (c: SoundCmd) => void): void {
    for (let i = 0; i < this.ncmd; i++) fn(this.cmds[i]);
    this.ncmd = 0;
  }

  get pending(): number {
    return this.ncmd;
  }

  // ------------------------------------------------ 핸들

  private slotOf(h: number): Slot | null {
    if (h <= 0) return null;
    const s = this.slots[h % SLOT_BITS];
    if (!s || s.state === FREE || s.gen !== Math.floor(h / SLOT_BITS)) return null;
    return s;
  }

  private handleOf(i: number): number {
    return this.slots[i].gen * SLOT_BITS + i;
  }

  private free(s: Slot): void {
    s.state = FREE;
    s.gen = (s.gen + 1) % 0x100000 || 1;
    s.cat = null;
    s.def = null;
    this.stats.ended++;
  }

  /** 살아 있는지 — 어댑터 probe 가 끝났다고 하면 비운다 */
  private live(i: number): boolean {
    const s = this.slots[i];
    if (s.state === FREE) return false;
    if (this.o.probe && !this.o.probe(this.handleOf(i))) {
      this.free(s);
      return false;
    }
    return true;
  }

  alive(h: number): boolean {
    const s = this.slotOf(h);
    return !!s && this.live(h % SLOT_BITS);
  }

  label(h: number): string | null {
    return this.slotOf(h)?.label ?? null;
  }

  target(h: number): string | null {
    return this.slotOf(h)?.target ?? null;
  }

  flags(h: number): number {
    return this.slotOf(h)?.flags ?? 0;
  }

  /** 살아 있는 핸들마다(재생 순서). cat 이 있으면 그 표의 핸들만 */
  forEach(fn: (h: number, label: string, flags: number) => void, cat?: SoundCatalog): void {
    const order: number[] = [];
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].state !== FREE && (!cat || this.slots[i].cat === cat)) order.push(i);
    order.sort((a, b) => this.slots[a].serial - this.slots[b].serial);
    for (const i of order) if (this.live(i)) fn(this.handleOf(i), this.slots[i].label, this.slots[i].flags);
  }

  /** 라벨이 같은 살아 있는 핸들 하나(가장 먼저 낸 것). cat 이 있으면 그 표의 핸들만 */
  find(label: string, cat?: SoundCatalog): number {
    let best = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.state !== FREE && s.label === label && (!cat || s.cat === cat) && (best < 0 || s.serial < this.slots[best].serial) && this.live(i)) best = i;
    }
    return best < 0 ? 0 : this.handleOf(best);
  }

  /** 핸들이 그룹 g 에 드는가 */
  inGroup(h: number, g: number): boolean {
    const s = this.slotOf(h);
    return !!s && inGroup(s.lo, s.hi, g);
  }

  private alloc(): number {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].state === FREE) return i;
    if (this.slots.length >= SLOT_BITS) return -1;
    const s = new Slot();
    s.gen = 1;
    this.slots.push(s);
    return this.slots.length - 1;
  }

  /**
   * 같은 플레이어 한도 검사. 내도 되면 true(밀려난 소리는 멈춘다) — app/minigame/kit/rhythm/view/sound.ts admit 에서 옮겼다.
   * 한도 검사 — 조건(pred)에 드는 살아 있는 소리가 max 이상이면 우선순위가 가장 낮은(같으면 가장 먼저 낸) 소리와 비교:
   * 새 소리가 더 낮으면 거절, 아니면 그 소리를 멈춘다 [추정: nn::atk 공개 동작, 리듬 sound.ts 이전 규칙].
   */
  private admit(max: number, prio: number, match: (s: Slot) => boolean): boolean {
    let n = 0;
    let low = -1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.state === FREE || !match(s) || !this.live(i)) continue;
      n++;
      if (low < 0) low = i;
      else {
        const l = this.slots[low];
        if (s.prio < l.prio || (s.prio === l.prio && (s.started < l.started || (s.started === l.started && s.serial < l.serial)))) low = i;
      }
    }
    if (n < max) return true;
    if (low < 0) return false;
    const l = this.slots[low];
    if (prio < l.prio) return false;
    this.stopSlot(low, 0);
    this.stats.evicted++;
    return true;
  }

  private origOf(label: string, def: SoundDef): OrigKind {
    if (def.orig) return def.orig;
    if (def.kind === 'wave') return 'wave';
    return label.startsWith('SQ_') ? 'seq' : 'stream';
  }

  /** SoundModule::Play / Play3D — 핸들(0 = 못 냄) */
  play(cat: SoundCatalog, label: string, o: PlayOpts = EMPTY_OPTS): number {
    const target = cat.resolve(label, this.rules, this.knownSilent);
    const def = cat.defs.get(target);
    if (!def) {
      if (this.knownSilent(target)) this.stats.silent++;
      else this.stats.unknown++;
      return 0;
    }
    const s3 = def.sound3d;
    const meta = this.metaOf(target);
    const player = meta ? meta[1] : def.player;
    const playerMax = meta ? meta[2] : def.playerMax;
    let prio = o.priority ?? (meta ? meta[3] : def.priority);
    let amb = 1;
    let pan = o.pan ?? 0;
    let has3d = false;
    if (o.pos && s3) {
      const a = calc3dInto(this.amb, this.listeners, s3, o.pos, this.rules.f32);
      amb = a.volume;
      pan = a.pan;
      prio += a.priority;
      has3d = true;
    }
    if (player && !this.admit(playerMax, prio, (s) => s.player === player)) {
      this.stats.rejected++;
      return 0;
    }
    const orig = this.origOf(target, def);
    if (this.rules.instanceLimit && !this.admit(INSTANCE_MAX[orig], prio, (s) => s.orig === orig)) {
      this.stats.rejected++;
      return 0;
    }
    o.onAdmit?.();
    const i = this.alloc();
    if (i < 0) {
      this.stats.rejected++;
      return 0;
    }
    const s = this.slots[i];
    s.state = PLAYING;
    s.serial = ++this.serial;
    s.cat = cat;
    s.def = def;
    s.label = label;
    s.target = target;
    s.prio = prio;
    s.basePrio = o.priority ?? (meta ? meta[3] : def.priority);
    s.started = o.at ?? this.o.now();
    s.player = player;
    s.playerMax = playerMax;
    soundGroupsOf(target, orig, def.userGroups ?? (meta ? meta[0] : undefined), this.groupsTmp);
    s.lo = this.groupsTmp[0];
    s.hi = this.groupsTmp[1];
    s.orig = orig;
    s.flags = o.flags ?? 0;
    s.voice = o.voice ?? def.voice;
    s.has3d = has3d;
    s.px = o.pos?.x ?? 0;
    s.py = o.pos?.y ?? 0;
    s.pz = o.pos?.z ?? 0;
    s.vol = 1;
    s.amb = amb;
    s.pan = pan;
    s.duck = this.duckOf(s);
    s.paused = false;
    const h = this.handleOf(i);
    const c = this.cmd('start', s, h);
    c.payload = o.payload !== undefined ? o.payload : def.payload;
    if (o.at !== undefined) c.at = o.at;
    c.local = o.local ?? null;
    this.stats.played++;
    return h;
  }

  private stopSlot(i: number, fade: number): void {
    const s = this.slots[i];
    if (s.state === FREE) return;
    s.state = STOPPING;
    const c = this.cmd('stop', s, this.handleOf(i));
    c.time = fade;
  }

  /** SoundHandle::Stop(fade 초) */
  stop(h: number, fade = 0): void {
    if (this.slotOf(h)) this.stopSlot(h % SLOT_BITS, fade);
  }

  /** 오디오 시각 t 에 끊는다(리듬 ENDPLAY_CHECK_VOLOFF) */
  stopAt(h: number, t: number): void {
    const s = this.slotOf(h);
    if (!s) return;
    const c = this.cmd('stopAt', s, h);
    c.at = t;
  }

  /** SoundHandle::Pause(on, fade 초) */
  pause(h: number, on: boolean, fade = 0): void {
    const s = this.slotOf(h);
    if (!s || s.paused === on) return;
    s.paused = on;
    const c = this.cmd('pause', s, h);
    c.on = on;
    c.time = fade;
  }

  /** SoundHandle::SetVolume(v, fade 초) */
  setVolume(h: number, v: number, fade = 0): void {
    const s = this.slotOf(h);
    if (!s) return;
    s.vol = v;
    this.cmd('gain', s, h).time = fade;
  }

  /** SoundHandle::WriteLocalVariable */
  writeLocal(h: number, index: number, value: number): void {
    const s = this.slotOf(h);
    if (!s) return;
    const c = this.cmd('local', s, h);
    c.index = index;
    c.value = value;
  }

  /** Play3DHookPosition — 위치를 바꾼다(원본 규칙은 update 에서, 웹 규칙은 바로 다시 계산) */
  setPosition(h: number, pos: V3): void {
    const s = this.slotOf(h);
    if (!s || !s.def?.sound3d) return;
    s.px = pos.x;
    s.py = pos.y;
    s.pz = pos.z;
    s.has3d = true;
    if (!this.rules.track3d) this.recalc3d(s, h);
  }

  private readonly posTmp: V3 = { x: 0, y: 0, z: 0 };

  private recalc3d(s: Slot, h: number): void {
    const s3 = s.def!.sound3d!;
    this.posTmp.x = s.px;
    this.posTmp.y = s.py;
    this.posTmp.z = s.pz;
    const a = calc3dInto(this.amb, this.listeners, s3, this.posTmp, this.rules.f32);
    if (a.volume !== s.amb) {
      s.amb = a.volume;
      this.cmd('gain', s, h);
    }
    if (a.pan !== s.pan) {
      s.pan = a.pan;
      this.cmd('pan', s, h);
    }
    s.prio = s.basePrio + a.priority;
  }

  /** 어댑터: 목소리가 끝났다 */
  ended(h: number): void {
    const s = this.slotOf(h);
    if (s) this.free(s);
  }

  // ------------------------------------------------ 그룹

  /** StopGroup_Type(group, fade 초) — 소속 핸들 모두 */
  stopGroup(group: number, fade = 0): number {
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.state === PLAYING && inGroup(s.lo, s.hi, group) && this.live(i)) {
        this.stopSlot(i, fade);
        n++;
      }
    }
    return n;
  }

  private duckOf(s: Slot): number {
    if (this.ducking === 0) return 1;
    let v = 1;
    for (let g = 0; g < DUCK_GROUPS; g++) if (this.duckCur[g] !== 1 && inGroup(s.lo, s.hi, g)) v *= this.duckCur[g];
    return v;
  }

  private duckTarget(s: Slot): number {
    let v = 1;
    for (let g = 0; g < DUCK_GROUPS; g++) if (this.duckTo[g] !== 1 && inGroup(s.lo, s.hi, g)) v *= this.duckTo[g];
    return v;
  }

  /**
   * DuckingGroup(group, preset, on) — 켤 때 목표 음량으로 '켤 때 시간', 끌 때 1 로 '해제 시간' 동안 선형 [판독 6.9 FUN_71000f5474·FUN_71000fe150].
   * preset 이 표에 없으면 아무 일 없음. 소속 핸들마다 gain 명령(time = 걸리는 초)을 낸다.
   */
  duckGroup(group: number, on: boolean, preset = group): void {
    const p = DUCKING_PRESET[preset];
    if (!p || group < 0 || group >= DUCK_GROUPS) return;
    this.duckFrom[group] = this.duckCur[group];
    this.duckTo[group] = on ? p.volume : 1;
    this.duckT0[group] = this.o.now();
    this.duckSec[group] = on ? p.onSec : p.offSec;
    this.ducking = 1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.state === FREE || !inGroup(s.lo, s.hi, group)) continue;
      s.duck = this.duckTarget(s);
      this.cmd('gain', s, this.handleOf(i)).time = this.duckSec[group];
    }
  }

  /**
   * 장면 시작(원본 bq::SceneBase 정리 → 그 장면 종류 소리 그룹 0x20 페이드 0 정지, 04 §13.12.1).
   * 원본 규칙(sceneExit)에서 이름이 앞 장면과 다르면 살아 있는 소리를 모두 멈추고 true(부르는 쪽이 진동 정지 등 사건을 처리). 같은 장면이면 이어진다.
   */
  enterScene(name: string): boolean {
    const prev = this.scene;
    this.scene = name;
    if (!this.rules.sceneExit || prev === null || prev === name) return false;
    this.stopGroup(GROUP_ALL, 0);
    return true;
  }

  private scene: string | null = null;

  get sceneName(): string | null {
    return this.scene;
  }

  /** 그룹 덕킹 지금 값 */
  duckValue(group: number): number {
    return this.duckCur[group] ?? 1;
  }

  // ------------------------------------------------ 갱신

  /** 사운드 프레임 갱신 — 덕킹 진행, (원본 규칙) 살아 있는 3D 핸들 다시 계산 */
  update(): void {
    if (this.ducking > 0) {
      const now = this.o.now();
      let moving = 0;
      let off = 0;
      for (let g = 0; g < DUCK_GROUPS; g++) {
        const to = this.duckTo[g];
        if (this.duckCur[g] !== to) {
          const sec = this.duckSec[g];
          const k = sec > 0 ? Math.min(1, (now - this.duckT0[g]) / sec) : 1;
          this.duckCur[g] = k >= 1 ? to : this.duckFrom[g] + (to - this.duckFrom[g]) * k;
          if (this.duckCur[g] !== to) moving++;
        }
        if (this.duckCur[g] !== 1) off++;
      }
      if (moving === 0 && off === 0) this.ducking = 0;
    }
    if (this.rules.track3d) {
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.state === PLAYING && s.has3d && s.def?.sound3d) this.recalc3d(s, this.handleOf(i));
      }
    }
  }

  /** 살아 있는(비지 않은) 칸 수 */
  get count(): number {
    let n = 0;
    for (const s of this.slots) if (s.state !== FREE) n++;
    return n;
  }
}
