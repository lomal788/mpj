/**
 * 광장 장면 실행기 — 무대(world) 를 만들고 PlazaContext 를 꾸려 PLAZA_PARTS 를 붙인 뒤, 페이지가 부르는 step/render 로 돌린다.
 * 카메라: stage3d 슬롯(anim > follow) 이 잡지 않은 프레임은 char_start_pos 뒤 고정 시점 [설계: B 의 추종 카메라 전 자리].
 * 앱 수명 렌더러(docs/engine/loader_manager.md §14): gpu 를 받으면 무대가 그 렌더러를 쓰고, world 를 받으면(앞 화면에서 미리 만든 것) 새로 만들지 않는다.
 */
import * as THREE from 'three';
import { PLAY_BUDGET_MS, type AssetSource, type StageGpu, type StageLoader } from '@app/common/render3d';
import { PLAZA_PARTS } from './parts';
import type { PlazaActor, PlazaContext, PlazaExit, PlazaPad, PlazaPart, PlazaPlayerSetup, PlazaOnlineFactory, PlazaSave, PlazaSound, PlazaWorld } from './types';
import { createPlazaWorld } from './world';
import type { PlazaDecoState } from './types';

/**
 * 원본 60 fps 고정 스텝 시계 — 지난 실시간(ms)을 원본 프레임 수로 바꾼다. 한 번에 최대 MAX_STEPS 까지만 따라잡고 넘친 밀림은 버린다
 * (긴 멈춤 뒤 여러 프레임 동안 빨리 감기처럼 도는 것을 막음 — app/flow 의 MAX_BACKLOG 와 같은 규칙) [설계].
 */
export class FixedClock {
  static readonly STEP_MS = 1000 / 60;
  static readonly MAX_STEPS = 4;
  acc = 0;
  advance(elapsedMs: number): number {
    this.acc += Math.max(0, elapsedMs);
    let n = Math.floor((this.acc + 1e-6) / FixedClock.STEP_MS);
    this.acc -= n * FixedClock.STEP_MS;
    if (n > FixedClock.MAX_STEPS) n = FixedClock.MAX_STEPS;
    return n;
  }
}

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
  save?: PlazaSave;
  online?: PlazaOnlineFactory;
  params: URLSearchParams;
  deco?: Partial<PlazaDecoState>;
  onExit(e: PlazaExit): void;
  onProgress?(n: number, total: number, what: string): void;
  /** 로더 관리자(docs/engine/loader_manager.md §11.4). 없으면 지금처럼 전부 읽고 시작 */
  loader?: StageLoader;
  /** glb 안 텍스처도 관리자를 지남(압축 모드) */
  gltfTextures?: boolean;
  gpu?: StageGpu;
  world?: Promise<PlazaWorld>;
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
  const world = o.world ? await o.world : await createPlazaWorld({
    canvas: o.canvas,
    gpu: o.gpu,
    assets: o.worldAssets,
    deco: o.deco,
    onProgress: o.onProgress,
    loader: o.loader,
    loadMode: o.params.get('loader') === 'seq' ? 'seq' : 'staged',
    gltfTextures: o.gltfTextures,
  });
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
    save: o.save,
    online: o.online,
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
  const warm = o.params.get('nowarm') === '1' ? null : await stage.warmup();
  stage.budget(PLAY_BUDGET_MS);
  const me = actors.find((x) => x.kind === 'input');
  if (me) world.setFocus?.(me.pos);
  world.startBackground?.();
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
        warmup: warm,
        loader: world.loaderDebug?.() ?? null,
        unprepared: stage.unpreparedVisible(),
        prep: stage.preparer.stats,
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
