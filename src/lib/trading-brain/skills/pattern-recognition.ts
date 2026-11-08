import type { BrainSkillResult, SkillSourceReference } from "./types";

export interface PatternCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed: boolean;
}

export interface PatternRecognitionPolicy {
  minimumClosedCandles: number;
  maximumClosedCandleAgeSeconds: number;
  lookbackCandles: number;
  dojiMaximumBodyToRangeRatio: number;
  pinBarMinimumWickToBodyRatio: number;
  pinBarMaximumOppositeWickToRangeRatio: number;
}

export interface PatternRecognitionInput {
  instrument: string;
  timeframe: string;
  asOf: string;
  candles: PatternCandle[];
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
  policy: PatternRecognitionPolicy;
}

export type ChartPatternType =
  | "BULLISH_ENGULFING"
  | "BEARISH_ENGULFING"
  | "INSIDE_BAR"
  | "OUTSIDE_BAR"
  | "DOJI"
  | "BULLISH_PIN_BAR"
  | "BEARISH_PIN_BAR";

export interface ChartPatternFinding {
  type: ChartPatternType;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  startCandleIndex: number;
  endCandleIndex: number;
  startAt: string;
  endAt: string;
  high: number;
  low: number;
  invalidationCandidate: number;
  bodyToRangeRatio?: number;
  dominantWickToBodyRatio?: number;
  oppositeWickToRangeRatio?: number;
}

export interface PatternRecognitionAssessment {
  instrument: string;
  timeframe: string;
  latestClosedCandleAt: string | null;
  closedCandleCount: number;
  formingCandlesExcluded: number;
  patterns: ChartPatternFinding[];
}

export interface PatternRecognitionFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "EVIDENCE_NOT_READY"
    | "SOURCE_PROVENANCE_MISSING"
    | "SOURCE_IDENTITY_MISMATCH"
    | "INVALID_TIMESTAMP"
    | "CANDLE_ORDER_INVALID"
    | "INVALID_OHLC"
    | "NO_CLOSED_CANDLES"
    | "INSUFFICIENT_CANDLES"
    | "CLOSED_CANDLE_STALE";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "candle-patterns/0.1.0";

function parseAbsoluteTimestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function emptyAssessment(instrument: string, timeframe: string): PatternRecognitionAssessment {
  return { instrument, timeframe, latestClosedCandleAt: null, closedCandleCount: 0, formingCandlesExcluded: 0, patterns: [] };
}

