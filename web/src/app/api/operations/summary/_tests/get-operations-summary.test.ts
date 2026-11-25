import assert from "node:assert/strict";
import test from "node:test";
import { HandoverError } from "../../../handovers/_lib/contract";
import { createGetOperationsSummary } from "../_lib/get-operations-summary";
import { GET } from "../route";
import { endpoint, sampleDependencies, sampleRequest } from "./fixture";
import sample from "../example-response.json";

test("the documented sample matches the HTTP response and the read gets verified scope and evaluation time", async () => {
  const deps = sampleDependencies();
  const reads: unknown[] = [];
  const handler = createGetOperationsSummary({
    ...deps,
    async readAuthorizedSnapshot(actor, evaluatedAt) {
      reads.push({ actor, evaluatedAt });
      return deps.readAuthorizedSnapshot();
    },
  });
  const response = await handler(sampleRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), sample);
  assert.deepEqual(reads, [{ actor: { id: "fictional-user" }, evaluatedAt: "2026-11-25T05:00:00.000Z" }]);
});

test("the app route requires a session and stays unavailable until services are connected", async () => {
  const missing = await GET(new Request(endpoint));
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, "UNAUTHENTICATED");

  const unconnected = await GET(sampleRequest());
  assert.equal(unconnected.status, 503);
  assert.equal(unconnected.headers.get("Cache-Control"), "no-store");
  assert.equal((await unconnected.json()).error.code, "DEPENDENCY_NOT_READY");
});

test("invalid sessions and client-supplied workspace parameters cannot reach the snapshot reader", async () => {
  let reads = 0;
  const deps = sampleDependencies();
  const handler = createGetOperationsSummary({
    ...deps,
    async readAuthorizedSnapshot() { reads++; return deps.readAuthorizedSnapshot(); },
  });
  assert.equal((await handler(new Request(endpoint, { headers: { Authorization: "Bearer invalid" } }))).status, 401);
  assert.equal((await handler(sampleRequest(`${endpoint}?workspace_id=other`))).status, 400);
  assert.equal(reads, 0);
});

test("dashboard permission failures return the authorization error without counts", async () => {
  const handler = createGetOperationsSummary({
    ...sampleDependencies(),
    async readAuthorizedSnapshot() { throw new HandoverError("FORBIDDEN", "운영 현황 조회 권한이 없습니다."); },
  });
  const response = await handler(sampleRequest());
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, "FORBIDDEN");
  assert.equal(body.data, undefined);
});

test("an incomplete read returns a retryable error instead of partial totals", async () => {
  const deps = sampleDependencies();
  const handler = createGetOperationsSummary({
    ...deps,
    async readAuthorizedSnapshot() { return { ...await deps.readAuthorizedSnapshot(), complete: false }; },
  });
  const response = await handler(sampleRequest());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(body.error.retryable, true);
  assert.equal(body.data, undefined);
});

test("unknown transfer status stays null while saved records still count", async () => {
  const deps = sampleDependencies();
  const handler = createGetOperationsSummary({
    ...deps,
    async readAuthorizedSnapshot() {
      const snapshot = await deps.readAuthorizedSnapshot();
      return { ...snapshot, observations: snapshot.observations.map(row => ({ ...row, reflection_status: null })) };
    },
  });
  const response = await handler(sampleRequest());
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.pending_reflection, null);
  assert.equal(data.saved_today, 2);
});

test("unexpected storage failures do not expose upstream details", async () => {
  const handler = createGetOperationsSummary({
    ...sampleDependencies(),
    async readAuthorizedSnapshot() { throw new Error("private storage detail"); },
  });
  const response = await handler(sampleRequest());
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.ok(!JSON.stringify(body).includes("private storage detail"));
});
