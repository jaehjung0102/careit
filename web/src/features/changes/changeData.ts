import { changes as sampleChanges } from "@/lib/mock/dashboard";

// 실제 변화 계산(#28) 연결 전까지는 공통 mock 데이터를 사용한다.
export type ChangeTone = "teal" | "amber" | "slate";

export interface ChangeItem {
  id: string;
  resident: string;
  category: string;
  summary: string;
  evidence: string;
  time: string;
  tone: ChangeTone;
}

export function getSampleChanges(): ChangeItem[] {
  return sampleChanges.map((x) => ({ ...x }));
}
