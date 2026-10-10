/**
 * mg1801 화면 — 원본 모델(그래픽 담당 glb, tools/mg1801_web_models.py 로 복사)로 그린다. 로직 state 만 읽는다.
 * 무대·의자·연습 화살표(mg1801_arrow00)·결과는 stage.ts, 채소는 vegetable.ts, 캐릭터는 character.ts. 칼은 mg1801_knife00 을 attach_R_hand 에 붙인다.
 * 모델을 못 읽으면 상자(회색 박스)로 그린다 — 상자 쪽 근사: 채소·플레이어·조리대 크기와 색, 칼 휘두름 각도.
 * 이펙트(물보라·판정 반짝임·김·PERFECT 의 mg_common_pt_effect_00)는 effects.ts(원본 VFXB 이미터 파라미터, 근사는 그 머리 주석).
 * 못 읽으면 물보라만 고리로 그린다.
 * 2D UI(판정·START/FINISH 텔롭, 점수 게이지, PERFECT, 흰 페이드, 결과 점수판)는 ui.ts 가 원본 레이아웃으로 그린다. 아래 글자 HUD 는 ?debug=1 일 때만.
 * 근사는 각 파일 머리 주석(조명·재질 stage.ts, 레이아웃 재생 view/lyt.ts·ui.ts).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeScene, type Seen } from '../../../../view/dispose';
import type { GameView, SoundSnapshot, ViewContext } from '../../../../game';
import type { Assets, Progress } from '../../../../view/assets';
import { Hud } from '../../../../view/hud';
import type { Mg1801Event, Mg1801State, ObjView } from '../state';
import { rmPerfectView, rmTelopView } from '@app/minigame/kit/rhythm/view/events';
import { RmSoundMap as SoundMap } from '@app/minigame/kit/rhythm/view/sound';
import { type CharaInfo, CharacterActor, CharacterTemplate } from './character';
import { EffectSystem } from './effects';
import { NpcView } from './npc';
import { Stage } from './stage';
import { disposeMg1801Ui, mg1801Ui } from './ui';
import { Vegetable, type VegetableTemplate } from './vegetable';

const VEG_COLOR = [0xd83a2e, 0xc9a36a, 0x6a3a8c, 0xf08a24, 0xe8dcc0];
const VEG_SIZE = [0.9, 0.85, 0.7, 0.5, 0.95];
const JUDGE_COLOR = [0xffe14d, 0x4db8ff, 0xff6b6b];
const PLAYER_COLOR = [0xe5413a, 0x3a7be5, 0x3ab85a, 0xe5c23a];
const TELOP_SEC = 0.6;
/** 채소 종류별 자르기 수 + 1 = 조각 수(토마토 1·감자 2·가지 3·당근 4·버섯 1 자르기) */
const PIECE_COUNT = [2, 3, 4, 5, 2];
/** 원본 풀: 종류마다 15개, id = type·15 + i(logic/objectMan.ts) */
const POOL_PER_TYPE = 15;

interface VegMesh {
  group: THREE.Group;
  pieces: THREE.Mesh[];
  marks: THREE.Mesh[];
}

interface Telop {
  text: string;
  color: string;
  pos: THREE.Vector3;
  t: number;
}

interface Splash {
  mesh: THREE.Mesh;
  t: number;
}

