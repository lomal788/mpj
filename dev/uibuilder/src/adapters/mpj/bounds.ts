import { nodeMatrix, rectOf } from "@app/scene/menu/charselect/render2d";
import type { LayoutInst } from "@app/scene/menu/charselect/scene2d";
/** Visible graphic bounds, distinct from RootPane / maxPartsSize. */
export function layoutBounds(root: LayoutInst) {
  let left = Infinity,
    right = -Infinity,
    top = -Infinity,
    bottom = Infinity;
  function visit(inst: LayoutInst, prefix: string, ancestorVisible: boolean) {
    for (const n of inst.nodes) {
      let v = n.v && ancestorVisible;
      for (let p = n.spec.p; p >= 0; p = inst.nodes[p].spec.p)
        v = v && inst.nodes[p].v;
      if (!v || n.a === 0) continue;
      const path = prefix + n.spec.n;
      const part = inst.parts.get(inst.byName.get(n.spec.n)!);
      if (part) visit(part, path + "/", v);
      if (!["pic", "txt", "wnd"].includes(n.spec.k)) continue;
      const m = nodeMatrix(root, path);
      if (!m) continue;
      const [l, b, r, t] = rectOf(n.spec.o, n.z[0], n.z[1]);
      for (const [x, y] of [
        [l, b],
        [l, t],
        [r, b],
        [r, t],
      ]) {
        const wx = m[0] * x + m[1] * y + m[2],
          wy = m[3] * x + m[4] * y + m[5];
        left = Math.min(left, wx);
        right = Math.max(right, wx);
        bottom = Math.min(bottom, wy);
        top = Math.max(top, wy);
      }
    }
  }
  visit(root, "", true);
  return Number.isFinite(left)
    ? {
        x: (left + right) / 2,
        y: (bottom + top) / 2,
        width: right - left,
        height: top - bottom,
      }
    : null;
}
