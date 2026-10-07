/**
 * 셰이더 그래프 재질 — 판독한 그래프 식(analysis/mat/plaza_graph_{1,2}.json → tools/analysis/plaza_graph_web.py → manifest.graphs)을
 * three 표준 재질에 끼운다(docs/shell/stage3d.md §5, plaza_3d.md §6.8). 식은 판독 GLSL 그대로이고 이름만 아래로 묶는다.
 *   정점: uv0 uv1 uv2(vec2), c0 c1 c2(vec4 정점색 _C0.._C2), pos(object 위치), nrm(object 노멀), worldPos(모델 행렬 뒤 위치), nrmW(월드 노멀)
 *   값: P0..P7 = material_utility_parameterN, C0..C3 = material_utility_colorN, srt0(uv)..srt3(uv) = material_texture_srtN, material_*(그 밖 재질 파라미터),
 *       ENV0..ENV3 = env_utility_parameterN, mpjMs = 장면 경과 ms(원본 World[0x4] [추정: ms]), T("샘플러", uv) = 텍스처 표본(SNORM 은 −1..1 로 되돌림)
 *   조각: worldPos, viewDir(표면→카메라), Nw(노멀맵 뒤 월드 노멀), NgW(노멀맵 전 월드 노멀), Tw·tw(월드 탄젠트·부호), sunDir(표면→태양), base(표준 기본색)
 * 넣는 자리: vsPrelude·uv·positionOffset → begin_vertex 뒤(world 공간 오프셋은 모델 행렬 역으로 object 로), 조각 식은 emissivemap_fragment 뒤 한곳
 * (노멀이 정해진 뒤·조명 앞)에서 diffuseColor·roughnessFactor·metalnessFactor·totalEmissiveRadiance·normal 을 덮고, ao 는 간접광에 곱한다
 * (확산 ×ao, 반사 ×min(ao,1) — 판독 주석). modelOpacity(원본 Model[0x20c]) = 1 [추정].
 */
import * as THREE from 'three';
import type { MatParams } from './params';
import type { StageGlobals } from './stage';
import type { Fres } from './types';

export interface GraphDef {
  material: string;
  models: string[];
  program?: string;
  /** 샘플러 이름 → 텍스처 이름(null = 원본도 미할당 — 기본값 텍스처) */
  samplers: Record<string, string | null>;
  vsHelpers?: string[];
  vsPrelude?: string | null;
  uv?: Record<string, string>;
  positionOffset?: string | null;
  positionSpace?: 'object' | 'world';
  fsHelpers?: string[];
  fsPrelude?: string | null;
  baseColor?: string | null;
  alpha?: string | null;
  discard?: string | null;
  emissive?: string | null;
  normal?: string | null;
  roughness?: string | null;
  metallic?: string | null;
  ao?: string | null;
  approx?: string | null;
}

/** 그래프 이름 → glb 속성(GLTFLoader: TEXCOORD_n → uv·uvN, 사용자 속성 _C0.._C2 → _c0.._c2), 선언 조건(three 가 이미 선언하면 건너뜀) */
const ATTR: Record<string, { attr: string; type: string; guard: string | null }> = {
  uv0: { attr: 'uv', type: 'vec2', guard: null },
  uv1: { attr: 'uv1', type: 'vec2', guard: 'USE_UV1' },
  uv2: { attr: 'uv2', type: 'vec2', guard: 'USE_UV2' },
  uv3: { attr: 'uv3', type: 'vec2', guard: 'USE_UV3' },
  c0: { attr: '_c0', type: 'vec4', guard: '' },
  c1: { attr: '_c1', type: 'vec4', guard: '' },
  c2: { attr: '_c2', type: 'vec4', guard: '' },
};

/** 재질에 값이 없을 때 원본 셰이더 기본값 [추정] */
const RAW_DEFAULT: Record<string, number[]> = {
  material_mul_base_color: [1, 1, 1],
  material_mul_opacity: [1],
  material_base_color: [1, 1, 1],
  material_emissive_color: [0, 0, 0],
  material_emissive_color_scale: [1],
  material_metallic: [0],
  material_sss_normal_blend: [1],
};

const HELPERS = `
uniform vec4 mpjP[8];
uniform vec4 mpjC[4];
uniform mat3 mpjSrt[4];
uniform vec4 mpjEnvP[4];
uniform float mpjMs;
uniform vec3 mpjSunDir;
vec2 srt0(vec2 u) { return (mpjSrt[0] * vec3(u, 1.0)).xy; }
vec2 srt1(vec2 u) { return (mpjSrt[1] * vec3(u, 1.0)).xy; }
vec2 srt2(vec2 u) { return (mpjSrt[2] * vec3(u, 1.0)).xy; }
vec2 srt3(vec2 u) { return (mpjSrt[3] * vec3(u, 1.0)).xy; }
`;

export interface GraphTex {
  tex: THREE.Texture | null;
  snorm: boolean;
}

interface Built {
  texIndex: Map<string, number>;
  raws: Set<string>;
}

