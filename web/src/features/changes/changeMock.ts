import type {
  ChangesData, ChangesFailure, ChangesSuccess, ContextItem, Evidence, ExclusionReason,
  MealComparison, WaterComparison,
} from "./changeContract";

// 실제 변화 계산(#28)·조회(#20) 연결 전까지 쓰는 가상 응답.
// 수치와 문장은 B2-04 PR #63의 examples/changes-responses.json(계산 코드로 생성한 예시)을 따른다.
// "제외 건수가 있는 사례"만 화면 확인용으로 F2가 추가했다.
// 모든 이름·ID·기록은 가상이며 실제 개인정보가 아니다.

// 예시 평가 시각: 2026-11-24 18:00 KST. 현재 관찰은 같은 날 점심(12:15 KST).
export const MOCK_EVALUATED_AT = "2026-11-24T09:00:00.000Z";
const CONTRACT_VERSION = "b2-01-draft-3";
const START = "2026-11-17";
const END = "2026-11-23";

const obsId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function evidence(values: [string, number][], utcTime: string): Evidence[] {
  return values.map(([date, value], i) => ({
    observation_id: obsId(i + 1), unit_date: date, value, measured_at: `${date}T${utcTime}.000Z`,
  }));
}

const MEAL_FIVE: [string, number][] = [["2026-11-19", 100], ["2026-11-20", 100], ["2026-11-21", 100], ["2026-11-22", 75], ["2026-11-23", 75]];
const WATER_FIVE: [string, number][] = [["2026-11-19", 800], ["2026-11-20", 900], ["2026-11-21", 1000], ["2026-11-22", 900], ["2026-11-23", 900]];

type MealInput = Pick<MealComparison, "status" | "current_value" | "baseline_mean" | "delta" | "summary">
  & { evidence: [string, number][]; noWindow?: boolean; excluded?: Partial<Record<ExclusionReason, string[]>> };
type WaterInput = Pick<WaterComparison, "status" | "current_value" | "baseline_mean" | "delta" | "summary">
  & { evidence: [string, number][]; noBasis?: boolean; excluded?: Partial<Record<ExclusionReason, string[]>> };

function exclusions(excluded: Partial<Record<ExclusionReason, string[]>> = {}) {
  const entries = Object.entries(excluded) as [ExclusionReason, string[]][];
  return {
    excluded_counts: Object.fromEntries(entries.map(([reason, ids]) => [reason, ids.length])),
    excluded_evidence: entries.map(([reason, ids]) => ({ observation_ids: ids, reason })),
  };
}

function meal(input: MealInput): MealComparison {
  return {
    metric: "meal", status: input.status, current_value: input.current_value,
    baseline_mean: input.baseline_mean, delta: input.delta,
    value_unit: "percent", delta_unit: "percentage_points", basis: { meal_slot: "lunch" },
    baseline_start_date: input.noWindow ? null : START, baseline_end_date: input.noWindow ? null : END,
    valid_count: input.evidence.length, ...exclusions(input.excluded),
    evidence: evidence(input.evidence, "03:15:00"), summary: input.summary,
  };
}

function water(input: WaterInput): WaterComparison {
  return {
    metric: "water", status: input.status, current_value: input.current_value,
    baseline_mean: input.baseline_mean, delta: input.delta, value_unit: "mL", delta_unit: "mL",
    basis: input.noBasis ? null : { water_basis: "cumulative_cutoff", start_local: "00:00", end_local: "18:00" },
    baseline_start_date: input.noBasis ? null : START, baseline_end_date: input.noBasis ? null : END,
    valid_count: input.evidence.length, ...exclusions(input.excluded),
    evidence: evidence(input.evidence, "09:00:00"), summary: input.summary,
  };
}

function context(dates: string[]): ContextItem[] {
  const history = (value: string) => dates.map((date, i) => ({
    observation_id: obsId(i + 1), value, observed_at: `${date}T03:15:00.000Z`,
  }));
  return [
    { category: "bowel", current_value: "미확인", status: "unknown", history: history("미확인") },
    { category: "walking", current_value: "부축 필요", status: "recorded", history: history("부축 필요") },
    { category: "medication", current_value: "해당 없음", status: "recorded", history: history("해당 없음") },
    { category: "walking_observation", current_value: "휘청거림 없음", status: "recorded", history: history("휘청거림 없음") },
  ];
}

