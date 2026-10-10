import {
  F, INVALID_REF, sameRef, v3, v4,
  type ActorCollisionConfig, type ActorCollisionPort, type ActorGeometry, type ActorHit,
  type ActorMapContact, type ActorPairContact, type ActorRegistration, type ActorShape,
  type ActorShapeDesc, type ActorSurface, type Q4, type Ref, type StepStamp, type V3,
} from '../actor';
import {
  CollisionWorld, emptyResult, poseMul, capsuleFromSegment, resolveMapContacts,
  type CollisionGeometry, type CollisionShapeDesc, type MapContact, type Pose, type CastResult,
} from '../collision';

const pose = (p: V3, q: Q4): Pose => [...p, ...q];
const localPose = (s: ActorShapeDesc): Pose => pose(s.center, s.rotation);
const geometryCopy = (g: ActorGeometry): ActorGeometry => g.kind === 'box' ? { ...g, halfExtents: v3(g.halfExtents) } : { ...g };
export function actorCapsuleFromSegment(a: V3, b: V3, radius: number): { geometry: ActorGeometry; center: V3; rotation: Q4 } {
  const s = capsuleFromSegment(a, b, radius);
  return { geometry: s.geometry as ActorGeometry, center: v3(s.local), rotation: v4(s.local.slice(3)) };
}
export function resolveActorMapContacts(contacts: readonly ActorMapContact[], out: V3 = [0, 0, 0]): V3 {
  const mapped: MapContact[] = contacts.filter(c => c.depth > F(.01)).map(c => ({
    body: c.body, entity: c.entity, shape: c.shape, direction: c.direction, depth: c.depth, vector: c.adjusted,
  }));
  return resolveMapContacts(mapped, out);
}
export interface ActorCollisionOptions {
  sweepMtd?: boolean;
  sweepBothSides?: boolean;
  rayBothSides?: boolean;
  mapCandidate?: (shape: Readonly<ActorShape>) => CollisionGeometry | undefined;
}
export class ActorCollisionAdapter implements ActorCollisionPort {
  private phase = '';
  private pairs = new Map<string, ActorPairContact>();
  constructor(readonly world: CollisionWorld, readonly config: ActorCollisionConfig, readonly options: ActorCollisionOptions = {}) {}
  beginPhase(stamp: StepStamp): void {
    const phase = `${stamp.frameId}/${stamp.phase}/${stamp.pass}/${stamp.poseEpoch}`;
    if (phase !== this.phase) { this.phase = phase; this.pairs.clear(); }
  }
  invalidate(): void { this.pairs.clear(); }
  private validShape(shape: ActorShape): boolean {
    const current = this.config.registry.shapeInfo(shape.ref), actor = this.config.registry.actorInfo(shape.actor);
    const body = this.world.bodyInfo(shape.collisionBody), physics = this.world.shapeDesc(shape.collisionShape);
    return !!(current?.enabled && actor?.enabled && body?.staged && physics && physics.enabled !== false
      && this.world.bodyOf(shape.collisionShape) === shape.collisionBody && sameRef(body.entity, shape.owner)
      && current.collisionShape === shape.collisionShape && current.collisionBody === shape.collisionBody
      && sameRef(current.actor, shape.actor) && sameRef(current.owner, shape.owner));
  }
  private copyHit(result: CastResult, out: ActorHit): boolean {
    if (!this.config.registry.entityAlive(result.entity)) return false;
    out.position = [...result.position]; out.normal = [...result.normal];
    out.distance = result.distance; out.validity = result.validity; out.initialOverlap = result.initialOverlap;
    out.body = result.body; out.entity = { ...result.entity }; out.shape = result.shape;
    out.faceIndex = result.faceIndex; out.flags = result.flags; out.tag = result.tag ?? null;
    return true;
  }
  sweep(shape: ActorShape, start: V3, rotation: Q4, direction: V3, distance: number, mapMask: number, exclude: Ref, out: ActorHit): boolean {
    if (!this.validShape(shape)) return false;
    const hit = emptyResult();
    const found = this.world.castShape({ shape: { geometry: shape.geometry, local: localPose(shape) }, position: start, rotation,
      direction, distance, mask: mapMask, exclude: this.config.registry.entityAlive(exclude) ? exclude : null,
      mtd: this.options.sweepMtd, bothSides: this.options.sweepBothSides }, hit);
    return found && this.validShape(shape) && this.copyHit(hit, out);
  }
  ray(origin: V3, direction: V3, distance: number, mapMask: number, exclude: Ref, out: ActorHit): boolean {
    const hit = emptyResult();
    return this.world.castRay({ origin, direction, distance, mask: mapMask,
      exclude: this.config.registry.entityAlive(exclude) ? exclude : null, bothSides: this.options.rayBothSides }, hit) && this.copyHit(hit, out);
  }
  resolveSurface(hit: ActorHit, out: ActorSurface): boolean {
    const valid = (): boolean => {
      const body = this.world.bodyInfo(hit.body);
      return this.world.bodyOf(hit.shape) === hit.body && this.world.shapeDesc(hit.shape) !== null && body !== null
        && sameRef(body.entity, hit.entity) && this.config.registry.entityAlive(hit.entity);
    };
    if (!valid()) return false;
    const material = this.world.shapeDesc(hit.shape)!.material;
    const physicsMaterial: V3 | null = material ? [...material] : null;
    const key = this.config.resolveGroundKey(hit, physicsMaterial);
    if (!valid()) return false;
    Object.assign(out, { body: hit.body, entity: { ...hit.entity }, shape: hit.shape, faceIndex: hit.faceIndex,
      tag: hit.tag, physicsMaterial, groundKey: key ?? this.config.fallbackGroundKey });
    return true;
  }
  private shapePose(shape: ActorShape): Pose | null {
    const actor = this.config.registry.actorInfo(shape.actor);
    if (!actor || !this.validShape(shape)) return null;
    return poseMul(pose(actor.position, actor.rotation), localPose(shape), []) as Pose;
  }
  mapContacts(shape: ActorShape, mapMask: number, out: ActorMapContact[]): number {
    out.length = 0;
    const p = this.shapePose(shape); if (!p) return 0;
    const candidate = this.options.mapCandidate?.(shape);
    if (!this.validShape(shape)) return 0;
    const raw: MapContact[] = [];
    this.world.mapContacts(shape.geometry, p, mapMask, shape.owner, raw, candidate);
    for (const c of raw) {
      if (!this.validShape(shape)) break;
      if (!this.config.registry.entityAlive(c.entity)) continue;
      out.push({ actor: { ...shape.actor }, actorShape: { ...shape.ref }, body: c.body, entity: { ...c.entity }, shape: c.shape,
        direction: [...c.direction], depth: c.depth, raw: [...c.vector], adjusted: [...c.vector] });
    }
    return out.length;
  }
  actorContacts(actor: Ref, out: ActorPairContact[]): number {
    out.length = 0;
    const registry = this.config.registry, owner = registry.actorInfo(actor);
    if (!owner?.enabled) return 0;
    const actors: Ref[] = [], ownShapes: Ref[] = [];
    registry.snapshotActors(actors); registry.snapshotShapes(actor, ownShapes);
    for (const other of actors) {
      if (sameRef(actor, other)) continue;
      const otherShapes: Ref[] = []; registry.snapshotShapes(other, otherShapes);
      for (const ra of ownShapes) for (const rb of otherShapes) {
        const first = actor.index < other.index;
        const a = registry.shapeInfo(first ? ra : rb), b = registry.shapeInfo(first ? rb : ra);
        if (!a || !b || !this.validShape(a) || !this.validShape(b) || !(a.classMask & b.classMask)) continue;
        const da = registry.actorInfo(a.actor)!, db = registry.actorInfo(b.actor)!;
        let allowed: boolean;
        if (sameRef(da.entity, db.entity) || da.modelMask === null || db.modelMask === null || da.overrideCollision || db.overrideCollision) {
          allowed = this.config.pairFallback?.(da, a, db, b) ?? false;
        } else allowed = (da.modelMask & db.modelMask) !== 0;
        if (!allowed || !this.validShape(a) || !this.validShape(b)) continue;
        const targetBody = this.world.bodyInfo(b.collisionBody);
        if (this.world.bodyOf(b.collisionShape) !== b.collisionBody || !targetBody?.staged || !sameRef(targetBody.entity, b.owner)) continue;
        const pa = this.shapePose(a), pb = this.shapePose(b);
        if (!pa || !pb) continue;
        const key = `${a.ref.index}:${a.ref.generation}/${b.ref.index}:${b.ref.generation}/${da.poseEpoch}/${db.poseEpoch}/${pa}/${pb}/${JSON.stringify(a.geometry)}/${JSON.stringify(b.geometry)}/${b.collisionShape}`;
        let contact = this.pairs.get(key);
        if (!contact) {
          const pen = { direction: [0, 0, 0] as V3, depth: 0 };
          if (!this.world.penetration(a.geometry, pa, b.collisionShape, pen)) continue;
          if (!this.validShape(a) || !this.validShape(b)) continue;
          contact = { a: { ...a.actor }, b: { ...b.actor }, shapeA: { ...a.ref }, shapeB: { ...b.ref }, entityA: { ...a.owner }, entityB: { ...b.owner },
            direction: [...pen.direction], depth: pen.depth, raw: pen.direction.map(x => F(x * pen.depth)) as V3,
            respondA: false, respondB: false, adjustedA: [0, 0, 0], adjustedB: [0, 0, 0] };
          this.pairs.set(key, contact);
        }
        out.push({ ...contact, a: { ...contact.a }, b: { ...contact.b }, shapeA: { ...contact.shapeA }, shapeB: { ...contact.shapeB },
          entityA: { ...contact.entityA }, entityB: { ...contact.entityB }, direction: [...contact.direction], raw: [...contact.raw], adjustedA: [...contact.adjustedA], adjustedB: [...contact.adjustedB] });
      }
    }
    return out.length;
  }
}

