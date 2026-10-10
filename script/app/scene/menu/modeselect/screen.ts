/**
 * 모드 선택(맵 메뉴) 화면 컨트롤러 — 상태기계(state.ts) 사건을 명세 레이아웃·어댑터(소리·진동·알림)로 옮긴다.
 * 레이아웃 재생·그리기는 캐릭터 선택 모듈의 scene2d·render2d 를 그대로 import 해서 쓴다(규칙: docs/shell/charselect.md 6절).
 * 이 화면 고유 배치·흐름은 docs/shell/modeselect.md 4~6·9절. 엔진층(script/game/core·games·view)을 쓰지 않는다.
 */
import * as THREE from 'three';
import { MenuSurface } from '@app/common/render/menu';
import { nodeMatrix, Render2D } from '@app/common/ui/layout/render';
import { LayoutInst } from '@game/lib/layout';
import { RepeatGen } from '@app/scene/menu/charselect/state';
import type { LayoutSpec, Spec } from '@app/scene/menu/charselect/types';
import { BUTTONS, ModeSelectState, type ModeEvent } from './state';
import type { ModeSelectOptions, ModeSpec } from './types';

type Mat3 = [number, number, number, number, number, number];

const pad2 = (n: number): string => String(n).padStart(2, '0');
const mul = (a: Mat3, b: Mat3): Mat3 => [
  a[0] * b[0] + a[1] * b[3],
  a[0] * b[1] + a[1] * b[4],
  a[0] * b[2] + a[1] * b[5] + a[2],
  a[3] * b[0] + a[4] * b[3],
  a[3] * b[1] + a[4] * b[4],
  a[3] * b[2] + a[4] * b[5] + a[5],
];

export interface ModeSelectHandle {
  step(): void;
  render(): void;
  dispose(): void;
  readonly state: ModeSelectState;
  readonly spec: ModeSpec;
  readonly layouts: { base: LayoutInst; guide: LayoutInst };
  /** 지금 설명 줄(시험용) */
  readonly lines: readonly string[];
}

