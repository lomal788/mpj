/**
 * 공용 무대·mg1801 재질 조명 설정 — 장면별 옵션·로더를 주입한다(render_common.md).
 * glb 재질 extras.fres(원본 forward_plus 재질의 옵션·renderInfo·파라미터·샘플러 원값, 03_graphics.md 7.3)를 읽어
 * 원본이 켜는 조명 기능만 three 재질에 옮긴다. 식은 three 표준 BRDF 근사다.
 *
 * mg1801 과 같은 규칙: 그림자 플래그, 평행광 끔(directional_lighting_enable 0), 라이트맵 gi_diffuse_texture2d(UV = bake_texture_uv_index,
 * 세기 π × gi_diffuse_texture_scale), AO 는 변환기가 넣은 occlusionTexture, IBL 확산 = irr 큐브 직접(ibl_type 1 = cha), 반사 = rad PMREM,
 * gi_diffuse_texture_contains_ibl 이면 확산 IBL 생략, mul_base_color.
 * 바꾼 것:
 * - 텍스처 색인은 무대 manifest.textures(tools/analysis/mgmet_world_assets.py).
 * - 셰이더 그래프(static_opt_shader_graph 1) 재질 [근사]: 그래프 식은 읽지 않고 glb 알베도·라이트맵만 쓴다(docs/shell/mgmet_3d.md §2·§8).
 * - 국소 반사 큐브(specular_ibl_type 2) + specular_ibl_normalization_enable [근사]: 원본은 국소 큐브를 장면 조도에 맞춰 정규화한다(식 미판독). 웹은
 *   국소 큐브 평균 휘도를 공통 반사 큐브(menu00_plaza_rad) 평균에 맞추는 배율(manifest textures[].specNorm)을 envMapIntensity 로 곱한다.
 * - 라이트맵 그림자(shadow_texture2d, sdw) [근사]: 원본은 정적 그림자 마스크로 평행광을 가린다고 보고 [추정: 슬롯 이름],
 *   평행광 직접광에 sdw 텍스처의 R 을 곱한다(UV = bake_texture_uv_index).
 * - punchthrough(render_state_display_face·alpha test): 변환기가 glb alphaMode MASK·doubleSided 로 넣은 값을 그대로 쓴다.
 * - 양면 굴절 재질은 앞면만 그린다: 원본은 색 버퍼 캡처 뒤 그 캡처를 읽으며 그리므로 자기 뒷면이 굴절 장면에 없다. three 투과 패스는 DoubleSide 뒷면을
 *   투과 버퍼에 먼저 그려 한 겹이 더 비친다(docs/shell/plaza_3d.md §6.14 #14c).
 * - capture_color_buffer_type ≠ 0 인 비굴절 재질(분수 물줄기 등) [추정: 캡처 전에 그린다]: 혼합은 그대로 두고 불투명 목록 맨 끝(CAPTURE_ORDER)에서
 *   깊이 쓰기 없이 그려 투과 버퍼(원본 캡처 자리)에 들어가게 한다(#14c).
 * - dispose(keepManaged): 앱 수명 렌더러면 로더 관리자 캐시에서 온 복제(fetchTexture, managed)는 남긴다 — GPU 텍스처가 source 에 남아 재진입 때 다시
 *   올리지 않는다(docs/engine/loader_manager.md §14.3). share(IblShare) = 렌더러 하나가 같이 쓰는 PMREM 생성기·IBL 큐브 캐시 — 있으면 IBL 을 무대마다 다시
 *   만들지 않고(HDR 읽기·PMREM 렌더·그 셰이더 컴파일 없음) dispose 때 버리지 않는다.
 */
import * as THREE from 'three';
import { HDRCubeTextureLoader } from 'three/examples/jsm/loaders/HDRCubeTextureLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadTexture } from './assetLoader';
import { applyGraph, type GraphDef, type GraphTex } from './graph';
import { initParams, patchSrt0 } from './params';
import type { StageGlobals } from './stage';
import type { AssetSource, Fres, MaterialContext } from './types';

