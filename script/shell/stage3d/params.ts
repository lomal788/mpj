/**
 * 재질 파라미터 저장소·재질 애니(fmab) 재생 — docs/shell/stage3d.md §5.
 * - fres.params 를 재질마다 유니폼 값으로 둔다: material_utility_parameterN → P[N], material_utility_colorN → C[N], material_texture_srtN → srt[N](3×3), 그 밖은 raw.
 * - fmab json(프레임별로 구운 값, 성분 = 구조체 안 바이트 오프셋 03_graphics.md)이 그 값을 프레임마다 덮는다.
 * - TexSrt(0x00 모드, 0x04/0x08 스케일, 0x0C 회전, 0x10/0x14 이동) → 행렬: Maya 모드 식 [추정: Switch-Toolbox CalculateSRT2D 와 같은 꼴, 단위값이면 항등].
 * - static_opt_texture_srt0 이면(그래프 재질 포함) 표준 텍스처 좌표(vMapUv·노멀·거칠기·금속·발광·알파)에 srt0 을 곱한다 [판독 sg1: 분수 물기둥 jet_fountain00 "노멀 = 표준 _n0(srt0 스크롤 — fmab)"; 어느 표준 텍스처까지인지는 추정].
 */
import * as THREE from 'three';
import type { ClipHandle, Fres } from './types';

export interface TexSrt {
  mode: number;
  sx: number;
  sy: number;
  r: number;
  tx: number;
  ty: number;
}

export interface MatParams {
  P: THREE.Vector4[];
  C: THREE.Vector4[];
  srt: THREE.Matrix3[];
  srtRaw: TexSrt[];
  raw: Record<string, number[]>;
  version: number;
}

const N_P = 8;
const N_C = 4;
const N_SRT = 4;

export function srtMatrix(s: TexSrt, out = new THREE.Matrix3()): THREE.Matrix3 {
  const c = Math.cos(s.r);
  const n = Math.sin(s.r);
  return out.set(s.sx * c, s.sx * n, s.sx * (-0.5 * c - (0.5 * n - 0.5) - s.tx), -s.sy * n, s.sy * c, s.sy * (0.5 * n - (0.5 * c + 0.5) + s.ty) + 1, 0, 0, 1);
}

function vec(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'number') return [v];
  return [];
}

export function matParams(m: THREE.Material): MatParams | null {
  return (m.userData as { mpjParams?: MatParams }).mpjParams ?? null;
}

export function emptyParams(): MatParams {
  return {
    P: Array.from({ length: N_P }, () => new THREE.Vector4(1, 1, 1, 1)),
    C: Array.from({ length: N_C }, () => new THREE.Vector4(1, 1, 1, 1)),
    srt: Array.from({ length: N_SRT }, () => new THREE.Matrix3()),
    srtRaw: Array.from({ length: N_SRT }, () => ({ mode: 0, sx: 1, sy: 1, r: 0, tx: 0, ty: 0 })),
    raw: {},
    version: 0,
  };
}

export function initParams(m: THREE.Material, f: Fres): MatParams {
  const have = matParams(m);
  if (have) return have;
  const mp = emptyParams();
  for (const [k, p] of Object.entries(f.params ?? {})) {
    const v = p.value as unknown;
    let mm: RegExpExecArray | null;
    if ((mm = /^(?:material|env|skybox)_utility_parameter(\d)$/.exec(k)) && +mm[1] < N_P) mp.P[+mm[1]].fromArray([...vec(v), 1, 1, 1, 1].slice(0, 4));
    else if ((mm = /^material_utility_color(\d)$/.exec(k)) && +mm[1] < N_C) mp.C[+mm[1]].fromArray([...vec(v), 1, 1, 1, 1].slice(0, 4));
    else if ((mm = /^material_texture_srt(\d)$/.exec(k)) && +mm[1] < N_SRT && v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as { Mode?: string; Scaling?: { X: number; Y: number }; Rotation?: number; Translation?: { X: number; Y: number } };
      const s = mp.srtRaw[+mm[1]];
      s.mode = o.Mode === 'ModeMaya' ? 0 : o.Mode === 'Mode3dsMax' ? 1 : o.Mode === 'ModeSoftimage' ? 2 : 0;
      s.sx = o.Scaling?.X ?? 1;
      s.sy = o.Scaling?.Y ?? 1;
      s.r = o.Rotation ?? 0;
      s.tx = o.Translation?.X ?? 0;
      s.ty = o.Translation?.Y ?? 0;
      srtMatrix(s, mp.srt[+mm[1]]);
    } else mp.raw[k] = vec(v);
  }
  (m.userData as { mpjParams?: MatParams }).mpjParams = mp;
  return mp;
}

const SRT_KEY: Record<string, keyof TexSrt> = { '0x00': 'mode', '0x04': 'sx', '0x08': 'sy', '0x0C': 'r', '0x10': 'tx', '0x14': 'ty' };
const COMP: Record<string, number> = { '0x00': 0, '0x04': 1, '0x08': 2, '0x0C': 3 };

