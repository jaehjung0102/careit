# 돌봄잇 API 계약 초안 — draft-3

상태: **팀 확인 전 초안** · 계약 갱신 2026-11-17 / 배포 점검 보충 2026-11-18 · B2 하이칼 · [B2-01 / #25](https://github.com/jaehjung0102/careit/issues/25) · 지정 리뷰어 F2 문수혁 · 리뷰 승인 마감 11/18

**11/18 배포 점검:** PR #39/#40/#41은 병합되었다. 아래 기존 계약의 11/17 코드·미병합 설명은 당시 조사 기록이며 최신 배포 상태는 12절을 따른다. 병합 사실만으로 C1–C8의 명시적 합의나 실제 DB/API 통합 완료를 주장하지 않는다.

기획 근거: 11/16 15:46에 팀에 재공유된 최종기획안 14쪽(표지 작성일 11/13), 특히 p.7–11 기능과 p.13 검증 설계. **아래는 리뷰용 계약 제안이며 팀 승인·API 구현 완료를 뜻하지 않는다.** 승인 기록은 10절에 남긴다. 이 PR은 `docs/api.md`만 변경한다.

코드 기준: `main@2338493bbc41258bcbc135355424a5c8a6f179e1` (PR #38 포함), 11/17 재확인. F2 PR #39(`6f42323c…`)는 아직 미병합이며 9절의 화면 연결 검토에만 참고했다. DB migration의 실제 적용 여부는 코드 조회로 확인할 수 없다.

**이번 개정:** 현재 17개 항목을 빠짐없이 보존하고, 식사 분수의 정확한 수치 매핑, 단일 수분 섭취/누적량 구분, 보행 도움/휘청거림 구분을 추가했다. F1·B1이 승인하기 전 새 필드를 기존 저장 helper에 그대로 넘기지 않는다.

## 1. 변경 근거와 현재 코드

| 최신 기획안의 요구사항 | draft-3 반영 | 남은 구현 합의 |
|---|---|---|
| p.7–8: 실제 관찰 시각, 식사 0/25/50/75/100%와 미확인 구분 | 기존 17개 필드 + 관찰 시각·정량 확장 DTO 제안 | F1 입력 UI, B1 저장 구조·migration |
| p.9: 입력 수정 → 재생성 → 확인 → 저장, 작성자·수정 이력 | 입력 revision과 재확인, 승인 문장·입력 snapshot 보존 | B1/F1 저장 및 수정 이력 연결 |
| p.10: 같은 끼니 직전 7일 평균, 오늘 제외, 유효 3건 미만 자료 부족 | 수치 평균·근거·기간·유효 개수 응답 | 중복/수정 기록 처리, 데이터 접근 범위 |
| p.10: 완료된 하루 또는 같은 시각 누적 수분량 비교 | mL·집계 시작/종료·완료 여부·집계 방식 | 첫 구현에서 사용할 수분 집계 방식 선택 |
| p.11: 완료 결과·완료자·완료 시각, 취소·담당 변경 사유/이력 | 명시적 완료자와 취소/재할당 action, 변경 이력 | 허용 역할·재수신·DB 원자적 저장 |
| p.11: 오늘 저장 건수 | 저장 시각 기준 집계로 명시 | 운영 집계는 #29에서 연결 |
| 최신 p.13: 4~6명이 일반 텍스트 입력과 돌봄잇을 모두 사용 | 순서·사례 교차 배정, 연습, 검토·수정·음성/AI 대기를 포함한 시간과 정확도/사용성 | 실제 참여 인원 명시, 모의 과업 검증 범위 유지 |
| 최신 p.3·12·14: 기록 작성 성능·사용성으로 검증 범위 명확화 | 케어포 재입력·실제 인계 효과·구매 의사 검증은 제외 | 가격은 가정이며 실제 도입/총업무시간 검증과 구분 |

2026-11-17 `main` 조회에서는 PR #38의 새 migration·UI·저장 helper를 확인했다. 입력은 17개 항목이며 식사 시간대, 식사량, 수분, 배변, 배뇨, 이동, 통증, 피부, 수면, 기분, 인지, 의사소통, 개인위생, 구강관리, 복약, 활동 참여, 정서 지원이다. 식사량에 1/4·절반·3/4가 추가됐고 식사 시간대가 저장된다. 그러나 수분은 여전히 충분/보통/적음/거부/미확인 범주이며 mL·집계 구간·실제 관찰 시각은 없다. **정량 비교 요구사항과 현재 필드의 차이를 F1/B1과 조정해야 한다.** 새 UI는 저장 전 17개 항목 선택을 모두 요구한다. 한 사건의 짧은 기록에도 전체 항목이 필요한지는 별도 사용 흐름 결정이며 이번 조사로 자동 변경하지 않는다.

현재 흐름은 `ObservationForm` → `saveObservation()` → Supabase insert다. 익명 로그인 후 작성자별 SELECT/INSERT RLS를 적용하며 조회 helper는 본인 최신 30건을 반환한다. 실제 비교 집계에 이 30건 제한을 그대로 사용하지 않는다. LLM 초안 저장·인계 저장·시설 공유 권한은 아직 구현된 것으로 간주하지 않는다. 운영 화면은 mock이다.

PR #38 이전 범주값(과거 기록 호환 참고):
- 식사: `전량`, `절반 이상`, `절반 미만`, `드시지 않음`, `미확인`.
- 수분: `평소보다 많음`, `평소와 비슷함`, `평소보다 적음`, `미확인`.
- 배변: `보통 변`, `묽은 변`, `단단한 변`, `배변 없음`, `미확인`.
- 보행: `혼자 걸음`, `보조기 사용`, `부축 필요`, `걷지 않음`, `미확인`.

**모호한 기존 범주값을 정확한 %/mL로 추정 변환하지 않는다.** `전량`·`드시지 않음`과 새 정확한 분수값만 4절대로 변환한다. 수치가 정확해도 실제 관찰 시각·끼니가 없으면 비교에는 쓸 수 없다. 기존 원문은 보존하고 정량 비교에서는 `unsupported_legacy` 또는 제외 사유로 표시한다. 기존 보행 도움 정도도 새 보행 관찰 항목으로 임의 변환하지 않는다. `domain.ts`의 `Recording`/`UserRole` placeholder를 실제 DB·시설 권한의 확정 근거로 사용하지 않는다.

## 2. 담당 경계와 구현 순서

- B2: `docs/api.md`, `web/src/lib/{ai,analytics}/`, `web/src/app/api/{drafts,changes,handovers}/`.
- B1 이은규: DB migration, `lib/db/`, 인증·시설/어르신 권한·관찰 저장과 조회. 기존 저장 경로의 확장은 B1과 합의한다.
- F1 정재헌: 입력·재생성·확인·저장 UI. F2 문수혁: 변화·인계·운영 UI.
- 공통 types/mock와 타 담당자 경로는 Issue에서 합의 후 변경한다. 본문 TypeScript는 DTO 제안이며 코드 파일 변경을 뜻하지 않는다.
- #25 계약 → #26 인계 기반·음성 검증 → #27 AI/음성 → #28 비교 계산 → #29 운영 집계 → #30 통합 확인. 해당 Issue의 최신 범위가 우선한다.
- 음성 제공업체/업로드 계약은 #26 검증 후 별도로 확정한다. 여기서는 사용자가 확인한 음성 변환 텍스트를 다룬다.
- 지정 리뷰어는 **F2 문수혁(`anstngur123`)**. B1의 DB 협의는 별도로 필요하며 F2 리뷰를 대신하지 않는다. B2는 F2 PR을 리뷰한다.

## 3. 공통 계약 제안

### 인증·형식

신규 B2 API는 `Authorization: Bearer <Supabase access token>`을 받는 방식을 제안한다. 서버가 토큰과 실제 자원 권한을 검증한다. 요청의 사용자 ID·이름·역할만 믿고 권한을 부여하지 않는다. 현재 브라우저에 SSR cookie 처리가 있다고 가정하지 않으며 B1과 전달 방식을 확정한다.

현재 RLS에서는 본인 기록만 접근 가능하다. 공유 인계는 B1의 시설·담당자 정책이 준비된 뒤 연결하며 서비스 키로 이를 우회하지 않는다. 보이지 않는 자원은 404, 볼 수 있지만 해당 action 권한이 없으면 403. 저장/권한 기능이 준비되지 않으면 503이며 mock를 실데이터로 대신 반환하지 않는다.

- 키는 `snake_case`. ID는 UUID이며 현재 resident ID만 `resident-1/2/3` 문자열이다.
- 입력 시각은 시간대가 있는 ISO 8601, 응답은 UTC `Z`, 날짜/끼니/집계일 경계는 `Asia/Seoul`.
- 숫자 `0`은 관찰된 0, `null`은 미확인이다. 필수 키 누락은 422. 범주값의 빈 문자열은 null로 바꾸지 않고 422. `source_text`만 빈 문자열을 허용한다.
- `created_at`은 서버 저장 시각이다. 사용자가 입력한 `observed_at`과 혼동하지 않는다.
- 표시 이름/방 번호는 디렉터리·UI에서 결합한다. 접근 권한은 ID 기준이다.

성공 envelope:
```json
{
  "data": {},
  "meta": { "contract_version": "b2-01-draft-3", "data_source": "database" }
}
```
`data_source = database | generated | mock`. mock는 개발 fixture/어댑터에서만 사용하며 접근 검사를 대체하지 않는다.

오류 예시:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "식사량을 확인해 주세요.",
    "fields": { "observation.fields.meal": "현재 식사량 선택값 또는 명시적 null을 보내 주세요." },
    "retryable": false
  },
  "meta": { "contract_version": "b2-01-draft-3" }
}
```

| HTTP | code | 처리 |
|---|---|---|
| 400 | `INVALID_REQUEST` | JSON/쿼리 형식 또는 알 수 없는 필드 오류 |
| 401 | `UNAUTHENTICATED` | 토큰 없음·만료·검증 실패, 세션 갱신 |
| 403 | `FORBIDDEN` | 보이는 자원에서 허용되지 않은 action |
| 404 | `NOT_FOUND` | 없음 또는 사용자에게 보이지 않음 |
| 409 | `IDEMPOTENCY_CONFLICT`, `VERSION_CONFLICT`, `INVALID_TRANSITION` | 요청 ID 내용 충돌·동시 변경·잘못된 상태 순서 |
| 422 | `VALIDATION_ERROR` | enum·필수값·단위·시각·완료 조건 오류 |
| 429 | `RATE_LIMITED` | `Retry-After` 초 제공 |
| 503 | `DEPENDENCY_NOT_READY`, `SERVICE_UNAVAILABLE` | 저장/권한 의존성 미준비 또는 일시 장애 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 오류 |

조회·초안 생성·변경 성공은 200, 최초 인계 생성은 DB commit 후 201. 네트워크 실패 시 입력을 유지하고 저장 성공으로 표시하지 않는다. 서버 로그·토큰·원문 stack은 응답에 노출하지 않는다.

## 4. 관찰 입력과 저장 DTO — C1 확인 필요

### 현재 17개 필드 보존

`fields`의 키는 PR #38과 동일하다. 값은 현재 UI 선택값을 그대로 쓴다. `null`은 확인된 사실이 없다는 **명시적 입력**이며 정상/미실시/0을 뜻하지 않는다. 이 nullable 계약은 부분 관찰·음성 사례를 위한 제안이다. 현재 화면의 17개 필수 선택 규칙을 이 문서만으로 바꾸지 않는다.

```ts
type ObservationFields = {
  meal_period: "아침" | "점심" | "저녁" | null;
  meal: "전량" | "3/4" | "절반" | "1/4" | "드시지 않음" | "미확인" | null;
  water: "충분" | "보통" | "적음" | "거부" | "미확인" | null;
  bowel: "보통 변" | "묽은 변" | "단단한 변" | "배변 없음" | "미확인" | null;
  urination: "정상" | "잦음" | "배뇨 어려움" | "요실금" | "미확인" | null;
  walking: "스스로 이동" | "보조기 사용" | "부축 필요" | "휠체어·이동 불가" | "미확인" | null;
  pain: "없음" | "가벼움" | "중간" | "심함" | "미확인" | null;
  skin: "이상 없음" | "붉어짐" | "상처" | "부종" | "미확인" | null;
  sleep: "숙면" | "중간에 깸" | "수면 부족" | "낮잠 많음" | "미확인" | null;
  mood: "안정" | "즐거움" | "불안" | "우울·무기력" | "화남·초조" | "미확인" | null;
  cognition: "평소와 같음" | "혼돈" | "반복 질문" | "시간·장소 혼동" | "미확인" | null;
  communication: "원활" | "반복 설명 필요" | "의사표현 어려움" | "거의 반응 없음" | "미확인" | null;
  hygiene: "스스로 함" | "지켜보기" | "일부 도움" | "전적 도움" | "미실시" | null;
  oral_care: "스스로 함" | "지켜보기" | "일부 도움" | "전적 도움" | "미실시" | null;
  medication: "복용 완료" | "일부 복용" | "복용 거부" | "해당 없음" | "미확인" | null;
  activity: "적극 참여" | "보통" | "소극적" | "참여 거부" | "미실시" | null;
  emotional_support: "대화·말벗" | "격려·안심" | "가족 연락 지원" | "함께 활동" | "미실시" | null;
};
type Category = Exclude<keyof ObservationFields, "meal_period">;
type MealSlot = "breakfast" | "lunch" | "dinner" | "unknown";
type WaterMeasurement = {
  basis: "event";
  ml: number | null;
  observed_at: string;
} | {
  basis: "daily_total" | "cumulative_cutoff";
  ml: number | null;
  period_start_at: string;
  period_end_at: string;
  coverage_complete: boolean;
};
type ObservationInputV3 = {
  schema_version: 3;
  resident_id: string;
  observed_at: string;
  fields: ObservationFields;
  water_measurement: WaterMeasurement | null;
  walking_observation: "평소와 같음" | "휘청거림" | "휘청거림 없음" | null;
  source_text: string;
};
type StoredObservationV3 = ObservationInputV3 & {
  id: string;
  author_id: string;
  created_at: string;
  confirmed_at: string;
  confirmed_by: string;
  approved_text: string;
  input_revision: number;
  version: number;
};
```

`schema_version: 3`는 이 API snapshot의 버전이며 기존 DB에 버전 열이 이미 있다는 뜻이 아니다. 아래를 구현/저장하려면 B1과 C1/C3를 확정한다.

| 현재 항목/값 | 계약에서의 처리 |
|---|---|
| 17개 선택 항목 전체 | `fields`에 동일 키·원문 값으로 보존. 네 핵심 항목만 뽑고 나머지를 버리지 않음 |
| 식사 `전량`, `3/4`, `절반`, `1/4`, `드시지 않음` | 각각 100, 75, 50, 25, 0으로 **서버가 파생**. 별도 percent 입력을 중복 저장하지 않음 |
| `meal_period` 아침/점심/저녁 | breakfast/lunch/dinner로 파생. null이면 unknown; 시각으로 끼니 추정 금지 |
| 과거 `절반 이상`/`절반 미만` | 정확한 %가 아니므로 원문 보존, 해당 식사 비교는 `unsupported_legacy` |
| 수분 범주(충분/보통/적음/거부 등) | 원문 보존. mL 및 0으로 바꾸지 않음. `water_measurement`를 별도 입력 |
| `walking` 도움 정도 | 원문 보존. `walking_observation`의 휘청거림 유무/평소 여부와 다른 사실 |
| 과거 `혼자 걸음`/`걷지 않음`, 과거 수분 표현 | 읽기에서 원문 보존. 새 선택값으로 자동 재작성하지 않음 |
| 기존 nullable 열의 null | 미기록/미확인으로 표시. 특히 `미실시`·`해당 없음`으로 채우지 않음 |

- `fields`는 17개 키 모두 필요하다. 새 입력의 enum은 위 타입대로 검사한다. 과거 행 읽기용 adapter는 과거 enum도 보존한다. 기존 행을 새 입력 타입으로 강제 cast하지 않는다.
- `observed_at`은 실제 관찰 시각이며 미래는 거절한다. `created_at`으로 대신하지 않는다. 서로 다른 시각의 관찰은 별도 기록한다. 수분 집계만 자체 구간을 쓴다.
- `water_measurement=null`이면 정량 정보가 없다. `ml`은 0 이상의 정수 또는 null. 음수·소수·문자열 단위는 422. 숫자 0과 미확인을 분리한다.
- `basis=event`의 observed_at도 시간대가 있는 유효 시각이어야 하며 미래는 422. `basis=event`는 특정 시각의 단일 섭취량이다. 예: 물 150mL를 마셨다는 관찰. 저장/문장에 보존하지만 하루 합계·18시 누적량으로 간주하거나 비교에 쓰지 않는다. 이번 계약에는 사건들의 자동 합산 기능을 추가하지 않는다.
- `daily_total`은 KST 00:00–다음 날 00:00, `cumulative_cutoff`는 KST 00:00–같은 날 합의한 cutoff다. `period_start_at < period_end_at <= 서버 현재 시각`. `coverage_complete=false`는 누락/미완료 구간으로 비교에서 제외한다.
- 첫 비교 구현 권장안은 고정 cutoff 누적량(시연 예: 18:00). C2에서 방식과 시각을 확정한다. 비교용 사건/일합계/누적량을 혼합하거나 누적값들을 더하지 않는다.
- 식사와 수분의 관찰·집계 시각은 문장에서도 구분한다. `water=적음`과 650mL의 관계를 서버가 의학적으로 판정하지 않는다. 범주와 숫자는 각각 기록된 사실이다.
- `walking_observation=휘청거림 없음`을 `평소와 같음`으로 바꾸지 않는다. `walking=스스로 이동`만으로 휘청거림 유무를 추정하지 않는다.
- `source_text`는 최대 2,000자, 추가 내용 없으면 빈 문자열. 음성 변환 후 사용자가 확인한 원문도 여기에 담는다.

### B1 저장 연결 요청 (새 API 구현 아님)

기존 `saveObservation()`은 **평평한 17개 문자열 필드**만 저장하며 `approved_text`·확인자·실제 관찰 시각 등을 저장하지 않는다. 현재 `/api/recordings`는 문서상 placeholder이고 구현 경로가 없다. 별도 `/api/observations`나 중복 테이블을 이 PR에서 신설하지 않는다.

B1에 요청할 확장: 기존 행과 연결되는 입력 snapshot(17개 값 포함), 실제 관찰 시각, 수분 측정 방식/단위/구간, 별도 보행 관찰, 원문, 승인 문장, input_revision·version, 서버가 설정한 작성/확인자·시각 및 수정 이력. 열/JSON 저장 방식과 원자적 저장은 B1이 결정한다. 기존 네 필수 범주 열의 NOT NULL과 신규 nullable snapshot의 매핑도 명시적으로 합의한다. **합의 전에는 null을 기존 `ObservationInput`에 그대로 전달하거나 미실시로 채우지 않는다.**

승인 문장과 입력은 같은 revision으로 저장하며 수정 후 재확인이 필요하다. 과거 행에 없는 관찰 시각·확인자·수치를 만들어 채우지 않는다. 승인 최신 버전만 비교한다. 현재 `saveObservation()`의 23505 재시도는 같은 ID의 행을 읽을 뿐 payload 동일성을 검증하지 않으므로, 이를 8절의 엄격한 인계 재시도 계약과 같다고 설명하지 않는다.

## 5. AI 초안 — POST /api/drafts

요청은 `{ input_revision, observation: ObservationInputV3 }`. `input_revision`은 1 이상의 정수다. DB에 저장하지 않는 생성 요청이다.

```json
{
  "input_revision": 1,
  "observation": {
    "schema_version": 3,
    "resident_id": "resident-1",
    "observed_at": "2026-11-16T03:15:00Z",
    "fields": {
      "meal_period": "점심",
      "meal": "절반",
      "water": "적음",
      "bowel": "미확인",
      "urination": null,
      "walking": "부축 필요",
      "pain": null,
      "skin": null,
      "sleep": null,
      "mood": null,
      "cognition": null,
      "communication": null,
      "hygiene": null,
      "oral_care": null,
      "medication": null,
      "activity": null,
      "emotional_support": null
    },
    "water_measurement": {
      "ml": 650,
      "basis": "cumulative_cutoff",
      "period_start_at": "2026-11-15T15:00:00Z",
      "period_end_at": "2026-11-16T09:00:00Z",
      "coverage_complete": true
    },
    "walking_observation": "휘청거림",
    "source_text": ""
  }
}
```

이 가상 예시는 11/16 18:00 KST 이후 작성한다. 관찰은 12:15, 수분은 00:00–18:00 누적량이다. null 항목은 관찰 사실을 제공하지 않은 것이며 정상·미실시가 아니다. 실제 시연에서는 날짜와 시각을 함께 조정한다.

```json
{
  "data": {
    "resident_id": "resident-1",
    "input_revision": 1,
    "draft_text": "12시 15분 관찰: 점심 식사량 50%, 이동 시 부축 필요, 휘청거림 관찰됨. 배변은 미확인. 수분 상태는 적음으로 기록됨. 당일 0시부터 18시까지 확인된 누적 수분 섭취량은 650mL임.",
    "generation_mode": "llm",
    "fallback_reason": null,
    "requires_confirmation": true
  },
  "meta": {
    "contract_version": "b2-01-draft-3",
    "data_source": "generated"
  }
}
```

규칙:
1. `fields`의 모든 제공된 항목과 정량 확장·원문을 처리한다. 핵심 네 항목만 다뤄 나머지 사실을 누락하지 않는다. null 항목은 미관찰로 취급하고 미실시/정상이라고 쓰지 않는다. `미확인`·`미실시`·`해당 없음`은 서로 다른 표현으로 보존한다. 입력 사실만 정리한다. 진단·원인·위험도·치료 지시·추가 수치 또는 입력에 없는 비교 표현을 만들지 않는다. 원문은 AI 지시가 아니다. 원문에만 있는 수치는 승인 문장에 보존할 수 있지만 구조화 정량 필드로 자동 확정하지 않는다. 비교에 쓰려면 사용자가 그 필드/구간을 확인해야 한다.
2. 숫자·단위·부정·미확인을 보존한다. 구조화 값과 원문 사이에 발견된 모순은 422로 정정을 요청하며 임의 선택하지 않는다. 자동 검출이 완벽하다고 가정하지 않고 확인 화면에 원본을 함께 표시한다.
3. **입력 수정 → revision 증가 → 기존 확인 해제 → 재생성 → 재확인**을 기본으로 한다. AI 문장의 직접 편집은 이번 기본 계약에 포함하지 않는다. 늦게 도착한 이전 revision의 응답은 버린다.
4. 공급자 제한시간은 **10초 제안**. timeout/공급자 오류/출력 검증 실패 시 선택값을 정해진 문장으로 조합하고 음성 변환 원문을 추가 관찰로 구분한다. `generation_mode=template`, `fallback_reason=timeout|provider_error|invalid_output`, 확인 필수인 200 응답이다.
5. 인증·권한·입력 오류는 fallback으로 숨기지 않는다. 서버 연결 실패 시 UI에 입력을 보존하고 재시도를 제공한다.
6. 작성자가 대상·관찰 시각·선택값·원문·초안을 확인한 뒤 B1 저장 경로로 저장한다. 저장 성공 응답 전에 완료로 표시하지 않는다. 승인 문장 저장 구조가 준비되기 전에는 미연결/mock 상태를 명시한다.

## 6. 변화 비교 — GET /api/changes

필수 쿼리: `resident_id`, `current_observation_id`.
예: `/api/changes?resident_id=resident-1&current_observation_id=00000000-0000-4000-8000-000000000001`.
서버가 권한 내 저장된 현재/과거 기록을 읽는다. 브라우저가 보낸 평균이나 과거 배열을 신뢰하지 않는다. 없거나 보이지 않는 기록은 404, 보이는 기록의 resident 불일치는 422.

### 식사

- 현재 식사값과 끼니는 `fields.meal`/`fields.meal_period`에서 4절 규칙으로 파생한다. 별도의 브라우저 percent를 신뢰하지 않는다.
- 관찰 날짜 D의 **D-7부터 D-1까지 KST 달력 날짜**에서 같은 끼니만 비교한다. `created_at`이 아닌 `observed_at` 기준이다. 오늘 D의 모든 기록은 평균에서 제외한다.
- 숫자 0은 포함한다. null·누락·정량 변환 불가 legacy·끼니 불명·관찰 시각 없음은 제외한다. 최소 유효 비교 단위 3개가 필요하다.
- **중복 처리 제안:** resident+관찰 날짜+끼니당 한 단위. 같은 논리 기록의 수정은 최신 승인 버전만 사용한다. 별개의 동일 값 중복은 한 단위로 합치고, 같은 단위에 서로 다른 값이 있으면 `conflicting_duplicate`로 제외한다. B1/F1과 기록 식별·정정 방식을 확정한다. 여러 기록을 독립 표본처럼 세지 않는다.
- 유효 값의 산술평균을 구한다. `delta=current-baseline_mean`, 단위는 퍼센트포인트(%p). 평균 90%, 현재 50%면 -40%p다. 계산은 원래 정밀도, 화면만 소수 1자리 반올림한다.
- 충분한 데이터에서 정확한 차이가 0이면 `unchanged`, 아니면 `changed`. 위험도·진단·임상적 유의성을 판정하지 않는다. threshold는 현재 요구사항이 아니다.

### 수분

- `water_measurement=null`은 `context_missing`, `basis=event`는 `not_aggregate`. 둘 다 평균/차이를 계산하지 않는다. 사건량 150mL를 일합계로 오인하지 않도록 수치·시각·미비 사유를 표시한다.
- 현재 수분 구간의 KST 시작 날짜를 D로 삼아 이전 D-7..D-1의 **동일 집계 방식과 동일 현지 시작/종료 시각**만 비교한다. 완성된 하루 총량과 일부 시간 누적량을 혼합하지 않는다.
- `daily_total`은 종료된 전체 하루이며 `coverage_complete=true`여야 한다. 누적량도 해당 cutoff까지 집계가 완료되어야 한다. 현재 미완료는 `incomplete_period`, 과거 미완료는 제외한다.
- 숫자 0은 포함, null은 제외. 하루의 동일 구간당 한 단위와 동일 중복 처리 규칙을 적용한다. 최소 3개, 산술평균과 mL 차이를 반환한다. 여러 누적량을 더하지 않는다.
- 같은 시간대가 없으면 다른 시간의 값으로 대체하지 않는다. 확정 방식/시각은 C2 확인 대상이다.

배변·보행 도움·별도 보행 관찰과 나머지 항목은 같은 항목의 원기록과 시각을 보여주는 맥락 정보다. 임의 점수·평균·위험도를 만들지 않으며 미확인을 정상으로 표현하지 않는다.

### 응답 타입

```ts
type ComparisonStatus = "changed" | "unchanged" | "current_unknown"
  | "incomplete_period" | "context_missing" | "insufficient_data"
  | "unsupported_legacy" | "not_aggregate";
