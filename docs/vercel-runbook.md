# 개인 프로젝트 플래너 웹 실행 안내

2026-10-11 승인 범위는 로컬 구현·검증이다. 운영 서비스와 배포는 생성하지 않았다. Windows/Electron 진입점과 기존 PostgreSQL 명령 의미는 보존했다.

## 로컬 실제 서비스 시험

Node 24, npm, Docker Compose, Chromium이 필요하다. Linux 기본 Chromium은 `/usr/bin/chromium`; 다른 경로는 `CHROMIUM_PATH`로 지정한다.

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run services -- up
npm run build:web
npm run test:web:unit
npm run test:web:ui
npm run dev:web:test
```

마지막 명령 후 <http://127.0.0.1:4319>에서 시험한다. 격리 Keycloak의 공개 시험 계정은 `alice` / `test-only-alice`; `bob`은 유효한 로그인 후 앱 접근이 거부되는 계정이다. 이것은 운영 계정·운영 키가 아니다. `dev:web:test`는 **시험용** migration과 알려진 fixture 암호화 키를 사용한다. 외부에 노출하거나 운영에 사용하면 안 된다. 시험 서버를 종료하고 `npm run services -- down`으로 시험 DB를 제거한다. web unit의 faults test는 이 격리 DB를 재시작하므로 다른 DB 의존 suite와 동시에 실행하지 않는다.

## 운영용 진입점(아직 연결하지 않음)

`src/server.ts`를 Vercel의 Fastify entrypoint로 사용한다. `npm run build:web`는 `dist/web`의 HTML·content-hash JS만 만든다. `vercel.json`은 Electron 바이너리 다운로드를 건너뛰는 설치 명령과 `dist/web/**` runtime 포함을 지정한다. 실제 Vercel 패키징·Preview는 미검증이다. Fastify는 `/`, `/auth/callback`, `/assets/*`, `/config`, `/api/*`를 같은 출처로 제공한다.

서버 환경변수:

| 변수 | 의미 |
|---|---|
| `DATABASE_URL` | 검증된 TLS의 PostgreSQL pooled 연결. SQL transaction/advisory lock 지원 필수 |
| `APP_ORIGIN` | 경로 없는 정확한 HTTPS 출처 |
| `APP_ENVIRONMENT` | 안정적인 환경 이름. Preview와 Production을 반드시 분리 |
| `OIDC_ISSUER` | OIDC discovery issuer |
| `OIDC_CLIENT_ID` | public SPA client ID. client secret 사용 안 함 |
| `OIDC_AUDIENCE` | API access token audience. SPA client ID와 구분 |
| `OWNER_SUBJECT` | 허용할 한 계정의 정확한 provider subject. email/첫 방문자 사용 안 함 |
| `DRAFT_MASTER_KEYS` | `{ "active":"v1", "keys":{ "v1":"<32-byte base64>" } }` 구조의 서버 전용 키 ring |
| `PORT` | 로컬 실행 port. 기본 3000 |
| `PLANNER_LOCAL_TEST` | 루프백 HTTP/비TLS DB 시험 전용 `1`. 운영에서 설정하지 않음 |

프런트엔드에는 issuer/client ID/audience만 `/config`로 제공된다. DB URL·master key는 웹 빌드에 주입하지 않는다. API는 Vercel cookie와 별개로 Bearer JWT 및 한 소유자를 검사한다. 토큰은 메모리에만 보관하므로 새 탭·새로고침·브라우저 재시작 시 다시 로그인한다. OIDC 로그인 상태/verifier만 sessionStorage에 짧게 두고 callback/실패 경로에서 정리한다. 로그인 제공처의 SSO 세션은 앱의 로컬 로그아웃과 별개다.

Migration은 요청·startup·build에서 실행하지 않는다:

```sh
# 승인 후 안전한 별도 세션에 MIGRATION_DATABASE_URL 설정. 값을 로그에 출력하지 않는다.
npm run migrate:web
npm run dev:web
```

runner는 단일 transaction/lock, 순번 SQL checksum 이력, 기존 schema 형태 비교로 동작한다. 기존 DB가 관리되지 않은 형태이면 거부한다. `001_initial.sql`은 변경하지 않았다. 운영 migration에는 DDL 권한이 있는 별도 연결을 사용하고 runtime 역할에는 필요한 테이블의 SELECT/INSERT/UPDATE/DELETE만 부여한다. 역할 생성/권한 변경은 아직 수행하지 않았다. 앱 rollback은 DB rollback이 아니며 백업·복구 절차는 운영 제공처 선정 후 별도 검증해야 한다.

## 보호된 초안과 복구

IndexedDB에는 AES-GCM ciphertext와 routing metadata만 저장한다. AAD에는 출처·환경·issuer/subject·project·draft ID·revision·key version이 결합된다. 서버는 소유자별 data key를 master key로 감싸 PostgreSQL에 저장한다. 로그인 후 해당 키를 nonextractable WebCrypto key로 가져와 메모리에서만 사용한다. 다른 탭의 새 revision을 덮어쓰거나 삭제하면 오류로 잠긴다. 이전 탭의 변경안은 로그인 후 상단 복구 선택과 목록의 `복구:` 버튼으로 연다.

Master 회전은 기존/새 master를 함께 제공하고 `active`를 새 버전으로 바꿔 진행한다. 소유자 키 조회 시 같은 data key를 새 master로 다시 감싼다. 모든 필요한 row가 새 master로 전환되고 백업 복구 조건을 검증하기 전 구 master를 제거하지 않는다. **운영 master는 이번 작업에서 생성·설정하지 않았다.**

이 보호는 DPAPI나 종단간 암호화가 아니다. 같은 출처 XSS와 로그인 중 장치 침해까지 방어하지 않는다. 브라우저 저장소 삭제/비공개 창 종료 또는 필요한 master/data key 분실 시 전송하지 않은 초안은 복구 불가하다. 입력 후 보호 저장 실패가 표시되면 새로고침·종료 전 화면의 내용을 별도로 보존해야 한다. 서버에 저장 완료된 내용은 DB 보존 정책을 따른다.

## 외부 단계의 승인 및 검증 조건

후보는 개인 비상업 용도의 Vercel Hobby, Neon Free, Auth0 Free이며 선택·연결하지 않았다. 유료 upgrade/trial/custom domain을 사용하지 않는다. 무료 한도/휴면/로그·백업 보존/인증 기능은 실제 계정에서 다시 확인해야 한다. 공급자의 무료 제공이 데이터 영구 보존이나 무중단을 보장하지 않는다.

별도 승인이 필요한 범위: 소유 계정/팀 선택, Vercel 프로젝트 생성, Neon DB와 runtime/migration 역할, Auth0 public SPA 및 API audience/정확한 callback/logout URL, owner subject·master key의 안전한 환경변수 설정, Preview 배포. Git push/PR와 Production 전환은 이번 승인에 포함되지 않는다.

승인 후 확인할 것: Vercel Function 파일 포함과 cache/CSP, 배포 보호를 유지한 앱 인증, Neon TLS·pool 상한·transaction/advisory lock·timeout/restart, Auth0 실제 access token/PKCE/Origin, 고정 Preview callback과 환경별 DB/키 분리, 백업·키 회전·rollback, 실제 PC 두 대 수락 시험. Windows 설치·DPAPI·업데이트 검증은 이 웹 시험으로 대체하지 않는다.

근거: [Vercel Fastify](https://vercel.com/docs/frameworks/backend/fastify), [Vercel pool 관리](https://vercel.com/kb/guide/connection-pooling-with-functions), [Vercel 프로젝트 설정](https://vercel.com/docs/project-configuration/vercel-json), [oidc-client-ts](https://authts.github.io/oidc-client-ts/), [Auth0 요금](https://auth0.com/pricing).
