/**
 * 플레이어 — 원본 mg1801::Player + Player::PadDriver [판독: Player::Player @0x710000b130, MyUpdate @0x710000c9c0,
 * UpdateAttack @0x710000cd10, UpdateHeadControl @0x710000d130, PadDriver::UpdateCpu @0x710000d2b8, Finish @0x710000d580].
 *
 * 웹 대체 입력(docs/minigame/mg1801.md 9.5): 원본은 Joy-Con 가속도 크기 > Params.acc 로만 휘두른다(버튼 경로 없음).
 * 웹은 같은 자리에서 "A 버튼을 이번 프레임에 누름"도 휘두름으로 본다. 가속도 값이 들어오면 원본 식을 그대로 쓴다.
 * 쿨다운·판정·CPU 는 원본 그대로다.
 */
import { F, type V3, v3 } from '../../../core/fmath';
import { NPAD, type Pads } from '../../../core/pad';
import type { PlayerView } from '../state';
import { IDLE_MOTION_FRAMES, LOOK_EXCEPTIONS, PLAYER_CHARACTER_IDS, STOOLS, SWING_MOTION_FRAMES, SWING_SE_FRAME } from './data';
import type { JudgeData } from './objectMan';
import { FAST, JUST, NONE, SLOW } from './obj';
import type { World } from './world';

const MOTION_IDLE = 0;
const MOTION_SWING = 1;

export class Player {
  /** +0x0A0 */
  inputEnabled = false;
  /** +0x0A8 지금 모션(0 idle, 1 swing) */
  motion = MOTION_IDLE;
  /** +0x0AC 모션 요청(−1 없음) */
  motionReq = -1;
  /** 모션 재생 프레임(원본 프레임 단위, f32 누적) */
  motionFrame = 0;
  /** +0x0B0 위치 */
  readonly pos: V3;
  /** 의자 번호(STOOLS 인덱스, −1 = 없음) */
  readonly stool: number;
  /** PadDriver+0x18 이번 프레임 휘두름 */
  swing = false;
  /** PadDriver+0x1C 쿨다운(초) */
  cooldown = 0;
  /** PadDriver+0x20 CPU 계획 */
  cpuPlan: number[] = [];
  /** PadDriver+0x38 */
  cpuNoteIndex = 0;
  /** PadDriver+0x3C */
  cpuInWindow = 0;
  /** ComHeading 목표(null = SetTargetNone). 생성자에서 SetTargetNone */
  headTarget: V3 | null = null;
  /** ComHeading SetHeadLookEnabled / SetEyesLookEnabled */
  readonly look: { head: boolean; eyes: boolean };
  /** 결과 연출 모션(원본 RmMgSceneBase 결과 객체가 Play). null = 칼 모션 */
  resultMotion: { name: string; next: string | null; speed: number; frame: number } | null = null;

  constructor(
    /** +0x0A4 레인(GetPlayerOrder) */
    readonly lane: number,
    /** PadDriver+0x08 PlayerID. 회색 박스는 레인과 같게 둔다 */
    readonly playerId: number,
    readonly isCom: boolean,
    /** 캐릭터 ID(pcNN) */
    readonly char: string,
    private readonly w: World,
  ) {
    this.pos = v3(lane * 2.0 - 3.0, 0, -2.0);
    const id = PLAYER_CHARACTER_IDS.indexOf(char as (typeof PLAYER_CHARACTER_IDS)[number]);
    const stool = id >= 0 ? STOOLS.findIndex((s) => ((s.mask >>> id) & 1) !== 0) : -1;
    this.stool = stool;
    if (stool >= 0) this.pos.y = STOOLS[stool].y;
    this.look = { ...(LOOK_EXCEPTIONS[char] ?? { head: true, eyes: true }) };
  }

  /** 원본 Player::MyUpdate */
  myUpdate(pads: Pads): void {
    const w = this.w;
    if (this.inputEnabled) {
      if (this.cooldown > 0) this.cooldown = F(this.cooldown - w.dt);
      this.swing = false;
      if (!this.isCom) {
        if (this.cooldown <= 0 && this.humanSwing(pads)) {
          this.swing = true;
          this.cooldown = w.rhythm.beatToSec(1, 1);
        }
      } else {
        this.updateCpu();
      }
      this.updateAttack();
      this.updateHeadControl();
    }
    let req = this.motionReq;
    if (req === -1 && this.motion === MOTION_SWING && this.motionFrame >= SWING_MOTION_FRAMES) {
      req = MOTION_IDLE;
    }
    if (req !== -1) {
      this.motion = req;
      this.motionFrame = 0;
    } else {
      const before = this.motionFrame;
      let f = F(this.motionFrame + F(F(w.dt * 60) * F(w.rhythm.bpm / 120)));
      if (this.motion === MOTION_IDLE && f >= IDLE_MOTION_FRAMES) f = F(f - IDLE_MOTION_FRAMES);
      if (this.motion === MOTION_SWING && f > SWING_MOTION_FRAMES) f = SWING_MOTION_FRAMES;
      this.motionFrame = f;
      if (this.motion === MOTION_SWING && before < SWING_SE_FRAME && f >= SWING_SE_FRAME) w.se3d('SQ_SE_MG1801_SWING', this.pos);
    }
    this.motionReq = -1;
  }

