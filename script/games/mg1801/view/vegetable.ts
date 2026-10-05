/**
 * 채소 한 개 화면 — 원본 mg1801::Obj 의 모델 쪽(본체 ComMatter + 조각 ComMatter·ComAttachment + 외곽선).
 * 값은 로직 state(ObjView)만 읽는다. 근거: docs/minigame/mg1801.md 4.5·6.2·6.4·6.5·6.8·6.10, docs/engine/03_graphics.md 7.1.
 *
 * - 본체 mg1801_obj0N.glb: 0.01 크기 더미 사각형 + 훅 뼈 attach00.. 와 'move' 모션(클립 이름 = 모델 이름, 30프레임).
 * - 조각 mg1801_obj0N_i.glb 를 본체 뼈 `attach%02d`(i) 에 붙인다(원본 ca::rm::util::SetModelHook).
 * - 판정 뼈 `<채소>{k}_{just|fast|slow}00` 가시성(원본 ApplyCutBoneVisible → SetBoneVisible).
 * - 외곽선 mg1801_obj0N_outline00.glb(원본 UpdateOutlineOnOff 의 SetVisible). 로직 ObjView.outline 이 참일 때만 보인다.
 *   위치: Obj::Entry 가 guide 일 때 외곽선 엔티티에 (lane·2 − 3 + offsetX[type], 1.5, 0) 를 한 번 넣는다(@0x7100007f20~0x7100007f64:
 *   x = 본체와 같은 값, y = fmov s1 0x3fc00000 = 1.5, z = 0) [판독]. 회전은 쓰지 않는다(단위). 본체 x 는 낙하 중 바뀌지 않으므로(Obj::Update 는 y 만 바꾼다) o.pos.x 를 쓴다.
 *   (Ghidra 의사코드는 이 인자를 본체 pos 로 보여 mg1801.md 6.2 가 "외곽선 위치 = pos"라 적었지만 y 는 7.5 가 아니라 1.5 다.)
 *   모양: 셰이프 전부(실루엣 + 자르는 자리 막대, 뼈 가시성 기본 켬). 재질 mt_obj00(조명 받음, 텍스처 없음, 기본색 흰색 ×
 *   material_mul_base_color 1.8)은 material.ts 가 재질 데이터대로 맞춘다. 원본 툰 외곽선(toon_depth_outline)은 근사하지 않는다.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ObjView } from '../state';

/** 원본 headName[type] — 판정 뼈 이름 앞부분 */
const HEAD_NAME = ['tomato', 'potato', 'eggplant', 'carrot', 'mushroom'];
/** JUDGE_INPUT_TYPE 0 JUST, 1 FAST, 2 SLOW 순서 */
const JUDGE_NAME = ['just', 'fast', 'slow'];

export interface VegetableTemplate {
  body: GLTF;
  pieces: GLTF[];
  outline: GLTF | null;
}

const qBody = new THREE.Quaternion();
const qBodyInv = new THREE.Quaternion();
const qZ = new THREE.Quaternion();
const eBody = new THREE.Euler(0, 0, 0, 'ZYX');
const AXIS_Z = new THREE.Vector3(0, 0, 1);
/** Obj::Entry 의 외곽선 엔티티 y [판독] */
const OUTLINE_Y = 1.5;

/**
 * glb 노드 extras.visBone(GLTFLoader 가 userData 로 옮김)으로 뼈 → 메시 목록을 만든다.
 * three.js 에는 뼈 숨김이 없다. 원본 SetBoneVisible 은 그 뼈를 가시성 뼈(visBone)로 가진 셰이프를 그리지 않게 하므로,
 * 같은 visBone 을 가진 메시의 visible 을 끈다(03_graphics.md 7.1 "뼈 가시성 = visBone 뼈가 꺼지면 메시 숨김").
 * 뼈 scale 0 은 자식 뼈까지 접혀 버리므로 쓰지 않는다(조각 모델은 판정 뼈가 기본 조각 뼈의 자식이다).
 */
function meshesByVisBone(root: THREE.Object3D): Map<string, THREE.Object3D[]> {
  const map = new Map<string, THREE.Object3D[]>();
  root.traverse((o) => {
    const bone = (o.userData as { visBone?: string }).visBone;
    if (!bone || !(o as THREE.Mesh).isMesh) return;
    let list = map.get(bone);
    if (!list) map.set(bone, (list = []));
    list.push(o);
  });
  return map;
}

export class Vegetable {
  /** 본체 엔티티(위치·회전 = 로직 pos·rot) */
  readonly root: THREE.Object3D;
  /** 외곽선 엔티티(원본은 Entry 때 위치만 정한다, OUTLINE_Y) */
  readonly outline: THREE.Object3D | null;
  private readonly hooks: THREE.Group[] = [];
  private readonly judgeMeshes: THREE.Object3D[][][] = [];
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly move: THREE.AnimationAction | null = null;
  private moveBeat = -2;
  private moveStartFrame = 0;

