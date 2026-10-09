/**
 * 광장 NPC 재질 — 인스턴스마다 재질·텍스처를 복제하고 원본 셰이더 그래프 식을 덮는다(docs/shell/plaza_3d.md §6.11, analysis/mat/plaza_npc_graph.json).
 * - texture_srt(nn::g3d TexSrt Maya): 모션 ftsb.fmab 표(깜빡임 묶음 → 지금 모션 → 재질 기본값, Preview3D 와 같은 순서)의 값을 행렬로. 재질 옵션 texture_srtN = 1 인 것만.
 * - 색 변형: ChangeColor(c) = container mdl_utility_parameter0.x = P → 알베도 배열 층(GRAPH layer 규칙).
 * - 눈: 노코노코·파타파타(eye uv = _C2.x·srt1(uv1) + _C2.z·srt2(uv2))·가봉/해머(A = srt2(uv2), B = srt1(uv1))·쿠리보(P0..P2 정점색 uv) 합성.
 * - 틴트: 쿠리보 반다나 a·mix(1, C[ip], a.a), 해머 mix(a, C[ip], a.a).
 * - 눈 시선: ComHeading 눈 출력을 eyeN_shaderparam(srt1/srt2) 이동으로(FUN_71001c5a58, 09 §6.8) — srt1/2 를 읽는 눈만 보인다.
 * [근사] 림·SSS·노멀 배열은 넣지 않는다.
 * spec.layers 경로 = 명세 폴더 기준 상대 경로(공용 assets/chara/tex, docs/engine/chara_assets.md §5).
 */
import * as THREE from 'three';
import { EyeLook } from '@game/lib/character';
import { loadTextureInto } from '@app/common/render3d/assetLoader';
import type { Heading } from './heading';

type ParamV = number | number[];
type MatTable = Record<string, Record<string, Record<string, ParamV>>>;

interface MotionInfo {
  frames: number;
  loop: boolean;
  blinkName?: string;
  matFrames?: number;
  mat?: MatTable;
}

interface SlotView {
  current: string;
  frame: number;
  motions: Record<string, MotionInfo>;
}

interface SrtValue {
  sx: number;
  sy: number;
  r: number;
  tx: number;
  ty: number;
}

interface LookSpec {
  pc: string;
  layers: Record<string, string[]>;
  npc: { eyes: Record<string, unknown>[] }[];
}

export type LayerRule = 'kinopio' | 'round' | 'zero';

/** 재질 하나의 그래프 규칙 [판독 plaza_npc_graph.json] */
export interface MatRule {
  /** 알베도 배열(spec.layers 키)과 층 규칙 — glb 알베도가 없거나 0번 층뿐인 재질 */
  arr?: { tex: string; layer: LayerRule };
  /** 눈 합성 */
  eye?: { mode: 'noko' | 'gabon' | 'kuribo'; tex: string };
  /** 틴트(ip = material_utility_integer_parameter0.x) */
  tint?: { mode: 'mul' | 'replace'; ip: number };
}

export const GRAPH: Record<string, Record<string, MatRule>> = {
  npc022: { body_m: { arr: { tex: 'npc022_body_arr_alb', layer: 'kinopio' } } },
  npc003: {
    body_m: { arr: { tex: 'npc003_body_arr_alb', layer: 'round' } },
    eye_m: { arr: { tex: 'npc003_body_arr_alb', layer: 'zero' }, eye: { mode: 'noko', tex: 'npc003_eye_alb' } },
  },
  npc053: {
    body_m: { arr: { tex: 'npc053_body_arr_alb', layer: 'round' } },
    eye_m: { arr: { tex: 'npc053_body_arr_alb', layer: 'zero' }, eye: { mode: 'noko', tex: 'npc053_eye_alb' } },
  },
  npc002: { body_m: { arr: { tex: 'npc002_body_arr_alb', layer: 'round' } } },
  npc001: { body_m: { eye: { mode: 'kuribo', tex: 'npc001_eye_alb' } } },
  npc001bd: { body_m: { eye: { mode: 'kuribo', tex: 'npc001_eye_alb' } }, bandanna_m: { tint: { mode: 'mul', ip: 0 } } },
  npc044: { body_m: { tint: { mode: 'replace', ip: 2 } }, eye_m: { eye: { mode: 'gabon', tex: 'npc044_eye_alb' } } },
  npc029a: { eye_m: { eye: { mode: 'gabon', tex: 'npc029_eye_alb' } } },
};

