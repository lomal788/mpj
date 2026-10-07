/**
 * 광장 상호작용 — SequenceMainMenu::MainImpl @0x710005a170 축소판(docs/shell/plaza_3d.md §6.10 ①) [판독 + 어셈블리].
 * 영역(GetArea @0x710001a434)·다가가기 결과·안내(ComUiPopGuide 위치 = 1번 머리 PCHeight×0.8)·A 결정·MC/상점 직원 반응·장소 텔롭 신호.
 * 결정 뒤: 6 기구 → balloon.ts. 그 밖(가이드·퀘스트·상점·데이터 하우스·랭킹·친구 매치 3·OverView 13)은 'interact:decide' 만 내고
 * 곧바로 광장으로 돌아온다 [설계: §8 "안내까지만"]. 친구 매치 메뉴(X)는 D 가 연다.
 */
import * as THREE from 'three';
import { npcSystemOf, type Npc, type NpcSystem } from './npc';
import { PLAZA_BTN, type PlazaActor, type PlazaContext, type PlazaPart, type PlazaPartFactory } from './types';

/** menu00::AREA(D 계약과 같은 번호) */
export const AREA = { BALLOON: 0, GUIDE: 1, STAMP: 2, CARD: 3, MUSIC: 4, DATAHOUSE: 5, RANKING: 6, FRIEND: 7, QUEST: 8 } as const;

/** SequenceMainMenu 상태(UpdateImpl 람다 표) */
export const RESULT = { MAIN: 2, ONLINE_MENU: 3, FRIEND_INVITED: 4, GUIDE: 5, BALLOON: 6, QUEST: 7, STAMP: 8, CARD: 9, MUSIC: 10, DATAHOUSE: 11, RANKING: 12, OVERVIEW: 13 } as const;

export const RESULT_TARGET: Record<number, string> = {
  3: 'friend',
  5: 'guide',
  6: 'balloon',
  7: 'quest',
  8: 'stamp',
  9: 'card',
  10: 'music',
  11: 'datahouse',
  12: 'ranking',
  13: 'overview',
};

/** GetArea 각 경계(°, 오름차순) → 영역 [판독 어셈블리] */
const AREA_STEPS: [number, number][] = [
  [70, 1],
  [110, 6],
  [160, 5],
  [200, 4],
  [245, 3],
  [290, 2],
  [330, 8],
];

/** bq::act::Man::CalcTurnDegY [판독 main @0x71002deb10]: atan2(x, z)° 를 [0, 360) 으로 */
export function calcTurnDegY(x: number, z: number): number {
  let d = (Math.atan2(x, z) * 180) / Math.PI;
  while (d < 0) d += 360;
  while (d >= 360) d -= 360;
  return d;
}

/** MapManager::GetArea(p), center = GetPosNodeLocater(0) = camera00_pos */
export function getArea(p: { x: number; z: number }, center: { x: number; z: number }): number {
  if (p.z < 18 && p.x < 9 && p.x > -9) return AREA.BALLOON;
  const deg = calcTurnDegY(center.x - p.x, center.z - p.z);
  for (const [lim, a] of AREA_STEPS) if (deg < lim) return a;
  return AREA.FRIEND;
}

/** 다가가기 판정에 쓰는 로케이터(GetPosNodeLocater i / GetPosNodeQuest 0) */
export interface InteractPoints {
  center: THREE.Vector3;
  mc: THREE.Vector3;
  quest: THREE.Vector3;
  stamp: THREE.Vector3;
  card: THREE.Vector3;
  music: THREE.Vector3;
  datahouse: THREE.Vector3;
  ranking: THREE.Vector3;
  friend: THREE.Vector3;
}

export const POINT_SOCKETS: Record<keyof InteractPoints, string> = {
  center: 'camera00_pos',
  mc: 'mc_plaza_default_pos',
  quest: 'menu00_ev_quest_start_cut00_npc00_pos',
  stamp: 'shop_npc00_pos',
  card: 'shop_npc01_pos',
  music: 'attach_shop_music',
  datahouse: 'shop_npc02_pos',
  ranking: 'attach_shop_ranking',
  friend: 'friendmatch_obj00_pos',
};

export interface Judge {
  area: number;
  /** 결정하면 갈 상태(0 = 없음) */
  result: number;
  /** 안내를 띄움(bVar7 == 0) */
  show: boolean;
  /** MC 3 m 안(FragSwing·서로 보기) */
  nearMc: boolean;
}

