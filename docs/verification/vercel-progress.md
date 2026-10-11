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

## 작업 5–6 검증과 판단
- 웹 bridge를 기존 App/프로젝트/표/간트/controller에 연결했다. desktop 구현은 변경하지 않았다.
- 실제 브라우저 PKCE·다른 계정 거부·강제 종료 후 IDB 복구·동시 수정·8회 재전송·commit후 응답 유실·offline·cross-tab logout 개별 검증 통과.
- 순수 fake IndexedDB와 실제 PostgreSQL/Keycloak/browser 시험을 분리해 기록한다. 기존 58개는 새 웹 테스트로 재계산하지 않는다.
- Ruling: 승인된 분리 브랜치 사용 — 기존 Windows branch 보존 — 잘못된 선택이면 후속 worktree로 옮기는 비용.
- Ruling: oidc-client-ts generic publicSPA PKCE 선택 — 로컬 Keycloak/후보 Auth0 공통 계약 — 실제 Auth0 tenant에서 추가 adapter가 필요할 수 있음.
- Ruling: cloud skill helper script를 로컬에 실행할 수 없어 이 추적 문서를 ledger로 사용 — 명령/검토/결정을 Git에 보존 — helper의 자동 누락 검사는 제공되지 않음.
- Ruling: 사용자 요청에 따라 중간 독립 검토도 수행 — 실행 skill의 단일 최종검토보다 우선 — 추가 검토 시간만 소요.

## 최종 결과
- Task 1–6: complete, 로컬 범위. typecheck/build:web 및 전체 suite89/89. 최종 제품 커밋2021637.
- Final: fixed 다른 탭 폐기 손실 — discard 회귀 RED→GREEN, 실제 두 탭 복구도 통과.
- Final: fixed 보존 로그아웃 pending 저장 유실 — 느린 암호화/쓰기 실패 2건 RED→GREEN; flush 실패는 로그인 유지.
- Final: Ruling: Minor 변조 assertion은 승인 계획 필수 검증이므로 추가 — 기존 구현 변경 없이 ciphertext/IV/AAD 변조 거부 증명 — 잘못되면 테스트 유지 비용만 발생.
- Final: Ruling: hostedVercel/Auth0/Neon/Windows/두PC 검증은 미실행 유지 — 로컬시험으로 대체할 수 없고 외부 승인 범위 밖 — 실제 서비스 연결 시 추가 수정 가능.
- 마무리: 사용자가 이미 로컬 작업만 허용했으므로 finishing skill의 branch 보존 선택 적용. merge/push/PR 질문을 반복하지 않음.
- 격리 서비스 종료. 소스·문서·스크린샷·검증 로그 보존. 중요한 발견은 재현시험과 전체회귀로 검증했다.
