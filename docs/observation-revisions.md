# [B1-03] / #19 — 관찰 수정·이력·중복 요청 계약

## 선행 작업과 적용

이 PR은 미병합 선행 작업 #18(PR #61) 위에 쌓은 변경이다. 리뷰 base는 `feat/b1-02-team-auth`이며 #56 → #61 → #19 순서로 main에 반영한다. #61 병합 후 이 PR의 base를 main으로 변경하고 최신 코드의 충돌·빌드를 확인한다. 이 PR에서 F1의 #4 수정/이력 UI는 구현하지 않는다.

F1/DB 관리자는 #18까지 적용된 DB에 `202611250001_observation_revisions.sql`을 먼저 적용한 후 웹을 배포한다. 새 helper가 새 열과 RPC를 사용하므로 순서를 바꾸지 않는다. RPC가 schema cache에 보이지 않으면 SQL Editor에서 `notify pgrst, 'reload schema';` 후 확인한다.

원본 관찰/팀 테이블을 삭제하거나 기존 행의 작성자·작성 시각을 바꾸지 않는다. 기존 행은 version=1, updated_at/updated_by=NULL이며 migration 시점의 `baseline` snapshot만 생성한다. baseline은 과거 수정 이력이나 수정자·관찰 시각의 재구성이 아니다.

## 공개 helper — F1 #4 연결

`web/src/lib/db/observations.ts`의 기존 `saveObservation(input)` 시그니처는 유지한다. 저장 내부는 직접 INSERT+23505 재조회 대신 `create_observation` RPC로 전환했다. 기존 ObservationForm 호출은 변경하지 않는다.

`Observation`은 기존 필드와 `author_id`, `team_id`, `version`, `updated_at`, `updated_by`를 반환한다. 수정 시각은 서버 저장 시각이며 실제 관찰 시각(`observed_at`)이 아니다.

```ts
const saved = await saveObservation(input); // input.id는 최초 생성 시 한 번 발급

const request = {
  id: saved.id,
  request_id: crypto.randomUUID(), // 한 번의 수정 동작에 한 번 발급
  expected_version: saved.version,
  changes: { meal: "절반" },
};
const updated = await updateObservation(request);
const history = await listObservationRevisions(saved.id);
```

- 새로 생성하는 관찰의 input.id는 관찰 ID이자 생성 요청 ID다. 네트워크 결과가 불명확하면 **같은 ID·같은 입력**으로 재시도한다. 동일 ID의 다른 입력은 충돌이다.
- 수정 재시도는 같은 request_id·expected_version·changes를 그대로 사용한다. 새 사용자 수정 동작에만 새 UUID를 만든다. 성공 뒤 version을 최신 응답으로 교체한다.
- 성공한 수정 요청을 나중에 재시도하면 새 수정/이력을 만들지 않고 현재 행을 반환한다. 원래 생성 요청도 이후 수정 뒤에 같은 원문으로 재시도할 수 있다.
- expected_version이 오래되면 자동 덮어쓰기/재시도하지 않는다. 최신 행을 재조회하고 사용자에게 대조·재확인을 요청한다.
- changes는 기존 17개 항목 중 변경할 필드만 받는다. id·resident_id·team_id·author_id·created_at·수정 메타데이터·version 변경은 금지한다. 빈 patch, 알 수 없는 키, 문자열/null 이외 값은 거부한다. 필수/enum 값은 DB 제약으로 다시 검증한다.
- 과거 baseline 행에는 증명 가능한 최초 요청 원문이 없다. 같은 ID로 새 생성 RPC를 호출하면 충돌로 처리하고, 기존 행 재조회·수정 경로를 사용한다.

## 권한과 이력

| 대상 | 읽기/이력 조회 | 수정 RPC |
|---|---|---|
| 개인 데모 기록(team_id=NULL) | 작성자만 | 작성자만. 팀 관리자도 타인 개인 기록 수정 불가 |
| 팀 기록 | 현재 소속인 영구 로그인 사용자 | 현재 소속인 원작성자 또는 같은 팀 admin |
| 같은 팀의 다른 caregiver | 가능 | 불가 |
| 다른 팀·미소속·익명·소속 해제 | 팀 기록 접근 불가 | 불가 |

작성자 ID는 최초 값으로 보존하고 수정자는 서버가 현재 JWT의 auth.uid()로 설정한다. 역할은 DB membership에서 검사하며 요청 body의 역할을 신뢰하지 않는다. 조회 가능한 팀 기록이라도 수정 권한이 자동 부여되지는 않는다.

`observation_revisions`는 `(observation_id, version)`별 전체 행 snapshot과 action/actor_id/recorded_at/request_id를 가진다. 이력은 현재 원기록이 보이는 사용자만 읽는다. 클라이언트는 이력을 INSERT/UPDATE/DELETE할 수 없다. 일반 관찰 UPDATE/DELETE도 직접 허용하지 않는다.

