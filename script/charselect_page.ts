/**
 * 페이지 ↔ 캐릭터 선택 독립 모듈(shell/charselect) 연결 — 어댑터(입력·소리·에셋 경로)와 60Hz 고정 스텝 루프.
 * 모듈 자체는 엔진층을 모르고, 이 파일이 페이지의 입력(view/input PadSource)을 원본 bex 입력 비트로 바꿔 넘긴다.
 *   bex 비트 [판독: docs/shell/charselect.md 4절]: A 0x1, B 0x2, 십자 왼 0x100·오 0x200·아래 0x400·위 0x800, 스틱 왼 0x10000·위 0x20000·오 0x40000·아래 0x80000
 */
import { ASSETS } from './env';
import { NPAD, STICK_MAX, type PadInput } from '@game/core/pad';
import { createCharSelect, type CharSelectHandle } from './shell/charselect';
import { appFlow } from './view/appFlow';
import { sceneOut } from './view/appTransition';
import { appBgm } from './view/bgm';
import { shellSound } from './view/sound';
import type { PadSource } from './view/input';

const STICK_ON = 0.5 * STICK_MAX;

function toBex(p: PadInput | null): number {
  if (!p) return 0;
  let b = 0;
  if (p.buttons & NPAD.A) b |= 0x1;
  if (p.buttons & NPAD.B) b |= 0x2;
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

export interface CharSelectRun {
  handle: CharSelectHandle;
  stop(): void;
  /** 시험용: 다음 입력 읽기에 bits 를 한 번 더한다(칸 player) */
  press(player: number, bits: number): void;
}

/** stage 안에 캔버스를 만들어 캐릭터 선택을 돌린다. 끝나면 onDone(pcNN 목록 | null = 취소) */
export async function runCharSelect(stage: HTMLElement, cfg: { com: boolean[]; pads: (PadSource | null)[]; muted: boolean; names?: string[]; bgm?: boolean; onDone(chars: string[] | null): void }): Promise<CharSelectRun> {
  const flow = appFlow();
  flow.enter('charselect');
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const prev = cfg.com.map(() => 0);
  const extra = cfg.com.map(() => 0);
  // 입력 전에 만든 AudioContext 는 suspended 로 남을 수 있다 → 재생마다·사용자 입력마다 resume(docs 12.10)
  const snd = shellSound({ muted: cfg.muted, pan2d: true, scene: cfg.bgm === false ? 'menu00' : 'menu01', pads: (pid) => cfg.pads[pid] });
  const wake = (): void => snd.wake();
  const wakeEvents = ['keydown', 'pointerdown', 'touchstart'] as const;
  for (const t of wakeEvents) window.addEventListener(t, wake, { capture: true });
  // 보이스(카드 슬롯마다 하나, 취소·Out 때 정지)와 배경음악(루프 구간, 결정 때 페이드 정지)
  // 슬롯 요청 번호: 정지·새 요청 뒤 늦게 끝난 디코드는 재생하지 않는다(docs 12.10)
  // BGM = 앱 채널(같은 라벨이면 이어 재생, docs/engine/04_sound.md §12.14). 인원 설정 안(cfg.bgm === false)은 타이틀 곡을 건드리지 않음
  const playBgm = (label: string): void => {
    if (cfg.bgm !== false) void appBgm().play(label, cfg.muted);
  };
  const stopBgm = (fade: number): void => {
    if (cfg.bgm !== false) appBgm().stop(fade);
  };
  // Play2D 위치 → 좌우 팬: 원본 팬 곡선 [미확정] → 화면 x 선형 [근사]
  let done = false;
  const handle = await createCharSelect({
    canvas,
    assets: { url: (p) => `${ASSETS}charselect/${p}` },
    players: cfg.com.map((com, i) => ({ type: com ? 'com' : 'human', name: cfg.names?.[i] })),
    input: {
      poll(i) {
        const hold = toBex(cfg.pads[i]?.read() ?? null) | extra[i];
        extra[i] = 0;
        const trig = hold & ~prev[i];
        prev[i] = hold;
        return { hold, trig };
      },
    },
    sound: {
      play: (label, url, gain, x) => void snd.play(label, url, gain, x),
      voice: (label, url, gain, slot) => snd.voice(label, url, gain, slot),
      voiceStop: (slot) => snd.voiceStop(slot),
      vibrate: (player, name) => snd.vibrate(cfg.pads[player], name),
      bgm: playBgm,
      bgmStop: stopBgm,
      preload: (urls) => snd.preload(urls),
    },
    onDecided(result) {
      chosen = result.map((c) => handle.spec.chars[c]?.pc ?? 'pc01');
      const humanChars = chosen.filter((_, i) => !cfg.com[i]);
      flow.state('charselect', 'decided', humanChars);
      if (humanChars[0]) flow.hint('chara1P', humanChars[0]);
    },
    onFinished(decided) {
      done = true;
      void sceneOut().then(() => {
        run.stop();
        cfg.onDone(decided ? chosen : null);
      });
    },
  });
  let chosen: string[] = [];
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  const loop = (now: number): void => {
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4 && !done) {
      handle.step();
      acc -= 1000 / 60;
      n++;
    }
    if (!done) {
      handle.render();
      raf = requestAnimationFrame(loop);
    }
  };
  raf = requestAnimationFrame(loop);
  const run: CharSelectRun = {
    handle,
    press(player, bits) {
      extra[player] |= bits;
    },
    stop() {
      cancelAnimationFrame(raf);
      done = true;
      for (const t of wakeEvents) window.removeEventListener(t, wake, { capture: true });
      handle.dispose();
      canvas.remove();
      // 결정 때 BGM 페이드(0.5 s)가 끝난 뒤 닫는다
      snd.close(600);
    },
  };
  return run;
}
