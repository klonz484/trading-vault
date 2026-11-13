# MT5-first Market Data ingestion plan

**Status:** Approved development direction; initial server-side ingestion implementation committed to the development branch. Database migration is prepared but not applied; endpoint remains disabled until the server secret and migration are configured.  
**Primary source:** MT5 terminal connected to the user's broker.  
**Secondary source:** Twelve Data, retained for independent comparison and diagnostics.  
**Execution:** Manual MT5 only. This integration must never place, modify or close orders.

## Current verified building blocks

- The MT5 RCG collector writes read-only candle and tick batches to a local JSON queue. It has no network transport.
- `src/lib/market-data/mt5-ingest.ts` contains a pure schema and quality validator for versioned MT5 batches.
- The existing `GET /api/market-data` remains the owner-authenticated Twelve Data request. The repository already had a versioned `POST /api/market-data/mt5/ingest/v1` endpoint and an owner-only `POST /api/market-data/mt5/credentials` lifecycle endpoint. The versioned ingest route has now been hardened on the development branch; no collector credential has been issued.
- The current Brain adapter is an evidence-readiness boundary, not a directional trading signal.
- The RCG collector cursor-hardening work is in draft PR #16 and still requires MetaEditor compilation plus supervised broker-backed validation.

## Target flow

1. MT5 terminal receives broker ticks and candles.
2. The read-only RCG collector writes complete, bounded JSON batches to its local queue.
3. A separate uploader reads only committed queue files and sends them over HTTPS to a dedicated MT5 ingestion endpoint.
4. The endpoint authenticates the collector, validates the schema and timestamps, checks replay/idempotency, and durably stores the batch.
5. Only after durable storage succeeds does the endpoint return an acknowledgement for that exact batch ID.
6. The uploader marks or moves only acknowledged queue files to an archive; failed, timed-out or rejected batches remain available for retry and audit.
7. A normalizer builds source-labelled MT5 observations and quality snapshots for the Market Data Engine.
8. The Brain receives MT5 evidence only after freshness, integrity, candle-close, symbol mapping and source-readiness checks pass. Twelve Data remains a separately labelled comparison source; never silently blend provider candles or quotes.

## Required implementation stages

### Stage 1 — Contract and server boundary

- Keep the existing `MT5IngestBatch` contract versioned; reject unknown schema versions.
- The existing versioned `POST /api/market-data/mt5/ingest/v1` route has been hardened. It remains separate from the browser-facing Twelve Data `GET` route.
- The route authenticates a per-terminal bearer credential by SHA-256 hash lookup using a server-only Supabase secret. The separate owner-only credentials route can issue/revoke scoped credentials when deliberately invoked, but none has been issued as part of this work. The ingest route never uses a browser session, publishable key, provider key, or frontend secret.
- Compare secrets safely, impose strict body-size and observation-count limits, validate content type, and rate-limit by collector identity.
- Require the HTTP request timestamp to be within five minutes and reject future batch/observation timestamps; allow older batch capture timestamps so offline queue files can be safely retried.
- Return a durable acknowledgement only after the batch and idempotency record have committed successfully.

### Stage 2 — Durable storage and idempotency

- The connected Supabase project already contains private `mt5_connector_credentials` and `mt5_ingest_batches` tables. Inspection confirmed RLS enabled, no `anon`/`authenticated` policies, service-role-only grants, a stored SHA-256 token hash, and a durable JSONB batch record.
- A repository migration now adds the collector-credential foreign key, per-collector batch uniqueness, and an atomic service-role-only rate-limit function. It has **not** been applied to the connected database.
- Use a unique constraint on collector identity plus batch ID so retrying the same batch is safe.
- Preserve source broker, broker symbol, canonical instrument, terminal instance, timeframe, source timestamp, received timestamp, batch ID and schema version.
- Do not deduplicate ticks only by timestamp or by price values. Preserve distinct same-millisecond observations and MT5 flags; use a stable observation identity or sequence strategy.
- Store rejected-batch diagnostics without promoting rejected observations into eligible market evidence.
- Enforce least privilege and RLS/service-role boundaries. Never expose collector credentials or raw private ingestion records to other users.

### Stage 3 — Local uploader and queue acknowledgement

- Implement a separate uploader process/script for the Linux/Wine environment; do not add network code to the MT5 EA itself in the first transport iteration.
- Read only fully committed `.json` queue files; ignore temporary/incomplete files.
- Send HTTPS requests with bounded retries and exponential backoff.
- Treat timeouts as unknown delivery state and safely retry with the same batch ID.
- Archive/delete a queue file only after a matching server acknowledgement confirms durable commit. Never advance MT5 cursors based only on an HTTP request being sent.
- Keep the uploader disabled until the server endpoint, credential, storage migration and local test procedure are ready.

