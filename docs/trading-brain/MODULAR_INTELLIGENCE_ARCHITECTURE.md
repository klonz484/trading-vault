# Trading Brain Modular Intelligence Architecture

**Branch:** `feat/trading-brain-foundation`  
**Registry version:** `0.1.0`  
**Scope:** Approved 18-skill architecture. This is a design and implementation registry, not a claim that the skills are already active.

## Operating model

The Brain is a coordinator of independent specialist services. Each specialist returns a typed result with its own rule version, source references, observations, interpretations, contrary evidence, uncertainties, and validation status. The coordinator preserves the outputs and evaluates conflicts. It does not use a majority vote or average incompatible trade plans.

The Scanner remains a separate system. Scanner output may be an input to collaboration, but it cannot be relabelled as independent Brain evidence.

## Approved specialist catalogue

| # | Skill | Responsibility |
|---:|---|---|
| 1 | Market Structure Intelligence | Swings, BOS, CHoCH/MSS, displacement, retests and invalidation |
| 2 | Liquidity Intelligence | Equal highs/lows, liquidity pools, sweeps and objectives |
| 3 | Institutional Concepts Intelligence | OB, FVG, breakers, mitigation/rejection blocks and liquidity voids |
| 4 | Multi-Timeframe Intelligence | Higher/lower timeframe context and conflict handling |
| 5 | Session and Timing Intelligence | Session ranges, timing, volatility and event proximity |
| 6 | Indicator Intelligence | Reproducible indicator calculations as supporting evidence |
| 7 | Forex and Gold Specialist Intelligence | Instrument precision, pip/tick/lot conventions, spreads and volatility |
| 8 | Risk and Trade Planning Intelligence | Entry/stop/target geometry, risk/reward and sizing inputs |
| 9 | Backtesting and Learning Intelligence | Historical replay, costs, bias controls and performance |
| 10 | Performance and Behaviour Intelligence | Private journal analysis and recurring execution patterns |
| 11 | Fundamental and News Intelligence | Licensed economic events, central-bank and macro context |
| 12 | Evidence and Quality-Control Intelligence | Freshness, completeness, timestamps, source reliability and conflicts |
| 13 | Strategy Discovery Intelligence | Candidate hypotheses for controlled testing |
| 14 | Pattern Recognition Intelligence | Measurable chart-pattern detection |
| 15 | Scenario Simulation Intelligence | Bullish, bearish and range-bound conditional scenarios |
| 16 | Contradiction Detection Intelligence | Challenges inconsistent evidence and conclusions |
| 17 | Confidence Calibration Intelligence | Out-of-sample calibration and uncertainty reporting |
| 18 | Knowledge Management Intelligence | Methodology versions, experiments, approvals and rollback |

The canonical IDs, dependencies, evidence requirements, outputs, safety rules, and lifecycle statuses are maintained in `src/lib/trading-brain/skills/registry.ts`.

## Skill lifecycle

- `PLANNED`: catalogued and approved; no executable skill.
- `IN_DEVELOPMENT`: implementation underway; not eligible to influence a decision.
- `IMPLEMENTED`: code exists; not yet accepted as reliable.
- `TESTED`: required deterministic and replay tests pass; still not automatically enabled.
- `ENABLED`: explicitly accepted for its permitted runtime role after evidence and governance gates.

A status change must reflect actual evidence. A Vercel build alone does not qualify a skill as TESTED.

## Shared result envelope

Every specialist must return:
- skill ID and skill/rule-set version;
- execution status and evidence readiness;
- source references, timestamps, instrument and timeframe;
- observations separated from interpretations;
- supporting and contrary evidence;
- assumptions, uncertainties and limitations;
- findings and invalidation conditions;
- deterministic validation/test provenance where applicable.

A specialist that lacks required inputs returns an explicit incomplete result. It must not fill gaps with inferred prices or invented context.

## Coordination and safety

1. Evidence Quality validates source eligibility before downstream skills consume market data.
2. Skills run only when their declared dependencies and required inputs are available.
3. Specialist outputs remain separate and inspectable.
4. Contradiction Detection identifies conflicts; material unresolved conflicts block directional approval.
5. Scenario Simulation keeps alternative outcomes conditional until their triggers are evidenced.
6. Risk and Trade Planning validates geometry independently of directional analysis.
7. Confidence Calibration remains withheld until adequate out-of-sample outcome data exists.
8. Knowledge Management versions proposed changes; shared Core Brain changes require controlled experiments and owner approval.
9. Individual journals, experiments and performance records remain private to their owners.
10. Final Scanner–Brain collaboration retains NO TRADE authority. No automated order execution is permitted.

