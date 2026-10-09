/**
 * 광장 NPC 11종 — docs/shell/plaza_3d.md §6.10 ③ [판독: NpcManager::Setup* @0x7100039e00~·SequenceMainMenu::Setup @0x7100059700·
 * MapManager::Create @0x7100007280(어셈블리)·NonPlayerCharacter/Kinopio/Nokonoko/Heyho/Patapata @0x710003a730~].
 * 모델 = charselect Preview3D(모델 키마다 한 개, 칸 = NPC 하나)를 광장 장면의 소켓 아래로 옮긴다. 에셋 web/assets/plaza/world/chara(plaza_npc_assets.py).
 * 모션: 원본 AddAnimation(이름 → 모션) 표, PlayAnimation(이름, 0.3) 은 같은 이름이면 다시 시작하지 않는다(09 §6.3).
 * 장식 NPC 묶음 B/C/E = DecoItemData::IsDisplay(0x3F/0x40/0x41) — URL ?decoNpc=BCE(기본 전부 켬 [설계: §8]).
 */
import * as THREE from 'three';
import type { Spec } from '@app/scene/menu/charselect';
import type { MpatRow } from '@game/lib/character';
import { mpatTables, Preview3D } from '@app/scene/menu/charselect/preview3d';
import type { ClipHandle, StageModel } from '@app/common/render3d';
import { createGltfLoader } from '@app/common/render3d/assetLoader';
import { Heading, type HeadParams, type HeadTarget } from './heading';
import { NpcLook } from './npcMaterial';
import { attachToSocket } from './world';
import type { PlazaContext, PlazaPart, PlazaPartFactory } from './types';

type CharaSpec = Spec['chars'][number];

export interface NpcRecord extends HeadParams {
  id: number;
  name: string;
  height: number | null;
  scale: number;
  eyes: Record<string, unknown>[];
}

export interface NpcCharaSpec extends CharaSpec {
  layers: Record<string, string[]>;
  attach: { glb: string; bone: string; t: number[]; rDeg: number[] } | null;
  npc: NpcRecord[];
  missing: string[];
}

export interface NpcSpecFile {
  env: Spec['env'];
  chars: NpcCharaSpec[];
}

/** NonPlayerCharacterID → 모델 키 [데이터 characterlist NPCCharacterData] */
export const NPC_MODEL: Record<number, string> = {
  0x20: 'npc022',
  0x37: 'npc051',
  0x0b: 'npc003',
  0x05: 'npc002',
  0x09: 'npc002st',
  0x01: 'npc001',
  0x04: 'npc001bd',
  0x2e: 'npc044',
  0x2f: 'npc044',
  0x29: 'npc029a',
  0x38: 'npc053',
};

export const BLEND_NPC = 0.3;

export class Npc {
  readonly holder = new THREE.Group();
  readonly anims = new Map<string, string>([['idle', 'co_idle00']]);
  current = '';
  readonly heading: Heading;
  readonly look: NpcLook;
  ready = false;

  constructor(
    readonly name: string,
    readonly id: number,
    readonly set: NpcModelSet,
    readonly slot: number,
    readonly color: number | null,
  ) {
    const rec = set.spec.npc.find((r) => r.id === id) ?? set.spec.npc[0];
    this.heading = new Heading(rec);
    this.look = new NpcLook(set.spec, color, set.url);
    this.holder.name = name;
  }

  get root(): THREE.Object3D | null {
    return this.set.preview.slots[this.slot]?.root ?? null;
  }

  addAnimation(name: string, motion: string): void {
    this.anims.set(name, motion);
  }

  isAnimExist(name: string): boolean {
    return this.anims.has(name);
  }

  hasMotion(motion: string): boolean {
    return !!this.set.spec.clips?.[motion];
  }

  /** ModelBase::PlayAnim(이름, 섞기) — 같은 이름이면 무시. 섞기 없으면 MotionArg 기본(0.1 s) */
  play(name: string, blend?: number): void {
    if (name === this.current) return;
    const m = this.anims.get(name);
    if (!m || !this.hasMotion(m)) return;
    this.current = name;
    this.set.preview.play(this.slot, m, undefined, blend);
  }

  idle(): void {
    this.play('idle', BLEND_NPC);
  }

  get motion(): string {
    return this.set.preview.slots[this.slot]?.current ?? '';
  }

  get frame(): number {
    return this.set.preview.slots[this.slot]?.frame ?? 0;
  }

