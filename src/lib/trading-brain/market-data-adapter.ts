import type { MarketDataSnapshot } from "../market-data/types";
import type { ReplayCandle } from "./replay";

export type BrainMarketDataGate =
  | "LIVE_ELIGIBLE"
  | "REPLAY_ONLY"
  | "BLOCKED";

export interface BrainMarketDataInput {
  contractVersion: "1.0.0";
  snapshotVersion: string;
  instrument: MarketDataSnapshot["instrument"];
  timeframe: MarketDataSnapshot["timeframe"];
  provider: MarketDataSnapshot["provider"];
  retrievedAt: string;
  sourceSymbol: string;
  sourceTimezone: string;
  entitlementStatus: MarketDataSnapshot["source"]["entitlementStatus"];
  licenceStatus: MarketDataSnapshot["source"]["licenceStatus"];
  readiness: MarketDataSnapshot["validation"]["status"];
  gate: BrainMarketDataGate;
  candles: ReplayCandle[];
  sourceReferences: string[];
  limitations: string[];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validCandleForSnapshot(
  candle: MarketDataSnapshot["candles"][number],
  snapshot: MarketDataSnapshot,
  retrievedAtMs: number,
): boolean {
  const timestampMs = Date.parse(candle.timestamp);
  const candleRetrievedAtMs = Date.parse(candle.retrievedAt);
  const prices = [candle.open, candle.high, candle.low, candle.close];
  const validPrices =
    prices.every((value) => Number.isFinite(value) && value > 0) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close) &&
    candle.high >= candle.low;
  const validVolume =
    candle.volume === null ||
    (Number.isFinite(candle.volume) && candle.volume >= 0);

  return (
    Number.isFinite(timestampMs) &&
    new Date(timestampMs).toISOString() === candle.timestamp &&
    Number.isFinite(candleRetrievedAtMs) &&
    timestampMs <= candleRetrievedAtMs &&
    candleRetrievedAtMs <= retrievedAtMs &&
    validPrices &&
    validVolume &&
    typeof candle.provisional === "boolean" &&
    nonEmptyString(candle.sourceTimestamp) &&
    nonEmptyString(candle.sourceTimezone) &&
    candle.sourceTimezone === snapshot.source.sourceTimezone &&
    candle.instrument === snapshot.instrument &&
    candle.timeframe === snapshot.timeframe &&
    candle.provider === snapshot.provider
  );
}

function hasValidValidationShape(
  validation: MarketDataSnapshot["validation"] | null | undefined,
): validation is MarketDataSnapshot["validation"] {
  return (
    !!validation &&
    Array.isArray(validation.errors) &&
    Array.isArray(validation.duplicateTimestamps) &&
    Array.isArray(validation.outOfOrderTimestamps) &&
    Array.isArray(validation.futureTimestamps) &&
    Number.isInteger(validation.candleCount) &&
    Number.isInteger(validation.eligibleCandleCount) &&
    Number.isInteger(validation.invalidCandles)
  );
}

/**
 * Converts a Market Data Engine snapshot into the Brain replay shape while
 * preserving provenance. Runtime checks are repeated here because TypeScript
 * types do not validate data at service or persistence boundaries.
 *
 * Non-READY or unverified provider data may be replayed for controlled
 * development/testing, but is never marked eligible for live Brain analysis.
 * Invalid snapshots are blocked entirely.
 */
