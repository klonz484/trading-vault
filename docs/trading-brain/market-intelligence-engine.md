# Trading Brain — Market Intelligence Engine Specification

Status: Draft implementation specification
Scope: Read-only analysis for Forex majors and XAUUSD
Execution: Manual MT5 only; this engine never places, modifies, or closes orders
Architecture: Independent Trading Brain with versioned collaboration interfaces to Chart Scanner

## 1. Purpose

The Market Intelligence Engine (MIE) establishes a time-aware, evidence-backed description of the market before specialist engines evaluate setups. It does not issue trade instructions by itself. It produces a validated market-state snapshot, uncertainty report, and event stream consumed by structure, liquidity, session, volatility, strategy, and scenario engines.

## 2. Responsibilities

1. Validate and normalize incoming price bars and ticks from approved data adapters.
2. Maintain instrument metadata and source provenance.
3. Detect missing, duplicated, out-of-order, stale, malformed, or conflicting observations.
4. Build timeframe-aligned market snapshots without mixing incomplete and closed candles.
5. Classify broad market regime using deterministic, explainable rules.
6. Describe volatility, range, trend, compression/expansion, session context, and data quality.
7. Publish immutable, versioned snapshots and explicit state-change events.
8. Preserve enough evidence to reproduce a past classification.

Out of scope: order execution, position sizing, broker account access, autonomous strategy changes, and claims of guaranteed prediction.

## 3. Input contract

Each normalized observation must carry:
- instrument_id and canonical_symbol;
- provider_id and provider_instrument_symbol;
- event_time (source time, UTC);
- received_at (ingestion time, UTC);
- timeframe or tick designation;
- OHLC values for bars, or bid/ask/last fields for ticks where available;
- volume and volume_kind only when supplied by the source;
- source_sequence or provider cursor when available;
- candle_state: forming or closed;
- source_quality metadata and adapter_version.

Instrument metadata must be explicit and versioned: price precision, tick size, contract metadata when licensed, trading calendar, timezone/session calendar, and supported timeframes. Never infer XAUUSD contract size, pip value, or broker-specific volume rules.

## 4. Data validation and quality gates

Reject or quarantine observations when required fields are absent, numeric values are non-finite, OHLC relationships are impossible, timestamps are invalid, or symbol mapping is unknown.

Detect and report:
- duplicate event identifiers or duplicate bars;
- out-of-order arrivals;
- missing intervals relative to the instrument calendar;
- stale feeds using configurable per-source thresholds;
- clock skew between event_time and received_at;
- provider disagreement beyond instrument/timeframe-specific tolerances;
- historical corrections and backfills.

Do not silently repair source data. Any normalization or correction must retain raw input, transformation name, version, reason, and provenance. A quality state must accompany every snapshot: healthy, degraded, stale, incomplete, conflicting, or unavailable. Downstream engines must be able to refuse analysis when the quality state is unacceptable.

## 5. Candle lifecycle and time alignment

Forming candles may update provisional state. Closed candles are immutable analytical evidence except when a provider explicitly issues a historical correction; corrections create a new version and an auditable correction event.

Structural confirmation must never be inferred from a forming candle. A snapshot must identify its as_of time, last closed candle time, current forming candle time (if any), and the data watermark through which inputs are complete.

Timeframe aggregation must use instrument calendars and UTC internally. Session labels are derived from a versioned session calendar, not hard-coded assumptions about daylight-saving transitions.

## 6. Market-state model

The MIE publishes independent dimensions rather than forcing a single simplistic label:

- directional condition: bullish, bearish, balanced, or undetermined;
- regime: trend, range, transition, compression, expansion, or undetermined;
- volatility: low, normal, elevated, extreme, or undetermined, with method and lookback;
- range context: inside range, near upper boundary, near lower boundary, breakout candidate, or undetermined;
- session context: pre-session, active session, overlap, post-session, or unavailable;
- data quality: one of the quality states defined above;
- confidence: calibrated evidence-quality score, not a probability of profit.

Each dimension includes supporting observations, contrary observations, rule identifiers, calculation windows, and reasons for an undetermined result. The engine must not collapse disagreement into false certainty.

## 7. Deterministic baseline calculations

Initial implementation should favor transparent, reproducible calculations:
- true range and ATR with documented lookback and smoothing;
- rolling high/low range and normalized range position;
- realized range/volatility measures;
- candle body and wick proportions;
- slope/dispersion measures for trend context;
- session and day-of-week context from calendar metadata.

