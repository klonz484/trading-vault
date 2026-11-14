# Trading Brain — Experiment and Learning Engine Specification

Status: Draft implementation specification
Scope: Controlled, auditable evaluation of strategy and analytical improvements
Execution: Research and simulation only; no automated or live trade execution

## 1. Purpose

The Experiment and Learning Engine (ELE) manages hypotheses about potential improvements to strategies, features, thresholds, and analytical workflows. It provides reproducible experiments, tracks outcomes and limitations, and prepares evidence-backed recommendations.

Learning is controlled experimentation, not automatic self-modification. No experiment may silently change a released shared Core Brain rule or a trader's active strategy configuration.

## 2. Learning architecture

Two scopes are maintained:
- Shared Core Learning: evaluates changes to shared engine and strategy definitions. A proposed release requires controlled testing and explicit owner approval.
- Private Trader Learning: stores an individual trader's private experiments, preferences, and performance history, isolated from other users. Private results do not automatically become shared Core knowledge.

Shared and private experiment data must have separate access controls, storage policies, and audit histories. A user may explicitly submit a private experiment for review, but submission does not imply approval or publication.

## 3. Experiment lifecycle

Supported states:
- proposed: hypothesis and expected mechanism recorded;
- designed: protocol, metrics, sample, and controls defined;
- approved_for_research: permitted to run in research/simulation;
- running: data collection or replay in progress;
- completed: planned sample/window finished;
- inconclusive: evidence insufficient or contradictory;
- rejected: protocol or candidate fails review;
- recommended: results support a documented candidate change;
- approved_for_release: authorized owner approval recorded for a shared change;
- released: versioned change deployed through a separate controlled release process;
- rolled_back: released candidate reverted through an audited release process.

A result cannot jump directly from running to released. Research approval and release approval are separate decisions.

## 4. Experiment definition

Each experiment records:
- experiment_id, scope (shared/private), owner/creator, creation time;
- hypothesis and proposed mechanism;
- baseline strategy/engine/ruleset versions;
- candidate version or parameter set;
- instruments, timeframes, sessions, and regimes in scope;
- inclusion/exclusion criteria;
- dataset/source IDs and data-quality requirements;
- sample size target and evaluation window;
- primary metric, secondary metrics, and guardrails;
- control/baseline method and comparison design;
- train/validation/test or walk-forward partitions;
- cost/slippage assumptions and known limitations;
- protocol version, status, reviewer decisions, and audit references.

An experiment without a frozen baseline and explicit outcome definition cannot produce a release recommendation.

## 5. Data integrity and leakage controls

- Preserve source provenance and historical data versions.
- Prevent future information from leaking into features or labels.
- Split data chronologically where appropriate.
- Keep tuning/selection data separate from final holdout evaluation.
- Record survivorship, selection, and missing-data biases.
- Do not treat overlapping observations as independent samples.
- Include spread, commission, slippage, and execution constraints when known; otherwise mark performance estimates incomplete.
- Never fabricate missing broker or market costs.

Historical corrections create a new experiment run or dataset version rather than silently replacing prior results.

## 6. Evaluation methodology

Evaluation should use metrics suited to the hypothesis and sample, which may include:
- setup frequency and eligibility rate;
- confirmation and invalidation rates;
- false-positive and missed-opportunity rates under a documented label definition;
- expectancy and risk-adjusted outcome metrics only when outcome data and costs are sufficiently complete;
- drawdown and adverse/favorable excursion;
- stability across instruments, timeframes, sessions, and regimes;
- parameter sensitivity and robustness;
- operational latency, failure, and data-quality guardrails.

Report confidence intervals or uncertainty where statistically appropriate. Avoid overclaiming from small samples. Multiple testing and repeated tuning must be documented.

A strategy change is not recommended solely because one aggregate metric improved. Guardrails, stability, sample quality, and failure cases must be reviewed.

## 7. Simulation and paper evaluation

The engine may replay historical market data and simulate analytical state transitions. Simulation is not equivalent to broker execution. Any simulated fill assumptions must be explicit and must not be presented as realized live performance.

No live order placement, account connection, or automatic trading is part of the ELE. Manual journal records may be used only when authorized and correctly attributed.

## 8. Recommendation and approval workflow

A recommendation package includes:
1. hypothesis and intended change;
2. baseline and candidate versions;
3. frozen protocol and data provenance;
4. sample characteristics and quality checks;
5. primary/secondary metrics and guardrail results;
6. regime/instrument/timeframe breakdown;
7. robustness and sensitivity results;
8. known failures and limitations;
9. rollback plan;
10. recommendation: reject, inconclusive, continue research, or propose release.