export interface TexEntry {
  files: string[];
  srgb: boolean;
  cube: boolean;
  format?: string;
}

export interface IblSet {
  /** PMREM 으로 거른 반사 큐브 */
  rad: THREE.Texture;
  /** 확산 큐브(원본 irr 그대로) */
  irr: THREE.CubeTexture | null;
}

export interface MaterialOptions {
  gpu?: <T>(unit: () => T) => Promise<T>;
  surfaceMode?: 'full' | 'lightingOnlyApprox';
  lightingKey?: string;
  texture?: (path: string) => Promise<THREE.Texture>;
  hdrTexture?: (path: string) => Promise<THREE.Texture>;
  hdrCube?: (paths: string[]) => Promise<THREE.CubeTexture>;
}

export interface IblShare {
  pmrem: THREE.PMREMGenerator;
  cubes: Map<string, Promise<IblSet | null>>;
  resources?: Set<{ dispose(): void }>;
  dispose?(): void;
}

export function createIblShare(gl: THREE.WebGLRenderer): IblShare {
  const pmrem = new THREE.PMREMGenerator(gl);
  const cubes = new Map<string, Promise<IblSet | null>>();
  const resources = new Set<{ dispose(): void }>([pmrem]);
  return { pmrem, cubes, resources, dispose() {
    for (const resource of resources) resource.dispose();
    resources.clear(); cubes.clear();
  } };
}

type StdMat = THREE.MeshStandardMaterial;

export const CAPTURE_ORDER = 1000;

export const opt = (f: Fres, k: string): string | undefined => f.shader.options[`static_opt_${k}`];

export const drawnBeforeCapture = (f: Fres): boolean =>
  (opt(f, 'capture_color_buffer_type') ?? '0') !== '0' && opt(f, 'refraction_enable') !== '1' && ['2', '4'].includes(opt(f, 'state_type') ?? '0');

export function fresOf(m: THREE.Material): Fres | null {
  const f = (m.userData as { fres?: Fres }).fres;
  return f && f.shader && f.shader.options ? f : null;
}

export function slotTexture(f: Fres, slot: string): string | null {
  return f.samplers?.find((s) => s.slots.includes(slot))?.texture ?? null;
}

const LIGHTS_MAPS_IBL = /#if defined\( USE_ENVMAP \) && defined\( STANDARD \) && defined\( ENVMAP_TYPE_CUBE_UV \)\s*iblIrradiance \+= getIBLIrradiance\( geometryNormal \);\s*#endif/;

/** three lights_fragment_maps 의 PMREM 확산을 원본 irr 큐브(또는 없음)로 바꾼 것 */
const LIGHTS_MAPS_IRR = (() => {
  const src = THREE.ShaderChunk.lights_fragment_maps;
  if (!LIGHTS_MAPS_IBL.test(src)) throw new Error('three lights_fragment_maps 형식이 바뀌었다(stage3d material.ts)');
  return src.replace(
    LIGHTS_MAPS_IBL,
    `#ifdef MPJ_IRR
		{
			vec3 mpjN = inverseTransformDirection( geometryNormal, viewMatrix );
			iblIrradiance += PI * textureCube( mpjIrrMap, vec3( - mpjN.x, mpjN.yz ) ).rgb;
		}
	#endif`,
  );
})();

const DIR_HEAD = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';

/** three lights_fragment_begin 에서 평행광 블록만 뺀 것(NUM_DIR_LIGHTS 는 three 가 글자 그대로 숫자로 바꾸므로 #define 으로 덮을 수 없다) */
const LIGHTS_BEGIN_NO_DIRECT = (() => {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  if (!src.includes(DIR_HEAD)) throw new Error('three lights_fragment_begin 형식이 바뀌었다(stage3d material.ts)');
  return src.replace(DIR_HEAD, '#if 0');
})();

