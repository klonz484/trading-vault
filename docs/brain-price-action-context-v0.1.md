# Price-action context primitives — v0.1

Calculates a simple true-range ATR, a recent high/low dealing range, a volatility context label and closed-candle displacement candidates. Displacement requires body size relative to that candle's true range and a close near the candle extreme. The caller controls all thresholds; no pip/point size is inferred.

This is context only. A detected displacement is not proof of institutional activity, order flow, a trade setup or direction to execute. The volatility label compares the latest ATR with an earlier local baseline, not an instrument-specific long-term regime. A range is a mechanical compression heuristic and requires further market-structure context before interpretation.

No forming candles are accepted. No entries, stop losses, targets, confidence score or order instruction is generated. Instrument/timeframe-specific calibration and out-of-sample validation are still required.
