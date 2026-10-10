import type { LayoutInst } from "@app/scene/menu/charselect/scene2d";
/** Same conversion correction used by OnlineView: split window pieces precede their content. */
export function windowFramesFirst(inst: LayoutInst) {
  for (const node of inst.nodes) {
    const frame = (i: number) => inst.nodes[i].spec.n.includes("#");
    node.children = [
      ...node.children.filter(frame),
      ...node.children.filter((i) => !frame(i)),
    ];
  }
  for (const part of inst.parts.values()) windowFramesFirst(part);
}
