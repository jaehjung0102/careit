import type { ComparisonObservation } from "../changes";

export const NOW = new Date("2026-11-24T09:00:00Z"); // Nov24 18:00 KST
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function water(day: number, ml: number | null = 650, basis = "cumulative_cutoff", complete = true) {
  const date = `2026-11-${String(day).padStart(2, "0")}`;
  return { basis, ml, period_start_at: `${date}T00:00:00+09:00`,
    period_end_at: basis === "daily_total" ? `2026-11-${String(day + 1).padStart(2, "0")}T00:00:00+09:00` : `${date}T18:00:00+09:00`,
    coverage_complete: complete };
}
export function record(n: number, day: number, ml: number | null = 650, meal = "전량"): ComparisonObservation {
  return { id: id(n), resident_id: "resident-1", observed_at: `2026-11-${String(day).padStart(2, "0")}T12:15:00+09:00`,
    fields: { meal_period: "점심", meal, bowel: "미확인", walking: "부축 필요", medication: "해당 없음" },
    walking_observation: "휘청거림 없음", water_measurement: water(day, ml) };
}
export const current = () => record(99, 24, 650, "절반");
export const history = () => [record(1, 19, 800), record(2, 20, 900), record(3, 21, 1000), record(4, 22, 900, "3/4"), record(5, 23, 900, "3/4")];
