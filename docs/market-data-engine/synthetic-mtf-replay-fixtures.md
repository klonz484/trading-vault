# Synthetic multi-timeframe replay fixtures

## Purpose

`tests/fixtures/trading-brain-mtf-replay.json` contains deterministic synthetic observations for EURUSD and XAUUSD across the eight supported timeframes: M1, M5, M15, M30, H1, H4, D1 and W1.

These fixtures exist only to test replay mechanics:
- chronological ordering within each instrument/timeframe stream;
- explicit `asOf` cutoffs;
- exclusion of provisional candles;
- exclusion of observations after the replay boundary;
- deterministic replay output.

## Data classification

The fixture is explicitly labelled `SYNTHETIC_TEST_DATA_NOT_MARKET_DATA`. Its OHLC values and timestamps are generated test values. They are not copied from MT5, a broker, Twelve Data, Alpha Vantage, or any other provider.

The fixtures do not contain provider entitlement or licence evidence and must never be passed off as live data or promoted to `LIVE_ELIGIBLE`. They are not a substitute for provider-backed historical validation.

## Multi-timeframe evidence selection

The Brain integration includes `selectClosedMultiTimeframeEvidence`, which selects the latest non-provisional candle at or before one shared `asOf` instant for each supported timeframe. It rejects duplicate streams, unordered/duplicate timestamps, invalid OHLC and malformed candle states. It reports `INCOMPLETE` when any supported timeframe lacks confirmed evidence at the boundary. This helper aligns evidence only; it does not create a directional conclusion.

## Replay semantics

Fixture timestamps are observation timestamps. The replay test supplies the fixture's fixed `asOf` timestamp as the inclusive `endAt` boundary. A provisional observation at or before that boundary must remain excluded from strategy history; a closed observation after that boundary must not be exposed.

The test strategy always returns `NO_TRADE`. It validates the replay boundary only and does not encode or evaluate the Trading Vault methodology, market structure, liquidity concepts, entries, exits, fills, or profitability.

## Scope and next validation stage

This first fixture set covers EURUSD and XAUUSD on all currently supported timeframes. Before extending to GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD and NZDUSD, validate the same fixture contract and instrument identity handling.

Provider-backed replay remains a separate task. It requires properly licensed historical observations, verified provenance, documented timezone/candle-close semantics, completeness checks, and explicit separation from synthetic fixtures. No live MT5 collector or broker-feed health is implied by these tests.
