/**
 * 진동 공용 연결 — 코어(lib/vibration)에 셸 진동 표(assets/common/vib/vib.json, tools/analysis/vib_shell.py)·Gamepad(view/input PadSource)를 잇는다.
 * 설계: docs/engine/05_ui_input.md §11. 규칙 = vibDefaults.rules(기본 원본). 장면이 끝나면 stopAllVibration(04 §13.12.1).
 * 셸 자리 이름(proceed·error·rule 등 원본 이름이 빠진 것)은 같은 사건의 SE 와 짝으로 고른다: SQ_SE_SYS_<X> → bv_vib_sys_<x> [추정 §11.1].
 */
import { P1 } from '../lib/assetcore';
import { VibMixer, vibDef, vibDefaults, vibLength, vibSegments, type VibSegment, type VibTable } from '../lib/vibration';
import { appAssets } from './appAssets';
import type { PadSource } from './input';

const G = globalThis as { __mpjVibTable?: Promise<VibTable | null>; __mpjVibTableNow?: VibTable | null; __mpjVibMixer?: VibMixer; __mpjVibPads?: Set<PadSource> };

/** 셸 진동 표(페이지에 한 번) */
export function vibTable(): Promise<VibTable | null> {
  G.__mpjVibTable ??= Promise.resolve()
    .then(() => appAssets().get<VibTable>('common/vib/vib.json', 'json', P1))
    .then((t) => (G.__mpjVibTableNow = t))
    .catch((e: unknown) => {
      console.warn('진동 표를 읽지 못했다', e);
      return (G.__mpjVibTableNow = null);
    });
  return G.__mpjVibTable;
}

const mixer = (): VibMixer => (G.__mpjVibMixer ??= new VibMixer());
const pads = (): Set<PadSource> => (G.__mpjVibPads ??= new Set());
const nowSec = (): number => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);

/** 구간을 패드로(우선순위로 한 줄). 냈으면 true */
export function playVibration(pad: PadSource | null | undefined, priority: number, segs: readonly VibSegment[]): boolean {
  if (!pad || segs.length === 0) return false;
  if (!mixer().admit(pad, priority, nowSec(), vibLength(segs), vibDefaults.rules)) return false;
  pads().add(pad);
  if (pad.vibrate) pad.vibrate(segs);
  else pad.rumble?.(Math.round(vibLength(segs) * 1000));
  return true;
}

/** 자리 이름 → 원본 진동 라벨(표에 있으면 그대로, 아니면 같은 사건 SE 와 이름 짝) */
export function vibLabel(t: VibTable, name: string, lastSe: string | null): string | null {
  if (t.define[name] || t.vb[name]) return name;
  const m = lastSe ? /^SQ_SE_SYS_(.+)$/.exec(lastSe) : null;
  const pair = m ? `bv_vib_sys_${m[1].toLowerCase()}` : null;
  return pair && t.define[pair] ? pair : null;
}

/** 셸 진동 하나(라벨·VB_ 키·자리 이름). 표가 아직 없으면 받은 뒤 낸다 */
export function vibrateShell(pad: PadSource | null | undefined, name: string, lastSe: string | null = null): void {
  const go = (t: VibTable | null): void => {
    if (!t) return;
    const label = vibLabel(t, name, lastSe);
    const d = label ? vibDef(t, label) : null;
    if (d) playVibration(pad, d.priority, vibSegments(d, vibDefaults.rules));
  };
  if (G.__mpjVibTableNow !== undefined) go(G.__mpjVibTableNow);
  else void vibTable().then(go);
}

/** 장면 정지(VibrationModule 장면 정지) — 기억한 패드에 세기 0 구간 하나 */
export function stopAllVibration(): void {
  for (const p of pads()) p.vibrate?.([{ ms: 1, strong: 0, weak: 0 }]);
  pads().clear();
  mixer().stopAll();
}
