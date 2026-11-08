# Trading Brain methodology rule specification v1

**Version:** `trading-brain-methodology/1.0.0-draft`  
**Status:** Engineering contract draft; not calibrated, certified, or enabled.  
**Scope:** Forex majors and Gold, initially prioritising EURUSD and XAUUSD. Manual execution only.

This document translates the approved Trading Vault design decisions into an implementable rule contract. It deliberately separates approved behavioural rules from parameters that still require measured calibration. A rule with unresolved required parameters must return `INCOMPLETE`, not silently use a default.

## 1. System-level invariants

1. The Scanner and Trading Brain remain independent analytical systems that collaborate through versioned evidence contracts. Neither copies the other's conclusion as independent evidence.
2. The Brain selects only installed strategies that the user has made available. Market-context suitability may rank available strategies, but it cannot silently enable a disabled strategy or promote its lifecycle.
3. The Brain prepares conditional scenarios, monitors them as new market observations arrive, and activates a signal only when its versioned trigger and every shared evidence, conflict, session, and risk gate pass.
4. CURRENT and SESSION signal tracks are separate state machines. They share validated market data and Brain intelligence but retain independent scenario identity, expiry, invalidation, and lifecycle.
5. A forming candle is provisional. It may update a provisional observation or scenario, but cannot confirm a structural event. Closed-candle confirmation is immutable for that observation revision; a provider correction creates a new revision and an auditable re-evaluation.
6. A missing, stale, conflicted, unlicensed, incomplete, or uncalibrated input blocks any dependent directional conclusion. Missing evidence is not neutral evidence.
7. The final collaborative authority preserves material disagreement. It does not average conflicting Scanner and Brain directions into a synthetic trade.
8. Execution is manual in MT5. No order placement, modification, closing, broker account action, or autonomous execution is part of this methodology.

## 2. Rule module contract

Every executable predicate must be versioned and return this common evidence envelope:

- `ruleId`, `ruleVersion`, `methodologyVersion`
- instrument, timeframe, evaluation timestamp, candle revision and closed/provisional state
- source snapshot references and provider/broker identity
- required input fields and the exact parameter-set version
- result: `PASS`, `FAIL`, `CONTRARY`, `INCOMPLETE`, or `NOT_APPLICABLE`
- observations, supporting evidence, contrary evidence, uncertainty and explanation
- invalidation condition and the event/time at which it was evaluated
- deterministic test-case identifiers

A rule may return `PASS` only when all required inputs are valid and all required parameters are present. `INCOMPLETE` must propagate to dependent rules. A rule must never manufacture a missing price, timestamp, source reference, market event, or threshold.

## 3. Market structure

### 3.1 Swing classification

- Maintain separate internal and external structure streams.
- The approved initial pivot windows are 2-left/2-right for internal structure and 5-left/5-right for external structure.
- A pivot is provisional until the required right-side closed candles exist. Only then may it be recorded as a confirmed swing.
- External structure is the primary structural context. Internal structure is a lower-level challenge or refinement and cannot independently reverse the external state.
- Preserve equal-extreme handling as an explicit policy. The selected policy and any tolerance must be versioned; do not infer a tolerance from display precision.
- Minimum swing spacing is a calibrated parameter, not a hidden constant.

### 3.2 Breaks, BOS, CHoCH and MSS

- A candidate break requires a closed candle and an explicit break-buffer policy. A wick through a level alone is not a confirmed close-break.
- Classify a break relative to the prior structural state and the active hierarchy. A break against the established external state is a reversal candidate, not automatically a confirmed reversal.
- BOS, CHoCH and MSS must be separate versioned classifications with explicit prerequisites, precedence, invalidation and contrary-evidence rules. The existing local close-break detector is only a candidate detector and must not be relabelled as a certified BOS/CHoCH/MSS engine.
- MSS retest is not mandatory for the initial MSS candidate. A successful, rule-qualified retest upgrades supporting evidence. A failed retest adds contrary evidence and may invalidate the candidate according to the calibrated rule. Retest evidence never retroactively changes the original break timestamp.
- The exact definition of a successful/failed retest, allowed time window, penetration tolerance and invalidation buffer remain calibration inputs.

### 3.3 Displacement

Displacement must be measured from closed-candle OHLC against an explicitly versioned baseline and instrument/timeframe calibration. The rule must state its body/range measure, direction, minimum magnitude, lookback, volatility normalisation (if used), and treatment of gaps. A visually large candle alone is not a certified displacement event.

## 4. Liquidity

Implement distinct predicates for:

- equal highs and equal lows;
- external and internal liquidity pools;
- sweep / run through a previously identified pool;
- reclaim or close back through the swept level;
- target and objective liquidity, including competing objectives.

Each predicate requires an explicit price tolerance, lookback, minimum observations, candle-state rule, and invalidation. A wick through a pool is an observed penetration, not by itself proof of a valid sweep-and-reclaim. Preserve the swept level, penetration extreme, reclaim evidence, timestamps and source references. Competing objectives must remain visible rather than selecting one without a precedence rule.

## 5. Price-action zones

Create independent, versioned predicates for FVG, order block, breaker, mitigation block, rejection block and liquidity void. For each type define:

- exact candle/sequence pattern and boundaries;
- direction and originating structural event;
- minimum size or significance formula and instrument precision;
- freshness, mitigation and invalidation rules;
- whether partial fills count and how repeated tests are represented;
- required displacement/structure context;
- supporting and contrary evidence.

A zone must not be qualified solely because a drawing or third-party chart label calls it an order block or FVG. OTE, AMD, Judas swing and Turtle Soup remain separately testable concepts with their own definitions; they must not be treated as synonyms for a generic retracement or liquidity sweep.

