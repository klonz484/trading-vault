import {
  TRADING_BRAIN_CONTRACT_VERSION,
  type CollaborativeDecision,
  type IndependentAssessment,
  type ScannerBrainRequest,
} from "./contract";

function finitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validatedPlan(assessment: IndependentAssessment): boolean {
  const plan = assessment.tradePlan;
  if (assessment.decision === "NO_TRADE" || assessment.decision === "INSUFFICIENT_EVIDENCE") {
    return plan.orderType === "NONE" && plan.entryType === "none";
  }
  if (plan.orderType === "NONE" || !finitePositive(plan.stopLoss) || !finitePositive(plan.takeProfit1)) {
    return false;
  }
  const low = plan.entryType === "range" ? plan.entryLow : plan.entry;
  const high = plan.entryType === "range" ? plan.entryHigh : plan.entry;
  if (!finitePositive(low) || !finitePositive(high) || low > high) return false;
  if (plan.entryType === "conditional_close" && plan.orderType !== "PENDING") return false;
  return assessment.decision === "BUY"
    ? plan.stopLoss < low && plan.takeProfit1 > high
    : plan.stopLoss > high && plan.takeProfit1 < low;
}

function plansMatch(a: IndependentAssessment, b: IndependentAssessment): boolean {
  const left = a.tradePlan;
  const right = b.tradePlan;
  return left.orderType === right.orderType &&
    left.entryType === right.entryType &&
    left.entry === right.entry &&
    left.entryLow === right.entryLow &&
    left.entryHigh === right.entryHigh &&
    left.stopLoss === right.stopLoss &&
    left.takeProfit1 === right.takeProfit1 &&
    left.invalidation === right.invalidation;
}

/**
 * Conservative first-pass resolver. It never averages plans or lets one system
 * silently overrule the other. A directional decision requires two complete,
 * matching assessments, identical plan levels and READY market-data evidence.
 */
export function resolveCollaborativeDecision(
  request: ScannerBrainRequest,
): CollaborativeDecision {
  const conflicts: string[] = [];
  const limitations = [...request.limitations];

  if (request.contractVersion !== TRADING_BRAIN_CONTRACT_VERSION) {
    conflicts.push("Unsupported Scanner–Brain contract version.");
  }
  if (request.scanner.system !== "SCANNER" || request.brain.system !== "BRAIN") {
    conflicts.push("Assessment system identities do not match their contract positions.");
  }

  const scannerComplete = request.scanner.status === "COMPLETE";
  const brainComplete = request.brain.status === "COMPLETE";
  const bothComplete = scannerComplete && brainComplete;
  let agreementState: CollaborativeDecision["agreementState"] = "INSUFFICIENT_EVIDENCE";
  let rationale = "The collaborative decision is NO TRADE because the required independent evidence is incomplete.";
  let decision: CollaborativeDecision["decision"] = "NO_TRADE";
  let decisionStatus: CollaborativeDecision["decisionStatus"] = "DEGRADED";

  if (conflicts.length > 0) {
    rationale = "The collaborative decision is NO TRADE because contract validation failed.";
  } else if (!scannerComplete && brainComplete) agreementState = "BRAIN_ONLY";
  else if (scannerComplete && !brainComplete) agreementState = "SCANNER_ONLY";
  else if (bothComplete) {
    if (request.scanner.decision !== request.brain.decision) {
      agreementState = "DISAGREED";
      conflicts.push("Scanner and Brain reached different decisions.");
      rationale = "The independent systems disagree. No directional decision is approved.";
    } else if (request.scanner.decision === "NO_TRADE" || request.scanner.decision === "INSUFFICIENT_EVIDENCE") {
      agreementState = "AGREED";
      rationale = "Both independent systems agree that no trade is justified.";
      decisionStatus = "FINAL";
    } else if (!validatedPlan(request.scanner) || !validatedPlan(request.brain)) {
      agreementState = "INSUFFICIENT_EVIDENCE";
      conflicts.push("At least one independent trade plan failed structural or directional validation.");
      rationale = "A directional decision was withheld because one or both trade plans are incomplete or invalid.";
    } else if (!plansMatch(request.scanner, request.brain)) {
      agreementState = "DISAGREED";
      conflicts.push("Scanner and Brain proposed different order types or trade levels; no blended plan is permitted.");
      rationale = "Both systems selected the same direction but disagree on the actual plan. The system will not average or invent levels.";
    } else if (request.evidenceReadiness !== "READY") {
      agreementState = "INSUFFICIENT_EVIDENCE";
      conflicts.push("Market-data evidence is not READY.");
      rationale = "The systems agree on direction, but market-data readiness does not permit a collaborative trade decision.";
    } else {
      agreementState = "AGREED";
      decision = request.scanner.decision;
      decisionStatus = "FINAL";
      rationale = "Scanner and Brain independently agree on direction and identical validated plan levels, with READY market-data evidence.";
    }
  }

  if (request.evidenceReadiness !== "READY") {
    limitations.push(`Market-data readiness is ${request.evidenceReadiness}; directional approval is blocked.`);
    if (decision !== "NO_TRADE") decision = "NO_TRADE";
    decisionStatus = "DEGRADED";
    if (agreementState === "AGREED" && request.scanner.decision !== "NO_TRADE") {
      agreementState = "INSUFFICIENT_EVIDENCE";
    }
  }
  if (!bothComplete) {
    limitations.push("Both independent assessments must complete before a collaborative directional decision can be made.");
  }
  if (conflicts.length > 0 && decisionStatus !== "FINAL") {
    decision = "NO_TRADE";
  }

  return {
    contractVersion: TRADING_BRAIN_CONTRACT_VERSION,
    analysisId: request.analysisId,
    decision,
    decisionStatus,
    agreementState,
    scanner: request.scanner,
    brain: request.brain,
    conflicts,
    rationale,
    evidenceReadiness: request.evidenceReadiness,
    limitations: [...new Set(limitations)],
  };
}
