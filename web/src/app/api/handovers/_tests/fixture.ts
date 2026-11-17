// Fictional, per-test memory storage. Never import this module from route.ts.
import { HandoverError, isHandoverOverdue, type AcknowledgeHandoverInput, type ImplementedHandoverEvent, type CreateHandoverInput, type Handover } from "../_lib/contract";
import { createPostHandover, type CreateHandoverDependencies } from "../_lib/create-handover";
import { createGetHandovers, type ListHandoverDependencies } from "../_lib/list-handovers";
import { createAcknowledgeHandover, type AcknowledgeHandoverDependencies, type AcknowledgementResult } from "../_lib/acknowledge-handover";

export const SENDER = "30000000-0000-4000-8000-000000000002";
export const RECIPIENT = "30000000-0000-4000-8000-000000000001";
export const OTHER = "30000000-0000-4000-8000-000000000003";
export const INPUT: CreateHandoverInput = {
  id: "10000000-0000-4000-8000-000000000001",
  resident_id: "resident-1",
  observation_ids: ["00000000-0000-4000-8000-000000000001"],
  title: "저녁 식사 기록 확인",
  confirmed_facts: "점심 식사량 50%, 물 150mL 섭취.",
  follow_up_items: [{
    id: "20000000-0000-4000-8000-000000000001", category: "meal", label: "저녁 식사량을 기록해 주세요.",
  }],
  assignee_id: RECIPIENT,
  due_at: "2026-11-17T12:00:00.000Z",
};