const LIGHTS_BEGIN_SDW = (() => {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const i = src.indexOf(DIR_HEAD);
  const j = src.indexOf('RE_Direct( directLight', i);
  if (i < 0 || j < 0) throw new Error('three lights_fragment_begin 형식이 바뀌었다(stage3d material.ts sdw)');
  return src.slice(0, j) + 'directLight.color *= mpjSdw;\n\t\t' + src.slice(j);
})();

const SSS_DIFFUSE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
if (!THREE.ShaderChunk.lights_physical_pars_fragment.includes(SSS_DIFFUSE)) throw new Error('three lights_physical_pars_fragment 형식이 바뀌었다(stage3d material.ts sss)');

/**
 * static_opt_shading_type 0 = 무조명 [판독 sg1: 구름 p421·모니터 p40 — 출력 = 기본색(그래프면 그래프 색)·발광, 조명 없음]
 */
export function patchUnlit(m: StdMat): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-unlit`;
}

/**
 * static_opt_shading_type 2 = SSS 확산 [판독 sg1: bush_atlas p366 — 직접 확산 = mix(N·L, sss_diffusion_map(u = Ns·L·0.5+0.5, v = |2·curv.x − 1|), curv.w),
 * Ns = normalize(mix(Nw, 정점 노멀, curv.w·sss_normal_blend))]. 그림자는 three 처럼 빛 색에 곱한다(원본 min(sh, ·)) [근사], 환경 확산을 Ns 로 읽는 것은 생략 [근사].
 */
export function patchSss(m: StdMat, curv: THREE.Texture, diff: THREE.Texture, blend: number): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  curv.colorSpace = THREE.NoColorSpace;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.mpjCurv = { value: curv };
    sh.uniforms.mpjDiff = { value: diff };
    sh.uniforms.mpjSssBlend = { value: blend };
    if (!sh.fragmentShader.includes('#include <lights_physical_pars_fragment>')) return;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D mpjCurv;\nuniform sampler2D mpjDiff;\nuniform float mpjSssBlend;\nvec4 mpjCv = vec4(0.0);\nvec3 mpjNs = vec3(0.0, 0.0, 1.0);')
      .replace(
        '#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          SSS_DIFFUSE,
          'float mpjNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tfloat mpjNsL = saturate( dot( mpjNs, directLight.direction ) );\n\tvec3 mpjD = texture2D( mpjDiff, vec2( mpjNsL * 0.5 + 0.5, abs( mpjCv.x * 2.0 - 1.0 ) ) ).rgb;\n\treflectedLight.directDiffuse += directLight.color * mix( vec3( mpjNL ), mpjD, mpjCv.w ) * BRDF_Lambert( material.diffuseColor );',
        ),
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_MAP\nmpjCv = texture2D( mpjCurv, vMapUv );\n#endif\nmpjNs = normalize( mix( normal, nonPerturbedNormal, mpjCv.w * mpjSssBlend ) );');
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-sss`;
}

/**
 * static_opt_refraction_enable 1 (굴절) — 원본 forward_plus p386(분수 물기둥 jet_fountain01) SASS [판독: analysis/mat/plaza/sass/menu00__forward_plus__p386.fs.txt 330~584]:
 * 장면 색 버퍼(capture_color_buffer, Layer 핸들 0x570)를 화면 좌표 + 굴절 오프셋으로 읽는다. 오프셋 = refract((0,0,−1), 뷰 공간 N, ior) 의 xy × refraction_uv_offset_scale
 * (전반사면 0, 332~372), 성분마다 ±refraction_uv_offset_limit 로 자름, 표본 LOD = roughness × Layer[0x4d0]. 불투명도 a = refraction_opacity ↔ rim_opacity 를 (1−N·V)^rim_power 로 섞음,
 * 출력 = 장면·(1 − a) + 확산·a + 반사(직접·IBL, a 를 곱하지 않음 — 끝부분 r16·r7 은 확산 쪽만, 반사 r0·r33 은 따로 더함) + 발광(c0.r·C0, 그 위 가산).
 * 웹: three 의 투과 패스(불투명 장면을 transmissionSamplerMap 에 그린 뒤 투과 재질을 그림 = 원본 색 버퍼 캡처와 같은 자리)를 쓰고, transmission_fragment 를 위 식으로 바꾼다.
 * LOD 는 three getTransmissionSample(거칠기·ior 로 밉 고름)로 [근사: Layer[0x4d0] 값 미확보], x 오프셋 배율 Layer[0x4a4] 는 1 [근사]. 원본 y 는 아래 방향 uv 라 −N_y, WebGL 은 위 방향이라 그대로.
 */
