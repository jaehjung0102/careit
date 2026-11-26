# B2-04 — 식사·수분 비교와 근거

`docs/api.md` 4·6절을 계산하는 순수 함수와 `GET /api/changes`의 주입 가능한 조회 경계다. 계산·오류 경로는 가상 데이터로 검증했다. 실제 인증·DB·화면 연결, 교차 리뷰, merge·배포 확인은 남아 있으며 #28은 진행 중이다.

## 입력과 계산

- 호출자는 접근 가능한 **최신 승인 snapshot만** 전달한다. 관찰 ID·어르신 ID·실제 관찰 시각·fields·water_measurement·walking_observation의 읽기 전용 projection이며 새 DB 스키마가 아니다.
- 식사: 같은 어르신·끼니, 실제 관찰 날짜 D의 D-7..D-1 KST 날짜를 비교한다. `전량/3/4/절반/1/4/드시지 않음`을 정확히 `100/75/50/25/0`으로 바꾼다. legacy 표현을 임의 비율로 추정하지 않는다.
- 수분: 집계 시작 날짜를 D로 삼는다. **동일 basis·동일 현지 시작/종료 시각**만 비교한다. 시연 기준은 00:00–18:00 완료 누적량이며 다른 cutoff나 하루 총량으로 대체하지 않는다. 순수 함수는 다른 동일 cutoff도 구별할 수 있다.
- `daily_total`은 KST 00:00–다음 날 00:00이다. 두 집계 방식 모두 `coverage_complete=true`, 구간 종료 시각 ≤ 서버 평가 시각이어야 한다. 관찰 시각의 허용 오차를 집계 종료에 적용하지 않는다.
- 단일 섭취(event)는 `not_aggregate`; event를 합하거나 여러 누적량을 더하지 않는다. 0은 유효 값이고 null·미확인·없는 날짜는 0이 아니다.
- 최소 유효 3일에서만 평균을 표시한다. 현재 값이 미확인이면 유효 과거 평균만 표시할 수 있고 delta는 null이다. 식사 차이는 %p, 수분 차이는 mL이며 위험도·진단을 뜻하지 않는다.
- 수분 정수 합/차이의 분자는 BigInt로 계산하고 결과를 JSON 숫자로 반환한다. 계산값을 먼저 반올림하지 않으며 설명에서만 소수 1자리로 표시한다.
- 채택한 날짜별 근거와 제외한 행/사유를 반환한다. 다른 어르신이나 확인 가능한 기간 밖 기록은 근거에도 포함하지 않는다. 날짜를 알 수 없는 같은 어르신의 후보는 `wrong_context` 등으로 제외하며, 조회 어댑터가 먼저 접근 범위를 제한해야 한다.

`compareContext`는 배변·보행 도움·별도 보행 관찰 등 원래 범주 값을 보존한다. `미확인`, `미실시`, `해당 없음`, `휘청거림 없음`을 구별하고 점수·위험도를 생성하지 않는다. 과거 시각을 확인할 수 없으면 7일 안에 있는지 증명할 수 없어 이번 비교의 history에는 포함하지 않는다. 원기록의 null 시각은 그대로 두며 `created_at`으로 채우지 않는다.

시간은 시간대가 명시된 유효 ISO 날짜(초 및 최대 마이크로초 정밀도)를 받는다. 근거 시각은 UTC로 바꾸어도 정밀도를 보존한다. 서버 평가 시각보다 1µs 늦은 집계 종료는 미완료로 처리하고, 시작·종료가 다른 구간은 별개 기준으로 비교한다.

## 중복 처리 — 계약의 제안 구현, B1/F1 확인 대기

- 서로 다른 ID의 동일 날짜·끼니/집계 구간·값은 한 단위다. ID 사전순 첫 행을 재현 가능한 대표 근거로 쓰고 나머지는 `duplicate`로 표시한다. 값이 다르면 그 날짜의 모든 행을 `conflicting_duplicate`로 제외한다.
- 같은 논리 기록의 수정 전 버전을 전달하면 안 된다. 반복 ID는 오류다. 이 함수가 최신 승인 버전을 임의로 선택하지 않는다.
- B1 #19/#20 및 F1과 승인·정정 projection과 중복 정책을 확정한 뒤 실제 데이터에 연결한다. 현재 구현은 정책 제안의 승인을 뜻하지 않는다.

## 조회와 기한

- `changes.ts`는 meal/water 순서와 원기록 맥락을 결합하고 응답 시각을 UTC Z로 직렬화한다. 입력을 변경하지 않는다.
- 식사/맥락과 수분의 기준 날짜가 다르면 `historyWindows`가 두 범위를 반환한다. B1 조회는 그 합집합 전체를 읽어야 한다. 최신 30개 기록 목록으로 평균을 계산하지 않는다.
- [조회 API 연결 규칙](../../app/api/changes/README.md)에 인증·페이지 완료·오류 처리를 정리했다. 공개 route는 어댑터 미연결 시 401/503이며 샘플 성공을 반환하지 않는다.
- 기존 `isHandoverOverdue`를 재사용한다. 기한과 같은 순간은 초과가 아니고, 1ms 이후부터 미종료 상태만 초과다. completed/cancelled는 제외한다. 상태별·기한 경계·KST 자정 사례를 검증했으며 별도 기한 규칙을 복제하지 않았다. 운영 집계 연결은 #29 범위다.

## 재현

가상 사례: 식사 현재 50%, 과거 100/100/100/75/75 → 평균 90%, 차이 -40%p. 같은 완료 18시 구간의 물 현재 650mL, 과거 평균 900mL → -250mL. 실제 개인정보나 DB를 사용하지 않는다.

`web/`에서:

```sh
build_dir=$(mktemp -d)
node node_modules/typescript/bin/tsc --strict --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --rootDir src --outDir "$build_dir" src/lib/analytics/_tests/*.ts src/app/api/changes/_tests/*.ts src/app/api/handovers/_tests/*.ts
node --test "$build_dir/lib/analytics/_tests/"*.test.js "$build_dir/app/api/changes/_tests/"*.test.js "$build_dir/app/api/handovers/_tests/"*.test.js
npm run lint
npm run build
```

## 다음 연결

1. B1의 검증된 인증·현재 접근권한·전체 7일 최신 승인 조회 (#20 및 별도 V3 승인 저장 연결). 11/25 PR #64/#19는 기존 17항목 수정 이력만 제공하며 AI 승인 snapshot이나 실제 관찰 시각을 저장하지 않는다. [B1/F2 연결 점검](INTEGRATION.md)을 참고한다.
2. F2의 변화 화면 표시/예외 상태 연결. 연결 전 mock 표시 유지.
3. F2 교차 리뷰, F1 merge·배포 확인. #28 마감 11/29, 실제 통합 검증 #30.
