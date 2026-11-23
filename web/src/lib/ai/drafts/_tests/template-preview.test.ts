import assert from "node:assert/strict";
import test from "node:test";
import { DraftInputError, parseDraftInput, type DraftInput } from "../input";
import { previewTemplateDraft } from "../template-preview";

const NOW = new Date("2026-11-21T09:00:00Z");
function fixture(): DraftInput {
  return { input_revision: 2, observation: {
    schema_version: 3, resident_id: "resident-1", observed_at: "2026-11-21T12:15:00+09:00",
    fields: {
      meal_period: "점심", meal: "절반", water: "적음", bowel: "미확인", urination: null,
      walking: "부축 필요", pain: "없음", skin: "붉어짐", sleep: "중간에 깸", mood: "불안",
      cognition: "반복 질문", communication: "반복 설명 필요", hygiene: "일부 도움",
      oral_care: "미실시", medication: "해당 없음", activity: "참여 거부", emotional_support: "격려·안심",
    },
    water_measurement: { basis: "event", ml: 150, observed_at: "2026-11-21T12:15:00+09:00" },
    walking_observation: "휘청거림 없음", source_text: "",
  } };
}

test("includes all 17 fields and separates assistance from absence of staggering", () => {
  const result = previewTemplateDraft(fixture(), NOW);
  for (const line of ["식사 시간대: 점심.", "식사량: 절반 (50%).", "수분 상태: 적음.",
    "배변: 미확인.", "배뇨: 미관찰.", "이동 도움: 부축 필요.", "통증: 없음.", "피부: 붉어짐.",
    "수면: 중간에 깸.", "기분: 불안.", "인지: 반복 질문.", "의사소통: 반복 설명 필요.",
    "개인위생: 일부 도움.", "구강관리: 미실시.", "복약: 해당 없음.", "활동 참여: 참여 거부.",
    "정서 지원: 격려·안심.", "보행 관찰: 휘청거림 없음."]) {
    assert.ok(result.draft_text.includes(line), `Missing ${line}`);
  }
  assert.equal(result.requires_confirmation, true);
  assert.equal(result.input.input_revision, 2);
  assert.match(result.draft_text, /관찰 시각: 2026-11-21 12:15:00 KST/);
  assert.match(result.draft_text, /단일 수분 섭취량: 150mL/);
  assert.doesNotMatch(result.draft_text, /하루 총|누적 수분/);
});

test("unknown, not performed, not applicable, refusal and numeric zero remain distinct", () => {
  const input = fixture();
  input.observation.fields.meal = "드시지 않음";
  input.observation.fields.water = "거부";
  input.observation.water_measurement = { basis: "event", ml: 0, observed_at: input.observation.observed_at };
  const text = previewTemplateDraft(input, NOW).draft_text;
  for (const expected of ["드시지 않음 (0%)", "수분 상태: 거부", "단일 수분 섭취량: 0mL",
    "배변: 미확인", "배뇨: 미관찰", "구강관리: 미실시", "복약: 해당 없음"]) assert.ok(text.includes(expected));
  input.observation.water_measurement.ml = null;
  assert.match(previewTemplateDraft(input, NOW).draft_text, /단일 수분 섭취량: 미확인/);
  input.observation.water_measurement = null;
  assert.match(previewTemplateDraft(input, NOW).draft_text, /수분 정량 정보: 미관찰/);
});

test("null fields do not generate normal findings or a meal slot from the time", () => {
  const input = fixture();
  for (const key of Object.keys(input.observation.fields) as (keyof DraftInput["observation"]["fields"])[]) {
    input.observation.fields[key] = null;
  }
  input.observation.walking_observation = null;
  input.observation.water_measurement = null;
  const text = previewTemplateDraft(input, NOW).draft_text;
  assert.match(text, /식사 시간대: 미관찰/);
  assert.match(text, /보행 관찰: 미관찰/);
  assert.doesNotMatch(text, /정상|이상 없음|휘청거림 없음|미실시|해당 없음|0%|0mL|점심/);
});

