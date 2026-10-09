/**
 * 무대 포스트 — 원본 bex::gfx 포스트 패스(main FUN_71000acf00)와 셰이더(posteffect_amalgam0·bloom_*.bnsh SASS) 판독대로
 * [판독: analysis/mat/plaza_post.json, docs/shell/plaza_3d.md §6.13]. 값은 manifest.env.post(container/posteffect 재질 [데이터]).
 *
 * 순서: 장면(HalfFloat 선형 HDR) → 블룸(first_down → down ×(n−1) → up n−2..0) → 합성(장면 + 블룸·intensity → 노출 c·exposure + offset
 * → 톤맵 종류 → 비네트 → g = t^0.4545898 → 3D LUT 표본) → FXAA → 화면. 화면 값 = LUT 표본 바이트 [추정: 표시 단계 sRGB].
 * - 블룸 first_down(장면 절반 해상도): c = 장면·exposure, l = dot(c, (0.2125, 0.7153, 0.0721)), h = sat(l − threshold), w = h²(3 − 2h),
 *   y = c·w / spread⁵, 길이 ≤ clip. down: 13탭(0.125·5, 0.0625·4, 0.03125·4)·spread, 길이 ≤ clip. 밉 수 n = min(⌊log2(max(w/2, h/2))⌋, 5) + 1.
 *   up: out_k = cur_k + (low − cur_k)·a, a = 7/9(k = 0)·2/3(k ≥ 1), low = 밉 k+1 표본(k ≥ 2 대각 4탭 평균, k ≤ 1 한 탭).
 * - 톤맵 종류 0 = min(x,1), 1 = 유리식(mps 종류 5 와 같은 상수), 2 = ACES fitted, 3 = 유리식(광장), 4 = Khronos PBR Neutral [판독].
 * - LUT: 16³ 을 graphics_bntx 가 256×16 띠로 푼 것(가로 = 파랑 조각 16장, 조각 안 x = 빨강, y = 초록 [데이터]). 3D 표본(반 텍셀 보정 없음)을
 *   띠에서 똑같이 흉내 낸다(조각 안은 쌍선형, 파랑은 두 조각 섞기). LUT 바이트를 그대로 내보낸다.
 * - [근사] FXAA 를 원본은 합성 첫 단계(장면 HDR)에, 웹은 마지막(LDR)에 한다. first_down 의 두 번째 표본(샘플러 6, min(b + 0.5, a))은 같은 표본으로 본다.
 * - precompile(): 프로그램 미리 컴파일(docs/engine/loader_manager.md §14.5). 셰이더 키는 그리는 곳(RT = 선형·톤맵 없음 / 화면 = 출력 색공간)에 따라 달라서
 *   블룸·(FXAA 앞) 합성은 RT 를 걸고, 마지막 단계(FXAA 또는 합성)는 화면으로 compileAsync 한다. 렌더 타깃은 되돌린다.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export interface PostParams {
  tonemapType?: number;
  exposure: number;
  exposureOffset: number;
  outputScale: number;
  bloom: boolean;
  bloomThreshold: number;
  bloomIntensity: number;
  bloomSpread: number;
  bloomClip: number;
  fxaa: boolean;
  fxaaEdgeThreshold: number;
  fxaaEdgeThresholdMin: number;
  fxaaSubPixel: number;
  lut?: string | null;
  vignetteIntensity?: number;
  vignetteAspect?: number;
}

export interface PostRegion {
  target: THREE.WebGLRenderTarget | null;
  viewport: THREE.Vector4;
  scissor: THREE.Vector4;
}

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const CLIP = /* glsl */ `
vec3 clipLen(vec3 y, float clip) {
  float l = length(y);
  return l > clip ? y * (clip / l) : y;
}`;

const FIRST_FS = /* glsl */ `
uniform sampler2D src;
uniform float exposure, threshold, invSpread5, clip;
uniform vec4 region;
varying vec2 vUv;
${CLIP}
void main() {
  vec3 c = max(texture2D(src, clamp(vUv, region.xy, region.zw)).rgb, 0.0) * exposure;
  float l = dot(c, vec3(0.2125244, 0.715332, 0.07208252));
  float h = clamp(l - threshold, 0.0, 1.0);
  float w = h * h * (3.0 - 2.0 * h);
  gl_FragColor = vec4(clipLen(c * w * invSpread5, clip), 1.0);
}`;

