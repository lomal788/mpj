/**
 * 페이지 ↔ 플레이어 설정 흐름(shell/setplayer) 연결 — 컨트롤러(키보드 1 + Gamepad API 여러 개), 시스템 애플릿 대체 DOM,
 * WebAudio SE, 60 Hz 고정 스텝, 그리고 "플레이어 설정 → 캐릭터 선택(runCharSelect 그대로)" 이어 붙이기.
 * 근거: docs/shell/setplayer.md 9.3~9.5. 컨트롤러 지원 애플릿·유저 선택·소프트웨어 키보드는 원본이 시스템 UI 라 이 화면은 [설계].
 */
import { runCharSelect, type CharSelectRun } from './charselect_page';
import { NPAD, STICK_MAX, type PadInput } from './core/pad';
import { ASSETS } from './env';
import { createSetPlayer, mapMenuArg, PA_MODE_ARG, padTypeOfGamepad, type Controller, type ControllerInput, type SetPlayerHandle, type SetPlayerResult } from './shell/setplayer';
import { appFlow } from './view/appFlow';
import { GamepadPad, type KeyboardPad, type PadSource } from './view/input';

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

/** 키보드 'kb' + 연결된 게임패드 'gpN'. 프레임마다 begin() 으로 한 번 읽는다 */
class PageControllers implements ControllerInput {
  private cur = new Map<string, { hold: number; trig: number }>();
  private prev = new Map<string, number>();
  private extra = new Map<string, number>();
  private gps = new Map<number, GamepadPad>();
  private ctrls: Controller[] = [];

  constructor(readonly keyboard: KeyboardPad) {}

  source(id: string): PadSource | null {
    if (id === 'kb') return this.keyboard;
    const m = /^gp(\d+)$/.exec(id);
    if (!m) return null;
    const i = Number(m[1]);
    let g = this.gps.get(i);
    if (!g) this.gps.set(i, (g = new GamepadPad(i)));
    return g;
  }

  press(id: string, bits: number): void {
    this.extra.set(id, (this.extra.get(id) ?? 0) | bits);
  }

  begin(): void {
    const list: Controller[] = [{ id: 'kb', kind: 'keyboard', padType: 2 }];
    for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) list.push({ id: `gp${g.index}`, kind: 'gamepad', padType: padTypeOfGamepad(g.id) });
    this.ctrls = list;
    for (const c of list) {
      const hold = toBex(this.source(c.id)?.read() ?? null) | (this.extra.get(c.id) ?? 0);
      const trig = hold & ~(this.prev.get(c.id) ?? 0);
      this.prev.set(c.id, hold & ~(this.extra.get(c.id) ?? 0));
      this.cur.set(c.id, { hold, trig });
    }
    this.extra.clear();
  }

  list(): Controller[] {
    return this.ctrls;
  }

  poll(id: string): { hold: number; trig: number } {
    return this.cur.get(id) ?? { hold: 0, trig: 0 };
  }
}

export interface SetPlayerRun {
  handle: SetPlayerHandle;
  controllers: PageControllers;
  charSelect(): CharSelectRun | null;
  stop(): void;
  debug(): string;
  /** 시험용: 컨트롤러 id 에 bits 를 한 프레임 더한다 */
  press(id: string, bits: number): void;
}

const overlayStyle = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%,-50%)',
  minWidth: '420px',
  padding: '16px 20px',
  background: 'rgba(20,24,32,0.92)',
  color: '#fff',
  font: '16px/1.5 sans-serif',
  borderRadius: '12px',
  zIndex: '3',
} as const;

