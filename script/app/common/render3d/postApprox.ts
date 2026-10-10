/**
 * 기존 mg1801에서 이전한 공용 선택 근사 — 원본 post00 엔티티 `env/mg1801_post.fmdb`(→ 채널 0,6 에서 `post_result00`)의 container/posteffect 재질 값
 * [데이터: extracted/converted/graphics/mg1801/meta/mg1801_post*.dump.json, 07_camera_lighting.md 7.5].
 *
 * 순서: 장면(HalfFloat HDR 타깃 + 깊이) → DOF → 블룸 → 톤맵·sRGB(OutputPass) → FXAA → 화면.
 * 원본 판독은 07_camera_lighting.md에 있으며, 아래는 식 변경 없이 보존한 기존 웹 근사다.
 * - 톤맵: 원본 tonemap_type 1(기존 웹은 다른 곡선으로 근사). three NeutralToneMapping(Khronos PBR Neutral)을 쓴다 — 0.76 아래는 거의 그대로 두고
 *   1 넘는 HDR 만 눌러서, 톤맵 없이 맞춰 온 기존 화면과 가장 덜 달라지는 쪽을 골랐다 [근사: 선택]. exposure·offset·output scale
 *   (1, 0, 1)은 노출 = exposure·2^offset·scale 로 곱한다 [추정: 식].
 * - 블룸: 추출 = 입력을 clip(100 → 결과 1000)으로 자르고 휘도가 threshold 1 을 넘는 만큼만 남긴다(색 비율 유지) [추정: 뜻].
 *   intensity 1 = 블룸 총 이득으로 보고 UnrealBloomPass strength = intensity / (밉 5단 가중치 합)으로 맞춘다 [추정].
 *   spread 1 → radius 0.5(three 범위 0..1 의 가운데) [근사: 대응 미확정]. 원본 다운/업 샘플 텐트 필터와 다르다.
 * - DOF: 원본 dof2(앞/뒤 분리 보케). near_transition 0 이라 앞쪽은 흐리지 않는다. 뒤쪽 흐림 비율
 *   = clamp((깊이 − (focal_distance + focal_region)) / far_transition, 0, 1) [추정: 07 7.5 해석], 깊이 = 카메라 시선축 거리.
 *   최대 흐림 반지름(far_bokeh 1 의 화면 크기)은 미확정이라 화면 높이 1080 기준 6 px 로 둔다 [근사]. 원판(디스크) 32 샘플.
 * - FXAA: 원본 edge_threshold 0.166 / _min 0.0833 / sub_pixel 0.75(FXAA 3.11 Quality 기본값) →
 *   three FXAAShader 의 _RelativeThreshold / _ContrastThreshold / _SubpixelBlending 에 그대로 넣는다(알고리즘은 three 판).
 * - utility_parameter0 (0.4,1,1,1 → 1,1,1,1)·motion blur·color grading 은 뜻 미확정 또는 꺼짐이라 쓰지 않는다.
 * - MSAA 는 쓰지 않는다(원본도 FXAA 만).
 */
import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { PostParams } from './post';

/** UnrealBloomPass 밉별 가중치(그 파일 bloomFactors) */
const BLOOM_FACTORS = [1.0, 0.8, 0.6, 0.4, 0.2];
/** spread 1 ↔ UnrealBloomPass radius [근사] */
const BLOOM_RADIUS_PER_SPREAD = 0.5;
/** 뒤쪽 최대 흐림 반지름(px, 화면 높이 1080 기준) [근사] */
const DOF_MAX_RADIUS_1080 = 6;
const DOF_SAMPLES = 32;

