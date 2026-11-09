# Trading Vault — Master Product & Technical Specification
**Version:** 2.0 consolidation draft  
**Date:** 5 November 2026  
**Status:** Planning baseline for owner review — not an implementation release

## 1. Purpose and product direction

Trading Vault is a personal and multi-user trading-intelligence workspace for Forex majors and Gold. It combines a Scanner V2, a separate Trading Brain, risk tools, journal, behavioural coaching, strategy intelligence and controlled learning. It is decision support only. Traders execute manually in MT5.

The Brain is not simply a chart scanner. It provides a structured analytical process using ICT, SMC, traditional price action and indicators, with market context, liquidity, strategy evaluation, risk analysis, evidence provenance and explainable conclusions.

## 2. Non-negotiable product boundaries

- Manual MT5 execution only. No automatic order placement, modification or closing.
- MT5 connectivity, if implemented, is read-only for analysis.
- Brain and Scanner remain independent analytical systems; they collaborate through versioned contracts.
- Neither system silently overwrites the other's original conclusion.
- Final analysis is collaborative and must preserve disagreement, missing evidence and uncertainty.
- Private trader records remain isolated by authenticated user identity and database authorisation.
- Shared Core improvements require controlled experiments, validation, owner review and explicit approval.
- No credentials, service-role keys, provider secrets or broker secrets in client code or committed files.
- No production deployment, database migration or provider connection is authorised by this planning package.

## 3. Approved product and platform direction

| Area | Consolidated direction |
|---|---|
| Brain type | Hybrid Brain |
| Methodology | ICT + SMC + price action + indicators |
| Execution | Manual MT5 only; read-only integration boundary |
| Initial instruments | EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD, XAUUSD |
| Market data | Hybrid MT5 broker feed + independent provider/verification source |
| Scanner relationship | Independent pipelines with controlled collaboration |
| Analytical authority | Collaborative synthesis; uncertainty visible |
| Knowledge | Shared Core + private Trader Brain |
| Learning | Hypothesis-driven experiments and controlled promotion |
| User model | Personal + multi-user, open registration with email verification |
| Identity/data | Supabase Auth direction; user-owned private records and RLS |
| Execution style | Human review and manual trade execution |

## 4. System architecture

### 4.1 Platform layer
Authentication, user profiles, role/permission controls, tenant isolation, settings, storage, audit history, notifications, administration, subscription readiness and support workflows.

### 4.2 Scanner V2
Own scanning workflow, chart-image ingestion, chart recognition, setup discovery, scan history, structured scan output and user feedback. It is not a Brain engine.

### 4.3 Trading Brain
Own market-data ingestion, validation, context, specialist engines, evidence aggregation, confluence, conflict analysis, reasoning, risk validation, memory and controlled learning.

### 4.4 Collaboration layer
Versioned API/event contracts exchange structured evidence, source/timeframe, timestamps, provenance, confidence, uncertainty, status and invalidation. The receiving system treats the other system's output as evidence, not as an instruction.

### 4.5 Knowledge and governance layer
Shared Core contains approved common methodology and validated rules. Private Trader Brain contains personal scans, journals, experiments, preferences and performance. No automatic cross-user learning or silent Shared Core updates.

## 5. Specialist engine catalogue

The following specialist domains are required. Exact contracts, numeric thresholds and implementation boundaries remain open until formally specified.

1. Market Data and Provider Reliability
2. Market Context and Regime
3. Market Structure
4. Liquidity
5. ICT Concepts
6. Smart Money Concepts
7. Price Action
8. Indicators
9. Sessions and Time Context
10. News and Economic Calendar
11. Strategy and Setup Validation
12. Confluence and Decision Evidence
13. Risk and Portfolio Exposure
14. AI Reasoning and Orchestration
15. Memory and Knowledge
16. Experimental Learning
17. Performance and Validation
18. Scanner–Brain Collaboration
19. Behavioural Intelligence and Coaching
20. Administration, Monitoring and Product Intelligence

Each engine should declare purpose, inputs, outputs, dependencies, evidence/provenance, state model, errors, version, deterministic responsibilities and test criteria.

## 6. Market data and structural rules

### 6.1 Instrument and timeframe scope
Initial symbols: EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD and XAUUSD. Timeframe design covers M1 through weekly; final supported set and retention are open.

### 6.2 Data integrity
- Canonical timestamps: UTC.
- Preserve provider and broker symbol names, normalized mapping and contract metadata.
- Detect missing, duplicate, stale, malformed and out-of-order candles.
- Preserve provider disagreement and historical corrections as traceable events.
- Expose fallback/degraded state and data quality; never silently replace a source.
- Exact providers, cadence, retention, failover and correction policy remain open.

