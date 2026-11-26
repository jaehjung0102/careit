import assert from "node:assert/strict";
import test from "node:test";
import { createGetChanges, type ChangesDependencies } from "../_lib/get-changes";
import { GET as unconnectedGET } from "../route";
import { HandoverError } from "../../handovers/_lib/contract";
import { current, history, id, NOW, water } from "../../../../lib/analytics/_tests/comparison-fixture";

const params = `resident_id=resident-1&current_observation_id=${id(99)}`;
const req = (query = params, auth: string | null = "Bearer test-user") => new Request(`http://localhost/api/changes?${query}`, { headers: auth ? { Authorization: auth } : {} });

function fixture() {
  const calls: string[] = [];
  let c = current(), rows = history(); let accessible = true, complete = true;
  const deps: ChangesDependencies = {
    now: () => new Date(NOW),
    async authenticate(token) {
      calls.push("authenticate");
      if (token !== "test-user") throw new HandoverError("UNAUTHENTICATED", "로그인을 확인해 주세요.");
      return { id: "actor-1" };
    },
    repository: {
      dataSource: "mock",
      async getVisibleCurrent(actor, recordId) {
        calls.push("current"); assert.equal(actor.id, "actor-1");
        return accessible && recordId === c.id ? { record: c, access_scope: "author_only" } : null;
      },
      async readAllVisibleHistory(actor, query, asOf) {
        calls.push("history"); assert.equal(actor.id, "actor-1"); assert.equal(query.access_scope, "author_only");
        assert.equal(query.resident_id, "resident-1"); assert.equal(query.current_observation_id, c.id);
        assert.deepEqual(asOf, NOW); assert.equal("limit" in query, false);
        return { records: rows, complete };
      },
    },
  };
  return { deps, calls, GET: createGetChanges(deps), setCurrent: (r: typeof c) => { c = r; },
    setHistory: (r: typeof rows) => { rows = r; }, hide: () => { accessible = false; }, partial: () => { complete = false; } };
}

test("configured test adapter returns contract results and no-store; never labels mock as database", async () => {
  const f = fixture(); const response = await f.GET(req()); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body.meta, { contract_version: "b2-01-draft-3", data_source: "mock" });
  assert.deepEqual(body.data.results.map((r: { delta: number }) => r.delta), [-40, -250]);
  assert.equal(body.data.access_scope, "author_only");
  assert.deepEqual(f.calls, ["authenticate", "current", "history"]);
});

test("database fractional timestamps keep their exact instant in UTC evidence", async () => {
  const f = fixture();
  const databaseTime = (row: ReturnType<typeof current>, day: number, fraction: string) => ({
    ...row, observed_at: `2026-11-${day}T12:15:00.${fraction}+09:00`,
  });
  f.setCurrent(databaseTime(current(), 24, "123456"));
  const rows = history().map((row, i) => databaseTime(row, 19 + i, "123456"));
  f.setHistory(rows);
  const response = await f.GET(req());
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.equal(data.results[0].delta, -40);
  assert.equal(data.results[0].evidence[0].measured_at, "2026-11-19T03:15:00.123456Z");
  assert.ok(data.context.some((item: { history: { observed_at: string }[] }) =>
    item.history.some(entry => entry.observed_at === "2026-11-19T03:15:00.123456Z")));
});

for (const auth of [null, "Basic bad", "Bearer", "Bearer token extra"]) {
  test(`no data is read for missing/malformed authentication ${auth}`, async () => {
    const f = fixture(); const r = await f.GET(req("nonsense=x", auth));
    assert.equal(r.status, 401); assert.deepEqual(f.calls, []);
  });
}

test("invalid token fails before query validation or database reads", async () => {
  const f = fixture(); assert.equal((await f.GET(req("bad=x", "Bearer wrong"))).status, 401);
  assert.deepEqual(f.calls, ["authenticate"]);
});

test("real route fails closed without an adapter, rather than returning sample success", async () => {
  assert.equal((await unconnectedGET(req(params, null))).status, 401);
  const response = await unconnectedGET(req()); const body = await response.json();
  assert.equal(response.status, 503); assert.equal(body.error.code, "DEPENDENCY_NOT_READY");
  assert.equal(body.data, undefined); assert.equal(body.error.retryable, false);
});

