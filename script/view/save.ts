/**
 * mpj 저장 연결 — 공용 코어(lib/save)·localStorage 어댑터(lib/save-localstorage) 위에 mpj 섹션(원본 칸 0 SystemData·MenuData·MinigameModeData·MinigameData
 * + 웹 실행 설정)을 등록하고, 옛 키 3개를 처음 한 번 옮기고, 앱 전체 싱글턴 appSave() 하나로 셸에 나눠 준다.
 * - MgmSave: appSave().mgm(MemorySave 하나, 허브·목록이 같은 것). 광장: appSave().plaza(PlazaSave). 한 판: mgRunSaveHooks(save, id).
 * - 메시지 속도: SystemData+0x74 를 모든 MessageWindow 의 원천으로(setMessageSpeedSource). 가이드 setter·SaveRequestFiber 대응 함수.
 * 계약·원본 근거: docs/engine/16_save.md. createMpjSave 는 DOM 없이 돈다(노드 시험 tools/test_save.ts).
 */
import { saveRequestFiber, SaveCore, type SaveSection, type SaveSections, type SaveStorage } from '@game/lib/save';
import { LocalStorageSave } from '@game/lib/save-localstorage';
import { MemorySave, MG_ID_COUNT, type MinigameSaveEntry } from '../shell/mgmcommon/contracts';
import { setMessageSpeedSource } from '../shell/mgmcommon/messageWindow';
import { commitPlayCount } from '../shell/mgm01/playResult';
import type { PlazaSave } from '../shell/plaza/types';

/** localStorage 키 하나 */
export const SAVE_KEY = 'mpj.save';
export const SAVE_FORMAT = 'mpj.save';
export const SAVE_VERSION = 1;
/** 옛 키(지우지 않는다, 16_save §5) */
export const LEGACY_KEYS = { prefs: 'jamboree-web/prefs', mgm01: 'mpj.mgm01.save', menuData0: 'mpj.plaza.menuData0' } as const;

export interface SystemSection {
  /** SystemData+0x74 원값: 0 보통(0.05 s)·1 즉시·2 느림(0.1 s) */
  messageSpeed: number;
}
export interface MenuSection {
  /** MenuData 켜진 비트 번호 */
  bits: number[];
}
export interface MinigameModeSection {
  /** MinigameModeData 선두 u32 */
  flags: number;
}
/** MinigameData: id → [head u16, flags u8] */
export type MinigameSection = Record<string, [number, number]>;
/** 웹 실행 패널(원본 없음) */
export type RunSection = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const u32 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v >>> 0 : 0);

const SYSTEM = {
  name: 'system',
  defaults: (): SystemSection => ({ messageSpeed: 0 }),
  normalize: (r: unknown): SystemSection => ({ messageSpeed: isObj(r) ? u32(r.messageSpeed) : 0 }),
};
const MENU = {
  name: 'menu',
  defaults: (): MenuSection => ({ bits: [] }),
  normalize: (r: unknown): MenuSection => ({
    bits: isObj(r) && Array.isArray(r.bits) ? [...new Set(r.bits.filter((b): b is number => Number.isInteger(b) && b >= 0 && b < 64))].sort((a, b) => a - b) : [],
  }),
};
const MODE = {
  name: 'minigameMode',
  defaults: (): MinigameModeSection => ({ flags: 0 }),
  normalize: (r: unknown): MinigameModeSection => ({ flags: isObj(r) ? u32(r.flags) : 0 }),
};
const MINIGAME = {
  name: 'minigame',
  defaults: (): MinigameSection => ({}),
  normalize: (r: unknown): MinigameSection => {
    const out: MinigameSection = {};
    if (!isObj(r)) return out;
    for (const [k, v] of Object.entries(r)) {
      const id = Number(k);
      if (!Number.isInteger(id) || id < 0 || id >= MG_ID_COUNT || !Array.isArray(v)) continue;
      const head = u32(v[0]) & 0xffff;
      const flags = u32(v[1]) & 0xff;
      if (head || flags) out[id] = [head, flags];
    }
    return out;
  },
};
const RUN = {
  name: 'run',
  defaults: (): RunSection => ({}),
  normalize: (r: unknown): RunSection => (isObj(r) ? { ...r } : {}),
};

