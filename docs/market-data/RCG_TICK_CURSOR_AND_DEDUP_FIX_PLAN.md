# RCG MT5 Tick Cursor and Duplicate-Identity Hardening

Status: implementation draft committed on an isolated development branch. A source-review pass found and corrected malformed MQL5 string escaping in JSON escaping and queue file paths; regression guards were added. It has not been compiled or run in MetaEditor, and repository tests have not yet been executed. No production code, credentials, deployment, merge, or running collector configuration changed.

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
- Apply the same-millisecond prefix bound to the actual final timestamp group, not to the sum of the old ordinal and requested page size. This allows a page to cross into a later timestamp without an unnecessary stop.
- If any tick in a symbol page has an invalid bid/ask, do not advance that symbol's cursor. Valid observations from the page may be written, but can be replayed; this favors at-least-once delivery over silently skipping a malformed source observation.
- Bound the same-millisecond prefix and emit an explicit backpressure/error log if the configured safety bound is reached; never silently advance the cursor.
- Preserve the existing local-only guard and never add network, trading, order, position, or account APIs.

Important limitation: the current implementation verifies that the returned prefix begins at the saved millisecond and still contains at least the committed number of records. It does **not** fingerprint the bid/ask/last/volume/flags of those already-committed records, so a broker-side rewrite that preserves the timestamp and prefix length may go undetected. A provider sequence ID or persisted prefix fingerprint is needed to detect that class of historical revision. The ordinal is meaningful only while broker ordering for that millisecond remains stable; absolute exactly-once collection cannot be claimed without a stable provider identity.

## Server validation correction design

- Do not reject ticks as duplicates solely because market values and millisecond timestamps match.
- Treat ticks as an ordered observation stream; retain repeated and identical records exactly as received.
- Keep duplicate candle detection, since the candle identity (instrument, timeframe, sourceTime) is stable and unique by definition.
- Keep whole-batch idempotency at the API layer using broker + batchId and payload hash. Same batch ID + same bytes returns the existing durable acknowledgement; same batch ID + changed bytes remains HTTP 409.
- If tick diagnostics are retained, make them non-blocking warnings only and do not collapse or remove observations.

## Implementation draft committed on the isolated branch

- `src/lib/market-data/mt5-ingest.ts`: removed value-derived tick duplicate rejection. Repeated tick observations are retained in input order; candle duplicate detection remains.
- `tests/mt5-ingest.test.cjs`: added coverage for same-millisecond ticks with differing trade metadata, fully identical repeated ticks, and duplicate candle identities.
- `tests/mt5-tick-cursor.test.cjs`: added an executable reference-model test for same-millisecond pagination, crossing into a later millisecond, prefix-bound hard stops, static presence of the EA cursor safeguards, valid MQL5 escaping literals, and cursor commit ordering relative to local queue persistence. This is not a substitute for MetaEditor compilation or a broker-backed test.
- Follow-up source review corrected JSON quote/backslash escaping and Windows-style queue path separators that were malformed in the first draft.
- `connectors/mt5/TradingVault_RCG_LocalQueue.mq5`: added a packed timestamp-plus-ordinal cursor in one terminal global variable. The packed integer uses a radix of 4096 so the timestamp and ordinal remain exactly representable in a double for current Unix-millisecond timestamps. Resume requests replay the saved millisecond prefix and skip only the committed ordinal. They fail closed if the returned history no longer contains the saved timestamp/prefix count or if the final same-millisecond group exceeds the configured prefix bound. The prefix's actual market-value contents are not fingerprinted yet. Pages may cross into a later timestamp even when the old ordinal plus requested page size exceeds the prefix limit. The old timestamp-only cursor is migrated with ordinal zero, intentionally replaying that millisecond rather than risking a gap. Malformed bid/ask observations block cursor advancement for that symbol page to avoid silently skipping them; valid records in that page may be replayed.
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


## 2026-11-09 batch forensic review (Grok report + source inspection)

The reviewed batch `rcg-1794224950-368576` was reported to contain 1,279 candles and exactly 500 ticks for each of eight symbols. The supplied report identifies tick timestamps around 02:22–02:35 while `sentAt` is 11:49:10Z, and NZDUSD M1/M5 candles from October. The original JSON was not available in this review, so the per-record metrics remain externally reported rather than independently recomputed here.

### Source-level findings

