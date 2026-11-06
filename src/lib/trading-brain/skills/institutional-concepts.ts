import type { BrainSkillResult, SkillSourceReference } from "./types";
import type { EvidenceCandle } from "./evidence-quality";
import type { MarketStructureAssessment, StructureBreak } from "./market-structure";

export interface InstitutionalConceptsPolicy {
  minimumFvgSize: number;
  orderBlockLookbackBars: number;
  zoneInvalidationBuffer: number;
  requireClosedCandles: true;
}

export interface InstitutionalConceptsInput {
  instrument: string;
  timeframe: string;
  candles: EvidenceCandle[];
  structure: MarketStructureAssessment;
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
}

export interface PriceZone {
  low: number;
  high: number;
}

export interface FairValueGapCandidate {
  direction: "BULLISH" | "BEARISH";
  zone: PriceZone;
  formedAt: string;
  firstCandleAt: string;
  thirdCandleAt: string;
  size: number;
  status: "OPEN" | "PARTIALLY_FILLED" | "FILLED";
  confirmation: "THREE_CLOSED_CANDLES";
}

export interface OrderBlockCandidate {
  direction: "BULLISH" | "BEARISH";
  zone: PriceZone;
  sourceCandleAt: string;
  structureBreakAt: string;
  status: "UNMITIGATED" | "MITIGATED" | "INVALIDATED";
  mitigationAt: string | null;
  invalidationAt: string | null;
  basis: "LAST_OPPOSING_CANDLE_BEFORE_CONFIRMED_STRUCTURE_BREAK";
}

export interface BreakerBlockCandidate {
  direction: "BULLISH" | "BEARISH";
  zone: PriceZone;
  originalOrderBlockAt: string;
  invalidatedAt: string;
  confirmation: "CLOSED_CANDLE_INVALIDATION";
}

export interface InstitutionalConceptsAssessment {
  fairValueGaps: FairValueGapCandidate[];
  orderBlocks: OrderBlockCandidate[];
  breakerBlocks: BreakerBlockCandidate[];
}

export interface InstitutionalConceptsFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "EVIDENCE_NOT_READY"
    | "INVALID_CANDLE_SEQUENCE"
    | "INSTRUMENT_OR_TIMEFRAME_MISMATCH"
    | "PROVISIONAL_CANDLES_IGNORED"
    | "NO_FVG_CANDIDATES"
    | "NO_STRUCTURE_BREAK"
    | "NO_ORDER_BLOCK_CANDIDATE";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "institutional-concepts/0.1.0";

function emptyAssessment(): InstitutionalConceptsAssessment {
  return { fairValueGaps: [], orderBlocks: [], breakerBlocks: [] };
}

function overlaps(candle: EvidenceCandle, zone: PriceZone): boolean {
  return candle.high >= zone.low && candle.low <= zone.high;
}

