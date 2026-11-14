# Trading Brain — Liquidity Intelligence Engine Specification

Status: Draft implementation specification
Scope: Read-only liquidity-context analysis for Forex majors and XAUUSD
Execution: Manual MT5 only
Dependencies: Market Intelligence snapshots and Structure Intelligence swings, levels, and event stream

## 1. Purpose

The Liquidity Intelligence Engine (LIE) identifies observable price-level groupings and liquidity-related hypotheses, tracks interaction with those levels, and evaluates potential objectives. It must distinguish measurable price facts from interpretations about resting orders or market-participant intent. OHLC data alone cannot prove that stop orders or resting liquidity exist at a particular price.

The engine publishes candidate pools, sweep events, objective candidates, and evidence grades. It does not create executable orders or independently declare a trade.

## 2. Responsibilities

1. Identify equal/near-equal highs and lows, prior session/day/week extremes, range boundaries, and confirmed structural levels.
2. Cluster levels using instrument precision and configurable tolerances.
3. Track approach, interaction, breach, reclaim, and post-sweep behavior.
4. Distinguish wick penetration from close-through and confirmed rejection.
5. Rank potential draw-on-liquidity objectives using transparent evidence.
6. Connect liquidity observations to structure and session context.
7. Preserve opposing evidence, uncertainty, source provenance, and event history.
8. Publish versioned snapshots and append-only events.

Out of scope: claiming direct visibility into broker order books or institutional orders when no such data is available; automatic execution; and representing a liquidity hypothesis as a guaranteed target.

## 3. Inputs and provenance

Required:
- validated OHLC bars with forming/closed lifecycle and data-quality state;
- instrument precision and tick size;
- Structure Engine swing, protected-level, structural-event, and range annotations;
- versioned session/calendar metadata;
- LIE ruleset and instrument/timeframe configuration.

Optional:
- licensed order-book or depth data, with venue, coverage, timestamp, and limitations;
- tick activity or volume where provider semantics are documented;
- Market Intelligence volatility and regime measures.

Every candidate and event references the exact source bars, structure events, session calendar version, provider metadata, and calculation/ruleset versions.

## 4. Liquidity-level taxonomy

Supported candidate categories include:
- equal highs and equal lows;
- clustered swing highs and lows;
- prior day, week, and session highs/lows;
- confirmed protected highs/lows;
- range highs, range lows, and range midpoint;
- explicitly configured round-number levels;
- provider-observed depth levels, only when genuine licensed depth data is available.

Each candidate records category, side, price or price band, contributing observations, first/last observed time, timeframe, source, tolerance method, dispersion, status, and evidence grade.

The engine must not merge unrelated levels merely because they are close in price. Cluster membership requires a versioned distance and significance rule.

## 5. Tolerance and clustering

Tolerance must be instrument-aware and expressed in ticks or a documented volatility-normalized unit. The configured profile must state the maximum distance, minimum contributing observations, lookback, timeframe, and any session boundary rules.

A cluster record includes:
- cluster_id and version;
- member level IDs and source swing IDs;
- representative price and full observed price band;
- dispersion and tolerance used;
- creation/last-update times;
- active, consumed, invalidated, expired, or ambiguous status.

Do not infer equal highs/lows from rounded display strings. Use normalized numeric prices and tick-size-aware comparisons.

## 6. Level lifecycle

A candidate level can transition through observed, active, approached, interacted, breached, reclaimed, consumed, expired, invalidated, or ambiguous states, as permitted by its category.

State transitions must be explicit and evidence-backed. A level is not automatically consumed by a wick touch. The ruleset defines whether a category requires penetration, close-through, repeated interaction, or another measurable condition.

Historical corrections create new level/snapshot versions and correction events. Previous states remain auditable.

## 7. Sweep and rejection event model

A sweep is a hypothesis supported by a defined sequence, not merely any wick beyond a level. A configurable event may require:
- a previously active level;
- penetration beyond its tolerance band;
- a defined reclaim or close-back condition;
- optional displacement or follow-through evidence;
- adequate data quality and closed-candle confirmation.

Every event records the exact level, penetration distance, wick/close behavior, reclaim status, candle references, time, timeframe, and rule version.

Event states:
- provisional: forming-candle interaction only;
- confirmed: all required closed-candle rules passed;
- failed/invalidated: required follow-through or reclaim condition failed;
- unresolved: insufficient or conflicting data.

A wick beyond a level without a qualifying reclaim must not automatically be labelled a confirmed sweep. A failed sweep hypothesis remains in the audit trail as contrary evidence.

## 8. Rejection and acceptance

The engine distinguishes:
- rejection: price interacts with a level and returns away under configured conditions;
- acceptance: price establishes and maintains trade beyond a level under configured close/retention rules;
- unresolved interaction: available evidence cannot distinguish the two.

These are observations about price behavior, not proof of the intentions or identities of market participants.

## 9. Objectives and draw-on-liquidity candidates

Potential objectives may include active opposing-side pools, prior session/day/week extremes, range boundaries, and significant structural levels. Ranking must be explainable and must not imply certainty.

A candidate objective includes:
- objective_id, target level/band, category and side;
- source level IDs and timeframe;
- distance from reference price in ticks and normalized volatility units;
- alignment with current structure and session context;
- intervening levels or obstacles;
- supporting and contrary evidence;
- data quality, freshness, and evidence grade;
- expiry/invalidation conditions and ruleset version.

The engine may return multiple competing objectives. It must not force a single target when evidence is tied or incomplete.

