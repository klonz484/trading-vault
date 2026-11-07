# Market Data Engine Correction Plan

Status: Implementation started on the isolated correction branch; local execution checks are pending.

## Implementation progress (2026-11-06)

Implemented in this branch:
- UTC normalization for offset-free, date-only and explicit-offset Twelve Data timestamps, retaining original timestamp and timezone metadata.
- Candle lifecycle flagging using the requested UTC interval boundary; this remains a documented estimate pending provider-semantic verification.
- Structural OHLC/positive-price/volume checks, source metadata checks, future timestamp detection, duplicate detection, monotonic ordering checks in either provider order, mixed-series checks and interval-gap warnings.
- Fail-closed service behavior: invalid or stale series expose no analytical candles; original observations remain in `rawCandles`. Valid descending provider responses are normalized to ascending order for consumers.
- Structured provider errors for malformed responses, entitlement restrictions, invalid requests, rate limits, upstream failures and timeouts; no automatic retry or fallback is enabled.
- Versioned snapshots, raw observation provenance, immutable in-memory correction events and deterministic validation replay using the recorded clock, threshold and validator version.
- Independent provider close-conflict comparison requiring an explicit positive threshold; no price averaging or silent replacement.
- Node built-in regression tests covering timestamp parsing, validation, order/gaps, provider conflict handling, correction history, replay, malformed JSON and fail-closed service behavior.

Still pending:
- Run `npm test`, `npm run lint` and `npm run build` in the Codespace.
- Review actual provider candle-close semantics and account-specific entitlements/licensing before any live use.
- Durable persistence, historical correction storage, provider comparison orchestration, Scanner/Brain integration and calibrated thresholds remain out of scope.

No live provider credentials, provider activation, Supabase changes, deployment, merge or production activation have been performed.
Baseline: `e56b4e05928b6e3ada21c0f18b2dfbb333a18b49`
Working branch: `build/market-data-engine-corrections`
Scope: Market Data Engine package only. This document does not authorize production activation, provider connections, database changes, deployment, paid services, or automated trading.

## Objectives and implementation sequence

### 1. Timestamp integrity
- Parse provider timestamps according to documented provider timezone semantics; do not rely on the server's local timezone.
- Preserve the exact source timestamp and timezone/offset metadata alongside a normalized UTC instant.
- Reject or quarantine unparseable timestamps and flag materially future-dated observations.
- Keep retrieval time separate from source event time.

Acceptance criteria:
- Equivalent timestamps with explicit offsets normalize to the same UTC instant.
- Offset-free timestamps are interpreted only under an explicit provider contract, never by host-local defaults.
- Invalid and future timestamps produce explicit validation findings and cannot be marked READY.
- Source timestamp text and timezone interpretation remain inspectable.

### 2. Candle lifecycle
- Model forming/provisional and closed/confirmed candles as distinct evidence states.
- Determine closure only from provider-supported semantics or an explicit, documented closure rule.
- Do not label every returned candle confirmed by default.
- Preserve updates to a forming candle without silently converting prior provisional evidence into confirmed evidence.

Acceptance criteria:
- Provider data without reliable closure evidence is not silently marked confirmed.
- Provisional updates remain provisional until the confirmation rule is met.
- Closed-candle confirmation is deterministic, tested, and traceable to its rule.
- Scanner and Brain consumers can distinguish provisional from confirmed observations.

### 3. Candle and series validation
- Validate finite OHLC values and the invariant high >= max(open, close), low <= min(open, close), high >= low.
- Validate positive/valid prices, timestamps, chronological ordering, duplicate timestamps, expected interval gaps, and volume when supplied.
- Validate timeframe and instrument metadata against the request and provider response.
- Preserve raw ordering evidence before any normalization/sorting.

Acceptance criteria:
- Each invalid condition produces a structured, attributable finding.
- Duplicate, unordered, missing-interval, invalid-volume, and malformed-OHLC fixtures are detected.
- Missing intervals are distinguished from confirmed market closures where calendar/session rules are available.
- A series cannot be READY while blocking validation errors remain.

### 4. Invalid-data containment
- Separate raw provider observations from validated/eligible analytical candles.
- Keep invalid observations available for diagnostics and audit, but exclude them from the eligible analytical set.
- Make readiness and eligibility explicit in the service contract.
- Ensure Scanner and Brain receive only evidence that satisfies the declared consumer policy; provisional evidence must be explicitly marked.