/** fmab 한 값 넣기(param = 원본 파라미터 이름, comp = 바이트 오프셋 문자열) */
export function setParam(mp: MatParams, param: string, comp: string, value: number): void {
  let mm: RegExpExecArray | null;
  const ci = COMP[comp];
  if ((mm = /^(?:material|env|skybox)_utility_parameter(\d)$/.exec(param)) && +mm[1] < N_P) mp.P[+mm[1]].setComponent(ci ?? 0, value);
  else if ((mm = /^material_utility_color(\d)$/.exec(param)) && +mm[1] < N_C) mp.C[+mm[1]].setComponent(ci ?? 0, value);
  else if ((mm = /^material_texture_srt(\d)$/.exec(param)) && +mm[1] < N_SRT) {
    const k = SRT_KEY[comp];
    if (k) {
      const s = mp.srtRaw[+mm[1]];
      s[k] = value;
      srtMatrix(s, mp.srt[+mm[1]]);
    }
  } else {
    const a = (mp.raw[param] ??= []);
    a[ci ?? 0] = value;
  }
  mp.version++;
}

const SRT_UVS = ['vMapUv', 'vNormalMapUv', 'vRoughnessMapUv', 'vMetalnessMapUv', 'vEmissiveMapUv', 'vAlphaMapUv'];
const SRT_DEF = ['USE_MAP', 'USE_NORMALMAP', 'USE_ROUGHNESSMAP', 'USE_METALNESSMAP', 'USE_EMISSIVEMAP', 'USE_ALPHAMAP'];

/** 표준 재질: 기본 텍스처 좌표에 srt0 곱하기 */
export function patchSrt0(m: THREE.MeshStandardMaterial, mp: MatParams): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.mpjSrt0 = { value: mp.srt[0] };
    const lines = SRT_UVS.map((v, i) => `#ifdef ${SRT_DEF[i]}\n\t${v} = ( mpjSrt0 * vec3( ${v}, 1.0 ) ).xy;\n#endif`).join('\n');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat3 mpjSrt0;').replace('#include <uv_vertex>', `#include <uv_vertex>\n${lines}`);
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-srt0`;
}

interface FmabJson {
  materialAnims: { name: string; frames: number; loop: boolean; materials: Record<string, { params?: Record<string, Record<string, number | number[]>> }> }[];
}

/** fmab 재생기 — 한 모델(루트)의 재질 이름이 맞는 재질에 값을 넣는다 */
export class FmabPlayer implements ClipHandle {
  readonly name: string;
  readonly frames: number;
  readonly loop: boolean;
  frame: number;
  speed: number;
  playing = true;
  private readonly targets = new Map<string, MatParams[]>();

  constructor(
    name: string,
    private readonly json: FmabJson,
    root: THREE.Object3D | null,
    opts: { loop?: boolean; startFrame?: number; speed?: number },
    extra?: Map<string, MatParams[]>,
  ) {
    this.name = name;
    const a = json.materialAnims[0];
    this.frames = a?.frames ?? 0;
    this.loop = opts.loop ?? a?.loop ?? true;
    this.frame = opts.startFrame ?? 0;
    this.speed = opts.speed ?? 1;
    const names = new Set<string>();
    for (const x of json.materialAnims) for (const k of Object.keys(x.materials)) names.add(k);
    root?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const f = (m.userData as { fres?: Fres }).fres;
        const n = f?.name ?? m.name;
        const mp = matParams(m);
        if (!mp || !names.has(n)) continue;
        const l = this.targets.get(n) ?? [];
        if (!l.includes(mp)) l.push(mp);
        this.targets.set(n, l);
      }
    });
    for (const [k, v] of extra ?? []) this.targets.set(k, [...(this.targets.get(k) ?? []), ...v]);
    this.apply();
  }

  isFinished(): boolean {
    return !this.loop && this.frame >= this.frames;
  }

  stop(): void {
    this.playing = false;
  }

  step(df: number): void {
    if (!this.playing) return;
    this.frame += df * this.speed;
    if (this.loop && this.frames > 0) this.frame = ((this.frame % this.frames) + this.frames) % this.frames;
    else if (this.frame < 0) this.frame = 0;
    this.apply();
  }

  /** 지금 프레임 값(재질 → 파라미터 → 성분 → 값) */
  sample(): Record<string, Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, Record<string, number>>> = {};
    for (const a of this.json.materialAnims) {
      const n = Math.max(0, Math.floor(a.loop || this.loop ? this.frame : Math.min(this.frame, a.frames)));
      for (const [mat, v] of Object.entries(a.materials)) {
        const pm = (out[mat] ??= {});
        for (const [param, comps] of Object.entries(v.params ?? {})) {
          const pc = (pm[param] ??= {});
          for (const [c, arr] of Object.entries(comps)) pc[c] = typeof arr === 'number' ? arr : arr[Math.min(n, arr.length - 1)];
        }
      }
    }
    return out;
  }

  private apply(): void {
    const s = this.sample();
    for (const [mat, params] of Object.entries(s)) {
      const list = this.targets.get(mat);
      if (!list) continue;
      for (const [param, comps] of Object.entries(params)) for (const [c, v] of Object.entries(comps)) for (const mp of list) setParam(mp, param, c, v);
    }
  }
}