/** 판 0(옛 키 글 그대로) → 1 */
function migrateLegacy(s: SaveSections): SaveSections {
  const parse = (t: unknown): unknown => {
    if (typeof t !== 'string') return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  const out: SaveSections = {};
  const prefs = parse(s.prefs);
  if (isObj(prefs)) out.run = prefs;
  const mg = parse(s.mgm01) as { modeFlags?: unknown; mg?: unknown } | null;
  if (isObj(mg)) {
    out.minigameMode = { flags: u32(mg.modeFlags) };
    const m: Record<string, [number, number]> = {};
    if (Array.isArray(mg.mg))
      for (const row of mg.mg) {
        if (!Array.isArray(row) || !isObj(row[1])) continue;
        m[String(row[0])] = [u32(row[1].head), u32(row[1].flags)];
      }
    out.minigame = m;
  }
  if (s.menuData0 === '1') out.menu = { bits: [0] };
  return out;
}

export interface MpjSave {
  readonly core: SaveCore;
  readonly system: SaveSection<SystemSection>;
  readonly menu: SaveSection<MenuSection>;
  readonly minigameMode: SaveSection<MinigameModeSection>;
  readonly minigame: SaveSection<MinigameSection>;
  readonly run: SaveSection<RunSection>;
  /** 허브·목록이 같이 쓰는 모드 Save(원본 칸 0) */
  readonly mgm: MemorySave;
  readonly plaza: PlazaSave;
  /** MessageWindow 가 쓰는 값(원본 FUN_7100322e40: 2 → 2, 1 → 1, 그 밖 0) */
  messageSpeed(): 0 | 1 | 2;
  request(): void;
  isProcessing(): boolean;
}

export function createMpjSave(storage: SaveStorage, o: { readKey?: (key: string) => string | null; schedule?: (fn: () => void) => void } = {}): MpjSave {
  const core = new SaveCore({
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    storage,
    schedule: o.schedule,
    migrations: [{ from: 0, run: migrateLegacy }],
    legacy: () => {
      const read = o.readKey;
      if (!read) return null;
      const sections = { prefs: read(LEGACY_KEYS.prefs), mgm01: read(LEGACY_KEYS.mgm01), menuData0: read(LEGACY_KEYS.menuData0) };
      return Object.values(sections).some((v) => v !== null) ? { version: 0, sections } : null;
    },
  });
  const system = core.register(SYSTEM);
  const menu = core.register(MENU);
  const minigameMode = core.register(MODE);
  const minigame = core.register(MINIGAME);
  const run = core.register(RUN);
  core.load();
  const request = (): void => core.request();
  const isProcessing = (): boolean => core.isProcessing();
  const mgm = new MemorySave({
    getModeFlags: () => minigameMode.get().flags,
    setModeFlags: (v) => {
      minigameMode.get().flags = v >>> 0;
    },
    minigame: (id): MinigameSaveEntry | undefined => {
      const e = minigame.get()[id];
      return e ? { head: e[0], flags: e[1] } : undefined;
    },
    setMinigame: (id, e) => {
      const m = minigame.get();
      if (e.head || e.flags) m[id] = [e.head, e.flags];
      else delete m[id];
    },
    entries: () => Object.entries(minigame.get()).map(([k, v]): [number, MinigameSaveEntry] => [Number(k), { head: v[0], flags: v[1] }]),
    request,
    isProcessing,
  });
  const plaza: PlazaSave = {
    menuBit: (n) => menu.get().bits.includes(n),
    setMenuBit: (n, on) => {
      const b = menu.get().bits.filter((x) => x !== n);
      if (on) b.push(n);
      menu.get().bits = b.sort((a, c) => a - c);
    },
    request,
    isProcessing,
  };
  return {
    core,
    system,
    menu,
    minigameMode,
    minigame,
    run,
    mgm,
    plaza,
    messageSpeed: () => {
      const s = system.get().messageSpeed;
      return s === 2 ? 2 : s === 1 ? 1 : 0;
    },
    request,
    isProcessing,
  };
}

let app: MpjSave | null = null;

/** 앱 전체 저장 하나(localStorage 키 SAVE_KEY). 처음 부를 때 읽고 메시지 속도 원천을 꽂는다 */
export function appSave(): MpjSave {
  if (app) return app;
  const storage = new LocalStorageSave(SAVE_KEY);
  const s = createMpjSave(storage, { readKey: (k) => storage.readKey(k) });
  app = s;
  setMessageSpeedSource(() => s.messageSpeed());
  return s;
}

// ---------------------------------------------------------------- 가이드 메시지 속도(plaza_guide.md §4.3, menu00 @0x710005de90~0x710005deb0)

/** 선택 창 초기 커서: 저장값 2 → 2, 0 → 1(보통), 그 밖 → 0(빠름) */
export function guideMessageSpeedCursor(raw: number): number {
  return raw === 2 ? 2 : raw === 0 ? 1 : 0;
}

/** 선택 결과 → 저장값: r==2 ? 2 : (r != 1) — 0 빠름 → 1, 1 보통 → 0, 2 느림 → 2 */
export function guideMessageSpeedValue(r: number): number {
  return r === 2 ? 2 : r !== 1 ? 1 : 0;
}

/** 가이드 결정: SystemData+0x74 쓰기 → SaveRequestFiber(요청 → 처리 끝까지 대기) */
export function* setGuideMessageSpeed(save: MpjSave, choice: number): Generator<void, void, unknown> {
  save.system.get().messageSpeed = guideMessageSpeedValue(choice);
  yield* saveRequestFiber(save.core);
}

// ---------------------------------------------------------------- 한 판(mgrun MgRunInit.save)

/** 미니게임 장면 save 사건 → 단계 11 사람별 플레이 횟수(칸 0 = PlayerID 0 만 세이브가 있다, 16_save §10), 단계 16 SaveRequest */
export function mgRunSaveHooks(save: MpjSave, id: number): { playCount(players: readonly { pid: number; isCom: boolean; gamePlay?: boolean }[]): void; request(): void } {
  return {
    playCount: (players) => {
      commitPlayCount((pid) => (pid === 0 ? save.mgm : null), id, players);
    },
    request: () => save.request(),
  };
}
