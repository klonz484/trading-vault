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
  decision: { state: BrainDecision["state"]; direction: BrainDecision["direction"]; expiresAtUtc: string | null };
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
    { name: "prop_firm", version: input.propFirm.engineVersion, status: input.propFirm.overall, warnings: input.propFirm.checks.filter(c => c.status !== "PASS").map(c => `${c.rule}: ${c.detail}`) }
  ];
  const sourceIds = [...new Set([
    ...input.multiTimeframe.evidence.map(e => e.sourceId),
    ...input.eventContext.session.sourceIds,
    ...input.eventContext.news.relevantEvents.map(e => e.sourceId)
  ].filter(Boolean))].sort();
  return {
    traceVersion: DECISION_TRACE_VERSION,
    assessmentId: decision.assessmentId,
    evaluatedAtUtc: decision.evaluatedAtUtc,
    decision: { state: decision.state, direction: decision.direction, expiresAtUtc: decision.expiresAtUtc },
    gates: decision.gates.map(g => ({ ...g })),
    evidenceModules,
    sourceIds,
    supportingEvidence: [...decision.supportingEvidence],
    opposingEvidence: [...decision.opposingEvidence],
    reasons: [...decision.reasons],
    execution: { manualOnly: true, orderSubmissionAvailable: false }
  };
}
