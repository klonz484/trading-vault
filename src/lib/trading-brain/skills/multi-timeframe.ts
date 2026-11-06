import type { BrainSkillResult, SkillSourceReference } from "./types";
import type { StructureBias } from "./market-structure";

export interface TimeframeSnapshot {
  timeframe: string;
  latestClosedCandleAt: string;
  evidenceGate: Pick<BrainSkillResult, "status" | "evidenceReadiness">;
  structureBias: StructureBias;
  sourceReferences: SkillSourceReference[];
}

export interface MultiTimeframeInput {
  instrument: string;
  requestedTimeframes: string[];
  snapshots: TimeframeSnapshot[];
  asOf: string;
}

export interface MultiTimeframePolicy {
  /** Explicit priority from highest timeframe to lowest timeframe. */
  timeframePriority: string[];
  maximumTimestampSkewSeconds: number;
  requireAllRequestedTimeframes: boolean;
}

export type MultiTimeframeAlignment =
  | "FULLY_ALIGNED"
  | "DIRECTIONAL_CONFLICT"
  | "MIXED_OR_RANGE"
  | "INCOMPLETE";

export interface MultiTimeframeAssessment {
  instrument: string;
  orderedContext: Array<{
    timeframe: string;
    priority: number;
    latestClosedCandleAt: string;
    structureBias: StructureBias;
  }>;
  alignment: MultiTimeframeAlignment;
  dominantHigherTimeframeBias: StructureBias | null;
  missingTimeframes: string[];
  timestampSkewSeconds: number | null;
}

export interface MultiTimeframeFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "REQUESTED_TIMEFRAMES_INVALID"
    | "DUPLICATE_SNAPSHOT"
    | "MISSING_TIMEFRAME"
    | "EVIDENCE_NOT_READY"
    | "INVALID_TIMESTAMP"
    | "TIMESTAMP_SKEW_EXCEEDED"
    | "SOURCE_PROVENANCE_MISSING"
    | "DIRECTIONAL_CONFLICT"
    | "MIXED_OR_RANGE_CONTEXT";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "multi-timeframe/0.1.0";

function emptyAssessment(instrument: string, missingTimeframes: string[] = []): MultiTimeframeAssessment {
  return {
    instrument,
    orderedContext: [],
    alignment: "INCOMPLETE",
    dominantHigherTimeframeBias: null,
    missingTimeframes,
    timestampSkewSeconds: null,
  };
}

