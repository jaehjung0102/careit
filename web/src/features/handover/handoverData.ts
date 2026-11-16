import { handovers as sampleHandovers } from "@/lib/mock/dashboard";

// 실제 인계 API(#26) 연결 전까지는 공통 mock 데이터를 사용한다.
// 대시보드와 같은 데이터를 써야 두 화면의 숫자가 어긋나지 않는다.
export type HandoverStatus = "수신 대기" | "조치 중" | "완료";
export type HandoverTone = "teal" | "amber" | "slate";

export interface HandoverItem {
  id: string;
  title: string;
  resident: string;
  assignee: string;
  due: string;
  status: HandoverStatus;
  tone: HandoverTone;
}

export const handoverStatusOrder: HandoverStatus[] = ["수신 대기", "조치 중", "완료"];

export function getSampleHandovers(): HandoverItem[] {
  return sampleHandovers.map((x) => ({ ...x, status: x.status as HandoverStatus }));
}

export function countByStatus(items: HandoverItem[]) {
  return handoverStatusOrder.map((status) => ({
    status,
    count: items.filter((x) => x.status === status).length,
  }));
}
