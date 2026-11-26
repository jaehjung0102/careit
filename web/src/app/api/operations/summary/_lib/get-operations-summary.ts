import { CONTRACT_VERSION, HandoverError, type HandoverActor } from "../../../handovers/_lib/contract";
import { authenticateRequest, errorResponse, type HandoverAuthentication } from "../../../handovers/_lib/http";
import {
  summarizeOperations, type OperationsHandover, type OperationsObservation,
} from "../../../../../lib/analytics/operations-summary";

type OperationsSnapshot = {
  handovers: readonly OperationsHandover[];
  observations: readonly OperationsObservation[];
  complete: boolean;
};

interface OperationsSummaryDependencies extends HandoverAuthentication {
  readonly dataSource: "database" | "mock";
  /**
   * Enforce dashboard permission and row access for the verified actor. Scope
   * the two reads to the same authorized workspace and consistent snapshot.
   * Return one row per logical ID, exhaust pagination, and exclude rows created
   * after evaluatedAt. Throw FORBIDDEN for a user without dashboard access.
   */
  readAuthorizedSnapshot(actor: HandoverActor, evaluatedAt: string): Promise<OperationsSnapshot>;
  now?: () => Date;
}

const unavailable: HandoverAuthentication = {
  async authenticate() {
    throw new HandoverError("DEPENDENCY_NOT_READY", "운영 현황의 인증·조회 연결을 준비 중입니다.");
  },
};

export function createGetOperationsSummary(dependencies?: OperationsSummaryDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const url = request.url;
    try {
      const actor = await authenticateRequest(request, dependencies ?? unavailable);
      if (!dependencies) {
        throw new HandoverError("DEPENDENCY_NOT_READY", "운영 현황 조회 연결을 준비 중입니다.");
      }
      if (new URL(url).search) {
        throw new HandoverError("INVALID_REQUEST", "지원하지 않는 조회 항목입니다.");
      }

      const now = (dependencies.now ?? (() => new Date()))();
      const evaluatedAt = now.toISOString();
      const { dataSource } = dependencies;
      if (dataSource !== "database" && dataSource !== "mock") {
        throw new Error("Invalid operations data source.");
      }
      const snapshot = await dependencies.readAuthorizedSnapshot(actor, evaluatedAt);
      if (snapshot.complete !== true) {
        throw new HandoverError("SERVICE_UNAVAILABLE", "운영 현황에 필요한 기록을 모두 불러오지 못했습니다. 다시 시도해 주세요.");
      }

      const summary = summarizeOperations(snapshot.handovers, snapshot.observations, now);
      return Response.json({
        data: { ...summary, evaluated_at: evaluatedAt },
        meta: { contract_version: CONTRACT_VERSION, data_source: dataSource },
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error, "운영 현황을 불러오지 못했습니다.");
    }
  };
}
