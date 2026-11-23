import { isHandoverOverdue, type Handover } from "@/app/api/handovers/_lib/contract";
import type { HandoverEvent } from "./handoverTypes";

// 실제 인계 API(#26) 연결 전까지 쓰는 가상 데이터.
// 응답 모양은 docs/api.md 7·8절(GET /api/handovers, GET /api/handovers/{id})과 같다.
// 모든 이름과 ID는 가상이며 실제 개인정보가 아니다.

// 예시 데이터의 기한 초과 판단에 쓰는 기준 시각 (2026-11-22 15:00 KST).
// 실제 API에서는 서버 현재 시각으로 is_overdue를 계산한다.
export const MOCK_NOW = new Date("2026-11-22T06:00:00Z");

export const MOCK_STAFF: Record<string, string> = {
  "30000000-0000-4000-8000-000000000001": "오후 담당 최서연",
  "30000000-0000-4000-8000-000000000002": "오전 담당 김민지",
  "30000000-0000-4000-8000-000000000003": "간호 담당 정하늘",
  "30000000-0000-4000-8000-000000000004": "야간 담당 한지우",
};

const AFTERNOON = "30000000-0000-4000-8000-000000000001";
const MORNING = "30000000-0000-4000-8000-000000000002";
const NURSE = "30000000-0000-4000-8000-000000000003";
const NIGHT = "30000000-0000-4000-8000-000000000004";

type MockHandover = Omit<Handover, "is_overdue">;

const base = {
  acknowledged_at: null,
  started_at: null,
  completed_at: null,
  completed_by: null,
  completion_note: null,
  follow_up_observation_ids: [],
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
} satisfies Partial<MockHandover>;

