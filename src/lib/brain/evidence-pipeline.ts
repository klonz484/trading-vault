/**
 * Evidence orchestration layer. Converts independently computed module results
 * into the Brain's existing gates while preserving conflicts and provenance.
 */
import { evaluateBrain, type BrainEvidenceInput, type BrainDecision, type EvidenceStatus } from "./core";
import type { StructureResult } from "./market-structure";
import type { PriceActionContextResult } from "./price-action-context";
import type { MultiTimeframeResult } from "./multi-timeframe";
import type { ZoneResult } from "./zone-evidence";
import type { LiquidityObjectivesResult } from "./liquidity-objectives";
import type { EventContextResult } from "./event-context";
import type { PropRuleResult } from "./prop-firm";

export const EVIDENCE_PIPELINE_VERSION = "0.1.0" as const;
export type EvidencePipelineInput = {
  base: BrainEvidenceInput;
  structure: StructureResult;
  priceAction: PriceActionContextResult;
  multiTimeframe: MultiTimeframeResult;
  zones: ZoneResult;
  liquidityObjectives: LiquidityObjectivesResult;
  eventContext: EventContextResult;
  propFirm: PropRuleResult;
};
const statusFromModule = (status: string): EvidenceStatus =>
  status === "INVALID" || status === "INVALID_DATA" ? "FAIL" :
  status === "INSUFFICIENT_DATA" || status === "INCOMPLETE" || status === "STALE" ? "UNKNOWN" : "PASS";
function identityMatches(input: EvidencePipelineInput): boolean {
  const { base, structure, priceAction, zones, liquidityObjectives, eventContext, multiTimeframe } = input;
  return structure.instrument === base.instrument && structure.timeframe === base.timeframe &&
    priceAction.instrument === base.instrument && priceAction.timeframe === base.timeframe &&
    zones.instrument === base.instrument && zones.timeframe === base.timeframe &&
    liquidityObjectives.instrument === base.instrument && liquidityObjectives.timeframe === base.timeframe &&
    eventContext.instrument === base.instrument && multiTimeframe.instrument === base.instrument;
}
export function assessBrainWithEvidence(input: EvidencePipelineInput): BrainDecision {
  const matches = identityMatches(input);
  const structureBaseGate: EvidenceStatus = !matches ? "FAIL" : statusFromModule(input.structure.status);
  const volatilityGate: EvidenceStatus = !matches ? "FAIL" :
    input.priceAction.status !== "READY" ? statusFromModule(input.priceAction.status) :
    input.priceAction.volatility === "UNDETERMINED" ? "WARN" : "PASS";
  const mtfGate: EvidenceStatus = !matches ? "FAIL" :
    input.multiTimeframe.status === "CONFLICTING" ? "WARN" :
    input.multiTimeframe.status === "ALIGNED" ? "PASS" :
    input.multiTimeframe.status === "INVALID" ? "FAIL" : "UNKNOWN";
  const structureGate: EvidenceStatus = structureBaseGate === "FAIL" || mtfGate === "FAIL" ? "FAIL" :
    structureBaseGate === "PASS" && mtfGate === "WARN" ? "WARN" :
    structureBaseGate === "PASS" && mtfGate === "UNKNOWN" ? "UNKNOWN" : structureBaseGate;
  const zonesGate: EvidenceStatus = !matches ? "FAIL" : statusFromModule(input.zones.status);
  const liquidityGate: EvidenceStatus = !matches ? "FAIL" :
    input.liquidityObjectives.status !== "READY" ? statusFromModule(input.liquidityObjectives.status) :
    input.liquidityObjectives.bullishObjectives.length + input.liquidityObjectives.bearishObjectives.length === 0 ? "WARN" : "PASS";
  const sessionGate: EvidenceStatus = !matches ? "FAIL" :
    input.eventContext.status !== "READY" ? statusFromModule(input.eventContext.status) :
    input.eventContext.session.status === "UNKNOWN" ? "UNKNOWN" : "PASS";
  const newsGate: EvidenceStatus = !matches ? "FAIL" :
    input.eventContext.status !== "READY" || input.eventContext.news.status === "UNKNOWN" ? "UNKNOWN" :
    input.eventContext.news.status === "RESTRICTED_WINDOW" ? "WARN" : "PASS";
  const riskGate: EvidenceStatus = input.propFirm.overall === "BLOCK" ? "FAIL" :
    input.propFirm.overall === "REVIEW" ? "UNKNOWN" : "PASS";
  const supporting = [...input.base.directionalCase.supporting];
  const opposing = [...input.base.directionalCase.opposing];
  if (matches && input.structure.status === "READY") supporting.push(`Structure module: ${input.structure.trend} trend from confirmed closed-candle evidence.`);
  if (matches && input.multiTimeframe.status === "ALIGNED") supporting.push("Multi-timeframe evidence is aligned across the supplied timeframes.");
  if (matches && input.multiTimeframe.status === "CONFLICTING") opposing.push(...input.multiTimeframe.conflicts.map(c => `Multi-timeframe conflict: ${c.timeframeA} ${c.directionA} versus ${c.timeframeB} ${c.directionB}.`));
  if (matches && input.priceAction.status === "READY") supporting.push(`Price-action context: volatility ${input.priceAction.volatility}; ATR and range computed from closed candles.`);
  if (matches && input.zones.status === "READY") supporting.push(`Zone evidence: ${input.zones.fairValueGaps.length} FVG(s), ${input.zones.orderBlocks.length} order-block candidate(s).`);
  if (matches && input.liquidityObjectives.status === "READY") supporting.push(`Liquidity map: ${input.liquidityObjectives.bullishObjectives.length} objective(s) above and ${input.liquidityObjectives.bearishObjectives.length} below current price.`);
  if (matches && input.eventContext.news.status === "RESTRICTED_WINDOW") opposing.push(...input.eventContext.news.relevantEvents.map(e => `Scheduled ${e.impact.toLowerCase()}-impact event ${e.title} is inside the configured restriction window.`));
  const rejectionReasons = [...(input.base.rejectionReasons ?? [])];
  if (!matches) rejectionReasons.push("One or more evidence modules do not match the requested instrument/timeframe identity.");
  return evaluateBrain({
    ...input.base,
    evidence: {
      ...input.base.evidence,
      structure: structureGate,
      liquidity: liquidityGate,
      volatility: volatilityGate,
      session: sessionGate,
      news: newsGate,
      risk: riskGate
    },
    directionalCase: { ...input.base.directionalCase, supporting, opposing },
    rejectionReasons
  });
}
