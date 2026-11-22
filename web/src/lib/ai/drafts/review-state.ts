import type { DraftInput } from "./input";
import type { DraftGenerationResult } from "./generate-draft";
import { DraftClientError, readDraftResponse, type DraftClientFailure } from "./client-request";

export type DraftReviewState = {
  input: DraftInput;
  phase: "editing" | "generating" | "review" | "confirmed" | "error";
  active_request: symbol | null;
  draft: DraftGenerationResult | null;
  error: DraftClientFailure | null;
};
export type DraftRequest = { ticket: symbol; input: DraftInput };

// In-memory UI helpers only. Not server authentication or a persisted approval.
export function createDraftReview(input: DraftInput): DraftReviewState {
  if (!Number.isSafeInteger(input.input_revision) || input.input_revision < 1) throw new Error("Invalid input revision");
  return { input: structuredClone(input), phase: "editing", active_request: null, draft: null, error: null };
}

export function replaceDraftObservation(state: DraftReviewState, observation: DraftInput["observation"]): DraftReviewState {
  if (state.input.input_revision >= Number.MAX_SAFE_INTEGER) throw new Error("Input revision exhausted");
  return createDraftReview({ input_revision: state.input.input_revision + 1, observation });
}

export function beginDraftRequest(state: DraftReviewState): { state: DraftReviewState; request: DraftRequest } {
  // A distinct ticket also protects repeated requests of the SAME revision.
  const ticket = Symbol("draft-request");
  return {
    state: { ...state, phase: "generating", active_request: ticket, draft: null, error: null },
    request: { ticket, input: structuredClone(state.input) },
  };
}

export function receiveDraft(state: DraftReviewState, request: DraftRequest, value: unknown): DraftReviewState {
  if (state.active_request !== request.ticket || state.phase !== "generating") return state;
  try {
    const draft = readDraftResponse(state.input, value);
    return { ...state, phase: "review", active_request: null, draft, error: null };
  } catch (error) {
    return failDraftRequest(state, request, error);
  }
}

export function failDraftRequest(state: DraftReviewState, request: DraftRequest, error: unknown): DraftReviewState {
  if (state.active_request !== request.ticket || state.phase !== "generating") return state;
  const failure = error instanceof DraftClientError ? error.failure : new DraftClientError("INTERNAL_ERROR").failure;
  return { ...state, phase: "error", active_request: null, draft: null, error: structuredClone(failure) };
}

export function confirmDraft(state: DraftReviewState): DraftReviewState {
  if (state.phase !== "review" || state.active_request !== null || !state.draft) return state;
  return { ...state, phase: "confirmed" };
}

// F1 can pass this to the future B1 save adapter after an explicit user action.
// Never pass it to today's flat saveObservation helper or invent confirmed_by/at.
export function getConfirmedDraftSnapshot(state: DraftReviewState): {
  input_revision: number; observation: DraftInput["observation"]; approved_text: string;
} | null {
  if (state.phase !== "confirmed" || state.active_request !== null || !state.draft) return null;
  return structuredClone({ ...state.input, approved_text: state.draft.data.draft_text });
}
