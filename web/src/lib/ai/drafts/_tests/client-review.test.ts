import assert from "node:assert/strict";
import test from "node:test";
import { DraftClientError, requestDraft, readDraftResponse } from "../client-request";
import { createDraftReview, replaceDraftObservation, beginDraftRequest, receiveDraft, failDraftRequest, confirmDraft, getConfirmedDraftSnapshot } from "../review-state";
import { generationInput, candidateFor, GENERATION_NOW } from "./generation-fixture";
import { previewTemplateDraft } from "../template-preview";
import type { DraftGenerationResult } from "../generate-draft";
import { createPostDraft } from "../../../../app/api/drafts/_lib/post-draft";

function response(input = generationInput()): DraftGenerationResult {
  return { data: { resident_id: input.observation.resident_id, input_revision: input.input_revision,
    draft_text: previewTemplateDraft(input, GENERATION_NOW).draft_text, generation_mode: "template", fallback_reason: "timeout", requires_confirmation: true },
    meta: { contract_version: "b2-01-draft-3", data_source: "generated" } };
}
function failure(code: string) {
  return (error: unknown) => error instanceof DraftClientError && error.failure.code === code;
}

test("client posts an isolated input to the fixed API endpoint with the current token", async () => {
  const input = generationInput("원문 유지"), before = structuredClone(input);
  const controller = new AbortController();
  const result = await requestDraft(input, "test-token", { signal: controller.signal, fetch: async (url, options) => {
    assert.equal(url, "/api/drafts"); assert.equal(options?.method, "POST");
    assert.deepEqual(options?.headers, { "Content-Type": "application/json", Authorization: "Bearer test-token" });
    assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect, "error"); assert.equal(options?.signal, controller.signal);
    const sent = JSON.parse(String(options?.body)); assert.deepEqual(sent, before);
    input.input_revision = 4; input.observation.source_text = "나중에 수정된 원문";
    return Response.json(response(sent));
  } });
  assert.equal(result.data.input_revision, 3); assert.ok(result.data.draft_text.endsWith("원문 유지"));
});

for (const token of ["", "bad token", "one,two", "token\nvalue"]) {
  test(`client rejects unusable token ${JSON.stringify(token)} without fetching`, async () => {
    let calls = 0;
    await assert.rejects(requestDraft(generationInput(), token, { fetch: async () => { calls++; return Response.json({}); } }), failure("UNAUTHENTICATED"));
    assert.equal(calls, 0);
  });
}

test("network failures do not expose diagnostics or mutate the input", async () => {
  const input = generationInput("원문"), original = structuredClone(input);
  await assert.rejects(requestDraft(input, "test-token", { fetch: async () => { throw new Error("secret upstream detail"); } }), (error: unknown) => {
    assert.ok(error instanceof DraftClientError); assert.equal(error.failure.code, "NETWORK_ERROR");
    assert.equal(error.failure.retryable, true); assert.ok(!error.message.includes("secret")); return true;
  });
  assert.deepEqual(input, original);
});

test("cancellation prevents both a new fetch and a late successful response", async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(requestDraft(generationInput(), "test-token", { signal: controller.signal, fetch: async () => { calls++; return Response.json(response()); } }), failure("CANCELLED"));
  assert.equal(calls, 0);
  const later = new AbortController();
  await assert.rejects(requestDraft(generationInput(), "test-token", { signal: later.signal, fetch: async () => {
    later.abort(); return Response.json(response());
  } }), failure("CANCELLED"));
});

for (const [status, code, retryable] of [[401, "UNAUTHENTICATED", false], [403, "FORBIDDEN", false], [404, "NOT_FOUND", false],
  [503, "DEPENDENCY_NOT_READY", false], [503, "SERVICE_UNAVAILABLE", true], [500, "INTERNAL_ERROR", false]] as const) {
  test(`client recognizes ${status} ${code} without displaying arbitrary upstream messages`, async () => {
    await assert.rejects(requestDraft(generationInput(), "test-token", { fetch: async () => Response.json({
      error: { code, message: "private diagnostics", retryable: !retryable }, meta: { contract_version: "b2-01-draft-3" },
    }, { status }) }), (error: unknown) => {
      assert.ok(error instanceof DraftClientError); assert.equal(error.failure.code, code);
      assert.equal(error.failure.retryable, retryable); assert.ok(!error.message.includes("private")); return true;
    });
  });
}

