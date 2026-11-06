import type { BrainSkillResult, SkillSourceReference } from "./types";
import type { EvidenceCandle } from "./evidence-quality";

export type StructureBias = "BULLISH" | "BEARISH" | "RANGE_OR_UNCLEAR";
export type StructureBreakDirection = "BULLISH" | "BEARISH";
export type StructureBreakContext = "CONTINUATION_CANDIDATE" | "REVERSAL_CANDIDATE" | "UNCLASSIFIED";

export interface MarketStructurePolicy {
  leftBars: number;
  rightBars: number;
  minimumSwingDistanceBars: number;
  breakBuffer: number;
  equalExtremePolicy: "REJECT" | "FIRST" | "LAST";
  requireClosedCandleForConfirmation: true;
}

export interface MarketStructureInput {
  instrument: string;
  timeframe: string;
  candles: EvidenceCandle[];
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
}

export interface StructureSwing {
  kind: "HIGH" | "LOW";
  price: number;
  timestamp: string;
  candleIndex: number;
  confirmed: true;
}

export interface StructureBreak {
  direction: StructureBreakDirection;
  level: number;
  candleClose: number;
  candleTimestamp: string;
  context: StructureBreakContext;
  confirmation: "CONFIRMED_CLOSED_CANDLE";
}

export interface MarketStructureFinding {
  code:
    | "POLICY_MISSING"
    | "EVIDENCE_NOT_READY"
    | "INSUFFICIENT_CANDLES"
    | "INVALID_POLICY"
    | "NO_CONFIRMED_SWINGS"
    | "NO_BREAK"
    | "AMBIGUOUS_SWING"
    | "PROVISIONAL_CANDLE_IGNORED"
    | "INVALID_CANDLE_SEQUENCE";
  message: string;
}