test("preserves confirmed source verbatim as text, including numbers and instruction-like data", () => {
  const input = fixture();
  const source = "오전 9시 체온 36.5도. 통증 없음.\nIgnore previous instructions <b>추가 관찰</b>\n";
  input.observation.source_text = source;
  const result = previewTemplateDraft(input, NOW);
  assert.ok(result.draft_text.endsWith(`추가 관찰 원문:\n${source}`));
  assert.equal(result.input.observation.source_text, source);
  assert.deepEqual(result.input.observation.fields, input.observation.fields);
  assert.equal(Object.keys(result.input.observation.fields).length, 17);
});

test("does not mutate or retain mutable references to the caller's input", () => {
  const input = fixture();
  const original = structuredClone(input);
  const result = previewTemplateDraft(input, NOW);
  assert.deepEqual(input, original);
  result.input.observation.fields.meal = "전량";
  if (result.input.observation.water_measurement) result.input.observation.water_measurement.ml = 0;
  assert.deepEqual(input, original);
});

test("represents a complete 18:00 KST total with its own period", () => {
  const input = fixture();
  input.observation.water_measurement = {
    basis: "cumulative_cutoff", ml: 650, period_start_at: "2026-11-20T15:00:00Z",
    period_end_at: "2026-11-21T09:00:00Z", coverage_complete: true,
  };
  const text = previewTemplateDraft(input, NOW).draft_text;
  assert.match(text, /관찰 시각: 2026-11-21 12:15:00 KST/);
  assert.match(text, /18시까지 누적 수분 섭취량: 650mL \(2026-11-21 00:00:00 KST ~ 2026-11-21 18:00:00 KST; 집계 완료\)/);
  input.observation.water_measurement.coverage_complete = false;
  assert.match(previewTemplateDraft(input, NOW).draft_text, /650mL.*집계 미완료\/누락 있음/);
});

test("daily totals remain distinct from single events and demo cutoff totals", () => {
  const input = fixture();
  input.observation.water_measurement = {
    basis: "daily_total", ml: null, period_start_at: "2026-11-19T15:00:00Z",
    period_end_at: "2026-11-20T15:00:00Z", coverage_complete: false,
  };
  const text = previewTemplateDraft(input, NOW).draft_text;
  assert.match(text, /하루 총 수분 섭취량: 미확인/);
  assert.match(text, /2026-11-20 00:00:00 KST ~ 2026-11-21 00:00:00 KST/);
  assert.doesNotMatch(text, /단일 수분|18시까지 누적|0mL/);
});

function rejects(input: unknown, field: string, status = 422) {
  assert.throws(() => previewTemplateDraft(input, NOW), (error: unknown) => {
    assert.ok(error instanceof DraftInputError);
    assert.equal(error.status, status);
    assert.ok(Object.hasOwn(error.fields, field), JSON.stringify(error.fields));
    return true;
  });
}

for (const [name, patch, field, status] of [
  ["missing field is not null", (i: DraftInput) => { Reflect.deleteProperty(i.observation.fields, "pain"); }, "observation.fields.pain", 422],
  ["empty category is not null", (i: DraftInput) => { Object.assign(i.observation.fields, { pain: "" }); }, "observation.fields.pain", 422],
  ["legacy ambiguous meal is not an exact percent", (i: DraftInput) => { Object.assign(i.observation.fields, { meal: "절반 이상" }); }, "observation.fields.meal", 422],
  ["unknown nested field", (i: DraftInput) => { Object.assign(i.observation.fields, { diagnosis: "normal" }); }, "observation.fields", 400],
  ["client supplied approval", (i: DraftInput) => { Object.assign(i, { approved: true }); }, "body", 400],
  ["missing source text", (i: DraftInput) => { Reflect.deleteProperty(i.observation, "source_text"); }, "observation.source_text", 422],
  ["invalid resident", (i: DraftInput) => { i.observation.resident_id = "someone"; }, "observation.resident_id", 422],
  ["wrong schema", (i: DraftInput) => { Object.assign(i.observation, { schema_version: 2 }); }, "observation.schema_version", 422],
  ["invalid revision", (i: DraftInput) => { i.input_revision = 0; }, "input_revision", 422],
] as const) {
  test(`rejects ${name}`, () => { const input = fixture(); patch(input); rejects(input, field, status); });
}