const DOWN_FS = /* glsl */ `
uniform sampler2D src;
uniform vec2 texel;
uniform float spread, clip;
varying vec2 vUv;
${CLIP}
vec3 t(vec2 o) { return texture2D(src, vUv + o * texel).rgb; }
void main() {
  vec3 d = t(vec2(0.0)) * 0.125
    + (t(vec2(1.0, 1.0)) + t(vec2(-1.0, 1.0)) + t(vec2(1.0, -1.0)) + t(vec2(-1.0, -1.0))) * 0.125
    + (t(vec2(0.0, 2.0)) + t(vec2(0.0, -2.0)) + t(vec2(2.0, 0.0)) + t(vec2(-2.0, 0.0))) * 0.0625
    + (t(vec2(2.0, 2.0)) + t(vec2(-2.0, 2.0)) + t(vec2(2.0, -2.0)) + t(vec2(-2.0, -2.0))) * 0.03125;
  gl_FragColor = vec4(clipLen(d * spread, clip), 1.0);
}`;

const UP_FS = /* glsl */ `
uniform sampler2D cur, low;
uniform vec2 lowTexel;
uniform float a, tent;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(cur, vUv).rgb;
  vec3 l = tent > 0.5
    ? (texture2D(low, vUv + vec2(1.0, 1.0) * lowTexel).rgb + texture2D(low, vUv + vec2(-1.0, 1.0) * lowTexel).rgb
      + texture2D(low, vUv + vec2(1.0, -1.0) * lowTexel).rgb + texture2D(low, vUv + vec2(-1.0, -1.0) * lowTexel).rgb) * 0.25
    : texture2D(low, vUv).rgb;
  gl_FragColor = vec4(c + (l - c) * a, 1.0);
}`;

const COMPOSITE_FS = /* glsl */ `
uniform sampler2D scene, bloom, lut;
uniform float useBloom, intensity, exposure, exposureOffset, outputScale, vignette, vignetteAspect, useLut;
uniform vec4 vigRect;
varying vec2 vUv;
vec3 tonemap(vec3 x) {
#if TONEMAP == 0
  return min(max(x, 0.0) * outputScale, 1.0);
#elif TONEMAP == 1
  return max(x * (x * (x * (3.835061 * x - 0.7351529) + 0.1352372) + 0.03166371) / (x * (x * (x * (3.921293 * x - 1.517684) + 1.862026) - 0.395519) + 0.07032027), 0.0) * outputScale;
#elif TONEMAP == 2
  mat3 mi = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  mat3 mo = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  vec3 v = mi * x;
  vec3 r = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  return max(clamp(mo * r, 0.0, 1.0), 0.0) * outputScale;
#elif TONEMAP == 3
  return max(x * (x * (x * (3.775909 * x - 2.699740) + 1.373769) + 0.02414888) / (x * (x * (x * (3.776773 * x - 2.686816) + 1.188946) + 0.4051593) + 0.1080957), 0.0) * outputScale;
#else
  vec3 c = x;
  float m = min(c.r, min(c.g, c.b));
  float off = m < 0.08 ? m - 6.25 * m * m : 0.04;
  c -= off;
  float p = max(c.r, max(c.g, c.b));
  if (p >= 0.76) {
    float np = 1.0 - 0.0576 / (p - 0.52);
    c *= np / p;
    float g = 1.0 - 1.0 / (0.15 * (p - np) + 1.0);
    c = mix(c, vec3(np), g);
  }
  return max(c, 0.0) * outputScale;
#endif
}
vec3 lutSlice(vec3 g, float b) {
  vec2 rg = clamp(g.rg * 16.0, 0.5, 15.5);
  return texture2D(lut, vec2((b * 16.0 + rg.x) / 256.0, rg.y / 16.0)).rgb;
}
void main() {
  vec3 c = texture2D(scene, vUv).rgb;
  if (useBloom > 0.5) c += texture2D(bloom, vUv).rgb * intensity;
  vec3 x = c * exposure + exposureOffset;
  vec3 t = tonemap(x);
  vec2 ndc = (vUv - vigRect.xy) / vigRect.zw * 2.0 - 1.0;
  t *= 1.0 - vignette * length(vec2(ndc.x * vignetteAspect, ndc.y));
  vec3 g = pow(abs(t), vec3(0.4545898));
  if (useLut < 0.5) { gl_FragColor = vec4(g, 1.0); return; }
  float bp = clamp(g.b * 16.0 - 0.5, 0.0, 15.0);
  float b0 = floor(bp);
  float b1 = min(b0 + 1.0, 15.0);
  gl_FragColor = vec4(mix(lutSlice(g, b0), lutSlice(g, b1), bp - b0), 1.0);
}`;

function patchFxaa(src: string, p: PostParams): string {
  if (!/float _ContrastThreshold = [0-9.]+;/.test(src)) throw new Error('three FXAAShader 형식이 바뀌었다(stage3d post.ts)');
  return src
    .replace(/float _ContrastThreshold = [0-9.]+;/, `float _ContrastThreshold = ${p.fxaaEdgeThresholdMin.toFixed(5)};`)
    .replace(/float _RelativeThreshold = [0-9.]+;/, `float _RelativeThreshold = ${p.fxaaEdgeThreshold.toFixed(5)};`)
    .replace(/float _SubpixelBlending = [0-9.]+;/, `float _SubpixelBlending = ${p.fxaaSubPixel.toFixed(5)};`);
}

