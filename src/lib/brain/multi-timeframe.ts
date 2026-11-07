/**
 * Multi-timeframe evidence alignment.
 * Higher-timeframe context and lower-timeframe evidence remain distinct;
 * this module never averages conflicts or creates trade signals.
 */
export const MULTI_TIMEFRAME_VERSION = "0.1.0" as const;
export type Direction = "BULLISH" | "BEARISH" | "RANGE" | "UNDETERMINED";
export type TimeframeEvidence = {
  instrument: string;
  timeframe: string;
  durationMs: number;
  sourceId: string;
  status: "READY" | "INSUFFICIENT_DATA" | "INVALID_DATA";
  trend: Direction;
  latestClosedCandleCloseTimeUtc: string;
  maxAgeMs: number;
};
export type MultiTimeframeInput = {
  instrument: string;
  asOfUtc: string;
  timeframes: TimeframeEvidence[];
};
export type MultiTimeframeResult = {
  engineVersion: typeof MULTI_TIMEFRAME_VERSION;
  status: "ALIGNED" | "CONFLICTING" | "INCOMPLETE" | "STALE" | "INVALID";
  instrument: string;
  asOfUtc: string;
  higherTimeframe: { timeframe: string; trend: Direction } | null;
  lowerTimeframe: { timeframe: string; trend: Direction } | null;
  evidence: Array<{
    timeframe: string;
    durationMs: number;
    sourceId: string;
    trend: Direction;
    ageMs: number | null;
    role: "HIGHER_CONTEXT" | "LOWER_CONTEXT" | "INTERMEDIATE_CONTEXT";
  }>;
  conflicts: Array<{ timeframeA: string; directionA: "BULLISH" | "BEARISH"; timeframeB: string; directionB: "BULLISH" | "BEARISH" }>;
  warnings: string[];
  tradeSignalGenerated: false;
};
const finite = (n: number) => Number.isFinite(n);
const directional = (d: Direction): d is "BULLISH" | "BEARISH" => d === "BULLISH" || d === "BEARISH";

export function alignMultiTimeframeEvidence(input: MultiTimeframeInput): MultiTimeframeResult {
  const warnings: string[] = [];
  const asOf = Date.parse(input.asOfUtc);
  if (!input.instrument?.trim()) warnings.push("A target instrument is required.");
  if (!Number.isFinite(asOf)) warnings.push("asOfUtc must be a valid UTC timestamp.");
  if (!Array.isArray(input.timeframes) || input.timeframes.length < 2) warnings.push("At least two timeframe observations are required.");
  const items = Array.isArray(input.timeframes) ? input.timeframes : [];
  let previousDuration = Infinity;
  const parsed = items.map((item, index) => {
    if (item.instrument !== input.instrument) warnings.push(`Timeframe ${index} instrument does not match the target instrument.`);
    if (!item.timeframe?.trim() || !item.sourceId?.trim()) warnings.push(`Timeframe ${index} requires a timeframe label and sourceId.`);
    if (!finite(item.durationMs) || item.durationMs <= 0) warnings.push(`Timeframe ${index} has an invalid durationMs.`);
    if (item.durationMs >= previousDuration) warnings.push("Timeframes must be ordered from highest duration to lowest duration, without duplicates.");
    previousDuration = item.durationMs;
    if (!finite(item.maxAgeMs) || item.maxAgeMs < 0) warnings.push(`Timeframe ${index} has an invalid maxAgeMs.`);
    if (!["READY", "INSUFFICIENT_DATA", "INVALID_DATA"].includes(item.status)) warnings.push(`Timeframe ${index} has an unsupported analysis status.`);
    if (!["BULLISH", "BEARISH", "RANGE", "UNDETERMINED"].includes(item.trend)) warnings.push(`Timeframe ${index} has an unsupported trend value.`);
    const closeTime = Date.parse(item.latestClosedCandleCloseTimeUtc);
    if (!Number.isFinite(closeTime)) warnings.push(`Timeframe ${index} has an invalid latest closed-candle close time.`);
    const ageMs = Number.isFinite(asOf) && Number.isFinite(closeTime) ? asOf - closeTime : null;
    if (ageMs !== null && ageMs < 0) warnings.push(`Timeframe ${index} reports a candle close later than asOfUtc.`);
    return { item, ageMs, closeTime, index };
  });
  const base = {
    engineVersion: MULTI_TIMEFRAME_VERSION,
    instrument: input.instrument,
    asOfUtc: input.asOfUtc,
    higherTimeframe: items[0] ? { timeframe: items[0].timeframe, trend: items[0].trend } : null,
    lowerTimeframe: items.length ? { timeframe: items[items.length - 1].timeframe, trend: items[items.length - 1].trend } : null,
    evidence: parsed.map(({ item, ageMs, index }) => ({
      timeframe: item.timeframe,
      durationMs: item.durationMs,
      sourceId: item.sourceId,
      trend: item.trend,
      ageMs,
      role: index === 0 ? "HIGHER_CONTEXT" as const : index === items.length - 1 ? "LOWER_CONTEXT" as const : "INTERMEDIATE_CONTEXT" as const
    })),
    conflicts: [] as MultiTimeframeResult["conflicts"],
    tradeSignalGenerated: false as const
  };
  if (warnings.length) return { ...base, status: "INVALID", warnings };
  if (parsed.some(({ item }) => item.status === "INVALID_DATA")) {
    return { ...base, status: "INVALID", warnings: ["At least one timeframe analysis is invalid; alignment is blocked."] };
  }
  if (parsed.some(({ item }) => item.status !== "READY" || item.trend === "UNDETERMINED")) {
    return { ...base, status: "INCOMPLETE", warnings: ["At least one timeframe lacks ready, directional-or-range evidence; no alignment conclusion is made."] };
  }
  const stale = parsed.filter(({ item, ageMs }) => ageMs === null || ageMs > item.maxAgeMs);
  if (stale.length) {
    return { ...base, status: "STALE", warnings: stale.map(({ item }) => `${item.timeframe} evidence exceeds its configured freshness limit.`) };
  }
  const conflicts: MultiTimeframeResult["conflicts"] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (directional(a.trend) && directional(b.trend) && a.trend !== b.trend) {
        conflicts.push({ timeframeA: a.timeframe, directionA: a.trend, timeframeB: b.timeframe, directionB: b.trend });
      }
    }
  }
  const sources = new Set(items.map(x => x.sourceId));
  const sourceWarning = sources.size > 1 ? ["Timeframes use different source identifiers; verify provider and timestamp comparability before operational use."] : [];
  if (conflicts.length) {
    return { ...base, status: "CONFLICTING", conflicts, warnings: [...sourceWarning, "Opposing timeframe directions are preserved as a conflict; no blended bias is calculated."] };
  }
  return { ...base, status: "ALIGNED", conflicts, warnings: sourceWarning };
}
