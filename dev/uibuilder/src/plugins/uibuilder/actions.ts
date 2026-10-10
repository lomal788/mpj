import { props, type RenderItem } from "./schema";
import type { ScreenEvent } from "../../engine/screen/core";
export interface AppServices {
  sound(label: string): void;
  vibrate(pid: number, name: string): void;
  work(key: string, value: unknown): void;
  call(id: string, payload: unknown): void;
  return(result: unknown): void;
  dispose?(): void;
}
export function dispatchActions(
  event: ScreenEvent,
  items: RenderItem[],
  services: AppServices,
) {
  const n = items.find((x) => x.id === event.id);
  if (!n) return;
  for (const a of props(n.entity).actions ?? []) {
    if (a.event !== event.type) continue;
    const value = a.value === "$item" ? n.data : a.value;
    if (a.kind === "sound") services.sound(a.target);
    if (a.kind === "vibrate") services.vibrate(event.pid, a.target);
    if (a.kind === "work") services.work(a.target, value);
    if (a.kind === "call")
      services.call(a.target, { value, item: n.data, pid: event.pid });
    if (a.kind === "return") services.return(value ?? n.data);
  }
}
