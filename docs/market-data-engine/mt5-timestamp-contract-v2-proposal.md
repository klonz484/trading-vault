# MT5 timestamp contract v2 — proposal

**Status:** Design proposal only. Not implemented, migrated, deployed or enabled.  
**Applies to:** RCG MT5 candles and ticks collected by the local read-only EA.  
**Purpose:** Preserve exactly what MT5 supplied while preventing unverified broker wall time from being mistaken for UTC.

## Why v1 is not sufficient

The current v1 contract uses:
- an ISO candle timestamp with an offset generated from the collector's current estimated server offset; and
- a numeric tick sourceTimeMs that the API interprets as UTC epoch milliseconds.

Neither representation records enough evidence to prove the timestamp's actual time basis. Applying today's offset to historical candles can mislabel observations across broker DST changes. Treating native MqlTick.time_msc as UTC without RCG-specific verification can cause false future-time rejection or incorrect historical placement.

The existing API future-time check must remain fail-closed. Do not weaken it to accept ambiguous timestamps.

## Contract principles

1. **Raw source value is immutable.** Preserve the exact native MT5 timestamp value and its encoding.
2. **Time basis is explicit.** Use UTC, broker-server wall time, or unknown; never infer UTC from a field name or ISO suffix.
3. **UTC is a separate derived value.** Normalized UTC is populated only when a verified conversion rule applies to that exact observation.
4. **Conversion is auditable.** Record the broker server identity, applicable offset/rule, method, and evidence reference.
5. **Historical conversion is date-specific.** Never apply the current offset to an entire historical backfill.
6. **Ambiguity fails closed.** Repeated or nonexistent local wall times, missing offset history, stale clocks, and conflicting evidence are quarantined.
7. **No silent correction.** If a broker later corrects historical timestamps or its timezone schedule, preserve the original observation and append a correction/version record.

## Proposed observation envelope

Schema v2 should replace the overloaded v1 timestamp fields with a nested timestamp envelope. The following is illustrative, not a final implementation contract:

```json
{
  "timestamp": {
    "rawValue": 1794564000123,
    "rawUnit": "milliseconds",
    "rawEncoding": "MQL5_MqlTick.time_msc",
    "rawWallTime": "2026-11-13T12:00:00.123",
    "basis": "UNKNOWN",
    "utcEpochMs": null,
    "conversion": {
      "status": "UNVERIFIED",
      "method": null,
      "offsetMinutes": null,
      "brokerTimezoneLabel": null,
      "scheduleVersion": null,
      "evidenceId": null
    }
  }
}
```

Allowed basis values:
- `UTC`: source is explicitly documented and independently verified as UTC.
- `BROKER_SERVER_WALL_TIME`: source represents the broker server's local wall clock.
- `UNKNOWN`: evidence is insufficient to classify the source.

Allowed conversion statuses:
- `NOT_REQUIRED`: verified UTC source.
- `VERIFIED`: deterministic conversion using an approved broker schedule for the observation's date.
- `UNVERIFIED`: raw source retained, no UTC normalization allowed.
- `AMBIGUOUS`: multiple or no valid UTC mappings; quarantine.
- `CONFLICT`: independent clock evidence disagrees beyond the approved tolerance; quarantine pending investigation.

The final schema must also bind the observation to the exact broker/server identity, terminal instance, instrument, and collection session. A free-text timezone label alone is not sufficient evidence.

## Native field preservation

For candles, preserve:
- the original MqlRates.time integer in seconds;
- the corresponding server-wall-clock rendering captured by the EA without appending an assumed UTC offset;
- the source encoding identifier.

For ticks, preserve:
- MqlTick.time and MqlTick.time_msc exactly as returned;
- the source encoding identifier;
- a wall-clock rendering only when it can be derived without guessing the source timezone.

Do not rewrite the raw fields after normalization. Store normalized UTC separately as an integer epoch-millisecond value (and optionally a canonical ISO UTC rendering).

## Conversion evidence required

A conversion may be marked VERIFIED only when all relevant evidence is available:

1. Written confirmation from RCG for the exact MT5 trade-server/account cluster, including whether candle and tick fields represent UTC or broker-server wall time.
2. The broker's historical UTC-offset/DST schedule, with effective transition dates covering the complete backfill range.
3. A supervised paired-clock capture of TimeCurrent, TimeTradeServer, TimeGMT, MqlTick.time, MqlTick.time_msc, and an independent UTC reference.
4. Verified local OS clock synchronization and timezone configuration for the MT5 host and uploader host.
5. Reconciliation of paired samples with the written broker schedule. A current-time sample alone does not prove historical offset rules.

If RCG supplies a server timezone label, record it as broker-provided metadata. Do not assume it maps to an IANA timezone name or that its DST rules match South African, European, or US rules.

## Validation and ingestion rules

- Schema validation checks raw value type, unit, encoding, basis and conversion status independently.
- The future-time guard evaluates only normalized UTC values whose conversion status is VERIFIED or NOT_REQUIRED.
- Raw broker wall-time values must never be compared directly with Date.now() as though they were UTC.
- If normalized UTC is absent, the observation may be retained in a restricted quarantine record only after the storage design explicitly supports that state; it must not be eligible for Market Data snapshots, replay, Scanner output, or Brain evidence.
- Reject malformed envelopes and unknown schema versions.
- Preserve distinct same-millisecond ticks. Do not deduplicate by timestamp, price or flags alone.
- Corrections create a new observation version with provenance; do not silently overwrite the original raw value.

## Required test matrix

Before schema v2 is accepted, add deterministic tests for:

- verified UTC source values;
- verified standard-time and daylight-time broker offsets;
- historical backfill spanning both DST transitions;
- broker schedule changes and historical corrections;
- repeated local wall-clock times during a backward transition;
- nonexistent local wall-clock times during a forward transition;
- stale or misconfigured local system clock;
- disagreement between broker clock, TimeGMT and independent UTC;
- raw tick millisecond values that are not UTC;
- future-time rejection operating only on normalized UTC;
- idempotent replay preserving raw payload and conversion provenance;
- quarantine records remaining ineligible for all analytical consumers.

## Rollout sequence

1. Obtain RCG's written server-time and historical DST evidence.
2. Capture supervised paired-clock samples from the exact RCG MT5 terminal.
3. Finalize the v2 schema and compatibility policy; do not reinterpret existing v1 rows in place.
4. Implement parser, validator, storage and migration only against a verified isolated non-production database.
5. Test synthetic standard-time, daylight-time, ambiguous-time and stale-clock cases.
6. Keep the collector uploader in dry-run until all gates pass.
7. Conduct a separately supervised synthetic Preview ingestion test before any broker data is transmitted.

## Current decision

**No real MT5 batch is eligible for ingestion under the present evidence.** Keep v1 endpoint and future-time protections unchanged, keep the uploader dry-run, and keep the Trading Brain in replay-only / insufficient-evidence state until the above requirements are met.
