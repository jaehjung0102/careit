import assert from "node:assert/strict";
import { test } from "node:test";
import { PATCH } from "../[id]/route";
import { createAcknowledgeHandover } from "../_lib/acknowledge-handover";
import type { HandoverStatus } from "../_lib/contract";
import { ACK_INPUT, acknowledgementRequest, fixture, INPUT, listRequest, OTHER, RECIPIENT, request } from "./fixture";

async function created() {
  const f = fixture();
  assert.equal((await f.post(request())).status, 201);
  f.setTime("2026-11-17T09:05:00Z");
  return f;
}

test("recipient acknowledges; server time/actor are recorded and list shows the new status", async () => {
  const f = await created();
  const original = structuredClone(f.rows.get(INPUT.id)!.handover);
  const response = await f.acknowledge(acknowledgementRequest(), INPUT.id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.deepEqual(result.data.handover, { ...original, status: "acknowledged", version: 2,
    acknowledged_at: "2026-11-17T09:05:00.000Z" });
  assert.equal(result.meta.data_source, "mock");
  assert.equal(result.meta.contract_version, "b2-01-draft-3");
  assert.equal(result.data.event.actor_id, RECIPIENT);
  assert.equal(result.data.event.action, "acknowledge");
  assert.equal(result.data.event.from_status, "sent");
  assert.equal(result.data.event.to_status, "acknowledged");
  assert.equal(result.data.event.from_assignee_id, RECIPIENT);
  assert.equal(result.data.event.to_assignee_id, RECIPIENT);
  assert.equal(result.data.event.version_before, 1);
  assert.equal(result.data.event.version_after, 2);
  assert.equal(result.data.event.request_id, ACK_INPUT.request_id);
  assert.equal(result.data.event.created_at, result.data.handover.acknowledged_at);
  assert.equal(new Set(f.events.map((event) => event.id)).size, 2);
  assert.equal(f.acknowledgementWrites(), 1);
  const list = await (await f.get(listRequest("status=acknowledged", "demo-recipient"))).json();
  assert.deepEqual(list.data, [result.data.handover]);
  assert.equal(f.events.length, 2);
});

test("identical retry returns the original event/time without a second write", async () => {
  const f = await created();
  const first = await (await f.acknowledge(acknowledgementRequest(), INPUT.id)).json();
  f.setTime("2026-11-17T09:10:00Z");
  const retry = await f.acknowledge(acknowledgementRequest(), INPUT.id);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), first);
  assert.equal(f.events.length, 2);
  assert.equal(f.acknowledgementWrites(), 1);
  assert.equal(f.acknowledgementRequestCount(), 1);
});

test("simultaneous identical acknowledgements write once", async () => {
  const f = await created();
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.acknowledge(acknowledgementRequest(), INPUT.id)));
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(f.rows.get(INPUT.id)?.handover.version, 2);
  assert.equal(f.events.length, 2);
  assert.equal(f.acknowledgementWrites(), 1);
});

