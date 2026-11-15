# 관찰 기록 저장

`web/src/features/recording/ObservationForm.tsx`에서 버튼 입력과 초안 확인 후
`web/src/lib/db/observations.ts`를 통해 Supabase에 저장한다.

## 개발 프로젝트 준비

1. `supabase/migrations/202611140001_observations.sql`을 개발 프로젝트 SQL Editor에서 실행한다.
2. Supabase Authentication 설정에서 Anonymous sign-ins를 활성화한다.
3. `.env.local`의 URL은 `https://<project-ref>.supabase.co` 형식이다. `/rest/v1/`을 붙이지 않는다.
4. 개발 서버를 재시작한다.

작성자별 RLS를 적용하므로 다른 사용자의 기록은 읽거나 쓸 수 없다.
브라우저의 로그인 세션을 지우면 익명 계정의 기존 기록에 접근할 수 없으므로,
팀 공동 사용 전 영구 로그인과 팀 권한 정책으로 전환한다.
현재 resident ID는 화면의 개발용 예시 3명으로 제한한다.

## 확인 항목

- 네 항목을 선택하고 내용 확인 체크 후 저장할 수 있다.
- DB 응답 성공 후에만 저장 성공을 표시한다.
- 새로고침 후 같은 브라우저에서 기록이 다시 표시된다.
- 실패하면 입력을 유지하며 같은 요청 ID로 재시도한다.
- 입력 변경 시 확인 체크를 해제한다.
- 다른 익명 계정에서 기존 기록은 보이지 않는다.
