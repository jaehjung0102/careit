import type { Category, Handover, HandoverStatus } from "@/app/api/handovers/_lib/contract";
import { residents } from "@/lib/mock/dashboard";
import { getMockHandover, listMockHandovers, MOCK_STAFF } from "./handoverMock";
import type { HandoverAction, HandoverEvent } from "./handoverTypes";

// API 응답(Handover)을 화면 표시용 모델로 바꾸는 adapter.
// 상태·문구 매핑은 docs/api.md 9절 "F2 PR #39와 연결할 때의 매핑"을 따른다.

export type { HandoverStatus };

export type { HandoverAction, HandoverEvent };

export const handoverStatusOrder = ["sent", "acknowledged", "in_progress", "completed", "cancelled"] as const satisfies readonly HandoverStatus[];
export type HandoverTone = "teal" | "amber" | "slate";

export const handoverStatusLabel: Record<HandoverStatus, string> = {
  sent: "수신 대기",
  acknowledged: "수신 확인",
  in_progress: "조치 중",
  completed: "완료",
  cancelled: "취소",
};

const statusTone: Record<HandoverStatus, HandoverTone> = {
  sent: "amber",
  acknowledged: "teal",
  in_progress: "teal",
  completed: "slate",
  cancelled: "slate",
};

const OPEN_STATUSES: readonly HandoverStatus[] = ["sent", "acknowledged", "in_progress"];

export const categoryLabel: Record<Category, string> = {
  meal: "식사", water: "수분", bowel: "배변", urination: "배뇨", walking: "보행", pain: "통증",
  skin: "피부", sleep: "수면", mood: "기분", cognition: "인지", communication: "의사소통",
  hygiene: "위생", oral_care: "구강 관리", medication: "투약", activity: "활동", emotional_support: "정서 지원",
};

export const actionLabel: Record<HandoverAction, string> = {
  create: "인계 보냄",
  acknowledge: "수신 확인",
  start: "조치 시작",
  complete: "조치 완료",
  reassign: "담당자 변경",
  cancel: "인계 취소",
};

const residentNames: Record<string, string> = Object.fromEntries(residents.map((r) => [r.id, r.name]));

export function residentName(id: string) {
  return residentNames[id] ?? "알 수 없는 어르신";
}

export function staffName(id: string | null) {
  if (!id) return "-";
  return MOCK_STAFF[id] ?? "알 수 없는 담당자";
}

const kstParts = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// 화면의 모든 시각은 KST로 표시한다. 예: "11월 22일(일) 17:00"
export function formatKst(iso: string | null) {
  if (!iso) return "-";
  const p = Object.fromEntries(kstParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}월 ${p.day}일(${p.weekday}) ${p.hour}:${p.minute}`;
}

export interface HandoverItem {
  id: string;
  title: string;
  resident: string;
  assignee: string;
  sender: string;
  due: string;
  status: HandoverStatus;
  statusLabel: string;
  tone: HandoverTone;
  isOverdue: boolean;
  checkedCount: number;
  itemCount: number;
  // 담당 변경 후 새 담당자의 수신 확인을 기다리는 상태인지 (sent + version > 1)
  awaitingReacknowledge: boolean;
}

export function toHandoverItem(h: Handover): HandoverItem {
  return {
    id: h.id,
    title: h.title,
    resident: residentName(h.resident_id),
    assignee: staffName(h.assignee_id),
    sender: staffName(h.sender_id),
    due: formatKst(h.due_at),
    status: h.status,
    statusLabel: handoverStatusLabel[h.status],
    tone: statusTone[h.status],
    isOverdue: h.is_overdue,
    checkedCount: h.follow_up_items.filter((x) => x.checked).length,
    itemCount: h.follow_up_items.length,
    awaitingReacknowledge: h.status === "sent" && h.version > 1,
  };
}

export function getSampleHandovers(): HandoverItem[] {
  return listMockHandovers().map(toHandoverItem);
}

export function getSampleHandoverDetail(id: string) {
  const found = getMockHandover(id);
  if (!found) return null;
  return { ...found, item: toHandoverItem(found.handover) };
}

export function getSampleHandoverIds() {
  return listMockHandovers().map((h) => h.id);
}

// 미완료 = sent/acknowledged/in_progress. 취소 건은 미완료·기한 초과 집계에서 제외한다.
export function countOpenHandovers(items: HandoverItem[]) {
  return items.filter((x) => OPEN_STATUSES.includes(x.status)).length;
}

// 수신 미확인 = sent만. "확인할 인계(미완료)"와 다른 지표다.
export function countUnacknowledged(items: HandoverItem[]) {
  return items.filter((x) => x.status === "sent").length;
}

export function countOverdue(items: HandoverItem[]) {
  return items.filter((x) => x.isOverdue).length;
}

export function countByStatus(items: HandoverItem[]) {
  return handoverStatusOrder.map((status) => ({
    status,
    label: handoverStatusLabel[status],
    count: items.filter((x) => x.status === status).length,
  }));
}
