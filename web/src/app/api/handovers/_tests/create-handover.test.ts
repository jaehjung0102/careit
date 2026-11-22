import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../route";
import { createPostHandover } from "../_lib/create-handover";
import { fixture, INPUT, request, SENDER } from "./fixture";

test("create returns sent handover, server identity/time, one event and explicit mock source", async () => {
  const f = fixture();
  const response = await f.post(request());
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.meta.data_source, "mock");
  assert.equal(result.meta.contract_version, "b2-01-draft-3");
  assert.deepEqual(result.data, {
    ...INPUT, follow_up_items: INPUT.follow_up_items.map((item) => ({ ...item, checked: false })),
    sender_id: SENDER, status: "sent", version: 1, created_at: "2026-11-17T09:00:00.000Z",
    acknowledged_at: null, started_at: null, completed_at: null, completed_by: null,
    completion_note: null, follow_up_observation_ids: [], cancelled_at: null,
    cancelled_by: null, cancellation_reason: null, is_overdue: false,
  });
  assert.equal(f.writes(), 1);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].actor_id, SENDER);
  assert.equal(f.events[0].request_id, INPUT.id);
  assert.equal(f.events[0].from_status, null);
  assert.equal(f.events[0].version_before, 0);
  assert.equal(f.events[0].version_after, 1);
});

test("retries after deadline return the existing handover without another write/event", async () => {
  const f = fixture();
  await f.post(request());
  f.setTime("2026-11-18T09:00:00Z");
  const response = await f.post(request());
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.created_at, "2026-11-17T09:00:00.000Z");
  assert.equal(result.data.is_overdue, true);
  assert.equal(f.writes(), 1);
  assert.equal(f.events.length, 1);
});

test("simultaneous identical requests create one handover", async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.post(request())));
  assert.equal(responses.filter((r) => r.status === 201).length, 1);
  assert.equal(responses.filter((r) => r.status === 200).length, 7);
  assert.equal(f.writes(), 1);
});

