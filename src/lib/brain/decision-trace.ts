/**
 * Stable, explainable projection of a Brain decision and the evidence modules
 * that contributed to it. This does not re-evaluate or alter the decision.
 */
import type { BrainDecision } from "./core";
import type { EvidencePipelineInput } from "./evidence-pipeline";
export const DECISION_TRACE_VERSION = "0.1.0" as const;
export type DecisionTrace = {
  traceVersion: typeof DECISION_TRACE_VERSION;
  assessmentId: string;
  evaluatedAtUtc: string;
  decision: { instrument: string; timeframe: string; state: BrainDecision["state"]; direction: BrainDecision["direction"]; expiresAtUtc: string | null };
  confidence: { data: number; analytical: number | null };
  marketData: { status: BrainDecision["marketDataStatus"]; provider: string | null; symbol: string | null; timeframe: string | null; tickTimeUtc: string | null; providerAgreement: EvidencePipelineInput["base"]["market"]["providerAgreement"]; candleHistoryComplete: boolean; timestampsAligned: boolean };
  scannerContextOnly: boolean;
  gates: BrainDecision["gates"];
  evidenceModules: Array<{ name: string; version: string; status: string; warnings: string[] }>;
  sourceIds: string[];
  supportingEvidence: string[];
  opposingEvidence: string[];
  reasons: string[];
  execution: { manualOnly: true; orderSubmissionAvailable: false };
};
export function buildDecisionTrace(decision: BrainDecision, input: EvidencePipelineInput): DecisionTrace {
  const evidenceModules = [
    { name: "market_structure", version: input.structure.engineVersion, status: input.structure.status, warnings: input.structure.warnings },
    { name: "price_action_context", version: input.priceAction.engineVersion, status: input.priceAction.status, warnings: input.priceAction.warnings },
    { name: "multi_timeframe", version: input.multiTimeframe.engineVersion, status: input.multiTimeframe.status, warnings: input.multiTimeframe.warnings },
    { name: "zone_evidence", version: input.zones.engineVersion, status: input.zones.status, warnings: input.zones.warnings },
    { name: "liquidity_objectives", version: input.liquidityObjectives.engineVersion, status: input.liquidityObjectives.status, warnings: input.liquidityObjectives.warnings },
    { name: "event_context", version: input.eventContext.engineVersion, status: input.eventContext.status, warnings: input.eventContext.warnings },
    { name: "intermarket", version: input.intermarket.engineVersion, status: input.intermarket.status, warnings: input.intermarket.warnings },
    { name: "prop_firm", version: input.propFirm.engineVersion, status: input.propFirm.overall, warnings: input.propFirm.checks.filter(c => c.status !== "PASS").map(c => `${c.rule}: ${c.detail}`) }
  ];
  const sourceIds = [...new Set([
    ...input.multiTimeframe.evidence.map(e => e.sourceId),
    ...input.intermarket.sourceIds,
    ...input.eventContext.session.sourceIds,
    ...input.eventContext.news.relevantEvents.map(e => e.sourceId)
  ].filter(Boolean))].sort();
  return {
    traceVersion: DECISION_TRACE_VERSION,
    assessmentId: decision.assessmentId,
    evaluatedAtUtc: decision.evaluatedAtUtc,
    decision: { instrument: decision.instrument, timeframe: decision.timeframe, state: decision.state, direction: decision.direction, expiresAtUtc: decision.expiresAtUtc },
    confidence: { data: decision.dataConfidence, analytical: decision.analyticalConfidence },
    marketData: {
      status: input.base.market.status,
      provider: input.base.market.provider,
      symbol: input.base.market.symbol,
      timeframe: input.base.market.timeframe,
      tickTimeUtc: input.base.market.tickTimeUtc,
      providerAgreement: input.base.market.providerAgreement,
      candleHistoryComplete: input.base.market.candleHistoryComplete,
      timestampsAligned: input.base.market.timestampsAligned
    },
    scannerContextOnly: decision.scannerUsedAsContextOnly,
    gates: decision.gates.map(g => ({ ...g })),
    evidenceModules,
    sourceIds,
    supportingEvidence: [...decision.supportingEvidence],
    opposingEvidence: [...decision.opposingEvidence],
    reasons: [...decision.reasons],
    execution: { manualOnly: true, orderSubmissionAvailable: false }
  };
}
