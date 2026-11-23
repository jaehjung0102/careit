# GET /api/changes — B2-04 조회 경계

`docs/api.md` 6절의 응답을 생성하는 `createGetChanges`와 어댑터 인터페이스다. 실제 Supabase 연결은 아직 없다. 공개 route는 인증 헤더 없음/잘못된 형식에 401, 형식상 Bearer가 있어도 연결 미준비에 503 `DEPENDENCY_NOT_READY`를 반환한다. 임의 토큰을 유효 사용자로 인정하거나 가상 성공 결과를 배포하지 않는다.

## 처리 순서

1. B1 인증 어댑터가 토큰을 검증해 서버 사용자 ID를 반환한다. 클라이언트의 actor ID를 받지 않는다.
2. `resident_id`, `current_observation_id`만 허용한다. 누락/잘못된 값은 422, 중복/추가 쿼리는 400이다.
3. `getVisibleCurrent`는 해당 사용자가 지금 읽을 수 있는 **최신 승인 관찰 snapshot**과 `author_only` 또는 `facility` 범위를 반환한다. 숨김/없음은 모두 null → 404다. 접근 가능한 관찰의 resident 불일치는 422다.
4. `historyWindows`의 범위 합집합을 `readAllVisibleHistory`에 전달한다. meal/맥락은 실제 observed_at 날짜, water는 집계 시작 날짜이므로 같은 관찰에서도 두 범위가 다를 수 있다.
5. 조회는 권한을 먼저 적용하고 모든 페이지를 읽는다. `complete=false`이면 재시도 가능한 503이며 부분 평균을 반환하지 않는다. 잘못된 행·다른 resident·중복 ID·연결 오류는 원문을 노출하지 않는 500이다.
6. 계산 결과와 `contract_version`, 정직한 `data_source`를 반환한다. 성공/실패 모두 `Cache-Control: no-store`다. 자료 부족은 200이며 값/상태로 구분한다.

## B1 연결에서 필요한 것

- 인증/RLS 또는 동등한 서버 권한 검사, 실제 사용자와 resident 접근 관계. service key로 권한을 우회하지 않는다.
- 현재 관찰과 과거 관찰은 동일한 일관성 기준에서 최신 승인 버전을 읽어야 한다. 과거 조회 중 현재 관찰 접근이 취소되었는지도 확인한다. `asOf`는 평가 시각이며 그 인수 자체가 DB snapshot 일관성을 보장하지 않는다.
- 목록용 30건 제한을 재사용하지 않고 페이지를 끝까지 읽는다. 겹치는 조회 범위는 관찰 ID로 합치되 승인 버전 충돌을 조용히 버리지 않는다.
- 물의 집계 날짜가 observed_at과 다를 수 있으므로 두 열의 범위를 모두 고려한다. 범위/시각이 없는 legacy를 날짜로 추정하지 않는다. 현재 projection의 시각 파서는 최대 밀리초 정밀도다. DB 시각의 정밀도 정책을 연결 전에 확정한다.
- projection은 `ComparisonObservation`이며 새 DB 스키마를 요구하지 않는다. 필드명·nullable 값·water_measurement·승인/정정 정책은 기존 #25 계약과 맞춘다.
- 현재 query validation은 공통 `isResidentId`를 재사용한다(합의된 demo resident ID 및 UUID). 시설 전체 공유가 미구현이면 `author_only`를 반환한다.
- 별도 ID의 같은 날짜·끼니/집계 구간 중복 처리 제안은 계산 README와 `docs/api.md`에 있다. B1/F1 최종 확인 전 확정 정책으로 표기하지 않는다.

## 테스트와 화면 연결

`_tests/get-changes.test.ts`의 성공 사례는 **테스트 내부에 주입한 mock 어댑터**다. 실제 DB·RLS 또는 화면 연결 검증이 아니다. 정상/빈 기록, 불완전 조회, 접근 불가, 잘못된 쿼리, 어댑터 오류, 서로 다른 기준 날짜를 검증한다.

F2는 `results`의 meal/water, 근거/제외 이유, `context`, `access_scope`를 표시해야 한다. `current_unknown`, `insufficient_data`, `context_missing`, `not_aggregate`, `incomplete_period`를 정상/변화 없음으로 바꾸지 않는다. 연결 전 기존 화면의 mock 표시는 유지한다.

재현 명령과 계산 예시는 [analytics README](../../../lib/analytics/README.md)를 따른다. #28은 리뷰/merge/배포 확인까지 열어 두며 B1 #20 merge 후 실제 조회 연결과 #30 통합 검증을 이어간다.
