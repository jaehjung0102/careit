import { handovers as sampleHandovers } from "@/lib/mock/dashboard";

// 실제 인계 API(#26) 연결 전까지는 공통 mock 데이터를 사용한다.
// 대시보드와 같은 데이터를 써야 두 화면의 숫자가 어긋나지 않는다.
export const handoverStatusOrder = ["수신 대기", "조치 중", "완료"] as const;
export type HandoverStatus = (typeof handoverStatusOrder)[number];
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

export function isHandoverStatus(value: string): value is HandoverStatus {
  return (handoverStatusOrder as readonly string[]).includes(value);
}

export function getSampleHandovers(): HandoverItem[] {
  return sampleHandovers.map((x) => {
    if (!isHandoverStatus(x.status)) {
      throw new Error(`알 수 없는 인계 상태: "${x.status}" (id: ${x.id})`);
    }
    return { ...x, status: x.status };
  });
}

// 대시보드의 "확인할 인계"와 같은 기준: 완료되지 않은 인계.
export function countOpenHandovers(items: HandoverItem[]) {
  return items.filter((x) => x.status !== "완료").length;
}

export function countByStatus(items: HandoverItem[]) {
  return handoverStatusOrder.map((status) => ({
    status,
    count: items.filter((x) => x.status === status).length,
  }));
}
