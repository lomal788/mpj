/**
 * 광장 1번 플레이어 자유 이동(B) — main actor::ComActor 땅 이동을 ComMatter 값(actorparam.json)으로 재현. docs/shell/plaza_3d.md §3.5.
 * 캐릭터 모델·몸/눈 셰이더 그래프·모션 = charselect Preview3D(같은 파이프라인), 에셋 web/assets/plaza/player(tools/analysis/plaza_player_assets.py).
 * PlazaCharaLoader.load 의 tick = Preview3D 준비 단계 사이 기다림(기본 setTimeout 0, 광장 렌더러 미리 준비는 프레임마다 — docs/engine/loader_manager.md §14.5).
 */
import * as THREE from 'three';
import { characterDefaults, mpatBlendCompat, motionArg, fnv1a64, type MpatRow } from '@game/lib/character';
import { ActorCore, ActorPad, ActorParams, JumpCalculator, basicGravity, identityPosition, F, quaternionYawApprox, yawQuaternionApprox, zeroPacket, type ActorEvent, type ActorMotionCommand, type MoveLever, type V3 } from '@game/lib/actor';
import { actorCapsuleFromSegment, type ActorCollisionBinding } from '@game/lib/actor-collision';
import { ActorCharacterBinding, NpadActorInput, cameraBasisApprox, packetEdgesApprox } from '@app/common/actor';
import { PlazaActorWorld, PLAZA_MAP_MASK, firstAcceptedApprox } from './actor-world';
import type { Spec } from '@app/scene/menu/charselect';
import { mpatTables, Preview3D } from '@app/scene/menu/charselect/preview3d';
import type { PlazaActor, PlazaContext, PlazaPad, PlazaPart, PlazaPartFactory } from './types';

/** actorparam.json → ComActor 필드 [판독+데이터 §3.5 ②] */
export const ACTOR = {
  walkSpeed: 2,
  runSpeed: 6,
  leverRun: 0.8,
  turnGround: 360,
  turnGroundFast: 1100,
  turnFastDeg: 85,
  turnAir: 180,
  turnAirFast: 720,
  airAccel: 40,
  airDecel: 40,
  airMax: 6,
  airSlowMul: 0.075,
  gravity: 9.8,
  jumpCalcOffFactor: 5,
  fallMax: 49,
  groundCast: 0.4,
  groundSnap: 0.02,
  groundMinD: 0.01,
} as const;

export type ActionName = 'Idle' | 'Walk' | 'Run' | 'Fall';

export const ACTION_MOTION: Record<Exclude<ActionName, 'Fall'>, string> = { Idle: 'co_idle00', Walk: 'co_walk00', Run: 'co_run00' };

export interface Lever {
  depth: number;
  dirX: number;
  dirZ: number;
  /** 몸 회전(도), 0 = +Z */
  deg: number;
}

export const NO_LEVER: Lever = { depth: 0, dirX: 0, dirZ: 0, deg: 0 };

/** 카메라 기준 레버(GetPadActorDeg): ActorPad radial .1·clamp 없음, 카메라 수평 오른쪽·앞 [근사: cameraBasisApprox] */
export function leverFromStick(lx: number, ly: number, camera: THREE.Camera): Lever {
  const pad = createPlazaPad();
  pad.setInput({ ...zeroPacket(), stick: [F(lx), F(-ly), 0, 0] });
  const [right, front] = cameraBasis(camera);
  return publicLever(cameraBasisApprox(pad.getLever(), right, front));
}
const createPlazaPad = (): ActorPad => new ActorPad({ moveAnalog: true, moveDpad: true, subdivisionCount: 0,
  overlayMask: 0xffffffff, overlay: zeroPacket(), edgePolicy: packetEdgesApprox });
function cameraBasis(camera: THREE.Camera): [V3, V3] {
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements, rl = Math.hypot(e[0], e[2]) || 1, fl = Math.hypot(e[8], e[10]) || 1;
  return [[F(e[0] / rl), 0, F(e[2] / rl)], [F(-e[8] / fl), 0, F(-e[10] / fl)]];
}
function publicLever(lever: MoveLever): Lever {
  return { depth: lever.depth, dirX: lever.direction[0], dirZ: lever.direction[2], deg: quaternionYawApprox(lever.rotation) };
}

export function wrapDeg(d: number): number {
  let r = ((d + 180) % 360 + 360) % 360 - 180;
  if (r === -180) r = 180;
  return r;
}

export interface MoverShape {
  radius: number;
  height: number;
}

