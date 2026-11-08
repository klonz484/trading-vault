import type { BrainSkillResult, SkillSourceReference } from "./skills/types";
import {
  assessMarketStructure,
  type MarketStructureAssessment,
  type MarketStructureFinding,
} from "./skills/market-structure";
import type { EvidenceCandle } from "./skills/evidence-quality";

export interface HierarchicalStructureInput {
  instrument: string;
  timeframe: string;
  candles: EvidenceCandle[];
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
}

export interface HierarchicalStructurePolicy {
  /** Minimum spacing and break buffer are explicit calibration inputs, never guessed. */
  internalMinimumSwingDistanceBars: number;
  externalMinimumSwingDistanceBars: number;
  breakBuffer: number;
  equalExtremePolicy: "REJECT" | "FIRST" | "LAST";
}

export interface HierarchicalStructureAssessment {
  internal: MarketStructureAssessment;
  external: MarketStructureAssessment;
  primaryBias: MarketStructureAssessment["bias"];
  internalChallenge: "NONE" | "BULLISH_AGAINST_EXTERNAL" | "BEARISH_AGAINST_EXTERNAL";
  conflict: boolean;
}

/**
 * Runs the approved 2-left/2-right internal and 5-left/5-right external
 * structure windows independently. External structure remains primary;
 * internal challenges are reported, never silently promoted to reversal.
 */
export function assessHierarchicalMarketStructure(
  input: HierarchicalStructureInput,
  policy?: HierarchicalStructurePolicy,
): BrainSkillResult<MarketStructureFinding> & { assessment: HierarchicalStructureAssessment } {
  const empty: HierarchicalStructureAssessment = {
    internal: { bias: "RANGE_OR_UNCLEAR", swings: [], latestBreak: null },
    external: { bias: "RANGE_OR_UNCLEAR", swings: [], latestBreak: null },
    primaryBias: "RANGE_OR_UNCLEAR",
    internalChallenge: "NONE",
    conflict: false,
  };

  if (!policy ||
      !Number.isInteger(policy.internalMinimumSwingDistanceBars) || policy.internalMinimumSwingDistanceBars < 1 ||
      !Number.isInteger(policy.externalMinimumSwingDistanceBars) || policy.externalMinimumSwingDistanceBars < 1 ||
      !Number.isFinite(policy.breakBuffer) || policy.breakBuffer < 0 ||
      !["REJECT", "FIRST", "LAST"].includes(policy.equalExtremePolicy)) {
    return {
      skillId: "hierarchical-market-structure",
      skillVersion: "0.1.0",
      status: "INCOMPLETE",
      evidenceReadiness: "INCOMPLETE",
      findings: [{ code: "POLICY_MISSING", message: "Explicit swing spacing, break buffer and equal-extreme policy are required." }],
      observations: [],
      interpretations: [],
      supportingEvidence: [],
      contraryEvidence: [],
      uncertainties: ["Structure calibration is incomplete."],
      sourceReferences: input.sourceReferences,
      limitations: ["No default ATR, swing spacing or break-buffer thresholds are assumed."],
      ruleSetVersion: "hierarchical-market-structure/0.1.0",
      assessment: empty,
    };
  }

  const internalResult = assessMarketStructure(input, {
    leftBars: 2,
    rightBars: 2,
    minimumSwingDistanceBars: policy.internalMinimumSwingDistanceBars,
    breakBuffer: policy.breakBuffer,
    equalExtremePolicy: policy.equalExtremePolicy,
    requireClosedCandleForConfirmation: true,
  });
  const externalResult = assessMarketStructure(input, {
    leftBars: 5,
    rightBars: 5,
    minimumSwingDistanceBars: policy.externalMinimumSwingDistanceBars,
    breakBuffer: policy.breakBuffer,
    equalExtremePolicy: policy.equalExtremePolicy,
    requireClosedCandleForConfirmation: true,
  });

  const internal = internalResult.assessment;
  const external = externalResult.assessment;
  const internalDirectional = internal.bias !== "RANGE_OR_UNCLEAR";
  const externalDirectional = external.bias !== "RANGE_OR_UNCLEAR";
  const conflict = internalDirectional && externalDirectional && internal.bias !== external.bias;
  const internalChallenge = conflict
    ? internal.bias === "BULLISH" ? "BULLISH_AGAINST_EXTERNAL" : "BEARISH_AGAINST_EXTERNAL"
    : "NONE";
  const primaryBias = external.bias;
  const status = internalResult.status === "COMPLETE" && externalResult.status === "COMPLETE"
    ? "COMPLETE" : "INCOMPLETE";
  const readiness = internalResult.evidenceReadiness === "READY" && externalResult.evidenceReadiness === "READY"
    ? "READY" : "INCOMPLETE";
  const findings = [...internalResult.findings, ...externalResult.findings];
  if (conflict) findings.push({
    code: "AMBIGUOUS_SWING",
    message: "Internal and external structure disagree. External structure remains primary; internal direction is only a challenge.",
  });

  return {
    skillId: "hierarchical-market-structure",
    skillVersion: "0.1.0",
    status,
    evidenceReadiness: readiness,
    findings,
    observations: [
      `Internal 2/2 structure bias: ${internal.bias}.`,
      `External 5/5 structure bias: ${external.bias}.`,
    ],
    interpretations: conflict
      ? ["An internal structure challenge conflicts with external structure; no external trend reversal is inferred."]
      : ["Internal and external structure are retained as separate states."],
    supportingEvidence: [
      ...internalResult.supportingEvidence,
      ...externalResult.supportingEvidence,
    ],
    contraryEvidence: conflict ? ["Internal structure direction conflicts with the external primary state."] : [],
    uncertainties: [
      ...internalResult.uncertainties,
      ...externalResult.uncertainties,
      "This module does not certify BOS, CHoCH, MSS, displacement or a trade setup.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: [
      "External structure is primary; internal structure cannot independently reverse it.",
      "The approved 2/2 and 5/5 closed-candle swing windows are applied independently.",
      "Swing spacing and break buffer remain explicit calibration inputs.",
      "This result is not a BUY/SELL decision or signal activation.",
    ],
    ruleSetVersion: "hierarchical-market-structure/0.1.0",
    assessment: { internal, external, primaryBias, internalChallenge, conflict },
  };
}
