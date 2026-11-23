import {
  HandoverError, type CreateHandoverInput, type Handover, type HandoverStatus,
} from "../../app/api/handovers/_lib/contract";
import { isUuid } from "../../app/api/handovers/_lib/validation";
import type { HandoverEvent } from "./handoverTypes";

// docs/api.md 7·8절의 인계 상태 전이를 화면 mock에서 그대로 따르기 위한 순수 함수.
// 실제 API(#26 후속)가 연결되면 서버가 같은 규칙을 검사하고, 화면은 응답만 반영한다.
// 서버 시각·작성자·이벤트는 원래 서버가 정한다. 여기서는 mock 저장소가 그 역할을 대신한다.

type PatchBase = { request_id: string; expected_version: number };
export type HandoverPatch =
  | (PatchBase & { action: "acknowledge" | "start" })
  | (PatchBase & {
    action: "complete";
    checked_item_ids: string[];
    completion_note: string;
    follow_up_observation_ids: string[];
  })
  | (PatchBase & { action: "reassign"; assignee_id: string; reason: string })
  | (PatchBase & { action: "cancel"; reason: string });
export type HandoverPatchAction = HandoverPatch["action"];

const PATCH_FIELDS: Record<HandoverPatchAction, readonly string[]> = {
  acknowledge: [],
  start: [],
  complete: ["checked_item_ids", "completion_note", "follow_up_observation_ids"],
  reassign: ["assignee_id", "reason"],
  cancel: ["reason"],
};

function invalid(field: string, message: string): never {
  throw new HandoverError("VALIDATION_ERROR", "입력을 확인해 주세요.", { [field]: message });
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > max) {
    invalid(field, `1~${max}자로 입력해 주세요.`);
  }
  return value.trim();
}

function uuidList(value: unknown, field: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || !value.every(isUuid)) {
    invalid(field, `${min}~${max}개의 ID가 필요합니다.`);
  }
  const ids = value.map((id: string) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) invalid(field, "중복 ID를 제거해 주세요.");
  return ids;
}

// PATCH /api/handovers/{id} 본문 검사. 각 action은 자기 필드만 보낼 수 있다.
export function parseHandoverPatch(body: unknown): HandoverPatch {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HandoverError("INVALID_REQUEST", "요청 형식을 확인해 주세요.");
  }
  const input = body as Record<string, unknown>;
  const action = input.action;
  if (typeof action !== "string" || !Object.hasOwn(PATCH_FIELDS, action)) {
    invalid("action", "지원하는 동작이 아닙니다.");
  }
  const allowed = ["request_id", "expected_version", "action", ...PATCH_FIELDS[action as HandoverPatchAction]];
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new HandoverError("INVALID_REQUEST", "이 동작에 허용되지 않은 필드가 있습니다.");
  }
  if (!isUuid(input.request_id)) invalid("request_id", "유효한 요청 ID가 필요합니다.");
  const v = input.expected_version;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) invalid("expected_version", "양의 정수가 필요합니다.");
  const base = { request_id: input.request_id.toLowerCase(), expected_version: v };
  switch (action as HandoverPatchAction) {
    case "acknowledge":
    case "start":
      return { ...base, action: action as "acknowledge" | "start" };
    case "complete":
      return {
        ...base, action: "complete",
        checked_item_ids: uuidList(input.checked_item_ids, "checked_item_ids", 1, 10),
        completion_note: text(input.completion_note, "completion_note", 2000),
        follow_up_observation_ids: uuidList(input.follow_up_observation_ids ?? [], "follow_up_observation_ids", 0, 20),
      };
    case "reassign":
      if (!isUuid(input.assignee_id)) invalid("assignee_id", "새 담당자를 선택해 주세요.");
      return { ...base, action: "reassign", assignee_id: input.assignee_id.toLowerCase(), reason: text(input.reason, "reason", 500) };
    case "cancel":
      return { ...base, action: "cancel", reason: text(input.reason, "reason", 500) };
  }
}

const FROM: Record<HandoverPatchAction, readonly HandoverStatus[]> = {
  acknowledge: ["sent"],
  start: ["acknowledged"],
  complete: ["in_progress"],
  reassign: ["sent", "acknowledged", "in_progress"],
  cancel: ["sent", "acknowledged", "in_progress"],
};

// 수신·시작·완료는 지정 수신자, 담당 변경·취소는 송신자. 관리자 역할은 B1 권한 정책 연결 후 추가한다.
export function canPerform(h: Pick<Handover, "assignee_id" | "sender_id">, action: HandoverPatchAction, actorId: string) {
  return action === "reassign" || action === "cancel" ? h.sender_id === actorId : h.assignee_id === actorId;
}

