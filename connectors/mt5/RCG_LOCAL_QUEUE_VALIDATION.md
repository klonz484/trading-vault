# RCG MT5 local collection and queue prototype

**Branch:** `build/rcg-mt5-local-collection-queue`  
**Mode:** read-only, local-only; network transport is intentionally absent.

## What this increment does

- Uses the eight exact RCG canonical symbols already confirmed in the demo dry-run.
- Collects closed candles for M1, M5, M15, M30, H1, H4 and D1. It backfills the latest closed candle on first install, then retrieves later closed candles from the persisted timestamp in bounded slices of up to 50 per symbol/timeframe per scan.
- Retrieves bounded incremental tick slices with `CopyTicks`, using a persisted millisecond cursor and a configurable per-symbol cap (default 500 per scan).
- Builds batches matching the existing `1.0.0` ingestion schema.
- Writes each serialized batch as a UTF-8 `.json` file under the MT5 terminal's local `MQL5/Files/TradingVaultRCGQueue` directory.
- Writes to a temporary file and renames it to `.json` before advancing terminal Global Variable cursors.
- Keeps the queue files after EA removal/restart. No queue deletion or upload occurs.
- Logs queue file names, observation counts, symbol status and errors without printing credentials or account details.

## Deliberate safety boundaries

- `InpLocalQueueOnly=true` is mandatory. Setting it false blocks initialization.
- No `WebRequest`, socket, order, position, account, or trade APIs are present.
- No token or password is required.
- Exact symbol matching only; suffix/prefix aliases are not guessed.
- Only the most recently closed candle is collected per symbol/timeframe on each scan. Forming candles are not emitted in this increment.
- Tick retrieval is bounded by `InpMaxTicksPerSymbolPerScan` (default 500). A full-cap result is logged so the next scan can continue from the persisted cursor.
- Tick cursor uses millisecond timestamps and starts with a 60-second lookback on first install. The implementation advances to the latest queued tick timestamp after the batch file is committed. Multiple distinct ticks sharing the exact same millisecond may require a later sequence/fingerprint refinement; this prototype must be validated against the broker feed before being treated as lossless.
- Candle timestamps are emitted with the terminal server's current UTC offset. Historical broker daylight-saving transitions are not backfilled in this prototype; initial scope is incremental latest-closed candles.

## Required validation before any transmission work

1. Compile with the user's exact MT5 build 6257 MetaEditor and resolve every compiler error/warning.
2. Run on RCG demo only with `InpLocalQueueOnly=true`.
3. Confirm all eight symbols are matched exactly.
4. Confirm queue files appear and are valid UTF-8 JSON.
5. Parse each JSON file and validate it against `validateMT5IngestBatch` / the API schema.
6. Restart MT5 and confirm cursors prevent already-queued candles/ticks from being re-collected.
7. Interrupt terminal operation during a write and confirm temporary files are ignored and cursors are not advanced.
8. Generate enough tick backlog to confirm bounded draining and no cursor leap over unqueued ticks.
9. Inspect the local queue directory and confirm the files remain after removing the EA.

**Not approved by this increment:** issuing credentials, adding a WebRequest allowlist, enabling HTTPS, sending any data, changing production configuration, merging to main, or deploying.
