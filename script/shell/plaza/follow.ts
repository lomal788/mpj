/**
 * 광장 따라가기(로컬 사람 2~4P)·원격 멤버 표시 — docs/shell/plaza_3d.md §6.10 ② [판독: ComFollowPlayer::ReceiveMessageImpl @0x710003fec0,
 * PlayerManager::Start @0x7100041060·SequenceMainMenu::Setup @0x7100059700, main ComActorAutoInterpolation @0x710001fea0·@0x71000208e8·@0x71000202c0,
 * PlayerManager::OnReceive @0x71000421e0].
 * - 광장에 만드는 플레이어 = PlayerType≠1(COM 아님)·이 기기 사람. 슬롯 i 는 슬롯 i−1 을 따른다. 시작 = pc_plaza_balloon_pos_p<사람 수>_pc<i>.
 * - 캐릭터·이동 = B 의 PlazaCharaLoader·PlazaMover(ComActor 땅 이동). AutoInterpolation 은 목표 쪽 수평 단위 방향을 깊이 1(달리기 6 = 기본 속도 6.0) 레버로 준다 [근사].
 */
import * as THREE from 'three';
import { MeshCollider } from '../stage3d';
import { ACTION_MOTION, NO_LEVER, PlazaCharaLoader, PlazaMover, shapeOf, type Lever, type PlazaChara } from './player';
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
export function autoInterp(self: THREE.Vector3, target: THREE.Vector3, speed = FOLLOW.speed, dt = 1 / 60): { dirX: number; dirZ: number; arrive: boolean } {
  const dx = target.x - self.x;
  const dz = target.z - self.z;
  const l = Math.hypot(dx, dz);
  if (l <= speed * dt) return { dirX: 0, dirZ: 0, arrive: true };
  return { dirX: dx / l, dirZ: dz / l, arrive: false };
}

export function leverToward(dirX: number, dirZ: number, depth = 1): Lever {
  return { depth, dirX, dirZ, deg: THREE.MathUtils.radToDeg(Math.atan2(dirX, dirZ)) };
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
  station: number;
  target: THREE.Vector3 | null;
  yawTarget: number | null;
  speed: number;
}

/** 원격 표시 사건(D 의 FakeOnline/online, docs §5.1) */
export interface NetRemote {
  station: number;
  slot: number;
  chara: string;
  pos: number[];
  quat: number[];
  mode: 'spawn' | 'teleport' | 'rotate' | 'interp';
  speed: number;
}

export class FollowSystem {
  readonly followers: Follower[] = [];
  readonly remotes = new Map<number, Remote>();
  private loader: PlazaCharaLoader | null = null;
  private acc = 0;
  private readonly blocked: RayBlocked;
  private readonly loading = new Set<number>();
  enabled = true;

  constructor(private readonly ctx: PlazaContext) {
    this.blocked = meshRayBlocked(ctx.world.collider);
  }

  private async body(pc: string, slot: number, kind: 'follow' | 'remote'): Promise<Body> {
    const st = this.ctx.world.stage;
    this.loader ??= await PlazaCharaLoader.create((p) => this.ctx.assetUrl(p));
    const chara = await this.loader.load(pc, st.renderer, (r) => st.prepare(r));
    st.scene.add(chara.root);
    const mover = new PlazaMover(shapeOf(chara.spec), this.ctx.world.collider);
    const actor: PlazaActor = { slot, kind, chara: chara.spec.pc, root: chara.root, pos: mover.pos, yaw: 0, speed: 0, motion: chara.motion, height: chara.spec.height };
    this.ctx.actors.push(actor);
    return { chara, mover, actor };
  }

