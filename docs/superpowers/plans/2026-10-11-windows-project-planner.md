# 개인용 Windows 프로젝트 플래너 구현 계획

Source: https://chatgpt.com/space/page_2123875f603881919836ae86c551d3ff

Approved by user: 2026-10-11. This is the approved source snapshot; implementation status is tracked separately.

> **작업자 안내:** 승인된 Codex 클라우드 환경에서 작업별로 구현하고 독립 검토를 거친다. 각 작업은 실패 테스트 작성 → 실패 확인 → 최소 구현 → 통과 확인 → 커밋 순서로 수행하며 체크박스로 진행을 기록한다.

**Goal:** 한 사람이 여러 Windows PC에서 프로젝트 목록과 작업 표·간트 차트를 사용하고 온라인에서 안전하게 동기화하는 설치형 앱을 만든다.

**Architecture:** 일정 계산과 데이터 계약을 공통 모듈로 분리한다. Electron 앱은 인증·보호 저장·서버 통신을 담당하는 메인 프로세스와 React 화면으로 구성한다. 중앙 서비스는 소유자 검사와 프로젝트 단위 트랜잭션을 제공하는 독립 API로 만들어 특정 클라우드 업체에 종속되지 않게 한다.

**Tech Stack:** TypeScript, React, Electron, Electron Forge와 webpack, Fastify, PostgreSQL, 표준 OIDC, Vitest, Playwright. 자체 호스팅 인증의 개발 검증 후보는 Keycloak이다.

