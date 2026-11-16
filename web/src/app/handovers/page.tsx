import { PageHeader } from "@/components/ui";
import { HandoverList, HandoverSummary } from "@/features/handover/HandoverList";
import { getSampleHandovers } from "@/features/handover/handoverData";

export default function HandoversPage() {
  const items = getSampleHandovers();
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="인수인계" title="담당자 인계" description="전달한 내용을 수신하고 조치할 때까지 상태를 확인합니다." />
      <HandoverSummary items={items} />
      <HandoverList items={items} />
    </div>
  );
}
