import type { BrainSkillResult, SkillSourceReference } from "../types";

export interface ScalpingQuoteObservation {
  sequence: number;
  timestamp: string;
  instrument: string;
  bid: number;
  ask: number;
}

export interface ScalpingShortTermInput {
  symbol: string;
  asOf: string;
  tickSize: number;
  sequenceComplete: boolean;
  observations: ScalpingQuoteObservation[];
  sourceReferences: SkillSourceReference[];
}

export interface ScalpingShortTermPolicy {
  minimumObservations: number;
  minimumHorizonSeconds: number;
  maximumHorizonSeconds: number;
  maximumInterObservationGapSeconds: number;
  maximumQuoteAgeSeconds: number;
  minimumNetMoveTicks: number;
  minimumDirectionalConsistency: number;
  maximumAverageSpreadTicks: number;
  requireSourceProvenance: boolean;
}

export interface ScalpingShortTermAssessment {
  candidate: "UPWARD_IMPULSE" | "DOWNWARD_IMPULSE" | "NO_CONFIGURED_PATTERN" | "NOT_ASSESSABLE";
  observationCount: number;
  horizonSeconds: number | null;
  netMoveTicks: number | null;
  directionalConsistency: number | null;
  averageSpreadTicks: number | null;
  latestQuoteAgeSeconds: number | null;
  limitations: string[];
}

export interface ScalpingShortTermFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "SEQUENCE_INCOMPLETE"
    | "INSUFFICIENT_OBSERVATIONS"
    | "SOURCE_PROVENANCE_MISSING"
    | "INVALID_TIMESTAMP"
    | "INVALID_SEQUENCE"
    | "INVALID_QUOTE"
    | "INSTRUMENT_MISMATCH"
    | "EXCESSIVE_GAP"
    | "HORIZON_OUT_OF_RANGE"
    | "STALE_QUOTE"
    | "SPREAD_TOO_WIDE";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "scalp-ultra-short-signals/0.1.0";

