/**
 * mg1801 NPC 헤이호 둘 — 원본 mg1801::MapImpl::Initialize @0x710000f9d0 (Params.RhythmNpcEnable 기본 1 일 때) [판독 mg1801.nro.c].
 * - 엔티티 mg1801Npc0·1 = ComMatter(NonPlayerCharacterID 5 = HEYHO → chara/npc002, 모델 npc002_heyho).
 * - 위치·회전 = 의자 모델 mg1801_stool_npc00 의 노드 attach_npc00·01(util::GetNodeTransform). 의자 엔티티는 원점이라 노드 월드 변환 그대로.
 * - 모션: AddAnimation("co_idle00"), 이름 "co_joyful00" 에 파일 joy_mot[Params.RhythmNpcMotNo] 를 붙인다.
 *   joy_mot = ["co_joyful02", "co_joyful00"] [데이터: nro @0x710003b0f0], RhythmNpcMotNo 기본 0 → co_joyful02.
 *   처음 Play("co_idle00"), 속도 = FrameMax / (GetBeatToSec(0,2)·60) (SetModelMotionSpeedAdjustFromTime @0x7100438a40 [판독]).
 * - 색: ca::rm::util::ChangeHeyhoColor(npc, 3) → container_m 의 mdl_utility_parameter0.x = 3. 몸 알베도 배열 3층(초록)으로 근사 [추정].
 * - ReceiveState(0,6)(결과)에서 NPC 둘과 의자를 숨긴다 [판독 @0x7100010a90].
 * 재생 상태(모션·프레임·표시)는 로직의 state.npc 를 따른다. state.npc 가 없으면 Initialize 의 co_idle00 을 장면 프레임으로 돌린다
 * (장면 시작 = Initialize 시각으로 본 근사). 채널 (0,1)의 "demo" 는 NPC 가 아니라 line01 모델 모션이다(isLineDraw 일 때만) [판독].
 */
import * as THREE from 'three';
import type { Assets } from '../../../view/assets';
import type { Mg1801State } from '../state';
import { type CharaInfo, CharacterActor, CharacterTemplate } from './character';

const NPC_KEY = 'npc002';
const NPC_COUNT = 2;
/** MapImpl joy_mot 표와 Params.RhythmNpcMotNo 기본값 */
const JOY_MOT = ['co_joyful02', 'co_joyful00'];
const RHYTHM_NPC_MOT_NO = 0;

export class NpcView {
  readonly actors: CharacterActor[] = [];
  private tpl: CharacterTemplate | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  async load(assets: Assets): Promise<void> {
    const index = await assets.json<Record<string, CharaInfo>>('chara/index.json');
    const info = index[NPC_KEY];
    if (!info) return;
    const [tpl, stool] = await Promise.all([CharacterTemplate.load(assets, NPC_KEY, info), assets.gltf('model/mg1801_stool_npc00.glb')]);
    this.tpl = tpl;
    stool.scene.updateMatrixWorld(true);
    for (let i = 0; i < NPC_COUNT; i++) {
      const node = stool.scene.getObjectByName(`attach_npc${String(i).padStart(2, '0')}`);
      if (!node) continue;
      const a = new CharacterActor(tpl);
      a.headLook = false;
      a.eyesLook = false;
      node.getWorldPosition(a.root.position);
      node.getWorldQuaternion(a.root.quaternion);
      this.scene.add(a.root);
      this.actors.push(a);
    }
  }

  dispose(): void {
    for (const a of this.actors) a.dispose();
    this.actors.length = 0;
    this.tpl?.dispose();
    this.tpl = null;
  }

  /** 원본 모션 이름(별칭 co_joyful00 포함) → glb 클립 이름 */
  private clip(a: CharacterActor, motion: string): string {
    if (motion === 'co_joyful00') return JOY_MOT[RHYTHM_NPC_MOT_NO];
    return a.hasMotion(motion) ? motion : 'co_idle00';
  }

  update(state: Mg1801State): void {
    const ending = state.phase === 'ending' || state.phase === 'result';
    const npc = state.npc;
    for (const a of this.actors) {
      a.root.visible = !ending && (npc ? npc.visible : true);
      if (!a.root.visible) continue;
      if (npc) {
        a.pose(this.clip(a, npc.motion), npc.frame, { now: state.frame });
        continue;
      }
      /* state.npc 없음: Initialize 의 co_idle00, 속도 = FrameMax / (2박 초·60) */
      const frames = a.tpl.motions.co_idle00?.frames ?? 1;
      const speed = frames / (((60 / state.bpm) * 2) * 60);
      a.pose('co_idle00', (state.frame * speed) % frames, { now: state.frame });
    }
  }
}
