import type { Category } from "../../app/api/handovers/_lib/contract";
import { kstDate, parseInstant, shiftDate, utcTimestamp } from "./calendar";
import { compareMeal, type MealObservation, type MealComparison } from "./meal-comparison";
import { compareWater, waterBaselineWindow, type WaterObservation, type WaterComparison } from "./water-comparison";

export type ComparisonObservation = MealObservation & WaterObservation & Readonly<{
  fields: Readonly<Partial<Record<Category | "meal_period", string | null>>>;
  walking_observation?: string | null;
}>;
export type HistoryWindow = { start_date: string; end_date: string };
type ContextCategory = Exclude<Category, "meal" | "water"> | "walking_observation";
export type ContextItem = {
  category: ContextCategory;
  current_value: string | null;
  status: "recorded" | "unknown" | "unsupported_legacy";
  history: { observation_id: string; value: string; observed_at: string | null }[];
};
export type ChangesData = {
  resident_id: string; current_observation_id: string; timezone: "Asia/Seoul";
  access_scope: "author_only" | "facility"; evaluated_at: string; minimum_valid_records: 3;
  results: [MealComparison, WaterComparison]; context: ContextItem[];
};

// Values are preserved, not scored. This list mirrors docs/api.md §4, including
// the distinct not-performed/not-applicable/unknown categories.
const CONTEXT_OPTIONS: Record<ContextCategory, readonly string[]> = {
  bowel: ["보통 변", "묽은 변", "단단한 변", "배변 없음", "미확인"],
  urination: ["정상", "잦음", "배뇨 어려움", "요실금", "미확인"],
  walking: ["스스로 이동", "보조기 사용", "부축 필요", "휠체어·이동 불가", "미확인"],
  pain: ["없음", "가벼움", "중간", "심함", "미확인"],
  skin: ["이상 없음", "붉어짐", "상처", "부종", "미확인"],
  sleep: ["숙면", "중간에 깸", "수면 부족", "낮잠 많음", "미확인"],
  mood: ["안정", "즐거움", "불안", "우울·무기력", "화남·초조", "미확인"],
  cognition: ["평소와 같음", "혼돈", "반복 질문", "시간·장소 혼동", "미확인"],
  communication: ["원활", "반복 설명 필요", "의사표현 어려움", "거의 반응 없음", "미확인"],
  hygiene: ["스스로 함", "지켜보기", "일부 도움", "전적 도움", "미실시"],
  oral_care: ["스스로 함", "지켜보기", "일부 도움", "전적 도움", "미실시"],
  medication: ["복용 완료", "일부 복용", "복용 거부", "해당 없음", "미확인"],
  activity: ["적극 참여", "보통", "소극적", "참여 거부", "미실시"],
  emotional_support: ["대화·말벗", "격려·안심", "가족 연락 지원", "함께 활동", "미실시"],
  walking_observation: ["평소와 같음", "휘청거림", "휘청거림 없음"],
};

export function observationWindow(record: MealObservation): HistoryWindow | null {
  const date = kstDate(record.observed_at);
  return date ? { start_date: shiftDate(date, -7), end_date: shiftDate(date, -1) } : null;
}

// Meal/context and water can have different anchor dates. Query the entire union
// of these windows; never reuse the 30-row recording-list query.
export function historyWindows(record: ComparisonObservation): HistoryWindow[] {
  const windows = [observationWindow(record), waterBaselineWindow(record)].filter((x): x is HistoryWindow => x !== null);
  return windows.filter((w, i) => windows.findIndex((v) => v.start_date === w.start_date && v.end_date === w.end_date) === i);
}

function contextValue(row: ComparisonObservation, category: ContextCategory) {
  return category === "walking_observation" ? row.walking_observation : row.fields[category];
}

export function compareContext(current: ComparisonObservation, history: readonly ComparisonObservation[]): ContextItem[] {
  const window = observationWindow(current);
  return (Object.keys(CONTEXT_OPTIONS) as ContextCategory[]).flatMap((category) => {
    const value = contextValue(current, category);
    if (value === undefined) return [];
    const items = window ? history.filter((row) => {
      const date = kstDate(row.observed_at);
      return row.resident_id === current.resident_id && row.id !== current.id && date !== null
        && date >= window.start_date && date <= window.end_date && typeof contextValue(row, category) === "string";
    }).map((row) => ({ observation_id: row.id, value: contextValue(row, category) as string, observed_at: row.observed_at! })) : [];
    items.sort((a, b) => {
      const left = parseInstant(a.observed_at)!, right = parseInstant(b.observed_at)!;
      return left < right ? -1 : left > right ? 1 : a.observation_id < b.observation_id ? -1 : a.observation_id > b.observation_id ? 1 : 0;
    });
    return [{ category, current_value: value,
      status: value === null || value === "미확인" ? "unknown" : CONTEXT_OPTIONS[category].includes(value) ? "recorded" : "unsupported_legacy",
      history: items }];
  });
}

export function calculateChanges(current: ComparisonObservation, history: readonly ComparisonObservation[], now: Date, scope: ChangesData["access_scope"]): ChangesData {
  const data: ChangesData = {
    resident_id: current.resident_id, current_observation_id: current.id, timezone: "Asia/Seoul",
    access_scope: scope, evaluated_at: now.toISOString(), minimum_valid_records: 3,
    results: [compareMeal(current, history), compareWater(current, history, now)],
    context: compareContext(current, history),
  };
  // Wire timestamps use UTC Z; source snapshots remain unchanged.
  for (const result of data.results) for (const row of result.evidence) row.measured_at = utcTimestamp(row.measured_at);
  for (const item of data.context) for (const row of item.history) if (row.observed_at) row.observed_at = utcTimestamp(row.observed_at);
  return data;
}
