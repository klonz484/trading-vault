# Trading Brain deterministic core — v0.1

## Responsibility boundary
The Brain evaluates typed evidence supplied to it. It does not fetch market data, interpret screenshots, place orders, or invent observations. Scanner input is optional context and can never substitute for live market data.

## Decision flow
Validate identity, UTC evaluation time, live symbol/timeframe, tick freshness, provider agreement, candle completeness and timestamp alignment. Keep data confidence separate from analytical confidence. Evaluate structure, liquidity, levels, volatility, session, news, intermarket and risk gates. Preserve supporting and opposing evidence, invalidation and reasons.

Missing, stale or mismatched critical data routes to manual review. A failed gate rejects. Unknown evidence cannot produce a confirmed signal. A missing directional case or opposing evidence produces Watchlist/No Trade. Confirmation requires a supplied directional thesis, opposing evidence, invalidation and every evidence gate passing. Conditional reasons produce a conditional state.

## Prop-firm compliance
The separate evaluator projects daily and overall drawdown, open positions and news restrictions using verified inputs. Unknown firm rules or account state produce REVIEW; projected breaches or invalid proposed risk block. Trailing drawdown, consistency, minimum days and challenge pacing are surfaced for review until their exact verified calculation inputs are available. This is a conservative foundation, not a complete firm-specific rule interpreter.

## Safety and limitations
- Read-only market data and manual MT5 execution only; order submission is unavailable.
- No production provider connection or database migration is included.
- This is deterministic scaffolding, not a validated trading strategy or live signal service.
- Freshness limits and confidence thresholds require calibration per instrument, timeframe and provider before operational use.
