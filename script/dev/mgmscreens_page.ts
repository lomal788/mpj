/**
 * 페이지 ↔ 미니게임 항구 단독 화면(승패 표·잠금 안내·플레이 방법) 연결 — mgmcommon_page.ts 와 같은 어댑터·60Hz 고정 스텝 루프.
 * 시험값(URL): ?rounds=N 승패 기록 판 수(기본 12, 0 = 기록 없음), ?first=0 플레이 방법 다시 보기(B 로 끝낼 수 있음), ?howto=1~6 종류.
 */
import { menuCanvas } from '../view/menuRenderer';
import { ASSETS } from '../env';
import { shellSound } from '../view/sound';
import { NPAD, STICK_MAX, type PadInput } from '@game/core/pad';
import { FiberRunner, MgmInput, MgmSound, MgmView, PAD, type Flow, type MgmPlayer, type MgResultEntry } from '@app/common/ui';
import { AnnounceScreen } from '@app/scene/mode/freeplay/announceScreen';
import { HistoryScreen } from '@app/scene/mode/freeplay/historyScreen';
import { historyFromRing, writeRing } from '@app/scene/mode/freeplay/historyView';
import { MgmetHowtoView } from '@app/scene/world/mgmet/howto';
import type { PadSource } from '../view/input';

const STICK_ON = 0.5 * STICK_MAX;
const DT = Math.fround(1 / 60);
const FACES = ['pc01', 'pc02', 'pc03', 'pc04'];

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
  if (p.buttons & NPAD.X) b |= 0x4;
  if (p.buttons & NPAD.Y) b |= 0x8;
  if (p.buttons & NPAD.LEFT) b |= 0x100;
  if (p.buttons & NPAD.RIGHT) b |= 0x200;
  if (p.buttons & NPAD.DOWN) b |= 0x400;
  if (p.buttons & NPAD.UP) b |= 0x800;
  if (p.lx < -STICK_ON) b |= 0x10000;
  if (p.ly > STICK_ON) b |= 0x20000;
  if (p.lx > STICK_ON) b |= 0x40000;
  if (p.ly < -STICK_ON) b |= 0x80000;
  return b;
}

export type MgmScreenKind = 'history' | 'announce' | 'howto';

export interface MgmScreenRun {
  readonly phase: string;
  stop(): void;
  press(bits: number): void;
  debug(): string;
}

/** 시험 기록: 판마다 승자 한 명(판 번호로 돌아감), 무승부 하나 섞음 */
function sampleRing(rounds: number): { ring: (MgResultEntry | null)[]; round: number } {
  const ring: (MgResultEntry | null)[] = new Array(100).fill(null);
  for (let r = 1; r <= rounds; r++) {
    const w = (r * 7) % 5;
    const results: [number, number, number, number] = [0, 0, 0, 0];
    if (w < 4) results[w] = 1;
    else results.fill(2);
    writeRing(ring, r, { id: (r * 13) % 112, judge: 1, results });
  }
  return { ring, round: rounds };
}

