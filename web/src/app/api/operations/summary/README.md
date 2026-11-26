# B2-05 운영 현황 · F2 연결 초안

`GET /api/operations/summary`는 현재 사용자가 운영 현황을 볼 수 있는 워크스페이스의 집계 네 가지를 반환한다. 인증은 `Authorization: Bearer <access token>`을 사용한다. 현재 사용자의 워크스페이스와 조회 권한은 서버에서 확인하며 쿼리 매개변수는 받지 않는다.

[F2 예시 JSON](example-response.json)은 2026-11-25 14:00 KST 기준 가상 인계 3건과 기록 3건을 실제 handler에 전달해 생성했다. 개발 화면에서 이 파일을 사용하고 예시 데이터 표시에는 `meta.data_source`를 사용한다.

| 응답 필드 | 화면 문구 | 집계 기준 |
|---|---|---|
| `unacknowledged_handovers` | 수신 미확인 | 현재 상태가 `sent`인 인계 |
| `overdue_handovers` | 기한 초과 | 평가 시각이 기한을 지난 미종료 인계. 수신 미확인 건도 기한을 넘겼으면 두 집계에 모두 포함 |
| `pending_reflection` | 반영 대기 | 기존 돌봄 프로그램에 반영 대기 중인 기록. 이전 날짜의 대기 건도 포함 |
| `saved_today` | 오늘 저장 | 서버 저장 시각인 `created_at`이 응답의 서울 날짜인 기록 |

`date`와 `timezone`은 저장 건수의 날짜 기준을 보여준다. `evaluated_at`은 기한을 판정하는 서버 시각이며 UTC로 반환된다. `pending_reflection: null`은 상태 데이터가 불충분하므로 “확인 불가”처럼 표시한다. `0`은 확인된 빈 집계다. 완료율은 대상과 기간 합의 후 별도로 검토한다.

수신 미확인과 기한 초과 카드는 각각 `GET /api/handovers?status=sent`, `GET /api/handovers?overdue=true`에 연결할 수 있다. 건수를 대조하려면 같은 워크스페이스·사용자 조회 권한에 한정해 목록의 모든 페이지를 읽는다. 두 API는 같은 기한 규칙을 사용하며 평가 시각이나 상태가 달라지면 건수가 달라질 수 있다. 실제 연결 시 B1/F2와 조회 범위를 검증한다.

집계 성공과 오류는 `Cache-Control: no-store`를 사용한다. 미인증 401은 로그인 확인, 권한 거부 403은 접근 제한으로 표시한다. 연결 준비 중인 503 `DEPENDENCY_NOT_READY`와 재시도 가능한 503 `SERVICE_UNAVAILABLE`을 구분한다. 일부 기록만 읽은 경우는 후자로 응답한다.

실제 앱에서 성공 응답을 받으려면 B1이 검증된 인증 및 워크스페이스 읽기를 제공하고 [#21](https://github.com/jaehjung0102/careit/issues/21)의 저장 상태를 `pending` / `reflected` / `null`에 매핑해야 한다. 조회는 같은 일관성 기준으로 두 데이터셋을 끝까지 읽고 수정 이력 대신 논리 기록당 현재 행 하나를 전달한다. 현재 라우트는 미인증 401, 연결이 필요한 Bearer 요청 503을 반환한다. 개발 예시는 테스트용 handler 호출에서 생성한다.

B1 조회에서는 SQL에 `created_at <= evaluatedAt` 조건을 적용한다. 서버가 평가 시각을 정한 뒤 저장된 행이나 DB 시계 차이로 평가 시각 이후에 기록된 행은 다음 조회에서 포함한다. 저장 시각은 DB의 시간대가 있는 timestamp 자료형을 사용하며, 잘못된 행은 집계 오류로 처리한다.
