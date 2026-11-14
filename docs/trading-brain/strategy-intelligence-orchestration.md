# Trading Brain — Strategy Intelligence and Orchestration Specification

Status: Draft implementation specification
Scope: Strategy eligibility, selection, orchestration, and conditional scenario preparation
Markets: Forex majors and XAUUSD
Execution: Manual MT5 only; no order placement or account execution permissions

## 1. Purpose

The Strategy Intelligence and Orchestration layer determines which approved strategy modules are relevant to the current market state, evaluates their eligibility, coordinates their evidence, and prepares conditional scenarios for the Reasoning and Scenario Engines.

It does not force a trade, invent a setup when none qualifies, or allow an AI model to silently enable a disabled strategy. Strategy availability and selection controls remain explicit and auditable.

## 2. Core design principles

- Strategy modules are independent, versioned, and testable.
- The Brain selects only from strategies enabled by the applicable owner/trader policy.
- Market regime and data quality influence eligibility; they do not guarantee outcomes.
- Strategies emit structured evidence and conditions, not executable orders.
- Multiple strategies may qualify, conflict, or all be ineligible.
- AI reasoning may explain and compare results but cannot bypass deterministic eligibility gates.
- Private trader preferences and experiments remain isolated from shared Core strategy definitions.
- Strategy performance is measured from reproducible records and does not automatically rewrite live rules.

## 3. Strategy module contract

Each strategy module must declare:
- strategy_id, name, description, owner/scope (shared or private);
- semantic_version and ruleset_version;
- supported instruments, timeframes, sessions, and market regimes;
- required data inputs and minimum data-quality state;
- prerequisites and explicit eligibility rules;
- evidence features and scoring method;
- confirmation conditions and invalidation conditions;
- risk-context requirements and prohibited contexts;
- output schema version;
- test fixtures, known limitations, and validation status;
- enabled/disabled state and the actor/policy that controls it.

A module must fail closed when required inputs or compatible schema versions are missing.

## 4. Strategy registry and permissions

The registry stores approved shared strategies and each trader's private strategies/preferences. It must distinguish:
- available: registered and approved for the relevant scope;
- enabled: permitted to be considered by the current policy;
- eligible: current inputs satisfy the strategy's prerequisites;
- selected: chosen for deeper evaluation in this cycle;
- active scenario: has produced a conditional scenario being monitored.

These states are not interchangeable. A strategy being available does not mean it is enabled; enabled does not mean eligible; eligible does not guarantee selection or a signal.

Shared Core strategy changes require controlled testing and owner approval. A trader may adjust permitted personal strategy preferences without changing shared strategy definitions. Private settings must not leak between user profiles.

## 5. Eligibility pipeline

For each instrument/timeframe evaluation cycle:

1. Validate snapshot freshness, provenance, schema, and quality state.
2. Apply trader/owner enablement policy and instrument/timeframe scope.
3. Check session and market-calendar constraints.
4. Check required regime, volatility, structure, and liquidity prerequisites.
5. Evaluate strategy-specific setup prerequisites.
6. Record pass, fail, or unknown for each prerequisite with evidence references.
7. Exclude ineligible modules from selection while retaining the reason.
8. Rank eligible modules using documented, versioned criteria.
9. Send selected modules to confluence and scenario evaluation.

Unknown is not pass. If a required prerequisite is unknown because data is missing or stale, the strategy is not eligible for confirmation.

## 6. Selection and ranking

Ranking is for allocating analytical attention, not predicting profitability. Configurable factors may include:
- prerequisite completeness;
- alignment with the current market regime;
- alignment/conflict with higher-timeframe structure;
- quality and freshness of supporting data;
- presence of independent supporting evidence;
- explicit contrary evidence and unresolved conflicts;
- strategy-specific historical validation status.

Every ranking output includes factor contributions, weights, configuration version, and tie handling. Avoid opaque single-number scores. If two strategies are indistinguishable, preserve the tie or evaluate both. A low score is not automatically a short/long signal.

