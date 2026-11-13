# Market Data → Trading Brain Integration v1

**Branch:** `build/market-data-brain-ready-v1`  
**Status:** Development integration boundary; not a production activation.  
**Contract:** `trading-vault.market-data-brain` v1.0.0

## Purpose

The Market Data Engine remains independent from the Scanner and Trading Brain. This adapter is the explicit boundary through which a versioned market-data snapshot can be supplied to Brain replay and, only when all gates pass, live analytical workflows.

## Adapter behavior

`adaptMarketDataSnapshotForBrain(snapshot)` preserves:

- Instrument, timeframe, provider and provider symbol.
- Snapshot version and retrieval timestamp.
- Source timezone, entitlement and licence status.
- Market-data readiness state.
- A stable source reference and upstream limitations.
- OHLC timestamps and the provisional/closed state of every supplied candle.

The adapter does not create prices, repair candles, infer missing data, blend providers or promote a provisional candle to confirmed.

## Data gates

| Gate | Meaning | Permitted use |
| --- | --- | --- |
| `LIVE_ELIGIBLE` | Snapshot validation is READY and both provider entitlement and licence are VERIFIED. | Eligible to be considered by a live Brain workflow, subject to the Brain's separate methodology and evidence gates. |
| `REPLAY_ONLY` | Snapshot has candles but one or more readiness/entitlement/licence gates are not satisfied. | Controlled historical replay and development tests only. |
| `BLOCKED` | Snapshot has no usable eligible candles or lacks a valid retrieval timestamp/version. | No Brain or replay consumption. |

**Important:** `LIVE_ELIGIBLE` is a market-data gate, not a trading signal, not a strategy approval, and not proof that the Brain is production-ready. The Brain's methodology, multi-timeframe, structure, risk, and collaborative-decision gates remain independent.

## Replay behavior

The adapter maps the snapshot's eligible candle collection to the deterministic replay candle shape. The existing `replayClosedCandles` function remains responsible for rejecting malformed, duplicate, unordered or look-ahead evidence and excluding provisional candles from strategy inputs.

A replay may be used to exercise code against historical or controlled fixture data. Replay output must always be labelled replay/test evidence; it must never be represented as current broker data or a live signal.

## Tests

A focused test suite covers:

- Verified READY snapshots preserving provenance and becoming LIVE_ELIGIBLE.
- Unverified provider entitlement forcing REPLAY_ONLY.
- Stale snapshots remaining REPLAY_ONLY.
- Empty or invalidly versioned snapshots becoming BLOCKED.

The repository quality-gates workflow runs `npm ci`, `npm run lint`, `npm test` and `npm run build` for development branches and pull requests. A successful workflow run is required before this integration can be considered validated.

## Explicitly out of scope

- No MT5 collector configuration or queue changes.
- No RCG token issuance, broker transmission or ingestion activation.
- No provider subscription, paid upgrade or new infrastructure.
- No production deployment or merge to `main`.
- No automatic order placement, modification or closing.
- No claim that broker history is complete or gap-free.

## Next gates

1. CI verifies type compatibility, tests, lint and build.
2. Extend integration tests across all eight approved instruments and all supported timeframes.
3. Add a typed Brain input constructor that consumes this adapter output without allowing replay-only data into live assessment.
4. Add deterministic multi-timeframe replay fixtures and explicit as-of boundaries.
5. Keep Brain directional assessment fail-closed until the approved methodology is executable and validated.
