# MT5 timestamp contract v2 — design and acceptance specification

**Status:** Development proposal; not an activation or broker-timezone approval  
**Parent integration:** Market Data → Trading Brain v1  
**Applies to:** MT5 candles (MqlRates), ticks (MqlTick.time / time_msc), batch sent time and collector clock observations

## 1. Safety decision

MT5-native market timestamps are broker-clock observations until the exact connected trade-server clock semantics have been independently established. A numeric millisecond value, an ISO-looking string, `TimeTradeServer()`, or a current UTC offset does not by itself prove UTC.

The system MUST preserve the original value and MUST NOT silently relabel it as UTC. Any observation whose instant cannot be resolved from an approved server-specific historical clock schedule is quarantined from chronological analytics, replay, freshness calculations, future-time checks and Brain/Scanner evidence.

This contract does not enable ingestion, issue credentials, apply migrations, change collector queues, or approve live market-data use.

## 2. Required timestamp representation

Every source timestamp MUST be represented with these separate concepts:

| Field | Meaning | Rule |
| --- | --- | --- |
| `rawValue` | Exact native integer or source string received from MT5 | Immutable; never overwrite with a converted value |
| `rawUnit` | `epoch_seconds`, `epoch_milliseconds`, or `server_wall_time` | Explicitly declared by the collector adapter; never inferred from magnitude alone |
| `rawClockDomain` | `BROKER_SERVER`, `UTC`, or `UNKNOWN` | Default `UNKNOWN` until evidence supports a stronger classification |
| `rawWallTime` | Exact broker wall-clock representation, if available | Preserve the original calendar fields and precision |
| `resolvedUtc` | Canonical ISO-8601 UTC instant, or null | Set only after an approved conversion succeeds |
| `resolutionStatus` | `VERIFIED_UTC`, `AMBIGUOUS`, `UNRESOLVED`, `INVALID` | No implicit promotion |
| `timezoneId` | IANA timezone identifier, or null | Must be supported by authoritative broker evidence; do not guess from offset |
| `utcOffsetSeconds` | Offset used for this observation, or null | Per-observation historical offset, not the current offset |
| `conversionRuleVersion` | Immutable version/hash of the approved conversion schedule | Required whenever `resolvedUtc` is non-null |
| `evidenceRef` | Reference to broker confirmation and paired-clock evidence | Required for `VERIFIED_UTC` |
| `capturedAtUtc` | Collector capture instant from a separately synchronized UTC clock | Separate from source market timestamp; retain clock-quality metadata |

For compatibility, existing fields such as `sourceTime` and `sourceTimeMs` MUST NOT be treated as proof of UTC. During migration they may remain as raw transport fields, but consumers must use the v2 timestamp envelope.

## 3. Clock evidence and conversion rules

A server clock profile is scoped to the exact MT5 trade-server identity and account/server cluster. It must record:

- Exact server display name and stable server identifier, if exposed.
- Broker-confirmed semantics for MqlRates.time, MqlTick.time, MqlTick.time_msc and SymbolInfoTick.
- IANA timezone identifier if RCG confirms one; otherwise a fully enumerated, dated offset schedule.
- Effective-from / effective-to boundaries and UTC offsets for every historical interval in the requested backfill.
- DST transition instants, including how repeated or skipped wall-clock times are resolved.
- Whether demo/live, server clusters, account types or API paths have different clock rules.
- Evidence document/reference, confirmation date, reviewer and profile version.

Conversion MUST use the historical offset applicable at the observation instant. Applying the offset observed today to older candles is prohibited.

If the broker supplies only a wall-clock time during a repeated DST hour and no sequence or other evidence distinguishes the two possible instants, mark it `AMBIGUOUS`. If a wall-clock time falls in a skipped interval, mark it `INVALID` unless the broker documents a deterministic interpretation. Do not guess.

A profile update creates a new version. It MUST NOT rewrite raw values or silently alter prior resolved timestamps. Any corrected conversion is recorded as a new resolution event with before/after values and provenance.

## 4. Collector clock diagnostics

