/**
 * 원본 레이아웃(nn::ui2d BFLYT/BFLAN v9) 최소 재생기 — 페인 트리·애니 트랙·재질·FFNT/OTF 글자를 1920×1080 기준 좌표로 그린다.
 * 데이터는 tools/ui_lyt.py 파서 출력(tools/mg1801_web_ui.py 가 ui.json 으로 묶음)을 그대로 쓴다. 규칙 출처는 docs/engine/05_ui_input.md 3절.
 *
 * 그리기: 자체 three.js WebGLRenderer(화면 밖 캔버스)에 사각형 메시로 그린 뒤 HUD 2D 캔버스에 drawImage 한다(3D 렌더러와 상태를 섞지 않는다).
 * 좌표: 레이아웃 원점 = 화면 가운데, y 위가 +. M(pane) = M(parent)·T(부모 원점점)·T(translate)·Rz·S (05 3.3).
 *
 * 원본과 같게 둔 것: 페인 변환·원점·부모 원점, 알파 전파(influencedAlpha), 애니 트랙(FLPA·FLVC·FLVI·FLMC·FLTS·FLTP, 에르미트·계단),
 *   애니가 끝나면 마지막 값 유지(ui2d 처럼 페인 값을 덮어쓰고 되돌리지 않음), 텍스처 랩(clamp·repeat·mirror)·UV 4점·정점색 4점.
 * 근사(원본 셰이더·컴바이너 미판독):
 *   - 재질 색 = black + (white − black) × 텍스처(채널마다), × 정점색 × 누적 알파 [추정: ui2d 기본 컴바이너]. 감마 공간에서 섞는다.
 *   - TEV 단계가 있는 재질(텍스처 2장)은 두 텍스처를 곱한다 [근사].
 *   - 텍스처 SRT = nw4r CalcTextureMtx 꼴(가운데 0.5 기준 회전·배율 + 이동) [추정].
 *   - 창(wnd1)은 windowFlags bit0(한 재질로 전부)일 때 프레임 재질 텍스처를 모서리(뒤집기)·변(clamp 늘림)·내용(clamp)으로 9칸 그린다 [근사].
 *   - 글자: 비트맵(FFNT) 배율 = fontSize / (FINF 폭, 높이) [추정: nn::font SetFontSize 규칙], 기준선 = 줄 위 + ascent, 글자 색 =
 *     black→white 를 커버리지로 보간, 위·아래 색 그라데이션은 글자마다. OTF 는 기준 크기(bfcpx)와 hhea 높이로 배율 [추정].
 *     한 줄만, 자동 축소·글자별 변환·그림자(txtFlags) 없음.
 *   - 부품(prt1): layoutFile 레이아웃을 자식 인스턴스로 만들어 그 페인 자리에 그린다(부품 루트를 부품 페인 가운데에 붙인다). 페인 애니를 부품 페인에
 *     걸면 부품 레이아웃 자신의 애니(<부품>_<태그>)를 재생한다 [추정: ui2d 부품 애니 규칙]. 속성 덮어쓰기(properties)는 다루지 않는다.
 *   - 마스크(페인 시스템 데이터 형식 3, tools/mg1801_web_ui.py pane_masks): 마스크 텍스처 알파를 SRT·랩대로 곱한다 [추정: ui2d 마스크 합성].
 *   - FLCT·FLIM·사용자 데이터 애니, 정렬(ali1)·스크롤(scr1) 페인은 다루지 않는다.
 */
import { LayoutInst, LayoutPlayer, evalKeys, nodeMatrix, type Rgba, type FontSpec, type LayoutSpec, type NodeSpec, type AnimSpec, type TrackSpec, type NodeState } from '@game/lib/layout';
export type { Rgba } from '@game/lib/layout';

export interface LytTexMap {
  tex: string;
  wrapU: string;
  wrapV: string;
  minFilter: string;
  magFilter: string;
}

export interface LytSrt {
  t: [number, number];
  r: number;
  s: [number, number];
}

export interface LytMaterial {
  name: string;
  black: string;
  white: string;
  texMaps: LytTexMap[];
  texSrt: LytSrt[];
  tev: { color: number; alpha: number }[];
}

export interface LytPane {
  type: string;
  name: string;
  visible: boolean;
  influencedAlpha: boolean;
  origin: [string, string];
  parentOrigin: [string, string];
  alpha: number;
  translate: [number, number, number];
  rotate: [number, number, number];
  scale: [number, number];
  size: [number, number];
  children: LytPane[];
  vtxColors?: string[];
  material?: string;
  uvs?: number[][];
  font?: string;
  fontSize?: [number, number];
  charSpace?: number;
  colorTop?: string;
  colorBottom?: string;
  textAlign?: { x: string; y: string };
  userData?: Record<string, unknown>;
  frameSize?: { l: number; r: number; t: number; b: number };
  windowFlags?: number;
  content?: { vtxColors: string[]; material: string; uvs: number[][] };
  frames?: { material: string; flip: number }[];
  /** 부품(prt1) 레이아웃 이름 */
  layoutFile?: string;
  /** 마스크 텍스처(페인 시스템 데이터) */
  mask?: { tex: string; wrapU: string; wrapV: string; srt: LytSrt };
}

