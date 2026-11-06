import type { BrainSkillResult, SkillSourceReference } from "./types";
import type { InstrumentSpecialistAssessment, InstrumentSpecification } from "./instrument-specialist";

export type TradeDirection = "BUY" | "SELL";
export type PlannedOrderType = "MARKET" | "LIMIT" | "STOP";

export interface PlannedEntry {
  type: PlannedOrderType;
  /** Exact entry uses the same value for low and high. */
  low: number;
  high: number;
}

export interface ProposedTradePlan {
  symbol: string;
  direction: TradeDirection;
  entry: PlannedEntry;
  stopLoss: number;
  takeProfits: number[];
  invalidationDescription?: string;
}

export interface RiskPlanningInput {
  plan: ProposedTradePlan;
  instrument: InstrumentSpecification;
  instrumentAssessment: InstrumentSpecialistAssessment;
  sourceReferences: SkillSourceReference[];
}

export interface RiskPlanningPolicy {
  minimumRiskReward: number;
  requireAtLeastOneTarget: boolean;
  requireSourceProvenance: boolean;
}

export interface RiskRewardTarget {
  target: number;
  rewardDistance: number;
  riskReward: number;
}

export interface RiskPlanningAssessment {
  planValid: boolean;
  symbol: string;
  direction: TradeDirection;
  entryWorstCase: number | null;
  riskDistance: number | null;
  targets: RiskRewardTarget[];
  sizing: "NOT_CALCULATED";
  limitations: string[];
}

export interface RiskPlanningFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INSTRUMENT_NOT_READY"
    | "SOURCE_PROVENANCE_MISSING"
    | "SYMBOL_MISMATCH"
    | "INVALID_PLAN"
    | "INVALID_ENTRY_RANGE"
    | "INVALID_STOP_GEOMETRY"
    | "INVALID_TARGET_SEQUENCE"
    | "TARGET_BELOW_MINIMUM_RR";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "risk-planning/0.1.0";

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function alignsToPrecision(value: number, precision: number): boolean {
  const scale = 10 ** precision;
  const scaled = value * scale;
  return Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
}

function alignsToTick(value: number, tickSize: number): boolean {
  const ticks = value / tickSize;
  return Math.abs(ticks - Math.round(ticks)) <= Number.EPSILON * Math.max(1, Math.abs(ticks)) * 8;
}

function emptyAssessment(input: RiskPlanningInput): RiskPlanningAssessment {
  return {
    planValid: false,
    symbol: input.plan.symbol,
    direction: input.plan.direction,
    entryWorstCase: null,
    riskDistance: null,
    targets: [],
    sizing: "NOT_CALCULATED",
    limitations: [
      "This assessment validates price geometry only; it does not establish that the setup has a valid market trigger or that any level is technically sound.",
      "Position size, account-currency pip/tick value, conversion, margin, commissions, swaps and slippage are not calculated.",
      "Instrument metadata and the upstream instrument assessment are caller-supplied and are not independently certified.",
      "No order is placed or transmitted to MT5 or any broker.",
    ],
  };
}

