/**
 * 공용 레이아웃(ComUiMinigameModeLayoutCommon) + 항목 레이아웃 제약(SetConstraint) — docs/shell/mgm_common.md 6.7.
 * 제약: 루트 = 제약 페인 전역 행렬 × 자기 루트 SRT, 알파 = 자기 × 페인 전역 알파/255, owner 레이아웃이 안 보이면 그리지 않는다.
 */
import { nodeMatrix, type Render2D } from '@app/common/ui/layout/render';
import type { LayoutInst } from '@game/lib/layout';

export type Mat3 = [number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0];

export const mul = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3],
  a[0] * b[1] + a[1] * b[4],
  a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3],
  a[3] * b[1] + a[4] * b[4],
  a[3] * b[2] + a[4] * b[5] + a[5],
];

/**
 * 페인(부품 경로 'a/b')의 레이아웃 루트 기준 전역 행렬·전역 알파·보임. 알파 전파는 render2d 와 같다
 * (노드 알파 = 들어온 알파 × a/255, 자식으로는 ia 면 그 값 아니면 들어온 알파; 부품 루트로는 부품 노드의 전파값)
 */
export function paneGlobal(root: LayoutInst, path: string): { m: Mat3; alpha: number; visible: boolean } | null {
  const m = nodeMatrix(root, path) as Mat3 | null;
  if (!m) return null;
  const segs = path.split('/');
  let inst: LayoutInst = root;
  let incoming = 255;
  let visible = root.visible;
  for (let si = 0; si < segs.length; si++) {
    const j = inst.byName.get(segs[si]);
    if (j === undefined) return null;
    const chain: number[] = [];
    for (let k: number = j; k >= 0; k = inst.nodes[k].spec.p) chain.unshift(k);
    let a = incoming;
    let my = a;
    for (const k of chain) {
      const n = inst.nodes[k];
      visible &&= n.v;
      my = (a * n.a) / 255;
      if (k !== j) a = n.spec.ia ? my : a;
    }
    if (si === segs.length - 1) return { m, alpha: my, visible };
    const p = inst.parts.get(j);
    if (!p) return null;
    incoming = inst.nodes[j].spec.ia ? my : a;
    visible &&= p.visible;
    inst = p;
  }
  return null;
}

/** 제약 대상(공용 창) */
export interface ConstraintOwner {
  readonly inst: LayoutInst;
  /** 창이 그려질 때의 화면 기준 행렬(기본 단위 행렬) */
  readonly base: Mat3;
  isVisible(): boolean;
}

export class MgmLayout {
  constraint: { owner: ConstraintOwner; pane: string } | null = null;

  constructor(readonly inst: LayoutInst) {}

  get visible(): boolean {
    return this.inst.visible;
  }

  set visible(v: boolean) {
    this.inst.visible = v;
  }

  play(tag: string | null, next?: string | null): void {
    if (tag) this.inst.play(tag, next ?? undefined);
  }

  /** IsEndAnimation */
  isEnd(): boolean {
    return this.inst.done;
  }

  update(): void {
    this.inst.update(1);
  }

  setConstraint(owner: ConstraintOwner, pane: string): void {
    this.constraint = { owner, pane };
  }

  removeConstraint(): void {
    this.constraint = null;
  }

  /** 그릴 행렬·알파(제약이면 owner 페인 기준), 그리지 않으면 null */
  placement(base: Mat3 = IDENTITY): { m: Mat3; alpha: number } | null {
    if (!this.inst.visible) return null;
    const c = this.constraint;
    if (!c) return { m: base, alpha: 255 };
    if (!c.owner.isVisible() || !c.owner.inst.visible) return null;
    const g = paneGlobal(c.owner.inst, c.pane);
    if (!g) return null;
    return { m: mul(c.owner.base, g.m), alpha: g.alpha };
  }

  draw(r2d: Render2D, base: Mat3 = IDENTITY): void {
    const p = this.placement(base);
    if (p) r2d.draw(this.inst, p.m, p.alpha);
  }
}
