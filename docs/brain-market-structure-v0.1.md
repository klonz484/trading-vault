# Closed-candle structure and liquidity primitives — v0.1

This deterministic module accepts ordered, timestamped OHLC candles that are explicitly marked closed. It validates OHLC geometry and timestamps, classifies confirmed swing highs/lows using a configurable symmetric pivot strength, identifies close-through BOS and directional CHoCH/MSS events, flags wick-through-and-close-back liquidity sweeps, and groups equal-high/equal-low pools using an explicit price tolerance.

It never infers pip size, broker digits, timezone offsets, spread, news, or live data. The caller must supply the correct instrument/timeframe, price tolerance and closed-candle feed. A swing is only knowable after the configured right-side confirmation bars have closed; no forming candle is accepted. This module returns structural evidence only and has `tradeSignalGenerated: false`. It does not calculate entries, stops, targets, confidence or order instructions.

Known limitations: simple pivot structure is a foundation, not the complete approved Engine 2 methodology. Displacement, multi-timeframe alignment, range classification, order blocks/FVGs, mitigation, AMD/Judas/Turtle Soup, objective alignment and provider reconciliation remain separate follow-on modules requiring explicit definitions and test fixtures.
