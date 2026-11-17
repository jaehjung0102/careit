# B2-02: 인계 생성 첫 단계

기준: `main@2338493`, B2-01 PR #40의 `b2-01-draft-3` 제안. 팀 합의 전인 로컬 구현이다. 이 폴더는 B2 담당 영역이며 공용 타입·패키지·F2 화면·B1 DB는 변경하지 않는다.

## 흐름

1. 화면이 인계 ID, 어르신/원기록/담당자 ID, 확인된 사실, 후속 확인 항목, 기한을 보낸다.
2. 서버가 토큰·권한을 검증하고 요청 형식을 확인한다.
3. 처음 받는 ID라면 미래 기한을 확인하고 `sent`, version 1, 서버 작성자/시각, 미체크 항목을 만든다.
4. 저장 어댑터가 인계·생성 이벤트·최초 요청을 한 트랜잭션으로 저장한 뒤 201을 반환한다.
5. 같은 사용자의 동일 요청 재시도는 현재 인계를 200으로 반환한다. 다른 내용으로 같은 ID를 쓰면 409다.

## 현재 가능한 것과 연결 전 상태

- `_lib/validation.ts`: 입력 형식·길이·중복·날짜 검증.
- `_lib/create-handover.ts`: 인증/권한/저장 어댑터를 받아 생성 요청을 처리한다.
- `_tests/fixture.ts`: 가상 계정·원기록과 **테스트 전용 메모리 저장소**. 앱 경로에서 import하지 않는다. 재시작 시 사라지며 실제 시설 권한 검증이 아니다.
- `route.ts`: `POST /api/handovers`를 등록한다. 현재 토큰이 없으면 401, 토큰 형식이 있더라도 B1 연결 전에는 503 `DEPENDENCY_NOT_READY`. 토큰 형식만 보고 인증 성공으로 간주하거나 mock 저장 성공을 반환하지 않는다.
- UI 연결, 실제 Supabase 저장, 목록/상세/수신 API, 음성 기술 검증은 아직 미구현이다. B2-02 전체 완료가 아니다.

## B1 어댑터 연결 시 필요한 계약

- `authenticate`: Supabase에서 토큰을 검증하고 서버가 확인한 사용자 ID 반환.
- `authorizeCreate`: 작성 권한, 어르신, 같은 시설의 수신자, 양쪽 사용자의 모든 원기록 접근/어르신 일치 확인. 재시도도 확인.
- `repository.createOnce`: ID 충돌·최초 정규화 요청·현재 접근 권한을 확인하고 인계/이벤트/요청을 원자적으로 저장. 동일 ID 동시 요청에도 한 건만 생성. 재시도 시 `build()`를 호출하지 않고 현재 행을 반환. 숨겨진 ID는 404, 다른 내용은 409.
- 메모리 테스트의 동시성 검증은 단일 프로세스 범위이며 DB 트랜잭션 검증을 대신하지 않는다. B1 PR merge 후 실제 저장·권한·동시성 검증을 추가한다.

## 로컬 검증

`web/`에서 설치된 TypeScript와 Node 테스트 도구를 사용한다. 새 의존성이나 공용 패키지 설정 변경은 없다.

```sh
node node_modules/typescript/bin/tsc --strict --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --esModuleInterop --outDir ../../test-build src/app/api/handovers/_tests/create-handover.test.ts src/app/api/handovers/_tests/demo.ts
node --test ../../test-build/_tests/create-handover.test.js
node ../../test-build/_tests/demo.js
npm run lint
npm run build
```

데모 시각은 2026-11-17 18:00 KST, 기한은 같은 날 21:00 KST로 고정한다. 결과의 `meta.data_source`는 `mock`이다. 데모 파일을 공개 API로 연결하지 않는다.