type NumericComparison = {
  metric: "meal" | "water";
  status: ComparisonStatus;
  current_value: number | null;
  baseline_mean: number | null;
  delta: number | null;
  value_unit: "percent" | "mL";
  delta_unit: "percentage_points" | "mL";
  basis: { meal_slot: MealSlot } | {
    water_basis: "daily_total" | "cumulative_cutoff";
    start_local: string; end_local: string;
  } | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  valid_count: number;
  excluded_counts: Record<string, number>;
  evidence: { observation_id: string; unit_date: string; value: number; measured_at: string }[];
  excluded_evidence: { observation_ids: string[]; reason: string }[];
  summary: string;
};
type ChangesData = {
  resident_id: string;
  current_observation_id: string;
  timezone: "Asia/Seoul";
  access_scope: "author_only" | "facility";
  evaluated_at: string;
  minimum_valid_records: 3;
  results: NumericComparison[];
  context: {
    category: Exclude<Category, "meal" | "water"> | "walking_observation";
    current_value: string | null;
    status: "recorded" | "unknown" | "unsupported_legacy";
    history: { observation_id: string; value: string; observed_at: string | null }[];
  }[];
};
```

`data: ChangesData`, meta.data_source=database. results는 meal, water 순으로 두 항목을 반환한다.

- `context`에는 값이 제공된 항목과 명시적 미확인 항목을 반환하며, 같은 범주의 과거 기록은 D-7..D-1 안에서만 조회한다. legacy의 실제 관찰 시각이 없으면 null로 보존한다.
- `basis`/기간은 근거 정보가 없으면 null이다. `baseline_mean`은 유효 3건 이상일 때만 표시하며 `delta`는 현재 값도 비교 가능할 때 계산한다. 자료 부족도 HTTP 200이다.
- `valid_count`는 중복 제외 후 비교 단위 수다. evidence는 채택 단위마다 한 건이며 식사의 `measured_at`은 관찰 시각, 수분은 집계 종료 시각이다. 제외한 실재 기록과 이유는 `excluded_evidence`로 추적한다. 기록이 없는 날짜를 0으로 추가하지 않는다.
- `excluded_counts`는 이유별 제외 행 수다. 처리 순서는 `unsupported_legacy` → `not_aggregate` → `wrong_context` → `unknown_value` → `incomplete_period` → 중복 검사다. 동일 값 중복은 한 건을 채택하고 나머지는 `duplicate`, 값이 충돌한 단위는 해당 행 모두 `conflicting_duplicate`로 제외한다. 행마다 이유는 하나만 세며 수정 전 이력 버전은 현재 기록 집합에 포함하지 않는다.
- 상태 우선순위: legacy → 단일 사건(not_aggregate) → 문맥 부족 → 현재 값 미확인 → 현재 수분 기간 미완료 → 유효 3단위 미만 → changed/unchanged. 현재 값이 미확인이어도 비교 기간이 알려져 있고 과거 자료가 충분하면 평균은 표시할 수 있으며 delta는 null이다.
- 미확인/자료 부족을 정상 또는 변화 없음으로 표시하지 않는다. 시설 공유 권한이 미구현이면 `author_only`로 표시하며 시설 전체 평균이라고 하지 않는다.
- 7일 전체를 조회하며 목록용 최신 30건 제한으로 평균을 바꾸지 않는다. evidence는 권한 내 기록만 반환한다.

식사 fixture: 현재 11/16 점심 50%, 기준 기간 11/9–11/15. 11/11–15에 100,100,100,75,75가 있으면 유효 5건, 평균 90%, 차이 -40%p. 11/16의 다른 기록이나 미확인/기록 없는 날짜는 평균에 넣지 않는다.

### 변화 화면용 완전한 응답 예시

이 예시는 5절의 누적 수분 기록과 **다른 가상 기록**(ID 끝자리 2)이다. 11/16 점심 50%, 물 단일 섭취 150mL, 휘청거림 없음. 식사 과거 자료는 위 fixture를 사용한다. 수분을 자료 부족 또는 정상으로 뭉뚱그리지 않고 비교 대상이 아닌 이유를 표시한다.

```json
{
  "data": {
    "resident_id": "resident-1",
    "current_observation_id": "00000000-0000-4000-8000-000000000002",
    "timezone": "Asia/Seoul",
    "access_scope": "author_only",
    "evaluated_at": "2026-11-16T04:00:00Z",
    "minimum_valid_records": 3,
    "results": [
      {
        "metric": "meal",
        "status": "changed",
        "current_value": 50,
        "baseline_mean": 90,
        "delta": -40,
        "value_unit": "percent",
        "delta_unit": "percentage_points",
        "basis": {
          "meal_slot": "lunch"
        },
        "baseline_start_date": "2026-11-09",
        "baseline_end_date": "2026-11-15",
        "valid_count": 5,
        "excluded_counts": {},
        "evidence": [
          { "observation_id": "00000000-0000-4000-8000-000000000010", "unit_date": "2026-11-11", "value": 100, "measured_at": "2026-11-11T03:15:00Z" },
          { "observation_id": "00000000-0000-4000-8000-000000000011", "unit_date": "2026-11-12", "value": 100, "measured_at": "2026-11-12T03:15:00Z" },
          { "observation_id": "00000000-0000-4000-8000-000000000012", "unit_date": "2026-11-13", "value": 100, "measured_at": "2026-11-13T03:15:00Z" },
          { "observation_id": "00000000-0000-4000-8000-000000000013", "unit_date": "2026-11-14", "value": 75, "measured_at": "2026-11-14T03:15:00Z" },
          { "observation_id": "00000000-0000-4000-8000-000000000014", "unit_date": "2026-11-15", "value": 75, "measured_at": "2026-11-15T03:15:00Z" }
        ],
        "excluded_evidence": [],
        "summary": "점심 식사량 50%, 이전 7일 유효 5일 평균 90%보다 40%p 적게 기록됨."
      },
      {
        "metric": "water",
        "status": "not_aggregate",
        "current_value": 150,
        "baseline_mean": null,
        "delta": null,
        "value_unit": "mL",
        "delta_unit": "mL",
        "basis": null,
        "baseline_start_date": null,
        "baseline_end_date": null,
        "valid_count": 0,
        "excluded_counts": {},
        "evidence": [],
        "excluded_evidence": [],
        "summary": "단일 섭취량 150mL 기록. 일합계 또는 같은 cutoff 누적량이 아니므로 비교하지 않음."
      }
    ],
    "context": [
      {
        "category": "walking_observation",
        "current_value": "휘청거림 없음",
        "status": "recorded",
        "history": []
      }
    ]
  },
  "meta": {
    "contract_version": "b2-01-draft-3",
    "data_source": "database"
  }
}
```

## 7. 인계 모델과 상태 — 세부 동작은 C4 확인 필요

기획안은 취소·담당 변경 이력 보존을 요구한다. 다음 역할/초기화 규칙은 **B2 제안**이며 팀이 이미 합의한 내용이 아니다.

```ts
type HandoverStatus = "sent" | "acknowledged" | "in_progress" | "completed" | "cancelled";
type Handover = {
  id: string; resident_id: string; observation_ids: string[];
  title: string; confirmed_facts: string;
  follow_up_items: { id: string; category: Category; label: string; checked: boolean }[];
  sender_id: string; assignee_id: string; due_at: string;
  status: HandoverStatus; version: number; created_at: string;
  acknowledged_at: string | null; started_at: string | null;
  completed_at: string | null; completed_by: string | null;
  completion_note: string | null; follow_up_observation_ids: string[];
  cancelled_at: string | null; cancelled_by: string | null;
  cancellation_reason: string | null;
  is_overdue: boolean;
};
type HandoverEvent = {
  id: string; handover_id: string;
  action: "create" | "acknowledge" | "start" | "complete" | "reassign" | "cancel";
  actor_id: string; created_at: string; request_id: string;
  from_status: HandoverStatus | null; to_status: HandoverStatus;
  from_assignee_id: string | null; to_assignee_id: string;
  reason: string | null; version_before: number; version_after: number;
};
```

작성자·수행자·시각은 서버가 설정한다. assignee는 같은 시설에서 해당 resident와 원기록을 볼 수 있는 실제 사용자다. 이름/직무 문자열로 대신하지 않는다. 이벤트는 추가만 하며 취소나 담당 변경으로 이전 이력을 삭제하지 않는다.

| 시작 상태 | action | 결과 | 권한/조건 제안 |
|---|---|---|---|
| 새 인계 | create | sent, version=1 | 공유 정책에서 허용한 직원, 유효 수신자/미래 기한 |
| sent | acknowledge | acknowledged | 지정 수신자의 명시 동작 |
| acknowledged | start | in_progress | 지정 수신자 |
| in_progress | complete | completed | 지정 수신자, 전체 확인 항목 체크 + 결과 메모 |
| sent/acknowledged/in_progress | reassign | sent | 송신자 또는 시설 관리자, 다른 유효 수신자, 변경 사유 |
| sent/acknowledged/in_progress | cancel | cancelled | 송신자 또는 시설 관리자, 취소 사유 |

- GET으로 읽기만 해서는 수신 확인/완료가 되지 않는다. 일반 단계 건너뛰기는 허용하지 않는다.
- 완료 시 `completed_by`, `completed_at`, `completion_note`를 저장한다. 실제 후속 관찰 연결은 선택이며 AI가 완료 여부를 판정하지 않는다.
- 재할당은 기한을 유지하고 새 담당자의 재수신을 위해 acknowledged_at/started_at=null, checked=false로 초기화한다. 이전 수신·시작 이력은 이벤트에 남긴다. 같은 담당자로 변경 요청은 422. 기한이 이미 지났어도 재할당 가능하며 overdue를 유지한다.
- 취소는 기존 진행 시각/확인 항목을 보존하고 cancelled_by/at/reason을 추가한다. 완료와 취소는 종료 상태로 두며 이후 수정/재개는 허용하지 않는 제안이다.
- `is_overdue = status not in [completed,cancelled] && due_at < 서버 현재 시각`. 기한과 같은 순간은 초과가 아니다. 완료/취소 건은 현재 미완료 초과 집계에서 제외한다.
- 재할당 후 이전 담당자의 접근·공유 기록 접근은 B1 시설 정책으로 정한다. 이전 권한을 영구 보장한다고 가정하지 않는다.

## 8. 인계 API

### POST /api/handovers

```json
{
  "id": "10000000-0000-4000-8000-000000000001",
  "resident_id": "resident-1",
  "observation_ids": ["00000000-0000-4000-8000-000000000001"],
  "title": "다음 근무 관찰 확인",
  "confirmed_facts": "점심 식사량 50%, 당일 18시 누적 수분 섭취량 650mL로 확인됨.",
  "follow_up_items": [
    { "id": "20000000-0000-4000-8000-000000000001", "category": "meal", "label": "저녁 식사 기록 확인" }
  ],
  "assignee_id": "30000000-0000-4000-8000-000000000001",
  "due_at": "2026-11-16T12:00:00Z"
}
```
이 예시는 11/16 18시 이후, 21시 이전에 생성하는 가상 인계다. 실제 시연에서는 날짜를 함께 조정한다.

검증: title 1–100자, confirmed_facts 1–2,000자, observation_ids 중복 없이 1–20개, follow_up_items 1–10개(고유 UUID/category/label 1–200자), 미래 due_at. 원기록은 같은 resident이며 송신자·수신자 모두의 접근 범위에 있어야 한다. 재할당 때도 새 수신자의 원기록 접근을 검증한다.

응답: `data: Handover`, 공통 database meta. 서버는 sender_id/created_at, status=sent, version=1, checked=false, 후속 기록 배열=[], 진행/완료/취소 필드=null을 설정한다. create 이벤트는 from_status/assignee=null, version_before=0, version_after=1. 생성 id를 create 이벤트의 request_id로 사용한다. DB commit 후 201.

생성 성공 응답 예시 (201):
```json
{
  "data": {
    "id": "10000000-0000-4000-8000-000000000001",
    "resident_id": "resident-1",
    "observation_ids": [
      "00000000-0000-4000-8000-000000000001"
    ],
    "title": "다음 근무 관찰 확인",
    "confirmed_facts": "점심 식사량 50%, 당일 18시 누적 수분 섭취량 650mL로 확인됨.",
    "follow_up_items": [
      {
        "id": "20000000-0000-4000-8000-000000000001",
        "category": "meal",
        "label": "저녁 식사 기록 확인",
        "checked": false
      }
    ],
    "assignee_id": "30000000-0000-4000-8000-000000000001",
    "due_at": "2026-11-16T12:00:00Z",
    "sender_id": "30000000-0000-4000-8000-000000000002",
    "status": "sent",
    "version": 1,
    "created_at": "2026-11-16T09:05:00Z",
    "acknowledged_at": null,
    "started_at": null,
    "completed_at": null,
    "completed_by": null,
    "completion_note": null,
    "follow_up_observation_ids": [],
    "cancelled_at": null,
    "cancelled_by": null,
    "cancellation_reason": null,
    "is_overdue": false
  },
  "meta": {
    "contract_version": "b2-01-draft-3",
    "data_source": "database"
  }
}
```

동일 사용자+id+동일 최초 payload 재시도는 중복 생성 없이 현재 Handover를 200 반환한다. 다른 payload면 409. 최초 요청 또는 canonical hash를 저장해 비교하며 현재 변경된 status와 비교하지 않는다. 기존 성공 요청의 재시도는 기한이 지났다는 이유로 거절하지 않지만 현재 인증·접근 권한은 먼저 확인한다.

### GET /api/handovers

선택 필터: resident_id, assignee_id, status(한 상태, cancelled 포함), overdue=true|false, limit(1–100, 기본 20), cursor. 접근 가능한 인계만 반환하며 필터가 권한을 확장하지 않는다. 정렬 created_at DESC, id DESC. cursor는 필터와 마지막 행에 결합하고 형식/필터 불일치는 400.

`data: Handover[]`, meta.next_cursor: string|null. 빈 목록:
```json
{
  "data": [],
  "meta": { "contract_version": "b2-01-draft-3", "data_source": "database", "next_cursor": null }
}
```

### GET /api/handovers/{id}

`data: { handover: Handover, events: HandoverEvent[] }`, 공통 meta. 이벤트는 version_after ASC 순서다. 읽기로 상태를 변경하지 않는다. 없거나 보이지 않으면 404.

### PATCH /api/handovers/{id}

공통 필수값: request_id UUID, expected_version 양의 정수, action. 각 action의 필드만 허용한다. acknowledge/start에는 완료/변경 전용 필드를 보내지 않는다.

수신 확인:
```json
{ "request_id": "40000000-0000-4000-8000-000000000001", "expected_version": 1, "action": "acknowledge" }
```
start는 새 request_id와 현재 expected_version, action=start를 사용한다. 아래 3개 요청은 version=3의 진행 중 인계에 대한 **서로 다른 대안 시나리오**이며 순서대로 실행하는 예시가 아니다.

완료:
```json
{
  "request_id": "40000000-0000-4000-8000-000000000003",
  "expected_version": 3,
  "action": "complete",
  "checked_item_ids": ["20000000-0000-4000-8000-000000000001"],
  "completion_note": "저녁 식사 기록을 확인하고 후속 기록에 남겼습니다.",
  "follow_up_observation_ids": ["00000000-0000-4000-8000-000000000006"]
}
```
담당 변경:
```json
{
  "request_id": "40000000-0000-4000-8000-000000000004",
  "expected_version": 3,
  "action": "reassign",
  "assignee_id": "30000000-0000-4000-8000-000000000003",
  "reason": "근무 변경으로 새 담당자에게 인계합니다."
}
```
취소:
```json
{
  "request_id": "40000000-0000-4000-8000-000000000005",
  "expected_version": 3,
  "action": "cancel",
  "reason": "중복 인계로 확인되어 취소합니다."
}
```

- complete: 모든 확인 항목 ID를 중복 없이 포함, 결과 메모 1–2,000자, 후속 관찰 배열 0–20개. 연결 기록은 같은 resident이고 관련 송수신자에게 접근 가능해야 한다. 중간 체크 자동저장은 이 초안에서 제외하며 UI 로컬 상태로 둔다.
- reassign/cancel: reason 1–500자 필수. 새 담당자/상태/권한은 7절 규칙을 검증한다.
- 성공은 `data: { handover: Handover, event: HandoverEvent }`, 공통 meta. 현재 행, 이벤트, 요청 처리 기록, version +1을 **하나의 원자적 작업**으로 저장한다.
- 같은 사용자·자원·request_id·payload 재시도는 action을 다시 수행하지 않고 현재 handover와 최초 event를 반환한다. 같은 request_id에 다른 내용은 409. 응답의 handover.version은 이후 변경으로 event.version_after보다 클 수 있다.
- 재시도 확인은 현재 인증/접근 검사 후, 새로운 전이/version 검사 전에 수행한다. 새 요청의 expected_version 불일치는 409 VERSION_CONFLICT. 새 데이터를 보고 재판단하며 자동 덮어쓰지 않는다.
- 동시 요청 중 하나만 성공하도록 DB 조건부 갱신/트랜잭션이 필요하다. 실패한 동작은 이벤트도 남기지 않는다. 재시도 처리 기록의 보존 기간은 최소 인계 데이터 보존 기간으로 제안하며 B1과 확정한다.

## 9. 화면 연결과 검증 사례

| 화면 | 연결 항목 | 주의점 |
|---|---|---|
| F1 입력/초안 | 17개 fields + 정량 확장, revision, 생성 방식, 확인 상태 | 0과 미확인 분리, 입력 수정 후 재생성·재확인 |
| F2 변화 | current/mean/delta, 기간, 기준, valid_count, evidence | %p와 % 구분, 단위·집계 시각 표시, 자료 부족을 정상으로 표시하지 않음 |
| F2 인계 | 담당자 ID, 기한, 상태, version, event 이력 | 읽기와 수신 분리, 완료자/결과, 취소/변경 사유, 재할당 후 재수신 |
| 운영 #29 | 미확인 인계, 기한 초과, 반영 대기, 오늘 저장 건수 | 오늘 저장 건수는 KST created_at 기준. 분모 없는 완료율을 만들지 않음 |

### F2 PR #39와 연결할 때의 매핑

PR #39는 화면 인수 단계이며 현재 3개 상태의 mock를 쓴다. 아래는 **향후 #10/#11/#12/#14에서 반영할 API 연결 계약**이다. 이 문서가 PR #39의 승인을 대신하지 않는다.

| API 상태 | 화면 문구 | 미완료 건수 | 수신 미확인 건수 |
|---|---|---|---|
| sent | 수신 대기 | 포함 | 포함 |
| acknowledged | 수신 확인 | 포함 | 제외 |
| in_progress | 조치 중 | 포함 | 제외 |
| completed | 완료 | 제외 | 제외 |
| cancelled | 취소 | 제외 | 제외 |

- 현재 `countOpenHandovers(): status !== 완료`는 3개 mock 안에서는 맞지만 cancelled가 추가되면 틀린다. 실제 연결은 `sent/acknowledged/in_progress`만 센다. `미확인 인계`는 sent만 세며 `확인할 인계(미완료)`와 같은 지표로 부르지 않는다.
- `HandoverItem.resident/assignee/due/tone`은 표시용 모델이다. API는 resident_id/assignee_id/due_at/status/version을 반환하고 화면 adapter가 접근 가능한 이름과 KST 표시 시각/색으로 바꾼다. 문자열 `오후 담당자`를 사용자 ID로 보내지 않는다.
- `ChangeItem.evidence/time/summary/tone`도 표시용이다. API의 수치·기준 기간·유효 건수·근거 ID·상태로 구성한다. `insufficient_data/current_unknown/context_missing/not_aggregate`를 `관찰 필요` 또는 `변화 없음`으로 일괄 표시하지 않는다.
- `최근 3건`을 비교 기준으로 쓰지 않는다. 기준은 같은 끼니의 이전 7일이며, 3은 최소 유효 단위 수다.
- 운영 수치는 #29에서 구현한다. 현재 미병합 PR의 활성 담당자 4명은 예시값이다. 최신 기획안의 `오늘 저장 건수`와 Issue #29의 오래된 `완료율` 문구 차이는 연결 전에 조정한다.

실데이터 연결 전 mock 표시를 유지한다. 모든 예시는 가상 ID이며 실제 API는 자원 존재와 권한을 검증한다.

확인할 사례:
- 정상 생성, template fallback, 구조화 값/원문 불일치, 미확인, 실제 0, 수정 후 늦게 도착한 옛 응답.
- 동일 끼니와 다른 끼니, 오늘 제외, KST 자정, 관찰/저장 날짜 차이, 유효 0/2/3건, legacy, 중복·충돌.
- 완료된 하루 vs 같은 시각 누적량, 다른 cutoff, 미완료/누락 구간, 미래 종료 시각, 잘못된 단위.
- 수신→시작→완료, 완료 메모/완료자, 취소/담당 변경 사유와 이력, 재할당 후 재수신, 종료 건 overdue 제외.
- 중복 재시도, 다른 내용의 같은 요청 ID, 동시에 완료/재할당 요청, 권한 없는 사용자, DB 미준비.

### 최신 검증 설계와 지표 — 재공유 PDF p.13

새 PDF는 이전의 학생 1 수기 타이핑/학생 2 웹 기록 비교를 아래 방식으로 대체했다. 이 내용은 사용자가 먼저 공유한 지표표보다 상세한 최신 검증 기준이다.

| 항목 | 최신 기획안 기준 |
|---|---|
| 참여자 | 학생·지인 4~6명, 실제 참여 인원을 결과에 명시 |
| 방식 | 모든 참여자가 일반 텍스트 입력과 돌봄잇을 각각 사용 |
| 사례 | 길이와 난도가 비슷한 가상 관찰 사례 A·B |
| 순서 | 절반은 일반 입력→돌봄잇, 나머지는 돌봄잇→일반 입력 |
| 사례 배정 | 두 방식에 A·B가 골고루 배정되도록 교차 배정 |
| 연습 | 측정 전에 별도 사례로 두 방식 모두 짧게 연습 |
| 종료 | 작성자가 검토·수정하고 최종 기록을 제출한 시점 |

| 지표 | 측정 방법 |
|---|---|
| 작성 시간 | 사례 제시부터 검토·수정 후 최종 제출까지. 음성 처리와 AI 대기시간 포함 |
| 필수 사실 반영률 | 정확하게 기록한 필수 사실 수 ÷ 사례의 필수 사실 수 |
| 오류·추가 사실 | 숫자·단위·부정 표현 오류와 사례에 없던 내용을 별도 집계 |
| 사용성 | 잘못 누름, 도움 요청, 완료 여부와 간단한 사용 소감 |

측정 운영 제안:
- 두 방식 모두 사례를 제시하는 순간부터 시간을 재며, 검토·수정·재시도·음성 처리·AI 대기를 제외하지 않는다. 웹 방식의 최종 제출은 저장 성공 확인까지로 정의하는 안을 제안한다. 단순 AI 응답 시간은 전체 작성 시간의 대체 지표가 아니다.
- 가상 사례마다 필수 사실과 정답 기준을 먼저 정한다. 최종 제출 기록에서 정확히 반영된 사실만 분자에 포함한다. 비율을 %로 표시할 때만 100을 곱한다. 필수 사실이 없는 사례는 이 비율의 평가용으로 쓰지 않는다.
- 숫자·단위·부정 표현 오류와 추가 사실은 구분해 센다. 필수 사실을 모두 담아도 사례에 없던 내용을 추가할 수 있으므로 반영률만으로 정확성을 판단하지 않는다. 미확인 상태의 의미 보존도 기존 검증 사례에 유지한다.
- 새 p.13의 예시 `점심 50% 섭취, 물 150mL 섭취, 보행 시 휘청거림 없음`을 사실 보존 fixture에 포함한다. `휘청거림 없음`을 휘청거림으로 바꾸거나 근거 없이 평소 상태/위험도를 추론하지 않는다. `물 150mL 섭취`만으로 하루 총량·18시 누적량을 추정하지 않으며, 정량 비교용 집계 구간은 별도로 확인한다. 단일 섭취 사건과 누적량의 입력/저장 구분은 C1/C2에서 함께 확인한다.
- 잘못 누름·도움 요청 횟수, 완료 여부와 짧은 소감을 관찰표에 기록한다. 미완료 사례를 빠르게 끝난 성공 사례로 집계하지 않는다.
- 측정 결과는 참여자 ID·방법·사례·수행 순서와 함께 남기고 같은 참여자의 두 결과를 비교한다. 사례별 정답 기준을 적용하며 일반 입력에 익숙한 사람과 웹 입력에 익숙한 사람을 별도 집단으로만 비교하지 않는다.
- 초기 검증은 스톱워치와 관찰표로 수행할 수 있다. 이 업데이트만으로 새 API·DB 필드·자동 측정 시스템을 필수 구현 범위에 추가하지 않는다. B2는 숫자·단위·부정·미확인 보존과 입력 외 사실 생성 여부를 확인할 fixture를 준비한다.

이번 검증은 소수 참여자의 주어진 모의 과업에서 기록 작성 정확도·속도와 화면 사용성을 확인하는 범위다. 최신 PDF는 실제 요양시설의 총업무시간 절감·인계 누락 감소·구매 의사를 검증 범위에서 명시적으로 제외한다. p.12에서도 가격은 초기 가정이며 케어포 재입력을 포함한 총업무시간은 실제 도입 검토 단계에 별도로 확인한다고 명시했다. 이는 인계 기능을 구현 범위에서 삭제한다는 의미가 아니다.

## 10. 팀 확인 — 세 가지 핵심 결정과 승인 기록

기획안의 정량 비교·입력 수정 후 재확인·취소/담당 변경 이력은 이미 요구사항이다. **구현 방식**을 아래처럼 제안한다. 아직 합의되었다고 표시하지 않는다.

| 핵심 질문 | 권장안 | 확인자 |
|---|---|---|
| **1. 입력·저장 형식 (C1/C3/C5)** | PR #38의 17개 원문 필드 보존 + 실제 관찰 시각/수분 mL·구간/별도 휘청거림 + 승인 snapshot. 미관찰 null과 미실시 구분. B1이 저장·공유 권한 확정 | F1 정재헌 · B1 이은규 |
| **2. 수분 비교 (C2)** | 단일 섭취는 기록만 하고 비교 제외. 시연은 매일 18시 누적량으로 통일, 완료된 같은 구간만 이전 7일 평균에 포함. 사건 자동 합산 없음 | F1 · F2 · B1 |
| **3. 인계 상태/권한 (C4/C7)** | sent → acknowledged → in_progress → completed. 미종료 인계는 송신자/시설 관리자만 사유를 남겨 취소·담당 변경. 새 담당자는 다시 수신 확인. 취소는 미완료/초과 집계에서 제외 | F2 문수혁 · B1 이은규 |

나머지 검토 항목: 공통 envelope/snake_case(C6), 인증 token 전달·시설 정책(C5), version·재시도·이벤트의 원자적 저장(C7), 10초 template fallback와 음성 계약 추후 확정(C8). 모두 위 본문의 제안이며 이 PR에서 공통 코드/DB를 수정하지 않는다.

| 역할 | 확인할 범위 | 확인 상태 | 확인 일시/근거 |
|---|---|---|---|
| F1 정재헌 | 입력 17개·정량 확장·확인/저장 흐름 | 대기 | 없음 |
| B1 이은규 | 필드 저장·인증/공유·수정 이력·인계 원자성 | 대기 | 없음 |
| F2 문수혁 (지정 리뷰어) | 변화/인계 응답·5개 상태·집계/실패/빈 화면 | 대기 | 없음 |

기획안 검토의 체크 반응이나 PR 제출 자체는 이 계약의 승인이 아니다. 승인 댓글/리뷰가 오면 해당 링크와 일시를 기록하고 요청한 부분을 같은 PR에서 수정한다.

## 11. B2-01 완료 기준과 출처

- F1/F2/B1이 대표 요청·응답과 관련 결정에 동의하고 mock/저장 연계에 사용할 수 있어야 한다.
- 11/18까지 PR 제출뿐 아니라 지정 리뷰어 F2 문수혁의 피드백 반영과 승인을 완료한다. 그 후 정재헌이 최종 merge한다.
- 한 Issue에 한 PR, 대상 main, 작업 브랜치 제안 `feat/b2-01-api-contract`. 팀 PR 템플릿의 목적·변경·데이터 상태/남은 연결·직접 검증·리뷰 요청을 작성한다.
- 문서 수정만으로 신규 API 구현/통합 또는 #25 전체 완료를 주장하지 않는다. 실행하지 않은 build/API 테스트를 통과했다고 쓰지 않는다.

출처:
- 최신 `돌봄잇_찐 최종기획안_9조 (1).pdf` p.3·7–14 및 11/16 15:46 파일/15:47 그룹 검토 요청. 이전 파일과 텍스트 비교 시 p.3·12·13·14 변경, 나머지 10쪽 동일.
- 사용자가 먼저 공유한 검증 지표표는 최신 PDF p.13에 반영됨. 측정 운영 제안은 원문 요구사항과 구분한다.
- [B2-01 Issue #25](https://github.com/jaehjung0102/careit/issues/25), [현재 개발 계획](https://github.com/jaehjung0102/careit/blob/main/docs/development-plan.md).
- 현재 코드 기준: [PR #38](https://github.com/jaehjung0102/careit/pull/38), [17개 입력 항목](https://github.com/jaehjung0102/careit/blob/2338493bbc41258bcbc135355424a5c8a6f179e1/web/src/features/recording/observationFields.ts), [새 migration](https://github.com/jaehjung0102/careit/blob/2338493bbc41258bcbc135355424a5c8a6f179e1/supabase/migrations/202611160001_expand_observation_fields.sql). 아래 SQL 링크는 초기 기반의 출처다.
- [확인한 관찰 SQL](https://github.com/jaehjung0102/careit/blob/4c55f017d533f3aab6d2f9cf8841715382b38a36/supabase/migrations/202611140001_observations.sql).
- [저장 helper](https://github.com/jaehjung0102/careit/blob/2338493bbc41258bcbc135355424a5c8a6f179e1/web/src/lib/db/observations.ts), [입력 UI](https://github.com/jaehjung0102/careit/blob/2338493bbc41258bcbc135355424a5c8a6f179e1/web/src/features/recording/ObservationForm.tsx), [공통 타입](https://github.com/jaehjung0102/careit/blob/2338493bbc41258bcbc135355424a5c8a6f179e1/web/src/types/domain.ts).

## 12. B2-D1 배포 환경·실패 응답 점검 (2026-11-18)

관련 작업: [#45](https://github.com/jaehjung0102/careit/issues/45). 점검 URL: https://careit-eight.vercel.app/ . 소스 기준: `main@c0c611439eb350da89627c78c8c23350be587d76`. 배포의 내부 commit ID는 Vercel 관리 화면에서 확인하지 않았으며, 아래는 공개 배포에서 직접 관찰한 결과다.

### 공개 설정과 서버 전용 비밀

| 설정 | 위치·용도 | 현재 상태 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 공개 설정. 공유 개발 Supabase 주소 | 현재 `lib/supabase/client.ts`에서 사용 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 공개용 publishable key. 서버 비밀키가 아니며 RLS를 대체하지 않음 | 현재 브라우저 저장·조회에서 사용 |
| AI 제공업체 인증키 | 서버 환경변수만 사용. `NEXT_PUBLIC_` 접두사, 클라이언트 코드, 응답, 로그에 포함 금지 | AI API 구현 시 변수명·제공업체·필수 여부 확정. 현재 구현은 사용하지 않음 |
| Supabase `service_role`/secret key 또는 DB 비밀번호 | 비밀값. 브라우저 노출 금지; 현재 브라우저 저장과 인계 미연결 문제 해결을 위해 추가하지 않음 | 이번 작업에 필요하지 않음. 향후 필요성은 B1과 별도 검토; 시설 접근 검사를 우회하지 않음 |

Vercel Root Directory는 `web`, Production은 `main` 기준이다. 공개 변수는 Preview/Production의 의도한 프로젝트에 각각 설정하고 변경 후 재배포하여 확인한다. 값이 아닌 변수명·대상 환경·설정 여부만 공유한다. 로컬 `.env*`는 Git ignore 대상이며 비밀값을 문서/Issue/캡처에 넣지 않는다. 이번 점검은 Vercel 비밀 환경변수 목록·값, 배포 번들의 전체 보안 감사, DB 정책의 실효성 검증을 포함하지 않는다.

인계 API를 실제 연결하려면 환경변수 외에 **서버 토큰 검증, 시설·어르신·담당자 권한 검사, B1 DB/migration, 원자적 repository 어댑터 연결**이 필요하다. 공개 키를 넣는 것만으로 인계 저장이 활성화되지 않는다. 인증 어댑터 연결 후 잘못된/만료된 토큰은 401이어야 한다.

### 배포에서 확인한 경로

| 경로·방법 | 직접 확인한 응답 | 해석 |
|---|---|---|
| GET `/`, `/recordings`, `/changes`, `/handovers`, `/admin` | 모두 200, 브라우저 렌더링 정상 | 화면 접근 가능. 기능 전체 완료를 뜻하지 않음 |
| GET/POST `/api/handovers`, PATCH `/api/handovers/{id}` | 인증 헤더 없음: 401 `UNAUTHENTICATED`; 가짜 Bearer 문자열: 503 `DEPENDENCY_NOT_READY` | 현재 B1 어댑터 미연결로 차단. 가짜 토큰이 인증되었다는 의미가 아님 |
| GET `/api/handovers` + 잘못된 인증 방식 | 401 `UNAUTHENTICATED` | Bearer 형식 요구 |
| GET `/api/handovers/{id}` | 405, JSON envelope 없음 | 단건 GET 미구현. 현재 PATCH만 등록 |
| POST `/api/drafts`, GET `/api/changes`, GET `/api/recordings` | 404 HTML | 현재 미구현. `/recordings`의 저장·조회는 브라우저→Supabase helper 사용 |

총 16개 HTTP 점검은 **현재 구현 상태**와 일치했다. 인계의 7개 오류 응답은 `Cache-Control: no-store`, `error.code/message/retryable`, `meta.contract_version=b2-01-draft-3`를 포함했다. 실사용 인증 토큰·개인정보 없이 빈 요청 본문과 가상 ID로 검사했고, 실제 저장·수신 상태 변경·AI 호출은 하지 않았다.

앞으로 구현하는 API는 3절의 공통 JSON envelope와 상태 코드를 적용한다. `DEPENDENCY_NOT_READY`는 현재 `retryable=false`, 일시 장애 `SERVICE_UNAVAILABLE`은 `retryable=true`다. 404 HTML/405 빈 응답 또는 네트워크 오류를 받는 클라이언트도 JSON 파싱 오류나 빈 성공으로 처리하지 말고 기능 미준비/실패를 표시해야 한다. 실제 성공은 저장 commit 또는 생성 결과 확인 뒤에만 표시하며, 재시도에는 입력과 요청 ID를 보존한다. 403/404/409/422/429 및 실제 인증/DB 실패는 해당 연결 후 별도 통합 검증이 필요하다.

### 화면 결과와 후속 확인

- 데스크톱: 공통 데모 표시가 보이고 변화·인계·운영 화면에도 예시 데이터 설명이 있다. 운영 권한/등록은 준비 중이라고 표시한다.
- 기록 화면: 이 브라우저에서 로딩 후 `아직 저장한 기록이 없습니다.` 표시를 확인했다. 저장 성공·다른 작성자와의 격리는 이번 점검에서 재시험하지 않았다. 코드상 조회 오류/재시도와 저장 실패 시 입력 보존은 있으나 실제 장애 주입은 미실시다.
- **발견 사항 — 모바일 홈(390×844):** 사이드바의 예시 안내와 헤더의 데모 배지가 모두 숨겨져 샘플 이름·오늘 기록/인계 건수가 예시라는 표시 없이 보인다. `layout.tsx`의 `hidden ... lg:flex` / `hidden ... sm:inline`과 일치한다. 인계 화면의 자체 예시 문구는 이 크기에서도 보인다. 사용자는 팀이 전날 실제 휴대폰에서 정상 작동을 확인했다고 전달했다(이번 점검자가 직접 수행한 실기기 검증은 아님). 이는 기능 장애와 구분되는 낮은 우선순위의 안내 개선 제안이며, 즉시 수정이나 추가 휴대폰 검증을 #45 완료의 선행 조건으로 요구하지 않는다.
- 데이터 출처 구분 권장: 공통 문구가 기록 화면의 실제 Supabase 저장까지 전부 예시로 오해하게 만들 수 있다. 예시 어르신/통계와 현재 브라우저 계정의 실제 저장 기록을 화면별로 구분한다.
- #45 결과 댓글과 본 문서 변경을 F2가 검토한 뒤 완료 여부를 결정한다. 모바일 안내는 비긴급 개선 제안으로 기록하며 별도 즉시 수정 요청은 하지 않는다. 문서 변경의 최종 merge는 F1이 진행한다. 이 로컬 문서 준비만으로 게시·리뷰·merge·Issue 종료가 완료된 것은 아니다.
- 원본 HTTP 점검 결과: [2026-11-18 배포 응답 기록](qa/b2-d1-2026-11-18-routes.json). 16개 결과의 일치는 현 구현의 접근·거절·미구현 상태를 확인한 것이며, 모든 기능의 구현 완료를 의미하지 않는다.