/** ComActor 한 프레임(1/60 s) — pre→tick(integrate·rotate)→sync→(Map→sync→Limit→sync)×2→postCollision→ground→sync. 계산은 공용 actor, 광장은 포트만 연결한다. */
export class PlazaMover {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly core: ActorCore;
  readonly binding: ActorCollisionBinding;
  readonly pad = createPlazaPad();
  motionEnabled = true;
  contactCalls = 0;
  onEvent: ((event: ActorEvent) => void) | null = null;
  private epoch = 0;
  private externalLever: MoveLever | null = null;
  private right: V3 = [1, 0, 0];
  private front: V3 = [0, 0, 1];
  private readonly raw = new NpadActorInput({ extraButtons: null });
  private character: ActorCharacterBinding | null = null;
  private closed = false;
  private readonly hashes = { Idle: BigInt(fnv1a64('Idle')), Walk: BigInt(fnv1a64('Walk')), Run: BigInt(fnv1a64('Run')),
    Fall: BigInt(fnv1a64('Fall')), Jump: BigInt(fnv1a64('Jump')), Landing: BigInt(fnv1a64('Landing')) };

  constructor(readonly shape: MoverShape, readonly physics: PlazaActorWorld) {
    this.binding = physics.createBinding();
    const ref = this.binding.ref, entity = physics.registry.actorInfo(ref)!.entity;
    const capsule = actorCapsuleFromSegment([0, .5, 0], [0, 1, 0], .5);
    this.binding.addShape({ owner: entity, nameHash: BigInt(fnv1a64('Adjust')), classMask: 0x2022, enabled: true, ...capsule }, { layer: 1 });
    this.core = new ActorCore({ ref, pad: this.pad, params: new ActorParams(physics.paramRows), position: [0, 0, 0, 0], rotation: [0, 0, 0, 1],
      leverReference: [0, 0, 0, 0], verticalReference: [0, 0, 0, 0], rotationMode: 'yaw-approx', groundedLimitY: -2.5,
      jumpCalculator: new JumpCalculator(), selectGround: firstAcceptedApprox,
      moveLever: p => this.externalLever ?? cameraBasisApprox(p.getLever(), this.right, this.front),
      ports: { registry: physics.registry, collision: physics.adapter, gravity: basicGravity, finalPosition: identityPosition,
        motionState: () => this.character?.motionState() ?? { present: false, hash: null, playback: 0 },
        motion: command => { if (this.motionEnabled) this.character?.motion(command); },
        event: event => { if (event.kind === 'ground-contact') this.contactCalls++; this.onEvent?.(event); } } });
    this.core.installBasicActions({ hashes: this.hashes, motions: {
      Idle: this.motion('Idle'), Walk: this.motion('Walk'), Run: this.motion('Run'),
    }, landingEnabled: false, groundInput: null, airInput: null, groundLever: null });
    this.binding.onDispose(() => { this.closed = true; this.core.dispose(); this.character?.dispose(); this.character = null; this.onEvent = null; });
  }
  private motion(action: Exclude<ActionName, 'Fall'>) {
    const name = ACTION_MOTION[action];
    return { ...motionArg(name), hash: BigInt(fnv1a64(name)), transitionType: 1 as const };
  }
  connectCharacter(binding: ActorCharacterBinding, motion: (command: ActorMotionCommand) => void): void {
    this.character?.dispose(); this.character = binding;
    this.core.ports.motion = command => { if (this.motionEnabled) motion(command); };
  }
  publish(): void {
    if (this.closed) return;
    const action = this.action;
    if (this.motionEnabled && action !== 'Fall') this.core.ports.motion({ kind: 'play', slot: 'main', arg: this.motion(action) });
    this.character?.publish(this.core);
  }
  get inputEnabled(): boolean { return !this.core.inputBlocked; }
  set inputEnabled(enabled: boolean) { this.core.inputBlocked = !enabled; }
  get grounded(): boolean { return this.core.grounded; }
  set grounded(value: boolean) { this.core.groundedFlag = value; }
  get vVert(): number { return this.core.vVert[1]; }
  set vVert(value: number) { this.core.vVert[1] = F(value); }
  get yaw(): number { return quaternionYawApprox(this.core.rotation); }
  set yaw(value: number) { this.core.rotation = yawQuaternionApprox(value); }
  get targetYaw(): number { return quaternionYawApprox(this.core.targetRotation); }
  set targetYaw(value: number) { this.core.targetRotation = yawQuaternionApprox(value); }
  get action(): ActionName {
    return this.core.actionHash === this.hashes.Run ? 'Run' : this.core.actionHash === this.hashes.Walk ? 'Walk' : this.core.actionHash === this.hashes.Idle ? 'Idle' : 'Fall';
  }
  get frames(): number { return this.core.frameId + 1; }
  get speed(): number { return Math.hypot(this.core.vLever[0], this.core.vLever[2]); }
  private sync(teleport = false): void {
    this.binding.syncPose([this.core.position[0], this.core.position[1], this.core.position[2]], this.core.rotation, ++this.epoch, teleport);
    this.pos.set(this.core.position[0], this.core.position[1], this.core.position[2]);
    this.vel.set(this.core.vLever[0], this.core.vLever[1], this.core.vLever[2]);
  }
  place(pos: THREE.Vector3, yawDeg: number): void {
    if (this.closed) return;
    this.core.teleport([pos.x, pos.y, pos.z, 0], yawQuaternionApprox(yawDeg));
    this.core.vLever.fill(0); this.core.vVert.fill(0); this.core.groundedFlag = true; this.core.jumpStatus = 0;
    this.core.callAction(this.hashes.Idle); this.sync(true);
  }

