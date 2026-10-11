# 개인 프로젝트 플래너 Vercel 전환 구현 계획

**사용자 검토 전 초안 — 아래 작업과 명령은 계획이며 아직 실행하지 않았습니다.**

목표는 기존 React·Fastify·PostgreSQL을 유지하는 개인용 웹 앱입니다. 전환 설계를 기준으로, 별도 브랜치에서 테스트 실패 확인 → 최소 구현 → 통과 확인 → 로컬 커밋 → 검토 순서로 진행합니다. 원본 커밋은 `5b1e3cb480ddcebadedada5e7d697c9417eb60f7`입니다. 이전 Sites/Vinext/D1 계획은 실행하지 않습니다.

## 공통 조건

- 기존 Windows 실행·Electron 파일·DB 명령 의미를 보존합니다. 공유 추출은 기존 동작을 바꾸지 않는 범위로 제한합니다.
- 화면·API는 Vercel 프로젝트 하나의 같은 출처이며 API 경로는 `/api`입니다.
- 온라인 편집, null/0 진행률, 날짜 양끝 포함, 원자적 버전 검사·영구 중복 요청 기록을 유지합니다.
- 운영 DB·로그인 제공처가 결정되기 전에는 격리 PostgreSQL/Keycloak 시험 환경만 사용합니다. 이를 운영 검증으로 표기하지 않습니다.
- 로그인·초안 키·DB URL·callback code를 테스트 로그나 산출물에 노출하지 않습니다.
- 기존 GitHub push·프로젝트 생성·외부 서비스 설정·배포는 별도 승인 전 금지합니다.

## 작업 1. 같은 출처의 웹 진입점과 빌드

**파일:** 새 `src/server.ts`, `apps/web/src/server/app.ts`, `apps/web/src/client/index.tsx`, `apps/web/src/client/index.html`, `scripts/build-web.ts`, `vercel.json`, `tests/web/routing.test.ts`. 기존 package/webpack 설정에는 웹 명령만 추가합니다.

**계약:** `createWebServer(config): Promise<FastifyInstance>`가 공개 앱 파일과 보호된 `/api` plugin을 조립합니다. API factory는 기존 routes를 직접 재사용합니다. frontend는 build 시 서버 비밀값을 주입받지 않습니다.

- [ ] `/`와 callback HTML, asset MIME, `/api/unknown` JSON 404, 미인증 API 401, 없는 asset 404, 경로 탈출 거부 테스트를 작성하고 실패를 확인합니다.
- [ ] 기존 webpack을 재사용해 `dist/web`를 만들고 Fastify 정적 파일·API 경계를 구현합니다. 배포 엔트리에서는 migration을 호출하지 않습니다.
- [ ] `npm run test:web:unit -- tests/web/routing.test.ts`, `npm run typecheck`, `npm run build:web`를 통과시킵니다. 웹 번들에 Electron·pg·서버 환경변수 값이 없는지 확인합니다.
- [ ] Vercel 빌드 설정은 공식 Fastify entrypoint와 파일 포함 규칙을 사용합니다. linked build에 계정 접근이 필요하면 승인 전에는 로컬 빌드까지만 확인합니다. 커밋 후 검토합니다.

## 작업 2. PostgreSQL 서버리스 연결과 migration 분리

**파일:** 새 `apps/web/src/server/pool.ts`, `scripts/migrate.ts`, `tests/web/postgres.test.ts`. 기존 `apps/api/src/db.ts`는 필요 시 migration 실행부만 호환되게 추출하며 `001_initial.sql`은 변경하지 않습니다.

**계약:** `getWebPool(): Pool`은 인스턴스별 pool을 재사용합니다. `runMigrations(pool): Promise<void>`는 요청 경로에서 호출할 수 없는 명시적 CLI 진입점입니다. schema migration 이력에는 번호와 checksum을 저장합니다.

- [ ] 여러 요청의 pool 재사용, 실패 후 client release, 요청/startup에서 DDL 미실행, migration 재실행의 무변경·checksum 불일치 거부 테스트를 먼저 실패시킵니다.
- [ ] `attachDatabasePool`, 제한된 pool/timeout, TLS 설정, transaction client 유지, migration 전용 연결·권한 분리를 구현합니다.
- [ ] 실제 격리 PostgreSQL에서 기존 API 회귀와 새 연결/migration 테스트를 실행합니다. 기존 DB를 새 runner에 등록할 때 테이블 존재만 보고 적용 완료로 간주하지 않고 schema 일치를 검사합니다.
- [ ] 승인 후 선택한 pooled endpoint에서 advisory transaction lock·FOR UPDATE·JSONB·동시성·연결 상한을 검증할 목록을 남깁니다. 새 코드 통과 후 커밋/검토합니다.

## 작업 3. 브라우저 OIDC와 단일 소유자 API

