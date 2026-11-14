import type {
  EvidenceReference,
  EvidenceRole,
} from "./contracts";
import { validateEvidence, type ValidationIssue } from "./validation";

/**
 * A source-engine event has the same immutable evidence fields as the domain
 * reference. Its role is assigned by the reasoning/confluence layer, not by
 * the source engine.
 */
export type EngineEvidenceEvent = Omit<EvidenceReference, "role">;

export interface EvidenceAdaptationResult {
  valid: boolean;
  evidence: EvidenceReference;
  issues: ValidationIssue[];
}

/**
 * Adapts one engine event into the shared evidence contract.
 * It preserves the source state exactly and never promotes provisional data.
 */
export function adaptEngineEvent(
  event: EngineEvidenceEvent,
  role: EvidenceRole,
): EvidenceAdaptationResult {
  const evidence: EvidenceReference = { ...event, role };
  const issues = validateEvidence(evidence);
  return {
    valid: issues.length === 0,
    evidence,
    issues,
  };
}
