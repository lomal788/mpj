import { blankDocument, type EditorDocument } from "../../editor/document";
import {
  partEntity,
  type PartEntry,
  type Renderer,
  type RenderItem,
} from "./schema";
import { expandItems } from "./data";

export function partDocument(part: PartEntry): EditorDocument {
  const doc = blankDocument(),
    entity = partEntity(part);
  doc.id = part.layout;
  doc.title = part.layout;
  doc.tool = "ui-builder";
  entity.props.interactive = part.animations.some(
    (a) => a.tag === "on" || a.tag === "press",
  );
  doc.entities = [entity];
  doc.settings = {
    input: { wrap: false, players: 1 },
    preview: { fit: true, exitOnDecide: false },
  };
  return doc;
}
export function presentationItems(
  doc: EditorDocument,
  renderer: Renderer,
): RenderItem[] {
  const items = expandItems(doc);
  renderer.draw(items);
  if (
    !(doc.settings.preview as Record<string, unknown>)?.fit ||
    items.length !== 1
  )
    return items;
  const bounds = renderer.bounds?.(items[0]);
  if (!bounds) return items;
  const scale = Math.min(
    1760 / Math.max(1, bounds.width),
    920 / Math.max(1, bounds.height),
    4,
  );
  return [{ ...items[0], x: -bounds.x * scale, y: -bounds.y * scale, scale }];
}
