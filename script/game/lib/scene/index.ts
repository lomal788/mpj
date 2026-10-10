export const SCENE_DT = Math.fround(1 / 60);

export type ScenePhase = 'idle' | 'begin' | 'loading' | 'setup' | 'sync' | 'active' | 'cleanup' | 'failed' | 'disposed';
export type SceneRequest<Id extends string> = { kind: 'call' | 'change'; id: Id } | { kind: 'return' };

export interface SceneLifecycle {
  onEntry?(): void;
  begin?(): void;
  onLoaded?(): boolean;
  onLoadComplete?(): void;
  setup?(): void;
  isSynced?(): boolean;
  syncedSetup?(): void;
  update?(dt: number): void;
  render?(): void;
  cleanup?(): void;
  onCleanupProcessing?(): void;
  isCleanupComplete?(): boolean;
  dispose?(): void;
}

export interface SceneCommands<Id extends string> {
  call(id: Id): boolean;
  change(id: Id): boolean;
  return(): boolean;
}

export class SceneSequence<Id extends string> implements SceneCommands<Id> {
  private records: Id[] = [];
  private instance: SceneLifecycle | null = null;
  private pending: SceneRequest<Id> | null = null;
  private transition: SceneRequest<Id> | null = null;
  private phase_: ScenePhase = 'idle';
  private error_: unknown = null;
  private cleaning = false;

  constructor(private readonly port: {
    has(id: Id): boolean;
    create(id: Id, commands: SceneCommands<Id>, reason: 'entry' | 'return'): SceneLifecycle;
    onEmpty?(): void;
    onError?(error: unknown, id: Id | null): void;
  }) {}

  get current(): Id | null { return this.records.at(-1) ?? null; }
  get depth(): number { return this.records.length; }
  get phase(): ScenePhase { return this.phase_; }
  get error(): unknown { return this.error_; }
  get scene(): SceneLifecycle | null { return this.instance; }
  get names(): readonly Id[] { return this.records.slice(); }

  start(id: Id): void {
    if (this.phase_ !== 'idle' || this.records.length || this.pending) throw new Error('Scene sequence already started');
    if (!this.port.has(id)) throw new Error(`Unknown scene: ${id}`);
    this.pending = { kind: 'call', id };
  }

  private request(request: SceneRequest<Id>): boolean {
    if (this.phase_ === 'disposed' || this.phase_ === 'failed' || this.transition) return false;
    if (request.kind === 'return' ? this.records.length === 0 : !this.port.has(request.id)) return false;
    this.pending = request;
    return true;
  }

  call(id: Id): boolean { return this.request({ kind: 'call', id }); }
  change(id: Id): boolean { return this.request({ kind: 'change', id }); }
  return(): boolean { return this.request({ kind: 'return' }); }

  private clean(): void {
    if (this.cleaning || !this.instance) return;
    this.cleaning = true;
    this.instance.cleanup?.();
  }

  private release(): void {
    const instance = this.instance;
    this.instance = null;
    this.cleaning = false;
    instance?.dispose?.();
  }

  private enter(request: SceneRequest<Id>): void {
    if (request.kind === 'return') this.records.pop();
    else if (request.kind === 'change' && this.records.length) this.records[this.records.length - 1] = request.id;
    else this.records.push(request.id);
    this.transition = null;
    const id = this.current;
    if (id === null) {
      this.phase_ = 'idle';
      this.port.onEmpty?.();
      return;
    }
    this.instance = this.port.create(id, this, request.kind === 'return' ? 'return' : 'entry');
    this.phase_ = 'begin';
    this.instance.onEntry?.();
  }

  tick(open = true): void {
    if (!open || this.phase_ === 'disposed' || this.phase_ === 'failed') return;
    try {
      if (this.pending && !this.transition) {
        this.transition = this.pending;
        this.pending = null;
        if (!this.instance) { this.enter(this.transition); return; }
        this.phase_ = 'cleanup';
        this.clean();
        return;
      }
      const scene = this.instance;
      if (!scene) return;
      switch (this.phase_) {
        case 'begin':
          scene.begin?.();
          this.phase_ = 'loading';
          break;
        case 'loading':
          if (scene.onLoaded?.() === false) return;
          scene.onLoadComplete?.();
          this.phase_ = 'setup';
          break;
        case 'setup':
          scene.setup?.();
          this.phase_ = 'sync';
          break;
        case 'sync':
          if (scene.isSynced?.() === false) return;
          scene.syncedSetup?.();
          this.phase_ = 'active';
          break;
        case 'active':
          scene.update?.(SCENE_DT);
          break;
        case 'cleanup':
          scene.onCleanupProcessing?.();
          if (scene.isCleanupComplete?.() === false) return;
          this.release();
          if (this.transition) this.enter(this.transition);
          break;
      }
    } catch (error) {
      this.error_ = error;
      this.phase_ = 'failed';
      this.pending = this.transition = null;
      try { this.clean(); } finally {
        try { this.release(); } finally { this.port.onError?.(error, this.current); }
      }
    }
  }

  render(): void {
    if (this.phase_ === 'active') this.instance?.render?.();
  }

  dispose(): void {
    if (this.phase_ === 'disposed') return;
    this.phase_ = 'disposed';
    this.pending = this.transition = null;
    try { this.clean(); } finally { this.release(); this.records = []; }
  }
}
