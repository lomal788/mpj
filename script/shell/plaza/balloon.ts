/**
 * 기구 출발 — SelectedBalloonImpl @0x710005ed30 → SequenceBalloon::Setup @0x7100046ca0 → TakeOffImpl @0x71000470d0(람다 @0x7100047870)
 * → CallSceneImpl @0x7100047628 (docs/shell/plaza_3d.md §6.10 ④) [판독 + 어셈블리].
 * 카메라 컷 = fsnb 베이크 json(manifest.anims)을 stage 'anim' 슬롯에(07_camera_lighting §6.2: EulerZXY → three 'YXZ', Aim → lookAt+twist, fovy 전체 세로각).
 * 화면 페이드(bq::WipeModule)는 공용 전환 lib/transition(종류 White, 인자 = 속도, docs/engine/15_transition.md). 끝나면 오프라인 ctx.exit({k:'balloon'}), 방 있으면 {k:'session'}.
 * 세션 중 방장은 연출 없이 'net:playSession'(NetworkManager::PlaySession), 'net:started'(방장·손님 PlaySessionFiber) → 0.5 s 페이드 아웃 → 1.0 s → {k:'session'} (online.md 5.6 정정).
 */
import * as THREE from 'three';
import { appTransition, LogicTransition, WIPE_WHITE } from '../../lib/transition';
import type { CameraDriver, ClipHandle } from '../stage3d';
import { followSystemOf } from './follow';
import { RESULT } from './interact';
import { BLEND_NPC, npcSystemOf, type Npc } from './npc';
import { PlazaCharaLoader, type PlazaChara } from './player';
import { attachToSocket } from './world';
import { PLAZA_BTN, type PlazaContext, type PlazaPart, type PlazaPartFactory } from './types';

/** 람다 상수 [판독 어셈블리] */
export const TAKEOFF = {
  cut00: 'menu00_ev_balloon_start_cut00_cam00.fsnb',
  cut01: 'menu00_ev_balloon_start_cut01_cam00.fsnb',
  /** balloon_cut01 SetFrame(260) */
  cut01Start: 260,
  /** Fiber::Sleep(0x3f2aaaab) */
  passDelaySec: 0.6666667,
  /** 카메라 GetCurrentFrame ≥ 400 → 전환 SE·페이드 */
  endFrame: 400,
  fadeInSec: 1,
  fadeOutEndSec: 0.5,
  fadeOutSkipSec: 1,
  /** SelectedBalloonImpl FadeOut: fmov s0, #1.0 @0x710005ee90 [판독] */
  fadeOutSelectSec: 1,
  /** [근사] fsnb near 0.01 → 웹 24비트 깊이 z 싸움 방지 하한(plaza_3d.md §8) */
  minNear: 0.3,
  /** TakeOffPass/Get 람다 Sleep(0.25) 뒤 쌍안경 보임 바꿈 */
  binocularSec: 0.25,
  takeoffClip: 'pos_balloon_takeoff',
  /** PlaySessionFiber FadeOut(0x3f000000) [판독] */
  sessionFadeSec: 0.5,
  /** PlaySessionFiber Sleep(1.0) 뒤 RequestCallScene [판독] */
  sessionSleepSec: 1,
} as const;

interface CamClip {
  frames: number;
  mode: string;
  pos: number[][];
  rotOrAim: number[][];
  twist: number[];
  fovyRad: number[];
  near: number[];
  far: number[];
}

/** fsnb 카메라 재생기(프레임 1/원본 프레임) */
export class FsnbCamera implements CameraDriver {
  frame = 0;
  playing = true;

  constructor(
    readonly clip: CamClip,
    start = 0,
  ) {
    this.frame = start;
  }

  get finished(): boolean {
    return this.frame >= this.clip.frames;
  }

  static parse(json: unknown): CamClip | null {
    const c = (json as { sceneAnims?: { cameras?: CamClip[] }[] }).sceneAnims?.[0]?.cameras?.[0];
    return c ?? null;
  }

  sample(camera: THREE.PerspectiveCamera): void {
    const c = this.clip;
    const i = Math.max(0, Math.min(c.pos.length - 1, Math.floor(this.frame)));
    const p = c.pos[i];
    const r = c.rotOrAim[i];
    camera.position.set(p[0], p[1], p[2]);
    if (c.mode.startsWith('Euler')) {
      camera.up.set(0, 1, 0);
      camera.rotation.set(r[0], r[1], r[2], 'YXZ');
    } else {
      camera.up.set(0, 1, 0);
      camera.lookAt(r[0], r[1], r[2]);
      camera.rotateZ(c.twist[i] ?? 0);
    }
    camera.fov = THREE.MathUtils.radToDeg(c.fovyRad[i]);
    camera.near = Math.max(c.near[i], TAKEOFF.minNear);
    camera.far = c.far[i];
    camera.updateProjectionMatrix();
  }

