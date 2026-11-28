# [B1-04] 비교용 가상 기록·권한 검사 — #20

기준: `docs/issue-assignments.md`의 #20. #18(PR #61) → #19(PR #64)에 이어지는 테스트 작업이다. 운영 migration·기본 seed·화면은 바꾸지 않는다. 선행 변경을 중복 리뷰하지 않도록 PR base는 #64 브랜치로 두며, #61 → #64 반영 후 `main` 기준으로 정리한다.

## 가상 데이터와 계산 재현

단일 원본은 `supabase/tests/fixtures/comparison.json`이다. 실제 개인정보 없이 가상 어르신 3명, 두 팀, 사용자 6명, 관찰 15건을 제공한다. 개인 기록의 `resident-1`은 기존 개발용 식별자다. 아침·점심·저녁, KST 자정과 UTC 표기, 11/22~11/28 비교 기간, 기간 밖 기록을 포함한다. 평가 시각은 **2026-11-29 18:00 KST**로 고정한다.

| 사례 | 식사 | 수분 |
|---|---|---|
| 기본 비교 | 현재 50%, 과거 5일 평균 90%, 차이 -40%p | 현재 650mL, 과거 5일 평균 900mL, 차이 -250mL |
| 변화 없음 | 차이 0%p | 차이 0mL |
| 실제 0 | 0% 그대로 비교 | 0mL 그대로 비교 |
| 미확인·유효 3일 미달 | null/자료 부족 보존 | null/자료 부족 보존 |
| 조건 불일치 | 끼니·관찰 시각 없음, 범위형 legacy 환산 금지 | 사건량·음수·다른 cutoff·미완료·종료 이전 구별 |
| 근거 범위 | 당일·기간 밖·다른 어르신 제외, 중복 날짜 한 번만 채택 | 동일 원칙, 같은 완료 누적 구간만 비교 |

`cases`의 `current_patch`는 각 상태를 재현하는 **테스트 변형**이며 DB에 저장된 수정/승인 기록을 뜻하지 않는다. 같은 날짜의 동일 값 중복은 B2 #28의 현재 정책(한 번 채택)을 검증한다. 이 정책의 제품 최종 확정은 B1/F1/B2 통합 리뷰에서 필요하다.

## Supabase 소유권 없이 SQL 검사

Docker Desktop을 켜고 저장소 루트에서 실행한다. Python 3과 Docker만 필요하며 Supabase 계정·원격 프로젝트 키·로컬 `.env`는 사용하지 않는다.

```sh
python3 supabase/tests/check_comparison.py
```

고정 버전 Supabase PostgreSQL 이미지로 외부 포트·외부 네트워크가 없는 새 임시 컨테이너를 만들고, 저장소 전체 migration/seed → 기존 3종 검사 → #20 검사를 실행한다. 이미지가 없으면 Docker가 이미지를 내려받는다. 기존 Supabase 컨테이너·DB는 건드리지 않는다. 각 검사는 롤백하며 잔여 데이터가 없는지 확인한 뒤 임시 컨테이너를 제거한다. Docker를 시작/종료하는 기능은 포함하지 않는다.

검사는 `auth.uid()`/`auth.jwt()`에 검증된 JWT claim을 SQL로 주입하는 방식이다. **실제 RLS·RPC·트리거를 실행하지만 로그인 서버나 토큰 서명을 검증하는 테스트는 아니다.** 테스트 전용 Auth 함수는 임시 컨테이너에서만 생성한다.

| 사용자/동작 | 기대 결과 |
|---|---|
| 작성자 | 본인 개인 기록과 소속 팀 공유 기록 읽기 |
| 같은 팀 caregiver/admin | 팀 공유 기록 읽기, 다른 작성자의 개인 기록 차단 |
| 다른 팀·미소속 | 대상 팀 기록과 수정 이력 차단 |
| 익명 사용자(잘못 등록된 팀 멤버십 포함) | 본인 개인 기록만 허용, 팀 자료 차단 |
| JWT의 익명 여부 누락 | 팀 자료 차단 |
| author_id 위조·다른 caregiver의 수정 | 차단 |
| 멤버십 해제 | 본인이 작성한 팀 기록·이력도 즉시 차단, 개인 기록 유지 |
| 미인증 DB role | 관찰 조회 차단 |
| 같은 관찰 수정 2버전 | 논리 관찰 1건, 이력 2건; 과거 관찰 2건으로 세지 않음 |

