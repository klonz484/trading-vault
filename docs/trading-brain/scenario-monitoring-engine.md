# Trading Brain — Scenario Monitoring Engine Specification

Status: Draft implementation specification
Scope: Continuous read-only monitoring of conditional trading scenarios
Execution: Manual MT5 only; no order placement or broker account control

## 1. Purpose

The Scenario Monitoring Engine (SME) owns the lifecycle of conditional scenarios after they are accepted from the Strategy and Reasoning layers. It monitors versioned market and analytical events, evaluates deterministic trigger/confirmation/invalidation/expiry conditions, and publishes auditable state transitions.

A scenario is a structured hypothesis with conditions. It is never an instruction to execute an order. The trader retains full manual control.

## 2. Responsibilities

- Validate and accept/reject scenario handoffs.
- Maintain independent current-market and upcoming-session scenario workflows.
- Subscribe to relevant instrument/timeframe evidence streams.
- Evaluate trigger, confirmation, invalidation, cancellation, and expiry conditions.
- Keep provisional observations separate from confirmed transitions.
- Update scenarios when source evidence is corrected or superseded.
- Notify authorized users through configured channels, subject to notification policy.
- Preserve complete transition history and explain every state change.

## 3. Scenario state model

Supported lifecycle states:
- candidate: scenario accepted for evaluation;
- waiting_for_trigger: prerequisites pass but trigger has not occurred;
- trigger_observed_provisional: trigger condition appears on forming data but is not confirmed;
- confirmed: all configured confirmation requirements pass on valid closed/confirmed inputs;
- invalidated: explicit invalidation condition has passed;
- expired: scenario horizon has elapsed;
- cancelled: authorized user or policy cancelled it;
- suspended: monitoring cannot continue because required data/services are unavailable;
- superseded: a newer scenario version replaces the active analytical definition.

Only permitted transitions are allowed. Terminal states cannot silently return to active states. Re-activation requires a new scenario or explicit versioned re-arm policy.

## 4. Trigger and confirmation contracts

Every scenario contains machine-readable conditions with:
- condition_id and condition type;
- source engine/event/schema;
- instrument/timeframe and comparison method;
- threshold/level references and tolerance;
- candle lifecycle requirement;
- evaluation window and timeout;
- AND/OR grouping and ordering;
- missing-data behavior;
- version and human-readable explanation.

The engine evaluates conditions deterministically. A model may explain the result but cannot decide that a numeric or state condition passed.

A forming-candle condition can produce only a provisional observation. Confirmation occurs only when all required closed-candle or confirmed-event conditions pass.

## 5. Invalidation and expiry

Invalidation conditions are explicit and take precedence over a pending trigger when the scenario rules specify. The engine must define how simultaneous trigger and invalidation events are resolved and record the exact evaluation order.

Expiry may be time-based, session-based, event-based, or a combination. Session expiry uses a versioned market calendar with timezone and daylight-saving support. Missing calendar data suspends or marks the scenario unavailable rather than guessing.

## 6. Current-market and upcoming-session workflows

Current-market scenarios monitor live read-only data and update as new source events arrive.

Upcoming-session scenarios prepare conditional pathways before a session opens. They may transition to active monitoring only under their defined session activation rule. Their preparation state is not a market confirmation.

The two workflows have separate IDs, state machines, expiry rules, and reports. They may reference common evidence but cannot silently mutate each other's states.

## 7. Event processing and idempotency

Every incoming source event has a stable event ID, source version, event time, and ingestion time. The SME must:
- process duplicate deliveries idempotently;
- preserve event ordering using source sequence/watermark rules;
- handle late-arriving events and historical corrections;
- record replay/correction evaluations;
- avoid duplicate notifications for the same transition;
- isolate failures by scenario and instrument.

When event ordering is uncertain, the engine marks the evaluation unresolved and schedules a replay rather than inventing chronology.

## 8. Monitoring subscriptions

Subscribe only to data required by the scenario's conditions. Subscriptions include instrument, timeframe, event types, freshness requirements, and source quality thresholds. Remove or expire subscriptions when scenarios become terminal.

