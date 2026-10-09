/**
 * mg1801 무대 화면 — 원본 mg1801::MapImpl(Initialize @0x710000f9d0, ReceiveState @0x7100010a90)이 만드는 모델과 조명,
 * Player 생성자의 의자(mg1801.md 4.6). 로직 state 만 읽는다.
 *
 * - 무대: MapImpl 표 @0x7100037ff8 의 bg00·floor00·water00 세 개(nro 문자열 순서로 확인). water00 은 표 2번이라 모션이 붙는다.
 *   line01 은 Params.isLineDraw(기본 0)일 때만 만들고, line00 은 nro 에 이름이 없어 쓰지 않는다.
 * - NPC 의자 stool_npc00: Params.RhythmNpcEnable(기본 1)이면 원점에. NPC(HEYHO, chara~npc002)는 변환물이 없어 아직 없다.
 * - 결과(채널 (0,6)): 무대 세 모델·NPC 의자를 숨기고 result00 을 켜고 soup%02d(별 판정)를 원점에 만든다.
 *   Player::Ending @0x710000d680 은 칼·의자 모델을 숨긴다(index.ts 가 처리). 플레이어 위치는 resultPlayerTransform(attach_pc%02d).
 * - 연습 화살표(RmPracticeArrowMan, 플레이어당 하나): mg1801::Player::Player @0x710000b130 이 SetMgCustomizeModel("mg/mg1801/model/mg1801_arrow00")
 *   (모션 = 같은 이름 fskb, 30프레임 반복) 과 SetTranslation(pid, (Player+0xB0 의 x·y, 0), 회전 0) 을 부른다 — Player+0xB0 = (lane·2 − 3, 0, z) 라
 *   위치는 (lane·2 − 3, 0, 0) [판독 @0x710000b860~0x710000b8b4]. 표시는 로직 state.practiceArrow(단계 2 FUN_71004406b0: Play 후 SetSpeed(BPM/120)
 *   → SetVisible(true), 단계 3 beat4 > 2 에서 숨김). 켜진 스텝을 0 프레임으로 보고 BPM/120 배속으로 돌린다 [추정: Play 가 0 프레임부터, ±1 프레임].
 * - 카메라(camera.ts): state.camera(없으면 엔딩이면 result, 아니면 loop). 포스트(post.ts): 채널(0,6)에서 post → post_result00.
 *
 * 조명(07_camera_lighting.md 6.6·7.3·7.4, 재질 쪽은 material.ts):
 * - 평행광: 원본 mg1801_dir_light 색 (0.8,0.8,0.8), overwrite 회전 (−60°,−30°,−10°) → 빛이 오는 쪽 (−0.0958, 0.8963, 0.4330).
 *   세기: 원본 forward_plus 셰이더는 Maxwell 바이너리뿐이라 식을 읽지 못했다. "빛 색 = 흰 램버트 면 정면 밝기" 관례로 보고 three 세기 π [근사].
 * - 그림자: 원본 캐스케이드 4개(lambda 0.5)가 카메라 거리 1~30 을 덮는다. three 는 그림자맵 하나로 그 절두체 조각(거리 1~30)을
 *   빛 공간에서 감싸게 맞춘다(카메라가 바뀔 때마다). 그림자 카메라는 빛 쪽으로 shadowmap_camera_offset 1000 만큼 뺀다 [추정: 뜻].
 *   맵 2048², PCF, bias 는 world 0.02 상당 [근사]. 원본 constant/normal bias 0.5·정적 EVSM 은 단위를 몰라 쓰지 않는다.
 *   그림자를 내고 받는 메시는 재질 데이터대로(material.ts).
 * - IBL: env 컨테이너의 bg00_irr/rad(배경)·cha_irr/rad(캐릭터, 재질 ibl_type 1) 를 나눠 쓴다(material.ts). 원본 BRDF(AmbientBrdfPbrRg16f)와 다르다.
 * - 안개 mip fog(80~150, 세기 0.5): 화면에 닿는 가장 먼 무대 꼭짓점이 카메라에서 80.1 이하(bg00 상자 꼭짓점 기준)라 영향이 0 이어서 넣지 않는다.
 * - 라이트맵(gi_diffuse)·AO 는 재질 데이터대로(material.ts). water00 은 근사 셰이더(water.ts).
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Assets } from '../../../../view/assets';
import type { Renderer } from '../../../../view/renderer';
import type { Mg1801State } from '../state';
import { applyCamera, type CameraLabel } from './camera';
import { MaterialSetup } from './material';
import { PostChain } from './post';
import { Water } from './water';

const M = 'model/';
const STOOL_MODEL = ['mg1801_stool01', 'mg1801_stool02', 'mg1801_stool03'];
/** 빛이 오는 쪽(three DirectionalLight.position − target), 07_camera_lighting.md 6.6 overwrite 채택 */
const LIGHT_DIR = new THREE.Vector3(-0.0958, 0.8963, 0.433).normalize();
/** directional_light_color [데이터] × π [근사: 단위 관례] */
const LIGHT_COLOR = new THREE.Color(0.8, 0.8, 0.8);
const LIGHT_INTENSITY = Math.PI;
/** directional_light_shadowmap_camera_near / _far / _offset [데이터] */
const SHADOW_NEAR = 1;
const SHADOW_FAR = 30;
const SHADOW_OFFSET = 1000;
const SHADOW_MAP = 2048;
const SHADOW_BIAS_WORLD = 0.02;

