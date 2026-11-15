"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { residents } from "@/lib/mock/dashboard";
import { SectionTitle } from "@/components/ui";
import { listObservations, saveObservation, type Observation } from "@/lib/db/observations";

const fields = [
  { id: "meal", title: "식사", question: "식사는 얼마나 드셨나요?", options: ["전량", "절반 이상", "절반 미만", "드시지 않음", "미확인"] },
  { id: "water", title: "수분", question: "수분 섭취는 평소와 비교해 어땠나요?", options: ["평소보다 많음", "평소와 비슷함", "평소보다 적음", "미확인"] },
  { id: "bowel", title: "배변", question: "관찰한 배변 상태를 선택해주세요.", options: ["보통 변", "묽은 변", "단단한 변", "배변 없음", "미확인"] },
  { id: "walking", title: "보행", question: "이동할 때 어떤 도움이 필요했나요?", options: ["혼자 걸음", "보조기 사용", "부축 필요", "걷지 않음", "미확인"] },
] as const;
type FieldId = typeof fields[number]["id"];

export default function ObservationForm() {
  const params = useSearchParams();
  const initialId = params.get("resident") ?? "";
  return <ObservationInputs key={initialId} initialId={initialId} />;
}

function ObservationInputs({ initialId }: { initialId: string }) {
  const [residentId, setResidentId] = useState(residents.some(x => x.id === initialId) ? initialId : "");
  const [answers, setAnswers] = useState<Partial<Record<FieldId, string>>>({});
  const resident = residents.find(x => x.id === residentId);
  const selectedCount = Object.keys(answers).length;
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState<Observation[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);

  async function reload() {
    setLoading(true);
    setLoadError(false);
    try { setRecords(await listObservations()); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    listObservations().then(data => {
      if (active) setRecords(previous => [...new Map([...data, ...previous].map(item => [item.id, item])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30));
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  function invalidate() { setConfirmed(false); setMessage(""); requestId.current = null; }
  async function save() {
    if (!resident || selectedCount !== 4 || !confirmed || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const record = await saveObservation({ id: requestId.current, resident_id: residentId, meal: answers.meal!, water: answers.water!, bowel: answers.bowel!, walking: answers.walking! });
      setRecords(previous => [record, ...previous.filter(item => item.id !== record.id)].slice(0, 30));
      setMessage("Supabase에 기록을 저장했습니다.");
      setAnswers({});
      setConfirmed(false);
      requestId.current = null;
    } catch { setMessage("저장하지 못했습니다. 연결 및 Supabase 설정을 확인한 뒤 다시 시도해주세요. 선택한 내용은 유지됩니다."); }
    finally { inFlight.current = false; setSaving(false); }
  }

  return <><section className="panel p-5 sm:p-6">
    <SectionTitle title="새 기록 작성" subtitle="관찰한 상태를 버튼으로 선택해주세요. 확인하지 않은 항목은 ‘미확인’을 선택하세요." />
    <label className="mt-6 block text-sm font-semibold text-slate-700">어르신
      <select disabled={saving} value={residentId} onChange={event => { setResidentId(event.target.value); setAnswers({}); invalidate(); }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal">
        <option value="" disabled>어르신을 선택하세요</option>
        {residents.map(x => <option key={x.id} value={x.id}>{x.name} · {x.room}</option>)}
      </select>
    </label>
    <div className="mt-7 space-y-7">
      {fields.map((field, index) => <fieldset key={field.id} disabled={!resident || saving}>
        <legend className="mb-3 text-sm font-bold text-slate-900"><span className="mr-2 text-teal-600">0{index + 1}</span>{field.title}<span className="mt-1 block font-normal leading-6 text-slate-500">{field.question}</span></legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {field.options.map(option => {
            const selected = answers[field.id] === option;
            return <button type="button" key={option} aria-pressed={selected} onClick={() => { setAnswers(previous => ({ ...previous, [field.id]: option })); invalidate(); }} className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600" : "border-slate-200 bg-white text-slate-600 enabled:hover:border-teal-400 enabled:hover:bg-teal-50"}`}>
              {selected && <span aria-hidden="true" className="mr-1">✓</span>}{option}
            </button>;
          })}
        </div>
      </fieldset>)}
    </div>
    <section aria-live="polite" aria-atomic="true" className="mt-7 rounded-2xl bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">기록 초안</h3><span className="text-xs text-teal-700">{selectedCount} / 4 항목 선택</span></div>
      {!resident ? <p className="mt-3 text-sm text-slate-500">먼저 어르신을 선택해주세요.</p> : <><p className="mt-3 text-sm font-semibold text-slate-700">{resident.name} 어르신</p><dl className="mt-3 grid gap-2 text-sm">{fields.map(field => <div key={field.id} className="flex gap-4"><dt className="w-10 shrink-0 text-slate-500">{field.title}</dt><dd className={answers[field.id] ? "text-slate-800" : "text-slate-400"}>{answers[field.id] ?? "선택 전"}</dd></div>)}</dl></>}
    </section>
    <label className="mt-5 flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmed} disabled={selectedCount !== 4 || saving} onChange={event => setConfirmed(event.target.checked)} className="h-5 w-5 accent-teal-600" />어르신과 네 가지 관찰 내용을 확인했습니다.</label>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={!selectedCount || saving} onClick={() => { setAnswers({}); invalidate(); }} className="button-outline disabled:cursor-not-allowed disabled:opacity-40">선택 초기화</button><button type="button" disabled={!resident || selectedCount !== 4 || !confirmed || saving} onClick={save} className="button-primary disabled:cursor-not-allowed disabled:opacity-40">{saving ? "저장 중…" : "기록 저장"}</button></div>
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">{message}</p>}
  </section>
  <section className="panel p-5 sm:p-6"><SectionTitle title="저장한 기록" subtitle="이 브라우저의 작성자 계정으로 저장한 최근 30건입니다." />
    {loading ? <p className="mt-4 text-sm text-slate-500">기록을 불러오는 중…</p> : loadError ? <div className="mt-4 text-sm"><p>기록을 불러오지 못했습니다. Supabase 연결 설정을 확인해주세요.</p><button className="button-outline mt-3" onClick={reload}>다시 불러오기</button></div> : records.length === 0 ? <p className="mt-4 text-sm text-slate-500">아직 저장한 기록이 없습니다.</p> : null}
    <div className="mt-4 space-y-3">{records.map(record => <article key={record.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{residents.find(item => item.id === record.resident_id)?.name ?? "어르신"} 어르신</strong><time className="text-xs text-slate-500" dateTime={record.created_at}>{new Date(record.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm">{fields.map(field => <div key={field.id}><dt className="text-xs text-slate-500">{field.title}</dt><dd>{record[field.id]}</dd></div>)}</dl></article>)}</div>
  </section></>;
}
