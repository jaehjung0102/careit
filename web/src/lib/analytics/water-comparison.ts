import { kstParts, parseInstant, shiftDate } from "./calendar";
import type { MealComparison } from "./meal-comparison";

export type WaterObservation = Readonly<{ id: string; resident_id: string; water_measurement?: unknown }>;
type AggregateBasis = "daily_total" | "cumulative_cutoff";
type Period = { date: string; start: string; end: string; endInstant: bigint; measuredAt: string; complete: boolean };
type Measurement = { ml: number | null; kind: "missing" | "unsupported" | "event" | AggregateBasis; period: Period | null };
type WaterStatus = MealComparison["status"] | "not_aggregate" | "incomplete_period";
type Reason = "unsupported_legacy" | "not_aggregate" | "wrong_context" | "unknown_value" | "incomplete_period" | "duplicate" | "conflicting_duplicate";
export type WaterComparison = Omit<MealComparison, "metric" | "status" | "basis" | "value_unit" | "delta_unit" | "excluded_counts" | "excluded_evidence"> & {
  metric: "water"; status: WaterStatus; value_unit: "mL"; delta_unit: "mL";
  basis: { water_basis: AggregateBasis; start_local: string; end_local: string } | null;
  excluded_counts: Partial<Record<Reason, number>>;
  excluded_evidence: { observation_ids: string[]; reason: Reason }[];
};

function measurement(value: unknown): Measurement {
  const missing: Measurement = { ml: null, kind: "missing", period: null };
  if (value == null) return missing;
  if (typeof value !== "object" || Array.isArray(value)) return { ...missing, kind: "unsupported" };
  const w = value as Record<string, unknown>;
  if (w.ml !== null && (typeof w.ml !== "number" || !Number.isSafeInteger(w.ml) || w.ml < 0)) return { ...missing, kind: "unsupported" };
  const ml = w.ml as number | null;
  if (w.basis === "event") return { ml, kind: "event", period: null };
  if (w.basis !== "daily_total" && w.basis !== "cumulative_cutoff") return { ml, kind: "unsupported", period: null };
  const result: Measurement = { ml, kind: w.basis, period: null };
  const start = kstParts(w.period_start_at), end = kstParts(w.period_end_at);
  const startInstant = parseInstant(w.period_start_at), endInstant = parseInstant(w.period_end_at);
  if (!start || !end || startInstant === null || endInstant === null || startInstant >= endInstant
    || start.time !== "00:00:00.000" || typeof w.coverage_complete !== "boolean") return result;
  if (w.basis === "daily_total") {
    if (end.date !== shiftDate(start.date, 1) || end.time !== "00:00:00.000") return result;
  } else if (end.date !== start.date) return result;
  result.period = { date: start.date, start: start.time, end: end.time, endInstant,
    measuredAt: w.period_end_at as string, complete: w.coverage_complete };
  return result;
}

export function waterBaselineWindow(record: WaterObservation): { start_date: string; end_date: string } | null {
  const period = measurement(record.water_measurement).period;
  return period ? { start_date: shiftDate(period.date, -7), end_date: shiftDate(period.date, -1) } : null;
}

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const display = (n: number) => String(Math.round(n * 10) / 10);
const localLabel = (time: string) => time.endsWith(":00.000") ? time.slice(0, 5) : time;

function describe(r: WaterComparison): string {
  const baseline = r.baseline_mean === null ? null : `이전 7일 같은 구간 유효 ${r.valid_count}일 평균 ${display(r.baseline_mean)}mL`;
  switch (r.status) {
    case "unsupported_legacy": return "수분량 또는 집계 방식이 비교 형식과 맞지 않아 비교하지 않음.";
    case "not_aggregate": return `단일 섭취량 ${r.current_value === null ? "미확인" : `${r.current_value}mL`} 기록. 일합계 또는 같은 cutoff 누적량이 아니므로 비교하지 않음.`;
    case "context_missing": return "수분 집계 구간 정보가 없어 비교하지 않음.";
    case "current_unknown": return `현재 수분량 미확인.${baseline ? ` ${baseline}.` : ""} 차이는 계산하지 않음.`;
    case "incomplete_period": return "현재 수분 집계 구간이 끝나지 않았거나 집계가 미완료여서 차이를 계산하지 않음.";
    case "insufficient_data": return `이전 7일 같은 완료 구간의 유효 기록 ${r.valid_count}일. 최소 3일이 필요하여 평균·차이를 계산하지 않음.`;
    case "unchanged": return `수분 섭취량 ${r.current_value}mL, ${baseline}와 같게 기록됨.`;
    case "changed": return `수분 섭취량 ${r.current_value}mL, ${baseline}보다 ${display(Math.abs(r.delta!))}mL ${r.delta! < 0 ? "적게" : "많게"} 기록됨.`;
  }
}

