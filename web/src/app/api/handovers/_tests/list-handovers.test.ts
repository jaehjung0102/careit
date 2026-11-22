import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../route";
import type { Handover } from "../_lib/contract";
import { createGetHandovers } from "../_lib/list-handovers";
import { fixture, INPUT, listRequest, OTHER, RECIPIENT, request } from "./fixture";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function seeded() {
  const f = fixture();
  await f.post(request());
  const base = structuredClone(f.rows.get(INPUT.id)!.handover);
  f.rows.clear();
  function add(n: number, patch: Partial<Handover> = {}) {
    const handover = { ...structuredClone(base), id: id(n),
      created_at: new Date(Date.UTC(2026, 10, 16, 8, n)).toISOString(), ...patch };
    f.rows.set(handover.id, { owner: handover.sender_id, original: "seed-only", handover });
  }
  return { ...f, add };
}

test("empty list succeeds with an empty array, no next page and explicit mock source", async () => {
  const f = fixture();
  const response = await f.get(listRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { data: [], meta: {
    contract_version: "b2-01-draft-3", data_source: "mock", next_cursor: null,
  } });
});

test("created handover appears for sender and recipient; listing changes nothing", async () => {
  const f = fixture();
  const created = await (await f.post(request())).json();
  const before = JSON.stringify([...f.rows]);
  const eventBefore = JSON.stringify(f.events);
  for (const token of ["demo-sender", "demo-recipient"]) {
    const body = await (await f.get(listRequest("", token))).json();
    assert.deepEqual(body.data, [created.data]);
    assert.equal(body.data[0].status, "sent");
    assert.equal(body.data[0].acknowledged_at, null);
  }
  assert.equal(JSON.stringify([...f.rows]), before);
  assert.equal(JSON.stringify(f.events), eventBefore);
  assert.equal(f.writes(), 1);
});

test("newest-first pagination uses ID ties without repeats or skips", async () => {
  const f = await seeded();
  f.add(1, { created_at: "2026-11-16T07:00:00.000Z" });
  f.add(2, { created_at: "2026-11-16T08:00:00.000Z" });
  f.add(3, { created_at: "2026-11-16T08:00:00.000Z" });
  f.add(4, { created_at: "2026-11-16T09:00:00.000Z" });
  f.add(99, { resident_id: "resident-3" });
  const first = await (await f.get(listRequest("limit=2"))).json();
  assert.deepEqual(first.data.map((x: Handover) => x.id), [id(4), id(3)]);
  assert.equal(typeof first.meta.next_cursor, "string");
  const second = await (await f.get(listRequest(`limit=2&cursor=${first.meta.next_cursor}`))).json();
  assert.deepEqual(second.data.map((x: Handover) => x.id), [id(2), id(1)]);
  assert.equal(second.meta.next_cursor, null);
});

test("default limit is 20, maximum is 100, and an exact full last page has no bookmark", async () => {
  const f = await seeded();
  for (let n = 1; n <= 101; n++) f.add(n);
  const standard = await (await f.get(listRequest())).json();
  assert.equal(standard.data.length, 20);
  assert.ok(standard.meta.next_cursor);
  const max = await (await f.get(listRequest("limit=100"))).json();
  assert.equal(max.data.length, 100);
  assert.ok(max.meta.next_cursor);
  f.rows.delete(id(101));
  const exact = await (await f.get(listRequest("limit=100"))).json();
  assert.equal(exact.data.length, 100);
  assert.equal(exact.meta.next_cursor, null);
});

test("all filters combine, including cancelled and overdue false", async () => {
  const f = await seeded();
  f.add(1);
  f.add(2, { resident_id: "resident-2", status: "acknowledged" });
  f.add(3, { status: "cancelled" });
  f.add(4, { status: "in_progress", assignee_id: OTHER });
  f.add(5, { status: "completed" });
  f.setTime("2026-11-18T09:00:00Z");
  const query = async (params: string) => (await (await f.get(listRequest(params))).json()).data as Handover[];
  assert.deepEqual((await query("resident_id=resident-2")).map((x) => x.id), [id(2)]);
  assert.deepEqual((await query(`assignee_id=${OTHER}`)).map((x) => x.id), [id(4)]);
  assert.deepEqual((await query("status=cancelled")).map((x) => x.id), [id(3)]);
  assert.deepEqual((await query("overdue=true")).map((x) => x.id), [id(4), id(2), id(1)]);
  const notOverdue = await query("overdue=false");
  assert.deepEqual(notOverdue.map((x) => x.id), [id(5), id(3)]);
  assert.ok(notOverdue.every((x) => !x.is_overdue));
  assert.deepEqual((await query(`resident_id=resident-1&assignee_id=${RECIPIENT}&status=sent&overdue=true`))
    .map((x) => x.id), [id(1)]);
  assert.deepEqual(await query("status=cancelled&overdue=true"), []);
});

