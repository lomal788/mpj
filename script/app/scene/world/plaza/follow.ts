/**
 * 광장 따라가기(로컬 사람 2~4P)·원격 멤버 표시 — docs/shell/plaza_3d.md §6.10 ② [판독: ComFollowPlayer::ReceiveMessageImpl @0x710003fec0,
 * PlayerManager::Start @0x7100041060·SequenceMainMenu::Setup @0x7100059700, main ComActorAutoInterpolation @0x710001fea0·@0x71000208e8·@0x71000202c0,
 * PlayerManager::OnReceive @0x71000421e0].
 * - 광장에 만드는 플레이어 = PlayerType≠1(COM 아님)·이 기기 사람. 슬롯 i 는 슬롯 i−1 을 따른다. 시작 = pc_plaza_balloon_pos_p<사람 수>_pc<i>.
 * - 캐릭터·이동 = B 의 PlazaCharaLoader·PlazaMover(ComActor 땅 이동). AutoInterpolation 은 목표 쪽 수평 단위 방향을 깊이 1(달리기 6 = 기본 속도 6.0) 레버로 준다 [근사].
 * - 원격 표시 actor 하나 = RemoteMotion(표시 PlazaMover + AutoInterpolation 하나 + OnReceive 거리 분기, 거리 = 표시 위치 기준) — docs/engine/12_online_sync.md §6.2.1.
 *   AutoInterpolation 필드 = 목표 위치 +0x40·목표 회전 +0x50·위치 flag +0x60·회전 flag +0x61·속도 +0x64 [판독 main @0x710002023c·@0x7100020628].
 */
import * as THREE from 'three';
import { emptyActorHit } from '@game/lib/actor';
import { MeshCollider } from '@app/common/render3d';
import { NO_LEVER, PlazaCharaLoader, PlazaMover, shapeOf, plazaCharacterRandApprox, type ActionName, type Lever, type PlazaChara } from './player';
import { ROTATE_ONLY_DIST, TELEPORT_DIST, type RemoteMode } from './ui/net';
import type { PlazaActor, PlazaContext, PlazaPart, PlazaPartFactory, PlazaPlayerSetup } from './types';

/** ComFollowPlayer 상수 [판독] */
export const FOLLOW = {
  ring: 5,
  pointGap: 0.6,
  startDist: 2.6,
  stopDist: 2.0,
  rayUp: 1.0,
  rayLen: 1.3,
  /** ComActorAutoInterpolation 기본 속도(+0x64) [판독 main @0x710001fed4] */
  speed: 6.0,
} as const;

export type RayBlocked = (from: THREE.Vector3, dir: THREE.Vector3, len: number) => boolean;

/** ComFollowPlayer 한 칸(원형 버퍼 + 시작/정지) — 노드에서도 도는 순수 로직 */
export class FollowLogic {
  readonly buf: THREE.Vector3[] = Array.from({ length: FOLLOW.ring }, () => new THREE.Vector3());
  head = 0;
  tail = 0;
  count = 0;
  running = false;
  readonly target = new THREE.Vector3();

  /** +0x68/+0x6c/+0x70 갱신 [판독 @0x7100040104 앞] */
  push(p: THREE.Vector3): void {
    const n = this.buf.length;
    if (this.count === 0) {
      this.count = 1;
      this.buf[this.head].copy(p);
      return;
    }
    if (this.buf[this.head % n].distanceTo(p) <= FOLLOW.pointGap) return;
    const ni = (this.head + n - 1) % n;
    if (this.tail === ni) {
      this.head = ni;
      this.tail = (ni + n - 1) % n;
    } else {
      this.head = ni;
      this.count++;
    }
    this.buf[this.head].copy(p);
  }

  /** 가장 새 점부터 i 번째 */
  point(i: number): THREE.Vector3 {
    return this.buf[(this.head + i) % this.buf.length];
  }

