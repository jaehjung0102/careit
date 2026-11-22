import type { ObservationField, ObservationFields } from "./input";

export const FIELD_LABELS: Record<ObservationField, string> = {
  meal_period: "식사 시간대", meal: "식사량", water: "수분 상태", bowel: "배변", urination: "배뇨",
  walking: "이동 도움", pain: "통증", skin: "피부", sleep: "수면", mood: "기분", cognition: "인지",
  communication: "의사소통", hygiene: "개인위생", oral_care: "구강관리", medication: "복약",
  activity: "활동 참여", emotional_support: "정서 지원",
};

export const MEAL_PERCENT: Partial<Record<NonNullable<ObservationFields["meal"]>, number>> = {
  "전량": 100, "3/4": 75, "절반": 50, "1/4": 25, "드시지 않음": 0,
};
