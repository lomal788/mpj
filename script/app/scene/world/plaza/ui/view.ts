/**
 * 광장 2D UI 그리기 — 무대 렌더러에 3D(후처리 포함) 다음 패스로 그린다(문맥 하나, docs/engine/loader_manager.md §14.4).
 * 레이아웃 그리기는 charselect Render2D 그대로, 명세 합치기는 mgmcommon loadMgmSpec·splitVc 그대로.
 * MgmView 와 다른 점: 바탕을 지우지 않고(투명) 선형 합성 버퍼를 알파째 sRGB 로 내보낸다 [설계]. 내보낸 값(프리멀티 sRGB, 8비트)을
 * 화면에 프리멀티 over(ONE, ONE_MINUS_SRC_ALPHA)로 얹는다 = 전의 투명 캔버스(premultipliedAlpha)를 브라우저가 무대 캔버스 위에 합성하던 식.
 * create(gl) 의 gl = 무대 렌더러(새 렌더러·캔버스를 만들지 않고 dispose 때 버리지도 않음). end() 는 무대 render(후처리 끝 = 화면) 뒤에 부르고
 * 렌더러의 autoClear·지우기 색·렌더 타깃을 되돌린다.
 */
import * as THREE from 'three';
import { Render2D } from '@app/scene/menu/charselect/render2d';
import { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import type { Spec } from '@app/scene/menu/charselect/types';
import { IDENTITY, loadMgmSpec, splitVc, type Mat3, type MgmDrawHost, type MgmSpec } from '../../../../../shell/mgmcommon';

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class PlazaUiView implements MgmDrawHost {
  readonly all: Spec;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly ldr: THREE.WebGLRenderTarget;
  private readonly outScene = new THREE.Scene();
  private readonly compScene = new THREE.Scene();
  private readonly outCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly clear = new THREE.Color();

  private constructor(
    readonly spec: MgmSpec,
    readonly gl: THREE.WebGLRenderer,
    readonly r2d: Render2D,
    readonly url: (p: string) => string,
  ) {
    this.all = spec as unknown as Spec;
    this.target = new THREE.WebGLRenderTarget(spec.screen[0], spec.screen[1], { type: THREE.HalfFloatType, samples: 4 });
    this.ldr = new THREE.WebGLRenderTarget(spec.screen[0], spec.screen[1], { depthBuffer: false });
    this.ldr.texture.generateMipmaps = false;
    this.ldr.texture.minFilter = this.ldr.texture.magFilter = THREE.LinearFilter;
    const out = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { src: { value: this.target.texture } },
        vertexShader: QUAD_VS,
        fragmentShader:
          'uniform sampler2D src; varying vec2 vUv; void main() { vec4 p = texture2D(src, vUv); float a = clamp(p.a, 0.0, 1.0); vec3 c = a > 0.0 ? clamp(p.rgb / a, 0.0, 1.0) : vec3(0.0); vec3 s = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); gl_FragColor = vec4(s * a, a); }',
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    );
    out.frustumCulled = false;
    this.outScene.add(out);
    const comp = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { src: { value: this.ldr.texture } },
        vertexShader: QUAD_VS,
        fragmentShader: 'uniform sampler2D src; varying vec2 vUv; void main() { gl_FragColor = texture2D(src, vUv); }',
        depthTest: false,
        depthWrite: false,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    comp.frustumCulled = false;
    this.compScene.add(comp);
  }

  static async create(gl: THREE.WebGLRenderer, url: (p: string) => string, parts: readonly string[]): Promise<PlazaUiView> {
    const spec = await loadMgmSpec(url, parts);
    const r2d = new Render2D(spec as unknown as Spec);
    await r2d.load(url);
    return new PlazaUiView(spec, gl, r2d, url);
  }

  layout(name: string): LayoutInst {
    const ls = this.spec.layouts[name];
    if (!ls) throw new Error(`plaza ui: 레이아웃 없음 ${name}`);
    return new LayoutInst(name, ls, this.all);
  }

  begin(): void {
    this.r2d.begin();
  }

  draw(inst: LayoutInst, base: Mat3 = IDENTITY, alpha = 255): void {
    if (!inst.visible) return;
    splitVc(this.spec, inst);
    this.r2d.draw(inst, base, alpha);
  }

  end(): void {
    const gl = this.gl;
    const prev = gl.getRenderTarget();
    const auto = gl.autoClear;
    gl.getClearColor(this.clear);
    const alpha = gl.getClearAlpha();
    gl.autoClear = false;
    try {
      gl.setClearColor(0x000000, 0);
      gl.setRenderTarget(this.target);
      gl.clear();
      gl.render(this.r2d.scene, this.r2d.camera);
      gl.setRenderTarget(this.ldr);
      gl.clear();
      gl.render(this.outScene, this.outCam);
      gl.setRenderTarget(null);
      gl.render(this.compScene, this.outCam);
    } finally {
      gl.setRenderTarget(prev);
      gl.setClearColor(this.clear, alpha);
      gl.autoClear = auto;
    }
  }

  dispose(): void {
    this.target.dispose();
    this.ldr.dispose();
    for (const sc of [this.outScene, this.compScene])
      for (const o of sc.children) {
        const m = o as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    this.r2d.dispose();
  }
}
