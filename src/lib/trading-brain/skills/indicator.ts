import type { BrainSkillResult, SkillSourceReference } from "./types";

export interface IndicatorCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed: boolean;
}

export interface IndicatorConfiguration {
  smaPeriods: number[];
  emaPeriods: number[];
  rsiPeriods: number[];
  atrPeriods: number[];
  macd?: { fastPeriod: number; slowPeriod: number; signalPeriod: number };
}

export interface IndicatorInput {
  instrument: string;
  timeframe: string;
  asOf: string;
  candles: IndicatorCandle[];
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
  configuration: IndicatorConfiguration;
}

export interface IndicatorPolicy {
  minimumClosedCandles: number;
  maximumClosedCandleAgeSeconds: number;
}

export interface IndicatorValue {
  type: "SMA" | "EMA" | "RSI_WILDER" | "ATR_WILDER" | "MACD";
  period: number | null;
  value: number | null;
  signal?: number;
  histogram?: number;
}

export interface IndicatorAssessment {
  instrument: string;
  timeframe: string;
  latestClosedCandleAt: string | null;
  closedCandleCount: number;
  formingCandlesExcluded: number;
  values: IndicatorValue[];
}

export interface IndicatorFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INVALID_CONFIGURATION"
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
const RULE_SET_VERSION = "indicator-calculations/0.1.0";

function parseAbsoluteTimestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function validPeriods(periods: number[]): boolean {
  return Array.isArray(periods) &&
    new Set(periods).size === periods.length &&
    periods.every((period) => Number.isInteger(period) && period >= 2);
}

