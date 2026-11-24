import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIDraftProvider, openAIDraftOptionsFromEnv, DEFAULT_OPENAI_DRAFT_MODEL } from "../openai-provider";
import { generateDraft, DraftDependencyError } from "../generate-draft";
import { buildProviderRequest } from "../output-validation";
import { candidateFor, generationInput, GENERATION_NOW } from "./generation-fixture";
import { previewTemplateDraft } from "../template-preview";

const KEY = "fixture-key-never-a-real-key";
const request = () => buildProviderRequest(generationInput());
function envelope(candidate: unknown) {
  return { status: "completed", error: null, output: [{ type: "message", role: "assistant", status: "completed",
    content: [{ type: "output_text", text: JSON.stringify(candidate) }] }] };
}
function providerFor(body: unknown, status = 200) {
  return createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async () => Response.json(body, { status }) });
}
const dependencies = (provider: ReturnType<typeof createOpenAIDraftProvider>) => ({
  provider, now: () => GENERATION_NOW, authorizeResident: async () => {},
});

test("OpenAI request is bounded, cancellable, fixed-endpoint and does not send raw notes", async () => {
  const input = generationInput("이 원문은 외부 모델로 보내지 않습니다.");
  const snapshot = structuredClone(input), signal = new AbortController().signal;
  const facts = buildProviderRequest(input); let calls = 0;
  const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.signal, signal); assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "omit");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${KEY}`);
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, DEFAULT_OPENAI_DRAFT_MODEL); assert.equal(body.store, false);
    assert.equal(body.stream, false); assert.equal(body.max_output_tokens, 3072);
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.equal(body.text.format.strict, true); assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(JSON.parse(body.input[0].content[0].text), facts);
    assert.ok(!JSON.stringify(body).includes(input.observation.source_text));
    assert.equal(body.tools, undefined); assert.equal(body.previous_response_id, undefined);
    return Response.json(envelope(candidateFor(facts, 1)));
  } });
  assert.deepEqual(await provider.generate(facts, { signal }), candidateFor(facts, 1));
  assert.equal(calls, 1); assert.deepEqual(input, snapshot);
  assert.ok(!JSON.stringify(provider).includes(KEY));
});

test("real adapter parsing feeds the existing fact validator and preserves original text", async () => {
  const input = generationInput("추가 원문 37.2도.");
  const result = await generateDraft(input, dependencies(providerFor(envelope(candidateFor(buildProviderRequest(input), 1)))));
  assert.equal(result.data.generation_mode, "llm"); assert.equal(result.data.fallback_reason, null);
  assert.equal(result.data.requires_confirmation, true); assert.ok(result.data.draft_text.endsWith(input.observation.source_text));
  assert.match(result.data.draft_text, /0mL/); assert.match(result.data.draft_text, /휘청거림 없음/);
});

for (const [name, body] of [
  ["incomplete", { ...envelope(candidateFor(request())), status: "incomplete" }],
  ["failed", { status: "failed", error: { message: "private" } }],
  ["refusal", { status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "private" }] }] }],
  ["unfinished message", { status: "completed", output: [{ type: "message", role: "assistant", status: "in_progress", content: [] }] }],
  ["tool call", { status: "completed", output: [{ type: "function_call", name: "unwanted" }] }],
  ["empty", { status: "completed", output: [] }],
  ["ambiguous messages", { status: "completed", output: [...envelope(candidateFor(request())).output, ...envelope(candidateFor(request())).output] }],
  ["SDK convenience field only", { status: "completed", output_text: JSON.stringify(candidateFor(request())) }],
] as const) {
  test(`${name} response becomes invalid-output template, not accepted AI text`, async () => {
    const result = await generateDraft(generationInput(), dependencies(providerFor(body)));
    assert.equal(result.data.fallback_reason, "invalid_output");
    assert.equal(result.data.draft_text, previewTemplateDraft(generationInput(), GENERATION_NOW).draft_text);
  });
}

test("changed quantities in otherwise valid JSON fail the independent fact check", async () => {
  const changed = candidateFor(request()); changed.facts.find(f => f.id === "water_measurement")!.text = "물 100mL 섭취.";
  const result = await generateDraft(generationInput(), dependencies(providerFor(envelope(changed))));
  assert.equal(result.data.fallback_reason, "invalid_output"); assert.ok(!result.data.draft_text.includes("100mL"));
});

test("malformed HTTP JSON and malformed model JSON both fail as invalid output", async () => {
  for (const body of ["not-json", JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "{broken" }] }] })]) {
    const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async () => new Response(body) });
    const result = await generateDraft(generationInput(), dependencies(provider));
    assert.equal(result.data.fallback_reason, "invalid_output");
  }
});

test("oversized responses are cancelled before parsing", async () => {
  let cancelled = false;
  const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(128 * 1024 + 1)); },
    cancel() { cancelled = true; },
  })) });
  const result = await generateDraft(generationInput(), dependencies(provider));
  assert.equal(result.data.fallback_reason, "invalid_output"); assert.equal(cancelled, true);
});

for (const status of [429, 500, 502, 503]) {
  test(`HTTP ${status} falls back without retries or leaking the provider body`, async () => {
    let calls = 0;
    const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async () => {
      calls++; return Response.json({ error: { code: "rate_limit_exceeded", message: KEY } }, { status });
    } });
    const result = await generateDraft(generationInput(), dependencies(provider));
    assert.equal(result.data.fallback_reason, "provider_error"); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes(KEY));
  });
}

for (const status of [400, 401, 403, 404]) {
  test(`HTTP ${status} configuration failure stays 503 instead of a template success`, async () => {
    await assert.rejects(generateDraft(generationInput(), dependencies(providerFor({ error: { message: KEY } }, status))), DraftDependencyError);
  });
}
test("account quota exhaustion is a setup error, not transient template success", async () => {
  await assert.rejects(generateDraft(generationInput(), dependencies(providerFor({ error: { code: "insufficient_quota" } }, 429))), DraftDependencyError);
});

test("network errors are sanitized and produce provider-error fallback", async () => {
  const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async () => { throw new Error(KEY); } });
  const result = await generateDraft(generationInput(), dependencies(provider));
  assert.equal(result.data.fallback_reason, "provider_error"); assert.ok(!JSON.stringify(result).includes(KEY));
});
test("deadline abort reaches the transport and keeps the input", async () => {
  let observed: AbortSignal | null | undefined;
  const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async (_url, init) => {
    observed = init?.signal;
    return new Promise((_resolve, reject) => observed?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } });
  const input = generationInput(), before = structuredClone(input);
  const result = await generateDraft(input, { ...dependencies(provider), timeoutMs: 20 });
  assert.equal(result.data.fallback_reason, "timeout"); assert.equal(observed?.aborted, true); assert.deepEqual(input, before);
});
test("already aborted calls never contact the provider", async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  const provider = createOpenAIDraftProvider({ apiKey: KEY, fetchImpl: async () => { calls++; return Response.json({}); } });
  await assert.rejects(provider.generate(request(), { signal: controller.signal })); assert.equal(calls, 0);
});

test("server configuration rejects missing keys, invalid settings, and custom key destinations", () => {
  for (const env of [{}, { OPENAI_API_KEY: " " }, { OPENAI_API_KEY: "bad\nkey" },
    { OPENAI_API_KEY: KEY, OPENAI_DRAFT_MODEL: "bad model" },
    { OPENAI_API_KEY: KEY, OPENAI_DRAFT_REASONING_EFFORT: "unbounded" },
    { OPENAI_API_KEY: KEY, OPENAI_BASE_URL: "https://other.example/v1" },
    { NEXT_PUBLIC_OPENAI_API_KEY: KEY }]) assert.throws(() => openAIDraftOptionsFromEnv(env), DraftDependencyError);
  assert.equal(openAIDraftOptionsFromEnv({ OPENAI_API_KEY: KEY }).model, DEFAULT_OPENAI_DRAFT_MODEL);
  assert.equal(openAIDraftOptionsFromEnv({ OPENAI_API_KEY: KEY, OPENAI_DRAFT_MODEL: "gpt-6.2-sol", OPENAI_DRAFT_REASONING_EFFORT: "low" }).reasoningEffort, "low");
});
