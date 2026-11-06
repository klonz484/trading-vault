import type { BrainSkillResult, SkillSourceReference } from "../types";

export type InventoryDirection = "LONG" | "SHORT";

export interface ScalpingInventoryPosition {
  id: string;
  direction: InventoryDirection;
  lots: number;
  /** Stop distance supplied by the caller, expressed in instrument ticks. */
  riskDistanceTicks: number;
  observedAt: string;
}

export interface ScalpingMicroRiskInput {
  symbol: string;
  asOf: string;
  userAuthorized: boolean;
  inventoryComplete: boolean;
  tickSize: number;
  minimumLot: number;
  lotStep: number;
  positions: ScalpingInventoryPosition[];
  /** Session loss already realized, expressed in ticks; must be zero or positive. */
  sessionLossTicks: number;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingMicroRiskPolicy {
  maximumTradeRiskTicks: number;
  maximumSessionLossTicks: number;
  maximumAbsoluteNetLots: number;
  maximumPositionAgeSeconds: number;
  requireSourceProvenance: boolean;
}

export interface ScalpingMicroRiskAssessment {
  inventoryComplete: boolean;
  positionCount: number;
  grossLots: number;
  netLots: number;
  sessionLossTicks: number;
  largestPositionRiskTicks: number | null;
  tradeRiskWithinLimit: boolean | null;
  sessionLossWithinLimit: boolean;
  netInventoryWithinLimit: boolean | null;
  status: "WITHIN_LIMITS" | "LIMIT_BREACH" | "NOT_ASSESSABLE";
  limitations: string[];
}

export interface ScalpingMicroRiskFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "NOT_AUTHORIZED"
    | "INVENTORY_INCOMPLETE"
    | "INVALID_INSTRUMENT_METADATA"
    | "INVALID_SESSION_LOSS"
    | "SOURCE_PROVENANCE_MISSING"
    | "INVALID_TIMESTAMP"
    | "STALE_POSITION"
    | "INVALID_POSITION"
    | "DUPLICATE_POSITION_ID"
    | "TRADE_RISK_LIMIT_EXCEEDED"
    | "SESSION_LOSS_LIMIT_EXCEEDED"
    | "NET_INVENTORY_LIMIT_EXCEEDED";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "scalp-micro-risk/0.1.0";

function isAligned(value: number, step: number): boolean {
  const units = value / step;
  return Number.isFinite(units) &&
    Math.abs(units - Math.round(units)) <= Number.EPSILON * Math.max(1, Math.abs(units)) * 16;
}

function result(
  input: ScalpingMicroRiskInput,
  findings: ScalpingMicroRiskFinding[],
  assessment: ScalpingMicroRiskAssessment,
  status: BrainSkillResult<ScalpingMicroRiskFinding>["status"],
  readiness: BrainSkillResult<ScalpingMicroRiskFinding>["evidenceReadiness"],
): BrainSkillResult<ScalpingMicroRiskFinding> & { assessment: ScalpingMicroRiskAssessment } {
  return {
    skillId: "scalp-micro-risk",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.status === "NOT_ASSESSABLE" ? [] : [
      `Supplied inventory: ${assessment.positionCount} positions, ${assessment.grossLots} gross lots and ${assessment.netLots} net lots.`,
      `Caller-reported realized session loss: ${assessment.sessionLossTicks} ticks.`,
    ],
    interpretations: findings.filter((finding) => finding.code.endsWith("_EXCEEDED")).map((finding) => finding.message),
    supportingEvidence: assessment.status === "WITHIN_LIMITS" ? ["All supplied values passed the explicit configured micro-risk limits."] : [],
    contraryEvidence: findings.map((finding) => finding.message),
    uncertainties: [
      "This assessment is only as complete and accurate as the user-authorized position and session records supplied.",
      "Tick-based exposure is not account-currency loss; tick value, contract currency, conversion, fees, slippage and margin are not calculated.",
      "Open-position risk uses caller-supplied stop distances and does not predict fills, gaps or realized outcomes.",
    ],
    sourceReferences: input.sourceReferences ?? [],
    limitations: assessment.limitations,
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/**
 * Read-only scalping risk and inventory assessment. It never sizes, changes,
 * closes, blocks or submits positions and never infers monetary exposure.
 */
export function assessScalpingMicroRisk(
  input: ScalpingMicroRiskInput,
  policy?: ScalpingMicroRiskPolicy,
): BrainSkillResult<ScalpingMicroRiskFinding> & { assessment: ScalpingMicroRiskAssessment } {
  const assessment: ScalpingMicroRiskAssessment = {
    inventoryComplete: input.inventoryComplete,
    positionCount: 0,
    grossLots: 0,
    netLots: 0,
    sessionLossTicks: input.sessionLossTicks,
    largestPositionRiskTicks: null,
    tradeRiskWithinLimit: null,
    sessionLossWithinLimit: false,
    netInventoryWithinLimit: null,
    status: "NOT_ASSESSABLE",
    limitations: [
      "No account balance, account-currency tick value, contract-currency conversion, margin or lot-size recommendation is calculated.",
      "Inventory and session loss are caller-supplied snapshots, not independently verified broker statements.",
      "Limit breaches generate warnings only; no circuit breaker, position reduction, lockout or order action is performed.",
    ],
  };
  const findings: ScalpingMicroRiskFinding[] = [];

  if (!policy) {
    findings.push({ code: "POLICY_MISSING", message: "An explicit micro-risk policy is required; no risk thresholds are guessed." });
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isFinite(policy.maximumTradeRiskTicks) || policy.maximumTradeRiskTicks <= 0 ||
    !Number.isFinite(policy.maximumSessionLossTicks) || policy.maximumSessionLossTicks <= 0 ||
    !Number.isFinite(policy.maximumAbsoluteNetLots) || policy.maximumAbsoluteNetLots <= 0 ||
    !Number.isFinite(policy.maximumPositionAgeSeconds) || policy.maximumPositionAgeSeconds < 0 ||
    typeof policy.requireSourceProvenance !== "boolean"
  ) {
    findings.push({ code: "INVALID_POLICY", message: "Every micro-risk threshold must be explicitly supplied and valid." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (!input.userAuthorized) {
    findings.push({ code: "NOT_AUTHORIZED", message: "User authorization is required before assessing supplied private inventory records." });
    return result(input, findings, assessment, "UNAVAILABLE", "UNAVAILABLE");
  }
  if (!input.inventoryComplete) {
    findings.push({ code: "INVENTORY_INCOMPLETE", message: "Inventory completeness is not confirmed; current net exposure cannot be assessed." });
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !input.symbol ||
    !Number.isFinite(input.tickSize) || input.tickSize <= 0 ||
    !Number.isFinite(input.minimumLot) || input.minimumLot <= 0 ||
    !Number.isFinite(input.lotStep) || input.lotStep <= 0 ||
    !isAligned(input.minimumLot, input.lotStep)
  ) {
    findings.push({ code: "INVALID_INSTRUMENT_METADATA", message: "Explicit positive tick size, minimum lot and compatible lot step are required." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (!Number.isFinite(input.sessionLossTicks) || input.sessionLossTicks < 0) {
    findings.push({ code: "INVALID_SESSION_LOSS", message: "Session loss must be supplied as a non-negative tick amount." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (policy.requireSourceProvenance && input.sourceReferences.length === 0) {
    findings.push({ code: "SOURCE_PROVENANCE_MISSING", message: "Position source provenance is required by policy." });
  }

  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf)) {
    findings.push({ code: "INVALID_TIMESTAMP", message: "The inventory evaluation timestamp is invalid." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }

  const ids = new Set<string>();
  let grossLots = 0;
  let netLots = 0;
  let largestRisk: number | null = null;
  for (const position of input.positions) {
    if (!position.id || ids.has(position.id)) {
      findings.push({ code: "DUPLICATE_POSITION_ID", message: "Every inventory position must have a unique, non-empty ID." });
      continue;
    }
    ids.add(position.id);
    const observedAt = Date.parse(position.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > asOf) {
      findings.push({ code: "INVALID_TIMESTAMP", message: `Position ${position.id} has an invalid or future timestamp.` });
      continue;
    }
    const ageSeconds = (asOf - observedAt) / 1000;
    if (ageSeconds > policy.maximumPositionAgeSeconds) {
      findings.push({ code: "STALE_POSITION", message: `Position ${position.id} is ${ageSeconds} seconds old; policy allows ${policy.maximumPositionAgeSeconds}.` });
      continue;
    }
    if (
      !["LONG", "SHORT"].includes(position.direction) ||
      !Number.isFinite(position.lots) || position.lots < input.minimumLot ||
      !isAligned(position.lots, input.lotStep) ||
      !Number.isFinite(position.riskDistanceTicks) || position.riskDistanceTicks < 0
    ) {
      findings.push({ code: "INVALID_POSITION", message: `Position ${position.id} has invalid direction, lot quantity or tick-risk distance.` });
      continue;
    }
    grossLots += position.lots;
    netLots += position.direction === "LONG" ? position.lots : -position.lots;
    largestRisk = largestRisk === null ? position.riskDistanceTicks : Math.max(largestRisk, position.riskDistanceTicks);
  }

  assessment.positionCount = ids.size;
  assessment.grossLots = grossLots;
  assessment.netLots = netLots;
  assessment.largestPositionRiskTicks = largestRisk;
  assessment.tradeRiskWithinLimit = largestRisk === null ? null : largestRisk <= policy.maximumTradeRiskTicks;
  assessment.sessionLossWithinLimit = input.sessionLossTicks <= policy.maximumSessionLossTicks;
  assessment.netInventoryWithinLimit = Math.abs(netLots) <= policy.maximumAbsoluteNetLots;

  if (assessment.tradeRiskWithinLimit === false) {
    findings.push({ code: "TRADE_RISK_LIMIT_EXCEEDED", message: `Largest supplied stop distance exceeds the configured ${policy.maximumTradeRiskTicks}-tick per-position limit.` });
  }
  if (!assessment.sessionLossWithinLimit) {
    findings.push({ code: "SESSION_LOSS_LIMIT_EXCEEDED", message: `Caller-reported session loss exceeds the configured ${policy.maximumSessionLossTicks}-tick limit.` });
  }
  if (!assessment.netInventoryWithinLimit) {
    findings.push({ code: "NET_INVENTORY_LIMIT_EXCEEDED", message: `Absolute net inventory exceeds the configured ${policy.maximumAbsoluteNetLots}-lot limit.` });
  }

  const blocking = findings.some((finding) =>
    ["SOURCE_PROVENANCE_MISSING", "INVALID_TIMESTAMP", "STALE_POSITION", "INVALID_POSITION", "DUPLICATE_POSITION_ID"].includes(finding.code)
  );
  assessment.status = blocking ? "NOT_ASSESSABLE"
    : findings.length > 0 ? "LIMIT_BREACH" : "WITHIN_LIMITS";
  if (blocking) return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  if (findings.length > 0) return result(input, findings, assessment, "COMPLETE", "DEGRADED");
  return result(input, [], assessment, "COMPLETE", "READY");
}