function rewrite(src: string | null | undefined, b: Built): string {
  if (!src) return '';
  return src
    .replace(/T\(\s*"([^"]+)"\s*,/g, (_m, n: string) => {
      let i = b.texIndex.get(n);
      if (i === undefined) b.texIndex.set(n, (i = b.texIndex.size));
      return `mpjT${i}(`;
    })
    .replace(/\bmaterial_[a-z0-9_]+\b/g, (n) => {
      if (/^material_utility_(parameter|color)\d$/.test(n)) return n;
      b.raws.add(n);
      return `mpjR_${n}`;
    })
    .replace(/\bP([0-7])\b/g, 'mpjP[$1]')
    .replace(/\bC([0-3])\b/g, 'mpjC[$1]')
    .replace(/\bENV([0-3])\b/g, 'mpjEnvP[$1]')
    .replace(/\bmodelOpacity\b/g, '1.0');
}

const GLSL_TYPE = ['float', 'float', 'vec2', 'vec3', 'vec4'];

/** 표준 재질에 그래프 식을 끼운다. 텍스처는 load(이름)로 읽는다. 쓴 이름 목록을 돌려준다(시험용) */
export async function applyGraph(
  m: THREE.MeshStandardMaterial,
  def: GraphDef,
  f: Fres | null,
  mp: MatParams,
  g: StageGlobals,
  load: (name: string) => Promise<GraphTex | null>,
): Promise<void> {
  const src = graphSource(def, (n) => (mp.raw[n] ?? RAW_DEFAULT[n] ?? [0]).length);
  const texs: GraphTex[] = [];
  for (const [n, i] of src.texIndex) {
    const tname = n.startsWith('@') ? n.slice(1) : n in def.samplers ? def.samplers[n] : (f?.samplers?.find((s) => s.sampler === n || s.slots.includes(n))?.texture ?? null);
    texs[i] = (tname ? await load(tname) : null) ?? { tex: defaultTexture(n), snorm: false };
  }
  const raws: Record<string, { value: unknown }> = {};
  for (const r of src.raws) {
    const v = mp.raw[r] ?? RAW_DEFAULT[r] ?? [0];
    raws[`mpjR_${r}`] = { value: v.length === 1 ? v[0] : new (v.length === 2 ? THREE.Vector2 : v.length === 3 ? THREE.Vector3 : THREE.Vector4)(...(v as [number, number, number, number])) };
  }
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, { mpjP: { value: mp.P }, mpjC: { value: mp.C }, mpjSrt: { value: mp.srt }, mpjEnvP: { value: g.env.P }, mpjMs: g.ms, mpjSunDir: g.sunDir }, raws);
    texs.forEach((t, i) => (sh.uniforms[`mpjGT${i}`] = { value: t.tex }));
    const head = HELPERS + src.rawDecl + texs.map((t, i) => `uniform sampler2D mpjGT${i};\nvec4 mpjT${i}(vec2 u) { vec4 v = texture2D(mpjGT${i}, u); return ${t.snorm ? 'v * 2.0 - 1.0' : 'v'}; }`).join('\n');
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${head}\n${src.vsDecl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${src.vsBody}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}\n${src.fsDecl}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${src.fsBody}`);
    if (def.ao)
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mpjAO;\nreflectedLight.indirectSpecular *= min(mpjAO, 1.0);`,
      );
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-graph:${def.material}:${def.program ?? ''}`;
  m.needsUpdate = true;
}

const defaults = new Map<string, THREE.DataTexture>();
function defaultTexture(sampler: string): THREE.Texture {
  const k = sampler === '_n0' ? 'n' : 'z';
  let t = defaults.get(k);
  if (!t) {
    t = new THREE.DataTexture(new Uint8Array(k === 'n' ? [128, 128, 255, 255] : [0, 0, 0, 255]), 1, 1);
    t.needsUpdate = true;
    defaults.set(k, t);
  }
  return t;
}

export interface GraphSource {
  texIndex: Map<string, number>;
  raws: Set<string>;
  rawDecl: string;
  vsDecl: string;
  vsBody: string;
  fsDecl: string;
  fsBody: string;
}

/** 그래프 정의 → 셰이더 조각(시험이 같은 것을 GLSL 컴파일로 확인한다) */
export function graphSource(def: GraphDef, rawLen: (name: string) => number = (n) => (RAW_DEFAULT[n] ?? [0]).length): GraphSource {
  const b: Built = { texIndex: new Map(), raws: new Set() };
  const vsHelpers = (def.vsHelpers ?? []).map((h) => rewrite(h, b)).join('\n');
  const vsPre = rewrite(def.vsPrelude, b);
  const uv = Object.entries(def.uv ?? {}).map(([k, e]) => [k, rewrite(e, b)] as const);
  const pos = rewrite(def.positionOffset, b);
  const fsHelpers = (def.fsHelpers ?? []).map((h) => rewrite(h, b)).join('\n');
  const fsPre = rewrite(def.fsPrelude, b);
  const fx: Record<string, string> = {};
  for (const k of ['baseColor', 'alpha', 'discard', 'emissive', 'normal', 'roughness', 'metallic', 'ao'] as const) if (def[k]) fx[k] = rewrite(def[k], b);
  const vsText = [vsHelpers, vsPre, pos, ...uv.map((x) => x[1])].join(' ');
  const fsText = [fsHelpers, fsPre, ...Object.values(fx)].join(' ');
  const has = (t: string, k: string): boolean => new RegExp(`\\b${k}\\b`).test(t);
  const vin = Object.keys(ATTR).filter((k) => has(vsText, k));
  const fin = Object.keys(ATTR).filter((k) => has(fsText, k));
  const allIn = [...new Set([...vin, ...fin])];
  const attrs = allIn
    .filter((k) => ATTR[k].guard !== null)
    .map((k) => (ATTR[k].guard ? `#ifndef ${ATTR[k].guard}\nattribute ${ATTR[k].type} ${ATTR[k].attr};\n#endif` : `attribute ${ATTR[k].type} ${ATTR[k].attr};`))
    .join('\n');
  const needT = has(fsText, 'Tw') || has(fsText, 'tw');
  const vary = [
    ...uv.map(([k]) => `varying vec2 ${k};`),
    ...fin.map((k) => `varying ${ATTR[k].type} mpjV_${k};`),
    'varying vec3 mpjWorldPos;',
    needT ? 'varying vec4 mpjTangentW;' : '',
  ].join('\n');
  const rawDecl = [...b.raws].map((r) => `uniform ${GLSL_TYPE[Math.min(4, rawLen(r))]} mpjR_${r};`).join('\n') + '\n';
  const alias = (list: string[], to: (k: string) => string): [string, string] => [list.map((k) => `#define ${k} ${to(k)}`).join('\n'), list.map((k) => `#undef ${k}`).join('\n')];
  const [vOpen, vClose] = alias(allIn, (k) => ATTR[k].attr);
  const [fOpen, fClose] = alias(fin, (k) => `mpjV_${k}`);
  const vsDecl = `${attrs}\n${needT ? '#ifndef USE_TANGENT\nattribute vec4 tangent;\n#endif' : ''}\n${vary}\n${vOpen}\n#define pos position\n#define nrm objectNormal\n${vsHelpers}\n#undef pos\n#undef nrm\n${vClose}`;
  const offset = pos ? (def.positionSpace === 'world' ? `transformed += inverse(mat3(modelMatrix)) * (${pos});` : `transformed += ${pos};`) : '';
  const vsBody = `{
${vOpen}
#define pos position
#define nrm objectNormal
vec3 worldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vec3 nrmW = mat3(modelMatrix) * objectNormal;
${vsPre}
${fin.map((k) => `mpjV_${k} = ${k};`).join('\n')}
${uv.map(([k, e]) => `${k} = ${e};`).join('\n')}
${needT ? 'mpjTangentW = vec4(mat3(modelMatrix) * tangent.xyz, tangent.w);' : ''}
${offset}
mpjWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#undef pos
#undef nrm
${vClose}
}`;
  const fsDecl = `${vary}\nfloat mpjAO = 1.0;\n${fOpen}\n#define worldPos mpjWorldPos\n#define viewDir normalize(cameraPosition - mpjWorldPos)\n#define sunDir mpjSunDir\n#define Tw mpjTangentW.xyz\n#define tw mpjTangentW.w\n${fsHelpers}\n#undef worldPos\n#undef viewDir\n#undef sunDir\n#undef Tw\n#undef tw\n${fClose}`;
  const fsBody = `{
${fOpen}
#define worldPos mpjWorldPos
#define viewDir normalize(cameraPosition - mpjWorldPos)
#define sunDir mpjSunDir
#define Tw mpjTangentW.xyz
#define tw mpjTangentW.w
vec3 Nw = inverseTransformDirection(normal, viewMatrix);
vec3 NgW = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
vec3 base = diffuseColor.rgb;
${fsPre}
${fx.baseColor ? `diffuseColor.rgb = ${fx.baseColor};` : ''}
${fx.alpha ? `diffuseColor.a = ${fx.alpha};` : ''}
${fx.discard ? `if (${fx.discard}) discard;` : ''}
${fx.roughness ? `roughnessFactor = ${fx.roughness};` : ''}
${fx.metallic ? `metalnessFactor = ${fx.metallic};` : ''}
${fx.emissive ? `totalEmissiveRadiance = ${fx.emissive};` : ''}
${fx.ao ? `mpjAO = ${fx.ao};` : ''}
${fx.normal ? `normal = normalize((viewMatrix * vec4(${fx.normal}, 0.0)).xyz);` : ''}
#undef worldPos
#undef viewDir
#undef sunDir
#undef Tw
#undef tw
${fClose}
}`;
  return { texIndex: b.texIndex, raws: b.raws, rawDecl, vsDecl, vsBody, fsDecl, fsBody };
}
