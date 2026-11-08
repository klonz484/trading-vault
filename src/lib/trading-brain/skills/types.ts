import type { BrainSkillStatus } from "./registry";

export type SkillExecutionStatus =
  | "COMPLETE"
  | "INCOMPLETE"
  | "UNAVAILABLE"
  | "REJECTED";

export type SkillEvidenceReadiness =
  | "READY"
  | "DEGRADED"
  | "STALE"
  | "INCOMPLETE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export interface SkillSourceReference {
  sourceId: string;
  providerId: string;
  observedAt: string;
  receivedAt: string;
  instrument: string;
  timeframe: string;
}

export interface BrainSkillResult<TFinding = unknown> {
  skillId: string;
  skillVersion: string;
  status: SkillExecutionStatus;
  evidenceReadiness: SkillEvidenceReadiness;
  findings: TFinding[];
  observations: string[];
  interpretations: string[];
  supportingEvidence: string[];
  contraryEvidence: string[];
  uncertainties: string[];
  sourceReferences: SkillSourceReference[];
  limitations: string[];
  ruleSetVersion: string;
}

export interface SkillLifecycleSnapshot {
  skillId: string;
  status: BrainSkillStatus;
  version: string;
  mayInfluenceCollaborativeDecision: boolean;
}
