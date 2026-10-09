/**
 * 하단 파티 줄 menu00::ComUiPlayerStatusMgr — docs/shell/plaza_3d.md §5.1 ①.
 * Mgr = mncom_base_status_00(in/normal/out), 사람 칸 = mncom_status_00(이름·얼굴), 빈 칸 = mncom_status_01.
 * 그리기 없이 상태만(LayoutInst 를 직접 바꾼다). 그리기는 view 가 slotBase() 로 칸에 붙여서 한다.
 */
import { nodeMatrix } from '@app/scene/menu/charselect/render2d';
import type { LayoutInst } from '@app/scene/menu/charselect/scene2d';
import { IDENTITY, mul, plainText, type Mat3, type MgmDrawHost } from '@app/common/ui';
import { faceKey } from '@app/scene/menu/online';
import { UI_LAYOUT } from './data';

/** SetPlayers 입력 한 명. 오프라인 = PlayerWork(PlayerID 순), 온라인 = 세션 멤버(어댑터 순서) */
export interface StatusPlayer {
  /** 오프라인 PlayerID, 원격이면 −1 */
  pid: number;
  /** 원격 구분 키(스테이션). 오프라인은 'p<pid>' */
  key: string;
  name: string;
  /** PlayerCharacterID, 모르면 −1(온라인 = 데이터 아직 못 받음) */
  chara: number;
  /** PlayerType 0 */
  human: boolean;
  local: boolean;
}

/** 사람 칸(ComUiPlayerStatus) — 이름표 세터·얼굴 세터 [판독 @0x7100080110·SetCharacterId @0x7100080444] */
export class PlayerStatus {
  readonly inst: LayoutInst;
  /** 0 보임(In), −1 숨김 */
  st = -1;
  chara = -2;
  constructor(
    host: MgmDrawHost,
    readonly key: string,
    readonly pid: number,
    name: string,
    chara: number,
  ) {
    this.inst = host.layout(UI_LAYOUT.status);
    this.inst.visible = false;
    const shown = name !== '' ? name : plainText(host.spec.texts['im_guest00_name'] ?? '', host.spec.texts);
    for (const t of ['x_text_00', 'x_text_01']) this.inst.setText(`x_parts_username/${t}`, shown);
    this.name = shown;
    this.setCharacterId(chara);
  }

  readonly name: string;

  setCharacterId(c: number): void {
    this.chara = c;
    if (c < 0 || c > 0x15) {
      this.inst.setVisible('x_face', false);
      return;
    }
    this.inst.setVisible('x_face', true);
    this.inst.setTexture('x_face/x_face_pc64', 1, faceKey(c));
  }

  in(): void {
    this.inst.visible = true;
    this.st = 0;
  }

  out(): void {
    this.inst.visible = false;
    this.st = -1;
  }
}

/** 빈 칸(ComUiPlayerStatusEmpty) — 애니 없음, In = 보임 [판독 @0x710008053c] */
export class PlayerStatusEmpty {
  readonly inst: LayoutInst;
  st = -1;
  constructor(host: MgmDrawHost) {
    this.inst = host.layout(UI_LAYOUT.empty);
    this.inst.visible = false;
  }
  in(): void {
    this.inst.visible = true;
    this.st = 0;
  }
  out(): void {
    this.inst.visible = false;
    this.st = -1;
  }
}

export interface StatusChange {
  added: PlayerStatus[];
  removed: PlayerStatus[];
}

/** menu00::ComUiPlayerStatusMgr [판독 Start @0x7100082fb0·SetPlayers @0x7100080a30·Update @0x71000808a0] */
export class PlayerStatusMgr {
  readonly root: LayoutInst;
  /** 4.1 공통 수명: −1 숨김, 0 in, 1 대기, 2 out */
  st = -1;
  /** +0x3c: 8인 방이면 1 */
  eight = 0;
  empties: PlayerStatusEmpty[] = [];
  /** 칸 번호 → 사람 칸(없으면 빈 칸 보임) */
  readonly bySlot = new Map<number, PlayerStatus>();
  /** 키 → 사람 칸(오프라인 PlayerID map +0x58 / 온라인 NetworkPlayerInfo map +0x70) */
  readonly byKey = new Map<string, PlayerStatus>();
  online = false;
  private players: () => readonly StatusPlayer[] = () => [];
  /** 사람 칸이 생기고 없어질 때(스탬프 Add·Delete) */
  onChange: ((c: StatusChange) => void) | null = null;

  constructor(private readonly host: MgmDrawHost) {
    this.root = host.layout(UI_LAYOUT.statusBase);
    this.root.visible = false;
  }

  get slots(): number {
    return this.eight ? 8 : 4;
  }

  /** 칸 페인 이름 x_null_status_{i+1}P_{4|8} [데이터, 칸 순서 대응 추정] */
  slotPane(i: number): string {
    return `x_null_status_${i + 1}P_${this.slots}`;
  }