1. **Candle backlog is processed oldest-first.** The EA calls the date-range `CopyRates(symbol, timeframe, fromTime, TimeCurrent(), rates)`, then caps `takeRates` at 50 and iterates from `rates[0]`. MetaQuotes documents that copied rates are physically arranged oldest-first regardless of `ArraySetAsSeries`. Therefore, when the cursor has a large backlog, each scan intentionally emits the oldest 50 bars first. This can explain old M1/M5 windows and slow catch-up; it does not by itself prove NZDUSD's cursor is corrupt. A safe fix must choose and document one policy: (a) complete chronological backfill with explicit backlog/freshness status, or (b) skip old backlog to a recent window while emitting an explicit gap/reset marker. It must not silently jump the cursor to the newest 50 bars and pretend history is contiguous.
2. **The tick page size is 500 by default.** `InpMaxTicksPerSymbolPerScan=500` and `CopyTicks(..., requestedCount)` requests at most the configured page plus the committed same-millisecond prefix. Exactly 500 in one batch proves the page filled, not that the lifetime stream is capped. Consecutive batches are required to determine whether the cursor advances and catches up.
3. **Tick timestamp domain needs explicit treatment.** Candle JSON uses a broker-wall-clock ISO string with a numeric offset. Tick JSON currently writes raw `MqlTick.time_msc` as `sourceTimeMs`, without carrying the broker UTC offset or a normalized UTC value. `sentAt` is produced from `TimeGMT()`. The raw tick timestamp must not be compared to UTC `sentAt` until the MQL5/broker time basis is verified and normalized. MetaQuotes documents `TimeCurrent()` as last known server time and `TimeGMT()` as GMT; server time can differ from GMT. The source currently derives its offset from `TimeCurrent()-TimeGMT()`, rounds to whole hours, and uses `TimeCurrent()` as the tick request's "now" reference. This is a potential source of stale offset/clock behavior when quotes are delayed. Prefer a separately logged server-clock diagnostic using `TimeTradeServer()`, `TimeCurrent()`, and `TimeGMT()`, then explicitly normalize tick timestamps using a verified offset policy.
4. **The NZDUSD October data needs cursor-state evidence.** Candle cursors are terminal Global Variables keyed by terminal instance, symbol and timeframe. A stale persisted NZDUSD M1/M5 cursor can make a collector backfill old bars. Inspect/log the saved cursor, requested range, returned oldest/newest bar, and queue range per symbol/timeframe before resetting any cursor. Do not clear all terminal globals or delete local queue files.
5. **Tick freshness diagnostics are missing.** Each batch should log, per symbol, server clock, UTC clock, raw oldest/newest tick milliseconds, converted UTC oldest/newest timestamps, count returned, count queued, and computed lag. The batch should carry a clear quality/backlog status. A page-full flag must be distinguished from true truncation or source delay.

### Corrections to the external report

- The statement "exactly 500 proves a hard total collection limit" is too strong. The source proves a 500-per-scan page limit; only a sequence of batches can show whether the cursor is progressing.
- The claim that ticks are 9+ hours stale is not yet fully established until raw `time_msc` is interpreted in the broker's server-time domain and compared against a server clock, not only UTC `sentAt`.
- The `-01:00` candle offset is not automatically wrong. It may correctly represent broker server time. The mismatch is that tick JSON lacks an explicit equivalent timezone/normalization contract.
- The NZDUSD October candles are real stale history in the batch as reported, but the cause could be a persisted per-symbol/timeframe cursor plus oldest-first backfill, rather than a cross-symbol cursor collision.

### Next safe validation

- Capture three consecutive local-only batches at least one scan interval apart.
- For each symbol, compare raw tick first/last times and batch-to-batch cursor progression using the same server-time basis.
- For NZDUSD M1 and M5, record the saved Global Variable cursor and each CopyRates request/result window; do not reset it until its effect is understood.
- Add diagnostics before altering cursor behavior.
- Keep the current running EA and local queue untouched. No transmission, token issuance, merge, or deployment is authorized by this forensic review.

## 2026-11-09 follow-up: diagnostic-first collector update

A safe diagnostic-only source update was committed after the single-batch forensic review.

### New local Experts log records

- `TV_RCG_CLOCK_DIAGNOSTIC`: records `TimeTradeServer()`, `TimeCurrent()`, `TimeGMT()`, rounded server/UTC offset, and quote-vs-server clock difference.
- `TV_RCG_CANDLE_WINDOW`: records each symbol/timeframe candle cursor, requested start, returned count, oldest/newest returned bar, and explicitly labels the current policy as oldest-first backfill with a 50-bar page cap.
- `TV_RCG_TICK_WINDOW`: records requested tick start/count, returned count, oldest/newest raw `time_msc`, saved timestamp/ordinal cursor, server and UTC clock readings, and whether the requested page filled.
- `TV_RCG_SYMBOL`: now includes the latest `SymbolInfoTick` timestamp and raw differences against server and UTC clock readings.

### Why this update is diagnostic-first

The batch report alone cannot prove that the 500-tick page is a lifetime cap or that the broker's raw tick timestamp is UTC. The new logs let the next consecutive local batches distinguish:
- a collector that is draining a historical tick backlog;
- a collector that is not advancing its saved cursor;
- a source/broker timestamp basis mismatch;
- a full page that is being returned continuously;
- candle backfill depth versus the latest closed bar.

No candle cursor or tick cursor is reset. No queue file is deleted. No historical backlog is silently skipped. The update remains local-only and has not been compiled in MetaEditor or run on the broker terminal.

### Next validation gate

1. Run the updated EA only after a separate MetaEditor compile reports zero errors and warnings.
2. Capture at least three local-only scans.
3. Compare `TV_RCG_CLOCK_DIAGNOSTIC`, `TV_RCG_TICK_WINDOW`, `TV_RCG_SYMBOL`, and `TV_RCG_CANDLE_WINDOW` for EURUSD, NZDUSD, and XAUUSD.
4. Only then decide whether a separate live-lane/backfill-lane design or a cursor migration is required.