기존 웹과의 짧은 호환을 위해 기존 SELECT/INSERT 권한은 유지한다. 직접 INSERT에도 서버 metadata stamp와 최초 이력 trigger를 적용하므로 version/작성 시각/수정자를 조작할 수 없다. 다만 엄격한 동일 payload 재시도 판정은 새 RPC에서 제공하며, 과거 helper를 실행 중인 이미 열린 브라우저까지 바뀌지는 않는다. 업그레이드 후 브라우저를 새로고침한다.

RPC는 고정 search_path를 사용하고 내부 함수를 클라이언트에 공개하지 않는다. 같은 actor/request 잠금과 관찰 행 잠금으로 재시도·버전 검사를 직렬화하며, 실제 수정과 이력 저장은 같은 DB transaction이다. 실패한 수정은 행·이력을 남기지 않는다. DB 관리자/service_role의 권한 자체를 제한하는 기능은 아니다.

## 오류와 화면에 필요한 추가 변경

아래는 RPC가 직접 발생시키는 오류다. Supabase Auth 만료·REST 권한 오류·네트워크 오류는 다른 code로 올 수 있으므로 별도로 처리한다. Supabase 오류의 code/message를 F1 #4에서 구분한다. 입력은 유지하고 성공 응답 후에만 저장 완료를 표시한다.

| code | message | F1 처리 |
|---|---|---|
| PT409 | IDEMPOTENCY_CONFLICT | 같은 요청 ID에 다른 내용을 보냄. 원래 결과 조회/대조. 자동 새 UUID 재저장 금지 |
| PT409 | VERSION_CONFLICT | 최신 데이터 재조회 후 사용자 재확인. 자동 덮어쓰기 금지 |
| PT403 | FORBIDDEN | 수정 권한 안내. 다른 담당자는 수정 버튼 비활성화 |
| PT404 | NOT_FOUND | 없음/보이지 않음 구분 없이 안내 |
| PT422 | VALIDATION_ERROR | 필수값·enum·허용 필드 확인 |
| PT401 | UNAUTHENTICATED | 세션 확인/로그인 |

현재 ObservationForm의 catch-all 문구는 위 오류를 구별하지 않는다. F1은 #4에서 수정 진입/확인·변경 patch·요청 UUID 유지·버전 충돌·이력 표시를 이 helper에 연결해야 한다. actor_id는 실제 Auth UUID이며 표시 이름을 임의로 생성하지 않는다. 사용자 이름 표시가 필요하면 검증된 팀 사용자 디렉터리를 별도로 연결한다.

V3의 실관찰 시각, nullable 부분 입력, 수분 정량/집계 구간, AI 승인 원문·확인 snapshot은 현재 17항목 수정 DTO에 넣지 않는다. 이번 snapshot은 DB에 실제 저장된 기존 17항목의 버전별 보존이다. 전체 V3 저장은 F1/B2와 필드·확인 UI를 맞춘 별도 migration/연결이 필요하며 과거 기록에 추정값을 채우지 않는다.

## 검증과 남은 확인

- 격리 PostgreSQL 17에서 기존 migration→가상 과거 행→신규 migration 적용, 원래 작성 시각/개인 기록과 baseline 보존 확인.
- #17·#18 기존 SQL 회귀 검사와 `supabase/tests/observation_revisions.sql` 통과. Auth/JWT는 테스트 fixture이며 실제 hosted Auth 결과가 아니다.
- 생성/수정 재시도, 다른 payload 충돌, 오래된 버전, 이후 수정 뒤 생성/수정 재시도, metadata 위조 차단, 실패 rollback, 소유자/팀 관리자/peer/다른 팀/익명/소속 해제 권한 검사 통과.
- 별도 동시 connection 검사: 동일 생성 8회→관찰 1건/이력 1건, 동일 수정 8회→수정 1회, 같은 버전 경쟁 수정 8회→1회 성공/7회 VERSION_CONFLICT. 최종 관찰 1건/version 3/이력 3건.
- helper의 RPC 인자·오류 전달·이력 정렬 assert, lint, 기본 production build 통과.
- 격리 PostgREST 16 + PostgreSQL 17과 서명된 fixture JWT로 단일 객체 응답, 생성/수정 재시도, payload/버전 충돌 HTTP 409, 이력 조회, 무인증 HTTP 401까지 확인했다. 실제 hosted Supabase Auth와는 구분한다.
- 다른 프로젝트가 기본 포트를 사용하므로 해당 프로젝트는 건드리지 않고 호스트 포트/외부 네트워크 없는 별도 임시 DB로 검증했다.
- hosted/Production migration·RPC 호출, F1 수정/이력 화면, 모바일 실기기 연동은 미검증이다. F1은 DB 적용→Preview 새로고침→생성/수정/재시도/계정별 권한을 확인하고, 실제 폰에서는 수정 입력·저장 후 새로고침·충돌 안내·이력 스크롤을 확인한다.

반복 SQL 검사는 seed가 있는 폐기 가능한 개발 DB에서 실행한다. fixture는 rollback한다.

```sh
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/observation_revisions.sql
cd web
npm run lint
npm run build
```
