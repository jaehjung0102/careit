import type { ReactNode } from "react";
import type { Handover } from "@/app/api/handovers/_lib/contract";
import { SectionTitle, StatusBadge } from "@/components/ui";
import {
  actionLabel, categoryLabel, formatKst, handoverStatusLabel, staffName,
  type HandoverEvent, type HandoverItem,
} from "./handoverData";
import { OverdueBadge } from "./HandoverList";

export function HandoverDetail({ handover: h, events, item, actions }: {
  handover: Handover; events: HandoverEvent[]; item: HandoverItem; actions?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{item.resident} 어르신</p>
            <h2 className="mt-1 break-keep text-xl font-bold text-slate-900">{h.title}</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.isOverdue && <OverdueBadge />}
            <StatusBadge tone={item.tone}>{item.statusLabel}</StatusBadge>
          </div>
        </div>

        {item.awaitingReacknowledge && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            담당자가 변경되어 새 담당자의 수신 확인을 기다리고 있어요. 이전 수신·시작 기록은 아래 이력에 남아 있어요.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Info label="담당자">{item.assignee}</Info>
          <Info label="보낸 사람">{item.sender}</Info>
          <Info label="기한">
            <span className={item.isOverdue ? "font-semibold text-rose-700" : undefined}>{item.due}</span>
          </Info>
          <Info label="보낸 시각">{formatKst(h.created_at)}</Info>
          <Info label="수신 확인">{formatKst(h.acknowledged_at)}</Info>
          <Info label="조치 시작">{formatKst(h.started_at)}</Info>
        </dl>
      </section>

      {actions}

      <section className="panel">
        <div className="panel-heading">
          <SectionTitle title="확인된 사실" subtitle="보낸 사람이 기록에서 확인한 내용이에요." />
        </div>
        <p className="whitespace-pre-line px-5 pb-5 text-sm leading-6 text-slate-700 sm:px-6 sm:pb-6">{h.confirmed_facts}</p>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <SectionTitle title="확인 항목" subtitle={`${item.checkedCount}/${item.itemCount}개 확인됨`} />
        </div>
        <ul className="space-y-2 px-5 pb-5 sm:px-6 sm:pb-6">
          {h.follow_up_items.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <span
                aria-label={f.checked ? "확인됨" : "미확인"}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                  f.checked ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-transparent"
                }`}
              >
                ✓
              </span>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-teal-700">{categoryLabel[f.category]}</span>
                <p className="mt-0.5 text-slate-700">{f.label}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {h.status === "completed" && (
        <section className="panel p-5 sm:p-6">
          <SectionTitle title="조치 결과" subtitle={`${staffName(h.completed_by)} · ${formatKst(h.completed_at)}`} />
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{h.completion_note}</p>
          {h.follow_up_observation_ids.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">연결된 후속 기록 {h.follow_up_observation_ids.length}건</p>
          )}
        </section>
      )}

      {h.status === "cancelled" && (
        <section className="panel p-5 sm:p-6">
          <SectionTitle title="취소 사유" subtitle={`${staffName(h.cancelled_by)} · ${formatKst(h.cancelled_at)}`} />
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{h.cancellation_reason}</p>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <SectionTitle title="진행 이력" subtitle="이력은 지워지지 않고 순서대로 쌓여요." />
        </div>
        <ol className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {events.map((e) => (
            <li key={e.id} className="relative border-l-2 border-teal-100 pl-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-sm text-slate-900">{actionLabel[e.action]}</strong>
                <span className="text-xs text-slate-500">{formatKst(e.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {staffName(e.actor_id)}
                {e.from_status ? ` · ${handoverStatusLabel[e.from_status]} → ${handoverStatusLabel[e.to_status]}` : ` · ${handoverStatusLabel[e.to_status]}`}
              </p>
              {e.action === "create" && <p className="mt-1 text-xs text-slate-600">받는 사람: {staffName(e.to_assignee_id)}</p>}
              {e.action === "reassign" && (
                <p className="mt-1 text-xs text-slate-600">
                  {staffName(e.from_assignee_id)} → {staffName(e.to_assignee_id)}
                </p>
              )}
              {e.reason && <p className="mt-1 text-xs text-slate-700">사유: {e.reason}</p>}
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs leading-5 text-slate-400">
        예시 데이터입니다. 이 화면을 열어 보는 것만으로는 수신 확인이 되지 않아요. 실제 인계 API 연결 전이라 변경 내용은 이 브라우저 탭에만 남아요.
      </p>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 sm:block sm:border-0 sm:pb-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800 sm:mt-1 sm:text-left">{children}</dd>
    </div>
  );
}