  isFinished(): boolean {
    return this.set.preview.slots[this.slot]?.core.main.isFinished() ?? false;
  }

  lookAt(t: HeadTarget): void {
    this.heading.target = t;
  }

  /** NonPlayerCharacter::SetRotateLookAt — 몸을 바로 대상 쪽(수평)으로 */
  faceTo(p: THREE.Vector3): void {
    const w = this.holder.getWorldPosition(new THREE.Vector3());
    const yaw = Math.atan2(p.x - w.x, p.z - w.z);
    const parentQ = this.holder.parent ? this.holder.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.holder.quaternion.copy(parentQ.invert().multiply(want));
  }

  setVisible(v: boolean): void {
    this.holder.visible = v;
  }
}

export class NpcModelSet {
  readonly preview: Preview3D;
  private used = 0;

  constructor(
    readonly spec: NpcCharaSpec,
    env: Spec['env'],
    readonly url: (p: string) => string,
    readonly count: number,
    mpat: MpatRow[][] = [],
  ) {
    this.preview = new Preview3D({ chars: [spec], env } as unknown as Spec, url, undefined, { mpat });
    this.preview.setup(Array.from({ length: count }, () => [1, 1] as [number, number]));
    this.preview.prefetch([0]);
  }

  take(): number {
    const s = this.used++;
    this.preview.setChara(s, 0, true);
    return s;
  }
}

/** 소품(무대 manifest 모델) 하나. 없으면 null */
async function prop(ctx: PlazaContext, model: string, instance: string): Promise<StageModel | null> {
  const st = ctx.world.stage;
  if (!st.manifest.models[model]) {
    console.warn(`plaza npc: 소품 모델이 manifest 에 없다(건너뜀): ${model}`);
    return null;
  }
  return st.loadModel(model, { instance });
}

type DecoGroup = 'B' | 'C' | 'E';

interface DecoNpcDef {
  group: DecoGroup;
  name: string;
  id: number;
  color: number | null;
  /** AttachLocaterDecoNpc 뼈, 또는 loc 소품의 뼈 */
  socket: string;
  host?: string;
  motion: string;
  badminton?: { loc: string; threshold: number; swing: string };
  hand?: { bone: string; model: string }[];
  hat?: boolean;
}

interface DecoPropDef {
  group: DecoGroup;
  name: string;
  model: string;
  socket: string;
  host?: string;
  clip?: string;
}

const NOKO = 0x0b;
const HEYHO = 0x05;
const PATA = 0x38;
const RACKET = [{ bone: 'attach_R_hand', model: 'menu00_obj_racket00' }];
const BUBBLES = [
  { bone: 'attach_L_hand', model: 'menu00_bubble00' },
  { bone: 'attach_R_hand', model: 'menu00_bubble01' },
];
const BASKET = [{ bone: 'attach_R_hand', model: 'menu00_basket00' }];

/** MapManager::Create 장식 소품 [판독: 어셈블리, plaza_3d.md §6.10 ③] */
export const DECO_PROPS: DecoPropDef[] = [
  { group: 'E', name: 'Group00_item00_loc', model: 'npc00_obj', socket: 'attach_ground_npc00', clip: 'npc00_obj' },
  { group: 'E', name: 'Group00_item00', model: 'menu00_obj_shuttle00', socket: 'shuttle_anim', host: 'Group00_item00_loc' },
  { group: 'E', name: 'Group00_item01_loc', model: 'npc07_obj', socket: 'attach_ground_npc07', clip: 'npc07_obj' },
  { group: 'E', name: 'Group00_item01', model: 'menu00_obj_shuttle00', socket: 'shuttle_anim', host: 'Group00_item01_loc' },
  { group: 'E', name: 'Group02_item_loc', model: 'npc02_obj', socket: 'attach_ground_npc02', clip: 'npc02_obj' },
  { group: 'E', name: 'Group02_item', model: 'menu00_ast_beachball00', socket: 'ball_anim', host: 'Group02_item_loc' },
  { group: 'E', name: 'Group03_npc01_item', model: 'menu00_chair00', socket: 'pos_chiar_b' },
  { group: 'E', name: 'Group03_npc02_item', model: 'menu00_chair00', socket: 'pos_chiar_c' },
  { group: 'E', name: 'Group05_item', model: 'menu00_obj_sheet', socket: 'attach_ground_npc05' },
  { group: 'E', name: 'Group07_item', model: 'menu00_obj_sheet', socket: 'attach_ground_npc08' },
  { group: 'C', name: 'Group01a_loc00', model: 'air_npc03', socket: 'attach_air_npc03', clip: 'air_npc03' },
  { group: 'C', name: 'Group01a_loc01', model: 'air_npc04', socket: 'attach_air_npc04', clip: 'air_npc04' },
  { group: 'C', name: 'Group01a_loc02', model: 'air_npc05', socket: 'attach_air_npc05', clip: 'air_npc05' },
];

