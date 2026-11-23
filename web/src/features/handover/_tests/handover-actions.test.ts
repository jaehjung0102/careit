import assert from "node:assert/strict";
import test from "node:test";
import { HandoverError, type Handover } from "../../../app/api/handovers/_lib/contract";
import { parseCreateHandover } from "../../../app/api/handovers/_lib/validation";
import {
  applyHandoverPatch, availableActions, buildCreatedHandover, parseHandoverPatch, type HandoverPatch,
} from "../handoverActions";

const SENDER = "30000000-0000-4000-8000-000000000002";
const ASSIGNEE = "30000000-0000-4000-8000-000000000001";
const OTHER = "30000000-0000-4000-8000-000000000003";
const ITEM_A = "20000000-0000-4000-8000-000000000011";
const ITEM_B = "20000000-0000-4000-8000-000000000012";
const NOW = new Date("2026-11-23T03:00:00Z");
let seq = 0;
const rid = () => `40000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const eid = () => `50000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function sent(): Handover {
  const input = parseCreateHandover({
    id: "10000000-0000-4000-8000-000000000001",
    resident_id: "resident-2",
    observation_ids: ["00000000-0000-4000-8000-000000000011"],
    title: "식사량 변화 확인 요청",
    confirmed_facts: "점심 식사량 40%로 기록됨.",
    follow_up_items: [
      { id: ITEM_A, category: "meal", label: "저녁 식사량을 기록해 주세요." },
      { id: ITEM_B, category: "communication", label: "불편한 점을 여쭤봐 주세요." },
    ],
    assignee_id: ASSIGNEE,
    due_at: "2026-11-23T09:00:00Z",
  });
  return buildCreatedHandover(input, SENDER, NOW, eid()).handover;
}

type Body = HandoverPatch extends infer P ? (P extends HandoverPatch ? Omit<P, "request_id" | "expected_version"> : never) : never;
const run = (h: Handover, body: Body, actor: string, version = h.version) =>
  applyHandoverPatch(h, parseHandoverPatch({ ...body, request_id: rid(), expected_version: version }), actor, NOW, eid());

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof HandoverError);
    return error.code;
  }
  throw new Error("expected HandoverError");
}

test("create: server-owned fields, sent/version 1, create event", () => {
  const input = parseCreateHandover({
    id: "10000000-0000-4000-8000-000000000009", resident_id: "resident-1",
    observation_ids: ["00000000-0000-4000-8000-000000000021"], title: "t", confirmed_facts: "f",
    follow_up_items: [{ id: ITEM_A, category: "walking", label: "l" }], assignee_id: ASSIGNEE, due_at: "2026-11-23T09:00:00Z",
  });
  const { handover, event } = buildCreatedHandover(input, SENDER, NOW, eid());
  assert.equal(handover.status, "sent");
  assert.equal(handover.version, 1);
  assert.equal(handover.sender_id, SENDER);
  assert.equal(handover.follow_up_items[0].checked, false);
  assert.equal(event.action, "create");
  assert.equal(event.request_id, input.id);
  assert.deepEqual([event.version_before, event.version_after], [0, 1]);
});

test("create: deadline must be in the future (equal instant rejected)", () => {
  const input = parseCreateHandover({
    id: "10000000-0000-4000-8000-000000000008", resident_id: "resident-1",
    observation_ids: ["00000000-0000-4000-8000-000000000021"], title: "t", confirmed_facts: "f",
    follow_up_items: [{ id: ITEM_A, category: "walking", label: "l" }], assignee_id: ASSIGNEE, due_at: NOW.toISOString(),
  });
  assert.equal(code(() => buildCreatedHandover(input, SENDER, NOW, eid())), "VALIDATION_ERROR");
});

test("acknowledge and complete are separate steps: sent → acknowledged → in_progress → completed", () => {
  const h0 = sent();
  assert.deepEqual(availableActions(h0, ASSIGNEE), ["acknowledge"]);
  // 수신 확인만으로는 시작·완료할 수 없다.
  assert.equal(code(() => run(h0, { action: "complete", checked_item_ids: [ITEM_A, ITEM_B], completion_note: "n", follow_up_observation_ids: [] }, ASSIGNEE)), "INVALID_TRANSITION");
  assert.equal(code(() => run(h0, { action: "start" }, ASSIGNEE)), "INVALID_TRANSITION");

  const a = run(h0, { action: "acknowledge" }, ASSIGNEE);
  assert.equal(a.handover.status, "acknowledged");
  assert.equal(a.handover.acknowledged_at, NOW.toISOString());
  assert.equal(a.handover.started_at, null);
  assert.equal(a.handover.completed_at, null);
  assert.deepEqual(availableActions(a.handover, ASSIGNEE), ["start"]);
  assert.equal(code(() => run(a.handover, { action: "complete", checked_item_ids: [ITEM_A, ITEM_B], completion_note: "n", follow_up_observation_ids: [] }, ASSIGNEE)), "INVALID_TRANSITION");

  const s = run(a.handover, { action: "start" }, ASSIGNEE);
  assert.equal(s.handover.status, "in_progress");
  assert.deepEqual(availableActions(s.handover, ASSIGNEE), ["complete"]);

  const c = run(s.handover, { action: "complete", checked_item_ids: [ITEM_B, ITEM_A], completion_note: "  저녁 식사량 70% 확인  ", follow_up_observation_ids: [] }, ASSIGNEE);
  assert.equal(c.handover.status, "completed");
  assert.equal(c.handover.version, 4);
  assert.equal(c.handover.completed_by, ASSIGNEE);
  assert.equal(c.handover.completion_note, "저녁 식사량 70% 확인");
  assert.ok(c.handover.follow_up_items.every((i) => i.checked));
  assert.deepEqual([c.event.from_status, c.event.to_status, c.event.version_before, c.event.version_after], ["in_progress", "completed", 3, 4]);
  assert.deepEqual(availableActions(c.handover, ASSIGNEE), []);
  assert.deepEqual(availableActions(c.handover, SENDER), []);
});