## 7. Evidence and confluence

Each strategy returns:
- observations and calculated features;
- prerequisite outcomes;
- supporting and contrary evidence;
- provisional/confirmed state;
- confirmation requirements still outstanding;
- invalidation conditions;
- data gaps and uncertainty;
- source event/snapshot IDs and ruleset versions.

Confluence must distinguish independent evidence from duplicated evidence. Two modules using the same underlying swing or candle observation do not count as two independent confirmations. Evidence lineage is required to prevent double-counting.

A conflict is surfaced explicitly. The orchestration layer must not average incompatible strategy conclusions into false agreement.

## 8. Scenario preparation

A qualifying strategy may propose one or more conditional scenarios:
- directional hypothesis: bullish, bearish, or neutral;
- setup state: candidate, waiting for trigger, confirmed, invalidated, expired, or cancelled;
- trigger conditions, expressed as testable rules;
- relevant entry zone/condition, only when derivable from validated levels;
- invalidation level/condition;
- candidate objectives and supporting liquidity references;
- required confirmation and prohibited conditions;
- time horizon, expiry, and monitoring cadence;
- supporting/contrary evidence and confidence limitations.

A scenario is not an instruction to trade. The user retains manual discretion. Position sizing is handled separately by a validated risk module using broker-specific inputs.

## 9. Current-market and upcoming-session orchestration

Current Market evaluation and Upcoming Session Preparation are independent workflows sharing common data and strategy contracts.

Current Market workflow:
- evaluate new data and structural/liquidity events;
- update existing scenarios when relevant evidence changes;
- activate a scenario only after its explicit confirmation conditions pass;
- invalidate or expire scenarios when their rules require it.

Upcoming Session workflow:
- prepare before the configured session using versioned calendar boundaries;
- identify relevant levels, regime, structure, and competing objectives;
- produce conditional bullish/bearish/neutral pathways;
- specify what must happen for each pathway to activate;
- expire or refresh the preparation when the session context changes.

One workflow must not silently mark the other's scenarios confirmed. Shared evidence is referenced, not copied as independent confirmation.

## 10. Scenario lifecycle and state transitions

All transitions are event-driven and auditable:
- candidate -> waiting_for_trigger when prerequisites pass but trigger is absent;
- waiting_for_trigger -> confirmed only when all confirmation conditions pass on acceptable data;
- any active state -> invalidated when an explicit invalidation condition passes;
- candidate/waiting -> expired when the defined horizon ends;
- any nonterminal state -> cancelled by an authorized policy/user action.

A forming-candle trigger remains provisional. Closed-candle confirmation requirements are strategy-specific and versioned. State transitions record event time, observation time, rule version, source references, and reason.

## 11. Risk and execution boundary

The Strategy layer may identify risk considerations and structural invalidation, but it must not:
- access broker credentials or account execution APIs;
- place, modify, or close orders;
- assume contract size, pip value, tick value, or lot constraints;
- convert a scenario into a position size without verified broker-specific metadata and the separate Risk Calculator workflow.

Every user-facing output must label conditional scenarios clearly and remind that execution is manual.

## 12. Learning and performance feedback

Strategy performance records should include the strategy/ruleset version, eligibility context, scenario state transitions, outcome definition, market-data provenance, and relevant costs where known. Do not infer performance from incomplete or biased samples.

Experiment results may recommend a strategy change but cannot deploy it. Shared changes require:
1. experiment registration and hypothesis;
2. frozen baseline and candidate versions;
3. defined sample and evaluation window;
4. out-of-sample or walk-forward validation where appropriate;
5. robustness and sensitivity checks;
6. documented limitations and approval decision;
7. versioned release with rollback path.

Trader-private experiments remain private unless explicitly submitted for review through an approved process.

## 13. Output contracts

