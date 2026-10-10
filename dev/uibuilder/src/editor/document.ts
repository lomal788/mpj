/** Portable editor document model: no application or DOM dependency. */
export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
}
export interface Entity {
  id: string;
  type: string;
  name: string;
  parent: string | null;
  visible: boolean;
  locked: boolean;
  transform: Transform;
  props: Record<string, unknown>;
}
export interface EditorDocument {
  format: "mpj-editor-document";
  version: 1;
  id: string;
  title: string;
  tool: string;
  entities: Entity[];
  settings: Record<string, unknown>;
}
export function blankDocument(): EditorDocument {
  return {
    format: "mpj-editor-document",
    version: 1,
    id: "untitled",
    title: "새 문서",
    tool: "document",
    entities: [],
    settings: {},
  };
}
export function validateDocument(value: unknown): EditorDocument {
  const d = value as EditorDocument;
  if (
    !d ||
    d.format !== "mpj-editor-document" ||
    d.version !== 1 ||
    typeof d.tool !== "string" ||
    !Array.isArray(d.entities) ||
    !d.settings ||
    typeof d.title !== "string" ||
    typeof d.id !== "string"
  )
    throw Error("지원하지 않는 문서 형식");
  const ids = new Set<string>();
  for (const n of d.entities) {
    if (
      !n ||
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      typeof n.type !== "string" ||
      typeof n.name !== "string" ||
      !n.transform ||
      !n.props
    )
      throw Error("중복 ID 또는 올바르지 않은 노드");
    ids.add(n.id);
    if (
      !["x", "y", "width", "height", "scale", "rotation"].every(
        (k) =>
          typeof n.transform[k as keyof Transform] === "number" &&
          Number.isFinite(n.transform[k as keyof Transform]),
      ) ||
      n.transform.width < 0 ||
      n.transform.height < 0 ||
      n.transform.scale <= 0
    )
      throw Error("유효하지 않은 배치 값");
  }
  for (const n of d.entities) {
    const seen = new Set([n.id]);
    let p = n.parent;
    while (p) {
      if (seen.has(p)) throw Error("부모 순환");
      seen.add(p);
      const parent = d.entities.find((x) => x.id === p);
      if (!parent) throw Error("없는 부모");
      p = parent.parent;
    }
  }
  return structuredClone(d);
}
export function worldTransform(doc: EditorDocument, node: Entity): Transform {
  if (!node.parent) return { ...node.transform };
  const parent = doc.entities.find((x) => x.id === node.parent);
  if (!parent) return { ...node.transform };
  const p = worldTransform(doc, parent),
    r = (p.rotation * Math.PI) / 180;
  return {
    ...node.transform,
    x:
      p.x +
      (node.transform.x * Math.cos(r) - node.transform.y * Math.sin(r)) *
        p.scale,
    y:
      p.y +
      (node.transform.x * Math.sin(r) + node.transform.y * Math.cos(r)) *
        p.scale,
    scale: p.scale * node.transform.scale,
    rotation: p.rotation + node.transform.rotation,
  };
}
