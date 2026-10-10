import fs from 'node:fs';
import path from 'node:path';
import { createPhysx } from '@game/lib/physx';
import { MeshCollider } from '@app/common/render3d';
import { PlazaActorWorld } from '@app/scene/world/plaza/actor-world';
import { PlazaMover, type MoverShape } from '@app/scene/world/plaza/player';

const WEB = path.resolve(import.meta.dirname, '..');
export const actorRows = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/plaza/player/actorparam.json'), 'utf8').replace(/^\uFEFF/, '')).ActorParam as number[][];
export const actorPhysx = await createPhysx(fs.readFileSync(path.join(WEB, 'script/game/lib/physx/physx.wasm')));
const worlds = new Set<PlazaActorWorld>();
const cache = new WeakMap<MeshCollider, PlazaActorWorld>();
export function testActorWorld(): PlazaActorWorld {
  const world = new PlazaActorWorld(actorPhysx, actorRows); worlds.add(world); return world;
}
export function planeActorWorld(y = 0, half = 1000): PlazaActorWorld {
  const world = testActorWorld();
  world.addMap('CollisionMain', [{ geometry: { kind: 'box', halfExtents: [half, .5, half] }, layer: 2 }], [0, y - .5, 0, 0, 0, 0, 1]);
  return world;
}
export function apxActorWorld(first = false): PlazaActorWorld {
  const world = testActorWorld();
  world.addApx('CollisionMain', fs.readFileSync(path.join(WEB, 'assets/plaza/world/physics/apx/72cbf6799dc022826ea52ed8ed6d9c3f.apx')), [0, 0, 0, 0, 0, 0, 1], 2, true);
  if (first) world.addApx('CollisionFirst', fs.readFileSync(path.join(WEB, 'assets/plaza/world/physics/apx/8fd195287993206ecec0115f93468058.apx')), [0, 0, 0, 0, 0, 0, 1], 2, false);
  return world;
}
export function createTestMover(shape: MoverShape, input: MeshCollider | number | null): PlazaMover {
  if (!(input instanceof MeshCollider)) return new PlazaMover(shape, planeActorWorld(input ?? 0));
  let world = cache.get(input);
  if (!world) {
    if (input.triangles === 4440) world = apxActorWorld();
    else {
      if (input.v.length % 12) throw new Error('Fixture expects horizontal quads or the original plaza mesh');
      world = testActorWorld();
      for (let i = 0; i < input.v.length; i += 12) {
        const xs = [0, 3, 6, 9].map(k => input.v[i + k]), zs = [2, 5, 8, 11].map(k => input.v[i + k]);
        if (![1, 4, 7, 10].every(k => input.v[i + k] === input.v[i + 1])) throw new Error('Fixture quad is not horizontal');
        const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
        world.addMap('CollisionMain', [{ geometry: { kind: 'box', halfExtents: [(x1 - x0) / 2, .5, (z1 - z0) / 2] }, layer: 2 }],
          [(x0 + x1) / 2, input.v[i + 1] - .5, (z0 + z1) / 2, 0, 0, 0, 1]);
      }
    }
    cache.set(input, world);
  }
  return new PlazaMover(shape, world);
}
export function disposeActorFixtures(): void { for (const world of worlds) world.dispose(); worlds.clear(); }