**파일:** 새 `apps/web/src/client/{auth,bridge,gateway}.ts`, `apps/web/src/server/{owner-policy,api}.ts`, `tests/web/{auth,security}.test.ts`, `tests/web/login.spec.ts`. 필요 시 기존 `apps/api/src/auth.ts`에서 JWT 검증과 principal 생성을 분리하되 desktop의 기존 기본 동작을 유지합니다.

**계약:** `WebAuth`는 `login()`, `completeCallback()`, `logout()`, `getAccessToken()`을 제공하며 token은 메모리에서만 유지합니다. `assertAllowedOwner(issuer, subject)`는 DB principal 생성 전에 동작하고 미설정 시 거부합니다. gateway는 기존 `PlannerGateway` 형식을 사용합니다.

- [ ] 잘못된 issuer/audience/서명/만료, ID token 오용, 허용되지 않은 정상 계정, 위조 ownerId, owner 설정 누락을 RED로 고정합니다.
- [ ] PKCE·state·nonce·redirect 일치·callback 재사용 거부, URL 정리, 메모리 token, sessionStorage의 단기 로그인 상태 정리를 구현합니다. 제공처별 SDK는 결정된 제공처에 맞춰 선택합니다.
- [ ] JSON/Origin/Authorization/no-store/CSP 경계를 구현합니다. 타 출처 form·fetch, Vercel cookie만 있는 요청, 보호 페이지 HTML 반환을 테스트합니다.
- [ ] 로컬 실제 Keycloak 로그인과 실제 PostgreSQL 소유자 검증을 통과시킵니다. 운영 제공처의 실제 token 호환성은 별도 확인으로 남깁니다. 커밋/검토합니다.

## 작업 4. 암호화된 브라우저 초안

**파일:** 새 `apps/web/src/client/{draft-store,session-epoch}.ts`, `apps/web/src/server/draft-keys.ts`, 새 순번 migration SQL, `tests/web/drafts.test.ts`, `tests/web/draft-recovery.spec.ts`.

**계약:** `createBrowserDraftStore(session): DraftStore`; session은 principal·환경·epoch·메모리 CryptoKey를 가집니다. 서버 `/api/draft-key`는 허용 소유자의 포장된 키만 풀어 반환합니다. 저장 레코드는 key version·draft ID·revision을 포함합니다.

- [ ] IndexedDB 평문 부재, 서로 다른 계정/환경의 복호화 거부, tamper 검출, 저장 실패 후 재시도에서도 전송 0, 다른 탭 초안의 삭제 방지 테스트 RED.
- [ ] AES-GCM·매 저장 새 IV·AAD, 계정별 키의 서버 포장, no-store 키 전달, 메모리-only import, IndexedDB 완료 대기와 조건부 삭제를 구현합니다.
- [ ] 같은 계정으로 브라우저 재시작 복구, 다른 계정 로그인, 재로그인 실패, 새 tab ID에서 이전 초안 선택, 로그아웃 중 늦은 응답, quota 오류를 실제 브라우저로 검증합니다.
- [ ] 키 회전 후 이전 초안 복구와 키 손실 시 명시적 실패를 시험합니다. browser 데이터 삭제의 복구 불가 한계를 안내합니다. 커밋/검토합니다.

## 작업 5. 기존 화면·동기화 연결과 회귀

**파일:** 새 `apps/web/src/client/App.tsx`, 기존 React 컴포넌트/상태기계에 필요한 최소 adapter 주입부, `tests/web/ui.spec.ts`, `tests/web/sync.test.ts`.

**계약:** 기존 프로젝트/표/간트는 동일 `PlannerGateway`·`DraftStore`를 소비합니다. desktop의 `window.planner` 경로는 보존하고 웹 entry에서 웹 bridge를 초기화합니다.

- [ ] 목록 우선·선택 상세·표/간트 drag/resize/Esc·키보드·IME·null/0·포함 날짜·보관/삭제/복원 테스트 RED.
- [ ] 웹 bridge와 보호 저장 가능 상태를 연결합니다. 실제 API 실패·offline·만료 시 편집을 잠그며 DB 장애를 로그인 만료와 구분합니다.
- [ ] 기존 늦은 refresh 중복 전송, 폐기 화면의 새 초안 삭제, 보호 저장 실패 후 자동 전송, 원격 변경 중 드래그 덮어쓰기 회귀를 웹에서도 통과시킵니다.
- [ ] `npm run test:web:unit`, `npm run test:web:ui`, `npm run typecheck`, `npm run build:web` 실행 후 기존 테스트도 재실행합니다. mock UI와 실제 API 결과를 분리합니다. 커밋/검토합니다.

## 작업 6. 실제 PostgreSQL·인증의 복수 클라이언트 검증

**파일:** `tests/web/real-sync.spec.ts`, `tests/web/faults.test.ts`, `docs/vercel-verification.md`.

