/**
 * 진동 재생 공용 코어 — import 0(DOM·Gamepad·프로젝트 파일 없음). 설계: docs/engine/05_ui_input.md §11(웹 진동 재생 계약), 자료 §7.6·§11.1.
 * 원본 진동 정의(vibration.msgpack vib_define: 설정 이름·Gain_Master/Low/High·priority·vib_slot)와 설정(vib_setting: 값형 진폭·duration·attack·release,
 * 또는 bnvib 200 Hz 표본)을 dual-rumble 구간 목록 {ms, strong, weak} 으로 바꾸고, 패드마다 우선순위로 한 줄을 고른다. 재생(Gamepad)은 연결 층.
 * 규칙 두 벌: RULES_WEB = 이전 웹(mg1801 bnvib 50 ms 평균 구간, 셸 진동 고리 없음), RULES_ORIGINAL = 원본 표본·값형 포락선·우선순위(기본).
 * 결정성: 시각은 부르는 쪽이 넘긴다(초). Math.random·벽시계 없음.
 */

/** dual-rumble 한 구간: ms 동안 세기(0..1). strong = 저역 모터, weak = 고역 모터 */
export interface VibSegment {
  ms: number;
  strong: number;
  weak: number;
}

/** bnvib 파형(ui_bnvib.py): 표본 Hz·저/고역 진폭(바이트/255) */
export interface VibWave {
  rateHz: number;
  ampLow: readonly number[];
  ampHigh: readonly number[];
}

/** 값형 설정(vib_setting vib_type value) */
export interface VibValue {
  ampLow: number;
  ampHigh: number;
  duration: number;
  attack: number;
  release: number;
}

/** 정의 하나를 풀어 둔 것 */
export interface VibDef {
  label: string;
  wave: VibWave | null;
  value: VibValue | null;
  gainMaster: number;
  gainLow: number;
  gainHigh: number;
  priority: number;
  slot: number;
}

/** assets/common/vib/vib.json(web/tools/analysis/vib_shell.py) */
export interface VibTable {
  define: Record<string, [string, number, number, number, number, number]>;
  setting: Record<string, VibValue | VibWave>;
  vb: Record<string, string>;
}

export interface VibRules {
  readonly id: 'web' | 'original';
  /** 구간: web50 = 50 ms 평균(이전 mg1801), sample = 원본 표본(5 ms)·값형 포락선 */
  readonly envelope: 'web50' | 'sample';
  /** 셸·메시지·시스템 진동 고리(이전 웹 = 없음) */
  readonly shell: boolean;
  /** 패드마다 우선순위로 한 줄 [추정] */
  readonly priority: boolean;
}

export const VIB_RULES_WEB: Readonly<VibRules> = { id: 'web', envelope: 'web50', shell: false, priority: false };
export const VIB_RULES_ORIGINAL: Readonly<VibRules> = { id: 'original', envelope: 'sample', shell: true, priority: true };

/** 기본 규칙 — 2026-10-09 사용자 결정: 원본 */
export const vibDefaults: { rules: Readonly<VibRules> } = { rules: VIB_RULES_ORIGINAL };

/** 이전 웹 구간 길이(ms) */
export const VIB_STEP_MS = 50;

const clamp1 = (x: number): number => Math.min(1, x);
const isWave = (s: VibValue | VibWave): s is VibWave => Array.isArray((s as VibWave).ampLow);

/** 표에서 라벨(또는 VB_ 키) 하나를 푼다. 없으면 null */
export function vibDef(t: VibTable, name: string): VibDef | null {
  const label = t.vb[name] ?? name;
  const d = t.define[label];
  if (!d) return null;
  const s = t.setting[d[0]];
  if (!s) return null;
  return { label, wave: isWave(s) ? s : null, value: isWave(s) ? null : s, gainMaster: d[1], gainLow: d[2], gainHigh: d[3], priority: d[4], slot: d[5] };
}

/**
 * 이전 웹 구간(app/minigame/kit/rhythm/view/ui.ts vibrate 에서 옮김): 50 ms 마다 표본 평균 × Gain_Master × Gain_Low/High, 1 로 자름.
 */
