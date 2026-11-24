# B2-03 · B1/F1 연결 점검 — 2026-11-25

이 문서는 현재 코드의 연결점과 남은 합의를 정리한다. 새 API 계약이나 담당자 배정의 확정이 아니다. OpenAI는 사용자 승인 키로 가상 사례 3건의 실제 호출을 확인했으나 실제 인증·저장·화면 통합 결과로 사용하지 않는다.

## 확인한 버전

- B2 Draft PR [#59](https://github.com/jaehjung0102/careit/pull/59): `497b361`의 입력·출력/client 검증과 시각 리뷰 수정 위에 OpenAI 어댑터를 추가했다. 기반 main은 `70498c0`이며 main 변경은 PR #60의 모바일 대시보드 배치다.
- B1 PR [#61](https://github.com/jaehjung0102/careit/pull/61): `9d4d3b1`, 팀 로그인·어르신 조회·팀 관찰 저장. 검토 시점에 Open이며 main에 미반영이다.
- F1 PR [#56](https://github.com/jaehjung0102/careit/pull/56): `f0af7ff`, 음성 입력·mock 초안 검토. B1 승인 후에도 main에는 미반영이다.
- #61과 #56은 읽어서 비교했으며 B2 작업 브랜치에 병합하지 않았다. 이 문서는 두 PR의 승인이나 실제 통합 검증이 아니다.

## 연결 지점과 남은 작업

| 단계 | 현재 코드 | B2 연결에 필요한 것 |
|---|---|---|
| 로그인 | #61 `TeamWorkspace.tsx`의 `signInWithPassword`, 계정 전환·로그아웃 | F1은 현재 세션의 access token을 B2 `requestDraft(input, token)`에 전달. 서버는 별도로 토큰과 현재 권한을 검증 |
| 대상 선택 | #61 `loadTeamDirectory()` → `Resident { id, team_id, name, room }` | 표시 이름이 아닌 실제 `resident.id`를 `observation.resident_id`로 사용. 화면 목록에 있다는 사실만으로 API 접근을 허용하지 않음 |
| 입력 작성 | #61 `ObservationForm`의 17개 선택값; #56 음성 원문은 패널 내부 상태 | F1이 전체 `DraftInput`과 수정 revision을 전달. `observed_at`, 미관찰 null, 정확한 수분/기간, 별도 보행 관찰, 확인한 원문을 누락 없이 수집 |
| 서버 인증 | B2 `DraftHttpDependencies.authenticate(token)` 경계만 구현 | B1과 실제 서버 어댑터의 담당·경로·호출 계약을 확정. PR #61은 이 함수를 제공하지 않음 |
| 대상 권한 | B2 `authorizeResident(actor, residentId)` 경계; #61 DB에는 팀 소속 정책 | 검증한 사용자로 현재 소속·대상·작성 권한 검사. 보이지 않거나 없는 대상 404, 보이지만 작성 불가 403. 실제 서버 연결 필요 |
| 초안 생성 | B2 OpenAI Responses/20개 사실 검사/시간 제한/대체 + 실제 가상 사례 3건 통과; #56 화면은 mock | `createOpenAIPostDraft`에 B1의 실제 인증/대상 권한을 전달. 팀 배포 설정과 제한 문구/자유 서술 범위 합의 |
| 사람 확인 | B2 `review-state.ts`; #56은 원문과 초안 직접 수정 UI | 전체 입력 변경 시 revision 증가·승인 취소. 직접 초안 수정은 현재 B2 helper가 지원하지 않으므로 아래 방식 합의 필요 |
| 저장 | #61 `saveObservation(ObservationInput)`은 평평한 17항목과 team ID 저장 | 승인한 `{ input_revision, observation, approved_text }`의 새 저장 계약은 B1 #19/F1/B2 후속. 기존 함수에 그대로 전달하지 않음 |

## 구체적으로 보존해야 할 차이

- `/api/drafts` 요청 최상위는 `input_revision`, `observation` 두 키다. #61 저장용 `team_id`를 초안 요청에 임의로 추가하면 400이다. 서버는 대상과 현재 사용자로 팀 권한을 확인한다. 계약 변경이 필요하면 먼저 합의한다.
- B2의 17개 `fields`는 각 키가 존재하며 미관찰은 명시적 null이다. #61 폼은 현재 모든 선택을 요구하고 저장 타입은 문자열이다. null을 `미실시`, `없음`, 정상값으로 바꾸어 맞추지 않는다.
- `created_at`은 저장 시각이고 `observed_at`은 관찰 시각이다. 기존 저장 시각으로 관찰 시각을 대신 만들지 않는다.
- 수분 범주 `적음/보통/충분`으로 mL나 집계 완료 여부를 추정하지 않는다. 사건량과 동일 기간 누적량은 별개다. 보행 도움 수준으로 휘청거림을 추정하지 않는다.
- #61은 원문·승인 문장·revision·수분 정량/구간을 저장하지 않는다. 서버 확인자/확인 시각은 클라이언트가 만들어 넣지 않는다. B2 helper의 확인 상태는 저장 성공이나 서버 확인 증명이 아니다.
- #61 `listObservations(teamId)`는 저장 시각 기준 최근 30건이다. 이를 B2-04의 관찰 시각/동일 기간 비교 자료 전체로 간주하지 않는다.

## 권장 연결 순서 — 팀 합의 필요

1. **B1 ↔ B2: 인증·대상 권한 어댑터.** 현재 두 callback을 유지하는 안을 제안한다. B2는 HTTP 오류 변환과 연결을 맡고, B1과 검증된 사용자/팀 권한의 실제 구현 담당을 정한다. 브라우저용 `createClient()`나 `loadTeamDirectory()`를 서버 인증으로 재사용하지 않는다. 사용자 토큰/DB client 문맥은 요청마다 격리하며 전역 변경 변수에 보관하지 않는다. 현재 `DraftActor`는 `{ id }`뿐이므로 RLS용 사용자 문맥 전달 방식도 함께 정한다.
2. **F1 ↔ B2: 전체 입력과 검토 상태.** `selectedSummary`, 이름, 승인 flags 대신 전체 DTO/원문/revision을 연결한다. 우선 입력 수정 → 재생성 → 재확인 방식을 제안한다. #56처럼 최종 문장을 직접 수정하려면 편집 원문·검증·저장 계약을 먼저 확장한다. 녹음 중/종료 처리 중 생성·확인·저장 차단은 유지한다.
3. **B1 #19 ↔ F1/B2: 승인 snapshot 저장.** 저장 함수/경로·담당·반환값·오류·같은 요청 재시도 규칙을 확정한다. 같은 revision의 원본과 최종 문장을 저장하고, 저장 후 새로고침·다시 로그인해 동일하게 재조회되는지 확인한다. 로그인/팀 변경 시 과거 요청·확인 상태도 폐기한다.
4. **F1/B2: 배포 AI·음성 설정.** 사용자가 기존 OpenAI 키 재사용을 승인하여 B2 로컬 호출은 완료했다. 기본 모델/환경변수는 초안 README를 참고한다. [#27 기존 질문](https://github.com/jaehjung0102/careit/issues/27#issuecomment-7059058399)의 팀 최종 모델·배포 키 설정 담당·음성 서비스는 아직 확인이 필요하다. 로컬 키를 배포 환경에 복사하지 않았다. #56의 브라우저 SpeechRecognition이나 과거 로컬 Whisper 시험을 배포용 음성 서비스 합의로 간주하지 않는다.

현재 #61의 팀 로그인 자체가 준비됐더라도 서버 인증/대상 권한 어댑터가 없으면 B2 앱 경로는 계속 401/503 상태다. OpenAI 키만으로 이를 열거나 테스트용 가짜 인증으로 앱의 성공 상태를 만들지 않는다. 생성 API는 저장을 하지 않으며 승인 snapshot 저장은 별도 연결이다.

## 적용 후 확인할 사용자 흐름

1. F1/DB 관리자가 #61 migration을 웹보다 먼저 적용하고, 비밀값을 공개하지 않고 팀 시연 계정/소속을 준비한다. #61과 #56의 리뷰·merge·배포는 각 담당 흐름을 따른다.
2. 팀 로그인 → 실제 대상 선택 → 관찰 시각/선택값/음성 원문 확인 → 실제 초안 생성 → 사람 확인 → 저장 → 새로고침/다시 로그인 후 원본과 문장 재조회.
3. 로그아웃·계정/팀/대상 변경·입력 수정·녹음 재시작 후 늦게 도착한 응답이나 이전 승인이 재사용되지 않아야 한다.
4. 미로그인·다른 팀·소속 해제·존재하지 않는 대상은 실제 토큰/DB로 검사한다. AI 시간 초과·잘못된 출력은 입력을 보존한 템플릿 검토로 이어지고, 인증/저장 오류를 성공으로 표시하지 않는다.
5. 실제 휴대폰 마이크 허용/거부·중지/이어 녹음·재녹음·화면 종료와 UI 흐름을 별도 확인한다. 함수 테스트·빌드 성공이나 Vercel Ready는 이 검증을 대신하지 않는다.

확인 근거: #61의 `docs/team-demo-auth.md`, `web/src/lib/db/{residents,observations}.ts`, `TeamWorkspace.tsx`, `ObservationForm.tsx`, 팀 관찰 migration; #56 `VoiceDraftPanel.tsx`; B2 `_lib/post-draft.ts`, `lib/ai/drafts/{input,client-request,review-state}.ts`.
