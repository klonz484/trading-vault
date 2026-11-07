# Liquidity objectives v0.1

## Purpose
Derives contextual liquidity reference levels from confirmed swing points and equal-high/equal-low pools. It separates objectives above and below current price and ranks each side by distance.

## Evidence handling
- Swing highs above price and equal-high pools above price contribute to bullish-side objectives.
- Swing lows below price and equal-low pools below price contribute to bearish-side objectives.
- Levels within the caller's explicit price tolerance are clustered; source labels and evidence counts remain visible.
- The closest objective on each side is exposed separately.
- Structure trend is retained as context: bullish, bearish, range (two-sided), or undetermined. A trend does not erase objectives on the opposite side.

## Requirements and limitations
The caller must supply the current price, tolerance, and a READY structure result for the same instrument/timeframe. This module does not validate market-data freshness or provider provenance; upstream validation remains mandatory. It does not predict that price will reach a level and does not calculate entries, stops, targets, confidence, or risk.

## Safety boundary
The output is an objective map only and always reports `tradeSignalGenerated: false`.
