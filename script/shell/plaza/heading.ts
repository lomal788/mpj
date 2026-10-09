/**
 * bex::ComHeading 머리 시선(광장 NPC·따라가기 공용) — docs/engine/09_character.md §4.6·§6.8 [판독 main FUN_71001bea18·FUN_71001bfe08·FUN_71001c0c90·FUN_71001c1694].
 * 매 프레임 head_aimcont 로컬을 쉬는 자세로 되돌린 뒤(애니 클립에 이 뼈 트랙이 없음), 대상 방향 최단 회전을 head_weight 로 slerp →
 * YZX 분해 → head_min/max(도) 자름 → ZYX 재구성 → 모드 4(임계 감쇠 스프링 / 선형 / 둘의 slerp)로 따라간다.
 * 값: impl 기본 speedCoef 0.12·linearSpeed 5, 한계·가중치는 characterlist 레코드(head_*). 눈 시선(FUN_71001c5a58)은 eyeYaw/eyePitch 로 내보낸다.
 * 계산은 공용 캐릭터 런타임(lib/character HeadLook·lib/character-three HeadView, 09 §14) — 이 파일은 광장 쪽 이름(head_* 필드·enabled)을 잇는다.
 */
import * as THREE from 'three';
import { characterDefaults, HeadLook, headInput } from '../../lib/character';
import { HeadView, type HeadTarget as Target } from '../../lib/character-three';

export interface HeadParams {
  head_min_x?: number | null;
  head_min_y?: number | null;
  head_min_z?: number | null;
  head_max_x?: number | null;
  head_max_y?: number | null;
  head_max_z?: number | null;
  head_weight?: number | null;
}

/** 대상: 위치 고정 또는 물체(뼈 이름이 있으면 그 뼈 월드 위치, 없으면 물체 원점) */
export type HeadTarget = Target;

export class Heading {
  target: HeadTarget = null;
  enabled = true;
  readonly look: HeadLook;
  private readonly view: HeadView;
  private readonly inp = headInput();

  constructor(p: HeadParams) {
    this.look = new HeadLook(
      {
        minDeg: [p.head_min_x ?? -10, p.head_min_y ?? -90, p.head_min_z ?? 0],
        maxDeg: [p.head_max_x ?? 10, p.head_max_y ?? 90, p.head_max_z ?? 0],
        weight: p.head_weight ?? 0.5,
      },
      characterDefaults.head,
    );
    this.view = new HeadView(this.look);
  }

  get eyeYaw(): number {
    return this.look.eyeYaw;
  }

  get eyePitch(): number {
    return this.look.eyePitch;
  }

  get eyesActive(): boolean {
    return this.look.eyesActive;
  }

  /** 모델이 붙은 뒤 한 번: head_aimcont 와 쉬는 자세 */
  bind(root: THREE.Object3D): void {
    this.view.bind(root);
  }

  get bound(): boolean {
    return this.view.bound;
  }

  /** 모션 포즈 뒤 steps 프레임만큼 */
  apply(root: THREE.Object3D, steps: number): void {
    this.inp.headOn = this.inp.eyesOn = this.enabled;
    this.inp.motionWeight = NaN;
    this.inp.speedScale = 1;
    this.view.apply(root, steps, this.target, this.inp);
  }
}
