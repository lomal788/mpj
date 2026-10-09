/**
 * 미니게임 항구 프리 플레이 공용 계약 — 장면 전환(call/return)·저장소(세이브·세션 Work). docs/shell/mgm_common.md 9.6.
 * 근거: mgmet_flow.md 3·8절(시작 지점·첫 설명·opSkip), mgmet_ruleconfig.md 8.1(규칙 캐시), mgm01_freeplay.md 6.6·8.3·8.4(결과 고리·NEW·즐겨찾기).
 */

export interface SceneRouter {
  /** RequestCallScene(name): 부모는 버리고 자식을 만든다 [설계] */
  call(name: string, args?: unknown): void;
  /** ReturnScene: 자식을 버리고 부모를 새로 만든다 [설계] */
  ret(result?: unknown): void;
  readonly current: string | null;
  readonly depth: number;
}

export interface MgmSceneInstance {
  step(): void;
  render(): void;
  dispose(): void;
}

export interface MgmSceneContext {
  router: SceneRouter;
  save: MgmSave;
  work: MgmWork;
}

export type MgmSceneFactory = (name: string, ctx: MgmSceneContext, args: unknown, returned?: unknown) => Promise<MgmSceneInstance>;

type Pending = { kind: 'call'; name: string; args: unknown } | { kind: 'ret'; result: unknown };

/** 기본 구현: 이름 스택. 요청은 다음 step() 경계에서 처리한다 */
export class SceneStack implements SceneRouter {
  private stack: { name: string; args: unknown }[] = [];
  private inst: MgmSceneInstance | null = null;
  private pending: Pending | null = null;
  private loading = false;
  readonly ctx: MgmSceneContext;

  constructor(
    private readonly factory: MgmSceneFactory,
    save: MgmSave,
    work: MgmWork,
    private readonly onEmpty?: (result: unknown) => void,
  ) {
    this.ctx = { router: this, save, work };
  }

  get current(): string | null {
    return this.stack.length ? this.stack[this.stack.length - 1].name : null;
  }

  get depth(): number {
    return this.stack.length;
  }

  get scene(): MgmSceneInstance | null {
    return this.inst;
  }

  async start(name: string, args?: unknown): Promise<void> {
    this.stack = [{ name, args }];
    await this.make(undefined);
  }

  call(name: string, args?: unknown): void {
    this.pending = { kind: 'call', name, args };
  }

  ret(result?: unknown): void {
    this.pending = { kind: 'ret', result };
  }

  private async make(returned: unknown): Promise<void> {
    const top = this.stack[this.stack.length - 1];
    this.loading = true;
    try {
      this.inst = await this.factory(top.name, this.ctx, top.args, returned);
    } finally {
      this.loading = false;
    }
  }

  step(): void {
    if (this.loading) return;
    const p = this.pending;
    if (p) {
      this.pending = null;
      this.inst?.dispose();
      this.inst = null;
      if (p.kind === 'call') {
        this.stack.push({ name: p.name, args: p.args });
        void this.make(undefined);
      } else {
        this.stack.pop();
        if (this.stack.length) void this.make(p.result);
        else this.onEmpty?.(p.result);
      }
      return;
    }
    this.inst?.step();
  }

  render(): void {
    if (!this.loading) this.inst?.render();
  }

  dispose(): void {
    this.inst?.dispose();
    this.inst = null;
    this.stack = [];
  }
}

/** 세이브 MinigameModeData 선두 u32 비트(mgmet_flow.md 8절, mgm01_freeplay.md 8.4) */
export const MODE_FLAG = { OP_SKIP: 0x1, MGM01_SETUP: 0x4, FIRST_HOWTO_MGM01: 0x8 } as const;
/** 세이브 MinigameData +4 비트 */
export const MG_FLAG = { NEW: 0x1, FAVORITE: 0x4 } as const;
/** 미니게임 ID 범위(mgmet @0x710005b0d0 의 0..151) */
export const MG_ID_COUNT = 152;

export interface MinigameSaveEntry {
  /** 선두 u16 — 0 이 아니면 "플레이함"으로 센다 [판독], 뜻(횟수 등) [추정] */
  head: number;
  /** +4 비트(MG_FLAG) */
  flags: number;
}

/** 영구 저장(원본 SaveData, 조작 플레이어 프로필) */
export interface MgmSave {
  modeFlags: number;
  minigame(id: number): MinigameSaveEntry;
  setMinigame(id: number, e: MinigameSaveEntry): void;
  /** SaveRequest — 요청만. 기록은 앱 공용 저장의 요청 수명이 모아서 한 번 한다(docs/engine/16_save.md) */
  requestSave(): void;
}

/** 규칙 캐시(MinigameModeWork +0x764, mgmet_ruleconfig.md 8.1) — 값은 각 버튼 index */
export interface RuleCache {
  valid: boolean;
  cpu: number;
  vs: number;
  star: number;
  round: number;
  explain: number;
  experience: number;
}

