# Brain decision trace v0.1

## Purpose
Creates a stable, explainable projection of an existing Brain decision and the evidence module versions that contributed to it. It does not re-run analysis or change the decision.

## Captured fields
- Assessment ID, evaluation timestamp, decision state, direction and expiry.
- Exact Brain gate statuses and explanations.
- Version and status of structure, price action, multi-timeframe, zones, liquidity objectives, event context and prop-firm modules.
- Warnings from each module, including non-passing prop-firm checks.
- Deduplicated source identifiers from timeframe, session and relevant news evidence.
- Supporting evidence, opposing evidence and decision reasons.
- Explicit manual-only execution and no-order-submission flags.

## Limitations
The trace is an in-memory projection. It is not yet persisted as an immutable audit record in Supabase. Source IDs identify provenance references but do not independently verify or archive source payloads. Persistence, access controls, retention and tamper-evidence require a separately reviewed implementation.

## Safety boundary
The trace never upgrades a decision, changes direction, submits orders or authorizes production activation.

- Decision traces now retain instrument/timeframe identity, separate data and analytical confidence, and the exact market-data status/provider/symbol/timeframe/tick timestamp/agreement/history/timestamp-alignment fields supplied to the Brain.
- Scanner context is explicitly recorded as context-only; it is never represented as the market-data source.
