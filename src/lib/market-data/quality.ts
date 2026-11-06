import type {
  CandleValidation,
  DataReadiness,
  NormalizedCandle,
} from "./types";

/**
 * Validates source observations without inventing or repairing price values.
 * A READY result is impossible until the caller supplies a calibrated freshness
 * threshold. Numerical thresholds must be tested and approved per instrument.
 */
export function validateCandles(
  candles: NormalizedCandle[],
  options: { maxAgeSeconds?: number; now?: Date } = {},
): CandleValidation {
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];
  const duplicateTimestamps: string[] = [];
  const seen = new Set<string>();
  let invalidCandles = 0;

  if (candles.length === 0) errors.push("Provider returned no candle observations.");

  for (const candle of candles) {
    const timestampMs = Date.parse(candle.timestamp);
    const numbers = [candle.open, candle.high, candle.low, candle.close];
    const validNumbers = numbers.every(Number.isFinite);
    const validOhlc =
      validNumbers &&
      candle.high >= candle.low &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close);

    if (!Number.isFinite(timestampMs) || !validOhlc) {
      invalidCandles += 1;
      errors.push(`Invalid timestamp or OHLC relationship at ${candle.timestamp}.`);
    }

    if (seen.has(candle.timestamp)) duplicateTimestamps.push(candle.timestamp);
    seen.add(candle.timestamp);
  }

  if (duplicateTimestamps.length) {
    errors.push(`${duplicateTimestamps.length} duplicate candle timestamp(s) detected.`);
  }

  const newest = candles.reduce<number | null>((latest, candle) => {
    const value = Date.parse(candle.timestamp);
    if (!Number.isFinite(value)) return latest;
    return latest === null ? value : Math.max(latest, value);
  }, null);

  const freshnessSeconds =
    newest === null ? null : Math.max(0, Math.floor((now.getTime() - newest) / 1000));
  const freshnessThresholdSeconds = options.maxAgeSeconds ?? null;

  if (freshnessSeconds !== null && freshnessSeconds < 0) {
    warnings.push("Provider timestamp is ahead of the service clock.");
  }

  if (freshnessThresholdSeconds === null) {
    warnings.push("Freshness threshold has not yet been calibrated and approved.");
  } else if (freshnessSeconds !== null && freshnessSeconds > freshnessThresholdSeconds) {
    warnings.push("Latest observation exceeds the configured freshness threshold.");
  }

  let status: DataReadiness = "READY";
  if (errors.length || candles.length === 0) status = "INCOMPLETE";
  else if (freshnessThresholdSeconds === null) status = "DEGRADED";
  else if (freshnessSeconds !== null && freshnessSeconds > freshnessThresholdSeconds) status = "STALE";

  return {
    status,
    checkedAt,
    candleCount: candles.length,
    invalidCandles,
    duplicateTimestamps,
    warnings,
    errors,
    freshnessSeconds,
    freshnessThresholdSeconds,
    confidenceScore: null,
    confidenceNote:
      "Composite data-confidence scoring remains disabled until instrument-specific calibration and owner approval.",
  };
}
