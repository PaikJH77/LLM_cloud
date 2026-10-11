# 최종 검증 결과 — 2026-10-11

소스 기준: `67d3fb4`, 전용 브랜치 `feat/windows-project-planner`, 원본 `1b4e8c7`.
계획 작업 1–8 구현·로컬 검증 완료. 작업 9는 Forge 설정과 Windows 절차 작성 완료이며 **실제 Windows 수락 검증은 차단**입니다. 원격 push/PR/공개 배포/운영 서비스/지속 자격증명 설정을 수행하지 않았습니다. 기존 README와 예제 파일을 보존했습니다.

## 실행 환경과 결과

Linux Debian 13 x64, Node 24.19.0, npm 11.9.0, Electron 44.7.0, PostgreSQL 17.6, Keycloak 26.4.0. PostgreSQL/Keycloak은 loopback에만 노출된 격리 Docker 시험 서비스입니다.

| 검증 | 최종 결과 | 범위 |
|---|---|---|
| `npm run typecheck` | PASS | 전체 TypeScript |
| `npm test` | 35 단위 + 11 API PASS | 날짜/진행률/경합/IPC/JWT 및 실제 DB/OIDC |
| `npm run test:ui` | 6 PASS | 모의 bridge Chromium UI, 한글, 표/간트, 원격 변경 중 드래그 취소 |
| `DISPLAY=:98 npm run test:e2e` | 6 PASS | 실제 PKCE/DB/복수 renderer 동기화/타 계정 차단/장애/강제 종료 복구 + Linux Electron 시작 |
| `npx tsx scripts/check-db-restart.ts` | PASS | 실제 PostgreSQL 재시작 후 동일 요청 결과 |
| `npm run build` | PASS | renderer/main/preload; renderer 342 KiB 크기 권고 경고 |
| Forge `package --platform=linux --arch=x64` | PASS | 실제 Linux Electron 패키지 생성 |
| `npm audit --omit=dev` | 취약점 0 | 실행 당시 운영 의존성; 개발 의존성 감사와 구분 |
| `npx tsx scripts/verify-windows.ts` | BLOCKED, exit 2 | Linux를 Windows 검증으로 잘못 처리하지 않음 |

[로그](logs/)에는 최종 실행 자료와 마지막 독립 검토의 RED 회귀 테스트를 보존했습니다. 단위/API/UI/E2E 총 58개 통과입니다. 세 시간대 도메인 테스트와 초기 단계별 RED/GREEN 기록은 [진행 기록](progress.md)에 있습니다.

## 독립 검토 및 수정

단계별 독립 검토에서 발견한 소유자 간 작업 ID 경합, 오래된 응답의 초안 삭제/중복 전송, 세션 epoch, 편집기 사이 초안 덮어쓰기를 회귀 테스트로 고쳤습니다. 마지막 별도 검토자는 Critical 0, Important 3을 보고했고 모두 한 번의 수정 패스에서 재현 테스트를 추가해 고쳤습니다.

- 보호 저장 실패 후 자동 새로고침이 저장을 건너뛰고 전송하던 문제: 재시도 전 보호 저장 성공을 요구.
- 닫힌 화면의 충돌 취소 응답이 새 화면 초안을 삭제하던 문제: 비동기 재개 시 폐기/리비전 검사.
- 드래그 중 수신한 새 버전으로 오래된 날짜를 덮어쓰던 문제: 버전 변경 시 안내하고 드래그 취소. 새 데이터에서 다시 드래그 가능.

## 산출물과 재현

- [개발·실행 안내](../development.md), [변경 파일](changed-files.txt), [단계별 커밋](commits.txt)
- [승인 설계](../superpowers/specs/2026-10-11-windows-project-planner.md), [승인 계획](../superpowers/plans/2026-10-11-windows-project-planner.md)
- [모의 UI 화면](ui-mock.png)
- `dist/`: 빌드한 renderer/main/preload
- `apps/desktop/out/ProjectPlanner-linux-x64/`: Linux 패키지. Windows 설치기 아님.
- `artifacts/planner-source.bundle`: 로컬 브랜치 Git bundle
- `artifacts/planner-bundles.tar.gz`: dist 번들, Electron 런타임 미포함
- `artifacts/SHA256SUMS`: 위 전달용 파일 체크섬

브랜치와 작업 디렉터리를 보존합니다. 전달용 파일은 Git에서 제외하며 마지막 문서 커밋 이후 생성합니다. Git bundle은 `git clone -b feat/windows-project-planner planner-source.bundle planner`로 별도 복원할 수 있습니다. 실행은 개발 안내의 `npm ci`부터 따릅니다.

## 남은 차단과 정확한 한계

실제 Windows 11 x64가 없어 설치·재설치/업데이트·제거, 경로/한글, DPAPI와 Windows 앱 강제 종료, 서로 다른 Windows PC 2대 수락 검증은 미완료입니다. [Windows 절차](../windows-verification.md)와 [릴리스 체크리스트](../release-checklist.md)에 차단을 표시했습니다. 사용자 PC 변경 권한도 현재 범위에 없습니다.

실제 서비스 E2E는 Node binding으로 실제 renderer/API client를 연결합니다. 테스트 암호화 저장소는 AES-GCM이며 DPAPI가 아닙니다. 강제 종료 대상은 별도 Node 클라이언트 프로세스입니다. Linux Electron smoke는 시험용 `--no-sandbox`와 Xvfb를 사용하여 OS sandbox 검증을 주장하지 않습니다.

실사용을 위해 별도 승인이 필요한 작업: 선택한 HTTPS API/PostgreSQL 호스팅 생성·배포, 운영 OIDC public client 등록 및 Windows 앱 연결 설정, 필요 시 유료 자원/코드 서명 인증서/설치기 배포, 사용자 Windows PC 설치·검증. 현재 운영 endpoint와 자격증명은 구성하지 않았으며 설치 즉시 여러 PC에서 사용할 수 있는 출시 상태는 아닙니다. 자동 업데이트 서비스도 구현 범위에 포함하지 않았습니다.
