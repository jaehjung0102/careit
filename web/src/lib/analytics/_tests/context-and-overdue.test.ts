import assert from "node:assert/strict";
import test from "node:test";
import { compareContext, calculateChanges, historyWindows } from "../changes";
import { HANDOVER_STATUSES, isHandoverOverdue } from "../../../app/api/handovers/_lib/contract";
import { current, history, record, water, NOW } from "./comparison-fixture";

test("context preserves unknown, not-performed, not-applicable, and explicit negative observations", () => {
  const c = { ...current(), fields: { ...current().fields, hygiene: "미실시", pain: null, walking: "혼자 걸음" } };
  const result = compareContext(c, []);
  const by = (category: string) => result.find((x) => x.category === category)!;
  assert.deepEqual([by("bowel").current_value, by("bowel").status], ["미확인", "unknown"]);
  assert.deepEqual([by("hygiene").current_value, by("hygiene").status], ["미실시", "recorded"]);
  assert.deepEqual([by("medication").current_value, by("medication").status], ["해당 없음", "recorded"]);
  assert.deepEqual([by("pain").current_value, by("pain").status], [null, "unknown"]);
  assert.deepEqual([by("walking").current_value, by("walking").status], ["혼자 걸음", "unsupported_legacy"]);
  assert.deepEqual([by("walking_observation").current_value, by("walking_observation").status], ["휘청거림 없음", "recorded"]);
  assert.ok(!result.some((x) => x.category === "skin")); // missing is not auto-filled
  assert.ok(!JSON.stringify(result).includes("risk"));
});

test("context history is raw, ordered, same-resident and within observation D-7..D-1", () => {
  const rows = [record(1, 23), record(2, 17), record(3, 24), record(4, 16),
    { ...record(5, 20), resident_id: "resident-2" }, { ...record(6, 21), observed_at: null }];
  const result = compareContext(current(), rows).find((x) => x.category === "bowel")!;
  assert.deepEqual(result.history.map((x) => x.observation_id), [rows[1].id, rows[0].id]);
  assert.ok(result.history.every((x) => x.value === "미확인"));
  assert.ok(compareContext({ ...current(), observed_at: null }, rows).every((x) => x.history.length === 0));
});

test("different meal and water anchors require both complete history windows", () => {
  const c = { ...current(), water_measurement: water(22) };
  assert.deepEqual(historyWindows(c), [
    { start_date: "2026-11-17", end_date: "2026-11-23" },
    { start_date: "2026-11-15", end_date: "2026-11-21" },
  ]);
  assert.equal(historyWindows(current()).length, 1);
  assert.deepEqual(historyWindows({ ...current(), observed_at: null, water_measurement: null }), []);
});

test("wire data has meal and water in contract order, explicit access scope and UTC timestamps", () => {
  const c = current(), rows = history(), before = JSON.stringify({ c, rows });
  const result = calculateChanges(c, rows, NOW, "author_only");
  assert.deepEqual(result.results.map((x) => x.metric), ["meal", "water"]);
  assert.deepEqual(result.results.map((x) => x.delta), [-40, -250]);
  assert.equal(result.access_scope, "author_only");
  assert.equal(result.minimum_valid_records, 3);
  assert.equal(result.timezone, "Asia/Seoul");
  assert.equal(result.evaluated_at, "2026-11-24T09:00:00.000Z");
  assert.ok(result.results.every((r) => r.evidence.every((e) => e.measured_at.endsWith("Z"))));
  assert.ok(result.context.every((r) => r.history.every((e) => e.observed_at?.endsWith("Z"))));
  assert.equal(JSON.stringify({ c, rows }), before);
});

for (const status of HANDOVER_STATUSES) {
  for (const offset of [-1, 0, 1]) {
    test(`overdue: ${status}, evaluation ${offset}ms from deadline`, () => {
      const expected = offset > 0 && status !== "completed" && status !== "cancelled";
      assert.equal(isHandoverOverdue({ status, due_at: "2026-11-24T18:00:00+09:00" }, new Date(NOW.getTime() + offset)), expected);
    });
  }
}

test("overdue is based on the instant, including a KST date boundary", () => {
  assert.equal(isHandoverOverdue({ status: "sent", due_at: "2026-11-24T00:00:00+09:00" }, new Date("2026-11-23T15:00:00.001Z")), true);
});