export function request(body: unknown = INPUT, token = "demo-sender"): Request {
  return new Request("http://localhost/api/handovers", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function listRequest(query = "", token = "demo-sender"): Request {
  return new Request(`http://localhost/api/handovers${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export const ACK_INPUT: AcknowledgeHandoverInput = {
  request_id: "40000000-0000-4000-8000-000000000001", expected_version: 1, action: "acknowledge",
};

export function acknowledgementRequest(body: unknown = ACK_INPUT, token = "demo-recipient", id = INPUT.id): Request {
  return new Request(`http://localhost/api/handovers/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function fixture() {
  let time = new Date("2026-11-17T09:00:00.000Z");
  let accessAllowed = true;
  const rows = new Map<string, { owner: string; original: string; handover: Handover }>();
  const events: ImplementedHandoverEvent[] = [];
  const acknowledgementRequests = new Map<string, { original: string; event: AcknowledgementResult["event"] }>();
  let eventSequence = 0;
  let writes = 0;
  let listReads = 0;
  let acknowledgementWrites = 0;
  let failAcknowledgement = false;
  const dependencies: CreateHandoverDependencies & ListHandoverDependencies & AcknowledgeHandoverDependencies = {
    now: () => new Date(time),
    newEventId: () => `50000000-0000-4000-8000-${String(++eventSequence).padStart(12, "0")}`,
    async authenticate(token) {
      if (token === "demo-sender") return { id: SENDER };
      if (token === "demo-recipient") return { id: RECIPIENT };
      if (token === "demo-other") return { id: OTHER };
      if (token === "demo-family") return { id: "family" };
      throw new HandoverError("UNAUTHENTICATED", "로그인을 확인해 주세요.");
    },
    async authorizeCreate(actor, input) {
      if (actor.id === "family") throw new HandoverError("FORBIDDEN", "인계 작성 권한이 없습니다.");
      if (!accessAllowed || input.resident_id !== "resident-1" || input.assignee_id !== RECIPIENT
        || input.observation_ids.some((id) => id !== INPUT.observation_ids[0])) {
        throw new HandoverError("NOT_FOUND", "접근 가능한 기록 또는 담당자를 찾을 수 없습니다.");
      }
    },
    repository: {
      dataSource: "mock",
      async acknowledgeOnce(actor, handoverId, input, apply) {
        // Single-process test transaction: no await between lookup and commit.
        const row = rows.get(handoverId);
        if (!row || !accessAllowed || !["resident-1", "resident-2"].includes(row.handover.resident_id)
          || (row.handover.sender_id !== actor.id && row.handover.assignee_id !== actor.id)) {
          throw new HandoverError("NOT_FOUND", "인계를 찾을 수 없습니다.");
        }
        const key = `${actor.id}:${handoverId}:${input.request_id}`;
        const original = JSON.stringify(input);
        const previous = acknowledgementRequests.get(key);
        if (previous) {
          if (previous.original !== original) {
            throw new HandoverError("IDEMPOTENCY_CONFLICT", "같은 요청 ID에 다른 내용이 있습니다.");
          }
          return { handover: structuredClone(row.handover), event: structuredClone(previous.event) };
        }
        const changed = apply(structuredClone(row.handover));
        // Failure injection before the test commit, leaving row/event/request unchanged.
        if (failAcknowledgement) throw new HandoverError("SERVICE_UNAVAILABLE", "잠시 후 다시 시도해 주세요.");
        row.handover = structuredClone(changed.handover);
        events.push(structuredClone(changed.event));
        acknowledgementRequests.set(key, { original, event: structuredClone(changed.event) });
        acknowledgementWrites += 1;
        return structuredClone(changed);
      },
      async listVisible(actor, query, asOf) {
        listReads += 1;
        if (actor.id === "family") throw new HandoverError("FORBIDDEN", "인계 조회 권한이 없습니다.");
        if (!accessAllowed) return [];
        const rowsInView = [...rows.values()].map((entry) => entry.handover)
          // Fictional access policy only: two residents in this demo facility,
          // sender/recipient access. Resident 3 represents an inaccessible facility.
          .filter((row) => ["resident-1", "resident-2"].includes(row.resident_id)
            && (row.sender_id === actor.id || row.assignee_id === actor.id))
          .filter((row) => (query.resident_id === null || row.resident_id === query.resident_id)
            && (query.assignee_id === null || row.assignee_id === query.assignee_id)
            && (query.status === null || row.status === query.status)
            && (query.overdue === null || isHandoverOverdue(row, asOf) === query.overdue))
          .filter((row) => !query.after || Date.parse(row.created_at) < Date.parse(query.after.created_at)
            || (Date.parse(row.created_at) === Date.parse(query.after.created_at) && row.id < query.after.id))
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
            || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1));
        return structuredClone(rowsInView.slice(0, query.limit + 1));
      },
      async createOnce(actor, input, build) {
        // No await between lookup and insert: atomic ONLY within this test's
        // JS process. B1's database adapter needs a real transaction/unique key.
        const previous = rows.get(input.id);
        const original = JSON.stringify(input);
        if (previous) {
          if (previous.owner !== actor.id) throw new HandoverError("NOT_FOUND", "인계를 찾을 수 없습니다.");
          if (previous.original !== original) {
            throw new HandoverError("IDEMPOTENCY_CONFLICT", "같은 요청 ID에 다른 내용이 있습니다.");
          }
          return { handover: structuredClone(previous.handover), created: false };
        }
        const { handover, event } = build();
        rows.set(input.id, { owner: actor.id, original, handover: structuredClone(handover) });
        events.push(structuredClone(event));
        writes += 1;
        return { handover: structuredClone(handover), created: true };
      },
    },
  };
  return {
    dependencies, post: createPostHandover(dependencies), get: createGetHandovers(dependencies),
    acknowledge: createAcknowledgeHandover(dependencies), rows, events,
    writes: () => writes,
    listReads: () => listReads,
    acknowledgementWrites: () => acknowledgementWrites,
    acknowledgementRequestCount: () => acknowledgementRequests.size,
    failAcknowledgementCommit: (value: boolean) => { failAcknowledgement = value; },
    setTime: (value: string) => { time = new Date(value); },
    revokeAccess: () => { accessAllowed = false; },
  };
}
