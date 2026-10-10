import { ActorContactRegistry, ActorParams, emptyActorHit, type ActorHit, type Ref, type V3 } from '@game/lib/actor';
import { ActorCollisionAdapter, ActorCollisionBinding } from '@game/lib/actor-collision';
import { CollisionWorld, type CollisionShapeDesc, type Pose } from '@game/lib/collision';
import { PhysxCollisionBackend } from '@game/lib/collision-physx';
import type { Physx } from '@game/lib/physx';

export const PLAZA_MAP_MASK = 4;
export const firstAcceptedApprox = (_hits: readonly ActorHit[], count: number): number => count ? 0 : -1;
export type PlazaCollisionKey = 'CollisionMain' | 'CollisionFirst';
export interface PlazaPhysicsManifest {
  format: string;
  entities: { name: string; apx: string; layer: number | null; pos: V3; quat: [number, number, number, number]; scale: V3 }[];
}
export class PlazaActorWorld {
  readonly backend: PhysxCollisionBackend;
  readonly world: CollisionWorld;
  readonly registry: ActorContactRegistry;
  readonly adapter: ActorCollisionAdapter;
  private readonly entities = new Map<number, number>();
  private readonly maps = new Map<string, number[]>();
  private readonly bindings = new Set<ActorCollisionBinding>();
  private readonly meshes = new Set<number>();
  private nextEntity = 0;
  private closed = false;
  constructor(readonly px: Physx, readonly paramRows: readonly (readonly number[])[]) {
    new ActorParams(paramRows);
    this.backend = new PhysxCollisionBackend(px);
    this.world = new CollisionWorld(this.backend);
    this.registry = new ActorContactRegistry(ref => this.entities.get(ref.index) === ref.generation);
    this.adapter = new ActorCollisionAdapter(this.world, { registry: this.registry, selectGround: firstAcceptedApprox,
      resolveGroundKey: () => null, fallbackGroundKey: null, pairFallback: null }, {
      sweepMtd: true,
      mapCandidate: shape => shape.geometry.kind === 'capsule' ? { ...shape.geometry, halfHeight: Math.fround(shape.geometry.halfHeight * 4) } : undefined,
    });
  }
  private entity(): Ref {
    if (this.closed) throw new Error('Plaza actor world is disposed');
    const ref = { index: ++this.nextEntity, generation: 1 }; this.entities.set(ref.index, ref.generation); return ref;
  }
  addMap(key: string, shapes: CollisionShapeDesc[], pose: Pose = [0, 0, 0, 0, 0, 0, 1], staged = true): number {
    const entity = this.entity();
    try {
      const body = this.world.createBody({ entity, motion: 0, pose, shapes, staged });
      const bodies = this.maps.get(key) ?? []; bodies.push(body); this.maps.set(key, bodies); return body;
    } catch (error) { this.entities.delete(entity.index); throw error; }
  }
  addApx(key: string, bytes: Uint8Array, pose: Pose, layer: number, staged: boolean): number {
    const loaded = this.backend.loadApx(bytes, layer, key);
    loaded.meshes.forEach(mesh => this.meshes.add(mesh));
    return this.addMap(key, loaded.shapes, pose, staged);
  }
  createBinding(): ActorCollisionBinding {
    const entity = this.entity();
    const binding = new ActorCollisionBinding(this.adapter, { entity, position: [0, 0, 0], rotation: [0, 0, 0, 1],
      poseEpoch: 0, modelMask: 1, enabled: true, overrideCollision: false });
    this.bindings.add(binding);
    binding.onDispose(() => { this.bindings.delete(binding); this.entities.delete(entity.index); });
    return binding;
  }
  setEnabled(key: PlazaCollisionKey, enabled: boolean): void {
    if (this.closed) return;
    for (const body of this.maps.get(key) ?? []) { if (enabled) this.world.stage(body); else this.world.unstage(body); }
    this.adapter.invalidate();
  }
  ground(position: V3, distance: number, exclude: Ref): ActorHit | null {
    const hit = emptyActorHit();
    return this.adapter.ray(position, [0, -1, 0], distance, PLAZA_MAP_MASK, exclude, hit) && hit.validity === 0 && hit.normal[1] >= Math.fround(.707) ? hit : null;
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    try { for (const binding of [...this.bindings]) binding.dispose(); }
    finally {
      this.world.dispose(); this.backend.dispose();
      for (const mesh of this.meshes) this.px.x.px_mesh_release(mesh);
      this.meshes.clear(); this.entities.clear(); this.maps.clear();
    }
  }
}
export async function loadPlazaActorWorld(url: (path: string) => string): Promise<PlazaActorWorld> {
  const json = async <T>(path: string): Promise<T> => {
    const response = await fetch(url(path));
    if (!response.ok) throw new Error(`Plaza actor asset ${path}: ${response.status}`);
    return response.json() as Promise<T>;
  };
  const [manifest, params, loader] = await Promise.all([
    json<PlazaPhysicsManifest>('physics/physics.json'), json<{ ActorParam: number[][] }>('../player/actorparam.json'),
    import('@app/common/actor/physx'),
  ]);
  if (manifest.format !== 'mpj.physics') throw new Error('Invalid plaza physics manifest');
  const world = new PlazaActorWorld(await loader.createActorPhysx(), params.ActorParam);
  try {
    for (const entry of manifest.entities) {
      const key = entry.name === 'menu00_central_plaza_col' ? 'CollisionMain' : entry.name === 'menu00_start_ev_col' ? 'CollisionFirst' : null;
      if (!key || entry.scale.some(x => x !== 1) || entry.layer === null) throw new Error(`Unsupported plaza collision entry: ${entry.name}`);
      const response = await fetch(url(`physics/${entry.apx}`));
      if (!response.ok) throw new Error(`Plaza collision APX: ${response.status}`);
      world.addApx(key, new Uint8Array(await response.arrayBuffer()), [...entry.pos, ...entry.quat], entry.layer, key === 'CollisionMain');
    }
    return world;
  } catch (error) { world.dispose(); throw error; }
}
