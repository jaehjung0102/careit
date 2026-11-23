import type { HandoverStatus } from "../../app/api/handovers/_lib/contract";

// docs/api.md 7절 HandoverEvent. 계약 코드에는 아직 구현된 action만 있어 화면용으로 전체 모양을 둔다.
export type HandoverAction = "create" | "acknowledge" | "start" | "complete" | "reassign" | "cancel";
export type HandoverEvent = {
  id: string;
  handover_id: string;
  action: HandoverAction;
  actor_id: string;
  created_at: string;
  request_id: string;
  from_status: HandoverStatus | null;
  to_status: HandoverStatus;
  from_assignee_id: string | null;
  to_assignee_id: string;
  reason: string | null;
  version_before: number;
  version_after: number;
};
