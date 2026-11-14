# Trading Brain — Structure Intelligence Engine Specification

Status: Draft implementation specification
Scope: Read-only structural analysis for Forex majors and XAUUSD
Execution: Manual MT5 only
Dependencies: Market Intelligence Engine normalized bars, candle lifecycle, quality state, and versioned snapshots

## 1. Purpose

The Structure Intelligence Engine (SIE) identifies and explains price structure across supported timeframes. It owns swing classification, structural legs, breaks of structure (BOS), changes of character (CHoCH), market structure shifts (MSS), displacement assessment, and structural invalidation.

It publishes evidence and events; it does not independently issue executable trade instructions. It must preserve the distinction between provisional events derived from forming candles and confirmed events derived from closed candles and configured confirmation rules.

## 2. Core responsibilities

1. Build deterministic swing hierarchies from validated candle streams.
2. Classify external and internal structure using explicit, versioned rules.
3. Detect structural breaks and distinguish continuation from potential reversal.
4. Detect and grade displacement using measurable candle/range characteristics.
5. Track protected highs/lows and structural invalidation levels.
6. Maintain multi-timeframe structural context without allowing lower timeframes to silently rewrite higher-timeframe state.
7. Represent ambiguity, equal/competing swing candidates, and provider/data-quality limitations.
8. Publish auditable structural snapshots and append-only events.

Out of scope: broker order placement, automatic execution, discretionary claims presented as facts, and hidden/unversioned pattern thresholds.

## 3. Inputs and provenance

Required inputs:
- normalized OHLC bars with instrument, timeframe, event time, candle state, source provenance, and quality metadata;
- Market Intelligence snapshots including data watermark and quality state;
- instrument-specific price precision and tick size;
- versioned SIE configuration and ruleset.

Optional inputs:
- tick or lower-timeframe observations for supplementary displacement analysis;
- session context and volatility measures;
- approved Scanner evidence, kept explicitly separate from native price-derived structure.

Every derived fact must retain references to source bars, source snapshot IDs, calculation windows, engine version, configuration version, and ruleset version.

## 4. Swing classification

Swing detection must be deterministic and configurable. The initial implementation should support a documented pivot/fractal baseline with left/right confirmation bars and a configurable minimum significance filter. More advanced volatility-adaptive swing logic may be added as a separately versioned method after comparative testing.

Each candidate swing records:
- candidate_id, instrument, timeframe, side (high/low);
- pivot bar time and price;
- detection time and confirmation time;
- status: provisional, confirmed, superseded, invalidated, or ambiguous;
- classification: internal, external, or unclassified;
- prominence/significance metrics and method version;
- source bar references and competing candidates.

A swing requiring right-side bars is not confirmed until those bars have closed. A forming candle may create or update only a provisional candidate. The engine must not backdate the time at which a swing became knowable.

When two candidate pivots are indistinguishable under configured precision or significance rules, preserve ambiguity rather than inventing a hierarchy.

## 5. Structure hierarchy and legs

Maintain separate but related structural layers:
- external structure: significant directional legs and major protected extremes;
- internal structure: subordinate swings and shorter-term legs within the external leg;
- microstructure: optional short-horizon observations, never promoted automatically without the configured significance/confirmation process.

A structural leg links an origin swing to a destination swing and records direction, start/end times, range, duration, retracement, and status. A new leg does not erase prior structure; it supersedes or updates a versioned view while preserving the event history.

Higher-timeframe and lower-timeframe structure are separate records. Cross-timeframe relationships are explicit annotations such as aligned, countertrend, nested, conflicting, or unavailable.

## 6. BOS, CHoCH, and MSS semantics

The ruleset must define each event in machine-testable terms.

- BOS: a confirmed break of a relevant structural level in the direction of the currently established structure, subject to the selected break method and close-through requirement.
- CHoCH: a confirmed break against the current structural direction, indicating a potential change in behavior but not proving a full reversal.
- MSS: a stronger structural-shift classification requiring the configured sequence of opposing-side break and displacement/evidence conditions. MSS is not synonymous with every wick beyond a swing.

