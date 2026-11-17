import {
  CONTRACT_VERSION, HandoverError, type CreateHandoverEvent,
  type CreateHandoverInput, type Handover,
} from "./contract";
import { parseCreateHandover } from "./validation";

type Actor = { id: string };
type NewHandover = { handover: Handover; event: CreateHandoverEvent };

export interface HandoverRepository {
  readonly dataSource: "database" | "mock";
  /**
   * B1 adapter must atomically store the handover, create event, actor and
   * original normalized input. Same actor/id/input returns the CURRENT row;
   * changed input throws IDEMPOTENCY_CONFLICT. Hidden IDs throw NOT_FOUND.
   * Serialize competing creates and call build only for a new ID. Never call
   * build for a replay (its deadline may have passed). Recheck permissions in
   * the transaction and enforce current access before returning any row.
   */
  createOnce(actor: Actor, input: CreateHandoverInput, build: () => NewHandover): Promise<{
    handover: Handover;
    created: boolean;
  }>;
}

export interface CreateHandoverDependencies {
  // Verify the bearer token with the auth provider; never decode and trust it.
  authenticate(token: string): Promise<Actor>;
  // Check creator role, resident, assignee's facility and both users' access
  // to every source observation. Run for retries too; revoked access stays revoked.
  authorizeCreate(actor: Actor, input: CreateHandoverInput): Promise<void>;
  repository: HandoverRepository;
  now?: () => Date;
  newEventId?: () => string;
}

function errorResponse(error: unknown): Response {
  const known = error instanceof HandoverError;
  return Response.json({
    error: {
      code: known ? error.code : "INTERNAL_ERROR",
      message: known ? error.message : "인계를 생성하지 못했습니다.",
      ...(known && error.fields ? { fields: error.fields } : {}),
      retryable: known && error.code === "SERVICE_UNAVAILABLE",
    },
    meta: { contract_version: CONTRACT_VERSION },
  }, { status: known ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}

export function createPostHandover(dependencies?: CreateHandoverDependencies) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
      if (!token) throw new HandoverError("UNAUTHENTICATED", "로그인이 필요합니다.");
      if (!dependencies) {
        throw new HandoverError("DEPENDENCY_NOT_READY", "인계 저장·권한 연결을 준비 중입니다.");
      }
      const actor = await dependencies.authenticate(token);
      if (!actor.id) throw new HandoverError("UNAUTHENTICATED", "로그인을 확인해 주세요.");
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        throw new HandoverError("INVALID_REQUEST", "JSON 형식으로 보내 주세요.");
      }
      let body: unknown;
      try { body = await request.json(); }
      catch { throw new HandoverError("INVALID_REQUEST", "올바른 JSON을 보내 주세요."); }
      const input = parseCreateHandover(body);
      await dependencies.authorizeCreate(actor, input);
      const now = dependencies.now ?? (() => new Date());
      const saved = await dependencies.repository.createOnce(actor, input, () => {
        const created = now();
        if (Date.parse(input.due_at) <= created.getTime()) {
          throw new HandoverError("VALIDATION_ERROR", "미래 기한을 지정해 주세요.", {
            due_at: "현재 시각보다 늦은 기한이 필요합니다.",
          });
        }
        const created_at = created.toISOString();
        const handover: Handover = {
          ...input, follow_up_items: input.follow_up_items.map((item) => ({ ...item, checked: false })),
          sender_id: actor.id, status: "sent", version: 1, created_at,
          acknowledged_at: null, started_at: null, completed_at: null,
          completed_by: null, completion_note: null, follow_up_observation_ids: [],
          cancelled_at: null, cancelled_by: null, cancellation_reason: null, is_overdue: false,
        };
        const event: CreateHandoverEvent = {
          id: (dependencies.newEventId ?? (() => crypto.randomUUID()))(),
          handover_id: input.id, action: "create", actor_id: actor.id, created_at,
          request_id: input.id, from_status: null, to_status: "sent",
          from_assignee_id: null, to_assignee_id: input.assignee_id,
          reason: null, version_before: 0, version_after: 1,
        };
        return { handover, event };
      });
      // Overdue is derived at response time, including on retries.
      const data: Handover = {
        ...saved.handover,
        is_overdue: !["completed", "cancelled"].includes(saved.handover.status)
          && Date.parse(saved.handover.due_at) < now().getTime(),
      };
      return Response.json({ data, meta: {
        contract_version: CONTRACT_VERSION, data_source: dependencies.repository.dataSource,
      } }, { status: saved.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
