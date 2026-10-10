import {
  blankDocument,
  validateDocument,
  type EditorDocument,
  type Entity,
} from "./document";
export type Listener = () => void;
export class EditorStore {
  document = blankDocument();
  selection: string[] = [];
  preview = false;
  dirty = false;
  private past: EditorDocument[] = [];
  private future: EditorDocument[] = [];
  private listeners = new Set<Listener>();
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners) fn();
  }
  execute(label: string, change: (draft: EditorDocument) => void) {
    const draft = structuredClone(this.document);
    change(draft);
    validateDocument(draft);
    this.past.push(this.document);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.document = draft;
    this.dirty = true;
    this.emit();
  }
  load(doc: unknown) {
    this.document = validateDocument(doc);
    this.past = [];
    this.future = [];
    this.selection = [];
    this.preview = false;
    this.dirty = false;
    this.emit();
  }
  undo() {
    const d = this.past.pop();
    if (d) {
      this.future.push(this.document);
      this.document = d;
      this.selection = this.selection.filter((id) =>
        d.entities.some((n) => n.id === id),
      );
      this.dirty = true;
      this.emit();
    }
  }
  redo() {
    const d = this.future.pop();
    if (d) {
      this.past.push(this.document);
      this.document = d;
      this.dirty = true;
      this.emit();
    }
  }
  select(id: string, add = false) {
    this.selection = add
      ? this.selection.includes(id)
        ? this.selection.filter((x) => x !== id)
        : [...this.selection, id]
      : [id];
    this.emit();
  }
  get selected(): Entity | undefined {
    return this.document.entities.find((n) => n.id === this.selection[0]);
  }
  update(id: string, change: (node: Entity) => void) {
    this.execute("속성 변경", (d) => {
      const n = d.entities.find((n) => n.id === id);
      if (n) change(n);
    });
  }
  remove() {
    this.execute("삭제", (d) => {
      const ids = new Set(this.selection);
      let more = true;
      while (more) {
        more = false;
        for (const n of d.entities)
          if (n.parent && ids.has(n.parent) && !ids.has(n.id)) {
            ids.add(n.id);
            more = true;
          }
      }
      d.entities = d.entities.filter((n) => !ids.has(n.id));
    });
    this.selection = [];
    this.emit();
  }
}
