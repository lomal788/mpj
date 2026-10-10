import type { EditorDocument } from "../../editor/document";
import type { BuilderServices } from "./services";
import { presentationItems } from "./presentation";

/** One renderer for all visible cards; never create a WebGL context per list entry. */
export function createThumbnails(services: BuilderServices) {
  const canvas = document.createElement("canvas");
  const renderer = services.createRenderer(canvas);
  const cache = new Map<string, string>();
  let queue = Promise.resolve(),
    disposed = false;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target as HTMLImageElement;
        observer.unobserve(img);
        const job = jobs.get(img);
        if (!job) continue;
        queue = queue
          .then(async () => {
            if (disposed || !img.isConnected) return;
            let url = cache.get(job.key);
            if (!url) {
              await renderer.prepare(job.doc);
              if (disposed) return;
              const items = presentationItems(job.doc, renderer);
              renderer.draw(items);
              const small = document.createElement("canvas");
              small.width = 320;
              small.height = 180;
              small.getContext("2d")!.drawImage(canvas, 0, 0, 320, 180);
              url = small.toDataURL("image/webp", 0.8);
              cache.set(job.key, url);
            }
            if (img.isConnected) {
              img.src = url;
              img.classList.add("loaded");
              img.alt = img.alt.replace(" 준비 중", "");
            }
          })
          .catch((e) => {
            if (img.isConnected)
              img.alt = `미리보기 준비 실패: ${String(e.message)}`;
          });
      }
    },
    { rootMargin: "100px" },
  );
  const jobs = new WeakMap<
    HTMLImageElement,
    { key: string; doc: EditorDocument }
  >();
  return {
    observe(img: HTMLImageElement, key: string, doc: EditorDocument) {
      const cached = cache.get(key);
      if (cached) {
        img.src = cached;
        img.classList.add("loaded");
              img.alt = img.alt.replace(" 준비 중", "");
        return;
      }
      jobs.set(img, { key, doc });
      observer.observe(img);
    },
    clear() {
      observer.disconnect();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      void queue.finally(() => renderer.dispose());
      cache.clear();
    },
  };
}