export async function runMgmScreen(
  kind: MgmScreenKind,
  stage: HTMLElement,
  cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; onDone(result: string): void },
): Promise<MgmScreenRun> {
  const q = new URLSearchParams(location.search);
  const canvas = await menuCanvas();
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const snd = shellSound({ muted: cfg.muted, pan2d: false, scene: 'mgmscreens', pads: (pid) => cfg.pads[pid] });

  const bgParam = q.get('bg');
  const bgUrl = bgParam === 'none' ? null : (bgParam ?? `${ASSETS}modeselect/backdrop_temp.png`);
  let backdrop: HTMLImageElement | undefined;
  if (bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    try {
      await img.decode();
      backdrop = img;
    } catch {
      console.warn(`mgmscreens: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }
  const parts = kind === 'howto' ? ['mgmet.json', '../mgmet/extra.json'] : ['mgm01.json', '../mgm01/faces.json', '../mgm01/thumbs.json'];
  const view = await MgmView.create({ canvas, assets: { url: (p) => `${ASSETS}mgmcommon/${p}` }, parts, backdrop });
  const sounds = { ...view.spec.sounds };
  const mgName = new Map<number, string>();
  try {
    const cat = (await (await fetch(`${ASSETS}mgm01/catalog.json`)).json()) as { sounds?: Record<string, { file: string; gain: number }>; mgList?: { id: number; name: string }[] };
    for (const [k, v] of Object.entries(cat.sounds ?? {})) sounds[k] = { ...v, file: `../${v.file}` };
    for (const m of cat.mgList ?? []) mgName.set(m.id, m.name);
  } catch {
    console.warn('mgmscreens: mgm01 소리 표를 읽지 못했다');
  }
  const players: MgmPlayer[] = [0, 1, 2, 3].map((pid) => ({ pid, type: cfg.com[pid] ? 1 : 0 }));
  if (players.every((p) => p.type === 1)) players[0].type = 0;
  const prev = new Map<number, number>();
  let extra = 0;
  const input: MgmInput = new MgmInput(
    {
      poll(pid: number): { hold: number; trig: number } {
        let hold = toBex(cfg.pads[pid]?.read() ?? null);
        if (pid === input.operator || (input.operator < 0 && pid === 0)) {
          hold |= extra;
          extra = 0;
        }
        const t = hold & ~(prev.get(pid) ?? 0);
        prev.set(pid, hold);
        return { hold, trig: t };
      },
    },
    () => players,
  );
  const sound = new MgmSound(sounds, view.url, snd.mgm());

  let phase = '시작';
  let result = '';
  let done = false;
  const fibers = new FiberRunner();
  let tick = (): void => {};
  let draw = (): void => {};
  let dbg = (): string => '';

  if (kind === 'history') {
    const rounds = Math.max(0, Math.min(250, Number(q.get('rounds') ?? 12) || 0));
    const { ring, round } = sampleRing(rounds);
    const scr = new HistoryScreen(view, input, sound, historyFromRing(ring, round), FACES, (id) => (view.spec.textures[`${mgName.get(id)}^o`] ? `${mgName.get(id)}^o` : null));
    tick = () => scr.update();
    draw = () => scr.draw();
    dbg = () => {
      const s = scr.state;
      return `판 ${s.src.count}  스크롤 ${s.scroll}/${s.maxScroll}  스크롤바 ${s.scrollbar.visible ? s.scrollbar.pos.toFixed(2) : '숨김'}\n승리 수 ${s.scores().join(' / ')}`;
    };
    fibers.start(
      (function* (): Flow {
        phase = '승패 표(좌우 스크롤, B 닫기)';
        yield* scr.run();
        result = `닫음 (승리 수 ${scr.state.scores().join(' / ')})`;
      })(),
      () => finish(),
    );
  } else if (kind === 'announce') {
    const scr = new AnnounceScreen(view);
    let reason = 0;
    tick = () => scr.update(DT);
    draw = () => scr.draw();
    dbg = () => `안내 ${scr.state.phase}  reason ${scr.state.reason}  skip ${scr.state.skip ? 1 : 0}`;
    fibers.start(
      (function* (): Flow {
        phase = 'A = 다음 안내(1→2→3), B = 끝';
        for (;;) {
          yield;
          const t = input.trig();
          scr.input(t);
          if (t === PAD.B && !scr.active) break;
          if (t === PAD.A && !scr.active) {
            reason = (reason % 3) + 1;
            sound.playSe('SQ_SE_SYS_ERROR');
            scr.play(reason);
          }
        }
        result = `끝 (마지막 reason ${reason})`;
      })(),
      () => finish(),
    );
  } else {
    const first = q.get('first') !== '0';
    const kindNo = Math.max(1, Math.min(6, Number(q.get('howto') ?? 1) || 1));
    const howto = new MgmetHowtoView(view, input, sound);
    tick = () => howto.tick();
    draw = () => howto.draw();
    dbg = () => `종류 ${kindNo}  첫 설명 ${first ? 1 : 0}  페이지 ${howto.page}`;
    fibers.start(
      (function* (): Flow {
        phase = first ? '첫 설명(A 로 넘김, B 무시)' : '다시 보기(페이지 0 에서 B = 끝)';
        howto.setup(kindNo, first);
        const r = yield* howto.update();
        howto.destroy();
        result = `반환 ${r} (${r & 1 ? '마지막 페이지 A' : 'B 로 끝'})`;
      })(),
      () => finish(),
    );
  }

  const step = (): void => {
    input.update();
    fibers.step();
    tick();
  };
  const render = (): void => {
    view.begin();
    draw();
    view.end();
  };
  render();

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      step();
      acc -= 1000 / 60;
      n++;
    }
    if (!done) {
      render();
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
  let stopped = false;
  function finish(): void {
    done = true;
    run.stop();
    cfg.onDone(result);
  }
  const run: MgmScreenRun = {
    get phase() {
      return phase;
    },
    press(bits) {
      extra |= bits;
    },
    debug() {
      return `phase ${phase}  조작 ${input.operator + 1}P\n${dbg()}`;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      done = true;
      view.dispose();
      snd.close(300);
    },
  };
  return run;
}
