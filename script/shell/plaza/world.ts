/**
 * 광장 무대 — MapStructure.json(manifest.plaza.layout) 대로 모델을 올리고, 부착(hookKey/hookNode)·기본 애니·장식 보임·충돌을 맞춘다.
 * 원본: menu00::MapManager::Create(디컴파일 실패, 표 = MapStructure.json [데이터])·ApplyDecoItem @0x71000148f0·ApplyBgBd @0x71000197e0·
 * GetAttachSocketPc* @0x710001b2b4~·GetCollisionModel @0x710001bec4 (docs/shell/plaza_3d.md §6.5~6.7).
 * 장식 모델은 보일 때만 읽는다 [설계: 처음 로드 줄이기].
 */
import * as THREE from 'three';
import { MeshCollider, Stage3D, type AssetSource, type ClipHandle, type ClipOptions, type Collider, type MeshColliderData, type SocketPose, type StageModel } from '../stage3d';
import { decoVisible, defaultDecoState } from './deco';
import type { PlazaCameraParam, PlazaDecoState, PlazaLayoutEntry, PlazaWorld } from './types';

export interface PlazaWorldOptions {
  canvas: HTMLCanvasElement;
  /** web/assets/plaza/world/ 기준 */
  assets: AssetSource;
  deco?: Partial<PlazaDecoState>;
  onProgress?(n: number, total: number, what: string): void;
}

export interface PlazaDefaultAnim {
  kind: 'clip' | 'fmab';
  name: string;
  loop: boolean;
  speed: number;
  frame: number;
}

interface PlazaManifestExt {
  layout: PlazaLayoutEntry[];
  /** MapStructure 밖이지만 무대가 늘 올리는 것: 장식 NPC C 비행 경로 air_npc03~05(AttachLocaterDecoNpc/attach_air_npc03~05, 뼈 npc03~05_anim) [판독 C 갈래 §6.11 표] */
  extraLayout?: PlazaLayoutEntry[];
  cameraParam: PlazaCameraParam;
  collision: string;
  defaultAnims: Record<string, PlazaDefaultAnim[]>;
}

class OffCollider implements Collider {
  groundHeight(): null {
    return null;
  }
  collide(_pos: THREE.Vector3, move: THREE.Vector3): THREE.Vector3 {
    return move.clone();
  }
}

class World implements PlazaWorld {
  readonly deco: PlazaDecoState;
  readonly anims = new Map<string, ClipHandle[]>();
  private readonly models = new Map<string, StageModel>();
  private readonly loading = new Map<string, Promise<StageModel | null>>();
  private readonly colliders = new Map<string, MeshCollider>();
  private readonly enabled = new Set<string>(['CollisionMain']);
  private readonly off = new OffCollider();
  private readonly byKey: Map<string, PlazaLayoutEntry>;
  collider: Collider;

  constructor(
    readonly stage: Stage3D,
    private readonly ext: PlazaManifestExt,
    deco: PlazaDecoState,
  ) {
    this.deco = deco;
    this.collider = this.off;
    this.byKey = new Map([...ext.layout, ...(ext.extraLayout ?? [])].map((e) => [e.key, e]));
  }

  get layout(): readonly PlazaLayoutEntry[] {
    return this.ext.layout;
  }

  get cameraParam(): PlazaCameraParam {
    return this.ext.cameraParam;
  }

  get frame(): number {
    return this.stage.frame;
  }

  private isModel(e: PlazaLayoutEntry): boolean {
    return e.dir === 'model' && !!this.stage.manifest.models[e.fmdb];
  }

  /** 보일 항목 + 그 부착 대상(보이지 않아도 뼈 위치가 필요) */
  private needed(): PlazaLayoutEntry[] {
    const want = new Set<string>();
    const add = (k: string): void => {
      const e = this.byKey.get(k);
      if (!e || want.has(k) || !this.isModel(e)) return;
      want.add(k);
      if (e.hookKey) add(e.hookKey);
    };
    const all = [...this.ext.layout, ...(this.ext.extraLayout ?? [])];
    for (const e of all) if (this.isModel(e) && decoVisible(e, this.deco)) add(e.key);
    return all.filter((e) => want.has(e.key));
  }

  async load(onProgress?: PlazaWorldOptions['onProgress']): Promise<void> {
    const list = this.needed();
    const total = list.length + 1;
    let n = 0;
    const res = await fetch(this.stage.assetUrl(this.ext.collision));
    if (!res.ok) throw new Error(`광장 충돌 데이터를 읽지 못했다: ${res.status}`);
    const col = (await res.json()) as Record<string, MeshColliderData>;
    for (const [k, v] of Object.entries(col)) this.colliders.set(k, new MeshCollider(v));
    this.refreshCollider();
    onProgress?.(++n, total, 'collision');
    for (const e of list) {
      await this.ensure(e.key);
      onProgress?.(++n, total, e.key);
    }
    this.applyVisibility();
  }