/** 색 번호 P → 배열 층 [판독: 키노피오 switch, 그 밖 f2i round + GPU 층 clamp] */
export function layerOf(rule: LayerRule, p: number, count: number): number {
  if (rule === 'zero') return 0;
  if (rule === 'kinopio') {
    if (p < 0) return 0;
    if (p < 4) return Math.trunc(p);
    return Math.trunc(p - 4) === 1 ? 5 : 4;
  }
  return Math.max(0, Math.min(count - 1, Math.round(p)));
}

const COMP = { sx: '0x04', sy: '0x08', r: '0x0C', tx: '0x10', ty: '0x14' } as const;
const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'] as const;

const at = (v: ParamV | undefined, f: number): number | undefined => {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(f)))];
};
const wrap = (f: number, n: number | undefined): number => (n && n > 0 ? f % n : f);

/** nn::g3d TexSrt Maya 모드 행렬(uv' = M·(u, v, 1)) [데이터 5건으로 확인, §6.11] */
export function srtMaya(s: SrtValue, m: THREE.Matrix3): THREE.Matrix3 {
  const c = Math.cos(s.r);
  const n = Math.sin(s.r);
  return m.set(
    s.sx * c,
    s.sx * n,
    s.sx * (-0.5 * c - 0.5 * n + 0.5 - s.tx),
    -s.sy * n,
    s.sy * c,
    s.sy * (0.5 * n - 0.5 * c + 0.5 + s.ty) + 1 - s.sy,
    0,
    0,
    1,
  );
}

interface FresLike {
  params?: Record<string, { value: unknown }>;
  shader?: { options?: Record<string, string> };
}

interface Uni {
  npcEye: { value: THREE.Texture | null };
  npcM1: { value: THREE.Matrix3 };
  npcM2: { value: THREE.Matrix3 };
  npcP: { value: THREE.Vector4[] };
  npcC0: { value: THREE.Color };
  npcTint: { value: THREE.Color };
}

interface Inst {
  name: string;
  mat: THREE.MeshStandardMaterial;
  rule: MatRule;
  base: Record<number, SrtValue>;
  srtOn: Record<number, boolean>;
  maps: Partial<Record<(typeof MAPS)[number], THREE.Texture>>;
  uni: Uni | null;
  pDef: number[][];
}

function vec4(v: unknown, d: number[]): number[] {
  return Array.isArray(v) ? [0, 1, 2, 3].map((i) => Number(v[i] ?? d[i])) : d;
}

