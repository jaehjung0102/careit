// Fictional, per-test memory storage. Never import this module from route.ts.
import { HandoverError, type CreateHandoverEvent, type CreateHandoverInput, type Handover } from "../_lib/contract";
import { createPostHandover, type CreateHandoverDependencies } from "../_lib/create-handover";

export const SENDER = "30000000-0000-4000-8000-000000000002";
export const RECIPIENT = "30000000-0000-4000-8000-000000000001";
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

export function fixture() {
  let time = new Date("2026-11-17T09:00:00.000Z");
  let accessAllowed = true;
  const rows = new Map<string, { owner: string; original: string; handover: Handover }>();
  const events: CreateHandoverEvent[] = [];
  let writes = 0;
  const dependencies: CreateHandoverDependencies = {
    now: () => new Date(time),
    newEventId: () => "50000000-0000-4000-8000-000000000001",
    async authenticate(token) {
      if (token === "demo-sender") return { id: SENDER };
      if (token === "demo-recipient") return { id: RECIPIENT };
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
    dependencies, post: createPostHandover(dependencies), rows, events,
    writes: () => writes,
    setTime: (value: string) => { time = new Date(value); },
    revokeAccess: () => { accessAllowed = false; },
  };
}