function buildResult(
  input: PatternRecognitionInput,
  findings: PatternRecognitionFinding[],
  assessment: PatternRecognitionAssessment,
  status: "COMPLETE" | "INCOMPLETE" | "REJECTED",
  evidenceReadiness: "READY" | "INCOMPLETE" | "STALE" | "DEGRADED",
): BrainSkillResult<PatternRecognitionFinding | ChartPatternFinding> & { assessment: PatternRecognitionAssessment } {
  return {
    skillId: "pattern-recognition",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness,
    findings,
    observations: assessment.patterns.map((pattern) => `${pattern.type} at ${pattern.endAt}`),
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: ["Patterns are descriptive candidates, not directional trade signals or proof of future outcomes."],
    sourceReferences: input.sourceReferences ?? [],
    limitations: ["Only the explicitly defined candle patterns are evaluated.", "No entry, stop-loss, target, confidence score, or trade recommendation is produced."],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

function isBullish(candle: PatternCandle): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: PatternCandle): boolean {
  return candle.close < candle.open;
}

function addPattern(
  patterns: ChartPatternFinding[],
  type: ChartPatternType,
  direction: ChartPatternFinding["direction"],
  startIndex: number,
  endIndex: number,
  candles: PatternCandle[],
  metrics: Pick<ChartPatternFinding, "bodyToRangeRatio" | "dominantWickToBodyRatio" | "oppositeWickToRangeRatio"> = {},
): void {
  const start = candles[startIndex];
  const end = candles[endIndex];
  patterns.push({
    type,
    direction,
    startCandleIndex: startIndex,
    endCandleIndex: endIndex,
    startAt: start.timestamp,
    endAt: end.timestamp,
    high: Math.max(...candles.slice(startIndex, endIndex + 1).map((candle) => candle.high)),
    low: Math.min(...candles.slice(startIndex, endIndex + 1).map((candle) => candle.low)),
    invalidationCandidate: direction === "BULLISH"
      ? Math.min(...candles.slice(startIndex, endIndex + 1).map((candle) => candle.low))
      : direction === "BEARISH"
        ? Math.max(...candles.slice(startIndex, endIndex + 1).map((candle) => candle.high))
        : end.low,
    ...metrics,
  });
}

export function recognizeCandlePatterns(
  input: PatternRecognitionInput,
): ReturnType<typeof buildResult> {
  const policy = input.policy;
  if (!policy) {
    return buildResult(input, [{ code: "POLICY_MISSING", message: "An explicit pattern-recognition policy is required." }], emptyAssessment(input.instrument, input.timeframe), "INCOMPLETE", "INCOMPLETE");
  }
  const validPolicy =
    Number.isInteger(policy.minimumClosedCandles) && policy.minimumClosedCandles >= 2 &&
    Number.isInteger(policy.maximumClosedCandleAgeSeconds) && policy.maximumClosedCandleAgeSeconds >= 0 &&
    Number.isInteger(policy.lookbackCandles) && policy.lookbackCandles >= 2 &&
    Number.isFinite(policy.dojiMaximumBodyToRangeRatio) && policy.dojiMaximumBodyToRangeRatio >= 0 && policy.dojiMaximumBodyToRangeRatio <= 1 &&
    Number.isFinite(policy.pinBarMinimumWickToBodyRatio) && policy.pinBarMinimumWickToBodyRatio > 0 &&
    Number.isFinite(policy.pinBarMaximumOppositeWickToRangeRatio) && policy.pinBarMaximumOppositeWickToRangeRatio >= 0 && policy.pinBarMaximumOppositeWickToRangeRatio <= 1;
  if (!validPolicy) {
    return buildResult(input, [{ code: "INVALID_POLICY", message: "Pattern thresholds and lookback values must be explicit and within valid ranges." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
  }
  if (input.evidenceGate.status !== "COMPLETE" || input.evidenceGate.evidenceReadiness !== "READY") {
    return buildResult(input, [{ code: "EVIDENCE_NOT_READY", message: "Pattern recognition requires a COMPLETE and READY upstream evidence assessment." }], emptyAssessment(input.instrument, input.timeframe), "INCOMPLETE", "INCOMPLETE");
  }
  if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length === 0) {
    return buildResult(input, [{ code: "SOURCE_PROVENANCE_MISSING", message: "At least one candle source reference is required." }], emptyAssessment(input.instrument, input.timeframe), "INCOMPLETE", "INCOMPLETE");
  }
  if (input.sourceReferences.some((reference) =>
    reference.instrument !== input.instrument || reference.timeframe !== input.timeframe ||
    !reference.sourceId || !reference.providerId ||
    !Number.isFinite(parseAbsoluteTimestamp(reference.observedAt)) ||
    !Number.isFinite(parseAbsoluteTimestamp(reference.receivedAt))
  )) {
    return buildResult(input, [{ code: "SOURCE_IDENTITY_MISMATCH", message: "Source references must identify this instrument, timeframe, source, provider and absolute timestamps." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
  }

  const asOf = parseAbsoluteTimestamp(input.asOf);
  if (!Number.isFinite(asOf)) {
    return buildResult(input, [{ code: "INVALID_TIMESTAMP", message: "Evaluation time must be an absolute timestamp with a timezone." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
  }
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const candle of input.candles) {
    const timestamp = parseAbsoluteTimestamp(candle.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > asOf) {
      return buildResult(input, [{ code: "INVALID_TIMESTAMP", message: "Every candle timestamp must be absolute, valid, and not later than evaluation time." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
    }
    if (timestamp <= previousTimestamp) {
      return buildResult(input, [{ code: "CANDLE_ORDER_INVALID", message: "Candles must be strictly ordered by timestamp with no duplicates." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
    }
    previousTimestamp = timestamp;
    if (
      ![candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value) && value > 0) ||
      candle.high < Math.max(candle.open, candle.close, candle.low) ||
      candle.low > Math.min(candle.open, candle.close, candle.high)
    ) {
      return buildResult(input, [{ code: "INVALID_OHLC", message: "Candle OHLC values must be positive and internally consistent." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
    }
  }

  const closedCandles = input.candles.filter((candle) => candle.isClosed);
  const formingCandlesExcluded = input.candles.length - closedCandles.length;
  const empty = emptyAssessment(input.instrument, input.timeframe);
  empty.closedCandleCount = closedCandles.length;
  empty.formingCandlesExcluded = formingCandlesExcluded;
  if (closedCandles.length === 0) {
    return buildResult(input, [{ code: "NO_CLOSED_CANDLES", message: "No closed candles are available; forming candles cannot be used for confirmed patterns." }], empty, "INCOMPLETE", "INCOMPLETE");
  }
  const latest = closedCandles[closedCandles.length - 1];
  empty.latestClosedCandleAt = latest.timestamp;
  if ((asOf - parseAbsoluteTimestamp(latest.timestamp)) / 1000 > policy.maximumClosedCandleAgeSeconds) {
    return buildResult(input, [{ code: "CLOSED_CANDLE_STALE", message: "The latest closed candle exceeds the configured maximum age." }], empty, "INCOMPLETE", "STALE");
  }
  if (closedCandles.length < policy.minimumClosedCandles) {
    return buildResult(input, [{ code: "INSUFFICIENT_CANDLES", message: "Closed candle history is below the configured minimum." }], empty, "INCOMPLETE", "INCOMPLETE");
  }

  const offset = Math.max(0, closedCandles.length - policy.lookbackCandles);
  const patterns: ChartPatternFinding[] = [];
  for (let index = offset; index < closedCandles.length; index += 1) {
    const current = closedCandles[index];
    const range = current.high - current.low;
    const body = Math.abs(current.close - current.open);
    if (range <= 0) continue;
    const bodyRatio = body / range;
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    if (bodyRatio <= policy.dojiMaximumBodyToRangeRatio) {
      addPattern(patterns, "DOJI", "NEUTRAL", index, index, closedCandles, { bodyToRangeRatio: bodyRatio });
    }
    if (body > 0 && lowerWick / body >= policy.pinBarMinimumWickToBodyRatio &&
      upperWick / range <= policy.pinBarMaximumOppositeWickToRangeRatio) {
      addPattern(patterns, "BULLISH_PIN_BAR", "BULLISH", index, index, closedCandles, {
        dominantWickToBodyRatio: lowerWick / body, oppositeWickToRangeRatio: upperWick / range,
      });
    }
    if (body > 0 && upperWick / body >= policy.pinBarMinimumWickToBodyRatio &&
      lowerWick / range <= policy.pinBarMaximumOppositeWickToRangeRatio) {
      addPattern(patterns, "BEARISH_PIN_BAR", "BEARISH", index, index, closedCandles, {
        dominantWickToBodyRatio: upperWick / body, oppositeWickToRangeRatio: lowerWick / range,
      });
    }
    if (index === 0) continue;
    const previous = closedCandles[index - 1];
    const previousBodyHigh = Math.max(previous.open, previous.close);
    const previousBodyLow = Math.min(previous.open, previous.close);
    const currentBodyHigh = Math.max(current.open, current.close);
    const currentBodyLow = Math.min(current.open, current.close);
    if (isBearish(previous) && isBullish(current) && currentBodyLow <= previousBodyLow && currentBodyHigh >= previousBodyHigh) {
      addPattern(patterns, "BULLISH_ENGULFING", "BULLISH", index - 1, index, closedCandles);
    }
    if (isBullish(previous) && isBearish(current) && currentBodyLow <= previousBodyLow && currentBodyHigh >= previousBodyHigh) {
      addPattern(patterns, "BEARISH_ENGULFING", "BEARISH", index - 1, index, closedCandles);
    }
    if (current.high < previous.high && current.low > previous.low) {
      addPattern(patterns, "INSIDE_BAR", "NEUTRAL", index - 1, index, closedCandles);
    }
    if (current.high > previous.high && current.low < previous.low) {
      addPattern(patterns, "OUTSIDE_BAR", "NEUTRAL", index - 1, index, closedCandles);
    }
  }

  const assessment: PatternRecognitionAssessment = {
    instrument: input.instrument,
    timeframe: input.timeframe,
    latestClosedCandleAt: latest.timestamp,
    closedCandleCount: closedCandles.length,
    formingCandlesExcluded,
    patterns,
  };
  return buildResult(input, [], assessment, "COMPLETE", "READY");
}