function makeResult(
  input: InstitutionalConceptsInput,
  findings: InstitutionalConceptsFinding[],
  assessment: InstitutionalConceptsAssessment,
  status: BrainSkillResult<InstitutionalConceptsFinding>["status"],
  readiness: BrainSkillResult<InstitutionalConceptsFinding>["evidenceReadiness"],
): BrainSkillResult<InstitutionalConceptsFinding> & { assessment: InstitutionalConceptsAssessment } {
  return {
    skillId: "institutional-concepts",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [
      ...assessment.fairValueGaps.map((gap) =>
        `${gap.direction} FVG candidate ${gap.zone.low}–${gap.zone.high} (${gap.status.toLowerCase()}).`,
      ),
      ...assessment.orderBlocks.map((block) =>
        `${block.direction} order-block candidate ${block.zone.low}–${block.zone.high} (${block.status.toLowerCase()}).`,
      ),
      ...assessment.breakerBlocks.map((block) =>
        `${block.direction} breaker-block candidate ${block.zone.low}–${block.zone.high}.`,
      ),
    ],
    interpretations: [],
    supportingEvidence: [
      ...assessment.fairValueGaps.map((gap) =>
        `Three closed candles formed a ${gap.direction.toLowerCase()} gap of size ${gap.size} at ${gap.formedAt}.`,
      ),
      ...assessment.orderBlocks.map((block) =>
        `Last opposing candle at ${block.sourceCandleAt} preceded a confirmed structure break at ${block.structureBreakAt}.`,
      ),
    ],
    contraryEvidence: assessment.orderBlocks
      .filter((block) => block.status === "INVALIDATED")
      .map((block) => `Order-block candidate at ${block.sourceCandleAt} was invalidated at ${block.invalidationAt}.`),
    uncertainties: [
      "These are rule-defined price-action candidates, not proof of institutional orders, intent, or future support/resistance.",
      "Zone definitions are simplified and must be reviewed against the approved Trading Vault methodology before any live decision use.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: [
      "FVGs use a three-closed-candle non-overlap definition and an explicit minimum size.",
      "Order blocks use the last opposing candle within an explicit lookback before the supplied confirmed structure break.",
      "Breaker candidates are invalidated order-block zones; no retest is implied.",
      "Mitigation means a later candle range overlaps the zone; it does not prove a reaction.",
      "No trade signal, entry, stop, target, or confidence score is produced.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

function validateBreak(
  structure: MarketStructureAssessment,
  candles: EvidenceCandle[],
): StructureBreak | null {
  const candidate = structure.latestBreak;
  if (!candidate || candidate.confirmation !== "CONFIRMED_CLOSED_CANDLE") return null;
  const breakCandle = candles.find((candle) =>
    candle.timestamp === candidate.candleTimestamp && candle.isClosed
  );
  if (!breakCandle) return null;
  if (
    candidate.direction === "BULLISH" &&
    breakCandle.close <= candidate.level
  ) return null;
  if (
    candidate.direction === "BEARISH" &&
    breakCandle.close >= candidate.level
  ) return null;
  return candidate;
}

/**
 * Deterministic institutional-concept candidate detector.
 * Definitions are intentionally explicit and conservative. It does not infer
 * institutional activity or turn zones into trade recommendations.
 */
export function assessInstitutionalConcepts(
  input: InstitutionalConceptsInput,
  policy?: InstitutionalConceptsPolicy,
): BrainSkillResult<InstitutionalConceptsFinding> & { assessment: InstitutionalConceptsAssessment } {
  if (
    !policy ||
    !Number.isFinite(policy.minimumFvgSize) || policy.minimumFvgSize <= 0 ||
    !Number.isInteger(policy.orderBlockLookbackBars) || policy.orderBlockLookbackBars < 1 ||
    !Number.isFinite(policy.zoneInvalidationBuffer) || policy.zoneInvalidationBuffer < 0 ||
    policy.requireClosedCandles !== true
  ) {
    return makeResult(input, [{
      code: policy ? "INVALID_POLICY" : "POLICY_MISSING",
      message: "An explicit valid institutional-concepts policy is required; gap, lookback and invalidation thresholds are never guessed.",
    }], emptyAssessment(), "INCOMPLETE", "INCOMPLETE");
  }

  if (input.evidenceGate.status !== "COMPLETE" || input.evidenceGate.evidenceReadiness !== "READY") {
    return makeResult(input, [{
      code: "EVIDENCE_NOT_READY",
      message: "Institutional-concept analysis is blocked because upstream evidence is not READY.",
    }], emptyAssessment(), "INCOMPLETE", input.evidenceGate.evidenceReadiness);
  }

  const candles = input.candles.filter((candle) => candle.isClosed);
  const provisionalCount = input.candles.length - candles.length;
  const findings: InstitutionalConceptsFinding[] = [];

  if (provisionalCount > 0) {
    findings.push({
      code: "PROVISIONAL_CANDLES_IGNORED",
      message: `${provisionalCount} forming candle(s) were excluded from confirmed zone calculations.`,
    });
  }

  if (candles.some((candle) =>
    candle.instrument !== input.instrument || candle.timeframe !== input.timeframe
  )) {
    findings.push({
      code: "INSTRUMENT_OR_TIMEFRAME_MISMATCH",
      message: "Candle instrument/timeframe does not match the requested assessment.",
    });
    return makeResult(input, findings, emptyAssessment(), "REJECTED", "INCOMPLETE");
  }

  const timestamps = candles.map((candle) => Date.parse(candle.timestamp));
  if (
    timestamps.some((timestamp) => !Number.isFinite(timestamp)) ||
    timestamps.some((timestamp, index) => index > 0 && timestamp <= timestamps[index - 1]) ||
    candles.some((candle) =>
      ![candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < candle.low
    )
  ) {
    findings.push({
      code: "INVALID_CANDLE_SEQUENCE",
      message: "Closed candles must have valid ascending timestamps and internally consistent OHLC values.",
    });
    return makeResult(input, findings, emptyAssessment(), "REJECTED", "INCOMPLETE");
  }

  const fairValueGaps: FairValueGapCandidate[] = [];
  for (let index = 2; index < candles.length; index += 1) {
    const first = candles[index - 2];
    const middle = candles[index - 1];
    const third = candles[index];

    if (first.high < third.low) {
      const size = third.low - first.high;
      if (size >= policy.minimumFvgSize) {
        const zone = { low: first.high, high: third.low };
        const later = candles.slice(index + 1);
        const tradedThrough = later.some((candle) => candle.low <= zone.low && candle.high >= zone.high);
        const touched = later.some((candle) => overlaps(candle, zone));
        fairValueGaps.push({
          direction: "BULLISH",
          zone,
          formedAt: middle.timestamp,
          firstCandleAt: first.timestamp,
          thirdCandleAt: third.timestamp,
          size,
          status: tradedThrough ? "FILLED" : touched ? "PARTIALLY_FILLED" : "OPEN",
          confirmation: "THREE_CLOSED_CANDLES",
        });
      }
    } else if (first.low > third.high) {
      const size = first.low - third.high;
      if (size >= policy.minimumFvgSize) {
        const zone = { low: third.high, high: first.low };
        const later = candles.slice(index + 1);
        const tradedThrough = later.some((candle) => candle.low <= zone.low && candle.high >= zone.high);
        const touched = later.some((candle) => overlaps(candle, zone));
        fairValueGaps.push({
          direction: "BEARISH",
          zone,
          formedAt: middle.timestamp,
          firstCandleAt: first.timestamp,
          thirdCandleAt: third.timestamp,
          size,
          status: tradedThrough ? "FILLED" : touched ? "PARTIALLY_FILLED" : "OPEN",
          confirmation: "THREE_CLOSED_CANDLES",
        });
      }
    }
  }

  const orderBlocks: OrderBlockCandidate[] = [];
  const breakerBlocks: BreakerBlockCandidate[] = [];
  const structureBreak = validateBreak(input.structure, candles);

  if (structureBreak) {
    const breakIndex = candles.findIndex((candle) => candle.timestamp === structureBreak.candleTimestamp);
    const direction = structureBreak.direction;
    const startIndex = Math.max(0, breakIndex - policy.orderBlockLookbackBars);
    let sourceIndex = -1;

    for (let index = breakIndex - 1; index >= startIndex; index -= 1) {
      const candle = candles[index];
      const opposing = direction === "BULLISH"
        ? candle.close < candle.open
        : candle.close > candle.open;
      if (opposing) {
        sourceIndex = index;
        break;
      }
    }

    if (sourceIndex >= 0) {
      const source = candles[sourceIndex];
      const zone = { low: source.low, high: source.high };
      let mitigationAt: string | null = null;
      let invalidationAt: string | null = null;

      for (const later of candles.slice(breakIndex + 1)) {
        const invalidated = direction === "BULLISH"
          ? later.close < zone.low - policy.zoneInvalidationBuffer
          : later.close > zone.high + policy.zoneInvalidationBuffer;
        if (invalidated) {
          invalidationAt = later.timestamp;
          break;
        }
        if (!mitigationAt && overlaps(later, zone)) mitigationAt = later.timestamp;
      }

      const status = invalidationAt ? "INVALIDATED" : mitigationAt ? "MITIGATED" : "UNMITIGATED";
      orderBlocks.push({
        direction,
        zone,
        sourceCandleAt: source.timestamp,
        structureBreakAt: structureBreak.candleTimestamp,
        status,
        mitigationAt,
        invalidationAt,
        basis: "LAST_OPPOSING_CANDLE_BEFORE_CONFIRMED_STRUCTURE_BREAK",
      });

      if (invalidationAt) {
        breakerBlocks.push({
          direction: direction === "BULLISH" ? "BEARISH" : "BULLISH",
          zone,
          originalOrderBlockAt: source.timestamp,
          invalidatedAt: invalidationAt,
          confirmation: "CLOSED_CANDLE_INVALIDATION",
        });
      }
    } else {
      findings.push({
        code: "NO_ORDER_BLOCK_CANDIDATE",
        message: "No opposing candle was found within the configured lookback before the supplied structure break.",
      });
    }
  } else {
    findings.push({
      code: "NO_STRUCTURE_BREAK",
      message: "No validated closed-candle structure break was supplied; order-block candidates were withheld.",
    });
  }

  if (fairValueGaps.length === 0) {
    findings.push({
      code: "NO_FVG_CANDIDATES",
      message: "No three-candle gap met the supplied minimum-size policy.",
    });
  }

  return makeResult(
    input,
    findings,
    { fairValueGaps, orderBlocks, breakerBlocks },
    "COMPLETE",
    "READY",
  );
}
