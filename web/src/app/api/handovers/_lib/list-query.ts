import { Buffer } from "node:buffer";
import { HANDOVER_STATUSES, HandoverError, type HandoverStatus } from "./contract";
import { isResidentId, isUuid } from "./validation";

export type HandoverListFilters = {
  resident_id: string | null;
  assignee_id: string | null;
  status: HandoverStatus | null;
  overdue: boolean | null;
  limit: number;
};
export type HandoverListPosition = { created_at: string; id: string };
export type HandoverListQuery = HandoverListFilters & { after: HandoverListPosition | null };

function invalid(message = "목록 조회 조건을 확인해 주세요."): never {
  throw new HandoverError("INVALID_REQUEST", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function readCursor(cursor: string, filters: HandoverListFilters, actorId: string): HandoverListPosition {
  // This is a position bookmark, NOT an access token. The repository must
  // recheck current permissions on every page, even for a well-formed cursor.
  if (cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) invalid("다음 페이지 정보를 확인해 주세요.");
  let decoded: unknown;
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) invalid();
    decoded = JSON.parse(bytes.toString("utf8"));
  } catch { invalid("다음 페이지 정보를 확인해 주세요."); }
  if (!isObject(decoded) || !exactKeys(decoded, ["v", "actor_id", "filters", "after"])
    || decoded.v !== 1 || decoded.actor_id !== actorId || !isObject(decoded.filters)) {
    invalid("조회 조건이 바뀌었습니다. 첫 페이지부터 다시 조회해 주세요.");
  }
  const cursorFilters = decoded.filters;
  if (!exactKeys(cursorFilters, Object.keys(filters))
    || !Object.entries(filters).every(([key, value]) => cursorFilters[key] === value)) {
    invalid("조회 조건이 바뀌었습니다. 첫 페이지부터 다시 조회해 주세요.");
  }
  const after = decoded.after;
  if (!isObject(after) || !exactKeys(after, ["created_at", "id"]) || !isUuid(after.id)
    || typeof after.created_at !== "string" || !Number.isFinite(Date.parse(after.created_at))
    || new Date(after.created_at).toISOString() !== after.created_at) {
    invalid("다음 페이지 정보를 확인해 주세요.");
  }
  return { created_at: after.created_at, id: after.id.toLowerCase() };
}

export function parseHandoverListQuery(url: string, actorId: string): HandoverListQuery {
  const params = new URL(url).searchParams;
  const allowed = ["resident_id", "assignee_id", "status", "overdue", "limit", "cursor"];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid();
  }
  const resident = params.get("resident_id");
  const assignee = params.get("assignee_id");
  const status = params.get("status");
  const overdue = params.get("overdue");
  const limit = params.get("limit");
  if (resident !== null && !isResidentId(resident)) invalid();
  if (assignee !== null && !isUuid(assignee)) invalid();
  if (status !== null && !(HANDOVER_STATUSES as readonly string[]).includes(status)) invalid();
  if (overdue !== null && overdue !== "true" && overdue !== "false") invalid();
  if (limit !== null && !/^(?:[1-9][0-9]?|100)$/.test(limit)) invalid();
  const filters: HandoverListFilters = {
    resident_id: resident?.toLowerCase() ?? null,
    assignee_id: assignee?.toLowerCase() ?? null,
    status: status as HandoverStatus | null,
    overdue: overdue === null ? null : overdue === "true",
    limit: limit === null ? 20 : Number(limit),
  };
  const cursor = params.get("cursor");
  return { ...filters, after: cursor === null ? null : readCursor(cursor, filters, actorId) };
}

export function nextHandoverCursor(query: HandoverListQuery, actorId: string, last: HandoverListPosition): string {
  const filters: HandoverListFilters = {
    resident_id: query.resident_id, assignee_id: query.assignee_id,
    status: query.status, overdue: query.overdue, limit: query.limit,
  };
  // Timestamp/ID are the final returned row, not the extra look-ahead row.
  return Buffer.from(JSON.stringify({ v: 1, actor_id: actorId, filters,
    after: { created_at: new Date(last.created_at).toISOString(), id: last.id },
  })).toString("base64url");
}
