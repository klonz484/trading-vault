# Brain evidence pipeline v0.1

## Purpose
Composes the independently computed market-structure, price-action, multi-timeframe, zone, liquidity-objective, event-context and prop-firm results into the existing deterministic Brain decision core.

## Gate mapping
- Structure: ready confirmed structure passes; insufficient remains unknown; invalid fails.
- Volatility: ready ATR/volatility context passes unless volatility is undetermined.
- Multi-timeframe: aligned passes; opposing directions downgrade the combined structure gate to WARN; stale/incomplete downgrades it to UNKNOWN; invalid fails.
- Zones: ready evidence passes; insufficient remains unknown; invalid fails.
- Liquidity: requires at least one objective above or below price; no objectives is WARN.
- Session: requires a verified active or outside state; unknown schedule remains UNKNOWN.
- News: clear passes; configured restricted window remains WARN; unknown remains UNKNOWN.
- Risk: prop-firm BLOCK maps to FAIL, REVIEW maps to UNKNOWN, PASS maps to PASS.
- Existing levels and intermarket gates are preserved from the caller; this pipeline does not invent those modules.

## Identity and explainability
All instrument/timeframe-scoped modules must match the base assessment. A mismatch rejects the assessment. Multi-timeframe conflicts and relevant news events are appended to opposing evidence. Module summaries are appended to supporting evidence without changing the proposed direction.

## Safety boundary
This layer invokes the existing Brain evaluator but does not fetch market data, create a directional case, infer missing evidence, or submit orders. It retains manual-only execution and no-order-submission guarantees. It is not wired to a live API or user-facing scanner workflow yet; integration tests use synthetic fixtures only.
