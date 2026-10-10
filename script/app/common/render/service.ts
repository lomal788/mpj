import * as THREE from 'three';
import type { UploadRecord } from '@game/lib/assetcore-three';
import { RendererState } from './state';

export interface RenderServiceDeps {
  canvas(): HTMLCanvasElement;
  renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer;
}

export class RenderLease {
  private released = false;
  private readonly lost = new Set<() => void>();
  readonly state: RendererState;

  constructor(readonly service: RenderService, readonly owner: string, readonly generation: number) {
    this.state = new RendererState(service.renderer);
  }

  get valid(): boolean { return !this.released && this.service.current === this && this.generation === this.service.generation && this.service.ready; }
  assert(): void { if (!this.valid) throw new Error(`Render lease expired: ${this.owner}`); }
  get renderer(): THREE.WebGLRenderer { this.assert(); return this.service.renderer; }
  get canvas(): HTMLCanvasElement { return this.service.canvas; }
  get uploads(): UploadRecord { this.assert(); return this.service.uploads; }
  onLost(fn: () => void): () => void { this.lost.add(fn); return () => this.lost.delete(fn); }
  invalidate(): void { for (const fn of this.lost) fn(); }
  attach(host: HTMLElement): void {
    this.assert(); this.canvas.style.visibility = ''; host.prepend(this.canvas);
  }
  resize(w: number, h: number, ratio = 1): void {
    this.assert(); this.service.resize(this, w, h, ratio);
  }
  release(): void {
    if (this.released) return;
    this.released = true; this.lost.clear(); this.service.release(this);
  }
}

export class RenderService {
  private canvas_: HTMLCanvasElement | null = null;
  private renderer_: THREE.WebGLRenderer | null = null;
  private readonly waiters: { owner: string; resolve: (lease: RenderLease) => void; reject: (error: Error) => void }[] = [];
  private readonly caches = new Map<string, Map<string, unknown>>();
  private closed = false;
  private lost = false;
  generation = 1;
  current: RenderLease | null = null;
  uploads: UploadRecord = new WeakMap();

  constructor(private readonly deps: RenderServiceDeps) {}
  get ready(): boolean { return !this.closed && !this.lost; }
  get canvas(): HTMLCanvasElement {
    if (this.closed) throw new Error('Render service disposed');
    return this.canvas_ ??= this.deps.canvas();
  }
  get renderer(): THREE.WebGLRenderer {
    if (this.closed) throw new Error('Render service disposed');
    if (!this.renderer_) {
      this.renderer_ = this.deps.renderer(this.canvas);
      this.canvas.addEventListener('webglcontextlost', this.onLost);
      this.canvas.addEventListener('webglcontextrestored', this.onRestored);
    }
    return this.renderer_;
  }
  keep(owner: string): Map<string, unknown> {
    let cache = this.caches.get(owner);
    if (!cache) this.caches.set(owner, cache = new Map());
    return cache;
  }
  trim(owner: string): void {
    const cache = this.caches.get(owner);
    if (!cache) return;
    for (const value of cache.values()) (value as { dispose?(): void } | null)?.dispose?.();
    cache.clear();
  }
  tryAcquire(owner: string): RenderLease | null {
    if (!this.ready || this.current || this.waiters.length) return null;
    return this.open(owner);
  }
  acquire(owner: string): Promise<RenderLease> {
    if (!this.ready) return Promise.reject(new Error('Render service unavailable'));
    const immediate = this.tryAcquire(owner);
    return immediate ? Promise.resolve(immediate) : new Promise((resolve, reject) => this.waiters.push({ owner, resolve, reject }));
  }
  private open(owner: string): RenderLease {
    const lease = new RenderLease(this, owner, this.generation);
    this.current = lease;
    const gl = this.renderer;
    gl.setRenderTarget(null); gl.setScissorTest(false);
    gl.autoClear = gl.autoClearColor = gl.autoClearDepth = gl.autoClearStencil = true;
    gl.shadowMap.enabled = false; gl.shadowMap.autoUpdate = true; gl.shadowMap.needsUpdate = false;
    gl.toneMapping = THREE.NoToneMapping; gl.toneMappingExposure = 1;
    gl.outputColorSpace = THREE.SRGBColorSpace; gl.setClearColor(0x404040, 1);
    return lease;
  }
  resize(lease: RenderLease, w: number, h: number, ratio: number): void {
    lease.assert();
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(Math.max(1, w), Math.max(1, h), false);
  }
  release(lease: RenderLease): void {
    if (this.current !== lease) return;
    this.canvas.remove();
    try { if (this.ready && lease.generation === this.generation) lease.state.restore(); }
    finally {
      if (lease.generation !== this.generation) for (const owner of this.caches.keys()) this.trim(owner);
      this.current = null; this.next();
    }
  }
  private next(): void {
    if (this.current || !this.ready) return;
    const next = this.waiters.shift();
    if (next) next.resolve(this.open(next.owner));
  }
  private readonly onLost = (event: Event): void => {
    event.preventDefault(); this.lost = true; this.generation++; this.uploads = new WeakMap();
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('Render context lost'));
    this.current?.invalidate();
  };
  private readonly onRestored = (): void => {
    if (!this.current) for (const owner of this.caches.keys()) this.trim(owner);
    this.lost = false; this.next();
  };
  dispose(): void {
    if (this.closed) return;
    if (this.current) throw new Error('Release render lease before disposing service');
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error('Render service disposed'));
    for (const owner of this.caches.keys()) this.trim(owner);
    this.canvas_?.removeEventListener('webglcontextlost', this.onLost);
    this.canvas_?.removeEventListener('webglcontextrestored', this.onRestored);
    this.canvas_?.remove(); this.renderer_?.dispose();
  }
}

let shared: RenderService | undefined;
export function appRenderService(): RenderService {
  return shared ??= new RenderService({
    canvas: () => { const canvas = document.createElement('canvas'); canvas.className = 'jw-gl'; return canvas; },
    renderer: (canvas) => new THREE.WebGLRenderer({ canvas, antialias: true }),
  });
}