interface Arrow {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction | null;
}

export class Stage {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly stageModels: THREE.Object3D[] = [];
  private npcStool: THREE.Object3D | null = null;
  private result: THREE.Object3D | null = null;
  private soups: (GLTF | null)[] = [];
  private soupShown: THREE.Object3D | null = null;
  private stoolTpl: (GLTF | null)[] = [];
  private readonly stools: (THREE.Object3D | null)[] = [];
  private waterMixer: THREE.AnimationMixer | null = null;
  private waterAction: THREE.AnimationAction | null = null;
  private readonly water = new Water();
  private resultShown = false;
  private arrowTpl: GLTF | null = null;
  private readonly arrows: (Arrow | null)[] = [];
  /** 연습 화살표가 켜진 로직 프레임(꺼져 있으면 −1) */
  private arrowStart = -1;
  private cameraLabel: CameraLabel = 'loop';
  private mats: MaterialSetup | null = null;
  private post: PostChain | null = null;
  private renderer: Renderer | null = null;
  private savedShadow: { enabled: boolean; type: THREE.ShadowMapType } | null = null;
  private scannedScene = false;
  /** 원본 모델을 하나라도 읽었는가(못 읽으면 index.ts 가 상자 무대를 남긴다) */
  loaded = false;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    const sun = new THREE.DirectionalLight(LIGHT_COLOR, LIGHT_INTENSITY);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun = sun;
    scene.add(sun);
    scene.add(sun.target);
    applyCamera(camera, 'loop');
    this.fitShadow();
  }

  private async tryGltf(assets: Assets, name: string): Promise<GLTF | null> {
    try {
      return await assets.gltf(`${M}${name}.glb`);
    } catch (e) {
      console.warn(`mg1801 모델을 읽지 못했다: ${name}`, e);
      return null;
    }
  }

  async load(assets: Assets, renderer: Renderer, onProgress: (n: number, total: number, label: string) => void): Promise<void> {
    const gl = renderer.gl;
    this.renderer = renderer;
    this.savedShadow = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type };
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    const names = ['mg1801_bg00', 'mg1801_floor00', 'mg1801_water00', 'mg1801_stool_npc00', 'mg1801_result00'];
    let n = 0;
    const total = names.length + STOOL_MODEL.length + 4 + 2;
    const step = (label: string): void => onProgress(++n, total, label);
    const mats = new MaterialSetup(assets, gl);
    this.mats = mats;
    try {
      await mats.load();
    } catch (e) {
      console.warn('mg1801 재질 텍스처 목록·IBL 을 읽지 못해 환경광으로 대신한다', e);
    }
    if (mats.common) {
      this.scene.environment = mats.common.rad;
      this.scene.environmentIntensity = 1;
    } else this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    step('mg1801_env');
    const [bg, floor, water, npc, result] = await Promise.all(
      names.map(async (name) => {
        const g = await this.tryGltf(assets, name);
        if (g) await mats.prepare(g.scene);
        step(name);
        return g;
      }),
    );
    for (const g of [bg, floor, water]) {
      if (!g) continue;
      const o = g.scene.clone(true);
      this.scene.add(o);
      this.stageModels.push(o);
    }
    if (water && this.stageModels.length) {
      const root = this.stageModels[this.stageModels.length - 1];
      await this.water.setup(root, assets, mats);
      const clip = water.animations[0];
      if (clip) {
        this.waterMixer = new THREE.AnimationMixer(root);
        this.waterAction = this.waterMixer.clipAction(clip);
        this.waterAction.setLoop(THREE.LoopRepeat, Infinity);
        this.waterAction.play();
      }
    }
    if (npc) {
      this.npcStool = npc.scene.clone(true);
      this.scene.add(this.npcStool);
    }
    if (result) {
      this.result = result.scene.clone(true);
      this.result.visible = false;
      this.scene.add(this.result);
    }
    this.stoolTpl = await Promise.all(
      STOOL_MODEL.map(async (name) => {
        const g = await this.tryGltf(assets, name);
        if (g) await mats.prepare(g.scene);
        step(name);
        return g;
      }),
    );
    this.soups = await Promise.all(
      [0, 1, 2, 3].map(async (i) => {
        const g = await this.tryGltf(assets, `mg1801_soup0${i}`);
        if (g) await mats.prepare(g.scene);
        step(`mg1801_soup0${i}`);
        return g;
      }),
    );
    this.arrowTpl = await this.tryGltf(assets, 'mg1801_arrow00');
    if (this.arrowTpl) await mats.prepare(this.arrowTpl.scene);
    step('mg1801_arrow00');
    this.loaded = this.stageModels.length > 0;
    if (this.loaded) {
      this.post = new PostChain(gl);
      renderer.setPost(this.post);
    }
  }

  /**
   * 무대 밖에서 만든 모델(채소·칼·캐릭터)의 재질을 원본 옵션대로 맞춘다(material.ts). 첫 update 때 장면 전체에 한 번 부른다.
   * 캐릭터 재질(ibl_type 1)은 cha_irr/cha_rad 를 쓴다. 다른 담당이 재질을 나중에 새로 만들면 그 root 로 다시 부르면 된다.
   */
  prepare(root: THREE.Object3D): Promise<void> {
    return this.mats ? this.mats.prepare(root) : Promise.resolve();
  }

  /**
   * 그림자 카메라를 지금 카메라의 거리 SHADOW_NEAR~SHADOW_FAR 절두체 조각을 감싸게 맞춘다
   * (원본 캐스케이드 범위 1~30 을 그림자맵 하나로 근사).
   */
  private fitShadow(): void {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    const corners: THREE.Vector3[] = [];
    const t = Math.tan(((cam.fov * Math.PI) / 180) * 0.5);
    for (const d of [SHADOW_NEAR, SHADOW_FAR]) {
      const h = d * t;
      const w = h * cam.aspect;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) corners.push(new THREE.Vector3(sx * w, sy * h, -d).applyMatrix4(cam.matrixWorld));
    }
    const center = new THREE.Vector3();
    for (const c of corners) center.add(c);
    center.multiplyScalar(1 / corners.length);
    this.sun.position.copy(center).addScaledVector(LIGHT_DIR, SHADOW_OFFSET);
    this.sun.target.position.copy(center);
    this.sun.updateMatrixWorld(true);
    this.sun.target.updateMatrixWorld(true);
    const view = new THREE.Matrix4().lookAt(this.sun.position, center, new THREE.Vector3(0, 1, 0));
    view.setPosition(this.sun.position).invert();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const c of corners) {
      const p = c.clone().applyMatrix4(view);
      min.min(p);
      max.max(p);
    }
    const sc = this.sun.shadow.camera;
    sc.left = min.x;
    sc.right = max.x;
    sc.bottom = min.y;
    sc.top = max.y;
    sc.near = 0.1;
    sc.far = -min.z;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -SHADOW_BIAS_WORLD / (sc.far - sc.near);
    this.sun.shadow.normalBias = SHADOW_BIAS_WORLD;
  }

  /** 플레이어 의자(원본 Player ctor: 의자 엔티티 (x, 0, −2), STOOLS 번호 0..2 ↔ stool01..03) */
  private stool(i: number, state: Mg1801State): THREE.Object3D | null {
    if (this.stools[i] !== undefined) return this.stools[i];
    const p = state.players[i];
    const tpl = p.stool >= 0 ? this.stoolTpl[p.stool] : null;
    const o = tpl ? tpl.scene.clone(true) : null;
    if (o) {
      o.position.set(p.pos.x, 0, -2);
      this.scene.add(o);
    }
    this.stools[i] = o;
    return o;
  }

  /** 로직 스텝마다(index.ts onStep): 연습 화살표가 켜진 프레임을 잡는다 */
  step(state: Mg1801State): void {
    if (state.practiceArrow) {
      if (this.arrowStart < 0) this.arrowStart = state.frame;
    } else this.arrowStart = -1;
  }

  /** 연습 화살표 플레이어 i(원본 RmPracticeArrowMan 엔티티 i). 처음 부를 때 만든다 */
  private arrow(i: number, state: Mg1801State): Arrow | null {
    if (this.arrows[i] !== undefined) return this.arrows[i];
    const tpl = this.arrowTpl;
    let a: Arrow | null = null;
    if (tpl) {
      const root = tpl.scene.clone(true);
      root.position.set(state.players[i].pos.x, 0, 0);
      root.visible = false;
      this.scene.add(root);
      const mixer = new THREE.AnimationMixer(root);
      const clip = tpl.animations[0];
      const action = clip ? mixer.clipAction(clip) : null;
      action?.play();
      a = { root, mixer, action };
    }
    this.arrows[i] = a;
    return a;
  }

  update(state: Mg1801State): void {
    const ending = state.phase === 'ending' || state.phase === 'result';
    if (!this.scannedScene && this.mats) {
      this.scannedScene = true;
      void this.mats.prepare(this.scene);
    }
    state.players.forEach((_, i) => {
      const s = this.stool(i, state);
      /* Player::Ending — 의자 모델 숨김 */
      if (s) s.visible = !ending;
      const a = this.arrow(i, state);
      if (a) {
        a.root.visible = !!state.practiceArrow;
        if (a.root.visible && a.action) {
          /* 30프레임 반복, 속도 BPM/120 */
          const f = Math.max(0, state.frame - (this.arrowStart < 0 ? state.frame : this.arrowStart)) * (state.bpm / 120);
          const dur = a.action.getClip().duration;
          a.action.time = dur > 0 ? (f / 60) % dur : 0;
          a.mixer.update(0);
        }
      }
    });
    if (this.waterMixer && this.waterAction) {
      const dur = this.waterAction.getClip().duration;
      this.waterAction.time = (state.frame / 60) % dur;
      this.waterMixer.update(0);
    }
    this.water.update(state.frame);
    /* 카메라: loop(Initialize) / result(채널 0,6) / capture(채널 2,2). 로직이 안 주면 단계로 고른다 */
    const label: CameraLabel = state.camera ?? (ending ? 'result' : 'loop');
    if (label !== this.cameraLabel) {
      this.cameraLabel = label;
      applyCamera(this.camera, label);
      this.fitShadow();
    }
    /* 채널 (0,6) TrigRmGameEndingSetting: 로직이 카메라를 주면 loop 가 아닌 때, 아니면 엔딩 단계 */
    const ch06 = state.camera ? state.camera !== 'loop' : ending;
    if (ch06 && !this.resultShown) {
      /* MapImpl::ReceiveState(0,6) */
      this.resultShown = true;
      for (const o of this.stageModels) o.visible = false;
      if (this.npcStool) this.npcStool.visible = false;
      if (this.result) this.result.visible = true;
      const soup = this.soups[state.starJudge];
      if (soup) {
        this.soupShown = soup.scene.clone(true);
        this.scene.add(this.soupShown);
      }
      /* post00 엔티티 파괴 → post_result00 */
      this.post?.setPreset('post_result00');
    }
  }

  /** MapImpl::GetResultPlayerPosRots @0x7100010730 — 결과 모델 뼈 attach_pc%02d 의 위치·회전. PlayerManImpl::ReceiveState(0,6)가 플레이어 i 에 i 번을 준다 */
  resultPlayerTransform(i: number): { pos: THREE.Vector3; rot: THREE.Quaternion } | null {
    const n = this.result?.getObjectByName(`attach_pc${String(i).padStart(2, '0')}`);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    return { pos: n.getWorldPosition(new THREE.Vector3()), rot: n.getWorldQuaternion(new THREE.Quaternion()) };
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.setPost(null);
      if (this.savedShadow) {
        this.renderer.gl.shadowMap.enabled = this.savedShadow.enabled;
        this.renderer.gl.shadowMap.type = this.savedShadow.type;
      }
    }
    this.post?.dispose();
    this.mats?.dispose();
  }
}