export interface Lyt {
  textures: string[];
  fonts: string[];
  materials: LytMaterial[];
  layout: { size: [number, number]; name: string };
  root: LytPane;
}

export interface LanTrack {
  index: number;
  target: number;
  curve: string;
  keys: number[][];
}

export interface Lan {
  tag: { name: string; start: number; end: number };
  frameSize: number;
  loop: boolean;
  textures: string[];
  entries: { name: string; target: string; tags: { tag: string; tracks: LanTrack[] }[] }[];
}

export type LytFontAtlas = FontSpec;

export interface LytTelopFont {
  file: string;
  family: string;
  baseSize: number;
  unitsPerEm: number;
  ascent: number;
  descent: number;
}


const hex = (s: string): Rgba => [1, 3, 5, 7].map(i => parseInt(s.slice(i, i + 2), 16)) as Rgba;
const origin = (o: [string, string]): [number, number] => [o[0] === 'left' ? -1 : o[0] === 'right' ? 1 : 0, o[1] === 'top' ? 1 : o[1] === 'bottom' ? -1 : 0];

export function normalizeLyt(lyt: Lyt, anims: Record<string, Lan>): LayoutSpec {
  const nodes: NodeSpec[] = [];
  const matIndex = (name?: string): number => lyt.materials.findIndex(m => m.name === name);
  const add = (p: LytPane, parent: number): void => {
    const i = nodes.length;
    const colors = p.type === 'txt1' ? [p.colorTop!, p.colorTop!, p.colorBottom!, p.colorBottom!] : p.type === 'wnd1' ? p.content!.vtxColors : p.vtxColors;
    nodes.push({
      n: p.name, p: parent, k: ({ pic1: 'pic', txt1: 'txt', wnd1: 'wnd', prt1: 'part' } as Record<string, NodeSpec['k']>)[p.type] ?? 'null',
      v: p.visible, ia: p.influencedAlpha, o: origin(p.origin), po: origin(p.parentOrigin), t: [p.translate[0], p.translate[1]], r: p.rotate[2], extra: [p.translate[2], p.rotate[0], p.rotate[1]],
      s: [...p.scale], z: [...p.size], a: p.alpha, vc: colors?.map(hex), m: matIndex(p.material), uv: p.uvs?.[0], mask: p.mask,
      txt: p.type === 'txt1' ? { font: (p.font ?? '').replace(/\.fcpx$/, ''), fs: p.fontSize!, cs: p.charSpace ?? 0, al: origin([p.textAlign?.x ?? 'center', p.textAlign?.y ?? 'center']), text: '' } : undefined,
      wnd: p.type === 'wnd1' ? { fs: p.frameSize!, frame: matIndex(p.frames?.[0]?.material), content: matIndex(p.content?.material), flags: p.windowFlags ?? 0 } : undefined,
      part: p.layoutFile,
    });
    if (p.type === 'wnd1') nodes[i].uv = p.content?.uvs[0];
    p.children.forEach(child => add(child, i));
  };
  add(lyt.root, -1);
  return {
    compatibility: 'hudLegacy', size: [...lyt.layout.size], nodes,
    mats: lyt.materials.map(m => ({ name: m.name, black: hex(m.black), white: hex(m.white), tex: m.texMaps.map(t => ({ name: t.tex, wu: t.wrapU, wv: t.wrapV })), srt: m.texSrt })),
    anims: Object.fromEntries(Object.entries(anims).map(([tag, lan]) => [tag, normalizeLan(lan, nodes, lyt.materials)])),
  };
}