function emaSeries(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = values.map(() => null);
  if (values.length < period) return result;
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = (values[index] - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

function rsiWilder(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index] - closes[index - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index] - closes[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function atrWilder(candles: IndicatorCandle[], period: number): number | null {
  if (candles.length < period) return null;
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
  let current = trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let index = period; index < trueRanges.length; index += 1) {
    current = (current * (period - 1) + trueRanges[index]) / period;
  }
  return current;
}

function macdValue(
  closes: number[],
  configuration: NonNullable<IndicatorConfiguration["macd"]>,
): IndicatorValue | null {
  const fast = emaSeries(closes, configuration.fastPeriod);
  const slow = emaSeries(closes, configuration.slowPeriod);
  const macdLine: number[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    if (fast[index] !== null && slow[index] !== null) {
      macdLine.push((fast[index] as number) - (slow[index] as number));
    }
  }
  if (macdLine.length < configuration.signalPeriod) return null;
  const signalSeries = emaSeries(macdLine, configuration.signalPeriod);
  const line = macdLine[macdLine.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  if (signal === null) return null;
  return {
    type: "MACD",
    period: configuration.slowPeriod,
    value: line,
    signal,
    histogram: line - signal,
  };
}

function emptyAssessment(instrument: string, timeframe: string): IndicatorAssessment {
  return {
    instrument,
    timeframe,
    latestClosedCandleAt: null,
    closedCandleCount: 0,
    formingCandlesExcluded: 0,
    values: [],
  };
}

function buildResult(
  input: IndicatorInput,
  findings: IndicatorFinding[],
  assessment: IndicatorAssessment,
  status: BrainSkillResult<IndicatorFinding>["status"],
  readiness: BrainSkillResult<IndicatorFinding>["evidenceReadiness"],
): BrainSkillResult<IndicatorFinding> & { assessment: IndicatorAssessment } {
  return {
    skillId: "indicator",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.values.map((indicator) =>
      `${indicator.type}${indicator.period === null ? "" : `(${indicator.period})`}: ${indicator.value}.`
    ),
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: [
      "Indicator values are deterministic calculations over the supplied closed candles; they are not directional conclusions.",
      "No overbought, oversold, trend, divergence, or entry thresholds are inferred.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: [
      "The upstream Evidence Quality gate must be COMPLETE and READY before these calculations are accepted.",
      "Forming candles are excluded; no provisional indicator values are emitted.",
      "Indicator values do not independently authorize BUY, SELL, a trade plan, or confidence score.",
      "Calculation output depends on the supplied candle history and explicit periods; different warm-up histories can produce different EMA, RSI, ATR and MACD values.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Calculate explicitly configured indicators on validated, closed candles only. */
export function assessIndicators(
  input: IndicatorInput,
  policy?: IndicatorPolicy,
): BrainSkillResult<IndicatorFinding> & { assessment: IndicatorAssessment } {
  if (!policy) {
    return buildResult(input, [{ code: "POLICY_MISSING", message: "An explicit minimum candle count and maximum candle age are required." }], emptyAssessment(input.instrument, input.timeframe), "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isInteger(policy.minimumClosedCandles) ||
    policy.minimumClosedCandles < 2 ||
    !Number.isFinite(policy.maximumClosedCandleAgeSeconds) ||
    policy.maximumClosedCandleAgeSeconds <= 0
  ) {
    return buildResult(input, [{ code: "INVALID_POLICY", message: "Minimum candle count and maximum candle age must be explicit positive values." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
  }

  const configuration = input.configuration;
  const hasMacd = configuration.macd !== undefined;
  if (
    !validPeriods(configuration.smaPeriods) ||
    !validPeriods(configuration.emaPeriods) ||
    !validPeriods(configuration.rsiPeriods) ||
    !validPeriods(configuration.atrPeriods) ||
    (configuration.smaPeriods.length + configuration.emaPeriods.length + configuration.rsiPeriods.length + configuration.atrPeriods.length === 0 && !hasMacd) ||
    (hasMacd && (
      !Number.isInteger(configuration.macd!.fastPeriod) ||
      !Number.isInteger(configuration.macd!.slowPeriod) ||
      !Number.isInteger(configuration.macd!.signalPeriod) ||
      configuration.macd!.fastPeriod < 2 ||
      configuration.macd!.slowPeriod <= configuration.macd!.fastPeriod ||
      configuration.macd!.signalPeriod < 2
    ))
  ) {
    return buildResult(input, [{ code: "INVALID_CONFIGURATION", message: "At least one indicator and valid explicit periods are required; MACD fast must be shorter than slow." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
  }

  if (input.evidenceGate.status !== "COMPLETE" || input.evidenceGate.evidenceReadiness !== "READY") {
    return buildResult(input, [{ code: "EVIDENCE_NOT_READY", message: "Indicator calculations require a COMPLETE, READY upstream evidence assessment." }], emptyAssessment(input.instrument, input.timeframe), "INCOMPLETE", "INCOMPLETE");
  }
  if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length === 0) {
    return buildResult(input, [{ code: "SOURCE_PROVENANCE_MISSING", message: "At least one candle source reference is required." }], emptyAssessment(input.instrument, input.timeframe), "INCOMPLETE", "INCOMPLETE");
  }
  if (input.sourceReferences.some((reference) =>
    reference.instrument !== input.instrument ||
    reference.timeframe !== input.timeframe ||
    !reference.sourceId ||
    !reference.providerId
  )) {
    return buildResult(input, [{ code: "SOURCE_IDENTITY_MISMATCH", message: "Every source reference must identify this instrument, timeframe, source and provider." }], emptyAssessment(input.instrument, input.timeframe), "REJECTED", "INCOMPLETE");
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
  if (closedCandles.length === 0) {
    const assessment = emptyAssessment(input.instrument, input.timeframe);
    assessment.formingCandlesExcluded = formingCandlesExcluded;
    return buildResult(input, [{ code: "NO_CLOSED_CANDLES", message: "No closed candles are available; forming candles cannot be used for confirmed indicator values." }], assessment, "INCOMPLETE", "INCOMPLETE");
  }
  const latest = closedCandles[closedCandles.length - 1];
  const latestTimestamp = parseAbsoluteTimestamp(latest.timestamp);
  if ((asOf - latestTimestamp) / 1000 > policy.maximumClosedCandleAgeSeconds) {
    const assessment = emptyAssessment(input.instrument, input.timeframe);
    assessment.closedCandleCount = closedCandles.length;
    assessment.formingCandlesExcluded = formingCandlesExcluded;
    assessment.latestClosedCandleAt = latest.timestamp;
    return buildResult(input, [{ code: "CLOSED_CANDLE_STALE", message: "The latest closed candle exceeds the configured maximum age." }], assessment, "INCOMPLETE", "STALE");
  }
  if (closedCandles.length < policy.minimumClosedCandles) {
    const assessment = emptyAssessment(input.instrument, input.timeframe);
    assessment.closedCandleCount = closedCandles.length;
    assessment.formingCandlesExcluded = formingCandlesExcluded;
    assessment.latestClosedCandleAt = latest.timestamp;
    return buildResult(input, [{ code: "INSUFFICIENT_CANDLES", message: "Closed candle history is below the configured minimum." }], assessment, "INCOMPLETE", "INCOMPLETE");
  }

  const closes = closedCandles.map((candle) => candle.close);
  const values: IndicatorValue[] = [];
  for (const period of configuration.smaPeriods) {
    if (closes.length < period) continue;
    const sample = closes.slice(-period);
    values.push({ type: "SMA", period, value: sample.reduce((sum, value) => sum + value, 0) / period });
  }
  for (const period of configuration.emaPeriods) {
    const series = emaSeries(closes, period);
    const value = series[series.length - 1];
    if (value !== null) values.push({ type: "EMA", period, value });
  }
  for (const period of configuration.rsiPeriods) {
    const value = rsiWilder(closes, period);
    if (value !== null) values.push({ type: "RSI_WILDER", period, value });
  }
  for (const period of configuration.atrPeriods) {
    const value = atrWilder(closedCandles, period);
    if (value !== null) values.push({ type: "ATR_WILDER", period, value });
  }
  if (configuration.macd) {
    const value = macdValue(closes, configuration.macd);
    if (value) values.push(value);
  }

  const requestedCount =
    configuration.smaPeriods.length +
    configuration.emaPeriods.length +
    configuration.rsiPeriods.length +
    configuration.atrPeriods.length +
    (hasMacd ? 1 : 0);
  if (values.length !== requestedCount) {
    const assessment: IndicatorAssessment = {
      instrument: input.instrument,
      timeframe: input.timeframe,
      latestClosedCandleAt: latest.timestamp,
      closedCandleCount: closedCandles.length,
      formingCandlesExcluded,
      values,
    };
    return buildResult(input, [{ code: "INSUFFICIENT_CANDLES", message: "History is insufficient for one or more requested indicator warm-up periods." }], assessment, "INCOMPLETE", "INCOMPLETE");
  }

  return buildResult(input, [], {
    instrument: input.instrument,
    timeframe: input.timeframe,
    latestClosedCandleAt: latest.timestamp,
    closedCandleCount: closedCandles.length,
    formingCandlesExcluded,
    values,
  }, "COMPLETE", "READY");
}
