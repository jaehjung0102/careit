import { parseDraftInput, type DraftInput } from "./input";
import { buildDraftFacts, joinDraftText } from "./facts";
import { assertNoSourceConflicts, type SourceReview } from "./source-conflicts";

export type TemplatePreview = {
  input: DraftInput;
  draft_text: string;
  requires_confirmation: true;
  source_review: SourceReview;
};

// Internal preview, NOT a ready-to-save result or POST /api/drafts response.
// Bounded source checks run here; authorization belongs to the generation service.
export function previewTemplateDraft(value: unknown, now: Date): TemplatePreview {
  const input = parseDraftInput(value, now);
  const source_review = assertNoSourceConflicts(input);
  const draft_text = joinDraftText(buildDraftFacts(input).map((fact) => fact.allowed_texts[0]), input.observation.source_text);
  return { input, draft_text, requires_confirmation: true, source_review };
}