StrategyEvaluation:
- schema_version, evaluation_id, instrument_id, timeframe, as_of;
- market_state_snapshot_id, structure_snapshot_id, liquidity_snapshot_id;
- strategy_id, strategy_version, scope, enabled_state;
- eligibility_state and prerequisite_results[];
- ranking_factors[], rank/tie_group;
- supporting_evidence[], contrary_evidence[], uncertainty[], data_gaps[];
- selected_for_deep_evaluation boolean and reason;
- engine_version, policy_version, configuration_version.

ConditionalScenario:
- schema_version, scenario_id, strategy_id, strategy_version;
- workflow_type (current_market or upcoming_session);
- instrument_id, timeframe, direction_hypothesis;
- lifecycle_state, created_at, updated_at, expiry_at;
- trigger_conditions[], confirmation_requirements[], invalidation_conditions[];
- entry_condition/zone when supported, not mandatory;
- objective_candidates[], risk_considerations[];
- supporting_evidence[], contrary_evidence[], uncertainty[];
- source snapshot/event IDs and version identifiers;
- supersedes_scenario_id when applicable.

All scenario changes are append-only transition events.

## 14. Failure and conflict handling

- Missing required data results in unknown/ineligible, never assumed pass.
- Stale or conflicting snapshots block dependent confirmation.
- Disabled strategies cannot be selected by AI or ranking logic.
- Unknown strategy/schema versions are rejected.
- Conflicting strategies remain separately visible.
- A failure in one module does not halt unrelated modules.
- If no strategy qualifies, return no qualifying setup and explain why.
- Preserve prior scenario versions and transition history.

## 15. Observability

Track evaluations per strategy/instrument/timeframe, eligibility pass/fail/unknown rates, selection distribution, conflict rates, duplicate-evidence detection, scenario transitions, expiry/invalidation counts, processing latency, stale input rejections, module errors, and replay mismatches.

Logs use correlation IDs and version identifiers and must not contain secrets or unnecessary personal data.

## 16. Test and acceptance plan

Unit tests:
- disabled strategy cannot be selected;
- unknown prerequisite blocks eligibility;
- stale/incomplete data blocks confirmation;
- eligibility scope respects instrument/timeframe/session;
- ranking is deterministic and exposes factors/ties;
- duplicate evidence lineage is not counted as independent confluence;
- conflicting strategies remain visible;
- candidate/waiting/confirmed/invalidated/expired transitions obey rules;
- forming-candle triggers remain provisional;
- no qualifying strategy returns an explicit no-setup result;
- shared and private strategy permissions remain isolated;
- deterministic replay reproduces evaluations and scenario transitions.

Integration tests:
- consume versioned Market Intelligence, Structure, and Liquidity contracts;
- reject stale or unsupported schemas;
- current and upcoming-session workflows maintain independent lifecycles;
- Scanner evidence remains separately attributed;
- experiment proposals cannot change a released strategy without approval;
- risk/execution credentials and order APIs are absent from this layer.

Acceptance criteria:
1. Strategy enablement, eligibility, selection, and activation are distinct states.
2. Every decision is explainable from versioned prerequisites and evidence.
3. Unknown is never treated as pass.
4. Conflicting evidence and strategies are preserved.
5. Current and upcoming-session scenarios remain independent but connected.
6. No AI process can bypass permissions or deterministic gates.
7. No live order execution capability exists.

## 17. Rollout sequence

1. Implement registry and module/output contracts.
2. Implement permissions and enablement policy.
3. Implement deterministic eligibility evaluation.
4. Implement explainable ranking and evidence lineage.
5. Implement independent current-market and upcoming-session scenario lifecycles.
6. Add a small set of baseline strategies only after fixtures and rules are approved.
7. Run replay, regression, and shadow evaluation before any live read-only activation.

## 18. Repository status note

This document is a specification, not evidence that strategy orchestration is implemented or running. It depends on the Market Intelligence, Structure, and Liquidity contracts. Manual execution and production-safety boundaries remain unchanged.
