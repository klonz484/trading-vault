# Open Items and Implementation Gates

These are intentionally left open. Option C recommendations do not replace provider selection, technical measurements, legal review or acceptance evidence.

## Priority 0 — Before implementation
- Confirm the live repository branch and working tree; preserve uncommitted work.
- Finalize Scanner–Brain contracts: JSON schemas, event names, identifiers, versioning, errors, retries, idempotency and ordering.
- Finalize Supabase schema, RLS, storage policies and user/owner roles.
- Define read-only MT5 bridge, authentication boundary and broker symbol/contract metadata.
- Select independent market-data provider and define data licensing, cadence, latency, fallback and retention.
- Confirm no code or migration conflicts with existing app.

## Priority 1 — Before analytical engine acceptance
- Exact ICT/SMC definitions and numeric thresholds.
- Strategy rule catalogue and setup lifecycle.
- Position-sizing assumptions for each instrument/account currency.
- Confluence calibration and confidence methodology.
- Backtest/replay data, sample sizes, costs and out-of-sample acceptance.
- News/calendar provider, impact mapping and event freshness.

## Priority 2 — Before AI and multi-user launch
- AI provider/model selection, routing, cost/latency budgets and benchmarks.
- Memory retrieval and retention policy.
- Threat model, privacy controls, export/deletion, audit and incident handling.
- Monitoring SLOs, alerts, degraded-mode behaviour and backup/restore tests.
- Accessibility, mobile performance and concurrency targets.

## Priority 3 — Before commercial release
- Payment provider, tax/invoice requirements and subscription terms.
- Regional regulatory and privacy review.
- Customer support operations, service status and incident communications.
- Pricing and usage entitlements approved by owner.

## Acceptance gates
A phase is not complete merely because code exists. Require:
1. Approved requirements and interface contracts.
2. Tests and inspectable evidence.
3. Security and tenant-isolation checks where relevant.
4. Failure and rollback handling.
5. Owner review and explicit release approval.
