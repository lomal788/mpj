import type { AppServices } from "../../plugins/uibuilder/actions";
import type { EditorContext } from "../../editor/extensions";
/** Sandbox services: app call/return is logged, never starts a real game. */
export function previewServices(ctx: EditorContext): AppServices {
  let audio: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const active = new Set<AudioBufferSourceNode>();
  let disposed = false;
  const sounds = fetch("/api/library/common")
    .then((r) => r.json())
    .then((s) => s.sounds as Record<string, { file: string; gain: number }>);
  const log = (kind: string, data: unknown) =>
    window.dispatchEvent(
      new CustomEvent("builder-event", { detail: { kind, data } }),
    );
  return {
    sound(label) {
      log("sound", label);
      if (disposed) return;
      audio ??= new AudioContext();
      void (async () => {
        await audio!.resume();
        const entry = (await sounds)[label];
        if (!entry?.file) {
          ctx.notify(`소리 파일 미확인: ${label}`);
          return;
        }
        let buffer = buffers.get(label);
        if (!buffer) {
          const url = new URL(
            entry.file,
            `${location.origin}/assets/mgmcommon/`,
          ).href;
          const response = await fetch(url);
          if (!response.ok) throw Error(`파일 없음 ${label}`);
          buffer = await audio!.decodeAudioData(await response.arrayBuffer());
          buffers.set(label, buffer);
        }
        if (disposed) return;
        const source = audio!.createBufferSource(),
          gain = audio!.createGain();
        gain.gain.value = entry.gain;
        source.buffer = buffer;
        source.connect(gain).connect(audio!.destination);
        active.add(source);
        source.onended = () => active.delete(source);
        source.start();
      })().catch((e) => ctx.notify(`소리: ${e.message}`));
    },
    vibrate(pid, name) {
      log("vibrate", { pid, name });
    },
    work(key, value) {
      log("work", { key, value });
    },
    call(id, payload) {
      log("call", { id, payload });
    },
    return(result) {
      log("return", result);
    },
    dispose() {
      disposed = true;
      for (const source of active) source.stop();
      active.clear();
      buffers.clear();
      void audio?.close();
    },
  };
}