test("complete requires every follow-up item and a note", () => {
  const h = run(run(sent(), { action: "acknowledge" }, ASSIGNEE).handover, { action: "start" }, ASSIGNEE).handover;
  assert.equal(code(() => run(h, { action: "complete", checked_item_ids: [ITEM_A], completion_note: "n", follow_up_observation_ids: [] }, ASSIGNEE)), "VALIDATION_ERROR");
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 3, action: "complete", checked_item_ids: [ITEM_A, ITEM_B], completion_note: "   ", follow_up_observation_ids: [] })), "VALIDATION_ERROR");
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 3, action: "complete", checked_item_ids: [ITEM_A, ITEM_A], completion_note: "n", follow_up_observation_ids: [] })), "VALIDATION_ERROR");
});

test("only the assignee acknowledges/starts/completes; only the sender reassigns/cancels", () => {
  const h = sent();
  assert.equal(code(() => run(h, { action: "acknowledge" }, SENDER)), "FORBIDDEN");
  assert.equal(code(() => run(h, { action: "acknowledge" }, OTHER)), "FORBIDDEN");
  assert.equal(code(() => run(h, { action: "cancel", reason: "r" }, ASSIGNEE)), "FORBIDDEN");
  assert.deepEqual(availableActions(h, SENDER), ["reassign", "cancel"]);
  assert.deepEqual(availableActions(h, OTHER), []);
});

test("stale expected_version is a VERSION_CONFLICT, not an overwrite", () => {
  const h = run(sent(), { action: "acknowledge" }, ASSIGNEE).handover;
  assert.equal(code(() => run(h, { action: "start" }, ASSIGNEE, 1)), "VERSION_CONFLICT");
});

test("reassign keeps the deadline, resets progress and requires re-acknowledgement", () => {
  const started = run(run(sent(), { action: "acknowledge" }, ASSIGNEE).handover, { action: "start" }, ASSIGNEE).handover;
  assert.equal(code(() => run(started, { action: "reassign", assignee_id: ASSIGNEE, reason: "r" }, SENDER)), "VALIDATION_ERROR");
  const r = run(started, { action: "reassign", assignee_id: OTHER, reason: "근무 변경" }, SENDER);
  assert.equal(r.handover.status, "sent");
  assert.equal(r.handover.assignee_id, OTHER);
  assert.equal(r.handover.due_at, started.due_at);
  assert.equal(r.handover.acknowledged_at, null);
  assert.equal(r.handover.started_at, null);
  assert.ok(r.handover.follow_up_items.every((i) => !i.checked));
  assert.deepEqual([r.event.from_assignee_id, r.event.to_assignee_id, r.event.reason], [ASSIGNEE, OTHER, "근무 변경"]);
  // 이전 담당자는 더 이상 진행할 수 없고, 새 담당자가 수신 확인부터 한다.
  assert.deepEqual(availableActions(r.handover, ASSIGNEE), []);
  assert.deepEqual(availableActions(r.handover, OTHER), ["acknowledge"]);
});

test("cancel needs a reason, keeps progress fields and is terminal", () => {
  const a = run(sent(), { action: "acknowledge" }, ASSIGNEE).handover;
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 2, action: "cancel", reason: "" })), "VALIDATION_ERROR");
  const c = run(a, { action: "cancel", reason: "중복 인계" }, SENDER);
  assert.equal(c.handover.status, "cancelled");
  assert.equal(c.handover.acknowledged_at, a.acknowledged_at);
  assert.equal(c.handover.cancellation_reason, "중복 인계");
  assert.equal(c.handover.cancelled_by, SENDER);
  assert.equal(code(() => run(c.handover, { action: "reassign", assignee_id: OTHER, reason: "r" }, SENDER)), "INVALID_TRANSITION");
});

test("patch body: each action accepts only its own fields", () => {
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 1, action: "acknowledge", reason: "x" })), "INVALID_REQUEST");
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 1, action: "delete" })), "VALIDATION_ERROR");
  assert.equal(code(() => parseHandoverPatch({ request_id: "not-a-uuid", expected_version: 1, action: "acknowledge" })), "VALIDATION_ERROR");
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 0, action: "acknowledge" })), "VALIDATION_ERROR");
  assert.equal(code(() => parseHandoverPatch({ request_id: rid(), expected_version: 1, action: "reassign", assignee_id: OTHER, reason: "x".repeat(501) })), "VALIDATION_ERROR");
});