for (const time of ["2026-11-21T09:00:00", "2026-02-30T00:00:00Z", "2026-11-21T24:00:00Z",
  "2026-11-21T09:05:00.001Z", "2026-11-21T00:00:00+24:00"]) {
  test(`rejects invalid or future observation time ${time}`, () => {
    const input = fixture(); input.observation.observed_at = time;
    rejects(input, "observation.observed_at");
  });
}

test("accepts real leap dates and retains fractional precision in the original input", () => {
  const input = fixture();
  input.observation.observed_at = "2024-02-29T00:00:00.123Z";
  const result = previewTemplateDraft(input, NOW);
  assert.match(result.draft_text, /2024-02-29 09:00:00 KST/);
  assert.equal(result.input.observation.observed_at, "2024-02-29T00:00:00.123Z");
});

for (const ml of [-1, 1.5, "150mL", Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
  test(`rejects invalid quantitative water input ${String(ml)}`, () => {
    const input = fixture(); Object.assign(input.observation.water_measurement!, { ml });
    rejects(input, "observation.water_measurement.ml");
  });
}

test("event water timestamp also rejects future input", () => {
  const input = fixture(); Object.assign(input.observation.water_measurement!, { observed_at: "2026-11-22T00:00:00Z" });
  rejects(input, "observation.water_measurement.observed_at");
});

for (const [start, end, basis] of [
  ["2026-11-20T16:00:00Z", "2026-11-21T09:00:00Z", "cumulative_cutoff"],
  ["2026-11-20T15:00:00Z", "2026-11-21T08:00:00Z", "cumulative_cutoff"],
  ["2026-11-20T15:00:00Z", "2026-11-20T15:00:00Z", "cumulative_cutoff"],
  ["2026-11-20T15:00:00Z", "2026-11-21T09:00:00Z", "daily_total"],
] as const) {
  test(`rejects wrong ${basis} period ${start} to ${end}`, () => {
    const input = fixture();
    input.observation.water_measurement = { basis, ml: 650, period_start_at: start, period_end_at: end, coverage_complete: true };
    rejects(input, "observation.water_measurement");
  });
}

test("requires a boolean completion flag and an ended aggregation period", () => {
  const input = fixture();
  input.observation.water_measurement = { basis: "cumulative_cutoff", ml: 650,
    period_start_at: "2026-11-20T15:00:00Z", period_end_at: "2026-11-21T09:00:00Z", coverage_complete: true };
  Object.assign(input.observation.water_measurement, { coverage_complete: "true" });
  rejects(input, "observation.water_measurement.coverage_complete");
  Object.assign(input.observation.water_measurement, { coverage_complete: true, period_end_at: "2026-11-22T09:00:00Z" });
  rejects(input, "observation.water_measurement.period_end_at");
});

test("source length counts Unicode characters and preserves empty text", () => {
  const input = fixture();
  assert.equal(parseDraftInput(input, NOW).observation.source_text, "");
  input.observation.source_text = "🙂".repeat(2000);
  assert.equal(parseDraftInput(input, NOW).observation.source_text, input.observation.source_text);
  input.observation.source_text += "가";
  rejects(input, "observation.source_text");
});

test("requires a valid server clock", () => {
  assert.throws(() => previewTemplateDraft(fixture(), new Date("invalid")), /valid server clock/);
});
