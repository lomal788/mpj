/**
 * 충돌 런타임 mpj 연결 — physx.wasm 받기(번들 해시 이름, esbuild file 로더) → Physx → PhysxCollisionBackend → CollisionWorld,
 * 충돌 에셋(physics.json + apx/*.apx, tools/analysis/collision_apx.py) → 몸체 등록. 설계: docs/engine/11_moving_collision.md §9.
 * 소비자(광장·미니게임)는 아직 이 모듈을 쓰지 않는다(다음 작업에서 포트로 연결).
 */
import physxWasmUrl from '@game/lib/physx/physx.wasm';
import { createPhysx, type Physx } from '@game/lib/physx';
import { CollisionWorld, type CollisionRules, type Pose } from '@game/lib/collision';
import { PhysxCollisionBackend } from '@game/lib/collision-physx';
import type { Assets } from './assets';

/** physics.json 엔티티(collision_apx.py) */
export interface PhysicsEntity {
  nbmap: string;
  name: string;
  tag: string | null;
  attr: number[];
  /** attr[1] − 2 [추정], 없으면 null */
  layer: number | null;
  pos: [number, number, number];
  quat: [number, number, number, number];
  scale: [number, number, number];
  apx: string;
}
export interface PhysicsSet {
  format: 'mpj.physics';
  version: number;
  archive: string;
  entities: PhysicsEntity[];
}

let shared: Promise<Physx> | null = null;

/** physx.wasm 한 번만 받아 초기화(앱 공용) */
export function appPhysx(): Promise<Physx> {
  shared ??= (async () => {
    const r = await fetch(new URL(physxWasmUrl, import.meta.url));
    if (!r.ok) throw new Error(`physx.wasm 을 읽지 못했다 (${r.status})`);
    return createPhysx(await r.arrayBuffer());
  })();
  return shared;
}

export interface MpjCollision {
  px: Physx;
  backend: PhysxCollisionBackend;
  world: CollisionWorld;
  dispose(): void;
}

/** 씬(PxScene) 하나 + 충돌 코어 */
export async function createMpjCollision(rules?: CollisionRules): Promise<MpjCollision> {
  const px = await appPhysx();
  const backend = new PhysxCollisionBackend(px);
  const world = new CollisionWorld(backend, rules);
  return {
    px, backend, world,
    dispose() {
      world.dispose();
      backend.dispose();
    },
  };
}

export interface LoadedEntity {
  entity: PhysicsEntity;
  body: number;
  shapes: number[];
}

/**
 * 충돌 에셋 한 벌(assets 기준 dir/physics.json) → 엔티티마다 Static 몸체 하나(자세 = nbmap world, 레이어 = 엔티티 layer ?? defaultLayer).
 * 엔티티 핸들은 { index: 순번 + 1, generation: 1 }.
 */
export async function loadPhysicsSet(c: MpjCollision, assets: Assets, dir: string, defaultLayer = 0): Promise<LoadedEntity[]> {
  const set = await assets.json<PhysicsSet>(`${dir}physics.json`);
  const out: LoadedEntity[] = [];
  let i = 0;
  for (const e of set.entities) {
    const bytes = new Uint8Array(await assets.bytes(`${dir}${e.apx}`));
    const { shapes } = c.backend.loadApx(bytes, e.layer ?? defaultLayer, e.tag ?? e.name);
    const pose: Pose = [e.pos[0], e.pos[1], e.pos[2], e.quat[0], e.quat[1], e.quat[2], e.quat[3]];
    const body = c.world.createBody({ entity: { index: ++i, generation: 1 }, motion: 0, pose, shapes });
    out.push({ entity: e, body, shapes: [...(c.world.bodyInfo(body)?.shapes ?? [])] });
  }
  return out;
}
