import type { DraftInput } from "../input";
import type { DraftProviderCandidate, DraftProviderRequest } from "../output-validation";

export const GENERATION_NOW = new Date("2026-11-22T09:00:00Z");
export function generationInput(source_text = ""): DraftInput {
  return { input_revision: 3, observation: {
    schema_version: 3, resident_id: "resident-1", observed_at: "2026-11-22T12:15:00+09:00",
    fields: {
      meal_period: "점심", meal: "절반", water: "거부", bowel: "미확인", urination: null,
      walking: "부축 필요", pain: "없음", skin: "붉어짐", sleep: "중간에 깸", mood: "불안",
      cognition: "반복 질문", communication: "반복 설명 필요", hygiene: "일부 도움",
      oral_care: "미실시", medication: "해당 없음", activity: "참여 거부", emotional_support: "격려·안심",
    },
    water_measurement: { basis: "event", ml: 0, observed_at: "2026-11-22T12:15:00+09:00" },
    walking_observation: "휘청거림 없음", source_text,
  } };
}

// Simulated provider response only. Never import this fixture from application code.
export function candidateFor(request: DraftProviderRequest, variant = 0): DraftProviderCandidate {
  return { resident_id: request.resident_id, input_revision: request.input_revision,
    facts: request.facts.map((fact) => ({ id: fact.id, text: fact.allowed_texts[variant] ?? fact.allowed_texts[0] })),
  };
}
