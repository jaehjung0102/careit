import { SectionTitle, StatusBadge } from "@/components/ui";
import type { ChangeItem } from "./changeData";

export function ChangeList({ items }: { items: ChangeItem[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <SectionTitle title="확인할 변화" subtitle="예시 기록을 기반으로 만든 화면입니다." />
      </div>
      {items.length === 0 ? (
        <p className="mx-5 mb-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 sm:mx-6 sm:mb-6">
          지금 확인할 변화가 없어요.
        </p>
      ) : (
        <ul className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {items.map((x) => (
            <li className="rounded-2xl border border-slate-100 p-4 sm:p-5" key={x.id}>
              <div className="flex items-start justify-between gap-3">
                <strong className="min-w-0 break-keep text-sm text-slate-900 sm:text-base">
                  {x.resident} 어르신 · {x.category}
                </strong>
                <StatusBadge tone={x.tone}>관찰 필요</StatusBadge>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-700">{x.summary}</p>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                근거: {x.evidence} · {x.time}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