export function adaptMarketDataSnapshotForBrain(
  snapshot: MarketDataSnapshot,
): BrainMarketDataInput {
  const limitations = Array.isArray(snapshot.limitations)
    ? [...snapshot.limitations]
    : [];
  const retrievedAtMs = Date.parse(snapshot.retrievedAt);
  const validRetrievedAt =
    Number.isFinite(retrievedAtMs) &&
    new Date(retrievedAtMs).toISOString() === snapshot.retrievedAt;
  const validSnapshotVersion = nonEmptyString(snapshot.snapshotVersion);
  const validSchema =
    snapshot.schemaVersion === "1.0.0" &&
    snapshot.validatorVersion === "1.0.0";
  const source = snapshot.source;
  const validation = snapshot.validation;
  const validSource =
    !!source &&
    nonEmptyString(source.symbol) &&
    nonEmptyString(source.endpoint) &&
    nonEmptyString(source.attribution) &&
    nonEmptyString(source.sourceTimezone);
  const validValidation = hasValidValidationShape(validation);
  const sourceTimezone = validSource ? source.sourceTimezone : "";
  const sourceSymbol = validSource ? source.symbol : "";
  const candlesInput = Array.isArray(snapshot.candles) ? snapshot.candles : [];
  const validCandles =
    validRetrievedAt &&
    validSchema &&
    validSource &&
    candlesInput.length > 0 &&
    candlesInput.every((candle) =>
      validCandleForSnapshot(candle, snapshot, retrievedAtMs),
    );
  const candles: ReplayCandle[] = validCandles
    ? candlesInput.map((candle) => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        provisional: candle.provisional,
      }))
    : [];

  const base = {
    contractVersion: "1.0.0" as const,
    snapshotVersion: nonEmptyString(snapshot.snapshotVersion)
      ? snapshot.snapshotVersion
      : "",
    instrument: snapshot.instrument,
    timeframe: snapshot.timeframe,
    provider: snapshot.provider,
    retrievedAt: snapshot.retrievedAt,
    sourceSymbol,
    sourceTimezone,
    entitlementStatus: source?.entitlementStatus ?? "UNAVAILABLE",
    licenceStatus: source?.licenceStatus ?? "UNAVAILABLE",
    readiness: validation?.status ?? "UNAVAILABLE",
  };

  if (
    !validRetrievedAt ||
    !validSnapshotVersion ||
    !validSchema ||
    !validSource ||
    !validValidation ||
    !validCandles
  ) {
    return {
      ...base,
      gate: "BLOCKED",
      candles: [],
      sourceReferences: [],
      limitations: [
        ...limitations,
        "Snapshot failed runtime schema, provenance, validation-shape, timestamp, candle-integrity, or identity checks.",
      ],
    };
  }

  const freshnessIsVerified =
    validation.freshnessSeconds !== null &&
    Number.isFinite(validation.freshnessSeconds) &&
    validation.freshnessSeconds >= 0 &&
    validation.freshnessThresholdSeconds !== null &&
    Number.isFinite(validation.freshnessThresholdSeconds) &&
    validation.freshnessThresholdSeconds > 0 &&
    validation.freshnessSeconds <= validation.freshnessThresholdSeconds;
  const chronologicalAndUnique = candles.every(
    (candle, index) =>
      index === 0 ||
      Date.parse(candle.timestamp) > Date.parse(candles[index - 1].timestamp),
  );
  const validationClean =
    validation.status === "READY" &&
    validation.errors.length === 0 &&
    validation.invalidCandles === 0 &&
    validation.eligibleCandleCount === candles.length &&
    validation.candleCount === candles.length &&
    validation.duplicateTimestamps.length === 0 &&
    validation.outOfOrderTimestamps.length === 0 &&
    validation.futureTimestamps.length === 0 &&
    freshnessIsVerified &&
    chronologicalAndUnique;
  const liveEligible =
    validationClean &&
    source.entitlementStatus === "VERIFIED" &&
    source.licenceStatus === "VERIFIED";

  if (!liveEligible) {
    limitations.push(
      "Snapshot is available for controlled replay only; live Brain assessment is blocked until data readiness, freshness, entitlement, licence, and chronological-integrity checks pass.",
    );
  }

  return {
    ...base,
    gate: liveEligible ? "LIVE_ELIGIBLE" : "REPLAY_ONLY",
    candles,
    sourceReferences: ["market-data:" + snapshot.snapshotVersion],
    limitations,
  };
}
