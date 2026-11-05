# Implementation Roadmap

## Phase 0 — Repository and source-of-truth audit
- Inspect Codespace branch, status, file tree and current app.
- Identify the existing 37-file Brain scaffold and any duplicate folders.
- Compare legacy documents and this consolidation.
- Protect environment files and uncommitted work.
- Output: verified repository audit and approved file-change plan.

## Phase 1 — Architecture and contract freeze
- Define service boundaries and independent Scanner/Brain pipelines.
- Specify versioned engine and collaboration contracts.
- Define event state, provenance, confidence, uncertainty and error handling.
- Output: reviewed architecture decision records and JSON schemas.

## Phase 2 — Identity, database and security
- Confirm Supabase project and Auth configuration.
- Design profiles, roles, scans, chart assets, journal, experiments and knowledge.
- Define RLS for every private table and storage object.
- Add migrations only after review and explicit implementation authorization.
- Output: reviewed schema, RLS matrix and migration plan.

## Phase 3 — Market data
- Select provider(s), implement normalization and read-only MT5 bridge.
- Validate timestamps, candles, symbol mapping, missing data and disagreement.
- Implement fallback and degraded status.
- Output: data-quality suite and provider contract.

## Phase 4 — Deterministic engines
- Implement market context, structure, liquidity, sessions, ICT, SMC, price action and indicators.
- Preserve provisional/confirmed states and structural hierarchy.
- Output: engine contracts and replay-backed tests.

## Phase 5 — Strategy, risk and validation
- Implement explicit versioned strategies, rule-level pass/fail and risk calculations.
- Add portfolio exposure, costs and scenario analysis.
- Validate via historical replay, out-of-sample and robustness checks.
- Output: evidence-backed strategy and risk acceptance reports.

## Phase 6 — AI orchestration and Scanner collaboration
- Add specialist-agent routing, synthesis, evidence grounding and uncertainty.
- Add versioned Scanner–Brain communication and conflict preservation.
- Output: benchmark and end-to-end collaboration tests.

## Phase 7 — Product experience
- Add dashboards, charts, alerts, journal, psychology, support and personalisation.
- Preserve private user ownership and accessibility.
- Output: mobile/desktop acceptance and usability tests.

## Phase 8 — Production readiness
- Separate dev/staging/prod, CI/CD, observability, backups and rollback.
- Run security, load, performance, disaster-recovery and tenant-isolation tests.
- Require explicit owner approval before merge or production deployment.
