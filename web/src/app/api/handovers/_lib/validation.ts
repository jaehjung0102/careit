import { CATEGORIES, HandoverError, type Category, type CreateHandoverInput } from "./contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isResidentId(value: unknown): value is string {
  return typeof value === "string" && (/^resident-[123]$/.test(value) || isUuid(value));
}

function invalid(field: string, message: string): never {
  throw new HandoverError("VALIDATION_ERROR", "인계 입력을 확인해 주세요.", { [field]: message });
}

function object(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "객체를 보내 주세요.");
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) {
    throw new HandoverError("INVALID_REQUEST", "허용되지 않은 필드가 있습니다.");
  }
  return result;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > max) {
    invalid(path, `1~${max}자의 문자열을 보내 주세요.`);
  }
  return value;
}

function uuid(value: unknown, path: string): string {
  if (!isUuid(value)) invalid(path, "유효한 UUID를 보내 주세요.");
  return value.toLowerCase();
}

function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    invalid(path, `1~${max}개 항목을 보내 주세요.`);
  }
  return value;
}

function unique(ids: string[], path: string) {
  if (new Set(ids).size !== ids.length) invalid(path, "중복 ID를 제거해 주세요.");
}

function dueAt(value: unknown): string {
  if (typeof value !== "string") invalid("due_at", "시간대가 있는 ISO 날짜를 보내 주세요.");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) invalid("due_at", "시간대가 있는 ISO 날짜를 보내 주세요.");
  const [, y, m, d, h, min, sec, , oh, om] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
    || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59 || !Number.isFinite(Date.parse(value))) {
    invalid("due_at", "유효한 날짜와 시간을 보내 주세요.");
  }
  return new Date(value).toISOString();
}

// Validate shape before any storage call. The future-deadline check belongs
// inside the create transaction, so an already-saved retry can succeed later.
export function parseCreateHandover(value: unknown): CreateHandoverInput {
  const input = object(value, "body", [
    "id", "resident_id", "observation_ids", "title", "confirmed_facts",
    "follow_up_items", "assignee_id", "due_at",
  ]);
  const id = uuid(input.id, "id");
  const resident = text(input.resident_id, "resident_id", 100);
  if (!isResidentId(resident)) {
    invalid("resident_id", "어르신 ID를 확인해 주세요.");
  }
  const observations = array(input.observation_ids, "observation_ids", 20)
    .map((item, i) => uuid(item, `observation_ids.${i}`));
  unique(observations, "observation_ids");
  const items = array(input.follow_up_items, "follow_up_items", 10).map((value, i) => {
    const path = `follow_up_items.${i}`;
    const item = object(value, path, ["id", "category", "label"]);
    if (typeof item.category !== "string" || !(CATEGORIES as readonly string[]).includes(item.category)) {
      invalid(`${path}.category`, "지원하는 관찰 항목을 보내 주세요.");
    }
    return { id: uuid(item.id, `${path}.id`), category: item.category as Category,
      label: text(item.label, `${path}.label`, 200) };
  });
  unique(items.map((item) => item.id), "follow_up_items");
  // Explicit construction fixes key order and excludes server-owned fields.
  return {
    id, resident_id: resident.toLowerCase(), observation_ids: observations,
    title: text(input.title, "title", 100),
    confirmed_facts: text(input.confirmed_facts, "confirmed_facts", 2000),
    follow_up_items: items, assignee_id: uuid(input.assignee_id, "assignee_id"),
    due_at: dueAt(input.due_at),
  };
}
