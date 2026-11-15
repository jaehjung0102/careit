export const residents = [
  { id: "resident-1", name: "김영희", room: "201호", status: "기록 완료", tone: "teal" as const },
  { id: "resident-2", name: "박철수", room: "203호", status: "확인 필요", tone: "amber" as const },
  { id: "resident-3", name: "이순자", room: "205호", status: "기록 완료", tone: "teal" as const },
];
export const handovers = [
  { id: "1", title: "식사량 변화 확인 요청", resident: "박철수", assignee: "오후 담당자", due: "오늘 17:00", status: "수신 대기", tone: "amber" as const },
  { id: "2", title: "보행 시 불편감 관찰", resident: "김영희", assignee: "간호 담당자", due: "내일 10:00", status: "조치 중", tone: "teal" as const },
  { id: "3", title: "수분 섭취 확인", resident: "이순자", assignee: "오전 담당자", due: "어제 18:00", status: "완료", tone: "slate" as const },
];
export const changes = [
  { id: "1", resident: "박철수", category: "식사", summary: "평소보다 식사량이 적게 기록되었어요.", evidence: "최근 식사 기록 3건 비교", time: "오늘 10:30", tone: "amber" as const },
  { id: "2", resident: "김영희", category: "보행", summary: "보행 중 불편감을 호소한 기록이 있어요.", evidence: "오늘 오전 관찰 기록", time: "오늘 09:20", tone: "teal" as const },
];
