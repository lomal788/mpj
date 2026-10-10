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
import type * as THREE from 'three';
import { hdrCube, hdrTexture } from '@app/common/assets/hdr';
import { MaterialSetup as CommonMaterialSetup, type TexEntry } from '@app/common/render3d/material';
import type { Assets } from '../../../../view/assets';

export class MaterialSetup extends CommonMaterialSetup {
  constructor(private readonly source: Assets, gl: THREE.WebGLRenderer) {
    super(source, gl, {}, undefined, {
      surfaceMode: 'lightingOnlyApprox',
      lightingKey: 'mpj-mg1801-light',
      texture: (path) => source.texture(path),
      hdrTexture: (path) => hdrTexture(source, path),
      hdrCube: (paths) => hdrCube(source, paths),
    });
  }

  /** model/textures.json(tools/mg1801_web_models.py)과 env 큐브 4개 */
  async load(): Promise<void> {
    Object.assign(this.index, await this.source.json<Record<string, TexEntry>>('model/textures.json'));
    await this.loadIbl(['mg1801_bg00_rad', 'mg1801_bg00_irr'], ['mg1801_cha_rad', 'mg1801_cha_irr']);
  }
}
