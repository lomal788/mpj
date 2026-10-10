import type { Extension } from "../../editor/extensions";
import type { BuilderServices } from "./services";
import { mountLibrary } from "./panels/library";
import { mountHierarchy } from "./panels/hierarchy";
import { mountInspector } from "./panels/inspector";
import { mountData } from "./panels/data";
import { mountStage } from "./panels/stage";
import { saveProject, openProject, exportProject } from "./persistence";
import { showPreview } from "./previewDialog";
export function uiBuilder(services: BuilderServices): Extension {
  return {
    id: "mpj.ui-builder",
    activate(api) {
      api.tool({ id: "save", label: "저장", run: saveProject });
      api.tool({ id: "open", label: "열기", run: openProject });
      api.tool({ id: "export", label: "JSON 내보내기", run: exportProject });
      api.tool({
        id: "preview",
        label: "▶ 편집 / 미리보기",
        run: (ctx) => {
          showPreview(ctx.store.document, ctx, services);
        },
      });
      api.panel({
        id: "library",
        title: "원본 부품",
        area: "left",
        mount: (host, ctx) => mountLibrary(host, ctx, services),
      });
      api.panel({
        id: "hierarchy",
        title: "화면 계층",
        area: "left",
        mount: mountHierarchy,
      });
      api.panel({
        id: "stage",
        title: "화면 캔버스",
        area: "center",
        mount: (host, ctx) => mountStage(host, ctx, services),
      });
      api.panel({
        id: "inspector",
        title: "속성 · 연결",
        area: "right",
        mount: (host, ctx) => mountInspector(host, ctx, services),
      });
      api.panel({
        id: "data",
        title: "데이터 · 동작 · 입력",
        area: "bottom",
        mount: mountData,
      });
    },
  };
}
