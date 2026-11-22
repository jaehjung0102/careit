// B2-01 directions agreed in issue #25 (2026-11-20); adapter integration is separate.
// Keep the existing wire-version label for compatibility with PR #41 clients.
export const CONTRACT_VERSION = "b2-01-draft-3";

export const CATEGORIES = [
  "meal", "water", "bowel", "urination", "walking", "pain", "skin", "sleep",
  "mood", "cognition", "communication", "hygiene", "oral_care", "medication",
  "activity", "emotional_support",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const HANDOVER_STATUSES = ["sent", "acknowledged", "in_progress", "completed", "cancelled"] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];
export type HandoverActor = { id: string };

export type CreateHandoverInput = {
  id: string;
  resident_id: string;
  observation_ids: string[];
  title: string;
  confirmed_facts: string;
  follow_up_items: { id: string; category: Category; label: string }[];
  assignee_id: string;
  due_at: string;
};

export type Handover = Omit<CreateHandoverInput, "follow_up_items"> & {
  follow_up_items: (CreateHandoverInput["follow_up_items"][number] & { checked: boolean })[];
  sender_id: string;
  status: HandoverStatus;
  version: number;
  created_at: string;
  acknowledged_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
  follow_up_observation_ids: string[];
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  is_overdue: boolean;
};

export type CreateHandoverEvent = {
  id: string;
  handover_id: string;
  action: "create";
  actor_id: string;
  created_at: string;
  request_id: string;
  from_status: null;
  to_status: "sent";
  from_assignee_id: null;
  to_assignee_id: string;
  reason: null;
  version_before: 0;
  version_after: 1;
};

export type AcknowledgeHandoverInput = {
  request_id: string;
  expected_version: number;
  action: "acknowledge";
};

export type AcknowledgeHandoverEvent = Omit<CreateHandoverEvent,
  "action" | "from_status" | "to_status" | "from_assignee_id" | "version_before" | "version_after"
> & {
  action: "acknowledge";
  from_status: "sent";
  to_status: "acknowledged";
  from_assignee_id: string;
  version_before: number;
  version_after: number;
};

export type ImplementedHandoverEvent = CreateHandoverEvent | AcknowledgeHandoverEvent;

export function isHandoverOverdue(handover: Pick<Handover, "status" | "due_at">, now: Date): boolean {
  return handover.status !== "completed" && handover.status !== "cancelled"
    && Date.parse(handover.due_at) < now.getTime();
}

const ERROR_STATUS = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  VALIDATION_ERROR: 422,
  DEPENDENCY_NOT_READY: 503,
  SERVICE_UNAVAILABLE: 503,
} as const;

export class HandoverError extends Error {
  readonly status: number;
  constructor(
    readonly code: keyof typeof ERROR_STATUS,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.status = ERROR_STATUS[code];
  }
}
