import type { DraftInput, ObservationField, ObservationFields } from "./input";

export const FIELD_LABELS: Record<ObservationField, string> = {
  meal_period: "식사 시간대", meal: "식사량", water: "수분 상태", bowel: "배변", urination: "배뇨",
  walking: "이동 도움", pain: "통증", skin: "피부", sleep: "수면", mood: "기분", cognition: "인지",
  communication: "의사소통", hygiene: "개인위생", oral_care: "구강관리", medication: "복약",
  activity: "활동 참여", emotional_support: "정서 지원",
};

export const MEAL_PERCENT: Partial<Record<NonNullable<ObservationFields["meal"]>, number>> = {
  "전량": 100, "3/4": 75, "절반": 50, "1/4": 25, "드시지 않음": 0,
};

export type DraftFact = { id: string; allowed_texts: string[] };

function inKst(value: string): string {
  return new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString()
    .replace("T", " ").replace(/\.000Z$/, "").replace(/Z$/, "") + " KST";
}

// Requires parsed input. Each accepted wording is built from the same exact fact.
// This intentionally permits controlled phrasing, not arbitrary paraphrases.
export function buildDraftFacts(input: DraftInput): DraftFact[] {
  const o = input.observation;
  const facts: DraftFact[] = [{ id: "observed_at", allowed_texts: [`관찰 시각: ${inKst(o.observed_at)}.`] }];
  for (const key of Object.keys(FIELD_LABELS) as ObservationField[]) {
    let value: string = o.fields[key] ?? "미관찰";
    if (key === "meal" && o.fields.meal !== null && MEAL_PERCENT[o.fields.meal] !== undefined) {
      value += ` (${MEAL_PERCENT[o.fields.meal]}%)`;
    }
    facts.push({ id: `fields.${key}`, allowed_texts: [
      `${FIELD_LABELS[key]}: ${value}.`, `${FIELD_LABELS[key]} 항목: ${value}.`,
    ] });
  }
  facts.push({ id: "walking_observation", allowed_texts: [
    `보행 관찰: ${o.walking_observation ?? "미관찰"}.`,
    `보행 관찰 항목: ${o.walking_observation ?? "미관찰"}.`,
  ] });
  const water = o.water_measurement;
  let waterText = "수분 정량 정보: 미관찰.";
  if (water !== null) {
    const amount = water.ml === null ? "미확인" : `${water.ml}mL`;
    if (water.basis === "event") {
      waterText = `단일 수분 섭취량: ${amount} (관찰 ${inKst(water.observed_at)}).`;
    } else {
      const basis = water.basis === "daily_total" ? "하루 총 수분 섭취량" : "18시까지 누적 수분 섭취량";
      waterText = `${basis}: ${amount} (${inKst(water.period_start_at)} ~ ${inKst(water.period_end_at)}; `
        + `집계 ${water.coverage_complete ? "완료" : "미완료/누락 있음"}).`;
    }
  }
  facts.push({ id: "water_measurement", allowed_texts: [waterText] });
  return facts;
}

// Raw source is never rewritten by the provider. Render the entire result as text.
export function joinDraftText(lines: string[], source: string): string {
  return [...lines, ...(source.length > 0 ? [`추가 관찰 원문:\n${source}`] : [])].join("\n");
}