for (const [query, status] of [
  ["", 422], [`current_observation_id=${id(99)}`, 422], ["resident_id=resident-1&current_observation_id=bad", 422],
  [`resident_id=resident-4&current_observation_id=${id(99)}`, 422],
  [`${params}&resident_id=resident-2`, 400], [`${params}&current_observation_id=${id(1)}`, 400],
  [`${params}&baseline_mean=0`, 400], [`${params}&actor_id=someone`, 400], [`${params}&limit=30`, 400],
] as const) {
  test(`invalid query never reaches records: ${query}`, async () => {
    const f = fixture(); assert.equal((await f.GET(req(query))).status, status);
    assert.deepEqual(f.calls, ["authenticate"]);
  });
}

test("missing and inaccessible current records both return 404 without reading history", async () => {
  const f = fixture(); f.hide(); const response = await f.GET(req());
  assert.equal(response.status, 404); assert.deepEqual(f.calls, ["authenticate", "current"]);
  const other = fixture(); assert.equal((await other.GET(req(`resident_id=resident-1&current_observation_id=${id(88)}`))).status, 404);
});

test("visible resident mismatch returns 422 and cannot expand the history scope", async () => {
  const f = fixture(); const response = await f.GET(req(`resident_id=resident-2&current_observation_id=${id(99)}`));
  assert.equal(response.status, 422); assert.deepEqual(f.calls, ["authenticate", "current"]);
});

test("empty/insufficient history is an honest 200 with null averages", async () => {
  const f = fixture(); f.setHistory([]); const body = await (await f.GET(req())).json();
  assert.ok(body.data.results.every((r: { status: string; baseline_mean: unknown }) => r.status === "insufficient_data" && r.baseline_mean === null));
});

test("partially fetched history produces retryable 503, never a partial average", async () => {
  const f = fixture(); f.partial(); const response = await f.GET(req()); const body = await response.json();
  assert.equal(response.status, 503); assert.equal(body.error.retryable, true); assert.equal(body.data, undefined);
});

test("malformed, duplicate or foreign-resident adapter rows fail without leaking data", async () => {
  for (const rows of [[{ ...history()[0], resident_id: "resident-2" }], [history()[0], history()[0]], [{ ...history()[0], id: "invalid" }]]) {
    const f = fixture(); f.setHistory(rows); const response = await f.GET(req()); const text = await response.text();
    assert.equal(response.status, 500); assert.ok(!text.includes(rows[0].id));
    assert.ok(!text.includes("resident-2")); assert.ok(!text.includes("Invalid history"));
  }
});

test("no history request is made when neither observation nor water has a usable date", async () => {
  const f = fixture(); f.setCurrent({ ...current(), observed_at: null, water_measurement: null });
  const response = await f.GET(req()); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.data.results[0].status, "context_missing");
  assert.deepEqual(f.calls, ["authenticate", "current"]);
});

test("passes both windows to the authorized adapter when meal and water anchor dates differ", async () => {
  const f = fixture(); f.setCurrent({ ...current(), water_measurement: water(22) });
  f.deps.repository.readAllVisibleHistory = async (_actor, query) => {
    assert.deepEqual(query.windows, [{ start_date: "2026-11-17", end_date: "2026-11-23" }, { start_date: "2026-11-15", end_date: "2026-11-21" }]);
    return { complete: true, records: [] };
  };
  assert.equal((await f.GET(req())).status, 200);
});

test("adapter exceptions cannot expose tokens or connection details", async () => {
  const f = fixture(); f.deps.repository.getVisibleCurrent = async () => { throw new Error("private-connection-string secret-token"); };
  const response = await f.GET(req()); const body = await response.text();
  assert.equal(response.status, 500); assert.ok(!body.includes("private-connection")); assert.ok(!body.includes("secret-token"));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("invalid server clock fails before storage", async () => {
  const f = fixture(); f.deps.now = () => new Date("invalid");
  assert.equal((await f.GET(req())).status, 500); assert.deepEqual(f.calls, ["authenticate"]);
});
