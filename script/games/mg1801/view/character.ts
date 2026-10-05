/**
 * 캐릭터 모델 — 캐릭터 담당 변환물(tools/character_glb.py: FRES 모델 + fskb·fshb 클립 → glb, fvbb·ftsb.fmab → motions.json,
 * tools/mg1801_web_charas.py 로 웹용으로 줄임). 클립 이름 = 원본 모션 이름. 22명(PlayerCharacterID 0..21) + NPC(npc.ts) 공용.
 * 로직이 정한 모션과 원본 프레임을 그대로 샘플한다(mixer 를 시간으로 직접 맞춘다, 60fps 베이크).
 *
 * 모션 묶음 [판독 main FUN_7100034aa0·FUN_71000321e0 계열]: 모션 파일(fskb·fshb·ftsb·fvbb)마다 user data "blink" 가 있으면
 * 그 파일(fcl_blink00)을 AnimationNodeBundle 의 둘째 자식으로 붙여 함께 재생한다. rhy_knife_idle00·co_idle00 에만 있고 swing 에는 없다.
 * - 묶음의 SetFrame·속도는 자식 모두에 간다(bundle vtable +0x40 이 자식마다 호출), 프레임 상한 질의는 첫 자식(본 모션) [판독 디스어셈블리].
 *   그래서 깜빡임 프레임 = 본 모션을 시작한 뒤 진행한 프레임, 깜빡임 파일 자기 길이로 감긴다 [추정: 자식이 각자 루프].
 * - 겹치는 뼈·모프는 둘째 자식(깜빡임)이 덮어쓴다 [추정: 묶음 평가 순서]. 깜빡임 재질 애니(ftsb)는 눈 오프셋 말고는 셰이더 그래프 입력이라 옮기지 않았다.
 *
 * 재질(body_m, 셰이더 그래프) — 원본 그래프(_chara/pcNN.bnbshpk) 식은 미확정이라 관측으로 맞춘 근사다(docs/engine/09_character.md 4.2):
 * - body_m 셰이프 UV: glb 메시 extras.mpjUv(도구가 정함). UV 가 "텍스처 가로 = 1" 단위라고 본 규칙 — 알베도 1:2 → 'v2'(v′ = 0.5 + 0.5·v),
 *   2:1 → 'u2'(u′ = 0.5·u), 그 밖은 그대로. 몸·머리카락·얼굴(눈꺼풀) 셰이프 모두 같다. 알베도·노멀·거칠기/금속에 같은 변환.
 *   [실행: 22명 렌더 관측 — 얼굴에 안 걸면 피치·데이지·폴린 눈가가 어긋난다]
 * - 눈동자: 눈 알베도(eye_alb, 배열이면 0층)를 TEXCOORD_1 에서 샘플한다. 눈 i 의 좌표 = (u − p.x, v + p.y), p = material_utility_parameter0/1
 *   (Maya 모드 texture_srt 이동과 같은 부호 — srt1/2 가 같은 값을 따라간다 [데이터: ftsb]). 원래 값의 [0,1] 칸 밖은 버린다.
 *   덮는 곳 = 몸 알베도 알파가 0 인 곳(흰자 칸, 알파 채널이 있는 캐릭터) [데이터: 알파 = 눈 흰자 모양]. 알파 없는 알베도는 칸 판정만.
 *   p 는 모션 ftsb.fmab 의 프레임 값(대기 상수, swing 중 v 변화), 없으면 재질 기본값.
 * - 배열 텍스처는 0번 층만 쓴다(1번 층 = 젖음 등 변형 [추정]).
 * - 알려진 차이: 쿠파주니어(pc56)의 눈은 알베도 오른쪽 띠의 패턴을 셰이더 그래프가 고르는 방식이라 아직 안 나온다(눈 메시가 피부색).
 *   깜빡임이 재질 애니(ftsb)뿐인 DK(pc12)·쪼르뚜(pc54)·가봉(pc61)은 깜빡이지 않는다(fskb·fshb·fvbb 묶음은 반영).
 *
 * 머리 추적(원본 bex::ComHeading, mg1801 Player ctor·UpdateHeadControl) [판독 main, docs/engine/09_character.md 6.8]:
 * - 매 프레임 head_aimcont 로컬을 단위 회전으로 되돌린다(이벤트 0x5f454e00 → SetLocalMtxRt(head_aimcont, 단위) @FUN_71001bea18).
 *   애니 클립에는 이 뼈 트랙이 없다 [데이터: glb] — 되돌리지 않으면 회전이 프레임마다 쌓여 머리가 돈다.
 * - 대상 회전(FUN_71001c0c90·FUN_71001bfe08): 대상 위치를 head_aimcont 부모(head) 공간 방향으로 바꿔 +Z 에서 그 방향으로 가는 최단 회전.
 * - FUN_71001c1694: 단위→대상 slerp(가중치 = 모션 user data "headLookWeight" 가 있으면 그 값, 없으면 headLookWeight) →
 *   오일러 분해(Y·Z·X 순 = three 'YZX') → head_min/max(도) 로 자름 → Z·Y·X 순(three 'ZYX')으로 다시 만든다 →
 *   따라가기 모드 4(임계 감쇠 스프링 / 선형 속도 / 둘의 slerp, 대상 각속도로 고름) → head_aimcont 로컬.
 * - 눈(FUN_71001c5a58): 단위→대상 slerp(clamp(앞쪽+1.8, 0, 2)·(눈 가중치 − 머리 가중치), ≤ 2) 의 X·Y 각으로
 *   uv = t_offset + (yaw, −pitch)·t_scale 를 잘라 0.6/프레임으로 따라가고, 모션 값과 섞임비(0.6/프레임)로 섞는다.
 * 전이(mpat mg1801_pc.mpat, a = 1·1·0): a 를 프레임 수로 보고 이전 모션을 a 프레임 동안 섞는다. 요청 프레임 진행을 포함하므로
 * a = 1 이면 보이는 섞임이 없다 [추정, 09_character.md 6.5].
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Assets } from '../../../view/assets';

const BODY_MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const;
const DEG = Math.PI / 180;
/** ComHeading 기본값 [판독 impl 생성자 FUN_71001bee00]: speedCoef(+0xB0), linearSpeed(+0xB4, rad/s), eyesLookWeight(+0xBC), 눈 따라가기(+0xF4·+0x134) */
const HEAD_SPEED_COEF = 0.12;
const HEAD_LINEAR_SPEED = 5;
const EYES_LOOK_WEIGHT = 1;
const EYE_RATE = 0.6;
/** 프레임 시간 표 DAT_71015d4678[0] = 1/60 [데이터] */
const FRAME_SEC = 1 / 60;
/** 모드 4 스프링 강성 = min(2000, speedCoef^2.252184 · 17851.338), 감쇠 = 2√k [판독 FUN_71001c1694 case 4] */
const HEAD_K = Math.min(2000, Math.pow(HEAD_SPEED_COEF, 2.252184) * 17851.338);
const HEAD_C = 2 * Math.sqrt(HEAD_K);
/** 대상 각속도 경계(rad/s): 이하 = 스프링, 이상 = 선형, 사이 = 둘의 slerp [판독 같은 곳] */
const HEAD_W_LO = 2.0943952;
const HEAD_W_HI = 4.1887903;
const F32_EPS = 1.1920929e-7;
/**
 * 모션 user data "headLookWeight"(fskb, 실수 1개) — 주 슬롯 모션에 있으면 headLookWeight 대신 쓴다(0 이상일 때, impl+0x23C)
 * [판독 FUN_71001c1380·FUN_71001bea18]. mg1801 이 쓰는 모션 중 값이 있는 것만 [데이터: chara~pcMot_co pcNN_co_win00a/b.fskb].
 */
