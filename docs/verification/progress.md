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
