/**
 * 미니게임 장면 단계 로딩 계획(순수 함수 — 시험·미리 받기용). 설계: docs/engine/13_asset_converter.md §7.2, loader_manager.md §11.4(광장 plazaPlan 과 같은 등급 규칙).
 * P0 = 첫 카메라 0 프레임에 보이는 배치(+ 부착 부모) — 이것만 기다린다. P1 = 첫 카메라 다른 프레임에 보이는 것, P2 = 그 밖 보이는 배치(뒤에서 받기),
 * 숨김 배치·배치 밖 모델 = P3(게임이 부를 때). 순서 = 등급, 같은 등급은 표 순서.
 */
import { P0, P1, P2, P3 } from '../../lib/assetcore';
import type { MgExt, MgLayoutEntry, MgManifest } from './types';

/** 'a/b/../c/./d' → 'a/c/d' (공용 폴더를 가리키는 ../ 경로를 관리자 키로) */
export function normPath(p: string): string {
  const out: string[] = [];
  for (const s of p.split('/')) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
}

/** 장면 폴더 상대 경로 → 관리자 키(web/assets/ 기준) */
export function mgStageKey(id: string, path: string): string {
  return normPath(`mg/${id}/${path}`);
}

export function mgStagePlan(ext: MgExt): { pri: Map<string, number>; order: MgLayoutEntry[] } {
  const pri = new Map<string, number>();
  const p0 = new Set(ext.first.p0);
  const p1 = new Set(ext.first.p1);
  for (const e of ext.layout) pri.set(e.key, p0.has(e.key) ? P0 : p1.has(e.key) ? P1 : e.visible ? P2 : P3);
  const byKey = new Map(ext.layout.map((e) => [e.key, e]));
  for (const e of ext.layout) {
    let h = e.hookKey;
    const pr = pri.get(e.key)!;
    while (h) {
      if ((pri.get(h) ?? P3) > pr) pri.set(h, pr);
      h = byKey.get(h)?.hookKey;
    }
  }
  const idx = new Map(ext.layout.map((e, i) => [e.key, i]));
  return { pri, order: [...ext.layout].sort((a, b) => pri.get(a.key)! - pri.get(b.key)! || idx.get(a.key)! - idx.get(b.key)!) };
}

/** 이 항목이 쓰는 애니 json(fmab·fvbb) — manifest.anims 경로 */
function animPaths(man: MgManifest, e: MgLayoutEntry): string[] {
  return e.anims.filter((a) => a.kind !== 'clip' && man.anims[a.name]).map((a) => man.anims[a.name]);
}

/**
 * 진입 전 미리 받기 P0 목록(loader_manager.md §13.3) — 장면 폴더 기준 [경로, 종류]: 첫 카메라 json + P0 모델 glb + 그 애니 json
 * + withTex 면 glb 가 쓰는 텍스처(압축 모드에서 glb 안 텍스처도 관리자를 지날 때). createMgStage 가 P0 로 기다리는 것과 같다.
 */
export function mgStageP0Paths(man: MgManifest, withTex: boolean): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  const add = (p: string, kind: string): void => {
    const k = normPath(p);
    if (!seen.has(k)) {
      seen.add(k);
      out.push([k, kind]);
    }
  };
  const cam = man.mg.first.camera ? man.asset.cameras?.[man.mg.first.camera] : null;
  if (cam) add(cam.file, 'json');
  const plan = mgStagePlan(man.mg);
  for (const e of plan.order) {
    if (plan.pri.get(e.key) !== P0) continue;
    const m = man.models[e.model];
    if (!m) continue;
    add(m.url, 'gltf');
    for (const a of animPaths(man, e)) add(a, 'json');
    if (withTex) for (const t of m.tex ?? []) add(`tex/${t}`, 'texture');
  }
  return out;
}

export { animPaths as mgAnimPaths };
