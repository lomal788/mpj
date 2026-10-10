import { RichTextPane, parseMessage } from '@app/common/ui/text';
import { paneGlobal, type Mat3 } from '@app/common/ui/itemLayout';
import type { MgmSpec } from '@app/common/ui/types';
import type { Render2D } from '@app/common/ui/layout/render';
import type { LayoutDocument, LayoutInst, Rgba } from '@game/lib/layout';
import type { MgInstState } from './state';
import type { MgInstContent, ReadyLayout } from './types';

export interface MgInstViewHost {
  readonly spec: MgmSpec;
  readonly all: LayoutDocument;
  readonly r2d: Render2D;
  layout(name: string): LayoutInst;
  begin(): void;
  draw(layout: LayoutInst, matrix?: Mat3): void;
  end(): void;
}

export const READY_GROUPS: readonly ReadyLayout[] = ['vs4', 'vs8', '1vs3', '2vs2', '1vs1'];
export const READY_CAPACITY: Record<ReadyLayout, number> = { vs4: 4, vs8: 8, '1vs3': 4, '2vs2': 4, '1vs1': 2 };
const GUIDE_COLOR: Rgba = [7, 2, 3, 255];
const SECTION_GAP_APPROX = 24;

export class MgInstViewApprox {
  readonly base: LayoutInst;
  readonly background: LayoutInst;
  readonly guide: LayoutInst;
  readonly operationHeader: LayoutInst;
  readonly operation: LayoutInst;
  readonly advantage: LayoutInst;
  readonly rule: RichTextPane;
  readonly operationLines: RichTextPane[];
  readonly advantageText: RichTextPane;
  readonly tiles: LayoutInst[] = [];
  private readonly displayedReady = new Set<number>();

  constructor(readonly host: MgInstViewHost, readonly content: MgInstContent, readonly state: MgInstState,
    readonly readyLayout: ReadyLayout) {
    if (state.players.length > READY_CAPACITY[readyLayout]) throw new Error(`mginst: too many players for ${readyLayout}`);
    this.background = host.layout('sys_bg_base_00');
    this.base = host.layout('sys_mginst_base');
    this.guide = host.layout('sys_mg_operation_01');
    this.operationHeader = this.guide.part('x_parts_opr')!;
    this.operation = this.guide.part('x_operation_top_00')!;
    this.advantage = this.guide.part('x_operation_top_01')!;
    this.guide.setVisible('x_operation_top_02', false);
    this.guide.setVisible('x_detail', false);
    this.background.play('normal');
    this.base.play('in', 'normal');
    for (const layout of [this.operationHeader, this.operation, this.advantage]) {
      for (const pane of layout.nodes) {
        if (pane.spec.n.endsWith('_shadow') || pane.spec.n === 'line_shadow') pane.v = false;
        if (pane.spec.k === 'txt' || ['line', 'x_line', 'x_icon', 'x_hold_00', 'x_hold_01'].includes(pane.spec.n))
          pane.vc = Array.from({ length: 4 }, () => [...GUIDE_COLOR] as Rgba);
      }
    }
    this.base.setText('x_mgt_00', content.title);
    this.base.setVisible('x_tlp_mg', false);
    this.base.setVisible('x_rank', false);
    this.base.setVisible('x_timer', false);
    this.base.setVisible('pos_play/P_pict_01', false);
    this.base.setVisible('x_parts_opr', false);
    for (const group of READY_GROUPS) this.base.setVisible(`x_${group}`, group === readyLayout);
    for (const node of ['x_text_vs_00', 'x_text_vs_00_shadow', 'x_text_vs_01', 'x_text_vs_01_shadow', 'x_text_vs_02', 'x_text_vs_02_shadow'])
      this.base.setText(node, 'VS');
    const ready = this.base.part('pos_ready');
    if (!ready) throw new Error('mginst: missing ready layout');
    ready.play('normal');
    ready.setText('x_text_ready', content.readyLabel);
    ready.setVisible('x_text_count', false);
    this.rule = new RichTextPane(host.all, this.base, 'x_text_tlp_01', host.spec.lineSpace.sys_mginst_base?.x_text_tlp_01 ?? 0);
    this.rule.set(parseMessage(content.rule, {}));
    this.operationHeader.setText('x_text_00', content.operationTitle);
    this.operationHeader.setVisible('x_hold_00', content.controllerId !== 0 && content.controllerHold === 'Horizontal');
    this.operationHeader.setVisible('x_hold_01', content.controllerId !== 0 && content.controllerHold === 'Vertical');
    if (content.controllerId === 0) {
      const caption = this.operationHeader.find('x_text_00')!;
      caption[0].nodes[caption[1]].t[0] = 0;
    }
    this.operation.visible = content.operations.length > 0;
    for (const path of ['x_title_null_00', 'x_title_null_01', 'x_icon_null', 'x_line_null', 'x_size_01', 'x_size_02'])
      this.operation.setVisible(path, false);
    this.operationLines = [0, 1, 2, 3].map(i => {
      const pane = `x_text_opr_${String(i).padStart(2, '0')}`;
      this.operation.setVisible(`x_text_null_${String(i).padStart(2, '0')}`, i < content.operations.length);
      const rich = new RichTextPane(host.all, this.guide, `x_operation_top_00/${pane}`, 0, true, 'paneTint');
      rich.set(parseMessage(content.operations[i] ?? '', {}));
      return rich;
    });
    this.operation.setVisible('x_text_null_04', false);
    this.advantage.setText('x_text_01', content.advantageTitle);
    for (const path of ['x_title_null_00', 'x_size_00', 'x_size_01']) this.advantage.setVisible(path, false);
    for (const path of ['x_title_null_01', 'x_icon_null', 'x_line_null', 'x_size_02']) this.advantage.setVisible(path, true);
    this.projectedDotsApprox(this.advantage);
    this.advantageText = new RichTextPane(host.all, this.guide, 'x_operation_top_01/x_text_opr_06', 0, true, 'paneTint');
    this.advantageText.set(parseMessage(content.advantage, {}));
    this.advantage.visible = !!content.advantage && state.players.some(p => p.advantage);
    this.alignGuideApprox();
    for (let i = 0; i < READY_CAPACITY[readyLayout]; i++) {
      const pane = `${readyLayout}_${String(i).padStart(2, '0')}p`;
      const player = state.players[i];
      this.base.setVisible(pane, !!player);
      if (!player) continue;
      const tile = this.base.part(pane);
      if (!tile) throw new Error(`mginst: missing tile ${pane}`);
      tile.play('normal_00');
      tile.setTexture('x_face_pc128', 1, `face_128_${player.character}^u`);
      tile.setText('x_ok_02', content.okLabel);
      tile.setText('x_ok_02_shadow', content.okLabel);
      tile.setVisible('x_promoter_icon', !!player.advantage);
      const badge = tile.find('x_promoter_icon')!;
      badge[0].nodes[badge[1]].a = player.advantage ? 255 : 0;
      tile.setVisible('adv_ef', false);
      this.tiles.push(tile);
    }
  }

