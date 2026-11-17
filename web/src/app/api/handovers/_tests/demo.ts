import { fixture, INPUT, request } from "./fixture";

async function main() {
  const f = fixture();
  const created = await f.post(request());
  const result = await created.json();
  const retry = await f.post(request());
  const changed = await f.post(request({ ...INPUT, title: "같은 ID로 다른 내용" }));
  console.log(JSON.stringify({
    note: "Fictional in-memory demonstration only; no database save or UI connection.",
    input: INPUT,
    create: { status: created.status, body: result },
    identical_retry: { status: retry.status },
    changed_retry: { status: changed.status, body: await changed.json() },
    stored_handovers: f.rows.size,
    stored_events: f.events.length,
  }, null, 2));
}
void main();