  /** 원본: |acc| > Params.acc. 웹 대체: A 버튼 누름 */
  private humanSwing(pads: Pads): boolean {
    const p = pads.now[this.playerId];
    const mag = Math.sqrt(p.accX * p.accX + p.accY * p.accY + p.accZ * p.accZ);
    if (mag > this.w.params.acc) return true;
    return (pads.down[this.playerId] & NPAD.A) !== 0;
  }

  /** 원본 Player::PadDriver::UpdateCpu */
  private updateCpu(): void {
    const w = this.w;
    const j = w.objectMan.judgeInput(this.lane);
    if (this.cpuInWindow === 0 && j.type === FAST) this.cpuInWindow = 1;
    else if (this.cpuInWindow !== 0 && j.type === NONE) {
      this.cpuInWindow = 0;
      this.cpuNoteIndex++;
    }
    if (this.cooldown <= 0) {
      const plan = w.params.cpuMiss ? (this.cpuPlan[this.cpuNoteIndex] ?? JUST) : JUST;
      if (plan === j.type && (j.type !== JUST || j.diff < 2)) {
        this.swing = true;
        this.cooldown = w.rhythm.beatToSec(1, 1);
      }
    }
  }

  /** 원본 Player::UpdateAttack */
  private updateAttack(): void {
    if (!this.swing) return;
    const w = this.w;
    this.motionReq = MOTION_SWING;
    const j: JudgeData = w.objectMan.judgeInput(this.lane);
    if (j.type === NONE) return;
    const telop = j.type === FAST ? 'FAST' : j.type === SLOW ? 'SLOW' : 'JUST';
    if (j.type === JUST) {
      if (!this.isCom) w.events.push({ k: 'fxTrigger', player: this.playerId, name: 'VB_MG1801_JUST' });
      w.playExcellentSe();
    } else {
      w.events.push({ k: 'fxTrigger', player: this.playerId, name: 'VB_MG1801_SUCCESS' });
    }
    const at = { x: this.pos.x, y: F(1.5), z: 0 };
    w.effect(j.type === JUST ? 'ca::rm::util::ShowCommonEffect#0' : 'ca::rm::util::ShowCommonEffect#1', at);
    w.events.push({ k: 'telop', player: this.playerId, judge: telop, pos: at });
    w.addScore(this.playerId, j.type === JUST ? 2 : 1);
    w.objectMan.sendHitJudge(this.lane, j);
  }

  /**
   * 원본 Player::UpdateHeadControl [판독 @0x710000d130 디스어셈블리]: MyUpdate 의 입력 켜짐 구간에서 UpdateAttack 다음에 돈다.
   * GetHeadTarget(레인)이 있으면 그 위치의 x 만 플레이어 엔티티 x 로 바꿔(@0x710000d26c str s0,[sp]) SetTargetLookAtPosition,
   * 없으면 SetTargetNone.
   */
  private updateHeadControl(): void {
    const t = this.w.objectMan.getHeadTarget(this.lane);
    this.headTarget = t ? { x: this.pos.x, y: t.y, z: t.z } : null;
  }

  /** 원본 Player::Finish — 입력 끄기, 머리 SetTargetNone */
  finish(): void {
    this.inputEnabled = false;
    this.headTarget = null;
  }

  view(): PlayerView {
    return {
      lane: this.lane,
      isCom: this.isCom,
      char: this.char,
      stool: this.stool,
      pos: { ...this.pos },
      motion: this.motion === MOTION_SWING ? 'swing' : 'idle',
      motionFrame: this.motionFrame,
      cooldown: this.cooldown,
      inputEnabled: this.inputEnabled,
      head: { target: this.headTarget ? { ...this.headTarget } : null, weight: this.w.params.headLookWeight },
      look: { ...this.look },
      resultMotion: this.resultMotion ? { ...this.resultMotion } : null,
    };
  }
}