// 현재 사용자가 지금 상태에서 할 수 있는 동작. 화면 버튼 표시에만 쓰며 서버 검사를 대신하지 않는다.
export function availableActions(h: Pick<Handover, "assignee_id" | "sender_id" | "status">, actorId: string): HandoverPatchAction[] {
  return (Object.keys(FROM) as HandoverPatchAction[])
    .filter((action) => FROM[action].includes(h.status) && canPerform(h, action, actorId));
}

export type HandoverChange = { handover: Handover; event: HandoverEvent };

const NEXT: Record<HandoverPatchAction, HandoverStatus> = {
  acknowledge: "acknowledged", start: "in_progress", complete: "completed", reassign: "sent", cancel: "cancelled",
};

export function applyHandoverPatch(
  current: Handover, patch: HandoverPatch, actorId: string, now: Date, eventId: string,
): HandoverChange {
  if (!canPerform(current, patch.action, actorId)) {
    throw new HandoverError("FORBIDDEN", patch.action === "reassign" || patch.action === "cancel"
      ? "인계를 보낸 사람만 담당자를 바꾸거나 취소할 수 있어요."
      : "지정된 담당자만 수신 확인·조치할 수 있어요.");
  }
  if (current.version !== patch.expected_version) {
    throw new HandoverError("VERSION_CONFLICT", "다른 곳에서 인계가 먼저 변경되었어요. 최신 내용을 확인한 뒤 다시 진행해 주세요.");
  }
  if (!FROM[patch.action].includes(current.status)) {
    throw new HandoverError("INVALID_TRANSITION", "현재 상태에서는 할 수 없는 동작이에요.");
  }
  const at = now.toISOString();
  const version = current.version + 1;
  let next: Handover = { ...current, status: NEXT[patch.action], version };
  let toAssignee = current.assignee_id;
  let reason: string | null = null;

  switch (patch.action) {
    case "acknowledge":
      next.acknowledged_at = at;
      break;
    case "start":
      next.started_at = at;
      break;
    case "complete": {
      const all = current.follow_up_items.map((item) => item.id);
      if (patch.checked_item_ids.length !== all.length || !all.every((id) => patch.checked_item_ids.includes(id))) {
        invalid("checked_item_ids", "모든 확인 항목을 체크해야 완료할 수 있어요.");
      }
      next = {
        ...next,
        follow_up_items: current.follow_up_items.map((item) => ({ ...item, checked: true })),
        completed_at: at, completed_by: actorId, completion_note: patch.completion_note,
        follow_up_observation_ids: patch.follow_up_observation_ids,
      };
      break;
    }
    case "reassign":
      if (patch.assignee_id === current.assignee_id) invalid("assignee_id", "현재 담당자와 다른 사람을 선택해 주세요.");
      // 기한은 유지하고, 새 담당자가 다시 수신 확인하도록 진행 기록을 초기화한다. 이전 기록은 이벤트에 남는다.
      next = {
        ...next, assignee_id: patch.assignee_id, acknowledged_at: null, started_at: null,
        follow_up_items: current.follow_up_items.map((item) => ({ ...item, checked: false })),
      };
      toAssignee = patch.assignee_id;
      reason = patch.reason;
      break;
    case "cancel":
      next = { ...next, cancelled_at: at, cancelled_by: actorId, cancellation_reason: patch.reason };
      reason = patch.reason;
      break;
  }

  return {
    handover: next,
    event: {
      id: eventId, handover_id: current.id, action: patch.action, actor_id: actorId, created_at: at,
      request_id: patch.request_id, from_status: current.status, to_status: next.status,
      from_assignee_id: current.assignee_id, to_assignee_id: toAssignee, reason,
      version_before: current.version, version_after: version,
    },
  };
}

// POST /api/handovers 성공 시 서버가 만드는 값. 입력은 parseCreateHandover를 통과한 값이어야 한다.
export function buildCreatedHandover(input: CreateHandoverInput, actorId: string, now: Date, eventId: string): HandoverChange {
  if (Date.parse(input.due_at) <= now.getTime()) invalid("due_at", "현재 시각보다 늦은 기한을 선택해 주세요.");
  const at = now.toISOString();
  return {
    handover: {
      ...input, follow_up_items: input.follow_up_items.map((item) => ({ ...item, checked: false })),
      sender_id: actorId, status: "sent", version: 1, created_at: at,
      acknowledged_at: null, started_at: null, completed_at: null, completed_by: null, completion_note: null,
      follow_up_observation_ids: [], cancelled_at: null, cancelled_by: null, cancellation_reason: null,
      is_overdue: false,
    },
    event: {
      id: eventId, handover_id: input.id, action: "create", actor_id: actorId, created_at: at,
      request_id: input.id, from_status: null, to_status: "sent", from_assignee_id: null,
      to_assignee_id: input.assignee_id, reason: null, version_before: 0, version_after: 1,
    },
  };
}
