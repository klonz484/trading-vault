# MT5-first Market Data ingestion plan

**Status:** Approved development direction; implementation staged and fail-closed.  
**Primary source:** MT5 terminal connected to the user's broker.  
**Secondary source:** Twelve Data, retained for independent comparison and diagnostics.  
**Execution:** Manual MT5 only. This integration must never place, modify or close orders.

## Current verified building blocks

- The MT5 RCG collector writes read-only candle and tick batches to a local JSON queue. It has no network transport.
- `src/lib/market-data/mt5-ingest.ts` contains a pure schema and quality validator for versioned MT5 batches.
- The market-data API currently requests Twelve Data on demand and is owner-authenticated. It is not an MT5 ingestion endpoint.
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
- Add a dedicated `POST /api/market-data/mt5/ingest` route. Do not overload the browser-facing Twelve Data `GET` route.
- Authenticate a collector identity using a server-held per-terminal credential (or a reviewed signed-request design). Never use the user's browser session cookie, Supabase publishable key, provider API key, or a secret embedded in the public frontend.
- Compare secrets safely, impose strict body-size and observation-count limits, validate content type, and rate-limit by collector identity.
- Reject stale/future batch timestamps outside an explicitly configured clock-skew window.
- Return a durable acknowledgement only after the batch and idempotency record have committed successfully.

### Stage 2 — Durable storage and idempotency

- Design Supabase tables/migrations for collector registry, ingestion batches, candle observations, tick observations and processing/acknowledgement state.
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
