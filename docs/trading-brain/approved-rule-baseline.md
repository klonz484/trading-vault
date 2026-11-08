# Trading Brain — approved deterministic rule baseline

**Status:** Engineering baseline compiled from prior owner-approved Option C decisions.  
**Scope:** Forex majors and XAUUSD. Manual MT5 execution only.  
**Activation:** Specification and test foundation only; directional Brain output remains disabled until every required rule has measurable parameters, acceptance cases and replay validation.

## 1. Market structure

### Swing classification
- Internal swings use 2 closed candles to the left and 2 closed candles to the right.
- External swings use 5 closed candles to the left and 5 closed candles to the right.
- A swing remains provisional until all required right-side candles have closed.
- ATR filtering and sensitivity are configurable. No universal ATR threshold is approved yet.

### Structure hierarchy
- External structure is the primary structural state.
- Internal structure may reveal an early shift or challenge but cannot, by itself, reverse the external trend.
- Internal and external states must be preserved independently and conflicts must be explained.

### BOS
- Wick penetration is a break attempt and may represent a liquidity sweep; it is not a confirmed BOS.
- A candle close beyond the relevant structural level confirms BOS, subject to valid data and the relevant swing being confirmed.
- Qualifying displacement strengthens evidence but is not a substitute for the close rule.
- Unreliable, stale, incomplete or conflicting data cannot confirm BOS.

### CHoCH and MSS
Use a layered progression:
1. Potential challenge: price tests or breaches an opposing structural level intrabar.
2. CHoCH: a valid candle closes beyond the opposing internal structural level.
3. MSS: CHoCH plus qualifying displacement and any additional configured evidence.
4. External reversal: requires a confirmed break of the major external structure; an internal break alone is insufficient.

A retest is not mandatory for initial MSS recognition. A successful retest upgrades supporting evidence; a failed retest adds contrary evidence. The retest outcome must remain a separate evidence item rather than rewriting the original event.

### Invalidation and recovery
- Wick beyond a structural level is a potential threat, not confirmed invalidation.
- A candle close beyond the relevant internal or external level confirms invalidation at that corresponding hierarchy.
- Displacement adds evidence to invalidation but does not replace the close requirement.
- A reclaim can support recovery and must be recorded as a later event.
- Internal invalidation does not automatically reverse the external trend.

## 2. Candle state

- Maintain dual state for unfinished candles.
- Forming-candle events are provisional and may update continuously.
- Structural events requiring confirmation use closed candles only.
- Provisional events must never silently become confirmed.
- Historical replay must not use information that was unavailable at the event timestamp.

## 3. Multi-timeframe hierarchy

Use the approved contextual hierarchy:
- 1W — broad context
- 1D — major structure
- 4H — main structure
- 1H — intermediate structure
- 30M — transitional structure
- 15M — setup context
- 5M — confirmation
- 1M — fine behaviour

Preserve each timeframe's independent state, timestamps, candle completeness and data-quality status. Report conflicts. A lower-timeframe-only signal cannot create a primary higher-timeframe reversal. Missing, stale or misaligned timeframe evidence must reduce readiness and may block downstream analysis.

## 4. Displacement

The approved design is a configurable composite, not a single candle-size test. Candidate evidence dimensions:
- candle body relative to historical ATR;
- full range relative to historical ATR;
- close location within the candle range;
- consecutive directional candle sequence;
- movement speed and distance;
- structural level broken;
- follow-through after the break;
- volume as supplementary evidence only (Forex tick volume is not a centralized traded-volume measure).

Exact thresholds, weights, lookback windows and instrument/timeframe calibration remain unapproved. Displacement alone cannot confirm a market reversal.

## 5. Liquidity and price zones

### Fair Value Gaps
- Use strength ranking and a lifecycle that distinguishes creation, mitigation/fill and invalidation.
- A fill is not itself invalidation; a wick alone does not invalidate an FVG.
- Preserve higher- and lower-timeframe FVGs independently.
- Clustering may describe overlap/proximity using configurable ATR or tick tolerances, but must preserve original zones and independent lifecycles.
- Exact thresholds and complete close-based invalidation formulas remain to be formalized and tested.

### Order blocks
The approved multi-factor qualification considers:
- opposing candle or candle sequence;
- displacement;
- BOS/CHoCH/MSS context;
- internal versus external structural significance;
- liquidity sweep context;
- higher-timeframe alignment;
- OHLC boundaries;
- mitigation state;
- source data quality.

The lifecycle includes potential, developing, confirmed and strong qualification states, plus untouched, partial and full mitigation, invalidated and archived states. Exact qualification weights, boundary selection and thresholds remain open.

### Other concepts
Breakers, mitigation/rejection blocks, liquidity voids, OTE, AMD/Judas, Turtle Soup and related concepts remain in the wider approved scope, but their exact deterministic predicates and thresholds must be specified before activation. Do not infer them from labels or narrative descriptions alone.

## 6. Evidence and output requirements

Every rule event must preserve:
- instrument, timeframe and source snapshot reference;
- source timestamp, retrieval timestamp and confirmation state;
- rule and validator version;
- inputs and parameters used;
- supporting and contrary evidence;
- invalidation/recovery events;
- limitations and unresolved classifications.

Keep analytical confidence separate from market-data evidence confidence. Do not produce a calibrated numerical confidence score until its method has been validated.

## 7. Deterministic implementation order

Implement and certify modules in dependency order:
1. Input data validation and candle-state classification.
2. Internal/external swing detection.
3. Hierarchical structure state.
4. BOS, CHoCH, MSS, displacement and invalidation.
5. Liquidity events and pools.
6. FVG and order-block lifecycles.
7. Multi-timeframe alignment and conflict handling.
8. Setup qualification, risk geometry and explainable output.

A failed or unavailable upstream module blocks or degrades dependent modules. Preserve the failed result and its evidence; do not silently substitute a lower-quality signal.

## 8. Open calibration and acceptance gates

The following must be explicitly defined and tested before directional Brain output can be enabled:
- ATR period, timeframe-specific thresholds and swing filtering parameters;
- displacement composite formulas, thresholds, weighting and follow-through windows;
- precise MSS additional-evidence requirements;
- liquidity sweep/reclaim predicates and equal-high/low tolerances;
- FVG strength tiers and exact close-based invalidation;
- order-block boundary selection, qualification scoring and mitigation thresholds;
- breaker, mitigation/rejection block and remaining ICT/SMC predicates;
- instrument-specific price precision, spread/slippage assumptions and risk geometry;
- reviewed EURUSD and XAUUSD positive, negative, edge and conflict cases;
- chronological replay, out-of-sample validation, no-look-ahead checks and regression certification.

Until these gates are closed, the Brain must return INCOMPLETE / INSUFFICIENT_EVIDENCE with no entry, stop or target. No automatic strategy changes, shared Core Brain learning or order execution are permitted.
