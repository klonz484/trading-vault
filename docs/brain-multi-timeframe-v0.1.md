# Multi-timeframe evidence alignment v0.1

## Purpose
This module keeps higher-timeframe context separate from lower-timeframe evidence. It is an evidence-alignment primitive, not a trade decision or execution component.

## Input contract
- One explicit target instrument and reference timestamp (`asOfUtc`).
- At least two timeframe observations, ordered from longest to shortest candle duration.
- Each observation carries its own instrument, timeframe label, duration, source identifier, analysis status, trend, latest **closed-candle close time**, and caller-defined freshness limit.
- Durations and freshness limits are explicit; the module does not guess broker timezones, candle schedules, or acceptable staleness.

## Outcomes
- `ALIGNED`: all observations are ready and fresh, with no opposing directional pair.
- `CONFLICTING`: opposing bullish/bearish timeframe observations are retained pairwise. No averaging or synthetic consensus is produced.
- `INCOMPLETE`: at least one timeframe is not ready or has undetermined trend.
- `STALE`: at least one closed-candle observation exceeds its explicit age limit.
- `INVALID`: malformed timestamps, future candle closes, mismatched instruments, invalid metadata, or invalid analysis.

The first timeframe is labelled higher-timeframe context; the last is labelled lower-timeframe context. Intermediate observations remain intermediate. A range is not silently converted into bullish or bearish evidence.

## Source handling
Different source identifiers are not automatically treated as invalid, but produce a warning to verify provider and timestamp comparability. Provider disagreement must remain visible in downstream analysis.

## Safety boundary
The result always has `tradeSignalGenerated: false`. It does not calculate entries, stops, targets, confidence, risk size, or order instructions. A downstream Brain decision must still validate market-data provenance, provider health, structure, liquidity, sessions/news, and risk independently.
