import { Mg1801Game } from '../../script/games/mg1801/logic/game';
for (const mode of [0, 2]) {
  const g = new Mg1801Game({ players: [0, 1, 2, 3].map(() => ({ char: 'pc01', isCom: true, comLevel: 0 })), seed: 7, practice: false } as any, { mode } as any);
  const labels: string[] = [];
  let perfect = 0, outline = 0;
  for (let f = 0; f < 7200 && !g.done; f++) {
    g.step([null, null, null, null]);
    for (const e of g.events as any[]) {
      if (['bgm', 'soundStop', 'seLocal', 'soundPreset'].includes(e.k)) labels.push(`${g.state.frame}:${e.k}:${e.label ?? e.name}`);
      if (e.k === 'perfect') perfect++;
    }
    if (g.state.objs.some((o: any) => o.outline)) outline++;
  }
  console.log('mode', mode, 'done', g.done, 'frames', g.state.frame, 'perfect', perfect, 'outlineFrames', outline);
  console.log(labels.join('\n'));
}