## 6. Multi-timeframe, session and regime context

- Preserve source timeframe and observation time for every feature.
- Higher-timeframe context may constrain lower-timeframe scenarios but cannot overwrite lower-timeframe observations.
- Define explicit timeframe mapping, alignment, conflict and stale-context rules before a multi-timeframe result can be READY.
- Session labels must be derived from a versioned timezone/calendar definition, including daylight-saving transitions where relevant. Session context is not a directional signal.
- Trend, range, volatility and transition states require measurable definitions and calibrated lookbacks. Ambiguous regime returns `INCOMPLETE` or `RANGE_OR_UNCLEAR`, not forced trend direction.
- News/event context is only usable with verified source, event timestamp, currency relevance, freshness and permitted-use rights. Missing calendar data cannot be interpreted as no event risk.

## 7. Conditional scenarios and signal lifecycle

A strategy may propose a scenario only when it supplies a versioned trigger, explicit entry reference/range, invalidation rule and level, expiry, source references, and methodology/strategy versions.

- PREPARING: required scenario fields or evidence are incomplete.
- MONITORING: a valid conditional scenario exists but its trigger is not confirmed.
- ACTIVE: the trigger has been confirmed on the required observation state and all release gates pass.
- SUSPENDED: a temporary evidence, provider, session, or conflict condition prevents safe monitoring/activation.
- INVALIDATED: the defined invalidation condition is confirmed.
- EXPIRED: the scenario expiry is reached without activation.
- CANCELLED: the user or an authorised lifecycle operation cancels the scenario.

CURRENT and SESSION scenarios are independently monitored. A state transition must include its triggering evidence and timestamp. A provisional intrabar touch may update monitoring but must not satisfy a closed-candle trigger unless that trigger explicitly defines an allowed live-state rule.

## 8. Risk and trade geometry

No scenario becomes actionable until instrument metadata and cost assumptions are verified. Required inputs include quote precision, tick size/value, contract size, lot step/minimum/maximum, account currency conversion where relevant, bid/ask spread, commission and applicable slippage assumptions.

- Entry, stop and target levels must be supplied by a versioned strategy rule or explicitly calculated from approved geometry. They are never guessed by the validator.
- BUY invalidation must be below the entry reference; SELL invalidation must be above it, subject to the strategy's explicitly declared geometry.
- Calculate reward/risk using executable-side assumptions and preserve a range where costs or fills are uncertain.
- Prop-firm constraints are an additional pre-trade guard: daily/overall/trailing drawdown, consistency, news, position and minimum-day rules must be sourced from the selected firm's current rule profile.
- Missing account inputs or unknown cost components block position sizing and positive net-edge claims. The system provides analysis only and never submits an order.

## 9. Evidence, replay and learning

- Every decision is reproducible from immutable source snapshot IDs, candle revisions, rule versions, parameter versions and evaluation timestamps.
- Closed-candle replay must expose only the historical prefix available at each decision time. Provisional candles are excluded from confirmed structural evidence.
- A replay result is not a fill/P&L result unless a separately validated execution simulator and cost model are present.
- Separate development, validation and held-out periods. Do not tune and report performance on the same sample.
- Record false positives, false negatives, missed opportunities, no-trade outcomes, drawdown, expectancy and uncertainty only when the required outcome and execution assumptions are supported.
- Strategy discovery creates hypotheses only. A candidate must pass repeatable out-of-sample review and independent human review before lifecycle promotion. Shared Core Brain changes require owner approval; private user journals are never pooled by default.

## 10. Calibration register — deliberately unresolved

The following parameters must be populated from reviewed data and approved before directional use:

| Parameter family | Required calibration |
|---|---|
| Swing structure | Minimum spacing, equal-extreme tolerance, break buffer |
| BOS / CHoCH / MSS | Structural prerequisites, close buffer, retest tolerance/window, invalidation |
| Displacement | Baseline, magnitude threshold, lookback, volatility normalisation |
| Liquidity | Pool matching tolerance, sweep penetration, reclaim rule/window |
| FVG / OB / other zones | Pattern boundaries, minimum size, freshness, mitigation and invalidation |
| Regime / volatility | Lookbacks, thresholds, transition and ambiguity rules |
| Multi-timeframe | Timeframe map, alignment and conflict precedence |
| Session / news | Calendar source, timezone, event window and freshness |
| Risk geometry | Instrument contract metadata, spread/commission/slippage and account conversion |
| Evidence freshness | Per-instrument/timeframe age and missing-interval limits |
| Replay | Train/validation/held-out partitions and outcome horizon |

No values in this register may be filled from intuition or chosen merely to make a test pass. Use independently reviewed EURUSD and XAUUSD datasets across multiple regimes; document sample coverage, source rights and limitations.

## 11. Required acceptance tests

For every predicate, add positive, negative, boundary, malformed-input, missing-evidence, stale-data, provider-conflict, provisional-versus-closed, invalidation and historical-correction tests where applicable. Add replay tests proving:

1. no future candle or future-derived value is visible at a decision timestamp;
2. a forming candle cannot silently become confirmed;
3. internal structure cannot override external structure;
4. a failed MSS retest adds contrary evidence;
5. independent CURRENT and SESSION tracks do not share lifecycle transitions;
6. unavailable licence/entitlement or unverified broker permission blocks data release;
7. material Scanner/Brain disagreement blocks directional approval;
8. no incomplete or uncalibrated rule set emits an actionable BUY/SELL setup.

## 12. Release status

This specification is a draft implementation contract. It does not certify that the methodology is profitable, calibrated, accurate or ready for live signals. Until calibration, implementation, historical replay, independent review and owner approval are complete, the Brain must remain fail-closed and return no actionable directional setup.
