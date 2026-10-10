import type { SceneLifecycle } from '@game/lib/scene';
import type { FrameResultPort, MgResultEntry } from '@app/common/work';

export function commitMinigameResult(run: {
  readonly ended: boolean;
  readonly logic: { readonly result: { quit: boolean } | null };
  resultEntry(id: number): MgResultEntry;
}, id: number, frame?: FrameResultPort): MgResultEntry | null {
  if (!run.ended) return null;
  if (!run.logic.result || run.logic.result.quit) { frame?.cancel(); return null; }
  const entry = run.resultEntry(id);
  frame?.commit(entry);
  return entry;
}

export interface MinigameReturnScope {
  readonly signal: AbortSignal;
  valid(): boolean;
  track<T>(job: Promise<T>): Promise<T>;
}

export function minigameReturn(o: {
  frame: FrameResultPort;
  scope: MinigameReturnScope;
  play(signal: AbortSignal): Promise<MgResultEntry | null>;
  complete?(entry: MgResultEntry | null): MgResultEntry | null;
  return(): void;
  cancel?(): void;
  restore?(): Promise<void>;
  onError?(error: unknown): void;
}): SceneLifecycle {
  let pending: Promise<void> | null = null;
  let ready = false;
  let result: MgResultEntry | null = null;
  let error: unknown = null;
  let cleanupError: unknown = null;
  let ended = false;
  return {
    begin: () => {
      pending = o.scope.track(Promise.resolve().then(() => {
        if (!o.scope.valid()) return null;
        return o.play(o.scope.signal);
      }).then(entry => { result = entry; ready = true; }, failure => { error = failure; ready = true; }));
    },
    update: () => {
      if (!ready || ended || !o.scope.valid()) return;
      ended = true;
      try {
        if (error !== null) { o.frame.fail(); o.onError?.(error); }
        else if (o.frame.valid()) {
          const entry = o.complete ? o.complete(result) : result;
          if (entry) o.frame.commit(entry);
          else o.frame.cancel();
        }
      } catch (failure) { o.frame.fail(); o.onError?.(failure); }
      o.return();
    },
    cleanup: () => {
      o.frame.cancel();
      o.cancel?.();
      if (o.restore) o.scope.track((pending ?? Promise.resolve()).then(() => o.restore!()).catch(failure => { cleanupError = failure; }));
    },
    onCleanupProcessing: () => { if (cleanupError !== null) throw cleanupError; },
  };
}
