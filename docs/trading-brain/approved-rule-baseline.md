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

## 9. Expanded specialist intelligence architecture — 24 systems

**Architecture status:** The owner has approved the addition of the following 12 specialist systems to the planned Trading Brain architecture. This is an architecture/specification approval, not evidence that the systems have been implemented, calibrated or activated. The original 12 specialist capabilities remain in scope: Market Structure, Liquidity, Smart Money/ICT, Multi-Timeframe, Displacement, Market Conditions, Setup Recognition, Risk, Prop Firm, Learning & Experiment, Market Data, and Confidence & Decision intelligence.

### Newly approved systems (13–24)

13. **Macro Economic Intelligence**
   - Ingest and contextualize relevant economic releases, central-bank decisions, inflation, employment, growth and rate expectations for Forex and Gold.
   - Preserve event source, publication time, revision history, currency/instrument relevance and data freshness.
   - Distinguish scheduled facts from market expectations and interpretation. Do not claim causal certainty or generate a trade solely from a headline.
   - News calendars and licensed data sources require separate validation and approval before connection.

14. **Volatility Regime Intelligence**
   - Classify volatility regimes using configurable, instrument- and timeframe-aware measures.
   - Detect transitions, compression, expansion and exceptional conditions.
   - Explain the observations and lookback used; avoid universal fixed thresholds until calibrated.
   - Feed setup eligibility and risk controls, but never silently loosen account-protection limits.

15. **Currency Strength & Correlation Intelligence**
   - Estimate relative currency strength from a documented, timestamp-aligned instrument universe.
   - Measure rolling and regime-conditioned correlations, USD exposure and Gold relationships.
   - Report sample size, lookback, instability and conflicting relationships; correlation is not causation.
   - Do not assume a stable Gold/USD relationship or double-count correlated evidence.

16. **Session & Timing Intelligence**
   - Identify relevant market sessions, overlaps, opening ranges, holidays and daylight-saving changes using explicit timezone databases and timestamps.
   - Evaluate time-of-day behaviour only from validated historical samples.
   - Treat session tendencies as contextual evidence, not deterministic predictions.
   - Block or qualify timing conclusions when timestamps or session calendars are uncertain.

17. **Historical Pattern Intelligence**
   - Retrieve comparable historical states using reproducible feature definitions and point-in-time data.
   - Report sample count, similarity method, outcome distribution, uncertainty and regime differences.
   - Prevent look-ahead, survivorship and selection bias; separate exploratory matches from validated evidence.
   - Historical resemblance must never be presented as a guarantee of future movement.

18. **Strategy Performance Intelligence**
   - Measure expectancy, win/loss distribution, profit factor, drawdown, recovery, sample size and performance by instrument, session, setup and regime.
   - Use consistent definitions, fees/spread/slippage assumptions and auditable trade records.
   - Flag small samples, selection bias and deteriorating performance.
   - Report descriptive results separately from causal claims or recommendations to change a strategy.

19. **Execution Quality Intelligence**
   - Assess broker-specific spread, slippage observations, quote freshness, price precision, stop-distance constraints and practical execution conditions.
   - Distinguish analytical reference prices from the user's executable broker quotes.
   - Never send, modify or close orders; MT5 remains read-only/manual execution.
   - Missing broker specifications or unreliable quotes must produce an explicit limitation or block.

20. **Portfolio Exposure Intelligence**
   - Aggregate user-authorized position and exposure records across instruments and accounts.
   - Evaluate directional concentration, currency overlap, correlation, aggregate risk and scenario sensitivity.
   - Respect per-user data isolation and distinguish known positions from unknown or stale records.
   - Do not infer that a position exists when no verified position data is available.

21. **Anomaly Detection Intelligence**
   - Detect unusual candles, gaps, spread spikes, provider divergence, timestamp anomalies, missing data and abrupt statistical deviations.
   - Preserve raw observations and identify which validation rule triggered.
   - Separate market anomalies from feed/system faults; do not automatically label unusual behaviour as manipulation.
   - Escalate or block dependent analysis when integrity is uncertain.

22. **Trader Psychology Intelligence**
   - Use only the user's voluntarily recorded journal, checklist and trading behaviour data.
   - Identify possible patterns such as revenge trading, overtrading, hesitation, impulsive entries and rule violations.
   - Present observations neutrally, with evidence and uncertainty; do not diagnose mental-health conditions or infer emotions without supporting user-entered evidence.
   - Keep journal data private to the individual user and never feed it into shared learning without explicit owner-approved governance and user consent where required.