/** MainImpl 의 결과 고르기 [판독 @0x710005a170~0x710005b2b4] */
export function judge(p: THREE.Vector3, pts: InteractPoints, humans: number, online: boolean, netReady = true): Judge {
  const area = getArea(p, pts.center);
  if (area === AREA.BALLOON) {
    if (!online) return { area, result: RESULT.BALLOON, show: true, nearMc: false };
    return netReady ? { area, result: RESULT.BALLOON, show: true, nearMc: false } : { area, result: 0, show: false, nearMc: false };
  }
  if (p.distanceTo(pts.mc) < 3) return online ? { area, result: 0, show: false, nearMc: false } : { area, result: RESULT.GUIDE, show: true, nearMc: true };
  const near: [THREE.Vector3, number, number][] = [
    [pts.quest, 3, RESULT.QUEST],
    [pts.stamp, 7, RESULT.STAMP],
    [pts.card, 7, RESULT.CARD],
    [pts.music, 7, RESULT.MUSIC],
    [pts.datahouse, 7, RESULT.DATAHOUSE],
    [pts.ranking, 7, RESULT.RANKING],
  ];
  for (const [q, r, res] of near) if (p.distanceTo(q) < r) return online ? { area, result: 0, show: false, nearMc: false } : { area, result: res, show: true, nearMc: false };
  if (p.distanceTo(pts.friend) < 3) {
    if (online) return { area, result: 0, show: false, nearMc: false };
    return humans < 4 ? { area, result: RESULT.ONLINE_MENU, show: true, nearMc: false } : { area, result: 0, show: false, nearMc: false };
  }
  return { area, result: 0, show: false, nearMc: false };
}

/** ComUiPopGuide 위치: 1번 + (0, PCHeight·0.8, 0) 의 뷰포트 → 레이아웃(x·960 + 70, y·540) */
export function popPosition(p: THREE.Vector3, height: number, camera: THREE.Camera): { ndc: [number, number]; x: number; y: number } {
  const v = new THREE.Vector3(p.x, p.y + height * 0.8, p.z).project(camera);
  return { ndc: [v.x, v.y], x: v.x * 1920 * 0.5 + 70, y: v.y * 1080 * 0.5 };
}

export class InteractSystem {
  state = RESULT.MAIN as number;
  judge: Judge = { area: -1, result: 0, show: false, nearMc: false };
  private lastArea = -1;
  private prevButtons = 0;
  private acc = 0;
  private popShown = false;
  private look: THREE.Object3D | null | undefined = undefined;
  online = false;
  friendMenu = false;
  decided: { result: number; target: string; frame: number }[] = [];
  private returnAt = -1;
  private frames = 0;
  pts: InteractPoints;

  constructor(
    private readonly ctx: PlazaContext,
    private readonly npcs: NpcSystem | null,
  ) {
    const s = (k: keyof InteractPoints, d: [number, number, number]): THREE.Vector3 => ctx.world.socket(POINT_SOCKETS[k])?.pos.clone() ?? new THREE.Vector3(...d);
    this.pts = {
      center: s('center', [0, 2, 33]),
      mc: s('mc', [-5.06, -1.92, 19.94]),
      quest: s('quest', [14.93, -2.3, 14.39]),
      stamp: s('stamp', [22.21, -1.85, 33.26]),
      card: s('card', [15.65, -1.9, 48.95]),
      music: s('music', [0, -2.34, 57.49]),
      datahouse: s('datahouse', [-15.72, -1.6, 49]),
      ranking: s('ranking', [-24.19, -2.34, 33.3]),
      friend: s('friend', [5.06, -2.37, 19.8]),
    };
  }

  private player(): PlazaActor | null {
    return this.ctx.actors.find((a) => a.kind === 'input') ?? null;
  }

  private humans(): number {
    return Math.max(1, this.ctx.players.filter((p) => p.local && !p.isCom).length);
  }

  private staff(n: string, look: boolean, p: PlazaActor): void {
    const s = this.npcs?.npc(n);
    if (!s) return;
    if (look) {
      s.lookAt({ obj: p.root });
      if (!s.isAnimExist('bye')) s.addAnimation('bye', 'co_bye00');
      s.play('bye', 0.3);
    } else {
      s.lookAt(null);
      s.idle();
    }
  }

  private mcReact(j: Judge, p: PlazaActor): void {
    const mc: Npc | undefined = this.npcs?.npc('MC') ?? undefined;
    if (!mc) return;
    if (j.nearMc) {
      if (mc.isAnimExist('swing')) mc.play('swing', 0.3);
      mc.lookAt({ obj: p.root, bone: 'head' });
      this.playerLook(p, mc.holder);
      return;
    }
    mc.idle();
    mc.lookAt(j.area === AREA.GUIDE ? { obj: p.root } : null);
    this.playerLook(p, null);
  }

