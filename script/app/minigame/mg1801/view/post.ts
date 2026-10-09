/**
 * mg1801 포스트 — 원본 post00 엔티티 `env/mg1801_post.fmdb`(→ 채널 0,6 에서 `post_result00`)의 container/posteffect 재질 값
 * [데이터: extracted/converted/graphics/mg1801/meta/mg1801_post*.dump.json, 07_camera_lighting.md 7.5].
 *
 * 순서: 장면(HalfFloat HDR 타깃 + 깊이) → DOF → 블룸 → 톤맵·sRGB(OutputPass) → FXAA → 화면.
 * 원본 셰이더(posteffect_amalgam0.bnsh 등)는 Maxwell 바이너리뿐이라 처리 순서·곡선은 [미확정]이고 아래는 근사다.
 * - 톤맵: 원본 tonemap_type 1(곡선 미확정). three NeutralToneMapping(Khronos PBR Neutral)을 쓴다 — 0.76 아래는 거의 그대로 두고
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
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { PostRenderer } from '../../../../view/renderer';

export type PostPreset = 'post' | 'post_result00';

interface PostParams {
  exposure: number;
  exposureOffset: number;
  outputScale: number;
  bloom: boolean;
  bloomThreshold: number;
  bloomIntensity: number;
  bloomSpread: number;
  bloomClip: number;
  dof: boolean;
  dofFocalDistance: number;
  dofFocalRegion: number;
  dofNearTransition: number;
  dofFarTransition: number;
  fxaa: boolean;
  fxaaEdgeThreshold: number;
  fxaaEdgeThresholdMin: number;
  fxaaSubPixel: number;
}

const BASE: PostParams = {
  exposure: 1,
  exposureOffset: 0,
  outputScale: 1,
  bloom: true,
  bloomThreshold: 1,
  bloomIntensity: 1,
  bloomSpread: 1,
  bloomClip: 100,
  dof: true,
  dofFocalDistance: 17,
  dofFocalRegion: 25,
  dofNearTransition: 0,
  dofFarTransition: 7,
  fxaa: true,
  fxaaEdgeThreshold: 0.166,
  fxaaEdgeThresholdMin: 0.0833,
  fxaaSubPixel: 0.75,
};

/** posteffect_* 재질 값 [데이터] */
export const POST_PRESETS: Record<PostPreset, PostParams> = {
  post: BASE,
  post_result00: { ...BASE, bloomClip: 1000, dofFocalDistance: 20, dofFocalRegion: 30, dofFarTransition: 15 },
};

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

function patchFxaa(src: string, p: PostParams): string {
  if (!/float _ContrastThreshold = [0-9.]+;/.test(src)) throw new Error('three FXAAShader 형식이 바뀌었다(mg1801 post.ts)');
  return src
    .replace(/float _ContrastThreshold = [0-9.]+;/, `float _ContrastThreshold = ${p.fxaaEdgeThresholdMin.toFixed(4)};`)
    .replace(/float _RelativeThreshold = [0-9.]+;/, `float _RelativeThreshold = ${p.fxaaEdgeThreshold.toFixed(4)};`)
    .replace(/float _SubpixelBlending = [0-9.]+;/, `float _SubpixelBlending = ${p.fxaaSubPixel.toFixed(4)};`);
}

export class PostChain implements PostRenderer {
  private params: PostParams = POST_PRESETS.post;
  private readonly size = new THREE.Vector2(-1, -1);
  private readonly hdr: THREE.WebGLRenderTarget;
  private readonly tmp: THREE.WebGLRenderTarget;
  private readonly ldr: THREE.WebGLRenderTarget;
  private readonly dofQuad: FullScreenQuad;
  private readonly dofMat: THREE.ShaderMaterial;
  private readonly bloom: UnrealBloomPass;
  private readonly output = new OutputPass();
  private readonly fxaaQuad: FullScreenQuad;
  private readonly fxaaMat: THREE.ShaderMaterial;
  private readonly saved: { toneMapping: THREE.ToneMapping; exposure: number };

