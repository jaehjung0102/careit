import { fixture, INPUT, listRequest, request } from "./fixture";

async function main() {
  const f = fixture();
  const empty = await (await f.get(listRequest())).json();
  await f.post(request());
  f.setTime("2026-11-17T09:01:00Z");
  await f.post(request({ ...INPUT, id: "10000000-0000-4000-8000-000000000002",
    title: "다음 근무 수분 섭취 기록 확인", follow_up_items: [{ ...INPUT.follow_up_items[0],
      category: "water", label: "다음 근무의 수분 섭취량을 기록해 주세요.",
    }],
  }));
  const first = await (await f.get(listRequest("limit=1"))).json();
  const second = await (await f.get(listRequest(`limit=1&cursor=${first.meta.next_cursor}`))).json();
  const unrelated = await (await f.get(listRequest("", "demo-other"))).json();
  console.log(JSON.stringify({
    note: "Fictional memory demonstration. Real database, permission integration and UI are pending.",
    empty_list: empty, newest_first_page: first, next_page: second,
    unrelated_user: unrelated, events_after_reading: f.events.length,
    saved_statuses: [...f.rows.values()].map(({ handover }) => handover.status),
  }, null, 2));
}
void main();
