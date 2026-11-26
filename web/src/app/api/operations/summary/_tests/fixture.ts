import { HandoverError } from "../../../handovers/_lib/contract";
import { createGetOperationsSummary } from "../_lib/get-operations-summary";

export const endpoint = "http://localhost/api/operations/summary";
const fixtureSession = "fictional-session";
const fixtureClock = "2026-11-25T14:00:00+09:00";

export function sampleDependencies() {
  return {
    dataSource: "mock",
    now: () => new Date(fixtureClock),
    async authenticate(token) {
      if (token !== fixtureSession) throw new HandoverError("UNAUTHENTICATED", "로그인을 확인해 주세요.");
      return { id: "fictional-user" };
    },
    async readAuthorizedSnapshot() {
      return {
        complete: true,
        handovers: [
          { id: "handover-1", status: "sent", due_at: "2026-11-25T13:00:00+09:00" },
          { id: "handover-2", status: "in_progress", due_at: fixtureClock },
          { id: "handover-3", status: "cancelled", due_at: "2026-11-25T12:00:00+09:00" },
        ],
        observations: [
          { id: "record-1", created_at: "2026-11-25T00:00:00+09:00", reflection_status: "reflected" },
          { id: "record-2", created_at: "2026-11-25T11:00:00+09:00", reflection_status: "pending" },
          { id: "record-3", created_at: "2026-11-24T23:59:00+09:00", reflection_status: "pending" },
        ],
      };
    },
  } satisfies NonNullable<Parameters<typeof createGetOperationsSummary>[0]>;
}

export function sampleRequest(url = endpoint) {
  return new Request(url, { headers: { Authorization: `Bearer ${fixtureSession}` } });
}