const MOTION_HEAD_WEIGHT: Record<string, Record<string, number>> = {
  pc01: { co_win00a: 0, co_win00b: 0 },
  pc02: { co_win00a: 0, co_win00b: 0 },
  pc06: { co_win00a: 0, co_win00b: 0 },
  pc13: { co_win00a: 0, co_win00b: 0 },
};

export interface EyeParam {
  material: string | null;
  shaderparam: string | null;
  t_offset_x: number;
  t_offset_y: number;
  t_scale_x: number;
  t_scale_y: number;
  t_rot: number;
  t_min_x: number;
  t_min_y: number;
  t_max_x: number;
  t_max_y: number;
}

/** chara/index.json 한 항목(tools/mg1801_web_charas.py) */
export interface CharaInfo {
  id: number;
  name: string;
  glb: string;
  motions: string;
  height: number;
  head: { min_x: number; min_y: number; min_z: number; max_x: number; max_y: number; max_z: number; offset_x: number; weight: number; chincoef: number };
  eyes: [EyeParam, EyeParam];
  eyeTex: string | null;
  eyeMaterial: string | null;
  albedoSize: [number, number];
  /** 결과 승패 클립만 든 glb(co_win/joy/lose00a·b). 뒤에 읽는다 */
  resultGlb?: string | null;
  /** NPC 색(ChangeHeyhoColor) — 알베도 배열 층 png */
  color?: { value: number; albedo: string };
}