Acceptance criteria:
- Invalid candles cannot be consumed through the normal validated-data path.
- Diagnostic access preserves the original observation and its validation findings.
- READY/DEGRADED/STALE/INCOMPLETE/CONFLICTED/UNAVAILABLE states have documented consumer behavior.
- No consumer can mistake a validation warning for proof of analytical validity.

### 5. Provider resilience and secret handling
- Normalize malformed JSON, provider error payloads, HTTP failures, timeouts, quota limits, and unsupported capabilities into structured errors.
- Distinguish rate limits, entitlement/plan restrictions, invalid requests, transient upstream failures, and permanent failures.
- Retry only explicitly retryable failures with bounded attempts and backoff; do not retry quota/entitlement failures blindly.
- Redact API keys and sensitive query parameters from logs, errors, traces, and surfaced diagnostics.

Acceptance criteria:
- Each provider failure class maps to a stable structured error code and retryability decision.
- Malformed JSON and malformed success/error payloads fail safely.
- Timeouts are bounded and surfaced as structured failures.
- Automated checks prove credentials do not appear in returned errors or diagnostic logs.
- No automatic provider fallback or paid-plan upgrade is introduced.

### 6. Evidence provenance, versioning, corrections, and replay
- Preserve provider, endpoint/capability, requested instrument/timeframe, retrieval time, source timestamp, attribution, and licence/entitlement evidence where available.
- Define versioned snapshot and schema contracts.
- Record corrections as new evidence/version history rather than silently overwriting prior observations.
- Specify deterministic replay inputs and expected outputs before adding persistence.

Acceptance criteria:
- Every normalized observation can be traced to its source and retrieval context.
- Snapshot/schema versions are explicit and compatibility behavior is documented.
- Corrections preserve prior evidence and identify what changed, when, and why.
- Replay of the same versioned inputs under the same rules produces deterministic validation outputs.
- Licence/entitlement status is represented as verified, unverified, restricted, or unavailable; unknown is never treated as permission.

### 7. Independent provider comparison and conflicts
- Keep provider observations independent and attributable.
- Compare only compatible instrument, timeframe, timestamp basis, price basis, and candle semantics.
- Preserve disagreement and classify its likely causes; never average or silently overwrite provider prices.
- Keep market-data confidence separate from Scanner/Brain analytical confidence.

Acceptance criteria:
- Provider conflicts retain both original observations and their provenance.
- Incompatible observations are not compared as if equivalent.
- Conflict state and severity are explicit, explainable, and testable.
- No averaging/blending or silent source substitution occurs.
- A conflicted dataset cannot be marked READY unless an explicit policy permits a clearly bounded use.

### 8. Automated verification
- Add unit tests for timestamp parsing, candle lifecycle, OHLC and series validation, eligibility filtering, provider response parsing, error classification, secret redaction, provenance/versioning, and provider conflicts.
- Add integration-style tests using deterministic mocked provider responses; tests must not require live credentials or call paid/live provider endpoints.
- Include normal, stale, incomplete, invalid, future-dated, duplicate, missing-interval, malformed, rate-limited, timed-out, conflicting, and unavailable scenarios.

Acceptance criteria:
- Tests are deterministic and run without external provider credentials or network access.
- Regression tests reproduce every identified source-review defect.
- Lint, type-check, build, and the full relevant test suite pass.
- Existing Risk Calculator warnings or unrelated application files are not changed as part of this correction scope.

## Delivery gates

1. Review the branch diff and confirm only approved Market Data Engine files and this plan document are changed.
2. Implement corrections in small, reviewable commits.
3. Run targeted tests after each area, then the full lint/type-check/build/test suite.
4. Review API contracts for Scanner and Brain compatibility; do not wire new production consumers as part of this correction unless separately approved.
5. Produce a gap report listing passed, failed, deferred, and blocked acceptance criteria with evidence.
6. Request owner review before any PR merge, database work, provider activation, deployment, paid service, or production readiness decision.

## Explicit exclusions

- No Supabase schema, migration, RLS, storage, or database changes.
- No live provider connection, API-key configuration, or provider activation.
- No paid services, subscription upgrades, background polling, queues, or production caching.
- No deployment, merge, production activation, or automatic trade execution.
- No changes to unrelated application features or files.
