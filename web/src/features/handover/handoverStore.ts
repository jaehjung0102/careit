import { useSyncExternalStore } from "react";
import { HandoverError, isHandoverOverdue, type Handover } from "@/app/api/handovers/_lib/contract";
import { parseCreateHandover } from "@/app/api/handovers/_lib/validation";
import { applyHandoverPatch, buildCreatedHandover, parseHandoverPatch, type HandoverChange } from "./handoverActions";
import { getMockHandover, listMockHandovers, MOCK_STAFF } from "./handoverMock";
import type { HandoverEvent } from "./handoverTypes";

// 실제 인계 API(#26 후속)·로그인(B1 #18) 연결 전까지 쓰는 화면용 mock 저장소.
// POST /api/handovers, PATCH /api/handovers/{id}와 같은 요청·응답 모양을 쓰고,
// 같은 상태 전이 규칙(handoverActions.ts)을 적용한다. 이 브라우저 탭 안에서만 유지되며 서버에 저장되지 않는다.
// F2-06(#14)에서 이 파일의 submit 함수들을 실제 fetch로 바꾼다.

export type HandoverStoreState = {
  actorId: string;
  failNext: boolean;
  handovers: Handover[];
  events: Record<string, HandoverEvent[]>;
  // 재시도 판별용: actor|handover|request_id → 최초 요청 내용과 이벤트
  requests: Record<string, { payload: string; event: HandoverEvent }>;
};

export type HandoverFailure = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  retryable: boolean;
};
export type HandoverResult<T> = { ok: true; data: T; replayed: boolean } | { ok: false; error: HandoverFailure };

const STORAGE_KEY = "careit.handover-mock.v1";
export const DEFAULT_ACTOR = "30000000-0000-4000-8000-000000000003"; // 간호 담당 정하늘
const LATENCY_MS = 350;

function seed(): HandoverStoreState {
  const handovers = listMockHandovers();
  return {
    actorId: DEFAULT_ACTOR,
    failNext: false,
    handovers,
    events: Object.fromEntries(handovers.map((h) => [h.id, getMockHandover(h.id)?.events ?? []])),
    requests: {},
  };
}

const SERVER_SNAPSHOT = seed();

function withOverdue(s: HandoverStoreState, now: Date): HandoverStoreState {
  return { ...s, handovers: s.handovers.map((h) => ({ ...h, is_overdue: isHandoverOverdue(h, now) })) };
}

function load(): HandoverStoreState {
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as HandoverStoreState;
      if (Array.isArray(parsed.handovers) && parsed.events && parsed.requests && typeof parsed.actorId === "string") {
        return withOverdue({ ...parsed, failNext: false }, new Date());
      }
    }
  } catch {
    // 저장소를 쓸 수 없으면(사생활 보호 모드 등) 기본 예시 데이터로 시작한다.
  }
  return withOverdue(seed(), new Date());
}

let state: HandoverStoreState | null = null;
const listeners = new Set<() => void>();

function current(): HandoverStoreState {
  if (state === null) state = typeof window === "undefined" ? SERVER_SNAPSHOT : load();
  return state;
}

function commit(next: HandoverStoreState) {
  state = withOverdue(next, new Date());
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패 시에도 현재 탭의 화면 상태는 유지한다.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHandoverStore(): HandoverStoreState {
  return useSyncExternalStore(subscribe, current, () => SERVER_SNAPSHOT);
}

export function setDemoActor(actorId: string) {
  if (MOCK_STAFF[actorId]) commit({ ...current(), actorId });
}

export function setFailNext(failNext: boolean) {
  commit({ ...current(), failNext });
}

export function resetHandoverDemo() {
  commit({ ...seed(), actorId: current().actorId });
}

function failure(error: unknown): HandoverResult<never> {
  if (error instanceof HandoverError) {
    return { ok: false, error: { code: error.code, message: error.message, fields: error.fields, retryable: false } };
  }
  return { ok: false, error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했어요.", retryable: true } };
}

// 시연용 "다음 요청 실패" — 저장 장애(503)를 흉내 낸다. 상태는 바뀌지 않는다.
function takeInjectedFailure(): HandoverResult<never> | null {
  if (!current().failNext) return null;
  commit({ ...current(), failNext: false });
  return { ok: false, error: {
    code: "SERVICE_UNAVAILABLE",
    message: "일시적으로 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.",
    retryable: true,
  } };
}

const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

// POST /api/handovers
export async function submitCreateHandover(body: unknown): Promise<HandoverResult<Handover>> {
  await wait();
  const injected = takeInjectedFailure();
  if (injected) return injected;
  try {
    const s = current();
    const input = parseCreateHandover(body);
    const payload = JSON.stringify(input);
    const key = `${s.actorId}|${input.id}|${input.id}`;
    const existing = s.handovers.find((h) => h.id === input.id);
    if (existing) {
      // 같은 사람이 같은 내용으로 다시 보낸 요청이면 중복 생성 없이 현재 인계를 돌려준다.
      if (s.requests[key]?.payload === payload) return { ok: true, data: existing, replayed: true };
      throw new HandoverError("IDEMPOTENCY_CONFLICT", "같은 ID의 인계가 이미 있어요.");
    }
    if (input.assignee_id === s.actorId) {
      throw new HandoverError("VALIDATION_ERROR", "입력을 확인해 주세요.", { assignee_id: "다른 담당자를 선택해 주세요." });
    }
    const { handover, event }: HandoverChange = buildCreatedHandover(input, s.actorId, new Date(), crypto.randomUUID());
    commit({
      ...s,
      handovers: [handover, ...s.handovers],
      events: { ...s.events, [handover.id]: [event] },
      requests: { ...s.requests, [key]: { payload, event } },
    });
    return { ok: true, data: current().handovers.find((h) => h.id === handover.id)!, replayed: false };
  } catch (error) {
    return failure(error);
  }
}

// PATCH /api/handovers/{id}
export async function submitHandoverPatch(id: string, body: unknown): Promise<HandoverResult<HandoverChange>> {
  await wait();
  const injected = takeInjectedFailure();
  if (injected) return injected;
  try {
    const s = current();
    const target = s.handovers.find((h) => h.id === id);
    if (!target) throw new HandoverError("NOT_FOUND", "인계를 찾을 수 없어요.");
    const patch = parseHandoverPatch(body);
    const payload = JSON.stringify(patch);
    const key = `${s.actorId}|${id}|${patch.request_id}`;
    const previous = s.requests[key];
    if (previous) {
      // 응답을 못 받아 같은 요청을 다시 보낸 경우: 동작을 반복하지 않고 현재 인계와 최초 이벤트를 돌려준다.
      if (previous.payload !== payload) throw new HandoverError("IDEMPOTENCY_CONFLICT", "같은 요청 ID에 다른 내용이 있어요.");
      return { ok: true, data: { handover: target, event: previous.event }, replayed: true };
    }
    const change = applyHandoverPatch(target, patch, s.actorId, new Date(), crypto.randomUUID());
    commit({
      ...s,
      handovers: s.handovers.map((h) => (h.id === id ? change.handover : h)),
      events: { ...s.events, [id]: [...(s.events[id] ?? []), change.event] },
      requests: { ...s.requests, [key]: { payload, event: change.event } },
    });
    return { ok: true, data: { ...change, handover: current().handovers.find((h) => h.id === id)! }, replayed: false };
  } catch (error) {
    return failure(error);
  }
}
