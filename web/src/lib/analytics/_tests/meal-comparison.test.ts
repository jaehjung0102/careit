import assert from "node:assert/strict";
import test from "node:test";
import { compareMeal, type MealObservation } from "../meal-comparison";

// Fictional approved snapshots; no database or production observations are used.
function row(id: number, day: number, meal: string | null = "전량", period: string | null = "점심"): MealObservation {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    resident_id: "resident-1", observed_at: `2026-11-${String(day).padStart(2, "0")}T12:15:00+09:00`,
    fields: { meal, meal_period: period },
  };
}
function fixture() {
  return { current: row(99, 16, "절반"), history: [row(1, 11), row(2, 12), row(3, 13), row(4, 14, "3/4"), row(5, 15, "3/4")] };
}
const baseline = () => [row(1, 11), row(2, 12), row(3, 13)];

test("contract example: lunch 50 versus prior 7-day mean 90 is -40 percentage points", () => {
  const { current, history } = fixture();
  const result = compareMeal(current, history);
  assert.equal(result.status, "changed");
  assert.deepEqual([result.current_value, result.baseline_mean, result.delta, result.valid_count], [50, 90, -40, 5]);
  assert.deepEqual([result.baseline_start_date, result.baseline_end_date], ["2026-11-09", "2026-11-15"]);
  assert.deepEqual(result.basis, { meal_slot: "lunch" });
  assert.equal(result.delta_unit, "percentage_points");
  assert.equal(result.summary, "점심 식사량 50%, 이전 7일 유효 5일 평균 90%보다 40%p 적게 기록됨.");
  assert.deepEqual(result.evidence.map((x) => [x.observation_id, x.value, x.measured_at]), history.map((x, i) => [x.id, i < 3 ? 100 : 75, x.observed_at]));
});

for (const [meal, percent] of [["전량", 100], ["3/4", 75], ["절반", 50], ["1/4", 25], ["드시지 않음", 0]] as const) {
  test(`derives ${percent}% only from the exact stored category ${meal}`, () => {
    const result = compareMeal(row(99, 16, meal), baseline());
    assert.equal(result.current_value, percent);
    assert.equal(result.delta, percent - 100);
    assert.equal(result.status, percent === 100 ? "unchanged" : "changed");
  });
}

test("zero counts as an observed meal; null and 미확인 do not lower the average", () => {
  const history = [row(1, 9, "드시지 않음"), row(2, 10, "절반"), row(3, 11), row(4, 12, null), row(5, 13, "미확인")];
  const result = compareMeal(row(99, 16, "드시지 않음"), history);
  assert.deepEqual([result.valid_count, result.baseline_mean, result.delta], [3, 50, -50]);
  assert.equal(result.excluded_counts.unknown_value, 2);
  assert.equal(result.evidence[0].value, 0);
});

for (const meal of [null, undefined, "미확인"]) {
  test(`unknown current meal (${String(meal)}) can show a valid baseline but never a difference`, () => {
    const current = { ...row(99, 16), fields: { meal, meal_period: "점심" } };
    const result = compareMeal(current, baseline());
    assert.equal(result.status, "current_unknown");
    assert.deepEqual([result.current_value, result.baseline_mean, result.delta], [null, 100, null]);
    assert.match(result.summary, /현재 식사량 미확인/);
  });
}

test("insufficient and empty history are never reported as unchanged or as a zero average", () => {
  for (const history of [[], baseline().slice(0, 2)]) {
    const result = compareMeal(row(99, 16), history);
    assert.equal(result.status, "insufficient_data");
    assert.equal(result.valid_count, history.length);
    assert.equal(result.baseline_mean, null);
    assert.equal(result.delta, null);
  }
  assert.equal(compareMeal({ ...row(99, 16), fields: { meal: null, meal_period: "점심" } }, []).status, "current_unknown");
});

test("uses the same resident and meal, and never leaks other residents into evidence", () => {
  const result = compareMeal(row(99, 16), [
    ...baseline(), row(4, 14, "드시지 않음", "아침"), row(5, 15, "드시지 않음", "저녁"),
    { ...row(6, 9, "드시지 않음"), resident_id: "resident-2" },
  ]);
  assert.deepEqual([result.valid_count, result.baseline_mean], [3, 100]);
  assert.equal(result.excluded_counts.wrong_context, 2);
  assert.ok(!JSON.stringify(result).includes(row(6, 9).id));
});

test("uses KST calendar boundaries, including D-7 and all of D-1 but no current-day records", () => {
  const current = { ...row(99, 16), observed_at: "2026-11-15T15:00:00Z" }; // Nov16 00:00 KST
  const history = [
    { ...row(1, 9), observed_at: "2026-11-08T15:00:00Z" }, // first instant D-7
    row(2, 10),
    { ...row(3, 15), observed_at: "2026-11-15T14:59:59.999Z" }, // last instant D-1
    { ...row(4, 8, "드시지 않음"), observed_at: "2026-11-08T14:59:59.999Z" },
    { ...row(5, 16, "드시지 않음"), observed_at: "2026-11-15T15:00:00Z" },
    row(6, 16, "드시지 않음"), row(7, 17, "드시지 않음"),
  ];
  const result = compareMeal(current, history);
  assert.equal(result.valid_count, 3);
  assert.equal(result.baseline_mean, 100);
  assert.deepEqual(result.evidence.map((x) => x.unit_date), ["2026-11-09", "2026-11-10", "2026-11-15"]);
  assert.deepEqual(result.excluded_evidence, []);
});

