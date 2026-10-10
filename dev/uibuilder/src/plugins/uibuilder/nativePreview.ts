import type { EditorDocument } from "../../editor/document";
import type { AppServices } from "./actions";
import type { PreviewInput } from "./preview";
export interface NativeTarget { id: string; name: string; x: number; y: number; width: number; height: number; focused?: boolean }
export interface NativeSession {
  tick(): void; draw(): void; dispose(): void;
  decide(pid: number): void; cancel(pid: number): void; focus(id: string, pid: number): void | boolean; random(pid: number): void;
  readonly status: string; readonly result: string; readonly targets: NativeTarget[];
}
export type NativePreviewFactory = (doc: EditorDocument, canvas: HTMLCanvasElement, input: PreviewInput, app: AppServices) => Promise<NativeSession>;
