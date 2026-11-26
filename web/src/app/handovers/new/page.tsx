import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { HandoverCreateForm } from "@/features/handover/HandoverCreateForm";

export default function NewHandoverPage() {
  return (
    <div className="space-y-7">
      <Link href="/handovers" className="text-link">← 인계 목록</Link>
      <PageHeader eyebrow="인수인계" title="인계 보내기" description="다음 근무자가 확인할 사실과 항목, 담당자와 기한을 정해 보냅니다." />
      <HandoverCreateForm />
    </div>
  );
}
