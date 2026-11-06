import { validateCandles } from "./quality";
import type {
  CandleValidation,
  EvidenceCorrection,
  MarketDataSnapshot,
} from "./types";

/** Creates an immutable correction event; storage is deliberately left to a future approved layer. */
export function createEvidenceCorrection(input: EvidenceCorrection): EvidenceCorrection {
  if (!input.correctionId.trim() || !input.reason.trim()) {
    throw new Error("Correction ID and reason are required.");
  }
  if (!input.supersedesVersion.trim() || !input.replacementVersion.trim()) {
    throw new Error("Both superseded and replacement versions are required.");
  }
  if (input.supersedesVersion === input.replacementVersion) {
    throw new Error("A correction must point to a different replacement version.");
  }
  const recordedAt = new Date(input.recordedAt);
  if (!Number.isFinite(recordedAt.getTime()) || recordedAt.toISOString() !== input.recordedAt) {
    throw new Error("Correction recordedAt must be a canonical UTC ISO timestamp.");
  }
  return Object.freeze({ ...input });
}

/** Appends without mutating history and enforces a continuous version chain. */
export function appendEvidenceCorrection(
  history: EvidenceCorrection[],
  correction: EvidenceCorrection,
): EvidenceCorrection[] {
  if (history.some((entry) => entry.correctionId === correction.correctionId)) {
    throw new Error("Correction ID already exists in this history.");
  }
  const previous = history[history.length - 1];
  if (previous && previous.replacementVersion !== correction.supersedesVersion) {
    throw new Error("Correction history version chain is discontinuous.");
  }
  return [...history, createEvidenceCorrection(correction)];
}

/**
 * Replays validation from the preserved raw observations and original validation
 * clock/threshold. Deterministic replay depends on retaining this validator version.
 */
export function replaySnapshotValidation(
  snapshot: MarketDataSnapshot,
): CandleValidation {
  return validateCandles(snapshot.rawCandles, {
    now: new Date(snapshot.validation.checkedAt),
    maxAgeSeconds: snapshot.validation.freshnessThresholdSeconds ?? undefined,
  });
}