type ParamValue = number | number[];
/** motions.json 한 모션 */
export interface MotionInfo {
  frames: number;
  loop: boolean;
  nameHash: string;
  /** user data "blink" 가 있는 파일 종류(fskb·fshb·ftsb.fmab·fvbb) */
  blink: string[];
  blinkName?: string;
  shapeFrames?: number;
  visFrames?: number;
  /** 뼈 → [[프레임, 0|1], ...] (값이 바뀌는 프레임만) */
  vis?: Record<string, [number, number][]>;
  matFrames?: number;
  /** 재질 → 파라미터 → 성분 오프셋("0x00") → 상수 | 프레임별 값 */
  mat?: Record<string, Record<string, Record<string, ParamValue>>>;
}

/** mg1801_pc.mpat [데이터, 09_character.md 6.5]: from → to → a */
const MPAT: Record<string, Record<string, number>> = {
  rhy_knife_swing00: { rhy_knife_idle00: 1, rhy_knife_swing00: 0 },
  rhy_knife_idle00: { rhy_knife_swing00: 1 },
};

/** 한 캐릭터의 공용 자료(glb·모션 표·눈 텍스처). 인스턴스는 CharacterActor */
export class CharacterTemplate {
  private eyeMap: THREE.Texture | null = null;
  private colorMap: THREE.Texture | null = null;

  private constructor(
    readonly key: string,
    readonly info: CharaInfo,
    readonly gltf: GLTF,
    readonly motions: Record<string, MotionInfo>,
  ) {}

  static async load(assets: Assets, key: string, info: CharaInfo): Promise<CharacterTemplate> {
    const [gltf, motions] = await Promise.all([assets.gltf(`chara/${info.glb}`), assets.json<Record<string, MotionInfo>>(`chara/${info.motions}`)]);
    const t = new CharacterTemplate(key, info, gltf, motions);
    if (info.eyeTex) t.eyeMap = await loadTex(assets.url(`chara/${info.eyeTex}`));
    if (info.color) t.colorMap = await loadTex(assets.url(`chara/${info.color.albedo}`));
    return t;
  }

  get eye(): THREE.Texture | null {
    return this.eyeMap;
  }

  /** 나중에 읽는 클립(결과 승패) */
  readonly extraClips: THREE.AnimationClip[] = [];
  private resultLoad: Promise<void> | null = null;

  /** 결과 승패 클립 glb 를 읽는다(한 번). 실패하면 클립 없이 끝낸다 — 화면은 co_idle00 을 그대로 둔다 */
  loadResult(assets: Assets): Promise<void> {
    if (!this.info.resultGlb) return Promise.resolve();
    this.resultLoad ??= assets
      .gltf(`chara/${this.info.resultGlb}`)
      .then((g) => {
        this.extraClips.push(...g.animations);
      })
      .catch((e) => console.warn(`결과 모션을 읽지 못했다: ${this.key}`, e));
    return this.resultLoad;
  }

  get color(): THREE.Texture | null {
    return this.colorMap;
  }

  /** 템플릿이 따로 읽은 텍스처(눈동자·색 배열)를 푼다. glb 는 에셋 캐시가 푼다 */
  dispose(): void {
    this.eyeMap?.dispose();
    this.colorMap?.dispose();
    this.eyeMap = this.colorMap = null;
  }
}

function loadTex(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** 성분 값 하나(프레임 f, 감김) */
function paramAt(v: ParamValue | undefined, f: number): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const n = v.length - 1;
  const x = Math.min(Math.max(f, 0), n);
  const i = Math.floor(x);
  const k = x - i;
  return i >= n ? v[n] : v[i] * (1 - k) + v[i + 1] * k;
}

/** 뼈 표시 계단 값 */
function visAt(steps: [number, number][], f: number): boolean {
  let v = steps[0][1];
  for (const [fr, val] of steps) {
    if (fr > f) break;
    v = val;
  }
  return v !== 0;
}

function wrap(f: number, n: number): number {
  return n > 0 ? ((f % n) + n) % n : 0;
}

interface EyeUniforms {
  eyeMap: { value: THREE.Texture | null };
  eyeOffset0: { value: THREE.Vector2 };
  eyeOffset1: { value: THREE.Vector2 };
  eyeMaskAlpha: { value: number };
}

function uvTransform(t: THREE.Texture, rule: string | undefined): THREE.Texture {
  const c = t.clone();
  if (rule === 'v2') {
    c.repeat.set(1, 0.5);
    c.offset.set(0, 0.5);
  } else if (rule === 'u2') {
    c.repeat.set(0.5, 1);
    c.offset.set(0, 0);
  }
  c.needsUpdate = true;
  return c;
}

