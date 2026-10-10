import * as THREE from 'three';
import { appRenderService, type RenderLease, type RenderService } from './service';

export class MenuSurface {
  private lease: RenderLease | null = null;
  private pending: Promise<void> | null = null;
  private epoch = 0;
  private closed = false;
  private wanted = false;

  constructor(private readonly host: HTMLElement, private readonly width: number, private readonly height: number, private readonly service: RenderService = appRenderService()) {
    service.canvas.addEventListener('webglcontextrestored', this.restored);
  }
  static async create(canvas: HTMLCanvasElement, width: number, height: number): Promise<MenuSurface> {
    const service = appRenderService();
    if (canvas !== service.canvas || !canvas.parentElement) throw new Error('Menu requires the mounted app render canvas');
    const surface = new MenuSurface(canvas.parentElement, width, height, service);
    try { await surface.resume(); return surface; }
    catch (error) { surface.dispose(); throw error; }
  }
  get active(): boolean { return !this.closed && this.lease?.valid === true; }
  get gl(): THREE.WebGLRenderer { return this.service.renderer; }
  frame(draw: () => void): void { if (this.active) this.service.activeFrame(draw); }
  suspend(): void {
    this.wanted = false; this.epoch++;
    this.lease?.release(); this.lease = null;
    this.pending = null;
  }
  resume(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.wanted = true;
    if (this.active) return Promise.resolve();
    if (this.pending) return this.pending;
    const epoch = ++this.epoch;
    const job = this.service.acquire('menu').then(lease => {
      if (this.closed || !this.wanted || epoch !== this.epoch) { lease.release(); return; }
      this.lease = lease;
      lease.onLost(() => { this.lease = null; lease.release(); });
      try {
        lease.attach(this.host); lease.resize(this.width, this.height, 1);
        const gl = lease.renderer;
        gl.autoClear = false; gl.outputColorSpace = THREE.SRGBColorSpace;
      } catch (error) { this.lease = null; lease.release(); throw error; }
    });
    this.pending = job;
    void job.finally(() => { if (this.pending === job) this.pending = null; }).catch(() => undefined);
    return job;
  }
  private readonly restored = (): void => {
    if (this.wanted && !this.closed) queueMicrotask(() => {
      if (this.wanted && !this.closed) void this.resume().catch(error => console.warn('menu renderer restore', error));
    });
  };
  async disposeAfter(settled: Promise<unknown>, cleanup: () => void): Promise<void> {
    if (this.closed) return;
    this.closed = true; this.wanted = false; this.epoch++;
    this.service.canvas.removeEventListener('webglcontextrestored', this.restored);
    try { await settled; }
    finally { try { cleanup(); } finally { this.suspend(); } }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.suspend();
    this.service.canvas.removeEventListener('webglcontextrestored', this.restored);
  }
}
