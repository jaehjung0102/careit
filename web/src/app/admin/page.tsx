import { PageHeader } from "@/components/ui";
import { AdminPending, AdminStats } from "@/features/admin/AdminOverview";
import { getSampleAdminStats } from "@/features/admin/adminData";

export default function AdminPage() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="운영 관리" title="워크스페이스 관리" description="어르신과 담당자, 기록 운영 현황을 한눈에 확인합니다." />
      <AdminStats stats={getSampleAdminStats()} />
      <AdminPending />
    </div>
  );
}