/** 결과 고리 한 칸(mgm01_freeplay.md 6.6·8.3): ID·판정·4인 결과 원시 바이트 */
export interface MgResultEntry {
  id: number;
  judge: number;
  results: [number, number, number, number];
}

/** 세션 작업 데이터(원본 MinigameModeWork, 앱이 켜져 있는 동안) */
export interface MgmWork {
  /** Work +0x4bc 시작 지점(mgm01 준비 1, ExitFlow 7) */
  entranceStartPoint: number;
  rule: RuleCache;
  /** flag::Set 번호 집합(1 endless, 4 설명 생략 조건, 6 체감, 0x3c 등) */
  flags: Set<number>;
  /** Work+0 Round */
  round: number;
  /** 결과 100칸 고리(앞이 오래된 것) */
  results: MgResultEntry[];
  /** ID → Work new/unlock/favorite */
  mg: Map<number, { isNew: boolean; unlock: boolean; favorite: boolean }>;
  /** 프리 플레이 선택 복원(ModeData enum/index/ID/favorite 기원) */
  freeplaySelect: { filter: number; index: number; id: number; fromFavorite: boolean } | null;
}

export const RESULT_RING = 100;

export function createWork(): MgmWork {
  return {
    entranceStartPoint: 0,
    rule: { valid: false, cpu: 0, vs: 0, star: 0, round: 0, explain: 0, experience: 0 },
    flags: new Set(),
    round: 0,
    results: [],
    mg: new Map(),
    freeplaySelect: null,
  };
}

/** 결과 고리에 넣기(100칸 넘으면 가장 오래된 것 버림) */
export function pushResult(work: MgmWork, e: MgResultEntry): void {
  work.results.push(e);
  while (work.results.length > RESULT_RING) work.results.shift();
}

/**
 * 저장 칸 보기 — MemorySave 가 실제로 읽고 쓰는 곳. 앱 공용 저장(view/save.ts, docs/engine/16_save.md §7)이 모드 섹션·요청 수명을 꽂는다.
 * 셸은 저장 모듈을 import 하지 않고 이 모양만 안다.
 */
export interface MgmSaveBacking {
  getModeFlags(): number;
  setModeFlags(v: number): void;
  minigame(id: number): MinigameSaveEntry | undefined;
  setMinigame(id: number, e: MinigameSaveEntry): void;
  entries(): Iterable<[number, MinigameSaveEntry]>;
  request(): void;
  isProcessing(): boolean;
}

function memoryBacking(): MgmSaveBacking {
  let flags = 0;
  const mg = new Map<number, MinigameSaveEntry>();
  return {
    getModeFlags: () => flags,
    setModeFlags: (v) => {
      flags = v;
    },
    minigame: (id) => mg.get(id),
    setMinigame: (id, e) => {
      mg.set(id, e);
    },
    entries: () => mg.entries(),
    request: () => {},
    isProcessing: () => false,
  };
}

/** 기본 저장 구현: 저장 칸(MgmSaveBacking)을 보는 MgmSave + JSON 직렬화. 영구 매체는 앱 공용 저장이 칸으로 꽂는다(없으면 메모리) */
export class MemorySave implements MgmSave {
  saveRequests = 0;
  onSave?: (json: string) => void;

  constructor(private readonly backing: MgmSaveBacking = memoryBacking()) {}

  get modeFlags(): number {
    return this.backing.getModeFlags();
  }

  set modeFlags(v: number) {
    this.backing.setModeFlags(v >>> 0);
  }

  minigame(id: number): MinigameSaveEntry {
    return { ...(this.backing.minigame(id) ?? { head: 0, flags: 0 }) };
  }

  setMinigame(id: number, e: MinigameSaveEntry): void {
    this.backing.setMinigame(id, { head: e.head & 0xffff, flags: e.flags & 0xff });
  }

  requestSave(): void {
    this.saveRequests++;
    this.backing.request();
    this.onSave?.(this.toJSON());
  }

  isProcessing(): boolean {
    return this.backing.isProcessing();
  }

  toJSON(): string {
    return JSON.stringify({ modeFlags: this.modeFlags, mg: [...this.backing.entries()] });
  }

  static fromJSON(s: string | null | undefined): MemorySave {
    const m = new MemorySave();
    if (!s) return m;
    try {
      const d = JSON.parse(s) as { modeFlags?: number; mg?: [number, MinigameSaveEntry][] };
      m.modeFlags = d.modeFlags ?? 0;
      for (const [id, e] of d.mg ?? []) m.setMinigame(id, e);
    } catch {
      return new MemorySave();
    }
    return m;
  }
}

/** 플레이한 미니게임 수(mgmet SetMgm01PlayedMinigameData: available 이고 선두 u16 ≠ 0) */
export function playedCount(save: MgmSave, availableIds: Iterable<number>): number {
  let n = 0;
  for (const id of availableIds) if (save.minigame(id).head !== 0) n++;
  return n;
}
