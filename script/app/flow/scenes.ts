import { SceneSequence, type SceneCommands, type SceneLifecycle } from '@game/lib/scene';

export class SceneScope {
  private readonly controller = new AbortController();
  private readonly jobs = new Set<Promise<unknown>>();
  readonly signal = this.controller.signal;
  valid(): boolean { return !this.signal.aborted; }
  get settled(): boolean { return this.jobs.size === 0; }
  track<T>(job: Promise<T>): Promise<T> {
    this.jobs.add(job);
    void job.then(() => this.jobs.delete(job), () => this.jobs.delete(job));
    return job;
  }
  cancel(): void { if (this.valid()) this.controller.abort(new Error('Scene ended')); }
  async settle(): Promise<void> {
    while (this.jobs.size) await Promise.allSettled([...this.jobs]);
  }
}

export interface SceneContext<Id extends string> {
  readonly scope: SceneScope;
  readonly scenes: SceneCommands<Id>;
  readonly reason: 'entry' | 'return';
}
export type SceneRegistry<Id extends string> = Readonly<Record<Id, (context: SceneContext<Id>) => SceneLifecycle>>;

export class SceneHost<Id extends string> {
  readonly sequence: SceneSequence<Id>;
  constructor(registry: SceneRegistry<Id>, events: { onEmpty?(): void; onError?(error: unknown): void } = {}) {
    this.sequence = new SceneSequence({
      has: id => Object.prototype.hasOwnProperty.call(registry, id),
      create: (id, commands, reason) => {
        const scope = new SceneScope();
        const scenes: SceneCommands<Id> = {
          call: name => scope.valid() && commands.call(name),
          change: name => scope.valid() && commands.change(name),
          return: () => scope.valid() && commands.return(),
        };
        let scene: SceneLifecycle;
        try { scene = registry[id]({ scope, scenes, reason }); }
        catch (error) { scope.cancel(); throw error; }
        let disposed = false;
        return {
          onEntry: () => scene.onEntry?.(), begin: () => scene.begin?.(),
          onLoaded: () => scene.onLoaded?.() ?? true,
          onLoadComplete: () => scene.onLoadComplete?.(), setup: () => scene.setup?.(),
          isSynced: () => scene.isSynced?.() ?? true, syncedSetup: () => scene.syncedSetup?.(),
          update: dt => scene.update?.(dt), render: () => scene.render?.(),
          cleanup: () => { scope.cancel(); scene.cleanup?.(); },
          onCleanupProcessing: () => scene.onCleanupProcessing?.(),
          isCleanupComplete: () => scope.settled && (scene.isCleanupComplete?.() ?? true),
          dispose: () => {
            if (disposed) return;
            disposed = true;
            if (scope.settled) scene.dispose?.();
            else void scope.settle().then(() => scene.dispose?.()).catch(error => events.onError?.(error));
          },
        };
      },
      onEmpty: events.onEmpty,
      onError: error => events.onError?.(error),
    });
  }
  start(id: Id): void { this.sequence.start(id); }
  step(open = true): void { this.sequence.tick(open); }
  render(): void { this.sequence.render(); }
  dispose(): void { this.sequence.dispose(); }
}
