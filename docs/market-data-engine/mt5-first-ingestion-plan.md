# MT5-first Market Data ingestion plan

**Status:** Approved development direction; initial server-side ingestion implementation committed to the development branch. Database migration is prepared but not applied; endpoint remains disabled until the server secret and migration are configured.  
**Primary source:** MT5 terminal connected to the user's broker.  
**Secondary source:** Twelve Data, retained for independent comparison and diagnostics.  
**Execution:** Manual MT5 only. This integration must never place, modify or close orders.

## Current verified building blocks

- The MT5 RCG collector writes read-only candle and tick batches to a local JSON queue. It has no network transport.
- `src/lib/market-data/mt5-ingest.ts` contains a pure schema and quality validator for versioned MT5 batches.
- The existing `GET /api/market-data` remains the owner-authenticated Twelve Data request. A separate `POST /api/market-data/mt5/ingest` endpoint has now been added on the development branch; it requires a server-only Supabase secret and a collector credential that has not been issued.
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
- A dedicated `POST /api/market-data/mt5/ingest` route has been added. It does not overload the browser-facing Twelve Data `GET` route.
- The route authenticates a per-terminal bearer credential by SHA-256 hash lookup using a server-only Supabase secret. It never uses a browser session, publishable key, provider key, or frontend secret. Credential issuance remains disabled.
- Compare secrets safely, impose strict body-size and observation-count limits, validate content type, and rate-limit by collector identity.
- Reject stale/future batch timestamps outside an explicitly configured clock-skew window.
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

1. Confirm the current RCG collector PR #16 head and complete its required MetaEditor and broker-backed tests before relying on its cursor behaviour.
2. Implement and review the durable Supabase schema and collector authentication boundary.
3. Implement the dedicated ingestion API and automated tests for authentication, invalid payloads, duplicate batch retries, clock skew, partial writes and acknowledgement correctness.
4. Build the separate uploader and test it against Preview using a synthetic batch before any live broker queue is transmitted.
5. Only then perform a supervised end-to-end demo test with the local MT5 collector.

## Implementation progress — 2026-11-13

### Added to `build/market-data-brain-ready-v1`

- `POST /api/market-data/mt5/ingest` now has a separate server-side route.
- The route enforces JSON content type, a 4 MB body limit, bearer credential authentication, credential expiry/revocation, per-credential rate limiting, batch schema validation, broker/terminal binding, five-minute sent-time skew, and future-observation checks.
- Collector tokens are looked up by SHA-256 hash; the raw token is never stored.
- Batch payloads are canonically serialized and hashed. The endpoint acknowledges a first delivery only after Supabase confirms the durable insert. Exact retries from the same credential receive an idempotent acknowledgement; changed payloads or identity collisions receive HTTP 409.
- The existing MT5 validator has been adjusted to preserve multiple tick observations sharing a millisecond timestamp. The collector contract has no sequence identifier, so the API must not reject or collapse same-millisecond ticks based only on timestamp/price/flags.
- Unit tests have been added for token hashing, canonical payload hashing, replay decisions, clock skew and same-millisecond tick preservation.
- A migration file adds the collector identity link, per-credential batch uniqueness and an atomic rate-limit function. It is intentionally not applied to the connected Supabase project yet.

### Verification boundary

- The connected Supabase project was inspected read-only. The two existing MT5 tables are present, RLS is enabled, no public/authenticated policies exist, and only `service_role` has table privileges. Existing batch rows are stored in JSONB with broker/batch uniqueness.
- No Supabase schema changes were executed. No secret key or collector token was created or issued.
- The endpoint cannot accept data until the migration is applied and a server-side `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) is configured. Neither action is part of this commit.
- GitHub Actions must run on this new commit before the implementation can be called tested. No end-to-end ingestion has been attempted.
- The separate local uploader, supervised demo transmission, and Brain normalizer integration remain outstanding.

### Immediate next steps

1. Run repository lint, tests and production build against this development commit; fix any failures.
2. Review and apply the migration only to an explicitly selected non-production Supabase development database. The connected project currently has no Supabase development branch, so do not apply it to the existing project.
3. After an isolated database is available, add an owner-controlled credential-issuance procedure and server environment variable without exposing either value.
4. Build the local uploader with queue-retention-on-timeout and acknowledgement-ID matching; keep it disabled until synthetic Preview testing is complete.
