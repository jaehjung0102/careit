import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIPostDraft, type OpenAIDraftHttpDependencies } from "../_lib/openai-post-draft";
import { DraftHttpError } from "../_lib/http";
import { generationInput, GENERATION_NOW, candidateFor } from "../../../../lib/ai/drafts/_tests/generation-fixture";
import type { DraftProviderRequest } from "../../../../lib/ai/drafts/output-validation";

const request = (body: unknown = generationInput(), token: string | null = "test-session") => new Request("http://localhost/api/drafts", {
  method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
function fixture() {
  const calls: string[] = [];
  const deps: OpenAIDraftHttpDependencies = {
    now: () => GENERATION_NOW,
    authenticate: async (token) => { calls.push("auth"); if (token !== "test-session") throw new DraftHttpError("UNAUTHENTICATED"); return { id: "fictional-user" }; },
    authorizeResident: async (_actor, id) => { calls.push("access"); assert.equal(id, "resident-1"); },
    openai: { apiKey: "not-a-real-key", fetchImpl: async (_url, init) => {
      calls.push("openai"); const body = JSON.parse(init?.body as string);
      const input = JSON.parse(body.input[0].content[0].text) as DraftProviderRequest;
      return Response.json({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(candidateFor(input)) }] }] });
    } },
  };
  return { deps, calls };
}
test("configured HTTP composition verifies user and resident before OpenAI", async () => {
  const f = fixture(); const response = await createOpenAIPostDraft(f.deps)(request()); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.data.generation_mode, "llm"); assert.equal(body.data.requires_confirmation, true);
  assert.deepEqual(f.calls, ["auth", "access", "openai"]); assert.equal(body.data.saved, undefined);
});
test("missing B1 dependencies remain closed even when a caller has a bearer header", async () => {
  assert.equal((await createOpenAIPostDraft()(request())).status, 503);
  assert.equal((await createOpenAIPostDraft()(request({}, null))).status, 401);
});
test("invalid tokens, denied residents and input errors make no OpenAI call", async () => {
  const unauth = fixture(); assert.equal((await createOpenAIPostDraft(unauth.deps)(request({}, "wrong"))).status, 401); assert.deepEqual(unauth.calls, ["auth"]);
  const forbidden = fixture(); forbidden.deps.authorizeResident = async () => { throw new DraftHttpError("NOT_FOUND"); };
  assert.equal((await createOpenAIPostDraft(forbidden.deps)(request())).status, 404); assert.deepEqual(forbidden.calls, ["auth"]);
  const invalid = fixture(); const input = generationInput(); input.input_revision = 0;
  assert.equal((await createOpenAIPostDraft(invalid.deps)(request(input))).status, 422); assert.deepEqual(invalid.calls, ["auth"]);
});
test("missing server key and upstream invalid key return sanitized configuration error", async () => {
  for (const missing of [true, false]) {
    const f = fixture(); if (missing) f.deps.openai.apiKey = "";
    else f.deps.openai.fetchImpl = async () => Response.json({ error: { message: "secret-upstream-details" } }, { status: 401 });
    const response = await createOpenAIPostDraft(f.deps)(request()); const text = await response.text(); const body = JSON.parse(text);
    assert.equal(response.status, 503); assert.equal(body.error.code, "DEPENDENCY_NOT_READY");
    assert.equal(body.data, undefined); assert.ok(!text.includes("secret-upstream-details"));
  }
});
