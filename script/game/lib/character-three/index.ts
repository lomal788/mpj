/**
 * 캐릭터 런타임 three 어댑터 — three + 코어(../character)만 import. 설계: docs/engine/09_character.md §14.1·§14.2.
 *
 * - CharacterView: 복제한 모델(재질은 소비자 끼움점이 건다 — 캐릭터 선택 몸·눈 셰이더 그래프, 광장 NPC 그래프)에 코어 MotionSlot 의 결정을 그린다.
 *   · 'mixer'(웹 이전, RULES_WEB): 새 노드마다 믹서 액션을 노드 프레임으로 걸고 블렌드 초 fadeIn/fadeOut, 매 틱 mixer.update(dt) — 기존 Preview3D 와 같은 호출 순서.
 *   · 'original'(RULES_ORIGINAL): 클립을 frame/60 에서 직접 샘플, type 1 = 이전 포즈 고정 + 본(bex_no_transit_bone·bex_limit_transit_bone)·
 *     shape(bex_limit_transit_shape) 별 시간 clamp 가중치, type 4 = 이전 노드도 진행하는 크로스페이드(09 §4.2·§6.5).
 *   · 깜빡임 묶음(AnimationNodeBundle 둘째 자식 fcl_blink00): 프레임 = 묶음 노드 프레임(코어 bundleFrame)을 깜빡임 길이로 감음.
 *   · 뼈 보임 → 메시 보임(visBone): 깜빡임 vis → 지금 모션 vis → 뼈 기본값.
 * - HeadView: 코어 HeadLook 의 three 쪽 — head_aimcont 를 쉬는 자세로 되돌리고(애니에 이 뼈 트랙 없음) 대상 방향을 부모·캐릭터 공간으로 바꿔 넘긴 뒤 결과를 곱한다.
 *   chin·neck_roll 은 원본 스위치(HeadRules)일 때만 쓴다.
 * - 보조 물리(흔들림 본·D6) 자리: 코어 PhysicsSlot 상태만 있고 포즈는 애니 값 그대로(09 §13 — 솔버 동등성 차단).
 * 매 틱 할당 0(임시 벡터·버퍼는 생성 때 만든다).
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FLT_MAX, TRANSITION_CROSSFADE, neckQuat, quat, type HeadInput, type HeadLook, type MotionInfo, type MotionSlot } from '../character';

export type MatTable = Record<string, Record<string, Record<string, number | number[]>>>;

/** motions.json 한 항목(재질·보임 표 포함) */
export interface MotionData extends MotionInfo {
  matFrames?: number;
  mat?: MatTable;
  visFrames?: number;
  vis?: Record<string, [number, number][]>;
}

export type MotionDataTable = Record<string, MotionData>;

/** 모델 glb + 모션 glb 들 + motions.json */
export interface CharacterAssets {
  gltf: GLTF;
  animGltfs: readonly GLTF[];
  motions: MotionDataTable;
}

export const wrap = (f: number, n: number | undefined): number => (n && n > 0 ? f % n : f);

export function stepAt(steps: [number, number][], f: number): number {
  let v = steps[0]?.[1] ?? 1;
  for (const [fr, val] of steps) {
    if (fr > f) break;
    v = val;
  }
  return v;
}

interface Sampled {
  node: THREE.Object3D;
  /** 0 position · 1 quaternion · 2 scale · 3 morph */
  kind: number;
  /** null = 이 클립에 트랙이 없는 (노드, 속성) — 쉬는 자세 값 */
  interp: THREE.Interpolant | null;
  meshes: THREE.Mesh[];
  /** 전이 시간 clamp [min, max] */
  min: number;
  max: number;
  /** 버퍼 위치(이전 포즈) */
  at: number;
}

const SHAPE_KEY = 'bex_limit_transit_shape';

/** 노드 user data(glb extras.userData)의 전이 제한 [판독 FUN_710010aaf0: no_transit {0,0}, limit {0,v} — 둘 다면 limit] */
/** @orig main:710010aaf0 ref */
function boneLimit(o: THREE.Object3D): [number, number] {
  const ud = (o.userData?.userData ?? {}) as Record<string, { value?: unknown }>;
  let r: [number, number] = [0, FLT_MAX];
  if (ud.bex_no_transit_bone) r = [0, 0];
  const lim = ud.bex_limit_transit_bone?.value;
  if (Array.isArray(lim) && typeof lim[0] === 'number') r = [0, lim[0]];
  return r;
}

