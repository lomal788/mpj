import type { Catalog, Renderer } from "./schema";
import type { EditorContext } from "../../editor/extensions";
import type { AppServices } from "./actions";
import type { PreviewInput } from "./preview";
export interface BuilderServices {
  createNativePreview?: import("./nativePreview").NativePreviewFactory;
  catalog: Catalog;
  createRenderer(canvas: HTMLCanvasElement): Renderer;
  createPreviewServices(ctx: EditorContext): AppServices;
  createInput(target?: HTMLElement, keyboardOwner?: () => number): PreviewInput;
}
