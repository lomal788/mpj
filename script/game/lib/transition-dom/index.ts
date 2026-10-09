/**
 * 화면 전환 DOM 어댑터 — 코어(../transition)만 import. three·WebGL 을 거치지 않고 앱 최상위 div 하나에 원본 wipe.bflyt 를 그린다(docs/engine/15_transition.md §4).
 * - 종류별 그림: Black = #000 칠, White = #fff 칠, Loading = #000 칠(글자 T_text_00 은 실행 때 넣는 문자열이라 미판독 → 그리지 않음),
 *   CrossFade = 전환을 시작할 때 capture() 가 준 화면 그림(없으면 그리지 않음). 덮는 정도 = 코어 alpha()(원본 페인 알파 키) → opacity 하나.
 * - 시간은 CSS transition 에 맡기지 않는다: 코어가 고정 스텝으로 정한 값을 그리기마다 style 에 쓰기만 한다(바뀐 값만).
 * - pointer-events none, opacity·visibility 만 바꾼다(레이아웃 재계산 없음), will-change 는 전환 중에만.
 */
import { CLOSING, OPENING, WIPE_CROSSFADE, WIPE_WHITE, type Transition } from '../transition';

export interface DomWipeOptions {
  /** 덮을 상자(앱 화면 최상위). 그 안 맨 위에 붙는다 */
  parent: HTMLElement;
  zIndex?: number;
  /** CrossFade 화면 담기: 지금 화면 그림(WebGL 캔버스 등). 없으면 CrossFade 는 그리지 않는다 */
  capture?: () => CanvasImageSource | null;
}

export class DomWipe {
  readonly el: HTMLDivElement;
  private shot: HTMLCanvasElement | null = null;
  private lastAlpha = -1;
  private lastColor = '';
  private lastShot = false;
  private lastPlaying = false;
  private lastSerial = -1;

  constructor(private readonly o: DomWipeOptions) {
    const el = document.createElement('div');
    el.className = 'tr-wipe';
    const s = el.style;
    s.position = 'absolute';
    s.inset = '0';
    s.pointerEvents = 'none';
    s.zIndex = String(o.zIndex ?? 1000);
    s.opacity = '0';
    s.visibility = 'hidden';
    s.background = '#000';
    o.parent.appendChild(el);
    this.el = el;
  }

  private snap(): void {
    const src = this.o.capture?.() ?? null;
    if (!src) {
      if (this.shot) this.shot.style.display = 'none';
      return;
    }
    const w = this.o.parent.clientWidth || 1;
    const h = this.o.parent.clientHeight || 1;
    if (!this.shot) {
      this.shot = document.createElement('canvas');
      Object.assign(this.shot.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      this.el.appendChild(this.shot);
    }
    if (this.shot.width !== w || this.shot.height !== h) {
      this.shot.width = w;
      this.shot.height = h;
    }
    this.shot.style.display = '';
    this.shot.getContext('2d')?.drawImage(src, 0, 0, w, h);
  }

  draw(t: Transition): void {
    const cross = t.type === WIPE_CROSSFADE;
    if (t.serial !== this.lastSerial) {
      this.lastSerial = t.serial;
      if (cross && t.phase === CLOSING) this.snap();
    }
    const shot = cross && !!this.shot && this.shot.style.display !== 'none';
    const a = cross && !shot ? 0 : t.alpha();
    const color = cross ? 'transparent' : t.type === WIPE_WHITE ? '#fff' : '#000';
    const s = this.el.style;
    if (color !== this.lastColor) {
      this.lastColor = color;
      s.background = color;
    }
    if (shot !== this.lastShot) {
      this.lastShot = shot;
      if (this.shot && !shot) this.shot.style.display = 'none';
    }
    if (a !== this.lastAlpha) {
      if ((a > 0) !== (this.lastAlpha > 0)) s.visibility = a > 0 ? 'visible' : 'hidden';
      this.lastAlpha = a;
      s.opacity = String(a);
    }
    const playing = t.phase === CLOSING || t.phase === OPENING;
    if (playing !== this.lastPlaying) {
      this.lastPlaying = playing;
      s.willChange = playing ? 'opacity' : '';
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
