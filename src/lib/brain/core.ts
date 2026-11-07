/**
 * Deterministic Trading Brain decision core.
 * Evaluates supplied, timestamped evidence only; never invents market facts.
 */
export const BRAIN_ENGINE_VERSION = "0.1.0" as const;
export type BrainState = "CONFIRMED_SIGNAL" | "CONDITIONAL_SIGNAL" | "WATCHLIST_NO_TRADE" | "NEEDS_MANUAL_REVIEW" | "REJECTED";
export type Direction = "BUY" | "SELL";
export type EvidenceStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";
export type BrainEvidenceInput = {
  assessmentId: string; instrument: string; timeframe: string; evaluatedAtUtc: string;
  scanner?: { packetComplete: boolean; instrument: string | null; timeframe: string | null; contextOnlyNotSignal: true };
  market: { status: "VERIFIED" | "PARTIAL" | "UNAVAILABLE" | "MISMATCH"; provider: string | null; symbol: string | null; timeframe: string | null; tickTimeUtc: string | null; maxTickAgeMs: number; providerAgreement: EvidenceStatus; candleHistoryComplete: boolean; timestampsAligned: boolean };
  evidence: { structure: EvidenceStatus; liquidity: EvidenceStatus; levels: EvidenceStatus; volatility: EvidenceStatus; session: EvidenceStatus; news: EvidenceStatus; intermarket: EvidenceStatus; risk: EvidenceStatus };
  directionalCase: { direction: Direction | null; supporting: string[]; opposing: string[]; invalidation: string | null; analyticalConfidence: number | null };
  dataConfidence: number; conditionalReasons?: string[]; rejectionReasons?: string[]; expiresAtUtc?: string | null;
};
export type BrainDecision = {
  engineVersion: typeof BRAIN_ENGINE_VERSION; assessmentId: string; instrument: string; timeframe: string;
  evaluatedAtUtc: string; expiresAtUtc: string | null; state: BrainState; direction: Direction | null;
  dataConfidence: number; analyticalConfidence: number | null; marketDataStatus: BrainEvidenceInput["market"]["status"];
  gates: Array<{ name: string; status: EvidenceStatus; reason: string }>;
  supportingEvidence: string[]; opposingEvidence: string[]; reasons: string[];
  scannerUsedAsContextOnly: boolean; manualExecutionOnly: true; orderSubmissionAvailable: false;
};
const validConfidence = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const parsedTime = (v: string | null): number | null => { if (!v) return null; const n = Date.parse(v); return Number.isFinite(n) ? n : null; };

