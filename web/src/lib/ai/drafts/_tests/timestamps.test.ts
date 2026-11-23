import assert from "node:assert/strict";
import test from "node:test";
import { DraftInputError, parseDraftInput, type DraftInput } from "../input";
import { previewTemplateDraft } from "../template-preview";
import { generationInput } from "./generation-fixture";

const NOW = new Date("2026-11-23T01:00:00.000Z");

function rejectAt(input: DraftInput, now: Date, field: string) {
  assert.throws(() => parseDraftInput(input, now), (error: unknown) => {
    assert.ok(error instanceof DraftInputError);
    assert.equal(error.status, 422);
    assert.ok(Object.hasOwn(error.fields, field));
    return true;
  });
}

test("a phone two seconds ahead can submit observation and single-drink timestamps unchanged", () => {
  const input = generationInput();
  input.observation.observed_at = "2026-11-23T01:00:02.500Z";
  input.observation.water_measurement = { basis: "event", ml: 0, observed_at: "2026-11-23T10:00:02.500+09:00" };
  const original = structuredClone(input);
  assert.deepEqual(parseDraftInput(input, NOW), original);
  assert.deepEqual(input, original);
});

for (const field of ["observation", "event"] as const) {
  test(`${field} clock tolerance accepts five minutes and rejects one millisecond beyond`, () => {
    const input = generationInput();
    function setTime(value: string) {
      if (field === "observation") input.observation.observed_at = value;
      else input.observation.water_measurement = { basis: "event", ml: 150, observed_at: value };
    }
    setTime("2026-11-23T10:05:00.000+09:00");
    assert.deepEqual(parseDraftInput(input, NOW), input);
    setTime("2026-11-23T10:05:00.001+09:00");
    rejectAt(input, NOW, field === "observation" ? "observation.observed_at" : "observation.water_measurement.observed_at");
  });
}

for (const basis of ["cumulative_cutoff", "daily_total"] as const) {
  for (const complete of [true, false]) {
    test(`${basis} with coverage_complete=${complete} cannot end even one millisecond after server time`, () => {
      const input = generationInput();
      const end = basis === "cumulative_cutoff" ? "2026-11-23T18:00:00+09:00" : "2026-11-24T00:00:00+09:00";
      input.observation.water_measurement = { basis, ml: 650,
        period_start_at: "2026-11-23T00:00:00+09:00", period_end_at: end, coverage_complete: complete };
      // A near-future observation is acceptable; a fixed period has not ended yet.
      input.observation.observed_at = new Date(Date.parse(end) + 2000).toISOString();
      rejectAt(input, new Date(Date.parse(end) - 1), "observation.water_measurement.period_end_at");
      assert.deepEqual(parseDraftInput(input, new Date(end)), input);
    });
  }
}

test("draft timestamps use whole seconds while the original fractional timestamps stay in the input", () => {
  const input = generationInput();
  input.observation.observed_at = "2026-11-23T00:59:59.500Z";
  input.observation.water_measurement = { basis: "event", ml: 150, observed_at: "2026-11-23T09:59:59.123+09:00" };
  const result = previewTemplateDraft(input, NOW);
  assert.match(result.draft_text, /관찰 시각: 2026-11-23 09:59:59 KST\./);
  assert.match(result.draft_text, /관찰 2026-11-23 09:59:59 KST\)/);
  assert.doesNotMatch(result.draft_text, /\.500|\.123/);
  assert.deepEqual(result.input, input);
});

test("whole-second display does not round a late-night observation into the following KST date", () => {
  const input = generationInput();
  input.observation.observed_at = "2026-11-22T14:59:59.999Z";
  const result = previewTemplateDraft(input, NOW);
  assert.match(result.draft_text, /관찰 시각: 2026-11-22 23:59:59 KST\./);
  assert.equal(result.input.observation.observed_at, input.observation.observed_at);
});
