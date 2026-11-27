import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../[id]/route";
import { ACK_INPUT, acknowledgementRequest, fixture, INPUT, listRequest, OTHER, RECIPIENT, request } from "./fixture";

async function setup() {
  const f = fixture();
  await f.post(request());
  const change = (action: string, version: number, fields = {}, token = "demo-recipient", requestId = crypto.randomUUID()) =>
    f.detail.patch(acknowledgementRequest({ action, expected_version: version, request_id: requestId, ...fields }, token), INPUT.id);
  const read = (token = "demo-recipient") => f.detail.get(listRequest("", token), INPUT.id);
  return { f, change, read };
}
const completion = { checked_item_ids: INPUT.follow_up_items.map(item => item.id), completion_note: "확인 완료" };

test("detail is read-only and ordered; completion records the actor, checklist and linked observation", async () => {
  const { f, change, read } = await setup();
  assert.equal((await (await read()).json()).data.handover.status, "sent");
  assert.equal((await change("start", 1)).status, 409);
  await change("acknowledge", 1);
  await change("start", 2);
  assert.equal((await change("complete", 3, { ...completion, checked_item_ids: [OTHER] })).status, 422);
  assert.equal((await change("complete", 3, { ...completion, completion_note: " " })).status, 422);
  assert.equal((await change("complete", 3, { ...completion, follow_up_observation_ids: [OTHER] })).status, 404);
  assert.equal((await change("complete", 3, { ...completion, follow_up_observation_ids: INPUT.observation_ids })).status, 200);
  f.events.reverse();
  const { data, meta } = await (await read()).json();
  assert.equal(meta.data_source, "mock");
  assert.deepEqual(data.events.map((event: {version_after: number}) => event.version_after), [1,2,3,4]);
  assert.equal(data.handover.completed_by, RECIPIENT);
  assert.equal(data.handover.completed_at, data.events[3].created_at);
  assert.equal(data.handover.follow_up_items[0].checked, true);
  assert.deepEqual(data.handover.follow_up_observation_ids, INPUT.observation_ids);
  assert.equal(data.handover.completion_note, completion.completion_note);
  assert.equal((await change("cancel", 4, { reason: "취소" }, "demo-admin")).status, 409);
});

test("reassignment requires a valid new assignee, preserves deadline/history and requires a new acknowledgement", async () => {
  const { f, change, read } = await setup();
  await f.detail.patch(acknowledgementRequest(), INPUT.id);
  await change("start", 2);
  const fields = { assignee_id: OTHER, reason: "교대" };
  assert.equal((await change("reassign", 3, fields)).status, 403);
  assert.equal((await change("reassign", 3, { ...fields, assignee_id: RECIPIENT }, "demo-sender")).status, 422);
  assert.equal((await change("reassign", 3, { ...fields, assignee_id: INPUT.id }, "demo-sender")).status, 404);
  f.rows.get(INPUT.id)!.handover.follow_up_items[0].checked = true;
  f.setTime(INPUT.due_at);
  const result = await (await change("reassign", 3, fields, "demo-admin")).json();
  assert.equal(result.data.event.reason, fields.reason);
  assert.equal(result.data.handover.status, "sent");
  assert.equal(result.data.handover.acknowledged_at, null);
  assert.equal(result.data.handover.started_at, null);
  assert.equal(result.data.handover.follow_up_items[0].checked, false);
  assert.equal(result.data.handover.due_at, INPUT.due_at);
  assert.equal(result.data.handover.is_overdue, false);
  assert.equal((await read()).status, 404);
  assert.equal((await f.detail.patch(acknowledgementRequest(ACK_INPUT), INPUT.id)).status, 404);
  f.setTime("2026-11-17T12:00:00.001Z");
  const { data } = await (await read("demo-other")).json();
  assert.equal(data.handover.is_overdue, true);
  assert.equal(data.events.length, 4);
  assert.equal((await change("start", 4, {}, "demo-other")).status, 409);
  assert.equal((await change("acknowledge", 4, {}, "demo-other")).status, 200);
});

test("cancel preserves earlier progress; a failed save can retry and a successful retry does not add history", async () => {
  const { f, change, read } = await setup();
  await change("acknowledge", 1);
  const before = await (await change("start", 2)).json();
  const id = crypto.randomUUID();
  const cancel = (reason: string) => change("cancel", 3, { reason }, "demo-sender", id);
  f.failActionCommit(true);
  assert.equal((await cancel("중복")).status, 503);
  assert.equal(f.events.length, 3);
  f.failActionCommit(false);
  const first = await (await cancel("중복")).json();
  const retry = await (await cancel("중복")).json();
  assert.deepEqual(retry, first);
  assert.equal(first.data.handover.started_at, before.data.handover.started_at);
  assert.equal(first.data.handover.cancelled_by, first.data.handover.sender_id);
  assert.equal(first.data.handover.is_overdue, false);
  assert.equal((await (await cancel("다른 사유")).json()).error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(f.events.length, 4);
  f.revokeAccess();
  assert.equal((await read()).status, 404);
  assert.equal((await cancel("중복")).status, 404);
});

test("competing completion and reassignment on one version commit only one event", async () => {
  const { f, change } = await setup();
  await change("acknowledge", 1);
  await change("start", 2);
  const responses = await Promise.all([
    change("complete", 3, completion),
    change("reassign", 3, { assignee_id: OTHER, reason: "교대" }, "demo-sender"),
  ]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  assert.equal(f.events.length, 4);
  assert.equal(f.rows.get(INPUT.id)!.handover.version, 4);
});

test("detail route requires authentication and real storage", async () => {
  const context = { params: Promise.resolve({ id: INPUT.id }) };
  assert.equal((await GET(new Request("http://localhost"), context)).status, 401);
  assert.equal((await GET(listRequest(), context)).status, 503);
});

test("one retry key is shared by all actions for the actor and handover", async () => {
  const { f, change } = await setup();
  const id = crypto.randomUUID();
  await change("acknowledge", 1, {}, "demo-recipient", id);
  const changed = await change("start", 2, {}, "demo-recipient", id);
  assert.equal(changed.status, 409);
  assert.equal((await changed.json()).error.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(f.events.length, 2);
});

test("action-specific fields, limits and permissions are enforced before saving", async () => {
  const { f, change } = await setup();
  await change("acknowledge", 1);
  await change("start", 2);
  const checked = completion.checked_item_ids[0];
  assert.equal((await change("complete", 3, { ...completion, checked_item_ids: [checked, checked] })).status, 422);
  assert.equal((await change("complete", 3, { ...completion, completion_note: "가".repeat(2001) })).status, 422);
  assert.equal((await change("complete", 3, { ...completion, follow_up_observation_ids: null })).status, 422);
  assert.equal((await change("complete", 3, completion, "demo-sender")).status, 403);
  assert.equal((await change("cancel", 3, { reason: " " }, "demo-sender")).status, 422);
  assert.equal((await change("cancel", 3, { reason: "교대", canManage: true })).status, 400);
  assert.equal(f.events.length, 3);
});
