import { DraftInputError, FIELD_OPTIONS, type DraftInput, type ObservationField } from "./input";
import { FIELD_LABELS, MEAL_PERCENT } from "./facts";

type Claim =
  | { kind: "field"; field: ObservationField; value: string }
  | { kind: "meal"; period: string | null; percent: number }
  | { kind: "water"; ml: number }
  | { kind: "pain" | "staggering"; present: boolean };

export type SourceReview = {
  compared_clause_count: number;
  // These clauses were NOT verified; keep the complete original visible for review.
  unreviewed_clauses: string[];
};

const compact = (text: string) => text.normalize("NFKC").replace(/\s+/gu, "");
const unknown = (value: string | null) => value === null || value === "미확인" || value === "미관찰";

function readClaim(clause: string): Claim | null {
  const text = compact(clause);
  const staggering = /^(?:보행(?:시|관찰)[:：]?)?휘청거림(?:이)?(없음|없습니다|있음|있습니다|관찰됨)?$/.exec(text);
  if (staggering) return { kind: "staggering", present: !staggering[1]?.startsWith("없") };
  const pain = /^통증(?:이|은)?[:：]?(없음|없습니다|있음|있습니다)$/.exec(text);
  if (pain) return { kind: "pain", present: pain[1].startsWith("있") };

  const meal = /^(아침|점심|저녁)?(?:식사량|식사를|식사)?[:：]?(전량|3\/4|절반|1\/4|드시지않음|먹지않음|하지않음|안함|\d{1,3}(?:\.\d{1,2})?(?:%|퍼센트))(?:섭취(?:함)?|먹음|드심)?$/.exec(text);
  // A bare number/fraction is not necessarily a meal claim.
  if (meal && /^(아침|점심|저녁|식사)/.test(text)) {
    const amount = meal[2];
    const named: Record<string, number> = {
      "전량": 100, "3/4": 75, "절반": 50, "1/4": 25,
      "드시지않음": 0, "먹지않음": 0, "하지않음": 0, "안함": 0,
    };
    const percent = Object.hasOwn(named, amount) ? named[amount] : Number.parseFloat(amount);
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      return { kind: "meal", period: meal[1] ?? null, percent };
    }
  }

  // Only explicit event language: unspecified amounts/totals are not equated.
  const water = /^(?:단일수분섭취량[:：]?(\d+(?:\.\d+)?)(mL|밀리리터|L|리터)|물(\d+(?:\.\d+)?)(mL|밀리리터|L|리터)(?:섭취(?:함)?|마심|마셨음))$/i.exec(text);
  if (water) {
    const amount = water[1] ?? water[3], unit = water[2] ?? water[4];
    const [whole, fraction = ""] = amount.split(".");
    const liters = /^(l|리터)$/i.test(unit);
    // Convert exact decimal liters without rounding or a guessed unit.
    if ((liters && fraction.length <= 3) || (!liters && fraction.length === 0)) {
      const ml = liters ? Number(whole) * 1000 + Number(fraction.padEnd(3, "0")) : Number(whole);
      if (Number.isSafeInteger(ml)) return { kind: "water", ml };
    }
  }

  for (const field of Object.keys(FIELD_LABELS) as ObservationField[]) {
    const label = compact(FIELD_LABELS[field]);
    if (!text.startsWith(label)) continue;
    const value = text.slice(label.length).replace(/^[:：]/, "");
    const option = (FIELD_OPTIONS[field] as readonly string[]).find((v) => compact(v) === value);
    if (option) return { kind: "field", field, value: option };
  }
  return null;
}

type Comparison = { field: string; label: string; conflicts: boolean };
function compare(claim: Claim, input: DraftInput): Comparison | null {
  const o = input.observation;
  if (claim.kind === "field") {
    const selected = o.fields[claim.field];
    if (unknown(selected) || unknown(claim.value)) return null;
    return { field: `observation.fields.${claim.field}`, label: FIELD_LABELS[claim.field], conflicts: selected !== claim.value };
  }
  if (claim.kind === "meal") {
    if (o.fields.meal === null || (claim.period !== null && claim.period !== o.fields.meal_period)) return null;
    const percent = MEAL_PERCENT[o.fields.meal];
    if (percent === undefined) return null;
    return { field: "observation.fields.meal", label: "식사량", conflicts: percent !== claim.percent };
  }
  if (claim.kind === "water") {
    const water = o.water_measurement;
    if (water?.basis !== "event" || water.ml === null
      || Date.parse(water.observed_at) !== Date.parse(o.observed_at)) return null;
    return { field: "observation.water_measurement.ml", label: "단일 수분 섭취량", conflicts: water.ml !== claim.ml };
  }
  if (claim.kind === "pain") {
    if (unknown(o.fields.pain)) return null;
    return { field: "observation.fields.pain", label: "통증 유무", conflicts: claim.present === (o.fields.pain === "없음") };
  }
  // "평소와 같음" is not evidence of no staggering, and assistance is separate.
  if (o.walking_observation !== "휘청거림" && o.walking_observation !== "휘청거림 없음") return null;
  return { field: "observation.walking_observation", label: "휘청거림 유무",
    conflicts: claim.present === (o.walking_observation === "휘청거림 없음") };
}

// Bounded, deterministic contradiction checks, NOT general Korean understanding.
// Never infer fields, correct either input, or treat an unrecognized clause as true.
export function assertNoSourceConflicts(input: DraftInput): SourceReview {
  const source = input.observation.source_text;
  if (!source.trim()) return { compared_clause_count: 0, unreviewed_clauses: [] };
  // Keep decimal points intact (e.g. 0.15L), splitting only statement separators.
  const clauses = source.split(/[\r\n,;。!]+|(?<!\d)\.|\.(?!\d)/u).map((s) => s.trim()).filter(Boolean);
  const claims = clauses.map(readClaim);
  // An unsupported clause may qualify ALL others (another person, time, quote,
  // correction or condition). Never cherry-pick apparent facts from that note.
  if (claims.some((claim) => claim === null || (claim.kind === "meal"
    && claim.period !== null && claim.period !== input.observation.fields.meal_period)) || clauses.length === 0) {
    // A different/unknown meal period may also qualify nearby unlabelled facts.
    return { compared_clause_count: 0, unreviewed_clauses: [source] };
  }
  const waterClaims = claims.filter((c) => c?.kind === "water").length;
  const review: SourceReview = { compared_clause_count: 0, unreviewed_clauses: [] };
  const errors: Record<string, string> = {};
  for (let i = 0; i < clauses.length; i++) {
    const claim = claims[i];
    // Multiple water events may be legitimate. Do not sum or choose one of them.
    const result = claim && !(claim.kind === "water" && waterClaims > 1) ? compare(claim, input) : null;
    if (result === null) { review.unreviewed_clauses.push(clauses[i]); continue; }
    review.compared_clause_count++;
    if (result.conflicts) {
      errors[result.field] = `${result.label}: 선택값과 추가 관찰 원문이 다릅니다. 대상·시각과 두 입력을 확인해 주세요.`;
    }
  }
  if (Object.keys(errors).length > 0) {
    errors["observation.source_text"] = "선택값과 다른 내용이 있습니다. 올바른 입력으로 수정한 뒤 다시 생성해 주세요.";
    throw new DraftInputError("VALIDATION_ERROR", errors);
  }
  return review;
}
