// GET /api/changes 응답 모양 (docs/api.md 6절, B2-04 PR #63의 lib/analytics 타입과 같은 구조).
// #63이 main에 merge되기 전이라 화면용으로 같은 모양을 둔다. #14에서 실제 타입 import로 교체한다.

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type MealStatus =
  | "changed" | "unchanged" | "current_unknown"
  | "context_missing" | "insufficient_data" | "unsupported_legacy";
export type WaterStatus = MealStatus | "not_aggregate" | "incomplete_period";
export type ComparisonStatus = WaterStatus;

export type ExclusionReason =
  | "unsupported_legacy" | "wrong_context" | "unknown_value"
  | "duplicate" | "conflicting_duplicate" | "not_aggregate" | "incomplete_period";

export type Evidence = { observation_id: string; unit_date: string; value: number; measured_at: string };

type ComparisonBase = {
  current_value: number | null;
  baseline_mean: number | null;
  delta: number | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  valid_count: number;
  excluded_counts: Partial<Record<ExclusionReason, number>>;
  evidence: Evidence[];
  excluded_evidence: { observation_ids: string[]; reason: ExclusionReason }[];
  summary: string;
};

export type MealComparison = ComparisonBase & {
  metric: "meal";
  status: MealStatus;
  value_unit: "percent";
  delta_unit: "percentage_points";
  basis: { meal_slot: MealSlot } | null;
};

export type WaterComparison = ComparisonBase & {
  metric: "water";
  status: WaterStatus;
  value_unit: "mL";
  delta_unit: "mL";
  basis: { water_basis: "daily_total" | "cumulative_cutoff"; start_local: string; end_local: string } | null;
};

export type Comparison = MealComparison | WaterComparison;

export type ContextCategory =
  | "bowel" | "urination" | "walking" | "pain" | "skin" | "sleep" | "mood" | "cognition"
  | "communication" | "hygiene" | "oral_care" | "medication" | "activity" | "emotional_support"
  | "walking_observation";

export type ContextItem = {
  category: ContextCategory;
  current_value: string | null;
  status: "recorded" | "unknown" | "unsupported_legacy";
  history: { observation_id: string; value: string; observed_at: string | null }[];
};

export type ChangesData = {
  resident_id: string;
  current_observation_id: string;
  timezone: "Asia/Seoul";
  access_scope: "author_only" | "facility";
  evaluated_at: string;
  minimum_valid_records: 3;
  results: [MealComparison, WaterComparison];
  context: ContextItem[];
};

export type ChangesSuccess = {
  data: ChangesData;
  meta: { contract_version: string; data_source: "mock" | "database" };
};

export type ChangesFailure = {
  error: { code: string; message: string; retryable: boolean };
  meta: { contract_version: string };
};

// ---- 화면 표시 규칙 ----

export type Tone = "teal" | "amber" | "slate";

// 감소를 위험 경고로 바꾸지 않는다. 수치가 다르면 "변화 있음"일 뿐이고 판단은 사람이 한다.
// 비교하지 않은 상태는 모두 회색으로 두고 "변화 없음"과 구분한다.
export const STATUS_DISPLAY: Record<ComparisonStatus, { label: string; tone: Tone; compared: boolean }> = {
  changed: { label: "변화 있음", tone: "amber", compared: true },
  unchanged: { label: "변화 없음", tone: "teal", compared: true },
  current_unknown: { label: "현재 미확인", tone: "slate", compared: false },
  insufficient_data: { label: "자료 부족", tone: "slate", compared: false },
  context_missing: { label: "비교 정보 없음", tone: "slate", compared: false },
  unsupported_legacy: { label: "환산 불가", tone: "slate", compared: false },
  not_aggregate: { label: "단일 섭취 기록", tone: "slate", compared: false },
  incomplete_period: { label: "집계 미완료", tone: "slate", compared: false },
};

export const METRIC_LABEL = { meal: "식사량", water: "수분 섭취" } as const;
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁" };

// "제외 N건"에 합산하는 사유 (PR #63 README 합의).
export const EXCLUDED_REASONS = [
  "unknown_value", "duplicate", "conflicting_duplicate", "unsupported_legacy", "incomplete_period",
] as const satisfies readonly ExclusionReason[];
// 기록 문제가 아니라 애초에 비교 대상이 아닌 기록. 같은 숫자에 합치지 않는다.
export const OUT_OF_SCOPE_REASONS = ["wrong_context", "not_aggregate"] as const satisfies readonly ExclusionReason[];

export const REASON_LABEL: Record<ExclusionReason, string> = {
  unknown_value: "값이 미확인",
  duplicate: "같은 날 중복 기록",
  conflicting_duplicate: "같은 날 값이 서로 다름",
  unsupported_legacy: "비율로 환산할 수 없는 예전 표현",
  incomplete_period: "집계가 끝나지 않은 구간",
  wrong_context: "다른 끼니·다른 집계 구간",
  not_aggregate: "단일 섭취 기록",
};

function sumReasons(counts: Comparison["excluded_counts"], reasons: readonly ExclusionReason[]): number {
  return reasons.reduce((total, reason) => total + (counts[reason] ?? 0), 0);
}

export function excludedCount(result: Comparison): number {
  return sumReasons(result.excluded_counts, EXCLUDED_REASONS);
}

export function outOfScopeCount(result: Comparison): number {
  return sumReasons(result.excluded_counts, OUT_OF_SCOPE_REASONS);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// 0은 유효한 값이다. null만 "미확인"으로 표시한다.
export function formatValue(result: Comparison, value: number | null): string {
  if (value === null) return "미확인";
  return result.metric === "meal" ? `${round1(value)}%` : `${round1(value)}mL`;
}

// 차이가 계산된 경우에만 숫자를 보여 준다. 계산하지 않았으면 null.
export function formatDelta(result: Comparison): string | null {
  if (result.delta === null) return null;
  const unit = result.metric === "meal" ? "%p" : "mL";
  if (result.delta === 0) return `차이 0${unit}`;
  const sign = result.delta > 0 ? "+" : "−";
  return `${sign}${round1(Math.abs(result.delta))}${unit}`;
}

export function basisLabel(result: Comparison): string | null {
  if (!result.basis) return null;
  if (result.metric === "meal") return `${SLOT_LABEL[(result as MealComparison).basis!.meal_slot]} 식사끼리 비교`;
  const b = (result as WaterComparison).basis!;
  return b.water_basis === "daily_total" ? "하루 합계끼리 비교" : `${b.start_local}~${b.end_local} 누적량끼리 비교`;
}

// "2026-11-17" → "11/17"
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function baselineLabel(result: Comparison, minimum: number): string | null {
  if (!result.baseline_start_date || !result.baseline_end_date) return null;
  return `${shortDate(result.baseline_start_date)}~${shortDate(result.baseline_end_date)} · 유효 ${result.valid_count}일 (최소 ${minimum}일)`;
}

// UTC 시각을 KST "HH:MM"으로. 근거 시각 표시용.
export function kstTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

export const CONTEXT_LABEL: Record<ContextCategory, string> = {
  bowel: "배변", urination: "배뇨", walking: "보행 도움", pain: "통증", skin: "피부", sleep: "수면",
  mood: "기분", cognition: "인지", communication: "의사소통", hygiene: "위생", oral_care: "구강 관리",
  medication: "투약", activity: "활동", emotional_support: "정서 지원", walking_observation: "보행 관찰",
};