export function patchRefraction(m: THREE.MeshPhysicalMaterial, opacity: number, rimOpacity: number, rimPower: number, rim: boolean, ior: number, scale: number, limit: number): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.transparent = false;
  m.depthWrite = true;
  m.alphaTest = 0;
  if (m.side === THREE.DoubleSide) m.side = THREE.FrontSide;
  m.blending = THREE.NormalBlending;
  m.transmission = 1;
  m.thickness = 0;
  m.ior = Math.max(1, Math.min(2.333, ior));
  const f = (v: number): string => v.toFixed(6);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    const a = rim ? `mix( ${f(opacity)}, ${f(rimOpacity)}, pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), ${f(rimPower)} ) )` : f(opacity);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <transmission_fragment>',
      `#ifdef USE_TRANSMISSION
{
  float mpjA = ${a};
  vec3 mpjR = refract( vec3( 0.0, 0.0, - 1.0 ), normal, ${f(ior)} );
  vec2 mpjOff = clamp( mpjR.xy * ${f(scale)}, vec2( - ${f(limit)} ), vec2( ${f(limit)} ) );
  vec4 mpjClip = projectionMatrix * vec4( - vViewPosition, 1.0 );
  vec2 mpjUv = mpjClip.xy / mpjClip.w * 0.5 + 0.5 + mpjOff;
  vec3 mpjScene = getTransmissionSample( mpjUv, material.roughness, ${f(m.ior)} ).rgb;
  totalDiffuse = mpjScene * ( 1.0 - mpjA ) + totalDiffuse * mpjA;
}
#endif`,
    );
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-refr:${opacity}:${rimOpacity}:${rimPower}:${rim}:${ior}:${scale}:${limit}`;
}

/** 표준 재질 → 물리 재질(투과 버퍼를 쓰려고) — 표준 필드·userData 를 그대로 옮긴다 */
export function toPhysical(m: StdMat): THREE.MeshPhysicalMaterial {
  const p = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(p, m);
  p.userData = m.userData;
  p.name = m.name;
  return p;
}

/** static_opt_mul_vertex_base_color 1: 기본색(rgba)에 정점색 _c{index} 를 곱한다 [데이터: 옵션 이름·forward_plus 표준 경로, 판독 sg2 lambert1 "base_color·mul_base_color·c0.rgb, α = c0.a·mul_opacity"] */
export function patchVertexColor(m: StdMat, index: number): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  const a = `_c${index}`;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
${sh.vertexShader.includes(`attribute vec4 ${a};`) ? '' : `attribute vec4 ${a};`}
varying vec4 vMpjVc;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vMpjVc = ${a};`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vMpjVc;`).replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor *= vMpjVc;`);
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-vc${index}`;
}

/**
 * static_opt_water_enable 1(물 합성) [근사]: 원본은 수면 색과 물속 장면(read_under_water)을 water_opacity 로 섞고, 물속은 깊이/water_muddy_range 만큼
 * water_muddy_color 로 탁해진다 [데이터: 재질 옵션·파라미터 이름, 판독 sg1 "물 합성(수중 장면·muddy·water_opacity)·표준"].
 * 웹은 물 깊이를 모르므로 탁함 k 를 상수로 둔다: muddy_range ≥ 10(바다 12)이면 1, 아니면 1/muddy_range(분수 3·무대 물 5).
 * out = op·수면 + (1 − op)·k·muddy, 뒤 장면 비침 = (1 − op)(1 − k) 로 미리 곱한 알파 블렌드.
 */
export function patchWater(m: StdMat, opacity: number, muddy: [number, number, number], k: number): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  const through = (1 - opacity) * (1 - k);
  if (through > 1e-3) {
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
  const f = (v: number): string => v.toFixed(6);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `outgoingLight = outgoingLight * ${f(opacity)} + vec3(${f(muddy[0])}, ${f(muddy[1])}, ${f(muddy[2])}) * ${f((1 - opacity) * k)};\ndiffuseColor.a = ${f(1 - through)};\n#include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-water:${opacity}:${k}`;
}

