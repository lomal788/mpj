/**
 * 수프 수면 mg1801_water00 재질 mt_water00 — 원본은 셰이더 그래프 재질(static_opt_shader_graph 1, 그래프 해시만 있고 식 없음)이라
 * glb 근사(기본색 0·금속 0.9)로 그리면 검게 나온다. 원본 재질 값·텍스처·재질 애니만 써서 다시 짠 근사 셰이더다.
 *
 * 원본 값 [데이터: glb extras.fres, anim/mg1801_water00.fmab]:
 * - 샘플러: sg_utility_texture2d0 = mg1801_wave00_nml(_a0), 1 = mg1801_water_00_flo(_a1, R8G8 SNORM), 2 = mg1801_water01_alb(_a2),
 *   3 = mg1801_wave01_alb(_a4, BC4), local_specular_texturecube = mg1801_water00_rad(_a3).
 * - static_opt_water_enable·water_muddy_enable 1, material_water_muddy_color (1, 0.336, 0.022), muddy_range 5, water_opacity 0.2,
 *   material_roughness 0.4, texture_srt0·srt1 사용(srt0 은 단위값).
 * - fmab(3600프레임, 루프 아님): texture_srt1 이동 x = 0 → 1(1200프레임, 이후 1.0039 고정),
 *   utility_parameter0 x = 1.2 고정, y = 0 → 1(300프레임, 이후 1). 재생 시각 = 장면 시작(MapImpl::Initialize) 기준 프레임 [추정].
 *
 * 그래프 식은 모르므로 아래 대응은 모두 [추정]:
 * - 법선 = wave00_nml 두 겹(srt0 그대로 + srt1 이동)을 더해 정규화, 세기 = utility_parameter0.y(처음 5초 동안 0 → 1).
 * - 기본색 = muddy_color 와 water01_alb 를 그 알파로 섞는다(냄비가 muddy_range 5 보다 깊어(바닥 y −8.7, 수면 y −0.7) 물속은 탁한 색만 보인다고 봄).
 *   water_opacity·굴절·평면 반사(read_planar_reflection)·수중 읽기는 넣지 않고 불투명으로 그린다.
 * - 금속도 0(그래프가 기본색 0·금속 0.9 를 덮는다고 봄), 거칠기 0.4, 반사 = 국소 큐브 water00_rad(material.ts 가 붙인다).
 * - 흐름 텍스처(water_00_flo, 거의 균일한 (0.68, 0.93))·wave01_alb(BC4 얼룩)·utility_parameter0.x(1.2)는 쓰임을 몰라 쓰지 않는다.
 */
import * as THREE from 'three';
import type { Assets } from '../../../../view/assets';
import type { MaterialSetup } from '@app/common/render3d/material';

interface FmabJson {
  materialAnims: { frames: number; loop: boolean; materials: Record<string, { params: Record<string, Record<string, number | number[]>> }> }[];
}

function track(v: number | number[] | undefined, fallback: number): (frame: number) => number {
  if (v === undefined) return () => fallback;
  if (typeof v === 'number') return () => v;
  return (frame) => v[Math.min(Math.max(Math.floor(frame), 0), v.length - 1)];
}

export class Water {
  private srt1X: (f: number) => number = () => 0;
  private param0Y: (f: number) => number = () => 1;
  private readonly uniforms = {
    mpjSrt1: { value: new THREE.Vector2() },
    mpjWaveStrength: { value: 1 },
    mpjMuddy: { value: new THREE.Color(1, 0.33633623, 0.022227114) },
  };

  /** water00 메시들의 재질을 근사 재질로 바꾼다 */
  async setup(root: THREE.Object3D, assets: Assets, mats: MaterialSetup): Promise<void> {
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'mt_water00') meshes.push(m);
    });
    if (!meshes.length) return;
    const src = meshes[0].material as THREE.MeshStandardMaterial;
    const fres = (src.userData as { fres?: { params?: Record<string, { value: unknown }> } }).fres;
    const muddy = fres?.params?.material_water_muddy_color?.value as number[] | undefined;
    if (muddy) this.uniforms.mpjMuddy.value.setRGB(muddy[0], muddy[1], muddy[2]);
    const [nml, alb, fmab] = await Promise.all([
      mats.texture('mg1801_wave00_nml'),
      mats.texture('mg1801_water01_alb'),
      assets.json<FmabJson>('model/mg1801_water00.fmab.json').catch(() => null),
    ]);
    const p = fmab?.materialAnims[0]?.materials.mt_water00?.params;
    if (p) {
      this.srt1X = track(p.material_texture_srt1?.['0x10'], 0);
      this.param0Y = track(p.material_utility_parameter0?.['0x04'], 1);
    }
    const m = new THREE.MeshStandardMaterial({
      name: 'mt_water00',
      color: 0xffffff,
      roughness: (fres?.params?.material_roughness?.value as number) ?? 0.4,
      metalness: 0,
    });
    m.userData = src.userData;
    if (nml) {
      nml.colorSpace = THREE.NoColorSpace;
      m.normalMap = nml;
    }
    if (alb) m.map = alb;
    m.customProgramCacheKey = () => 'mpj-mg1801-water';
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec2 mpjSrt1;\nuniform float mpjWaveStrength;\nuniform vec3 mpjMuddy;')
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
  {
    vec4 w = texture2D( map, vMapUv );
    diffuseColor.rgb = mix( mpjMuddy, w.rgb, w.a );
  }
#else
  diffuseColor.rgb = mpjMuddy;
#endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#ifdef USE_NORMALMAP
  {
    vec3 n0 = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
    vec3 n1 = texture2D( normalMap, vNormalMapUv + mpjSrt1 ).xyz * 2.0 - 1.0;
    vec3 mapN = normalize( vec3( ( n0.xy + n1.xy ) * mpjWaveStrength, max( n0.z * n1.z, 1e-3 ) ) );
    normal = normalize( tbn * mapN );
  }
#endif`,
        );
    };
    src.dispose();
    for (const mesh of meshes) mesh.material = m;
    await mats.prepare(root);
  }

  /** 프레임(1/60 초, 장면 시작 기준)으로 재질 애니 값을 맞춘다 */
  update(frame: number): void {
    this.uniforms.mpjSrt1.value.set(this.srt1X(frame), 0);
    this.uniforms.mpjWaveStrength.value = this.param0Y(frame);
  }
}
