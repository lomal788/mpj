import { createControllerStandby, type ControllerStandbyScreen } from '@app/scene/system/controllerstandby';
import { menuCanvas } from '../view/menuRenderer';
import { ASSETS } from '../env';

export interface ControllerStandbyRun {
  readonly screen: ControllerStandbyScreen;
  stop(): void;
  debug(): string;
}

export async function runControllerStandbyPage(stage: HTMLElement, cfg: {
  com: boolean[]; onDone(result: string): void;
}): Promise<ControllerStandbyRun> {
  const query = new URLSearchParams(location.search);
  const ready = query.get('ready') ?? '1111';
  const characters = (query.get('chars') ?? 'pc05,pc07,pc50,pc04').split(',');
  const canvas = await menuCanvas();
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const screen = await createControllerStandby({ canvas,
    assets: { url: path => `${ASSETS}mgmcommon/${path}` },
    players: Array.from({ length: 4 }, (_, pid) => ({ pid, character: characters[pid] ?? 'pc01',
      cpu: cfg.com[pid] ?? false, ready: ready[pid] === '1' })),
  });
  const controls = document.createElement('div');
  controls.style.cssText = 'position:absolute;right:12px;bottom:12px;display:flex;gap:8px;z-index:2';
  for (const player of screen.players) if (!player.cpu) {
    const button = document.createElement('button');
    button.textContent = `${player.pid + 1}P OK 전환`;
    button.onclick = () => screen.setReady(player.pid, !screen.isReady(player.pid));
    controls.append(button);
  }
  const closeButton = document.createElement('button');
  closeButton.textContent = '닫기';
  closeButton.onclick = () => screen.close();
  controls.append(closeButton);
  stage.append(controls);
  let stopped = false;
  let raf = 0;
  let last: number | null = null;
  let accumulator = 0;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    controls.remove();
    screen.dispose();
  };
  const loop = (now: number): void => {
    if (stopped) return;
    if (last !== null) accumulator = Math.min(accumulator + (now - last) / 1000, 0.25);
    last = now;
    while (accumulator >= 1 / 60) {
      accumulator -= 1 / 60;
      screen.step();
    }
    if (screen.phase === 'closed') {
      stop();
      cfg.onDone('컨트롤러 설정 대기 화면 닫힘 (게임 연결 없음)');
      return;
    }
    screen.render();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return { screen, stop,
    debug: () => `controllerstandby · ${screen.phase}\n${screen.players.map(p => `${p.pid + 1}P ${p.cpu ? 'CPU (숨김)' : screen.isReady(p.pid) ? 'OK' : '대기'}`).join('\n')}\n표시 전용 · 버튼으로 상태 주입`,
  };
}
