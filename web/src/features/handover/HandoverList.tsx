import { SectionTitle, StatusBadge } from "@/components/ui";
import { countByStatus, type HandoverItem } from "./handoverData";

export function HandoverSummary({ items }: { items: HandoverItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {countByStatus(items).map(({ status, count }) => (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center" key={status}>
          <p className="text-xs font-semibold text-slate-500">{status}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {count}
            <small className="ml-1 text-sm font-semibold text-slate-500">건</small>
          </p>
        </div>
      ))}
    </div>
  );
}

export function HandoverList({ items }: { items: HandoverItem[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <SectionTitle title="인계 목록" subtitle="담당자·기한·진행 상태를 확인하세요. (예시 데이터)" />
      </div>
      {items.length === 0 ? (
        <p className="mx-5 mb-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 sm:mx-6 sm:mb-6">
          아직 등록된 인계가 없어요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((x) => (
            <li className="px-5 py-5 sm:px-6" key={x.id}>
              <div className="flex items-start justify-between gap-3">
                <strong className="min-w-0 break-keep text-sm text-slate-900">{x.title}</strong>
                <StatusBadge tone={x.tone}>{x.status}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-slate-600">{x.resident} 어르신</p>
              <p className="mt-3 text-xs text-slate-500">
                담당 {x.assignee} · 기한 {x.due}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
