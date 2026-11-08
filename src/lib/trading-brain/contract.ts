export const TRADING_BRAIN_CONTRACT_VERSION = "1.0.0" as const;

export type AssessmentSystem = "SCANNER" | "BRAIN";
export type AssessmentStatus = "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE" | "REJECTED";
export type AssessmentDecision = "BUY" | "SELL" | "NO_TRADE" | "INSUFFICIENT_EVIDENCE";
export type AssessmentOrderType = "MARKET" | "PENDING" | "NONE";
export type AgreementState =
  | "AGREED"
  | "DISAGREED"
  | "SCANNER_ONLY"
  | "BRAIN_ONLY"
  | "INSUFFICIENT_EVIDENCE";

export type EvidenceReadiness =
  | "READY"
  | "DEGRADED"
  | "STALE"
  | "INCOMPLETE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export interface AssessmentTradePlan {
  orderType: AssessmentOrderType;
  entryType: "exact" | "range" | "conditional_close" | "none";
  entry?: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  takeProfit1?: number;
  invalidation?: number;
}

export interface IndependentAssessment {
  system: AssessmentSystem;
  status: AssessmentStatus;
  decision: AssessmentDecision;
  tradePlan: AssessmentTradePlan;
  rationale: string;
  observations: string[];
  interpretations: string[];
  supportingEvidence: string[];
  contraryEvidence: string[];
  uncertainties: string[];
  methodologyVersion: string;
  modelProvenance: string;
}

export interface ScannerBrainRequest {
  contractVersion: typeof TRADING_BRAIN_CONTRACT_VERSION;
  analysisId: string;
  instrument: string;
  timeframe: string;
  createdAt: string;
  evidenceReadiness: EvidenceReadiness;
  sourceReferences: string[];
  limitations: string[];
  scanner: IndependentAssessment;
  brain: IndependentAssessment;
}

export interface CollaborativeDecision {
  contractVersion: typeof TRADING_BRAIN_CONTRACT_VERSION;
  analysisId: string;
  decision: "BUY" | "SELL" | "NO_TRADE";
  decisionStatus: "FINAL" | "DEGRADED";
  agreementState: AgreementState;
  scanner: IndependentAssessment;
  brain: IndependentAssessment;
  conflicts: string[];
  rationale: string;
  evidenceReadiness: EvidenceReadiness;
  limitations: string[];
}
