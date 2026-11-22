import assert from "node:assert/strict";
import test from "node:test";
import { createPostDraft, type DraftHttpDependencies } from "../_lib/post-draft";
import { DraftHttpError } from "../_lib/http";
import { POST } from "../route";
import { generationInput, candidateFor, GENERATION_NOW } from "../../../../lib/ai/drafts/_tests/generation-fixture";
import { previewTemplateDraft } from "../../../../lib/ai/drafts/template-preview";

// Test-only services. These never get installed in route.ts.
function dependencies(patch: Partial<DraftHttpDependencies> = {}): DraftHttpDependencies {
  return {
    authenticate: async (token) => {
      if (token !== "test-session") throw new DraftHttpError("UNAUTHENTICATED");
      return { id: "verified-staff" };
    },
    authorizeResident: async () => {},
    provider: { generate: async (request) => candidateFor(request, 1) },
    now: () => GENERATION_NOW,
    ...patch,
  };
}

function request(body: unknown = generationInput(), authorization: string | null = "Bearer test-session", contentType: string | null = "application/json") {
  const headers = new Headers();
  if (authorization !== null) headers.set("Authorization", authorization);
  if (contentType !== null) headers.set("Content-Type", contentType);
  return new Request("http://localhost/api/drafts", { method: "POST", headers, body: JSON.stringify(body) });
}

async function expectError(response: Response, status: number, code: string, retryable = false) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type")!, /application\/json/);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(body.error.retryable, retryable);
  assert.deepEqual(body.meta, { contract_version: "b2-01-draft-3" });
  assert.equal(body.data, undefined);
  assert.equal(body.error.stack, undefined);
  return body;
}

test("successful request authenticates, authorizes the same resident, then calls provider", async () => {
  const order: string[] = [], input = generationInput("확인된 원문 37.2도.");
  const response = await createPostDraft(dependencies({
    authenticate: async (token) => { assert.equal(token, "test-session"); order.push("authenticate"); return { id: "verified-staff" }; },
    authorizeResident: async (actor, residentId) => {
      assert.deepEqual(actor, { id: "verified-staff" }); assert.equal(residentId, input.observation.resident_id); order.push("authorize");
    },
    provider: { generate: async (value) => { order.push("provider"); return candidateFor(value, 1); } },
  }))(request(input));
  assert.deepEqual(order, ["authenticate", "authorize", "provider"]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.data.resident_id, input.observation.resident_id);
  assert.equal(body.data.input_revision, input.input_revision);
  assert.equal(body.data.generation_mode, "llm");
  assert.equal(body.data.fallback_reason, null);
  assert.equal(body.data.requires_confirmation, true);
  assert.ok(body.data.draft_text.endsWith(input.observation.source_text));
  assert.equal(body.data.saved, undefined);
  assert.equal(body.data.actor, undefined);
  assert.deepEqual(body.meta, { contract_version: "b2-01-draft-3", data_source: "generated" });
});

for (const authorization of [null, "Basic test-session", "Bearer", "Bearer token another", "Bearer one,Bearer two"]) {
  test(`rejects invalid authorization header ${authorization} before reading the body`, async () => {
    let calls = 0;
    const req = request({}, authorization);
    const response = await createPostDraft(dependencies({ authenticate: async () => { calls++; return { id: "staff" }; } }))(req);
    await expectError(response, 401, "UNAUTHENTICATED");
    assert.equal(calls, 0); assert.equal(req.bodyUsed, false);
  });
}

test("an invalid session is rejected before input validation and provider use", async () => {
  let calls = 0;
  const req = request({ invalid: "body" }, "Bearer invalid-session");
  await expectError(await createPostDraft(dependencies({ provider: { generate: async () => { calls++; return null; } } }))(req), 401, "UNAUTHENTICATED");
  assert.equal(calls, 0); assert.equal(req.bodyUsed, false);
});

test("an empty authenticated actor is rejected", async () => {
  const response = await createPostDraft(dependencies({ authenticate: async () => ({ id: " " }) }))(request());
  await expectError(response, 401, "UNAUTHENTICATED");
});

test("the actual app route stays unavailable without verified services", async () => {
  await expectError(await POST(request({}, null)), 401, "UNAUTHENTICATED");
  const req = request({}, "Bearer not-a-verified-token");
  await expectError(await POST(req), 503, "DEPENDENCY_NOT_READY");
  assert.equal(req.bodyUsed, false);
});

for (const missing of ["authenticate", "authorizeResident", "provider"] as const) {
  test(`missing ${missing} remains a setup error, not template success`, async () => {
    const deps = dependencies(); Reflect.deleteProperty(deps, missing);
    await expectError(await createPostDraft(deps)(request()), 503, "DEPENDENCY_NOT_READY");
  });
}

