import {
  MARKET_DATA_TIMEFRAMES,
  type InstrumentId,
  type MarketDataTimeframe,
} from "../market-data/types";
import type { ReplayCandle } from "./replay";

export interface MultiTimeframeReplayCandle extends ReplayCandle {
  /** First instant at which this completed observation is safe to know. */
  availableAt: string;
}

export interface MultiTimeframeCandleStream {
  timeframe: MarketDataTimeframe;
  candles: readonly MultiTimeframeReplayCandle[];
}

export interface MultiTimeframeReplayEvidence {
  instrument: InstrumentId;
  asOf: string;
  status: "COMPLETE" | "INCOMPLETE" | "REJECTED";
  evidence: Partial<Record<MarketDataTimeframe, Readonly<MultiTimeframeReplayCandle>>>;
  missingTimeframes: MarketDataTimeframe[];
  excludedProvisionalCount: number;
  findings: string[];
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isValidCandle(candle: ReplayCandle): boolean {
  const values = [candle.open, candle.high, candle.low, candle.close];
  return values.every((value) => Number.isFinite(value) && value > 0) &&
    candle.high >= candle.open && candle.high >= candle.close &&
    candle.low <= candle.open && candle.low <= candle.close &&
    candle.high >= candle.low;
}

/**
 * Selects the latest confirmed candle per supported timeframe at one shared
 * as-of boundary. This is an evidence-alignment helper, not a strategy or
 * signal generator. It accepts only caller-supplied replay observations.
 */
export function selectClosedMultiTimeframeEvidence(input: {
  instrument: InstrumentId;
  asOf: string;
  streams: readonly MultiTimeframeCandleStream[];
}): MultiTimeframeReplayEvidence {
  const evidence: Partial<Record<MarketDataTimeframe, Readonly<MultiTimeframeReplayCandle>>> = {};
  const findings: string[] = [];
  let excludedProvisionalCount = 0;

  if (!isCanonicalTimestamp(input.asOf)) {
    return {
      instrument: input.instrument,
      asOf: input.asOf,
      status: "REJECTED",
      evidence,
      missingTimeframes: [...MARKET_DATA_TIMEFRAMES],
      excludedProvisionalCount,
      findings: ["asOf must be a canonical UTC ISO-8601 timestamp."],
    };
  }

  if (!Array.isArray(input.streams)) {
    return {
      instrument: input.instrument,
      asOf: input.asOf,
      status: "REJECTED",
      evidence,
      missingTimeframes: [...MARKET_DATA_TIMEFRAMES],
      excludedProvisionalCount,
      findings: ["A timeframe stream array is required."],
    };
  }

  const asOfMs = Date.parse(input.asOf);
  const streams = input.streams as readonly MultiTimeframeCandleStream[];
  const seen = new Set<MarketDataTimeframe>();

  for (const stream of streams) {
    if (!MARKET_DATA_TIMEFRAMES.includes(stream.timeframe)) {
      findings.push("An unsupported timeframe was supplied.");
      continue;
    }
    if (seen.has(stream.timeframe)) {
      findings.push(`Duplicate stream supplied for ${stream.timeframe}.`);
      continue;
    }
    seen.add(stream.timeframe);

    if (!Array.isArray(stream.candles) || stream.candles.length === 0) {
      findings.push(`No candles supplied for ${stream.timeframe}.`);
      continue;
    }

    let previousTimestamp = Number.NEGATIVE_INFINITY;

    for (const candle of stream.candles) {
      if (!isCanonicalTimestamp(candle.timestamp)) {
        findings.push(`${stream.timeframe} contains a non-canonical candle timestamp.`);
        break;
      }

      const timestampMs = Date.parse(candle.timestamp);
      if (!isCanonicalTimestamp(candle.availableAt) || Date.parse(candle.availableAt) < timestampMs) {
        findings.push(`${stream.timeframe} contains invalid candle availability metadata.`);
        break;
      }
      if (timestampMs <= previousTimestamp) {
        findings.push(`${stream.timeframe} candles must be strictly chronological with no duplicates.`);
        break;
      }
      previousTimestamp = timestampMs;

      if (typeof candle.provisional !== "boolean" || !isValidCandle(candle)) {
        findings.push(`${stream.timeframe} contains invalid candle state or OHLC values.`);
        break;
      }

      if (candle.provisional) {
        excludedProvisionalCount += 1;
      }
    }
  }

  if (findings.length > 0) {
    return {
      instrument: input.instrument,
      asOf: input.asOf,
      status: "REJECTED",
      evidence: {},
      missingTimeframes: [...MARKET_DATA_TIMEFRAMES],
      excludedProvisionalCount,
      findings,
    };
  }

  for (const stream of streams) {
    const eligible = stream.candles.filter(
      (candle) => !candle.provisional &&
        Date.parse(candle.timestamp) <= asOfMs &&
        Date.parse(candle.availableAt) <= asOfMs,
    );
    const latest = eligible[eligible.length - 1];
    if (latest) evidence[stream.timeframe] = Object.freeze({ ...latest });
  }

  const missingTimeframes = MARKET_DATA_TIMEFRAMES.filter(
    (timeframe) => !evidence[timeframe],
  );

  if (missingTimeframes.length > 0) {
    findings.push(
      `No confirmed candle at or before asOf for: ${missingTimeframes.join(", ")}.`,
    );
  }

  return {
    instrument: input.instrument,
    asOf: input.asOf,
    status: missingTimeframes.length === 0 ? "COMPLETE" : "INCOMPLETE",
    evidence,
    missingTimeframes,
    excludedProvisionalCount,
    findings,
  };
}
