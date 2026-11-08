# MT5 connector ingestion contract v1

## Scope

This is the private, outbound-only ingestion boundary for two separately installed MT5 terminals:

- `RCG_MARKETS`
- `VAULT_MARKETS`

The endpoint accepts read-only market observations for the eight configured Forex/Gold instruments and supported candle timeframes. It does not accept orders, positions, account balances, credentials from the broker, or trade execution commands.

## Endpoint

`POST /api/market-data/mt5/ingest/v1`

Required headers:

- `Authorization: Bearer <scoped-connector-token>`
- `Content-Type: application/json`
- `x-tv-request-timestamp: <ISO-8601 UTC timestamp>`

The request timestamp must be within five minutes of server time. It is separate from `sentAt` inside the batch: an offline terminal may upload an older queued batch while signing a fresh transport request.

The credential is bound server-side to one broker ID and one terminal instance ID. The database stores only SHA-256 token hashes. Use a cryptographically random token with at least 32 bytes of entropy; never use an MT5 account password as this token.

## Batch contract

- Schema version: `1.0.0`.
- Every batch has a stable `batchId`; retries must reuse the same ID and exact serialized payload.
- Candles carry broker symbol aliases, timeframe, source timestamp, OHLC, tick volume, optional real volume/spread and explicit `provisional` state.
- Ticks carry broker symbol alias, source time in milliseconds, bid/ask, optional last/volume fields and MT5 flags.
- Duplicate observations inside one batch are rejected.
- Invalid batches are rejected atomically; none of their observations are accepted.
- A forming candle remains provisional and must not be treated as confirmed structure.
- The same `brokerId + batchId` with identical payload is acknowledged idempotently. Reusing the batch ID with different content returns HTTP 409.

## Durable acknowledgement and offline recovery

A 201 response means the batch has been committed to the private ingest table. A 200 response with `duplicate: true` means that exact batch was already durably accepted. The collector may advance its local queue cursor only after either response. On timeout, 5xx or missing acknowledgement, retain the local batch and retry with the same batch ID and payload.

The endpoint deliberately does not discard old source observations merely because the terminal was offline. Request freshness and source observation time are separate.

## Staged database requirements

Migration `20261108120000_add_private_mt5_ingestion.sql` creates:

- `mt5_connector_credentials`: owner, broker/terminal binding, token hash, expiry/revocation and last-use timestamp.
- `mt5_ingest_batches`: durable idempotent batch envelopes with candle/tick JSON and payload hash.

Both tables have RLS enabled, no client-facing policies, and all anon/authenticated privileges revoked. Only the server-side `service_role` is granted table access. The migration has been committed but **not applied** to Supabase.

## Not yet activated

Before any terminal can send data, the owner must separately approve and complete all of the following:

1. Obtain written broker permission for the exact private collection and transmission use; do not assume either broker permits it.
2. Review and apply the staged migration.
3. Provision a separate revocable token for each broker/terminal and store only its hash.
4. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only environment secret; never expose it to a browser or terminal.
5. Review and deploy the endpoint.
6. Implement and inspect the read-only MQL5 collector, with no trade/order APIs or trade-related code.
7. Test disconnects, durable local queue recovery, retries, duplicate acknowledgement, stale data and broker symbol aliases before enabling live collection.

No MT5 terminal has been connected and no market data has been transmitted by this implementation.


## Owner-only credential lifecycle API

`POST /api/market-data/mt5/credentials` issues a cryptographically random 256-bit token for one broker/terminal pair. It requires an authenticated owner session and the configured `TRADING_VAULT_OWNER_USER_ID`. The token hash is stored; the raw token is returned once and must be copied into the local terminal's secret configuration. The default expiry is 90 days; the owner may request 1–365 days.

`PATCH /api/market-data/mt5/credentials` revokes an active credential by its credential UUID. Revocation is owner-scoped and immediately prevents subsequent ingest authentication.

The API does not list or reveal existing tokens. Issuing a replacement for an active broker/terminal pair returns HTTP 409; revoke the old credential first. Both operations require the staged private connector migration and server-only service-role key. Creating credentials does not enable data collection, connect a terminal, or establish broker permission.
