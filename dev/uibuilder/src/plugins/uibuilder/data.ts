import type { EditorDocument } from "../../editor/document";
import { worldTransform } from "../../editor/document";
import { props, type RenderItem } from "./schema";
export const readField = (
  object: Record<string, unknown>,
  field: string,
): unknown =>
  field
    .split(".")
    .reduce<unknown>(
      (v, key) =>
        v && typeof v === "object" && Object.hasOwn(v, key)
          ? (v as Record<string, unknown>)[key]
          : undefined,
      object,
    );
export function expandItems(doc: EditorDocument): RenderItem[] {
  const sets =
      (doc.settings.datasets as Record<string, Record<string, unknown>[]>) ??
      {},
    out: RenderItem[] = [];
  const visible = (id: string): boolean => {
    const n = doc.entities.find((x) => x.id === id);
    return !!n && n.visible && (!n.parent || visible(n.parent));
  };
  for (const entity of doc.entities) {
    if (!visible(entity.id) || entity.type === "ui.group") continue;
    const p = props(entity),
      t = worldTransform(doc, entity);
    let rows = p.dataset ? (sets[p.dataset] ?? []) : [{}];
    if (p.filter)
      rows = rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v).toLowerCase().includes(p.filter!.toLowerCase()),
        ),
      );
    if (p.sort)
      rows = [...rows].sort((a, b) =>
        String(readField(a, p.sort!)).localeCompare(
          String(readField(b, p.sort!)),
        ),
      );
    const cols = Math.max(1, p.columns ?? 1);
    rows.forEach((data, index) => {
      const col = index % cols,
        row = Math.floor(index / cols),
        dx = col * (p.gapX ?? entity.transform.width) * t.scale,
        dy = -row * (p.gapY ?? entity.transform.height) * t.scale,
        r = (t.rotation * Math.PI) / 180;
      out.push({
        id: p.dataset ? `${entity.id}:${index}` : entity.id,
        entity,
        x: Math.fround(t.x + dx * Math.cos(r) - dy * Math.sin(r)),
        y: Math.fround(t.y + dx * Math.sin(r) + dy * Math.cos(r)),
        scale: Math.fround(t.scale),
        rotation: t.rotation,
        data,
        row,
        col,
      });
    });
  }
  return out;
}
