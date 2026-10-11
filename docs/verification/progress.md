# SDD ledger — plan: docs/superpowers/plans/2026-10-11-windows-project-planner.md

Approved source snapshots are stored unchanged. Repository baseline: 1b4e8c7; no existing tests, AGENTS.md or local skills. Existing README/example preserved. Dedicated branch: feat/windows-project-planner.

## Pre-flight
- Tasks 1→2/3/4/5/6/7: shared Command/Snapshot/Draft interfaces will be copied verbatim from the approved plan.
- Tasks 2→3: owner scoped request status returns null for unknown/other owner requests (plan's explicit no-existence-disclosure rule); all foreign project IDs yield 404.
- Tasks 4→7: draft principalKey derived from verified issuer/subject, never a renderer-selected identity. UI edits persist before network calls.
- Tasks 5/6→7: all edits will go through the same controller; mock UI tests are separate from real integration.
- Tasks 8→9: Linux service evidence cannot complete Windows acceptance.
- Ruling: use the explicitly allowed dedicated branch in the clean selected checkout, rather than a nested worktree; existing user files stay untouched.
- Ruling: source skill helper scripts are not installed in this checkout; maintain task briefs, RED/GREEN logs and this ledger directly, with equivalent task/commit gates.

## Status
1. In progress: domain contracts and calculations.
2–9. Pending.

Task 1: complete. RED: domain imports absent (plan-specified missing implementation); GREEN: 16 tests in UTC, Asia/Seoul and America/Los_Angeles. `npm run typecheck` passed. Node 24.19.0 LTS; resolved dependency versions captured in lockfile. See /tmp/planner-domain-*.log in this session.

Task 1 independent review: no blocking defects. Reviewer confirmed 16 tests across three time zones/typecheck. Creation-base/permutation checks are enforced and tested in Task 2. Minor test improvement (past task dates) deferred to final suite.
Task 2: complete. RED: missing persistence modules. GREEN: 6 real PostgreSQL tests, including 8 concurrent identical requests, version races, deletion provenance, owner scope and invalid permutations; typecheck and full current suite pass. Persistent replay after actual DB restart passed (`scripts/check-db-restart.ts`).
Task 2 Ruling: use relational project/task/request identities with JSONB domain payloads, rather than duplicate each serialized field into SQL columns; all mutations validate server-side and transactionally persist version and payload together. Cost: future SQL reporting may need expression indexes or a migration.
Task 2 regression: concurrent snapshot reads returned task version 4 with project version 3 (RED). One SQL aggregate snapshot fixed it (GREEN). Dedup test uses structural JSON equality because JSONB intentionally reorders object keys.
Task 2 independent review found a global task-ID creation race across owners. Added a real PostgreSQL interleaving test (both applied: RED); fixed with namespaced task-ID transaction lock and distinct INSERT vs owner/project-scoped UPDATE (GREEN). No unconditional task UPSERT remains.
Task 3: complete. RED: missing authentication/server modules. GREEN: real Keycloak signature/audience/expiration verification, owner-isolated routes, invalid input/config tests; full suite 26 tests and typecheck pass. Test tokens come from isolated Keycloak password grant fixtures only; desktop production uses PKCE. Foreign request status is null, never existence-disclosing 404.

Task 3 independent review: no new blocking defects; wrong-issuer claim test needs separate signed-token evidence (pending Task 8).
Task 4 implementation: protected atomic draft store, strict IPC sender/payload boundary, PKCE/state/nonce loopback login, sandboxed/context-isolated renderer and Forge configuration. 4 draft/security tests PASS; runtime verification pending. Linux cipher tests are not DPAPI evidence.
Ruling: implement and test Task 7 controller before completing Tasks 5–6 UI integration so every editable screen starts on the same protected online save path. Contracts unchanged; cost is commit order differs from the document.
Task 7 independent review found stale refresh duplicate transmission/new-draft deletion and expired-session handling defects. Added RED interleaving/expiry regressions and fixed revision/request guards and expiry cleanup; 8 controller tests GREEN. IPC epoch guard also corrected; further session regression test pending.
Tasks 5–6: initial UI absence RED; 4 Chromium mock-bridge scenarios now PASS including IME, archive/trash/restore, online locking, pointer drag/resize/Escape, keyboard move and null/zero progress. Tests now use exact accessible names and scroll the drag target into view before pointer coordinates. Geometry unit test PASS. Build PASS with renderer bundle size advisory (339 KiB); final integration/review pending.

Task 4 runtime: Linux Electron 44.7.0 startup/context isolation/limited bridge PASS under Xvfb. Binary fetch initially failed; Node environment proxy support fixed download. Headless Ozone launch timed out; temporary Xvfb resolved it. Sandbox restrictions require test-only --no-sandbox. Production BrowserWindow retains sandbox=true; OS sandbox acceptance remains Windows work.
Task 5–6 independent review: fixed cross-editor draft overwrite by locking other editor/actions and adding explicit cancel; added offline notification lock and chart endpoint clamping. RED UI draft-overwrite and domain endpoint tests now GREEN. Preserving original-value drafts is intentional until explicit cancel; no silent discard.
Task 7 additional fixes: stale IPC response cannot terminate new account; expired conflict/send responses hide snapshots/drafts and require login. Added independent signed-JWKS wrong-issuer/audience/expiry test; no owner DB access on invalid claims. DB outage previously produced 401 (RED); now 503 (GREEN), avoiding false session expiry.
Task 8: Linux service integration implemented and verified. 33 unit, 11 real API/DB, 5 mock UI, 6 E2E tests PASS; typecheck and production bundles PASS. E2E includes actual browser PKCE, two real-service renderer clients, foreign owner rejection, simultaneous conflict, before/after request network failures, API restart and forced client-process termination after protected save. The process crash fixture runs the real controller/draft store in Node; it is not Windows Electron crash/DPAPI evidence.
Task 8 Ruling: test realm's loopback redirect wildcard must end at `http://127.0.0.1:*`; the original wildcard-in-middle pattern was rejected by real Keycloak. This is test-only configuration. Production client registration still needs provider-specific approval and verification.
Task 9: preparation complete; Windows execution BLOCKED. `scripts/verify-windows.ts` returned exit 2 on Linux as intended. No Windows installer, checksum or lifecycle PASS claim has been fabricated. See docs/windows-verification.md.
