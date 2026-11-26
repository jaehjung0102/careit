import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay, setImmediate as nextTurn } from "node:timers/promises";
import { DraftInputError } from "../input";
import { generateDraft, DraftDependencyError, DEFAULT_DRAFT_TIMEOUT_MS, type DraftGenerationDependencies } from "../generate-draft";
import type { DraftProviderRequest } from "../output-validation";
import { previewTemplateDraft } from "../template-preview";
import { candidateFor, generationInput, GENERATION_NOW } from "./generation-fixture";

function dependencies(patch: Partial<DraftGenerationDependencies> = {}): DraftGenerationDependencies {
  return { now: () => GENERATION_NOW, authorizeResident: async () => {},
    provider: { generate: async (request) => candidateFor(request, 1) }, ...patch };
}

test("authorizes before provider use and returns the agreed review-required envelope", async () => {
  const order: string[] = [];
  const input = generationInput("추가 관찰 원문은 그대로 보존합니다.");
  const before = structuredClone(input);
  const result = await generateDraft(input, dependencies({
    authorizeResident: async (id) => { assert.equal(id, "resident-1"); order.push("access"); },
    provider: { generate: async (request) => { order.push("provider"); return candidateFor(request, 1); } },
  }));
  assert.deepEqual(order, ["access", "provider"]);
  assert.deepEqual(input, before);
  assert.equal(result.data.generation_mode, "llm");
  assert.equal(result.data.fallback_reason, null);
  assert.equal(result.data.requires_confirmation, true);
  assert.equal(result.data.resident_id, "resident-1");
  assert.equal(result.data.input_revision, 3);
  assert.ok(result.data.draft_text.endsWith(input.observation.source_text));
  assert.deepEqual(result.meta, { contract_version: "b2-01-draft-3", data_source: "generated" });
});

test("provider rejection yields exact template fallback without leaking the exception", async () => {
  const input = generationInput("확인된 추가 관찰 37.2도.");
  const result = await generateDraft(input, dependencies({ provider: {
    generate: async () => { throw new Error("private-provider-error-token-placeholder"); },
  } }));
  assert.equal(result.data.generation_mode, "template");
  assert.equal(result.data.fallback_reason, "provider_error");
  assert.equal(result.data.draft_text, previewTemplateDraft(input, GENERATION_NOW).draft_text);
  assert.equal(result.data.requires_confirmation, true);
  assert.ok(!JSON.stringify(result).includes("private-provider-error"));
});

test("synchronous provider errors also use fallback", async () => {
  const result = await generateDraft(generationInput(), dependencies({ provider: {
    generate: () => { throw new Error("sync adapter failure"); },
  } }));
  assert.equal(result.data.fallback_reason, "provider_error");
});

test("invalid output falls back instead of passing altered facts to the user", async () => {
  const input = generationInput();
  const result = await generateDraft(input, dependencies({ provider: {
    generate: async (request) => {
      const candidate = candidateFor(request);
      candidate.facts.find((f) => f.id === "water_measurement")!.text = "물 10mL 섭취";
      return candidate;
    },
  } }));
  assert.equal(result.data.fallback_reason, "invalid_output");
  assert.equal(result.data.draft_text, previewTemplateDraft(input, GENERATION_NOW).draft_text);
  assert.ok(!result.data.draft_text.includes("10mL"));
});

test("provider mutation cannot change the validation baseline or original input", async () => {
  const input = generationInput(), original = structuredClone(input);
  const result = await generateDraft(input, dependencies({ provider: { generate: async (request) => {
    request.facts.find((f) => f.id === "fields.pain")!.allowed_texts = ["통증: 심함."];
    return candidateFor(request);
  } } }));
  assert.equal(result.data.fallback_reason, "invalid_output");
  assert.match(result.data.draft_text, /통증: 없음/);
  assert.deepEqual(input, original);
});

test("clear source conflicts stay 422 errors and never call the provider", async () => {
  let calls = 0;
  await assert.rejects(generateDraft(generationInput("점심 0% 섭취"), dependencies({ provider: {
    generate: async () => { calls++; return null; },
  } })), (error: unknown) => error instanceof DraftInputError && error.status === 422);
  assert.equal(calls, 0);
});

test("invalid input shape stays an error instead of generating a template", async () => {
  let calls = 0;
  const input = generationInput(); input.input_revision = 0;
  await assert.rejects(generateDraft(input, dependencies({ provider: { generate: async () => { calls++; return null; } } })), DraftInputError);
  assert.equal(calls, 0);
});

