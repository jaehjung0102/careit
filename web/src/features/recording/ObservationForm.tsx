"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { residents as demoResidents } from "@/lib/mock/dashboard";
import { SectionTitle } from "@/components/ui";
import { listObservations, saveObservation, type Observation, type ObservationInput } from "@/lib/db/observations";
import { observationFieldCount, observationFields, observationGroups, type ObservationFieldId } from "./observationFields";

type Answers = Partial<Record<ObservationFieldId, string>>;

type ResidentOption = { id: string; name: string; room: string; team_id?: string };
type Props = { residents?: ResidentOption[]; teamId?: string };

export default function ObservationForm({ residents = demoResidents, teamId }: Props) {
  const params = useSearchParams();
  const initialId = params.get("resident") ?? "";
  return <ObservationInputs key={`${teamId ?? "private"}:${initialId}`} initialId={initialId} residents={residents} teamId={teamId} />;
}

function ObservationInputs({ initialId, residents, teamId }: Props & { initialId: string; residents: ResidentOption[] }) {
  const [residentId, setResidentId] = useState(residents.some((resident) => resident.id === initialId) ? initialId : "");
  const [answers, setAnswers] = useState<Answers>({});
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState<Observation[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const resident = residents.find((item) => item.id === residentId);
  const selectedCount = observationFields.filter((field) => answers[field.id]).length;
  const complete = selectedCount === observationFieldCount;

  async function reload() {
    setLoading(true);
    setLoadError(false);
    try {
      setRecords(await listObservations(teamId));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    listObservations(teamId)
      .then((data) => {
        if (active) {
          setRecords((previous) => [...new Map([...data, ...previous].map((item) => [item.id, item])).values()]
            .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30));
        }
      })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [teamId]);

  function invalidate() {
    setConfirmed(false);
    setMessage("");
    requestId.current = null;
  }

  function choose(fieldId: ObservationFieldId, option: string) {
    setAnswers((previous) => ({ ...previous, [fieldId]: option }));
    invalidate();
  }

  async function save() {
    if (!resident || !complete || !confirmed || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setMessage("");
    requestId.current ??= crypto.randomUUID();
    const values = Object.fromEntries(observationFields.map((field) => [field.id, answers[field.id]!])) as Record<ObservationFieldId, string>;
    const input: ObservationInput = { id: requestId.current, resident_id: residentId, ...values, ...(teamId ? { team_id: teamId } : {}) };
    try {
      const record = await saveObservation(input);
      setRecords((previous) => [record, ...previous.filter((item) => item.id !== record.id)].slice(0, 30));
      setMessage("Supabase에 관찰 기록을 저장했습니다.");
      setAnswers({});
      setConfirmed(false);
      requestId.current = null;
    } catch {
      setMessage("저장하지 못했습니다. 확장 데이터베이스 변경이 적용되었는지 확인한 뒤 다시 시도해주세요. 선택한 내용은 유지됩니다.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <>
    <section className="panel p-5 sm:p-6">
      <SectionTitle title="새 기록 작성" subtitle="식사 시간대와 신체·인지·정서·생활지원 상태를 버튼으로 선택해주세요." />
      <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        이 화면은 장기요양 기록 항목을 참고한 관찰 도구입니다. 진단이 필요한 급격한 변화나 응급상황은 기록만 남기지 말고 즉시 담당자에게 보고하세요.
      </p>
      <label className="mt-6 block text-sm font-semibold text-slate-700">어르신
        <select disabled={saving} value={residentId} onChange={(event) => { setResidentId(event.target.value); setAnswers({}); invalidate(); }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal">
          <option value="" disabled>어르신을 선택하세요</option>
          {residents.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.room}</option>)}
        </select>
      </label>

      <div className="mt-8 space-y-10">
        {observationGroups.map((group, groupIndex) => <section key={group.title} aria-labelledby={`group-${groupIndex}`}>
          <div className="mb-5 border-b border-slate-200 pb-3">
            <h3 id={`group-${groupIndex}`} className="font-bold text-slate-900"><span className="mr-2 text-teal-600">{groupIndex + 1}</span>{group.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{group.description}</p>
          </div>
          <div className="space-y-7">
            {group.fields.map((field) => <fieldset key={field.id} disabled={!resident || saving}>
              <legend className="mb-3 text-sm font-bold text-slate-900">{field.title}<span className="mt-1 block font-normal leading-6 text-slate-500">{field.question}</span></legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {field.options.map((option) => {
                  const selected = answers[field.id] === option;
                  return <button type="button" key={option} aria-pressed={selected} onClick={() => choose(field.id, option)} className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "border-teal-600 bg-teal-50 text-teal-800 ring-1 ring-teal-600" : "border-slate-200 bg-white text-slate-600 enabled:hover:border-teal-400 enabled:hover:bg-teal-50"}`}>
                    {selected && <span aria-hidden="true" className="mr-1">✓</span>}{option}
                  </button>;
                })}
              </div>
            </fieldset>)}
          </div>
        </section>)}
      </div>

      <section aria-live="polite" aria-atomic="true" className="mt-8 rounded-2xl bg-slate-50 p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">기록 초안</h3><span className="text-xs text-teal-700">{selectedCount} / {observationFieldCount} 항목 선택</span></div>
        {!resident ? <p className="mt-3 text-sm text-slate-500">먼저 어르신을 선택해주세요.</p> : <>
          <p className="mt-3 text-sm font-semibold text-slate-700">{resident.name} 어르신</p>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {observationGroups.map((group) => <div key={group.title}><h4 className="text-xs font-bold text-slate-500">{group.title}</h4><dl className="mt-2 grid gap-1.5 text-sm">{group.fields.map((field) => <div key={field.id} className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">{field.title}</dt><dd className={answers[field.id] ? "text-slate-800" : "text-slate-400"}>{answers[field.id] ?? "선택 전"}</dd></div>)}</dl></div>)}
          </div>
        </>}
      </section>
      <label className="mt-5 flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={confirmed} disabled={!complete || saving} onChange={(event) => setConfirmed(event.target.checked)} className="h-5 w-5 accent-teal-600" />어르신과 {observationFieldCount}개 관찰 내용을 확인했습니다.</label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={!selectedCount || saving} onClick={() => { setAnswers({}); invalidate(); }} className="button-outline disabled:cursor-not-allowed disabled:opacity-40">선택 초기화</button><button type="button" disabled={!resident || !complete || !confirmed || saving} onClick={save} className="button-primary disabled:cursor-not-allowed disabled:opacity-40">{saving ? "저장 중…" : "기록 저장"}</button></div>
      {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">{message}</p>}
    </section>

    <section className="panel p-5 sm:p-6">
      <SectionTitle title="저장한 기록" subtitle={teamId ? "선택한 팀이 공유하는 최근 관찰 기록 30건입니다." : "이 브라우저의 작성자 계정으로 저장한 최근 30건입니다."} />
      {loading ? <p className="mt-4 text-sm text-slate-500">기록을 불러오는 중…</p> : loadError ? <div className="mt-4 text-sm"><p>기록을 불러오지 못했습니다. Supabase 연결 설정을 확인해주세요.</p><button className="button-outline mt-3" onClick={reload}>다시 불러오기</button></div> : records.length === 0 ? <p className="mt-4 text-sm text-slate-500">아직 저장한 기록이 없습니다.</p> : null}
      <div className="mt-4 space-y-3">{records.map((record) => <article key={record.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{residents.find((item) => item.id === record.resident_id)?.name ?? "어르신"} 어르신 · {record.meal_period ?? "기존 기록"}</strong><time className="text-xs text-slate-500" dateTime={record.created_at}>{new Date(record.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></div>
        <div className="mt-4 grid gap-5 md:grid-cols-2">{observationGroups.map((group) => <div key={group.title}><h4 className="text-xs font-bold text-slate-500">{group.title}</h4><dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{group.fields.map((field) => <div key={field.id}><dt className="text-xs text-slate-500">{field.title}</dt><dd>{record[field.id] ?? "기존 기록에 없음"}</dd></div>)}</dl></div>)}</div>
      </article>)}</div>
    </section>
  </>;
}