For every event record:
- event type and direction;
- broken level and level origin;
- break method: wick, close, or other explicitly configured method;
- break candle and confirmation time;
- structural context before and after the event;
- displacement evidence and supporting/contrary evidence;
- retest state and invalidation conditions;
- provisional/confirmed status and ruleset version.

A wick-only breach must not be reported as a close-confirmed break. If a level is crossed while the candle is forming, publish only a provisional event. Confirmation occurs only after the relevant candle closes and all configured rules pass.

## 7. MSS retest policy

Retest is not mandatory for the initial MSS classification. A valid initial MSS may be confirmed when its primary confirmation conditions are met without waiting for a retest.

Retest is a subsequent evidence update:
- successful retest: adds supporting evidence and may upgrade the event's evidence grade;
- failed retest: adds contrary evidence, may invalidate a dependent scenario, and must remain visible in the audit trail;
- no retest yet: remains explicitly pending/not observed;
- ambiguous or data-incomplete retest: remains unknown.

A later retest must not rewrite the original event timestamp or imply that the retest was known at initial confirmation.

## 8. Displacement assessment

Displacement is measured rather than described solely by appearance. Candidate features include:
- candle body relative to true range;
- true range relative to ATR or rolling baseline;
- close location within candle range;
- consecutive directional expansion;
- overlap with preceding candles;
- distance travelled relative to recent volatility;
- available volume/tick activity, only when the source and meaning are known.

The engine outputs feature values and a configurable grade (for example: absent, weak, moderate, strong, or unavailable). Thresholds are versioned by instrument/timeframe profile. Displacement alone does not confirm BOS, CHoCH, or MSS.

## 9. Protected highs/lows and invalidation

Protected extremes are derived from confirmed structural sequences and are linked to the event/leg that established them. Each protected level includes:
- price and origin swing;
- protection rationale;
- timeframe and structural layer;
- active/superseded/broken/ambiguous status;
- exact break and invalidation rule.

A structural bias can be invalidated only by the configured confirmed event, not by a transient wick or incomplete candle unless the ruleset explicitly defines a separate provisional warning. Provisional warnings never replace confirmed state.

## 10. Equal highs/lows and clustered levels

The SIE may identify equal or near-equal swing levels as structural annotations. Equality tolerance must be expressed in instrument ticks or a documented volatility-normalized measure. The engine records cluster membership, price dispersion, contributing swings, and confidence in the cluster.

These annotations are not, by themselves, proof of resting liquidity. Liquidity interpretation belongs to the Liquidity Intelligence Engine.

## 11. Multi-timeframe structure

Each timeframe has an independent event stream and snapshot. The SIE may publish cross-timeframe context:
- aligned: directions agree under the selected rules;
- nested: lower-timeframe structure is developing within a higher-timeframe leg;
- countertrend: lower-timeframe movement opposes higher-timeframe direction;
- conflicting: competing confirmed states cannot be reconciled by the rules;
- unavailable: data quality or coverage is insufficient.

Do not infer a lower-timeframe confirmation from a higher-timeframe candle that has not closed. Do not allow a lower-timeframe event to rewrite a higher-timeframe structural record.

## 12. Data quality and corrections

If the Market Intelligence input is stale, incomplete, conflicting, or unavailable, dependent structural outputs must be marked degraded or withheld according to configured quality gates.

Missing candles must not be synthesized into price bars. Historical corrections create new structural snapshot versions and correction events, with references to the prior output and corrected source. Replay must be deterministic for the same ordered source data and configuration.

## 13. Output contracts

StructuralSnapshot:
- schema_version, snapshot_id, instrument_id, timeframe;
- generated_at, as_of, data_watermark, last_closed_bar_time;
- directional_state and structural_layer summaries;
- confirmed_swings[], provisional_swings[], structural_legs[];
- active_protected_levels[];
- confirmed_events[], provisional_events[];
- cross_timeframe_context[];
- supporting_evidence[], contrary_evidence[], uncertainty[], data_gaps[];
- source_snapshot_ids, ruleset_version, engine_version, configuration_version;
- supersedes_snapshot_id when applicable.