`comparison_fixtures.sql`은 fixture JSON을 읽어 **현재 DB가 실제 지원하는 항목만** 저장한다. `observed_at`, `water_measurement`, `walking_observation`은 임시 테스트 메타데이터이며 운영 스키마에 추가하거나 `created_at`으로 위장하지 않는다. 수분 범주 값은 `미확인`으로 저장하며 mL를 역추정하지 않는다.

## 실제 B2 계산 코드로 검사

`web`에서 `npm ci`로 기존 개발 의존성을 설치한다. #28/PR #63은 아직 별도 브랜치이므로 그 소스를 임시 디렉터리로 읽어 검사한다. B2 소스는 수정하거나 이 PR에 복사하지 않는다. 아래 명령은 저장소 루트 기준이다.

```sh
(cd web && npm ci)
git fetch origin feat/b2-04-meal-comparison
b2_fixture_dir=$(mktemp -d)
git archive origin/feat/b2-04-meal-comparison web/src/lib/analytics | tar -x -C "$b2_fixture_dir"
COMPARISON_WEB_DIR="$b2_fixture_dir/web" node --test supabase/tests/comparison-calculations.cjs
rm -rf "$b2_fixture_dir"
```

#63이 현재 브랜치에 통합된 뒤에는 `node --test supabase/tests/comparison-calculations.cjs`만 실행한다. 계산 파일이 없거나 컴파일/검사가 실패하면 실패로 종료하며 건너뛰지 않는다. 기존 TypeScript 컴파일러를 사용하며 새 npm 의존성은 없다.

## 검증 결과와 추가 연결 사항

2026-11-29에 PostgreSQL 17.12의 전체 migration과 SQL 검사 4종, B2 계산 소스 `1c64e98` 기반 검사 18개, `npm run lint`, 기본 `npm run build`가 통과했다. fixture 롤백·임시 컨테이너 제거도 확인했다. 별도 임시 DB에서 관찰 RLS를 일부러 해제했을 때 새 검사가 의도대로 실패하는지도 확인했다.

이 결과는 **가상 계산 재현과 DB 권한 검사 완료**이며 운영 비교 API 연결 완료는 아니다. 다음은 F1/B2와 함께 통합해야 한다.

1. 실제 `observed_at`, 수분 정량·집계 기간·완료 여부, 최신 승인 원본의 저장 계약. DB version만으로 AI 승인을 간주하거나 `created_at`/`updated_at`을 관찰 시각으로 쓰지 않는다.
2. #63의 `ComparisonRepository` 실제 DB 어댑터: 요청 사용자 RLS로 현재 관찰과 `historyWindows` 합집합의 **모든 페이지**를 일관된 snapshot에서 읽고 접근을 재검사한다. 최근 30건 조회나 수정 이력 배열을 비교 자료로 재사용하지 않는다. 부분 조회는 성공으로 처리하지 않는다.
3. `/api/changes`와 F2 화면의 실제 연결 후 사용자별 근거·단위·자료 부족·실패 재시도 확인. `data_source: mock`인 이 fixture를 운영 성공 응답의 대체 자료로 쓰지 않는다.
4. 선행 PR #61/#64와 #63의 merge·DB 적용·배포는 조장 리뷰가 필요하다.

#20 자체는 UI를 변경하지 않아 사용자 모바일 재검증은 필요 없다. 실제 비교 화면 통합·배포 후에는 팀 로그인, 다른 사용자 격리, 표시 수치와 근거, 작은 화면에서의 표시를 확인한다.