### 6.3 Confirmed/provisional state model
Forming-candle observations may update continuously as provisional. Confirmed structural events require a closed candle and explicit confirmation rules. A provisional event must never silently become confirmed.

### 6.4 Market structure rules already recorded
- Internal swings: 2-left / 2-right.
- External swings: 5-left / 5-right.
- External structure defines primary trend; internal shifts do not silently override it.
- Wick penetration is a break attempt or possible sweep; a close beyond the level confirms BOS under the selected rule.
- Staged shift: potential shift → closed-candle CHoCH → MSS supported by displacement and configured evidence → external structural reversal.
- Retest is not mandatory for initial MSS. Successful retest upgrades evidence; failed retest adds contrary evidence.
- Displacement uses body/range relative to ATR, close location, sequence, speed, broken level and follow-through. Volume is supplementary when available.
- Scope includes ranges, EQH/EQL, sweeps, MTF conflicts, invalidation, role reversal, OB, FVG, breaker, mitigation/rejection blocks, liquidity voids, OTE, AMD, Judas, Turtle Soup, liquidity pools and objectives.

## 7. Scanner V2 and Brain workflow

### Brain pipeline
Market Data → Data Validation → Market Context → Specialist Engines → Evidence Collection → Confluence & Conflict Analysis → Central Reasoning → Risk & Quality Validation → Structured Analysis → Trader Review → Manual MT5 execution.

### Scanner pipeline
Chart/image ingestion → chart and instrument recognition → image quality assessment → verified data alignment → scanner-specific analysis → structured scan result → user review.

### Collaboration
Exchange evidence through versioned contracts. Preserve each system's independent result, show agreements/disagreements, and explain how the combined view was formed. API schemas, event names, authentication, retries, ordering, idempotency and compatibility policy remain open.

## 8. Analysis and setup output

Every analysis should carry:
- Instrument, timeframe, timestamp (UTC), source and data-quality state.
- Regime and higher-timeframe context.
- Structure, levels, liquidity and ICT/SMC/price-action evidence.
- Bullish, bearish, missing and conflicting evidence.
- Setup lifecycle/status, confirmation requirements and invalidation.
- Entry area, stop idea and target logic only when supported by an explicit strategy.
- Risk estimate, assumptions, session and news warnings.
- Conclusion such as BUY / SELL / WAIT, with rationale and uncertainty.

A confidence score must be calibrated and explainable; it is not a guarantee of outcome.

## 9. Strategy and validation

- Modular, versioned strategies with explicit mandatory/optional conditions.
- Evidence-weighted confluence; avoid double-counting correlated evidence.
- Rule-by-rule pass/fail explanations.
- Historical candle replay and tick replay where reliable data exists.
- Backtests include spread, commission, slippage and execution assumptions.
- Use in-sample, out-of-sample and walk-forward evaluation.
- Test parameter sensitivity and market-regime robustness.
- No strategy is called validated or profitable without documented acceptance evidence.

## 10. Risk and portfolio protection

- Central risk engine with account profiles and configurable risk rules.
- Dynamic sizing requires verified contract size, pip/point value, symbol mapping and account currency.
- Monitor open/pending exposure, correlation and currency concentration.
- Drawdown, loss streak, volatility, spread, slippage and news-risk controls.
- Structural invalidation and net reward-to-risk after costs.
- Scenario and stress testing.
- All recommendations remain advisory; no automated execution.

## 11. Journal, psychology and coaching

- Structured journal plus free-form notes, screenshots and annotations.
- Link scans, setups, market context and trades where data is available.
- Keep decision quality separate from trade outcome.
- Track rule adherence, overtrading, revenge-trading patterns and risk violations without making unsupported psychological diagnoses.
- Coaching suggestions are evidence-based, optional and advisory.
- Journal, behavioural and performance records remain private to the trader.

## 12. Multi-user, security and governance

- Open registration with email verification and account recovery.
- Owner/admin/trader roles and least-privilege permissions.
- Supabase Auth direction and database-level tenant isolation/RLS.
- Private profiles, scans, chart images, journals, experiments and performance.
- Shared Core access is controlled; owner actions and approvals are audited.
- Secrets remain server-side; encryption in transit and at rest.
- Consent, data minimisation, retention, export, deletion, backup and incident procedures must be specified.
- Compliance readiness means documented controls and review, not a claim of automatic legal compliance.

## 13. AI and agent governance

- Specialist agents analyse independently before synthesis.
- Deterministic code owns critical calculations and validation.
- AI interprets, compares and explains; it must ground claims in evidence.
- Preserve contradictions; do not force consensus.
- Calibrate confidence and expose uncertainty.
- Version prompts, models, provider routing, evaluations and rollbacks.
- Model/provider selection, latency/cost budgets and benchmark thresholds remain open.