**Spec:** [승인된 설계](https://chatgpt.com/space/page_216f8f83c2308191be7b6eaa31b0c246)

**현재 단계:** 구현 전 계획 검토. 2026년 10월 11일 확인 시 사용자가 지정한 Codex 클라우드 개발 환경은 등록되어 있지 않다. 환경이 준비되면 그 환경에서 시작하며 사용자 PC나 다른 실행 환경으로 임의 변경하지 않는다. 저장소가 준비되면 이 계획을 docs/superpowers/plans/2026-10-11-windows-project-planner.md에 저장한다. 코드 작성·빌드·테스트·설치기 생성은 아직 수행하지 않았다.

## 공통 제약

- 첫 화면은 프로젝트 목록이며 이름 검색, 마감일순·최근 수정순 정렬, 보관 목록, 휴지통을 제공한다

- 프로젝트 생성·수정·보관·보관 해제·삭제·복원과 작업 추가·수정·삭제·복원·순서 변경을 지원한다

- 보관 프로젝트는 읽기 전용이다. 자동 영구 삭제와 휴지통 비우기는 제공하지 않는다

- 날짜는 시간대 없는 달력 날짜다. 시작·종료를 모두 포함하며 같은 날은 1일, 주말·공휴일도 포함한다

- 작업 날짜는 둘 다 비우거나 둘 다 지정한다. 오늘 표시는 한국시간, 서버 기록은 UTC다

- 진행률은 null 또는 0~100 정수다. null은 0이 아니다

- 삭제되지 않은 작업 전체가 입력됐을 때만 동일 비중 평균을 표시한다. 빈 프로젝트와 일부 미입력은 ‘미산정’ 및 입력 완료 개수를 표시한다. 평균은 연구 성과의 독립 검증을 의미하지 않는다

- 편집은 온라인 전용이다. 입력 확정·드래그 종료 시 저장하며 서버 확인 전에 ‘저장됨’을 표시하지 않는다

- 저장 중 해당 프로젝트의 추가 변경을 잠근다. 활성 화면은 최대 10초 간격, 활성화·재연결 시 즉시 조회한다

- 모든 조회·변경은 소유자를 검사한다. 작업 변경도 프로젝트 버전을 올리며 버전 검사·변경·요청 기록은 원자적으로 처리한다

- 미저장 변경은 Windows 사용자별 보호 저장소에 보존한다. 계정 전환으로 다른 계정의 변경안이 노출되면 안 된다

- 첫 검증 대상은 Windows 11 x64다. Linux 테스트나 설치 파일 생성만으로 Windows 검증 완료라고 표시하지 않는다

- 공동 작업, 의존관계, 첨부파일, 알림, 오프라인 편집은 제외한다

## 검토 집중 항목

1. 같은 요청의 동시 재전송 및 응답만 유실된 경우: 생성·변경은 정확히 한 번만 적용한다. 작업 2·7·8에서 검증한다

2. 편집 중 다른 PC에서 보관·삭제한 경우: 오래된 변경안을 자동 적용하거나 삭제 항목을 되살리지 않는다. 작업 2·7에서 검증한다

3. 날짜 경계·다른 OS 시간대·한국시간 자정: 기간과 오늘 표시가 일관돼야 한다. 작업 1·6에서 검증한다

4. 한글 입력 조합·빈 값·드래그 취소: 입력을 조기 저장하거나 null을 0으로 바꾸지 않는다. 작업 5·6에서 검증한다

5. 계정 변경·앱 재시작·보호 저장 실패: 다른 계정 초안을 노출하지 않고 복구 실패를 숨기지 않는다. 작업 4·7·9에서 검증한다

## 기술 선택과 승인 경계

Electron을 제안한다. 표·간트 UI와 계산 코드를 Linux에서 검증하고 Windows 데스크톱 앱으로 묶을 수 있다. Forge의 webpack 플러그인은 메인·렌더러·preload 빌드를 지원한다. [공식 문서](https://www.electronforge.io/config/plugins/webpack)

Windows 설치기는 Squirrel.Windows로 만든다. 공식적으로 Windows 또는 Mono와 Wine이 있는 Linux에서 생성할 수 있으나 이 계획은 실제 Windows 빌드·실행을 최종 기준으로 삼는다. 첫 버전 업데이트는 새 설치기를 실행하는 수동 업데이트로 검증하며 자동 업데이트 서비스는 추가하지 않는다. [설치기 문서](https://www.electronforge.io/config/makers/squirrel.windows)

중앙 API와 PostgreSQL은 자체 호스팅할 수 있게 작성한다. 인증은 OIDC Authorization Code와 PKCE를 사용하고 개발 환경에서는 Keycloak으로 검증한다. 운영 인증·저장 제공업체는 아직 선택하지 않았다. [OIDC 문서](https://www.keycloak.org/securing-apps/oidc-layers)

운영 호스팅·도메인·인증 제공업체·월 비용·코드 서명·배포 대상은 별도 승인 대상이다. 개발 검증에 유료 서비스나 기존 계정을 가정하지 않는다. 실제 계정 생성, 지속 접근용 인증 설정, 비밀정보 입력, 공개 배포는 해당 단계에서 승인 또는 사용자 인계를 받는다. 클라우드 개발 환경에 PostgreSQL·컨테이너·브라우저 실행 지원이 없으면 필요한 지원을 먼저 확인하며 모의 테스트를 실제 연동 테스트로 대체 보고하지 않는다.

## 파일 구조

모든 경로는 앞으로 생성할 저장소 기준이다. 중괄호는 해당 디렉터리에 생성할 개별 파일의 축약 표기다.

- package.json, package-lock.json, tsconfig.json, vitest.config.ts, playwright.config.ts: 버전·스크립트·검증 설정

- packages/core/src/{model,contracts,dates,progress}.ts: 공통 모델, API 계약, 일정·진행률 계산

- apps/api/src/{server,auth,db}.ts: API 시작, 토큰 검증, DB 연결

- apps/api/src/projects/{routes,queries,mutate}.ts: 조회·변경·트랜잭션

- apps/api/migrations/001_initial.sql: 프로젝트·작업·요청 기록

- apps/desktop/{package.json,forge.config.ts,webpack.main.config.ts,webpack.renderer.config.ts}: 데스크톱 빌드

- apps/desktop/src/main/{index,auth,api-client,draft-store,ipc}.ts: 운영체제·인증·통신 경계

- apps/desktop/src/preload.ts: 제한된 타입 기반 화면 API

- apps/desktop/src/renderer/{index.html,index.tsx,App.tsx,styles.css}: 앱 시작·공통 화면

- apps/desktop/src/renderer/projects/{ProjectList,ProjectDetail,TrashView}.tsx: 목록·상세·휴지통

- apps/desktop/src/renderer/tasks/{TaskTable,GanttChart}.tsx: 작업 표·차트

- apps/desktop/src/renderer/tasks/gantt-geometry.ts: 막대 좌표·기간 변환

- apps/desktop/src/renderer/sync/{controller,types}.ts: 저장·동기화 상태

- apps/desktop/src/renderer/sync/{StatusBar,ConflictDialog}.tsx: 상태·충돌 안내

- tests/unit/{domain,draft-store,sync-controller}.test.ts

- tests/api/{mutations,auth}.test.ts

- tests/ui/{projects,gantt}.spec.ts

- tests/e2e/{real-sync,electron-smoke}.spec.ts

- tests/support/{fixtures,mock-bridge,web-harness,fault-proxy}.ts

- infra/{compose.test.yml,oidc-test-realm.json}

- scripts/{test-services,verify-windows}.ts

- docs/{development,windows-verification,release-checklist}.md

## 데이터와 명령 계약

작업 1에서 아래 타입을 만들고 이후 작업은 이름과 필드를 그대로 사용한다. ID는 UUID 문자열, DateOnly는 엄격히 검증한 YYYY-MM-DD 문자열, Instant는 UTC ISO 시각 문자열이다. 문자열 이름은 앞뒤 공백 제거 후 비어 있으면 거절한다.

```typescript
type Principal = {
  ownerId: string; issuer: string; subject: string;
};
type Project = {
  id: string; ownerId: string; name: string;
  deadline: DateOnly | null; version: number;
  createdAt: Instant; updatedAt: Instant;
  archivedAt: Instant | null; deletedAt: Instant | null;
};
type Task = {
  id: string; projectId: string; name: string;
  start: DateOnly | null; end: DateOnly | null;
  progress: number | null; position: number;
  createdAt: Instant; updatedAt: Instant;
  deletedAt: Instant | null;
  deletedByProjectRequestId: string | null;
};
type ProgressSummary = {
  value: number | null; entered: number; total: number;
};
type Snapshot = { project: Project; tasks: Task[] };
type ProjectListItem = { project: Project; progress: ProgressSummary };
type ProjectListFilter = {
  state: 'active' | 'archived' | 'trashed';
  query: string;
  sort: 'deadlineAsc' | 'updatedDesc';
};
type ProjectFields = { name: string; deadline: DateOnly | null };
type TaskFields = {
  name: string; start: DateOnly | null; end: DateOnly | null;
  progress: number | null;
};
type Operation =
  | { type: 'createProject'; fields: ProjectFields }
  | { type: 'updateProject'; fields: ProjectFields }
  | { type: 'archiveProject' }
  | { type: 'unarchiveProject' }
  | { type: 'trashProject' }
  | { type: 'restoreProject' }
  | { type: 'createTask'; taskId: string; fields: TaskFields }
  | { type: 'updateTask'; taskId: string; fields: TaskFields }
  | { type: 'trashTask'; taskId: string }
  | { type: 'restoreTask'; taskId: string }
  | { type: 'reorderTasks'; taskIds: string[] };
type Command = {
  requestId: string; projectId: string;
  expectedVersion: number; operation: Operation;
};
type RejectCode =
  | 'INVALID_INPUT' | 'NOT_FOUND' | 'ARCHIVED'
  | 'DELETED' | 'REQUEST_ID_REUSED';
type MutationResult =
  | { kind: 'applied'; snapshot: Snapshot }
  | { kind: 'conflict'; latest: Snapshot }
  | { kind: 'rejected'; code: RejectCode };
type DraftFields =
  | { kind: 'project'; name: string; deadline: string }
  | { kind: 'task'; taskId: string; name: string;
      start: string; end: string; progress: string }
  | { kind: 'operation'; operation: Operation };
type Draft = {
  principalKey: string; projectId: string;
  base: Snapshot | null; editedFields: DraftFields;
  command: Command | null;
  phase: 'editing' | 'prepared' | 'unknown' | 'conflict';
  savedLocallyAt: Instant;
};
interface PlannerGateway {
  listProjects(filter: ProjectListFilter): Promise<ProjectListItem[]>;
  getProject(id: string): Promise<Snapshot>;
  mutate(command: Command): Promise<MutationResult>;
  requestStatus(requestId: string): Promise<MutationResult | null>;
}
interface DraftStore {
  save(draft: Draft): Promise<void>;
  load(principalKey: string): Promise<Draft[]>;
  remove(principalKey: string, projectId: string): Promise<void>;
}
```

프로젝트 생성은 Command.projectId를 사용하며 expectedVersion=0, 생성 후 version=1이다. 모든 후속 성공 변경은 version을 1 증가시킨다. 소유자는 요청 본문이 아니라 검증된 로그인에서 정한다. 작업 생성은 마지막 위치에 추가하고 순서 변경은 현재 살아 있는 모든 작업 ID의 중복 없는 완전한 순열을 받는다. 복원 작업은 기존 위치로 삽입하고 동률은 ID 순서로 정규화한다.

updateProject와 updateTask는 부분 patch가 아닌 완전한 입력 필드를 받는다. TaskFields의 날짜 두 개는 함께 검증한다. 초안은 잘못된 입력값도 복구할 수 있도록 문자열 상태를 보존하며 유효성 검증 후 Operation으로 변환한다.

목록 API가 ProjectListItem.progress를 함께 반환하므로 목록이 작업별 상세 조회에 의존하지 않는다. 평균은 원값을 유지하고 표시만 소수점 첫째 자리까지 반올림한다. 미정 마감일은 뒤로, 정렬 동률은 ID 오름차순이다. 이름 검색은 대소문자를 무시하는 부분 문자열 비교다.

Snapshot.tasks에는 삭제된 작업도 포함해 작업 휴지통과 충돌 비교에 사용한다. 화면·진행률·순서 변경 대상은 deletedAt=null인 작업만이다. 프로젝트 삭제 시 당시 살아 있던 작업만 해당 requestId로 표시하여 함께 삭제하고, 복원은 그 묶음만 되살린다. 프로젝트의 기존 보관 상태는 복원 후에도 유지한다.

## 작업 1 계산 규칙과 계약 고정

**Files:** 공통 모델 네 파일, 루트 설정 파일, tests/unit/domain.test.ts

**Interfaces:** parseDateOnly(value: string): DateOnly; inclusiveDays(start: DateOnly,end: DateOnly): number; shiftDates(start: DateOnly,end: DateOnly,deltaDays: number): {start: DateOnly;end: DateOnly}; todayKorea(now: Date): DateOnly; summarizeProgress(tasks: Task[]): ProgressSummary

- [ ] 실패 테스트 작성: inclusiveDays('2028-02-29','2028-02-29')는 1, 2028년 2월 28일~3월 1일은 3, 하루 이동 시 기간 유지. 잘못된 날짜·반쪽 날짜·역순·진행률 101·소수는 거절한다

- [ ] 진행률 테스트 작성: [0,null]의 value는 null, [0,100]은 50, 삭제 작업은 제외, 빈 목록은 null. 날짜 경과만으로 진행률이 바뀌지 않는다

- [ ] 도구 설정을 만들고 npm run test:unit -- tests/unit/domain.test.ts 실행: 미구현 함수 때문에 FAIL 확인

- [ ] UTC 기반 달력 연산과 엄격한 날짜 왕복 검증을 구현한다. 로컬 시간대에 의존하는 문자열 날짜 파싱은 사용하지 않는다. 동일 테스트를 UTC·서울·미국 시간대에서 PASS시킨다

- [ ] 공식 지원 Node LTS와 상호 호환되는 안정 버전을 선택해 package-lock.json에 잠근다. npm run typecheck 성공 후 해당 파일을 git add하고 feat: define planner domain contracts로 커밋한다

스크립트는 typecheck, test:unit, test:api, test:ui, test:e2e, build, make:win으로 통일한다. 테스트 스크립트는 추가 파일 경로 필터를 받는다. Vitest의 unit/api 프로젝트와 Playwright의 ui/e2e 프로젝트를 나누고 검증용 화면 서버는 공통 renderer webpack 설정을 재사용한다.

## 작업 2 중앙 저장과 원자적 변경

**Files:** apps/api/migrations/001_initial.sql, apps/api/src/db.ts, apps/api/src/projects/{queries,mutate}.ts, tests/api/mutations.test.ts, tests/support/fixtures.ts, infra/compose.test.yml, scripts/test-services.ts

**Interfaces:** applyCommand(db: Pool,principal: Principal,command: Command): Promise<MutationResult>; getSnapshot(db: Pool,principal: Principal,projectId: string): Promise<Snapshot>; listProjects(db: Pool,principal: Principal,filter: ProjectListFilter): Promise<ProjectListItem[]>; readRequest(db: Pool,principal: Principal,requestId: string): Promise<MutationResult|null>. Pool은 pg 패키지의 연결 풀이다.

- [ ] 실패 테스트 작성: 같은 버전의 병렬 수정 두 건은 적용 1건·충돌 1건, 작업 수정도 프로젝트 버전 +1, 요청 중복 생성은 행 1개, 같은 요청 ID에 다른 본문은 거절한다

- [ ] 삭제·복원 테스트 작성: 작업 A 개별 삭제 후 프로젝트 삭제·복원 시 A는 계속 삭제 상태, 함께 삭제된 B만 복원한다. 보관 중 작업 변경은 거절하고 삭제 작업을 일반 수정으로 되살리지 않는다. 정렬·목록 진행률도 검증한다

- [ ] npm run test:api -- tests/api/mutations.test.ts 실행해 FAIL 확인

- [ ] PostgreSQL 트랜잭션 구현: (ownerId,requestId) 유일 제약으로 요청을 예약하고 프로젝트 행 잠금 후 소유자·상태·버전을 검사한다. 변경·버전 증가·본문 해시·결과 기록을 함께 커밋한다. 중복 요청은 동일 결과를 반환한다. 프로젝트 삭제 시 이번 요청 ID로 함께 삭제된 작업을 표시한다

- [ ] 같은 명령으로 PASS 및 DB 재시작 후 중복 방지 유지 확인 후 해당 파일을 git add하고 feat: add transactional project storage로 커밋한다

신규 프로젝트는 ID 유일 제약과 생성 트랜잭션으로 동시 생성을 막는다. 요청 기록은 첫 버전에서 자동 만료시키지 않는다. 같은 요청 ID는 원래 처리 결과를 반환하므로 클라이언트는 복구 후 최신 스냅샷을 다시 읽는다. [PostgreSQL 행 잠금](https://www.postgresql.org/docs/current/explicit-locking.html)

## 작업 3 실제 인증과 소유자 검사 API

**Files:** apps/api/src/{server,auth}.ts, apps/api/src/projects/routes.ts, tests/api/auth.test.ts, infra/oidc-test-realm.json

**Interfaces:** authenticate(bearer: string): Promise<Principal>. HTTP 라우트는 PlannerGateway와 같은 입력·응답 계약을 사용한다.

- [ ] 실패 테스트 작성: 만료 토큰·잘못된 issuer/audience/서명은 401. 계정 B가 A의 프로젝트·작업·휴지통·요청 상태를 조회하거나 변경하면 데이터 없는 404다

- [ ] npm run test:api -- tests/api/auth.test.ts 실행해 FAIL 확인

- [ ] OIDC JWKS 서명 검증과 (issuer,subject) 사용자 매핑 구현. GET /projects?state=&query=&sort=, GET /projects/:id, POST /commands, GET /requests/:requestId에 모두 적용한다. HTTP 입력을 서버에서 재검증한다

- [ ] 격리된 개발 Keycloak·PostgreSQL로 PASS 확인. 잘못된 설정에서는 서버 시작을 실패시키며 운영 모드의 인증 우회는 허용하지 않는다

- [ ] 해당 파일을 git add하고 feat: enforce authenticated owner access로 커밋한다

성공 적용은 200, conflict는 409, INVALID_INPUT과 REQUEST_ID_REUSED는 422, ARCHIVED와 DELETED는 409, 타인 또는 없는 대상은 404다. 계정 본인의 미처리 requestStatus는 200과 null을 반환하며 타인 요청의 존재는 공개하지 않는다. 인증·연결 오류는 MutationResult와 분리된 gateway 오류로 변환한다.

개발 fixture와 실제 운영 OIDC 클라이언트 등록·인증 권한 변경은 구분한다. 운영 설정은 승인 후 진행한다.

## 작업 4 데스크톱 보안 경계와 보호된 초안

**Files:** apps/desktop 빌드 설정, apps/desktop/src/main/{index,auth,api-client,draft-store,ipc}.ts, apps/desktop/src/preload.ts, tests/unit/draft-store.test.ts, tests/e2e/electron-smoke.spec.ts

**Interfaces:** PlannerGateway, DraftStore; login(): Promise<Principal>; logout(choice: 'keep'|'discard'): Promise<void>. 메인 프로세스만 네트워크 토큰과 보호 저장소를 소유한다.

- [ ] 실패 테스트 작성: 저장 후 재시작 시 같은 계정만 복구, 다른 계정은 초안 목록이 비어 있음, 암호화 실패 시 평문 파일 없음, 잘못된 IPC 호출·외부 프레임 요청 거절

- [ ] npm run test:unit -- tests/unit/draft-store.test.ts 실행해 FAIL 확인

- [ ] safeStorage 암호화와 임시 파일→원자적 교체를 구현한다. 검증된 계정의 issuer/subject 키로 파일을 분리한다. 렌더러는 임의 경로·토큰·범용 IPC에 접근하지 못한다. 암호화 불가 시 편집을 잠그고 실패를 알린다

- [ ] 시스템 브라우저·PKCE·state·nonce와 루프백 callback 검증으로 로그인한다. 토큰은 메인 메모리에만 두고 재시작 시 재인증한다. 로그아웃은 초안 보존·폐기를 선택한 뒤 화면과 메모리를 비운다. 단위 테스트 및 Electron 시작 검증을 PASS시킨다

- [ ] 해당 파일을 git add하고 feat: protect desktop drafts and sessions로 커밋한다

렌더러는 nodeIntegration=false, contextIsolation=true, sandbox=true와 제한 CSP를 사용한다. 배포 앱에 관리자용 비밀키를 넣지 않는다. [보안 지침](https://www.electronjs.org/docs/latest/tutorial/security)

Windows safeStorage는 DPAPI를 사용하지만 같은 Windows 사용자 권한으로 실행되는 다른 프로그램까지 차단하는 보안 경계는 아니다. Linux의 모의 저장 테스트를 Windows DPAPI 검증으로 표시하지 않는다. [safeStorage 문서](https://www.electronjs.org/docs/latest/api/safe-storage)

## 작업 5 프로젝트 우선 화면과 복구 흐름

**Files:** apps/desktop/src/renderer 시작 파일, projects/{ProjectList,ProjectDetail,TrashView}.tsx, tests/ui/projects.spec.ts, tests/support/{mock-bridge,web-harness}.ts

**Interfaces:** ProjectList(props: {gateway: PlannerGateway}): ReactElement; ProjectDetail(props: {projectId: string;gateway: PlannerGateway}): ReactElement; TrashView(props: {gateway: PlannerGateway}): ReactElement. 목록은 ProjectListItem을 사용한다.

- [ ] 실패 테스트 작성: 시작 화면은 활성 프로젝트 목록, 생성 후 상세 이동, 빈 이름 거절, 한글 조합 중 저장 없음, 검색·두 정렬·미정 마감일·미산정 진행률·입력 완료 개수 표시

- [ ] npm run test:ui -- tests/ui/projects.spec.ts 실행해 FAIL 확인

- [ ] 목록·편집·보관·휴지통·복원을 구현한다. 삭제 확인에 대상 이름과 영향을 받는 살아 있는 작업 수를 표시한다. 보관 프로젝트는 편집 불가이고 보관 해제 후 편집 가능하다

- [ ] 키보드 탐색·명확한 포커스·문구와 아이콘 상태 표시, 청회색 배경·흰 카드·블루 강조색을 적용하고 같은 테스트 PASS 확인

- [ ] 해당 파일을 git add하고 feat: add project-first navigation and recovery로 커밋한다

이 단계는 모의 서버를 이용한 화면 검증이다. 실제 PC 간 동기화 성공으로 보고하지 않는다.

## 작업 6 작업 표와 간트 편집

**Files:** apps/desktop/src/renderer/tasks/{TaskTable,GanttChart}.tsx, apps/desktop/src/renderer/tasks/gantt-geometry.ts, tests/ui/gantt.spec.ts

**Interfaces:** DateRange={start:DateOnly;end:DateOnly}; moveRange(start:DateOnly,end:DateOnly,deltaDays:number):DateRange; resizeRange(start:DateOnly,end:DateOnly,edge:'start'|'end',deltaDays:number):DateRange; GanttChart(props:{snapshot:Snapshot;onCommit:(operation:Operation)=>Promise<void>}):ReactElement

- [ ] 실패 테스트 작성: 표와 막대의 날짜 결과 동일, 1일 이동 단위, 이동 시 기간 유지, 양 끝 조절, 역순 저장 거절, Esc 취소 시 요청 0건, 미정 작업 막대 없음

- [ ] 월말·윤년·주 단위 축에서도 하루 단위 조절, 한국시간 자정의 오늘 선, 마감일 초과 경고 후 저장 허용, 마감일 변경 시 작업 날짜 불변 테스트 추가

- [ ] npm run test:ui -- tests/ui/gantt.spec.ts 실행해 FAIL 확인

- [ ] 동일 행·선택·세로 스크롤을 공유하는 표와 간트, 열 너비·좌우 비율 조절, 일/주 축, 날짜 선택기, 작업 순서 변경을 구현한다. 드래그 예상 날짜를 표시하고 놓았을 때만 확정한다. resizeRange는 역순이면 유효성 오류를 반환 경로 대신 예외로 보고하고 저장하지 않는다

- [ ] PASS 및 키보드로 같은 날짜 수정 가능 확인 후 해당 파일을 git add하고 feat: add editable task grid and gantt로 커밋한다

표는 작업명·시작일·종료일·진행률을 제공한다. 미입력과 0%, 100%를 구분하며 각각 미입력·시작 전·완료로 표시한다. 날짜가 없는 작업은 ‘일정 미정’으로 표시한다.

## 작업 7 온라인 저장과 충돌 재연결

**Files:** apps/desktop/src/renderer/sync/{controller,types}.ts, apps/desktop/src/renderer/sync/{StatusBar,ConflictDialog}.tsx, tests/unit/sync-controller.test.ts

**Interfaces:** Clock={now():Date;setInterval(fn:()=>void,ms:number):unknown;clearInterval(id:unknown):void}. createSyncController(gateway:PlannerGateway,draftStore:DraftStore,clock:Clock,principal:Principal):SyncController. SyncController는 open(projectId:string):Promise<void>, edit(fields:DraftFields):Promise<void>, commit(operation:Operation):Promise<void>, refresh():Promise<void>, resolveConflict(choice:'latest'|'reapply'):Promise<void>, dispose():void와 읽기 전용 상태 구독을 제공한다. subscribe(listener:(state:SyncState)=>void):()=>void. SyncState는 snapshot:Snapshot|null, draft:Draft|null, status:'loading'|'saved'|'editing'|'saving'|'failed'|'offline'|'expired'|'conflict', lastConfirmedAt:Instant|null, error:string|null을 가진다.

- [ ] 실패 테스트 작성: 저장 확인 전 ‘저장됨’ 없음, 저장 중 추가 변경 잠김, 활성 상태에서 10,000ms 이내 조회 시작, 활성화·재연결 즉시 조회, 실패·401에서 편집 잠금과 마지막 확인 시각 표시

- [ ] 요청 전·전송 중·커밋 후 응답 유실 테스트 작성. 처리된 요청은 재적용하지 않고 미확인 요청은 같은 ID로 재시도한다. 충돌 재적용은 새 요청 ID와 최신 버전을 사용한다

- [ ] npm run test:unit -- tests/unit/sync-controller.test.ts 실행해 FAIL 확인

- [ ] 초안을 먼저 보호 저장한 뒤 전송하는 상태기계를 구현한다. 입력 중 원격 조회가 도착해도 초안을 덮어쓰지 않는다. 응답 유실 후 요청 상태를 확인하고 최신 스냅샷을 다시 조회한다. 연결 복구 전 새 편집·전송을 금지한다. 활성 목록도 같은 조회 주기로 갱신하며 중복 네트워크 요청은 합친다

- [ ] 다른 PC의 삭제·보관 및 연속 충돌 테스트를 PASS시킨 후 해당 파일을 git add하고 feat: coordinate safe online synchronization으로 커밋한다

충돌 창은 최신 값과 내 변경안을 나란히 보여준다. ‘최신 내용 사용’은 초안을 명시적으로 폐기한다. ‘내 변경안을 다시 적용’은 base와 editedFields의 실제 변경 필드만 최신 상태에 다시 적용하고 버전을 검사한다. 삭제 대상은 복구 명령 없이 되살리지 않는다. 초안 로컬 저장 실패와 동기화 실패를 각각 표시한다.

초안 저장 쓰기는 순서화하고 앱 종료 시 진행 중인 보호 저장이 끝날 때까지 기다린다. 강제 종료 검증은 보호 저장 완료 후 서버 저장 전의 시점과 응답 유실 시점을 포함한다. 로그인 만료 후 재인증 전에는 보호 초안을 화면에 노출하지 않는다.

## 작업 8 실제 동기화 검증

**Files:** tests/e2e/real-sync.spec.ts, tests/support/fault-proxy.ts, docs/development.md

**Interfaces:** 앞서 정의한 실제 API·OIDC·DB·화면 연결 전체

- [ ] 실패 시나리오 작성: 독립 클라이언트 A/B 동일 계정, 제3 클라이언트 다른 계정, 동시 변경, 서버 재시작, 응답 차단, 인증 만료, 초안 보존 후 앱 재시작

- [ ] npm run test:e2e -- tests/e2e/real-sync.spec.ts 실행해 아직 연결되지 않은 실제 경로의 FAIL 확인

- [ ] 모의 bridge 대신 실제 서비스 연결을 구성한다. 테스트는 임시 데이터만 사용하고 fixture가 운영 빌드에 포함되지 않게 한다

- [ ] npm run typecheck, npm run test:unit, npm run test:api, npm run test:ui, npm run test:e2e, npm run build를 실행하고 모두 PASS 확인

- [ ] 로그에 커밋·환경·서비스 버전·실행 명령·결과를 기록하고 해당 파일을 git add한 뒤 test: verify real authenticated synchronization으로 커밋한다

Linux에서 독립 클라이언트 두 개를 검증한 결과와 실제 Windows PC 두 대의 검증 결과는 구분한다. Electron 자동화는 Playwright의 실험적 지원이므로 실패 시 설치 앱 수동 검증을 생략하지 않는다. [Playwright 문서](https://playwright.dev/docs/api/class-electron)

## 작업 9 Windows 11 설치 업데이트 제거

**Files:** apps/desktop/forge.config.ts 수정, scripts/verify-windows.ts, docs/{windows-verification,release-checklist}.md

**Interfaces:** npm run make:win은 Forge make의 --platform=win32 --arch=x64 옵션으로 Windows x64 설치 산출물을 생성한다. 산출물·체크섬·검증 기록을 함께 보관한다.

- [ ] Windows 검증 절차와 예상 결과를 먼저 작성한다. 설치 전→새 설치→실행→로그인→동기화→초안 보존→새 버전 설치→제거→재설치를 포함한다

- [ ] 승인된 Windows 11 x64 환경에서 npm ci, 전체 테스트, npm run make:win을 실행한다. Windows 환경이 없으면 이 단계는 차단 상태로 남긴다

- [ ] Squirrel 시작 이벤트 처리와 고정 앱 식별자를 구현하고 v1/v2 설치기를 생성한다. 기존 버전 위 업데이트 후 서버 데이터와 보호 초안이 유지되는지 확인한다

- [ ] 두 Windows 인스턴스의 충돌·10초 조회·로그인 만료, Windows 사용자 간 DPAPI 격리, 앱 계정 전환, 100/125/150/200% 배율·키보드·한글 입력을 검증한다. 제거해도 서버 데이터가 남고 재설치·재로그인 후 조회되는지 확인한다

- [ ] 체크섬·결과·제한사항을 기록하고 해당 파일을 git add한 뒤 release: verify windows installer lifecycle로 커밋한다. 배포 승인이 있기 전에는 업로드·공개 배포하지 않는다

서명 없는 시험용 설치기는 그 사실을 표시한다. 인증서 구입·서명 자격증명 설정은 별도 승인 및 안전한 입력 절차가 필요하다. Windows 보안 경고를 자동 우회하지 않는다.

## 완료 표시 기준

1. **화면 시제품:** 계산·모의 UI 테스트 통과. 실제 동기화 미검증

2. **실제 서비스 연동:** 실제 인증·PostgreSQL·복수 클라이언트·장애 복구 통과. Windows 설치 검증과 별개

3. **Windows 검증 완료:** Windows 11 x64 설치·업데이트·제거·DPAPI·실제 복수 PC 흐름 통과

4. **사용 가능한 배포:** 승인된 운영 서버·인증·배포 경로가 준비되고 사용자 설치까지 확인

현재 네 단계는 모두 미완료다. 계획 검토와 Codex 클라우드 개발 환경 준비가 끝나면 작업 1부터 진행한다. 운영 제공업체·비용·서명·배포는 별도 결정하며 계획 승인만으로 계정 생성이나 비용 지출을 시작하지 않는다.

