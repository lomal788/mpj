import * as THREE from 'three';
import { RendererState } from './state';

export class HudComposite {
  private readonly target = new THREE.WebGLRenderTarget(1920, 1080, { samples: 4, depthBuffer: false, stencilBuffer: false });
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { source: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D source; varying vec2 vUv; void main(){gl_FragColor=texture2D(source,vUv);}',
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private canvasTexture: THREE.CanvasTexture | null = null;
  private closed = false;

  constructor() { this.scene.add(new THREE.Mesh(this.geometry, this.material)); }

  render(gl: THREE.WebGLRenderer, ctx: CanvasRenderingContext2D, draw: () => void): void {
    if (this.closed) return;
    const state = new RendererState(gl);
    try {
      gl.autoClear = false; gl.shadowMap.enabled = false;
      gl.toneMapping = THREE.NoToneMapping; gl.toneMappingExposure = 1;
      gl.outputColorSpace = THREE.LinearSRGBColorSpace;
      gl.setScissorTest(false); gl.setRenderTarget(this.target);
      gl.setClearColor(0, 0); gl.clear(); draw();
      gl.setRenderTarget(null); gl.setScissorTest(false);
      const size = gl.getSize(new THREE.Vector2());
      gl.setViewport(new THREE.Vector4(0, 0, size.x, size.y));
      if (this.canvasTexture?.image !== ctx.canvas) {
        this.canvasTexture?.dispose();
        this.canvasTexture = new THREE.CanvasTexture(ctx.canvas);
        this.canvasTexture.premultiplyAlpha = true;
        this.canvasTexture.generateMipmaps = false;
        this.canvasTexture.minFilter = THREE.LinearFilter;
      }
      this.canvasTexture.needsUpdate = true;
      this.material.uniforms.source.value = this.canvasTexture;
      gl.render(this.scene, this.camera);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
      this.material.uniforms.source.value = this.target.texture;
      gl.render(this.scene, this.camera);
    } finally { state.restore(); }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.target.dispose(); this.geometry.dispose(); this.material.dispose(); this.canvasTexture?.dispose();
  }
}
