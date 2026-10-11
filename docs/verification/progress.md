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
