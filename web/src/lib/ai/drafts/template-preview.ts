import { parseDraftInput, type DraftInput, type ObservationField } from "./input";
import { FIELD_LABELS, MEAL_PERCENT } from "./facts";
import { assertNoSourceConflicts, type SourceReview } from "./source-conflicts";

function inKst(value: string): string {
  return new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString()
    .replace("T", " ").replace(/\.000Z$/, "").replace(/Z$/, "") + " KST";
}

export type TemplatePreview = {
  input: DraftInput;
  draft_text: string;
  requires_confirmation: true;
  source_review: SourceReview;
};

// Internal preview, NOT a ready-to-save result or POST /api/drafts response.
// Bounded source checks run here; auth and model-output checks are still pending.
export function previewTemplateDraft(value: unknown, now: Date): TemplatePreview {
  const input = parseDraftInput(value, now);
  const source_review = assertNoSourceConflicts(input);
  const o = input.observation;
  const lines = [`관찰 시각: ${inKst(o.observed_at)}.`];
  for (const key of Object.keys(FIELD_LABELS) as ObservationField[]) {
    const raw = o.fields[key];
    let label = raw ?? "미관찰";
    if (key === "meal" && o.fields.meal !== null && MEAL_PERCENT[o.fields.meal] !== undefined) {
      label += ` (${MEAL_PERCENT[o.fields.meal]}%)`;
    }
    lines.push(`${FIELD_LABELS[key]}: ${label}.`);
  }
  lines.push(`보행 관찰: ${o.walking_observation ?? "미관찰"}.`);
  const water = o.water_measurement;
  if (water === null) {
    lines.push("수분 정량 정보: 미관찰.");
  } else {
    const amount = water.ml === null ? "미확인" : `${water.ml}mL`;
    if (water.basis === "event") {
      lines.push(`단일 수분 섭취량: ${amount} (관찰 ${inKst(water.observed_at)}).`);
    } else {
      const basis = water.basis === "daily_total" ? "하루 총 수분 섭취량" : "18시까지 누적 수분 섭취량";
      lines.push(`${basis}: ${amount} (${inKst(water.period_start_at)} ~ ${inKst(water.period_end_at)}; `
        + `집계 ${water.coverage_complete ? "완료" : "미완료/누락 있음"}).`);
    }
  }
  // Preserve confirmed source text verbatim as data, never parse it into fields.
  // The eventual UI must render draft_text as plain text, not HTML/Markdown.
  if (o.source_text.length > 0) lines.push(`추가 관찰 원문:\n${o.source_text}`);
  return { input, draft_text: lines.join("\n"), requires_confirmation: true, source_review };
}
