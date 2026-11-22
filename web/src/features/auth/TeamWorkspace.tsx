"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import ObservationForm from "@/features/recording/ObservationForm";
import { createClient } from "@/lib/supabase/client";
import { loadTeamDirectory, type Resident, type TeamMembership } from "@/lib/db/residents";

type Directory = { userId: string; memberships: TeamMembership[]; residents: Resident[]; error?: boolean };
type Identity = Pick<User, "id" | "email" | "is_anonymous">;

export default function TeamWorkspace() {
  const [user, setUser] = useState<Identity | null>();
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [teamId, setTeamId] = useState("");
  const [retry, setRetry] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        const identity = session?.user;
        setUser(identity ? { id: identity.id, email: identity.email, is_anonymous: identity.is_anonymous } : null);
        setDirectory(null);
      });
      return () => data.subscription.unsubscribe();
    } catch {
      // Defer the config error like the asynchronous Auth initial-session event.
      const timeout = window.setTimeout(() => {
        setUser(null);
        setError("Supabase 연결 설정을 확인해주세요.");
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (!user || user.is_anonymous) return;
    let active = true;
    loadTeamDirectory().then((data) => {
      if (!active) return;
      setDirectory({ userId: user.id, ...data });
      setTeamId(data.memberships[0]?.team_id ?? "");
    }).catch(() => {
      if (active) setDirectory({ userId: user.id, memberships: [], residents: [], error: true });
    });
    return () => { active = false; };
  }, [user, retry]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword("");
    } catch {
      setError("로그인하지 못했습니다. 계정 정보와 연결 상태를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      setDirectory(null);
      setUser(null);
    } catch {
      setError("로그아웃하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) return <p role="status">로그인 상태를 확인하고 있습니다.</p>;

  if (!user || user.is_anonymous) return <section className="panel mx-auto max-w-lg p-5 sm:p-6">
    <h2 className="text-lg font-bold">팀 데모 로그인</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">관리자가 등록한 개인별 시연 계정으로 로그인해주세요. 가입이나 팀 권한 부여는 이 화면에서 할 수 없습니다.</p>
    {user?.is_anonymous && <p className="mt-3 text-sm text-amber-900">계정을 전환하면 현재 익명 세션의 개인 기록은 이 팀 화면에서 보이지 않습니다. 기존 기록을 팀으로 옮기거나 삭제하지 않습니다.</p>}
    <form onSubmit={signIn} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">이메일
        <input type="email" required autoComplete="username" value={email} disabled={busy}
          onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3" />
      </label>
      <label className="block text-sm font-semibold">비밀번호
        <input type="password" required autoComplete="current-password" value={password} disabled={busy}
          onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3" />
      </label>
      <button type="submit" disabled={busy} className="button-primary disabled:opacity-40">{busy ? "로그인 중…" : "로그인"}</button>
    </form>
    {error && <p role="alert" className="mt-4 text-sm text-amber-900">{error}</p>}
  </section>;

  const membership = directory?.memberships.find((item) => item.team_id === teamId);
  const residents = directory?.residents.filter((item) => item.team_id === teamId) ?? [];
  return <div className="space-y-6">
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="break-all text-sm text-slate-700">{user.email}</p>
        <button type="button" disabled={busy} onClick={signOut} className="button-outline">로그아웃</button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-amber-900">{error}</p>}
      {!directory || directory.userId !== user.id ? <p role="status" className="mt-4">팀 정보를 불러오는 중…</p>
        : directory.error ? <div className="mt-4"><p role="alert">팀 정보를 불러오지 못했습니다. 연결과 migration 적용 여부를 확인해주세요.</p>
          <button type="button" className="button-outline mt-3" onClick={() => { setDirectory(null); setRetry((value) => value + 1); }}>다시 불러오기</button></div>
        : directory.memberships.length === 0 ? <p className="mt-4 text-sm">등록된 팀 소속이 없습니다. 관리자에게 소속 등록을 요청해주세요.</p>
        : <div className="mt-4">
          <label className="block text-sm font-semibold">소속 팀
            <select value={teamId} disabled={busy} onChange={(event) => setTeamId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 p-3">
              {directory.memberships.map((item) => <option key={item.team_id} value={item.team_id}>{item.teams.name}</option>)}
            </select>
          </label>
          <p className="mt-2 text-sm text-slate-600">{membership?.role === "admin" ? "관리자" : "돌봄 담당자"} · 같은 팀의 관찰 기록을 공유합니다. 수정·삭제 권한은 아직 제공하지 않습니다.</p>
          {residents.length === 0 && <p className="mt-4 text-sm">등록된 어르신이 없습니다. 관리자에게 등록을 요청해주세요.</p>}
        </div>}
    </section>
    {directory?.userId === user.id && membership && residents.length > 0 && <div inert={busy}>
      <ObservationForm key={`${user.id}:${teamId}`} residents={residents} teamId={teamId} />
    </div>}
  </div>;
}
