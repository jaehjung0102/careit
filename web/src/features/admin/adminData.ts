import { residents } from "@/lib/mock/dashboard";

// 실제 운영 집계 API(#29) 연결 전까지는 mock 데이터에서 계산한다.
// 인계 건수는 페이지에서 받아 admin 기능이 handover 기능에 직접 의존하지 않게 한다.
const SAMPLE_ACTIVE_STAFF = 4;

export interface AdminStat {
  label: string;
  value: number;
  unit: string;
}

export function getSampleAdminStats({ openHandovers }: { openHandovers: number }): AdminStat[] {
  return [
    { label: "등록 어르신", value: residents.length, unit: "명" },
    { label: "활성 담당자", value: SAMPLE_ACTIVE_STAFF, unit: "명" },
    { label: "확인할 인계", value: openHandovers, unit: "건" },
  ];
}
