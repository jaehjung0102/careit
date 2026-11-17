import { CONTRACT_VERSION, HandoverError, isHandoverOverdue, type Handover, type HandoverActor } from "./contract";
import { authenticateRequest, errorResponse, type HandoverAuthentication } from "./http";
import { nextHandoverCursor, parseHandoverListQuery, type HandoverListQuery } from "./list-query";

export interface HandoverListRepository {
  readonly dataSource: "database" | "mock";
  /**
   * Apply current row access FIRST, then filters and keyset position. Return
   * at most query.limit + 1 rows sorted by created_at DESC, id DESC.
   * A position is strictly older in created_at, or has a lower ID on a tie.
   * Use asOf for overdue: non-terminal status AND due_at < asOf.
   * Never turn assignee/resident filters into authorization or write a read receipt.
   * B1 must enforce this in its query/RLS, including access to linked records.
   */
  listVisible(actor: HandoverActor, query: HandoverListQuery, asOf: Date): Promise<Handover[]>;
}

export interface ListHandoverDependencies extends HandoverAuthentication {
  repository: HandoverListRepository;
  now?: () => Date;
}

export function createGetHandovers(dependencies?: ListHandoverDependencies) {
  return async function GET(request: Request): Promise<Response> {
    // Access runtime data outside the catch so Next can defer prerendering.
    const url = request.url;
    try {
      const actor = await authenticateRequest(request, dependencies);
      if (!dependencies) {
        throw new HandoverError("DEPENDENCY_NOT_READY", "인계 저장·권한 연결을 준비 중입니다.");
      }
      const query = parseHandoverListQuery(url, actor.id);
      const asOf = (dependencies.now ?? (() => new Date()))();
      const rows = await dependencies.repository.listVisible(actor, query, asOf);
      if (rows.length > query.limit + 1) throw new Error("List adapter exceeded requested bound");
      const page = rows.slice(0, query.limit);
      const data = page.map((row) => ({ ...row, is_overdue: isHandoverOverdue(row, asOf) }));
      const nextCursor = rows.length > query.limit
        ? nextHandoverCursor(query, actor.id, page[page.length - 1]) : null;
      return Response.json({ data, meta: {
        contract_version: CONTRACT_VERSION, data_source: dependencies.repository.dataSource,
        next_cursor: nextCursor,
      } }, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error, "인계 목록을 불러오지 못했습니다.");
    }
  };
}
