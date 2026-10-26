# Next Tasks

## P0 — Source recovery and validation
1. Transfer original shopping_handoff_v0_9_1.zip into Work; if unavailable, transfer the verified v0.9 ZIP.
2. Preserve existing repository content. Extract into shopping-engine/ with clear version provenance.
3. Compare module tree and SHA-256 hashes; identify v0.9 → v0.9.1 changes.
4. Install dependencies and run full pytest suite. Record environment and test outputs.
5. Validate SQLite integrity_check, foreign_key_check, Acquisition → Evidence / PriceObservation / ResolutionAudit links, and raw file hashes.
6. Verify approved Firecrawl/Exa credentials through environment variables only; review site permissions.
7. Run a small permitted live API → SQLite E2E; record HTTP errors, retries, latency, credits, acquisition IDs, source URLs and hashes.

## P1 — Evaluation interface
1. Retrieve the original Evaluation Input Schema v1.0.
2. Map Product, Variant, Listing, SellerEntity, SellerAccount, Acquisition, Evidence, EvidenceClaim and PriceObservation to Q/R/E/C input.
3. Specify missingness, validation status, source timestamps, schema version and provenance.
4. Add JSON Schema and contract regression tests. Do not label a replacement as the original v1.0.

## P2 — Operations
- Database migrations, atomic raw/DB commits, concurrency and retry policies, structured cost reporting.