Monitoring cadence may vary by condition and timeframe, but must not create false precision from data that is not available. Polling/streaming lag and last successful observation are visible to the user.

## 9. Notifications

Notifications are emitted only for meaningful state changes or configured milestones. They include:
- scenario ID and version;
- instrument/timeframe and workflow;
- previous and new state;
- exact triggering evidence and timestamp;
- remaining conditions or invalidation reason;
- data quality and freshness;
- manual-execution reminder.

Notification delivery is separate from scenario state persistence. A delivery failure must not roll back a valid transition. Retries use idempotency keys and respect user preferences.

## 10. Output contracts

ScenarioStateSnapshot:
- schema_version, scenario_id, scenario_version;
- instrument_id, timeframe, workflow_type;
- current_state, previous_state, as_of, last_evaluated_at;
- trigger_condition_results[], confirmation_results[];
- invalidation_results[], expiry_results[];
- provisional_observations[], confirmed_evidence[];
- source_event_ids, source_snapshot_ids, data_watermark, quality_state;
- next_required_observation, suspended_reason;
- engine_version, ruleset_version, configuration_version.

ScenarioTransitionEvent:
- transition_id, scenario_id, scenario_version;
- previous_state, new_state, transition_reason;
- occurred_at, detected_at, evaluated_at;
- triggering_condition_ids, source_event_ids, source_snapshot_ids;
- quality_state, ruleset_version, engine_version;
- notification_status and idempotency_key.

Transitions are append-only and immutable. Snapshots can be regenerated from the event history.

## 11. Failure and recovery

- Stale or missing required data suspends dependent monitoring or marks it degraded; it never satisfies a condition.
- Unknown schema or malformed events are quarantined and surfaced.
- Source corrections trigger deterministic re-evaluation and a correction event.
- A service restart rebuilds state from durable transition history and source watermarks.
- Notification outages do not stop state evaluation.
- If replay cannot establish event order, state remains unresolved until reconciled.
- No scenario is silently deleted when its monitoring fails.

## 12. Security and tenancy

All scenario records, subscriptions, and notifications are tenant-scoped. A user can access only their own private scenarios and authorized shared information. Administrative inspection is audited. No broker credentials or order APIs are required by this engine.

## 13. Observability

Track active scenarios by state, evaluation latency, source lag, suspended scenarios, transition counts, duplicate events, late corrections, replay outcomes, notification delivery/retry rates, and condition-evaluation errors.

## 14. Test and acceptance plan

Unit tests:
- allowed and forbidden state transitions;
- forming-candle trigger remains provisional;
- confirmation requires all required conditions;
- invalidation/trigger simultaneous-event ordering;
- time/session expiry and daylight-saving boundaries;
- missing data suspends rather than confirms;
- duplicate source event is idempotent;
- late event triggers deterministic replay;
- notification retry does not duplicate state transition;
- terminal states cannot silently reactivate.

Integration tests:
- accepts only valid Strategy/Reasoning handoffs;
- consumes versioned market/structure/liquidity events;
- tenant isolation across scenarios and notifications;
- restart reconstructs state from durable event history;
- notification failure does not roll back transitions;
- no broker execution API or credential dependency.

Acceptance criteria:
1. Every transition is deterministic, explainable, and auditable.
2. Provisional and confirmed states remain distinct.
3. Current-market and upcoming-session workflows remain independent.
4. Missing/stale data never satisfies a condition.
5. Event delivery and notifications are idempotent.
6. Scenario state can be rebuilt from durable history.
7. No order execution capability exists.

## 15. Rollout sequence

1. Implement scenario and condition schemas.
2. Implement deterministic state machine and transition ledger.
3. Add idempotent event ingestion and replay.
4. Add subscriptions and data-quality suspension.
5. Add notification outbox and delivery retries.
6. Run event-ordering, recovery, and tenancy tests.
7. Shadow monitor historical and read-only streams before activation.

## 16. Repository status note

This document is a specification, not evidence that scenario monitoring is implemented or running. Durable persistence, event delivery, and notifications require their respective infrastructure and tests.
