/**
 * 광장 장면 실행기 — 무대(world) 를 만들고 PlazaContext 를 꾸려 PLAZA_PARTS 를 붙인 뒤, 페이지가 부르는 step/render 로 돌린다.
 * 카메라: stage3d 슬롯(anim > follow) 이 잡지 않은 프레임은 char_start_pos 뒤 고정 시점 [설계: B 의 추종 카메라 전 자리].
 */
import * as THREE from 'three';
import type { AssetSource } from '../stage3d';
import { PLAZA_PARTS } from './parts';
import type { PlazaActor, PlazaContext, PlazaExit, PlazaPad, PlazaPart, PlazaPlayerSetup, PlazaSound, PlazaWorld } from './types';
import { createPlazaWorld } from './world';
import type { PlazaDecoState } from './types';

export interface PlazaRunOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  /** web/assets/plaza/world/ 기준 */
  worldAssets: AssetSource;
  /** web/assets/ 기준 */
  assetUrl(path: string): string;
  players: PlazaPlayerSetup[];
  pad(slot: number): PlazaPad | null;
  sound: PlazaSound;
  params: URLSearchParams;
  deco?: Partial<PlazaDecoState>;
  onExit(e: PlazaExit): void;
  onProgress?(n: number, total: number, what: string): void;
}

export interface PlazaRun {
  readonly world: PlazaWorld;
  readonly ctx: PlazaContext;
  readonly parts: readonly PlazaPart[];
  /** 고정 스텝 한 번(df 원본 프레임) */
  step(df: number): void;
  render(): void;
  resize(w: number, h: number): void;
  debug(): Record<string, unknown>;
  stop(): void;
}

export async function startPlaza(o: PlazaRunOptions): Promise<PlazaRun> {
  const world = await createPlazaWorld({ canvas: o.canvas, assets: o.worldAssets, deco: o.deco, onProgress: o.onProgress });
  const stage = world.stage;
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  let exited = false;
  const actors: PlazaActor[] = [];
  const ctx: PlazaContext = {
    world,
    players: o.players,
    actors,
    pad: o.pad,
    sound: o.sound,
    overlay: o.overlay,
    assetUrl: o.assetUrl,
    params: o.params,
    on(name, fn) {
      let s = listeners.get(name);
      if (!s) listeners.set(name, (s = new Set()));
      s.add(fn);
      return () => s!.delete(fn);
    },
    emit(name, v) {
      for (const fn of listeners.get(name) ?? []) fn(v);
    },
    exit(e) {
      if (exited) return;
      exited = true;
      o.onExit(e);
    },
  };
  const parts: PlazaPart[] = [];
  for (const p of PLAZA_PARTS) parts.push(await p.create(ctx));
  const start = world.socket('char_start_pos');
  const look = start ? start.pos.clone() : new THREE.Vector3(0, -2.4, 22.3);
  const cp = world.cameraParam;
  const a = (cp.MainMenuCameraAngle * Math.PI) / 180;
  const fallbackPos = look.clone().add(new THREE.Vector3(0, cp.MainMenuTargetOffsetY + Math.sin(a) * cp.MainMenuCameraLength, Math.cos(a) * cp.MainMenuCameraLength));
  const fallbackAim = look.clone().add(new THREE.Vector3(0, cp.MainMenuTargetOffsetY, 0));
  const fallback = (): void => {
    const c = stage.camera;
    if (stage.cameraDriven) return;
    c.fov = cp.MainMenuCameraFovy;
    c.position.copy(fallbackPos);
    c.lookAt(fallbackAim);
    c.updateProjectionMatrix();
  };
  fallback();
  return {
    world,
    ctx,
    parts,
    step(df) {
      for (const p of parts) p.update?.(df, stage.frame);
      stage.update(df / 60);
      fallback();
    },
    render() {
      stage.render();
      for (const p of parts) p.afterRender?.();
    },
    resize(w, h) {
      stage.resize(w, h);
      for (const p of parts) p.resize?.(w, h);
    },
    debug() {
      const out: Record<string, unknown> = {
        frame: stage.frame,
        models: stage.loadedModels().length,
        stats: stage.stats,
        graphs: { applied: stage.materials.graphStats.applied.length, missing: stage.materials.graphStats.missing },
        camera: { pos: stage.camera.position.toArray(), fov: stage.camera.fov, driven: stage.cameraDriven },
        actors: actors.map((x) => ({ slot: x.slot, kind: x.kind, chara: x.chara, pos: x.pos.toArray(), yaw: x.yaw, motion: x.motion })),
        parts: {} as Record<string, unknown>,
      };
      for (const p of parts) (out.parts as Record<string, unknown>)[p.name] = p.debug?.();
      return out;
    },
    stop() {
      for (const p of parts) p.dispose?.();
      stage.dispose();
    },
  };
}
