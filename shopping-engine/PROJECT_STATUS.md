# Project Status — Evidence-Based Handoff

## Goal
Collect product, seller, price and community evidence; normalize and resolve entities; store provenance in SQLite; supply an evaluation engine for Q (quality), R (seller reliability), E (expertise), and C (evidence credibility).

## Confirmed
- The v0.9 handoff ZIP is available in the originating ChatGPT runtime and its contents were inspected.
- It contains adapters.py, engine.py, entity_resolution.py, pipeline.py, resolution_pipeline.py, production_api.py, operational_validation.py, and pytest test modules.
- It also contains replay_v07.sqlite, shopping_v03.db, and project handoff Markdown files.
- Its NEXT_TASKS.md prioritizes authenticated API-to-SQLite validation.

## Not confirmed
- Exact v0.9.1 source and P0 evidence audit module: original ZIP not accessible in current runtime.
- The reported 44 passing v0.9.1 tests: not independently rerun in this handoff.
- Authenticated Firecrawl/Exa live E2E: not verified.
- Evaluation Input Schema v1.0 original JSON Schema: not available.
- Full engine source: not yet transferred to this GitHub folder.

Do not treat this documentation-only staging commit as a complete source migration.
