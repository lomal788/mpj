/**
 * mg1801 재질 조명 설정 — glb 재질 extras.fres(원본 forward_plus 재질의 옵션·renderInfo·파라미터·샘플러 원값, 03_graphics.md 7.3)를 읽어
 * 원본이 켜는 조명 기능만 three 재질에 옮긴다. 원본 셰이더(forward_plus.bfsha)는 바이너리뿐이라 식은 three 표준 BRDF 근사다.
 *
 * 옮기는 것(값은 재질 데이터 그대로):
 * - 그림자: renderInfo render_info_draw_shadowmap ≥ 1 → castShadow, static_opt_receive_shadow = 1 → receiveShadow.
 *   draw_shadowmap 2(화분·뒤집개)도 그림자를 낸다고 본다 [추정: 2 = 정적 그림자맵].
 * - 평행광: static_opt_directional_lighting_enable = 0 이면 그 재질만 평행광을 받지 않는다(셰이더에서 평행광 수를 0 으로).
 * - 라이트맵: static_opt_gi_diffuse_texture = 1 → 슬롯 gi_diffuse_texture2d 텍스처(BC6H .hdr / BC7 sRGB png)를 lightMap 으로,
 *   UV 는 static_opt_bake_texture_uv_index(1 = TEXCOORD_1). 세기 = π × material_gi_diffuse_texture_scale(scale_enable 일 때만).
 *   AO(global_ao_texture2d)는 변환기가 이미 glb occlusionTexture(TEXCOORD_1)로 넣었다.
 * - IBL(env 컨테이너 mg1801_env 의 큐브 4개, 07_camera_lighting.md 7.4):
 *   확산 = static_opt_diffuse_ibl_type 1 이면 cha_irr, 아니면 bg00_irr 큐브를 법선으로 직접 읽는다(PMREM 에서 다시 적분하지 않는다).
 *   반사 = static_opt_specular_ibl_type 0 → bg00_rad(scene.environment), 1 → cha_rad, 2 → 재질 슬롯 local_specular_texturecube 큐브.
 *   타입 번호 ↔ 큐브 대응은 [추정]: 캐릭터 body_m 만 1/1, 국소 큐브 샘플러가 있는 재질(물·오븐·접시)만 반사 2 [데이터].
 *   static_opt_gi_diffuse_texture_contains_ibl = 1 이면 라이트맵에 IBL 확산이 들어 있다고 보고 확산 IBL 을 더하지 않는다 [추정: 옵션 이름].
 * - 기본색 곱: static_opt_mul_base_color = 1 이면 color × material_mul_base_color(램프 10·외곽선 1.8 등).
 *
 * 단위 [근사]: 원본은 "흰 램버트 면을 정면으로 비출 때 밝기 = 빛 색"인 게임 엔진 관례로 보고, three 의 물리 단위(밝기 = E/π)에
 * 맞추려 평행광 세기·라이트맵·irr 큐브에 π 를 곱한다. irr 큐브(최대 0.90)는 이미 코사인 적분된 값이라 그대로 알베도에 곱힌다.
 * 큐브 면 순서 [px,nx,py,ny,pz,nz] 는 [추정](03_graphics.md 8절).
 */
import * as THREE from 'three';
import { HDRCubeTextureLoader } from 'three/examples/jsm/loaders/HDRCubeTextureLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { loadTexture } from '@app/common/render3d/assetLoader';
import type { Assets } from '../../../../view/assets';

interface TexEntry {
  files: string[];
  srgb: boolean;
  cube: boolean;
}

interface Fres {
  shader: { options: Record<string, string>; samplerAssign?: Record<string, string> };
  renderInfo?: Record<string, number[]>;
  params?: Record<string, { value: unknown }>;
  samplers?: { sampler: string; texture: string; slots: string[] }[];
}

interface IblSet {
  /** PMREM 으로 거른 반사 큐브 */
  rad: THREE.Texture;
  /** 확산 큐브(원본 irr 그대로) */
  irr: THREE.CubeTexture | null;
}

type StdMat = THREE.MeshStandardMaterial;

const opt = (f: Fres, k: string): string | undefined => f.shader.options[`static_opt_${k}`];

function fresOf(m: THREE.Material): Fres | null {
  const f = (m.userData as { fres?: Fres }).fres;
  return f && f.shader && f.shader.options ? f : null;
}

function slotTexture(f: Fres, slot: string): string | null {
  return f.samplers?.find((s) => s.slots.includes(slot))?.texture ?? null;
}

const LIGHTS_MAPS_IBL = /#if defined\( USE_ENVMAP \) && defined\( STANDARD \) && defined\( ENVMAP_TYPE_CUBE_UV \)\s*iblIrradiance \+= getIBLIrradiance\( geometryNormal \);\s*#endif/;

