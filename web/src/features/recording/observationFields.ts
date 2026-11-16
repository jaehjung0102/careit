export const observationFieldIds = [
  "meal_period", "meal", "water", "bowel", "urination", "walking", "pain", "skin", "sleep",
  "mood", "cognition", "communication", "hygiene", "oral_care", "medication", "activity", "emotional_support",
] as const;

export type ObservationFieldId = (typeof observationFieldIds)[number];

type ObservationField = {
  id: ObservationFieldId;
  title: string;
  question: string;
  options: readonly string[];
};

type ObservationGroup = {
  title: string;
  description: string;
  fields: readonly ObservationField[];
};

export const observationGroups: readonly ObservationGroup[] = [
  {
    title: "식사·영양",
    description: "식사 시간대와 섭취 상태를 기록합니다.",
    fields: [
      { id: "meal_period", title: "식사 시간", question: "어느 식사를 기록하나요?", options: ["아침", "점심", "저녁"] },
      { id: "meal", title: "식사량", question: "식사를 얼마나 드셨나요?", options: ["전량", "3/4", "절반", "1/4", "드시지 않음", "미확인"] },
      { id: "water", title: "수분 섭취", question: "수분 섭취 상태는 어땠나요?", options: ["충분", "보통", "적음", "거부", "미확인"] },
    ],
  },
  {
    title: "신체 상태",
    description: "배설, 이동, 통증, 피부와 수면 변화를 기록합니다.",
    fields: [
      { id: "bowel", title: "배변", question: "관찰한 배변 상태를 선택해주세요.", options: ["보통 변", "묽은 변", "단단한 변", "배변 없음", "미확인"] },
      { id: "urination", title: "배뇨", question: "관찰한 배뇨 상태를 선택해주세요.", options: ["정상", "잦음", "배뇨 어려움", "요실금", "미확인"] },
      { id: "walking", title: "이동", question: "이동할 때 어떤 도움이 필요했나요?", options: ["스스로 이동", "보조기 사용", "부축 필요", "휠체어·이동 불가", "미확인"] },
      { id: "pain", title: "통증", question: "통증을 표현하거나 보인 정도는 어땠나요?", options: ["없음", "가벼움", "중간", "심함", "미확인"] },
      { id: "skin", title: "피부", question: "피부 상태에 변화가 있었나요?", options: ["이상 없음", "붉어짐", "상처", "부종", "미확인"] },
      { id: "sleep", title: "수면", question: "수면 상태는 어땠나요?", options: ["숙면", "중간에 깸", "수면 부족", "낮잠 많음", "미확인"] },
    ],
  },
  {
    title: "인지·정서 상태",
    description: "기분, 인지 변화와 의사소통 상태를 기록합니다.",
    fields: [
      { id: "mood", title: "기분", question: "주로 관찰된 기분 상태를 선택해주세요.", options: ["안정", "즐거움", "불안", "우울·무기력", "화남·초조", "미확인"] },
      { id: "cognition", title: "인지", question: "평소와 다른 인지 변화가 있었나요?", options: ["평소와 같음", "혼돈", "반복 질문", "시간·장소 혼동", "미확인"] },
      { id: "communication", title: "의사소통", question: "의사소통 상태는 어땠나요?", options: ["원활", "반복 설명 필요", "의사표현 어려움", "거의 반응 없음", "미확인"] },
    ],
  },
  {
    title: "돌봄·생활 지원",
    description: "위생, 복약, 활동과 정서 지원 내용을 기록합니다.",
    fields: [
      { id: "hygiene", title: "개인위생", question: "세면·옷 갈아입기 등에 어느 정도 도움이 필요했나요?", options: ["스스로 함", "지켜보기", "일부 도움", "전적 도움", "미실시"] },
      { id: "oral_care", title: "구강관리", question: "양치·틀니 관리에 어느 정도 도움이 필요했나요?", options: ["스스로 함", "지켜보기", "일부 도움", "전적 도움", "미실시"] },
      { id: "medication", title: "복약", question: "정해진 약 복용 상태를 선택해주세요.", options: ["복용 완료", "일부 복용", "복용 거부", "해당 없음", "미확인"] },
      { id: "activity", title: "활동 참여", question: "산책·운동·인지 활동 참여는 어땠나요?", options: ["적극 참여", "보통", "소극적", "참여 거부", "미실시"] },
      { id: "emotional_support", title: "정서 지원", question: "제공한 정서 지원을 선택해주세요.", options: ["대화·말벗", "격려·안심", "가족 연락 지원", "함께 활동", "미실시"] },
    ],
  },
] as const;

export const observationFields: readonly ObservationField[] = observationGroups.flatMap((group) => group.fields);
export const observationFieldCount = observationFieldIds.length;