const mockHandovers: MockHandover[] = [
  {
    ...base,
    id: "10000000-0000-4000-8000-000000000001",
    resident_id: "resident-2",
    observation_ids: ["00000000-0000-4000-8000-000000000011"],
    title: "식사량 변화 확인 요청",
    confirmed_facts: "아침 식사량 30%, 점심 식사량 40%로 기록됨. 지난 7일 같은 끼니 평균보다 낮음.",
    follow_up_items: [
      { id: "20000000-0000-4000-8000-000000000011", category: "meal", label: "저녁 식사량을 기록해 주세요.", checked: false },
      { id: "20000000-0000-4000-8000-000000000012", category: "communication", label: "식사 중 불편한 점을 여쭤봐 주세요.", checked: false },
    ],
    sender_id: MORNING,
    assignee_id: AFTERNOON,
    due_at: "2026-11-22T08:00:00Z",
    status: "sent",
    version: 1,
    created_at: "2026-11-22T04:10:00Z",
  },
  {
    ...base,
    id: "10000000-0000-4000-8000-000000000002",
    resident_id: "resident-1",
    observation_ids: ["00000000-0000-4000-8000-000000000021"],
    title: "보행 시 불편감 관찰",
    confirmed_facts: "오전 산책 중 왼쪽 무릎 불편감을 말씀하심. 보행 보조기 사용 중.",
    follow_up_items: [
      { id: "20000000-0000-4000-8000-000000000021", category: "walking", label: "오후 보행 시 불편감 여부를 관찰해 주세요.", checked: false },
      { id: "20000000-0000-4000-8000-000000000022", category: "pain", label: "통증 정도를 여쭤보고 기록해 주세요.", checked: false },
    ],
    sender_id: MORNING,
    assignee_id: NURSE,
    due_at: "2026-11-23T01:00:00Z",
    status: "in_progress",
    version: 3,
    created_at: "2026-11-22T02:30:00Z",
    acknowledged_at: "2026-11-22T03:00:00Z",
    started_at: "2026-11-22T05:20:00Z",
  },
  {
    ...base,
    id: "10000000-0000-4000-8000-000000000003",
    resident_id: "resident-3",
    observation_ids: ["00000000-0000-4000-8000-000000000031"],
    title: "야간 수분 섭취 확인",
    confirmed_facts: "어제 18시 누적 수분 섭취량 600mL로 확인됨.",
    follow_up_items: [
      { id: "20000000-0000-4000-8000-000000000031", category: "water", label: "오전 수분 섭취량을 기록해 주세요.", checked: false },
    ],
    sender_id: NIGHT,
    assignee_id: MORNING,
    due_at: "2026-11-22T03:00:00Z",
    status: "acknowledged",
    version: 2,
    created_at: "2026-11-21T20:40:00Z",
    acknowledged_at: "2026-11-21T23:10:00Z",
  },
  {
    ...base,
    id: "10000000-0000-4000-8000-000000000004",
    resident_id: "resident-1",
    observation_ids: ["00000000-0000-4000-8000-000000000041"],
    title: "피부 발적 부위 확인",
    confirmed_facts: "오른쪽 발뒤꿈치에 약한 발적이 관찰됨.",
    follow_up_items: [
      { id: "20000000-0000-4000-8000-000000000041", category: "skin", label: "발적 부위 크기와 색 변화를 기록해 주세요.", checked: false },
    ],
    sender_id: MORNING,
    assignee_id: NURSE,
    due_at: "2026-11-22T09:00:00Z",
    status: "sent",
    version: 3,
    created_at: "2026-11-21T23:50:00Z",
  },
  {
    ...base,
    id: "10000000-0000-4000-8000-000000000005",
    resident_id: "resident-3",
    observation_ids: ["00000000-0000-4000-8000-000000000051"],
    title: "수분 섭취 확인",
    confirmed_facts: "그제 18시 누적 수분 섭취량 550mL로 확인됨.",
    follow_up_items: [
      { id: "20000000-0000-4000-8000-000000000051", category: "water", label: "오후 수분 섭취량을 기록해 주세요.", checked: true },
    ],
    sender_id: AFTERNOON,
    assignee_id: MORNING,
    due_at: "2026-11-21T09:00:00Z",
    status: "completed",
    version: 4,
    created_at: "2026-11-20T10:00:00Z",
    acknowledged_at: "2026-11-20T23:30:00Z",
    started_at: "2026-11-21T01:00:00Z",
    completed_at: "2026-11-21T07:40:00Z",
    completed_by: MORNING,
    completion_note: "오후 수분 섭취량 400mL를 확인하고 후속 기록에 남겼습니다.",
    follow_up_observation_ids: ["00000000-0000-4000-8000-000000000052"],
  },
  {
    ...base,
    id: "10000000-0000-4000-8000-000000000006",
    resident_id: "resident-2",
    observation_ids: ["00000000-0000-4000-8000-000000000061"],
    title: "수면 상태 확인",
    confirmed_facts: "어제 밤 두 차례 깨셨다고 말씀하심.",
    follow_up_items: [
      { id: "20000000-0000-4000-8000-000000000061", category: "sleep", label: "오늘 밤 수면 상태를 기록해 주세요.", checked: false },
    ],
    sender_id: MORNING,
    assignee_id: NIGHT,
    due_at: "2026-11-22T14:00:00Z",
    status: "cancelled",
    version: 2,
    created_at: "2026-11-21T03:00:00Z",
    cancelled_at: "2026-11-21T04:15:00Z",
    cancelled_by: MORNING,
    cancellation_reason: "같은 내용의 인계가 이미 있어 중복으로 취소합니다.",
  },
];

function event(
  handover_id: string,
  n: number,
  e: Omit<HandoverEvent, "id" | "handover_id" | "request_id" | "version_before" | "version_after">,
): HandoverEvent {
  const suffix = `${handover_id.slice(-2)}${n}`.padStart(12, "0");
  return {
    ...e,
    id: `50000000-0000-4000-8000-${suffix}`,
    handover_id,
    request_id: n === 1 ? handover_id : `40000000-0000-4000-8000-${suffix}`,
    version_before: n - 1,
    version_after: n,
  };
}

const [h1, h2, h3, h4, h5, h6] = mockHandovers.map((h) => h.id);

const create = (h: MockHandover) =>
  event(h.id, 1, {
    action: "create", actor_id: h.sender_id, created_at: h.created_at,
    from_status: null, to_status: "sent", from_assignee_id: null, to_assignee_id: h.assignee_id, reason: null,
  });

