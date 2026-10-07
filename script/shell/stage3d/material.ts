/**
 * 공용 무대 재질 조명 설정 — mg1801 view/material.ts 를 셸 경계(mgm_common.md §9.1)에 맞게 복사·이식한 것.
 * glb 재질 extras.fres(원본 forward_plus 재질의 옵션·renderInfo·파라미터·샘플러 원값, 03_graphics.md 7.3)를 읽어
 * 원본이 켜는 조명 기능만 three 재질에 옮긴다. 식은 three 표준 BRDF 근사다.
 *
 * mg1801 과 같은 규칙: 그림자 플래그, 평행광 끔(directional_lighting_enable 0), 라이트맵 gi_diffuse_texture2d(UV = bake_texture_uv_index,
 * 세기 π × gi_diffuse_texture_scale), AO 는 변환기가 넣은 occlusionTexture, IBL 확산 = irr 큐브 직접(ibl_type 1 = cha), 반사 = rad PMREM,
 * gi_diffuse_texture_contains_ibl 이면 확산 IBL 생략, mul_base_color.
 * 바꾼 것:
 * - 텍스처 색인은 무대 manifest.textures(tools/analysis/mgmet_world_assets.py).
 * - 셰이더 그래프(static_opt_shader_graph 1) 재질 [근사]: 그래프 식은 읽지 않고 glb 알베도·라이트맵만 쓴다(docs/shell/mgmet_3d.md §2·§8).
 * - 라이트맵 그림자(shadow_texture2d, sdw) [근사]: 원본은 정적 그림자 마스크로 평행광을 가린다고 보고 [추정: 슬롯 이름],
 *   평행광 직접광에 sdw 텍스처의 R 을 곱한다(UV = bake_texture_uv_index).
 * - punchthrough(render_state_display_face·alpha test): 변환기가 glb alphaMode MASK·doubleSided 로 넣은 값을 그대로 쓴다.
 */
import * as THREE from 'three';
import { HDRCubeTextureLoader } from 'three/examples/jsm/loaders/HDRCubeTextureLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
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
  rad: THREE.Texture;
  irr: THREE.CubeTexture | null;
}

type StdMat = THREE.MeshStandardMaterial;

export const opt = (f: Fres, k: string): string | undefined => f.shader.options[`static_opt_${k}`];

export function fresOf(m: THREE.Material): Fres | null {
  const f = (m.userData as { fres?: Fres }).fres;
  return f && f.shader && f.shader.options ? f : null;
}

export function slotTexture(f: Fres, slot: string): string | null {
  return f.samplers?.find((s) => s.slots.includes(slot))?.texture ?? null;
}

const LIGHTS_MAPS_IBL = /#if defined\( USE_ENVMAP \) && defined\( STANDARD \) && defined\( ENVMAP_TYPE_CUBE_UV \)\s*iblIrradiance \+= getIBLIrradiance\( geometryNormal \);\s*#endif/;

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
 * static_opt_refraction_enable 1 (굴절) [근사]: 원본은 뒤 장면색을 굴절(uv 오프셋 0.03)해 읽고, 불투명도 = refraction_opacity, refraction_rim 이면 가장자리에서
 * rim_opacity·(1−N·V)^rim_power 쪽으로 섞어 표면색과 합성한다 [판독 sg1: jet_fountain01 p386 "표준 굴절(opacity·rim) 합성, 그 위에 emissive 가산" + 재질 값].
 * 웹은 굴절 왜곡을 빼고 뒤 장면을 그대로 비치게 한다: 확산 × α + 반사·발광(가산), 미리 곱한 알파 블렌드.
 */
export function patchRefraction(m: StdMat, opacity: number, rimOpacity: number, rimPower: number, rim: boolean): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.transparent = true;
  m.depthWrite = false;
  m.alphaTest = 0;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    const a = rim
      ? `mix( ${opacity.toFixed(5)}, ${rimOpacity.toFixed(5)}, pow( 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ), ${rimPower.toFixed(5)} ) )`
      : opacity.toFixed(5);
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{ float mpjA = ${a}; outgoingLight = totalDiffuse * mpjA + totalSpecular + totalEmissiveRadiance; diffuseColor.a = mpjA; }\n#include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `${prevKey.call(m)}|mpj-refr:${opacity}:${rimOpacity}:${rimPower}:${rim}`;
}