  /** 한 프레임: 대상 위치 기록 → 거리 > 2.6 이면 막히지 않은 가장 새 점으로 Start, < 2.0 이면 Stop */
  step(self: THREE.Vector3, leader: THREE.Vector3, blocked: RayBlocked): void {
    this.push(leader);
    const d = self.distanceTo(leader);
    if (d > FOLLOW.startDist) {
      let found = false;
      for (let i = 0; i < this.count; i++) {
        const p = this.point(i);
        const v = p.clone().sub(self);
        if (v.length() === 0) break;
        const from = self.clone();
        from.y += FOLLOW.rayUp;
        if (!blocked(from, v.normalize(), FOLLOW.rayLen)) {
          this.running = true;
          this.target.copy(p);
          found = true;
          break;
        }
      }
      if (!found) this.running = false;
    }
    if (d < FOLLOW.stopDist) this.running = false;
  }
}

/** ComActorAutoInterpolation::Calculate/TryFinish: 수평 단위 방향, 남은 거리 ≤ 속도·dt 면 도착 */
export function autoInterp(self: THREE.Vector3, target: THREE.Vector3, speed: number = FOLLOW.speed, dt = 1 / 60): { dirX: number; dirZ: number; arrive: boolean } {
  const dx = target.x - self.x;
  const dz = target.z - self.z;
  const l = Math.hypot(dx, dz);
  if (l <= speed * dt) return { dirX: 0, dirZ: 0, arrive: true };
  return { dirX: dx / l, dirZ: dz / l, arrive: false };
}

export function leverToward(dirX: number, dirZ: number, depth = 1): Lever {
  return { depth, dirX, dirZ, deg: THREE.MathUtils.radToDeg(Math.atan2(dirX, dirZ)) };
}

export class AutoInterpolation {
  speed: number = FOLLOW.speed;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  movePos = false;
  moveRot = false;

  start(pos: THREE.Vector3, yawDeg: number): void {
    this.pos.copy(pos);
    this.yaw = yawDeg;
    this.movePos = true;
    this.moveRot = true;
  }

  startRotate(yawDeg: number): void {
    this.yaw = yawDeg;
    this.movePos = false;
    this.moveRot = true;
  }

  stop(): void {
    this.movePos = false;
    this.moveRot = false;
  }

  calculate(m: PlazaMover, dt = 1 / 60): Lever {
    if (this.movePos) {
      const r = autoInterp(m.pos, this.pos, this.speed, dt);
      if (!r.arrive) return leverToward(r.dirX, r.dirZ);
      m.pos.x = this.pos.x;
      m.pos.z = this.pos.z;
      this.movePos = false;
    }
    if (this.moveRot) {
      m.targetYaw = this.yaw;
      this.moveRot = false;
    }
    return NO_LEVER;
  }
}

export class RemoteMotion {
  readonly interp = new AutoInterpolation();
  mode: RemoteMode = 'spawn';
  rx = 0;

  constructor(readonly mover: PlazaMover) {}

  private ground(p: THREE.Vector3): THREE.Vector3 {
    return this.mover.projectGround(p);
  }

  spawn(pos: THREE.Vector3, yawDeg: number): void {
    this.mover.place(this.ground(pos.clone()), yawDeg);
    this.interp.stop();
    this.mode = 'spawn';
    this.rx++;
  }

  /** OnReceive: 거리 > 5 순간이동, ≤ 1 회전만, 사이 = 위치·회전 보간 [판독] */
  receive(pos: THREE.Vector3, yawDeg: number): RemoteMode {
    this.rx++;
    const d = this.mover.pos.distanceTo(pos);
    if (d > TELEPORT_DIST) {
      this.mover.place(this.ground(pos.clone()), yawDeg);
      this.mode = 'teleport';
    } else if (d <= ROTATE_ONLY_DIST) {
      this.interp.startRotate(yawDeg);
      this.mode = 'rotate';
    } else {
      this.interp.start(pos, yawDeg);
      this.mode = 'interp';
    }
    return this.mode;
  }