export class ActorCollisionBinding {
  readonly ref: Ref;
  private ownedBodies = new Set<number>();
  private closed = false;
  private cleanups: (() => void)[] = [];
  constructor(readonly adapter: ActorCollisionAdapter, registration: ActorRegistration) {
    this.ref = adapter.config.registry.registerActor(registration);
    if (sameRef(this.ref, INVALID_REF)) throw new Error('Cannot register an actor with a dead entity');
  }
  addShape(desc: Omit<ActorShapeDesc, 'collisionBody' | 'collisionShape'>, physics: Pick<CollisionShapeDesc, 'layer' | 'material' | 'tag'>): Ref {
    const { world, config } = this.adapter, actor = config.registry.actorInfo(this.ref);
    if (this.closed || !actor || !config.registry.entityAlive(desc.owner)) return { ...INVALID_REF };
    const body = world.createBody({ entity: desc.owner, motion: 0, pose: pose(actor.position, actor.rotation), shapes: [], staged: false });
    try {
      const shape = world.addShape(body, { geometry: geometryCopy(desc.geometry), local: localPose({ ...desc, collisionBody: 0, collisionShape: 0 }),
        ...physics, material: physics.material ? [...physics.material] : undefined, enabled: actor.enabled && desc.enabled });
      const ref = config.registry.registerShape(this.ref, { ...desc, collisionBody: body, collisionShape: shape });
      if (sameRef(ref, INVALID_REF)) { world.removeBody(body); return ref; }
      this.ownedBodies.add(body); world.stage(body); this.adapter.invalidate(); return ref;
    } catch (error) { world.removeBody(body); throw error; }
  }
  borrowShape(desc: ActorShapeDesc): Ref {
    const { world, config } = this.adapter, body = world.bodyInfo(desc.collisionBody);
    if (this.closed || !body || !sameRef(body.entity, desc.owner) || world.bodyOf(desc.collisionShape) !== desc.collisionBody) return { ...INVALID_REF };
    this.adapter.invalidate(); return config.registry.registerShape(this.ref, desc);
  }
  removeShape(ref: Ref): boolean {
    const { world, config } = this.adapter, shape = config.registry.shapeInfo(ref);
    if (this.closed || !shape || !sameRef(shape.actor, this.ref)) return false;
    config.registry.unregisterShape(ref); this.adapter.invalidate();
    if (this.ownedBodies.delete(shape.collisionBody)) world.removeBody(shape.collisionBody);
    return true;
  }
  setEnabled(enabled: boolean): void {
    const { world, config } = this.adapter, d = config.registry.actorInfo(this.ref);
    if (this.closed || !d) return;
    config.registry.updateActor(this.ref, { ...d, enabled });
    const refs: Ref[] = []; config.registry.snapshotShapes(this.ref, refs);
    for (const ref of refs) {
      const shape = config.registry.shapeInfo(ref)!;
      if (this.ownedBodies.has(shape.collisionBody)) world.setShapeEnabled(shape.collisionShape, enabled && shape.enabled);
    }
    this.adapter.invalidate();
  }
  setShapeEnabled(ref: Ref, enabled: boolean): boolean {
    const { world, config } = this.adapter, s = config.registry.shapeInfo(ref), a = config.registry.actorInfo(this.ref);
    if (this.closed || !s || !a || !sameRef(s.actor, this.ref)) return false;
    config.registry.updateShape(ref, { ...s, enabled });
    if (this.ownedBodies.has(s.collisionBody)) world.setShapeEnabled(s.collisionShape, enabled && a.enabled);
    this.adapter.invalidate(); return true;
  }
  syncPose(position: V3, rotation: Q4, poseEpoch: number, teleport = false): void {
    const { world, config } = this.adapter, d = config.registry.actorInfo(this.ref);
    if (this.closed || !d) return;
    config.registry.updateActor(this.ref, { ...d, position, rotation, poseEpoch });
    for (const body of this.ownedBodies) {
      if (teleport) world.teleport(body, pose(position, rotation)); else world.syncPose(body, pose(position, rotation));
    }
    this.adapter.invalidate();
  }
  stage(staged: boolean): void {
    if (this.closed) return;
    for (const body of this.ownedBodies) { if (staged) this.adapter.world.stage(body); else this.adapter.world.unstage(body); }
    this.adapter.invalidate();
  }
  onDispose(cleanup: () => void): void { if (this.closed) cleanup(); else this.cleanups.push(cleanup); }
  dispose(): void {
    if (this.closed) return;
    this.setEnabled(false); this.closed = true;
    this.adapter.config.registry.unregisterActor(this.ref); this.adapter.invalidate();
    try {
      const errors: unknown[] = [];
      for (const cleanup of this.cleanups.splice(0)) { try { cleanup(); } catch (error) { errors.push(error); } }
      if (errors.length) throw new AggregateError(errors, 'Actor binding cleanup failed');
    } finally {
      for (const body of this.ownedBodies) this.adapter.world.removeBody(body);
      this.ownedBodies.clear();
    }
  }
}