export class Mg1801View implements GameView<Mg1801State, Mg1801Event> {
  private readonly scene = new THREE.Scene();
  /** 원본 cam00 엔티티 카메라. 시점(loop/result/capture)은 stage.ts 가 camera.ts 값으로 맞춘다. 종횡비는 화면 16:9 */
  private readonly camera = new THREE.PerspectiveCamera(20, 16 / 9, 0.1, 10000);
  /** 자유 카메라(관찰용, 원본에 없음): 켜져 있으면 이 카메라로 그린다. 왼쪽 드래그 회전·오른쪽 드래그 이동·휠 확대 */
  private freeCam: THREE.PerspectiveCamera | null = null;
  private freeControls: OrbitControls | null = null;
  private readonly hud: Hud;
  private readonly vegs = new Map<number, VegMesh>();
  private readonly players: { body: THREE.Mesh; knife: THREE.Group }[] = [];
  private readonly telops: Telop[] = [];
  private readonly splashes: Splash[] = [];
  private readonly sound: SoundMap;
  private readonly assets: Assets;
  private actors: CharacterActor[] = [];
  /** NPC 헤이호 둘(npc.ts) */
  private npcs: NpcView | null = null;
  /** 결과 연출 시작 프레임(OnGameEndingBefore 의 rm_co_idle00 재생 시점 근사) */
  private endingFrame = -1;
  private lastFrame = 0;
  private readonly stage: Stage;
  /** 원본 모델 채소 풀(id 기준). 비어 있으면 상자 채소 */
  private vegPool: Vegetable[] = [];
  /** 원본 무대를 읽으면 숨기는 상자 무대·조명 */
  private readonly boxOnly: THREE.Object3D[] = [];
  private readonly fx: EffectSystem;
  private fxLoaded = false;
  private steam = -1;
  private steamSwapped = false;
  /** 마지막 스텝의 BPM(결과 점수판 소리를 SoundMap 으로 보낼 때) */
  private bpm = 120;