A supervised read-only evidence capture should record, as close together as practical:

- `TimeCurrent()`, `TimeTradeServer()`, `TimeGMT()`, `TimeLocal()`.
- `MqlTick.time` and `MqlTick.time_msc` for a named symbol.
- `MqlRates.time` for a named timeframe.
- Exact connected server name, terminal build and capture timestamp.
- An independent trusted UTC reference and the Linux host's NTP/clock-sync status.

The diagnostic sample helps validate a broker-confirmed profile; it does not replace written confirmation or establish the complete historical schedule by itself. Strategy Tester output is not sufficient evidence of the live trade-server clock.

## 5. Consumer eligibility

| Resolution state | Storage | Historical replay | Live analytical eligibility |
| --- | --- | --- | --- |
| `VERIFIED_UTC` with current approved profile and valid evidence | Preserve raw + resolved values | Permitted subject to all other replay gates | May be considered subject to independent freshness, entitlement, licence, quality and Brain gates |
| `AMBIGUOUS` | Quarantine with raw provenance | Prohibited for time-ordered replay | Prohibited |
| `UNRESOLVED` | Quarantine with raw provenance | Prohibited | Prohibited |
| `INVALID` | Retain rejection/audit metadata; do not persist as eligible observation | Prohibited | Prohibited |

A batch may be durably acknowledged as received only if the API clearly distinguishes receipt from analytical acceptance. Quarantined or unresolved observations must never be counted as accepted eligible candles/ticks.

## 6. Validation requirements

The v2 validator MUST fail closed and test at least:

1. UTC timestamps with explicit Z/offset and canonical normalization.
2. Raw broker timestamps with no timezone claim.
3. Historical standard-time and daylight-time offsets differing from the current offset.
4. Both DST transition directions, including repeated and skipped local times.
5. Missing, unknown, expired or wrong-server clock profiles.
6. Profile version changes without mutation of raw observations.
7. Duplicate batch replay and idempotent acknowledgement.
8. Out-of-order ticks sharing a millisecond timestamp without false deduplication.
9. Future-time validation applied only to resolved UTC instants.
10. Clock skew between collector capture time and trusted UTC reference.
11. Mixed timestamp states within one batch.
12. Serialization round-trips preserving raw integer precision and conversion provenance.

Property tests should prove that no `AMBIGUOUS`, `UNRESOLVED` or `INVALID` timestamp can enter a replay or live-eligible collection, regardless of a caller-supplied READY label.

## 7. Migration and rollout sequence

1. Obtain written RCG confirmation for the exact connected server and historical timezone/DST schedule.
2. Capture paired live-terminal clock evidence during an open market session.
3. Implement a versioned clock-profile registry and v2 timestamp envelope on a development branch.
4. Keep v1 observations quarantined unless their original raw value and source semantics can be proven.
5. Add deterministic tests for historical offsets and DST ambiguity before adapting the API or collector.
6. Validate storage, indexes, retention and service-role access in isolated non-production infrastructure.
7. Run synthetic-only Preview tests; do not use real broker data for the first transport test.
8. Review replay output and provenance end-to-end before considering any later real-data test.
9. Obtain separate explicit approval before any collector transmission or Production activation.

## 8. Explicit non-goals and safeguards

- No assumption that RCG uses GMT+2/GMT+3, Europe, New York or any other common broker schedule.
- No weakening of the API future-time guard to accommodate unknown timestamp domains.
- No automatic fallback from unresolved MT5 timestamps to Twelve Data or another provider.
- No inference of a timestamp from candle arrival time.
- No live order execution or broker account operation.
- No automatic data repair that changes source timestamps.
- No public registration, paid resource creation, secret exposure, production migration or deployment as part of this proposal.

## 9. Acceptance definition

Timestamp contract v2 is ready for a synthetic Preview integration test only when the profile model, conversion implementation, quarantine behavior, audit trail and all tests above are present and passing. It is not ready for real MT5 ingestion until the exact broker server's written clock semantics and historical schedule are verified. It is not a signal or trading approval.
