# Trading Brain methodology implementation gate

**Branch:** `build/trading-brain-orchestration-v1`  
**Status:** Open engineering gate; no directional Brain analysis is enabled.

## What is implemented

- Versioned Scanner–Brain assessment contract.
- Conservative collaborative resolver.
- Independent Brain service boundary.
- Deterministic safe response when methodology or evidence is incomplete.
- Tests that prohibit the service from returning BUY/SELL before its methodology is implemented.
- GitHub Actions checks for the deterministic test suite and lint.

## What is not implemented

The repository did not contain a complete, executable Trading Vault methodology specification that could safely be translated into a directional rule engine. Prior design decisions identify broad coverage areas, but design-topic approvals alone do not define all measurable inputs, thresholds, precedence rules, invalidation rules, and acceptance cases.

The following must be formalised and validated before directional assessments are possible:

1. **Market structure:** swing classification, BOS, CHoCH/MSS, displacement, confirmation, retests, and invalidation.
2. **Liquidity:** equal highs/lows, liquidity pools, sweeps, stop runs, targets, and conflicting liquidity objectives.
3. **Price-action zones:** order blocks, fair-value gaps, breakers, mitigation/rejection blocks, liquidity voids, and objective zone qualification.
4. **Context:** multi-timeframe hierarchy, trend/range state, sessions, volatility, and provisional versus closed-candle treatment.
5. **Setup qualification:** required evidence, contrary evidence, setup invalidation, trigger timing, and NO TRADE precedence.
6. **Risk geometry:** exact/range/conditional entries, stop placement, target sequence, spread/slippage assumptions, and instrument-specific price precision.
7. **Evidence provenance:** source snapshot IDs, timestamps, candle completeness, provider disagreement, historical corrections, and licence/entitlement gates.
8. **Evaluation:** deterministic examples and edge cases for EURUSD and XAUUSD, replay tests, false-positive/false-negative review, and versioned acceptance criteria.

## Safety behaviour until closure

- The Brain service returns `INCOMPLETE` + `INSUFFICIENT_EVIDENCE`.
- It returns no entry, stop, or target.
- It does not consume a Scanner conclusion as if that were independent Brain evidence.
- It does not call a model, provider, broker, database, or external paid service.
- The collaborative resolver must therefore remain NO TRADE / degraded when this Brain service is used.
- Do not label the Brain trained, live, accurate, or production-ready.

## Next engineering stage

Use `docs/trading-brain/METHODOLOGY_RULE_SPEC_V1.md` as the versioned rule-contract baseline. Complete its calibration register with reviewed EURUSD/XAUUSD data, then implement each predicate with positive, negative, boundary and replay tests. Do not fill unresolved numeric parameters with guessed defaults.


## Development progress update — 8 November 2026

The following engineering foundations have since been added on the Trading Brain development branch:

- Dependency-aware execution planning and specialist orchestration with fail-closed lifecycle and evidence checks.
- Conditional scenario validation for strategy-supplied trigger, entry reference, invalidation, source provenance and expiry.
- Independent CURRENT and SESSION scenario tracks using the existing signal lifecycle guard.
- Separate internal 2/2 and external 5/5 closed-candle swing assessments. External structure remains primary; internal disagreement is exposed as a challenge.
- Strict evidence-quality and market-structure module contracts with explicit policies rather than hidden thresholds.
- Automated tests for orchestration, scenarios, structure hierarchy, evidence gates and signal lifecycle.

**These are implementation foundations, not methodology certification.** The market-structure module can identify local swing and close-break candidates, but it does not yet certify BOS/CHoCH/MSS, displacement, liquidity sweeps, FVG/order-block qualification or a trade setup. The hierarchy wrapper also requires explicit swing-spacing and break-buffer calibration inputs. The full directional Brain remains fail-closed.

## Remaining closure gates

1. Finalize instrument/timeframe calibration with reviewed EURUSD and XAUUSD datasets.
2. Implement and test displacement, liquidity sweep/reclaim, FVG and order-block predicates with explicit formulas and contrary evidence.
3. Complete multi-timeframe alignment, session/volatility context and setup qualification.
4. Complete deterministic risk geometry with instrument-specific precision, spread and slippage constraints.
5. Build chronological replay, out-of-sample review, no-look-ahead checks and regression certification.
6. Complete independent human review and owner approval before any skill is promoted to influence collaborative decisions.
7. Verify live market-data rights and quality before Scanner/Brain integration is enabled.

Until these gates close, do not label the Brain directionally operational, calibrated, accurate or production-ready.


## Chronological replay foundation — 8 November 2026

A generic closed-candle replay boundary is now implemented in `src/lib/trading-brain/replay.ts`. It:
- exposes only the chronological closed-candle prefix available at each decision time;
- excludes provisional candles from strategy inputs;
- rejects invalid OHLC, duplicate/out-of-order timestamps and invalid replay windows;
- rejects strategy decisions that cite future or unavailable candle timestamps;
- stops safely on strategy errors or incomplete decision evidence.

This is replay infrastructure only. It does not implement the approved methodology predicates, simulate fills, calculate P&L, estimate performance, or certify a strategy. Strategies must not obtain future observations through external captured state or side channels. Historical EURUSD/XAUUSD calibration and independent out-of-sample review remain mandatory.
