/**
 * 공용 저장 어댑터 — 브라우저 localStorage 키 하나를 lib/save 의 SaveStorage 로. 게임을 모른다(키 이름은 쓰는 쪽이 준다).
 * 모든 접근을 try/catch 로 감싼다: 저장소가 없거나(노드·사생활 모드·차단) 할당량을 넘으면 예외를 lib/save 로 넘기고(오류 상태),
 * 마지막 글은 메모리에 남겨 같은 실행 안에서는 계속 읽힌다. 계약: docs/engine/16_save.md §3·§5.
 */
import type { SaveStorage } from '../save';

/** localStorage 의 쓰는 부분만(시험에서 가짜를 넣는다) */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultArea = (): WebStorageLike | null => (typeof localStorage === 'undefined' ? null : localStorage);

export class LocalStorageSave implements SaveStorage {
  /** 매체에 못 썼을 때도 이 실행 안에서 읽히는 마지막 글 */
  memory: string | null = null;

  constructor(
    readonly key: string,
    private readonly area: () => WebStorageLike | null = defaultArea,
  ) {}

  private store(): WebStorageLike {
    const a = this.area();
    if (!a) throw new Error('localStorage 없음');
    return a;
  }

  read(): string | null {
    const v = this.store().getItem(this.key);
    this.memory = v;
    return v;
  }

  write(text: string): void {
    this.memory = text;
    this.store().setItem(this.key, text);
  }

  /** 다른 키 하나 읽기(옛 저장 마이그레이션용). 실패하면 null */
  readKey(key: string): string | null {
    try {
      return this.area()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
}
