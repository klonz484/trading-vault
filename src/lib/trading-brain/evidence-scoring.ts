import type {
  Direction,
  EvidenceBundle,
  EvidenceReference,
} from "./contracts";
import { validateEvidenceBundle } from "./validation";

export type EvidenceStrength = "none" | "weak" | "moderate" | "strong";

export interface EvidenceScore {
  valid: boolean;
  instrument: string;
  bullishWeight: number;
  bearishWeight: number;
  totalDirectionalWeight: number;
  balance: number;
  dominantDirection: Direction;
  strength: EvidenceStrength;
  countedEvidenceIds: string[];
  ignoredEvidenceIds: string[];
  contextualEvidenceCount: number;
  provisionalEvidenceCount: number;
  issues: Array<{ code: string; message: string; evidenceId?: string }>;
}

const PROVISIONAL_WEIGHT = 0.25;
const DEGRADED_WEIGHT = 0.5;
const STRONG_THRESHOLD = 70;
const MODERATE_THRESHOLD = 40;

/**
 * Deterministic evidence aggregation, not a trade signal or probability.
 *
 * Confirmed, valid evidence receives full weight. Provisional evidence is
 * discounted and can never outweigh an otherwise equal confirmed event.
 * Degraded evidence is discounted again. Stale, rejected, invalidated,
 * unavailable, neutral, and contextual evidence cannot add directional weight.
 */
function directionalWeight(record: EvidenceReference): number {
  if (record.state === "invalidated" || record.state === "unavailable") return 0;
  if (record.quality === "stale" || record.quality === "rejected") return 0;

  const stateWeight = record.state === "confirmed" ? 1 : PROVISIONAL_WEIGHT;
  const qualityWeight = record.quality === "degraded" ? DEGRADED_WEIGHT : 1;
  return stateWeight * qualityWeight;
}

function opposite(direction: Direction): Direction {
  if (direction === "bullish") return "bearish";
  if (direction === "bearish") return "bullish";
  return "neutral";
}

function getStrength(balance: number, total: number): EvidenceStrength {
  if (total === 0 || balance === 0) return "none";
  if (balance >= STRONG_THRESHOLD) return "strong";
  if (balance >= MODERATE_THRESHOLD) return "moderate";
  return "weak";
}

/**
 * Scores one already assembled evidence bundle. Invalid bundles fail closed:
 * no directional score is produced from malformed or duplicate evidence.
 */
export function scoreEvidenceBundle(bundle: EvidenceBundle): EvidenceScore {
  const validation = validateEvidenceBundle(bundle);
  const result: EvidenceScore = {
    valid: validation.valid,
    instrument: bundle.instrument,
    bullishWeight: 0,
    bearishWeight: 0,
    totalDirectionalWeight: 0,
    balance: 0,
    dominantDirection: "neutral",
    strength: "none",
    countedEvidenceIds: [],
    ignoredEvidenceIds: [],
    contextualEvidenceCount: 0,
    provisionalEvidenceCount: 0,
    issues: validation.issues,
  };

  if (!validation.valid) {
    result.ignoredEvidenceIds = bundle.evidence.map((item) => item.evidenceId);
    return result;
  }

  const seen = new Set<string>();
  for (const item of bundle.evidence) {
    if (seen.has(item.evidenceId)) continue;
    seen.add(item.evidenceId);

    if (item.role === "contextual") {
      result.contextualEvidenceCount += 1;
      result.ignoredEvidenceIds.push(item.evidenceId);
      continue;
    }

    if (item.state === "provisional") result.provisionalEvidenceCount += 1;
    if (item.direction === "neutral") {
      result.ignoredEvidenceIds.push(item.evidenceId);
      continue;
    }

    const weight = directionalWeight(item);
    if (weight <= 0) {
      result.ignoredEvidenceIds.push(item.evidenceId);
      continue;
    }

    const effectiveDirection =
      item.role === "contrary" ? opposite(item.direction) : item.direction;

    if (effectiveDirection === "bullish") result.bullishWeight += weight;
    if (effectiveDirection === "bearish") result.bearishWeight += weight;
    result.countedEvidenceIds.push(item.evidenceId);
  }

  result.totalDirectionalWeight = result.bullishWeight + result.bearishWeight;
  if (result.totalDirectionalWeight > 0) {
    const difference = Math.abs(result.bullishWeight - result.bearishWeight);
    result.balance = Math.round((difference / result.totalDirectionalWeight) * 100);
    result.dominantDirection =
      result.bullishWeight > result.bearishWeight
        ? "bullish"
        : result.bearishWeight > result.bullishWeight
          ? "bearish"
          : "neutral";
    result.strength = getStrength(result.balance, result.totalDirectionalWeight);
  }

  return result;
}
