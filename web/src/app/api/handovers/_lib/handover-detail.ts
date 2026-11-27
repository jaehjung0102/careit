import {
  CONTRACT_VERSION, HandoverError, isHandoverOverdue, type Handover, type HandoverActor,
  type HandoverActionInput, type HandoverActionEvent, type ImplementedHandoverEvent,
} from "./contract";
import { authenticateRequest, errorResponse, type HandoverAuthentication } from "./http";
import { isUuid, parseHandoverAction } from "./validation";

export type ActionResult = { handover: Handover; event: HandoverActionEvent };
type Detail = { handover: Handover; events: ImplementedHandoverEvent[] };

// Decisions derived from the locked row, actor and requested targets by the storage adapter.
type ActionAccess = { canManage: boolean; validAssignee: boolean; validFollowUps: boolean };
export interface HandoverDetailRepository {
  readonly dataSource: "database" | "mock";
  // Return a consistent snapshot of the visible row and all its events, or null if hidden/missing.
  readVisible(actor: HandoverActor, id: string): Promise<Detail | null>;
  // In one transaction: check current visibility, replay the original event for an identical
  // actor/id/request key, reject changed payloads, or apply once and commit row + event + key.
  // canManage means same-team sender/admin. Check target resident and source observation access
  // for a new assignee, and same-resident, mutually visible observations for completion.
  changeOnce(actor: HandoverActor, id: string, input: HandoverActionInput,
    apply: (current: Handover, access: ActionAccess) => ActionResult): Promise<ActionResult>;
}
export interface HandoverDetailDependencies extends HandoverAuthentication {
  repository: HandoverDetailRepository;
  now?: () => Date;
  newEventId?: () => string;
}

function nextState(row: Handover, actor: HandoverActor, input: HandoverActionInput, access: ActionAccess, at: string): Handover {
  const managing = input.action === "cancel" || input.action === "reassign";
  const permitted = managing ? access.canManage : row.assignee_id === actor.id;
  if (!permitted) {
    throw new HandoverError("FORBIDDEN", "해당 인계 작업 권한이 없습니다.");
  }
  if (row.version !== input.expected_version) throw new HandoverError("VERSION_CONFLICT", "인계가 변경되었습니다. 다시 확인해 주세요.");
  const closed = row.status === "completed" || row.status === "cancelled";
  if (closed || (input.action === "acknowledge" && row.status !== "sent")
    || (input.action === "start" && row.status !== "acknowledged") || (input.action === "complete" && row.status !== "in_progress")) {
    throw new HandoverError("INVALID_TRANSITION", "현재 상태에서 할 수 없는 작업입니다.");
  }
  const updated = { ...row, version: row.version + 1 };
  switch (input.action) {
    case "acknowledge": return { ...updated, status: "acknowledged", acknowledged_at: at };
    case "start": return { ...updated, status: "in_progress", started_at: at };
    case "cancel": return { ...updated, status: "cancelled", cancelled_at: at, cancelled_by: actor.id, cancellation_reason: input.reason };
    case "reassign":
      if (input.assignee_id === row.assignee_id) throw new HandoverError("VALIDATION_ERROR", "다른 담당자를 선택해 주세요.");
      if (!access.validAssignee) throw new HandoverError("NOT_FOUND", "선택 가능한 담당자를 찾을 수 없습니다.");
      return { ...updated, status: "sent", assignee_id: input.assignee_id, acknowledged_at: null, started_at: null,
        follow_up_items: row.follow_up_items.map(item => ({ ...item, checked: false })) };
    case "complete":
      if (row.follow_up_items.length !== input.checked_item_ids.length || row.follow_up_items.some(item => !input.checked_item_ids.includes(item.id))) {
        throw new HandoverError("VALIDATION_ERROR", "모든 확인 항목을 체크해 주세요.");
      }
      if (input.follow_up_observation_ids.length && !access.validFollowUps) throw new HandoverError("NOT_FOUND", "연결할 수 있는 관찰 기록을 찾을 수 없습니다.");
      return { ...updated, status: "completed", completed_at: at, completed_by: actor.id, completion_note: input.completion_note,
        follow_up_observation_ids: input.follow_up_observation_ids, follow_up_items: row.follow_up_items.map(item => ({ ...item, checked: true })) };
  }
}

export function createHandoverDetail(deps?: HandoverDetailDependencies) {
  const now = deps?.now ?? (() => new Date());
  async function context(request: Request, id: string) {
    const actor = await authenticateRequest(request, deps);
    if (!deps) throw new HandoverError("DEPENDENCY_NOT_READY", "인계 저장·권한 연결을 준비 중입니다.");
    if (!isUuid(id)) throw new HandoverError("INVALID_REQUEST", "인계 ID를 확인해 주세요.");
    return { actor, repository: deps.repository, id: id.toLowerCase() };
  }
  function response(result: Detail | ActionResult, repository: HandoverDetailRepository) {
    const data = { ...result, handover: { ...result.handover, is_overdue: isHandoverOverdue(result.handover, now()) } };
    return Response.json({ data, meta: { contract_version: CONTRACT_VERSION, data_source: repository.dataSource } },
      { headers: { "Cache-Control": "no-store" } });
  }
  return {
    async get(request: Request, handoverId: string) {
      try {
        const { actor, repository, id } = await context(request, handoverId);
        const detail = await repository.readVisible(actor, id);
        if (!detail) throw new HandoverError("NOT_FOUND", "인계를 찾을 수 없습니다.");
        return response({ handover: detail.handover, events: [...detail.events].sort((a, b) => a.version_after - b.version_after) }, repository);
      } catch (error) { return errorResponse(error, "인계를 조회하지 못했습니다."); }
    },
    async patch(request: Request, handoverId: string) {
      try {
        const { actor, repository, id } = await context(request, handoverId);
        if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
          throw new HandoverError("INVALID_REQUEST", "JSON 형식으로 보내 주세요.");
        }
        let body: unknown;
        try { body = await request.json(); }
        catch { throw new HandoverError("INVALID_REQUEST", "올바른 JSON을 보내 주세요."); }
        const input = parseHandoverAction(body);
        const result = await repository.changeOnce(actor, id, input, (row, access) => {
          const at = now().toISOString();
          const handover = nextState(row, actor, input, access, at);
          const event: HandoverActionEvent = { id: deps?.newEventId?.() ?? crypto.randomUUID(), handover_id: row.id,
            action: input.action, actor_id: actor.id, created_at: at, request_id: input.request_id,
            from_status: row.status, to_status: handover.status, from_assignee_id: row.assignee_id, to_assignee_id: handover.assignee_id,
            reason: "reason" in input ? input.reason : null, version_before: row.version, version_after: handover.version };
          return { handover, event };
        });
        return response(result, repository);
      } catch (error) { return errorResponse(error, "인계 상태를 변경하지 못했습니다."); }
    },
  };
}
