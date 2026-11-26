import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { HandoverDetailView } from "@/features/handover/HandoverDetailView";
import { getSampleHandoverIds } from "@/features/handover/handoverData";

// 예시 인계는 미리 만들고, 화면에서 새로 보낸 인계(mock 저장소)는 요청 시 렌더링한다.
export function generateStaticParams() {
  return getSampleHandoverIds().map((id) => ({ id }));
}

export default async function HandoverDetailPage(props: PageProps<"/handovers/[id]">) {
  const { id } = await props.params;
  return (
    <div className="space-y-7">
      <Link href="/handovers" className="text-link">← 인계 목록</Link>
      <PageHeader eyebrow="인수인계" title="인계 상세" description="받은 내용과 확인 항목, 진행 이력을 확인하고 단계별로 진행합니다." />
      <HandoverDetailView id={id} />
    </div>
  );
}
