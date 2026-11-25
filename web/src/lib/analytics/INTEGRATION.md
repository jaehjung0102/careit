# B2-04 · B1/F2 연결 준비 — 2026-11-25

현재 계산 코드는 PR #63 `8b30bbd`, main은 `70498c0`이다. B1 PR #64 `76721ad`의 `observations.ts`와 수정 이력 문서를 비교했다. 이 문서는 연결 제안이며 실제 DB/F2 화면 통합이나 B1 PR 승인 결과가 아니다.

## B1 데이터 연결

| 필요한 데이터 | #64 현재 상태 | 연결 기준 |
|---|---|---|
| 논리 관찰 ID·resident ID | `Observation.id/resident_id` 있음 | 현재 사용자가 볼 수 있는 행만 전달 |
| 최신 승인 원본 | DB version/이력 snapshot 있음; AI 승인 저장은 없음 | 수정 버전이 있다는 것만으로 AI 승인된 것으로 취급하지 않음. 별도 V3/승인 저장 작업 필요 |
| 실제 `observed_at` | 없음 | `created_at`, `updated_at`, 이력 `recorded_at`을 대신 사용하지 않음. 모르면 null/자료 부족 |
| 원래 항목 값 | 평평한 17개 필드 | 검증 후 `fields`에 묶으며 null/미확인/미실시를 유지. legacy 식사 표현을 비율로 추정하지 않음 |
| 수분 정량·basis·기간·완료 | 범주형 `water`만 있음 | mL를 범주에서 만들거나 단일 사건을 합산하지 않음. 없는 정량은 null |
| 별도 보행 관찰 | 도움 수준 `walking`만 있음 | 부축 필요와 휘청거림 유무는 다른 값. 새 정보를 추정하지 않음 |
| 전체 비교 기간 | `listObservations`는 생성 시각 기준 최근 30건 | #20에서 `historyWindows` 합집합의 모든 페이지를 조회. 일부만 읽었으면 complete=false → 503 |
| 권한·일관성 | 팀 RLS/수정 권한 준비 | 요청별 실제 사용자로 현재 행과 과거 행의 접근을 검증하고 일관된 최신 snapshot 전달 |

`listObservationRevisions(id)`는 **한 기록의 수정 내역**이다. 같은 관찰의 version 1/2/3을 서로 다른 날짜의 관찰 세 건으로 평균에 넣으면 안 된다. 최신 17항목 snapshot만 골라도 누락된 관찰 시각/정량/승인 의미가 생기지는 않는다. B2 input_revision과 B1 DB version도 서로 다른 번호다.

기존 `ComparisonRepository.getVisibleCurrent` / `readAllVisibleHistory` 경계를 유지한다. 실제 구현 담당·정정/승인 projection·중복 정책·DB 시각 정밀도는 B1/F1 답변 대기다. 데이터가 없다는 문제를 가상 값이나 임의 승인으로 해결하지 않는다.

## F2 화면 연결

현재 main의 `ChangeList` / `changeData.ts`는 mock의 `ChangeItem[]`를 표시하며 모든 카드에 “관찰 필요”를 붙인다. API는 그 배열과 다른 응답을 반환하므로 실제 데이터를 그대로 대입하지 않는다. F2 담당 파일은 이번 작업에서 수정하지 않았다.

| API 값/상태 | 화면에서 보존할 의미 |
|---|---|
| `results[].metric`, `current_value`, `baseline_mean`, `delta`, `value_unit`, `delta_unit` | 식사 차이는 %p, 수분 차이는 mL. 0을 빈 값으로 숨기지 않음 |
| `changed` / `unchanged` | 수치가 다름/같음. 모든 감소를 위험 경고로 자동 변환하지 않음; delta=0은 “변화 없음”으로 표시 |
| `current_unknown` | 현재 값 미확인. 과거 평균이 있어도 차이는 null |
| `insufficient_data` | 유효 과거 자료 부족. 0 평균이나 변화 없음으로 표시하지 않음 |
| `context_missing` / `not_aggregate` / `incomplete_period` | 비교 조건 부족/사건량/집계 미완료를 구별 |
| `unsupported_legacy` | 현재 값을 정확히 환산할 수 없음. 정상값/0으로 바꾸지 않음 |
| `evidence`, `excluded_evidence`, `excluded_counts` | 날짜별 실제 채택 근거와 제외 사유. 임의로 근거 문장을 만들지 않음 |
| `context` | 배변/보행 등의 원래 범주·미확인·미실시를 보존, 임의 점수/위험도 없음 |
| `access_scope`, `meta.data_source` | 본인/시설 범위 및 mock/database 구별. 이름은 허용된 resident 디렉터리에서 얻음 |

빈 카드 배열 하나로 미조회/조회 실패/기록 없음/자료 부족을 합치지 않는다. API 오류에서 원래 선택을 유지하고 오류·재시도 상태를 표시한다. 인계 기한은 기존 `isHandoverOverdue`의 동일 순간 false/1ms 이후 true와 completed/cancelled 제외 규칙을 사용한다.

### 화면 개발용 응답 10건

[`examples/changes-responses.json`](examples/changes-responses.json)에 요청 경로·가상 입력·기대 HTTP 상태·응답을 함께 제공한다. 계산 코드 `8b30bbd`의 실제 `createGetChanges`에 **테스트용 인증/조회**를 주입해 만들었고, 상태/차이/입력 보존을 확인했다. 외부 API/DB 호출은 없었으며 예시 평가 시각은 고정된 11/24 18:00 KST다. 파일 생성일의 실시간 데이터가 아니다.

- 변화 있음, 실제 0, 변화 없음, 현재 미확인, 과거 자료 부족.
- 단일 수분 사건, 집계 미완료, 관찰 시각 없음, 지원하지 않는 과거 식사 표현.
- 전체 과거 기록 조회가 끝나지 않은 경우: 성공/빈 결과 대신 503.

F2는 명시적인 예시/개발 모드에서 `cases[].response`로 상태별 화면을 준비할 수 있다. 운영 API의 성공 대체로 사용하지 않으며 테스트 토큰/인증 callback을 배포하지 않는다. 각 성공 응답의 `meta.data_source`는 `mock`이다. 실제 연결 후에는 같은 사례를 실제 권한·저장 조회로 다시 검증해야 한다.

## 연결 후 확인할 순서

1. 선행 PR/DB 적용 후 검증된 사용자로 현재 승인 기록과 전체 비교 기간을 조회한다.
2. 50% 대 과거 평균 90% → -40%p, 650mL 대 900mL → -250mL의 근거가 실제 저장 기록과 일치하는지 확인한다.
3. 0/미확인/자료 부족/사건량/집계 미완료 및 다른 사용자·접근 취소·부분 조회를 각각 확인한다.
4. F2 화면의 값·단위·근거·범위·mock 표시를 확인한 뒤 리뷰/merge/배포 검증한다.

#28 마감은 11/29이며 실제 B1 #20 연결 이후 전체 검증은 #30과 함께 진행한다. 현재 함수 테스트나 예시 응답은 실제 로그인·저장·휴대폰 검증을 대신하지 않는다.