/**
 * 캐릭터 하나의 three 쪽. root 는 소비자가 복제·재질을 건 모델(SkeletonUtils.clone), 클립 = 모델 클립 + 모션 glb 클립(노드 이름으로 건다).
 */
export class CharacterView {
  readonly mixer: THREE.AnimationMixer;
  readonly blink: THREE.AnimationMixer | null;
  blinkOn = false;
  acts: THREE.AnimationAction[] = [];
  readonly clips: Map<string, THREE.AnimationClip>;
  readonly motions: MotionDataTable;
  readonly visMeshes = new Map<string, THREE.Object3D[]>();
  readonly boneDefault = new Map<string, boolean>();
  /** 원본 샘플러(클립 이름 → 트랙) — 'original' 전이일 때만 만든다 */
  private sampled: Map<string, Sampled[]> | null = null;
  private frozen: Float64Array | null = null;
  private prevBuf: Float64Array | null = null;
  private frozenSeq = -1;
  private readonly slotAt = new Map<string, number>();
  private slotEnd = 0;
  /** (노드, 속성)마다 처음 만났을 때 값 = 쉬는 자세. 클립에 트랙이 없는 뼈는 이 값(원본 스켈레탈 노드 평가 [추정]) */
  private rest = new Float64Array(256);
  private readonly restEntries: Sampled[] = [];
  private readonly fullCache = new Map<string, { end: number; list: Sampled[] }>();
  private readonly shapeLimit = new Map<string, number>();
  private readonly v3 = new THREE.Vector3();
  private readonly q4 = new THREE.Quaternion();

  constructor(
    readonly root: THREE.Object3D,
    a: CharacterAssets,
  ) {
    root.traverse((o) => {
      if (o.userData.visible === false) this.boneDefault.set(o.name, false);
      const vb = o.userData.visBone as string | undefined;
      if (vb && (o as THREE.Mesh).isMesh) {
        let list = this.visMeshes.get(vb);
        if (!list) this.visMeshes.set(vb, (list = []));
        list.push(o);
      }
    });
    this.mixer = new THREE.AnimationMixer(root);
    const anims = [...a.gltf.animations, ...a.animGltfs.flatMap((g) => g.animations)];
    this.clips = new Map(anims.map((c) => [c.name, c]));
    this.blink = anims.some((c) => c.name === 'fcl_blink00' || c.name === 'fcl_blink00_shape') ? new THREE.AnimationMixer(root) : null;
    this.motions = a.motions;
    const mud = (a.gltf.parser.json.extras as { modelUserData?: Record<string, { value?: unknown }> } | undefined)?.modelUserData?.[SHAPE_KEY]?.value;
    if (Array.isArray(mud)) for (let i = 0; i + 1 < mud.length; i += 2) this.shapeLimit.set(String(mud[i]), Number(mud[i + 1]));
  }

  /** 새 노드(웹 이전 믹서): 지금 모션을 노드 프레임으로 걸고 blend 초 크로스페이드. 클립 프레임 = 슬롯 bundleFrame */
  start(slot: MotionSlot, blend: number): void {
    const mixer = this.mixer;
    if (slot.rules.transit === 'original') {
      mixer.stopAllAction();
      this.acts = [];
      return;
    }
    const info = slot.info;
    const once = !!info && !info.loop;
    const acts: THREE.AnimationAction[] = [];
    for (const name of [slot.name, `${slot.name}_shape`]) {
      const clip = this.clips.get(name);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = true;
      a.time = (once ? Math.min(slot.bundleFrame, info!.frames) : wrap(slot.bundleFrame, info?.frames)) / 60;
      a.play();
      if (blend > 0 && this.acts.length) a.fadeIn(blend);
      acts.push(a);
    }
    for (const clip of this.clips.values()) {
      const a = mixer.existingAction(clip);
      if (!a || acts.includes(a)) continue;
      if (blend > 0 && this.acts.includes(a)) a.fadeOut(blend);
      else a.stop();
    }
    this.acts = acts;
  }

  /** 믹서를 dt 초 진행하고 깜빡임(프레임 = 묶음 노드 프레임)·보임을 맞춘다. 돌려주는 값 = 지금 모션·깜빡임 정보(재질 끼움점이 쓴다) */
  pose(slot: MotionSlot, dt: number): { cur: MotionData | undefined; blink: MotionData | undefined } {
    const cur = this.motions[slot.name];
    const blink = cur?.blinkName ? this.motions[cur.blinkName] : undefined;
    if (!blink && this.blinkOn) {
      this.blink?.stopAllAction();
      this.blinkOn = false;
    }
    if (slot.rules.transit === 'original') {
      this.sampleOriginal(slot);
      if (blink) this.evalApply(this.bind('fcl_blink00'), wrap(slot.bundleFrame, blink.frames) / 60);
    } else {
      this.mixer.update(dt);
      this.applyBlink(slot, blink);
    }
    this.applyVis(slot, cur, blink);
    return { cur, blink };
  }