  constructor(
    readonly type: number,
    tpl: VegetableTemplate,
  ) {
    this.root = tpl.body.scene.clone(true);
    this.root.visible = false;
    const cuts = tpl.pieces.length - 1;
    for (let i = 0; i <= cuts; i++) {
      const attach = this.root.getObjectByName(`attach${String(i).padStart(2, '0')}`) ?? this.root;
      const hook = new THREE.Group();
      hook.name = `hook${i}`;
      attach.add(hook);
      const piece = tpl.pieces[i].scene.clone(true);
      hook.add(piece);
      this.hooks.push(hook);
      if (i < cuts) {
        const byBone = meshesByVisBone(piece);
        this.judgeMeshes.push(JUDGE_NAME.map((j) => byBone.get(`${HEAD_NAME[type]}${i}_${j}00`) ?? []));
      }
    }
    this.outline = tpl.outline ? tpl.outline.scene.clone(true) : null;
    if (this.outline) this.outline.visible = false;
    const clip = tpl.body.animations[0];
    if (clip) {
      this.mixer = new THREE.AnimationMixer(this.root);
      this.move = this.mixer.clipAction(clip);
      this.move.setLoop(THREE.LoopOnce, 1);
      this.move.clampWhenFinished = true;
      this.move.play();
    }
  }

  /**
   * 로직 한 스텝마다 — 원본 Obj::Update 의 "박마다 'move' 처음부터"(moveBeat 가 바뀐 프레임)를 기록한다.
   * 원본 SetModelMotionSpeedAdjustFromTime('move', beatToSec(1,1)) — 30프레임 클립을 반 박에 맞춘다.
   */
  step(o: ObjView, frame: number): void {
    if (o.moveBeat !== this.moveBeat) {
      this.moveBeat = o.moveBeat;
      this.moveStartFrame = frame;
    }
  }

  /** 그리기 직전 — 위치·회전·조각 훅·판정 뼈·'move' 모션 */
  update(o: ObjView, frame: number, bpm: number): void {
    this.root.visible = true;
    this.root.position.set(o.pos.x, o.pos.y, o.pos.z);
    if (this.outline) {
      this.outline.visible = o.outline === true;
      if (this.outline.visible) this.outline.position.set(o.pos.x, OUTLINE_Y, 0);
    }
    /* 로직 오일러는 FRES 뼈와 같은 규약 R = Rz·Ry·Rx(03_graphics.md 6절) = three 'ZYX' */
    eBody.set(o.rot.x, o.rot.y, o.rot.z, 'ZYX');
    this.root.quaternion.setFromEuler(eBody);
    /*
     * 원본 Obj::CutObj @0x71000095f0: 훅 x += dt·속도(로직 pieces[i].dx 가 누적값),
     * 훅 회전 = B⁻¹ ⊗ Rz(angle) ⊗ B (B = 본체 엔티티 회전). 디스어셈블리의 두 번 곱(첫 곱 = 역쿼터니언 ⊗ Z축 쿼터니언,
     * 둘째 곱 = 그 결과 ⊗ B)을 그대로 옮겼다. 결과적으로 조각은 월드 Z축(화면 앞뒤 축)으로 돈다.
     */
    qBody.copy(this.root.quaternion);
    qBodyInv.copy(qBody).invert();
    o.pieces.forEach((p, i) => {
      const hook = this.hooks[i];
      if (!hook) return;
      hook.position.set(p.dx, 0, 0);
      qZ.setFromAxisAngle(AXIS_Z, (p.angleDeg * Math.PI) / 180);
      hook.quaternion.copy(qBodyInv).multiply(qZ).multiply(qBody);
    });
    /* 원본 Entry: just 켬·fast/slow 끔. RecieveHit: 판정과 같은 것만 켬(mg1801.md 6.2·6.5) */
    o.judge.forEach((j, k) => {
      const sets = this.judgeMeshes[k];
      if (!sets) return;
      const on = j < 0 ? 0 : j;
      sets.forEach((list, t) => {
        for (const m of list) m.visible = t === on;
      });
    });
    if (this.mixer && this.move) {
      const halfBeat = (60 / bpm) * 0.5;
      const dur = this.move.getClip().duration;
      const t = ((frame - this.moveStartFrame) / 60) * (dur / halfBeat);
      this.move.time = Math.min(Math.max(t, 0), dur);
      this.mixer.update(0);
    }
  }

  hide(): void {
    this.root.visible = false;
    if (this.outline) this.outline.visible = false;
  }
}
