import assert from "node:assert/strict";
import test from "node:test";
import { compareWater } from "../water-comparison";
import { current, history, NOW, record, water } from "./comparison-fixture";

test("650mL versus matching completed 18:00 periods averaging 900mL is -250mL", () => {
  const result = compareWater(current(), history(), NOW);
  assert.deepEqual([result.status, result.current_value, result.baseline_mean, result.delta, result.valid_count], ["changed", 650, 900, -250, 5]);
  assert.deepEqual(result.basis, { water_basis: "cumulative_cutoff", start_local: "00:00", end_local: "18:00" });
  assert.deepEqual([result.baseline_start_date, result.baseline_end_date], ["2026-11-17", "2026-11-23"]);
  assert.match(result.summary, /250mL 적게/);
});

test("zero is included; null is unknown rather than zero", () => {
  const result = compareWater(record(99, 24, 0), [record(1, 20, 0), record(2, 21, 300), record(3, 22, 600), record(4, 23, null)], NOW);
  assert.deepEqual([result.baseline_mean, result.delta, result.valid_count], [300, -300, 3]);
  assert.equal(result.excluded_counts.unknown_value, 1);
  const unknown = compareWater(record(99, 24, null), history(), NOW);
  assert.deepEqual([unknown.status, unknown.current_value, unknown.baseline_mean, unknown.delta], ["current_unknown", null, 900, null]);
});

test("single drinks never become totals, even if seven matching events are supplied", () => {
  const event = { basis: "event", ml: 150, observed_at: "2026-11-24T09:00:00Z" };
  const r = compareWater({ ...current(), water_measurement: event }, history(), NOW);
  assert.deepEqual([r.status, r.current_value, r.baseline_mean, r.delta], ["not_aggregate", 150, null, null]);
  const events = history().map((row, i) => ({ ...row, water_measurement: { ...event, observed_at: `2026-11-${19 + i}T09:00:00Z` } }));
  const previous = compareWater(current(), events, NOW);
  assert.equal(previous.valid_count, 0);
  assert.equal(previous.excluded_counts.not_aggregate, 5);
});

test("different cutoffs and daily totals do not substitute for 18:00 cumulative amounts", () => {
  const wrongCutoff = { ...record(6, 18), water_measurement: { ...water(18), period_end_at: "2026-11-18T12:00:00+09:00" } };
  const daily = { ...record(7, 17), water_measurement: water(17, 1000, "daily_total") };
  const r = compareWater(current(), [...history(), wrongCutoff, daily], NOW);
  assert.deepEqual([r.valid_count, r.baseline_mean, r.excluded_counts.wrong_context], [5, 900, 2]);
});

test("completed daily totals compare only with full daily totals", () => {
  const c = { ...current(), water_measurement: water(23, 1200, "daily_total") };
  const rows = [19, 20, 21].map((day, i) => ({ ...record(i + 1, day), water_measurement: water(day, 1000, "daily_total") }));
  const r = compareWater(c, [...rows, record(4, 22)], NOW);
  assert.deepEqual([r.baseline_mean, r.delta, r.valid_count], [1000, 200, 3]);
  assert.equal(r.excluded_counts.wrong_context, 1);
});

test("water window uses the aggregate date even when the meal was observed on another day", () => {
  const c = { ...current(), water_measurement: water(23, 650) };
  const rows = [16, 17, 18].map((day, i) => ({ ...record(i + 1, 24), water_measurement: water(day, 900) }));
  const r = compareWater(c, rows, NOW);
  assert.deepEqual([r.baseline_start_date, r.baseline_end_date, r.valid_count, r.baseline_mean], ["2026-11-16", "2026-11-22", 3, 900]);
});

test("completion flag and server end-time are both required, without observation clock tolerance", () => {
  const tooEarly = compareWater(current(), history(), new Date(NOW.getTime() - 1));
  assert.equal(tooEarly.status, "incomplete_period");
  assert.equal(tooEarly.delta, null);
  assert.equal(compareWater(current(), history(), NOW).status, "changed");
  const unfinished = compareWater({ ...current(), water_measurement: water(24, 650, "cumulative_cutoff", false) }, history(), NOW);
  assert.equal(unfinished.status, "incomplete_period");
  const r = compareWater(current(), [...history(), { ...record(6, 18), water_measurement: water(18, 0, "cumulative_cutoff", false) }], NOW);
  assert.equal(r.excluded_counts.incomplete_period, 1);
  assert.equal(r.baseline_mean, 900);
});

