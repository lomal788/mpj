/**
 * ui2d Alignment 계산(순수) — nn::ui2d::Alignment 의 dirty 소비 갱신 FUN_71014138ac 와 수평/수직 start·center·end·stretch 배치 (docs/shell/ui2d_alignment.md 3~6·9).
 * 입력 = 축·kind·gap·stretch·부모 축 길이·자식 측정 결과(extent·bias·gap·visible/ignore·원점) → 자식 축 위치·stretch 크기.
 * 레이아웃 적용 alignPanes 는 측정을 "크기 × 배율, 원점 비트로 bias" 로 환원한다(무회전·부모 원점 가운데 [근사, 4절 끝 "일반 변환에서는 저장 width 만 더하면 안 된다"]).
 */
import type { LayoutInst } from '@game/lib/layout';

export interface AlignParams {
  /** 축: true 수평(+0xdd bit1 = 0), false 수직 */
  horizontal: boolean;
  /** +0xd4: 0 left/top, 1 center, 2 right/bottom(≥3 도 end 갈래) */
  kind: number;
  /** +0xd8 기본 gap */
  gap: number;
  /** +0xdc */
  stretch: boolean;
}

export interface AlignChild {
  visible: boolean;
  /** alignment ignore 플래그 */
  ignore?: boolean;
  /** 측정 결과 extent, null = 측정 실패(후손 경계 없음 등) */
  extent: number | null;
  bias?: number;
  /** own gap 플래그가 있으면 그 값 */
  gap?: number;
  /** 축 원점: 수평 −1 왼·0 가운데·1 오른, 수직 1 위·0 가운데·−1 아래 */
  origin?: number;
  /** 지금 축 위치(계산에서 빠지면 그대로 남는다) */
  pos: number;
  /** 지금 축 크기(stretch 대상이 아니면 그대로) */
  size?: number;
}

export interface AlignOut {
  pos: number[];
  size: (number | undefined)[];
  /** 위치를 쓴 자식(transform dirty) */
  written: boolean[];
  total: number;
}

/** 6.2 고정 크기 + 6.3 stretch. 자식 순서 = 레이아웃 자식 목록 순서(end 는 역순) */
export function computeAlignment(p: AlignParams, axisSize: number, children: readonly AlignChild[]): AlignOut {
  const n = children.length;
  const pos = children.map((c) => c.pos);
  const size = children.map((c) => c.size);
  const written = children.map(() => false);
  const order = [...Array(n).keys()];
  if (p.kind >= 2) order.reverse();
  const direction = (p.horizontal ? 1 : -1) * (p.kind < 2 ? 1 : -1);
  const zeroed = new Set<number>();
  if (p.stretch && n > 0) {
    if (p.kind === 0) zeroed.add(n - 1);
    else if (p.kind === 1) {
      zeroed.add(0);
      zeroed.add(n - 1);
    } else zeroed.add(0);
  }
  const measure = (i: number): { extent: number; bias: number; gap: number } | null => {
    const c = children[i];
    if (!c.visible || c.ignore || c.extent === null) return null;
    if (zeroed.has(i)) return { extent: 0, bias: 0, gap: c.gap ?? p.gap };
    return { extent: c.extent, bias: c.bias ?? 0, gap: c.gap ?? p.gap };
  };
  let cursor = p.kind === 1 ? 0 : (-direction * axisSize) / 2;
  let total = 0;
  let first = true;
  let firstOk = -1;
  let lastOk = -1;
  for (const i of order) {
    const m = measure(i);
    if (!m) continue;
    const g = first ? 0 : m.gap;
    cursor += direction * g;
    pos[i] = cursor + (direction * m.extent) / 2 - m.bias;
    written[i] = true;
    cursor += direction * m.extent;
    total += g + m.extent;
    if (first) firstOk = i;
    lastOk = i;
    first = false;
  }
  if (p.kind === 1) {
    for (let i = 0; i < n; i++) {
      const c = children[i];
      if (c.visible && !c.ignore) {
        pos[i] -= (direction * total) / 2;
        written[i] = true;
      }
    }
  }
  if (p.stretch && lastOk >= 0) {
    const remaining = axisSize - total;
    const s = (i: number): number => (1 + direction * (children[i].origin ?? 0)) / 2;
    if (p.kind === 1) {
      size[firstOk] = remaining / 2;
      size[lastOk] = remaining / 2;
      pos[firstOk] += (direction * remaining * s(firstOk)) / 2;
      pos[lastOk] -= (direction * remaining * (1 - s(lastOk))) / 2;
    } else {
      size[lastOk] = remaining;
      pos[lastOk] += direction * remaining * s(lastOk);
    }
  }
  return { pos, size, written, total };
}

/**
 * 레이아웃 Alignment 페인 하나를 계산해 자식 위치(와 stretch 크기)를 쓴다. extent = 축 크기 × |배율|, bias = −원점 × extent/2.
 * 반환 = 자식 이름 → 축 위치(계산에 들어간 것만)
 */
export function alignPanes(inst: LayoutInst, path: string, p: AlignParams): Map<string, number> {
  const f = inst.find(path);
  const out = new Map<string, number>();
  if (!f) return out;
  const [li, ni] = f;
  const node = li.nodes[ni];
  const ax = p.horizontal ? 0 : 1;
  const kids = node.children.map((ci) => li.nodes[ci]);
  const children: AlignChild[] = kids.map((k) => {
    const ext = k.z[ax] * Math.abs(k.s[ax]);
    const o = k.spec.o[ax];
    return { visible: k.v, extent: ext, bias: (-o * ext) / 2, origin: o, pos: k.t[ax], size: k.z[ax] };
  });
  const r = computeAlignment(p, node.z[ax], children);
  kids.forEach((k, i) => {
    if (!r.written[i]) return;
    k.t[ax] = r.pos[i];
    const sz = r.size[i];
    if (sz !== undefined) k.z[ax] = sz;
    out.set(k.spec.n, r.pos[i]);
  });
  return out;
}
