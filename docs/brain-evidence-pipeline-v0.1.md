# Brain evidence pipeline v0.1.1

## Purpose
Composes independently computed market-structure, price-action, multi-timeframe, zone, liquidity-objective, event-context, intermarket and prop-firm results into the deterministic Brain decision core.

## Gate mapping
- Structure: ready confirmed structure passes; insufficient remains unknown; invalid fails. Multi-timeframe conflicts downgrade structure to WARN; stale/incomplete MTF evidence remains UNKNOWN.
- Volatility: ready ATR/volatility context passes unless volatility is undetermined.
- Zones: combined into the existing levels gate; ready evidence preserves the caller level status, insufficient or unrecognized remains UNKNOWN, and invalid fails. Zone evidence cannot be silently ignored or default to PASS.
- Liquidity: requires at least one objective above or below price; no objectives is WARN.
- Session: ACTIVE passes; OUTSIDE the explicitly configured verified session windows is WARN; missing/unknown schedule remains UNKNOWN. Session windows must be supplied as verified UTC intervals; no broker timezone or daylight-saving offset is inferred.
- News: verified fresh calendar with no relevant configured event in the restriction window is CLEAR/PASS; a relevant event is WARN; unknown, stale, missing or unrecognized coverage is UNKNOWN.
- Risk: prop-firm BLOCK or any individual BLOCK check maps to FAIL; REVIEW or any REVIEW check maps to UNKNOWN; PASS is accepted only when at least one individual check exists and every check is PASS. Missing or inconsistent check detail cannot be treated as compliance.
- Existing levels and caller-supplied evidence are preserved.

## Identity and explainability
All instrument/timeframe-scoped modules must match the base assessment. A mismatch rejects the assessment. Multi-timeframe conflicts, outside-session context and relevant news events are appended to opposing evidence.

## Safety boundary
This layer invokes the existing Brain evaluator but does not fetch market data, create a directional case, infer missing evidence, or submit orders. It retains manual-only execution and no-order-submission guarantees. It is not wired to a live API or user-facing scanner workflow; tests use synthetic fixtures only.