  apply(camera: THREE.PerspectiveCamera, df: number): boolean {
    if (this.playing) this.frame = Math.min(this.clip.frames, this.frame + df);
    this.sample(camera);
    return true;
  }
}

type Phase = 'idle' | 'selectFade' | 'setup' | 'fadeIn' | 'cut00' | 'cut01' | 'endFade' | 'session' | 'sessionFade' | 'sessionWait' | 'done';

export class BalloonSystem {
  phase: Phase = 'idle';
  private cam: FsnbCamera | null = null;
  private clips: Partial<Record<'cut00' | 'cut01', CamClip>> = {};
  private takeoff: ClipHandle | null = null;
  private mc: Npc | null = null;
  private pcs: PlazaChara[] = [];
  private binoculars: { mc: THREE.Object3D | null; pc: THREE.Object3D | null } = { mc: null, pc: null };
  private timers: { at: number; fn: () => void }[] = [];
  private sec = 0;
  private acc = 0;
  private passed = false;
  private getFrames = 0;
  private whoPlayed = false;
  readonly fade = new LogicTransition(appTransition());
  skipEnabled = false;
  online = false;
  /** 'net:lobby' — 방장·IsReadyNetworkPlayerData */
  lobby = { host: false, ready: false };
  events: string[] = [];
  private prevButtons = 0;

  constructor(private readonly ctx: PlazaContext) {
    try {
      this.skipEnabled = !!ctx.save?.menuBit(0);
    } catch {
      this.skipEnabled = false;
    }
  }

  private log(e: string): void {
    this.events.push(`${Math.round(this.sec * 60)}:${e}`);
  }

  async preload(): Promise<void> {
    const st = this.ctx.world.stage;
    for (const k of ['cut00', 'cut01'] as const) {
      const path = st.manifest.anims[TAKEOFF[k]];
      if (!path) continue;
      try {
        const r = await fetch(st.assetUrl(path));
        if (r.ok) this.clips[k] = FsnbCamera.parse(await r.json()) ?? undefined;
      } catch (e) {
        console.warn('plaza balloon: 카메라 컷을 읽지 못했다', k, e);
      }
    }
  }

  /** SelectedBalloonImpl */
  begin(): void {
    if (this.phase !== 'idle') return;
    this.log('selected');
    this.ctx.emit('camera:follow', false);
    this.ctx.emit('player:input', false);
    this.ctx.emit('player:lookAt', { target: this.ctx.world.socket('balloon_pos')?.pos ?? new THREE.Vector3() });
    if (this.online && this.lobby.host && this.lobby.ready) {
      this.phase = 'session';
      this.log('playSession');
      this.ctx.emit('net:playSession', true);
      return;
    }
    this.phase = 'selectFade';
    this.fade.fadeOut(WIPE_WHITE, TAKEOFF.fadeOutSelectSec);
  }

  private humans(): string[] {
    return this.ctx.players
      .filter((p) => p.local && !p.isCom)
      .sort((a, b) => a.slot - b.slot)
      .map((p) => p.chara);
  }

  /** SequenceBalloon::Setup */
  private async setup(): Promise<void> {
    this.phase = 'setup';
    this.log('setup');
    const w = this.ctx.world;
    w.entry('Balloon')?.setVisible(true);
    for (const a of this.ctx.actors) if (a.kind === 'input' || a.kind === 'follow' || a.kind === 'remote') a.root.visible = false;
    followSystemOf(this.ctx)?.setVisible(false);
    const npcs = npcSystemOf(this.ctx);
    for (const n of ['MC', 'Kameck', 'StampShopStaff', 'CardShopStaff', 'DataHouseStaff']) npcs?.npc(n)?.setVisible(false);
    const balloon = w.entry('Balloon')?.root ?? null;
    if (npcs) {
      this.mc = npcs.make('BalloonMC', 0x20, 1);
      if (this.mc) {
        await npcs.waitModels();
        this.mc.look.setColor(1);
        const s = balloon?.getObjectByName('pos_takeoff_mc');
        if (s) attachToSocket(s, this.mc.holder);
        else w.stage.scene.add(this.mc.holder);
      }
    }
    const hs = this.humans();
    const loader = await PlazaCharaLoader.create((p) => this.ctx.assetUrl(p));
    for (let i = 0; i < hs.length; i++) {
      const ch = await loader.load(hs[i], w.stage.renderer, (r) => w.stage.prepare(r));
      const s = balloon?.getObjectByName(`pos_takeoff_${hs.length}p_pc${String(i).padStart(2, '0')}`);
      if (s) attachToSocket(s, ch.root);
      else w.stage.scene.add(ch.root);
      this.pcs.push(ch);
    }
    this.binoculars.mc = await this.binocular(this.mc?.root ?? null, 'mc');
    this.binoculars.pc = await this.binocular(this.pcs[0]?.root ?? null, 'pc');
    if (this.binoculars.pc) this.binoculars.pc.visible = false;
    this.startTakeoff();
  }