test("same ID with changed content returns conflict, retaining the first record", async () => {
  const f = fixture();
  await f.post(request());
  const response = await f.post(request({ ...INPUT, title: "다른 요청" }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(f.rows.get(INPUT.id)?.handover.title, INPUT.title);
  assert.equal(f.events.length, 1);
});

test("equivalent timezone and reordered JSON keys are the same retry", async () => {
  const f = fixture();
  await f.post(request());
  const reversed = Object.fromEntries(Object.entries(INPUT).reverse());
  const response = await f.post(request({ ...reversed, due_at: "2026-11-17T21:00:00+09:00" }));
  assert.equal(response.status, 200);
  assert.equal(f.writes(), 1);
});

test("replay returns current state, not the old creation snapshot", async () => {
  const f = fixture();
  await f.post(request());
  const row = f.rows.get(INPUT.id)!;
  row.handover.status = "cancelled";
  row.handover.version = 2;
  row.handover.cancelled_by = SENDER;
  row.handover.cancelled_at = "2026-11-17T10:00:00.000Z";
  row.handover.cancellation_reason = "중복 작업";
  f.setTime("2026-11-18T09:00:00Z");
  const result = await (await f.post(request())).json();
  assert.equal(result.data.status, "cancelled");
  assert.equal(result.data.version, 2);
  assert.equal(result.data.is_overdue, false);
});

const invalidCases: { name: string; patch: Record<string, unknown>; status: number }[] = [
  { name: "missing recipient", patch: { assignee_id: undefined }, status: 422 },
  { name: "empty task title", patch: { title: "   " }, status: 422 },
  { name: "oversized title", patch: { title: "가".repeat(101) }, status: 422 },
  { name: "invalid record UUID", patch: { observation_ids: ["record-1"] }, status: 422 },
  { name: "duplicate supporting records", patch: { observation_ids: [INPUT.observation_ids[0], INPUT.observation_ids[0]] }, status: 422 },
  { name: "missing supporting records", patch: { observation_ids: [] }, status: 422 },
  { name: "too many supporting records", patch: { observation_ids: Array(21).fill(INPUT.observation_ids[0]) }, status: 422 },
  { name: "no follow-up task", patch: { follow_up_items: [] }, status: 422 },
  { name: "duplicate follow-up IDs", patch: { follow_up_items: [INPUT.follow_up_items[0], INPUT.follow_up_items[0]] }, status: 422 },
  { name: "unsupported category", patch: { follow_up_items: [{ ...INPUT.follow_up_items[0], category: "diagnosis" }] }, status: 422 },
  { name: "empty confirmed facts", patch: { confirmed_facts: "" }, status: 422 },
  { name: "deadline exactly now", patch: { due_at: "2026-11-17T09:00:00Z" }, status: 422 },
  { name: "past deadline", patch: { due_at: "2026-11-16T12:00:00Z" }, status: 422 },
  { name: "deadline without timezone", patch: { due_at: "2026-11-17T21:00:00" }, status: 422 },
  { name: "impossible calendar day", patch: { due_at: "2027-02-30T12:00:00Z" }, status: 422 },
  { name: "forged sender", patch: { sender_id: SENDER }, status: 400 },
  { name: "forged completed status", patch: { status: "completed" }, status: 400 },
  { name: "forged task completion", patch: { follow_up_items: [{ ...INPUT.follow_up_items[0], checked: true }] }, status: 400 },
];
for (const example of invalidCases) {
  test(`reject ${example.name} without writing`, async () => {
    const f = fixture();
    const response = await f.post(request({ ...INPUT, ...example.patch }));
    assert.equal(response.status, example.status);
    assert.equal(f.writes(), 0);
    assert.equal(f.events.length, 0);
  });
}

test("malformed JSON and wrong body shape fail without writing", async () => {
  const f = fixture();
  const response = await f.post(new Request("http://localhost/api/handovers", {
    method: "POST", headers: { Authorization: "Bearer demo-sender", "Content-Type": "application/json" }, body: "{",
  }));
  assert.equal(response.status, 400);
  assert.equal((await f.post(request(null))).status, 422);
  assert.equal((await f.post(request([]))).status, 422);
  assert.equal(f.writes(), 0);
});

test("unknown token, forbidden role and inaccessible resources cannot create", async () => {
  const f = fixture();
  assert.equal((await f.post(request(INPUT, "invalid-token"))).status, 401);
  assert.equal((await f.post(request(INPUT, "demo-family"))).status, 403);
  assert.equal((await f.post(request({ ...INPUT, resident_id: "resident-2" }))).status, 404);
  assert.equal((await f.post(request({ ...INPUT, assignee_id: "30000000-0000-4000-8000-000000000099" }))).status, 404);
  assert.equal((await f.post(request({ ...INPUT, observation_ids: ["00000000-0000-4000-8000-000000000099"] }))).status, 404);
  assert.equal(f.writes(), 0);
});

test("retries recheck access and do not reveal another sender's ID", async () => {
  const f = fixture();
  await f.post(request());
  assert.equal((await f.post(request(INPUT, "demo-recipient"))).status, 404);
  f.revokeAccess();
  assert.equal((await f.post(request())).status, 404);
  assert.equal(f.writes(), 1);
});

test("database failure never reports success or exposes its internal message", async () => {
  const f = fixture();
  const post = createPostHandover({ ...f.dependencies, repository: {
    dataSource: "database", async createOnce() { throw new Error("private database diagnostics"); },
  } });
  const response = await post(request());
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes("private database diagnostics"));
  assert.ok(!body.includes('"data"'));
});

test("actual route has no demo authentication or pretend save", async () => {
  assert.equal((await POST(new Request("http://localhost/api/handovers", { method: "POST" }))).status, 401);
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "DEPENDENCY_NOT_READY");
});