  /** PlayerManager::LookAt → ComPlayerUtil::TurnLookAt(수평 방향 CalcTurnDegY → AutoInterpolation::StartRotateY = 목표 회전, 회전은 공용 actor 선회 규칙) / immediate = SetRotateLookAt */
  lookAt(target: THREE.Vector3, immediate = false): void {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    if (dx === 0 && dz === 0) return;
    this.targetYaw = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
    if (immediate) { this.core.rotation = [...this.core.targetRotation]; this.sync(true); }
  }
  projectGround(pos: THREE.Vector3, fromY = pos.y + 2): THREE.Vector3 {
    const entity = this.physics.registry.actorInfo(this.binding.ref)?.entity;
    if (!entity) return pos;
    const hit = this.physics.ground([pos.x, fromY, pos.z], 1000, entity);
    if (hit) pos.y = hit.position[1];
    return pos;
  }
  tick(input: Lever): ActionName {
    this.externalLever = { depth: F(input.depth), direction: [F(input.dirX), 0, F(input.dirZ), 0], rotation: yawQuaternionApprox(input.deg) };
    return this.step();
  }
  tickPad(input: PlazaPad | null, camera: THREE.Camera): Lever {
    this.externalLever = null; [this.right, this.front] = cameraBasis(camera);
    this.pad.setInput(this.raw.read({ buttons: input?.buttons ?? 0, lx: (input?.lx ?? 0) * 32767, ly: (input?.ly ?? 0) * 32767,
      rx: (input?.rx ?? 0) * 32767, ry: (input?.ry ?? 0) * 32767, accX: 0, accY: 0, accZ: 0 }));
    this.step(); return publicLever(this.core.lever);
  }
  private step(): ActionName {
    if (this.closed) return this.action;
    this.core.setPosition([this.pos.x, this.pos.y, this.pos.z, 0]);
    this.core.gravityScale = this.grounded ? 0 : 1;
    this.core.preFrame(this.frames); this.core.tick(); this.sync();
    const stamp = { frameId: this.core.frameId, phase: 'map' as const, pass: 0, sequence: 0, poseEpoch: this.epoch };
    for (let pass = 0; pass < 2; pass++) {
      this.core.collisionJobs({ ...stamp, pass, poseEpoch: this.epoch }, { kind: 'map', mapMask: PLAZA_MAP_MASK, classMask: 1 << 13 }); this.sync();
      this.core.collisionJobs({ ...stamp, phase: 'limit', pass, poseEpoch: this.epoch }, { kind: 'limit' }); this.sync();
    }
    this.core.postCollision();
    this.core.collisionJobs({ ...stamp, phase: 'ground', poseEpoch: this.epoch }, { kind: 'ground', mapMask: PLAZA_MAP_MASK }); this.sync();
    return this.action;
  }
  dispose(): void { if (!this.closed) this.binding.dispose(); }
}

export interface Transit {
  from: string | null;
  to: string;
  a: number;
}

/** sys_pc.mpat 전이(from→to 먼저, 없으면 *→to). a = 보간 프레임 [추정] → 초. 없으면 undefined(MotionArg 기본) */
export function transitBlend(table: readonly Transit[], from: string, to: string): number | undefined {
  return mpatBlendCompat(table, from, to);
}

type CharaSpec = Spec['chars'][number];