### Stage 4 — Normalization, comparison and Brain gating

- Normalize broker symbols explicitly (including suffix/prefix mappings); never assume every broker uses the same symbol names.
- Keep MT5 Bid/Ask ticks separate from OHLC candles. Do not infer executable quotes from candle closes.
- Preserve broker server time and UTC conversion provenance; reject or quarantine uncertain clock mappings.
- Distinguish closed candles from forming candles. Provisional data may be monitored but cannot silently become confirmed structural evidence.
- Compare MT5 and Twelve Data only on aligned instrument, timeframe, timestamp and compatible quote semantics. A disagreement creates a conflict record; it must not be averaged away.
- Calibrate freshness per instrument/timeframe and verify provider/broker terms before any display or multi-user release.
- Keep the Brain in replay-only / insufficient-evidence state until the formal methodology and independent validators pass.

## Safety and rollout boundaries

- Development branch and preview only; no merge to `main` or Production as part of this plan.
- No MT5 terminal settings, EA inputs, account settings or broker configuration are changed by this document.
- No collector token is issued and no broker data is transmitted until the endpoint and storage path have been implemented and tested.
- No paid VPS, database upgrade, market-data subscription or third-party service is purchased.
- No order execution, trade management or automated trading is added.
- The first end-to-end test must use a small synthetic or explicitly supervised demo batch, verify server-side persistence and acknowledgement, then verify safe retry and queue retention on failure.

## Immediate engineering blockers

1. Complete the required MetaEditor compilation and supervised broker-backed tests for collector PR #16 before relying on its cursor behaviour.
2. Review the prepared migration and apply it only to an isolated non-production Supabase database. The connected project currently has no development branch; do not apply it to the existing project.
3. Configure the server-only Supabase secret in Preview and deliberately issue a scoped collector credential only when the isolated schema is ready. No credential has been issued.
4. Build the separate local uploader and test bounded retries, exact acknowledgement matching, and queue retention against Preview using synthetic data.
5. Only then perform a supervised end-to-end demo test with the local MT5 collector.

## Implementation progress — 2026-11-13

### Added to `build/market-data-brain-ready-v1`

- `POST /api/market-data/mt5/ingest/v1` now has a separate server-side route.
- The versioned route enforces JSON content type, a streamed 5 MB body limit, bearer credential authentication, credential expiry/revocation, per-credential rate limiting, batch schema validation, broker/terminal binding, five-minute HTTP request-timestamp skew (while allowing older queued batch timestamps), and future-observation checks.
- Collector tokens are looked up by SHA-256 hash; the raw token is never stored.
- Batch payloads are canonically serialized and hashed. The endpoint acknowledges a first delivery only after Supabase confirms the durable insert. Exact retries from the same credential receive an idempotent acknowledgement; changed payloads or identity collisions receive HTTP 409.
- The existing MT5 validator has been adjusted to preserve multiple tick observations sharing a millisecond timestamp. The collector contract has no sequence identifier, so the API must not reject or collapse same-millisecond ticks based only on timestamp/price/flags.
- Unit tests have been added for token hashing, canonical payload hashing, replay decisions, clock skew and same-millisecond tick preservation. The duplicate unversioned route was removed; the existing versioned route is the single ingestion endpoint.
- A migration file adds the collector identity link, per-credential batch uniqueness and an atomic rate-limit function. It is intentionally not applied to the connected Supabase project yet.

### Verification boundary