  private applyBlink(slot: MotionSlot, blink: MotionData | undefined): void {
    if (!blink || !this.blink) return;
    for (const name of ['fcl_blink00', 'fcl_blink00_shape']) {
      const clip = this.clips.get(name);
      if (!clip) continue;
      const a = this.blink.clipAction(clip);
      if (!this.blinkOn) a.reset().play();
      a.time = wrap(slot.bundleFrame, blink.frames) / 60;
    }
    this.blinkOn = true;
    this.blink.update(0);
  }

  /** 뼈 보임 → 메시 보임 (docs 12.1) */
  private applyVis(slot: MotionSlot, cur: MotionData | undefined, blink: MotionData | undefined): void {
    const fr = slot.bundleFrame;
    const f = cur?.loop ? wrap(fr, cur.visFrames ?? cur.frames) : fr;
    const bf = blink ? wrap(fr, blink.visFrames ?? blink.frames) : 0;
    for (const [bone, meshes] of this.visMeshes) {
      let v: number | undefined;
      if (blink?.vis?.[bone]) v = stepAt(blink.vis[bone], bf);
      else if (cur?.vis?.[bone]) v = stepAt(cur.vis[bone], f);
      const on = v === undefined ? this.boneDefault.get(bone) !== false : v !== 0;
      for (const m of meshes) m.visible = on;
    }
  }

  /* ---------------- 원본 전이(직접 샘플) ---------------- */

  /** 클립(+ _shape) 트랙 묶음. 버퍼 위치는 (노드, 속성)마다 하나(모든 클립 공통) — 만들 때만 할당 */
  private bind(name: string): Sampled[] {
    const map = (this.sampled ??= new Map());
    let list = map.get(name);
    if (list) return list;
    list = [];
    for (const cn of [name, `${name}_shape`]) {
      const clip = this.clips.get(cn);
      if (!clip) continue;
      for (const track of clip.tracks) {
        const dot = track.name.lastIndexOf('.');
        const node = this.root.getObjectByName(track.name.slice(0, dot));
        const prop = track.name.slice(dot + 1).replace(/\[.*$/, '');
        if (!node) continue;
        const kind = prop === 'position' ? 0 : prop === 'quaternion' ? 1 : prop === 'scale' ? 2 : prop === 'morphTargetInfluences' ? 3 : -1;
        if (kind < 0) continue;
        const meshes: THREE.Mesh[] = [];
        let [min, max] = boneLimit(node);
        if (kind === 3) {
          node.traverse((c) => {
            if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).morphTargetInfluences) meshes.push(c as THREE.Mesh);
          });
          const lim = this.shapeLimit.get(node.name) ?? this.shapeLimit.get(node.name.replace(/__mesh$/, '')) ?? meshes.map((m) => this.shapeLimit.get(m.name)).find((v) => v !== undefined);
          [min, max] = lim !== undefined ? [0, lim] : [0, FLT_MAX];
        }
        const size = kind === 1 ? 4 : kind === 3 ? Math.max(1, meshes[0]?.morphTargetInfluences?.length ?? 1) : 3;
        const key = `${node.uuid}|${kind}`;
        let at = this.slotAt.get(key);
        if (at === undefined) {
          at = this.slotEnd;
          this.slotAt.set(key, at);
          this.slotEnd += size;
          if (this.rest.length < this.slotEnd) {
            const r = new Float64Array(this.slotEnd * 2);
            r.set(this.rest);
            this.rest = r;
          }
          const e: Sampled = { node, kind, interp: null, meshes, min, max, at };
          this.save([e], this.rest);
          this.restEntries.push(e);
        }
        list.push({ node, kind, interp: (track as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant(), meshes, min, max, at });
      }
    }
    map.set(name, list);
    if (!this.frozen || this.frozen.length < this.slotEnd) {
      this.frozen = new Float64Array(this.slotEnd + 64);
      this.prevBuf = new Float64Array(this.slotEnd + 64);
    }
    return list;
  }

  /** 노드 지금 값 → 버퍼 */
  private save(list: Sampled[], buf: Float64Array): void {
    for (const s of list) {
      const n = s.node;
      if (s.kind === 0) n.position.toArray(buf, s.at);
      else if (s.kind === 1) n.quaternion.toArray(buf, s.at);
      else if (s.kind === 2) n.scale.toArray(buf, s.at);
      else {
        const w = s.meshes[0]?.morphTargetInfluences;
        if (w) for (let i = 0; i < w.length; i++) buf[s.at + i] = w[i];
      }
    }
  }