const FIVE_DAYS = MEAL_FIVE.map(([d]) => d);

const MEAL_CHANGED = meal({
  status: "changed", current_value: 50, baseline_mean: 90, delta: -40, evidence: MEAL_FIVE,
  summary: "점심 식사량 50%, 이전 7일 유효 5일 평균 90%보다 40%p 적게 기록됨.",
});
const WATER_CHANGED = water({
  status: "changed", current_value: 650, baseline_mean: 900, delta: -250, evidence: WATER_FIVE,
  summary: "수분 섭취량 650mL, 이전 7일 같은 구간 유효 5일 평균 900mL보다 250mL 적게 기록됨.",
});

export type ChangeCase = {
  key: string;
  resident_name: string;
  room: string;
  observed_label: string;
  response: ChangesSuccess;
};

function success(residentId: string, n: number, results: [MealComparison, WaterComparison], dates: string[]): ChangesSuccess {
  const data: ChangesData = {
    resident_id: residentId, current_observation_id: obsId(90 + n), timezone: "Asia/Seoul",
    access_scope: "author_only", evaluated_at: MOCK_EVALUATED_AT, minimum_valid_records: 3,
    results, context: context(dates),
  };
  return { data, meta: { contract_version: CONTRACT_VERSION, data_source: "mock" } };
}

const OBSERVED = "11/24 점심 기록";