- [ ] 독립 브라우저 2개의 변경 수신, 같은 version 동시 수정, 같은 requestId 8회, 다른 본문으로 ID 재사용, 서로 다른 owner의 같은 task UUID를 재현합니다.
- [ ] 요청 도착 전 단절, DB commit 뒤 응답 유실, 새 Function 인스턴스에 해당하는 API 재시작, DB 재시작, 브라우저 강제 종료 뒤 초안 복구를 시험합니다. 한 번의 적용과 원래 응답 재생을 확인합니다.
- [ ] 두 독립 서버 프로세스가 같은 PostgreSQL을 사용하는 시험으로 프로세스 메모리에 의존하지 않는지 확인합니다. 타 계정의 프로젝트·요청 상태·초안 키 접근을 거부합니다.
- [ ] API no-store, 로그 비밀값 제거, lock/statement timeout 시 rollback, 큰 입력의 명시적 거부, 실제 웹 번들 실행까지 검증합니다.
- [ ] 최종 독립 검토 후 회귀 수정, 테스트 결과·변경 파일·로컬 커밋·미검증 항목을 기록합니다. 기존 58개를 새 웹 테스트 수로 재사용하지 않습니다.

## 작업 7. 승인 후 Preview·운영 배포 확인

**파일:** `docs/vercel-runbook.md`, `docs/vercel-verification.md`, 필요 시 승인된 환경에 맞춘 `vercel.json` 값.

이 작업은 로컬 구현과 별도의 외부 변경 승인 후에만 진행합니다.

- [ ] Vercel 소유 계정/팀·요금 적합성, PostgreSQL 제공처·지역·비용·백업, OIDC 제공처·소유자 subject를 확인합니다. 새 프로젝트와 환경변수 설정 범위를 확정합니다. 비밀값은 대화나 Git에 넣지 않습니다.
- [ ] Preview는 별도 DB·OIDC client·고정 callback URL로 구성합니다. 웹 빌드 명령을 명시하여 기존 Electron 기본 build가 선택되지 않게 하고, runtime bundle에 불필요한 desktop 의존성이 없는지 검사합니다.
- [ ] migration을 별도 실행한 뒤 승인된 Preview를 배포합니다. `/`, callback, assets, `/api`의 같은 출처 경로와 실제 Function 파일 포함을 확인합니다. 배포 보호는 해제하여 시험하지 않습니다.
- [ ] 보호를 통과한 요청에도 앱 인증/소유자 검사가 적용되는지 확인합니다. 실제 운영 후보 PostgreSQL pooled endpoint와 로그인 제공처로 동시성·응답 유실·로그아웃·재시작 복구를 시험합니다.
- [ ] Production 승인을 받은 후 환경 분리·migration·배포·운영 URL 보호 범위를 다시 확인합니다. 앱 rollback과 DB 복구를 구분하고 이전 앱 버전과 schema 호환성을 확인합니다.
- [ ] 실제 PC 2대의 같은 계정으로 일정 변경·충돌·재접속을 확인합니다. 수행할 수 없으면 차단으로 남깁니다. 최종 URL·전체 커밋·배포 ID·테스트 층위·비용/보존 한계를 전달합니다.

## 검증 결과 표기 기준

| 층위 | 입증하는 것 | 대체할 수 없는 것 |
|---|---|---|
| 단위·모의 UI | 도메인과 화면·상태기계 동작 | 실제 로그인·DB·Vercel |
| 로컬 실제 PostgreSQL/Keycloak | SQL 원자성·서버 소유자 검사·프로세스 간 동기화 | 운영 제공처·배포 보호 |
| Vercel Preview + 운영 후보 서비스 | 실제 패키징·TLS/pool·OIDC callback·같은 출처 | Production 설정과 실제 두 PC |
| Production/두 PC 수락 | 실제 사용자 경로와 운영 연결 | 브라우저 데이터 삭제 시 초안 영구 보장 |

현재는 문서 단계이므로 위 표의 웹 전환 검증은 모두 미실행입니다.

## 전환에 필요한 사용자 결정

1. **용도와 비용:** 개인 비상업적 용도인지, 회사·수익 활동에도 쓰는지 확인이 필요합니다. Vercel·DB·로그인 서비스의 합산 월 비용 상한을 정합니다. 비용 승인 전에는 유료 자원을 만들지 않습니다.
2. **운영 DB:** 이미 사용할 PostgreSQL이 있으면 제공처만 알려주면 됩니다. 없다면 표준 PostgreSQL/connection pooling을 지원하는 Neon을 우선 검토할지 결정합니다. 비밀번호나 접속 문자열을 대화에 보낼 필요는 없습니다.
3. **로그인:** 이미 사용할 OIDC 제공처가 있는지, 없다면 Auth0 기반 개인 계정 로그인을 검토할지 결정합니다. 로그인할 한 계정과 provider의 안정적인 subject 연결은 안전한 설정 단계에서 확인합니다.
4. **진행 승인:** 이 최소 변경 설계와 브라우저 초안 보호 한계를 수락하여 로컬 구현을 시작할지 결정합니다. Vercel 프로젝트/서비스 연결·비밀값 설정·GitHub push·Preview/운영 배포는 이 승인과 별도로 진행 범위를 확인합니다.
