import { MgmView } from '@app/common/ui/view';
import type { MgmAssetAdapter, MgmSpecPart } from '@app/common/ui/types';
import type { LayoutInst } from '@game/lib/layout';

export const CONTROLLER_STANDBY_PART = '../controllerstandby/controllerstandby.json';
export const CONTROLLER_STANDBY_LABEL = 'mn01_modeStart_ui_gyro_standby';

export interface ControllerStandbyPlayer {
  pid: number;
  character: string;
  cpu?: boolean;
  ready?: boolean;
}

export interface ControllerStandbyAssets extends MgmSpecPart {
  texts: Record<string, string>;
}

export interface ControllerStandbyHost {
  readonly spec: { textures: Record<string, string> };
  layout(name: string): LayoutInst;
  begin(): void;
  draw(layout: LayoutInst): void;
  end(): void;
  dispose(): void;
}

export interface ControllerStandbyOptions {
  canvas: HTMLCanvasElement;
  assets: MgmAssetAdapter;
  players: readonly ControllerStandbyPlayer[];
  background?: CanvasImageSource & { width: number; height: number };
}

export class ControllerStandbyScreen {
  readonly layout: LayoutInst;
  readonly players: readonly Readonly<ControllerStandbyPlayer>[];
  private readonly tiles = new Map<number, LayoutInst>();
  private readonly ready = new Set<number>();
  private closing = false;
  private closed = false;
  private disposed = false;

  constructor(private readonly host: ControllerStandbyHost, assets: ControllerStandbyAssets,
    players: readonly ControllerStandbyPlayer[]) {
    const ids = new Set<number>();
    for (const player of players) {
      if (!Number.isInteger(player.pid) || player.pid < 0 || player.pid > 3 || ids.has(player.pid))
        throw new Error('controllerstandby: unique player ids 0..3 required');
      ids.add(player.pid);
      if (!player.cpu && !host.spec.textures[`face_256_${player.character}^u`])
        throw new Error(`controllerstandby: missing face ${player.character}`);
    }
    if (!assets.texts[CONTROLLER_STANDBY_LABEL] || !assets.texts.mn01_ui_ok)
      throw new Error('controllerstandby: missing messages');
    this.players = Object.freeze(players.map(p => Object.freeze({ ...p })));
    this.layout = host.layout('sys_standby_base');
    this.layout.setText('x_text', assets.texts[CONTROLLER_STANDBY_LABEL].replace(/\r\n/g, '\n'));
    for (let pid = 0; pid < 4; pid++) {
      const path = `x_pcface_0${pid}`;
      const player = this.players.find(p => p.pid === pid && !p.cpu);
      this.layout.setVisible(path, !!player);
      if (!player) continue;
      const tile = this.layout.part(path);
      if (!tile) throw new Error(`controllerstandby: missing tile ${path}`);
      tile.setTexture('x_pcface256', 1, `face_256_${player.character}^u`);
      tile.setText('x_text_ok', assets.texts.mn01_ui_ok);
      tile.setText('x_text_ok_shadow', assets.texts.mn01_ui_ok);
      tile.play(player.ready ? 'normal_ok' : 'normal');
      this.tiles.set(pid, tile);
      if (player.ready) this.ready.add(pid);
    }
    this.layout.play('in', 'normal');
  }

  get phase(): 'entering' | 'waiting' | 'closing' | 'closed' | 'disposed' {
    if (this.disposed) return 'disposed';
    if (this.closed) return 'closed';
    if (this.closing) return 'closing';
    return this.layout.current === 'in' ? 'entering' : 'waiting';
  }

  isReady(pid: number): boolean { return this.ready.has(pid); }

  setReady(pid: number, value = true): void {
    if (this.closing || this.closed || this.disposed) return;
    const tile = this.tiles.get(pid);
    if (!tile || this.ready.has(pid) === value) return;
    if (value) {
      this.ready.add(pid);
      tile.play('ok', 'normal_ok');
    } else {
      this.ready.delete(pid);
      tile.play('normal');
    }
  }

  close(): void {
    if (this.closing || this.closed || this.disposed) return;
    this.closing = true;
    this.layout.play('out');
  }

  step(): void {
    if (this.closed || this.disposed) return;
    this.layout.update(1);
    if (this.closing && this.layout.done) {
      this.closed = true;
      this.layout.visible = false;
    }
  }

  draw(): void {
    if (!this.closed && !this.disposed) this.host.draw(this.layout);
  }

  render(): void {
    if (this.closed || this.disposed) return;
    this.host.begin();
    this.draw();
    this.host.end();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.layout.visible = false;
    this.host.dispose();
  }
}

export async function createControllerStandby(options: ControllerStandbyOptions): Promise<ControllerStandbyScreen> {
  const response = await fetch(options.assets.url(CONTROLLER_STANDBY_PART));
  if (!response.ok) throw new Error(`controllerstandby: asset load failed (${response.status})`);
  const assets = await response.json() as ControllerStandbyAssets;
  const host = await MgmView.create({ canvas: options.canvas, assets: options.assets, parts: [CONTROLLER_STANDBY_PART] });
  try {
    if (options.background) host.setBackdrop(options.background);
    return new ControllerStandbyScreen(host, assets, options.players);
  } catch (error) {
    host.dispose();
    throw error;
  }
}