export class MaterialSetup {
  private readonly textures = new Map<string, Promise<THREE.Texture | null>>();
  private readonly cubes: Map<string, Promise<IblSet | null>>;
  private readonly prepared = new WeakSet<THREE.Material>();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly owned: THREE.Texture[] = [];
  private readonly managed = new WeakSet<THREE.Texture>();
  /** PMREM 결과 렌더 타깃 — 텍스처만 풀면 프레임버퍼가 남는다 */
  private readonly targets: THREE.WebGLRenderTarget[] = [];
  common: IblSet | null = null;
  globals: StageGlobals | null = null;
  /** 판독한 셰이더 그래프 식(재질 이름 → 모델별 식 목록), manifest.graphs */
  graphs: Record<string, GraphDef[]> = {};
  readonly graphStats = { applied: [] as string[], missing: [] as string[] };
  chara: IblSet | null = null;
  readonly stats = { textures: 0, bytes: 0 };
  /** 로더 관리자 끼움점(무대 상대 경로 'tex/<파일>' → 이 무대 전용 텍스처). 없으면 공용 로더로 바로 읽는다 */
  fetchTexture: ((path: string) => Promise<THREE.Texture>) | null = null;

  constructor(
    private readonly assets: AssetSource,
    gl: THREE.WebGLRenderer,
    protected readonly index: Record<string, TexEntry>,
    private readonly share?: IblShare,
    private readonly options: MaterialOptions = {},
  ) {
    this.pmrem = share?.pmrem ?? new THREE.PMREMGenerator(gl);
    this.cubes = share?.cubes ?? new Map();
    this.fetchTexture = options.texture ?? null;
  }

  async loadIbl(common: [string, string], chara: [string, string] | null): Promise<void> {
    const [c, h] = await Promise.all([this.ibl(common[0], common[1]), chara ? this.ibl(chara[0], chara[1]) : Promise.resolve(null)]);
    this.common = c;
    this.chara = this.options.surfaceMode === 'lightingOnlyApprox' ? h : h ?? c;
  }

  private cubeFiles(name: string): string[] | null {
    const e = this.index[name];
    return e && e.cube && e.files.length === 6 ? e.files : null;
  }

  private ibl(rad: string, irr: string | null): Promise<IblSet | null> {
    const key = `${rad}|${irr ?? ''}`;
    let p = this.cubes.get(key);
    if (!p) {
      p = (async () => {
        const radFiles = this.cubeFiles(rad);
        if (!radFiles) return null;
        const load = (files: string[]): Promise<THREE.CubeTexture> => this.options.hdrCube
          ? this.options.hdrCube(files.map((f) => `tex/${f}`))
          : new HDRCubeTextureLoader().loadAsync(files.map((f) => this.assets.url(`tex/${f}`)));
        const cube = await load(radFiles);
        let target: THREE.WebGLRenderTarget;
        try { target = this.options.gpu ? await this.options.gpu(() => this.pmrem.fromCubemap(cube)) : this.pmrem.fromCubemap(cube); }
        finally { cube.dispose(); }
        if (!this.share) this.targets.push(target);
        else this.share.resources?.add(target);
        let irrCube: THREE.CubeTexture | null = null;
        const irrFiles = irr ? this.cubeFiles(irr) : null;
        if (irrFiles) {
          irrCube = await load(irrFiles);
          if (!this.share) this.owned.push(irrCube);
          else this.share.resources?.add(irrCube);
        }
        return { rad: target.texture, irr: irrCube };
      })().catch((e) => {
        this.cubes.delete(key);
        console.warn(`stage3d IBL 큐브를 읽지 못했다: ${rad}`, e);
        return null;
      });
      this.cubes.set(key, p);
    }
    return p;
  }