  tick(): ActionName {
    const a = this.mover.tick(this.interp.calculate(this.mover));
    const p = this.mover.pos;
    const top = this.mover.projectGround(p.clone(), 1000);
    if (p.y < top.y - 1) this.mover.place(top, this.mover.yaw);
    return a;
  }
}

/** 광선 대 삼각형(원본 충돌 메시, PhysicsModule::CastRayAll 필터 4 자리) */
export function meshRayBlocked(col: unknown): RayBlocked {
  if (!(col instanceof MeshCollider)) return () => false;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const v = col.v;
  const t = col.tri;
  return (from, dir, len) => {
    const ray = new THREE.Ray(from, dir);
    const minX = Math.min(from.x, from.x + dir.x * len) - 0.01;
    const maxX = Math.max(from.x, from.x + dir.x * len) + 0.01;
    const minZ = Math.min(from.z, from.z + dir.z * len) - 0.01;
    const maxZ = Math.max(from.z, from.z + dir.z * len) + 0.01;
    for (let i = 0; i < t.length; i += 3) {
      const i0 = t[i] * 3;
      const i1 = t[i + 1] * 3;
      const i2 = t[i + 2] * 3;
      if (Math.max(v[i0], v[i1], v[i2]) < minX || Math.min(v[i0], v[i1], v[i2]) > maxX) continue;
      if (Math.max(v[i0 + 2], v[i1 + 2], v[i2 + 2]) < minZ || Math.min(v[i0 + 2], v[i1 + 2], v[i2 + 2]) > maxZ) continue;
      a.set(v[i0], v[i0 + 1], v[i0 + 2]);
      b.set(v[i1], v[i1 + 1], v[i1 + 2]);
      c.set(v[i2], v[i2 + 1], v[i2 + 2]);
      if (ray.intersectTriangle(a, b, c, false, hit) && hit.distanceTo(from) <= len) return true;
    }
    return false;
  };
}

/** 광장 사람(COM 제외, 이 기기) — 슬롯 순 */
export function plazaHumans(players: readonly PlazaPlayerSetup[]): PlazaPlayerSetup[] {
  return players.filter((p) => p.local && !p.isCom).sort((x, y) => x.slot - y.slot);
}

const yawOfQuat = (q: THREE.Quaternion): number => {
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return THREE.MathUtils.radToDeg(Math.atan2(f.x, f.z));
};

interface Body {
  chara: PlazaChara;
  mover: PlazaMover;
  actor: PlazaActor;
}

interface Follower extends Body {
  logic: FollowLogic;
  leaderSlot: number;
}

interface Remote extends Body {
  station: string;
  motion: RemoteMotion;
}

/** 원격 표시 사건(D 의 FakeOnline/online, docs §5.1) */
export interface NetRemote {
  station: string;
  slot: number;
  chara: string;
  pos: number[];
  quat: number[];
}

export class FollowSystem {
  readonly followers: Follower[] = [];
  /** 키 = 스테이션#슬롯(PlayerManager 원격 맵 키 NetworkPlayerInfo) */
  readonly remotes = new Map<string, Remote>();
  private loader: PlazaCharaLoader | null = null;
  private acc = 0;
  private readonly blocked: RayBlocked;
  private disposed = false;
  private readonly loading = new Map<string, NetRemote>();
  enabled = true;

  constructor(private readonly ctx: PlazaContext) {
    if (!ctx.world.actorWorld) throw new Error('Plaza actor world is not ready');
    this.blocked = (from, dir, len) => {
      const hit = emptyActorHit();
      return ctx.world.actorWorld!.adapter.ray([from.x, from.y, from.z], [dir.x, dir.y, dir.z], len, 4, { index: -1, generation: 0 }, hit) && hit.validity === 0;
    };
  }