  /** 칸 i 의 화면 행렬(SetConstraint) */
  slotBase(i: number): Mat3 {
    return (nodeMatrix(this.root, this.slotPane(i)) as Mat3 | null) ?? IDENTITY;
  }

  /** 사람 칸 안의 페인(x_null_stamp·x_null_list·x_null_guide) 화면 행렬 */
  paneBase(s: PlayerStatus, pane: string): Mat3 | null {
    const slot = [...this.bySlot.entries()].find(([, v]) => v === s)?.[0];
    if (slot === undefined) return null;
    const m = nodeMatrix(s.inst, pane) as Mat3 | null;
    return m ? mul(this.slotBase(slot), m) : null;
  }

  /** Start: 칸 수(8인 방 = 8) → 빈 칸 n 개 In → SetPlayers → Mgr "in" */
  start(eightRoom: boolean, online: boolean, players: () => readonly StatusPlayer[]): void {
    this.eight = online && eightRoom ? 1 : 0;
    this.online = online;
    this.players = players;
    for (const e of this.empties) e.out();
    this.empties = Array.from({ length: this.slots }, () => {
      const e = new PlayerStatusEmpty(this.host);
      e.in();
      return e;
    });
    this.setPlayers();
    if (this.st < 0 || this.st > 1) {
      this.root.visible = true;
      this.root.play('in');
      this.st = 0;
    }
  }

  /** Finish: "out"(UiStamp::Out 는 부르는 쪽) */
  finish(): void {
    if (this.st !== -1 && this.st !== 2) {
      this.st = 2;
      this.root.play('out');
    }
  }

  get finished(): boolean {
    return this.st < 0;
  }

  private remove(key: string, removed: PlayerStatus[]): void {
    const s = this.byKey.get(key);
    if (!s) return;
    s.out();
    this.byKey.delete(key);
    for (const [k, v] of this.bySlot) if (v === s) this.bySlot.delete(k);
    removed.push(s);
  }

  /** SetPlayers [판독 @0x7100080a30] */
  setPlayers(): void {
    const ps = this.players();
    const added: PlayerStatus[] = [];
    const removed: PlayerStatus[] = [];
    const n = this.slots;
    if (!this.online) {
      for (const k of [...this.byKey.keys()]) if (!k.startsWith('p')) this.remove(k, removed);
      for (let i = 0; i < n; i++) {
        const p = ps.find((x) => x.pid === i);
        if (!p || !p.human) {
          this.empties[i]?.in();
          this.remove(`p${i}`, removed);
          continue;
        }
        this.empties[i]?.out();
        let s = this.byKey.get(p.key);
        if (!s) {
          s = new PlayerStatus(this.host, p.key, p.pid, p.name, p.chara);
          this.byKey.set(p.key, s);
          added.push(s);
        }
        this.bySlot.set(i, s);
        s.in();
      }
    } else {
      for (const k of [...this.byKey.keys()]) if (!ps.some((p) => p.key === k && p.chara >= 0)) this.remove(k, removed);
      this.bySlot.clear();
      let slot = 0;
      for (const p of ps) {
        if (p.chara < 0) continue;
        if (slot >= n) break;
        this.empties[slot]?.out();
        let s = this.byKey.get(p.key);
        if (!s) {
          s = new PlayerStatus(this.host, p.key, p.local ? p.pid : -1, p.name, p.chara);
          this.byKey.set(p.key, s);
          added.push(s);
        } else if (s.chara !== p.chara) s.setCharacterId(p.chara);
        this.bySlot.set(slot, s);
        s.in();
        slot++;
      }
      for (let i = slot; i < n; i++) this.empties[i]?.in();
    }
    if ((added.length || removed.length) && this.onChange) this.onChange({ added, removed });
  }

  /** Update: in 끝 → normal(1), 1 동안 매 프레임 SetPlayers, out 끝 → 숨김(−1) */
  update(df: number): void {
    this.root.update(df);
    for (const e of this.empties) e.inst.update(df);
    for (const s of this.byKey.values()) s.inst.update(df);
    if (this.st === 2) {
      if (this.root.done) {
        this.root.visible = false;
        this.st = -1;
      }
    } else if (this.st === 1) this.setPlayers();
    else if (this.st === 0 && this.root.done) {
      this.root.play('normal');
      this.st = 1;
    }
  }

  /** 그리기 목록: [인스턴스, 행렬] (Mgr → 빈 칸 → 사람 칸, 원본 그리기 순위 0x700·0x701) */
  drawList(): [LayoutInst, Mat3][] {
    if (!this.root.visible) return [];
    const out: [LayoutInst, Mat3][] = [[this.root, IDENTITY]];
    this.empties.forEach((e, i) => {
      if (e.inst.visible) out.push([e.inst, this.slotBase(i)]);
    });
    for (const [i, s] of this.bySlot) if (s.inst.visible) out.push([s.inst, this.slotBase(i)]);
    return out;
  }
}
