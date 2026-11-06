import type { MarketDataSnapshot, ProviderConflict } from "./types";

/**
 * Compares two independent, compatible provider snapshots.
 * A threshold must be supplied by the caller; no universal FX/metal tolerance
 * is invented here. Only confirmed candles with matching UTC timestamps compare.
 */
export function compareProviderSnapshots(
  first: MarketDataSnapshot,
  second: MarketDataSnapshot,
  options: { maxAbsoluteCloseDifference: number },
): ProviderConflict[] {
  const threshold = options.maxAbsoluteCloseDifference;
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("A finite positive, instrument-calibrated conflict threshold is required.");
  }
  if (
    first.instrument !== second.instrument ||
    first.timeframe !== second.timeframe ||
    first.provider === second.provider
  ) {
    throw new Error("Provider snapshots are not compatible independent observations.");
  }

  const secondByTimestamp = new Map(
    second.candles
      .filter((candle) => !candle.provisional && Boolean(candle.sourceTimezone))
      .map((candle) => [candle.timestamp, candle]),
  );

  const conflicts: ProviderConflict[] = [];
  for (const candleA of first.candles) {
    if (candleA.provisional || !candleA.sourceTimezone) continue;
    const candleB = secondByTimestamp.get(candleA.timestamp);
    if (!candleB || candleB.provisional) continue;

    const absoluteDifference = Math.abs(candleA.close - candleB.close);
    if (absoluteDifference > threshold) {
      conflicts.push({
        instrument: first.instrument,
        timeframe: first.timeframe,
        timestamp: candleA.timestamp,
        providerA: first.provider,
        providerB: second.provider,
        closeA: candleA.close,
        closeB: candleB.close,
        absoluteDifference,
        threshold,
        status: "CONFLICTED",
      });
    }
  }
  return conflicts;
}
