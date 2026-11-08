import type { BrainSkillResult, SkillSourceReference } from "./types";
import type { EvidenceCandle } from "./evidence-quality";
import type { MarketStructureAssessment, StructureSwing } from "./market-structure";

export interface LiquidityPolicy {
  equalLevelTolerance: number;
  minimumTouches: number;
  sweepBuffer: number;
  requireClosedCandleForSweepConfirmation: true;
}

export interface LiquidityInput {
  instrument: string;
  timeframe: string;
  candles: EvidenceCandle[];
  structure: MarketStructureAssessment;
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
}

export interface LiquidityPool {
  side: "BUY_SIDE" | "SELL_SIDE";
  referenceLevel: number;
  touchCount: number;
  firstTouchAt: string;
  lastTouchAt: string;
  sourceSwingTimestamps: string[];
}

export interface LiquiditySweepCandidate {
  sweptSide: "BUY_SIDE" | "SELL_SIDE";
  referenceLevel: number;
  candleTimestamp: string;
  wickExtreme: number;
  close: number;
  confirmation: "CONFIRMED_CLOSED_CANDLE";
}

export interface LiquidityFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "EVIDENCE_NOT_READY"
    | "NO_SWINGS"
    | "INVALID_CANDLE_SEQUENCE"
    | "INSTRUMENT_OR_TIMEFRAME_MISMATCH"
    | "PROVISIONAL_CANDLE_IGNORED"
    | "NO_QUALIFIED_POOLS"
    | "NO_SWEEP_CANDIDATES";
  message: string;
}

