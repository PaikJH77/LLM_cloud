# 개인 프로젝트 플래너 Vercel 전환 설계

**사용자 검토 전 초안 — 코드 변경·프로젝트 생성·배포는 아직 시작하지 않았습니다.**

기준은 기존 Windows 구현 커밋 `5b1e3cb480ddcebadedada5e7d697c9417eb60f7`입니다. 개발 저장소는 LLM_cloud를 유지합니다. Sites/Vinext/D1 전환안은 채택하지 않으며, 기존 Windows 코드와 검증 기록은 보존합니다.

## 1. 권장안과 유지할 동작

**React 화면 + Fastify API + PostgreSQL을 유지하고, Vercel의 Node.js 환경에 웹 진입점만 추가합니다.** Next.js로 재작성하거나 DB를 교체하지 않습니다. Vercel은 현재 Fastify를 공식 지원하며, 인식된 진입점의 앱을 하나의 Function으로 실행합니다. [Fastify 공식 배포 문서](https://vercel.com/docs/frameworks/backend/fastify)

유지할 기능은 진행 중 프로젝트 목록 우선, 프로젝트 선택 후 표·시간축 간트, 막대 이동·양끝 날짜 조절, 한글 입력, 보관·삭제·복원, null 진행률과 0 구분, 날짜 양끝 포함, 청회색 배경·흰 카드·블루 강조입니다. 온라인일 때만 편집하고 여러 PC의 변경은 프로젝트 버전으로 충돌 검사합니다.

재사용 범위:

| 기존 요소 | 웹 전환 방식 |
|---|---|
| `packages/core/src` | 모델·검증·날짜·진행률을 그대로 사용 |
| React 프로젝트/작업/간트 화면 | 기존 컴포넌트를 import하고 웹 진입점에서 bridge 주입 |
| sync controller | 보호 초안·요청 확인·충돌 재적용 흐름과 회귀 테스트 유지 |
| Fastify routes, PostgreSQL mutate/queries | `/api` 아래에 재등록하고 기존 트랜잭션 유지 |
| OIDC JWT 검증, issuer/subject → owner UUID | 유지하고 웹 앱에는 단일 소유자 허용 정책 추가 |
| Electron main/preload·Forge·DPAPI | 삭제하지 않고 Windows 전용으로 남김; 웹에서는 사용하지 않음 |

공유 코드 변경이 필요하면 기존 기본 동작을 보존하는 작은 추출·주입 변경만 허용합니다. Windows 파일 전체를 복사해 서로 다른 구현으로 관리하지 않습니다. 기존 58개 테스트 통과는 이전 Linux 검증이며 웹 전환 완료 증거가 아닙니다.

## 2. 같은 출처의 구체적 배포 구성

Vercel 프로젝트 하나, Node.js 24, 저장소 루트를 빌드 루트로 사용하는 구성을 제안합니다.

- 새 `src/server.ts`: 공식 인식 경로의 얇은 Fastify 진입점. 웹 앱 factory를 조립합니다.
- 새 `apps/web/src/server/app.ts`: 정적 화면과 보호된 API plugin을 함께 등록합니다.
- 새 `apps/web/src/client/`: 브라우저 로그인·API·초안 adapter와 React 진입점입니다.
- 새 `scripts/build-web.ts`: 기존 webpack 도구를 재사용해 `dist/web/`만 빌드합니다. Electron 설치기 빌드를 호출하지 않습니다.
- 새 `vercel.json`: 웹 빌드 명령과 Function에 필요한 `dist/web/**` 포함을 지정합니다. 실제 산출물에서 파일 포함·진입점 탐지를 확인합니다. 기존 `start.ts`의 migration·종료 처리까지 그대로 가져오지 않습니다.

경로 계약:

| 경로 | 처리 |
|---|---|
| `/` | 프로젝트 목록을 시작점으로 하는 React 앱; 로그인 전에는 로그인 화면 |
| `/auth/callback` | 같은 React 앱에서 OIDC callback 검증 후 URL 정리 |
| `/assets/*` | `@fastify/static`으로 웹 빌드 파일만 제공 |
| `/api/session` | 검증된 현재 소유자와 연결 상태 |
| `/api/projects`, `/api/projects/:id` | 기존 목록·상세 조회 |
| `/api/commands`, `/api/requests/:id` | 기존 변경·중복 요청 확인 |
| `/api/draft-key` | 인증된 본인의 초안 복구 키 제공 |

브라우저 요청은 `/api/...` 상대 경로를 사용합니다. 별도 API 도메인, 외부 rewrite, CORS 허용 목록 확장은 필요하지 않습니다. 처음에는 정적 파일도 같은 Fastify 앱에서 제공하여 구성 수를 줄입니다. 앱 파일은 읽기 전용 번들에서 읽으며 서버 파일시스템을 데이터 저장소로 쓰지 않습니다. 이는 정적 전용 CDN보다 초기 요청의 Function 비용이 들 수 있는 단순화입니다. [Fastify 정적 파일 플러그인](https://github.com/fastify/fastify-static), [Vercel 파일 포함 설정](https://vercel.com/docs/project-configuration/vercel-json#functions)

인증 hook는 `/api` plugin에만 적용하여 로그인 화면·JS 로딩을 막지 않습니다. `/api/*` 오류를 SPA HTML로 바꾸지 않으며, 없는 asset은 404입니다. 정적 루트는 `dist/web`만 허용하고 소스·환경파일·DB 파일을 노출하지 않습니다. 사용자 데이터/API/HTML은 no-store, 해시가 붙은 공개 JS/CSS만 장기 캐시합니다.

## 3. 로그인과 개인 소유자 권한

최소 변경을 위해 **브라우저 Authorization Code + PKCE와 API Bearer JWT 검증**을 유지합니다. 운영 OIDC 제공처는 아직 미정입니다. 기존에 호환되는 제공처가 있다면 재사용하고, 없다면 Auth0의 SPA + 사용자 정의 API 구성을 후보로 제안합니다. 이는 계정·비용·운영 설정이 완료되었다는 뜻이 아닙니다. [Auth0 React/API 인증 안내](https://auth0.com/docs/quickstart/spa/react)

제공처 조건은 HTTPS discovery/JWKS, public SPA client, PKCE S256, API 전용 audience를 가진 서명된 access token입니다. 기존 검증기의 RS256/ES256·issuer·audience·exp·iat·sub 조건과 호환성을 실제 토큰으로 확인합니다. ID token을 API access token으로 대체하지 않습니다. 기존 시험 Keycloak은 로컬 검증용으로만 유지하며 Vercel에 배포하지 않습니다.

브라우저 로그인은 검증된 SDK로 처리하고 state·nonce·PKCE·정확한 redirect URI를 확인합니다. access token은 메모리에만 두고 localStorage/IndexedDB에 저장하지 않습니다. PKCE verifier와 state에 한해 짧은 수명의 callback 복구용 sessionStorage를 허용하고 사용 후 삭제합니다. refresh token의 영구 저장은 도입하지 않습니다. 재시작·재인증이 필요한 만료에서는 top-level 로그인으로 돌아갑니다. Preview는 고정된 시험 URL과 별도 client/시험 DB를 사용하고 `*.vercel.app` 전체를 callback으로 허용하지 않습니다.

웹 API는 검증된 `(issuer, subject)`가 운영자가 명시한 **한 명의 허용 소유자**와 일치해야 접근을 허용합니다. 설정이 없으면 거부합니다. 첫 로그인 사용자를 자동 소유자로 지정하지 않고 email이나 브라우저가 보낸 ownerId를 권한 근거로 사용하지 않습니다. 허용된 신원만 기존 principals 테이블의 UUID로 연결합니다. 로그인 성공과 데이터 접근 허용은 별개입니다.

로그아웃은 이 브라우저의 토큰·키·화면을 폐기하고 다른 탭에 잠금을 알립니다. 이미 탈취된 JWT까지 즉시 무효화하는 기능은 아니며 토큰 만료/제공처 정책의 한계가 있습니다. 긴 수명의 token 대신 짧은 만료 정책을 사용하고, 강제 차단은 서버의 소유자 허용 정책으로 수행합니다.

**Vercel Deployment Protection은 추가 입구 보호입니다. 앱의 인증·소유자 검사를 대체하지 않습니다.** 실제 계정의 보호 방법과 URL 적용 범위를 확인합니다. Standard Protection은 production domain을 제외하므로 운영 주소까지 보호됐다고 가정하지 않습니다. 배포 보호를 통과한 요청도 앱 JWT와 소유자 검사를 통과해야 합니다. [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)

## 4. CSRF와 웹 보안 경계

앱 API는 ambient cookie를 로그인 근거로 사용하지 않고 명시적인 Authorization 헤더를 요구합니다. 따라서 다른 사이트의 form 제출이나 Vercel 보호 cookie만으로 데이터를 변경할 수 없습니다.

추가로 변경 요청에는 정확한 운영/시험 Origin과 JSON Content-Type을 요구하고, cross-site 요청·누락된 Origin·불필요한 OPTIONS를 거부합니다. 허용 Origin은 서버 설정에서 정하며 임의 Host/forwarded header로 확대하지 않습니다. CORS를 열지 않습니다. OIDC callback에는 일반 API Origin 규칙 대신 SDK의 state·nonce·PKCE 검증을 적용합니다.

CSP는 self와 선택한 OIDC 제공처에 필요한 항목만 허용합니다. HTML 삽입을 피하고 frame 제한·no-referrer 정책을 적용합니다. 토큰·callback code·초안 키·DB URL·요청 본문을 로그에 남기지 않습니다. API의 HTML 로그인 응답, 401, 403, 503을 구분하여 잘못된 저장 성공이나 무한 로그인 재시도가 생기지 않게 합니다.

## 5. PostgreSQL 연결·원자성·마이그레이션

운영 DB는 별도 관리형 PostgreSQL이 필요합니다. 기존 DB가 있다면 호환성을 먼저 확인하고, 없다면 표준 `pg` 연결을 지원하는 Neon을 후보로 제안합니다. Vercel 배포가 PostgreSQL 서버까지 자동 포함하는 것은 아닙니다. 제공처와 요금은 별도 결정입니다.

런타임은 기존 `pg.Pool`을 인스턴스별로 재사용하고 `attachDatabasePool`을 연결합니다. 요청마다 pool을 생성하거나 종료하지 않습니다. 각 트랜잭션은 `pool.connect()`로 빌린 **동일 client**에서 BEGIN부터 COMMIT/ROLLBACK까지 처리하고 finally에서 release합니다. 초기 제안은 max 5, idle timeout 5초, 연결 timeout 5초이며 제공처 연결 한도·동시 인스턴스 수에 맞춰 조정합니다. 이 pool 크기가 배포 전체 연결 상한을 뜻하지 않습니다. [Vercel 연결 풀 안내](https://vercel.com/kb/guide/connection-pooling-with-functions)

제공처의 pooled PostgreSQL URL과 TLS 인증서 검증을 사용합니다. statement 단위로 연결이 바뀌는 서비스는 사용하지 않습니다. transaction pooling을 쓴다면 트랜잭션 내 연결 유지, `pg_advisory_xact_lock`, 행 잠금, JSONB, 요청 UNIQUE 제약을 실제 endpoint에서 시험합니다. 이를 지원하지 않으면 기존 원자성을 약화하지 않고 연결 방식/제공처를 재검토합니다. 서버와 DB 지역을 가깝게 두고 lock·statement timeout을 설정합니다.

기존 `applyCommand`의 핵심은 유지합니다.

1. `(owner_id, request_id)` 유일 예약과 canonical body hash 검사.
2. 프로젝트 advisory transaction lock 및 소유자·expectedVersion 검사.
3. 전역 task-ID 경합 잠금과 owner/project 범위 INSERT/UPDATE.
4. 데이터·프로젝트 버전·최종 요청 결과를 한 PostgreSQL 트랜잭션에 기록.
5. 동일 ID/본문은 원래 결과 재생, 다른 본문은 거부. 응답 유실 후 상태 조회와 같은 ID 재전송. 충돌 재적용만 새 ID 사용.

읽기는 현재 단일 SQL snapshot 방식을 유지하고 CDN이나 오래된 replica로 보내지 않습니다. 브라우저의 10초 polling 및 focus/online 확인을 유지합니다. 함수 메모리의 mutex나 여러 인스턴스에 공유되지 않는 Map으로 동시성을 대체하지 않습니다.

**마이그레이션은 startup/request/build에서 실행하지 않습니다.** 기존 `001_initial.sql`을 보존하고 새 migration 번호·checksum·적용 이력을 관리하는 별도 CLI를 둡니다. 초안 키용 테이블 등 추가 변경은 새 SQL로 작성합니다. migration은 승인된 배포 단계에서 별도 권한·연결로 한 번 실행하고, 운영 런타임 계정에는 불필요한 DDL 권한을 주지 않습니다. Preview와 Production DB/자격증명을 분리합니다. 시험 데이터를 운영에 자동 복사하지 않습니다. 앱 rollback은 DB rollback이 아니므로 호환되는 추가 변경과 사전 백업/복구 절차를 사용합니다.

## 6. 브라우저 초안 보호와 한계

서버 확인 전에는 저장 완료로 표시하지 않습니다. `navigator.onLine`은 보조 신호이며 실제 인증 API가 성공해야 편집을 허용합니다. offline 이벤트·요청 실패·만료 시 추가 편집을 잠그고 기존 초안을 유지합니다.

초안은 Web Crypto AES-GCM으로 암호화하여 IndexedDB에 저장합니다. 매번 새 96-bit IV를 만들고 AAD에 앱/환경/issuer/subject/project/draft ID/key version을 포함합니다. 브라우저에는 ciphertext·IV·복구용 식별 메타데이터만 지속 저장하며 access token이나 복호화 키를 함께 저장하지 않습니다.

계정별 256-bit 초안 키는 서버가 생성합니다. PostgreSQL에는 별도 서버 암호화 키로 감싼 형태로 보존하고, 포장용 키는 승인 후 서버 환경변수에만 설정합니다. 인증·소유자 검사를 통과한 본인에게만 HTTPS/no-store 응답으로 초안 키를 전달합니다. 브라우저는 non-extractable CryptoKey로 import하여 메모리에만 유지합니다. 키 버전을 기록하고 포장용 키 회전 시 기존 키를 다시 감싸며, 복구 가능한 초안이 있는 상태에서 키를 무조건 폐기하지 않습니다.

같은 계정으로 **온라인 재인증한 뒤** 재시작 전 초안을 복구합니다. 계정/환경별 저장을 분리하고, 탭별 draft ID·revision과 transaction 기반 조건부 삭제로 다른 탭의 초안을 지우지 않습니다. 재시작 때는 같은 계정의 복구 목록에서 초안을 선택하게 하며 이전 tab ID가 없어졌다는 이유로 초안을 잃지 않게 합니다. session epoch와 BroadcastChannel로 만료·로그아웃·늦은 응답을 처리합니다.

IndexedDB 저장 완료 후에만 서버로 전송합니다. quota·암호화·키 조회 실패 시 평문 저장으로 우회하지 않습니다. 재연결 시에도 보호 저장 성공을 먼저 확인합니다.

이 방식은 **DPAPI나 종단간 암호화가 아닙니다.** 서버는 키와 데이터를 처리할 수 있습니다. non-extractable은 export 제한이지 XSS의 키 사용을 막는 장치가 아닙니다. 악성 확장, 열린 세션의 기기 접근, 서버와 포장용 키의 동시 침해를 막는다고 주장하지 않습니다. 브라우저 데이터 삭제·저장소 회수·포장용 키 영구 손실 시 미전송 초안을 잃을 수 있습니다. 지속 저장 요청은 보조수단이며 보장이 아닙니다. 서버 저장 완료 데이터는 PostgreSQL에 남습니다. [Web Crypto 키](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey), [브라우저 지속 저장](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)

## 7. 비용·승인 범위와 현재 상태

Hobby는 개인 비상업적 용도로 제한되며 사용량 제한이 있습니다. 한 명만 사용하는 앱이라도 회사 업무·수익 활동에 쓰는지 확인해야 합니다. 현재 계정의 적합성이나 무료 무제한 사용을 가정하지 않습니다. Vercel 외에 PostgreSQL·로그인 제공처의 비용/휴면/백업/한도도 확인해야 합니다. [Hobby 공식 안내](https://vercel.com/docs/plans/hobby)

이번 단계는 문서 작성입니다. 새 코드, 계정 연결, 프로젝트·DB·OIDC client 생성, 비밀값 설정, GitHub push, Preview/Production 배포를 하지 않습니다. 구현 승인은 로컬 코드·테스트와 구분하고, 외부 자원/인증 설정 및 운영 배포는 대상·비용·권한을 제시한 뒤 별도로 승인받습니다. Library HTTP403을 우회하거나 업로드를 재시도하지 않습니다.

현재 차단은 운영 PostgreSQL/OIDC 제공처 미정, 계정·비용·보호 설정 미확인, 실제 Vercel 패키징·인증·다중 PC 검증 미실행입니다. Windows 설치/DPAPI는 웹 수락 기준에서 제외하지만 기존 미완료 기록을 삭제하지 않습니다. 실행 순서와 필요한 결정은 다음 구현 계획에 정리합니다.