export interface PlazaCharaSpec extends CharaSpec {
  height: number;
  bubbleRadius: number;
  width: number;
}

export interface PlazaPlayerSpec {
  clips: string[];
  transit: Transit[];
  env: Spec['env'];
  chars: PlazaCharaSpec[];
}

/** 캐릭터 하나(Preview3D 한 칸의 모델을 광장 장면으로 옮김). root 위치·회전은 부르는 쪽이 정한다 */
export class PlazaChara {
  readonly root = new THREE.Group();
  motion = '';

  constructor(
    private readonly preview: Preview3D,
    readonly spec: PlazaCharaSpec,
    private readonly transit: readonly Transit[],
  ) {}

  play(clip: string, next?: string): void {
    if (clip === this.motion) return;
    const blend = this.motion && !characterDefaults.motion.mpatBlend ? transitBlend(this.transit, this.motion, clip) : undefined;
    this.preview.play(0, clip, next, blend);
    this.motion = clip;
  }

  connect(mover: PlazaMover): void {
    const core = this.preview.slots[0].core;
    const names = new Map(Object.keys(this.spec.clips ?? {}).map(name => [BigInt(fnv1a64(name)), name]));
    const binding = new ActorCharacterBinding({ core, pose: (p, q) => { this.root.position.fromArray(p); this.root.quaternion.fromArray(q); }, step: () => this.tick() }, names, null);
    mover.connectCharacter(binding, command => {
      if (command.kind === 'condition-speed' || characterDefaults.motion.mpatBlend) { binding.motion(command); return; }
      const blend = core.main.name ? transitBlend(this.transit, core.main.name, command.arg.name) : undefined;
      if (command.kind === 'play' && command.arg.speedValid) {
        this.preview.playMotion(0, command.arg.name, { blend: blend ?? command.arg.blendTime, force: command.arg.forceRestart,
          start: command.arg.randomStartFrame ? 'random' : command.arg.startFrame, speed: command.arg.speed, type: command.arg.transitionType });
      } else binding.motion({ ...command, arg: { ...command.arg, blendTime: blend ?? command.arg.blendTime } });
    });
  }

  tick(): void {
    this.preview.update();
    this.motion = this.preview.slots[0].current;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.preview.dispose();
  }
}

export function plazaCharacterRandApprox(seed: number): (n: number) => number {
  let state = seed >>> 0;
  return n => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return n > 0 ? state % n : 0; };
}

export class PlazaCharaLoader {
  private constructor(
    readonly spec: PlazaPlayerSpec,
    private readonly url: (p: string) => string,
    private readonly mpat: MpatRow[][] = [],
  ) {}

  static async create(assetUrl: (p: string) => string): Promise<PlazaCharaLoader> {
    const url = (p: string): string => assetUrl(`plaza/player/${p}`);
    const r = await fetch(url('spec.json'));
    if (!r.ok) throw new Error(`plaza player spec 를 읽지 못했다: ${r.status}`);
    const mp = await fetch(assetUrl('chara/mpat.json'))
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    return new PlazaCharaLoader((await r.json()) as PlazaPlayerSpec, url, mpatTables(mp, ['sys_pc']));
  }

  find(pc: string): PlazaCharaSpec | null {
    return this.spec.chars.find((c) => c.pc === pc) ?? null;
  }

  async load(pc: string, renderer: THREE.WebGLRenderer, prepare: (root: THREE.Object3D) => Promise<void>, rand?: (n: number) => number, tick?: () => Promise<void>): Promise<PlazaChara> {
    const c = this.find(pc) ?? this.spec.chars[0];
    const idx = this.spec.chars.indexOf(c);
    const preview = new Preview3D({ chars: this.spec.chars, env: this.spec.env } as unknown as Spec, this.url, rand, { mpat: this.mpat });
    preview.setup([[1, 1]]);
    preview.prefetch([idx]);
    preview.setChara(0, idx, true);
    try {
      const t0 = performance.now();
      while (!preview.slots[0].root) {
        if (performance.now() - t0 > 60000) throw new Error(`plaza player 모델 준비 시간 초과: ${c.pc}`);
        preview.render(renderer);
        await (tick ? tick() : new Promise((res) => setTimeout(res, 0)));
      }
      const ch = new PlazaChara(preview, c, this.spec.transit);
      ch.motion = preview.slots[0].current;
      ch.root.add(preview.slots[0].root!);
      ch.root.name = `Player_${c.pc}`;
      await prepare(ch.root);
      return ch;
    } catch (error) { preview.dispose(); throw error; }
  }
}