  /** 클립 트랙 + 그 클립이 움직이지 않는 (노드, 속성)의 쉬는 자세 항목 — 새 (노드, 속성)이 생기면 다시 만든다 */
  private full(name: string): Sampled[] {
    const tracks = this.bind(name);
    const c = this.fullCache.get(name);
    if (c && c.end === this.slotEnd) return c.list;
    const has = new Set(tracks.map((t) => t.at));
    const list = tracks.concat(this.restEntries.filter((e) => !has.has(e.at)));
    this.fullCache.set(name, { end: this.slotEnd, list });
    return list;
  }

  private value(s: Sampled, t: number): ArrayLike<number> {
    if (s.interp) return s.interp.evaluate(t);
    return this.rest.subarray(s.at, s.at + (s.kind === 1 ? 4 : s.kind === 3 ? Math.max(1, s.meshes[0]?.morphTargetInfluences?.length ?? 1) : 3));
  }

  private evalInto(list: Sampled[], t: number, buf: Float64Array): void {
    for (const s of list) {
      const v = this.value(s, t);
      for (let i = 0; i < v.length; i++) buf[s.at + i] = v[i];
    }
  }

  private evalApply(list: Sampled[], t: number): void {
    for (const s of list) {
      const v = this.value(s, t);
      const n = s.node;
      if (s.kind === 0) n.position.set(v[0], v[1], v[2]);
      else if (s.kind === 1) n.quaternion.set(v[0], v[1], v[2], v[3]);
      else if (s.kind === 2) n.scale.set(v[0], v[1], v[2]);
      else for (const m of s.meshes) for (let i = 0; i < m.morphTargetInfluences!.length && i < v.length; i++) m.morphTargetInfluences![i] = v[i];
    }
  }

  /** 노드 = mix(버퍼, 노드, w) — w = 새 노드 가중치(uniform 이면 슬롯 하나, 아니면 본·shape 시간 clamp) */
  private mixFrom(list: Sampled[], buf: Float64Array, slot: MotionSlot, uniform: boolean): void {
    for (const s of list) {
      const w = uniform ? slot.weight() : slot.weight(s.min, s.max);
      if (w >= 1) continue;
      const n = s.node;
      if (s.kind === 1) {
        this.q4.fromArray(buf, s.at);
        n.quaternion.copy(this.q4.slerp(n.quaternion, w));
      } else if (s.kind === 0 || s.kind === 2) {
        this.v3.fromArray(buf, s.at);
        const t = s.kind === 0 ? n.position : n.scale;
        t.copy(this.v3.lerp(t, w));
      } else
        for (const m of s.meshes) {
          const inf = m.morphTargetInfluences!;
          for (let i = 0; i < inf.length; i++) inf[i] = buf[s.at + i] + (inf[i] - buf[s.at + i]) * w;
        }
    }
  }

  /** 'original': 새 노드 = frame/60 샘플. type 1 = 시작 순간 포즈 고정 → 본별 clamp 가중치, type 4 = 이전 노드 prevFrame 샘플과 균일 가중치 */
  private sampleOriginal(slot: MotionSlot): void {
    if (slot.prevName) this.bind(slot.prevName);
    const cur = this.full(slot.name);
    const crossfade = slot.transitType === TRANSITION_CROSSFADE && !!slot.prevName;
    const prev = crossfade ? this.full(slot.prevName) : null;
    if (slot.transitType && !crossfade && this.frozenSeq !== slot.startSeq) {
      this.frozenSeq = slot.startSeq;
      this.save(cur, this.frozen!);
    }
    if (prev) {
      this.save(cur, this.prevBuf!);
      this.evalInto(prev, slot.prevFrame / 60, this.prevBuf!);
    }
    this.evalApply(cur, slot.frame / 60);
    if (!slot.transitType) return;
    if (prev) this.mixFrom(cur, this.prevBuf!, slot, true);
    else this.mixFrom(cur, this.frozen!, slot, false);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.blink?.stopAllAction();
  }
}

/** 시선 대상: 위치 고정 또는 물체(뼈 이름이 있으면 그 뼈 월드 위치, 없으면 물체 원점) */
export type HeadTarget = { pos: THREE.Vector3 } | { obj: THREE.Object3D; bone?: string } | null;

