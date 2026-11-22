import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import TeamWorkspace from "@/features/auth/TeamWorkspace";

export default function TeamPage() {
  return <div className="space-y-7">
    <PageHeader eyebrow="팀 기록" title="팀 작업공간" description="로그인한 소속 팀의 어르신과 저장된 관찰 기록을 확인합니다." />
    <Link href="/recordings" className="text-link">개인 데모 기록 화면으로 이동</Link>
    <Suspense fallback={<p role="status">팀 작업공간을 준비하고 있습니다.</p>}><TeamWorkspace /></Suspense>
  </div>;
}
