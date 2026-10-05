/**
 * 플레이어 4명 — 원본 mg1801::PlayerManImpl [판독: Initialize @0x7100009fc0, SetupCpuMiss @0x710000a110,
 * Update @0x710000a9f0, ReceiveState @0x710000aa48].
 */
import { F } from '../../../core/fmath';
import type { Pads } from '../../../core/pad';
import { FAST, JUST, SLOW } from './obj';
import { Player } from './player';
import type { World } from './world';

export class PlayerMan {
  readonly players: Player[];

  constructor(private readonly w: World) {
    this.players = [0, 1, 2, 3].map((lane) => new Player(lane, lane, w.isCom[lane] ?? true, w.chars[lane] ?? 'pc01', w));
  }

  /** 원본 SetupCpuMiss(n) — 플레이어마다 floor(n·0.25) 자리를 P1·P3 FAST, P2·P4 SLOW 로(비동기 난수) */
  setupCpuMiss(n: number): void {
    const miss = Math.trunc(F(n * 0.25));
    const kinds = [FAST, SLOW, FAST, SLOW];
    this.players.forEach((p, i) => {
      const plan = new Array<number>(n).fill(JUST);
      const idx: number[] = [];
      for (let k = 0; k < n; k++) idx.push(k);
      for (let j = idx.length; j > 1; j--) {
        const r = this.w.rng.randMod(j);
        const t = idx[j - 1];
        idx[j - 1] = idx[r];
        idx[r] = t;
      }
      for (let k = 0; k < miss; k++) plan[idx[k]] = kinds[i];
      p.cpuPlan = plan;
    });
  }

  /** 원본 ReceiveState(channel 0, value) */
  receiveState(value: number): void {
    if (value === 1) for (const p of this.players) p.inputEnabled = true;
    else if (value === 5) for (const p of this.players) p.finish();
  }

  /** 원본 Update 파이버 한 프레임: Player 0~3 순서 */
  update(pads: Pads): void {
    for (const p of this.players) p.myUpdate(pads);
  }
}
