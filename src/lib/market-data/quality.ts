import type {
  CandleValidation,
  DataReadiness,
  MarketDataTimeframe,
  NormalizedCandle,
} from "./types";

const TIMEFRAME_SECONDS: Record<MarketDataTimeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14_400,
  D1: 86_400,
  W1: 604_800,
};

/** True only when the observation is structurally safe for analytical consumption. */
export function isCandleStructurallyValid(candle: NormalizedCandle): boolean {
  const timestampMs = Date.parse(candle.timestamp);
  const canonicalUtc =
    Number.isFinite(timestampMs) &&
    new Date(timestampMs).toISOString() === candle.timestamp;
  const prices = [candle.open, candle.high, candle.low, candle.close];
  const validPrices =
    prices.every((value) => Number.isFinite(value) && value > 0) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close) &&
    candle.high >= candle.low;
  const validVolume =
    candle.volume === null ||
    (Number.isFinite(candle.volume) && candle.volume >= 0);

  const retrievedAtMs = Date.parse(candle.retrievedAt);
  const validRetrievalTime = Number.isFinite(retrievedAtMs);
  const validSourceTimestamp = typeof candle.sourceTimestamp === "string" && candle.sourceTimestamp.trim().length > 0;

  return canonicalUtc && validPrices && validVolume && Boolean(candle.sourceTimezone) && validRetrievalTime && validSourceTimestamp;
}

/**
 * Validates observations without repairing or silently discarding source evidence.
 * Gaps are warnings because market closures and provider-specific calendars must
 * be considered before a gap can safely be classified as missing market data.
 */
export function validateCandles(
  candles: NormalizedCandle[],
  options: { maxAgeSeconds?: number; now?: Date } = {},
): CandleValidation {
  const now = options.now ?? new Date();
  const checkedAt = Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateTimestamps: string[] = [];
  const outOfOrderTimestamps: string[] = [];
  const missingIntervals: string[] = [];
  const futureTimestamps: string[] = [];
  const seen = new Set<string>();
  let invalidCandles = 0;

  if (!Number.isFinite(now.getTime())) errors.push("Validation clock is invalid.");
  if (candles.length === 0) errors.push("Provider returned no candle observations.");

  const firstTimeframe = candles[0]?.timeframe;
  const firstInstrument = candles[0]?.instrument;
  const intervalSeconds = firstTimeframe ? TIMEFRAME_SECONDS[firstTimeframe] : null;
  let previousTimestamp: number | null = null;
  let sourceOrder: "ASC" | "DESC" | null = null;

  for (const candle of candles) {
    const timestampMs = Date.parse(candle.timestamp);
    if (!isCandleStructurallyValid(candle)) {
      invalidCandles += 1;
      errors.push(`Invalid timestamp, price, volume or timezone metadata at ${candle.timestamp}.`);
    }

    if (Number.isFinite(timestampMs)) {
      if (timestampMs > now.getTime()) {
        futureTimestamps.push(candle.timestamp);
        errors.push(`Future-dated provider observation at ${candle.timestamp}.`);
      }
      if (previousTimestamp !== null && timestampMs !== previousTimestamp) {
        const currentDirection = timestampMs > previousTimestamp ? "ASC" : "DESC";
        if (sourceOrder === null) sourceOrder = currentDirection;
        else if (sourceOrder !== currentDirection) {
          outOfOrderTimestamps.push(candle.timestamp);
        }
        if (
          intervalSeconds !== null &&
          Math.abs(timestampMs - previousTimestamp) > intervalSeconds * 1.5
        ) {
          missingIntervals.push(
            `${new Date(previousTimestamp).toISOString()} <-> ${candle.timestamp}`,
          );
        }
      }
      previousTimestamp = timestampMs;
    }

    if (seen.has(candle.timestamp)) duplicateTimestamps.push(candle.timestamp);
    seen.add(candle.timestamp);
    if (candle.timeframe !== firstTimeframe) {
      errors.push("Mixed timeframe observations were returned in one series.");
    }
    if (candle.instrument !== firstInstrument) {
      errors.push("Mixed instrument observations were returned in one series.");
    }
  }

  if (outOfOrderTimestamps.length) {
    errors.push(`${outOfOrderTimestamps.length} out-of-order candle timestamp(s) detected.`);
  }
  if (duplicateTimestamps.length) {
    errors.push(`${duplicateTimestamps.length} duplicate candle timestamp(s) detected.`);
  }
  if (missingIntervals.length) {
    warnings.push(
      `${missingIntervals.length} interval gap(s) detected; session-calendar validation is required before classifying them as missing market data.`,
    );
  }

  const newest = candles.reduce<number | null>((latest, candle) => {
    const value = Date.parse(candle.timestamp);
    if (!Number.isFinite(value)) return latest;
    return latest === null ? value : Math.max(latest, value);
  }, null);
  const freshnessSeconds =
    newest === null ? null : Math.floor((now.getTime() - newest) / 1000);
  const freshnessThresholdSeconds = options.maxAgeSeconds ?? null;

  if (
    freshnessThresholdSeconds !== null &&
    (!Number.isFinite(freshnessThresholdSeconds) || freshnessThresholdSeconds <= 0)
  ) {
    errors.push("Freshness threshold must be a finite positive number of seconds.");
  } else if (freshnessThresholdSeconds === null) {
    warnings.push("Freshness threshold has not yet been calibrated and approved.");
  }

  if (futureTimestamps.length) {
    warnings.push("Provider timestamps are ahead of the service clock.");
  }
  if (
    freshnessSeconds !== null &&
    freshnessSeconds >= 0 &&
    freshnessThresholdSeconds !== null &&
    Number.isFinite(freshnessThresholdSeconds) &&
    freshnessSeconds > freshnessThresholdSeconds
  ) {
    warnings.push("Latest observation exceeds the configured freshness threshold.");
  }

  const eligibleCandleCount = candles.filter(
    (candle) => isCandleStructurallyValid(candle) && !futureTimestamps.includes(candle.timestamp),
  ).length;

  let status: DataReadiness = "READY";
  if (errors.length || eligibleCandleCount === 0) status = "INCOMPLETE";
  else if (freshnessThresholdSeconds === null) status = "DEGRADED";
  else if (
    freshnessSeconds !== null &&
    freshnessSeconds >= 0 &&
    freshnessSeconds > freshnessThresholdSeconds
  ) status = "STALE";

  return {
    status,
    checkedAt,
    candleCount: candles.length,
    eligibleCandleCount,
    invalidCandles,
    duplicateTimestamps,
    outOfOrderTimestamps,
    missingIntervals,
    futureTimestamps,
    warnings,
    errors,
    freshnessSeconds,
    freshnessThresholdSeconds,
    confidenceScore: null,
    confidenceNote:
      "Composite data-confidence scoring remains disabled until instrument-specific calibration and owner approval.",
  };
}
