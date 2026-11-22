import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { HandoverDetail } from "@/features/handover/HandoverDetail";
import { getSampleHandoverDetail, getSampleHandoverIds } from "@/features/handover/handoverData";

export function generateStaticParams() {
  return getSampleHandoverIds().map((id) => ({ id }));
}

export default async function HandoverDetailPage(props: PageProps<"/handovers/[id]">) {
  const { id } = await props.params;
  const detail = getSampleHandoverDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-7">
      <Link href="/handovers" className="text-link">← 인계 목록</Link>
      <PageHeader eyebrow="인수인계" title="인계 상세" description="받은 내용과 확인 항목, 진행 이력을 확인합니다." />
      <HandoverDetail {...detail} />
    </div>
  );
}
