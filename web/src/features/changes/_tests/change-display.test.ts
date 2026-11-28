import assert from "node:assert/strict";
import test from "node:test";
import {
  STATUS_DISPLAY, baselineLabel, excludedCount, formatDelta, formatValue, kstTime, outOfScopeCount,
  type Comparison,
} from "../changeContract";
import { CHANGE_CASES, MOCK_FAILURE } from "../changeMock";

const results = CHANGE_CASES.flatMap((c) => c.response.data.results.map((r) => ({ key: c.key, r })));
const find = (key: string, metric: "meal" | "water") =>
  CHANGE_CASES.find((c) => c.key === key)!.response.data.results.find((r) => r.metric === metric)! as Comparison;

test("0 is a valid value and a zero delta is shown, not hidden", () => {
  const zero = find("zero-is-valid", "meal");
  assert.equal(formatValue(zero, zero.current_value), "0%");
  assert.equal(formatValue(find("zero-is-valid", "water"), 0), "0mL");
  assert.equal(formatDelta(find("unchanged", "meal")), "차이 0%p");
  assert.equal(formatDelta(find("unchanged", "water")), "차이 0mL");
});

test("deltas use %p for meals and mL for water, and null deltas are not shown as numbers", () => {
  assert.equal(formatDelta(find("changed", "meal")), "−40%p");
  assert.equal(formatDelta(find("changed", "water")), "−250mL");
  assert.equal(formatDelta(find("current-unknown", "meal")), null);
  assert.equal(formatValue(find("current-unknown", "meal"), null), "미확인");
});

test("only compared statuses carry a delta; every other status leaves it uncalculated", () => {
  for (const { key, r } of results) {
    assert.equal(r.delta !== null, STATUS_DISPLAY[r.status].compared, `${key}/${r.metric}`);
  }
});

test("insufficient data is never displayed as unchanged", () => {
  const insufficient = find("insufficient-history", "meal");
  assert.equal(STATUS_DISPLAY[insufficient.status].label, "자료 부족");
  assert.notEqual(STATUS_DISPLAY[insufficient.status].tone, STATUS_DISPLAY.unchanged.tone);
  assert.equal(insufficient.baseline_mean, null);
});

test("mock numbers agree with their evidence", () => {
  for (const { key, r } of results) {
    assert.equal(r.valid_count, r.evidence.length, `${key}/${r.metric} valid_count`);
    if (r.baseline_mean !== null) {
      const mean = r.evidence.reduce((sum, e) => sum + e.value, 0) / r.evidence.length;
      assert.equal(r.baseline_mean, mean, `${key}/${r.metric} mean`);
      assert.ok(r.evidence.length >= 3, `${key}/${r.metric} has a mean with fewer than 3 days`);
    }
    if (r.delta !== null) assert.equal(r.delta, r.current_value! - r.baseline_mean!, `${key}/${r.metric} delta`);
  }
});

test("'제외 N건' counts only record problems; other meals and single intakes are counted separately", () => {
  const meal = find("with-exclusions", "meal");
  assert.equal(excludedCount(meal), 3);       // unknown_value 1 + conflicting_duplicate 2
  assert.equal(outOfScopeCount(meal), 2);     // wrong_context 2
  const water = find("with-exclusions", "water");
  assert.equal(excludedCount(water), 1);      // duplicate 1
  assert.equal(outOfScopeCount(water), 1);    // not_aggregate 1
  assert.equal(excludedCount(find("changed", "meal")), 0);
});

test("baseline window and KST evidence times", () => {
  assert.equal(baselineLabel(find("changed", "meal"), 3), "11/17~11/23 · 유효 5일 (최소 3일)");
  assert.equal(baselineLabel(find("missing-observation-time", "meal"), 3), null);
  assert.equal(kstTime("2026-11-19T03:15:00.000Z"), "12:15");
  assert.equal(kstTime("2026-11-19T09:00:00.000Z"), "18:00");
});

test("all mock responses are marked as mock, and the read failure is retryable", () => {
  for (const c of CHANGE_CASES) assert.equal(c.response.meta.data_source, "mock");
  assert.equal(MOCK_FAILURE.error.retryable, true);
  assert.equal(new Set(CHANGE_CASES.map((c) => c.key)).size, CHANGE_CASES.length);
});