for (const [code, status] of [["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404], ["SERVICE_UNAVAILABLE", 503]] as const) {
  test(`resident access ${code} cannot be hidden by a fallback`, async () => {
    let calls = 0;
    const response = await createPostDraft(dependencies({
      authorizeResident: async () => { throw new DraftHttpError(code); },
      provider: { generate: async () => { calls++; return null; } },
    }))(request());
    await expectError(response, status, code, code === "SERVICE_UNAVAILABLE"); assert.equal(calls, 0);
  });
}

test("rate-limit response preserves Retry-After and never generates a draft", async () => {
  let calls = 0;
  const response = await createPostDraft(dependencies({
    authorizeResident: async () => { throw new DraftHttpError("RATE_LIMITED", 45); },
    provider: { generate: async () => { calls++; return null; } },
  }))(request());
  await expectError(response, 429, "RATE_LIMITED", true);
  assert.equal(response.headers.get("retry-after"), "45"); assert.equal(calls, 0);
});

for (const contentType of [null, "text/plain", "application/jsonp"]) {
  test(`rejects unsupported content type ${contentType}`, async () => {
    await expectError(await createPostDraft(dependencies())(request(generationInput(), "Bearer test-session", contentType)), 400, "INVALID_REQUEST");
  });
}

test("accepts JSON with charset and case-insensitive Bearer scheme", async () => {
  assert.equal((await createPostDraft(dependencies())(request(generationInput(), "bearer test-session", "application/json; charset=utf-8"))).status, 200);
});

test("malformed JSON returns 400 without calling the provider", async () => {
  let calls = 0;
  const req = new Request("http://localhost/api/drafts", { method: "POST", headers: { Authorization: "Bearer test-session", "Content-Type": "application/json" }, body: "{" });
  await expectError(await createPostDraft(dependencies({ provider: { generate: async () => { calls++; return null; } } }))(req), 400, "INVALID_REQUEST");
  assert.equal(calls, 0);
});

test("unknown client actor/approval fields cannot change the authenticated identity", async () => {
  let calls = 0;
  const response = await createPostDraft(dependencies({ authorizeResident: async () => { calls++; } }))(
    request({ ...generationInput(), actor: { id: "admin" }, requires_confirmation: false }));
  await expectError(response, 400, "INVALID_REQUEST"); assert.equal(calls, 0);
});

test("invalid structured fields keep actionable 422 field paths", async () => {
  const input = generationInput(); input.input_revision = 0;
  const body = await expectError(await createPostDraft(dependencies())(request(input)), 422, "VALIDATION_ERROR");
  assert.ok(body.error.fields.input_revision);
});

test("source conflicts return 422 before access lookup or provider work", async () => {
  let calls = 0;
  const body = await expectError(await createPostDraft(dependencies({ authorizeResident: async () => { calls++; } }))(request(generationInput("점심 0% 섭취"))), 422, "VALIDATION_ERROR");
  assert.ok(body.error.fields["observation.fields.meal"]);
  assert.ok(body.error.fields["observation.source_text"]); assert.equal(calls, 0);
});

for (const reason of ["provider_error", "invalid_output", "timeout"] as const) {
  test(`${reason} returns a review-required template with the exact input revision`, async () => {
    const input = generationInput("추가 원문 그대로 유지.");
    let aborted = false;
    const response = await createPostDraft(dependencies({ timeoutMs: 20, provider: { generate: async (_req, { signal }) => {
      if (reason === "provider_error") throw new Error("private-provider-detail");
      if (reason === "invalid_output") return { draft_text: "추가된 거짓 사실" };
      signal.addEventListener("abort", () => { aborted = true; });
      return new Promise(() => {});
    } } }))(request(input));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.data.generation_mode, "template"); assert.equal(body.data.fallback_reason, reason);
    assert.equal(body.data.input_revision, input.input_revision); assert.equal(body.data.requires_confirmation, true);
    assert.equal(body.data.draft_text, previewTemplateDraft(input, GENERATION_NOW).draft_text);
    assert.equal(JSON.stringify(body).includes("private-provider-detail"), false);
    if (reason === "timeout") assert.equal(aborted, true);
  });
}

for (const phase of ["authenticate", "authorizeResident"] as const) {
  test(`unexpected ${phase} failure returns generic 500 without exposing details`, async () => {
    let calls = 0;
    const response = await createPostDraft(dependencies({
      [phase]: async () => { throw Object.assign(new Error("private-token-or-db-detail"), { status: 403, code: "FORBIDDEN" }); },
      provider: { generate: async () => { calls++; return null; } },
    }))(request());
    const body = await expectError(response, 500, "INTERNAL_ERROR");
    assert.equal(JSON.stringify(body).includes("private-token-or-db-detail"), false); assert.equal(calls, 0);
  });
}
