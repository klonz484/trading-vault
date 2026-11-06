import type { BrainSkillResult, SkillSourceReference } from "../types";

export interface ScalpingCostQuote {
  instrument: string;
  bid: number;
  ask: number;
  observedAt: string;
  receivedAt: string;
  sourceId: string;
  providerId: string;
}

export interface ScalpingCostBreakdown {
  /** Every amount must already be converted by the caller into the same price units as grossEdge. */
  commissionRoundTrip: number;
  feesRoundTrip: number;
  /** Explicit lower/upper expected slippage for the complete round trip, in price units. */
  slippageMinimum: number;
  slippageMaximum: number;
  conversionVerified: boolean;
  scheduleVerified: boolean;
}

export interface ScalpingCostPolicy {
  maximumQuoteAgeSeconds: number;
  minimumEdgeToCostRatio: number;
}

export interface ScalpingCostInput {
  instrument: string;
  timeframe: string;
  asOf: string;
  quote: ScalpingCostQuote;
  /** Caller-supplied gross opportunity before spread, commission, fees and slippage. */
  grossEdge: number;
  costs: ScalpingCostBreakdown;
  policy: ScalpingCostPolicy;
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingCostAssessment {
  instrument: string;
  quoteSpread: number;
  knownRoundTripCosts: number;
  totalCostMinimum: number;
  totalCostMaximum: number;
  netEdgeMinimum: number;
  netEdgeMaximum: number;
  edgeToCostRatioMinimum: number | null;
  edgeToCostRatioMaximum: number | null;
  costCoverageVerified: boolean;
  passesConfiguredCostGate: boolean;
}

export interface ScalpingCostFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "EVIDENCE_NOT_READY"
    | "SOURCE_PROVENANCE_MISSING"
    | "SOURCE_IDENTITY_MISMATCH"
    | "INVALID_TIMESTAMP"
    | "STALE_QUOTE"
    | "INVALID_QUOTE"
    | "INVALID_GROSS_EDGE"
    | "INVALID_COST_INPUT"
    | "COST_CONVERSION_UNVERIFIED"
    | "COST_SCHEDULE_UNVERIFIED"
    | "EDGE_DOES_NOT_CLEAR_COSTS";
  message: string;
}

const VERSION = "0.1.0";
const RULE_SET_VERSION = "scalping-cost-edge/0.1.0";

function timestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function result(
  input: ScalpingCostInput,
  findings: ScalpingCostFinding[],
  assessment: ScalpingCostAssessment | null,
  status: "COMPLETE" | "INCOMPLETE" | "REJECTED",
  evidenceReadiness: "READY" | "INCOMPLETE" | "STALE" | "DEGRADED",
): BrainSkillResult<ScalpingCostFinding> & { assessment: ScalpingCostAssessment | null } {
  return {
    skillId: "scalp-cost-edge",
    skillVersion: VERSION,
    status,
    evidenceReadiness,
    findings,
    observations: assessment ? [
      `Round-trip cost range: ${assessment.totalCostMinimum}–${assessment.totalCostMaximum} price units.`,
      `Net expected edge range: ${assessment.netEdgeMinimum}–${assessment.netEdgeMaximum} price units.`,
    ] : [],
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: ["Expected edge and slippage are caller-supplied estimates, not guaranteed fills or outcomes."],
    sourceReferences: input.sourceReferences ?? [],
    limitations: [
      "All costs and gross edge must already be expressed in the same price units by a verified caller-side conversion.",
      "This module does not infer executable prices, fee tiers, rebates, currency conversion, or future slippage.",
      "A passing cost gate is not a trade signal or proof of strategy profitability.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

export function assessScalpingCostEdge(input: ScalpingCostInput): ReturnType<typeof result> {
  if (!input.policy) {
    return result(input, [{ code: "POLICY_MISSING", message: "An explicit scalping cost policy is required." }], null, "INCOMPLETE", "INCOMPLETE");
  }
  if (!Number.isInteger(input.policy.maximumQuoteAgeSeconds) || input.policy.maximumQuoteAgeSeconds < 0 ||
    !Number.isFinite(input.policy.minimumEdgeToCostRatio) || input.policy.minimumEdgeToCostRatio <= 0) {
    return result(input, [{ code: "INVALID_POLICY", message: "Quote age and minimum edge-to-cost ratio must be explicit and valid." }], null, "REJECTED", "INCOMPLETE");
  }
  if (input.evidenceGate.status !== "COMPLETE" || input.evidenceGate.evidenceReadiness !== "READY") {
    return result(input, [{ code: "EVIDENCE_NOT_READY", message: "Cost analysis requires COMPLETE and READY upstream evidence." }], null, "INCOMPLETE", "INCOMPLETE");
  }
  if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length === 0) {
    return result(input, [{ code: "SOURCE_PROVENANCE_MISSING", message: "At least one source reference is required." }], null, "INCOMPLETE", "INCOMPLETE");
  }
  const asOf = timestamp(input.asOf);
  const observedAt = timestamp(input.quote.observedAt);
  const receivedAt = timestamp(input.quote.receivedAt);
  if (![asOf, observedAt, receivedAt].every(Number.isFinite) || observedAt > asOf || receivedAt > asOf) {
    return result(input, [{ code: "INVALID_TIMESTAMP", message: "Evaluation and quote timestamps must be absolute, valid and not in the future." }], null, "REJECTED", "INCOMPLETE");
  }
  if (input.quote.instrument !== input.instrument || !input.quote.sourceId || !input.quote.providerId ||
    input.sourceReferences.some((source) => source.instrument !== input.instrument ||
      source.timeframe !== input.timeframe || !source.sourceId || !source.providerId ||
      !Number.isFinite(timestamp(source.observedAt)) || !Number.isFinite(timestamp(source.receivedAt)))) {
    return result(input, [{ code: "SOURCE_IDENTITY_MISMATCH", message: "Quote and source references must match the requested instrument/timeframe and identify their providers." }], null, "REJECTED", "INCOMPLETE");
  }
  if ((asOf - observedAt) / 1000 > input.policy.maximumQuoteAgeSeconds ||
    (asOf - receivedAt) / 1000 > input.policy.maximumQuoteAgeSeconds) {
    return result(input, [{ code: "STALE_QUOTE", message: "Quote observation or receipt exceeds the configured maximum age." }], null, "INCOMPLETE", "STALE");
  }
  if (![input.quote.bid, input.quote.ask].every((value) => Number.isFinite(value) && value > 0) || input.quote.ask < input.quote.bid) {
    return result(input, [{ code: "INVALID_QUOTE", message: "Bid and ask must be positive and ask must not be below bid." }], null, "REJECTED", "INCOMPLETE");
  }
  if (!Number.isFinite(input.grossEdge) || input.grossEdge <= 0) {
    return result(input, [{ code: "INVALID_GROSS_EDGE", message: "Gross edge must be a positive, explicitly supplied amount in price units." }], null, "REJECTED", "INCOMPLETE");
  }
  const costs = input.costs;
  if (!costs || ![
    costs.commissionRoundTrip, costs.feesRoundTrip, costs.slippageMinimum, costs.slippageMaximum,
  ].every((value) => Number.isFinite(value) && value >= 0) || costs.slippageMaximum < costs.slippageMinimum) {
    return result(input, [{ code: "INVALID_COST_INPUT", message: "Round-trip costs must be non-negative and slippage maximum cannot be below minimum." }], null, "REJECTED", "INCOMPLETE");
  }
  if (!costs.conversionVerified) {
    return result(input, [{ code: "COST_CONVERSION_UNVERIFIED", message: "Every cost must be converted into the gross-edge price units using a verified conversion." }], null, "INCOMPLETE", "DEGRADED");
  }
  if (!costs.scheduleVerified) {
    return result(input, [{ code: "COST_SCHEDULE_UNVERIFIED", message: "Commission and fee schedules must be verified for this account/instrument." }], null, "INCOMPLETE", "DEGRADED");
  }

  const spread = input.quote.ask - input.quote.bid;
  const knownRoundTripCosts = spread + costs.commissionRoundTrip + costs.feesRoundTrip;
  const totalCostMinimum = knownRoundTripCosts + costs.slippageMinimum;
  const totalCostMaximum = knownRoundTripCosts + costs.slippageMaximum;
  const netEdgeMinimum = input.grossEdge - totalCostMaximum;
  const netEdgeMaximum = input.grossEdge - totalCostMinimum;
  const edgeToCostRatioMinimum = totalCostMaximum > 0 ? input.grossEdge / totalCostMaximum : null;
  const edgeToCostRatioMaximum = totalCostMinimum > 0 ? input.grossEdge / totalCostMinimum : null;
  const passesConfiguredCostGate = netEdgeMinimum > 0 &&
    edgeToCostRatioMinimum !== null &&
    edgeToCostRatioMinimum >= input.policy.minimumEdgeToCostRatio;
  const assessment: ScalpingCostAssessment = {
    instrument: input.instrument,
    quoteSpread: spread,
    knownRoundTripCosts,
    totalCostMinimum,
    totalCostMaximum,
    netEdgeMinimum,
    netEdgeMaximum,
    edgeToCostRatioMinimum,
    edgeToCostRatioMaximum,
    costCoverageVerified: true,
    passesConfiguredCostGate,
  };
  if (!passesConfiguredCostGate) {
    return result(input, [{ code: "EDGE_DOES_NOT_CLEAR_COSTS", message: "The conservative net edge or configured edge-to-cost ratio does not clear the required threshold." }], assessment, "COMPLETE", "READY");
  }
  return result(input, [], assessment, "COMPLETE", "READY");
}
