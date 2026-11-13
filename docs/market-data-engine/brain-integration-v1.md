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

The adapter does not create prices, repair candles, infer missing data, blend providers or promote a provisional candle to confirmed. It repeats runtime checks at the boundary because TypeScript types alone do not validate runtime or persisted data.

## Data gates

| Gate | Meaning | Permitted use |
| --- | --- | --- |
| `LIVE_ELIGIBLE` | Supported schema and validator versions; valid source provenance; candle identity, OHLC, volume and timestamps pass runtime checks; validation is READY with clean counts and no duplicate, unordered or future timestamps; freshness is within a positive configured threshold; provider entitlement and licence are VERIFIED. | Eligible to be considered by a live Brain workflow, subject to the Brain's separate methodology and evidence gates. |
| `REPLAY_ONLY` | Snapshot structure and candle provenance are valid, but readiness, freshness, chronological integrity, entitlement or licence does not satisfy the live gate. | Controlled historical replay and development tests only. |
| `BLOCKED` | Snapshot has invalid schema/provenance/validation metadata, invalid candle identity or OHLC/timestamps, no usable candles, or an invalid retrieval timestamp/version. | No Brain or replay consumption. |

**Important:** `LIVE_ELIGIBLE` is a market-data gate, not a trading signal, not a strategy approval, and not proof that the Brain is production-ready. The Brain's methodology, multi-timeframe, structure, risk, and collaborative-decision gates remain independent.

## Brain input boundary

`createBrainAssessmentInputFromMarketData(...)` builds a typed assessment input from the adapter output. It preserves the adapter gate and source references. It derives closed-candle availability only from candles explicitly marked non-provisional. Higher-timeframe and market-structure availability default to false and must be supplied by their own validators; they are never inferred from a single timeframe snapshot.

The current Brain assessment remains deliberately non-directional and returns INSUFFICIENT_EVIDENCE until the approved methodology and evidence validators are implemented and tested. A REPLAY_ONLY or BLOCKED market-data gate cannot be promoted to live assessment by a READY label alone.

## Replay behavior

The adapter maps the snapshot's eligible candle collection to the deterministic replay candle shape. The existing `replayClosedCandles` function remains responsible for rejecting malformed, duplicate, unordered or look-ahead evidence and excluding provisional candles from strategy inputs.

A replay may be used to exercise code against historical or controlled fixture data. Replay output must always be labelled replay/test evidence; it must never be represented as current broker data or a live signal.

## Tests

Focused tests cover:

- Verified READY snapshots preserving provenance and becoming LIVE_ELIGIBLE.
- Unverified provider entitlement or licence forcing REPLAY_ONLY.
- Stale freshness evidence remaining REPLAY_ONLY even if a status label says READY.
- Empty, invalidly versioned or malformed validation snapshots becoming BLOCKED.
- Mismatched instrument/timeframe/provider identity, invalid OHLC, source timezone mismatch and impossible retrieval chronology becoming BLOCKED.
- Duplicate or unordered candles failing the live gate.
- Typed Brain input construction preserving REPLAY_ONLY and excluding provisional candles from closed-candle evidence.
- The Brain assessment remaining non-directional until methodology rules are approved and implemented.

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
2. Extend integration fixtures across all eight approved instruments and all supported timeframes.
3. Add deterministic multi-timeframe replay fixtures and explicit as-of boundaries.
4. Verify how the Scanner and Brain collaboration layer consumes assessment provenance without collapsing independent conclusions.
5. Keep Brain directional assessment fail-closed until the approved methodology is executable and validated.
