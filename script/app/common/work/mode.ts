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
