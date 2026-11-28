import type { ChangesFailure } from "./changeContract";
import { CHANGE_CASES, MOCK_FAILURE, type ChangeCase } from "./changeMock";

// 실제 변화 계산(#28)·전체 기간 조회(#20)가 main에 연결되기 전까지는 가상 응답을 쓴다.
// #14에서 GET /api/changes 호출로 교체한다. 빈 목록·조회 실패·자료 부족은 서로 다른 상태로 유지한다.
export type ChangeView =
  | { kind: "ready"; cases: ChangeCase[] }
  | { kind: "error"; failure: ChangesFailure };

export function getSampleChangeViews(): Record<"cases" | "empty" | "error", ChangeView> {
  return {
    cases: { kind: "ready", cases: CHANGE_CASES },
    empty: { kind: "ready", cases: [] },
    error: { kind: "error", failure: MOCK_FAILURE },
  };
}
