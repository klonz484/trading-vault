/**
 * Resolves a freshness limit only when an explicit instrument + timeframe
 * policy entry exists. A global threshold is deliberately not supported.
 */
export function resolveFreshnessThresholdSeconds(
  rawPolicy: string | undefined,
  instrument: string,
  timeframe: string,
): number | undefined {
  if (!rawPolicy?.trim()) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPolicy);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const instrumentPolicy = (parsed as Record<string, unknown>)[instrument];
  if (!instrumentPolicy || typeof instrumentPolicy !== "object" || Array.isArray(instrumentPolicy)) {
    return undefined;
  }

  const candidate = (instrumentPolicy as Record<string, unknown>)[timeframe];
  return typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate > 0
    ? candidate
    : undefined;
}