StructuralEvent:
- event_id, event_type, direction, instrument_id, timeframe;
- occurred_at, detected_at, confirmed_at (nullable);
- level_price, level_origin_id, break_method;
- status, evidence_grade, supporting_evidence[], contrary_evidence[];
- retest_state, invalidation_conditions[];
- source_bar_ids, source_snapshot_id, ruleset_version, engine_version.

Events are append-only. Updates are new events referencing the event they update; do not mutate the historical record in place.

## 14. Downstream interfaces

- Liquidity Engine consumes confirmed/provisional swing and structural-level annotations, with their state and provenance.
- Strategy Manager consumes structure state and event evidence, not unqualified labels.
- Confluence/Reasoning Engine consumes supporting and contrary evidence and must preserve the distinction between provisional and confirmed events.
- Scenario Engine consumes structural levels and explicit invalidation conditions.
- Chart Scanner may exchange chart-derived observations through a versioned envelope; image interpretation cannot directly mutate SIE-owned swing or event records.

Consumers must reject unknown schema versions and stale inputs.

## 15. Failure and ambiguity behavior

The engine must:
- emit no confirmed event when required candles or quality gates are missing;
- preserve competing swing candidates when rules cannot resolve them;
- mark outputs unavailable or degraded when provenance is incomplete;
- expose the exact rule and evidence that caused a classification;
- avoid silently changing event type after a new candle or historical correction;
- isolate failures by instrument and timeframe.

## 16. Observability

Track:
- bars processed and processing lag;
- provisional-to-confirmed conversion rate;
- swing candidate count and ambiguity rate;
- event counts by type and timeframe;
- event revisions caused by historical corrections;
- rejected or degraded outputs;
- downstream consumer lag and schema incompatibility;
- deterministic replay mismatches.

Logs must include correlation IDs and version identifiers, never credentials or unnecessary personal data.

## 17. Test and acceptance plan

Unit tests:
- pivot confirmation waits for required closed bars;
- forming-candle updates remain provisional;
- wick breach does not become close-confirmed break;
- BOS versus CHoCH classification across directional contexts;
- MSS requires configured sequence and displacement conditions;
- MSS can confirm before retest;
- successful and failed retests update evidence without rewriting original timestamps;
- protected-level invalidation follows exact rules;
- equal-level tolerance respects instrument tick size;
- multi-timeframe states remain independent;
- missing/stale/conflicting inputs block dependent confirmation;
- historical correction creates a new version;
- deterministic replay produces identical results.

Integration tests:
- SIE consumes only normalized, quality-tagged Market Intelligence inputs;
- downstream engines receive provenance and event status;
- consumers reject stale/unknown schema versions;
- Scanner evidence cannot overwrite native structural events;
- failure in one instrument/timeframe does not halt unrelated streams.

Acceptance criteria:
1. Every confirmed event is reproducible from closed source bars and a versioned ruleset.
2. No provisional event is silently represented as confirmed.
3. MSS retest is optional for initial confirmation and subsequent outcomes remain auditable.
4. Wick and close breaks are explicitly distinguished.
5. All structural levels include provenance and invalidation logic.
6. Timeframes remain independent while exposing explicit relationships.
7. No order-placement or broker execution capability exists in the engine.

## 18. Rollout sequence

1. Implement schema contracts and deterministic fixture datasets.
2. Implement swing candidate detection and confirmation lifecycle.
3. Implement structural legs and external/internal hierarchy.
4. Implement BOS/CHoCH/MSS event logic and evidence updates.
5. Implement protected levels and multi-timeframe annotations.
6. Run historical replay, edge-case, and integration tests.
7. Compare outputs in shadow mode before any live read-only market stream is enabled.

## 19. Repository status note

This document is a specification, not evidence that the SIE is implemented or running. Implementation must follow the Market Intelligence Engine contract and the project's existing manual-execution and production-safety boundaries.
