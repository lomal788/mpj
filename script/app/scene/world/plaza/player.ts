/**
 * 광장 1번 플레이어 자유 이동(B) — main actor::ComActor 땅 이동을 ComMatter 값(actorparam.json)으로 재현. docs/shell/plaza_3d.md §3.5.
 * 캐릭터 모델·몸/눈 셰이더 그래프·모션 = charselect Preview3D(같은 파이프라인), 에셋 web/assets/plaza/player(tools/analysis/plaza_player_assets.py).
 * PlazaCharaLoader.load 의 tick = Preview3D 준비 단계 사이 기다림(기본 setTimeout 0, 광장 렌더러 미리 준비는 프레임마다 — docs/engine/loader_manager.md §14.5).
 */
import * as THREE from 'three';
import { characterDefaults, mpatBlendCompat, type MpatRow } from '@game/lib/character';
import type { Collider } from '../../../../shell/stage3d';
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

/** [근사] PhysX 침투 밀어내기 대신 발 위 이 높이 안의 걸을 수 있는 면으로 올림(meshCollider STEP 과 같음) */
export const STEP_UP = 0.5;

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

/** 카메라 기준 레버(GetPadActorDeg): 깊이 = |스틱|(1 이하), 방향 = 카메라 수평 오른쪽·앞 [추정: 레버 카메라 변환] */
export function leverFromStick(lx: number, ly: number, camera: THREE.Camera): Lever {
  const depth = Math.min(1, Math.hypot(lx, ly));
  if (!(depth > 0)) return NO_LEVER;
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  let rx = e[0];
  let rz = e[2];
  let fx = -e[8];
  let fz = -e[10];
  const rl = Math.hypot(rx, rz) || 1;
  const fl = Math.hypot(fx, fz) || 1;
  rx /= rl;
  rz /= rl;
  fx /= fl;
  fz /= fl;
  let x = rx * lx + fx * ly;
  let z = rz * lx + fz * ly;
  const l = Math.hypot(x, z) || 1;
  x /= l;
  z /= l;
  return { depth, dirX: x, dirZ: z, deg: THREE.MathUtils.radToDeg(Math.atan2(x, z)) };
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

/** ComActor 한 프레임(1/60 s) — 액션(ChangeAction 0x38/0x68/0x58)·MoveLeverDirection·MoveAir·회전·적분·접지 */
export class PlazaMover {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  vVert = 0;
  yaw = 0;
  targetYaw = 0;
  action: ActionName = 'Idle';
  grounded = true;
  inputEnabled = true;
  frames = 0;

  constructor(
    public shape: MoverShape,
    public collider: Collider | null,
  ) {}

  place(pos: THREE.Vector3, yawDeg: number): void {
    this.pos.copy(pos);
    this.yaw = this.targetYaw = yawDeg;
    this.vel.set(0, 0, 0);
    this.vVert = 0;
    this.grounded = true;
    this.enter('Idle');
  }

  /** PlayerManager::LookAt → ComPlayerUtil::TurnLookAt(수평 방향 CalcTurnDegY → AutoInterpolation::StartRotateY = 목표 회전, 회전은 rotate() 선회 규칙) / immediate = SetRotateLookAt */
  lookAt(target: THREE.Vector3, immediate = false): void {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    if (dx === 0 && dz === 0) return;
    this.targetYaw = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
    if (immediate) this.yaw = this.targetYaw;
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  private enter(a: ActionName): void {
    this.action = a;
    if (a === 'Idle') this.vel.set(0, 0, 0);
  }

  tick(input: Lever): ActionName {
    const lever = this.inputEnabled ? input : NO_LEVER;
    const next: ActionName = !this.grounded ? 'Fall' : lever.depth >= ACTOR.leverRun ? 'Run' : lever.depth > 0 ? 'Walk' : 'Idle';
    if (next !== this.action) this.enter(next);
    let ax = 0;
    let az = 0;
    let decel = 0;
    if (this.action === 'Walk' || this.action === 'Run') {
      const sp = this.action === 'Run' ? ACTOR.runSpeed : ACTOR.walkSpeed;
      this.vel.set(lever.dirX * sp, 0, lever.dirZ * sp);
      this.targetYaw = lever.deg;
    } else if (this.action === 'Fall') {
      if (lever.depth > 0) {
        this.targetYaw = lever.deg;
        const m = ACTOR.airAccel * (lever.depth < ACTOR.leverRun ? ACTOR.airSlowMul : 1);
        ax = lever.dirX * m;
        az = lever.dirZ * m;
      } else decel = ACTOR.airDecel;
    }
    this.rotate();
    this.integrate(ax, az, decel);
    this.groundCheck();
    this.frames++;
    return this.action;
  }

  private rotate(): void {
    const diff = wrapDeg(this.targetYaw - this.yaw);
    const fast = Math.abs(diff) >= ACTOR.turnFastDeg;
    const spd = this.grounded ? (fast ? ACTOR.turnGroundFast : ACTOR.turnGround) : fast ? ACTOR.turnAirFast : ACTOR.turnAir;
    const step = spd / 60;
    this.yaw = wrapDeg(this.yaw + Math.max(-step, Math.min(step, diff)));
  }

  private integrate(ax: number, az: number, decel: number): void {
    if (!this.grounded) {
      this.vel.x += ax / 60;
      this.vel.z += az / 60;
      let s = this.speed;
      if (decel > 0 && s > 0) {
        const ns = Math.max(0, s - decel / 60);
        this.vel.multiplyScalar(ns / s);
        s = ns;
      }
      if (s > ACTOR.airMax) this.vel.multiplyScalar(ACTOR.airMax / s);
    }
    const move = new THREE.Vector3(this.vel.x / 60, 0, this.vel.z / 60);
    if (move.x !== 0 || move.z !== 0) {
      const real = this.collider ? this.collider.collide(this.pos, move, this.shape.radius, this.shape.height) : move;
      this.pos.x += real.x;
      this.pos.z += real.z;
    }
    const gScale = this.grounded ? 0 : 1;
    if (this.grounded) this.vVert = 0;
    else {
      this.vVert -= (ACTOR.gravity * gScale * ACTOR.jumpCalcOffFactor) / 60;
      if (this.vVert < -ACTOR.fallMax) this.vVert = -ACTOR.fallMax;
    }
    this.pos.y += this.vVert / 60;
  }

  private groundCheck(): void {
    if (!this.collider) {
      this.grounded = true;
      return;
    }
    const d = Math.max(-this.vVert / 60, ACTOR.groundMinD);
    const hit = this.collider.groundHeight(this.pos.x, this.pos.z, this.pos.y + d);
    if (!hit) {
      this.grounded = false;
      return;
    }
    const dist = this.pos.y + d - hit.y;
    if (dist > d + ACTOR.groundCast) {
      this.grounded = false;
      return;
    }
    if (dist > d + ACTOR.groundSnap) this.pos.y -= dist - d;
    else if (hit.y > this.pos.y && hit.y - this.pos.y <= STEP_UP) this.pos.y = hit.y;
    if (!this.grounded) this.vVert = 0;
    this.grounded = true;
  }
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

  tick(): void {
    this.preview.update();
    this.motion = this.preview.slots[0].current;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.preview.dispose();
  }
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
  const loader = await PlazaCharaLoader.create((p) => ctx.assetUrl(p));
  const chara = await loader.load(me?.chara ?? 'pc01', stage.renderer, (r) => stage.prepare(r));
  stage.scene.add(chara.root);
  const mover = new PlazaMover(shapeOf(chara.spec), world.collider);
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
    chara.root.rotation.set(0, THREE.MathUtils.degToRad(mover.yaw), 0);
    actor.yaw = THREE.MathUtils.degToRad(mover.yaw);
    actor.speed = mover.speed;
    actor.motion = chara.motion;
  };
  sync();
  let forced = false;
  const offInput = ctx.on('player:input', (v) => {
    mover.inputEnabled = !!v;
    if (!v) lever = NO_LEVER;
    else forced = false;
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
    forced = true;
    chara.play(r.clip, r.next);
  });
  return {
    name: 'player',
    update(df) {
      acc += df;
      while (acc >= 1 - 1e-6) {
        acc -= 1;
        const pad: PlazaPad | null = ctx.pad(actor.slot);
        lever = pad ? leverFromStick(pad.lx, pad.ly, stage.camera) : NO_LEVER;
        const a = mover.tick(lever);
        if (a !== 'Fall' && !forced) chara.play(ACTION_MOTION[a]);
        chara.tick();
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
      chara.dispose();
    },
  };
};
