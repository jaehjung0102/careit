import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import ObservationForm from "@/features/recording/ObservationForm";

export default function RecordingsPage() {
  return <div className="space-y-7">
    <PageHeader eyebrow="돌봄 기록" title="관찰 기록" description="어르신을 선택하고 식사 시간대와 신체·인지·정서·생활지원 상태를 버튼으로 기록하세요." />
    <p className="text-sm text-slate-600">이 화면은 개인 데모 기록입니다. <Link href="/team" className="text-link">팀 로그인·실제 어르신 조회로 이동</Link></p>
    <Suspense fallback={<div className="panel p-6">기록 화면을 준비하고 있어요.</div>}><ObservationForm /></Suspense>
  </div>;
}