/** No screenshot or visual pattern can independently create a signal. */
export function evaluateBrain(input: BrainEvidenceInput): BrainDecision {
  const reasons: string[] = [];
  const now = parsedTime(input.evaluatedAtUtc), tick = parsedTime(input.market.tickTimeUtc);
  const age = now !== null && tick !== null ? now - tick : null;
  const identityMatches = input.market.symbol === input.instrument && input.market.timeframe === input.timeframe;
  const freshTick = age !== null && age >= 0 && age <= input.market.maxTickAgeMs;
  const scannerMatches = !input.scanner || (input.scanner.packetComplete && input.scanner.instrument === input.instrument && input.scanner.timeframe === input.timeframe && input.scanner.contextOnlyNotSignal);
  const criticalMarketValid = input.market.status === "VERIFIED" && identityMatches && freshTick && input.market.providerAgreement === "PASS" && input.market.candleHistoryComplete && input.market.timestampsAligned;
  if (!input.assessmentId || !input.instrument || !input.timeframe || now === null) reasons.push("Required assessment identity or UTC evaluation time is invalid.");
  if (!validConfidence(input.dataConfidence)) reasons.push("Data confidence is missing or outside 0–1.");
  if (!validConfidence(input.directionalCase.analyticalConfidence)) reasons.push("Analytical confidence is unavailable or invalid.");
  if (!identityMatches) reasons.push("Live market instrument or timeframe does not match the requested analysis.");
  if (age === null) reasons.push("A parseable live tick timestamp is required.");
  else if (age < 0) reasons.push("Live tick timestamp is in the future relative to evaluation time.");
  else if (!freshTick) reasons.push("Live tick is stale for the configured freshness limit.");
  if (input.market.status !== "VERIFIED") reasons.push("Live market data is not verified.");
  if (input.market.providerAgreement !== "PASS") reasons.push("Market-data provider agreement is not confirmed.");
  if (!input.market.candleHistoryComplete) reasons.push("Required candle history is incomplete.");
  if (!input.market.timestampsAligned) reasons.push("Market-data timestamps are not aligned.");
  if (!scannerMatches) reasons.push("Scanner context is incomplete or does not match; it cannot substitute for live data.");
  const gates = (Object.entries(input.evidence) as Array<[keyof BrainEvidenceInput["evidence"], EvidenceStatus]>).map(([name,status]) => ({ name,status,reason: status === "PASS" ? "Evidence gate passed." : status === "WARN" ? "Evidence is provisional or needs qualification." : status === "FAIL" ? "Evidence gate failed." : "Evidence has not been verified." }));
  const hardInvalid = (input.rejectionReasons?.length ?? 0) > 0 || Object.values(input.evidence).includes("FAIL");
  const unresolved = reasons.length > 0 || !criticalMarketValid || !validConfidence(input.dataConfidence) || input.dataConfidence < 0.8 || !scannerMatches;
  const evidenceWarnings = Object.values(input.evidence).includes("WARN");
  const allPass = Object.values(input.evidence).every((v) => v === "PASS");
  const hasCase = input.directionalCase.direction !== null && input.directionalCase.supporting.length > 0 && Boolean(input.directionalCase.invalidation);
  const hasOpposing = input.directionalCase.opposing.length > 0;
  let state: BrainState, direction: Direction | null = null;
  if (hardInvalid) { state = "REJECTED"; reasons.push(...(input.rejectionReasons ?? [])); if (Object.values(input.evidence).includes("FAIL")) reasons.push("At least one required analytical or risk gate failed."); }
  else if (unresolved) state = "NEEDS_MANUAL_REVIEW";
  else if (!hasCase || !hasOpposing || !allPass || evidenceWarnings || !validConfidence(input.directionalCase.analyticalConfidence) || input.directionalCase.analyticalConfidence < 0.75) {
    state = "WATCHLIST_NO_TRADE";
    if (!hasCase) reasons.push("No complete directional case with supporting evidence and invalidation is available.");
    if (!hasOpposing) reasons.push("Opposing evidence has not been documented.");
    if (!allPass) reasons.push("Not all analytical and risk gates have passed.");
    if (!validConfidence(input.directionalCase.analyticalConfidence) || input.directionalCase.analyticalConfidence < 0.75) reasons.push("Analytical confidence is below the confirmation threshold.");
  } else if ((input.conditionalReasons?.length ?? 0) > 0) { state = "CONDITIONAL_SIGNAL"; direction = input.directionalCase.direction; reasons.push(...(input.conditionalReasons ?? [])); }
  else { state = "CONFIRMED_SIGNAL"; direction = input.directionalCase.direction; reasons.push("All supplied live-data, evidence, and risk gates passed."); }
  if (state === "REJECTED" || state === "NEEDS_MANUAL_REVIEW" || state === "WATCHLIST_NO_TRADE") direction = null;
  if (input.scanner) reasons.push("Scanner screenshot is context only and was not treated as a signal or live-data source.");
  return { engineVersion:BRAIN_ENGINE_VERSION,assessmentId:input.assessmentId,instrument:input.instrument,timeframe:input.timeframe,evaluatedAtUtc:input.evaluatedAtUtc,expiresAtUtc:input.expiresAtUtc ?? null,state,direction,dataConfidence:validConfidence(input.dataConfidence)?input.dataConfidence:0,analyticalConfidence:validConfidence(input.directionalCase.analyticalConfidence)?input.directionalCase.analyticalConfidence:null,marketDataStatus:input.market.status,gates,supportingEvidence:[...input.directionalCase.supporting],opposingEvidence:[...input.directionalCase.opposing],reasons:[...new Set(reasons)],scannerUsedAsContextOnly:Boolean(input.scanner),manualExecutionOnly:true,orderSubmissionAvailable:false };
}
