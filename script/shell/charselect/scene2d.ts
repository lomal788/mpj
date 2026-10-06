/**
 * 명세 레이아웃 인스턴스 — 노드 값·재질 값·애니 재생(에르미트·계단, 1프레임/틱)·부품 인스턴스.
 * 규칙: 애니가 끝나면 마지막 값을 유지한다(원본 ui2d 처럼 값을 덮어쓰고 되돌리지 않음), 같은 프레임 두 키 = 불연속 [docs 6.3, engine 05 §3.7].
 */
import type { AnimSpec, LayoutSpec, NodeSpec, Rgba, Spec } from './types';

export interface NodeState {
  spec: NodeSpec;
  v: boolean;
  t: [number, number];
  r: number;
  s: [number, number];
  z: [number, number];
  a: number;
  vc: Rgba[];
  /** 그림 UV(덮어쓰기 가능) */
  uv: number[];
  children: number[];
}

export interface MatState {
  black: Rgba;
  white: Rgba;
  srt: { t: [number, number]; r: number; s: [number, number] }[];
}

/** 키 배열 [[프레임, 값, 기울기]] 의 값 */
export function evalKeys(keys: number[][], f: number, step: boolean): number {
  if (keys.length === 0) return 0;
  if (step) {
    let v = keys[0][1];
    for (const k of keys) if (k[0] <= f) v = k[1];
    return v;
  }
  if (f <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (f >= last[0]) return last[1];
  for (let i = 0; i + 1 < keys.length; i++) {
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (f >= k0[0] && f <= k1[0]) {
      const d = k1[0] - k0[0];
      if (d === 0) return k1[1];
      const t = (f - k0[0]) / d;
      const t2 = t * t;
      const t3 = t2 * t;
      const s0 = k0[2] ?? 0;
      const s1 = k1[2] ?? 0;
      return (2 * t3 - 3 * t2 + 1) * k0[1] + (t3 - 2 * t2 + t) * d * s0 + (-2 * t3 + 3 * t2) * k1[1] + (t3 - t2) * d * s1;
    }
  }
  return last[1];
}

interface Player {
  name: string;
  anim: AnimSpec;
  frame: number;
  next?: string;
}

export class LayoutInst {
  readonly nodes: NodeState[];
  readonly mats: MatState[];
  readonly parts = new Map<number, LayoutInst>();
  readonly byName = new Map<string, number>();
  /** 텍스트 페인 문자열 */
  readonly texts = new Map<number, string>();
  /** 재질 텍스처 칸 바꾸기(얼굴·3D 렌더 타깃): 재질 번호 → 칸 → 텍스처 키 */
  readonly texOverride = new Map<number, Map<number, string>>();
  visible = true;
  private player: Player | null = null;

  constructor(
    readonly name: string,
    readonly spec: LayoutSpec,
    all: Spec,
  ) {
    this.nodes = spec.nodes.map((n) => ({
      spec: n,
      v: n.v,
      t: [n.t[0], n.t[1]],
      r: n.r,
      s: [n.s[0], n.s[1]],
      z: [n.z[0], n.z[1]],
      a: n.a,
      vc: (n.vc ?? [
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
      ]).map((c) => [...c] as Rgba),
      uv: n.uv ?? [0, 0, 1, 0, 0, 1, 1, 1],
      children: [],
    }));
    this.nodes.forEach((n, i) => {
      if (n.spec.p >= 0) this.nodes[n.spec.p].children.push(i);
      this.byName.set(n.spec.n, i);
      if (n.spec.k === 'txt' && n.spec.txt?.text) this.texts.set(i, n.spec.txt.text);
    });
    this.mats = spec.mats.map((m) => ({ black: [...m.black] as Rgba, white: [...m.white] as Rgba, srt: m.srt.map((s) => ({ t: [...s.t] as [number, number], r: s.r, s: [...s.s] as [number, number] })) }));
    this.nodes.forEach((n, i) => {
      if (n.spec.k !== 'part' || !n.spec.part) return;
      const ls = all.layouts[n.spec.part];
      if (!ls) return;
      const inst = new LayoutInst(n.spec.part, ls, all);
      for (const o of n.spec.ov ?? []) {
        const j = inst.byName.get(o.n);
        if (j === undefined) continue;
        if (o.vis !== undefined) inst.nodes[j].v = o.vis;
        if (o.vc) inst.nodes[j].vc = o.vc.map((c) => [...c] as Rgba);
        if (o.t) inst.nodes[j].t = [o.t[0], o.t[1]];
        if (o.s) inst.nodes[j].s = [o.s[0], o.s[1]];
        if (o.z) inst.nodes[j].z = [o.z[0], o.z[1]];
      }
      this.parts.set(i, inst);
    });
  }

  /** 'a/b/c' 경로(부품 이름/페인 이름)로 노드 찾기 → [인스턴스, 노드 번호] */
  find(path: string): [LayoutInst, number] | null {
    const segs = path.split('/');
    let inst: LayoutInst = this;
    for (let i = 0; i < segs.length; i++) {
      const j = inst.byName.get(segs[i]);
      if (j === undefined) return null;
      if (i === segs.length - 1) return [inst, j];
      const p = inst.parts.get(j);
      if (!p) return null;
      inst = p;
    }
    return null;
  }

  part(path: string): LayoutInst | null {
    const f = this.find(path);
    return f ? (f[0].parts.get(f[1]) ?? null) : null;
  }

  setVisible(path: string, v: boolean): void {
    const f = this.find(path);
    if (f) f[0].nodes[f[1]].v = v;
  }

  setText(path: string, s: string): void {
    const f = this.find(path);
    if (f) f[0].texts.set(f[1], s);
  }

  /** 노드의 재질 칸 텍스처를 바꾼다 */
  setTexture(path: string, slot: number, key: string): void {
    const f = this.find(path);
    if (!f) return;
    const m = f[0].nodes[f[1]].spec.m;
    if (m === undefined || m < 0) return;
    let mm = f[0].texOverride.get(m);
    if (!mm) f[0].texOverride.set(m, (mm = new Map()));
    mm.set(slot, key);
  }

  /** 노드 재질의 텍스처 SRT 이동(칸 0) */
  setMatSrtT(path: string, tx: number, ty: number): void {
    const f = this.find(path);
    if (!f) return;
    const m = f[0].nodes[f[1]].spec.m;
    const st = m !== undefined && m >= 0 ? f[0].mats[m].srt[0] : undefined;
    if (st) st.t = [tx, ty];
  }

  /** 노드 재질의 white 색 */
  setMatWhite(path: string, c: Rgba): void {
    const f = this.find(path);
    if (!f) return;
    const m = f[0].nodes[f[1]].spec.m;
    if (m !== undefined && m >= 0) f[0].mats[m].white = [...c] as Rgba;
  }

  hasAnim(tag: string): boolean {
    return !!this.spec.anims[tag];
  }

  /** 레이아웃 애니 재생(태그). next = 끝나면 이어서 재생(원본 EnqueuePlay) */
  play(tag: string, next?: string): void {
    const a = this.spec.anims[tag];
    if (!a) {
      if (next && this.spec.anims[next]) this.play(next);
      return;
    }
    this.player = { name: tag, anim: a, frame: 0, next };
    this.apply();
  }

  get current(): string | null {
    return this.player?.name ?? null;
  }

  /** 지금 애니가 끝났는가(반복이 아니고 마지막 프레임에 닿음) */
  get done(): boolean {
    const p = this.player;
    return !p || (!p.anim.loop && p.frame >= p.anim.len && !p.next);
  }

  /** 1틱 진행 후 트랙 값을 쓴다. 부품도 함께 */
  update(frames = 1): void {
    const p = this.player;
    if (p) {
      p.frame += frames;
      const n = p.anim.len;
      if (p.anim.loop) {
        if (n > 0) p.frame = ((p.frame % n) + n) % n;
      } else if (p.frame >= n) {
        if (p.next) {
          const nx = p.next;
          this.play(nx);
        } else p.frame = n;
      }
      this.apply();
    }
    for (const part of this.parts.values()) part.update(frames);
  }

  private apply(): void {
    const p = this.player;
    if (!p) return;
    const f = p.frame;
    for (const tr of p.anim.tracks) {
      const v = evalKeys(tr.keys, f, tr.step);
      if (tr.node !== undefined) {
        const n = this.nodes[tr.node];
        switch (tr.prop) {
          case 'tx':
            n.t[0] = v;
            break;
          case 'ty':
            n.t[1] = v;
            break;
          case 'rz':
            n.r = v;
            break;
          case 'sx':
            n.s[0] = v;
            break;
          case 'sy':
            n.s[1] = v;
            break;
          case 'w':
            n.z[0] = v;
            break;
          case 'h':
            n.z[1] = v;
            break;
          case 'a':
            n.a = Math.max(0, Math.min(255, Math.round(v)));
            break;
          case 'vis':
            n.v = Math.round(v) !== 0;
            break;
          default:
            if (tr.prop.startsWith('vc')) {
              const k = Number(tr.prop.slice(2));
              n.vc[k >> 2][k & 3] = Math.max(0, Math.min(255, Math.round(v)));
            }
        }
      } else if (tr.mat !== undefined) {
        const m = this.mats[tr.mat];
        if (tr.prop.startsWith('blk')) m.black[Number(tr.prop.slice(3))] = Math.max(0, Math.min(255, Math.round(v)));
        else if (tr.prop.startsWith('wht')) m.white[Number(tr.prop.slice(3))] = Math.max(0, Math.min(255, Math.round(v)));
        else if (tr.prop.startsWith('srt')) {
          const [i, k] = tr.prop.slice(3).split('.').map(Number);
          const s = m.srt[i];
          if (!s) continue;
          if (k < 2) s.t[k] = v;
          else if (k === 2) s.r = v;
          else s.s[k - 3] = v;
        }
      }
    }
  }
}