const DOF_SHADER = {
  uniforms: {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 10000 },
    focalStart: { value: 17 },
    focalEnd: { value: 42 },
    nearTransition: { value: 0 },
    farTransition: { value: 7 },
    texel: { value: new THREE.Vector2() },
    maxRadius: { value: 6 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float focalStart;
uniform float focalEnd;
uniform float nearTransition;
uniform float farTransition;
uniform vec2 texel;
uniform float maxRadius;
varying vec2 vUv;
#define SAMPLES ${DOF_SAMPLES}
float distAt(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
}
float cocAt(float d) {
  float far = farTransition > 0.0 ? clamp((d - focalEnd) / farTransition, 0.0, 1.0) : step(focalEnd, d);
  float near = nearTransition > 0.0 ? clamp((focalStart - d) / nearTransition, 0.0, 1.0) : 0.0;
  return max(far, near);
}
void main() {
  vec4 base = texture2D(tColor, vUv);
  float coc = cocAt(distAt(vUv));
  if (coc <= 0.0) { gl_FragColor = base; return; }
  vec3 acc = base.rgb;
  float wsum = 1.0;
  float r = coc * maxRadius;
  for (int i = 0; i < SAMPLES; i++) {
    float fi = float(i) + 0.5;
    float rr = sqrt(fi / float(SAMPLES)) * r;
    float a = fi * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * texel;
    float w = cocAt(distAt(uv));
    acc += texture2D(tColor, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(mix(base.rgb, acc / wsum, coc), base.a);
}`,
};

export class DofApprox {
  readonly material = new THREE.ShaderMaterial({ ...DOF_SHADER, uniforms: THREE.UniformsUtils.clone(DOF_SHADER.uniforms), depthTest: false, depthWrite: false });

  configure(p: PostParams): void {
    const u = this.material.uniforms;
    u.focalStart.value = p.dofFocalDistance ?? 17;
    u.focalEnd.value = (p.dofFocalDistance ?? 17) + (p.dofFocalRegion ?? 25);
    u.nearTransition.value = p.dofNearTransition ?? 0;
    u.farTransition.value = p.dofFarTransition ?? 7;
  }

  resize(w: number, h: number): void {
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
    this.material.uniforms.maxRadius.value = (DOF_MAX_RADIUS_1080 * h) / 1080;
  }

  input(target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera): void {
    const u = this.material.uniforms;
    u.tColor.value = target.texture;
    u.tDepth.value = target.depthTexture;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
  }

  dispose(): void { this.material.dispose(); }
}

export class NeutralBloomApprox {
  readonly bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1, 0, 1);
  private readonly output = new OutputPass();

  constructor() {
    const hp = this.bloom.materialHighPassFilter;
    hp.uniforms.bloomClip = { value: 100 };
    hp.fragmentShader = hp.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform float bloomClip;')
      .replace(/void main\(\) \{[\s\S]*\}\s*$/, `void main() {
  vec4 texel = min( texture2D( tDiffuse, vUv ), vec4( bloomClip ) );
  float v = luminance( texel.rgb );
  gl_FragColor = vec4( texel.rgb * ( max( v - luminosityThreshold, 0.0 ) / max( v, 1e-4 ) ), 1.0 );
}`);
    if (!hp.fragmentShader.includes('bloomClip ) );')) throw new Error('three LuminosityHighPassShader 형식이 바뀌었다(mg1801 post.ts)');
  }

  configure(gl: THREE.WebGLRenderer, p: PostParams): void {
    gl.toneMappingExposure = p.exposure * 2 ** p.exposureOffset * p.outputScale;
    this.bloom.threshold = p.bloomThreshold;
    this.bloom.radius = p.bloomSpread * BLOOM_RADIUS_PER_SPREAD;
    const gain = BLOOM_FACTORS.reduce((a, f) => a + (f + (1.2 - f - f) * this.bloom.radius), 0);
    this.bloom.strength = p.bloomIntensity / gain;
    this.bloom.materialHighPassFilter.uniforms.bloomClip.value = p.bloomClip;
  }

  compileMaterials(gl: THREE.WebGLRenderer): { mid: THREE.Material[]; output: THREE.Material } {
    this.output.material.defines = { NEUTRAL_TONE_MAPPING: '' };
    if (THREE.ColorManagement.getTransfer(gl.outputColorSpace) === THREE.SRGBTransfer) this.output.material.defines.SRGB_TRANSFER = '';
    this.output.material.needsUpdate = true;
    return { mid: [this.bloom.materialHighPassFilter, ...this.bloom.separableBlurMaterials, this.bloom.compositeMaterial, this.bloom.blendMaterial], output: this.output.material };
  }

  resize(w: number, h: number): void {
    this.bloom.setSize(w, h);
    this.output.setSize(w, h);
  }

  render(gl: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget, target: THREE.WebGLRenderTarget | null, bloom: boolean): void {
    if (bloom) this.bloom.render(gl, src, src, 0, false);
    this.output.renderToScreen = target === null;
    this.output.render(gl, target as THREE.WebGLRenderTarget, src, 0, false);
  }

  dispose(): void {
    this.bloom.materialHighPassFilter.dispose();
    this.bloom.dispose();
    this.output.dispose();
  }
}
