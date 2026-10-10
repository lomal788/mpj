import type { Entity, EditorDocument } from "../../editor/document";
export interface PaneInfo {
  name: string;
  kind: string;
  size: number[];
  material?: number;
  text?: string;
  visible?: boolean;
  textureSlots: { slot: number; name: string }[];
}
export interface PartEntry {
  id: string;
  source: string;
  layout: string;
  file: string;
  size: number[];
  readonly: boolean;
  category: string;
  panes: PaneInfo[];
  animations: { tag: string; frames: number; loop: boolean }[];
}
export interface Catalog {
  entries: PartEntry[];
  raw: {
    id: string;
    layout: string;
    line: number;
    readonly: boolean;
    description: string;
  }[];
}
export interface Binding {
  pane: string;
  kind: "text" | "image" | "visible" | "color";
  field?: string;
  value?: string;
  slot?: number;
}
export interface Action {
  event: "focus" | "decide" | "cancel";
  kind: "sound" | "vibrate" | "work" | "call" | "return";
  target: string;
  value?: string;
}
export interface UIProps extends Record<string, unknown> {
  part?: string;
  animation?: string;
  bindings?: Binding[];
  actions?: Action[];
  dataset?: string;
  columns?: number;
  gapX?: number;
  gapY?: number;
  owner?: number;
  interactive?: boolean;
  disabled?: boolean;
  sceneService?: string;
  filter?: string;
  sort?: string;
  group?: string;
  animationMode?: "initial" | "persistent";
}
export const props = (n: Entity) => n.props as UIProps;
export function createEntity(
  type: string,
  name: string,
  width = 520,
  height = 130,
): Entity {
  return {
    id: crypto.randomUUID(),
    type,
    name,
    parent: null,
    visible: true,
    locked: false,
    transform: { x: 0, y: 0, width, height, scale: 1, rotation: 0 },
    props: {},
  };
}
export function partEntity(part: PartEntry): Entity {
  const n = createEntity("ui.part", part.layout, part.size[0], part.size[1]);
  n.props = {
    part: part.id,
    bindings: [],
    actions: [],
    interactive:
      part.category === "버튼" &&
      part.animations.some((a) => a.tag === "on" || a.tag === "press"),
    owner: 0,
    animationMode: "initial",
  };
  return n;
}
export interface RenderItem {
  id: string;
  entity: Entity;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  data: Record<string, unknown>;
  row: number;
  col: number;
}
export interface Renderer {
  prepare(doc: EditorDocument): Promise<void>;
  draw(items: RenderItem[]): void;
  tick(): void;
  play(id: string, tag: string, next?: string): void;
  animation?(id: string, tag: string): { frames: number; loop: boolean } | null;
  reset?(): void;
  dispose(): void;
  warnings(): string[];
  bounds?(
    item: RenderItem,
  ): { x: number; y: number; width: number; height: number } | null;
}
