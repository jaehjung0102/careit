# 돌봄잇 Issue 할당표 (2026-11-17 현재)

`[F1-03]`은 담당자별 계획 코드이고 `#3`은 GitHub의 실제 Issue 번호다. 문서와 GitHub를 함께 볼 때는 항상 **`[F1-03] / #3`**처럼 확인한다.

## 담당자와 리뷰어

| 코드 | 담당자 | GitHub | 지정 교차 리뷰어 |
|---|---|---|---|
| F1 | 정재헌 | `jaehjung0102` | B1 이은규 |
| F2 | 문수혁 | `anstngur123` | B2 하이칼 |
| B1 | 이은규 | `elee7coder` | F1 정재헌 |
| B2 | 하이칼 | `haiqalzne` | F2 문수혁 |

각 날짜까지 담당자는 구현·자체 검증·PR 제출을, 리뷰어는 피드백·수정 확인·승인을 끝낸다. 정재헌이 승인된 PR을 최종 merge한다.

## 현재 상태

- **완료·Closed:** [[F1-02] / #2](https://github.com/jaehjung0102/careit/issues/2), [[F1-D1] / #42](https://github.com/jaehjung0102/careit/issues/42)
- **검토 중 PR:** [[F2-01] / #9](https://github.com/jaehjung0102/careit/issues/9) → PR #39, [[B2-01] / #25](https://github.com/jaehjung0102/careit/issues/25) → PR #40, [[B2-02] / #26](https://github.com/jaehjung0102/careit/issues/26) → PR #41
- **merge하지 않음:** PR #37은 이전 협업 문서이며 현재 `main`과 충돌한다. 새 계획 문서 PR이 이를 대체한다.
- **배포 검증 Open:** [[F2-D1] / #43](https://github.com/jaehjung0102/careit/issues/43), [[B1-D1] / #44](https://github.com/jaehjung0102/careit/issues/44), [[B2-D1] / #45](https://github.com/jaehjung0102/careit/issues/45)

## 11월 18일(수)까지 — 기반·계약·배포 검증

- **F1 정재헌:** [[F1-01] / #1 — 협업 보드·main 보호·4인 실행](https://github.com/jaehjung0102/careit/issues/1). `[F1-02] / #2`, `[F1-D1] / #42`는 완료.
- **F2 문수혁:** [[F2-01] / #9 — 기존 변화·인계·운영 화면 인수](https://github.com/jaehjung0102/careit/issues/9), [[F2-D1] / #43 — 모바일 배포 스모크 테스트](https://github.com/jaehjung0102/careit/issues/43).
- **B1 이은규:** [[B1-01] / #17 — 관찰 DB 인수·어르신 데이터 설계](https://github.com/jaehjung0102/careit/issues/17), [[B1-D1] / #44 — Production Supabase·RLS 검증](https://github.com/jaehjung0102/careit/issues/44).
- **B2 하이칼:** [[B2-01] / #25 — API 계약·업무 규칙](https://github.com/jaehjung0102/careit/issues/25), [[B2-D1] / #45 — 배포 API 경로·실패 흐름](https://github.com/jaehjung0102/careit/issues/45).

## 11월 22일(일)까지 — 독립 기능 첫 완성

- **F1 정재헌:** [[F1-03] / #3 — AI 초안 검토·음성 입력 UI](https://github.com/jaehjung0102/careit/issues/3).
- **F2 문수혁:** [[F2-02] / #10 — 인계 목록·상세·상태 UI](https://github.com/jaehjung0102/careit/issues/10).
- **B1 이은규:** [[B1-02] / #18 — 팀 데모 인증·어르신 조회](https://github.com/jaehjung0102/careit/issues/18).
- **B2 하이칼:** [[B2-02] / #26 — 인계 API·음성 기술 검증](https://github.com/jaehjung0102/careit/issues/26).

## 11월 25일(수)까지 — 저장·이력·실패 처리

- **F1 정재헌:** [[F1-04] / #4 — 저장 오류·재시도·수정 이력 UI](https://github.com/jaehjung0102/careit/issues/4).
- **F2 문수혁:** [[F2-03] / #11 — 인계 생성·수신 확인·조치 완료 UI](https://github.com/jaehjung0102/careit/issues/11).
- **B1 이은규:** [[B1-03] / #19 — 수정 이력·권한·중복 저장 방지](https://github.com/jaehjung0102/careit/issues/19).
- **B2 하이칼:** [[B2-03] / #27 — AI 초안·음성 변환·실패 대체](https://github.com/jaehjung0102/careit/issues/27).

## 11월 29일(일)까지 — 변화 계산·근거

- **F1 정재헌:** [[F1-05] / #5 — 기록 복사·가격 안내](https://github.com/jaehjung0102/careit/issues/5).
- **F2 문수혁:** [[F2-04] / #12 — 변화·근거·자료 부족 UI](https://github.com/jaehjung0102/careit/issues/12).
- **B1 이은규:** [[B1-04] / #20 — 비교용 가상 기록·권한 검사](https://github.com/jaehjung0102/careit/issues/20).
- **B2 하이칼:** [[B2-04] / #28 — 변화 계산·근거·기한 초과](https://github.com/jaehjung0102/careit/issues/28).

## 12월 2일(수)까지 — 운영·내보내기·모바일

- **F1 정재헌:** [[F1-06] / #6 — 관찰·AI·음성 모바일 검증](https://github.com/jaehjung0102/careit/issues/6).
- **F2 문수혁:** [[F2-05] / #13 — 운영 현황·내보내기 UI](https://github.com/jaehjung0102/careit/issues/13).
- **B1 이은규:** [[B1-05] / #21 — CSV·PDF 출력 데이터](https://github.com/jaehjung0102/careit/issues/21).
- **B2 하이칼:** [[B2-05] / #29 — 운영 집계 API](https://github.com/jaehjung0102/careit/issues/29).

## 12월 6일(일)까지 — 기능 완성본 RC1

- **F1 정재헌:** [[F1-07] / #7 — 통합 사용자 테스트·발표 초안](https://github.com/jaehjung0102/careit/issues/7).
- **F2 문수혁:** [[F2-06] / #14 — 인계·변화·운영 실제 API 연결](https://github.com/jaehjung0102/careit/issues/14).
- **B1 이은규:** [[B1-06] / #22 — DB·권한·출력 통합 검증](https://github.com/jaehjung0102/careit/issues/22).
- **B2 하이칼:** [[B2-06] / #30 — AI·비교·인계 통합 검증](https://github.com/jaehjung0102/careit/issues/30).

이날부터 신규 기능을 받지 않고 결함 수정과 발표 준비만 한다.

## 12월 9일(수)까지 — 최종 완성본·Production 배포

- **F1 정재헌:** [[F1-08] / #8 — 최종 merge·배포·시연 리허설](https://github.com/jaehjung0102/careit/issues/8).
- **F2 문수혁:** [[F2-07] / #15 — UI 결함 수정](https://github.com/jaehjung0102/careit/issues/15), [[F2-08] / #16 — 최종 UI·발표 캡처·출시 점검](https://github.com/jaehjung0102/careit/issues/16).
- **B1 이은규:** [[B1-07] / #23 — 데모 데이터·사용자 테스트](https://github.com/jaehjung0102/careit/issues/23), [[B1-08] / #24 — 배포·실행·복구 문서](https://github.com/jaehjung0102/careit/issues/24).
- **B2 하이칼:** [[B2-07] / #31 — 테스트 결함·구현 결과](https://github.com/jaehjung0102/careit/issues/31), [[B2-08] / #32 — 전체 회귀 검증·발표 질문](https://github.com/jaehjung0102/careit/issues/32).

12월 9일 최종 배포 후 기능을 동결한다.

## 12월 10~14일 — QA 전용

- **F1 정재헌:** [[F1-QA] / #47 — QA 총괄·결함 분류·최종 배포](https://github.com/jaehjung0102/careit/issues/47).
- **F2 문수혁:** [[F2-QA] / #48 — 모바일 UI·전체 화면 QA](https://github.com/jaehjung0102/careit/issues/48).
- **B1 이은규:** [[B1-QA] / #49 — 데이터·RLS·배포 복구 QA](https://github.com/jaehjung0102/careit/issues/49).
- **B2 하이칼:** [[B2-QA] / #50 — API·AI·변화·인계 회귀 QA](https://github.com/jaehjung0102/careit/issues/50).

QA 기간에는 신규 기능을 추가하지 않는다. P0(서비스·데이터·보안)과 P1(발표 핵심 흐름 중단)은 12월 14일까지 0개로 만든다. P2·P3는 수정 위험이 낮은 경우에만 반영하고 나머지는 발표 후 개선 목록에 남긴다.

PR 본문 규칙, 날짜별 완료 기준, 병렬 개발 파일 경계는 [개발 계획서](development-plan.md)에서 확인한다.
