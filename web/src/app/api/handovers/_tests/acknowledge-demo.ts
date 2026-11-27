import { ACK_INPUT, acknowledgementRequest, fixture, INPUT, listRequest, request } from "./fixture";

async function main() {
  const f = fixture();
  await f.post(request());
  const before = await (await f.get(listRequest("", "demo-recipient"))).json();
  const senderAttempt = await f.detail.patch(acknowledgementRequest(ACK_INPUT, "demo-sender"), INPUT.id);
  f.setTime("2026-11-17T09:05:00Z");
  const received = await f.detail.patch(acknowledgementRequest(), INPUT.id);
  const receivedBody = await received.json();
  f.setTime("2026-11-17T09:10:00Z");
  const retry = await f.detail.patch(acknowledgementRequest(), INPUT.id);
  const after = await (await f.get(listRequest("status=acknowledged", "demo-recipient"))).json();
  console.log(JSON.stringify({
    note: "Fictional in-memory demonstration. Real database permissions and UI are not connected.",
    before: before.data[0].status,
    sender_attempt: { status: senderAttempt.status, body: await senderAttempt.json() },
    recipient_acknowledgement: { status: received.status, body: receivedBody },
    identical_retry: { status: retry.status, body: await retry.json() },
    after: after.data[0].status,
    history_entries: f.events.length, acknowledgement_writes: f.actionWrites(),
  }, null, 2));
}
void main();
