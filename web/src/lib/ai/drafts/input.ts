// B2-local DTOs from docs/api.md sections 4–5. Not the current DB input type.
export const FIELD_OPTIONS = {
  meal_period: ["아침", "점심", "저녁"],
  meal: ["전량", "3/4", "절반", "1/4", "드시지 않음", "미확인"],
  water: ["충분", "보통", "적음", "거부", "미확인"],
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
} as const;

export type ObservationField = keyof typeof FIELD_OPTIONS;
export type ObservationFields = {
  [K in ObservationField]: (typeof FIELD_OPTIONS)[K][number] | null;
};
export type WaterMeasurement = {
  basis: "event"; ml: number | null; observed_at: string;
} | {
  basis: "daily_total" | "cumulative_cutoff"; ml: number | null;
  period_start_at: string; period_end_at: string; coverage_complete: boolean;
};
const WALKING_OBSERVATIONS = ["평소와 같음", "휘청거림", "휘청거림 없음"] as const;
export type DraftInput = {
  input_revision: number;
  observation: {
    schema_version: 3; resident_id: string; observed_at: string;
    fields: ObservationFields; water_measurement: WaterMeasurement | null;
    walking_observation: (typeof WALKING_OBSERVATIONS)[number] | null;
    source_text: string;
  };
};

export class DraftInputError extends Error {
  readonly status: 400 | 422;
  constructor(
    readonly code: "INVALID_REQUEST" | "VALIDATION_ERROR",
    readonly fields: Record<string, string>,
  ) {
    super("관찰 입력을 확인해 주세요.");
    this.status = code === "INVALID_REQUEST" ? 400 : 422;
  }
}

function invalid(path: string, message: string): never {
  throw new DraftInputError("VALIDATION_ERROR", { [path]: message });
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "객체를 보내 주세요.");
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) {
    throw new DraftInputError("INVALID_REQUEST", { [path]: "허용되지 않은 필드가 있습니다." });
  }
  for (const key of keys) {
    if (!Object.hasOwn(result, key)) invalid(`${path}.${key}`, "필수 키가 누락되었습니다.");
  }
  return result;
}

function choice<T extends string>(value: unknown, path: string, options: readonly T[]): T | null {
  if (value === null) return null;
  if (typeof value !== "string" || !options.includes(value as T)) {
    invalid(path, "현재 선택값 또는 명시적 null을 보내 주세요.");
  }
  return value as T;
}

// Validate calendar components too: Date.parse alone normalizes e.g. February 30.
function timestamp(value: unknown, path: string, now: number): string {
  if (typeof value !== "string") invalid(path, "시간대가 있는 ISO 날짜를 보내 주세요.");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) invalid(path, "시간대가 있는 ISO 날짜를 보내 주세요.");
  const [, y, m, d, h, min, sec, , oh, om] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const time = Date.parse(value);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59
    || Number(oh ?? 0) > 23 || Number(om ?? 0) > 59 || !Number.isFinite(time) || time > now) {
    invalid(path, "미래가 아닌 유효한 날짜와 시간을 보내 주세요.");
  }
  return value;
}

const HOUR = 60 * 60 * 1000;
function waterMeasurement(value: unknown, now: number): WaterMeasurement | null {
  const path = "observation.water_measurement";
  if (value === null) return null;
  if (value === undefined || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "정량 정보 객체 또는 null을 보내 주세요.");
  }
  const basis = (value as Record<string, unknown>).basis;
  if (basis !== "event" && basis !== "daily_total" && basis !== "cumulative_cutoff") {
    invalid(`${path}.basis`, "측정 방식을 확인해 주세요.");
  }
  const input = object(value, path, basis === "event"
    ? ["basis", "ml", "observed_at"]
    : ["basis", "ml", "period_start_at", "period_end_at", "coverage_complete"]);
  const ml = input.ml;
  if (ml !== null && (typeof ml !== "number" || !Number.isSafeInteger(ml) || ml < 0)) {
    invalid(`${path}.ml`, "0 이상의 정수 mL 또는 null을 보내 주세요.");
  }
  if (basis === "event") {
    return { basis, ml, observed_at: timestamp(input.observed_at, `${path}.observed_at`, now) };
  }
  const start = timestamp(input.period_start_at, `${path}.period_start_at`, now);
  const end = timestamp(input.period_end_at, `${path}.period_end_at`, now);
  const localStart = new Date(Date.parse(start) + 9 * HOUR);
  const duration = Date.parse(end) - Date.parse(start);
  if (localStart.getUTCHours() !== 0 || localStart.getUTCMinutes() !== 0
    || localStart.getUTCSeconds() !== 0 || localStart.getUTCMilliseconds() !== 0
    || duration !== (basis === "daily_total" ? 24 : 18) * HOUR) {
    invalid(path, "KST 0시부터 일합계는 다음 날 0시, 시연 누적량은 같은 날 18시까지입니다.");
  }
  if (typeof input.coverage_complete !== "boolean") {
    invalid(`${path}.coverage_complete`, "집계 완료 여부를 보내 주세요.");
  }
  return { basis, ml, period_start_at: start, period_end_at: end, coverage_complete: input.coverage_complete };
}

// Shape/temporal validation only. Not authentication or a source-text conflict detector.
export function parseDraftInput(value: unknown, now: Date): DraftInput {
  const clock = now.getTime();
  if (!Number.isFinite(clock)) throw new Error("A valid server clock is required.");
  const input = object(value, "body", ["input_revision", "observation"]);
  if (typeof input.input_revision !== "number" || !Number.isSafeInteger(input.input_revision)
    || input.input_revision < 1) invalid("input_revision", "1 이상의 정수 revision을 보내 주세요.");
  const o = object(input.observation, "observation", ["schema_version", "resident_id", "observed_at",
    "fields", "water_measurement", "walking_observation", "source_text"]);
  if (o.schema_version !== 3) invalid("observation.schema_version", "입력 버전 3을 보내 주세요.");
  const resident = o.resident_id;
  if (typeof resident !== "string" || !/^(resident-[123]|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(resident)) {
    invalid("observation.resident_id", "어르신 ID를 확인해 주세요.");
  }
  const rawFields = object(o.fields, "observation.fields", Object.keys(FIELD_OPTIONS));
  const fields = Object.fromEntries(Object.entries(FIELD_OPTIONS).map(([key, options]) =>
    [key, choice(rawFields[key], `observation.fields.${key}`, options as readonly string[])])) as ObservationFields;
  if (typeof o.source_text !== "string" || [...o.source_text].length > 2000) {
    invalid("observation.source_text", "추가 관찰 원문은 2,000자 이내의 문자열입니다.");
  }
  return { input_revision: input.input_revision, observation: {
    schema_version: 3, resident_id: resident, observed_at: timestamp(o.observed_at, "observation.observed_at", clock),
    fields, water_measurement: waterMeasurement(o.water_measurement, clock),
    walking_observation: choice(o.walking_observation, "observation.walking_observation", WALKING_OBSERVATIONS),
    source_text: o.source_text,
  } };
}
