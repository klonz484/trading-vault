# RCG Markets MT5 collector — implementation plan

**Status:** preparation only; not installed, compiled, or enabled.  
**Target terminal:** MetaTrader 5 build 6257 on Debian 13 x86-64 (Wine environment).  
**Broker identity:** `RCG_MARKETS` only.  
**Execution policy:** read-only market-data collection; no trading or account-management actions.

## Scope

Initial instruments: EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD, XAUUSD.

Initial timeframes: M1, M5, M15, M30, H1, H4, D1. The server schema also permits W1, but W1 is not part of the initial collection schedule.

The collector must discover broker-specific symbol names (including suffixes/prefixes) from Market Watch and maintain an explicit, reviewable mapping to the canonical instrument IDs above. It must not guess a mapping from partial symbol matches when more than one candidate exists.

## Data contract

The existing ingestion contract is `schemaVersion: "1.0.0"`:

- Candle observations include canonical instrument, exact broker symbol, timeframe, source candle time, OHLC, tick volume, nullable real volume and spread points, and an explicit `provisional` boolean.
- Tick observations include canonical instrument, exact broker symbol, millisecond source timestamp, bid, ask, nullable last/volume/real volume, and MT5 tick flags.
- Every batch includes a unique batch ID, `brokerId: "RCG_MARKETS"`, a stable terminal-instance ID, and ISO `sentAt`.
- Only closed candles may be used as confirmed structural evidence. A forming candle must remain provisional.

## Transport and credential rules

The existing endpoint is:

`POST /api/market-data/mt5/ingest/v1`

Required headers:

- `Authorization: Bearer <scoped connector token>`
- `Content-Type: application/json`
- `x-tv-request-timestamp: <ISO timestamp within five minutes of server time>`

The owner-only credential endpoint is:

`POST /api/market-data/mt5/credentials`

It issues a token bound to a broker ID and terminal-instance ID. The raw token is returned only once; the database stores its SHA-256 hash. Never use an MT5 account password as this token. Never put the token in source control, screenshots, chat, logs, or a shared preset.

The server validates the credential's broker and terminal binding, payload schema, request timestamp and body size, then persists the batch before returning `accepted: true`. A retry with the same batch ID and identical body is idempotently acknowledged. A reused batch ID with different content is rejected.

## Collector implementation requirements

The MQL5 EA must:

1. Contain no trade-related classes, functions, or calls (including order send/modify/close, CTrade, position or pending-order operations).
2. Use timer-driven bounded collection; do not assume one `OnTick` callback represents every market tick.
3. Use `CopyRates` for candle data and `CopyTicksRange` with a persisted millisecond cursor for incremental tick retrieval. Treat incomplete history responses as incomplete, not as empty market activity.
4. Keep closed-candle and forming-candle states explicit.
5. Use broker symbol names exactly as returned by the terminal; preserve canonical-to-broker mapping separately.
6. Build bounded batches below the server's 5 MB body limit and observation-count limits.
7. Persist an outbound queue locally before transmission. Advance a retrieval cursor only after the server confirms durable acceptance. Retain and retry unacknowledged batches after disconnects or terminal restarts.
8. Reuse the exact batch ID and exact serialized body on retry. Do not regenerate a batch ID or payload after an ambiguous network outcome.
9. Send only over HTTPS using MT5's WebRequest allowlist. No inbound listener or open laptop port.
10. Sanitize all logs. Never print connector tokens, account credentials, or full authorization headers.
11. Mark the source stale/unavailable when the terminal, feed, laptop, or network is unavailable. Never label cached data as live.
12. Stop collection on authentication failure, credential expiry/revocation, schema mismatch, clock-skew rejection, or persistent validation failure; preserve queued data for diagnosis/retry where safe.

## Debian/Wine deployment notes

MT5 is already installed and working on the user's Debian 13 x86-64 laptop. Do not reinstall MT5 or Wine. The user's current data directory appears to be `C:\Program Files\MetaTrader 5`, with `MQL5/Experts` present and existing robot files in that folder.

The new EA must be placed in a dedicated subfolder, for example:

`MQL5/Experts/TradingVault/TradingVault_RCG_Collector.mq5`

Compile with the terminal's MetaEditor for this exact MT5 environment. First run only in a disabled/dry-run mode that logs symbol discovery and data validation without network transmission. Confirm WebRequest behavior under the user's Wine setup before enabling HTTPS delivery.

## Release gates — not yet satisfied

- [ ] Production deployment includes the merged ingestion and credential routes.
- [ ] Server-only `SUPABASE_SERVICE_ROLE_KEY` is configured in Vercel; never expose it to the EA or browser.
- [ ] Owner-only credential issuance is tested after deployment; issue one RCG token bound to one stable terminal-instance ID.
- [ ] Written broker permission for the intended collection/transmission use is obtained.
- [ ] EA source is reviewed to verify the absence of trading/account-management operations.
- [ ] EA compiles under the user's MT5 build 6257.
- [ ] Local durable queue, exact-body retry, and cursor recovery are tested under forced disconnect/restart.
- [ ] WebRequest allowlist and HTTPS endpoint are tested.
- [ ] First transmitted batch is a small, supervised demo-account test and receives a durable server acknowledgement.
- [ ] Data-quality/freshness gates pass before Scanner or Trading Brain can consume the feed.

## Current blockers and boundaries

- Vercel previously rejected production deployment creation with HTTP 402 because the daily deployment API limit had been exceeded; retry was requested after 24 hours. This is a platform limit, not a code or MT5-build failure.
- The production Vercel environment did not contain `SUPABASE_SERVICE_ROLE_KEY` at the last read-only check.
- Broker permission for exporting/transmitting the feed has not been confirmed in writing.
- No connector token has been issued, no EA has been installed or enabled, and no market data has been transmitted.
- This preparation does not authorize a funded account, trade execution, public data redistribution, paid service, or changes to production configuration.
