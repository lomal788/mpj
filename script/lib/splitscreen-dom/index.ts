/**
 * 분할선 DOM 어댑터 — 코어(../splitscreen)만 import. three·WebGL 을 거치지 않고 원본 Parts.lyt sys_dividing_lines 를 div 로 그린다(docs/engine/10_split_screen.md §9.5).
 * - Null_all = 1920×1080 기준 상자 하나(부모 폭에 맞춰 scale, 알파 = opacity), pane 26개 = 폭 8·높이 = 코어 길이·회전 0/−90deg(레이아웃 y 위 +90° = CSS 반시계).
 * - 재질: background-color = 원본 white(#020202) + mask-image = sys_dividing_line^s(그림 RGB 가 모두 255 라 black+(white−black)·tex 와 같다), mask-size 100% 100%.
 * - 시간은 CSS transition 에 맡기지 않는다: draw() 가 코어 값을 그리기마다 style 에 쓰기만 한다(바뀐 값만). pointer-events none.
 * - 겹침: z-index 없이 before(틀 2D HUD 등) 앞에 넣어 DOM 순서로 3D 위·HUD 아래(DrawPriority 0x8100).
 */
import { BASE_H, BASE_W, DIVIDING_LINES, type DividingLines } from '../splitscreen';

export interface DomLinesOptions {
  parent: HTMLElement;
  texture: string;
  before?: Node | null;
}

interface PaneCache {
  el: HTMLDivElement;
  visible: boolean;
  transform: string;
  length: number;
}

export class DomDividingLines {
  readonly el: HTMLDivElement;
  private readonly root: HTMLDivElement;
  private readonly panes: PaneCache[] = [];
  private lastAlpha = -1;
  private lastShown = false;
  private lastScale = -1;

  constructor(private readonly o: DomLinesOptions) {
    const el = document.createElement('div');
    el.className = 'ss-lines';
    Object.assign(el.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', visibility: 'hidden' });
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'absolute', left: '0', top: '0', width: `${BASE_W}px`, height: `${BASE_H}px`, transformOrigin: '0 0', opacity: '0' });
    el.appendChild(root);
    const [r, g, b, a] = DIVIDING_LINES.white;
    const color = `rgba(${r},${g},${b},${a / 255})`;
    const mask = `url("${o.texture}")`;
    for (let i = 0; i < DIVIDING_LINES.count * 2; i++) {
      const p = document.createElement('div');
      const s = p.style;
      s.position = 'absolute';
      s.left = '0';
      s.top = '0';
      s.width = `${DIVIDING_LINES.paneWidth}px`;
      s.height = '0px';
      s.transformOrigin = '50% 50%';
      s.backgroundColor = color;
      s.setProperty('mask-image', mask);
      s.setProperty('mask-size', '100% 100%');
      s.setProperty('mask-repeat', 'no-repeat');
      s.setProperty('-webkit-mask-image', mask);
      s.setProperty('-webkit-mask-size', '100% 100%');
      s.setProperty('-webkit-mask-repeat', 'no-repeat');
      s.display = 'none';
      root.appendChild(p);
      this.panes.push({ el: p, visible: false, transform: '', length: -1 });
    }
    o.parent.insertBefore(el, o.before ?? null);
    this.el = el;
    this.root = root;
  }

  draw(lines: DividingLines): void {
    const shown = lines.shown;
    if (shown !== this.lastShown) {
      this.lastShown = shown;
      this.el.style.visibility = shown ? 'visible' : 'hidden';
    }
    if (!shown) return;
    const k = (this.o.parent.clientWidth || BASE_W) / BASE_W;
    if (k !== this.lastScale) {
      this.lastScale = k;
      this.root.style.transform = `scale(${k})`;
    }
    const a = lines.alpha / 255;
    if (a !== this.lastAlpha) {
      this.lastAlpha = a;
      this.root.style.opacity = String(a);
    }
    const src = lines.panes;
    for (let i = 0; i < src.length; i++) {
      const p = src[i];
      const c = this.panes[i];
      if (p.visible !== c.visible) {
        c.visible = p.visible;
        c.el.style.display = p.visible ? '' : 'none';
      }
      if (!p.visible) continue;
      if (p.length !== c.length) {
        c.length = p.length;
        c.el.style.height = `${p.length}px`;
      }
      const tx = BASE_W / 2 + p.x - DIVIDING_LINES.paneWidth / 2;
      const ty = BASE_H / 2 - p.y - p.length / 2;
      const t = `translate(${tx}px,${ty}px) rotate(${-p.rotate}deg)`;
      if (t !== c.transform) {
        c.transform = t;
        c.el.style.transform = t;
      }
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