export interface LiquidityAssessment {
  pools: LiquidityPool[];
  sweeps: LiquiditySweepCandidate[];
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "liquidity/0.1.0";

function emptyAssessment(): LiquidityAssessment {
  return { pools: [], sweeps: [] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function makeResult(
  input: LiquidityInput,
  findings: LiquidityFinding[],
  assessment: LiquidityAssessment,
  status: BrainSkillResult<LiquidityFinding>["status"],
  readiness: BrainSkillResult<LiquidityFinding>["evidenceReadiness"],
): BrainSkillResult<LiquidityFinding> & { assessment: LiquidityAssessment } {
  return {
    skillId: "liquidity",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [
      ...assessment.pools.map((pool) =>
        `${pool.side} liquidity candidate near ${pool.referenceLevel} from ${pool.touchCount} classified swing touches.`,
      ),
      ...assessment.sweeps.map((sweep) =>
        `${sweep.sweptSide} liquidity sweep candidate at ${sweep.candleTimestamp}.`,
      ),
    ],
    interpretations: [],
    supportingEvidence: assessment.sweeps.map(
      (sweep) => `Closed candle wicked beyond ${sweep.referenceLevel} and closed back across that level.`,
    ),
    contraryEvidence: [],
    uncertainties: [
      "Liquidity pools are price-action hypotheses; the module cannot observe actual resting orders or stop placement.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: [
      "Equal-level tolerance and minimum touches are explicit caller-supplied policy, not hidden defaults.",
      "Sweep candidates require a closed candle and a close back across the reference level.",
      "This module does not infer institutional intent or authorize a trade.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/**
 * Detects candidate equal-high/equal-low pools from independently classified
 * swings, then scans closed candles for wick-through/close-back sweep patterns.
 * A pool is not proof of resting liquidity or known stop orders.
 */
export function assessLiquidity(
  input: LiquidityInput,
  policy?: LiquidityPolicy,
): BrainSkillResult<LiquidityFinding> & { assessment: LiquidityAssessment } {
  if (
    !policy ||
    !Number.isFinite(policy.equalLevelTolerance) || policy.equalLevelTolerance < 0 ||
    !Number.isInteger(policy.minimumTouches) || policy.minimumTouches < 2 ||
    !Number.isFinite(policy.sweepBuffer) || policy.sweepBuffer < 0 ||
    policy.requireClosedCandleForSweepConfirmation !== true
  ) {
    return makeResult(input, [{
      code: policy ? "INVALID_POLICY" : "POLICY_MISSING",
      message: "An explicit valid liquidity policy is required; equal-level and sweep thresholds are never guessed.",
    }], emptyAssessment(), "INCOMPLETE", "INCOMPLETE");
  }

  if (input.evidenceGate.status !== "COMPLETE" || input.evidenceGate.evidenceReadiness !== "READY") {
    return makeResult(input, [{
      code: "EVIDENCE_NOT_READY",
      message: "Liquidity analysis is blocked because the upstream evidence-quality gate is not READY.",
    }], emptyAssessment(), "INCOMPLETE", input.evidenceGate.evidenceReadiness);
  }

  const closedCandles = input.candles.filter((candle) => candle.isClosed);
  const provisionalCount = input.candles.length - closedCandles.length;
  const findings: LiquidityFinding[] = [];

  if (provisionalCount > 0) {
    findings.push({
      code: "PROVISIONAL_CANDLE_IGNORED",
      message: `${provisionalCount} forming candle(s) were excluded from confirmed sweep calculations.`,
    });
  }

  if (input.structure.swings.length === 0) {
    findings.push({ code: "NO_SWINGS", message: "No classified market-structure swings were supplied." });
    return makeResult(input, findings, emptyAssessment(), "INCOMPLETE", "INCOMPLETE");
  }

  if (closedCandles.some((candle) =>
    candle.instrument !== input.instrument || candle.timeframe !== input.timeframe
  )) {
    findings.push({
      code: "INSTRUMENT_OR_TIMEFRAME_MISMATCH",
      message: "Candle instrument/timeframe does not match the requested liquidity assessment.",
    });
    return makeResult(input, findings, emptyAssessment(), "REJECTED", "INCOMPLETE");
  }

  const timestamps = closedCandles.map((candle) => Date.parse(candle.timestamp));
  if (
    timestamps.some((value) => !Number.isFinite(value)) ||
    timestamps.some((value, index) => index > 0 && value <= timestamps[index - 1])
  ) {
    findings.push({
      code: "INVALID_CANDLE_SEQUENCE",
      message: "Closed candles must have valid, strictly ascending timestamps.",
    });
    return makeResult(input, findings, emptyAssessment(), "REJECTED", "INCOMPLETE");
  }

  const eligibleSwings = input.structure.swings
    .filter((swing) => swing.confirmed)
    .sort((a, b) => a.candleIndex - b.candleIndex);
  const pools: LiquidityPool[] = [];
  const usedSwingTimestamps = new Set<string>();

  const buildPools = (kind: StructureSwing["kind"]): void => {
    const side = kind === "HIGH" ? "BUY_SIDE" : "SELL_SIDE";
    const swings = eligibleSwings.filter((swing) => swing.kind === kind);

    for (const anchor of swings) {
      if (usedSwingTimestamps.has(`${kind}:${anchor.timestamp}`)) continue;
      const cluster = swings.filter((swing) =>
        !usedSwingTimestamps.has(`${kind}:${swing.timestamp}`) &&
        Math.abs(swing.price - anchor.price) <= policy.equalLevelTolerance
      );
      if (cluster.length < policy.minimumTouches) continue;

      for (const swing of cluster) {
        usedSwingTimestamps.add(`${kind}:${swing.timestamp}`);
      }

      const ordered = [...cluster].sort((a, b) => a.candleIndex - b.candleIndex);
      pools.push({
        side,
        referenceLevel: median(cluster.map((swing) => swing.price)),
        touchCount: cluster.length,
        firstTouchAt: ordered[0].timestamp,
        lastTouchAt: ordered[ordered.length - 1].timestamp,
        sourceSwingTimestamps: ordered.map((swing) => swing.timestamp),
      });
    }
  };

  buildPools("HIGH");
  buildPools("LOW");

  const sweeps: LiquiditySweepCandidate[] = [];
  for (const pool of pools) {
    const lastTouchTime = Date.parse(pool.lastTouchAt);
    for (const candle of closedCandles) {
      if (Date.parse(candle.timestamp) <= lastTouchTime) continue;

      if (
        pool.side === "BUY_SIDE" &&
        candle.high > pool.referenceLevel + policy.sweepBuffer &&
        candle.close < pool.referenceLevel
      ) {
        sweeps.push({
          sweptSide: pool.side,
          referenceLevel: pool.referenceLevel,
          candleTimestamp: candle.timestamp,
          wickExtreme: candle.high,
          close: candle.close,
          confirmation: "CONFIRMED_CLOSED_CANDLE",
        });
      } else if (
        pool.side === "SELL_SIDE" &&
        candle.low < pool.referenceLevel - policy.sweepBuffer &&
        candle.close > pool.referenceLevel
      ) {
        sweeps.push({
          sweptSide: pool.side,
          referenceLevel: pool.referenceLevel,
          candleTimestamp: candle.timestamp,
          wickExtreme: candle.low,
          close: candle.close,
          confirmation: "CONFIRMED_CLOSED_CANDLE",
        });
      }
    }
  }

  if (pools.length === 0) {
    findings.push({
      code: "NO_QUALIFIED_POOLS",
      message: "No equal-high/equal-low cluster met the supplied touch-count and tolerance policy.",
    });
  }
  if (sweeps.length === 0) {
    findings.push({
      code: "NO_SWEEP_CANDIDATES",
      message: "No closed candle met the supplied wick-through and close-back sweep conditions.",
    });
  }

  return makeResult(
    input,
    findings,
    { pools, sweeps },
    "COMPLETE",
    "READY",
  );
}
