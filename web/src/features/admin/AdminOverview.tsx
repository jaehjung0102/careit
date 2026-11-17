import { SectionTitle } from "@/components/ui";
import type { AdminStat } from "./adminData";

export function AdminStats({ stats }: { stats: AdminStat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <div className="stat-card" key={s.label}>
          <span>{s.label}</span>
          <strong>
            {s.value}
            <small>{s.unit}</small>
          </strong>
          <p>예시 데이터</p>
        </div>
      ))}
    </div>
  );
}

export function AdminPending() {
  return (
    <section className="panel p-5 sm:p-6">
      <SectionTitle title="운영 기능 준비 중" subtitle="권한 관리와 어르신 등록은 백엔드 연동 후 사용할 수 있습니다." />
      <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        현재 수치는 예시 데이터로 계산한 값입니다. 운영 집계 API가 연결되면 실제 현황으로 바뀝니다.
      </p>
    </section>
  );
}
