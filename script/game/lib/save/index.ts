/**
 * 공용 저장 코어 — import 0(DOM·저장 매체·프로젝트 파일 없음). 어느 게임에도 묶이지 않는다: 섹션 이름·필드·마이그레이션은 쓰는 쪽이 등록한다.
 * 설계·원본 계약: docs/engine/16_save.md(§2 원본 SaveRequest → IsProcessing 수명, §4~6 웹 문서·버전·수명).
 *
 * - SaveCore      = 문서 하나(format·version·sections). 섹션 등록(register), 읽기·마이그레이션(load), 요청 수명(request → isProcessing → process),
 *                   변경 감지(dirty: 마지막으로 쓴 글과 비교), 직렬화(serialize). 쓰기는 요청 때만(원본: 메모리 SaveData → SaveRequest 때 기록).
 * - SaveStorage   = 매체 어댑터(read/write, 실패는 예외). 노드 시험은 MemoryStorage.
 * - saveRequestFiber = 원본 SaveRequestFiber(요청 → 처리 중이 아닐 때까지 대기)를 생성기로.
 */

/** 저장 매체 하나(키 하나). read: 없으면 null. 실패는 예외로 알린다 */
export interface SaveStorage {
  read(): string | null;
  write(text: string): void;
}

/** 섹션 정의 — defaults: 새 값, normalize: 읽은 값(모양 모름)을 맞춘 새 값 */
export interface SaveSectionDef<T> {
  readonly name: string;
  defaults(): T;
  normalize(raw: unknown): T;
}

/** 섹션 손잡이 — get 은 살아 있는 값(고치면 다음 요청 때 기록), set 은 통째로 바꾼다 */
export interface SaveSection<T> {
  readonly name: string;
  get(): T;
  set(v: T): void;
}

export type SaveSections = Record<string, unknown>;

/** 마이그레이션 한 단계: from → from+1 */
export interface SaveMigration {
  readonly from: number;
  run(sections: SaveSections): SaveSections;
}

export type SaveLoadSource = 'storage' | 'legacy' | 'empty' | 'corrupt' | 'newer' | 'readError';

export interface SaveLoadReport {
  source: SaveLoadSource;
  /** 읽은 문서 판(옛 키면 legacy 판, 없으면 null) */
  version: number | null;
  /** 실행한 마이그레이션 단계 수 */
  migrated: number;
}

export interface SaveError {
  phase: 'read' | 'parse' | 'version' | 'write' | 'migrate';
  message: string;
}

export type SaveResultKind = 'written' | 'unchanged' | 'error' | 'blocked';