/** GetAttachSocketPcDefault 의 p = 사람 수(이 기기·COM 제외 — 광장에는 CPU 를 만들지 않는다, §6.10 C 판독), 1~4 */
export function startSocketCount(players: readonly { local: boolean; isCom: boolean }[]): number {
  return Math.max(1, Math.min(4, players.filter((p) => p.local && !p.isCom).length));
}

export function shapeOf(c: PlazaCharaSpec): MoverShape {
  const radius = c.pc === 'pc50' ? Math.max(c.bubbleRadius, 1.0) : c.bubbleRadius;
  return { radius, height: c.height };
}

const yawOfQuat = (q: THREE.Quaternion): number => {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return THREE.MathUtils.radToDeg(Math.atan2(f.x, f.z));
};

export interface PlazaPlayerDebug {
  pc: string;
  pos: number[];
  yaw: number;
  action: ActionName;
  motion: string;
  speed: number;
  grounded: boolean;
  lever: Lever;
}

export const createPlayer: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const world = ctx.world;
  const stage = world.stage;
  const me = ctx.players.find((p) => p.slot === 0 && p.local) ?? ctx.players.find((p) => p.local && !p.isCom) ?? ctx.players[0];
  if (!world.actorWorld) throw new Error('Plaza actor world is not ready');
  const loader = await PlazaCharaLoader.create((p) => ctx.assetUrl(p));
  const chara = await loader.load(me?.chara ?? 'pc01', stage.renderer, (r) => stage.prepare(r), plazaCharacterRandApprox((me?.slot ?? 0) + 1));
  if (!world.actorWorld) { chara.dispose(); throw new Error('Plaza actor world was disposed during player load'); }
  stage.scene.add(chara.root);
  const mover = new PlazaMover(shapeOf(chara.spec), world.actorWorld!);
  chara.connect(mover);
  const localCount = startSocketCount(ctx.players);
  const sock = world.pcSocket('balloon', localCount, 0) ?? world.socket('char_start_pos');
  mover.place(sock ? sock.pos : new THREE.Vector3(0, -2.365, 22.316), sock ? yawOfQuat(sock.quat) : 180);
  const actor: PlazaActor = {
    slot: me?.slot ?? 0,
    kind: 'input',
    chara: chara.spec.pc,
    root: chara.root,
    pos: mover.pos,
    yaw: 0,
    speed: 0,
    motion: chara.motion,
    height: chara.spec.height,
  };
  ctx.actors.push(actor);
  let lever: Lever = NO_LEVER;
  let acc = 0;
  const sync = (): void => {
    chara.root.position.copy(mover.pos);
    chara.root.quaternion.fromArray(mover.core.rotation);
    actor.yaw = THREE.MathUtils.degToRad(mover.yaw);
    actor.speed = mover.speed;
    actor.motion = chara.motion;
  };
  sync();
  const offInput = ctx.on('player:input', (v) => {
    mover.inputEnabled = !!v;
    if (!v) lever = NO_LEVER;
    else mover.motionEnabled = true;
  });
  const offPlace = ctx.on('player:place', (v) => {
    const r = v as { pos: THREE.Vector3; yawDeg?: number };
    mover.place(r.pos, r.yawDeg ?? mover.yaw);
    sync();
  });
  const offLook = ctx.on('player:lookAt', (v) => {
    const r = v as { target: THREE.Vector3; immediate?: boolean };
    mover.lookAt(r.target, !!r.immediate);
  });
  const offPlay = ctx.on('player:play', (v) => {
    const r = v as { clip: string; next?: string };
    mover.motionEnabled = false;
    chara.play(r.clip, r.next);
  });
  return {
    name: 'player',
    update(df) {
      acc += df;
      while (acc >= 1 - 1e-6) {
        acc -= 1;
        const pad: PlazaPad | null = ctx.pad(actor.slot);
        lever = mover.tickPad(pad, stage.camera);
        mover.publish();
      }
      sync();
    },
    debug(): PlazaPlayerDebug {
      return {
        pc: chara.spec.pc,
        pos: mover.pos.toArray(),
        yaw: mover.yaw,
        action: mover.action,
        motion: chara.motion,
        speed: mover.speed,
        grounded: mover.grounded,
        lever,
      };
    },
    dispose() {
      offInput();
      offPlay();
      offLook();
      offPlace();
      const i = ctx.actors.indexOf(actor);
      if (i >= 0) ctx.actors.splice(i, 1);
      mover.dispose();
      chara.dispose();
    },
  };
};