For shared Core changes, an explicit owner approval record is required before release. Approval records include approver identity, exact candidate version/hash, scope, timestamp, and rationale. Routine user authorization for development does not constitute approval for a production release.

Private experiments can inform that trader's private settings only through an explicit, auditable user action and applicable validation gates.

## 9. Core Brain release controls

A shared release must:
- use immutable versioned artifacts;
- pass unit, integration, regression, and replay tests;
- include compatibility and migration notes where needed;
- have staged/shadow evaluation evidence;
- include monitoring thresholds and rollback instructions;
- be approved by the authorized owner for the exact artifact;
- preserve the prior known-good version.

No model or experiment may modify shared production rules in place. Emergency rollback is a separately authorized operational action.

## 10. Output contracts

ExperimentRecord:
- schema_version, experiment_id, scope, owner_id;
- hypothesis, mechanism, baseline_version, candidate_version;
- protocol_version, dataset_versions, instrument/timeframe/session scope;
- sample_definition, metrics_definition, guardrails;
- lifecycle_state, created_at, updated_at;
- approvals[], reviewer_notes[], audit_event_ids.

ExperimentRun:
- run_id, experiment_id, run_version;
- start/end time, code/configuration hash;
- data provenance, quality report, partition metadata;
- sample counts and exclusions;
- metric_results[], uncertainty_estimates[], breakdowns[];
- leakage/bias checks, robustness_results[];
- failures, limitations, reproducibility metadata.

ReleaseRecommendation:
- recommendation_id, experiment_id, candidate_hash;
- outcome (reject, inconclusive, continue_research, propose_release);
- evidence_summary, guardrail_results, risk/limitations;
- required_approvals[], rollback_plan, generated_at.

Records are immutable by version; updates create new versions or append-only audit events.

## 11. Privacy and access control

Private experiment records, journal outcomes, and performance histories are tenant-isolated. Shared Core datasets must be explicitly curated and approved. No cross-user learning or pooling of private records occurs by default. Any future opt-in contribution mechanism requires explicit informed consent, clear scope, revocation policy, and separate privacy review.

## 12. Failure and safety behavior

- Incomplete or low-quality data marks results inconclusive or invalid.
- Missing cost assumptions are disclosed and block claims of net profitability.
- Failed reproducibility checks block recommendations.
- Candidate changes cannot overwrite baseline artifacts.
- Approval for research cannot be interpreted as release approval.
- Shared release requires explicit owner approval for the exact artifact.
- No experiment can access broker order execution.

## 13. Observability

Track experiment lifecycle counts, runs by status, data-quality failures, sample exclusions, reproducibility mismatches, leakage/guardrail failures, candidate-versus-baseline metrics, approval latency, release/rollback events, and private/shared access violations.

## 14. Test and acceptance plan

Unit tests:
- lifecycle rejects unauthorized state transitions;
- baseline and candidate versions remain immutable;
- chronological partitions prevent look-ahead leakage;
- missing costs mark net-performance results incomplete;
- small/biased samples are not labelled conclusive;
- repeated tuning and multiple tests are recorded;
- private experiments are inaccessible across tenants;
- research approval cannot release shared Core;
- owner approval is bound to exact candidate hash;
- rollback preserves previous artifact and audit trail.

Integration tests:
- experiment consumes versioned Strategy/Reasoning/Scenario records;
- historical replay is reproducible;
- dataset corrections create new run versions;
- recommendation package includes provenance and limitations;
- release pipeline requires exact approval and test evidence;
- private learning never enters shared Core without explicit reviewed contribution.

Acceptance criteria:
1. Learning occurs through registered, reproducible experiments.
2. No automatic mutation of active strategy or shared Core rules occurs.
3. Private trader history remains isolated.
4. Shared Core release requires explicit owner approval.
5. Data leakage, sample bias, and missing costs are visible.
6. Simulation is never represented as live broker performance.
7. No live order execution capability exists.

## 15. Rollout sequence

1. Implement experiment, protocol, and immutable version contracts.
2. Implement tenant-scoped private/shared storage boundaries.
3. Implement dataset quality, partitioning, and leakage checks.
4. Implement replay and metric calculation framework.
5. Implement recommendation and approval records.
6. Integrate with a separately controlled release pipeline.
7. Validate using synthetic fixtures and historical replay before any production learning workflow.

## 16. Repository status note

This document is a specification, not evidence that the ELE or a release pipeline is implemented or running. Shared Core changes remain gated by controlled validation and explicit owner approval.
