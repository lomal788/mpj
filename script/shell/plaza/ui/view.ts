/**
 * 광장 2D UI 그리기 — 3D 캔버스 위 투명 WebGL 캔버스. 레이아웃 그리기는 charselect Render2D 그대로, 명세 합치기는 mgmcommon loadMgmSpec·splitVc 그대로.
 * MgmView 와 다른 점: 바탕을 지우지 않고(투명) 선형 합성 버퍼를 알파째 sRGB 로 내보낸다 [설계].
 */
import * as THREE from 'three';
import { Render2D } from '../../charselect/render2d';
import { LayoutInst } from '../../charselect/scene2d';
import type { Spec } from '../../charselect/types';
import { IDENTITY, loadMgmSpec, splitVc, type Mat3, type MgmDrawHost, type MgmSpec } from '../../mgmcommon';

export class PlazaUiView implements MgmDrawHost {
  readonly all: Spec;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly outScene = new THREE.Scene();
  private readonly outCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private constructor(
    readonly spec: MgmSpec,
    readonly gl: THREE.WebGLRenderer,
    readonly r2d: Render2D,
    readonly url: (p: string) => string,
  ) {
    this.all = spec as unknown as Spec;
    this.target = new THREE.WebGLRenderTarget(spec.screen[0], spec.screen[1], { type: THREE.HalfFloatType, samples: 4 });
    const out = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { src: { value: this.target.texture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader:
          'uniform sampler2D src; varying vec2 vUv; void main() { vec4 p = texture2D(src, vUv); float a = clamp(p.a, 0.0, 1.0); vec3 c = a > 0.0 ? clamp(p.rgb / a, 0.0, 1.0) : vec3(0.0); vec3 s = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); gl_FragColor = vec4(s * a, a); }',
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    );
    this.outScene.add(out);
  }

  static async create(canvas: HTMLCanvasElement, url: (p: string) => string, parts: readonly string[]): Promise<PlazaUiView> {
    const spec = await loadMgmSpec(url, parts);
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    gl.setPixelRatio(1);
    gl.setSize(spec.screen[0], spec.screen[1], false);
    gl.autoClear = false;
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
    gl.setRenderTarget(this.target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.r2d.scene, this.r2d.camera);
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.outScene, this.outCam);
  }

  dispose(): void {
    this.target.dispose();
    this.r2d.dispose();
    this.gl.dispose();
  }
}
