import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import ObservationForm from "@/features/recording/ObservationForm";

export default function RecordingsPage() {
  return <div className="space-y-7">
    <PageHeader eyebrow="돌봄 기록" title="관찰 기록" description="어르신을 선택하고 식사·수분·배변·보행 상태를 버튼으로 기록하세요." />
    <Suspense fallback={<div className="panel p-6">기록 화면을 준비하고 있어요.</div>}><ObservationForm /></Suspense>
  </div>;
}
