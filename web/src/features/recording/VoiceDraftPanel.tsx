"use client";

import { useEffect, useRef, useState } from "react";

type ReviewState = {
  required: boolean;
  approved: boolean;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type VoiceDraftPanelProps = {
  disabled: boolean;
  inputVersion: number;
  residentName?: string;
  selectedSummary: string;
  onReviewChange: (state: ReviewState) => void;
};

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function speechErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") return "마이크 권한이 거부되었습니다. 브라우저 권한을 허용하거나 직접 입력해주세요.";
  if (error === "no-speech") return "음성이 감지되지 않았습니다. 다시 녹음하거나 직접 입력해주세요.";
  if (error === "audio-capture") return "사용할 수 있는 마이크를 찾지 못했습니다.";
  if (error === "network") return "음성 변환 연결에 실패했습니다. 입력 내용은 유지됩니다.";
  return "음성 변환을 완료하지 못했습니다. 다시 시도하거나 직접 입력해주세요.";
}

function makeExampleDraft(residentName: string | undefined, selectedSummary: string, transcript: string) {
  const subject = residentName ? `${residentName} 어르신` : "선택한 어르신";
  const buttonSentence = selectedSummary ? `버튼 관찰 결과는 ${selectedSummary}입니다.` : "버튼 관찰 결과는 아직 선택되지 않았습니다.";
  const voiceSentence = transcript.trim() ? `추가 음성 메모는 “${transcript.trim()}”입니다.` : "추가 음성 메모는 없습니다.";
  return `${subject}의 관찰 기록 초안입니다. ${buttonSentence} ${voiceSentence}`;
}

export default function VoiceDraftPanel({
  disabled,
  inputVersion,
  residentName,
  selectedSummary,
  onReviewChange,
}: VoiceDraftPanelProps) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBeforeRecording = useRef("");

  const stale = Boolean(draft) && draftVersion !== inputVersion;
  const approvalIsCurrent = approved && !stale;

  useEffect(() => {
    const supportCheck = window.setTimeout(() => setSupported(Boolean(getSpeechRecognitionConstructor())), 0);
    return () => {
      window.clearTimeout(supportCheck);
      recognitionRef.current?.abort();
    };
  }, []);

  function markForReview() {
    setApproved(false);
    onReviewChange({ required: true, approved: false });
  }

  function replaceTranscript(value: string) {
    setTranscript(value);
    setDraft("");
    setDraftVersion(null);
    setError("");
    if (value.trim()) markForReview();
    else onReviewChange({ required: false, approved: false });
  }

  function startRecording(replace = false) {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      setError("이 브라우저는 음성 변환을 지원하지 않습니다. 아래 칸에 직접 입력해주세요.");
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    transcriptBeforeRecording.current = replace ? "" : transcript.trim();
    if (replace) {
      setTranscript("");
      setDraft("");
      setDraftVersion(null);
      setApproved(false);
    }

    recognition.onresult = (event) => {
      const spoken = Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const nextTranscript = [transcriptBeforeRecording.current, spoken].filter(Boolean).join(" ");
      setTranscript(nextTranscript);
      setDraft("");
      setDraftVersion(null);
      markForReview();
    };
    recognition.onerror = (event) => {
      setError(speechErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
      setError("");
      markForReview();
    } catch {
      setListening(false);
      setError("녹음을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function createDraft() {
    setDraft(makeExampleDraft(residentName, selectedSummary, transcript));
    setDraftVersion(inputVersion);
    setApproved(false);
    setError("");
    onReviewChange({ required: true, approved: false });
  }

  function approveDraft() {
    if (!draft.trim() || stale) return;
    setApproved(true);
    onReviewChange({ required: true, approved: true });
  }

  function resetVoiceDraft() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    setTranscript("");
    setDraft("");
    setDraftVersion(null);
    setApproved(false);
    setError("");
    onReviewChange({ required: false, approved: false });
  }

  return <section className="mt-8 rounded-2xl border border-teal-100 bg-teal-50/50 p-5" aria-labelledby="voice-draft-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="voice-draft-title" className="text-sm font-bold text-slate-900">음성 입력·AI 초안 검토</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">음성 결과를 직접 고친 뒤 예시 초안을 만들고 확인해주세요. 버튼 입력만 사용할 수도 있습니다.</p>
      </div>
      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-teal-700">AI API 연결 전 · MOCK</span>
    </div>

    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" onClick={listening ? stopRecording : () => startRecording()} disabled={disabled} className={listening ? "button-primary" : "button-outline"}>
        {listening ? "■ 녹음 중지" : transcript ? "● 이어서 녹음" : "● 음성 녹음 시작"}
      </button>
      {transcript && !listening && <button type="button" onClick={() => startRecording(true)} disabled={disabled} className="button-outline">다시 녹음</button>}
      {(transcript || draft) && <button type="button" onClick={resetVoiceDraft} disabled={disabled} className="button-outline">음성·초안 초기화</button>}
    </div>
    {supported === false && <p className="mt-3 text-xs leading-5 text-amber-800">현재 브라우저에서는 음성 변환을 지원하지 않습니다. 직접 입력은 계속 사용할 수 있습니다.</p>}

    <label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="voice-transcript">음성 변환 결과
      <textarea
        id="voice-transcript"
        value={transcript}
        disabled={disabled || listening}
        onChange={(event) => replaceTranscript(event.target.value)}
        placeholder="음성 결과가 여기에 표시됩니다. 지원하지 않는 브라우저에서는 직접 입력해주세요."
        className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal leading-6 text-slate-800 disabled:opacity-60"
      />
    </label>
    <p className="mt-2 text-xs text-slate-500">숫자·단위·부정 표현을 반드시 원래 관찰과 대조해주세요. 음성 오류가 있어도 버튼 선택과 작성 중인 문장은 유지됩니다.</p>

    <button type="button" onClick={createDraft} disabled={disabled || (!transcript.trim() && !selectedSummary)} className="button-outline mt-4 disabled:cursor-not-allowed disabled:opacity-40">
      AI 초안 예시 만들기
    </button>

    {draft && <div className="mt-5 rounded-xl bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-bold text-slate-800" htmlFor="voice-draft">검토할 문장 초안</label>
        {stale ? <span className="text-xs font-bold text-amber-700">버튼 입력 변경됨 · 다시 생성 필요</span> : approvalIsCurrent ? <span className="text-xs font-bold text-teal-700">✓ 확인 완료</span> : <span className="text-xs font-bold text-amber-700">확인 전</span>}
      </div>
      <textarea
        id="voice-draft"
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          setApproved(false);
          onReviewChange({ required: true, approved: false });
        }}
        className="mt-2 min-h-32 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6 text-slate-800 disabled:opacity-60"
      />
      <button type="button" onClick={approveDraft} disabled={disabled || stale || !draft.trim() || approvalIsCurrent} className="button-primary mt-3 disabled:cursor-not-allowed disabled:opacity-40">
        {approvalIsCurrent ? "초안 확인 완료" : "수정한 초안 확인"}
      </button>
    </div>}

    {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">{error}</p>}
    <p className="mt-4 text-xs leading-5 text-slate-500">현재 단계에서는 음성 원문과 예시 초안을 Supabase에 저장하지 않습니다. 실제 AI 변환·저장은 B2 API와 DB 계약 연결 후 추가합니다.</p>
  </section>;
}