  get introFinished(): boolean { return this.base.current !== 'in'; }

  private projectedDotsApprox(layout: LayoutInst): void {
    const found = layout.find('x_line')!;
    const line = found[0].nodes[found[1]];
    const u = line.z[0] / 10;
    const v = line.z[1] / 10;
    line.uv = [0, 0, u, 0, 0, v, u, v];
  }

  private alignGuideApprox(): void {
    const alignment = this.guide.find('x_alignment_top')!;
    const area = alignment[0].nodes[alignment[1]];
    const top = area.z[1] / 2;
    const row = this.operation.find('x_text_opr_00')!;
    const rowGlobal = paneGlobal(this.operation, 'x_text_opr_00')!;
    const rowTop = rowGlobal.m[5] + row[0].nodes[row[1]].z[1] / 2;
    const operation = this.guide.find('x_operation_top_00')!;
    const opNode = operation[0].nodes[operation[1]];
    opNode.t[1] = top - rowTop;
    const last = this.operation.find(`x_text_opr_${String(Math.max(0, this.content.operations.length - 1)).padStart(2, '0')}`)!;
    const lastGlobal = paneGlobal(this.operation, last[0].nodes[last[1]].spec.n)!;
    const bottom = opNode.t[1] + lastGlobal.m[5] - last[0].nodes[last[1]].z[1] / 2;
    const icon = paneGlobal(this.advantage, 'x_icon_null')!;
    const iconPane = this.advantage.find('x_icon_null')!;
    const advTop = icon.m[5] + iconPane[0].nodes[iconPane[1]].z[1] / 2;
    const advNode = this.guide.find('x_operation_top_01')!;
    advNode[0].nodes[advNode[1]].t[1] = (this.operation.visible ? bottom - SECTION_GAP_APPROX : top) - advTop;
  }

  step(): void {
    this.background.update();
    this.base.update();
  }

  syncReady(): void {
    this.state.players.forEach((p, i) => {
      const tile = this.tiles[i];
      if (this.state.ready.has(p.pid) && !this.displayedReady.has(p.pid)) {
        tile.play('ok', 'normal_01');
        tile.setVisible('null_ok', true);
        tile.setVisible('base_00', true);
        tile.setVisible('base_03', false);
        this.displayedReady.add(p.pid);
      }
      tile.setVisible('x_promoter_icon', !!p.advantage);
      const badge = tile.find('x_promoter_icon')!;
      badge[0].nodes[badge[1]].a = p.advantage ? 255 : 0;
      tile.setVisible('adv_ef', false);
    });
  }

  draw(): void {
    this.host.begin();
    this.host.draw(this.background);
    this.host.draw(this.base);
    this.rule.draw(this.host.r2d);
    const basis: Mat3 = paneGlobal(this.base, 'x_opr')!.m;
    this.host.draw(this.guide, basis);
    for (const line of this.operationLines) line.draw(this.host.r2d, basis);
    if (this.advantage.visible) this.advantageText.draw(this.host.r2d, basis);
    this.host.end();
  }

  setPreviewConnected(connected: boolean, textureKey: string): void {
    this.base.setTexture('pos_play/P_pict_01', 1, textureKey);
    this.base.setVisible('pos_play/P_pict_01', connected);
  }

}
