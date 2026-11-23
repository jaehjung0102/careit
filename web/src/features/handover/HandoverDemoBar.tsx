"use client";

import { MOCK_STAFF } from "./handoverMock";
import { resetHandoverDemo, setDemoActor, setFailNext, useHandoverStore } from "./handoverStore";

// 로그인(B1 #18) 연결 전, 수신자·송신자 화면을 바꿔 보기 위한 시연 도구.
export function HandoverDemoBar() {
  const { actorId, failNext } = useHandoverStore();
  return (
    <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm" aria-label="시연 도구">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">시연용 · 예시 데이터</span>
        <label className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-slate-600">지금 사용하는 사람</span>
          <select
            value={actorId}
            onChange={(e) => setDemoActor(e.target.value)}
            className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
          >
            {Object.entries(MOCK_STAFF).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} className="h-4 w-4 accent-amber-600" />
          다음 요청을 저장 실패로 만들기
        </label>
        <button type="button" onClick={resetHandoverDemo} className="font-semibold text-slate-500 underline underline-offset-2">
          예시 데이터 처음으로
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        로그인 연결 전이라 사용자를 직접 고릅니다. 변경 내용은 이 브라우저 탭에만 남고 서버에는 저장되지 않아요.
      </p>
    </section>
  );
}