/** body_m 계열 재질(인스턴스마다 하나 — 눈 오프셋이 인스턴스마다 다르다) */
function bodyMaterial(src: THREE.MeshStandardMaterial, rule: string | undefined, eye: EyeUniforms | null, color: THREE.Texture | null): THREE.MeshStandardMaterial {
  const m = src.clone();
  if (color && m.map) {
    const c = color.clone();
    c.channel = m.map.channel;
    m.map = c;
  }
  if (rule) {
    for (const k of BODY_MAPS) {
      const t = m[k];
      if (t) m[k] = uvTransform(t, rule);
    }
  }
  if (!eye) return m;
  m.customProgramCacheKey = () => 'mpj-chara-body-eye';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, eye);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 eyeUv;\nvarying vec2 vEyeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvEyeUv = eyeUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D eyeMap;
uniform vec2 eyeOffset0;
uniform vec2 eyeOffset1;
uniform float eyeMaskAlpha;
varying vec2 vEyeUv;
float eyeInside(vec2 uv) { return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float sclera = mix(1.0, 1.0 - diffuseColor.a, eyeMaskAlpha);
  vec2 e0uv = vec2(vEyeUv.x - eyeOffset0.x, vEyeUv.y + eyeOffset0.y);
  vec2 e1uv = vec2(vEyeUv.x - eyeOffset1.x, vEyeUv.y + eyeOffset1.y);
  vec4 e0 = texture2D(eyeMap, e0uv);
  vec4 e1 = texture2D(eyeMap, e1uv);
  diffuseColor.rgb = mix(diffuseColor.rgb, e0.rgb, e0.a * eyeInside(e0uv) * sclera);
  diffuseColor.rgb = mix(diffuseColor.rgb, e1.rgb, e1.a * eyeInside(e1uv) * sclera);
  diffuseColor.a = 1.0;
}`,
      );
  };
  return m;
}

interface Sampled {
  track: THREE.KeyframeTrack;
  interp: THREE.Interpolant;
  apply: (v: ArrayLike<number>) => void;
}

export interface PoseOptions {
  /** 지금 장면 프레임(전이 경과 계산용) */
  now?: number;
}

export class CharacterActor {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  /** 칼을 붙이는 뼈(원본 SetModelHook "attach_R_hand") */
  readonly rightHand: THREE.Object3D | null;
  private readonly head: THREE.Object3D | null;
  private readonly meshesByVisBone = new Map<string, THREE.Object3D[]>();
  private readonly eye: EyeUniforms | null;
  /** 눈 0/1 = characterlist eye0/eye1 의 셰이더 파라미터(material_utility_parameter1/0) */
  private readonly eyeParamNames: [string, string];
  private readonly blinkSkel: Sampled[] = [];
  private readonly blinkShape: Sampled[] = [];
  private motion = '';
  private lastFrame = 0;
  /** 묶음 시작 뒤 진행 프레임(깜빡임 자식 프레임) */
  private bundleFrame = 0;
  private prev: { motion: string; frame: number; since: number; frames: number } | null = null;
  private headTarget: THREE.Vector3 | null = null;
  private headWeight = 0;
  /** head_aimcont 바인드 로컬 회전(단위) — 매 프레임 여기로 되돌린다 */
  private readonly headRest = new THREE.Quaternion();
  /** impl+0x200 현재 회전, +0x220 스프링 속도, +0x210 지난 대상(0 으로 시작) */
  private readonly headCur = new THREE.Quaternion();
  private readonly headVel = new THREE.Vector4();
  private readonly headPrevT = new THREE.Vector4();
  /** impl+0x230 대상 방향(캐릭터 공간) z — 생성자 1.0 */
  private headFront = 1;
  /** 눈 i: impl+0x100/+0x140 지난 출력, +0xF8/+0x138 섞임비 */
  private readonly eyeOut: [THREE.Vector2 | null, THREE.Vector2 | null] = [null, null];
  private readonly eyeBlend: [number, number] = [0, 0];
  /** 따라가기 진행용: 지난 장면 프레임과 모션 속도(주 슬롯 |speed|, 프레임 진행으로 잰다) */
  private lastNow: number | null = null;
  private motionSpeed = 1;
  headLook = true;
  eyesLook = true;

  constructor(readonly tpl: CharacterTemplate) {
    const gltf = tpl.gltf;
    this.root = cloneSkinned(gltf.scene);
    const eyeMap = tpl.eye;
    const eyeMat = tpl.info.eyeMaterial;
    this.eye = eyeMap
      ? {
          eyeMap: { value: eyeMap },
          eyeOffset0: { value: new THREE.Vector2() },
          eyeOffset1: { value: new THREE.Vector2() },
          eyeMaskAlpha: { value: 0 },
        }
      : null;
    this.eyeParamNames = [tpl.info.eyes[0].shaderparam ?? 'material_utility_parameter1', tpl.info.eyes[1].shaderparam ?? 'material_utility_parameter0'];
    const matCache = new Map<string, THREE.Material>();
    this.root.traverse((o) => {
      const vb = o.userData.visBone as string | undefined;
      if (vb && (o as THREE.Mesh).isMesh) {
        let l = this.meshesByVisBone.get(vb);
        if (!l) this.meshesByVisBone.set(vb, (l = []));
        l.push(o);
      }
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false;
      const src = o.material as THREE.Material;
      const rule = o.userData.mpjUv as string | undefined;
      const isBody = src.name === 'body_m' && src instanceof THREE.MeshStandardMaterial;
      if (!isBody) return;
      const useEye = !!this.eye && src.name === eyeMat && !!o.geometry.getAttribute('uv1');
      const ck = `${rule ?? ''}|${useEye}`;
      let m = matCache.get(ck);
      if (!m) {
        m = bodyMaterial(src, rule, useEye ? this.eye : null, tpl.color);
        matCache.set(ck, m);
      }
      o.material = m;
      if (useEye && !o.geometry.getAttribute('eyeUv')) o.geometry.setAttribute('eyeUv', o.geometry.getAttribute('uv1'));
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions.set(clip.name, a);
    }
    this.rightHand = this.root.getObjectByName('attach_R_hand') ?? null;
    this.head = this.root.getObjectByName('head_aimcont') ?? null;
    if (this.head) this.headRest.copy(this.head.quaternion);
    this.setupBlink();
    this.setEyeMaskFromAlbedo();
  }

  /** 알베도 알파를 흰자 마스크로 쓸지(알파 채널이 있는 png 인지) — 이미지 로드 뒤 판정 */
  private setEyeMaskFromAlbedo(): void {
    if (!this.eye) return;
    let alb: THREE.Texture | null = null;
    this.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!alb && m && m.name === 'body_m' && m.map) alb = m.map;
    });
    const img = (alb as THREE.Texture | null)?.image as HTMLImageElement | ImageBitmap | undefined;
    this.eye.eyeMaskAlpha.value = img ? (hasAlpha(img) ? 1 : 0) : 0;
  }

  private setupBlink(): void {
    const blink = this.tpl.gltf.animations.find((c) => c.name === 'fcl_blink00');
    const blinkShape = this.tpl.gltf.animations.find((c) => c.name === 'fcl_blink00_shape');
    const bind = (clip: THREE.AnimationClip | undefined, out: Sampled[]): void => {
      if (!clip) return;
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf('.');
        const nodeName = track.name.slice(0, dot);
        const prop = track.name.slice(dot + 1).replace(/\[.*$/, '');
        const node = this.root.getObjectByName(nodeName);
        if (!node) continue;
        const interp = (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
        let apply: (v: ArrayLike<number>) => void;
        if (prop === 'quaternion') apply = (v) => node.quaternion.set(v[0], v[1], v[2], v[3]);
        else if (prop === 'position') apply = (v) => node.position.set(v[0], v[1], v[2]);
        else if (prop === 'scale') apply = (v) => node.scale.set(v[0], v[1], v[2]);
        else if (prop === 'morphTargetInfluences') {
          const meshes: THREE.Mesh[] = [];
          node.traverse((c) => {
            if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).morphTargetInfluences) meshes.push(c as THREE.Mesh);
          });
          apply = (v) => {
            for (const m of meshes) for (let i = 0; i < m.morphTargetInfluences!.length && i < v.length; i++) m.morphTargetInfluences![i] = v[i];
          };
        } else continue;
        out.push({ track, interp, apply });
      }
    };
    bind(blink, this.blinkSkel);
    bind(blinkShape, this.blinkShape);
  }

  hasMotion(name: string): boolean {
    this.bindExtra();
    return this.actions.has(name);
  }

  /** 머리 추적 대상(월드 좌표, null = 대상 없음 SetTargetNone)과 가중치 */
  setHead(target: { x: number; y: number; z: number } | null, weight: number): void {
    this.headTarget = target ? new THREE.Vector3(target.x, target.y, target.z) : null;
    this.headWeight = weight;
  }

  /** 템플릿이 뒤에 읽은 클립을 액션으로 붙인다 */
  private bindExtra(): void {
    for (const clip of this.tpl.extraClips) {
      if (this.actions.has(clip.name)) continue;
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions.set(clip.name, a);
    }
  }

  /** 모션 이름과 원본 프레임(60fps) 으로 포즈를 정한다 */
  /** 애니 믹서를 멈추고 캐시를 푼다(메시·재질은 장면 해제가 푼다) */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }

  pose(motion: string, frame: number, opts: PoseOptions = {}): void {
    this.bindExtra();
    const info = this.tpl.motions[motion];
    const a = this.actions.get(motion);
    if (!a || !info) return;
    const now = opts.now ?? 0;
    /* 시선 갱신은 원본 프레임마다 한 번 — 같은 장면 프레임을 다시 그리면 진행하지 않는다(now 가 없으면 부를 때마다 한 번) */
    const steps = opts.now === undefined || this.lastNow === null ? 1 : Math.max(0, now - this.lastNow);
    this.lastNow = opts.now ?? null;
    if (motion !== this.motion) {
      if (this.motion) {
        const blend = MPAT[this.motion]?.[motion] ?? 0;
        this.prev = blend > 0 ? { motion: this.motion, frame: this.lastFrame, since: now, frames: blend } : null;
      }
      this.bundleFrame = frame;
    } else {
      let d = frame - this.lastFrame;
      if (d < 0 && info.loop) d += info.frames;
      if (d < 0) {
        this.bundleFrame = frame;
        const blend = MPAT[motion]?.[motion] ?? 0;
        this.prev = blend > 0 ? { motion, frame: this.lastFrame, since: now, frames: blend } : null;
      } else {
        this.bundleFrame += d;
        if (steps > 0) this.motionSpeed = d / steps;
      }
    }
    this.motion = motion;
    this.lastFrame = frame;

    for (const [name, act] of this.actions) {
      const base = name.endsWith('_shape') ? name.slice(0, -6) : name;
      const on = base === motion;
      const isPrev = this.prev && base === this.prev.motion && !on;
      if (on || isPrev) {
        if (!act.isRunning()) act.play();
        const f = on ? frame : this.prev!.frame;
        act.time = Math.min(f / 60, act.getClip().duration);
        act.setEffectiveWeight(on ? 1 : 0);
      } else if (act.isRunning()) act.stop();
    }
    if (this.prev) {
      /* 전이: 이전 모션 가중치 1 − 경과/a (요청 프레임 진행 포함) */
      const w = Math.max(0, 1 - (now - this.prev.since + 1) / this.prev.frames);
      for (const [name, act] of this.actions) {
        const base = name.endsWith('_shape') ? name.slice(0, -6) : name;
        if (base === this.prev.motion && base !== motion) act.setEffectiveWeight(w);
        if (base === motion) act.setEffectiveWeight(1 - w);
      }
      if (w <= 0) this.prev = null;
    }
    this.mixer.update(0);

    /* 깜빡임 자식(같은 묶음, 자기 길이로 감김) */
    const blink = info.blinkName ? this.tpl.motions[info.blinkName] : undefined;
    if (info.blink.includes('fskb')) {
      for (const s of this.blinkSkel) s.apply(s.interp.evaluate(wrap(this.bundleFrame, s.track.times[s.track.times.length - 1] * 60) / 60));
    }
    if (info.blink.includes('fshb')) {
      for (const s of this.blinkShape) s.apply(s.interp.evaluate(wrap(this.bundleFrame, s.track.times[s.track.times.length - 1] * 60) / 60));
    }
    this.applyVisibility(info, frame, blink && info.blink.includes('fvbb') ? blink : undefined);
    const look = this.applyHead(motion, steps);
    this.applyEyes(info, frame, look, steps);
  }

  private applyVisibility(info: MotionInfo, frame: number, blink: MotionInfo | undefined): void {
    if (info.vis) for (const [bone, steps] of Object.entries(info.vis)) this.setVisible(bone, visAt(steps, frame));
    if (blink?.vis) {
      const f = wrap(this.bundleFrame, blink.visFrames ?? 1);
      for (const [bone, steps] of Object.entries(blink.vis)) this.setVisible(bone, visAt(steps, f));
    }
  }

  private setVisible(bone: string, v: boolean): void {
    for (const o of this.meshesByVisBone.get(bone) ?? []) o.visible = v;
  }

  /**
   * 눈 오프셋 = 모션 ftsb 의 utility_parameter0/1 (없으면 재질 기본) 위에 ComHeading 눈 시선을 섞는다 [판독 FUN_71001c5a58].
   * 모드 2(Vector4 파라미터): 출력 = 모션 값 + (따라간 uv − 모션 값)·섞임비. 그 출력이 다음 프레임 따라가기의 출발(impl+0x100/+0x140).
   * 대상이 없거나 눈 시선이 꺼지면 uv 목표 = t_offset, 따라가기·섞임비 속도는 절반(섞임비는 0 쪽으로).
   */
  private applyEyes(info: MotionInfo, frame: number, look: LookState, steps: number): void {
    if (!this.eye) return;
    const matName = this.tpl.info.eyeMaterial ?? 'body_m';
    const params = info.mat?.[matName];
    const mat = this.tpl.gltf.parser.json.materials?.find((m: { name: string }) => m.name === matName) as
      | { extras?: { fres?: { params?: Record<string, { value: number[] }> } } }
      | undefined;
    const f = info.loop ? wrap(frame, info.matFrames ?? info.frames) : frame;
    for (let i = 0; i < 2; i++) {
      const pname = this.eyeParamNames[i];
      const def = mat?.extras?.fres?.params?.[pname]?.value ?? [0, 0];
      const p = params?.[pname];
      const ax = paramAt(p?.['0x00'], f) ?? def[0];
      const ay = paramAt(p?.['0x04'], f) ?? def[1];
      const e = this.tpl.info.eyes[i];
      const uni = (i === 0 ? this.eye.eyeOffset0 : this.eye.eyeOffset1).value;
      if (!e.shaderparam) {
        uni.set(ax, ay);
        continue;
      }
      const on = look.eyesActive;
      let tx = e.t_offset_x;
      let ty = e.t_offset_y;
      if (on) {
        const c = Math.cos(e.t_rot);
        const s = Math.sin(e.t_rot);
        tx = clamp(e.t_offset_x + (look.eyeYaw * c + look.eyePitch * s) * e.t_scale_x, e.t_min_x, e.t_max_x);
        ty = clamp(e.t_offset_y - (-s * look.eyeYaw + look.eyePitch * c) * e.t_scale_y, e.t_min_y, e.t_max_y);
      }
      const rate = on ? EYE_RATE : EYE_RATE * 0.5;
      let out = this.eyeOut[i];
      for (let n = 0; n < steps; n++) {
        this.eyeBlend[i] += rate * ((on ? 1 : 0) - this.eyeBlend[i]);
        const px = out ? out.x : ax;
        const py = out ? out.y : ay;
        const sx = px + (tx - px) * rate;
        const sy = py + (ty - py) * rate;
        out = (out ?? new THREE.Vector2()).set(ax + (sx - ax) * this.eyeBlend[i], ay + (sy - ay) * this.eyeBlend[i]);
      }
      this.eyeOut[i] = out;
      if (out) uni.copy(out);
      else uni.set(ax, ay);
    }
  }

  /**
   * 머리 시선 [판독 FUN_71001bea18 이벤트 0x5f454e00·04·05 → FUN_71001bfe08·FUN_71001c1694]. steps = 지난 원본 프레임 수(따라가기 진행).
   * 반환 = 같은 대상 회전으로 눈 계산(FUN_71001c5a58)이 쓰는 값.
   */
  private applyHead(motion: string, steps: number): LookState {
    const head = this.head;
    const look: LookState = { eyesActive: !!this.headTarget && this.eyesLook, eyePitch: 0, eyeYaw: 0 };
    if (!head) return look;
    head.quaternion.copy(this.headRest);
    this.root.updateMatrixWorld(true);
    /* 대상 회전 qT: 대상 위치를 head(부모) 공간 방향으로 바꿔 +Z → 그 방향 최단 회전(1 + 내적 ≤ ulp 면 (1,0,0,0)).
       대상 없음·머리 시선 꺼짐이면 단위 [판독 FUN_71001c0c90 앞머리]. impl+0x230 = 같은 대상의 캐릭터 공간 방향 z */
    const qT = new THREE.Quaternion();
    if (this.headTarget && this.headLook && head.parent) {
      const dir = head.parent.worldToLocal(this.headTarget.clone()).sub(head.position);
      const ent = this.root.worldToLocal(this.headTarget.clone()).sub(this.root.worldToLocal(head.getWorldPosition(new THREE.Vector3())));
      if (dir.lengthSq() > 0 && ent.lengthSq() > 0) {
        dir.normalize();
        this.headFront = ent.normalize().z;
        const d1 = 1 + dir.z;
        if (d1 <= F32_EPS) qT.set(1, 0, 0, 0);
        else {
          const s = Math.sqrt(d1 + d1);
          qT.set(-dir.y / s, dir.x / s, 0, s * 0.5);
        }
      }
    }
    /* 가중치: 모션 user data headLookWeight(0 이상) 가 있으면 그것, 아니면 SetHeadLookWeight 값(mg1801 0.3) */
    const mw = MOTION_HEAD_WEIGHT[this.tpl.key]?.[motion];
    const hw = mw !== undefined && mw >= 0 ? mw : this.headWeight;
    const q = new THREE.Quaternion().slerp(qT, hw);
    if (this.headTarget) {
      /* YZX 분해 → head_min/max 로 자름 → ZYX 재구성 [판독 디스어셈블리 @0x71001c1ad8·@0x71001c38b4~0x71001c39b0] */
      const h = this.tpl.info.head;
      const e = new THREE.Euler().setFromQuaternion(q, 'YZX');
      e.set(clamp(e.x, h.min_x * DEG, h.max_x * DEG), clamp(e.y, h.min_y * DEG, h.max_y * DEG), clamp(e.z, h.min_z * DEG, h.max_z * DEG), 'ZYX');
      q.setFromEuler(e);
    }
    /* 따라가기 모드 4: 대상 각속도 ω = acos(대상·지난 대상)/dt 로 스프링·선형을 고른다. 시간 = dt·|모션 속도| */
    const cur = this.headCur;
    const vel = this.headVel;
    const pt = this.headPrevT;
    const sp = Math.abs(this.motionSpeed);
    for (let n = 0; n < steps; n++) {
      const w = Math.acos(clamp(q.x * pt.x + q.y * pt.y + q.z * pt.z + q.w * pt.w, -1, 1)) / FRAME_SEC;
      const lin = w > HEAD_W_LO ? cur.clone().rotateTowards(q, FRAME_SEC * sp * HEAD_LINEAR_SPEED) : null;
      let spr: THREE.Quaternion | null = null;
      if (w < HEAD_W_HI) {
        const h = FRAME_SEC * sp;
        vel.x += ((cur.x - q.x) * -HEAD_K - vel.x * HEAD_C) * h;
        vel.y += ((cur.y - q.y) * -HEAD_K - vel.y * HEAD_C) * h;
        vel.z += ((cur.z - q.z) * -HEAD_K - vel.z * HEAD_C) * h;
        vel.w += ((cur.w - q.w) * -HEAD_K - vel.w * HEAD_C) * h;
        spr = new THREE.Quaternion(cur.x + vel.x * h, cur.y + vel.y * h, cur.z + vel.z * h, cur.w + vel.w * h).normalize();
      }
      if (lin && spr) cur.copy(spr.slerp(lin, (w - HEAD_W_LO) / HEAD_W_LO));
      else cur.copy((lin ?? spr)!);
      pt.set(q.x, q.y, q.z, q.w);
    }
    if (Math.abs(Math.abs(cur.w) - 1) >= F32_EPS) {
      head.quaternion.copy(cur).multiply(this.headRest);
      head.updateMatrixWorld(true);
    }
    /* 눈 회전(impl+0xC0 = 1): 단위 → qT 를 clamp(앞쪽 + 1.8, 0, 2)·(눈 가중치 − 머리 가중치) (≤ 2) 만큼 — 1 을 넘으면 넘어서 돈다 */
    const t = Math.min(2, clamp(this.headFront + 1.8, 0, 2) * (EYES_LOOK_WEIGHT - hw));
    const ee = new THREE.Euler().setFromQuaternion(slerpFromIdentity(qT, t), 'YZX');
    look.eyePitch = ee.x;
    look.eyeYaw = ee.y;
    return look;
  }
}

/** 눈 계산에 넘기는 시선 상태 */
interface LookState {
  /** 대상이 있고 눈 시선이 켜졌는지(impl+0x1B0 ≠ 0 && +0x235) */
  eyesActive: boolean;
  /** 눈 회전의 X·Y 각(YZX 분해, rad) */
  eyePitch: number;
  eyeYaw: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 단위 → q slerp(최단 경로, t 가 1 을 넘으면 연장). 거의 같으면 선형 [판독 FUN_71001c5a58 앞머리] */
function slerpFromIdentity(q: THREE.Quaternion, t: number): THREE.Quaternion {
  const dot = q.w;
  const sg = dot < 0 ? -1 : 1;
  const c = Math.abs(dot);
  let s0 = 1 - t;
  let s1 = t * sg;
  if (c <= 1 - F32_EPS) {
    const th = Math.acos(c);
    const si = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / si;
    s1 = (sg * Math.sin(t * th)) / si;
  }
  return new THREE.Quaternion(q.x * s1, q.y * s1, q.z * s1, s0 + q.w * s1);
}

const alphaCache = new WeakMap<object, boolean>();
/** png 에 실제로 0 이 아닌 알파 변화가 있는지(작게 그려서 본다) */
function hasAlpha(img: HTMLImageElement | ImageBitmap): boolean {
  const c = alphaCache.get(img);
  if (c !== undefined) return c;
  let r = false;
  try {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (g) {
      g.drawImage(img as CanvasImageSource, 0, 0, 128, 128);
      const d = g.getImageData(0, 0, 128, 128).data;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] < 128) {
          r = true;
          break;
        }
      }
    }
  } catch {
    r = false;
  }
  alphaCache.set(img, r);
  return r;
}