for (const status of [401, 403, 404, 503]) {
  test(`access failure ${status} does not become a successful fallback`, async () => {
    let calls = 0;
    const denial = Object.assign(new Error("access denied"), { status });
    await assert.rejects(generateDraft(generationInput(), dependencies({
      authorizeResident: async () => { throw denial; },
      provider: { generate: async () => { calls++; return null; } },
    })), (error: unknown) => error === denial);
    assert.equal(calls, 0);
  });
}

test("missing provider or authorization setup stays 503", async () => {
  await assert.rejects(generateDraft(generationInput()), DraftDependencyError);
  await assert.rejects(generateDraft(generationInput(), dependencies({ provider: undefined })), DraftDependencyError);
  const bad = dependencies(); Reflect.deleteProperty(bad, "authorizeResident");
  await assert.rejects(generateDraft(generationInput(), bad), DraftDependencyError);
});

for (const timeoutMs of [0, -1, NaN, Infinity, 1.5, 60_001]) {
  test(`invalid server timeout ${timeoutMs} stays a setup error`, async () => {
    let calls = 0;
    await assert.rejects(generateDraft(generationInput(), dependencies({ timeoutMs, provider: {
      generate: async () => { calls++; return null; },
    } })), DraftDependencyError);
    assert.equal(calls, 0);
  });
}

test("provider timeout returns fallback even if the adapter ignores cancellation", async () => {
  assert.equal(DEFAULT_DRAFT_TIMEOUT_MS, 10_000);
  let signal: AbortSignal | undefined;
  const result = await generateDraft(generationInput(), dependencies({ timeoutMs: 20, provider: {
    generate: (_request, options) => { signal = options.signal; return new Promise(() => {}); },
  } }));
  assert.equal(result.data.fallback_reason, "timeout");
  assert.equal(result.data.generation_mode, "template");
  assert.equal(signal?.aborted, true);
});

test("abort-aware adapter rejection is classified as timeout, not provider_error", async () => {
  const result = await generateDraft(generationInput(), dependencies({ timeoutMs: 20, provider: {
    generate: (_request, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  } }));
  assert.equal(result.data.fallback_reason, "timeout");
});

test("late success cannot overwrite a timeout fallback", async () => {
  let finish!: (value: unknown) => void, request!: DraftProviderRequest;
  const result = await generateDraft(generationInput(), dependencies({ timeoutMs: 20, provider: {
    generate: (input) => { request = input; return new Promise((resolve) => { finish = resolve; }); },
  } }));
  const before = structuredClone(result);
  finish(candidateFor(request, 1)); await nextTurn();
  assert.deepEqual(result, before);
  assert.equal(result.data.fallback_reason, "timeout");
});

test("late rejection after a timeout is handled", async () => {
  let rejectLater!: (reason: Error) => void;
  const result = await generateDraft(generationInput(), dependencies({ timeoutMs: 20, provider: {
    generate: () => new Promise((_, reject) => { rejectLater = reject; }),
  } }));
  rejectLater(new Error("late rejection")); await nextTurn();
  assert.equal(result.data.fallback_reason, "timeout");
});

test("successful generation clears its watchdog without later aborting the adapter", async () => {
  let signal: AbortSignal | undefined;
  const result = await generateDraft(generationInput(), dependencies({ timeoutMs: 50, provider: {
    generate: async (request, options) => { signal = options.signal; return candidateFor(request); },
  } }));
  assert.equal(result.data.fallback_reason, null);
  await delay(60);
  assert.equal(signal?.aborted, false);
});

test("concurrent revisions finishing out of order retain their own input snapshots", async () => {
  const pending = new Map<number, { request: DraftProviderRequest; finish: (value: unknown) => void }>();
  const deps = dependencies({ provider: { generate: (request) => new Promise((finish) => {
    pending.set(request.input_revision, { request, finish });
  }) } });
  const input = generationInput("원래 원문");
  const first = generateDraft(input, deps);
  // A later valid UI snapshot is a separate request; the earlier call is isolated.
  input.input_revision = 4;
  input.observation.fields.meal = "전량"; input.observation.source_text = "수정된 원문";
  const second = generateDraft(input, deps);
  await nextTurn();
  const newer = pending.get(4)!, older = pending.get(3)!;
  newer.finish(candidateFor(newer.request)); const newResult = await second;
  older.finish(candidateFor(older.request)); const oldResult = await first;
  assert.equal(oldResult.data.input_revision, 3); assert.match(oldResult.data.draft_text, /절반 \(50%\)/);
  assert.ok(oldResult.data.draft_text.endsWith("원래 원문"));
  assert.equal(newResult.data.input_revision, 4); assert.match(newResult.data.draft_text, /전량 \(100%\)/);
  assert.ok(newResult.data.draft_text.endsWith("수정된 원문"));
});
