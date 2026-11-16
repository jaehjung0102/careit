import { residents } from "@/lib/mock/dashboard";
import { getSampleHandovers } from "@/features/handover/handoverData";

// 실제 운영 집계 API(#29) 연결 전까지는 mock 데이터에서 계산한다.
const SAMPLE_ACTIVE_STAFF = 4;

export interface AdminStat {
  label: string;
  value: number;
  unit: string;
}

export function getSampleAdminStats(): AdminStat[] {
  const pendingHandovers = getSampleHandovers().filter((x) => x.status === "수신 대기").length;
  return [
    { label: "등록 어르신", value: residents.length, unit: "명" },
    { label: "활성 담당자", value: SAMPLE_ACTIVE_STAFF, unit: "명" },
    { label: "미확인 인계", value: pendingHandovers, unit: "건" },
  ];
}
