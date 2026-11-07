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
import type { IntermarketResult } from "./intermarket";

export const EVIDENCE_PIPELINE_VERSION = "0.1.1" as const;
export type EvidencePipelineInput = {
  base: BrainEvidenceInput;
  structure: StructureResult;
  priceAction: PriceActionContextResult;
  multiTimeframe: MultiTimeframeResult;
  zones: ZoneResult;
  liquidityObjectives: LiquidityObjectivesResult;
  eventContext: EventContextResult;
  propFirm: PropRuleResult;
  intermarket: IntermarketResult;
};
const statusFromModule = (status: string): EvidenceStatus =>
  status === "INVALID" || status === "INVALID_DATA" ? "FAIL" :
  status === "INSUFFICIENT_DATA" || status === "INCOMPLETE" || status === "STALE" ? "UNKNOWN" :
  status === "READY" || status === "PASS" ? "PASS" : "UNKNOWN";
const combineGates = (a: EvidenceStatus, b: EvidenceStatus): EvidenceStatus =>
  a === "FAIL" || b === "FAIL" ? "FAIL" :
  a === "UNKNOWN" || b === "UNKNOWN" ? "UNKNOWN" :
  a === "WARN" || b === "WARN" ? "WARN" : "PASS";
function identityMatches(input: EvidencePipelineInput): boolean {
  const { base, structure, priceAction, zones, liquidityObjectives, eventContext, multiTimeframe, intermarket } = input;
  return structure.instrument === base.instrument && structure.timeframe === base.timeframe &&
    priceAction.instrument === base.instrument && priceAction.timeframe === base.timeframe &&
    zones.instrument === base.instrument && zones.timeframe === base.timeframe &&
    liquidityObjectives.instrument === base.instrument && liquidityObjectives.timeframe === base.timeframe &&
    eventContext.instrument === base.instrument && multiTimeframe.instrument === base.instrument &&
    intermarket.targetInstrument === base.instrument && intermarket.timeframe === base.timeframe;
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
  const levelsGate = combineGates(input.base.evidence.levels, zonesGate);
  const liquidityGate: EvidenceStatus = !matches ? "FAIL" :
    input.liquidityObjectives.status !== "READY" ? statusFromModule(input.liquidityObjectives.status) :
    input.liquidityObjectives.bullishObjectives.length + input.liquidityObjectives.bearishObjectives.length === 0 ? "WARN" : "PASS";
  const sessionGate: EvidenceStatus = !matches ? "FAIL" :
    input.eventContext.status !== "READY" ? statusFromModule(input.eventContext.status) :
    input.eventContext.session.status === "ACTIVE" ? "PASS" :
    input.eventContext.session.status === "OUTSIDE" ? "WARN" : "UNKNOWN";
  const newsGate: EvidenceStatus = !matches ? "FAIL" :
    input.eventContext.status !== "READY" || input.eventContext.news.status === "UNKNOWN" ? "UNKNOWN" :
    input.eventContext.news.status === "RESTRICTED_WINDOW" ? "WARN" :
    input.eventContext.news.status === "CLEAR" ? "PASS" : "UNKNOWN";
  const intermarketGate: EvidenceStatus = !matches ? "FAIL" : input.intermarket.status === "READY" ? "PASS" :
    input.intermarket.status === "CONFLICTING" ? "WARN" : input.intermarket.status === "INVALID" ? "FAIL" : "UNKNOWN";
  const propChecks = Array.isArray(input.propFirm.checks) ? input.propFirm.checks : [];
  const hasPropBlock = propChecks.some(check => check.status === "BLOCK");
  const hasPropReview = propChecks.some(check => check.status === "REVIEW");
  const allPropChecksPass = propChecks.length > 0 && propChecks.every(check => check.status === "PASS");
  const riskGate: EvidenceStatus = input.propFirm.overall === "BLOCK" || hasPropBlock ? "FAIL" :
    input.propFirm.overall === "REVIEW" || hasPropReview || !allPropChecksPass ? "UNKNOWN" :
    input.propFirm.overall === "PASS" ? "PASS" : "UNKNOWN";
  const supporting = [...input.base.directionalCase.supporting];
  const opposing = [...input.base.directionalCase.opposing];
  if (matches && input.structure.status === "READY") supporting.push(`Structure module: ${input.structure.trend} trend from confirmed closed-candle evidence.`);
  if (matches && input.multiTimeframe.status === "ALIGNED") supporting.push("Multi-timeframe evidence is aligned across the supplied timeframes.");
  if (matches && input.multiTimeframe.status === "CONFLICTING") opposing.push(...input.multiTimeframe.conflicts.map(c => `Multi-timeframe conflict: ${c.timeframeA} ${c.directionA} versus ${c.timeframeB} ${c.directionB}.`));
  if (matches && input.priceAction.status === "READY") supporting.push(`Price-action context: volatility ${input.priceAction.volatility}; ATR and range computed from closed candles.`);
  if (matches && input.zones.status === "READY") supporting.push(`Zone evidence: ${input.zones.fairValueGaps.length} FVG(s), ${input.zones.orderBlocks.length} order-block candidate(s).`);
  if (matches && input.liquidityObjectives.status === "READY") supporting.push(`Liquidity map: ${input.liquidityObjectives.bullishObjectives.length} objective(s) above and ${input.liquidityObjectives.bearishObjectives.length} below current price.`);
  if (matches && input.eventContext.session.status === "OUTSIDE") opposing.push("Current time is outside all supplied verified trading-session windows.");
  if (matches && input.eventContext.news.status === "RESTRICTED_WINDOW") opposing.push(...input.eventContext.news.relevantEvents.map(e => `Scheduled ${e.impact.toLowerCase()}-impact event ${e.title} is inside the configured restriction window.`));
  if (matches && input.intermarket.status === "READY") supporting.push(`Intermarket evidence: ${input.intermarket.comparatorInstrument} correlation ${input.intermarket.correlation?.toFixed(3)} (${input.intermarket.relationship}), ${input.intermarket.matchedSamples} aligned samples.`);
  if (matches && input.intermarket.status === "CONFLICTING") opposing.push(`Intermarket relationship with ${input.intermarket.comparatorInstrument} conflicts with the pre-registered expectation.`);
  const rejectionReasons = [...(input.base.rejectionReasons ?? [])];
  if (!matches) rejectionReasons.push("One or more evidence modules do not match the requested instrument/timeframe identity.");
  return evaluateBrain({
    ...input.base,
    evidence: {
      ...input.base.evidence,
      structure: structureGate,
      levels: levelsGate,
      liquidity: liquidityGate,
      volatility: volatilityGate,
      session: sessionGate,
      news: newsGate,
      intermarket: intermarketGate,
      risk: riskGate
    },
    directionalCase: { ...input.base.directionalCase, supporting, opposing },
    rejectionReasons
  });
}
