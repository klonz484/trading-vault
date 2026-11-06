import type { BrainSkillResult, SkillSourceReference } from "../types";

export type ScalpingStrategyType = "MOMENTUM" | "MEAN_REVERSION" | "MARKET_MAKING";
export type StrategyResearchStatus = "SUITABLE_FOR_RESEARCH" | "NOT_SUPPORTED_BY_CONTEXT" | "INSUFFICIENT_EVIDENCE" | "RESEARCH_ONLY";

export interface ScalpingStrategyCandidate {
  id: string;
  name: string;
  type: ScalpingStrategyType;
  version: string;
  compatibleRegimes: string[];
  evaluation: {
    sampleSize: number;
    outOfSample: boolean;
    netEdgeAfterCosts: number;
    maximumDrawdown: number;
    costGatePassed: boolean;
    evaluatedAt: string;
  };
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingAdaptiveStrategyInput {
  instrument: string;
  timeframe: string;
  asOf: string;
  observedRegimes: string[];
  candidates: ScalpingStrategyCandidate[];
  contextReady: boolean;
  costAssessmentReady: boolean;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingAdaptiveStrategyPolicy {
  minimumOutOfSampleTrades: number;
  minimumNetEdgeAfterCosts: number;
  maximumPermittedDrawdown: number;
  maximumEvidenceAgeSeconds: number;
  allowMarketMakingResearch: boolean;
  requireProvenance: boolean;
}

export interface ScalpingStrategyCandidateAssessment {
  id: string;
  name: string;
  type: ScalpingStrategyType;
  status: StrategyResearchStatus;
  matchedRegimes: string[];
  sampleSize: number;
  netEdgeAfterCosts: number | null;
  maximumDrawdown: number | null;
  reasons: string[];
}

export interface ScalpingAdaptiveStrategyAssessment {
  instrument: string;
  observedRegimes: string[];
  candidates: ScalpingStrategyCandidateAssessment[];
  liveStrategySwitching: false;
  selectedLiveStrategy: null;
}

export interface ScalpingAdaptiveStrategyFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INVALID_AS_OF"
    | "CONTEXT_NOT_READY"
    | "COST_ASSESSMENT_NOT_READY"
    | "CANDIDATES_MISSING"
    | "INVALID_CANDIDATE"
    | "EVIDENCE_STALE"
    | "PROVENANCE_MISSING";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "scalp-adaptive-strategy/0.1.0";

function absoluteTimestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function result(
  input: ScalpingAdaptiveStrategyInput,
  findings: ScalpingAdaptiveStrategyFinding[],
  assessment: ScalpingAdaptiveStrategyAssessment,
  status: BrainSkillResult<ScalpingAdaptiveStrategyFinding>["status"],
  readiness: BrainSkillResult<ScalpingAdaptiveStrategyFinding>["evidenceReadiness"],
): BrainSkillResult<ScalpingAdaptiveStrategyFinding> & { assessment: ScalpingAdaptiveStrategyAssessment } {
  const refs = [
    ...(Array.isArray(input.sourceReferences) ? input.sourceReferences : []),
    ...input.candidates.flatMap((candidate) => Array.isArray(candidate.sourceReferences) ? candidate.sourceReferences : []),
  ];
  return {
    skillId: "scalp-adaptive-strategy",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.candidates.map((candidate) =>
      `${candidate.name}: ${candidate.status.toLowerCase().replaceAll("_", " ")}.`
    ),
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: [
      "Candidate metrics and regime labels are caller-supplied summaries; this module does not run backtests or discover market regimes.",
      "Out-of-sample status is accepted as supplied and must be independently verified by the backtesting workflow.",
      "Past net edge and drawdown do not guarantee future performance or live fills.",
      "Candidates are assessed independently; no winner is selected and no live strategy is activated.",
    ],
    sourceReferences: refs,
    limitations: [
      "This is research suitability screening only, not a trade signal or live strategy selector.",
      "No automatic strategy switching, trade-frequency change, routing, position sizing or order execution occurs.",
      "Market-making remains research-only even when the explicit policy allows its evaluation.",
      "A cost gate must pass before any candidate can be considered suitable for further research.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Compare versioned scalping research candidates against explicit regime, cost and evaluation gates. */
export function assessScalpingStrategySuitability(
  input: ScalpingAdaptiveStrategyInput,
  policy?: ScalpingAdaptiveStrategyPolicy,
): BrainSkillResult<ScalpingAdaptiveStrategyFinding> & { assessment: ScalpingAdaptiveStrategyAssessment } {
  const empty: ScalpingAdaptiveStrategyAssessment = {
    instrument: input.instrument,
    observedRegimes: [],
    candidates: [],
    liveStrategySwitching: false,
    selectedLiveStrategy: null,
  };
  if (!policy) {
    return result(input, [{ code: "POLICY_MISSING", message: "Explicit sample, net-edge, drawdown, freshness and market-making policies are required." }], empty, "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isInteger(policy.minimumOutOfSampleTrades) || policy.minimumOutOfSampleTrades < 1 ||
    !Number.isFinite(policy.minimumNetEdgeAfterCosts) ||
    !Number.isFinite(policy.maximumPermittedDrawdown) || policy.maximumPermittedDrawdown < 0 ||
    !Number.isFinite(policy.maximumEvidenceAgeSeconds) || policy.maximumEvidenceAgeSeconds < 0 ||
    typeof policy.allowMarketMakingResearch !== "boolean" ||
    typeof policy.requireProvenance !== "boolean"
  ) {
    return result(input, [{ code: "INVALID_POLICY", message: "All research thresholds and boolean policy controls must be explicit and valid." }], empty, "REJECTED", "INCOMPLETE");
  }
  const asOf = absoluteTimestamp(input.asOf);
  if (!Number.isFinite(asOf)) {
    return result(input, [{ code: "INVALID_AS_OF", message: "Evaluation time must be an absolute timestamp with timezone." }], empty, "REJECTED", "INCOMPLETE");
  }
  if (input.contextReady !== true) {
    return result(input, [{ code: "CONTEXT_NOT_READY", message: "A complete, validated context assessment is required before comparing regime suitability." }], empty, "INCOMPLETE", "DEGRADED");
  }
  if (input.costAssessmentReady !== true) {
    return result(input, [{ code: "COST_ASSESSMENT_NOT_READY", message: "A verified cost assessment is mandatory; unknown costs block strategy suitability." }], empty, "INCOMPLETE", "DEGRADED");
  }
  if (!Array.isArray(input.observedRegimes) || input.observedRegimes.length === 0 ||
    !Array.isArray(input.candidates) || input.candidates.length === 0) {
    return result(input, [{ code: "CANDIDATES_MISSING", message: "Explicit observed regimes and at least one versioned strategy candidate are required." }], empty, "INCOMPLETE", "INCOMPLETE");
  }

  const findings: ScalpingAdaptiveStrategyFinding[] = [];
  const allRefs = [
    ...(Array.isArray(input.sourceReferences) ? input.sourceReferences : []),
    ...input.candidates.flatMap((candidate) => Array.isArray(candidate.sourceReferences) ? candidate.sourceReferences : []),
  ];
  const refsValid = allRefs.length > 0 && allRefs.every((ref) =>
    Boolean(ref.sourceId && ref.providerId && ref.instrument === input.instrument && ref.timeframe) &&
    Number.isFinite(absoluteTimestamp(ref.observedAt)) &&
    Number.isFinite(absoluteTimestamp(ref.receivedAt)) &&
    absoluteTimestamp(ref.observedAt) <= asOf && absoluteTimestamp(ref.receivedAt) <= asOf
  );
  if (policy.requireProvenance && !refsValid) {
    findings.push({ code: "PROVENANCE_MISSING", message: "Strategy and evaluation evidence must have matching instrument provenance and non-future source timestamps." });
    return result(input, findings, empty, "INCOMPLETE", "DEGRADED");
  }

  const observed = [...new Set(input.observedRegimes.map((value) => value.trim()).filter(Boolean))];
  const candidateAssessments: ScalpingStrategyCandidateAssessment[] = [];
  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    if (!candidate.id || ids.has(candidate.id) || !candidate.name || !candidate.version ||
      !["MOMENTUM", "MEAN_REVERSION", "MARKET_MAKING"].includes(candidate.type) ||
      !Array.isArray(candidate.compatibleRegimes) || candidate.compatibleRegimes.length === 0 ||
      !candidate.evaluation || !Number.isInteger(candidate.evaluation.sampleSize) || candidate.evaluation.sampleSize < 0 ||
      typeof candidate.evaluation.outOfSample !== "boolean" ||
      typeof candidate.evaluation.costGatePassed !== "boolean" ||
      !Number.isFinite(candidate.evaluation.netEdgeAfterCosts) ||
      !Number.isFinite(candidate.evaluation.maximumDrawdown) || candidate.evaluation.maximumDrawdown < 0) {
      findings.push({ code: "INVALID_CANDIDATE", message: `Strategy candidate ${candidate.id || "(unnamed)"} has invalid identity, regime or evaluation data.` });
      continue;
    }
    ids.add(candidate.id);
    const evaluatedAt = absoluteTimestamp(candidate.evaluation.evaluatedAt);
    if (!Number.isFinite(evaluatedAt) || evaluatedAt > asOf ||
      (asOf - evaluatedAt) / 1000 > policy.maximumEvidenceAgeSeconds) {
      findings.push({ code: "EVIDENCE_STALE", message: `Strategy candidate ${candidate.id} has stale or invalid evaluation evidence.` });
      candidateAssessments.push({
        id: candidate.id, name: candidate.name, type: candidate.type,
        status: "INSUFFICIENT_EVIDENCE", matchedRegimes: [], sampleSize: candidate.evaluation.sampleSize,
        netEdgeAfterCosts: candidate.evaluation.netEdgeAfterCosts,
        maximumDrawdown: candidate.evaluation.maximumDrawdown,
        reasons: ["Evaluation timestamp is invalid, future-dated or stale."],
      });
      continue;
    }
    const matchedRegimes = [...new Set(candidate.compatibleRegimes)].filter((regime) => observed.includes(regime));
    const reasons: string[] = [];
    if (!matchedRegimes.length) reasons.push("No supplied market-regime match.");
    if (candidate.evaluation.sampleSize < policy.minimumOutOfSampleTrades) reasons.push("Evaluation sample is below the explicit minimum.");
    if (!candidate.evaluation.outOfSample) reasons.push("Evaluation is not marked out-of-sample.");
    if (!candidate.evaluation.costGatePassed) reasons.push("Verified cost gate did not pass.");
    if (candidate.evaluation.netEdgeAfterCosts < policy.minimumNetEdgeAfterCosts) reasons.push("Net edge after costs is below policy.");
    if (candidate.evaluation.maximumDrawdown > policy.maximumPermittedDrawdown) reasons.push("Maximum drawdown exceeds policy.");
    if (candidate.type === "MARKET_MAKING" && !policy.allowMarketMakingResearch) reasons.push("Market-making research is not enabled by policy.");
    const suitable = reasons.length === 0;
    candidateAssessments.push({
      id: candidate.id,
      name: candidate.name,
      type: candidate.type,
      status: candidate.type === "MARKET_MAKING" && suitable ? "RESEARCH_ONLY"
        : suitable ? "SUITABLE_FOR_RESEARCH"
        : matchedRegimes.length === 0 ? "NOT_SUPPORTED_BY_CONTEXT" : "INSUFFICIENT_EVIDENCE",
      matchedRegimes,
      sampleSize: candidate.evaluation.sampleSize,
      netEdgeAfterCosts: candidate.evaluation.netEdgeAfterCosts,
      maximumDrawdown: candidate.evaluation.maximumDrawdown,
      reasons,
    });
  }

  const invalid = findings.length > 0 || candidateAssessments.length !== input.candidates.length;
  const assessment: ScalpingAdaptiveStrategyAssessment = {
    instrument: input.instrument,
    observedRegimes: observed,
    candidates: candidateAssessments,
    liveStrategySwitching: false,
    selectedLiveStrategy: null,
  };
  return result(input, findings, assessment, invalid ? "INCOMPLETE" : "COMPLETE", invalid ? "DEGRADED" : "READY");
}