23. **Model Validation Intelligence**
   - Validate deterministic rules, statistical models and strategy variants through chronological replay, walk-forward and out-of-sample testing.
   - Detect leakage, overfitting, drift, unstable parameters and performance degradation.
   - Maintain versioned datasets, configurations, test reports and acceptance thresholds.
   - A model cannot be promoted to production decision support solely because it performs well in-sample.

24. **Decision Audit Intelligence**
   - Maintain an immutable or tamper-evident record of each analytical decision, including input snapshot, source provenance, rule/model versions, parameters, supporting and contrary evidence, confidence, limitations and final status.
   - Record subsequent outcomes and corrections without rewriting the original point-in-time decision.
   - Support reproducibility, owner review, incident investigation and per-user privacy.
   - Audit records must not expose secrets, provider credentials or another user's private information.

## 10. Intelligence divisions and collaboration contract

Organize the 24 specialist systems into six logical divisions. These are organizational groupings, not six additional engines:

1. **Market Understanding:** Market Structure, Liquidity, Smart Money/ICT, Displacement, Market Conditions, Macro Economic, Volatility Regime and Session & Timing.
2. **Market Evidence:** Market Data, Anomaly Detection, Currency Strength & Correlation, Historical Pattern and Multi-Timeframe.
3. **Trade Discovery:** Setup Recognition and the evidence-producing specialist systems that contribute to setup qualification.
4. **Risk & Protection:** Risk, Prop Firm, Execution Quality and Portfolio Exposure.
5. **Learning & Performance:** Learning & Experiment, Strategy Performance and Model Validation.
6. **Decision, Behaviour & Governance:** Confidence & Decision, Trader Psychology and Decision Audit.

### Collaboration and disagreement
- Specialist systems remain independently testable and preserve their own evidence, status, version and limitations.
- The central Trading Brain coordinates them; it must not force consensus or conceal disagreement.
- Supporting and contradictory evidence must both be visible. Correlated inputs must not be counted as independent confirmation.
- A missing, stale, invalid or uncalibrated specialist result must be marked unavailable/limited and must block or degrade dependent conclusions according to explicit dependency rules.
- The final analytical authority is collaborative and explainable. NO TRADE / INSUFFICIENT_EVIDENCE is a valid and expected result.
- Scanner and Brain remain distinct systems that collaborate through defined contracts; neither silently replaces the other's evidence or authority.

### Governance, privacy and activation
- All specialist systems are initially specification/planning scope until implemented, tested and individually certified.
- No numerical confidence, predictive claim or directional output may be activated without documented calibration and out-of-sample acceptance.
- Shared Core Brain learning remains experiment-based and requires controlled evaluation plus owner approval before adoption. No automatic production learning or strategy mutation.
- User-specific journal, position, performance and psychology data remain isolated under per-user access controls; never pool private user data into shared learning by default.
- No public registration launch, paid provider connection, production migration or secret/credential change is authorized by this architecture approval.
- Manual MT5 execution only. No automated order placement, modification or closure.
- Keep all existing fail-closed requirements: when required evidence or validation is missing, return INCOMPLETE / INSUFFICIENT_EVIDENCE and withhold entry, stop and target values.

## 11. Delivery and certification order for the expanded architecture

The 24-system architecture must be delivered incrementally. Recommended dependency-aware phases:

1. **Foundations:** Market Data, Anomaly Detection, Decision Audit, deterministic rule/version registry and privacy/access boundaries.
2. **Core market analysis:** Market Structure, Liquidity, Smart Money/ICT, Displacement, Market Conditions, Multi-Timeframe and Volatility Regime.
3. **Context and discovery:** Macro Economic, Session & Timing, Currency Strength & Correlation, Historical Pattern and Setup Recognition.
4. **Risk and execution context:** Risk, Prop Firm, Execution Quality and Portfolio Exposure.
5. **Learning and performance:** Strategy Performance, Learning & Experiment, Model Validation and controlled promotion workflow.
6. **Decision collaboration:** Confidence & Decision, Trader Psychology, central orchestration, Scanner integration and explainable user-facing outputs.

For each system, require a written contract, input/output schema, provenance, failure states, privacy/security review where applicable, deterministic or statistical test plan, representative positive/negative/edge/conflict cases, replay or out-of-sample validation as appropriate, monitoring and explicit acceptance criteria. Phase ordering may be adjusted only when dependencies and safety gates remain satisfied.

The architecture approval does not close any open calibration gate in Section 8 and does not authorize production activation.