/**
 * 원본 애니 커브 wrap(Repeat) 상태 검사 — 변환기(tools/analysis/graphics_bfres2gltf Curves.cs)가 구간 [start, end] 밖 프레임을 원본처럼 접었는지
 * 프레임마다 구운 값(fmab JSON 배열 · glb 애니 채널)으로 본다(docs/shell/plaza_3d.md §6.14 #14c ③·§8). 행 목록은 원본 커브 덤프(graphics_bfres2gltf dump) [데이터].
 * 판정: 한 주기 P = end − start 를 사이에 둔 두 프레임이 구운 범위 안에 있으면 값이 같아야 하고, 없으면 구간 밖(앞·뒤)이 끝값으로 고정되면 안 된다.
 */
import { readFileSync } from 'node:fs';

export function bakedRepeatBad(v: number[], start: number, end: number, eps = 1e-4): string | null {
  const frames = v.length - 1;
  const P = end - start;
  if (P <= 0) return null;
  const f = (((start + Math.floor(P / 3)) % P) + P) % P;
  if (f + P <= frames) return Math.abs(v[f + P] - v[f]) <= eps ? null : `f${f + P} ${v[f + P]} ≠ f${f} ${v[f]}`;
  const flat = (a: number[]): boolean => a.length > 1 && Math.max(...a) - Math.min(...a) < 1e-7;
  if (Math.max(...v) - Math.min(...v) < 1e-7) return null;
  if (start > 0 && flat(v.slice(0, start + 1))) return `0~${start}f 고정`;
  if (end < frames && flat(v.slice(end))) return `${end}~${frames}f 고정`;
  return null;
}

type FmabJson = { materialAnims: { frames: number; materials: Record<string, { params: Record<string, Record<string, number | number[]>> }> }[] };

/** fmab 구운 JSON — 행 = [재질, 파라미터(material_ 뺀 이름), 오프셋, start, end] */
export function fmabRepeatBad(path: string, rows: [string, string, string, number, number][]): string[] {
  const j = JSON.parse(readFileSync(path, 'utf-8')) as FmabJson;
  const a = j.materialAnims[0];
  const bad: string[] = [];
  for (const [mat, param, off, start, end] of rows) {
    const v = a.materials[mat]?.params['material_' + param]?.[off];
    if (!Array.isArray(v)) bad.push(`${mat} ${param}[${off}] 없음`);
    else {
      const r = bakedRepeatBad(v, start, end);
      if (r) bad.push(`${mat} ${param}[${off}] ${r}`);
    }
  }
  return bad;
}

/** glb 스켈레탈 클립 — 행 = [뼈 이름, start, end](그 뼈의 커브가 모두 같은 구간의 Repeat 인 것만) */
export function glbRepeatBad(path: string, clip: string, rows: [string, number, number][]): string[] {
  const b = readFileSync(path);
  const jl = b.readUInt32LE(12);
  const g = JSON.parse(b.subarray(20, 20 + jl).toString('utf-8')) as {
    nodes: { name?: string }[];
    accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[];
    bufferViews: { byteOffset?: number }[];
    animations: { name?: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { output: number }[] }[];
  };
  const bin = b.subarray(20 + jl + 8);
  const an = g.animations.find((x) => x.name === clip);
  if (!an) return [`클립 ${clip} 없음`];
  const comps: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  const bad: string[] = [];
  for (const [bone, start, end] of rows) {
    const chs = an.channels.filter((c) => g.nodes[c.target.node].name === bone);
    if (!chs.length) {
      bad.push(`${bone} 채널 없음`);
      continue;
    }
    for (const ch of chs) {
      const acc = g.accessors[an.samplers[ch.sampler].output];
      const o = (g.bufferViews[acc.bufferView].byteOffset ?? 0) + (acc.byteOffset ?? 0);
      const c = comps[acc.type];
      for (let k = 0; k < c; k++) {
        const v = Array.from({ length: acc.count }, (_, i) => bin.readFloatLE(o + (i * c + k) * 4));
        const r = bakedRepeatBad(v, start, end, 1e-3);
        if (r) bad.push(`${bone} ${ch.target.path}[${k}] ${r}`);
      }
    }
  }
  return bad;
}
