import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOperations, type OperationsHandover, type OperationsObservation } from "../operations-summary";

const NOW = new Date("2026-11-25T14:00:00+09:00");
const handovers = [
  { id: "h1", status: "sent", due_at: "2026-11-25T13:00:00+09:00" },
  { id: "h2", status: "in_progress", due_at: "2026-11-25T14:00:00+09:00" },
  { id: "h3", status: "cancelled", due_at: "2026-11-25T12:00:00+09:00" },
] as const satisfies readonly OperationsHandover[];
const observations = [
  { id: "r1", created_at: "2026-11-25T00:00:00+09:00", reflection_status: "reflected" },
  { id: "r2", created_at: "2026-11-25T02:00:00Z", reflection_status: "pending" },
  { id: "r3", created_at: "2026-11-24T23:59:00+09:00", reflection_status: "pending" },
] as const satisfies readonly OperationsObservation[];

test("the walkthrough gives independent handover and observation counts", () => {
  assert.deepEqual(summarizeOperations(handovers, observations, NOW), {
    date: "2026-11-25", timezone: "Asia/Seoul", unacknowledged_handovers: 1,
    overdue_handovers: 1, pending_reflection: 2, saved_today: 2,
  });
});

test("crossing a deadline counts in-progress and acknowledged, never completed or cancelled", () => {
  const earlier = "2026-11-25T13:00:00+09:00";
  const result = summarizeOperations([
    ...handovers,
    { id: "h4", status: "acknowledged", due_at: earlier },
    { id: "h5", status: "completed", due_at: earlier },
  ], [], new Date(NOW.getTime() + 1));
  assert.equal(result.unacknowledged_handovers, 1);
  assert.equal(result.overdue_handovers, 3);
});

test("Korean midnight separates records less than one millisecond apart", () => {
  const midnight = new Date("2026-11-24T15:00:00Z");
  const result = summarizeOperations([], [
    { id: "r1", created_at: "2026-11-24T14:59:59.999999Z", reflection_status: "reflected" },
    { id: "r2", created_at: "2026-11-24T15:00:00.000000Z", reflection_status: "pending" },
  ], midnight);
  assert.equal(result.date, "2026-11-25");
  assert.equal(result.saved_today, 1);
  assert.equal(result.pending_reflection, 1);
});

test("an empty snapshot gives zero while an unknown reflection status leaves the total unavailable", () => {
  const empty = summarizeOperations([], [], NOW);
  assert.deepEqual(empty, {
    date: "2026-11-25", timezone: "Asia/Seoul", unacknowledged_handovers: 0,
    overdue_handovers: 0, pending_reflection: 0, saved_today: 0,
  });
  const unknown = summarizeOperations([], [
    ...observations, { id: "r4", created_at: "2026-11-25T10:00:00+09:00", reflection_status: null },
  ], NOW);
  assert.equal(unknown.pending_reflection, null);
  assert.equal(unknown.saved_today, 3);
});

test("duplicate logical IDs stop aggregation instead of inflating counts", () => {
  assert.throws(() => summarizeOperations([...handovers, handovers[0]], [], NOW), /unique ID.*handover/);
  assert.throws(() => summarizeOperations([], [...observations, observations[0]], NOW), /unique ID.*observation/);
});

test("invalid or inconsistent timestamps cannot silently change the totals", () => {
  assert.throws(() => summarizeOperations([{ ...handovers[0], due_at: "2026-11-25T13:00:00" }], [], NOW), /due_at/);
  assert.throws(() => summarizeOperations([], [{ ...observations[0], created_at: "2026-02-30T00:00:00Z" }], NOW), /created_at/);
  assert.throws(() => summarizeOperations([], [{ ...observations[0], created_at: "2026-11-25T15:00:00+09:00" }], NOW), /future save/);
  assert.throws(() => summarizeOperations([], [], new Date(NaN)), /evaluation time/);
});
