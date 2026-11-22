# [B1-02] / #18 — 팀 로그인·어르신 조회·관찰 저장

## 구현과 데이터 범위

- `/team`: 관리자에게 발급받은 이메일/비밀번호로 Supabase 영구 로그인. 공개 회원가입이나 팀 가입/권한 변경 기능은 제공하지 않는다.
- 소속 팀·역할과 `residents`를 실제 Supabase에서 조회한다. 실패·소속 없음·어르신 없음은 별도 표시하며 mock 목록으로 대체하지 않는다.
- 같은 팀의 `admin`과 `caregiver`는 팀의 어르신·관찰 기록을 조회하고 자기 이름으로 새 기록을 작성한다. 둘 다 관찰 수정/삭제 권한은 없다. 보호자는 팀 소속 역할로 등록하지 않는다.
- 계정/팀 전환 시 기존 기록 폼을 새로 만들고 로그아웃 시 기록·디렉터리를 제거한다. 로그인 상태와 실제 권한은 구분하며 최종 접근 제어는 DB RLS가 담당한다.
- `/recordings`: 기존 개인 데모 경로. 익명 로그인·작성자별 저장을 유지한다. 팀 화면 이동 링크를 제공한다.
- 기존 개인 기록의 `team_id`는 NULL로 남는다. 같은 가상 어르신 ID라고 팀에 자동 공유하거나 작성자를 바꾸지 않는다.

## DB와 호출 계약

| 호출/필드 | 동작 |
|---|---|
| `loadTeamDirectory()` | 현재 세션의 소속(팀 이름/역할)과 접근 가능한 `Resident[]` 반환. 익명 로그인 자동 생성 없음 |
| `Resident` | `id`, `team_id`, `name`, `room`. 서버 디렉터리 값 사용 |
| `ObservationInput.team_id` | 팀 화면에서 필수로 전달. 개인 데모는 생략 |
| `listObservations(teamId)` | 해당 팀의 최근 30건, 작성 시각 내림차순. 전체 집계 API 아님 |
| `listObservations()` | `team_id IS NULL`인 자기 개인 기록 30건 |
| 팀 기록 SELECT | 영구 로그인한 현재 소속 사용자만. 소속 해제 후에는 자기 작성 행도 읽지 못함 |
| 팀 기록 INSERT | 작성자는 `auth.uid()`이고 현재 소속 팀이어야 함. `(team_id, resident_id)` FK로 팀과 어르신 일치 강제 |
| 개인 기록 INSERT | 기존 가상 `resident-1/2/3`만 허용. 다른 실제 어르신 ID를 NULL team_id로 넣을 수 없음 |

신규 migration은 기존 resident-ID check를 팀/어르신 복합 FK와 INSERT 정책으로 대체한다. NULL team_id의 과거 기록은 FK 검증을 통과하며 변경하지 않는다. 기존 permissive 정책은 남겨 OR로 우회되지 않게 교체한다. 익명 사용자는 소속이 잘못 등록돼도 팀 데이터에 접근하지 못한다.

기존 17항목 및 요청 UUID 재시도 저장 helper를 재사용한다. `observed_at`, 부분 관찰 null, 승인 snapshot·수정 이력, 엄격한 payload 재시도 검사는 이 PR에서 구현하지 않았으며 #19 및 F1/B2 연결 후속 범위다. 현재 `created_at`은 저장 시각이다. 음성/AI 원문을 저장했다고 표시하지 않는다. 변경 API·인계 어댑터도 이 PR의 범위가 아니다.

## 적용 순서 — F1/DB 관리자

1. 배포 전, 대상 프로젝트에 기존 세 migration이 적용됐는지 확인한다.
2. `supabase/migrations/202611220001_team_observations.sql`을 적용한다. 새 웹 코드의 개인 기록 조회도 `team_id`를 사용하므로 **DB 먼저, 웹 배포는 다음**이다. 로컬에서는 저장소 루트에서 `npx supabase migration up`으로 적용한다. 원격 적용은 F1이 대상 프로젝트를 확인한 뒤 수행한다.
3. 로컬/폐기 가능한 개발 DB에만 `supabase/seed.sql`을 적용한다. Production에 seed를 자동 적용하지 않는다. hosted 시연 데이터는 관리자가 검토한 가상 데이터만 준비한다.
4. Supabase Authentication의 사용자 관리에서 네 명 각각의 시연 계정을 생성·이메일 확인 처리한다. 비밀번호는 각자에게 안전하게 전달하고 저장소/Issue에 게시하지 않는다. 공개 가입은 필요하지 않다.
5. 아래 SQL의 UUID를 실제로 생성한 팀·사용자 ID로 바꿔 신뢰된 관리자 세션에서 실행한다. `F1 admin / 나머지 caregiver`는 시연 예시이며 최종 역할은 F1이 확인한다.

