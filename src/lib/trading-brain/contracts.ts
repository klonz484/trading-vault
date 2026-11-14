/**
 * Trading Brain domain contracts.
 *
 * These are transport/domain types only. They do not connect to a broker,
 * fetch market data, persist records, or execute trades.
 */

export type EvidenceState = "provisional" | "confirmed" | "invalidated" | "unavailable";
export type EvidenceRole = "supporting" | "contrary" | "contextual";
export type Direction = "bullish" | "bearish" | "neutral";
export type WorkflowType = "current_market" | "upcoming_session";
export type BrainScope = "shared_core" | "private_trader";

export interface EvidenceReference {
  evidenceId: string;
  sourceEngine: string;
  sourceRecordId: string;
  sourceSchemaVersion: string;
  instrument: string;
  timeframe: string;
  observedAt: string;
  detectedAt: string;
  confirmedAt?: string;
  state: EvidenceState;
  role: EvidenceRole;
  direction: Direction;
  sourceSnapshotIds: string[];
  lineageIds: string[];
  quality: "valid" | "degraded" | "stale" | "rejected";
  explanation?: string;
}

export interface EvidenceBundle {
  bundleId: string;
  bundleVersion: string;
  workflow: WorkflowType;
  instrument: string;
  createdAt: string;
  evidence: EvidenceReference[];
  sourceSnapshotIds: string[];
  contentHash?: string;
}

export interface Hypothesis {
  hypothesisId: string;
  direction: Direction;
  kind: "continuation" | "reversal" | "range" | "no_setup" | "insufficient_data";
  state: "developing" | "conditional" | "confirmed" | "conflicted" | "invalidated" | "expired" | "unavailable";
  supportingEvidenceIds: string[];
  contraryEvidenceIds: string[];
  prerequisites: string[];
  triggerConditions: string[];
  invalidationConditions: string[];
  rationale: string;
}

export interface ReasoningReport {
  reportId: string;
  reportVersion: string;
  scope: BrainScope;
  ownerId?: string;
  workflow: WorkflowType;
  instrument: string;
  evaluatedAt: string;
  evidenceBundleId: string;
  evidenceBundleVersion: string;
  hypotheses: Hypothesis[];
  unresolvedQuestions: string[];
  dataGaps: string[];
  deterministicGateResults: Record<string, boolean>;
  engineVersion: string;
  rulesetVersion: string;
  supersedesReportId?: string;
}

export interface ScenarioCondition {
  conditionId: string;
  description: string;
  sourceEngine: string;
  sourceEventType: string;
  instrument: string;
  timeframe: string;
  candleRequirement: "forming_allowed" | "closed_only" | "confirmed_event_only";
  requiredState: "provisional" | "confirmed";
  comparator?: "above" | "below" | "equal" | "crosses_above" | "crosses_below";
  threshold?: number;
}

export type ScenarioState =
  | "candidate"
  | "waiting_for_trigger"
  | "trigger_observed_provisional"
  | "confirmed"
  | "invalidated"
  | "expired"
  | "cancelled"
  | "suspended"
  | "superseded";

export interface TradingScenario {
  scenarioId: string;
  scenarioVersion: string;
  scope: BrainScope;
  ownerId?: string;
  workflow: WorkflowType;
  instrument: string;
  timeframe: string;
  state: ScenarioState;
  triggerConditions: ScenarioCondition[];
  confirmationConditions: ScenarioCondition[];
  invalidationConditions: ScenarioCondition[];
  createdAt: string;
  expiresAt?: string;
  evidenceBundleId: string;
}

export interface ExperimentDefinition {
  experimentId: string;
  version: string;
  scope: BrainScope;
  ownerId?: string;
  hypothesis: string;
  baselineVersion: string;
  candidateVersion: string;
  protocolVersion: string;
  datasetVersions: string[];
  primaryMetric: string;
  guardrails: string[];
  state: "proposed" | "designed" | "approved_for_research" | "running" | "completed" | "inconclusive" | "rejected" | "recommended" | "approved_for_release" | "released" | "rolled_back";
  requiresOwnerApprovalForRelease: boolean;
}

export interface ManualExecutionBoundary {
  executionMode: "manual_only";
  brokerOrderPlacementEnabled: false;
  automatedExecutionEnabled: false;
}
