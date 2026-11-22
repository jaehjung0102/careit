"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionTitle, StatusBadge } from "@/components/ui";
import { countByStatus, countOpenHandovers, countOverdue, type HandoverItem, type HandoverStatus } from "./handoverData";

type Filter = "all" | HandoverStatus;

export function OverdueBadge() {
  return <span className="inline-flex shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">기한 초과</span>;
}

export function HandoverBoard({ items }: { items: HandoverItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? items : items.filter((x) => x.status === filter);
  const overdue = countOverdue(items);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: items.length },
    ...countByStatus(items).map(({ status, label, count }) => ({ key: status, label, count })),
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="미완료" count={countOpenHandovers(items)} />
        <SummaryCard label="수신 대기" count={items.filter((x) => x.status === "sent").length} />
        <SummaryCard label="기한 초과" count={overdue} warn={overdue > 0} />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <SectionTitle title="인계 목록" subtitle="담당자·기한·진행 상태를 확인하세요. (예시 데이터)" />
        </div>

        <div className="flex gap-2 overflow-x-auto px-5 pb-4 sm:px-6" role="tablist" aria-label="상태별 보기">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === t.key ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
              }`}
            >
              {t.label} {t.count}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="mx-5 mb-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 sm:mx-6 sm:mb-6">
            {filter === "all" ? "아직 등록된 인계가 없어요." : "이 상태의 인계가 없어요."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {visible.map((x) => (
              <li key={x.id}>
                <Link href={`/handovers/${x.id}`} className="block px-5 py-5 transition hover:bg-slate-50 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="min-w-0 break-keep text-sm text-slate-900">{x.title}</strong>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {x.isOverdue && <OverdueBadge />}
                      <StatusBadge tone={x.tone}>{x.statusLabel}</StatusBadge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{x.resident} 어르신</p>
                  <p className="mt-3 text-xs text-slate-500">
                    담당 {x.assignee} · 기한 <span className={x.isOverdue ? "font-semibold text-rose-700" : undefined}>{x.due}</span>
                  </p>
                  {x.awaitingReacknowledge && (
                    <p className="mt-2 text-xs font-medium text-amber-700">담당자가 변경되어 새 담당자의 수신 확인을 기다리고 있어요.</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, count, warn = false }: { label: string; count: number; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${warn ? "text-rose-700" : "text-slate-900"}`}>
        {count}
        <small className="ml-1 text-sm font-semibold text-slate-500">건</small>
      </p>
    </div>
  );
}
