import * as THREE from 'three';
import { FrameScheduler, P2, RUN_DONE, type SchedTask } from '@game/lib/assetcore';
import type { UploadRecord } from '@game/lib/assetcore-three';
import { RendererState } from './state';

export interface PreparationGpu {
  readonly signal: AbortSignal;
  readonly scheduler: Pick<FrameScheduler, 'add' | 'raise' | 'remove'>;
  readonly uploads: UploadRecord;
  configure?(state: () => void): void;
  valid(): boolean;
  run<T>(unit: () => T): Promise<T>;
}

export class PrepareScope implements PreparationGpu {
  private state: (() => void) | undefined;
  configure(state: () => void): void { this.state = state; }
  private readonly abort = new AbortController();
  private readonly tasks = new Map<SchedTask, SchedTask>();
  private readonly rejects = new Set<(reason: unknown) => void>();
  readonly signal = this.abort.signal;
  readonly scheduler = {
    add: (task: SchedTask, pri: number): void => {
      if (!this.valid()) throw this.signal.reason ?? new Error('Preparation expired');
      const old = this.tasks.get(task);
      if (old) { this.queue.scheduler.raise(old, pri); return; }
      const wrapped: SchedTask = {
        schedPri: -1, schedGen: 0, schedMark: -1,
        run: () => {
          if (!this.valid()) return RUN_DONE;
          try {
            const result = this.queue.unit(() => { this.state?.(); return task.run(); });
            if (result === RUN_DONE) this.tasks.delete(task);
            return result;
          } catch (error) { this.cancel(error); return RUN_DONE; }
        },
      };
      this.tasks.set(task, wrapped); this.queue.scheduler.add(wrapped, pri); this.queue.wake();
    },
    raise: (task: SchedTask, pri: number): void => { const w = this.tasks.get(task); if (w) this.queue.scheduler.raise(w, pri); },
    remove: (task: SchedTask): void => { const w = this.tasks.get(task); if (w) this.queue.scheduler.remove(w); this.tasks.delete(task); },
  };

  constructor(private readonly queue: PrepareQueue, readonly generation: number, readonly uploads: UploadRecord) {}
  valid(): boolean { return !this.signal.aborted && this.queue.valid(this.generation); }
  run<T>(unit: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.rejects.add(reject);
      const task: SchedTask = {
        schedPri: -1, schedGen: 0, schedMark: -1,
        run: () => {
          try { const value = unit(); this.rejects.delete(reject); resolve(value); }
          catch (error) { reject(error); this.cancel(error); }
          return RUN_DONE;
        },
      };
      try { this.scheduler.add(task, P2); }
      catch (error) { this.rejects.delete(reject); reject(error); }
    });
  }
  cancel(reason: unknown = new Error('Preparation cancelled')): void {
    if (this.signal.aborted) return;
    this.abort.abort(reason);
    for (const task of this.tasks.values()) this.queue.scheduler.remove(task);
    this.tasks.clear();
    for (const reject of this.rejects) reject(reason);
    this.rejects.clear(); this.queue.forget(this);
  }
}

export class PrepareQueue {
  readonly scheduler: FrameScheduler;
  private readonly scopes = new Set<PrepareScope>();
  private scratch: THREE.WebGLRenderTarget | null = null;
  private scheduled = false;
  private drawing = false;
  private closed = false;
  constructor(private readonly o: {
    renderer(): THREE.WebGLRenderer; ready(): boolean; generation(): number; uploads(): UploadRecord;
    now(): number; tick(fn: () => void): void; active(): boolean; budgetMs?: number;
  }) { this.scheduler = new FrameScheduler({ now: o.now }, o.budgetMs ?? 4); }
  valid(generation: number): boolean { return !this.closed && this.o.ready() && generation === this.o.generation(); }
  create(): PrepareScope {
    if (!this.valid(this.o.generation())) throw new Error('Preparation renderer unavailable');
    const scope = new PrepareScope(this, this.o.generation(), this.o.uploads()); this.scopes.add(scope); return scope;
  }
  forget(scope: PrepareScope): void { this.scopes.delete(scope); }
  unit<T>(fn: () => T): T {
    const gl = this.o.renderer(), state = new RendererState(gl);
    try {
      this.scratch ??= new THREE.WebGLRenderTarget(1, 1);
      gl.setRenderTarget(this.scratch); gl.setViewport(new THREE.Vector4(0, 0, 1, 1)); gl.setScissorTest(false);
      return fn();
    } finally { state.restore(); }
  }
  frame(draw: () => void): void {
    if (this.drawing) { draw(); return; }
    this.drawing = true;
    const start = this.o.now();
    try { draw(); }
    finally {
      this.drawing = false;
      this.drain(Math.max(0, Math.min(this.scheduler.budgetMs, 1000 / 60 - (this.o.now() - start))));
    }
  }
  drain(budget = this.scheduler.budgetMs): void {
    if (this.closed || this.drawing || !this.o.ready() || budget <= 0) return;
    const old = this.scheduler.budgetMs;
    try { this.scheduler.budgetMs = budget; this.scheduler.frame(); }
    finally { this.scheduler.budgetMs = old; }
  }
  wake(): void {
    if (this.closed || this.scheduled || !this.scheduler.pending) return;
    this.scheduled = true;
    this.o.tick(() => {
      this.scheduled = false;
      if (!this.o.active()) this.drain();
      if (this.scheduler.pending) this.wake();
    });
  }
  invalidate(reason: unknown): void {
    for (const scope of [...this.scopes]) scope.cancel(reason);
    this.scratch?.dispose(); this.scratch = null;
  }
  dispose(): void { this.closed = true; this.invalidate(new Error('Preparation queue disposed')); }
}
