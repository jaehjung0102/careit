"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { CATEGORIES, type Category } from "@/app/api/handovers/_lib/contract";
import { residents } from "@/lib/mock/dashboard";
import { HandoverDemoBar } from "./HandoverDemoBar";
import { categoryLabel, formatKst } from "./handoverData";
import { MOCK_OBSERVATIONS, MOCK_STAFF } from "./handoverMock";
import { submitCreateHandover, useHandoverStore, type HandoverFailure } from "./handoverStore";

type Row = { key: number; category: Category | ""; label: string };

const MAX_ITEMS = 10;
const INPUT = "w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800";
let rowSeq = 0;
const newRow = (): Row => ({ key: ++rowSeq, category: "", label: "" });

// <input type="datetime-local">은 브라우저 현지 시각 문자열을 쓴다.
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function preset(kind: "3h" | "today18" | "tomorrow9") {
  const d = new Date();
  // 지금부터 실제 3시간 뒤(분 유지). 초·밀리초만 버린다.
  if (kind === "3h") { d.setTime(d.getTime() + 3 * 60 * 60 * 1000); d.setSeconds(0, 0); }
  if (kind === "today18") d.setHours(18, 0, 0, 0);
  if (kind === "tomorrow9") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  return toLocalInput(d);
}

// 제출 시점에만 호출한다(렌더링 중 현재 시각을 읽지 않음). 최종 판단은 서버가 한다.
function isFuture(date: Date) {
  return date.getTime() > Date.now();
}