test("past intervals that have not ended at evaluation time are excluded", () => {
  const r = compareWater(current(), history(), new Date("2026-11-20T09:00:00Z"));
  assert.equal(r.excluded_counts.incomplete_period, 3);
  assert.equal(r.valid_count, 2);
  assert.equal(r.baseline_mean, null);
});

for (const ml of [-1, 1.5, "650", Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, undefined]) {
  test(`does not infer or coerce invalid stored amount ${String(ml)}`, () => {
    const r = compareWater({ ...current(), water_measurement: { ...water(24), ml } }, history(), NOW);
    assert.equal(r.status, "unsupported_legacy");
    assert.equal(r.delta, null);
  });
}

for (const patch of [
  { period_start_at: "2026-11-24T01:00:00+09:00" },
  { period_end_at: "2026-11-25T18:00:00+09:00" },
  { period_start_at: "2026-02-30T00:00:00+09:00" },
  { period_end_at: "2026-11-24T00:00:00+09:00" },
  { coverage_complete: undefined }, { period_end_at: "2026-11-24T18:00:00" },
]) {
  test(`rejects ambiguous or invalid aggregate context ${JSON.stringify(patch)}`, () => {
    const r = compareWater({ ...current(), water_measurement: { ...water(24), ...patch } }, history(), NOW);
    assert.equal(r.status, "context_missing");
    assert.equal(r.delta, null);
  });
}

test("legacy qualitative water and missing water context are not numeric data", () => {
  assert.equal(compareWater({ ...current(), water_measurement: "충분" }, history(), NOW).status, "unsupported_legacy");
  assert.equal(compareWater({ ...current(), water_measurement: null }, history(), NOW).status, "context_missing");
});

test("uses inclusive D-7..D-1 only and ignores another resident in both evidence lists", () => {
  const r = compareWater(current(), [record(1, 17), record(2, 18), record(3, 23), record(4, 16, 0), record(5, 24, 0),
    { ...record(6, 19, 0), resident_id: "resident-2" }], NOW);
  assert.deepEqual([r.valid_count, r.baseline_mean, r.delta], [3, 650, 0]);
  assert.deepEqual(r.excluded_evidence, []);
});

test("same-day equal totals count once; conflicting totals exclude the entire day", () => {
  const rows = [...history(), record(6, 19, 800)];
  const equal = compareWater(current(), rows, NOW);
  assert.deepEqual([equal.valid_count, equal.baseline_mean, equal.excluded_counts.duplicate], [5, 900, 1]);
  assert.deepEqual(compareWater(current(), [...rows].reverse(), NOW), equal);
  const conflict = compareWater(current(), [...rows, record(7, 19, 850)], NOW);
  assert.equal(conflict.excluded_counts.conflicting_duplicate, 3);
  assert.deepEqual([conflict.valid_count, conflict.baseline_mean], [4, 925]);
});

test("insufficient days do not produce an average or an unchanged status", () => {
  for (const rows of [[], history().slice(0, 2), [record(1, 20), record(2, 20), record(3, 20)]]) {
    const r = compareWater(current(), rows, NOW);
    assert.equal(r.status, "insufficient_data"); assert.equal(r.delta, null); assert.equal(r.baseline_mean, null);
  }
});

test("exact arithmetic avoids false tiny differences and overflowing sums", () => {
  for (const ml of [400, 650, Number.MAX_SAFE_INTEGER]) {
    const rows = Array.from({ length: 7 }, (_, i) => record(i + 1, 17 + i, ml));
    const r = compareWater(record(99, 24, ml), rows, NOW);
    assert.deepEqual([r.status, r.baseline_mean, r.delta], ["unchanged", ml, 0]);
  }
  const r = compareWater(record(99, 24, 1), [record(1, 20, 0), record(2, 21, 0), record(3, 22, 1)], NOW);
  assert.equal(r.baseline_mean, 1 / 3); assert.equal(r.delta, 2 / 3);
});

test("refuses repeated versions and invalid evaluation clocks; does not mutate input", () => {
  const rows = history(); const c = current(); const before = JSON.stringify({ c, rows });
  assert.throws(() => compareWater(c, [rows[0], rows[0]], NOW), /latest approved/);
  assert.throws(() => compareWater(c, rows, new Date("invalid")), /server evaluation/);
  compareWater(c, rows, NOW); assert.equal(JSON.stringify({ c, rows }), before);
});