export function envelopeWeb50(w: VibWave, gainMaster: number, gainLow: number, gainHigh: number, stepMs = VIB_STEP_MS): VibSegment[] {
  const per = Math.max(1, Math.round((w.rateHz * stepMs) / 1000));
  const segs: VibSegment[] = [];
  for (let i = 0; i < w.ampLow.length; i += per) {
    const lo = w.ampLow.slice(i, i + per);
    const hi = w.ampHigh.slice(i, i + per);
    const avg = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    segs.push({
      ms: (lo.length / w.rateHz) * 1000,
      strong: Math.min(1, avg(lo) * gainMaster * gainLow),
      weak: Math.min(1, avg(hi) * gainMaster * gainHigh),
    });
  }
  return segs;
}

/** 원본 표본 구간: 표본마다(1/rateHz) 세기, 이웃이 같으면 합친다 */
export function envelopeSamples(w: VibWave, gainMaster: number, gainLow: number, gainHigh: number): VibSegment[] {
  const ms = 1000 / w.rateHz;
  const segs: VibSegment[] = [];
  for (let i = 0; i < w.ampLow.length; i++) {
    const strong = clamp1(w.ampLow[i] * gainMaster * gainLow);
    const weak = clamp1((w.ampHigh[i] ?? 0) * gainMaster * gainHigh);
    const last = segs[segs.length - 1];
    if (last && last.strong === strong && last.weak === weak) last.ms += ms;
    else segs.push({ ms, strong, weak });
  }
  return segs;
}

/** 값형: attack 선형 오름 → duration 유지 → release 선형 내림을 5 ms 표본으로 */
export function envelopeValue(v: VibValue, gainMaster: number, gainLow: number, gainHigh: number, rateHz = 200): VibSegment[] {
  const n = (sec: number): number => Math.max(0, Math.round(sec * rateHz));
  const a = n(v.attack);
  const h = Math.max(1, n(v.duration));
  const r = n(v.release);
  const lo: number[] = [];
  const hi: number[] = [];
  for (let i = 0; i < a; i++) {
    lo.push((v.ampLow * (i + 1)) / (a + 1));
    hi.push((v.ampHigh * (i + 1)) / (a + 1));
  }
  for (let i = 0; i < h; i++) {
    lo.push(v.ampLow);
    hi.push(v.ampHigh);
  }
  for (let i = 0; i < r; i++) {
    lo.push((v.ampLow * (r - i)) / (r + 1));
    hi.push((v.ampHigh * (r - i)) / (r + 1));
  }
  return envelopeSamples({ rateHz, ampLow: lo, ampHigh: hi }, gainMaster, gainLow, gainHigh);
}

/** 정의 하나 → 구간 목록(규칙대로) */
export function vibSegments(d: VibDef, rules: Readonly<VibRules> = vibDefaults.rules): VibSegment[] {
  if (d.wave) return rules.envelope === 'web50' ? envelopeWeb50(d.wave, d.gainMaster, d.gainLow, d.gainHigh) : envelopeSamples(d.wave, d.gainMaster, d.gainLow, d.gainHigh);
  if (d.value) return envelopeValue(d.value, d.gainMaster, d.gainLow, d.gainHigh);
  return [];
}

/** 구간 목록 전체 길이(초) */
export const vibLength = (segs: readonly VibSegment[]): number => segs.reduce((s, x) => s + x.ms, 0) / 1000;

/** 패드마다 지금 재생 중인 진동(우선순위·끝 시각). 새 진동을 낼지 정한다 [추정 05 §11.3] */
export class VibMixer {
  private readonly cur = new Map<unknown, { priority: number; end: number }>();

  /** 낼지(내면 기록). pad = 패드 열쇠(번호나 객체), now·길이는 초 */
  admit(pad: unknown, priority: number, now: number, length: number, rules: Readonly<VibRules> = vibDefaults.rules): boolean {
    const c = this.cur.get(pad);
    if (rules.priority && c && now < c.end && priority < c.priority) return false;
    this.cur.set(pad, { priority, end: now + length });
    return true;
  }

  /** 장면 정지(VibrationModule 장면 정지) */
  stopAll(): void {
    this.cur.clear();
  }

  playing(pad: unknown, now: number): boolean {
    const c = this.cur.get(pad);
    return !!c && now < c.end;
  }
}
