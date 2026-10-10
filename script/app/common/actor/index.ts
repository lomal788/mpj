import { NPAD, STICK_MAX, type PadInput } from '@game/core/pad';
import {
  ActorParams, F, STEP_SEC, v3, v4, yawQuaternionApprox,
  type ActorCore, type ActorGround, type ActorMotionArg, type ActorMotionCommand,
  type ActorMotionState, type ActorParamValues, type MoveLever, type PadEdgePolicy,
  type PadLever, type PadPacket, type Q4, type V3,
} from '@game/lib/actor';
import { CharacterCore, fnv1a64 } from '@game/lib/character';

export function actorParamsFromRows(rows: readonly (readonly number[])[], game: Partial<ActorParamValues> = {}): ActorParams {
  return new ActorParams(rows, game);
}
export type NpadActorOptions = { extraButtons: ((raw: Readonly<PadInput>) => number) | null };
export class NpadActorInput {
  private previous = 0;
  constructor(readonly options: NpadActorOptions) {}
  read(raw: Readonly<PadInput>): PadPacket {
    let hold = raw.buttons & 15;
    const source = [NPAD.L, NPAD.R, NPAD.ZL, NPAD.ZR, NPAD.LEFT, NPAD.RIGHT, NPAD.UP, NPAD.DOWN];
    for (let i = 0; i < source.length; i++) if (raw.buttons & source[i]) hold |= 1 << (i + 4);
    hold = (hold | (this.options.extraButtons?.(raw) ?? 0)) >>> 0;
    const packet: PadPacket = { hold, trigger: (hold & ~this.previous) >>> 0, release: (this.previous & ~hold) >>> 0,
      stick: [F(raw.lx / STICK_MAX), F(-raw.ly / STICK_MAX), 0, 0] };
    this.previous = hold;
    return packet;
  }
  reset(previous = 0): void { this.previous = previous >>> 0; }
}
export const packetEdgesApprox: PadEdgePolicy = (kind, packet, pad) => pad.overlayEnabled
  ? packet[kind] & pad.mask & pad.setup.overlayMask : pad.normalButtons(packet[kind]);

export function cameraBasisApprox(lever: PadLever, right: V3, front: V3): MoveLever {
  const angle = F(lever.angle * F(Math.PI / 180));
  const x = lever.angle === 0 || Math.abs(lever.angle) === 180 ? 0 : Math.abs(lever.angle) === 90 ? Math.sign(lever.angle) : F(Math.sin(angle));
  const z = lever.angle === 0 ? 1 : Math.abs(lever.angle) === 180 ? -1 : Math.abs(lever.angle) === 90 ? 0 : F(Math.cos(angle));
  const direction = v4([F(F(right[0] * x) + F(front[0] * z)), 0, F(F(right[2] * x) + F(front[2] * z)), 0]);
  const length = F(Math.sqrt(F(F(direction[0] * direction[0]) + F(direction[2] * direction[2]))));
  if (!(lever.depth > 0) || !(length > 0)) return { depth: 0, direction: [0, 0, 0, 0], rotation: [0, 0, 0, 1] };
  direction[0] = F(direction[0] / length); direction[2] = F(direction[2] / length);
  const yaw = F(F(Math.atan2(direction[0], direction[2])) * F(180 / Math.PI));
  return { depth: lever.depth, direction, rotation: yawQuaternionApprox(yaw) };
}

export type ActorCharacterTarget = {
  core: CharacterCore;
  pose(position: V3, rotation: Q4): void;
  step(): void;
};
export class ActorCharacterBinding {
  private readonly names = new Map<bigint, string>();
  private readonly hashes = new Map<string, bigint>();
  private closed = false;
  private lastFrame = -1;
  constructor(readonly target: ActorCharacterTarget, names: ReadonlyMap<bigint, string>, readonly fallbackGroundKey: string | null) {
    for (const [hash, name] of names) {
      if (BigInt(fnv1a64(name)) !== hash || this.hashes.has(name)) throw new Error(`Invalid actor motion registration: ${name}`);
      this.names.set(hash, name); this.hashes.set(name, hash);
    }
  }
  readonly motionState = (): ActorMotionState => {
    const main = this.target.core.main;
    if (this.closed || !main.name) return { present: false, hash: null, playback: 0 };
    const hash = this.hashes.get(main.name);
    if (hash === undefined) throw new Error(`Unregistered actor motion: ${main.name}`);
    return { present: main.info !== null, hash, playback: main.state as 0 | 1 | 2 | 3 };
  };
  readonly motion = (command: ActorMotionCommand): void => {
    if (this.closed) return;
    const main = this.target.core.main;
    if (command.kind === 'condition-speed') { main.conditionSpeed = F(command.value); return; }
    const arg = command.arg;
    if (this.names.get(arg.hash) !== arg.name) throw new Error(`Unregistered actor motion: ${arg.name}`);
    const copy: ActorMotionArg = { ...arg, startFrame: F(arg.startFrame), speed: F(arg.speed), blendTime: F(arg.blendTime) };
    if (command.kind === 'play') main.play(copy); else main.enqueue(copy);
  };
  publish(actor: ActorCore): void {
    if (this.closed || !actor.alive) return;
    if (actor.frameId < 0 || actor.frameId <= this.lastFrame) throw new Error('Actor character publish requires a new frame');
    this.lastFrame = actor.frameId;
    this.target.pose(v3(actor.position), v4(actor.rotation));
    if (this.closed || !actor.alive) return;
    this.target.core.ground = this.groundKey(actor.ground);
    this.target.step();
  }
  private groundKey(ground: ActorGround): string | null {
    return ground.grounded ? ground.surface?.groundKey ?? this.fallbackGroundKey : null;
  }
  dispose(): void { this.closed = true; this.names.clear(); this.hashes.clear(); }
}
export function coreCharacterTarget(core: CharacterCore, pose: ActorCharacterTarget['pose']): ActorCharacterTarget {
  return { core, pose, step: () => core.step(STEP_SEC) };
}