test("validation retains only field locations; rate limits retain Retry-After", async () => {
  await assert.rejects(requestDraft(generationInput(), "test-token", { fetch: async () => Response.json({
    error: { code: "VALIDATION_ERROR", fields: { "observation.fields.meal": "private diagnostics", "<html>": "unsafe" } },
    meta: { contract_version: "b2-01-draft-3" },
  }, { status: 422 }) }), (error: unknown) => {
    assert.ok(error instanceof DraftClientError); assert.deepEqual(error.failure.fields, { "observation.fields.meal": "입력을 확인해 주세요." }); return true;
  });
  await assert.rejects(requestDraft(generationInput(), "test-token", { fetch: async () => Response.json({
    error: { code: "RATE_LIMITED" }, meta: { contract_version: "b2-01-draft-3" },
  }, { status: 429, headers: { "Retry-After": "45" } }) }), (error: unknown) => {
    assert.ok(error instanceof DraftClientError); assert.equal(error.failure.retry_after_seconds, 45); return true;
  });
});

test("HTML, wrong status/code and non-200 success do not become accepted drafts", async () => {
  for (const reply of [new Response("<html>gateway failure</html>", { status: 502 }),
    Response.json({ error: { code: "UNAUTHENTICATED" }, meta: { contract_version: "b2-01-draft-3" } }, { status: 500 }),
    Response.json(response(), { status: 201 })]) {
    await assert.rejects(requestDraft(generationInput(), "test-token", { fetch: async () => reply }), failure("INVALID_RESPONSE"));
  }
});

test("wrong resident/revision, missing confirmation and inconsistent fallback metadata are rejected", () => {
  for (const patch of [{ resident_id: "resident-2" }, { input_revision: 4 }, { input_revision: "3" },
    { requires_confirmation: false }, { draft_text: " " }, { generation_mode: "llm" }, { fallback_reason: null },
    { fallback_reason: ["timeout"] }, { fallback_reason: "unknown" }]) {
    const body = response(); Object.assign(body.data, patch);
    assert.throws(() => readDraftResponse(generationInput(), body), failure("INVALID_RESPONSE"));
  }
  const body = { ...response(), meta: { contract_version: "b2-01-draft-3", data_source: "mock" } };
  assert.throws(() => readDraftResponse(generationInput(), body), failure("INVALID_RESPONSE"));
});

test("both valid modes are accepted but extra approval/save fields are discarded", () => {
  const template = response(); const llm = structuredClone(template);
  llm.data.generation_mode = "llm"; llm.data.fallback_reason = null;
  for (const body of [template, llm]) {
    const checked = readDraftResponse(generationInput(), { ...body, saved: true, data: { ...body.data, approved: true } });
    assert.equal(Reflect.get(checked, "saved"), undefined); assert.equal(Reflect.get(checked.data, "approved"), undefined);
  }
});

test("review requires explicit confirmation and returns an isolated input/text pair", () => {
  const input = generationInput("처음 원문"), initial = createDraftReview(input);
  input.observation.source_text = "호출자가 나중에 바꿈";
  assert.equal(initial.input.observation.source_text, "처음 원문");
  assert.equal(getConfirmedDraftSnapshot(confirmDraft(initial)), null);
  const pending = beginDraftRequest(initial);
  assert.equal(getConfirmedDraftSnapshot(confirmDraft(pending.state)), null);
  const reviewed = receiveDraft(pending.state, pending.request, response(pending.request.input));
  assert.equal(reviewed.phase, "review"); assert.equal(getConfirmedDraftSnapshot(reviewed), null);
  const confirmed = confirmDraft(reviewed), snapshot = getConfirmedDraftSnapshot(confirmed)!;
  assert.equal(snapshot.input_revision, 3); assert.ok(snapshot.approved_text.endsWith("처음 원문"));
  snapshot.observation.fields.meal = "전량";
  assert.equal(getConfirmedDraftSnapshot(confirmed)!.observation.fields.meal, "절반");
  assert.equal(initial.phase, "editing");
});

