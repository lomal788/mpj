import type * as THREE from 'three';
import { MgmView } from '@app/common/ui/view';
import { mgInstContent } from './data';
import { BorrowedPreviewSlot, MG_INST_PREVIEW_KEY } from './preview';
import { MgInstState } from './state';
import { MgInstViewApprox } from './view';
import type { MgInstAssets, MgInstHandle, MgInstOptions } from './types';

export const MG_INST_PART = '../mginst/mginst.json';

export class MgInstScreen implements MgInstHandle {
  readonly state: MgInstState;
  readonly view: MgInstViewApprox;
  readonly content;
  private readonly preview: BorrowedPreviewSlot<THREE.Texture>;
  private readonly triggers = new Map<number, number>();
  private notified = false;
  private closed = false;

  constructor(private readonly host: MgmView, assets: MgInstAssets, private readonly options: MgInstOptions) {
    this.content = mgInstContent(assets, options.game, options.group, options.rowIndex);
    this.state = new MgInstState(options.players);
    this.view = new MgInstViewApprox(host, this.content, this.state, options.layout ?? (options.players.length > 4 ? 'vs8' : 'vs4'));
    this.preview = new BorrowedPreviewSlot(host.r2d.dynamic);
  }

  get phase() { return this.state.phase; }
  setInputAllowed(allowed: boolean): void { this.state.setInputAllowed(allowed); }
  setReady(pid: number): void { this.state.setReady(pid); }
  setPreviewTexture(texture: THREE.Texture | null): void {
    if (this.closed) return;
    this.preview.set(texture);
    this.view.setPreviewConnected(this.preview.connected, MG_INST_PREVIEW_KEY);
  }

  step(): void {
    if (this.closed || this.notified) return;
    this.view.step();
    if (this.options.inputGate === 'layoutIntroApprox' && this.view.introFinished) this.state.setInputAllowed(true);
    this.triggers.clear();
    if (this.state.inputAllowed && this.state.phase === 'ready')
      for (const p of this.state.players) if (!p.cpu && p.local !== false)
        this.triggers.set(p.pid, this.options.pads?.poll(p.pid).trig ?? 0);
    this.state.step(this.triggers, this.view.introFinished);
    this.view.syncReady();
    if (this.phase === 'complete' && !this.notified) {
      this.notified = true;
      this.options.onReady?.();
    }
  }

  render(): void { if (!this.closed) this.view.draw(); }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.state.dispose();
    this.preview.dispose();
    this.host.dispose();
  }
}

export async function createMgInst(options: MgInstOptions): Promise<MgInstScreen> {
  const response = await fetch(options.assets.url(MG_INST_PART));
  if (!response.ok) throw new Error(`mginst: failed to load data (${response.status})`);
  const assets = await response.json() as MgInstAssets;
  mgInstContent(assets, options.game, options.group, options.rowIndex);
  const host = await MgmView.create({ canvas: options.canvas, assets: options.assets, parts: [MG_INST_PART] });
  try { return new MgInstScreen(host, assets, options); }
  catch (error) { host.dispose(); throw error; }
}