  /** 1번 ComHeading 대상(SetTargetLookAtEntity / SetTargetNone) — 바뀔 때만 'player:look' */
  private playerLook(p: PlazaActor, target: THREE.Object3D | null): void {
    if (target === this.look) return;
    this.look = target;
    this.ctx.emit('player:look', { slot: p.slot, target });
  }

  /** 결정: SE·진동 → PlayerManager::Stop·텔롭 Out·MainMenuLayout Finish → 상태 */
  decide(result: number, se = 'SQ_SE_SYS_DECI'): void {
    const target = RESULT_TARGET[result] ?? String(result);
    this.ctx.sound.se(se);
    this.state = result;
    this.decided.push({ result, target, frame: this.frames });
    this.ctx.emit('player:input', false);
    this.ctx.emit('interact:pop', { visible: false, x: 0, y: 0 });
    this.ctx.emit('interact:telop', { area: this.lastArea, visible: false, detail: true });
    this.ctx.emit('ui:mainLayout', false);
    this.ctx.emit('interact:decide', { result, target });
    this.popShown = false;
    if (result !== RESULT.BALLOON) this.returnAt = this.frames + 1;
  }

  /** 광장으로 돌아옴(상태 2) */
  resume(): void {
    this.state = RESULT.MAIN;
    this.lastArea = -1;
    this.ctx.emit('player:input', true);
    this.ctx.emit('ui:mainLayout', true);
  }

  frame(buttons: number): void {
    this.frames++;
    const trig = buttons & ~this.prevButtons;
    this.prevButtons = buttons;
    if (this.state !== RESULT.MAIN) {
      if (this.returnAt >= 0 && this.frames >= this.returnAt && !this.friendMenu) {
        this.returnAt = -1;
        this.resume();
      }
      return;
    }
    if (this.friendMenu) return;
    const p = this.player();
    if (!p) return;
    const j = judge(p.pos, this.pts, this.humans(), this.online);
    this.judge = j;
    this.mcReact(j, p);
    const pop = popPosition(p.pos, p.height, this.ctx.world.stage.camera);
    this.ctx.emit('interact:pop', { visible: j.show, ndc: pop.ndc, x: pop.x, y: pop.y, icon: 1, rotZ: -45 });
    this.popShown = j.show;
    if (j.show && trig & PLAZA_BTN.A) {
      this.decide(j.result);
      return;
    }
    if (!this.online && trig & PLAZA_BTN.X) {
      this.decide(RESULT.OVERVIEW, 'SQ_SE_SYS_DECI_S');
      return;
    }
    this.staff('StampShopStaff', j.area === AREA.STAMP, p);
    this.staff('CardShopStaff', j.area === AREA.CARD, p);
    this.staff('DataHouseStaff', j.area === AREA.DATAHOUSE, p);
    if (j.area !== this.lastArea) {
      this.lastArea = j.area;
      this.ctx.emit('interact:telop', { area: j.area, visible: true, detail: true });
    }
  }

  update(df: number): void {
    this.acc += df;
    while (this.acc >= 1 - 1e-6) {
      this.acc -= 1;
      const p = this.player();
      this.frame(p ? (this.ctx.pad(p.slot)?.buttons ?? 0) : 0);
    }
  }

  debug(): unknown {
    return { state: this.state, area: this.judge.area, result: this.judge.result, show: this.judge.show, nearMc: this.judge.nearMc, popShown: this.popShown, online: this.online, decided: this.decided };
  }
}

const registry = new WeakMap<PlazaContext, InteractSystem>();

export function interactSystemOf(ctx: PlazaContext): InteractSystem | null {
  return registry.get(ctx) ?? null;
}

export const createInteract: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const sys = new InteractSystem(ctx, npcSystemOf(ctx));
  registry.set(ctx, sys);
  const offs = [
    ctx.on('ui:friendMenu', (v) => {
      sys.friendMenu = !!v;
      ctx.emit('player:input', !v);
    }),
    ctx.on('net:session', (v) => {
      sys.online = !!v;
    }),
  ];
  return {
    name: 'interact',
    update(df) {
      sys.update(df);
    },
    debug() {
      return sys.debug();
    },
    dispose() {
      for (const o of offs) o();
      registry.delete(ctx);
    },
  };
};
