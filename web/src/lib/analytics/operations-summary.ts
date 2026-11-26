import { HANDOVER_STATUSES, isHandoverOverdue, type Handover } from "../../app/api/handovers/_lib/contract";

export type OperationsHandover = Readonly<Pick<Handover, "id" | "status" | "due_at">>;
export type OperationsObservation = Readonly<{
  id: string;
  created_at: string;
  // Local projection for #29. The #21 adapter will map the persisted status.
  reflection_status: "pending" | "reflected" | null;
}>;

export type OperationsSummary = {
  date: string;
  timezone: "Asia/Seoul";
  unacknowledged_handovers: number;
  overdue_handovers: number;
  pending_reflection: number | null;
  saved_today: number;
};

const SEOUL_TIMEZONE = "Asia/Seoul";
const seoulDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: SEOUL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const zonedTimestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function timestamp(value: string, field: "due_at" | "created_at"): number {
  if (typeof value === "string" && zonedTimestamp.test(value)) {
    const instant = Date.parse(value);
    // Date.parse can normalize dates like February 30. Validate the local date
    // independently of its offset and accept database microsecond precision.
    const date = value.slice(0, 10);
    const midnight = new Date(`${date}T00:00:00Z`);
    if (Number.isFinite(instant) && Number.isFinite(midnight.getTime())
      && midnight.toISOString().slice(0, 10) === date) return instant;
  }
  throw new Error(`Invalid operations timestamp: ${field}`);
}

function markSeen(ids: Set<string>, id: string, kind: "handover" | "observation") {
  if (typeof id !== "string" || !id.trim() || ids.has(id)) {
    throw new Error(`Operations summary requires a unique ID for each ${kind}.`);
  }
  ids.add(id);
}

// The caller supplies current, authorized rows from complete reads. Each row
// represents one logical record, even when the database contains revisions.
export function summarizeOperations(
  handovers: readonly OperationsHandover[],
  observations: readonly OperationsObservation[],
  now: Date,
): OperationsSummary {
  const evaluatedAt = now.getTime();
  if (!Number.isFinite(evaluatedAt)) throw new Error("A valid operations evaluation time is required.");
  const date = seoulDate.format(evaluatedAt);
  const handoverIds = new Set<string>();
  const observationIds = new Set<string>();
  let unacknowledged = 0, overdue = 0, savedToday = 0, pending = 0;
  let reflectionComplete = true;

  for (const row of handovers) {
    markSeen(handoverIds, row.id, "handover");
    if (!HANDOVER_STATUSES.includes(row.status)) throw new Error("Invalid operations handover status.");
    timestamp(row.due_at, "due_at");
    if (row.status === "sent") unacknowledged++;
    if (isHandoverOverdue(row, now)) overdue++;
  }

  for (const row of observations) {
    markSeen(observationIds, row.id, "observation");
    const savedAt = timestamp(row.created_at, "created_at");
    if (savedAt > evaluatedAt) throw new Error("Operations snapshot contains a future save.");
    if (seoulDate.format(savedAt) === date) savedToday++;
    switch (row.reflection_status) {
      case "pending": pending++; break;
      case "reflected": break;
      case null: reflectionComplete = false; break;
      default: throw new Error("Invalid operations reflection status.");
    }
  }

  return {
    date, timezone: SEOUL_TIMEZONE,
    unacknowledged_handovers: unacknowledged,
    overdue_handovers: overdue,
    // A partial pending count would look like a complete count on the dashboard.
    pending_reflection: reflectionComplete ? pending : null,
    saved_today: savedToday,
  };
}