/** 셰이더 그래프 덮기(onBeforeCompile) — 정점 속성 npcUv1(TEXCOORD_1)·npcUv2(TEXCOORD_2)·npcC1/npcC2(_C1/_C2) */
function patch(m: THREE.MeshStandardMaterial, rule: MatRule, u: Uni, key: string): void {
  m.customProgramCacheKey = () => `plaza-npc|${key}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    const mode = rule.eye?.mode;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 npcUv1;\nattribute vec2 npcUv2;\nattribute vec4 npcC1;\nattribute vec4 npcC2;\nuniform mat3 npcM1;\nuniform mat3 npcM2;\nuniform vec4 npcP[3];\nvarying vec2 vNpcA;\nvarying vec2 vNpcB;\nvarying vec2 vNpcC;',
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
${mode === 'noko' ? 'vNpcA = npcC2.x * (npcM1 * vec3(npcUv1, 1.0)).xy + npcC2.z * (npcM2 * vec3(npcUv2, 1.0)).xy;' : ''}
${mode === 'gabon' ? 'vNpcA = (npcM2 * vec3(npcUv2, 1.0)).xy; vNpcB = (npcM1 * vec3(npcUv1, 1.0)).xy;' : ''}
${mode === 'kuribo' ? 'vNpcC = vec2(uv.x + npcC1.y * npcP[2].x, 0.5 * (uv.y + npcC1.y * npcP[2].y) + 0.5); vNpcA = vec2(npcUv1.x - npcC1.x * npcP[1].x - npcC1.z * npcP[0].x, npcUv1.y + npcC1.x * npcP[1].y + npcC1.z * npcP[0].y);' : ''}`,
      );
    const frag: string[] = [];
    if (mode === 'noko')
      frag.push('{ vec4 e = texture2D(npcEye, vNpcA); vec3 b = mix(npcC0, e.rgb, e.a); diffuseColor.rgb = mix(b, diffuseColor.rgb, diffuseColor.a); }');
    if (mode === 'gabon')
      frag.push(
        '{ vec4 A = texture2D(npcEye, clamp(vNpcA, 0.0, 1.0)); vec4 B = texture2D(npcEye, clamp(vNpcB, 0.0, 1.0)); vec3 p = mix(B.rgb, A.rgb, A.a); vec3 b = mix(npcC0, p, clamp(A.a + B.a, 0.0, 1.0)); diffuseColor.rgb = mix(b, diffuseColor.rgb, diffuseColor.a); }',
      );
    if (mode === 'kuribo')
      frag.push('{ vec4 bd = texture2D(map, vNpcC); vec4 e = texture2D(npcEye, vNpcA); diffuseColor.rgb = diffuse * mix(bd.rgb, e.rgb, e.a * (1.0 - bd.a)); }');
    if (rule.tint?.mode === 'mul') frag.push('diffuseColor.rgb = diffuseColor.rgb * mix(vec3(1.0), npcTint, diffuseColor.a);');
    if (rule.tint?.mode === 'replace') frag.push('diffuseColor.rgb = mix(diffuseColor.rgb, npcTint, diffuseColor.a);');
    frag.push('diffuseColor.a = 1.0;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D npcEye;\nuniform vec3 npcC0;\nuniform vec3 npcTint;\nvarying vec2 vNpcA;\nvarying vec2 vNpcB;\nvarying vec2 vNpcC;')
      .replace('#include <map_fragment>', `#include <map_fragment>\n${frag.join('\n')}`);
  };
}

export class NpcLook {
  private readonly mats: Inst[] = [];
  private color: number | null;
  private readonly texCache = new Map<string, THREE.Texture>();
  private eyes: EyeLook[] = [];
  private readonly eyeOut: (THREE.Vector2 | null)[] = [null, null];

  constructor(
    private readonly spec: LookSpec,
    color: number | null,
    private readonly url: (p: string) => string,
  ) {
    this.color = color;
  }

  /** spec.layers 의 png(배열이면 층 i) → 텍스처(flipY 끔, 알베도 sRGB) */
  private tex(name: string, i: number, srgb = true): THREE.Texture | null {
    const files = this.spec.layers[name];
    if (!files?.length) return null;
    const f = files[Math.max(0, Math.min(files.length - 1, i))];
    let t = this.texCache.get(f);
    if (!t) {
      const tx = new THREE.Texture();
      tx.flipY = false;
      tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tx.matrixAutoUpdate = false;
      tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
      void loadTextureInto(this.url(f), tx).catch(() => undefined);
      this.texCache.set(f, tx);
      t = tx;
    }
    return t;
  }

  layerCount(name: string): number {
    return this.spec.layers[name]?.length ?? 0;
  }

