# B2-03 입력 검증·템플릿 미리보기 — 2026-11-21

이번 작업은 `docs/api.md` 4–5절의 입력 형식과 템플릿 기반을 준비하는 **로컬 개발 단계**다. 앱에서 import하지 않으며 `/api/drafts`, AI 공급자, 음성 API, DB 저장을 연결하지 않았다. #27 완료나 Production 기능으로 표시하지 않는다.

## 구현한 범위

- 17개 관찰 키, 현재 enum 및 명시적 null, revision, 대상 ID 형식, 실제 관찰 시각, 원문 길이를 검사한다. 시간대 없는 시각·잘못된 날짜·미래 시각·알 수 없는 키를 거절한다.
- 수분 사건량/일합계/18시 누적량, mL 0/null, KST 구간과 집계 완료 여부를 구분한다. 범주로 수치를 추정하거나 사건을 합산하지 않는다.
- 모든 항목을 정해진 한국어 문구로 표시한다. 미관찰·미확인·미실시·해당 없음·거부를 보존하며 이동 도움과 휘청거림 관찰을 구분한다.
- 확인된 추가 관찰 원문은 그대로 별도 표시한다. 텍스트에서 수치를 추출해 구조화 필드에 확정하지 않는다. 반환한 입력 snapshot은 호출자의 입력 객체를 수정하지 않는다.
- 미리보기는 `requires_confirmation: true`를 반환한다. 이 표시는 실제 사용자의 확인이나 저장 완료를 뜻하지 않는다.

`previewTemplateDraft(value, now)`는 내부 미리보기 함수이고 HTTP 성공 응답이 아니다. 실제 공급자 실패가 발생하지 않았으므로 `fallback_reason`을 만들어 붙이지 않는다. `now`는 이후 서버가 전달해야 한다.

## 연결 전에 남은 작업

1. [#27 공급자 확인 질문](https://github.com/jaehjung0102/careit/issues/27#issuecomment-7059058399)에 따라 팀의 문장 생성·음성 서비스와 설정 방법을 확인한다. 개인 계정이나 다른 프로젝트의 키를 대체 사용하지 않는다.
2. 원문과 선택값 간 명확한 모순 검사 및 LLM 출력 사실 보존 검사를 추가한다. **현재 검증은 입력 형식/시각 검사이며 의미 모순 검사가 아니다.** 모순된 원문도 이 미리보기에는 그대로 보일 수 있으므로 완성된 생성 서비스로 연결하면 안 된다.
3. B1과 서버 인증/대상 접근 검증을 연결하고, 설정 미준비는 503으로 처리한다. 템플릿으로 권한 오류를 숨기지 않는다.
4. 실제 공급자 호출 뒤 timeout/provider_error/invalid_output에만 템플릿 대체를 적용한다. API 응답에는 계약의 revision·mode·fallback_reason을 포함한다.
5. F1 #3과 원문 확인→초안 검토→입력 수정 시 revision 증가/재확인 흐름을 연결한다. 화면에서는 원문·초안을 HTML 또는 Markdown으로 실행하지 않고 일반 텍스트로 표시한다. 실패 시 입력을 유지하고 늦은 이전 revision 응답을 버린다.
6. 음성 파일 형식·상한·브라우저/기기·실패 흐름을 확정하고, 실제 저장 경로까지 별도로 검증한다.

## 로컬 검증

앱 의존성을 설치한 `web/`에서 기존 TypeScript와 Node 내장 테스트 도구를 사용한다. 새 의존성을 추가하지 않는다. 아래 임시 출력 폴더는 저장소 밖에 둔다.

```sh
build_dir=$(mktemp -d)
node node_modules/typescript/bin/tsc --strict --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --outDir "$build_dir" src/lib/ai/drafts/_tests/*.ts
node --test "$build_dir/_tests/"*.test.js
```

이 테스트는 가상의 입력에 대한 내부 함수 검증이다. 서비스 모델의 품질, 실제 마이크, 인증/RLS, UI 입력 보존, Production 동작 또는 전체 업무 시간은 검증하지 않는다.
