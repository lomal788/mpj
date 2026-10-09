/**
 * 프레임 게이트 — 틀의 고정 스텝을 "이번 프레임을 진행해도 되는가" 로 감싼다. 온라인 구현은 docs/engine/12_online_sync.md §6.2 를 따른다.
 * 게이트가 false 면 게임 update·흐름 단계·타이머·텔롭/와이프 상태기계·동기 난수 소비가 모두 멈춘다(그리기는 페이지가 계속).
 * 게임 로직은 패드를 게이트가 준 입력으로만 받는다(로컬 패드를 직접 읽는 경로 없음). 기본 = 로컬(항상 진행, 로컬 패드 그대로).
 */

/** 한 플레이어 한 프레임 입력(core/pad PadInput 과 같은 모양 — 셸 경계 때문에 여기 다시 둔다) */
export interface MgPadInput {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

export interface FrameGate {
  /** frame = 틀이 다음에 진행할 프레임 번호(0 부터) */
  canStep(frame: number): boolean;
  /** 그 프레임의 플레이어별 입력(pid 순, 없으면 null) */
  inputsFor(frame: number): readonly (MgPadInput | null)[];
}

/** 로컬 게이트: 항상 진행, 입력 = read() 가 주는 로컬 패드 */
export function localGate(read: () => readonly (MgPadInput | null)[]): FrameGate {
  return { canStep: () => true, inputsFor: () => read() };
}
