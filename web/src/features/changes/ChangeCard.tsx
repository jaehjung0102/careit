import { StatusBadge } from "@/components/ui";
import {
  CONTEXT_LABEL, EXCLUDED_REASONS, METRIC_LABEL, OUT_OF_SCOPE_REASONS, REASON_LABEL, STATUS_DISPLAY,
  baselineLabel, basisLabel, excludedCount, formatDelta, formatValue, kstTime, outOfScopeCount, shortDate,
  type ChangesData, type Comparison, type ContextItem,
} from "./changeContract";

export function ChangeCard({ name, room, observedLabel, data }: {
  name: string; room: string; observedLabel: string; data: ChangesData;
}) {
  const [meal, water] = data.results;
  return (
    <li className="rounded-2xl border border-slate-100 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <strong className="min-w-0 break-keep text-sm text-slate-900 sm:text-base">{name} 어르신 · {room}</strong>
        <span className="text-xs text-slate-500">{observedLabel}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricRow result={meal} minimum={data.minimum_valid_records} />
        <MetricRow result={water} minimum={data.minimum_valid_records} />
      </div>
      <ContextBlock items={data.context} />
      <p className="mt-3 text-[11px] leading-4 text-slate-400">
        {data.access_scope === "author_only" ? "내가 작성한 기록끼리만 비교했어요." : "시설에서 볼 수 있는 기록을 비교했어요."}
        {" "}평가 시각 {shortDate(data.evaluated_at.slice(0, 10))} {kstTime(data.evaluated_at)}
      </p>
    </li>
  );
}

function MetricRow({ result, minimum }: { result: Comparison; minimum: number }) {
  const display = STATUS_DISPLAY[result.status];
  const delta = formatDelta(result);
  const baseline = baselineLabel(result, minimum);
  const basis = basisLabel(result);
  const excluded = excludedCount(result);
  const outOfScope = outOfScopeCount(result);
  return (
    <div className="flex flex-col rounded-xl bg-slate-50 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-800">{METRIC_LABEL[result.metric]}</span>
        <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="이번 기록" value={formatValue(result, result.current_value)} />
        <Figure label="이전 평균" value={result.baseline_mean === null ? "계산 안 함" : formatValue(result, result.baseline_mean)} muted={result.baseline_mean === null} />
        <Figure label="차이" value={delta ?? "계산 안 함"} muted={delta === null} />
      </dl>

      <p className="mt-3 text-xs leading-5 text-slate-700">{result.summary}</p>

      <details className="group mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer select-none font-bold text-teal-700 marker:text-teal-700">
          근거 {result.evidence.length}건{excluded > 0 ? ` · 제외 ${excluded}건` : ""}
        </summary>
        <div className="mt-2 space-y-2">
          {(basis || baseline) && (
            <p className="leading-5 text-slate-500">{[basis, baseline].filter(Boolean).join(" · ")}</p>
          )}
          {result.evidence.length === 0 ? (
            <p className="rounded-lg bg-white p-2 text-slate-500">비교에 쓴 이전 기록이 없어요.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg bg-white">
              {result.evidence.map((e) => (
                <li className="flex justify-between gap-2 px-2.5 py-1.5" key={`${e.observation_id}-${e.unit_date}`}>
                  <span>{shortDate(e.unit_date)} <span className="text-slate-400">{kstTime(e.measured_at)}</span></span>
                  <span className="font-bold text-slate-800">{formatValue(result, e.value)}</span>
                </li>
              ))}
            </ul>
          )}
          <Exclusions result={result} excluded={excluded} outOfScope={outOfScope} />
        </div>
      </details>
    </div>
  );
}

function Figure({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-1.5 py-2">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className={`mt-0.5 whitespace-nowrap font-bold ${muted ? "text-xs leading-5 text-slate-400" : "text-sm text-slate-900"}`}>{value}</dd>
    </div>
  );
}

function Exclusions({ result, excluded, outOfScope }: { result: Comparison; excluded: number; outOfScope: number }) {
  if (excluded === 0 && outOfScope === 0) return null;
  const rows = (reasons: readonly (keyof typeof REASON_LABEL)[]) =>
    reasons.filter((r) => (result.excluded_counts[r] ?? 0) > 0)
      .map((r) => <li key={r}>{REASON_LABEL[r]} {result.excluded_counts[r]}건</li>);
  return (
    <div className="space-y-1.5 leading-5">
      {excluded > 0 && (
        <div>
          <p className="font-bold text-slate-700">평균에서 뺀 기록 {excluded}건</p>
          <ul className="list-disc pl-4 text-slate-600">{rows(EXCLUDED_REASONS)}</ul>
        </div>
      )}
      {outOfScope > 0 && (
        <p className="text-slate-500">
          비교 대상이 아닌 기록 {outOfScope}건 ({OUT_OF_SCOPE_REASONS.filter((r) => (result.excluded_counts[r] ?? 0) > 0).map((r) => REASON_LABEL[r]).join(", ")})
        </p>
      )}
    </div>
  );
}

// 범주 값은 점수·위험도로 바꾸지 않고 원래 표현 그대로 보여 준다.
function ContextBlock({ items }: { items: ContextItem[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer select-none font-bold text-slate-700">함께 기록된 관찰 {items.length}개</summary>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <li className="rounded-lg border border-slate-100 px-2.5 py-1.5" key={item.category}>
            <span className="text-slate-500">{CONTEXT_LABEL[item.category]}</span>{" "}
            <span className="font-bold text-slate-800">{item.current_value ?? "기록 없음"}</span>
            <span className="block text-[11px] text-slate-400">{historyLabel(item)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function historyLabel(item: ContextItem): string {
  if (item.history.length === 0) return "비교할 이전 기록 없음";
  const values = new Set(item.history.map((h) => h.value));
  if (values.size === 1) return `이전 ${item.history.length}회 모두 ${item.history[0].value}`;
  return `이전 ${item.history.length}회: ${item.history.map((h) => h.value).join(" · ")}`;
}
