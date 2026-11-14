# Trading Brain — Reasoning and Confluence Engine Specification

Status: Draft implementation specification
Scope: Evidence synthesis, conflict analysis, explainable conclusions, and handoff to scenario monitoring
Markets: Forex majors and XAUUSD
Execution: Manual MT5 only; no order placement

## 1. Purpose

The Reasoning and Confluence Engine (RCE) synthesizes versioned evidence from Market Intelligence, Structure, Liquidity, Strategy, session context, and optional Scanner observations. It produces a traceable analytical conclusion that explains what is known, what is uncertain, what supports each hypothesis, what contradicts it, and what conditions would change the conclusion.

The RCE is the collaborative analytical layer. It does not replace the independent authority of upstream engines over their own data, and it cannot manufacture confirmations or override deterministic quality and permission gates.

## 2. Operating principles

- Evidence first: conclusions must link to source events and snapshots.
- Independent evidence: duplicated observations are not counted as separate confirmations.
- Explicit uncertainty: unknown, unavailable, stale, and conflicting are first-class states.
- Symmetric challenge: every directional hypothesis is checked for contrary evidence.
- Versioned reasoning: model, prompt, rules, source schemas, and configuration are recorded.
- Deterministic gates: AI-generated prose cannot bypass closed-candle confirmation, data-quality, strategy permission, or invalidation rules.
- Reproducibility: the same evidence bundle and versioned configuration should yield a replayable decision record.
- Manual execution: output is analysis and conditional planning, never an order.

## 3. Inputs and evidence envelope

Accepted inputs may include:
- Market Intelligence state, candle lifecycle, volatility/regime observations, and data-quality flags;
- Structure snapshots and structural events;
- Liquidity levels, sweep/reclaim events, and objective candidates;
- Strategy evaluations and conditional setup candidates;
- current-market or upcoming-session context and calendar version;
- Scanner image-derived evidence, clearly labelled with its source and limitations;
- trader-specific preferences and enabled strategy policy, subject to access controls.

Each evidence item carries:
- evidence_id, source_engine, source_record_id, source_schema_version;
- instrument, timeframe, observed_at, detected_at, confirmed_at when applicable;
- provisional/confirmed/invalidated/unavailable state;
- evidence category, direction or neutral classification;
- supporting/contrary/ contextual role;
- source snapshot IDs, quality state, provenance and version identifiers.

The RCE must reject malformed, stale, unsupported, or unauthorized evidence according to policy. It must not infer missing values.

## 4. Evidence normalization and lineage

Normalize evidence into a common envelope while retaining the original source payload and ownership. Evidence lineage records the underlying bars, levels, events, and snapshots from which an observation was derived.

If two indicators or strategies depend on the same underlying event, mark their evidence as correlated or derived from a shared source. Do not count them as independent confirmations. The lineage graph must be inspectable by the user and available to tests.

Scanner-derived observations remain distinct from native market-data events. They may corroborate or challenge an interpretation but cannot rewrite an upstream engine's authoritative record.

## 5. Hypothesis generation

The RCE may evaluate a bounded set of hypotheses:
- bullish continuation;
- bearish continuation;
- bullish reversal / structural shift;
- bearish reversal / structural shift;
- range or consolidation;
- no actionable directional conclusion;
- insufficient or conflicting evidence.

Hypotheses are candidates for evaluation, not predictions. The engine should avoid generating a directional hypothesis when the evidence bundle is inadequate.

Each hypothesis records its prerequisites, evidence set, contrary evidence, unresolved conditions, invalidation conditions, and time horizon.

## 6. Confluence evaluation

Confluence is an evidence relationship, not a raw count of indicators. Evaluation considers:
- evidence relevance to the instrument and timeframe;
- confirmation state and data quality;
- source independence and lineage;
- agreement or conflict across timeframes;
- market regime and session relevance;
- recency and whether evidence has been superseded;
- strategy-specific prerequisites;
- explicit opposing evidence.

The output must show factor-level contributions and explain why evidence was included, discounted, or excluded. Avoid a single opaque confidence percentage. If a score is used, publish its definition, calibration limits, and component contributions.

## 7. Challenge and falsification pass

For every leading hypothesis, run a structured challenge:
1. Identify the strongest contrary evidence.
2. Check whether apparent confirmations are duplicates.
3. Check for stale, incomplete, or provisional source events.
4. Check higher-timeframe conflict and regime mismatch.
5. Identify what observation would invalidate the hypothesis.
6. Identify alternative explanations consistent with the same evidence.
7. State what is not known and what data would resolve it.

The challenge result is stored alongside the original hypothesis. A hypothesis cannot be labelled confirmed merely because the language model expresses high confidence.

## 8. Decision states

Supported analytical states:
- developing: evidence is accumulating but required confirmation is absent;
- conditional: a coherent hypothesis exists with explicit trigger requirements;
- confirmed: all deterministic confirmation requirements for the relevant analytical event have passed;
- conflicted: meaningful supporting and contrary evidence remain unresolved;
- invalidated: an explicit invalidation condition has passed;
- expired: the evidence horizon or scenario expiry has elapsed;
- unavailable: required data or services are missing or unacceptable;
- no_setup: no strategy/hypothesis meets the configured criteria.

These states describe analytical readiness, not a command to trade. The RCE must not collapse conflicted, unavailable, or no_setup into WAIT without preserving the reason and relevant detail.

## 9. LLM and deterministic responsibility split

Deterministic code owns:
- schema validation and evidence freshness;
- source quality and candle-state checks;
- permissions and strategy enablement;
- mathematical calculations and threshold comparisons;
- event confirmation and invalidation;
- evidence lineage and duplicate detection;
- state transitions and audit records.