test("overdue is calculated now, strictly after the deadline, without saving it", async () => {
  const f = fixture();
  await f.post(request());
  f.setTime(INPUT.due_at);
  const atDeadline = await (await f.get(listRequest("overdue=true"))).json();
  assert.deepEqual(atDeadline.data, []);
  f.setTime("2026-11-17T12:00:00.001Z");
  const afterDeadline = await (await f.get(listRequest("overdue=true"))).json();
  assert.equal(afterDeadline.data[0].is_overdue, true);
  assert.equal(f.rows.get(INPUT.id)?.handover.is_overdue, false);
});

test("filters cannot expose another user's or facility's records", async () => {
  const f = await seeded();
  f.add(1);
  f.add(2, { resident_id: "resident-3" });
  const unrelated = await (await f.get(listRequest(`assignee_id=${RECIPIENT}`, "demo-other"))).json();
  assert.deepEqual(unrelated.data, []);
  const hiddenResident = await (await f.get(listRequest("resident_id=resident-3"))).json();
  assert.deepEqual(hiddenResident.data, []);
  const visible = await (await f.get(listRequest())).json();
  assert.deepEqual(visible.data.map((x: Handover) => x.id), [id(1)]);
});

test("changed filter, limit or user rejects a previous bookmark", async () => {
  const f = await seeded();
  f.add(1); f.add(2);
  const first = await (await f.get(listRequest("limit=1"))).json();
  const cursor = first.meta.next_cursor;
  const before = f.listReads();
  for (const params of ["limit=2", "limit=1&status=sent", "limit=1&overdue=false", "limit=1&resident_id=resident-1"]) {
    assert.equal((await f.get(listRequest(`${params}&cursor=${cursor}`))).status, 400);
  }
  assert.equal((await f.get(listRequest(`limit=1&cursor=${cursor}`, "demo-recipient"))).status, 400);
  assert.equal(f.listReads(), before);
});

test("later pages recheck revoked access; bookmarks grant no permissions", async () => {
  const f = await seeded();
  f.add(1); f.add(2);
  const first = await (await f.get(listRequest("limit=1"))).json();
  f.revokeAccess();
  const next = await (await f.get(listRequest(`limit=1&cursor=${first.meta.next_cursor}`))).json();
  assert.deepEqual(next.data, []);
  assert.equal(next.meta.next_cursor, null);
});

test("a deleted boundary row and a newer insertion do not shift the next page", async () => {
  const f = await seeded();
  f.add(1); f.add(2); f.add(3);
  const first = await (await f.get(listRequest("limit=1"))).json();
  f.rows.delete(id(3));
  f.add(4);
  const second = await (await f.get(listRequest(`limit=1&cursor=${first.meta.next_cursor}`))).json();
  assert.deepEqual(second.data.map((x: Handover) => x.id), [id(2)]);
});

for (const params of [
  "limit=0", "limit=101", "limit=-1", "limit=1.5", "limit=1e1", "limit=",
  "status=unknown", "status=sent&status=completed", "overdue=1", "overdue=TRUE",
  "resident_id=", "assignee_id=someone", "sender_id=someone", "cursor=", "cursor=not-json",
]) {
  test(`reject invalid query ${params} before reading storage`, async () => {
    const f = fixture();
    const response = await f.get(listRequest(params));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_REQUEST");
    assert.equal(f.listReads(), 0);
  });
}

test("malformed bookmark position/version/filter schema is rejected", async () => {
  const f = await seeded();
  f.add(1); f.add(2);
  const first = await (await f.get(listRequest("limit=1"))).json();
  const original = JSON.parse(Buffer.from(first.meta.next_cursor, "base64url").toString());
  const variants = [
    { ...original, v: 2 }, { ...original, after: { ...original.after, id: "bad" } },
    { ...original, after: { ...original.after, created_at: "2027-02-30T12:00:00.000Z" } },
    { ...original, filters: { ...original.filters, injected: true } },
  ];
  for (const variant of variants) {
    const cursor = Buffer.from(JSON.stringify(variant)).toString("base64url");
    assert.equal((await f.get(listRequest(`limit=1&cursor=${cursor}`))).status, 400);
  }
  assert.equal((await f.get(listRequest(`limit=1&cursor=${"a".repeat(4097)}`))).status, 400);
});

test("authentication, forbidden roles and storage errors do not masquerade as empty success", async () => {
  const f = fixture();
  assert.equal((await f.get(listRequest("", "invalid-token"))).status, 401);
  assert.equal(f.listReads(), 0);
  assert.equal((await f.get(listRequest("", "demo-family"))).status, 403);
  const get = createGetHandovers({ ...f.dependencies, repository: {
    dataSource: "database", async listVisible() { throw new Error("private database diagnostics"); },
  } });
  const response = await get(listRequest());
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes("private database diagnostics"));
  assert.ok(!body.includes('"data"'));
});

test("actual GET route remains closed until verified auth/storage is connected", async () => {
  assert.equal((await GET(new Request("http://localhost/api/handovers"))).status, 401);
  const response = await GET(listRequest());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "DEPENDENCY_NOT_READY");
});