export function HandoverCreateForm() {
  const router = useRouter();
  const { actorId } = useHandoverStore();
  const [residentId, setResidentId] = useState("");
  const [observationIds, setObservationIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [facts, setFacts] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [assigneeId, setAssigneeId] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HandoverFailure | null>(null);
  // 같은 내용을 다시 보낼 때만 같은 인계 ID를 쓴다(응답 유실 시 중복 생성 방지). 내용이 바뀌면 새 ID.
  const attempt = useRef<{ key: string; id: string; itemIds: string[] } | null>(null);

  const dueDate = due ? new Date(due) : null;
  const dueValid = dueDate !== null && Number.isFinite(dueDate.getTime());
  const rowsValid = rows.every((r) => r.category && r.label.trim() && [...r.label].length <= 200);
  const ready = residentId && observationIds.length > 0 && title.trim() && [...title].length <= 100
    && facts.trim() && [...facts].length <= 2000 && rowsValid && assigneeId && dueValid;
  const fieldError = (key: string) => error?.fields?.[key]
    ?? Object.entries(error?.fields ?? {}).find(([k]) => k.startsWith(`${key}.`))?.[1];

  async function onSubmit() {
    if (!ready || !dueDate) return;
    if (!isFuture(dueDate)) {
      setError({ code: "VALIDATION_ERROR", message: "입력을 확인해 주세요.", fields: { due_at: "현재 시각보다 늦은 기한을 선택해 주세요." }, retryable: false });
      return;
    }
    const content = {
      resident_id: residentId,
      observation_ids: observationIds,
      title: title.trim(),
      confirmed_facts: facts.trim(),
      follow_up_items: rows.map((r) => ({ category: r.category, label: r.label.trim() })),
      assignee_id: assigneeId,
      due_at: dueDate.toISOString(),
    };
    const key = JSON.stringify(content);
    if (attempt.current?.key !== key) {
      attempt.current = { key, id: crypto.randomUUID(), itemIds: rows.map(() => crypto.randomUUID()) };
    }
    const { id, itemIds } = attempt.current;
    setBusy(true);
    setError(null);
    const result = await submitCreateHandover({
      id, ...content, follow_up_items: content.follow_up_items.map((item, i) => ({ id: itemIds[i], ...item })),
    });
    if (result.ok) {
      router.push(`/handovers/${result.data.id}`);
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  const updateRow = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-6">
      <HandoverDemoBar />

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Panel title="어르신과 근거 기록" hint="인계는 실제 관찰 기록을 근거로 보내요.">
          <Field label="어르신" error={fieldError("resident_id")}>
            <select value={residentId} required onChange={(e) => { setResidentId(e.target.value); setObservationIds([]); }} className={INPUT}>
              <option value="">선택해 주세요</option>
              {residents.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.room})</option>)}
            </select>
          </Field>
          {residentId && (
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">근거 기록 (1개 이상)</legend>
              <ul className="mt-2 space-y-2">
                {(MOCK_OBSERVATIONS[residentId] ?? []).map((o) => (
                  <li key={o.id}>
                    <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-teal-700"
                        checked={observationIds.includes(o.id)}
                        onChange={(e) => setObservationIds((prev) => e.target.checked ? [...prev, o.id] : prev.filter((x) => x !== o.id))}
                      />
                      {o.label}
                    </label>
                  </li>
                ))}
              </ul>
              {fieldError("observation_ids") && <p className="mt-1 text-xs text-rose-700">{fieldError("observation_ids")}</p>}
            </fieldset>
          )}
        </Panel>

        <Panel title="전달할 내용" hint="추측이 아닌, 기록에서 확인한 사실만 적어 주세요.">
          <Field label="제목" count={[title, 100]} error={fieldError("title")}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="예: 저녁 식사량 확인 요청" className={INPUT} />
          </Field>
          <Field label="확인된 사실" count={[facts, 2000]} error={fieldError("confirmed_facts")}>
            <textarea value={facts} onChange={(e) => setFacts(e.target.value)} required rows={3}
              placeholder="예: 점심 식사량 40%로 기록됨. 지난 7일 같은 끼니 평균보다 낮음." className={`${INPUT} leading-6`} />
          </Field>
        </Panel>

        <Panel title={`다음 근무자가 확인할 항목 (${rows.length}/${MAX_ITEMS})`} hint="받은 사람은 모든 항목을 확인해야 조치를 완료할 수 있어요.">
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={r.key} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">항목 {i + 1}</span>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} className="text-xs font-semibold text-rose-700">
                      삭제
                    </button>
                  )}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
                  <select aria-label={`항목 ${i + 1} 분류`} value={r.category} required onChange={(e) => updateRow(r.key, { category: e.target.value as Category })} className={INPUT}>
                    <option value="">분류</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
                  </select>
                  <input aria-label={`항목 ${i + 1} 내용`} value={r.label} required maxLength={200} onChange={(e) => updateRow(r.key, { label: e.target.value })}
                    placeholder="예: 저녁 식사량을 기록해 주세요." className={INPUT} />
                </div>
              </li>
            ))}
          </ul>
          {rows.length < MAX_ITEMS && (
            <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])} className="text-sm font-semibold text-teal-700">
              + 항목 추가
            </button>
          )}
          {fieldError("follow_up_items") && <p className="text-xs text-rose-700">{fieldError("follow_up_items")}</p>}
        </Panel>

        <Panel title="받는 사람과 기한" hint="받는 사람이 직접 수신 확인해야 '수신 확인' 상태가 돼요.">
          <Field label="담당자" error={fieldError("assignee_id")}>
            <select value={assigneeId} required onChange={(e) => setAssigneeId(e.target.value)} className={INPUT}>
              <option value="">선택해 주세요</option>
              {Object.entries(MOCK_STAFF).filter(([id]) => id !== actorId).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
          <Field label="기한" error={fieldError("due_at")}>
            <input type="datetime-local" value={due} required onChange={(e) => setDue(e.target.value)} className={INPUT} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {([["3h", "3시간 뒤"], ["today18", "오늘 18시"], ["tomorrow9", "내일 9시"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setDue(preset(k))}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-teal-300">
                {label}
              </button>
            ))}
          </div>
          {dueValid && <p className="text-xs text-slate-500">기한: {formatKst(dueDate!.toISOString())} (한국 시간)</p>}
        </Panel>

        {error && (
          <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p>{error.message}</p>
            {error.retryable && <p className="mt-1 text-xs">입력한 내용은 그대로 있어요. 아래 버튼으로 다시 보내 주세요.</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/handovers" className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500">취소</Link>
          <button type="submit" disabled={!ready || busy} aria-busy={busy}
            className="min-h-11 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "보내는 중…" : error?.retryable ? "다시 보내기" : "인계 보내기"}
          </button>
        </div>
        <p className="text-right text-xs text-slate-400">예시 데이터 · 실제 인계 API 연결 전이라 이 브라우저 탭에만 저장돼요.</p>
      </form>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="panel space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, error, count }: { label: string; children: ReactNode; error?: string; count?: [string, number] }) {
  const length = count ? [...count[0]].length : 0;
  return (
    <label className="block text-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-900">{label}</span>
        {count && <span className={`text-xs ${length > count[1] ? "text-rose-700" : "text-slate-400"}`}>{length}/{count[1]}</span>}
      </span>
      <span className="mt-2 block">{children}</span>
      {error && <span className="mt-1 block text-xs text-rose-700">{error}</span>}
    </label>
  );
}
