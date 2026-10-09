/**
 * 리듬 장면(RmMgSceneBase) → 미니게임 공용 틀(app/minigame/frame/scene MgGame) 어댑터. import 0(같은 폴더만) — 틀 문맥은 구조 형식 RmHost 로만 받는다.
 * 단계 대응·프레임 순서·흰 페이드·끝 처리: docs/shell/minigame_scene.md §12.12.2, docs/engine/02_rhythm.md §14.6.
 * update = 패드 → 사건 비우기·사운드 관측·frame++·흐름 갱신 → 파이버들, 흐름 처리기 = 리듬 흐름 슬롯, onGameSequenceAfter = updateAnimation.
 * 결과 연출이 끝난(done) 프레임부터는 처리기·애니를 돌리지 않고 사건만 비운다. 리믹스 연속의 RequestReturnScene 은 host.requestReturnScene.
 */
import type { RmMgSceneBase } from './scene';
import type { RmPadInput, RmSoundSnapshot } from './types';

export interface RmHostPad {
  now: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  accX: number;
  accY: number;
  accZ: number;
}

export interface RmHost {
  pad(pid: number): RmHostPad;
  setStartTelop(type: number): void;
  setFinishTelop(type: number): void;
  requestReturnScene(): void;
}

export class RmMgGame<S extends RmMgSceneBase, H extends RmHost = RmHost> {
  scene: S | null = null;
  sound: RmSoundSnapshot | null = null;
  private host: H | null = null;
  private stopped = false;
  private readonly input: RmPadInput[] = [0, 1, 2, 3].map(() => ({ buttons: 0, lx: 0, ly: 0, rx: 0, ry: 0, accX: 0, accY: 0, accZ: 0 }));

  constructor(private readonly create: (host: H) => S) {}

  setup(host: H): void {
    this.host = host;
    this.stopped = false;
    host.setStartTelop(-1);
    host.setFinishTelop(-1);
    this.scene = this.create(host);
  }

  get done(): boolean {
    return !!this.scene?.done;
  }

  update(): void {
    const s = this.scene!;
    if (s.done) {
      this.stopped = true;
      s.clearEvents();
      return;
    }
    const h = this.host!;
    for (let pid = 0; pid < 4; pid++) {
      const p = h.pad(pid);
      const d = this.input[pid];
      d.buttons = p.now;
      d.lx = p.lx;
      d.ly = p.ly;
      d.rx = p.rx;
      d.ry = p.ry;
      d.accX = p.accX;
      d.accY = p.accY;
      d.accZ = p.accZ;
    }
    s.readInput(this.input);
    s.beginFrame(this.sound);
    s.update();
    this.stopped = s.done;
  }

  onSetGameSequence(stage: number): void {
    this.scene?.onSetGameSequence(stage);
  }

  onGameSequenceAfter(): void {
    if (!this.stopped) this.scene!.updateAnimation();
  }

  onGameStartAfter(): boolean {
    return !this.stopped && this.scene!.onGameStartAfter();
  }

  onGameMain(): boolean {
    return !this.stopped && this.scene!.onGameMain();
  }

  onGameEnd(): boolean {
    if (this.stopped) return false;
    const s = this.scene!;
    const r = s.onGameEnd();
    if (s.done) this.host!.requestReturnScene();
    return r;
  }

  onGameFinish(): boolean {
    return !this.stopped && this.scene!.onGameFinish();
  }

  onGameEndingBefore(): boolean {
    return !this.stopped && this.scene!.onGameEndingBefore();
  }

  onGameEnding(): boolean {
    if (this.stopped) return true;
    this.scene!.onGameEnding();
    return this.scene!.done;
  }
}