/** MapManager::Create 장식 NPC [판독: 어셈블리 — 생성자 인자(ID·색)·소켓·모션] */
export const DECO_NPCS: DecoNpcDef[] = [
  { group: 'E', name: 'Group00_npc00', id: NOKO, color: 1, socket: 'pos_npc00_a', motion: 'park_bmt_idle00', badminton: { loc: 'Group00_item00_loc', threshold: 90, swing: 'park_bmt_swing00' }, hand: RACKET },
  { group: 'E', name: 'Group00_npc01', id: NOKO, color: 1, socket: 'pos_npc00_b', motion: 'park_bmt_idle00', badminton: { loc: 'Group00_item00_loc', threshold: 46, swing: 'park_bmt_swing01' }, hand: RACKET },
  { group: 'E', name: 'Group00_npc02', id: NOKO, color: 1, socket: 'pos_npc07_a', motion: 'park_bmt_idle00', badminton: { loc: 'Group00_item01_loc', threshold: 90, swing: 'park_bmt_swing00' }, hand: RACKET },
  { group: 'E', name: 'Group00_npc03', id: NOKO, color: 1, socket: 'pos_npc07_b', motion: 'park_bmt_idle00', badminton: { loc: 'Group00_item01_loc', threshold: 46, swing: 'park_bmt_swing01' }, hand: RACKET },
  { group: 'E', name: 'Group01_npc00', id: 0x09, color: null, socket: 'pos_npc01_a', motion: 'co_talk00' },
  { group: 'E', name: 'Group01_npc01', id: 0x04, color: null, socket: 'pos_npc01_b', motion: 'co_talk01' },
  { group: 'E', name: 'Group02_npc00', id: 0x01, color: null, socket: 'pos_npc02_a', motion: 'bd_volley00' },
  { group: 'E', name: 'Group02_npc01', id: 0x01, color: null, socket: 'pos_npc02_b', motion: 'bd_volley01' },
  { group: 'E', name: 'Group03_npc00', id: 0x2e, color: null, socket: 'pos_npc03_a', motion: 'park_guitar00', hand: [{ bone: 'attach_L_hand', model: 'menu00_obj_guitar' }] },
  { group: 'E', name: 'Group03_npc01', id: HEYHO, color: 1, socket: 'pos_npc03_b', motion: 'sit_idle01' },
  { group: 'E', name: 'Group03_npc02', id: NOKO, color: 1, socket: 'pos_npc03_c', motion: 'sit_idle01' },
  { group: 'E', name: 'Group04_npc00', id: 0x2f, color: null, socket: 'pos_npc04_a', motion: 'co_talk00' },
  { group: 'E', name: 'Group04_npc01', id: NOKO, color: 0, socket: 'pos_npc04_b', motion: 'co_talk00', hat: true },
  { group: 'E', name: 'Group05_npc00', id: NOKO, color: 1, socket: 'pos_npc05_a', motion: 'sit_talk00' },
  { group: 'E', name: 'Group05_npc01', id: HEYHO, color: 1, socket: 'pos_npc05_b', motion: 'sit_talk00' },
  { group: 'E', name: 'Group06_npc00', id: 0x04, color: null, socket: 'pos_npc06_a', motion: 'co_talk00' },
  { group: 'E', name: 'Group06_npc01', id: 0x29, color: null, socket: 'pos_npc06_b', motion: 'co_talk00' },
  { group: 'E', name: 'Group07_npc00', id: 0x01, color: null, socket: 'pos_npc08_a', motion: 'bd_sit_talk00' },
  { group: 'E', name: 'Group07_npc01', id: HEYHO, color: 2, socket: 'pos_npc08_b', motion: 'sit_talk00' },
  { group: 'B', name: 'Group00a_npc00', id: PATA, color: 1, socket: 'attach_air_npc00', motion: 'bd_bubble00', hand: BUBBLES },
  { group: 'B', name: 'Group00a_npc01', id: PATA, color: 1, socket: 'attach_air_npc01', motion: 'bd_bubble00', hand: BUBBLES },
  { group: 'B', name: 'Group00a_npc02', id: PATA, color: 1, socket: 'attach_air_npc02', motion: 'bd_bubble00', hand: BUBBLES },
  { group: 'C', name: 'Group01a_npc00', id: PATA, color: null, socket: 'npc03_anim', host: 'Group01a_loc00', motion: 'bd_flower00', hand: BASKET },
  { group: 'C', name: 'Group01a_npc01', id: PATA, color: null, socket: 'npc04_anim', host: 'Group01a_loc01', motion: 'bd_flower00', hand: BASKET },
  { group: 'C', name: 'Group01a_npc02', id: PATA, color: null, socket: 'npc05_anim', host: 'Group01a_loc02', motion: 'bd_flower00', hand: BASKET },
];

