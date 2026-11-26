import type { DraftInput } from "./input";
import { buildDraftFacts, joinDraftText, type DraftFact } from "./facts";

// Internal adapter protocol, not an addition to the public /api/drafts contract.
// Raw notes are kept locally and appended unchanged after validation.
export type DraftProviderRequest = {
  resident_id: string;
  input_revision: number;
  facts: DraftFact[];
};
export type DraftProviderCandidate = {
  resident_id: string;
  input_revision: number;
  facts: { id: string; text: string }[];
};
export type DraftOutputCheck = { ok: true; draft_text: string }
  | { ok: false; reason: "invalid_shape" | "wrong_input" | "invalid_facts" };

export function buildProviderRequest(input: DraftInput): DraftProviderRequest {
  return { resident_id: input.observation.resident_id, input_revision: input.input_revision, facts: buildDraftFacts(input) };
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

// Strict fact coverage + allowlisted wording. Does NOT certify free-form prose,
// truth of the original observation, or arbitrary natural-language equivalence.
export function validateGeneratedDraft(input: DraftInput, candidate: unknown): DraftOutputCheck {
  if (!exactObject(candidate, ["resident_id", "input_revision", "facts"]) || !Array.isArray(candidate.facts)) {
    return { ok: false, reason: "invalid_shape" };
  }
  if (candidate.resident_id !== input.observation.resident_id || candidate.input_revision !== input.input_revision) {
    return { ok: false, reason: "wrong_input" };
  }
  const expected = buildDraftFacts(input);
  if (candidate.facts.length !== expected.length) return { ok: false, reason: "invalid_facts" };
  const byId = new Map(expected.map((fact) => [fact.id, fact]));
  const accepted = new Map<string, string>();
  for (const fact of candidate.facts) {
    if (!exactObject(fact, ["id", "text"]) || typeof fact.id !== "string" || typeof fact.text !== "string") {
      return { ok: false, reason: "invalid_shape" };
    }
    if (accepted.has(fact.id) || !byId.get(fact.id)?.allowed_texts.includes(fact.text)) {
      return { ok: false, reason: "invalid_facts" };
    }
    accepted.set(fact.id, fact.text);
  }
  // Rebuild from accepted facts in a fixed order; never echo extra provider prose.
  const lines = expected.map((fact) => accepted.get(fact.id)!);
  return { ok: true, draft_text: joinDraftText(lines, input.observation.source_text) };
}