  private async body(pc: string, slot: number, kind: 'follow' | 'remote'): Promise<Body | null> {
    const st = this.ctx.world.stage;
    this.loader ??= await PlazaCharaLoader.create((p) => this.ctx.assetUrl(p));
    const chara = await this.loader.load(pc, st.renderer, (r) => st.prepare(r), plazaCharacterRandApprox(slot + 1));
    if (this.disposed || !this.ctx.world.actorWorld) { chara.dispose(); return null; }
    st.scene.add(chara.root);
    const mover = new PlazaMover(shapeOf(chara.spec), this.ctx.world.actorWorld);
    chara.connect(mover);
    const actor: PlazaActor = { slot, kind, chara: chara.spec.pc, root: chara.root, pos: mover.pos, yaw: 0, speed: 0, motion: chara.motion, height: chara.spec.height };
    this.ctx.actors.push(actor);
    return { chara, mover, actor };
  }

  async load(): Promise<void> {
    const hs = plazaHumans(this.ctx.players);
    for (let i = 1; i < hs.length; i++) {
      const b = await this.body(hs[i].chara, hs[i].slot, 'follow');
      if (!b) return;
      const s = this.ctx.world.pcSocket('balloon', hs.length, i);
      b.mover.place(s ? s.pos : new THREE.Vector3(0, -2.365, 22.316), s ? yawOfQuat(s.quat) : 180);
      this.followers.push({ ...b, logic: new FollowLogic(), leaderSlot: hs[i - 1].slot });
      this.sync(b);
    }
  }

  private leaderPos(slot: number): THREE.Vector3 | null {
    return this.ctx.actors.find((a) => a.slot === slot && (a.kind === 'input' || a.kind === 'follow'))?.pos ?? null;
  }

  private sync(b: Body): void {
    b.chara.root.position.copy(b.mover.pos);
    b.chara.root.quaternion.fromArray(b.mover.core.rotation);
    b.actor.yaw = THREE.MathUtils.degToRad(b.mover.yaw);
    b.actor.speed = b.mover.speed;
    b.actor.motion = b.chara.motion;
  }

  private tickBody(b: Body, lever: Lever): void {
    b.mover.tick(lever);
    b.mover.publish();
  }

  /** 한 프레임(1/60 s) */
  frame(): void {
    if (this.disposed) return;
    for (const f of this.followers) {
      const lp = this.leaderPos(f.leaderSlot);
      let lever = NO_LEVER;
      if (lp && this.enabled) {
        f.logic.step(f.mover.pos, lp, this.blocked);
        if (f.logic.running) {
          const r = autoInterp(f.mover.pos, f.logic.target);
          if (r.arrive) {
            f.mover.pos.x = f.logic.target.x;
            f.mover.pos.z = f.logic.target.z;
            f.logic.running = false;
          } else lever = leverToward(r.dirX, r.dirZ);
        }
      }
      this.tickBody(f, lever);
    }
    for (const r of this.remotes.values()) {
      r.motion.tick();
      r.mover.publish();
    }
  }