for (const change of ["source", "field", "resident", "time", "water", "walking"] as const) {
  test(`${change} edit increments revision, clears approval and rejects the old reply`, () => {
    const pending = beginDraftRequest(createDraftReview(generationInput()));
    const confirmed = confirmDraft(receiveDraft(pending.state, pending.request, response(pending.request.input)));
    const observation = structuredClone(confirmed.input.observation);
    if (change === "source") observation.source_text = "바뀐 원문";
    if (change === "field") observation.fields.meal = "전량";
    if (change === "resident") observation.resident_id = "resident-2";
    if (change === "time") observation.observed_at = "2026-11-22T12:16:00+09:00";
    if (change === "water") observation.water_measurement!.ml = 150;
    if (change === "walking") observation.walking_observation = "휘청거림";
    const edited = replaceDraftObservation(confirmed, observation);
    assert.equal(edited.input.input_revision, 4); assert.equal(edited.phase, "editing"); assert.equal(edited.draft, null);
    assert.equal(getConfirmedDraftSnapshot(edited), null);
    assert.equal(receiveDraft(edited, pending.request, response(pending.request.input)), edited);
    assert.deepEqual(edited.input.observation, observation);
  });
}

test("late replies and failures cannot overwrite newer input or a newer request of the same revision", () => {
  const first = beginDraftRequest(createDraftReview(generationInput()));
  const second = beginDraftRequest(first.state);
  assert.equal(first.request.input.input_revision, second.request.input.input_revision);
  assert.equal(receiveDraft(second.state, first.request, response(first.request.input)), second.state);
  assert.equal(failDraftRequest(second.state, first.request, new Error("old failure")), second.state);
  const reviewed = receiveDraft(second.state, second.request, response(second.request.input));
  assert.equal(reviewed.phase, "review");
  assert.equal(receiveDraft(reviewed, first.request, response(first.request.input)), reviewed);
});

test("resetting a form cannot accept an old response even with the same resident and revision", () => {
  const old = beginDraftRequest(createDraftReview(generationInput()));
  const reset = beginDraftRequest(createDraftReview(generationInput()));
  assert.equal(receiveDraft(reset.state, old.request, response()), reset.state);
});

test("failure preserves every input field, clears confirmation, and retry can recover", () => {
  const input = generationInput("직접 입력도 유지");
  const pending = beginDraftRequest(createDraftReview(input));
  const failed = failDraftRequest(pending.state, pending.request, new DraftClientError("NETWORK_ERROR", { retryable: true }));
  assert.deepEqual(failed.input, input); assert.equal(failed.phase, "error");
  assert.equal(getConfirmedDraftSnapshot(confirmDraft(failed)), null);
  const retry = beginDraftRequest(failed);
  assert.equal(retry.state.error, null);
  assert.equal(receiveDraft(retry.state, retry.request, response(input)).phase, "review");
});

test("a mismatched response becomes a review error while preserving input", () => {
  const pending = beginDraftRequest(createDraftReview(generationInput()));
  const body = response(); body.data.input_revision++;
  const rejected = receiveDraft(pending.state, pending.request, body);
  assert.equal(rejected.phase, "error"); assert.equal(rejected.error?.code, "INVALID_RESPONSE");
  assert.deepEqual(rejected.input, pending.state.input); assert.equal(getConfirmedDraftSnapshot(rejected), null);
});

test("invalid or exhausted revision cannot be reused silently", () => {
  for (const revision of [0, -1, 1.5, NaN]) {
    assert.throws(() => createDraftReview({ ...generationInput(), input_revision: revision }));
  }
  const state = createDraftReview({ ...generationInput(), input_revision: Number.MAX_SAFE_INTEGER });
  assert.throws(() => replaceDraftObservation(state, state.input.observation));
});

test("client, HTTP handler and review state agree on one confirmed snapshot using simulated services", async () => {
  const post = createPostDraft({
    authenticate: async (token) => { assert.equal(token, "test-session"); return { id: "staff-1" }; },
    authorizeResident: async (actor, resident) => { assert.equal(actor.id, "staff-1"); assert.equal(resident, "resident-1"); },
    provider: { generate: async (input) => candidateFor(input) }, now: () => GENERATION_NOW,
  });
  const input = generationInput("추가 관찰 원문"), pending = beginDraftRequest(createDraftReview(input));
  const result = await requestDraft(pending.request.input, "test-session", {
    fetch: async (url, options) => post(new Request(`http://localhost${url}`, options)),
  });
  const reviewed = receiveDraft(pending.state, pending.request, result);
  assert.equal(reviewed.phase, "review"); assert.equal(getConfirmedDraftSnapshot(reviewed), null);
  const snapshot = getConfirmedDraftSnapshot(confirmDraft(reviewed))!;
  assert.deepEqual(snapshot.observation, input.observation); assert.equal(snapshot.input_revision, input.input_revision);
  assert.equal(snapshot.approved_text, result.data.draft_text);
});