test("competing new request IDs based on version 1 allow only one change", async () => {
  const f = await created();
  const responses = await Promise.all([1, 2].map((n) => f.acknowledge(acknowledgementRequest({
    ...ACK_INPUT, request_id: `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  }), INPUT.id)));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const rejected = responses.find((r) => r.status === 409)!;
  assert.equal((await rejected.json()).error.code, "VERSION_CONFLICT");
  assert.equal(f.acknowledgementWrites(), 1);
  assert.equal(f.acknowledgementRequestCount(), 1);
  assert.equal(f.events.length, 2);
});

test("reusing a request ID with changed content is a conflict", async () => {
  const f = await created();
  await f.acknowledge(acknowledgementRequest(), INPUT.id);
  const response = await f.acknowledge(acknowledgementRequest({ ...ACK_INPUT, expected_version: 2 }), INPUT.id);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(f.events.length, 2);
});

test("a new stale request conflicts; a current-version second acknowledgement is an invalid transition", async () => {
  const f = await created();
  await f.acknowledge(acknowledgementRequest(), INPUT.id);
  const requestId = "40000000-0000-4000-8000-000000000002";
  const stale = await f.acknowledge(acknowledgementRequest({ ...ACK_INPUT, request_id: requestId }), INPUT.id);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "VERSION_CONFLICT");
  const repeat = await f.acknowledge(acknowledgementRequest({ ...ACK_INPUT, request_id: requestId, expected_version: 2 }), INPUT.id);
  assert.equal(repeat.status, 409);
  assert.equal((await repeat.json()).error.code, "INVALID_TRANSITION");
  assert.equal(f.acknowledgementRequestCount(), 1);
});

test("sender cannot acknowledge for recipient; hidden IDs reveal no handover", async () => {
  const f = await created();
  const sender = await f.acknowledge(acknowledgementRequest(ACK_INPUT, "demo-sender"), INPUT.id);
  assert.equal(sender.status, 403);
  assert.equal((await sender.json()).error.code, "FORBIDDEN");
  assert.equal((await f.acknowledge(acknowledgementRequest(ACK_INPUT, "demo-other"), INPUT.id)).status, 404);
  assert.equal((await f.acknowledge(acknowledgementRequest(), "10000000-0000-4000-8000-000000000099")).status, 404);
  f.rows.get(INPUT.id)!.handover.resident_id = "resident-3";
  assert.equal((await f.acknowledge(acknowledgementRequest(), INPUT.id)).status, 404);
  assert.equal(f.acknowledgementWrites(), 0);
  assert.equal(f.acknowledgementRequestCount(), 0);
  assert.equal(f.events.length, 1);
});

test("access is checked again on retries and after reassignment", async () => {
  const f = await created();
  await f.acknowledge(acknowledgementRequest(), INPUT.id);
  f.rows.get(INPUT.id)!.handover.assignee_id = OTHER;
  assert.equal((await f.acknowledge(acknowledgementRequest(), INPUT.id)).status, 404);
  f.rows.get(INPUT.id)!.handover.assignee_id = RECIPIENT;
  f.revokeAccess();
  assert.equal((await f.acknowledge(acknowledgementRequest(), INPUT.id)).status, 404);
  assert.equal(f.acknowledgementWrites(), 1);
});

test("acknowledgement replay returns current handover plus original event after later changes", async () => {
  const f = await created();
  const first = await (await f.acknowledge(acknowledgementRequest(), INPUT.id)).json();
  const row = f.rows.get(INPUT.id)!;
  row.handover.status = "in_progress";
  row.handover.version = 3;
  row.handover.started_at = "2026-11-17T09:20:00.000Z";
  f.setTime("2026-11-18T09:00:00Z");
  const retry = await (await f.acknowledge(acknowledgementRequest(), INPUT.id)).json();
  assert.equal(retry.data.handover.status, "in_progress");
  assert.equal(retry.data.handover.version, 3);
  assert.equal(retry.data.handover.is_overdue, true);
  assert.deepEqual(retry.data.event, first.data.event);
  assert.equal(f.acknowledgementWrites(), 1);
});

for (const status of ["in_progress", "completed", "cancelled"] as HandoverStatus[]) {
  test(`cannot acknowledge a new request from ${status}`, async () => {
    const f = await created();
    f.rows.get(INPUT.id)!.handover.status = status;
    const response = await f.acknowledge(acknowledgementRequest(), INPUT.id);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "INVALID_TRANSITION");
    assert.equal(f.acknowledgementWrites(), 0);
    assert.equal(f.events.length, 1);
  });
}

test("an overdue sent handover can still be acknowledged without hiding its overdue flag", async () => {
  const f = await created();
  f.setTime("2026-11-18T09:00:00Z");
  const response = await f.acknowledge(acknowledgementRequest(), INPUT.id);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.handover.is_overdue, true);
  assert.equal(data.handover.acknowledged_at, "2026-11-18T09:00:00.000Z");
});

test("failed commit leaves no state/event/request change and the same request can be retried", async () => {
  const f = await created();
  const original = structuredClone(f.rows.get(INPUT.id));
  f.failAcknowledgementCommit(true);
  const failed = await f.acknowledge(acknowledgementRequest(), INPUT.id);
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.retryable, true);
  assert.deepEqual(f.rows.get(INPUT.id), original);
  assert.equal(f.events.length, 1);
  assert.equal(f.acknowledgementRequestCount(), 0);
  f.failAcknowledgementCommit(false);
  assert.equal((await f.acknowledge(acknowledgementRequest(), INPUT.id)).status, 200);
  assert.equal(f.acknowledgementWrites(), 1);
  assert.equal(f.events.length, 2);
});

for (const example of [
  { name: "missing request ID", patch: { request_id: undefined }, status: 422 },
  { name: "invalid request ID", patch: { request_id: "not-a-uuid" }, status: 422 },
  { name: "missing version", patch: { expected_version: undefined }, status: 422 },
  { name: "zero version", patch: { expected_version: 0 }, status: 422 },
  { name: "negative version", patch: { expected_version: -1 }, status: 422 },
  { name: "fractional version", patch: { expected_version: 1.5 }, status: 422 },
  { name: "unsafe version", patch: { expected_version: Number.MAX_SAFE_INTEGER + 1 }, status: 422 },
  { name: "string version", patch: { expected_version: "1" }, status: 422 },
  { name: "missing action", patch: { action: undefined }, status: 422 },
  { name: "unsupported action", patch: { action: "complete" }, status: 422 },
  { name: "forged actor", patch: { actor_id: RECIPIENT }, status: 400 },
  { name: "forged time", patch: { acknowledged_at: "2026-01-01T00:00:00Z" }, status: 400 },
  { name: "completion-only field", patch: { completion_note: "done" }, status: 400 },
]) {
  test(`reject ${example.name} without an acknowledgement write`, async () => {
    const f = await created();
    assert.equal((await f.acknowledge(acknowledgementRequest({ ...ACK_INPUT, ...example.patch }), INPUT.id)).status, example.status);
    assert.equal(f.acknowledgementWrites(), 0);
    assert.equal(f.acknowledgementRequestCount(), 0);
    assert.equal(f.events.length, 1);
  });
}

test("invalid ID, malformed JSON/body and wrong content type are rejected", async () => {
  const f = await created();
  assert.equal((await f.acknowledge(acknowledgementRequest(), "bad-id")).status, 400);
  for (const body of [null, [], 1]) assert.equal((await f.acknowledge(acknowledgementRequest(body), INPUT.id)).status, 422);
  for (const [body, contentType] of [["{", "application/json"], [JSON.stringify(ACK_INPUT), "text/plain"]]) {
    const req = new Request(`http://localhost/api/handovers/${INPUT.id}`, {
      method: "PATCH", headers: { Authorization: "Bearer demo-recipient", "Content-Type": contentType }, body,
    });
    assert.equal((await f.acknowledge(req, INPUT.id)).status, 400);
  }
  assert.equal(f.acknowledgementWrites(), 0);
});

test("invalid login and unexpected storage errors never produce fake success", async () => {
  const f = await created();
  assert.equal((await f.acknowledge(acknowledgementRequest(ACK_INPUT, "invalid-token"), INPUT.id)).status, 401);
  const acknowledge = createAcknowledgeHandover({ ...f.dependencies, repository: {
    dataSource: "database", async acknowledgeOnce() { throw new Error("private storage diagnostics"); },
  } });
  const response = await acknowledge(acknowledgementRequest(), INPUT.id);
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes("private storage diagnostics"));
  assert.ok(!body.includes('"data"'));
});

test("actual dynamic PATCH route is closed until B1 integration", async () => {
  const context = { params: Promise.resolve({ id: INPUT.id }) };
  assert.equal((await PATCH(new Request(`http://localhost/api/handovers/${INPUT.id}`, { method: "PATCH" }), context)).status, 401);
  const response = await PATCH(acknowledgementRequest(), context);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "DEPENDENCY_NOT_READY");
});
