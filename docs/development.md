# 개발·검토 실행 안내

기존 README와 `01_project_ex`는 보존했습니다. 새 앱은 저장소 루트의 npm 프로젝트입니다. 개인용 앱의 소스와 시험 환경이며 운영 서비스나 배포된 설치기는 아닙니다.

## 준비

- Node 24 LTS, npm, Docker Compose
- Linux UI: Chromium (`CHROMIUM_PATH`로 실행 파일 지정 가능)
- Windows UI: `npx playwright install chromium`
- Electron 실행 테스트: 데스크톱 표시 서버가 필요합니다. Linux CI에서는 Xvfb를 사용합니다.

```sh
npm ci
npm run services -- up
npm run typecheck
npm run test:unit
npm run test:api
npm run test:ui
npm run build
npm run test:e2e
```

각 테스트 명령 뒤 `-- tests/...`로 파일을 지정할 수 있습니다. `test:unit`과 `test:api`는 별도 Vitest 프로젝트이며 `test:ui`와 `test:e2e`는 별도 Playwright 프로젝트입니다. Docker 서비스가 준비되지 않으면 API/E2E는 실패하며 모의 검증으로 대체하지 않습니다.

`npm run services -- up`은 **격리 시험용** PostgreSQL 17.6(55432), Keycloak 26.4.0(58080)을 loopback에 실행합니다. 저장소 안의 공개된 시험 계정/암호는 임시 fixture이며 운영에 재사용하지 마세요. 관리자 계정이나 운영 클라이언트는 만들지 않았습니다. 종료는 `npm run services -- down`입니다. 이 명령은 `planner-test` Compose 프로젝트만 제거합니다.

권한 제한 환경에서 npm 캐시가 쓰기 불가라면 `npm_config_cache=/tmp/planner-npm-cache`를 지정하세요. 이번 환경의 Electron 다운로드에는 `NODE_USE_ENV_PROXY=1 electron_config_cache=/tmp/planner-electron-cache node node_modules/electron/install.js`가 필요했습니다. 기존 비밀정보를 출력하거나 변경하지 않습니다.

## 화면 검토

```sh
npm run dev:ui
```

`http://127.0.0.1:4317`은 **모의 bridge UI 검토 전용**입니다. 저장 내용은 메모리에 있고 새로고침하면 초기화됩니다. 운영 앱의 온라인 동기화나 암호화 저장 성공을 뜻하지 않습니다. `docs/verification/ui-mock.png`도 모의 데이터 화면입니다.

## 실제 개발 앱

시험 서비스를 먼저 실행한 후 별도 터미널에서:

```sh
NODE_ENV=test DATABASE_URL=postgresql://planner_test:isolated-test-only@127.0.0.1:55432/planner_test OIDC_ISSUER=http://127.0.0.1:58080/realms/planner-test OIDC_AUDIENCE=planner-api npm run dev:api
NODE_ENV=test PLANNER_API_URL=http://127.0.0.1:4318 PLANNER_OIDC_ISSUER=http://127.0.0.1:58080/realms/planner-test PLANNER_OIDC_CLIENT_ID=planner-desktop npm run dev:desktop
```

PowerShell에서는 동일 변수들을 해당 터미널의 `$env:NAME`으로 지정합니다. 시험 계정은 `infra/oidc-test-realm.json`에 있습니다. 실제 데스크톱은 시스템 브라우저의 authorization-code/PKCE 로그인을 사용하며, 비밀번호 grant는 시험 API fixture에서만 사용합니다. 토큰은 메인 프로세스 메모리에만 있고 앱 재시작 시 다시 로그인합니다.

패키지 앱은 HTTPS API/OIDC 주소를 요구합니다. 로그인 전 설정 오류는 UI에 표시됩니다. 운영 주소·OIDC 클라이언트 등록·배포 및 서명은 아직 승인/구성되지 않았습니다. 이 단계에서는 운영 자격증명이나 지속 접근용 토큰이 필요하지 않습니다.

