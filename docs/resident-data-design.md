# [B1-01] / #17 — 관찰 DB 인수와 어르신 데이터 설계

## 인수한 현재 동작

PR #34와 후속 17항목 migration을 기준으로 확인했다. `ObservationForm` →
`saveObservation` / `listObservations` → 브라우저 Supabase client 순서다.
세션이 없으면 익명 로그인하고 `author_id`는 DB의 `auth.uid()` 기본값으로 채운다.
저장 성공은 DB 응답 후 표시하며, 같은 요청 ID의 재시도는 기존 행을 조회한다.
최근 30건은 작성자별 RLS로 제한된다. 추가 13개 열은 과거 기록 호환을 위해 nullable이다.
관찰 UPDATE/DELETE 권한은 없고 세션을 잃으면 익명 기록을 다시 읽을 수 없다.

`resident-1`~`resident-3`은 현재 UI의 가상 ID다. 대시보드·변화·인계·운영의
mock을 실제 어르신 조회로 바꾸지 않았다. `observations`와 기존 helper는 변경하지 않는다.
기존 resident check와 작성자 RLS도 유지하므로 새 테이블이 생겨도 관찰이 팀에 공유되지 않는다.

## 추가 스키마와 권한

| 테이블 | 키·관계 | 권한 |
|---|---|---|
| `teams` | UUID PK, 이름 | 영구 로그인한 소속 사용자만 SELECT |
| `team_memberships` | `(team_id, user_id)` PK, teams·auth.users FK, admin/caregiver 역할 | 영구 로그인 사용자가 자기 소속만 SELECT |
| `residents` | text PK, teams FK, 이름·호실 | 영구 로그인한 같은 팀 사용자만 SELECT |

팀 사용자와 어르신 조회는 membership RLS를 통해 검사한다. 익명 세션은 membership이
잘못 등록돼도 새 디렉터리에 접근하지 못한다. 인증 JWT의 `is_anonymous=false`를 요구한다.
새 테이블의 클라이언트 INSERT/UPDATE/DELETE는 모두 차단한다. admin도 브라우저에서
자신을 승격하거나 다른 팀에 가입할 수 없다. 소속·역할·어르신 등록은 검증된 관리 작업으로만 한다.
`service_role`은 RLS를 우회하므로 비밀키를 브라우저에 넣지 않는다.

`family`는 팀 전체 조회 권한을 주지 않는다. 보호자 기능이 필요하면 별도 어르신별 관계와
RLS를 설계한다. 이 PR은 팀 내 admin/caregiver 모두에게 어르신 디렉터리 조회만 허용한다.
관찰 팀 공유, 수정·삭제, 역할별 관리 API는 아직 허용하지 않는다.

## 개발 데이터와 적용

실제 개인정보·계정·비밀번호는 포함하지 않는다. `supabase/seed.sql`은 현재 mock과 같은
가상 어르신 세 명 및 가상 개발팀만 추가한다. 재실행은 기존 값을 덮어쓰지 않는다.
사용자나 membership을 자동 생성하지 않으므로 seed 후에도 미소속 사용자는 0건을 본다.
개발 프로젝트에서 영구 로그인 계정을 만든 후 SQL Editor의 신뢰된 관리 세션으로만 등록한다.

```sql
-- <영구 로그인 사용자 UUID>를 개발용 auth.users.id로 바꾼 뒤 실행한다.
insert into public.team_memberships (team_id, user_id, role)
values ('00000000-0000-4000-8000-000000000017', '<영구 로그인 사용자 UUID>', 'caregiver');
```

1. 별도 개발 DB에서 기존 두 migration을 시간순으로 적용한다.
2. `202611190001_team_resident_foundation.sql`을 적용한다. 기존 DB는 새 파일만 적용한다.
   한 transaction으로 새 테이블·RLS를 함께 만든다. 기존 행 수정·삭제는 없다.
3. 개발 DB에만 `supabase/seed.sql`을 실행한다. Production에 seed를 자동 적용하지 않는다.
4. disposable 개발 DB에서 아래 회귀 검사를 실행한다. 테스트는 fixture를 rollback한다.

```sh
psql "$DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/team_resident_foundation.sql
```