## Implementation order

**Stage A — registry and governance:** stable IDs, skill contract, dependency graph, lifecycle statuses and tests.

**Stage B — evidence foundation (in progress):** a deterministic candle-quality gate now checks explicitly supplied policy thresholds, OHLC integrity, timestamps, candle closure, gaps, freshness, provenance presence, provider conflicts, and provider entitlement/licence flags. Instrument metadata and broader timestamp alignment remain open. The gate does not invent thresholds and is not yet certified for live data.

**Stage C — deterministic core analysis (in progress):**

- **Market Structure:** a conservative swing and close-break candidate detector has been added. It requires an upstream READY evidence gate and explicit caller-supplied swing windows, minimum swing spacing, equal-extreme handling, and break buffer. It excludes forming candles from confirmed calculations and does not claim full BOS/CHoCH/MSS methodology, displacement, retests, or trade signals.
- **Liquidity:** candidate equal-high/equal-low pools are grouped from classified swings using an explicit tolerance and minimum-touch policy. Sweep candidates require a later closed candle to wick through the reference level and close back across it. The module does not claim knowledge of actual resting orders or institutional intent.
- **Institutional Concepts:** a three-closed-candle rule identifies FVG candidates; the last opposing candle before a supplied confirmed structure break can qualify as an order-block candidate. Later overlap is recorded as mitigation; a close beyond the zone boundary can mark invalidation and a breaker candidate. All thresholds are explicit. These simplified definitions are not yet approved for live decision use and do not prove institutional activity.
- **Multi-Timeframe:** reconciles separately supplied timeframe structure assessments using an explicit highest-to-lowest priority list and maximum timestamp-skew policy. It preserves directional disagreement, marks range/unclear context as mixed, and blocks missing or stale timeframe evidence rather than manufacturing it. It does not calculate the underlying structure or create a trade signal.
- **Forex and Gold Specialist:** validates caller-supplied symbol metadata, contract/lot fields, price precision, tick alignment, broker-defined FX pip size and live quote integrity. Quote freshness and maximum spread must be explicit policy inputs. Gold is represented as XAU/USD without assuming a universal pip definition. This module does not certify broker metadata or calculate position sizing, P/L, margin or trade signals.

- **Risk and Trade Planning:** validates caller-supplied BUY/SELL entry ranges, stop placement and ordered targets against the instrument specialist's READY assessment. It calculates conservative price-distance risk and per-target R:R using the worst entry in the range, with an explicit minimum R:R policy. It deliberately does not calculate lot size, account-currency pip value, margin or costs, and cannot place orders. The calculation is geometric only; it does not validate the technical quality of levels or guarantee fills.

**Remaining Stage C work:** complete methodology validation, replay coverage and integration review.

**Stage D — context and alternatives (in progress):** session timing has a deterministic first implementation; indicators, fundamentals, pattern recognition and scenario simulation remain planned.

- **Session and Timing:** evaluates explicitly supplied session schedules using IANA timezone identifiers and local wall-clock windows, including overnight sessions and daylight-saving changes. Schedule freshness and provenance are required. Sourced event windows are filtered only against caller-supplied instrument currencies and an explicit upcoming-event horizon. It does not discover market hours, holidays or economic events, infer event impact, calculate session ranges without OHLC input, or create trade signals.

**Stage E — quality and learning:** contradiction detection, replay/backtesting, private performance analysis, strategy discovery and confidence calibration.

**Stage F — knowledge governance and collaboration:** controlled methodology versions, experiment approval, Scanner–Brain integration and acceptance evaluation.

This sequence is intentional: downstream intelligence must not be built on unvalidated inputs.

## Explicit non-goals

- No broker order placement or automated execution.
- No automatic provider activation or paid API usage.
- No database/schema/RLS/storage changes in this stage.
- No automatic pooling of private user information.
- No claims of model training, calibrated confidence, live intelligence, or trading profitability.
- No Production activation before separate review and approval.