  /** 2D 텍스처(라이트맵·셰이더 그래프 입력). glTF 와 같이 UV 원점 = 이미지 왼쪽 위(flipY false) */
  texture(name: string): Promise<THREE.Texture | null> {
    let p = this.textures.get(name);
    if (!p) {
      p = (async () => {
        const e = this.index[name];
        if (!e || e.cube || !e.files.length) return null;
        const url = this.assets.url(`tex/${e.files[0]}`);
        const t = e.files[0].endsWith('.hdr') ? await (this.options.hdrTexture ? this.options.hdrTexture(`tex/${e.files[0]}`) : new HDRLoader().loadAsync(url)) : this.fetchTexture ? await this.fetchTexture(`tex/${e.files[0]}`) : await loadTexture(url);
        if (this.fetchTexture && !e.files[0].endsWith('.hdr')) this.managed.add(t);
        t.flipY = false;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (!e.files[0].endsWith('.hdr') && e.srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        this.owned.push(t);
        this.stats.textures++;
        return t;
      })().catch((e) => {
        console.warn(`stage3d 텍스처를 읽지 못했다: ${name}`, e);
        return null;
      });
      this.textures.set(name, p);
    }
    return p;
  }

  async graphTexture(name: string): Promise<GraphTex | null> {
    const e = this.index[name];
    const tex = await this.texture(name);
    return tex ? { tex, snorm: /SNORM/.test(e?.format ?? '') } : null;
  }

  /** 국소 반사 큐브(재질 슬롯 local_specular_texturecube) */
  localRad(name: string): Promise<THREE.Texture | null> {
    return this.ibl(name, null).then((s) => s?.rad ?? null);
  }

  context(sun: THREE.DirectionalLight): MaterialContext {
    return {
      texture: (n) => this.texture(n),
      localRad: (n) => this.localRad(n),
      ibl: { rad: this.common?.rad ?? null, irr: this.common?.irr ?? null },
      sun,
    };
  }

  /** root 아래 메시 재질을 원본 옵션대로 설정한다. 이미 한 재질은 건너뛰고, 메시 그림자 표시는 매번 맞춘다 */
  async prepare(root: THREE.Object3D, modelName?: string): Promise<void> {
    const jobs: Promise<void>[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let mi = 0; mi < mats.length; mi++) {
        let m = mats[mi];
        const f = fresOf(m);
        if (!f) continue;
        if (this.options.surfaceMode !== 'lightingOnlyApprox' && opt(f, 'refraction_enable') === '1' && (m as StdMat).isMeshStandardMaterial && !(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial && !this.prepared.has(m)) {
          m = toPhysical(m as StdMat);
          if (Array.isArray(mesh.material)) mesh.material[mi] = m;
          else mesh.material = m;
        }
        mesh.castShadow = Number(f.renderInfo?.render_info_draw_shadowmap?.[0] ?? 0) >= 1;
        mesh.receiveShadow = opt(f, 'receive_shadow') === '1';
        if (this.options.surfaceMode !== 'lightingOnlyApprox' && drawnBeforeCapture(f)) mesh.renderOrder = CAPTURE_ORDER;
        if (this.prepared.has(m) || !(m as StdMat).isMeshStandardMaterial) continue;
        this.prepared.add(m);
        if (this.options.surfaceMode === 'lightingOnlyApprox') {
          jobs.push(this.setup(m as StdMat, f));
          continue;
        }
        const mp = initParams(m, f);
        if (opt(f, 'texture_srt0') === '1') patchSrt0(m as StdMat, mp);
        let activeGraph: GraphDef | undefined;
        if (opt(f, 'shader_graph') === '1') {
          const cands = this.graphs[f.name ?? m.name] ?? [];
          const def = cands.find((d) => modelName !== undefined && d.models.includes(modelName)) ?? cands[0];
          activeGraph = def;
          const list = def ? this.graphStats.applied : this.graphStats.missing;
          if (!list.includes(f.name ?? m.name)) list.push(f.name ?? m.name);
          if (def && this.globals) jobs.push(applyGraph(m as StdMat, def, f, mp, this.globals, (n) => this.graphTexture(n)));
        }
        jobs.push(this.setup(m as StdMat, f, activeGraph));
      }
    });
    await Promise.all(jobs);
  }