function result(
  input: ScalpingShortTermInput,
  findings: ScalpingShortTermFinding[],
  assessment: ScalpingShortTermAssessment,
  status: BrainSkillResult<ScalpingShortTermFinding>["status"],
  readiness: BrainSkillResult<ScalpingShortTermFinding>["evidenceReadiness"],
): BrainSkillResult<ScalpingShortTermFinding> & { assessment: ScalpingShortTermAssessment } {
  return {
    skillId: "scalp-ultra-short-signals",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.candidate === "NOT_ASSESSABLE" ? [] : [
      `Observed quote sequence: ${assessment.observationCount} observations over ${assessment.horizonSeconds} seconds.`,
      `Net mid-price movement: ${assessment.netMoveTicks} ticks; directional consistency: ${assessment.directionalConsistency}.`,
      `Average quoted spread: ${assessment.averageSpreadTicks} ticks.`,
    ],
    interpretations: assessment.candidate === "UPWARD_IMPULSE"
      ? ["The supplied sequence meets the configured upward-impulse observation rules; this is not a trade signal."]
      : assessment.candidate === "DOWNWARD_IMPULSE"
        ? ["The supplied sequence meets the configured downward-impulse observation rules; this is not a trade signal."]
        : [],
    supportingEvidence: assessment.candidate === "UPWARD_IMPULSE" || assessment.candidate === "DOWNWARD_IMPULSE"
      ? ["A complete, ordered quote sequence passed the explicit horizon, gap, freshness, spread and movement rules."]
      : [],
    contraryEvidence: findings.map((finding) => finding.message),
    uncertainties: [
      "A quote-sequence impulse is a descriptive pattern candidate, not proof of executable momentum or future direction.",
      "Bid/ask observations do not provide trade volume, aggressor side, queue position, order-book depth or consolidated spot-Forex liquidity.",
      "No future fill probability, latency advantage, slippage forecast, profitability or trade confidence is calculated.",
    ],
    sourceReferences: input.sourceReferences ?? [],
    limitations: assessment.limitations,
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Identifies a configured quote-sequence impulse; it never emits an order or trade recommendation. */
export function assessScalpingShortTermPattern(
  input: ScalpingShortTermInput,
  policy?: ScalpingShortTermPolicy,
): BrainSkillResult<ScalpingShortTermFinding> & { assessment: ScalpingShortTermAssessment } {
  const assessment: ScalpingShortTermAssessment = {
    candidate: "NOT_ASSESSABLE",
    observationCount: input.observations.length,
    horizonSeconds: null,
    netMoveTicks: null,
    directionalConsistency: null,
    averageSpreadTicks: null,
    latestQuoteAgeSeconds: null,
    limitations: [
      "This foundation recognizes only a configured bid/ask mid-price impulse; it does not infer volume delta, footprint, order-book imbalance or market regime.",
      "A single broker or venue quote stream is not a consolidated spot-Forex market view.",
      "No BUY/SELL signal, entry, stop, target, confidence, sizing or execution action is produced.",
    ],
  };
  const findings: ScalpingShortTermFinding[] = [];
  if (!policy) {
    findings.push({ code: "POLICY_MISSING", message: "An explicit short-term observation policy is required." });
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isInteger(policy.minimumObservations) || policy.minimumObservations < 2 ||
    !Number.isFinite(policy.minimumHorizonSeconds) || policy.minimumHorizonSeconds < 0 ||
    !Number.isFinite(policy.maximumHorizonSeconds) || policy.maximumHorizonSeconds <= policy.minimumHorizonSeconds ||
    !Number.isFinite(policy.maximumInterObservationGapSeconds) || policy.maximumInterObservationGapSeconds <= 0 ||
    !Number.isFinite(policy.maximumQuoteAgeSeconds) || policy.maximumQuoteAgeSeconds < 0 ||
    !Number.isFinite(policy.minimumNetMoveTicks) || policy.minimumNetMoveTicks <= 0 ||
    !Number.isFinite(policy.minimumDirectionalConsistency) || policy.minimumDirectionalConsistency < 0 || policy.minimumDirectionalConsistency > 1 ||
    !Number.isFinite(policy.maximumAverageSpreadTicks) || policy.maximumAverageSpreadTicks <= 0 ||
    typeof policy.requireSourceProvenance !== "boolean"
  ) {
    findings.push({ code: "INVALID_POLICY", message: "All sampling, horizon, freshness, movement, spread and consistency thresholds must be explicitly valid." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (!input.sequenceComplete) {
    findings.push({ code: "SEQUENCE_INCOMPLETE", message: "The caller has not confirmed sequence completeness; short-term pattern assessment is blocked." });
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }
  if (!Number.isFinite(input.tickSize) || input.tickSize <= 0 || !input.symbol) {
    findings.push({ code: "INVALID_QUOTE", message: "A symbol and positive instrument tick size are required." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  if (input.observations.length < policy.minimumObservations) {
    findings.push({ code: "INSUFFICIENT_OBSERVATIONS", message: `Received ${input.observations.length} observations; policy requires ${policy.minimumObservations}.` });
  }
  if (policy.requireSourceProvenance && input.sourceReferences.length === 0) {
    findings.push({ code: "SOURCE_PROVENANCE_MISSING", message: "Quote source provenance is required by policy." });
  }
  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf)) {
    findings.push({ code: "INVALID_TIMESTAMP", message: "The evaluation timestamp is invalid." });
    return result(input, findings, assessment, "REJECTED", "INCOMPLETE");
  }
  const refs = input.sourceReferences.filter((ref) =>
    ref.instrument === input.symbol && ref.timeframe === "tick" &&
    Number.isFinite(Date.parse(ref.observedAt)) && Number.isFinite(Date.parse(ref.receivedAt)) &&
    Date.parse(ref.observedAt) <= asOf && Date.parse(ref.receivedAt) <= asOf
  );
  if (policy.requireSourceProvenance && refs.length === 0) {
    if (!findings.some((finding) => finding.code === "SOURCE_PROVENANCE_MISSING")) {
      findings.push({ code: "SOURCE_PROVENANCE_MISSING", message: "No timestamp-valid tick source reference matches the instrument and tick timeframe." });
    }
  }

  const mids: number[] = [];
  const spreads: number[] = [];
  let previousTime: number | undefined;
  let previousSequence: number | undefined;
  let valid = true;
  for (const observation of input.observations) {
    const timestamp = Date.parse(observation.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > asOf) {
      findings.push({ code: "INVALID_TIMESTAMP", message: "An observation has an invalid or future timestamp." });
      valid = false;
      continue;
    }
    if (observation.instrument !== input.symbol) {
      findings.push({ code: "INSTRUMENT_MISMATCH", message: "An observation does not match the requested instrument." });
      valid = false;
    }
    if (previousTime !== undefined) {
      const gapSeconds = (timestamp - previousTime) / 1000;
      if (gapSeconds <= 0 || observation.sequence <= (previousSequence as number)) {
        findings.push({ code: "INVALID_SEQUENCE", message: "Observation timestamps and sequence numbers must be strictly increasing." });
        valid = false;
      } else if (gapSeconds > policy.maximumInterObservationGapSeconds) {
        findings.push({ code: "EXCESSIVE_GAP", message: `An observation gap of ${gapSeconds} seconds exceeds policy.` });
        valid = false;
      }
    }
    previousTime = timestamp;
    previousSequence = observation.sequence;
    if (
      !Number.isInteger(observation.sequence) ||
      !Number.isFinite(observation.bid) || !Number.isFinite(observation.ask) ||
      observation.bid <= 0 || observation.ask < observation.bid
    ) {
      findings.push({ code: "INVALID_QUOTE", message: "An observation has an invalid sequence number or bid/ask quote." });
      valid = false;
      continue;
    }
    mids.push((observation.bid + observation.ask) / 2);
    spreads.push((observation.ask - observation.bid) / input.tickSize);
  }
  if (!valid || mids.length !== input.observations.length || mids.length < 2) {
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }

  const firstTime = Date.parse(input.observations[0].timestamp);
  const lastTime = Date.parse(input.observations[input.observations.length - 1].timestamp);
  const horizonSeconds = (lastTime - firstTime) / 1000;
  const latestQuoteAgeSeconds = (asOf - lastTime) / 1000;
  const netMoveTicks = (mids[mids.length - 1] - mids[0]) / input.tickSize;
  const moves = mids.slice(1).map((mid, index) => mid - mids[index]);
  const directionalMoves = moves.filter((move) => move !== 0);
  const matchingMoves = directionalMoves.filter((move) => Math.sign(move) === Math.sign(netMoveTicks));
  const directionalConsistency = directionalMoves.length === 0 ? 0 : matchingMoves.length / directionalMoves.length;
  const averageSpreadTicks = spreads.reduce((sum, spread) => sum + spread, 0) / spreads.length;
  assessment.horizonSeconds = horizonSeconds;
  assessment.latestQuoteAgeSeconds = latestQuoteAgeSeconds;
  assessment.netMoveTicks = netMoveTicks;
  assessment.directionalConsistency = directionalConsistency;
  assessment.averageSpreadTicks = averageSpreadTicks;

  if (horizonSeconds < policy.minimumHorizonSeconds || horizonSeconds > policy.maximumHorizonSeconds) {
    findings.push({ code: "HORIZON_OUT_OF_RANGE", message: "Observed sequence duration is outside the configured short-term horizon." });
  }
  if (latestQuoteAgeSeconds < 0 || latestQuoteAgeSeconds > policy.maximumQuoteAgeSeconds) {
    findings.push({ code: "STALE_QUOTE", message: "The latest quote is stale under the configured policy." });
  }
  if (averageSpreadTicks > policy.maximumAverageSpreadTicks) {
    findings.push({ code: "SPREAD_TOO_WIDE", message: "Average quoted spread exceeds the configured maximum." });
  }
  if (findings.length > 0) {
    assessment.candidate = "NOT_ASSESSABLE";
    return result(input, findings, assessment, "INCOMPLETE", "INCOMPLETE");
  }

  assessment.candidate = Math.abs(netMoveTicks) >= policy.minimumNetMoveTicks &&
    directionalConsistency >= policy.minimumDirectionalConsistency
    ? netMoveTicks > 0 ? "UPWARD_IMPULSE" : "DOWNWARD_IMPULSE"
    : "NO_CONFIGURED_PATTERN";
  return result(input, [], assessment, "COMPLETE", "READY");
}