// Inputs must already be the latest approved snapshots within the caller's access.
// Event amounts are never summed, and cumulative totals are never added together.
export function compareWater(current: WaterObservation, history: readonly WaterObservation[], now: Date): WaterComparison {
  const milliseconds = now.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error("A valid server evaluation time is required.");
  const clock = BigInt(milliseconds) * BigInt(1000);
  const value = measurement(current.water_measurement), period = value.period;
  const window = waterBaselineWindow(current);
  const result: WaterComparison = {
    metric: "water", status: "insufficient_data", current_value: value.ml, baseline_mean: null, delta: null,
    value_unit: "mL", delta_unit: "mL",
    basis: period ? { water_basis: value.kind as AggregateBasis, start_local: localLabel(period.start), end_local: localLabel(period.end) } : null,
    baseline_start_date: window?.start_date ?? null, baseline_end_date: window?.end_date ?? null,
    valid_count: 0, excluded_counts: {}, evidence: [], excluded_evidence: [], summary: "",
  };
  const exclude = (ids: string[], reason: Reason) => {
    result.excluded_counts[reason] = (result.excluded_counts[reason] ?? 0) + ids.length;
    result.excluded_evidence.push({ observation_ids: ids.sort(compareText), reason });
  };
  if (period && window) {
    const days = new Map<string, WaterComparison["evidence"]>();
    const ids = new Set<string>();
    for (const row of history) {
      if (row.resident_id !== current.resident_id || row.id === current.id) continue;
      const w = measurement(row.water_measurement), p = w.period;
      // Bound records by their water measurement date, never their meal/creation date.
      const raw = row.water_measurement;
      const date = raw && typeof raw === "object" && !Array.isArray(raw)
        ? kstParts((raw as Record<string, unknown>)[w.kind === "event" ? "observed_at" : "period_start_at"])?.date : null;
      if (date && (date < window.start_date || date > window.end_date)) continue;
      if (ids.has(row.id)) throw new Error("Water comparison requires one latest approved snapshot per observation ID.");
      ids.add(row.id);
      if (w.kind === "unsupported") { exclude([row.id], "unsupported_legacy"); continue; }
      if (w.kind === "event") { exclude([row.id], "not_aggregate"); continue; }
      if (!p || w.kind !== value.kind || p.start !== period.start || p.end !== period.end) { exclude([row.id], "wrong_context"); continue; }
      if (w.ml === null) { exclude([row.id], "unknown_value"); continue; }
      if (!p.complete || p.endInstant > clock) { exclude([row.id], "incomplete_period"); continue; }
      const group = days.get(p.date) ?? [];
      group.push({ observation_id: row.id, unit_date: p.date, value: w.ml, measured_at: p.measuredAt });
      days.set(p.date, group);
    }
    for (const [, rows] of [...days].sort(([a], [b]) => compareText(a, b))) {
      rows.sort((a, b) => compareText(a.observation_id, b.observation_id));
      if (new Set(rows.map((r) => r.value)).size > 1) exclude(rows.map((r) => r.observation_id), "conflicting_duplicate");
      else { result.evidence.push(rows[0]); if (rows.length > 1) exclude(rows.slice(1).map((r) => r.observation_id), "duplicate"); }
    }
  }
  result.excluded_evidence.sort((a, b) => compareText(a.observation_ids[0], b.observation_ids[0]));
  result.valid_count = result.evidence.length;
  const sum = result.evidence.reduce((total, r) => total + BigInt(r.value), BigInt(0));
  const count = BigInt(result.valid_count);
  // Exact integer totals avoid both overflow and a false change from summing
  // rounded fractions (e.g. seven identical daily values).
  if (result.valid_count >= 3) result.baseline_mean = Number(sum / count) + Number(sum % count) / result.valid_count;
  if (value.kind === "unsupported") result.status = "unsupported_legacy";
  else if (value.kind === "event") result.status = "not_aggregate";
  else if (!period) result.status = "context_missing";
  else if (value.ml === null) result.status = "current_unknown";
  else if (!period.complete || period.endInstant > clock) result.status = "incomplete_period";
  else if (result.baseline_mean !== null) {
    const difference = BigInt(value.ml) * count - sum;
    result.delta = Number(difference / count) + Number(difference % count) / result.valid_count;
    result.status = difference === BigInt(0) ? "unchanged" : "changed";
  }
  result.summary = describe(result);
  return result;
}
