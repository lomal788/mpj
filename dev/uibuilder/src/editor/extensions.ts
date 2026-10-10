import type { EditorStore } from "./store";
export interface EditorContext {
  store: EditorStore;
  notify: (message: string) => void;
}
export interface Panel {
  id: string;
  title: string;
  area: "left" | "center" | "right" | "bottom";
  mount: (host: HTMLElement, ctx: EditorContext) => void | (() => void);
}
export interface Tool {
  id: string;
  label: string;
  run: (ctx: EditorContext) => void | Promise<void>;
}
export interface Extension {
  id: string;
  activate: (api: ExtensionRegistry) => void;
}
export class ExtensionRegistry {
  private plugins = new Set<string>();
  panels: Panel[] = [];
  tools: Tool[] = [];
  register(extension: Extension) {
    if (this.plugins.has(extension.id))
      throw Error(`중복 확장: ${extension.id}`);
    this.plugins.add(extension.id);
    extension.activate(this);
  }
  panel(panel: Panel) {
    if (this.panels.some((x) => x.id === panel.id))
      throw Error(`중복 패널: ${panel.id}`);
    this.panels.push(panel);
  }
  tool(tool: Tool) {
    if (this.tools.some((x) => x.id === tool.id))
      throw Error(`중복 명령: ${tool.id}`);
    this.tools.push(tool);
  }
}