export async function runSetPlayer(
  stage: HTMLElement,
  cfg: { com: boolean[]; keyboard: KeyboardPad; muted: boolean; onResult?(r: SetPlayerResult, chars: string[] | null, pads: (PadSource | null)[]): void; onDone(result: string): void },
): Promise<SetPlayerRun> {
  const canvas = document.createElement('canvas');
  canvas.className = 'jw-gl';
  stage.append(canvas);
  const controllers = new PageControllers(cfg.keyboard);
  controllers.begin();

  let actx: AudioContext | null = null;
  if (!cfg.muted) {
    try {
      actx = new AudioContext();
      void actx.resume();
    } catch {
      actx = null;
    }
  }
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const playSe = (url: string, gain: number): void => {
    if (!actx) return;
    const c = actx;
    let b = buffers.get(url);
    if (!b) {
      b = fetch(url)
        .then((r) => r.arrayBuffer())
        .then((a) => c.decodeAudioData(a))
        .catch(() => null);
      buffers.set(url, b);
    }
    void b.then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = gain;
      src.connect(g).connect(c.destination);
      src.start();
    });
  };

  const q = new URLSearchParams(location.search);
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
      console.warn(`setplayer: 배경 이미지를 읽지 못했다 ${bgUrl}`);
    }
  }

  let charaNames: string[] = [];
  try {
    const cs = (await (await fetch(`${ASSETS}charselect/spec.json`)).json()) as { chars: { label: string }[]; texts: Record<string, string> };
    charaNames = cs.chars.map((c) => cs.texts[c.label] ?? '');
  } catch {
    console.warn('setplayer: 캐릭터 이름 표를 읽지 못했다');
  }

  const humans = Math.max(1, cfg.com.filter((c) => !c).length);
  const arg = q.get('sp') === 'pa' ? PA_MODE_ARG : mapMenuArg(humans);

  // 시스템 애플릿 대체 DOM [설계 9.4]
  const overlay = document.createElement('div');
  Object.assign(overlay.style, overlayStyle);
  overlay.hidden = true;
  stage.append(overlay);
  let appletCount = 0;
  const showApplet = (open: boolean, count: number): void => {
    appletCount = open ? count : 0;
    overlay.hidden = !open;
  };
  const drawApplet = (h: SetPlayerHandle): void => {
    if (!appletCount) return;
    const rows = Array.from({ length: appletCount }, (_, p) => {
      const id = h.pool.assign[p];
      const c = controllers.list().find((x) => x.id === id);
      return `<div>${p + 1}P : ${c ? (c.kind === 'keyboard' ? '키보드' : `게임패드 ${id!.slice(2)}`) : '— 비어 있음 —'}</div>`;
    }).join('');
    const html = `<b>컨트롤러 연결 (${appletCount}명)</b><div style="margin:8px 0">${rows}</div><small>참가: 그 컨트롤러로 A(키보드 J) · 빠지기: B · 1P A = 완료 · 1P B = 취소</small>`;
    if (overlay.innerHTML !== html) overlay.innerHTML = html;
  };
  const dialog = <T>(build: (box: HTMLElement, done: (v: T) => void) => void): Promise<T> =>
    new Promise<T>((res) => {
      const box = document.createElement('div');
      Object.assign(box.style, overlayStyle);
      stage.append(box);
      build(box, (v) => {
        box.remove();
        res(v);
      });
    });

  let charRun: CharSelectRun | null = null;
  let chosen: string[] | null = null;
  let finished = false;
  const summary = (r: SetPlayerResult): string =>
    r.cancelled
      ? '취소'
      : `${r.count}명  ` +
        r.slots
          .map((s, i) => `${s.pid + 1}P ${s.type === 'human' ? `사람(${s.controller ?? '-'}${s.linked ? ', 연동' : ''}) ${s.displayName}` : `COM ${s.displayName}`}${chosen ? ` ${chosen[i]}` : ''}`)
          .join('  ');

  const handle: SetPlayerHandle = await createSetPlayer({
    canvas,
    assets: { url: (p) => `${ASSETS}mgmcommon/${p}` },
    arg,
    input: controllers,
    backdrop,
    charaName: (c) => charaNames[c] || `pc${String(c + 1).padStart(2, '0')}`,
    sound: {
      play: (_l, url, gain) => playSe(url, gain),
      vibrate: (id) => controllers.source(id)?.rumble?.(60),
    },
    system: {
      selectAccount: (pid) =>
        dialog((box, done) => {
          box.innerHTML = `<b>${pid + 1}P 유저 연동 (웹 대체)</b><div style="margin:8px 0"><input class="sp-acc" maxlength="10" placeholder="계정 닉네임" /></div><button class="sp-ok">연동</button> <button class="sp-no">취소</button>`;
          const inp = box.querySelector<HTMLInputElement>('.sp-acc')!;
          box.querySelector('.sp-ok')!.addEventListener('click', () => done(inp.value ? { uid: `web-${pid}-${Date.now()}`, nickname: inp.value } : null));
          box.querySelector('.sp-no')!.addEventListener('click', () => done(null));
          inp.focus();
        }),
      editName: (_pid, current, maxLen) =>
        dialog((box, done) => {
          box.innerHTML = `<b>${handle.text('sys_swkbd_username_header')}</b><div style="margin:8px 0"><input class="sp-name" /></div><button class="sp-ok">확인</button> <button class="sp-no">취소</button>`;
          const inp = box.querySelector<HTMLInputElement>('.sp-name')!;
          inp.maxLength = maxLen;
          inp.value = current;
          box.querySelector('.sp-ok')!.addEventListener('click', () => done(inp.value));
          box.querySelector('.sp-no')!.addEventListener('click', () => done(null));
          inp.focus();
        }),
    },
    onApplet: showApplet,
    onCharSelect: (r) => {
      canvas.style.visibility = 'hidden';
      void runCharSelect(stage, {
        com: r.slots.map((s) => s.type === 'com'),
        pads: r.slots.map((s) => (s.type === 'human' && s.controller ? controllers.source(s.controller) : null)),
        names: r.slots.map((s) => s.displayName),
        muted: cfg.muted,
        onDone: (chars) => {
          charRun = null;
          canvas.style.visibility = '';
          chosen = chars;
          if (!chars) appFlow().enter('setplayer');
          handle.resolveCharSelect(chars !== null);
        },
      }).then((cr) => (charRun = cr));
    },
    onDone: (r) => {
      finished = true;
      cfg.onResult?.(r, chosen, r.slots.map((sl) => (sl.type === 'human' && sl.controller ? controllers.source(sl.controller) : null)));
      cfg.onDone(summary(r));
    },
  });

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let stopped = false;
  const loop = (now: number): void => {
    if (stopped) return;
    acc += Math.min(250, now - last);
    last = now;
    let n = 0;
    while (acc >= 1000 / 60 && n < 4) {
      if (!charRun) controllers.begin();
      handle.step();
      acc -= 1000 / 60;
      n++;
    }
    drawApplet(handle);
    if (!charRun) handle.render();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    handle,
    controllers,
    charSelect: () => charRun,
    press: (id, bits) => controllers.press(id, bits),
    debug() {
      const f = handle.flow;
      const lines = [`step ${f.step}${finished ? ' (끝)' : ''}  ui ${f.uiState}  인원 ${f.count}  커서 ${f.row},${f.col}`];
      lines.push(`컨트롤러 ${controllers.list().map((c) => c.id).join(',')}  할당 ${handle.pool.assign.map((a) => a ?? '-').join(',')}`);
      for (const s of f.slots) lines.push(`${s.pid + 1}P ${s.type ? 'COM' : '사람'} ${s.manageIdx === -1 ? '게스트' : '연동'} "${s.nickname}"`);
      return lines.join('\n');
    },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      charRun?.stop();
      handle.dispose();
      canvas.remove();
      overlay.remove();
      const c = actx;
      setTimeout(() => void c?.close(), 300);
    },
  };
}