Linux에서 OS 비밀 저장소가 없거나 `basic_text`이면 편집을 잠급니다. 이를 해제하여 평문 저장으로 우회하지 않습니다. 이번 Linux Electron smoke는 격리 환경에서만 `--no-sandbox`를 사용했고 `nodeIntegration=false`/제한된 bridge를 확인했습니다. OS sandbox·Windows DPAPI가 검증됐다는 의미가 아닙니다.

## 검증 층위

| 명령/파일 | 검증 대상 | 검증하지 않는 것 |
|---|---|---|
| `test:unit` | 달력·진행률, 상태기계 경합, 보호 저장 실패, IPC, JWT claim 검사 | Windows DPAPI |
| `test:api` | 실제 PostgreSQL 트랜잭션, 실제 Keycloak 토큰, 소유자, 중복·버전 충돌 | Windows 설치 |
| `test:ui` | 실제 Chromium + 모의 bridge, 표/간트 편집·한글·복구 UI | 실제 서버 동기화 |
| `real-sync.spec.ts` | 실제 OIDC 브라우저 PKCE, API/DB, 독립 화면 2개, 타 계정, 장애 proxy, API 재시작, 보호 초안 프로세스 강제 종료 복구 | 서로 다른 Windows PC, DPAPI |
| `electron-smoke.spec.ts` | 실제 Linux Electron 시작·context isolation/bridge | Windows 설치/업데이트/제거, 완전한 데스크톱 인증 수명주기 |
| `scripts/check-db-restart.ts` | PostgreSQL 실제 재시작 뒤 동일 요청 결과 유지 | 운영 백업/재해 복구 |

실제 서비스 화면 테스트는 Playwright의 Node binding으로 운영 renderer와 실제 API client를 연결합니다. 토큰은 Node 측에만 있습니다. 테스트 AES-GCM 저장소는 OS DPAPI를 대체 주장하지 않습니다. 강제 종료 테스트는 클라이언트 상태기계의 별도 Node 프로세스를 종료하며 Windows 앱 강제 종료 수명주기와 구분됩니다.

## 빌드

`npm run build`는 공유 webpack 설정으로 renderer, Electron main, preload 번들을 `dist/`에 생성합니다. Forge 설치 패키징과 별개입니다. Windows 설치기 절차는 [windows-verification.md](windows-verification.md)를 따릅니다.

```sh
npm run make:win
npx tsx scripts/verify-windows.ts
```

첫 명령은 Forge의 `--platform=win32 --arch=x64`를 사용합니다. 검증 스크립트는 실제 Windows 11 x64가 아니면 exit 2로 차단합니다. 산출물 체크섬을 만들더라도 수동 검증을 완료 처리하지 않습니다. 자동 업데이트, 서명, 게시 단계는 포함하지 않습니다.

## 구현 파일

- `packages/core/src`: 승인된 모델/명령 계약, 엄격한 날짜 및 평균 진행률
- `apps/api`: 소유자 검사, 원자적 요청 예약/프로젝트·작업 잠금, 영구 요청 기록
- `apps/desktop/src/main`: PKCE, 메모리 토큰, 암호화 초안, 인증된 IPC
- `apps/desktop/src/renderer`: 프로젝트 목록/상세/휴지통, 작업 표·간트, 저장/충돌 상태기계
- `infra`, `tests/support`: 배포 번들에 포함되지 않는 시험 서비스와 장애 주입 fixture
- `docs/superpowers`: 승인 원문 스냅샷. 진행 기록은 `docs/verification/progress.md`에 별도 보존

DB는 정규화된 프로젝트·작업·요청 ID와 JSONB 도메인 payload를 사용합니다. API 검증 후 행/ID 잠금 아래서 payload, 버전, 요청 결과를 한 트랜잭션에 씁니다. 상세와 목록은 단일 SQL 스냅샷으로 읽습니다. 요청 기록은 자동 만료하지 않습니다.