const mat = (fs: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, number> = {}): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines, depthTest: false, depthWrite: false });

const hdr = (w: number, h: number): THREE.WebGLRenderTarget => {
  const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
  t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
  t.texture.generateMipmaps = false;
  return t;
};

export class PostChain {
  private readonly size = new THREE.Vector2(-1, -1);
  private readonly scene: THREE.WebGLRenderTarget;
  private readonly ldr: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private readonly quad = new FullScreenQuad();
  private readonly first: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  private readonly comp: THREE.ShaderMaterial;
  private readonly fxaaMat: THREE.ShaderMaterial;
  readonly mips = { n: 0 };
  private out: THREE.WebGLRenderTarget | null = null;
  private inRegion = false;
  private readonly prevVp = new THREE.Vector4();
  private readonly prevSc = new THREE.Vector4();
  private readonly outVp = new THREE.Vector4();
  private readonly outSc = new THREE.Vector4();

  constructor(
    private readonly gl: THREE.WebGLRenderer,
    private readonly p: PostParams,
    lut: THREE.Texture | null,
  ) {
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    this.ldr = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.first = mat(FIRST_FS, { src: { value: null }, exposure: { value: p.exposure }, threshold: { value: p.bloomThreshold }, invSpread5: { value: 1 / p.bloomSpread ** 5 }, clip: { value: p.bloomClip }, region: { value: new THREE.Vector4(0, 0, 1, 1) } });
    this.downMat = mat(DOWN_FS, { src: { value: null }, texel: { value: new THREE.Vector2() }, spread: { value: p.bloomSpread }, clip: { value: p.bloomClip } });
    this.upMat = mat(UP_FS, { cur: { value: null }, low: { value: null }, lowTexel: { value: new THREE.Vector2() }, a: { value: 0 }, tent: { value: 0 } });
    this.comp = mat(
      COMPOSITE_FS,
      {
        scene: { value: null },
        bloom: { value: null },
        lut: { value: lut },
        useBloom: { value: p.bloom ? 1 : 0 },
        intensity: { value: p.bloomIntensity },
        exposure: { value: p.exposure },
        exposureOffset: { value: p.exposureOffset },
        outputScale: { value: p.outputScale },
        vignette: { value: p.vignetteIntensity ?? 0 },
        vignetteAspect: { value: p.vignetteAspect ?? 1 },
        useLut: { value: lut ? 1 : 0 },
        vigRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      },
      { TONEMAP: p.tonemapType ?? 3 },
    );
    this.fxaaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: patchFxaa(FXAAShader.fragmentShader, p),
      depthTest: false,
      depthWrite: false,
    });
    gl.toneMapping = THREE.NoToneMapping;
  }

  /** 시험 훅: 블룸·LUT 켜고 끄기(원본 값 대조용) */
  set(o: { bloom?: boolean; lut?: boolean }): void {
    if (o.bloom !== undefined) this.comp.uniforms.useBloom.value = o.bloom ? 1 : 0;
    if (o.lut !== undefined) this.comp.uniforms.useLut.value = o.lut && this.comp.uniforms.lut.value ? 1 : 0;
  }

  private resize(): void {
    const s = this.out ? new THREE.Vector2(this.out.width, this.out.height) : this.gl.getDrawingBufferSize(new THREE.Vector2());
    if (s.equals(this.size)) return;
    this.size.copy(s);
    this.scene.setSize(s.x, s.y);
    this.ldr.setSize(s.x, s.y);
    for (const t of [...this.down, ...this.up]) t.dispose();
    const w0 = Math.max(1, s.x >> 1);
    const h0 = Math.max(1, s.y >> 1);
    const n = Math.min(Math.floor(Math.log2(Math.max(w0, h0))), 5) + 1;
    this.mips.n = n;
    this.down = Array.from({ length: n }, (_, i) => hdr(Math.max(1, w0 >> i), Math.max(1, h0 >> i)));
    this.up = Array.from({ length: n }, (_, i) => hdr(Math.max(1, w0 >> i), Math.max(1, h0 >> i)));
    this.fxaaMat.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  }

  private pass(m: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = m;
    this.gl.setRenderTarget(target);
    this.quad.render(this.gl);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, region?: PostRegion): void {
    if (region && !this.inRegion) {
      this.renderRegion(scene, camera, region);
      return;
    }
    const gl = this.gl;
    this.resize();
    gl.setRenderTarget(this.scene);
    gl.render(scene, camera);
    const n = this.mips.n;
    if (this.p.bloom && n > 0) {
      this.first.uniforms.src.value = this.scene.texture;
      this.pass(this.first, this.down[0]);
      for (let i = 1; i < n; i++) {
        const src = this.down[i - 1];
        this.downMat.uniforms.src.value = src.texture;
        this.downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        this.pass(this.downMat, this.down[i]);
      }
      let low = this.down[n - 1];
      for (let k = n - 2; k >= 0; k--) {
        const u = this.upMat.uniforms;
        u.cur.value = this.down[k].texture;
        u.low.value = low.texture;
        u.lowTexel.value.set(1 / low.width, 1 / low.height);
        u.a.value = k === 0 ? 7 / 9 : 2 / 3;
        u.tent.value = k >= 2 ? 1 : 0;
        this.pass(this.upMat, this.up[k]);
        low = this.up[k];
      }
      this.comp.uniforms.bloom.value = n > 1 ? this.up[0].texture : this.down[0].texture;
    }
    this.comp.uniforms.scene.value = this.scene.texture;
    if (this.p.fxaa) {
      this.pass(this.comp, this.ldr);
      this.fxaaMat.uniforms.tDiffuse.value = this.ldr.texture;
      this.pass(this.fxaaMat, this.out);
    } else this.pass(this.comp, this.out);
  }

  private renderRegion(scene: THREE.Scene, camera: THREE.Camera, r: PostRegion): void {
    const gl = this.gl;
    const out = r.target;
    const sc = r.scissor;
    const prevTarget = gl.getRenderTarget();
    const prevAuto = gl.autoClear;
    const prevTest = gl.getScissorTest();
    gl.getViewport(this.prevVp);
    gl.getScissor(this.prevSc);
    let outTest = false;
    if (out) {
      this.outVp.copy(out.viewport);
      this.outSc.copy(out.scissor);
      outTest = out.scissorTest;
    }
    this.out = out;
    this.inRegion = true;
    try {
      this.resize();
      const W = this.size.x;
      const H = this.size.y;
      const s = this.scene;
      s.viewport.copy(r.viewport);
      s.scissor.copy(sc);
      s.scissorTest = true;
      this.first.uniforms.region.value.set((sc.x + 0.5) / W, (sc.y + 0.5) / H, (sc.x + sc.z - 0.5) / W, (sc.y + sc.w - 0.5) / H);
      this.comp.uniforms.vigRect.value.set(sc.x / W, sc.y / H, sc.z / W, sc.w / H);
      if (out) {
        out.viewport.set(0, 0, W, H);
        out.scissor.copy(sc);
        out.scissorTest = true;
      } else {
        gl.setRenderTarget(null);
        const pr = gl.getPixelRatio();
        gl.setViewport(0, 0, (W + 0.25) / pr, (H + 0.25) / pr);
        gl.setScissor((sc.x + 0.25) / pr, (sc.y + 0.25) / pr, (sc.z + 0.25) / pr, (sc.w + 0.25) / pr);
        gl.setScissorTest(true);
      }
      gl.autoClear = true;
      this.render(scene, camera);
    } finally {
      const s = this.scene;
      s.viewport.set(0, 0, this.size.x, this.size.y);
      s.scissor.set(0, 0, this.size.x, this.size.y);
      s.scissorTest = false;
      this.first.uniforms.region.value.set(0, 0, 1, 1);
      this.comp.uniforms.vigRect.value.set(0, 0, 1, 1);
      if (out) {
        out.viewport.copy(this.outVp);
        out.scissor.copy(this.outSc);
        out.scissorTest = outTest;
      }
      this.out = null;
      this.inRegion = false;
      gl.autoClear = prevAuto;
      gl.setRenderTarget(null);
      gl.setViewport(this.prevVp);
      gl.setScissor(this.prevSc);
      gl.setScissorTest(prevTest);
      gl.setRenderTarget(prevTarget);
    }
  }

  precompile(): Promise<unknown> {
    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const group = (ms: THREE.Material[]): THREE.Scene => {
      const s = new THREE.Scene();
      for (const m of ms) s.add(new THREE.Mesh(geo, m));
      return s;
    };
    const mid: THREE.Material[] = [this.first, this.downMat, this.upMat];
    if (this.p.fxaa) mid.push(this.comp);
    const jobs: Promise<unknown>[] = [];
    try {
      gl.setRenderTarget(this.ldr);
      jobs.push(gl.compileAsync(group(mid), cam));
      gl.setRenderTarget(null);
      jobs.push(gl.compileAsync(group([this.p.fxaa ? this.fxaaMat : this.comp]), cam));
    } finally {
      gl.setRenderTarget(prev);
    }
    return Promise.all(jobs).finally(() => geo.dispose());
  }

  dispose(): void {
    this.scene.dispose();
    this.ldr.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.first.dispose();
    this.downMat.dispose();
    this.upMat.dispose();
    this.comp.dispose();
    this.fxaaMat.dispose();
    this.quad.dispose();
  }
}
