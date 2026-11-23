"use client";

import { useState, type ReactNode } from "react";
import type { Handover } from "@/app/api/handovers/_lib/contract";
import { SectionTitle } from "@/components/ui";
import { availableActions, type HandoverPatchAction } from "./handoverActions";
import { categoryLabel, formatKst, staffName } from "./handoverData";
import { MOCK_STAFF } from "./handoverMock";
import { submitHandoverPatch, type HandoverFailure } from "./handoverStore";

type Body = Record<string, unknown> & { action: HandoverPatchAction };
type Payload = Body & { request_id: string; expected_version: number };
type Form = "none" | "complete" | "reassign" | "cancel";

const DONE_MESSAGE: Record<HandoverPatchAction, string> = {
  acknowledge: "수신 확인을 기록했어요. 조치를 시작하면 '조치 시작'을 눌러 주세요.",
  start: "조치를 시작했어요. 확인 항목을 모두 마치면 결과를 남기고 완료해 주세요.",
  complete: "조치 완료를 기록했어요.",
  reassign: "담당자를 변경했어요. 새 담당자의 수신 확인을 기다립니다.",
  cancel: "인계를 취소했어요.",
};

const REASON_MAX = 500;
const NOTE_MAX = 2000;

export function HandoverActionPanel({ handover: h, actorId }: { handover: Handover; actorId: string }) {
  const [busy, setBusy] = useState<HandoverPatchAction | null>(null);
  const [error, setError] = useState<(HandoverFailure & { retry?: Payload }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Form>("none");
  const [checked, setChecked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [reason, setReason] = useState("");

  const actions = availableActions(h, actorId);
  const isAssignee = h.assignee_id === actorId;
  const isSender = h.sender_id === actorId;
  const closed = h.status === "completed" || h.status === "cancelled";

  // 새 동작은 새 request_id와 지금 보고 있는 version으로 보낸다.
  function send(body: Body) {
    return submit({ ...body, request_id: crypto.randomUUID(), expected_version: h.version });
  }

  // 일시 장애·응답 유실 후 재시도는 최초 요청을 그대로(같은 request_id·version) 다시 보낸다.
  // 서버는 같은 요청이면 동작을 반복하지 않고 최초 결과를 돌려준다.
  async function submit(payload: Payload) {
    setBusy(payload.action);
    setError(null);
    setNotice(null);
    const result = await submitHandoverPatch(h.id, payload);
    setBusy(null);
    if (result.ok) {
      setForm("none");
      setChecked([]);
      setNote("");
      setReason("");
      setNewAssignee("");
      setNotice(DONE_MESSAGE[payload.action]);
      return;
    }
    setError({ ...result.error, retry: result.error.retryable ? payload : undefined });
  }

  const openForm = (next: Form) => {
    setForm(next);
    setError(null);
    setNotice(null);
    setReason("");
  };

  return (
    <section className="panel" aria-labelledby="handover-actions-title">
      <div className="panel-heading">
        <div id="handover-actions-title">
          <SectionTitle title="진행하기" subtitle="수신 확인 → 조치 시작 → 조치 완료 순서로 한 단계씩 기록해요. (예시 데이터)" />
        </div>
      </div>

      <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
        <Steps handover={h} />

        <Guide handover={h} isAssignee={isAssignee} isSender={isSender} />

        {notice && <p role="status" className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800">{notice}</p>}
        {error && (
          <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p>{error.message}</p>
            {error.fields && Object.values(error.fields).map((m) => <p key={m} className="mt-1 text-xs">{m}</p>)}
            {(error.code === "VERSION_CONFLICT" || error.code === "INVALID_TRANSITION") && (
              <p className="mt-1 text-xs">화면을 최신 내용으로 바꿨어요. 상태를 확인한 뒤 다시 진행해 주세요.</p>
            )}
            {error.retry && (
              <button type="button" onClick={() => submit(error.retry!)} disabled={busy !== null}
                className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                같은 요청 다시 보내기
              </button>
            )}
          </div>
        )}

        {!closed && (
          <div className="flex flex-wrap gap-2">
            {actions.includes("acknowledge") && (
              <ActionButton busy={busy === "acknowledge"} disabled={busy !== null} onClick={() => send({ action: "acknowledge" })}>
                내용을 읽었어요 · 수신 확인
              </ActionButton>
            )}
            {actions.includes("start") && (
              <ActionButton busy={busy === "start"} disabled={busy !== null} onClick={() => send({ action: "start" })}>
                조치 시작
              </ActionButton>
            )}
            {actions.includes("complete") && form !== "complete" && (
              <ActionButton disabled={busy !== null} onClick={() => openForm("complete")}>조치 완료 기록하기</ActionButton>
            )}
            {actions.includes("reassign") && form !== "reassign" && (
              <ActionButton variant="secondary" disabled={busy !== null} onClick={() => openForm("reassign")}>담당자 변경</ActionButton>
            )}
            {actions.includes("cancel") && form !== "cancel" && (
              <ActionButton variant="danger" disabled={busy !== null} onClick={() => openForm("cancel")}>인계 취소</ActionButton>
            )}
          </div>
        )}

        {form === "complete" && actions.includes("complete") && (
          <form
            className="space-y-4 rounded-xl border border-slate-200 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send({ action: "complete", checked_item_ids: checked, completion_note: note, follow_up_observation_ids: [] });
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">확인 항목 ({checked.length}/{h.follow_up_items.length})</legend>
              <p className="mt-1 text-xs text-slate-500">모든 항목을 확인해야 완료할 수 있어요.</p>
              <ul className="mt-3 space-y-2">
                {h.follow_up_items.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                        checked={checked.includes(item.id)}
                        onChange={(e) => setChecked((prev) => e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id))}
                      />
                      <span className="min-w-0">
                        <span className="text-xs font-semibold text-teal-700">{categoryLabel[item.category]}</span>
                        <span className="mt-0.5 block text-slate-700">{item.label}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <TextArea label="조치 결과" value={note} onChange={setNote} max={NOTE_MAX}
              placeholder="무엇을 확인했고 어떻게 조치했는지 적어 주세요." />
            <FormButtons
              busy={busy === "complete"}
              disabled={busy !== null || checked.length !== h.follow_up_items.length || !note.trim() || [...note].length > NOTE_MAX}
              submitLabel="조치 완료"
              onCancel={() => openForm("none")}
            />
          </form>
        )}

        {form === "reassign" && actions.includes("reassign") && (
          <form
            className="space-y-4 rounded-xl border border-slate-200 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send({ action: "reassign", assignee_id: newAssignee, reason });
            }}
          >
            <label className="block text-sm">
              <span className="font-semibold text-slate-900">새 담당자</span>
              <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} required
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <option value="">선택해 주세요</option>
                {Object.entries(MOCK_STAFF).filter(([id]) => id !== h.assignee_id).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <TextArea label="변경 사유" value={reason} onChange={setReason} max={REASON_MAX}
              placeholder="예: 근무 변경으로 간호 담당자에게 넘깁니다." />
            <p className="text-xs text-slate-500">기한은 그대로이고, 새 담당자가 처음부터 다시 수신 확인해요. 이전 기록은 이력에 남아요.</p>
            <FormButtons busy={busy === "reassign"} disabled={busy !== null || !newAssignee || !reason.trim() || [...reason].length > REASON_MAX}
              submitLabel="담당자 변경" onCancel={() => openForm("none")} />
          </form>
        )}

        {form === "cancel" && actions.includes("cancel") && (
          <form
            className="space-y-4 rounded-xl border border-rose-200 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send({ action: "cancel", reason });
            }}
          >
            <TextArea label="취소 사유" value={reason} onChange={setReason} max={REASON_MAX}
              placeholder="예: 같은 내용의 인계가 이미 있어 중복으로 취소합니다." />
            <p className="text-xs text-slate-500">취소한 인계는 다시 진행할 수 없어요. 미완료·기한 초과 집계에서도 빠져요.</p>
            <FormButtons busy={busy === "cancel"} disabled={busy !== null || !reason.trim() || [...reason].length > REASON_MAX}
              submitLabel="인계 취소" danger onCancel={() => openForm("none")} />
          </form>
        )}
      </div>
    </section>
  );
}