## 14. UX, monitoring and product capabilities

Unified responsive mobile/desktop interface; modular dashboards; saved layouts; chart visualisation; event timelines; evidence inspection; replay; global search; accessible controls; progressive loading; severity-ranked alerts; in-app notifications first; delivery retries and observability.

Administration, subscription readiness, usage entitlements, feature flags, support, announcements, product analytics, future integrations and instrument expansion are designed as modular capabilities. Billing activation and commercial launch are not authorised.

## 15. Testing, release and operations

Required test layers: unit, integration, end-to-end, historical replay, tick replay where available, edge-case, data quality, AI evaluation, risk calculation, security, performance, load and regression. Releases require documented gates, staged environments, versioned migrations, rollback, backups, monitoring and owner approval.

## 16. Open design items — must not be guessed

1. Exact independent market-data provider(s), MT5 read-only bridge and broker-specific symbol/contract metadata.
2. Hosting topology, worker technology, queue/event infrastructure and operational ownership.
3. Ingestion cadence, rate limits, latency budgets, retention and historical correction policy.
4. Engine-by-engine JSON schemas, event names, IDs, versioning, error semantics and compatibility.
5. Exact ICT/SMC definitions and numeric thresholds beyond already approved rules.
6. Strategy catalogue, entry/exit rules, filters, scoring and statistical acceptance criteria.
7. Risk sizing, account currencies, pip/point/contract metadata, exposure limits and warning thresholds.
8. AI model/provider choices, routing, fallback, cost/latency budgets and evaluation benchmarks.
9. News/calendar provider, event mapping, freshness, blackout windows and source reliability.
10. Supabase schema, RLS policies, storage buckets, chart-image lifecycle, audit and retention.
11. Memory retrieval, retention, deletion/export and shared/private compatibility.
12. Experiment sample sizes, fees/spread/slippage, out-of-sample design and Core promotion gates.
13. Monitoring dashboards, notification delivery, degraded modes and service-level objectives.
14. Security review, threat model, test coverage, performance targets and rollback criteria.
15. Subscription provider, payment/legal requirements and commercial launch policy.
16. Regulatory and privacy review for target user regions.

## 17. Reconciliation notes and legacy conflicts

- An earlier implementation package treated Supabase as proposed/unconfirmed. Later user decisions and project context establish Supabase Auth as the intended authentication direction. Use the later decision.
- Older documents contain generic technology suggestions (including Prisma/NextAuth/Socket.IO-style options) that were not established as approved choices. Do not implement them as authoritative.
- Earlier single-user assumptions are superseded by the Personal + Multi-user model.
- Any older Scanner-only or Brain-does-not-collaborate statement is superseded by independent systems with controlled collaboration.
- Any automated execution language is rejected by the manual MT5-only boundary.
- Existing foundation files are a scaffold, not proof that engines, schemas, migrations or tests are implemented.
- The live GitHub branch/file state could not be verified in this consolidation session; connector fetch attempts returned 404. Inspect the user's active Codespace before copying or merging files.

## 18. Implementation roadmap (proposed order)

### Phase 0 — Source-of-truth and repository audit
Verify current branch, working tree, existing foundation folder, application state, dependencies and current environment. Back up local uncommitted work. Identify duplicate/stale documents and collisions.

### Phase 1 — Contracts and architecture freeze
Approve system boundaries, engine contracts, Scanner–Brain messages, event model, error semantics, data provenance and versioning.

### Phase 2 — Data and security foundation
Finalize Supabase schema, RLS, storage, migrations, auth/roles, secrets, audit and private/shared boundaries. No migration before review.

### Phase 3 — Market data foundation
Select providers, build read-only MT5 bridge, normalization, UTC timestamps, validation, provider disagreement and fallback.

### Phase 4 — Deterministic analytical engines
Implement structure, liquidity, context, sessions, ICT/SMC, price action and indicators behind contracts; test provisional/confirmed state transitions.

### Phase 5 — Strategy, risk and validation
Implement rule-based strategies, transparent risk calculations, portfolio checks, replay/backtesting and statistical acceptance.

### Phase 6 — AI orchestration and collaboration
Add agent routing, synthesis, conflict reporting, model fallback, evidence grounding and Scanner collaboration.

### Phase 7 — User features
Integrate dashboards, charts, journal, psychology, alerts, history and user preferences.

### Phase 8 — Quality and staged release
Run all tests, security and tenant-isolation checks, performance/load tests, backup/restore and rollback drills. Require owner approval before merge/deployment.

## 19. Approval and scope

This package consolidates planning evidence. It is not production code, does not alter the repository, does not apply Supabase migrations, does not connect providers, does not enable MT5 execution, and does not deploy. The user must separately authorize implementation and any high-impact changes.