/** NpcManager [판독 @0x7100039e3c~0x710003a3f0]: 이름·색·소켓(AttachLocater/LOCATER_QUEST)·몸 회전(Y 각, 사원수 반각 규약) */
export const MANAGER_NPCS = [
  { name: 'MC', id: 0x20, color: 1, socket: 'mc_plaza_default_pos', yaw: 0 },
  { name: 'Kameck', id: 0x37, color: null, socket: 'menu00_ev_quest_start_cut00_npc00_pos', yaw: Math.PI },
  { name: 'StampShopStaff', id: 0x20, color: 5, socket: 'shop_npc00_pos', yaw: 0 },
  { name: 'CardShopStaff', id: 0x20, color: 4, socket: 'shop_npc01_pos', yaw: 0 },
  { name: 'DataHouseStaff', id: 0x20, color: 3, socket: 'shop_npc02_pos', yaw: 0 },
] as const;

interface Badminton {
  npc: Npc;
  loc: ClipHandle | null;
  threshold: number;
  swing: string;
  state: 'waitHigh' | 'swing' | 'waitLow';
}

export class NpcSystem {
  readonly npcs = new Map<string, Npc>();
  readonly props = new Map<string, StageModel>();
  private readonly propClips = new Map<string, ClipHandle>();
  readonly sets = new Map<string, NpcModelSet>();
  private readonly badminton: Badminton[] = [];
  readonly groups: Record<DecoGroup, boolean>;
  private readonly hands: { npc: Npc; bone: string; obj: THREE.Object3D; offset?: THREE.Matrix4 }[] = [];
  private acc = 0;

  constructor(
    private readonly ctx: PlazaContext,
    readonly spec: NpcSpecFile,
  ) {
    const p = (ctx.params.get('decoNpc') ?? 'BCE').toUpperCase();
    this.groups = { B: p.includes('B'), C: p.includes('C'), E: p.includes('E') };
  }

  get mc(): Npc {
    return this.npcs.get('MC')!;
  }

  npc(name: string): Npc | null {
    return this.npcs.get(name) ?? null;
  }

  private chara(key: string): NpcCharaSpec | null {
    return this.spec.chars.find((c) => c.pc === key) ?? null;
  }

  /** 이 구성에서 만들 NPC 수(모델 키별) → Preview3D 칸 수 */
  plan(extraKinopio: number): Map<string, number> {
    const n = new Map<string, number>();
    const add = (id: number): void => {
      const k = NPC_MODEL[id];
      n.set(k, (n.get(k) ?? 0) + 1);
    };
    for (const m of MANAGER_NPCS) add(m.id);
    for (const d of DECO_NPCS) if (this.groups[d.group]) add(d.id);
    for (let i = 0; i < extraKinopio; i++) add(0x20);
    return n;
  }

