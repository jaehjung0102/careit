import {
  CONTRACT_VERSION, HandoverError, isHandoverOverdue,
  type AcknowledgeHandoverEvent, type AcknowledgeHandoverInput,
  type Handover, type HandoverActor,
} from "./contract";
import { authenticateRequest, errorResponse, type HandoverAuthentication } from "./http";
import { isUuid } from "./validation";

export type AcknowledgementResult = { handover: Handover; event: AcknowledgeHandoverEvent };

export interface AcknowledgeHandoverRepository {
  readonly dataSource: "database" | "mock";
  /**
   * In ONE transaction: check current access (hidden/missing => NOT_FOUND),
   * then check actor + handover + request_id against the original input.
   * Same input returns the CURRENT row + ORIGINAL event without apply();
   * different input throws IDEMPOTENCY_CONFLICT. For a new request, apply()
   * must run against the locked/current row and save the row, event and request
   * record atomically. Any failure leaves all three unchanged. Recheck access
   * even for a retry; an idempotency record never grants visibility.
   */
  acknowledgeOnce(
    actor: HandoverActor, handoverId: string, input: AcknowledgeHandoverInput,
    apply: (current: Handover) => AcknowledgementResult,
  ): Promise<AcknowledgementResult>;
}

export interface AcknowledgeHandoverDependencies extends HandoverAuthentication {
  repository: AcknowledgeHandoverRepository;
  now?: () => Date;
  newEventId?: () => string;
}

function parseAcknowledgement(body: unknown): AcknowledgeHandoverInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HandoverError("VALIDATION_ERROR", "수신 확인 입력을 확인해 주세요.");
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["request_id", "expected_version", "action"].includes(key))) {
    throw new HandoverError("INVALID_REQUEST", "허용되지 않은 필드가 있습니다.");
  }
  if (!isUuid(input.request_id)) {
    throw new HandoverError("VALIDATION_ERROR", "요청 ID를 확인해 주세요.", { request_id: "유효한 UUID가 필요합니다." });
  }
  if (typeof input.expected_version !== "number" || !Number.isSafeInteger(input.expected_version)
    || input.expected_version < 1) {
    throw new HandoverError("VALIDATION_ERROR", "인계 버전을 확인해 주세요.", { expected_version: "양의 정수가 필요합니다." });
  }
  if (input.action !== "acknowledge") {
    throw new HandoverError("VALIDATION_ERROR", "현재 수신 확인 동작만 지원합니다.", { action: "acknowledge를 보내 주세요." });
  }
  return { request_id: input.request_id.toLowerCase(), expected_version: input.expected_version, action: "acknowledge" };
}

export function createAcknowledgeHandover(dependencies?: AcknowledgeHandoverDependencies) {
  return async function acknowledge(request: Request, handoverId: string): Promise<Response> {
    try {
      const actor = await authenticateRequest(request, dependencies);
      if (!dependencies) {
        throw new HandoverError("DEPENDENCY_NOT_READY", "인계 저장·권한 연결을 준비 중입니다.");
      }
      if (!isUuid(handoverId)) throw new HandoverError("INVALID_REQUEST", "인계 ID를 확인해 주세요.");
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        throw new HandoverError("INVALID_REQUEST", "JSON 형식으로 보내 주세요.");
      }
      let body: unknown;
      try { body = await request.json(); }
      catch { throw new HandoverError("INVALID_REQUEST", "올바른 JSON을 보내 주세요."); }
      const input = parseAcknowledgement(body);
      const now = dependencies.now ?? (() => new Date());
      const result = await dependencies.repository.acknowledgeOnce(actor, handoverId.toLowerCase(), input, (current) => {
        if (current.assignee_id !== actor.id) {
          throw new HandoverError("FORBIDDEN", "지정된 담당자만 수신 확인할 수 있습니다.");
        }
        if (current.version !== input.expected_version) {
          throw new HandoverError("VERSION_CONFLICT", "인계가 변경되었습니다. 새로고침 후 확인해 주세요.");
        }
        if (current.status !== "sent") {
          throw new HandoverError("INVALID_TRANSITION", "수신 대기 상태의 인계만 수신 확인할 수 있습니다.");
        }
        const acknowledgedAt = now().toISOString();
        const version = current.version + 1;
        const handover: Handover = {
          ...current, status: "acknowledged", version, acknowledged_at: acknowledgedAt,
        };
        const event: AcknowledgeHandoverEvent = {
          id: (dependencies.newEventId ?? (() => crypto.randomUUID()))(),
          handover_id: current.id, action: "acknowledge", actor_id: actor.id,
          created_at: acknowledgedAt, request_id: input.request_id,
          from_status: "sent", to_status: "acknowledged",
          from_assignee_id: current.assignee_id, to_assignee_id: current.assignee_id,
          reason: null, version_before: current.version, version_after: version,
        };
        return { handover, event };
      });
      return Response.json({ data: {
        handover: { ...result.handover, is_overdue: isHandoverOverdue(result.handover, now()) },
        event: result.event,
      }, meta: { contract_version: CONTRACT_VERSION, data_source: dependencies.repository.dataSource } },
      { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error, "인계 수신을 확인하지 못했습니다.");
    }
  };
}