An LLM may:
- summarize structured evidence;
- compare competing hypotheses;
- explain conflicts and uncertainty in natural language;
- propose questions or missing observations for further analysis;
- produce a user-readable rationale constrained to supplied evidence.

An LLM must not:
- invent prices, candles, levels, source events, or calculations;
- promote provisional events to confirmed;
- bypass an invalidation or quality gate;
- change strategy permissions or released rules;
- trigger broker execution;
- silently alter a persisted state.

All generated claims should reference evidence IDs. If the model cannot cite support from the supplied bundle, the claim is omitted or labelled as a question/hypothesis.

## 10. Output contracts

ReasoningReport:
- schema_version, report_id, instrument_id, evaluation_time;
- workflow_type (current_market or upcoming_session);
- input_snapshot_ids and evidence_bundle_hash;
- leading_hypotheses[], alternative_hypotheses[];
- confluence_factors[], duplicate_or_correlated_evidence[];
- supporting_evidence[], contrary_evidence[], excluded_evidence[];
- challenge_results[], unresolved_questions[], data_gaps[];
- analytical_state and deterministic_gate_results[];
- trigger_conditions[], invalidation_conditions[], expiry_at;
- human_summary and limitations;
- engine_version, ruleset_version, model_identifier, prompt_version, configuration_version;
- supersedes_report_id when applicable.

Each hypothesis includes direction, rationale, evidence IDs, contrary evidence IDs, prerequisites, state, and invalidation logic.

Reasoning reports are immutable snapshots. Updates create new reports with explicit supersession links.

## 11. Current-market and upcoming-session separation

Current-market reasoning evaluates live read-only evidence and updates current conditional scenarios as source events arrive.

Upcoming-session reasoning prepares conditional pathways from pre-session context, relevant levels, calendar, and likely scenarios. It does not imply that a future event has occurred.

Both workflows may reuse evidence IDs and shared snapshots, but their reports, state machines, expiry, and activation rules remain independent. A pre-session hypothesis cannot become a current confirmed event without fresh current-market evidence and its own confirmation process.

## 12. Scenario Engine handoff

The RCE hands off structured hypotheses and conditions to the Scenario Monitoring Engine. It does not own continuous monitoring or independently advance scenario states after the handoff.

The handoff includes:
- scenario candidate and strategy references;
- deterministic trigger and confirmation requirements;
- invalidation and expiry conditions;
- evidence bundle and lineage;
- supporting/contrary evidence;
- monitoring requirements and missing data conditions.

The receiving engine acknowledges accepted/rejected handoffs with schema and validation details.

## 13. Failure and fallback behavior

- If required upstream evidence is missing, mark unavailable or degraded.
- If providers disagree, preserve source-specific evidence and report the conflict.
- If the LLM service is unavailable, deterministic evidence and state outputs remain available; natural-language explanation may be omitted or use a safe template.
- If model output fails schema or evidence-reference validation, reject it and retain deterministic results.
- If the evidence bundle changes during evaluation, bind the report to the original immutable bundle and schedule a new evaluation.
- If a required source is stale, block dependent confirmation.

## 14. Security and privacy

Enforce trader isolation before evidence retrieval and before report persistence. Shared Core evidence and private trader evidence must be separately scoped. Never send secrets, broker credentials, or unnecessary personal data to model providers. Model requests should use the minimum evidence required and follow configured retention and privacy policies.

## 15. Observability

Track evidence bundle size, stale/rejected inputs, duplicate evidence rate, hypothesis distribution, conflict rate, unsupported-claim rejection rate, model latency/failure, schema validation failures, report supersession rate, and downstream handoff acceptance.

Every report is correlated with source snapshot IDs and exact engine/model/configuration versions. Logs must not contain credentials or raw secrets.

## 16. Test and acceptance plan

Unit tests:
- evidence envelope validation and unsupported schema rejection;
- stale and provisional evidence cannot satisfy confirmed gates;
- evidence lineage detects duplicate/correlated sources;
- strongest contrary evidence is retained;
- every hypothesis has traceable support and invalidation conditions;
- no directional hypothesis when evidence is insufficient;
- model claims without evidence IDs are rejected;
- model output cannot alter deterministic state;
- unavailable LLM leaves deterministic output usable;
- current and upcoming-session reports remain separate;
- immutable report supersession and replay behavior.

Integration tests:
- consumes versioned Market Intelligence, Structure, Liquidity, and Strategy contracts;
- Scanner evidence remains separately attributed;
- tenant isolation is enforced on input and output;
- deterministic gate outcomes are preserved in reports;
- scenario handoff validates and records acknowledgement;
- missing/stale source data prevents dependent confirmation.

Acceptance criteria:
1. Every material conclusion is traceable to versioned evidence.
2. Supporting and contrary evidence are both visible.
3. Duplicate evidence is not double-counted.
4. AI-generated explanations cannot override deterministic gates.
5. Uncertainty and unavailable states are explicit.
6. Current and upcoming-session reasoning are independent but connected.
7. No order execution capability exists.

## 17. Rollout sequence

1. Implement evidence envelope, lineage graph, and schema validation.
2. Implement deterministic hypothesis and confluence evaluation.
3. Implement challenge/falsification records.
4. Add constrained LLM explanation with evidence-reference validation.
5. Integrate with Scenario Monitoring through a versioned handoff.
6. Run historical replay and adversarial tests for unsupported claims.
7. Shadow outputs before enabling live read-only analysis.

## 18. Repository status note

This document is a specification, not evidence that the RCE is implemented or running. It depends on versioned upstream engine contracts and preserves the project's read-only/manual-execution boundary.
