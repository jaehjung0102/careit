// Pure calculation for docs/api.md §6. The caller must supply only accessible,
// latest approved snapshots. This is not an authorization or database adapter.
export type MealObservation = Readonly<{
  id: string;
  resident_id: string;
  observed_at?: string | null;
  fields: Readonly<{ meal?: string | null; meal_period?: string | null }>;
}>;

type MealSlot = "breakfast" | "lunch" | "dinner";
type MealStatus = "changed" | "unchanged" | "current_unknown"
  | "context_missing" | "insufficient_data" | "unsupported_legacy";
type Exclusion = "unsupported_legacy" | "wrong_context" | "unknown_value"
  | "duplicate" | "conflicting_duplicate";
type Evidence = { observation_id: string; unit_date: string; value: number; measured_at: string };

export type MealComparison = {
  metric: "meal";
  status: MealStatus;
  current_value: number | null;
  baseline_mean: number | null;
  delta: number | null;
  value_unit: "percent";
  delta_unit: "percentage_points";
  basis: { meal_slot: MealSlot } | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  valid_count: number;
  excluded_counts: Partial<Record<Exclusion, number>>;
  evidence: Evidence[];
  excluded_evidence: { observation_ids: string[]; reason: Exclusion }[];
  summary: string;
};

const PERCENT: Readonly<Record<string, number>> = {
  "전량": 100, "3/4": 75, "절반": 50, "1/4": 25, "드시지 않음": 0,
};
const SLOT: Readonly<Record<string, MealSlot>> = { "아침": "breakfast", "점심": "lunch", "저녁": "dinner" };
const SLOT_LABEL = { breakfast: "아침", lunch: "점심", dinner: "저녁" };
const MINIMUM_DAYS = 3;
const KST_OFFSET = 9 * 60 * 60 * 1000;

function mealValue(value: string | null | undefined) {
  if (value == null || value === "미확인") return { value: null, unsupported: false };
  if (Object.hasOwn(PERCENT, value)) return { value: PERCENT[value], unsupported: false };
  return { value: null, unsupported: true };
}

function mealSlot(value: string | null | undefined): MealSlot | null {
  return value != null && Object.hasOwn(SLOT, value) ? SLOT[value] : null;
}

// Date.parse normalizes invalid dates and accepts timezone-free input. Neither is
// suitable for assigning an observation to a Korean calendar date.
function kstDate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const [, y, m, d, h, min, sec, , oh, om] = parts;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const time = Date.parse(value);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
    || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59 || !Number.isFinite(time)) return null;
  const local = new Date(time + KST_OFFSET).toISOString();
  return /^\d{4}-/.test(local) ? local.slice(0, 10) : null;
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const display = (value: number) => String(Math.round(value * 10) / 10);

function summary(result: MealComparison): string {
  const label = result.basis ? SLOT_LABEL[result.basis.meal_slot] : "식사";
  const baseline = result.baseline_mean === null ? null
    : `이전 7일 유효 ${result.valid_count}일 평균 ${display(result.baseline_mean)}%`;
  switch (result.status) {
    case "unsupported_legacy": return "현재 식사량을 정확한 비율로 환산할 수 없어 비교하지 않음.";
    case "context_missing": return "관찰 시각 또는 끼니 정보가 없어 식사량을 비교하지 않음.";
    case "current_unknown": return `현재 식사량 미확인.${baseline ? ` ${baseline}.` : ""} 차이는 계산하지 않음.`;
    case "insufficient_data": return `이전 7일 같은 끼니의 유효 기록 ${result.valid_count}일. 최소 3일이 필요하여 평균·차이를 계산하지 않음.`;
    case "unchanged": return `${label} 식사량 ${display(result.current_value!)}%, ${baseline}와 같게 기록됨.`;
    case "changed": return `${label} 식사량 ${display(result.current_value!)}%, ${baseline}보다 ${display(Math.abs(result.delta!))}%p ${result.delta! < 0 ? "적게" : "많게"} 기록됨.`;
  }
}

export function compareMeal(current: MealObservation, history: readonly MealObservation[]): MealComparison {
  const meal = mealValue(current.fields.meal);
  const slot = mealSlot(current.fields.meal_period);
  const date = kstDate(current.observed_at);
  const result: MealComparison = {
    metric: "meal", status: "insufficient_data", current_value: meal.value,
    baseline_mean: null, delta: null, value_unit: "percent", delta_unit: "percentage_points",
    basis: slot ? { meal_slot: slot } : null,
    baseline_start_date: date ? shiftDate(date, -7) : null,
    baseline_end_date: date ? shiftDate(date, -1) : null,
    valid_count: 0, excluded_counts: {}, evidence: [], excluded_evidence: [], summary: "",
  };

  function exclude(ids: string[], reason: Exclusion) {
    result.excluded_counts[reason] = (result.excluded_counts[reason] ?? 0) + ids.length;
    result.excluded_evidence.push({ observation_ids: ids.sort(compareText), reason });
  }

  if (date && slot) {
    const units = new Map<string, Evidence[]>();
    const ids = new Set<string>();
    for (const row of history) {
      // Out-of-scope residents and dated records do not enter the result or its evidence.
      if (row.resident_id !== current.resident_id || row.id === current.id) continue;
      const rowDate = kstDate(row.observed_at);
      if (rowDate && (rowDate < result.baseline_start_date! || rowDate > result.baseline_end_date!)) continue;
      if (ids.has(row.id)) throw new Error("Meal comparison requires one latest approved snapshot per observation ID.");
      ids.add(row.id);
      const value = mealValue(row.fields.meal);
      if (value.unsupported) { exclude([row.id], "unsupported_legacy"); continue; }
      if (!rowDate || mealSlot(row.fields.meal_period) !== slot) { exclude([row.id], "wrong_context"); continue; }
      if (value.value === null) { exclude([row.id], "unknown_value"); continue; }
      const unit = units.get(rowDate) ?? [];
      unit.push({ observation_id: row.id, unit_date: rowDate, value: value.value, measured_at: row.observed_at! });
      units.set(rowDate, unit);
    }

    // Proposed per-day duplicate policy in docs/api.md. B1/F1 must confirm how
    // correction versions become the single approved snapshot supplied above.
    for (const [, rows] of [...units].sort(([a], [b]) => compareText(a, b))) {
      rows.sort((a, b) => compareText(a.observation_id, b.observation_id));
      if (new Set(rows.map((row) => row.value)).size > 1) {
        exclude(rows.map((row) => row.observation_id), "conflicting_duplicate");
      } else {
        result.evidence.push(rows[0]);
        if (rows.length > 1) exclude(rows.slice(1).map((row) => row.observation_id), "duplicate");
      }
    }
  }

  result.excluded_evidence.sort((a, b) => compareText(a.observation_ids[0], b.observation_ids[0]));
  result.valid_count = result.evidence.length;
  if (result.valid_count >= MINIMUM_DAYS) {
    result.baseline_mean = result.evidence.reduce((sum, row) => sum + row.value, 0) / result.valid_count;
  }
  if (meal.unsupported) result.status = "unsupported_legacy";
  else if (!date || !slot) result.status = "context_missing";
  else if (meal.value === null) result.status = "current_unknown";
  else if (result.baseline_mean !== null) {
    result.delta = meal.value - result.baseline_mean;
    result.status = result.delta === 0 ? "unchanged" : "changed";
  }
  result.summary = summary(result);
  return result;
}
