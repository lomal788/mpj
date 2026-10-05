import { Mg1801Game } from '../../script/games/mg1801/logic/game';
const g = new Mg1801Game({ players: [0, 1, 2, 3].map(() => ({ char: 'pc01', isCom: true, comLevel: 0 })), seed: 7, practice: false } as any);
const out: string[] = [];
for (let f = 0; f < 7200 && !g.done; f++) {
  g.step([null, null, null, null]);
  const lanes = (g.events as any[]).filter((e) => e.k === 'effect' && e.name.startsWith('ca::rm')).map((e) => Math.round((e.pos.x + 3) / 2));
  if (lanes.length) out.push(`${g.state.frame}:${lanes.join('')}`);
}
console.log(out.join(' '));