  async load(extraKinopio: number): Promise<void> {
    const url = (p: string): string => this.ctx.assetUrl(`plaza/world/chara/${p}`);
    const mp = await fetch(this.ctx.assetUrl('chara/mpat.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    for (const [k, count] of this.plan(extraKinopio)) {
      const c = this.chara(k);
      if (c) this.sets.set(k, new NpcModelSet(c, this.spec.env, url, count, mpatTables(mp, [`sys_${k.match(/^npc\d+/)?.[0] ?? k}`, 'sys_npc'])));
    }
    for (const m of MANAGER_NPCS) this.make(m.name, m.id, m.color);
    for (const d of DECO_NPCS) if (this.groups[d.group]) this.make(d.name, d.id, d.color);
    await this.waitModels();
    await this.placeProps();
    this.placeManager();
    await this.placeDeco();
  }

  make(name: string, id: number, color: number | null): Npc | null {
    const set = this.sets.get(NPC_MODEL[id]);
    if (!set) return null;
    const npc = new Npc(name, id, set, set.take(), color);
    this.npcs.set(name, npc);
    return npc;
  }

  /** Preview3D 준비(읽기·컴파일·텍스처) → 칸 모델을 홀더로 옮기고 무대 재질 준비 */
  async waitModels(): Promise<void> {
    const st = this.ctx.world.stage;
    const t0 = performance.now();
    const pending = (): Npc[] => [...this.npcs.values()].filter((n) => !n.ready);
    while (pending().length) {
      for (const s of this.sets.values()) s.preview.render(st.renderer);
      for (const n of pending()) {
        const r = n.root;
        if (!r) continue;
        n.holder.add(r);
        n.look.bind(r, n.set.spec);
        n.heading.bind(r);
        await st.prepare(n.holder);
        n.ready = true;
      }
      if (performance.now() - t0 > 60000) {
        console.warn('plaza npc: 모델 준비 시간 초과', pending().map((n) => n.name));
        break;
      }
      if (pending().length) await new Promise((res) => setTimeout(res, 0));
    }
  }

  private socketNode(name: string, host?: string): THREE.Object3D | null {
    if (host) {
      const h = this.props.get(host);
      return h?.root.getObjectByName(name) ?? null;
    }
    return this.ctx.world.socket(name)?.node ?? null;
  }

  private placeManager(): void {
    for (const m of MANAGER_NPCS) {
      const npc = this.npcs.get(m.name);
      const node = this.socketNode(m.socket);
      if (!npc) continue;
      if (node) attachToSocket(node, npc.holder);
      else console.warn(`plaza npc: 소켓 없음 ${m.socket}`);
      npc.holder.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw);
      npc.look.setColor(m.color);
    }
    const mc = this.mc;
    for (const [k, v] of [
      ['idle', 'bd_flag_idle00'],
      ['talk', 'bd_flag_talk00'],
      ['swing', 'bd_flag_swing00'],
      ['walk', 'bd_flag_walk00'],
    ])
      mc.addAnimation(k, v);
    void this.handProp(mc, 'attach_R_hand', 'menu00_guide_flag00', 'kinopio_flag');
    mc.idle();
    const k = this.npcs.get('Kameck');
    if (k) {
      for (const [a, b] of [
        ['talk', 'co_talk00'],
        ['bye', 'co_bye01'],
        ['walk', 'co_walk00'],
        ['busy', 'co_busy00'],
      ])
        k.addAnimation(a, b);
      k.play('idle', BLEND_NPC);
      k.play('busy', BLEND_NPC);
    }
    for (const n of ['StampShopStaff', 'CardShopStaff', 'DataHouseStaff']) this.npcs.get(n)?.idle();
  }

  private async placeProps(): Promise<void> {
    for (const p of DECO_PROPS) {
      if (!this.groups[p.group]) continue;
      const m = await prop(this.ctx, p.model, p.name);
      if (!m) continue;
      const node = this.socketNode(p.socket, p.host);
      if (node) attachToSocket(node, m.root);
      this.props.set(p.name, m);
      if (p.clip) {
        const h = m.play(p.clip, { loop: true });
        if (h) this.propClips.set(p.name, h);
      }
    }
  }

  private async placeDeco(): Promise<void> {
    for (const d of DECO_NPCS) {
      const npc = this.npcs.get(d.name);
      if (!npc) continue;
      const node = this.socketNode(d.socket, d.host);
      if (node) attachToSocket(node, npc.holder);
      else console.warn(`plaza npc: 소켓 없음 ${d.socket}`);
      npc.look.setColor(d.color);
      npc.addAnimation(d.motion, d.motion);
      if (d.badminton) {
        npc.play(d.motion, BLEND_NPC);
        npc.addAnimation(d.badminton.swing, d.badminton.swing);
        this.badminton.push({ npc, loc: this.propClips.get(d.badminton.loc) ?? null, threshold: d.badminton.threshold, swing: d.badminton.swing, state: 'waitHigh' });
      } else npc.play(d.motion);
      for (const h of d.hand ?? []) await this.handProp(npc, h.bone, h.model, `${d.name}_item`);
      if (d.hat) await this.attachHat(npc);
    }
  }

