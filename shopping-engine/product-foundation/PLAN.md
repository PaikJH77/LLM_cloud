# Audit and product plan (2026-11-06)

## Evidence and limits
The parent handoff branch contains six documents, not engine source. The v0.9 archive was inspected in a previous ChatGPT runtime; neither it nor v0.9.1 is established as present in this checkout. The original evaluation schema and claimed v0.9.1 tests are unverified. Do not substitute this foundation for the original engine or fabricate scores. PR #1 contains the handoff and is the base of this work.

## Phases and acceptance gates
1. **Foundation (this change):** FastAPI health and explicit unavailable search contract, responsive browser preview, automated tests. No live data.
2. **Recover and validate:** acquire original v0.9.1 or verified v0.9; preserve provenance and hashes; inspect secrets and databases before transfer, run original tests and SQLite integrity/foreign key checks. Obtain original evaluator schema. Do not commit private records or credentials.
3. **Shared API:** integrate verified adapter and evaluator behind versioned contracts, provenance, explicit missingness and error states. Test with fixtures, then separately with permitted authenticated live sources; review platform access terms and rate limits.
4. **Web SaaS:** genuine search/results and evidence, account isolation, authentication, data persistence, operational logging and security review. Add deployment configuration only after infrastructure and secrets are selected; validate a deployed URL separately.
5. **Android:** select native or cross-platform stack after the web/API contracts stabilize; implement against the same HTTPS API, test on emulator and physical device, build and sign APK/AAB securely. Verify artifact installation separately from store release.

Deployment, infrastructure costs, credentials, access to original archives/schema, Android signing identity and store account remain unresolved. Local test success does not demonstrate live collection, production readiness, deployment or an APK.
