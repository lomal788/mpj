/**
 * 대기실 멤버 카드 — bq::ComUiCard·ComUiCardViewer(main) + menu00 카드 람다(@0x7100060a40 방장·@0x7100061360 손님).
 * 근거: docs/shell/online.md 5.8 (C analysis/decomp/plaza_main_card.c·plaza_main_card2.c·plaza_main_cardviewer_upd.c·plaza_menu00_lobby.c).
 * 상태만(LayoutInst 를 직접 바꾼다). 에셋 assets/plaza/ui/plaza_card.json(tools/analysis/plaza_card_assets.py).
 */
import type { LayoutInst } from '@game/lib/layout';
import { MgmGuide, plainText, type MgmDrawHost } from '@app/common/ui';
import type { CardData } from '@app/common/net/protocol/types';

export const PLAZA_CARD_PART = '../plaza/ui/plaza_card.json';

export interface PlazaCardExtra {
  /** cardDesignList 배열 번호(CardDesignID) → bgTextureName 텍스처 키 [데이터] */
  designs: string[];
  ranks: string[];
  texts: Record<string, string>;
}

/** 입력 비트(bex) [판독 @0x7100337b88] */
export const CARD_BTN = { B: 0x2, LEFT: 0x10100, RIGHT: 0x40200, OPEN: 0x3000 } as const;
/** 스티커 칸 수 [판독 FUN_71003371d0]. 스티커 그림(cardStickerList)은 변환하지 않아 칸을 늘 숨긴다 — 저장 데이터 없는 카드는 스티커가 없다 [설계] */
export const CARD_STICKERS = 10;
/** ComUiCardViewer 그리기 순위(menu00 생성) [판독] */
export const CARD_PRIORITY = 0x8400;

export type CardEvent = { t: 'se'; label: string } | { t: 'vib'; label: string };

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ComUiCard + ComUiCardViewer. st = +0x38(−1 숨김·0 in·1 대기·2 out) */
export class CardViewer {
  readonly inst: LayoutInst;
  readonly guide: MgmGuide;
  st = -1;
  cards: CardData[] = [];
  /** +0x40 */
  index = 0;
  /** +0x60 보이는 카드 id */
  shown: string | null = null;
  /** +0x70 안내 켬(menu00 = 1) */
  guideOn = true;

  constructor(
    private readonly host: MgmDrawHost,
    private readonly extra: PlazaCardExtra,
  ) {
    this.inst = host.layout('sys_card_base_00');
    this.inst.visible = false;
    this.inst.setVisible('x_parts_cursor', false);
    this.setLabel('x_parts_status/x_text_time_00', 'mn03_card_ui_time_title');
    this.inst.part('x_parts_cursor')?.play('normal');
    this.guide = new MgmGuide(host, 0x11, 'sys_ctrl_back');
  }

  private text(label: string, ins: Record<string, string | number> = {}): string {
    const texts = this.host.spec.texts;
    return plainText(texts[label] ?? '', texts, ins);
  }

  private setLabel(path: string, label: string, ins: Record<string, string | number> = {}): void {
    this.inst.setText(path, this.text(label, ins));
  }

  /** ClearCardData */
  clear(): void {
    this.cards = [];
  }

  /** AddCardData(카드, false): id 없음이면 넣지 않고, 같은 id 면 덮어쓴다 [판독 @0x7100338070] */
  add(c: CardData): void {
    if (!c.id) return;
    const i = this.cards.findIndex((x) => x.id === c.id);
    if (i >= 0) this.cards[i] = c;
    else this.cards.push(c);
  }

  /** Start(i) [판독 @0x7100337f90] */
  start(i = 0): void {
    if (this.cards.length === 0) return;
    this.index = i >= 0 && i < this.cards.length ? i : 0;
    const c = this.cards[this.index];
    this.shown = c.id;
    this.setCardData(c);
    if (this.st >= 2 || this.st < 0) {
      this.inst.play('in');
      this.st = 0;
      this.inst.visible = true;
    }
  }

  /** ComUiCard::Out(false) */
  out(): void {
    if (this.st === -1 || this.st === 2) return;
    this.st = 2;
    this.inst.play('out');
  }

  get finished(): boolean {
    return this.st < 0;
  }

  get open(): boolean {
    return this.st >= 0;
  }

  /** ComUiCard::SetCardData [판독 @0x7100336ba4·FUN_7100336ca0·FUN_71003371d0·SetDesign] */
  setCardData(c: CardData): void {
    const rank = this.extra.ranks.includes(`sys_icon_rank_${pad2(c.rank)}^q`) ? `sys_icon_rank_${pad2(c.rank)}^q` : 'sys_icon_rank_00^q';
    this.inst.setTexture('x_parts_status/x_parts_rank/x_icon_rank', 0, rank);
    this.setLabel('x_parts_status/x_text_title', 'mn03_card_ui_achieve', { Text0: 'im_achieve401_name' });
    this.inst.setText('x_parts_status/x_text_username', this.text('mn03_card_ui_name', { Text0: c.name }));
    const timed = c.time > 0;
    this.inst.setVisible('x_parts_status/x_text_time_00', timed);
    this.inst.setVisible('x_parts_status/x_text_time_01', timed);
    if (timed) this.setLabel('x_parts_status/x_text_time_01', 'mn03_card_ui_time', { Number0: Math.floor(c.time / 3600), Number1: Math.floor(c.time / 60) - Math.floor(c.time / 3600) * 60 });
    const tex = this.extra.designs[c.design] ?? this.extra.designs[0];
    if (tex) this.inst.setTexture('x_parts_card/x_card', 0, tex);
    for (let i = 0; i < CARD_STICKERS; i++) this.inst.setVisible(`x_parts_sticker_${pad2(i)}`, false);
  }

  /** 한 프레임: 수명 → 입력(조작 플레이어 트리거) [판독 @0x7100337b88] + 안내(@0x7100337980) */
  update(df: number, trig: number, ev: CardEvent[]): void {
    this.inst.update(df);
    if (this.st === 2 && this.inst.done) {
      this.inst.visible = false;
      this.st = -1;
    } else if (this.st === 0 && this.inst.done) {
      this.inst.play('normal');
      this.st = 1;
    }
    if (this.st === 1) this.input(trig, ev);
    if (this.st === 1 && this.guideOn) this.guide.in();
    else this.guide.out();
    this.guide.update();
  }

  private input(trig: number, ev: CardEvent[]): void {
    const n = this.cards.length;
    if (n === 0) {
      this.out();
      return;
    }
    if (trig & CARD_BTN.B) {
      ev.push({ t: 'se', label: 'SQ_SE_SYS_CANCEL_S' });
      this.out();
      return;
    }
    let i = this.index;
    if (n < 2) {
      this.inst.setVisible('x_parts_cursor', false);
      i = 0;
    } else {
      this.inst.setVisible('x_parts_cursor', true);
      if (trig & CARD_BTN.LEFT) {
        ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR_S' }, { t: 'vib', label: 'bv_vib_sys_cursor_s' });
        i = (i + n - 1) % n;
      } else if (trig & CARD_BTN.RIGHT) {
        ev.push({ t: 'se', label: 'SQ_SE_SYS_CURSOR_S' }, { t: 'vib', label: 'bv_vib_sys_cursor_s' });
        i = (i + 1) % n;
      }
      i = Math.max(0, Math.min(n - 1, i));
    }
    this.index = i;
    const c = this.cards[i];
    if (c.id !== this.shown) {
      this.setCardData(c);
      this.shown = c.id;
    }
  }
}