배포 적용은 #24와 리뷰 후 수행한다. 실패한 migration은 transaction 전체가 rollback된다.
적용 이후 되돌려야 하면 우선 앱 변경 없이 이 추가 테이블을 유지한다. 데이터가 생긴 테이블을
자동 삭제하거나 이전 migration 파일을 고쳐 재실행하지 않는다.

## #18에서 할 전환 순서

1. 영구 팀 데모 로그인·소속 확인과 resident 조회를 먼저 연결한다. 다른 팀·미소속·익명
   접근을 검사하고 새로운 팀 어르신 ID는 UUID 문자열로 발급한다. legacy text ID는 유지한다.
2. 기존 관찰의 ID와 새 디렉터리 매핑을 점검한다. 익명 세션 기록을 임의로 팀에 귀속하거나
   작성자를 바꾸지 않는다. 미매핑 행은 보존하고 별도 이관 결정을 받는다.
3. 모든 resident 매핑 확인 후 `observations.resident_id`에 FK를 추가·검증하고 기존 3개 ID
   check를 교체한다. 현재 PR은 FK를 추가하지 않아 seed 없이도 기존 저장이 동작한다.
4. 관찰 INSERT에 같은 팀 membership 검사를 추가하고 팀 조회 범위는 API 계약·리뷰로 확정한다.
   기존 permissive SELECT 정책을 남겨 새 정책과 OR로 합쳐지는 실수를 피한다.
5. 브라우저 save/reload, 두 계정 격리, 다른 팀 거부를 확인한 후 UI를 전환한다.
   이 전환 전에는 새 테이블의 membership을 관찰 권한으로 설명하지 않는다.

#19의 수정 이력·중복 저장 강화, #44의 실제 Production RLS 검증은 별도 범위다.

## 검증 결과와 범위

### 자동 검증 — 2026-11-19

- `cd web && npm ci`, `npm run lint`, `npm run build`: 성공.
- 일회용 PGlite PostgreSQL에서 기존 두 migration → 기존 가상 관찰 저장 → 새 migration:
  기존 관찰의 모든 열 값 유지 확인. seed 없는 상태의 익명 저장·재조회도 성공.
- seed 두 번 적용: 세 어르신만 유지. SQL 회귀 검사: 같은 팀 조회, 다른 팀 차단,
  미소속·익명 차단, 자기 소속 등록·승격·어르신 생성 거부, 기존 관찰 작성자 위조 차단,
  작성자 격리 및 테스트 rollback 성공.
- PGlite의 `auth.users`·`auth.uid()`·`auth.jwt()`는 Supabase 동작을 재현한 테스트
  fixture다. 이 결과만으로 실제 Supabase Auth/JWT 또는 브라우저 동작을 검증했다고
  해석하지 않는다.

### 사용자 직접 로컬 검증 보고 — 2026-11-20

- 최초 확인 과정에서 Docker daemon 중지와 환경변수 파일 위치 문제로 브라우저 저장이
  실패했다. Docker와 로컬 Supabase를 다시 실행하고 환경변수를 `web/.env.local`에
  배치한 뒤 처음부터 다시 확인했다.
- 사용자는 로컬 Supabase에서 migration·seed 적용 후 `teams` 1건과 `residents` 3건을
  확인하고 제공된 SQL 권한 검사를 실행했으며, 오류가 없었다고 보고했다.
- 사용자는 로컬 앱에서 가상 관찰 저장, 새로고침 후 재조회, 시크릿 창에서 기존 익명
  기록이 보이지 않는 것을 직접 확인했다고 보고했다.
- 위 브라우저 결과는 사용자의 직접 보고이며 PR 작성자나 리뷰 자동화가 같은 화면을
  독립적으로 재현·관찰한 결과는 아니다. 초기 실패 보고를 성공 근거로 사용하지 않는다.

### 아직 검증하지 않은 범위

- 팀이 함께 사용하는 hosted Supabase 및 Production DB에 이 migration을 적용하지 않았다.
- Vercel Production의 저장·새로고침·다른 세션 격리와 실제 RLS 결과는 검증하지 않았다.
- 모바일 실기기에서 저장·조회·권한 동작을 검증하지 않았다.
- 따라서 로컬 사용자 보고를 Production 완료로 확대 해석하지 않는다. Production 검증은
  #44, 배포·복구 절차는 #24에서 별도로 수행한다. 지정 리뷰와 최종 merge 전에는 #17을
  완료로 간주하지 않는다.