/**
 * 코어 HeadLook 의 three 쪽(bex::ComHeading 이벤트 0x5f454e00·04·05). bind → apply(root, steps) 순서로 부른다.
 * 대상 방향: head_aimcont 부모 공간(원점 = head_aimcont 위치), 캐릭터 공간(root 기준, head 월드 위치에서 대상까지).
 */
export class HeadView {
  head: THREE.Object3D | null = null;
  chin: THREE.Object3D | null = null;
  neck: THREE.Object3D | null = null;
  /** head_aimcont 바인드 로컬 회전(단위) — 매 프레임 여기로 되돌린다 */
  readonly rest = new THREE.Quaternion();
  private readonly tp = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly hw = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly m4 = new THREE.Matrix4();
  private readonly hInv = new Float64Array(9);
  private readonly n9 = new Float64Array(9);
  private readonly nq = quat();
  private readonly nt = quat();

  constructor(readonly look: HeadLook) {}

  /** 모델이 붙은 뒤 한 번: head_aimcont 와 쉬는 자세 */
  bind(root: THREE.Object3D): void {
    this.head = root.getObjectByName('head_aimcont') ?? null;
    if (this.head) this.rest.copy(this.head.quaternion);
    this.chin = root.getObjectByName('chin') ?? null;
    this.neck = root.getObjectByName('neck_roll') ?? null;
  }

  get bound(): boolean {
    return !!this.head;
  }

  private targetPos(t: HeadTarget): THREE.Vector3 | null {
    if (!t) return null;
    if ('pos' in t) return this.tp.copy(t.pos);
    const b = t.bone ? t.obj.getObjectByName(t.bone) : null;
    return (b ?? t.obj).getWorldPosition(this.tp);
  }

  /** 모션 포즈 뒤 steps 프레임만큼. inp 의 headOn·eyesOn·motionWeight·speedScale 은 부르는 쪽이 채운다 */
  apply(root: THREE.Object3D, steps: number, target: HeadTarget, inp: HeadInput): void {
    const head = this.head;
    if (!head) return;
    head.quaternion.copy(this.rest);
    root.updateMatrixWorld(true);
    const tp = this.targetPos(target);
    inp.has = !!tp;
    inp.dx = inp.dy = inp.dz = inp.cx = inp.cy = inp.cz = 0;
    if (tp && inp.headOn && head.parent) {
      const dir = head.parent.worldToLocal(this.a.copy(tp)).sub(head.position);
      const ent = root.worldToLocal(this.b.copy(tp)).sub(root.worldToLocal(head.getWorldPosition(this.hw)));
      inp.dx = dir.x;
      inp.dy = dir.y;
      inp.dz = dir.z;
      inp.cx = ent.x;
      inp.cy = ent.y;
      inp.cz = ent.z;
    }
    if (this.look.rules.chin && this.chin) {
      this.e.setFromQuaternion(this.chin.quaternion, 'YZX');
      inp.chinX = this.e.x;
    } else inp.chinX = NaN;
    this.look.update(steps, inp);
    const c = this.look.cur;
    if (this.look.apply) {
      head.quaternion.set(c[0], c[1], c[2], c[3]).multiply(this.rest);
      head.updateMatrixWorld(true);
    }
    if (this.look.rules.neck && this.neck) this.applyNeck(head, this.neck);
  }

  /** neck_roll = qN + 0.5(qH − qN), qH = inverse(head 로컬 회전), 로컬 이동 0 [판독 @0x71001c4948~, 정규화 없음 → three 는 정규화해 건다 [근사]] */
  private applyNeck(head: THREE.Object3D, neck: THREE.Object3D): void {
    const m = this.m4.makeRotationFromQuaternion(head.quaternion).invert().elements;
    const h = this.hInv;
    h[0] = m[0];
    h[1] = m[4];
    h[2] = m[8];
    h[3] = m[1];
    h[4] = m[5];
    h[5] = m[9];
    h[6] = m[2];
    h[7] = m[6];
    h[8] = m[10];
    const n = this.m4.makeRotationFromQuaternion(neck.quaternion).elements;
    const k = this.n9;
    k[0] = n[0];
    k[1] = n[4];
    k[2] = n[8];
    k[3] = n[1];
    k[4] = n[5];
    k[5] = n[9];
    k[6] = n[2];
    k[7] = n[6];
    k[8] = n[10];
    const q = neckQuat(h, k, this.nq, this.nt);
    neck.quaternion.set(q[0], q[1], q[2], q[3]).normalize();
    neck.position.set(0, 0, 0);
    neck.updateMatrixWorld(true);
  }
}