  bind(root: THREE.Object3D, spec: LookSpec): void {
    const rules = GRAPH[spec.pc] ?? {};
    const seen = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!src.isMeshStandardMaterial) return;
      const rule = rules[src.name] ?? {};
      let m = seen.get(src);
      if (!m) {
        m = src.clone();
        m.transparent = false;
        const maps: Inst['maps'] = {};
        for (const k of MAPS) {
          const t = m[k];
          if (t) {
            const c = t.clone();
            c.matrixAutoUpdate = false;
            m[k] = c;
            maps[k] = c;
          }
        }
        const fres = (m.userData?.fres ?? {}) as FresLike;
        const params = fres.params ?? {};
        const opts = fres.shader?.options ?? {};
        const base: Record<number, SrtValue> = {};
        const srtOn: Record<number, boolean> = {};
        for (let i = 0; i < 4; i++) {
          const v = params[`material_texture_srt${i}`]?.value as { Scaling?: { X: number; Y: number }; Rotation?: number; Translation?: { X: number; Y: number } } | undefined;
          if (v?.Scaling) base[i] = { sx: v.Scaling.X, sy: v.Scaling.Y, r: v.Rotation ?? 0, tx: v.Translation?.X ?? 0, ty: v.Translation?.Y ?? 0 };
          srtOn[i] = opts[`static_opt_texture_srt${i}`] === '1';
        }
        const pDef = [0, 1, 2].map((i) => vec4(params[`material_utility_parameter${i}`]?.value, [0, 0, 0, 0]));
        let uni: Uni | null = null;
        if (rule.eye || rule.tint) {
          const ip = rule.tint ? Math.trunc(vec4(params.material_utility_integer_parameter0?.value, [rule.tint.ip, 0, 0, 0])[0]) : 0;
          const tc = vec4(params[`material_utility_color${Math.max(0, Math.min(3, ip))}`]?.value, [1, 1, 1, 1]);
          const c0 = vec4(params.material_utility_color0?.value, [1, 1, 1, 1]);
          uni = {
            npcEye: { value: rule.eye ? this.tex(rule.eye.tex, 0) : null },
            npcM1: { value: new THREE.Matrix3() },
            npcM2: { value: new THREE.Matrix3() },
            npcP: { value: pDef.map((v) => new THREE.Vector4(v[0], v[1], v[2], v[3])) },
            npcC0: { value: new THREE.Color(c0[0], c0[1], c0[2]) },
            npcTint: { value: new THREE.Color(tc[0], tc[1], tc[2]) },
          };
          if (base[1]) srtMaya(base[1], uni.npcM1.value);
          if (base[2]) srtMaya(base[2], uni.npcM2.value);
          patch(m, rule, uni, `${spec.pc}|${src.name}`);
        }
        this.mats.push({ name: src.name, mat: m, rule, base, srtOn, maps, uni, pDef });
        seen.set(src, m);
      }
      mesh.material = m;
      if (rule.eye) {
        const g = mesh.geometry;
        const n = g.getAttribute('position').count;
        const z = (k: number): THREE.BufferAttribute => new THREE.BufferAttribute(new Float32Array(n * k), k);
        if (!g.getAttribute('npcUv1')) g.setAttribute('npcUv1', g.getAttribute('uv1') ?? z(2));
        if (!g.getAttribute('npcUv2')) g.setAttribute('npcUv2', g.getAttribute('uv2') ?? z(2));
        if (!g.getAttribute('npcC1')) g.setAttribute('npcC1', g.getAttribute('_c1') ?? z(4));
        if (!g.getAttribute('npcC2')) g.setAttribute('npcC2', g.getAttribute('_c2') ?? z(4));
      }
    });
    const rec = spec.npc[0];
    this.eyes = (rec?.eyes ?? [])
      .filter((e) => String(e.shaderparam ?? '').startsWith('material_texture_srt'))
      .map(
        (e) =>
          new EyeLook(
            {
              ox: Number(e.t_offset_x ?? 0),
              oy: Number(e.t_offset_y ?? 0),
              sx: Number(e.t_scale_x ?? 0),
              sy: Number(e.t_scale_y ?? 0),
              rot: Number(e.t_rot ?? 0),
              minx: Number(e.t_min_x ?? 0),
              miny: Number(e.t_min_y ?? 0),
              maxx: Number(e.t_max_x ?? 0),
              maxy: Number(e.t_max_y ?? 0),
            },
            'npc',
          ),
      );
    this.setColor(this.color);
  }

  /** ChangeColor(c) → 알베도 배열 층(색 없음 = container 기본 P 0) */
  setColor(c: number | null): void {
    this.color = c;
    const p = c ?? 0;
    for (const i of this.mats) {
      const a = i.rule.arr;
      if (!a) continue;
      const t = this.tex(a.tex, layerOf(a.layer, p, this.layerCount(a.tex)));
      if (!t) continue;
      const had = !!i.mat.map;
      i.mat.map = t;
      i.maps.map = t;
      if (!had) i.mat.needsUpdate = true;
    }
  }

  /** 지금 알베도 층(시험·debug) */
  albedoLayer(mat: string): { tex: string; layer: number } | null {
    const i = this.mats.find((x) => x.name === mat);
    const a = i?.rule.arr;
    if (!a) return null;
    return { tex: a.tex, layer: layerOf(a.layer, this.color ?? 0, this.layerCount(a.tex)) };
  }

  private srtAt(inst: Inst, n: number, slot: SlotView): SrtValue | null {
    const base = inst.base[n];
    if (!base) return null;
    const cur = slot.motions[slot.current];
    const blink = cur?.blinkName ? slot.motions[cur.blinkName] : undefined;
    const p = `material_texture_srt${n}`;
    const tb = blink?.mat?.[inst.name]?.[p];
    const tc = cur?.mat?.[inst.name]?.[p];
    const fb = blink ? wrap(slot.frame, blink.matFrames ?? blink.frames) : 0;
    const fc = cur?.loop ? wrap(slot.frame, cur.matFrames ?? cur.frames) : slot.frame;
    const v = (k: (typeof COMP)[keyof typeof COMP], d: number): number => at(tb?.[k], fb) ?? at(tc?.[k], fc) ?? d;
    return { sx: v(COMP.sx, base.sx), sy: v(COMP.sy, base.sy), r: v(COMP.r, base.r), tx: v(COMP.tx, base.tx), ty: v(COMP.ty, base.ty) };
  }

  /** Preview3D 칸 pose 뒤: srt0(텍스처 행렬)·srt1/2(눈 uniform)·쿠리보 P0..P2 를 지금 모션 프레임 값으로 */
  apply(slot: SlotView | undefined): void {
    if (!slot) return;
    const cur = slot.motions[slot.current];
    const blink = cur?.blinkName ? slot.motions[cur.blinkName] : undefined;
    for (const i of this.mats) {
      const s0 = i.srtOn[0] ? this.srtAt(i, 0, slot) : null;
      if (s0) for (const k of MAPS) if (i.maps[k]) srtMaya(s0, i.maps[k]!.matrix);
      if (!i.uni) continue;
      for (const n of [1, 2] as const) {
        const s = this.srtAt(i, n, slot);
        const eo = this.eyeOut[n - 1];
        if (s && eo) {
          s.tx = eo.x;
          s.ty = eo.y;
        }
        if (s) srtMaya(s, n === 1 ? i.uni.npcM1.value : i.uni.npcM2.value);
      }
      if (i.rule.eye?.mode === 'kuribo') {
        const fc = cur?.loop ? wrap(slot.frame, cur.matFrames ?? cur.frames) : slot.frame;
        const fb = blink ? wrap(slot.frame, blink.matFrames ?? blink.frames) : 0;
        i.uni.npcP.value.forEach((v, n) => {
          const p = `material_utility_parameter${n}`;
          const g = (c: string, d: number): number => at(blink?.mat?.[i.name]?.[p]?.[c], fb) ?? at(cur?.mat?.[i.name]?.[p]?.[c], fc) ?? d;
          v.set(g('0x00', i.pDef[n][0]), g('0x04', i.pDef[n][1]), g('0x08', i.pDef[n][2]), g('0x0C', i.pDef[n][3]));
        });
      }
    }
  }

  /** 눈 시선(FUN_71001c5a58) — 결과는 다음 apply 에서 srt1/srt2 이동으로 들어감(srt1/2 를 읽는 눈에만 보임) */
  applyEyes(h: Heading): void {
    this.eyes.forEach((e, i) => {
      if (i > 1) return;
      e.update(1, h.eyesActive, h.eyeYaw, h.eyePitch, 0, 0);
      this.eyeOut[i] = (this.eyeOut[i] ?? new THREE.Vector2()).set(e.outX, e.outY);
    });
  }

  eyeOffset(i: number): THREE.Vector2 | null {
    return this.eyeOut[i];
  }
}
