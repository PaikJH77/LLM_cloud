# Vercel 전환 실행 기록

승인: 2026-10-11 09:40 UTC, 계획대로 로컬 작업 1–6 진행. 개인 비상업적 용도, 유료 자원 금지. 외부 계정·DNS·배포·push·PR·운영 자격증명 설정은 범위 밖이다.

원본: 5b1e3cb480ddcebadedada5e7d697c9417eb60f7. 분리 브랜치 feat/vercel-project-planner. 승인 Page 전문은 ../superpowers/plans/2026-10-11-vercel-approved-page.md. Sites 초안은 미채택 상태로 보존한다.

실행 판단: 사용자가 분리 브랜치 또는 worktree를 허용했으므로 전용 브랜치를 사용한다. 새 외부 환경 없이 기존 격리 PostgreSQL/Keycloak만 사용한다. 각 작업의 RED/GREEN과 검토 결과를 아래에 기록한다.

## 작업 1
- RED: 새 web routing 테스트를 먼저 추가, 구현 모듈 부재 실패를 확인한다.

## 작업 1–4 중간 결과
- Routing RED(모듈 없음) → GREEN 1건. 웹 빌드·typecheck 통과, renderer 419 KiB webpack 권고 경고 있음.
- PostgreSQL RED(모듈 없음) → GREEN. 인스턴스 pool 재사용, migration 재실행·checksum 검증. 독립 검토에서 partial unmanaged schema 등록 결함 발견, 전체 관리 테이블 존재 검사와 회귀 테스트로 수정.
- Owner policy RED(모듈 없음) → GREEN. 실제 Keycloak의 허용 계정/타 계정, 변조 서명, 다른 audience, Origin/cookie 경계 확인.
- 브라우저 IDB RED(모듈 없음) → GREEN. 암호문, 잘못된 키·계정, CAS 저장/삭제, 세션 무효화 검증. 서버 wrapped data key의 master rotation 및 키 손실 실패 확인.
- 독립 검토에서 로그아웃의 화면 초기화 누락, SDK 만료 타이머 취소, API 401에서 메모리 키 유지 발견. 세션 종료 이벤트·SDK 메모리 user 유지·현재 epoch 401 logout으로 수정. 실제 브라우저 회귀 진행 중.
- 실제 Chromium→Keycloak PKCE→Fastify→PostgreSQL 로그인/타 계정 거부 2건 통과. 운영 Auth0/Neon/Vercel 검증 아님.
