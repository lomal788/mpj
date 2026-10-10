import type { GameDef, GameSetup, GameView, ViewContext } from '../../game';
import type { Assets } from '../../view/assets';
import type { PrepareQueue, PrepareScope } from '@app/common/render/prepare';

export interface PreparedGame {
  view: GameView;
  context: ViewContext;
  assets: Assets;
}
interface Selection {
  def: GameDef;
  key: string;
  gpu: PrepareScope;
  data: PreparedGame | null;
  ready: Promise<void>;
  state: 'preparing' | 'ready' | 'failed' | 'cancelled';
  cleaned: boolean;
  abort: () => void;
}

export class GamePreparation {
  private current: Selection | null = null;
  constructor(private readonly queue: PrepareQueue, private readonly create: (def: GameDef, setup: GameSetup) => PreparedGame) {}
  get state(): string { return this.current?.state ?? 'idle'; }
  get game(): string | null { return this.current?.def.id ?? null; }
  select(def: GameDef, setup: GameSetup): Promise<void> {
    const key = def.preparationKey?.(setup) ?? JSON.stringify([setup.players, setup.options, setup.practice]);
    if (this.current?.def === def && this.current.key === key && this.current.gpu.valid() && this.current.state !== 'failed') return this.current.ready;
    this.cancel();
    const gpu = this.queue.create();
    const slot: Selection = { def, key, gpu, data: null, ready: Promise.resolve(), state: 'preparing', cleaned: false, abort: () => { slot.data?.assets.cancel(); } };
    this.current = slot;
    gpu.signal.addEventListener('abort', slot.abort);
    slot.ready = (async () => {
      await def.load?.();
      if (!gpu.valid()) throw gpu.signal.reason ?? new Error('Game preparation expired');
      const data = this.create(def, structuredClone(setup)); slot.data = data;
      if (!data.view.prepare || !data.view.activate) throw new Error(`Game does not support preparation: ${def.id}`);
      await data.view.prepare(() => undefined, gpu);
      if (!gpu.valid()) throw gpu.signal.reason ?? new Error('Game preparation expired');
      slot.state = 'ready';
    })().catch(error => {
      slot.state = gpu.signal.aborted ? 'cancelled' : 'failed';
      gpu.cancel(error); throw error;
    });
    void slot.ready.catch(() => this.cleanup(slot));
    return slot.ready;
  }
  private cleanup(slot: Selection): void {
    if (slot.cleaned) return;
    slot.cleaned = true; slot.gpu.signal.removeEventListener('abort', slot.abort);
    try { slot.data?.view.dispose(); }
    finally { slot.data?.assets.dispose(); slot.data = null; }
  }
  cancel(): void {
    const slot = this.current; this.current = null;
    if (!slot) return;
    slot.state = 'cancelled'; slot.gpu.cancel();
    void slot.ready.catch(() => undefined).then(() => this.cleanup(slot));
  }
  async take(def: GameDef, setup: GameSetup): Promise<PreparedGame | null> {
    const pending = this.select(def, setup);
    const slot = this.current;
    await pending;
    if (this.current !== slot || !slot || slot.def !== def || slot.state !== 'ready' || !slot.gpu.valid()) return null;
    this.current = null; slot.gpu.signal.removeEventListener('abort', slot.abort);
    slot.gpu.cancel(new Error('Preparation transferred'));
    const data = slot.data!; slot.data = null; slot.cleaned = true;
    data.assets.setPriority(0);
    Object.assign(data.context, { setup });
    return data;
  }
}