  constructor(
    private readonly ctx: ViewContext,
    assets: Assets,
  ) {
    this.hud = new Hud(ctx.hud);
    this.assets = assets;
    this.sound = new SoundMap(assets, ctx.audio, 'mg1801');
    this.scene.background = new THREE.Color(0x2a2d36);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 10, 8);
    this.scene.add(sun);
    this.boxOnly.push(ambient, sun);
    this.stage = new Stage(this.scene, this.camera);
    this.fx = new EffectSystem(this.scene, assets);
    this.buildStage();
    /* 결과 점수판 SE(SQ_SE_MG1800_MGRES_CNT 등, 원본 Play2D·SoundHandle::Stop_Preset) */
    mg1801Ui(this, assets, () => this.camera).onSound = (label, stop) =>
      this.sound.onEvent(stop ? { k: 'soundStop', label } : { k: 'se', label }, this.bpm, this.camera);
  }

  private buildStage(): void {
    const water = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x3d7fb8, transparent: true, opacity: 0.7 }));
    water.position.set(0, -0.6, 0);
    this.scene.add(water);
    this.boxOnly.push(water);
    for (let lane = 0; lane < 4; lane++) {
      const x = lane * 2 - 3;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.4), new THREE.MeshStandardMaterial({ color: PLAYER_COLOR[lane], transparent: true, opacity: 0.35 }));
      rail.position.set(x, 1.5 - 0.55, 0);
      this.scene.add(rail);
      this.boxOnly.push(rail);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), new THREE.MeshStandardMaterial({ color: PLAYER_COLOR[lane] }));
      body.position.set(x, 0.8, -2);
      this.scene.add(body);
      const knife = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }));
      blade.position.set(0, 0, 0.7);
      knife.add(blade);
      knife.position.set(x + 0.55, 1.4, -1.6);
      this.scene.add(knife);
      this.players.push({ body, knife });
    }
  }

  async load(onProgress: Progress): Promise<void> {
    onProgress(0, 1, 'mg1801 manifest');
    await this.sound.load((n, total, name) => onProgress(n, total, name));
    onProgress(0, 1, 'chara/index.json');
    try {
      /* 플레이어 캐릭터 = GameSetup.players[i].char(pcNN). 같은 캐릭터는 템플릿 하나를 같이 쓴다 */
      const index = await this.assets.json<Record<string, CharaInfo>>('chara/index.json');
      const keys = this.players.map((_, i) => {
        const k = this.ctx.setup.players[i]?.char ?? 'pc01';
        return index[k] ? k : 'pc01';
      });
      const tpls = new Map<string, Promise<CharacterTemplate>>();
      for (const k of keys) if (!tpls.has(k)) tpls.set(k, CharacterTemplate.load(this.assets, k, index[k]));
      const loaded = await Promise.all(keys.map((k) => tpls.get(k)!));
      this.actors = this.players.map((p, i) => {
        const a = new CharacterActor(loaded[i]);
        this.scene.add(a.root);
        p.body.visible = false;
        if (a.rightHand) {
          p.knife.position.set(0, 0, 0);
          p.knife.rotation.set(0, 0, 0);
          a.rightHand.add(p.knife);
        }
        return a;
      });
      /* 결과 승패 클립은 뒤에서 읽는다(끝나기 전까지 화면은 co_idle00) */
      for (const t of new Set(loaded)) void t.loadResult(this.assets);
    } catch (e) {
      console.warn('캐릭터 모델을 읽지 못해 상자로 그린다', e);
    }
    await this.loadModels(onProgress);
    try {
      const npcs = new NpcView(this.scene);
      await npcs.load(this.assets);
      this.npcs = npcs;
    } catch (e) {
      console.warn('NPC(헤이호)를 읽지 못했다', e);
    }
    /* 캐릭터 재질에 cha IBL·그림자(stage.ts) — 장면 첫 스캔 뒤에 만든 것도 걸리게 */
    await Promise.all([...this.actors, ...(this.npcs?.actors ?? [])].map(a => this.stage.prepare(a.root)));
    onProgress(0, 1, 'effect/effects.json');
    try {
      await this.fx.load();
      this.fxLoaded = true;
      /* MapImpl::Initialize — 김 steam00 을 시작부터 원점에 */
      this.steam = this.fx.start('mg1801_steam00', { x: 0, y: 0, z: 0 });
    } catch (e) {
      console.warn('이펙트를 읽지 못해 물보라만 고리로 그린다', e);
    }
    onProgress(0, 1, '화면 준비');
    await Promise.all([this.stage.prepare(this.scene), ...this.assets.roots().map(root => this.stage.prepare(root))]);
    await this.assets.prepare(this.scene, this.camera, this.ctx.renderer.gl, this.stage.loaded, { uploads: this.ctx.renderer.uploads, offscreen: true, valid: () => this.ctx.renderer.active !== false });
    onProgress(1, 1, '완료');
  }

  /** 무대·채소·칼 원본 모델. 실패한 것은 상자로 남긴다 */
  private async loadModels(onProgress: Progress): Promise<void> {
    await this.stage.load(this.assets, this.ctx.renderer, (n, total, name) => onProgress(n, total, `model/${name}.glb`));
    if (this.stage.loaded) {
      for (const o of this.boxOnly) o.visible = false;
      this.scene.background = null;
    }
    try {
      const knife = await this.assets.gltf('model/mg1801_knife00.glb');
      for (const p of this.players) {
        for (const c of p.knife.children) c.visible = false;
        p.knife.add(knife.scene.clone(true));
      }
    } catch (e) {
      console.warn('칼 모델을 읽지 못해 상자로 그린다', e);
    }
    try {
      const tpls: VegetableTemplate[] = [];
      for (let type = 0; type < 5; type++) {
        onProgress(type, 5, `model/mg1801_obj0${type}.glb`);
        const name = `model/mg1801_obj0${type}`;
        const [body, outline, ...pieces] = await Promise.all([
          this.assets.gltf(`${name}.glb`),
          this.assets.gltf(`${name}_outline00.glb`).catch(() => null),
          ...Array.from({ length: PIECE_COUNT[type] }, (_, i) => this.assets.gltf(`${name}_${i}.glb`)),
        ]);
        tpls.push({ body, outline, pieces });
      }
      const pool: Vegetable[] = [];
      for (let type = 0; type < 5; type++) {
        for (let i = 0; i < POOL_PER_TYPE; i++) {
          const v = new Vegetable(type, tpls[type]);
          this.scene.add(v.root);
          if (v.outline) this.scene.add(v.outline);
          pool.push(v);
        }
      }
      this.vegPool = pool;
    } catch (e) {
      console.warn('채소 모델을 읽지 못해 상자로 그린다', e);
    }
  }

  /** 다음 로직 스텝의 사운드 관측(G14·G12·게임 BGM L0, sound.ts observe) */
  observe(time: number): SoundSnapshot | null {
    return this.sound.observe(time);
  }

  onStep(state: Mg1801State, events: readonly Mg1801Event[]): void {
    this.bpm = state.bpm;
    this.stage.step(state);
    for (const e of events) {
      switch (e.k) {
        case 'justSound':
        case 'bgm':
        case 'bgmStop':
        case 'se':
        case 'se3d':
        case 'seLocal':
        case 'soundStop':
        case 'soundPreset':
          this.sound.onEvent(e, state.bpm, this.camera);
          break;
        case 'telop':
          /* 원본 레이아웃 텔롭(ui.ts). 글자 텔롭은 ?debug=1 일 때만 */
          rmTelopView(mg1801Ui(this, this.assets, () => this.camera), this.sound, e, state.frame, state.bpm, this.camera);
          if (!Hud.debug) break;
          if (e.player < 0) {
            this.telops.push({ text: e.judge, color: '#ffffff', pos: new THREE.Vector3(0, 5.5, 0), t: 0 });
            break;
          }
          this.telops.push({ text: e.judge, color: e.judge === 'JUST' ? '#ffe14d' : e.judge === 'FAST' ? '#4db8ff' : '#ff6b6b', pos: new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z), t: 0 });
          break;
        case 'perfect': {
          rmPerfectView(mg1801Ui(this, this.assets, () => this.camera), this.sound, e, state.frame, state.bpm, this.camera);
          /* CaComUiPerfectTelop::SettingEffect(위치, 1.5, 레이어 1) → In → FUN_710043ce38: mg_common_pt_effect_00 을 (그 플레이어 엔티티 x,
             네 플레이어 엔티티 y 의 최소, z)에 배율 1.5 로 [판독 FUN_710043af00]. 속도 PlayRate = BPM/120(GetPlayRate @0x7100425e60), 레이어 비트는 effects.ts 근사 8 */
          const p = state.players[e.player]?.pos;
          if (p && this.fxLoaded) this.fx.spawn('mg_common_pt_effect_00', { x: p.x, y: Math.min(...state.players.map((q) => q.pos.y)), z: p.z }, 1.5, state.bpm / 120);
          break;
        }
        case 'effect':
          if (this.fxLoaded) this.fx.spawn(e.name, e.pos);
          else if (e.name.startsWith('mg1801_water_entry')) this.addSplash(e.pos.x, e.pos.z);
          break;
        case 'fxTrigger':
          /* VB_MG1801_JUST/SUCCESS → 원본 bnvib 포락선(ui.ts) */
          mg1801Ui(this, this.assets, () => this.camera).vibrate(this.ctx.pads[e.player], e.name);
          break;
        default:
          break;
      }
    }
    for (const o of state.objs) this.vegPool[o.id]?.step(o, state.frame);
    const dt = (state.frame - this.lastFrame) / 60;
    this.lastFrame = state.frame;
    for (const t of this.telops) t.t += dt;
    for (const s of this.splashes) s.t += dt;
    if (this.fxLoaded) {
      if (!this.steamSwapped && (state.phase === 'ending' || state.phase === 'result')) {
        /* 원본 MapImpl::ReceiveState(0,6) — steam00 을 멈추고 steam01 */
        this.steamSwapped = true;
        this.fx.stop(this.steam);
        this.steam = this.fx.start('mg1801_steam01', { x: 0, y: 0, z: 0 });
      }
      this.fx.update(dt);
    }
  }

  private addSplash(x: number, z: number): void {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.35, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, -0.45, z);
    this.scene.add(mesh);
    this.splashes.push({ mesh, t: 0 });
  }

  private vegMesh(o: ObjView): VegMesh {
    let v = this.vegs.get(o.id);
    if (v) return v;
    const group = new THREE.Group();
    const size = VEG_SIZE[o.type];
    const mat = new THREE.MeshStandardMaterial({ color: VEG_COLOR[o.type], roughness: 0.7 });
    const pieces: THREE.Mesh[] = [];
    const n = o.cuts;
    for (let i = 0; i <= n; i++) {
      const left = i === 0 ? -n : -n + 1 + 2 * (i - 1);
      const right = i === n ? n : -n + 1 + 2 * i;
      const w = Math.max(0.1, right - left - 0.06) * (o.type === 0 || o.type === 4 ? 0.55 : 0.95);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, size, size), mat);
      m.userData.center = (left + right) / 2;
      group.add(m);
      pieces.push(m);
    }
    const marks: THREE.Mesh[] = [];
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, size * 1.25, size * 1.25), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.x = -n + 1 + 2 * k;
      m.visible = false;
      group.add(m);
      marks.push(m);
    }
    this.scene.add(group);
    v = { group, pieces, marks };
    this.vegs.set(o.id, v);
    return v;
  }

  render(state: Mg1801State): void {
    const ending = state.phase === 'ending' || state.phase === 'result';
    this.stage.update(state);
    if (this.vegPool.length) {
      const seen = new Set<number>();
      for (const o of state.objs) {
        const v = this.vegPool[o.id];
        if (!v) continue;
        seen.add(o.id);
        v.update(o, state.frame, state.bpm);
      }
      this.vegPool.forEach((v, id) => {
        if (!seen.has(id)) v.hide();
      });
    } else this.renderBoxVegetables(state);
    state.players.forEach((p, i) => {
      /* Player::Ending @0x710000d680 — 칼 모델 숨김 */
      this.players[i].knife.visible = !ending;
      const actor = this.actors[i];
      if (actor) {
        const rt = ending ? this.stage.resultPlayerTransform(i) : null;
        if (rt) {
          actor.root.position.copy(rt.pos);
          actor.root.quaternion.copy(rt.rot);
        } else actor.root.position.set(p.pos.x, p.pos.y, p.pos.z);
        /* 원본 mg1801 Player ctor: KURIBO(14) 머리 끔, TERESA(19) 머리·눈 끔 [판독 @0x710000b5fc] — 로직 look 이 있으면 그것 */
        const cid = actor.tpl.info.id;
        actor.headLook = p.look?.head ?? (cid !== 14 && cid !== 19);
        actor.eyesLook = p.look?.eyes ?? cid !== 19;
        actor.setHead(p.head?.target ?? null, p.head?.weight ?? 0);
        const rm = p.resultMotion;
        if (rm) {
          /* 결과 연출 모션(로직: rm_co_idle00 → 승패 a → next b). a(비루프)가 끝나면 b 를 남은 프레임부터 [근사: 전환 프레임 ±1] */
          let name = actor.hasMotion(rm.name) ? rm.name : 'co_idle00';
          let f = rm.frame;
          const a = actor.tpl.motions[name];
          if (a && !a.loop && f >= a.frames && rm.next && actor.hasMotion(rm.next)) {
            f -= a.frames;
            name = rm.next;
          }
          const m = actor.tpl.motions[name];
          if (m?.loop) f %= m.frames;
          actor.pose(name, f, { now: state.frame });
        } else if (ending) {
          /* 로직 resultMotion 없음: RmMgSceneBase::OnGameEndingBefore → Play(rm_co_idle00 = co_idle00), 속도 1.0 [판독 main FUN_7100447030] */
          if (this.endingFrame < 0) this.endingFrame = state.frame;
          const f = actor.tpl.motions.co_idle00?.frames ?? 1;
          actor.pose('co_idle00', (state.frame - this.endingFrame) % f, { now: state.frame });
        } else actor.pose(p.motion === 'swing' ? 'rhy_knife_swing00' : 'rhy_knife_idle00', p.motionFrame, { now: state.frame });
        return;
      }
      const k = this.players[i].knife;
      const swing = p.motion === 'swing' ? Math.min(1, p.motionFrame / 9) : 0;
      k.rotation.x = p.motion === 'swing' ? -1.1 + swing * 1.6 : -1.1;
    });
    this.npcs?.update(state);
    this.renderSplashes();
    this.freeControls?.update();
    this.ctx.renderer.render(this.scene, this.freeCam ?? this.camera);
    this.drawHud(state);
  }

  private renderBoxVegetables(state: Mg1801State): void {
    const seen = new Set<number>();
    for (const o of state.objs) {
      seen.add(o.id);
      const v = this.vegMesh(o);
      v.group.visible = true;
      v.group.position.set(o.pos.x, o.pos.y, o.pos.z);
      v.group.rotation.set(o.rot.x, o.rot.y, o.rot.z);
      o.pieces.forEach((p, i) => {
        const m = v.pieces[i];
        m.position.x = (m.userData.center as number) + p.dx;
        m.rotation.z = (p.angleDeg * Math.PI) / 180;
      });
      o.judge.forEach((j, k) => {
        const m = v.marks[k];
        m.visible = j >= 0;
        if (j >= 0) (m.material as THREE.MeshBasicMaterial).color.setHex(JUDGE_COLOR[j]);
      });
    }
    for (const [id, v] of this.vegs) if (!seen.has(id)) v.group.visible = false;
  }

  private renderSplashes(): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      const k = s.t / 0.5;
      s.mesh.scale.setScalar(1 + k * 3);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.splashes.splice(i, 1);
      }
    }
  }

  private drawHud(state: Mg1801State): void {
    const hud = this.hud;
    hud.clear();
    /* 원본 레이아웃 UI(텔롭·게이지·PERFECT, ui.ts). 아래 글자는 ?debug=1 일 때만 */
    mg1801Ui(this, this.assets, () => this.camera).draw(hud.ctx, state);
    if (!Hud.debug) return;
    const phaseText: Record<string, string> = { ready: '준비', main: '진행', ending: '끝', result: '결과' };
    hud.text(`싹둑싹둑 수프 — ${phaseText[state.phase]}  줄 ${state.row}/${state.rows}  BPM ${state.bpm}  달성 ${state.rate.toFixed(0)}% (수프 ${state.starJudge})`, 40, 30, { size: 40 });
    if (state.phase === 'ready') hud.text('곧 시작 — J(또는 패드 A)로 칼질', 960, 480, { size: 64, align: 'center' });
    state.players.forEach((p, i) => {
      const c = state.counts[i];
      const x = 240 + i * 480;
      hud.text(`${i + 1}P${p.isCom ? ' CPU' : ''}`, x, 940, { size: 40, align: 'center', color: `#${PLAYER_COLOR[i].toString(16).padStart(6, '0')}` });
      hud.text(`점수 ${state.scores[i]}  J ${c.just} F ${c.fast} S ${c.slow} 놓침 ${c.miss}`, x, 990, { size: 30, align: 'center' });
    });
    for (let i = this.telops.length - 1; i >= 0; i--) {
      const t = this.telops[i];
      if (t.t >= TELOP_SEC) {
        this.telops.splice(i, 1);
        continue;
      }
      const p = t.pos.clone();
      p.y += t.t * 1.5;
      p.project(this.camera);
      hud.text(t.text, (p.x * 0.5 + 0.5) * 1920, (-p.y * 0.5 + 0.5) * 1080, { size: 56, align: 'center', color: t.color });
    }
  }

  status(state: Mg1801State): { phase: string; timeLeft: number | null } {
    return { phase: state.phase, timeLeft: null };
  }

  debug(state: Mg1801State, events: readonly Mg1801Event[]): string {
    return `frame ${state.frame} stage ${state.stage} bar ${state.bar} g14 ${state.g14} bgm ${state.bgmTime.toFixed(3)} row ${state.row}/${state.rows} active ${state.objs.length}\nevents ${events.map((e) => e.k).join(' ')}`;
  }

  /** 판이 끝나면 이 판이 만든 GPU 자원을 모두 푼다(장면 → UI → 캐릭터 템플릿 → 에셋 캐시). 다음 판은 새로 읽는다 */
  setFreeCamera(on: boolean): void {
    if (!on) {
      this.freeControls?.dispose();
      this.freeControls = null;
      this.freeCam = null;
      return;
    }
    if (this.freeCam) return;
    /* 지금 원본 카메라 시점에서 시작한다. 회전 중심 = 시선 방향 26 앞(원본 cam00 위치~주시점 거리) */
    const cam = this.camera.clone();
    const target = cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(26).add(cam.position);
    const c = new OrbitControls(cam, this.ctx.renderer.canvas);
    c.target.copy(target);
    c.enableDamping = true;
    c.dampingFactor = 0.15;
    c.rotateSpeed = 0.4;
    c.zoomSpeed = 1.2;
    c.update();
    this.freeCam = cam;
    this.freeControls = c;
  }

  dispose(): void {
    this.setFreeCamera(false);
    this.sound.stopBgm();
    this.vegs.clear();
    this.vegPool = [];
    this.stage.dispose();
    this.fx.dispose();
    disposeMg1801Ui(this);
    const tpls = new Set([...this.actors, ...(this.npcs?.actors ?? [])].map((a) => a.tpl));
    for (const a of this.actors) a.dispose();
    this.npcs?.dispose();
    for (const t of tpls) t.dispose();
    this.actors = [];
    this.npcs = null;
    const seen: Seen = new Set();
    this.assets.preserve(seen);
    disposeScene(this.scene, seen);
    this.assets.dispose(seen);
  }
}