function normalizeLan(lan: Lan, nodes: NodeSpec[], mats: LytMaterial[]): AnimSpec {
  const tracks: TrackSpec[] = [];
  for (const entry of lan.entries) for (const tag of entry.tags) for (const t of tag.tracks) {
    const k = t.target;
    let prop: string | undefined;
    const index = entry.target === 'pane' ? nodes.findIndex(n => n.n === entry.name) : mats.findIndex(m => m.name === entry.name);
    if (index < 0) continue;
    if (entry.target === 'pane') {
      if (tag.tag === 'FLPA') prop = ['tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'sx', 'sy', 'w', 'h'][k];
      else if (tag.tag === 'FLVC') prop = k === 16 ? 'a' : k < 16 ? `vc${k}` : undefined;
      else if (tag.tag === 'FLVI') prop = 'vis';
    } else if (entry.target === 'material') {
      if (tag.tag === 'FLMC') prop = k < 4 ? `blk${k}` : k < 8 ? `wht${k - 4}` : undefined;
      else if (tag.tag === 'FLTS' && k < 5) prop = `srt${t.index}.${k}`;
      else if (tag.tag === 'FLTP' && t.index < mats[index].texMaps.length) prop = `tex${t.index}`;
    }
    if (prop) tracks.push({ ...(entry.target === 'pane' ? { node: index } : { mat: index }), prop, keys: t.keys, step: t.curve !== 'hermite', textures: lan.textures });
  }
  return { len: lan.frameSize, loop: lan.loop, tracks };
}

/** 표준 3차 에르미트(기울기 × 구간 길이). 같은 프레임 키 두 개 = 불연속 [05 3.7] */
export function evalTrack(tr: LanTrack, f: number): number { return evalKeys(tr.keys, f, tr.curve !== 'hermite'); }

/** 애니 하나의 재생 상태. 프레임은 태그 시작 기준(0..frameSize), 키도 같은 기준이다 [데이터: bflan 키 범위] */
export class AnimPlayer {
  constructor(readonly lan: Lan, readonly only: Set<string> | null, readonly player = new LayoutPlayer(lan.tag.name, { len: lan.frameSize, loop: lan.loop, tracks: [] })) {}
  get frame(): number { return this.player.frame; }
  set frame(v: number) { this.player.frame = v; }
  /** 프레임당 진행량(원본 SetAnimationSpeed / PlayRate) */
  get speed(): number { return this.player.speed; }
  set speed(v: number) { this.player.speed = v; }
  get ended(): boolean { return this.player.ended; }
  advance(frames: number): void { this.player.advance(frames); }
}

class PaneState {
  readonly t: number[];
  readonly r: number[];
  children: PaneState[] = [];
  constructor(readonly src: LytPane, private readonly state: NodeState) {
    this.t = [0, 0, 0]; this.r = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      Object.defineProperty(this.t, i, { enumerable: true, get: () => i < 2 ? state.t[i] : state.extra[0], set: (v: number) => { if (i < 2) state.t[i] = v; else state.extra[0] = v; } });
      Object.defineProperty(this.r, i, { enumerable: true, get: () => i < 2 ? state.extra[i + 1] : state.r, set: (v: number) => { if (i < 2) state.extra[i + 1] = v; else state.r = v; } });
    }
  }
  get s(): number[] { return this.state.s; }
  get size(): number[] { return this.state.z; }
  get alpha(): number { return this.state.a; }
  set alpha(v: number) { this.state.a = v; }
  get visible(): boolean { return this.state.v; }
  set visible(v: boolean) { this.state.v = v; }
  /** 정점색 TL, TR, BL, BR. 글자 페인은 0 = 위 색, 2 = 아래 색, 창은 내용 정점색 */
  get vtx(): Rgba[] { return this.state.vc; }
}

class MatState {
  readonly tex: string[];
  constructor(readonly src: LytMaterial, private readonly core: LayoutInst, private readonly index: number) {
    this.tex = src.texMaps.map(m => m.tex);
    for (let slot = 0; slot < this.tex.length; slot++) Object.defineProperty(this.tex, slot, {
      enumerable: true, get: () => core.texOverride.get(index)?.get(slot) ?? src.texMaps[slot].tex,
      set: (v: string) => { let ov = core.texOverride.get(index); if (!ov) core.texOverride.set(index, ov = new Map()); ov.set(slot, v); },
    });
  }
  get black(): Rgba { return this.core.mats[this.index].black; }
  get white(): Rgba { return this.core.mats[this.index].white; }
  get srt(): LytSrt[] { return this.core.mats[this.index].srt; }
}

/** 부품 레이아웃 찾기(이름 → 레이아웃·애니) */
export type LytPartsResolver = (layoutFile: string) => { lyt: Lyt; anims: Record<string, Lan> } | null;

/** 레이아웃 하나의 실행 인스턴스(원본 CaComUiBase/ComUi 하나에 해당) */
export class LayoutInstance {
  readonly core: LayoutInst;
  readonly panes = new Map<string, PaneState>();
  readonly mats = new Map<string, MatState>();
  readonly root: PaneState;
  /** 엔티티 이동(레이아웃 좌표, 원본 Entity::SetTranslation) */
  pos = { x: 0, y: 0 };
  /** 그리는 순서(같은 묶음 안에서 큰 값이 위) */
  order = 0;
  main: AnimPlayer | null = null;
  readonly paneAnims = new Map<string, AnimPlayer>();
  readonly texts = new Map<string, string>();
  /** 부품 페인 이름 → 부품 레이아웃 인스턴스 */
  readonly parts = new Map<string, LayoutInstance>();