export const CHANGE_CASES: ChangeCase[] = [
  {
    key: "changed", resident_name: "박철수", room: "203호", observed_label: OBSERVED,
    response: success("resident-2", 1, [MEAL_CHANGED, WATER_CHANGED], FIVE_DAYS),
  },
  {
    key: "zero-is-valid", resident_name: "김영희", room: "201호", observed_label: OBSERVED,
    response: success("resident-1", 2, [
      meal({ status: "changed", current_value: 0, baseline_mean: 90, delta: -90, evidence: MEAL_FIVE,
        summary: "점심 식사량 0%, 이전 7일 유효 5일 평균 90%보다 90%p 적게 기록됨." }),
      water({ status: "changed", current_value: 0, baseline_mean: 900, delta: -900, evidence: WATER_FIVE,
        summary: "수분 섭취량 0mL, 이전 7일 같은 구간 유효 5일 평균 900mL보다 900mL 적게 기록됨." }),
    ], FIVE_DAYS),
  },
  {
    key: "with-exclusions", resident_name: "정복순", room: "207호", observed_label: OBSERVED,
    response: success("resident-6", 3, [
      meal({ status: "changed", current_value: 50, baseline_mean: 90, delta: -40, evidence: MEAL_FIVE,
        excluded: { wrong_context: [obsId(11), obsId(12)], unknown_value: [obsId(13)], conflicting_duplicate: [obsId(14), obsId(15)] },
        summary: "점심 식사량 50%, 이전 7일 유효 5일 평균 90%보다 40%p 적게 기록됨." }),
      water({ status: "changed", current_value: 650, baseline_mean: 900, delta: -250, evidence: WATER_FIVE,
        excluded: { not_aggregate: [obsId(16)], duplicate: [obsId(17)] },
        summary: "수분 섭취량 650mL, 이전 7일 같은 구간 유효 5일 평균 900mL보다 250mL 적게 기록됨." }),
    ], FIVE_DAYS),
  },
  {
    key: "unchanged", resident_name: "이순자", room: "205호", observed_label: OBSERVED,
    response: success("resident-3", 4, [
      meal({ status: "unchanged", current_value: 50, baseline_mean: 50, delta: 0,
        evidence: [["2026-11-21", 50], ["2026-11-22", 50], ["2026-11-23", 50]],
        summary: "점심 식사량 50%, 이전 7일 유효 3일 평균 50%와 같게 기록됨." }),
      water({ status: "unchanged", current_value: 650, baseline_mean: 650, delta: 0,
        evidence: [["2026-11-21", 650], ["2026-11-22", 650], ["2026-11-23", 650]],
        summary: "수분 섭취량 650mL, 이전 7일 같은 구간 유효 3일 평균 650mL와 같게 기록됨." }),
    ], ["2026-11-21", "2026-11-22", "2026-11-23"]),
  },
  {
    key: "current-unknown", resident_name: "최말순", room: "202호", observed_label: OBSERVED,
    response: success("resident-4", 5, [
      meal({ status: "current_unknown", current_value: null, baseline_mean: 90, delta: null, evidence: MEAL_FIVE,
        summary: "현재 식사량 미확인. 이전 7일 유효 5일 평균 90%. 차이는 계산하지 않음." }),
      water({ status: "current_unknown", current_value: null, baseline_mean: 900, delta: null, evidence: WATER_FIVE,
        summary: "현재 수분량 미확인. 이전 7일 같은 구간 유효 5일 평균 900mL. 차이는 계산하지 않음." }),
    ], FIVE_DAYS),
  },
  {
    key: "insufficient-history", resident_name: "한덕수", room: "204호", observed_label: OBSERVED,
    response: success("resident-5", 6, [
      meal({ status: "insufficient_data", current_value: 50, baseline_mean: null, delta: null,
        evidence: [["2026-11-19", 100], ["2026-11-20", 100]],
        summary: "이전 7일 같은 끼니의 유효 기록 2일. 최소 3일이 필요하여 평균·차이를 계산하지 않음." }),
      water({ status: "insufficient_data", current_value: 650, baseline_mean: null, delta: null,
        evidence: [["2026-11-19", 800], ["2026-11-20", 900]],
        summary: "이전 7일 같은 완료 구간의 유효 기록 2일. 최소 3일이 필요하여 평균·차이를 계산하지 않음." }),
    ], ["2026-11-19", "2026-11-20"]),
  },
  {
    key: "single-water-event", resident_name: "오금례", room: "206호", observed_label: OBSERVED,
    response: success("resident-7", 7, [
      MEAL_CHANGED,
      water({ status: "not_aggregate", current_value: 150, baseline_mean: null, delta: null, evidence: [], noBasis: true,
        summary: "단일 섭취량 150mL 기록. 일합계 또는 같은 cutoff 누적량이 아니므로 비교하지 않음." }),
    ], FIVE_DAYS),
  },
  {
    key: "incomplete-water-period", resident_name: "윤만복", room: "208호", observed_label: OBSERVED,
    response: success("resident-8", 8, [
      MEAL_CHANGED,
      water({ status: "incomplete_period", current_value: 650, baseline_mean: 900, delta: null, evidence: WATER_FIVE,
        summary: "현재 수분 집계 구간이 끝나지 않았거나 집계가 미완료여서 차이를 계산하지 않음." }),
    ], FIVE_DAYS),
  },
  {
    key: "missing-observation-time", resident_name: "강춘자", room: "209호", observed_label: "관찰 시각 없는 기록",
    response: success("resident-9", 9, [
      meal({ status: "context_missing", current_value: 50, baseline_mean: null, delta: null, evidence: [], noWindow: true,
        summary: "관찰 시각 또는 끼니 정보가 없어 식사량을 비교하지 않음." }),
      WATER_CHANGED,
    ], []),
  },
  {
    key: "unsupported-legacy-meal", resident_name: "서길남", room: "210호", observed_label: OBSERVED,
    response: success("resident-10", 10, [
      meal({ status: "unsupported_legacy", current_value: null, baseline_mean: 90, delta: null, evidence: MEAL_FIVE,
        summary: "현재 식사량을 정확한 비율로 환산할 수 없어 비교하지 않음." }),
      WATER_CHANGED,
    ], FIVE_DAYS),
  },
];

// 전체 비교 기간을 다 읽지 못했을 때 API는 빈 성공 대신 503을 준다 (#63 예시 10번).
export const MOCK_FAILURE: ChangesFailure = {
  error: { code: "SERVICE_UNAVAILABLE", message: "비교 기간의 기록을 모두 불러오지 못했습니다. 다시 시도해 주세요.", retryable: true },
  meta: { contract_version: CONTRACT_VERSION },
};