export async function createModeSelect(opts: ModeSelectOptions): Promise<ModeSelectHandle> {
  const url = (p: string): string => opts.assets.url(p);
  const spec = (await (await fetch(url('spec.json'))).json()) as ModeSpec;
  const all = spec as unknown as Spec;
  const r2d = new Render2D(all);
  let surface: MenuSurface | null = null;
  try {
  await r2d.load(url);
  surface = await MenuSurface.create(opts.canvas, spec.screen[0], spec.screen[1]);
  const gpu = surface;
  const gl = gpu.gl;

  const L = (name: string): LayoutInst => new LayoutInst(name, spec.layouts[name], all);
  const base = L('mn01_base_map_00');
  const guide = L('sys_guide_03');
  const texts = spec.texts;
  const modes = spec.modes;
  const flags = opts.flags ?? {};

  // 부품 재질 덮어쓰기(사진 창 그림·창 테두리, docs 4.1·9.4) [데이터]
  for (const [lay, list] of Object.entries(spec.partMats)) {
    if (lay !== 'mn01_pict_map_00') continue;
    for (const e of list) {
      const path = `x_parts_map/${e.part}/${e.pane}`;
      e.tex.forEach((t, slot) => base.setTexture(path, slot, t));
      const f = base.find(path);
      const m = f ? f[0].nodes[f[1]].spec.m : undefined;
      if (f && m !== undefined && m >= 0) f[0].mats[m].srt = e.srt.map((s) => ({ t: [s.t[0], s.t[1]], r: s.r, s: [s.s[0], s.s[1]] }));
    }
  }
  // 사진 창 그림 = 투영 텍스좌표(source 4, SRT 1.0)로 페인 384×216 에 1:1 [추정, docs 6절]. 페인 UV 는 마스크용 0..2(mirror) 라
  // 0번 칸만 SRT 0.5·−0.25 로 0..1 로 되돌린다(render2d 텍스처 행렬 uv' = S(uv − 0.5) + 0.5 + t)
  for (const m of modes) {
    const f = base.find(`x_parts_map/${m.win}/pict_mode`);
    const mi = f ? f[0].nodes[f[1]].spec.m : undefined;
    if (f && mi !== undefined && mi >= 0) f[0].mats[mi].srt[0] = { t: [-0.25, -0.25], r: 0, s: [0.5, 0.5] };
  }

  const state = new ModeSelectState(
    opts.playable ??
      ((b: number): number => {
        // CheckModePlayable: 오프라인이면 0..6·8 가능 [판독], 7 = 저장 플래그 0x28 없으면 4(숨김)
        if (b === 7) return flags.quest ? 0 : 4;
        return 0;
      }),
  );
  if (opts.initialCursor !== undefined) state.cursor = opts.initialCursor;

  // SetupButton·Setup [판독 docs 5.2]
  const setupButtons = (): void => {
    let k = 0;
    for (let i = 0; i < BUTTONS; i++) {
      const b = `x_btn_${pad2(i)}`;
      base.setText(`${b}/x_text_00`, texts[modes[i].name]);
      base.setVisible(`${b}/x_icon_00`, modes[i].joycon);
      base.setVisible(`${b}/x_icon_new`, (i === 0 && !!flags.newBd) || (i === 6 && !!flags.newMgm));
      base.setVisible(b, state.shown[i]);
      // 정렬(A_alignment_00): 보이는 버튼만 위에서부터 간격 91 [데이터 ali1 여백 −81 + 참고 이미지, 규칙 추정]
      const f = base.find(b);
      if (f && state.shown[i]) f[0].nodes[f[1]].t[1] = spec.align.top - spec.align.pitch * k++;
    }
    const mp = 'x_parts_map/x_icon_mode_00';
    for (const [pane, on] of [
      ['x_icon_bd02_on', flags.bd02],
      ['x_icon_bd02_off', flags.bd02],
      ['x_icon_bd03_on', flags.bd03],
      ['x_icon_bd03_off', flags.bd03],
      ['x_icon_bd06_on', flags.bd06],
      ['x_icon_bd06_off', flags.bd06],
      ['x_icon_bd06_cloud', flags.bd06],
    ] as const)
      base.setVisible(`${mp}/${pane}`, !!on);
  };

  // 설명: 여러 줄 글자(원본 ui2d 줄바꿈)를 줄마다 같은 글자 페인 복사본으로 그린다(docs 9.4)
  base.setVisible('x_text_mess', false);
  const mess = spec.layouts.mn01_base_map_00.nodes.find((n) => n.n === 'x_text_mess')!;
  // 컬러 글리프(⭐ U+E021)는 글자색을 곱하지 않는다 [참고 이미지, docs 6.1] → 컬러 구간은 흰 정점색 노드로 따로 그린다.
  // 구간 위치 = render2d 와 같은 진행폭(adv × 배율 + 자간) 합에서 구간 가운데까지
  const WHITE: [number, number, number, number][] = [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
  ];
  const segSpec = (dx: number, color: boolean): LayoutSpec => ({
    size: [1920, 1080],
    nodes: [
      { n: 'root', p: -1, k: 'null', v: true, ia: true, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [1920, 1080], a: 255 },
      { ...mess, p: 0, t: [dx, 0], r: 0, s: [1, 1], v: true, ...(color ? { vc: WHITE } : {}) },
    ],
    mats: spec.layouts.mn01_base_map_00.mats,
    anims: {},
  });
  let lines: string[] = [];
  let lineInst: LayoutInst[][] = [];
  const setLines = (b: number): void => {
    lines = b >= 0 && b < modes.length ? (texts[modes[b].detail] ?? '').split(/\r?\n/) : [];
    const ts = mess.txt!;
    const f = spec.fonts[ts.font];
    const sx = ts.fs[0] / f.width;
    lineInst = lines.map((line) => {
      const chars = [...line];
      const adv = chars.map((ch) => (f.glyphs[ch]?.adv ?? f.width) * sx);
      const lw = adv.reduce((a, v) => a + v, 0) + ts.cs * Math.max(0, chars.length - 1);
      const segs: LayoutInst[] = [];
      let i = 0;
      let x = 0;
      while (i < chars.length) {
        const color = !!f.glyphs[chars[i]]?.color;
        let j = i;
        let w = 0;
        while (j < chars.length && !!f.glyphs[chars[j]]?.color === color) {
          w += adv[j] + (j > i ? ts.cs : 0);
          j++;
        }
        const li = new LayoutInst('x_text_mess', segSpec(x + w / 2 - lw / 2, color), all);
        li.setText('x_text_mess', chars.slice(i, j).join(''));
        segs.push(li);
        x += w + ts.cs;
        i = j;
      }
      return segs;
    });
  };

  // 뒤 3D 장면(docs 6.2): 원본 = 렌더러 흐림 버퍼(BexZabutonBlurred)가 blur 창 칸을 바꾸고, 패널 밖은 3D 장면 그대로.
  // 장면 그림은 [미확정] — opts.backdrop 이 있을 때만 화면 뒤 전체(선명) + 흐린 사본(캔버스 blur, 반경 화면 높이 2% [근사])을 쓴다
  let backLayer: LayoutInst | null = null;
  const bd = opts.backdrop;
  if (bd) {
    const [W, H] = spec.screen;
    const mk = (blur: number): THREE.Texture => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      if (blur > 0) g.filter = `blur(${blur}px)`;
      g.drawImage(bd, -2 * blur, -2 * blur, W + 4 * blur, H + 4 * blur);
      const t = new THREE.CanvasTexture(c);
      t.flipY = false;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.userData.srgb = true;
      return t;
    };
    r2d.dynamic.set('zabuton:sharp', mk(0));
    r2d.dynamic.set('zabuton:blur', mk(Math.round(H * 0.02)));
    backLayer = new LayoutInst(
      'backdrop',
      {
        size: [W, H],
        nodes: [
          { n: 'root', p: -1, k: 'null', v: true, ia: true, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [W, H], a: 255 },
          { n: 'scene', p: 0, k: 'pic', v: true, ia: false, o: [0, 0], po: [0, 0], t: [0, 0], r: 0, s: [1, 1], z: [W, H], a: 255, m: 0, uv: [0, 0, 1, 0, 0, 1, 1, 1] },
        ],
        mats: [{ name: 'scene', black: [0, 0, 0, 0], white: [255, 255, 255, 255], tex: [{ name: 'zabuton:sharp', wu: 'clamp', wv: 'clamp' }], srt: [{ t: [0, 0], r: 0, s: [1, 1] }] }],
        anims: {},
      },
      all,
    );
    for (const z of spec.zabuton.mn01_base_map_00 ?? []) {
      const pi = base.byName.get(z.pane);
      if (pi === undefined) continue;
      for (const ci of base.nodes[pi].children) for (const slot of z.slots) base.setTexture(base.nodes[ci].spec.n, slot, 'zabuton:blur');
    }
  }
  /** blur 창 조각: 흐림 칸은 화면 공간(투영 source 3), 칸 0 은 재질 SRT 로 원래 UV(조각마다 재질 사본, 변환기) */
  const updateZabuton = (): void => {
    if (!bd) return;
    for (const z of spec.zabuton.mn01_base_map_00 ?? []) {
      const pi = base.byName.get(z.pane);
      if (pi === undefined) continue;
      for (const ci of base.nodes[pi].children) {
        const c = base.nodes[ci];
        const m = nodeMatrix(base, c.spec.n);
        if (!m) continue;
        const hw = c.z[0] / 2;
        const hh = c.z[1] / 2;
        const sc = [
          [-hw, hh],
          [hw, hh],
          [-hw, -hh],
          [hw, -hh],
        ].map(([lx, ly]) => [(m[0] * lx + m[1] * ly + m[2] + 960) / 1920, (540 - (m[3] * lx + m[4] * ly + m[5])) / 1080]);
        const o = c.spec.uv ?? [0, 0, 1, 0, 0, 1, 1, 1];
        c.uv = sc.flat();
        const mi = c.spec.m;
        if (mi === undefined || mi < 0) continue;
        const au = (o[2] - o[0]) / (sc[1][0] - sc[0][0]);
        const av = (o[5] - o[1]) / (sc[2][1] - sc[0][1]);
        const bu = o[0] - au * sc[0][0];
        const bv = o[1] - av * sc[0][1];
        base.mats[mi].srt[0] = { t: [bu - 0.5 + 0.5 * au, bv - 0.5 + 0.5 * av], r: 0, s: [au, av] };
      }
    }
  };

  // 나눈 창(docs 6.1): 창 노드 정점색 → 조각 꼭짓점 쌍선형
  const splitVc = (inst: LayoutInst): void => {
    for (const sw of spec.split[inst.name] ?? []) {
      const pi = inst.byName.get(sw.n);
      if (pi === undefined) continue;
      const pv = inst.nodes[pi].vc;
      const at = (x: number, y: number): [number, number, number, number] => {
        const u = Math.max(0, Math.min(1, (x + sw.w / 2) / sw.w));
        const v = Math.max(0, Math.min(1, (sw.h / 2 - y) / sw.h));
        const c = [0, 1, 2, 3].map((k) => {
          const top = pv[0][k] + (pv[1][k] - pv[0][k]) * u;
          const bot = pv[2][k] + (pv[3][k] - pv[2][k]) * u;
          return Math.round(top + (bot - top) * v);
        });
        return [c[0], c[1], c[2], c[3]];
      };
      for (const ci of inst.nodes[pi].children) {
        const c = inst.nodes[ci];
        if (!c.spec.n.startsWith(`${sw.n}#`)) continue;
        if (!sw.all && !c.spec.n.endsWith('#C')) continue;
        const [cx, cy] = c.t;
        const [hw, hh] = [c.z[0] / 2, c.z[1] / 2];
        c.vc = [at(cx - hw, cy + hh), at(cx + hw, cy + hh), at(cx - hw, cy - hh), at(cx + hw, cy - hh)];
      }
    }
    for (const p of inst.parts.values()) splitVc(p);
  };

  // 안내 "(B) 닫기": ComUiGuide00 SetGuidePos 17, 개수 1 — charselect 와 같은 배치 [판독 docs 5절, 배치 규칙 charselect.md]
  for (const a of ['x_alignment_left', 'x_alignment_center']) guide.setVisible(a, false);
  for (let i = 1; i < 4; i++) guide.setVisible(`sys_guide_right_${pad2(i)}`, false);
  guide.setText('sys_guide_right_00/x_text', texts.mn01_mode_ctrl_close);
  guide.setText('sys_guide_right_00/x_text_shadow', texts.mn01_mode_ctrl_close);
  {
    const f = spec.fonts.bqfont_middle;
    let w = 0;
    for (const ch of texts.mn01_mode_ctrl_close) w += (f.glyphs[ch]?.adv ?? f.width) * (52 / f.width);
    const g = guide.find('sys_guide_right_00');
    if (g) g[0].nodes[g[1]].t[0] = -w / 2;
  }
  guide.visible = false;
  const posM = nodeMatrix(L('sys_guide_pos_01'), 'x_pos_17');
  const guideBase: Mat3 = [1, 0, posM ? posM[2] : 900, 0, 1, posM ? posM[5] : -478];

  const NOTICE_LABEL: Record<string, string> = {
    Notice_PlayModeMissed00: 'sys_notice_playModeMissed00',
    Notice_PlayModeMissed01: 'sys_notice_playModeMissed01',
    Notice_PlayModeMissed04: 'sys_notice_playModeMissed04',
  };
  let wiping = false;
  let cancelled = false;
  let finished = false;

  const handle = (ev: ModeEvent[]): void => {
    for (const e of ev) {
      switch (e.type) {
        case 'btn': {
          const p = base.part(`x_btn_${pad2(e.button)}`);
          if (p?.hasAnim(e.anim) || (e.next && p?.hasAnim(e.next))) p!.play(e.anim, e.next);
          break;
        }
        case 'icon':
          base.part(`x_parts_map/${modes[e.button].icon}`)?.play(e.anim);
          break;
        case 'win':
          base.setVisible(`x_parts_map/${modes[e.button].win}`, e.visible);
          break;
        case 'text':
          setLines(e.button);
          break;
        case 'layout':
          base.play(e.anim);
          break;
        case 'visible':
          base.visible = e.visible;
          break;
        case 'guide':
          if (e.anim === 'in') {
            guide.visible = true;
            guide.play('in', 'normal');
          } else guide.play('out');
          break;
        case 'se': {
          const s = spec.sounds[e.label];
          let x: number | undefined;
          if (e.button !== undefined) {
            const m = nodeMatrix(base, `x_btn_${pad2(e.button)}`);
            if (m) x = 960 + m[2];
          }
          if (s) opts.sound?.play?.(e.label, url(s.file), s.gain, x);
          break;
        }
        case 'vib':
          opts.sound?.vibrate?.(e.name);
          break;
        case 'notice':
          opts.onNotice?.(texts[NOTICE_LABEL[e.id]] ?? e.id);
          break;
        case 'decided': {
          const m = modes[e.button];
          opts.onDecided?.({ button: m.button, key: m.key, name: texts[m.name], next: m.next });
          wiping = true;
          opts.wipe?.fadeOut(1, 1.0);
          break;
        }
        case 'cancel':
          opts.onCancel?.();
          cancelled = true;
          handle(state.out(false));
          break;
      }
    }
  };

  setupButtons();
  setLines(-1);
  splitVc(base);
  handle(state.start());
  setupButtons();

  const reps = new RepeatGen();
  const step = (): void => {
    if (finished) return;
    const { hold: h, trig } = opts.input.poll();
    handle(state.step({ trig, rep: reps.next(h, trig), hold: h }, base.done));
    base.update(1);
    guide.update(1);
    splitVc(base);
    opts.wipe?.step();
    if (wiping && (!opts.wipe || opts.wipe.closed)) {
      finished = true;
      opts.onFinished?.(true);
    } else if (cancelled && state.finished) {
      finished = true;
      opts.onFinished?.(false);
    }
  };

  /** null_00 까지 누적 알파(설명 줄에 적용) */
  const messAlpha = (): number => {
    let a = 255;
    const f = base.find('x_text_mess');
    if (!f) return a;
    for (let k = f[0].nodes[f[1]].spec.p; k >= 0; k = f[0].nodes[k].spec.p) {
      const n = f[0].nodes[k];
      if (!n.v) return 0;
      if (n.spec.ia) a = (a * n.a) / 255;
    }
    return a;
  };

  const render = (): void => {
    if (!gpu.active) return;
    gpu.frame(() => {
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    r2d.begin();
    updateZabuton();
    if (backLayer) r2d.draw(backLayer);
    r2d.draw(base);
    if (base.visible) {
      const m = nodeMatrix(base, 'x_text_mess');
      const a = Math.round(messAlpha());
      const lh = mess.txt!.fs[1];
      if (m)
        lineInst.forEach((segs, i) => {
          const y = ((lines.length - 1) / 2 - i) * lh;
          for (const li of segs) {
            li.nodes[0].a = a;
            r2d.draw(li, mul([m[0], m[1], m[2], m[3], m[4], m[5]], [1, 0, 0, 0, 1, y]));
          }
        });
    }
    r2d.draw(guide, guideBase);
    r2d.render(gl);
    });
  };
  // 2D 셰이더를 첫 화면 전에 한 번 그려 컴파일해 둔다(캐릭터 선택의 첫 그리기 렉 대책과 같은 취지)
  render();

  return {
    step,
    render,
    state,
    spec,
    layouts: { base, guide },
    get lines() {
      return lines;
    },
    dispose(): void {
      r2d.dispose();
      gpu.dispose();
    },
  };
  } catch (error) { r2d.dispose(); surface?.dispose(); throw error; }
}