  constructor(readonly lyt: Lyt, readonly anims: Record<string, Lan>, resolve?: LytPartsResolver) {
    this.core = new LayoutInst(lyt.layout.name, normalizeLyt(lyt, anims), { layouts: {} });
    this.core.visible = false;
    const build = (p: LytPane): PaneState => {
      const i = this.core.byName.get(p.name)!;
      const state = new PaneState(p, this.core.nodes[i]); this.panes.set(p.name, state);
      state.children = p.children.map(build);
      const sub = p.type === 'prt1' && p.layoutFile && resolve ? resolve(p.layoutFile) : null;
      if (sub) {
        const part = new LayoutInstance(sub.lyt, sub.anims, resolve); part.visible = true;
        this.parts.set(p.name, part); this.core.parts.set(i, part.core);
      }
      return state;
    };
    this.root = build(lyt.root);
    lyt.materials.forEach((m, i) => this.mats.set(m.name, new MatState(m, this.core, i)));
  }
  /** 레이아웃 표시(원본 ComGuiLayout+0x136 / SetVisible) */
  get visible(): boolean { return this.core.visible; }
  set visible(v: boolean) { this.core.visible = v; }
  /** 부품 페인의 부품 인스턴스('a/b' 면 부품 안의 부품) */
  part(path: string): LayoutInstance | null {
    let cur: LayoutInstance | null = this;
    for (const n of path.split('/')) cur = cur?.parts.get(n) ?? null;
    return cur;
  }
  /**
   * 원본 nn::bezel::ComGuiLayout::GetPaneGlobalPosition — 페인 원점의 레이아웃 좌표(가운데 원점, y 위 +).
   * 지금 애니 값이 반영된 페인 변환을 루트부터 곱한다.
   */
  paneGlobalPos(name: string): { x: number; y: number } | null { const m = nodeMatrix(this.core, name); return m ? { x: m[2], y: m[5] } : null; }
  /** 페인 애니(부품 페인이면 부품의 레이아웃 애니) 프레임을 바꾸고 값을 바로 쓴다(원본 SetPaneAnimationFrame) */
  setPaneFrame(pane: string, frame: number): void {
    const part = this.parts.get(pane), a = part ? part.main : this.paneAnims.get(pane);
    if (!a) return; a.frame = frame; (part ?? this).core.applyPlayer(a.player);
  }
  /** 레이아웃 전체 애니 프레임(원본 SetAnimationFrame) */
  setFrame(frame: number): void { if (this.main) { this.main.frame = frame; this.core.applyPlayer(); } }
  /** 원본 CaComUiBase::PlayAnimation(태그) — 레이아웃 전체 애니를 바꾼다 */
  play(tag: string, speed = 1, frame = 0): AnimPlayer {
    const lan = this.anims[tag]; if (!lan) throw new Error(`애니 없음 ${this.lyt.layout.name}_${tag}`);
    const p = new LayoutPlayer(tag, this.core.spec.anims[tag]); p.speed = speed; p.frame = frame;
    this.core.player = p; this.main = new AnimPlayer(lan, null, p); this.core.applyPlayer(); return this.main;
  }
  /** 원본 CaComUiBase::PlayPaneAnimation(페인, 태그) — 그 페인 하위에만 건다. 부품 페인이면 부품 레이아웃의 그 애니 */
  playPane(pane: string, tag: string, speed = 1): AnimPlayer {
    const part = this.parts.get(pane); if (part) return part.play(tag, speed);
    const lan = this.anims[tag], root = this.panes.get(pane); if (!lan || !root) throw new Error(`페인 애니 없음 ${pane} ${tag}`);
    const only = new Set<string>();
    const walk = (p: PaneState): void => { only.add(p.src.name); if (p.src.material) only.add(p.src.material); p.children.forEach(walk); }; walk(root);
    const nodes = new Set(this.core.nodes.flatMap((n, i) => only.has(n.spec.n) ? [i] : []));
    const mats = new Set(this.core.spec.mats.flatMap((m, i) => only.has(m.name) ? [i] : []));
    const p = new LayoutPlayer(tag, this.core.spec.anims[tag], undefined, nodes, mats); p.speed = speed;
    const a = new AnimPlayer(lan, only, p); this.paneAnims.set(pane, a); this.core.channels.set(pane, p); this.core.applyPlayer(p); return a;
  }
  setPaneVisible(name: string, v: boolean): void { const p = this.panes.get(name); if (p) p.visible = v; }
  /** frames 만큼 진행하고 트랙 값을 페인·재질에 쓴다 */
  update(frames: number): void { this.core.update(frames); }
  syncTexts(): void {
    this.core.texts.clear(); for (const [name, text] of this.texts) { const i = this.core.byName.get(name); if (i !== undefined) this.core.texts.set(i, text); }
    for (const p of this.parts.values()) p.syncTexts();
  }
}