export class MaterialSetup {
  private readonly textures = new Map<string, Promise<THREE.Texture | null>>();
  private readonly cubes = new Map<string, Promise<IblSet | null>>();
  private readonly prepared = new WeakSet<THREE.Material>();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly owned: THREE.Texture[] = [];
  private readonly targets: THREE.WebGLRenderTarget[] = [];
  common: IblSet | null = null;
  globals: StageGlobals | null = null;
  /** 판독한 셰이더 그래프 식(재질 이름 → 모델별 식 목록), manifest.graphs */
  graphs: Record<string, GraphDef[]> = {};
  readonly graphStats = { applied: [] as string[], missing: [] as string[] };
  chara: IblSet | null = null;
  readonly stats = { textures: 0, bytes: 0 };

  constructor(
    private readonly assets: AssetSource,
    gl: THREE.WebGLRenderer,
    private readonly index: Record<string, TexEntry>,
  ) {
    this.pmrem = new THREE.PMREMGenerator(gl);
  }

  async loadIbl(common: [string, string], chara: [string, string] | null): Promise<void> {
    const [c, h] = await Promise.all([this.ibl(common[0], common[1]), chara ? this.ibl(chara[0], chara[1]) : Promise.resolve(null)]);
    this.common = c;
    this.chara = h ?? c;
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
        const loader = new HDRCubeTextureLoader();
        const cube = await loader.loadAsync(radFiles.map((f) => this.assets.url(`tex/${f}`)));
        const target = this.pmrem.fromCubemap(cube);
        cube.dispose();
        this.targets.push(target);
        let irrCube: THREE.CubeTexture | null = null;
        const irrFiles = irr ? this.cubeFiles(irr) : null;
        if (irrFiles) {
          irrCube = await loader.loadAsync(irrFiles.map((f) => this.assets.url(`tex/${f}`)));
          this.owned.push(irrCube);
        }
        return { rad: target.texture, irr: irrCube };
      })().catch((e) => {
        console.warn(`stage3d IBL 큐브를 읽지 못했다: ${rad}`, e);
        return null;
      });
      this.cubes.set(key, p);
    }
    return p;
  }

  texture(name: string): Promise<THREE.Texture | null> {
    let p = this.textures.get(name);
    if (!p) {
      p = (async () => {
        const e = this.index[name];
        if (!e || e.cube || !e.files.length) return null;
        const url = this.assets.url(`tex/${e.files[0]}`);
        const t = e.files[0].endsWith('.hdr') ? await new HDRLoader().loadAsync(url) : await new THREE.TextureLoader().loadAsync(url);
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

  async prepare(root: THREE.Object3D, modelName?: string): Promise<void> {
    const jobs: Promise<void>[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const f = fresOf(m);
        if (!f) continue;
        mesh.castShadow = Number(f.renderInfo?.render_info_draw_shadowmap?.[0] ?? 0) >= 1;
        mesh.receiveShadow = opt(f, 'receive_shadow') === '1';
        if (this.prepared.has(m) || !(m as StdMat).isMeshStandardMaterial) continue;
        this.prepared.add(m);
        const mp = initParams(m, f);
        if (opt(f, 'shader_graph') !== '1' && opt(f, 'texture_srt0') === '1') patchSrt0(m as StdMat, mp);
        if (opt(f, 'shader_graph') === '1') {
          const cands = this.graphs[f.name ?? m.name] ?? [];
          const def = cands.find((d) => modelName !== undefined && d.models.includes(modelName)) ?? cands[0];
          const list = def ? this.graphStats.applied : this.graphStats.missing;
          if (!list.includes(f.name ?? m.name)) list.push(f.name ?? m.name);
          if (def && this.globals) jobs.push(applyGraph(m as StdMat, def, f, mp, this.globals, (n) => this.graphTexture(n)));
        }
        jobs.push(this.setup(m as StdMat, f));
      }
    });
    await Promise.all(jobs);
  }

  private async setup(m: StdMat, f: Fres): Promise<void> {
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
    if (sdwName && !noDirect) {
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
      if (t) m.envMap = t;
    }
    this.patch(m, noDirect, irr, sdw, uv);
    this.blend(m, opt(f, 'state_type'));
    if (opt(f, 'refraction_enable') === '1')
      patchRefraction(
        m,
        (p.material_refraction_opacity?.value as number) ?? 0,
        (p.material_refraction_rim_opacity?.value as number) ?? 1,
        (p.material_refraction_rim_power?.value as number) ?? 1,
        opt(f, 'refraction_rim') === '1',
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
  private blend(m: StdMat, state: string | undefined): void {
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
  }

  private patch(m: StdMat, noDirect: boolean, irr: THREE.CubeTexture | null, sdw: THREE.Texture | null, uv: number): void {
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey;
    const key = `mpj-stage3d-light:${noDirect ? 1 : 0}:${irr ? 1 : 0}:${sdw ? uv + 1 : 0}`;
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

  dispose(): void {
    for (const t of this.owned) t.dispose();
    for (const t of this.targets) t.dispose();
    this.pmrem.dispose();
  }
}
