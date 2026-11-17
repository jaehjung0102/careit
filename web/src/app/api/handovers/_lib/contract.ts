// Provisional B2-01 draft-3 contract (PR #40); keep changes inside B2's area.
export const CONTRACT_VERSION = "b2-01-draft-3";

export const CATEGORIES = [
  "meal", "water", "bowel", "urination", "walking", "pain", "skin", "sleep",
  "mood", "cognition", "communication", "hygiene", "oral_care", "medication",
  "activity", "emotional_support",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type HandoverStatus = "sent" | "acknowledged" | "in_progress" | "completed" | "cancelled";

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

const ERROR_STATUS = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
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