## 10. AMD, Judas, Turtle Soup and related concepts

Conceptual patterns such as accumulation-manipulation-distribution (AMD), Judas swing, and Turtle Soup must be implemented as explicit, testable hypotheses with prerequisites, time/session context, invalidation, and evidence requirements. They must not be inferred from a single candle or named retrospectively without a reproducible rule.

Each pattern detector is separately versioned and can be disabled independently. Pattern labels remain hypotheses and do not override raw level/sweep events.

## 11. Multi-timeframe and session context

Liquidity candidates retain their originating timeframe and session. Cross-timeframe relationships are annotations: aligned, nested, overlapping, conflicting, or unavailable.

Session boundaries derive from a versioned calendar with daylight-saving handling. Prior-session and prior-day levels must use the configured market calendar and timezone rules, not a fixed UTC offset or the user's local timezone.

A lower-timeframe interaction may update its own event stream but cannot silently mark a higher-timeframe level confirmed/consumed without that higher-timeframe category's rules.

## 12. Data quality and provider disagreement

If source data is stale, incomplete, conflicting, or corrected, affected liquidity candidates and events are marked degraded or unresolved. Never invent missing highs/lows, volume, depth, or session boundaries.

If multiple providers disagree, retain source-specific observations and apply explicit reconciliation policy. Do not average conflicting prices without a documented method and tolerance.

## 13. Output contracts

LiquiditySnapshot:
- schema_version, snapshot_id, instrument_id, timeframe;
- generated_at, as_of, data_watermark, source_quality;
- active_levels[], clusters[], interaction_states[];
- provisional_events[], confirmed_events[], unresolved_events[];
- objective_candidates[];
- supporting_evidence[], contrary_evidence[], uncertainty[], data_gaps[];
- source_snapshot_ids, calendar_version, ruleset_version, engine_version, configuration_version;
- supersedes_snapshot_id when applicable.

LiquidityEvent:
- event_id, event_type, level_id, instrument_id, timeframe;
- occurred_at, detected_at, confirmed_at (nullable);
- penetration_ticks, wick_or_close, reclaim_state, follow_through_state;
- status and evidence_grade;
- source_bar_ids, supporting_evidence[], contrary_evidence[];
- invalidation_conditions[], ruleset_version, engine_version.

All updates are append-only events with references to prior versions.

## 14. Downstream collaboration

- Strategy Manager consumes candidate levels and event states with provenance and quality.
- Scenario Engine uses objectives as conditional target candidates, not guaranteed destinations.
- Confluence/Reasoning Engine compares liquidity hypotheses with structure, volatility, and session evidence.
- Session Preparation Engine can include relevant prior-session and upcoming-session levels.
- Chart Scanner evidence remains a separate input with image-derived provenance; it cannot overwrite price-derived levels.

Consumers must reject unknown schema versions and stale snapshots.

## 15. Failure and ambiguity behavior

- Withhold confirmation when required bars or quality gates are missing.
- Preserve overlapping or competing clusters when the rules cannot resolve them.
- Mark unavailable depth/volume data explicitly rather than filling it.
- Keep wick-only interactions distinct from close-confirmed events.
- Isolate failures by instrument, timeframe, and provider.
- Never silently delete consumed, failed, or invalidated historical events.

## 16. Observability

Track level creation and expiry rates, cluster sizes and dispersion, interaction counts, provisional-to-confirmed rates, failed sweep hypotheses, provider disagreement, stale/incomplete inputs, objective ranking changes, event latency, and replay mismatches.

Logs include correlation IDs and version identifiers, never secrets.

## 17. Test and acceptance plan

Unit tests:
- equal-level clustering at tick precision;
- tolerance boundaries and minimum member counts;
- prior session/day/week levels across daylight-saving transitions;
- level lifecycle transitions;
- wick penetration versus close-through;
- reclaim and follow-through conditions;
- provisional sweep remains provisional until closed-candle rules pass;
- failed sweep adds contrary evidence without erasing the event;
- objective ranking exposes factors and ties;
- missing volume/depth never produces fabricated evidence;
- historical correction versions prior levels and events;
- deterministic replay produces identical results.

Integration tests:
- LIE consumes validated Market Intelligence and Structure Engine contracts;
- structure levels retain source references;
- data-quality degradation blocks dependent confirmation;
- timeframe/session context remains correctly scoped;
- downstream consumers reject stale or unsupported schema versions;
- Scanner evidence cannot mutate price-derived liquidity records.

Acceptance criteria:
1. A liquidity pool is described as a candidate/hypothesis unless direct licensed data supports a stronger claim.
2. Every level and event has provenance, lifecycle state, and versioned rules.
3. Forming-candle interactions remain provisional.
4. Wick, reclaim, rejection, and acceptance are explicitly distinguished.
5. Objectives are ranked transparently and may remain multiple or unresolved.
6. Missing market data is never fabricated.
7. No broker execution capability exists.

## 18. Rollout sequence

1. Implement level and cluster contracts with fixture data.
2. Implement session/day/week reference levels using versioned calendars.
3. Implement interactions, sweep hypotheses, reclaim and rejection lifecycle.
4. Implement objective candidates and explainable ranking.
5. Add optional advanced pattern detectors behind independent feature flags.
6. Run historical replay and edge-case/integration suites.
7. Shadow outputs before enabling any production read-only stream.

## 19. Repository status note

This document is a specification, not evidence that the LIE is implemented or running. It depends on the Market Intelligence and Structure Engine contracts and remains read-only.
