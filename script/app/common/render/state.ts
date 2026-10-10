import * as THREE from 'three';

export class RendererState {
  private readonly target: THREE.WebGLRenderTarget | null;
  private readonly viewport = new THREE.Vector4();
  private readonly scissor = new THREE.Vector4();
  private readonly color = new THREE.Color();
  private readonly size = new THREE.Vector2();
  private readonly ratio: number;
  private readonly scissorTest: boolean;
  private readonly alpha: number;
  private readonly auto: boolean[];
  private readonly shadow: Pick<THREE.WebGLRenderer['shadowMap'], 'enabled' | 'type' | 'autoUpdate' | 'needsUpdate'>;
  private readonly tone: THREE.ToneMapping;
  private readonly exposure: number;
  private readonly output: string;
  private readonly targetState: { viewport: THREE.Vector4; scissor: THREE.Vector4; test: boolean } | null;

  constructor(private readonly gl: THREE.WebGLRenderer) {
    this.target = gl.getRenderTarget();
    gl.getViewport(this.viewport); gl.getScissor(this.scissor); gl.getClearColor(this.color); gl.getSize(this.size);
    this.ratio = gl.getPixelRatio(); this.scissorTest = gl.getScissorTest(); this.alpha = gl.getClearAlpha();
    this.auto = [gl.autoClear, gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil];
    this.shadow = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type, autoUpdate: gl.shadowMap.autoUpdate, needsUpdate: gl.shadowMap.needsUpdate };
    this.tone = gl.toneMapping; this.exposure = gl.toneMappingExposure; this.output = gl.outputColorSpace;
    this.targetState = this.target ? { viewport: this.target.viewport.clone(), scissor: this.target.scissor.clone(), test: this.target.scissorTest } : null;
  }

  restore(): void {
    const gl = this.gl;
    gl.setRenderTarget(null);
    if (gl.getPixelRatio() !== this.ratio) gl.setPixelRatio(this.ratio);
    const size = gl.getSize(new THREE.Vector2());
    if (!size.equals(this.size)) gl.setSize(this.size.x, this.size.y, false);
    gl.setViewport(this.viewport); gl.setScissor(this.scissor); gl.setScissorTest(this.scissorTest);
    gl.setClearColor(this.color, this.alpha);
    [gl.autoClear, gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil] = this.auto;
    Object.assign(gl.shadowMap, this.shadow);
    gl.toneMapping = this.tone; gl.toneMappingExposure = this.exposure; gl.outputColorSpace = this.output;
    if (this.target && this.targetState) {
      this.target.viewport.copy(this.targetState.viewport); this.target.scissor.copy(this.targetState.scissor); this.target.scissorTest = this.targetState.test;
    }
    gl.setRenderTarget(this.target);
  }
}
