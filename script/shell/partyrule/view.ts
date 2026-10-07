/**
 * 그리기 — 판 사건(PEvent)을 명세 레이아웃(assets/partyrule/partyrule.json + 공용 spec.json)에 옮기고 그린다. 근거: docs/shell/partyrule.md 6·7·9.
 * 그리기 순서: 제목 띠·보드 이름 띠·판·안내(원본 그리기 순위 0x200·0x500, 메시지 창 0x9200 은 화면이 마지막에 그린다).
 */
import { nodeMatrix } from '../charselect/render2d';
import type { LayoutInst } from '../charselect/scene2d';
import { alignPanes, type AlignParams } from '../mgmcommon/alignment';
import { MgmGuide } from '../mgmcommon/guides';
import type { Mat3 } from '../mgmcommon/itemLayout';
import { plainText } from '../mgmcommon/text';
import type { MgmDrawHost } from '../mgmcommon/window';
import type { PEvent, Scr } from './types';

const LAYOUT: Record<Scr, string> = {
  member: 'mn01_base_set_member_03',
  check: 'mn01_base_check_01',
  rule: 'mn01_base_rule_01',
  title: 'mn01_text_modename_01',
  telop: 'mn01_text_modename_02',
};
const ORDER: Scr[] = ['title', 'telop', 'member', 'check', 'rule'];
/** 제목 띠는 그리기 순위 0x9300(생성자 @0x71000adb38) > 메시지 창 0x9200 → 메시지 창 뒤(위)에 그린다 */
const UNDER: Scr[] = ['telop', 'member', 'check', 'rule'];
/** ali1 추가 바이트(partyrule.md 6.1): x_alignment_list 00000000 000082c2 00 01 = 수직 위 gap −65 */
const ALIGN: Record<string, AlignParams> = {
  'x_parts_list/x_alignment_list': { horizontal: false, kind: 0, gap: -65, stretch: false },
};
/** 안내 Constraint 페인(ComUiGuide00::SetConstraint) */
const GUIDE_POS: Partial<Record<Scr, string>> = { member: 'x_parts_list/x_guide_pos_00', rule: 'x_parts_win/x_guide_pos_00' };

export class PartyView {
  readonly inst: Record<Scr, LayoutInst>;
  private readonly guides = new Map<Scr, MgmGuide>();
  /** Play2D 위치(화면 x 0..1920) 찾기에 쓴다 */
  readonly log: PEvent[] = [];

  constructor(
    private readonly host: MgmDrawHost,
    private readonly onSe?: (label: string, x?: number) => void,
    private readonly onNote?: (text: string) => void,
  ) {
    this.inst = Object.fromEntries(ORDER.map((s) => [s, host.layout(LAYOUT[s])])) as Record<Scr, LayoutInst>;
  }

  private loops(inst: LayoutInst | null): boolean {
    if (!inst) return true;
    const cur = inst.current;
    return !!cur && !!inst.spec.anims[cur]?.loop;
  }

  /** 애니 끝 = 재생 중 아님·반복 애니·끝 프레임(원본 IsEndAnim || 반복 [추정, partyrule.md 5.2]) */
  done(scr: Scr, path: string): boolean {
    const root = this.inst[scr];
    const inst = path === '' ? root : root.part(path);
    if (!inst) return true;
    return inst.done || this.loops(inst);
  }

  push(e: PEvent): void {
    this.log.push(e);
    if (this.log.length > 400) this.log.shift();
    this.apply(e);
  }

  private apply(e: PEvent): void {
    switch (e.t) {
      case 'show': {
        this.inst[e.scr].visible = e.v;
        if (!e.v) this.guides.get(e.scr)?.out();
        break;
      }
      case 'play': {
        const inst = e.path === '' ? this.inst[e.scr] : this.inst[e.scr].part(e.path);
        inst?.play(e.tag, e.next);
        break;
      }
      case 'vis':
        this.inst[e.scr].setVisible(e.path, e.v);
        break;
      case 'text': {
        const texts = this.host.spec.texts;
        this.inst[e.scr].setText(e.path, plainText(texts[e.label] ?? e.label, texts, e.ins ?? {}));
        break;
      }
      case 'tex':
        this.inst[e.scr].setTexture(e.path, 0, e.key);
        break;
      case 'iconRow': {
        const f = this.inst[e.scr].find(e.path);
        if (f) {
          const v = e.row * 0.25;
          f[0].nodes[f[1]].uv = [0, v, 1, v, 0, v + 0.25, 1, v + 0.25];
        }
        break;
      }
      case 'face':
        this.inst[e.scr].setTexture(`${e.path}/x_face_pc128`, 1, `face_128_${e.chara}^u`);
        break;
      case 'align': {
        const p = ALIGN[e.path];
        if (p) alignPanes(this.inst[e.scr], e.path, p);
        break;
      }
      case 'guide': {
        const old = this.guides.get(e.scr);
        if (!e.label) {
          old?.out();
          break;
        }
        const g = new MgmGuide(this.host, 17, e.label);
        g.in(false);
        this.guides.set(e.scr, g);
        break;
      }
      case 'se': {
        let x: number | undefined;
        if (e.scr && e.path) {
          const m = nodeMatrix(this.inst[e.scr], e.path);
          if (m) x = m[2] + 960;
        }
        this.onSe?.(e.label, x);
        break;
      }
      case 'note':
        this.onNote?.(e.text);
        break;
      default:
        break;
    }
  }

  /** 한 틱: 레이아웃 애니(부품 포함)·안내 */
  update(): void {
    for (const s of ORDER) this.inst[s].update(1);
    for (const g of this.guides.values()) g.update();
  }

  private guideBase(scr: Scr): Mat3 | null {
    const p = GUIDE_POS[scr];
    if (!p) return null;
    const m = nodeMatrix(this.inst[scr], p) as Mat3 | null;
    return m ? [1, 0, m[2], 0, 1, m[5]] : null;
  }

  /** 메시지 창 아래 층(띠·판·안내) */
  draw(): void {
    for (const s of UNDER) {
      const inst = this.inst[s];
      if (!inst.visible) continue;
      this.host.draw(inst);
    }
    for (const [s, g] of this.guides) {
      if (!g.inst.visible || !this.inst[s].visible) continue;
      const b = this.guideBase(s);
      if (b) this.host.draw(g.inst, b);
    }
  }

  /** 메시지 창 위 층(제목 띠) */
  drawTop(): void {
    if (this.inst.title.visible) this.host.draw(this.inst.title);
  }
}
