# B2-03 초안 HTTP 연결 경계 — 2026-11-22

`POST /api/drafts`는 `docs/api.md` 3·5절의 응답 형식으로 내부 초안 생성기를 감싼다. **실제 앱에는 인증·대상 접근·AI 공급자를 아직 연결하지 않았다.** 현재 라우트의 성공을 시연하거나 #27 완료로 처리하지 않는다.

## 현재 앱 동작

- Bearer 헤더 없음/잘못된 형식: 401 `UNAUTHENTICATED`.
- Bearer 형식이 있어도 의존 서비스가 미연결이면 503 `DEPENDENCY_NOT_READY`. 토큰을 검증했다는 뜻이 아니며 mock 초안을 반환하지 않는다.
- 성공과 오류 JSON에 `Cache-Control: no-store`를 붙인다. 생성은 200이며 저장/승인을 수행하지 않는다.
- POST 이외 메서드는 Next.js의 기본 405 처리이며 OPTIONS는 프레임워크가 제공한다.

## 실제 서비스를 연결한 뒤의 순서

1. `authenticate(token)`: B1의 서버 인증으로 토큰을 검증하고 사용자 ID를 반환한다. 단순 JWT decode, 요청 본문의 사용자/역할/팀 ID로 대체하지 않는다.
2. JSON 형식과 입력을 확인한다. 알 수 없는 입력 키는 400, 필수값/선택값/시각/명확한 원문 모순은 422와 필드 경로를 반환한다. 본문을 읽고 오류를 노출하기 전에 인증한다.
3. `authorizeResident(actor, residentId)`: 현재 사용자의 대상 접근 및 초안 생성 권한을 검사한다. 보이지 않거나 없는 대상은 404, 볼 수 있으나 작성 권한이 없으면 403이다.
4. `generateDraft`: 20개 사실에 대한 허용 문구 검사와 원문 보존, 10초 공급자 제한, timeout/provider_error/invalid_output 템플릿 대체를 적용한다. 내부 구현과 한계는 `web/src/lib/ai/drafts/README.md`를 참고한다.
5. 200 응답은 입력 revision, 대상 ID, 생성 방식, 대체 이유와 `requires_confirmation: true`를 유지한다. F1 화면은 현재 입력과 일치하는 응답만 보여주고, 원본과 초안을 사람이 확인해야 한다. 이 경로에는 DB 저장 기능이 없다.

## 어댑터와 오류

`createPostDraft(dependencies)`의 `DraftHttpDependencies`가 서버 전용 연결점이다. `authenticate`, `authorizeResident`, `provider`가 모두 필요하며 `now`와 `timeoutMs`는 서버 설정/시험용이다. 실제 앱의 `route.ts`에는 아직 인자를 전달하지 않는다.

인증/접근 어댑터는 알려진 실패를 `_lib/http.ts`의 `DraftHttpError`로 변환한다. 원래 오류 메시지를 그대로 전달하지 않는다.

| 코드 | HTTP | 처리 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 세션 재확인 |
| `FORBIDDEN` / `NOT_FOUND` | 403 / 404 | 생성 중단, 입력 유지 |
| `RATE_LIMITED` | 429 | `Retry-After` 초와 `retryable: true` |
| `SERVICE_UNAVAILABLE` | 503 | 재시도 가능 |
| `DEPENDENCY_NOT_READY` | 503 | 설정 준비 필요, 자동 재시도 대상으로 표시하지 않음 |
| 알 수 없는 예외 | 500 `INTERNAL_ERROR` | 일반 메시지, 토큰/원문/stack/상위 서비스 오류 내용 비노출 |

429 응답 변환은 준비되어 있으나 실제 호출 빈도 제한 서비스는 미연결이다. 공급자 장애는 검증된 입력에서 템플릿으로 대체하지만 인증/권한/설정/입력 오류는 성공으로 숨기지 않는다. Provider JSON 파싱, 호출 취소 신호, 인증/권한, 비용/요청 제한은 실제 어댑터 연결 시 검증해야 한다.

## 확인한 범위와 남은 작업

테스트는 가상 계정/서비스로 HTTP factory와 내부 생성기를 실행한다. 빈 인증·가짜 공급자는 `_tests`에만 있으며 실제 route에 연결하지 않는다. 실제 Supabase 인증/RLS, 외부 AI 모델 품질, F1 화면 입력 보존/재확인, B1 최종 snapshot 저장, 휴대폰/Production 전체 흐름을 검증한 것은 아니다.

2026-11-22 확인: #27 공급자 질문에 답변 없음. F1 PR #56은 브라우저 SpeechRecognition과 mock 초안이며 아직 미병합이고 실제 AI 제공업체는 후속 사항으로 명시했다. 팀 설정을 재사용한다는 사용자 결정은 유지하며 별도 키/모델을 임의로 설정하지 않는다.

남은 연결: 팀 공급자/모델/서버 설정 확인 → B1 인증·대상 권한 어댑터 → 실제 공급자·HTTP 성공/실패 검증 → F1 원문/revision/재확인 및 B1 저장 연결 → 교차 리뷰·F1 merge·배포 확인.

`web/`에서 기존 TypeScript/Node 도구로 두 계층을 함께 검사한다.

```sh
build_dir=$(mktemp -d)
node node_modules/typescript/bin/tsc --strict --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --rootDir src --outDir "$build_dir" src/lib/ai/drafts/_tests/*.ts src/app/api/drafts/_tests/*.ts
node --test "$build_dir/lib/ai/drafts/_tests/"*.test.js "$build_dir/app/api/drafts/_tests/"*.test.js
```