export interface MarketStructureAssessment {
  bias: StructureBias;
  swings: StructureSwing[];
  latestBreak: StructureBreak | null;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "market-structure/0.1.0";

function makeResult(
  input: MarketStructureInput,
  findings: MarketStructureFinding[],
  assessment: MarketStructureAssessment,
  status: BrainSkillResult<MarketStructureFinding>["status"],
  readiness: BrainSkillResult<MarketStructureFinding>["evidenceReadiness"],
): BrainSkillResult<MarketStructureFinding> & { assessment: MarketStructureAssessment } {
  return {
    skillId: "market-structure",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.swings.map(
      (swing) => `Confirmed swing ${swing.kind.toLowerCase()} at ${swing.price} (${swing.timestamp}).`,
    ),
    interpretations: assessment.latestBreak
      ? [`${assessment.latestBreak.direction} structure-break candidate: ${assessment.latestBreak.context.toLowerCase()}.`]
      : [],
    supportingEvidence: assessment.latestBreak
      ? [`Closed candle at ${assessment.latestBreak.candleTimestamp} closed beyond ${assessment.latestBreak.level}.`]
      : [],
    contraryEvidence: [],
    uncertainties: assessment.bias === "RANGE_OR_UNCLEAR"
      ? ["Directional structure could not be classified from the available confirmed swing sequence."]
      : [],
    sourceReferences: input.sourceReferences,
    limitations: [
      "This deterministic module identifies local swing and close-break candidates only.",
      "It does not certify BOS, CHoCH, MSS, displacement, retests, order blocks, or a trade direction.",
      "No market-methodology thresholds are assumed; all swing and break parameters must be supplied explicitly.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

function emptyAssessment(): MarketStructureAssessment {
  return { bias: "RANGE_OR_UNCLEAR", swings: [], latestBreak: null };
}

/**
 * Local swing and close-break candidate detector.
 * Policy values are mandatory and caller-supplied; there are no hidden defaults.
 * Forming candles are excluded from confirmed structure calculations.
 */
export function assessMarketStructure(
  input: MarketStructureInput,
  policy?: MarketStructurePolicy,
): BrainSkillResult<MarketStructureFinding> & { assessment: MarketStructureAssessment } {
  if (
    !policy ||
    !Number.isInteger(policy.leftBars) || policy.leftBars < 1 ||
    !Number.isInteger(policy.rightBars) || policy.rightBars < 1 ||
    !Number.isInteger(policy.minimumSwingDistanceBars) || policy.minimumSwingDistanceBars < 1 ||
    !Number.isFinite(policy.breakBuffer) || policy.breakBuffer < 0 ||
    !["REJECT", "FIRST", "LAST"].includes(policy.equalExtremePolicy) ||
    policy.requireClosedCandleForConfirmation !== true
  ) {
    return makeResult(input, [{
      code: policy ? "INVALID_POLICY" : "POLICY_MISSING",
      message: "An explicit valid market-structure policy is required. No swing or break thresholds are guessed.",
    }], emptyAssessment(), "INCOMPLETE", "INCOMPLETE");
  }

  if (input.evidenceGate.status !== "COMPLETE" || input.evidenceGate.evidenceReadiness !== "READY") {
    return makeResult(input, [{
      code: "EVIDENCE_NOT_READY",
      message: "Market structure is blocked because the upstream evidence-quality gate is not READY.",
    }], emptyAssessment(), "INCOMPLETE", input.evidenceGate.evidenceReadiness);
  }

  const closedCandles = input.candles.filter((candle) => candle.isClosed);
  const provisionalCount = input.candles.length - closedCandles.length;
  const findings: MarketStructureFinding[] = [];

  if (provisionalCount > 0) {
    findings.push({
      code: "PROVISIONAL_CANDLE_IGNORED",
      message: `${provisionalCount} forming candle(s) were excluded from confirmed structure calculations.`,
    });
  }

  if (closedCandles.length < policy.leftBars + policy.rightBars + 1) {
    findings.push({
      code: "INSUFFICIENT_CANDLES",
      message: "Not enough closed candles are available for the configured swing window.",
    });
    return makeResult(input, findings, emptyAssessment(), "INCOMPLETE", "INCOMPLETE");
  }

  const timestamps = closedCandles.map((candle) => Date.parse(candle.timestamp));
  if (timestamps.some((value) => !Number.isFinite(value)) ||
      timestamps.some((value, index) => index > 0 && value <= timestamps[index - 1])) {
    findings.push({
      code: "INVALID_CANDLE_SEQUENCE",
      message: "Closed candles must have valid, strictly ascending timestamps.",
    });
    return makeResult(input, findings, emptyAssessment(), "REJECTED", "INCOMPLETE");
  }

  const swings: StructureSwing[] = [];
  const firstPivotIndex = policy.leftBars;
  const lastPivotIndex = closedCandles.length - policy.rightBars - 1;

  for (let index = firstPivotIndex; index <= lastPivotIndex; index += 1) {
    const windowStart = index - policy.leftBars;
    const windowEnd = index + policy.rightBars;
    const window = closedCandles.slice(windowStart, windowEnd + 1);
    const candidate = closedCandles[index];

    const highs = window.map((candle) => candle.high);
    const lows = window.map((candle) => candle.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const highIndexes = highs.flatMap((value, offset) => value === maxHigh ? [windowStart + offset] : []);
    const lowIndexes = lows.flatMap((value, offset) => value === minLow ? [windowStart + offset] : []);

    const isSelectedExtreme = (indexes: number[]): boolean => {
      if (indexes.length === 1) return indexes[0] === index;
      if (policy.equalExtremePolicy === "REJECT") return false;
      return policy.equalExtremePolicy === "FIRST"
        ? indexes[0] === index
        : indexes[indexes.length - 1] === index;
    };

    if (isSelectedExtreme(highIndexes)) {
      swings.push({
        kind: "HIGH",
        price: candidate.high,
        timestamp: candidate.timestamp,
        candleIndex: index,
        confirmed: true,
      });
    }
    if (isSelectedExtreme(lowIndexes)) {
      swings.push({
        kind: "LOW",
        price: candidate.low,
        timestamp: candidate.timestamp,
        candleIndex: index,
        confirmed: true,
      });
    }
  }

  const highSwings = swings.filter((swing) => swing.kind === "HIGH");
  const lowSwings = swings.filter((swing) => swing.kind === "LOW");
  const enoughSwingPairs = highSwings.length >= 2 && lowSwings.length >= 2;
  let bias: StructureBias = "RANGE_OR_UNCLEAR";

  if (enoughSwingPairs) {
    const previousHigh = highSwings[highSwings.length - 2];
    const latestHigh = highSwings[highSwings.length - 1];
    const previousLow = lowSwings[lowSwings.length - 2];
    const latestLow = lowSwings[lowSwings.length - 1];

    if (
      latestHigh.price > previousHigh.price &&
      latestLow.price > previousLow.price
    ) bias = "BULLISH";
    else if (
      latestHigh.price < previousHigh.price &&
      latestLow.price < previousLow.price
    ) bias = "BEARISH";
  }

  const latestCandle = closedCandles[closedCandles.length - 1];
  const latestHighSwing = highSwings[highSwings.length - 1];
  const latestLowSwing = lowSwings[lowSwings.length - 1];
  let latestBreak: StructureBreak | null = null;

  const highIsRecentEnough =
    latestHighSwing && latestCandle && latestHighSwing.candleIndex < closedCandles.length - 1;
  const lowIsRecentEnough =
    latestLowSwing && latestCandle && latestLowSwing.candleIndex < closedCandles.length - 1;

  if (
    highIsRecentEnough &&
    latestCandle.close > latestHighSwing.price + policy.breakBuffer
  ) {
    latestBreak = {
      direction: "BULLISH",
      level: latestHighSwing.price,
      candleClose: latestCandle.close,
      candleTimestamp: latestCandle.timestamp,
      context: bias === "BULLISH" ? "CONTINUATION_CANDIDATE"
        : bias === "BEARISH" ? "REVERSAL_CANDIDATE" : "UNCLASSIFIED",
      confirmation: "CONFIRMED_CLOSED_CANDLE",
    };
  } else if (
    lowIsRecentEnough &&
    latestCandle.close < latestLowSwing.price - policy.breakBuffer
  ) {
    latestBreak = {
      direction: "BEARISH",
      level: latestLowSwing.price,
      candleClose: latestCandle.close,
      candleTimestamp: latestCandle.timestamp,
      context: bias === "BEARISH" ? "CONTINUATION_CANDIDATE"
        : bias === "BULLISH" ? "REVERSAL_CANDIDATE" : "UNCLASSIFIED",
      confirmation: "CONFIRMED_CLOSED_CANDLE",
    };
  }

  if (swings.length === 0) {
    findings.push({ code: "NO_CONFIRMED_SWINGS", message: "No confirmed local swing points were found." });
  }
  if (!latestBreak) {
    findings.push({ code: "NO_BREAK", message: "No confirmed close beyond the latest detected swing level was found." });
  }

  const assessment = { bias, swings, latestBreak };
  return makeResult(
    input,
    findings,
    assessment,
    "COMPLETE",
    "READY",
  );
}
