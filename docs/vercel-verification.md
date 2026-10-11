# 웹 전환 검증 기록

기준: 2026-10-11, Linux Debian 13 / Node 24 / Chromium / 격리 PostgreSQL 17.6 / Keycloak 26.4.0. 브랜치 `feat/vercel-project-planner`, 원본 `5b1e3cb480ddcebadedada5e7d697c9417eb60f7`.

## 검증 층위

| 검증 | 명령/파일 | 범위 |
|---|---|---|
| 기존 단위 | `npm run test:unit` | 날짜 양끝 포함·null/0·기존 sync 회귀 |
| 기존 실제 SQL/API | `npm run test:api` | 소유자 간 task UUID 충돌·영구 요청 중복 방지·JWT 검증 |
| 웹 단위/실제 PG·Keycloak 혼합 | `npm run test:web:unit` | routing, owner/security, pool/migration, wrapped key 회전, fake IndexedDB CAS/암호화, quota 실패 재시도 전송 0, epoch401, 프로세스/DB restart |
| 새 웹 실제 브라우저 | `npm run test:web:ui` | 브라우저→Keycloak PKCE→실제 same-origin Fastify→PostgreSQL. 두 독립 context 동시 수정/재전송, 응답 유실, offline와 새 탭 복구, SIGKILL 브라우저 재시작, logout/expiry, 간트·표·IME·null/0·보관/복원 |
| 기존 모의 UI | `npm run test:ui` | mock bridge 화면 검증. 실제 서비스 동기화로 계산하지 않음 |
| 기존 E2E | `DISPLAY=:98 npm run test:e2e` | 실제 서비스+Node bridge, Linux Electron smoke 및 기존 복구. 새 웹 browser fetch 검증과 별도 |

새 웹 브라우저는 서버 API를 mock하지 않는다. 응답 유실 시험 한 요청은 Playwright route.fetch로 실제 서버 commit을 받은 후 클라이언트 응답만 끊는다. SQL/프로세스 시험은 두 독립 Node 프로세스가 동일 격리 PostgreSQL을 사용한다. 브라우저 강제 종료는 별도 임시 profile의 Chromium process group에 SIGKILL 후 같은 profile로 재실행한다. 시험 키는 명시적인 공개 fixture이며 운영 보안으로 주장하지 않는다.

## 실패를 통해 확인한 사항

- 새 routing/migration/owner-policy/draft-store 테스트는 구현 모듈 부재로 RED 후 구현과 함께 GREEN.
- 독립 검토: partial unmanaged schema 등록 결함 → 관리 대상 전체 검사와 거부 회귀.
- 독립 검토: 타 탭 logout 후 화면 잔류·SDK 만료 타이머 취소·401에서 key 유지 → 전용 종료 이벤트, 메모리 SDK user, 현재 epoch만 invalidation.
- fixture 서버 재시작 시 무작위 master key를 새로 만들어 과거 wrapped key가 열리지 않는 실패를 확인했다. 제품 코드는 잠금을 유지했고, 시험 harness만 공개 fixture key를 안정적으로 재사용하도록 수정했다. 운영 key 보존 필요성을 입증한 사례다.
- JSONB replay의 property 순서 차이로 문자열 비교가 실패하여 객체 의미 비교로 수정했다. DB 응답 내용 불일치가 아니었다.
- 실제 네트워크 UI는 앞선 저장이 끝난 후 다음 pointer 조작을 해야 한다. 저장 중 잠금을 무시한 테스트를 버튼 활성화 대기로 고쳐 이동/resize/Esc를 검증했다.

## 계획 판단과 제한

- 전용 브랜치는 사용자가 허용한 격리 방식이다. Sites/Vinext/D1 초안은 미채택이며 파일을 보존했다.
- Generic `oidc-client-ts`를 사용해 로컬 Keycloak과 후보 Auth0의 public SPA PKCE 계약을 공유한다. Auth0 실제 tenant 호환성은 아직 검증하지 않았다.
- 기존 UI와 sync controller를 adapter로 재사용하므로 기존 회귀 테스트도 함께 실행한다. 기존 테스트 수를 새 웹 테스트로 재분류하지 않는다.
- 초안 여러 개는 로그인 후 복구 선택으로 고르고, 자동 병합하지 않는다. stale revision은 잠금 오류로 보호한다.
- 실제 Vercel 패키징, Neon pooled endpoint/TLS/권한, Auth0 tenant, Preview/Production, 유료 한도, 두 실제 PC 수락 시험은 외부 승인/접근이 없어 미실행이다.
- Windows 설치·업데이트·DPAPI 검증은 이 Linux 웹 결과와 무관하며 기존 차단 상태다.
- 빌드의 약 420 KiB JS 크기에 webpack 성능 권고 경고가 있다. 빌드는 성공하며 코드 분할은 후속 최적화다.

## 최종 결과

최종 제품 코드 `2021637fef403aedd163a708fb5da631d7567306`에서 typecheck와 build:web 성공. 전체 순차 검증 **89/89 통과**, 실패 0: 기존 단위35 + 실제 API11 + 새 웹 단위/통합18 + 새 웹 실제 브라우저13 + 기존 모의 UI6 + 기존 E2E6. 새 웹 검증31건과 기존58건을 구분했다.

최종 독립 검토(gpt-6-astra, 새 문맥)는 Important 2건을 재현했다. 폐기 로그아웃의 다른 탭 초안 삭제와 보존 로그아웃의 pending 저장 유실이다. 각각 RED 확인 후 owned revision 폐기와 성공 flush 대기로 수정했다. 보호 저장 실패 시 보존 로그아웃은 실패를 알리고 세션을 유지한다. targeted7건 및 전체89건으로 수정 검증했으며 재검토를 완료했다고 주장하지 않는다.

Minor로 지적된 실제 변조 assertion 누락은 승인 계획 작업4의 필수 시험이므로 ciphertext/IV/revision AAD를 실제 변경하는 시험을 추가해 통과했다. 제품 구현 추가 변경은 없었다. 보류한 코드 수정 사항은 없다. 약420 KiB 번들 성능 권고는 남는다.

검토자가 판단을 유보한 hostedVercel/Auth0/Neon/Windows/두PC 항목은 승인 경계와 동일하다. 로컬 시험으로 대체하지 않고 외부 단계 차단으로 유지한다.

전체 명령 출력: [최종 검증 로그](verification/vercel-final-output.txt). 실제 웹 화면: [웹 화면](verification/web-local.png). 실행법: [runbook](vercel-runbook.md). 격리 서비스는 시험 후 종료·삭제했다.

로컬 커밋:

- `8f2b025`: 웹 진입점·build·승인 문서
- `8a08fc0`: bounded pool과 checksum migration
- `978c2bc`: owner 정책·브라우저 OIDC
- `abdcf69`: wrapped key와 IDB 암호화/CAS
- `e321626`: UI/bridge·복구·실제 브라우저/장애 검증·runbook
- `2021637`: 최종 검토의 로그아웃 초안 손실 2건 수정

원격 push/PR/배포·운영 계정/자격증명·DNS·유료 자원은 생성하지 않았다. 기존 Sites 미채택 초안 2개는 수정하지 않고 untracked로 보존했다.

