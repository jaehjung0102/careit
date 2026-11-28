"use client";

import { useState } from "react";
import { SectionTitle } from "@/components/ui";
import { ChangeCard } from "./ChangeCard";
import { STATUS_DISPLAY } from "./changeContract";
import type { ChangeView } from "./changeData";

type Preview = "cases" | "empty" | "error";
const PREVIEWS: { key: Preview; label: string }[] = [
  { key: "cases", label: "상태별 사례" },
  { key: "empty", label: "기록 없음" },
  { key: "error", label: "불러오기 실패" },
];

export function ChangeList({ views }: { views: Record<Preview, ChangeView> }) {
  const [preview, setPreview] = useState<Preview>("cases");
  const view = views[preview];
  return (
    <section className="panel">
      <div className="space-y-3 px-5 pb-4 pt-[22px] sm:px-6">
        <SectionTitle title="확인할 변화" subtitle="이전 7일 같은 조건의 기록과 비교한 결과와 근거입니다." />
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          예시 데이터(mock)로 만든 화면입니다. 실제 기록과 연결되지 않았어요.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="예시 화면 선택">
          {PREVIEWS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preview === p.key}
              onClick={() => setPreview(p.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${preview === p.key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ChangeBody view={view} onRetry={() => setPreview("cases")} />
    </section>
  );
}

function ChangeBody({ view, onRetry }: { view: ChangeView; onRetry: () => void }) {
  if (view.kind === "error") {
    return (
      <div className="mx-5 mb-5 rounded-xl border border-rose-100 bg-rose-50 p-5 text-sm sm:mx-6 sm:mb-6" role="alert">
        <p className="font-bold text-rose-800">변화를 확인하지 못했어요</p>
        <p className="mt-1 leading-6 text-rose-700">{view.failure.error.message}</p>
        <p className="mt-1 text-xs text-rose-600">일부 기록만으로 비교하면 결과가 틀릴 수 있어 표시하지 않았어요.</p>
        {view.failure.error.retryable && (
          <button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-700 shadow-sm">
            다시 시도
          </button>
        )}
      </div>
    );
  }
  if (view.cases.length === 0) {
    return (
      <p className="mx-5 mb-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 sm:mx-6 sm:mb-6">
        오늘 비교할 관찰 기록이 아직 없어요.
      </p>
    );
  }
  const counts = tally(view.cases.flatMap((c) => c.response.data.results.map((r) => r.status)));
  return (
    <>
      <p className="px-5 pb-3 text-xs text-slate-500 sm:px-6">
        변화 있음 {counts.changed} · 변화 없음 {counts.unchanged} · 비교하지 않음 {counts.notCompared}
        <span className="text-slate-400"> (식사·수분 항목 기준)</span>
      </p>
      <ul className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
        {view.cases.map((c) => (
          <ChangeCard key={c.key} name={c.resident_name} room={c.room} observedLabel={c.observed_label} data={c.response.data} />
        ))}
      </ul>
    </>
  );
}

function tally(statuses: (keyof typeof STATUS_DISPLAY)[]) {
  return {
    changed: statuses.filter((s) => s === "changed").length,
    unchanged: statuses.filter((s) => s === "unchanged").length,
    notCompared: statuses.filter((s) => !STATUS_DISPLAY[s].compared).length,
  };
}