- The connected Supabase project was inspected read-only. The two existing MT5 tables are present, RLS is enabled, no public/authenticated policies exist, and only `service_role` has table privileges. Existing batch rows are stored in JSONB with broker/batch uniqueness.
- No Supabase schema changes were executed. No secret key or collector token was created or issued.
- The endpoint cannot accept data until the migration is applied and a server-side `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) is configured. Neither action is part of this commit.
- GitHub Actions quality gates passed on consolidated commit `8d3c2ce5a83f57d6dcb6b61f89b9c21315390293`: ESLint, the complete automated test suite, and the production build. The separate Trading Vault checks workflow also passed. Vercel Preview reached READY for this exact commit. No endpoint-to-Supabase ingestion test or end-to-end MT5 transmission has been attempted.
- The separate local uploader, supervised demo transmission, and Brain normalizer integration remain outstanding.

### Immediate next steps

1. Complete the required MetaEditor and supervised demo checks for collector PR #16.
2. Arrange an isolated non-production Supabase database, then review and apply the prepared migration there. The connected project has no development branch, and no schema changes have been made.
3. Configure the server-only Supabase secret in Preview and use the existing owner-only credential route only when the user explicitly chooses to issue a token.
4. Build the local uploader with bounded retries, queue-retention-on-timeout and matching durable acknowledgements; keep it disabled until synthetic Preview testing is complete.


### Implementation progress — MT5 uploader scaffold

- Added `connectors/mt5/tradingvault_mt5_uploader.py`, a separate one-shot Linux/Python uploader. It is **dry-run by default** and reads only committed `.json` files (not temporary files or symlinks).
- Transmission requires an explicit `--send` flag plus endpoint/token environment variables. The token is never accepted as a command-line argument or printed.
- Retries are bounded; HTTP 429/5xx and uncertain network outcomes retain the local queue file. A file is eligible for optional archive movement only after a matching `200/201` response confirms `accepted=true`, `acknowledged=true`, `durable=true`, the exact `batchId`, and a server `receivedAt`.
- Archiving is a separate opt-in flag, `--archive-acknowledged`; by default even acknowledged files remain untouched. The uploader does not edit MT5 terminal global variables or cursor state.
- Added Python unit tests for JSON validation, symlink rejection, exact acknowledgement matching, HTTPS enforcement and archive overwrite protection, plus a dedicated GitHub Actions workflow.
- These files are committed to the Development branch. CI verification is pending. No live request has been sent; no credential has been issued; no Supabase migration or environment secret has been changed.

### Remaining immediate steps

1. Verify the new uploader CI run and fix any failures.
2. Add clear Linux/Wine path and dry-run instructions without exposing credentials.
3. Inspect the RCG collector's broker-symbol mapping and source-time handling against actual broker metadata; do not alter the running EA.
4. Arrange an isolated non-production Supabase database and review the staged migration there. Do not apply schema changes to the connected project or Production.
5. Only after the isolated server path is ready, deliberately configure Preview secrets and issue a scoped credential; transmission still requires a supervised test approval.

### Timestamp-domain review — 2026-11-13 (ingestion remains blocked)

A source-time review found a correctness blocker that must be resolved before any real MT5 batch is transmitted or promoted to Brain evidence.

- The collector currently formats historical candle timestamps using the **current** broker-server UTC offset. That is not safe for candles spanning a broker daylight-saving/time-zone transition. Historical offsets must come from a verified RCG server-time schedule or a defensible per-observation conversion method; the current offset must not be retroactively applied.
- The collector currently serializes native `MqlTick.time_msc` directly into `sourceTimeMs`. The field name and server-side future-time check currently imply UTC milliseconds. Native MT5 documentation describes it as a millisecond timestamp but does not explicitly guarantee UTC semantics. MetaQuotes documentation distinguishes broker server time from computer/GMT time; `TimeTradeServer()` is an estimate based on the local computer clock and the last-known timezone difference, while `TimeGMT()` depends on the local computer's timezone/DST configuration.
- Consequently, raw server-time ticks may appear hours in the future to the UTC-based API check, while naïvely subtracting today's offset from historical ticks can mislabel data across DST changes. The current API fails closed on future timestamps; do not weaken that guard simply to accept the current collector payload.
- The current `ServerUtcOffsetMinutes()` rounds the estimated offset to whole hours. This assumption must be verified against the actual RCG server, and the local machine's clock/timezone/NTP health must be checked before using it as a conversion reference.
- The current ingest contract has no explicit per-observation time basis, original broker wall-clock value, offset provenance, or DST-regime identifier. Do not infer those values from an ISO suffix added by the collector.

**Required resolution before ingestion:**

1. Obtain written confirmation from RCG of the trade-server timezone and historical DST/UTC-offset schedule, including effective transition dates and whether historical candle/tick timestamps are broker-server wall time.
2. Capture a supervised, read-only live sample pairing raw `TimeCurrent()`, `TimeTradeServer()`, `TimeGMT()`, `MqlTick.time`, `MqlTick.time_msc`, and an independent UTC clock. Repeat around a known server offset change if possible. Do not use Strategy Tester timestamps for this validation.
3. Define a versioned timestamp contract that preserves raw broker time and conversion provenance while exposing normalized UTC only when the offset is verified for that observation. Ambiguous repeated/nonexistent wall-clock times must be quarantined, not guessed.
4. Add tests for standard-time and daylight-time offsets, historical backfill across both transitions, repeated local times, stale local clocks, and server/UTC disagreement. Verify the API future-time check operates only on normalized UTC values.
5. Until all of the above pass, keep the uploader in dry-run mode and keep MT5 observations ineligible for ingestion/Brain evidence.

References reviewed:
- MetaQuotes MQL5 Date and Time: https://www.mql5.com/en/docs/dateandtime
- MetaQuotes MqlTick structure: https://www.mql5.com/en/docs/constants/structures/mqltick
- MetaQuotes local and server time explanation: https://www.mql5.com/en/book/common/timing/timing_local_server

This is a fail-closed data-integrity gate, not a reason to change the user's MT5 terminal or queue/cursor state.