  private async setup(m: StdMat, f: Fres, graph?: GraphDef): Promise<void> {
    const p = f.params ?? {};
    if (opt(f, 'mul_base_color') === '1') {
      const v = p.material_mul_base_color?.value as number[] | undefined;
      if (v) m.color.multiply(new THREE.Color(v[0], v[1], v[2]));
    }
    const noDirect = opt(f, 'directional_lighting_enable') === '0';
    const gi = opt(f, 'gi_diffuse_texture') === '1';
    const giHasIbl = gi && opt(f, 'gi_diffuse_texture_contains_ibl') === '1';
    const ambient = opt(f, 'ambient_lighting_enable') !== '0';
    const chara = opt(f, 'diffuse_ibl_type') === '1';
    const irr = ambient && !giHasIbl ? ((chara ? this.chara : this.common)?.irr ?? null) : null;
    const uv = Number(opt(f, 'bake_texture_uv_index') ?? 0);
    if (gi) {
      const name = slotTexture(f, 'gi_diffuse_texture2d');
      const t = name ? await this.texture(name) : null;
      if (t) {
        t.channel = uv;
        m.lightMap = t;
        const scale = opt(f, 'gi_diffuse_texture_scale_enable') === '1' ? ((p.material_gi_diffuse_texture_scale?.value as number) ?? 1) : 1;
        m.lightMapIntensity = Math.PI * scale;
      }
    }
    let sdw: THREE.Texture | null = null;
    const sdwName = slotTexture(f, 'shadow_texture2d');
    if (this.options.surfaceMode !== 'lightingOnlyApprox' && sdwName && !noDirect) {
      sdw = await this.texture(sdwName);
      if (sdw) {
        sdw.colorSpace = THREE.NoColorSpace;
        sdw.channel = uv;
      }
    }
    const spec = opt(f, 'specular_ibl_type');
    if (spec === '1' && this.chara) m.envMap = this.chara.rad;
    else if (spec === '2') {
      const name = slotTexture(f, 'local_specular_texturecube');
      const t = name ? await this.localRad(name) : null;
      if (t) {
        m.envMap = t;
        if (this.options.surfaceMode !== 'lightingOnlyApprox' && opt(f, 'specular_ibl_normalization_enable') === '1') m.envMapIntensity = (name && (this.index[name] as TexEntry & { specNorm?: number })?.specNorm) || 1;
      }
    }
    this.patch(m, noDirect, irr, sdw, uv);
    if (this.options.surfaceMode === 'lightingOnlyApprox') {
      m.needsUpdate = true;
      return;
    }
    if (opt(f, 'mul_vertex_base_color') === '1' && opt(f, 'shader_graph') !== '1') patchVertexColor(m, Number(opt(f, 'mul_vertex_base_color_index') ?? 0));
    m.fog = opt(f, 'fog') === '1';
    this.blend(m, opt(f, 'state_type'), f);
    if (opt(f, 'water_enable') === '1' && opt(f, 'state_type') !== '2' && opt(f, 'refraction_enable') !== '1' && !(graph?.program?.startsWith('graph:') && opt(f, 'read_under_water') === '0')) {
      const range = (p.material_water_muddy_range?.value as number | undefined) ?? 1;
      const muddy = opt(f, 'water_muddy_enable') === '1' ? ((p.material_water_muddy_color?.value as [number, number, number] | undefined) ?? [0, 0, 0]) : ([0, 0, 0] as [number, number, number]);
      const k = opt(f, 'water_muddy_enable') === '1' ? Math.min(1, range >= 10 ? 1 : 1 / Math.max(range, 1)) : 0;
      patchWater(m, (p.material_water_opacity?.value as number | undefined) ?? 1, muddy, k);
    }
    if (opt(f, 'refraction_enable') === '1' && (m as unknown as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial)
      patchRefraction(
        m as unknown as THREE.MeshPhysicalMaterial,
        (p.material_refraction_opacity?.value as number) ?? 0,
        (p.material_refraction_rim_opacity?.value as number) ?? 1,
        (p.material_refraction_rim_power?.value as number) ?? 1,
        opt(f, 'refraction_rim') === '1',
        (p.material_refraction_ior?.value as number) ?? 1.333,
        (p.material_refraction_uv_offset_scale?.value as number) ?? 0.03,
        (p.material_refraction_uv_offset_limit?.value as number) ?? 0.03,
      );
    const shading = opt(f, 'shading_type');
    if (shading === '0') patchUnlit(m);
    else if (shading === '2') {
      const cv = slotTexture(f, 'sss_curvature_texture2d');
      const df = slotTexture(f, 'sss_diffusion_map_texture2d');
      const [ct, dt] = await Promise.all([cv ? this.texture(cv) : null, df ? this.texture(df) : null]);
      if (ct && dt) patchSss(m, ct, dt, ((p.material_sss_normal_blend?.value as number) ?? 1) as number);
    }
    m.needsUpdate = true;
  }

  /** static_opt_state_type: 1 반투명(glb BLEND 그대로), 2 더하기, 4 곱하기 [추정: 판독 sg2 — 광장 lighttube 2·stamp dot/shadow 4] */
  private blend(m: StdMat, state: string | undefined, f: Fres): void {
    if (state === '2') {
      m.transparent = true;
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
    } else if (state === '4') {
      m.transparent = true;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.ZeroFactor;
      m.blendDst = THREE.SrcColorFactor;
      m.depthWrite = false;
    }
    if (drawnBeforeCapture(f)) {
      m.transparent = false;
      m.depthWrite = false;
    }
  }

  /** 셰이더 패치(평행광 끔·확산 IBL 교체). 다른 담당이 건 onBeforeCompile 은 먼저 부른 뒤 이어서 고친다 */
  private patch(m: StdMat, noDirect: boolean, irr: THREE.CubeTexture | null, sdw: THREE.Texture | null, uv: number): void {
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey;
    const key = `${this.options.lightingKey ?? 'mpj-stage3d-light'}:${noDirect ? 1 : 0}:${irr ? 1 : 0}${this.options.surfaceMode === 'lightingOnlyApprox' ? '' : `:${sdw ? uv + 1 : 0}`}`;
    const uvName = 'vMpjSdwUv';
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      if (irr) sh.uniforms.mpjIrrMap = { value: irr };
      if (sdw) {
        sh.uniforms.mpjSdwMap = { value: sdw };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>\nvarying vec2 ${uvName};\n${uv === 1 ? '#ifndef USE_UV1\nattribute vec2 uv1;\n#endif' : ''}`)
          .replace('#include <uv_vertex>', `#include <uv_vertex>\n${uvName} = ${uv === 1 ? 'uv1' : 'uv'};`);
      }
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n${irr ? '#define MPJ_IRR\nuniform samplerCube mpjIrrMap;' : ''}${sdw ? `\nuniform sampler2D mpjSdwMap;\nvarying vec2 ${uvName};` : ''}`,
        )
        .replace('#include <lights_fragment_maps>', LIGHTS_MAPS_IRR);
      if (noDirect) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', LIGHTS_BEGIN_NO_DIRECT);
      else if (sdw) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', `float mpjSdw = texture2D( mpjSdwMap, ${uvName} ).r;\n${LIGHTS_BEGIN_SDW}`);
    };
    m.customProgramCacheKey = () => `${prevKey.call(m)}|${key}`;
  }

  dispose(keepManaged = false): void {
    for (const t of this.owned) if (!keepManaged || !this.managed.has(t)) t.dispose();
    for (const t of this.targets) t.dispose();
    if (!this.share) this.pmrem.dispose();
  }
}
