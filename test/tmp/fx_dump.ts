import { Mg1801Game } from '../../script/games/mg1801/logic/game';
const g = new Mg1801Game({ players: [0, 1, 2, 3].map(() => ({ char: 'pc01', isCom: true, comLevel: 0 })), seed: 7, practice: false } as any);
const byName: Record<string, number[]> = {};
let shown = 0;
for (let f = 0; f < 7200 && !g.done; f++) {
  g.step([null, null, null, null]);
  for (const e of g.events as any[]) {
    if (e.k === 'effect') {
      const lane = Math.round((e.pos.x + 3) / 2);
      (byName[e.name] ??= [0, 0, 0, 0, 0, 0, 0, 0])[Math.max(0, Math.min(7, lane))]++;
      if (shown++ < 6) console.log(g.state.frame, e.name, JSON.stringify(e.pos));
    }
  }
}
console.log(byName);