function result(
  input: MultiTimeframeInput,
  findings: MultiTimeframeFinding[],
  assessment: MultiTimeframeAssessment,
  status: BrainSkillResult<MultiTimeframeFinding>["status"],
  readiness: BrainSkillResult<MultiTimeframeFinding>["evidenceReadiness"],
): BrainSkillResult<MultiTimeframeFinding> & { assessment: MultiTimeframeAssessment } {
  const references = input.snapshots.flatMap((snapshot) => snapshot.sourceReferences);
  return {
    skillId: "multi-timeframe",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.orderedContext.map((context) =>
      `${context.timeframe}: ${context.structureBias.toLowerCase()} structure as of ${context.latestClosedCandleAt}.`,
    ),
    interpretations: assessment.alignment === "FULLY_ALIGNED"
      ? ["All supplied directional timeframe assessments agree."]
      : assessment.alignment === "DIRECTIONAL_CONFLICT"
        ? ["Directional disagreement exists across timeframes; no directional conclusion is forced."]
        : [],
    supportingEvidence: assessment.orderedContext.map((context) =>
      `${context.timeframe} closed-candle structure: ${context.structureBias}.`,
    ),
    contraryEvidence: findings
      .filter((finding) => finding.code === "DIRECTIONAL_CONFLICT" || finding.code === "MIXED_OR_RANGE_CONTEXT")
      .map((finding) => finding.message),
    uncertainties: [
      "Timeframe priority is supplied by policy and is not inferred from timeframe labels.",
      "This module reconciles supplied structure assessments; it does not independently validate candle data or calculate market structure.",
    ],
    sourceReferences: references,
    limitations: [
      "Every requested timeframe must be supplied explicitly; unavailable timeframes are never fabricated from lower-timeframe data.",
      "Timestamp skew is measured only from the latest confirmed closed-candle timestamps supplied for each timeframe.",
      "Alignment is contextual evidence, not a trade signal, entry, stop, target, or confidence score.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/**
 * Reconciles independently assessed timeframe contexts using an explicit
 * priority and timestamp-skew policy. It never manufactures missing context.
 */
export function assessMultiTimeframe(
  input: MultiTimeframeInput,
  policy?: MultiTimeframePolicy,
): BrainSkillResult<MultiTimeframeFinding> & { assessment: MultiTimeframeAssessment } {
  if (
    !policy ||
    !Array.isArray(policy.timeframePriority) ||
    policy.timeframePriority.length < 1 ||
    !Number.isFinite(policy.maximumTimestampSkewSeconds) ||
    policy.maximumTimestampSkewSeconds < 0 ||
    typeof policy.requireAllRequestedTimeframes !== "boolean"
  ) {
    return result(input, [{
      code: policy ? "INVALID_POLICY" : "POLICY_MISSING",
      message: "An explicit timeframe priority, timestamp-skew limit and missing-timeframe policy are required.",
    }], emptyAssessment(input.instrument), "INCOMPLETE", "INCOMPLETE");
  }

  const requested = input.requestedTimeframes;
  if (
    requested.length < 1 ||
    new Set(requested).size !== requested.length ||
    policy.timeframePriority.length !== requested.length ||
    requested.some((timeframe) => !policy.timeframePriority.includes(timeframe)) ||
    policy.timeframePriority.some((timeframe) => !requested.includes(timeframe))
  ) {
    return result(input, [{
      code: "REQUESTED_TIMEFRAMES_INVALID",
      message: "Requested timeframes must be unique and exactly match the explicitly configured priority list.",
    }], emptyAssessment(input.instrument), "REJECTED", "INCOMPLETE");
  }

  const duplicateSnapshots = requested.filter((timeframe) =>
    input.snapshots.filter((snapshot) => snapshot.timeframe === timeframe).length > 1
  );
  if (duplicateSnapshots.length > 0) {
    return result(input, [{
      code: "DUPLICATE_SNAPSHOT",
      message: `More than one snapshot was supplied for: ${duplicateSnapshots.join(", ")}.`,
    }], emptyAssessment(input.instrument), "REJECTED", "INCOMPLETE");
  }

  const byTimeframe = new Map(input.snapshots.map((snapshot) => [snapshot.timeframe, snapshot]));
  const missing = requested.filter((timeframe) => !byTimeframe.has(timeframe));
  const findings: MultiTimeframeFinding[] = [];

  if (missing.length > 0) {
    findings.push({
      code: "MISSING_TIMEFRAME",
      message: `No snapshot was supplied for: ${missing.join(", ")}. Missing context is not inferred.`,
    });
    if (policy.requireAllRequestedTimeframes) {
      return result(input, findings, emptyAssessment(input.instrument, missing), "INCOMPLETE", "INCOMPLETE");
    }
  }

  const snapshots = policy.timeframePriority
    .map((timeframe) => byTimeframe.get(timeframe))
    .filter((snapshot): snapshot is TimeframeSnapshot => Boolean(snapshot));

  const notReady = snapshots.filter((snapshot) =>
    snapshot.evidenceGate.status !== "COMPLETE" ||
    snapshot.evidenceGate.evidenceReadiness !== "READY"
  );
  if (notReady.length > 0) {
    findings.push({
      code: "EVIDENCE_NOT_READY",
      message: `Evidence is not READY for: ${notReady.map((snapshot) => snapshot.timeframe).join(", ")}.`,
    });
    return result(input, findings, emptyAssessment(input.instrument, missing), "INCOMPLETE", "INCOMPLETE");
  }

  if (snapshots.some((snapshot) => snapshot.sourceReferences.length === 0)) {
    findings.push({
      code: "SOURCE_PROVENANCE_MISSING",
      message: "Every timeframe snapshot must include source provenance.",
    });
    return result(input, findings, emptyAssessment(input.instrument, missing), "INCOMPLETE", "INCOMPLETE");
  }

  const asOf = Date.parse(input.asOf);
  const parsed = snapshots.map((snapshot) => ({
    snapshot,
    timestamp: Date.parse(snapshot.latestClosedCandleAt),
  }));
  if (
    !Number.isFinite(asOf) ||
    parsed.some(({ timestamp }) => !Number.isFinite(timestamp) || timestamp > asOf)
  ) {
    findings.push({
      code: "INVALID_TIMESTAMP",
      message: "Evaluation time and latest closed-candle timestamps must be valid, and no candle may be from the future.",
    });
    return result(input, findings, emptyAssessment(input.instrument, missing), "REJECTED", "INCOMPLETE");
  }

  const times = parsed.map(({ timestamp }) => timestamp);
  const skewSeconds = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 1000 : 0;
  if (skewSeconds > policy.maximumTimestampSkewSeconds) {
    findings.push({
      code: "TIMESTAMP_SKEW_EXCEEDED",
      message: `Latest closed-candle timestamps differ by ${skewSeconds} seconds; policy allows ${policy.maximumTimestampSkewSeconds}.`,
    });
    return result(input, findings, emptyAssessment(input.instrument, missing), "INCOMPLETE", "DEGRADED");
  }

  const orderedContext = snapshots.map((snapshot, priority) => ({
    timeframe: snapshot.timeframe,
    priority,
    latestClosedCandleAt: snapshot.latestClosedCandleAt,
    structureBias: snapshot.structureBias,
  }));
  const directional = new Set(
    orderedContext
      .map((context) => context.structureBias)
      .filter((bias) => bias !== "RANGE_OR_UNCLEAR"),
  );
  const hasRange = orderedContext.some((context) => context.structureBias === "RANGE_OR_UNCLEAR");
  const alignment: MultiTimeframeAlignment =
    directional.size > 1
      ? "DIRECTIONAL_CONFLICT"
      : hasRange || directional.size === 0
        ? "MIXED_OR_RANGE"
        : missing.length > 0
          ? "INCOMPLETE"
          : "FULLY_ALIGNED";

  if (alignment === "DIRECTIONAL_CONFLICT") {
    findings.push({
      code: "DIRECTIONAL_CONFLICT",
      message: "At least two supplied timeframes have opposing directional structure; preserve the disagreement.",
    });
  } else if (alignment === "MIXED_OR_RANGE") {
    findings.push({
      code: "MIXED_OR_RANGE_CONTEXT",
      message: "At least one timeframe is range/unclear, or no timeframe has a directional structure assessment.",
    });
  }

  const higherDirectional = orderedContext.find((context) =>
    context.structureBias !== "RANGE_OR_UNCLEAR"
  )?.structureBias ?? null;

  const assessment: MultiTimeframeAssessment = {
    instrument: input.instrument,
    orderedContext,
    alignment,
    dominantHigherTimeframeBias: higherDirectional,
    missingTimeframes: missing,
    timestampSkewSeconds: skewSeconds,
  };
  const readiness = missing.length > 0 ? "DEGRADED" : "READY";
  return result(input, findings, assessment, "COMPLETE", readiness);
}