export interface SaveOptions {
  /** 문서 식별 문자열(예 'mpj.save') */
  format: string;
  /** 지금 문서 판(1 부터) */
  version: number;
  storage: SaveStorage;
  migrations?: readonly SaveMigration[];
  /** 매체에 문서가 없을 때 한 번 부른다: 옛 저장을 { version, sections } 로(없으면 null) */
  legacy?: () => { version: number; sections: SaveSections } | null;
  /** 요청 처리를 미룰 곳(기본 queueMicrotask). 노드 시험은 직접 process() 를 부르려고 () => {} 를 넣는다 */
  schedule?: (fn: () => void) => void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class SaveCore {
  private readonly defs = new Map<string, SaveSectionDef<unknown>>();
  private readonly values = new Map<string, unknown>();
  /** 읽었지만 등록되지 않은 섹션(그대로 두었다가 다시 쓴다) */
  private raw: SaveSections = {};
  private pending = false;
  private lastText: string | null = null;
  private blocked = false;
  private readonly schedule: (fn: () => void) => void;
  loadReport: SaveLoadReport | null = null;
  lastError: SaveError | null = null;
  lastResult: SaveResultKind | null = null;
  readonly stats = { requests: 0, processed: 0, writes: 0, unchanged: 0, errors: 0 };

  constructor(private readonly o: SaveOptions) {
    this.schedule = o.schedule ?? ((fn) => queueMicrotask(fn));
  }

  get version(): number {
    return this.o.version;
  }

  /** 섹션 등록. load 뒤에 등록해도 읽은 값으로 맞춘다 */
  register<T>(def: SaveSectionDef<T>): SaveSection<T> {
    if (this.defs.has(def.name)) throw new Error(`save: 섹션 '${def.name}' 이 이미 있다`);
    this.defs.set(def.name, def as SaveSectionDef<unknown>);
    this.values.set(def.name, def.name in this.raw ? this.safeNormalize(def, this.raw[def.name]) : def.defaults());
    delete this.raw[def.name];
    return {
      name: def.name,
      get: () => this.values.get(def.name) as T,
      set: (v: T) => {
        this.values.set(def.name, v);
      },
    };
  }

  private safeNormalize<T>(def: SaveSectionDef<T>, raw: unknown): T {
    try {
      return def.normalize(raw);
    } catch {
      return def.defaults();
    }
  }

  private adopt(sections: SaveSections): void {
    this.raw = {};
    for (const [k, v] of Object.entries(sections)) {
      const def = this.defs.get(k);
      if (def) this.values.set(k, this.safeNormalize(def, v));
      else this.raw[k] = v;
    }
  }

  private migrate(version: number, sections: SaveSections): { sections: SaveSections; steps: number } {
    let v = version;
    let s = sections;
    let steps = 0;
    while (v < this.o.version) {
      const m = this.o.migrations?.find((x) => x.from === v);
      if (!m) throw new Error(`save: 판 ${v} → ${v + 1} 마이그레이션이 없다`);
      s = m.run(s);
      v++;
      steps++;
    }
    return { sections: s, steps };
  }

  /** 매체에서 한 번 읽는다. 옛 저장·낮은 판은 옮긴 뒤 바로 한 번 쓴다 */
  load(): SaveLoadReport {
    let text: string | null = null;
    try {
      text = this.o.storage.read();
    } catch (e) {
      this.lastError = { phase: 'read', message: message(e) };
      return (this.loadReport = { source: 'readError', version: null, migrated: 0 });
    }
    if (text === null) {
      let leg: { version: number; sections: SaveSections } | null = null;
      try {
        leg = this.o.legacy?.() ?? null;
      } catch (e) {
        this.lastError = { phase: 'migrate', message: message(e) };
      }
      if (!leg) return (this.loadReport = { source: 'empty', version: null, migrated: 0 });
      try {
        const m = this.migrate(leg.version, leg.sections);
        this.adopt(m.sections);
        this.request();
        return (this.loadReport = { source: 'legacy', version: leg.version, migrated: m.steps });
      } catch (e) {
        this.lastError = { phase: 'migrate', message: message(e) };
        return (this.loadReport = { source: 'empty', version: leg.version, migrated: 0 });
      }
    }
    let doc: { format?: unknown; version?: unknown; sections?: unknown };
    try {
      doc = JSON.parse(text) as typeof doc;
      if (!doc || typeof doc !== 'object' || doc.format !== this.o.format || typeof doc.version !== 'number' || typeof doc.sections !== 'object' || !doc.sections) throw new Error('문서 모양이 다르다');
    } catch (e) {
      this.lastError = { phase: 'parse', message: message(e) };
      return (this.loadReport = { source: 'corrupt', version: null, migrated: 0 });
    }
    const version = doc.version as number;
    if (version > this.o.version) {
      this.blocked = true;
      this.lastError = { phase: 'version', message: `문서 판 ${version} > ${this.o.version}` };
      return (this.loadReport = { source: 'newer', version, migrated: 0 });
    }
    try {
      const m = this.migrate(version, doc.sections as SaveSections);
      this.adopt(m.sections);
      if (m.steps === 0) this.lastText = text;
      else this.request();
      return (this.loadReport = { source: 'storage', version, migrated: m.steps });
    } catch (e) {
      this.blocked = true;
      this.lastError = { phase: 'migrate', message: message(e) };
      return (this.loadReport = { source: 'newer', version, migrated: 0 });
    }
  }

  /** 문서 글(섹션 = 등록 순서 + 모르는 섹션) */
  serialize(): string {
    const sections: SaveSections = {};
    for (const k of this.defs.keys()) sections[k] = this.values.get(k);
    for (const [k, v] of Object.entries(this.raw)) sections[k] = v;
    return JSON.stringify({ format: this.o.format, version: this.o.version, sections });
  }

  /** 변경 감지: 마지막으로 매체에 쓴(또는 읽은) 글과 지금 문서가 다름 */
  dirty(): boolean {
    return this.serialize() !== this.lastText;
  }

  /** SaveRequest — 요청을 모아 다음 처리에서 한 번 쓴다 */
  request(): void {
    this.stats.requests++;
    if (this.pending) return;
    this.pending = true;
    this.schedule(() => this.process());
  }

  /** IsProcessing — 요청이 처리되기 전이면 참 */
  isProcessing(): boolean {
    return this.pending;
  }

  /** 요청 처리(기록 한 번). 대기 중인 요청이 없으면 아무것도 안 하고 null */
  process(): SaveResultKind | null {
    if (!this.pending) return null;
    this.pending = false;
    this.stats.processed++;
    if (this.blocked) return (this.lastResult = 'blocked');
    const text = this.serialize();
    if (text === this.lastText) {
      this.stats.unchanged++;
      return (this.lastResult = 'unchanged');
    }
    try {
      this.o.storage.write(text);
    } catch (e) {
      this.stats.errors++;
      this.lastError = { phase: 'write', message: message(e) };
      return (this.lastResult = 'error');
    }
    this.lastText = text;
    this.stats.writes++;
    if (this.lastError?.phase === 'write' || this.lastError?.phase === 'parse' || this.lastError?.phase === 'read') this.lastError = null;
    return (this.lastResult = 'written');
  }
}

/** 원본 SaveRequestFiber(menu00 @0x71000923c0): 요청 → 처리 중이 아닐 때까지 한 프레임씩 yield */
/** @orig menu00:71000923c0 ref */
export function* saveRequestFiber(save: { request(): void; isProcessing(): boolean }): Generator<void, void, unknown> {
  save.request();
  while (save.isProcessing()) yield;
}

/** 메모리 매체(노드 시험·저장 불가 때). fail* 를 켜면 그 동작이 예외를 낸다 */
export class MemoryStorage implements SaveStorage {
  text: string | null;
  failRead = false;
  failWrite = false;
  writes = 0;

  constructor(text: string | null = null) {
    this.text = text;
  }

  read(): string | null {
    if (this.failRead) throw new Error('읽기 실패(시험)');
    return this.text;
  }

  write(text: string): void {
    if (this.failWrite) throw new Error('쓰기 실패(시험)');
    this.text = text;
    this.writes++;
  }
}