  private async binocular(root: THREE.Object3D | null, tag: string): Promise<THREE.Object3D | null> {
    const st = this.ctx.world.stage;
    const hand = root?.getObjectByName('attach_R_hand');
    if (!hand || !st.manifest.models['menu_cmn_binoculars00']) return null;
    const m = await st.loadModel('menu_cmn_binoculars00', { instance: `Binoculars_${tag}` });
    hand.add(m.root);
    return m.root;
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ at: this.sec + sec, fn });
  }

  /** 람다 @0x7100047870 앞부분 */
  private startTakeoff(): void {
    this.phase = 'fadeIn';
    if (this.fade.closed) this.fade.fadeIn(this.fade.lastType, TAKEOFF.fadeInSec);
    const mc = this.mc;
    if (mc) {
      mc.addAnimation('takeoff_idle', 'bnclr_idle00');
      mc.play('takeoff_idle', BLEND_NPC);
    }
    for (const p of this.pcs) p.play('co_look02');
    const w = this.ctx.world;
    w.setCollisionEnabled('CollisionMain', false);
    this.takeoff = w.play('AttachLocater', TAKEOFF.takeoffClip, { loop: false });
    this.log('takeoff');
    if (this.clips.cut00) {
      this.cam = new FsnbCamera(this.clips.cut00, 0);
      w.stage.setCameraDriver(this.cam, 'anim');
    }
    this.phase = 'cut00';
  }

  private toCut01(): void {
    const w = this.ctx.world;
    if (this.clips.cut01) {
      this.cam = new FsnbCamera(this.clips.cut01, TAKEOFF.cut01Start);
      w.stage.setCameraDriver(this.cam, 'anim');
    }
    this.phase = 'cut01';
    this.log('cut01');
    const mc = this.mc;
    const pc = this.pcs[0];
    if (mc && pc) {
      const pp = pc.root.getWorldPosition(new THREE.Vector3());
      mc.faceTo(pp);
      const mp = mc.holder.getWorldPosition(new THREE.Vector3());
      const yaw = Math.atan2(mp.x - pp.x, mp.z - pp.z);
      const parentQ = pc.root.parent ? pc.root.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
      pc.root.quaternion.copy(parentQ.invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));
      pc.play('co_idle00');
    }
    this.after(TAKEOFF.passDelaySec, () => this.pass());
  }

  /** Kinopio::TakeOffPass · PcTakeOff::TakeOffGet · BGM 멈춤 · SM_JIN_MENU_TO_MAP */
  private pass(): void {
    this.passed = true;
    this.log('pass');
    const mc = this.mc;
    if (mc) {
      mc.addAnimation('takeoff_pass', 'bnclr_pass00');
      mc.play('takeoff_pass', BLEND_NPC);
    }
    this.after(TAKEOFF.binocularSec, () => {
      if (this.binoculars.mc) this.binoculars.mc.visible = false;
      if (this.binoculars.pc) this.binoculars.pc.visible = true;
    });
    this.pcs[0]?.play('mn_bnclr_get00');
    this.ctx.sound.bgm(null);
    this.ctx.sound.se('SM_JIN_MENU_TO_MAP');
  }

  private finish(skip: boolean): void {
    this.phase = 'endFade';
    this.log(skip ? 'skip' : 'end');
    if (skip) this.ctx.sound.se('SQ_SE_SYS_SKIP');
    this.ctx.sound.se('SQ_SE_MENU00_TRANSITION_WHO');
    this.ctx.emit('balloon:guide', { visible: false, label: 'sys_ctrl_skip', pos: 12 });
    this.fade.fadeOut(WIPE_WHITE, skip ? TAKEOFF.fadeOutSkipSec : TAKEOFF.fadeOutEndSec);
    this.ctx.emit('balloon:fade', { out: true, sec: skip ? TAKEOFF.fadeOutSkipSec : TAKEOFF.fadeOutEndSec });
  }

  /** PlaySessionFiber(방장·손님): 입력·카메라 멈춤 → 페이드 아웃 0.5 s → Sleep 1.0 → 모드 메뉴 [판독 online.md 5.6 정정] */
  started(): void {
    if (this.phase === 'sessionFade' || this.phase === 'sessionWait' || this.phase === 'done') return;
    this.log('started');
    this.ctx.emit('camera:follow', false);
    this.ctx.emit('player:input', false);
    this.phase = 'sessionFade';
    this.fade.fadeOut(WIPE_WHITE, TAKEOFF.sessionFadeSec);
  }

  /** 방장 PlaySession 이 안 되고 세션이 끝남 → 광장으로 */
  sessionLost(): void {
    if (this.phase !== 'session') return;
    this.log('sessionLost');
    this.phase = 'idle';
    this.ctx.emit('camera:follow', true);
    this.ctx.emit('player:input', true);
  }

  /** CallSceneImpl */
  private callScene(): void {
    this.phase = 'done';
    this.log('callScene');
    try {
      if (this.ctx.save && !this.ctx.save.menuBit(0)) {
        this.ctx.save.setMenuBit(0, true);
        this.ctx.save.request();
      }
    } catch {
      /* 저장 못 해도 진행 */
    }
    this.ctx.exit(this.online ? { k: 'session' } : { k: 'balloon' });
  }

  frame(buttons: number): void {
    const dt = 1 / 60;
    this.sec += dt;
    const trig = buttons & ~this.prevButtons;
    this.prevButtons = buttons;
    this.fade.step();
    const due = this.timers.filter((t) => t.at <= this.sec + 1e-9);
    this.timers = this.timers.filter((t) => t.at > this.sec + 1e-9);
    for (const t of due) t.fn();
    if (this.passed && this.mc && this.mc.current === 'takeoff_pass' && this.mc.isFinished()) this.mc.idle();
    const pc = this.pcs[0];
    if (this.passed && pc && pc.motion === 'mn_bnclr_get00') {
      this.getFrames++;
      const info = pc.spec.clips?.['mn_bnclr_get00'];
      if (!info || this.getFrames >= info.frames) pc.play('mn_bnclr_idle00');
    }
    for (const p of this.pcs) p.tick();
    switch (this.phase) {
      case 'selectFade':
        if (!this.fade.playing) void this.setup();
        break;
      case 'cut00':
      case 'cut01':
      case 'fadeIn':
        if (this.phase === 'cut00' && (!this.cam || this.cam.finished)) this.toCut01();
        if (this.skipEnabled && this.phase !== 'fadeIn') this.ctx.emit('balloon:guide', { visible: true, label: 'sys_ctrl_skip', pos: 12 });
        if (this.skipEnabled && trig & (PLAZA_BTN.PLUS | PLAZA_BTN.MINUS)) {
          this.finish(true);
          break;
        }
        if (this.phase === 'cut01' && (!this.cam || this.cam.frame >= TAKEOFF.endFrame) && !this.whoPlayed) {
          this.whoPlayed = true;
          this.finish(false);
        }
        break;
      case 'endFade':
        if (!this.fade.playing) this.callScene();
        break;
      case 'sessionFade':
        if (!this.fade.playing) {
          this.phase = 'sessionWait';
          this.after(TAKEOFF.sessionSleepSec, () => {
            this.phase = 'done';
            this.log('callScene');
            this.ctx.exit({ k: 'session' });
          });
        }
        break;
      default:
        break;
    }
  }

  update(df: number): void {
    if (this.phase === 'idle' || this.phase === 'done') return;
    this.acc += df;
    while (this.acc >= 1 - 1e-6) {
      this.acc -= 1;
      const p = this.ctx.actors.find((a) => a.kind === 'input');
      this.frame(p ? (this.ctx.pad(p.slot)?.buttons ?? 0) : 0);
    }
  }

  debug(): unknown {
    return {
      phase: this.phase,
      cam: this.cam ? { frame: this.cam.frame, frames: this.cam.clip.frames } : null,
      takeoff: this.takeoff ? { frame: this.takeoff.frame, frames: this.takeoff.frames } : null,
      fade: this.fade.alpha(),
      mc: this.mc?.motion ?? null,
      pcs: this.pcs.map((p) => ({ pc: p.spec.pc, motion: p.motion })),
      skipEnabled: this.skipEnabled,
      events: this.events,
    };
  }

  dispose(): void {
    this.fade.release();
    for (const p of this.pcs) p.dispose();
  }
}

export const createBalloon: PlazaPartFactory = async (ctx: PlazaContext): Promise<PlazaPart> => {
  const sys = new BalloonSystem(ctx);
  await sys.preload();
  const offs = [
    ctx.on('interact:decide', (v) => {
      if ((v as { result: number }).result === RESULT.BALLOON) sys.begin();
    }),
    ctx.on('net:session', (v) => {
      sys.online = !!v;
      if (!v) sys.sessionLost();
    }),
    ctx.on('net:lobby', (v) => {
      sys.lobby = v as { host: boolean; ready: boolean };
    }),
    ctx.on('net:started', () => {
      sys.started();
    }),
  ];
  return {
    name: 'balloon',
    update(df) {
      sys.update(df);
    },
    debug() {
      return sys.debug();
    },
    dispose() {
      for (const o of offs) o();
      sys.dispose();
    },
  };
};