All calculation parameters are versioned. Thresholds are instrument- and timeframe-aware configuration, not hidden constants. Indicator outputs are contextual evidence only and cannot independently create a trade signal.

## 8. Output contract

A MarketStateSnapshot includes:
- schema_version, snapshot_id, instrument_id, timeframe;
- generated_at, as_of, data_watermark, last_closed_bar_time;
- source_set and source_quality summary;
- directional_condition, regime, volatility_state, range_context, session_context;
- metrics with names, values, units, windows, and calculation_version;
- supporting_evidence[] and contrary_evidence[];
- uncertainty[] and data_gaps[];
- ruleset_version, engine_version, configuration_version;
- supersedes_snapshot_id when a newer snapshot replaces a prior one.

Events are append-only and include event_id, event_type, occurred_at, observed_at, instrument_id, timeframe, snapshot_id, evidence references, and version identifiers.

## 9. Downstream collaboration

- Structure Engine consumes aligned snapshots and validated closed/forming candle streams; it owns BOS, CHoCH, MSS, swing hierarchy, and structural confirmation.
- Liquidity Engine consumes range context, validated highs/lows, and structure events; it owns liquidity pools, sweeps, and objectives.
- Session Preparation Engine consumes calendar and state snapshots to prepare conditional scenarios.
- Strategy Manager selects enabled strategies based on explicit eligibility rules and data quality.
- Confluence/Reasoning Engine compares supporting and opposing evidence and explains disagreement.
- Chart Scanner collaboration uses a versioned evidence envelope. Scanner image interpretations remain image-derived observations with their own uncertainty and provenance; they do not overwrite market data or Brain state.

All interfaces are asynchronous and versioned. A downstream consumer must reject unsupported schema versions and stale snapshots rather than guessing.

## 10. Failure behavior

If data is stale, incomplete, conflicting, or unavailable beyond configured limits:
- mark the state degraded or unavailable;
- publish the exact reason and affected timeframes;
- suppress any transition that requires unavailable evidence;
- allow unaffected instruments/timeframes to continue independently;
- never substitute fabricated prices or carry forward a stale state as if it were current.

Provider outage recovery must replay from a known cursor/watermark and reconcile duplicates and corrections idempotently.

## 11. Observability and audit

Record ingestion lag, event-to-snapshot latency, missing-bar rate, duplicate rate, provider disagreement, stale duration, correction count, rejected observations, snapshot generation failures, and downstream consumer lag.

Logs must use correlation IDs and version identifiers and must not contain API keys, account secrets, or unnecessary personal data. Every published state must be reproducible from retained source observations and configuration versions, subject to data-provider licensing and retention limits.

## 12. Test and acceptance plan

Unit tests:
- valid and invalid OHLC;
- duplicate and out-of-order bars;
- missing intervals and market closures;
- forming-to-closed candle transition;
- daylight-saving/session calendar boundaries;
- ATR/range calculations against hand-calculated fixtures;
- stale-feed and provider-conflict thresholds;
- historical correction versioning;
- deterministic replay produces identical snapshots.

Integration tests:
- each provider adapter maps into the normalized contract;
- independent instruments/timeframes fail in isolation;
- consumers reject unknown schema versions and stale snapshots;
- Scanner evidence cannot mutate Brain-owned state;
- degraded quality blocks dependent confirmation paths;
- replay and live ingestion produce equivalent state for the same ordered input.

Acceptance criteria:
1. No snapshot is published without provenance and quality state.
2. No forming candle is represented as closed.
3. No missing value is replaced with an invented market value.
4. Every classification is explainable through versioned rules and evidence.
5. Replaying identical ordered inputs and configuration yields deterministic output.
6. Provider conflicts and historical corrections remain auditable.
7. The MIE has no order-placement capability or broker execution credentials.

## 13. Rollout sequence

1. Implement contracts, instrument metadata, and deterministic replay fixtures.
2. Implement validation, quarantine, and data-quality telemetry.
3. Implement candle lifecycle and timeframe alignment.
4. Implement baseline regime/context calculations.
5. Add provider adapters only after licensing, symbol mapping, and quality tests are approved.
6. Run shadow/replay comparisons before any production read-only feed is enabled.
7. Keep live order execution permanently outside this engine.

## 14. Current repository boundary

This document specifies the next engineering unit. It does not claim the MIE, live market feeds, persistent event store, or production monitoring are implemented. The current app README states that market prices are intentionally absent until a licensed and validated provider is configured, and that the Trading Brain page is an architecture view rather than an active engine.
