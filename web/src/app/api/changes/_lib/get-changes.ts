import { CONTRACT_VERSION, HandoverError as ApiError, type HandoverActor } from "../../handovers/_lib/contract";
import { authenticateRequest, errorResponse, type HandoverAuthentication } from "../../handovers/_lib/http";
import { isResidentId, isUuid } from "../../handovers/_lib/validation";
import { calculateChanges, historyWindows, type ChangesData, type ComparisonObservation, type HistoryWindow } from "../../../../lib/analytics/changes";

type AccessScope = ChangesData["access_scope"];
export interface ComparisonRepository {
  readonly dataSource: "database" | "mock";
  // Authenticate/authorize the record before returning it; hidden and missing
  // records both return null. Resolve the latest approved logical snapshot.
  getVisibleCurrent(actor: HandoverActor, id: string, asOf: Date): Promise<{ record: ComparisonObservation; access_scope: AccessScope } | null>;
  // Read all accessible latest approved snapshots for these windows, including
  // water periods whose date differs from observed_at. Apply RLS before filters.
  // No latest-30 cap; exhaust pagination. complete=false must fail the request.
  // Recheck current-record access and keep both reads in a consistent snapshot.
  readAllVisibleHistory(actor: HandoverActor, query: {
    resident_id: string; current_observation_id: string; access_scope: AccessScope; windows: HistoryWindow[];
  }, asOf: Date): Promise<{ records: ComparisonObservation[]; complete: boolean }>;
}
export interface ChangesDependencies extends HandoverAuthentication {
  repository: ComparisonRepository;
  now?: () => Date;
}

function parseQuery(url: string) {
  const params = new URL(url).searchParams;
  const allowed = ["resident_id", "current_observation_id"];
  if ([...params.keys()].some((key) => !allowed.includes(key)) || allowed.some((key) => params.getAll(key).length > 1)) {
    throw new ApiError("INVALID_REQUEST", "지원하지 않거나 중복된 조회 항목입니다.");
  }
  const resident = params.get("resident_id"), id = params.get("current_observation_id");
  if (!isResidentId(resident)) throw new ApiError("VALIDATION_ERROR", "어르신 ID를 확인해 주세요.", { resident_id: "유효한 어르신 ID가 필요합니다." });
  if (!isUuid(id)) throw new ApiError("VALIDATION_ERROR", "관찰 기록 ID를 확인해 주세요.", { current_observation_id: "유효한 관찰 기록 ID가 필요합니다." });
  return { resident_id: resident.toLowerCase(), current_observation_id: id.toLowerCase() };
}

// These guards catch adapter mistakes. They do not replace RLS or establish
// approval state; those are explicit server repository obligations above.
function checkRecord(row: ComparisonObservation) {
  if (!row || !isUuid(row.id) || !isResidentId(row.resident_id) || !row.fields
    || typeof row.fields !== "object" || Array.isArray(row.fields)
    || Object.values(row.fields).some((v) => v !== null && v !== undefined && typeof v !== "string")
    || (row.observed_at != null && typeof row.observed_at !== "string")
    || (row.walking_observation != null && typeof row.walking_observation !== "string")) throw new Error("Invalid comparison projection");
}

const unavailable: HandoverAuthentication = { async authenticate() {
  throw new ApiError("DEPENDENCY_NOT_READY", "변화 비교의 인증·기록 조회 연결을 준비 중입니다.");
} };

export function createGetChanges(dependencies?: ChangesDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const url = request.url;
    try {
      const actor = await authenticateRequest(request, dependencies ?? unavailable);
      if (!dependencies) throw new ApiError("DEPENDENCY_NOT_READY", "변화 비교 연결을 준비 중입니다.");
      const query = parseQuery(url);
      if (!["mock", "database"].includes(dependencies.repository.dataSource)) throw new Error("Invalid data source");
      const now = (dependencies.now ?? (() => new Date()))();
      if (!Number.isFinite(now.getTime())) throw new Error("Invalid server time");
      const visible = await dependencies.repository.getVisibleCurrent(actor, query.current_observation_id, now);
      if (!visible) throw new ApiError("NOT_FOUND", "관찰 기록을 찾을 수 없습니다.");
      checkRecord(visible.record);
      if (visible.record.id !== query.current_observation_id) throw new Error("Adapter returned another observation");
      if (!["author_only", "facility"].includes(visible.access_scope)) throw new Error("Invalid access scope");
      if (visible.record.resident_id !== query.resident_id) throw new ApiError("VALIDATION_ERROR", "어르신과 관찰 기록이 일치하지 않습니다.");
      const windows = historyWindows(visible.record);
      const history = windows.length ? await dependencies.repository.readAllVisibleHistory(actor, { ...query, access_scope: visible.access_scope, windows }, now)
        : { records: [], complete: true };
      if (history.complete !== true) throw new ApiError("SERVICE_UNAVAILABLE", "비교 기간의 기록을 모두 불러오지 못했습니다. 다시 시도해 주세요.");
      const ids = new Set<string>();
      for (const row of history.records) {
        checkRecord(row);
        if (row.resident_id !== query.resident_id || ids.has(row.id)) throw new Error("Invalid history scope or repeated snapshot");
        ids.add(row.id);
      }
      return Response.json({ data: calculateChanges(visible.record, history.records, now, visible.access_scope),
        meta: { contract_version: CONTRACT_VERSION, data_source: dependencies.repository.dataSource },
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error, "변화 비교를 불러오지 못했습니다.");
    }
  };
}