function makeResult(
  input: RiskPlanningInput,
  findings: RiskPlanningFinding[],
  assessment: RiskPlanningAssessment,
  status: BrainSkillResult<RiskPlanningFinding>["status"],
  readiness: BrainSkillResult<RiskPlanningFinding>["evidenceReadiness"],
): BrainSkillResult<RiskPlanningFinding> & { assessment: RiskPlanningAssessment } {
  return {
    skillId: "risk-planning",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.riskDistance === null
      ? []
      : [`Worst-case entry-to-stop distance: ${assessment.riskDistance} price units.`],
    interpretations: assessment.targets.map((target, index) =>
      `TP${index + 1} offers a price-distance reward/risk ratio of ${target.riskReward.toFixed(4)} before trading costs.`
    ),
    supportingEvidence: assessment.planValid
      ? ["Entry, stop and target geometry passed the explicit deterministic checks."]
      : [],
    contraryEvidence: findings.map((finding) => finding.message),
    uncertainties: [
      "A geometrically valid plan is not a trade recommendation and does not prove the entry trigger will occur.",
      "Execution prices may differ because of spread, slippage, gaps and broker execution rules.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: assessment.limitations,
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/**
 * Validates an explicitly supplied trade plan against instrument metadata.
 * It calculates price-distance R multiples only; it never invents account or
 * contract-currency inputs and never calculates lots or executes an order.
 */
export function assessRiskPlan(
  input: RiskPlanningInput,
  policy?: RiskPlanningPolicy,
): BrainSkillResult<RiskPlanningFinding> & { assessment: RiskPlanningAssessment } {
  const assessment = emptyAssessment(input);
  const findings: RiskPlanningFinding[] = [];

  if (!policy) {
    findings.push({ code: "POLICY_MISSING", message: "An explicit risk-planning policy is required." });
    return makeResult(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isFinite(policy.minimumRiskReward) ||
    policy.minimumRiskReward < 0 ||
    typeof policy.requireAtLeastOneTarget !== "boolean" ||
    typeof policy.requireSourceProvenance !== "boolean"
  ) {
    findings.push({ code: "INVALID_POLICY", message: "Risk policy values must be explicit and valid; no minimum R:R or provenance rule is guessed." });
    return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (
    !input.instrumentAssessment.metadataValid ||
    !input.instrumentAssessment.quoteValid ||
    input.instrumentAssessment.spreadWithinPolicy !== true
  ) {
    findings.push({ code: "INSTRUMENT_NOT_READY", message: "A valid instrument specification, quote and policy-compliant spread assessment are required before plan geometry is evaluated." });
    return makeResult(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }
  if (policy.requireSourceProvenance && input.sourceReferences.length === 0) {
    findings.push({ code: "SOURCE_PROVENANCE_MISSING", message: "Source provenance is required by the configured risk policy." });
  }

  const { plan, instrument } = input;
  if (plan.symbol !== instrument.symbol || input.instrumentAssessment.symbol !== instrument.symbol) {
    findings.push({ code: "SYMBOL_MISMATCH", message: "Plan, instrument metadata and instrument assessment must refer to the same symbol." });
    return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  const prices = [plan.entry.low, plan.entry.high, plan.stopLoss, ...plan.takeProfits];
  const validOrderType = ["MARKET", "LIMIT", "STOP"].includes(plan.entry.type);
  if (
    !["BUY", "SELL"].includes(plan.direction) ||
    !validOrderType ||
    prices.some((price) => !isFinitePositive(price) ||
      !alignsToPrecision(price, instrument.pricePrecision) ||
      !alignsToTick(price, instrument.tickSize)) ||
    !Array.isArray(plan.takeProfits)
  ) {
    findings.push({ code: "INVALID_PLAN", message: "The plan requires a supported direction/order type and positive entry, stop and target prices aligned to declared precision and tick size." });
    return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (plan.entry.low > plan.entry.high) {
    findings.push({ code: "INVALID_ENTRY_RANGE", message: "Entry low cannot exceed entry high." });
    return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (policy.requireAtLeastOneTarget && plan.takeProfits.length === 0) {
    findings.push({ code: "INVALID_TARGET_SEQUENCE", message: "At least one take-profit target is required by policy." });
    return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  const isBuy = plan.direction === "BUY";
  const worstCaseEntry = isBuy ? plan.entry.high : plan.entry.low;
  const stopValid = isBuy
    ? plan.stopLoss < plan.entry.low
    : plan.stopLoss > plan.entry.high;
  if (!stopValid) {
    findings.push({ code: "INVALID_STOP_GEOMETRY", message: "The stop loss must sit beyond the entire entry range on the loss side of the trade." });
    return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  let previousTarget = isBuy ? plan.entry.high : plan.entry.low;
  for (const target of plan.takeProfits) {
    const targetValid = isBuy ? target > previousTarget : target < previousTarget;
    if (!targetValid) {
      findings.push({ code: "INVALID_TARGET_SEQUENCE", message: "Take-profit targets must be beyond the entry range and progress in the profitable direction without duplicates or reversals." });
      return makeResult(input, findings, assessment, "REJECTED", "INCOMPLETE");
    }
    previousTarget = target;
  }

  const riskDistance = Math.abs(worstCaseEntry - plan.stopLoss);
  const targets = plan.takeProfits.map((target) => {
    const rewardDistance = Math.abs(target - worstCaseEntry);
    return { target, rewardDistance, riskReward: rewardDistance / riskDistance };
  });
  assessment.entryWorstCase = worstCaseEntry;
  assessment.riskDistance = riskDistance;
  assessment.targets = targets;

  for (const [index, target] of targets.entries()) {
    if (target.riskReward < policy.minimumRiskReward) {
      findings.push({
        code: "TARGET_BELOW_MINIMUM_RR",
        message: `TP${index + 1} R:R ${target.riskReward.toFixed(4)} is below the configured minimum ${policy.minimumRiskReward}.`,
      });
    }
  }

  assessment.planValid = findings.length === 0;
  if (findings.length > 0) {
    return makeResult(input, findings, assessment, "COMPLETE", "DEGRADED");
  }
  return makeResult(input, [], assessment, "COMPLETE", "READY");
}