  /** PlayerManager::OnReceive 결과(mode 는 RemoteMotion.receive 가 표시 위치 기준 원본 규칙 > 5 순간이동·≤ 1 회전만·그 사이 보간으로 정함) */
  async remote(e: NetRemote): Promise<void> {
    if (this.disposed) return;
    const key = `${e.station}#${e.slot}`;
    const r = this.remotes.get(key);
    const pos = new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);
    const yaw = yawOfQuat(new THREE.Quaternion(e.quat[0], e.quat[1], e.quat[2], e.quat[3]));
    if (!r) {
      if (this.loading.has(key)) {
        this.loading.set(key, e);
        return;
      }
      this.loading.set(key, e);
      const b = await this.body(e.chara, e.slot, 'remote');
      if (!b) { this.loading.delete(key); return; }
      const last = this.loading.get(key);
      if (!last) {
        this.drop(b);
        return;
      }
      this.loading.delete(key);
      const motion = new RemoteMotion(b.mover);
      motion.spawn(new THREE.Vector3(last.pos[0], last.pos[1], last.pos[2]), yawOfQuat(new THREE.Quaternion(last.quat[0], last.quat[1], last.quat[2], last.quat[3])));
      const nr: Remote = { ...b, station: e.station, motion };
      this.remotes.set(key, nr);
      this.sync(nr);
      return;
    }
    r.motion.receive(pos, yaw);
  }

  private drop(body: Body): void {
    const i = this.ctx.actors.indexOf(body.actor);
    if (i >= 0) this.ctx.actors.splice(i, 1);
    body.mover.dispose(); body.chara.dispose();
  }

  /** 스테이션 이탈·세션 끝(ResetRemotePlayer) — 그 스테이션의 모든 슬롯 */
  removeRemote(station: string): void {
    for (const k of [...this.loading.keys()]) if (k.startsWith(`${station}#`)) this.loading.delete(k);
    for (const [k, r] of [...this.remotes]) {
      if (r.station !== station) continue;
      this.drop(r);
      this.remotes.delete(k);
    }
  }

  update(df: number): void {
    this.acc += df;
    while (this.acc >= 1 - 1e-6) {
      this.acc -= 1;
      this.frame();
    }
    for (const f of this.followers) this.sync(f);
    for (const r of this.remotes.values()) this.sync(r);
  }

  /** 기구 출발 등 장면 전환(PlayerManager::ResetLocalPlayer/ResetRemotePlayer) */
  setVisible(v: boolean): void {
    for (const f of this.followers) f.chara.root.visible = v;
    for (const r of this.remotes.values()) r.chara.root.visible = v;
  }

  debug(): unknown {
    return {
      followers: this.followers.map((f) => ({
        slot: f.actor.slot,
        leader: f.leaderSlot,
        pc: f.chara.spec.pc,
        pos: f.mover.pos.toArray(),
        running: f.logic.running,
        target: f.logic.target.toArray(),
        trail: f.logic.count,
        motion: f.chara.motion,
      })),
      remotes: [...this.remotes.values()].map((r) => ({ station: r.station, slot: r.actor.slot, pc: r.chara.spec.pc, pos: r.mover.pos.toArray(), motion: r.chara.motion, mode: r.motion.mode, rx: r.motion.rx, target: r.motion.interp.movePos ? r.motion.interp.pos.toArray() : null, rot: r.motion.interp.moveRot })),
    };
  }

  dispose(): void {
    this.disposed = true; this.loading.clear();
    for (const b of [...this.followers, ...this.remotes.values()]) {
      const i = this.ctx.actors.indexOf(b.actor);
      if (i >= 0) this.ctx.actors.splice(i, 1);
      b.mover.dispose();
      b.chara.dispose();
    }
    this.followers.length = 0; this.remotes.clear();
  }
}

const registry = new WeakMap<PlazaContext, FollowSystem>();

export function followSystemOf(ctx: PlazaContext): FollowSystem | null {
  return registry.get(ctx) ?? null;
}

export const createFollow: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const sys = new FollowSystem(ctx);
  try { await sys.load(); }
  catch (error) { sys.dispose(); throw error; }
  registry.set(ctx, sys);
  const offs = [
    ctx.on('net:remote', (v) => void sys.remote(v as NetRemote)),
    ctx.on('net:remoteLeft', (v) => sys.removeRemote((v as { station: string }).station)),
    ctx.on('player:input', (v) => {
      sys.enabled = !!v;
    }),
  ];
  return {
    name: 'follow',
    update(df) {
      sys.update(df);
    },
    debug() {
      return sys.debug();
    },
    dispose() {
      for (const o of offs) o();
      sys.dispose();
      registry.delete(ctx);
    },
  };
};
