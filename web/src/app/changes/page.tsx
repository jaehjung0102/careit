import { PageHeader } from "@/components/ui";
import { ChangeList } from "@/features/changes/ChangeList";
import { getSampleChanges } from "@/features/changes/changeData";

export default function ChangesPage() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="변화 확인" title="돌봄 변화" description="이전 기록과 비교한 변화 및 판단 근거를 함께 살펴봅니다." />
      <ChangeList items={getSampleChanges()} />
    </div>
  );
}