  constructor(private readonly gl: THREE.WebGLRenderer) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 };
    this.hdr = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1) });
    this.tmp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.ldr = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.dofMat = new THREE.ShaderMaterial({ ...DOF_SHADER, uniforms: THREE.UniformsUtils.clone(DOF_SHADER.uniforms), depthTest: false, depthWrite: false });
    this.dofQuad = new FullScreenQuad(this.dofMat);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1, 0, 1);
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
    this.fxaaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: patchFxaa(FXAAShader.fragmentShader, this.params),
      depthTest: false,
      depthWrite: false,
    });
    this.fxaaQuad = new FullScreenQuad(this.fxaaMat);
    this.saved = { toneMapping: gl.toneMapping, exposure: gl.toneMappingExposure };
    gl.toneMapping = THREE.NeutralToneMapping;
    this.setPreset('post');
  }

  /** 원본 MapImpl::ReceiveState(0,6): post00 엔티티를 지우고 post_result00 을 새로 만든다 */
  setPreset(name: PostPreset): void {
    const p = POST_PRESETS[name];
    this.params = p;
    this.gl.toneMappingExposure = p.exposure * 2 ** p.exposureOffset * p.outputScale;
    this.bloom.threshold = p.bloomThreshold;
    this.bloom.radius = p.bloomSpread * BLOOM_RADIUS_PER_SPREAD;
    const gain = BLOOM_FACTORS.reduce((a, f) => a + (f + (1.2 - f - f) * this.bloom.radius), 0);
    this.bloom.strength = p.bloomIntensity / gain;
    this.bloom.materialHighPassFilter.uniforms.bloomClip.value = p.bloomClip;
    const u = this.dofMat.uniforms;
    u.focalStart.value = p.dofFocalDistance;
    u.focalEnd.value = p.dofFocalDistance + p.dofFocalRegion;
    u.nearTransition.value = p.dofNearTransition;
    u.farTransition.value = p.dofFarTransition;
    const fs = patchFxaa(FXAAShader.fragmentShader, p);
    if (fs !== this.fxaaMat.fragmentShader) {
      this.fxaaMat.fragmentShader = fs;
      this.fxaaMat.needsUpdate = true;
    }
  }

  private resize(): void {
    const s = this.gl.getDrawingBufferSize(new THREE.Vector2());
    if (s.equals(this.size)) return;
    this.size.copy(s);
    this.hdr.setSize(s.x, s.y);
    this.tmp.setSize(s.x, s.y);
    this.ldr.setSize(s.x, s.y);
    this.bloom.setSize(s.x, s.y);
    this.output.setSize(s.x, s.y);
    this.dofMat.uniforms.texel.value.set(1 / s.x, 1 / s.y);
    this.dofMat.uniforms.maxRadius.value = (DOF_MAX_RADIUS_1080 * s.y) / 1080;
    this.fxaaMat.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const gl = this.gl;
    const p = this.params;
    this.resize();
    gl.setRenderTarget(this.hdr);
    gl.render(scene, camera);
    let src = this.hdr;
    if (p.dof && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const u = this.dofMat.uniforms;
      u.tColor.value = this.hdr.texture;
      u.tDepth.value = this.hdr.depthTexture;
      u.cameraNear.value = cam.near;
      u.cameraFar.value = cam.far;
      gl.setRenderTarget(this.tmp);
      this.dofQuad.render(gl);
      src = this.tmp;
    }
    if (p.bloom) this.bloom.render(gl, src, src, 0, false);
    if (p.fxaa) {
      this.output.renderToScreen = false;
      this.output.render(gl, this.ldr, src, 0, false);
      this.fxaaMat.uniforms.tDiffuse.value = this.ldr.texture;
      gl.setRenderTarget(null);
      this.fxaaQuad.render(gl);
    } else {
      this.output.renderToScreen = true;
      this.output.render(gl, null as unknown as THREE.WebGLRenderTarget, src, 0, false);
    }
  }

  dispose(): void {
    this.gl.toneMapping = this.saved.toneMapping;
    this.gl.toneMappingExposure = this.saved.exposure;
    this.hdr.depthTexture?.dispose();
    this.hdr.dispose();
    this.tmp.dispose();
    this.ldr.dispose();
    this.dofMat.dispose();
    this.dofQuad.dispose();
    this.bloom.dispose();
    this.output.dispose();
    this.fxaaMat.dispose();
    this.fxaaQuad.dispose();
  }
}
