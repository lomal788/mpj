import "./styles.css";
import { nativePreview } from "./adapters/mpj/nativePreview";
import { EditorStore } from "./editor/store";
import { ExtensionRegistry } from "./editor/extensions";
import { mountEditor } from "./editor/shell";
import { MpjLibrary } from "./adapters/mpj/library";
import { MpjRenderer } from "./adapters/mpj/renderer";
import { previewServices } from "./adapters/mpj/previewServices";
import { PreviewInput } from "./adapters/browser/input";
import { uiBuilder } from "./plugins/uibuilder/plugin";
import { makeTemplate } from "./plugins/uibuilder/templates";
const root = document.querySelector<HTMLElement>("#editor")!;
try {
  const library = new MpjLibrary(),
    catalog = await library.load();
  const store = new EditorStore(),
    registry = new ExtensionRegistry();
  registry.register(
    uiBuilder({
      catalog,
      createNativePreview: nativePreview,
      createRenderer: (canvas) => new MpjRenderer(canvas, library),
      createPreviewServices: previewServices,
      createInput: (target, keyboardOwner) =>
        new PreviewInput(target, keyboardOwner),
    }),
  );
  const dispose = mountEditor(
    root,
    registry,
    {
      store,
      notify: (message) =>
        window.dispatchEvent(
          new CustomEvent("editor-notify", { detail: message }),
        ),
    },
    "UI Builder",
  );
  store.load(makeTemplate("select-menu", catalog));
  window.addEventListener("pagehide", dispose, { once: true });
} catch (e) {
  root.textContent = `편집기를 시작하지 못했습니다: ${String(e)}`;
}