```sql
begin;
insert into public.teams(id, name) values ('<TEAM_UUID>', '가상 시연팀');
insert into public.residents(id, team_id, name, room) values
  (gen_random_uuid()::text, '<TEAM_UUID>', '가상 어르신 A', '201호'),
  (gen_random_uuid()::text, '<TEAM_UUID>', '가상 어르신 B', '203호'),
  (gen_random_uuid()::text, '<TEAM_UUID>', '가상 어르신 C', '205호');
insert into public.team_memberships(team_id, user_id, role) values
  ('<TEAM_UUID>', '<F1_AUTH_USER_UUID>', 'admin'),
  ('<TEAM_UUID>', '<F2_AUTH_USER_UUID>', 'caregiver'),
  ('<TEAM_UUID>', '<B1_AUTH_USER_UUID>', 'caregiver'),
  ('<TEAM_UUID>', '<B2_AUTH_USER_UUID>', 'caregiver');
commit;
```

기존 팀·어르신이 이미 있으면 새로 생성하지 말고 그 ID로 소속만 등록한다. 가입 요청의 역할이나 사용자 메타데이터를 권한 근거로 사용하지 않는다. `service_role`/DB 비밀번호는 브라우저 설정에 추가하지 않는다.

웹 환경변수는 기존 `web/.env.local`의 Project URL과 publishable key 두 개를 사용한다. 환경변수를 바꾸면 dev 서버를 재시작한다. DB 적용에 실패하면 transaction 전체가 rollback된다. 적용 후 웹 롤백이 필요하면 기존 웹 버전을 사용하고 추가 schema/기록은 보존한다. 팀 기록이나 테이블을 자동 삭제하지 않는다.

## 검증 결과

- PR #56 수정본은 별도 재리뷰 후 승인했다. 이 브랜치는 현재 main의 버튼 폼에 resident 목록/team ID props만 추가하며 음성 로직을 복제하지 않는다. #56이 먼저 병합되면 최신 main 반영·충돌/빌드를 재확인해야 한다.
- `npm run lint`, 기본 `npm run build`: 통과.
- PGlite에서 전체 migration + 기존 foundation SQL 검사 + 신규 팀 관찰 SQL 검사: 통과. Auth는 fixture이며 실제 로그인 결과와 구분한다.
- 실제 로컬 Supabase에 신규 migration을 적용했다. 네 영구 시연 계정으로 비밀번호 로그인·실제 디렉터리·자기 팀 저장·다시 로그인 후 공유 기록 조회를 검증했다.
- 다른 팀/미소속/익명 접근 거부, 작성자 위조 거부, 팀/어르신 FK, 소속 해제 후 작성자 접근 제거, 기존 익명 저장·개인 기록 비공유를 실제 로컬 Auth/RLS에서 assert로 검증했다.
- 로컬 브라우저에서 관리자 로그인→실제 디렉터리→17항목 저장→새로고침 유지→로그아웃 후 데이터 제거→잘못된 비밀번호 안내→caregiver 로그인과 같은 팀 공유 기록 표시를 직접 확인했다.
- 로컬 fixture 계정/가상 행은 검증용으로 남겼다. 테스트 비밀번호와 관리자 키는 Git·Issue에 포함하지 않았다.
- hosted/Production의 신규 migration·네 실제 팀 계정·모바일 실기기는 미검증이다. 기존 #44 Production 격리 결과와 이번 팀 공유를 혼동하지 않는다.

## 반복 검사 및 수동 확인

폐기 가능한 개발 DB에서 전체 migration과 seed 후 실행한다. 두 파일은 fixture를 rollback한다.

```sh
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/team_resident_foundation.sql
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/team_observations.sql
cd web
npm run lint
npm run build
```

F1은 hosted 시연 계정 네 개를 설정한 Preview에서 팀 조회·공유 저장·다시 로그인·다른 팀 차단을 재확인한다. 사용자는 휴대폰에서 로그인 입력/키보드, 어르신 선택과 기록 버튼, 화면 잘림, 새로고침·로그아웃을 확인한다. PR #56의 실제 마이크 허용/거부·중지·이어 녹음·재녹음·화면 종료 후 마이크 꺼짐도 별도 실기기 검사다. 직접 테스트하지 않은 결과는 완료로 기록하지 않는다.
