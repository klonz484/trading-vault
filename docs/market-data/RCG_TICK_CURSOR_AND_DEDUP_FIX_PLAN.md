# RCG MT5 Tick Cursor and Duplicate-Identity Hardening

Status: implementation draft committed on an isolated development branch. It has not been compiled or run in MetaEditor; repository tests have not yet been executed. No production code, credentials, deployment, merge, or running collector configuration changed.

## Findings confirmed in source

1. The local queue EA persists only the last tick's `time_msc` and resumes at `previousTickMs + 1`. MQL5 timestamps have millisecond precision and are non-decreasing, not guaranteed unique. A capped response can end within a group of ticks sharing one millisecond; advancing by one millisecond can omit the unreturned tail of that group.
2. The API validator currently builds a tick duplicate key from instrument, timestamp, bid, ask, and flags. It omits last, volume, and volumeReal, so distinct trade observations can collide. Even a complete value-based key cannot distinguish two genuinely separate but byte-identical observations at the same millisecond.

## Collector correction design

Use a two-part persisted cursor per symbol: `last_committed_time_msc` and `committed_count_at_time_msc`.

- MQL5 CopyTicks returns the oldest tick at index 0 and supports a count of requested ticks from the specified start time.
- When resuming, request a prefix beginning at the saved millisecond with a count large enough to include the already-committed same-millisecond prefix plus the next bounded page.
- Skip exactly the previously committed number of records at the saved millisecond, then queue new records in chronological order.
- Persist the new timestamp and same-timestamp ordinal only after the JSON batch is atomically committed.
- If the page advances to a later millisecond, reset the ordinal to the number of records committed at that new final millisecond.
- Bound the requested prefix size and emit an explicit backpressure/error log if the configured safety bound is reached; never silently advance the cursor.
- Preserve the existing local-only guard and never add network, trading, order, position, or account APIs.

Important limitation: the cursor ordinal is meaningful only while the broker's historical tick sequence for that millisecond remains stable. Add a replay/overlap validation test and document the terminal-history correction behavior. If a broker can revise historical tick ordering, a stronger provider sequence ID is required for absolute exactly-once collection.

## Server validation correction design

- Do not reject ticks as duplicates solely because market values and millisecond timestamps match.
- Treat ticks as an ordered observation stream; retain repeated and identical records exactly as received.
- Keep duplicate candle detection, since the candle identity (instrument, timeframe, sourceTime) is stable and unique by definition.
- Keep whole-batch idempotency at the API layer using broker + batchId and payload hash. Same batch ID + same bytes returns the existing durable acknowledgement; same batch ID + changed bytes remains HTTP 409.
- If tick diagnostics are retained, make them non-blocking warnings only and do not collapse or remove observations.

## Implementation draft committed on the isolated branch

- `src/lib/market-data/mt5-ingest.ts`: removed value-derived tick duplicate rejection. Repeated tick observations are retained in input order; candle duplicate detection remains.
- `tests/mt5-ingest.test.cjs`: added coverage for same-millisecond ticks with differing trade metadata, fully identical repeated ticks, and duplicate candle identities.
- `tests/mt5-tick-cursor.test.cjs`: added an executable reference-model test for same-millisecond pagination, crossing into a later millisecond, prefix-bound hard stops, and static presence of the EA cursor safeguards. This is not a substitute for MetaEditor compilation or a broker-backed test.
- `connectors/mt5/TradingVault_RCG_LocalQueue.mq5`: added a packed timestamp-plus-ordinal cursor in one terminal global variable. The packed integer uses a radix of 4096 so the timestamp and ordinal remain exactly representable in a double for current Unix-millisecond timestamps. Resume requests replay the saved millisecond prefix, skip only the committed ordinal, and fail closed if the returned history no longer contains that prefix or the configured prefix bound is reached. The old timestamp-only cursor is migrated with ordinal zero, intentionally replaying that millisecond rather than risking a gap.
- The collector remains local-only. Its network/trading guards are unchanged.

Implementation review caveats:
- The same-millisecond ordinal depends on stable broker tick ordering for that millisecond. A changed/revised history hard-stops collection rather than silently skipping.
- A crash after JSON queue commit but before cursor persistence may replay observations into a later local batch. This is at-least-once behavior; batch-level idempotency does not deduplicate observations across different batch IDs.
- The packed cursor's 4096 radix imposes a hard same-millisecond prefix ceiling. The collector logs and stops before exceeding the configured bound; no silent cursor advancement is allowed.

## Required regression tests

1. A batch containing two ticks with the same instrument, millisecond, bid/ask, and flags but different volume/last is accepted.
2. A batch containing two fully identical tick records is accepted and preserves both records (no false deduplication).
3. Two candles with the same instrument, timeframe, and sourceTime are rejected.
4. Same batch ID + same payload hash is idempotently acknowledged; same batch ID + changed payload is rejected with conflict.
5. Cursor page ends after the first of several ticks sharing one millisecond: the next page replays from that millisecond, skips only the committed prefix, and returns every remaining record once.
6. Cursor page crosses into a later millisecond: timestamp advances and same-millisecond ordinal resets correctly.
7. Queue file commit failure leaves both cursor components unchanged.
8. Cursor prefix safety bound is reached: collector logs a hard error and does not advance or silently skip.

## Acceptance gates

- Run repository lint, test suite, and production build.
- Compile the revised EA in MetaEditor with zero errors and zero warnings.
- Run a supervised local-only demo test and compare ordered tick counts across page boundaries.
- Inspect JSON and verify no gaps/duplicates introduced by pagination.
- Keep the current running EA untouched until the replacement has passed compile and supervised validation.
- Do not issue a connector credential, upload local queue files, merge, or deploy without a separate explicit approval.
