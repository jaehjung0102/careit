"use client";

import Link from "next/link";
import { HandoverActionPanel } from "./HandoverActionPanel";
import { HandoverDemoBar } from "./HandoverDemoBar";
import { HandoverDetail } from "./HandoverDetail";
import { toHandoverItem } from "./handoverData";
import { useHandoverStore } from "./handoverStore";

export function HandoverDetailView({ id }: { id: string }) {
  const { handovers, events, actorId } = useHandoverStore();
  const handover = handovers.find((h) => h.id === id);

  if (!handover) {
    return (
      <section className="panel p-6 text-center">
        <p className="text-sm text-slate-600">인계를 찾을 수 없어요. 삭제되었거나 볼 수 있는 범위가 아닐 수 있어요.</p>
        <Link href="/handovers" className="text-link mt-3 inline-block">인계 목록으로</Link>
      </section>
    );
  }

  const ordered = [...(events[id] ?? [])].sort((a, b) => a.version_after - b.version_after);
  return (
    <div className="space-y-6">
      <HandoverDemoBar />
      <HandoverDetail
        handover={handover}
        events={ordered}
        item={toHandoverItem(handover)}
        actions={<HandoverActionPanel key={`${handover.id}:${actorId}`} handover={handover} actorId={actorId} />}
      />
    </div>
  );
}