  /** 항목 모델을 (아직 없으면) 읽어 부착·기본 애니까지 */
  ensure(key: string): Promise<StageModel | null> {
    let p = this.loading.get(key);
    if (p) return p;
    const e = this.byKey.get(key);
    if (!e || !this.isModel(e)) return Promise.resolve(null);
    p = (async () => {
      const host = e.hookKey ? await this.ensure(e.hookKey) : null;
      const m = await this.stage.loadModel(e.fmdb, { visible: false, instance: e.key });
      if (e.hookKey) {
        const node = host?.root.getObjectByName(e.hookNode);
        if (node) node.add(m.root);
        else console.warn(`광장 부착 소켓 없음: ${e.key} → ${e.hookKey}/${e.hookNode}`);
      }
      const handles: ClipHandle[] = [];
      for (const a of this.ext.defaultAnims[e.key] ?? []) {
        const opts = { loop: a.loop, speed: a.speed, startFrame: a.frame };
        const h = a.kind === 'clip' ? m.play(a.name, opts) : await this.stage.playFmab(m.root, a.name, opts);
        if (h) handles.push(h);
      }
      this.anims.set(e.key, handles);
      this.models.set(e.key, m);
      return m;
    })();
    this.loading.set(key, p);
    return p;
  }

  private refreshCollider(): void {
    const on = [...this.enabled].map((k) => this.colliders.get(k)).filter((c): c is MeshCollider => !!c);
    this.collider = on.length === 0 ? this.off : on.length === 1 ? on[0] : MeshCollider.merge(on);
    this.stage.setCollider(this.collider);
  }

  private applyVisibility(): void {
    for (const e of [...this.ext.layout, ...(this.ext.extraLayout ?? [])]) this.models.get(e.key)?.setVisible(decoVisible(e, this.deco));
  }

  entry(key: string): StageModel | null {
    return this.models.get(key) ?? null;
  }

  socket(name: string): SocketPose | null {
    return this.stage.getSocket(name);
  }

  pcSocket(kind: 'start' | 'balloon' | 'quest_return' | 'datahouse', p: number, pc: number): SocketPose | null {
    return this.socket(`pc_plaza_${kind}_pos_p${p}_pc${String(pc).padStart(2, '0')}`);
  }

  play(key: string, clip: string, opts?: ClipOptions): ClipHandle | null {
    return this.models.get(key)?.play(clip, opts) ?? null;
  }

  setCollisionEnabled(key: 'CollisionMain' | 'CollisionFirst', on: boolean): void {
    if (on) this.enabled.add(key);
    else this.enabled.delete(key);
    this.refreshCollider();
  }

  async setDeco(state: Partial<PlazaDecoState>): Promise<void> {
    if (state.display) this.deco.display = [...state.display];
    if (state.unlockBd !== undefined) this.deco.unlockBd = state.unlockBd;
    for (const e of this.needed()) await this.ensure(e.key);
    this.applyVisibility();
  }

  addUpdater(u: { update(df: number, frame: number): void }): () => void {
    return this.stage.addUpdater(u);
  }
}

/**
 * 소켓 뼈 아래에 붙이되 소켓의 배율은 따르지 않는다(위치·회전만). 원본 MapManager::GetPosFromBone/GetRotFromBone @0x710001b8cc/@0x710001b92c 은
 * BoneSocket 가상 +0x30 (위치, 회전, 배율) 중 위치·회전만 쓴다 [판독]. 로케이터 뼈는 표시용 배율 100(mc_plaza_default_pos·pc_plaza_*)·50(기구 pos_*)을 가진다 [데이터].
 */
export function attachToSocket(node: THREE.Object3D, obj: THREE.Object3D): void {
  node.add(obj);
  node.updateWorldMatrix(true, false);
  const s = new THREE.Vector3();
  node.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  obj.scale.set(1 / (s.x || 1), 1 / (s.y || 1), 1 / (s.z || 1));
}

/** 무대 만들기 → 보이는 모델·충돌·기본 애니 전부 올린 뒤 돌려준다(= 무대 로드 완료) */
export async function createPlazaWorld(opts: PlazaWorldOptions): Promise<PlazaWorld> {
  const stage = await Stage3D.create({ canvas: opts.canvas, assets: opts.assets });
  const ext = (stage.manifest as unknown as { plaza: PlazaManifestExt }).plaza;
  if (!ext) throw new Error('광장 manifest 에 plaza 절이 없다');
  const deco = defaultDecoState();
  if (opts.deco?.display) deco.display = [...opts.deco.display];
  if (opts.deco?.unlockBd !== undefined) deco.unlockBd = opts.deco.unlockBd;
  const w = new World(stage, ext, deco);
  await w.load(opts.onProgress);
  return w;
}