const mockEvents: Record<string, HandoverEvent[]> = {
  [h1]: [create(mockHandovers[0])],
  [h2]: [
    create(mockHandovers[1]),
    event(h2, 2, { action: "acknowledge", actor_id: NURSE, created_at: "2026-11-22T03:00:00Z", from_status: "sent", to_status: "acknowledged", from_assignee_id: NURSE, to_assignee_id: NURSE, reason: null }),
    event(h2, 3, { action: "start", actor_id: NURSE, created_at: "2026-11-22T05:20:00Z", from_status: "acknowledged", to_status: "in_progress", from_assignee_id: NURSE, to_assignee_id: NURSE, reason: null }),
  ],
  [h3]: [
    create(mockHandovers[2]),
    event(h3, 2, { action: "acknowledge", actor_id: MORNING, created_at: "2026-11-21T23:10:00Z", from_status: "sent", to_status: "acknowledged", from_assignee_id: MORNING, to_assignee_id: MORNING, reason: null }),
  ],
  // 처음 수신자가 확인한 뒤 담당이 바뀌어 새 담당자의 수신 확인을 다시 기다리는 사례.
  [h4]: [
    { ...create(mockHandovers[3]), to_assignee_id: AFTERNOON },
    event(h4, 2, { action: "acknowledge", actor_id: AFTERNOON, created_at: "2026-11-22T00:20:00Z", from_status: "sent", to_status: "acknowledged", from_assignee_id: AFTERNOON, to_assignee_id: AFTERNOON, reason: null }),
    event(h4, 3, { action: "reassign", actor_id: MORNING, created_at: "2026-11-22T01:05:00Z", from_status: "acknowledged", to_status: "sent", from_assignee_id: AFTERNOON, to_assignee_id: NURSE, reason: "피부 상태 확인은 간호 담당자가 맡도록 변경합니다." }),
  ],
  [h5]: [
    create(mockHandovers[4]),
    event(h5, 2, { action: "acknowledge", actor_id: MORNING, created_at: "2026-11-20T23:30:00Z", from_status: "sent", to_status: "acknowledged", from_assignee_id: MORNING, to_assignee_id: MORNING, reason: null }),
    event(h5, 3, { action: "start", actor_id: MORNING, created_at: "2026-11-21T01:00:00Z", from_status: "acknowledged", to_status: "in_progress", from_assignee_id: MORNING, to_assignee_id: MORNING, reason: null }),
    event(h5, 4, { action: "complete", actor_id: MORNING, created_at: "2026-11-21T07:40:00Z", from_status: "in_progress", to_status: "completed", from_assignee_id: MORNING, to_assignee_id: MORNING, reason: null }),
  ],
  [h6]: [
    create(mockHandovers[5]),
    event(h6, 2, { action: "cancel", actor_id: MORNING, created_at: "2026-11-21T04:15:00Z", from_status: "sent", to_status: "cancelled", from_assignee_id: NIGHT, to_assignee_id: NIGHT, reason: "같은 내용의 인계가 이미 있어 중복으로 취소합니다." }),
  ],
};

function withOverdue(h: MockHandover): Handover {
  return { ...h, is_overdue: isHandoverOverdue(h, MOCK_NOW) };
}

// GET /api/handovers 와 같은 정렬: created_at DESC, id DESC.
export function listMockHandovers(): Handover[] {
  return mockHandovers
    .map(withOverdue)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

// GET /api/handovers/{id} 와 같은 모양. 없으면 null (API에서는 404).
export function getMockHandover(id: string): { handover: Handover; events: HandoverEvent[] } | null {
  const h = mockHandovers.find((x) => x.id === id);
  if (!h) return null;
  const events = [...(mockEvents[id] ?? [])].sort((a, b) => a.version_after - b.version_after);
  return { handover: withOverdue(h), events };
}

// 인계 작성 화면에서 고를 수 있는 가상 원기록. 실제 관찰 조회(B1 #18) 연결 전까지 사용한다.
export const MOCK_OBSERVATIONS: Record<string, { id: string; label: string }[]> = {
  "resident-1": [
    { id: "00000000-0000-4000-8000-000000000021", label: "11월 22일 오전 보행 관찰" },
    { id: "00000000-0000-4000-8000-000000000041", label: "11월 22일 오전 피부 관찰" },
  ],
  "resident-2": [
    { id: "00000000-0000-4000-8000-000000000011", label: "11월 22일 점심 식사 관찰" },
    { id: "00000000-0000-4000-8000-000000000061", label: "11월 21일 아침 수면 관찰" },
  ],
  "resident-3": [
    { id: "00000000-0000-4000-8000-000000000031", label: "11월 21일 18시 수분 누적 기록" },
    { id: "00000000-0000-4000-8000-000000000051", label: "11월 20일 18시 수분 누적 기록" },
  ],
};