function Steps({ handover: h }: { handover: Handover }) {
  const steps = [
    { label: "수신 확인", at: h.acknowledged_at },
    { label: "조치 시작", at: h.started_at },
    { label: "조치 완료", at: h.completed_at },
  ];
  const cancelled = h.status === "cancelled";
  const currentIndex = steps.findIndex((s) => !s.at);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="진행 단계">
      {steps.map((s, i) => {
        const done = Boolean(s.at);
        const isCurrent = !cancelled && i === currentIndex;
        return (
          <li
            key={s.label}
            aria-current={isCurrent ? "step" : undefined}
            className={`rounded-xl border px-2 py-2.5 text-center ${
              done ? "border-teal-700 bg-teal-700 text-white"
                : isCurrent ? "border-teal-300 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <span className="block text-[11px] font-semibold">{i + 1}단계</span>
            <span className="block text-sm font-bold">{s.label}</span>
            <span className="mt-0.5 block text-[11px]">{done ? formatKst(s.at) : isCurrent ? "지금 할 차례" : cancelled ? "취소됨" : "대기"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Guide({ handover: h, isAssignee, isSender }: { handover: Handover; isAssignee: boolean; isSender: boolean }) {
  let text: string;
  if (h.status === "completed") text = `${staffName(h.completed_by)}님이 조치를 완료한 인계예요.`;
  else if (h.status === "cancelled") text = "취소된 인계예요. 더 진행할 수 없어요.";
  else if (isAssignee && h.status === "sent") text = "아직 수신 확인 전이에요. 화면을 여는 것만으로는 확인되지 않으니, 내용을 읽은 뒤 수신 확인을 눌러 주세요.";
  else if (isAssignee && h.status === "acknowledged") text = "수신을 확인했어요. 실제로 조치를 시작할 때 '조치 시작'을 눌러 주세요.";
  else if (isAssignee) text = "조치 중이에요. 확인 항목을 모두 마치고 결과를 남기면 완료돼요.";
  else if (isSender) text = `${staffName(h.assignee_id)}님의 진행을 기다리고 있어요. 보낸 사람은 담당자 변경이나 취소를 할 수 있어요.`;
  else text = `수신 확인과 조치는 담당자(${staffName(h.assignee_id)})만 할 수 있어요.`;
  return <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{text}</p>;
}

function ActionButton({ children, onClick, disabled, busy = false, variant = "primary" }: {
  children: ReactNode; onClick: () => void; disabled: boolean; busy?: boolean; variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-teal-700 text-white hover:bg-teal-800",
    secondary: "border border-slate-200 bg-white text-slate-700 hover:border-teal-300",
    danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-busy={busy}
      className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}>
      {busy ? "저장 중…" : children}
    </button>
  );
}

function TextArea({ label, value, onChange, max, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; max: number; placeholder: string;
}) {
  const length = [...value].length;
  return (
    <label className="block text-sm">
      <span className="font-semibold text-slate-900">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} required
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6" />
      <span className={`block text-right text-xs ${length > max ? "text-rose-700" : "text-slate-400"}`}>{length}/{max}</span>
    </label>
  );
}

function FormButtons({ busy, disabled, submitLabel, onCancel, danger = false }: {
  busy: boolean; disabled: boolean; submitLabel: string; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500">닫기</button>
      <button type="submit" disabled={disabled} aria-busy={busy}
        className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
          danger ? "bg-rose-700 hover:bg-rose-800" : "bg-teal-700 hover:bg-teal-800"}`}>
        {busy ? "저장 중…" : submitLabel}
      </button>
    </div>
  );
}