/** three lights_fragment_maps 의 PMREM 확산을 원본 irr 큐브(또는 없음)로 바꾼 것 */
const LIGHTS_MAPS_IRR = (() => {
  const src = THREE.ShaderChunk.lights_fragment_maps;
  if (!LIGHTS_MAPS_IBL.test(src)) throw new Error('three lights_fragment_maps 형식이 바뀌었다(mg1801 material.ts)');
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

/** three lights_fragment_begin 에서 평행광 블록만 뺀 것(NUM_DIR_LIGHTS 는 three 가 글자 그대로 숫자로 바꾸므로 #define 으로 덮을 수 없다) */
const LIGHTS_BEGIN_NO_DIRECT = (() => {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const head = '#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )';
  if (!src.includes(head)) throw new Error('three lights_fragment_begin 형식이 바뀌었다(mg1801 material.ts)');
  return src.replace(head, '#if 0');
})();

export class MaterialSetup {
  private index: Record<string, TexEntry> = {};
  private readonly textures = new Map<string, Promise<THREE.Texture | null>>();
  private readonly cubes = new Map<string, Promise<IblSet | null>>();
  private readonly prepared = new WeakSet<THREE.Material>();
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly owned: THREE.Texture[] = [];
  /** PMREM 결과 렌더 타깃 — 텍스처만 풀면 프레임버퍼가 남는다 */
  private readonly targets: THREE.WebGLRenderTarget[] = [];
  common: IblSet | null = null;
  chara: IblSet | null = null;

  constructor(
    private readonly assets: Assets,
    gl: THREE.WebGLRenderer,
  ) {
    this.pmrem = new THREE.PMREMGenerator(gl);
  }

  /** model/textures.json(tools/mg1801_web_models.py)과 env 큐브 4개 */
  async load(): Promise<void> {
    this.index = await this.assets.json<Record<string, TexEntry>>('model/textures.json');
    const [common, chara] = await Promise.all([this.ibl('mg1801_bg00_rad', 'mg1801_bg00_irr'), this.ibl('mg1801_cha_rad', 'mg1801_cha_irr')]);
    this.common = common;
    this.chara = chara;
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
        console.warn(`mg1801 IBL 큐브를 읽지 못했다: ${rad}`, e);
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
        const t = e.files[0].endsWith('.hdr') ? await new HDRLoader().loadAsync(url) : await loadTexture(url);
        t.flipY = false;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (!e.files[0].endsWith('.hdr') && e.srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
        this.owned.push(t);
        return t;
      })().catch((e) => {
        console.warn(`mg1801 텍스처를 읽지 못했다: ${name}`, e);
        return null;
      });
      this.textures.set(name, p);
    }
    return p;
  }

  /** 국소 반사 큐브(재질 슬롯 local_specular_texturecube) */
  localRad(name: string): Promise<THREE.Texture | null> {
    return this.ibl(name, null).then((s) => s?.rad ?? null);
  }

  /** root 아래 메시 재질을 원본 옵션대로 설정한다. 이미 한 재질은 건너뛰고, 메시 그림자 표시는 매번 맞춘다 */
  async prepare(root: THREE.Object3D): Promise<void> {
    const jobs: Promise<void>[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const f = fresOf(m);
        if (!f) continue;
        mesh.castShadow = (f.renderInfo?.render_info_draw_shadowmap?.[0] ?? 0) >= 1;
        mesh.receiveShadow = opt(f, 'receive_shadow') === '1';
        if (this.prepared.has(m) || !(m as StdMat).isMeshStandardMaterial) continue;
        this.prepared.add(m);
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
    if (gi) {
      const name = slotTexture(f, 'gi_diffuse_texture2d');
      const t = name ? await this.texture(name) : null;
      if (t) {
        const uv = Number(opt(f, 'bake_texture_uv_index') ?? 0);
        t.channel = uv;
        m.lightMap = t;
        const scale = opt(f, 'gi_diffuse_texture_scale_enable') === '1' ? ((p.material_gi_diffuse_texture_scale?.value as number) ?? 1) : 1;
        m.lightMapIntensity = Math.PI * scale;
      }
    }
    const spec = opt(f, 'specular_ibl_type');
    if (spec === '1' && this.chara) m.envMap = this.chara.rad;
    else if (spec === '2') {
      const name = slotTexture(f, 'local_specular_texturecube');
      const t = name ? await this.localRad(name) : null;
      if (t) m.envMap = t;
    }
    this.patch(m, noDirect, irr);
    m.needsUpdate = true;
  }

  /** 셰이더 패치(평행광 끔·확산 IBL 교체). 다른 담당이 건 onBeforeCompile 은 먼저 부른 뒤 이어서 고친다 */
  private patch(m: StdMat, noDirect: boolean, irr: THREE.CubeTexture | null): void {
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey;
    const key = `mpj-mg1801-light:${noDirect ? 1 : 0}:${irr ? 1 : 0}`;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      if (irr) sh.uniforms.mpjIrrMap = { value: irr };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${irr ? '#define MPJ_IRR\nuniform samplerCube mpjIrrMap;' : ''}`)
        .replace('#include <lights_fragment_maps>', LIGHTS_MAPS_IRR);
      if (noDirect) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', LIGHTS_BEGIN_NO_DIRECT);
    };
    m.customProgramCacheKey = () => `${prevKey.call(m)}|${key}`;
  }

  dispose(): void {
    for (const t of this.owned) t.dispose();
    for (const t of this.targets) t.dispose();
    this.pmrem.dispose();
  }
}