  /** ModelBase::Create(소품) + SetModelHook(손 뼈) */
  private async handProp(npc: Npc, bone: string, model: string, instance: string): Promise<void> {
    const m = await prop(this.ctx, model, `${instance}_${npc.name}_${bone}`);
    const r = npc.root;
    const b = r?.getObjectByName(bone);
    if (!m || !b) return;
    b.add(m.root);
    this.hands.push({ npc, bone, obj: m.root });
  }

  /** NPCAttachModelFilePath/NodeName/OffsetTrans/Rot(0x0B) — 노코노코 모자 [판독 Create @0x710000e390~] */
  private async attachHat(npc: Npc): Promise<void> {
    const a = npc.set.spec.attach;
    const r = npc.root;
    if (!a || !r) return;
    const b = r.getObjectByName(a.bone);
    if (!b) return;
    const g = await createGltfLoader().loadAsync(this.ctx.assetUrl(`plaza/world/chara/${a.glb}`));
    const hat = g.scene;
    hat.position.set(a.t[0], a.t[1], a.t[2]);
    hat.rotation.set(THREE.MathUtils.degToRad(a.rDeg[0]), THREE.MathUtils.degToRad(a.rDeg[1]), THREE.MathUtils.degToRad(a.rDeg[2]), 'ZYX');
    await this.ctx.world.stage.prepare(hat);
    b.add(hat);
  }

  /** Nokonoko::BadmintonSmash/Rob 파이버 [판독 @0x710003cae0·@0x710003cc60]: 궤적 모델 프레임 ≥ 문턱 → 스윙 → 끝 → idle → 문턱 이하 대기 */
  private stepBadminton(): void {
    for (const b of this.badminton) {
      const f = b.loc ? b.loc.frame : 0;
      if (b.state === 'waitHigh') {
        if (b.loc && f >= b.threshold) {
          b.npc.current = '';
          b.npc.play(b.swing, BLEND_NPC);
          b.state = 'swing';
        }
      } else if (b.state === 'swing') {
        if (b.npc.isFinished()) {
          b.npc.play('park_bmt_idle00', BLEND_NPC);
          b.state = 'waitLow';
        }
      } else if (f <= b.threshold) b.state = 'waitHigh';
    }
  }

  update(df: number): void {
    this.acc += df;
    let steps = 0;
    while (this.acc >= 1 - 1e-6) {
      this.acc -= 1;
      steps++;
      this.stepBadminton();
      for (const s of this.sets.values()) s.preview.update();
    }
    if (!steps) return;
    for (const n of this.npcs.values()) {
      if (!n.ready || !n.root) continue;
      n.look.apply(n.set.preview.slots[n.slot]);
      n.heading.apply(n.root, steps);
      n.look.applyEyes(n.heading);
    }
  }

  debug(): unknown {
    return {
      groups: this.groups,
      npcs: [...this.npcs.values()].map((n) => ({
        name: n.name,
        id: n.id,
        key: n.set.spec.pc,
        ready: n.ready,
        color: n.color,
        anim: n.current,
        motion: n.motion,
        visible: n.holder.visible,
        parent: n.holder.parent?.name ?? null,
        pos: n.holder.getWorldPosition(new THREE.Vector3()).toArray(),
      })),
      props: [...this.props.keys()],
      badminton: this.badminton.map((b) => ({ npc: b.npc.name, state: b.state, frame: b.loc?.frame ?? null })),
    };
  }

  dispose(): void {
    for (const n of this.npcs.values()) n.holder.removeFromParent();
    for (const s of this.sets.values()) s.preview.dispose();
  }
}

const registry = new WeakMap<PlazaContext, NpcSystem>();

export function npcSystemOf(ctx: PlazaContext): NpcSystem | null {
  return registry.get(ctx) ?? null;
}

export const createNpcs: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const r = await fetch(ctx.assetUrl('plaza/world/chara/spec.json'));
  if (!r.ok) throw new Error(`plaza npc spec 를 읽지 못했다: ${r.status}`);
  const sys = new NpcSystem(ctx, (await r.json()) as NpcSpecFile);
  await sys.load(1);
  registry.set(ctx, sys);
  return {
    name: 'npc',
    update(df) {
      sys.update(df);
    },
    debug() {
      return sys.debug();
    },
    dispose() {
      sys.dispose();
      registry.delete(ctx);
    },
  };
};
