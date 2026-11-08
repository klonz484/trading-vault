# Trading Brain methodology implementation gate

**Branch:** `feat/trading-brain-foundation`  
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

Translate the approved Trading Vault methodology decisions into a versioned, measurable rule specification. For each rule, define inputs, confirmation state, thresholds or formula, invalidation, contrary evidence, output explanation, and positive/negative test cases. Only then implement the rule modules and replay them against reviewed historical chart cases.