  async load(): Promise<void> {
    const hs = plazaHumans(this.ctx.players);
    for (let i = 1; i < hs.length; i++) {
      const b = await this.body(hs[i].chara, hs[i].slot, 'follow');
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
    b.chara.root.rotation.set(0, THREE.MathUtils.degToRad(b.mover.yaw), 0);
    b.actor.yaw = THREE.MathUtils.degToRad(b.mover.yaw);
    b.actor.speed = b.mover.speed;
    b.actor.motion = b.chara.motion;
  }

  private tickBody(b: Body, lever: Lever): void {
    const a = b.mover.tick(lever);
    if (a !== 'Fall') b.chara.play(ACTION_MOTION[a]);
    b.chara.tick();
  }

  /** 한 프레임(1/60 s) */
  frame(): void {
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
      let lever = NO_LEVER;
      if (r.target) {
        const ai = autoInterp(r.mover.pos, r.target);
        if (ai.arrive) {
          r.mover.pos.x = r.target.x;
          r.mover.pos.z = r.target.z;
          r.target = null;
        } else lever = leverToward(ai.dirX, ai.dirZ, r.speed > 2 + 1e-3 ? 1 : 0.5);
      }
      if (!r.target && r.yawTarget !== null) {
        r.mover.targetYaw = r.yawTarget;
        r.yawTarget = null;
      }
      this.tickBody(r, lever);
      const p = r.mover.pos;
      const top = this.ctx.world.collider.groundHeight(p.x, p.z);
      if (top && p.y < top.y - 1) r.mover.place(new THREE.Vector3(p.x, top.y, p.z), r.mover.yaw);
    }
  }

  /** PlayerManager::OnReceive 결과(mode 는 D 가 원본 규칙 > 5 순간이동·≤ 1 회전만·그 사이 보간으로 정함) */
  async remote(e: NetRemote): Promise<void> {
    let r = this.remotes.get(e.station);
    const pos = new THREE.Vector3(e.pos[0], e.pos[1], e.pos[2]);
    const ground = this.ctx.world.collider.groundHeight(pos.x, pos.z, pos.y + 2);
    if (ground) pos.y = ground.y;
    const yaw = yawOfQuat(new THREE.Quaternion(e.quat[0], e.quat[1], e.quat[2], e.quat[3]));
    if (!r) {
      if (this.loading.has(e.station)) return;
      this.loading.add(e.station);
      const b = await this.body(e.chara, e.slot, 'remote');
      this.loading.delete(e.station);
      b.mover.place(pos, yaw);
      r = { ...b, station: e.station, target: null, yawTarget: null, speed: 0 };
      this.remotes.set(e.station, r);
      this.sync(r);
      return;
    }
    r.speed = e.speed;
    if (e.mode === 'spawn' || e.mode === 'teleport') {
      r.mover.place(pos, yaw);
      r.target = null;
    } else if (e.mode === 'rotate') {
      r.target = null;
      r.yawTarget = yaw;
    } else {
      r.target = pos;
      r.yawTarget = yaw;
    }
  }

  removeRemote(station: number): void {
    const r = this.remotes.get(station);
    if (!r) return;
    const i = this.ctx.actors.indexOf(r.actor);
    if (i >= 0) this.ctx.actors.splice(i, 1);
    r.chara.dispose();
    this.remotes.delete(station);
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
      remotes: [...this.remotes.values()].map((r) => ({ station: r.station, slot: r.actor.slot, pc: r.chara.spec.pc, pos: r.mover.pos.toArray(), motion: r.chara.motion })),
    };
  }

  dispose(): void {
    for (const b of [...this.followers, ...this.remotes.values()]) {
      const i = this.ctx.actors.indexOf(b.actor);
      if (i >= 0) this.ctx.actors.splice(i, 1);
      b.chara.dispose();
    }
  }
}

const registry = new WeakMap<PlazaContext, FollowSystem>();

export function followSystemOf(ctx: PlazaContext): FollowSystem | null {
  return registry.get(ctx) ?? null;
}

export const createFollow: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const sys = new FollowSystem(ctx);
  await sys.load();
  registry.set(ctx, sys);
  const offs = [
    ctx.on('net:remote', (v) => void sys.remote(v as NetRemote)),
    ctx.on('net:remoteLeft', (v) => sys.removeRemote((v as { station: number }).station)),
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