test("uses observed_at rather than a record's later creation time", () => {
  const history = baseline().map((x) => ({ ...x, created_at: "2026-11-16T03:00:00Z" }));
  assert.equal(compareMeal(row(99, 16), history).valid_count, 3);
  const legacy = { ...row(4, 14), observed_at: null, created_at: "2026-11-14T03:00:00Z" };
  const result = compareMeal(row(99, 16), [...history, legacy]);
  assert.equal(result.valid_count, 3);
  assert.equal(result.excluded_counts.wrong_context, 1);
});

for (const value of ["절반 이상", "절반 미만", "50%", "constructor"]) {
  test(`does not guess a percentage for unsupported value ${value}`, () => {
    const result = compareMeal(row(99, 16, value), baseline());
    assert.equal(result.status, "unsupported_legacy");
    assert.equal(result.current_value, null);
    assert.equal(result.delta, null);
    const previous = compareMeal(row(99, 16), [...baseline(), row(4, 14, value)]);
    assert.equal(previous.valid_count, 3);
    assert.equal(previous.excluded_counts.unsupported_legacy, 1);
  });
}

for (const period of [null, "미확인", "lunch"]) {
  test(`does not infer lunch from noon when the stored meal period is ${period}`, () => {
    const result = compareMeal(row(99, 16, "절반", period), baseline());
    assert.equal(result.status, "context_missing");
    assert.equal(result.basis, null);
    assert.equal(result.baseline_mean, null);
    assert.equal(result.delta, null);
  });
}

for (const observed_at of [null, undefined, "2026-11-16T12:00:00", "2026-02-30T00:00:00Z", "2026-11-16T24:00:00Z", "2026-11-16T00:00:00+24:00"]) {
  test(`does not assign a calendar day to invalid or missing time ${String(observed_at)}`, () => {
    const result = compareMeal({ ...row(99, 16), observed_at }, baseline());
    assert.equal(result.status, "context_missing");
    assert.equal(result.baseline_start_date, null);
    assert.equal(result.delta, null);
  });
}

test("handles leap days and a baseline crossing a year boundary", () => {
  const leap = compareMeal({ ...row(99, 16), observed_at: "2024-02-29T15:00:00Z" }, []);
  assert.deepEqual([leap.baseline_start_date, leap.baseline_end_date], ["2024-02-23", "2024-02-29"]);
  const year = compareMeal({ ...row(99, 16), observed_at: "2027-01-01T12:00:00+09:00" }, []);
  assert.deepEqual([year.baseline_start_date, year.baseline_end_date], ["2026-12-25", "2026-12-31"]);
});

test("same-day equal values count as one unit, with deterministic evidence independent of input order", () => {
  const { current, history } = fixture();
  const rows = [...history, row(6, 11), row(7, 11)];
  const result = compareMeal(current, rows);
  assert.deepEqual([result.valid_count, result.baseline_mean], [5, 90]);
  assert.equal(result.excluded_counts.duplicate, 2);
  assert.equal(result.evidence[0].observation_id, row(1, 11).id);
  assert.deepEqual(compareMeal(current, [...rows].reverse()), result);
});

test("three entries on one day cannot meet the minimum three-day requirement", () => {
  const result = compareMeal(row(99, 16), [row(1, 11), row(2, 11), row(3, 11)]);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.valid_count, 1);
  assert.equal(result.excluded_counts.duplicate, 2);
});

test("conflicting values discard the entire day instead of selecting the more recent value", () => {
  const rows = [...baseline(), row(4, 11, "절반"), row(5, 11)];
  const result = compareMeal(row(99, 16), rows);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.valid_count, 2);
  assert.equal(result.excluded_counts.conflicting_duplicate, 3);
  assert.deepEqual(result.excluded_evidence[0].observation_ids, [1, 4, 5].map((id) => row(id, 11).id));
  assert.equal(result.baseline_mean, null);
});

test("each excluded row gets one reason, with unsupported legacy before wrong context before unknown", () => {
  const result = compareMeal(row(99, 16), [row(1, 11, "절반 이상", null), row(2, 12, null, null), row(3, 13, null)]);
  assert.deepEqual(result.excluded_counts, { unsupported_legacy: 1, wrong_context: 1, unknown_value: 1 });
});

test("refuses repeated logical record IDs rather than choosing a correction version without B1's policy", () => {
  const r = row(1, 11);
  assert.throws(() => compareMeal(row(99, 16), [r, { ...r, fields: { meal: "절반", meal_period: "점심" } }]), /latest approved snapshot/);
});

test("does not truncate to the latest 30 rows or weight a day by its number of entries", () => {
  const sameDay = Array.from({ length: 35 }, (_, i) => row(i + 10, 15));
  const result = compareMeal(row(99, 16), [...sameDay, row(1, 9, "절반"), row(2, 10, "3/4")]);
  assert.deepEqual([result.valid_count, result.baseline_mean, result.delta], [3, 75, 25]);
  assert.equal(result.excluded_counts.duplicate, 34);
});

test("keeps full arithmetic precision and rounds only the display text", () => {
  const result = compareMeal(row(99, 16), [row(1, 11), row(2, 12, "3/4"), row(3, 13, "3/4")]);
  assert.equal(result.baseline_mean, 250 / 3);
  assert.equal(result.delta, 100 - 250 / 3);
  assert.match(result.summary, /평균 83\.3%보다 16\.7%p 많게/);
});

test("does not mutate approved snapshots or caller history", () => {
  const { current, history } = fixture();
  for (const r of [current, ...history]) { Object.freeze(r.fields); Object.freeze(r); }
  Object.freeze(history);
  const before = JSON.stringify({ current, history });
  compareMeal(current, history);
  assert.equal(JSON.stringify({ current, history }), before);
});
