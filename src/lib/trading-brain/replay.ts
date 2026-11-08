export interface ReplayCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  provisional: boolean;
}

export type ReplayAction = "BUY_CANDIDATE" | "SELL_CANDIDATE" | "NO_TRADE";

export interface ReplayDecision {
  action: ReplayAction;
  ruleSetVersion: string;
  rationale: string;
  /** Candle timestamps actually used by the strategy for this decision. */
  sourceTimestamps: string[];
}

export interface ReplayContext {
  /** The latest instant the strategy is allowed to know about. */
  asOf: string;
  current: Readonly<ReplayCandle>;
  /** Closed candles only, from the beginning of the replay through current. */
  history: readonly Readonly<ReplayCandle>[];
}

export type ReplayStrategy = (context: ReplayContext) => ReplayDecision;

export interface ReplayDecisionRecord {
  asOf: string;
  decision: ReplayDecision;
}

export interface ReplayResult {
  status: "COMPLETE" | "REJECTED" | "INCOMPLETE";
  records: ReplayDecisionRecord[];
  includedCandleCount: number;
  excludedProvisionalCount: number;
  findings: string[];
  limitations: string[];
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validCandle(candle: ReplayCandle): boolean {
  const values = [candle.open, candle.high, candle.low, candle.close];
  return values.every((value) => Number.isFinite(value) && value > 0) &&
    candle.high >= candle.open && candle.high >= candle.close &&
    candle.low <= candle.open && candle.low <= candle.close &&
    candle.high >= candle.low;
}

/**
 * Deterministic closed-candle replay boundary.
 *
 * Each strategy invocation receives only the chronological prefix ending at
 * the current candle. Provisional candles are excluded. This module does not
 * simulate fills, calculate profitability, or certify a trading strategy.
 */
export function replayClosedCandles(input: {
  candles: readonly ReplayCandle[];
  strategy: ReplayStrategy;
  startAt?: string;
  endAt?: string;
}): ReplayResult {
  const findings: string[] = [];
  const records: ReplayDecisionRecord[] = [];

  if (typeof input.strategy !== "function") {
    return {
      status: "REJECTED", records, includedCandleCount: 0,
      excludedProvisionalCount: 0,
      findings: ["A replay strategy function is required."],
      limitations: ["No strategy was executed."],
    };
  }
  if (input.startAt !== undefined && !validTimestamp(input.startAt)) {
    findings.push("startAt must be a valid timestamp.");
  }
  if (input.endAt !== undefined && !validTimestamp(input.endAt)) {
    findings.push("endAt must be a valid timestamp.");
  }
  if (findings.length > 0) {
    return {
      status: "REJECTED", records, includedCandleCount: 0,
      excludedProvisionalCount: 0, findings,
      limitations: ["Replay boundaries were invalid; no strategy was executed."],
    };
  }

  const startMs = input.startAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(input.startAt);
  const endMs = input.endAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(input.endAt);
  if (endMs < startMs) {
    return {
      status: "REJECTED", records, includedCandleCount: 0,
      excludedProvisionalCount: 0,
      findings: ["endAt must not be earlier than startAt."],
      limitations: ["No strategy was executed."],
    };
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  const closed: ReplayCandle[] = [];
  let excludedProvisionalCount = 0;

  for (const candle of input.candles) {
    if (!validTimestamp(candle.timestamp)) {
      findings.push("A candle has an invalid timestamp.");
      break;
    }
    const timestampMs = Date.parse(candle.timestamp);
    if (timestampMs <= previousTimestamp) {
      findings.push("Candles must be strictly chronological with no duplicate timestamps.");
      break;
    }
    previousTimestamp = timestampMs;
    if (typeof candle.provisional !== "boolean" || !validCandle(candle)) {
      findings.push(`Candle at ${candle.timestamp} has invalid state or OHLC values.`);
      break;
    }
    if (candle.provisional) {
      excludedProvisionalCount += 1;
      continue;
    }
    if (timestampMs >= startMs && timestampMs <= endMs) closed.push(candle);
  }

  if (findings.length > 0) {
    return {
      status: "REJECTED", records, includedCandleCount: 0,
      excludedProvisionalCount, findings,
      limitations: ["Invalid or unordered input prevents a trustworthy chronological replay."],
    };
  }

  for (let index = 0; index < closed.length; index += 1) {
    const prefix = closed.slice(0, index + 1).map((candle) =>
      Object.freeze({ ...candle }),
    );
    const current = prefix[prefix.length - 1];
    const asOf = current.timestamp;
    let decision: ReplayDecision;

    try {
      decision = input.strategy(Object.freeze({
        asOf,
        current,
        history: Object.freeze(prefix),
      }));
    } catch (error) {
      findings.push(
        error instanceof Error
          ? `Strategy failed at ${asOf}: ${error.message}`
          : `Strategy failed at ${asOf}.`,
      );
      return {
        status: "INCOMPLETE", records, includedCandleCount: closed.length,
        excludedProvisionalCount, findings,
        limitations: ["Replay stopped at the first strategy error; later candles were not evaluated."],
      };
    }

    if (!decision || !["BUY_CANDIDATE", "SELL_CANDIDATE", "NO_TRADE"].includes(decision.action) ||
        typeof decision.ruleSetVersion !== "string" || !decision.ruleSetVersion.trim() ||
        typeof decision.rationale !== "string" || !decision.rationale.trim() ||
        !Array.isArray(decision.sourceTimestamps) || decision.sourceTimestamps.length === 0) {
      findings.push(`Strategy returned an incomplete decision at ${asOf}.`);
      return {
        status: "INCOMPLETE", records, includedCandleCount: closed.length,
        excludedProvisionalCount, findings,
        limitations: ["Incomplete decisions are not recorded as valid replay evidence."],
      };
    }

    const visibleTimestamps = new Set(prefix.map((candle) => candle.timestamp));
    const hasLookAhead = decision.sourceTimestamps.some((timestamp) =>
      !validTimestamp(timestamp) || Date.parse(timestamp) > Date.parse(asOf) ||
      !visibleTimestamps.has(timestamp),
    );
    if (hasLookAhead) {
      findings.push(`Strategy referenced unavailable or future evidence at ${asOf}.`);
      return {
        status: "REJECTED", records, includedCandleCount: closed.length,
        excludedProvisionalCount, findings,
        limitations: ["Replay stopped because the strategy referenced evidence outside its visible chronological prefix."],
      };
    }

    records.push({
      asOf,
      decision: {
        ...decision,
        sourceTimestamps: [...decision.sourceTimestamps],
      },
    });
  }

  return {
    status: "COMPLETE",
    records,
    includedCandleCount: closed.length,
    excludedProvisionalCount,
    findings,
    limitations: [
      "This is a chronological decision replay, not a fill or P&L simulator.",
      "It does not certify strategy quality or future performance.",
      "The strategy must not read external future data through captured variables or side channels.",
      "No broker, order, or signal-activation action is performed.",
    ],
  };
}
