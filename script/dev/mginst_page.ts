import { createMgInst, type MgInstScreen, type ReadyLayout } from '@app/scene/system/mginst';
import { NPAD } from '@game/core/pad';
import { menuCanvas } from '../view/menuRenderer';
import type { PadSource } from '../view/input';
import { ASSETS } from '../env';

export interface MgInstRun {
  readonly screen: MgInstScreen;
  press(pid: number): void;
  stop(): void;
  debug(): string;
}

export async function runMgInstPage(stage: HTMLElement, cfg: {
  com: boolean[]; pads: (PadSource | null)[]; onDone(result: string): void;
}): Promise<MgInstRun> {
  const query = new URLSearchParams(location.search);
  const layoutName = query.get('layout') ?? 'vs4';
  if (!['vs4', 'vs8', '1vs3', '2vs2', '1vs1'].includes(layoutName)) throw new Error('Invalid mginst layout');
  const layout = layoutName as ReadyLayout;
  const count = layout === 'vs8' ? 8 : layout === '1vs1' ? 2 : 4;
  const canvas = await menuCanvas();
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const previous = new Map<number, number>();
  const triggers = new Map<number, number>();
  const injected = new Set<number>();
  let completed = false;
  const screen = await createMgInst({
    canvas, assets: { url: path => `${ASSETS}mgmcommon/${path}` },
    game: query.get('game') ?? 'mg0905',
    rowIndex: query.has('row') ? Number(query.get('row')) : undefined,
    layout,
    players: Array.from({ length: count }, (_, pid) => ({ pid,
      character: ['pc01', 'pc02', 'pc03', 'pc04', 'pc05', 'pc06', 'pc07', 'pc08'][pid],
      cpu: cfg.com[pid] ?? true, local: true, advantage: pid === Number(query.get('advantage') ?? 0) })),
    inputGate: 'layoutIntroApprox',
    pads: { poll: pid => ({ hold: previous.get(pid) ?? 0, trig: triggers.get(pid) ?? 0 }) },
    onReady: () => { completed = true; },
  });
  let closed = false;
  let raf = 0;
  let last: number | null = null;
  let accumulator = 0;
  const stop = (): void => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    screen.dispose();
  };
  const loop = (now: number): void => {
    if (closed) return;
    if (last !== null) accumulator = Math.min(accumulator + (now - last) / 1000, 0.25);
    last = now;
    while (accumulator >= 1 / 60) {
      accumulator -= 1 / 60;
      triggers.clear();
      for (let pid = 0; pid < count; pid++) {
        const pad = cfg.pads[pid]?.read();
        const hold = (pad?.buttons ?? 0) & (NPAD.PLUS | NPAD.MINUS);
        const down = hold & ~(previous.get(pid) ?? 0);
        triggers.set(pid, ((down & NPAD.PLUS) ? 0x2000 : 0) | ((down & NPAD.MINUS) ? 0x1000 : 0) | (injected.has(pid) ? 0x3000 : 0));
        previous.set(pid, hold);
      }
      injected.clear();
      screen.step();
    }
    screen.render();
    if (completed) { stop(); cfg.onDone('게임 설명 화면: 준비 완료 (미니게임 실행 연결 없음)'); return; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { screen, stop,
    press(pid) { if (!closed) injected.add(pid); },
    debug: () => `mginst ${screen.content.game} · ${screen.phase}\nEnter / Backspace = ± 준비\n${screen.state.players.map(p => `${p.pid + 1}P ${p.cpu ? 'CPU' : '사람'} ${screen.state.ready.has(p.pid) ? 'OK' : ''}`).join('\n')}\n미리보기 미연결 · 조작 안내 정적 Approx`,
  };
}
